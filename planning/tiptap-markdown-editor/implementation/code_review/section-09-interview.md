# Section 09 Code Review Interview

## Auto-fixes (applying without user input)

### Fix 1: SVG exclusion in classifyMediaType (HIGH)
- **Issue**: `classifyMediaType("image/svg+xml")` returns `"image"`, allowing SVG uploads via paste/drop
- **Decision**: Add explicit SVG deny before the prefix match
- **Status**: APPLY

### Fix 2: Move img src sanitization before DOMPurify (HIGH)
- **Issue**: Post-DOMPurify regex reconstructs `<img>` tags, bypassing sanitizer as terminal step
- **Decision**: Move img src sanitization to run before DOMPurify, let DOMPurify be terminal
- **Status**: APPLY

### Fix 3: editorRef null guard (HIGH)
- **Issue**: `editorRef.current!` non-null assertion could crash
- **Decision**: Already fixed — null guards added before passing to handlers
- **Status**: ALREADY APPLIED

### Fix 4: Multi-drop stale position (MEDIUM)
- **Issue**: All files in multi-drop insert at same position, stacking
- **Decision**: Track insertion offset, advance position after each insert
- **Status**: APPLY

### Fix 5: Redundant variable in dropHandler (LOW)
- **Issue**: `const nodeType = type` is unnecessary
- **Decision**: Remove
- **Status**: APPLY

### Fix 6: Unchecked type cast in uploadMedia (LOW)
- **Issue**: `(await res.json()) as { url: string }` without runtime check
- **Decision**: Add runtime validation
- **Status**: APPLY

### Fix 7: Missing test assertions (LOW)
- **Issue**: moved=true test missing uploadMedia assertion; no isDestroyed test
- **Decision**: Add assertions
- **Status**: APPLY

## Let-go items (not fixing)

- **MEDIUM - Paste asymmetry**: Spec says paste handles images only. Acceptable.
- **MEDIUM - DOMPurify mock in tests**: Pragmatic choice for node env; real DOMPurify tested in browser.
- **MEDIUM - CSRF on upload endpoint**: Server-side concern, separate ticket.
- **MEDIUM - MSO regex**: DOMPurify strips `style` attrs anyway via ALLOWED_ATTR exclusion.
