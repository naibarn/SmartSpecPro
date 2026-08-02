<!-- SECTION: section-13-scene-mutations-ui -->

# Section 13 — Scene Visual State mutations + UI

## Current-worktree override (binding)

Both mutations lock/reload fresh data and require `expectedRevision`; stale updates
return `CONFLICT`. Follow Astryx discovery/component/token rules and cover loading,
disabled, empty, stale/replan, conflict, save error, keyboard/focus and responsive
states. Record existing-pattern reuse and browser evidence at 390x844, 768x1024 and
1440x900. Neighbor-anchor generation stays deferred until the separate child flag/P1b lands; when a persisted anchor stamp is already present, P1a may display its read-only provenance badge.

**Feature:** VD P1 / Feature 138 (scene continuity), Step 3.
**Flag:** `verticalDramaSceneContinuity` (tenant flag, default `false`).
**Depends on:** section-02 (flag + resolver), section-05 (pure module), section-09 (scene-state skill + service), section-10 (storage + carry-over), and section-11 (P1a injection). Section 12 is a later canary and is not a P1a dependency.
**Blocks:** section-14 (joint verification).
**Parallelizable with:** nothing — it is the last Step-3 section.

All paths are relative to `apps/web/` unless noted. Line anchors were verified at HEAD `941547ff1`; sections 01, 02, 03, 06, 07, 10, 11 and 12 all edit `server/routers/verticalDramaEpisodes.ts` before this one, so **locate every anchor by symbol name or adjacent literal, never by line number**.

Test command (always from `apps/web`, never the repo root — from the root vitest globs the monorepo and dies on an unreadable directory):

```bash
cd apps/web && npx vitest run <paths> --reporter=basic
```

---

## 1. What this section delivers

Everything the *user* can see and do with a Scene Visual State. Sections 09–12 authored, stored, injected and attached it; nothing so far is visible or controllable.

| # | Deliverable | Where |
|---|---|---|
| 1 | `planSceneVisualState` mutation (explicit "plan this scene's lock", LLM-metered, idempotent unless `force`) | ROUTER |
| 2 | `updateSceneVisualState` mutation (manual edit, zero LLM, sets `manualEdit: true`) | ROUTER |
| 3 | `flags.sceneContinuity` on `getEpisodeDetail` so the client can gate its own UI | ROUTER |
| 4 | Scene-lock row (status badge + summary + plan/edit actions) and its edit dialog | new client component file |
| 5 | The locations-bible card renders that row per scene | `VerticalDramaStoryboardPanel.tsx` |
| 6 | Per-shot **scene-lock chip** and per-shot **anchor provenance badge** on the shot card | `VerticalDramaStoryboardPanel.tsx` |
| 7 | Prop threading (workspace) + mutation wiring (episode page) | workspace + page |

ROUTER = `server/routers/verticalDramaEpisodes.ts` (~16 800 lines).
PANEL = `client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` (~9 000 lines).

**Copy is Thai-first**, matching every surrounding VD surface (§7 pins the exact strings — tests assert on them).

---

## 2. Background an implementer needs (do not re-derive)

### 2.1 The product problem

Vertical Drama renders each of a sub-episode's 9 start frames independently, so consecutive shots of one continuous **scene** come out as different places (lighting jumps sunset→midday, the set rearranges, wardrobe changes). Feature 138 P1 fixes this by authoring **one Scene Visual State per scene** — a compact lock (lighting, fixed elements, layout, staging axis, wardrobe, props) — injecting it into every prompt for that scene, and attaching the previous same-scene frame as a visual reference.

A **scene** is a group of shots sharing one location, keyed on `locationKey` **only** (never on name — a per-shot override resolves to an empty name, so name-keyed logic breaks for exactly the users who customized their shots).

### 2.2 Ground truth already in the codebase (verified)

| Thing | Anchor |
|---|---|
| Ownership/patch template to copy for both mutations | `setShotLocation` ROUTER `:9307-9386` — `verticalDramaProcedure` → `requireTenantId(ctx.tenantId)` → `parseId` → `loadOwnedEpisode({tenantId,userId,seriesId,episodeId})` → validate → spread-patch → `db.update(...)` → `return { startFramePlan: updatedPlan }` |
| Brand-new flag-gated procedure convention | `verticalDramaVoiceChainProcedure` ROUTER `:518-530` — `verticalDramaProcedure.use(requireFeatureFlag("<flag>"))`; flags-off throws FORBIDDEN **before any handler code runs**, i.e. byte-identical to the procedure not existing |
| Row-lock re-read pattern (concurrency) | ROUTER `:14645-14661` — `db.transaction` + `.for("update")` re-read of the jsonb column immediately before merge+write; the slow LLM call stays OUTSIDE the transaction |
| Service error → TRPCError mapping | ROUTER `:15422-15435`, `:16187-16195` — `InsufficientCreditsError` ⇒ `FORBIDDEN`, `VdSchemaValidationError` ⇒ `INTERNAL_SERVER_ERROR`, `RateLimitExceededError` ⇒ `TOO_MANY_REQUESTS` |
| Location roster/asset wrapper (name, description, primary image URL) | ROUTER `:2174-2214` (over `resolveLocationRosterRowByIdentity` `:2097` → `verticalDramaLocationStock.getPrimaryReferenceUrl`) |
| `getEpisodeDetail` client flag map | ROUTER `:8682-8699` (`speechBudget`, `qualityLoopV2`, `tieInQc`, `voiceChain`, `adBannerOverlay`, `textOverlaySuite`, …) |
| Locations-bible card (already groups by `locationKey`) | PANEL `:6145` (component), mounted `:2508-2514` **only when `seriesId && storyboard?.distinct_locations?.length`**, row `data-testid={`vd-location-bible-row-${locationKey}`}` `:6467` |
| Shot cards are a **flat** `shots.map` | PANEL `:3283` — there is **no scene-group wrapper**; do not build one in P1 |
| Per-shot location chip (where the scene chip belongs) | PANEL `:4373-4484`, chip testid `vd-storyboard-location-chip-${shotNumber}` |
| Badge pattern to copy | PANEL `:4614-4634` (start-frame engine badge: `<Badge variant="outline" className="gap-1 px-1.5 py-0 text-[9px]" title=… data-testid=…>`) |
| Client scene resolver mirror | `resolveEffectiveShotLocationKey` PANEL `:877-887` (exported, pure — override first, else the `distinct_locations` group containing the shot) |
| Client view types to mirror | PANEL `:554-594` (`VerticalDramaStartFramePlanFrame`, `VerticalDramaStartFramePlanView`) |
| Client flag-gating convention | boolean props (`qualityLoopV2Enabled`, `tieInQcEnabled`) fed from `episodeDetailQuery.data?.flags?.*` — page `:5515-5518`, workspace type `:611-612`, forwarding `:1409-1410` |
| Mutation wiring template | `VerticalDramaEpisodePage.tsx:2324-2346` (`useMutation` → `onSuccess` toast + `utils.verticalDramaEpisodes.getEpisodeDetail.invalidate()`, `onError: err => toast.error(err.message)`) |
| Dialog pattern | `ShotLocationPickerDialog` PANEL `:8908-…` (`role="alertdialog"`, `aria-modal`, backdrop click closes, inner `stopPropagation`, `data-testid`) |
| Local i18n convention | every VD component declares its own `type Lang = "th" \| "en"` + `const t = (lang, th, en) => …` (PANEL `:147-148`, and 5 sibling files) — duplicate it, do not export the panel's |

### 2.3 Two traps specific to this section

1. **The panel has two mount sites in the workspace** — `VerticalDramaEpisodeWorkspace.tsx:1204` (primary, the only one that receives `seriesId`) and `:1948` (rendered **only** when `!hasStoryboardShots`). Thread new props at `:1204`; the second mount has neither `seriesId` nor shots, so every scene affordance is inert there by construction. Record that in a comment — otherwise the next reader "fixes" it. (This is the *shipped-but-undiscoverable* failure class: a feature that only exists at one of several JSX sites.)
2. **`setShotLocation`'s existing tests live in `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`, which is the Gate-B cascade-poisoned file** (56 of 164 red at baseline: one throw plus 55 cascade from leaked `mockReturnValueOnce` queues). **Do not add tests there.** New router tests go in their own file (§8.1).

---

## 3. Contracts consumed from other sections (reference only — do not implement here)

### From section-02 (`shared/featureFlags.ts` + ROUTER)

```ts
TenantFeatureFlags["verticalDramaSceneContinuity"]                       // default false
resolveVerticalDramaSceneContinuityFlag(tenantId: string): Promise<boolean>
```

### From section-05 (`shared/verticalDramaSeries/sceneContinuity.ts` — pure, browser-safe)

```ts
type VdSceneVisualState;                 // the stored per-scene lock (fields in §4.2)
type VdSceneShotGroup;                   // { locationKey, shotNumbers[] }
type VdSceneAnchorSource;                // "approved" | "latest_generated"
buildSceneShotGroups(input): VdSceneShotGroup[];
resolveSceneVisualState(raw: unknown): VdSceneVisualState | undefined;   // lenient READ side
renderSceneContinuityLockBlock(state): string | undefined;               // deterministic
```

### From section-09 (`server/services/verticalDramaSceneVisualState.ts`)

The authoring service — vision-capable (the location's primary image is an input), credit-gated, with the `InsufficientCreditsError` / `VdSchemaValidationError` / `RateLimitExceededError` family. This section calls it as:

```ts
generateSceneVisualState(params): Promise<{
  state: VdSceneVisualState;
  creditsUsed: number;
  model: string;
  usedVision: boolean;
}>
```

> **If section-09 exported a different symbol name, adapt the call — never the semantics.** Confirm the real export before writing the mutation; do not add a second service.

### From section-10 (`shared/verticalDramaSeries/contracts.ts` + SFG helpers)

```ts
VerticalDramaStartFramePlan["sceneVisualStates"]?: Record<string /* locationKey */, VdSceneVisualState>
readSceneVisualStatesFromPlan(startFramePlan): Record<string, VdSceneVisualState>
upsertSceneVisualState({ current, next, origin, force }): { states, written, skippedReason? }
```

…carried through `projectStartFramePlan` with the three-way invalidation rule (unchanged ⇒ carry / changed + auto ⇒ drop / changed + `manualEdit` ⇒ keep and set `stale: true`).

### From section-12 — the anchor provenance stamp (**joint contract, pin this exactly**)

Section 12 writes it at generation time; **section 13 only reads it**:

```ts
// shared/verticalDramaSeries/contracts.ts — VerticalDramaStartFramePlan["frames"][number]
/** Provenance of the same-scene neighbor frame that was attached when THIS
 *  frame was generated (F138 P1). Absent on every frame generated before the
 *  flag was on, and on shots that had no earlier same-scene image. There are
 *  no cascades, so this records what was USED at generation time — it is not a
 *  live claim about the current state of the referenced shot. */
sceneAnchor?: {
  anchorShotNumber: number;
  mediaAssetId: number;
  source: VdSceneAnchorSource;
  attachedAt: string;   // ISO
};
```

If section 12 landed a different field name, **reconcile before implementing** — the badge is the only consumer, so one of the two must move. Section 13 is still implementable and fully testable ahead of section 12 (its tests supply the stamp as a fixture); with no writer, the badge simply never appears.

---

## 4. Server work

### 4.1 A flag-gated base procedure

Add beside `verticalDramaVoiceChainProcedure` (ROUTER `:528`):

```ts
/**
 * Base procedure for the Scene Visual State mutations (F138 P1) — the base
 * `verticalDramaSeries` gate PLUS the dedicated `verticalDramaSceneContinuity`
 * flag, same chained-middleware convention as `verticalDramaVoiceChainProcedure`.
 * Both procedures are brand new, so flag-off throws FORBIDDEN before any handler
 * code runs — byte-identical to them not existing.
 */
const verticalDramaSceneContinuityProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSceneContinuity")
);
```

### 4.2 `planSceneVisualState`

```ts
/**
 * Explicitly author (or re-author) this episode's Scene Visual State for one
 * scene — the "plan scene continuity" action. LLM-metered (section-09's
 * service gates and deducts credits). Idempotent unless `force`.
 *
 * Contrast with the LAZY authoring path (section-11), which must fail OPEN and
 * charge nothing on any failure: this is the explicit user action, so an
 * insufficient-credit / schema / rate-limit failure IS surfaced as an error.
 */
planSceneVisualState: verticalDramaSceneContinuityProcedure
  .input(z.object({
    seriesId: z.string().min(1),
    episodeId: z.string().min(1),
    locationKey: z.string().min(1),
    force: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => { /* … */ }),
```

Handler order (each step is a pinned rule):

| Step | Rule |
|---|---|
| 1 | `requireTenantId` → `parseId` ×2 → `loadOwnedEpisode` (cross-tenant ⇒ NOT_FOUND, never "exists but forbidden") |
| 2 | No `startFramePlan` / no `frames` array ⇒ `PRECONDITION_FAILED` (copy `setShotLocation`'s message shape) |
| 3 | Resolve scene groups with `buildSceneShotGroups({ distinctLocations: storyboard?.distinct_locations, overridesByShotNumber })`, where the override map is built from `plan.frames[].locationKey`. `groups.find(g => g.locationKey === input.locationKey)` ⇒ missing means `BAD_REQUEST` (mirrors `setShotLocation`'s unknown-key rejection: never persist a key that resolves to nothing) |
| 4 | Read the current state via `readSceneVisualStatesFromPlan(plan)[locationKey]`. **No LLM call and no write** when: it exists and `manualEdit === true` and `!force` ⇒ return `{ planned: false, skippedReason: "manual_edit" }`; it exists (auto) and `!force` ⇒ `{ planned: false, skippedReason: "already_planned" }` |
| 5 | Assemble authoring inputs via the shared helper (§4.4) and call section-09's service **outside** any transaction |
| 6 | Persist inside `db.transaction` + `.for("update")` re-read of `startFramePlan` (copy `:14645-14661`), merging via section-10's `upsertSceneVisualState({ origin: "planned", force })`. If a state for this key appeared meanwhile and `!force`, **keep the existing one** (first writer wins) and return it with `planned: false, skippedReason: "already_planned"`. Merge as `{ ...freshPlan, sceneVisualStates: … }` — every other plan key and every other scene must be untouched |
| 7 | `next.memberShotNumbers` = the resolved group's `shotNumbers`; `plannedAt` = now; `manualEdit` **not** set (this is auto authoring); `stale` cleared |
| 8 | Map service errors: `InsufficientCreditsError` ⇒ FORBIDDEN, `VdSchemaValidationError` ⇒ INTERNAL_SERVER_ERROR, `RateLimitExceededError` ⇒ TOO_MANY_REQUESTS |
| 9 | Return `{ startFramePlan: updatedPlan, sceneVisualState, planned, skippedReason?, creditsUsed? }` |

> **Why skipping is a return value, not a throw.** A `manualEdit` collision is a normal, expected state — the user's own hand-written lock is being protected. Throwing would burn a toast on a non-error and tempt a future "just force it" default; returning a reason lets the UI offer the explicit overwrite action (§7). Pinned decision; tested.

### 4.3 `updateSceneVisualState`

```ts
/**
 * Manual edit of one scene's Scene Visual State. Zero LLM calls, zero credits.
 * Always sets `manualEdit: true` — which is what protects the state from lazy
 * re-authoring (section-11) and from being dropped by plan regeneration
 * (section-10 keeps a manual state and marks it `stale` instead).
 */
updateSceneVisualState: verticalDramaSceneContinuityProcedure
  .input(z.object({
    seriesId: z.string().min(1),
    episodeId: z.string().min(1),
    locationKey: z.string().min(1),
    patch: z.object({
      lightingState: z.string().max(2_000).optional(),
      spatialLayout: z.string().max(2_000).optional(),
      stagingAxis: z.string().max(2_000).optional(),
      paletteMood: z.string().max(2_000).optional(),
      timeJumpSuspected: z.boolean().optional(),
      fixedElements: z.array(z.object({ name: z.string().max(200), placement: z.string().max(500) })).max(40).optional(),
      wardrobeInScene: z.array(z.object({ character: z.string().max(200), wardrobe: z.string().max(500) })).max(40).optional(),
      activeProps: z.array(z.object({ name: z.string().max(200), placement: z.string().max(500), fromShot: z.number().int().positive().optional() })).max(40).optional(),
      coverageGaps: z.array(z.string().max(500)).max(40).optional(),
    }).strict(),
  }))
  .mutation(async ({ ctx, input }) => { /* … */ }),
```

Rules:

- Same guards as §4.2 steps 1–3 (ownership, plan presence, known scene key).
- **Spread merge**: `{ ...existing, ...patch }` — omitted fields keep their previous values.
- Always sets `manualEdit: true` and **clears `stale`** (the user just reviewed it) — i.e. `upsertSceneVisualState({ origin: "manual" })`.
- `locationKey`, `memberShotNumbers`, `plannedAt`, `skillVersion`, `manualEdit`, `stale` are **not patchable** — `.strict()` rejects them at the schema boundary. `memberShotNumbers` is re-derived from the current group (a hand-edit should not resurrect stale membership).
- **No existing state ⇒ create a minimal manual one** from the patch (`resolveSceneVisualState` defaults strings to `""` and arrays to `[]`). Hand-writing a lock without paying for authoring is a legitimate flow.
- Same transactional persist as §4.2 step 6 — but a manual edit **always wins** over whatever it re-read (the user typed it).
- Returns `{ startFramePlan: updatedPlan, sceneVisualState }`.

### 4.4 One shared authoring-input helper

```ts
**Owner: section 11.** `buildSceneVisualStateAuthoringInput` is exported from
`server/services/verticalDramaSceneContinuityLock.ts` (section 11 §3.1). **Import
it; do not reimplement it here** — a second assembly is exactly how the lazy path
and the explicit path start authoring from different facts. Its signature, for
reference only:

```ts
/**
 * Assemble the authoring inputs for one scene's Scene Visual State — the
 * location's roster name/description/primary image URL (via the existing
 * wrapper at ROUTER :2174-2214), the member shots' canonical summaries, and the
 * scene group's own description. Defined and exported by SECTION 11.
 */
export async function buildSceneVisualStateAuthoringInput(params: {
  tenantId: string; userId: number; seriesId: number; episodeId: number;
  locationKey: string;
  group: VdSceneShotGroup;
  row: Awaited<ReturnType<typeof loadOwnedEpisode>>;
}): Promise<GenerateSceneVisualStateParams>;
```

### 4.5 `getEpisodeDetail` — the flag is already exposed (section 02 owns it)

`flags.sceneContinuity` is added by **section 02 §5.3b**, not here. It was moved
there because section 12's scene-ordered batch runner needs it and section 12 runs
first. **Consume it; do not add a second entry.**

Do **not** flag-gate `startFramePlan` itself — it is returned as a raw cast, so `sceneVisualStates` and `frames[].sceneAnchor` reach the client for free, and the client's own gate is what hides them.

> **Typecheck is a real guard here.** The client reads `episodeDetailQuery.data?.flags?.sceneContinuity` through tRPC type inference — omit the server field and `pnpm check` fails. That is the cheap proof; do not build a fixture-heavy `getEpisodeDetail` unit test for it (that procedure's existing coverage lives in the poisoned Gate-B file).

---

## 5. Client work — new component file

**New file:** `client/src/components/verticalDramaSeries/VerticalDramaSceneLockRow.tsx`

Why a new file: `VerticalDramaLocationsBibleCard` lives inside the 9 000-line panel and calls eight tRPC hooks, so anything rendered *through* it needs a large tRPC mock surface to test. A pure, props-only row + dialog can be mounted directly with **zero mocks**, and the panel keeps one integration test instead of ten.

Exports (types live here and are re-exported by the panel, so the workspace/page keep importing view types from the panel as they do today):

```ts
export type VerticalDramaSceneVisualStateView = {
  locationKey?: string;
  lightingState?: string;
  fixedElements?: Array<{ name?: string; placement?: string }>;
  spatialLayout?: string;
  stagingAxis?: string;
  wardrobeInScene?: Array<{ character?: string; wardrobe?: string }>;
  activeProps?: Array<{ name?: string; placement?: string; fromShot?: number }>;
  paletteMood?: string;
  timeJumpSuspected?: boolean;
  coverageGaps?: string[];
  memberShotNumbers?: number[];
  plannedAt?: string;
  skillVersion?: string;
  manualEdit?: boolean;
  stale?: boolean;
};

export type VerticalDramaShotSceneAnchorView = {
  anchorShotNumber?: number;
  mediaAssetId?: number;
  source?: string;      // kept a plain string for forward-resilience, like `promptMode.mode`
  attachedAt?: string;
};

export type VerticalDramaSceneVisualStatePatch = { /* the §4.3 patch shape, all optional */ };

/** One scene's lock status + actions, rendered inside the locations-bible row.
 *  Pure/props-only — no tRPC, no toasts, no fetching. Renders NOTHING when
 *  `enabled` is false. */
export function VerticalDramaSceneLockRow(props: {
  locale: Lang;
  locationKey: string;
  state?: VerticalDramaSceneVisualStateView;
  enabled?: boolean;
  planning?: boolean;
  saving?: boolean;
  onPlan?: (locationKey: string, force?: boolean) => void;
  onSubmitEdit?: (locationKey: string, patch: VerticalDramaSceneVisualStatePatch) => void;
}): JSX.Element | null;

/** Edit dialog. P1 edits the four prose fields + the time-jump checkbox; the
 *  three array fields are shown READ-ONLY (the mutation already accepts array
 *  patches, so P2's richer editor needs no server change). Copies
 *  `ShotLocationPickerDialog`'s structure (PANEL :8908). */
export function VerticalDramaSceneLockDialog(props: {
  locale: Lang;
  locationKey: string;
  state?: VerticalDramaSceneVisualStateView;
  saving?: boolean;
  onSubmit: (patch: VerticalDramaSceneVisualStatePatch) => void;
  onClose: () => void;
}): JSX.Element;
```

Behavioral rules:

- `enabled !== true` ⇒ return `null` (nothing rendered, no hooks with side effects).
- Status resolution, in this precedence: `stale` ⇒ "needs review" · `manualEdit` ⇒ "manual" · state present ⇒ "locked" · otherwise ⇒ "not locked".
- Summary line = the state's `lightingState`, trimmed and clamped (`line-clamp-2`); when empty, fall back to `spatialLayout`, else render no summary line.
- The plan action is **paid** and must say so in its label; when a state already exists the label switches to the explicit overwrite wording and calls `onPlan(locationKey, true)`.
- Submit sends **only changed fields** (diff the dialog draft against `state`), so an untouched field is never rewritten.
- Import `resolveSceneVisualState` from `@shared/verticalDramaSeries/sceneContinuity` for defensive normalization before reading fields (values arrive from jsonb; section-05 guarantees the module is browser-safe and import-free).

---

## 6. Client work — panel, workspace, page

### 6.1 `VerticalDramaStoryboardPanel.tsx`

1. **View types** (beside `:554-594`): add `sceneAnchor?: VerticalDramaShotSceneAnchorView` to `VerticalDramaStartFramePlanFrame`, and `sceneVisualStates?: Record<string, VerticalDramaSceneVisualStateView>` to `VerticalDramaStartFramePlanView`. Re-export the three view types from `./VerticalDramaSceneLockRow` so existing importers (workspace, page) keep one import source.
2. **New props** on `VerticalDramaStoryboardPanelProps` (all optional; defaults keep today's behavior):
   ```ts
   sceneContinuityEnabled?: boolean;                       // getEpisodeDetail.flags.sceneContinuity
   onPlanSceneVisualState?: (locationKey: string, force?: boolean) => void;
   planningSceneVisualStateForKey?: string | null;
   onUpdateSceneVisualState?: (locationKey: string, patch: VerticalDramaSceneVisualStatePatch) => void;
   savingSceneVisualStateForKey?: string | null;
   ```
   Destructure with `sceneContinuityEnabled = false` at the existing defaults site.
3. **Locations-bible card**: thread the five props plus `sceneVisualStates` into `VerticalDramaLocationsBibleCard` (`:6145` signature, `:2508-2514` mount) and render `<VerticalDramaSceneLockRow …>` inside each existing row (`:6463-6468`), **after** the description paragraph and **before** the generate/approve action block. Keep the mount gate untouched — the card must still not mount for storyboards with no `distinct_locations`.
4. **Shot card — scene-lock chip**: inside the existing location-chip row (the `flex flex-wrap items-center gap-2` wrapper at `:4433`), after the chip and the edit pencil, render a small badge when `sceneContinuityEnabled && sceneVisualStates?.[effectiveLocationKey]` exists. `title` = the state's lighting line (the fact the lock actually pins). `effectiveLocationKey` comes from the existing `resolveEffectiveShotLocationKey(...)` call already computed a few lines above — **reuse it, do not re-resolve**.
5. **Shot card — anchor provenance badge**: in the same row, render when `sceneContinuityEnabled && frame?.sceneAnchor?.anchorShotNumber`. Copy the engine-badge markup (`:4614-4634`). Wording is **provenance, not a live claim** (§7) — there are no cascades, so the anchored-to shot may since have been regenerated; the badge records what was used at generation time, which stays true. `title` additionally names the source ("อนุมัติแล้ว" / "ภาพล่าสุด").

All five additions are `X && Y ? (…) : null` expressions inside existing JSX — with the flag off nothing new is emitted.

### 6.2 `VerticalDramaEpisodeWorkspace.tsx`

Add the five props to `VerticalDramaStoryboardPanelData` (beside `:611-612`) with `/** See VerticalDramaStoryboardPanelProps.<name> */` doc comments, and forward them at the **primary** mount `:1204` (beside `:1409-1410`).

Add a one-line comment at the secondary mount `:1948` explaining that it renders only when `!hasStoryboardShots` and receives no `seriesId`, so every scene affordance is inert there — deliberate, not an omission.

### 6.3 `VerticalDramaEpisodePage.tsx`

Copy `setShotLocationMutation` (`:2324-2346`) twice:

```ts
const planSceneVisualStateMutation =
  trpc.verticalDramaEpisodes.planSceneVisualState.useMutation({
    onSuccess: res => { /* success vs skipped toast (§7), then
                          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate(); */ },
    onError: err => toast.error(err.message),
  });

const updateSceneVisualStateMutation =
  trpc.verticalDramaEpisodes.updateSceneVisualState.useMutation({
    onSuccess: () => { /* toast + invalidate getEpisodeDetail */ },
    onError: err => toast.error(err.message),
  });
```

Handlers `handlePlanSceneVisualState(locationKey, force?)` / `handleUpdateSceneVisualState(locationKey, patch)` pass `{ seriesId, episodeId, … }`. Wire into the `storyboardPanel` object beside `:5374` / `:5515-5518`:

```ts
sceneContinuityEnabled: episodeDetailQuery.data?.flags?.sceneContinuity,
onPlanSceneVisualState: handlePlanSceneVisualState,
planningSceneVisualStateForKey: planSceneVisualStateMutation.isPending
  ? (planSceneVisualStateMutation.variables?.locationKey ?? null) : null,
onUpdateSceneVisualState: handleUpdateSceneVisualState,
savingSceneVisualStateForKey: updateSceneVisualStateMutation.isPending
  ? (updateSceneVisualStateMutation.variables?.locationKey ?? null) : null,
```

**`planned: false` must not toast "success".** Map `skippedReason` to an informational toast that names the way out (§7) — a silent no-op button is the exact failure mode this project has shipped before.

---

## 7. Copy and test ids (pinned — tests assert on these)

| Element | `data-testid` | Thai | English |
|---|---|---|---|
| Scene lock block heading | `vd-scene-lock-${locationKey}` | ล็อกความต่อเนื่องของฉาก | Scene continuity lock |
| Status: locked | `vd-scene-lock-status-${locationKey}` | ล็อกแล้ว | Locked |
| Status: none | `vd-scene-lock-status-${locationKey}` | ยังไม่ล็อก | Not locked |
| Status: manual | `vd-scene-lock-status-${locationKey}` | แก้ด้วยมือ | Manual |
| Status: stale | `vd-scene-lock-status-${locationKey}` | ต้องตรวจสอบ | Needs review |
| Summary line | `vd-scene-lock-summary-${locationKey}` | *(the state's lighting text, verbatim)* | *(same)* |
| Plan action (no state) | `vd-scene-lock-plan-${locationKey}` | วางแผนล็อกฉาก (มีค่าใช้จ่าย) | Plan scene lock (paid) |
| Plan action (state exists) | `vd-scene-lock-plan-${locationKey}` | สร้างใหม่ทับของเดิม (มีค่าใช้จ่าย) | Re-plan and overwrite (paid) |
| Edit action | `vd-scene-lock-edit-${locationKey}` | แก้ไขล็อกฉาก | Edit scene lock |
| Dialog root | `vd-scene-lock-dialog-${locationKey}` | แก้ไขล็อกความต่อเนื่องของฉาก | Edit scene continuity lock |
| Dialog: lighting field | `vd-scene-lock-dialog-lighting-${locationKey}` | แสง / ช่วงเวลา | Lighting / time of day |
| Dialog: save | `vd-scene-lock-dialog-save-${locationKey}` | บันทึก | Save |
| Shot scene chip | `vd-storyboard-scene-lock-${shotNumber}` | ล็อกฉาก | Scene lock |
| Shot anchor badge | `vd-storyboard-scene-anchor-${shotNumber}` | สร้างโดยอ้างอิงภาพช็อต {N} | Generated using shot {N} as reference |
| Toast — skipped (manual) | — | ล็อกฉากนี้ถูกแก้ด้วยมือไว้ — กด “สร้างใหม่ทับของเดิม” ถ้าต้องการให้ AI เขียนทับ | This lock was edited manually — use “Re-plan and overwrite” to let the AI replace it |
| Toast — skipped (exists) | — | ฉากนี้มีล็อกอยู่แล้ว | This scene already has a lock |
| Toast — planned | — | วางแผนล็อกฉากเรียบร้อย | Scene lock planned |
| Toast — saved | — | บันทึกล็อกฉากแล้ว | Scene lock saved |

The anchor badge wording is **load-bearing**: "สร้างโดยอ้างอิงภาพช็อต N" (past-tense provenance), never "อ้างอิงช็อต N" (a live claim). A test asserts the exact string.

---

## 8. Tests first (TDD)

Write every file below and watch it fail for the right reason before touching source.

Conventions (from the existing codebase — do not invent new ones): Vitest 2.1.9; `environment: node` for server tests, jsdom only for `client/src/**/*.test.tsx` (add the `@vitest-environment jsdom` docblock, as the sibling panel tests do); router tests mock `../../_core/trpc` so `.mutation(fn)` returns the raw handler and call `router.procedure({ ctx, input })` with a plain `ctx`; fake the DB with thenable `selectChain(rows)` / `updateChain(rows)` stubs and queue **one `mockReturnValueOnce` per `db.select()` call site, in order**.

> **Mock hygiene (confirmed footgun):** `vi.clearAllMocks()` does **not** drain `mockReturnValueOnce` queues — only `mockReset()` does. Every `beforeEach` that queues `…Once` values must `mockReset()` those mocks, or one early throw poisons the rest of the file. This is exactly what produced Gate B's 55-test cascade.

### 8.1 `server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts` (new)

Template: the mock preamble of `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts:22-120` (copy it; **do not add tests to that file**) plus a spy on the flag middleware and a mock of section-09's service:

```ts
const { mockRequireFeatureFlag, mockGenerateSceneVisualState } = vi.hoisted(() => ({
  mockRequireFeatureFlag: vi.fn(() => (x: unknown) => x),
  mockGenerateSceneVisualState: vi.fn(),
}));
vi.mock("../../middleware/requireFeatureFlag", () => ({ requireFeatureFlag: mockRequireFeatureFlag }));
vi.mock("../../services/verticalDramaSceneVisualState", () => ({
  generateSceneVisualState: mockGenerateSceneVisualState,
  /* re-export the error classes the handler maps */
}));
```

```
flag gate
  registers the verticalDramaSceneContinuity middleware on both procedures
      (requireFeatureFlag called with the exact flag string — this is the
       flag-off proof; the middleware itself is stubbed in unit tests)

planSceneVisualState
  rejects a caller who does not own the series/episode with NOT_FOUND
  throws PRECONDITION_FAILED when the episode has no startFramePlan/frames
  throws BAD_REQUEST for a locationKey that matches no scene in this episode
  authors exactly once and persists at sceneVisualStates[locationKey]
  stores memberShotNumbers equal to the resolved group's shot numbers
  leaves every other plan key and every other scene byte-identical
  is idempotent: an existing auto state + no force ⇒ no service call, no db.update,
      planned:false / skippedReason "already_planned"
  refuses to overwrite manualEdit:true without force ⇒ no service call, no db.update,
      planned:false / skippedReason "manual_edit"
  force:true overwrites both of the above (exactly one service call, one update)
  applies per-shot locationKey overrides when resolving the scene group
  maps InsufficientCreditsError to FORBIDDEN (explicit path SURFACES it —
      contrast with section-11's lazy path, which must swallow it)
  maps VdSchemaValidationError to INTERNAL_SERVER_ERROR
  maps RateLimitExceededError to TOO_MANY_REQUESTS
  re-reads the plan under a row lock and keeps a state written concurrently
      (first writer wins; the LLM call happened outside the transaction)
  returns { startFramePlan, sceneVisualState, planned }

updateSceneVisualState
  enforces the same ownership / plan / unknown-key guards
  sets manualEdit:true
  clears stale:true
  spread-merges: fields absent from the patch keep their previous values
  creates a minimal manual state when the scene has none yet
  rejects a patch carrying manualEdit / memberShotNumbers / plannedAt (.strict)
  never calls the authoring service and never deducts credits
  writes exactly once and leaves other scenes untouched
```

### 8.2 `client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx` (new, jsdom)

Zero mocks — pure props-only component.

```
renders nothing at all when `enabled` is false, even with a full state
renders "ยังไม่ล็อก" and the paid plan action when there is no state
renders "ล็อกแล้ว" plus the lighting summary when a state exists
renders "ต้องตรวจสอบ" for stale:true and "แก้ด้วยมือ" for manualEdit:true
switches the plan action to the overwrite wording once a state exists and
    calls onPlan(locationKey, true)
calls onPlan(locationKey) with no force when there is no state
disables the plan action and shows the spinner while `planning`
opens the edit dialog, prefills the lighting field from the state
submits ONLY the changed fields (an untouched field is absent from the patch)
survives a malformed state object (missing arrays / non-string values) without throwing
```

### 8.3 `client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx` (new, jsdom)

Mount the panel **without `seriesId`** so the locations-bible card (and its eight tRPC hooks) never mounts — no tRPC mock needed, matching `VerticalDramaStoryboardPanel.modelFamilyBadge.test.tsx`. Supply `storyboard.distinct_locations` for scene resolution and `startFramePlan.frames[].sceneAnchor` as a fixture.

```
flag off (prop absent) ⇒ neither the scene chip nor the anchor badge renders
    (assert a guaranteed-present sibling testid FIRST so the negative cannot
     pass vacuously — copy modelFamilyBadge's anchoring technique)
flag off but sceneVisualStates + sceneAnchor present ⇒ still nothing
flag on + a state for the shot's effective location ⇒ scene chip renders,
    title carries the locked lighting text
flag on + a per-shot locationKey override ⇒ the chip follows the OVERRIDE's state
flag on + frame.sceneAnchor ⇒ badge renders the exact provenance string
    "สร้างโดยอ้างอิงภาพช็อต 2" (past tense)
flag on + no sceneAnchor on that frame ⇒ no badge for that shot only
badge title names the anchor source (approved vs latest generated)
```

Plus one integration case in the same file (or a sibling), mounting the panel **with** `seriesId` + `distinct_locations` and the tRPC preamble — this is the section's only expensive mock surface, enumerated here so nobody rediscovers it:

```
vi.mock("@/lib/trpc"): useUtils() -> { verticalDramaLocations: { list: { invalidate } },
                                       media: { getTask: { fetch } } }
  verticalDramaLocations: { list: { useQuery }, previewLocationPrompt: { useMutation },
    generateLocationImage: { useMutation }, resolveMediaAssetForImport: { useMutation },
    linkAsset: { useMutation }, approveAsset: { useMutation } }
  mediaModels: { list: { useQuery } }

Test: the bible row for a scene renders the scene-lock row and its plan action
Test: clicking it calls onPlanSceneVisualState with that row's locationKey
```

### 8.4 `client/src/components/verticalDramaSeries/__tests__/VerticalDramaEpisodeWorkspace.sceneContinuity.test.tsx` (new, jsdom)

Template: `VerticalDramaEpisodeWorkspace.imagePromptMode.test.tsx`.

```
forwards sceneContinuityEnabled + both callbacks from storyboardPanel to the
    primary panel mount (assert an affordance/badge appears and a click reaches
    the callback)  ← the "one JSX site updated, the other not" guard
renders no scene affordance through the fallback mount (no storyboard shots)
```

---

## 9. Flag-off byte-identity argument

1. Both mutations sit behind `requireFeatureFlag("verticalDramaSceneContinuity")`, so flag-off they throw FORBIDDEN before any handler code — identical to not existing.
2. `getEpisodeDetail` gains exactly one boolean field, `false` for every tenant that has not opted in. No existing field changes; no new `db.select` call site (the flag comes from `getTenantFeatureFlags`, a mocked service in every router test).
3. Every client addition is a `sceneContinuityEnabled && …` conditional inside existing JSX, with the prop defaulting to `false`, and the new component returns `null` when not enabled.
4. Nothing here touches a prompt builder, an attach list, a credit estimate or a persisted payload.

**Expected gate movement: none.** Gate A stays 266/266; the Gate B fail-set must be **identical** to the section-01 baseline, not merely a subset. Any movement is a bug in this section.

---

## 10. Verification

```bash
cd apps/web

# 1. This section's own suites
npx vitest run \
  server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaEpisodeWorkspace.sceneContinuity.test.tsx \
  --reporter=basic

# 2. Regression on the panel/workspace suites this section edits
npx vitest run client/src/components/verticalDramaSeries/__tests__ --reporter=basic

# 3. Types (the tRPC inference proof for flags.sceneContinuity lives here)
pnpm check

# 4. Gate A — 7 files, must stay 266/266 (exact list in section-01)
# 5. Gate B — regenerate the fail-set and diff against section-01's baseline; expect ZERO diff
```

**Never pipe a vitest run through `tail`** — it truncates the FAIL block. Extract the fail **set**, never the count:
`--reporter=basic 2>&1 | grep -E "^\s*FAIL " | sed 's/^ *FAIL *//' | sort -u`.

---

## 11. Risks and traps

| Risk | Mitigation |
|---|---|
| Props threaded at only one of the workspace's two panel mounts | §6.2 pins the primary mount and documents why the fallback is inert; §8.4 asserts it |
| Scene UI invisible because the locations-bible card never mounts (storyboard has no `distinct_locations`) | Known and correct — the card's mount gate is untouched. The **shot-card** chip/badge still render, so a scene-less storyboard is not a dead end |
| `planned: false` renders as a dead button | The mutation returns a `skippedReason` and the page maps it to an explicit informational toast naming the overwrite action (§6.3, §7) |
| `manualEdit` lock silently overwritten | Refusal is default; `force` is an explicit, differently-labelled action; tested both ways |
| Two concurrent plans clobber each other | Transactional `.for("update")` re-read; first writer wins for auto authoring, manual edit always wins |
| New tests added to the poisoned Gate-B file, inheriting its cascade | §2.3 / §8.1 — new file, own preamble, `mockReset()` in `beforeEach` |
| Badge reads as a live claim after the anchored-to shot is regenerated | Provenance wording pinned in §7 and asserted verbatim; no cascades is a deliberate credit-protection decision |
| `sceneAnchor` field name drifts from section 12's writer | §3 declares it a joint contract; reconcile before implementing. With no writer the badge is simply absent — never a crash |
| Editing arrays in the dialog balloons scope | P1 edits four prose fields + one boolean; arrays are read-only in the UI but already accepted by the mutation, so P2 needs no server change |
| Client re-declares view types that drift from the server | Types are defined once in `VerticalDramaSceneLockRow.tsx` and re-exported by the panel — one definition, not three |

---

## 12. Done when

- [ ] `planSceneVisualState` and `updateSceneVisualState` exist on `verticalDramaSceneContinuityProcedure`, with `setShotLocation`'s ownership guards, the documented skip/force semantics, the transactional persist, and the three error mappings.
- [ ] `buildSceneVisualStateAuthoringInput` is the single authoring-input assembly shared with section-11 (no duplicate).
- [ ] `getEpisodeDetail` returns `flags.sceneContinuity`.
- [ ] `VerticalDramaSceneLockRow.tsx` exists with the row, the dialog and the three view types; the panel re-exports the types.
- [ ] The locations-bible row renders the scene-lock row; the shot card renders the scene chip and the provenance badge; all five surfaces are gated on `sceneContinuityEnabled`.
- [ ] Workspace forwards all five props at the primary mount; the page wires both mutations with `getEpisodeDetail` invalidation and the skipped-reason toasts.
- [ ] All four new test files are green; the existing `verticalDramaSeries` client suites are unchanged.
- [ ] `pnpm check` reports no new errors.
- [ ] Gate A 266/266; Gate B fail-set diff versus section-01's baseline is **empty**.
- [ ] With the flag off, the episode page renders byte-identically to before (manual check plus the flag-off tests).

---

## 13. Handoff to section-14

- Manual smoke, internal tenant, both flags ON: a 2-shot same-scene pair shows the **same** locked lighting text in both prompts, shot 2's generation attaches shot 1's frame at prompt **and** render time, and shot 2's card shows "สร้างโดยอ้างอิงภาพช็อต 1".
- Flag-off proof: the same episode with `verticalDramaSceneContinuity` off shows no scene row, no chip, no badge, and both mutations return FORBIDDEN.
- Explicitly **out of scope for P1** (do not add here): scene continuity QC verdicts/badges, the generation-mode advisory chip, automatic re-render cascades, array editing in the dialog, and any scene-group wrapper around the flat shot list.
