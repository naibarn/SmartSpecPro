"""Tests for Auto Draft Agent template seed data."""
import pytest
from unittest.mock import AsyncMock, MagicMock

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestAgentSeedData:

    def test_agent_seed_has_correct_name(self):
        from app.seeds.auto_draft_agent import AGENCY_NAME

        assert AGENCY_NAME == "Auto Draft Agent"

    def test_agent_seed_has_visibility_template(self):
        from app.seeds.auto_draft_agent import AGENCY_VISIBILITY

        assert AGENCY_VISIBILITY == "template"

    def test_agent_seed_has_system_tenant(self):
        from app.seeds.auto_draft_agent import AGENCY_TENANT_ID

        assert AGENCY_TENANT_ID == "__system__"

    def test_agent_seed_assigns_all_5_tools(self):
        from app.seeds.auto_draft_agent import AGENT_TOOL_IDS

        expected = {
            "builtin-skill-discovery",
            "builtin-model-suggest",
            "builtin-auto-draft",
            "builtin-rag-knowledge",
            "builtin-file-parse",
        }
        assert set(AGENT_TOOL_IDS) == expected

    def test_agent_instructions_contain_decision_steps(self):
        from app.seeds.auto_draft_agent import AGENT_INSTRUCTIONS

        required_keywords = [
            "analyze",
            "skill",
            "model",
            "style",
            "param",
            "generate",
            "envelope",
        ]
        instructions_lower = AGENT_INSTRUCTIONS.lower()
        for kw in required_keywords:
            assert kw in instructions_lower, f"Missing keyword '{kw}'"


class TestAgentUpsert:

    @pytest.mark.asyncio
    async def test_upsert_is_idempotent(self):
        from app.seeds.auto_draft_agent import seed_auto_draft_agent

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=MagicMock())
        mock_session.commit = AsyncMock()

        await seed_auto_draft_agent(mock_session)
        first_call_count = mock_session.execute.call_count

        mock_session.execute.reset_mock()
        await seed_auto_draft_agent(mock_session)
        second_call_count = mock_session.execute.call_count

        assert first_call_count == second_call_count

    @pytest.mark.asyncio
    async def test_upsert_updates_instructions_without_duplicates(self):
        from app.seeds.auto_draft_agent import seed_auto_draft_agent

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=MagicMock())
        mock_session.commit = AsyncMock()

        await seed_auto_draft_agent(mock_session)

        calls = mock_session.execute.call_args_list
        sql_texts = [str(call[0][0]) if call[0] else "" for call in calls]
        has_upsert = any("ON CONFLICT" in s or "on conflict" in s.lower() for s in sql_texts)
        assert has_upsert, "Seed must use ON CONFLICT (upsert) to be idempotent"
