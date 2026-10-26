"""Tests for the active database bootstrap path."""

from unittest.mock import AsyncMock
from types import SimpleNamespace

import pytest


@pytest.mark.unit
@pytest.mark.asyncio
async def test_run_seed_executes_admin_and_tenant_bootstrap(monkeypatch):
    from app.core import database, seed

    session = object()

    class SessionContext:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(database, "AsyncSessionLocal", SessionContext)
    seed_admin = AsyncMock(return_value=True)
    seed_tenant = AsyncMock(return_value=False)
    monkeypatch.setattr(seed, "seed_admin_user", seed_admin)
    monkeypatch.setattr(seed, "seed_default_tenant", seed_tenant)

    await seed.run_seed()

    seed_admin.assert_awaited_once_with(session)
    seed_tenant.assert_awaited_once_with(session)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_default_tenant_seed_uses_postgres_safe_json_bind(monkeypatch):
    from sqlalchemy.dialects import postgresql
    from app.core import seed

    class EmptyTenantCount:
        def scalar(self):
            return 0

    db = AsyncMock()
    db.execute.return_value = EmptyTenantCount()
    tenant_service = AsyncMock()
    monkeypatch.setattr(
        "app.multitenancy.tenant_service.get_tenant_service",
        lambda: tenant_service,
    )

    assert await seed.seed_default_tenant(db) is True

    insert_statement = db.execute.await_args_list[-1].args[0]
    insert_parameters = db.execute.await_args_list[-1].args[1]
    compiled = insert_statement.compile(dialect=postgresql.dialect())
    assert "CAST(%(domains)s AS json)" in str(compiled)
    assert insert_parameters["domains"] == '["smartspec.local", "localhost", "smartspec.pro"]'
    db.commit.assert_awaited_once()


def test_development_schema_bootstrap_leaves_checkpoints_to_langgraph():
    from app.core.database import _schema_tables_for_init

    tables = [SimpleNamespace(name=name) for name in ("users", "executions", "checkpoints")]
    selected = _schema_tables_for_init(
        tables,
        environment="development",
        database_mode="development",
    )

    assert [table.name for table in selected] == ["users", "executions"]
    assert _schema_tables_for_init(
        tables,
        environment="development",
        database_mode="production-readonly",
    ) == tables
