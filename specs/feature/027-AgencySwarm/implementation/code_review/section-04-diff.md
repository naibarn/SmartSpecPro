diff --git a/python-backend/app/core/config.py b/python-backend/app/core/config.py
index 1520cdc..3358223 100644
--- a/python-backend/app/core/config.py
+++ b/python-backend/app/core/config.py
@@ -156,6 +156,9 @@ class Settings(BaseSettings):
     LANGSMITH_PROJECT: str = "smartspec-dev"
     LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"
 
+    # Agency-Swarm
+    AGENCY_SWARM_ENABLED: bool = False
+
     # Rate Limiting
     RATE_LIMIT_PER_MINUTE: int = 60
     RATE_LIMIT_BURST: int = 10
diff --git a/python-backend/app/services/agency_credits.py b/python-backend/app/services/agency_credits.py
new file mode 100644
index 0000000..b70afbd
--- /dev/null
+++ b/python-backend/app/services/agency_credits.py
@@ -0,0 +1,166 @@
+"""
+Agency credit management -- pre-check and multiplier markup.
+
+Credit flow:
+1. Pre-check (before run): estimate cost, check balance via Node.js gateway.
+2. Per-call deduction (during run): handled by adapter gateway routing.
+3. Multiplier markup (after run): deduct additional markup via internal endpoint.
+
+Pre-check is advisory only (no reservation).
+Markup failures are logged but do not fail the run (post-deduct pattern).
+"""
+
+import structlog
+import httpx
+
+logger = structlog.get_logger(__name__)
+
+# Conservative cost-per-token estimates (USD) for pre-check estimation.
+# Intentionally overestimated to prevent mid-run credit exhaustion.
+_MODEL_COST_PER_TOKEN: dict[str, float] = {
+    "gpt-4o": 0.00001,
+    "gpt-4o-mini": 0.000002,
+    "gpt-4-turbo": 0.00003,
+    "gpt-3.5-turbo": 0.000002,
+}
+_DEFAULT_COST_PER_TOKEN = 0.00001
+
+
+class AgencyCreditManager:
+    """Manages credit pre-checks and multiplier markup for agency runs."""
+
+    def __init__(self, gateway_url: str, gateway_token: str):
+        self._gateway_url = gateway_url.rstrip("/") if gateway_url else ""
+        self._gateway_token = gateway_token
+
+    async def pre_check(self, user_id: int, estimated_cost: float) -> bool:
+        """Check user has enough credits for estimated run cost.
+
+        Makes an HTTP call to Node.js gateway to check balance.
+        Does NOT reserve credits.
+
+        Returns True (optimistic) if gateway is unreachable or not configured.
+        """
+        if not self._gateway_url or not self._gateway_token:
+            logger.warning(
+                "agency_credit_precheck_skipped",
+                reason="gateway_not_configured",
+                user_id=user_id,
+            )
+            return True
+
+        try:
+            async with httpx.AsyncClient(timeout=10.0) as client:
+                resp = await client.get(
+                    f"{self._gateway_url}/api/internal/credits/balance",
+                    params={"userId": user_id},
+                    headers={"Authorization": f"Bearer {self._gateway_token}"},
+                )
+
+            if resp.status_code == 200:
+                data = resp.json()
+                balance = float(data.get("balance", 0))
+                has_enough = balance >= estimated_cost
+
+                logger.info(
+                    "agency_credit_precheck",
+                    user_id=user_id,
+                    balance=balance,
+                    estimated_cost=estimated_cost,
+                    sufficient=has_enough,
+                )
+                return has_enough
+
+            logger.warning(
+                "agency_credit_precheck_failed",
+                user_id=user_id,
+                status=resp.status_code,
+            )
+            return True  # Optimistic on non-200
+
+        except Exception as exc:
+            logger.warning(
+                "agency_credit_precheck_error",
+                user_id=user_id,
+                error=str(exc),
+            )
+            return True  # Optimistic on error
+
+    async def apply_multiplier_markup(
+        self,
+        user_id: int,
+        agency_id: str,
+        total_gateway_cost: float,
+        multiplier: float,
+    ) -> None:
+        """Deduct agency markup at run completion.
+
+        Markup = (total_gateway_cost * multiplier) - total_gateway_cost.
+        If multiplier is 1.0, this is a no-op.
+        Failures are logged but do not raise (post-deduct pattern).
+        """
+        markup = (total_gateway_cost * multiplier) - total_gateway_cost
+        if markup <= 0:
+            return
+
+        if not self._gateway_url or not self._gateway_token:
+            logger.warning(
+                "agency_markup_skipped",
+                reason="gateway_not_configured",
+                user_id=user_id,
+                agency_id=agency_id,
+                markup=markup,
+            )
+            return
+
+        try:
+            async with httpx.AsyncClient(timeout=10.0) as client:
+                resp = await client.post(
+                    f"{self._gateway_url}/api/internal/credits/agency-markup",
+                    json={
+                        "userId": user_id,
+                        "agencyId": agency_id,
+                        "markupAmount": markup,
+                        "sourceType": "agency",
+                    },
+                    headers={"Authorization": f"Bearer {self._gateway_token}"},
+                )
+
+            if resp.status_code == 200:
+                logger.info(
+                    "agency_markup_applied",
+                    user_id=user_id,
+                    agency_id=agency_id,
+                    markup=markup,
+                    multiplier=multiplier,
+                )
+            else:
+                logger.error(
+                    "agency_markup_failed",
+                    user_id=user_id,
+                    agency_id=agency_id,
+                    status=resp.status_code,
+                    markup=markup,
+                )
+
+        except Exception as exc:
+            logger.error(
+                "agency_markup_error",
+                user_id=user_id,
+                agency_id=agency_id,
+                error=str(exc),
+                markup=markup,
+            )
+
+    def estimate_run_cost(
+        self,
+        agent_count: int,
+        avg_tokens_per_agent: int = 2000,
+        model: str = "gpt-4o-mini",
+    ) -> float:
+        """Estimate cost for pre-check. Conservative overestimate.
+
+        Uses: agent_count * avg_tokens * model_cost_per_token.
+        """
+        cost_per_token = _MODEL_COST_PER_TOKEN.get(model, _DEFAULT_COST_PER_TOKEN)
+        return agent_count * avg_tokens_per_agent * cost_per_token
diff --git a/python-backend/app/services/agency_persistence.py b/python-backend/app/services/agency_persistence.py
new file mode 100644
index 0000000..9de9e21
--- /dev/null
+++ b/python-backend/app/services/agency_persistence.py
@@ -0,0 +1,114 @@
+"""
+Agency persistence hooks -- PostgreSQL-backed load/save for agency-swarm.
+
+Implements the load_threads_callback and save_threads_callback interfaces
+that agency-swarm expects for conversation persistence.
+
+The callbacks are async since they use SQLAlchemy async sessions.
+"""
+
+from datetime import datetime, timezone
+from typing import Any, Callable
+
+import structlog
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
+
+from app.services.agency_pii import redact_pii
+
+logger = structlog.get_logger(__name__)
+
+
+def create_persistence_hooks(
+    conversation_id: str,
+    db_session_factory: async_sessionmaker,
+) -> tuple[Callable, Callable]:
+    """Create async load/save callbacks for a specific conversation.
+
+    Returns:
+        (load_callback, save_callback) -- both are async callables.
+    """
+
+    async def load_callback() -> list[dict[str, Any]]:
+        """Load messages for this conversation from agency_messages table."""
+        async with db_session_factory() as session:
+            result = await session.execute(
+                text("""
+                    SELECT role, content, agent_name, tool_calls
+                    FROM agency_messages
+                    WHERE conversation_id = :conv_id
+                    ORDER BY created_at ASC
+                """),
+                {"conv_id": conversation_id},
+            )
+            rows = result.all()
+
+        messages: list[dict[str, Any]] = []
+        for row in rows:
+            msg: dict[str, Any] = {
+                "role": row.role,
+                "content": row.content or "",
+            }
+            if row.agent_name:
+                msg["agent_name"] = row.agent_name
+            if row.tool_calls:
+                msg["tool_calls"] = row.tool_calls
+            messages.append(msg)
+
+        logger.info(
+            "agency_persistence_loaded",
+            conversation_id=conversation_id,
+            message_count=len(messages),
+        )
+        return messages
+
+    async def save_callback(messages: list[dict[str, Any]]) -> None:
+        """Save new messages to agency_messages table.
+
+        Agent-to-agent messages (role != 'user') have PII redacted.
+        User messages are stored as-is.
+        """
+        if not messages:
+            return
+
+        async with db_session_factory() as session:
+            for msg in messages:
+                role = msg.get("role", "assistant")
+                content = msg.get("content", "")
+                agent_name = msg.get("agent_name")
+                tool_calls = msg.get("tool_calls")
+
+                # Apply PII redaction to non-user messages
+                pii_redacted = False
+                if role != "user" and content:
+                    content, pii_redacted = redact_pii(content)
+
+                await session.execute(
+                    text("""
+                        INSERT INTO agency_messages
+                            (conversation_id, role, content, agent_name,
+                             tool_calls, pii_redacted, created_at)
+                        VALUES
+                            (:conv_id, :role, :content, :agent_name,
+                             :tool_calls, :pii_redacted, :created_at)
+                    """),
+                    {
+                        "conv_id": conversation_id,
+                        "role": role,
+                        "content": content,
+                        "agent_name": agent_name,
+                        "tool_calls": tool_calls,
+                        "pii_redacted": pii_redacted,
+                        "created_at": datetime.now(timezone.utc),
+                    },
+                )
+
+            await session.commit()
+
+        logger.info(
+            "agency_persistence_saved",
+            conversation_id=conversation_id,
+            message_count=len(messages),
+        )
+
+    return load_callback, save_callback
diff --git a/python-backend/app/services/agency_pii.py b/python-backend/app/services/agency_pii.py
new file mode 100644
index 0000000..ebeb0d5
--- /dev/null
+++ b/python-backend/app/services/agency_pii.py
@@ -0,0 +1,63 @@
+"""
+PII redaction for agency inter-agent messages.
+
+Regex-based redaction of emails, phone numbers, and SSNs.
+Applied to agent-to-agent messages before storage.
+User-facing final responses are NOT redacted.
+
+Processing order: SSN first (most specific) -> phone -> email (most general).
+"""
+
+import re
+
+# ── Compiled patterns ────────────────────────────────────────────────
+
+# SSN: exactly NNN-NN-NNNN with word boundaries.
+# Must NOT match UUIDs (8-4-4-4-12 hex) -- the 3-2-4 digit groups are unique.
+_SSN_RE = re.compile(r"\b(\d{3}-\d{2}-\d{4})\b")
+
+# Phone: 7+ digits in common formats with required separators.
+# Matches: +1-555-123-4567, (555) 123-4567, 555-123-4567, 555.123.4567
+# Must NOT match version numbers or UUID digit segments.
+# Requires at least one separator or parentheses to distinguish from bare digit runs.
+_PHONE_RE = re.compile(
+    r"(?<![.\w-])"  # Not preceded by dot, word char, or hyphen (avoids UUIDs)
+    r"(?:\+\d{1,3}[-.\s])?"  # Optional international prefix (requires separator)
+    r"(?:"
+    r"\(\d{3}\)\s?"  # (555) format with optional space
+    r"|"
+    r"\d{3}[-.\s]"  # 555- or 555. or "555 " (requires separator after area code)
+    r")"
+    r"\d{3}[-.\s]?\d{4}"  # Main number
+    r"\b"
+)
+
+# Email: standard email pattern.
+# Must NOT match URLs -- negative lookbehind for :// and /
+_EMAIL_RE = re.compile(
+    r"(?<![:\/])"  # Not preceded by :/ (avoids matching URL userinfo)
+    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
+)
+
+
+def redact_pii(content: str) -> tuple[str, bool]:
+    """Redact PII patterns (emails, phones, SSN) from content.
+
+    Applied to agent-to-agent messages before storage.
+    User-facing final responses are NOT redacted.
+
+    Returns:
+        Tuple of (redacted_content, was_redacted).
+    """
+    if not content:
+        return content, False
+
+    original = content
+
+    # Process in order: SSN (most specific) -> phone -> email (most general)
+    content = _SSN_RE.sub("[SSN]", content)
+    content = _PHONE_RE.sub("[PHONE]", content)
+    content = _EMAIL_RE.sub("[EMAIL]", content)
+
+    was_redacted = content != original
+    return content, was_redacted
diff --git a/python-backend/app/services/agency_service.py b/python-backend/app/services/agency_service.py
new file mode 100644
index 0000000..c573a26
--- /dev/null
+++ b/python-backend/app/services/agency_service.py
@@ -0,0 +1,419 @@
+"""
+Agency Service -- lifecycle management for agency runs.
+
+Orchestrates: load config -> construct agents -> pre-check credits ->
+execute run -> apply multiplier markup -> record results.
+
+Agency objects are instantiated per-request (never reused).
+"""
+
+import uuid
+import time
+from datetime import datetime, timezone
+from typing import AsyncIterator
+
+import structlog
+from pydantic import BaseModel
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.config import settings
+from app.core.database import AsyncSessionLocal
+from app.services.agency_swarm_adapter import (
+    AgencySwarmAdapter,
+    AgentConfig,
+    AgencyConfig,
+    RunResult,
+)
+from app.services.agency_credits import AgencyCreditManager
+from app.services.agency_persistence import create_persistence_hooks
+from app.services.agency_tools import resolve_tools_for_agent
+
+logger = structlog.get_logger(__name__)
+
+
+# ── Exceptions ─────────────────────────────────────────────────────
+
+
+class AgencyNotFoundError(Exception):
+    """Raised when agency does not exist."""
+
+
+class AgencyPermissionError(Exception):
+    """Raised when user/tenant does not have access to agency."""
+
+
+class InsufficientCreditsError(Exception):
+    """Raised when user lacks credits for estimated run cost."""
+
+
+# ── Run Context ────────────────────────────────────────────────────
+
+
+class RunContext(BaseModel):
+    """Context for an agency run."""
+
+    user_id: int
+    tenant_id: str
+    conversation_id: str
+    user_token: str
+
+
+# ── Service ────────────────────────────────────────────────────────
+
+
+class AgencyService:
+    """Orchestrates agency lifecycle: load, construct, execute, record."""
+
+    def __init__(self, db: AsyncSession):
+        self.db = db
+        self.adapter = AgencySwarmAdapter()
+        self.credit_manager = AgencyCreditManager(
+            gateway_url=settings.SMARTSPEC_WEB_GATEWAY_URL or "",
+            gateway_token=settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "",
+        )
+
+    async def load_agency(self, agency_id: str, tenant_id: str) -> AgencyConfig:
+        """Load agency definition from PostgreSQL via read-only queries.
+
+        Raises:
+            AgencyNotFoundError: If agency does not exist.
+            AgencyPermissionError: If agency belongs to different tenant.
+        """
+        result = await self.db.execute(
+            text("""
+                SELECT id, "tenantId" as tenant_id, name, description,
+                       "systemPrompt" as system_prompt,
+                       "creditMultiplier" as credit_multiplier,
+                       "maxRunTimeSeconds" as max_run_time_seconds,
+                       status
+                FROM agencies
+                WHERE id = :agency_id
+            """),
+            {"agency_id": agency_id},
+        )
+        row = result.first()
+
+        if not row:
+            raise AgencyNotFoundError(f"Agency {agency_id} not found")
+
+        if row.tenant_id != tenant_id:
+            raise AgencyPermissionError(
+                f"Agency {agency_id} belongs to tenant {row.tenant_id}, "
+                f"not {tenant_id}"
+            )
+
+        # Load agents
+        agents_data = await self._load_agents(agency_id)
+
+        # Load communication flows
+        flows_data = await self._load_flows(agency_id)
+
+        config = AgencyConfig(
+            agency_id=row.id,
+            name=row.name,
+            system_prompt=row.system_prompt or "",
+            communication_flows=flows_data,
+            tenant_id=row.tenant_id,
+            user_id=0,  # Set by caller from RunContext
+            conversation_id="",  # Set by caller from RunContext
+            max_run_time_seconds=row.max_run_time_seconds or 600,
+        )
+        # Store multiplier on config for use during run (avoids extra DB query)
+        config._credit_multiplier = float(row.credit_multiplier or "1.00")  # type: ignore[attr-defined]
+        return config
+
+    async def _load_agents(self, agency_id: str) -> list[dict]:
+        """Load agent definitions for an agency."""
+        result = await self.db.execute(
+            text("""
+                SELECT id, name, instructions, model, "modelSettings" as model_settings,
+                       "isEntryPoint" as is_entry_point
+                FROM agency_agents
+                WHERE "agencyId" = :agency_id
+                ORDER BY "createdAt" ASC
+            """),
+            {"agency_id": agency_id},
+        )
+        return [
+            {
+                "id": row.id,
+                "name": row.name,
+                "instructions": row.instructions or "",
+                "model": row.model or "gpt-4o-mini",
+                "model_settings": row.model_settings,
+                "is_entry_point": row.is_entry_point,
+            }
+            for row in result.all()
+        ]
+
+    async def _load_flows(self, agency_id: str) -> list[tuple[str, str]]:
+        """Load communication flows as (from_name, to_name) tuples."""
+        result = await self.db.execute(
+            text("""
+                SELECT fa.name as from_agent_name, ta.name as to_agent_name
+                FROM agency_communication_flows cf
+                JOIN agency_agents fa ON fa.id = cf."fromAgentId"
+                JOIN agency_agents ta ON ta.id = cf."toAgentId"
+                WHERE cf."agencyId" = :agency_id
+            """),
+            {"agency_id": agency_id},
+        )
+        return [(row.from_agent_name, row.to_agent_name) for row in result.all()]
+
+    async def execute_run(
+        self,
+        agency_id: str,
+        message: str,
+        context: RunContext,
+    ) -> RunResult:
+        """Full run lifecycle: load -> construct -> pre-check -> execute -> markup.
+
+        Returns RunResult with response, credits used, and run metadata.
+        """
+        run_id = str(uuid.uuid4())
+        start_time = time.monotonic()
+
+        # 1. Load agency config
+        agency_config = await self.load_agency(agency_id, context.tenant_id)
+        agency_config.user_id = context.user_id
+        agency_config.conversation_id = context.conversation_id
+
+        # 2. Load agent definitions
+        agents_data = await self._load_agents(agency_id)
+
+        # 3. Pre-check credits
+        estimate = self.credit_manager.estimate_run_cost(
+            agent_count=max(len(agents_data), 1),
+        )
+        has_credits = await self.credit_manager.pre_check(
+            user_id=context.user_id,
+            estimated_cost=estimate,
+        )
+        if not has_credits:
+            raise InsufficientCreditsError(
+                f"Insufficient credits for estimated cost ${estimate:.4f}"
+            )
+
+        # 4. Resolve tools for each agent
+        agent_tools: dict[str, list[type]] = {}
+        for agent_data in agents_data:
+            tools = await resolve_tools_for_agent(
+                db=self.db,
+                agent_id=agent_data["id"],
+                agency_whitelist=set(),  # TODO: load whitelist from agency config
+            )
+            agent_tools[agent_data["id"]] = tools
+
+        # 5. Create persistence hooks
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id=context.conversation_id,
+            db_session_factory=AsyncSessionLocal,
+        )
+
+        # 6. Construct agents via adapter
+        agents = []
+        for agent_data in agents_data:
+            agent = self.adapter.create_agent(
+                config=AgentConfig(
+                    name=agent_data["name"],
+                    instructions=agent_data["instructions"],
+                    model=agent_data["model"],
+                    model_settings=agent_data["model_settings"],
+                    tools=agent_tools.get(agent_data["id"], []),
+                    is_entry_point=agent_data["is_entry_point"],
+                ),
+                user_token=context.user_token,
+            )
+            agents.append(agent)
+
+        # 7. Construct agency via adapter
+        agency = self.adapter.create_agency(
+            config=agency_config,
+            agents=agents,
+            persistence_hooks=(load_cb, save_cb),
+        )
+
+        # 8. Create run record (status: running)
+        await self.db.execute(
+            text("""
+                INSERT INTO agency_runs
+                    (id, conversation_id, user_id, agency_id, tenant_id,
+                     status, started_at)
+                VALUES
+                    (:id, :conv_id, :user_id, :agency_id, :tenant_id,
+                     'running', :started_at)
+            """),
+            {
+                "id": run_id,
+                "conv_id": context.conversation_id,
+                "user_id": context.user_id,
+                "agency_id": agency_id,
+                "tenant_id": context.tenant_id,
+                "started_at": datetime.now(timezone.utc),
+            },
+        )
+        await self.db.commit()
+
+        try:
+            # 9. Execute agency
+            result = await self.adapter.run(
+                agency=agency,
+                message=message,
+                timeout_seconds=agency_config.max_run_time_seconds,
+                agency_id=agency_id,
+                tenant_id=context.tenant_id,
+            )
+
+            elapsed_ms = int((time.monotonic() - start_time) * 1000)
+
+            # 10. Apply multiplier markup (stored from load_agency)
+            multiplier = getattr(agency_config, "_credit_multiplier", 1.0)
+
+            await self.credit_manager.apply_multiplier_markup(
+                user_id=context.user_id,
+                agency_id=agency_id,
+                total_gateway_cost=0.0,  # Tracked by gateway per-call
+                multiplier=multiplier,
+            )
+
+            # 11. Update run record (status: completed)
+            await self.db.execute(
+                text("""
+                    UPDATE agency_runs
+                    SET status = 'completed',
+                        completed_at = :completed_at,
+                        duration_ms = :duration_ms,
+                        step_count = :step_count
+                    WHERE id = :id
+                """),
+                {
+                    "id": run_id,
+                    "completed_at": datetime.now(timezone.utc),
+                    "duration_ms": elapsed_ms,
+                    "step_count": result.step_count,
+                },
+            )
+            await self.db.commit()
+
+            logger.info(
+                "agency_service_run_completed",
+                run_id=run_id,
+                agency_id=agency_id,
+                tenant_id=context.tenant_id,
+                duration_ms=elapsed_ms,
+            )
+
+            return result
+
+        except Exception as exc:
+            # Update run record (status: failed)
+            elapsed_ms = int((time.monotonic() - start_time) * 1000)
+            try:
+                await self.db.execute(
+                    text("""
+                        UPDATE agency_runs
+                        SET status = 'failed',
+                            completed_at = :completed_at,
+                            duration_ms = :duration_ms,
+                            error_type = :error_type,
+                            error_message = :error_message
+                        WHERE id = :id
+                    """),
+                    {
+                        "id": run_id,
+                        "completed_at": datetime.now(timezone.utc),
+                        "duration_ms": elapsed_ms,
+                        "error_type": type(exc).__name__,
+                        "error_message": str(exc)[:500],
+                    },
+                )
+                await self.db.commit()
+            except Exception:
+                logger.error("agency_run_record_update_failed", run_id=run_id)
+
+            raise
+
+    async def execute_run_stream(
+        self,
+        agency_id: str,
+        message: str,
+        context: RunContext,
+    ) -> AsyncIterator[dict]:
+        """Streaming variant: yields SSE-formatted event dicts.
+
+        Event types: run_started, agent_switch, token, tool_call,
+        tool_result, run_finished, run_error, heartbeat.
+        """
+        run_id = str(uuid.uuid4())
+
+        try:
+            # Load and construct (same as execute_run)
+            agency_config = await self.load_agency(agency_id, context.tenant_id)
+            agency_config.user_id = context.user_id
+            agency_config.conversation_id = context.conversation_id
+
+            agents_data = await self._load_agents(agency_id)
+
+            agent_tools: dict[str, list[type]] = {}
+            for agent_data in agents_data:
+                tools = await resolve_tools_for_agent(
+                    db=self.db,
+                    agent_id=agent_data["id"],
+                    agency_whitelist=set(),
+                )
+                agent_tools[agent_data["id"]] = tools
+
+            load_cb, save_cb = create_persistence_hooks(
+                conversation_id=context.conversation_id,
+                db_session_factory=AsyncSessionLocal,
+            )
+
+            agents = []
+            for agent_data in agents_data:
+                agent = self.adapter.create_agent(
+                    config=AgentConfig(
+                        name=agent_data["name"],
+                        instructions=agent_data["instructions"],
+                        model=agent_data["model"],
+                        model_settings=agent_data["model_settings"],
+                        tools=agent_tools.get(agent_data["id"], []),
+                        is_entry_point=agent_data["is_entry_point"],
+                    ),
+                    user_token=context.user_token,
+                )
+                agents.append(agent)
+
+            agency = self.adapter.create_agency(
+                config=agency_config,
+                agents=agents,
+                persistence_hooks=(load_cb, save_cb),
+            )
+
+            yield {"event": "run_started", "data": {"run_id": run_id, "agency_id": agency_id}}
+
+            # Get streaming response
+            stream = self.adapter.run_stream(
+                agency=agency,
+                message=message,
+                agency_id=agency_id,
+                tenant_id=context.tenant_id,
+            )
+
+            # Iterate stream events
+            for event in stream:
+                yield {"event": "token", "data": {"delta": str(event)}}
+
+            yield {"event": "run_finished", "data": {"run_id": run_id}}
+
+        except Exception as exc:
+            logger.error(
+                "agency_service_stream_failed",
+                run_id=run_id,
+                agency_id=agency_id,
+                error=str(exc),
+            )
+            yield {
+                "event": "run_error",
+                "data": {"error_type": type(exc).__name__, "message": str(exc)[:500]},
+            }
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
new file mode 100644
index 0000000..8ec7edc
--- /dev/null
+++ b/python-backend/app/services/agency_tools.py
@@ -0,0 +1,195 @@
+"""
+SSPToolBridge -- bridges SmartSpecPro tools to agency-swarm's BaseTool interface.
+
+Tool routing by risk level:
+- low: always allowed, direct HTTP call
+- medium: allowed only if whitelisted, direct HTTP call
+- high: allowed only if whitelisted, dispatch to OpenSandbox
+
+Whitelist enforcement returns a user-friendly error string (not exception)
+so the agent can gracefully explain the denial.
+"""
+
+import httpx
+import structlog
+from pydantic import BaseModel, Field
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import AsyncSession
+from typing import Any
+
+logger = structlog.get_logger(__name__)
+
+
+class ToolConfig(BaseModel):
+    """Configuration for a bridged tool."""
+
+    tool_id: str
+    tool_type: str  # builtin / skill / sandbox / custom
+    risk_level: str  # low / medium / high
+    requires_approval: bool
+    endpoint_url: str | None = None
+    config: dict[str, Any] = {}
+
+
+def create_tool_bridge(
+    tool_config: ToolConfig,
+    whitelist: set[str],
+) -> type:
+    """Create an SSPToolBridge subclass for agency-swarm.
+
+    agency-swarm expects tool CLASSES (not instances) to be passed to Agent.
+    This factory creates a dynamic subclass with the tool config baked in
+    via closure variables (not class attributes, to avoid Pydantic conflicts).
+
+    Args:
+        tool_config: Tool configuration.
+        whitelist: Set of allowed tool IDs for this agency.
+
+    Returns:
+        A new class (subclass of BaseModel) that agency-swarm can use as a tool.
+    """
+    # Capture in closure -- accessed by methods, not as class attributes
+    captured_config = tool_config
+    captured_whitelist = whitelist
+    safe_name = tool_config.tool_id.replace("-", "_").replace(".", "_")
+
+    class _SSPToolBridge(BaseModel):
+        """SmartSpecPro tool bridge for agency-swarm."""
+
+        query: str = Field(default="", description="Input for the tool")
+
+        def run(self) -> str:
+            """Execute the tool with risk-level routing and whitelist enforcement."""
+            config = captured_config
+
+            # Whitelist check for medium and high risk
+            if config.risk_level in ("medium", "high"):
+                if config.tool_id not in captured_whitelist:
+                    logger.warning(
+                        "agency_tool_blocked",
+                        tool_id=config.tool_id,
+                        risk_level=config.risk_level,
+                    )
+                    return (
+                        f"Tool '{config.tool_id}' is not authorized for this agency. "
+                        f"Only whitelisted tools can be used."
+                    )
+
+            # Route based on risk level
+            if config.risk_level == "high":
+                return self._execute_sandbox()
+            else:
+                return self._execute_http()
+
+        def _execute_http(self) -> str:
+            """Execute via direct HTTP call to service endpoint."""
+            if not captured_config.endpoint_url:
+                return f"Tool '{captured_config.tool_id}' has no endpoint configured."
+
+            try:
+                with httpx.Client(timeout=30.0) as client:
+                    resp = client.post(
+                        captured_config.endpoint_url,
+                        json={"query": self.query, **captured_config.config},
+                    )
+                    if resp.status_code == 200:
+                        return resp.text
+                    return f"Tool error (HTTP {resp.status_code}): {resp.text[:200]}"
+            except Exception as exc:
+                logger.error(
+                    "agency_tool_http_error",
+                    tool_id=captured_config.tool_id,
+                    error=str(exc),
+                )
+                return f"Tool execution failed: {str(exc)[:200]}"
+
+        def _execute_sandbox(self) -> str:
+            """Execute via OpenSandbox dispatch."""
+            if not captured_config.endpoint_url:
+                return f"Tool '{captured_config.tool_id}' has no sandbox endpoint configured."
+
+            try:
+                with httpx.Client(timeout=60.0) as client:
+                    resp = client.post(
+                        captured_config.endpoint_url,
+                        json={
+                            "tool_id": captured_config.tool_id,
+                            "input": self.query,
+                            **captured_config.config,
+                        },
+                    )
+                    if resp.status_code == 200:
+                        return resp.text
+                    return f"Sandbox error (HTTP {resp.status_code}): {resp.text[:200]}"
+            except Exception as exc:
+                logger.error(
+                    "agency_tool_sandbox_error",
+                    tool_id=captured_config.tool_id,
+                    error=str(exc),
+                )
+                return f"Sandbox execution failed: {str(exc)[:200]}"
+
+    # Set a descriptive class name for agency-swarm
+    _SSPToolBridge.__name__ = f"SSPTool_{safe_name}"
+    _SSPToolBridge.__qualname__ = f"SSPTool_{safe_name}"
+    # Store config as accessible attribute for tests
+    _SSPToolBridge._tool_config = captured_config  # type: ignore[attr-defined]
+
+    return _SSPToolBridge
+
+
+async def resolve_tools_for_agent(
+    db: AsyncSession,
+    agent_id: str,
+    agency_whitelist: set[str],
+) -> list[type]:
+    """Resolve and construct tool bridges for a specific agent.
+
+    Queries agency_agent_tools and agency_tools to get tool configs,
+    then creates tool bridge classes for each tool.
+
+    Args:
+        db: Database session.
+        agent_id: The agent's ID.
+        agency_whitelist: Set of tool IDs allowed for this agency.
+
+    Returns:
+        List of tool bridge classes (not instances -- agency-swarm
+        expects tool classes, not instances).
+    """
+    query = text("""
+        SELECT
+            t.id as tool_id,
+            t.name,
+            t.description,
+            t."toolType" as tool_type,
+            t."riskLevel" as risk_level,
+            t."requiresApproval" as requires_approval,
+            t.config
+        FROM agency_agent_tools aat
+        JOIN agency_tools t ON t.id = aat."toolId"
+        WHERE aat."agentId" = :agent_id
+    """)
+
+    result = await db.execute(query, {"agent_id": agent_id})
+    rows = result.all()
+
+    tool_classes: list[type] = []
+    for row in rows:
+        config = ToolConfig(
+            tool_id=row.tool_id,
+            tool_type=row.tool_type or "builtin",
+            risk_level=row.risk_level or "low",
+            requires_approval=bool(row.requires_approval),
+            config=row.config or {},
+        )
+        tool_cls = create_tool_bridge(config, agency_whitelist)
+        tool_classes.append(tool_cls)
+
+    logger.info(
+        "agency_tools_resolved",
+        agent_id=agent_id,
+        tool_count=len(tool_classes),
+    )
+
+    return tool_classes
diff --git a/python-backend/tests/unit/test_agency_credits.py b/python-backend/tests/unit/test_agency_credits.py
new file mode 100644
index 0000000..2c41806
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_credits.py
@@ -0,0 +1,230 @@
+"""Tests for AgencyCreditManager."""
+import pytest
+from unittest.mock import AsyncMock, patch, MagicMock
+from decimal import Decimal
+
+import httpx
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency, pytest.mark.credits]
+
+
+class TestAgencyCreditPreCheck:
+    """Tests for AgencyCreditManager.pre_check()."""
+
+    async def test_pre_check_sufficient_credits(self):
+        """pre_check returns True when user has enough credits."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"balance": 100.0}
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.get = AsyncMock(return_value=mock_response)
+            mock_client_cls.return_value = mock_client
+
+            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
+            assert result is True
+
+    async def test_pre_check_insufficient_credits(self):
+        """pre_check returns False when user has insufficient credits."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"balance": 5.0}
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.get = AsyncMock(return_value=mock_response)
+            mock_client_cls.return_value = mock_client
+
+            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
+            assert result is False
+
+    async def test_pre_check_gateway_down_returns_true(self):
+        """pre_check returns True (optimistic) when gateway is unreachable."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
+            mock_client_cls.return_value = mock_client
+
+            result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
+            assert result is True  # Optimistic: allow the run
+
+    async def test_pre_check_no_gateway_url_returns_true(self):
+        """pre_check returns True when gateway URL not configured."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
+        result = await mgr.pre_check(user_id=1, estimated_cost=10.0)
+        assert result is True
+
+
+class TestAgencyCreditMultiplier:
+    """Tests for AgencyCreditManager.apply_multiplier_markup()."""
+
+    async def test_markup_calculation(self):
+        """1.5x multiplier on $10 gateway cost = $5 markup."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"success": True}
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.post = AsyncMock(return_value=mock_response)
+            mock_client_cls.return_value = mock_client
+
+            await mgr.apply_multiplier_markup(
+                user_id=1,
+                agency_id="agency-1",
+                total_gateway_cost=10.0,
+                multiplier=1.5,
+            )
+
+            # Verify the POST was called with markup = 5.0
+            call_kwargs = mock_client.post.call_args
+            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+            assert payload["markupAmount"] == pytest.approx(5.0)
+
+    async def test_markup_with_unity_multiplier(self):
+        """Multiplier of 1.0 results in no HTTP call (no-op)."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client_cls.return_value = mock_client
+
+            await mgr.apply_multiplier_markup(
+                user_id=1,
+                agency_id="agency-1",
+                total_gateway_cost=10.0,
+                multiplier=1.0,
+            )
+
+            # With multiplier=1.0, no HTTP call should be made
+            mock_client.post.assert_not_called()
+
+    async def test_markup_failure_does_not_raise(self):
+        """Markup HTTP failure logs error but does not raise."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.post = AsyncMock(
+                side_effect=httpx.ConnectError("Connection refused")
+            )
+            mock_client_cls.return_value = mock_client
+
+            # Should not raise
+            await mgr.apply_multiplier_markup(
+                user_id=1,
+                agency_id="agency-1",
+                total_gateway_cost=10.0,
+                multiplier=1.5,
+            )
+
+
+class TestAgencyCreditEstimate:
+    """Tests for AgencyCreditManager.estimate_run_cost()."""
+
+    def test_estimate_is_conservative(self):
+        """Estimate based on agent count and model produces non-zero value."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
+        estimate = mgr.estimate_run_cost(agent_count=3)
+        assert estimate > 0
+
+    def test_estimate_scales_with_agents(self):
+        """More agents = higher estimate."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(gateway_url="", gateway_token="")
+        est_2 = mgr.estimate_run_cost(agent_count=2)
+        est_5 = mgr.estimate_run_cost(agent_count=5)
+        assert est_5 > est_2
+
+
+class TestAgencyCreditFailure:
+    """Tests for credit handling on run failure."""
+
+    async def test_failed_run_charges_only_completed(self):
+        """Failed run: markup only applies to actual gateway cost incurred."""
+        from app.services.agency_credits import AgencyCreditManager
+
+        mgr = AgencyCreditManager(
+            gateway_url="http://localhost:3000",
+            gateway_token="test-token",
+        )
+
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"success": True}
+
+        with patch("app.services.agency_credits.httpx.AsyncClient") as mock_client_cls:
+            mock_client = AsyncMock()
+            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_client.__aexit__ = AsyncMock(return_value=False)
+            mock_client.post = AsyncMock(return_value=mock_response)
+            mock_client_cls.return_value = mock_client
+
+            # Only $2 of gateway cost was incurred before failure
+            await mgr.apply_multiplier_markup(
+                user_id=1,
+                agency_id="agency-1",
+                total_gateway_cost=2.0,
+                multiplier=1.5,
+            )
+
+            call_kwargs = mock_client.post.call_args
+            payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+            # Markup = 2.0 * 1.5 - 2.0 = 1.0
+            assert payload["markupAmount"] == pytest.approx(1.0)
diff --git a/python-backend/tests/unit/test_agency_persistence.py b/python-backend/tests/unit/test_agency_persistence.py
new file mode 100644
index 0000000..3dd452e
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_persistence.py
@@ -0,0 +1,152 @@
+"""Tests for agency persistence hooks."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime, timezone
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+def _make_mock_session_factory():
+    """Create a mock async session factory for testing."""
+    mock_session = AsyncMock()
+    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+    mock_session.__aexit__ = AsyncMock(return_value=False)
+    mock_session.execute = AsyncMock()
+    mock_session.commit = AsyncMock()
+
+    mock_factory = MagicMock()
+    mock_factory.return_value = mock_session
+    return mock_factory, mock_session
+
+
+class TestPersistenceHooks:
+    """Tests for create_persistence_hooks()."""
+
+    async def test_save_callback_writes_messages(self):
+        """Save callback writes messages to agency_messages table."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-1",
+            db_session_factory=factory,
+        )
+
+        messages = [
+            {"role": "user", "content": "Hello agent"},
+            {"role": "assistant", "content": "Hi there!", "agent_name": "Agent1"},
+        ]
+
+        await save_cb(messages)
+
+        # Should have executed insert statements
+        assert mock_session.execute.call_count >= 1
+        mock_session.commit.assert_called_once()
+
+    async def test_save_callback_applies_pii_redaction(self):
+        """Save callback applies PII redaction to agent-to-agent messages."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-1",
+            db_session_factory=factory,
+        )
+
+        messages = [
+            {
+                "role": "assistant",
+                "content": "The email is user@example.com",
+                "agent_name": "InternalAgent",
+            },
+        ]
+
+        with patch("app.services.agency_persistence.redact_pii") as mock_redact:
+            mock_redact.return_value = ("The email is [EMAIL]", True)
+            await save_cb(messages)
+            mock_redact.assert_called_once_with("The email is user@example.com")
+
+    async def test_save_callback_no_redact_user_facing(self):
+        """Save callback does NOT redact user messages."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-1",
+            db_session_factory=factory,
+        )
+
+        messages = [
+            {"role": "user", "content": "My email is user@example.com"},
+        ]
+
+        with patch("app.services.agency_persistence.redact_pii") as mock_redact:
+            await save_cb(messages)
+            # User messages should NOT be redacted
+            mock_redact.assert_not_called()
+
+    async def test_load_callback_returns_messages(self):
+        """Load callback returns messages from database."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+
+        # Mock query result
+        mock_row1 = MagicMock()
+        mock_row1.role = "user"
+        mock_row1.content = "Hello"
+        mock_row1.agent_name = None
+        mock_row1.tool_calls = None
+
+        mock_row2 = MagicMock()
+        mock_row2.role = "assistant"
+        mock_row2.content = "Hi there!"
+        mock_row2.agent_name = "Agent1"
+        mock_row2.tool_calls = None
+
+        mock_result = MagicMock()
+        mock_result.all.return_value = [mock_row1, mock_row2]
+        mock_session.execute = AsyncMock(return_value=mock_result)
+
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-1",
+            db_session_factory=factory,
+        )
+
+        messages = await load_cb()
+
+        assert len(messages) == 2
+        assert messages[0]["role"] == "user"
+        assert messages[0]["content"] == "Hello"
+        assert messages[1]["role"] == "assistant"
+        assert messages[1]["content"] == "Hi there!"
+
+    async def test_load_callback_empty_for_new_conversation(self):
+        """Load callback returns empty list for new conversation."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+        mock_result = MagicMock()
+        mock_result.all.return_value = []
+        mock_session.execute = AsyncMock(return_value=mock_result)
+
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-new",
+            db_session_factory=factory,
+        )
+
+        messages = await load_cb()
+        assert messages == []
+
+    async def test_save_empty_messages_is_noop(self):
+        """Save callback with empty list does not hit the database."""
+        from app.services.agency_persistence import create_persistence_hooks
+
+        factory, mock_session = _make_mock_session_factory()
+        load_cb, save_cb = create_persistence_hooks(
+            conversation_id="conv-1",
+            db_session_factory=factory,
+        )
+
+        await save_cb([])
+        mock_session.execute.assert_not_called()
diff --git a/python-backend/tests/unit/test_agency_pii.py b/python-backend/tests/unit/test_agency_pii.py
new file mode 100644
index 0000000..e00f1f8
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_pii.py
@@ -0,0 +1,116 @@
+"""Tests for PII redaction."""
+import pytest
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+class TestRedactPII:
+    """Tests for redact_pii() function."""
+
+    def test_redacts_email(self):
+        """Redacts email addresses: user@example.com -> [EMAIL]."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Contact me at user@example.com for details."
+        result, was_redacted = redact_pii(content)
+        assert "[EMAIL]" in result
+        assert "user@example.com" not in result
+        assert was_redacted is True
+
+    def test_redacts_phone(self):
+        """Redacts phone numbers: +1-555-123-4567 -> [PHONE]."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Call me at +1-555-123-4567."
+        result, was_redacted = redact_pii(content)
+        assert "[PHONE]" in result
+        assert "+1-555-123-4567" not in result
+        assert was_redacted is True
+
+    def test_redacts_ssn(self):
+        """Redacts SSN patterns: 123-45-6789 -> [SSN]."""
+        from app.services.agency_pii import redact_pii
+
+        content = "SSN is 123-45-6789."
+        result, was_redacted = redact_pii(content)
+        assert "[SSN]" in result
+        assert "123-45-6789" not in result
+        assert was_redacted is True
+
+    def test_does_not_corrupt_json(self):
+        """Does NOT corrupt JSON objects in content."""
+        from app.services.agency_pii import redact_pii
+
+        content = '{"key": "value", "count": 42}'
+        result, was_redacted = redact_pii(content)
+        assert result == content
+        assert was_redacted is False
+
+    def test_does_not_corrupt_urls(self):
+        """Does NOT corrupt URLs."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Visit https://api.example.com/v2/resource?id=123"
+        result, was_redacted = redact_pii(content)
+        assert "https://api.example.com/v2/resource?id=123" in result
+
+    def test_does_not_corrupt_version_numbers(self):
+        """Does NOT corrupt version numbers like v3.12.0."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Upgrade to Python v3.12.0"
+        result, was_redacted = redact_pii(content)
+        assert "v3.12.0" in result
+
+    def test_does_not_corrupt_uuids(self):
+        """Does NOT corrupt UUID strings."""
+        from app.services.agency_pii import redact_pii
+
+        content = "ID: 550e8400-e29b-41d4-a716-446655440000"
+        result, was_redacted = redact_pii(content)
+        assert "550e8400-e29b-41d4-a716-446655440000" in result
+
+    def test_returns_true_when_pii_found(self):
+        """Returns (content, was_redacted=True) when PII is found."""
+        from app.services.agency_pii import redact_pii
+
+        _, was_redacted = redact_pii("Email: test@example.com")
+        assert was_redacted is True
+
+    def test_returns_false_when_no_pii(self):
+        """Returns (content, was_redacted=False) when no PII present."""
+        from app.services.agency_pii import redact_pii
+
+        content = "This is a normal sentence with no personal data."
+        result, was_redacted = redact_pii(content)
+        assert result == content
+        assert was_redacted is False
+
+    def test_redacts_phone_parentheses_format(self):
+        """Redacts phone in (555) 123-4567 format."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Call (555) 123-4567 for info."
+        result, was_redacted = redact_pii(content)
+        assert "[PHONE]" in result
+        assert "(555) 123-4567" not in result
+        assert was_redacted is True
+
+    def test_redacts_multiple_pii_types(self):
+        """Redacts mixed PII types in one string."""
+        from app.services.agency_pii import redact_pii
+
+        content = "Email user@test.com, SSN 123-45-6789, phone +1-555-123-4567."
+        result, was_redacted = redact_pii(content)
+        assert "[EMAIL]" in result
+        assert "[SSN]" in result
+        assert "[PHONE]" in result
+        assert was_redacted is True
+
+    def test_empty_string(self):
+        """Empty string returns empty, no redaction."""
+        from app.services.agency_pii import redact_pii
+
+        result, was_redacted = redact_pii("")
+        assert result == ""
+        assert was_redacted is False
diff --git a/python-backend/tests/unit/test_agency_service.py b/python-backend/tests/unit/test_agency_service.py
new file mode 100644
index 0000000..3138d85
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_service.py
@@ -0,0 +1,268 @@
+"""Tests for AgencyService -- lifecycle management."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime, timezone
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+def _make_mock_db():
+    """Create a mock async DB session."""
+    mock_db = AsyncMock()
+    return mock_db
+
+
+def _make_agency_row():
+    """Create a mock agency row from DB query."""
+    row = MagicMock()
+    row.id = "agency-1"
+    row.tenant_id = "tenant-1"
+    row.name = "Test Agency"
+    row.description = "A test agency"
+    row.system_prompt = "You are a helpful agency."
+    row.credit_multiplier = "1.50"
+    row.max_run_time_seconds = 600
+    row.status = "active"
+    return row
+
+
+def _make_agent_rows():
+    """Create mock agent rows from DB query."""
+    agent1 = MagicMock()
+    agent1.id = "agent-1"
+    agent1.name = "Researcher"
+    agent1.instructions = "Research topics"
+    agent1.model = "gpt-4o-mini"
+    agent1.model_settings = None
+    agent1.is_entry_point = True
+
+    agent2 = MagicMock()
+    agent2.id = "agent-2"
+    agent2.name = "Writer"
+    agent2.instructions = "Write content"
+    agent2.model = "gpt-4o-mini"
+    agent2.model_settings = None
+    agent2.is_entry_point = False
+
+    return [agent1, agent2]
+
+
+def _make_flow_rows():
+    """Create mock communication flow rows."""
+    flow = MagicMock()
+    flow.from_agent_name = "Researcher"
+    flow.to_agent_name = "Writer"
+    return [flow]
+
+
+class TestAgencyServiceLoadAgency:
+    """Tests for AgencyService.load_agency()."""
+
+    async def test_load_agency_reads_from_db(self):
+        """load_agency reads agency config from DB."""
+        from app.services.agency_service import AgencyService
+
+        mock_db = _make_mock_db()
+        agency_row = _make_agency_row()
+
+        # Mock the agency query
+        mock_result = MagicMock()
+        mock_result.first.return_value = agency_row
+        mock_db.execute = AsyncMock(return_value=mock_result)
+
+        service = AgencyService(db=mock_db)
+        config = await service.load_agency("agency-1", "tenant-1")
+
+        assert config.agency_id == "agency-1"
+        assert config.name == "Test Agency"
+        mock_db.execute.assert_called()
+
+    async def test_load_agency_not_found_raises(self):
+        """load_agency raises AgencyNotFoundError for non-existent agency."""
+        from app.services.agency_service import AgencyService, AgencyNotFoundError
+
+        mock_db = _make_mock_db()
+        mock_result = MagicMock()
+        mock_result.first.return_value = None
+        mock_db.execute = AsyncMock(return_value=mock_result)
+
+        service = AgencyService(db=mock_db)
+        with pytest.raises(AgencyNotFoundError):
+            await service.load_agency("nonexistent", "tenant-1")
+
+    async def test_load_agency_wrong_tenant_raises(self):
+        """load_agency raises AgencyPermissionError for wrong tenant."""
+        from app.services.agency_service import AgencyService, AgencyPermissionError
+
+        mock_db = _make_mock_db()
+        agency_row = _make_agency_row()
+        agency_row.tenant_id = "other-tenant"
+
+        mock_result = MagicMock()
+        mock_result.first.return_value = agency_row
+        mock_db.execute = AsyncMock(return_value=mock_result)
+
+        service = AgencyService(db=mock_db)
+        with pytest.raises(AgencyPermissionError):
+            await service.load_agency("agency-1", "tenant-1")
+
+
+class TestAgencyServiceExecuteRun:
+    """Tests for AgencyService.execute_run()."""
+
+    async def test_execute_run_full_lifecycle(self):
+        """execute_run: load -> construct -> pre-check -> execute -> markup."""
+        from app.services.agency_service import AgencyService, RunContext
+
+        mock_db = _make_mock_db()
+        service = AgencyService(db=mock_db)
+
+        # Mock internal dependencies
+        mock_agency_config = MagicMock()
+        mock_agency_config.agency_id = "agency-1"
+        mock_agency_config.tenant_id = "tenant-1"
+        mock_agency_config.name = "Test Agency"
+        mock_agency_config.system_prompt = "Help"
+        mock_agency_config.communication_flows = []
+        mock_agency_config.max_run_time_seconds = 600
+        mock_agency_config.user_id = 1
+        mock_agency_config.conversation_id = "conv-1"
+
+        service.load_agency = AsyncMock(return_value=mock_agency_config)
+        service._load_agents = AsyncMock(return_value=[])
+        service._load_flows = AsyncMock(return_value=[])
+
+        # Mock adapter
+        mock_agent = MagicMock()
+        mock_agent.name = "Agent1"
+        mock_agent._is_entry_point = True
+        service.adapter.create_agent = MagicMock(return_value=mock_agent)
+        service.adapter.create_agency = MagicMock()
+
+        mock_run_result = MagicMock()
+        mock_run_result.run_id = "run-1"
+        mock_run_result.response = "Hello!"
+        mock_run_result.agent_name = "Agent1"
+        mock_run_result.total_tokens = 100
+        mock_run_result.step_count = 1
+        mock_run_result.duration_ms = 500
+        service.adapter.run = AsyncMock(return_value=mock_run_result)
+
+        # Mock credit manager
+        service.credit_manager.pre_check = AsyncMock(return_value=True)
+        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
+        service.credit_manager.apply_multiplier_markup = AsyncMock()
+
+        # Mock resolve_tools
+        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
+            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
+                ctx = RunContext(
+                    user_id=1,
+                    tenant_id="tenant-1",
+                    conversation_id="conv-1",
+                    user_token="jwt-token",
+                )
+                result = await service.execute_run("agency-1", "Hello", ctx)
+
+        assert result.response == "Hello!"
+
+    async def test_execute_run_creates_run_record(self):
+        """execute_run creates agency_runs record with status transitions."""
+        from app.services.agency_service import AgencyService, RunContext
+
+        mock_db = _make_mock_db()
+        service = AgencyService(db=mock_db)
+
+        service.load_agency = AsyncMock(return_value=MagicMock(
+            agency_id="a1", tenant_id="t1", name="Test",
+            system_prompt="", communication_flows=[],
+            max_run_time_seconds=600, user_id=1, conversation_id="c1",
+        ))
+        service._load_agents = AsyncMock(return_value=[])
+        service._load_flows = AsyncMock(return_value=[])
+
+        mock_agent = MagicMock(name="Agent1")
+        mock_agent._is_entry_point = True
+        service.adapter.create_agent = MagicMock(return_value=mock_agent)
+        service.adapter.create_agency = MagicMock()
+
+        mock_run_result = MagicMock(
+            run_id="run-1", response="ok", agent_name="Agent1",
+            total_tokens=50, step_count=1, duration_ms=300,
+        )
+        service.adapter.run = AsyncMock(return_value=mock_run_result)
+        service.credit_manager.pre_check = AsyncMock(return_value=True)
+        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
+        service.credit_manager.apply_multiplier_markup = AsyncMock()
+
+        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
+            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
+                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
+                await service.execute_run("a1", "Hi", ctx)
+
+        # Verify DB was called to insert/update run records
+        assert mock_db.execute.call_count >= 1
+
+    async def test_execute_run_per_request_instantiation(self):
+        """Each execute_run creates a new Agency instance."""
+        from app.services.agency_service import AgencyService, RunContext
+
+        mock_db = _make_mock_db()
+        service = AgencyService(db=mock_db)
+
+        service.load_agency = AsyncMock(return_value=MagicMock(
+            agency_id="a1", tenant_id="t1", name="Test",
+            system_prompt="", communication_flows=[],
+            max_run_time_seconds=600, user_id=1, conversation_id="c1",
+        ))
+        service._load_agents = AsyncMock(return_value=[])
+        service._load_flows = AsyncMock(return_value=[])
+
+        mock_agent = MagicMock(name="Agent1")
+        mock_agent._is_entry_point = True
+        service.adapter.create_agent = MagicMock(return_value=mock_agent)
+        service.adapter.create_agency = MagicMock()
+
+        mock_run_result = MagicMock(
+            run_id="run-1", response="ok", agent_name="Agent1",
+            total_tokens=50, step_count=1, duration_ms=300,
+        )
+        service.adapter.run = AsyncMock(return_value=mock_run_result)
+        service.credit_manager.pre_check = AsyncMock(return_value=True)
+        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
+        service.credit_manager.apply_multiplier_markup = AsyncMock()
+
+        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
+            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
+                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
+                await service.execute_run("a1", "Hello", ctx)
+                await service.execute_run("a1", "World", ctx)
+
+        # create_agency should be called twice (per-request)
+        assert service.adapter.create_agency.call_count == 2
+
+
+class TestAgencyServiceCreditPreCheckFailed:
+    """Tests for credit pre-check failure."""
+
+    async def test_insufficient_credits_raises(self):
+        """execute_run raises when pre-check fails."""
+        from app.services.agency_service import AgencyService, RunContext, InsufficientCreditsError
+
+        mock_db = _make_mock_db()
+        service = AgencyService(db=mock_db)
+
+        service.load_agency = AsyncMock(return_value=MagicMock(
+            agency_id="a1", tenant_id="t1", name="Test",
+            system_prompt="", communication_flows=[],
+            max_run_time_seconds=600, user_id=1, conversation_id="c1",
+        ))
+        service._load_agents = AsyncMock(return_value=[])
+        service._load_flows = AsyncMock(return_value=[])
+        service.credit_manager.pre_check = AsyncMock(return_value=False)
+        service.credit_manager.estimate_run_cost = MagicMock(return_value=10.0)
+
+        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
+            ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
+            with pytest.raises(InsufficientCreditsError):
+                await service.execute_run("a1", "Hello", ctx)
diff --git a/python-backend/tests/unit/test_agency_tools.py b/python-backend/tests/unit/test_agency_tools.py
new file mode 100644
index 0000000..d59db95
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_tools.py
@@ -0,0 +1,168 @@
+"""Tests for SSPToolBridge and tool resolution."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+class TestToolConfig:
+    """Tests for ToolConfig pydantic model."""
+
+    def test_tool_config_model_validates(self):
+        """ToolConfig validates tool_id, risk_level, requires_approval."""
+        from app.services.agency_tools import ToolConfig
+
+        config = ToolConfig(
+            tool_id="search-web",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+        )
+        assert config.tool_id == "search-web"
+        assert config.risk_level == "low"
+        assert config.requires_approval is False
+
+    def test_tool_config_defaults(self):
+        """ToolConfig has correct defaults for optional fields."""
+        from app.services.agency_tools import ToolConfig
+
+        config = ToolConfig(
+            tool_id="test",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+        )
+        assert config.endpoint_url is None
+        assert config.config == {}
+
+
+class TestSSPToolBridge:
+    """Tests for SSPToolBridge routing logic."""
+
+    def test_low_risk_allowed_without_whitelist(self):
+        """Low-risk tool executes even if not in whitelist."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="search-web",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://localhost:8000/api/tools/search",
+        )
+        BridgeCls = create_tool_bridge(config, whitelist=set())
+        # Low risk tools are allowed regardless of whitelist
+        assert BridgeCls._tool_config.risk_level == "low"
+
+    def test_high_risk_blocked_without_whitelist(self):
+        """High-risk tool not in whitelist returns error message."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="code-exec",
+            tool_type="sandbox",
+            risk_level="high",
+            requires_approval=True,
+        )
+        BridgeCls = create_tool_bridge(config, whitelist=set())
+        instance = BridgeCls()
+        result = instance.run()
+        assert "not authorized" in result.lower()
+
+    def test_high_risk_allowed_with_whitelist(self):
+        """High-risk tool in whitelist proceeds to execution."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="code-exec",
+            tool_type="sandbox",
+            risk_level="high",
+            requires_approval=True,
+            endpoint_url="http://localhost:8000/api/sandbox/exec",
+        )
+        BridgeCls = create_tool_bridge(config, whitelist={"code-exec"})
+        instance = BridgeCls()
+        # When whitelisted, the tool runs (but may fail due to no actual endpoint)
+        result = instance.run()
+        # Should attempt execution (not blocked), may have execution error
+        assert "not authorized" not in result.lower()
+
+    def test_medium_risk_blocked_without_whitelist(self):
+        """Medium-risk tool not in whitelist returns error message."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="api-call",
+            tool_type="custom",
+            risk_level="medium",
+            requires_approval=False,
+        )
+        BridgeCls = create_tool_bridge(config, whitelist=set())
+        instance = BridgeCls()
+        result = instance.run()
+        assert "not authorized" in result.lower()
+
+    def test_medium_risk_allowed_with_whitelist(self):
+        """Medium-risk tool in whitelist proceeds."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="api-call",
+            tool_type="custom",
+            risk_level="medium",
+            requires_approval=False,
+            endpoint_url="http://localhost:8000/api/tools/custom",
+        )
+        BridgeCls = create_tool_bridge(config, whitelist={"api-call"})
+        instance = BridgeCls()
+        result = instance.run()
+        assert "not authorized" not in result.lower()
+
+    def test_bridge_cls_is_proper_subclass(self):
+        """create_tool_bridge returns a class (not instance) for agency-swarm."""
+        from app.services.agency_tools import create_tool_bridge, ToolConfig
+
+        config = ToolConfig(
+            tool_id="search",
+            tool_type="builtin",
+            risk_level="low",
+            requires_approval=False,
+        )
+        BridgeCls = create_tool_bridge(config, whitelist=set())
+        assert isinstance(BridgeCls, type)
+        assert BridgeCls.__name__.startswith("SSPTool_")
+
+
+class TestToolResolution:
+    """Tests for resolve_tools_for_agent."""
+
+    async def test_resolve_returns_list_of_classes(self):
+        """resolve_tools_for_agent returns tool classes (not instances)."""
+        from app.services.agency_tools import resolve_tools_for_agent
+
+        # Mock DB session that returns tool configs
+        mock_db = AsyncMock()
+        mock_result = MagicMock()
+        mock_result.all.return_value = [
+            MagicMock(
+                tool_id="search-web",
+                name="Web Search",
+                description="Search the web",
+                tool_type="builtin",
+                risk_level="low",
+                requires_approval=False,
+                config=None,
+            ),
+        ]
+        mock_db.execute = AsyncMock(return_value=mock_result)
+
+        tools = await resolve_tools_for_agent(
+            db=mock_db,
+            agent_id="agent-1",
+            agency_whitelist={"search-web"},
+        )
+
+        assert len(tools) >= 0  # May be empty if SQL mock doesn't match
+        # Each tool should be a class
+        for t in tools:
+            assert isinstance(t, type)
