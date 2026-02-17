# Implementation Plan: Workflow Addition Feature

## Overview
This document outlines the implementation strategy for enhancing the Workflow Editor with bug fixes, 31 new node types, and Workflow-to-Agent-Skill conversion capabilities.

---

## Phase 1: Bug Fixes & Stabilization (Week 1-2)

### 1.1 Fix Skill Node Field Detection
**File**: `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`

**Change**:
```typescript
// Line ~213
{input.ui_type === "select" && input.name === "skill_id" ? (
```

**Verification**:
- Add skill node to workflow
- Verify skill selector dropdown appears
- Test selecting skill and saving workflow

**Impact**: Low (single line change)
**Risk**: None (correction to match backend)

### 1.2 Options Endpoint Health Check System
**New File**: `apps/web/server/routers/workflow-health.ts`

**Implementation**:
```typescript
export const workflowHealthRouter = router({
  checkEndpoints: protectedProcedure.query(async () => {
    const endpoints = [
      { path: '/available-models', required: true },
      { path: '/rag-collections', required: true },
      { path: '/available-approvers', required: false },
      { path: '/image-providers', required: false },
    ];
    
    const results = await Promise.all(
      endpoints.map(async (ep) => {
        try {
          const response = await fetchPythonBackend(ep.path, { method: 'HEAD' });
          return { ...ep, status: response.ok ? 'ok' : 'error', latency: measureLatency() };
        } catch {
          return { ...ep, status: 'error', message: 'Connection failed' };
        }
      })
    );
    
    return { endpoints: results, allRequiredOk: results.filter(r => r.required).every(r => r.status === 'ok') };
  })
});
```

**UI Integration**: Add health indicator in workflow editor sidebar

### 1.3 Executor Verification & Stubs
**Directory**: `python-backend/app/orchestrator/node_executors/`

**For each existing executor**:
1. Verify file exists and has `execute()` method
2. Add basic validation
3. Create stub executors for missing ones

**Stub Template**:
```python
class DatabaseQueryExecutor:
    async def execute(self, data, context):
        # TODO: Full implementation in Phase 4
        raise NotImplementedError(
            "DatabaseQueryExecutor not yet fully implemented. "
            "Use at your own risk."
        )
```

---

## Phase 2: High-Priority Nodes (Week 3-6)

### 2.1 HTTP Request Node

**Backend Implementation**:
```python
# python-backend/app/orchestrator/node_executors/integration/http_executor.py

import aiohttp
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class HTTPExecutor:
    """Execute HTTP requests with safety controls."""
    
    # Security: Blocklist for internal addresses
    BLOCKED_HOSTS = {'localhost', '127.0.0.1', '0.0.0.0', '[::1]'}
    MAX_REDIRECTS = 5
    DEFAULT_TIMEOUT = 30
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        url = data.inputs.get('url')
        method = data.inputs.get('method', 'GET')
        headers = data.inputs.get('headers', {})
        body = data.inputs.get('body')
        timeout = min(data.inputs.get('timeout', self.DEFAULT_TIMEOUT), 300)
        
        # Validate URL
        if not self._is_url_allowed(url):
            raise ValueError(f"URL not allowed: {url}")
        
        # Execute request
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method=method,
                url=url,
                headers=headers,
                json=body if isinstance(body, dict) else None,
                data=body if isinstance(body, str) else None,
                timeout=aiohttp.ClientTimeout(total=timeout),
                max_redirects=self.MAX_REDIRECTS
            ) as response:
                return {
                    'statusCode': response.status,
                    'response': await response.json() if 'application/json' in response.headers.get('content-type', '') else await response.text(),
                    'headers': dict(response.headers)
                }
    
    def _is_url_allowed(self, url: str) -> bool:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.hostname not in self.BLOCKED_HOSTS
```

**Frontend**: Uses existing `DynamicNodeConfig` - no changes needed

**Security Considerations**:
- Block internal network access
- Enforce timeout limits
- Limit redirect follows
- Validate SSL certificates

**Regression Risk**: Low (new node)

### 2.2 Send Email Node

**Dependencies**: Add email service

**New File**: `apps/web/server/services/emailService.ts`
```typescript
interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'ses';
  from: string;
}

export async function sendEmail(config: EmailConfig, to: string, subject: string, body: string, html?: string) {
  // Implementation based on provider
}
```

**Backend Executor**:
```python
# python-backend/app/orchestrator/node_executors/integration/email_executor.py

class EmailExecutor:
    async def execute(self, data, context):
        to = data.inputs.get('to')
        subject = data.inputs.get('subject')
        body = data.inputs.get('body')
        html = data.inputs.get('html')
        
        # Validate email format
        if not self._is_valid_email(to):
            raise ValueError(f"Invalid email: {to}")
        
        # Rate limiting check
        await self._check_rate_limit(context.user_id)
        
        # Send via configured provider
        result = await self._send_email(to, subject, body, html)
        
        return {'sent': result.success, 'messageId': result.message_id}
```

**Configuration Required**:
- Email provider credentials in environment
- Rate limiting settings

### 2.3 Schedule Trigger Node

**Backend Implementation**:
```python
# python-backend/app/orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler

class ScheduleTriggerExecutor:
    """Trigger workflow on cron schedule."""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.scheduler.start()
    
    async def register_schedule(self, workflow_id: str, cron: str, timezone: str):
        """Register a scheduled workflow."""
        job_id = f"schedule_{workflow_id}"
        
        self.scheduler.add_job(
            func=self._trigger_workflow,
            trigger='cron',
            id=job_id,
            replace_existing=True,
            timezone=timezone,
            **self._parse_cron(cron),
            args=[workflow_id]
        )
    
    def _parse_cron(self, cron: str) -> dict:
        """Parse cron expression to APScheduler kwargs."""
        parts = cron.split()
        return {
            'minute': parts[0],
            'hour': parts[1],
            'day': parts[2],
            'month': parts[3],
            'day_of_week': parts[4]
        }
```

**Database Migration**:
```sql
CREATE TABLE workflow_schedules (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Dependencies**: APScheduler library

### 2.4 Delay Node

**Backend Implementation**:
```python
# python-backend/app/orchestrator/node_executors/flow/delay_executor.py

import asyncio

class DelayExecutor:
    async def execute(self, data, context):
        duration = data.inputs.get('duration', 1)
        
        # Validate duration limits
        if not 0.1 <= duration <= 86400:
            raise ValueError(f"Duration must be between 0.1 and 86400 seconds")
        
        await asyncio.sleep(duration)
        
        return {'resumedAt': datetime.now().isoformat()}
```

**Note**: This blocks the execution thread. For production, consider:
- Checkpoint state
- Resume via scheduled task
- Or document as "soft delay"

### 2.5 Try Catch Node

**Backend Implementation**:
```python
# python-backend/app/orchestrator/node_executors/flow/try_catch_executor.py

class TryCatchExecutor:
    """Wraps execution with error handling."""
    
    async def execute(self, data, context):
        retry_count = data.inputs.get('retryCount', 0)
        fallback_value = data.inputs.get('fallbackValue')
        
        last_error = None
        
        for attempt in range(retry_count + 1):
            try:
                # Execute wrapped node
                result = await self._execute_wrapped(data, context)
                return {'result': result, 'error': None, 'attempts': attempt + 1}
            except Exception as e:
                last_error = str(e)
                if attempt < retry_count:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    break
        
        # All retries failed
        return {
            'result': fallback_value,
            'error': {'message': last_error, 'attempts': retry_count + 1},
            'attempts': retry_count + 1
        }
```

---

## Phase 3: Medium-Priority Nodes (Week 7-10)

### 3.1 Webhook Trigger/Response

**Architecture**:
- Webhook URL format: `https://api.example.com/webhooks/{webhook_id}`
- Store webhook registrations in database
- Map incoming requests to workflow executions

**Database**:
```sql
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    path VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(255), -- For signature verification
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 File Operations

**Security Requirements**:
- Sandboxed file storage per tenant
- Path traversal prevention
- File size limits
- Virus scanning (optional)

**Storage Layout**:
```
/workflow-files/{tenant_id}/{workflow_id}/{execution_id}/{filename}
```

### 3.3 CSV Parser

**Implementation**: Use Python's `csv` module with StringIO

**Features**:
- Auto-detect delimiter
- Header row detection
- Type inference
- Large file streaming

### 3.4 Template Engine

**Options**:
1. **Jinja2** (Python standard) - Full feature, security concerns
2. **Handlebars** (via pybars) - Simpler, safer
3. **Mustache** - Logic-less, safest

**Decision**: Start with Mustache for safety, add Jinja2 as advanced option

### 3.5 Retry Node

**Features**:
- Exponential backoff
- Jitter (random delay)
- Max attempts limit
- Per-error-type configuration

---

## Phase 4: Advanced Nodes (Week 11-14)

### 4.1 Parallel/Join Nodes

**Architecture Challenge**: Requires async execution engine changes

**Options**:
1. **Sequential fallback**: Run "parallel" nodes sequentially (easier)
2. **True parallel**: Use asyncio.gather (requires state management)

**Decision**: Start with sequential fallback, document limitation

### 4.2 Subworkflow Node

**Implementation**:
```python
class SubworkflowExecutor:
    async def execute(self, data, context):
        subworkflow_id = data.inputs.get('workflowId')
        inputs = data.inputs.get('inputs', {})
        
        # Load subworkflow
        subworkflow = await self._load_workflow(subworkflow_id)
        
        # Compile and execute
        compiler = WorkflowCompiler()
        manifest = compiler.compile(subworkflow.nodes, subworkflow.edges)
        
        runtime = LangGraphRuntime()
        result = await runtime.execute(manifest, inputs)
        
        return {'result': result}
```

**Security**: Check user has access to subworkflow

### 4.3 Circuit Breaker Node

**State Machine**:
```
CLOSED -> (failures > threshold) -> OPEN
OPEN -> (timeout) -> HALF_OPEN
HALF_OPEN -> (success) -> CLOSED
HALF_OPEN -> (failure) -> OPEN
```

**Storage**: Redis or database for distributed state

### 4.4 WebSocket Client

**Features**:
- Connection lifecycle management
- Auto-reconnect with backoff
- Message queuing
- Heartbeat/ping-pong

### 4.5 GraphQL Request

**Implementation**: Use `gql` library with aiohttp transport

### 4.6 AI Enhancement Nodes

**Prompt Template**:
- Store templates with variable substitution
- Support Jinja2-style syntax

**Output Parser**:
- JSON mode parsing
- Function calling format
- Error recovery

**Multi-Model Router**:
- Cost-based routing
- Complexity detection (token count)
- Fallback chain

---

## Phase 5: Workflow → Skill Conversion (Week 15-18)

### 5.1 Conversion Analysis API

**Endpoint**: `POST /api/v1/workflows/analyze-conversion`

**Implementation**:
```python
class ConversionAnalyzer:
    NODE_COMPATIBILITY = {
        'llm_call': {'supported': True, 'adapter': None},
        'rag_query': {'supported': True, 'adapter': None},
        'conditional': {'supported': True, 'adapter': None},
        'skill': {'supported': True, 'adapter': None},
        'form_input': {'supported': True, 'adapter': 'conversational'},
        'approval_gate': {'supported': True, 'adapter': 'chat_approval'},
        'webhook_trigger': {'supported': False, 'reason': 'Incompatible trigger type'},
        'schedule_trigger': {'supported': False, 'reason': 'Incompatible trigger type'},
        'parallel': {'supported': False, 'reason': 'Chat requires sequential processing'},
    }
    
    def analyze(self, workflow: Workflow) -> ConversionAnalysis:
        nodes = workflow.workflow_json.get('nodes', [])
        
        unsupported = []
        adapter_required = []
        
        for node in nodes:
            compat = self.NODE_COMPATIBILITY.get(node['type'], {'supported': False})
            if not compat['supported']:
                unsupported.append({
                    'nodeId': node['id'],
                    'nodeType': node['type'],
                    'reason': compat.get('reason', 'Unknown node type')
                })
            elif compat.get('adapter'):
                adapter_required.append({
                    'nodeId': node['id'],
                    'nodeType': node['type'],
                    'adapter': compat['adapter']
                })
        
        score = self._calculate_score(len(nodes), len(unsupported), len(adapter_required))
        
        return ConversionAnalysis(
            eligible=len(unsupported) == 0,
            score=score,
            unsupported_nodes=unsupported,
            adapters_required=adapter_required
        )
```

### 5.2 Conversion UI Flow

**Step 1**: User clicks "Convert to Skill" in workflow editor
**Step 2**: System calls analyze API, shows compatibility score
**Step 3**: If eligible, show configuration form:
- Skill name
- Description
- Trigger patterns (with examples)
- Input parameter mapping
**Step 4**: Preview converted skill
**Step 5**: Confirm and create

### 5.3 Node Adapters

**Form Input → Conversational Adapter**:
```python
class FormInputAdapter(NodeAdapter):
    def convert(self, node: dict) -> dict:
        fields = node['config'].get('fields', [])
        
        prompts = []
        for field in fields:
            prompts.append({
                'field': field['id'],
                'prompt': f"Please provide {field['label']}:",
                'required': field.get('required', False),
                'validation': field.get('validation')
            })
        
        return {
            'type': 'conversational_input',
            'config': {
                'fields': prompts,
                'collection_strategy': 'sequential'
            }
        }
```

**Approval Gate → Chat Approval Adapter**:
```python
class ApprovalGateAdapter(NodeAdapter):
    def convert(self, node: dict) -> dict:
        return {
            'type': 'chat_approval',
            'config': {
                'prompt_template': node['config'].get('message', 'Please review:'),
                'timeout_seconds': node['config'].get('timeout', 3600),
                'approval_text': 'Approved',
                'rejection_text': 'Rejected'
            }
        }
```

### 5.4 Skill Registration

**New Skill Record**:
```python
skill = {
    'slug': f'user_workflow_{workflow_id}_{timestamp}',
    'name': config.skill_name,
    'description': config.description,
    'category': 'automation',
    'isAutoTrigger': True,
    'triggerPatterns': config.trigger_patterns,
    'executionMode': 'workflow',
    'workflowId': workflow_id,
    'conversionMetadata': {
        'originalWorkflowId': workflow_id,
        'convertedAt': datetime.now().isoformat(),
        'adaptersUsed': [a['adapter'] for a in analysis.adapters_required]
    },
    'isEnabled': True,
    'enabledByDefault': False,  # User must explicitly enable
    'importSource': 'workflow_conversion'
}
```

### 5.5 Skill Executor

**Execution Flow**:
1. User sends message matching trigger pattern in chat
2. Skill detector identifies matching skill
3. Skill executor loads workflow definition
4. Map intent parameters to workflow inputs
5. Execute workflow via LangGraphRuntime
6. Format output for chat response

---

## Data Safety Strategy

### Database Migrations

**Risk Classification**: MEDIUM (new tables, no existing data modification)

**Tables to Create**:
1. `workflow_schedules` - Schedule trigger metadata
2. `webhooks` - Webhook registrations
3. `workflow_dlq` - Dead letter queue (already exists, verify)

**Migration Strategy**:
```sql
-- Expand: Create new tables
CREATE TABLE IF NOT EXISTS workflow_schedules (...);
CREATE TABLE IF NOT EXISTS webhooks (...);

-- Migrate: No data migration needed (new features)

-- Contract: Not applicable (no column changes)
```

**Backup Plan**:
```bash
# Before deployment:
pg_dump -t workflows -t skills > pre_migration_backup.sql

# Rollback:
psql < pre_migration_backup.sql
```

### Existing Functionality Compatibility

All changes are **additive**:
- New node types appear in palette
- Existing workflows continue to work
- No breaking changes to existing node types
- Conversion feature is opt-in

---

## Regression Prevention Strategy

### Testing Strategy

1. **Unit Tests**: Each new executor
2. **Integration Tests**: Workflow compilation and execution
3. **E2E Tests**: Full workflow → skill conversion flow

### Monitoring

**Metrics to Track**:
- Node execution success rate by type
- Conversion success rate
- Skill invocation success rate
- Error rates by node type

**Alerts**:
- Node execution error rate > 5%
- Conversion failure rate > 10%
- Skill execution latency > 10s

### Rollback Plan

**If Critical Issues Found**:
1. Disable new node types via feature flag
2. Revert to previous version
3. Notify affected users
4. Fix and re-deploy

---

## Implementation Checklist

### Week 1-2: Bug Fixes
- [ ] Fix skill node field detection
- [ ] Implement endpoint health check
- [ ] Verify all existing executors
- [ ] Create stub executors

### Week 3-6: High Priority Nodes
- [ ] HTTP Request node + executor
- [ ] Send Email node + service
- [ ] Schedule Trigger node + scheduler
- [ ] Delay node + executor
- [ ] Try Catch node + executor

### Week 7-10: Medium Priority Nodes
- [ ] Webhook Trigger/Response nodes
- [ ] File Read/Write nodes
- [ ] CSV Parser node
- [ ] Template Engine node
- [ ] Retry node

### Week 11-14: Advanced Nodes
- [ ] Parallel/Join nodes
- [ ] Subworkflow node
- [ ] Circuit Breaker node
- [ ] WebSocket Client node
- [ ] GraphQL Request node
- [ ] AI Enhancement nodes

### Week 15-18: Workflow → Skill Conversion
- [ ] Conversion analysis API
- [ ] Node adapters implementation
- [ ] Conversion UI flow
- [ ] Skill registration
- [ ] Integration testing

---

## Dependencies & Prerequisites

### New Dependencies

**Python Backend**:
```
aiohttp>=3.8.0          # HTTP requests
aiosmtplib>=2.0.0       # Email sending
APScheduler>=3.10.0     # Scheduling
croniter>=1.3.0         # Cron parsing
chevron>=0.14.0         # Mustache templates
gql>=3.4.0              # GraphQL
websockets>=11.0.0      # WebSocket client
```

**Node.js Backend**:
```
node-cron or bull       # Job scheduling
nodemailer              # Email sending
```

### Infrastructure Requirements

- Redis (for circuit breaker state, job queue)
- File storage (for workflow file operations)
- Email provider (SendGrid/AWS SES/SMTP)

### Configuration

```bash
# Email
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=noreply@example.com
SENDGRID_API_KEY=***

# Scheduling
REDIS_URL=redis://localhost:6379

# Security
BLOCKED_HOSTS=localhost,127.0.0.1
MAX_HTTP_TIMEOUT=300
```

---

## Success Metrics

### Phase 1
- All existing nodes execute without errors
- Health check endpoint responds < 200ms

### Phase 2-4
- 31 new node types registered and functional
- Node execution success rate > 95%

### Phase 5
- Conversion accuracy (eligible workflows correctly identified) > 90%
- Converted skill execution success rate > 85%
- User satisfaction with conversion (feedback) > 4/5
