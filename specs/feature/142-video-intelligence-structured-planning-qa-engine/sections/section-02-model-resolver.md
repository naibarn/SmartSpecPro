<!-- SECTION: section-02-model-resolver -->

# Section 02 — Structured-Output Model Resolver

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** — (none; fully parallelizable with section-01)
**Blocks:** section-03 (review adapter), section-04 (stage wiring + credits)
**Size:** 1 new service file (~150–200 lines) + 1 new test file
**Test command:** `cd apps/web && npx vitest run`
All paths are relative to `apps/web` unless stated otherwise.

---

## 1. Why this section exists

Every LLM-backed Video Intelligence stage (quality review, scene plan, quality
repair) needs **one** answer to "which model do I call?", and that answer must be:

1. **Admin-curated** — decision D2: use the existing
   `model_provider_map.isRecommended` system, not a new tier list.
2. **Structured-output capable** — the stated risk is weak models mangling nested
   JSON. Nothing in the existing recommended path filters on
   `supportsStructuredOutputs` today; this feature adds that requirement itself.
3. **Never silently degraded** — every upstream resolver in this repo returns
   `null` and lets the caller fall back to something arbitrary, which directly
   contradicts D2. Here the resolver **hard-fails** with
   `VI_NO_RECOMMENDED_MODEL` (AD-3), which is admin-actionable at
   `/admin/llm-models`.
4. **Self-correcting** — schema/contract failures feed the existing
   recommended-model circuit breaker, so a model that repeatedly returns garbage
   loses its recommendation.
5. **Observable on revocation** — the breaker emits only `console.warn` /
   `console.error`: no audit row, no metric. The resolver is therefore the
   **only** place an alert on auto-revocation can be keyed. Emitting that audit
   event is a deliverable of this section (section-08 only wires the alert that
   consumes it).

This section ships the module and its unit tests. It wires nothing into a router
— sections 03 and 04 consume it.

---

## 2. Existing code you must know (read before writing)

These already exist and **must not be modified** by this section.

### 2.1 `server/services/enabledLlmModels.ts`

```ts
export type EnabledLlmModelRow = {
  providerId: number;
  providerName: string;
  modelId: string;
  providerModelId: string;
  // …capability columns…
  supportsStructuredOutputs: boolean | null;
  contextLength: number | null;
  priority: number;
  /** Admin-curated quality flag (model_provider_map.isRecommended). */
  isRecommended?: boolean | null;
  isFree: boolean;
  pricingInput?: string | null;   // USD per 1M input tokens, numeric string
  pricingOutput?: string | null;  // USD per 1M output tokens, numeric string
};

export async function loadEnabledLlmModelRows(
  options?: { autoSelectionOnly?: boolean },
): Promise<EnabledLlmModelRow[]>;
```

`pricingInput` / `pricingOutput` are **USD per 1,000,000 tokens** as numeric
strings (`creditService.ts:1076` divides token counts by `1_000_000` before
multiplying). Do not re-interpret the unit.

### 2.2 `server/services/intelligentModelSelector.ts`

```ts
export function selectLlmModelCandidates(
  requirements: Partial<CapabilityRequirements>,
  rows: EnabledLlmModelRow[],
  maxCandidates: number = 5,
): string[];
```

Behaviour that matters:

- It internally calls `filterAutoSelectableLlmModelRows(rows)` first, so you do
  **not** need `{ autoSelectionOnly: true }` on the row load.
- Boolean requirements use AND logic and only `true` filters, so
  `supportsStructuredOutputs: true` genuinely excludes rows whose column is
  `false` **or** `null`.
- `recommendedOnly` is handled separately from `CAPABILITY_KEYS` — it is a mode,
  not a capability (the requirement key and the row column `isRecommended`
  deliberately differ).
- Results sort by `priority` ASC, truncated to `maxCandidates`.

It returns **model id strings**, not rows. That matters for §4.3.

### 2.3 `server/services/recommendedModelQualityBreaker.ts`

```ts
export const RECOMMENDED_MODEL_STRIKE_THRESHOLD = 6;
export const RECOMMENDED_MODEL_STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECOMMENDED_MODEL_MIN_POOL = 1;

export type RecommendedModelStrikeReason = "contract_violation" | "disqualified";

export async function recordRecommendedModelQualityStrike(input: {
  modelId: string | null | undefined;
  runId?: string | null;
  reason: RecommendedModelStrikeReason;
  detail?: string;
  now?: Date;
}): Promise<{ recorded: boolean; revoked: boolean; strikeCount: number }>;
```

Rules baked in (do not re-implement, do not fight):

- 6 strikes in a rolling 24 h window revoke `isRecommended`, **except** when the
  model is the last member of the recommended set (`MIN_POOL = 1`).
- **No automatic re-promotion** — re-recommending is a deliberate admin action.
- A strike is only legitimate for `contract_violation` (wrong shape / schema
  failure) and `disqualified` (valid JSON failing quality gates). Transport,
  provider and credit failures **never** strike — most failures are not the
  model's fault, and counting them unfairly demotes good models.
- It never throws; it returns `{ recorded: false, … }` on internal failure. You
  still guard the call (§4.4) because the contract you depend on is
  "fire-and-forget", not "the callee is perfect".

This section only ever uses `reason: "contract_violation"` (AD-4).

### 2.4 `server/services/auditLogger.ts`

`server/routers/videoProjects.ts:237-256` already establishes the Video
Intelligence stage-event shape and the `as AuditEventType` cast (the same pattern
`hyperframesRenderWorker.ts` uses), so this feature never edits the shared enum:

```ts
auditLogger.log({
  eventType: "video_project_stage" as AuditEventType,
  traceId,
  userId: null,
  metadata: { stage, projectId, phase, ...extra },
});
```

Reuse that exact event type and metadata shape so one alert query covers both the
router and the resolver.

### 2.5 `server/services/callLLMStructured.ts`

Referenced only for the error type section 03 consumes:

```ts
export class LLMStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly zodErrors?: z.ZodError,
    public readonly tokensUsed?: number,
    public readonly creditsUsed?: number,
  );
}
```

Section 03 turns `zodErrors.issues[].path` into the `zodIssuePaths: string[]`
this section's reporter accepts. **This section does not import
`callLLMStructured`** — keeping that import out is what keeps the resolver's test
graph narrow.

### 2.6 Reference call sites worth reading

- `marketplaceAutoReviewService.ts:3646-3665` — closest existing "top-priority
  recommended model" resolver. It degrades to `null`; this section deliberately
  does **not** (AD-3).
- `productReviewSequentialStoryboardSkillRunner.ts:2812-2822` — the existing
  `void recordRecommendedModelQualityStrike({ reason: "contract_violation",
  detail: reasons.join(",") })` shape to mirror.
- `marketplaceAutoReviewStoryArcPlanner.ts:1414` — the `"__automatic__"` sentinel
  check on a stored model pin.
- `videoIntelligenceJobs.ts:111-142` — the repo's optional
  `Partial<Dependencies>` + `resolveDeps()` injection convention used in §4.5.

---

## 3. Deliverables

| File | Status | Purpose |
|---|---|---|
| `server/services/videoIntelligenceModelResolver.ts` | **NEW** | The whole section |
| `server/services/__tests__/videoIntelligenceModelResolver.test.ts` | **NEW** | Tests, written first |

Nothing else changes: no router edit, no `_core/index.ts` edit, no schema change,
**no migration**.

---

## 4. Public API contract

All exported from `server/services/videoIntelligenceModelResolver.ts`.

### 4.1 Constants and error type

```ts
/** Sentinel the model pickers store when the user chose "automatic". */
export const AUTOMATIC_LLM_MODEL_VALUE = "__automatic__";

/** Capability floor for every VI structured-output stage. BOTH flags are
 *  required — `recommendedOnly` is D2, and `supportsStructuredOutputs` is the
 *  filter 142 adds because nothing in the existing recommended path checks it
 *  (AD-1). */
export const VI_STRUCTURED_STAGE_REQUIREMENTS: {
  recommendedOnly: true;
  supportsStructuredOutputs: true;
};

/** Typed carrier for this module's VI_* error codes. `message` is prefixed with
 *  `code` so a plain toThrow(/VI_NO_.../) works and the executor's existing
 *  `VI_*: message` string convention holds. */
export class VideoIntelligenceModelError extends Error {
  readonly code: "VI_NO_RECOMMENDED_MODEL";
}
```

`VI_NO_RECOMMENDED_MODEL` is a **new** error code (plan §10). Section 04 maps it
to `TRPCError({ code: "BAD_REQUEST" })` alongside the router's existing
`mapCompileError` branches — **do not import `TRPCError` here**; a service that
pulls in the tRPC layer poisons the narrow unit test.

### 4.2 Resolution

```ts
export type StructuredStageModelSource = "explicit_pin" | "recommended";

export type StructuredStageModelSelection = {
  /** The id to pass as callLLMStructured's `model` param (AD-2).
   *  `preferredProviderId` stays unset — it is an orthogonal provider pin. */
  modelId: string;
  source: StructuredStageModelSource;
  /** USD per 1M tokens, straight off the row this call already loaded. `null`
   *  when the row is absent (off-catalog explicit pin) or carries no price.
   *  Section 04's estimator consumes these. */
  pricingInputPerMTokUsd: number | null;
  pricingOutputPerMTokUsd: number | null;
  isFree: boolean;
};

/** Resolve the model for a structured-output stage, with the pricing basis the
 *  estimate query needs, in ONE row load.
 *  Order: explicit pin → recommended + structured-output candidate → throw.
 *  Never silently degrades to a non-recommended model (AD-3). */
export async function resolveStructuredStageModelSelection(
  explicitPin?: string | null,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<StructuredStageModelSelection>;

/** Thin convenience wrapper. This is the signature the TDD plan pins; keep it. */
export async function resolveStructuredStageModel(
  explicitPin?: string | null,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<string>;
```

**Behaviour, exactly:**

1. Trim `explicitPin`. If non-empty and **not** `AUTOMATIC_LLM_MODEL_VALUE`,
   return it **unchanged** with `source: "explicit_pin"`. Do **not** validate it
   against the recommended set — an operator who picked a model on purpose
   outranks auto-selection (recorded repo preference: never auto-switch a model
   picked in a UI picker). Enrich pricing from the loaded rows when one matches;
   otherwise leave pricing `null`, `isFree: false`, and **do not throw**.
2. Otherwise `loadEnabledLlmModelRows()` +
   `selectLlmModelCandidates(VI_STRUCTURED_STAGE_REQUIREMENTS, rows, 1)`; take
   `candidates[0]`.
3. No candidate → `throw new VideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: …")`
   with a message naming the admin action (enable a recommended model with
   structured-output support at `/admin/llm-models`). Never return `null`, never
   fall back to a non-recommended model, never widen the requirements and retry.
4. If `loadEnabledLlmModelRows()` rejects, **let it propagate** — a database
   outage is not "no recommended model" and must not be laundered into an
   admin-actionable error. (Contrast `marketplaceAutoReviewService.ts`, which
   swallows it because it has a legacy default; this module has none.)
5. Map the winning id back to its row for pricing (§4.3), return
   `source: "recommended"`.

**Row matching for pricing.** `selectLlmModelCandidates` returns ids, not rows.
Match back against `row.modelId`, then `row.providerModelId`, then
`legacyModelAliases`; take the first match in the already-priority-sorted order.
Parse pricing strictly — a non-finite or negative parse becomes `null`, **never
`0`**, because `0` means "free" downstream and silently under-quoting a price the
user clicks "confirm" on is exactly the failure this feature avoids. When
`row.isFree === true`, report `isFree: true` and pricing `0`.

### 4.3 Availability re-check (consumed by sections 04, 05, 06)

```ts
/** Throws VideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: …") when
 *  `modelId` is no longer an enabled, recommended, structured-output-capable
 *  model. Never substitutes (AD-3).
 *
 *  Why this exists separately from the resolver: sections 04/05/06 resolve the
 *  model ONCE at dispatch and carry the id in the job payload, so the executor
 *  must be able to re-check availability WITHOUT re-resolving — an admin edit or
 *  a breaker revocation between dispatch and execution must FAIL the job, not
 *  silently swap in a different model the user never confirmed a price for. */
export async function assertStructuredStageModelAvailable(
  modelId: string,
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): Promise<void>;
```

Behaviour: load rows, run the same
`selectLlmModelCandidates(VI_STRUCTURED_STAGE_REQUIREMENTS, rows, …)` query with
a larger `maxCandidates`, and assert `modelId` is among the results. Absent →
throw. A row-load failure propagates (same rule as §4.2 step 4). An explicitly
pinned model that was never in the recommended set is still checked against
**enabled** rows only — an operator pin outranks the recommendation, but a
disabled model cannot be called.

Tests (add to §5.1's list):

```ts
describe("assertStructuredStageModelAvailable", () => {
  it("resolves when the model is still enabled, recommended and structured-output capable");
  it("throws VI_NO_RECOMMENDED_MODEL when the model was revoked since dispatch");
  it("throws VI_NO_RECOMMENDED_MODEL when the model was disabled since dispatch");
  it("never substitutes a different model");
  it("propagates a row-load failure instead of reporting VI_NO_RECOMMENDED_MODEL");
});
```

### 4.4 Strike reporting

```ts
/** Record a model-quality strike for a structured-output contract failure.
 *  Fire-and-forget: returns void synchronously, never throws, never blocks or
 *  fails the caller's stage.
 *
 *  🔴 ONLY for schema/contract failures (LLMStructuredOutputError). NEVER for
 *  transport, provider, timeout, or credit errors — those are not the model's
 *  fault and striking on them demotes good models. */
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
): void;
```

**Behaviour, exactly:**

1. Build `detail` by joining `zodIssuePaths` with `","`, mirroring the existing
   call sites. Cap the joined string (~500 chars) so a pathological Zod error
   cannot bloat the strike row.
2. Call `recordRecommendedModelQualityStrike({ modelId, runId: traceId, reason:
   "contract_violation", detail })` without `await`, with `.catch(() => {})` so
   an unhandled rejection can never surface.
3. When the result has `revoked === true`, emit the audit event (§4.4).
4. Wrap the whole body so a throw — sync or async — is swallowed. The caller's
   stage must be unaffected.
5. `modelId` may legitimately be `null`. The breaker already no-ops on a blank
   id; do not add your own throw.

### 4.5 The revocation audit event (the A4 mechanism)

```ts
auditLogger.log({
  eventType: "video_project_stage" as AuditEventType,
  traceId,
  userId: null,
  metadata: {
    stage: stage ?? "model_quality_breaker",
    phase: "finish",
    event: "recommended_model_revoked",
    modelId,
    strikeCount,
    reason: "contract_violation",
  },
});
```

Rules:

- Emit **only** on `revoked === true`. A recorded-but-not-revoked strike is
  routine and must not generate alert noise.
- Never emit when `recorded === false` (model not curated, or the min-pool floor
  protected it).
- Never let a logger failure escape — same swallow-all guard.

Section-08 keys its alert on `eventType = "video_project_stage"` with
`metadata.event = "recommended_model_revoked"`. That is the entire contract
between the two sections; do not rename those strings without updating the plan.

### 4.6 Dependency injection (test seam)

Follow `videoIntelligenceJobs.ts:111-142`: an exported dependency interface, an
optional trailing `Partial<…>` argument, and a private `resolveDeps()`.

```ts
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
```

The **defaults must use lazy `await import(...)` inside the default function
bodies** (AD-8), not top-of-file static imports, for `enabledLlmModels`,
`intelligentModelSelector` and `recommendedModelQualityBreaker`. This is the
established convention that keeps heavy provider/router transitive imports out of
narrow `vi.mock` graphs. `EnabledLlmModelRow` may be imported statically as a
**type-only** import, which erases at compile time.

`logAudit`'s default is a thin wrapper over `auditLogger.log` applying the
`as AuditEventType` cast, so the injected double in tests is a plain `vi.fn()`
with no audit module in the graph.

---

## 5. TDD — write these first

**File:** `server/services/__tests__/videoIntelligenceModelResolver.test.ts`

**Conventions (non-negotiable):** Vitest, node environment. **Pure-service style:
injected doubles, zero `vi.mock` module mocks** — pass the `dependencies`
argument; that is why §4.5 exists. Use `mockResolvedValue` / `mockReturnValue`
(persistent), **not** `…Once` — this repo has a recorded failure class where a
leaked `…Once` queue produced misleading failures in unrelated tests. Record the
pre-existing failing-set **identity** before starting and compare identity, not
counts.

```ts
function makeRow(overrides?: Partial<EnabledLlmModelRow>): EnabledLlmModelRow;
function makeDeps(overrides?: Partial<VideoIntelligenceModelResolverDeps>):
  Partial<VideoIntelligenceModelResolverDeps>;

describe("resolveStructuredStageModel", () => {
  it("returns an explicit pin unchanged");
  it("does not load enabled rows to satisfy an explicit pin's model id");
  it("ignores the '__automatic__' sentinel and resolves from the recommended set");
  it("requires BOTH recommendedOnly and supportsStructuredOutputs in the candidate query");
  it("throws VI_NO_RECOMMENDED_MODEL when no candidate exists — never degrades silently");
  it("propagates a row-load failure instead of reporting VI_NO_RECOMMENDED_MODEL");
});

describe("resolveStructuredStageModelSelection", () => {
  it("returns the winning candidate's pricing per 1M tokens from the row it loaded");
  it("reports null pricing (not 0) when the row carries no parsable price");
  it("returns null pricing for an off-catalog explicit pin without throwing");
  it("marks a free row isFree with zero pricing");
});

describe("reportStructuredOutputViolation", () => {
  it("records a contract_violation strike carrying the zod issue paths");
  it("passes the traceId as the breaker's runId");
  it("never throws, even when the breaker rejects");            // fire-and-forget
  it("never throws when the breaker throws synchronously");
  it("emits a stage audit event when the breaker reports revoked: true");
  it("emits NO audit event when the strike is recorded but not revoked");
  it("emits NO audit event when the strike was not recorded at all");
});
```

### Assertion notes

- **"requires BOTH …"** — assert on the *first argument* passed to
  `selectCandidates`: it must contain `recommendedOnly: true` **and**
  `supportsStructuredOutputs: true`. Asserting only the returned id would pass
  vacuously against a resolver that filtered on neither. Also assert
  `maxCandidates === 1`.
- **"throws VI_NO_RECOMMENDED_MODEL"** — assert the thrown value's `code` *and*
  that the message contains the code string. Also assert no fallback query was
  attempted (`selectCandidates` called exactly once) — the point of AD-3 is that
  there is no second, looser attempt.
- **"never throws, even when the breaker rejects"** — have `recordStrike` return
  a rejected promise; assert the function returns `undefined` and no unhandled
  rejection is raised. Because it is fire-and-forget, use `await vi.waitFor(...)`
  (or flush microtasks) before asserting on the audit double; do not add a
  test-only flush export to production code.
- **"emits a stage audit event …"** — assert `eventType === "video_project_stage"`,
  `metadata.event === "recommended_model_revoked"`, and that `metadata.modelId` /
  `metadata.strikeCount` carry through. Those three strings are the section-08
  alert contract.
- **"does not load enabled rows …"** — the pin path may still load rows for
  *pricing enrichment* in `…Selection`; scope this assertion to the string
  wrapper, which must answer without any DB dependency. If your implementation
  shares one code path, relax it to "returns the pin even when `loadRows`
  rejects".

---

## 6. Interfaces consumed by later sections

| Consumer | What it uses | How |
|---|---|---|
| **section-03** | `reportStructuredOutputViolation` | Called on `LLMStructuredOutputError` **before** rethrowing, with `zodIssuePaths` from `error.zodErrors?.issues.map(i => i.path.join("."))` and the served `result.modelId` when available. Never on transport/provider/credit errors. |
| **section-04** | `resolveStructuredStageModelSelection` | Called **once, at dispatch**. `modelId` is carried in the job payload's free-form `input` so the executor never re-resolves — otherwise an admin edit or breaker revocation between dispatch and execution means the user confirmed a price for one model and is billed for another. |
| **section-04** | `pricingInputPerMTokUsd` / `pricingOutputPerMTokUsd` / `isFree` | The `perRound` cost basis. **Nothing in the codebase computes `perRound`** — deriving it from these against a token estimate from real document size is section 04's work. Never a magic constant. When both are `null`, section 04 falls back to `calculateCreditsForLLMDynamic()`. |
| **section-04** | `VideoIntelligenceModelError` | Mapped to `TRPCError({ code: "BAD_REQUEST", message: \`${code}: ${message}\` })`, mirroring `mapCompileError` at `videoProjects.ts:262-270`. If the carried model is unavailable at execution time the job **fails** rather than substituting (AD-3). |
| **section-08** | The revocation audit event | Alert on `eventType = "video_project_stage"` AND `metadata.event = "recommended_model_revoked"`. |

---

## 7. Explicit non-goals / do-nots

- ❌ **Do not use `resolveQualityLargeContextModelId()`.** Its 1M-context +
  `supportsThinking` + non-free floor is tuned for long Vertical Drama scripts;
  142's documents are small and that floor needlessly narrows the pool to a few
  expensive models. (AD-1)
- ❌ **Do not set `preferredProviderId`.** The resolved id goes in the `model`
  param only. (AD-2)
- ❌ **Do not return `null` or fall back to a non-recommended model.** (AD-3)
- ❌ **Do not strike on transport, provider, timeout, rate-limit or credit
  errors.** Only `LLMStructuredOutputError` → `contract_violation`. (AD-4)
- ❌ **Do not modify `recommendedModelQualityBreaker.ts`.** Consume its existing
  `{ recorded, revoked, strikeCount }` return contract.
- ❌ **Do not modify `AuditEventType`.** Use the established cast.
- ❌ **Do not cache the resolution.** Read fresh every call so a revocation or an
  admin edit takes effect immediately instead of riding a cache to the end of a
  run.
- ❌ **Do not add a DB write, schema field, or migration.** This module is
  read-only against the model catalog; the only write is the breaker's own.
- ❌ **Do not import `TRPCError`, `callLLMStructured`, or any router module.**

---

## 8. Verification / exit criteria

1. `cd apps/web && npx vitest run server/services/__tests__/videoIntelligenceModelResolver.test.ts` — green.
2. Wider suite fail-set **identity** unchanged versus the recorded baseline.
3. `pnpm check` introduces no new type error attributable to the new file
   (identity, not count — the repo's `tsc` baseline is large).
4. With an empty recommended set, the resolver throws `VI_NO_RECOMMENDED_MODEL`
   and the message names `/admin/llm-models` as the fix.
5. A simulated `revoked: true` strike produces exactly one `video_project_stage`
   audit entry with `metadata.event = "recommended_model_revoked"`.

---

## 9. Risk notes for the implementer

- **R15 — recommended pool empty or all-revoked.** `MIN_POOL = 1` guarantees
  auto-revocation never empties the set, but an admin *can* empty it manually.
  That is exactly the case `VI_NO_RECOMMENDED_MODEL` exists to make loud and
  admin-actionable instead of dead-and-silent.
- **`supportsStructuredOutputs` is nullable.** A model whose capability has never
  been synced reads `null` and is therefore excluded — a freshly seeded catalog
  can legitimately produce an empty candidate set even with several recommended
  models. Say so in the thrown message; an admin chasing "but I have recommended
  models!" needs that sentence.
- **Pricing strings can be `"0"` for genuinely free models and `null` for
  unpriced rows.** Conflating them makes section 04 quote 0 credits for a paid
  model. Keep `null` and `0` distinct all the way through the return type.
- **Fire-and-forget means fire-and-forget.** The most likely way this module
  breaks production is a strike report that throws inside a stage's catch block
  and masks the real error. The swallow-all guard is not optional.
