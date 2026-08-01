<!-- SECTION: section-15-series-look-lock -->

# Section 15 — Series Look Lock (Feature 139 P1)

This historical section number executes in Wave 2, before Features 137 and 138.

| Contract | Value |
|---|---|
| Depends on | sections 01–03 |
| Blocks | sections 08, 09, 11, 14 |
| Flag | `verticalDramaSeriesLookLock`, default off |
| Legacy flag | `verticalDramaSeriesPresetMixV2`, independent |
| Storage | `bible.presetVisualIdentity` + `bible.lookLockControl` |

## 1. Deliverables

1. Pure five-genre catalog and bounded validators.
2. Source-aware effective-look resolver used by every generation reader.
3. Reversible storage/control envelope with fresh-row concurrency protection.
4. Exactly-once final image-prompt fragment assembler.
5. Create/settings/storyboard UI using Astryx.
6. Flag isolation, lineage and complete path-coverage tests.

## 2. Frozen data contract

```ts
bible.lookLockControl?: {
  mode: "inherit_source" | "genre" | "manual" | "none";
  genreKey?: VdLookLockGenre;
  inheritedIdentity?: VerticalDramaPresetVisualIdentity;
  inheritedSource?: "preset" | "ai_mix" | "lineage";
  inheritedGovernance?: "preset_mix" | "look_lock";
  revision: number;
  updatedAt: string;
};
```

`bible.presetVisualIdentity` remains the only effective generation identity.
`inheritedIdentity` is a non-governing restore snapshot and may be read only by the
central resolver. Legacy series with an identity but no control envelope behave as
`inherit_source` governed by `preset_mix`.

Mode rules:

- `inherit_source`: restore the inherited snapshot or return precondition failure.
- `genre`: resolve the catalog identity server-side.
- `manual`: patch the fresh current effective identity, otherwise inherited; fail
  if neither exists. Only styleName, palette, lighting, cameraGrammar and image
  fragments are editable.
- `none`: remove effective identity while retaining inherited snapshot.

## 3. Resolver and flag matrix

Create a shared server-safe resolver:

```ts
resolveEffectiveSeriesVisualIdentity({ bible, presetMixEnabled, lookLockEnabled })
```

- Look flag off: genre/manual/none are inert; only an inherited `preset_mix`
  identity may flow when the preset flag is on.
- Look flag on + inherit/legacy: source flows only under its recorded governing flag.
- Look flag on + genre/manual: effective identity flows under look flag alone.
- Look flag on + none/malformed/unauthorized: `undefined`.
- Never mutate or silently fall back.

Replace direct identity reads in character, location, episode/start-frame,
repair/grid/reference-frame, portrait, plate, lineage and video-prompt paths with the
resolver or an owner-scoped wrapper.

## 4. Catalog and validation

Create five pure entries: drama/romance, horror/thriller, sci-fi/cyberpunk,
action/epic and fantasy/fairytale. Reuse the shipped
`VerticalDramaPresetVisualIdentity` shape. Catalog strings contain no vendor/model,
resolution, character-identity or motion instructions.

Trim strings, reject control characters, cap each string at 500 characters and each
fragment array at 12. Validate the final block against the selected-model budget;
reject an oversized manual edit with a field error rather than truncating it.

## 5. Mutation and creation contract

`setSeriesLookLock({ seriesId, mode, genreKey?, manualPatch?, expectedRevision })`:

1. enforce tenant/user/series ownership and feature flag;
2. lock and reload the fresh series row in a transaction;
3. reject stale revision with `CONFLICT` and current revision;
4. server-resolve catalog/base, validate bounded patch and ownership of any
   server-restored reference assets;
5. merge the fresh bible and atomically write control + effective identity;
6. audit ids/mode/revision/outcome only, never fragments or prompt prose.

Creation persists the selected look before background generation starts. AI-mix may
submit a complete candidate but the server validates it, drops client reference ids
and records `ai_mix`; it is never an authorization token. Lineage copies safe
source/governance metadata and starts revision 1.

## 6. Prompt ownership and precedence

Authoring LLMs receive only compact register fields: style name, palette, lighting
and still-composition camera grammar. They do not receive raw fragment arrays and
must not copy lock tokens verbatim.

One shared final image-prompt assembler, called immediately before every provider
submission:

- resolves the current authorized look;
- appends each normalized positive fragment once;
- merges negative fragments idempotently;
- emits path + revision provenance without prompt text.

It owns batch, both per-shot modes, reference frame, paid render, i2i repair, angle
grid, character portrait and location plate. After centralization, no call site may
invoke legacy append helpers directly.

Precedence:

`policy/safety → identity/required facts → series look → scene lock → shot direction → motion`

The look shapes broad register only. Scene concrete lighting/set facts and motion
movement constraints outrank it.

## 7. Skills

- Batch render plan and cinematic authoring receive the compact register fact.
- Policy-safe synopsis keeps its style-language ban; the final assembler applies
  fragments after authoring.
- Storyboard lighting variety becomes conditional: variation stays within the
  series register.
- All new skill clauses require an explicit look-lock activation fact and remain
  dormant flag-off. Maintain lowercase/uppercase twins byte-identically.

`canonical_style_bible` remains a display artifact. The series lock flows into
storyboard authoring one-way; there is no bidirectional merge in P1.

## 8. UI/UX contract

### Target user / JTBD

- Series creator chooses one look during creation or changes it later.
- Success means the active/inherited/none state is visible before generation and
  every repaired shot keeps the same register.

### Existing pattern reference

- Reuse current CreateSeriesWizard card selection, settings save/conflict behavior
  and StoryboardPanel chip/dialog patterns after re-verifying symbols.
- Run Astryx build/template/component discovery before implementation.

### Surfaces and states

- Wizard picker: five genre cards, inherit-source when available and explicit none.
- Settings editor: loading, selected, inherited, none, disabled, conflict/reload,
  save error and success.
- Storyboard: default-visible active-look chip.

### Responsive/accessibility/copy

- Verify mobile 390x844, tablet 768x1024 and desktop 1440x900.
- Keyboard selection, focus visibility/return, semantic labels, error announcement,
  contrast and reduced-motion compatibility.
- Thai-first copy with unambiguous inherited/none wording.
- Astryx components/tokens only; no raw colors or spacing.

### Browser evidence

Create one series, change its look, regenerate via both authoring modes and inspect
captured provenance for no duplicate fragments at all required viewports.

## 9. Tests first

- Pure resolver truth table: legacy/new envelopes × two source flags × every mode,
  malformed data and lineage.
- Reversible transitions preserve inherited snapshot/unrelated bible keys and
  increment revision exactly once.
- Concurrent stale write rejects; fresh merge preserves simultaneous story edits.
- Parameterized exactly-once test covers every image-producing path.
- Changing look after prompt authoring affects the next provider submission.
- Flag-off stored genre/manual data is inert and runtime/DB/UI parity matches the
  refreshed baseline.
- Skill activation/dormancy and twin identity are real-file tested.
- UI state, accessibility, responsive and browser workflow evidence from §8.

## 10. Done when

- No direct generation reader bypasses the resolver.
- No provider-bound image prompt bypasses the final assembler.
- Create and settings flows are race-safe and owner-scoped.
- All-off parity, exact-once coverage and the fixed rollout rubric pass.
- One episode per genre reaches ≥85% same-look agreement with no increase in
  identity-reference failures.

## 11. Implementation record (2026-08-01)

Implemented the P1 code paths: source-aware resolver and reversible control,
race-safe mutation/create handling, five-genre Astryx UI, compact authoring
registers, centralized idempotent provider-fragment assembly, reference-frame
coverage, AI-mix and lineage inheritance, and skill twin activation rules.

Focused verification: 252 tests passed across the shared contract, router/create
flows, start-frame modes, storyboard authoring, episode pipeline, and UI. The
repository-wide TypeScript check still reports pre-existing dirty-worktree errors;
the one new wizard union-narrowing error found by that run was fixed afterward.

Production rollout evidence remains owned by section 14: three viewport browser
captures, provider provenance inspection, five-genre agreement scoring, and the
flag-off/live rollout rubric are not claimed by this implementation record.
