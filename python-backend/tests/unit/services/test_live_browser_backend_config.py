import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_in_memory_live_browser_backend_requires_explicit_test_override():
    with pytest.raises(ValidationError, match="LIVE_BROWSER_IN_MEMORY_TEST_OVERRIDE"):
        Settings(
            _env_file=None,
            LIVE_BROWSER_BACKEND="in_memory",
            LIVE_BROWSER_IN_MEMORY_TEST_OVERRIDE=False,
        )


def test_browser_pool_is_the_explicit_default_live_browser_backend():
    settings = Settings(_env_file=None)

    assert settings.LIVE_BROWSER_BACKEND == "browser_pool"
    assert settings.LIVE_BROWSER_IN_MEMORY_TEST_OVERRIDE is False


def test_postgres_database_url_is_normalized_for_async_sqlalchemy():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://user:password@db.example/app",
    )

    assert settings.DATABASE_URL == "postgresql+asyncpg://user:password@db.example/app"
