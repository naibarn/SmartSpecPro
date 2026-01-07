import os
from pathlib import Path

DENY_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".spec", ".smartspec"}
DENY_FILES_PREFIX = {".env", "id_rsa", "id_ed25519"}

def is_within(base: Path, target: Path) -> bool:
    """Return True if target path is inside base directory (after resolving)."""
    try:
        base = base.resolve()
        target = target.resolve()
        # Use pathlib.relative_to to avoid prefix tricks like /foo/bar vs /foo/bar2
        target.relative_to(base)
        return True
    except Exception:
        return False


def is_path_allowed(path: Path) -> bool:
    """Check whether a path should be accessible from the sandbox.

    This prevents reading obvious secret files or internal metadata directories.
    """
    try:
        p = path.resolve()
    except Exception:
        return False

    # Block any path that lives inside denied directories
    for part in p.parts:
        if part in DENY_DIRS:
            return False

    # Block files with sensitive prefixes
    for prefix in DENY_FILES_PREFIX:
        if p.name.startswith(prefix):
            return False

    return True

def validate_workspace(workspace: str, root: str = "") -> str:
    ws = Path(workspace).resolve()
    if root:
        base = Path(root).resolve()
        if not is_within(base, ws):
            raise ValueError("workspace_outside_root")
    if not ws.exists() or not ws.is_dir():
        raise ValueError("workspace_not_found")
    return str(ws)

def sanitize_env(env: dict) -> dict:
    # Drop common secrets
    blocked_prefixes = ("OPENAI_", "AWS_", "R2_", "STRIPE_", "DATABASE_URL", "JWT_", "CONTROL_PLANE_", "ORCHESTRATOR_")
    out = {}
    for k, v in env.items():
        if k.startswith(blocked_prefixes):
            continue
        out[k] = v
    # Force non-interactive
    out["CI"] = "1"
    return out
