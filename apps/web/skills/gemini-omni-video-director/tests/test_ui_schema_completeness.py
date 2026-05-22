import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
ui = json.loads((root / "schemas/ui.schema.json").read_text())
for key in ("version", "skillId", "title", "titleTh", "sections", "outputMapping"):
    if key not in ui:
        raise SystemExit(f"missing ui key: {key}")
