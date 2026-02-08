"""
Budget Enforcement Service

Implements hard budget enforcement with two-phase credit protocol.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import structlog

logger = structlog.get_logger(__name__)


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
    # Import here to avoid circular dependency
    from app.models.user import User

    # Fetch user's current credits with lock
    result = await session.execute(
        select(User.credits)
        .where(User.id == user_id)
        .with_for_update()
    )
    available_credits = result.scalar_one_or_none()

    if available_credits is None:
        raise ValueError(f"User {user_id} not found")

    # Check if sufficient credits
    if available_credits < estimated_cost_credits:
        logger.warning(
            "budget_exceeded",
            user_id=user_id,
            required=estimated_cost_credits,
            available=available_credits
        )

        raise BudgetExceededError(
            f"Insufficient credits. Step '{step_id}' requires {estimated_cost_credits} credits, "
            f"but only {available_credits} available."
        )

    # Reserve budget (deduct credits)
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits - estimated_cost_credits)
    )

    await session.commit()

    logger.info(
        "budget_reserved",
        user_id=user_id,
        execution_id=execution_id,
        step_id=step_id,
        credits=estimated_cost_credits
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

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        estimated_cost: Initially reserved credits
        actual_cost: Actual credits used
    """
    from app.models.user import User

    difference = actual_cost - estimated_cost

    if difference != 0:
        # Adjust user's credit balance
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(credits=User.credits - difference)
        )

        log_msg = "credits_refunded" if difference < 0 else "extra_credits_deducted"
        logger.info(
            log_msg,
            user_id=user_id,
            amount=abs(difference)
        )

    await session.commit()


async def rollback_budget_reservation(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    reserved_credits: int
):
    """
    Rollback budget reservation if step fails.

    Args:
        session: Database session
        user_id: User ID
        execution_id: Workflow execution ID
        reserved_credits: Amount to rollback
    """
    from app.models.user import User

    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits=User.credits + reserved_credits)
    )

    await session.commit()

    logger.info(
        "budget_rolled_back",
        user_id=user_id,
        credits=reserved_credits
    )
