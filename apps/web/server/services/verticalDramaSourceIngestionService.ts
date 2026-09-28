import { isIP } from "node:net";
import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../db";
import {
  verticalDramaSourceAnalyses,
  verticalDramaSourceAssets,
  verticalDramaSourcePacks,
} from "../../drizzle/schema";
import { getSeriesProfile } from "@shared/verticalDramaSeries/seriesProfile";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import {
  executeVisionAwareJsonCallWithRetry,
  type VisionAwareImageInput,
} from "./verticalDramaStoryBible";
import { resolveVerticalDramaRecommendedDraftModel } from "./verticalDramaLlmModelPolicy";
import {
  loadSourcePack,
  type SourcePackOwner,
} from "./verticalDramaSourcePackService";
import {
  enqueueVerticalDramaInteractiveJob,
  type VerticalDramaInteractiveJobPayload,
} from "./verticalDramaInteractiveJobs";

export const sourceAnalysisResultSchema = z.object({
  subject: z.string().trim().max(240),
  observableDetails: z.array(z.string().trim().max(300)).max(12),
  likelyText: z.string().trim().max(1200),
  uncertainty: z.array(z.string().trim().max(240)).max(8),
});
export type SourceAnalysisResult = z.infer<typeof sourceAnalysisResultSchema>;

const sourceDescriptionVisionSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  observableDetails: z.array(z.string().trim().min(1).max(300)).max(12),
  uncertainty: z.array(z.string().trim().min(1).max(240)).max(8),
});

export function validateSourceReferenceUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid source URL" });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only public HTTP(S) source URLs are allowed",
    });
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Private source hosts are not allowed",
    });
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split(".").map(Number);
    const privateIp =
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254);
    if (privateIp)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Private source addresses are not allowed",
      });
  }
  if (
    ipVersion === 6 &&
    (hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd"))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Private source addresses are not allowed",
    });
  }
  return url;
}

export function buildSourceDescriptionSuggestion(params: {
  profileId: string;
  title: string;
  metadata?: Record<string, unknown>;
  currentDescription?: string | null;
}): string {
  const profile = getSeriesProfile(params.profileId);
  const metadataText = Object.entries(params.metadata ?? {})
    .filter(
      ([, value]) => typeof value === "string" || typeof value === "number"
    )
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 160)}`)
    .join("; ");
  const purpose = profile.defaultSlots.find(slot =>
    params.title.toLowerCase().includes(slot.title.toLowerCase())
  )?.description;
  return [
    `แหล่งอ้างอิง: ${params.title}`,
    purpose
      ? `จุดประสงค์ของช่อง: ${purpose}`
      : `ใช้เพื่อแสดงหลักฐาน/รายละเอียดที่เกี่ยวข้องกับ${profile.title}`,
    metadataText
      ? `ข้อมูลประกอบที่มี: ${metadataText}`
      : "ยังไม่มีข้อมูลที่ยืนยันได้จาก metadata",
    params.currentDescription?.trim()
      ? `คำอธิบายเดิมของผู้ใช้: ${params.currentDescription.trim().slice(0, 600)}`
      : "โปรดตรวจสอบรายละเอียดจากภาพหรือวิดีโอจริงก่อนยืนยัน",
    "ข้อควรระวัง: ข้อความนี้เป็นคำแนะนำจากระบบ ไม่ใช่การยืนยันข้อเท็จจริง",
  ].join("\n");
}

export async function requestSourceAnalysis(
  owner: SourcePackOwner,
  params: { packId: number; sourceAssetId: number; policyVersion?: string }
) {
  const pack = await loadSourcePack(owner, params.packId);
  const [asset] = pack.assets.filter(
    (item: { id: number }) => item.id === params.sourceAssetId
  );
  if (!asset)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source asset not found",
    });
  const policyVersion =
    params.policyVersion ??
    `${pack.profile.profileId}@${pack.profile.visualVersion}`;
  const [analysis] = await db
    .insert(verticalDramaSourceAnalyses)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      packId: params.packId,
      sourceAssetId: params.sourceAssetId,
      policyVersion,
      status: "queued",
      attemptCount: 0,
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaSourceAnalyses.tenantId,
        verticalDramaSourceAnalyses.sourceAssetId,
        verticalDramaSourceAnalyses.policyVersion,
      ],
      set: { status: "queued", errorCode: null, updatedAt: new Date() },
    })
    .returning();
  await db
    .update(verticalDramaSourceAssets)
    .set({ analysisStatus: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaSourceAssets.id, params.sourceAssetId),
        eq(verticalDramaSourceAssets.packId, params.packId),
        eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
        isNull(verticalDramaSourceAssets.deletedAt)
      )
    );
  const job = await enqueueVerticalDramaInteractiveJob({
    kind: "source_analysis",
    tenantId: owner.tenantId,
    userId: owner.userId,
    scopeKey: `source:${params.packId}:${params.sourceAssetId}`,
    skillSlug: "vertical-drama-source-visual-analysis",
    idempotencyKey: `source:${params.packId}:${params.sourceAssetId}:${policyVersion}`,
    input: { ...params, policyVersion },
  });
  return {
    analysisId: analysis.id,
    policyVersion,
    ...job,
  };
}

/** Worker-only source analysis execution. */
export async function runQueuedSourceAnalysis(
  payload: VerticalDramaInteractiveJobPayload
): Promise<unknown> {
  const params = z
    .object({
      packId: z.number().int().positive(),
      sourceAssetId: z.number().int().positive(),
      policyVersion: z.string().trim().min(1).max(64),
    })
    .parse(payload.input);
  const owner = { tenantId: payload.tenantId, userId: payload.userId };
  const analysis = await db
    .select({ id: verticalDramaSourceAnalyses.id })
    .from(verticalDramaSourceAnalyses)
    .where(
      and(
        eq(verticalDramaSourceAnalyses.tenantId, owner.tenantId),
        eq(verticalDramaSourceAnalyses.userId, owner.userId),
        eq(verticalDramaSourceAnalyses.packId, params.packId),
        eq(verticalDramaSourceAnalyses.sourceAssetId, params.sourceAssetId),
        eq(verticalDramaSourceAnalyses.policyVersion, params.policyVersion)
      )
    )
    .limit(1);
  const analysisId = analysis[0]?.id;
  if (!analysisId) throw new Error("Source analysis record not found");
  await db
    .update(verticalDramaSourceAnalyses)
    .set({
      status: "running",
      attemptCount: sql`${verticalDramaSourceAnalyses.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(verticalDramaSourceAnalyses.id, Number(analysisId)));
  try {
    const suggestion = await buildSourceDescriptionSuggestionWithVision(
      owner,
      params
    );
    await db
      .update(verticalDramaSourceAnalyses)
      .set({
        status: "succeeded",
        suggestion: suggestion.suggestion,
        evidenceJson: {
          usedVision: suggestion.usedVision,
          model: "model" in suggestion ? (suggestion.model ?? null) : null,
          creditsUsed:
            "creditsUsed" in suggestion ? (suggestion.creditsUsed ?? 0) : 0,
        },
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(verticalDramaSourceAnalyses.id, Number(analysisId)));
    await db
      .update(verticalDramaSourceAssets)
      .set({ analysisStatus: "analyzed", updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaSourceAssets.id, params.sourceAssetId),
          eq(verticalDramaSourceAssets.packId, params.packId),
          eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
          isNull(verticalDramaSourceAssets.deletedAt)
        )
      );
    return {
      analysisId,
      suggestion: suggestion.suggestion,
      usedVision: suggestion.usedVision,
    };
  } catch (error) {
    await db
      .update(verticalDramaSourceAnalyses)
      .set({
        status: "failed",
        errorCode: error instanceof Error ? error.name : "ANALYSIS_FAILED",
        updatedAt: new Date(),
      })
      .where(eq(verticalDramaSourceAnalyses.id, Number(analysisId)));
    await db
      .update(verticalDramaSourceAssets)
      .set({ analysisStatus: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaSourceAssets.id, params.sourceAssetId),
          eq(verticalDramaSourceAssets.packId, params.packId),
          eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
          isNull(verticalDramaSourceAssets.deletedAt)
        )
      );
    throw error;
  }
}

export async function buildSourceDescriptionSuggestionWithVision(
  owner: SourcePackOwner,
  params: { packId: number; sourceAssetId: number }
) {
  const pack = await loadSourcePack(owner, params.packId);
  const asset = pack.assets.find(
    (item: { id: number }) => item.id === params.sourceAssetId
  );
  if (!asset)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source asset not found",
    });
  const provenance = asset.provenanceJson ?? {};
  const mediaUrl = ["uploadedUrl", "url", "referenceUrl"]
    .map(key => provenance[key])
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    );
  if (!mediaUrl) {
    return {
      suggestion: buildSourceDescriptionSuggestion({
        profileId: pack.profile.profileId,
        title: asset.title,
        metadata: provenance,
        currentDescription: asset.description,
      }),
      usedVision: false,
    };
  }

  const model = await resolveVerticalDramaRecommendedDraftModel();
  const images: VisionAwareImageInput[] = [
    { url: mediaUrl, label: `SOURCE MEDIA: ${asset.title}` },
  ];
  const result = await executeVisionAwareJsonCallWithRetry({
    model,
    tenantId: owner.tenantId,
    userId: owner.userId,
    hasVision: true,
    images,
    systemPrompt:
      "You are a visual evidence assistant. Describe only observable details. Never infer private facts, exact prices, quality claims, location identity, or safety claims that are not visible or supplied.",
    userPromptText: [
      `Series profile: ${pack.profile.title}`,
      `Source title: ${asset.title}`,
      asset.description
        ? `Creator note: ${asset.description.slice(0, 1200)}`
        : "",
      "Return a concise Thai creator-facing description of what this image/video should communicate in the story, plus observable details and uncertainties.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: sourceDescriptionVisionSchema,
    firstAttemptMaxTokens: 900,
    retryMaxTokens: 1300,
    maxSchemaRetries: 2,
    modelFallbackPolicy: "recommended",
  });
  const usage = result.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );
  if (creditsUsed > 0) {
    if (!(await hasEnoughCredits(owner.userId, creditsUsed))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient credits for source visual analysis",
      });
    }
    await deductCredits({
      userId: owner.userId,
      tenantId: owner.tenantId,
      amount: creditsUsed,
      description: "Vertical Drama - source visual description suggestion",
      skillSlug: "vertical-drama-source-visual-analysis",
      sourceType: "skill",
      metadata: { feature: "vertical_drama_source_pack_vision" },
    });
  }
  return {
    suggestion: [
      result.data.description,
      result.data.observableDetails.length
        ? `สิ่งที่มองเห็น: ${result.data.observableDetails.join("; ")}`
        : "",
      result.data.uncertainty.length
        ? `จุดที่ต้องตรวจสอบ: ${result.data.uncertainty.join("; ")}`
        : "",
      "คำแนะนำจาก Vision — ผู้สร้างต้องตรวจสอบและกดยืนยันก่อนใช้เป็นข้อมูลอ้างอิง",
    ]
      .filter(Boolean)
      .join("\n"),
    usedVision: result.usedVision,
    model,
    creditsUsed,
  };
}

export async function acceptSourceAnalysisSuggestion(
  owner: SourcePackOwner,
  params: { packId: number; sourceAssetId: number; suggestion: string }
) {
  const text = params.suggestion.trim().slice(0, 5000);
  if (!text)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Suggestion cannot be empty",
    });
  const pack = await loadSourcePack(owner, params.packId);
  if (
    !pack.assets.some(
      (asset: { id: number }) => asset.id === params.sourceAssetId
    )
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source asset not found",
    });
  await db
    .update(verticalDramaSourceAssets)
    .set({
      description: text,
      analysisStatus: "accepted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSourceAssets.id, params.sourceAssetId),
        eq(verticalDramaSourceAssets.packId, params.packId),
        eq(verticalDramaSourceAssets.tenantId, owner.tenantId)
      )
    );
  await db
    .update(verticalDramaSourceAnalyses)
    .set({
      status: "succeeded",
      suggestion: text,
      attemptCount: sql`${verticalDramaSourceAnalyses.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSourceAnalyses.packId, params.packId),
        eq(verticalDramaSourceAnalyses.sourceAssetId, params.sourceAssetId),
        eq(verticalDramaSourceAnalyses.tenantId, owner.tenantId)
      )
    );
  await db
    .update(verticalDramaSourcePacks)
    .set({
      status: "needs_review",
      version: sql`${verticalDramaSourcePacks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSourcePacks.id, params.packId),
        eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
        eq(verticalDramaSourcePacks.userId, owner.userId)
      )
    );
  return loadSourcePack(owner, params.packId);
}
