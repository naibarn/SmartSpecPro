import json
from pathlib import Path
ui = json.loads((Path(__file__).resolve().parents[1] / "schemas/ui.schema.json").read_text())
for key in ("version", "skillId", "title", "titleTh", "sections", "outputMapping"):
    assert key in ui, key
