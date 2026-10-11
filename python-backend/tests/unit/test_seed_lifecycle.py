"""Tests for the active database bootstrap path."""

from unittest.mock import AsyncMock

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
