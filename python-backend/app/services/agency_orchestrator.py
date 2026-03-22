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
import os
import re
from typing import Any

import httpx
import structlog

from app.services.agency_browser_session_executor import AgencyBrowserSessionExecutor
from app.services.agency_run_context import AgencyRunContext

logger = structlog.get_logger(__name__)

ORCHESTRATOR_ENABLED = os.getenv("AGENCY_ORCHESTRATOR_ENABLED", "true").lower() == "true"

AGENT_NODE_TYPES = {"agent", "supervisor"}


# ── Type aliases ───────────────────────────────────────────────────────────────

NodeRow = dict[str, Any]
EdgeRow = dict[str, Any]


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
        self.browser_session_executor = AgencyBrowserSessionExecutor()

        # Find entry node
        entry_candidates = [n for n in nodes if n.get("is_entry_point")]
        self.entry_node: NodeRow = entry_candidates[0] if entry_candidates else nodes[0]

    def has_non_agent_nodes(self) -> bool:
        """Return True if any node is not a plain agent (triggers orchestrator path)."""
        return any(
            n.get("node_type", "agent") not in AGENT_NODE_TYPES
            for n in self.nodes.values()
        )

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

        result = await self._execute_node(self.entry_node, ctx)

        # Capture context snapshot for observability (section-15 will persist it)
        ctx.context_snapshot = ctx.shared_context.snapshot()

        return result or "", ctx

    async def _execute_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute a single node and follow its outgoing edges."""
        node_type = node.get("node_type", "agent")
        node_id = node["id"]

        logger.info("agency_orchestrator_execute_node", node_id=node_id, node_type=node_type)

        result: str
        match node_type:
            case "agent" | "supervisor":
                result = await self._execute_agent_node(node, ctx)

            case "router":
                next_node_id = await self._route(node, ctx)
                if next_node_id and next_node_id in self.nodes:
                    result = await self._execute_node(self.nodes[next_node_id], ctx)
                else:
                    result = f"[Router: no matching route in node {node_id}]"
                return result  # Router doesn't follow normal edges — routing already done

            case "aggregator":
                result = await self._aggregate(node, ctx)

            case "knowledge_base":
                await self._search_knowledge(node, ctx)
                result = ""  # Knowledge populates ctx.knowledge, doesn't produce a response
                # Fall through to follow edges

            case "skill_call":
                result = await self._call_skill(node, ctx)

            case "human_approval":
                result = await self._await_approval(node, ctx)

            case "browser_session":
                execution = await self.browser_session_executor.execute(
                    node,
                    ctx,
                    agency_id=getattr(self.agency_config, "agency_id", None),
                )
                result = str(execution.get("result") or "")

            case _:
                logger.warning("agency_orchestrator_unknown_node_type", node_type=node_type)
                result = ""

        if result:
            ctx.results[node_id] = result

        # Follow outgoing edges (unless router which already handled routing)
        if node_type not in ("router",):
            outgoing = [e for e in self.edges if e.get("from_node_id") == node_id]

            parallel_edges = [e for e in outgoing if e.get("flow_type") == "parallel"]
            sequential_edges = [e for e in outgoing if e.get("flow_type") != "parallel"]

            if parallel_edges:
                # Execute parallel branches concurrently
                tasks = [
                    self._execute_node(self.nodes[e["to_node_id"]], ctx)
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
                    # ── Checkpoint 3: Handoff Guardrails ────────────────────
                    next_type = next_node.get("node_type", "agent")
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
                    sub_result = await self._execute_node(next_node, ctx)
                    if sub_result:
                        result = sub_result  # Last result in the chain is the final answer

        return result

    # ── Node executors ────────────────────────────────────────────────────────

    async def _execute_agent_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
        """Execute an agent/supervisor node via AgencySwarmAdapter."""
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
            if input_result.action == "block":
                return f"[Guardrail blocked]: {input_result.message}"
            # Apply redaction first, then guidance
            if input_result.redacted_message:
                augmented_message = input_result.redacted_message
            if input_result.action == "guidance":
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

        try:
            from app.services.agency_swarm_adapter import AgentConfig

            tools = []
            if self.db:
                from app.services.agency_tools import resolve_tools_for_agent
                tools = await resolve_tools_for_agent(
                    db=self.db,
                    agent_id=node["id"],
                    agency_whitelist=self.agency_whitelist,
                    adapter=self.adapter,
                    retrieval_scope_mode=self.retrieval_scope_mode,
                    run_context=ctx.shared_context,
                )

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
                ),
                user_token=ctx.user_token,
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

            return response
        except Exception as exc:
            logger.error(
                "agency_orchestrator_agent_node_failed",
                node_id=node["id"],
                error=str(exc)[:200],
            )
            return f"[Agent '{node.get('name')}' error: {str(exc)[:100]}]"

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
        """Use LLM to classify input and return target node ID."""
        python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        route_labels = "\n".join(
            f"- {r.get('label', r.get('condition', ''))}: targetNodeId={r.get('targetNodeId', '')}"
            for r in routes
        )
        prompt = f"Classify the user input into one of these routes:\n{route_labels}\n\nUser input: {input_text}\n\nRespond with only the targetNodeId."
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{python_backend}/api/v1/llm/simple",
                    json={"message": prompt, "max_tokens": 50},
                    headers={"Authorization": f"Bearer {user_token}"},
                )
                if resp.status_code == 200:
                    answer = resp.json().get("content", "").strip()
                    # Match against known target IDs
                    for route in routes:
                        if route.get("targetNodeId", "") in answer:
                            return route["targetNodeId"]
        except Exception as exc:
            logger.warning("agency_router_llm_classify_failed", error=str(exc)[:100])
        return None

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

        if not skill_slug and not skill_id:
            return f"[Skill node '{skill_node.get('name')}': no skillSlug configured]"

        python_backend = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000")
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{python_backend}/api/v1/skills/execute",
                    json={
                        "skill_slug": skill_slug or skill_id,
                        "input": ctx.input,
                        "context": ctx.get_context_text(),
                    },
                    headers={"Authorization": f"Bearer {ctx.user_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("output", "") or data.get("result", "")
                return f"[Skill '{skill_slug}' returned HTTP {resp.status_code}]"
        except Exception as exc:
            logger.error("agency_skill_call_failed", skill=skill_slug, error=str(exc)[:100])
            return f"[Skill '{skill_slug}' failed: {str(exc)[:100]}]"

    async def _await_approval(self, approval_node: NodeRow, ctx: ExecutionContext) -> str:
        """Create an approval request and wait for decision (with timeout)."""
        cfg: dict = approval_node.get("node_config") or {}
        approval_message: str = cfg.get("approvalMessage", "Approval required to proceed.")
        timeout_hours: int = int(cfg.get("timeoutHours", 24))
        on_timeout: str = cfg.get("onTimeout", "auto_reject")

        logger.info(
            "agency_human_approval_requested",
            node_id=approval_node["id"],
            timeout_hours=timeout_hours,
        )

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
                    # Pending — for async flows, return placeholder
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


# ── Factory function ──────────────────────────────────────────────────────────

def should_use_orchestrator(nodes: list[NodeRow]) -> bool:
    """Return True if the agency has non-agent nodes that need the orchestrator."""
    if not ORCHESTRATOR_ENABLED:
        return False
    return any(n.get("node_type", "agent") not in AGENT_NODE_TYPES for n in nodes)
