# Research Notes

## Codebase Recon

### 1) Architecture and module boundaries (Text Clip path)

- Editor composition is centered in `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`.
- Text authoring UI exists in `apps/web/client/src/components/videoeditor/TextClipEditor.tsx` and is opened from sidebar view `text`.
- Timeline rendering/interaction is in `apps/web/client/src/components/videoeditor/Timeline.tsx`.
- Preview playback is in `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`.
- Project persistence/validation is in `apps/web/client/src/services/projectManager.ts` and server router `apps/web/server/routers/videoEditorProjects.ts` backed by `apps/web/drizzle/schema.ts` table `video_editor_projects`.
- Render request contract conversion is in `apps/web/shared/types/mediaJob.ts` (`projectToTimeline`).
- FFmpeg execution for render jobs is in `python-backend/app/tasks/media_job_worker.py`.

### 2) Existing Text Clip implementation status

- Text track exists by default: `createEmptyProject()` creates `T1` as track type `text` (`apps/web/client/src/types/videoEditor.ts`).
- Add Text flow exists:
  - `handleAddTextClip()` creates clip with `textConfig` and inserts into `T1` (`apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`).
- Timeline has partial text awareness:
  - treats text tracks as overlay-like for styling and displays text snippet from `clip.textConfig.text` (`apps/web/client/src/components/videoeditor/Timeline.tsx`).
- Track move guards already restrict text clips to text tracks (`apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`).

### 3) Current gaps vs spec scope (T1 Text Clip only)

1. **Project validation rejects text tracks**
- `validateProjectStructure()` currently allows only `video|audio|overlay`, missing `text` (`apps/web/client/src/services/projectManager.ts`).
- This is a high regression risk for save/load once text clips are persisted.

2. **Preview does not render text clips**
- Active preview clip selection scans only `video|overlay` tracks, not `text` (`apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`).
- `PreviewPlayer.tsx` contains no text rendering path (`textConfig` not referenced).

3. **Render contract drops text semantics**
- `projectToTimeline()` maps track type `text` -> `subtitle`, but `MediaClip` has no text payload/style fields and only carries generic transform/trim fields (`apps/web/shared/types/mediaJob.ts`).
- `timelineToProject()` maps `subtitle` back to `video`, which loses explicit text track semantics.

4. **Worker render path ignores subtitle/text tracks**
- FFmpeg command builder collects only tracks of type `video|overlay` into `video_clips` (`python-backend/app/tasks/media_job_worker.py`).
- No drawtext/subtitle burn-in path for T1 text clips in `render_mp4_h264`.
- `subtitles_burnin` handler remains not implemented.

5. **Text style feature mismatch with target spec**
- Existing `TextClipEditor` supports text/font/color/effects and duration but does not cover full target controls (e.g. explicit preset groups, line-height, letter-spacing, underline, flip transforms, text keyframe UX).

### 4) Existing tests and coverage gaps in impacted paths

- Frontend videoeditor tests exist mainly for silence/keyframe utility/preview modes.
- Only limited text-related test observed: text clip splitting behavior in silence export utility (`apps/web/client/src/components/videoeditor/__tests__/silenceExportToTimeline.test.ts`).
- No dedicated tests found for:
  - `TextClipEditor` behavior
  - text clip preview rendering
  - text clip render contract conversion
  - text clip FFmpeg render output
- Backend render tests currently focus on static transform behavior, not text overlay rendering (`python-backend/tests/unit/test_media_job_render_transform.py`).

### 5) Database schema dependencies and migration risk

- `video_editor_projects.projectData` is JSON, so adding text fields in payload is schema-flexible (`apps/web/drizzle/schema.ts`).
- No mandatory relational migration is required for base Text Clip scope if data remains inside JSON.
- Main risk is **application-level validation and compatibility**, not DB DDL.
- Risk classification for DB change: `none` (for current scope).

### 6) Tenant attribution, permissions, and security controls

- `videoEditorProjects` router uses `protectedProcedure` and `userId` ownership filters on CRUD (`apps/web/server/routers/videoEditorProjects.ts`).
- Isolation model is user-scoped for this feature path; no explicit `tenantId` column on `video_editor_projects`.
- For current scope, auth/ownership controls are present; cross-user access risk is mitigated by row-level `userId` checks in each route.

### 7) Recon summary (planning impact)

- The highest-impact blockers for T1 Text Clip completion are contract and render parity gaps:
  1. validation acceptance for `text` tracks
  2. preview rendering of text clips
  3. timeline/job contract carrying text payload
  4. worker rendering of text overlays
- Testing strategy must add end-to-end text parity coverage (editor -> saved project -> render output), otherwise regressions are likely.

## Web Research

### Topic: render_text_ffmpeg

- Rationale: Rendering text clips in worker currently has no implementation; we need supported FFmpeg primitives for style, animation, and line breaking.
- Findings:
  - `drawtext` supports text content, font selection, `fontcolor`, `fontsize`, `alpha`, `line_spacing`, `text_align`, box/background, and expression-driven positioning for `x`/`y`.
  - `subtitles` filter (libass) supports style overrides via `force_style`, custom fonts via `fontsdir`, and Unicode wrapping behavior with `wrap_unicode`.
  - FFmpeg expression evaluation includes `if`, `between`, `clip`, and `lerp`, which are usable for normalized keyframe interpolation math.
- Sources:
  - https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
  - https://ffmpeg.org/ffmpeg-filters.html#subtitles-1
  - https://ffmpeg.org/ffmpeg-utils.html#Expression-Evaluation

### Topic: preview_render_parity

- Rationale: Spec requires preview and final render parity for text; parity often breaks on font loading, alignment, and fallback behavior.
- Findings:
  - Browser-side text metrics should only be treated as stable after `FontFaceSet.ready` resolves.
  - Canvas text behavior is controlled by context state (`font`, `textAlign`, baseline/direction); this should be mapped explicitly to render payload fields to avoid implicit defaults.
  - FFmpeg `drawtext` uses font selection rules where unspecified fonts can fall back, so render path should pin exact font files/families used by preview.
- Sources:
  - https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready
  - https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillText
  - https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/measureText
  - https://ffmpeg.org/ffmpeg-filters.html#drawtext-1

### Topic: keyframe_interpolation

- Rationale: Spec requires linear/ease-in/ease-out/ease-in-out for text transform keyframes with deterministic behavior.
- Findings:
  - Web easing keywords are standardized and map to cubic-bezier curves (for preview semantics).
  - FFmpeg expression engine can compute per-frame progress and piecewise interpolation, allowing deterministic keyframe transforms from stored easing metadata.
  - Practical plan direction: normalize clip-local time to `[0..1]`, compute eased progress, then `lerp` each transform component.
- Sources:
  - https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function
  - https://www.w3.org/TR/css-easing-2/
  - https://ffmpeg.org/ffmpeg-utils.html#Expression-Evaluation

### Topic: text_layout_typography

- Rationale: Feature scope includes line-height, letter-spacing, alignment, and multi-line text; layout differences are a major parity risk.
- Findings:
  - Browser semantics for alignment and line-height are defined and should be represented explicitly in text config.
  - FFmpeg `drawtext` includes `line_spacing` and alignment controls, but capability differs from full browser layout; unsupported style combinations should be constrained or documented.
  - For subtitle-based rendering paths, `wrap_unicode` behavior can materially affect multiline wrapping and should be considered in parity tests.
- Sources:
  - https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textAlign
  - https://developer.mozilla.org/en-US/docs/Web/CSS/line-height
  - https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
  - https://ffmpeg.org/ffmpeg-filters.html#subtitles-1

### Topic: validation_schema_design

- Rationale: Scope requires backward-compatible defaults and strict validation for text payload/keyframes.
- Findings:
  - Zod supports defaults and optional fields, which fits legacy-project loading where missing optional text fields must be safely defaulted.
  - For object shape hardening, unknown-key behavior should be chosen explicitly (`strictObject` vs strip), and nested schemas can use safe extension patterns.
  - Implementation direction: separate schemas for persisted clip payload vs editor-form input, then normalize to canonical persisted structure before save/render conversion.
- Sources:
  - https://zod.dev/api?id=defaults
  - https://zod.dev/api?id=objects
  - https://zod.dev/api?id=strictobject
  - https://zod.dev/api?id=safeextend

## Testing

### Frameworks and commands

- Frontend (`apps/web`): Vitest is the active runner (`package.json` `test` script).
- Frontend test command: `cd apps/web && npm test` (runs `vitest run` with test JWT env).
- Backend (`python-backend`): pytest with marker-based categorization and coverage enforcement.
- Backend test command: `cd python-backend && uv run pytest` (or `pytest` in an activated env).

### Locations and naming conventions

- Frontend tests are colocated and/or under `__tests__` with `*.test.ts` / `*.test.tsx` patterns.
- Backend tests are under `python-backend/tests` with `test_*.py` naming (`pytest.ini`).

### Useful existing patterns for this feature

- Frontend has existing video editor tests under `apps/web/client/src/components/videoeditor/__tests__`.
- Backend render behavior tests exist under `python-backend/tests/unit`, including transform-focused worker tests.
- Both stacks already use targeted unit tests and can add feature-focused fixtures without introducing new test frameworks.
