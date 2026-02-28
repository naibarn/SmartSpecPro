# Code Review: section-02-pptx-importer

## HIGH SEVERITY

### Issue 1: No size limit — potential memory exhaustion
`import_file` accepts bytes with zero size validation. Large files or zip bombs can exhaust memory. MemoryError is BaseException, not caught by `except Exception`.

### Issue 2: MemoryError not caught by `except Exception`
`except Exception` doesn't catch `MemoryError`. A crafted zip bomb will crash the worker process.

## MEDIUM SEVERITY

### Issue 4: Dead imports inside `_parse_auto_shape`
`MSO_THEME_COLOR`, `qn as _qn`, `PP_PLACEHOLDER`, `RGBColor as _RGB` imported inside method but never used. Violates ruff F401 and Black style.

### Issue 6: Group offset accumulation (REVIEWER LIKELY WRONG)
Reviewer claims nested group offsets are double-counted. Our analysis shows the code is correct: child shape.left is always relative to its immediate parent group, and the accumulation is correct.

### Issue 7: Empty-content textboxes included
Textboxes with only whitespace/newlines produce noisy canvas elements.

### Issue 11: `upload_bytes` missing local provider guard
`upload_file` checks `providerType == "local"` and returns None. `upload_bytes` does not.

### Issue 12: Unused module-level imports `RGBColor`, `qn`
Both imported but never used.

## LOW SEVERITY

### Issue 9: Missing tests
- `test_linked_picture_skipped` — absent
- `test_textbox_font_color_rgb` — absent
- `test_group_child_offset` — absent

### Issue 10: `test_line_shape` vacuous
`assert len(elements) >= 0` is always true.

### Issue 13: _cap_warnings (LOW — actually correct)
Returns 24+1=25. Plan says cap at 25. Technically correct.
