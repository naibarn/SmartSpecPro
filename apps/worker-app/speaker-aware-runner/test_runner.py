import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RUNNER = ROOT / "speaker_aware_runner.py"


class RunnerContractTests(unittest.TestCase):
    def test_version_is_available_without_ml_models(self):
        completed = subprocess.run([sys.executable, str(RUNNER), "--version"], capture_output=True, text=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("contract=feature-179-v1", completed.stdout)

    def test_manual_review_scan_emits_worker_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ffmpeg = shutil.which("ffmpeg")
            if not ffmpeg:
                self.skipTest("ffmpeg is required for the contract fixture")
            source = root / "source.mp4"
            subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=2", "-t", "0.5", str(source)], check=True)
            checksum = hashlib.sha256(source.read_bytes()).hexdigest()
            request = root / "request.json"
            output = root / "output.json"
            request.write_text(json.dumps({
                "contractVersion": "feature-179-v1",
                "jobId": "test-job",
                "kind": "speaker_aware_media_scan",
                "sourceChecksum": checksum,
                "sourceArtifact": {"artifactId": "source-1", "revision": "r1", "checksum": checksum, "kind": "video"},
                "workflowMode": "custom",
                "requestedStages": ["manual_review"],
                "analysisPaths": [],
                "adapterPolicy": {
                    "contractVersion": "feature-179-v1",
                    "vad": {"enabledAdapters": [], "primary": "SileroOnnx", "fallbackPolicy": "deny", "fallbackAllowList": [], "required": False},
                    "diarization": {"enabledAdapters": [], "primary": "PyannoteDiarization", "fallbackPolicy": "deny", "fallbackAllowList": [], "required": False},
                    "face": {"enabledAdapters": [], "primary": "MediaPipeFace", "fallbackPolicy": "deny", "fallbackAllowList": [], "required": False},
                    "person": {"enabledAdapters": [], "primary": "PersonBody", "fallbackPolicy": "deny", "fallbackAllowList": [], "required": False},
                    "activeSpeaker": {"enabledAdapters": [], "primary": "ActiveSpeakerFusion", "fallbackPolicy": "deny", "fallbackAllowList": [], "required": False},
                    "maxScanWindowMs": 1000,
                    "maxConcurrentProcesses": 1,
                },
            }), encoding="utf-8")
            completed = subprocess.run([sys.executable, str(RUNNER), "--request", str(request), "--input", str(source), "--output", str(output)], capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(result["contractVersion"], "feature-179-v1")
            self.assertEqual(result["sourceChecksum"], checksum)
            self.assertEqual(result["sourceArtifact"]["checksum"], checksum)
            self.assertEqual(
                {item["adapterId"] for item in result["adapterCapabilities"]},
                {"SileroOnnx", "FireRedOnnx", "TenVad", "WebRtcVad", "PyannoteDiarization", "MediaPipeFace", "PersonBody", "ActiveSpeakerFusion"},
            )


if __name__ == "__main__":
    unittest.main()
