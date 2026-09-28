# Feature 143: Video Studio — Layer & Timeline Editor

**Status:** IMPLEMENTED (P0–P3; P4 deferred to a separate spec)
**Version:** 1.2.0
**Implemented:** 2026-08-03 — see §11 for the as-built record and deviations
**Created:** 2026-08-03
**Last Updated:** 2026-08-03
**Priority:** P1
**Owner:** Media Studio / Render Platform / Frontend Platform
**Depends-on:** 133-content-video-intelligence-platform (Neutral Project Schema, compiler, motion-template registry, worker contract, DB tables), 142-video-intelligence-structured-planning-qa-engine (planning/QA engine, repair stages)
**Related (NOT modified by this spec):** the standalone Video Editor at `apps/web/client/src/components/videoeditor/` and the canvas editor at `apps/web/client/src/presentation-canvas/` — harvested for logic, never extended (§4.2)
**Technology Stack:** Stack A — Node.js 20 / TypeScript 5 (strict) / tRPC 11 / Drizzle ORM / PostgreSQL 15 / Redis 7 + BullMQ / React 19 / Astryx / Remotion

---

## 0. Changelog

### [1.1.0] - 2026-08-03

Corrections forced by a technical + product review pass. **Four were factual
errors in v1.0.0 that would have shipped as bugs or wasted builds:**

1. 🔴 **The asset checksum gate (§4.7).** v1.0.0 claimed that writing an
   allowlisted storage URL into a layer's `src` meant "no new resolution path is
   needed". The opposite is true. `collectDocumentAssetIds`
   (`videoProjectAssetResolver.ts:81-122`) walks `scene.narrationAudioAssetId`,
   `scene.visual.params` and `document.audioTracks` — **never `scene.layers[]`**.
   So a hand-authored layer gets `sha256: undefined`, `queueRender` substitutes
   `fallbackAssetSourceHash(url)` = the hash of the *URL string*
   (`videoProjects.ts:3040`), and the worker hard-throws
   `Asset checksum mismatch` after fetching the real bytes
   (`renderVideoJob.ts:191-193`). The resolver's own comment already says a URL
   hash "would make every such render fail". **Every AC involving a placed asset
   was unachievable as written.** Now a named P0 item (§4.7, RK7).
2. 🔴 **The QA repair applier silently mutilates hand-authored layers (§4.9).**
   `applyLayoutHandler` clamps flagged layers into the safe rect
   (`videoProjectRepairApplier.ts:524-561`), and a full-bleed background
   (`x0 y0 w100 h100`) is *always* a safe-area violation — for `tiktok_9_16` the
   rect is x∈[5,85], y∈[10,80] (`videoProjectQualityMetrics.ts:178-183`). One QA
   round would turn the user's background into an inset box.
   `dropDecorativeLayersOverBudget` (`:417-460`) can delete a user's
   `motionGraphic` outright. Latent today only because `scene.layers` is always
   empty. New §4.9 defines the whole AI-interaction contract.
3. 🔴 **NG3 was stale and gave away the best asset in the repo (§4.4).**
   `RemotionProjectPreview.tsx` already mounts `@remotion/player`'s `<Player>`
   over **the identical `GenericTemplateComposition` the server renders with**,
   live in `RenderPanel.tsx:133`. Building a "canvas approximation" would ship a
   *worse* preview than the one that exists and would reintroduce RK3 by hand.
   The editor surface is now a **controlled `<Player>` with a transform overlay**.
4. **`@remotion/transitions` is installed and already used** — `package.json:118`
   and `MarketplaceAutoReviewComposition.tsx:21-22`. v1.0.0's "no usage anywhere"
   was wrong; P4 has a working in-repo reference, not a greenfield integration.

Also corrected: `presentation-canvas` lives at `client/src/presentation-canvas/`,
not under `components/`; the asset-id fork is **client-side only** (the server
resolver already handles both id spaces); caption `zIndex: 900` is at
`videoProjectCompiler.ts:303`.

Added: §4.9 (AI-vs-manual contract), §4.10 (fonts), §4.11 (format-change
safety), §4.12 (ids), §4.13 (states), §4.14 (responsive), §4.15 (Thai
terminology), §4.16 (performance), undo/redo as a goal, AC8-AC17, RK6-RK12,
and three explicitly-recorded product decisions (§2.1).

### [1.0.0] - 2026-08-03

Initial spec.

---

## 1. Problem Statement

Video Studio produces videos by planning *scenes* and letting a *template* decide
what is drawn inside each scene. The user can pick a template and edit its raw
JSON params, but cannot place anything themselves. There is no way to:

- lay a video or image across the full frame as a background, and continue it
  with a second clip so the background runs longer than one scene;
- drop an overlay (a cut of another video, an image, a text line, a logo, a
  watermark) at an arbitrary second, for an arbitrary duration, at an arbitrary
  position, independently of the scene it happens to sit above;
- see where the subtitles sit relative to everything else;
- put background music under the whole video and see it as a track.

The capability exists in the data model and in the renderer. It is unreachable.

**Evidence that the freeform path is real but unexercised:**
`videoProjectCompiler.ts:679` concatenates `[...scene.layers, ...templateLayers,
...captionLayers]` with no special-casing, and
`GenericTemplateComposition.tsx:291-322` renders all 7 layer types. But a repo-wide
grep of `client/src/components/videoStudio/*` finds `scene.layers` only ever
constructed as `[]` (`createDefaultDocument.ts:63-64`, `ScenesPanel.tsx:168-169`,
`MotionPanel.tsx:274`). **Nothing in `server/` ever writes a `scene.layers[]`
entry either.**

**The corollary that shapes this entire spec:** because no layer has ever
existed, every downstream consumer of `scene.layers[]` is untested against real
data. §4.9 exists because three of them are actively wrong.

---

## 2. Goals / Non-Goals

### Goals

- G1 — A timeline UI where the user sees, in one view, the scene strip, a
  full-bleed background track, N overlay tracks, a subtitle track, and audio
  tracks, all on a shared time axis.
- G2 — Direct manipulation: drag a clip along time, trim its edges, drag it
  between tracks, and move/resize it on the live preview.
- G3 — A background track that accepts multiple concatenated video/image clips
  and is *not* bounded by scene boundaries.
- G4 — Overlays with independent `startMs`/`durationMs`, free position, and the
  effects the renderer supports.
- G5 — Every edit stays inside what the Remotion worker contract accepts, and
  the user is warned *before* they exceed a hard limit — never at render time.
- G6 — One unambiguous route to a `remotion_render_video` job in the existing
  `/render-jobs` system.
- **G7 — Undoable editing.** Every edit is undoable and redoable in-session, with
  a drag gesture coalescing into a single step. A direct-manipulation surface
  without Ctrl+Z is not shippable for this audience.
- **G8 — Hand-authored work survives every AI stage**, in content *and* in
  absolute time (§4.9).
- **G9 — Most users never drag anything.** The common cases (background clip,
  text, logo/watermark, music) are reachable as one-click actions that produce a
  correctly positioned, timed and banded layer (§4.13).

### Non-Goals

- NG1 — Not a general NLE. No multi-camera, no speed ramps, no chroma key, no
  colour grading. Scope is bounded by what `GenericTemplateComposition.tsx` can
  actually draw (§3.4).
- NG2 — No bridge to the standalone Video Editor (`video_editor_projects`). The
  document models are structurally incompatible (§4.2).
- NG3 — *(removed in 1.1.0 — see §4.4; a real Remotion `<Player>` preview already
  exists and is the editing surface.)*
- NG4 — Scene transitions are out of scope here (P4). `@remotion/transitions` is
  already a dependency and already used by another composition, so this is a
  scoping choice, not a technical limit.

### 2.1 Product decisions recorded

Three questions the review surfaced as needing a call. Decided here so
implementation is not blocked; each is reversible before P2.

- **D1 — Placement: an 8th, explicitly optional stage** in the rail, between
  ซับไทเทิล and ตรวจสอบคุณภาพ. Rationale: the subtitle track is a projection of
  caption cues, so the timeline is only truthful once captions exist; QA and
  Render must see its output. It does **not** replace the Motion stage (which
  remains the template picker). Its stage-rail dot must never render the `empty`
  state — the AI-first path legitimately ends with zero hand-authored layers, and
  an "empty" dot would read as "you forgot something". A second entry point sits
  on the Render stage preview ("ปรับตำแหน่งเอง"), which is where a user actually
  notices the logo is misplaced.
- **D2 — `fill_empty` planning treats a scene with hand-authored layers as
  still-plannable.** Today `partitionScenes`
  (`videoProjectScenePlanner.ts:514-531`) requires `visual.kind === "layers" &&
  scene.layers.length === 0`, so **the moment a user drops one layer on a scene,
  auto-draft silently skips it forever**. "Empty" must mean *no narration and no
  template*, not *no layers*. This is a server behaviour change and is P0.
- **D3 — The form-based layer list is a first-class permanent surface**, not a
  narrow-screen fallback. It is simultaneously the keyboard/screen-reader path,
  the narrow-screen path, and — for a non-editor — frequently the *easier* path
  ("3.0 วินาที" typed beats a pixel drag). It ships in P1, before any drag work.

---

## 3. Systems of Record — what the pipeline can express TODAY

Verified against source on 2026-08-03 and re-verified during the 1.1.0 review. A
design that contradicts this section will fail at compile or at render.

### 3.1 The layer union is frozen and duplicated

`apps/web/shared/remotion/layerTemplateSchemas.ts:141-149` defines
`RemotionLayerSchema`. `packages/remotion-render/src/layerTemplateSchemas.ts`
holds an identical copy (the code is identical; only doc comments differ — and
the package copy's header already carries a *drifted* claim that apps/web
re-exports from it, which it does not). Both are `.strict()`, and the worker
input schema (`packages/remotion-render/src/remotionRenderVideoSchema.ts:177-228`)
embeds the template config verbatim and is `.strict()` at every level.

**Consequence: adding one field to a layer is a cross-package change plus a
`platformContractVersion` bump plus golden-fixture updates
(`shared/__fixtures__/remotionRenderVideoWorkerInput-*.json`).** This spec adds
as few fields as it can, and every one is `.optional()`.

Base fields (`layerTemplateSchemas.ts:50-61`): `id`, `startFrame`,
`durationFrames`, `x`, `y`, `width`, `height` (**percent of canvas, 0-100** — no
pixel coordinates exist), `rotationDeg`, `opacity`, `zIndex`.

| type | extra fields | line |
|---|---|---|
| `image` | `src` (URL), `fit: cover\|contain\|fill` | 63-67 |
| `video` | `src`, `trimStartSec`, `volume`, `muted` | 69-75 |
| `text` | `content`, `fontFamily`, `fontSizePx`, `color`, `textAlign`, `fontWeight` | 77-85 |
| `svg` | `markup` (script-sanitised), `animation` | 87-100 |
| `motionGraphic` | `shape`, `color`, `loopAnimation` | 102-109 |
| `scene3d` | `sceneId` (closed registry enum), `props` | 111-120 |
| `audio` | `src`, `trimStartSec`, `volume`, `loop`, `fadeInMs`, `fadeOutMs` | 131-139 |

### 3.2 Timing — layers are NOT bounded by their scene

Authoring is scene-relative; the compiler adds `msToFrames(scene.startMs)`
(`offsetLayerToAbsoluteFrame`, `videoProjectCompiler.ts:317-323`). **Nothing
clamps a layer to its scene's span.** A layer authored on scene 0 with a long
`durationFrames` renders across every later scene; Remotion truncates only at
composition end (`GenericTemplateComposition.tsx:331-336`).

Scenes themselves are strictly sequential: `assertSceneTimelineValid`
(`videoProjectScenePlanner.ts:628-655`) rejects inversion, overlap and overrun on
every `saveDocument` (`videoProjects.ts:2388-2395`). Gaps are legal.

**This is the most important fact in the spec: the scene strip is a sequential
story spine, and the layer tracks above it are free.** G3 and G4 need no change
to the timing model.

**But the relationship is fragile in one direction** — see §4.9.2: because
`startFrame` is scene-*relative* and the compiler adds the scene's `startMs`,
anything that moves a scene moves every layer riding on it.

### 3.3 Ordering, audio, captions

- **z-order** is `zIndex` only (`layerTemplateSchemas.ts:60`), sorted at compile
  (`videoProjectCompiler.ts:557`) and again at render
  (`GenericTemplateComposition.tsx:326`). Ties resolve by insertion order.
  Compiler-generated caption layers hardcode `zIndex: 900` (`:303`).
- **Audio** is document-level: `AudioTrackSchema` (`projectSchemas.ts:192-227`),
  a **discriminated union of three separately-`.strict()` objects**
  (`narration` / `music` / `sfx`). Music gets `loop: true` and defaults to
  −14 dB; "ducking" is a **flat −6 dB attenuation**, not sidechain
  (`videoProjectCompiler.ts:349-351`). Narration/music assets default to the
  whole document when bounds are omitted, while explicit `startMs`/`endMs` and
  `fadeInMs`/`fadeOutMs` are preserved through the compiler; the renderer
  applies the corresponding envelope (`GenericTemplateComposition.tsx:254-290`).
- **Captions** take one of two paths chosen by document-level `captions.burnIn`:
  text layers at fixed geometry `x5 y76 w90 h20 z900`
  (`videoProjectCompiler.ts:295-303`), or the ffmpeg `ass_burn` post-pass
  (`renderVideoJob.ts:431-445`). Caption **style is document-level**; only cues
  are per-scene. Both paths now use the shared allowlisted Thai font families;
  the ASS post-pass retains its documented `Noto Sans Thai` default
  (`postPassArgs.ts:244`) while the layer path loads the selected family (§4.10).
- **`postPasses: ["loudnorm"]`** is EBU R128 loudness normalisation on the
  finished MP4 (`remotionPostPassArgs.ts:35-54`) — not mixing, not ducking.

### 3.4 Effects that actually exist

Supported: position/size/rotation/static opacity; image `objectFit`; a fixed
15-frame text fade-in; svg `fadeIn`/`drawPath`/`pulse`; motionGraphic
`spin`/`pulse`/`bounce`; audio fade+loop+trim-in; video trim-in/volume/mute
(forced `cover`).

**Not supported in `GenericTemplateComposition` — would need new components:**
Ken Burns / pan-zoom, any scale animation, blur, colour filters, drop shadow,
border radius, gradients, vignette, masks, scene transitions, text animation
beyond the fixed fade, karaoke word highlighting, per-layer visual fade-out,
speed ramps, chroma key.

`scene.motion.camera` ("push-in", "pan-left", …) is a free-text field
(`projectSchemas.ts:104`) **read by nothing**. It is a planning label, not a
rendered behaviour, and the UI must not imply otherwise (AC12).

### 3.5 Hard limits the UI must enforce, not discover

| limit | value | evidence |
|---|---|---|
| layers per compiled config | **40** | `layerTemplateSchemas.ts:23,170`, mirrored `videoProjectCompiler.ts:142` |
| >40 layers | auto-segments; worker renders each part and concatenates one final file before global audio/subtitle post-passes | `videoProjectCompiler.ts`, `renderVideoJob.ts`, `videoProjects.ts` |
| layer `src` | `http(s)` **on this server's own origin** under `/api/storage/files/` or `/uploads/` | `videoProjectAssetResolver.ts:190-208`, enforced at save AND compile |
| asset bytes | manifest `sha256` must match the fetched bytes or the worker throws | `renderVideoJob.ts:191-193` |
| canvas | 320-4096 per axis, fps 12-60 | `projectSchemas.ts:57-61` |
| duration | no maximum | — |
| render rate | 6/min (30 admin), 1 active preview per user | `workerSchedulerService.ts:1849-1903` |
| render feature flag | `remotionRenderVideoJobEnabled`, per-tenant, **default off** | `shared/featureFlags.ts:218`, thrown at `workerSchedulerService.ts:1870-1877` |

The 40-layer budget counts **scene layers + template-emitted layers + one text
layer per caption cue (when burn-in is off) + one audio layer per audio asset**.
A five-scene project with burn-in off can spend 20+ layers on captions alone.

**There are four different layer counts in the codebase today and only one is
correct** (§4.6).

---

## 4. Design

### 4.1 Core idea — the timeline is a *projection*, not a new data model

The user thinks in tracks. The document stores layers on scenes. Rather than
restructure the document (which would break the frozen worker contract), the
editor derives tracks from what is already there and writes back into the same
fields.

```
Timeline UI                          Document (unchanged shape)
─────────────────────────────────────────────────────────────────────
🎬 Scene strip     ────────────▶  document.scenes[] (startMs/endMs)
   Brand           ────────────▶  layers zIndex 500-899, role="brand"
   Overlay 1..N    ────────────▶  layers zIndex 100-499, role="overlay"
   Background      ────────────▶  layers zIndex 0-99,    role="background"
   Subtitles       ────────────▶  read-only view of scene.captionCues
   Audio           ────────────▶  document.audioTracks[]
```

**zIndex bands are the contract between the UI and the compiler.** They are a
convention the editor maintains, not a new schema concept, and they coexist with
the existing hardcoded `zIndex: 900` for captions and `0` for audio.
`role` (§4.8) records the band explicitly so it survives round-trips and so the
server can reason about intent (§4.9.1).

A layer's *owning scene* is an implementation detail **only for authoring**: the
editor writes a layer onto whichever scene contains its start time and computes
`startFrame` relative to that scene. It is emphatically **not** an implementation
detail for AI stages — see §4.9.2, which is the price of this design.

### 4.2 Why not reuse the existing Video Editor

`apps/web/client/src/components/videoeditor/` is a complete 22.5k-LOC NLE routed
at `/video-editor`, and `video_projects.videoEditorProjectId`
(`drizzle/schema.ts:21514`) is a **dead stub column with no FK and zero readers
or writers** that falsely suggests a bridge exists. (Not to be confused with
`media_studio_storyboard_reviews.videoEditorProjectId` at `:8883`, a real live FK.)

| | Video Editor | Video Studio |
|---|---|---|
| structure | flat tracks → clips | scenes → layers |
| time | seconds | ms (scene) + frames (layer) |
| position | pixels | percent |
| assets | `library_items.id` (string, client-side) | numeric ids, server-resolved |

**Decision: harvest logic, never the data layer, and never extend that surface.**
Both older surfaces are stale (last touched 2026-07-04/05) and carry a parallel
hardcoded dark theme in inline `<style>` blocks; Video Studio is Astryx-native.

### 4.3 Reuse map

| capability | verdict | source |
|---|---|---|
| **live preview that matches the render** | **REUSE** `<Player>` over `GenericTemplateComposition` | `videoStudio/RemotionProjectPreview.tsx` |
| **undo/redo with gesture coalescing** | **REUSE wholesale** (`execute` / `applyWithoutUndo` / `executeAndMerge` / `breakMerge`, has tests) | `client/src/presentation-canvas/commands/CommandBus.ts` |
| clip drag / trim / edge+playhead snapping | **REUSE the algorithms** — extract to a hook, do not copy the component | `videoeditor/Timeline.tsx:187-410` |
| time ruler + scroll sync | ADAPT (re-unit seconds → ms) | `Timeline.tsx:548-562, 455-460` |
| zoom (px/sec, ×1.2, clamp 10-200) | REUSE pattern | `VideoEditorPhase3.tsx:3437-3446` |
| 8-point transform handles + rotate | **REUSE** — already percent-based, matching `PercentSchema` | `client/src/presentation-canvas/CanvasObjects.tsx:1104-1136` |
| snap guides | **REUSE wholesale** — pure, tested, zero deps | `client/src/presentation-canvas/snap/SnapEngine.ts` |
| Thai font loading under `delayRender` | **PORT** into `GenericTemplateComposition` | `MarketplaceAutoReviewComposition.tsx:63-105` |
| audio waveform canvas | REUSE (takes pre-decoded peaks — someone must decode, §4.16) | `videoeditor/WaveformCanvas.tsx` |
| upload + progress + auto-transcode | REUSE, re-target registration | `videoeditor/MediaLibraryPanel.tsx:226-317` |
| split panes / slider / tabs / context menu / toolbar | REUSE Astryx | `@astryxdesign/core` |
| layer list with z-order + visibility | **BUILD NEW** | — |
| asset picker returning an allowlisted URL + hash | **BUILD NEW** (§4.7) | — |
| drag-and-drop library | **ADD NOTHING** — zero dnd deps repo-wide by convention | — |

### 4.4 The editing surface is the renderer

`RemotionProjectPreview.tsx` already mounts `@remotion/player`'s `<Player>` with
the **same `GenericTemplateComposition` the server renders with**, over the
compiled config, and is live in `RenderPanel.tsx:133`. Its own docstring states
the preview and the final render are guaranteed to look identical.

The editor therefore does **not** draw its own canvas. It renders a controlled
`<Player>` (frame driven by the timeline playhead via `playerRef.seekTo`) with
the transform handles and snap guides as an **absolutely-positioned percent-
coordinate overlay** on top. Consequences:

- RK3 ("the editor implies capabilities that do not render") is **eliminated by
  construction** — the editing surface physically cannot draw a crossfade.
- A whole class of preview-vs-render mismatch bugs never exists.
- P1 shrinks substantially.

**The constraint this creates and the spec must state:** `compileProject` is a
*server* procedure (`videoProjects.ts:2937`) because asset URLs resolve
server-side. Per-drag recompiles are not viable. Required implementation:
**debounced recompile (~400 ms idle) plus an optimistic client-side patch of the
already-compiled config for the layer being manipulated.** Anyone implementing a
recompile per `pointermove` has misread this section.

```
┌──────────────────────────────────────────────────────────────────┐
│ โจทย์ │ ฉาก │ เสียงพากย์ │ โมชัน │ ซับไทเทิล │ ⟨จัดวาง & ไทม์ไลน์⟩ │ QA │ เรนเดอร์ │
├───────────────────────────────┬──────────────────────────────────┤
│                               │  รายละเอียด (เลือกอยู่)           │
│   <Player> (ตัวเดียวกับที่เรนเดอร์)  │  ตำแหน่ง / ขนาด / เวลา / ความทึบ   │
│   + handle 8 จุด + เส้นไกด์      │  + ฟิลด์เฉพาะชนิด                 │
│   + กรอบปลอดภัย                 │  (ไม่ได้เลือก → ค่าของทั้งโปรเจกต์)  │
├───────────────────────────────┴──────────────────────────────────┤
│ เลเยอร์ที่ใช้ไป  แม่แบบ 18 · ที่คุณวางเอง 4 · ซับไทเทิล 12 · เสียง 2 = 36/40 │
├──────────────────────────────────────────────────────────────────┤
│  0:00      0:05      0:10      0:15      0:20      ▏             │
│ 🎬 ฉาก        [ ฉาก 1 ][ ฉาก 2     ][ ฉาก 3  ]                    │
│ 🏷 โลโก้ & ลายน้ำ   ·········[ โลโก้ ]··········  อยู่หน้าสุด          │
│ 🖼 ภาพ/ข้อความซ้อน     [ ข้อความ ]   [ ภาพสินค้า ]   วางทับพื้นหลัง     │
│ 🎞 พื้นหลัง (เต็มจอ)  [ คลิป A ][ คลิป B      ][ ภาพ ]  อยู่หลังสุดเสมอ  │
│ 💬 ซับไทเทิล   ▂▂▂ ▂▂▂▂ ▂▂ ▂▂▂▂▂   (ดูอย่างเดียว)                  │
│ 🔊 เสียง      [ เสียงพากย์ ══════════ ] 🔊──                       │
│               [ เพลงประกอบ (วนซ้ำ) ═════ ] 🔊──                    │
└──────────────────────────────────────────────────────────────────┘
```

Track order is inverted relative to z: **what is drawn first sits lowest**,
matching every NLE. The scene strip is pinned at the top because it is the spine,
not a layer.

### 4.5 Interaction rules

- **Selection is shared** between timeline, preview overlay, inspector and the
  form-based layer list (D3). One selection model.
- **Drag along time** moves `startFrame` (re-homing to a different owning scene
  silently if it crosses a boundary, preserving absolute time). **Drag vertically
  between overlay rows** changes the band slot. **Drag the edges** trims: for
  `video`, the left edge adjusts `trimStartSec` **and** `startFrame` together so
  the clip's content does not slide; for everything else it adjusts
  `durationFrames`. (A right-edge trim needs no `trimEndSec` field — a shorter
  `durationFrames` truncates.)
- **Snapping** to scene boundaries, the playhead, other clips' edges, and 0;
  modifier to disable — same convention as `Timeline.tsx:187-214`.
- **Background concatenation (G3)** is adjacency: a second clip placed right
  after the first is two layers with adjacent `startFrame`/`durationFrames`,
  identical full-bleed geometry and the same band. The UI shows them as one strip
  with a "ต่อคลิป" affordance at the end. **No gapless transition exists** — a
  hard cut is the only outcome and the UI must not imply otherwise.
- **Subtitle track is read-only.** Editing text stays in the Subtitles stage;
  this track exists so the user sees where subtitles land, and it must show the
  burn-in state, because burn-in changes whether cues consume budget at all.
- **Never show a z-order number.** The only user-facing concept is
  `นำมาไว้ด้านหน้า` / `ส่งไปด้านหลัง` on the clip context menu; band assignment is
  derived (§4.15).
- **Per-item pending state only** — a pending mutation on one clip must never
  disable the whole timeline. The one deliberate exception is §4.13's
  generation-job read-only state.
- **Multi-select** (shift-click + marquee) with a defined group-drag rule;
  **duplicate** (regenerating ids per §4.12) and **copy/paste across scenes**.
- **Keyboard is a first-class path**: arrow = 1 frame, shift+arrow = 1 s, tab
  order across tracks, `aria-label` carrying layer name + time range. Video
  Studio has **zero** keyboard handling today (`grep onKeyDown` over
  `components/videoStudio/*` returns nothing), so this is new work, not a polish
  pass.
- **Autosave on idle (~1.5 s).** `RenderPanel` disables preview *and* render
  whenever `hasUnsavedChanges` (`RenderPanel.tsx:93`); a timeline produces
  unsaved changes on every drag, so without autosave the preview goes dead mid-
  edit. Autosave also shrinks the RK4 conflict window from a whole session to
  ~1.5 s.

### 4.6 The layer budget is a first-class UI element

The 40-layer cap is visible as a meter above the timeline. When the compiled
document exceeds the per-config cap, the render payload carries the ordered
segment templates and a duration plan; the worker renders each part, performs
one FFmpeg concat re-encode, then applies global loudness normalization and
subtitle burn-in. This keeps a project renderable without pretending that all
layers fit into one Remotion composition.

**Which count is authoritative.** There are four in the codebase:

1. `MAX_LAYERS = 40` on the compiled config (`layerTemplateSchemas.ts:23,170`) —
   scene + template + caption + audio layers. **Authoritative.**
2. `MAX_LAYERS_PER_CONFIG = 40` in the compiler (`videoProjectCompiler.ts:142`) —
   same set. Authoritative.
3. `estimateSceneLayerCount` (`videoProjectScenePlanner.ts:551`) — a pre-LLM
   estimate, explicitly non-authoritative.
4. `MAX_TOTAL_LAYERS = 40` in the repair applier
   (`videoProjectRepairApplier.ts:167`), compared against `computeLayerCounts`
   which sums **only `scene.layers.length`** (`videoProjectQualityMetrics.ts:155-159`)
   — it ignores template, caption and audio layers entirely. **This is wrong by
   construction and is harmless today only because `scene.layers` is always
   empty.** Once this feature ships, the repair applier will start deleting the
   user's layers based on a count that excludes 20 caption layers. **Fixing it is
   a P0 item.**

**The meter must not depend on a throwing call.** `compileProject` propagates
`BrandLockViolationError` (§4.8 note), so with brand locks on it would go blank
exactly when the user most needs it. The meter therefore uses a non-throwing
count path (`computeLayerCounts` + template/caption/audio contributions) and uses
`compileProject` only for authoritative confirmation.

Presentation: breakdown by source **in the same Thai nouns the user sees**
(`แม่แบบฉาก 18 · ที่คุณวางเอง 4 · ซับไทเทิล 12 · เสียง 2 = 36/40`), amber at 34,
new-layer actions disabled at 40 with the two cheapest remedies stated inline
(turn burn-in on to reclaim every caption layer; delete decorative layers).
`RenderPanel.tsx:211,223` already disables render when `compiled?.kind !==
"single"` — the data exists, only the affordance is missing. (Both those lines
also disable on a shared `queueRender.isPending`, which is the panel-wide pending
anti-pattern §4.5 forbids; fix while in the area.)

### 4.7 Assets: picker, allowlist, and the checksum gate  🔴 P0

Three separate problems, all of which must be solved before any authoring UI.

**(a) The client has no picker for the right id space.** Every picker in the repo
works on `library_items.id`; the fork is documented in-repo at
`VerticalDramaCharacterReferencePanel.tsx:11`. (Note: the *server* resolver
already handles both `mediaAssets` and `libraryItems` ids —
`videoProjectAssetResolver.ts:307-360` — so this is a client-side gap, not an
architectural fork on the backend.)

**(b) A layer's `src` must be an allowlisted internal URL** (§3.5), enforced at
both `saveDocument` and compile.

**(c) 🔴 The render will reject the asset even when (a) and (b) are satisfied.**
`collectDocumentAssetIds` (`videoProjectAssetResolver.ts:81-122`) never walks
`scene.layers[]`, so `sha256ByUrl` has no entry for a hand-authored `src`,
`buildAssetManifest` emits `sha256: undefined` (`:445`), `queueRender`
substitutes `fallbackAssetSourceHash(url)` — a hash of the *URL string*
(`videoProjects.ts:3040`) — and the worker throws
`Asset checksum mismatch for <role> source` after fetching the real bytes
(`renderVideoJob.ts:191-193`). The resolver's own comment at `:409-414` says
plainly that a URL hash "would make every such render fail."

**Required P0 work:**

1. Extend the asset walk to cover `scene.layers[].src` for `image` / `video` /
   `audio`, so `sha256ByUrl` is populated for hand-authored sources.
2. Add a tRPC list/search procedure returning
   `{ assetId, storageUrl, sha256, kind, durationMs?, width?, height?, thumbnailUrl? }`
   where `storageUrl` is already the allowlisted internal proxy URL.
3. A round-trip test: place a layer through the picker → queue a render → assert
   the manifest entry carries a real content hash and the worker's verification
   passes.

This also solves the missing logo picker recorded in §6.

### 4.8 Schema additions (all optional, backward compatible)

Kept minimal because of the cross-package `.strict()` contract (§3.1). Each is
`.optional()` — never `.default()`, which would make the field required in the
inferred type and break every existing construction site (a mistake already made
and reverted during the motion-variants work).

On `RemotionLayerBaseSchema`:

| field | why |
|---|---|
| `name?: string` | a layers list needs a human label; today only `id` exists |
| `locked?: boolean` | **must be honoured server-side** — it is the only mechanism protecting a layer from the repair applier (§4.9.1), so it lands in P0/P1, not P2 |
| `hidden?: boolean` | author-time visibility; compiler skips hidden layers |
| `role?: "background" \| "overlay" \| "brand"` | makes the band projection explicit, survives round-trips, and drives the safe-area exemption (§4.9.1) |

On `AudioTrackSchema` — note this is a **discriminated union of three separately
`.strict()` objects** (`projectSchemas.ts:192-227`), so this is not one edit:
add `startMs?`, `endMs?`, `fadeInMs?`, `fadeOutMs?` to the **`narration` and
`music` variants** (`sfx` already carries per-event `atMs` and needs no change).
Three compiler call sites must then stop overriding them: the full-document span
(`videoProjectCompiler.ts:336-358`) and the two hardcoded-zero fades (`:370-371`,
`:401`). The renderer's envelope is already correct — this is purely a schema +
compiler change.

**Brand-lock caution.** `enforceBrandLocks` **throws** when `locks.colors` is on
and *any* layer with a `color` field (text **or** `motionGraphic`) differs from
`brandKit.colors.primary`, and when `locks.fonts` is on and any text layer's
`fontFamily` differs from `brandKit.fonts.body`
(`videoProjectCompiler.ts:474-500`). It also inspects **compiler-generated
caption layers**, whose colour comes from the preset table — so enabling
`locks.colors` can make a document with captions uncompilable regardless of user
input. The inspector's colour/font controls must therefore be **constrained to
the locked token when a lock is on**, rather than letting the user author an
uncompilable document.

### 4.9 AI-vs-manual contract  🔴 P0

Every AI stage was written when `scene.layers` was always empty. Three of them
are actively wrong against real layers.

#### 4.9.1 Hand-authored layers are never destroyed or deformed

- **Safe-area clamp.** `applyLayoutHandler`
  (`videoProjectRepairApplier.ts:524-561`) clamps flagged layers into the safe
  rect, and a full-bleed background is *always* flagged
  (`videoProjectQualityMetrics.ts:217-244`; `tiktok_9_16` insets
  `{top:10,bottom:20,left:5,right:15}` at `:178-183`). **Required:**
  `computeSafeAreaViolations` must exempt layers with `role === "background"`
  (or full-bleed geometry), and both repair handlers must skip `locked` layers.
- **Decorative deletion.** `dropDecorativeLayersOverBudget` (`:417-460`) deletes
  `motionGraphic` layers lowest-`zIndex`-first. **Required:** never delete a
  user-authored layer; prefer template-emitted ones, and if the only candidates
  are user layers, report instead of deleting.
- **Required:** the QA panel shows which layers a repair round *would* move or
  delete, before applying.
- **Required:** a regression test proving layers survive a repair round —
  today they survive `applyPlannedScene` only by accident of an object spread
  (`videoProjectScenePlanner.ts:690-703`).

#### 4.9.2 Hand-authored layers are never moved in absolute time

`applyPlannedScene` rewrites `startMs`/`endMs` whenever a scene is not
timing-locked (`isTimingLocked` = has narration audio or caption cues, `:510-512`).
Because `startFrame` is scene-relative and the compiler adds the scene's
`startMs`, **any re-plan, reorder, delete or `resequenceScenes` silently slides
every layer riding on that scene.** A logo placed at 0:03 lands at 0:04.4 with no
warning and no validation failure.

**Required:** on any change to a scene's timing, every layer on that scene is
re-homed so its **absolute** start is preserved — recompute `startFrame` (and the
owning scene) from a preserved absolute ms value. This applies equally to
`ScenesPanel`'s reorder/duplicate/delete paths (§4.12).

#### 4.9.3 A scene with layers is still plannable (D2)

`partitionScenes` (`videoProjectScenePlanner.ts:514-531`) requires
`scene.layers.length === 0` for `fill_empty`. Auto-draft uses `fill_empty`
(`videoProjects.ts:1841-1849`), so one placed layer silently removes that scene
from AI planning forever. **Required:** the predicate becomes "no narration and
no template", not "no layers".

#### 4.9.4 Budget forecast before spending credits

`assertLayerBudgetOrThrow` runs on the merged document (`:384`), so a user's 12
hand-placed layers can make a re-plan hard-fail `VI_PLAN_LAYER_BUDGET` after
payment. **Required:** `StageEstimateDialog` shows a projected post-stage layer
count (`เลเยอร์หลังร่างเสร็จ: ~31/40`) next to the credit ceiling.

#### 4.9.5 `replace` mode shows a diff, not a checkbox

Existing copy `scenePlanReplaceWarning` does not mention layers at all.
**Required:** `th: "จะวางแผนฉากใหม่ทั้งหมด ภาพ/ข้อความที่คุณวางเอง N ชิ้นจะถูกเก็บไว้
และระบบจะเลื่อนให้ตรงเวลาเดิม แต่แม่แบบเดิมของทุกฉากจะถูกแทนที่"`, with N computed.

#### 4.9.6 Template and hand-authored layers coexist — say so

`videoProjectCompiler.ts:679` renders `scene.layers` **and** template layers on
the same scene. So swapping a template in the Motion tab changes the visual under
a user's overlay with no warning. **Required:** a badge in `MotionPanel` on
scenes carrying hand-authored layers; template-emitted clips visually distinct in
the timeline (locked-looking, `แม่แบบ` badge, edit routes to the Motion tab).
Note the naming trap: `visual.kind: "layers"` means **"no template"**, not "has
layers" — an implementer who reads it the other way will produce wrong code.

### 4.10 Fonts  🔴 P0/P1

`TextLayerContent` sets `fontFamily` as a bare CSS value with **zero font
registration** — no `loadFont`, no `@font-face`, no `delayRender` gate anywhere
in the generic path (`GenericTemplateComposition.tsx:104-137`). Whatever the
headless-Chromium worker happens to have installed wins; a Thai string in
`Sarabun` or `Prompt` silently falls back to tofu or a wrong face, with no error.

This is doubly visible because three other paths do it correctly:
`MarketplaceAutoReviewComposition.tsx:63-105` has a real `ThaiFontLoader`
(`FontFace` + `document.fonts.add` + `delayRender`) fed by `fontFaceUrl`
(`remotionRuntimeAdapter.ts:472-475`); the ASS burn hardcodes `Noto Sans Thai`
(`postPassArgs.ts:244`); and the worker contract **already reserves**
`role: "font"` in the asset manifest (`remotionRenderVideoSchema.ts:145`), which
`buildAssetManifest` never emits (`videoProjectAssetResolver.ts:426-428`).

**Required:** an allowlist of font families the editor may offer; `role: "font"`
manifest entries for them; `ThaiFontLoader` ported into
`GenericTemplateComposition` behind `delayRender`. **A text-overlay feature that
cannot render Thai correctly fails AC2 for this product's primary language.**

### 4.11 Format changes are destructive to layers

`BriefPanel.tsx` lets the user edit `format.fps` (`:334`), `format.width/height`
(`:310-324`) and `content.platformPreset` (`:378-391`) at any time.

- **fps:** scene timing is ms and converted at compile, but layer
  `startFrame`/`durationFrames` are raw frames and are **never rescaled**.
  30 → 24 fps shifts every layer earlier and shortens it by 20%, silently.
- **canvas size:** percent geometry survives, but `fontSizePx` is absolute, so
  every text size becomes wrong relative to the frame.
- **platformPreset:** changes the safe rect, re-triggering §4.9.1.

**Required (choose and state one):** either block format edits once any
`scene.layers[]` entry exists, or migrate layer frames on fps change and rescale
`fontSizePx` by the height ratio on canvas change — behind an explicit confirm.
**This spec chooses migration-with-confirm**, because blocking would strand users
who legitimately switch aspect ratio mid-project.

Related: `downscaleConfigForPreview` (`videoProjects.ts:419-439`) rescales
geometry and frames but **not `fontSizePx`**, so a 1080×1920 project previewing
at 540×960 shows text at twice its correct relative size. Fix in P0, or the
preview-based verification loop in AC2 is untrustworthy. (Its 30→15 fps
`Math.round` also introduces up to half-a-frame drift, so preview ≠ final for
tightly-abutted background clips.)

### 4.12 Layer ids

Three assumptions exist in code and none are enforced:

- **React key.** The renderer does `key={layer.id}` over the flattened config
  (`GenericTemplateComposition.tsx:332`). Duplicate ids across scenes break both
  the `<Player>` preview and the render.
- **`duplicateScene` copies layer ids verbatim** — `ScenesPanel.tsx:211-215`
  spreads `...source` and regenerates only `sceneId`.
- **The compiler reads meaning out of ids**: the CTA brand lock is
  `layer.type === "text" && layer.id.endsWith("_cta")`
  (`videoProjectCompiler.ts:534`), and generated ids follow reserved patterns
  `${sceneId}_caption_${index}` (`:294`) and `audio_${kind}_${i}_${j}` (`:353`).

**Required:** editor-generated ids use a reserved prefix that cannot collide with
`*_caption_*` / `audio_*`; document-wide uniqueness asserted in `saveDocument`;
`duplicateScene` regenerates every layer id; the `_cta` suffix documented as
load-bearing and offered deliberately, never by accident.

### 4.13 States

| state | required behaviour |
|---|---|
| **Loading** | Skeleton with the correct track count derived from the document — the tracks are known before compile returns. Not a spinner. |
| **Empty (no hand-authored layers)** | **Not an error, and the highest-value screen in the feature.** Read-only AI composition plus exactly four primary actions: `ใส่วิดีโอพื้นหลัง`, `ใส่ข้อความ`, `ใส่โลโก้/ลายน้ำ`, `ใส่เพลงประกอบ` — each producing a correctly positioned, timed and banded layer with no dragging (G9). |
| **Asset uploading** | Placeholder clip at its intended time with progress on the clip; never blocks the rest of the timeline. |
| **Asset missing/expired** | This codebase has a live class of dead `media_assets.storageKey` values pointing at expired provider URLs. A layer whose `src` 404s renders as a red `ไฟล์หาย` clip **with a replace action**, and blocks final render with a named reason — never a silent black frame. |
| **Render in progress** | Editing stays enabled; the render is a snapshot of the saved revision. Show *which* revision is rendering. |
| **Generation job running** | Timeline goes **read-only with a banner** (`th: "AI กำลังร่างเนื้อหาอยู่ — แก้ไขได้เมื่อเสร็จ"`). This is the one legitimate whole-surface disable, because an AI stage rewrites scene timings underneath the user (§4.9.2). |
| **Save conflict** | The existing conflict banner forces a reload that discards every unsaved drag. This stage offers `เก็บการแก้ไขของฉันไว้`: reload the server document and re-apply the local layer diff. |
| **Feature flag off** | Editor fully usable; render disabled with a stated reason, shown both in the Render stage **and** as a persistent non-blocking note in the timeline header — so the user does not build a 30-layer video and discover it at the end. |
| **40/40 budget** | Launchers disabled with the remedy inline, not a toast. |
| **Segmented compile** | Treat `kind: "segmented"` as "cannot preview, cannot render" — do **not** render the parts. `buildSegmentedConfigs` rebases each chunk by `minFrame` (`videoProjectCompiler.ts:614-627`), which destroys cross-scene layer timing (RK6). |

### 4.14 Responsive

`VideoStudioWorkspacePage.tsx:220` is `flex items-start gap-4` with **zero
breakpoints** and a hard `w-[340px]` product panel at `:352`. The workspace
already overflows on narrow screens.

- On entering this stage, **auto-collapse `ProductLibraryPanel`**.
- **≥1280px:** full layout as drawn.
- **1024-1280px:** inspector becomes a bottom sheet/drawer; preview shrinks.
- **<1024px:** **no drag surface.** Read-only timeline plus the form-based layer
  list (D3), every property an ordinary field. Banner: `th: "หน้าจอนี้แคบเกินไป
  สำหรับการลากวาง — แก้ไขค่าจากรายการด้านล่างได้ตามปกติ"`.

### 4.15 Thai terminology

Established in `videoStudioCopy.ts` — reuse verbatim: `เลเยอร์` (`:117,203,465,470`),
`ไทม์ไลน์` (`:312`), `ฉาก`, `แม่แบบ` (`:211,379`), `ซับไทเทิล`, `โมชัน`, `ล็อก`
(`:462-490`), `ซ้อนทับ` (`:207`), `เขียนทับ` (`:58,195`).

New terms: track = `แทร็ก` (row heading only); clip = `คลิป`; overlay =
`ภาพซ้อน`/`ข้อความซ้อน`; background = `พื้นหลัง`; watermark = `ลายน้ำ`; playhead =
`ตัวชี้เวลา`; snap = `ดูดเข้าหาขอบ` (tooltip only, never a label); concatenate =
`ต่อคลิป`.

Deliberately **not** translated: **z-order** — the concept is removed and
replaced by `นำมาไว้ด้านหน้า` / `ส่งไปด้านหลัง`. **keyframe** must never appear
(unsupported, §3.4 — its presence would breach RK3). **trim**: avoid the noun;
label the edges `จุดเริ่ม` / `จุดจบ` and the action `ปรับช่วงเวลา`, because `ตัด`
alone reads as *delete* to this audience — a real hazard on a destructive-looking
edge drag.

Two consistency rules:
1. **The budget meter and the timeline must count the same nouns.** The meter is
   already worded `เลเยอร์`; a user adds one `คลิป` and it moves by 1, picks one
   `แม่แบบ` and it moves by 6. Hence the sourced breakdown in §4.6.
2. **Reserve `เลเยอร์` for the budget meter**; in the timeline UI an individual
   item is a `คลิป` and a row is a `แทร็ก`.

### 4.16 Performance

The `<Player>` renders the **real** assets — full-resolution `<Video>`/`<Img>` at
composition dimensions, up to 40 simultaneous `<Sequence>` wrappers — and nothing
in the repo generates proxy media for Video Studio. Combined with ~40 clips × N
tracks plus waveform canvases, scrubbing will be the first thing that feels
broken.

**Required:** state a budget (40 layers / 60 s / smooth scrub), fixed-height
virtualized timeline rows above N clips, and a decision on whether the preview
plays live during a drag or freezes to a poster frame. `WaveformCanvas` takes
**pre-decoded peaks**, so peak extraction must be specified — server-side at
upload is preferred over client-side decode of every audio asset.

---

## 5. Render Path (G6)

No change to the worker contract. **The timeline does not add a fourth render
button**: its "ส่งเข้าคิวเรนเดอร์" action **navigates to the Render stage**, which
already owns the confirm gate, the cost estimate and the flag check. One gate,
one estimate, one place.

The job is the existing `queueRender({ profile: "final" })` producing a
`worker_jobs` row with `jobType: "remotion_render_video"`,
`runtimeType: DESKTOP_RUNTIME_TYPE`,
`capabilityFamilies: ["remotion-render","chromium-render","ffmpeg-probe"]`
(`workerSchedulerService.ts:1925-1962`), visible in `/render-jobs`.

Two frictions to fix while in the area:

- **R1 (baseline gap, now closed).** At spec drafting, `/render-jobs` showed
  the job type but could not filter by it — `workerJobs.list` accepted only
  `{status, limit, offset}`. The current route forwards `jobType` into the
  tenant/requester-scoped repository query, so filtering is complete across
  the full job history rather than capped in memory.
- **R2.** Rendering is gated behind tenant flag `remotionRenderVideoJobEnabled`
  (default off), thrown as `feature_disabled`/403 at
  `workerSchedulerService.ts:1870-1877`. Surface it up front (§4.13), never as a
  submit-time error.

---

## 6. Assessment of the Remaining Non-Editor Gaps

| gap | severity | note |
|---|---|---|
| `productFidelity` brand lock is shallow | MED | `ResolvedCatalogFacts` is threaded into `TemplateBuildContext`; product IDs and at least one reference image per product are required, and incomplete facts fail closed. Exact rendered color/logo/product matching remains a QA-evidence concern. |
| no logo picker | LOW | Solved for free by §4.7. |
| no scene transitions | MED | `@remotion/transitions` **is** installed and used by `MarketplaceAutoReviewComposition`; `GenericTemplateComposition` does not use it. A working in-repo reference exists. |
| "ducking" is a flat −6 dB | LOW | Implemented as documented fixed attenuation, with the UI label avoiding the technical term sidechain. |
| F142 R9 — prompt-injection labelling | MED | Closed: Catalog claims are marked as untrusted evidence at planner, narration and QA LLM boundaries. |
| client-side asset id fork | MED | Client pickers are all `library_items.id`; the server resolver already handles both. §4.7 resolves it for this feature. |
| `video_projects.videoEditorProjectId` | LOW | Closed: removed the dead non-goal bridge column and added an idempotent drop migration. |
| no automated equality test between the two `layerTemplateSchemas.ts` copies | MED | Closed: the existing sync test guards both copies modulo comments. |

---

## 7. Phasing

| phase | scope | gate |
|---|---|---|
| **P0** | §4.7 asset walk + sha256 + picker procedure; §4.9 AI-interaction fixes (safe-area exemption, `locked` honoured server-side, no user-layer deletion, `partitionScenes` predicate, absolute-time preservation); §4.10 fonts; §4.6 authoritative count fix; `fontSizePx` in preview downscale; R1 `jobType` filter | Nothing else can be built correctly first, and three of these are silent-data-loss bugs |
| **P1** | Read-only timeline + **form-based layer list (D3)** + selection sync to the controlled `<Player>`; ruler, playhead, zoom; budget meter; states (§4.13) | Users can see and edit the composition without any drag surface |
| **P2** | Direct manipulation: drag/trim/snap, transform overlay, inspector, layer list with front/back + lock/hide; **undo/redo (G7)**; multi-select, duplicate, copy/paste; keyboard + a11y; schema additions (§4.8); autosave | The authoring capability proper |
| **P3** | Four launchers (G9) → named presets (`ราคาโปรมุมบนขวา`, `ลายน้ำร้านค้า`, `ข้อความเปิด 3 วินาทีแรก`, `CTA ปิดท้าย`, `แถบซับไทเทิลพื้นหลังทึบ`); background concatenation affordance; audio timing/fades/volume; §4.11 format migration | Completes the requested model and is what actually makes it usable for a non-editor |
| **P4** | Effects needing new Remotion components (Ken Burns, transitions) — separate spec | Out of scope here |

**Phase gate for P3:** no full-bleed background ships until a QA repair round has
been run over a document containing one and verified non-destructive (§4.9.1).

---

## 8. Risks

- **RK1 — cross-package contract drift (HIGH).** Any layer-schema addition must
  land in both `layerTemplateSchemas.ts` copies in lockstep with a
  `platformContractVersion` bump and updated golden fixtures. The existing
  automated equality test compares both copies modulo comments; the package
  copy's header comment remains historical documentation only.
- **RK2 — layer-budget blowout (HIGH).** Direct authoring makes >40 layers
  trivial, producing a project that compiles but can never be final-rendered.
  Mitigated by §4.6; the meter is not optional.
- **RK3 — phantom capabilities (eliminated by construction).** Using the real
  `<Player>` as the editing surface means the editor physically cannot draw an
  effect the renderer lacks. Retained as a copy/UI rule: no control may exist for
  crossfade, Ken Burns, blur, keyframes, or `motion.camera`.
- **RK4 — whole-document save conflicts (MED).** `saveDocument` is a whole-
  document write with `baseRevision`; a generation job landing mid-edit forces a
  CONFLICT. Mitigated by autosave (§4.5) + the diff-preserving conflict path
  (§4.13); consider per-layer mutations before P2 ships.
- **RK5 — stale-surface gravity (LOW).** Harvesting from `videoeditor/` and
  `presentation-canvas/` means reading month-old code with a conflicting theme.
  Port logic, restyle chrome; never import their components verbatim.
- **RK6 — segmented compile destroys cross-scene layers (MED).**
  `buildSegmentedConfigs` groups by owning scene and rebases by `minFrame`
  (`videoProjectCompiler.ts:614-627`), so a background spanning scenes 0-3 is
  rebased with chunk 0 only. `compileProject` returns segmented parts to the
  client, so the meter and preview would show garbage. §4.13 forbids rendering
  them.
- **RK7 — checksum mismatch (HIGH, was invisible in 1.0.0).** Without the §4.7
  asset walk, every render containing a hand-authored asset fails at the worker's
  verification step. Ship the round-trip test with the walk.
- **RK8 — silent retiming on format change (HIGH).** §4.11. This is a
  data-corruption class, not a UX annoyance.
- **RK9 — brand locks throw at compile (MED).** They can make a document with
  captions uncompilable regardless of user input, and they blank the budget meter
  (§4.6, §4.8).
- **RK10 — duplicate layer ids (MED).** §4.12; `duplicateScene` already produces
  them the moment layers exist.
- **RK11 — preview performance (MED).** §4.16; no proxy media exists.
- **RK12 — Thai text renders as tofu (HIGH).** §4.10; both caption paths now
  have an allowlisted-font loading path. Unallowlisted custom families remain
  outside the guarantee and fall back to the render environment.

---

## 9. Acceptance Criteria

**Machinery**

- AC1 — A user places a video on the background track, places a second video
  after it, and renders a final video in which both play in sequence, full-bleed,
  spanning scene boundaries.
- AC2 — A user places a text overlay (in Thai) and a logo overlay at chosen times
  and positions, sees them in the preview, and sees them in the rendered output
  at the same times, positions **and typeface**.
- AC3 — A user adds background music that loops for the whole video, at a level
  they set, audibly distinct from the narration.
- AC4 — The layer budget meter is always visible, accurate, sourced, and never
  blank (including with brand locks on); a final render is never rejected for
  segmentation without a prior warning.
- AC5 — Every asset placed through the editor resolves to an allowlisted internal
  URL **and carries a real content hash**; `saveDocument` never rejects a
  document the editor produced; the worker's checksum verification never fails.
- AC6 — The render route creates exactly one `remotion_render_video` job,
  visible and filterable in `/render-jobs`, through the Render stage's single
  confirm gate.
- AC7 — Opening an AI-authored project (templates only) shows its composition
  correctly, and saving without edits produces a byte-identical document.

**User outcomes**

- AC8 — **Comprehension.** A Thai-speaking seller who has never used a video
  editor, given only a product and a logo file, places a full-bleed background
  and a logo watermark and reaches a queued final render **without documentation
  and without help**, in ≤10 minutes. Tested with 3 users; 2 of 3 must pass.
- AC9 — **Non-destructive AI.** After hand-placing 5 layers and then running
  auto-draft *and* a `replace` re-plan, all 5 layers still exist and still appear
  at the same absolute second in the rendered output.
- AC10 — **Budget honesty.** No credit-spending stage can start without first
  showing the projected post-stage layer count.
- AC11 — **No dead ends.** At 40/40 the UI offers at least one one-click remedy
  and states in Thai how many layers it reclaims.
- AC12 — **No phantom capability.** Nowhere can a user find a control for
  crossfade, Ken Burns, blur, keyframes, or `motion.camera`.
- AC13 — **Flag-off honesty.** With `remotionRenderVideoJobEnabled` off, the
  editor loads, edits and saves normally, and the render action is disabled with
  a stated reason — never an error at submit.
- AC14 — **Narrow screen.** At 1024px every layer's timing and position remain
  inspectable and editable.
- AC15 — **Recovery.** Any single edit is undoable; a drag is one undo step;
  closing and reopening restores exactly what was on screen.
- AC16 — **Missing asset.** A layer whose source 404s is visibly marked, offers a
  replacement, and blocks final render with a named reason — never a black frame.
- AC17 — **Format change.** Changing fps or aspect ratio on a project with
  hand-authored layers either preserves their absolute timing and relative text
  size, or is refused — never silently shifts them.

---

## 10. Appendix — Capability Matrix (verified 2026-08-03)

| user-facing want | status today | what this spec needs |
|---|---|---|
| full-bleed background, concatenated clips | **SUPPORTED** | Background track UI, `role` field and §4.9.1 repair exemption are implemented. No `trimEndSec` needed — a shorter `durationFrames` truncates. |
| free-positioned overlays, independent timing | **SUPPORTED** | Layer list, inspector, transform overlay and §4.9.2 absolute-time preservation are implemented. |
| image effects (ken burns, blur, filters) | **NOT SUPPORTED** | new Remotion components — P4 |
| text overlays | **SUPPORTED** | Allowlisted fonts are shared by preview/render and Thai font parity is covered by §4.10. |
| logo / watermark | **SUPPORTED** | Library picker, asset walk and checksum verification are implemented by §4.7. |
| subtitles | **SUPPORTED** | Read-only track, budget awareness and font parity (§4.10) are implemented. |
| background music loop | **SUPPORTED** | Volume, timing, looping and fades are persisted and compiled through §4.8. |

---

## 11. As-Built Record (2026-08-03)

P0–P3 are implemented in the working tree. The focused regression suite for
the changed Video Studio surfaces is green; deployment, production load
measurements and the real-user study are tracked separately below.

### P0 — foundation
- **Layer schema:** `name?` / `locked?` / `hidden?` / `role?` added to
  `RemotionLayerBaseSchema` in both copies; `platformContractVersion` bumped
  `2026-07-12` → `2026-08-03`; `packages/remotion-render/dist/` rebuilt; RK1
  sync test added (`shared/remotion/__tests__/layerTemplateSchemasSync.test.ts`,
  compares both files modulo comments). Hidden layers are filtered in
  `compileVideoProject` so they never reach the config or the 40-budget.
- **Ids (§4.12):** new error `VI_DUPLICATE_LAYER_ID`, asserted in `saveDocument`
  via `assertDocumentLayerIdsUnique`. Editor ids use the reserved prefix
  `vsclip_`, which provably cannot collide with `${sceneId}_caption_${i}` /
  `audio_${kind}_${i}_${j}` nor accidentally end in `_cta`.
- **Checksum gate (RK7):** `resolveProjectAssets` now walks `scene.layers[].src`,
  reverses the URL to a storage key, prefers the stored
  `mediaAssets.checksumSha256`, falls back to a same-origin content hash, and
  **fails closed** with `VI_ASSET_UNRESOLVED` rather than emitting the URL-string
  fallback that guaranteed a worker crash.
- **Fonts (RK12):** built `fontAllowlist.ts` (two synced copies + sync test) with
  `["Sarabun","Prompt","Kanit","Noto Sans Thai"]`, emitted `role: "font"`
  manifest sources hashed from the real Google Fonts CSS2 files, and ported the
  `delayRender` font loader into **both** `GenericTemplateComposition` copies.
- **AI contract (§4.9):** safe-area exemption for `role: "background"` and
  full-bleed geometry; both repair handlers skip `locked`;
  `dropDecorativeLayersOverBudget` **removed** and replaced by
  `reportLayerBudgetOverage` (it never deletes — see deviation D-1);
  `rehomeLayersForSceneTimingChange` preserves absolute time across any scene
  retiming; `partitionScenes` predicate is now "no narration and no template".
- **Budget (§4.6):** `computeLayerBudgetBreakdown` mirrors the compiler's total
  exactly (proven by a test that runs the real compiler); the repair applier now
  compares against `compiledTotal`; `getLayerBudget` is non-throwing by design so
  the meter survives brand locks; `getStageEstimate` carries
  `layerBudgetForecast`.
- Preview downscale now scales `fontSizePx`. `/render-jobs` gained a `jobType`
  filter.

### P1 — read-only
`timelineProjection.ts` (pure), `Timeline`/`TimelineRuler`/`TimelineTracks`,
`LayerListPanel`, `LayerBudgetMeter`, `TimelineStagePanel`, the 8th rail stage
`compose` (never renders an `empty` dot), responsive breakpoints, and the §4.13
state set. The preview is the existing `<Player>` over the same
`GenericTemplateComposition` the server renders with — `RemotionProjectPreview`
gained additive `playerRef`/`controls`/`loop` props.

### P2 — editing
`timelineEdits.ts` (pure ops incl. `migrateForFormatChange`),
`useTimelineHistory` (wraps the existing tested `CommandBus`, one drag = one undo
step), `useClipDrag` (algorithms ported from the old NLE, native pointer events,
no dnd dependency), `TransformOverlay` (8 handles + rotate, reusing
`SnapEngine`), `LayerInspectorPanel` (constrains colour/font under brand locks),
editable layer list, Ctrl+Z/Ctrl+Shift+Z, arrow-key nudge, autosave on ~1.5 s
idle with a conflict path that re-applies local layer edits, and an optimistic
compiled-config patch so no recompile happens during a drag.

### P3 — usability
Four launchers wired (background / text / logo / music), a persistent launcher
toolbar, five named presets in `timelinePresets.ts` with client-side safe-area
constants, the `ต่อคลิป` background-concatenation affordance, group drag,
format-change migration behind a confirm in `BriefPanel`, and audio track
controls (level, ducking, span, fades) backed by the new optional
`startMs`/`endMs`/`fadeInMs`/`fadeOutMs` on the `narration` and `music` variants
plus the three compiler call sites that previously overrode them.

### Deviations from the spec, with reasons

- **D-1 — layer-budget overage reports instead of deleting.** §4.9.1 said "prefer
  deleting template-emitted layers". Once the budget count was fixed it became
  clear that *every* entry in `scene.layers[]` is hand-authored by construction —
  template, caption and audio layers are generated fresh by the compiler and
  never stored in the document. There was therefore no safe deletion candidate
  left, so the handler reports the overage through `ApplyRepairsResult.notes`
  instead. This is strictly safer than the spec's original instruction.
- **D-2 — the CTA preset avoids the `_cta` id suffix.** `addLayer` already guards
  against producing it, and the brand CTA lock has no UI, so opting in would have
  meant fighting an existing safety guard for no reachable benefit.
- **D-3 — no mute boolean for audio tracks.** The schema has none; the `-60 dB`
  floor is labelled `ปิดเสียง`. A remembered-previous-volume toggle was rejected
  because that state has no home in the persisted document and would desync from
  `gainDb` on autosave, undo, or a second tab.
- **D-4 — audio spans are edited numerically, not by dragging.** `useClipDrag`
  is built around `LayerRef` (scene-relative, with an owning scene); audio tracks
  are document-level with no owning scene. A second parallel gesture engine for
  one row was disproportionate. Inspector `NumberInput`s have min/max wired to
  the resolved bounds so an invalid span cannot be entered.
- **D-5 — `platformContractVersion` was bumped even though it does not fully
  protect.** An old worker parsing a payload that *uses* the new fields fails
  Zod's strict-unknown-key check **before** the version-equality gate runs. That
  ordering is a pre-existing architectural gap, not something this change
  introduced. The bump was still made because it is the spec's stated policy and
  the correct drift signal for payloads that do reach the version check.

### Still open after this feature

`duplicateProject` is implemented with owner-scoped cloning and reset lifecycle
pointers; the workspace now exposes stage approval/rejection actions with a
persisted rejection reason; and `automationMode` is an explicit Guided/Manual
project setting. Catalog identity facts now reach the compiler and the
product-fidelity lock fails closed when product IDs or reference images are
missing/mismatched. Catalog
text is marked as untrusted evidence at the planning, narration and QA LLM
boundaries. The unused `videoEditorProjectId` bridge column was removed with an
idempotent migration, and the existing schema-copy equality test remains the
RK1 guard. No proxy media is generated, so §4.16's performance budget is
asserted by construction (virtualized rows, no recompile during drag) rather
than measured under load; AC8 (the 3-user comprehension test) has not been run
— it requires real users, not a test suite. P4 (Ken Burns, scene transitions)
remains a separate deferred scope; `@remotion/transitions` is already a
dependency and is used by `MarketplaceAutoReviewComposition` as an in-repo
reference.
