# section-02-feature-flags

## Current-worktree override (binding)

Register four default-off flags, not two: `verticalDramaSeriesLookLock`,
`verticalDramaMotionContracts`, `verticalDramaSceneContinuity`, and
`verticalDramaSceneNeighborAnchors`. Keep `verticalDramaSeriesPresetMixV2`
independent. The neighbor flag is active only when scene continuity is also on;
child-on/parent-off behaves fully off except for one bounded configuration warning.
Any later text assigning neighbor behavior to the parent flag is superseded here.

## Implementation record (2026-08-01)

- Registered the four binding rollout keys in the shared type, allowlist,
  default map, canonical Vertical Drama tuple, and Admin group. All default off.
- Added a pure shared resolver. `verticalDramaSceneNeighborAnchors` resolves on
  only when `verticalDramaSceneContinuity` is also on; invalid child-only
  configuration is surfaced by `neighborConfigurationInvalid` for a later
  bounded server warning.
- Kept `verticalDramaSeriesPresetMixV2` independent.
- Router reads and warning emission are intentionally deferred to their first
  behavior sections so this plumbing section has zero runtime behavior change.
- TDD proof: the two new focused test files pass (7/7). The pre-existing Admin
  completeness suite still reports the same unrelated nine ungrouped legacy
  flags; none is one of these four keys.
- Review was performed inline because the active repository policy did not
  authorize sub-agent delegation for this run.

> **Scope:** register the two P1 tenant feature flags and their router-local resolvers. Pure plumbing — **zero behavior change**, no prompt/payload/DB change, nothing reads the flags yet.
>
> **Source:** `../claude-plan.md` §3.1 (implementation) + `../claude-plan-tdd.md` §1a (tests first). Research anchors: `../claude-research.md`. Review finding A2 in `../reviews/self-review-round-1.md` fixed the flag names.
>
> **All work is in `apps/web`.** All file:line anchors were verified at HEAD `941547ff1`; section-01 lands before this one and edits `server/routers/verticalDramaEpisodes.ts`, so **anchor by symbol name, never by line number**.

---

## 1. Why this section exists

Two features ship dark on one branch:

| Flag | Gates | Spec |
|---|---|---|
| `verticalDramaMotionContracts` | Feature 137 P1 — motion profile, face-observability, motion contracts, judge dimension, draft-time guidance (sections 06, 07, 08) | `specs/feature/137-vertical-drama-identity-stable-i2v-pipeline/spec.md` |
| `verticalDramaSceneContinuity` | Feature 138 P1 — scene visual state lock, injection, neighbor anchoring, mutations, UI (sections 09, 11, 12, 13) | `specs/feature/138-vertical-drama-scene-continuity-engine/spec.md` |

Both default **`false`**. With both off, every downstream section must be
character-for-character identical to today ("flag-off byte-identical"). This
section provides the only switch that makes that provable.

### Naming decision (do not re-litigate)

The design specs call these `vdMotionContracts` / `vdSceneContinuity`. **Every
shipped VD tenant flag uses the long prefix** — `verticalDramaQualityLedgers`,
`verticalDramaRetentionHooks`, `verticalDramaSeriesTieInQc`,
`verticalDramaSeriesPresetMixV2`. A `vd*` key would be the only short one in the
file and would not match the admin grouping convention. **Use the long form.**
Sub-task 5 below fixes the resulting doc drift.

---

## 2. Dependencies

- **Depends on:** `section-01-prereq-baseplan-fix` (must be green first — it fixes
  a live `ReferenceError` in the same router file and establishes the Gate A /
  Gate B baselines this section must not disturb).
- **Blocks:** sections 06, 07, 09, 11, 12, 13 (each imports/calls a resolver
  named here).
- **Parallel with:** sections 03, 04, 05.

> ⚠️ **Concurrency hazard.** Section-03 also edits
> `server/routers/verticalDramaEpisodes.ts` (around `:10105-10113`, `:10344`,
> `:13068`, `:13469`). This section's router edit is one small contiguous insert
> near `:3570` — non-overlapping, but concurrent writes to a 13k-line file have
> reverted each other in this repo before. **Serialize the router write**: land
> this section's insert first (it is ~20 lines), re-read the file immediately
> before editing, and after writing, grep the file to confirm the insert
> survived.

---

## 3. Files touched

| File | Change | Risk |
|---|---|---|
| `apps/web/shared/featureFlags.ts` | 2 interface members, 2 allowlist entries, 2 defaults (`false`), 1 new frozen key tuple + 1 registration predicate | Low |
| `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` | 2 entries in the existing `"Vertical Drama Series"` group | Low |
| `apps/web/server/routers/verticalDramaEpisodes.ts` | 2 exported resolver helpers | Low |
| `specs/feature/137-.../spec.md`, `specs/feature/138-.../spec.md` | rename `vdMotionContracts` / `vdSceneContinuity` mentions | Doc only |

**New test files** (see §4).

**Do NOT touch `apps/web/shared/featureFlags.js`** — it is a stale compiled
artifact that does not even contain the F132 flags; nothing maintains it and
`.ts` resolves first.

There is no second flag enumeration anywhere: only `shared/featureFlags.ts` and
`client/src/components/admin/tenantFeatureFlagGroups.ts` list flag keys.

---

## 4. Tests first (TDD)

Write all three files and watch them fail before touching source.

Runner (always from `apps/web`, never the repo root):

```bash
cd apps/web && npx vitest run <paths> --reporter=basic
```

Environment is `node` for all three (`vitest.config.ts` uses jsdom only for
`client/src/**/*.test.tsx`; our admin-group test is a `.ts` **data** test that
never mounts a component — big admin panels cannot mount in jsdom).

### 4.1 `apps/web/shared/__tests__/featureFlags.vdP1.test.ts` (new)

Template: the shipped `shared/__tests__/featureFlags.feature136.test.ts` and
`shared/featureFlags.test.ts` (F132 flags). Zero mocks.

```ts
/**
 * VD P1 (Feature 137 + 138) tenant feature-flag registration.
 * Clones the shape of `featureFlags.feature136.test.ts` +
 * `shared/featureFlags.test.ts`'s F132 block.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS,
  areVerticalDramaP1FeatureFlagsRegistered,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("VD P1 feature flags (F137/F138)", () => {
  it("registers exactly the 2 documented P1 keys, in F137→F138 order (frozen set)", () => {/* toEqual on the tuple */});
  it("both flags are allowlisted and are real TenantFeatureFlags members", () => {/* ALLOWED_FEATURE_FLAGS.has + `const k: keyof TenantFeatureFlags = key` compile proof */});
  it("both flags default to false when a tenant has no explicit setting", () => {/* FEATURE_FLAG_DEFAULTS[key] === false */});
  it("areVerticalDramaP1FeatureFlagsRegistered() returns true", () => {/* … */});
  it("keeps the two flags independent (guard against merge/rename)", () => {/* spread one true, assert the other stays false */});
  it("does not collide with the F131/F132 key lists", () => {/* neither key appears in VERTICAL_DRAMA_SERIES_… nor VERTICAL_DRAMA_QUALITY_ENGINE_… */});
});
```

The "compile proof" line (`const typedKey: keyof TenantFeatureFlags = key;`) is
load-bearing: it is what makes a misspelled key fail `pnpm check`.

### 4.2 `apps/web/client/src/components/admin/__tests__/tenantFeatureFlagGroups.vdP1.test.ts` (new)

Template: `__tests__/tenantFeatureFlagGroups.feature136.test.ts` (imports
`BASE_TENANT_FLAG_GROUPS` directly — pure data, no component mount).

```ts
const THAI_TEXT_PATTERN = /[\u0E00-\u0E7F]/;
const VD_GROUP_TITLE = "Vertical Drama Series";

describe("VD P1 — tenant flag groups (Vertical Drama Series)", () => {
  it("adds exactly one entry per new flag inside the Vertical Drama Series group", () => {/* filter(...).toHaveLength(1) for each */});
  it("gives both new flags non-empty labels and Thai-language descriptions", () => {/* label.length > 0, description matches THAI_TEXT_PATTERN */});
  it("tags each description with its feature id so admins can trace it", () => {/* "F137" / "F138" via stringContaining */});
});
```

**The existing `client/src/components/admin/tenantFeatureFlagGroups.test.ts`
already contains the hard gate** — its `"covers every declared tenant feature
flag"` case asserts `getUngroupedTenantFeatureFlagKeys()` is `[]`. If you
register a flag in `featureFlags.ts` and forget the admin group, that test goes
red. Run it as part of this section; do not modify it.

### 4.3 `apps/web/server/routers/__tests__/verticalDramaEpisodes.p1FlagResolvers.test.ts` (new)

Template: **`server/routers/__tests__/verticalDramaEpisodes.resolveShotDialogueLines.test.ts`** —
the established "only import the exported helper, but the router file's
module-level imports still need mocking to load it at all" pattern (22
`vi.mock` calls). Copy that file's mock preamble verbatim, then add the flag
service mock:

```ts
const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));
```

```ts
describe("VD P1 router flag resolvers", () => {
  it("resolveVerticalDramaMotionContractsFlag returns true only for an explicit true", () => {/* … */});
  it("...returns false for an empty flags object (unknown/never-set tenant)", () => {/* {} */});
  it("...returns false when getTenantFeatureFlags resolves undefined (bare vi.fn() default)", () => {/* fail-closed via optional chaining */});
  it("...returns false for a truthy non-boolean value (=== true, not coercion)", () => {/* "true", 1 */});
  it("resolveVerticalDramaSceneContinuityFlag mirrors all of the above", () => {/* … */});
  it("the two resolvers are independent (one true does not enable the other)", () => {/* … */});
  it("each resolver reads the flags exactly once per call", () => {/* toHaveBeenCalledTimes(1) — the once-per-request convention */});
});
```

> **Why the resolvers are exported.** They have no call site until sections
> 06/07/11/12/13, so a module-private helper would be untestable and would ship
> unverified. This router already exports helpers purely for direct unit tests
> (`resolveShotDialogueLines`, `resolveEpisodeImageModelId`,
> `parseEpisodeAdBannerPlan`). Exporting is additive with zero runtime effect.
> Everything else about the helpers — name, signature, body, optional chaining,
> doc-comment style — copies `resolveVerticalDramaRetentionHooksFlag` exactly.

**Mock hygiene:** `vi.clearAllMocks()` does not drain `mockReturnValueOnce`
queues — only `mockReset()` does. This file should use plain
`mockResolvedValue` per case and `mockReset()` in `beforeEach`.

---

## 5. Implementation

### 5.1 `apps/web/shared/featureFlags.ts` — four registrations

Insert **inside the existing VD block**, immediately after
`verticalDramaRetentionHooks` in each of the three lists, so the VD keys stay
contiguous and ahead of the `marketplace*` / `videoIntelligence*` keys.

1. **Interface `TenantFeatureFlags`** — after
   `verticalDramaRetentionHooks: boolean;` (`~:205`), before
   `marketplaceRemotionRendererEnabled`:

   ```ts
   verticalDramaMotionContracts: boolean;  // F137 P1 — specs/feature/137-vertical-drama-identity-stable-i2v-pipeline — per-shot motion_profile + face-observability declarations, deterministic identity-risk floor, motion-contract lines in the video-prompt/judge runners, frame_analysis gate widening (fail-closed)
   verticalDramaSceneContinuity: boolean;  // F138 P1 — specs/feature/138-vertical-drama-scene-continuity-engine — per-scene Scene Visual State lock injected into every image/video prompt of that scene + same-scene neighbor frame anchoring (fail-closed)
   ```

2. **`ALLOWED_FEATURE_FLAGS`** — after `"verticalDramaRetentionHooks",` (`~:423`),
   two string entries.

3. **`FEATURE_FLAG_DEFAULTS`** — after `verticalDramaRetentionHooks: false,`
   (`~:635`), both `false`.

4. **New frozen key tuple + registration predicate** — append after
   `areVerticalDramaQualityEngineFeatureFlagsRegistered()` (`~:777`), mirroring
   the `VERTICAL_DRAMA_QUALITY_ENGINE_*` block one-for-one:

   ```ts
   /**
    * Canonical flag names for the VD P1 identity-stability + scene-continuity
    * wave (F137 P1 / F138 P1, planning/vd-p1-identity-scene-continuity).
    * Both default OFF (fail-closed) — the whole wave ships dark until
    * explicitly enabled per tenant. No alias map is needed: no legacy names
    * exist. NOTE: the design specs' short `vdMotionContracts` /
    * `vdSceneContinuity` names were rejected — every shipped VD flag uses the
    * long `verticalDrama*` prefix.
    */
   export const VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS = [
     "verticalDramaMotionContracts",
     "verticalDramaSceneContinuity",
   ] as const satisfies readonly TenantFeatureFlagKey[];

   export type VerticalDramaP1FeatureFlagKey =
     (typeof VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS)[number];

   /** True when both P1 flags are allowlisted AND default OFF. Rollout-safety
    *  assertion surface for the flag-off byte-identity gate (section-14). */
   export function areVerticalDramaP1FeatureFlagsRegistered(): boolean;
   ```

   (Body: the same `.every(key => ALLOWED_FEATURE_FLAGS.has(key) &&
   FEATURE_FLAG_DEFAULTS[key] === false)` one-liner as its F131/F132 siblings.)

The `as const satisfies readonly TenantFeatureFlagKey[]` is what makes the tuple
a compile-time-checked frozen set — do not weaken it to `string[]`.

### 5.2 `client/src/components/admin/tenantFeatureFlagGroups.ts` — admin grouping

Append two entries to the existing `"Vertical Drama Series"` group
(`title: "Vertical Drama Series"`, icon `🎬`), right after the
`verticalDramaRetentionHooks` entry (`~:206`). Thai descriptions, matching the
recent VD entries (F131T…F131AC) and the Feature 136 precedent:

```ts
{ key: "verticalDramaMotionContracts", label: "Motion Contracts", description: "F137 P1 — สัญญาการเคลื่อนไหวต่อช็อต: ให้ AI ประกาศมุมหน้า/ระยะการหันและระดับความเสี่ยง แล้วล็อกไม่ให้คลิปเผยด้านหน้าที่ภาพเริ่มต้นไม่เคยเห็น ลดอาการหน้าเปลี่ยนคน (specs/feature/137-vertical-drama-identity-stable-i2v-pipeline)" },
{ key: "verticalDramaSceneContinuity", label: "Scene Continuity", description: "F138 P1 — ล็อกสภาพฉากต่อสถานที่ (แสง/ของประจำฉาก/เลย์เอาต์/เสื้อผ้า/พร็อพ) ใส่ให้ทุกพรอมป์ในฉากเดียวกัน + แนบเฟรมก่อนหน้าของฉากเป็นภาพอ้างอิง (specs/feature/138-vertical-drama-scene-continuity-engine)" },
```

Keep `label` short and plain (matching `"Retention Hooks"`, `"Story Lock"`).
Keep the `"F137"` / `"F138"` markers — §4.2 asserts on them.

### 5.3 `server/routers/verticalDramaEpisodes.ts` — two resolvers

Insert immediately **after `resolveVerticalDramaRetentionHooksFlag`** (which
currently ends near `:3570`, in the run of `resolveVerticalDrama*Flag` helpers
that starts around `:3335`). Anchor on the symbol name, not the line number.

```ts
/**
 * Resolve the `verticalDramaMotionContracts` tenant flag (F137 P1,
 * planning/vd-p1-identity-scene-continuity §3.1) — mirrors
 * `resolveVerticalDramaRetentionHooksFlag` exactly (same "one focused helper
 * per flag-group" convention, optional-chaining fail-closed default for the
 * pre-existing tests that mock `getTenantFeatureFlags` as a bare `vi.fn()`).
 *
 * Called ONCE per request; the resulting boolean is threaded into services,
 * which never read tenant flags themselves. Every downstream service param it
 * feeds is optional and defaults to `false`, so omitting it reproduces
 * today's behavior byte-for-byte.
 *
 * Exported for direct unit coverage (same precedent as
 * `resolveShotDialogueLines` / `resolveEpisodeImageModelId` in this file) —
 * it has no in-file call site until sections 06/07 wire it.
 */
export async function resolveVerticalDramaMotionContractsFlag(
  tenantId: string
): Promise<boolean>;

/**
 * Resolve the `verticalDramaSceneContinuity` tenant flag (F138 P1). Same shape
 * and rationale as `resolveVerticalDramaMotionContractsFlag` above; gates the
 * Scene Visual State lock injection, neighbor anchoring, and the scene
 * mutations/UI (sections 09-13).
 */
export async function resolveVerticalDramaSceneContinuityFlag(
  tenantId: string
): Promise<boolean>;
```

Body for both is the two-line shipped form — **copy it, do not improvise**:

```ts
const flags = await getTenantFeatureFlags(tenantId);
return flags?.verticalDramaMotionContracts === true;
```

Rules:

- **Optional chaining is mandatory.** `getTenantFeatureFlags` is typed
  `Promise<TenantFeatureFlags>`, but ~30 existing router tests mock it as a bare
  `vi.fn()` that resolves `undefined`; a direct property access would throw the
  instant a wired call site runs and would redden every pre-existing test for
  that procedure. `?.` resolves to "flag off" — the correct fail-closed default.
- **Strict `=== true`.** Never truthiness — a stringy `"false"` in a tenant's
  jsonb must not enable a feature.
- **No `try/catch`.** `resolveVerticalDramaRetentionHooksFlag` has none; only
  the unregistered-flag `resolveVerticalDramaNativeAudioPromptsFlag` does.
  Adding one here would diverge from the group.
- **One helper per flag.** Do not merge them into a single
  `resolveVerticalDramaP1Flags()` — sections 06/07 need only the first and
  sections 11/12/13 need only the second; a merged resolver would make one
  feature's rollout implicitly depend on the other's DB read.

`getTenantFeatureFlags` is already imported at `:69` from
`../services/tenantFeatureFlagService` — no new import.

### 5.3b `getEpisodeDetail` must expose `flags.sceneContinuity` — MOVED HERE from section 13

**Why it moved.** Section 12's scene-ordered batch runner (the mechanism that makes
neighbor anchoring work at all) needs a client-side flag source. It originally
proposed falling back to "the presence of `startFramePlan.sceneVisualStates`" — but
on a **fresh sub-episode** that key does not exist yet, so the client would take the
legacy parallel `Promise.all` path and **no shot would ever anchor**, silently
reintroducing the exact failure the plan was rewritten to prevent. Section 13
created the real flag source, but section 13 runs *after* section 12. So the flag
exposure lands here, in the section that already owns flag registration.

Add exactly one entry to the `flags` map returned by `getEpisodeDetail`
(`server/routers/verticalDramaEpisodes.ts` ≈`:8682-8699`, beside `voiceChain`,
`adBannerOverlay`, `textOverlaySuite`), resolving it with this section's
`resolveVerticalDramaSceneContinuityFlag`:

```ts
// F138 P1 — the client's entire scene-continuity surface (section 13's chips,
// dialog and badges) and section 12's scene-ordered batch runner both gate on
// this. False for every tenant that has not opted in.
sceneContinuity: sceneContinuityEnabled,
```

Do **not** flag-gate `startFramePlan` itself — it is returned as a raw cast, so the
new jsonb keys reach the client for free and the client's own gate hides them.

Tests: add to this section's router suite —

```
Test: getEpisodeDetail returns flags.sceneContinuity === false for a tenant with no flag record
Test: ...=== true when the tenant flag is on
Test: adding the field introduces NO new db.select call (the flag comes from getTenantFeatureFlags)
```

Downstream: sections 12 and 13 **consume** this; neither re-creates it.

### 5.4 Nothing else

Do **not** add an alias entry to
`VERTICAL_DRAMA_SERIES_FEATURE_FLAG_ALIASES`, do not add a
`requireFeatureFlag` middleware guard, do not touch any procedure, service,
skill or schema. Every consumer arrives in a later section.

### 5.5 Doc drift (required, cheap)

Rename the P1 flag mentions so the specs match the code:

- `specs/feature/137-vertical-drama-identity-stable-i2v-pipeline/spec.md` —
  `vdMotionContracts` → `verticalDramaMotionContracts` (`~:398`, `~:811`, `~:923`).
- `specs/feature/138-vertical-drama-scene-continuity-engine/spec.md` —
  `vdSceneContinuity` → `verticalDramaSceneContinuity` (`~:64`, `~:493`, `~:509`).

Leave the **P2** name `vdSceneContinuityQc` (`~:72`, `~:369`, `~:494`) alone —
it is out of scope here; add a one-line note in the 138 spec's flag table that
when it lands it must follow the same long-form convention
(`verticalDramaSceneContinuityQc`). Planning docs under
`planning/vd-p1-identity-scene-continuity/` are a permanent historical record —
do not rewrite them.

---

## 6. Flag-off byte-identity argument

This section cannot change behavior, and that is provable by construction:

1. Both defaults are `false`, so `resolveFeatureFlags` returns `false` for every
   tenant that has not explicitly opted in.
2. No production code path reads either key — the only readers are the two new
   resolvers, which have no call site yet.
3. The admin grouping is presentation data only.

Therefore **Gate A must stay exactly 266/266 and the Gate B fail-set must be
byte-identical to the section-01 baseline** — not a subset, identical. Any
change in either is a bug in this section, not an expected cost.

---

## 7. Verification

```bash
cd apps/web

# 1. This section's own tests + the two pre-existing registration gates
npx vitest run \
  shared/__tests__/featureFlags.vdP1.test.ts \
  shared/featureFlags.test.ts \
  client/src/components/admin/__tests__/tenantFeatureFlagGroups.vdP1.test.ts \
  client/src/components/admin/tenantFeatureFlagGroups.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.p1FlagResolvers.test.ts \
  --reporter=basic

# 2. Types (the `keyof TenantFeatureFlags` compile proofs live here)
pnpm check

# 3. Gate A — must still be 266/266 (see section-01 for the exact 7-file list)
# 4. Gate B — regenerate the fail-set and diff it against section-01's baseline;
#    expect a ZERO-line diff.
```

**Never pipe a vitest run through `tail`** — it truncates the FAIL block.
Capture the Gate B **fail set**, not the count:
`--reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`.

---

## 8. Risks and gotchas

| Risk | Mitigation |
|---|---|
| Flag registered but not grouped in the admin UI | The pre-existing `tenantFeatureFlagGroups.test.ts` "covers every declared tenant feature flag" case fails loudly. Run it. |
| Concurrent edit to `verticalDramaEpisodes.ts` by section-03 reverts the insert | Serialize the router write; re-read before editing; grep for both resolver names after writing. |
| Key typo silently creating a dead flag (see the shipped `verticalDramaSeriesTieInReplan` / `verticalDramaSeriesNativeAudioPrompts` TODOs, where a resolver read an unregistered key for weeks) | The `const typedKey: keyof TenantFeatureFlags = key` compile proof + the frozen-tuple `toEqual` + `pnpm check`. |
| Someone "fixes" `flags?.x === true` into `!!flags.x` | Explicit test case for a truthy non-boolean and for `undefined` flags. |
| Editing the stale `shared/featureFlags.js` | Explicitly out of scope; it does not even contain F132. |
| Short-name drift back to `vdMotionContracts` | §5.5 doc rename plus the frozen-tuple assertion. |

---

## 9. Done when

- [ ] `verticalDramaMotionContracts` and `verticalDramaSceneContinuity` exist in
      `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`
      (both `false`).
- [ ] `VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS` +
      `VerticalDramaP1FeatureFlagKey` + `areVerticalDramaP1FeatureFlagsRegistered()`
      are exported from `shared/featureFlags.ts`.
- [ ] Both flags appear exactly once in the `"Vertical Drama Series"` admin group
      with a non-empty label and a Thai description carrying `F137` / `F138`.
- [ ] `resolveVerticalDramaMotionContractsFlag` and
      `resolveVerticalDramaSceneContinuityFlag` are exported from
      `server/routers/verticalDramaEpisodes.ts`, fail closed, and read the flags
      once per call.
- [ ] The three new test files are green; `tenantFeatureFlagGroups.test.ts` and
      `shared/featureFlags.test.ts` are still green.
- [ ] `pnpm check` reports no new errors.
- [ ] Gate A 266/266; Gate B fail-set diff against the section-01 baseline is empty.
- [ ] `specs/feature/137-*/spec.md` and `specs/feature/138-*/spec.md` use the long
      flag names.

---

## 10. Handoff contract for downstream sections

Later sections must use **exactly** these names — do not re-derive them:

```ts
// apps/web/shared/featureFlags.ts
TenantFeatureFlags["verticalDramaMotionContracts"]   // F137 P1, default false
TenantFeatureFlags["verticalDramaSceneContinuity"]   // F138 P1, default false
VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS
areVerticalDramaP1FeatureFlagsRegistered()

// apps/web/server/routers/verticalDramaEpisodes.ts
resolveVerticalDramaMotionContractsFlag(tenantId: string): Promise<boolean>
resolveVerticalDramaSceneContinuityFlag(tenantId: string): Promise<boolean>
```

Usage convention enforced by every consuming section:

- Resolve **once per request** in the router/mutation handler.
- Thread the resulting `boolean` into services as an **optional parameter
  defaulting to `false`** (e.g. `motionContractsEnabled?: boolean`,
  `sceneContinuityEnabled?: boolean`), so that omitting it reproduces today's
  behavior exactly. Services must never call `getTenantFeatureFlags` themselves.
- If a pipeline-only entry point genuinely has no router hop, follow the
  existing lazy-import + `.catch(() => null)` fail-closed pattern already used in
  `server/services/verticalDramaEpisodePipeline.ts` — but prefer threading.
