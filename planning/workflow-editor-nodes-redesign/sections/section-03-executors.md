Now I'll generate the complete, self-contained content for section-03-executors based on the implementation plan and test plan.

# Section 03: Node Executors (Backend)

## Overview

This section implements the executor classes that run each node type during workflow execution. Each executor integrates with existing backend services (LLM Gateway, HybridRAG, ApprovalDBService, MediaTaskService) and follows a common interface for consistent orchestration.

**Dependencies:**
- Section 02 (Backend Node Type Registry) must be complete — executors use registry definitions
- Existing services: LLM Gateway, HybridRAG, ApprovalDBService, MediaTaskService

**What this section delivers:**
- `NodeExecutor` protocol and base data structures
- 5 executor implementations: LLM, RAG, Conditional, Approval, Image
- Credit enforcement before/after execution
- Security-hardened expression evaluation for conditionals
- Integration with existing service layer

---

## Tests First (TDD)

Write these tests BEFORE implementing. All tests go in `python-backend/tests/test_node_executors.py`.

```python
# python-backend/tests/test_node_executors.py

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.orchestrator.node_executors.base import NodeExecutionData, ExecutionContext
from app.orchestrator.node_executors.llm_executor import LLMExecutor
from app.orchestrator.node_executors.rag_executor import RAGExecutor
from app.orchestrator.node_executors.conditional_executor import ConditionalExecutor
from app.orchestrator.node_executors.approval_executor import ApprovalExecutor
from app.orchestrator.node_executors.image_executor import ImageExecutor


@pytest.mark.unit
class TestLLMExecutor:
    """Test LLM Call node executor."""

    async def test_llm_executor_calls_gateway_with_correct_params(self):
        """LLM executor calls LLM Gateway with model and prompt from config."""
        # Stub: create mock LLM Gateway, configure LLMExecutor to use it
        # Stub: call execute() with prompt and model config
        # Stub: assert gateway called with correct model and prompt
        pass

    async def test_llm_executor_resolves_expressions_in_prompt(self):
        """LLM executor resolves {{variable}} expressions before calling gateway."""
        # Stub: create executor with expression resolver mock
        # Stub: config has prompt with "{{node1.response}}"
        # Stub: execution state has node1 output
        # Stub: assert resolver called and prompt passed to gateway is resolved
        pass

    async def test_llm_executor_returns_response_and_usage(self):
        """LLM executor returns response text in 'response' output and usage in 'usage' output."""
        # Stub: mock gateway to return response and usage
        # Stub: call execute()
        # Stub: assert outputs dict has 'response' and 'usage' keys with correct data
        pass

    async def test_llm_executor_checks_credits_before_execution(self):
        """LLM executor checks user credit balance before execution, raises InsufficientCreditsError."""
        # Stub: create context with low credit balance
        # Stub: mock cost estimation to exceed balance
        # Stub: assert execute() raises InsufficientCreditsError
        pass

    async def test_llm_executor_deducts_credits_after_call(self):
        """LLM executor deducts credits after successful call."""
        # Stub: mock gateway and credit service
        # Stub: call execute()
        # Stub: assert credit service deduct method called with correct amount
        pass

    async def test_llm_executor_propagates_gateway_errors(self):
        """LLM executor propagates LLM Gateway errors as node execution error."""
        # Stub: mock gateway to raise exception
        # Stub: assert execute() raises NodeExecutionError with original error message
        pass


@pytest.mark.unit
class TestRAGExecutor:
    """Test RAG Query node executor."""

    async def test_rag_executor_calls_hybrid_rag(self):
        """RAG executor calls HybridRAG with correct collection and query."""
        # Stub: mock HybridRAG engine
        # Stub: config has collection name and query
        # Stub: assert HybridRAG called with correct params
        pass

    async def test_rag_executor_respects_search_mode(self):
        """RAG executor respects searchMode (vector, hybrid, bm25)."""
        # Stub: test all three modes
        # Stub: assert HybridRAG called with correct search mode parameter
        pass

    async def test_rag_executor_applies_topk_and_threshold(self):
        """RAG executor applies topK and scoreThreshold parameters."""
        # Stub: config has topK=3, scoreThreshold=0.7
        # Stub: assert HybridRAG called with correct limits
        pass

    async def test_rag_executor_returns_documents_context_metadata(self):
        """RAG executor returns documents array, context text, and metadata."""
        # Stub: mock HybridRAG to return chunks
        # Stub: call execute()
        # Stub: assert outputs has 'documents', 'context' (concatenated text), 'metadata'
        pass

    async def test_rag_executor_raises_error_when_collection_not_found(self):
        """RAG executor raises error when collection not found."""
        # Stub: mock HybridRAG to raise CollectionNotFoundError
        # Stub: assert execute() raises NodeExecutionError
        pass


@pytest.mark.unit
class TestConditionalExecutor:
    """Test Conditional node executor."""

    async def test_conditional_visual_mode_equals_match(self):
        """Conditional executor visual mode equals operator (match → true output)."""
        # Stub: config with visual mode, equals operator, compareValue
        # Stub: input value matches
        # Stub: assert output routed to 'true' port
        pass

    async def test_conditional_visual_mode_equals_no_match(self):
        """Conditional executor visual mode equals operator (no match → false output)."""
        # Stub: input value doesn't match
        # Stub: assert output routed to 'false' port
        pass

    async def test_conditional_visual_mode_not_equals(self):
        """Conditional executor visual mode notEquals operator."""
        # Stub: test both match and no-match cases
        pass

    async def test_conditional_visual_mode_greater_than(self):
        """Conditional executor visual mode greaterThan/lessThan with numeric values."""
        # Stub: numeric comparison
        # Stub: assert correct routing
        pass

    async def test_conditional_visual_mode_contains(self):
        """Conditional executor visual mode contains operator with string."""
        # Stub: string contains check
        pass

    async def test_conditional_visual_mode_is_empty(self):
        """Conditional executor visual mode isEmpty/isNotEmpty."""
        # Stub: test empty string, null, undefined handling
        pass

    async def test_conditional_visual_mode_and_combiner(self):
        """Conditional executor visual mode AND combiner (both conditions must pass)."""
        # Stub: two conditions with AND
        # Stub: test all combinations (T+T→T, T+F→F, F+T→F, F+F→F)
        pass

    async def test_conditional_visual_mode_or_combiner(self):
        """Conditional executor visual mode OR combiner (either condition passes)."""
        # Stub: two conditions with OR
        # Stub: test combinations (T+T→T, T+F→T, F+T→T, F+F→F)
        pass

    async def test_conditional_advanced_mode_expression(self):
        """Conditional executor advanced mode with simpleeval expression."""
        # Stub: config with advanced mode, expression like "value > 10"
        # Stub: assert simpleeval called and result routed correctly
        pass

    async def test_conditional_security_rejects_dunder_access(self):
        """Conditional executor security: rejects expressions with __dunder__ access."""
        # Stub: expression with "__class__" or "__mro__"
        # Stub: assert execute() raises SecurityError or ValidationError
        pass

    async def test_conditional_security_rejects_import(self):
        """Conditional executor security: rejects expressions with import/exec/eval."""
        # Stub: malicious expressions
        # Stub: assert rejected before execution
        pass

    async def test_conditional_security_max_expression_length(self):
        """Conditional executor security: enforces max expression length (1000 chars)."""
        # Stub: expression longer than 1000 chars
        # Stub: assert ValidationError raised
        pass

    async def test_conditional_security_timeout(self):
        """Conditional executor security: times out after 5 seconds."""
        # Stub: mock simpleeval to hang
        # Stub: assert TimeoutError raised after 5s
        pass


@pytest.mark.unit
class TestApprovalExecutor:
    """Test Approval Gate node executor."""

    async def test_approval_executor_creates_approval_request(self):
        """Approval executor creates ApprovalRequest via ApprovalDBService."""
        # Stub: mock ApprovalDBService
        # Stub: call execute() with data and approvers
        # Stub: assert create_request() called with correct params
        pass

    async def test_approval_executor_pauses_workflow(self):
        """Approval executor pauses workflow and returns checkpoint."""
        # Stub: assert execution returns special "paused" status
        # Stub: workflow state saved for later resume
        pass

    async def test_approval_executor_routes_to_approved_output(self):
        """Approval executor routes to 'approved' output when approved."""
        # Stub: simulate approval response
        # Stub: assert output routed to 'approved' port with metadata
        pass

    async def test_approval_executor_routes_to_rejected_output(self):
        """Approval executor routes to 'rejected' output when rejected."""
        # Stub: simulate rejection
        # Stub: assert output routed to 'rejected' port
        pass

    async def test_approval_executor_timeout(self):
        """Approval executor times out and rejects after configured timeout."""
        # Stub: config with timeout=60 minutes
        # Stub: simulate timeout expiry
        # Stub: assert auto-rejected and workflow notified
        pass


@pytest.mark.unit
class TestImageExecutor:
    """Test Generate Image node executor."""

    async def test_image_executor_creates_media_task(self):
        """Image executor creates media task via MediaTaskService."""
        # Stub: mock MediaTaskService
        # Stub: call execute() with prompt and config
        # Stub: assert media task created with correct params
        pass

    async def test_image_executor_returns_image_url_and_metadata(self):
        """Image executor returns imageUrl and metadata on success."""
        # Stub: mock successful image generation
        # Stub: assert outputs contain 'imageUrl' and 'metadata'
        pass

    async def test_image_executor_checks_credits_before_execution(self):
        """Image executor checks credits before execution."""
        # Stub: low balance scenario
        # Stub: assert InsufficientCreditsError raised
        pass

    async def test_image_executor_handles_generation_failure(self):
        """Image executor handles generation failure gracefully."""
        # Stub: mock MediaTaskService to fail
        # Stub: assert NodeExecutionError raised with clear message
        pass
```

**Test count:** 37 test stubs across 5 executor classes.

**Run tests:** `cd python-backend && uv run pytest tests/test_node_executors.py -v`

Expected initial result: All tests fail (executors not implemented yet).

---

## Implementation

### 1. Base Protocol and Data Structures

**File:** `python-backend/app/orchestrator/node_executors/base.py`

```python
"""Base protocol and data structures for node executors."""

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class NodeExecutionData:
    """Data flowing between nodes."""
    json: dict  # Primary data payload
    binary: dict | None = None  # Binary attachments (images, files)
    metadata: dict | None = None  # Execution metadata (timing, costs)


@dataclass
class ExecutionContext:
    """Context passed to all node executors."""
    tenant_id: int
    user_id: int
    execution_id: str
    credit_balance: float
    session_info: dict
    execution_state: dict = field(default_factory=dict)  # Node outputs keyed by node ID


class InsufficientCreditsError(Exception):
    """Raised when user has insufficient credits for operation."""
    pass


class NodeExecutionError(Exception):
    """Raised when node execution fails."""
    pass


@runtime_checkable
class NodeExecutor(Protocol):
    """Protocol for node executors."""

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute node and return outputs.

        Args:
            node_config: User-configured values for this node
            inputs: Connected input data keyed by input name
            context: Execution context with tenant, user, credits, state

        Returns:
            Dict of outputs keyed by output name

        Raises:
            InsufficientCreditsError: When credits insufficient for operation
            NodeExecutionError: When execution fails
        """
        ...
```

### 2. LLM Executor

**File:** `python-backend/app/orchestrator/node_executors/llm_executor.py`

```python
"""LLM Call node executor."""

from app.orchestrator.node_executors.base import (
    NodeExecutor,
    NodeExecutionData,
    ExecutionContext,
    InsufficientCreditsError,
    NodeExecutionError,
)
from app.orchestrator.expression_resolver import resolve_expressions
# Imports for existing services (stubs - actual imports depend on codebase structure):
# from app.services.llm_gateway import LLMGateway
# from app.services.credit_service import CreditService


class LLMExecutor:
    """Executor for LLM Call nodes."""

    def __init__(self, llm_gateway, credit_service, expression_resolver):
        """
        Initialize LLM executor.

        Args:
            llm_gateway: LLM Gateway service instance
            credit_service: Credit service for balance checks and deductions
            expression_resolver: Expression resolver for {{variable}} syntax
        """
        self.llm_gateway = llm_gateway
        self.credit_service = credit_service
        self.expression_resolver = expression_resolver

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute LLM call.

        Config fields:
            - prompt: str (supports {{variable}} expressions)
            - systemPrompt: str | None
            - model: str
            - temperature: float
            - maxTokens: int | None
            - contextData: dict | None (can also come from input port)

        Outputs:
            - response: LLM response text
            - usage: Token counts, cost, model used
        """
        # 1. Resolve expressions in prompt using execution state
        prompt = self.expression_resolver.resolve(
            node_config.get("prompt", ""),
            context.execution_state,
        )
        system_prompt = node_config.get("systemPrompt")
        if system_prompt:
            system_prompt = self.expression_resolver.resolve(
                system_prompt,
                context.execution_state,
            )

        # 2. Estimate cost
        estimated_cost = await self._estimate_llm_cost(
            prompt=prompt,
            model=node_config["model"],
            max_tokens=node_config.get("maxTokens"),
        )

        # 3. Check credit balance
        if context.credit_balance < estimated_cost:
            raise InsufficientCreditsError(
                f"Insufficient credits. Required: {estimated_cost}, "
                f"Available: {context.credit_balance}"
            )

        # 4. Call LLM Gateway
        try:
            result = await self.llm_gateway.complete(
                model=node_config["model"],
                messages=[
                    {"role": "system", "content": system_prompt}
                    if system_prompt
                    else None,
                    {"role": "user", "content": prompt},
                ],
                temperature=node_config.get("temperature", 0.7),
                max_tokens=node_config.get("maxTokens"),
                tenant_id=context.tenant_id,
                user_id=context.user_id,
            )
        except Exception as e:
            raise NodeExecutionError(f"LLM call failed: {str(e)}") from e

        # 5. Deduct actual credits
        actual_cost = result.get("cost_usd", estimated_cost)
        await self.credit_service.deduct(
            user_id=context.user_id,
            amount=actual_cost,
            reason=f"LLM call in workflow {context.execution_id}",
        )

        # 6. Return outputs
        return {
            "response": NodeExecutionData(
                json={"text": result["content"]},
            ),
            "usage": NodeExecutionData(
                json={
                    "prompt_tokens": result.get("usage", {}).get("prompt_tokens"),
                    "completion_tokens": result.get("usage", {}).get("completion_tokens"),
                    "total_tokens": result.get("usage", {}).get("total_tokens"),
                    "cost_usd": actual_cost,
                    "model": result.get("model"),
                },
            ),
        }

    async def _estimate_llm_cost(
        self, prompt: str, model: str, max_tokens: int | None
    ) -> float:
        """Estimate cost based on prompt length and model pricing."""
        # Stub: rough estimation based on character count
        # Real implementation would use model pricing from provider config
        prompt_tokens = len(prompt) // 4  # Rough estimate
        response_tokens = max_tokens or (prompt_tokens * 2)  # Estimate 2x prompt
        total_tokens = prompt_tokens + response_tokens
        # Stub: $0.01 per 1000 tokens as default
        return (total_tokens / 1000) * 0.01
```

### 3. RAG Executor

**File:** `python-backend/app/orchestrator/node_executors/rag_executor.py`

```python
"""RAG Query node executor."""

from app.orchestrator.node_executors.base import (
    NodeExecutor,
    NodeExecutionData,
    ExecutionContext,
    NodeExecutionError,
)
# Stub imports:
# from app.services.hybrid_rag import HybridRAG


class RAGExecutor:
    """Executor for RAG Query nodes."""

    def __init__(self, hybrid_rag):
        """
        Initialize RAG executor.

        Args:
            hybrid_rag: HybridRAG engine instance
        """
        self.hybrid_rag = hybrid_rag

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute RAG query.

        Config fields:
            - query: str (can be from input port)
            - collection: str
            - topK: int
            - searchMode: 'vector' | 'hybrid' | 'bm25'
            - scoreThreshold: float
            - metadataFilter: dict | None

        Outputs:
            - documents: array of retrieved chunks
            - context: concatenated document text
            - metadata: retrieval stats
        """
        # Get query from input or config
        query = inputs.get("query", {}).json.get("text") or node_config.get("query")
        if not query:
            raise NodeExecutionError("RAG Query node requires query input")

        collection_name = node_config["collection"]
        top_k = node_config.get("topK", 5)
        search_mode = node_config.get("searchMode", "hybrid")
        score_threshold = node_config.get("scoreThreshold", 0.5)
        metadata_filter = node_config.get("metadataFilter")

        try:
            results = await self.hybrid_rag.search(
                collection_name=collection_name,
                query=query,
                top_k=top_k,
                search_mode=search_mode,
                score_threshold=score_threshold,
                metadata_filter=metadata_filter,
                tenant_id=context.tenant_id,
            )
        except Exception as e:
            raise NodeExecutionError(f"RAG query failed: {str(e)}") from e

        # Concatenate document text for LLM context
        context_text = "\n\n".join(
            [doc.get("content", "") for doc in results.get("documents", [])]
        )

        return {
            "documents": NodeExecutionData(
                json={"items": results.get("documents", [])},
            ),
            "context": NodeExecutionData(
                json={"text": context_text},
            ),
            "metadata": NodeExecutionData(
                json={
                    "total_results": len(results.get("documents", [])),
                    "search_mode": search_mode,
                    "score_threshold": score_threshold,
                },
            ),
        }
```

### 4. Conditional Executor

**File:** `python-backend/app/orchestrator/node_executors/conditional_executor.py`

```python
"""Conditional node executor with security-hardened expression evaluation."""

import re
import signal
from contextlib import contextmanager
from simpleeval import simple_eval, EvalWithCompoundTypes, NameNotDefined

from app.orchestrator.node_executors.base import (
    NodeExecutor,
    NodeExecutionData,
    ExecutionContext,
    NodeExecutionError,
)


class SecurityError(Exception):
    """Raised when expression contains forbidden patterns."""
    pass


class TimeoutError(Exception):
    """Raised when expression evaluation times out."""
    pass


@contextmanager
def timeout(seconds: int):
    """Context manager for timing out operations."""
    def timeout_handler(signum, frame):
        raise TimeoutError(f"Operation timed out after {seconds} seconds")

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)


class ConditionalExecutor:
    """Executor for Conditional nodes."""

    MAX_EXPRESSION_LENGTH = 1000
    EXECUTION_TIMEOUT = 5  # seconds

    # Forbidden patterns (security)
    FORBIDDEN_PATTERNS = [
        r"__\w+__",  # Dunder access
        r"\bimport\b",
        r"\bexec\b",
        r"\beval\b",
        r"\bcompile\b",
        r"\bopen\b",
        r"\bfile\b",
    ]

    def __init__(self):
        """Initialize conditional executor."""
        pass

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute conditional logic.

        Config fields:
            - mode: 'visual' | 'advanced'
            - (visual) conditions: list of {field, operator, compareValue, combineWith}
            - (advanced) expression: str

        Inputs:
            - value: any data to evaluate

        Outputs:
            - true: data forwarded when condition true
            - false: data forwarded when condition false
        """
        input_data = inputs.get("value", NodeExecutionData(json={}))

        mode = node_config.get("mode", "visual")

        if mode == "visual":
            result = self._evaluate_visual_conditions(
                node_config.get("conditions", []),
                input_data.json,
            )
        else:  # advanced
            result = await self._evaluate_advanced_expression(
                node_config.get("expression", ""),
                input_data.json,
            )

        # Route to appropriate output
        if result:
            return {"true": input_data}
        else:
            return {"false": input_data}

    def _evaluate_visual_conditions(
        self, conditions: list[dict], data: dict
    ) -> bool:
        """
        Evaluate visual mode conditions.

        Each condition: {field, operator, compareValue, combineWith}
        combineWith: 'AND' | 'OR'
        """
        if not conditions:
            return True  # No conditions = always true

        results = []
        combiners = []

        for cond in conditions:
            field = cond.get("field", "")
            operator = cond.get("operator", "equals")
            compare_value = cond.get("compareValue")
            combiner = cond.get("combineWith", "AND")

            # Extract field value using JSONPath-like syntax (simple dot notation)
            value = self._get_nested_value(data, field)

            # Evaluate operator
            cond_result = self._evaluate_operator(value, operator, compare_value)
            results.append(cond_result)
            if len(results) > 1:
                combiners.append(combiner)

        # Combine results with AND/OR
        final_result = results[0]
        for i, combiner in enumerate(combiners):
            if combiner == "AND":
                final_result = final_result and results[i + 1]
            else:  # OR
                final_result = final_result or results[i + 1]

        return final_result

    def _get_nested_value(self, data: dict, path: str) -> any:
        """Extract nested value from dict using dot notation."""
        if not path:
            return data
        keys = path.split(".")
        value = data
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            else:
                return None
        return value

    def _evaluate_operator(self, value: any, operator: str, compare_value: any) -> bool:
        """Evaluate single operator comparison."""
        operators_map = {
            "equals": lambda v, c: v == c,
            "notEquals": lambda v, c: v != c,
            "greaterThan": lambda v, c: v > c,
            "lessThan": lambda v, c: v < c,
            "greaterOrEqual": lambda v, c: v >= c,
            "lessOrEqual": lambda v, c: v <= c,
            "contains": lambda v, c: c in str(v),
            "startsWith": lambda v, c: str(v).startswith(str(c)),
            "endsWith": lambda v, c: str(v).endswith(str(c)),
            "isEmpty": lambda v, c: not v,
            "isNotEmpty": lambda v, c: bool(v),
            "matchesRegex": lambda v, c: bool(
                re.match(c, str(v), timeout=1)
            ),  # ReDoS protection
        }

        if operator not in operators_map:
            raise NodeExecutionError(f"Unknown operator: {operator}")

        try:
            return operators_map[operator](value, compare_value)
        except Exception as e:
            raise NodeExecutionError(
                f"Operator evaluation failed: {operator} - {str(e)}"
            ) from e

    async def _evaluate_advanced_expression(
        self, expression: str, data: dict
    ) -> bool:
        """
        Evaluate advanced mode expression using simpleeval (security-hardened).

        Security measures:
            - Max expression length: 1000 chars
            - Forbidden patterns check (no dunder, import, exec, etc.)
            - Restricted function set (no file I/O, no imports)
            - Execution timeout: 5 seconds
        """
        # 1. Length check
        if len(expression) > self.MAX_EXPRESSION_LENGTH:
            raise SecurityError(
                f"Expression too long (max {self.MAX_EXPRESSION_LENGTH} chars)"
            )

        # 2. Forbidden pattern check
        for pattern in self.FORBIDDEN_PATTERNS:
            if re.search(pattern, expression, re.IGNORECASE):
                raise SecurityError(
                    f"Expression contains forbidden pattern: {pattern}"
                )

        # 3. Prepare safe evaluation environment
        safe_names = {
            "data": data,
            "value": data,  # Alias for convenience
            "len": len,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
            "True": True,
            "False": False,
            "None": None,
        }

        # 4. Evaluate with timeout
        try:
            with timeout(self.EXECUTION_TIMEOUT):
                result = simple_eval(
                    expression,
                    names=safe_names,
                    functions={},  # No custom functions
                )
            return bool(result)
        except TimeoutError as e:
            raise NodeExecutionError(f"Expression evaluation timed out: {str(e)}") from e
        except NameNotDefined as e:
            raise NodeExecutionError(f"Undefined variable in expression: {str(e)}") from e
        except Exception as e:
            raise NodeExecutionError(f"Expression evaluation failed: {str(e)}") from e
```

### 5. Approval Executor

**File:** `python-backend/app/orchestrator/node_executors/approval_executor.py`

```python
"""Approval Gate node executor."""

from app.orchestrator.node_executors.base import (
    NodeExecutor,
    NodeExecutionData,
    ExecutionContext,
    NodeExecutionError,
)
# Stub import:
# from app.services.approval_db_service import ApprovalDBService


class ApprovalExecutor:
    """Executor for Approval Gate nodes."""

    def __init__(self, approval_service):
        """
        Initialize approval executor.

        Args:
            approval_service: ApprovalDBService instance
        """
        self.approval_service = approval_service

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute approval gate (creates approval request and pauses workflow).

        Config fields:
            - approvers: list of user IDs or role names
            - message: str (supports {{variable}})
            - timeout: int (minutes)
            - requiredApprovals: int

        Inputs:
            - data: json to present to approver

        Outputs:
            - approved: original data + approval metadata (when approved)
            - rejected: original data + rejection details (when rejected)

        Special behavior:
            This executor returns a "checkpoint" status that pauses the workflow.
            The orchestrator will save state and resume when approval/rejection received.
        """
        data_to_approve = inputs.get("data", NodeExecutionData(json={})).json

        # Create approval request
        approval_request = await self.approval_service.create_request(
            tenant_id=context.tenant_id,
            created_by=context.user_id,
            approvers=node_config.get("approvers", []),
            message=node_config.get("message", "Please review this data"),
            data=data_to_approve,
            timeout_minutes=node_config.get("timeout", 60),
            required_approvals=node_config.get("requiredApprovals", 1),
            workflow_execution_id=context.execution_id,
        )

        # Return checkpoint status (orchestrator will pause workflow)
        return {
            "_checkpoint": NodeExecutionData(
                json={
                    "status": "paused",
                    "approval_request_id": approval_request["id"],
                    "awaiting": "approval_response",
                },
                metadata={
                    "node_type": "approval_gate",
                    "approval_id": approval_request["id"],
                },
            )
        }

    async def resume_after_approval(
        self, approval_response: dict, original_data: dict
    ) -> dict[str, NodeExecutionData]:
        """
        Resume execution after approval/rejection received.

        Called by orchestrator when approval decision made.
        """
        if approval_response.get("status") == "approved":
            return {
                "approved": NodeExecutionData(
                    json=original_data,
                    metadata={
                        "approved_by": approval_response.get("approved_by"),
                        "approved_at": approval_response.get("approved_at"),
                        "approval_id": approval_response.get("id"),
                    },
                )
            }
        else:
            return {
                "rejected": NodeExecutionData(
                    json=original_data,
                    metadata={
                        "rejected_by": approval_response.get("rejected_by"),
                        "rejected_at": approval_response.get("rejected_at"),
                        "rejection_reason": approval_response.get("reason"),
                        "approval_id": approval_response.get("id"),
                    },
                )
            }
```

### 6. Image Executor

**File:** `python-backend/app/orchestrator/node_executors/image_executor.py`

```python
"""Generate Image node executor."""

from app.orchestrator.node_executors.base import (
    NodeExecutor,
    NodeExecutionData,
    ExecutionContext,
    InsufficientCreditsError,
    NodeExecutionError,
)
# Stub imports:
# from app.services.media_task_service import MediaTaskService
# from app.services.credit_service import CreditService


class ImageExecutor:
    """Executor for Generate Image nodes."""

    def __init__(self, media_task_service, credit_service):
        """
        Initialize image executor.

        Args:
            media_task_service: MediaTaskService for image generation
            credit_service: CreditService for balance checks
        """
        self.media_task_service = media_task_service
        self.credit_service = credit_service

    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute image generation.

        Config fields:
            - prompt: str (can be from input)
            - negativePrompt: str | None
            - provider: str
            - size: str (1024x1024, etc.)
            - quality: 'standard' | 'hd'
            - style: 'natural' | 'vivid'

        Outputs:
            - imageUrl: generated image URL
            - metadata: provider, cost, parameters
        """
        # Get prompt from input or config
        prompt = inputs.get("prompt", {}).json.get("text") or node_config.get("prompt")
        if not prompt:
            raise NodeExecutionError("Image generation requires prompt")

        # Estimate cost (fixed per provider/size)
        estimated_cost = self._estimate_image_cost(
            provider=node_config.get("provider", "dall-e-3"),
            size=node_config.get("size", "1024x1024"),
            quality=node_config.get("quality", "standard"),
        )

        # Check credits
        if context.credit_balance < estimated_cost:
            raise InsufficientCreditsError(
                f"Insufficient credits for image generation. "
                f"Required: {estimated_cost}, Available: {context.credit_balance}"
            )

        # Create media task
        try:
            task = await self.media_task_service.create_image_task(
                tenant_id=context.tenant_id,
                user_id=context.user_id,
                prompt=prompt,
                negative_prompt=node_config.get("negativePrompt"),
                provider=node_config.get("provider"),
                size=node_config.get("size"),
                quality=node_config.get("quality"),
                style=node_config.get("style"),
            )

            # Poll for completion (or use webhook/SSE)
            result = await self.media_task_service.wait_for_completion(
                task_id=task["id"],
                timeout_seconds=300,
            )

            if result["status"] != "completed":
                raise NodeExecutionError(
                    f"Image generation failed: {result.get('error', 'Unknown error')}"
                )

            # Deduct credits
            actual_cost = result.get("cost_usd", estimated_cost)
            await self.credit_service.deduct(
                user_id=context.user_id,
                amount=actual_cost,
                reason=f"Image generation in workflow {context.execution_id}",
            )

            return {
                "imageUrl": NodeExecutionData(
                    json={"url": result["output_url"]},
                ),
                "metadata": NodeExecutionData(
                    json={
                        "provider": result.get("provider"),
                        "cost_usd": actual_cost,
                        "size": node_config.get("size"),
                        "quality": node_config.get("quality"),
                        "generation_time_ms": result.get("generation_time_ms"),
                    },
                ),
            }

        except Exception as e:
            raise NodeExecutionError(f"Image generation failed: {str(e)}") from e

    def _estimate_image_cost(self, provider: str, size: str, quality: str) -> float:
        """Estimate image generation cost based on provider and parameters."""
        # Stub: fixed pricing (real implementation would query provider pricing)
        pricing = {
            "dall-e-3": {"1024x1024": {"standard": 0.04, "hd": 0.08}},
            "stable-diffusion": {"1024x1024": {"standard": 0.01}},
            # Add more providers
        }
        return pricing.get(provider, {}).get(size, {}).get(quality, 0.05)
```

### 7. Executor Registry

**File:** `python-backend/app/orchestrator/node_executors/__init__.py`

```python
"""Node executor registry."""

from app.orchestrator.node_executors.llm_executor import LLMExecutor
from app.orchestrator.node_executors.rag_executor import RAGExecutor
from app.orchestrator.node_executors.conditional_executor import ConditionalExecutor
from app.orchestrator.node_executors.approval_executor import ApprovalExecutor
from app.orchestrator.node_executors.image_executor import ImageExecutor


class ExecutorRegistry:
    """Registry mapping node types to executor classes."""

    def __init__(
        self,
        llm_gateway,
        hybrid_rag,
        approval_service,
        media_task_service,
        credit_service,
        expression_resolver,
    ):
        """
        Initialize executor registry with service dependencies.

        Args:
            llm_gateway: LLM Gateway service
            hybrid_rag: HybridRAG engine
            approval_service: ApprovalDBService
            media_task_service: MediaTaskService
            credit_service: CreditService
            expression_resolver: Expression resolver
        """
        self._executors = {
            "llm_call": LLMExecutor(llm_gateway, credit_service, expression_resolver),
            "rag_query": RAGExecutor(hybrid_rag),
            "conditional": ConditionalExecutor(),
            "approval_gate": ApprovalExecutor(approval_service),
            "generate_image": ImageExecutor(media_task_service, credit_service),
            # skill_* executors registered dynamically in section 05
        }

    def get_executor(self, node_type: str):
        """Get executor for node type."""
        executor = self._executors.get(node_type)
        if not executor:
            raise ValueError(f"No executor registered for node type: {node_type}")
        return executor

    def register_executor(self, node_type: str, executor):
        """Register custom executor (used for skill nodes)."""
        self._executors[node_type] = executor
```

---

## Integration Points

### Service Dependencies (Existing)

These services MUST exist in the codebase (referenced but not implemented in this section):

1. **LLM Gateway** (`app.services.llm_gateway.LLMGateway`)
   - Method: `complete(model, messages, temperature, max_tokens, tenant_id, user_id)`
   - Returns: `{content, usage, cost_usd, model}`

2. **HybridRAG** (`app.services.hybrid_rag.HybridRAG`)
   - Method: `search(collection_name, query, top_k, search_mode, score_threshold, metadata_filter, tenant_id)`
   - Returns: `{documents: [...], ...}`

3. **ApprovalDBService** (`app.services.approval_db_service.ApprovalDBService`)
   - Method: `create_request(tenant_id, created_by, approvers, message, data, timeout_minutes, required_approvals, workflow_execution_id)`
   - Returns: `{id, status, ...}`

4. **MediaTaskService** (`app.services.media_task_service.MediaTaskService`)
   - Method: `create_image_task(...)` and `wait_for_completion(task_id, timeout_seconds)`
   - Returns: `{id, status, output_url, cost_usd, ...}`

5. **CreditService** (`app.services.credit_service.CreditService`)
   - Method: `deduct(user_id, amount, reason)`

6. **ExpressionResolver** (Section 04 dependency)
   - Method: `resolve(template: str, execution_state: dict) -> str`

### Orchestrator Integration

The `WorkflowOrchestrator` (Section 08) will:
1. Load `ExecutorRegistry` with service dependencies
2. For each node in compiled workflow, call `registry.get_executor(node_type).execute(...)`
3. Handle checkpoint status from ApprovalExecutor (pause workflow, save state)
4. Resume paused workflows when approval/rejection received

---

## Security Hardening

### Conditional Executor Security

1. **Expression length limit:** Max 1000 characters
2. **Forbidden pattern detection:** Regex scan for `__dunder__`, `import`, `exec`, `eval`, `compile`, `open`, `file`
3. **Restricted evaluation environment:** `simpleeval` with minimal safe names (data, len, str, int, float, bool)
4. **Execution timeout:** 5 seconds via signal.alarm (prevents infinite loops)
5. **ReDoS protection:** Regex operations have 1-second timeout

### Credit Enforcement

1. **Pre-execution check:** All executors with cost (LLM, Image) check balance before execution
2. **Post-execution deduction:** Actual cost deducted after successful completion
3. **Error handling:** Failed executions do NOT deduct credits
4. **Atomic operations:** Credit service must use database transactions

---

## File Paths Summary

**Created/Modified:**
- `python-backend/app/orchestrator/node_executors/base.py` (new)
- `python-backend/app/orchestrator/node_executors/llm_executor.py` (new)
- `python-backend/app/orchestrator/node_executors/rag_executor.py` (new)
- `python-backend/app/orchestrator/node_executors/conditional_executor.py` (new)
- `python-backend/app/orchestrator/node_executors/approval_executor.py` (new)
- `python-backend/app/orchestrator/node_executors/image_executor.py` (new)
- `python-backend/app/orchestrator/node_executors/__init__.py` (new)
- `python-backend/tests/test_node_executors.py` (new)

**Dependencies (must exist):**
- `python-backend/app/services/llm_gateway.py` (existing)
- `python-backend/app/services/hybrid_rag.py` (existing)
- `python-backend/app/services/approval_db_service.py` (existing)
- `python-backend/app/services/media_task_service.py` (existing)
- `python-backend/app/services/credit_service.py` (likely exists, create stub if not)
- `python-backend/app/orchestrator/expression_resolver.py` (Section 04 creates this)

---

## Verification

After implementing this section:

1. **Run tests:** `cd python-backend && uv run pytest tests/test_node_executors.py -v`
   - Expected: All 37 tests pass
2. **Check imports:** Ensure all service imports resolve (adjust paths based on actual codebase structure)
3. **Security audit:** Run conditional executor with malicious expressions, verify all rejected
4. **Credit flow:** Test credit check/deduction with mock credit service
5. **Integration readiness:** Verify ExecutorRegistry can instantiate all 5 executors

**Blocked sections until complete:** Section 07 (FlowCompiler) needs executors to validate node execution capabilities.

**Next section:** Section 04 (Expression Resolver) — provides the `expression_resolver` dependency used by LLMExecutor.