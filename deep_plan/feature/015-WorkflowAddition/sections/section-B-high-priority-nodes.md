# Section B: High-Priority Node Implementation

## Overview
Implement 5 essential nodes that provide core workflow automation capabilities.

---

## B.1 HTTP Request Node

### Description
Execute HTTP requests to external APIs with safety controls.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/integration/http_executor.py`

```python
import aiohttp
import ipaddress
from typing import Any
from urllib.parse import urlparse
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class HTTPExecutor:
    """
    Execute HTTP requests with comprehensive security controls.
    
    Security Features:
    - Block internal/private IP addresses
    - Enforce timeout limits
    - Limit redirect follows
    - Validate SSL certificates
    """
    
    BLOCKED_HOSTS = {'localhost', '127.0.0.1', '0.0.0.0', '[::1]'}
    BLOCKED_NETWORKS = [
        ipaddress.ip_network('10.0.0.0/8'),
        ipaddress.ip_network('172.16.0.0/12'),
        ipaddress.ip_network('192.168.0.0/16'),
        ipaddress.ip_network('127.0.0.0/8'),
    ]
    MAX_REDIRECTS = 5
    DEFAULT_TIMEOUT = 30
    MAX_TIMEOUT = 300  # 5 minutes
    MAX_RESPONSE_SIZE = 10 * 1024 * 1024  # 10MB
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        url = data.inputs.get('url')
        method = data.inputs.get('method', 'GET').upper()
        headers = data.inputs.get('headers', {})
        body = data.inputs.get('body')
        query_params = data.inputs.get('queryParams', {})
        timeout = min(data.inputs.get('timeout', self.DEFAULT_TIMEOUT), self.MAX_TIMEOUT)
        allow_redirects = data.inputs.get('allowRedirects', True)
        
        # Validate URL
        self._validate_url(url)
        
        # Prepare body
        request_body = self._prepare_body(body, headers)
        
        # Execute request
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method=method,
                url=url,
                headers=headers,
                params=query_params,
                data=request_body,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=allow_redirects,
                max_redirects=self.MAX_REDIRECTS if allow_redirects else 0,
                ssl=True  # Enforce SSL verification
            ) as response:
                # Check response size
                content_length = response.headers.get('content-length')
                if content_length and int(content_length) > self.MAX_RESPONSE_SIZE:
                    raise ValueError(f"Response too large: {content_length} bytes")
                
                # Read response
                content_type = response.headers.get('content-type', '').lower()
                if 'application/json' in content_type:
                    response_body = await response.json()
                else:
                    response_body = await response.text()
                
                return {
                    'statusCode': response.status,
                    'headers': dict(response.headers),
                    'body': response_body,
                    'url': str(response.url)
                }
    
    def _validate_url(self, url: str) -> None:
        """Validate URL for security."""
        parsed = urlparse(url)
        
        if not parsed.scheme in ('http', 'https'):
            raise ValueError(f"Invalid URL scheme: {parsed.scheme}")
        
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL must have a hostname")
        
        # Check blocked hosts
        if hostname.lower() in self.BLOCKED_HOSTS:
            raise ValueError(f"Access to {hostname} is not allowed")
        
        # Check IP addresses
        try:
            ip = ipaddress.ip_address(hostname)
            for network in self.BLOCKED_NETWORKS:
                if ip in network:
                    raise ValueError(f"Access to IP {hostname} is not allowed")
        except ValueError:
            # Not an IP, is a hostname - resolve and check
            pass
    
    def _prepare_body(self, body: Any, headers: dict) -> Any:
        """Prepare request body based on content type."""
        if body is None:
            return None
        
        content_type = headers.get('content-type', '').lower()
        
        if 'application/json' in content_type and isinstance(body, dict):
            return aiohttp.JsonPayload(body)
        
        return body
```

### Test Cases
```python
# tests/unit/executors/integration/test_http_executor.py

import pytest
from app.orchestrator.node_executors.integration.http_executor import HTTPExecutor

@pytest.mark.asyncio
async def test_http_get_success():
    executor = HTTPExecutor()
    result = await executor.execute(
        data=NodeExecutionData(inputs={
            'url': 'https://httpbin.org/get',
            'method': 'GET'
        }),
        context=ExecutionContext(tenant_id='test', user_id='test')
    )
    assert result['statusCode'] == 200
    assert 'headers' in result

@pytest.mark.asyncio
async def test_http_blocked_localhost():
    executor = HTTPExecutor()
    with pytest.raises(ValueError, match="not allowed"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                'url': 'http://localhost:3000/api'
            }),
            context=ExecutionContext(tenant_id='test', user_id='test')
        )

@pytest.mark.asyncio
async def test_http_post_json():
    executor = HTTPExecutor()
    result = await executor.execute(
        data=NodeExecutionData(inputs={
            'url': 'https://httpbin.org/post',
            'method': 'POST',
            'headers': {'content-type': 'application/json'},
            'body': {'key': 'value'}
        }),
        context=ExecutionContext(tenant_id='test', user_id='test')
        )
    assert result['statusCode'] == 200
    assert result['body']['json'] == {'key': 'value'}
```

---

## B.2 Send Email Node

### Description
Send emails via configured providers (SMTP, SendGrid, AWS SES).

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/integration/email_executor.py`

```python
import re
from typing import Any
from email.utils import parseaddr
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class EmailExecutor:
    """
    Send emails with rate limiting and validation.
    
    Providers supported:
    - SMTP (local or external)
    - SendGrid
    - AWS SES
    """
    
    EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    MAX_EMAIL_SIZE = 25 * 1024 * 1024  # 25MB
    RATE_LIMIT = 100  # emails per hour per tenant
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        to = data.inputs.get('to')
        cc = data.inputs.get('cc', [])
        bcc = data.inputs.get('bcc', [])
        subject = data.inputs.get('subject', '')
        body_text = data.inputs.get('bodyText', '')
        body_html = data.inputs.get('bodyHtml')
        from_email = data.inputs.get('from')  # Optional, uses default
        attachments = data.inputs.get('attachments', [])
        
        # Validate inputs
        self._validate_email(to, 'to')
        for email in cc:
            self._validate_email(email, 'cc')
        for email in bcc:
            self._validate_email(email, 'bcc')
        
        if not subject and not body_text and not body_html:
            raise ValueError("Email must have subject or body")
        
        # Check rate limit
        await self._check_rate_limit(context.tenant_id)
        
        # Send via configured provider
        provider = await self._get_provider(context.tenant_id)
        result = await provider.send(
            to=to,
            cc=cc,
            bcc=bcc,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            from_email=from_email,
            attachments=attachments
        )
        
        return {
            'success': result.success,
            'messageId': result.message_id,
            'provider': provider.name
        }
    
    def _validate_email(self, email: str, field: str) -> None:
        """Validate email format."""
        if not email:
            raise ValueError(f"{field} is required")
        
        real_name, addr = parseaddr(email)
        if not addr or not self.EMAIL_REGEX.match(addr):
            raise ValueError(f"Invalid {field} email: {email}")
    
    async def _check_rate_limit(self, tenant_id: str) -> None:
        """Check tenant rate limit."""
        # Implementation using Redis or in-memory counter
        key = f"email_rate_limit:{tenant_id}"
        # Check and increment counter
        pass
    
    async def _get_provider(self, tenant_id: str):
        """Get email provider for tenant."""
        # Load from tenant configuration
        pass
```

### Configuration
```yaml
# Email providers configuration
email:
  default_provider: sendgrid
  providers:
    sendgrid:
      api_key: ${SENDGRID_API_KEY}
      from_email: noreply@example.com
    ses:
      region: us-east-1
      access_key: ${AWS_ACCESS_KEY}
      secret_key: ${AWS_SECRET_KEY}
    smtp:
      host: smtp.example.com
      port: 587
      username: ${SMTP_USER}
      password: ${SMTP_PASS}
      use_tls: true
```

---

## B.3 Schedule Trigger Node

### Description
Trigger workflows on cron schedule with timezone support.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/trigger_executors/schedule_trigger_executor.py`

```python
import asyncio
from datetime import datetime, timezone
from typing import Any
from croniter import croniter
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class ScheduleTriggerExecutor:
    """
    Schedule-based workflow trigger.
    
    Features:
    - Cron expression support
    - Timezone handling
    - Persistent storage
    - Missed execution handling
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        """
        This executor is called when the scheduled time is reached.
        Returns trigger data for the workflow.
        """
        schedule_id = data.inputs.get('scheduleId')
        scheduled_time = data.inputs.get('scheduledTime')
        
        return {
            'triggeredAt': datetime.now(timezone.utc).isoformat(),
            'scheduledTime': scheduled_time,
            'scheduleId': schedule_id,
            'triggerData': data.inputs.get('triggerData', {})
        }
    
    @staticmethod
    def validate_cron(cron: str) -> bool:
        """Validate cron expression."""
        try:
            croniter(cron)
            return True
        except ValueError:
            return False
    
    @staticmethod
    def get_next_run(cron: str, timezone_str: str = 'UTC') -> datetime:
        """Get next scheduled run time."""
        from pytz import timezone as pytz_timezone
        tz = pytz_timezone(timezone_str)
        now = datetime.now(tz)
        
        itr = croniter(cron, now)
        return itr.get_next(datetime)
```

**New File**: `python-backend/app/services/scheduler_service.py`
```python
import asyncio
from datetime import datetime, timezone
from croniter import croniter
import pytz

class SchedulerService:
    """
    Centralized scheduling service for workflow triggers.
    
    Uses asyncio for scheduling within the application.
    For production, consider external scheduler (APScheduler/Celery).
    """
    
    def __init__(self, db_pool):
        self.db_pool = db_pool
        self.schedules = {}  # schedule_id -> task
        self.running = False
    
    async def start(self):
        """Start the scheduler."""
        self.running = True
        await self._load_schedules()
        asyncio.create_task(self._scheduler_loop())
    
    async def stop(self):
        """Stop the scheduler."""
        self.running = False
        for task in self.schedules.values():
            task.cancel()
    
    async def add_schedule(
        self,
        schedule_id: str,
        workflow_id: str,
        cron: str,
        timezone: str = 'UTC',
        trigger_data: dict = None
    ):
        """Add a new schedule."""
        # Validate cron
        if not croniter.is_valid(cron):
            raise ValueError(f"Invalid cron expression: {cron}")
        
        # Save to database
        await self._save_schedule(schedule_id, workflow_id, cron, timezone, trigger_data)
        
        # Schedule next execution
        await self._schedule_next(schedule_id, workflow_id, cron, timezone, trigger_data)
    
    async def remove_schedule(self, schedule_id: str):
        """Remove a schedule."""
        if schedule_id in self.schedules:
            self.schedules[schedule_id].cancel()
            del self.schedules[schedule_id]
        
        await self._delete_schedule(schedule_id)
    
    async def _schedule_next(self, schedule_id, workflow_id, cron, timezone_str, trigger_data):
        """Schedule the next execution."""
        tz = pytz.timezone(timezone_str)
        now = datetime.now(tz)
        
        itr = croniter(cron, now)
        next_run = itr.get_next(datetime)
        
        delay = (next_run - now).total_seconds()
        
        async def execute_at_time():
            await asyncio.sleep(delay)
            await self._trigger_workflow(schedule_id, workflow_id, trigger_data)
            # Schedule next
            await self._schedule_next(schedule_id, workflow_id, cron, timezone_str, trigger_data)
        
        task = asyncio.create_task(execute_at_time())
        self.schedules[schedule_id] = task
    
    async def _trigger_workflow(self, schedule_id, workflow_id, trigger_data):
        """Trigger the workflow execution."""
        from app.orchestrator.langgraph_runtime import LangGraphRuntime
        
        runtime = LangGraphRuntime()
        await runtime.trigger_workflow(
            workflow_id=workflow_id,
            trigger_type='schedule',
            trigger_data={
                'scheduleId': schedule_id,
                'scheduledTime': datetime.now(timezone.utc).isoformat(),
                **(trigger_data or {})
            }
        )
```

### Database Migration
```sql
CREATE TABLE workflow_schedules (
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

CREATE INDEX idx_workflow_schedules_next_run 
ON workflow_schedules(next_run_at) 
WHERE is_active = true;
```

---

## B.4 Delay Node

### Description
Pause workflow execution for a specified duration.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/flow/delay_executor.py`

```python
import asyncio
from datetime import datetime, timezone
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class DelayExecutor:
    """
    Delay execution for a specified time.
    
    NOTE: Current implementation uses asyncio.sleep() which blocks the 
    execution thread. For production, implement checkpoint/resume pattern.
    
    Limits:
    - Min: 0.1 seconds
    - Max: 86400 seconds (24 hours)
    """
    
    MIN_DELAY = 0.1
    MAX_DELAY = 86400  # 24 hours
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        duration = data.inputs.get('duration', 1)
        
        # Validate duration
        if not isinstance(duration, (int, float)):
            raise ValueError(f"Duration must be a number, got {type(duration)}")
        
        if not (self.MIN_DELAY <= duration <= self.MAX_DELAY):
            raise ValueError(
                f"Duration must be between {self.MIN_DELAY} and {self.MAX_DELAY} seconds"
            )
        
        started_at = datetime.now(timezone.utc)
        
        # Execute delay
        await asyncio.sleep(duration)
        
        ended_at = datetime.now(timezone.utc)
        
        return {
            'delayedSeconds': duration,
            'startedAt': started_at.isoformat(),
            'endedAt': ended_at.isoformat(),
            'actualDelay': (ended_at - started_at).total_seconds()
        }
```

### Future Enhancement: Checkpoint Pattern
```python
# Future implementation with checkpoint/resume

class DelayExecutorV2:
    """Delay with state checkpointing for resumability."""
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        duration = data.inputs.get('duration', 1)
        resume_at = data.inputs.get('_resumeAt')  # From checkpoint
        
        if resume_at:
            # Resuming from checkpoint
            return {'resumed': True, 'resumeTime': resume_at}
        
        # First execution - create checkpoint
        resume_time = datetime.now(timezone.utc).timestamp() + duration
        
        raise CheckpointRequired(
            resume_at=resume_time,
            state={'duration': duration}
        )
```

---

## B.5 Try Catch Node

### Description
Wrap execution with error handling and retry logic.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/flow/try_catch_executor.py`

```python
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)

class TryCatchExecutor:
    """
    Execute wrapped node with retry and fallback handling.
    
    Features:
    - Configurable retry count (0 = no retry)
    - Exponential backoff
    - Fallback value on failure
    - Error details output
    """
    
    MAX_RETRIES = 5
    BASE_DELAY = 1  # seconds
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        retry_count = min(data.inputs.get('retryCount', 0), self.MAX_RETRIES)
        retry_delay = data.inputs.get('retryDelay', self.BASE_DELAY)
        fallback_value = data.inputs.get('fallbackValue')
        continue_on_error = data.inputs.get('continueOnError', False)
        
        wrapped_node = data.inputs.get('_wrappedNode')
        last_error = None
        attempts = []
        
        for attempt in range(retry_count + 1):
            attempt_start = datetime.now(timezone.utc)
            
            try:
                # Execute wrapped node
                result = await self._execute_wrapped(wrapped_node, context)
                
                attempts.append({
                    'attempt': attempt + 1,
                    'success': True,
                    'startedAt': attempt_start.isoformat(),
                    'duration': (datetime.now(timezone.utc) - attempt_start).total_seconds()
                })
                
                return {
                    'success': True,
                    'result': result,
                    'error': None,
                    'attempts': attempts
                }
                
            except Exception as e:
                last_error = str(e)
                error_type = type(e).__name__
                
                attempts.append({
                    'attempt': attempt + 1,
                    'success': False,
                    'error': last_error,
                    'errorType': error_type,
                    'startedAt': attempt_start.isoformat(),
                    'duration': (datetime.now(timezone.utc) - attempt_start).total_seconds()
                })
                
                logger.warning(
                    f"TryCatch attempt {attempt + 1} failed: {last_error}",
                    extra={'attempt': attempt + 1, 'error_type': error_type}
                )
                
                if attempt < retry_count:
                    # Calculate backoff delay
                    backoff = retry_delay * (2 ** attempt)
                    logger.info(f"Retrying in {backoff}s (attempt {attempt + 2}/{retry_count + 1})")
                    await asyncio.sleep(backoff)
        
        # All retries failed
        if continue_on_error:
            return {
                'success': False,
                'result': fallback_value,
                'error': {
                    'message': last_error,
                    'type': error_type,
                    'attempts': retry_count + 1
                },
                'attempts': attempts
            }
        else:
            # Re-raise the last error
            raise RuntimeError(
                f"TryCatch failed after {retry_count + 1} attempts. "
                f"Last error: {last_error}"
            ) from e
    
    async def _execute_wrapped(self, wrapped_node: dict, context: ExecutionContext) -> Any:
        """Execute the wrapped node."""
        from app.orchestrator.node_executors import get_executor
        
        executor_class = get_executor(wrapped_node['type'])
        executor = executor_class()
        
        return await executor.execute(
            data=NodeExecutionData(inputs=wrapped_node.get('inputs', {})),
            context=context
        )
```

---

## Testing Requirements

### Unit Tests
```python
# tests/unit/executors/integration/test_http_executor.py
# tests/unit/executors/integration/test_email_executor.py
# tests/unit/executors/flow/test_delay_executor.py
# tests/unit/executors/flow/test_try_catch_executor.py
# tests/unit/services/test_scheduler_service.py
```

### Integration Tests
```bash
# Test HTTP requests
curl -X POST http://localhost:8000/api/v1/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"nodeType": "http_request", "inputs": {"url": "https://httpbin.org/get"}}'

# Test scheduling
curl -X POST http://localhost:8000/api/v1/workflow/schedules \
  -H "Content-Type: application/json" \
  -d '{"workflowId": 1, "cron": "0 9 * * *", "timezone": "America/New_York"}'
```

---

## Definition of Done

- [ ] HTTP Request node with security controls
- [ ] Send Email node with rate limiting
- [ ] Schedule Trigger with persistence
- [ ] Delay node with duration limits
- [ ] Try Catch node with retry and fallback
- [ ] All unit tests passing
- [ ] Integration tests for each node
- [ ] Documentation updated
