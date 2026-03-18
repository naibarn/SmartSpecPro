# Feature 045: TDD Plan — Remove JWT from Celery Task Arguments

## Test Strategy

This feature primarily modifies internal auth flow — tests focus on:
1. Verifying JWT is NOT in task arguments
2. Verifying internal token auth works for all HTTP calls
3. Verifying end-to-end task execution succeeds

## Phase 1 Tests: Automation Copilot

### Test 1.1: Task Signature (Unit)
```python
# test: automation_analyze_task does not accept user_jwt parameter
# verify: calling without user_jwt succeeds
# verify: inspect.signature() shows no user_jwt param
```

### Test 1.2: Task Dispatch (Unit)
```python
# test: automation copilot API dispatch does not pass user_jwt
# mock: celery .delay() call
# verify: user_jwt not in call args
```

### Test 1.3: Request Body Schema (Unit)
```python
# test: AutomationCopilotRequest model does not have user_jwt field
# verify: Pydantic model rejects body with user_jwt
```

## Phase 2 Tests: Agency Creator

### Test 2.1: Task Signature (Unit)
```python
# test: create_agency_discover_task does not accept user_jwt parameter
# test: create_agency_design_task does not accept user_jwt parameter
# verify: inspect.signature() shows no user_jwt param
```

### Test 2.2: LLM Call Uses Internal Token (Unit)
```python
# test: _llm_call uses LLMGatewayClient, not raw httpx with Bearer
# mock: LLMGatewayClient
# verify: X-Internal-Token header is sent
# verify: X-User-Id header contains correct user_id
# verify: Authorization header does NOT contain user JWT
```

### Test 2.3: Agency Creation Uses Internal Token (Unit)
```python
# test: _implement_agency sends X-Internal-Token, not Bearer JWT
# mock: httpx.AsyncClient.post
# verify: headers contain X-Internal-Token
# verify: headers contain X-User-Id
# verify: headers do NOT contain Authorization: Bearer
```

### Test 2.4: Chain Dispatch (Unit)
```python
# test: discover task dispatches design task without user_jwt
# mock: create_agency_design_task.delay
# verify: user_jwt not in .delay() call args
```

### Test 2.5: API Endpoint (Integration)
```python
# test: agency creator FastAPI endpoint dispatches task without JWT
# mock: celery .delay()
# verify: user_jwt not in task args
# verify: user_id IS in task args
```

## Verification Tests (Both Phases)

### Test V.1: No JWT in Codebase (Grep Check)
```bash
# test: no user_jwt references remain in task files
# command: grep -r "user_jwt" python-backend/app/tasks/
# expected: 0 matches (or only in comments/docstrings)
```

### Test V.2: Redis Message Inspection (Integration)
```python
# test: Celery task message in Redis contains no JWT-like strings
# setup: dispatch an agency creator task with mock
# inspect: Redis message body
# verify: no string matching JWT pattern (eyJ...) in message
```

### Test V.3: Internal Token Env Var (Smoke)
```python
# test: SMARTSPEC_WEB_GATEWAY_TOKEN is set and non-empty
# verify: both Python and Node.js can read it
# verify: token is at least 32 chars
```

## Test File Locations

| Test File | Tests |
|-----------|-------|
| `python-backend/tests/test_agency_creator_security.py` | Tests 2.1-2.5, V.2 |
| `python-backend/tests/test_automation_copilot_security.py` | Tests 1.1-1.3 |
| `python-backend/tests/test_internal_token_auth.py` | Test V.3, internal token verification |
