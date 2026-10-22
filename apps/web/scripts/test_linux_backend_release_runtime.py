import tempfile
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from linux_backend_release import ReleaseError, node_executable_evidence, node_runtime_evidence


class NodeRuntimeEvidenceTests(unittest.TestCase):
    def read_version(self, version: str) -> dict[str, str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executable = root / "node"
            executable.write_text(f"#!/bin/sh\nprintf '%s\\n' '{version}'\n", encoding="utf-8")
            executable.chmod(0o755)
            process_exe = root / "proc" / "123" / "exe"
            process_exe.parent.mkdir(parents=True)
            process_exe.symlink_to(executable)
            return node_runtime_evidence(123, root / "proc")

    def test_records_exact_executable_at_security_floor(self):
        evidence = self.read_version("v22.23.4")
        self.assertEqual(evidence["version"], "v22.23.4")
        self.assertTrue(evidence["executable"].endswith("/node"))

    def test_rejects_vulnerable_patch(self):
        with self.assertRaisesRegex(ReleaseError, "using Node v22.23.3"):
            self.read_version("v22.23.3")

    def test_rejects_a_different_release_line_for_this_service(self):
        with self.assertRaisesRegex(ReleaseError, "require Node 22.23.4"):
            self.read_version("v24.22.1")

    def test_release_preflight_accepts_patched_target_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "node"
            executable.write_text("#!/bin/sh\nprintf '%s\\n' 'v22.23.4'\n", encoding="utf-8")
            executable.chmod(0o755)
            self.assertEqual(node_executable_evidence(executable)["version"], "v22.23.4")

    def test_release_preflight_rejects_old_target_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "node"
            executable.write_text("#!/bin/sh\nprintf '%s\\n' 'v22.22.3'\n", encoding="utf-8")
            executable.chmod(0o755)
            with self.assertRaisesRegex(ReleaseError, "require Node 22.23.4"):
                node_executable_evidence(executable)


if __name__ == "__main__":
    unittest.main()
