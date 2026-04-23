#!/usr/bin/env python3
"""Synchronize repo skill mirrors with installed runtime skills.

This repo contains two styles of skill sources:

1. Direct mirrors
   repo: skills/<skill>/
   installed: ~/.codex/skills/<skill>/

2. Package-style sources for deep-* skills
   repo source:
     skills/<skill>/scripts/...
     skills/<skill>/agents/...
     skills/<skill>/hooks/...
     skills/<skill>/skills/<skill>/SKILL.md
     skills/<skill>/skills/<skill>/references/...
   installed runtime:
     ~/.codex/skills/<skill>/SKILL.md
     ~/.codex/skills/<skill>/references/...
     ~/.codex/skills/<skill>/scripts/...
     ~/.codex/skills/<skill>/agents/...
     ~/.codex/skills/<skill>/hooks/...

This helper understands that mapping for verify/sync/publish workflows.
"""

from __future__ import annotations

import argparse
import filecmp
import os
import shutil
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = REPO_ROOT / "skills"
INSTALLED_ROOT = Path(os.environ.get("SKILLS_HOME", Path.home() / ".codex")).expanduser() / "skills"
MANIFEST_PATH = SKILLS_ROOT / "mirrored-skills.txt"
PACKAGE_RUNTIME_DIRS = (".claude-plugin", "agents", "hooks", "scripts")
IGNORE_PARTS = {"__pycache__", ".pytest_cache", ".venv"}
IGNORE_FILENAMES = {".DS_Store", ".gitkeep"}
IGNORE_SUFFIXES = {".pyc", ".pyo"}
BACKUP_PLAYBOOK = "BACKUP-PLAYBOOK.md"


def read_manifest() -> list[str]:
    return [
        line.strip()
        for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def is_package_skill(skill: str) -> bool:
    return (SKILLS_ROOT / skill / "skills" / skill / "SKILL.md").exists()


def should_ignore(path: Path) -> bool:
    if any(part in IGNORE_PARTS for part in path.parts):
        return True
    if path.name in IGNORE_FILENAMES:
        return True
    if path.suffix in IGNORE_SUFFIXES:
        return True
    return False


def copy_path(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    if src.is_dir():
        for item in src.rglob("*"):
            if should_ignore(item):
                continue
            rel = item.relative_to(src)
            target = dest / rel
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
    else:
        if should_ignore(src):
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)


def clear_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def materialize_repo_runtime(skill: str, dest: Path) -> None:
    src = SKILLS_ROOT / skill
    if is_package_skill(skill):
        runtime_root = src / "skills" / skill
        copy_path(runtime_root / "SKILL.md", dest / "SKILL.md")
        copy_path(runtime_root / "references", dest / "references")
        for name in PACKAGE_RUNTIME_DIRS:
            copy_path(src / name, dest / name)
    else:
        copy_path(src, dest)


def materialize_installed_runtime(skill: str, dest: Path) -> None:
    copy_path(INSTALLED_ROOT / skill, dest)


def list_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if should_ignore(path) or path.is_dir():
            continue
        files.append(path.relative_to(root))
    return sorted(files)


def compare_dirs(left: Path, right: Path) -> list[str]:
    diffs: list[str] = []
    left_files = set(list_files(left))
    right_files = set(list_files(right))

    for rel in sorted(left_files - right_files):
        diffs.append(f"Only in repo runtime view: {rel}")
    for rel in sorted(right_files - left_files):
        diffs.append(f"Only in installed runtime view: {rel}")

    for rel in sorted(left_files & right_files):
        if not filecmp.cmp(left / rel, right / rel, shallow=False):
            diffs.append(f"Content differs: {rel}")

    return diffs


def temp_dir() -> tempfile.TemporaryDirectory[str]:
    return tempfile.TemporaryDirectory(prefix="skill-sync-")


def deploy_installed_to_repo(skill: str, installed_stage: Path) -> None:
    target = SKILLS_ROOT / skill
    if is_package_skill(skill):
        runtime_root = target / "skills" / skill
        runtime_root.mkdir(parents=True, exist_ok=True)

        clear_path(runtime_root / "SKILL.md")
        if (installed_stage / "SKILL.md").exists():
            copy_path(installed_stage / "SKILL.md", runtime_root / "SKILL.md")

        clear_path(runtime_root / "references")
        if (installed_stage / "references").exists():
            copy_path(installed_stage / "references", runtime_root / "references")

        for name in PACKAGE_RUNTIME_DIRS:
            clear_path(target / name)
            if (installed_stage / name).exists():
                copy_path(installed_stage / name, target / name)
    else:
        clear_path(target)
        target.mkdir(parents=True, exist_ok=True)
        copy_path(installed_stage, target)


def deploy_repo_to_installed(skill: str, repo_stage: Path) -> None:
    target = INSTALLED_ROOT / skill
    clear_path(target)
    target.mkdir(parents=True, exist_ok=True)
    copy_path(repo_stage, target)


def verify() -> int:
    if not INSTALLED_ROOT.exists():
        print(f"installed skill sync verification failed: missing installed skill directory: {INSTALLED_ROOT}", file=sys.stderr)
        return 1

    if not (INSTALLED_ROOT / BACKUP_PLAYBOOK).exists():
        print(
            f"installed skill sync verification failed: missing installed {BACKUP_PLAYBOOK}",
            file=sys.stderr,
        )
        return 1

    repo_backup = SKILLS_ROOT / BACKUP_PLAYBOOK
    installed_backup = INSTALLED_ROOT / BACKUP_PLAYBOOK
    if not filecmp.cmp(repo_backup, installed_backup, shallow=False):
        print(
            f"installed skill sync verification failed: drift detected for {BACKUP_PLAYBOOK}",
            file=sys.stderr,
        )
        return 1

    for skill in read_manifest():
        repo_skill = SKILLS_ROOT / skill
        installed_skill = INSTALLED_ROOT / skill
        if not repo_skill.exists():
            print(f"installed skill sync verification failed: missing repo mirror skill: {repo_skill}", file=sys.stderr)
            return 1
        if not installed_skill.exists():
            print(f"installed skill sync verification failed: missing installed skill: {installed_skill}", file=sys.stderr)
            return 1

        with temp_dir() as repo_tmp, temp_dir() as installed_tmp:
            repo_stage = Path(repo_tmp)
            installed_stage = Path(installed_tmp)
            materialize_repo_runtime(skill, repo_stage)
            materialize_installed_runtime(skill, installed_stage)
            diffs = compare_dirs(repo_stage, installed_stage)
            if diffs:
                print(f"installed skill sync verification failed: drift detected for {skill}", file=sys.stderr)
                for diff in diffs:
                    print(f"  - {diff}", file=sys.stderr)
                return 1

    print("installed skill sync verified")
    return 0


def sync_from_installed() -> int:
    for skill in read_manifest():
        installed_skill = INSTALLED_ROOT / skill
        if not installed_skill.exists():
            print(f"missing source skill: {installed_skill}", file=sys.stderr)
            return 1

        with temp_dir() as installed_tmp:
            installed_stage = Path(installed_tmp)
            materialize_installed_runtime(skill, installed_stage)
            deploy_installed_to_repo(skill, installed_stage)
        print(f"synced {skill}")

    copy_path(INSTALLED_ROOT / BACKUP_PLAYBOOK, SKILLS_ROOT / BACKUP_PLAYBOOK)
    print(f"synced {BACKUP_PLAYBOOK}")
    return 0


def publish_to_installed() -> int:
    INSTALLED_ROOT.mkdir(parents=True, exist_ok=True)
    copy_path(SKILLS_ROOT / BACKUP_PLAYBOOK, INSTALLED_ROOT / BACKUP_PLAYBOOK)

    for skill in read_manifest():
        repo_skill = SKILLS_ROOT / skill
        if not repo_skill.exists():
            print(f"missing repo skill: {repo_skill}", file=sys.stderr)
            return 1

        with temp_dir() as repo_tmp:
            repo_stage = Path(repo_tmp)
            materialize_repo_runtime(skill, repo_stage)
            deploy_repo_to_installed(skill, repo_stage)
        print(f"published {skill}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync repo skills with installed runtime skills")
    parser.add_argument("command", choices=["verify", "sync-from-installed", "publish-to-installed"])
    args = parser.parse_args()

    if args.command == "verify":
        return verify()
    if args.command == "sync-from-installed":
        return sync_from_installed()
    if args.command == "publish-to-installed":
        return publish_to_installed()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
