from __future__ import annotations

import json
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
    ) -> Path:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        skill_dir = Path(tmpdir.name) / "demo-skill"
        skill_dir.mkdir(parents=True, exist_ok=True)
        if language == "python":
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


if __name__ == "__main__":
    unittest.main()
