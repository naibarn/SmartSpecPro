import json
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.cli import _load_json_argument


class LoadJsonArgumentTests(unittest.TestCase):
    def test_loads_large_inline_json_without_statting_it_as_a_path(self):
        value = {"payload": "x" * 5000}
        self.assertEqual(_load_json_argument(json.dumps(value)), value)

    def test_loads_json_from_a_file_path(self):
        value = {"acceptance.status": "PARTIAL"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "changes.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            self.assertEqual(_load_json_argument(str(path)), value)


if __name__ == "__main__":
    unittest.main()
