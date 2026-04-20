from __future__ import annotations

import json
import re
from pathlib import Path

from app.services.openai_agents_version import get_declared_openai_agents_version


REPO_ROOT = Path(__file__).resolve().parents[3]
PYTHON_BACKEND_ROOT = REPO_ROOT / "python-backend"


def test_openai_agents_is_exactly_pinned():
    requirements_path = PYTHON_BACKEND_ROOT / "requirements.txt"
    requirements_text = requirements_path.read_text(encoding="utf-8")

    assert get_declared_openai_agents_version(requirements_path) == "0.14.2"
    assert "openai-agents==0.14.2" in requirements_text
    assert "openai-agents>=" not in requirements_text


def test_openai_agents_sdk_dependency_is_declared_in_one_python_path_only():
    python_manifest_paths = [
        PYTHON_BACKEND_ROOT / "pyproject.toml",
        *sorted(PYTHON_BACKEND_ROOT.glob("requirements*.txt")),
    ]
    offenders: list[str] = []
    declarations: list[str] = []

    for manifest_path in python_manifest_paths:
        contents = manifest_path.read_text(encoding="utf-8")
        if "openai-agents" not in contents:
            continue
        relative = manifest_path.relative_to(REPO_ROOT).as_posix()
        declarations.append(relative)
        if relative != "python-backend/requirements.txt":
            offenders.append(relative)

    assert declarations == ["python-backend/requirements.txt"]
    assert offenders == []


def test_no_node_package_manifest_includes_openai_agents_sdk_dependency():
    package_json_paths = list(REPO_ROOT.glob("**/package.json"))
    offenders: list[str] = []

    for package_json_path in package_json_paths:
        if "node_modules" in package_json_path.parts:
            continue
        package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
        for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            deps = package_json.get(key) or {}
            if "openai-agents" in deps or "@openai/agents" in deps:
                offenders.append(str(package_json_path.relative_to(REPO_ROOT)))

    assert offenders == []


def test_only_allowed_python_files_import_agents_sdk():
    allowed = {
        "app/services/agency_swarm_adapter.py",
        "app/services/openai_agents_adapter.py",
    }
    pattern = re.compile(
        r"(^|\n)\s*(from\s+agents(?:\.|\s)|import\s+agents(?:\s|$)|importlib\.import_module\([\"']agents[\"']\))"
    )
    offenders: list[str] = []

    for path in (PYTHON_BACKEND_ROOT / "app").rglob("*.py"):
        relative = path.relative_to(PYTHON_BACKEND_ROOT).as_posix()
        if relative in allowed:
            continue
        if pattern.search(path.read_text(encoding="utf-8")):
            offenders.append(relative)

    assert offenders == []
