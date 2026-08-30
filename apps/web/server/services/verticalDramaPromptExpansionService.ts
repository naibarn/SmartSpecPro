import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import fs from "fs";
import path from "path";
import { parseSkillFile } from "@smartspec/skills";
import { db } from "../db";
import { verticalDramaPromptExpansionRuns } from "../../drizzle/schema";
import {
  evaluatePromptExpansionQuality,
  hashPrompt,
  parsePromptExpansionModelOutput,
  promptExpansionExecutionSchema,
  promptExpansionModelOutputSchema,
  promptExpansionPreviewSchema,
  PromptExpansionOutputError,
  PROMPT_EXPANSION_PREMISE_LIMIT,
  type PromptExpansionModelOutput,
  type PromptExpansionPreview,
  type PromptExpansionSource,
} from "@shared/verticalDramaSeries/promptExpansion";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
} from "./verticalDramaStoryBible";
import { resolveVerticalDramaPromptExpansionModel } from "./verticalDramaLlmModelPolicy";
import { type PhysicalLlmAttemptEvent } from "./llmRouter";
import { calculateCreditsForLLM, hasEnoughCredits } from "./creditService";
import { chargeVerticalDramaLlmCall } from "./verticalDramaLlmBilling";

export type PromptExpansionOwner = { tenantId: string; userId: number };

export const PROMPT_EXPANSION_SKILL_ID = "vertical-drama-prompt-expansion" as const;
/**
 * Live evidence shows this skill's real provider responses commonly take
 * 25-35 seconds. Keep the request bounded, but do not abort a valid response
 * at the old 25-second ceiling.
 */
export const PROMPT_EXPANSION_LLM_TIMEOUT_MS = 55_000;
const PROMPT_EXPANSION_SKILL_FOLDER = path.join("skills", PROMPT_EXPANSION_SKILL_ID);
const PROMPT_EXPANSION_OUTPUT_SCHEMA_NAME = "vertical_drama_prompt_expansion_v2";

export type PromptExpansionFailureCode =
  | "PROMPT_EXPANSION_SKILL_NOT_FOUND"
  | "PROMPT_EXPANSION_SKILL_NOT_LLM"
  | "PROMPT_EXPANSION_PROVIDER_UNAVAILABLE"
  | "PROMPT_EXPANSION_LLM_FAILED"
  | "PROMPT_EXPANSION_OUTPUT_INVALID"
  | "PROMPT_EXPANSION_OUTPUT_NOT_USEFUL"
  | "PROMPT_EXPANSION_REAL_RUN_UNPROVEN"
  | "PROMPT_EXPANSION_CREDIT_UNAVAILABLE";

export class PromptExpansionFailure extends Error {
  constructor(
    public readonly code: PromptExpansionFailureCode,
    message: string,
    public readonly traceId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PromptExpansionFailure";
  }
}

type LoadedPromptExpansionSkill = {
  version: string;
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
};

export function buildPromptExpansionSkillBillingContext(input: {
  runId: string;
  traceId: string;
  providerCallId: string;
}) {
  return {
    skillRunId: input.runId,
    skillSlug: PROMPT_EXPANSION_SKILL_ID,
    sourceType: "skill" as const,
    metadata: {
      feature: PROMPT_EXPANSION_SKILL_ID,
      traceId: input.traceId,
      providerCallId: input.providerCallId,
    },
  };
}

let cachedPromptExpansionSkill: LoadedPromptExpansionSkill | null = null;

function loadPromptExpansionSkill(): LoadedPromptExpansionSkill {
  if (cachedPromptExpansionSkill) return cachedPromptExpansionSkill;
  for (const dir of resolveSkillDirCandidates(PROMPT_EXPANSION_SKILL_FOLDER)) {
    const manifestPath = resolveSkillManifestPath(dir);
    const manifestJsonPath = path.join(dir, "skill.json");
    const schemaPath = path.join(dir, "output.schema.json");
    if (!manifestPath || !fs.existsSync(manifestJsonPath) || !fs.existsSync(schemaPath)) continue;
    const { metadata, content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8")) as Record<string, unknown>;
    if (
      manifest.smartspec_slug !== PROMPT_EXPANSION_SKILL_ID ||
      manifest.version !== "2.0.0" ||
      manifest.contract_version !== 2 ||
      manifest.output_schema !== "output.schema.json"
    ) continue;
    if ((metadata.execution_mode ?? metadata.executionMode) !== "llm-only") {
      throw new Error("Prompt expansion skill execution_mode must be llm-only");
    }
    if (!content?.trim()) throw new Error("Prompt expansion skill has no executable system prompt");
    const outputSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
    if (!outputSchema || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
      throw new Error("Prompt expansion skill output schema is invalid");
    }
    cachedPromptExpansionSkill = {
      version: String(manifest.version),
      systemPrompt: content.trim(),
      outputSchema: outputSchema as Record<string, unknown>,
    };
    return cachedPromptExpansionSkill;
  }
  throw new Error(`Could not locate ${PROMPT_EXPANSION_SKILL_ID} skill bundle`);
}

function newPromptExpansionTraceId(): string {
  return `ppex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function failPromptExpansion(
  code: PromptExpansionFailureCode,
  message: string,
  traceId: string,
  cause?: unknown,
): never {
  throw new PromptExpansionFailure(code, message, traceId, cause);
}

function getDatabaseErrorField(error: unknown, key: "code" | "message" | "constraint") {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isPromptExpansionIdempotencyConflict(error: unknown): boolean {
  const code = getDatabaseErrorField(error, "code") ?? (error && typeof error === "object"
    ? getDatabaseErrorField((error as Record<string, unknown>).cause, "code")
    : undefined);
  const constraint = getDatabaseErrorField(error, "constraint") ?? (error && typeof error === "object"
    ? getDatabaseErrorField((error as Record<string, unknown>).cause, "constraint")
    : undefined);
  return code === "23505" && (!constraint || constraint.includes("prompt_expansion"));
}

/** Treat the prompt-expansion ledger as an optional capability during rollout. */
export function isPromptExpansionSchemaUnavailable(error: unknown): boolean {
  const code =
    getDatabaseErrorField(error, "code") ??
    (error && typeof error === "object"
      ? getDatabaseErrorField((error as Record<string, unknown>).cause, "code")
      : undefined);
  const message = [
    getDatabaseErrorField(error, "message"),
    error && typeof error === "object"
      ? getDatabaseErrorField(
          (error as Record<string, unknown>).cause,
          "message"
        )
      : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const mentionsPromptExpansionTable =
    message.includes("vertical_drama_prompt_expansion_runs") ||
    message.includes("verticaldramapromptexpansionruns");

  return (
    code === "42P01" ||
    (code === "42703" && mentionsPromptExpansionTable) ||
    (code === "42703" && !message)
  );
}

function throwIfPromptExpansionMigrationIsMissing(error: unknown): never {
  if (isPromptExpansionSchemaUnavailable(error)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Prompt expansion is not available yet because database migration 0244 has not been applied. Run the database migration and retry.",
      cause: error,
    });
  }
  throw error;
}

/** Run before any external LLM call so a missing 0244 migration cannot burn credits. */
export async function assertPromptExpansionSchemaReady(): Promise<void> {
  try {
    await db.select({ id: verticalDramaPromptExpansionRuns.id }).from(verticalDramaPromptExpansionRuns).limit(1);
  } catch (error) {
    throwIfPromptExpansionMigrationIsMissing(error);
  }
}

export function buildValidatedPromptExpansionPreview(input: {
  prompt: string;
  locale?: "th" | "en";
  sources?: PromptExpansionSource[];
  modelOutput?: string | null;
  execution?: unknown;
}): PromptExpansionPreview {
  const prompt = input.prompt.trim();
  if (!prompt) throw new TRPCError({ code: "BAD_REQUEST", message: "Prompt is required" });
  if (prompt.length > PROMPT_EXPANSION_PREMISE_LIMIT) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Prompt must be at most ${PROMPT_EXPANSION_PREMISE_LIMIT} characters` });
  }
  if (!input.modelOutput) {
    throw new PromptExpansionFailure(
      "PROMPT_EXPANSION_REAL_RUN_UNPROVEN",
      "ไม่พบผลลัพธ์จากการเรียก LLM จริง จึงไม่สร้าง preview และไม่ใช้ fallback",
      newPromptExpansionTraceId(),
    );
  }
  const parsed = parsePromptExpansionModelOutput(input.modelOutput);
  const quality = evaluatePromptExpansionQuality({ originalPrompt: prompt, output: parsed });
  if (!quality.ok) {
    throw new PromptExpansionFailure(
      "PROMPT_EXPANSION_OUTPUT_NOT_USEFUL",
      `ผลลัพธ์จาก LLM ไม่ได้ขยายโจทย์อย่างมีสาระ: ${quality.failureReasons.join("; ")}`,
      newPromptExpansionTraceId(),
    );
  }
  const execution = promptExpansionExecutionSchema.safeParse(input.execution);
  if (!execution.success) {
    throw new PromptExpansionFailure(
      "PROMPT_EXPANSION_REAL_RUN_UNPROVEN",
      "ไม่พบหลักฐานว่า preview นี้มาจาก skill และ LLM จริง จึงไม่บันทึกผลลัพธ์",
      newPromptExpansionTraceId(),
      execution.error,
    );
  }
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
      ...(input.sources?.length
        ? []
        : [
            "ยังไม่มีผลค้นเว็บที่ยืนยันได้; ข้อเท็จจริงเฉพาะสถานที่/เหตุการณ์ต้องตรวจสอบเพิ่ม",
          ]),
    ],
    slots: parsed.slots,
    execution: execution.data,
  });
}

export async function runRealPromptExpansion(
  owner: PromptExpansionOwner,
  input: {
    prompt: string;
    locale?: "th" | "en";
    idempotencyKey: string;
    seriesId?: number;
    modelId?: string | null;
  },
): Promise<PromptExpansionPreview> {
  const traceId = newPromptExpansionTraceId();
  const prompt = input.prompt.trim();
  if (!prompt) failPromptExpansion("PROMPT_EXPANSION_OUTPUT_INVALID", "ต้องระบุโจทย์ก่อนขยาย", traceId);
  if (prompt.length > PROMPT_EXPANSION_PREMISE_LIMIT) {
    failPromptExpansion(
      "PROMPT_EXPANSION_OUTPUT_INVALID",
      `โจทย์ยาวเกิน ${PROMPT_EXPANSION_PREMISE_LIMIT.toLocaleString()} ตัวอักษร ระบบจึงล็อกการขยายโจทย์ไว้`,
      traceId,
    );
  }

  let skill: LoadedPromptExpansionSkill;
  try {
    skill = loadPromptExpansionSkill();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failPromptExpansion(
      message.includes("execution_mode") ? "PROMPT_EXPANSION_SKILL_NOT_LLM" : "PROMPT_EXPANSION_SKILL_NOT_FOUND",
      "ไม่พบ skill ขยายโจทย์แบบ LLM-only ที่พร้อมใช้งาน จึงหยุดโดยไม่ใช้ fallback",
      traceId,
      error,
    );
  }

  let model: string;
  try {
    model = await resolveVerticalDramaPromptExpansionModel({
      seriesId: input.seriesId,
      requestedModelId: input.modelId,
    });
  } catch (error) {
    failPromptExpansion(
      "PROMPT_EXPANSION_PROVIDER_UNAVAILABLE",
      "ยังไม่มี provider/model ที่พร้อมเรียกใช้งาน กรุณาเปิดใช้งาน LLM แล้วลองใหม่",
      traceId,
      error,
    );
  }

  const estimatedCredits = calculateCreditsForLLM(PROMPT_EXPANSION_PREMISE_LIMIT, 8_000, model);
  try {
    if (!(await hasEnoughCredits(owner.userId, estimatedCredits))) {
      failPromptExpansion(
        "PROMPT_EXPANSION_CREDIT_UNAVAILABLE",
        "เครดิตไม่เพียงพอสำหรับการขยายโจทย์ ระบบยังไม่ได้เรียก LLM และยังไม่หักเครดิต",
        traceId,
      );
    }
  } catch (error) {
    failPromptExpansion("PROMPT_EXPANSION_CREDIT_UNAVAILABLE", "ตรวจสอบเครดิตไม่สำเร็จ ระบบยังไม่ได้เรียก LLM", traceId, error);
  }

  const attempts: PhysicalLlmAttemptEvent[] = [];
  const billedAttemptKeys = new Set<string>();
  const userPrompt = [
    `Locale: ${input.locale ?? "th"}`,
    "Expand this creator premise into a complete, editable story treatment.",
    "The result must preserve every explicit fact and must not invent real-world facts.",
    "For profile=story, make the treatment cover protagonist backgrounds and goals, how the protagonists meet, relationship progression, obstacles, the central conflict, the biggest reveal or pressure point, climax, and ending direction.",
    "This is a premise/treatment layer, not an episode draft: do not write scene-by-scene shots, dialogue, camera directions, or production instructions.",
    "Return JSON only and satisfy every required field in the output schema. The top-level keys must be brief, expandedPrompt, sources, warnings, and slots; expandedPrompt is mandatory even when the premise is detailed. Use this exact slot shape for every item: {slotKey,title,description,semanticRole,mediaType,required:true,evidenceStatus,rationale}; required must be a real JSON boolean, never omitted or a string. For a story, put protagonists, setting, meetingAndIncitingEvent, relationshipProgression, obstacles, opposingForces, centralQuestion, majorConflict, turningPoints, climax, endingDirection, unresolvedHooks, tone, audience, assumptions, and exclusions INSIDE brief.storyTreatment. Do not put tone or assumptions directly under brief. Use [] for empty arrays and include sources and warnings as arrays. Keep each treatment field concise so the complete object is returned.",
    `Creator premise:\n${prompt}`,
  ].join("\n\n");

  let result: {
    data: PromptExpansionModelOutput;
    model: string;
    response: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
  };
  try {
    result = await executeJsonPlanningCallWithRetry<PromptExpansionModelOutput>({
      model,
      systemPrompt: skill.systemPrompt,
      userPrompt,
      temperature: 0.55,
      userId: owner.userId,
      maxTokens: 6_000,
      retryMaxTokens: 6_000,
      extraBodyParams: {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: PROMPT_EXPANSION_OUTPUT_SCHEMA_NAME,
            strict: false,
            schema: skill.outputSchema,
          },
        },
      },
      disableProviderFallbacks: true,
      physicalAttemptObserver: async event => {
        attempts.push(event);
        if (event.phase === "terminal" && event.outcome === "success" && event.providerCallId) {
          const attemptKey = input.idempotencyKey + ":physical:" + event.attemptOrdinal;
          if (!billedAttemptKeys.has(attemptKey)) {
            await chargeVerticalDramaLlmCall({
              userId: owner.userId,
              tenantId: owner.tenantId,
              seriesId: input.seriesId,
              runId: input.idempotencyKey,
              attemptKey,
              skillSlug: PROMPT_EXPANSION_SKILL_ID,
              stage: "prompt_expansion",
              round: event.attemptOrdinal,
              attempt: event.attemptOrdinal,
              model: event.model,
              provider: event.providerName,
              providerCallId: event.providerCallId,
              inputTokens: event.inputTokens ?? 0,
              outputTokens: event.outputTokens ?? 0,
              metadata: { traceId },
            });
            billedAttemptKeys.add(attemptKey);
          }
        }
      },
      maxTransientRetries: 0,
      // The endpoint is synchronous behind a proxy. One bounded schema repair
      // keeps the worst case below the proxy timeout; a slow/invalid run must
      // fail clearly instead of holding the request until a 524.
      timeoutMs: PROMPT_EXPANSION_LLM_TIMEOUT_MS,
      maxSchemaRetries: 2,
      schemaRetryContract: "Return the complete JSON object again with top-level keys brief, expandedPrompt, sources, warnings, and slots. For story, all storyTreatment fields (including unresolvedHooks, tone, audience, assumptions, and exclusions) must be nested under brief.storyTreatment, never directly under brief. Every slot must match {slotKey,title,description,semanticRole,mediaType,required:true,evidenceStatus,rationale}; required is mandatory JSON boolean. Do not return a patch, prose, markdown, omit expandedPrompt, omit sources/warnings, omit slots.required, or return an empty slots array.",
      schema: promptExpansionModelOutputSchema,
      label: "Vertical Drama prompt expansion",
    });
  } catch (error) {
    const outputInvalid = error instanceof Error && /schema|json|response/i.test(error.message);
    failPromptExpansion(
      outputInvalid ? "PROMPT_EXPANSION_OUTPUT_INVALID" : "PROMPT_EXPANSION_LLM_FAILED",
      outputInvalid
        ? "LLM ส่งผลลัพธ์ไม่ตรง schema ของ skill จึงไม่แสดง preview และไม่ใช้ fallback"
        : "การเรียก LLM สำหรับ skill ขยายโจทย์ล้มเหลว จึงไม่แสดง preview และไม่ใช้ fallback",
      traceId,
      error,
    );
  }

  const successfulAttempt = [...attempts].reverse().find(event => event.phase === "terminal" && event.outcome === "success");
  if (!successfulAttempt?.providerCallId || !successfulAttempt.providerName) {
    failPromptExpansion(
      "PROMPT_EXPANSION_REAL_RUN_UNPROVEN",
      "ระบบยืนยันไม่ได้ว่า response มาจาก provider จริง จึงไม่บันทึกผลลัพธ์และไม่หักเครดิต",
      traceId,
    );
  }
  const terminalAttempts = attempts.filter(event => event.phase === "terminal");
  const inputTokens = terminalAttempts.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0) || result.response?.usage?.prompt_tokens || 0;
  const outputTokens = terminalAttempts.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0) || result.response?.usage?.completion_tokens || 0;
  const execution = {
    skillId: PROMPT_EXPANSION_SKILL_ID,
    skillVersion: skill.version,
    executionMode: "llm-only" as const,
    provider: successfulAttempt.providerName,
    providerCallId: successfulAttempt.providerCallId,
    model: successfulAttempt.model || result.model,
    attemptCount: Math.max(1, terminalAttempts.length),
    inputTokens,
    outputTokens,
    mocked: false as const,
  };

  if (result.data.brief.profile !== "story") {
    failPromptExpansion(
      "PROMPT_EXPANSION_OUTPUT_NOT_USEFUL",
      "ผลลัพธ์ไม่ใช่ story treatment ของซีรีย์ จึงไม่แสดงผลและไม่หักเครดิต",
      traceId,
    );
  }

  let preview: PromptExpansionPreview;
  try {
    preview = buildValidatedPromptExpansionPreview({
      prompt,
      locale: input.locale,
      modelOutput: JSON.stringify(result.data),
      execution,
    });
  } catch (error) {
    if (error instanceof PromptExpansionFailure) throw error;
    failPromptExpansion(
      error instanceof PromptExpansionOutputError ? "PROMPT_EXPANSION_OUTPUT_INVALID" : "PROMPT_EXPANSION_OUTPUT_NOT_USEFUL",
      "ผลลัพธ์จาก LLM ไม่ผ่านการตรวจคุณภาพ จึงไม่แสดง preview และไม่หักเครดิต",
      traceId,
      error,
    );
  }

  if (billedAttemptKeys.size === 0) {
    failPromptExpansion(
      "PROMPT_EXPANSION_CREDIT_UNAVAILABLE",
      "การเรียก LLM สำเร็จแต่ไม่พบ transaction เครดิตของ provider call จึงไม่ส่ง preview",
      traceId,
    );
  }
  return preview;
}

export async function savePromptExpansionPreview(
  owner: PromptExpansionOwner,
  input: {
    draftSessionId?: string;
    seriesId?: number;
    idempotencyKey: string;
    preview: PromptExpansionPreview;
  }
) {
  try {
    const [existing] = await db
      .select()
      .from(verticalDramaPromptExpansionRuns)
      .where(
        and(
          eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
          eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
          eq(
            verticalDramaPromptExpansionRuns.idempotencyKey,
            input.idempotencyKey
          )
        )
      )
      .limit(1);
    if (existing) return existing;
    const [row] = await db
      .insert(verticalDramaPromptExpansionRuns)
      .values({
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
      })
      .returning();
    if (!row)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not save prompt preview",
      });
    return row;
  } catch (error) {
    if (isPromptExpansionIdempotencyConflict(error)) {
      const [existing] = await db
        .select()
        .from(verticalDramaPromptExpansionRuns)
        .where(
          and(
            eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
            eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
            eq(verticalDramaPromptExpansionRuns.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    throwIfPromptExpansionMigrationIsMissing(error);
  }
}

export async function getPromptExpansionByIdempotencyKey(
  owner: PromptExpansionOwner,
  idempotencyKey: string,
) {
  try {
    const [row] = await db
      .select()
      .from(verticalDramaPromptExpansionRuns)
      .where(
        and(
          eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
          eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
          eq(verticalDramaPromptExpansionRuns.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!row) return null;
    const preview = promptExpansionPreviewSchema.safeParse(row.previewJson);
    if (!preview.success || !preview.data.execution) {
      throw new PromptExpansionFailure(
        "PROMPT_EXPANSION_REAL_RUN_UNPROVEN",
        "พบ idempotency key เดิมที่ไม่มีหลักฐาน real LLM จึงไม่ใช้ผลลัพธ์เก่าและไม่เรียก fallback",
        newPromptExpansionTraceId(),
      );
    }
    return { row, preview: preview.data };
  } catch (error) {
    if (error instanceof PromptExpansionFailure) throw error;
    throwIfPromptExpansionMigrationIsMissing(error);
  }
}

export async function applyPromptExpansion(
  owner: PromptExpansionOwner,
  input: {
    runId: number;
    expectedRevision: number;
    originalPromptHash: string;
    approved: PromptExpansionPreview;
  }
) {
  try {
    const [current] = await db
      .select()
      .from(verticalDramaPromptExpansionRuns)
      .where(
        and(
          eq(verticalDramaPromptExpansionRuns.id, input.runId),
          eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
          eq(verticalDramaPromptExpansionRuns.userId, owner.userId)
        )
      )
      .limit(1);
    if (!current)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Prompt preview not found",
      });
    if (
      current.originalPromptHash !== input.originalPromptHash ||
      current.revision !== input.expectedRevision
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "โจทย์ต้นฉบับเปลี่ยนแล้ว กรุณาเปิด preview ใหม่",
      });
    }
    const approved = promptExpansionPreviewSchema.parse({
      ...input.approved,
      status: "applied",
    });
    const storedPreview = promptExpansionPreviewSchema.safeParse(current.previewJson);
    if (
      !storedPreview.success ||
      approved.originalPromptHash !== current.originalPromptHash ||
      approved.originalPrompt !== current.originalPrompt ||
      !approved.execution ||
      storedPreview.data.execution?.providerCallId !== approved.execution.providerCallId
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "ผลลัพธ์นี้ไม่มี lineage จากการรัน LLM จริง จึงนำไปใช้ไม่ได้",
      });
    }
    const [updated] = await db
      .update(verticalDramaPromptExpansionRuns)
      .set({
        status: "applied",
        approvedJson: approved,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaPromptExpansionRuns.id, input.runId),
          eq(verticalDramaPromptExpansionRuns.revision, input.expectedRevision),
          eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
          eq(verticalDramaPromptExpansionRuns.userId, owner.userId)
        )
      )
      .returning();
    if (!updated)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Preview was changed by another editor",
      });
    return updated;
  } catch (error) {
    throwIfPromptExpansionMigrationIsMissing(error);
  }
}

export async function getLatestPromptExpansion(
  owner: PromptExpansionOwner,
  input: { seriesId?: number; draftSessionId?: string }
) {
  try {
    const filters = [
      eq(verticalDramaPromptExpansionRuns.tenantId, owner.tenantId),
      eq(verticalDramaPromptExpansionRuns.userId, owner.userId),
    ];
    if (input.seriesId !== undefined)
      filters.push(
        eq(verticalDramaPromptExpansionRuns.seriesId, input.seriesId)
      );
    if (input.draftSessionId !== undefined)
      filters.push(
        eq(
          verticalDramaPromptExpansionRuns.draftSessionId,
          input.draftSessionId
        )
      );
    const [row] = await db
      .select()
      .from(verticalDramaPromptExpansionRuns)
      .where(and(...filters))
      .orderBy(desc(verticalDramaPromptExpansionRuns.createdAt))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (isPromptExpansionSchemaUnavailable(error)) return null;
    throw error;
  }
}
