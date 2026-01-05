"""
Credit Service
Handles credit balance, transactions, and deductions

Credit System:
- 1 USD = 1,000 credits
- Markup: 15% (SmartSpec's revenue)
- Top-up: User pays $100 → Gets 85,000 credits
- Usage: LLM costs $0.10 → Deduct 100 credits
"""

from decimal import Decimal
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.credit import CreditTransaction, SystemConfig
from app.core.credits import (
    usd_to_credits,
    credits_to_usd,
    calculate_credits_from_payment,
    calculate_payment_from_credits,
    DEFAULT_MARKUP_PERCENT
)


class InsufficientCreditsError(Exception):
    """Raised when user has insufficient credits"""
    
    def __init__(self, required: int, available: int):
        self.required = required
        self.available = available
        super().__init__(
            f"Insufficient credits. Required: {required:,} credits (${credits_to_usd(required):.2f}), "
            f"Available: {available:,} credits (${credits_to_usd(available):.2f})"
        )


class CreditService:
    """Service for managing user credits"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_balance(self, user_id: str) -> int:
        """
        Get user credit balance in credits
        
        Args:
            user_id: User ID
        
        Returns:
            Credit balance in credits (integer)
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        return user.credits_balance
    
    async def get_balance_usd(self, user_id: str) -> Decimal:
        """
        Get user credit balance in USD
        
        Args:
            user_id: User ID
        
        Returns:
            Credit balance in USD
        """
        credits = await self.get_balance(user_id)
        return credits_to_usd(credits)
    
    async def get_markup_percent(self) -> Decimal:
        """
        Get current markup percentage from system config
        
        Returns:
            Markup percentage (default: 15)
        """
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key == "credit_markup_percent")
        )
        config = result.scalar_one_or_none()
        
        if config:
            return Decimal(config.value)
        
        return DEFAULT_MARKUP_PERCENT
    
    async def set_markup_percent(self, percent: Decimal) -> None:
        """
        Set markup percentage (admin only)
        
        Args:
            percent: Markup percentage
        """
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key == "credit_markup_percent")
        )
        config = result.scalar_one_or_none()
        
        if config:
            config.value = str(percent)
            config.description = f"Markup percentage for credit top-ups (SmartSpec revenue)"
        else:
            config = SystemConfig(
                key="credit_markup_percent",
                value=str(percent),
                description="Markup percentage for credit top-ups (SmartSpec revenue)"
            )
            self.db.add(config)
        
        await self.db.commit()
    
    async def check_sufficient_credits(
        self,
        user_id: str,
        estimated_cost_usd: Decimal
    ) -> bool:
        """
        Check if user has sufficient credits for estimated LLM cost
        
        Args:
            user_id: User ID
            estimated_cost_usd: Estimated LLM cost in USD
        
        Returns:
            True if sufficient credits, False otherwise
        """
        balance = await self.get_balance(user_id)
        required_credits = usd_to_credits(estimated_cost_usd)
        
        return balance >= required_credits
    
    async def deduct_credits(
        self,
        user_id: str,
        llm_cost_usd: Decimal,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> CreditTransaction:
        """
        Deduct credits from user account for LLM usage
        
        Deducts actual LLM cost only (no markup).
        Formula: credits_to_deduct = llm_cost_usd * 1000
        
        Example:
            LLM cost: $0.10 → Deduct 100 credits
        
        Args:
            user_id: User ID
            llm_cost_usd: LLM cost in USD (actual provider cost)
            description: Transaction description
            metadata: Additional metadata
        
        Returns:
            Credit transaction record
        
        Raises:
            ValueError: If user not found
            InsufficientCreditsError: If insufficient credits
        """
        # R2.1: Lock user row to prevent race conditions
        result = await self.db.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        # Convert USD to credits (no markup)
        credits_to_deduct = usd_to_credits(llm_cost_usd)
        
        # Check sufficient balance
        if user.credits_balance < credits_to_deduct:
            raise InsufficientCreditsError(
                required=credits_to_deduct,
                available=user.credits_balance
            )
        
        # Deduct credits with transaction rollback
        try:
            balance_before = user.credits_balance
            user.credits_balance -= credits_to_deduct
            balance_after = user.credits_balance
            
            # Add cost info to metadata
            if metadata is None:
                metadata = {}
            metadata["llm_cost_usd"] = float(llm_cost_usd)
            metadata["credits_deducted"] = credits_to_deduct
            
            # Create transaction record
            transaction = CreditTransaction(
                user_id=user_id,
                type="deduction",
                amount=credits_to_deduct,
                description=description,
                balance_before=balance_before,
                balance_after=balance_after,
                metadata=metadata
            )
            
            self.db.add(transaction)
            await self.db.commit()
            await self.db.refresh(transaction)
            
            return transaction
        
        except Exception as e:
            # Rollback transaction on error
            await self.db.rollback()
            raise
    
    async def topup_credits(
        self,
        user_id: str,
        payment_usd: Decimal,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> CreditTransaction:
        """
        Top up credits with markup deducted
        
        Business logic:
        - User pays $100 (including markup)
        - Markup is 15% → $15 goes to SmartSpec
        - User gets credits worth $85 → 85,000 credits
        
        Formula:
            actual_value = payment / (1 + markup/100)
            credits = actual_value * 1000
        
        Example:
            Payment: $100, Markup: 15%
            → Actual value: $85
            → Credits: 85,000
        
        Args:
            user_id: User ID
            payment_usd: Payment amount in USD
            description: Transaction description
            metadata: Additional metadata
        
        Returns:
            Credit transaction record
        
        Raises:
            ValueError: If user not found
        """
        # Calculate credits from payment (with markup deducted)
        markup_percent = await self.get_markup_percent()
        credits_to_add = calculate_credits_from_payment(payment_usd, markup_percent)
        
        # Calculate actual value and markup amount
        actual_value_usd = credits_to_usd(credits_to_add)
        markup_amount_usd = payment_usd - actual_value_usd
        
        # Add payment info to metadata
        if metadata is None:
            metadata = {}
        metadata["payment_usd"] = float(payment_usd)
        metadata["markup_percent"] = float(markup_percent)
        metadata["markup_amount_usd"] = float(markup_amount_usd)
        metadata["actual_value_usd"] = float(actual_value_usd)
        metadata["credits_received"] = credits_to_add
        
        return await self.add_credits(
            user_id=user_id,
            amount=credits_to_add,
            description=description,
            transaction_type="topup",
            metadata=metadata
        )
    
    async def add_credits(
        self,
        user_id: str,
        amount: int,
        description: str,
        transaction_type: str = "adjustment",
        metadata: Optional[Dict[str, Any]] = None
    ) -> CreditTransaction:
        """
        Add credits to user account (direct, no markup)
        
        For refunds and adjustments. Use topup_credits() for payments.
        
        Args:
            user_id: User ID
            amount: Amount to add in credits
            description: Transaction description
            transaction_type: Transaction type (topup, refund, adjustment)
            metadata: Additional metadata
        
        Returns:
            Credit transaction record
        
        Raises:
            ValueError: If user not found
        """
        # R2.1: Lock user row to prevent race conditions
        result = await self.db.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError(f"User not found: {user_id}")
        
        # Add credits with transaction rollback
        try:
            balance_before = user.credits_balance
            user.credits_balance += amount
            balance_after = user.credits_balance
            
            # Create transaction record
            transaction = CreditTransaction(
                user_id=user_id,
                type=transaction_type,
                amount=amount,
                description=description,
                balance_before=balance_before,
                balance_after=balance_after,
                metadata=metadata or {}
            )
            
            self.db.add(transaction)
            await self.db.commit()
            await self.db.refresh(transaction)
            
            return transaction
        
        except Exception as e:
            # Rollback transaction on error
            await self.db.rollback()
            raise
    
    async def get_transactions(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[CreditTransaction]:
        """
        Get user credit transactions
        
        Args:
            user_id: User ID
            limit: Maximum number of transactions
            offset: Offset for pagination
        
        Returns:
            List of credit transactions
        """
        result = await self.db.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        
        return list(result.scalars().all())
    
    async def get_transaction_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get transaction statistics for user
        
        Args:
            user_id: User ID
        
        Returns:
            Transaction statistics
        """
        # Total credits added
        result_added = await self.db.execute(
            select(func.sum(CreditTransaction.amount))
            .where(
                CreditTransaction.user_id == user_id,
                CreditTransaction.type.in_(["topup", "refund", "adjustment"])
            )
        )
        total_added = result_added.scalar() or 0
        
        # Total credits deducted
        result_deducted = await self.db.execute(
            select(func.sum(CreditTransaction.amount))
            .where(
                CreditTransaction.user_id == user_id,
                CreditTransaction.type == "deduction"
            )
        )
        total_deducted = result_deducted.scalar() or 0
        
        # Transaction count
        result_count = await self.db.execute(
            select(func.count(CreditTransaction.id))
            .where(CreditTransaction.user_id == user_id)
        )
        transaction_count = result_count.scalar() or 0
        
        # Current balance
        balance_credits = await self.get_balance(user_id)
        balance_usd = credits_to_usd(balance_credits)
        
        return {
            "total_added_credits": total_added,
            "total_added_usd": float(credits_to_usd(total_added)),
            "total_deducted_credits": total_deducted,
            "total_deducted_usd": float(credits_to_usd(total_deducted)),
            "transaction_count": transaction_count,
            "current_balance_credits": balance_credits,
            "current_balance_usd": float(balance_usd)
        }
