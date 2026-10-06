# Section 04 Code Review Interview

## Decisions

### HIGH: Budget bypass on review calls
**Decision:** LET GO. Pre-existing pattern — `_design_async` already guards with `if llm_call_count >= MAX_LLM_CALLS: break` in the review loops. The budget counting happens at the caller level, not inside review functions. Not introduced by this section.

### HIGH: Missing fix-instruction test for _llm_review_plan
**Decision:** AUTO-FIX. Add test.

### MEDIUM: Design reviewer missing complexity/memory hints
**Decision:** AUTO-FIX. Add to capability_hint in _llm_review_design.

### MEDIUM: F02 test weakness
**Decision:** LET GO. Pre-existing from section 03, already acknowledged.

### MEDIUM: Patch target for deferred imports
**Decision:** LET GO. Tests pass correctly in practice.

### LOW items
**Decision:** LET GO.
