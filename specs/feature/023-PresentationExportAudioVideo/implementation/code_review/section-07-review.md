# Section-07 Code Review: Python Celery Render Task

**Verdict: NEEDS WORK**
**Date:** 2026-02-24

---

## HIGH

**H-1: PDF generation deviates from plan — uses Pillow rasterization instead of Playwright page.pdf()**
- Plan explicitly specifies: "For each slide, open the screenshot PNG in a new Playwright page and call `page.pdf()`."
- Implementation uses `PillowImage.open(png_path).save(slide_pdf_path, 'PDF', resolution=150)` instead.
- Pillow rasterizes at 150 DPI: text is not selectable, vector graphics are destroyed, output is low-resolution for print.
- Playwright `page.pdf()` produces proper vector-aware PDFs with selectable text.
- **Requires user decision:** Accept quality downgrade for simplicity, or implement per spec?

**H-2: _upload_output returns permanent public URL, not 48-hour presigned URL**
- Plan: "Generate a 48-hour presigned GET URL."
- `R2StorageService.upload_file()` returns `self.get_public_url(key)` — an unrestricted permanent public URL with no expiry.
- `generate_presigned_url()` is never called in `_upload_output`.
- Exports may contain proprietary presentation content. Permanent public URLs violate the security model.
- **Requires user decision:** Enforce time-limited presigned URLs, or accept permanent public URLs?

**H-3: _run_async is a degraded copy — missing the running-loop deadlock guard from media_tasks.py**
- `media_tasks.py` first calls `asyncio.get_running_loop()` to detect an already-running event loop, raising `RuntimeError` instead of deadlocking.
- The copy in `presentation_render.py` omits this guard and jumps straight to `asyncio.get_event_loop()`.
- Plan says: "Import `_run_async` from `app.tasks.media_tasks` or copy the pattern." The copy is incomplete.
- Fix: Use `from app.tasks.media_tasks import _run_async` directly.

**H-4: R2 key path not sanitized — potential path traversal in R2 key namespace**
- `key = f"presentation-exports/{deck_id}/{task_id}.{ext}"` — `deck_id` comes from an unvalidated Redis message.
- A malformed `deck_id` like `"../../admin"` would traverse outside the expected key prefix.
- `_safe_path_component()` helper exists in `r2_storage.py` for this purpose.
- Fix: Apply `str(int(deck_id))` (or coerce to safe string) before building the key.

---

## MEDIUM

**M-1: Browser context/browser not closed on screenshot exception — memory leak**
- `context.close()` and `browser.close()` at the end of `_render_slides_to_screenshots` are only reached in the happy path.
- If `page.screenshot()` raises, the exception exits the loop, skipping both close calls.
- On a 2-concurrent-worker setup (~500MB per browser), two leaked contexts can exhaust worker memory.
- Fix: Wrap the screenshot loop in `try/finally` so `context.close()` and `browser.close()` are called unconditionally.

**M-2: FFmpeg subprocess has no timeout — immune to Celery SoftTimeLimitExceeded**
- `subprocess.run(cmd, check=True, capture_output=True)` has no `timeout=` argument.
- `subprocess.run` is a blocking C-level syscall that cannot be interrupted by Celery's Python signal.
- A hung FFmpeg process will block the worker past the 11-minute soft limit.
- Fix: Add `timeout=540` (or similar budget) and catch `subprocess.TimeoutExpired`.

**M-3: Audio track mixing silently ignored — presentations with audio produce silent MP4**
- Plan specifies FFmpeg audio mixing with per-slide atrim/afade and projectAudioTrack amix filter.
- `_build_mp4` ignores all audio fields with no error, warning, or log entry.
- **Requires user decision:** Raise `NotImplementedError` when audio tracks are non-null, or silently drop audio?

**M-4: Hardcoded `-r 30` overrides `fps` from render_spec**
- `_build_mp4` passes both `-vf f"fps={fps}"` and `-r "30"` — conflicting fps directives.
- If `fps=60` is requested, output is silently capped at 30fps.
- Fix: Remove the hardcoded `-r "30"` line.

**M-5: Missing test for _build_pdf — explicitly required by plan**
- Plan specifies `def test_pdf_output_uses_pypdf_writer(...)`.
- No test exercises `_build_pdf()` at all.
- Fix: Add `TestBuildPdf` class.

**M-6: No input validation on render_spec — bare KeyError deep inside helpers**
- Missing keys like `deckId`, `slides` produce opaque `KeyError` traces in Celery FAILURE state.
- Fix: Validate required fields at task entry point with descriptive `ValueError`.

---

## LOW

**L-1: `import asyncio` deferred inside _run_async function body**
- Should be at module top level per convention.
- Fix: Move to top-level imports.

**L-2: Tests use fragile internal Celery API — `.run.__func__`**
- `render_presentation.run.__func__` is an undocumented Celery internal.
- The tests work but could break on Celery upgrades.
- Low priority; keep for now but note.

**L-3: `assert final_percent <= 75` is too loose — should be `== 75`**
- The formula guarantees exactly 75 for the last slide.
- Fix: `assert final_percent == 75`.

**L-4: `@pytest.mark.slow` class `TestEndToEndRenderPipeline` absent**
- Plan specifies four slow tests; none are present.
- The two non-audio tests (`test_3_slide_png_zip`, `test_concat_file_valid_ffmpeg_format`) can be written now.

**L-5: `pypdf` and `Pillow` imported lazily inside format builder functions**
- Move to top-level imports for earlier error detection.

---

## Items Requiring User Decision

1. **H-1/D-1**: PDF — Pillow rasterization (simpler) vs Playwright `page.pdf()` (per spec, vector quality)?
2. **H-2/D-3**: Presigned URL — permanent public URL (simpler) vs 48-hour presigned URL (per plan security model)?
3. **M-3/D-2**: Audio tracks — `NotImplementedError` when present, or silently drop?
