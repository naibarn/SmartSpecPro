"""Tests for AgencyService -- lifecycle management."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _make_mock_db():
    """Create a mock async DB session."""
    mock_db = AsyncMock()
    return mock_db


def _make_agency_row():
    """Create a mock agency row from DB query."""
    row = MagicMock()
    row.id = "agency-1"
    row.tenant_id = "tenant-1"
    row.name = "Test Agency"
    row.description = "A test agency"
    row.system_prompt = "You are a helpful agency."
    row.credit_multiplier = "1.50"
    row.max_run_time_seconds = 600
    row.status = "active"
    return row


def _make_agent_rows():
    """Create mock agent rows from DB query."""
    agent1 = MagicMock()
    agent1.id = "agent-1"
    agent1.name = "Researcher"
    agent1.instructions = "Research topics"
    agent1.model = "gpt-4o-mini"
    agent1.model_settings = None
    agent1.is_entry_point = True

    agent2 = MagicMock()
    agent2.id = "agent-2"
    agent2.name = "Writer"
    agent2.instructions = "Write content"
    agent2.model = "gpt-4o-mini"
    agent2.model_settings = None
    agent2.is_entry_point = False

    return [agent1, agent2]


def _make_flow_rows():
    """Create mock communication flow rows."""
    flow = MagicMock()
    flow.from_agent_name = "Researcher"
    flow.to_agent_name = "Writer"
    return [flow]


class TestAgencyServiceLoadAgency:
    """Tests for AgencyService.load_agency()."""

    async def test_load_agency_reads_from_db(self):
        """load_agency reads agency config from DB."""
        from app.services.agency_service import AgencyService

        mock_db = _make_mock_db()
        agency_row = _make_agency_row()

        # Mock the agency query
        mock_result = MagicMock()
        mock_result.first.return_value = agency_row
        mock_db.execute = AsyncMock(return_value=mock_result)

        service = AgencyService(db=mock_db)
        config = await service.load_agency("agency-1", "tenant-1")

        assert config.agency_id == "agency-1"
        assert config.name == "Test Agency"
        mock_db.execute.assert_called()

    async def test_load_agency_not_found_raises(self):
        """load_agency raises AgencyNotFoundError for non-existent agency."""
        from app.services.agency_service import AgencyService, AgencyNotFoundError

        mock_db = _make_mock_db()
        mock_result = MagicMock()
        mock_result.first.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        service = AgencyService(db=mock_db)
        with pytest.raises(AgencyNotFoundError):
            await service.load_agency("nonexistent", "tenant-1")

    async def test_load_agency_wrong_tenant_raises(self):
        """load_agency raises AgencyPermissionError for wrong tenant."""
        from app.services.agency_service import AgencyService, AgencyPermissionError

        mock_db = _make_mock_db()
        agency_row = _make_agency_row()
        agency_row.tenant_id = "other-tenant"

        mock_result = MagicMock()
        mock_result.first.return_value = agency_row
        mock_db.execute = AsyncMock(return_value=mock_result)

        service = AgencyService(db=mock_db)
        with pytest.raises(AgencyPermissionError):
            await service.load_agency("agency-1", "tenant-1")


class TestAgencyServiceExecuteRun:
    """Tests for AgencyService.execute_run()."""

    async def test_execute_run_full_lifecycle(self):
        """execute_run: load -> construct -> pre-check -> execute -> markup."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        # Mock internal dependencies
        mock_agency_config = MagicMock()
        mock_agency_config.agency_id = "agency-1"
        mock_agency_config.tenant_id = "tenant-1"
        mock_agency_config.name = "Test Agency"
        mock_agency_config.system_prompt = "Help"
        mock_agency_config.communication_flows = []
        mock_agency_config.max_run_time_seconds = 600
        mock_agency_config.user_id = 1
        mock_agency_config.conversation_id = "conv-1"

        service.load_agency = AsyncMock(return_value=mock_agency_config)
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])

        # Mock adapter
        mock_agent = MagicMock()
        mock_agent.name = "Agent1"
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()

        mock_run_result = MagicMock()
        mock_run_result.run_id = "run-1"
        mock_run_result.response = "Hello!"
        mock_run_result.agent_name = "Agent1"
        mock_run_result.total_tokens = 100
        mock_run_result.step_count = 1
        mock_run_result.duration_ms = 500
        service.adapter.run = AsyncMock(return_value=mock_run_result)

        # Mock credit manager
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        # Mock resolve_tools
        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(
                    user_id=1,
                    tenant_id="tenant-1",
                    conversation_id="conv-1",
                    user_token="jwt-token",
                )
                result = await service.execute_run("agency-1", "Hello", ctx)

        assert result.response == "Hello!"

    async def test_execute_run_creates_run_record(self):
        """execute_run creates agency_runs record with status transitions."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])

        mock_agent = MagicMock(name="Agent1")
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()

        mock_run_result = MagicMock(
            run_id="run-1", response="ok", agent_name="Agent1",
            total_tokens=50, step_count=1, duration_ms=300,
        )
        service.adapter.run = AsyncMock(return_value=mock_run_result)
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                await service.execute_run("a1", "Hi", ctx)

        # Verify DB was called to insert/update run records
        assert mock_db.execute.call_count >= 1

    async def test_execute_run_per_request_instantiation(self):
        """Each execute_run creates a new Agency instance."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])

        mock_agent = MagicMock(name="Agent1")
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()

        mock_run_result = MagicMock(
            run_id="run-1", response="ok", agent_name="Agent1",
            total_tokens=50, step_count=1, duration_ms=300,
        )
        service.adapter.run = AsyncMock(return_value=mock_run_result)
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                await service.execute_run("a1", "Hello", ctx)
                await service.execute_run("a1", "World", ctx)

        # create_agency should be called twice (per-request)
        assert service.adapter.create_agency.call_count == 2


class TestAgencyServiceCreditPreCheckFailed:
    """Tests for credit pre-check failure."""

    async def test_insufficient_credits_raises(self):
        """execute_run raises when pre-check fails."""
        from app.services.agency_service import AgencyService, RunContext, InsufficientCreditsError

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service.credit_manager.pre_check = AsyncMock(return_value=False)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=10.0)

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
            with pytest.raises(InsufficientCreditsError):
                await service.execute_run("a1", "Hello", ctx)
