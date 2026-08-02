/**
 * Feature 142 — section-02: Structured-output model resolver.
 *
 * The single answer to "which model do I call?" for every LLM-backed Video
 * Intelligence stage (quality review, scene plan, quality repair). Every
 * resolution is:
 *
 *  1. Admin-curated  — reuses model_provider_map.isRecommended (D2), never a
 *     new hardcoded tier list.
 *  2. Structured-output capable — adds `supportsStructuredOutputs: true` to
 *     the existing recommended-model path (AD-1), because nothing upstream
 *     filters on it today.
 *  3. Never silently degraded — hard-fails with VideoIntelligenceModelError
 *     ("VI_NO_RECOMMENDED_MODEL") instead of returning null or falling back
 *     to a non-recommended model (AD-3). Contrast
 *     marketplaceAutoReviewService.ts's resolveRecommendedVisionQaModelId(),
 *     which degrades to null on purpose because it has a legacy default;
 *     this module has none.
 *  4. Self-correcting — reportStructuredOutputViolation() feeds the existing
 *     recommendedModelQualityBreaker so a model that repeatedly returns
 *     garbage loses its recommendation.
 *  5. Observable on revocation — emits a "video_project_stage" audit event
 *     (the same event type + cast pattern as routers/videoProjects.ts's
 *     logStage()) ONLY when the breaker reports `revoked: true`. Section-08
 *     keys its alert on this event; do not rename the strings below.
 *
 * This module never imports TRPCError, callLLMStructured, or any router —
 * that import boundary is what keeps its unit tests narrow (see the DI
 * section below). It never caches a resolution: every call reads fresh so a
 * revocation or an admin edit takes effect immediately.
 */
import type { EnabledLlmModelRow } from "./enabledLlmModels";
import { reportVideoIntelligenceSchemaFailure } from "./videoIntelligenceObservability";

/** Sentinel the model pickers store when the user chose "automatic". */
export const AUTOMATIC_LLM_MODEL_VALUE = "__automatic__";

/**
 * Capability floor for every VI structured-output stage. BOTH flags are
 * required — `recommendedOnly` is D2, and `supportsStructuredOutputs` is the
 * filter 142 adds because nothing in the existing recommended path checks it
 * (AD-1). Do NOT use resolveQualityLargeContextModelId(); its 1M-context +
 * supportsThinking + non-free floor is tuned for long Vertical Drama scripts
 * and needlessly narrows the pool for 142's small documents.
 */
export const VI_STRUCTURED_STAGE_REQUIREMENTS = {
  recommendedOnly: true,
  supportsStructuredOutputs: true,
} as const;

/** Cap on the joined zodIssuePaths detail string (AD-4 strike reporting). */
const MAX_ZOD_ISSUE_DETAIL_LENGTH = 500;

/** Larger candidate window for the post-dispatch availability re-check. */
const AVAILABILITY_RECHECK_MAX_CANDIDATES = 50;

/**
 * Options for the execution-time availability re-check.
 *
 * `source` is the value `resolveStructuredStageModelSelection` returned at
 * dispatch. Sections 04/05/06 carry it in the job payload alongside `modelId`
 * so the executor re-checks the model the same way it was chosen: a
 * recommended-path model must still be recommended, an operator pin only has
 * to still be enabled. Omitting it defaults to the strict recommended check.
 */
export type AssertStructuredStageModelOptions = {
  source?: StructuredStageModelSource;
};

/**
 * Typed carrier for this module's VI_* error codes. `message` is prefixed
 * with the code so a plain `toThrow(/VI_NO_.../)` works and the executor's
 * existing `VI_*: message` string convention holds.
 */
export class VideoIntelligenceModelError extends Error {
  readonly code: "VI_NO_RECOMMENDED_MODEL" = "VI_NO_RECOMMENDED_MODEL";

  constructor(message: string) {
    super(message);
    this.name = "VideoIntelligenceModelError";
  }
}

export type StructuredStageModelSource = "explicit_pin" | "recommended";

export type StructuredStageModelSelection = {
  /** The id to pass as callLLMStructured's `model` param (AD-2).
   *  `preferredProviderId` stays unset — it is an orthogonal provider pin. */
  modelId: string;
  source: StructuredStageModelSource;
  /** USD per 1M tokens, straight off the row this call already loaded. `null`
   *  when the row is absent (off-catalog explicit pin) or carries no price. */
  pricingInputPerMTokUsd: number | null;
  pricingOutputPerMTokUsd: number | null;
  isFree: boolean;
};

/* -------------------------------------------------------------------------- */
/* Dependency injection (test seam) — AD-8                                    */
/* -------------------------------------------------------------------------- */

export interface VideoIntelligenceModelResolverDeps {
  loadRows: () => Promise<EnabledLlmModelRow[]>;
  selectCandidates: (
    requirements: Record<string, unknown>,
    rows: EnabledLlmModelRow[],
    max: number,
  ) => string[];
  recordStrike: (input: {
    modelId: string | null | undefined;
    runId?: string | null;
    reason: "contract_violation" | "disqualified";
    detail?: string;
  }) => Promise<{ recorded: boolean; revoked: boolean; strikeCount: number }>;
  logAudit: (entry: Record<string, unknown>) => void;
}

// Defaults use lazy `await import(...)` inside the function bodies (AD-8) —
// established convention to keep heavy provider/router transitive imports
// out of narrow `vi.mock` graphs. Only ever imported when the caller did not
// inject a test double for that dependency.

async function defaultLoadRows(): Promise<EnabledLlmModelRow[]> {
  const { loadEnabledLlmModelRows } = await import("./enabledLlmModels");
  return loadEnabledLlmModelRows();
}

async function createDefaultSelectCandidates(): Promise<
  VideoIntelligenceModelResolverDeps["selectCandidates"]
> {
  const { selectLlmModelCandidates } = await import(
    "./intelligentModelSelector"
  );
  return selectLlmModelCandidates;
}

async function defaultRecordStrike(
  input: Parameters<VideoIntelligenceModelResolverDeps["recordStrike"]>[0],
): ReturnType<VideoIntelligenceModelResolverDeps["recordStrike"]> {
  const { recordRecommendedModelQualityStrike } = await import(
    "./recommendedModelQualityBreaker"
  );
  return recordRecommendedModelQualityStrike(input);
}

async function createDefaultLogAudit(): Promise<
  VideoIntelligenceModelResolverDeps["logAudit"]
> {
  const { auditLogger } = await import("./auditLogger");
  return (entry: Record<string, unknown>) => {
    // Mirrors routers/videoProjects.ts's logStage() `as AuditEventType` cast
    // (the same pattern hyperframesRenderWorker.ts uses) so this module
    // never has to modify the shared AuditEventType enum.
    auditLogger.log(entry as unknown as Parameters<typeof auditLogger.log>[0]);
  };
}

async function resolveDeps(
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<VideoIntelligenceModelResolverDeps> {
  return {
    loadRows: dependencies?.loadRows ?? defaultLoadRows,
    selectCandidates:
      dependencies?.selectCandidates ?? (await createDefaultSelectCandidates()),
    recordStrike: dependencies?.recordStrike ?? defaultRecordStrike,
    logAudit: dependencies?.logAudit ?? (await createDefaultLogAudit()),
  };
}

/* -------------------------------------------------------------------------- */
/* Pricing / row-matching helpers                                             */
/* -------------------------------------------------------------------------- */

/**
 * Match a resolved model id back to its row for pricing. Order: row.modelId,
 * then row.providerModelId, then legacyModelAliases; first match in the
 * already-priority-sorted `rows` order (loadEnabledLlmModelRows() orders by
 * priority ASC).
 */
function findRowForModelId(
  rows: EnabledLlmModelRow[],
  modelId: string,
): EnabledLlmModelRow | undefined {
  return (
    rows.find((row) => row.modelId === modelId) ??
    rows.find((row) => row.providerModelId === modelId) ??
    rows.find((row) => (row.legacyModelAliases ?? []).includes(modelId))
  );
}

/**
 * Strict price parse: a non-finite or negative value becomes `null`, NEVER
 * `0` — `0` means "free" downstream and under-quoting a price the user
 * confirms is exactly the failure this module avoids.
 */
function parsePricePerMTokUsd(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function pricingFromRow(row: EnabledLlmModelRow | undefined): Pick<
  StructuredStageModelSelection,
  "pricingInputPerMTokUsd" | "pricingOutputPerMTokUsd" | "isFree"
> {
  if (!row) {
    return {
      pricingInputPerMTokUsd: null,
      pricingOutputPerMTokUsd: null,
      isFree: false,
    };
  }
  if (row.isFree === true) {
    return { pricingInputPerMTokUsd: 0, pricingOutputPerMTokUsd: 0, isFree: true };
  }
  return {
    pricingInputPerMTokUsd: parsePricePerMTokUsd(row.pricingInput),
    pricingOutputPerMTokUsd: parsePricePerMTokUsd(row.pricingOutput),
    isFree: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the model for a structured-output stage, with the pricing basis the
 * estimate query needs, in ONE row load.
 * Order: explicit pin -> recommended + structured-output candidate -> throw.
 * Never silently degrades to a non-recommended model (AD-3).
 */
export async function resolveStructuredStageModelSelection(
  explicitPin?: string | null,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<StructuredStageModelSelection> {
  const trimmedPin = typeof explicitPin === "string" ? explicitPin.trim() : "";
  const deps = await resolveDeps(dependencies);

  if (trimmedPin && trimmedPin !== AUTOMATIC_LLM_MODEL_VALUE) {
    // An operator who picked a model on purpose outranks auto-selection —
    // never validate against the recommended set, never throw here even if
    // the row load used for pricing enrichment fails.
    let rows: EnabledLlmModelRow[] = [];
    try {
      rows = await deps.loadRows();
    } catch {
      rows = [];
    }
    const matchedRow = findRowForModelId(rows, trimmedPin);
    return {
      modelId: trimmedPin,
      source: "explicit_pin",
      ...pricingFromRow(matchedRow),
    };
  }

  // Automatic path — a row-load failure here is a database outage, not "no
  // recommended model", and must propagate rather than be laundered into an
  // admin-actionable error.
  const rows = await deps.loadRows();
  const candidates = deps.selectCandidates(
    VI_STRUCTURED_STAGE_REQUIREMENTS,
    rows,
    1,
  );
  const winningId = candidates[0];

  if (!winningId) {
    throw new VideoIntelligenceModelError(
      "VI_NO_RECOMMENDED_MODEL: no recommended, structured-output-capable " +
        "model is available. supportsStructuredOutputs is nullable — a " +
        "model whose capability has never been synced reads null and is " +
        "excluded, so this can happen even with several recommended models. " +
        "Enable a recommended model with structured-output support at " +
        "/admin/llm-models.",
    );
  }

  const matchedRow = findRowForModelId(rows, winningId);
  return {
    modelId: winningId,
    source: "recommended",
    ...pricingFromRow(matchedRow),
  };
}

/** Thin convenience wrapper. This is the signature the TDD plan pins; keep it. */
export async function resolveStructuredStageModel(
  explicitPin?: string | null,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<string> {
  const selection = await resolveStructuredStageModelSelection(
    explicitPin,
    dependencies,
  );
  return selection.modelId;
}

/* -------------------------------------------------------------------------- */
/* Availability re-check (consumed by sections 04, 05, 06)                    */
/* -------------------------------------------------------------------------- */

/**
 * Throws VideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: …") when
 * `modelId` is no longer an enabled, recommended, structured-output-capable
 * model. Never substitutes (AD-3).
 *
 * Sections 04/05/06 resolve the model ONCE at dispatch and carry the id in
 * the job payload, so the executor re-checks availability WITHOUT
 * re-resolving — an admin edit or a breaker revocation between dispatch and
 * execution must FAIL the job, not silently swap in a different model the
 * user never confirmed a price for.
 */
export async function assertStructuredStageModelAvailable(
  modelId: string,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
  options?: AssertStructuredStageModelOptions,
): Promise<void> {
  const deps = await resolveDeps(dependencies);
  const rows = await deps.loadRows();

  // An operator pin outranks the recommendation (§4.2 rule 1), so re-checking it
  // against `recommendedOnly` would make every explicitly-pinned model fail at
  // execution time even though dispatch accepted it — dispatch succeeds, the job
  // always dies. A pin is therefore only checked for still being ENABLED; only a
  // model that WAS resolved from the recommended set is re-checked against it.
  const requireRecommended = options?.source !== "explicit_pin";

  if (requireRecommended) {
    const candidates = deps.selectCandidates(
      VI_STRUCTURED_STAGE_REQUIREMENTS,
      rows,
      AVAILABILITY_RECHECK_MAX_CANDIDATES,
    );
    if (!candidates.includes(modelId)) {
      throw new VideoIntelligenceModelError(
        `VI_NO_RECOMMENDED_MODEL: model "${modelId}" is no longer an enabled, ` +
          "recommended, structured-output-capable model (revoked, disabled, " +
          "or edited since dispatch). Enable a recommended model with " +
          "structured-output support at /admin/llm-models.",
      );
    }
    return;
  }

  // Explicit pin: enabled-only. A disabled model still cannot be called.
  const enabled = rows.some(
    row => row.modelId === modelId || row.providerModelId === modelId,
  );
  if (!enabled) {
    throw new VideoIntelligenceModelError(
      `VI_NO_RECOMMENDED_MODEL: pinned model "${modelId}" is no longer an ` +
        "enabled model (disabled or removed since dispatch). Re-enable it, or " +
        "clear the pin to use an admin-recommended model, at /admin/llm-models.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Strike reporting (AD-4)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Record a model-quality strike for a structured-output contract failure.
 * Fire-and-forget: returns void synchronously, never throws, never blocks or
 * fails the caller's stage.
 *
 * ONLY for schema/contract failures (LLMStructuredOutputError). NEVER for
 * transport, provider, timeout, or credit errors — those are not the model's
 * fault and striking on them demotes good models.
 */
export function reportStructuredOutputViolation(
  args: {
    /** Prefer the SERVED model id (result.modelId) over the requested one. */
    modelId: string | null;
    traceId: string;
    zodIssuePaths: string[];
    /** Optional: identifies which stage produced the violation in the audit row. */
    stage?: string;
  },
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): void {
  try {
    void handleStructuredOutputViolation(args, dependencies).catch(() => {
      // Fire-and-forget: an unhandled rejection can never surface.
    });
  } catch {
    // Defensive: the whole body is wrapped so a throw — sync or async — is
    // swallowed. The caller's stage must be unaffected.
  }
}

async function handleStructuredOutputViolation(
  args: {
    modelId: string | null;
    traceId: string;
    zodIssuePaths: string[];
    stage?: string;
  },
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<void> {
  const deps = await resolveDeps(dependencies);
  const detail = args.zodIssuePaths.join(",").slice(0, MAX_ZOD_ISSUE_DETAIL_LENGTH);

  // section-08 §6.6: emitted for EVERY reported contract failure, revoked or
  // not — the numerator of the schema-failure-rate alert. Distinct from the
  // `recommended_model_revoked` emission below, which stays revocation-only.
  // ONE choke point: this call never moves into an adapter (sections 03/05/06).
  reportVideoIntelligenceSchemaFailure({
    stage: args.stage ?? "model_quality_breaker",
    modelId: args.modelId,
    traceId: args.traceId,
    issuePathCount: args.zodIssuePaths.length,
  });

  const result = await deps.recordStrike({
    modelId: args.modelId,
    runId: args.traceId,
    reason: "contract_violation",
    detail,
  });

  // Emit only on revoked === true — a recorded-but-not-revoked strike is
  // routine and must not generate alert noise. Never emit when recorded is
  // false (model not curated, or the min-pool floor protected it).
  if (result.revoked === true) {
    deps.logAudit({
      eventType: "video_project_stage",
      traceId: args.traceId,
      userId: null,
      metadata: {
        stage: args.stage ?? "model_quality_breaker",
        phase: "finish",
        event: "recommended_model_revoked",
        modelId: args.modelId,
        strikeCount: result.strikeCount,
        reason: "contract_violation",
      },
    });
  }
}
