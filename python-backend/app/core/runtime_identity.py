"""Runtime identity written once when a Celery process imports the app.

The media compose stack bind-mounts the Python source tree. A bind mount can
therefore contain newer code while an already-running Celery master still has
the previous modules in memory. This fingerprint lets the host doctor detect
that condition without probing or replaying a business task.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

RUNTIME_IDENTITY_FILE = Path(
    os.getenv("SMARTSPEC_RUNTIME_IDENTITY_FILE", "/tmp/smartspec-celery-runtime.json")
)
_APP_ROOT = Path(__file__).resolve().parents[1]


def compute_source_fingerprint() -> str:
    """Return a deterministic digest for the checked-out Python app source."""

    digest = hashlib.sha256()
    for source_path in sorted(_APP_ROOT.rglob("*.py")):
        if "__pycache__" in source_path.parts:
            continue
        relative_path = source_path.relative_to(_APP_ROOT).as_posix()
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(source_path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def write_runtime_identity() -> dict[str, object]:
    """Persist the fingerprint that this process loaded at startup."""

    identity: dict[str, object] = {
        "sourceFingerprint": compute_source_fingerprint(),
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
        "buildId": os.getenv("SMARTSPEC_RUNTIME_BUILD_ID") or None,
    }
    RUNTIME_IDENTITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(
        prefix=f"{RUNTIME_IDENTITY_FILE.name}.",
        dir=RUNTIME_IDENTITY_FILE.parent,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(identity, handle, sort_keys=True)
            handle.write("\n")
        os.replace(temporary_path, RUNTIME_IDENTITY_FILE)
    except Exception:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
    return identity
