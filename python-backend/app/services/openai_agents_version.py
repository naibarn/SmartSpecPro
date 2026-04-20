from __future__ import annotations

import os
import re
from importlib import metadata
from pathlib import Path

OPENAI_AGENTS_PACKAGE_NAME = "openai-agents"
ADAPTER_VERSION = os.getenv("SMARTSPEC_OPENAI_AGENTS_ADAPTER_VERSION", "0.1.0")

_OPENAI_AGENTS_PIN_PATTERN = re.compile(
    r"^\s*openai-agents==(?P<version>[A-Za-z0-9][A-Za-z0-9.\-_]*)\s*(?:#.*)?$",
    re.MULTILINE,
)


def _default_requirements_path() -> Path:
    return Path(__file__).resolve().parents[2] / "requirements.txt"


def get_declared_openai_agents_version(
    requirements_path: str | Path | None = None,
) -> str | None:
    path = Path(requirements_path) if requirements_path is not None else _default_requirements_path()
    if not path.exists():
        return None

    match = _OPENAI_AGENTS_PIN_PATTERN.search(path.read_text(encoding="utf-8"))
    if match is None:
        return None
    return match.group("version")


def get_installed_openai_agents_version() -> str | None:
    try:
        return metadata.version(OPENAI_AGENTS_PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return None


def get_effective_openai_agents_version(
    requirements_path: str | Path | None = None,
) -> str:
    return (
        get_installed_openai_agents_version()
        or get_declared_openai_agents_version(requirements_path)
        or "unavailable"
    )


def describe_openai_agents_runtime(
    requirements_path: str | Path | None = None,
) -> dict[str, str | None]:
    return {
        "adapterVersion": ADAPTER_VERSION,
        "sdkVersion": get_effective_openai_agents_version(requirements_path),
        "sdkVersionDeclared": get_declared_openai_agents_version(requirements_path),
        "sdkVersionInstalled": get_installed_openai_agents_version(),
    }
