"""Keep the SQLite test schema compatible with canonical cross-service models."""

from sqlalchemy.dialects.sqlite import dialect

from app.core.database import Base
from sqlalchemy.dialects.postgresql import JSONB


def test_shared_chat_foreign_key_targets_exist_in_test_metadata():
    media_assets = Base.metadata.tables["media_assets"]

    assert "conversations" in Base.metadata.tables
    assert "messages" in Base.metadata.tables
    assert {
        foreign_key.target_fullname
        for foreign_key in media_assets.foreign_keys
        if foreign_key.target_fullname in {"conversations.id", "messages.id"}
    } == {"conversations.id", "messages.id"}


def test_jsonb_columns_compile_for_sqlite_test_database():
    assert JSONB().compile(dialect=dialect()) == "JSON"
