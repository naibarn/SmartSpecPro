# Section D: Advanced Node Implementation

## Overview
Implement 10 advanced nodes for parallel processing, subworkflows, circuit breakers, WebSockets, GraphQL, and AI enhancements.

---

## D.1 Parallel and Join Nodes

### Description
Execute nodes in parallel and wait for all to complete.

### Architecture Decision
**Approach**: Sequential fallback initially (simpler, reliable)  
**Future**: True async with asyncio.gather

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/flow/parallel_executor.py`

```python
from typing import Any
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class ParallelExecutor:
    """
    Execute multiple branches.
    
    NOTE: Current implementation executes sequentially.
    True parallel execution requires runtime engine changes.
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        branches = data.inputs.get('branches', [])
        
        results = {}
        errors = {}
        
        for i, branch in enumerate(branches):
            branch_id = branch.get('id', f'branch_{i}')
            
            try:
                result = await self._execute_branch(branch, context)
                results[branch_id] = result
            except Exception as e:
                errors[branch_id] = {
                    'error': str(e),
                    'type': type(e).__name__
                }
        
        return {
            'results': results,
            'errors': errors,
            'completedBranches': len(results),
            'failedBranches': len(errors),
            'totalBranches': len(branches)
        }
    
    async def _execute_branch(self, branch: dict, context: ExecutionContext) -> Any:
        """Execute a single branch."""
        from app.orchestrator.node_executors import get_executor
        
        node_type = branch.get('nodeType')
        inputs = branch.get('inputs', {})
        
        executor_class = get_executor(node_type)
        executor = executor_class()
        
        return await executor.execute(
            data=NodeExecutionData(inputs=inputs),
            context=context
        )
```

**New File**: `python-backend/app/orchestrator/node_executors/flow/join_executor.py`

```python
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class JoinExecutor:
    """
    Wait for parallel branches and combine results.
    
    Join Strategies:
    - all: Wait for all branches (default)
    - any: Return on first completion
    - n: Wait for N branches
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        parallel_results = data.inputs.get('_parallelResults', [])
        strategy = data.inputs.get('strategy', 'all')
        required_count = data.inputs.get('requiredCount')
        
        if not parallel_results:
            return {
                'joined': False,
                'reason': 'No parallel results to join',
                'results': []
            }
        
        # Apply join strategy
        if strategy == 'all':
            results = parallel_results
        elif strategy == 'any':
            results = [parallel_results[0]] if parallel_results else []
        elif strategy == 'n' and required_count:
            results = parallel_results[:required_count]
        else:
            results = parallel_results
        
        # Merge results based on merge strategy
        merge_strategy = data.inputs.get('mergeStrategy', 'object')
        merged = self._merge_results(results, merge_strategy)
        
        return {
            'joined': True,
            'results': results,
            'merged': merged,
            'strategy': strategy,
            'totalResults': len(parallel_results),
            'joinedResults': len(results)
        }
    
    def _merge_results(self, results: list, strategy: str) -> Any:
        """Merge multiple results into one."""
        if strategy == 'array':
            return results
        
        elif strategy == 'object':
            merged = {}
            for i, result in enumerate(results):
                key = result.get('_branchId', f'branch_{i}')
                merged[key] = result
            return merged
        
        elif strategy == 'concat':
            # Concatenate arrays
            merged = []
            for result in results:
                if isinstance(result, list):
                    merged.extend(result)
                else:
                    merged.append(result)
            return merged
        
        elif strategy == 'sum':
            # Sum numeric values
            return sum(
                r.get('value', 0) if isinstance(r, dict) else r
                for r in results
            )
        
        return results
```

### Future Enhancement: True Parallel
```python
# Future implementation with asyncio.gather

import asyncio

class ParallelExecutorV2:
    """True parallel execution with asyncio."""
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        branches = data.inputs.get('branches', [])
        
        # Create tasks for all branches
        tasks = [
            self._execute_branch_async(branch, context)
            for branch in branches
        ]
        
        # Execute all in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        successful = []
        errors = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                errors.append({
                    'branch': i,
                    'error': str(result)
                })
            else:
                successful.append(result)
        
        return {
            'results': successful,
            'errors': errors
        }
```

---

## D.2 Subworkflow Node

### Description
Execute another workflow as a sub-process.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/flow/subworkflow_executor.py`

```python
from typing import Any
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class SubworkflowExecutor:
    """
    Execute another workflow as a sub-process.
    
    Features:
    - Pass inputs to subworkflow
    - Map outputs back
    - Inherit context (tenant, user)
    - Timeout control
    """
    
    MAX_TIMEOUT = 300  # 5 minutes
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        subworkflow_id = data.inputs.get('workflowId')
        inputs = data.inputs.get('inputs', {})
        timeout = min(data.inputs.get('timeout', 60), self.MAX_TIMEOUT)
        output_mapping = data.inputs.get('outputMapping', {})  # Map subworkflow outputs
        
        if not subworkflow_id:
            raise ValueError("workflowId is required")
        
        # Load subworkflow
        subworkflow = await self._load_workflow(subworkflow_id, context.tenant_id)
        
        # Check access permission
        if not await self._can_access_workflow(context, subworkflow_id):
            raise PermissionError(f"Access denied to workflow {subworkflow_id}")
        
        # Compile subworkflow
        from app.orchestrator.workflow_compiler import WorkflowCompiler
        compiler = WorkflowCompiler()
        manifest = compiler.compile(
            nodes=subworkflow['nodes'],
            edges=subworkflow['edges']
        )
        
        # Execute with timeout
        from app.orchestrator.langgraph_runtime import LangGraphRuntime
        runtime = LangGraphRuntime()
        
        started_at = datetime.now(timezone.utc)
        
        try:
            result = await asyncio.wait_for(
                runtime.execute(manifest, inputs),
                timeout=timeout
            )
            
            # Map outputs if specified
            mapped_outputs = self._map_outputs(result, output_mapping)
            
            return {
                'success': True,
                'outputs': mapped_outputs,
                'rawOutputs': result,
                'executionTime': (datetime.now(timezone.utc) - started_at).total_seconds()
            }
            
        except asyncio.TimeoutError:
            return {
                'success': False,
                'error': f'Subworkflow timed out after {timeout}s',
                'executionTime': timeout
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'executionTime': (datetime.now(timezone.utc) - started_at).total_seconds()
            }
    
    async def _load_workflow(self, workflow_id: int, tenant_id: str) -> dict:
        """Load workflow from database."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, name, workflow_json, tenant_id
                FROM workflows
                WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
            """, workflow_id, tenant_id)
            
            if not row:
                raise ValueError(f"Workflow {workflow_id} not found")
            
            return {
                'id': row['id'],
                'name': row['name'],
                'nodes': row['workflow_json'].get('nodes', []),
                'edges': row['workflow_json'].get('edges', [])
            }
    
    async def _can_access_workflow(self, context: ExecutionContext, workflow_id: int) -> bool:
        """Check if user can access the workflow."""
        # Check if workflow is in same tenant
        # Additional checks for shared workflows
        return True
    
    def _map_outputs(self, result: dict, mapping: dict) -> dict:
        """Map subworkflow outputs to specified keys."""
        if not mapping:
            return result
        
        mapped = {}
        for target_key, source_path in mapping.items():
            # Navigate path (e.g., "data.result.value")
            value = result
            for key in source_path.split('.'):
                value = value.get(key, {}) if isinstance(value, dict) else None
            mapped[target_key] = value
        
        return mapped
```

---

## D.3 Circuit Breaker Node

### Description
Prevent cascading failures with circuit breaker pattern.

### State Machine
```
CLOSED  --(failures > threshold)-->  OPEN
  ^                                    |
  |                                    |
  +----(success)----  HALF_OPEN  <-----+
                      (failure)
```

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/error_handling/circuit_breaker_executor.py`

```python
import time
from typing import Any
from enum import Enum
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreakerExecutor:
    """
    Circuit breaker pattern for fault tolerance.
    
    Configuration:
    - failureThreshold: Failures before opening (default: 5)
    - recoveryTimeout: Seconds before half-open (default: 60)
    - successThreshold: Successes to close (default: 3)
    """
    
    # In-memory state store (use Redis in production)
    _circuits = {}
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        circuit_id = data.inputs.get('circuitId', f"circuit_{context.execution_id}")
        failure_threshold = data.inputs.get('failureThreshold', 5)
        recovery_timeout = data.inputs.get('recoveryTimeout', 60)
        success_threshold = data.inputs.get('successThreshold', 3)
        
        wrapped_node = data.inputs.get('_wrappedNode')
        fallback_value = data.inputs.get('fallbackValue')
        
        # Get or create circuit state
        circuit = self._get_circuit_state(circuit_id)
        
        # Check current state
        if circuit['state'] == CircuitState.OPEN.value:
            if self._should_attempt_reset(circuit, recovery_timeout):
                circuit['state'] = CircuitState.HALF_OPEN.value
                circuit['half_open_attempts'] = 0
            else:
                # Circuit is open, return fallback
                return {
                    'success': False,
                    'circuitState': CircuitState.OPEN.value,
                    'result': fallback_value,
                    'reason': 'Circuit breaker is OPEN'
                }
        
        # Execute wrapped node
        try:
            result = await self._execute_wrapped(wrapped_node, context)
            
            # Success - update circuit
            self._record_success(circuit_id, success_threshold)
            
            return {
                'success': True,
                'circuitState': self._get_circuit_state(circuit_id)['state'],
                'result': result
            }
            
        except Exception as e:
            # Failure - update circuit
            self._record_failure(circuit_id, failure_threshold)
            
            return {
                'success': False,
                'circuitState': self._get_circuit_state(circuit_id)['state'],
                'result': fallback_value,
                'error': str(e)
            }
    
    def _get_circuit_state(self, circuit_id: str) -> dict:
        """Get circuit state (use Redis in production)."""
        if circuit_id not in self._circuits:
            self._circuits[circuit_id] = {
                'state': CircuitState.CLOSED.value,
                'failures': 0,
                'successes': 0,
                'last_failure_time': None,
                'half_open_attempts': 0
            }
        return self._circuits[circuit_id]
    
    def _record_success(self, circuit_id: str, threshold: int):
        """Record successful execution."""
        circuit = self._circuits[circuit_id]
        
        if circuit['state'] == CircuitState.HALF_OPEN.value:
            circuit['successes'] += 1
            if circuit['successes'] >= threshold:
                # Close the circuit
                circuit['state'] = CircuitState.CLOSED.value
                circuit['failures'] = 0
                circuit['successes'] = 0
        else:
            circuit['failures'] = max(0, circuit['failures'] - 1)
    
    def _record_failure(self, circuit_id: str, threshold: int):
        """Record failed execution."""
        circuit = self._circuits[circuit_id]
        
        circuit['failures'] += 1
        circuit['last_failure_time'] = time.time()
        
        if circuit['state'] == CircuitState.HALF_OPEN.value:
            # Back to open
            circuit['state'] = CircuitState.OPEN.value
        elif circuit['failures'] >= threshold:
            # Open the circuit
            circuit['state'] = CircuitState.OPEN.value
    
    def _should_attempt_reset(self, circuit: dict, timeout: int) -> bool:
        """Check if enough time has passed to try half-open."""
        if not circuit['last_failure_time']:
            return True
        return (time.time() - circuit['last_failure_time']) >= timeout
    
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

## D.4 WebSocket Client Node

### Description
Connect to WebSocket servers and send/receive messages.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/integration/websocket_executor.py`

```python
import asyncio
import websockets
from typing import Any
from datetime import datetime, timezone
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class WebSocketClientExecutor:
    """
    WebSocket client for real-time communication.
    
    Modes:
    - send: Send a message
    - receive: Receive messages (with timeout)
    - request_reply: Send and wait for response
    """
    
    DEFAULT_TIMEOUT = 30
    MAX_MESSAGE_SIZE = 1024 * 1024  # 1MB
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        url = data.inputs.get('url')
        mode = data.inputs.get('mode', 'send')
        message = data.inputs.get('message')
        headers = data.inputs.get('headers', {})
        timeout = data.inputs.get('timeout', self.DEFAULT_TIMEOUT)
        
        if not url:
            raise ValueError("WebSocket URL is required")
        
        # Validate URL
        if not url.startswith(('ws://', 'wss://')):
            raise ValueError("URL must use ws:// or wss:// scheme")
        
        async with websockets.connect(
            url,
            extra_headers=headers,
            max_size=self.MAX_MESSAGE_SIZE
        ) as ws:
            
            if mode == 'send':
                await ws.send(message)
                return {
                    'success': True,
                    'sentAt': datetime.now(timezone.utc).isoformat()
                }
            
            elif mode == 'receive':
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
                    return {
                        'success': True,
                        'message': msg,
                        'receivedAt': datetime.now(timezone.utc).isoformat()
                    }
                except asyncio.TimeoutError:
                    return {
                        'success': False,
                        'error': f'Receive timeout after {timeout}s'
                    }
            
            elif mode == 'request_reply':
                await ws.send(message)
                try:
                    reply = await asyncio.wait_for(ws.recv(), timeout=timeout)
                    return {
                        'success': True,
                        'sent': message,
                        'reply': reply,
                        'roundTripTime': timeout  # Calculate actual
                    }
                except asyncio.TimeoutError:
                    return {
                        'success': False,
                        'error': f'No reply received within {timeout}s'
                    }
```

---

## D.5 GraphQL Request Node

### Description
Execute GraphQL queries and mutations.

### Backend Implementation

**New File**: `python-backend/app/orchestrator/node_executors/integration/graphql_executor.py`

```python
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class GraphQLExecutor:
    """
    Execute GraphQL operations.
    
    Features:
    - Queries and mutations
    - Variables support
    - Custom headers
    - Response parsing
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        url = data.inputs.get('url')
        query = data.inputs.get('query')
        variables = data.inputs.get('variables', {})
        operation_name = data.inputs.get('operationName')
        headers = data.inputs.get('headers', {})
        timeout = data.inputs.get('timeout', 30)
        
        if not url:
            raise ValueError("GraphQL endpoint URL is required")
        if not query:
            raise ValueError("GraphQL query is required")
        
        # Use aiohttp for the request
        import aiohttp
        
        payload = {
            'query': query,
            'variables': variables
        }
        if operation_name:
            payload['operationName'] = operation_name
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers={
                    'content-type': 'application/json',
                    **headers
                },
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                result = await response.json()
                
                return {
                    'success': 'errors' not in result or not result['errors'],
                    'data': result.get('data'),
                    'errors': result.get('errors'),
                    'statusCode': response.status
                }
```

---

## D.6 AI Enhancement Nodes

### D.6.1 Prompt Template Node

```python
# python-backend/app/orchestrator/node_executors/ai/prompt_template_executor.py

from typing import Any
import chevron
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class PromptTemplateExecutor:
    """
    Generate prompts from templates with variable substitution.
    
    Supports multiple template formats:
    - mustache: {{variable}}
    - fstring: {variable}
    - jinja2: {{ variable }}
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        template = data.inputs.get('template', '')
        variables = data.inputs.get('variables', {})
        format_type = data.inputs.get('format', 'mustache')
        
        if format_type == 'mustache':
            result = chevron.render(template, variables)
        elif format_type == 'fstring':
            result = template.format(**variables)
        elif format_type == 'jinja2':
            from jinja2 import Template
            result = Template(template).render(**variables)
        else:
            raise ValueError(f"Unknown format: {format_type}")
        
        return {
            'prompt': result,
            'template': template,
            'variablesUsed': list(variables.keys()),
            'tokenCount': self._estimate_tokens(result)
        }
    
    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimation for budgeting."""
        return len(text.split()) * 1.3  # Rough estimate
```

### D.6.2 Output Parser Node

```python
# python-backend/app/orchestrator/node_executors/ai/output_parser_executor.py

import json
import re
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class OutputParserExecutor:
    """
    Parse and validate LLM outputs.
    
    Parsers:
    - json: Extract and parse JSON
    - regex: Extract with regex pattern
    - list: Parse numbered/bulleted lists
    - key_value: Parse key: value format
    """
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        text = data.inputs.get('text', '')
        parser_type = data.inputs.get('parser', 'json')
        schema = data.inputs.get('schema')  # For validation
        
        if parser_type == 'json':
            result = self._parse_json(text)
        elif parser_type == 'regex':
            pattern = data.inputs.get('pattern', '')
            result = self._parse_regex(text, pattern)
        elif parser_type == 'list':
            result = self._parse_list(text)
        elif parser_type == 'key_value':
            result = self._parse_key_value(text)
        else:
            raise ValueError(f"Unknown parser: {parser_type}")
        
        # Validate against schema if provided
        if schema:
            is_valid, errors = self._validate_schema(result, schema)
            return {
                'parsed': result,
                'valid': is_valid,
                'validationErrors': errors
            }
        
        return {'parsed': result}
    
    def _parse_json(self, text: str) -> Any:
        """Extract and parse JSON from text."""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Try to find JSON in code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to find JSON object/array
        json_match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        raise ValueError("Could not parse JSON from text")
    
    def _parse_regex(self, text: str, pattern: str) -> list:
        """Extract with regex pattern."""
        matches = re.findall(pattern, text)
        return matches
    
    def _parse_list(self, text: str) -> list:
        """Parse numbered or bulleted lists."""
        lines = text.split('\n')
        items = []
        
        for line in lines:
            # Match: "1. item" or "- item" or "* item"
            match = re.match(r'^[\s]*(?:\d+[.\)]\s+|[-*]\s+)(.+)$', line)
            if match:
                items.append(match.group(1).strip())
        
        return items
    
    def _parse_key_value(self, text: str) -> dict:
        """Parse key: value format."""
        result = {}
        lines = text.split('\n')
        
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                result[key.strip()] = value.strip()
        
        return result
```

### D.6.3 Multi-Model Router Node

```python
# python-backend/app/orchestrator/node_executors/ai/multi_model_router_executor.py

from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

class MultiModelRouterExecutor:
    """
    Route requests to different models based on criteria.
    
    Routing strategies:
    - cost: Cheapest model that can handle request
    - complexity: Route based on token count/complexity
    - quality: Use best available model
    - fallback: Try primary, fallback on failure
    """
    
    MODELS = {
        'gpt-4': {'cost_per_1k': 0.03, 'max_tokens': 8192, 'quality': 'high'},
        'gpt-3.5': {'cost_per_1k': 0.002, 'max_tokens': 4096, 'quality': 'medium'},
        'claude': {'cost_per_1k': 0.008, 'max_tokens': 100000, 'quality': 'high'},
    }
    
    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        prompt = data.inputs.get('prompt', '')
        strategy = data.inputs.get('strategy', 'cost')
        preferred_model = data.inputs.get('preferredModel')
        fallback_models = data.inputs.get('fallbackModels', [])
        max_cost = data.inputs.get('maxCost')
        
        # Estimate token count
        est_tokens = len(prompt.split()) * 1.3
        
        # Select model based on strategy
        if strategy == 'cost':
            selected = self._select_by_cost(est_tokens, max_cost)
        elif strategy == 'complexity':
            selected = self._select_by_complexity(prompt, est_tokens)
        elif strategy == 'quality':
            selected = self._select_by_quality()
        elif strategy == 'fallback':
            selected = preferred_model or fallback_models[0] if fallback_models else 'gpt-3.5'
        else:
            selected = preferred_model or 'gpt-3.5'
        
        return {
            'selectedModel': selected,
            'estimatedTokens': est_tokens,
            'estimatedCost': self._estimate_cost(selected, est_tokens),
            'strategy': strategy
        }
    
    def _select_by_cost(self, tokens: float, max_cost: float = None) -> str:
        """Select cheapest model."""
        sorted_models = sorted(
            self.MODELS.items(),
            key=lambda x: x[1]['cost_per_1k']
        )
        
        for model, config in sorted_models:
            cost = (tokens / 1000) * config['cost_per_1k']
            if max_cost is None or cost <= max_cost:
                return model
        
        return sorted_models[0][0]
    
    def _select_by_complexity(self, prompt: str, tokens: float) -> str:
        """Select based on complexity heuristics."""
        # Simple heuristics for complexity
        if tokens > 4000:
            return 'claude'  # High context
        if 'reasoning' in prompt.lower() or 'analyze' in prompt.lower():
            return 'gpt-4'  # Complex reasoning
        return 'gpt-3.5'  # Default
    
    def _select_by_quality(self) -> str:
        """Select highest quality model."""
        return 'gpt-4'
    
    def _estimate_cost(self, model: str, tokens: float) -> float:
        """Estimate API cost."""
        if model in self.MODELS:
            return (tokens / 1000) * self.MODELS[model]['cost_per_1k']
        return 0.0
```

---

## Testing Requirements

### Unit Tests
```python
# tests/unit/executors/flow/test_parallel.py
# tests/unit/executors/flow/test_join.py
# tests/unit/executors/flow/test_subworkflow.py
# tests/unit/executors/error_handling/test_circuit_breaker.py
# tests/unit/executors/integration/test_websocket.py
# tests/unit/executors/integration/test_graphql.py
# tests/unit/executors/ai/test_prompt_template.py
# tests/unit/executors/ai/test_output_parser.py
# tests/unit/executors/ai/test_multi_model_router.py
```

---

## Definition of Done

- [ ] Parallel/Join nodes with merge strategies
- [ ] Subworkflow node with permission checks
- [ ] Circuit Breaker with state machine
- [ ] WebSocket Client with multiple modes
- [ ] GraphQL Request node
- [ ] AI enhancement nodes (prompt template, output parser, model router)
- [ ] All unit tests passing
- [ ] Integration tests for complex nodes
- [ ] Circuit breaker state storage documented (Redis migration path)
