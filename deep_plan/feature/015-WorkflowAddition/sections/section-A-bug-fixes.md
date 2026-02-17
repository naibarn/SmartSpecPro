# Section A: Bug Fixes and Stabilization

## Overview
Address three critical bugs in the current workflow system before adding new features.

---

## A.1 Fix Skill Node Field Detection

### Problem
Frontend checks for `input.name === "skill"` but registry uses `"skill_id"`

### Solution
Update condition in `DynamicNodeConfig.tsx` line ~213

### Implementation
```typescript
// apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx
{input.ui_type === "select" && input.name === "skill_id" ? (
  <SkillSelector
    value={currentValue}
    onChange={handleSkillChange}
  />
) : (
  <DynamicSelect ... />
)}
```

### Testing
1. Add skill node to workflow
2. Verify skill selector dropdown appears
3. Select skill and save workflow
4. Verify `skill_id` is saved correctly

---

## A.2 Options Endpoint Health Check

### Problem
No visibility into which options endpoints are available

### Solution
Create health check router and UI indicator

### Implementation

**New File**: `apps/web/server/routers/workflow-health.ts`
```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const workflowHealthRouter = router({
  checkEndpoints: protectedProcedure.query(async ({ ctx }) => {
    const endpoints = [
      { path: '/api/v1/workflow/available-models', required: true },
      { path: '/api/v1/workflow/rag-collections', required: true },
      { path: '/api/v1/workflow/available-approvers', required: false },
      { path: '/api/v1/workflow/image-providers', required: false },
      { path: '/api/v1/skills', required: true },
    ];
    
    const results = await Promise.all(
      endpoints.map(async (ep) => {
        const start = Date.now();
        try {
          const response = await fetch(`${process.env.PYTHON_BACKEND_URL}${ep.path}`, {
            method: 'HEAD',
            headers: { 'Authorization': `Bearer ${ctx.token}` }
          });
          return {
            ...ep,
            status: response.ok ? 'ok' : 'error',
            latency: Date.now() - start,
            statusCode: response.status
          };
        } catch (error) {
          return {
            ...ep,
            status: 'error',
            latency: Date.now() - start,
            message: error.message
          };
        }
      })
    );
    
    return {
      endpoints: results,
      allRequiredOk: results.filter(r => r.required).every(r => r.status === 'ok'),
      timestamp: new Date().toISOString()
    };
  })
});
```

**UI Integration**: Add to workflow editor sidebar
```typescript
// In WorkflowEditor.tsx
const { data: health } = trpc.workflowHealth.checkEndpoints.useQuery();

{!health?.allRequiredOk && (
  <Alert variant="warning">
    Some integration endpoints are unavailable. 
    <Link to="/health">View details</Link>
  </Alert>
)}
```

---

## A.3 Executor Verification and Stubs

### Problem
Some node executors may be incomplete or missing

### Solution
Verify existing executors, create stubs for missing ones

### Current Executors Status
| Executor | Status | File |
|----------|--------|------|
| skill_executor | ✅ Exists | `executors/skill_executor.py` |
| llm_executor | ✅ Exists | `executors/llm_executor.py` |
| data_executors/batch | ✅ Exists | `executors/data_executors/batch_executor.py` |
| data_executors/code | ⚠️ Check | `executors/data_executors/code_executor.py` |
| data_executors/database_query | ❌ Missing | Need stub |
| data_executors/filter | ✅ Exists | `executors/data_executors/filter_executor.py` |
| data_executors/map | ✅ Exists | `executors/data_executors/map_executor.py` |
| data_executors/merge | ✅ Exists | `executors/data_executors/merge_executor.py` |
| data_executors/set | ✅ Exists | `executors/data_executors/set_executor.py` |
| data_executors/split | ✅ Exists | `executors/data_executors/split_executor.py` |
| data_executors/transformer | ✅ Exists | `executors/data_executors/transformer_executor.py` |
| data_executors/validator | ✅ Exists | `executors/data_executors/validator_executor.py` |

### Stub Implementation
```python
# python-backend/app/orchestrator/node_executors/data_executors/database_query_executor.py

import logging
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)

class DatabaseQueryExecutor:
    """
    Database Query Executor - PLACEHOLDER IMPLEMENTATION
    
    TODO: Full implementation in Phase 4
    - SQL query validation
    - Tenant isolation enforcement  
    - Read/write mode control
    - Query timeout handling
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        logger.warning("DatabaseQueryExecutor.execute() called - not fully implemented")
        
        query = data.inputs.get('query')
        connection = data.inputs.get('connection')
        
        # Validate inputs
        if not query:
            raise ValueError("Query is required")
        if not connection:
            raise ValueError("Database connection is required")
        
        # TODO: Implement actual query execution
        # - Validate query (no DDL without explicit permission)
        # - Check tenant isolation
        # - Execute with timeout
        # - Return results
        
        raise NotImplementedError(
            "DatabaseQueryExecutor is not yet fully implemented. "
            "This feature is coming in a future update. "
            "Please use Code Node with database libraries as a workaround."
        )
```

### Integration Test
```python
# tests/unit/executors/test_database_query_executor.py

import pytest
from app.orchestrator.node_executors.data_executors.database_query_executor import DatabaseQueryExecutor

@pytest.mark.asyncio
async def test_database_query_executor_placeholder():
    executor = DatabaseQueryExecutor()
    
    with pytest.raises(NotImplementedError) as exc_info:
        await executor.execute(
            data=NodeExecutionData(inputs={'query': 'SELECT 1', 'connection': 'default'}),
            context=ExecutionContext(tenant_id='test', user_id='test')
        )
    
    assert "not yet fully implemented" in str(exc_info.value)
```

---

## Testing Requirements

### Unit Tests
```bash
# Verify all data executors load
pytest tests/unit/executors/data_executors/ -v

# Verify health check endpoint
pytest tests/unit/routers/test_workflow_health.py -v
```

### Integration Tests
```bash
# Test skill node field detection
cd apps/web && npm test -- --testPathPattern="DynamicNodeConfig"

# Test workflow health endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/trpc/workflowHealth.checkEndpoints
```

---

## Definition of Done

- [ ] Skill node field detection fixed and tested
- [ ] Health check endpoint implemented
- [ ] UI shows endpoint status indicator
- [ ] All executors verified (existing + stubs)
- [ ] Unit tests pass
- [ ] No regressions in existing workflow functionality
