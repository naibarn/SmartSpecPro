#!/usr/bin/env python3
"""Start the development Python API with explicit isolated or shared-production database configuration."""
import os
import sys
from urllib.parse import urlsplit


def main() -> None:
    if os.environ.get("ENVIRONMENT") != "development":
        raise SystemExit("Development ENVIRONMENT is required")
    database = urlsplit(os.environ.get("DATABASE_URL", ""))
    mode = os.environ.get("SMARTSPEC_DEV_DATABASE_MODE", "isolated")
    if mode == "shared-production":
        expected_name = os.environ.get("SMARTSPEC_SHARED_DATABASE_NAME")
        if not expected_name or database.path != f"/{expected_name}":
            raise SystemExit("Shared production database name must be explicit")
    elif mode != "isolated" or not database.path.endswith("_dev_web"):
        raise SystemExit("Use an isolated _dev_web database or explicit shared-production mode")
    if os.environ.get("PYTHON_DOTENV_DISABLED") != "1":
        raise SystemExit("Disable production dotenv discovery for this dev service")
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                              "--host", "127.0.0.1", "--port", "8100"])


if __name__ == "__main__":
    main()
