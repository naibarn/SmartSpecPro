import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for rel in [
    "schemas/input.schema.json",
    "schemas/output.schema.json",
    "schemas/ui.schema.json",
    "fixtures/pass.single-shot-no-assets.input.json",
    "fixtures/pass.single-shot-no-assets.output.json",
    "tests/tests.json",
]:
    json.loads((root / rel).read_text())

out = json.loads((root / "fixtures/pass.single-shot-no-assets.output.json").read_text())
required = json.loads((root / "schemas/output.schema.json").read_text())["required"]
missing = [key for key in required if key not in out]
if missing:
    raise SystemExit(f"missing required output keys: {missing}")
