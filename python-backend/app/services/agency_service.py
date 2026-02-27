"""
Agency Service -- lifecycle management for agency runs.

Orchestrates: load config -> construct agents -> pre-check credits ->
execute run -> apply multiplier markup -> record results.

Agency objects are instantiated per-request (never reused).
"""

import uuid
import time
from datetime import datetime, timezone
from typing import AsyncIterator

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
from app.services.agency_tools import resolve_tools_for_agent

logger = structlog.get_logger(__name__)


# ── Exceptions ─────────────────────────────────────────────────────


class AgencyNotFoundError(Exception):
    """Raised when agency does not exist."""


class AgencyPermissionError(Exception):
    """Raised when user/tenant does not have access to agency."""


class InsufficientCreditsError(Exception):
    """Raised when user lacks credits for estimated run cost."""


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

    def __init__(self, db: AsyncSession):
        self.db = db
        self.adapter = AgencySwarmAdapter()
        self.credit_manager = AgencyCreditManager(
            gateway_url=settings.SMARTSPEC_WEB_GATEWAY_URL or "",
            gateway_token=settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "",
        )

    async def load_agency(self, agency_id: str, tenant_id: str) -> AgencyConfig:
        """Load agency definition from PostgreSQL via read-only queries.

        Raises:
            AgencyNotFoundError: If agency does not exist.
            AgencyPermissionError: If agency belongs to different tenant.
        """
        result = await self.db.execute(
            text("""
                SELECT id, "tenantId" as tenant_id, name, description,
                       "systemPrompt" as system_prompt,
                       "creditMultiplier" as credit_multiplier,
                       "maxRunTimeSeconds" as max_run_time_seconds,
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

        # Load agents
        agents_data = await self._load_agents(agency_id)

        # Load communication flows
        flows_data = await self._load_flows(agency_id)

        config = AgencyConfig(
            agency_id=row.id,
            name=row.name,
            system_prompt=row.system_prompt or "",
            communication_flows=flows_data,
            tenant_id=row.tenant_id,
            user_id=0,  # Set by caller from RunContext
            conversation_id="",  # Set by caller from RunContext
            max_run_time_seconds=row.max_run_time_seconds or 600,
        )
        # Store multiplier on config for use during run (avoids extra DB query)
        config._credit_multiplier = float(row.credit_multiplier or "1.00")  # type: ignore[attr-defined]
        return config

    async def _load_agents(self, agency_id: str) -> list[dict]:
        """Load agent definitions for an agency."""
        result = await self.db.execute(
            text("""
                SELECT id, name, instructions, model, "modelSettings" as model_settings,
                       "isEntryPoint" as is_entry_point
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
            }
            for row in result.all()
        ]

    async def _load_flows(self, agency_id: str) -> list[tuple[str, str]]:
        """Load communication flows as (from_name, to_name) tuples."""
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

        # 1. Load agency config
        agency_config = await self.load_agency(agency_id, context.tenant_id)
        agency_config.user_id = context.user_id
        agency_config.conversation_id = context.conversation_id

        # 2. Load agent definitions
        agents_data = await self._load_agents(agency_id)

        # 3. Pre-check credits
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
        agent_tools: dict[str, list[type]] = {}
        for agent_data in agents_data:
            tools = await resolve_tools_for_agent(
                db=self.db,
                agent_id=agent_data["id"],
                agency_whitelist=set(),  # TODO: load whitelist from agency config
            )
            agent_tools[agent_data["id"]] = tools

        # 5. Create persistence hooks
        load_cb, save_cb = create_persistence_hooks(
            conversation_id=context.conversation_id,
            db_session_factory=AsyncSessionLocal,
        )

        # 6. Construct agents via adapter
        agents = []
        for agent_data in agents_data:
            agent = self.adapter.create_agent(
                config=AgentConfig(
                    name=agent_data["name"],
                    instructions=agent_data["instructions"],
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

            # 10. Apply multiplier markup (stored from load_agency)
            multiplier = getattr(agency_config, "_credit_multiplier", 1.0)

            await self.credit_manager.apply_multiplier_markup(
                user_id=context.user_id,
                agency_id=agency_id,
                total_gateway_cost=0.0,  # Tracked by gateway per-call
                multiplier=multiplier,
            )

            # 11. Update run record (status: completed)
            await self.db.execute(
                text("""
                    UPDATE agency_runs
                    SET status = 'completed',
                        completed_at = :completed_at,
                        duration_ms = :duration_ms,
                        step_count = :step_count
                    WHERE id = :id
                """),
                {
                    "id": run_id,
                    "completed_at": datetime.now(timezone.utc),
                    "duration_ms": elapsed_ms,
                    "step_count": result.step_count,
                },
            )
            await self.db.commit()

            logger.info(
                "agency_service_run_completed",
                run_id=run_id,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
                duration_ms=elapsed_ms,
            )

            return result

        except Exception as exc:
            # Update run record (status: failed)
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            try:
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
            except Exception:
                logger.error("agency_run_record_update_failed", run_id=run_id)

            raise

    async def execute_run_stream(
        self,
        agency_id: str,
        message: str,
        context: RunContext,
    ) -> AsyncIterator[dict]:
        """Streaming variant: yields SSE-formatted event dicts.

        Event types: run_started, agent_switch, token, tool_call,
        tool_result, run_finished, run_error, heartbeat.
        """
        run_id = str(uuid.uuid4())

        try:
            # Load and construct (same as execute_run)
            agency_config = await self.load_agency(agency_id, context.tenant_id)
            agency_config.user_id = context.user_id
            agency_config.conversation_id = context.conversation_id

            agents_data = await self._load_agents(agency_id)

            agent_tools: dict[str, list[type]] = {}
            for agent_data in agents_data:
                tools = await resolve_tools_for_agent(
                    db=self.db,
                    agent_id=agent_data["id"],
                    agency_whitelist=set(),
                )
                agent_tools[agent_data["id"]] = tools

            load_cb, save_cb = create_persistence_hooks(
                conversation_id=context.conversation_id,
                db_session_factory=AsyncSessionLocal,
            )

            agents = []
            for agent_data in agents_data:
                agent = self.adapter.create_agent(
                    config=AgentConfig(
                        name=agent_data["name"],
                        instructions=agent_data["instructions"],
                        model=agent_data["model"],
                        model_settings=agent_data["model_settings"],
                        tools=agent_tools.get(agent_data["id"], []),
                        is_entry_point=agent_data["is_entry_point"],
                    ),
                    user_token=context.user_token,
                )
                agents.append(agent)

            agency = self.adapter.create_agency(
                config=agency_config,
                agents=agents,
                persistence_hooks=(load_cb, save_cb),
            )

            yield {"event": "run_started", "data": {"run_id": run_id, "agency_id": agency_id}}

            # Get streaming response
            stream = self.adapter.run_stream(
                agency=agency,
                message=message,
                agency_id=agency_id,
                tenant_id=context.tenant_id,
            )

            # Iterate stream events
            for event in stream:
                yield {"event": "token", "data": {"delta": str(event)}}

            yield {"event": "run_finished", "data": {"run_id": run_id}}

        except Exception as exc:
            logger.error(
                "agency_service_stream_failed",
                run_id=run_id,
                agency_id=agency_id,
                error=str(exc),
            )
            yield {
                "event": "run_error",
                "data": {"error_type": type(exc).__name__, "message": str(exc)[:500]},
            }
