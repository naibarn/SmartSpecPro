# Code Review Interview: section-02-pptx-importer

## USER DECISIONS

### Issue 1+2: Size limit + MemoryError (HIGH)
**Decision**: 50 MB cap with MemoryError catch.
- Raise `ImportError` if `len(pptx_bytes) > 50_000_000` before any parsing.
- Change `except Exception` → `except (Exception, MemoryError)` so zip bombs can't crash the Celery worker.

## AUTO-FIXES (applied without user input)

### Issue 4: Dead imports inside `_parse_auto_shape` (MEDIUM)
Remove the four local imports that are unused:
- `from pptx.enum.dml import MSO_THEME_COLOR`
- `from pptx.oxml.ns import qn as _qn`
- `from pptx.enum.shapes import PP_PLACEHOLDER`
- `from pptx.dml.color import RGBColor as _RGB`
The fill extraction logic works fine without them (only `MSO_COLOR_TYPE.RGB` is used, already imported at module level).

### Issue 12: Unused module-level imports (MEDIUM)
Remove `RGBColor` and `qn` from module-level imports — neither is referenced outside `_parse_auto_shape`'s now-deleted dead locals.

### Issue 7: Empty-content textboxes included (MEDIUM)
After joining paragraphs and truncating to 10,000 chars, return `None` if `text.strip()` is falsy. Eliminates whitespace-only canvas noise.

### Issue 11: `upload_bytes` missing local provider guard (MEDIUM)
Add `providerType == "local"` check after settings lookup in `upload_bytes` — consistent with `upload_file`'s behavior of returning `None` for local storage (converted to `raise ValueError` here since `upload_bytes` has no `Optional` return type).

### Issue 10: Vacuous `test_line_shape` assertion (LOW)
Change `assert len(elements) >= 0` to `assert isinstance(elements, list)` — still minimal (LINE_INVERSE goes through AUTO_SHAPE dispatch) but not always-true.

## ADDITIONAL TESTS (auto-added)

### Issue 9a: `test_linked_picture_skipped`
Mock shape with `shape_type == MSO_SHAPE_TYPE.LINKED_PICTURE`; verify 0 elements and a warning containing "Linked".

### Issue 9b: `test_textbox_font_color_rgb`
Add a textbox run with `RGBColor(0xFF, 0x00, 0x00)` via real python-pptx; verify `style["color"] == "#FF0000"`.

### Issue 9c: `test_group_child_offset`
Mock group at 500k EMU with child at 100k EMU; verify accumulated absolute x equals `_scale_to_canvas(600_000, ...)`.

## ITEMS LET GO

### Issue 6: Group offset double-counting (MEDIUM — REVIEWER LIKELY WRONG)
Code is correct. `shape.left` for child shapes is always relative to immediate parent group. No change.

### Issue 13: `_cap_warnings` returns 25 items (LOW — correct)
24 real warnings + 1 summary = 25. Plan says "cap at 25". Correct.
