import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { verticalDramaPromptExpansionRuns } from "../../drizzle/schema";
import {
  deriveVisualSlots,
  hashPrompt,
  inferPromptExpansionProfile,
  parsePromptExpansionModelOutput,
  promptExpansionPreviewSchema,
  type PromptExpansionBrief,
  type PromptExpansionPreview,
  type PromptExpansionSource,
} from "@shared/verticalDramaSeries/promptExpansion";

export type PromptExpansionOwner = { tenantId: string; userId: number };

export function buildDeterministicPromptExpansionPreview(input: {
  prompt: string;
  locale?: "th" | "en";
  sources?: PromptExpansionSource[];
  modelOutput?: string | null;
}): PromptExpansionPreview {
  const prompt = input.prompt.trim();
  if (!prompt) throw new TRPCError({ code: "BAD_REQUEST", message: "Prompt is required" });
  const parsed = input.modelOutput
    ? parsePromptExpansionModelOutput(input.modelOutput, prompt)
    : {
        brief: buildFallbackBrief(prompt),
        expandedPrompt: buildFallbackExpandedPrompt(prompt),
        slots: deriveVisualSlots(prompt),
        sources: [],
        warnings: ["นี่เป็น preview ตั้งต้น กรุณาแก้ไขและยืนยันก่อนนำไปใช้"],
      };
  return promptExpansionPreviewSchema.parse({
    revision: 1,
    originalPrompt: prompt,
    originalPromptHash: hashPrompt(prompt),
    status: "preview",
    brief: parsed.brief,
    expandedPrompt: parsed.expandedPrompt,
    sources: input.sources?.length ? input.sources : parsed.sources,
    warnings: [
      ...parsed.warnings,
      ...(input.sources?.length ? [] : ["ยังไม่มีผลค้นเว็บที่ยืนยันได้; ข้อเท็จจริงเฉพาะสถานที่/เหตุการณ์ต้องตรวจสอบเพิ่ม"]),
    ],
    slots: parsed.slots,
  });
}

function buildFallbackBrief(prompt: string): PromptExpansionBrief {
  const profile = inferPromptExpansionProfile(prompt);
  return {
    title: prompt.slice(0, 120),
    oneLineSummary: prompt,
    profile,
    angle: profile === "news_report" ? "รายงานข้อเท็จจริงพร้อมแหล่งข้อมูล ณ เวลาอ้างอิง" : "อธิบายหัวข้อให้ผู้ชมเข้าใจง่ายและนำไปผลิตสื่อได้",
    audience: "ผู้ชมทั่วไป",
    scope: ["ประเด็นหลัก", "บริบท", "ภาพหรือ footage ที่จำเป็น"],
    factualClaims: profile === "news_report" ? [prompt] : [],
    creativeAssumptions: ["รายละเอียดที่ไม่ได้ระบุให้ผู้ใช้ตรวจแก้ก่อนนำไปใช้"],
    exclusions: ["ไม่สร้างตัวเลข ชื่อบุคคล หรือสถานที่เฉพาะขึ้นเองโดยไม่มีหลักฐาน"],
  };
}

function buildFallbackExpandedPrompt(prompt: string): string {
  return [
    prompt,
    "ช่วยวางกรอบเนื้อหาให้ชัดเจน: เป้าหมายผู้ชม มุมเล่า ขอบเขตข้อมูล ข้อเท็จจริงที่ต้องตรวจสอบ และภาพ/วิดีโอที่ควรใช้ประกอบ",
    "คงเจตนาของโจทย์เดิม และแยกสิ่งที่เป็นข้อเท็จจริงออกจากข้อเสนอเชิงสร้างสรรค์อย่างชัดเจน",
  ].join("\n\n");
}

export async function savePromptExpansionPreview(
  owner: PromptExpansionOwner,
  input: { draftSessionId?: string; seriesId?: number; idempotencyKey: string; preview: PromptExpansionPreview },
) {
  const [existing] = await db
    .select()
    .from(verticalDramaPromptExpansionRuns)
    .where(and(
      eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
      eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
      eq(verticalDramaPromptExpansionRuns.idempotencyKey, input.idempotencyKey),
    ))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(verticalDramaPromptExpansionRuns).values({
    tenantId: owner.tenantId,
    userId: owner.userId,
    draftSessionId: input.draftSessionId ?? null,
    seriesId: input.seriesId ?? null,
    idempotencyKey: input.idempotencyKey,
    originalPrompt: input.preview.originalPrompt,
    originalPromptHash: input.preview.originalPromptHash,
    revision: input.preview.revision,
    status: "preview",
    previewJson: input.preview,
  }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save prompt preview" });
  return row;
}

export async function applyPromptExpansion(
  owner: PromptExpansionOwner,
  input: { runId: number; expectedRevision: number; originalPromptHash: string; approved: PromptExpansionPreview },
) {
  const [current] = await db.select().from(verticalDramaPromptExpansionRuns).where(and(
    eq(verticalDramaPromptExpansionRuns.id, input.runId),
    eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
    eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
  )).limit(1);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt preview not found" });
  if (current.originalPromptHash !== input.originalPromptHash || current.revision !== input.expectedRevision) {
    throw new TRPCError({ code: "CONFLICT", message: "โจทย์ต้นฉบับเปลี่ยนแล้ว กรุณาเปิด preview ใหม่" });
  }
  const approved = promptExpansionPreviewSchema.parse({ ...input.approved, status: "applied" });
  const [updated] = await db.update(verticalDramaPromptExpansionRuns).set({
    status: "applied",
    approvedJson: approved,
    updatedAt: new Date(),
  }).where(and(
    eq(verticalDramaPromptExpansionRuns.id, input.runId),
    eq(verticalDramaPromptExpansionRuns.revision, input.expectedRevision),
  )).returning();
  if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Preview was changed by another editor" });
  return updated;
}

export async function getLatestPromptExpansion(owner: PromptExpansionOwner, input: { seriesId?: number; draftSessionId?: string }) {
  const filters = [eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId), eq(verticalDramaPromptExpansionRuns.userId, owner.userId)];
  if (input.seriesId !== undefined) filters.push(eq(verticalDramaPromptExpansionRuns.seriesId, input.seriesId));
  if (input.draftSessionId !== undefined) filters.push(eq(verticalDramaPromptExpansionRuns.draftSessionId, input.draftSessionId));
  const [row] = await db.select().from(verticalDramaPromptExpansionRuns).where(and(...filters)).orderBy(desc(verticalDramaPromptExpansionRuns.createdAt)).limit(1);
  return row ?? null;
}
