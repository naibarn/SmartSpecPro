"""
LLM Monitoring Service
Track LLM usage, costs, performance, and provider health
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
import structlog

from app.models.credit import CreditTransaction
from app.models.user import User

logger = structlog.get_logger()


class LLMMonitoringService:
    """
    Service for monitoring LLM usage and performance
    
    Features:
    - Usage tracking (requests, tokens, costs)
    - Provider health monitoring
    - Performance metrics (latency, throughput)
    - Cost analysis
    - User analytics
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def log_llm_request(
        self,
        user_id: int,
        provider: str,
        model: str,
        model_requested: Optional[str],
        task_type: str,
        budget_priority: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        cost_usd: Decimal,
        credits_used: int,
        latency_ms: float,
        success: bool,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Log LLM request for monitoring
        
        Args:
            user_id: User ID
            provider: Provider used (e.g., "openrouter", "openai")
            model: Actual model used
            model_requested: Model requested (may differ from actual)
            task_type: Task type
            budget_priority: Budget priority
            prompt_tokens: Prompt tokens
            completion_tokens: Completion tokens
            total_tokens: Total tokens
            cost_usd: Cost in USD
            credits_used: Credits deducted
            latency_ms: Latency in milliseconds
            success: Whether request succeeded
            error: Error message if failed
            metadata: Additional metadata
        """
        logger.info(
            "llm_request_logged",
            user_id=user_id,
            provider=provider,
            model=model,
            model_requested=model_requested,
            task_type=task_type,
            budget_priority=budget_priority,
            tokens=total_tokens,
            cost_usd=float(cost_usd),
            credits_used=credits_used,
            latency_ms=latency_ms,
            success=success,
            error=error
        )
        
        # Store in metadata for future analytics
        # (Could be stored in a separate analytics table in production)
    
    async def get_user_usage_stats(
        self,
        user_id: int,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get user usage statistics
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            Usage statistics
        """
        since = datetime.utcnow() - timedelta(days=days)
        
        # Query credit transactions for LLM usage
        stmt = select(
            func.count(CreditTransaction.id).label("total_requests"),
            func.sum(CreditTransaction.amount).label("total_credits"),
            func.avg(CreditTransaction.amount).label("avg_credits_per_request")
        ).where(
            and_(
                CreditTransaction.user_id == user_id,
                CreditTransaction.transaction_type == "deduction",
                CreditTransaction.created_at >= since
            )
        )
        
        result = await self.db.execute(stmt)
        row = result.first()
        
        if not row or row.total_requests == 0:
            return {
                "period_days": days,
                "total_requests": 0,
                "total_credits": 0,
                "total_usd": 0.0,
                "avg_credits_per_request": 0,
                "avg_usd_per_request": 0.0
            }
        
        from app.core.credits import credits_to_usd
        
        total_credits = int(row.total_credits or 0)
        total_usd = credits_to_usd(total_credits)
        avg_credits = int(row.avg_credits_per_request or 0)
        avg_usd = credits_to_usd(avg_credits)
        
        return {
            "period_days": days,
            "total_requests": row.total_requests,
            "total_credits": total_credits,
            "total_usd": float(total_usd),
            "avg_credits_per_request": avg_credits,
            "avg_usd_per_request": float(avg_usd)
        }
    
    async def get_provider_usage_breakdown(
        self,
        user_id: int,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get usage breakdown by provider
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            List of provider usage stats
        """
        since = datetime.utcnow() - timedelta(days=days)
        
        # Query credit transactions with provider metadata
        stmt = select(CreditTransaction).where(
            and_(
                CreditTransaction.user_id == user_id,
                CreditTransaction.transaction_type == "deduction",
                CreditTransaction.created_at >= since
            )
        ).order_by(CreditTransaction.created_at.desc())
        
        result = await self.db.execute(stmt)
        transactions = result.scalars().all()
        
        # Group by provider
        provider_stats: Dict[str, Dict[str, Any]] = {}
        
        for tx in transactions:
            if not tx.metadata or "provider" not in tx.metadata:
                continue
            
            provider = tx.metadata["provider"]
            
            if provider not in provider_stats:
                provider_stats[provider] = {
                    "provider": provider,
                    "requests": 0,
                    "credits": 0,
                    "tokens": 0
                }
            
            provider_stats[provider]["requests"] += 1
            provider_stats[provider]["credits"] += tx.amount
            
            if "tokens" in tx.metadata:
                provider_stats[provider]["tokens"] += tx.metadata["tokens"]
        
        # Convert to list and add USD amounts
        from app.core.credits import credits_to_usd
        
        result_list = []
        for stats in provider_stats.values():
            stats["usd"] = float(credits_to_usd(stats["credits"]))
            result_list.append(stats)
        
        # Sort by credits (descending)
        result_list.sort(key=lambda x: x["credits"], reverse=True)
        
        return result_list
    
    async def get_model_usage_breakdown(
        self,
        user_id: int,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get usage breakdown by model
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            List of model usage stats
        """
        since = datetime.utcnow() - timedelta(days=days)
        
        # Query credit transactions with model metadata
        stmt = select(CreditTransaction).where(
            and_(
                CreditTransaction.user_id == user_id,
                CreditTransaction.transaction_type == "deduction",
                CreditTransaction.created_at >= since
            )
        ).order_by(CreditTransaction.created_at.desc())
        
        result = await self.db.execute(stmt)
        transactions = result.scalars().all()
        
        # Group by model
        model_stats: Dict[str, Dict[str, Any]] = {}
        
        for tx in transactions:
            if not tx.metadata or "model" not in tx.metadata:
                continue
            
            model = tx.metadata["model"]
            
            if model not in model_stats:
                model_stats[model] = {
                    "model": model,
                    "requests": 0,
                    "credits": 0,
                    "tokens": 0
                }
            
            model_stats[model]["requests"] += 1
            model_stats[model]["credits"] += tx.amount
            
            if "tokens" in tx.metadata:
                model_stats[model]["tokens"] += tx.metadata["tokens"]
        
        # Convert to list and add USD amounts
        from app.core.credits import credits_to_usd
        
        result_list = []
        for stats in model_stats.values():
            stats["usd"] = float(credits_to_usd(stats["credits"]))
            result_list.append(stats)
        
        # Sort by credits (descending)
        result_list.sort(key=lambda x: x["credits"], reverse=True)
        
        return result_list
    
    async def get_task_type_breakdown(
        self,
        user_id: int,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get usage breakdown by task type
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            List of task type usage stats
        """
        since = datetime.utcnow() - timedelta(days=days)
        
        # Query credit transactions with task_type metadata
        stmt = select(CreditTransaction).where(
            and_(
                CreditTransaction.user_id == user_id,
                CreditTransaction.transaction_type == "deduction",
                CreditTransaction.created_at >= since
            )
        ).order_by(CreditTransaction.created_at.desc())
        
        result = await self.db.execute(stmt)
        transactions = result.scalars().all()
        
        # Group by task type
        task_stats: Dict[str, Dict[str, Any]] = {}
        
        for tx in transactions:
            if not tx.metadata or "task_type" not in tx.metadata:
                continue
            
            task_type = tx.metadata["task_type"]
            
            if task_type not in task_stats:
                task_stats[task_type] = {
                    "task_type": task_type,
                    "requests": 0,
                    "credits": 0,
                    "tokens": 0
                }
            
            task_stats[task_type]["requests"] += 1
            task_stats[task_type]["credits"] += tx.amount
            
            if "tokens" in tx.metadata:
                task_stats[task_type]["tokens"] += tx.metadata["tokens"]
        
        # Convert to list and add USD amounts
        from app.core.credits import credits_to_usd
        
        result_list = []
        for stats in task_stats.values():
            stats["usd"] = float(credits_to_usd(stats["credits"]))
            result_list.append(stats)
        
        # Sort by credits (descending)
        result_list.sort(key=lambda x: x["credits"], reverse=True)
        
        return result_list
    
    async def get_comprehensive_stats(
        self,
        user_id: int,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get comprehensive usage statistics
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            Comprehensive statistics
        """
        usage_stats = await self.get_user_usage_stats(user_id, days)
        provider_breakdown = await self.get_provider_usage_breakdown(user_id, days)
        model_breakdown = await self.get_model_usage_breakdown(user_id, days)
        task_breakdown = await self.get_task_type_breakdown(user_id, days)
        
        return {
            "period_days": days,
            "overview": usage_stats,
            "by_provider": provider_breakdown,
            "by_model": model_breakdown,
            "by_task_type": task_breakdown
        }


# Provider health tracking (in-memory for now, could be Redis in production)
_provider_health: Dict[str, Dict[str, Any]] = {}


class ProviderHealthMonitor:
    """
    Monitor provider health and performance
    
    Features:
    - Success rate tracking
    - Latency monitoring
    - Error tracking
    - Automatic provider selection based on health
    """
    
    @staticmethod
    def record_request(
        provider: str,
        model: str,
        success: bool,
        latency_ms: float,
        error: Optional[str] = None
    ):
        """Record a provider request"""
        key = f"{provider}/{model}"
        
        if key not in _provider_health:
            _provider_health[key] = {
                "provider": provider,
                "model": model,
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "total_latency_ms": 0.0,
                "last_error": None,
                "last_error_time": None,
                "last_success_time": None
            }
        
        stats = _provider_health[key]
        stats["total_requests"] += 1
        stats["total_latency_ms"] += latency_ms
        
        if success:
            stats["successful_requests"] += 1
            stats["last_success_time"] = datetime.utcnow().isoformat()
        else:
            stats["failed_requests"] += 1
            stats["last_error"] = error
            stats["last_error_time"] = datetime.utcnow().isoformat()
        
        logger.info(
            "provider_health_updated",
            provider=provider,
            model=model,
            success=success,
            latency_ms=latency_ms,
            success_rate=stats["successful_requests"] / stats["total_requests"]
        )
    
    @staticmethod
    def get_provider_health(provider: str, model: str) -> Optional[Dict[str, Any]]:
        """Get provider health stats"""
        key = f"{provider}/{model}"
        
        if key not in _provider_health:
            return None
        
        stats = _provider_health[key].copy()
        
        # Calculate metrics
        if stats["total_requests"] > 0:
            stats["success_rate"] = stats["successful_requests"] / stats["total_requests"]
            stats["avg_latency_ms"] = stats["total_latency_ms"] / stats["total_requests"]
        else:
            stats["success_rate"] = 0.0
            stats["avg_latency_ms"] = 0.0
        
        return stats
    
    @staticmethod
    def get_all_provider_health() -> List[Dict[str, Any]]:
        """Get all provider health stats"""
        result = []
        
        for key, stats in _provider_health.items():
            health = stats.copy()
            
            # Calculate metrics
            if health["total_requests"] > 0:
                health["success_rate"] = health["successful_requests"] / health["total_requests"]
                health["avg_latency_ms"] = health["total_latency_ms"] / health["total_requests"]
            else:
                health["success_rate"] = 0.0
                health["avg_latency_ms"] = 0.0
            
            result.append(health)
        
        # Sort by success rate (descending)
        result.sort(key=lambda x: x["success_rate"], reverse=True)
        
        return result
    
    @staticmethod
    def is_provider_healthy(provider: str, model: str, min_success_rate: float = 0.9) -> bool:
        """Check if provider is healthy"""
        health = ProviderHealthMonitor.get_provider_health(provider, model)
        
        if not health:
            return True  # Unknown = assume healthy
        
        # Need at least 10 requests to judge
        if health["total_requests"] < 10:
            return True
        
        return health["success_rate"] >= min_success_rate
