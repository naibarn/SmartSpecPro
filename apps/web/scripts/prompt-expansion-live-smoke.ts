#!/usr/bin/env tsx

/**
 * Non-mocked provider smoke for the dedicated prompt-expansion skill.
 * This is intentionally opt-in because it makes a real, credit-consuming LLM call.
 *
 * Run from apps/web only after setting PROMPT_EXPANSION_LIVE_SMOKE=1,
 * PROMPT_EXPANSION_SMOKE_USER_ID, PROMPT_EXPANSION_SMOKE_TENANT_ID and
 * PROMPT_EXPANSION_SMOKE_PREMISE (<= 5,000 chars).
 */
import "dotenv/config";
import {
  assertPromptExpansionSchemaReady,
  runRealPromptExpansion,
} from "../server/services/verticalDramaPromptExpansionService";

if (process.env.PROMPT_EXPANSION_LIVE_SMOKE !== "1") {
  throw new Error("Refusing live prompt-expansion smoke: set PROMPT_EXPANSION_LIVE_SMOKE=1 explicitly");
}

const userId = Number(process.env.PROMPT_EXPANSION_SMOKE_USER_ID);
const tenantId = process.env.PROMPT_EXPANSION_SMOKE_TENANT_ID?.trim();
const prompt = process.env.PROMPT_EXPANSION_SMOKE_PREMISE?.trim();
const idempotencyKey = process.env.PROMPT_EXPANSION_SMOKE_IDEMPOTENCY_KEY?.trim() ?? `live-smoke-${Date.now()}`;

if (!Number.isInteger(userId) || userId <= 0 || !tenantId || !prompt) {
  throw new Error("Set PROMPT_EXPANSION_SMOKE_USER_ID, PROMPT_EXPANSION_SMOKE_TENANT_ID and PROMPT_EXPANSION_SMOKE_PREMISE");
}

await assertPromptExpansionSchemaReady();
const preview = await runRealPromptExpansion(
  { userId, tenantId },
  { prompt, locale: "th", idempotencyKey },
);

if (!preview.execution || preview.execution.mocked !== false || preview.execution.skillId !== "vertical-drama-prompt-expansion") {
  throw new Error("Live smoke did not produce verifiable real-run evidence");
}

console.log(JSON.stringify({
  ok: true,
  run: preview.execution,
  originalLength: preview.originalPrompt.length,
  expandedLength: preview.expandedPrompt.length,
  profile: preview.brief.profile,
  treatmentFields: preview.brief.storyTreatment ? Object.keys(preview.brief.storyTreatment) : [],
}, null, 2));
