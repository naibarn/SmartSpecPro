# Section 02: Agency Creator LLM Client Migration

## Overview
Replace the custom `_llm_call()` function in `agency_creator_task.py` (which uses raw httpx with Bearer JWT) with the existing `LLMGatewayClient` (which uses X-Internal-Token). Remove `user_jwt` from task signatures.

## Context
The agency creator has a hand-rolled `_llm_call()` function that sends `Authorization: Bearer {user_jwt}` to `/v1/chat/completions`. The `LLMGatewayClient` class already does the same thing but uses `X-Internal-Token` + `X-User-Id` — which is the secure pattern.

## Implementation

### Step 1: Study LLMGatewayClient interface

**File:** `python-backend/app/services/llm_gateway_client.py`

Read to understand:
- Constructor parameters
- How to call chat completions
- How `user_id` is passed
- Return value format (may differ from raw httpx response)

### Step 2: Replace _llm_call with LLMGatewayClient

**File:** `python-backend/app/tasks/agency_creator_task.py`

The existing `_llm_call()` function (~line 315):
- Takes: `messages`, `model`, `user_jwt`
- Posts to `/v1/chat/completions` with Bearer JWT
- Returns parsed JSON response

Replace with a wrapper around `LLMGatewayClient`:
- Takes: `messages`, `model`, `user_id`
- Uses `LLMGatewayClient()` to make the call
- Returns the same response format (ensure backward compatibility)

**Important:** The response format from LLMGatewayClient may differ from the raw httpx POST. Check:
- Does `_llm_discover()` parse `response["choices"][0]["message"]["content"]`?
- Does `LLMGatewayClient` return the same structure?
- If not, add a thin adapter layer

### Step 3: Update all callers of _llm_call

Three functions call `_llm_call()`:
1. `_llm_discover(requirement, model, user_jwt)` → change to `_llm_discover(requirement, model, user_id)`
2. `_llm_design(requirement, intent, answers, model, user_jwt)` → change to `..., user_id)`
3. `_llm_document(spec, model, user_jwt)` → change to `..., user_id)`

And their callers in the async functions:
- `_discover_async()` — passes `user_jwt` to `_llm_discover()` → change to `user_id`
- `_design_async()` — passes `user_jwt` to `_llm_design()`, `_llm_document()` → change to `user_id`

### Step 4: Remove user_jwt from task signatures

**`create_agency_discover_task`:**
- Remove `user_jwt: str` from parameter list
- Update `_run_async(_discover_async(...))` to pass `user_id` not `user_jwt`

**`create_agency_design_task`:**
- Remove `user_jwt: str` from parameter list
- Update `_run_async(_design_async(...))` to pass `user_id` not `user_jwt`

### Step 5: Remove user_jwt from API dispatch

**File:** `python-backend/app/api/agency_creator.py`

- Remove `credentials.credentials` extraction (was getting JWT from Authorization header)
- Remove `user_jwt` from `create_agency_discover_task.delay()` call
- Keep `current_user.id` — this becomes `user_id` in the task

### Step 6: Update chain dispatch (discover → design)

In `_discover_async()`, where it dispatches `create_agency_design_task.delay()`:
- Remove `user_jwt=user_jwt` from the `.delay()` call
- `user_id` is already passed in the chain

### Step 7: Remove old _llm_call function

After all callers are updated, delete the old `_llm_call()` function that used raw httpx.

## Tests (TDD)

```python
# test_agency_creator_security.py

import inspect
from unittest.mock import AsyncMock, patch

def test_discover_task_no_jwt_param():
    from app.tasks.agency_creator_task import create_agency_discover_task
    sig = inspect.signature(create_agency_discover_task)
    assert "user_jwt" not in sig.parameters

def test_design_task_no_jwt_param():
    from app.tasks.agency_creator_task import create_agency_design_task
    sig = inspect.signature(create_agency_design_task)
    assert "user_jwt" not in sig.parameters

@patch("app.services.llm_gateway_client.LLMGatewayClient")
async def test_llm_call_uses_internal_token(mock_client):
    # Verify _llm_call (or its replacement) uses LLMGatewayClient
    # not raw httpx with Bearer JWT
    mock_instance = AsyncMock()
    mock_client.return_value = mock_instance
    mock_instance.chat_completions.return_value = {"choices": [{"message": {"content": "test"}}]}

    # Call the function
    # Verify mock_instance was called (proving LLMGatewayClient was used)
    # Verify no Authorization: Bearer header was constructed
```

## Risks & Mitigations
- **Risk:** LLMGatewayClient returns different response format than raw httpx
- **Mitigation:** Read the client code first, add adapter if needed
- **Risk:** LLMGatewayClient doesn't support all the parameters _llm_call uses (temperature, max_tokens)
- **Mitigation:** Check client interface — these are likely already supported
- **Risk:** Breaking discover→design chain dispatch
- **Mitigation:** Verify the chain dispatch separately in tests
