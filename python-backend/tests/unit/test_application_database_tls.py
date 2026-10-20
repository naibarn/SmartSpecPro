"""Request containers must never downgrade PostgreSQL transport verification."""
import pytest
from app.core.application_database_tls import application_database_connect_args

HTTP = {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http", "CLOUDFLARE_CONTAINER_POLICY": "on-demand"}

@pytest.mark.unit
def test_standard_local_connection_is_preserved():
    assert application_database_connect_args("production", {}) == {}

@pytest.mark.unit
@pytest.mark.parametrize("values", [{}, {"DATABASE_SSL_MODE": "require"}, {"DATABASE_SSL_MODE": "verify-full"}, {"DATABASE_SSL_MODE": "verify-full", "DATABASE_SSL_CA": "invalid"}])
def test_request_container_refuses_missing_or_weakened_trust(values):
    with pytest.raises(ValueError, match="^APPLICATION_DATABASE_TLS_REQUIRED$"):
        application_database_connect_args("production", {**HTTP, **values})
