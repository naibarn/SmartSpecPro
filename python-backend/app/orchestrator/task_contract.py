import json
import re
from typing import Any, Dict, List, Optional

def parse_tasks_from_markdown(md: str) -> List[Dict[str, Any]]:
    # Deterministic: parse checklists "- [ ] title" or "- [x] title"
    tasks: List[Dict[str, Any]] = []
    for m in re.finditer(r'^\s*-\s*\[( |x|X)\]\s+(.+?)\s*$', md, flags=re.MULTILINE):
        done = m.group(1).lower() == 'x'
        title = m.group(2).strip()
        if title:
            tasks.append({"title": title, "status": "done" if done else "planned"})
    return tasks

def load_tasks_registry(path: str) -> List[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("tasks"), list):
            return data["tasks"]
        if isinstance(data, list):
            return data
    except Exception:
        return []
    return []
