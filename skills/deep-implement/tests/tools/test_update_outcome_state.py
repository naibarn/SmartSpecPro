"""Outcome finalization is evidence-gated by the shared lifecycle kernel."""
import json
from scripts.lib.config import update_outcome_state


def test_missing_evidence_keeps_outcome_validation_pending(mock_implementation_dir):
    (mock_implementation_dir / "deep_implement_config.json").write_text(json.dumps({"plugin_root": "", "sections": []}))
    state = update_outcome_state(mock_implementation_dir, {
        "requirements": [{"requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS"}],
        "integrated": True,
        "required_verification_fresh": True,
        "task_regressions_clear": True,
        "authority_resolved": True,
    })
    assert state == "VALIDATION_PENDING"


def test_fresh_predicate_evidence_closes_outcome(mock_implementation_dir):
    (mock_implementation_dir / "deep_implement_config.json").write_text(json.dumps({"plugin_root": "", "sections": []}))
    state = update_outcome_state(mock_implementation_dir, {
        "requirements": [{
            "requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS",
            "completion_predicate": {"kind": "test_passes", "source": "tests/test_r1.py"},
            "completion_predicate_satisfied": True, "evidence": ["tests/test_r1.py"], "evidence_fresh": True,
        }],
        "integrated": True,
        "required_verification_fresh": True,
        "task_regressions_clear": True,
        "authority_resolved": True,
    })
    assert state == "COMPLETE"
