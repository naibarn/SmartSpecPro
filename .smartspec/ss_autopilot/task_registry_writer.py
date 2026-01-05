import json
import re
from pathlib import Path
from typing import Any, Dict, List

def extract_tasks_from_markdown(md: str) -> List[Dict[str, Any]]:
    tasks: List[Dict[str, Any]] = []
    for m in re.finditer(r'^\s*-\s*\[( |x|X)\]\s+(.+?)\s*$', md, flags=re.MULTILINE):
        done = m.group(1).lower() == "x"
        title = m.group(2).strip()
        if title:
            tasks.append({"title": title, "status": "done" if done else "planned"})
    return tasks

def write_tasks_registry(workspace: str, tasks: List[Dict[str, Any]]) -> str:
    reg_dir = Path(workspace) / ".spec" / "registry"
    reg_dir.mkdir(parents=True, exist_ok=True)
    out = reg_dir / "tasks.json"
    out.write_text(json.dumps({"tasks": tasks}, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(out)
