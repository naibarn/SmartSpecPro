<!-- SECTION: section-03-model-prompt-budget -->

# Section 03 — Per-model image prompt budget

**Feature:** VD P1 (Features 137 + 138, Phase 1)
**Plan source:** `planning/vd-p1-identity-scene-continuity/claude-plan.md` §3.2 · TDD stubs `claude-plan-tdd.md` §1b
**Runtime:** typescript-pnpm · **Test command:** `cd apps/web && npx vitest run <file>`
**All paths below are repo-relative; every source file lives under `apps/web/`.**
Line anchors were verified at HEAD `941547ff1` — re-verify before editing, they drift.

## Implementation record (2026-08-01)

- Extracted the media-router prompt-cap resolver into
  `server/services/modelPromptBudget.ts` and retained DB-first/static-fallback
  semantics.
- Added a 20,000-character absolute ceiling plus a widening-only VD helper;
  low-cap rows such as `z-image` keep the legacy 3,800 behavior.
- Threaded the selected model budget through prompt authoring, the
  policy-safe deterministic guard, final QC, paid start-frame render QC, and
  the bounded reference-frame input schema.
- Current HEAD already seeds `gpt-image-2-text-to-image` with
  `maxPromptLength: 20000`, `maxReferenceImages: 16`, and `maxItems: 16`.
  Therefore the earlier F3 claim that the seed still used 4 is stale; no seed
  edit is needed and Section 12 should evaluate the current capacity of 16.
- Live DB verification/update was not attempted because this checkout has no
  `DATABASE_URL`. Deployment must still verify the single row non-destructively
  before rollout; never run the full seed as a substitute.
- Focused proof: 115/115 relevant tests passed apart from one pre-existing
  reference-frame Thai-message assertion already present in the baseline;
  the touched-file typecheck completed with zero errors.
- Review was performed inline because the active repository policy did not
  authorize sub-agent delegation for this run.

---

## 1. Objective

Vertical Drama enforces exactly one flat image-prompt cap — `VD_IMAGE_PROMPT_MAX = 3800` — regardless of which image model the episode selected. The media layer already owns proper per-model cap machinery, but it is **module-private inside `server/routers/media.ts`** and VD never passes through it (VD calls `mediaGenerationService.generateImageAsync` directly).

This section:

1. **Extracts** the resolver pair out of `media.ts` into a new shared service `server/services/modelPromptBudget.ts` — one implementation, imported by both consumers.
2. Adds a **VD effective-budget helper** with the `20000` absolute ceiling and the `3800` default.
3. **Threads the selected model's `configJson`** into the two VD cap sites that matter (`:13068` post-authoring, `:10344` immediately before the paid render) and into the `policy_safe_rewrite` throw.
4. **Seeds `maxPromptLength: 20000`** on the kie.ai `gpt-image-2` row and applies the same value to the live DB row.

**Why it blocks section-11.** Section 11 appends a scene-continuity lock block to the start-frame prompt. In the `policy_safe_rewrite` engine the final prompt is assembled deterministically in code and the length check **throws `VdSchemaValidationError`** instead of trimming (`verticalDramaStartFrameGeneration.ts:2040-2045`). Adding a lock block to a prompt already near 3800 would convert a working shot into a crash. Section 03 raises the budget the check is measured against; it does **not** convert the throw into a truncation.

**Provider scoping is a hard requirement.** These numbers bind to individual model rows. Magnific (direct REST) and Higgsfield (MCP) keep today's behavior. Any model without a configured `maxPromptLength` keeps `3800`.

---

## 2. Position in the plan

| | |
|---|---|
| **Depends on** | `section-01-prereq-baseplan-fix` — the `:13068` cap site lives inside the mutation that section 01 repairs (`ReferenceError: basePlan is not defined`). Do not start until section 01 is green. |
| **Blocks** | `section-11-scene-lock-injection` |
| **Parallel with** | `section-02-feature-flags`, `section-04-motion-profile-module`, `section-05-scene-continuity-module` |
| **Feature-flag gated?** | **No.** This is a provider-capability correction, not a feature. It ships unflagged and must be a pure widening. |

Because it is unflagged, the backward-compatibility bar is higher than for the flagged sections: **no prompt that is valid today may become invalid**, and every untouched call site must stay byte-identical.

---

## 3. What exists today (verified)

### 3.1 The shipped resolver idiom — `server/routers/media.ts:651-694`

Three module-private functions, none exported:

- `resolveConfiguredMaxPromptLength(configJson)` `:651-667` — reads `configJson.maxPromptLength ?? configJson.max_prompt_length`, accepts `number | string`, rejects non-finite / `<= 0`, returns `Math.floor(parsed)` else `null`.
- `resolveModelMaxPromptLength(modelId, configJson)` `:669-679` — DB `configJson` wins; otherwise falls back to `getStaticModelById(modelId)?.configJson` (imported from `server/services/modelRegistry.ts` at `media.ts:67`).
- `assertMediaPromptWithinModelLimit({ value, modelId, configJson, fieldLabel })` `:681-694` — throws `TRPCError({ code: "BAD_REQUEST" })` with the message `"<label> is N characters and exceeds model limit M for the selected model. …"`. Six call sites: `:2295, 2477, 2676, 2837, 2994, 3336`.

### 3.2 The VD cap and its enforcement points

- `VD_IMAGE_PROMPT_MAX = 3800` — `shared/verticalDramaSeries/contracts.ts:1351` (`VD_VIDEO_PROMPT_MAX = 2000` at `:1359`).
- `server/services/verticalDramaPromptQc.ts`:
  - `promptCapForKind(kind)` `:118-120` — the only place the cap is chosen.
  - `ensurePromptWithinLimit(params)` `:351+` — reads `const maxChars = promptCapForKind(kind)` at `:355`, calls `assertProtectedFragmentsFit(kind, params.protectedFragments)` at `:357`, fast-path returns unchanged when within cap, otherwise refines via `cinematic-prompt-refiner-pro` (1 paid LLM call, then 1 stricter retry, then hard truncation). **Never throws for a length reason.**
  - `assertProtectedFragmentsFit(kind, fragments)` `:145-157` — exported but has **no external call sites**; its only caller is `:357`.
- `server/services/verticalDramaStartFrameGeneration.ts:2040-2045` — the `policy_safe_rewrite` engine's post-assembly check. **This one throws.**
- `server/routers/verticalDramaEpisodes.ts:13469` — `prompt: z.string().trim().min(1).max(VD_IMAGE_PROMPT_MAX)` on `generateShotReferenceFrameImage`.
- Client counter — `client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx:95, 4669, 7775`. Warn-only display hint; **out of scope** (see §9).

### 3.3 The model row is already fetched at both cap sites — it just is not forwarded

- **Render path** (`generateStartFrameImage`): `resolvedImageModelId` at `verticalDramaEpisodes.ts:10107`; the `mediaModels` row (`creditCost`, `configJson`) at `:10109-10117` as `pricingModel`. Already consumed for capabilities (`:10118`), resolution (`:10143`) and pricing (`:10144`). The QC call is at `:10344`, well inside the same handler.
- **Prompt-authoring path** (`generateShotStartFramePrompt`): the image model row is looked up at `:12812-12827` via `getModelsByTypeAsync("image")`, inside a `try/catch` that degrades to family `"other"`; `configJson` is already read at `:12824`. The QC call is at `:13068`, guarded by `if (shotStartFramePromptResult.usedMode !== "policy_safe_rewrite")`.

Nothing new needs to be queried. This is forwarding, not fetching.

---

## 4. Findings that modify the plan — read before writing code

These were verified against the current seed data and static registry. They are not optional caveats; two of them change what you write.

### F1 — `resolveVdImagePromptBudget` as literally specified can **narrow** the VD budget

The plan's formula is `clamp(modelMax ?? VD_IMAGE_PROMPT_MAX, 1, VD_IMAGE_PROMPT_ABSOLUTE_MAX)`, and the TDD stubs pin that behavior ("returns the model's limit when it is between 1 and the absolute max"). But `scripts/seed-media-models-kie-ai.ts:2208` seeds the **image** model `z-image` with `maxPromptLength: 500`. Applying the raw formula at a VD cap site would drop that episode's budget from 3800 to 500, forcing every shot through the paid refiner and then hard truncation — a severe, unflagged regression that contradicts the plan's own "widening only" guarantee.

**Resolution (implement exactly this):** keep `resolveVdImagePromptBudget(modelMax)` as the literal clamp the TDD specifies — it answers "what does this model allow". Add a **separate composition helper that VD call sites use**, which applies a never-narrow floor of `VD_IMAGE_PROMPT_MAX`. A model declaring less than 3800 therefore keeps today's exact behavior (VD already sends up to 3800 to `z-image` and never checks; P1 does not make that worse and does not attempt to fix it — record it as a P2 follow-up).

### F2 — `gpt-image-2` is not the only beneficiary

`google-banana-2` (`seed…kie-ai.ts:1724`) and `google-banana-2-lite` (`:1769`) are image rows that **already** declare `maxPromptLength: 20000`. Once threading lands, those two models widen automatically with no seed edit. Include one of them in the verification notes so the change is not mistaken for a gpt-image-2 special case.

### F3 — `gpt-image-2` already declares `maxReferenceImages: 4`

The plan says to add `maxReferenceImages: 16` "if not already present". It **is** present: `seed…kie-ai.ts:1576`, mirrored by `inputFields[0].maxItems: 4` at `:1583`. Per the plan's own condition, **do not change it in this section** — reference capacity is a different budget from prompt length and changing it alters trimming for every gpt-image-2 render.

**Escalate this to the conductor**, because it may be load-bearing for `section-12-neighbor-anchoring`: that section appends a fourth reference array trimmed at `imageCapabilities.maxReferenceImages`. At 4, character + location + product refs will very likely evict the scene anchor, making the anchoring feature a no-op for this model. Decide it in section 12 (or as a plan amendment), not here.

### F4 — editing the seed script alone changes nothing, and re-running it is destructive

`seed()` upserts with `ON CONFLICT ("modelId") DO UPDATE SET … "configJson" = EXCLUDED."configJson"` (`:2781-2791`) — it **overwrites the entire `configJson`** for every kie.ai row, discarding any admin-edited values in the live DB. A full re-seed is therefore not the deployment mechanism. See §8 for the targeted-update procedure.

### F5 — the DB model id is `gpt-image-2-text-to-image`

`"gpt-image-2"` is an alias (`seed…kie-ai.ts:1545, 1550-1551`), and `gpt-image-2` is **absent from the static registry** `server/services/modelRegistry.ts`. The 20000 value must therefore come from the DB row, and alias resolution stays upstream (`resolveEpisodeImageModelId` / `getModelsByTypeAsync`). Only the static-registry fallback branch is alias-sensitive; pass the same resolved model id the render path already uses.

---

## 5. Interfaces to create and change (stubs only)

### 5.1 New file — `apps/web/server/services/modelPromptBudget.ts`

Server-side is the correct home: the resolver falls back to `modelRegistry.getStaticModelById`, which is server-only (`modelRegistry.ts` imports `../db`), and every consumer is server-side.

```ts
/**
 * Per-model prompt-length budget — the single implementation.
 *
 * Extracted verbatim from `server/routers/media.ts:651-679` so the media
 * router and the Vertical Drama render path share one source of truth.
 * `media.ts` keeps `assertMediaPromptWithinModelLimit` (it throws a TRPCError,
 * which is a router concern); only the two pure resolvers move here.
 */

/** Absolute ceiling for any VD image prompt, regardless of what a model row claims. */
export const VD_IMAGE_PROMPT_ABSOLUTE_MAX = 20_000;

/** Read a declared cap from one configJson blob. Accepts both `maxPromptLength`
 *  and `max_prompt_length`, number or numeric string; rejects non-finite, zero
 *  and negative values; floors the result. Returns null when nothing usable. */
export function resolveConfiguredMaxPromptLength(
  configJson: Record<string, any> | null | undefined,
): number | null;

/** Per-model prompt cap: DB configJson wins, then the static registry row,
 *  else null (meaning "no model-specific limit"). */
export function resolveModelMaxPromptLength(
  modelId: string,
  configJson: Record<string, any> | null | undefined,
): number | null;

/** What this model allows, expressed as a VD budget.
 *  = clamp(modelMax ?? VD_IMAGE_PROMPT_MAX, 1, VD_IMAGE_PROMPT_ABSOLUTE_MAX)
 *  NOTE: may return LESS than VD_IMAGE_PROMPT_MAX for a low-cap model such as
 *  `z-image` (500). VD call sites must not use this directly — see
 *  `resolveVdImagePromptBudgetForModel`. */
export function resolveVdImagePromptBudget(modelMax: number | null): number;

/** The budget every Vertical Drama cap site uses.
 *  = max(VD_IMAGE_PROMPT_MAX, resolveVdImagePromptBudget(resolveModelMaxPromptLength(...)))
 *
 *  The `max` floor makes this change a WIDENING ONLY (finding F1): a model that
 *  declares less than 3800 keeps today's exact behavior instead of silently
 *  forcing every VD prompt through the paid refiner. Omitting the model row
 *  entirely also yields 3800, so every un-threaded caller is byte-identical.
 *
 *  Operational note for `gpt-image-2` (kie.ai): the 20000 cap pairs with a
 *  documented requirement that 2K/4K output needs an explicit `aspect_ratio`
 *  (an unset/`auto` ratio fails the task). VD always renders 9:16 explicitly,
 *  so this is documentation, not a code path, in P1. */
export function resolveVdImagePromptBudgetForModel(params: {
  modelId: string;
  configJson?: Record<string, any> | null;
}): number;
```

`VD_IMAGE_PROMPT_MAX` is imported from `@shared/verticalDramaSeries` — do **not** redeclare 3800 here.

### 5.2 `server/routers/media.ts` — extraction, zero behavior change

- Delete the bodies of `resolveConfiguredMaxPromptLength` `:651-667` and `resolveModelMaxPromptLength` `:669-679`.
- Import both from `../services/modelPromptBudget`.
- Keep `assertMediaPromptWithinModelLimit` `:681-694` exactly as-is, including its message string, and keep all six call sites untouched.
- Verify no import cycle is introduced: `modelPromptBudget.ts → modelRegistry.ts → ../db` only. `modelPromptBudget.ts` must not import anything from `server/routers/`.

### 5.3 `server/services/verticalDramaPromptQc.ts` — optional per-call override

```ts
export interface EnsurePromptWithinLimitParams {
  // …existing fields unchanged…
  /**
   * Per-model override for this ONE call, from
   * `resolveVdImagePromptBudgetForModel`. Omitted ⇒ `promptCapForKind(kind)`,
   * i.e. every existing caller is byte-identical. Clamped defensively to
   * [1, VD_IMAGE_PROMPT_ABSOLUTE_MAX]; a value BELOW the kind's default is
   * raised back to the default (widening-only invariant, finding F1).
   */
  maxChars?: number;
}

/** `promptCapForKind(kind)` unless `override` widens it. Single place the
 *  effective cap is decided; both `ensurePromptWithinLimit` and
 *  `assertProtectedFragmentsFit` route through it. */
export function resolveEffectivePromptCap(
  kind: VerticalDramaPromptKind,
  override?: number,
): number;
```

- `promptCapForKind` keeps its exact signature and return values — `verticalDramaPromptQc.test.ts:126-127` asserts them.
- `assertProtectedFragmentsFit(kind, protectedFragments, maxChars?)` gains an optional third parameter (safe: no external callers). `ensurePromptWithinLimit` forwards `params.maxChars`.
- `:355` becomes the resolved effective cap; everything downstream (`refineOnce`, `finalizeProtectedFragments`, `truncateAtSentenceBoundary`, log lines) already threads `maxChars` as a value and needs no further change.
- The `video` kind is untouched: `VD_VIDEO_PROMPT_MAX` stays 2000 and no video caller passes an override.

### 5.4 `server/services/verticalDramaStartFrameGeneration.ts` — budget for the throw

```ts
export interface GenerateStartFrameShotPromptParams {
  // …existing fields unchanged…
  /**
   * Effective image-prompt budget for the SELECTED image model, from
   * `resolveVdImagePromptBudgetForModel`. Used ONLY by the
   * `policy_safe_rewrite` engine's post-assembly length check
   * (which throws rather than trims). Omitted ⇒ `VD_IMAGE_PROMPT_MAX`,
   * producing a byte-identical result for every existing caller.
   */
  imagePromptMaxChars?: number;
}
```

At `:2040-2045`: measure against `params.imagePromptMaxChars ?? VD_IMAGE_PROMPT_MAX` and interpolate that same number into the error message. **Keep the throw.** It stays the last-resort guard; only the number it compares against changes.

### 5.5 `server/routers/verticalDramaEpisodes.ts` — three edits

| Site | Edit |
|---|---|
| `:10344` (`generateStartFrameImage`, immediately before the paid render) | Add `maxChars: resolveVdImagePromptBudgetForModel({ modelId: resolvedImageModelId, configJson: pricingModel.configJson })` to the `ensurePromptWithinLimit` call. Both values are already in scope from `:10107` / `:10117`. |
| `:13068` (`generateShotStartFramePrompt`, post-authoring, before persist) | Compute the budget once from the model row already resolved at `:12812-12827`, then (a) pass it as `maxChars` to `ensurePromptWithinLimit`, and (b) pass it as `imagePromptMaxChars` to the `generateStartFrameShotPrompt(…)` call earlier in the same handler, so the `policy_safe_rewrite` throw and the QC cap agree. Keep the budget resolution inside/next to the existing `try/catch` degrade-to-default posture: a missing or unresolvable model row must yield `VD_IMAGE_PROMPT_MAX`, never an exception. |
| `:13469` (`generateShotReferenceFrameImage` zod input) | `.max(VD_IMAGE_PROMPT_ABSOLUTE_MAX)` instead of `.max(VD_IMAGE_PROMPT_MAX)`. |

**On the zod bound (plan §3.2 item 3 / self-review A8).** This deliberately loosens a client-facing input bound from 3800 to 20000 characters. The bound stays finite, and the per-model runtime check still rejects anything the selected model cannot accept. Call it out explicitly in the PR description so a security reviewer sees it was a considered, bounded choice rather than an accident.

---

## 6. Tests first (TDD)

Write and run these **before** the implementation. Conventions are fixed by the repo — do not invent new ones:

- Vitest 2.1.9, always run **from `apps/web`** (from the repo root it globs the monorepo and dies).
- Service tests live in `server/services/__tests__/<name>.test.ts`; router tests in `server/routers/__tests__/<name>.test.ts`.
- **Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Any `beforeEach` that queues `…Once` values must `mockReset()` those mocks first, or one early throw poisons the rest of the file.

### 6.1 New unit suite — `server/services/__tests__/modelPromptBudget.test.ts`

Mock `../modelRegistry` (it transitively imports `../db`):

```ts
vi.mock("../modelRegistry", () => ({ getStaticModelById: vi.fn() }));
```

```
describe resolveModelMaxPromptLength
  Test: prefers the DB configJson value over the static registry
  Test: falls back to the static registry when configJson declares no limit
  Test: returns null when neither source declares a limit
  Test: accepts both `maxPromptLength` and `max_prompt_length` spellings
  Test: accepts a numeric string and floors a fractional value
  Test: ignores non-numeric, zero and negative values (returns null, no throw)
  Test: returns null for null / undefined / non-object configJson

describe resolveVdImagePromptBudget
  Test: returns VD_IMAGE_PROMPT_MAX (3800) when modelMax is null
  Test: returns the model's limit when it is between 1 and the absolute max
  Test: clamps anything above VD_IMAGE_PROMPT_ABSOLUTE_MAX (20000) to that ceiling
  Test: returns the raw low value (500) for a low-cap model — documents that this
        function is NOT the one VD call sites use (finding F1)
  Test: VD_IMAGE_PROMPT_ABSOLUTE_MAX is exactly 20000 (frozen-constant assertion)

describe resolveVdImagePromptBudgetForModel
  Test: 20000 for a row declaring maxPromptLength 20000 (gpt-image-2-text-to-image)
  Test: 20000 for `google-banana-2`, which already declares it — proves the change
        is not a single-model special case (finding F2)
  Test: 3800 when the row declares nothing and the static registry has nothing
  Test: 3800 — never 500 — for a row declaring maxPromptLength 500 (z-image):
        the widening-only floor (finding F1)
  Test: 3800 when configJson is omitted entirely (un-threaded caller parity)
  Test: 20000 when a row declares 999999 (absolute ceiling still applies)
```

### 6.2 `server/services/__tests__/verticalDramaPromptQc.test.ts` — additions

```
Test: promptCapForKind is unchanged — image 3800, video 2000  [existing, must stay green]
Test: ensurePromptWithinLimit with NO maxChars behaves exactly as today
      (fast path for a 3800-char prompt: refined false, creditsUsed 0, zero LLM calls)
Test: ensurePromptWithinLimit with maxChars 20000 returns a 5000-char prompt
      UNCHANGED and makes zero LLM calls / deducts zero credits
Test: ...with maxChars 20000 still refines a prompt longer than 20000
Test: ...with maxChars 500 is raised back to 3800 (a 3000-char prompt is untouched)
Test: ...with maxChars 99999 is clamped to VD_IMAGE_PROMPT_ABSOLUTE_MAX
Test: assertProtectedFragmentsFit measures against the override when one is given
Test: video kind ignores maxChars entirely (cap stays VD_VIDEO_PROMPT_MAX)
```

### 6.3 `server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts` — additions

This file is already the only suite that actually calls `generateStartFrameShotPrompt` (it carries the extra `../db` / `../enabledLlmModels` / `../intelligentModelSelector` mocks needed to reach `resolveStartFrameShotPromptModel`). Reuse its `baseShotParams({ imagePromptMode: "policy_safe_rewrite" })` helper.

```
Test: a policy-safe prompt longer than 3800 but within the model's declared limit
      is ACCEPTED (does not throw) when imagePromptMaxChars is 20000
Test: the same prompt still throws VdSchemaValidationError when
      imagePromptMaxChars is omitted (no declared limit ⇒ 3800)
Test: the thrown message quotes the EFFECTIVE budget, not a hardcoded 3800
Test: a prompt over 20000 throws even with imagePromptMaxChars 20000
Test: with imagePromptMaxChars omitted, the built prompt is byte-identical to the
      pre-change baseline for the existing policy-safe fixtures
```

### 6.4 `server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` — additions

This file already mocks `../../services/modelRegistry` with `getModelsByTypeAsync` (`:14-28`) and `../../services/verticalDramaPromptQc` with a pass-through `mockEnsurePromptWithinLimit` (`:250-260`) — both hooks you need.

```
Test: the selected image model's configJson REACHES the cap check — assert
      ensurePromptWithinLimit was called with expect.objectContaining({ maxChars: 20000 })
      when getModelsByTypeAsync returns a row with maxPromptLength 20000.
      (Assert the resolved budget, not merely the absence of a throw.)
Test: the same budget is passed to generateStartFrameShotPrompt as
      imagePromptMaxChars (the throw and the QC cap agree)
Test: a model row with no declared limit ⇒ maxChars resolves to 3800
Test: a model row declaring 500 ⇒ maxChars resolves to 3800, never 500
Test: getModelsByTypeAsync REJECTING (or returning no matching row) still yields
      3800 and never fails the mutation — the existing degrade-to-default posture
Test: the other tests in this file are unchanged (fail-set diff)
```

Add the mirror-image assertion for the render path in the suite that exercises `generateStartFrameImage`, using the `mediaModels` row already faked at `:10109-10117`: `maxChars` must equal `resolveVdImagePromptBudgetForModel` of that row.

### 6.5 Regression suites that must stay green (run unchanged, assert no new failures)

```bash
cd apps/web && npx vitest run \
  server/routers/__tests__/media.db-first.contract.test.ts \
  server/services/__tests__/verticalDramaPromptQc.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.referenceFrameMode.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.imagePromptMode.test.ts \
  --reporter=basic
```

`media.db-first.contract.test.ts` is the extraction's regression proof — it already pins `"exceeds model limit 1500"` and the `maxPromptLength: 5000` acceptance case. Its assertions must pass **without modification**; if any needs editing, the extraction changed behavior and is wrong.

Also re-run the **Gate A** set captured in section 01 and diff **Gate B** by fail-set identity (`… --reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`), never by count. Never pipe a vitest run through `tail` — it truncates the FAIL block.

---

## 7. Implementation order

1. Write `server/services/__tests__/modelPromptBudget.test.ts` (§6.1) — red.
2. Create `server/services/modelPromptBudget.ts` (§5.1) — green.
3. Extract from `media.ts` (§5.2); run `media.db-first.contract.test.ts` unmodified — green.
4. Add the QC override tests (§6.2) — red; then §5.3 — green.
5. Add the SFG policy-safe tests (§6.3) — red; then §5.4 — green.
6. Add the router tests (§6.4) — red; then §5.5 edits `:10344`, `:13068`, `:13469` — green.
7. Seed-script edit + live DB update (§8).
8. Full regression sweep (§6.5) + `pnpm check`.

Steps 2-6 each end green before the next begins. No step edits more than one production file.

---

## 8. Seed data and the live DB row

### 8.1 Seed script — `apps/web/scripts/seed-media-models-kie-ai.ts`

In the `gpt-image-2-text-to-image` entry (`:1544-1600`), add **one** key to `configJson` (`:1569-1599`), next to `generateType`:

```
maxPromptLength: 20000,   // kie.ai gpt-image-2 accepts prompts up to 20,000 chars
```

**Do not touch** `maxReferenceImages: 4` (`:1576`) or `inputFields[0].maxItems: 4` (`:1583`) — finding F3; escalate instead.

### 8.2 Live DB — targeted update, not a re-seed

Re-running the seed would overwrite the entire `configJson` of **every** kie.ai row from the script (`ON CONFLICT … "configJson" = EXCLUDED."configJson"`, `:2781-2791`), discarding admin-edited values. Follow the Database Safety Protocol:

1. Back up the table first: `pg_dump --data-only --table=media_models` into `.db-backups/`, and record `SELECT count(*) FROM media_models;`.
2. Apply a **single-row, single-key** `jsonb_set` on `media_models` where `"modelId" = 'gpt-image-2-text-to-image'`, adding `maxPromptLength = 20000` and leaving every other key intact.
3. Verify: row count unchanged, and the row's `configJson->>'maxPromptLength'` reads `20000` while `maxReferenceImages` still reads `4`.
4. Restore from the backup immediately if anything else changed.

Treat the seed-script edit as "correct on the next full re-seed"; the targeted update is what makes it live.

### 8.3 Deployment note

This is a server-side change (`server/**`), so after `cd apps/web && npm run build:deploy` a `sudo systemctl restart smartspec-web.service` **is** required.

---

## 9. Explicitly out of scope (leave byte-identical)

- **The `policy_safe_rewrite` throw stays a throw.** Do not convert it to truncation.
- **All other `ensurePromptWithinLimit` call sites** — `verticalDramaEpisodes.ts:6669, 10924, 11428, 12004, 12043, 13420, 14514` and pipeline `verticalDramaEpisodePipeline.ts:3848, 4013`. They pass no `maxChars` and keep the 3800 default.
- **The client prompt counter** (`VerticalDramaStoryboardPanel.tsx:95, 4669, 7775`). It is a warn-only display hint, not an enforcement point; a user on `gpt-image-2` will see an `n / 3800` warning while the server accepts up to 20000. Note it as a known cosmetic gap; UI work belongs to a later section or P2.
- **`VD_VIDEO_PROMPT_MAX`** and the whole video-prompt path.
- **`maxReferenceImages`** for any model (finding F3).
- **Magnific and Higgsfield** — provider scoping is a hard requirement; neither declares `maxPromptLength`, so both keep 3800 with no code touching them.
- **`assertMediaPromptWithinModelLimit`** stays in `media.ts` with its message string unchanged.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Extraction silently changes media-router behavior | `media.db-first.contract.test.ts` must pass **unmodified**; the two moved functions are copied verbatim, not "improved". |
| A low-cap model narrows the VD budget and burns refiner credits | The never-narrow floor in `resolveVdImagePromptBudgetForModel` (finding F1), pinned by a dedicated z-image test. |
| Model lookup failure breaks prompt generation | The `:12812` lookup already degrades to a default inside `try/catch`; the budget resolution must sit inside that same posture and fall back to 3800. Explicit test in §6.4. |
| Import cycle via `modelRegistry` → `db` | `modelPromptBudget.ts` imports only `modelRegistry` + `@shared/verticalDramaSeries`; never anything from `server/routers/`. Verified by `pnpm check` and by the unit suite mocking `../modelRegistry`. |
| Seed re-run wipes admin-edited config | Targeted `jsonb_set` (§8.2), not a re-seed. |
| Loosened zod bound (3800 → 20000) reads as an accident | Documented in the PR description as a deliberate, bounded choice (self-review A8). |

---

## 11. Done criteria

- [ ] `server/services/modelPromptBudget.ts` exists and is the only implementation of the two resolvers; `media.ts` imports them.
- [ ] `modelPromptBudget.test.ts` green, covering every stub in §6.1.
- [ ] `media.db-first.contract.test.ts` green **with zero edits**.
- [ ] A VD image prompt longer than 3800 but within the model's declared limit is accepted in the `policy_safe_rewrite` path; the same prompt still throws for a model with no declared limit.
- [ ] Router tests assert the **resolved budget value** (20000 / 3800 / 3800-for-500), not just the absence of a throw.
- [ ] `generateShotReferenceFrameImage`'s zod bound is `VD_IMAGE_PROMPT_ABSOLUTE_MAX`.
- [ ] Seed script carries `maxPromptLength: 20000` on `gpt-image-2-text-to-image`; the live row carries it too, with `maxReferenceImages` still `4` and `media_models` row count unchanged.
- [ ] Gate A unchanged; Gate B fail-set a subset of the section-01 baseline with **no new entries**.
- [ ] `cd apps/web && pnpm check` clean for every touched file.
- [ ] PR description notes: (a) the deliberate zod-bound loosening, (b) finding F3 (`maxReferenceImages: 4`) as an open question for section 12, (c) finding F1 (`z-image` keeps 3800 by design).

---

## 12. Notes for neighboring sections

- **section-11-scene-lock-injection** consumes this section's output. The scene lock block is appended to prompts whose budget is now per-model; section 11 must pass the same `imagePromptMaxChars` / `maxChars` values through to the deterministic policy-safe assembly path so the lock cannot push a prompt over a budget the model would in fact have accepted. Import `resolveVdImagePromptBudgetForModel` — do not re-derive it.
- **section-12-neighbor-anchoring** — see finding F3. `gpt-image-2` currently declares `maxReferenceImages: 4`, which may evict the scene anchor during `mergeAndTrimReferenceImageUrls` trimming. Decide there; this section deliberately did not change it.
- **section-14-joint-verification** — this section is unflagged, so its byte-identity proof is "no model row declares a limit ⇒ identical to baseline", not "flag off ⇒ identical". Fold that case into the joint flag-off proof.
