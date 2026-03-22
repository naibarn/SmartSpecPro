---
name: SVG Text Wrapping in AI Layout Preview
description: Text overflow and non-wrapping in presentation preview rendering
type: research
---

# Research Brief: Preview Text Not Wrapping (SVG)

## Executive Summary

**Two independent text rendering systems exist with different wrapping behavior:**

1. **SVG Preview** (`blockPreviewSvg.ts`): Uses SVG `<text>` element with NO wrapping support — text is truncated to 120 chars and rendered on single line
2. **Canvas Preview** (`SlideElementPreview.tsx`): Uses HTML `<div>` + `<p>` with `whitespace-pre-wrap break-all` — text wraps and may overflow with `overflow-hidden`

**The SVG preview is primarily used in "AI Layout Preview" and custom block creation dialogs. The HTML canvas is used in the main editor. Both need fixes.**

## Findings

### Issue 1: SVG Text Preview (blockPreviewSvg.ts)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/blockPreviewSvg.ts`

**Current Implementation** (lines 147–152):
```typescript
if (element.type === "text") {
  const text = escapeXml(element.text || "");
  const fontSize = clampNumber(Number(element.fontSize ?? 24), 8, 72);
  const x = element.x + 8;
  const y = element.y + 8;
  return `<text x="${x}" y="${y}" dominant-baseline="hanging"
    fill="${escapeXml(element.color || "#0f172a")}"
    font-size="${fontSize}"
    font-family="${escapeXml(element.fontFamily || "Arial, sans-serif")}"
    font-weight="${escapeXml(element.fontWeight || "600")}">
    ${text.slice(0, 120)}  // <-- TRUNCATION HERE
  </text>`;
}
```

**Problems**:
1. **No text wrapping**: SVG `<text>` element does not support wrapping by default
2. **Hard truncation**: `.slice(0, 120)` cuts text at exactly 120 characters, losing content
3. **Single line**: No way to break into multiple `<tspan>` elements in current code
4. **No overflow containment**: Text extends beyond element's width boundary
5. **Visual misleading**: Preview shows fake truncated text, not what user actually sees in editor

### Issue 2: HTML Canvas Text Preview (SlideElementPreview.tsx)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/SlideElementPreview.tsx`

**Current Implementation** (lines 51–89):
```typescript
if (element.type === "text") {
  return (
    <div
      className="absolute overflow-hidden"  // <-- overflow-hidden
      style={{
        ...commonStyle,
        backgroundColor: element.backgroundColor || "transparent",
        padding: "8px",
        boxSizing: "border-box",
      }}
    >
      <p
        className="w-full whitespace-pre-wrap break-all"  // <-- wraps but breaks ALL words
        style={{
          color: element.color || "#111827",
          fontSize,
          fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
          fontWeight: element.fontWeight || "600",
          ...
        }}
      >
        {element.text || "Text"}
      </p>
    </div>
  );
}
```

**Problems**:
1. **`overflow-hidden`**: Text that doesn't fit is clipped, not visible
2. **`break-all`**: Breaks at every character, not at word boundaries — ugly, hard to read
3. **No height constraint**: If text is taller than element height, it overflows container
4. **Parent uses `overflow-hidden`**: Even text with scrolling wouldn't be visible
5. **Comparison to canvas**: Users see text that fits in preview, but actual slide may clip it

### Data Flow

**Where these components are used:**

| Component | Used In | Purpose |
|-----------|---------|---------|
| `buildPresentationBlockPreviewSvg()` | Custom block gallery, layout preview dialogs | Thumbnail preview of saved custom block |
| `SlideElementPreview` | Main presentation editor canvas, zoom view | Real-time edit preview while dragging/resizing text |
| `blockPreviewSvg.ts` | Media upload flow, template picker | Compact preview of block layouts |

**Call chain**:
```
User views "AI Layout Preview" dialog
  ├─ PresentationEditor.tsx renders AIDraftModal or similar
  ├─ Modal calls presentationCustomBlockService.renderPresentationCustomBlockPreview()
  ├─ Service calls buildPresentationBlockPreviewSvg()
  ├─ SVG text elements truncated to 120 chars, no wrapping
  └─ User sees misleading preview (text appears shorter than it will be)

User edits slide in canvas
  ├─ SlideEditor.tsx renders SlideElementPreview for each element
  ├─ SlideElementPreview renders text with overflow-hidden + break-all
  ├─ Text that doesn't fit is clipped (overflow-hidden)
  └─ User can't see all their text while editing
```

## Current Architecture

### SVG Rendering (Server-Side / Shared Library)

**File structure**:
- `apps/web/shared/presentation/blockPreviewSvg.ts` — Builds SVG markup from slide elements
- No DOM manipulation; pure string concatenation
- Must output valid SVG for storage in database

**SVG limitations**:
- SVG `<text>` element has no native wrapping
- Must manually split text into `<tspan>` elements (one per line)
- Requires word-break algorithm (CSS doesn't apply to SVG)
- Must account for font metrics to position each line

**Current workaround**: Truncate and hope it fits

### HTML Canvas Rendering (Client-Side)

**File structure**:
- `apps/web/client/src/presentation-canvas/components/SlideElementPreview.tsx` — React component
- Renders text in HTML `<div>` + `<p>`
- Uses Tailwind + inline styles

**Current approach**:
- `whitespace-pre-wrap`: Preserves newlines (if user added them)
- `break-all`: Breaks at any character
- `overflow-hidden`: Hides overflow
- **Result**: Visually confusing and incomplete

## Risks

1. **User data loss**: Text truncated in SVG preview may not reflect actual content stored
2. **Preview-reality mismatch**: What user sees in preview dialog doesn't match actual slide
3. **Editing friction**: Can't see full text while editing in canvas
4. **Accessibility**: Screen readers get truncated text from SVG
5. **Performance**: If we add text wrapping to SVG, it may slow down preview generation (per-slide SVG building)
6. **Font metrics**: Wrapping requires font measurements; SVG can't access these without browser context

## Options

### Option A: SVG Text Wrapping with Manual `<tspan>` (Medium Effort, Good Coverage)

**For blockPreviewSvg.ts**:

```typescript
function buildSvgTextWithWrapping(
  text: string,
  element: SlideTextElement,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
): string {
  const x = element.x + 8;
  const y = element.y + 8;

  // Estimate character width (rough heuristic)
  const charWidth = fontSize * 0.5; // ~50% of font size
  const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));

  // Split text into lines
  const lines = [];
  let remainingText = text.slice(0, 500); // Cap at 500 chars
  while (remainingText.length > 0) {
    lines.push(remainingText.slice(0, charsPerLine));
    remainingText = remainingText.slice(charsPerLine);
  }

  // Build tspan elements
  const tspans = lines
    .map((line, index) =>
      `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * 1.2}">
        ${escapeXml(line)}
      </tspan>`
    )
    .join("");

  return `<text x="${x}" y="${y}" dominant-baseline="hanging"
    fill="${escapeXml(element.color || "#0f172a")}"
    font-size="${fontSize}"
    font-family="${escapeXml(fontFamily)}"
    font-weight="${escapeXml(fontWeight)}">
    ${tspans}
  </text>`;
}
```

**Pros**:
- Pure SVG solution; no external dependencies
- Works in all contexts (preview, export, storage)
- Heuristic character width is "good enough" for preview

**Cons**:
- Character width is approximate; may not match actual font rendering
- Still truncates at 500 chars (prevents huge previews)
- Need to calculate line height correctly (spacing between tspans)

**Effort**: 2–3 hours (write function, integrate, test)

---

### Option B: Use Canvas API to Measure Text (Higher Effort, Precise)

**For blockPreviewSvg.ts**:

```typescript
function wrapTextWithCanvasMeasure(
  text: string,
  element: SlideTextElement,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
): { lines: string[]; lineHeight: number } {
  // This requires browser context (Canvas API)
  // Can't be done in server-side code (blockPreviewSvg.ts is shared library)
  // Must move to client-side component
}
```

**Pros**: Accurate wrapping; matches browser rendering

**Cons**:
- Can't use on server side (blockPreviewSvg.ts is imported by Node server)
- Requires moving SVG generation to client (client-side React component)
- Breaks current separation of concerns

**Effort**: 4–6 hours (refactor architecture)

**Not recommended** for SVG (server-side constraint)

---

### Option C: HTML Wrapper for SVG Preview (Simple, Good UX)

**For both blockPreviewSvg.ts AND SlideElementPreview.tsx**:

Instead of rendering raw SVG, wrap it in HTML containers with overflow handling:

```typescript
export function buildPresentationBlockPreviewWithWrapping(
  elements: PresentationSlideElement[],
  canvasSize: Pick<PresentationCanvasSize, "width" | "height">,
  background?: PresentationSlideBackground,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  // Current SVG building
  const svg = buildPresentationBlockPreviewSvg(elements, canvasSize, background, options);

  // Wrap in container with overflow styling
  return `
    <div style="width: 100%; height: 100%; overflow: hidden; position: relative;">
      ${svg}
    </div>
  `;
}
```

**Pros**: Simple; immediate fix for both SVG and HTML rendering

**Cons**:
- Still clips text (overflow-hidden); doesn't show it
- Doesn't actually solve the wrapping problem

**Effort**: 30 minutes

**Not recommended** — doesn't address root cause

---

### Option D: Remove Hard Truncation, Add Intelligent Line Breaking (Recommended)

**For blockPreviewSvg.ts (SVG)**:

Replace the 120-char slice with intelligent line breaking:

```typescript
function buildTextElementForPreviewSvg(
  element: SlideTextElement,
  options?: PresentationBlockPreviewSvgOptions,
): string {
  const text = escapeXml(element.text || "");
  const fontSize = clampNumber(Number(element.fontSize ?? 24), 8, 72);
  const x = element.x + 8;
  const y = element.y + 8;
  const maxWidth = element.width - 16; // Account for padding

  // Heuristic: ~0.5–0.6 em per character (varies by font)
  const estimatedCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(3, Math.floor(maxWidth / estimatedCharWidth));

  // Break by word first, then by character if needed
  const lines = [];
  const words = text.split(" ");
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).length <= charsPerLine) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      // If single word is longer than line, break it
      if (word.length > charsPerLine) {
        for (let i = 0; i < word.length; i += charsPerLine) {
          lines.push(word.slice(i, i + charsPerLine));
        }
        currentLine = "";
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit to 3–4 lines to prevent huge previews
  lines.slice(0, 4);

  // Build tspan elements
  const tspans = lines
    .map((line, index) =>
      `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * 1.3}">${line}</tspan>`
    )
    .join("");

  return `<text x="${x}" y="${y}" dominant-baseline="hanging"
    fill="${escapeXml(element.color || "#0f172a")}"
    font-size="${fontSize}"
    font-family="${escapeXml(element.fontFamily || "Arial, sans-serif")}"
    font-weight="${escapeXml(element.fontWeight || "600")}">${tspans}</text>`;
}
```

**For SlideElementPreview.tsx (HTML)**:

Replace `break-all` with `break-words` and add scrolling:

```typescript
if (element.type === "text") {
  return (
    <div
      className="absolute overflow-y-auto overflow-x-hidden"  // Allow scroll, hide overflow
      style={{
        ...commonStyle,
        backgroundColor: element.backgroundColor || "transparent",
        padding: "8px",
        boxSizing: "border-box",
      }}
    >
      <p
        className="w-full whitespace-pre-wrap break-words"  // break-words instead of break-all
        style={{
          color: element.color || "#111827",
          fontSize,
          fontFamily: element.fontFamily || "Inter, system-ui, sans-serif",
          fontWeight: element.fontWeight || "600",
          // ... other styles
        }}
      >
        {element.text || "Text"}
      </p>
    </div>
  );
}
```

**Pros**:
- Fixes both SVG and HTML rendering
- Word-break first (better readability); character-break fallback
- No external dependencies
- Reasonable approximation for preview use case
- Matches element boundaries (respects maxWidth)

**Cons**:
- Character width is heuristic (~0.55 em); font-specific fonts may differ
- May show 3–4 lines when actual slide shows 1 line (or vice versa)
- Line height (`dy * 1.3`) is approximate; actual slides may differ

**Effort**: 2–3 hours

---

## Recommendation

**Implement Option D (Intelligent Line Breaking) with following prioritization:**

### Phase 1 (1–2 hours): HTML Canvas Preview Fix

**File**: `SlideElementPreview.tsx`
- Change `break-all` → `break-words`
- Change `overflow-hidden` → `overflow-y-auto overflow-x-hidden`
- This fixes the main editor experience immediately

### Phase 2 (1–2 hours): SVG Preview Fix

**File**: `blockPreviewSvg.ts`
- Implement intelligent word-wrap with `<tspan>` elements
- Limit to 3–4 lines max (prevent huge previews)
- This fixes gallery previews and layout dialogs

### Phase 3 (Testing): Validate Font Metrics

- Test with different font families (Inter, Arial, custom fonts)
- Measure character widths in browser; calibrate the 0.55 em heuristic
- Add user feedback if wrapping doesn't match (but it will be close enough)

## Open Questions

1. **Why 120 chars in SVG?** Was this chosen arbitrarily or based on sizing analysis?
   - **Answer**: Likely arbitrary; could be removed entirely with wrapping

2. **Font metrics access**: Can we improve character width estimation?
   - **Current**: 0.55 em heuristic
   - **Better**: 0.5–0.6 em varies by font family; could use a map

3. **Line height calculation**: Should `dy` match `lineHeight` from element style?
   - **Current**: Hardcoded `fontSize * 1.3`
   - **Better**: Use `element.lineHeight` if available

4. **Performance**: Does adding tspan generation slow down preview rendering?
   - **Expectation**: Negligible (few words per slide)
   - **Should test** with large presentations (100+ slides)

5. **Backwards compatibility**: Do existing SVG previews in database need migration?
   - **Answer**: No; previews are generated on-the-fly, not stored (per code at line 290–311 of presentationCustomBlockService.ts)

## Code Locations for Implementation

| Task | File | Lines | Action |
|------|------|-------|--------|
| Fix SVG text | `blockPreviewSvg.ts` | 147–152 | Replace `<text>` logic with tspan wrapping |
| Fix HTML text | `SlideElementPreview.tsx` | 51–89 | Change `break-all` to `break-words`, fix overflow |
| Update parent wrapper | `SlideElementPreview.tsx` | 60–69 | May need to adjust container styles |
| Add word-break helper | (new file or in blockPreviewSvg.ts) | — | `buildTextElementForPreviewSvg()` function |
