# Implementation plan

## Objective

Implement a source-aware, deterministic media naming policy for new image/video assets. Wire it through generation metadata, Gallery publication, Library publication where source metadata is available, and explicit public Gallery downloads.

## Current-codebase fit

Use a pure shared module under `apps/web/shared/` for task-shape extraction, naming precedence, title truncation, extension handling, and filename sanitization. Keep database and worker protocols unchanged. The existing app-only `extra_params` allowlist is the narrow metadata transport boundary for provider media tasks.

## Sections and ownership

1. **Shared naming contract**
   - Add the shared resolver and tests.
   - Define structured fields for explicit title, series title, episode, shot, clip, source filename, prompt, and media type.
   - Return display title plus safe download filename.

2. **Source metadata propagation**
   - Extend the persisted internal extra-parameter allowlist with naming fields.
   - Add naming fields at Vertical Drama image/video/assembly call sites that already know series/episode/shot/clip context.
   - Ensure fields are not provider prompt semantics and do not change the technical assembly filename.

3. **Publication and client integration**
   - Replace the raw prompt title in Media History Add to Gallery with the resolver.
   - Update `apps/web/server/services/mediaLibraryService.ts` so new task-to-Library items use the resolver instead of the model-based default title; retain caller-provided titles and existing item titles.
   - Keep the full prompt in Gallery description.

4. **Download integration and verification**
   - Add an explicit download indicator to the public Gallery media route.
   - Set a safe `Content-Disposition` filename only for downloads; retain inline/range behavior for playback.
   - Update Gallery download URL construction and add focused route/client tests.

## Naming behavior

Precedence: explicit display title, structured Vertical Drama fields, source filename/title, cleaned prompt prefix, technical fallback. A Vertical Drama shot uses `series title ตอนที่ N-S` with optional `คลิป C`; an assembled episode uses `series title ตอนที่ N`. Extensions are `.png` for images and `.mp4` for videos unless a trusted source extension is available.

## Security and boundaries

- Sanitize path separators, control characters, quotes, and excessive length before putting a name in a response header; emit a standards-compatible Unicode filename with a conservative ASCII fallback when needed.
- Never use a provider URL, signed query string, task ID, or arbitrary user metadata as a path.
- Keep Gallery admin authorization and tenant/public authorization unchanged.
- App-only metadata must not alter provider prompts or model input.

## Failure handling

- Missing metadata falls back deterministically to prompt/source filename.
- Missing/invalid extension falls back from media type; never derive an extension from an untrusted query string.
- Empty or unsafe title falls back to `image`/`video` plus a stable short identifier only as a last resort.
- Download filename errors must not prevent media playback or Gallery publication.

## Acceptance criteria

- New VD generated/published media no longer uses `remotion_render_mp4` as its user-facing title when structured metadata exists.
- New Gallery items are searchable by series and episode keywords.
- Explicit downloads receive a title-derived filename, while normal video requests remain range-enabled and inline.
- Existing rows and storage keys are unchanged.

## Rollout and verification

Run resolver tests, Media History/Gallery tests, public Gallery route tests, and focused web typecheck. Report full-workspace typecheck separately if unrelated baseline failures remain.
