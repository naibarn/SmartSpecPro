I have verified all the anchors I need. Now I will produce the section content.

# Section 01 — Flags and Shared Schema Foundation

- **Section id:** `section-01-flags-and-schemas`
- **Feature:** 136 — Marketplace Auto Review: Sequential Shot Storyboard (spec v1.3.0, Phases 1–5 only)
- **Milestone:** M1 Foundation (dark)
- **Depends on:** nothing (this is the first section — everything else depends on it)
- **Blocks:** all other sections (02–12)
- **Test command:** `npm --prefix apps/web run test -- <files>` (run from repo root; vitest resolves inside `apps/web`)
- **Sources:** `../claude-plan.md` WS-1, `../claude-plan-tdd.md` WS-1, `../spec.md` §7, §12.6, §20.1, §26, §27 (isolation snapshots), `../claude-research.md` §1.3, §5, §8.1–8.2, `../claude-interview.md` auto-decisions 1–2

---

## 1. Objective

Make the entire Feature 136 surface *exist but stay dark*:

1. Two independent tenant feature flags exist end-to-end (shared types → allowlist → defaults → admin panel groups), both default `false`:
   - `marketplaceSequentialStoryboard` — gates the new strategy.
   - `marketplaceReviewEvidenceGuard` — gates the shared evidence guards (section 07).
2. The new frame-strategy enum member `sequential_shot_storyboard` is accepted by every schema/union layer (shared autoPlan zod, tRPC router, service union, `resolveFrameStrategy`).
3. Five new optional override fields exist in the shared autoPlan schemas (`confirmedAttributes`, `forbiddenClaims`, `targetAudience`, `userRequirements`, `sequentialImagePromptMaxChars`).
4. Server-side flag enforcement: typed `FORBIDDEN` with Thai copy at BOTH start entry points; plan service never emits the sequential strategy when the flag is off and surfaces a non-fatal blocker-shaped warning when it was explicitly requested.
5. A byte-identical snapshot baseline suite for existing strategies is committed and becomes the standing regression tripwire for every later section.

No DB migration anywhere: `marketplace_auto_review_runs.frameStrategy` is `varchar(40)` (`apps/web/drizzle/schema.ts:19075`) and the new value is 26 chars.

## 2. Background (read this before touching code)

Marketplace Auto Review generates a product-review storyboard through a durable run machine in `apps/web/server/services/marketplaceAutoReviewService.ts` (~27k lines, "SVC" below). Today there are three strategy values: `auto`, `storyboard_3x3_split` (one 3x3 grid image split into 9 frames), and `video_shot_start_stop`. Feature 136 adds a fourth, `sequential_shot_storyboard` (9 separate images, one prompt each), plus a shared evidence-guard package. This section wires only the flag/schema/gating skeleton — no pipeline behavior.

Verified anchors (2026-07-21; re-verify line numbers before editing — this repo has concurrent sessions):

| File | Anchor | What is there |
|---|---|---|
| `apps/web/shared/featureFlags.ts` | `:59` | `hermesMediaWorker: boolean;` — newest interface-member precedent (F135) |
| same | `:218` (`:269` entry) | `ALLOWED_FEATURE_FLAGS` set |
| same | `:427` (`:478` entry) | `FEATURE_FLAG_DEFAULTS` (hermesMediaWorker: `false`) |
| `apps/web/server/services/tenantFeatureFlagService.ts` | `:170-202` | `isFeatureEnabled` / `getTenantFeatureFlags` fill per-key defaults generically — **no service edit needed**; new keys resolve automatically |
| `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` | `:281-303` | "Media Production & HyperFrames" group; `hermesMediaWorker` entry at `:301` |
| `apps/web/shared/hyperframes/autoPlan.ts` | `:44-48` | `HyperframesAutoPlanDefaultsSchema.frameStrategy` enum (`auto`, `storyboard_3x3_split`, `video_shot_start_stop`) |
| same | `:159-190` | `HyperframesAutoPlanOverrideFieldSchemas` (override `frameStrategy` enum `:160-162`; `characterPresenceMode` pattern `:182-184`) |
| same | `:200-216` | `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES` — `satisfies Record<keyof HyperframesAutoPlanOverrideInput, string>`; `frameStrategy: "storyboard_3x3_split"` at `:202` |
| same | `:264-377` | `normalizeHyperframesAutoPlanOverrides` — per-field `safeParse` blocks (frameStrategy block `:271-277`) |
| same | `:466-467` | `canStart = access.capabilities.canStartAuto && blockers.length === 0` — **any entry in `blockers[]` kills canStart regardless of severity** |
| `apps/web/shared/hyperframes/contracts.ts` | `:75-94` | `hyperframesBlockerCodes` const array (source of `HyperframesBlockerCodeSchema` `:151`) |
| `apps/web/shared/hyperframes/statusCopy.ts` | `:151-251` | `HYPERFRAMES_BLOCKER_COPY: Record<HyperframesBlockerCode, …>` — compile-time forces a copy entry per code; `getHyperframesBlockerCopy` `:266` |
| `apps/web/server/routers/marketplaceCapture.ts` | `:678-681` | `startAutoReview` input `frameStrategy` zod enum |
| SVC | `:123-128` | `MarketplaceAutoReviewFrameStrategy` union + `…Input` (adds `"auto"`) |
| SVC | `:222` | `type AuthContext = { userId: number; tenantId?: string }` |
| SVC | `:6641-6652` | `resolveFrameStrategy(outputMode, requested)` — private, pure passthrough; unknown/auto → `storyboard_3x3_split` |
| SVC | `:15353-15402` | `buildShotFramePrompt(plan, shot, role, overlayTextMode)` — **private, no test export today** |
| SVC | `:15404-15414` | `buildMarketplaceAutoReview3x3StoryboardPromptForTest` (existing test export) |
| SVC | `:17549-17583` | `startMarketplaceAutoReviewRun` — `getDb()` at `:17575`, `resolveFrameStrategy` call at `:17583` |
| `apps/web/server/services/hyperframesRuntimeApiService.ts` | `:1309-1400` | `startAutoStoryboardReviewForApi` — fetches plan, plan-hash guard (`PRECONDITION_FAILED` `:1335-1339`), forwards `plan.defaults.frameStrategy` at `:1383` into `startMarketplaceAutoReviewRun` `:1377` |
| `apps/web/server/services/hyperframesAutoPlanService.ts` | `:126-139` | `buildBlocker(code, severity = "blocking")` — copy via `getHyperframesBlockerCopy(code, "th")` |
| same | `:291-353` | `buildHyperframesAutoPlanFromState` — **sync**, accepts `now?: Date`, builds defaults via overrides `:308-311`, blockers `:322-328`, passes raw `overrides` down to `buildHyperframesAutoStoryboardReviewPlan` `:341-352` (which re-applies overrides itself, `autoPlan.ts:450-453`) |
| same | `:355-412` | `getHyperframesAutoStoryboardReviewPlan` — async wrapper (DB reads + `resolveHyperframesFeatureAccessForTenant`) |
| `apps/web/server/services/mediaTransportResolver.ts` | `:96-101` | Flag-off rejection precedent: `getTenantFeatureFlags` → `TRPCError { code: "FORBIDDEN" }` |

Conventions this section must follow:

- **`FORBIDDEN`, not `PRECONDITION_FAILED`,** for flag-off start rejection (hermes precedent; deliberate deviation from spec §7.3 wording, recorded in `claude-interview.md` auto-decision 1). `PRECONDITION_FAILED` remains reserved for the stale-plan-hash guard.
- **`…ForTest` exports** are the repo pattern for unit-testing private SVC functions (40+ precedents in SVC).
- **Real behavior lives behind flags; with both flags off, every existing byte is preserved** (spec §7.4 — snapshot-tested here).

## 3. Binding decisions (do not re-litigate during implementation)

1. `resolveFrameStrategy` stays a **pure passthrough** — no flags argument, no async. Flag enforcement lives ONLY at the two start entry points. Rationale: background advancement of already-started runs must never re-check flags (spec §26 rollback: started runs continue under their recorded strategy).
2. The plan query **never throws** for flag-off sequential requests. It (a) strips the sequential override so `plan.defaults.frameStrategy` never carries the value when the flag is off, and (b) appends a blocker-shaped entry to the plan's **`warnings`** array — NOT `blockers`, because `canStart` requires `blockers.length === 0` (`autoPlan.ts:466-467`) and the sanitized plan must remain startable as 3x3.
3. New blocker code: **`sequential_storyboard_disabled`**. Thai description (also used verbatim in the FORBIDDEN error message): **"โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้"**.
4. The five new override fields are added to BOTH the defaults schema and the override schema as **`.optional()` WITHOUT `.default()`** — absent unless set. This deliberately deviates from the `characterPresenceMode` pattern (which has `.default("auto")`), because an unconditional default would inject new keys into every `getAutoStoryboardReviewPlan` response and break byte-identity with flags off. planHash safety is preserved because merged overrides land in `defaults`, which feeds the plan fingerprint (`autoPlan.ts:487-494`).
5. `startAutoStoryboardReview` router gets **no enum change** (it inherits strategy via `plan.defaults.frameStrategy`). Do **NOT** add parallel zod for `reviewTone` / `storytellingStructure` / `creativePresets` — they already exist in the `startAutoReview` anchors zod (`:730-758`).
6. Snapshot baselines are generated from **pre-change code and committed before any WS-1 production edit**. They are never regenerated (`-u` forbidden) for the remainder of Feature 136; a snapshot diff at any later section is a regression.

## 4. TDD — write these tests first

Step ordering is load-bearing:

1. **Step A (against unmodified code):** write and commit the snapshot suite (§4.5) plus baselines. Green on current `main` behavior.
2. **Step B:** write the failing tests of §4.1–§4.4 (new flags/schemas/gates do not exist yet — red).
3. **Step C:** implement §5 until §4.1–§4.4 are green **while §4.5 stays green without baseline regeneration**.

### 4.1 `apps/web/shared/__tests__/featureFlags.feature136.test.ts` (new file)

Clone the shape of `hermesMediaWorkerFeatureFlag.test.ts` (same directory):

- Both keys `marketplaceSequentialStoryboard` and `marketplaceReviewEvidenceGuard` are in `ALLOWED_FEATURE_FLAGS` and typed on `TenantFeatureFlags`.
- `FEATURE_FLAG_DEFAULTS` has both keys with value `false`.
- The two keys are distinct strings (guard against merge/rename), and independent — asserting one does not imply the other.

### 4.2 `apps/web/client/src/components/admin/__tests__/tenantFeatureFlagGroups.feature136.test.ts` (new file)

Pure data test — import `BASE_TENANT_FLAG_GROUPS` directly (no jsdom mount needed; do NOT mount the full panel — hermes memory: big admin panels cannot mount in jsdom):

- Exactly one `TenantFlagInfo` entry per new key exists, inside the "Media Production & HyperFrames" group.
- Both entries have non-empty `label` and `description` containing Thai text (assert with a Thai-codepoint regex, e.g. `/[\u0E00-\u0E7F]/`).

### 4.3 `apps/web/shared/hyperframes/__tests__/autoPlan.feature136.test.ts` (new file)

- `HyperframesAutoPlanDefaultsSchema` and `HyperframesAutoPlanOverrideInputSchema` accept `frameStrategy: "sequential_shot_storyboard"`; an unknown strategy string is still rejected by both.
- `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.frameStrategy` is still `"storyboard_3x3_split"`.
- `buildDefaultHyperframesAutoPlanDefaults()` output contains NONE of the five new override keys (absent, not `undefined`-valued — assert with `Object.prototype.hasOwnProperty`), and `JSON.stringify` of the defaults equals the pre-change shape for a fixed input.
- `normalizeHyperframesAutoPlanOverrides`:
  - copies each new field through when valid (`confirmedAttributes` record, `forbiddenClaims` array, trimmed `targetAudience` / `userRequirements`, `sequentialImagePromptMaxChars` int in `[1000, 4000]`);
  - drops out-of-bounds values (`sequentialImagePromptMaxChars: 999` / `4001` / non-int → key absent);
  - trims free text; empty-after-trim strings are dropped (no empty-string overrides);
  - note: the schema does NOT inject the 4000 default — the default materializes in section 04's effective-budget computation (`MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS`). Assert absence here, not `4000`.
- `applyHyperframesAutoPlanOverrides` merges the new fields into defaults and the `.strict()` parse still passes.
- New blocker code: `HyperframesBlockerCodeSchema.parse("sequential_storyboard_disabled")` succeeds; `getHyperframesBlockerCopy("sequential_storyboard_disabled", "th").description` equals the Thai copy of §3.3 (can live here or in a small addition beside `statusCopy.test.ts`).

### 4.4 `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialGate.test.ts` (new file)

- `resolveMarketplaceAutoReviewFrameStrategyForTest` (new export, §5.6): `("storyboard_images", "auto")` → `storyboard_3x3_split` (unchanged); `("storyboard_images", "sequential_shot_storyboard")` → passthrough; existing values passthrough.
- `assertMarketplaceSequentialStoryboardAllowedForTest` (new export, §5.7):
  - sequential + flag `false` → throws `TRPCError` with `code === "FORBIDDEN"` and message containing "โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้";
  - sequential + flag `true` → no throw;
  - `storyboard_3x3_split` / `video_shot_start_stop` / `auto` + flag `false` → no throw (existing strategies never gated).
- Wiring grep-guard (DB-free; precedent: the WS-4 "no slice()" grep-guard style): read `marketplaceAutoReviewService.ts` and `hyperframesRuntimeApiService.ts` from disk and assert each contains a call to the gate helper inside `startMarketplaceAutoReviewRun` / `startAutoStoryboardReviewForApi` respectively.
- Plan-service behavior via the sync builder (no DB): call `buildHyperframesAutoPlanFromState` with a fixed product bundle, a permissive `access` built from `resolveHyperframesFeatureAccess({ …, flags: { enabled: true, tenantAllowed: true, workerEnabled: true, … } })`, fixed `now`, and:
  - overrides `{ frameStrategy: "sequential_shot_storyboard" }` + `sequentialStoryboardEnabled: false` → `plan.defaults.frameStrategy === "storyboard_3x3_split"`, `plan.warnings` contains code `sequential_storyboard_disabled`, `plan.blockers` does NOT, `plan.canStart` still `true`;
  - same overrides + `sequentialStoryboardEnabled: true` → `plan.defaults.frameStrategy === "sequential_shot_storyboard"`, no such warning;
  - no overrides + flag `false` → output deep-equals the call without the new input field (dark path unchanged; `auto` never resolves to sequential).

### 4.5 `apps/web/server/services/__tests__/marketplaceAutoReview.snapshots.test.ts` (new file — written FIRST, baselines committed from pre-change code)

Byte-identical baselines with both flags off, via `toMatchFileSnapshot` (precedent: `hermesInvocation.test.ts`, `slideRender.test.ts`) into e.g. `__tests__/__snapshots__/feature136/…`:

- `getAutoStoryboardReviewPlan` shape: snapshot `JSON.stringify(buildHyperframesAutoPlanFromState({ … }), null, 2)` for a fixed fixture — fixed `auth {userId, tenantId}`, fixed product bundle, `activeRun: null`, explicit `access` (as in §4.4), and a **fixed `now`** (both `planHash` inputs and `expiresAt = now + 60s` are deterministic given `now`).
- `buildMarketplaceAutoReview3x3StoryboardPromptForTest({ plan, overlayTextMode })` for a fixed `AutoReviewPlan` fixture (clone the `basePlan` / `baseShot` fixture conventions from `marketplaceAutoReviewService.test.ts:3442-3469`) — one snapshot per overlayTextMode.
- `buildShotFramePrompt` output via the new export `buildMarketplaceAutoReviewShotFramePromptForTest` (§5.6) for the same fixture, at least one `start_frame` role case.

Rules stated in the test file header comment: baselines are regenerated NEVER; any diff in a later section is a regression, not a snapshot refresh.

## 5. Implementation deliverables

### 5.1 `apps/web/shared/featureFlags.ts`

Three additive edits, cloning the `hermesMediaWorker` precedent exactly:

- Interface members (beside `:59`):
  - `marketplaceSequentialStoryboard: boolean; // F136 — sequential 9-image storyboard strategy for Marketplace Auto Review`
  - `marketplaceReviewEvidenceGuard: boolean; // F136 — shared evidence guards (assembly/guardian/claims) for BOTH review modes`
- `ALLOWED_FEATURE_FLAGS` (`:218`): add both key strings.
- `FEATURE_FLAG_DEFAULTS` (`:427`): both `false` with a rollout comment.

No change to `tenantFeatureFlagService.ts` — default fill is generic (`:175-177`).

### 5.2 `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`

Two `TenantFlagInfo` entries appended to the "Media Production & HyperFrames" group (after `hermesMediaWorker`, `:301`). Suggested copy (Thai required by the tests; wording adjustable):

- `marketplaceSequentialStoryboard` — label: `"Storyboard 9 ภาพต่อเนื่อง (Sequential)"`, description: `"เปิดโหมดสร้างรีวิวแบบ 9 ภาพแยก (1 prompt ต่อ 1 ภาพ) พร้อมล็อกสินค้าหลายมุม — Feature 136"`.
- `marketplaceReviewEvidenceGuard` — label: `"Evidence Guard สำหรับรีวิวสินค้า"`, description: `"เปิดการ์ดหลักฐานร่วมทั้งสองโหมด: assembly guard, guardian presence, claim whitelist — Feature 136"`.

### 5.3 `apps/web/shared/hyperframes/autoPlan.ts`

1. **Enum member** in both places: defaults `frameStrategy` enum (`:44-48`) and override enum (`:160-162`) gain `"sequential_shot_storyboard"`. Base value `:202` stays `"storyboard_3x3_split"` — untouched.
2. **Five new fields** in BOTH `HyperframesAutoPlanDefaultsSchema` and `HyperframesAutoPlanOverrideFieldSchemas`, all `.optional()` and NO `.default()` (binding decision §3.4). Bounds (binding for cross-section consistency):
   - `confirmedAttributes: z.record(z.string().trim().min(1).max(120), z.string().trim().max(500)).optional()` with a `.refine` capping entries at 40;
   - `forbiddenClaims: z.array(z.string().trim().min(1).max(200)).max(50).optional()`;
   - `targetAudience: z.string().trim().min(1).max(500).optional()`;
   - `userRequirements: z.string().trim().min(1).max(2000).optional()`;
   - `sequentialImagePromptMaxChars: z.number().int().min(1000).max(4000).optional()`.
3. **`HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES`** (`:200-216`): the `satisfies Record<keyof HyperframesAutoPlanOverrideInput, string>` constraint forces a string entry per new override key — add `confirmedAttributes: ""`, `forbiddenClaims: ""`, `targetAudience: ""`, `userRequirements: ""`, `sequentialImagePromptMaxChars: "4000"`. `buildDefaultHyperframesAutoPlanDefaults` must NOT read them (fields stay absent by default).
4. **`normalizeHyperframesAutoPlanOverrides`** (`:264-377`): one `safeParse` block per new field, cloned from the `creativeBrief`/`shotCount` patterns; only assign on success with a present, non-empty value.
5. Known, accepted behavior note (do not "fix" here): `buildHyperframesAutoOverrideDiff` (`:397-420`) filters override keys to those present in base defaults — the new absent-by-default fields will not appear in `overrideDiff.fields`. Plan-hash staleness is still safe because merged values land in `defaults` inside the fingerprint. Section 11 may revisit the diff display.

### 5.4 New blocker code — `apps/web/shared/hyperframes/contracts.ts` + `statusCopy.ts`

- `contracts.ts:75-94`: append `"sequential_storyboard_disabled"` to `hyperframesBlockerCodes`.
- `statusCopy.ts:151-251`: the `Record<HyperframesBlockerCode, …>` type forces the new entry — add:
  - `copyId: "hyperframes.blocker.sequential_storyboard_disabled"`;
  - `label`: en `"Sequential storyboard disabled"` / th `"โหมด 9 ภาพต่อเนื่องยังไม่เปิด"`;
  - `description`: en `"The 9-image sequential storyboard mode is not enabled for this tenant."` / th `"โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้"`;
  - `nextAction`: en `"Use the 3x3 storyboard"` / th `"ใช้โหมด Storyboard 3x3"`.
- Existing `statusCopy.test.ts` / `assertHyperframesCopyCoverage` must stay green.

### 5.5 `apps/web/server/routers/marketplaceCapture.ts`

`startAutoReview` input `frameStrategy` enum (`:678-681`) gains `"sequential_shot_storyboard"`. Nothing else in this router changes in this section (`regenerateAutoReviewSequentialShot` is section 08; `productAngleImages` is section 02).

### 5.6 SVC union, resolver, and test exports (`marketplaceAutoReviewService.ts`)

- `MarketplaceAutoReviewFrameStrategy` union (`:123-125`): add `| "sequential_shot_storyboard"` (the `…Input` type derives automatically).
- `resolveFrameStrategy` (`:6645-6648`): add `requested === "sequential_shot_storyboard"` to the passthrough condition. No other change — stays sync, pure, private.
- New test exports beside the existing `…ForTest` cluster:

  ```ts
  export function resolveMarketplaceAutoReviewFrameStrategyForTest(
    outputMode: MarketplaceAutoReviewOutputMode,
    requested?: MarketplaceAutoReviewFrameStrategyInput
  ): MarketplaceAutoReviewFrameStrategy;

  export function buildMarketplaceAutoReviewShotFramePromptForTest(input: {
    plan: AutoReviewPlan;
    shot: AutoReviewPlanShot;           // match the private signature's shot type
    role: string;                        // e.g. "start_frame" — match private param type
    overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  }): string;
  ```

  Both are thin wrappers over the private functions (mirror `buildMarketplaceAutoReview3x3StoryboardPromptForTest` `:15404-15414`). `buildMarketplaceAutoReviewShotFramePromptForTest` is also a prerequisite for section 07's diff-shape snapshot.

### 5.7 FORBIDDEN gates at both start entry points

Pure decision core + thin async wiring, so the throw path is unit-testable without DB:

```ts
// SVC — private core + test export
function assertMarketplaceSequentialStoryboardAllowed(input: {
  frameStrategy: MarketplaceAutoReviewFrameStrategyInput | string | null | undefined;
  marketplaceSequentialStoryboard: boolean;
}): void;
// throws: new TRPCError({ code: "FORBIDDEN", message:
//   "โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้" })
// ONLY when frameStrategy === "sequential_shot_storyboard" && flag false; otherwise no-op.

export function assertMarketplaceSequentialStoryboardAllowedForTest(/* same input */): void;
```

Wiring (both mandatory — defense in depth per plan WS-1, even though the API path funnels into the service):

1. **`startMarketplaceAutoReviewRun`** (SVC, immediately after `resolveFrameStrategy` at `:17583`, before any anchor resolution / persistence / credit work): when the resolved strategy is sequential, `await getTenantFeatureFlags(auth.tenantId ?? "default")` and call the core. Guard the fetch behind the strategy check so existing strategies incur zero extra reads. Add the `getTenantFeatureFlags` import — SVC does not import it today (verified).
2. **`startAutoStoryboardReviewForApi`** (`hyperframesRuntimeApiService.ts`, after the plan fetch / before the `startMarketplaceAutoReviewRun` call at `:1377`): same check against `plan.defaults.frameStrategy`. Because the plan service sanitizes flag-off requests (§5.8), this fires only in flag-toggled-between-plan-and-start races — exactly what it is for. Add imports as needed.

### 5.8 Plan-service sanitization + warning (`hyperframesAutoPlanService.ts`)

- `buildHyperframesAutoPlanFromState` input gains `sequentialStoryboardEnabled?: boolean` (treat `undefined` as `false` — dark by default, keeps the function sync and DB-free for tests/snapshots).
- At the top, sanitize once and use the sanitized overrides EVERYWHERE in the function (both the local `applyHyperframesAutoPlanOverrides` call at `:308-311` and the pass-through to `buildHyperframesAutoStoryboardReviewPlan` at `:348` — the callee re-applies overrides itself, so passing raw overrides would leak sequential back into `defaults`):

  ```ts
  function sanitizeSequentialStoryboardOverrides(input: {
    overrides?: Record<string, unknown> | null;
    sequentialStoryboardEnabled: boolean;
  }): { overrides?: Record<string, unknown> | null; sequentialBlocked: boolean };
  // when overrides.frameStrategy === "sequential_shot_storyboard" && !enabled:
  //   return overrides clone WITHOUT the frameStrategy key, sequentialBlocked: true
  // otherwise: passthrough unchanged, sequentialBlocked: false
  ```

- When `sequentialBlocked`, append `buildBlocker("sequential_storyboard_disabled", "warning")` to a local warnings array and pass it as the (currently unused) `warnings` input of `buildHyperframesAutoStoryboardReviewPlan`. Do NOT push into `blockers` (§3.2 — canStart evidence `autoPlan.ts:466-467`).
- `getHyperframesAutoStoryboardReviewPlan` (`:355-412`): resolve the flag once via `getTenantFeatureFlags(input.auth.tenantId ?? "default")` (add import) and pass `sequentialStoryboardEnabled` into `buildHyperframesAutoPlanFromState`. This duplicates the single-row tenant read already inside `resolveHyperframesFeatureAccessForTenant` — accepted cost; do NOT widen `HyperframesFeatureAccessProjection` (its shared schema is `.strict()` and out of scope here).
- `autoPlanWorkerComplexityMultiplier` (`:167-182`) is intentionally untouched — sequential falls into the `frameMultiplier = 1` branch until section 10 adds the 1.10 factor.

## 6. Contracts this section exports to later sections

| Export | Consumed by |
|---|---|
| Flag keys `marketplaceSequentialStoryboard`, `marketplaceReviewEvidenceGuard` (types + defaults) | all sections |
| Enum literal `sequential_shot_storyboard` across autoPlan/router/SVC union | 02, 04, 05, 06, 08, 09, 10, 11 |
| Override fields (`confirmedAttributes`, `forbiddenClaims`, `targetAudience`, `userRequirements`, `sequentialImagePromptMaxChars`) in shared schemas | 04 (runtime contract), 05 (confirmation loop + persistence threading — the defaults→start-input→run-metadata mapping is deliberately NOT done here), 11 (UI fields) |
| Blocker code `sequential_storyboard_disabled` + Thai copy | 05, 11 |
| `sequentialStoryboardEnabled` input on `buildHyperframesAutoPlanFromState` | 05 (adds `evidencePreview`/`referenceCapacity` when flag on) |
| Test exports `resolveMarketplaceAutoReviewFrameStrategyForTest`, `buildMarketplaceAutoReviewShotFramePromptForTest`, `assertMarketplaceSequentialStoryboardAllowedForTest` | 04 (fallback prompts), 06, 07 (diff-shape snapshot) |
| Snapshot baseline suite (`marketplaceAutoReview.snapshots.test.ts` + committed baseline files) | every later section — must stay green untouched |

## 7. Acceptance checklist

- [ ] Snapshot suite written against pre-change code, baselines committed (Step A) — then still green after all §5 edits with zero baseline regeneration.
- [ ] §4.1–§4.4 tests green: `npm --prefix apps/web run test -- shared/__tests__/featureFlags.feature136.test.ts client/src/components/admin/__tests__/tenantFeatureFlagGroups.feature136.test.ts shared/hyperframes/__tests__/autoPlan.feature136.test.ts server/services/__tests__/marketplaceAutoReview.sequentialGate.test.ts server/services/__tests__/marketplaceAutoReview.snapshots.test.ts`
- [ ] Pre-existing suites untouched and green, notably `shared/hyperframes/__tests__/autoPlan.test.ts`, `statusCopy.test.ts`, `contracts.test.ts`, `runtimeApiSchemas.test.ts`, `server/services/__tests__/marketplaceAutoReviewService.test.ts`.
- [ ] tsc gate: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — no NEW errors vs the ~987-error baseline (compare, don't chase).
- [ ] Grep-verified: no `PRECONDITION_FAILED` introduced for flag gating; no edits to `approvedProductReferenceUrls`, `splitStoryboardGrid`, grid QA, or any stage machinery.
- [ ] With both flags off and no sequential override, `getAutoStoryboardReviewPlan` output is byte-identical (snapshot) and carries none of the five new keys.

## 8. Hazards and constraints

- **Concurrent sessions / prod-from-checkout:** this repo serves production from the main checkout and other sessions can revert working-tree edits. Prove changes via isolated copies or a worktree + ff-merge; in worktrees, symlink `node_modules` from the main checkout and run vitest via `npm --prefix apps/web run test` (never `pnpm` — blocked by the `packageManager` field). Never dev-mode in background; deploy is `cd apps/web && npm run build:deploy`, restart `smartspec-web.service` only because server `*.ts` changed here.
- **`.strict()` schemas everywhere:** `HyperframesAutoPlanDefaultsSchema`, `HyperframesAutoPlanOverrideInputSchema`, and the plan schema are strict — every new field must be declared inside the objects or parses will start rejecting. Same trap applies later in section 05 (`GetAutoStoryboardReviewPlanOutputSchema`).
- **`satisfies Record<…, string>` on the base-values table** breaks compilation if any new override key lacks a string entry (§5.3.3).
- **`HYPERFRAMES_BLOCKER_COPY` is `Record<HyperframesBlockerCode, …>`** — adding the code without copy is a compile error; adding copy without the code is unused. Do both together.
- **Do not put the gate in `resolveFrameStrategy`** and do not make it async — background stage advancement calls it for existing runs and must stay flag-free and cheap.
- **The warning-vs-blocker distinction is not cosmetic:** an entry in `blockers[]` flips `canStart` to false and re-routes `primaryAction`. The flag-off sequential request must leave a startable 3x3 plan.
- **27k-line SVC:** keep edits small and additive (union member, one condition line, two wrapper exports, one gate call + import). Re-read current line numbers immediately before editing; anchors here were verified 2026-07-21 and drift fast.
- No DB migration, no schema.ts change, no new tables — all Feature 136 state lives in existing JSONB metadata (later sections).

---

Summary of what I did: read the section prompt, all planning artifacts (`claude-plan.md` WS-1, `claude-plan-tdd.md` WS-1, `spec.md` §7/§12.6/§20.1/§26/§27, `claude-research.md`, `claude-interview.md`), and verified every load-bearing code anchor on disk (`/home/dev/projects/SmartSpecPro/apps/web/shared/featureFlags.ts`, `shared/hyperframes/autoPlan.ts`, `shared/hyperframes/contracts.ts`, `shared/hyperframes/statusCopy.ts`, `client/src/components/admin/tenantFeatureFlagGroups.ts`, `server/routers/marketplaceCapture.ts`, `server/services/marketplaceAutoReviewService.ts`, `server/services/hyperframesRuntimeApiService.ts`, `server/services/hyperframesAutoPlanService.ts`, `server/services/hyperframesFeatureAccessService.ts`, `server/services/tenantFeatureFlagService.ts`, `server/services/mediaTransportResolver.ts`). Two verification findings shaped the section beyond the plan text: (1) `canStart` requires `blockers.length === 0` (`autoPlan.ts:466-467`), so the flag-off plan entry must go into `warnings`, and (2) unconditional `.default()` values on the new override fields would break byte-identical plan snapshots, so the section mandates optional-no-default fields. The section content above is the deliverable for `/home/dev/projects/SmartSpecPro/specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/sections/section-01-flags-and-schemas.md`.