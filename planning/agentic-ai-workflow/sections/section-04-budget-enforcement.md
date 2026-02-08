# Section 04: Budget Enforcement System

**Phase**: 1 - Foundation
**Estimated Time**: 3-4 days
**Priority**: Critical
**Dependencies**: None

---

## Overview

Implement hard budget enforcement at workflow step boundaries to prevent cost overruns. The system reserves estimated credits before each step, blocks execution if insufficient, and finalizes actual costs after completion with refunds/additional charges as needed.

**Key Principle**: Check budget at **step boundaries**, not individual API calls, to avoid wasting partial work.

---

## Goals

- ✅ Budget check before every workflow step
- ✅ Hard stop when budget exceeded (no overages)
- ✅ Two-phase credit protocol (reserve → finalize)
- ✅ Budget alerts at 70%, 90%, 100% thresholds
- ✅ Race condition prevention with pessimistic locking
- ✅ All tests in `tests/test_budget_enforcement.py` pass
- ✅ Redis events emitted for Node.js notification service

---

## Files to Create/Modify

### Python Backend

**Created**:
- `python-backend/app/services/budget.py` - Budget enforcement logic
- `python-backend/tests/test_budget_enforcement.py` - Unit + integration tests

**Modified**:
- `python-backend/app/orchestrator/orchestrator.py` - Integrate budget checks
- `python-backend/app/models/user.py` - Add budget tracking fields (if needed)

---

## Implementation Steps

### Step 1: Create Budget Service

**Create `python-backend/app/services/budget.py`**:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.user import User
from app.models.workflow import WorkflowExecution
import redis.asyncio as redis
from app.core.config import settings
import logging
import json

logger = logging.getLogger(__name__)


class BudgetExceededError(Exception):
    """Raised when user has insufficient credits"""
    pass


async def check_budget_before_step(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    step_id: str,
    estimated_cost_credits: int
) -> bool:
    """
    Check if user has sufficient budget before executing a step.
    Uses pessimistic locking (SELECT FOR UPDATE) to prevent race conditions.

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        step_id: Step being executed
        estimated_cost_credits: Estimated credit cost

    Returns:
        True if budget OK

    Raises:
        BudgetExceededError: If insufficient credits
    """
    # Fetch user's current credits with lock (prevents concurrent deductions)
    result = await session.execute(
        select(User.credits_available)
        .where(User.id == user_id)
        .with_for_update()  # Pessimistic lock
    )
    available_credits = result.scalar_one_or_none()

    if available_credits is None:
        raise ValueError(f"User {user_id} not found")

    # Check if sufficient credits
    if available_credits < estimated_cost_credits:
        logger.warning(
            f"Budget exceeded for user {user_id}: need {estimated_cost_credits}, "
            f"have {available_credits}"
        )

        # Emit budget exceeded event for notifications
        await _emit_budget_event(
            event_type="budget_exceeded",
            user_id=user_id,
            execution_id=execution_id,
            data={
                "required": estimated_cost_credits,
                "available": available_credits,
                "step_id": step_id
            }
        )

        raise BudgetExceededError(
            f"Insufficient credits. Step '{step_id}' requires {estimated_cost_credits} credits, "
            f"but only {available_credits} available. "
            f"Please upgrade your plan or wait for monthly reset."
        )

    # Reserve budget (pessimistic deduction)
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits_available=User.credits_available - estimated_cost_credits)
    )

    # Record reservation in workflow execution
    await session.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == execution_id)
        .values(
            budget_reserved_credits=WorkflowExecution.budget_reserved_credits + estimated_cost_credits
        )
    )

    await session.commit()

    logger.info(
        f"Reserved {estimated_cost_credits} credits for user {user_id}, "
        f"execution {execution_id}, step {step_id}"
    )

    return True


async def finalize_budget_after_step(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    estimated_cost: int,
    actual_cost: int
):
    """
    Finalize budget after step completes.
    Refund if actual < estimated, deduct extra if actual > estimated.

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        estimated_cost: Initially reserved credits
        actual_cost: Actual credits used
    """
    difference = actual_cost - estimated_cost

    if difference != 0:
        # Adjust user's credit balance
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(credits_available=User.credits_available - difference)
        )

        if difference < 0:
            logger.info(f"Refunded {abs(difference)} credits to user {user_id}")
        else:
            logger.info(f"Deducted extra {difference} credits from user {user_id}")

    # Update execution's spent budget
    await session.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == execution_id)
        .values(
            budget_spent_credits=WorkflowExecution.budget_spent_credits + actual_cost
        )
    )

    await session.commit()


async def rollback_budget_reservation(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    reserved_credits: int
):
    """
    Rollback budget reservation if step fails before completion.

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        reserved_credits: Amount to rollback
    """
    # Return credits to user
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits_available=User.credits_available + reserved_credits)
    )

    # Update execution
    await session.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == execution_id)
        .values(
            budget_reserved_credits=WorkflowExecution.budget_reserved_credits - reserved_credits
        )
    )

    await session.commit()

    logger.info(f"Rolled back {reserved_credits} credits for user {user_id}")


async def check_budget_alerts(
    session: AsyncSession,
    user_id: int,
    credits_used_today: int = None
) -> dict:
    """
    Check if user has hit budget alert thresholds (70%, 90%, 100%).

    Args:
        session: Database session
        user_id: User ID
        credits_used_today: Optional pre-calculated usage

    Returns:
        Dict with alert info if threshold crossed, else empty dict
    """
    # Get user's quota and usage
    result = await session.execute(
        select(User.credits_quota, User.credits_available)
        .where(User.id == user_id)
    )
    row = result.one_or_none()
    if not row:
        return {}

    quota, available = row
    used = quota - available

    percentage = (used / quota) * 100 if quota > 0 else 0

    # Check thresholds
    if percentage >= 100:
        await _emit_budget_event(
            "budget_hard_stop",
            user_id,
            None,
            {"threshold": 100, "quota": quota, "used": used}
        )
        return {"threshold": 100, "message": "Budget exhausted"}

    elif percentage >= 90:
        await _emit_budget_event(
            "budget_warning",
            user_id,
            None,
            {"threshold": 90, "quota": quota, "used": used}
        )
        return {"threshold": 90, "message": "90% of budget used"}

    elif percentage >= 70:
        await _emit_budget_event(
            "budget_warning",
            user_id,
            None,
            {"threshold": 70, "quota": quota, "used": used}
        )
        return {"threshold": 70, "message": "70% of budget used"}

    return {}


async def _emit_budget_event(
    event_type: str,
    user_id: int,
    execution_id: str,
    data: dict
):
    """
    Emit budget event to Redis for Node.js notification service.

    Args:
        event_type: Event type (budget_exceeded, budget_warning, budget_hard_stop)
        user_id: User ID
        execution_id: Workflow execution ID (optional)
        data: Event data
    """
    redis_client = await redis.from_url(settings.REDIS_URL)

    event = {
        "type": event_type,
        "user_id": user_id,
        "execution_id": execution_id,
        "timestamp": datetime.utcnow().isoformat(),
        "data": data
    }

    await redis_client.publish("workflow:events", json.dumps(event))
    await redis_client.close()

    logger.info(f"Emitted budget event: {event_type} for user {user_id}")


# Convenience wrapper for use in workflow steps
async def with_budget_check(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    step_id: str,
    estimated_cost: int,
    step_fn,
    *args,
    **kwargs
):
    """
    Execute a step function with budget checking and finalization.

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        step_id: Step ID
        estimated_cost: Estimated credit cost
        step_fn: Async function to execute
        *args, **kwargs: Arguments for step_fn

    Returns:
        Result from step_fn (includes actual_cost)

    Raises:
        BudgetExceededError: If insufficient budget
    """
    # Pre-check budget
    await check_budget_before_step(
        session, user_id, execution_id, step_id, estimated_cost
    )

    try:
        # Execute step
        result = await step_fn(*args, **kwargs)

        # Finalize budget with actual cost
        actual_cost = result.get("cost_credits", estimated_cost)
        await finalize_budget_after_step(
            session, user_id, execution_id, estimated_cost, actual_cost
        )

        return result

    except Exception as e:
        # Rollback reservation on failure
        await rollback_budget_reservation(
            session, user_id, execution_id, estimated_cost
        )
        raise
```

---

### Step 2: Integrate with Orchestrator

**Update `python-backend/app/orchestrator/orchestrator.py`**:

```python
from app.services.budget import (
    check_budget_before_step,
    finalize_budget_after_step,
    rollback_budget_reservation,
    BudgetExceededError,
    with_budget_check
)

class WorkflowOrchestrator:
    async def execute_step(
        self,
        state: WorkflowState,
        step_id: str,
        step_fn
    ):
        """
        Execute a workflow step with budget enforcement.

        Args:
            state: Current workflow state
            step_id: Step ID
            step_fn: Step function to execute

        Returns:
            Updated state
        """
        # Estimate cost for this step
        estimated_cost = self._estimate_step_cost(step_id, state)

        try:
            # Execute with budget checking
            result = await with_budget_check(
                session=self.db_session,
                user_id=state["user_id"],
                execution_id=state["execution_id"],
                step_id=step_id,
                estimated_cost=estimated_cost,
                step_fn=step_fn,
                state=state
            )

            # Update state with result
            state["step_results"][step_id] = result
            state["budget"]["spent"] += result.get("cost_credits", 0)

            return state

        except BudgetExceededError as e:
            # Mark workflow as failed due to budget
            state["status"] = "failed"
            state["error"] = str(e)
            logger.error(f"Workflow {state['execution_id']} failed: {e}")
            raise

    def _estimate_step_cost(self, step_id: str, state: WorkflowState) -> int:
        """
        Estimate credit cost for a step.

        Args:
            step_id: Step ID
            state: Current state

        Returns:
            Estimated credits
        """
        # Cost estimation logic based on step type
        step_type = self._get_step_type(step_id)

        cost_map = {
            "llm_call": 100,          # ~$0.01 per call
            "generate_image": 500,    # ~$0.05 per image
            "generate_video": 2000,   # ~$0.20 per video
            "combine_videos": 1000,   # ~$0.10 for stitching
        }

        return cost_map.get(step_type, 50)  # Default 50 credits
```

---

### Step 3: Write Tests

**Create `python-backend/tests/test_budget_enforcement.py`** (reference `claude-plan-tdd.md` for full tests):

```python
import pytest
from app.services.budget import (
    check_budget_before_step,
    finalize_budget_after_step,
    rollback_budget_reservation,
    check_budget_alerts,
    BudgetExceededError
)
from app.models.user import User
from app.models.workflow import WorkflowExecution


class TestBudgetEnforcement:
    @pytest.fixture
    async def user_with_credits(self, db_session):
        """Create user with 1000 credits"""
        user = User(email="test@example.com", credits_available=1000, credits_quota=1000)
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    @pytest.fixture
    async def workflow_execution(self, db_session, user_with_credits):
        """Create workflow execution"""
        execution = WorkflowExecution(
            id="exec-123",
            user_id=user_with_credits.id,
            tenant_id=1,
            template_id=1,
            status="running",
            state_json={},
            budget_reserved_credits=0,
            budget_spent_credits=0
        )
        db_session.add(execution)
        await db_session.commit()
        await db_session.refresh(execution)
        return execution

    @pytest.mark.asyncio
    async def test_budget_check_passes_with_sufficient_credits(
        self, db_session, user_with_credits, workflow_execution
    ):
        """Test budget check passes when credits available"""
        result = await check_budget_before_step(
            db_session,
            user_with_credits.id,
            workflow_execution.id,
            "plan_script",
            500
        )

        assert result is True

        # Verify credits deducted
        await db_session.refresh(user_with_credits)
        assert user_with_credits.credits_available == 500

    @pytest.mark.asyncio
    async def test_budget_check_fails_with_insufficient_credits(
        self, db_session, user_with_credits, workflow_execution
    ):
        """Test budget check fails when insufficient credits"""
        with pytest.raises(BudgetExceededError, match="Insufficient credits"):
            await check_budget_before_step(
                db_session,
                user_with_credits.id,
                workflow_execution.id,
                "expensive_step",
                1500  # More than available
            )

    @pytest.mark.asyncio
    async def test_budget_refund_when_actual_less_than_estimated(
        self, db_session, user_with_credits, workflow_execution
    ):
        """Test refund when actual cost < estimated"""
        # Reserve 500
        await check_budget_before_step(
            db_session, user_with_credits.id, workflow_execution.id, "step", 500
        )

        # Finalize with actual 300
        await finalize_budget_after_step(
            db_session, user_with_credits.id, workflow_execution.id, 500, 300
        )

        # Verify refund
        await db_session.refresh(user_with_credits)
        assert user_with_credits.credits_available == 700  # 1000 - 500 + 200

    @pytest.mark.asyncio
    async def test_budget_alerts_at_thresholds(
        self, db_session, user_with_credits
    ):
        """Test budget alerts triggered at 70%, 90%, 100%"""
        # 70% threshold
        user_with_credits.credits_available = 300  # 70% used
        await db_session.commit()

        alert = await check_budget_alerts(db_session, user_with_credits.id)
        assert alert["threshold"] == 70

        # 90% threshold
        user_with_credits.credits_available = 100  # 90% used
        await db_session.commit()

        alert = await check_budget_alerts(db_session, user_with_credits.id)
        assert alert["threshold"] == 90

        # 100% threshold
        user_with_credits.credits_available = 0  # 100% used
        await db_session.commit()

        alert = await check_budget_alerts(db_session, user_with_credits.id)
        assert alert["threshold"] == 100

    # More tests in claude-plan-tdd.md
```

---

## Verification

### Manual Testing

```python
# Test in Python shell
from app.services.budget import check_budget_before_step
from app.core.database import get_db_session
import asyncio

async def test():
    async with get_db_session() as session:
        try:
            await check_budget_before_step(
                session,
                user_id=1,
                execution_id="test-exec",
                step_id="test_step",
                estimated_cost_credits=500
            )
            print("Budget check passed!")
        except BudgetExceededError as e:
            print(f"Budget exceeded: {e}")

asyncio.run(test())
```

---

## Dependencies

**Required Before**: None
**Enables**: Cost-controlled workflow execution

---

## Completion Checklist

- [ ] Budget service implemented
- [ ] Two-phase credit protocol works
- [ ] Pessimistic locking prevents race conditions
- [ ] Budget alerts at 70%, 90%, 100%
- [ ] Redis events emitted for notifications
- [ ] All unit tests pass
- [ ] Integration with orchestrator complete
- [ ] Manual verification successful

**Estimated Completion**: 3-4 days
