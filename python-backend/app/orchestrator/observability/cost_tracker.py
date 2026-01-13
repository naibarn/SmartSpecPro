"""
SmartSpec Pro - Cost Tracker
Phase 2: Quality & Intelligence

Tracks and reports costs for LLM usage:
- Per-request cost tracking
- Model-specific pricing
- Budget monitoring
- Cost reports and analytics
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from collections import defaultdict

import structlog

logger = structlog.get_logger()


# Model pricing (per 1M tokens)
MODEL_PRICING = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    
    # Anthropic
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    
    # Google
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    
    # DeepSeek
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-coder": {"input": 0.14, "output": 0.28},
    
    # Default fallback
    "default": {"input": 1.00, "output": 3.00},
}


@dataclass
class CostEntry:
    """Represents a single cost entry."""
    entry_id: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    # Model info
    model: str = ""
    provider: str = ""
    
    # Token usage
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    
    # Cost
    input_cost: float = 0.0
    output_cost: float = 0.0
    total_cost: float = 0.0
    
    # Context
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    workflow_id: Optional[str] = None
    operation: str = ""
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp.isoformat(),
            "model": self.model,
            "provider": self.provider,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "input_cost": self.input_cost,
            "output_cost": self.output_cost,
            "total_cost": self.total_cost,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "workflow_id": self.workflow_id,
            "operation": self.operation,
        }


@dataclass
class CostReport:
    """Cost report for a time period."""
    start_time: datetime
    end_time: datetime
    
    # Totals
    total_cost: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_requests: int = 0
    
    # Breakdowns
    by_model: Dict[str, float] = field(default_factory=dict)
    by_user: Dict[str, float] = field(default_factory=dict)
    by_operation: Dict[str, float] = field(default_factory=dict)
    by_day: Dict[str, float] = field(default_factory=dict)
    
    # Entries
    entries: List[CostEntry] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "total_cost": self.total_cost,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_requests": self.total_requests,
            "by_model": self.by_model,
            "by_user": self.by_user,
            "by_operation": self.by_operation,
            "by_day": self.by_day,
            "average_cost_per_request": (
                self.total_cost / self.total_requests
                if self.total_requests > 0 else 0
            ),
        }


class CostTracker:
    """
    Tracks and reports LLM costs.
    
    Features:
    - Real-time cost tracking
    - Model-specific pricing
    - Budget alerts
    - Cost reports
    """
    
    def __init__(
        self,
        pricing: Optional[Dict[str, Dict[str, float]]] = None,
        budget_limit: Optional[float] = None,
        alert_threshold: float = 0.8,
    ):
        """
        Initialize Cost Tracker.
        
        Args:
            pricing: Custom pricing overrides
            budget_limit: Optional daily budget limit (USD)
            alert_threshold: Threshold for budget alerts (0-1)
        """
        self.pricing = {**MODEL_PRICING, **(pricing or {})}
        self.budget_limit = budget_limit
        self.alert_threshold = alert_threshold
        
        # Cost entries
        self._entries: List[CostEntry] = []
        
        # Daily totals
        self._daily_costs: Dict[str, float] = defaultdict(float)
        
        # Budget tracking
        self._budget_alerts_sent: set = set()
        
        logger.info(
            "cost_tracker_initialized",
            budget_limit=budget_limit,
        )
    
    def _get_pricing(self, model: str) -> Dict[str, float]:
        """Get pricing for a model."""
        # Try exact match
        if model in self.pricing:
            return self.pricing[model]
        
        # Try partial match
        model_lower = model.lower()
        for key, pricing in self.pricing.items():
            if key.lower() in model_lower or model_lower in key.lower():
                return pricing
        
        # Default pricing
        return self.pricing["default"]
    
    def calculate_cost(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> Dict[str, float]:
        """
        Calculate cost for token usage.
        
        Args:
            model: Model name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            
        Returns:
            Dictionary with input_cost, output_cost, total_cost
        """
        pricing = self._get_pricing(model)
        
        # Calculate costs (pricing is per 1M tokens)
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        total_cost = input_cost + output_cost
        
        return {
            "input_cost": round(input_cost, 6),
            "output_cost": round(output_cost, 6),
            "total_cost": round(total_cost, 6),
        }
    
    def record(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        operation: str = "",
        provider: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CostEntry:
        """
        Record a cost entry.
        
        Args:
            model: Model name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            user_id: Optional user ID
            session_id: Optional session ID
            workflow_id: Optional workflow ID
            operation: Operation name
            provider: Provider name
            metadata: Additional metadata
            
        Returns:
            The created CostEntry
        """
        from uuid import uuid4
        
        # Calculate cost
        cost = self.calculate_cost(model, input_tokens, output_tokens)
        
        # Create entry
        entry = CostEntry(
            entry_id=str(uuid4()),
            model=model,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            input_cost=cost["input_cost"],
            output_cost=cost["output_cost"],
            total_cost=cost["total_cost"],
            user_id=user_id,
            session_id=session_id,
            workflow_id=workflow_id,
            operation=operation,
            metadata=metadata or {},
        )
        
        # Store entry
        self._entries.append(entry)
        
        # Update daily total
        day_key = entry.timestamp.strftime("%Y-%m-%d")
        self._daily_costs[day_key] += entry.total_cost
        
        # Check budget
        self._check_budget(day_key)
        
        logger.debug(
            "cost_recorded",
            model=model,
            total_tokens=entry.total_tokens,
            total_cost=entry.total_cost,
        )
        
        return entry
    
    def _check_budget(self, day_key: str):
        """Check if budget threshold is exceeded."""
        if not self.budget_limit:
            return
        
        daily_cost = self._daily_costs[day_key]
        threshold_cost = self.budget_limit * self.alert_threshold
        
        if daily_cost >= threshold_cost and day_key not in self._budget_alerts_sent:
            self._budget_alerts_sent.add(day_key)
            
            logger.warning(
                "budget_threshold_exceeded",
                day=day_key,
                daily_cost=daily_cost,
                budget_limit=self.budget_limit,
                threshold=self.alert_threshold,
            )
    
    def get_daily_cost(self, date: Optional[datetime] = None) -> float:
        """Get cost for a specific day."""
        if date is None:
            date = datetime.utcnow()
        
        day_key = date.strftime("%Y-%m-%d")
        return self._daily_costs.get(day_key, 0.0)
    
    def get_report(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        user_id: Optional[str] = None,
    ) -> CostReport:
        """
        Generate a cost report.
        
        Args:
            start_time: Report start time (default: 24h ago)
            end_time: Report end time (default: now)
            user_id: Filter by user ID
            
        Returns:
            CostReport with aggregated data
        """
        if end_time is None:
            end_time = datetime.utcnow()
        if start_time is None:
            start_time = end_time - timedelta(days=1)
        
        # Filter entries
        filtered_entries = [
            e for e in self._entries
            if start_time <= e.timestamp <= end_time
            and (user_id is None or e.user_id == user_id)
        ]
        
        # Create report
        report = CostReport(
            start_time=start_time,
            end_time=end_time,
            entries=filtered_entries,
        )
        
        # Calculate totals
        for entry in filtered_entries:
            report.total_cost += entry.total_cost
            report.total_input_tokens += entry.input_tokens
            report.total_output_tokens += entry.output_tokens
            report.total_requests += 1
            
            # By model
            if entry.model not in report.by_model:
                report.by_model[entry.model] = 0.0
            report.by_model[entry.model] += entry.total_cost
            
            # By user
            if entry.user_id:
                if entry.user_id not in report.by_user:
                    report.by_user[entry.user_id] = 0.0
                report.by_user[entry.user_id] += entry.total_cost
            
            # By operation
            if entry.operation:
                if entry.operation not in report.by_operation:
                    report.by_operation[entry.operation] = 0.0
                report.by_operation[entry.operation] += entry.total_cost
            
            # By day
            day_key = entry.timestamp.strftime("%Y-%m-%d")
            if day_key not in report.by_day:
                report.by_day[day_key] = 0.0
            report.by_day[day_key] += entry.total_cost
        
        return report
    
    def get_user_cost(
        self,
        user_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get cost summary for a user."""
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=days)
        
        report = self.get_report(
            start_time=start_time,
            end_time=end_time,
            user_id=user_id,
        )
        
        return {
            "user_id": user_id,
            "period_days": days,
            "total_cost": report.total_cost,
            "total_requests": report.total_requests,
            "total_tokens": report.total_input_tokens + report.total_output_tokens,
            "by_model": report.by_model,
            "by_day": report.by_day,
        }
    
    def estimate_cost(
        self,
        model: str,
        prompt: str,
        estimated_output_tokens: int = 1000,
    ) -> Dict[str, Any]:
        """
        Estimate cost for a request.
        
        Args:
            model: Model name
            prompt: Input prompt
            estimated_output_tokens: Estimated output tokens
            
        Returns:
            Cost estimate
        """
        # Estimate input tokens (rough: 4 chars per token)
        estimated_input_tokens = len(prompt) // 4
        
        cost = self.calculate_cost(
            model=model,
            input_tokens=estimated_input_tokens,
            output_tokens=estimated_output_tokens,
        )
        
        return {
            "model": model,
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_total_tokens": estimated_input_tokens + estimated_output_tokens,
            **cost,
        }
    
    def cleanup(self, retention_days: int = 90):
        """Remove old entries."""
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        
        self._entries = [
            e for e in self._entries
            if e.timestamp > cutoff
        ]
        
        # Cleanup daily costs
        cutoff_key = cutoff.strftime("%Y-%m-%d")
        self._daily_costs = {
            k: v for k, v in self._daily_costs.items()
            if k >= cutoff_key
        }
        
        logger.info(
            "cost_tracker_cleanup",
            retention_days=retention_days,
            remaining_entries=len(self._entries),
        )


# Global cost tracker instance
_cost_tracker: Optional[CostTracker] = None


def get_cost_tracker() -> CostTracker:
    """Get the global cost tracker."""
    global _cost_tracker
    if _cost_tracker is None:
        _cost_tracker = CostTracker()
    return _cost_tracker
