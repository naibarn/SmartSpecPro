---
name: Draft with AI Block Type Uniformity Issue
description: Root cause analysis of why all slides in Draft with AI presentations get same block type instead of varying layouts
type: research
---

# Research Brief: "Draft with AI" — All Slides Same Block Type

## Executive Summary

The issue is confirmed: **block type selection happens per-slide, with a diversity enforcement system, but diversity enforcement fails on most slides due to overly strict thresholds.** The problem is not "no diversity code" but rather **diversity switching only triggers when an alternative recipe clears its activation threshold, which few alternatives do on consecutive slides.**

## Findings

### Where Block Type (componentRecipeId) is Selected

1. **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`

2. **Core Selection Function** (lines 3600–4258):
   - `resolveAIComponentRecipeForSlide()` — Main heuristic engine that analyzes slide narrative and selects layout
   - Called for each slide in the draft generation loop
   - Returns `componentRecipeId` (e.g., "stat-cards", "article-focus", "timeline-report")

3. **Selection Flow**:
   ```
   For each slide:
   ├─ Line 3845: Check if slide has explicit componentRecipeId from LLM (use as-is)
   ├─ Lines 3857–4182: 20+ heuristic rules that match slide content to specific recipes
   │  ├─ Numbered body lines → "process-steps"
   │  ├─ 4+ sections → "infographic-grid"
   │  ├─ Quote-like title → "quote-callout"
   │  ├─ Long-form text → "article-focus" / "two-column-article"
   │  ├─ Timeline keywords → "timeline-report" / "timeline-flow"
   │  ├─ Question signals → "faq-stack"
   │  └─ ... 14 more rules
   ├─ Line 4233: Pick top heuristic candidate (if score ≥ activation threshold)
   └─ Line 4246: If no heuristic clears threshold, use default mode (no specific recipe)
   ```

4. **Activation Thresholds** (line 4234):
   - Each recipe has a `getAIComponentRecipeActivationThreshold(recipeId)`
   - Candidates must have score ≥ threshold to be selected
   - Prevents low-confidence recipe matches

### Diversity Enforcement System (lines 4278–4370)

**The diversity pass exists but is ineffective:**

```typescript
function applyAIRecipeSelectionDiversity(options: {
  selection: ResolvedAIComponentRecipeSelection;
  priorSelections: ResolvedAIComponentRecipeSelection[];
  slideIndex: number;
  allowMediaRecipeSwitch: boolean;
}): ResolvedAIComponentRecipeSelection
```

**When it activates** (line 4285):
- Only if `slideIndex > 0` (skips slide 1)
- Only if `selection.selectionMode === "heuristic"` (LLM-selected recipes are not touched)
- Only if the current selection has a `componentRecipeId`

**What it does** (lines 4312–4369):
1. Re-scores all candidate recipes with diversity penalties
2. Penalizes: the currently selected recipe (-4 points, -5 per consecutive run)
3. Boosts: recipes not recently used (+1–2 points)
4. Checks if an alternative candidate clears its activation threshold with new score
5. **Switches recipes only if**: alternative score ≥ current score - 4 (or > current if consecutive run = 0)

**The critical failure point** (line 4352–4354):
```typescript
const shouldSwitch = consecutiveRecipeRun >= 1
  ? alternativeCandidate.score >= currentCandidate.score - 4
  : alternativeCandidate.score > currentCandidate.score;
```

**Why it fails in practice:**
- Diversity penalties (-4 to -20 points) are applied to the top candidate
- But the SAME heuristic rules fire for consecutive slides with similar content
- Alternative candidates still have low scores (they didn't pass heuristics)
- Even with diversity boost (+1–2), most alternatives stay below activation threshold
- **Result**: No switch happens, same recipe used again

### Example Scenario (Why All Slides Get "stat-cards")

Suppose user prompts "Create a 5-slide presentation about marketing metrics":
- **Slide 1 (Hero)**: Skipped (no diversity check for slide 1, line 3836)
- **Slide 2**: Heuristic rule fires: metricSignals ≥ 2 → "stat-cards" (lines 3953–3969)
  - Diversity pass: Try to find alternative. But "article-focus", "timeline-report" etc. have low scores (no long-form trigger)
  - Alternative score + diversity bonus still < activation threshold
  - **No switch. Keep "stat-cards".**
- **Slide 3**: Same content pattern (metrics) → same heuristic fires → "stat-cards"
  - Diversity: Penalize stat-cards further (-9 = -4 - 5*1)
  - But alternatives still don't clear threshold
  - **No switch. Keep "stat-cards".**
- **Slides 4–5**: Repeat

### Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Block type selection logic** | `aiPresentationService.ts` | 3600–4258 | Heuristic rules + scoring |
| **Main heuristic engine** | `aiPresentationService.ts` | 3638–4244 | 20+ content-to-recipe rules |
| **Diversity enforcement** | `aiPresentationService.ts` | 4278–4370 | Consecutive recipe avoidance |
| **Slide iteration loop** | `aiPresentationService.ts` | ~1750–1850 (approx) | Processes each slide, calls diversity |
| **Called from** | `autoDraftTool.ts` | 250 | `generateAIDraft()` entry point |

## Current Architecture

### Block Type Selection Hierarchy

```
For each slide in presentation:
  1. Check if slide has explicit LLM-selected componentRecipeId
     → YES: Use it as-is
  2. Run 20+ heuristic rules on slide content (narrative, metrics, sections, etc.)
  3. Apply portrait/landscape canvas scoring adjustments
  4. Score top 5–10 candidate recipes
  5. Pick recipe with highest score IF score ≥ activation threshold
  6. Apply diversity enforcement:
     a. Re-score candidates with diversity penalties/boosts
     b. If alternative clears threshold AND alternative score good enough, SWITCH
     c. Otherwise, keep original selection
  7. Store componentRecipeId in slide.aiDesign
  8. Later: Use componentRecipeId to populate media slots + render layout
```

### Why Diversity Enforcement is Insufficient

1. **Heuristic confidence is all-or-nothing**: If a slide triggers the "stat-cards" rule strongly, the only alternatives that score well are other "stat" recipes (which are few)
2. **Low diversity boost**: +1–2 points is minimal; activation thresholds are 50–100+ points
3. **Content-driven convergence**: If all 5 slides are about "metrics", then all 5 heuristic analyses surface metric-heavy recipes
4. **Sequential dependency issue**: Diversity only compares to immediate neighbors (priorSelections), not overall deck balance

## Risks

1. **Monotonous presentation**: All slides use same visual pattern, poor user experience
2. **Under-utilization of rich recipe library**: 16+ recipes available, only 1–2 used per deck
3. **Diversity system is "active" but ineffective**: Code runs but fails silently; users don't realize it's trying to diversify
4. **Hard to debug**: Diversity enforcement is post-hoc; doesn't prevent heuristic convergence early
5. **LLM-selected recipes bypass diversity**: If LLM picks componentRecipeId explicitly, diversity pass is skipped entirely

## Options

### Option A: Increase Diversity Boost (Low Effort, Marginal Impact)

**Change**: Lines 4320–4323
```typescript
// Current:
score -= 4 + (consecutiveRecipeRun * 5);
score += 2;  // Alternative boost

// New:
score -= 2 + (consecutiveRecipeRun * 2);  // Reduce penalty
score += 8;  // Aggressive boost
```

**Pros**: Quick, requires only 3–4 line change
**Cons**: May not be enough; heuristic rules still converge

**Effort**: 30 minutes

### Option B: Proactive Recipe Diversity at Heuristic Generation Time (Medium Effort, Good Impact)

**Change**: Before scoring candidates, identify which recipes have been heavily used and exclude them from heuristic rule triggering.

**Implementation**:
1. Modify `resolveAIComponentRecipeForSlide()` to accept `recentlyUsedRecipes: Set<string>`
2. In heuristic rules (lines 3857–4182), add early exit if the matched recipe is in `recentlyUsedRecipes`
3. Fall through to next rule that suggests a different recipe

**Pros**: Prevents same recipes from scoring high in the first place
**Cons**: May miss best-fit recipe for some slides

**Effort**: 2–3 hours (modify ~15 heuristic rules)

### Option C: Multi-Pass Diversity Enforcer with Content-Aware Re-Routing (Higher Effort, Best Impact)

**Change**: After all slides have initial recipes selected, run a second pass that looks at deck-wide recipe distribution and intelligently re-routes over-used recipes to under-used ones.

**Implementation**:
1. First pass: Generate initial recipes for all slides (current behavior)
2. Second pass (new):
   - Count recipe usage across deck
   - For slides using over-used recipes, check if content can support an alternative
   - Re-route using relaxed activation thresholds (60% threshold instead of 100%)
   - Preserve media slot compatibility (don't switch to text-only recipe if slide needs image)
3. Store final recipes

**Pros**: Holistic deck-level balance; content-aware
**Cons**: More complex; needs careful testing to avoid bad recipes on slides

**Effort**: 4–6 hours (new function, integration with generation loop)

### Option D: LLM-Guided Diversity at Generation Time (Medium Effort, Best UX)

**Change**: Pass a "avoid-recipe" hint to the LLM so it doesn't suggest the same recipe repeatedly.

**Implementation**:
1. In `generateAIDraft()`, track which recipes have been used
2. Add context to LLM prompt: "Previously used layouts: stat-cards, process-steps. Suggest something different if possible."
3. LLM may then output componentRecipeId with different recipe, or skip it (let heuristics choose)

**Pros**: LLM is smart; can suggest content-appropriate alternatives
**Cons**: Adds latency (LLM call per slide); requires prompt engineering

**Effort**: 2–3 hours

## Recommendation

**Implement Option C (Multi-Pass Diversity Enforcer)** with fallback to Option B if time is constrained.

**Rationale**:
1. Option A (boost increase) has been partially tried; insufficient
2. Option C is the most robust — it operates at deck level, where the problem exists
3. It preserves content-aware selection (respects heuristics) while enforcing balance
4. It's compatible with LLM-selected recipes (doesn't need to change LLM prompt)

**Implementation Steps**:
1. Create `applyDeckLevelDiversityEnforcement()` function
2. Call it after all slides have initial recipes selected (before media slot binding)
3. For each slide using an over-represented recipe, check top 3–5 alternatives with 60% activation threshold
4. Switch if: alternative clears threshold AND content supports it (media slot count matches)
5. Add telemetry to track how many routes are changed for observability

## Open Questions

1. **Activation thresholds**: Where are `getAIComponentRecipeActivationThreshold()` values defined? (Would need to adjust for Option C to work)
   - **Location**: Likely in a constants file or inline in heuristic scoring logic

2. **Media slot compatibility**: When switching recipes, are media slot counts validated?
   - **Current**: Yes, `estimateDesiredVisualCountForSlide()` line 4260–4276 checks slot count
   - **Risk**: Switching "stat-cards" (3 media slots) to "article-focus" (1 slot) would waste generated assets

3. **LLM-selected recipes**: How often does the LLM select a recipe explicitly?
   - **Impact**: If frequent, diversity enforcement won't help those slides anyway
   - **Mitigation**: Apply diversity to all slides, even LLM-selected ones (requires code change)

4. **User testing**: What is the actual user pain point?
   - Is it visual uniformity?
   - Is it confusing navigation (all slides look the same)?
   - Should collect UX metrics post-fix

5. **Deck consistency trade-off**: Should some decks (e.g., "quarterly sales report") intentionally use uniform layouts?
   - Current code has no "consistency mode" flag
   - Consider adding opt-in for visual consistency vs. diversity
