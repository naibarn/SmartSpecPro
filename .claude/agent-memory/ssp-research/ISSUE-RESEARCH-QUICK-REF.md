---
name: Issue Research Quick Reference
description: Fast lookup for block type and text wrapping issues
type: reference
---

# Quick Reference: Block Type Uniformity & Text Wrapping Issues

## Issue 1: All Slides Get Same Block Type

### Root Cause
Diversity enforcement system triggers only when alternative recipes clear activation thresholds. On content-uniform slides, alternatives score too low to switch.

### File Locations
| File | Lines | What |
|------|-------|------|
| `aiPresentationService.ts` | 3600–4258 | Heuristic recipe selection (20+ rules) |
| `aiPresentationService.ts` | 4278–4370 | Diversity enforcement function (ineffective) |
| `aiPresentationService.ts` | 4320–4326 | Diversity score penalties/boosts (too small) |
| `autoDraftTool.ts` | 250 | Entry point: `generateAIDraft()` |

### Key Functions
```typescript
// Main selection
resolveAIComponentRecipeForSlide(options)  // Lines 3600–4244
  → Returns componentRecipeId based on 20+ heuristic rules

// Diversity enforcement
applyAIComponentRecipeSelectionDiversity(options)  // Lines 4278–4370
  → Tries to switch recipes if alternative is good enough
  → Fails because alternatives rarely clear threshold

// Score adjustment
score -= 4 + (consecutiveRecipeRun * 5)  // Line 4320 (penalty)
score += 2  // Line 4322 (boost) ← TOO SMALL
```

### Selection Heuristics (Lines 3857–4182)
Examples:
- Numbered bullets → "process-steps"
- 4+ sections → "infographic-grid"
- Quote marks → "quote-callout"
- Metrics dominant → "stat-cards"
- Long-form text → "article-focus" / "two-column-article"
- Timeline keywords → "timeline-report" / "timeline-flow"

### Diversity Failure Example
```
Slide 1: Hero (skipped, no diversity check)
Slide 2: Metrics → "stat-cards" (heuristic matches strongly)
         Diversity tries: "article-focus" score = 30 (needs 50+)
         → No switch, keep "stat-cards"
Slide 3: Metrics → "stat-cards" (same heuristic fires)
         Diversity tries: "article-focus" score = 35 (boosted but still < 50)
         → No switch, keep "stat-cards"
Slide 4–5: Repeat
```

### Recommended Fix: Option C (Multi-Pass Diversity)
1. Generate initial recipes (current)
2. Count usage across deck
3. For over-used recipes, re-route to alternatives with relaxed thresholds (60% instead of 100%)
4. Preserve media slot compatibility

**Effort**: 4–6 hours

---

## Issue 2: Text Not Wrapping in Preview

### Root Cause (Two Systems)

#### SVG Preview (`blockPreviewSvg.ts`, line 147–152)
- No wrapping: SVG `<text>` element doesn't wrap
- Hard truncation: `.slice(0, 120)` cuts text at 120 chars
- Result: Misleading preview; lost content

#### HTML Canvas Preview (`SlideElementPreview.tsx`, line 51–89)
- `break-all`: Breaks at every character, not word boundaries
- `overflow-hidden`: Clips text that doesn't fit
- Result: Can't see full text while editing; confusing wrapping

### File Locations
| File | Lines | Issue |
|------|-------|-------|
| `blockPreviewSvg.ts` | 147–152 | No wrapping, hard truncation |
| `SlideElementPreview.tsx` | 51–89 | overflow-hidden + break-all |
| `SlideElementPreview.tsx` | 60–69 | Container uses overflow-hidden |

### Code Locations

**SVG text building** (blockPreviewSvg.ts:147–152):
```typescript
// CURRENT (truncates):
return `<text x="${x}" y="${y}" ...>${text.slice(0, 120)}</text>`;

// NEEDS: tspan-based wrapping with word-break algorithm
```

**HTML text rendering** (SlideElementPreview.tsx:51–89):
```typescript
// CURRENT (bad wrapping):
<div className="absolute overflow-hidden">
  <p className="w-full whitespace-pre-wrap break-all">
    {element.text}
  </p>
</div>

// NEEDS: break-words + overflow-y-auto (allow scroll)
```

### Recommended Fix: Option D (Intelligent Line Breaking)

**Phase 1 (1–2 hours): HTML Canvas**
- Change `break-all` → `break-words` (line 71)
- Change `overflow-hidden` → `overflow-y-auto overflow-x-hidden` (line 62)

**Phase 2 (1–2 hours): SVG**
- Implement `buildTextElementForPreviewSvg()` with word-wrap + tspan elements
- Use character width heuristic: `fontSize * 0.55`
- Limit to 3–4 lines max

**Effort**: 2–3 hours total

---

## Comparative Impact

| Issue | Severity | User Impact | Fix Effort | Priority |
|-------|----------|-------------|-----------|----------|
| **Block Type Uniformity** | High | Visual boredom, monotonous decks | 4–6h (Option C) | High |
| **Text Wrapping** | Medium | Lost content in edits, preview mismatch | 2–3h (Option D) | High |

## Implementation Dependencies

**Can be done independently:**
- Issue 1 doesn't depend on Issue 2
- Issue 2 doesn't depend on Issue 1

**Recommended order:**
1. Issue 2 (Text wrapping) — faster, immediate editor UX improvement
2. Issue 1 (Block diversity) — more complex, architectural impact

## Testing Checklist

### For Issue 1 (Block Diversity)
- [ ] Create 5-slide deck with uniform content (e.g., all metrics)
- [ ] Verify that slides 2–5 use different recipes
- [ ] Check recipe rotation (no 3+ consecutive same recipe)
- [ ] Verify media slot compatibility (no text-only recipe for image-heavy slides)
- [ ] Test with LLM-selected recipes (should still diversify heuristic slides)

### For Issue 2 (Text Wrapping)
- [ ] Long text in SVG preview (100+ chars) should wrap, not truncate
- [ ] HTML canvas text should break at words, not per-character
- [ ] Text should not overflow container bounds in preview
- [ ] Editing text should show all content (scroll if needed)
- [ ] Different font families should estimate width reasonably (±10%)

## References

- Full analysis: `.claude/agent-memory/ssp-research/ISSUE-DRAFT-WITH-AI-BLOCK-TYPE-RESEARCH.md`
- Full analysis: `.claude/agent-memory/ssp-research/ISSUE-PREVIEW-TEXT-WRAPPING-RESEARCH.md`
