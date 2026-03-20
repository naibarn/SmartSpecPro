Now I have all the context needed. Let me produce the section content.

# Section 11: SafeMarkdown Fixes

## Overview

SafeMarkdown (`apps/web/client/src/components/chat/SafeMarkdown.tsx`) is a DOMPurify-based markdown renderer used outside the Tiptap editor -- in chat messages, export views, and other preview contexts. It must correctly render the new media format that the Tiptap editor produces, including extended `data-*` attributes on `<video>` and `<audio>` tags.

Currently, SafeMarkdown has three problems:

1. **DOMPurify strips all `data-*` attributes** because `ALLOW_DATA_ATTR: false` is set and no `ADD_ATTR` whitelist includes them.
2. **The `MediaPart` type only captures `{ kind, src }`**, so even if the regex matched `data-poster`, `data-caption`, and `data-asset-id`, they would have nowhere to go.
3. **The `MEDIA_TAG_REGEX` only extracts `src`** -- it does not capture `data-poster`, `data-caption`, or `data-asset-id` from matched tags.

These fixes ensure that documents saved by the Tiptap editor (Section 06) render correctly everywhere SafeMarkdown is used.

## Dependencies

- **Section 06 (Media Extensions)**: Defines the `data-poster`, `data-caption`, and `data-asset-id` attributes that the Tiptap video/audio extensions serialize into HTML. This section fixes SafeMarkdown to preserve those attributes when rendering. However, this section can be implemented independently -- the fixes are to SafeMarkdown's own parsing and rendering pipeline, and can be tested with raw HTML strings containing `data-*` attributes.

## File to Modify

`/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/SafeMarkdown.tsx` (347 lines)

## Test File to Create

`/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/SafeMarkdown.test.tsx`

---

## Tests (Write First)

Create the test file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/SafeMarkdown.test.tsx`. Use Vitest with `jsdom` environment.

The tests verify that extended media attributes survive the full SafeMarkdown render pipeline (splitByMedia extraction, DOMPurify sanitization, React rendering).

```
# SafeMarkdown.test.tsx

# Test: <video src="url" data-poster="p"> preserves data-poster through render pipeline
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-poster="https://example.com/thumb.jpg" controls></video>'
#   Assert the rendered <video> element has a "poster" attribute equal to "https://example.com/thumb.jpg"

# Test: <video src="url" data-caption="c"> preserves data-caption
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-caption="My caption" controls></video>'
#   Assert a <p> or text element with "My caption" appears below the video

# Test: <video src="url" data-asset-id="123"> preserves data-asset-id
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-asset-id="abc-123" controls></video>'
#   Assert the rendered <video> element has a "data-asset-id" attribute equal to "abc-123"

# Test: <video src="url" data-malicious="evil"> strips non-whitelisted data attrs
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-malicious="evil" controls></video>'
#   Assert the rendered <video> element does NOT have a "data-malicious" attribute

# Test: caption rendered as text below video player
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-caption="Test caption" controls></video>'
#   Assert text "Test caption" is visible in the document
#   Assert it appears after the <video> element (e.g., as a sibling <p> or <span>)

# Test: data-poster="javascript:alert(1)" is sanitized (not used as poster URL)
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" data-poster="javascript:alert(1)" controls></video>'
#   Assert the rendered <video> element either has NO poster attribute or has poster="" (sanitized)
#   The javascript: protocol must never appear in the DOM

# Test: existing documents without data-* attrs still render correctly
#   Render SafeMarkdown with input: '<video src="https://example.com/v.mp4" controls></video>'
#   Assert a <video> element renders with src and controls
#   No errors or crashes occur
#   No caption element appears (since no data-caption was provided)

# Test: audio tag with data-caption renders caption text
#   Render SafeMarkdown with input: '<audio src="https://example.com/a.mp3" data-caption="Audio title" controls></audio>'
#   Assert text "Audio title" is visible in the document

# Test: mixed content with text and video renders both correctly
#   Render SafeMarkdown with input: 'Some text before\n\n<video src="https://example.com/v.mp4" data-caption="Cap" controls></video>\n\nSome text after'
#   Assert "Some text before" text is present
#   Assert a <video> element is present
#   Assert "Cap" text is present
#   Assert "Some text after" text is present
```

The test file should import `{ render, screen }` from `@testing-library/react`, and `{ describe, it, expect }` from `vitest`. Use `@testing-library/jest-dom` matchers for DOM assertions. The component is imported from `@/components/chat/SafeMarkdown`.

---

## Implementation Details

Four changes are required in `SafeMarkdown.tsx`. All are localized to the same file.

### Change 1: DOMPurify ADD_ATTR Whitelist (secondary fix)

**Location**: The `sanitizeContent` function, inside the `DOMPurify.sanitize()` call (currently around line 66-73).

**IMPORTANT CONTEXT**: `splitByMedia()` (Change 3) extracts `<video>`/`<audio>` tags from raw content **before** DOMPurify runs. When media tags are found, the `mediaParts` render path is taken — DOMPurify never sees the media tags. This Change 1 only matters for an edge case: if `<video>` tags appear inside text parts that go through the `sanitizedContent` path (e.g., nested inside markdown blockquotes or other structures that `splitByMedia` doesn't extract). **Changes 2, 3, and 4 are the primary fixes** — this is a defense-in-depth measure.

**What to do**: Add `"data-poster"`, `"data-caption"`, and `"data-asset-id"` to the `ADD_ATTR` array. Keep `ALLOW_DATA_ATTR: false`.

The existing `ADD_ATTR` already contains `["target"]`. Extend it to `["target", "data-poster", "data-caption", "data-asset-id"]`.

Additionally, add `"poster"` to the `ALLOWED_ATTR` array (currently around line 38-45) so that if a `<video>` tag uses the standard `poster` attribute (not `data-poster`), it also passes through.

### Change 2: Widen MediaPart Type

**Location**: The `MediaPart` type alias (currently around line 205-208).

**Current definition**:
```typescript
type MediaPart =
  | { kind: "text"; value: string }
  | { kind: "video"; src: string }
  | { kind: "audio"; src: string };
```

**New definition**: Add optional fields for `poster`, `caption`, and `assetId` to the video and audio variants:

```typescript
type MediaPart =
  | { kind: "text"; value: string }
  | { kind: "video"; src: string; poster?: string; caption?: string; assetId?: string }
  | { kind: "audio"; src: string; caption?: string; assetId?: string };
```

### Change 3: Extend MEDIA_TAG_REGEX and splitByMedia

**Location**: The `MEDIA_TAG_REGEX` constant (line 210) and the `splitByMedia` function (lines 212-236).

**Current regex**: Captures only the tag name (group 1) and `src` value (group 2):
```typescript
const MEDIA_TAG_REGEX = /<(video|audio)\b[^>]*\bsrc="([^"]*)"[^>]*>(?:<\/\1>)?/g;
```

**Approach**: Rather than trying to build a single complex regex that captures all possible attribute orderings, change to a two-step approach:

1. Use a simpler regex to match the entire `<video ...>` or `<audio ...>` tag (capturing the full attributes string).
2. Extract individual attributes (`src`, `data-poster`, `data-caption`, `data-asset-id`) from the captured attributes string using small helper functions or individual regex matches.

The outer regex should be something like:
```
/<(video|audio)\b([^>]*)>(?:<\/\1>)?/g
```
Where group 1 is the tag name and group 2 is the full attribute string.

Then define a helper function `extractAttr(attrString: string, attrName: string): string | undefined` that extracts a named attribute value from an HTML attribute string. This helper should handle both `attrName="value"` and `attrName='value'` patterns.

In `splitByMedia`, after matching a tag, use the helper to extract:
- `src` (required -- skip the media part if missing)
- `data-poster` (optional, map to `poster` on the MediaPart)
- `data-caption` (optional, map to `caption`)
- `data-asset-id` (optional, map to `assetId`)

### Change 4: Render Extended Attributes

**Location**: The `mediaParts.map()` render block inside the `SafeMarkdown` component (currently around lines 270-306).

**Video rendering changes**:
- If `part.poster` is present and passes URL validation (must start with `http://`, `https://`, or `/` -- reject `javascript:`, `data:`, etc.), pass it as the `poster` attribute on the `<video>` element.
- If `part.caption` is present, render a `<p>` element below the `<video>` with the caption text. Style it with muted/small text (e.g., `className="text-sm text-muted-foreground mt-1"`).
- If `part.assetId` is present, render it as `data-asset-id` on the `<video>` element (for downstream tooling).

**Audio rendering changes**:
- If `part.caption` is present, render a `<p>` element below the `<audio>` with the caption text.
- If `part.assetId` is present, render it as `data-asset-id` on the `<audio>` element.

**URL validation for poster**: Create a small inline helper or use the same validation logic that `sanitizeUrls` uses. The poster URL must not start with `javascript:`, `vbscript:`, `data:text`, `data:application`, `blob:`, or `file:`. If validation fails, omit the `poster` attribute entirely (do not render it as empty string).

**Wrapping media + caption**: When a caption is present, wrap the `<video>`/`<audio>` and its caption `<p>` in a `<figure>` element (or a `<div>`) so they stay grouped. This is a semantic HTML improvement and makes styling easier.

---

## Security Considerations

- **Four specific `data-*` attributes are whitelisted** in DOMPurify's `ADD_ATTR`: `data-poster`, `data-caption`, `data-asset-id`, `data-alignment`. This is a targeted allowlist, not a blanket `ALLOW_DATA_ATTR: true`. Any `data-*` attribute not in the list is still stripped.
- **`data-poster` values are URL-validated** before being used as the `<video poster>` attribute. The `javascript:` protocol must never reach the DOM.
- **`data-caption` values are rendered as text content** inside a `<p>` tag, not as raw HTML. React's JSX automatically escapes text content, preventing XSS.
- **`data-asset-id` values are rendered as a data attribute** on the element. Since DOMPurify already sanitizes the value and it is not used in any executable context (not a URL, not innerHTML), this is safe.

---

## Verification Checklist

1. Run the new test file: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run client/src/components/chat/SafeMarkdown.test.tsx`
2. Verify all 9 test cases pass.
3. Verify existing SafeMarkdown usage is not broken -- the component is used in chat messages (`ChatView.tsx`) and possibly other locations. Search for `<SafeMarkdown` to find all usage sites and manually confirm no regressions.
4. Specifically test with a markdown string that contains NO `data-*` attributes (the "existing documents" test case) to confirm backward compatibility.
5. Run the full web test suite: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`

---

## Implementation Notes (Post-Implementation)

### Deviations from Plan

1. **`data-alignment` added to ADD_ATTR**: Not in original plan but identified during code review as needed for consistency with `MEDIA_DATA_ATTRS` in `mediaSerializationRules.ts`.
2. **`extractAttr` regex hardened**: The `\b` word boundary was replaced with `(?:^|\s)` to prevent false matches inside longer attribute names (e.g., `xdata-poster`). The `name` parameter is now regex-escaped before interpolation.
3. **Self-closing tag support**: `MEDIA_TAG_REGEX` extended with `\/?>` to handle `<video ... />` XHTML-style tags from LLM output.
4. **`isUrlSafe` kept separate**: Review suggested importing `sanitizeMediaSrc`, but a comment linking the two was added instead to avoid coupling SafeMarkdown (a chat/preview component) to editor extensions.

### Actual Files Modified/Created

| File | Action |
|------|--------|
| `apps/web/client/src/components/chat/SafeMarkdown.tsx` | **Modified** — 4 changes per plan + 3 review fixes |
| `apps/web/client/src/components/chat/SafeMarkdown.test.tsx` | **Created** — 9 tests, all passing |

### Test Results

All 9 tests pass. Test run time: ~86ms.