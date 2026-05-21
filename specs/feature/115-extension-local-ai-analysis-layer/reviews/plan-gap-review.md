# Plan Gap Review - Feature 115

Date: 2026-05-21
Review mode: self_review

## Result

Plan is implementation-ready after additions in this review.

## Gaps Found And Added

### 1. Pre-implementation unknowns needed an explicit phase

Added Phase 0 to verify Prompt API execution context, file ownership, storage model, Feature 114 import target, and package scripts before implementation starts.

### 2. UI state transitions needed one canonical state machine

Added a state machine covering capture, AI detection, download, local/server analysis, insight preview, sync, failure, cancellation, and stale results.

### 3. Stale insight handling was under-specified

Added stale-state rules for source payload changes, schema version changes, selected image changes, claim edits, language preference changes, and user settings changes.

### 4. Server fallback parity needed to be explicit

Added a requirement that server AI fallback uses the same schemas, evidence checks, lifecycle states, and storytelling handoff path as local Prompt API output.

### 5. Feature 114 roundtrip edits needed provenance rules

Added rules for claim/image/journey/scene edits from Feature 114 to update provenance, mark derived handoffs stale, and allow re-analysis.

### 6. Operational support needed safe diagnostics

Added a diagnostic export requirement that includes capability state and error codes but excludes product text, comments, reviews, prompts, and raw model output.

### 7. Implementation ownership needed clearer routing

Added likely file ownership groups for extension contracts, provider, sanitizer/cache, side panel UI, web/API sync, Feature 114 bridge, and tests/fixtures.

## Remaining Non-Blocking Notes

- Exact paths should be finalized after opening the current extension/web file structure during implementation.
- Exact migration shape still depends on the current ORM schema.
- Exact Feature 114 import route/component name should be confirmed in Phase 0.
