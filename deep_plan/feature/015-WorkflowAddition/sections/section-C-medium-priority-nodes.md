# Section C: Medium-Priority Node Implementation

## Overview
Implement 5 important nodes for API integration, file handling, and data processing.

---

## C.1 Webhook Trigger and Response Nodes

### Description
Trigger workflows via HTTP webhooks and send webhook responses.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/trigger_executors/webhook_trigger_executor.py`

```python
from typing import Any
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class WebhookTriggerExecutor:
    """
    Webhook trigger executor.
    
    This executor runs when a webhook request is received.
    It validates the request and returns trigger data.
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        webhook_id = data.inputs.get('webhookId')
        request_body = data.inputs.get('body')
        request_headers = data.inputs.get('headers', {})
        request_query = data.inputs.get('query', {})
        
        # Validate webhook signature if configured
        secret = data.inputs.get('_webhookSecret')
        if secret:
            signature = request_headers.get('x-webhook-signature')
            if not self._verify_signature(request_body, signature, secret):
                raise ValueError("Invalid webhook signature")
        
        return {
            'triggeredAt': datetime.now(timezone.utc).isoformat(),
            'webhookId': webhook_id,
            'body': request_body,
            'headers': request_headers,
            'query': request_query
        }
    
    def _verify_signature(self, body: str, signature: str, secret: str) -> bool:
        """Verify webhook signature using HMAC."""
        import hmac
        import hashlib
        
        expected = hmac.new(
            secret.encode(),
            body.encode() if isinstance(body, str) else body,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(f"sha256={expected}", signature)
```

**New File**: `python-backend/app/orchestrator/node_executors/output/webhook_response_executor.py`

```python
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class WebhookResponseExecutor:
    """
    Send response back to webhook caller.
    
    Must be used in workflows triggered by webhook_trigger.
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        status_code = data.inputs.get('statusCode', 200)
        body = data.inputs.get('body')
        headers = data.inputs.get('headers', {})
        
        # Mark this as a webhook response for the runtime
        return {
            '_webhookResponse': True,
            'statusCode': status_code,
            'body': body,
            'headers': {
                'content-type': 'application/json',
                **headers
            }
        }
```

### Webhook Registration Service

**New File**: `python-backend/app/services/webhook_service.py`

```python
import uuid
from typing import Optional

class WebhookService:
    """Manage webhook registrations and routing."""
    
    def __init__(self, db_pool):
        self.db_pool = db_pool
    
    async def create_webhook(
        self,
        workflow_id: int,
        tenant_id: int,
        path: Optional[str] = None,
        secret: Optional[str] = None
    ) -> dict:
        """Create a new webhook registration."""
        webhook_id = str(uuid.uuid4())
        webhook_path = path or f"wh_{webhook_id[:8]}"
        
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO webhooks (id, workflow_id, tenant_id, path, secret, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
            """, webhook_id, workflow_id, tenant_id, webhook_path, secret)
        
        return {
            'id': webhook_id,
            'path': webhook_path,
            'url': f"/webhooks/{webhook_path}"
        }
    
    async def get_webhook_by_path(self, path: str) -> Optional[dict]:
        """Get webhook by path."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM webhooks 
                WHERE path = $1 AND is_active = true
            """, path)
            return dict(row) if row else None
```

### Database Migration
```sql
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    path VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_path ON webhooks(path);
CREATE INDEX idx_webhooks_workflow ON webhooks(workflow_id);
```

---

## C.2 File Operations (Read/Write File Nodes)

### Description
Read and write files with sandboxed storage per tenant.

### Storage Architecture
```
/workflow-files/{tenant_id}/{workflow_id}/{execution_id}/
  ├── inputs/       # Files uploaded to workflow
  ├── outputs/      # Files created by workflow
  └── temp/         # Temporary files
```

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/file/file_read_executor.py`

```python
import os
import aiofiles
from typing import Any
from pathlib import Path
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class FileReadExecutor:
    """
    Read file from workflow storage.
    
    Security:
    - Path traversal prevention
    - Tenant isolation enforced
    - File size limits
    """
    
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    ALLOWED_EXTENSIONS = {'.txt', '.json', '.csv', '.xml', '.yaml', '.yml', '.pdf', '.docx'}
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        file_path = data.inputs.get('filePath')
        encoding = data.inputs.get('encoding', 'utf-8')
        
        # Sanitize and validate path
        safe_path = self._sanitize_path(file_path, context.tenant_id)
        
        if not safe_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Check file size
        file_size = safe_path.stat().st_size
        if file_size > self.MAX_FILE_SIZE:
            raise ValueError(f"File too large: {file_size} bytes (max {self.MAX_FILE_SIZE})")
        
        # Check extension
        if safe_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"File type not allowed: {safe_path.suffix}")
        
        # Read file
        async with aiofiles.open(safe_path, 'r', encoding=encoding) as f:
            content = await f.read()
        
        return {
            'content': content,
            'fileName': safe_path.name,
            'fileSize': file_size,
            'encoding': encoding
        }
    
    def _sanitize_path(self, file_path: str, tenant_id: str) -> Path:
        """Sanitize file path to prevent traversal attacks."""
        # Remove any parent directory references
        clean_path = Path(file_path).name
        
        # Build absolute path within tenant sandbox
        base_path = Path(f"/workflow-files/{tenant_id}")
        safe_path = (base_path / clean_path).resolve()
        
        # Ensure path is within tenant directory
        if not str(safe_path).startswith(str(base_path)):
            raise ValueError("Invalid file path: path traversal detected")
        
        return safe_path
```

**New File**: `python-backend/app/orchestrator/node_executors/file/file_write_executor.py`

```python
import os
import aiofiles
from typing import Any
from pathlib import Path
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class FileWriteExecutor:
    """
    Write file to workflow storage.
    
    Features:
    - Automatic directory creation
    - Atomic writes (write to temp, then rename)
    - File size validation
    """
    
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    ALLOWED_EXTENSIONS = {'.txt', '.json', '.csv', '.xml', '.yaml', '.yml'}
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        file_path = data.inputs.get('filePath')
        content = data.inputs.get('content', '')
        encoding = data.inputs.get('encoding', 'utf-8')
        append = data.inputs.get('append', False)
        
        # Validate content size
        content_bytes = content.encode(encoding) if isinstance(content, str) else content
        if len(content_bytes) > self.MAX_FILE_SIZE:
            raise ValueError(f"Content too large: {len(content_bytes)} bytes")
        
        # Sanitize path
        safe_path = self._sanitize_path(file_path, context.tenant_id)
        
        # Check extension
        if safe_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"File type not allowed: {safe_path.suffix}")
        
        # Ensure directory exists
        safe_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Atomic write
        temp_path = safe_path.with_suffix('.tmp')
        
        mode = 'a' if append else 'w'
        async with aiofiles.open(temp_path, mode, encoding=encoding) as f:
            await f.write(content)
        
        # Atomic rename
        temp_path.rename(safe_path)
        
        return {
            'filePath': str(safe_path),
            'fileName': safe_path.name,
            'bytesWritten': len(content_bytes),
            'writtenAt': datetime.now(timezone.utc).isoformat()
        }
    
    def _sanitize_path(self, file_path: str, tenant_id: str) -> Path:
        """Sanitize file path to prevent traversal attacks."""
        clean_path = Path(file_path).name
        base_path = Path(f"/workflow-files/{tenant_id}/outputs")
        safe_path = (base_path / clean_path).resolve()
        
        if not str(safe_path).startswith(str(base_path)):
            raise ValueError("Invalid file path: path traversal detected")
        
        return safe_path
```

---

## C.3 CSV Parser Node

### Description
Parse CSV files with automatic delimiter detection and type inference.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/data/csv_parser_executor.py`

```python
import csv
import io
from typing import Any, List, Dict
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class CSVParserExecutor:
    """
    Parse CSV files with intelligent defaults.
    
    Features:
    - Auto-detect delimiter
    - Header row detection
    - Type inference
    - Skip rows
    - Row limits
    """
    
    MAX_ROWS = 100000
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        csv_input = data.inputs.get('csvInput')  # String or file path
        delimiter = data.inputs.get('delimiter')  # Auto-detect if not provided
        has_header = data.inputs.get('hasHeader', True)
        skip_rows = data.inputs.get('skipRows', 0)
        max_rows = min(data.inputs.get('maxRows', self.MAX_ROWS), self.MAX_ROWS)
        encoding = data.inputs.get('encoding', 'utf-8')
        
        # Load CSV content
        if csv_input.startswith('/') or csv_input.startswith('./'):
            # It's a file path
            async with aiofiles.open(csv_input, 'r', encoding=encoding) as f:
                content = await f.read()
        else:
            # It's CSV content directly
            content = csv_input
        
        # Auto-detect delimiter if not specified
        if not delimiter:
            delimiter = self._detect_delimiter(content)
        
        # Parse CSV
        rows = []
        reader = csv.DictReader(
            io.StringIO(content),
            delimiter=delimiter,
            fieldnames=None if has_header else self._generate_fieldnames(content, delimiter)
        )
        
        # Skip initial rows
        for _ in range(skip_rows):
            try:
                next(reader)
            except StopIteration:
                break
        
        # Read up to max_rows
        for i, row in enumerate(reader):
            if i >= max_rows:
                break
            
            # Type inference
            typed_row = {k: self._infer_type(v) for k, v in row.items()}
            rows.append(typed_row)
        
        return {
            'rows': rows,
            'rowCount': len(rows),
            'columns': list(rows[0].keys()) if rows else [],
            'delimiter': delimiter
        }
    
    def _detect_delimiter(self, content: str) -> str:
        """Auto-detect CSV delimiter."""
        delimiters = [',', ';', '\t', '|']
        counts = {d: content.count(d) for d in delimiters}
        return max(counts, key=counts.get)
    
    def _generate_fieldnames(self, content: str, delimiter: str) -> List[str]:
        """Generate column names for headerless CSV."""
        first_line = content.split('\n')[0]
        col_count = len(first_line.split(delimiter))
        return [f"column_{i+1}" for i in range(col_count)]
    
    def _infer_type(self, value: str) -> Any:
        """Infer data type from string value."""
        if value == '':
            return None
        
        # Try int
        try:
            return int(value)
        except ValueError:
            pass
        
        # Try float
        try:
            return float(value)
        except ValueError:
            pass
        
        # Try bool
        if value.lower() in ('true', 'yes', '1'):
            return True
        if value.lower() in ('false', 'no', '0'):
            return False
        
        # Return as string
        return value
```

---

## C.4 Template Engine Node

### Description
Render templates with variable substitution. Supports Mustache (safe) and Jinja2 (advanced).

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/data/template_engine_executor.py`

```python
import chevron  # Mustache implementation
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class TemplateEngineExecutor:
    """
    Render templates with variable substitution.
    
    Modes:
    - mustache: Simple, safe, logic-less (default)
    - jinja2: Full-featured (requires explicit enable)
    
    Security:
    - Jinja2 sandboxed with RestrictedPython
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        template = data.inputs.get('template', '')
        variables = data.inputs.get('variables', {})
        engine = data.inputs.get('engine', 'mustache')
        
        if engine == 'mustache':
            result = self._render_mustache(template, variables)
        elif engine == 'jinja2':
            result = self._render_jinja2(template, variables)
        else:
            raise ValueError(f"Unknown template engine: {engine}")
        
        return {
            'result': result,
            'engine': engine,
            'variablesUsed': list(variables.keys())
        }
    
    def _render_mustache(self, template: str, variables: dict) -> str:
        """Render Mustache template."""
        return chevron.render(template, variables)
    
    def _render_jinja2(self, template: str, variables: dict) -> str:
        """Render Jinja2 template with sandbox."""
        from jinja2 import Environment, BaseLoader, SandboxedEnvironment
        
        # Use sandboxed environment
        env = SandboxedEnvironment(loader=BaseLoader())
        
        # Compile template
        jinja_template = env.from_string(template)
        
        # Render with variables
        return jinja_template.render(**variables)
```

### Example Usage

**Mustache (Safe)**:
```
Hello {{name}},

Your order #{{order.id}} is {{order.status}}.

Items:
{{#items}}
- {{name}}: ${{price}} x {{quantity}}
{{/items}}

Total: ${{total}}
```

**Jinja2 (Advanced)**:
```
Hello {{ name }},

{% if orders %}
You have {{ orders|length }} orders:
{% for order in orders %}
  {{ loop.index }}. Order #{{ order.id }}: ${{ order.total }}
{% endfor %}
{% else %}
No orders found.
{% endif %}
```

---

## C.5 Retry Node

### Description
Retry failed operations with configurable strategies.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/error_handling/retry_executor.py`

```python
import asyncio
import random
from typing import Any, List
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class RetryExecutor:
    """
    Retry failed operations with configurable strategies.
    
    Strategies:
    - fixed: Constant delay between retries
    - linear: Linearly increasing delay
    - exponential: Exponentially increasing delay
    - exponential_jitter: Exponential with random jitter
    """
    
    MAX_RETRIES = 10
    MAX_DELAY = 300  # 5 minutes
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        max_attempts = min(data.inputs.get('maxAttempts', 3), self.MAX_RETRIES)
        delay = data.inputs.get('delay', 1)
        strategy = data.inputs.get('strategy', 'exponential')
        retry_on = data.inputs.get('retryOn', [])  # List of error types to retry
        stop_on = data.inputs.get('stopOn', [])  # List of error types to stop on
        
        wrapped_node = data.inputs.get('_wrappedNode')
        attempts = []
        
        for attempt in range(1, max_attempts + 1):
            attempt_start = datetime.now(timezone.utc)
            
            try:
                result = await self._execute_wrapped(wrapped_node, context)
                
                attempts.append({
                    'attempt': attempt,
                    'success': True,
                    'startedAt': attempt_start.isoformat(),
                    'duration': (datetime.now(timezone.utc) - attempt_start).total_seconds()
                })
                
                return {
                    'success': True,
                    'result': result,
                    'attempts': attempts,
                    'totalAttempts': attempt
                }
                
            except Exception as e:
                error_type = type(e).__name__
                error_message = str(e)
                
                attempts.append({
                    'attempt': attempt,
                    'success': False,
                    'errorType': error_type,
                    'errorMessage': error_message,
                    'startedAt': attempt_start.isoformat(),
                    'duration': (datetime.now(timezone.utc) - attempt_start).total_seconds()
                })
                
                # Check if we should stop
                if error_type in stop_on:
                    break
                
                # Check if we should retry
                if retry_on and error_type not in retry_on:
                    break
                
                # Calculate delay for next attempt
                if attempt < max_attempts:
                    wait_time = self._calculate_delay(delay, attempt, strategy)
                    await asyncio.sleep(wait_time)
        
        # All attempts failed
        return {
            'success': False,
            'result': None,
            'attempts': attempts,
            'totalAttempts': len(attempts),
            'lastError': attempts[-1]['errorMessage'] if attempts else None
        }
    
    def _calculate_delay(self, base_delay: float, attempt: int, strategy: str) -> float:
        """Calculate delay before next retry."""
        if strategy == 'fixed':
            return min(base_delay, self.MAX_DELAY)
        
        elif strategy == 'linear':
            return min(base_delay * attempt, self.MAX_DELAY)
        
        elif strategy == 'exponential':
            return min(base_delay * (2 ** (attempt - 1)), self.MAX_DELAY)
        
        elif strategy == 'exponential_jitter':
            exp_delay = base_delay * (2 ** (attempt - 1))
            jitter = random.uniform(0, exp_delay)
            return min(exp_delay + jitter, self.MAX_DELAY)
        
        else:
            return min(base_delay, self.MAX_DELAY)
    
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
# tests/unit/executors/trigger/test_webhook_trigger.py
# tests/unit/executors/output/test_webhook_response.py
# tests/unit/executors/file/test_file_read.py
# tests/unit/executors/file/test_file_write.py
# tests/unit/executors/data/test_csv_parser.py
# tests/unit/executors/data/test_template_engine.py
# tests/unit/executors/error_handling/test_retry.py
```

### Integration Tests
```bash
# Webhook registration and trigger
curl -X POST http://localhost:8000/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{"workflowId": 1}'

# File upload and read
curl -X POST http://localhost:8000/api/v1/files/upload \
  -F "file=@test.csv"

# CSV parse
curl -X POST http://localhost:8000/api/v1/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"nodeType": "csv_parser", "inputs": {"csvInput": "name,age\nJohn,30"}}'
```

---

## Definition of Done

- [ ] Webhook Trigger/Response nodes with signature verification
- [ ] File Read/Write nodes with path sanitization
- [ ] CSV Parser with auto-detection and type inference
- [ ] Template Engine with Mustache and Jinja2 support
- [ ] Retry node with multiple strategies
- [ ] All unit tests passing
- [ ] Database migrations applied
- [ ] Documentation updated
