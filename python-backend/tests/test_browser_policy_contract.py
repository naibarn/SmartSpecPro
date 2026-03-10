import json
from pathlib import Path

from app.services.browser_policy_contract import BrowserPolicyDecisionEnvelope


FIXTURE_DIR = (
    Path(__file__).resolve().parents[2]
    / "specs"
    / "feature"
    / "033-Browser-Automation-Policy"
    / "fixtures"
)


def test_browser_policy_decision_fixture_parses_without_drift():
    fixture = json.loads((FIXTURE_DIR / "browser-policy-decision-envelope.json").read_text())

    parsed = BrowserPolicyDecisionEnvelope.model_validate(fixture)

    assert parsed.version == "2026-03-10"
    assert parsed.actionClass == "restricted"
    assert parsed.decision == "require_approval"
