# Code Review: Section 03 — Google Slides Importer

## HIGH SEVERITY

### H1: Blocking I/O in async method — event loop blocked on every import
**File:** `python-backend/app/services/gslides_importer.py`, lines 153-157

`presentations().get(presentationId=...).execute()` is a synchronous blocking call from `googleapiclient`. It is invoked inside `async def import_presentation` with no thread-pool offload (`asyncio.to_thread` or `run_in_executor`). This blocks the entire asyncio event loop for the duration of the API round-trip. Fix: wrap with `await asyncio.to_thread(...)`.

### H2: Images inside group children never pre-fetched — silently skipped
**File:** `python-backend/app/services/gslides_importer.py`, lines 216-221

`_prefetch_images` iterates only `presentation['slides'][*]['pageElements']` (the top-level element list). It does NOT recurse into `elementGroup.children`. Any image element nested inside a group will never be added to `image_pairs`, so `downloaded_images` will not contain its `objectId`. When `_parse_image_element` does `downloaded_images.get(object_id)` it gets `None`, and the image is silently skipped with a fidelity warning "Image download failed — skipped". A presentation with grouped images will lose all images in groups. The spec says to collect every `contentUrl` across all slides — the intent clearly includes nested elements. No test covers this scenario.

### H3: Unbounded concurrency in asyncio.gather — potential resource exhaustion
**File:** `python-backend/app/services/gslides_importer.py`, lines 229-231

`asyncio.gather(*[_download_image(url, access_token) for url in urls])` fires all downloads simultaneously with zero concurrency limit. A presentation with 100+ images launches 100+ simultaneous HTTP connections. This can exhaust file descriptors, trigger Google API rate limiting (429), or cause memory spikes. Fix: use `asyncio.Semaphore(10)` or equivalent.

## MEDIUM SEVERITY

### M1: `googleapiclient.discovery.build` in __init__ performs blocking network I/O
**File:** `python-backend/app/services/gslides_importer.py`, lines 133-136

`googleapiclient.discovery.build('slides', 'v1', credentials=credentials)` performs a discovery document HTTP fetch unless the document is cached. Constructor-level blocking network I/O prevents testability and async hygiene. Fix: pass `static_discovery=True` to use a bundled local discovery doc and avoid the network call.

### M2: Bare `except Exception: pass` suppresses errors without logging
**File:** `python-backend/app/services/gslides_importer.py`, lines 498-513 and lines 558-578

Both `_parse_rect_element` and `_parse_line_element` silently swallow all exceptions. A KeyError, TypeError, or AttributeError from an unexpected API response produces no warning, no log entry, and falls through to a hardcoded default. The project CLAUDE.md explicitly prohibits "Adding try/catch to suppress an error."

### M3: Video element URL not validated for HTTPS
**File:** `python-backend/app/services/gslides_importer.py`, lines 393-407

The `url` from `element['video'].get('url', '')` is stored with no HTTPS validation, no empty-string guard, and no URL sanitization. A maliciously crafted Google Slides file could set a video URL to `javascript:alert(1)` or `http://`. The spec's security constraints (line 483-484) require HTTPS validation for image URLs — the same principle applies to any stored URL.

### M4: WordArt warning fires when renderedText is empty — "text preserved" is misleading
**File:** `python-backend/app/services/gslides_importer.py`, lines 375-391

The fidelity warning "WordArt decoration lost — text preserved" fires unconditionally before the `if text_content:` guard. If `renderedText` is empty, the warning fires but no element is produced — the text is NOT preserved. Warning text is actively incorrect.

## LOW SEVERITY

### L1: `_parse_line_element` has no `page_num` parameter — cannot emit fidelity warnings
**File:** `python-backend/app/services/gslides_importer.py`, line 553

`_parse_line_element(self, element: dict, bounds: ElementBounds) -> dict` accepts no `page_num`. Combined with bare `except: pass`, all line color/width parsing failures are completely invisible.

### L2: `Optional[X]` syntax should be `X | None`
**File:** `python-backend/app/services/gslides_importer.py`, lines 53, 94, 209, 268

Project targets Python 3.11+ and spec uses `float | None`, `bytes | None` union syntax. Ruff UP006/UP007 rules will flag `Optional[X]`.

### L3: No test for images nested inside groups — masks H2
**File:** `python-backend/tests/test_gslides_importer.py`

`test_group_child_offset` uses a RECTANGLE child, not an IMAGE child. This test gap directly masks the H2 bug.

### L4: No test for wordArt or video elements
**File:** `python-backend/tests/test_gslides_importer.py`

Neither element type has a test despite non-trivial conditional logic.

### L5: No test for empty presentation or zero-dimension pageSize
**File:** `python-backend/tests/test_gslides_importer.py`

If `page_width_emu` or `page_height_emu` is zero in a malformed response, `canvas_scale_x = canvas_px_width / _emu_to_px(0.0)` = `ZeroDivisionError`. No guard or test exists.

## NITPICK

### N1: `_parse_page` declared `async` when spec shows it as sync
Minor inconsistency with spec signature; not a blocking issue.

## Summary

Implementation covers most of the spec but has two high-severity functional bugs: (H2) images inside groups are never pre-fetched and silently fail — a very common real-world layout pattern; and (H1) the synchronous Google API `.execute()` call blocks the asyncio event loop. The unbounded concurrent image downloads (H3) is a production reliability risk. The unvalidated video URL (M3) is the most impactful security gap. The bare `except: pass` blocks (M2) will make production debugging extremely difficult.
