import unittest

from tools.spec_handoff.contracts import completion_eligible, new_manifest, validate_ledger, validate_manifest


def manifest():
    value = new_manifest({"spec_id": "S-1", "slug": "s-1", "title": "Example", "canonical_path": "specs/feature/s-1/spec.md", "digest": "abc"}, now="2026-10-06T00:00:00Z")
    value["authority"]["confidence"] = "HIGH"
    value["authority"]["status"] = "ACTIVE_CANONICAL"
    value["disposition"] = {"value": "ACTIVE_CANONICAL", "rationale": "current", "confidence": "HIGH", "evidence": ["docs/architecture.md"]}
    value["continuation_assessment"] = {"decision": "VALIDATION_ONLY", "confidence": "HIGH", "rationale": "implementation mapped", "residual_requirements": [], "evidence": ["tests"], "next_action": "verify"}
    value["lifecycle"]["current_state"] = "VERIFIED"
    value["reconciliation"]["confidence"] = "HIGH"
    value["integration"] = {"canonical_ref": "refs/heads/main", "integrated": True, "canonical_sha": "sha-1", "integrated_at": "2026-10-06T00:00:00Z"}
    value["verification"] = {"status": "PASS", "sha": "sha-1", "required_profiles": ["quick"], "evidence": ["tests.log"], "freshness": "FRESH"}
    return value


class ContractTests(unittest.TestCase):
    def test_manifest_keeps_three_dimensions_separate(self):
        value = manifest()
        value["disposition"]["value"] = "SUPERSEDED_FULL"
        value["lifecycle"]["current_state"] = "IMPLEMENTATION_COMPLETE"
        value["continuation_assessment"]["decision"] = "DO_NOT_CONTINUE_SUPERSEDED"
        self.assertEqual(validate_manifest(value), [])

    def test_incomplete_does_not_imply_continue_required(self):
        value = manifest()
        value["lifecycle"]["current_state"] = "PARTIAL_INTEGRATED"
        value["continuation_assessment"]["decision"] = "RECONCILIATION_REQUIRED"
        self.assertNotEqual(value["continuation_assessment"]["decision"], "CONTINUE_REQUIRED")

    def test_completion_rejects_completion_file_only_state(self):
        value = manifest()
        value["verification"] = {"status": "UNKNOWN", "sha": None}
        eligible, reasons = completion_eligible(value, {"requirements": []})
        self.assertFalse(eligible)
        self.assertTrue(any("verification" in reason for reason in reasons))

    def test_completion_rejects_stale_verification_sha(self):
        value = manifest()
        value["verification"]["sha"] = "old-sha"
        eligible, reasons = completion_eligible(value, {"requirements": []})
        self.assertFalse(eligible)
        self.assertTrue(any("canonical SHA" in reason for reason in reasons))

    def test_completion_rejects_missing_deployment_and_acceptance(self):
        value = manifest()
        value["deployment"] = {"required": True, "status": "UNKNOWN"}
        value["acceptance"] = {"required": True, "status": "UNKNOWN"}
        eligible, reasons = completion_eligible(value, {"requirements": []})
        self.assertFalse(eligible)
        self.assertTrue(any("deployment" in reason for reason in reasons))
        self.assertTrue(any("acceptance" in reason for reason in reasons))

    def test_open_requirement_prevents_complete(self):
        eligible, reasons = completion_eligible(manifest(), {"requirements": [{"requirement_id": "R-1", "status": "OPEN"}]})
        self.assertFalse(eligible)
        self.assertTrue(any("R-1" in reason for reason in reasons))

    def test_pass_requirement_requires_fresh_evidence_bound_to_canonical_sha(self):
        requirement = {"requirement_id": "R-2", "status": "PASS", "implementation_evidence": ["src/a.py"], "verification_evidence": ["test.log"], "evidence_freshness": "STALE", "evidence_sha": "old-sha"}
        eligible, reasons = completion_eligible(manifest(), {"requirements": [requirement]})
        self.assertFalse(eligible)
        self.assertTrue(any("R-2 evidence" in reason for reason in reasons))

    def test_manual_non_applicable_requirement_needs_rationale(self):
        requirement = {"requirement_id": "R-3", "applicability": "NOT_APPLICABLE", "status": "NOT_APPLICABLE", "next_action": "none"}
        eligible, reasons = completion_eligible(manifest(), {"requirements": [requirement]})
        self.assertFalse(eligible)
        self.assertTrue(any("rationale" in reason for reason in reasons))

    def test_ledger_rejects_intermediate_state_without_next_action(self):
        errors = validate_ledger({"schema_version": 1, "spec_id": "S-1", "spec_digest": "abc", "requirements": [{"requirement_id": "R-4", "final_state": "OPEN"}]})
        self.assertTrue(any("next_action" in error for error in errors))

    def test_low_confidence_cannot_complete(self):
        value = manifest()
        value["reconciliation"]["confidence"] = "LOW"
        eligible, reasons = completion_eligible(value, {"requirements": []})
        self.assertFalse(eligible)
        self.assertTrue(any("confidence" in reason for reason in reasons))

    def test_invalid_manifest_has_no_completion_path(self):
        eligible, reasons = completion_eligible({}, {"requirements": []})
        self.assertFalse(eligible)
        self.assertTrue(reasons)

    def test_all_applicable_requirements_with_fresh_exact_sha_can_complete(self):
        requirement = {"requirement_id": "R-5", "status": "PASS", "final_state": "PASS", "implementation_evidence": ["src/a.py"], "verification_evidence": ["tests.log"], "evidence_freshness": "FRESH", "evidence_sha": "sha-1"}
        eligible, reasons = completion_eligible(manifest(), {"requirements": [requirement]})
        self.assertTrue(eligible, reasons)

    def test_retirement_requires_rationale_and_evidence(self):
        value = manifest()
        value["continuation_assessment"] = {"decision": "DO_NOT_CONTINUE_RETIRED", "confidence": "HIGH", "rationale": "retired", "residual_requirements": [], "evidence": [], "next_action": "none"}
        self.assertTrue(any("DO_NOT_CONTINUE requires" in error for error in validate_manifest(value)))

    def test_age_metadata_does_not_change_continuation_policy(self):
        value = manifest()
        value["identity"]["metadata"] = {"spec_created_at": "2001-01-01T00:00:00Z", "spec_last_changed_at": "2001-01-01T00:00:00Z"}
        self.assertTrue(completion_eligible(value, {"requirements": []})[0])


if __name__ == "__main__":
    unittest.main()
