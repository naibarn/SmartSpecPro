"""
Dashboard Service
Provides aggregated data for user dashboard
"""

from decimal import Decimal
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
import structlog

from app.models.user import User
from app.models.payment import PaymentTransaction
from app.models.credit import CreditTransaction
from app.core.credits import credits_to_usd

logger = structlog.get_logger()


class DashboardService:
    """
    Dashboard Service
    
    Provides aggregated statistics and data for user dashboard
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_summary(self, user: User) -> Dict[str, Any]:
        """
        Get dashboard summary
        
        Args:
            user: User object
        
        Returns:
            Dashboard summary with balance and statistics
        """
        logger.info("getting_dashboard_summary", user_id=user.id)
        
        # Get balance
        balance = {
            "credits": user.credits_balance,
            "usd": float(credits_to_usd(user.credits_balance)),
            "last_updated": user.updated_at.isoformat() if user.updated_at else None
        }
        
        # Get statistics
        stats = await self._get_statistics(user)
        
        return {
            "balance": balance,
            "stats": stats
        }
    
    async def _get_statistics(self, user: User) -> Dict[str, Any]:
        """Get user statistics"""
        
        # Total spent (completed payments)
        total_spent_stmt = select(func.sum(PaymentTransaction.amount_usd)).where(
            and_(
                PaymentTransaction.user_id == user.id,
                PaymentTransaction.status == 'completed'
            )
        )
        total_spent_result = await self.db.execute(total_spent_stmt)
        total_spent = total_spent_result.scalar() or Decimal('0')
        
        # Total credits purchased
        total_credits_purchased_stmt = select(func.sum(PaymentTransaction.credits_amount)).where(
            and_(
                PaymentTransaction.user_id == user.id,
                PaymentTransaction.status == 'completed'
            )
        )
        total_credits_purchased_result = await self.db.execute(total_credits_purchased_stmt)
        total_credits_purchased = total_credits_purchased_result.scalar() or 0
        
        # Total credits used (negative transactions)
        total_credits_used_stmt = select(func.sum(CreditTransaction.amount)).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0
            )
        )
        total_credits_used_result = await self.db.execute(total_credits_used_stmt)
        total_credits_used = abs(total_credits_used_result.scalar() or 0)
        
        # Total requests (count of negative transactions)
        total_requests_stmt = select(func.count(CreditTransaction.id)).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0
            )
        )
        total_requests_result = await self.db.execute(total_requests_stmt)
        total_requests = total_requests_result.scalar() or 0
        
        # Average cost per request
        avg_cost_per_request = float(credits_to_usd(total_credits_used / total_requests)) if total_requests > 0 else 0
        
        # Current month spending
        current_month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        current_month_spending_stmt = select(func.sum(PaymentTransaction.amount_usd)).where(
            and_(
                PaymentTransaction.user_id == user.id,
                PaymentTransaction.status == 'completed',
                PaymentTransaction.created_at >= current_month_start
            )
        )
        current_month_spending_result = await self.db.execute(current_month_spending_stmt)
        current_month_spending = current_month_spending_result.scalar() or Decimal('0')
        
        # Last 30 days usage
        last_30_days = datetime.utcnow() - timedelta(days=30)
        last_30_days_usage_stmt = select(func.sum(CreditTransaction.amount)).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0,
                CreditTransaction.created_at >= last_30_days
            )
        )
        last_30_days_usage_result = await self.db.execute(last_30_days_usage_stmt)
        last_30_days_usage = abs(last_30_days_usage_result.scalar() or 0)
        
        return {
            "total_spent_usd": float(total_spent),
            "total_credits_purchased": total_credits_purchased,
            "total_credits_used": total_credits_used,
            "total_requests": total_requests,
            "avg_cost_per_request": round(avg_cost_per_request, 4),
            "current_month_spending": float(current_month_spending),
            "last_30_days_usage": last_30_days_usage
        }
    
    async def get_usage_over_time(self, user: User, days: int = 30) -> Dict[str, Any]:
        """
        Get usage over time
        
        Args:
            user: User object
            days: Number of days to look back
        
        Returns:
            Daily usage data
        """
        logger.info("getting_usage_over_time", user_id=user.id, days=days)
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get daily usage (negative transactions)
        stmt = select(
            func.date(CreditTransaction.created_at).label('date'),
            func.sum(CreditTransaction.amount).label('credits_used'),
            func.count(CreditTransaction.id).label('requests')
        ).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0,
                CreditTransaction.created_at >= start_date
            )
        ).group_by(
            func.date(CreditTransaction.created_at)
        ).order_by(
            func.date(CreditTransaction.created_at)
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        daily_usage = []
        for row in rows:
            credits_used = abs(row.credits_used)
            cost_usd = float(credits_to_usd(credits_used))
            
            daily_usage.append({
                "date": row.date.isoformat() if isinstance(row.date, datetime) else str(row.date),
                "credits_used": credits_used,
                "requests": row.requests,
                "cost_usd": round(cost_usd, 2)
            })
        
        return {
            "daily_usage": daily_usage,
            "days": days,
            "start_date": start_date.isoformat(),
            "end_date": datetime.utcnow().isoformat()
        }
    
    async def get_llm_usage_breakdown(self, user: User, days: int = 30) -> Dict[str, Any]:
        """
        Get LLM usage breakdown
        
        Args:
            user: User object
            days: Number of days to look back
        
        Returns:
            Usage breakdown by model, provider, and task type
        """
        logger.info("getting_llm_usage_breakdown", user_id=user.id, days=days)
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get total credits used for percentage calculation
        total_credits_stmt = select(func.sum(CreditTransaction.amount)).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0,
                CreditTransaction.created_at >= start_date
            )
        )
        total_credits_result = await self.db.execute(total_credits_stmt)
        total_credits = abs(total_credits_result.scalar() or 0)
        
        # Get LLM usage from credit transactions metadata
        transactions_stmt = select(CreditTransaction).where(
            and_(
                CreditTransaction.user_id == user.id,
                CreditTransaction.amount < 0,
                CreditTransaction.created_at >= start_date,
                CreditTransaction.type == 'usage'
            )
        ).order_by(CreditTransaction.created_at.desc())
        
        transactions_result = await self.db.execute(transactions_stmt)
        transactions = transactions_result.scalars().all()
        
        # Aggregate by model, provider, task_type
        by_model = {}
        by_provider = {}
        by_task_type = {}
        
        for tx in transactions:
            metadata = tx.metadata or {}
            
            # By model
            model = metadata.get('model', 'unknown')
            if model not in by_model:
                by_model[model] = {'credits': 0, 'requests': 0}
            by_model[model]['credits'] += abs(tx.amount)
            by_model[model]['requests'] += 1
            
            # By provider
            provider = metadata.get('provider', 'unknown')
            if provider not in by_provider:
                by_provider[provider] = {'credits': 0, 'requests': 0}
            by_provider[provider]['credits'] += abs(tx.amount)
            by_provider[provider]['requests'] += 1
            
            # By task type
            task_type = metadata.get('task_type', 'unknown')
            if task_type not in by_task_type:
                by_task_type[task_type] = {'credits': 0, 'requests': 0}
            by_task_type[task_type]['credits'] += abs(tx.amount)
            by_task_type[task_type]['requests'] += 1
        
        # Convert to lists with percentages
        def format_breakdown(data_dict, total):
            result = []
            for name, stats in sorted(data_dict.items(), key=lambda x: x[1]['credits'], reverse=True):
                percentage = (stats['credits'] / total * 100) if total > 0 else 0
                result.append({
                    'name': name,
                    'credits': stats['credits'],
                    'requests': stats['requests'],
                    'percentage': round(percentage, 2)
                })
            return result
        
        return {
            "by_model": format_breakdown(by_model, total_credits),
            "by_provider": format_breakdown(by_provider, total_credits),
            "by_task_type": format_breakdown(by_task_type, total_credits),
            "total_credits": total_credits,
            "period_days": days
        }
    
    async def get_recent_transactions(
        self,
        user: User,
        limit: int = 20,
        transaction_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get recent transactions (combined payments and credits)
        
        Args:
            user: User object
            limit: Number of transactions to return
            transaction_type: Filter by type ('payment', 'usage', or None for all)
        
        Returns:
            Combined transaction list
        """
        logger.info(
            "getting_recent_transactions",
            user_id=user.id,
            limit=limit,
            type=transaction_type
        )
        
        transactions = []
        
        # Get payment transactions
        if transaction_type in (None, 'payment'):
            payment_stmt = select(PaymentTransaction).where(
                PaymentTransaction.user_id == user.id
            ).order_by(
                desc(PaymentTransaction.created_at)
            ).limit(limit)
            
            payment_result = await self.db.execute(payment_stmt)
            payments = payment_result.scalars().all()
            
            for payment in payments:
                transactions.append({
                    "id": f"payment_{payment.id}",
                    "type": "payment",
                    "date": payment.created_at.isoformat() if payment.created_at else None,
                    "amount_usd": float(payment.amount_usd) if payment.amount_usd else 0,
                    "credits": payment.credits_amount,
                    "status": payment.status,
                    "description": f"Credit top-up - ${payment.amount_usd}"
                })
        
        # Get credit transactions (usage)
        if transaction_type in (None, 'usage'):
            credit_stmt = select(CreditTransaction).where(
                and_(
                    CreditTransaction.user_id == user.id,
                    CreditTransaction.amount < 0  # Only usage (negative)
                )
            ).order_by(
                desc(CreditTransaction.created_at)
            ).limit(limit)
            
            credit_result = await self.db.execute(credit_stmt)
            credits = credit_result.scalars().all()
            
            for credit in credits:
                credits_used = abs(credit.amount)
                cost_usd = float(credits_to_usd(credits_used))
                
                transactions.append({
                    "id": f"usage_{credit.id}",
                    "type": "usage",
                    "date": credit.created_at.isoformat() if credit.created_at else None,
                    "amount_usd": -cost_usd,
                    "credits": credit.amount,
                    "status": "completed",
                    "description": credit.description or "LLM usage"
                })
        
        # Sort by date (most recent first)
        transactions.sort(key=lambda x: x['date'] or '', reverse=True)
        
        # Limit results
        transactions = transactions[:limit]
        
        return {
            "transactions": transactions,
            "total": len(transactions),
            "limit": limit,
            "type": transaction_type
        }
    
    async def get_provider_statistics(self, user: User, days: int = 30) -> Dict[str, Any]:
        """
        Get provider statistics
        
        Args:
            user: User object
            days: Number of days to look back
        
        Returns:
            Provider statistics
        """
        logger.info("getting_provider_statistics", user_id=user.id, days=days)
        
        # Get LLM usage breakdown (already implemented)
        breakdown = await self.get_llm_usage_breakdown(user, days)
        
        # Extract provider stats from breakdown
        providers = breakdown.get('by_provider', [])
        
        # Add additional metrics
        for provider in providers:
            # Calculate average cost per request
            if provider['requests'] > 0:
                provider['avg_credits_per_request'] = round(
                    provider['credits'] / provider['requests'], 2
                )
            else:
                provider['avg_credits_per_request'] = 0
            
            # Convert credits to USD
            from app.core.credits import credits_to_usd
            provider['cost_usd'] = float(credits_to_usd(provider['credits']))
        
        return {
            "providers": providers,
            "total_credits": breakdown.get('total_credits', 0),
            "period_days": days
        }
