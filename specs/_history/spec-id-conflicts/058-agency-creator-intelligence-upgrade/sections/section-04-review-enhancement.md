# Section 04: Review Enhancement

## Goal
Upgrade `_llm_review_plan()` and `_llm_review_design()` to check for intelligence/capability completeness alongside structural checks.

## Files Modified
- `python-backend/app/tasks/agency_creator_task.py` — updated both review functions with intelligence checks, discover_analysis param, fix instruction
- `python-backend/tests/test_agency_creator_v2.py` — 5 new tests

## Implementation Details

### 1. Updated `_llm_review_plan()` system prompt
Added INTELLIGENCE CHECKS 9-12:
- Execution complexity per agent (single_shot vs agentic)
- Capability requirements identified
- Memory strategy defined
- Objective clarity for self-improvement loop

Added `discover_analysis` optional parameter to inject capability context.
Added "IMPORTANT: If you find issues, fix them in the returned plan."

### 2. Updated `_llm_review_design()` system prompt
Added INTELLIGENCE CHECKS 11-16:
- executionMode set on every agent/supervisor
- planningStrategy for agentic agents
- modelRequirements with appropriate capabilities
- enableLongTermMemory for learning agents
- memoryScope for collaborative workflows
- Specific agency objective

Added `discover_analysis` optional parameter with complexity/memory hints.
Added "IMPORTANT: If you find issues, fix them in the returned spec."

### 3. Updated call sites in `_design_async()`
Both `_llm_review_plan` and `_llm_review_design` now receive `discover_analysis=discover_analysis`.

## Tests (5 new)
- `test_review_plan_includes_intelligence_checks_in_prompt` — Verifies INTELLIGENCE CHECKS in plan review prompt
- `test_review_plan_includes_discover_capabilities` — Verifies discover analysis injected into prompt
- `test_review_design_includes_intelligence_checks` — Verifies all 6 intelligence items in design review
- `test_review_design_includes_fix_instruction` — Verifies fix instruction in design review
- `test_review_plan_includes_fix_instruction` — Verifies fix instruction in plan review

## Review Notes
- Budget bypass concern for review calls was pre-existing (not introduced by this section). `_design_async` already guards with `MAX_LLM_CALLS` check in the review loops.
- Added complexity/memory hints to `_llm_review_design` per review feedback (was only in plan review initially).
