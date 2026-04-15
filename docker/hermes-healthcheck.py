from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    base = os.environ.get("SMARTSPEC_WEB_GATEWAY_URL", "").rstrip("/")
    if not base:
        return 1

    for path in ("/healthz", "/health"):
        try:
            with urllib.request.urlopen(base + path, timeout=5) as response:
                if 200 <= response.status < 400:
                    return 0
        except urllib.error.URLError:
            continue
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
