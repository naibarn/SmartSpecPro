# Section 01: Automation Copilot JWT Cleanup

## Overview
Remove the unused `user_jwt` parameter from automation copilot task signatures, API dispatch calls, and the Node.js tRPC router that sends it.

## Context
Research confirmed that `automation_analyze_task` and `automation_execute_task` receive `user_jwt` as a parameter but never use it. The tasks already use `LLMGatewayClient` which authenticates via `X-Internal-Token`. This section is a safe cleanup.

## Implementation

### Step 1: Remove user_jwt from task signatures

**File:** `python-backend/app/tasks/automation_copilot_task.py`

**automation_analyze_task (line ~78):**
- Remove `user_jwt: str` from the parameter list
- Remove the TODO comment about replacing user_jwt
- Keep `user_id`, `tenant_id`, `prompt` parameters unchanged

**automation_execute_task (line ~157):**
- Remove `user_jwt: str` from the parameter list
- Remove the TODO comment
- Keep all other parameters unchanged

### Step 2: Remove user_jwt from API dispatch

**File:** `python-backend/app/api/automation_copilot.py`

- Find the Pydantic request body model — remove `user_jwt` field
- Find `automation_analyze_task.delay(...)` call — remove `user_jwt` argument
- Find `automation_execute_task.delay(...)` call — remove `user_jwt` argument
- Keep `user_id`, `tenant_id` in both calls

### Step 3: Remove userToken from Node.js tRPC router

**File:** `apps/web/server/routers/automationCopilot.ts`

- Find where `ctx.userToken` or equivalent is included in the POST body to Python API
- Remove the `user_jwt` field from the body object
- Keep `userId`, `tenantId` in the body

### Step 4: Verify

```bash
# Should return 0 matches:
grep -n "user_jwt" python-backend/app/tasks/automation_copilot_task.py
grep -n "user_jwt" python-backend/app/api/automation_copilot.py
```

## Tests (TDD — write before implementation)

```python
# test_automation_copilot_security.py

import inspect
from app.tasks.automation_copilot_task import automation_analyze_task, automation_execute_task

def test_analyze_task_no_jwt_param():
    # Use .run to get the actual function signature (Celery wraps the task)
    sig = inspect.signature(automation_analyze_task.run)
    assert "user_jwt" not in sig.parameters

def test_execute_task_no_jwt_param():
    sig = inspect.signature(automation_execute_task.run)
    assert "user_jwt" not in sig.parameters
```

## Risks & Mitigations
- **Risk:** Breaking existing dispatches if any caller still sends user_jwt positionally
- **Mitigation:** Search all callers with `grep -rn "automation_analyze_task\|automation_execute_task" python-backend/`
- **Risk:** Other code reading user_jwt from the task
- **Mitigation:** Research confirmed it's never read — grep for `user_jwt` in both task functions body returns 0 uses
