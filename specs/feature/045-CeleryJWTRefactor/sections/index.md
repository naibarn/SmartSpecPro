# Feature 045: Section Index

<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd python-backend && python -m pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-automation-copilot-cleanup
section-02-agency-creator-llm-client
section-03-agency-creator-internal-api
section-04-verification-tests
END_MANIFEST -->

## Section 01: Automation Copilot JWT Cleanup
Remove unused `user_jwt` parameter from automation copilot tasks, API dispatch, and Node.js tRPC router.
- **Files:** `automation_copilot_task.py`, `automation_copilot.py`, `automationCopilot.ts`
- **Risk:** Low — JWT is not used, just removing dead parameter
- **Tests:** Signature tests, dispatch tests

## Section 02: Agency Creator LLM Client Migration
Replace raw `_llm_call()` with `LLMGatewayClient` for all LLM calls in agency creator tasks. Remove `user_jwt` from task signatures.
- **Files:** `agency_creator_task.py`, `agency_creator.py`
- **Risk:** Medium — changing how LLM calls authenticate
- **Dependencies:** Section 01 (pattern established)
- **Tests:** Internal token header verification, LLM call mock tests

## Section 03: Agency Creator Internal API Auth
Update `_implement_agency()` to use `X-Internal-Token` + `X-User-Id` instead of Bearer JWT. Update Node.js `/api/internal/agency/create` endpoint if needed.
- **Files:** `agency_creator_task.py`, Node.js internal API route
- **Risk:** Medium — changing auth on internal endpoint
- **Dependencies:** Section 02 (task signatures already updated)
- **Tests:** Internal API auth verification, end-to-end agency creation

## Section 04: Verification & Security Tests
Write comprehensive tests and run verification checklist. Ensure no JWT in Redis, no JWT in logs, grep returns 0 matches.
- **Files:** `tests/test_agency_creator_security.py`, `tests/test_automation_copilot_security.py`
- **Risk:** Low — test-only changes
- **Dependencies:** Sections 01-03 complete
- **Tests:** All TDD plan tests
