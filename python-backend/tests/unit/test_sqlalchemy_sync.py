from __future__ import annotations

import pytest

from app.core.sqlalchemy_sync import to_sync_sqlalchemy_url

pytestmark = [pytest.mark.unit]


@pytest.mark.parametrize(
    ("source_url", "expected_url"),
    [
        (
            "postgresql+asyncpg://user@db/app",
            "postgresql+psycopg://user@db/app",
        ),
        (
            "postgresql://user@db/app",
            "postgresql+psycopg://user@db/app",
        ),
        (
            "postgresql://user@db/app",
            "postgresql+psycopg://user@db/app",
        ),
        (
            "postgresql+psycopg://user@db/app",
            "postgresql+psycopg://user@db/app",
        ),
        (
            "sqlite+aiosqlite:///tmp/test.db",
            "sqlite:///tmp/test.db",
        ),
    ],
)
def test_to_sync_sqlalchemy_url_normalizes_supported_urls(
    source_url: str,
    expected_url: str,
):
    assert to_sync_sqlalchemy_url(source_url) == expected_url


def test_to_sync_sqlalchemy_url_leaves_unknown_urls_unchanged():
    assert to_sync_sqlalchemy_url("sqlite:///tmp/test.db") == (
        "sqlite:///tmp/test.db"
    )
