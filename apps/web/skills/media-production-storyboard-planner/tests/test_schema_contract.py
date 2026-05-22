import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
for rel in ["schemas/input.schema.json", "schemas/output.schema.json", "schemas/ui.schema.json", "fixtures/pass.basic.input.json", "fixtures/pass.basic.output.json", "tests/tests.json"]:
    json.loads((root / rel).read_text())
out = json.loads((root / "fixtures/pass.basic.output.json").read_text())
missing = [key for key in json.loads((root / "schemas/output.schema.json").read_text())["required"] if key not in out]
if missing:
    raise SystemExit(f"missing required output keys: {missing}")
