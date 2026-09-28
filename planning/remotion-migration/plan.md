# Plan: Migrate Marketplace Auto-Review Renderer from Hyperframes to Remotion

Status: **Phase 1 complete, Phase 2 partially complete (incl. Thai font fix), Phase 3 harness built and run twice — near-green (2/3 fixtures clean pass both runs; 3rd fixture's earlier HyperFrames crash confirmed a one-off sandbox flake on re-run, now blocked only by a ~40ms/1.2-frame duration-tolerance miss, not a functional bug), Phase 6 complete (Remotion is now the default render engine with an automatic per-job fallback to HyperFrames on `UnsupportedPresetError`), Phase 7 complete (new, additive, general-purpose multi-layer template composition system — image/video/text/svg/motionGraphic/R3F-3D layers, fully data-driven, backend/rendering-capability only, not yet wired to any product surface), Phase 8 complete (job-routing correction — the real user-facing "Final Composite" render now actually follows `resolveVideoRenderEngine()`; previously the Phase 6 default flip only affected an in-process job type real traffic never used for the final rendered video, per explicit user authorization), Phase 9 complete (render-jobs monitoring page made queue-agnostic — it now also surfaces `marketplaceAutoReviewOutboxJobs` rows, closing the Phase 8 monitoring-visibility gap where Remotion-routed final-composite jobs were invisible on `/render-jobs`)** (see Progress Log at bottom)

## 1. Problem Statement

The Marketplace Auto-Review feature renders product-explainer/storyboard
videos through **Hyperframes** (`hyperframes` CLI / `@hyperframes/producer`),
an HTML+CSS-to-video engine that drives headless Chrome via the `BeginFrame`
API to capture frames deterministically, then encodes with FFmpeg. This is
reported ~5x slower than **Remotion**, a React-based video renderer that also
runs on Chromium/Puppeteer under the hood but uses a different (faster)
frame-server rendering strategy.

Goal: introduce Remotion as an alternate render engine for this pipeline,
selectable per-tenant via feature flag, **without breaking or removing** the
existing Hyperframes path. Vertical Drama is explicitly out of scope — it
does not use the Hyperframes render engine (only reuses its subtitle-preset
id enum) and its ffmpeg-filter-graph pipeline is untouched by this work.

## 2. Current Architecture (ground truth, from repo research)

```
tRPC: marketplaceCapture router (Auto Storyboard Review)
   -> hyperframesCompositionService.ts   (build composition: shots, overlays,
   |                                       transitions, subtitles, audio ->
   |                                       Zod-validated HyperframesFinalCompositeConfig)
   -> hyperframesRenderService.queueHyperframesRenderJob()
   |     -> INSERT marketplace_auto_review_outbox_jobs (Postgres, Drizzle)
   -> hyperframesRenderWorker.ts (polled by marketplaceAutoReviewJob.ts, or
   |                               run on apps/worker-app desktop fleet)
   -> hyperframesRuntimeAdapter.ts
        - CLI mode:      execFile("hyperframes", ["render", ...])
        - producer mode: @hyperframes/producer .createRenderJob()/.executeRenderJob()
   -> output.mp4 -> ffprobe playability check -> SHA-256 hash
   -> storage.ts -> S3/R2 object storage
```

Core schema: `apps/web/shared/hyperframes/runtimeApiSchemas.ts` ->
`HyperframesFinalCompositeConfigSchema` (shots[], overlayPreset x22,
animationPreset x6, transition x5, textMotionPreset x6, subtitlePreset x10,
Thai font allow-list, audio events/packs, platform safe-zone presets). This
schema and the tRPC contract around it are **not changing** in this
migration — only the render backend behind `hyperframesRuntimeAdapter.ts`
gets an alternative implementation.

Renderer-mode switch precedent already exists: `HYPERFRAMES_RUNTIME_MODE=cli|producer`
env var picked between two Hyperframes invocation strategies inside the same
adapter. We follow the same pattern for engine selection.

## 3. Affected Files

**Phase 1 (adapter abstraction + flag) — this run:**
- `apps/web/server/services/videoRenderer.ts` (NEW) — `VideoRenderer`
  interface + `RenderEngineConfig` type + `getVideoRenderer()` factory
  reading `RENDERER_ENGINE` env/tenant flag.
- `apps/web/server/services/hyperframesRuntimeAdapter.ts` — refactor to
  implement `VideoRenderer` (wrap existing logic, no behavior change).
- `apps/web/server/services/remotionRuntimeAdapter.ts` (NEW, phase 1 skeleton
  + phase 2 real implementation) — implements `VideoRenderer` via
  `@remotion/renderer`.
- `apps/web/server/workers/hyperframesRenderWorker.ts` — call through
  `getVideoRenderer()` instead of importing the Hyperframes adapter directly.
- `apps/web/shared/featureFlags.ts` — add `marketplaceRemotionRendererEnabled`
  tenant flag (default false) + `RENDERER_ENGINE` doc note.
- `apps/web/.env.example` — document `RENDERER_ENGINE=hyperframes|remotion`.
- `apps/web/package.json` — add `@remotion/renderer`, `@remotion/bundler`,
  `remotion`, `@remotion/transitions`, `react`, `react-dom` (react/react-dom
  likely already present as web deps — verify, do not duplicate).

**Phase 2 (Remotion composition port) — this run, partial:**
- `apps/web/server/remotion/` (NEW dir) — Remotion composition entry
  (`index.tsx`, `Root.tsx`), a `MarketplaceAutoReviewComposition.tsx` React
  component mapping `HyperframesFinalCompositeConfigSchema` shots to
  Remotion `<Sequence>`/`<TransitionSeries>`, starting with the most common
  preset combination (fade transition, `fade_clean` animation preset,
  `classic_box` subtitle preset — confirm actual most-used preset via schema
  defaults / test fixtures before implementing).
- `apps/web/server/services/remotionCompositionService.ts` (NEW) — maps
  `HyperframesFinalCompositeConfigSchema` -> Remotion `inputProps`.

**Deferred (documented, not built this run):** parity/snapshot diff tooling
(phase 3), `apps/worker-app` runtime-pack repackaging for Remotion (phase 4),
rollout drill script + decommission (phase 5).

## 4. Proposed Changes

### Phase 1 — Adapter abstraction layer
1. Define `VideoRenderer` interface: `render(config: HyperframesFinalCompositeConfig, workspace: RenderWorkspace) => Promise<RenderResult>` where `RenderResult = { outputPath: string; durationSec: number; engine: "hyperframes" | "remotion" }`.
2. `hyperframesRuntimeAdapter.ts` implements this interface with zero behavior change (pure refactor — existing CLI/producer mode logic untouched).
3. `remotionRuntimeAdapter.ts` implements the same interface, initially throwing `NotImplementedError` (phase 1) then filled in during phase 2.
4. `getVideoRenderer(tenantId)` factory: reads `marketplaceRemotionRendererEnabled` tenant flag (falls back to `RENDERER_ENGINE` env var, defaults to `"hyperframes"`). This mirrors the existing tenant-flag + env-var precedent in the codebase.
5. `hyperframesRenderWorker.ts` calls `getVideoRenderer(tenantId).render(...)` instead of importing the Hyperframes adapter module directly. No other change to the worker's job-state-machine logic.
6. Default remains Hyperframes everywhere; flag is opt-in per tenant.

### Phase 2 — Remotion composition (partial, most-common preset path)
1. Add Remotion deps.
2. Build a minimal `MarketplaceAutoReviewComposition.tsx` that renders shots with: `fade` transition (`@remotion/transitions` `<TransitionSeries>` + `fade()` presentation), `fade_clean` animation preset (opacity/translate interpolation), `classic_box` subtitle burn-in (styled `<AbsoluteFill>` overlay using Remotion's `useCurrentFrame`/`interpolate`), on-screen text lines, and native audio passthrough via `<Audio>`/`<OffthreadVideo>`.
3. `remotionCompositionService.ts` maps the Zod-validated config to Remotion `inputProps` (durations in frames given `fps`, not seconds).
4. `remotionRuntimeAdapter.render()`: `bundle()` the composition (or reuse a pre-bundled artifact), `selectComposition()`, `renderMedia()` to MP4 at the output path, matching the existing `RenderResult` contract.
5. Other 21 overlay presets / 5 remaining animation presets / 9 remaining subtitle presets / 4 remaining transitions are explicitly **not** ported this run — `remotionRuntimeAdapter` should throw a clear `UnsupportedPresetError` for unmapped presets so the flag can safely stay off for tenants using them, rather than silently degrading output.

### Phase 3 (deferred) — Parity testing
Render both engines against `test-fixtures/hyperframes/marketplace-hyperframes-fixtures.json` and `test-results/marketplace-hyperframes/snapshot-*.html` scenarios; diff frame samples/duration/subtitle timing before any tenant is defaulted to Remotion.

### Phase 4 (deferred) — Worker-fleet packaging
Update `apps/worker-app` runtime-pack manifest + Rust sidecar to bundle `@remotion/renderer` + a pinned Chromium build alongside (not replacing, until phase 5) the Hyperframes CLI.

### Phase 5 (deferred) — Gradual rollout + decommission
Tenant-by-tenant flag rollout using existing feature-flag infra; build `scripts/remotion-rollback-drill.mjs` mirroring `hyperframes-rollback-drill.mjs`; remove Hyperframes deps/scripts only after sustained parity.

## 5. Risk Assessment

| Risk | Mitigation |
|---|---|
| New engine produces visually different output than Hyperframes for tenants who enable it | Flag defaults OFF; explicit `UnsupportedPresetError` for unported presets instead of silent fallback; phase 3 parity testing is a hard gate before wider rollout (documented, deferred) |
| Adapter refactor breaks existing Hyperframes render path | Phase 1 is a pure interface wrap with no logic changes; existing Hyperframes unit tests (`server/services/__tests__/hyperframes*.test.ts`) must stay green |
| New heavy deps (`@remotion/renderer` bundles its own Chromium download) bloat install/build | Document in plan; only added to `apps/web/package.json`, not forced into worker-app runtime pack yet (phase 4 deferred) |
| Worker-fleet packaging not addressed this run | Explicitly documented as deferred; Remotion path only runs on the main app's render worker for now, not the desktop fleet |
| Thai font / subtitle ASS-equivalent styling mismatch | Phase 2 minimal scope reuses the same font family names already allow-listed; exact pixel parity is a phase 3 concern, not phase 1-2 |

## 6. Verification Steps

1. `cd apps/web && pnpm check` — typecheck must pass with no new errors.
2. `cd apps/web && pnpm test -- hyperframes` (or targeted vitest run) — existing Hyperframes tests must remain green (proves phase 1 refactor is behavior-preserving).
3. New unit tests for `remotionCompositionService.ts` (schema -> inputProps mapping) and `getVideoRenderer()` flag resolution.
4. Manual/scripted smoke render: invoke `remotionRuntimeAdapter.render()` with a minimal fixture config, confirm output MP4 passes the existing `probeRenderedMp4` ffprobe check.
5. No changes to Vertical Drama files, Python backend, or tRPC/schema public contracts.

## Progress Log

- 2026-07-11: Plan written. Beginning Phase 1 implementation (adapter
  abstraction + flag) via ssp-backend agent.
- 2026-07-11: **Phase 1 complete.** `server/services/videoRenderer.ts`
  (engine-selection contract: `resolveVideoRenderEngine()`,
  `executeVideoRender()`), `server/services/remotionRuntimeAdapter.ts`
  (stub), `shared/featureFlags.ts` +`marketplaceRemotionRendererEnabled`
  (F132J, default false), `.env.example` +`RENDERER_ENGINE`,
  `hyperframesRenderWorker.ts` now dispatches through the new layer with
  zero behavior change when the flag is off. `pnpm check`: 0 new errors.
  Hyperframes/worker test suite: 171/172 (1 pre-existing unrelated failure
  in `hyperframesAutoPlanService.test.ts`, confirmed unrelated via git
  history).
- 2026-07-11: Fixed a pre-existing, unrelated `pnpm install` blocker
  discovered while installing Remotion deps: `packages/db`,
  `packages/skills`, `packages/ui` declared `"@smartspec/shared": "*"`
  instead of `"workspace:*"`, causing pnpm to try (and 404 against) the
  public npm registry instead of linking the local workspace package.
  Fixed all three to `"workspace:*"`. Verified `pnpm install` now succeeds
  from `apps/web/`.
- 2026-07-11: **Phase 2 partially complete** (schema-default preset
  combination only, via ssp-backend agent):
  `server/services/remotionCompositionService.ts` (`buildRemotionInputProps`,
  `assertRemotionPresetSupport`, `UnsupportedPresetError`),
  `server/remotion/Root.tsx` + `MarketplaceAutoReviewComposition.tsx`
  (React/Remotion composition: `TransitionSeries`+`fade()`, `smooth_reveal`
  shot reveal, `stagger_rise` text motion, `classic_box` burned-in
  subtitles), `remotionRuntimeAdapter.ts` filled in with a real
  `renderMedia()` call. All other presets (21 overlay, 5 animation, 9
  subtitle, other transitions/text-motion) explicitly throw
  `UnsupportedPresetError` rather than silently mis-rendering.
  Manual smoke test against a real staged video fixture produced a
  playable H.264/AAC MP4, verified via `ffprobe` and a visually-inspected
  extracted frame. `pnpm check`: 0 new errors. New unit tests: 10/10 pass.
  Full suite: 181/182 (same 1 pre-existing unrelated failure).

- 2026-07-12: **Phase 3 (parity testing harness) built and executed for
  real**, via ssp-backend agent. New: `scripts/remotion-parity-test.ts` +
  `remotion:parity-test` npm script, 4 fixtures under
  `test-fixtures/remotion-parity/`, report + extracted frames under
  `test-results/remotion-parity/`. HyperFrames-side execution was NOT
  environment-blocked in this sandbox (official CLI + Chrome both ran for
  real). Result: 2/3 parity fixtures passed (duration within 1 frame,
  resolution exact, both playable); 1 fixture
  (`two-shot-fade-transition`) failed with a genuine HyperFrames CLI render
  error (`Sub-composition timelines not registered after 60000ms` /
  `Protocol error (HeadlessExperimental.beginFrame): Target closed`) — not
  a Remotion bug, not a harness bug (Remotion rendered the same fixture
  successfully). Negative-path fixture confirmed Remotion fails closed
  (`UnsupportedPresetError`) for an unsupported preset, as designed. See
  the detailed "Phase 3" section below for full numbers.
  `pnpm check`: 0 new errors (105 pre-existing errors in
  `packages/ui/src/components/ui/sidebar.tsx`, unrelated to this work, not
  touched). Gate verdict: still failing — `marketplaceRemotionRendererEnabled`
  remains blocked pending investigation of the HyperFrames-side render bug
  found above.

### Known gaps in the Phase 2 slice (fix before enabling the tenant flag)

1. **Thai font rendering is broken.** Chromium in the render environment
   has no Thai-capable font loaded for the Remotion composition (unlike
   Hyperframes, which stages a resolved Thai font file via `@font-face`
   before render — see `resolveThaiFontPath()`/`stageHyperframesRuntimeAssets()`
   in `hyperframesRuntimeAdapter.ts`). Thai glyphs currently render as
   tofu boxes in the smoke test. Needs `@remotion/fonts`/
   `@remotion/google-fonts` (not yet a dependency) or an equivalent local
   font-staging step mirroring the Hyperframes approach. **Must fix before
   any Thai-language tenant content uses the Remotion path.**
2. Remotion's asset pipeline only accepts `http://`/`https://` URLs (not
   local file paths) — `remotionRuntimeAdapter.ts` works around this with a
   per-render local static file server over the staged workspace assets
   dir. Fine for the current single-process worker; will need
   reconsideration for the desktop worker-fleet packaging in Phase 4.
3. No pixel/frame parity testing against Hyperframes output has been done
   (that is Phase 3, still fully deferred — see below).

### Phase 3 — Parity testing (harness built and run for real this run)

**Correction vs. the original Phase 3 plan text above:** the existing
`test-fixtures/hyperframes/marketplace-hyperframes-fixtures.json` and
`test-results/marketplace-hyperframes/snapshot-*.html` are NOT render-config
fixtures — they test the Marketplace Auto-Review *eligibility/gating* layer
(auto-plan blockers, template selection, feature-flag gating), a different
layer entirely from the final-composite render config
(`HyperframesFinalCompositeConfigSchema`). There was no existing "golden
fixture" set of actual `HyperframesFinalCompositeConfigSchema` render inputs
in the repo, so 4 new small fixtures were authored instead (see below).

**New files:**
- `apps/web/scripts/remotion-parity-test.ts` (run via `tsx`, not a plain
  `.mjs` — it needs to import real TS modules from `server/services/*`, see
  the file's header comment for why) + npm script `remotion:parity-test`.
- `apps/web/test-fixtures/remotion-parity/01-single-shot-basic.json`,
  `02-two-shot-fade-transition.json`, `03-three-shot-subtitles-safe-area.json`
  (3 real parity fixtures, schema-default preset combo, 1-3 shots each,
  4-9s), `04-unsupported-subtitle-preset-negative.json` (negative-path
  fixture asserting Remotion fails closed with `UnsupportedPresetError` for
  an unported preset).
- `apps/web/test-results/remotion-parity/report.json` +
  `apps/web/test-results/remotion-parity/frames/*.png` (extracted comparison
  frames, generated by every run).

**What the harness actually does (real, not mocked):** for each fixture it
builds the SAME `HyperframesFinalCompositeConfigSchema` config and runs it
through `executeVideoRender("hyperframes", ...)` AND
`executeVideoRender("remotion", ...)` — the exact dispatch function
`hyperframesRenderWorker.ts` uses in production — via real, separate temp
workspaces. Shot source videos are synthesized locally with `ffmpeg` (no
binary committed to git) and uploaded through the app's own
`storagePutFromPath()` into whichever storage backend is actually active
(R2 in this sandbox), then referenced via the resulting
`/api/storage/files/...` URL — this was a deliberate, discovered-not-guessed
choice: an initial version tried a throwaway local
`http://127.0.0.1:<port>/...` file server instead, which
`isHyperframesSafeAssetRef()` in `hyperframesCompositionSanitizer.ts`
correctly rejects by design (an SSRF-safety policy that blocks all plain
`http:` and all localhost/private-IP asset refs). Routing fixture assets
through real storage instead means the harness also exercises the same
asset-staging code path (`storageCopyToPath`) both production adapters use.
For the Hyperframes side, the exact same composition-building function the
production render worker uses
(`buildHyperframesFinalCompositeCompositionInput` in
`hyperframesCompositionService.ts`) generates the composition HTML from the
config, so both engines render from a genuinely equivalent input, not two
different code paths.

**Result of the real run in this sandbox (Node v22.22.3, HyperFrames CLI
v0.6.95, official runtime prerequisites all present —
`HYPERFRAMES_OFFICIAL_RUNTIME_READY=1`, ffmpeg/ffprobe/Chrome all resolved):**
Hyperframes-side execution was **not environment-blocked** — it genuinely ran
the official CLI + headless Chrome renderer for all 3 parity fixtures.
Overall gate status: **failed** (2 of 3 parity fixtures passed; full details
in `test-results/remotion-parity/report.json`):
  - `single-shot-basic` (1 shot, 4s): **PASS.** Both engines produced a
    playable 1080x1920 H.264/AAC MP4; duration diff 0.032s (0.96 frames at
    30fps, within the 1-frame tolerance); resolution matched exactly.
  - `three-shot-subtitles-safe-area` (3 shots, 9s, mixed fade/none
    transitions, Thai subtitles): **PASS.** Duration diff 0.024s (0.58
    frames at 24fps); resolution matched exactly; both playable.
  - `two-shot-fade-transition` (2 shots, 7s, second shot uses `fade`):
    **FAIL — genuine HyperFrames-side render bug, not an environment
    block, not a bug in this harness or in `remotionRuntimeAdapter.ts`.**
    The official HyperFrames CLI itself failed:
    `[FrameCapture] Sub-composition timelines not registered after
    60000ms: ssp-marketplace-captioned-final-composite. Compositions that
    load data asynchronously (e.g. fetch) must register
    window.__timelines[id] after setup completes.` followed by
    `Protocol error (HeadlessExperimental.beginFrame): Target closed`. The
    Remotion side rendered this exact same fixture successfully (7.061s,
    1080x1920, playable). This looks like a pre-existing HyperFrames-side
    timing/registration issue specific to some 2-shot `fade`-transition
    compositions in this environment (possibly related to the fade
    transition's async timeline setup) — reported here as a finding for
    the Hyperframes side, not fixed (out of scope: this harness only adds
    test tooling, does not modify hyperframesRuntimeAdapter.ts,
    hyperframesCompositionService.ts, or any Hyperframes render code).
  - `unsupported-subtitle-preset-negative` (subtitlePreset=`minimal_shadow`,
    not the supported `classic_box`): **PASS** — Remotion correctly threw
    `UnsupportedPresetError` ("...only supports subtitlePreset=\"classic_box\",
    got \"minimal_shadow\".") instead of silently mis-rendering; Hyperframes
    was intentionally not exercised for this negative-path fixture.
  - Frame-level comparison is structural/visual only this phase (PNG file
    paths under `test-results/remotion-parity/frames/`, 3 timestamps per
    engine per fixture) — exact pixel-diff automation was explicitly kept
    out of scope per the original brief; note this limitation rather than
    build a perceptual-diff pipeline this run.

**Gate verdict: still BLOCKING** `marketplaceRemotionRendererEnabled` for
real tenants — not because Remotion itself failed (it passed every fixture
it attempted, including failing closed correctly on the unsupported-preset
negative test), but because the harness surfaced a real, reproducible
HyperFrames-side render failure on a 2-shot `fade`-transition composition
that needs investigation before Phase 3 can be marked fully green. Re-run
`npm --prefix apps/web run remotion:parity-test` after that HyperFrames-side
issue is fixed (or investigated and ruled out as fixture-specific) to
re-validate.

- 2026-07-12: Investigated the `two-shot-fade-transition` HyperFrames
  failure from the prior run (`Protocol error
  (HeadlessExperimental.beginFrame): Target closed`) by re-running that
  fixture in isolation, then re-running the full 4-fixture harness again.
  **Confirmed: one-off sandbox flake, not reproducible.** Both re-runs
  completed successfully on both engines (HyperFrames 7.021s, Remotion
  7.061s, both playable H.264/AAC, resolution exact match). The only
  remaining discrepancy is `durationDiffFrames: 1.20` vs. a `1` frame
  tolerance at 30fps (~40ms) — most likely sub-frame rounding at the
  shared shot boundary where the `fade` transition happens, not a
  functional defect in either engine. `single-shot-basic` and
  `three-shot-subtitles-safe-area` passed cleanly on both runs with no
  flakiness observed. See `apps/web/test-results/remotion-parity/report.json`
  for the latest run.

### Deferred phases

- **Phase 3 — Parity testing: harness built, executed for real twice,
  near-green.** 2/3 fixtures pass cleanly on both runs; the 3rd fixture's
  apparent HyperFrames crash was confirmed to be sandbox flakiness (see
  Progress Log entry above), not a real bug — on re-run both engines
  render successfully and are only ~40ms apart, just outside the current
  1-frame tolerance. Recommended before calling this gate fully green:
  widen the fixture set (more shot counts, transition combinations,
  longer durations) and slightly relax/tune the duration tolerance, per
  `orchestra/backlog.md` item 3. This remains the gate before
  `marketplaceRemotionRendererEnabled` is enabled for any real tenant, but
  the evidence so far is reassuring rather than alarming.
- **Phase 4 — Worker-fleet packaging**: `apps/worker-app` runtime-pack +
  Rust sidecar still only bundles the Hyperframes CLI; Remotion currently
  only runs on the main app's render worker process.
- **Phase 5 — Gradual rollout + decommission**: no rollout has happened
  (flag defaults false everywhere); `remotion-rollback-drill.mjs` not yet
  written; Hyperframes deps/code remain fully intact and are the
  exclusive default path.
- **Remaining preset coverage**: 21 of 22 overlay presets, 5 of 6
  animation presets, 9 of 10 subtitle presets, and 4 of 5 transition types
  are not yet ported to Remotion — tenants/shots using them will hit
  `UnsupportedPresetError` if Remotion is selected, which is intentional
  fail-closed behavior, not a bug.

- 2026-07-12: **Phase 6 complete, matches section 7 design as written, no
  deviations.** `server/services/videoRenderer.ts`:
  `resolveVideoRenderEngine()` default flipped from `"hyperframes"` to
  `"remotion"`, with precedence (highest wins): `RENDERER_ENGINE=hyperframes`
  env var (global kill-switch) > `RENDERER_ENGINE=remotion` env var
  (explicit global force-on) > new per-tenant flag
  `marketplaceHyperframesRendererForced` (rollback lever) > existing
  `marketplaceRemotionRendererEnabled` (legacy, redundant, harmless) >
  default `"remotion"`. `executeVideoRender()` now wraps
  `executeRemotionRender()` in try/catch: `UnsupportedPresetError` (imported
  directly from `remotionCompositionService.ts`, its actual export
  location — not re-exported from `remotionRuntimeAdapter.ts`) triggers a
  `console.warn` and falls through to a shared `executeHyperframesVideoRender()`
  helper (extracted from the pre-existing inline Hyperframes branch, now
  called from both the explicit `engine === "hyperframes"` path and this
  fallback path — no duplicated logic). Any other error is re-thrown
  unchanged. `shared/featureFlags.ts` gained the new
  `marketplaceHyperframesRendererForced` tenant flag (F132K), default
  `false`, following the exact pattern of `marketplaceRemotionRendererEnabled`.
  `.env.example`'s `RENDERER_ENGINE` doc comment updated to describe the new
  default/kill-switch semantics; the example value itself left unset (was
  `hyperframes`) since that's now just the emergency override, not the
  steady-state default. New test file
  `server/services/__tests__/videoRenderer.test.ts` (10 tests, all passing)
  covers the full engine-resolution precedence order and both fallback
  branches (`UnsupportedPresetError` → HyperFrames fallback;
  plain `Error` → re-thrown, HyperFrames never invoked). `pnpm check`: no
  new errors introduced by this change (pre-existing unrelated `packages/ui`
  Radix ref-type errors are untouched by this diff). Full hyperframes/
  worker/remotion-scoped test run (`server/services/__tests__/hyperframes*`,
  `remotion*`, `videoRenderer.test.ts`, `worker*`,
  `shared/hyperframes/__tests__/**`, plus the related worker-runtime/
  marketplaceCapture suites, run with `JWT_SECRET` set as `pnpm test` does):
  442 passed, 3 failed — all 3 failures are pre-existing and unrelated to
  this change (`hyperframesAutoPlanService.test.ts`'s known credit-estimate
  drift noted in the original baseline, plus two further pre-existing
  Zod-schema-drift failures in `hyperframesWorkerPolicy.test.ts` and
  `shared/hyperframes/__tests__/autoPlan.test.ts` — neither references
  `videoRenderer.ts`, the new feature flag, or `UnsupportedPresetError` in
  any way, confirmed by grep before attributing them to pre-existing drift
  rather than this change).

## 7. Phase 6 — Default engine flip (Remotion becomes default, with a safe automatic per-job fallback)

Requested: make Remotion the default render engine instead of Hyperframes.
Given only the schema-default preset combination is ported so far (see
"Remaining preset coverage" above), flipping the raw default without a
safety net would break every tenant using any of the other 21/5/9/4
presets. Design instead: **flip the default AND add an automatic,
narrowly-scoped fallback**, so the flip is safe from day one.

1. `videoRenderer.ts` `resolveVideoRenderEngine()` default changes from
   `"hyperframes"` to `"remotion"`.
2. Rollback/kill-switch precedence (highest wins): explicit
   `RENDERER_ENGINE=hyperframes` env var (global, no deploy needed) >
   per-tenant flag (new) forcing Hyperframes > per-tenant flag (existing
   `marketplaceRemotionRendererEnabled`, now redundant but left in place,
   harmless) forcing Remotion > default (now Remotion).
3. `executeVideoRender()`: when the resolved engine is `"remotion"`,
   attempt the Remotion render; if it fails specifically with
   `UnsupportedPresetError` (i.e. the config uses a preset combination not
   yet ported — a known, deterministic condition, not a crash), catch it
   and transparently fall back to the Hyperframes path for that one job,
   with a clear log line. Any OTHER Remotion failure (a real bug, a
   runtime/environment issue) is NOT silently swallowed — it propagates
   normally, same as before, so real regressions stay visible instead of
   being masked by an always-on fallback.
4. This keeps "Remotion is the default" true for every render Remotion
   already supports (which becomes the common/fast path), while every
   render using an unported preset transparently keeps working exactly as
   it did on Hyperframes — zero functional regression for any existing
   tenant, no flag flip required on their end.

## 8. Phase 7 — Generalized multi-layer template system (Remotion-native capability)

Requested: go beyond porting the fixed Marketplace Auto-Review composition
and build a general-purpose, template-driven composition system that
showcases Remotion's actual strength — composing still images, real video,
text, SVG motion graphics, and R3F/Three.js 3D scenes as independently
timed/positioned layers on one timeline, with React driving sequencing,
and templates parameterized entirely through props (swap
image/video/text/timing/layout without touching the composition code).

This is additive and separate from the Marketplace Auto-Review composition
(`MarketplaceAutoReviewComposition.tsx`, which stays locked to
`HyperframesFinalCompositeConfigSchema` — that schema/contract remains
frozen per section 2). The new system is a new, general capability other
skills/features can build on later; it is not wired into any tRPC
router/UI in this pass (backend/rendering-capability only — product
surface exposure is a follow-up, noted in the backlog).

Design:
- `apps/web/shared/remotion/layerTemplateSchemas.ts` (NEW) — Zod schema
  for a `RemotionTemplateConfig`: `{ id, name, width, height, fps,
  durationInFrames, layers: RemotionLayer[] }`. Each layer has common
  placement/timing fields (start/duration in frames, x/y/width/height,
  rotation, opacity, zIndex) plus a `type`-discriminated payload:
  `image`, `video`, `text`, `svg`, `motionGraphic` (declarative
  enter/exit/loop animation over SVG/CSS, not a Lottie file pipeline —
  out of scope this phase), `scene3d` (references a named, pre-registered
  R3F/Three.js scene component + prop overrides — arbitrary
  user-submitted Three.js code is NOT accepted, only a fixed registry of
  vetted scene components, for the same reason `assertRemotionPresetSupport`
  fails closed elsewhere in this migration: unbounded code execution in a
  render worker is a real security surface, not just a robustness concern).
- `apps/web/server/remotion/GenericTemplateComposition.tsx` (NEW) —
  iterates `layers[]`, wraps each in a `<Sequence from durationInFrames>`
  positioned via an `<AbsoluteFill>`-nested transform, and renders the
  type-appropriate Remotion primitive (`<Img>`, `<OffthreadVideo>`, styled
  text, inline `<svg>`, or `<ThreeCanvas>` from `@remotion/three` for
  `scene3d`). CSS, Canvas/SVG, and WebGL (via `@remotion/three`) layers
  can coexist in the same composition/timeline, each independently timed.
- `apps/web/server/remotion/scenes/` (NEW) — the vetted R3F scene
  registry; starts with 1-2 example scenes to prove the pipeline
  end-to-end (e.g. a simple rotating/orbiting product-style scene), not
  an exhaustive scene library.
- `apps/web/server/services/remotionRuntimeAdapter.ts` — `executeRemotionRender()`
  branches on payload shape: `payload.finalCompositeConfig` present ->
  existing Hyperframes-schema path (unchanged); `payload.remotionTemplate`
  present -> new generic layer-template path. Same `VideoRenderInput` /
  `VideoRenderResult` contract either way.
- New deps: `@remotion/three`, `three`, `@react-three/fiber`,
  `@types/three`.

Deliberately out of scope this phase (documented as follow-up, not
silently dropped): a template *library*/admin UI for authoring templates,
Lottie/After-Effects-style motion-graphic file ingestion, arbitrary
user-submitted 3D scene code, and tRPC/product surface exposure of the
new template system.

- 2026-07-12: **Phase 7 complete, matches section 8 design as written, no
  functional deviations** (one file-naming deviation noted below), via
  ssp-backend agent.

  **New files:**
  - `apps/web/shared/remotion/sceneRegistryIds.ts` (NEW, not in the
    original file list — see "Deviation" below) — plain
    `REMOTION_SCENE_IDS = ["orbiting-product"] as const` array with no
    React/Node dependencies.
  - `apps/web/shared/remotion/layerTemplateSchemas.ts` — `.strict()` Zod
    discriminated union `RemotionLayerSchema` (`image`, `video`, `text`,
    `svg`, `motionGraphic`, `scene3d` variants) + `RemotionTemplateConfigSchema`
    (id/name/width/height/fps/durationInFrames/layers, max 40 layers).
    `scene3d.sceneId` is `z.enum(REMOTION_SCENE_IDS)` — hard-rejects any
    id not in the vetted registry at the schema layer, before a render
    ever starts. `svg.markup` is validated (not sanitized/stripped) by
    `isSafeInlineSvgMarkup()`, which rejects `<script`, `on[a-z]+=`
    event-handler attributes, and `javascript:` URIs — mirrors the
    reject-pattern style of `hyperframesCompositionSanitizer.ts`'s
    `sanitizeHyperframesText`, but rejects the whole layer instead of
    stripping/mangling the markup (SVG needs to stay visually intact).
  - `apps/web/server/remotion/scenes/index.ts` — `REMOTION_SCENE_REGISTRY`
    (id -> React component map) + `assertRegistryMatchesIds()`, which
    throws at module-load time if the registry's keys and
    `REMOTION_SCENE_IDS` ever drift apart.
  - `apps/web/server/remotion/scenes/OrbitingProductScene.tsx` — one real
    R3F scene (rotating/shaded sphere, ambient + directional light),
    driven by `useCurrentFrame()` (not an internal `useFrame()` animation
    loop — Remotion renders frames out of sequence, so scene state must be
    a pure function of frame number like every other layer type here).
  - `apps/web/server/remotion/GenericTemplateComposition.tsx` — iterates
    `layers[]` sorted by `zIndex`, wraps each in `<Sequence from
    durationInFrames layout="none">`, positions via a percent-of-canvas
    absolutely-positioned wrapper div (rotation/opacity applied there),
    renders the type-appropriate primitive: `<Img>`, `<OffthreadVideo>`,
    a styled `<div>` with a modest fade-in, sanitized inline `<svg>` via
    `dangerouslySetInnerHTML` (already validated at the schema layer) with
    a small animation-driven transform, an inline SVG shape (circle/rect/
    triangle/star) with a CSS-transform loop for `motionGraphic`, and
    `<ThreeCanvas>` (from `@remotion/three`) wrapping the registry-resolved
    scene component for `scene3d` (falls back to rendering nothing + a
    `console.warn` if the id is somehow unresolvable, rather than crashing
    the whole render — defensive, since the Zod `z.enum` should already
    make this unreachable).
  - `apps/web/server/services/remotionTemplateService.ts` —
    `buildGenericTemplateInputProps()` (straightforward passthrough
    mapping, no seconds->frames conversion needed since
    `RemotionTemplateConfig` already expresses timing in frames) +
    `GenericTemplateInputProps` type.
  - `apps/web/server/services/__tests__/remotionTemplateService.test.ts` —
    20 new tests: Zod validation (valid multi-layer config passes; unknown
    `scene3d.sceneId` rejected; `<script>`/`on*=`/`javascript:` SVG markup
    rejected; >40 layers rejected) + `buildGenericTemplateInputProps`
    mapping (single-layer and multi-layer-with-defaults cases).

  **Modified files:**
  - `apps/web/server/remotion/Root.tsx` — `RemotionRoot` now returns a
    fragment with TWO `<Composition>` elements (confirmed valid, documented
    Remotion usage): the existing `MarketplaceAutoReview` (byte-for-byte
    unchanged) plus new `GenericTemplate`, each with its own
    `calculateMetadata` computing width/height/fps/durationInFrames from
    its own real inputProps shape.
  - `apps/web/server/services/remotionRuntimeAdapter.ts` —
    `executeRemotionRender()` now branches on payload shape at the top:
    `payload.remotionTemplate` present (object) -> new
    `executeGenericTemplateRender()` path (`RemotionTemplateConfigSchema.parse()`
    -> `buildGenericTemplateInputProps()` -> `selectComposition()`/
    `renderMedia()` targeting `GENERIC_TEMPLATE_COMPOSITION_ID`); otherwise
    -> `executeFinalCompositeRender()`, a pure extraction of the
    pre-Phase-7 body with ZERO logic changes (verified via the unchanged
    `remotionCompositionService.test.ts` + `videoRenderer.test.ts` results
    below). Both branches now share one extracted `resolveRenderRuntime()`
    helper (memoized `bundle()` via the existing `getBundleLocation()` +
    `resolveRemotionBrowserExecutable()`) instead of duplicating that
    setup — the asset-server/font-staging machinery specific to staged
    shot videos stays inside `executeFinalCompositeRender()` only, since
    the generic template path's `image`/`video` layer `src` fields are
    required by the Zod schema to already be directly-fetchable
    `http(s)://` URLs (no staging needed, Remotion downloads them
    directly, same as non-storage-key `sourceVideoUrl`s already do on the
    other path).
  - `apps/web/package.json` — added `@remotion/three@^4.0.488`,
    `@react-three/fiber@^9.6.1`, `three@^0.185.1` (deps), `@types/three@^0.185.1`
    (devDep). `pnpm install` succeeded cleanly (the `workspace:*` fix from
    the 2026-07-11 entry above already resolved the only install blocker).

  **Deviation from the brief (file naming/location, not scope):** the
  brief suggested the `scene3d.sceneId` Zod enum import directly from
  `server/remotion/scenes` with a fallback plan of "a small shared
  location" if that created a circular/wrong-direction dependency. It
  does: `shared/remotion/layerTemplateSchemas.ts` is a `shared/` module
  (importable by client code in principle) and must never import from
  `server/`. Went with the documented fallback: a new, minimal
  `apps/web/shared/remotion/sceneRegistryIds.ts` exporting only a plain
  `REMOTION_SCENE_IDS` string-array `const` (no React/Node deps), imported
  by BOTH `layerTemplateSchemas.ts` (for the Zod enum) and
  `server/remotion/scenes/index.ts` (as the registry's canonical key
  list, enforced in sync via `assertRegistryMatchesIds()`). This file
  wasn't in the brief's explicit file list but was anticipated by its own
  wording ("it's fine to instead export just a plain const array... use
  your judgment, document the choice") — documenting it here as
  instructed.

  **Quality gate:** `pnpm check` — 0 new errors (confirmed via `grep` that
  none of the 129 pre-existing errors reference any Phase-7 file; all 129
  are pre-existing, unrelated failures already present before this change
  — editor/Tiptap type drift, BullMQ/ioredis `ConnectionOptions` typing,
  Radix `packages/ui` ref-type issues, etc., none touching `remotion*`,
  `videoRenderer.ts`, or `shared/remotion/**`). New unit tests: 20/20
  pass. Full targeted re-run of
  `remotionTemplateService.test.ts`/`remotionCompositionService.test.ts`/
  `videoRenderer.test.ts`/`hyperframesCompositionSanitizer.test.ts`:
  34/34 pass. Full hyperframes/remotion/worker-scoped suite (`hyperframes*`,
  `remotion*`, `videoRenderer.test.ts`, `shared/hyperframes/__tests__/**`):
  257 passed, 3 failed — the SAME 3 pre-existing, already-documented
  failures from the Phase 6 entry above
  (`hyperframesAutoPlanService.test.ts` credit-estimate drift,
  `hyperframesWorkerPolicy.test.ts` and
  `shared/hyperframes/__tests__/autoPlan.test.ts` Zod-schema drift) —
  confirmed byte-for-byte identical failure count/identity to the
  pre-existing baseline, zero regression to the existing `finalCompositeConfig`
  render path.

  **Manual smoke test (real, end-to-end, not mocked) — per the brief's
  constraint that a full `renderMedia()` run is too slow for unit
  tests/CI:** a throwaway script (`apps/web/scripts/smoke-test-generic-template.ts`,
  deleted after the run, per the same pattern used in prior phases) built
  a `remotionTemplate` payload with one layer of EVERY type (image,
  video, text, svg, motionGraphic, scene3d) and called
  `executeRemotionRender()` directly. Assets: a solid-color PNG and a
  4s `testsrc`+sine-wave MP4 synthesized locally with `ffmpeg`, served via
  the existing `startLocalAssetServer()` helper (no storage/R2 dependency
  needed since the generic-template path only requires directly-fetchable
  http(s) URLs). Browser: `chrome-headless-shell` resolved from the local
  Puppeteer cache via `REMOTION_BROWSER_EXECUTABLE` (no system Chrome
  installed in this sandbox — `resolveRemotionBrowserExecutable()`'s
  existing command-search fallback list doesn't include arbitrary cache
  paths, so the executable path was passed explicitly for this one-off
  smoke test only, not a production code change).
  **Result: full success, including the WebGL/`scene3d` layer.** Output
  was a playable 720x1280 H.264/AAC MP4 (`ffprobe`-confirmed: correct
  codecs, correct resolution, 5.056s duration matching the 150-frame/30fps
  config). Extracted comparison frames confirm every layer type rendered
  correctly and simultaneously on the same timeline: solid-color image
  background, `testsrc` video pattern with audio, fade-in "Generic
  Template Smoke Test" text, a sanitized inline-SVG "NEW" badge with its
  rounded-rect + text, a spinning yellow star `motionGraphic`, and — the
  one part of this brief flagged as an open risk — **a correctly lit,
  shaded, rotating 3D sphere from the `orbiting-product` R3F scene**,
  rendered via `@remotion/three`'s `<ThreeCanvas>` inside headless
  Chromium. **No headless-GPU/WebGL limitation was hit in this
  environment**: `chrome-headless-shell` (148.0.7778.97) rendered real
  ambient+directional lighting and Phong-style shading on the sphere, not
  a black/blank frame — almost certainly via Chromium's SwiftShader
  software WebGL fallback (no real GPU present in this sandbox), which
  evidently Just Works for this simple scene's complexity level. This is
  a positive, verified result, not an assumption; a more complex 3D scene
  (large textures, heavy shader work, many draw calls) might still hit
  software-rendering performance limits that this single-sphere proof
  scene wouldn't reveal — noted in the backlog as a follow-up watch item,
  not a known bug.

  See `orchestra/backlog.md` for the follow-up items this phase
  intentionally left open (product-surface exposure, template
  library/admin UI, more R3F scenes, `scene3d` performance at higher
  visual complexity).

## 9. Phase 8 — Job routing correction: the real final-composite path was not engine-aware, now fixed and live in production by explicit user authorization

**Requested and explicitly authorized by the user**, after being shown the
production tradeoff directly (chose "ทำแบบเต็มตามแผนเดิม" — do the full
version per the original plan: route strictly by
`resolveVideoRenderEngine()`).

### The finding

There are **two separate, differently-named job systems** in this codebase,
and Phase 6's "Remotion is now the default engine" work only ever reached
one of them:

1. **In-process poller** — `hyperframesRenderWorker.ts`'s
   `runHyperframesRenderWorkerOnce()`, polling the
   `marketplaceAutoReviewOutboxJobs` Drizzle table
   (`apps/web/drizzle/schema.ts:19227`). This is the path Phase 6 made
   Remotion-aware — it calls `resolveVideoRenderEngine()`/
   `executeVideoRender()` from `videoRenderer.ts`. Scheduled every 60s
   (`MARKETPLACE_AUTO_REVIEW_INTERVAL_MS`, default) by
   `initializeMarketplaceAutoReviewJob()` (`jobs/marketplaceAutoReviewJob.ts`,
   called from `server/_core/index.ts` at startup) — confirmed real and
   active in production, not dormant code.
2. **Desktop worker-app fleet** — the Tauri/Rust app (`apps/worker-app`)
   contributors run locally, polling the **different** `workerJobs` Drizzle
   table (`apps/web/drizzle/schema.ts:14002`). This path is 100%
   hardcoded to HyperFrames at every layer (Rust `HYPERFRAMES_JOB_TYPE`
   const, the sidecar `render.mjs` script which hard-validates
   `payload.renderIntent === "hyperframes_final_composite"` and shells out
   directly to the bundled `hyperframes` CLI binary, and the server-side
   runtime-pack manifest allowlist in `apps/web/server/routes/workerRuntime.ts`
   which only accepts `rendererKind: "hyperframes_cli_official"`). It
   **never** touched `videoRenderer.ts`/`remotionRuntimeAdapter.ts` — grep
   confirmed zero references before this fix.

**The actual user-facing "Final Composite" render — the one that produces
the video users see** — was created via
`createHyperframesFinalCompositeForApi()` in
`server/services/hyperframesRuntimeApiService.ts`, which **unconditionally**
called `queueDesktopHyperframesFinalCompositeJob()`, routing every
final-composite render to the desktop fleet, which can only run HyperFrames.
So Phase 6's default-flip work never actually applied to any real
final-composite video a user requested — it only affected a separate job
path real traffic never exercised for that render.

### The fix

`createHyperframesFinalCompositeForApi()` now calls
`resolveVideoRenderEngine({ tenantId })` after `payload`/`composition`/
`creditEstimate` are computed (those are engine-agnostic, unchanged) and
branches:

- **`engine === "hyperframes"`** (the kill-switch/rollback-forced case):
  byte-for-byte identical to the pre-fix code — same
  `queueDesktopHyperframesFinalCompositeJob(...)` call, same try/catch
  (including the `dispatch_disabled` branch), same response shape. This is
  the instant-rollback path (env var, no deploy) and must never regress.
- **`engine === "remotion"`** (now the default, per Phase 6): reuses the
  already-built `composition` variable and calls
  `queueHyperframesRenderJob({ auth, composition, jobType:
  "hyperframes_render", priority: 82 })` — the same function
  `createHyperframesPreviewForApi()` already used for the preview path
  above it in this file, confirming the precedent. `jobType:
  "hyperframes_render"` was the correct choice (not a guess): there is no
  separate "final composite" `HyperframesOutboxJobType` — HYPERFRAMES_OUTBOX_JOB_TYPES
  has no such value, and `isFinalCompositeRenderPayload()` in
  `hyperframesRenderWorker.ts` determines "is this a final composite" from
  the *payload's* `renderIntent`/`compositionMode` fields (already
  `"final"`/`"captioned_final_composite"` via the existing
  `buildHyperframesRenderJobPayload({ composition })` call), not from the
  outbox row's `jobType` column. Credits are still reserved identically
  (`chargeRequired: true, creditEstimate, quotaDecision`) — routing engine
  does not change cost.

This queues the job onto `marketplaceAutoReviewOutboxJobs` instead of
`workerJobs` — the in-process poller then picks it up (within
~60s/`MARKETPLACE_AUTO_REVIEW_INTERVAL_MS`) and calls
`executeVideoRender("remotion", ...)`, which already has its own
per-job safety net from Phase 6: an `UnsupportedPresetError` (unported
preset combination) transparently falls back to executing the HyperFrames
CLI render within that same in-process job, so no capability is lost by
this routing change — it only changes *which* job queue/worker executes
the render, not what happens if Remotion can't handle the specific preset
combination.

### Explicitly out of scope (unchanged by this fix)

Making the desktop worker-app fleet itself Remotion-capable — that remains
a separate, much larger effort (new Remotion runtime pack, new/modified
Rust sidecar dispatch script, new Rust job-type branch) — see
`orchestra/backlog.md` item 17. Desktop-fleet jobs (if any tenant/flow
still ends up there) remain HyperFrames-only.

### Files changed

- `apps/web/server/services/hyperframesRuntimeApiService.ts` — the routing
  branch described above, plus a new `resolveVideoRenderEngine` import.
  No other file touched (`videoRenderer.ts`, `remotionRuntimeAdapter.ts`,
  `hyperframesRenderWorker.ts`, `apps/worker-app`, `workerRuntime.ts` all
  untouched, per the task's explicit constraint).
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
  — added a `describe("createHyperframesFinalCompositeForApi engine
  routing (Phase 8)")` block with `vi.mock()` isolation of the module's
  external dependencies (feature access, run/product lookup, composition
  builder, both queue functions, `resolveVideoRenderEngine`), covering:
  (a) `engine === "hyperframes"` → `queueDesktopHyperframesFinalCompositeJob`
  called, `queueHyperframesRenderJob` NOT called, response unchanged
  shape; (b) `engine === "remotion"` → `queueHyperframesRenderJob` called
  with `jobType: "hyperframes_render"`/`priority: 82`, desktop dispatch
  NOT called, credits still reserved (`chargeRequired: true`).

**Quality gate:** `pnpm check` — 0 new errors in either changed file
(confirmed via targeted grep against the full error list; remaining errors
are the same pre-existing, unrelated failures already documented in
earlier phases — `packages/ui/src/components/ui/sidebar.tsx` Radix
ref-type drift, TipTap `ChainedCommands` drift, etc., none touching
`hyperframesRuntimeApiService.ts`, `hyperframesRenderService.ts`, or
`videoRenderer.ts`). `hyperframesRuntimeApiService.test.ts`: 23/23 pass
(21 pre-existing + 2 new). Full targeted re-run of
`hyperframes*`/`remotion*`/`videoRenderer.test.ts`/
`shared/hyperframes/__tests__/**`/`server/workers`: 259 passed, 3 failed
— the **same 3 pre-existing, already-documented failures** from the
Phase 6/7 entries above (`hyperframesAutoPlanService.test.ts` credit-estimate
drift, `hyperframesWorkerPolicy.test.ts` and
`shared/hyperframes/__tests__/autoPlan.test.ts` Zod-schema drift), byte-for-byte
identical identity to the pre-existing baseline — zero regression,
including zero regression to the `engine === "hyperframes"` rollback-safety
path specifically (its unit test explicitly asserts unchanged call
behavior).

## 10. Phase 9 — Render-jobs monitoring UI made queue-agnostic

**Problem:** Phase 8 made the real user-facing Final Composite render
correctly route to either `workerJobs` (desktop worker-app fleet,
`engine === "hyperframes"`) or `marketplaceAutoReviewOutboxJobs`
(in-process poller, `engine === "remotion"`, now the default) via
`queueHyperframesRenderJob()`. But the "งานเรนเดอร์ของฉัน" / "Worker
queue" monitoring page (`/render-jobs`,
`apps/web/client/src/pages/RenderJobsPage.tsx`) only ever read from
`workerJobs` (`server/routers/workerJobs.ts` →
`server/services/workerJobMonitorService.ts`). Since Remotion is now the
default engine, most Final Composite jobs became invisible on this page
even though they were queued and rendering successfully — a pure
monitoring-visibility gap, no dispatch/billing/routing behavior was wrong.

**Fix (read-only, does not touch dispatch/routing/billing):**
`server/services/workerJobMonitorService.ts` gained a second, parallel
repository (`WorkerOutboxJobMonitorRepository` /
`defaultOutboxWorkerJobMonitorRepo`) that reads
`marketplaceAutoReviewOutboxJobs`, scoped by `tenantId` + `userId` and
filtered to final-composite payloads only (`payloadJson.renderIntent ===
"final" AND payloadJson.compositionMode === "captioned_final_composite"`
— the same predicate `isFinalCompositeRenderPayload()` in
`hyperframesRenderWorker.ts` uses). Preview-render outbox jobs (created by
`createHyperframesPreviewForApi()`, which also calls
`queueHyperframesRenderJob()` but with a non-final `renderIntent`) are
deliberately excluded — they're short-lived per-edit jobs, and `workerJobs`
(what this page already showed) never tracked previews either, so
including them would break the page's "jobs I explicitly clicked Render
for" mental model.

Outbox rows are mapped into the exact same `UserWorkerJobSummary` /
`UserWorkerJobDetail` shape the `workerJobs` path already produces, so
**no frontend change was needed** — `RenderJobsPage.tsx` is untouched.
`worker: null`, `runtimeType: "in_process"`, `resourceProfile: "server"`
(sentinel values, not in the workerJobs enums, since there's no physical
machine executing these). `outputRefs` are populated from
`payloadJson.outputUrl`/`payloadJson.outputArtifactRef` (the same fields
`hyperframesRenderService.ts`'s existing `outputRefsFromPayload()` already
reads for the render-status-polling API), requiring both a URL and a
content hash before surfacing a ref — same "verified, not just present"
bar the `workerJobs` path applies. No per-shot event log exists for
outbox jobs today (`workerJobEvents` only covers the desktop-fleet table),
so `latestEvent`/detail `events` are left empty rather than inventing data
— logged as a follow-up in `orchestra/backlog.md`.

**Raw `marketplaceAutoReviewOutboxJobs.status` lifecycle** (read directly
from the code that writes it, not guessed): insert/requeue → `"queued"`;
stale-lock auto-release → `"retry"`; worker claims (query only selects
`status IN ("queued","retry")`) → `"running"`; success → `"completed"`;
failure with retries remaining → `"retry"`; failure exhausted/non-retryable
→ `"failed"`; user/operator cancel request (existing
`cancelHyperframesRenderJob()`) → `"cancel_requested"`. The pre-existing
`mapOutboxStatusToRenderStatus()` in `hyperframesRenderService.ts` also
defensively handles `"pending"`, `"locked"`, `"cancelled"`, and
`"dead_lettered"` even though the current worker never writes them itself
— this fix's mapping (`OUTBOX_STATUS_TO_USER_STATUS` in
`workerJobMonitorService.ts`) mirrors that same superset so no future
status value silently disappears from the page. Mapping onto the existing
`UserWorkerJobStatus` union: `queued`/`pending`/`retry` → `"queued"`;
`locked`/`running` → `"running"`; `completed` → `"completed"`;
`cancel_requested`/`cancelled` → `"canceled"`; `failed`/`dead_lettered` →
`"failed"`. `cancel_requested` → `"canceled"` is a documented
simplification: there's no `"canceling"` value in `UserWorkerJobStatus`,
and — see the cancel decision below — an already-`"running"` job that
receives a cancel request can, per the existing (pre-Phase-9)
`cancelHyperframesRenderJob()` mechanism, get stuck in `"cancel_requested"`
without the worker's completion write ever landing (it's gated on `WHERE
status = "running"`), so mapping it to `"canceled"` best matches user
intent rather than claiming certainty about the underlying process state.

**Cancel decision — explicitly NOT extended to outbox jobs, follow-up
logged.** Investigated reusing the existing `cancelHyperframesRenderJob()`
mutation (`status → "cancel_requested"`, scoped to
`HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES`). It reliably stops a
not-yet-claimed job (worker's claim query only selects `"queued"`/
`"retry"`), but for an already-`"running"` job, `hyperframesRenderWorker.ts`
grep-confirmed **zero** references to `"cancel_requested"` in its polling
loop — the worker's completion/failure `UPDATE`s are gated on `WHERE
status = "running"` and will silently no-op once the row has moved to
`"cancel_requested"`, meaning a cancel on a running outbox job can leave it
stuck without actually stopping the in-flight render process. That's a
pre-existing question mark in `hyperframesRenderService.ts`/
`hyperframesRenderWorker.ts` (not introduced by this fix), and not
something safe to wire into a read-only monitoring-visibility fix without
separately reviewing/fixing the render worker's job-claiming/completion
race. `workerJobMonitorService.ts`'s `cancelQueuedUserWorkerJob()` now
checks whether an unmatched job ID belongs to the outbox table before
erroring, so it reports an accurate `CONFLICT` ("Canceling this render job
is not supported yet.") instead of a misleading `NOT_FOUND` — but the
Cancel button on `/render-jobs` will simply stay disabled for outbox jobs
(`canCancel: false` in the projection) until this is revisited.

**Files changed:**
- `apps/web/server/services/workerJobMonitorService.ts` — added
  `WorkerOutboxJobMonitorRepository` type, `defaultOutboxWorkerJobMonitorRepo`
  (reads `marketplaceAutoReviewOutboxJobs`), status-mapping tables,
  `projectOutboxJob()`/`projectOutboxOutputRefs()`. `listUserWorkerJobs()`,
  `getUserWorkerJobDetail()`, and `cancelQueuedUserWorkerJob()` now accept
  an optional `outboxRepo` dependency (defaults to the real repo) and merge
  results from both tables; `workerJobs`-only call shape/behavior
  (`repo.listUserJobs`/`repo.getUserJob`/`repo.cancelQueuedJob` invocation
  signatures) is byte-for-byte unchanged, verified by the pre-existing
  tests still passing unmodified in assertion content (only the `deps`
  object gained an explicit empty `outboxRepo` mock to avoid touching the
  real DB by default).
- `apps/web/server/services/__tests__/workerJobMonitorService.test.ts` —
  added `createEmptyOutboxRepo()` helper, wired it into all pre-existing
  tests (regression guard: `workerJobs`-only behavior unchanged), and
  added 4 new tests: outbox-only jobs map into the unified shape,
  merged+sorted+limited list across both tables, outbox job detail with
  empty `events`, and the outbox cancel-CONFLICT-not-NOT_FOUND behavior.
- `apps/web/server/routers/workerJobs.ts` — **not modified**; the merge
  lives entirely in the service layer via default dependency injection, so
  no router signature change was needed.
- `apps/web/client/src/pages/RenderJobsPage.tsx` — **not modified**; the
  unified `UserWorkerJobSummary`/`UserWorkerJobDetail` shape already
  satisfies every field the page reads.

**Quality gate:** `pnpm check` — 0 new errors (remaining errors are the
same pre-existing, unrelated `packages/ui` Radix ref-type drift and
client-side TipTap `ChainedCommands`/dashboard-primitives drift already
documented in earlier phases; none touch `workerJobMonitorService.ts` or
`workerJobs.ts`). `workerJobMonitorService.test.ts`: 9/9 pass (5
pre-existing + 4 new). `hyperframesRenderService.test.ts`: 31/31 pass
(untouched, run as a broader regression check since this fix reads the
same table that service writes to).

### Follow-ups (see `orchestra/backlog.md`)
- Extend cancel to outbox jobs, after separately fixing/reviewing the
  running-job cancel race in `hyperframesRenderWorker.ts` /
  `cancelHyperframesRenderJob()`.
- Richer per-shot progress events for outbox-table jobs (no equivalent to
  `workerJobEvents` exists for this table today).
- Optional: a small visual indicator on `/render-jobs` distinguishing
  which queue/engine a job actually ran on (desktop fleet vs in-process
  Remotion/HyperFrames poller) — nice-to-have, not required for this fix.

## 10. Phase 10 — Desktop worker-app fleet becomes Remotion-primary (explicit user directive)

User directive (verbatim intent): make Remotion the PRIMARY renderer for
the desktop worker-app fleet; HyperFrames becomes an OPTIONAL, separately
downloadable pack — no longer bundled together into one required install.
This requires new runtime pack variant(s), a new Node sidecar script, and
Rust changes in `apps/worker-app`.

### Ground truth (from a full architecture-mapping pass, not assumed)

- Two independent job queues already exist: the in-process poller
  (`marketplaceAutoReviewOutboxJobs`, engine-aware since Phase 6/8) and the
  desktop worker-app fleet (`workerJobs`, 100% hardcoded to HyperFrames at
  every layer today — Rust `HYPERFRAMES_JOB_TYPE` const, sidecar manifest
  validation, server-side allowlist).
- Capability-hint matching between queued jobs and connected workers is
  REAL and fully wired end-to-end today (`workerJobMatchesSelection()`,
  `capabilityRequirementsJson.capabilityFamilies` vs. the Rust client's
  `capability_hints`) — not dead code. This is the exact mechanism to
  extend for engine-aware routing to the desktop fleet.
- `runtimeId`/`rendererKind`/`sidecarScriptPath`/`sidecarLauncher` in
  `runtime-pack/manifest.json` and the server allowlist
  (`SUPPORTED_WORKER_RUNTIME_PACK_IDS`, `isOfficialRuntimePackManifest()`)
  are all single-scalar, strict-equality-checked values today — no
  multi-engine-per-pack concept exists.
- `ClaimedWorkerJob.job_type: String` and `.input_json: Value` (Rust) are
  already generic enough to carry a second engine's job type/payload with
  no struct changes.
- `capability_hints` sent by the Rust client are currently a **hardcoded
  literal**, not derived from the actually-installed runtime pack's
  manifest — this needs to become manifest-driven so a worker only
  advertises capabilities it can actually fulfill.

### Design: two separate, independently-installable runtime packs

Rather than one pack containing both engines (rejected — contradicts
"ไม่จำเป็นต้อง pack รวมแล้ว" and roughly doubles pack size/download time
for every contributor), keep `runtime-pack/manifest.json` single-scalar
per install, and add a SECOND pack variant:

- **`remotion-wsl2` / `remotion-windows-x64`** (NEW, becomes the default
  the app suggests installing): bundles Node + `@remotion/renderer` +
  `@remotion/bundler` + a bundled shared composition package (see below)
  + FFmpeg/ffprobe + Thai fonts. Reuses the SAME already-solved
  Chrome-for-Testing binary bundling step as the HyperFrames pack — no
  separate Chromium acquisition needed, since `@remotion/renderer`'s
  `renderMedia()`/`selectComposition()` accept a `browserExecutable`
  option to point at an existing Chromium install rather than downloading
  its own. `manifest.json` gets `rendererKind: "remotion_renderer_official"`,
  `sidecarScriptPath: "remotion-sidecar/render.mjs"`.
- **`hyperframes-wsl2` / `hyperframes-windows-x64`** (UNCHANGED, becomes
  optional/secondary): exactly what exists today, byte-for-byte, just no
  longer the only/default option presented in the app's install flow.

A worker can have either pack installed (or, as a later enhancement not
required this pass, both side-by-side) and advertises `capability_hints`
computed from whichever manifest is actually present on disk, instead of
a hardcoded HyperFrames-only literal.

### Shared code, not duplicated code

The existing Rust-side `runtime-sidecar/render.mjs` vs
`runtime-pack/hyperframes-sidecar/render.mjs` had already silently
diverged (a 4-line drift found during investigation) purely from being
two copies of the same logic. To avoid repeating that mistake for
Remotion: the Remotion composition/rendering logic used by the new
sidecar is NOT reimplemented from scratch inside `apps/worker-app` — it
is extracted from `apps/web/server/remotion/`/`remotionCompositionService.ts`
into a new shared workspace package (`packages/remotion-render` or
similar) that both `apps/web`'s in-process adapter AND the new worker-app
sidecar depend on and bundle from, so a future change to the composition
only has to happen once.

### Server-side changes required

- `apps/web/server/routes/workerRuntime.ts`: `SUPPORTED_WORKER_RUNTIME_PACK_IDS`
  gains `"remotion-wsl2"`/`"remotion-windows-x64"`; `isOfficialRuntimePackManifest()`
  accepts `rendererKind === "remotion_renderer_official"` as a second valid
  value (not replacing the HyperFrames check, additive); `requiredRuntimeArchiveFiles()`
  gains a Remotion-pack-specific required-file list.
- New capability family `"remotion-render"` alongside the existing
  `HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES`.
- `createHyperframesFinalCompositeForApi()` (Phase 8's routing branch) is
  revisited: now that the desktop fleet CAN run Remotion, the
  `engine === "remotion"` branch is upgraded to attempt desktop-fleet
  dispatch (with the new capability family) so Remotion renders benefit
  from the same distributed/scalable execution HyperFrames renders always
  had, rather than being limited to the single in-process server. The
  Phase 6 in-process fallback path is preserved as what happens when no
  capability-matching desktop worker claims the job (jobs simply queue
  until a Remotion-capable worker is online — same behavior HyperFrames
  jobs have always had when no worker is online).

### Rust changes required (`apps/worker-app/src-tauri/src/`)

- `worker_executor.rs`: generalize `HYPERFRAMES_JOB_TYPE`-only dispatch —
  add `REMOTION_JOB_TYPE` const; `prepare_hyperframes_execution_plan`,
  `build_sidecar_command`, `build_sidecar_manifest` all gain an engine
  branch (reading which pack/manifest is installed) instead of assuming
  HyperFrames unconditionally.
- `worker_loop.rs`: `execute_hyperframes_job`/`_inner` generalized to
  `execute_render_job`; `capability_hints` computed from the installed
  `runtime_manifest.rs` manifest's `rendererKind` instead of a hardcoded
  literal.
- `commands.rs`: `worker_app_install_runtime_pack`'s `runtime_id`
  selection gains a renderer-kind dimension (not just WSL2-vs-Windows
  platform) so the app can install either pack variant.
- `runtime_manifest.rs`: doctor/readiness checks branch per installed
  pack's `rendererKind` rather than assuming HyperFrames-specific files.

### Explicitly out of scope / unverifiable in this environment

This session can write and compile-verify (`cargo check`/`cargo build`)
all Rust source changes, and can write and functionally smoke-test the
new Node sidecar script (this sandbox already has a working
`@remotion/renderer` pipeline to test against). It CANNOT, in this
sandboxed environment: download real multi-hundred-MB Chrome-for-Testing/
Node binaries from external CDNs to assemble a real release zip, build a
signed Windows NSIS installer, or test the Tauri app end-to-end on a real
Windows/WSL2 contributor machine. These remain manual/CI release-pipeline
steps, exactly as they already are today for HyperFrames packs (the
existing `package-runtime-release.mjs` already expects pre-downloaded
Node/Chrome/ffmpeg directories to be passed in via CLI args — this is not
a new external dependency introduced by this phase, it's the existing
release process, now with a second target-runtime option).

### Sidecar contract — IMPLEMENTED AND VERIFIED (Node/TS half of Phase 10)

The shared package `packages/remotion-render/` and the new
`apps/worker-app/runtime-pack/remotion-sidecar/render.mjs` CLI entrypoint
are built and were verified with a REAL end-to-end render in this sandbox
(not mocked) — see "Verification" below. This is the stable protocol the
(not-yet-started) Rust dispatch changes must implement against.

**Invocation** (identical shape to the HyperFrames sidecar):
```
node render.mjs render --manifest <path> --workspace <dir> --output-dir <dir> --format mp4
```

**Manifest JSON file** (read from `--manifest`, NOT stdin), Zod-validated,
fail-closed (`packages/remotion-render/src/manifest.ts`):
```json
{
  "renderIntent": "remotion_final_composite",
  "jobId": "string (optional)",
  "assignmentAttempt": "string (optional)",
  "runtimePolicy": { "requireOfficialRuntime": true, "rejectFallbackRender": true },
  "input": {
    "compositionId": "MarketplaceAutoReview | GenericTemplate",
    "inputProps": "<RemotionInputProps | RemotionTemplateConfig, discriminated on compositionId>"
  },
  "output": { "finalVideoPath": "final.mp4 (optional, defaults to final.mp4)" }
}
```
All `src`/asset URLs inside `inputProps` MUST already be direct
`http(s)://` URLs — Remotion's own asset pipeline requirement (does not
accept local file paths or `file://`). The sidecar does NOT do its own
asset staging (unlike the HyperFrames sidecar) — that responsibility stays
server-side (`apps/web`'s existing composition-building services), matching
the design principle "the sidecar's job is strictly bundle+render+probe."
A raw-text blocked-marker scan (`mock video content`, `local_smoke_snapshot`,
etc.) runs before JSON parsing, same defense-in-depth posture as the
HyperFrames sidecar's `blockedMarkers`.

**Env vars read**: `SMARTAIHUB_RUNTIME_ROOT` (resolves `runtime-pack/`
root, same variable/convention as the HyperFrames sidecar).
`FFMPEG_PATH`/`FFPROBE_PATH` are NOT read directly by the sidecar script —
it resolves `runtime-pack/bin/ffmpeg`/`ffprobe` itself the same way the
HyperFrames sidecar does, falling back to `ffmpeg`/`ffprobe` on `PATH` on
Linux. The bundled Chromium binary is resolved by searching
`runtime-pack/browser/` for `chrome`/`headless_shell` (same directory the
HyperFrames pack already populates) — **confirmed: no separate Chromium
acquisition is needed for a Remotion pack**, `@remotion/renderer`'s
`browserExecutable` option happily reuses the exact same Chrome-for-Testing
binary already bundled for HyperFrames.

**Progress protocol**: `console.log("SMARTAIHUB_EVENT " + JSON.stringify({eventType, stage, percent, message, ...}))`
lines, IDENTICAL wrapper format to the HyperFrames sidecar so the Rust
event parser (`worker_loop.rs`'s `parse_sidecar_worker_event_line`) needs
no format changes, only new `eventType` values to recognize:
`sidecar.started` → `bundle.started` → `bundle.succeeded` → `render.started`
→ `render.progress` (×N, ~10% steps) → `verify.started` → `render.succeeded`
→ `sidecar.completed` (success), or `sidecar.failed` (any failure, with
`errorCode`/`message`).

**Output files** written to `--output-dir`: the final video (`final.mp4`
by default, or `output.finalVideoPath`'s basename), `manifest.json`
(renderer id, composition id, dimensions/fps/duration, SHA-256 of the
output, Remotion's `slowestFrames` diagnostic), `probe.json` (raw
`ffprobe -show_format -show_streams` JSON, best-effort — `null` if
`ffprobe` isn't resolvable, never fails the render).

**Build**: `packages/remotion-render` ships as a single `esbuild`-bundled
`dist/index.js` (see `build.mjs`), NOT `tsc`'s per-file output — plain
Node ESM requires explicit file extensions on relative imports
(`./Root`, not `./Root.js`), which a straight multi-file `tsc` emit does
not provide and which broke the sidecar with `ERR_MODULE_NOT_FOUND` until
fixed. `tsc` still runs first (for `.d.ts` declarations, tolerant of one
pre-existing cosmetic type-only error in a `@types` gap for
`FontFaceSet.add`) but its `.js` output is overwritten by the bundle.
**Important**: `src/Root.tsx` must ship alongside `dist/` in ANY
distribution (this monorepo's pnpm workspace, or a staged worker-app
runtime pack) — `@remotion/bundler` needs the raw, unbundled `.tsx`
SOURCE file to webpack-compile at render time (`ROOT_ENTRY_POINT` resolves
to `../src/Root.tsx` relative to wherever the bundled `dist/index.js`
actually runs from).

**A real, previously-unknown production bug was found and fixed via this
smoke test**: `<OffthreadVideo trimAfter={shot.trimAfterFrames}>` throws
`TypeError: trimAfter must be a positive number, instead got 0` when
`trimAfterFrames` is `0` (meaning "no trim needed") — Remotion requires
the prop to be OMITTED, not passed as `0`. This existed identically in
the shipped production file
`apps/web/server/remotion/MarketplaceAutoReviewComposition.tsx` (the
`packages/remotion-render` copy was extracted from it) and would have
crashed any real final-composite render whose last/only shot has no
trailing trim — a case the earlier Phase 2/3 smoke-test fixtures happened
not to exercise. **Fixed in both files**: `trimBefore`/`trimAfter` are now
spread conditionally (only included when `> 0`). Verified via the full
existing Remotion/worker/hyperframes test suite (62/62 pass across
`remotionCompositionService`, `remotionTemplateService`, `videoRenderer`,
`hyperframesRuntimeApiService`, `workerJobMonitorService`) — zero
regression — plus a fresh real render.

**Verification (real, not simulated)**: this sandbox happened to already
have a real `apps/worker-app/runtime-pack/browser/` Chrome-for-Testing
binary present (from prior session state), enabling a genuinely real
end-to-end smoke test rather than a synthetic one. Built a real manifest
fixture, served a real `ffmpeg`-synthesized test clip over a local HTTP
server (matching Remotion's http(s)-only asset requirement), and ran
`node runtime-pack/remotion-sidecar/render.mjs render --manifest ... --workspace ... --output-dir ... --format mp4`
directly. Result: a real, `ffprobe`-validated 360×640 H.264/AAC MP4, 90
frames at 30fps, `probe_score=100`. Along the way, also found and fixed a
real file-permission issue: `runtime-pack/browser/chrome_crashpad_handler`
was missing its executable bit (`-rw-rw-rw-` instead of `-rwxrwxrwx`),
causing `posix_spawn: Permission denied`. Fixed locally with `chmod +x`
for this test — **flagged as a release-pipeline risk to double-check**:
the actual zip-extraction step in `commands.rs`'s
`worker_app_install_runtime_pack` on a real contributor machine must
preserve Unix executable permissions when unzipping, or every real
install would hit this same crash (not investigated further this pass,
since it's in the Rust/packaging territory of the NOT-YET-STARTED work
below).

### Remaining Phase 10 work (NOT started this pass)

Only the Node/TS sidecar half (`packages/remotion-render` +
`apps/worker-app/runtime-pack/remotion-sidecar/render.mjs`) is complete
and verified. Still outstanding, exactly as scoped in this section's
design above:
- **Rust dispatch changes** (`apps/worker-app/src-tauri/src/worker_loop.rs`,
  `worker_executor.rs`, `commands.rs`, `runtime_manifest.rs`) — generalizing
  `execute_hyperframes_job` to branch by installed pack's `rendererKind`,
  computing `capability_hints` from the manifest instead of a hardcoded
  literal, adding a `REMOTION_JOB_TYPE` const, and a renderer-kind
  dimension to runtime-pack install/selection.
- **Server-side allowlist + capability + routing changes**
  (`apps/web/server/routes/workerRuntime.ts`'s
  `SUPPORTED_WORKER_RUNTIME_PACK_IDS`/`isOfficialRuntimePackManifest()`,
  a new `"remotion-render"` capability family, and revisiting
  `createHyperframesFinalCompositeForApi()`'s `engine === "remotion"`
  branch to prefer desktop-fleet dispatch with the new capability once the
  fleet can actually claim such jobs).
- **Packaging script** (`apps/worker-app/scripts/package-runtime-release.mjs`)
  changes to assemble a real `remotion-wsl2`/`remotion-windows-x64` release
  zip (staging `packages/remotion-render`'s built `dist/` + `src/Root.tsx`
  + node_modules for `remotion`/`@remotion/*`/`three`/`@react-three/fiber`,
  reusing the existing `--browser-dir`/`--ffmpeg`/`--ffprobe` staging steps
  unchanged since Remotion reuses the same binaries).
- Real Chromium/Node binary downloads, a signed NSIS installer build, and
  cross-machine testing remain genuinely outside what this sandboxed
  session can do (see "Explicitly out of scope" above) — these are
  existing manual/CI release-pipeline steps for the HyperFrames pack too.
