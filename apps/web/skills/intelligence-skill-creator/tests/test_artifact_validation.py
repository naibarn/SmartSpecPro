from __future__ import annotations

import sys
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc.artifact_validation import (  # noqa: E402
    collect_creation_validation_results,
    raise_for_validation_errors,
    validate_skill_markdown,
    validate_tests_document,
    validate_ui_schema_document,
)


class ArtifactValidationTests(unittest.TestCase):
    def test_validate_skill_markdown_rejects_missing_frontmatter(self) -> None:
        result = validate_skill_markdown("# Missing Frontmatter\n", language="python")

        self.assertFalse(result.ok)
        self.assertIn("skill.md must include YAML frontmatter.", result.errors)

    def test_validate_skill_markdown_rejects_wrong_execution_mode(self) -> None:
        skill_md = "\n".join(
            [
                "---",
                'name: "Demo"',
                'description: "Example"',
                "category: automation",
                "execution_mode: javascript",
                "triggerPatterns:",
                '  - "demo"',
                "---",
            ]
        )

        result = validate_skill_markdown(skill_md, language="python")

        self.assertFalse(result.ok)
        self.assertTrue(any("execution_mode" in error for error in result.errors))

    def test_validate_ui_schema_document_rejects_missing_output_mapping(self) -> None:
        ui_schema = {
            "version": "1.0",
            "skillId": "demo",
            "title": "Demo",
            "titleTh": "เดโม",
            "description": "Demo skill",
            "descriptionTh": "เดโม",
            "sections": [
                {
                    "id": "main",
                    "title": "Main",
                    "titleTh": "หลัก",
                    "icon": "brain",
                    "collapsed": False,
                    "fields": [
                        {
                            "id": "topic",
                            "type": "text",
                            "label": "Topic",
                            "labelTh": "หัวข้อ",
                            "helpText": "Topic",
                            "helpTextTh": "หัวข้อ",
                        }
                    ],
                }
            ],
            "outputMapping": {},
        }

        result = validate_ui_schema_document(ui_schema)

        self.assertFalse(result.ok)
        self.assertTrue(any("outputMapping" in error for error in result.errors))

    def test_validate_tests_document_rejects_bad_expected_contains(self) -> None:
        result = validate_tests_document(
            [
                {"id": "t1", "input": {}, "expected_contains": "success"},
                {"id": "t1", "input": {}},
            ]
        )

        self.assertFalse(result.ok)
        self.assertTrue(any("expected_contains" in error for error in result.errors))
        self.assertTrue(any("duplicate test id" in error for error in result.errors))

    def test_collect_validation_results_and_raise(self) -> None:
        results = collect_creation_validation_results(
            input_schema={"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}, "required": []},
            output_schema={"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "properties": {}, "required": []},
            ui_schema={"version": "1.0", "skillId": "demo", "title": "Demo", "titleTh": "เดโม", "description": "Demo", "descriptionTh": "เดโม", "sections": [], "outputMapping": {}},
            skill_md="---\nname: Demo\ndescription: Demo\ncategory: automation\nexecution_mode: python\n---\n",
            tests=[{"id": "t1", "input": {}, "expected_contains": ["success"]}],
            language="python",
        )

        with self.assertRaises(RuntimeError):
            raise_for_validation_errors(results)


if __name__ == "__main__":
    unittest.main()
