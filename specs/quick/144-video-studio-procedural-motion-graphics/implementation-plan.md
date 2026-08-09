# Implementation Plan: Video Studio Procedural Motion Graphics

## 1. Objective

เพิ่ม procedural motion graphics ที่สามารถเลือกและสร้างโดย skill-first workflow
ให้สัมพันธ์กับเนื้อหาที่บรรยาย โดยเริ่มจากสาม visual families: particle/atomic
field, network/data graph และ glowing 3D sphere พร้อม kinetic title, semantic beat
events, Remotion Player preview และ Worker final render ที่มี source of truth เดียวกัน

## 2. Scope boundary

### In scope

- registry metadata และ closed renderer registry สำหรับ procedural compositions
- declarative contract สำหรับ composition id, props, seed, quality และ event markers
- particle field, network graph และ glowing sphere แบบแรก
- semantic beat plan ที่ต่อกับ motion director และ existing motion candidates
- caption/TTS cue timing, continuous-vs-restart sync policy
- friendly Motion UI with thumbnail/preview and a small set of controls
- preview/render parity, schema/contract tests, render smoke and worker release gates

### Out of scope

- arbitrary user-authored React/JS/Three.js code
- full After Effects-like particle graph editor
- automatic fact verification from a narration string
- photorealistic image/video generation inside the Remotion composition
- new persistence model for a full visual node graph unless a later design proves it
  necessary

## 3. Target architecture

### 3.1 Visual Beat Plan

Add a structured intermediate plan before motion selection. In the first delivery the
plan is an in-memory skill output, and normalized events are persisted inside the
selected composition's validated `templateParams`; do not add a new database field yet.
Each beat must contain:

- `beatId`, `sceneId`, `startHint`, `endHint`
- narration/caption text reference
- `intent`: hook, explain, compare, process, trend, relationship, emphasis, CTA
- `facts` for chart/labels when the content contains explicit values
- `visualSystem` candidate family and fallback family
- `motionPreset`, `intensity`, `colorTheme`, `title`, `subtitle`
- `events`: semantic points such as `enter`, `emphasis`, `reveal`, `transition`
- confidence and a human-readable rationale

The skill may propose this plan, but the server must validate ids, bounds, lengths,
fact shape, allowed colors/fonts and maximum event counts before persisting or compiling.
If the plan is absent or invalid, fall back to the existing scene/template path rather
than failing the whole project.

### 3.2 Registry and composition contract

Extend the client-safe motion metadata so existing `layer_pack` templates coexist with
new `procedural` entries. Keep the existing
`MOTION_TEMPLATE_REGISTRY` selection and candidate application flow.

For 2D procedural systems, add one explicit `motionComposition` declarative layer
variant with:

- allowlisted `compositionId`
- bounded JSON props validated by a per-composition Zod schema
- `seed`, `quality`, `events` and brand tokens
- normal layer timing/position/opacity/z-index fields

The layer is one visual-system layer containing internal particles/nodes,
not hundreds of ordinary layers. If the contract is extended, update both duplicated
layer schemas, the worker schema, platform contract version, golden fixtures and sync
tests in the same change.

For 3D, add `glowing-sphere` and later `network-space` as closed `scene3d` ids with
strict per-scene prop validation. No registry id may validate without a registered
component in both the app and render package.

### 3.3 Rendering implementation

Create shared composition components in `packages/remotion-render` and keep the
`apps/web/server/remotion` copy synchronized through the existing parity mechanism.

1. `ParticleFieldComposition`
   - deterministic seeded particle positions
   - density, speed, spread, palette, glow and collision/reveal modes
   - SVG or canvas-like drawing inside one layer; benchmark both preview and final
   - title/subtitle support through the existing text/font allowlist

2. `NetworkGraphComposition`
   - deterministic nodes and links, bounded node/link count
   - distance-based or explicit semantic links
   - animated line reveal, node pulse, hub emphasis and camera-safe layout
   - chart/data labels only when validated facts are supplied

3. `GlowingSphereScene`
   - `@remotion/three` scene with sphere shell, points/instancing, line geometry and
     controlled camera motion
   - preview and final quality profiles with identical seed and timing
   - server render OpenGL `angle` configuration and a fallback that reports a clear
     render error instead of silently producing a blank frame

4. `KineticTitleComposition`
   - reusable title/subtitle/sequence counter primitive
   - frame-based entrance, emphasis and exit using `useCurrentFrame`, `interpolate`
     and `spring`
   - Thai font allowlist, safe-area bounds and contrast validation

## 4. Semantic motion and audio timing

Update `video-project-motion-director` skill input/output and
`videoProjectMotionDirector.ts` to allow the new registered systems. The skill may
choose only from metadata supplied by the server; it must not invent ids or raw code.

Use the existing TTS-generated `narrationAudioDurationMs` and caption cue timestamps
to derive absolute frame intervals. Extend compiler context so composition builders can
receive bounded beat/event markers. Define per-composition sync policy:

- `continuous`: particle field/network background continues through cue boundaries;
- `event`: semantic events trigger reveal/emphasis at exact frame markers;
- `restart`: only simple scene/phrase compositions restart on cue boundaries.

Modify `syncVisualMotionToCaptionCues()` so it does not blindly slice every procedural
or 3D system. Existing templates retain current behavior. New compositions explicitly
declare their policy and are tested against cue boundaries. Subtitle timing remains
derived from the same cues, so the visual and narration timelines cannot drift merely
because the visual system has internal animation.

Audio-reactive amplitude may be added after the stable cue path. It must be optional,
cached/validated for render, and never be required for a composition to render.

## 5. UI/UX contract

### Target user/job

A content creator wants a cinematic motion style that matches the narration without
writing JSON or understanding render internals, while retaining an advanced override
for exact control.

### Surface inventory

- Motion stage: visual-system preset cards with real thumbnail previews
- per-scene candidate card: rationale, duration, intensity and “ใช้แบบนี้” action
- compact controls: style, density, speed, glow, palette, title/subtitle
- optional “รายละเอียดขั้นสูง” disclosure for seed, event timing and data values
- Player preview: low-quality badge, scrub, fullscreen and clear loading/error state
- Render stage: final-quality estimate, contract/asset readiness and render action

### State matrix

- loading: skeleton cards and non-blocking Player placeholder
- ready: playable preview and selected preset state
- invalid beat/fact data: inline field error plus deterministic fallback preset
- render unsupported: actionable message with missing runtime/GL/asset reason
- no media asset: procedural composition still renders if it does not require an asset
- unsaved changes: same existing save gate before skill/run/render actions

### Responsive/accessibility

- cards remain keyboard selectable and expose labels/rationale without relying on color
- Player stays moderate-size by default and can fullscreen
- advanced controls are grouped and have Thai labels with English fallback
- all motion controls have readable value labels and reduced-motion preview option
- browser evidence must cover preset selection, preview playback, errors, fullscreen and
  narrow layout using the existing Video Studio browser verification path

### Copy contract

Use concise Thai-first labels: “อนุภาคและพลังงาน”, “เครือข่ายข้อมูล”, “ทรงกลมเรืองแสง”,
“หัวข้อแบบภาพยนตร์”, “ความหนาแน่น”, “ความเร็ว”, “ความแรงของแสง”, “ใช้แบบนี้”,
“ดูตัวอย่าง”, “สร้างวิดีโอจริง”. Explain that preview is a lightweight preview and
final render may use more particles, but timing/layout stay the same.

## 6. Compiler, worker and runtime integration

Update the compiler to emit the new `motionComposition` layer or vetted scene layer, resolve
only allowlisted props, preserve asset manifests and keep layers within budget.

Update worker input validation and renderer package together. Confirm that the same
composition source is used by Player, server route and worker sidecar. If the package
or runtime contract changes:

1. bump `platformContractVersion` and renderer policy as appropriate;
2. update schema-sync tests and valid/invalid fixtures;
3. update package/runtime manifest and worker compatibility gate;
4. build the next Worker App/runtime release only after the render smoke passes;
5. verify a real worker heartbeat, job claim, render retry/complete path, not only a
   prepared artifact endpoint.

For Three.js server rendering, configure and test the required Chromium GL mode. Keep
the composition disabled or fall back to a 2D registered preset when the runtime lacks
the required capability; never silently render a black video.

## 7. Security and abuse controls

- closed composition/scene registries
- strict per-composition schemas with caps on particles, nodes, links, text, events and
  duration
- deterministic seed normalization to prevent pathological work amplification
- no arbitrary markup beyond the existing sanitized SVG boundary
- no network fetches or provider calls from renderer components
- asset URLs must still pass existing resolver/checksum/manifest gates
- brand kit locks and safe-area/contrast checks apply to generated titles and overlays
- telemetry records composition id, quality, counts, render duration and failure reason,
  excluding raw narration where not necessary

## 8. Delivery phases

### Phase 0 — contract spike and benchmark

Confirm the declarative layer shape, measure SVG/canvas candidate performance, verify
Three.js server rendering in the current runtime, and freeze acceptance fixtures.

### Phase 1 — 2D systems

Implement metadata, schemas, registry, particle field, network graph, kinetic title and
Motion UI cards. Wire to existing motion director and compiler with continuous/event
sync.

### Phase 2 — semantic beat plan

Add skill output, server validation, event projection and fallback behavior. Persist or
attach the plan only where the current project revision model can preserve it without
breaking existing documents.

### Phase 3 — 3D glowing sphere

Add the vetted Three scene, GL configuration, quality profiles, render smoke and worker
compatibility checks.

### Phase 4 — parity and release

Run focused tests, Player/render frame parity, browser verification, final MP4 smoke,
worker claim/retry proof and only then prepare the next runtime/Worker release if the
contract changed.

## 9. Acceptance criteria

- The same seed, props, fps and cue markers produce stable preview/render geometry for
  all shared elements and identical event timing; final quality may add more internal
  particles but must not move the shared layout.
- A narration segment classified as comparison/process/relationship can select a
  corresponding registered visual system without arbitrary template ids.
- Particle and graph compositions use one declarative visual-system layer and do not
  exceed the ordinary layer budget because of internal elements.
- Subtitle start/end timestamps remain aligned with generated narration after motion
  selection and final compile.
- User can select a preset, preview it, adjust basic controls, save, and render without
  editing JSON.
- Invalid props, unknown ids, oversized counts and missing runtime capabilities fail
  with actionable errors and do not enqueue an unsafe render.
- `@remotion/three` scene renders in the Worker and does not produce a blank preview or
  black final output.
- Existing layer/template projects and existing motion candidates continue to parse,
  preview and render unchanged.

## 10. Likely files/modules

### Shared/contract

- `apps/web/shared/videoIntelligence/motionTemplates.ts`
- `apps/web/shared/videoIntelligence/projectSchemas.ts`
- `apps/web/shared/remotion/layerTemplateSchemas.ts`
- `apps/web/shared/remotion/sceneRegistryIds.ts`
- `packages/remotion-render/src/layerTemplateSchemas.ts`
- `packages/remotion-render/src/remotionRenderVideoSchema.ts`
- worker fixtures and contract/version files under `apps/web/shared` and
  `packages/remotion-render`

### Planner/compiler/server

- `apps/web/server/services/videoProjectMotionDirector.ts`
- `apps/web/server/services/videoProjectCompiler.ts`
- `apps/web/server/routers/videoProjects.ts` (reuse `runMotionStage`,
  `selectMotionCandidate` and `listMotionTemplates`; no second candidate API)
- `apps/web/skills/video-project-motion-director/skill.md`
- `apps/web/skills/video-project-scene-plan/skill.md`
- `apps/web/server/remotion/templates/index.ts`
- `apps/web/server/remotion/scenes/index.ts`
- `packages/remotion-render/src/scenes/index.ts`
- new composition/scene modules and their tests

### Client

- `apps/web/client/src/components/videoStudio/MotionPanel.tsx`
- `apps/web/client/src/components/videoStudio/RemotionProjectPreview.tsx`
- `apps/web/client/src/components/videoStudio/TimelineStagePanel.tsx`
- copy/localization and focused component tests

Do not overwrite unrelated dirty files. Before implementation, compare exact diffs and
coordinate any overlapping edits in the existing Video Studio files.
