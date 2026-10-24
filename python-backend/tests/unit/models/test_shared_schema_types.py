"""Cross-runtime PostgreSQL bindings preserve data and legacy UTC semantics."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import JSON, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.dialects.postgresql import ENUM, JSONB

from app.core.shared_schema_types import UTCDateTime
from app.models.library import LibraryIndexJob, LibraryItem, VectorIndexRecord
from app.models.live_browser import LiveBrowserSession
from app.models.media_callback_event import MediaCallbackEvent


def test_naive_utc_and_aware_offsets_bind_to_the_same_postgres_instant():
    value = UTCDateTime()
    naive = datetime(2026, 10, 24, 3, 0)
    local = datetime(2026, 10, 24, 10, 0, tzinfo=timezone(timedelta(hours=7)))
    expected = naive.replace(tzinfo=timezone.utc)
    assert value.process_bind_param(naive, postgresql.dialect()) == expected
    assert value.process_bind_param(local, postgresql.dialect()) == expected
    assert value.process_result_value(local, postgresql.dialect()) == naive
    assert value.process_bind_param(None, postgresql.dialect()) is None
    assert value.process_result_value(None, postgresql.dialect()) is None


def test_postgres_is_timezone_aware_but_sqlite_keeps_naive_utc():
    value = UTCDateTime()
    assert value.load_dialect_impl(postgresql.dialect()).timezone is True
    assert value.load_dialect_impl(sqlite.dialect()).timezone is False
    local = datetime(2026, 10, 24, 10, tzinfo=timezone(timedelta(hours=7)))
    assert value.process_bind_param(local, sqlite.dialect()) == datetime(2026, 10, 24, 3)


@pytest.mark.parametrize("model,attribute,enum_name", [
    (LibraryItem, "status", "library_item_status"),
    (LibraryItem, "visibility", "library_visibility"),
    (LibraryIndexJob, "status", "library_index_job_status"),
    (VectorIndexRecord, "status", "vector_projection_status"),
    (MediaCallbackEvent, "status", "media_callback_event_status"),
    (LiveBrowserSession, "status", "live_browser_session_status"),
])
def test_shared_enum_queries_bind_native_postgres_types(model, attribute, enum_name):
    column = getattr(model, attribute)
    assert isinstance(column.type, ENUM)
    assert column.type.name == enum_name
    assert column.type.create_type is False
    compiled = str(select(model.id).where(column == column.type.enums[0]).compile(
        dialect=postgresql.asyncpg.dialect()))
    assert f"::{enum_name}" in compiled
    assert "::VARCHAR" not in compiled


def test_live_browser_json_uses_jsonb_on_postgres_and_json_on_sqlite():
    column = LiveBrowserSession.__table__.c.policyContextJson
    assert isinstance(column.type.dialect_impl(postgresql.dialect()), JSONB)
    assert isinstance(column.type.dialect_impl(sqlite.dialect()), JSON)
