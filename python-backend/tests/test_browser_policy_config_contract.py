import json
from pathlib import Path

import pytest

from app.services.browser_policy_contract import BrowserWorkflowEntitlement


FIXTURE_DIR = (
    Path(__file__).resolve().parents[2]
    / "specs"
    / "feature"
    / "033-Browser-Automation-Policy"
    / "fixtures"
)


def test_browser_policy_entitlement_fixture_parses_without_drift():
    fixture = json.loads((FIXTURE_DIR / "browser-policy-entitlement.json").read_text())

    parsed = BrowserWorkflowEntitlement.model_validate(fixture)

    assert parsed.tenantId == "tenant-123"
    assert parsed.workflowId == 42
    assert parsed.config.approvalTtlSeconds == 300


@pytest.mark.parametrize("ttl", [59, 901])
def test_browser_policy_entitlement_rejects_invalid_ttl(ttl: int):
    fixture = json.loads((FIXTURE_DIR / "browser-policy-entitlement.json").read_text())
    fixture["config"]["approvalTtlSeconds"] = ttl

    with pytest.raises(Exception):
        BrowserWorkflowEntitlement.model_validate(fixture)
