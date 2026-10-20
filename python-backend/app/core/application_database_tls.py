"""End-to-end PostgreSQL trust for application request containers."""
import os
import ssl
from collections.abc import Mapping
from urllib.parse import urlsplit, parse_qsl

from app.core.application_runtime import get_application_runtime_profile


def application_database_connect_args(
    environment: str, environ: Mapping[str, str] | None = None, database_url: str | None = None
) -> dict:
    values = os.environ if environ is None else environ
    required = get_application_runtime_profile(environment, values).mode == "cloudflare-http"
    if not required and "DATABASE_SSL_MODE" not in values:
        return {}
    try:
        if values.get("DATABASE_SSL_MODE") != "verify-full" or not values.get("DATABASE_SSL_CA"):
            raise ValueError()
        if database_url is not None:
            address = urlsplit(database_url)
            if address.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"} or not address.hostname:
                raise ValueError()
            if any(key.lower().startswith("ssl") for key, _ in parse_qsl(address.query)):
                raise ValueError()
        context = ssl.create_default_context(cadata=values["DATABASE_SSL_CA"])
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        return {"ssl": context}
    except (ValueError, ssl.SSLError):
        raise ValueError("APPLICATION_DATABASE_TLS_REQUIRED") from None
