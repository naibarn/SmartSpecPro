from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from isc.native_bundle import build_native_skill_files, improve_native_skill_bundle, validate_native_skill_bundle

PYTHON_BACKEND_ROOT = Path(__file__).resolve().parents[5] / "python-backend"
if str(PYTHON_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_BACKEND_ROOT))

from app.services.openai_agents_subagent_contracts import load_native_subagent_topology  # noqa: E402


class NativeBundleContractTests(unittest.TestCase):
    def test_native_bundle_includes_agents_python_metadata_and_validates(self) -> None:
        plan = {
            "skill_name": "demo-agents-bundle",
            "skill_title": "Demo Agents Bundle",
            "description": "Demo OpenAI Agents Python bundle.",
            "version": "1.0.0",
            "category": "automation",
            "execution_mode": "sandbox-command",
            "inputs": [{"name": "topic", "description": "Topic to process"}],
            "outputs": [{"name": "result", "description": "Processed result"}],
            "workflow": ["inspect", "plan", "execute", "verify"],
            "guardrails": ["Keep scripts deterministic."],
            "final_response_checklist": ["Verification passes."],
            "trigger_patterns": ["demo agents bundle", "openai agents python"],
            "mirror_skill_md": True,
            "model_compatibility": {"tier": "Tier A - Agents SDK ready"},
        }

        files = build_native_skill_files(plan)
        self.assertIn("SKILL.md", files)
        self.assertIn("skill.md", files)
        self.assertIn("skill.lock.json", files)
        self.assertIn("target_platform: agents_python", files["skill.md"])
        self.assertIn("execution_mode: sandbox-command", files["skill.md"])
        self.assertIn("category: automation", files["skill.md"])

        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "demo-agents-bundle"
            for relative_path, content in files.items():
                path = bundle_dir / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                if path.suffix == ".sh":
                    path.chmod(0o755)

            results = validate_native_skill_bundle(bundle_dir)

        self.assertTrue(all(result.ok for result in results), [result.errors for result in results if not result.ok])

    def test_native_subagent_bundle_loads_in_python_runtime_contract(self) -> None:
        plan = {
            "skill_name": "demo-runtime-compatible-bundle",
            "skill_title": "Demo Runtime Compatible Bundle",
            "description": "Demo OpenAI Agents Python bundle with runtime-compatible specialists.",
            "version": "1.0.0",
            "category": "automation",
            "execution_mode": "sandbox-command",
            "subagents": [{"name": "researcher", "role": "research", "mode": "tool"}],
            "mirror_skill_md": True,
            "model_compatibility": {"tier": "Tier A - Agents SDK ready"},
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "demo-runtime-compatible-bundle"
            for relative_path, content in build_native_skill_files(plan).items():
                path = bundle_dir / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                if path.suffix == ".sh":
                    path.chmod(0o755)

            validation_results = validate_native_skill_bundle(bundle_dir)
            topology = load_native_subagent_topology(bundle_dir)

        self.assertTrue(all(result.ok for result in validation_results), [result.errors for result in validation_results if not result.ok])
        self.assertIsNotNone(topology)
        self.assertEqual(topology.orchestrator.mode, "orchestrator")
        self.assertEqual([node.name for node in topology.subagents], ["researcher"])
        self.assertEqual(topology.securityPolicy.allowedInvocationModes, ("tool",))

    def test_native_bundle_improve_applies_request_and_bumps_version(self) -> None:
        plan = {
            "skill_name": "demo-agents-bundle",
            "skill_title": "Demo Agents Bundle",
            "description": "Demo OpenAI Agents Python bundle.",
            "version": "1.0.0",
            "category": "automation",
            "execution_mode": "sandbox-command",
            "inputs": [],
            "outputs": [],
            "workflow": ["inspect", "plan", "execute", "verify"],
            "guardrails": ["Keep scripts deterministic."],
            "final_response_checklist": ["Verification passes."],
            "trigger_patterns": ["demo agents bundle"],
            "mirror_skill_md": True,
            "model_compatibility": {"tier": "Tier A - Agents SDK ready"},
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "demo-agents-bundle"
            for relative_path, content in build_native_skill_files(plan).items():
                path = bundle_dir / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                if path.suffix == ".sh":
                    path.chmod(0o755)

            written, report, updated_plan = improve_native_skill_bundle(
                bundle_dir,
                improvement_request="Make the bundle deterministic and trace-friendly.",
                overwrite=True,
            )

            skill_md = (bundle_dir / "SKILL.md").read_text(encoding="utf-8")
            lock = (bundle_dir / "skill.lock.json").read_text(encoding="utf-8")

        self.assertGreater(len(written), 0)
        self.assertEqual(report.pass_rate, 1.0)
        self.assertEqual(updated_plan["version"], "1.0.1")
        self.assertIn("deterministic, idempotent", skill_md)
        self.assertIn("Keep logs trace-friendly with explicit task IDs and outcome messages.", skill_md)
        self.assertIn('"version": "1.0.1"', lock)

    def test_native_bundle_emits_and_validates_subagent_topology(self) -> None:
        plan = {
            "skill_name": "demo-subagent-bundle",
            "skill_title": "Demo Subagent Bundle",
            "description": "Demo OpenAI Agents Python bundle with specialists.",
            "version": "1.0.0",
            "category": "automation",
            "execution_mode": "sandbox-command",
            "inputs": [{"name": "topic", "description": "Topic to process"}],
            "outputs": [{"name": "result", "description": "Processed result"}],
            "workflow": ["inspect", "plan", "execute", "verify"],
            "guardrails": ["Keep scripts deterministic."],
            "final_response_checklist": ["Verification passes."],
            "trigger_patterns": ["demo agents bundle", "openai agents python"],
            "subagents": [
                {
                    "name": "researcher",
                    "role": "research",
                    "mode": "tool",
                    "entrypoint": "agents/specialists/researcher.md",
                    "toolBoundary": ["search", "summarize"],
                    "handoffPolicy": {"mode": "never"},
                    "checkpointPolicy": {"mode": "per-run"},
                    "verificationCommand": "scripts/verify.sh",
                    "fallbackBehavior": "return-error",
                }
            ],
            "orchestrator": {
                "name": "demo-subagent-bundle-orchestrator",
                "role": "orchestrator",
                "entrypoint": "agents/orchestrator.md",
            },
            "routing": [{"from": "orchestrator", "to": "researcher"}],
            "checkpointPolicy": {"mode": "parent-run"},
            "verificationPolicy": {"command": "scripts/verify.sh"},
            "fallbackPolicy": {"behavior": "escalate-to-parent"},
            "mirror_skill_md": True,
            "model_compatibility": {"tier": "Tier A - Agents SDK ready"},
        }

        files = build_native_skill_files(plan)
        self.assertIn("subagents.json", files)
        self.assertIn("references/subagents.md", files)
        self.assertIn("agents/orchestrator.md", files)
        self.assertIn("agents/specialists/researcher.md", files)

        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "demo-subagent-bundle"
            for relative_path, content in files.items():
                path = bundle_dir / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                if path.suffix == ".sh":
                    path.chmod(0o755)

            results = validate_native_skill_bundle(bundle_dir)

        self.assertTrue(all(result.ok for result in results), [result.errors for result in results if not result.ok])

    def test_native_bundle_rejects_manifest_drift_and_undeclared_routing(self) -> None:
        plan = {
            "skill_name": "demo-subagent-bundle",
            "skill_title": "Demo Subagent Bundle",
            "description": "Demo OpenAI Agents Python bundle with specialists.",
            "version": "1.0.0",
            "category": "automation",
            "execution_mode": "sandbox-command",
            "inputs": [],
            "outputs": [],
            "workflow": ["inspect", "plan", "execute", "verify"],
            "guardrails": ["Keep scripts deterministic."],
            "final_response_checklist": ["Verification passes."],
            "trigger_patterns": ["demo agents bundle"],
            "subagents": [
                {
                    "name": "researcher",
                    "role": "research",
                    "mode": "tool",
                    "entrypoint": "agents/specialists/researcher.md",
                    "toolBoundary": ["search"],
                    "handoffPolicy": {"mode": "never"},
                    "checkpointPolicy": {"mode": "per-run"},
                    "verificationCommand": "scripts/verify.sh",
                    "fallbackBehavior": "return-error",
                }
            ],
            "orchestrator": {
                "name": "demo-subagent-bundle-orchestrator",
                "role": "orchestrator",
                "entrypoint": "agents/orchestrator.md",
            },
            "routing": [{"from": "orchestrator", "to": "researcher"}],
            "checkpointPolicy": {"mode": "parent-run"},
            "verificationPolicy": {"command": "scripts/verify.sh"},
            "fallbackPolicy": {"behavior": "escalate-to-parent"},
            "mirror_skill_md": True,
            "model_compatibility": {"tier": "Tier A - Agents SDK ready"},
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "demo-subagent-bundle"
            for relative_path, content in build_native_skill_files(plan).items():
                path = bundle_dir / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
                if path.suffix == ".sh":
                    path.chmod(0o755)

            manifest_path = bundle_dir / "subagents.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["routing"] = [{"from": "orchestrator", "to": "ghost"}]
            manifest.pop("verificationPolicy", None)
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            results = validate_native_skill_bundle(bundle_dir)

        errors = [error for result in results for error in result.errors]
        self.assertTrue(any("routing[0] targets undeclared subagent" in error for error in errors), errors)
        self.assertTrue(any("missing required top-level field: verificationPolicy" in error for error in errors), errors)
        self.assertTrue(any("subagent_manifest_sha256 does not match subagents.json" in error for error in errors), errors)
