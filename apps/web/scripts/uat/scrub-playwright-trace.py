#!/usr/bin/env python3
"""Remove session/JWT values from Playwright trace archives in place."""

from __future__ import annotations

import re
import sys
import tempfile
import zipfile
from pathlib import Path

JWT = re.compile(rb"(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])")
COOKIE = re.compile(rb"(?i)(app_session_id\s*[=:]\s*)[^;,\s\"\\]+")
BEARER = re.compile(rb"(?i)(bearer\s+)[A-Za-z0-9._~+/-]{16,}")
COOKIE_JSON = re.compile(rb'(?i)("name"\s*:\s*"app_session_id"\s*,\s*"value"\s*:\s*")[^\"]*(")')


def scrub(data: bytes) -> bytes:
    data = COOKIE_JSON.sub(rb'\1[REDACTED]\2', data)
    data = COOKIE.sub(rb'\1[REDACTED]', data)
    data = BEARER.sub(rb'\1[REDACTED]', data)
    return JWT.sub(b"[JWT_REDACTED]", data)


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    archive = Path(sys.argv[1])
    if not archive.is_file():
        return 0
    with tempfile.NamedTemporaryFile(dir=archive.parent, suffix=".zip", delete=False) as temporary:
        temp_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(archive, "r") as source, zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                payload = source.read(item.filename)
                if item.filename.endswith((".json", ".trace", ".network", ".txt")):
                    payload = scrub(payload)
                target.writestr(item, payload)
        temp_path.replace(archive)
        archive.chmod(0o600)
        return 0
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
