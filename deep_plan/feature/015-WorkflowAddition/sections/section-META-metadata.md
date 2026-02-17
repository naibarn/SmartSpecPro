# Section META: Implementation Metadata

## Overview
Dependencies, configuration, testing strategy, and success metrics for the Workflow Addition Feature.

---

## Dependencies

### Python Backend

**Add to**: `python-backend/requirements.txt`

```txt
# HTTP/Web
aiohttp>=3.8.0
aiohttp-retry>=2.8.0
websockets>=11.0.0

# Email
aiosmtplib>=2.0.0

# Scheduling
croniter>=1.3.0
pytz>=2023.3

# Templating
chevron>=0.14.0
Jinja2>=3.1.0

# GraphQL
gql>=3.4.0

# Data Processing
aiofiles>=23.0.0

# Security
RestrictedPython>=6.0
```

### Node.js Backend

**Add to**: `apps/web/server/package.json`

```json
{
  "dependencies": {
    "node-cron": "^3.0.2",
    "bull": "^4.11.0",
    "ioredis": "^5.3.0"
  }
}
```

### Infrastructure

| Component | Purpose | Status |
|-----------|---------|--------|
| Redis | Circuit breaker state, job queue | Required for Phase 4 |
| File Storage | Workflow file operations | Required for Phase 3 |
| Email Provider | Send email node | Required for Phase 2 |

---

## Configuration

### Environment Variables

```bash
# Email Configuration
EMAIL_PROVIDER=sendgrid  # Options: sendgrid, ses, smtp
EMAIL_FROM=noreply@smartspec.pro
SENDGRID_API_KEY=sg_xxx
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx

# HTTP Security
BLOCKED_HOSTS=localhost,127.0.0.1,0.0.0.0,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
MAX_HTTP_TIMEOUT=300
MAX_RESPONSE_SIZE=10485760

# Scheduling
REDIS_URL=redis://localhost:6379
SCHEDULER_ENABLED=true

# File Storage
WORKFLOW_FILES_PATH=/var/lib/smartspec/workflow-files
MAX_FILE_SIZE=104857600

# Circuit Breaker
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_STORAGE=redis  # Options: memory, redis
```

### Database Migrations

**File**: `migrations/20240217_workflow_additions.sql`

```sql
-- Workflow schedules for trigger nodes
CREATE TABLE IF NOT EXISTS workflow_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    trigger_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_run 
ON workflow_schedules(next_run_at) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow 
ON workflow_schedules(workflow_id);

-- Webhook registrations
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    path VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_path ON webhooks(path);
CREATE INDEX IF NOT EXISTS idx_webhooks_workflow ON webhooks(workflow_id);

-- Skills table extension (if needed)
ALTER TABLE skills 
ADD COLUMN IF NOT EXISTS workflow_id INTEGER REFERENCES workflows(id),
ADD COLUMN IF NOT EXISTS conversion_metadata JSONB;

-- Execution checkpoints for resume
CREATE TABLE IF NOT EXISTS execution_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_checkpoints_execution 
ON execution_checkpoints(execution_id);
```

---

## Testing Strategy

### Test Pyramid

```
    /\
   /  \  E2E Tests (10%)
  /----\  - Full conversion flow
 /      \ - Critical path workflows
/--------\
/          \  Integration Tests (30%)
/------------\  - Node execution
/              \ - API endpoints
/----------------\n/                  \  Unit Tests (60%)
/--------------------\  - Executors
                        - Adapters
                        - Utilities
```

### Unit Test Examples

```python
# tests/unit/executors/integration/test_http_executor.py

import pytest
from unittest.mock import patch, AsyncMock
from app.orchestrator.node_executors.integration.http_executor import HTTPExecutor

@pytest.fixture
def executor():
    return HTTPExecutor()

@pytest.fixture
def context():
    return ExecutionContext(
        tenant_id='test_tenant',
        user_id='test_user',
        execution_id='test_exec'
    )

@pytest.mark.asyncio
async def test_http_get_success(executor, context):
    """Test successful HTTP GET request."""
    with patch('aiohttp.ClientSession') as mock_session:
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {'content-type': 'application/json'}
        mock_response.json = AsyncMock(return_value={'result': 'success'})
        
        mock_session.return_value.__aenter__.return_value.request.return_value.__aenter__.return_value = mock_response
        
        result = await executor.execute(
            data=NodeExecutionData(inputs={
                'url': 'https://api.example.com/test',
                'method': 'GET'
            }),
            context=context
        )
        
        assert result['statusCode'] == 200
        assert result['body'] == {'result': 'success'}

@pytest.mark.asyncio
async def test_http_blocked_localhost(executor, context):
    """Test that localhost is blocked."""
    with pytest.raises(ValueError, match="not allowed"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                'url': 'http://localhost:3000/api'
            }),
            context=context
        )

@pytest.mark.asyncio
async def test_http_timeout_enforcement(executor, context):
    """Test timeout is enforced."""
    with pytest.raises(ValueError, match="exceeds maximum"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                'url': 'https://api.example.com/test',
                'timeout': 1000  # Exceeds MAX_TIMEOUT
            }),
            context=context
        )
```

### Integration Test Examples

```python
# tests/integration/test_workflow_conversion.py

import pytest
from fastapi.testclient import TestClient

@pytest.mark.integration
async def test_workflow_conversion_flow(client: TestClient):
    """Test complete conversion flow."""
    
    # 1. Create workflow
    workflow_response = await client.post('/api/v1/workflows', json={
        'name': 'Test Workflow',
        'nodes': [
            {'id': '1', 'type': 'text_input', 'config': {}},
            {'id': '2', 'type': 'llm_call', 'config': {'model': 'gpt-4'}},
        ],
        'edges': [
            {'source': '1', 'target': '2'}
        ]
    })
    workflow_id = workflow_response.json()['id']
    
    # 2. Analyze conversion
    analysis_response = await client.post('/api/v1/workflows/analyze-conversion', json={
        'workflowId': workflow_id
    })
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis['eligible'] == True
    assert analysis['compatibilityScore'] >= 80
    
    # 3. Convert to skill
    conversion_response = await client.post('/api/v1/workflows/convert-to-skill', json={
        'workflowId': workflow_id,
        'config': {
            'name': 'Test Skill',
            'triggerPatterns': ['test {input}']
        }
    })
    assert conversion_response.status_code == 200
    skill_id = conversion_response.json()['skillId']
    
    # 4. Verify skill created
    skill_response = await client.get(f'/api/v1/skills/{skill_id}')
    assert skill_response.status_code == 200
    skill = skill_response.json()
    assert skill['name'] == 'Test Skill'
    assert skill['executionMode'] == 'workflow'
```

### E2E Test Examples

```typescript
// tests/e2e/workflow-conversion.spec.ts

import { test, expect } from '@playwright/test';

test('user can convert workflow to skill', async ({ page }) => {
  // 1. Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // 2. Navigate to workflow editor
  await page.goto('/workflows');
  await page.click('text=New Workflow');
  
  // 3. Add nodes
  await page.click('text=LLM Call');
  await page.click('text=Save');
  
  // 4. Convert to skill
  await page.click('text=Convert to Skill');
  
  // 5. Verify analysis
  await expect(page.locator('text=Compatibility Score')).toBeVisible();
  await expect(page.locator('text=/[0-9]+\\/100/')).toBeVisible();
  
  // 6. Fill configuration
  await page.fill('[name="skillName"]', 'My Test Skill');
  await page.fill('[name="triggerPattern"]', 'run test for {name}');
  
  // 7. Complete conversion
  await page.click('text=Convert');
  
  // 8. Verify success
  await expect(page.locator('text=Skill created successfully')).toBeVisible();
});
```

---

## Success Metrics

### Phase 1: Bug Fixes
| Metric | Target | Measurement |
|--------|--------|-------------|
| Skill node detection | 100% | Test skill node in editor |
| Health check uptime | >99% | Monitor endpoint |
| Executor coverage | 100% | All nodes have executors |

### Phase 2-4: Node Implementation
| Metric | Target | Measurement |
|--------|--------|-------------|
| Node execution success rate | >95% | Execution logs |
| Average execution time | <5s | Performance monitoring |
| Security incidents | 0 | Security audit |
| Test coverage | >80% | Code coverage report |

### Phase 5: Conversion
| Metric | Target | Measurement |
|--------|--------|-------------|
| Conversion accuracy | >90% | Eligible workflows correctly identified |
| Converted skill success rate | >85% | Skill execution success |
| User satisfaction | >4/5 | Post-conversion survey |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Security vulnerability in HTTP node | High | Medium | URL validation, IP blocking, request limits |
| Circuit breaker memory leak | Medium | Low | Use Redis for state, add TTL |
| Schedule trigger drift | Medium | Medium | Use external scheduler (Celery/APScheduler) |
| Conversion breaking existing skills | High | Low | Separate skill namespace, feature flags |
| Performance degradation | Medium | Medium | Load testing, circuit breakers, caching |

---

## Rollback Plan

### Feature Flags

```typescript
// Feature flag configuration
const FEATURE_FLAGS = {
  HTTP_REQUEST_NODE: true,
  SCHEDULE_TRIGGER_NODE: true,
  WORKFLOW_CONVERSION: true,
  ADVANCED_NODES: false,  // Gradual rollout
};

// Usage in code
if (FEATURE_FLAGS.HTTP_REQUEST_NODE) {
  nodeTypes.push(httpRequestNode);
}
```

### Rollback Steps

1. **Disable feature flags** for problematic nodes
2. **Revert database migrations** (if needed):
   ```bash
   psql -f migrations/rollback/20240217_workflow_additions.sql
   ```
3. **Rollback deployment**:
   ```bash
   kubectl rollout undo deployment/smartspec-web
   kubectl rollout undo deployment/smartspec-python
   ```
4. **Notify affected users** via email and in-app notifications

---

## Documentation

### User Documentation
- Workflow node reference
- Conversion guide
- Best practices for skill-ready workflows

### Developer Documentation
- Adding new node types
- Node adapter development
- Testing guidelines

### API Documentation
- tRPC router endpoints
- Python backend executors
- Webhook integration

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | Weeks 1-2 | Bug fixes, executor stubs |
| Phase 2 | Weeks 3-6 | 5 high-priority nodes |
| Phase 3 | Weeks 7-10 | 5 medium-priority nodes |
| Phase 4 | Weeks 11-14 | 10 advanced nodes |
| Phase 5 | Weeks 15-18 | Workflow conversion system |
| **Total** | **18 weeks** | 31 nodes + conversion |

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Technical Lead | TBD | | Pending |
| Product Owner | TBD | | Pending |
| Security Review | TBD | | Pending |
