# Section 01: Discover Enhancement

## Goal
Upgrade `_llm_discover()` to output capability analysis alongside requirement analysis. The LLM should determine what capabilities each agent needs based on the user's requirement — not ask the user.

## File
`python-backend/app/tasks/agency_creator_task.py`, function `_llm_discover()` (lines 414-500)

## Actual Implementation

### 1. Updated discover system prompt
Extended the system prompt JSON schema with new fields: `recommended_capabilities`, `complexity_level`, `memory_recommendation`, `domain_insights`. Added CAPABILITY ANALYSIS and COMPLEXITY ASSESSMENT instruction blocks.

### 2. Updated prompt instructions
Added "Do NOT ask technical questions" instruction with good/bad question examples.

### 3. Updated fallback
Fallback dict includes all new fields with safe defaults (all capabilities False, complexity "moderate", memory True).

### 4. Budget cap with retry enforcement
Added `MAX_DISCOVER_CALLS = 2` constant at module level. Implemented retry-on-parse-failure loop using a sentinel object to distinguish parse failures from valid fallbacks. On JSON parse failure, retries up to `MAX_DISCOVER_CALLS` times before falling back.

### 5. Security: computer_use guardrail
Added unconditional `supportsComputerUse` strip in `_validate_spec()`. Since `_validate_spec` is synchronous and cannot call the async `check_agentic_flag`, the guardrail strips unconditionally as a safe default. The async caller (`_implement_agency`) can re-enable after a flag check if needed.

### 6. Response normalization
After parsing, the function ensures all new fields are present with safe defaults even if the LLM omits them. Missing capability keys default to False, invalid complexity_level defaults to "moderate".

## Files Modified
- `python-backend/app/tasks/agency_creator_task.py` — `_llm_discover()`, `_validate_spec()`, `MAX_DISCOVER_CALLS`
- `python-backend/tests/test_agency_creator_v2.py` — 7 new tests in `TestLlmDiscover` and `TestValidateSpecComputerUseGuardrail`

## Tests (7 total)
- `test_discover_returns_capability_fields` — verifies LLM response includes all new fields
- `test_discover_fallback_has_capability_fields` — verifies fallback on LLM failure
- `test_discover_budget_cap_retries_on_parse_failure` — verifies retry on bad JSON, respects MAX_DISCOVER_CALLS
- `test_discover_budget_cap_falls_back_after_max_retries` — verifies fallback after exhausting retries
- `test_discover_no_technical_questions` — verifies system prompt contains "Do NOT ask technical questions"
- `test_computer_use_stripped_when_present` — verifies supportsComputerUse stripped in _validate_spec
- `test_computer_use_not_stripped_when_absent` — verifies no side effects when flag not set

## Deviations from Plan
- computer_use guardrail strips unconditionally (sync limitation) instead of checking feature flag
- Added retry loop for MAX_DISCOVER_CALLS enforcement (plan only defined constant)
