Now I have enough context. Let me generate the section content.

# Section 04: Python Services

## Overview

This section implements the core Python service layer for the Agency-Swarm integration. It covers five files that sit between the adapter (section-03) and the FastAPI router (section-05):

1. **Agency Service** -- lifecycle management for agency runs
2. **Agency Persistence Hooks** -- PostgreSQL-backed load/save callbacks
3. **Agency Credits** -- pre-check and multiplier markup logic
4. **Agency Tool Bridge** -- SmartSpecPro tool adaptation to agency-swarm's `BaseTool`
5. **PII Redaction** -- regex-based redaction for inter-agent messages

All files live under `/home/dev/projects/SmartSpecPro/python-backend/app/services/` and follow the existing service patterns: constructor takes `AsyncSession` (or is stateless for pure functions), uses `structlog` for logging, and raises domain-specific exceptions.

## Dependencies

- **Section 03 (python-adapter):** This section imports `AgencySwarmAdapter`, `AgentConfig`, `AgencyConfig`, `RunResult`, and `RunContext` from `python-backend/app/services/agency_swarm_adapter.py`. Those types must exist before implementing these services.
- **Section 02 (database-schema):** The SQLAlchemy models `AgencyMessage` and `AgencyRun` from `python-backend/app/models/agency.py` must exist. The read-only SQLAlchemy models for Drizzle-owned tables (agencies, agency_agents, agency_agent_tools, agency_tools, agency_communication_flows, agency_conversations) must also exist.
- **Existing codebase:** `python-backend/app/core/config.py` (`settings`), `python-backend/app/core/database.py` (`Base`, `get_db`), `python-backend/app/services/credit_billing_client.py` (pattern for calling Node.js internal endpoints via `httpx`).

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py` | Agency lifecycle orchestration |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_persistence.py` | Persistence hooks for agency-swarm callbacks |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_credits.py` | Credit pre-check and multiplier markup |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` | SSPToolBridge and tool resolution |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_pii.py` | PII redaction for inter-agent messages |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/pytest.ini` | Add `agency` marker to markers list |

## Tests First

All tests go under `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/`. Create the following test files. Each test uses pytest with `asyncio_mode = auto` and mocks external dependencies (DB, HTTP, agency-swarm classes).

### `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_service.py`

```python
"""Tests for AgencyService -- lifecycle management."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestAgencyServiceLoadAgency:
    """Tests for AgencyService.load_agency()."""

    async def test_load_agency_reads_from_db(self, test_db):
        """load_agency reads agency config directly from DB (no HTTP call)."""

    async def test_load_agency_not_found_raises(self, test_db):
        """load_agency raises NotFoundError for non-existent agency."""

    async def test_load_agency_wrong_tenant_raises(self, test_db):
        """load_agency raises PermissionError for wrong tenant."""


class TestAgencyServiceExecuteRun:
    """Tests for AgencyService.execute_run()."""

    async def test_execute_run_full_lifecycle(self):
        """execute_run: load -> construct -> pre-check -> execute -> markup."""

    async def test_execute_run_creates_run_record(self):
        """execute_run creates agency_runs record with correct status transitions."""

    async def test_execute_run_per_request_instantiation(self):
        """Each execute_run creates a new Agency instance (no shared state)."""


class TestAgencyServiceExecuteRunStream:
    """Tests for AgencyService.execute_run_stream()."""

    async def test_execute_run_stream_yields_sse_events(self):
        """execute_run_stream yields SSE events in order: run_started -> tokens -> run_finished."""

    async def test_execute_run_stream_heartbeat(self):
        """execute_run_stream sends heartbeat every 15 seconds."""
```

### `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_persistence.py`

```python
"""Tests for agency persistence hooks."""
import pytest
from unittest.mock import AsyncMock, MagicMock

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestPersistenceHooks:
    """Tests for create_persistence_hooks()."""

    async def test_save_callback_writes_messages(self, test_db):
        """Save callback writes messages to agency_messages table."""

    async def test_save_callback_applies_pii_redaction(self, test_db):
        """Save callback applies PII redaction to agent-to-agent messages."""

    async def test_save_callback_no_redact_user_facing(self, test_db):
        """Save callback does NOT redact user-facing final responses."""

    async def test_load_callback_orders_by_created_at(self, test_db):
        """Load callback loads messages ordered by created_at."""

    async def test_load_callback_empty_for_new_conversation(self, test_db):
        """Load callback returns empty list for new conversation."""

    async def test_round_trip_preserves_content(self, test_db):
        """Save then load preserves message content (non-PII)."""
```

### `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_credits.py`

```python
"""Tests for AgencyCreditManager."""
import pytest
from unittest.mock import AsyncMock, patch

pytestmark = [pytest.mark.unit, pytest.mark.agency, pytest.mark.credits]


class TestAgencyCreditPreCheck:
    """Tests for AgencyCreditManager.pre_check()."""

    async def test_pre_check_sufficient_credits(self):
        """pre_check returns True when user has enough credits."""

    async def test_pre_check_insufficient_credits(self):
        """pre_check returns False when user has insufficient credits."""


class TestAgencyCreditMultiplier:
    """Tests for AgencyCreditManager.apply_multiplier_markup()."""

    async def test_markup_calculation(self):
        """1.5x multiplier on $10 gateway cost = $5 markup."""

    async def test_markup_with_unity_multiplier(self):
        """Multiplier of 1.0 results in zero markup."""


class TestAgencyCreditEstimate:
    """Tests for AgencyCreditManager.estimate_run_cost()."""

    def test_estimate_is_conservative(self):
        """Estimate based on agent count and model produces non-zero value."""


class TestAgencyCreditFailure:
    """Tests for credit handling on run failure."""

    async def test_failed_run_charges_only_completed(self):
        """Failed run charges only completed steps (no refund needed since no reservation)."""
```

### `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_tools.py`

```python
"""Tests for SSPToolBridge and tool resolution."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestSSPToolBridge:
    """Tests for SSPToolBridge routing logic."""

    def test_low_risk_routes_to_direct_http(self):
        """Low-risk tool (search, fetch) routes to direct HTTP service call."""

    def test_high_risk_routes_to_sandbox(self):
        """High-risk tool (code execution) routes to OpenSandbox dispatch."""

    def test_tool_not_in_whitelist_blocked(self):
        """Tool not in agency whitelist is blocked with error message."""

    def test_tool_in_whitelist_allowed(self):
        """Tool in the agency whitelist is allowed to execute."""

    def test_tool_config_model_validates(self):
        """ToolConfig pydantic model validates tool_id, risk_level, requires_approval."""


class TestToolResolution:
    """Tests for tool resolution from database."""

    async def test_resolve_tool_by_id(self, test_db):
        """Resolve tool configuration by tool ID from DB."""
```

### `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_pii.py`

```python
"""Tests for PII redaction."""
import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestRedactPII:
    """Tests for redact_pii() function."""

    def test_redacts_email(self):
        """Redacts email addresses: user@example.com -> [EMAIL]."""
        from app.services.agency_pii import redact_pii

        content = "Contact me at user@example.com for details."
        result, was_redacted = redact_pii(content)
        assert "[EMAIL]" in result
        assert "user@example.com" not in result
        assert was_redacted is True

    def test_redacts_phone(self):
        """Redacts phone numbers: +1-555-123-4567 -> [PHONE]."""
        from app.services.agency_pii import redact_pii

        content = "Call me at +1-555-123-4567."
        result, was_redacted = redact_pii(content)
        assert "[PHONE]" in result
        assert "+1-555-123-4567" not in result
        assert was_redacted is True

    def test_redacts_ssn(self):
        """Redacts SSN patterns: 123-45-6789 -> [SSN]."""
        from app.services.agency_pii import redact_pii

        content = "SSN is 123-45-6789."
        result, was_redacted = redact_pii(content)
        assert "[SSN]" in result
        assert "123-45-6789" not in result
        assert was_redacted is True

    def test_does_not_corrupt_json(self):
        """Does NOT corrupt JSON objects in content."""
        from app.services.agency_pii import redact_pii

        content = '{"key": "value", "count": 42}'
        result, was_redacted = redact_pii(content)
        assert result == content
        assert was_redacted is False

    def test_does_not_corrupt_urls(self):
        """Does NOT corrupt URLs."""
        from app.services.agency_pii import redact_pii

        content = "Visit https://api.example.com/v2/resource?id=123"
        result, was_redacted = redact_pii(content)
        assert "https://api.example.com/v2/resource?id=123" in result

    def test_does_not_corrupt_version_numbers(self):
        """Does NOT corrupt version numbers like v3.12.0."""
        from app.services.agency_pii import redact_pii

        content = "Upgrade to Python v3.12.0"
        result, was_redacted = redact_pii(content)
        assert "v3.12.0" in result

    def test_does_not_corrupt_uuids(self):
        """Does NOT corrupt UUID strings."""
        from app.services.agency_pii import redact_pii

        content = "ID: 550e8400-e29b-41d4-a716-446655440000"
        result, was_redacted = redact_pii(content)
        assert "550e8400-e29b-41d4-a716-446655440000" in result

    def test_returns_true_when_pii_found(self):
        """Returns (content, was_redacted=True) when PII is found."""
        from app.services.agency_pii import redact_pii

        _, was_redacted = redact_pii("Email: test@example.com")
        assert was_redacted is True

    def test_returns_false_when_no_pii(self):
        """Returns (content, was_redacted=False) when no PII present."""
        from app.services.agency_pii import redact_pii

        content = "This is a normal sentence with no personal data."
        result, was_redacted = redact_pii(content)
        assert result == content
        assert was_redacted is False
```

### Update pytest.ini markers

Add `agency` to the markers list in `/home/dev/projects/SmartSpecPro/python-backend/pytest.ini`:

```ini
markers =
    unit: Unit tests
    integration: Integration tests
    e2e: End-to-end tests
    slow: Slow tests
    auth: Authentication tests
    payments: Payment tests
    dashboard: Dashboard tests
    llm: LLM proxy tests
    credits: Credit system tests
    sandbox: OpenSandbox integration tests
    agency: Agency-swarm integration tests
```

---

## Implementation Details

### 1. PII Redaction (`agency_pii.py`)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_pii.py`

This is a pure-function module with no dependencies beyond the standard library `re` module. It should be implemented first since the persistence hooks depend on it.

**Design:**

- Define compiled regex patterns for email, phone (US/international), and SSN formats.
- The email pattern must NOT match URLs. Use a negative lookbehind for `://` and a negative lookahead for paths. A practical approach: match `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b` but exclude matches preceded by `://`.
- The phone pattern should match common formats: `+1-555-123-4567`, `(555) 123-4567`, `555.123.4567`, `555-123-4567`. Must NOT match version numbers (which have dots but different structure). Use a pattern that requires at least 7 digits.
- The SSN pattern matches exactly `NNN-NN-NNNN` format. Must NOT match UUIDs (which use hex digits and have 8-4-4-4-12 structure). Anchor with word boundaries and ensure the groups are 3-2-4 digits only.
- Process patterns in order: SSN first (most specific), then phone, then email (most general).
- Return a tuple of `(redacted_content: str, was_redacted: bool)`.

**Function signature:**

```python
def redact_pii(content: str) -> tuple[str, bool]:
    """Redact PII patterns (emails, phones, SSN, etc.) from content.

    Applied to agent-to-agent messages before storage.
    User-facing final responses are NOT redacted.

    Returns:
        Tuple of (redacted_content, was_redacted).
    """
```

### 2. Agency Persistence Hooks (`agency_persistence.py`)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_persistence.py`

Implements agency-swarm's `load_threads_callback` and `save_threads_callback` backed by PostgreSQL. In agency-swarm v1.x, these callbacks store/retrieve full conversation histories (not just thread IDs).

**Design:**

- `create_persistence_hooks(conversation_id, db_session_factory)` returns a tuple of `(load_callback, save_callback)`.
- The `load_callback` queries `agency_messages` for the given `conversation_id`, ordered by `created_at ASC`, and returns the messages in the format expected by agency-swarm.
- The `save_callback` receives a list of new messages. For each message:
  - If `role` is not `"user"` (i.e., it is an agent-to-agent or system message), apply `redact_pii()` from `agency_pii.py`. Set `pii_redacted` flag accordingly.
  - If `role` is `"user"` or this is the final assistant response to the user, do NOT redact.
  - Batch insert into `agency_messages`.
- Both callbacks must create their own DB session from the session factory (not share the request session) since agency-swarm may call them from sync context.

**Function signature:**

```python
def create_persistence_hooks(
    conversation_id: str,
    db_session_factory: async_sessionmaker,
) -> tuple[Callable, Callable]:
    """Create load/save callbacks for a specific conversation.

    Returns:
        (load_callback, save_callback) — both are sync callables
        that internally run async operations via asyncio.
    """
```

**Important note on sync/async bridge:** agency-swarm callbacks are synchronous. The persistence hooks must use `asyncio.get_event_loop().run_until_complete()` or `asyncio.run()` to bridge into async DB operations. Use the `nest_asyncio` approach if running inside an existing event loop, or use a separate sync engine for the callbacks. The choice depends on how agency-swarm invokes these callbacks. Document this decision in the implementation.

### 3. Agency Credits (`agency_credits.py`)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_credits.py`

Manages credit pre-checks and multiplier markup for agency runs. Credit deduction for individual LLM calls happens per-call through the Node.js gateway (same as existing chat). This service handles only the agency-specific logic.

**Design:**

The credit flow:
1. **Pre-check** (before run starts): Estimate cost, check user balance via the Node.js gateway. Does NOT reserve credits.
2. **Per-call deduction** (during run): Each agent's LLM call routes through Node.js gateway which deducts credits atomically. This is handled by the adapter (section-03), not this service.
3. **Multiplier markup** (after run completes): Calculate `(total_gateway_charges * creditMultiplier) - total_gateway_charges` and call Node.js internal endpoint to deduct the markup as a separate transaction with `sourceType: "agency"`.

**Class signature:**

```python
class AgencyCreditManager:
    """Manages credit pre-checks and multiplier markup for agency runs."""

    def __init__(self, gateway_url: str, gateway_token: str):
        """Initialize with Node.js gateway connection details.

        Args:
            gateway_url: SMARTSPEC_WEB_GATEWAY_URL from settings.
            gateway_token: SMARTSPEC_WEB_GATEWAY_TOKEN from settings.
        """

    async def pre_check(self, user_id: int, estimated_cost: float) -> bool:
        """Check user has enough credits for estimated run cost.

        Makes an HTTP call to Node.js gateway to check balance.
        Does NOT reserve credits.

        Returns:
            True if user has sufficient credits, False otherwise.
        """

    async def apply_multiplier_markup(
        self,
        user_id: int,
        agency_id: str,
        total_gateway_cost: float,
        multiplier: float,
    ) -> None:
        """Deduct agency markup at run completion.

        Calls POST /api/internal/credits/agency-markup on Node.js.
        The markup amount = (total_gateway_cost * multiplier) - total_gateway_cost.
        If multiplier is 1.0, this is a no-op.

        Args:
            user_id: The user who ran the agency.
            agency_id: The agency ID for audit trail.
            total_gateway_cost: Sum of all per-call LLM charges during the run.
            multiplier: The agency's creditMultiplier (e.g., 1.5).
        """

    def estimate_run_cost(
        self,
        agent_count: int,
        avg_tokens_per_agent: int = 2000,
        model: str = "gpt-4o-mini",
    ) -> float:
        """Estimate cost for pre-check. Conservative estimate.

        Uses a simple heuristic: agent_count * avg_tokens * model_cost_per_token.
        This is intentionally overestimated to avoid mid-run credit exhaustion.

        Returns:
            Estimated cost in USD.
        """
```

**HTTP call pattern:** Follow the existing `credit_billing_client.py` pattern using `httpx.AsyncClient`. The internal endpoint `POST /api/internal/credits/agency-markup` is defined in section-06 (Node.js integration). This service calls it with internal service auth (gateway token), not user JWT.

**Error handling:** If the pre-check HTTP call fails (gateway down), return `True` (optimistic -- allow the run, per-call deductions will still enforce balance). Log a warning. If the markup call fails, log an error but do not fail the run (post-deduct pattern).

### 4. Agency Tool Bridge (`agency_tools.py`)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

Bridges SmartSpecPro tools to agency-swarm's `BaseTool` interface. Each tool is an instance of `SSPToolBridge` (a `BaseTool` subclass) that routes execution based on risk level.

**Design:**

- `SSPToolBridge` extends `BaseTool` from `agency_swarm.tools`. It uses Pydantic v2 fields for configuration.
- Tool routing by risk level:
  - `low` (search, fetch, library lookup): Direct HTTP call to Python/Node services.
  - `medium` (external API calls): Direct HTTP, but blocked if not in the agency's tool whitelist.
  - `high` (code execution, file system): Dispatch to OpenSandbox via the existing `SandboxDispatcher`, blocked if not in the agency's tool whitelist.
- The tool bridge does NOT pass raw user content as tool input parameters. Only validated, schema-conforming inputs from the agent's structured output are forwarded.
- Tool whitelist is a `set[str]` of allowed tool IDs, passed at construction time.

**Class signature:**

```python
class ToolConfig(BaseModel):
    """Configuration for a bridged tool."""
    tool_id: str
    tool_type: str  # builtin / skill / sandbox / custom
    risk_level: str  # low / medium / high
    requires_approval: bool
    endpoint_url: str | None = None
    config: dict = {}


class SSPToolBridge(BaseTool):
    """Base class for all SmartSpecPro tool bridges.

    Wraps SmartSpecPro tools to conform to agency-swarm's BaseTool interface.
    Routes execution based on risk level and whitelist enforcement.
    """

    tool_config: ToolConfig
    """Tool configuration loaded from database."""

    whitelist: set[str] = set()
    """Set of allowed tool IDs for this agency."""

    def run(self) -> str:
        """Execute the tool.

        Routes to appropriate service based on risk_level:
        - low: direct HTTP to service
        - medium: direct HTTP (whitelist-enforced)
        - high: OpenSandbox dispatch (whitelist-enforced)

        Returns:
            Tool execution result as string.
        """


async def resolve_tools_for_agent(
    db: AsyncSession,
    agent_id: str,
    agency_whitelist: set[str],
) -> list[type[SSPToolBridge]]:
    """Resolve and construct tool bridges for a specific agent.

    Queries agency_agent_tools and agency_tools to get tool configs,
    then creates SSPToolBridge subclasses for each tool.

    Args:
        db: Database session.
        agent_id: The agent's ID.
        agency_whitelist: Set of tool IDs allowed for this agency.

    Returns:
        List of SSPToolBridge subclasses (not instances -- agency-swarm
        expects tool classes, not instances).
    """
```

**Whitelist enforcement:** When `run()` is called on a medium or high risk tool, check if `tool_config.tool_id` is in `self.whitelist`. If not, return an error message string (e.g., `"Tool '{name}' is not authorized for this agency."`) instead of raising an exception. This allows the agent to gracefully handle the denial and try an alternative approach.

**Dynamic subclass creation:** agency-swarm expects tool classes (not instances) to be passed to `Agent`. The `resolve_tools_for_agent` function should dynamically create subclasses of `SSPToolBridge` with the appropriate `ToolConfig` baked in, using `type()` or a class factory pattern.

### 5. Agency Service (`agency_service.py`)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_service.py`

This is the main orchestration service that ties everything together. It loads agency configuration from the database, constructs agency-swarm objects via the adapter (section-03), manages the run lifecycle, and records results.

**Design:**

- Reads agency configuration directly from PostgreSQL using read-only SQLAlchemy models. This avoids an HTTP round-trip to Node.js per run. The read-only models map to the Drizzle-owned tables (agencies, agency_agents, etc.) without FK constraints and without Alembic management.
- Agency objects are instantiated per-request -- never reused across concurrent runs. This prevents thread safety issues with agency-swarm's mutable state.
- The `execute_run` method follows this lifecycle:
  1. Load agency config from DB
  2. Check feature flag (`AGENCY_SWARM_ENABLED`)
  3. Pre-check credits via `AgencyCreditManager`
  4. Resolve tools for each agent via `resolve_tools_for_agent`
  5. Create persistence hooks via `create_persistence_hooks`
  6. Construct agents and agency via `AgencySwarmAdapter`
  7. Create `agency_runs` record (status: `running`)
  8. Execute agency via adapter
  9. Apply multiplier markup via `AgencyCreditManager`
  10. Update `agency_runs` record (status: `completed`, costs, duration)
  11. Return result

**Class signature:**

```python
class AgencyNotFoundError(Exception):
    """Raised when agency does not exist."""

class AgencyPermissionError(Exception):
    """Raised when user/tenant does not have access to agency."""


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
        """Load agency definition from PostgreSQL via read-only SQLAlchemy models.

        Args:
            agency_id: UUID of the agency.
            tenant_id: Tenant ID for access control.

        Returns:
            AgencyConfig populated from database.

        Raises:
            AgencyNotFoundError: If agency does not exist.
            AgencyPermissionError: If agency belongs to different tenant.
        """

    async def execute_run(
        self,
        agency_id: str,
        message: str,
        context: RunContext,
    ) -> RunResult:
        """Full run lifecycle: load -> construct -> pre-check -> execute -> markup.

        Args:
            agency_id: UUID of the agency to run.
            message: User message to send.
            context: Run context (user_id, tenant_id, conversation_id, token).

        Returns:
            RunResult with response, credits used, and run metadata.
        """

    async def execute_run_stream(
        self,
        agency_id: str,
        message: str,
        context: RunContext,
    ) -> AsyncIterator[dict]:
        """Streaming variant: yields SSE-formatted event dicts.

        Event types:
        - run_started: {run_id, agency_id}
        - agent_switch: {agent_name}
        - token: {delta}
        - tool_call: {tool_name, agent_name}
        - tool_result: {tool_name, result_preview}
        - run_finished: {run_id, total_credits}
        - run_error: {error_type, message}

        Yields heartbeat dict every 15 seconds to keep connection alive.
        """
```

**Run record management:** The service creates an `AgencyRun` record at the start (status `running`) and updates it at the end. The record stores:
- `total_gateway_cost`: Sum of per-call charges (tracked by accumulating costs from each LLM response)
- `multiplier_markup`: The additional charge from `creditMultiplier`
- `total_credits_used`: `gateway_cost + markup`
- `duration_ms`: Wall-clock duration
- `step_count`: Number of agent steps executed
- `error_type` / `error_message`: If the run failed

**Streaming heartbeat:** The `execute_run_stream` method should use `asyncio.wait_for` or a separate heartbeat task. Every 15 seconds of inactivity, yield a heartbeat event: `{"event": "heartbeat", "data": ""}`. This prevents Nginx and load balancers from timing out the SSE connection.

**Feature flag check:** Before executing, verify `AGENCY_SWARM_ENABLED` is true in `system_settings`. The check should query Redis first (cached flag), falling back to DB. If disabled, raise an appropriate error that the router can translate to a 404 or 503 response.

---

## Configuration Addition

Add the following to `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` (Settings class):

```python
# Agency-Swarm
AGENCY_SWARM_ENABLED: bool = False
```

This is the Python-side feature flag default. The runtime value comes from the `system_settings` table (section-02), but having a config default allows disabling via environment variable as a kill switch.

---

## Key Design Decisions

1. **Per-request agency instantiation:** Agency-swarm's `Agency` class has mutable state (conversation history, thread IDs). Sharing instances across concurrent requests would cause data leakage. Every `execute_run` call creates a fresh `Agency` instance.

2. **No credit reservation:** Unlike a typical pre-reserve/reconcile pattern, this implementation uses per-call gateway deduction (same as existing chat). The pre-check is advisory only. The multiplier markup is applied post-run. This avoids building a new reservation subsystem.

3. **Sync/async bridge for persistence hooks:** agency-swarm callbacks are synchronous. The persistence hooks must bridge into async DB operations. This is a known complexity point that requires careful handling to avoid deadlocks in the event loop.

4. **Tool whitelist as soft block:** When a tool is not whitelisted, the bridge returns an error message string rather than raising an exception. This allows the agent to gracefully handle the denial (e.g., explain to the user why it cannot perform the action) rather than causing a hard run failure.

5. **PII redaction on agent-to-agent only:** User messages and final responses to the user are NOT redacted. Only inter-agent communication stored in `agency_messages` gets PII stripped. This balances privacy with usability.

---

## Implementation Notes (Post-Build)

### Deviations from Plan

1. **Raw SQL instead of read-only SQLAlchemy models:** No read-only SQLAlchemy models exist for Drizzle-owned tables (agencies, agency_agents, etc.). Used raw SQL queries with `sqlalchemy.text()` instead. This is acceptable since these are read-only queries and avoids creating duplicate model definitions.

2. **`endpoint_url` from config JSON:** The `agency_tools` table has no `endpoint_url` column. Instead, the endpoint URL is extracted from the `config` JSON field: `tool_config.config.get("endpoint_url")`.

3. **Tool bridge uses adapter's `create_tool_class()`:** Instead of `SSPToolBridge` directly extending `BaseTool` (which would require importing from agency-swarm in agency_tools.py), the adapter gained a `create_tool_class(tool_name, tool_description, run_func)` method. This maintains the isolation rule that only `agency_swarm_adapter.py` imports from agency-swarm. A BaseModel fallback is used in tests.

4. **Persistence hooks remain async:** User chose to keep hooks as async callables rather than adding a sync bridge. If agency-swarm requires sync callbacks at runtime, the bridge will be added at the adapter call site.

5. **`RunContext` defined in agency_service.py:** Not imported from the adapter module. Kept local to the service since it's only used there.

6. **`pytest.ini` already updated:** The `agency` marker was added in section-01 (pre-validation), so no change was needed here.

7. **Streaming heartbeat deferred to section-07:** The `execute_run_stream` method yields events but does not implement heartbeat or run records. These are handled by the SSE router layer (section-07).

8. **Feature flag check deferred to router layer:** The `AGENCY_SWARM_ENABLED` config was added, but the runtime check against `system_settings` is implemented in the router (section-05), not in the service.

9. **`total_gateway_cost` hardcoded to 0.0:** Per-call costs are tracked by the Node.js gateway. The reconciliation endpoint (section-06) will sum costs by run_id for accurate multiplier markup. Added TODO comment.

10. **`AgencyDisabledError` exception added:** Available for future use by the router when the feature flag is disabled.

### Actual Files Created/Modified

| File | Status |
|------|--------|
| `python-backend/app/services/agency_pii.py` | Created (37 lines) |
| `python-backend/app/services/agency_persistence.py` | Created (115 lines) |
| `python-backend/app/services/agency_credits.py` | Created (107 lines) |
| `python-backend/app/services/agency_tools.py` | Created (133 lines) |
| `python-backend/app/services/agency_service.py` | Created (431 lines) |
| `python-backend/app/services/agency_swarm_adapter.py` | Modified (added `credit_multiplier` field to AgencyConfig, added `create_tool_class()` method) |
| `python-backend/app/core/config.py` | Modified (added `AGENCY_SWARM_ENABLED: bool = False`) |
| `python-backend/tests/unit/test_agency_pii.py` | Created (12 tests) |
| `python-backend/tests/unit/test_agency_credits.py` | Created (10 tests) |
| `python-backend/tests/unit/test_agency_tools.py` | Created (9 tests) |
| `python-backend/tests/unit/test_agency_persistence.py` | Created (6 tests) |
| `python-backend/tests/unit/test_agency_service.py` | Created (7 tests) |

### Test Results

44 tests passing across 5 test files. All tests use mocks for DB, HTTP, and agency-swarm dependencies.

### Code Review

13 findings identified, 8 auto-fixed, 3 user-directed, 2 let-go. See `implementation/code_review/section-04-review.md` and `section-04-interview.md`.