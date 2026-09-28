/** Feature 137 P3: one-call, fail-open clip identity vision QA. */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import {
  executeVisionAwareJsonCallWithRetry,
  type VisionAwareImageInput,
} from "./verticalDramaStoryBible";
import { resolveStartFramePlanModel } from "./verticalDramaImproveScript";
import {
  normalizeClipIdentityQcAnalysis,
  type VdClipIdentityQcAnalysis,
} from "@shared/verticalDramaSeries/clipIdentityQc";

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-clip-identity-qa");
export const CLIP_IDENTITY_QC_SKILL_VERSION = "vertical-drama-clip-identity-qa@1";

const outputSchema = z.object({
  characters: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
}).passthrough();

let cachedSkillPrompt: string | null = null;

function loadSkillPrompt(): string {
  if (cachedSkillPrompt) return cachedSkillPrompt;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) {
      cachedSkillPrompt = content;
      return content;
    }
  }
  throw new Error(`Could not locate ${SKILL_FOLDER_PATH}/skill.md`);
}

export type ClipIdentityQcCharacter = { characterKey: string; name: string };

export type RunClipIdentityQcInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  seriesId: number;
  episodeId: number;
  clipNumber: number;
  startFrameUrl?: string;
  sampleUrls: string[];
  characterReferenceUrls: Array<{
    characterKey: string;
    name: string;
    url: string;
  }>;
  idempotencyKey?: string;
};

export type RunClipIdentityQcResult = {
  analysis?: VdClipIdentityQcAnalysis;
  usedVision: boolean;
  model?: string;
  skillVersion: string;
  creditsUsed: number;
};

export function buildClipIdentityQcUserPrompt(input: {
  clipNumber: number;
  expectedCharacters: ClipIdentityQcCharacter[];
  sampleCount: number;
}): string {
  return [
    "Compare the approved start frame and every sampled frame with the approved character references.",
    "Return ONLY compact JSON matching the skill contract. This is advisory QA; use visible evidence only.",
    JSON.stringify({
      clip_number: input.clipNumber,
      sampled_frame_count: input.sampleCount,
      required_characters: input.expectedCharacters,
      verdicts: ["consistent", "minor_drift", "identity_break"],
    }, null, 2),
  ].join("\n\n");
}

export async function runClipIdentityQc(
  input: RunClipIdentityQcInput,
): Promise<RunClipIdentityQcResult> {
  const sampleUrls = input.sampleUrls.filter(url => Boolean(url?.trim())).slice(0, 6);
  const referenceImages: VisionAwareImageInput[] = [];
  if (input.startFrameUrl) {
    referenceImages.push({ label: "APPROVED START FRAME", url: input.startFrameUrl });
  }
  sampleUrls.forEach((url, index) => {
    referenceImages.push({ label: `SAMPLED CLIP FRAME ${index}`, url });
  });
  input.characterReferenceUrls.slice(0, 12).forEach(reference => {
    referenceImages.push({
      label: `APPROVED CHARACTER REFERENCE ${reference.name} (${reference.characterKey})`,
      url: reference.url,
    });
  });

  // The approved start frame is the comparison anchor, not an optional
  // convenience. Callers should persist an unavailable warning rather than
  // allowing a samples-vs-portrait-only check to look like a full pass.
  if (!input.startFrameUrl || sampleUrls.length === 0 || referenceImages.length === 0) {
    return {
      usedVision: false,
      skillVersion: CLIP_IDENTITY_QC_SKILL_VERSION,
      creditsUsed: 0,
    };
  }

  const expectedCharacters = input.characterReferenceUrls.map(reference => ({
    characterKey: reference.characterKey,
    name: reference.name,
  }));
  const model = await resolveStartFramePlanModel(input.seriesId);
  const visionResult = await executeVisionAwareJsonCallWithRetry({
    model,
    systemPrompt: loadSkillPrompt(),
    userPromptText: buildClipIdentityQcUserPrompt({
      clipNumber: input.clipNumber,
      expectedCharacters,
      sampleCount: sampleUrls.length,
    }),
    hasVision: true,
    images: referenceImages,
    userId: input.userId,
    tenantId: input.tenantId,
    publicUrl: input.publicUrl,
    schema: outputSchema,
    firstAttemptMaxTokens: 1600,
    retryMaxTokens: 2200,
  });
  const usage = visionResult.response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );
  if (creditsUsed > 0 && !(await hasEnoughCredits(input.userId, creditsUsed))) {
    throw new Error(`Insufficient credits for clip identity QC (required: ${creditsUsed})`);
  }
  if (creditsUsed > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — clip identity QC (episode #${input.episodeId}, clip #${input.clipNumber})`,
      sourceType: "vision_analysis",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        feature: "vertical_drama_clip_identity_qc",
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        clipNumber: input.clipNumber,
        model,
        sampleCount: sampleUrls.length,
      },
    });
  }
  return {
    analysis: normalizeClipIdentityQcAnalysis(visionResult.data, expectedCharacters),
    usedVision: true,
    model,
    skillVersion: CLIP_IDENTITY_QC_SKILL_VERSION,
    creditsUsed,
  };
}
