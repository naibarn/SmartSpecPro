import unittest

from composition_scan import build_evidence, can_promote, checkpoint_key, normalize_point


class CompositionScanTests(unittest.TestCase):
    def test_normalization_is_bounded_and_truthful(self):
        point = normalize_point({"timeMs": -10, "x": 4, "y": -1, "confidence": 3, "kind": "unknown"})
        self.assertEqual(point.time_ms, 0)
        self.assertEqual(point.x, 1)
        self.assertEqual(point.y, 0)
        self.assertEqual(point.kind, "activity")

    def test_evidence_is_bounded_and_promotable(self):
        evidence = build_evidence(
            [{"timeMs": index, "x": 0.5, "y": 0.5, "confidence": 0.8, "kind": "face"} for index in range(400)],
            [],
            analysis_mode="full_scan",
            source_fingerprint="source-a",
            mark_revision=2,
            policy_fingerprint="policy-a",
            capability_profile_fingerprint="cap-a",
            trim_range={"startMs": 0, "endMs": 1000},
            aspect_profile="9:16",
        )
        self.assertEqual(len(evidence["trackPoints"]), 256)
        self.assertEqual(evidence["status"], "degraded")
        approved_evidence = build_evidence(
            [{"timeMs": 0, "x": 0.5, "y": 0.5, "confidence": 0.9, "kind": "object"}],
            [],
            analysis_mode="full_scan",
            source_fingerprint="source-a",
            mark_revision=2,
            policy_fingerprint="policy-a",
            capability_profile_fingerprint="cap-object-a",
            trim_range={"startMs": 0, "endMs": 1000},
            aspect_profile="9:16",
            interaction_capability_available=True,
        )
        self.assertEqual(approved_evidence["status"], "approved")
        checkpoint = {**{key: evidence[key] for key in ("sourceFingerprint", "markRevision", "policyFingerprint", "capabilityProfileFingerprint", "trimRange", "aspectProfile", "analysisMode", "evidenceRef")}, "jobId": "job-1", "status": "approved"}
        current = {"jobId": "job-1", "sourceFingerprint": "source-a", "markRevision": 2, "policyFingerprint": "policy-a", "capabilityProfileFingerprint": "cap-a", "trimRange": {"startMs": 0, "endMs": 1000}, "aspectProfile": "9:16", "analysisMode": "full_scan"}
        self.assertTrue(can_promote(checkpoint, current, evidence["evidenceRef"]))
        self.assertFalse(can_promote(checkpoint, {**current, "markRevision": 3}, evidence["evidenceRef"]))
        self.assertIn("composition-scan:job-1", checkpoint_key("job-1", "source-a", 2, "policy-a", "cap-a", {"startMs": 0, "endMs": 1000}, "9:16", "full_scan"))


if __name__ == "__main__":
    unittest.main()
