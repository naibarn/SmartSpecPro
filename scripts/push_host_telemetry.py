#!/usr/bin/env python3
"""Entrypoint used by the existing systemd monitor daemon."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "python-backend"))

from app.services.host_telemetry_collector import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
