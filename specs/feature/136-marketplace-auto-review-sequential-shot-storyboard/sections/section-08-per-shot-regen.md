# Section 08 — Per-Shot Regeneration + Edited Prompts

- **Section id:** `section-08-per-shot-regen`
- **Feature:** 136 — Marketplace Auto Review: Sequential Shot Storyboard
- **Sources:** `../claude-plan.md` WS-8, `../claude-plan-tdd.md` WS-8, `../spec.md` v1.3.0 §18.4 (authoritative), §20.2, §21.5, §23.1 (blocker ids), §19.2 (`shotOverrides` shape); decision B4 in `../reviews/self-review-round-1.md`
- **Depends on:** `section-06-sequential-pipeline` (single-unit machinery: 9-unit construction, prompt dispatcher with `shotOverrides` precedence, sequential submit fork with submit-time mapping re-validation, per-unit QA/repair). Reads-only from `section-01` (flag gate + strategy enum), `section-02` (`referenceIndexMap.ts`, manifest), `section-04` (`validateSequentialStoryboardPackPreflight`, `resolveSequentialImagePromptBudget`, blocker-id vocabulary), `section-05` (persisted `metadataJson.sequentialStoryboard.*`).
- **Blocks:** nothing. Parallelizable with `section-07`.
- **Milestone:** M2 — sequential pipeline, internal tenant only.
- **Test command:** `npm --prefix apps/web run test -- <files>` (Vitest, run for `apps/web`).

---

## 1. Objective

Give the user surgical control over a single shot after the 9-image run has produced frames, without re-running planning:

1. **`regenerateAutoReviewSequentialShot({ runId, shotId, refreshPrompt? })`** — new additive tRPC mutation in `apps/web/server/routers/marketplaceCapture.ts`, cloned from the `selectAutoReviewImageAttemptForStoryboardReview` template (`:1171-1184`). Re-runs **exactly one** unit through the existing image submit → QA → repair machinery; the other 8 units are never resubmitted and their attempt counters never move.
2. **Single-shot prompt refresh (optional, off by default)** — one scoped skill invocation shaped like VD's `generateStartFrameShotPrompt` (`verticalDramaStartFrameGeneration.ts:1349`). It **never** re-runs the 3-round loop, never rewrites `loopReport`, and never overwrites a user's saved prompt.
3. **`saveAutoReviewSequentialShotOverride({ runId, shotId, … })`** — new additive mutation persisting user edits (dialogue / image prompt / video prompt) at `metadataJson.sequentialStoryboard.shotOverrides[String(shotId)]` **after** they pass the SAME deterministic preflight the runner used. A failing edit is rejected with the specific blocker id **and a Thai message** — never silently rewritten, never partially persisted.
4. **Bounded, auditable cost** — user-initiated regenerations get an explicit per-unit allowance on top of the automatic repair budget, capped, recorded in metadata.

Everything here is reachable only for runs whose `frameStrategy === "sequential_shot_storyboard"` (section-01 FORBIDDEN-gates that at start). The WS-1 byte-identical snapshot suite is the regression tripwire for every SVC edit in this section.

---

## 2. Background — machinery this section reuses (do not re-implement)

All server work lands in `apps/web/server/services/marketplaceAutoReviewService.ts` ("SVC", ~27k lines) plus the router. Anchors verified 2026-07-21 — **locate by symbol name; line numbers drift** (concurrent sessions edit this file).

| Symbol | Observed line | Why it matters here |
|---|---|---|
| `selectAutoReviewImageAttemptForStoryboardReview` (router) | `routers/marketplaceCapture.ts:1171-1184` | Exact mutation template: `protectedProcedure.input(z.object({…})).output(z.any()).mutation(({input, ctx}) => service(input, authFromCtx(ctx)))` |
| `authFromCtx`, `autoReviewRuntimeFromCtx` | same router | Auth + `RuntimeContext` (`userToken`, `publicUrl`) plumbing |
| `selectMarketplaceAutoReviewImageAttemptForStoryboardReview` | SVC:17206-17473 | Service template: `getDb` → `reloadRun` → validate → build next metadata → `updateRun` → `upsertRunStage` → `getMarketplaceAutoReviewRun`. Also the **storyboard-review re-creation precedent** (`storyboardReviewId: null` on the run copy + `previousStoryboardReviewId` recorded, SVC:17397-17409) |
| `reloadRun(db, runId, auth)` | SVC:25930 | Tenant/user-scoped load; throws `NOT_FOUND` |
| `updateRun({db, runId, …, metadataJson})` | SVC:16117 | Single persistence primitive (no new helper needed) |
| `upsertRunStage`, `stageKeysForMode`, `stageIndex` | SVC:16041 / :6705 / :6713 | Stage reopen when regenerating after `storyboard_review` |
| `advanceMarketplaceAutoReviewRun(runId, auth, runtime)` | SVC:26048 | Drives the run machine; returns the run projection. Early-returns for `completed`/`failed`/`cancelled` |
| `queueMarketplaceAutoReviewAdvance` | SVC:26814 | Background follow-up (needs `runtime.userToken`) |
| `scheduleImageAttempt` | SVC:18225 | The single-unit submit path. Key seams: `activeRefs.length > 0` early-return (`:18285`, in-flight guard), `pendingImageRepairUnits` → `imageRepairUnitsForFrameStrategy` → `units` (`:18291-18315`), per-unit budget check `attempt > effectiveMaxRepairAttemptsPerUnit` (`:18347-18355`), prompt build via `prepareMarketplaceAutoReviewImagePromptForSubmit` (`:18408`) |
| `RunMetadata.pendingImageRepairUnits: DirectImageUnit[]` | SVC:828 | **The seam for "re-run exactly one unit"** |
| `nextDirectAttempt(refs, unitId)` / `latestTaskRefsByUnit` / `directTaskRefs` | SVC:7735 / :7718 | Per-unit attempt counting + in-flight detection |
| `effectiveQualityModePolicy(metadata).maxRepairAttemptsPerUnit` | SVC:2578-2592 | Automatic repair budget (fast_draft 1 / balanced / premium) |
| `MarketplaceAutoReviewPromptPreflightResult` `{blockers, warnings}` | SVC:8633-8655 region | Blocker-id shape/vocabulary |
| `MarketplaceAutoReviewImagePromptPreflightError` | SVC:993-1020 | Existing typed prompt-failure error + its status projection (SVC:1165-1196) |
| `assertMarketplaceAutoReviewGovernanceReady` / `assertPaidStageAuthorityFresh` | SVC:6116 / :6586 | Spend guards **already inside** `scheduleImageAttempt` — regen inherits them for free; do not bypass |

From sibling sections (imports / reads only):

- `validateSequentialStoryboardPackPreflight({pack, imageBudget, manifest, childSubjectPolicy, assemblyDocumented}) → {blockers, warnings, perShot}` and `resolveSequentialImagePromptBudget({overrideMaxChars, providerMaxPromptLength})` — **section-04**, `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts`.
- Blocker-id vocabulary (stable contract, section-04 §5.7): `sequential_prompt_set_incomplete`, `prompt_empty`, `prompt_too_long_for_image_provider`, `prompt_too_long_for_video_provider`, `video_global_block_missing`, `guardian_directive_missing`, `assembly_demo_unverified`, `price_claim_detected`, `shot_duration_exceeds_max`, `dialogue_exceeds_shot_duration`, `reference_index_mapping_mismatch`, `product_reference_model_conflict`, `minor_safety_clothing_lock_missing`.
- `findReferenceIndexMappingMismatches(prompt, manifest)` — **section-02**, `apps/web/shared/marketplaceCapture/referenceIndexMap.ts`.
- Persisted pack at `metadataJson.sequentialStoryboard.*` (spec §19.2) — **section-05**; `referenceManifest`, `childSubjectPolicy`, `evidenceProfile.assembly_documented`, `shots[]`, `loopReport`.
- `assertMarketplaceSequentialStoryboardAllowed(...)` + `getTenantFeatureFlags` gate — **section-01**.
- Unit id scheme `sequential-shot-01 … sequential-shot-09` and role `sequential_shot_frame` — **section-06**. **Reuse section-06's id builder** (`directImageUnitIdForFrameRole` SVC:10040 must already emit `sequential-shot-0N` for the sequential role, otherwise per-unit attempt counting breaks); if that helper is not yet sequential-aware when you start, fix it there — do **not** invent a second id scheme in this section.

---

## 3. Scope boundaries

**In scope:** the four items in §1 — two router procedures, three SVC service functions, one small shared copy module, one bounded budget-allowance tweak, two new test files.

**Out of scope (do not implement here):**

- The 9-unit pipeline, prompt dispatcher, submit fork, QA/repair, stage gate, and storyboard handoff — **section-06** (consumed as-is).
- The multi-round loop, the runtime contract, the deterministic preflight function itself — **section-04** (this section adds only the *single-shot* invocation shape and calls the exported validator).
- Guardian/assembly directives, QA fields, publish-block additions — **section-07**. This section's preflight call simply carries whatever ids section-04/07 already produce.
- Video job submission for the regenerated shot — **section-09** (the saved `video_prompt` override is validated and stored here; nothing submits it).
- Per-shot editor UI, char counters, blocker rendering — **section-11** (consumes the copy module and mutation contracts defined below).
- Named audit events / metrics recorder — **section-12**. Use structured `console.warn("[marketplaceAutoReview] …")` at decision points; section-12 formalizes names.

---

## 4. Public contract added by this section

Keep these names/shapes — section-11 is written against them.

```ts
// apps/web/server/routers/marketplaceCapture.ts (additive procedures)
regenerateAutoReviewSequentialShot: protectedProcedure
  .input(z.object({
    runId: z.string().min(1).max(64),
    shotId: z.number().int().min(1).max(9),
    refreshPrompt: z.boolean().optional().default(false), // §18.4 "optional prompt refresh"
  }))
  .output(z.any())
  .mutation(/* → regenerateMarketplaceAutoReviewSequentialShot(input, authFromCtx(ctx), autoReviewRuntimeFromCtx(ctx)) */);

saveAutoReviewSequentialShotOverride: protectedProcedure
  .input(z.object({
    runId: z.string().min(1).max(64),
    shotId: z.number().int().min(1).max(9),
    dialogue: z.string().trim().max(2000).optional(),
    startFrameImagePrompt: z.string().trim().max(4000).optional(),  // coarse guard; preflight is authoritative
    videoPrompt: z.string().trim().max(2000).optional(),
    clear: z.boolean().optional().default(false),                   // remove the override entirely
  }))
  .output(z.any())
  .mutation(/* → saveMarketplaceAutoReviewSequentialShotOverride(input, authFromCtx(ctx)) */);
```

> **Why two procedures.** Spec §20.2 names only `regenerateAutoReviewSequentialShot`, but §18.4 + §21.5 also require an edit-save action that "runs the deterministic preflight and shows the specific blocker on failure" without generating an image. Splitting keeps the planned regen input byte-exact and lets the UI validate an edit for free (no provider spend). Both are additive; no existing procedure changes.

```ts
// marketplaceAutoReviewService.ts (SVC) — new exports
export async function regenerateMarketplaceAutoReviewSequentialShot(
  input: { runId: string; shotId: number; refreshPrompt?: boolean },
  auth: AuthContext,
  runtime?: RuntimeContext
): Promise<unknown /* run projection, same as getMarketplaceAutoReviewRun */>;

export async function saveMarketplaceAutoReviewSequentialShotOverride(
  input: {
    runId: string; shotId: number;
    dialogue?: string; startFrameImagePrompt?: string; videoPrompt?: string; clear?: boolean;
  },
  auth: AuthContext
): Promise<{ shotId: number; override: SequentialShotOverride | null; warnings: string[] }>;

/** Pure: merge an edit onto the persisted pack and run section-04's preflight,
 *  returning ONLY the blockers attributable to the edited shot. No I/O. */
export function evaluateSequentialShotOverrideForTest(input: {
  metadata: RunMetadata;
  shotId: number;
  edit: { dialogue?: string; startFrameImagePrompt?: string; videoPrompt?: string };
  imageBudget: number;
}): { blockers: string[]; warnings: string[] };

/** Pure: next metadata after accepting an edit (or clearing it). No I/O. */
export function applySequentialShotOverrideToRunMetadataForTest(input: {
  metadata: RunMetadata; shotId: number;
  edit: { dialogue?: string; startFrameImagePrompt?: string; videoPrompt?: string } | null;
  editedBy: string; editedAt: string;
}): RunMetadata;

/** Pure: the single unit + bookkeeping to seed for a user-requested regen. No I/O. */
export function buildSequentialShotRegenerationPlanForTest(input: {
  metadata: RunMetadata; plan: AutoReviewPlan; shotId: number; requestedBy: string; requestedAt: string;
}): { unit: DirectImageUnit; metadata: RunMetadata };
```

```ts
// apps/web/shared/marketplaceCapture/sequentialShotBlockerCopy.ts   (NEW — pure, client-importable)
/** Thai message per section-04 §5.7 blocker id. Section-11 renders these verbatim. */
export const SEQUENTIAL_SHOT_BLOCKER_COPY_TH: Readonly<Record<string, string>>;
/** Never returns a bare id: unknown ids get a generic Thai sentence that still names the id. */
export function sequentialShotBlockerMessageTh(blockerId: string): string;
/** "…<first blocker Thai message> [ids: a, b]" — the exact TRPCError.message on rejection. */
export function buildSequentialShotOverrideRejectionMessage(blockers: readonly string[]): string;
```

```ts
// Persisted metadata additions (all inside metadataJson.sequentialStoryboard — additive JSONB, no migration)
shotOverrides: Record<string /* "3" */, {
  dialogue?: string; start_frame_image_prompt?: string; video_prompt?: string;
  editedAt: string; editedBy?: string;
}>;                                                   // spec §19.2 shape, + editedBy
shotRegenerations?: Array<{                           // bounded ring, keep last 50
  shotId: number; unitId: string; requestedAt: string; requestedBy: string;
  promptSource: "skill_pack" | "user_override" | "single_shot_refresh";
  previousFrameUrl?: string; previousStoryboardReviewId?: string;
  refreshRejectedBlockers?: string[];
}>;
userRegenerationAllowance?: Record<string /* unitId */, number>;  // extra provider attempts granted by the user
```

Constant (SVC, beside the other sequential constants): `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT = 5`.

---

## 5. Tests FIRST

Two new files (plus one tiny shared-module file). Write them failing, then implement.

### 5.1 `apps/web/server/routers/__tests__/marketplaceCapture.sequentialShotRegen.test.ts`

Conventions cloned from `marketplaceCapture.motionDirection.test.ts`: `vi.hoisted(() => { process.env.JWT_SECRET ||= "test-jwt-secret-for-marketplace-capture-router"; })`, `vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }))`, then `import { marketplaceCaptureRouter } from "../marketplaceCapture"` and reach the zod schema via `_def.procedures.<name>._def.inputs[0]`.

**T1 — procedure registration.** `_def.procedures` contains `regenerateAutoReviewSequentialShot` and `saveAutoReviewSequentialShotOverride`; the existing procedure list from `marketplaceCapture.hyperframesRuntimeApi.test.ts` still passes (nothing removed).

**T2 — regen zod.** Accepts `{runId: "mar_1", shotId: 1}` … `{shotId: 9}`; `refreshPrompt` defaults to `false` when absent and accepts `true`. Rejects `shotId` `0`, `10`, `-1`, `2.5`, `"3"`, missing; rejects empty `runId` and a 65-char `runId`.

**T3 — override zod.** Accepts any subset of the three text fields (including none, i.e. a pure `clear: true`); trims whitespace; rejects `startFrameImagePrompt` of 4001 chars and `videoPrompt` of 2001 chars; `clear` defaults `false`.

**T4 — auth.** `createCaller` with a null user rejects both mutations with `code: "UNAUTHORIZED"` (real `protectedProcedure` middleware, per the runtime-API test precedent).

### 5.2 `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialShotRegen.test.ts`

No DB. Exercise the exported `…ForTest` pure helpers with fixtures, and the async service functions through `vi.mock` on the DB/advance seams where a full path is asserted. Reuse the section-06 fixture builders (copy them locally rather than importing from another test file):

```ts
/** RunMetadata with a complete §19.2 pack: 9 shots, empty shotOverrides,
 *  referenceManifest (primary + 2 angles + guardian), childSubjectPolicy,
 *  evidenceProfile.assembly_documented=false, loopReport rounds 1..3,
 *  directImageTasks with 9 completed refs, storyboardFrameUrls[0..8]. */
function buildRegenMetadataFixture(overrides?: Partial<RunMetadata>): RunMetadata;
function buildSequentialPlanFixture(): AutoReviewPlan;              // 9 shots, order 1..9
```

**T5 — regen re-runs exactly one unit.** `buildSequentialShotRegenerationPlanForTest({shotId: 4, …})` returns `unit.unitId === "sequential-shot-04"`, `unit.role === "sequential_shot_frame"`, `unit.shotOrder === 4`, **no** `repairInstruction` and **no** `repairReasonCodes` (a plain regen must not mutate the prompt — see §6.3), and `metadata.pendingImageRepairUnits` has length exactly 1. Assert every other unit's `directImageTasks` refs are identical (deep-equal, including `attempt`) to the input fixture, and that `storyboardFrameUrls` still holds all 9 previous URLs (the old frame stays visible until the new one lands).

**T6 — no loop re-run.** With `refreshPrompt: true`, the injected single-shot refresh effect is called at most once and `runProductReviewSequentialStoryboardSkillLoop` (mocked module export) is **never** called; `metadata.sequentialStoryboard.loopReport` is deep-equal to the fixture's after the call (`selected_version` unchanged). With `refreshPrompt: false` (default) the refresh effect is not called at all.

**T7 — refresh never overwrites a user edit.** Fixture with a passing `shotOverrides["4"].start_frame_image_prompt`; `refreshPrompt: true` ⇒ refresh effect not invoked, override preserved byte-for-byte, `promptSource: "user_override"` recorded.

**T8 — refresh is fail-open.** Refresh returns a prompt that trips a shot-scoped blocker (e.g. over budget) ⇒ the candidate is discarded, the previously persisted prompt is kept, `shotRegenerations[last].refreshRejectedBlockers` lists the ids, and the regen still proceeds (no throw).

**T9 — override save happy path.** `applySequentialShotOverrideToRunMetadataForTest` with `shotId: 3` writes `sequentialStoryboard.shotOverrides["3"] = {start_frame_image_prompt, dialogue, editedAt, editedBy}`; `shots[]` in the pack is untouched (overrides are a separate layer); `shotOverrides` for other keys untouched; unrelated top-level metadata keys untouched. `clear` variant (`edit: null`) deletes only that key.

**T10 — override rejection, one case per blocker family.** `evaluateSequentialShotOverrideForTest` returns exactly the expected id for:
`prompt_too_long_for_image_provider` (image prompt over `imageBudget`, incl. a case where a provider cap < 4000 is the binding limit); `prompt_too_long_for_video_provider` (2001 chars); `video_global_block_missing` (video prompt without the frozen global-block marker); `price_claim_detected` (Thai "ลด 50%" and numeric "฿199"); `dialogue_exceeds_shot_duration` (Thai ≈17 chars/s estimate > `duration_seconds`); `reference_index_mapping_mismatch` (explicit `@ImageN` role claim contradicting the persisted manifest); `prompt_empty` (whitespace-only edit). Clean edit ⇒ `blockers: []`.

**T11 — cross-shot isolation of blockers.** A fixture whose shot 7 is already broken in the persisted pack (e.g. its video prompt lacks the global block) must NOT cause a clean edit on shot 3 to be rejected — `evaluateSequentialShotOverrideForTest` returns only `perShot[3]`-scoped blockers.

**T12 — rejection is atomic and Thai.** `saveMarketplaceAutoReviewSequentialShotOverride` on a failing edit throws `TRPCError` `BAD_REQUEST` whose `message` contains the Thai copy for the first blocker **and** the raw id list; assert `updateRun` (mocked) was NOT called (nothing persisted) and that the input metadata object was not mutated.

**T13 — override precedence at regeneration.** With a saved passing override for shot 3, the prompt resolved for `sequential-shot-03` through section-06's `prepareMarketplaceAutoReviewImagePromptForTest` equals the override string exactly; shots 1,2,4–9 still resolve to their pack prompts.

**T14 — submit-time mapping re-validation still applies.** Regenerating a shot whose persisted prompt claims `@Image4 = guardian` against a manifest where the guardian is now index 3 ⇒ the submit path throws before `generateImageAsync` (mock not invoked). (Mechanism is section-06's; this test pins that regen does not bypass it.)

**T15 — guards (each asserts a distinct code + Thai message, and no provider call).**
run not found ⇒ `NOT_FOUND`; run `frameStrategy !== "sequential_shot_storyboard"` ⇒ `BAD_REQUEST`; tenant flag off ⇒ `FORBIDDEN` (section-01 message reused); run status `cancelled`/`failed` ⇒ `BAD_REQUEST`; `shotId` beyond `plan.shots.length` ⇒ `NOT_FOUND`; a provider-reached, non-terminal ref already exists for that unit ⇒ `CONFLICT`; allowance exhausted (`MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT` reached) ⇒ `BAD_REQUEST`.

**T16 — allowance arithmetic.** After one regen, `userRegenerationAllowance["sequential-shot-04"] === 1`; the effective per-unit cap consumed by `scheduleImageAttempt` equals `effectiveQualityModePolicy(metadata).maxRepairAttemptsPerUnit + 1`. With no allowance entry the effective cap is byte-identical to today's value for **every** strategy (grid regression guard).

**T17 — storyboard-review reopen.** Regenerating on a run already at `storyboard_review` sets `currentStage: "image_generation"`, `status: "running"`, reopens the `image_generation` stage record, clears `run.storyboardReviewId`, and records `previousStoryboardReviewId` in the `shotRegenerations` entry (manual-select precedent SVC:17397-17409). Regenerating a run still in `image_generation` does not touch `storyboardReviewId`.

### 5.3 `apps/web/shared/marketplaceCapture/__tests__/sequentialShotBlockerCopy.test.ts`

- Every blocker id in the section-04 §5.7 table plus `prompt_empty` has a non-empty Thai entry (drive the assertion from an explicitly enumerated id list in the test so adding a blocker without copy fails).
- `sequentialShotBlockerMessageTh("totally_unknown_id")` returns a non-empty Thai string that still contains `totally_unknown_id`.
- `buildSequentialShotOverrideRejectionMessage(["price_claim_detected","prompt_empty"])` is deterministic, starts with the first blocker's Thai copy, and lists both ids.

### 5.4 Tripwire

Re-run `server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` after every SVC edit — byte-identical for 3x3 and start_stop with both flags off.

---

## 6. Implementation guidance

### 6.1 Router (`apps/web/server/routers/marketplaceCapture.ts`)

Append both procedures next to `selectAutoReviewImageAttemptForStoryboardReview` using that exact shape (`protectedProcedure` → `z.object` input → `.output(z.any())` → thin delegate). `regenerate…` passes `autoReviewRuntimeFromCtx(ctx)` (the media `userToken` is required to submit); `save…` does not need runtime. Import the two new service functions alongside the existing service imports. Nothing else in this router changes.

### 6.2 Preconditions in `regenerateMarketplaceAutoReviewSequentialShot`

Order matters — cheapest and most user-visible checks first, all before any spend:

1. `getDb()` → `INTERNAL_SERVER_ERROR` when null (template).
2. `reloadRun(db, input.runId, auth)` (tenant/user scoped; `NOT_FOUND`).
3. `run.frameStrategy !== "sequential_shot_storyboard"` ⇒ `BAD_REQUEST` — `"รันนี้ไม่ได้ใช้โหมด 9 ภาพต่อเนื่อง จึงสร้างภาพรายช็อตใหม่ไม่ได้"`.
4. Flag re-check: `await getTenantFeatureFlags(run.tenantId ?? auth.tenantId ?? "default")` then section-01's `assertMarketplaceSequentialStoryboardAllowed({frameStrategy: run.frameStrategy, marketplaceSequentialStoryboard})` ⇒ `FORBIDDEN` with section-01's Thai message. (Cheap single-row read, only on this sequential-only path.)
5. `run.status` ∈ `{failed, cancelled}` ⇒ `BAD_REQUEST` `"รันนี้จบแล้ว จึงสร้างภาพรายช็อตใหม่ไม่ได้"`. `completed` is allowed **only** for `outputMode === "storyboard_images"` (that mode completes at storyboard_review) — reopen per §6.6; any other completed run is rejected with the same message.
6. Pack presence: `metadata.sequentialStoryboard?.shots` with ≥ `shotId` entries, else `BAD_REQUEST` `"ยังไม่มีแผนช็อตของรันนี้"`. Plan shot resolution via `extractPlanFromRun(run)` + `plan.shots.find(s => s.order === shotId)` ⇒ `NOT_FOUND` `"ไม่พบช็อตที่ {shotId} ในแผน"`.
7. In-flight guard: `latestTaskRefsByUnit(directTaskRefs(metadata.directImageTasks))` filtered to this `unitId`; if one `directMediaRefReachedProvider` and its status is neither `completed` nor `failed` ⇒ `CONFLICT` `"ช็อตนี้กำลังสร้างภาพอยู่ กรุณารอให้เสร็จก่อนสั่งสร้างใหม่"`. (Without this the user gets a silent no-op from `scheduleImageAttempt`'s `activeRefs` early-return at SVC:18285.)
8. Allowance guard: current `userRegenerationAllowance[unitId] ?? 0` ≥ `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT` ⇒ `BAD_REQUEST` `"สั่งสร้างภาพช็อตนี้ใหม่ครบ {max} ครั้งแล้ว กรุณาแก้ prompt ของช็อตนี้หรือเริ่มงานใหม่"`.

Governance/spend freshness (`assertMarketplaceAutoReviewGovernanceReady`, `assertPaidStageAuthorityFresh`) is **not** duplicated here — `scheduleImageAttempt` already runs both at the top (SVC:18233-18242). Do not bypass it and do not re-implement it.

### 6.3 Seeding exactly one unit (`buildSequentialShotRegenerationPlan`, pure)

Returns `{unit, metadata}` where:

- `unit` = `{unitId: sequentialShotUnitId(shotOrder), role: "sequential_shot_frame", shotId: planShot.id, shotOrder}` using **section-06's** id builder.
- **No `repairInstruction`, no `repairReasonCodes`.** A user-requested regen must reuse the exact same prompt (or the override / refreshed prompt) — attaching a repair directive would silently mutate it, violating "never silently rewritten". Regen intent is recorded in metadata, not in the prompt.
- `metadata.pendingImageRepairUnits = [unit]` (replaces, never appends — `imageRepairUnitsForFrameStrategy` passes all units through for non-grid strategies, so any stale entry would resubmit another shot).
- `metadata.sequentialStoryboard.userRegenerationAllowance[unitId] = (previous ?? 0) + 1`.
- `metadata.sequentialStoryboard.shotRegenerations` gains one entry (bounded: keep the last 50) with `previousFrameUrl = metadata.storyboardFrameUrls?.[shotOrder-1]`, `promptSource`, and `previousStoryboardReviewId` when reopening.
- **Leave `storyboardFrameUrls` untouched** — section-06's `imageUrlsFromDirectRefs` overwrites index `shotOrder-1` when the new attempt completes. Keeping the old URL means the review page never shows a hole mid-regeneration.

### 6.4 Per-unit budget allowance (one-line change in `scheduleImageAttempt`)

Replace the bare `effectiveMaxRepairAttemptsPerUnit` comparison (SVC:18347-18355) with the sum of the policy cap and the per-unit allowance:

```ts
// effective cap for THIS unit = automatic repair budget + user-granted regenerations
const unitAttemptCap =
  effectiveMaxRepairAttemptsPerUnit +
  toNumber(asRecord(asRecord(params.metadata.sequentialStoryboard).userRegenerationAllowance)[unit.unitId]);
if (attempt > unitAttemptCap) { /* existing skip + console.warn block, unchanged */ }
```

Write it generically (no strategy fork): the allowance map is absent for 3x3/start_stop, `toNumber(undefined) === 0`, so behavior and the emitted warning payload are byte-identical for existing strategies (locked by T16 + the snapshot suite). Add `unitAttemptCap` to the existing `console.warn` payload only — do not restructure that log.

### 6.5 Optional single-shot prompt refresh (no loop)

New export in **section-04's module** (`productReviewSequentialStoryboardSkillRunner.ts`), invoked from SVC:

```ts
/** ONE scoped skill call for ONE shot. Never runs the 3-round loop, never
 *  touches loopReport/selected_version, never overwrites a user override.
 *  Shape mirrors VD generateStartFrameShotPrompt (verticalDramaStartFrameGeneration.ts:1349). */
export async function refreshSequentialShotPromptWithSkill(
  input: SequentialSingleShotRefreshInput,
  effects?: Partial<SequentialSingleShotRefreshEffects>   // test seam
): Promise<{ startFrameImagePrompt: string; videoPrompt?: string; degraded: boolean }>;
```

- **Input contract lines** (deterministic, string-containment testable): `single_shot_mode: true`, `target_shot_id`, the frozen `globalContinuity` (incl. `video_global_block`), the shot contract (`purpose`, `dialogue`, `duration_seconds`, `demonstration_type`, `depicts_minor`, `guardian_required`, `transition_from_previous`, `visual_summary`), the `visual_summary` of shots N−1 and N+1 for continuity, the persisted `referenceManifest`, the effective image budget (`resolveSequentialImagePromptBudget`) and video budget 2000, blocked claims ∪ `forbiddenClaims`, `childSubjectPolicy`. Reuse the full-loop contract builder and append the single-shot lines — do not fork a second contract assembler.
- **Output**: small zod schema `{start_frame_image_prompt, video_prompt?, image_prompt_character_count, video_prompt_character_count}`; parse with the same lenient machinery (`extractJson` + jsonrepair / `executeJsonPlanningCallWithRetry`), ONE bounded retry, and **never switch models** to fix weak-model JSON (repo cost policy).
- **Validation**: build a candidate pack = persisted pack with shot N replaced, run `validateSequentialStoryboardPackPreflight`, and inspect `perShot[shotId]` only. Any blocker ⇒ **discard the candidate, keep the existing prompt**, record `refreshRejectedBlockers`, continue (fail-open — a refresh is optional; the image regen must not be blocked by it). Over-budget prompts route through section-04's optimizer path; **never** `slice()`.
- **Skip conditions** (checked before any spend): `refreshPrompt !== true`; or a non-empty `shotOverrides[shotId].start_frame_image_prompt` exists (user edit always wins, `promptSource: "user_override"`).
- Credits follow the runner's existing `legacyExecute` reserve/deduct pattern — no new billing surface.

### 6.6 Persist, reopen the stage, advance

1. `updateRun({db, runId, metadataJson: nextMetadata, status: "running", currentStage: "image_generation", stageIndex: stageIndex("image_generation", stages), stageCount: stages.length, storyboardReviewId: reopening ? null : undefined, completedAt: reopening ? null : undefined})` with `stages = stageKeysForMode(run.outputMode)`.
2. `upsertRunStage({db, runId, stageKey: "image_generation", stageOrder: stageIndex(...), status: "running", output: {reason: "user_requested_sequential_shot_regeneration", shotId, unitId}})`. Also reopen `storyboard_review` to a non-completed status when it was completed, so the section-06 handoff can re-run and create a fresh review (manual-select precedent records `previousStoryboardReviewId`; do the same here).
3. `return await advanceMarketplaceAutoReviewRun(input.runId, auth, runtime)` — synchronous advance so capacity/mapping/preflight failures surface to the caller as errors instead of silently parking the run. Use `queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 1_000)` only as the follow-up poll when the advance leaves the run in `waiting_provider` (same pattern as `listAutoReviewRuns` SVC-side callers).
4. Structured log at the decision point: `console.warn("[marketplaceAutoReview] sequential_shot_regeneration", {runId, shotId, unitId, promptSource, allowance, previousStoryboardReviewId})`. Section-12 promotes this to a named audit event.

### 6.7 `saveMarketplaceAutoReviewSequentialShotOverride`

1. Preconditions 1–6 of §6.2 (no in-flight guard, no allowance guard — saving is free and always allowed).
2. `clear: true` ⇒ delete `shotOverrides[String(shotId)]`, persist, return `{shotId, override: null, warnings: []}`. No preflight (removing an edit can only restore the validated pack state).
3. Otherwise build the candidate pack (persisted pack, shot N merged with the provided fields only — absent fields keep the current effective value, which is the existing override if any, else the pack value). Recompute `image_prompt_character_count` / `video_prompt_character_count` deterministically from the edited strings; leave `estimated_speech_seconds` as-is (the preflight's Thai ≈17 chars/s estimator is the authority for `dialogue_exceeds_shot_duration`).
4. `imageBudget = resolveSequentialImagePromptBudget({overrideMaxChars: metadata.sequentialImagePromptMaxChars, providerMaxPromptLength: <provider cap for metadata.imageModel>})`.
5. `validateSequentialStoryboardPackPreflight({pack: candidate, imageBudget, manifest: sequentialStoryboard.referenceManifest, childSubjectPolicy: sequentialStoryboard.childSubjectPolicy, assemblyDocumented: sequentialStoryboard.evidenceProfile?.assembly_documented === true})`.
6. **Shot-scoped rejection**: take `perShot[shotId]` (fall back to the subset of `blockers` the validator attributes to this shot). Non-empty ⇒ `throw new TRPCError({code: "BAD_REQUEST", message: buildSequentialShotOverrideRejectionMessage(shotBlockers)})` — persist nothing, mutate nothing, log `console.warn("[marketplaceAutoReview] sequential_shot_override_rejected", {runId, shotId, blockers})`. Never rewrite, trim, or truncate the user's text to make it pass.
7. Accept ⇒ `applySequentialShotOverrideToRunMetadata` (spread-merge into the existing `shotOverrides` record; set `editedAt = nowIso()`, `editedBy = auth.userId`), `updateRun({db, runId, metadataJson})`, return `{shotId, override, warnings: perShot warnings}` so section-11 can show non-blocking §23.2 warnings.
8. Saving never changes run status, stage, or `storyboardFrameUrls`. Regeneration is a separate, explicit user action.

### 6.8 Blocker copy module

`apps/web/shared/marketplaceCapture/sequentialShotBlockerCopy.ts` — pure, no server imports (client and server both import it; section-02 already created this directory). One Thai sentence per blocker id, phrased as an actionable instruction, e.g.:

| id | Thai message (suggested; wording adjustable, id set is not) |
|---|---|
| `prompt_too_long_for_image_provider` | `"prompt ภาพยาวเกินขีดจำกัดของโมเดล กรุณาย่อข้อความให้สั้นลง"` |
| `prompt_too_long_for_video_provider` | `"prompt วิดีโอยาวเกิน 2,000 ตัวอักษร กรุณาย่อข้อความ"` |
| `video_global_block_missing` | `"prompt วิดีโอต้องมีบล็อกล็อกสินค้า (global block) ครบทุกช็อต"` |
| `price_claim_detected` | `"พบข้อความเกี่ยวกับราคา/ส่วนลด ซึ่งห้ามใช้ในรีวิว กรุณาลบออก"` |
| `dialogue_exceeds_shot_duration` | `"บทพูดยาวเกินความยาวช็อต กรุณาตัดให้สั้นลง"` |
| `reference_index_mapping_mismatch` | `"การอ้างอิง @ImageN ในprompt ไม่ตรงกับภาพอ้างอิงจริง กรุณาแก้ให้ตรงกัน"` |
| `guardian_directive_missing` | `"ช็อตที่มีเด็กต้องระบุผู้ใหญ่ที่ดูแลอยู่ในภาพ"` |
| `assembly_demo_unverified` | `"ห้ามแสดงการประกอบ/ถอดชิ้นส่วน เพราะไม่มีเอกสารยืนยันจากหน้าสินค้า"` |
| `prompt_empty` | `"prompt ว่าง กรุณากรอกข้อความ"` |
| *(remaining §5.7 ids)* | one sentence each |

`sequentialShotBlockerMessageTh` falls back to `"ไม่ผ่านการตรวจสอบ (${id})"` — never returns a bare id and never returns an empty string.

### 6.9 What this section deliberately does NOT do

- Does not add a second reference-mapping validation call: section-06's submit fork already re-validates against the LIVE manifest immediately before `generateImageAsync`. T14 pins the behavior; no new code.
- Does not touch the QA/repair loop: the regenerated unit produces a normal `imageAttemptReviews[]` entry and flows through the same per-frame QA, repair budget, and publish-block gate.
- Does not submit or price video jobs for an edited `video_prompt` (section-09).

---

## 7. Files touched

| File | Change |
|---|---|
| `apps/web/server/routers/marketplaceCapture.ts` | ADD 2 procedures (§6.1) + their service imports. No existing procedure modified. |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | ADD `regenerateMarketplaceAutoReviewSequentialShot`, `saveMarketplaceAutoReviewSequentialShotOverride`, the pure helpers + `…ForTest` exports of §4, the `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT` constant; MODIFY the per-unit attempt-cap expression in `scheduleImageAttempt` (§6.4, one line + one log field). |
| `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts` | ADD `refreshSequentialShotPromptWithSkill` + its input/effects types + single-shot contract lines (§6.5). Full-loop behavior unchanged. |
| `apps/web/shared/marketplaceCapture/sequentialShotBlockerCopy.ts` | NEW — pure Thai blocker copy (§6.8). |
| `apps/web/server/routers/__tests__/marketplaceCapture.sequentialShotRegen.test.ts` | NEW — T1–T4. |
| `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialShotRegen.test.ts` | NEW — T5–T17. |
| `apps/web/shared/marketplaceCapture/__tests__/sequentialShotBlockerCopy.test.ts` | NEW — §5.3. |
| `apps/web/server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` | Read-only tripwire (section-01) — must stay green, no edits. |

**No DB migration.** All new state is additive JSONB inside `metadataJson.sequentialStoryboard` (Database Safety Protocol: Low risk, no DDL, row counts unaffected).

---

## 8. Invariants and guardrails

1. **One unit only.** `pendingImageRepairUnits` is *replaced* with a single-element array; the other 8 units' refs, attempt counters, and frame URLs are untouched (T5).
2. **No loop re-run, ever.** `loopReport` and `selected_version` are read-only in this section (T6). A per-shot action must never cost three planning rounds.
3. **Never silently rewrite user text.** Failing edits are rejected with the blocker id + Thai message; no trimming, no truncation, no `.slice(` on any final prompt; no repair directive is attached to a plain regen.
4. **Atomic rejection.** A rejected edit persists nothing and mutates no in-memory metadata (T12).
5. **Fail-closed where money or safety is involved** (mapping mismatch, capacity, governance/paid-stage freshness, publish-block codes) — all inherited from sections 02/06 and never bypassed. **Fail-open only** for the optional prompt refresh (T8).
6. **Bounded cost.** ≤ `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT` user regenerations per unit; the allowance is additive to (never a replacement for) the automatic repair budget; absent allowance ⇒ byte-identical behavior for 3x3/start_stop.
7. **Flags-off isolation.** Both mutations reject non-sequential runs and flag-off tenants before touching anything; the WS-1 snapshot suite stays byte-identical.
8. **Blocker ids are a frozen cross-section contract** (section-04 §5.7). Adding one requires a copy entry in the same change (§5.3 test enforces it).
9. **Untrusted product text.** Edited prompts are user/product-derived data: they pass the same deterministic preflight and the age-safe media enforcer before any provider call; no secrets or env values ever enter a prompt or a log payload.
10. **Small diff in a 27k-line file** edited by concurrent sessions — additive functions plus one expression change; verify via isolated copies per repo memory (`project_worktree_concurrent_reverts`).

---

## 9. Verification checklist

1. New suites green:
   - `npm --prefix apps/web run test -- server/routers/__tests__/marketplaceCapture.sequentialShotRegen.test.ts`
   - `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.sequentialShotRegen.test.ts`
   - `npm --prefix apps/web run test -- shared/marketplaceCapture/__tests__/sequentialShotBlockerCopy.test.ts`
2. Tripwires green and unchanged: `server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` (byte-identical), `server/services/__tests__/marketplaceAutoReviewService.test.ts`, `server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`, section-06's `marketplaceAutoReview.sequentialPipeline.test.ts`.
3. tsc gate: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — no NEW errors vs the ~987-error baseline. (Worktrees need `node_modules` symlinked from the main checkout; run vitest from `apps/web`.)
4. Grep guards: no `.slice(` applied to a sequential final prompt in the new code; no call to `runProductReviewSequentialStoryboardSkillLoop` from the regen path; no second `sequential-shot-` unit-id string literal (the id builder is the single source).
5. Manual trace (internal tenant, flag on): edit shot 3's image prompt to an over-budget string ⇒ Thai rejection naming `prompt_too_long_for_image_provider`, nothing persisted; fix it, save ⇒ `shotOverrides["3"]` visible in run metadata; press "สร้างภาพนี้ใหม่" ⇒ exactly ONE `media_request` in `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl` carrying `__unit_id: sequential-shot-03`, the override prompt, the multi-angle `referenceImageUrls` + manifest; the other 8 frame URLs unchanged; after QA passes, a fresh Storyboard Review is created with `previousStoryboardReviewId` recorded.