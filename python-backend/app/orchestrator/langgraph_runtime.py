"""LangGraph Runtime -- core execution engine for workflows.

Replaces WorkflowOrchestrator with a production-grade LangGraph runtime
that uses PostgreSQL checkpointing, typed state, and streaming.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import structlog

from app.core.checkpointer import CheckpointerFactory
from app.core.config import settings
from app.orchestrator.errors import (
    CheckpointerError,
    CompilationError,
    RuntimeExecutionError,
)
from app.orchestrator.workflow_compiler import WorkflowCompiler
from app.orchestrator.workflow_state import WorkflowState

logger = structlog.get_logger()


class LangGraphRuntime:
    """Production-grade workflow execution engine.

    Key responsibilities:
    - Compile ReactFlow JSON -> LangGraph CompiledStateGraph
    - Execute compiled graphs with PostgreSQL checkpointing
    - Resume interrupted workflows (HITL, failure recovery)
    - Enforce concurrent workflow limits via semaphore
    - Stream execution events via astream_events
    """

    def __init__(
        self,
        use_postgres: bool = True,
        max_parallel_workflows: int | None = None,
        checkpointer_pool_size: int | None = None,
    ):
        """Initialize the runtime.

        Args:
            use_postgres: Use PostgreSQL checkpointer (True) or MemorySaver (False).
            max_parallel_workflows: Max concurrent workflow executions.
            checkpointer_pool_size: psycopg pool max_size for checkpointer.
        """
        self._use_postgres = use_postgres
        self._max_parallel = max_parallel_workflows or getattr(settings, 'MAX_PARALLEL_WORKFLOWS', 10)
        self._semaphore = asyncio.Semaphore(self._max_parallel)
        self._checkpointer = None
        self._compiler = WorkflowCompiler()
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the checkpointer (lazy, idempotent)."""
        if self._initialized:
            return
        self._checkpointer = await CheckpointerFactory.create(self._use_postgres)
        self._initialized = True
        logger.info(
            "LangGraphRuntime initialized",
            checkpointer=type(self._checkpointer).__name__,
            max_parallel=self._max_parallel,
        )

    async def close(self) -> None:
        """Release resources."""
        if self._checkpointer is not None:
            from app.core.checkpointer import cleanup_checkpointers
            await cleanup_checkpointers()
        self._checkpointer = None
        self._initialized = False
        logger.info("LangGraphRuntime closed")

    # ------------------------------------------------------------------
    # Compilation
    # ------------------------------------------------------------------

    async def compile(
        self,
        workflow_json: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        """Compile a ReactFlow workflow into a runnable graph.

        Args:
            workflow_json: Dict with "nodes" and "edges" from ReactFlow.
            metadata: Optional workflow metadata (name, version).

        Returns:
            Compiled LangGraph graph.

        Raises:
            CompilationError: On validation failure.
        """
        await self.initialize()
        return self._compiler.compile(
            flow_json=workflow_json,
            checkpointer=self._checkpointer,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute(
        self,
        compiled_graph: Any,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a compiled workflow to completion.

        Args:
            compiled_graph: Output of compile().
            input_data: Initial state values / trigger data.
            config: LangGraph config with configurable.thread_id, etc.

        Returns:
            Final workflow state.

        Raises:
            RuntimeExecutionError: On execution failure.
        """
        await self.initialize()

        execution_id = config.get("configurable", {}).get("execution_id", "unknown")

        async with self._semaphore:
            logger.info(
                "Executing workflow",
                execution_id=execution_id,
                thread_id=config.get("configurable", {}).get("thread_id"),
            )

            initial_state: WorkflowState = {
                "node_outputs": {},
                "current_node": "",
                "messages": [],
                "errors": [],
                "audit_trail": [],
                "cache_hits": 0,
                "schema_version": 1,
                **input_data,
            }

            try:
                result = await compiled_graph.ainvoke(initial_state, config=config)
                return result

            except Exception as exc:
                logger.error(
                    "Workflow execution failed",
                    execution_id=execution_id,
                    error=str(exc),
                )
                raise RuntimeExecutionError(
                    str(exc),
                    execution_id=execution_id,
                ) from exc

    async def execute_stream(
        self,
        compiled_graph: Any,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a compiled workflow with event streaming.

        Yields LangGraph events from astream_events(version="v2").
        The caller (API layer) translates these to SSE events.

        Args:
            compiled_graph: Output of compile().
            input_data: Initial state values.
            config: LangGraph config.

        Yields:
            LangGraph event dicts.
        """
        await self.initialize()

        initial_state: WorkflowState = {
            "node_outputs": {},
            "current_node": "",
            "messages": [],
            "errors": [],
            "audit_trail": [],
            "cache_hits": 0,
            "schema_version": 1,
            **input_data,
        }

        async with self._semaphore:
            async for event in compiled_graph.astream_events(
                initial_state,
                config=config,
                version="v2",
            ):
                yield event

    # ------------------------------------------------------------------
    # Resume (HITL / checkpoint recovery)
    # ------------------------------------------------------------------

    async def resume(
        self,
        compiled_graph: Any,
        thread_id: str,
        command: Any,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Resume a workflow from an interrupt (HITL or checkpoint).

        Args:
            compiled_graph: The same compiled graph used for initial execution.
            thread_id: The thread_id (tenant_id:execution_id).
            command: LangGraph Command object (e.g., Command(resume=response)).
            config: Optional config overrides.

        Returns:
            Final state after resumption.
        """
        await self.initialize()

        resume_config = config or {
            "configurable": {"thread_id": thread_id}
        }

        async with self._semaphore:
            logger.info("Resuming workflow", thread_id=thread_id)
            result = await compiled_graph.ainvoke(command, config=resume_config)
            return result

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def build_config(
        self,
        tenant_id: str,
        execution_id: str,
        user_id: int,
        workflow_id: str,
        credits_available: int = 0,
        memory_service: Any = None,
        episodic_memory: Any = None,
    ) -> dict[str, Any]:
        """Build a standard LangGraph config dict.

        Thread ID is namespaced as {tenant_id}:{execution_id} for
        multi-tenant isolation in the checkpoint table.
        """
        return {
            "configurable": {
                "thread_id": f"{tenant_id}:{execution_id}",
                "user_id": user_id,
                "tenant_id": tenant_id,
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "credits_available": credits_available,
                "memory_service": memory_service,
                "episodic_memory": episodic_memory,
            }
        }

    async def reprocess_dlq_item(
        self,
        dlq_item_id: int,
        node_id: str,
        input_data: dict[str, Any],
        execution_id: str,
        tenant_id: str,
        user_id: int,
    ) -> None:
        """Reprocess a DLQ item (stub -- fully implemented in Section 07).

        Args:
            dlq_item_id: DLQ record ID.
            node_id: Node that failed.
            input_data: Input data for retry.
            execution_id: New execution ID for the retry.
            tenant_id: Tenant ID.
            user_id: User ID.
        """
        logger.warning(
            "reprocess_dlq_item stub called (Section 07 not implemented)",
            dlq_item_id=dlq_item_id,
            node_id=node_id,
            execution_id=execution_id,
        )
        # Section 07 will implement this to:
        # 1. Create a minimal workflow with just the failed node
        # 2. Execute it with the original/override input
        # 3. Update DLQ status based on result

    @property
    def is_initialized(self) -> bool:
        """Whether the runtime has been initialized."""
        return self._initialized


# ------------------------------------------------------------------
# Singleton instance
# ------------------------------------------------------------------

_runtime_instance: LangGraphRuntime | None = None


def get_langgraph_runtime() -> LangGraphRuntime:
    """Get the singleton LangGraphRuntime instance."""
    global _runtime_instance
    if _runtime_instance is None:
        _runtime_instance = LangGraphRuntime()
    return _runtime_instance
