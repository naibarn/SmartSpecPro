# Section 04: Verification & Security Tests

## Overview
Write comprehensive tests verifying JWT has been fully removed from Celery task arguments across both automation copilot and agency creator flows. Run the verification checklist.

## Context
Sections 01-03 removed all `user_jwt` parameters. This section ensures the removal is complete and no regressions exist.

## Implementation

### Step 1: Create test file for automation copilot

**File:** `python-backend/tests/test_automation_copilot_security.py`

Tests:
1. `test_analyze_task_no_jwt_param` — inspect.signature check
2. `test_execute_task_no_jwt_param` — inspect.signature check
3. `test_analyze_dispatch_no_jwt` — mock .delay(), verify no user_jwt arg
4. `test_execute_dispatch_no_jwt` — mock .delay(), verify no user_jwt arg

### Step 2: Create test file for agency creator

**File:** `python-backend/tests/test_agency_creator_security.py`

Tests:
1. `test_discover_task_no_jwt_param` — inspect.signature check
2. `test_design_task_no_jwt_param` — inspect.signature check
3. `test_llm_call_uses_internal_token` — verify LLMGatewayClient used
4. `test_implement_agency_uses_internal_token` — verify X-Internal-Token header
5. `test_design_dispatch_no_jwt` — mock .delay(), verify chain dispatch clean

### Step 3: Create internal token verification test

**File:** `python-backend/tests/test_internal_token_auth.py`

Tests:
1. `test_internal_api_token_exists` — verify env var is set and non-empty
2. `test_internal_api_token_min_length` — verify >= 32 chars
3. `test_llm_gateway_client_uses_internal_token` — verify client sends correct headers

### Step 4: Run verification checklist

Execute these commands and verify results:

```bash
# 1. No user_jwt in task files
grep -rn "user_jwt" python-backend/app/tasks/
# Expected: 0 matches (or only in comments)

# 2. No user_jwt in API dispatch files
grep -rn "user_jwt" python-backend/app/api/agency_creator.py
grep -rn "user_jwt" python-backend/app/api/automation_copilot.py
# Expected: 0 matches

# 3. No JWT pattern in test Celery messages
# (manual verification during integration testing)

# 4. Run all new tests
cd python-backend && pytest tests/test_agency_creator_security.py tests/test_automation_copilot_security.py tests/test_internal_token_auth.py -v

# 5. Run existing test suite to check regressions
cd python-backend && pytest --tb=short -q
```

### Step 5: Update .env.example files

If `SMARTSPEC_WEB_GATEWAY_TOKEN` is not in example files:
- Add to `python-backend/.env.example`
- Add to `apps/web/.env.example`
- Add comment explaining what it's for

### Step 6: Document in CLAUDE.md

Add a note to the Encryption & Secrets Safety section about the internal token pattern:
```
### Internal Service Token
- `SMARTSPEC_WEB_GATEWAY_TOKEN` — shared secret for Python → Node.js service calls
- Used by: LLMGatewayClient, agency creator, automation copilot
- Must be identical in both python-backend/.env and apps/web/.env
- Minimum 32 characters, generated with `openssl rand -hex 32`
```

## Tests Summary

| Test File | Count | Coverage |
|-----------|-------|----------|
| `test_automation_copilot_security.py` | 4 | Task signatures, API dispatch |
| `test_agency_creator_security.py` | 5 | Task signatures, LLM client, internal API, chain dispatch |
| `test_internal_token_auth.py` | 3 | Token config, client headers |
| **Total** | **12** | All JWT removal points verified |

## Risks & Mitigations
- **Risk:** Existing tests break due to changed signatures
- **Mitigation:** Update any existing test mocks that pass user_jwt
- **Risk:** CI/CD pipeline doesn't have SMARTSPEC_WEB_GATEWAY_TOKEN set
- **Mitigation:** Add to CI env vars or use test-specific value
