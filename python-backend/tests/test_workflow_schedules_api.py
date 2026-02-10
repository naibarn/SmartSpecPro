"""Tests for workflow schedule and event subscription API endpoints."""
import pytest
from datetime import datetime, timezone
from sqlalchemy import select

from app.models.workflow import Workflow
from app.models.workflow_schedule import WorkflowSchedule
from app.models.workflow_event_subscription import WorkflowEventSubscription


@pytest.mark.asyncio
class TestScheduleEndpoints:
    """Test schedule management endpoints."""

    async def test_create_schedule_success(self, client, test_user, test_tenant, test_db, auth_headers):
        """Test successful schedule creation."""
        # Create a test workflow
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
            status="active",
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        # Create schedule (TestClient is synchronous)
        response = client.post(
            "/api/workflows/schedules",
            json={
                "workflow_id": str(workflow.id),
                "node_id": "node-123",
                "cron_expression": "0 0 * * *",
                "timezone": "UTC",
                "is_active": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["workflow_id"] == str(workflow.id)
        assert data["node_id"] == "node-123"
        assert data["cron_expression"] == "0 0 * * *"
        assert data["timezone"] == "UTC"
        assert data["is_active"] is True
        assert data["next_run"] is not None

        # Verify in database
        result = await test_db.execute(
            select(WorkflowSchedule).where(WorkflowSchedule.id == int(data["id"]))
        )
        schedule = result.scalar_one()
        assert schedule.workflowId == workflow.id
        assert schedule.cronExpression == "0 0 * * *"

    async def test_create_schedule_invalid_cron(self, client, test_user, test_tenant, test_db, auth_headers):
        """Test schedule creation with invalid cron expression."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        response = client.post(
            "/api/workflows/schedules",
            json={
                "workflow_id": str(workflow.id),
                "node_id": "node-123",
                "cron_expression": "INVALID CRON",
                "timezone": "UTC",
                "is_active": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "Invalid cron expression" in response.json()["detail"]

    async def test_create_schedule_workflow_not_found(self, client, auth_headers):
        """Test schedule creation for non-existent workflow."""
        response = client.post(
            "/api/workflows/schedules",
            json={
                "workflow_id": "99999",
                "node_id": "node-123",
                "cron_expression": "0 0 * * *",
                "timezone": "UTC",
                "is_active": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_list_schedules(self, client, test_user, test_tenant, test_db, auth_headers):
        """Test listing schedules for current tenant."""
        # Create workflow and schedules
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        schedule1 = WorkflowSchedule(
            workflowId=workflow.id,
            nodeId="node-1",
            cronExpression="0 0 * * *",
            timezone="UTC",
            isActive=True,
        )
        schedule2 = WorkflowSchedule(
            workflowId=workflow.id,
            nodeId="node-2",
            cronExpression="0 12 * * *",
            timezone="America/New_York",
            isActive=False,
        )
        test_db.add_all([schedule1, schedule2])
        await test_db.commit()

        response = client.get("/api/workflows/schedules", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    async def test_delete_schedule_success(self, client, test_user, test_tenant, test_db, auth_headers):
        """Test successful schedule deletion."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        schedule = WorkflowSchedule(
            workflowId=workflow.id,
            nodeId="node-1",
            cronExpression="0 0 * * *",
            timezone="UTC",
            isActive=True,
        )
        test_db.add(schedule)
        await test_db.commit()
        await test_db.refresh(schedule)

        response = client.delete(
            f"/api/workflows/schedules/{schedule.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify deletion
        result = await test_db.execute(
            select(WorkflowSchedule).where(WorkflowSchedule.id == schedule.id)
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
class TestEventSubscriptionEndpoints:
    """Test event subscription endpoints."""

    async def test_create_event_subscription_success(
        self, client, test_user, test_tenant, test_db, auth_headers
    ):
        """Test successful event subscription creation."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        response = client.post(
            "/api/workflows/event-subscriptions",
            json={
                "workflow_id": str(workflow.id),
                "node_id": "node-456",
                "event_type": "user.created",
                "filter_conditions": {"role": "admin"},
                "is_active": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["workflow_id"] == str(workflow.id)
        assert data["node_id"] == "node-456"
        assert data["event_type"] == "user.created"
        assert data["filter_conditions"] == {"role": "admin"}
        assert data["is_active"] is True

        # Verify in database
        result = await test_db.execute(
            select(WorkflowEventSubscription).where(
                WorkflowEventSubscription.id == int(data["id"])
            )
        )
        subscription = result.scalar_one()
        assert subscription.eventType == "user.created"

    async def test_create_event_subscription_invalid_event_type(
        self, client, test_user, test_tenant, test_db, auth_headers
    ):
        """Test subscription creation with invalid event type."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        response = client.post(
            "/api/workflows/event-subscriptions",
            json={
                "workflow_id": str(workflow.id),
                "node_id": "node-456",
                "event_type": "invalid.event",
                "is_active": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "Invalid event type" in response.json()["detail"]

    async def test_list_event_subscriptions(self, client, test_user, test_tenant, test_db, auth_headers):
        """Test listing event subscriptions."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        sub1 = WorkflowEventSubscription(
            workflowId=workflow.id,
            nodeId="node-1",
            eventType="user.created",
            isActive=True,
        )
        sub2 = WorkflowEventSubscription(
            workflowId=workflow.id,
            nodeId="node-2",
            eventType="skill.completed",
            filterConditions={"skillId": "enhance-prompt"},
            isActive=False,
        )
        test_db.add_all([sub1, sub2])
        await test_db.commit()

        response = client.get("/api/workflows/event-subscriptions", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    async def test_delete_event_subscription_success(
        self, client, test_user, test_tenant, test_db, auth_headers
    ):
        """Test successful event subscription deletion."""
        workflow = Workflow(
            name="Test Workflow",
            workflowJson={"nodes": [], "edges": []},
            userId=test_user.id,
            tenantId=test_tenant.id,
        )
        test_db.add(workflow)
        await test_db.commit()
        await test_db.refresh(workflow)

        subscription = WorkflowEventSubscription(
            workflowId=workflow.id,
            nodeId="node-1",
            eventType="user.created",
            isActive=True,
        )
        test_db.add(subscription)
        await test_db.commit()
        await test_db.refresh(subscription)

        response = client.delete(
            f"/api/workflows/event-subscriptions/{subscription.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify deletion
        result = await test_db.execute(
            select(WorkflowEventSubscription).where(
                WorkflowEventSubscription.id == subscription.id
            )
        )
        assert result.scalar_one_or_none() is None
