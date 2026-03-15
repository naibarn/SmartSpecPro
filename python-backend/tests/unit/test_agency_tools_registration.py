"""Tests for content automation tool registration in agency_tools."""
import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestContentAutomationToolRegistration:

    def test_builtin_auto_draft_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS

        assert _BUILTIN_ENDPOINTS["builtin-auto-draft"] == "/api/internal/tools/auto-draft"

    def test_builtin_model_suggest_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS

        assert _BUILTIN_ENDPOINTS["builtin-model-suggest"] == "/api/internal/tools/model-suggest"

    def test_builtin_file_parse_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS

        assert _BUILTIN_ENDPOINTS["builtin-file-parse"] == "/api/internal/tools/file-parse"

    def test_builtin_schedule_draft_registered_in_endpoints(self):
        from app.services.agency_tools import _BUILTIN_ENDPOINTS

        assert _BUILTIN_ENDPOINTS["builtin-schedule-draft"] == "/api/internal/tools/schedule-draft"

    def test_builtin_auto_draft_risk_level_is_medium(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS["builtin-auto-draft"] == "medium"

    def test_builtin_model_suggest_risk_level_is_low(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS["builtin-model-suggest"] == "low"

    def test_builtin_file_parse_risk_level_is_medium(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS["builtin-file-parse"] == "medium"

    def test_builtin_schedule_draft_risk_level_is_high(self):
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS["builtin-schedule-draft"] == "high"
