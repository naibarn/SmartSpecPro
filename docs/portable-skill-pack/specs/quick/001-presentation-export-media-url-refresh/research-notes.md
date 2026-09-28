# Research notes

## Codebase scan

- `apps/web/server/routes/slideRender.ts` has
  `resolveRenderMediaUrl()` and `prepareSlideContentForRender()`. Managed
  `/api/storage/files/` and `/uploads/` references are normalized and passed to
  `storagePresignGet(key, 3600)` on every route request.
- `python-backend/app/tasks/presentation_render.py` has duplicated screenshot
  and video-clip navigation loops. Both use `_make_slide_token()`,
  `_poll_slide_ready()`, and fail when `mediaDegraded` is true, but neither
  retries a media failure with a new page/request.
- Celery task-level autoretry covers selected OS/subprocess exceptions, not a
  slide-level readiness failure and not a direct `RuntimeError` media error.
- Existing tests already model Playwright response status as an integer
  property and cover the fail-closed `E_SLIDE_MEDIA_DEGRADED` path.

## Runtime/data evidence

- Local deck 449 slide 0 stores a managed R2 PNG URL and has a ready
  `media_assets` row.
- R2 `HEAD` returned `image/png` and 1,742,664 bytes; a fresh presigned URL was
  generated.
- Local route + Playwright with the same deck returned 200, decoded the image,
  and reported `mediaDegraded=false`.
- The running presentation worker advertises
  `INTERNAL_RENDER_BASE_URL=http://host.docker.internal:3000`; that hostname is
  not resolvable from the current host shell. This is an operational gate and
  must not be silently changed in source.

## Security/boundary scan

- Internal render tokens are slide-scoped and sent in headers.
- The slide-render route restricts network origin and token scope.
- Arbitrary direct URLs must not become a new server-side fetch/SSRF path.
- Missing objects and authorization failures must remain terminal.
