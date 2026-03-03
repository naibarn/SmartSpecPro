# Research Notes

## Codebase Recon

### Scope Interpreted
Primary scope from `spec.md` is stabilization for:
- Auto Layout reliability with high media count
- SVG parity across Editor / Play / Export
- Video parity across Play Mode / Export
- MP4 white pre-roll reduction
- Worker runbook hardening

### Architecture & Module Boundaries

1. Editor / Play UI
- `apps/web/client/src/pages/PresentationEditor.tsx`
  - has preview overlay player + Auto Layout orchestration (`relayoutSlide` mutation)
- `apps/web/client/src/pages/PresentationPlayMode.tsx`
  - production play route: `/presentation/:itemId/play`
  - uses `CanvasStage` read-only with `autoPlayVideos={true}`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
  - owns element rendering + local video playback map and toggles

2. Auto Layout backend
- `apps/web/server/routers/presentation.ts` -> `presentation.ai.relayoutSlide`
- `apps/web/server/services/aiPresentationService.ts`
  - `relayoutExistingSlide`
  - preservation + fallback placement logic:
    - `buildRelayoutPreservedElements`
    - `layoutPreservedMediaElements`
    - `mergeRelayoutElementsWithPreserved`

3. Play/Export payload & queue
- `apps/web/server/services/presentationPlaybackExport.ts`
  - `buildSlideshowPayload`, `buildPlayDeckPayload`, `buildPresentationRenderSpec`, `triggerPresentationExport`
  - determines `hasDynamicVideo` for MP4
- `apps/web/server/services/presentationExportDegradation.ts`
  - export warning/degradation policy (currently treats `video` as unsupported)

4. Internal render path for exporter
- `apps/web/server/routes/slideRender.ts`
  - secured internal route `/internal/slide-render/:deckId/:slideIndex`
  - renders slide HTML and sets `window.__slideReady`

5. Python worker rendering
- `python-backend/app/tasks/presentation_render.py`
  - screenshot mode and dynamic record mode
  - clip trim + ffmpeg compose + upload

### Existing Test Coverage (Relevant)

1. Strong/Existing
- `apps/web/server/services/presentationPlaybackExport.test.ts`
  - dedupe/throttle/schema/warnings + `hasDynamicVideo`
- `apps/web/server/routes/slideRender.test.ts`
  - token scope/internal access + HTML behavior in screenshot/record mode
- `python-backend/tests/test_presentation_render_task.py`
  - JWT header safety, dynamic clip path, ffmpeg flow, timeout handling
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`
  - relayout preservation scenarios incl many media elements

2. Gaps/Weak Areas
- `PresentationPlayMode.test.tsx` is heavily mocked (CanvasStage mocked), so real browser video autoplay behavior is not validated
- No integration-level assertion that exported MP4 contains real motion frames and no long white pre-roll
- No explicit regression test for SVG file (`.svg` src) rendering parity across play/export output
- Export degradation tests currently encode legacy policy where `video` may still produce `SLIDE_ELEMENT_UNSUPPORTED`

### Data Model / Migration Risk

1. Current tables already support core stabilization work
- `presentation_decks`, `presentation_slides`, `presentation_exports`
- `audioTrack` (slide) and `projectAudioTrack` (deck) already present

2. Migration requirement for Wave 0-5 stabilization
- **Risk classification: none to low**
- Most work is logic + renderer + tests, not schema expansion
- Potential schema touch only if warning codes are expanded in shared contracts

### Tenant, Permission, Security Controls (Current)

1. Tenant/user scoping
- Router builds actor from tenant context (`toPresentationActor`)
- Service layer enforces tenant and permission checks via library permissions
- Export status/cancel are tenant+user scoped in `presentationPlaybackExport.ts`

2. Internal render security
- `slideRender.ts` enforces:
  - internal IP range
  - scoped JWT (`internal:slide-render`)
  - claim match on `deckId` + `slideIndex`

3. Export API gatekeeping
- feature flags: presentation enabled, export write enabled
- rate limits / dedupe / idempotency controls in export service

### Key Risks Detected

1. Play path divergence risk
- Editor preview overlay and dedicated PlayMode are separate UI paths; fixes in one path can miss the other.

2. Degradation-policy mismatch risk
- `presentationExportDegradation.ts` currently allows only `text,image,rect,line`; this can conflict with dynamic video export capability and create misleading warnings.

3. Determinism risk in Auto Layout
- Editor currently passes `layoutSeed: Date.now() + index`; deterministic replay requires explicit fixed seed policy for tests/repro.

4. Pre-roll reliability risk
- readiness timeout and fallback behavior span Node route + Python worker + ffmpeg trim, so single-layer fixes are fragile.

### Initial Recommendations for Planning

1. Treat PlayMode and Editor preview as dual-target acceptance for video/svg fixes.
2. Add contract-level decision for warning codes before implementing degradation changes.
3. Define deterministic seed and overlap thresholds in tests, not only prose.
4. Add at least one integration test path for export output quality checks (motion + pre-roll threshold).

## Web Research

Selection: `apply_all` (user-selected on 2026-03-03)

### Topic 1: Auto-layout determinism and dense-media collision handling

Rationale:
- Recon identified deterministic replay and overlap control as high regression risks in `aiPresentationService` layout flow.

Findings:
- Rectangle packing remains heuristic in practice; common stable approaches rely on deterministic ordering + fixed heuristic choice instead of random placement.
- `MaxRects`-style packing is widely used for practical density/quality tradeoffs and supports deterministic outputs if input order and heuristic are fixed.
- Collision handling benefits from an explicit overlap-force/repel pass after initial packing for outlier cases rather than re-randomizing full layout.

Sources:
- https://github.com/juj/RectangleBinPack
- https://d3js.org/d3-force/collide

### Topic 2: SVG parity across editor/play/export

Rationale:
- Spec explicitly targets inline `svgContent` and `.svg` file paths; current white-block artifact indicates renderer/path differences.

Findings:
- SVG-as-image has browser security constraints (no script/external resource behavior in image context), so editor/play/export must use the same image-mode assumptions.
- `currentColor` behavior depends on CSS/attribute inheritance context, so parity requires consistent wrapper styles between renderers.
- SVG color behavior should be normalized in one transform step before rendering to avoid path-specific output drift.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/color

### Topic 3: Reliable video autoplay in slide players

Rationale:
- Play Mode regression is recently fixed manually; needs robust cross-browser policy to prevent recurrence.

Findings:
- Chrome policy allows muted autoplay but blocks sound-first autoplay unless user engagement criteria are met.
- MDN autoplay guidance aligns: use muted/default-muted + explicit fallback handling for blocked `play()` promises.
- Stable slide transitions should keep a deterministic lifecycle: attach source -> set muted/inline policy -> `play()` -> observe `playing`/error.

Sources:
- https://developer.chrome.com/blog/autoplay
- https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay

### Topic 4: Slide-ready gating + MP4 pre-roll elimination in headless capture

Rationale:
- White pre-roll risk spans readiness signaling and recording/trim behavior across Node route + worker pipeline.

Findings:
- Puppeteer/Playwright both support explicit app-level readiness waits (`waitForFunction`) and discourage relying only on generic load states for app-render completion.
- Readiness should be tied to concrete DOM/media conditions (e.g., `window.__slideReady` + video frame-ready signal) before record start.
- FFmpeg trim strategy should be deterministic and testable (time-based trim plus verification pass), with retry once on readiness timeout before degrade.

Sources:
- https://pptr.dev/api/puppeteer.page.waitforfunction
- https://playwright.dev/docs/api/class-page
- https://ffmpeg.org/ffmpeg-all.html

### Topic 5: Export warning taxonomy alignment with true capability

Rationale:
- Recon found mismatch between actual video export support and current degradation warnings.

Findings:
- Warning payloads should have stable machine-readable fields (`type`, `title`, `detail`, optional extension fields) to prevent UI ambiguity and preserve backward compatibility.
- Capability warnings should distinguish unsupported vs degraded-via-fallback vs retried-timeout cases, not collapse into one generic code.
- A typed warning contract reduces regression risk when renderer capability expands (e.g., video/svg support changes).

Sources:
- https://www.rfc-editor.org/rfc/rfc9457
