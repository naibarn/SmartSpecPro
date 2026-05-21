from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
if str(TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(TEST_ROOT))

from isc.validator import validate_patch  # noqa: E402


class ValidatorTests(unittest.TestCase):
    def test_validate_patch_requires_respond_signature_for_bundle_index(self) -> None:
        result = validate_patch(
            "demo-skill",
            '{"src/index.mjs":"export function notRespond() { return \\"nope\\"; }\\n"}',
            require_respond_signature=True,
        )

        self.assertFalse(result.ok)
        self.assertIn("respond() signature missing in JavaScript skill; expected async respond export.", result.errors)

    def test_validate_patch_rejects_invalid_skill_markdown_artifact(self) -> None:
        result = validate_patch(
            "demo-skill",
            json.dumps({"SKILL.md": "# Missing frontmatter\n"}),
        )

        self.assertFalse(result.ok)
        self.assertTrue(any("frontmatter" in error for error in result.errors))

    def test_validate_patch_rejects_invalid_schema_artifact(self) -> None:
        result = validate_patch(
            "demo-skill",
            json.dumps({"schemas/input.schema.json": '{"type":"array"}'}),
        )

        self.assertFalse(result.ok)
        self.assertTrue(any("draft-07" in error for error in result.errors))
        self.assertTrue(any("root type" in error for error in result.errors))

    def test_validate_patch_rejects_unsafe_skill_lock_paths(self) -> None:
        result = validate_patch(
            "demo-skill",
            json.dumps({
                "skill.lock.json": json.dumps({
                    "entrypoints": {"run": "../escape.sh"},
                    "outputs": ["SKILL.md", "/tmp/out"],
                })
            }),
        )

        self.assertFalse(result.ok)
        self.assertTrue(any("entrypoints.run" in error for error in result.errors))
        self.assertTrue(any("outputs[1]" in error for error in result.errors))


if __name__ == "__main__":
    unittest.main()
