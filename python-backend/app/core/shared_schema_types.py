"""PostgreSQL bindings for tables owned by the shared Drizzle contract."""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Persist timestamptz while preserving the services' naive-UTC interface.

    Existing library/callback services use datetime.utcnow(). Normalize their
    binds explicitly, and return naive UTC so comparisons retain that contract.
    Aware inputs are converted by instant, never by relabelling a local clock.
    """

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name == "postgresql"))

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        utc = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return utc if dialect.name == "postgresql" else utc.replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)
