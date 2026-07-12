I have enough context. Here is the section content.

# section-02-motion-template-registry

> Phase 1 / MVP — Feature 133 Content & Video Intelligence Platform.
> Source of truth: `claude-plan.md` §4 (+ §4.3 cost model), `claude-plan-tdd.md`
> Section 2, `claude-spec.md` §2.6/§7.2, `claude-research.md` A1/A4/B2/B5.
> Work directory root for all code: `/home/dev/projects/SmartSpecPro/apps/web`.

## 1. Goal & scope

Build the **Motion Template Registry**: a set of ~10 reusable, purely-2D
`layer_pack` motion templates plus the metadata, registry guard, cost model, and
selection helper that let the compiler (section-01) and the studios (section-08)
discover and expand them.

A "motion template" is a **pure builder** `(params, ctx) => RemotionLayer[]` that
composes only the **existing** 2D layer variants (`image` / `video` / `text` /
`svg` / `motionGraphic` / `audio`). It introduces **no new rendering
primitives**, **no `scene3d`** (deferred to Phase 5), and **no I/O** — every
asset is already resolved into `ctx.assetResolver` by the caller.

In scope for this section (all under `apps/web`):

1. `shared/videoIntelligence/motionTemplates.ts` — registry **metadata**:
   `MotionTemplateMeta`, `MotionTemplate` interface, `MOTION_TEMPLATE_IDS`,
   `MotionTemplateId`, and the pure `selectTemplatesFor(...)` filter helper.
2. `shared/videoIntelligence/cost.ts` — the pure render-cost model
   (`RenderCostEstimate` type + `estimateRenderCost(config)`), per plan §4.3 and
   TDD Section 2 (`cost.test.ts`).
3. `server/remotion/templates/<id>.ts` — one file per template, each exporting a
   pure `build(params, ctx): RemotionLayer[]` builder + its own `.strict()`
   `paramsSchema` and declared `brandTokens`.
4. `server/remotion/templates/index.ts` — `MOTION_TEMPLATE_REGISTRY:
   Record<MotionTemplateId, MotionTemplate>` + a load-time
   `assertRegistryMatchesIds()` guard (mirrors the scene-registry pattern).

Explicitly **out of scope** (do NOT build here):
- The LLM "Motion Director" skill / template-id routing in TS (Phase 2+; the
  repo's no-hardcode-skills rule means Phase 1 only exposes metadata filtering).
- Any `scene3d` template or new layer type.
- The compiler itself (section-01) — this section only supplies builders +
  metadata it consumes.

## 2. Dependencies & interfaces from other sections

This section depends on **section-01** (schemas + compiler) and is otherwise
parallelizable. It **blocks** sections 06, 07, 08.

Types/values imported from **existing frozen code** (do not redeclare):
- `RemotionLayer`, `RemotionTemplateConfig`, and the per-variant layer types
  (`RemotionImageLayer`, `RemotionTextLayer`, `RemotionSvgLayer`,
  `RemotionMotionGraphicLayer`, and the new `RemotionAudioLayer` added in
  section-01) from `shared/remotion/layerTemplateSchemas.ts`
  (research A1). Base layer fields on every variant: `id` (1..128),
  `startFrame` (int≥0), `durationFrames` (int≥1), `x/y/width/height`
  (0..100 percent), `rotationDeg` (=0), `opacity` (0..1 =1), `zIndex` (int =0).
- `MAX_LAYERS = 40` is the frozen `RemotionTemplateConfigSchema` ceiling — a
  single template's builder must never emit more than this; the compiler handles
  cross-scene splitting.

Types imported from **section-01** (the compiler owns and exports these — treat
their shapes below as the contract; if section-01 lands first, import verbatim,
otherwise coordinate on these exact field names):

```ts
// authored in section-01: server/services/videoProjectCompiler.ts
type TemplateBuildContext = {
  format: { width: number; height: number; fps: number; durationMs: number };
  brandKit: BrandKit | null;               // resolved brand tokens (colors/fonts/captionPreset)
  assetResolver: AssetResolver;            // wraps a ResolvedAssetMap (section-07 §9.1a)
};
type AssetResolver = {
  url(assetId: number | string): string;   // storage-proxy / staged-local URL, never a raw external URL
  sha256(assetId: number | string): string | undefined;
};
type BrandKit = {                          // section-05 brand_kits row, resolved
  colors: { primary: string; secondary?: string; accent?: string };
  fonts: { heading?: string; body?: string };
  captionPresetId?: string;
  locks?: { colors?: boolean; fonts?: boolean };
};
```

> **Coordination note:** `RenderCostEstimate` + `estimateRenderCost` are authored
> **here** (section-02, `shared/videoIntelligence/cost.ts`) because TDD Section 2
> owns `cost.test.ts` and the function depends only on the *already-frozen*
> `RemotionTemplateConfig` (no dependency on section-01), so there is no circular
> import. Section-01's compiler **imports** `estimateRenderCost` from this file to
> populate `CompileResult.cost`. If section-01 has stubbed this file, extend it
> in-place rather than recreating it.

## 3. Tests first (author these before any implementation)

Follow the repo TDD protocol and `claude-research.md` Part B. Tier legend:
**PURE** = no mocks, `Schema.parse(...)` builders, negatives via
`expect(() => schema.parse(bad)).toThrow()` or `.safeParse().success`. All test
files use `import { describe, expect, it } from "vitest"`. Node env applies
(these live under `server/**` and `shared/**`).

Single-test invocation (from `apps/web`):
`JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"`.

### 3.1 Registry guard — `server/remotion/templates/__tests__/registry.test.ts` (PURE)

```
it("registry keys exactly match MOTION_TEMPLATE_IDS")   // assertRegistryMatchesIds
it("every template declares a strict paramsSchema and brandTokens")
it("every template's meta.kind is 'layer_pack'")        // no scene3d in Phase 1
```
- The first case asserts `Object.keys(MOTION_TEMPLATE_REGISTRY).sort()` deep-
  equals `[...MOTION_TEMPLATE_IDS].sort()` — the same invariant the guard
  enforces at module load.
- The strict-schema check probes each `paramsSchema` with an object containing an
  unknown key and asserts `.safeParse(...).success === false` (proves `.strict()`),
  and asserts `Array.isArray(meta.brandTokens)`.

### 3.2 Per-template — `server/remotion/templates/__tests__/<id>.test.ts` (PURE, one file each)

Ten files, one per template id (`product_hero.test.ts`, …). Each:

```
it("builds only whitelisted layer types")     // ∈ image|video|text|svg|motionGraphic|audio; never scene3d
it("respects maxItems / duration bounds")      // more items than maxItems → clamps or throws (pick one, be consistent)
it("consumes brand tokens from ctx.brandKit")  // e.g. primaryColor appears on a produced text/motionGraphic layer
it("rejects invalid params via paramsSchema")  // bad params → build throws (paramsSchema.parse inside build)
it("emits <= 40 layers")                        // single-template ceiling lock
it("every emitted layer parses under RemotionLayerSchema")  // round-trip against the frozen schema
```
- Use a local `buildCtx(overrides?)` helper returning a `TemplateBuildContext`
  with a stub `assetResolver` (`url: id => \`/proxy/asset/${id}\``,
  `sha256: () => undefined`) and a fixed `brandKit`.
- The "consumes brand tokens" case must show a **deterministic** mapping: when
  `ctx.brandKit.colors.primary === "#123456"`, a produced layer carries that
  exact value (this is the compile-time brand-lock evidence section-01 checks).
- The whitelist assertion is the security-relevant test: assert
  `layers.every(l => ["image","video","text","svg","motionGraphic","audio"].includes(l.type))`.

### 3.3 Cost model — `shared/videoIntelligence/__tests__/cost.test.ts` (PURE)

```
it("scores cost = Σ layers × frames × class-weight")
it("flags recommendPreRender only above budget")
it("clamps/handles empty layer sets")           // 0 layers → score 0, cls "low", recommendPreRender false
```
- Assert exact numbers: `expect(estimateRenderCost(cfg)).toEqual({ score, cls, recommendPreRender })`.
- Include a boundary case at the class threshold to lock the `low|medium|high`
  cut-points.

### 3.4 Selection helper — `shared/videoIntelligence/__tests__/motionTemplates.select.test.ts` (PURE)

```
it("filters by category")
it("filters by aspect ratio")
it("filters by duration window (min/maxDurationMs)")
it("returns [] on no match")
it("returns metadata objects (not builders)")   // shape is MotionTemplateMeta[]
```

## 4. Implementation guidance

### 4.1 `shared/videoIntelligence/motionTemplates.ts` — metadata + selection

Metadata style mirrors `shared/hyperframes/templates.ts` (const arrays of plain
descriptors, no React/Node deps — this file may be pulled into client bundles, so
`shared/` **must not** import from `server/`). Keep `paramsSchema` as a
`z.ZodTypeAny` reference; the concrete schemas live beside their builders in
`server/remotion/templates/*` and are re-exported here, OR (preferred, to keep
`shared/` server-free) the metadata declares only ids/categories/bounds and the
**paramsSchema lives with the builder**. Choose the latter: `MotionTemplateMeta`
carries `paramsSchemaId?`/`brandTokens` as data, and the full `MotionTemplate`
(meta + `paramsSchema` + `build`) is assembled in `server/remotion/templates/index.ts`.

```ts
export const MOTION_TEMPLATE_IDS = [
  "product_hero",
  "glass_feature_cards",
  "how_to_steps",
  "comparison_stage",
  "review_highlight",
  "kinetic_typography",
  "floating_gallery",
  "luxury_end_card",
  "data_flow",
  "animated_chart_basic",
] as const;
export type MotionTemplateId = (typeof MOTION_TEMPLATE_IDS)[number];

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type RenderCostClass = "low" | "medium" | "high";
export type BrandToken = "primaryColor" | "accentColor" | "font" | "captionStyle";

export interface MotionTemplateMeta {
  id: MotionTemplateId;
  kind: "layer_pack";                 // no scene3d in Phase 1
  categories: string[];               // e.g. ["product", "hero"]
  minDurationMs: number;
  maxDurationMs: number;
  maxItems: number;
  renderCost: RenderCostClass;
  supportedAspectRatios: AspectRatio[];
  brandTokens: BrandToken[];          // which brand tokens the builder consumes
}

export const MOTION_TEMPLATE_META: Record<MotionTemplateId, MotionTemplateMeta> = { /* ... */ };

export function selectTemplatesFor(filter: {
  categories?: string[];
  durationMs?: number;
  aspectRatio?: AspectRatio;
}): MotionTemplateMeta[] { /* pure filter over MOTION_TEMPLATE_META values */ }
```

`selectTemplatesFor` rules (all pure, no throwing):
- `categories` — keep a template if **any** requested category ∈ `meta.categories`
  (omitted/empty ⇒ no category filter).
- `aspectRatio` — keep if `meta.supportedAspectRatios.includes(aspectRatio)`.
- `durationMs` — keep if `min ≤ durationMs ≤ max`.
- No match ⇒ `[]`. Return the `MotionTemplateMeta` objects (not builders).

### 4.2 `shared/videoIntelligence/cost.ts` — render cost model (plan §4.3)

Pure, deterministic, input→output. Depends only on `RemotionTemplateConfig`.

```ts
export interface RenderCostEstimate {
  score: number;                          // Σ layers × durationInFrames × class-weight
  cls: "low" | "medium" | "high";
  recommendPreRender: boolean;            // Phase-1 informational (no scene3d to pre-render yet)
}
export function estimateRenderCost(config: RemotionTemplateConfig): RenderCostEstimate;
```

- `score = Σ over layers of (1 × config.durationInFrames × weight(layerType))`.
  Give each 2D type a small fixed weight (e.g. `text/motionGraphic` cheap,
  `image` medium, `video/svg` heavier) — document the exact weight table in the
  file; the test asserts the arithmetic, so it must be a stable constant.
- `cls` from two documented score thresholds (`low`/`medium`/`high` cut-points).
- `recommendPreRender` = `score > BUDGET` (informational in Phase 1; a
  constant). Empty `layers` ⇒ `{ score: 0, cls: "low", recommendPreRender: false }`.

### 4.3 `server/remotion/templates/<id>.ts` — the 10 builders

Each file exports:
```ts
export const productHeroParamsSchema = z.object({ /* ... */ }).strict();
export type ProductHeroParams = z.infer<typeof productHeroParamsSchema>;
export const productHeroBrandTokens = ["primaryColor", "font"] as const;

export function buildProductHero(
  params: unknown,                        // parse inside → paramsSchema.parse(params)
  ctx: TemplateBuildContext,
): RemotionLayer[] { /* compose only 2D layer variants */ }
```

Common builder rules (apply to all ten):
- **Parse params inside `build`** via the `.strict()` `paramsSchema` — an invalid
  param object throws (a `ZodError`; the compiler maps this to
  `VI_TEMPLATE_UNKNOWN`/document-invalid at the call site). This satisfies the
  "rejects invalid params" test.
- **Resolve every asset through `ctx.assetResolver.url(assetId)`** — never accept
  or emit a raw external URL (spec §17.3). Asset params are numeric
  `mediaAssets.id`/`libraryItems.id` (or an already-proxied URL string).
- **Brand tokens are read from `ctx.brandKit`**, deterministically: if a token in
  the builder's `brandTokens` list is present in `ctx.brandKit`, the produced
  layers must use it (colors → `color`, fonts → `fontFamily`, captionStyle →
  caption text-layer styling). This is what makes the compiler's brand-lock check
  a **fact, not a judgment**.
- **`maxItems` / duration bounds** — clamp gallery/card/step counts to
  `meta.maxItems`; compute per-item `startFrame`/`durationFrames` from
  `ctx.format.fps` and the template's `min/maxDurationMs`. Keep total emitted
  layers `≤ 40`.
- **Whitelist only:** `image | video | text | svg | motionGraphic | audio`. Never
  emit `scene3d`. Every emitted object must satisfy `RemotionLayerSchema` (round-
  trip-tested).
- Use `zIndex` to order stacked layers; base fields (`x/y/width/height` in
  percent, `opacity`, `rotationDeg`) drive layout.

The ten templates and their intent (all `kind: "layer_pack"`, 2D only):

| id | intent | typical brandTokens | notes |
|---|---|---|---|
| `product_hero` | single hero product shot + headline | primaryColor, font | 1 image/video + 1–2 text |
| `glass_feature_cards` | 2–4 frosted-glass feature cards | accentColor, font | `svg`/`motionGraphic` card frames + text; clamp to `maxItems` |
| `how_to_steps` | numbered step sequence | primaryColor, captionStyle | one text/graphic group per step, staggered `startFrame` |
| `comparison_stage` | A-vs-B split comparison | accentColor, font | two image columns + labels |
| `review_highlight` | star rating + quote callout | accentColor, captionStyle | `motionGraphic` stars + quote text |
| `kinetic_typography` | animated headline words | primaryColor, font | text layers only, staggered timing |
| `floating_gallery` | drifting multi-image grid | font | N images (clamp to `maxItems`), motion via layout offsets |
| `luxury_end_card` | brand end-card / CTA | primaryColor, accentColor, font | logo image (brandKit.logo asset) + CTA text |
| `data_flow` | node/arrow flow diagram | accentColor | `svg`/`motionGraphic` nodes + connectors |
| `animated_chart_basic` | simple bar/line chart | primaryColor, accentColor | `motionGraphic`/`svg` bars + value text |

Keep each builder minimal and deterministic — these are stubs proving the
pipeline, not a design system. Do not over-invest in animation nuance; correctness
of layer types, bounds, brand-token wiring, and schema-validity is what Phase 1
requires.

### 4.4 `server/remotion/templates/index.ts` — registry + guard

Assemble the full `MotionTemplate` (meta + `paramsSchema` + `build`) here, keeping
Zod/builder code out of the client-safe `shared/` metadata file. Mirror the
scene-registry guard in `server/remotion/scenes/index.ts` exactly (module-load
`assertRegistryMatchesIds()` that throws on drift).

```ts
export interface MotionTemplate {
  meta: MotionTemplateMeta;
  paramsSchema: z.ZodTypeAny;
  build: (params: unknown, ctx: TemplateBuildContext) => RemotionLayer[];
}

export const MOTION_TEMPLATE_REGISTRY: Record<MotionTemplateId, MotionTemplate> = {
  product_hero: { meta: MOTION_TEMPLATE_META.product_hero, paramsSchema: productHeroParamsSchema, build: buildProductHero },
  // ... all 10
};

function assertRegistryMatchesIds(): void { /* keys.sort() === [...MOTION_TEMPLATE_IDS].sort(), else throw */ }
assertRegistryMatchesIds();               // runs at module load — the drift guard
```

- The guard throws a descriptive `Error` (name the two lists, like the scene-
  registry version) so a missing/extra builder is caught at load time, never
  silently at compile time in production.
- Re-export `MOTION_TEMPLATE_IDS` for convenience (the scenes index does the same
  with `REMOTION_SCENE_IDS`).

## 5. Consumption contract (how section-01 & later sections use this)

- **Compiler (section-01)** expands a `visual.kind === "template"` scene by:
  `MOTION_TEMPLATE_REGISTRY[templateId].paramsSchema.parse(params)` →
  `MOTION_TEMPLATE_REGISTRY[templateId].build(params, ctx)` → `RemotionLayer[]`,
  then offsets scene-relative `startFrame` to absolute frames and merges. An
  unknown `templateId` (not in the registry) must throw
  `VideoProjectCompileError`/`VI_TEMPLATE_UNKNOWN` at the compiler boundary.
- **Compiler cost** uses `estimateRenderCost(config)` from `cost.ts`.
- **Studios UI (section-08)** calls `selectTemplatesFor(...)` for the manual
  template picker and reads `MOTION_TEMPLATE_META` for labels/bounds. No template-
  id routing logic is hardcoded outside metadata filtering.

## 6. Verification checklist

- [ ] All tests in §3 authored **first** and initially failing.
- [ ] `MOTION_TEMPLATE_IDS` has exactly the 10 ids listed; registry keys match
      (guard passes at load).
- [ ] Every builder: parses params via a `.strict()` schema, emits only
      whitelisted 2D layer types, resolves assets via `ctx.assetResolver`, wires
      declared brand tokens deterministically, and emits `≤ 40` layers that each
      round-trip through `RemotionLayerSchema`.
- [ ] `estimateRenderCost` is pure and matches the asserted arithmetic;
      empty-layer edge case handled.
- [ ] `selectTemplatesFor` filters by category/duration/aspect and returns `[]`
      on no match.
- [ ] `shared/videoIntelligence/motionTemplates.ts` and `cost.ts` import nothing
      from `server/**` (client-bundle safety).
- [ ] `pnpm check` (tsc `--noEmit`) clean; the **full existing suite** stays green
      (frozen `RemotionTemplateConfig` / layer-schema tests must not regress).

---

I wrote the section content for `section-02-motion-template-registry`. The SubagentStop hook will persist it to `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`.

Key decisions worth flagging to the parent agent:

- **Cost model ownership**: I assigned `shared/videoIntelligence/cost.ts` (`RenderCostEstimate` + `estimateRenderCost`) to this section because `claude-plan-tdd.md` Section 2 owns `cost.test.ts` and `estimateRenderCost` depends only on the already-frozen `RemotionTemplateConfig` (no circular import with section-01). Section-01's compiler imports it. The `index.md` summary lists "cost model" under section-01's bullet too, so I added an explicit coordination note to prevent duplicate authoring. The parent may want to confirm section-01's prompt does NOT also create `cost.ts`.
- **Shared-vs-server split**: To keep `shared/videoIntelligence/motionTemplates.ts` client-bundle-safe (no `server/**` imports, matching the `sceneRegistryIds.ts` circular-import precedent), I placed the Zod `paramsSchema` + builders in `server/remotion/templates/*` and assembled the full `MotionTemplate` in `server/remotion/templates/index.ts`, with the `shared/` file holding only plain metadata + `selectTemplatesFor`.
- **Cross-section type contract**: `TemplateBuildContext` / `AssetResolver` / `BrandKit` are owned by section-01 (`server/services/videoProjectCompiler.ts`). I restated their exact shapes as the contract so section-02 is implementable standalone if it lands first.