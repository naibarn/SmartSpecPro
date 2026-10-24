#!/usr/bin/env python3
"""Start the development Python API against dev or read-only production data."""
import os
import sys
from urllib.parse import urlsplit


def main() -> None:
    if os.environ.get("ENVIRONMENT") != "development":
        raise SystemExit("Development ENVIRONMENT is required")
    mode = os.environ.get("SMARTSPEC_DEV_DATABASE_MODE", "development")
    if mode == "production-readonly":
        selected_url = os.environ.get("SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL", "")
        database = urlsplit(selected_url)
        if (database.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}
                or database.path != "/smartspec"
                or not database.username
                or not database.username.endswith("_debug_ro")):
            raise SystemExit("Production debugging requires a dedicated _debug_ro role and smartspec database")
        os.environ["DATABASE_URL"] = selected_url
    elif mode == "development":
        database = urlsplit(os.environ.get("DATABASE_URL", ""))
        if not (database.path.endswith("_dev") or database.path.endswith("_dev_web")):
            raise SystemExit("Development mode requires an isolated _dev database")
    else:
        raise SystemExit("Choose SMARTSPEC_DEV_DATABASE_MODE=development or production-readonly")
    if os.environ.get("PYTHON_DOTENV_DISABLED") != "1":
        raise SystemExit("Disable production dotenv discovery for this dev service")
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                              "--host", "127.0.0.1", "--port", "8100"])


if __name__ == "__main__":
    main()
