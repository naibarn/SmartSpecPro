#!/usr/bin/env python3
"""Install the repo-backed skill pack into Codex and Claude-compatible hosts.

This script is intentionally dependency-free so the skills folder can be copied
to another project or machine and installed with only Python 3.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = REPO_ROOT / "skills"
MANIFEST_PATH = SKILLS_ROOT / "mirrored-skills.txt"
BACKUP_PLAYBOOK = "BACKUP-PLAYBOOK.md"
PACKAGE_RUNTIME_DIRS = (".claude-plugin", "agents", "hooks", "scripts")
IGNORE_PARTS = {"__pycache__", ".pytest_cache", ".venv", ".git"}
IGNORE_FILENAMES = {".DS_Store", ".gitkeep"}
IGNORE_SUFFIXES = {".pyc", ".pyo"}


def read_manifest() -> list[str]:
    return [
        line.strip()
        for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


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
        return

    if should_ignore(src):
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def clear_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def is_package_skill(skill: str) -> bool:
    return (SKILLS_ROOT / skill / "skills" / skill / "SKILL.md").exists()


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


def default_codex_skills_root() -> Path:
    explicit = os.environ.get("CODEX_SKILLS_ROOT") or os.environ.get("SKILLS_INSTALL_ROOT")
    if explicit:
        return Path(explicit).expanduser()

    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()
    return codex_home / "skills"


def install_codex_skills(target_root: Path) -> None:
    target_root.mkdir(parents=True, exist_ok=True)
    copy_path(SKILLS_ROOT / BACKUP_PLAYBOOK, target_root / BACKUP_PLAYBOOK)

    for skill in read_manifest():
        source = SKILLS_ROOT / skill
        if not source.exists():
            raise FileNotFoundError(f"missing repo skill: {source}")

        target = target_root / skill
        clear_path(target)
        target.mkdir(parents=True, exist_ok=True)
        materialize_repo_runtime(skill, target)
        print(f"installed {skill} -> {target}")

    print(f"installed {BACKUP_PLAYBOOK} -> {target_root / BACKUP_PLAYBOOK}")


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: missing frontmatter")
    _, frontmatter, body = text.split("---", 2)
    data: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data, body.lstrip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    return slug or "agent"


def agent_is_read_only(body: str) -> bool:
    probe = body.lower()
    if "not read-only" in probe or "audits and applies fixes" in probe:
        return False
    return (
        "read-only" in probe
        or "must not modify, create, or delete any files" in probe
        or "must not write implementation code" in probe
        or "analysis only" in probe
    )


def claude_agent_text(source: Path) -> str:
    meta, body = parse_frontmatter(source)
    name = slugify(meta.get("name", source.stem))
    native_name = f"ssp-{name}"
    description = meta.get("description", f"Portable {name} agent")
    tools = "Read, Grep, Glob, Bash" if agent_is_read_only(body) else "Read, Grep, Glob, Bash, Edit, MultiEdit, Write"

    return "\n".join(
        [
            "---",
            f"name: {native_name}",
            f'description: "{description}"',
            "model: sonnet",
            f"tools: {tools}",
            "---",
            "",
            "# Portable Agent Source",
            "",
            "This native Claude agent was generated from the repo-backed portable",
            f"source file `skills/sub-agents/agents/{source.name}`.",
            "",
            body.rstrip(),
            "",
        ]
    )


def generate_claude_agents(target_dir: Path) -> None:
    source_dir = SKILLS_ROOT / "sub-agents" / "agents"
    if not source_dir.exists():
        raise FileNotFoundError(f"missing sub-agent source directory: {source_dir}")

    target_dir.mkdir(parents=True, exist_ok=True)
    generated = 0
    for source in sorted(source_dir.glob("*.md")):
        meta, _ = parse_frontmatter(source)
        name = slugify(meta.get("name", source.stem))
        target = target_dir / f"ssp-{name}.md"
        target.write_text(claude_agent_text(source), encoding="utf-8")
        generated += 1
        print(f"generated {target}")

    print(f"generated {generated} Claude agent definitions")


def default_claude_agents_dir() -> Path:
    return Path(os.environ.get("CLAUDE_AGENTS_DIR", REPO_ROOT / ".claude" / "agents")).expanduser()


def main() -> int:
    parser = argparse.ArgumentParser(description="Install portable skills and generate Claude agents")
    subparsers = parser.add_subparsers(dest="command", required=True)

    install_parser = subparsers.add_parser("install", help="install skills to Codex runtime and optionally Claude agents")
    install_parser.add_argument("--codex-skills-root", type=Path, default=default_codex_skills_root())
    install_parser.add_argument("--claude-agents-dir", type=Path, default=default_claude_agents_dir())
    install_parser.add_argument("--skip-claude-agents", action="store_true")

    claude_parser = subparsers.add_parser("generate-claude-agents", help="generate .claude/agents definitions")
    claude_parser.add_argument("--claude-agents-dir", type=Path, default=default_claude_agents_dir())

    args = parser.parse_args()
    if args.command == "install":
        install_codex_skills(args.codex_skills_root.expanduser())
        if not args.skip_claude_agents:
            generate_claude_agents(args.claude_agents_dir.expanduser())
        return 0

    if args.command == "generate-claude-agents":
        generate_claude_agents(args.claude_agents_dir.expanduser())
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
