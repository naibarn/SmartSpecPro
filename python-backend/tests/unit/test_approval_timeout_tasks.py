from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.tasks import approval_timeout_tasks

pytestmark = [pytest.mark.unit]


@pytest.mark.asyncio
async def test_expired_approval_sweep_uses_only_durable_database_rows(monkeypatch):
    expire_requests = AsyncMock(return_value=2)
    monkeypatch.setattr(approval_timeout_tasks, "_expire_db_requests", expire_requests)

    await approval_timeout_tasks._check_expired_approvals_async()

    expire_requests.assert_awaited_once_with()
