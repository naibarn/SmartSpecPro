"""
SmartSpec Pro - Credits Repository
Database operations for credits and usage tracking.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

import structlog
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credits import (
    CreditsBalance,
    CreditTransaction,
    UsageRecord,
    SubscriptionPlan,
    TransactionType,
    UsageType,
    DEFAULT_PLANS,
)

logger = structlog.get_logger()


class CreditsRepository:
    """
    Repository for credits database operations.
    
    Handles all CRUD operations for credits, transactions, and usage records.
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    # =========================================================================
    # CREDITS BALANCE
    # =========================================================================
    
    async def get_or_create_balance(self, user_id: UUID) -> CreditsBalance:
        """Get or create credits balance for a user."""
        result = await self.session.execute(
            select(CreditsBalance).where(CreditsBalance.user_id == user_id)
        )
        balance = result.scalar_one_or_none()
        
        if not balance:
            # Get default plan
            plan = await self.get_plan_by_name("free")
            
            balance = CreditsBalance(
                user_id=user_id,
                total_credits=plan.bonus_credits if plan else 5.0,
                subscription_tier="free",
                monthly_allowance=plan.monthly_credits if plan else 10.0,
            )
            self.session.add(balance)
            await self.session.flush()
            
            logger.info("Created credits balance", user_id=str(user_id))
        
        return balance
    
    async def get_balance(self, user_id: UUID) -> Optional[CreditsBalance]:
        """Get credits balance for a user."""
        result = await self.session.execute(
            select(CreditsBalance).where(CreditsBalance.user_id == user_id)
        )
        return result.scalar_one_or_none()
    
    async def update_balance(
        self,
        user_id: UUID,
        total_credits: Optional[float] = None,
        used_credits: Optional[float] = None,
        reserved_credits: Optional[float] = None,
        subscription_tier: Optional[str] = None,
    ) -> Optional[CreditsBalance]:
        """Update credits balance."""
        balance = await self.get_or_create_balance(user_id)
        
        if total_credits is not None:
            balance.total_credits = total_credits
        if used_credits is not None:
            balance.used_credits = used_credits
        if reserved_credits is not None:
            balance.reserved_credits = reserved_credits
        if subscription_tier is not None:
            balance.subscription_tier = subscription_tier
        
        balance.updated_at = datetime.utcnow()
        await self.session.flush()
        
        return balance
    
    async def reserve_credits(
        self,
        user_id: UUID,
        amount: float,
        task_id: str,
    ) -> bool:
        """Reserve credits for a task."""
        balance = await self.get_or_create_balance(user_id)
        
        if balance.available_credits < amount:
            return False
        
        balance.reserved_credits += amount
        balance.updated_at = datetime.utcnow()
        await self.session.flush()
        
        logger.info(
            "Credits reserved",
            user_id=str(user_id),
            amount=amount,
            task_id=task_id,
        )
        return True
    
    async def commit_credits(
        self,
        user_id: UUID,
        amount: float,
        task_id: str,
        description: Optional[str] = None,
    ) -> CreditTransaction:
        """Commit reserved credits (task completed)."""
        balance = await self.get_or_create_balance(user_id)
        
        balance_before = balance.total_credits - balance.used_credits
        balance.commit(amount)
        balance_after = balance.total_credits - balance.used_credits
        
        # Create transaction record
        transaction = CreditTransaction(
            balance_id=balance.id,
            transaction_type=TransactionType.USAGE,
            amount=-amount,
            balance_before=balance_before,
            balance_after=balance_after,
            reference_type="generation_task",
            reference_id=task_id,
            description=description or f"Generation task {task_id}",
        )
        self.session.add(transaction)
        await self.session.flush()
        
        logger.info(
            "Credits committed",
            user_id=str(user_id),
            amount=amount,
            task_id=task_id,
        )
        return transaction
    
    async def release_credits(
        self,
        user_id: UUID,
        amount: float,
        task_id: str,
    ):
        """Release reserved credits (task cancelled/failed)."""
        balance = await self.get_or_create_balance(user_id)
        balance.release(amount)
        balance.updated_at = datetime.utcnow()
        await self.session.flush()
        
        logger.info(
            "Credits released",
            user_id=str(user_id),
            amount=amount,
            task_id=task_id,
        )
    
    async def add_credits(
        self,
        user_id: UUID,
        amount: float,
        transaction_type: TransactionType,
        reference_type: Optional[str] = None,
        reference_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> CreditTransaction:
        """Add credits to user balance."""
        balance = await self.get_or_create_balance(user_id)
        
        balance_before = balance.total_credits - balance.used_credits
        balance.add(amount)
        balance_after = balance.total_credits - balance.used_credits
        
        # Create transaction record
        transaction = CreditTransaction(
            balance_id=balance.id,
            transaction_type=transaction_type,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
        )
        self.session.add(transaction)
        await self.session.flush()
        
        logger.info(
            "Credits added",
            user_id=str(user_id),
            amount=amount,
            type=transaction_type.value,
        )
        return transaction
    
    # =========================================================================
    # TRANSACTIONS
    # =========================================================================
    
    async def get_transactions(
        self,
        user_id: UUID,
        transaction_type: Optional[TransactionType] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[CreditTransaction]:
        """Get transaction history for a user."""
        balance = await self.get_balance(user_id)
        if not balance:
            return []
        
        query = select(CreditTransaction).where(
            CreditTransaction.balance_id == balance.id
        )
        
        if transaction_type:
            query = query.where(CreditTransaction.transaction_type == transaction_type)
        
        query = query.order_by(desc(CreditTransaction.created_at))
        query = query.limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_transaction_summary(
        self,
        user_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get transaction summary for a user."""
        balance = await self.get_balance(user_id)
        if not balance:
            return {}
        
        query = select(
            CreditTransaction.transaction_type,
            func.sum(CreditTransaction.amount).label("total"),
            func.count(CreditTransaction.id).label("count"),
        ).where(CreditTransaction.balance_id == balance.id)
        
        if start_date:
            query = query.where(CreditTransaction.created_at >= start_date)
        if end_date:
            query = query.where(CreditTransaction.created_at <= end_date)
        
        query = query.group_by(CreditTransaction.transaction_type)
        
        result = await self.session.execute(query)
        
        summary = {}
        for row in result:
            summary[row.transaction_type.value] = {
                "total": row.total,
                "count": row.count,
            }
        
        return summary
    
    # =========================================================================
    # USAGE RECORDS
    # =========================================================================
    
    async def create_usage_record(
        self,
        user_id: UUID,
        usage_type: UsageType,
        credits_used: float,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        model_id: Optional[str] = None,
        api_key_id: Optional[UUID] = None,
        request_metadata: Optional[Dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> UsageRecord:
        """Create a usage record."""
        record = UsageRecord(
            user_id=user_id,
            api_key_id=api_key_id,
            usage_type=usage_type,
            credits_used=credits_used,
            resource_type=resource_type,
            resource_id=resource_id,
            model_id=model_id,
            request_metadata=request_metadata or {},
            ip_address=ip_address,
            user_agent=user_agent,
            status="pending",
        )
        self.session.add(record)
        await self.session.flush()
        
        return record
    
    async def complete_usage_record(
        self,
        record_id: UUID,
        response_metadata: Optional[Dict] = None,
        status: str = "completed",
    ) -> Optional[UsageRecord]:
        """Mark a usage record as completed."""
        result = await self.session.execute(
            select(UsageRecord).where(UsageRecord.id == record_id)
        )
        record = result.scalar_one_or_none()
        
        if record:
            record.status = status
            record.completed_at = datetime.utcnow()
            if response_metadata:
                record.response_metadata = response_metadata
            await self.session.flush()
        
        return record
    
    async def get_usage_records(
        self,
        user_id: UUID,
        usage_type: Optional[UsageType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[UsageRecord]:
        """Get usage records for a user."""
        query = select(UsageRecord).where(UsageRecord.user_id == user_id)
        
        if usage_type:
            query = query.where(UsageRecord.usage_type == usage_type)
        if start_date:
            query = query.where(UsageRecord.started_at >= start_date)
        if end_date:
            query = query.where(UsageRecord.started_at <= end_date)
        
        query = query.order_by(desc(UsageRecord.started_at))
        query = query.limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_usage_summary(
        self,
        user_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get usage summary for a user."""
        query = select(
            UsageRecord.usage_type,
            func.sum(UsageRecord.credits_used).label("total_credits"),
            func.count(UsageRecord.id).label("count"),
        ).where(
            and_(
                UsageRecord.user_id == user_id,
                UsageRecord.status == "completed",
            )
        )
        
        if start_date:
            query = query.where(UsageRecord.started_at >= start_date)
        if end_date:
            query = query.where(UsageRecord.started_at <= end_date)
        
        query = query.group_by(UsageRecord.usage_type)
        
        result = await self.session.execute(query)
        
        summary = {}
        for row in result:
            summary[row.usage_type.value] = {
                "total_credits": row.total_credits,
                "count": row.count,
            }
        
        return summary
    
    async def get_model_usage_stats(
        self,
        user_id: UUID,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get usage statistics by model."""
        start_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(
            UsageRecord.model_id,
            func.sum(UsageRecord.credits_used).label("total_credits"),
            func.count(UsageRecord.id).label("count"),
        ).where(
            and_(
                UsageRecord.user_id == user_id,
                UsageRecord.status == "completed",
                UsageRecord.started_at >= start_date,
                UsageRecord.model_id.isnot(None),
            )
        ).group_by(UsageRecord.model_id).order_by(desc("total_credits"))
        
        result = await self.session.execute(query)
        
        return [
            {
                "model_id": row.model_id,
                "total_credits": row.total_credits,
                "count": row.count,
            }
            for row in result
        ]
    
    # =========================================================================
    # SUBSCRIPTION PLANS
    # =========================================================================
    
    async def get_plan_by_name(self, name: str) -> Optional[SubscriptionPlan]:
        """Get subscription plan by name."""
        result = await self.session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.name == name)
        )
        return result.scalar_one_or_none()
    
    async def get_active_plans(self) -> List[SubscriptionPlan]:
        """Get all active subscription plans."""
        result = await self.session.execute(
            select(SubscriptionPlan).where(
                and_(
                    SubscriptionPlan.is_active == True,
                    SubscriptionPlan.is_public == True,
                )
            ).order_by(SubscriptionPlan.price_monthly)
        )
        return list(result.scalars().all())
    
    async def create_default_plans(self):
        """Create default subscription plans if they don't exist."""
        for plan_data in DEFAULT_PLANS:
            existing = await self.get_plan_by_name(plan_data["name"])
            if not existing:
                plan = SubscriptionPlan(**plan_data)
                self.session.add(plan)
        
        await self.session.flush()
        logger.info("Default subscription plans created")
    
    # =========================================================================
    # ANALYTICS
    # =========================================================================
    
    async def get_daily_usage(
        self,
        user_id: UUID,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Get daily usage for the past N days."""
        start_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(
            func.date(UsageRecord.started_at).label("date"),
            func.sum(UsageRecord.credits_used).label("credits"),
            func.count(UsageRecord.id).label("count"),
        ).where(
            and_(
                UsageRecord.user_id == user_id,
                UsageRecord.status == "completed",
                UsageRecord.started_at >= start_date,
            )
        ).group_by(func.date(UsageRecord.started_at)).order_by("date")
        
        result = await self.session.execute(query)
        
        return [
            {
                "date": str(row.date),
                "credits": row.credits,
                "count": row.count,
            }
            for row in result
        ]


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_credits_repository(session: AsyncSession) -> CreditsRepository:
    """Get credits repository instance."""
    return CreditsRepository(session)
