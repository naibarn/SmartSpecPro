from __future__ import annotations

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


if __name__ == "__main__":
    unittest.main()
