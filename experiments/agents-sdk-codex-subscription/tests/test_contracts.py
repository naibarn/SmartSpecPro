import sys
import tempfile
import unittest
from pathlib import Path

from agents import function_tool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from codex_model import CodexSubscriptionModel, DISPATCH_SCHEMA
from run_experiment import ensure_inside


class WorkspacePathTests(unittest.TestCase):
    def test_accepts_relative_workspace_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertEqual(ensure_inside(root, "src/app.mjs"), root / "src/app.mjs")

    def test_rejects_parent_absolute_and_git_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for path in ("../escape", "/tmp/escape", ".git/config", "evidence/run-state.json"):
                with self.subTest(path=path), self.assertRaises((ValueError, PermissionError)):
                    ensure_inside(root, path)

    def test_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "workspace"
            root.mkdir()
            outside = Path(temp) / "outside"
            outside.mkdir()
            (root / "out").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                ensure_inside(root, "out/secret.txt")


class ModelDispatchTests(unittest.TestCase):
    def test_dispatch_schema_uses_codex_supported_strict_json_shape(self):
        self.assertIn("properties", DISPATCH_SCHEMA)
        self.assertEqual(DISPATCH_SCHEMA["properties"]["arguments_json"]["type"], "string")
        self.assertFalse(DISPATCH_SCHEMA["additionalProperties"])

    def test_dispatch_creates_an_agents_sdk_function_call(self):
        def add(a: int, b: int) -> int:
            """Add two integers."""
            return a + b

        tool = function_tool(add)
        item = CodexSubscriptionModel._parse_dispatch(
            '{"action":"call_tool","name":"add","arguments_json":"{\\"a\\":17,\\"b\\":25}","text":null}',
            [tool],
            [],
        )
        self.assertEqual(item.type, "function_call")
        self.assertEqual(item.name, "add")
        self.assertEqual(item.arguments, '{"a": 17, "b": 25}')
        self.assertTrue(item.call_id)

    def test_dispatch_rejects_unregistered_tools(self):
        with self.assertRaisesRegex(ValueError, "unregistered"):
            CodexSubscriptionModel._parse_dispatch(
                '{"action":"call_tool","name":"delete_everything","arguments_json":"{}","text":null}',
                [],
                [],
            )


if __name__ == "__main__":
    unittest.main()
