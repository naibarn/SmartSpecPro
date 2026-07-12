I now have complete context. Writing the section content.

# section-01-neutral-schema-audio-layer-compiler

**Feature 133 — Content & Video Intelligence Platform (Phase 1 / MVP)**
**Batch 1 (foundation). Depends on: nothing. Blocks: sections 02, 04, 06, 07.**

Source of truth: `../claude-plan.md` §2 & §4.3, `../claude-plan-tdd.md` Section 1,
`../claude-research.md` A1–A4 / B2, `../spec.md` §5 & §6 (normative render contract).

Work directory root for all code: `/home/dev/projects/SmartSpecPro/apps/web`
(pnpm workspace). Vitest node env for `server/**` and `shared/**`.
Run one test: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"`.
Type gate: `pnpm check` (`tsc --noEmit`).

---

## 1. What this section delivers

This is the schema + compiler foundation for the whole feature. It has four
deliverables, all pure/data-driven (no I/O, no DB, no network):

1. **`shared/videoIntelligence/projectSchemas.ts`** — the renderer-agnostic
   `VideoProjectDocument` Zod schema a user authors (the "Neutral Project
   Schema").
2. **An additive `audio` layer variant** on the existing frozen
   `RemotionLayerSchema` (`shared/remotion/layerTemplateSchemas.ts`) plus its
   render branch in `server/remotion/GenericTemplateComposition.tsx`.
3. **`server/services/videoProjectCompiler.ts`** — the pure compiler turning a
   `VideoProjectDocument` into the frozen `RemotionTemplateConfig` the engine
   already consumes (template expansion, caption-cue → text-layer, frame offset,
   40-layer split, brand-lock enforcement, cost model).
4. **A cost-estimate helper** (`estimateRenderCost`) co-located with the compiler
   (or in `shared/videoIntelligence/cost.ts` — see §5). Section 02's per-template
   cost tests re-import this; keep the export name stable.

**Critical constraint (reuse-first, plan §12):** the frozen
`RemotionTemplateConfig` contract is NEVER forked. The only change to it is the
**additive** `audio` discriminated-union member. Every existing layer variant and
every existing test (`server/services/remotionTemplateService.test.ts`,
`server/remotion/*` tests) MUST stay green. Adding a union member also forces you
to add an `audio` case to the exhaustive `switch` in
`GenericTemplateComposition.tsx` (there is a `const exhaustiveCheck: never =
layer` default that makes `tsc` fail without it).

---

## 2. Interfaces this section must expose (consumed by later sections)

Keep these names and shapes exact — sections 02, 03, 04, 06, 07 import them.

```ts
// shared/videoIntelligence/projectSchemas.ts
export const VideoProjectDocumentSchema: z.ZodType /* .strict() root */;
export type VideoProjectDocument = z.infer<typeof VideoProjectDocumentSchema>;
export const SceneSchema, AudioTrackSchema, ClaimRecordSchema, /* + inferred types */;
export type PlatformPreset = "tiktok_9_16" | "reels_9_16" | "youtube_16_9" | "square_1_1";

// server/services/videoProjectCompiler.ts
export type TemplateBuildContext = {
  format: { width: number; height: number; fps: number; durationMs: number };
  brandKit: BrandKit | null;              // §4.3 shape; import from where §5's brand kit type lives
  assetResolver: AssetResolver;
};
export type AssetResolver = {
  url(assetId: number | string): string;         // throws if unresolved (compiler maps to VI_ASSET_UNRESOLVED)
  sha256(assetId: number | string): string | undefined;
};
export type RenderCostEstimate = { score: number; cls: "low" | "medium" | "high"; recommendPreRender: boolean };
export type SegmentPlan = { /* part order + concat instruction; see §4.5 */ };
export type CompileResult =
  | { kind: "single"; config: RemotionTemplateConfig; cost: RenderCostEstimate }
  | { kind: "segmented"; parts: RemotionTemplateConfig[]; concat: SegmentPlan; cost: RenderCostEstimate };

export function compileVideoProject(document: VideoProjectDocument, ctx: TemplateBuildContext): CompileResult;
export function estimateRenderCost(config: RemotionTemplateConfig): RenderCostEstimate;

export class VideoProjectCompileError extends Error { code: "VI_DOCUMENT_INVALID" | "VI_TEMPLATE_UNKNOWN" | "VI_ASSET_UNRESOLVED"; }
export class BrandLockViolationError extends Error { /* carries token + expected/actual */ }
```

**Dependency note on the Motion Template Registry (section 02):** the compiler
calls `template.build(params, ctx)` and needs `MOTION_TEMPLATE_REGISTRY` +
`TemplateBuildContext`. Section 02 owns the registry and the 10 template
builders; **section 01 owns and exports `TemplateBuildContext` / `AssetResolver`**
(so section 02 imports them, not the reverse — this keeps the dependency arrow
01 ← 02 clean). During section 01's own tests, inject a small in-test fake
registry / a fake template builder rather than depending on section 02 code.
Structure `compileVideoProject` so the registry is either imported lazily or
passed via a resolver seam so section 01's compiler tests do not require the real
templates to exist yet.

---

## 3. TESTS FIRST (write these before implementation)

Per `claude-plan-tdd.md` Section 1 and research B2 (PURE tier: plain
`import {describe, expect, it} from "vitest"`, no mocks; local
`buildX(overrides)` builders that call `Schema.parse(...)` inside; negatives via
`expect(() => schema.parse(bad)).toThrow()` or `.safeParse().success`).

### 3.1 `shared/videoIntelligence/__tests__/projectSchemas.test.ts` — PURE/FIX

```
it("parses a minimal valid VideoProjectDocument")
it("rejects a document with zero scenes")                    // scenes: min(1)
it("rejects an unknown platformPreset")
it("accepts scene layers that reuse RemotionLayerSchema variants")
it("round-trips a golden fixture deterministically")         // normalize() stability, no toMatchSnapshot
```

For the round-trip test: add a `normalizeDocument(doc)` (or reuse a `normalize`)
helper and assert `JSON.stringify(normalize(parsed)) ===
JSON.stringify(normalize(parsed))` (research B6 determinism convention). Put the
golden JSON beside the test in `shared/videoIntelligence/__fixtures__/`.

### 3.2 `shared/remotion/__tests__/layerTemplateSchemas.audio.test.ts` — PURE

```
it("parses the new audio layer variant with defaults")       // trimStartSec=0, volume=1, loop=false, fadeInMs=0, fadeOutMs=0
it("rejects audio.volume outside 0..1")
it("still parses every pre-existing layer variant")          // regression: image/video/text/svg/motionGraphic/scene3d untouched
```

Additionally: **run the existing suite** — `remotionTemplateService.test.ts` and
any `server/remotion/*` tests must remain green (frozen-contract regression gate).

### 3.3 `server/services/__tests__/videoProjectCompiler.test.ts` — PURE

```
it("compiles a single-scene layers document to a schema-valid RemotionTemplateConfig")
it("expands a template scene via the registry into layers")        // use an injected/fake template
it("emits caption text layers from captionCues when burnIn is false")
it("skips caption text layers when captions.burnIn is true")       // → ass_burn post-pass path (section 04)
it("offsets scene-relative startFrame to absolute frames")         // uses format.fps + scene.startMs
it("emits audio layers from audioTracks (narration/music/sfx)")
it("splits into segmented parts when >40 layers")                  // kind:"segmented" + SegmentPlan
it("throws VideoProjectCompileError on an unknown templateId")     // code VI_TEMPLATE_UNKNOWN
it("throws on an unresolved asset reference")                      // code VI_ASSET_UNRESOLVED
it("throws BrandLockViolationError when a locked color is violated")
it("passes brand tokens through when not locked")
it("output always validates against RemotionTemplateConfigSchema") // every emitted part re-parsed
```

Provide a local `buildDocument(overrides)` builder that returns a
`VideoProjectDocumentSchema.parse(...)` result, and a local `buildCtx(overrides)`
that returns a `TemplateBuildContext` with a fake `assetResolver` (an in-memory
map; `url()` throws for unknown ids so the "unresolved asset" test is trivial)
and a fake single-template registry seam for the "expands a template scene" and
"unknown templateId" cases.

### 3.4 `server/remotion/__tests__/genericTemplateComposition.audio.test.tsx` — jsdom (optional)

Only if a render-shape assertion is feasible without a real browser. Otherwise
cover the audio layer purely via the schema test (3.2) plus a
`remotionTemplateService` inputProps-passthrough assertion (i.e. that an `audio`
layer survives `buildGenericTemplateInputProps` unchanged). Do NOT attempt a real
Remotion render here — that lives in section 07's script harness.

### Test-rule reminders
- One `it` per branch; assert exact key-sets / exact `.toThrow` with the specific
  error class or `VI_*` code, never a blanket throw.
- No enforced coverage gate; correctness is per-branch assertions.
- `pnpm check` counts as a test — the `audio` `switch` case and the exported
  types must typecheck.

---

## 4. Implementation guidance

### 4.1 `shared/videoIntelligence/projectSchemas.ts` (new)

Zod `.strict()` schemas + inferred types. Field shapes (plan §2.1; annotated
example in `spec.md` §5.2):

```
VideoProjectDocumentSchema (.strict, root)
  schemaVersion: z.literal(1)
  format: { width, height, fps, durationMs }           // ints; fps 12..60 to match RemotionTemplateConfigSchema
  content: { topic?, audience?, language, platformPreset }
  brandKitId: z.string().nullable()                    // or bigint id as string; keep nullable
  scenes: z.array(SceneSchema).min(1)                  // ≥1 — "zero scenes" test
  audioTracks: z.array(AudioTrackSchema)
  captions: { presetId: CaptionPresetId, burnIn: boolean, language: string }
  claims: z.array(ClaimRecordSchema)                   // §7 / section 06
  qa: { targetScore: number, maxLoops: number }

SceneSchema (.strict)
  sceneId, startMs, endMs
  narration: z.string().nullable()
  narrationAudioAssetId: z.number().int().nullable()   // mediaAssets.id (bigint mode:number)
  visual: z.discriminatedUnion("kind", [
    { kind: "template", templateId: string, params: z.record(...) },
    { kind: "layers" }
  ])                                                    // or kind + optional templateId/params
  layers: z.array(RemotionLayerSchema)                 // REUSE verbatim, scene-relative startFrame
  motion: { intensity, camera }
  captionCues: z.array({ startMs, endMs, text })

AudioTrackSchema  = z.discriminatedUnion("kind", [
  { kind: "narration", assetRefs: number[], gainDb },
  { kind: "music",     assetRefs: number[], gainDb, ducking },
  { kind: "sfx",       events: { assetRef: number, atMs }[] },
])

ClaimRecordSchema (.strict)                             // §7 / section 06 consumes
  claim: string, source: string,
  status: z.enum(["approved","needs_review","unsupported","prohibited"])
```

Hard constraints (research A1, A9; plan §2.1):
- `SceneSchema.layers` **imports `RemotionLayerSchema`** from
  `../remotion/layerTemplateSchemas` — never re-declare a layer schema.
- `CaptionPresetId` **reuses the existing shared preset id type**
  (`CaptionPresetId` inferred from `HyperframesFinalCompositeSubtitlePresetSchema`;
  research A9). Do NOT invent a new caption preset enum. Locate that type before
  writing — grep for `HyperframesFinalCompositeSubtitlePreset` /
  `CaptionPresetId` in `shared/`.
- `platformPreset` is the small safe-area enum
  `["tiktok_9_16","reels_9_16","youtube_16_9","square_1_1"]` driving
  width/height defaults.
- Asset references are numeric ids (`mediaAssets.id` bigint / `libraryItems.id`
  int) or a storage-proxy URL string where unavoidable — never arbitrary external
  URLs (spec §17.3). Use `z.number().int()` for id refs.
- Provide `normalizeDocument(doc)` (stable key ordering) for the determinism
  test; this same normalize posture is reused by section 03's fixtures.

### 4.2 Additive `audio` layer variant

In `shared/remotion/layerTemplateSchemas.ts`, add a new `.strict()` variant built
on `RemotionLayerBaseSchema` and append it to the `RemotionLayerSchema`
`z.discriminatedUnion("type", [...])` array (additive — the array already holds 6
variants; add a 7th). Fields (plan §2.2):

```
type: z.literal("audio")
src: z.string().trim().url().max(4096)
trimStartSec: z.number().min(0).default(0)
volume: z.number().min(0).max(1).default(1)
loop: z.boolean().default(false)
fadeInMs: z.number().int().min(0).default(0)
fadeOutMs: z.number().int().min(0).default(0)
```

Also export `type RemotionAudioLayer = z.infer<typeof RemotionAudioLayerSchema>`
alongside the other per-variant type exports (mirror lines 132–139 of the file).
`<Audio>` has no visual box, so `x/y/width/height` are still present (base fields)
but ignored at render — add a one-line comment noting this. Do NOT touch
`RemotionTemplateConfigSchema` (the `.max(40)` layers cap stays frozen).

**Render branch** in `server/remotion/GenericTemplateComposition.tsx`:
- Import Remotion's `Audio` (`import { Audio } from "remotion"`).
- Add an `AudioLayerContent` component computing `volume` from `useCurrentFrame()`
  the same way the other layers derive per-frame values (apply fadeInMs/fadeOutMs
  as a frame-interpolated volume envelope; convert ms→frames with `fps`). Render
  `<Audio src trimBefore={round(trimStartSec*fps)} volume={...} loop={layer.loop} />`.
- Add `case "audio": return <AudioLayerContent layer={layer} fps={fps} />;` to
  the `switch` in `layerContent(...)` — this is REQUIRED for `tsc` (the
  `exhaustiveCheck: never` default at line 265–268 fails otherwise).
- The audio layer still flows through the `<Sequence from durationInFrames>`
  wrapper (frame-driven timing), which is correct — it just carries no visible
  box. Leaving it inside `layerWrapperStyle` div is harmless (`<Audio>` renders
  nothing visual); you may optionally special-case it to skip the wrapper div,
  but keeping the uniform wrapper is simpler and matches the existing loop.

**Verification:** `remotionTemplateService.test.ts` must still pass; add the audio
parse + inputProps-passthrough coverage in the new test file (3.2 / optional 3.4).

### 4.3 `server/services/videoProjectCompiler.ts` (new)

Pure function — no I/O; assets are already resolved into `ctx.assetResolver` by
the caller (section 07's router does the resolution). Steps (plan §2.3, spec §5.6):

1. `VideoProjectDocumentSchema.parse(document)` — on failure throw
   `VideoProjectCompileError` with `code: "VI_DOCUMENT_INVALID"`.
2. **Template expansion:** for each scene where `visual.kind === "template"`, look
   up the template in the Motion Template Registry (section 02), validate
   `visual.params` against the template's own `.strict()` `paramsSchema`, call
   `template.build(params, ctx) → RemotionLayer[]`, and apply brand-kit token
   resolution (§4.4). Unknown `templateId` → throw
   `VideoProjectCompileError` `code: "VI_TEMPLATE_UNKNOWN"`.
3. **Caption cues → text layers:** for each scene, unless `captions.burnIn` is
   set (then captions are handled by the `ass_burn` post-pass in section 04),
   emit one Remotion `text` layer per `captionCues` entry, styled from
   `captions.presetId` (map the caption preset to the text layer's
   `fontFamily/fontSizePx/color/textAlign`), timed by the cue's start/end.
4. **Frame offset:** convert scene-relative `startFrame` to absolute frames using
   `format.fps` and the scene's `startMs` (`absStartFrame = layer.startFrame +
   round(scene.startMs / 1000 * fps)`). Merge each scene's original `layers` +
   template-expanded layers + caption layers; emit `audio` layers from
   `document.audioTracks` (map assetRefs → `assetResolver.url(id)` for `src`;
   map `gainDb`/ducking to `volume` as appropriate).
5. **Flatten + 40-layer split:** flatten to one `layers[]` sorted by `zIndex`. If
   `> 40` layers (the frozen `RemotionTemplateConfigSchema` `.max(40)` cap),
   split into per-scene-chunk configs and return `kind:"segmented"` with a
   `SegmentPlan` (§4.5). Otherwise return `kind:"single"`.
6. **Re-validate:** run `RemotionTemplateConfigSchema.parse(...)` on **every**
   emitted config before returning (the "output always validates" test). Any
   validation failure here is an internal invariant break — throw
   `VideoProjectCompileError` `VI_DOCUMENT_INVALID` (or a dedicated internal code).
7. Compute `RenderCostEstimate` via `estimateRenderCost` (§4.6) and attach it.

**Asset resolution failures:** `assetResolver.url(id)` throws when an id is
unresolved; the compiler catches and re-throws as `VideoProjectCompileError`
`code: "VI_ASSET_UNRESOLVED"`.

### 4.4 Brand-lock enforcement (deterministic — a fact, not a judgment)

Plan §2.3 / spec §10.3: if `ctx.brandKit` has locked colors/fonts
(`brandKit.locks.colors === true` / `locks.fonts === true`) and any resolved
layer uses a color/font that differs from the locked brand value, throw
`BrandLockViolationError` (carry the token name + expected vs actual). This runs
inside compile so a locked-brand violation can NEVER reach a render. This is a
deterministic equality check — do NOT delegate it to an LLM (skill-first rule
applies to creative judgment, not to hard brand facts). When not locked, brand
tokens pass through (tested by "passes brand tokens through when not locked").

`BrandKit` type: import from wherever section 05 defines the Drizzle row / a
shared type. To keep section 01 buildable ahead of section 05, define a minimal
structural `BrandKit` type here (`{ colors?: {...}; fonts?: {...}; locks?: {
colors?: boolean; fonts?: boolean } }`) and let section 05's row structurally
satisfy it, OR import a shared type if one already exists. Prefer a small shared
type in `shared/videoIntelligence/` to avoid a compile-time dependency on the DB
layer.

### 4.5 `SegmentPlan` (over-40-layer split)

When flattened layers exceed 40, split by scene boundaries into ordered part
configs (each ≤ 40 layers, each a valid `RemotionTemplateConfig`). The
`SegmentPlan` records part order + the concat instruction that section 04's
`segment_concat` post-pass (via the reused `buildConcatFfmpegArgs`) will execute.
Keep the shape minimal and serializable (it is embedded in the worker payload in
section 03/07): part index → durationInFrames, plus an ordered list for concat.
Section 03's `SegmentPlanSchema` (in `shared/workerRuntime.ts`) must accept this
shape — coordinate the field names with section 03 (they are peers; define the
shape here and mirror it in the worker schema).

### 4.6 Cost model — `estimateRenderCost`

Pure function (plan §4.3): `RenderCostEstimate = { score, cls, recommendPreRender }`
where `score = Σ (layers.length × durationInFrames × cost-class-weight)` (a simple
weighted sum; pick fixed weights per layer type or a flat weight — keep it
deterministic and documented). `cls` buckets the score into `low|medium|high`;
`recommendPreRender` is informational in Phase 1 (no scene3d pre-render yet) —
set it `true` only above a fixed high-cost budget. Section 02's
`shared/videoIntelligence/__tests__/cost.test.ts` re-tests this exact contract
(`it("scores cost = Σ layers × frames × class-weight")`,
`it("flags recommendPreRender only above budget")`,
`it("clamps/handles empty layer sets")`), so **the export name and return shape
are locked here.** If you place it in `shared/videoIntelligence/cost.ts`, the
compiler imports it from there and section 02 tests it there; either location is
fine as long as it is a single source of truth. Recommended:
`shared/videoIntelligence/cost.ts` (shared, pure, no server deps).

---

## 5. File map (create / modify)

| File | Action |
|---|---|
| `apps/web/shared/videoIntelligence/projectSchemas.ts` | **create** — `VideoProjectDocumentSchema` + sub-schemas + inferred types + `normalizeDocument` |
| `apps/web/shared/videoIntelligence/cost.ts` | **create** — `estimateRenderCost` + `RenderCostEstimate` (or co-locate in compiler; keep single source) |
| `apps/web/shared/remotion/layerTemplateSchemas.ts` | **modify** — additive `audio` variant + `RemotionAudioLayer` export (do NOT touch `RemotionTemplateConfigSchema`) |
| `apps/web/server/remotion/GenericTemplateComposition.tsx` | **modify** — import `Audio`, add `AudioLayerContent`, add `case "audio"` to `switch` |
| `apps/web/server/services/videoProjectCompiler.ts` | **create** — `compileVideoProject`, `TemplateBuildContext`, `AssetResolver`, `VideoProjectCompileError`, `BrandLockViolationError`, `CompileResult`, `SegmentPlan` |
| `apps/web/shared/videoIntelligence/__tests__/projectSchemas.test.ts` | **create** (test-first) |
| `apps/web/shared/videoIntelligence/__fixtures__/*.json` | **create** — golden document fixture |
| `apps/web/shared/remotion/__tests__/layerTemplateSchemas.audio.test.ts` | **create** (test-first) |
| `apps/web/server/services/__tests__/videoProjectCompiler.test.ts` | **create** (test-first) |
| `apps/web/server/remotion/__tests__/genericTemplateComposition.audio.test.tsx` | **create** (optional, jsdom) |

---

## 6. Verification checklist (definition of done)

1. All new tests in §3 pass (write them first, watch them fail, then implement).
2. `remotionTemplateService.test.ts` and every existing `server/remotion/*` /
   layer-schema test stay green (frozen-contract regression gate). Run the full
   `pnpm test` suite.
3. `pnpm check` (`tsc --noEmit`) passes — including the mandatory `audio` `switch`
   case (the `exhaustiveCheck: never` line proves exhaustiveness at compile time).
4. `compileVideoProject` output is re-validated by `RemotionTemplateConfigSchema`
   for every emitted part (single and segmented) — asserted by the compiler test.
5. Every failure path throws a **specific** class / `VI_*` code, never a blanket
   error.
6. Exports in §2 exist with the exact names later sections import.

## 7. Out of scope for this section (owned elsewhere)

- The 10 Motion Template builders + `MOTION_TEMPLATE_REGISTRY` +
  `selectTemplatesFor` — **section 02** (this section only defines and exports
  `TemplateBuildContext` / `AssetResolver` and calls `template.build`).
- `remotionRenderVideoWorkerInputSchema`, `SegmentPlanSchema` in
  `shared/workerRuntime.ts`, golden worker-payload fixtures — **section 03**
  (coordinate the `SegmentPlan` field names with them).
- The queue function, Lane-A worker dispatch, and the `ass_burn` / `loudnorm` /
  `segment_concat` post-passes that consume `captions.burnIn` and `SegmentPlan` —
  **section 04**.
- `brand_kits` / `video_projects` DB tables and the persisted `BrandKit` row —
  **section 05** (this section uses only a minimal structural `BrandKit` type).
- Asset resolution over the DB (`resolveProjectAssets` / `buildAssetManifest`) —
  **section 07** (this section consumes an already-built `AssetResolver`).
- `validateProjectClaims` / QA loop consuming `document.claims` — **section 06**.