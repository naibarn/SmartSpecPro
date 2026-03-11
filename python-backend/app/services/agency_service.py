"""
Agency Service -- lifecycle management for agency runs.

Orchestrates: load config -> construct agents -> pre-check credits ->
execute run -> apply multiplier markup -> record results.

Agency objects are instantiated per-request (never reused).
"""

import json
import uuid
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

import structlog
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.agency_swarm_adapter import (
    AgencySwarmAdapter,
    AgentConfig,
    AgencyConfig,
    RunResult,
)
from app.services.agency_credits import AgencyCreditManager
from app.services.agency_persistence import create_persistence_hooks
from app.services.agency_result_envelope import parse_agency_result_envelope
from app.services.agency_tools import resolve_tools_for_agent
from app.services.agency_audit import log_agency_event, reconcile_credits
from app.services.agency_orchestrator import AgencyOrchestrator, should_use_orchestrator

logger = structlog.get_logger(__name__)


# ── Exceptions ─────────────────────────────────────────────────────


class AgencyNotFoundError(Exception):
    """Raised when agency does not exist."""


class AgencyPermissionError(Exception):
    """Raised when user/tenant does not have access to agency."""


class InsufficientCreditsError(Exception):
    """Raised when user lacks credits for estimated run cost."""


class AgencyDisabledError(Exception):
    """Raised when agency or feature is disabled."""


# ── Run Context ────────────────────────────────────────────────────


class RunContext(BaseModel):
    """Context for an agency run."""

    user_id: int
    tenant_id: str
    conversation_id: str
    user_token: str


# ── Service ────────────────────────────────────────────────────────


class AgencyService:
    """Orchestrates agency lifecycle: load, construct, execute, record."""

    INLINE_PREVIEW_PAYLOAD_THRESHOLD_BYTES = 64 * 1024
    MAX_DIRECT_PREVIEW_PERSISTENCE_BYTES = 5 * 1024 * 1024
    RUN_STRUCTURED_RESULT_PAYLOAD_STORAGE_KEY = "run_structured_result_payload"
    SUMMARY_ONLY_PREVIEW_STORAGE_KEY = "preview_summary_only"

    def __init__(self, db: AsyncSession):
        self.db = db
        self.adapter = AgencySwarmAdapter()
        self.credit_manager = AgencyCreditManager(
            gateway_url=settings.SMARTSPEC_WEB_GATEWAY_URL or "",
            gateway_token=settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "",
        )

    @staticmethod
    def _json_value(value):
        if value is None:
            return None
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value

    @staticmethod
    def _compact_preview_artifact(artifact: dict) -> dict:
        return {
            "id": artifact["id"],
            "intent": artifact["intent"],
            "artifact_type": artifact["artifact_type"],
            "state": artifact["state"],
            "summary": artifact["summary"],
            "payload_json": artifact.get("payload_json"),
            "payload_storage_key": artifact.get("payload_storage_key"),
            "provenance_json": artifact.get("provenance_json"),
            "commit_status": artifact["commit_status"],
            "commit_token": artifact["commit_token"],
            "target_type": artifact.get("target_type"),
            "target_id": artifact.get("target_id"),
            "committed_at": artifact.get("committed_at"),
            "expired_at": artifact.get("expired_at"),
        }

    @classmethod
    def _build_preview_payload_storage(
        cls,
        payload: Any,
        summary: str | None,
    ) -> tuple[dict | None, str | None]:
        if payload is None:
            return {}, None

        payload_bytes = len(json.dumps(payload).encode("utf-8"))
        if payload_bytes <= cls.INLINE_PREVIEW_PAYLOAD_THRESHOLD_BYTES:
            return payload, None

        if payload_bytes <= cls.MAX_DIRECT_PREVIEW_PERSISTENCE_BYTES:
            return None, cls.RUN_STRUCTURED_RESULT_PAYLOAD_STORAGE_KEY

        return {
            "truncated": True,
            "summary": summary,
            "reason": "preview payload exceeded max direct persistence size",
        }, cls.SUMMARY_ONLY_PREVIEW_STORAGE_KEY

    @staticmethod
    def _build_preview_artifact(
        *,
        run_id: str,
        agency_id: str,
        conversation_id: str,
        tenant_id: str,
        envelope: dict,
    ) -> dict:
        first_artifact = (envelope.get("artifacts") or [{}])[0]
        payload_json, payload_storage_key = AgencyService._build_preview_payload_storage(
            envelope.get("payload"),
            envelope.get("summary"),
        )
        return {
            "id": str(uuid.uuid4()),
            "run_id": run_id,
            "conversation_id": conversation_id,
            "agency_id": agency_id,
            "tenant_id": tenant_id,
            "intent": envelope["intent"],
            "artifact_type": first_artifact.get("artifact_type") or envelope["intent"],
            "state": "preview_generated",
            "summary": envelope.get("summary"),
            "payload_json": payload_json,
            "payload_storage_key": payload_storage_key,
            "provenance_json": envelope.get("references") or [],
            "commit_status": "not_committed",
            "commit_token": uuid.uuid4().hex,
            "target_type": None,
            "target_id": None,
            "committed_at": None,
            "expired_at": None,
        }

    def _normalize_structured_preview_result(
        self,
        *,
        response_text: str,
        run_id: str,
        agency_id: str,
        conversation_id: str,
        tenant_id: str,
    ) -> dict:
        parse_outcome = parse_agency_result_envelope(response_text)
        structured_result = None
        preview_artifacts: list[dict] = []
        parse_status = "not_present"
        parse_error = None
        parse_intent = None
        parse_summary = None
        normalized_response = response_text

        if parse_outcome.found:
            parse_status = "parsed" if parse_outcome.valid else "invalid"
            parse_error = parse_outcome.error

        if parse_outcome.text_response:
            normalized_response = parse_outcome.text_response

        if parse_outcome.valid and parse_outcome.envelope:
            structured_result = parse_outcome.envelope.model_dump(mode="json")
            parse_intent = structured_result["intent"]
            parse_summary = structured_result["summary"]
            preview_artifacts = [
                self._build_preview_artifact(
                    run_id=run_id,
                    agency_id=agency_id,
                    conversation_id=conversation_id,
                    tenant_id=tenant_id,
                    envelope=structured_result,
                )
            ]

        return {
            "response": normalized_response,
            "structured_result": structured_result,
            "preview_artifacts": preview_artifacts,
            "parse_status": parse_status,
            "parse_error": parse_error,
            "parse_intent": parse_intent,
            "parse_summary": parse_summary,
        }

    async def _insert_running_run_record(
        self,
        *,
        run_id: str,
        agency_id: str,
        context: RunContext,
    ) -> None:
        await self.db.execute(
            text("""
                INSERT INTO agency_runs
                    (id, conversation_id, user_id, agency_id, tenant_id,
                     status, started_at)
                VALUES
                    (:id, :conv_id, :user_id, :agency_id, :tenant_id,
                     'running', :started_at)
            """),
            {
                "id": run_id,
                "conv_id": context.conversation_id,
                "user_id": context.user_id,
                "agency_id": agency_id,
                "tenant_id": context.tenant_id,
                "started_at": datetime.now(timezone.utc),
            },
        )
        await self.db.commit()

    async def _persist_completed_run(
        self,
        *,
        run_id: str,
        completed_at: datetime,
        elapsed_ms: int,
        step_count: int,
        structured_result: dict | None,
        parse_status: str,
        parse_intent: str | None,
        parse_summary: str | None,
        parse_error: str | None,
        preview_artifacts: list[dict],
    ) -> None:
        await self.db.execute(
            text("""
                UPDATE agency_runs
                SET status = 'completed',
                    completed_at = :completed_at,
                    duration_ms = :duration_ms,
                    step_count = :step_count,
                    structured_result = CAST(:structured_result AS JSON),
                    structured_result_parse_status = :structured_result_parse_status,
                    structured_result_intent = :structured_result_intent,
                    structured_result_summary = :structured_result_summary,
                    structured_result_error = :structured_result_error
                WHERE id = :id
            """),
            {
                "id": run_id,
                "completed_at": completed_at,
                "duration_ms": elapsed_ms,
                "step_count": step_count,
                "structured_result": json.dumps(structured_result) if structured_result else None,
                "structured_result_parse_status": parse_status,
                "structured_result_intent": parse_intent,
                "structured_result_summary": parse_summary,
                "structured_result_error": parse_error,
            },
        )

        for artifact in preview_artifacts:
            await self.db.execute(
                text("""
                    INSERT INTO agency_run_artifacts
                        (id, run_id, conversation_id, agency_id, tenant_id,
                         artifact_type, intent, state, summary,
                         payload_json, payload_storage_key, provenance_json,
                         commit_status, commit_token, target_type, target_id,
                         committed_at, expired_at, created_at, updated_at)
                    VALUES
                        (:id, :run_id, :conversation_id, :agency_id, :tenant_id,
                         :artifact_type, :intent, :state, :summary,
                         CAST(:payload_json AS JSON), :payload_storage_key, CAST(:provenance_json AS JSON),
                         :commit_status, :commit_token, :target_type, :target_id,
                         :committed_at, :expired_at, :created_at, :updated_at)
                """),
                {
                    **artifact,
                    "payload_json": json.dumps(artifact["payload_json"]) if artifact["payload_json"] is not None else None,
                    "provenance_json": json.dumps(artifact["provenance_json"]),
                    "created_at": completed_at,
                    "updated_at": completed_at,
                },
            )
        await self.db.commit()

    async def _mark_failed_run(
        self,
        *,
        run_id: str,
        elapsed_ms: int,
        exc: Exception,
    ) -> None:
        await self.db.execute(
            text("""
                UPDATE agency_runs
                SET status = 'failed',
                    completed_at = :completed_at,
                    duration_ms = :duration_ms,
                    error_type = :error_type,
                    error_message = :error_message
                WHERE id = :id
            """),
            {
                "id": run_id,
                "completed_at": datetime.now(timezone.utc),
                "duration_ms": elapsed_ms,
                "error_type": type(exc).__name__,
                "error_message": str(exc)[:500],
            },
        )
        await self.db.commit()

    async def load_agency(self, agency_id: str, tenant_id: str) -> AgencyConfig:
        """Load agency definition from PostgreSQL via read-only queries.

        Raises:
            AgencyNotFoundError: If agency does not exist or is not active.
            AgencyPermissionError: If agency belongs to different tenant.
        """
        result = await self.db.execute(
            text("""
                SELECT id, "tenantId" as tenant_id, name, description,
                       "systemPrompt" as system_prompt,
                       "creditMultiplier" as credit_multiplier,
                       "maxRunTimeSeconds" as max_run_time_seconds,
                       "creatorFeeCredits" as creator_fee_credits,
                       "platformSharePct" as platform_share_pct,
                       "createdBy" as creator_id,
                       status
                FROM agencies
                WHERE id = :agency_id
            """),
            {"agency_id": agency_id},
        )
        row = result.first()

        if not row:
            raise AgencyNotFoundError(f"Agency {agency_id} not found")

        if row.tenant_id != tenant_id:
            raise AgencyPermissionError(
                f"Agency {agency_id} belongs to tenant {row.tenant_id}, "
                f"not {tenant_id}"
            )

        # Check agency status
        if row.status not in ("active", "draft"):
            raise AgencyNotFoundError(
                f"Agency {agency_id} is not available (status: {row.status})"
            )

        # Load communication flows
        flows_data = await self._load_flows(agency_id)

        return AgencyConfig(
            agency_id=row.id,
            name=row.name,
            system_prompt=row.system_prompt or "",
            communication_flows=flows_data,
            tenant_id=row.tenant_id,
            user_id=0,  # Set by caller from RunContext
            conversation_id="",  # Set by caller from RunContext
            max_run_time_seconds=row.max_run_time_seconds or 600,
            credit_multiplier=float(row.credit_multiplier or "1.00"),
            creator_fee_credits=int(row.creator_fee_credits or 0),
            platform_share_pct=int(row.platform_share_pct or 20),
            creator_id=int(row.creator_id) if row.creator_id else None,
        )

    async def _load_agents(self, agency_id: str) -> list[dict]:
        """Load agent definitions for an agency (includes nodeType + nodeConfig)."""
        result = await self.db.execute(
            text("""
                SELECT id, name, instructions, model,
                       "modelSettings" as model_settings,
                       "isEntryPoint" as is_entry_point,
                       "nodeType" as node_type,
                       "nodeConfig" as node_config
                FROM agency_agents
                WHERE "agencyId" = :agency_id
                ORDER BY "createdAt" ASC
            """),
            {"agency_id": agency_id},
        )
        return [
            {
                "id": row.id,
                "name": row.name,
                "instructions": row.instructions or "",
                "model": row.model or "gpt-4o-mini",
                "model_settings": row.model_settings,
                "is_entry_point": row.is_entry_point,
                "node_type": row.node_type or "agent",
                "node_config": row.node_config or {},
            }
            for row in result.all()
        ]

    async def _load_tool_whitelist(self, agency_id: str) -> set[str]:
        """Load all tool IDs assigned to any agent in this agency."""
        result = await self.db.execute(
            text("""
                SELECT DISTINCT aat."toolId"
                FROM agency_agent_tools aat
                JOIN agency_agents aa ON aa.id = aat."agentId"
                WHERE aa."agencyId" = :agency_id
            """),
            {"agency_id": agency_id},
        )
        return {row[0] for row in result.all()}

    async def _load_flows(self, agency_id: str) -> list[tuple[str, str]]:
        """Load communication flows as (from_name, to_name) tuples (for AgencySwarmAdapter)."""
        result = await self.db.execute(
            text("""
                SELECT fa.name as from_agent_name, ta.name as to_agent_name
                FROM agency_communication_flows cf
                JOIN agency_agents fa ON fa.id = cf."fromAgentId"
                JOIN agency_agents ta ON ta.id = cf."toAgentId"
                WHERE cf."agencyId" = :agency_id
            """),
            {"agency_id": agency_id},
        )
        return [(row.from_agent_name, row.to_agent_name) for row in result.all()]

    async def _load_flows_full(self, agency_id: str) -> list[dict]:
        """Load full edge data for AgencyOrchestrator (includes flowType + node IDs)."""
        result = await self.db.execute(
            text("""
                SELECT cf."fromAgentId" as from_node_id,
                       cf."toAgentId" as to_node_id,
                       cf."flowType" as flow_type
                FROM agency_communication_flows cf
                WHERE cf."agencyId" = :agency_id
            """),
            {"agency_id": agency_id},
        )
        return [
            {
                "from_node_id": row.from_node_id,
                "to_node_id": row.to_node_id,
                "flow_type": row.flow_type or "delegation",
            }
            for row in result.all()
        ]

    async def execute_run(
        self,
        agency_id: str,
        message: str,
        context: RunContext,
    ) -> RunResult:
        """Full run lifecycle: load -> construct -> pre-check -> execute -> markup.

        Returns RunResult with response, credits used, and run metadata.
        """
        run_id = str(uuid.uuid4())
        start_time = time.monotonic()

        # 1. Load agency config (includes flows)
        agency_config = await self.load_agency(agency_id, context.tenant_id)
        agency_config.user_id = context.user_id
        agency_config.conversation_id = context.conversation_id

        # 2. Load agent definitions (separate query, not duplicated from load_agency)
        agents_data = await self._load_agents(agency_id)

        # 2b. If agency contains non-agent nodes → use AgencyOrchestrator (backward-compatible)
        if should_use_orchestrator(agents_data):
            logger.info(
                "agency_run_orchestrator_path",
                agency_id=agency_id,
                node_count=len(agents_data),
            )
            edges_data = await self._load_flows_full(agency_id)
            orchestrator = AgencyOrchestrator(
                nodes=agents_data,
                edges=edges_data,
                adapter=self.adapter,
                db=self.db,
                agency_config=agency_config,
            )
            response_text = await orchestrator.run(
                message=message,
                user_token=context.user_token,
                tenant_id=context.tenant_id,
                user_id=context.user_id,
            )
            elapsed = time.monotonic() - start_time
            return RunResult(
                response=response_text,
                run_id=run_id,
                agent_name="orchestrator",
                duration_ms=int(elapsed * 1000),
            )

        # 3. Pre-check credits (agent-only agencies — original path)
        estimate = self.credit_manager.estimate_run_cost(
            agent_count=max(len(agents_data), 1),
        )
        has_credits = await self.credit_manager.pre_check(
            user_id=context.user_id,
            estimated_cost=estimate,
        )
        if not has_credits:
            raise InsufficientCreditsError(
                f"Insufficient credits for estimated cost ${estimate:.4f}"
            )

        # 4. Resolve tools for each agent
        agency_whitelist = await self._load_tool_whitelist(agency_id)
        agent_tools: dict[str, list[type]] = {}
        for agent_data in agents_data:
            tools = await resolve_tools_for_agent(
                db=self.db,
                agent_id=agent_data["id"],
                agency_whitelist=agency_whitelist,
                adapter=self.adapter,
            )
            agent_tools[agent_data["id"]] = tools

        # 5. Create persistence hooks
        load_cb, save_cb = create_persistence_hooks(
            conversation_id=context.conversation_id,
            db_session_factory=AsyncSessionLocal,
        )

        # 6. Construct agents via adapter (with agent-level KB retrieval)
        agents = []
        for agent_data in agents_data:
            agent_instructions = agent_data["instructions"]
            node_config = agent_data.get("node_config") or {}
            if node_config.get("knowledgeBase", {}).get("documentIds"):
                from app.services.agent_knowledge import retrieve_agent_knowledge

                kb_context = await retrieve_agent_knowledge(
                    node_config=node_config,
                    query=message,
                    tenant_id=context.tenant_id,
                    user_id=context.user_id,
                )
                if kb_context:
                    agent_instructions = agent_instructions + kb_context

            agent = self.adapter.create_agent(
                config=AgentConfig(
                    name=agent_data["name"],
                    instructions=agent_instructions,
                    model=agent_data["model"],
                    model_settings=agent_data["model_settings"],
                    tools=agent_tools.get(agent_data["id"], []),
                    is_entry_point=agent_data["is_entry_point"],
                ),
                user_token=context.user_token,
            )
            agents.append(agent)

        # 7. Construct agency via adapter
        agency = self.adapter.create_agency(
            config=agency_config,
            agents=agents,
            persistence_hooks=(load_cb, save_cb),
        )

        # 8. Create run record (status: running)
        await self._insert_running_run_record(
            run_id=run_id,
            agency_id=agency_id,
            context=context,
        )

        # Audit: run started
        log_agency_event(
            "agency_run_started",
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
            metadata={"agent_count": len(agents_data)},
        )

        try:
            # 9. Execute agency
            result = await self.adapter.run(
                agency=agency,
                message=message,
                timeout_seconds=agency_config.max_run_time_seconds,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
            )

            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            normalized = self._normalize_structured_preview_result(
                response_text=result.response,
                run_id=run_id,
                agency_id=agency_id,
                conversation_id=context.conversation_id,
                tenant_id=context.tenant_id,
            )

            result.response = normalized["response"]
            result.structured_result = normalized["structured_result"]
            result.preview_artifacts = [
                self._compact_preview_artifact(artifact)
                for artifact in normalized["preview_artifacts"]
            ]

            # 10. Apply multiplier markup
            # NOTE: total_gateway_cost is 0.0 here because per-call costs are
            # tracked by the Node.js gateway. The reconciliation endpoint
            # (section-06) will sum costs by run_id for accurate markup.
            # TODO(section-06): Replace 0.0 with actual gateway cost from reconciliation.
            await self.credit_manager.apply_multiplier_markup(
                user_id=context.user_id,
                agency_id=agency_id,
                total_gateway_cost=0.0,
                multiplier=agency_config.credit_multiplier,
            )

            # 11. Update run record (status: completed)
            await self._persist_completed_run(
                run_id=run_id,
                completed_at=datetime.now(timezone.utc),
                elapsed_ms=elapsed_ms,
                step_count=result.step_count,
                structured_result=normalized["structured_result"],
                parse_status=normalized["parse_status"],
                parse_intent=normalized["parse_intent"],
                parse_summary=normalized["parse_summary"],
                parse_error=normalized["parse_error"],
                preview_artifacts=normalized["preview_artifacts"],
            )

            logger.info(
                "agency_service_run_completed",
                run_id=run_id,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
                duration_ms=elapsed_ms,
            )

            # Audit: run completed
            log_agency_event(
                "agency_run_completed",
                run_id=run_id,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
                user_id=context.user_id,
                duration_ms=elapsed_ms,
                step_count=result.step_count,
            )

            # Credit reconciliation (gateway cost is 0.0 until reconciliation endpoint is wired)
            await reconcile_credits(
                run_id=run_id,
                gateway_total=0.0,
                run_total_credits=0.0,
            )

            # 12. Settle creator fee (post-run, fire-and-forget)
            if agency_config.creator_fee_credits > 0 and agency_config.creator_id:
                await self.credit_manager.settle_creator_fee(
                    run_id=run_id,
                    agency_id=agency_id,
                    user_id=context.user_id,
                    creator_id=agency_config.creator_id,
                    creator_fee_credits=agency_config.creator_fee_credits,
                    platform_share_pct=agency_config.platform_share_pct,
                    tenant_id=context.tenant_id,
                )

            return result

        except Exception as exc:
            # Update run record (status: failed)
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            try:
                await self._mark_failed_run(run_id=run_id, elapsed_ms=elapsed_ms, exc=exc)
            except Exception:
                logger.error("agency_run_record_update_failed", run_id=run_id)

            # Audit: run failed
            log_agency_event(
                "agency_run_failed",
                run_id=run_id,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
                user_id=context.user_id,
                duration_ms=elapsed_ms,
                error_type=type(exc).__name__,
                error_message=str(exc)[:500],
            )

            raise

    async def execute_run_stream(
        self,
        agency_id: str,
        message: str,
        context: RunContext,
        model_override: str | None = None,
        persona_prefix: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Streaming variant: yields SSE-formatted event dicts.

        Event types: run_started, token, run_finished, run_error.

        """
        run_id = str(uuid.uuid4())
        start_time = time.monotonic()

        try:
            # Load and construct (same as execute_run)
            agency_config = await self.load_agency(agency_id, context.tenant_id)
            agency_config.user_id = context.user_id
            agency_config.conversation_id = context.conversation_id

            agents_data = await self._load_agents(agency_id)

            # Orchestrator path for non-agent nodes (streaming: emit as single token event)
            if should_use_orchestrator(agents_data):
                logger.info("agency_run_stream_orchestrator_path", agency_id=agency_id)
                yield {"event": "run_started", "data": {"run_id": run_id}}
                edges_data = await self._load_flows_full(agency_id)
                orchestrator = AgencyOrchestrator(
                    nodes=agents_data,
                    edges=edges_data,
                    adapter=self.adapter,
                    db=self.db,
                    agency_config=agency_config,
                )
                response_text = await orchestrator.run(
                    message=message,
                    user_token=context.user_token,
                    tenant_id=context.tenant_id,
                    user_id=context.user_id,
                )
                yield {"event": "token", "data": {"token": response_text}}
                yield {"event": "run_finished", "data": {"run_id": run_id, "response": response_text}}
                return

            agency_whitelist = await self._load_tool_whitelist(agency_id)
            agent_tools: dict[str, list[type]] = {}
            for agent_data in agents_data:
                tools = await resolve_tools_for_agent(
                    db=self.db,
                    agent_id=agent_data["id"],
                    agency_whitelist=agency_whitelist,
                    adapter=self.adapter,
                )
                agent_tools[agent_data["id"]] = tools

            load_cb, save_cb = create_persistence_hooks(
                conversation_id=context.conversation_id,
                db_session_factory=AsyncSessionLocal,
            )

            agents = []
            for agent_data in agents_data:
                agent_instructions = agent_data["instructions"]
                node_config = agent_data.get("node_config") or {}
                if node_config.get("knowledgeBase", {}).get("documentIds"):
                    from app.services.agent_knowledge import retrieve_agent_knowledge

                    kb_context = await retrieve_agent_knowledge(
                        node_config=node_config,
                        query=message,
                        tenant_id=context.tenant_id,
                        user_id=context.user_id,
                    )
                    if kb_context:
                        agent_instructions = agent_instructions + kb_context

                run_config = {"persona_prefix": persona_prefix} if persona_prefix else None
                agent = self.adapter.create_agent(
                    config=AgentConfig(
                        name=agent_data["name"],
                        instructions=agent_instructions,
                        model=model_override or agent_data["model"],
                        model_settings=agent_data["model_settings"],
                        tools=agent_tools.get(agent_data["id"], []),
                        is_entry_point=agent_data["is_entry_point"],
                    ),
                    user_token=context.user_token,
                    run_config=run_config,
                )
                agents.append(agent)

            agency = self.adapter.create_agency(
                config=agency_config,
                agents=agents,
                persistence_hooks=(load_cb, save_cb),
            )

            await self._insert_running_run_record(
                run_id=run_id,
                agency_id=agency_id,
                context=context,
            )

            yield {"event": "run_started", "data": {"run_id": run_id, "agency_id": agency_id}}

            # Get streaming response
            stream = self.adapter.run_stream(
                agency=agency,
                message=message,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
            )

            # Iterate stream events (StreamingRunResponse is an async iterable)
            current_agent_name = ""
            event_count = 0
            token_count = 0
            response_parts: list[str] = []
            async for event in stream:
                event_count += 1
                etype = getattr(event, "type", "")

                # Debug: log every event type for diagnosis
                if isinstance(event, dict):
                    logger.info(
                        "agency_stream_event_dict",
                        event_num=event_count,
                        keys=list(event.keys()),
                        event_type=event.get("type", "?"),
                    )
                else:
                    logger.info(
                        "agency_stream_event",
                        event_num=event_count,
                        event_type=etype,
                        event_class=type(event).__name__,
                    )

                if etype == "raw_response_event":
                    # Extract text delta from OpenAI response stream events
                    raw = event.data
                    raw_type = getattr(raw, "type", "")
                    logger.info(
                        "agency_raw_event",
                        raw_type=raw_type,
                        raw_class=type(raw).__name__,
                        has_delta=hasattr(raw, "delta"),
                    )
                    if raw_type == "response.output_text.delta":
                        delta = getattr(raw, "delta", "")
                        if delta:
                            token_count += 1
                            response_parts.append(delta)
                            yield {"event": "token", "data": {"token": delta, "agent_name": current_agent_name}}

                elif etype == "run_item_stream_event":
                    item_name = getattr(event, "name", "")
                    logger.info("agency_run_item_event", item_name=item_name)
                    if item_name == "handoff_occured":
                        # Agent handoff — extract target agent name
                        item = getattr(event, "item", None)
                        target = getattr(item, "target_agent", None)
                        agent_name = getattr(target, "name", "") if target else ""
                        if agent_name:
                            current_agent_name = agent_name
                            yield {"event": "agent_switch", "data": {"agent_name": agent_name}}
                    elif item_name == "tool_called":
                        item = getattr(event, "item", None)
                        tool_name = getattr(item, "name", "") if item else ""
                        yield {"event": "tool_call", "data": {"tool_name": tool_name, "agent_name": current_agent_name}}
                    elif item_name == "tool_output":
                        item = getattr(event, "item", None)
                        output = getattr(item, "output", "") if item else ""
                        yield {"event": "tool_result", "data": {"result": str(output)[:500], "agent_name": current_agent_name}}
                    elif item_name == "message_output_created":
                        # Final message output — may contain the complete text
                        item = getattr(event, "item", None)
                        if item:
                            raw_item = getattr(item, "raw_item", None)
                            if raw_item:
                                content_parts = getattr(raw_item, "content", [])
                                for part in content_parts:
                                    text = getattr(part, "text", "")
                                    if text and token_count == 0:
                                        # Only use message_output if we got no deltas
                                        response_parts.append(text)
                                        yield {"event": "token", "data": {"token": text, "agent_name": current_agent_name}}

                elif etype == "agent_updated_stream_event":
                    new_agent = getattr(event, "new_agent", None)
                    agent_name = getattr(new_agent, "name", "") if new_agent else ""
                    if agent_name and agent_name != current_agent_name:
                        current_agent_name = agent_name
                        yield {"event": "agent_switch", "data": {"agent_name": agent_name}}

            logger.info(
                "agency_stream_completed",
                total_events=event_count,
                tokens_yielded=token_count,
            )

            normalized = self._normalize_structured_preview_result(
                response_text="".join(response_parts),
                run_id=run_id,
                agency_id=agency_id,
                conversation_id=context.conversation_id,
                tenant_id=context.tenant_id,
            )
            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            await self.credit_manager.apply_multiplier_markup(
                user_id=context.user_id,
                agency_id=agency_id,
                total_gateway_cost=0.0,
                multiplier=agency_config.credit_multiplier,
            )

            await self._persist_completed_run(
                run_id=run_id,
                completed_at=datetime.now(timezone.utc),
                elapsed_ms=elapsed_ms,
                step_count=event_count,
                structured_result=normalized["structured_result"],
                parse_status=normalized["parse_status"],
                parse_intent=normalized["parse_intent"],
                parse_summary=normalized["parse_summary"],
                parse_error=normalized["parse_error"],
                preview_artifacts=normalized["preview_artifacts"],
            )

            if normalized["preview_artifacts"]:
                first_artifact = normalized["preview_artifacts"][0]
                yield {
                    "event": "preview_ready",
                    "data": {
                        "run_id": run_id,
                        "preview_artifact_ids": [
                            artifact["id"] for artifact in normalized["preview_artifacts"]
                        ],
                        "intent": first_artifact["intent"],
                        "summary": first_artifact["summary"],
                    },
                }

            yield {"event": "run_finished", "data": {"run_id": run_id}}

            # Settle creator fee (post-run, fire-and-forget)
            if agency_config.creator_fee_credits > 0 and agency_config.creator_id:
                await self.credit_manager.settle_creator_fee(
                    run_id=run_id,
                    agency_id=agency_id,
                    user_id=context.user_id,
                    creator_id=agency_config.creator_id,
                    creator_fee_credits=agency_config.creator_fee_credits,
                    platform_share_pct=agency_config.platform_share_pct,
                    tenant_id=context.tenant_id,
                )

        except Exception as exc:
            logger.error(
                "agency_service_stream_failed",
                run_id=run_id,
                agency_id=agency_id,
                error=str(exc),
            )
            try:
                await self._mark_failed_run(
                    run_id=run_id,
                    elapsed_ms=int((time.monotonic() - start_time) * 1000),
                    exc=exc,
                )
            except Exception:
                logger.error("agency_run_stream_record_update_failed", run_id=run_id)
            yield {
                "event": "run_error",
                "data": {
                    "error_type": type(exc).__name__,
                    "message": "An error occurred during the agency run.",
                },
            }

    async def list_runs(
        self,
        agency_id: str,
        tenant_id: str,
        limit: int = 20,
        offset: int = 0,
        status_filter: str | None = None,
    ) -> dict:
        """List runs for an agency filtered by tenant.

        Returns dict with 'runs' list and 'total' count.
        status_filter is pre-validated as AgencyRunStatus enum at the API layer.
        """
        params: dict = {
            "agency_id": agency_id,
            "tenant_id": tenant_id,
            "limit": limit,
            "offset": offset,
        }

        # Use a single parameterized query with optional status filter.
        # The :status_filter param is always bound; NULL means "no filter".
        status_value = status_filter.value if hasattr(status_filter, "value") else status_filter
        params["status_filter"] = status_value

        # Count
        count_result = await self.db.execute(
            text(
                "SELECT count(*) FROM agency_runs "
                "WHERE agency_id = :agency_id AND tenant_id = :tenant_id "
                "AND (:status_filter IS NULL OR status = :status_filter)"
            ),
            params,
        )
        total = count_result.scalar() or 0

        # Fetch
        result = await self.db.execute(
            text(
                "SELECT id, status, "
                "       COALESCE(total_credits_used, 0) as total_credits_used, "
                "       started_at, completed_at, duration_ms, "
                "       error_type, error_message, "
                "       COALESCE(step_count, 0) as step_count "
                "FROM agency_runs "
                "WHERE agency_id = :agency_id AND tenant_id = :tenant_id "
                "AND (:status_filter IS NULL OR status = :status_filter) "
                "ORDER BY started_at DESC NULLS LAST "
                "LIMIT :limit OFFSET :offset"
            ),
            params,
        )

        runs = [
            {
                "id": row.id,
                "status": row.status,
                "total_credits_used": float(row.total_credits_used),
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "completed_at": row.completed_at.isoformat() if row.completed_at else None,
                "duration_ms": row.duration_ms,
                "error_type": row.error_type,
                "error_message": row.error_message,
                "step_count": row.step_count,
            }
            for row in result.all()
        ]

        return {"runs": runs, "total": total}

    async def get_run(
        self,
        run_id: str,
        agency_id: str,
        tenant_id: str,
    ) -> dict:
        """Get a single run by ID, scoped to agency and tenant.

        Raises AgencyNotFoundError if not found or wrong tenant.
        """
        result = await self.db.execute(
            text("""
                SELECT id, status,
                       COALESCE(total_credits_used, 0) as total_credits_used,
                       started_at, completed_at, duration_ms,
                       error_type, error_message,
                       COALESCE(step_count, 0) as step_count,
                       structured_result,
                       structured_result_parse_status,
                       structured_result_intent,
                       structured_result_summary,
                       structured_result_error,
                       conversation_id
                FROM agency_runs
                WHERE id = :run_id
                  AND agency_id = :agency_id
                  AND tenant_id = :tenant_id
            """),
            {"run_id": run_id, "agency_id": agency_id, "tenant_id": tenant_id},
        )
        row = result.first()
        if not row:
            raise AgencyNotFoundError(f"Run {run_id} not found")

        response_result = await self.db.execute(
            text("""
                SELECT content
                FROM agency_messages
                WHERE conversation_id = :conversation_id
                  AND role = 'assistant'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"conversation_id": row.conversation_id},
        )
        response_row = response_result.first()

        artifacts_result = await self.db.execute(
            text("""
                SELECT id, intent, artifact_type, state, summary,
                       payload_json, payload_storage_key, provenance_json,
                       commit_status, commit_token, target_type, target_id,
                       committed_at, expired_at
                FROM agency_run_artifacts
                WHERE run_id = :run_id
                ORDER BY created_at ASC
            """),
            {"run_id": run_id},
        )

        return {
            "id": row.id,
            "conversation_id": row.conversation_id,
            "status": row.status,
            "total_credits_used": float(row.total_credits_used),
            "started_at": row.started_at.isoformat() if row.started_at else None,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "duration_ms": row.duration_ms,
            "error_type": row.error_type,
            "error_message": row.error_message,
            "step_count": row.step_count,
            "response": response_row.content if response_row else "",
            "output": response_row.content if response_row else "",
            "structured_result": self._json_value(row.structured_result),
            "structured_result_parse_status": row.structured_result_parse_status,
            "structured_result_intent": row.structured_result_intent,
            "structured_result_summary": row.structured_result_summary,
            "structured_result_error": row.structured_result_error,
            "preview_artifacts": [
                {
                    "id": artifact.id,
                    "intent": artifact.intent,
                    "artifact_type": artifact.artifact_type,
                    "state": artifact.state,
                    "summary": artifact.summary,
                    "payload_json": self._json_value(artifact.payload_json),
                    "payload_storage_key": artifact.payload_storage_key,
                    "provenance_json": self._json_value(artifact.provenance_json),
                    "commit_status": artifact.commit_status,
                    "commit_token": artifact.commit_token,
                    "target_type": artifact.target_type,
                    "target_id": artifact.target_id,
                    "committed_at": artifact.committed_at.isoformat() if artifact.committed_at else None,
                    "expired_at": artifact.expired_at.isoformat() if artifact.expired_at else None,
                }
                for artifact in artifacts_result.all()
            ],
        }

    async def cancel_run(
        self,
        run_id: str,
        agency_id: str,
        tenant_id: str,
    ) -> dict:
        """Cancel a running agency run.

        Raises AgencyNotFoundError if run not found or wrong tenant.
        """
        result = await self.db.execute(
            text("""
                SELECT id, status FROM agency_runs
                WHERE id = :run_id
                  AND agency_id = :agency_id
                  AND tenant_id = :tenant_id
            """),
            {"run_id": run_id, "agency_id": agency_id, "tenant_id": tenant_id},
        )
        row = result.first()
        if not row:
            raise AgencyNotFoundError(f"Run {run_id} not found")

        if row.status in ("completed", "failed", "cancelled"):
            return {"run_id": run_id, "status": row.status}

        await self.db.execute(
            text("""
                UPDATE agency_runs
                SET status = 'cancelled',
                    completed_at = :completed_at
                WHERE id = :run_id
            """),
            {
                "run_id": run_id,
                "completed_at": datetime.now(timezone.utc),
            },
        )
        await self.db.commit()

        logger.info(
            "agency_run_cancelled",
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=tenant_id,
        )

        return {"run_id": run_id, "status": "cancelled"}
