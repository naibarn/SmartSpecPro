"""
AgencyOrchestrator — graph-walking execution engine for multi-node-type agencies.

Works ABOVE agency-swarm:
  - agent / supervisor nodes → delegated to AgencySwarmAdapter (existing behaviour)
  - router / aggregator / knowledge_base / skill_call / human_approval → executed locally

Enabled when an agency contains at least one non-agent node.
For agent-only agencies the existing AgencyService path is used unchanged.

Feature flag: AGENCY_ORCHESTRATOR_ENABLED (default True)
"""

from __future__ import annotations

import asyncio
import copy
import json
import os
import re
from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from app.services.agentic_limits import MAX_REFLECTION_CYCLES, clamp_to_limit
from app.services.agentic_strategies import get_planning_prompt
from app.services.agency_browser_session_executor import AgencyBrowserSessionExecutor
from app.services.agency_communication_flows import FlowConfig, RoundTripTracker
from app.services.agency_event_emitter import AgencyEventEmitter, check_cancelled
from app.services.agency_instruction_resolver import resolve_instructions
from app.services.agency_output_validator import AgencyOutputValidator
from app.services.agency_loop_handler import LoopHandler
from app.services.agency_conditional_branch import (
    evaluate_context_check,
    evaluate_llm_classify,
    evaluate_rule_based,
)
from app.services.agency_run_context import AgencyRunContext
from app.services.agency_skill_discovery import execute_skill_discovery
from app.services.agency_skill_input_mapper import resolve_skill_input_mappings
from app.services.agency_trace_collector import TraceCollector
from app.services.agency_data_transform import execute_data_transform
from app.services.agency_error_handler import (
    RunTerminatedError,
    execute_fallback,
    execute_retry,
    execute_skip,
    execute_terminate,
    scrub_error_payload,
)

logger = structlog.get_logger(__name__)

ORCHESTRATOR_ENABLED = os.getenv("AGENCY_ORCHESTRATOR_ENABLED", "true").lower() == "true"

AGENT_NODE_TYPES = {"agent", "supervisor"}


# ── Type aliases ───────────────────────────────────────────────────────────────

NodeRow = dict[str, Any]
EdgeRow = dict[str, Any]


# ── Completion Signal ─────────────────────────────────────────────────────────

class CompletionSignal(BaseModel):
    """Structured JSON block emitted by agents to signal task completion."""
    complete: bool
    answer: str = ""


# Regex patterns for extracting JSON completion blocks
_FENCED_JSON_RE = re.compile(r"```json\s*(\{.*?\})\s*```\s*$", re.DOTALL)
_RAW_JSON_RE = re.compile(r'(\{[^{}]*"complete"[^{}]*\})\s*$')


def _parse_completion(text: str) -> CompletionSignal | None:
    """Extract a CompletionSignal from the end of agent response text.

    Supports fenced (```json ... ```) and raw JSON formats.
    Returns None if no valid signal found.
    """
    if not text:
        return None

    # Try fenced JSON first
    match = _FENCED_JSON_RE.search(text)
    if not match:
        # Try raw JSON at end
        match = _RAW_JSON_RE.search(text)

    if not match:
        return None

    try:
        data = json.loads(match.group(1))
        return CompletionSignal(**data)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


# ── Context ───────────────────────────────────────────────────────────────────

class ExecutionContext:
    """Mutable context passed between nodes during execution."""

    def __init__(
        self,
        input_message: str,
        user_token: str,
        tenant_id: str,
        user_id: int = 0,
        task_metadata: dict[str, Any] | None = None,
    ):
        self.input = input_message
        self.user_token = user_token
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.results: dict[str, str] = {}   # node_id → result text
        self.knowledge: list[dict] = []     # populated by knowledge_base nodes
        self.history: list[dict] = []       # conversation history
        # Planner metadata from Node.js (task_run_id, strategy, requirements, etc.)
        self.task_metadata: dict[str, Any] = task_metadata or {}
        # Step-attempt snapshots collected during execution (for billing reconciliation)
        self.step_attempts: list[dict[str, Any]] = []
        # Browser Sessions opened or resumed during the run.
        self.browser_sessions: list[dict[str, Any]] = []
        self.active_browser_session_id: str | None = None
        # Shared run context (populated by orchestrator)
        self.shared_context: AgencyRunContext | None = None
        self.context_snapshot: dict[str, Any] | None = None
        # Delegation depth for autonomous cross-agent calls (section-10)
        self.delegation_depth: int = 0
        # Context-window budget tracker for agent execution
        self.budget_manager: Any | None = None

    def clone(self) -> ExecutionContext:
        """Deep-copy mutable state for branch isolation; share read-only refs."""
        ctx = ExecutionContext(
            input_message=self.input,
            user_token=self.user_token,
            tenant_id=self.tenant_id,
            user_id=self.user_id,
            task_metadata=self.task_metadata,
        )
        ctx.results = copy.deepcopy(self.results)
        ctx.knowledge = copy.deepcopy(self.knowledge)
        ctx.history = copy.deepcopy(self.history)
        ctx.step_attempts = []  # Fresh per branch
        ctx.browser_sessions = list(self.browser_sessions)
        ctx.active_browser_session_id = self.active_browser_session_id
        ctx.shared_context = self.shared_context  # Shared across branches
        ctx.context_snapshot = self.context_snapshot
        ctx.delegation_depth = self.delegation_depth
        ctx.budget_manager = copy.deepcopy(self.budget_manager)
        return ctx

    def get_context_text(self) -> str:
        """Build a context string from accumulated knowledge and results."""
        parts = [f"User Input: {self.input}"]
        if self.knowledge:
            docs_text = "\n".join(
                f"- [{d.get('title', 'Document')}]: {d.get('content', '')[:300]}"
                for d in self.knowledge[:5]
            )
            parts.append(f"Knowledge Base:\n{docs_text}")
        if self.results:
            results_text = "\n".join(
                f"- {nid}: {v[:200]}" for nid, v in self.results.items()
            )
            parts.append(f"Previous Results:\n{results_text}")
        return "\n\n".join(parts)


# ── Orchestrator ──────────────────────────────────────────────────────────────

class AgencyOrchestrator:
    """Graph-walking execution engine for multi-node-type agencies."""

    def __init__(
        self,
        nodes: list[NodeRow],
        edges: list[EdgeRow],
        adapter=None,
        db=None,
        agency_config=None,
        agency_whitelist: set[str] | None = None,
        retrieval_scope_mode: str | None = None,
        guardrails_by_agent: dict[str, list] | None = None,
        user_context: dict[str, Any] | None = None,
        event_emitter: AgencyEventEmitter | None = None,
        redis_client: Any | None = None,
        trace_collector: TraceCollector | None = None,
    ):
        self.nodes: dict[str, NodeRow] = {n["id"]: n for n in nodes}
        self.edges: list[EdgeRow] = edges
        self.adapter = adapter
        self.db = db
        self.agency_config = agency_config
        self.agency_whitelist = agency_whitelist or set()
        self.retrieval_scope_mode = retrieval_scope_mode
        # Guardrail definitions keyed by agent ID for quick lookup
        self.guardrails_by_agent: dict[str, list] = guardrails_by_agent or {}
        self.user_context = user_context
        self.event_emitter = event_emitter
        self.redis_client = redis_client
        self.trace_collector = trace_collector
        self.browser_session_executor = AgencyBrowserSessionExecutor()
        self._round_trip_tracker = RoundTripTracker()
        self._flow_configs: dict[tuple[str, str], FlowConfig] = {}
        self._shared_tools_cache: list[type] | None = None  # resolved once per run

        # Build error_handler_map: watched_node_id → list of handler nodes
        self.error_handler_map: dict[str, list[NodeRow]] = {}
        for n in nodes:
            if n.get("node_type") == "error_handler":
                cfg = n.get("node_config") or {}
                for watched_id in cfg.get("watchedNodeIds", []):
                    self.error_handler_map.setdefault(watched_id, []).append(n)

        # Find entry node
        entry_candidates = [n for n in nodes if n.get("is_entry_point")]
        self.entry_node: NodeRow = entry_candidates[0] if entry_candidates else nodes[0]

    def has_non_agent_nodes(self) -> bool:
        """Return True if any node is not a plain agent (triggers orchestrator path)."""
        return any(
            n.get("node_type", "agent") not in AGENT_NODE_TYPES
            for n in self.nodes.values()
        )

    async def _build_legacy_memory_context(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        base_url: str,
        budget_manager: Any | None = None,
    ) -> dict[str, str]:
        """Fallback to the legacy confidence-sorted memory injection path."""
        memory_context: dict[str, str] = {}
        try:
            from app.services.long_term_memory import LongTermMemoryService
            from app.core.database import AsyncSessionLocal

            async with AsyncSessionLocal() as ltm_session:
                ltm_service = LongTermMemoryService(
                    db_session=ltm_session,
                    gateway_url=base_url,
                    user_token=ctx.user_token,
                )
                # Respect memory scope: agency-wide (default) or node-only
                node_config = node.get("nodeConfig") or {}
                memory_scope = node_config.get("memoryScope", "agency")
                effective_node_id = node["id"] if memory_scope == "node" else None

                ltm_memories = await ltm_service.get_memories_for_agent(
                    tenant_id=ctx.tenant_id,
                    agency_id=getattr(self.agency_config, "agency_id", ""),
                    agent_node_id=effective_node_id,
                    user_id=ctx.user_id,
                )
                if ltm_memories:
                    injection = ltm_service.format_memories_for_injection(ltm_memories)
                    if injection:
                        content = injection["content"]
                        if budget_manager is not None and hasattr(budget_manager, "allocate"):
                            allocated = budget_manager.allocate(content, "long_term_memory")
                            if allocated:
                                content = allocated
                        memory_context["long_term_memory"] = content
        except Exception as exc:
            logger.debug("ltm_inject_skipped", error=str(exc)[:100])
        return memory_context

    async def _build_semantic_memory_context(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        query_text: str,
        base_url: str,
    ) -> dict[str, str]:
        """Build semantic memory context with 2-level retrieval and fallback."""
        budget = None  # Initialize before try block to avoid NameError in fallback
        try:
            model_name = node.get("model", "gpt-4o")
            from app.services.agency_context_budget import ContextBudgetManager
            from app.core.database import AsyncSessionLocal
            from app.services.embedding_service import get_embedding_service
            from app.services.agency_chunk_service import AgencyChunkService
            from app.services.agency_memory_retriever import (
                AgencyMemoryRetriever,
                format_retrieval_for_context,
            )
            from app.services.long_term_memory import LongTermMemoryService

            budget = ContextBudgetManager(model_name=model_name)
            ctx.budget_manager = budget
            logger.debug(
                "budget_manager_initialized",
                model=model_name,
                budget=budget.remaining,
                completion_reserve=budget.completion_reserve_tokens,
            )

            async with AsyncSessionLocal() as session:
                embedding_service = get_embedding_service()
                ltm_service = LongTermMemoryService(
                    db_session=session,
                    gateway_url=base_url,
                    user_token=ctx.user_token,
                    embedding_service=embedding_service,
                )
                chunk_service = AgencyChunkService(session, embedding_service)
                retriever = AgencyMemoryRetriever(
                    db=session,
                    embedding_service=embedding_service,
                    ltm_service=ltm_service,
                    chunk_service=chunk_service,
                )
                # Memory scope: "agency" (default) shares across all nodes,
                # "node" restricts to this node's own memories only
                node_config = node.get("nodeConfig") or {}
                memory_scope = node_config.get("memoryScope", "agency")

                retrieval = await retriever.retrieve(
                    query=query_text,
                    tenant_id=ctx.tenant_id,
                    agency_id=getattr(self.agency_config, "agency_id", ""),
                    agent_node_id=node["id"],
                    user_id=ctx.user_id,
                    max_tokens=max(1, budget.remaining // 2),
                    scope=memory_scope,
                )
                formatted = format_retrieval_for_context(retrieval)
                if formatted:
                    allocated = budget.allocate(formatted, "long_term_memory")
                    if allocated:
                        formatted = allocated
                    # Track which memories were used for confidence boosting
                    if retrieval.used_memory_ids:
                        if not hasattr(ctx, "_used_memory_ids"):
                            ctx._used_memory_ids = []
                        ctx._used_memory_ids.extend(retrieval.used_memory_ids)

                    logger.info(
                        "semantic_memory_retrieved",
                        l1_count=retrieval.l1_count,
                        l2_count=retrieval.l2_count,
                        query_len=len(query_text),
                    )
                    return {"long_term_memory": formatted}
                return {}
        except ImportError as exc:
            logger.debug("semantic_memory_import_failed", error=str(exc)[:100], fallback="legacy")
        except Exception as exc:
            logger.debug("semantic_memory_inject_skipped", error=str(exc)[:100], fallback="legacy")

        return await self._build_legacy_memory_context(node, ctx, base_url, budget_manager=budget if budget is not None else None)

    async def _store_chunked_output(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        output: str,
        executor: str,
    ) -> None:
        """Persist full executor output into the L2 chunk store."""
        if not output or len(output) <= 100:
            return

        try:
            from app.core.database import AsyncSessionLocal
            from app.services.embedding_service import get_embedding_service
            from app.services.agency_chunk_service import AgencyChunkService

            # Read chunkRetentionDays from tenant settings
            chunk_retention_days = 7
            try:
                from sqlalchemy import text as sa_text
                async with AsyncSessionLocal() as settings_session:
                    row = await settings_session.execute(
                        sa_text('SELECT settings FROM tenants WHERE id = :tid'),
                        {"tid": ctx.tenant_id},
                    )
                    settings_row = row.fetchone()
                    if settings_row and settings_row[0]:
                        import json
                        settings_data = settings_row[0] if isinstance(settings_row[0], dict) else json.loads(settings_row[0])
                        chunk_retention_days = int(settings_data.get("chunkRetentionDays", 7) or 7)
            except Exception:
                pass  # Use default 7

            async with AsyncSessionLocal() as chunk_session:
                embedding_service = get_embedding_service()
                chunk_service = AgencyChunkService(chunk_session, embedding_service)
                chunk_count = await chunk_service.chunk_and_store(
                    output=output,
                    tenant_id=ctx.tenant_id,
                    agency_id=getattr(self.agency_config, "agency_id", ""),
                    user_id=ctx.user_id,
                    agent_node_id=node["id"],
                    run_id=getattr(ctx, "run_id", "") or node["id"],
                    source_node_id=node["id"],
                    metadata={
                        "model": node.get("model", "gpt-4o"),
                        "executor": executor,
                    },
                    chunk_retention_days=chunk_retention_days,
                )
                logger.debug(
                    "chunk_store_completed",
                    node_id=node["id"],
                    executor=executor,
                    chunk_count=chunk_count,
                )
        except Exception as exc:
            logger.debug(
                "chunk_store_failed",
                node_id=node["id"],
                executor=executor,
                error=str(exc)[:100],
            )

    async def _generate_workflow_suggestions(
        self, ctx: ExecutionContext, final_result: str,
    ) -> None:
        """Post-run: analyze execution and generate workflow improvement suggestions."""
        if not ctx.results or len(ctx.results) < 2:
            return  # Need at least 2 nodes for meaningful analysis

        try:
            from app.services.agency_workflow_advisor import (
                generate_workflow_suggestions,
                store_workflow_suggestions,
            )

            gateway_client = self._get_gateway_client(ctx)
            if not gateway_client:
                return

            nodes_list = list((self.nodes or {}).values()) if hasattr(self, "nodes") and self.nodes else []
            suggestions = await generate_workflow_suggestions(
                gateway_client=gateway_client,
                model_name="gpt-4o-mini",  # Use cheap model for analysis
                agency_name=getattr(self.agency_config, "name", ""),
                nodes=nodes_list,
                node_results=dict(ctx.results),
                run_status="completed",
                total_duration_ms=0,
                total_tokens=0,
            )

            if suggestions:
                await store_workflow_suggestions(
                    suggestions=suggestions,
                    tenant_id=ctx.tenant_id,
                    agency_id=getattr(self.agency_config, "agency_id", ""),
                    user_id=ctx.user_id,
                )
        except Exception as exc:
            logger.debug("workflow_suggestions_skipped", error=str(exc)[:100])

    def _get_gateway_client(self, ctx: ExecutionContext) -> Any:
        """Get an OpenAI-compatible gateway client for internal LLM calls."""
        try:
            import os
            from openai import AsyncOpenAI
            base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
            return AsyncOpenAI(
                api_key=ctx.user_token or "internal",
                base_url=f"{base_url}/api/llm/v1",
            )
        except Exception:
            return None

    async def run(
        self,
        message: str,
        user_token: str,
        tenant_id: str,
        user_id: int = 0,
        task_metadata: dict[str, Any] | None = None,
    ) -> str:
        result, _ = await self.run_with_context(
            message=message,
            user_token=user_token,
            tenant_id=tenant_id,
            user_id=user_id,
            task_metadata=task_metadata,
        )
        return result

    async def run_with_context(
        self,
        message: str,
        user_token: str,
        tenant_id: str,
        user_id: int = 0,
        task_metadata: dict[str, Any] | None = None,
    ) -> tuple[str, ExecutionContext]:
        """Execute the agency graph starting from the entry node.

        Returns final response text and execution context.
        """
        ctx = ExecutionContext(
            message, user_token, tenant_id,
            user_id=user_id, task_metadata=task_metadata,
        )

        # Initialize shared run context with optional seed data
        ctx.shared_context = AgencyRunContext(initial_data=self.user_context)

        if task_metadata:
            logger.info(
                "agency_orchestrator_with_planner_context",
                task_run_id=task_metadata.get("task_run_id"),
                execution_strategy=task_metadata.get("execution_strategy"),
                budget_class=task_metadata.get("budget_class"),
            )

        # Emit meta event at run start
        if self.event_emitter:
            await self.event_emitter.emit_meta()

        try:
            result = await self._execute_node(self.entry_node, ctx)
        except Exception as exc:
            if self.trace_collector:
                self.trace_collector.set_status("failed")
            if self.event_emitter:
                await self.event_emitter.emit_error("orchestrator_error", str(exc)[:500])
            raise

        if self.trace_collector:
            self.trace_collector.set_status("completed")

        # Capture context snapshot for observability
        ctx.context_snapshot = ctx.shared_context.snapshot()

        # Post-run: generate workflow improvement suggestions (async, non-blocking)
        try:
            await self._generate_workflow_suggestions(ctx, result or "")
        except Exception as exc:
            logger.debug("workflow_advisor_failed", error=str(exc)[:100])

        return result or "", ctx

    MAX_EXECUTION_DEPTH = 50  # Prevent infinite recursion from graph cycles

    async def _execute_node(self, node: NodeRow, ctx: ExecutionContext, _depth: int = 0) -> str:
        """Execute a single node and follow its outgoing edges."""
        # SECURITY: Depth guard prevents infinite recursion from graph cycles
        if _depth > self.MAX_EXECUTION_DEPTH:
            logger.error("agency_orchestrator_max_depth", depth=_depth, node_id=node.get("id"))
            return f"[Error: Maximum execution depth ({self.MAX_EXECUTION_DEPTH}) exceeded — possible graph cycle]"

        node_type = node.get("node_type", "agent")
        node_id = node["id"]
        node_name = node.get("name", node_id)

        # Check for cancellation between node executions
        if self.event_emitter and self.redis_client:
            cancel_mode = await check_cancelled(self.redis_client, self.event_emitter.run_id)
            if cancel_mode == "immediate":
                await self.event_emitter.emit_error("cancelled", "Run cancelled by user")
                return "[Run cancelled]"

        logger.info("agency_orchestrator_execute_node", node_id=node_id, node_type=node_type)

        # Start trace span for this node.
        # Span type mapping: agent/supervisor → agent_turn; all other orchestrator
        # node types (router, aggregator, knowledge_base, skill_call, human_approval,
        # browser_session) → tool_call.  This is acceptable because the spec defines
        # only agent_turn, tool_call, and guardrail as valid span types.
        span_id: str | None = None
        if self.trace_collector:
            span_id = self.trace_collector.start_span(
                name=f"{node_type}:{node_name}",
                type="agent_turn" if node_type in AGENT_NODE_TYPES else "tool_call",
                input_data=ctx.get_context_text()[:500],
            )

        # Check if this node has error handlers watching it
        handlers = self.error_handler_map.get(node_id, [])

        result: str
        try:
            match node_type:
                case "error_handler":
                    # Error handlers are not executed in normal traversal
                    result = ""

                case "data_transform":
                    result = await self._execute_data_transform(node, ctx)

                case "autonomous_agent":
                    result = await self._execute_autonomous_node(node, ctx)

                case "agent" | "supervisor":
                    result = await self._execute_agent_node(node, ctx)
                    # Check after_turn cancellation after agent completes
                    if self.event_emitter and self.redis_client:
                        cancel_mode = await check_cancelled(
                            self.redis_client, self.event_emitter.run_id
                        )
                        if cancel_mode in ("immediate", "after_turn"):
                            await self.event_emitter.emit_error(
                                "cancelled", "Run cancelled by user (after turn)"
                            )
                            return result or "[Run cancelled]"

                case "router":
                    next_node_id = await self._route(node, ctx)
                    if next_node_id and next_node_id in self.nodes:
                        result = await self._execute_node(self.nodes[next_node_id], ctx, _depth + 1)
                    else:
                        result = f"[Router: no matching route in node {node_id}]"
                    return result

                case "aggregator":
                    result = await self._aggregate(node, ctx)

                case "knowledge_base":
                    await self._search_knowledge(node, ctx)
                    result = ""

                case "skill_call":
                    result = await self._call_skill(node, ctx)

                case "skill_discovery":
                    cfg = node.get("node_config") or {}
                    result = await execute_skill_discovery(
                        node_name=node.get("name", node_id),
                        node_config=cfg,
                        context=ctx.shared_context or AgencyRunContext(),
                        results=ctx.results,
                    )

                case "human_approval":
                    result = await self._await_approval(node, ctx)

                case "browser_session":
                    execution = await self.browser_session_executor.execute(
                        node,
                        ctx,
                        agency_id=getattr(self.agency_config, "agency_id", None),
                    )
                    result = str(execution.get("result") or "")

                case "conditional_branch":
                    next_node_id = await self._evaluate_conditional_branch(node, ctx)
                    if next_node_id and next_node_id in self.nodes:
                        result = await self._execute_node(self.nodes[next_node_id], ctx, _depth + 1)
                    else:
                        result = f"[ConditionalBranch: fallback — no valid target in node {node_id}]"
                    return result

                case "parallel_fan_out":
                    result = await self._execute_parallel_fan_out(node, ctx)
                    return result

                case "loop_retry":
                    handler = LoopHandler()
                    result = await handler.execute(
                        node, ctx, self,
                        run_context=ctx.shared_context,
                        trace_collector=self.trace_collector,
                    )

                case _:
                    logger.warning(
                        "agency_orchestrator_unknown_node_type", node_type=node_type
                    )
                    result = ""

        except RunTerminatedError:
            raise  # Let terminate propagate up
        except Exception as exc:
            if handlers:
                if len(handlers) > 1:
                    logger.warning(
                        "agency_error_handler_multiple_handlers",
                        node_id=node_id,
                        handler_count=len(handlers),
                        using_handler=handlers[0].get("name"),
                    )
                result = await self._handle_error(handlers[0], node, exc, ctx)
            else:
                raise

        if result:
            # Cap result size and context growth
            ctx.results[node_id] = result[:2000] if len(result) > 2000 else result
            # Evict oldest entries if results dict exceeds limit
            if len(ctx.results) > 100:
                oldest_keys = list(ctx.results.keys())[:len(ctx.results) - 100]
                for k in oldest_keys:
                    del ctx.results[k]

        # End trace span for this node
        if self.trace_collector and span_id:
            self.trace_collector.end_span(
                span_id,
                output=result[:500] if result else None,
            )

        # Follow outgoing edges (unless router which already handled routing)
        if node_type not in ("router", "conditional_branch", "parallel_fan_out"):
            outgoing = [e for e in self.edges if e.get("from_node_id") == node_id]

            parallel_edges = [e for e in outgoing if e.get("flow_type") == "parallel"]
            sequential_edges = [e for e in outgoing if e.get("flow_type") != "parallel"]

            if parallel_edges:
                # Execute parallel branches concurrently
                tasks = [
                    self._execute_node(self.nodes[e["to_node_id"]], ctx.clone(), _depth + 1)
                    for e in parallel_edges
                    if e.get("to_node_id") in self.nodes
                ]
                if tasks:
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    valid = [r for r in results if isinstance(r, str) and r]
                    if valid:
                        result = valid[-1]  # Last parallel result wins (aggregator handles merging)

            for edge in sequential_edges:
                next_id = edge.get("to_node_id")
                if next_id and next_id in self.nodes:
                    next_node = self.nodes[next_id]
                    # Emit agent_switch event on handoff between agents
                    next_type = next_node.get("node_type", "agent")
                    if (
                        self.event_emitter
                        and node_type in AGENT_NODE_TYPES
                        and next_type in AGENT_NODE_TYPES
                    ):
                        await self.event_emitter.emit("agent_switch", {
                            "from": node.get("name", node_id),
                            "to": next_node.get("name", next_id),
                        })
                    # ── Checkpoint 3: Handoff Guardrails ────────────────────
                    if (
                        node_type in AGENT_NODE_TYPES
                        and next_type in AGENT_NODE_TYPES
                        and result
                    ):
                        receiving_guardrails = self.guardrails_by_agent.get(next_id, [])
                        if receiving_guardrails:
                            from app.services.agency_guardrails import execute_guardrails as _exec_gr
                            handoff_result = await _exec_gr(
                                receiving_guardrails, result, "input", is_handoff=True,
                            )
                            if handoff_result.action == "block":
                                result = f"[Handoff guardrail blocked]: {handoff_result.message}"
                                ctx.results[node_id] = result
                                return result
                            if handoff_result.redacted_message:
                                result = handoff_result.redacted_message
                                ctx.results[node_id] = result
                    sub_result = await self._execute_node(next_node, ctx, _depth + 1)
                    if sub_result:
                        result = sub_result  # Last result in the chain is the final answer

        return result

    # ── Node executors ────────────────────────────────────────────────────────

    async def _execute_react_path(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        augmented_message: str,
        memory_context: dict[str, str] | None = None,
    ) -> str:
        """Execute an agent node via the ReAct executor (Level 2).

        Bypasses agency-swarm and makes direct LLM calls via the Node.js gateway.
        """
        try:
            from app.services.react_executor import ReActExecutor, ReActResult, tool_config_to_function
            from app.services.working_memory import WorkingMemory
            from app.services.agentic_cost_controls import ConcurrentRunLimiter, TokenBudgetTracker
            from app.services.agentic_feature_flags import check_agentic_flag
            from app.services.agentic_limits import MAX_REACT_ITERATIONS, MAX_TOKENS_BUDGET
        except ImportError:
            logger.error("react_executor_imports_missing", hint="Sections 05-07 not deployed")
            return "[ReAct executor not available — required modules not installed]"

        node_config = node.get("node_config") or {}

        # Feature flag check
        try:
            flag_enabled = await check_agentic_flag("agencyReactExecutorEnabled", ctx.tenant_id)
        except Exception:
            flag_enabled = False
        if not flag_enabled:
            # Fall back to reflection loop
            return await self._execute_agent_node_agentic_reflection(node, ctx, augmented_message)

        # Concurrent run limiter
        redis_client = None
        try:
            from app.core.redis_client import get_cache_redis
            redis_client = await get_cache_redis()
        except Exception:
            pass

        limiter = ConcurrentRunLimiter(redis_client=redis_client)
        acquire_result = await limiter.acquire(
            tenant_id=ctx.tenant_id,
            user_id=str(ctx.user_id),
            run_type="react",
            run_id=getattr(ctx, "run_id", ""),
        )
        if not acquire_result.success:
            return acquire_result.message

        try:
            from openai import AsyncOpenAI

            base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
            gateway_client = AsyncOpenAI(
                api_key=ctx.user_token,
                base_url=f"{base_url}/v1",
            )

            # Resolve tools for ReAct
            tool_definitions, tool_endpoint_map = await self._resolve_tool_configs_for_react(node)

            # Apply deferred tool registry if tool count exceeds threshold
            deferred_registry = None
            try:
                from app.services.agency_deferred_tools import DeferredToolRegistry
                deferred_registry = DeferredToolRegistry()
                prepared = deferred_registry.prepare_tools(tool_definitions)
                if prepared.deferred:
                    tool_definitions = prepared.bind_tools
                    # Add tool_search to endpoint map as a local handler
                    tool_endpoint_map["tool_search"] = {
                        "url": "__deferred_search__",
                        "risk_level": "low",
                        "config": {},
                    }
                    agent_instructions_suffix = (
                        f"\n<available-deferred-tools>\n{prepared.available_names}\n"
                        "</available-deferred-tools>"
                    )
                else:
                    agent_instructions_suffix = ""
            except ImportError:
                agent_instructions_suffix = ""

            # Initialize working memory
            run_id = getattr(ctx, "run_id", None) or node["id"]
            wm = WorkingMemory(
                redis_client=redis_client,
                tenant_id=ctx.tenant_id,
                run_id=run_id,
                agent_id=node["id"],
            ) if redis_client else None

            if wm:
                summary = wm.get_summary()
                if summary:
                    if memory_context is None:
                        memory_context = {}
                    memory_context["working_memory"] = summary

            # Build agent instructions
            agent_instructions = resolve_instructions(
                node.get("instructions", ""),
                agent_name=node.get("name", "Agent"),
            )
            if agent_instructions_suffix:
                agent_instructions += agent_instructions_suffix

            # Budget tracker
            max_budget = min(
                node_config.get("maxTokensBudget", MAX_TOKENS_BUDGET),
                MAX_TOKENS_BUDGET,
            )

            # Create and execute ReActExecutor
            executor = ReActExecutor(
                gateway_client=gateway_client,
                model_name=node.get("model", "gpt-4o"),
                agent_instructions=agent_instructions,
                tools=tool_definitions,
                tool_endpoints=tool_endpoint_map,
                max_iterations=min(
                    node_config.get("maxReflectionCycles", 5), MAX_REACT_ITERATIONS
                ),
                max_tokens_budget=max_budget,
                event_emitter=self.event_emitter,
                working_memory=wm,
            )

            result: ReActResult = await executor.execute(
                task=augmented_message,
                context=memory_context or None,
            )

            # Cap result for inter-node passing; full output stored in L2 chunks
            ctx.results[node["id"]] = result.final_answer[:2000] if result.final_answer and len(result.final_answer) > 2000 else (result.final_answer or "")

            # Extract and store long-term memories from successful runs
            if result.status == "complete" and node_config.get("enableLongTermMemory"):
                try:
                    from app.services.long_term_memory import LongTermMemoryService
                    from app.core.database import AsyncSessionLocal
                    async with AsyncSessionLocal() as ltm_session:
                        ltm_svc = LongTermMemoryService(db_session=ltm_session, gateway_url=base_url, user_token=ctx.user_token)
                        await ltm_svc.extract_and_store_memories(
                            run_result=result.final_answer,
                            tenant_id=ctx.tenant_id,
                            agency_id=getattr(self.agency_config, "agency_id", ""),
                            agent_node_id=node["id"],
                            user_id=ctx.user_id,
                            source_run_id=getattr(ctx, "run_id", ""),
                        )
                        # Boost confidence for memories that contributed to this success
                        used_ids = getattr(ctx, "_used_memory_ids", [])
                        if used_ids:
                            await ltm_svc.boost_confidence_for_memories(used_ids)
                except Exception as e:
                    logger.debug("ltm_extract_failed", error=str(e)[:100])

            await self._store_chunked_output(
                node=node,
                ctx=ctx,
                output=result.final_answer,
                executor="react",
            )

            if self.event_emitter:
                await self.event_emitter.emit("text_delta", {
                    "content": result.final_answer,
                    "agentName": node.get("name", "Agent"),
                    "status": result.status,
                    "iterations": result.iterations,
                })

            return result.final_answer

        except Exception as exc:
            logger.error(
                "react_path_failed",
                node_id=node["id"],
                error=str(exc)[:200],
            )
            return f"[Agent '{node.get('name')}' ReAct error: {scrub_error_payload(str(exc))}]"
        finally:
            await limiter.release(
                tenant_id=ctx.tenant_id,
                user_id=str(ctx.user_id),
                run_type="react",
                run_id=getattr(ctx, "run_id", ""),
            )

    async def _execute_autonomous_node(
        self, node: NodeRow, ctx: ExecutionContext
    ) -> str:
        """Execute an autonomous_agent node via the Plan/Execute/Reflect engine."""
        try:
            from app.services.autonomous_executor import run_autonomous
            from app.services.agentic_feature_flags import check_agentic_flag
            from app.services.agentic_limits import MAX_REACT_ITERATIONS, MAX_TOKENS_BUDGET
        except ImportError:
            logger.error("autonomous_executor_imports_missing")
            return "[Autonomous executor not available — required modules not installed]"

        # Feature flag check
        try:
            flag_enabled = await check_agentic_flag("agencyAutonomousAgentEnabled", ctx.tenant_id)
        except Exception:
            flag_enabled = False
        if not flag_enabled:
            return await self._execute_agent_node(node, ctx)

        node_config = node.get("node_config") or {}

        # Concurrent run limiter
        redis_client = None
        try:
            from app.core.redis_client import get_cache_redis
            redis_client = await get_cache_redis()
        except Exception:
            pass

        from app.services.agentic_cost_controls import ConcurrentRunLimiter
        limiter = ConcurrentRunLimiter(redis_client=redis_client)
        acquire_result = await limiter.acquire(
            tenant_id=ctx.tenant_id, user_id=str(ctx.user_id),
            run_type="autonomous", run_id=getattr(ctx, "run_id", ""),
        )
        if not acquire_result.success:
            return acquire_result.message

        try:
            from openai import AsyncOpenAI

            base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
            gateway_client = AsyncOpenAI(
                api_key=ctx.user_token,
                base_url=f"{base_url}/v1",
            )

            tool_definitions, tool_endpoint_map = await self._resolve_tool_configs_for_react(node)

            # Create ExecutionMemoryStore for checkpointing
            memory_store = None
            try:
                from app.services.execution_memory_store import ExecutionMemoryStore
                memory_store = ExecutionMemoryStore(
                    tenant_id=ctx.tenant_id,
                    run_id=getattr(ctx, "run_id", None) or node["id"],
                    agency_id=getattr(self.agency_config, "agency_id", ""),
                    redis_client=redis_client,
                )
            except Exception:
                pass  # Non-critical — autonomous runs work without checkpointing

            # Collect available agents for delegation
            available_agents: dict[str, NodeRow] = {}
            if hasattr(self, "nodes") and self.nodes:
                for nid, n in self.nodes.items():
                    nt = n.get("node_type") or n.get("nodeType", "")
                    if nt in ("agent", "supervisor"):
                        available_agents[nid] = n

            task_text = ctx.get_context_text() if hasattr(ctx, "get_context_text") else str(getattr(ctx, "input", ""))
            memory_context = await self._build_semantic_memory_context(
                node,
                ctx,
                task_text,
                base_url,
            )
            if memory_context.get("long_term_memory"):
                task_text = f"{task_text}\n\n{memory_context['long_term_memory']}"

            result = await run_autonomous(
                task=task_text,
                ctx=ctx,
                node_config=node_config,
                gateway_client=gateway_client,
                model_name=node.get("model", "gpt-4o"),
                available_agents=available_agents,
                tools=tool_definitions,
                tool_endpoints=tool_endpoint_map,
                orchestrator=self,
                event_emitter=self.event_emitter,
                memory_store=memory_store,
            )

            # Cap result for inter-node passing; full output stored in L2 chunks
            ctx.results[node["id"]] = result.final_answer[:2000] if result.final_answer and len(result.final_answer) > 2000 else (result.final_answer or "")

            # Extract long-term memories from successful autonomous runs
            if result.status == "complete" and node_config.get("enableLongTermMemory"):
                try:
                    from app.services.long_term_memory import LongTermMemoryService
                    from app.core.database import AsyncSessionLocal
                    async with AsyncSessionLocal() as ltm_session:
                        ltm_svc = LongTermMemoryService(db_session=ltm_session, gateway_url=base_url, user_token=ctx.user_token)
                        await ltm_svc.extract_and_store_memories(
                            run_result=result.final_answer,
                            tenant_id=ctx.tenant_id,
                            agency_id=getattr(self.agency_config, "agency_id", ""),
                            agent_node_id=node["id"],
                            user_id=ctx.user_id,
                            source_run_id=getattr(ctx, "run_id", ""),
                        )
                        # Boost confidence for memories that contributed to this success
                        used_ids = getattr(ctx, "_used_memory_ids", [])
                        if used_ids:
                            await ltm_svc.boost_confidence_for_memories(used_ids)
                except Exception as e:
                    logger.debug("ltm_extract_autonomous_failed", error=str(e)[:100])

            # Auto few-shot: save high-quality autonomous runs as examples
            if result.status == "complete" and getattr(result, "quality_score", 0) >= 0.9:
                try:
                    from app.services.agency_auto_fewshot import maybe_save_auto_fewshot
                    from app.core.database import AsyncSessionLocal
                    async with AsyncSessionLocal() as fs_session:
                        await maybe_save_auto_fewshot(
                            db=fs_session,
                            tenant_id=ctx.tenant_id,
                            agency_id=getattr(self.agency_config, "agency_id", ""),
                            agent_node_id=node["id"],
                            user_input=task_text[:2000],
                            agent_output=result.final_answer[:2000],
                            quality_score=result.quality_score,
                        )
                except Exception as e:
                    logger.debug("auto_fewshot_failed", error=str(e)[:100])

            await self._store_chunked_output(
                node=node,
                ctx=ctx,
                output=result.final_answer,
                executor="autonomous",
            )

            # Clean up scratch pad after successful completion
            if memory_store:
                try:
                    await memory_store.delete_scratch_pad()
                except Exception:
                    pass

            if self.event_emitter:
                await self.event_emitter.emit("text_delta", {
                    "content": result.final_answer,
                    "agentName": node.get("name", "Autonomous Agent"),
                    "status": result.status,
                    "planVersions": result.plan_versions,
                })

            return result.final_answer

        except Exception as exc:
            logger.error("autonomous_node_failed", node_id=node["id"], error=str(exc)[:200])
            return f"[Agent '{node.get('name')}' autonomous error: {scrub_error_payload(str(exc))}]"
        finally:
            await limiter.release(
                tenant_id=ctx.tenant_id, user_id=str(ctx.user_id),
                run_type="autonomous", run_id=getattr(ctx, "run_id", ""),
            )

    async def _resolve_tool_configs_for_react(
        self, node: NodeRow
    ) -> tuple[list[dict], dict[str, dict]]:
        """Resolve tools for ReAct executor (OpenAI function format + endpoint map)."""
        from app.services.react_executor import tool_config_to_function
        from app.services.agency_tools import _BUILTIN_ENDPOINTS, _BUILTIN_RISK_LEVELS

        internal_url = os.getenv("SMARTSPEC_INTERNAL_URL", "http://127.0.0.1:3000")

        _BUILTIN_DESCRIPTIONS: dict[str, str] = {
            "builtin-rag-knowledge": "Search and retrieve relevant documents from the knowledge base",
            "builtin-skill-executor": "Execute a SmartSpecPro skill to generate content",
            "builtin-web-search": "Search the web for current information",
            "builtin-code-runner": "Execute code in a sandboxed environment",
            "builtin-http-request": "Make HTTP requests to external APIs",
            "builtin-email-notify": "Send email notifications",
            "builtin-webhook": "Call webhook endpoints",
            "builtin-document-search": "Search documents in the library",
            "builtin-browser": "Browse web pages",
            "builtin-agency-call": "Call another agency to handle a sub-task",
            "builtin-auto-draft": "Auto-generate draft content",
            "builtin-model-suggest": "Suggest appropriate AI models",
            "builtin-file-parse": "Parse file contents",
            "builtin-schedule-draft": "Schedule content drafts",
            "builtin-skill-discovery": "Discover available skills",
        }

        tool_definitions: list[dict] = []
        tool_endpoint_map: dict[str, dict] = {}

        # Get tools from node data
        tools = node.get("tools") or []
        for tool in tools:
            tool_id = tool.get("toolId") or tool.get("tool_id", "")
            if not tool_id:
                continue

            tool_config = tool.get("toolConfig") or tool.get("tool_config") or {}
            description = tool_config.get("description", "") or _BUILTIN_DESCRIPTIONS.get(tool_id, tool_id)
            input_schema = tool_config.get("input_schema") or tool_config.get("inputSchema")

            # Resolve endpoint URL
            endpoint_path = _BUILTIN_ENDPOINTS.get(tool_id)
            if endpoint_path is None and not tool_id.startswith("builtin-"):
                # Custom tool — endpoint from config
                endpoint_url = tool_config.get("endpoint_url", tool_config.get("endpointUrl", ""))
            elif endpoint_path:
                endpoint_url = internal_url + endpoint_path
            else:
                continue  # No endpoint (e.g., builtin-agency-call with None path)

            if not endpoint_url:
                continue

            # SSRF defense-in-depth: validate custom tool URLs at resolution time
            if not tool_id.startswith("builtin-"):
                try:
                    _validate_tool_url(endpoint_url)
                except Exception:
                    logger.warning("ssrf_blocked_at_resolve", tool_id=tool_id, url=endpoint_url[:50])
                    continue

            risk = _BUILTIN_RISK_LEVELS.get(tool_id, "medium")

            tool_definitions.append(
                tool_config_to_function(tool_id, description, input_schema)
            )
            tool_endpoint_map[tool_id] = {
                "url": endpoint_url,
                "risk_level": risk,
                "config": tool_config,
            }

        return tool_definitions, tool_endpoint_map

    async def _execute_agent_node_agentic(
        self,
        node: NodeRow,
        ctx: ExecutionContext,
        augmented_message: str,
        memory_context: dict[str, str] | None = None,
    ) -> str:
        """Execute an agent node with agentic mode — dispatches to ReAct or reflection loop."""
        node_config = node.get("node_config") or {}
        strategy = node_config.get("planningStrategy", "basic")

        if strategy == "react":
            return await self._execute_react_path(
                node,
                ctx,
                augmented_message,
                memory_context=memory_context,
            )

        return await self._execute_agent_node_agentic_reflection(node, ctx, augmented_message)

    async def _execute_agent_node_agentic_reflection(
        self, node: NodeRow, ctx: ExecutionContext, augmented_message: str
    ) -> str:
        """Execute an agent node with reflection loop (basic/cot agentic mode).

        Input guardrails should be applied to augmented_message before calling this.
        Output guardrails are applied by the caller on the returned answer.
        """
        from app.services.agency_swarm_adapter import AgentConfig, AgencyConfig as SwarmAgencyConfig

        if self.adapter is None:
            return f"[Agent '{node.get('name')}': adapter not available]"

        node_config = node.get("node_config") or {}
        strategy = node_config.get("planningStrategy", "basic")
        # showReasoning: reserved for Level 2 (section-05/08)
        max_cycles = clamp_to_limit(
            node_config.get("maxReflectionCycles", 3), MAX_REFLECTION_CYCLES
        )

        if max_cycles == 0:
            return ""

        # Fall back to "basic" for unknown strategies
        if strategy not in ("basic", "cot", "react"):
            logger.warning("unknown_planning_strategy", strategy=strategy, fallback="basic")
            strategy = "basic"

        planning_prompt = get_planning_prompt(strategy, max_cycles)
        agent_instructions = node.get("instructions", "") + "\n\n" + planning_prompt
        last_response = ""

        # Max chars for prior response injection (rough 4:1 char-to-token ratio)
        _MAX_PRIOR_RESPONSE_CHARS = 32000

        for cycle in range(1, max_cycles + 1):
            try:
                agent = self.adapter.create_agent(
                    config=AgentConfig(
                        name=node.get("name", "Agent"),
                        instructions=agent_instructions,
                        model=await self._resolve_node_model(node),
                        model_settings=node.get("model_settings"),
                        tools=[],
                        is_entry_point=node.get("is_entry_point", False),
                    ),
                    user_token=ctx.user_token,
                )

                sub_config = SwarmAgencyConfig(
                    agency_id=f"agentic-{node['id']}-c{cycle}",
                    name=node.get("name", "Agent"),
                    system_prompt=getattr(self.agency_config, "system_prompt", ""),
                    communication_flows=[],
                    tenant_id=ctx.tenant_id,
                    user_id=getattr(self.agency_config, "user_id", ctx.user_id),
                    conversation_id=getattr(self.agency_config, "conversation_id", f"agentic-{node['id']}"),
                    max_run_time_seconds=getattr(self.agency_config, "max_run_time_seconds", 600),
                    credit_multiplier=getattr(self.agency_config, "credit_multiplier", 1.0),
                    creator_fee_credits=getattr(self.agency_config, "creator_fee_credits", 0),
                    platform_share_pct=getattr(self.agency_config, "platform_share_pct", 20),
                    creator_id=getattr(self.agency_config, "creator_id", None),
                )
                agency_obj = self.adapter.create_agency(
                    config=sub_config,
                    agents=[agent],
                    persistence_hooks=(None, None),
                )

                if cycle == 1:
                    message = augmented_message
                else:
                    truncated = last_response[:_MAX_PRIOR_RESPONSE_CHARS]
                    if len(last_response) > _MAX_PRIOR_RESPONSE_CHARS:
                        truncated += "\n[truncated]"
                    message = f"{augmented_message}\n\nPrevious attempt (cycle {cycle - 1}):\n{truncated}"

                run_result = await self.adapter.run(
                    agency=agency_obj,
                    message=message,
                    timeout_seconds=sub_config.max_run_time_seconds,
                    agency_id=sub_config.agency_id,
                    tenant_id=ctx.tenant_id,
                )
                last_response = run_result.response
                ctx.results[node["id"]] = last_response

                signal = _parse_completion(last_response)

                if self.event_emitter:
                    await self.event_emitter.emit("agentic_cycle", {
                        "cycleNumber": cycle,
                        "status": "complete" if signal and signal.complete else "continue",
                        "agentName": node.get("name", "Agent"),
                    })

                if signal and signal.complete:
                    await self._store_chunked_output(
                        node=node,
                        ctx=ctx,
                        output=signal.answer,
                        executor="reflection",
                    )
                    return signal.answer

            except Exception as exc:
                logger.error(
                    "agentic_cycle_failed",
                    node_id=node["id"],
                    cycle=cycle,
                    error=str(exc)[:200],
                )
                return f"[Agent '{node.get('name')}' agentic error: {scrub_error_payload(str(exc))}]"

        await self._store_chunked_output(
            node=node,
            ctx=ctx,
            output=last_response,
            executor="reflection",
        )
        return last_response

    async def _resolve_node_model(self, node: NodeRow) -> str:
        """Resolve the best LLM model for a node based on its capabilities or manual setting."""
        model_requirements = node.get("model_requirements")
        if model_requirements and isinstance(model_requirements, dict):
            from app.services.agency_model_resolver import resolve_agent_model
            return await resolve_agent_model(
                requirements=model_requirements,
                fallback_model=node.get("model") or "gpt-4o",
            )
        return node.get("model") or "gpt-4o"

    async def _execute_agent_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute an agent/supervisor node via AgencySwarmAdapter."""
        node_config = node.get("node_config") or {}
        execution_mode = node_config.get("executionMode", "single_shot")

        if execution_mode == "agentic":
            if self.adapter is None:
                return f"[Agent '{node.get('name')}': adapter not available]"

            augmented_message = ctx.get_context_text()

            # ── Input Guardrails (run once before agentic loop) ──────────
            agent_guardrails = self.guardrails_by_agent.get(node["id"], [])
            if agent_guardrails:
                from app.services.agency_guardrails import execute_guardrails
                input_result = await execute_guardrails(
                    agent_guardrails, augmented_message, "input",
                )
                guardrail_name = getattr(input_result, "guardrail_name", None) or (
                    getattr(agent_guardrails[0], "name", "unknown") if agent_guardrails else "unknown"
                )
                if input_result.action == "block":
                    if self.event_emitter:
                        await self.event_emitter.emit("guardrail_trigger", {
                            "type": "input", "guardrailName": guardrail_name, "action": "block",
                        })
                    return f"[Guardrail blocked]: {input_result.message}"
                if input_result.redacted_message:
                    augmented_message = input_result.redacted_message
                if input_result.action == "guidance":
                    if self.event_emitter:
                        await self.event_emitter.emit("guardrail_trigger", {
                            "type": "input", "guardrailName": guardrail_name, "action": "guidance",
                        })
                    augmented_message = f"[Guardrail guidance: {input_result.message}]\n\n{augmented_message}"

            base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
            memory_context = await self._build_semantic_memory_context(
                node,
                ctx,
                augmented_message,
                base_url,
            )
            if memory_context.get("long_term_memory") and node_config.get("planningStrategy") != "react":
                augmented_message = f"{augmented_message}\n\n{memory_context['long_term_memory']}"

            answer = await self._execute_agent_node_agentic(
                node,
                ctx,
                augmented_message,
                memory_context=memory_context,
            )

            # ── Output Guardrails (run on final answer) ──────────────────
            if agent_guardrails and answer:
                from app.services.agency_guardrails import execute_guardrails as exec_gr
                output_guardrails = [g for g in agent_guardrails if g.type == "output"]
                for g in output_guardrails:
                    out_result = await exec_gr([g], answer, "output")
                    if not out_result.passed and g.mode == "strict":
                        return f"[Output guardrail failed]: {out_result.message}"

            return answer

        if self.adapter is None:
            return f"[Agent '{node.get('name')}': adapter not available]"

        # Inject accumulated knowledge + prior results into the message
        augmented_message = ctx.get_context_text()

        # ── Checkpoint 1: Input Guardrails ──────────────────────────────────
        agent_guardrails = self.guardrails_by_agent.get(node["id"], [])
        if agent_guardrails:
            from app.services.agency_guardrails import execute_guardrails
            input_result = await execute_guardrails(
                agent_guardrails, augmented_message, "input",
            )
            guardrail_name = getattr(input_result, "guardrail_name", None) or (
                getattr(agent_guardrails[0], "name", "unknown") if agent_guardrails else "unknown"
            )
            if input_result.action == "block":
                if self.event_emitter:
                    await self.event_emitter.emit("guardrail_trigger", {
                        "type": "input",
                        "guardrailName": guardrail_name,
                        "action": "block",
                    })
                return f"[Guardrail blocked]: {input_result.message}"
            # Apply redaction first, then guidance
            if input_result.redacted_message:
                augmented_message = input_result.redacted_message
            if input_result.action == "guidance":
                if self.event_emitter:
                    await self.event_emitter.emit("guardrail_trigger", {
                        "type": "input",
                        "guardrailName": guardrail_name,
                        "action": "guidance",
                    })
                augmented_message = f"[Guardrail guidance: {input_result.message}]\n\n{augmented_message}"

        # Retrieve agent-level KB context and augment instructions
        agent_instructions = node.get("instructions", "")
        node_config = node.get("node_config") or {}
        if node_config.get("knowledgeBase", {}).get("documentIds"):
            from app.services.agent_knowledge import retrieve_agent_knowledge

            kb_context = await retrieve_agent_knowledge(
                node_config=node_config,
                query=ctx.input,
                tenant_id=ctx.tenant_id,
                user_id=ctx.user_id,
            )
            if kb_context:
                agent_instructions = agent_instructions + kb_context

        base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
        memory_context = await self._build_semantic_memory_context(
            node,
            ctx,
            augmented_message,
            base_url,
        )
        if memory_context.get("long_term_memory"):
            augmented_message = f"{augmented_message}\n\n{memory_context['long_term_memory']}"

        try:
            from app.services.agency_swarm_adapter import AgentConfig

            tools = []
            if self.db:
                from app.services.agency_tools import (
                    resolve_tools_for_agent,
                    resolve_shared_tools_for_agency,
                    merge_tools_deduped,
                )
                tools = await resolve_tools_for_agent(
                    db=self.db,
                    agent_id=node["id"],
                    agency_whitelist=self.agency_whitelist,
                    adapter=self.adapter,
                    retrieval_scope_mode=self.retrieval_scope_mode,
                    run_context=ctx.shared_context,
                    emitter=self.event_emitter,
                    run_id=self.event_emitter.run_id if self.event_emitter else None,
                )
                # Merge shared tools from agency level (cached per run)
                if self._shared_tools_cache is None:
                    agency_id = getattr(self.agency_config, "agency_id", None)
                    if agency_id:
                        self._shared_tools_cache = await resolve_shared_tools_for_agency(
                            db=self.db,
                            agency_id=agency_id,
                            agency_whitelist=self.agency_whitelist,
                            adapter=self.adapter,
                            run_context=ctx.shared_context,
                        )
                    else:
                        self._shared_tools_cache = []
                if self._shared_tools_cache:
                    tools = merge_tools_deduped(tools, self._shared_tools_cache)

            # ── Dynamic instruction resolution (after tools resolved) ──────
            tool_name_list = [getattr(t, "name", str(t)) for t in tools] if tools else []
            agent_instructions = resolve_instructions(
                raw_instructions=agent_instructions,
                agent_name=node.get("name", "Agent"),
                tool_names=tool_name_list,
                context=ctx.shared_context,
                user_context=self.user_context,
            )

            # v1.9: Prepend shared instructions from agency config
            shared_instr = getattr(self.agency_config, "shared_instructions", None)
            run_config = {"shared_instructions": shared_instr} if shared_instr else None

            # v1.9: Inject few-shot examples into instructions as prompt context
            examples = node.get("examples")
            if examples:
                from app.services.agency_few_shot import FRAMING_START, FRAMING_END
                lines = [FRAMING_START, ""]
                for pair in examples:
                    for msg in pair:
                        lines.append(f"{msg.get('role', 'user')}: {msg.get('content', '')}")
                    lines.append("")
                lines.append(FRAMING_END)
                agent_instructions = "\n".join(lines) + "\n\n" + agent_instructions

            agent = self.adapter.create_agent(
                config=AgentConfig(
                    name=node.get("name", "Agent"),
                    instructions=agent_instructions,
                    model=node.get("model", "gpt-4o"),
                    model_settings=node.get("model_settings"),
                    tools=tools,
                    is_entry_point=node.get("is_entry_point", False),
                    parallel_tool_calls=node.get("parallel_tool_calls"),
                    max_turns=node.get("max_turns"),
                    examples=examples,
                ),
                user_token=ctx.user_token,
                run_config=run_config,
            )

            # Single-agent agency for this subtask
            from app.services.agency_swarm_adapter import AgencyConfig as SwarmAgencyConfig
            sub_config = SwarmAgencyConfig(
                agency_id=f"sub-{node['id']}",
                name=node.get("name", "Agent"),
                system_prompt=getattr(self.agency_config, "system_prompt", ""),
                communication_flows=[],
                tenant_id=ctx.tenant_id,
                user_id=getattr(self.agency_config, "user_id", ctx.user_id),
                conversation_id=getattr(
                    self.agency_config,
                    "conversation_id",
                    f"orchestrator-{node['id']}",
                ),
                max_run_time_seconds=getattr(self.agency_config, "max_run_time_seconds", 600),
                credit_multiplier=getattr(self.agency_config, "credit_multiplier", 1.0),
                creator_fee_credits=getattr(self.agency_config, "creator_fee_credits", 0),
                platform_share_pct=getattr(self.agency_config, "platform_share_pct", 20),
                creator_id=getattr(self.agency_config, "creator_id", None),
            )
            agency_obj = self.adapter.create_agency(
                config=sub_config,
                agents=[agent],
                persistence_hooks=(None, None),
            )

            run_result = await self.adapter.run(
                agency=agency_obj,
                message=augmented_message,
                timeout_seconds=sub_config.max_run_time_seconds,
                agency_id=sub_config.agency_id,
                tenant_id=ctx.tenant_id,
            )
            response = run_result.response

            # ── Structured output validation ─────────────────────────────
            output_schema = node.get("output_schema") or node_config.get("outputSchema")
            if output_schema and ctx.shared_context:
                validator = AgencyOutputValidator(output_schema, node.get("name", "Agent"))
                validation_attempts = node_config.get("validationAttempts", 1)
                for attempt in range(validation_attempts):
                    result_obj = validator.validate(response)
                    if result_obj.is_valid:
                        if result_obj.parsed_data is not None:
                            await ctx.shared_context.set(
                                f"{node.get('name', 'Agent')}_output",
                                result_obj.parsed_data,
                            )
                        break
                    if attempt < validation_attempts - 1 and result_obj.retry_feedback:
                        # Retry with feedback
                        retry_result = await self.adapter.run(
                            agency=agency_obj,
                            message=result_obj.retry_feedback,
                            timeout_seconds=sub_config.max_run_time_seconds,
                            agency_id=sub_config.agency_id,
                            tenant_id=ctx.tenant_id,
                        )
                        response = retry_result.response
                    else:
                        logger.warning(
                            "structured_output_validation_failed",
                            agent=node.get("name"),
                            attempts=validation_attempts,
                            last_error=result_obj.retry_feedback,
                        )

            # Emit text_delta with full response (non-streaming path)
            if self.event_emitter and response:
                await self.event_emitter.emit("text_delta", {
                    "agentName": node.get("name", "Agent"),
                    "delta": response,
                })

            # ── Checkpoint 2: Output Guardrails ─────────────────────────────
            if agent_guardrails:
                from app.services.agency_guardrails import execute_guardrails as exec_gr
                output_guardrails = [
                    g for g in agent_guardrails if g.type == "output"
                ]
                for g in output_guardrails:
                    for attempt in range(g.validation_attempts):
                        out_result = await exec_gr([g], response, "output")
                        if out_result.passed:
                            break
                        if attempt < g.validation_attempts - 1:
                            # Retry: re-run agent with feedback
                            feedback = f"Your output failed validation: {out_result.message}"
                            retry_result = await self.adapter.run(
                                agency=agency_obj,
                                message=feedback,
                                timeout_seconds=sub_config.max_run_time_seconds,
                                agency_id=sub_config.agency_id,
                                tenant_id=ctx.tenant_id,
                            )
                            response = retry_result.response
                        else:
                            if g.mode == "strict":
                                return f"[Output guardrail failed]: {out_result.message}"
                            # guidance mode: return response with warning
                            logger.warning(
                                "output_guardrail_guidance",
                                guardrail=g.name,
                                message=out_result.message,
                            )

            await self._store_chunked_output(
                node=node,
                ctx=ctx,
                output=response,
                executor="single_shot",
            )
            return response
        except Exception as exc:
            logger.error(
                "agency_orchestrator_agent_node_failed",
                node_id=node["id"],
                error=str(exc)[:200],
            )
            from app.services.agency_error_handler import scrub_error_payload
            return f"[Agent '{node.get('name')}' error: {scrub_error_payload(str(exc))}]"

    async def _route(self, router_node: NodeRow, ctx: ExecutionContext) -> str | None:
        """Determine next node ID based on router config."""
        cfg: dict = router_node.get("node_config") or {}
        routing_mode: str = cfg.get("routingMode", "llm_classify")
        routes: list[dict] = cfg.get("routes", [])
        default_target: str | None = cfg.get("defaultTargetNodeId")
        input_text = ctx.input

        for route in routes:
            condition: str = route.get("condition", "")
            target_id: str = route.get("targetNodeId", "")
            if not condition or not target_id:
                continue

            match routing_mode:
                case "keyword":
                    if condition.lower() in input_text.lower():
                        logger.info("agency_router_matched_keyword", condition=condition, target=target_id)
                        return target_id
                case "regex":
                    try:
                        if re.search(condition, input_text, re.IGNORECASE):
                            logger.info("agency_router_matched_regex", pattern=condition, target=target_id)
                            return target_id
                    except re.error:
                        pass
                case "llm_classify":
                    matched = await self._llm_classify(input_text, routes, ctx.user_token)
                    return matched or default_target
                case _:
                    pass

        return default_target

    async def _llm_classify(self, input_text: str, routes: list[dict], user_token: str) -> str | None:
        """Use LLM to classify input and return target node ID.

        SECURITY: Uses role separation to prevent prompt injection.
        User input is always in the 'user' role, never embedded in system prompt.
        """
        llm_url = os.getenv("LLM_GATEWAY_URL", "http://127.0.0.1:3000")
        route_labels = "\n".join(
            f"- {r.get('label', r.get('condition', ''))}: targetNodeId={r.get('targetNodeId', '')}"
            for r in routes
        )
        system_prompt = (
            f"You are a message router. Classify the user's message into one of these routes:\n"
            f"{route_labels}\n\n"
            "Respond with ONLY the targetNodeId. Do not include any other text."
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{llm_url}/api/llm/chat",
                    json={
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": input_text[:2000]},
                        ],
                        "max_tokens": 50,
                    },
                    headers={"Authorization": f"Bearer {user_token}"},
                )
                if resp.status_code == 200:
                    body = resp.json()
                    answer = (
                        body.get("choices", [{}])[0].get("message", {}).get("content", "")
                        or body.get("content", "")
                        or ""
                    ).strip()
                    for route in routes:
                        if route.get("targetNodeId", "") in answer:
                            return route["targetNodeId"]
        except Exception as exc:
            logger.warning("agency_router_llm_classify_failed", error=str(exc)[:100])
        return None

    async def _evaluate_conditional_branch(
        self, node: NodeRow, ctx: ExecutionContext,
    ) -> str | None:
        """Evaluate a conditional_branch node and return the target node ID."""
        cfg: dict = node.get("node_config") or {}
        mode = cfg.get("evaluationMode", "rule_based")
        default_target = cfg.get("defaultTargetNodeId")

        # Previous node output (last result in context)
        previous_output = ""
        incoming = [e for e in self.edges if e.get("to_node_id") == node["id"]]
        if incoming:
            prev_id = incoming[0].get("from_node_id", "")
            previous_output = ctx.results.get(prev_id, ctx.input)
        else:
            previous_output = ctx.input

        result_target: str | None = None
        match mode:
            case "rule_based":
                result_target = evaluate_rule_based(
                    cfg.get("rules", []),
                    previous_output,
                )
            case "llm_classify":
                llm_gateway = os.getenv("LLM_GATEWAY_URL", "http://127.0.0.1:3000")
                result_target = await evaluate_llm_classify(
                    cfg, previous_output, llm_gateway, ctx.user_token,
                )
            case "context_check":
                if ctx.shared_context:
                    result_target = await evaluate_context_check(cfg, ctx.shared_context)
            case _:
                logger.warning("conditional_branch_unknown_mode", mode=mode)

        if result_target and result_target in self.nodes:
            return result_target
        return default_target

    async def _execute_parallel_fan_out(
        self, node: NodeRow, ctx: ExecutionContext,
    ) -> str:
        """Execute branches concurrently and merge results."""
        node_id = node["id"]
        cfg: dict = node.get("node_config") or {}
        branches: list[dict] = cfg.get("branches", [])
        merge_strategy: str = cfg.get("mergeStrategy", "wait_all")
        merge_prompt: str = cfg.get("mergePrompt", "")
        timeout_ms: int = cfg.get("timeoutMs", 120000)
        max_concurrent: int = min(cfg.get("maxConcurrent", 5), 10)
        continue_on_error: bool = cfg.get("continueOnError", True)
        timeout_seconds = timeout_ms / 1000.0

        # Resolve dynamic branches if configured
        dyn_source = cfg.get("dynamicBranchSource")
        if dyn_source:
            source_output = ctx.results.get(dyn_source.get("nodeId", ""), "")
            try:
                items = json.loads(source_output)
                if isinstance(items, list):
                    template = dyn_source.get("taskTemplate", "{item}")
                    branches = [
                        {"id": f"dyn-{i}", "targetNodeId": branches[0]["targetNodeId"] if branches else "", "taskDescription": template.replace("{item}", str(item))}
                        for i, item in enumerate(items[:10])
                    ]
            except (json.JSONDecodeError, TypeError, IndexError):
                logger.warning("parallel_fan_out_dynamic_parse_error", node_id=node_id)

        if not branches:
            logger.warning("parallel_fan_out_no_branches", node_id=node_id)
            return "[ParallelFanOut: no branches configured]"

        sem = asyncio.Semaphore(max_concurrent)

        async def run_branch(branch: dict, branch_ctx: ExecutionContext) -> str:
            async with sem:
                target_node = self.nodes.get(branch.get("targetNodeId", ""))
                if not target_node:
                    return f"[Branch {branch.get('id', '?')}: target not found]"
                if branch.get("taskDescription"):
                    branch_ctx.input = branch["taskDescription"] + "\n\n" + ctx.input
                try:
                    return await asyncio.wait_for(
                        self._execute_node(target_node, branch_ctx),
                        timeout=timeout_seconds,
                    )
                except asyncio.TimeoutError:
                    return f"[Branch {branch.get('id', '?')}: timed out after {timeout_ms}ms]"
                except Exception as exc:
                    if not continue_on_error:
                        raise
                    return f"[Branch {branch.get('id', '?')}: error — {str(exc)[:200]}]"

        # Create branch tasks with cloned contexts
        branch_contexts: list[ExecutionContext] = []
        tasks = []
        for branch in branches:
            branch_ctx = ctx.clone()
            branch_contexts.append(branch_ctx)
            tasks.append(run_branch(branch, branch_ctx))

        # Execute
        if merge_strategy == "first_complete":
            # Use asyncio.wait with FIRST_COMPLETED
            pending = {asyncio.ensure_future(t) for t in tasks}
            done: set = set()
            result = ""
            try:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    r = task.result()
                    if isinstance(r, str) and not r.startswith("[Branch"):
                        result = r
                        break
                    result = r
            finally:
                for task in pending:
                    task.cancel()
        else:
            results = await asyncio.gather(*tasks, return_exceptions=continue_on_error)
            branch_results: list[str] = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    branch_results.append(f"[Branch {branches[i].get('id', i)}: error — {str(r)[:200]}]")
                else:
                    branch_results.append(str(r) if r else "")

            # Merge
            if merge_strategy == "wait_all":
                parts = []
                for i, r in enumerate(branch_results):
                    label = branches[i].get("label", f"Branch {i+1}")
                    parts.append(f"**{label}**:\n{r}")
                result = "\n\n---\n\n".join(parts)
            elif merge_strategy == "majority":
                # Simple majority vote by string equality
                from collections import Counter
                valid = [r for r in branch_results if not r.startswith("[Branch")]
                if valid:
                    most_common = Counter(valid).most_common(1)[0][0]
                    result = most_common
                else:
                    result = "\n".join(branch_results)
            elif merge_strategy == "custom_prompt":
                # Call LLM Gateway to merge
                combined = "\n\n".join(
                    f"Branch {branches[i].get('label', i+1)}: {r}"
                    for i, r in enumerate(branch_results)
                )
                llm_prompt = f"{merge_prompt}\n\nBranch Results:\n{combined}"
                try:
                    llm_url = os.getenv("LLM_GATEWAY_URL", "http://127.0.0.1:3000")
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        resp = await client.post(
                            f"{llm_url}/api/llm/chat",
                            json={"messages": [
                                {"role": "system", "content": merge_prompt},
                                {"role": "user", "content": combined},
                            ]},
                            headers={"Authorization": f"Bearer {ctx.user_token}"},
                        )
                        if resp.status_code == 200:
                            result = (
                                resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                                or resp.json().get("content", "")
                                or ""
                            ).strip()
                        else:
                            result = "\n\n---\n\n".join(branch_results)
                except Exception as exc:
                    logger.warning("parallel_fan_out_merge_llm_error", error=str(exc)[:100])
                    result = "\n\n---\n\n".join(branch_results)
            else:
                result = "\n\n---\n\n".join(branch_results)

        # Copy branch step_attempts back to parent
        for i, branch_ctx in enumerate(branch_contexts):
            for attempt in branch_ctx.step_attempts:
                attempt["branch_id"] = branches[i].get("id", f"branch-{i}") if i < len(branches) else f"branch-{i}"
                ctx.step_attempts.append(attempt)

        ctx.results[node_id] = result
        return result

    async def _aggregate(self, agg_node: NodeRow, ctx: ExecutionContext) -> str:
        """Aggregate results from upstream nodes."""
        cfg: dict = agg_node.get("node_config") or {}
        mode: str = cfg.get("aggregationMode", "concatenate")

        upstream_ids = [
            e["from_node_id"] for e in self.edges
            if e.get("to_node_id") == agg_node["id"]
        ]
        inputs = [ctx.results[uid] for uid in upstream_ids if uid in ctx.results]

        if not inputs:
            return ""

        match mode:
            case "first_wins":
                return inputs[0]
            case "concatenate":
                return "\n\n---\n\n".join(inputs)
            case "majority_vote":
                return max(set(inputs), key=inputs.count)
            case "llm_merge":
                return await self._llm_merge(agg_node, inputs, ctx.user_token)
            case _:
                return "\n\n".join(inputs)

    async def _llm_merge(self, agg_node: NodeRow, inputs: list[str], user_token: str) -> str:
        """Merge multiple responses using LLM."""
        python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        cfg = agg_node.get("node_config") or {}
        merge_instructions = cfg.get("mergeInstructions", "Synthesize the following responses into a single coherent answer.")
        combined = "\n\n---\n\n".join(f"Response {i+1}:\n{r}" for i, r in enumerate(inputs))
        prompt = f"{merge_instructions}\n\n{combined}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{python_backend}/api/v1/llm/simple",
                    json={"message": prompt, "max_tokens": 2000},
                    headers={"Authorization": f"Bearer {user_token}"},
                )
                if resp.status_code == 200:
                    return resp.json().get("content", "")
        except Exception as exc:
            logger.warning("agency_aggregator_llm_merge_failed", error=str(exc)[:100])
        return "\n\n".join(inputs)

    async def _search_knowledge(self, kb_node: NodeRow, ctx: ExecutionContext) -> None:
        """Search knowledge base and populate ctx.knowledge.

        Supports two modes:
        - searchScope='all' (default): search across ALL tenant documents
        - searchScope='specific' + collectionId: search a single document only
        """
        cfg: dict = kb_node.get("node_config") or {}
        search_scope: str = cfg.get("searchScope", "all")
        collection_id: str | None = cfg.get("collectionId")
        top_k: int = int(cfg.get("topK", 5))
        search_mode_str: str = cfg.get("searchMode", "hybrid")
        score_threshold: float = float(cfg.get("scoreThreshold", 0.7))

        try:
            from sqlalchemy import select
            from app.core.database import get_db_context
            from app.models.library import LibraryChunk, LibraryItem
            from app.orchestrator.rag.hybrid_rag import (
                HybridRAGEngine, RAGConfig, SearchMode,
            )
            from app.orchestrator.rag.scope_engine import compute_effective_scopes

            try:
                mode = SearchMode(search_mode_str)
            except ValueError:
                mode = SearchMode.HYBRID

            MAX_CHUNKS = 5000

            async with get_db_context() as session:
                # Compute user's effective scopes for permission filtering
                effective_scopes: set[str] = set()
                if ctx.user_id:
                    effective_scopes = await compute_effective_scopes(
                        user_id=ctx.user_id,
                        tenant_id=ctx.tenant_id,
                        session=session,
                    )
                else:
                    # Fallback: public + tenant scopes only
                    effective_scopes = {f"p:global", f"t:{ctx.tenant_id}"}

                effective_scopes_list = list(effective_scopes)

                # Query chunks — filtered by tenant + permissions, optionally by specific document
                chunk_stmt = (
                    select(LibraryChunk)
                    .where(LibraryChunk.tenant_id == ctx.tenant_id)
                    .where(LibraryChunk.is_parent.is_(False))
                    # Permission filter: chunk.allowed_scopes must overlap with user's scopes
                    .where(LibraryChunk.allowed_scopes.overlap(effective_scopes_list))
                )
                if search_scope == "specific" and collection_id:
                    # Filter to a specific library item
                    try:
                        chunk_stmt = chunk_stmt.where(
                            LibraryChunk.library_item_id == int(collection_id),
                        )
                    except (ValueError, TypeError):
                        logger.warning("agency_kb_invalid_collection_id", collection_id=collection_id)

                chunk_stmt = chunk_stmt.limit(MAX_CHUNKS)
                chunk_rows = (await session.execute(chunk_stmt)).scalars().all()

                if not chunk_rows:
                    logger.info("agency_kb_no_chunks", node_id=kb_node["id"], scope=search_scope)
                    return

                # Build item map for titles
                item_ids = list({c.library_item_id for c in chunk_rows})
                item_stmt = select(LibraryItem).where(LibraryItem.id.in_(item_ids))
                item_rows = (await session.execute(item_stmt)).scalars().all()
                item_map = {i.id: i for i in item_rows}

                # Instantiate RAG engine
                config = RAGConfig(mode=mode, top_k=top_k)
                engine = HybridRAGEngine(config=config)

                # Load chunks
                for chunk in chunk_rows:
                    parent_item = item_map.get(chunk.library_item_id)
                    section_heading = ""
                    if chunk.metadata_json:
                        section_heading = chunk.metadata_json.get("section_heading", "")

                    await engine.add_document(
                        content=chunk.content,
                        metadata={
                            "chunk_id": str(chunk.id),
                            "parent_doc_id": str(chunk.library_item_id),
                            "parent_doc_title": parent_item.title if parent_item else "",
                            "section_heading": section_heading,
                            "tenant_id": chunk.tenant_id,
                            "allowed_scopes": chunk.allowed_scopes or [],
                        },
                        source_type=parent_item.item_type if parent_item else "document",
                        source_id=str(chunk.library_item_id),
                        doc_id=chunk.vector_ref_id or str(chunk.id),
                    )

                # Retrieve with scope enforcement
                rag_result = await engine.retrieve(
                    query=ctx.input,
                    top_k=top_k,
                    mode=mode,
                    tenant_id=ctx.tenant_id,
                    user_id=ctx.user_id if ctx.user_id else None,
                    effective_scopes=effective_scopes_list,
                )

                # Populate context with retrieved documents
                ctx.knowledge = [
                    {
                        "title": d.metadata.get("parent_doc_title", "Document"),
                        "content": d.content,
                        "score": d.score,
                        "source_id": d.metadata.get("parent_doc_id", ""),
                    }
                    for d in rag_result.documents
                    if d.score >= score_threshold
                ]

                logger.info(
                    "agency_knowledge_base_searched",
                    node_id=kb_node["id"],
                    scope=search_scope,
                    user_id=ctx.user_id,
                    scopes_count=len(effective_scopes),
                    chunks_loaded=len(chunk_rows),
                    doc_count=len(ctx.knowledge),
                )

        except Exception as exc:
            logger.warning("agency_knowledge_base_search_failed", error=str(exc)[:200])

    async def _call_skill(self, skill_node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute a SmartSpecPro skill and return its output."""
        cfg: dict = skill_node.get("node_config") or {}
        skill_slug: str | None = cfg.get("skillSlug")
        skill_id: str | None = cfg.get("skillId")
        node_name = skill_node.get("name", skill_node.get("id", ""))

        if not skill_slug and not skill_id:
            return f"[Skill node '{node_name}': no skillSlug configured]"

        # Resolve input mappings (section-20 enhancement)
        input_mappings = cfg.get("inputMappings")
        resolved_input: str | dict = ctx.input
        if input_mappings and ctx.shared_context:
            mapped = await resolve_skill_input_mappings(
                input_mappings, ctx.shared_context, ctx.results
            )
            if mapped is not None:
                resolved_input = mapped

        python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{python_backend}/api/v1/skills/execute",
                    json={
                        "skill_slug": skill_slug or skill_id,
                        "input": resolved_input,
                        "context": ctx.get_context_text(),
                    },
                    headers={"Authorization": f"Bearer {ctx.user_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    result_text = data.get("output", "") or data.get("result", "")
                    # Output routing by skill category
                    category = data.get("category", "")
                    await self._route_skill_output(
                        node_name, category, result_text, data, ctx
                    )
                    # Chain metadata
                    chain_to = data.get("chainTo")
                    if chain_to and ctx.shared_context:
                        await ctx.shared_context.set(f"{node_name}_chainTo", chain_to)
                        logger.info("agency_skill_chain_detected", node=node_name, chain_to=chain_to)
                    return result_text
                return f"[Skill '{skill_slug}' returned HTTP {resp.status_code}]"
        except Exception as exc:
            logger.error("agency_skill_call_failed", skill=skill_slug, error=str(exc)[:100])
            return f"[Skill '{skill_slug}' failed: {str(exc)[:100]}]"

    async def _execute_mcp_server_node(self, node: "NodeRow", ctx: "ExecutionContext") -> str:
        """Execute an MCP server node — calls a tool on an external MCP server.

        Reads config from node_config: serverSlug, serverUrl, toolName, parameters.
        Uses the MCP client with SSRF validation and rate limiting.
        """
        cfg = node.get("node_config") or {}
        server_url = cfg.get("serverUrl", "")
        tool_name = cfg.get("toolName", "")
        parameters = cfg.get("parameters", {})
        node_name = node.get("name", node.get("id", "mcp"))

        if not server_url:
            return f"[MCP '{node_name}': no server URL configured]"
        if not tool_name:
            return f"[MCP '{node_name}': no tool name configured]"

        try:
            from app.services.mcp_client import call_tool
            tenant_id = (
                getattr(self.agency_config, "tenant_id", None)
                or ctx.shared_context.tenant_id if ctx.shared_context else None
            )
            result = await call_tool(
                server_url=server_url,
                tool_name=tool_name,
                arguments=parameters,
                tenant_id=tenant_id,
            )
            # Store result in context for downstream nodes
            ctx.results[node.get("id", "")] = result
            logger.info(
                "agency_mcp_server_node_executed",
                node=node_name,
                tool=tool_name,
                result_len=len(result),
            )
            return result
        except Exception as exc:
            logger.error("agency_mcp_server_node_failed", node=node_name, error=str(exc)[:200])
            return f"[MCP '{node_name}' failed: {str(exc)[:100]}]"

    async def _route_skill_output(
        self,
        node_name: str,
        category: str,
        result_text: str,
        data: dict[str, Any],
        ctx: ExecutionContext,
    ) -> None:
        """Route skill output to context based on skill category."""
        if not ctx.shared_context or not category:
            return
        if category in ("image_generation", "audio_generation"):
            media_url = data.get("media_url") or data.get("url") or result_text
            await ctx.shared_context.set(f"{node_name}_media_url", media_url)
        elif category == "video_generation":
            job_ref = data.get("job_id") or data.get("task_id") or result_text
            await ctx.shared_context.set(f"{node_name}_job", job_ref)

    async def _await_approval(self, approval_node: NodeRow, ctx: ExecutionContext) -> str:
        """Create an approval request and wait for decision via SSE + context polling."""
        from app.services.agency_approval_tool import (
            RequestApprovalTool,
            await_approval_decision,
        )

        cfg: dict = approval_node.get("node_config") or {}
        approval_message: str = cfg.get("approvalMessage", "Approval required to proceed.")
        timeout_hours: int = int(cfg.get("timeoutHours", 24))
        on_timeout: str = cfg.get("onTimeout", "auto_reject")

        logger.info(
            "agency_human_approval_requested",
            node_id=approval_node["id"],
            timeout_hours=timeout_hours,
        )

        # Use SSE-based approval flow if context and emitter are available
        if ctx.shared_context and self.event_emitter:
            tool = RequestApprovalTool(
                agent_name=approval_node.get("name", "Approval"),
                run_context=ctx.shared_context,
                event_emitter=self.event_emitter,
            )
            await tool.execute(step=approval_message, summary=ctx.input[:500])

            # Extract the approval key from the emitted event
            all_data = ctx.shared_context.snapshot()
            approval_key = None
            for key in all_data:
                if key.startswith("approval:") and all_data[key].get("status") == "pending":
                    approval_key = key.replace("approval:", "")
                    break

            if approval_key:
                timeout_seconds = timeout_hours * 3600
                result = await await_approval_decision(
                    ctx.shared_context,
                    approval_key,
                    approval_message,
                    timeout_seconds=min(timeout_seconds, 1800),  # Cap at 30 min for SSE
                )
                return result

        # Fallback: HTTP-based approval for non-SSE flows
        python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{python_backend}/api/v1/approvals/create",
                    json={
                        "context": f"Agency approval: {approval_message}\n\nInput: {ctx.input[:500]}",
                        "approval_type": "agency_approval",
                        "timeout_hours": timeout_hours,
                        "on_timeout": on_timeout,
                    },
                    headers={"Authorization": f"Bearer {ctx.user_token}"},
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    approval_id = data.get("id")
                    decision = data.get("decision")
                    if decision == "approved":
                        return "[Human approval: APPROVED — proceeding]"
                    elif decision == "rejected":
                        return "[Human approval: REJECTED — stopping]"
                    return f"[Human approval requested (id={approval_id}) — awaiting decision]"
        except Exception as exc:
            logger.warning("agency_human_approval_failed", error=str(exc)[:100])

        # Timeout fallback
        match on_timeout:
            case "auto_approve":
                return "[Human approval: timed out → AUTO-APPROVED]"
            case "auto_reject":
                return "[Human approval: timed out → AUTO-REJECTED]"
            case _:
                return "[Human approval: timed out → escalated]"

    async def _dispatch_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute node logic WITHOUT error interception wrapping.

        Used by retry to avoid recursive error handler re-entry.
        """
        node_type = node.get("node_type", "agent")
        match node_type:
            case "agent" | "supervisor":
                return await self._execute_agent_node(node, ctx)
            case "data_transform":
                return await self._execute_data_transform(node, ctx)
            case "skill_call":
                return await self._call_skill(node, ctx)
            case "aggregator":
                return await self._aggregate(node, ctx)
            case _:
                return await self._execute_agent_node(node, ctx)

    async def _handle_error(
        self,
        handler_node: NodeRow,
        failed_node: NodeRow,
        exc: Exception,
        ctx: ExecutionContext,
    ) -> str:
        """Apply error handler strategy to a failed node."""
        cfg = handler_node.get("node_config") or {}
        strategy = cfg.get("onError", "skip")
        failed_name = failed_node.get("name", failed_node["id"])

        logger.info(
            "agency_error_handler_triggered",
            handler=handler_node.get("name"),
            failed_node=failed_name,
            strategy=strategy,
        )

        # Emit SSE event uniformly for all strategies
        if self.event_emitter:
            await self.event_emitter.emit("error_handled", {
                "nodeName": failed_name,
                "strategy": strategy,
                "errorSummary": scrub_error_payload(str(exc)),
            })

        if strategy == "retry":
            retry_config = cfg.get("retryConfig", {})
            # Use _dispatch_node to avoid recursive error interception
            return await execute_retry(
                self._dispatch_node,
                failed_node, ctx, retry_config,
                emitter=self.event_emitter,
            )

        elif strategy == "fallback":
            fallback_node_id = cfg.get("fallbackNodeId")
            fallback_message = cfg.get("fallbackMessage")
            result, redirect_id = execute_fallback(
                fallback_node_id, fallback_message, exc,
            )
            if redirect_id and redirect_id in self.nodes:
                return await self._execute_node(self.nodes[redirect_id], ctx, _depth + 1)
            return result or f"[Fallback for {failed_name}]"

        elif strategy == "skip":
            return execute_skip(cfg.get("skipMessage"))

        else:  # terminate
            execute_terminate(failed_name, exc)
            return ""  # unreachable, but keeps mypy happy

    async def _execute_data_transform(self, node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute a data_transform node."""
        node_id = node["id"]
        node_config = node.get("node_config") or {}

        # Find previous node's result by looking at incoming edges
        incoming = [e for e in self.edges if e.get("to_node_id") == node_id]
        input_data = ""
        if incoming:
            source_id = incoming[0].get("from_node_id", "")
            input_data = ctx.results.get(source_id, "")

        if not input_data:
            input_data = ctx.input  # fallback to original input

        result = execute_data_transform(input_data, node_config)

        # Store in context under outputKey if specified
        output_key = node_config.get("outputKey")
        if output_key and ctx.shared_context:
            await ctx.shared_context.set(output_key, result)

        return result


# ── Factory function ──────────────────────────────────────────────────────────

def should_use_orchestrator(nodes: list[NodeRow]) -> bool:
    """Return True if the agency has non-agent nodes that need the orchestrator."""
    if not ORCHESTRATOR_ENABLED:
        return False
    return any(n.get("node_type", "agent") not in AGENT_NODE_TYPES for n in nodes)
