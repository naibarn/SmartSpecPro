# Section 11 Code Review Interview

## Triage Summary

| Finding | Severity | Decision |
|---------|----------|----------|
| `extractAttr` regex escape + `\b` → `(?:^\|\\s)` | HIGH | Auto-fixed — correctness bug in security-adjacent function |
| `data-alignment` missing from ADD_ATTR | MEDIUM | Auto-fixed — consistency with MEDIA_DATA_ATTRS |
| `key` prop on inner videoEl/audioEl | MEDIUM | Auto-fixed — removed key from inner elements, kept on outermost |
| Mixed-content test missing text assertions | MEDIUM | Auto-fixed — added assertions per plan |
| Replace `isUrlSafe` with `sanitizeMediaSrc` import | MEDIUM | Let go — added comment linking the two instead; avoids coupling SafeMarkdown to editor extensions |
| Self-closing tag regex | LOW | Auto-fixed — `\/?` added to handle `<video ... />` |
| Fast-path comment | LOW | Auto-fixed — added sync comment |
| jsdom env comment | LOW | Let go — vitest config handles globally |

## Applied Fixes

1. **extractAttr regex hardening**: Escaped `name` parameter before interpolating into RegExp. Replaced `\b` with `(?:^|\\s)` to prevent matching inside longer attribute names.
2. **data-alignment**: Added to `ADD_ATTR` array alongside the other three data attributes.
3. **key prop cleanup**: Removed key from inner `<video>`/`<audio>` elements when wrapped in `<figure>`. Key is only on the outermost element returned from the map.
4. **Mixed-content test**: Added `screen.getByText(/Some text before/)` and `screen.getByText(/Some text after/)` assertions.
5. **Self-closing tag support**: Extended MEDIA_TAG_REGEX to `/<(video|audio)\b([^>]*?)\/?>(?:<\/\1>)?/g`.
6. **isUrlSafe comment**: Added comment linking to `sanitizeMediaSrc` in `mediaSerializationRules.ts`.

## Verification

All 9 tests pass after fixes applied.
