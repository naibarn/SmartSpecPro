from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


def _load_skill_module():
    skill_path = Path(__file__).resolve().parents[1] / "python" / "skill.py"
    spec = importlib.util.spec_from_file_location("isc_skill", skill_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load isc skill module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ImprovementPresetTests(unittest.TestCase):
    def test_trace_friendly_preset_maps_to_guidance(self) -> None:
        skill = _load_skill_module()
        self.assertIn("trace-friendly", skill._resolve_improvement_request({"improvement_preset": "trace_friendly"}))

    def test_custom_request_is_preserved_and_augmented(self) -> None:
        skill = _load_skill_module()
        resolved = skill._resolve_improvement_request(
            {
                "improvement_preset": "deterministic",
                "improvement_request": "Preserve bundle compatibility.",
            }
        )
        self.assertIn("deterministic", resolved)
        self.assertIn("Preserve bundle compatibility.", resolved)
