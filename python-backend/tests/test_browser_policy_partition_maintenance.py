from datetime import datetime, timezone

from app.tasks.browser_policy_maintenance_tasks import (
    maintain_browser_policy_decision_partitions,
)


class FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def fetchall(self):
        return self._rows


class FakeSession:
    def __init__(self, partition_names=None):
        self.partition_names = partition_names or []
        self.executed_sql: list[str] = []

    def execute(self, statement):
        sql_text = str(statement)
        self.executed_sql.append(sql_text)
        if "SELECT child.relname" in sql_text:
            return FakeResult([(name,) for name in self.partition_names])
        return FakeResult()


def test_partition_maintenance_creates_current_and_future_partitions():
    session = FakeSession(partition_names=["browser_policy_decisions_2026_03"])

    result = maintain_browser_policy_decision_partitions(
        session,
        now=datetime(2026, 3, 10, tzinfo=timezone.utc),
        months_ahead=2,
        retention_days=365,
    )

    assert result["current_partition"] == "browser_policy_decisions_2026_03"
    assert result["future_partition"] == "browser_policy_decisions_2026_04"
    assert 'CREATE TABLE IF NOT EXISTS "browser_policy_decisions_2026_05"' in "\n".join(session.executed_sql)


def test_partition_maintenance_drops_partitions_older_than_retention():
    session = FakeSession(
        partition_names=[
            "browser_policy_decisions_2024_01",
            "browser_policy_decisions_2026_03",
        ]
    )

    result = maintain_browser_policy_decision_partitions(
        session,
        now=datetime(2026, 3, 10, tzinfo=timezone.utc),
        months_ahead=1,
        retention_days=365,
    )

    assert "browser_policy_decisions_2024_01" in result["dropped_partitions"]
    assert 'DROP TABLE IF EXISTS "browser_policy_decisions_2024_01"' in "\n".join(session.executed_sql)
