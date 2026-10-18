#!/usr/bin/env python3
"""Start the development Python API only with isolated database configuration."""
import os
import sys
from urllib.parse import urlsplit


def main() -> None:
    if os.environ.get("ENVIRONMENT") != "development":
        raise SystemExit("Development ENVIRONMENT is required")
    database = urlsplit(os.environ.get("DATABASE_URL", ""))
    if not database.path.endswith("_dev_web"):
        raise SystemExit("Use a dedicated database ending in _dev_web")
    if os.environ.get("PYTHON_DOTENV_DISABLED") != "1":
        raise SystemExit("Disable production dotenv discovery for this dev service")
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                              "--host", "127.0.0.1", "--port", "8100"])


if __name__ == "__main__":
    main()
