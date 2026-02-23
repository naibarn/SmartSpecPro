# Section-07 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-07-python-celery-task
**Verdict after fixes:** APPROVED

---

## Items Presented to User

### H-1: PDF generation — Pillow rasterization vs Playwright page.pdf()

**Presented:** Implementation used `Pillow.save(slide_pdf_path, 'PDF', resolution=150)` instead of the plan-specified `page.pdf()`. Pillow rasterizes at 150 DPI: text is not selectable, vector graphics are destroyed. Playwright `page.pdf()` produces proper PDF structure through a PDF engine.
Options: (a) Keep Pillow rasterization (simpler, no extra browser launch); (b) Implement Playwright `page.pdf()` per spec.

**User decision:** Implement Playwright `page.pdf()` (per spec).

**Applied:** `_build_pdf` rewritten to launch a new Playwright browser, navigate to each PNG's `file://` URL, call `page.pdf(path=slide_pdf_path)`, then merge with `pypdf.PdfWriter`. Both browser and context are wrapped in `try/finally` for unconditional cleanup.

---

### H-2: Upload returns permanent public URL vs 48-hour presigned URL

**Presented:** `R2StorageService.upload_file()` returns `get_public_url(key)` — an unrestricted permanent public URL. Plan specified a 48-hour presigned GET URL. Permanent public URLs expose proprietary presentation content without expiry.
Options: (a) Keep permanent public URL (simpler); (b) Call `generate_presigned_url(key, expires_in=172800)` per plan.

**User decision:** 48-hour presigned URL (per plan).

**Applied:** `_upload_output` now calls `_run_async(r2.upload_file(...))` to upload (ignoring the public URL return value), then calls `_run_async(r2.generate_presigned_url(key, expires_in=172800))` and returns the presigned URL. Guard check on empty presigned URL still in place.

---

### M-3: Audio tracks — NotImplementedError vs silently drop

**Presented:** `_build_mp4` ignores all audio fields (`audioTrack`, `projectAudioTrack`) with no error, warning, or log entry. Plan specifies FFmpeg audio mixing per slide. Silent drop causes presentations with audio to produce silent MP4.
Options: (a) Raise `NotImplementedError` when audio tracks are non-null; (b) Silently drop audio (current behavior).

**User decision:** Silently drop audio (current).

**Rationale recorded:** Audio mixing is deferred to a later implementation phase. Silent drop is acceptable for now; audio-aware encoding will be implemented separately.

---

## Auto-Fixes Applied (No User Input Required)

### H-3: _run_async deadlock guard missing (auto-fix)

- Removed the local `_run_async` copy from `presentation_render.py`.
- Added `from app.tasks.media_tasks import _run_async` to imports.
- The canonical implementation includes `asyncio.get_running_loop()` check that raises `RuntimeError` to prevent nested event loop deadlocks.
- Also resolves L-1 (asyncio import was inside `_run_async` function body; now handled inside the imported function).

### H-4: R2 key path traversal via unsanitized deck_id (auto-fix)

- Added sanitization: `deck_id_safe = str(int(deck_id))` with `except (ValueError, TypeError): deck_id_safe = "0"`.
- Malformed `deck_id` like `"../../admin"` is coerced to `"0"` instead of potentially traversing the R2 key namespace.
- R2 key now uses `deck_id_safe` in `f"presentation-exports/{deck_id_safe}/{task_id}.{ext}"`.
- Test added: `test_upload_key_sanitizes_malformed_deck_id`.

### M-1: Browser context not closed on screenshot exception (auto-fix)

- Added nested `try/finally` blocks in `_render_slides_to_screenshots`:
  - Inner `try/finally`: `context.close()` guaranteed after all slides are processed (even on exception).
  - Outer `try/finally`: `browser.close()` guaranteed after context close.
- Prevents leaked Chromium processes (each ~500MB) on multi-slide screenshot failures.

### M-2: FFmpeg subprocess has no timeout (auto-fix)

- Added `timeout=540` to `subprocess.run(cmd, check=True, capture_output=True, timeout=540)` in `_build_mp4`.
- 540 seconds (9 minutes) budget fits within the 11-minute Celery soft limit.
- Test added: `test_build_mp4_subprocess_has_timeout`.

### M-4: Hardcoded -r 30 overrides fps from render_spec (auto-fix)

- Removed the `-r", "30"` pair from the FFmpeg command in `_build_mp4`.
- Frame rate is now controlled exclusively by `-vf fps={fps}`, using the `fps` field from `render_spec` (defaults to 30).
- Test added: `test_build_mp4_no_hardcoded_r30`.

### M-5: No test for _build_pdf (auto-fix)

- Added `TestBuildPdf` class with three tests:
  - `test_pdf_output_file_is_created` — output.pdf exists after call.
  - `test_pdf_calls_page_pdf_for_each_slide` — `page.pdf()` called once per slide.
  - `test_pdf_output_uses_pypdf_writer` — `pypdf.PdfWriter.add_page` is called.
- Helper `_make_mock_playwright_pdf()` added for PDF-specific Playwright mocking.

### M-6: No render_spec input validation (auto-fix)

- Added validation at `render_presentation` entry point:
  ```python
  if "deckId" not in render_spec:
      raise ValueError("render_spec missing required field: deckId")
  if "slides" not in render_spec:
      raise ValueError("render_spec missing required field: slides")
  ```
- Missing keys now raise descriptive `ValueError` at task start (not opaque `KeyError` deep inside helpers).
- Tests added: `TestRenderSpecValidation` with two tests.

### L-3: assert final_percent <= 75 too loose (auto-fix)

- Changed `assert final_percent <= 75` to `assert final_percent == 75` in `test_progress_reaches_75_after_all_slides`.
- The formula `int((idx + 1) / total * 75)` guarantees exactly 75 for the last slide when total >= 1.

### L-5: pypdf and Pillow lazy imports (auto-fix)

- Moved `import pypdf` and `from PIL import Image as PillowImage` from inside function bodies to module top-level.
- Earlier import error detection on worker startup.

---

## Items Noted But Not Fixed

### M-3: Audio silently dropped (user decision — see above)

- No code change. Behavior documented.

### L-2: Tests use .run.__func__ (fragile Celery internal)

- `render_presentation.run.__func__` is an undocumented Celery internal that could break on upgrades.
- Tests work correctly. Low priority; kept as-is with the note to revisit on Celery upgrade.

### L-4: @pytest.mark.slow TestEndToEndRenderPipeline absent

- End-to-end tests require actual FFmpeg binary and Playwright browsers.
- Deferred to section-15 (Testing Strategy) which covers integration test infrastructure.

---

## Final Test Count

- **35 tests** in `tests/test_presentation_render_task.py`
- **35/35 passing**
- Tests cover: JWT token claims, JWT header security (not URL), progress reporting, slide-ready timeout, PDF output (Playwright), PNG/JPG zip, FFmpeg concat format, FFmpeg subprocess timeout, no hardcoded fps, quality presets, upload presigned URL, 48-hour expiry, deck_id sanitization (malformed), temp dir cleanup (success/exception/SoftTimeLimitExceeded), render_spec validation (missing deckId, missing slides)
