"""Celery maintenance tasks for browser policy audit partitions."""

from __future__ import annotations

import logging
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

_sync_engine = None
_SyncSession = None
_PARTITION_NAME_RE = re.compile(r"browser_policy_decisions_(\d{4})_(\d{2})$")
_DEFAULT_MONTHS_AHEAD = 2
_DEFAULT_RETENTION_DAYS = 365


def _get_sync_db_url() -> str:
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "")
    if url.startswith("postgresql+asyncpg"):
        return url.replace("postgresql+asyncpg", "postgresql")
    return url


@contextmanager
def get_sync_session():
    global _sync_engine, _SyncSession
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=2)
        _SyncSession = sessionmaker(bind=_sync_engine)
    session = _SyncSession()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@dataclass(frozen=True)
class PartitionWindow:
    start: datetime
    end: datetime

    @property
    def table_name(self) -> str:
        return f"browser_policy_decisions_{self.start.year:04d}_{self.start.month:02d}"


def _month_start(moment: datetime) -> datetime:
    return moment.astimezone(timezone.utc).replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def _shift_month(month_start: datetime, months: int) -> datetime:
    year = month_start.year + ((month_start.month - 1 + months) // 12)
    month = ((month_start.month - 1 + months) % 12) + 1
    return month_start.replace(year=year, month=month)


def _partition_window(month_start: datetime) -> PartitionWindow:
    normalized = _month_start(month_start)
    return PartitionWindow(
        start=normalized,
        end=_shift_month(normalized, 1),
    )


def _list_partition_names(session) -> list[str]:
    rows = session.execute(
        text(
            """
            SELECT child.relname
            FROM pg_inherits
            JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
            JOIN pg_class child ON pg_inherits.inhrelid = child.oid
            WHERE parent.relname = 'browser_policy_decisions'
            """
        )
    ).fetchall()
    return [str(row[0]) for row in rows]


def maintain_browser_policy_decision_partitions(
    session,
    *,
    now: datetime | None = None,
    months_ahead: int = _DEFAULT_MONTHS_AHEAD,
    retention_days: int = _DEFAULT_RETENTION_DAYS,
) -> dict[str, object]:
    current_month = _month_start(now or datetime.now(timezone.utc))
    created: list[str] = []
    dropped: list[str] = []

    for offset in range(months_ahead + 1):
        window = _partition_window(_shift_month(current_month, offset))
        session.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS "{window.table_name}"
                  PARTITION OF "browser_policy_decisions"
                  FOR VALUES FROM ('{window.start.strftime("%Y-%m-%d %H:%M:%S+00")}')
                  TO ('{window.end.strftime("%Y-%m-%d %H:%M:%S+00")}')
                """
            )
        )
        created.append(window.table_name)

    cutoff_month = _month_start(
        (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        - timedelta(days=retention_days)
    )

    for partition_name in _list_partition_names(session):
        match = _PARTITION_NAME_RE.fullmatch(partition_name)
        if not match:
            continue
        partition_start = datetime(
            int(match.group(1)),
            int(match.group(2)),
            1,
            tzinfo=timezone.utc,
        )
        partition_end = _shift_month(partition_start, 1)
        if partition_end <= cutoff_month:
            session.execute(text(f'DROP TABLE IF EXISTS "{partition_name}"'))
            dropped.append(partition_name)

    return {
        "created_partitions": created,
        "dropped_partitions": dropped,
        "current_partition": _partition_window(current_month).table_name,
        "future_partition": _partition_window(_shift_month(current_month, 1)).table_name,
        "retention_cutoff_month": cutoff_month.strftime("%Y-%m"),
    }


@celery_app.task(name="app.tasks.browser_policy_maintenance_tasks.ensure_browser_policy_decision_partitions")
def ensure_browser_policy_decision_partitions() -> dict[str, object]:
    try:
        with get_sync_session() as session:
            result = maintain_browser_policy_decision_partitions(session)
            logger.info(
                "browser_policy_partition_maintenance_completed",
                extra=result,
            )
            return result
    except Exception as exc:
        logger.error(
            "browser_policy_partition_maintenance_failed",
            extra={"error": str(exc)},
        )
        return {"error": str(exc)}
