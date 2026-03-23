# Section 02: Interview Replacement

## Goal
Replace technical interview with LLM-driven decision making. User should never be asked about execution modes, model selection, or capabilities. Only goal-clarification questions are allowed.

## Actual Implementation

### 1. Technical question filter
Added `TECHNICAL_KEYWORDS` list and `_filter_goal_questions()` function. Filters out questions containing technical terms (execution mode, model, planning strategy, etc.). Used "react executor" instead of bare "react" to avoid false positives on goal questions.

### 2. Question limit
Added `MAX_GOAL_QUESTIONS = 3` constant. After filtering, only first 3 goal questions are kept.

### 3. Discover analysis passthrough
Built `discover_analysis` dict from intent in `_discover_async()`. Passed via:
- Celery payload on skip-interview path
- Celery payload on is_clear path
- Redis `_discover_analysis` key on awaiting-answers path
- Answer endpoint reads from Redis status and includes in design payload

### 4. Design task reads discover_analysis
`_design_async()` extracts `discover_analysis` from payload and passes to `_llm_plan()`.

### 5. Capability context in plan prompt
`_llm_plan()` now accepts optional `discover_analysis` parameter. Injects recommended capabilities and complexity level into the user message.

## Files Modified
- `python-backend/app/tasks/agency_creator_task.py` — `_filter_goal_questions()`, `_discover_async()`, `_design_async()`, `_llm_plan()`
- `python-backend/app/api/agency_creator.py` — `submit_agency_creator_answers()` passes `_discover_analysis`
- `python-backend/tests/test_agency_creator_v2.py` — 7 new tests

## Tests (7 new, 27 total)
- `TestFilterGoalQuestions` (4 tests): technical filtering, all keywords, limit cap, empty input
- `TestDiscoverAnalysisPassthrough` (3 tests): skip-interview path, is_clear path, Redis storage for interview path

## Deviations from Plan
- Used "react executor" instead of bare "react" in TECHNICAL_KEYWORDS (reviewer caught false positive risk)
- `_llm_design` discover_analysis injection deferred to section-04 (review enhancement)
