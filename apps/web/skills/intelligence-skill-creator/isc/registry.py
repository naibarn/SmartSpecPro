from __future__ import annotations

import importlib.util
import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from .frontmatter import parse_skill_frontmatter
from .models import SkillManifest
from .native_bundle import is_native_skill_bundle, parse_native_skill_lock

ISC_ROOT = Path(__file__).resolve().parent.parent
CANONICAL_SKILLS_DIR = ISC_ROOT.parent
LEGACY_SKILLS_DIR = ISC_ROOT / "skills"
MANIFEST_FILENAMES = ("skill.md", "SKILL.md")


@dataclass(frozen=True)
class ResolvedSkillFiles:
    skill_dir: Path
    bundle_dir: Path
    manifest_path: Optional[Path]
    code_path: Optional[Path]
    tests_path: Optional[Path]
    is_legacy: bool = False


def canonical_skills_root() -> Path:
    return CANONICAL_SKILLS_DIR


def legacy_fixture_skills_root() -> Path:
    return LEGACY_SKILLS_DIR


def candidate_skill_roots() -> List[Path]:
    roots = [canonical_skills_root()]
    legacy = legacy_fixture_skills_root()
    if legacy != roots[0]:
        roots.append(legacy)
    return roots


def _resolve_direct_skill_manifest_path(skill_dir: Path) -> Optional[Path]:
    for file_name in MANIFEST_FILENAMES:
        candidate = skill_dir / file_name
        if candidate.exists():
            return candidate
    manifest_json = skill_dir / "manifest.json"
    if manifest_json.exists():
        return manifest_json
    return None


def resolve_skill_bundle_dir(skill_dir: Path) -> Optional[Path]:
    direct_manifest = _resolve_direct_skill_manifest_path(skill_dir)
    if direct_manifest is not None or (skill_dir / "skill.manifest.json").exists():
        return skill_dir

    if not skill_dir.exists():
        return None

    try:
        nested_dirs = [entry for entry in skill_dir.iterdir() if entry.is_dir()]
    except OSError:
        return None

    candidates: List[Path] = []
    for nested_dir in nested_dirs:
        nested_manifest = _resolve_direct_skill_manifest_path(nested_dir)
        if nested_manifest is not None or (nested_dir / "skill.manifest.json").exists():
            candidates.append(nested_dir)

    if not candidates:
        return None

    return next((candidate for candidate in candidates if (candidate / "skill.manifest.json").exists()), candidates[0])


def _skill_dir_exists(skill_dir: Path) -> bool:
    return skill_dir.is_dir() and resolve_skill_bundle_dir(skill_dir) is not None


def canonical_skill_dir(skill_name: str) -> Path:
    return canonical_skills_root() / skill_name


def resolve_skill_manifest_path(skill_dir: Path) -> Optional[Path]:
    return _resolve_direct_skill_manifest_path(skill_dir)


def resolve_skill_dir(skill_name: str) -> Path:
    for root in candidate_skill_roots():
        skill_dir = root / skill_name
        if _skill_dir_exists(skill_dir):
            return skill_dir
    raise FileNotFoundError(f"Skill not found: {skill_name}")


def resolve_skill_files(skill_name: str) -> ResolvedSkillFiles:
    skill_dir = resolve_skill_dir(skill_name)
    bundle_dir = resolve_skill_bundle_dir(skill_dir) or skill_dir
    code_candidates = [
        bundle_dir / "python" / "skill.py",
        bundle_dir / "js" / "skill.mjs",
        bundle_dir / "js" / "skill.js",
        bundle_dir / "src" / "index.mjs",
        bundle_dir / "skill.mjs",
        bundle_dir / "skill.py",
    ]
    manifest_candidates = [*(bundle_dir / file_name for file_name in MANIFEST_FILENAMES), bundle_dir / "manifest.json"]
    tests_candidates = [
        bundle_dir / "tests" / "tests.json",
        bundle_dir / "tests.json",
    ]

    manifest_path = next((p for p in manifest_candidates if p.exists()), None)
    code_path = next((p for p in code_candidates if p.exists()), None)
    tests_path = next((p for p in tests_candidates if p.exists()), None)

    return ResolvedSkillFiles(
        skill_dir=skill_dir,
        bundle_dir=bundle_dir,
        manifest_path=manifest_path,
        code_path=code_path,
        tests_path=tests_path,
        is_legacy=skill_dir.is_relative_to(legacy_fixture_skills_root()),
    )


def skills_root() -> Path:
    return canonical_skills_root()


def list_skills() -> List[str]:
    seen = set()
    out: List[str] = []
    for root in candidate_skill_roots():
        if not root.exists():
            continue
        for p in sorted(root.iterdir()):
            if p.name in seen or not _skill_dir_exists(p):
                continue
            bundle_dir = resolve_skill_bundle_dir(p) or p
            has_code = any(
                candidate.exists()
                for candidate in (
                    bundle_dir / "python" / "skill.py",
                    bundle_dir / "js" / "skill.mjs",
                    bundle_dir / "js" / "skill.js",
                    bundle_dir / "src" / "index.mjs",
                    bundle_dir / "skill.py",
                )
            )
            if has_code or is_native_skill_bundle(bundle_dir):
                seen.add(p.name)
                out.append(p.name)
    return out
def load_manifest(skill_name: str) -> SkillManifest:
    files = resolve_skill_files(skill_name)
    if files.manifest_path is None:
        raise FileNotFoundError(f"No manifest found for skill: {skill_name}")

    path = files.manifest_path
    if path.name in MANIFEST_FILENAMES:
        data = parse_skill_frontmatter(path.read_text(encoding="utf-8"))
        bundle_dir = files.bundle_dir
        lock = parse_native_skill_lock(bundle_dir) if bundle_dir else None
        if lock and lock.get("target_platform") == "agents_python":
            entrypoint = lock.get("entrypoints", {}).get("run", "scripts/run.sh")
        elif (bundle_dir / "scripts" / "run.sh").exists():
            entrypoint = "scripts/run.sh"
        else:
            entrypoint = "python/skill.py"
            if files.code_path and files.code_path.as_posix().endswith("js/skill.mjs"):
                entrypoint = "js/skill.mjs"
            elif files.code_path and files.code_path.as_posix().endswith("js/skill.js"):
                entrypoint = "js/skill.js"
            elif files.code_path and files.code_path.as_posix().endswith("src/index.mjs"):
                entrypoint = "src/index.mjs"
            elif files.code_path and files.code_path.as_posix().endswith("skill.py"):
                entrypoint = "skill.py"
        return SkillManifest(
            name=data.get("name", skill_name),
            version=str(data.get("version", "0.0.0")),
            description=str(data.get("description", "")),
            entrypoint=entrypoint,
            author=str(data.get("author", "")),
            tags=list(data.get("tags", []) or []),
        )

    data = json.loads(path.read_text(encoding="utf-8"))
    return SkillManifest(
        name=data["name"],
        version=data.get("version", "0.0.0"),
        description=data.get("description", ""),
        entrypoint=data.get("entrypoint", "skill.py"),
        author=data.get("author", ""),
        tags=data.get("tags", []) or [],
    )


def load_skill_module(skill_name: str):
    files = resolve_skill_files(skill_name)
    entry = files.code_path
    if entry is None:
        raise FileNotFoundError(f"Skill code not found for {skill_name}")
    if entry.suffix != ".py":
        raise RuntimeError(f"{skill_name} is not a Python skill: {entry}")

    spec = importlib.util.spec_from_file_location(f"skill_{skill_name}", str(entry))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module for {skill_name}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    if not hasattr(mod, "respond"):
        raise AttributeError(f"{entry} must define respond(input, context=None)->str")
    return mod


def skill_path(skill_name: str) -> Path:
    return resolve_skill_files(skill_name).bundle_dir


def read_text(skill_name: str, rel_path: str) -> str:
    p = skill_path(skill_name) / rel_path
    return p.read_text(encoding="utf-8")


def read_manifest_text(skill_name: str) -> str:
    files = resolve_skill_files(skill_name)
    if files.manifest_path is None:
        raise FileNotFoundError(f"No manifest found for skill: {skill_name}")
    return files.manifest_path.read_text(encoding="utf-8")


def write_text(skill_name: str, rel_path: str, content: str) -> None:
    p = skill_path(skill_name) / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
