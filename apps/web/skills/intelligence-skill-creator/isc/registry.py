from __future__ import annotations
import json
import importlib.util
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .models import SkillManifest

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"

def skills_root() -> Path:
    return SKILLS_DIR

def list_skills() -> List[str]:
    if not SKILLS_DIR.exists():
        return []
    out = []
    for p in SKILLS_DIR.iterdir():
        if p.is_dir() and (p / "skill.md").exists() and (
            (p / "python" / "skill.py").exists() or (p / "js" / "skill.js").exists()
        ):
            out.append(p.name)
    return sorted(out)

def load_manifest(skill_name: str) -> SkillManifest:
    p = SKILLS_DIR / skill_name / "manifest.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    return SkillManifest(
        name=data["name"],
        version=data.get("version","0.0.0"),
        description=data.get("description",""),
        entrypoint=data.get("entrypoint","skill.py"),
        author=data.get("author",""),
        tags=data.get("tags",[]) or [],
    )

def load_skill_module(skill_name: str):
    skill_dir = SKILLS_DIR / skill_name
    entry = skill_dir / "skill.py"
    if not entry.exists():
        raise FileNotFoundError(f"skill.py not found: {entry}")
    spec = importlib.util.spec_from_file_location(f"skill_{skill_name}", str(entry))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module for {skill_name}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    if not hasattr(mod, "respond"):
        raise AttributeError(f"{skill_name}/skill.py must define respond(input_text, context=None)->str")
    return mod

def skill_path(skill_name: str) -> Path:
    return SKILLS_DIR / skill_name

def read_text(skill_name: str, rel_path: str) -> str:
    p = skill_path(skill_name) / rel_path
    return p.read_text(encoding="utf-8")

def write_text(skill_name: str, rel_path: str, content: str) -> None:
    p = skill_path(skill_name) / rel_path
    p.write_text(content, encoding="utf-8")
