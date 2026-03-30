from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc.creator import SkillCreator  # noqa: E402
from isc.evaluator import evaluate_from_path  # noqa: E402


class EvaluatorTests(unittest.TestCase):
    def _make_skill(
        self,
        *,
        code: str,
        tests: list[dict],
        output_schema: dict,
        language: str = "python",
        code_rel_path: str | None = None,
    ) -> Path:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        skill_dir = Path(tmpdir.name) / "demo-skill"
        skill_dir.mkdir(parents=True, exist_ok=True)
        if code_rel_path:
            target = skill_dir / code_rel_path
        elif language == "python":
            target = skill_dir / "python" / "skill.py"
        else:
            target = skill_dir / "js" / "skill.js"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(code, encoding="utf-8")
        (skill_dir / "tests").mkdir(exist_ok=True)
        (skill_dir / "tests" / "tests.json").write_text(
            json.dumps({"tests": tests}),
            encoding="utf-8",
        )
        (skill_dir / "schemas").mkdir(exist_ok=True)
        (skill_dir / "schemas" / "output.schema.json").write_text(
            json.dumps(output_schema),
            encoding="utf-8",
        )
        return skill_dir

    def test_evaluator_fails_invalid_json_output(self) -> None:
        skill_dir = self._make_skill(
            code="def respond(input, context=None):\n    return 'not json'\n",
            tests=[
                {
                    "id": "invalid_json",
                    "input": {},
                    "expected_success": True,
                    "expected_schema_valid": True,
                }
            ],
            output_schema={
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {"success": {"type": "boolean"}, "output": {"type": "string"}},
                "required": ["success", "output"],
            },
        )

        report = evaluate_from_path(skill_dir)

        self.assertEqual(report.passed, 0)
        self.assertIn("contract/invalid-json", report.results[0].categories)

    def test_evaluator_fails_schema_mismatch(self) -> None:
        skill_dir = self._make_skill(
            code="def respond(input, context=None):\n    return '{\"success\": true, \"output\": 123}'\n",
            tests=[
                {
                    "id": "schema_fail",
                    "input": {},
                    "expected_success": True,
                    "expected_schema_valid": True,
                }
            ],
            output_schema={
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {"success": {"type": "boolean"}, "output": {"type": "string"}},
                "required": ["success", "output"],
            },
        )

        report = evaluate_from_path(skill_dir)

        self.assertEqual(report.passed, 0)
        self.assertIn("contract/schema", report.results[0].categories)

    def test_evaluator_checks_forbidden_text_and_json_paths(self) -> None:
        skill_dir = self._make_skill(
            code=(
                "def respond(input, context=None):\n"
                "    return '{\"success\": true, \"output\": \"hello\", \"answer\": 7}'\n"
            ),
            tests=[
                {
                    "id": "contract_pass",
                    "input": {},
                    "expected_success": True,
                    "expected_schema_valid": True,
                    "expected_json_paths": {"answer": 7},
                    "forbidden_contains": ["traceback"],
                }
            ],
            output_schema={
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "output": {"type": "string"},
                    "answer": {"type": "number"},
                },
                "required": ["success", "output", "answer"],
            },
        )

        report = evaluate_from_path(skill_dir)

        self.assertEqual(report.passed, 1)
        self.assertEqual(report.results[0].reasons, [])

    def test_legacy_fixture_skills_pass_under_new_evaluator(self) -> None:
        fixture_root = TEST_ROOT / "skills"

        math_report = evaluate_from_path(fixture_root / "skill_math_tutor")
        formatter_report = evaluate_from_path(fixture_root / "skill_code_formatter")

        self.assertEqual(math_report.passed, math_report.total)
        self.assertEqual(formatter_report.passed, formatter_report.total)

    def test_evaluator_runs_mjs_skill_exports(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node runtime not available in test environment")

        skill_dir = self._make_skill(
            code=(
                "export async function respond(input, context = null) {\n"
                "  return JSON.stringify({ success: true, output: 'esm ok', answer: 42 });\n"
                "}\n"
            ),
            tests=[
                {
                    "id": "esm_pass",
                    "input": {},
                    "expected_success": True,
                    "expected_schema_valid": True,
                    "expected_json_paths": {"answer": 42},
                    "expected_contains": ["esm ok"],
                }
            ],
            output_schema={
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "output": {"type": "string"},
                    "answer": {"type": "number"},
                },
                "required": ["success", "output", "answer"],
            },
            language="javascript",
            code_rel_path="js/skill.mjs",
        )

        report = evaluate_from_path(skill_dir)

        self.assertEqual(report.passed, 1)
        self.assertEqual(report.results[0].reasons, [])

    def test_evaluator_runs_bundle_index_mjs_exports(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node runtime not available in test environment")

        skill_dir = self._make_skill(
            code=(
                "export async function respond(input, context = null) {\n"
                "  return JSON.stringify({ success: true, output: 'bundle esm ok', plan: ['parse', 'render'] });\n"
                "}\n"
            ),
            tests=[
                {
                    "id": "bundle_pass",
                    "input": {},
                    "expected_success": True,
                    "expected_schema_valid": True,
                    "expected_json_paths": {"plan.0": "parse"},
                    "expected_contains": ["bundle esm ok"],
                }
            ],
            output_schema={
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "output": {"type": "string"},
                    "plan": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["success", "output", "plan"],
            },
            language="javascript",
            code_rel_path="src/index.mjs",
        )

        report = evaluate_from_path(skill_dir)

        self.assertEqual(report.passed, 1)
        self.assertEqual(report.results[0].reasons, [])


class SecurityTests(unittest.TestCase):
    def _make_creator(self) -> SkillCreator:
        return SkillCreator(llm_client=None, skills_root=Path("/tmp"))  # type: ignore[arg-type]

    def test_security_check_blocks_subprocess_and_path_reads(self) -> None:
        creator = self._make_creator()
        code = (
            "import subprocess\n"
            "from pathlib import Path\n"
            "def respond(input, context=None):\n"
            "    Path('x').read_text()\n"
            "    subprocess.run(['ls'])\n"
            "    return '{}'\n"
        )

        with self.assertRaises(RuntimeError) as ctx:
            creator._phase_security_check(code, "python")

        message = str(ctx.exception)
        self.assertIn("Banned import detected: subprocess", message)
        self.assertIn("Path-based file access detected", message)

    def test_dependencies_disabled_by_default(self) -> None:
        creator = self._make_creator()
        deps = creator._phase_dependencies({"language": "python"}, "import json\n")
        self.assertEqual(deps, "")

    def test_phase_write_keeps_minimal_file_set(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            creator = SkillCreator(llm_client=None, skills_root=Path(tmpdir))  # type: ignore[arg-type]
            result = creator._phase_write(
                plan={"skill_name": "demo-skill", "language": "python", "complexity": "simple", "inputs": [], "outputs": []},
                input_schema={"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}, "required": []},
                output_schema={
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "type": "object",
                    "properties": {"success": {"type": "boolean"}, "output": {"type": "string"}},
                    "required": ["success", "output"],
                },
                ui_schema={
                    "version": "1.0",
                    "skillId": "demo-skill",
                    "title": "Demo",
                    "titleTh": "เดโม",
                    "description": "Demo",
                    "descriptionTh": "เดโม",
                    "sections": [
                        {
                            "id": "main",
                            "title": "Main",
                            "titleTh": "หลัก",
                            "icon": "brain",
                            "collapsed": False,
                            "fields": [],
                        }
                    ],
                    "outputMapping": {},
                },
                skill_md="---\nname: Demo\ndescription: Demo\ncategory: automation\nexecution_mode: python\n---\n",
                skill_code="def respond(input, context=None):\n    return '{\"success\": true, \"output\": \"ok\"}'\n",
                tests=[{"id": "t1", "input": {}, "expected_contains": ["ok"]}],
                critic_issues=[],
                dependencies="",
            )

            self.assertNotIn("README.md", result.files_written)
            self.assertFalse((Path(tmpdir) / "demo-skill" / "README.md").exists())

    def test_phase_write_genjs_bundle_writes_manifest_and_support_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            creator = SkillCreator(llm_client=None, skills_root=Path(tmpdir))  # type: ignore[arg-type]
            result = creator._phase_write(
                plan={
                    "skill_name": "genjs-demo",
                    "skill_title": "GenJS Demo",
                    "description": "Generate structured slide artifacts from JSON inputs",
                    "purpose": "Turn normalized content into slide outputs.",
                    "language": "javascript",
                    "javascript_runtime": "genjs",
                    "execution_mode": "sandbox-command",
                    "complexity": "complex",
                    "logic_steps": ["parse", "classify", "normalize", "plan", "render"],
                    "categories": ["slide_generation"],
                    "inputs": [],
                    "outputs": [],
                },
                input_schema={"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}, "required": []},
                output_schema={
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "type": "object",
                    "properties": {"success": {"type": "boolean"}, "output": {"type": "string"}},
                    "required": ["success", "output"],
                },
                ui_schema={
                    "version": "1.0",
                    "skillId": "genjs-demo",
                    "title": "GenJS Demo",
                    "titleTh": "GenJS Demo",
                    "description": "Demo",
                    "descriptionTh": "เดโม",
                    "sections": [
                        {
                            "id": "main",
                            "title": "Main",
                            "titleTh": "หลัก",
                            "icon": "brain",
                            "collapsed": False,
                            "fields": [],
                        }
                    ],
                    "outputMapping": {},
                },
                skill_md="---\nname: GenJS Demo\ndescription: Demo\ncategory: slide_generation\nexecution_mode: sandbox-command\n---\n",
                skill_code="export async function respond(input, context = null) {\n  return JSON.stringify({ success: true, output: 'ok' });\n}\n",
                tests=[{"id": "t1", "input": {}, "expected_contains": ["ok"]}],
                critic_issues=[],
                dependencies="",
            )

            skill_dir = Path(tmpdir) / "genjs-demo"
            self.assertIn("skill.manifest.json", result.files_written)
            self.assertIn("package.json", result.files_written)
            self.assertIn("src/index.mjs", result.files_written)
            self.assertIn("src/orchestration.mjs", result.files_written)
            self.assertIn("examples/demo.input.json", result.files_written)
            self.assertTrue((skill_dir / "skill.manifest.json").exists())
            self.assertTrue((skill_dir / "package.json").exists())
            self.assertTrue((skill_dir / "src" / "normalize.mjs").exists())
            self.assertTrue((skill_dir / "examples" / "demo.input.json").exists())


if __name__ == "__main__":
    unittest.main()
