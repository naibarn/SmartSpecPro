#!/usr/bin/env python3
"""Start the development Python API against dev or read-only production data."""
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit


def load_dev_environment() -> None:
    """Load the private dev-only environment file without overriding the caller."""
    if os.environ.get("ENVIRONMENT") and os.environ.get("DATABASE_URL"):
        return
    env_path = Path(os.environ.get("SMARTSPEC_DEV_ENV_FILE", Path.home() / ".config/smartspec-dev/python.env"))
    if not env_path.is_file():
        return
    try:
        from dotenv import dotenv_values
    except ImportError as exc:
        raise SystemExit("python-dotenv is required to load the dev environment file") from exc
    for key, value in dotenv_values(env_path).items():
        if value is not None:
            os.environ.setdefault(key, value)


def main() -> None:
    load_dev_environment()
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
