# Section 04 Code Review Interview

## User Decisions

### Model name: gpt-5.4 vs gpt-4.1
- **Decision**: Keep gpt-4.1
- **Rationale**: gpt-5.4 from plan was aspirational. gpt-4.1 is a real model the gateway can resolve.

### Resource leak in WebAutomationExecutor
- **Decision**: Defer to follow-up
- **Rationale**: BrowserPool/SelectorCache manage their own lifecycles. LLMGatewayClient is just an httpx wrapper. Real resource management needs DI framework.

### Tenant-specific vision_model from system_settings
- **Decision**: Defer
- **Rationale**: System settings integration is cross-cutting. Current inputs.get('vision_model', 'gpt-4o') works for MVP.

## Auto-fixes Applied

### Fix 1: Vision system prompts were dead code
- Both `_VISION_SYSTEM_PROMPT` and `_DIAGNOSIS_SYSTEM_PROMPT` were defined but never sent to the LLM
- Changed from `gateway.vision_call()` (single user message) to `gateway.chat_completion()` with explicit system + user messages containing image content blocks
- System prompt now actually reaches the LLM

### Fix 2: Missing tenant_id and user_id in vision calls
- `_vision_llm_call()` now accepts and passes `tenant_id` and `user_id` to `chat_completion()`
- `generate()` passes `tenant_id` through to the vision call
- Ensures credit deduction and audit logging attribute to correct user/tenant

### Fix 3: No JSON parsing error handling in _vision_llm_call
- Added try/except for `json.JSONDecodeError` in `playwright_script_generator.py`
- Raises `ScriptGenerationError` with preview of malformed content
- Matches the error handling pattern in `self_healing_executor.py`

### Fix 4: Bare exception leaks internals in WebAutomationExecutor
- Changed `f"Unexpected error: {exc}"` to generic `"An unexpected error occurred during automation"`
- Internal details logged server-side only via structlog

### Fix 5: GatewayUnavailableError import moved to module level
- Moved from runtime import inside try block to top-level import
- Consistent with other imports, avoids unnecessary import overhead on hot path

### Fix 6: Added tests for JSON error handling and tenant context
- `test_invalid_json_raises_script_generation_error` — verifies ScriptGenerationError on bad JSON
- `test_tenant_id_passed_through` — verifies tenant_id and user_id reach gateway

## Items Let Go

- AUTOMATION_LLM_ENABLED=false rollback tests: Deferred, the flag works but testing it adds complexity for a rollback mechanism
- Max heal attempts / cache invalidation integration tests: Already tested in existing SelfHealingExecutor tests
- Deprecated asyncio pattern in existing test: Pre-existing code, not introduced by this section
- Test assertion style (string matching): Minor, tests are functional
