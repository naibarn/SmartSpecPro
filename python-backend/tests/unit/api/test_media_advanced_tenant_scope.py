"""Tenant authorization tests for the advanced media task endpoints."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.media_advanced import (
    BulkOperationRequest,
    bulk_operation,
    get_analytics,
    search_tasks,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", [bulk_operation, search_tasks, get_analytics])
async def test_media_advanced_requires_tenant_context(endpoint):
    user = SimpleNamespace(id=24, currentTenantId=None)
    db = AsyncMock()

    if endpoint is bulk_operation:
        call = endpoint(
            BulkOperationRequest(task_ids=["task-1"], operation="delete"),
            db=db,
            current_user=user,
        )
    elif endpoint is search_tasks:
        call = endpoint(query="needle", db=db, current_user=user)
    else:
        call = endpoint(db=db, current_user=user)

    with pytest.raises(HTTPException) as exc_info:
        await call

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Tenant context is required for media task access"
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_media_advanced_analytics_query_is_tenant_scoped():
    user = SimpleNamespace(id=24, currentTenantId="tenant-ZCSKEM9s")
    result = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
    db = AsyncMock()
    db.execute.return_value = result

    await get_analytics(db=db, current_user=user)

    statement = db.execute.await_args.args[0]
    compiled = str(statement)
    assert "media_tasks.tenant_id" in compiled
    assert "media_tasks.user_id" in compiled
