"""
Usage Analytics Service
Comprehensive analytics for LLM usage, costs, and patterns
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
import csv
import io

from app.models.credit import CreditTransaction
from app.models.payment import PaymentTransaction


class AnalyticsService:
    """Service for usage analytics and reporting"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_usage_summary(
        self,
        user_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get usage summary for a time period
        
        Args:
            user_id: User ID
            days: Number of days to analyze (1-365)
        
        Returns:
            Usage summary
        
        Raises:
            ValueError: If days is out of valid range
        """
        # Validate input
        if days < 1 or days > 365:
            raise ValueError("Days must be between 1 and 365")
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get credit transactions (LLM usage)
        result = await self.db.execute(
            select(CreditTransaction)
            .where(
                and_(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.created_at >= start_date,
                    CreditTransaction.type == "deduction"
                )
            )
        )
        transactions = result.scalars().all()
        
        # Calculate metrics
        total_requests = len(transactions)
        total_credits = sum(t.amount for t in transactions)
        total_cost_usd = total_credits / 1000  # 1000 credits = $1
        
        # Group by provider
        by_provider = {}
        by_model = {}
        by_day = {}
        
        for t in transactions:
            metadata = t.metadata or {}
            provider = metadata.get("provider", "unknown")
            model = metadata.get("model", "unknown")
            day = t.created_at.strftime("%Y-%m-%d")
            
            # By provider
            if provider not in by_provider:
                by_provider[provider] = {
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0
                }
            by_provider[provider]["requests"] += 1
            by_provider[provider]["credits"] += t.amount
            by_provider[provider]["cost_usd"] += t.amount / 1000
            
            # By model
            model_key = f"{provider}/{model}"
            if model_key not in by_model:
                by_model[model_key] = {
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0
                }
            by_model[model_key]["requests"] += 1
            by_model[model_key]["credits"] += t.amount
            by_model[model_key]["cost_usd"] += t.amount / 1000
            
            # By day
            if day not in by_day:
                by_day[day] = {
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0
                }
            by_day[day]["requests"] += 1
            by_day[day]["credits"] += t.amount
            by_day[day]["cost_usd"] += t.amount / 1000
        
        # Get payment summary
        payment_result = await self.db.execute(
            select(PaymentTransaction)
            .where(
                and_(
                    PaymentTransaction.user_id == user_id,
                    PaymentTransaction.created_at >= start_date,
                    PaymentTransaction.status == "completed"
                )
            )
        )
        payments = payment_result.scalars().all()
        
        total_paid_usd = sum(p.amount_usd for p in payments)
        total_credits_purchased = sum(p.credits_added for p in payments)
        
        return {
            "period": {
                "start": start_date.isoformat(),
                "end": datetime.utcnow().isoformat(),
                "days": days
            },
            "usage": {
                "total_requests": total_requests,
                "total_credits": total_credits,
                "total_cost_usd": round(total_cost_usd, 2),
                "avg_credits_per_request": round(total_credits / total_requests, 2) if total_requests > 0 else 0,
                "avg_cost_per_request_usd": round(total_cost_usd / total_requests, 4) if total_requests > 0 else 0
            },
            "payments": {
                "total_paid_usd": round(total_paid_usd, 2),
                "total_credits_purchased": total_credits_purchased,
                "payment_count": len(payments)
            },
            "by_provider": by_provider,
            "by_model": by_model,
            "by_day": by_day
        }
    
    async def get_time_series(
        self,
        user_id: str,
        days: int = 30,
        granularity: str = "day"  # day, hour
    ) -> List[Dict[str, Any]]:
        """
        Get time-series data for charts
        
        Args:
            user_id: User ID
            days: Number of days to analyze (1-365)
            granularity: Time granularity (day or hour)
        
        Returns:
            Time-series data
        
        Raises:
            ValueError: If parameters are invalid
        """
        # Validate input
        if days < 1 or days > 365:
            raise ValueError("Days must be between 1 and 365")
        
        if granularity not in ["day", "hour"]:
            raise ValueError("Granularity must be 'day' or 'hour'")
        
        # Continue with original implementation
        start_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.db.execute(
            select(CreditTransaction)
            .where(
                and_(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.created_at >= start_date,
                    CreditTransaction.type == "deduction"
                )
            )
            .order_by(CreditTransaction.created_at)
        )
        transactions = result.scalars().all()
        
        # Group by time period
        time_series = {}
        
        for t in transactions:
            if granularity == "day":
                key = t.created_at.strftime("%Y-%m-%d")
            else:  # hour
                key = t.created_at.strftime("%Y-%m-%d %H:00")
            
            if key not in time_series:
                time_series[key] = {
                    "timestamp": key,
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0
                }
            
            time_series[key]["requests"] += 1
            time_series[key]["credits"] += t.amount
            time_series[key]["cost_usd"] += t.amount / 1000
        
        # Convert to list and sort
        data_points = list(time_series.values())
        data_points.sort(key=lambda x: x["timestamp"])
        
        # Round values
        for point in data_points:
            point["cost_usd"] = round(point["cost_usd"], 4)
        
        return data_points
    
    async def get_provider_comparison(
        self,
        user_id: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Compare providers by cost and performance
        
        Args:
            user_id: User ID
            days: Number of days
        
        Returns:
            Provider comparison data
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.db.execute(
            select(CreditTransaction)
            .where(
                and_(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.created_at >= start_date,
                    CreditTransaction.type == "deduction"
                )
            )
        )
        transactions = result.scalars().all()
        
        providers = {}
        
        for t in transactions:
            metadata = t.metadata or {}
            provider = metadata.get("provider", "unknown")
            
            if provider not in providers:
                providers[provider] = {
                    "provider": provider,
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0,
                    "models_used": set()
                }
            
            providers[provider]["requests"] += 1
            providers[provider]["credits"] += t.amount
            providers[provider]["cost_usd"] += t.amount / 1000
            
            model = metadata.get("model")
            if model:
                providers[provider]["models_used"].add(model)
        
        # Convert to list and calculate percentages
        comparison = []
        total_cost = sum(p["cost_usd"] for p in providers.values())
        
        for provider_data in providers.values():
            provider_data["models_used"] = list(provider_data["models_used"])
            provider_data["cost_percentage"] = round(
                (provider_data["cost_usd"] / total_cost * 100) if total_cost > 0 else 0,
                2
            )
            provider_data["cost_usd"] = round(provider_data["cost_usd"], 2)
            provider_data["avg_cost_per_request"] = round(
                provider_data["cost_usd"] / provider_data["requests"],
                4
            ) if provider_data["requests"] > 0 else 0
            
            comparison.append(provider_data)
        
        # Sort by cost descending
        comparison.sort(key=lambda x: x["cost_usd"], reverse=True)
        
        return comparison
    
    async def export_usage_csv(
        self,
        user_id: str,
        days: int = 30
    ) -> str:
        """
        Export usage data to CSV
        
        Args:
            user_id: User ID
            days: Number of days
        
        Returns:
            CSV string
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.db.execute(
            select(CreditTransaction)
            .where(
                and_(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.created_at >= start_date,
                    CreditTransaction.type == "deduction"
                )
            )
            .order_by(CreditTransaction.created_at.desc())
        )
        transactions = result.scalars().all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "Date",
            "Time",
            "Provider",
            "Model",
            "Credits",
            "Cost (USD)",
            "Description"
        ])
        
        # Data
        for t in transactions:
            metadata = t.metadata or {}
            provider = metadata.get("provider", "N/A")
            model = metadata.get("model", "N/A")
            
            writer.writerow([
                t.created_at.strftime("%Y-%m-%d"),
                t.created_at.strftime("%H:%M:%S"),
                provider,
                model,
                t.amount,
                round(t.amount / 1000, 4),
                t.description or ""
            ])
        
        return output.getvalue()
    
    async def get_top_models(
        self,
        user_id: str,
        days: int = 30,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top models by usage
        
        Args:
            user_id: User ID
            days: Number of days
            limit: Maximum number of results
        
        Returns:
            Top models list
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.db.execute(
            select(CreditTransaction)
            .where(
                and_(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.created_at >= start_date,
                    CreditTransaction.type == "deduction"
                )
            )
        )
        transactions = result.scalars().all()
        
        models = {}
        
        for t in transactions:
            metadata = t.metadata or {}
            provider = metadata.get("provider", "unknown")
            model = metadata.get("model", "unknown")
            model_key = f"{provider}/{model}"
            
            if model_key not in models:
                models[model_key] = {
                    "model": model_key,
                    "provider": provider,
                    "model_name": model,
                    "requests": 0,
                    "credits": 0,
                    "cost_usd": 0.0
                }
            
            models[model_key]["requests"] += 1
            models[model_key]["credits"] += t.amount
            models[model_key]["cost_usd"] += t.amount / 1000
        
        # Convert to list and sort
        top_models = list(models.values())
        top_models.sort(key=lambda x: x["cost_usd"], reverse=True)
        
        # Round and limit
        for model in top_models[:limit]:
            model["cost_usd"] = round(model["cost_usd"], 2)
            model["avg_cost_per_request"] = round(
                model["cost_usd"] / model["requests"],
                4
            ) if model["requests"] > 0 else 0
        
        return top_models[:limit]
