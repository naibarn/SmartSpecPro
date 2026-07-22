# Section 12 — Observability + GA-Gate Plumbing

- **Section id:** `section-12-observability-gate`
- **Feature:** 136 — Marketplace Auto Review: Sequential Shot Storyboard
- **Sources:** `../claude-plan.md` WS-12, `../claude-plan-tdd.md` WS-12, `../spec.md` v1.3.0 §25 (authoritative), §26 Phase 5 GA gate, §11.4/§11.5 + §17 (gate fixtures), `../claude-interview.md` Q2/Q3
- **Depends on:** `section-06-sequential-pipeline` (metrics *ingredients*: `frameStrategy` tag + per-unit outcomes on `imageAttemptReviews[]`), `section-07-evidence-guard-shared` (guardian/assembly reason codes + guard snapshot). Reads-only from `section-02` (`trimmedAngles`), `section-04` (`emitAudit` effect seam, over-budget wrapper, degraded fallback), `section-05` (`metadataJson.sequentialStoryboard.*`)
- **Blocks:** nothing (terminal); parallelizable with `section-09-full-video` and `section-11-ui`
- **Milestones:** M2 (events + metrics recorder — must land early per interview Q2 so a baseline exists by pilot), M3 (guard occurrences), M5 (real-LLM gate + GA runbook)
- **Test command:** `npm --prefix apps/web run test -- <files>` (Vitest, config root `apps/web`)

---

## 1. Objective

Make the new mode *measurable* and make the §26 Phase-5 GA decision *evidence-based*:

1. **Named audit events** for the sequential pipeline: loop rounds, degraded fallback, prompt-over-budget rewrites (with `promptKind`), reference-angle trims, and guardian/assembly guard occurrences (shot id only, never image content).
2. **Per-mode comparison metrics recorder** that runs for **BOTH** `storyboard_3x3_split` and `sequential_shot_storyboard` runs, aggregating `imageAttemptReviews[]` into raw counters + explicit denominators, persisted where the pilot review can query them.
3. **Real-LLM gate**: two CI-tagged/manual fixtures (children's desk chair with 4 angles + adult reference; furniture with NO assembly documentation) plus a *pure* evaluator that is unit-tested offline against recorded packs.
4. **GA runbook**: the queries + decision record the Phase-5 review uses to pin thresholds.

**Hard invariant (interview Q2):** this section ships **no numeric GA threshold**. TS records facts (counts, denominators, rates); the pass/fail numbers are pinned by humans at the pilot review. Any `MIN_UPLIFT`-style constant or `gatePassed: boolean` on the metrics type is a review-blocking defect.

**Second invariant:** observability never changes behavior. No prompt byte, no verdict, no acceptance decision may depend on anything in this section. Every emit path is `try/catch`-wrapped and never throws. The WS-1 snapshot suite stays byte-identical.

---

## 2. Background — verified anchors

Line numbers verified 2026-07-21; **locate by symbol, treat lines as hints** (SVC is ~27k lines and edited by concurrent sessions).

| Symbol / file | Observed | Role in this section |
|---|---|---|
| `apps/web/server/services/auditLogger.ts` — `AuditEventType` union | `:18-195` | New event names MUST be added here or `auditLogger.log({eventType})` is a TS error |
| `auditLogger.log(entry: Partial<AuditLogEntry>)` | `:393` | Non-blocking, buffered JSONL writer. **`if (!this.initialized) return;` (`:394`) — in Vitest the logger is never initialized, so tests MUST `vi.mock("../auditLogger")` to observe calls** |
| `AuditLogEntry` | `:197-241` | Fields we use: `traceId`, `eventType`, `userId`, `tenantId`, `statusCode`, `metadata`. Payloads > 32 KB are replaced with `[PAYLOAD_EXCEEDED_32KB]` (`:423-427`) — keep payloads compact |
| `sanitizePayload` / `SENSITIVE_KEYS` | `:247-335` | Redacts keys/tokens only — it does **NOT** strip URLs or prompt text. This section adds its own sanitizer |
| `recordVerticalDramaSystemFailureAuditEvent` | `routers/verticalDramaSeries.ts:3039-3083` | **Dual-write precedent**: `api_audit_events` row + `auditLogger.log()` JSONL line, each in its own try/catch, never throws |
| `apiAuditEvents` table | `drizzle/schema.ts:1190-1224` | `traceId varchar(32) NOT NULL`, `eventType varchar(64)`, `metadata json`. **The SVC-style trace ids (`marketplace-auto-review-image:<runId>:<unitId>:<n>`) are longer than 32 chars — a raw copy would fail the insert** |
| `auditLogger.log({eventType: "rollout_gate", metadata:{action, …}})` | `routers/verticalDramaProvider.ts:622-640` | Precedent for policy/gate events |
| `appendImageAttemptReview` | SVC:7225-7383 | Produces `metadata.imageAttemptReviews[]` entries: `{attempt, status, unitIds, unitRoles, reasonCodes, qualityScore, negativeScore, scoreBreakdown, selectionBlockers, repairRefs, …}` — **the metrics recorder's only required input** |
| `buildImageAttemptScoreBreakdown` | SVC:6885 | Source of `qualityScore` (spec §25 "average qualityScore") |
| `imageReasonCodeBlocksPublishSafety` / `…ContainPublishSafetyBlocker` | SVC:1640-1651 | Publish-block counting predicate (section-07 adds `guardian_presence_missing`) |
| `persistMarketplaceAutoReviewStageAttemptSnapshot` | SVC:16425-16517 | Writes `marketplace_auto_review_stage_attempts.evidenceJson` (`{schemaVersion: 1, providerReconciliationId, repairLedgerId, qaArtifactManifestId}`) — duplicated verbatim in the insert and the `onConflictDoUpdate.set` |
| `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` | SVC:1535-1587 | Today the string `final_image_prompt_over_provider_budget` is only an `audit.reason` field on the returned record (`:1571`) — **it is never emitted to the JSONL log**. This section emits it |
| Degraded fallback warning `storyboard_prompt_degraded_fallback` | SVC:9512 + `console.warn` `:9515` | Grid precedent; sequential mirror is `sequential_prompt_degraded_fallback` (section-04 §5.10) |
| `getDb()` | `server/db.ts` (SVC imports at `:4`) | Used only inside the DB dual-write helper |
| `vitest.config.ts` `include` | `apps/web/vitest.config.ts:37-46` | `server/**/*.test.ts` and `scripts/**/*.test.ts` all run by default — the live gate suite must self-skip via env, not via config edits |
| `server/services/__fixtures__/export-degradation/*.json` | — | Existing fixture-directory convention for service tests |
| `scripts/__tests__/hyperframes-production-rollout-gate.test.ts` | — | Precedent for "gate report artifact + assertion test" |

Inputs produced by upstream sections (read here, never re-derived):

- `metadata.imageAttemptReviews[]` — each entry tagged with `frameStrategy` (section-06 §5.10, both modes) and, for sequential, `unitOutcomes[]` = `{unitId, verdict, reasonCodes, repairAttempts, qualityScore}`.
- `metadata.evidenceGuard.enabled` (section-07 §3.1 snapshot).
- `metadata.sequentialStoryboard.{loopReport, shots, referenceManifest, childSubjectPolicy, finalQc}` (sections 04/05).
- `SequentialReferenceAttachmentPlan.trimmedAngles` / `attachedAngleCount` / `modelCap` (section-02).
- Loop-effect seam `SequentialStoryboardLoopEffects.emitAudit(event, payload)` (section-04 §5.5) — this section supplies the production implementation.

---

## 3. Scope boundaries

**In scope:** the event catalog + emitter module, the `AuditEventType` additions, the mode-comparison metrics recorder/aggregator and its two persistence surfaces, the emit wiring at the sites listed in §5.5, the real-LLM gate (fixtures + pure evaluator + self-skipping live suite), and the GA runbook doc.

**Out of scope (owned elsewhere; do not re-implement):**

- Producing the metric *ingredients* (`frameStrategy` tag, per-unit outcomes, `qualityScore`) — **section-06 §5.10**.
- Guardian/assembly reason codes, the fail-closed normalizer, the publish-block set, preflight blocker ids — **section-07**.
- The loop itself, round scoring, degraded-fallback construction, the optimizer call — **section-04** (this section only listens on its `emitAudit` seam).
- The resolver and trim computation — **section-02**.
- UI rendering of the loop report / evidence panel — **section-11**.
- Any new DB table, column, or migration. Everything persists into existing JSONB (`metadataJson`, `evidenceJson`) or `api_audit_events`. Database Safety Protocol: **no DDL, Low risk**.
- Numeric GA thresholds and the enablement decision itself (human, Phase 5).

---

## 4. Tests first (write these before any implementation)

Two new test files. Neither needs a database or a live provider.

**File A — `apps/web/server/services/__tests__/marketplaceAutoReview.observability.test.ts`**
Mocks: `vi.mock("../auditLogger", …)` (mandatory — see §2), `vi.mock("../db", …)` for the dual-write test only. All other assertions run against pure exports.

**File B — `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialRealLlmGate.test.ts`**
Wrapped in `describe.skipIf(!isSequentialRealLlmGateEnabled())` — skipped in every normal CI run.

Shared fixture helpers (stubs; implementer fills the bodies):

```ts
/** imageAttemptReviews[] for a 3x3 run: N attempt waves, one grid unit each. */
function buildGridAttemptReviewFixtures(spec: {
  attempts: Array<{ status: string; reasonCodes?: string[]; qualityScore?: number }>;
}): Record<string, unknown>[];

/** imageAttemptReviews[] for a sequential run: attempt waves carrying unitOutcomes[] for 9 units. */
function buildSequentialAttemptReviewFixtures(spec: {
  units: Array<{ unitId: string; verdict: string; reasonCodes?: string[]; repairAttempts?: number; qualityScore?: number }>;
}): Record<string, unknown>[];

/** A spec-§19.2 sequential pack used by the gate evaluator tests (9 shots, valid by default). */
function buildGatePackFixture(overrides?: DeepPartial<SequentialStoryboardPack>): SequentialStoryboardPack;
```

### T1 — event-name contract is frozen

- `MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS` contains exactly the seven §5.1 names, and the runtime list equals the exported type's members.
- Every name is assignable to `AuditEventType` (compile-time `satisfies readonly AuditEventType[]`, plus a runtime length assertion so a rename fails loudly).
- Every name is ≤ 64 chars (`api_audit_events.eventType` limit).

### T2 — emitter behavior

- `emitMarketplaceAutoReviewAuditEvent({event, context, metadata})` calls `auditLogger.log` **once** with `{eventType, traceId, userId, tenantId, metadata}`.
- `traceId` is deterministic for the same `(runId, event, key)` and is exactly 32 chars (joinable with `api_audit_events.traceId`).
- When the mocked logger throws, the emitter **returns normally** (never propagates); assert no rejection and that a `console.warn` was emitted.
- Absent `userId`/`tenantId` ⇒ `null`, never `undefined` keys that break the entry shape.

### T3 — payload sanitizer (secret/PII rules)

`sanitizeMarketplaceAutoReviewAuditMetadata(input)`:

- Drops/redacts URL-bearing and content-bearing keys (`url`, `resultUrl`, `referenceImageUrls`, `imageUrl`, `thumbnailUrl`, `prompt`, `promptText`, `dialogue`, `*base64*`), replacing each with `{ …Hash, …LengthChars }` or removing it; assert no `http` substring survives anywhere in the serialized output.
- **Keeps** the identifiers the metrics need: `runId`, `shotId`, `unitId`, `angleLabel`, `role`, `code`, counts, lengths, scores.
- Truncates any surviving string to a bounded length and caps arrays (assert a 500-element input array is capped) so entries stay under the 32 KB audit cap.
- Never emits `email`/user PII (only `userId`).

### T4 — loop-round event payload

`buildSequentialSkillPlanRoundEventPayload(...)` produces `{runId, frameStrategy, round, model, totalScore, scores{8 dimensions}, candidateCount, retained, disqualifiers[], durationMs, degraded:false}`; missing/NaN dimensions are omitted (never coerced to 0); `candidateCount` capped at the skill config ceiling (3).

### T5 — degraded fallback event

- Emitted exactly once for a run with `{reason, roundsAttempted, retryHistorySummary:[{round, errorClass}], promptCount: 9}`; `retryHistorySummary` carries **error classes only, never raw model output**.
- The grid path's existing warning string `storyboard_prompt_degraded_fallback` (SVC:9512) is unchanged — assert it still appears in the grid preflight warnings array.

### T6 — prompt-over-budget rewrite events

- Image over budget ⇒ `final_image_prompt_over_provider_budget` with `promptKind: "sequential_image"`; video ⇒ `final_video_prompt_over_provider_budget` with `"sequential_video"`; the existing 3x3 optimizer path ⇒ `promptKind: "grid_image"`.
- Payload contains `sourceLengthChars`, `optimizedLengthChars`, `maxOutputChars`, `rewriteAttempt`, `stillOverBudget`, `promptHash` — and **no prompt text** (assert the serialized payload does not contain a fixture sentence planted in the prompt).

### T7 — angle-trim event + once-per-run dedupe

- `sequential_reference_angles_trimmed` payload = `{runId, modelCap, attachedAngleCount, trimmedAngles:[{ref, angleLabel}], reservedRoles[]}`; `ref` is the opaque asset ref, never a URL.
- `claimMarketplaceAutoReviewAuditEventKey(observability, key)` returns the next observability state on first call and `null` on a repeat of the same key (so 9 units + repairs emit ONE trim event, and a resumed run does not re-emit).
- A **different** trim signature (different model cap) produces a different key and does emit.
- The stored key list is bounded (oldest dropped past the cap) — assert length ≤ cap after 300 claims.

### T8 — evidence-guard occurrence events

- One `marketplace_review_evidence_guard_occurrence` per `(code, shotId)` with `{runId, frameStrategy, code, shotId|unitId, stage: "qa"|"preflight", repairAttempt, guardEnabled: true}`.
- Only the four enumerated codes are accepted (`guardian_presence_missing`, `guardian_directive_missing`, `assembly_content_unverified`, `assembly_demo_unverified`); an unknown code is ignored (no throw, no emit).
- Nothing is emitted when `evidenceGuard.enabled !== true`.
- Payload contains no image URL/base64 (re-assert via the sanitizer on a hostile fixture).

### T9 — metrics aggregator, BOTH modes

`buildMarketplaceAutoReviewModeMetrics(input)`:

- **Sequential fixture** (9 units; 2 units carrying `product_reference_mismatch`, 1 carrying `storyboard_continuity_mismatch`, 3 repair attempts total, one `guardian_presence_missing`) ⇒ `evaluatedUnits: 9`, `frameEquivalents: 9`, the exact `reasonCodeCounts`, `repairAttemptCount: 3`, `publishSafetyBlockCount: 1`, `meanQualityScore` = mean of present scores.
- **3x3 fixture** (3 attempt waves, one grid unit each) ⇒ `evaluatedUnits: 3`, `frameEquivalents: 27` (a grid artifact covers 9 cells), rates computed against the **declared** denominators.
- Denominators are explicit fields on the output; no rate is reported without its numerator and denominator also present.
- Zero reviews ⇒ every rate is `null` (never `NaN`, never `0`), counters `0`.
- Entries with missing `qualityScore` are excluded from the mean (not counted as 0).
- `frameStrategy` falls back to the run's strategy when an older review entry lacks the tag.
- Legacy/start_stop runs aggregate without throwing.

### T10 — persistence surfaces

- `applyMarketplaceAutoReviewModeMetricsToMetadata(metadata, metrics)` writes `metadataJson.observability = {metricsVersion, modeMetrics, emittedEventKeys}` and **preserves** any pre-existing `emittedEventKeys` and every unrelated metadata key (deep-equality on the rest).
- The stage-attempt evidence builder returns `evidenceJson` **byte-identical to today** when there are no image attempt reviews, and adds only a compact `modeMetrics` object when there are (assert the three existing ids and `schemaVersion: 1` are unchanged in both cases).
- DB dual-write (`vi.mock("../db")`): guard-occurrence and mode-metrics events insert exactly one `api_audit_events` row with `statusCode: 200`, `traceId.length === 32`, `eventType.length <= 64`; an insert rejection is swallowed (no unhandled rejection, JSONL line still written).

### T11 — no-threshold guard (review tripwire)

- The exported metrics type has no `passed`/`gatePassed`/`meetsGaGate` field, and the module exports no identifier matching `/THRESHOLD|MIN_UPLIFT|GA_TARGET/`.
- Read the module source from disk in the test (the section-04 grep-guard precedent) and assert no numeric comparison against a rate literal (`/(mismatchRate|qualityScore)\s*[<>]=?\s*\d/`).

### T12 — real-LLM gate evaluator (offline, deterministic)

`evaluateSequentialRealLlmGate(pack, expectations)`:

- Clean 9-shot pack + child expectations ⇒ `{passed: true, failures: []}`.
- Minor frame without guardian ⇒ failure `guardian_missing_in_minor_frame` naming the shot ids.
- 8 shots ⇒ `shot_count_invalid`; a shot whose `video_prompt` lacks the global-block marker ⇒ `global_block_missing` with shot id.
- Price token in dialogue or prompt (Thai `฿199`, `ลด 50%`) ⇒ `price_token_present`.
- Image prompt over the effective budget / video prompt > 2000 ⇒ `prompt_over_budget` with the offending shot + kind.
- Undocumented-assembly fixture: any shot with `demonstration_type: "assembly_demo"` or assembly tokens while `assembly_documented === false` ⇒ `assembly_content_present`; the same pack pivoted to `benefit_narration`/`problem_solution` ⇒ passes and reports `pivotBeats` > 0.
- The report is JSON-serializable and contains **no prompt text** — only ids, codes, counts, lengths.

### T13 — live gate is opt-in

- `isSequentialRealLlmGateEnabled()` is `false` when `MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE` is unset and `true` for `"1"`.
- File B's `describe` is skipped under the default env (assert via the helper, not by running the suite).

### Tripwire (every section touching SVC re-runs this)

- `server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` (WS-1) byte-identical, plus the full existing `marketplaceAutoReviewService.test.ts` suite — proof that adding `metadataJson.observability` to 3x3 runs breaks no existing metadata assertion.

---

## 5. Implementation guidance

### 5.1 Event catalog (frozen — renames require updating §5.5, the GA runbook, and T1)

| Event name | When | Key payload fields | Surfaces |
|---|---|---|---|
| `sequential_skill_plan_round` | after each persisted loop round (§16.4) | `round`, `model`, `scores{8}`, `totalScore`, `candidateCount`, `retained`, `disqualifiers[]`, `durationMs` | JSONL |
| `sequential_prompt_degraded_fallback` | runner falls back to deterministic prompts (§9.5) | `reason`, `roundsAttempted`, `retryHistorySummary[]`, `promptCount` | JSONL |
| `final_image_prompt_over_provider_budget` | optimizer rewrote an over-budget image prompt | `promptKind`, `sourceLengthChars`, `optimizedLengthChars`, `maxOutputChars`, `rewriteAttempt`, `stillOverBudget`, `promptHash`, `unitId?` | JSONL |
| `final_video_prompt_over_provider_budget` | same for video prompts | same + `shotId` | JSONL |
| `sequential_reference_angles_trimmed` | capacity trim in the resolver plan (§8, §23.2) | `modelCap`, `attachedAngleCount`, `trimmedAngles[{ref, angleLabel}]`, `reservedRoles[]` | JSONL, once per run per signature |
| `marketplace_review_evidence_guard_occurrence` | guardian/assembly code fires in QA or preflight (both modes) | `code`, `shotId`/`unitId`, `stage`, `repairAttempt`, `guardEnabled` | JSONL **+ `api_audit_events`** |
| `marketplace_review_mode_metrics` | image stage closes (accept or hard block) and at run completion | the full `MarketplaceAutoReviewModeMetrics` object | JSONL **+ `api_audit_events`** |

Every payload additionally carries the context envelope `{runId, tenantId, productId, frameStrategy, stageKey}`.

### 5.2 New module — `apps/web/server/services/marketplaceAutoReviewObservability.ts`

Kept **out of** SVC deliberately: SVC is 27k lines with concurrent editors, and the aggregator must be importable by tests without dragging the service graph. It imports only `auditLogger`, `getDb`, `drizzle/schema` (for the dual-write), and node `crypto`.

```ts
export const MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS = [ /* §5.1 names */ ] as const;
export type MarketplaceAutoReviewAuditEventName =
  (typeof MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS)[number];

export type MarketplaceAutoReviewAuditContext = {
  runId: string;
  tenantId?: string | null;
  userId?: number | null;
  productId?: string | null;
  frameStrategy: "storyboard_3x3_split" | "video_shot_start_stop" | "sequential_shot_storyboard";
  stageKey?: string | null;
};

/** sha256(runId|event|key).slice(0,32) — SAME id used for the JSONL line and the
 *  api_audit_events row so the two surfaces join. MUST be 32 chars (varchar(32)). */
export function buildMarketplaceAutoReviewAuditTraceId(
  context: MarketplaceAutoReviewAuditContext,
  event: MarketplaceAutoReviewAuditEventName,
  key?: string,
): string;

/** Drops URLs/prompt text/base64, hashes what it drops, truncates strings, caps arrays. */
export function sanitizeMarketplaceAutoReviewAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown>;

/** JSONL only. Sync. NEVER throws (try/catch + console.warn). */
export function emitMarketplaceAutoReviewAuditEvent(params: {
  event: MarketplaceAutoReviewAuditEventName;
  context: MarketplaceAutoReviewAuditContext;
  metadata: Record<string, unknown>;
  dedupeKey?: string;
}): void;

/** api_audit_events dual-write for the two safety/GA-relevant events.
 *  Best-effort; awaited but never rethrows. */
export async function recordMarketplaceAutoReviewAuditEventRow(params: {
  event: "marketplace_review_evidence_guard_occurrence" | "marketplace_review_mode_metrics";
  context: MarketplaceAutoReviewAuditContext;
  metadata: Record<string, unknown>;
  traceId: string;
}): Promise<void>;

export type MarketplaceAutoReviewObservabilityState = {
  metricsVersion: 1;
  emittedEventKeys: string[];          // bounded (cap 200, FIFO drop)
  modeMetrics?: MarketplaceAutoReviewModeMetrics;
};

/** PURE. null ⇒ already emitted (skip). Non-null ⇒ emit, then persist the returned state. */
export function claimMarketplaceAutoReviewAuditEventKey(
  state: MarketplaceAutoReviewObservabilityState | undefined,
  dedupeKey: string,
): MarketplaceAutoReviewObservabilityState | null;

/** Production implementation of section-04's SequentialStoryboardLoopEffects.emitAudit. */
export function buildSequentialLoopAuditEffect(
  context: MarketplaceAutoReviewAuditContext,
): (event: string, payload: Record<string, unknown>) => void;
```

Also export `…ForTest` aliases for the pure helpers per SVC convention.

### 5.3 `AuditEventType` additions

Append the seven names to the union in `apps/web/server/services/auditLogger.ts:18-195` (additive only; keep alphabetical grouping loose like the existing VD/hermes blocks). This is the *only* edit to that file.

### 5.4 Payload safety rules (CLAUDE.md secret/PII rules apply verbatim)

- **Never** log prompt text, dialogue text, image URLs (signed query strings leak credentials), base64 content, or model raw output. Log `promptHash` + `promptLengthChars` instead.
- Log `userId`, never email. Log `shotId`/`unitId`, never frame content — this is the explicit spec §25 wording for guardian occurrences.
- Keep entries well under 32 KB: the mode-metrics payload is counters only (no per-attempt arrays), the trim payload lists at most the trimmed angles.
- All payloads go through `sanitizeMarketplaceAutoReviewAuditMetadata` *inside* the emitter, so a careless call site cannot leak.

### 5.5 Emit wiring (thin call sites; each is 3–6 lines)

| Event | Call site | Notes |
|---|---|---|
| `sequential_skill_plan_round` | section-04 loop, immediately **after** `persistRoundReport` succeeds, via `effects.emitAudit` | dedupe key `round:<n>` ⇒ resumed runs never double-emit |
| `sequential_prompt_degraded_fallback` | section-04 degraded path + the SVC degraded-assembly helper | dedupe key `degraded_fallback` |
| `final_image_prompt_over_provider_budget` | section-04's over-budget wrapper (sibling of SVC:1535) after the optimizer returns | also fires for the existing 3x3 optimizer with `promptKind: "grid_image"` — logging only, no prompt bytes change, snapshots unaffected |
| `final_video_prompt_over_provider_budget` | same wrapper, video branch | |
| `sequential_reference_angles_trimmed` | SVC, first consumer of `resolveSequentialReferenceAttachmentPlan` in the run (section-05 `referenceCapacity` persistence; section-06 submit is the fallback site) | dedupe key `angles_trimmed:<modelCap>:<trimmed refs joined>` |
| `marketplace_review_evidence_guard_occurrence` | (a) where the per-frame/grid QA verdict is folded into unit reason codes (section-07 §3.5 consumers); (b) the preflight blocker path for `guardian_directive_missing` / `assembly_demo_unverified` | dedupe key `guard:<code>:<shotId>:<repairAttempt>` |
| `marketplace_review_mode_metrics` | the image-stage accept / hard-block decision point (SVC:20190-20310 region) and run completion — **both modes, independent of both feature flags** | dedupe key `mode_metrics:<stageStatus>` |

Every call site: compute → `claim…EventKey` (when deduped) → `emit…` → persist `metadata.observability` with the existing metadata writer. No new persistence path.

### 5.6 Mode-comparison metrics recorder (facts only)

```ts
export type MarketplaceAutoReviewModeMetrics = {
  metricsVersion: 1;
  runId: string;
  frameStrategy: string;
  evidenceGuardEnabled: boolean;
  qualityMode?: string | null;

  // denominators — always reported alongside every rate
  evaluatedUnits: number;        // sequential: QA-evaluated units (≤9); 3x3: attempt waves; start_stop: units
  frameEquivalents: number;      // sequential/start_stop: evaluatedUnits; 3x3: evaluatedUnits * 9
  acceptedFrameCount: number;
  attemptCount: number;
  repairAttemptCount: number;

  // counters
  reasonCodeCounts: Record<string, number>;
  productReferenceMismatchCount: number;
  storyboardContinuityMismatchCount: number;
  publishSafetyBlockCount: number;
  guardianOccurrenceCount: number;
  assemblyOccurrenceCount: number;

  // derived (null when the denominator is 0 — never NaN, never 0-as-unknown)
  productReferenceMismatchRate: number | null;      // /evaluatedUnits
  storyboardContinuityMismatchRate: number | null;  // /evaluatedUnits
  repairAttemptsPerAcceptedFrame: number | null;    // /acceptedFrameCount
  meanQualityScore: number | null;                  // mean of PRESENT qualityScores

  computedAt: string;
};

/** PURE. Reads unitOutcomes[] when present (sequential, section-06 §5.10),
 *  else falls back to attempt-level unitIds/reasonCodes (3x3, legacy rows). */
export function buildMarketplaceAutoReviewModeMetrics(input: {
  runId: string;
  frameStrategy: string;
  evidenceGuardEnabled: boolean;
  qualityMode?: string | null;
  imageAttemptReviews: readonly Record<string, unknown>[];
  acceptedFrameUrls?: readonly string[];   // storyboardFrameUrls at accept time (count only; URLs never logged)
}): MarketplaceAutoReviewModeMetrics;
```

Binding decisions:

1. **Denominator honesty.** Sequential and 3x3 count different artifact kinds, so the recorder reports *both* `evaluatedUnits` (per provider artifact) and `frameEquivalents` (per depicted frame; a grid artifact = 9 frames). Rates are per `evaluatedUnits`; the pilot review may recompute per `frameEquivalents` from the stored counters. No single "the rate" is baked in.
2. **Missing data is `null`, not `0`.** A run with no reviews reports nulls; a review without `qualityScore` is excluded from the mean.
3. **Both modes always.** 3x3 runs record metrics with **both feature flags off** — that is the GA baseline (spec §26 Phase 5). This adds only the `metadataJson.observability` key; it changes no prompt, plan output, or verdict.
4. **No thresholds.** See §1.

### 5.7 Persistence and query surfaces (no migration)

- **Per run:** `metadataJson.observability = {metricsVersion, modeMetrics, emittedEventKeys}`.
- **Per stage attempt:** extend `persistMarketplaceAutoReviewStageAttemptSnapshot` (SVC:16425) so `evidenceJson` gains an optional compact `modeMetrics` when `metadata.imageAttemptReviews` is non-empty; keep `schemaVersion: 1` and the three existing ids untouched. The literal is duplicated between the insert and the `onConflictDoUpdate.set` — extract it into one local builder so the two copies cannot drift.
- **JSONL:** the `marketplace_review_mode_metrics` event makes the same object greppable per the LLM/media debugging protocol.
- **DB:** `api_audit_events` rows for guard occurrences + mode metrics make them visible to the existing `audit.search` admin surface (which queries the DB, not the JSONL files).
- **Pilot query (documented in the GA runbook, not code):** aggregate `marketplace_auto_review_runs.metadataJson->'observability'->'modeMetrics'` grouped by `frameStrategy` over the pilot window, plus a JSONL grep by `eventType` for the event-level distributions.

### 5.8 Real-LLM gate (M5, manual/CI-tagged)

**Pure evaluator — `apps/web/server/services/marketplaceAutoReviewSequentialGate.ts`:**

```ts
export type SequentialRealLlmGateExpectations = {
  fixtureId: "child_desk_chair" | "undocumented_assembly_desk";
  expectShotCount: 9;
  childSubjectPolicyActive: boolean;
  assemblyDocumented: boolean;
  imagePromptMaxChars: number;   // effective budget (section-04)
  videoPromptMaxChars: 2000;
  globalBlockMarker: string;     // section-03 §10 frozen literal
};

export type SequentialRealLlmGateReport = {
  fixtureId: string; passed: boolean;
  failures: Array<{ code: string; shotIds: number[]; detail?: string }>;
  observed: { shotCount: number; minorShotIds: number[]; guardianShotIds: number[];
              pivotBeats: number; maxImagePromptChars: number; maxVideoPromptChars: number };
  generatedAt: string;
};

/** PURE — no I/O, no LLM. Offline-tested against recorded packs (T12). */
export function evaluateSequentialRealLlmGate(
  pack: SequentialStoryboardPack,
  expectations: SequentialRealLlmGateExpectations,
): SequentialRealLlmGateReport;

export function isSequentialRealLlmGateEnabled(): boolean; // env MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE === "1"
```

Failure codes (frozen, mirrored in T12): `shot_count_invalid`, `guardian_missing_in_minor_frame`, `assembly_content_present`, `price_token_present`, `global_block_missing`, `prompt_over_budget`, `claim_untraced`.

**Fixtures — `apps/web/server/services/__fixtures__/marketplaceSequentialGate/`:**

- `child-desk-chair.json` — spec §11.4: children's desk chair, **4 angle images + 1 adult character reference**, evidence text with no assembly documentation and no medical claims. Expectations: `childSubjectPolicyActive: true`, `assemblyDocumented: false`.
- `undocumented-assembly-desk.json` — spec §11.5: flat-pack-looking furniture whose captured evidence contains **no** assembly steps/parts image. Expectations: `assemblyDocumented: false`; the report must show `pivotBeats > 0` (benefit/problem-solution replaced the assembly beat).
- `recorded-packs/*.json` — packs captured from earlier live runs (clean + each failure variant) that drive T12 offline. Store packs only; never store provider images or signed URLs.

**Live suite — `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialRealLlmGate.test.ts`:** `describe.skipIf(!isSequentialRealLlmGateEnabled())`; for each fixture it runs the section-04 loop against the live model, feeds the returned pack through `evaluateSequentialRealLlmGate`, asserts `passed === true`, and writes the report JSON under `apps/web/logs/gates/sequential-real-llm-gate-<fixtureId>-<ISO date>.json` as the pilot record. Long timeout; no retries; failures print the failure codes only (never the pack).

### 5.9 GA runbook (documentation deliverable, M5)

`specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/ga-gate-runbook.md`: the §25 metric definitions with their denominators, the two queries (SQL + JSONL grep), how to run the real-LLM gate, and the decision-record table the pilot review fills in (baseline 3x3 numbers, sequential numbers, pinned thresholds, decision, date). Per spec §26, a failed uplift blocks *sequential* GA only — the evidence-guard package still ships to 3x3.

---

## 6. Files touched

| File | Change |
|---|---|
| `apps/web/server/services/marketplaceAutoReviewObservability.ts` | **New** — event catalog, emitter, sanitizer, dedupe, metrics aggregator, loop audit effect |
| `apps/web/server/services/marketplaceAutoReviewSequentialGate.ts` | **New** — pure gate evaluator + env guard |
| `apps/web/server/services/auditLogger.ts` | Additive: 7 members on `AuditEventType` |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | Thin call sites (§5.5) + `evidenceJson.modeMetrics` in `persistMarketplaceAutoReviewStageAttemptSnapshot` + `metadata.observability` persistence. No logic changes |
| `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts` | Wire `buildSequentialLoopAuditEffect` as the production `emitAudit` default (section-04 owns the seam) |
| `apps/web/server/services/__tests__/marketplaceAutoReview.observability.test.ts` | **New** — T1–T11 |
| `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialRealLlmGate.test.ts` | **New** — T12 offline evaluator cases + the skip-gated live suite (T13) |
| `apps/web/server/services/__fixtures__/marketplaceSequentialGate/*.json` | **New** — 2 gate fixtures + recorded packs |
| `specs/feature/136-…/ga-gate-runbook.md` | **New** — pilot queries + decision record |
| `apps/web/server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` | Read-only tripwire — must stay green |

No DB migration; no schema.ts edit.

---

## 7. Phasing

- **M2 (with the sequential pipeline):** observability module, `AuditEventType` additions, round / degraded / over-budget / angle-trim events, **metrics recorder for BOTH modes** + persistence, tests T1–T7 + T9–T11. Landing the recorder here is the whole point of interview Q2 — without it there is no baseline at pilot time.
- **M3 (with section-07):** guard-occurrence events + DB dual-write (T8) — blocked until the guard reason codes exist.
- **M5:** gate fixtures, evaluator, live suite, GA runbook, pilot review (T12–T13).

---

## 8. Invariants and guardrails

1. **Zero behavior change.** No emit path may throw, block, retry, or alter a decision. Every emitter is try/catch-wrapped; the DB write is best-effort and awaited only where the caller is already async.
2. **No thresholds in code** (T11). Facts only; humans pin numbers.
3. **No content leakage** (§5.4, T3): ids, hashes, lengths, counts, codes — never prompts, dialogue, URLs, or image data.
4. **32-char trace ids** — `api_audit_events.traceId` is `varchar(32)`; the SVC media trace-id format does not fit. Use the sha256-32 derivation for both surfaces so they join.
5. **Bounded state** — `emittedEventKeys` capped; payloads small enough to stay under the audit 32 KB cap.
6. **Resume-safe** — dedupe keys live in `metadataJson`, so a restarted run re-emits nothing.
7. **Mode-fair metrics** — never compare a per-grid-attempt rate against a per-unit rate without the stored denominators; both are recorded for exactly this reason.
8. **Additive SVC edits only** — the 27k-line file has concurrent editors; keep call sites to a few lines each and verify via isolated copies per repo memory.

---

## 9. Verification checklist

1. `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.observability.test.ts server/services/__tests__/marketplaceAutoReview.sequentialRealLlmGate.test.ts` — green, with the live gate reported as *skipped*.
2. WS-1 snapshot suite byte-identical; full `marketplaceAutoReviewService.test.ts` green (proves `metadataJson.observability` on 3x3 runs breaks nothing).
3. `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — no NEW errors vs the ~987-error baseline.
4. Grep guards: no threshold identifiers in the observability module; no `http`/`prompt` literal reaching an emit payload outside the sanitizer; the seven event names appear in `AuditEventType`.
5. Manual trace (internal tenant, sequential flag on): one run yields 3 `sequential_skill_plan_round` lines, ≤1 `sequential_reference_angles_trimmed` line, one `marketplace_review_mode_metrics` line at stage close, `metadataJson.observability.modeMetrics` populated, and a matching `api_audit_events` row joinable by `traceId`.
6. Baseline check: one 3x3 run with **both flags off** also produces `marketplace_review_mode_metrics` — the GA baseline is being collected.
7. M5 only: `MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE=1` run of the live suite passes for both fixtures and writes the two report artifacts referenced by the GA runbook.

---

## 10. Out of scope

- Numeric GA thresholds, the enablement decision, and any automated gate that flips a tenant flag (human decision, Phase 5).
- New tables, columns, dashboards, or admin UI for the metrics (the pilot review uses SQL + the existing `audit.search`).
- Cross-run/tenant aggregation service — the per-run object plus the documented query is the v1 surface (§28 may promote it later).
- Tier-2 (`execution_mode: agents_python`) round checkpoint events (spec §9.8, Phase 6).
- Emitting the metric *ingredients* (section-06) and the guard reason codes (section-07).