"""Tests for AgencyService -- lifecycle management."""
import json
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
    row.creator_fee_credits = 0
    row.platform_share_pct = 20
    row.creator_id = None
    row.user_context = None
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
        service._load_flows = AsyncMock(return_value=[])
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

    async def test_execute_run_orchestrator_passes_whitelist_and_retrieval_scope(self):
        """Orchestrator path receives the same whitelist and retrieval scope as agent-only runs."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="Base prompt", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[{
            "id": "node-1",
            "name": "Router",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "router",
            "node_config": {},
        }])
        service._load_flows_full = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value={"builtin-document-search"})
        service._load_guardrails_for_agents = AsyncMock(return_value={})
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock(return_value="orchestrated")

        with patch("app.services.agency_service.should_use_orchestrator", return_value=True):
            with patch("app.services.agency_service.AgencyOrchestrator", return_value=mock_orchestrator) as mock_ctor:
                ctx = RunContext(
                    user_id=1,
                    tenant_id="t1",
                    conversation_id="c1",
                    user_token="tok",
                    run_metadata={"retrieval_scope": {"effectiveMode": "library_only"}},
                )
                result = await service.execute_run("a1", "Hello", ctx)

        assert result.response == "orchestrated"
        ctor_kwargs = mock_ctor.call_args.kwargs
        assert ctor_kwargs["agency_whitelist"] == {"builtin-document-search"}
        assert ctor_kwargs["retrieval_scope_mode"] == "library_only"

    async def test_execute_run_passes_retrieval_scope_mode_to_tool_resolution(self):
        """execute_run enforces retrieval scope at tool-resolution time."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[{
            "id": "agent-1",
            "name": "Researcher",
            "instructions": "Research topics",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
        }])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value={"builtin-document-search"})

        mock_agent = MagicMock(name="Agent1")
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()
        service.adapter.run = AsyncMock(return_value=MagicMock(
            run_id="run-1", response="ok", agent_name="Agent1",
            total_tokens=50, step_count=1, duration_ms=300,
        ))
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        mock_resolve_tools = AsyncMock(return_value=[])
        with patch("app.services.agency_service.resolve_tools_for_agent", mock_resolve_tools):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(
                    user_id=1,
                    tenant_id="t1",
                    conversation_id="c1",
                    user_token="tok",
                    run_metadata={
                        "retrieval_scope": {
                            "effectiveMode": "library_only",
                        }
                    },
                )
                await service.execute_run("a1", "Hello", ctx)

        mock_resolve_tools.assert_awaited_once()
        assert mock_resolve_tools.await_args.kwargs["retrieval_scope_mode"] == "library_only"

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
        mock_agency_config.credit_multiplier = 1.0
        mock_agency_config.creator_fee_credits = 0
        mock_agency_config.creator_id = None
        mock_agency_config.platform_share_pct = 20

        service.load_agency = AsyncMock(return_value=mock_agency_config)
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())

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
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())

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
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())

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

    async def test_execute_run_normalizes_structured_result_and_preview_artifact(self):
        """Structured envelopes are normalized into readable text plus preview metadata."""
        from app.services.agency_result_envelope import AgencyEnvelopeParseOutcome, AgencyResultEnvelope
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())

        mock_agent = MagicMock(name="Agent1")
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()

        mock_run_result = MagicMock(
            run_id="run-1",
            response="```agency-result\n{\"version\":\"1.0\",\"intent\":\"research_report\",\"summary\":\"Research preview ready.\",\"payload\":{\"title\":\"Market scan\"},\"artifacts\":[{\"artifact_type\":\"research_report\",\"title\":\"Market scan\"}],\"references\":[],\"metrics\":{}}\n```",
            agent_name="Agent1",
            total_tokens=50,
            step_count=1,
            duration_ms=300,
        )
        service.adapter.run = AsyncMock(return_value=mock_run_result)
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        envelope = AgencyResultEnvelope(
            version="1.0",
            intent="research_report",
            summary="Research preview ready.",
            payload={"title": "Market scan"},
            artifacts=[{"artifact_type": "research_report", "title": "Market scan"}],
            references=[],
            metrics={},
        )

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                with patch(
                    "app.services.agency_service.parse_agency_result_envelope",
                    return_value=AgencyEnvelopeParseOutcome(
                        found=True,
                        valid=True,
                        text_response="Research preview ready.",
                        envelope=envelope,
                        error=None,
                    ),
                ):
                    ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                    result = await service.execute_run("a1", "Hi", ctx)

        assert result.response == "Research preview ready."
        assert result.structured_result["intent"] == "research_report"
        assert result.preview_artifacts[0]["state"] == "preview_generated"

    async def test_execute_run_adds_hybrid_runtime_summary_from_compile_preview(self):
        """Hybrid compile preview metadata is normalized into additive run-result surfaces."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())

        mock_agent = MagicMock(name="Agent1")
        mock_agent._is_entry_point = True
        service.adapter.create_agent = MagicMock(return_value=mock_agent)
        service.adapter.create_agency = MagicMock()

        mock_run_result = MagicMock(
            run_id="run-1", response="ok", agent_name="Agent1",
            total_tokens=50, step_count=1, duration_ms=300,
            usage_breakdown=[],
            structured_result=None,
            preview_artifacts=[],
        )
        service.adapter.run = AsyncMock(return_value=mock_run_result)
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                result = await service.execute_run(
                    "a1",
                    "Hi",
                    ctx,
                    compile_preview={
                        "compiledSubgraphs": [
                            {
                                "id": "sg_research",
                                "engine": "agency_swarm",
                                "loweringStrategy": "agency_swarm_adapter",
                                "emulatedNodeIds": [],
                            },
                            {
                                "id": "sg_creative",
                                "engine": "adk2",
                                "loweringStrategy": "adk_dynamic",
                                "emulatedNodeIds": ["router-1"],
                            },
                        ],
                        "bridges": [
                            {
                                "fromSubgraphId": "sg_research",
                                "toSubgraphId": "sg_creative",
                                "toEngine": "adk2",
                                "bridgeMode": "sync",
                                "implicit": False,
                            }
                        ],
                        "planSummary": {
                            "engineMix": ["agency_swarm", "adk2"],
                            "subgraphCount": 2,
                            "bridgeCount": 1,
                            "usesHybrid": True,
                            "errorCount": 0,
                        },
                    },
                )

        assert result.hybrid_summary["usesHybrid"] is True
        assert result.step_attempt_snapshots[0]["subgraph_id"] == "sg_research"
        assert result.step_attempt_snapshots[1]["engine"] == "adk2"

    async def test_execute_run_orchestrator_persists_hybrid_runtime_metadata(self):
        """Orchestrator path persists additive hybrid runtime metadata for later run-detail reads."""
        from app.services.agency_service import AgencyService, RunContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="Base prompt", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
            user_context=None,
        ))
        service._load_agents = AsyncMock(return_value=[{
            "id": "node-1",
            "name": "Router",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "router",
            "node_config": {},
        }])
        service._load_flows_full = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value={"builtin-document-search"})
        service._load_guardrails_for_agents = AsyncMock(return_value={})
        service.credit_manager.pre_check = AsyncMock(return_value=True)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=0.1)
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        mock_orchestrator = MagicMock()
        mock_orchestrator.run = AsyncMock(return_value="orchestrated")

        with patch("app.services.agency_service.should_use_orchestrator", return_value=True):
            with patch("app.services.agency_service.AgencyOrchestrator", return_value=mock_orchestrator):
                ctx = RunContext(
                    user_id=1,
                    tenant_id="t1",
                    conversation_id="c1",
                    user_token="tok",
                )
                await service.execute_run(
                    "a1",
                    "Hello",
                    ctx,
                    compile_preview={
                        "planSummary": {
                            "engineMix": ["agency_swarm", "adk2"],
                            "subgraphCount": 2,
                            "bridgeCount": 1,
                            "usesHybrid": True,
                            "errorCount": 0,
                        }
                    },
                )

        metadata_payloads = [
            call.args[1]["metadata"]
            for call in mock_db.execute.call_args_list
            if len(call.args) > 1 and isinstance(call.args[1], dict) and "metadata" in call.args[1]
        ]
        assert metadata_payloads
        persisted = json.loads(metadata_payloads[-1])
        assert persisted["hybrid_runtime"]["hybrid_summary"]["usesHybrid"] is True


class TestAgencyPreviewPersistencePolicy:
    """Tests for preview payload persistence sizing and streaming preview events."""

    def test_build_preview_artifact_uses_run_payload_indirection_for_large_payload(self):
        from app.services.agency_service import AgencyService

        payload = {
            "title": "Market scan",
            "executive_summary": "Large research payload",
            "sections": [
                {
                    "heading": "Overview",
                    "content": "x" * 70_000,
                    "sources": ["doc-1"],
                },
            ],
            "key_findings": ["Demand is rising"],
            "recommendations": [],
        }
        envelope = {
            "intent": "research_report",
            "summary": "Research preview ready.",
            "payload": payload,
            "references": [],
        }

        artifact = AgencyService._build_preview_artifact(
            run_id="run-1",
            agency_id="agency-1",
            conversation_id="conv-1",
            tenant_id="tenant-1",
            envelope=envelope,
        )

        assert artifact["payload_json"] is None
        assert artifact["payload_storage_key"] == "run_structured_result_payload"

    def test_build_preview_artifact_summarizes_payloads_over_max_size(self):
        from app.services.agency_service import AgencyService

        payload = {
            "title": "Market scan",
            "executive_summary": "Oversized payload",
            "sections": [
                {
                    "heading": "Overview",
                    "content": "x" * (5 * 1024 * 1024 + 512),
                    "sources": ["doc-1"],
                },
            ],
            "key_findings": ["Demand is rising"],
            "recommendations": [],
        }
        envelope = {
            "intent": "research_report",
            "summary": "Research preview ready.",
            "payload": payload,
            "references": [],
        }

        artifact = AgencyService._build_preview_artifact(
            run_id="run-1",
            agency_id="agency-1",
            conversation_id="conv-1",
            tenant_id="tenant-1",
            envelope=envelope,
        )

        assert artifact["payload_storage_key"] == "preview_summary_only"
        assert artifact["payload_json"]["truncated"] is True

    async def test_execute_run_stream_emits_preview_ready_before_run_finished(self):
        from app.services.agency_result_envelope import AgencyEnvelopeParseOutcome, AgencyResultEnvelope
        from app.services.agency_service import AgencyService, RunContext

        class _RawResponse:
            type = "response.output_text.delta"

            def __init__(self, delta: str):
                self.delta = delta

        class _StreamEvent:
            type = "raw_response_event"

            def __init__(self, delta: str):
                self.data = _RawResponse(delta)

        async def _stream():
            yield _StreamEvent("Research ")
            yield _StreamEvent("preview ready.")

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())
        service.adapter.create_agency = MagicMock()
        service.adapter.run_stream = MagicMock(return_value=_stream())
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                with patch(
                    "app.services.agency_service.parse_agency_result_envelope",
                    return_value=AgencyEnvelopeParseOutcome(
                        found=True,
                        valid=True,
                        text_response="Research preview ready.",
                        error=None,
                        envelope=AgencyResultEnvelope(
                            version="1.0",
                            intent="research_report",
                            summary="Research preview ready.",
                            payload={
                                "title": "Market scan",
                                "executive_summary": "The market is moving quickly.",
                                "sections": [],
                                "key_findings": ["Demand is rising"],
                                "recommendations": [],
                            },
                            artifacts=[],
                            references=[],
                            metrics={},
                        ),
                    ),
                ):
                    ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                    events = [event async for event in service.execute_run_stream("a1", "Hello", ctx)]

        event_types = [event["event"] for event in events]
        assert "preview_ready" in event_types
        assert event_types.index("preview_ready") < event_types.index("run_finished")

    async def test_execute_run_stream_orchestrator_passes_whitelist_and_retrieval_scope(self):
        """Streaming orchestrator path receives whitelist and retrieval scope wiring."""
        from app.services.agency_service import AgencyService, RunContext
        from app.services.agency_orchestrator import ExecutionContext

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="Base prompt", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[{
            "id": "node-1",
            "name": "Router",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "router",
            "node_config": {},
        }])
        service._load_flows_full = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value={"builtin-document-search"})
        service._load_guardrails_for_agents = AsyncMock(return_value={})
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        mock_orchestrator = MagicMock()
        mock_ctx = ExecutionContext("Hello", "tok", "t1", user_id=1)
        mock_ctx.browser_sessions = [{
            "sessionId": "lbs_agency_1",
            "summary": {
                "sessionId": "lbs_agency_1",
                "state": "review_required",
                "badgeLabel": "Review Required",
                "statusLine": "Review Required before AI can continue.",
                "primaryActionLabel": "Continue in Browser",
                "pageTitle": "Checkout",
                "url": "https://example.com/checkout",
                "compactNotice": None,
                "sourceLabel": "Agency",
            },
            "updatedAt": "2026-03-12T10:05:00.000Z",
        }]
        mock_orchestrator.run_with_context = AsyncMock(return_value=("orchestrated", mock_ctx))

        with patch("app.services.agency_service.should_use_orchestrator", return_value=True):
            with patch("app.services.agency_service.AgencyOrchestrator", return_value=mock_orchestrator) as mock_ctor:
                ctx = RunContext(
                    user_id=1,
                    tenant_id="t1",
                    conversation_id="c1",
                    user_token="tok",
                    run_metadata={"retrieval_scope": {"effectiveMode": "library_only"}},
                )
                events = [event async for event in service.execute_run_stream("a1", "Hello", ctx)]

        assert [event["event"] for event in events] == ["run_started", "browser_session", "token", "run_finished"]
        assert events[1]["data"]["sessionId"] == "lbs_agency_1"
        ctor_kwargs = mock_ctor.call_args.kwargs
        assert ctor_kwargs["agency_whitelist"] == {"builtin-document-search"}
        assert ctor_kwargs["retrieval_scope_mode"] == "library_only"

    async def test_execute_run_stream_emits_hybrid_summary_and_persists_metadata(self):
        """Streaming runs carry additive hybrid metadata through run_finished and persistence."""
        from app.services.agency_service import AgencyService, RunContext

        async def _stream():
            yield {"type": "response.output_text.delta", "delta": "Hello"}

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value=set())
        service.adapter.create_agency = MagicMock()
        service.adapter.run_stream = MagicMock(return_value=_stream())
        service.adapter.extract_stream_usage = MagicMock(return_value=(10, 5, 5, 0.0, []))
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
                events = [
                    event
                    async for event in service.execute_run_stream(
                        "a1",
                        "Hello",
                        ctx,
                        compile_preview={
                            "compiledSubgraphs": [
                                {
                                    "id": "sg_research",
                                    "engine": "agency_swarm",
                                    "loweringStrategy": "agency_swarm_adapter",
                                    "emulatedNodeIds": [],
                                }
                            ],
                            "planSummary": {
                                "engineMix": ["agency_swarm", "adk2"],
                                "subgraphCount": 2,
                                "bridgeCount": 1,
                                "usesHybrid": True,
                                "errorCount": 0,
                            },
                        },
                    )
                ]

        run_finished = next(event for event in events if event["event"] == "run_finished")
        assert run_finished["data"]["hybrid_summary"]["usesHybrid"] is True
        assert run_finished["data"]["step_attempt_snapshots"][0]["subgraph_id"] == "sg_research"

        metadata_payloads = [
            call.args[1]["metadata"]
            for call in mock_db.execute.call_args_list
            if len(call.args) > 1 and isinstance(call.args[1], dict) and "metadata" in call.args[1]
        ]
        persisted = json.loads(metadata_payloads[-1])
        assert persisted["hybrid_runtime"]["hybrid_summary"]["usesHybrid"] is True


class TestAgencyServiceRunRetrieval:
    async def test_get_run_hydrates_hybrid_runtime_from_compile_preview_metadata(self):
        """get_run backfills hybrid runtime fields from persisted compile_preview metadata."""
        from app.services.agency_service import AgencyService

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        run_row = MagicMock()
        run_row.id = "run-1"
        run_row.status = "completed"
        run_row.total_credits_used = 0
        run_row.started_at = None
        run_row.completed_at = None
        run_row.duration_ms = 123
        run_row.error_type = None
        run_row.error_message = None
        run_row.step_count = 2
        run_row.metadata = {
            "compile_preview": {
                "compiledSubgraphs": [
                    {
                        "id": "sg_review",
                        "engine": "agency_swarm",
                        "loweringStrategy": "agency_swarm_adapter",
                        "emulatedNodeIds": [],
                    }
                ],
                "planSummary": {
                    "engineMix": ["agency_swarm", "adk2"],
                    "subgraphCount": 2,
                    "bridgeCount": 1,
                    "usesHybrid": True,
                    "errorCount": 0,
                },
            }
        }
        run_row.structured_result = None
        run_row.structured_result_parse_status = "not_present"
        run_row.structured_result_intent = None
        run_row.structured_result_summary = None
        run_row.structured_result_error = None
        run_row.conversation_id = "conv-1"

        response_row = MagicMock()
        response_row.content = "hello"

        run_result = MagicMock()
        run_result.first.return_value = run_row
        response_result = MagicMock()
        response_result.first.return_value = response_row
        artifact_result = MagicMock()
        artifact_result.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[run_result, response_result, artifact_result])

        result = await service.get_run("run-1", "agency-1", "tenant-1")

        assert result["response"] == "hello"
        assert result["hybrid_summary"]["usesHybrid"] is True
        assert result["step_attempt_snapshots"][0]["subgraph_id"] == "sg_review"

    async def test_execute_run_stream_passes_retrieval_scope_mode_to_tool_resolution(self):
        """streaming runs apply retrieval scope before tool construction."""
        from app.services.agency_service import AgencyService, RunContext

        async def _stream():
            yield {"type": "response.output_text.delta", "delta": "Hello"}

        mock_db = _make_mock_db()
        service = AgencyService(db=mock_db)

        service.load_agency = AsyncMock(return_value=MagicMock(
            agency_id="a1", tenant_id="t1", name="Test",
            system_prompt="", communication_flows=[],
            max_run_time_seconds=600, user_id=1, conversation_id="c1",
            credit_multiplier=1.0, creator_fee_credits=0, creator_id=None, platform_share_pct=20,
        ))
        service._load_agents = AsyncMock(return_value=[{
            "id": "agent-1",
            "name": "Researcher",
            "instructions": "Research topics",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
        }])
        service._load_flows = AsyncMock(return_value=[])
        service._load_tool_whitelist = AsyncMock(return_value={"builtin-document-search"})
        service.adapter.create_agent = MagicMock(return_value=MagicMock(name="Agent1"))
        service.adapter.create_agency = MagicMock()
        service.adapter.run_stream = MagicMock(return_value=_stream())
        service.credit_manager.apply_multiplier_markup = AsyncMock()

        mock_resolve_tools = AsyncMock(return_value=[])
        with patch("app.services.agency_service.resolve_tools_for_agent", mock_resolve_tools):
            with patch("app.services.agency_service.create_persistence_hooks", return_value=(AsyncMock(), AsyncMock())):
                ctx = RunContext(
                    user_id=1,
                    tenant_id="t1",
                    conversation_id="c1",
                    user_token="tok",
                    run_metadata={
                        "retrieval_scope": {
                            "effectiveMode": "library_only",
                        }
                    },
                )
                _ = [event async for event in service.execute_run_stream("a1", "Hello", ctx)]

        mock_resolve_tools.assert_awaited_once()
        assert mock_resolve_tools.await_args.kwargs["retrieval_scope_mode"] == "library_only"


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
        service._load_tool_whitelist = AsyncMock(return_value=set())
        service.credit_manager.pre_check = AsyncMock(return_value=False)
        service.credit_manager.estimate_run_cost = MagicMock(return_value=10.0)

        with patch("app.services.agency_service.resolve_tools_for_agent", AsyncMock(return_value=[])):
            ctx = RunContext(user_id=1, tenant_id="t1", conversation_id="c1", user_token="tok")
            with pytest.raises(InsufficientCreditsError):
                await service.execute_run("a1", "Hello", ctx)
