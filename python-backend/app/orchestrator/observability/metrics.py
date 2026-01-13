"""
SmartSpec Pro - Metrics Collector
Phase 2: Quality & Intelligence

Collects and exports metrics for monitoring:
- Request/response metrics
- Token usage metrics
- Latency metrics
- Error rates
- Quality gate metrics
"""

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Callable
from uuid import uuid4
import time

import structlog

logger = structlog.get_logger()


class MetricType(str, Enum):
    """Types of metrics."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class Metric:
    """Represents a single metric."""
    name: str
    value: float
    metric_type: MetricType
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": self.value,
            "type": self.metric_type.value,
            "labels": self.labels,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class HistogramBucket:
    """Histogram bucket for latency distribution."""
    le: float  # Less than or equal
    count: int = 0


class MetricsCollector:
    """
    Collects and manages metrics for the orchestrator.
    
    Features:
    - Multiple metric types (counter, gauge, histogram)
    - Label support for dimensional metrics
    - Time-windowed aggregation
    - Export to various formats
    """
    
    # Default histogram buckets (in milliseconds)
    DEFAULT_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    
    def __init__(
        self,
        namespace: str = "smartspec",
        retention_hours: int = 24,
    ):
        """
        Initialize Metrics Collector.
        
        Args:
            namespace: Metric namespace prefix
            retention_hours: How long to retain metrics
        """
        self.namespace = namespace
        self.retention_hours = retention_hours
        
        # Metric storage
        self._counters: Dict[str, float] = defaultdict(float)
        self._gauges: Dict[str, float] = {}
        self._histograms: Dict[str, List[float]] = defaultdict(list)
        
        # Time series (for historical data)
        self._time_series: Dict[str, List[Metric]] = defaultdict(list)
        
        # Registered metrics
        self._registered: Dict[str, MetricType] = {}
        
        # Register default metrics
        self._register_default_metrics()
        
        logger.info("metrics_collector_initialized", namespace=namespace)
    
    def _register_default_metrics(self):
        """Register default metrics."""
        # Request metrics
        self.register("requests_total", MetricType.COUNTER)
        self.register("requests_success", MetricType.COUNTER)
        self.register("requests_failed", MetricType.COUNTER)
        
        # Token metrics
        self.register("tokens_input_total", MetricType.COUNTER)
        self.register("tokens_output_total", MetricType.COUNTER)
        self.register("tokens_total", MetricType.COUNTER)
        
        # Latency metrics
        self.register("request_latency_ms", MetricType.HISTOGRAM)
        self.register("llm_latency_ms", MetricType.HISTOGRAM)
        self.register("rag_latency_ms", MetricType.HISTOGRAM)
        
        # Cost metrics
        self.register("cost_usd_total", MetricType.COUNTER)
        self.register("cost_credits_total", MetricType.COUNTER)
        
        # Quality gate metrics
        self.register("quality_gates_passed", MetricType.COUNTER)
        self.register("quality_gates_failed", MetricType.COUNTER)
        
        # Active metrics
        self.register("active_sessions", MetricType.GAUGE)
        self.register("active_workflows", MetricType.GAUGE)
    
    def register(self, name: str, metric_type: MetricType):
        """Register a metric."""
        full_name = f"{self.namespace}_{name}"
        self._registered[full_name] = metric_type
    
    def _get_key(self, name: str, labels: Optional[Dict[str, str]] = None) -> str:
        """Get storage key for metric."""
        full_name = f"{self.namespace}_{name}"
        if labels:
            label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
            return f"{full_name}{{{label_str}}}"
        return full_name
    
    def inc(
        self,
        name: str,
        value: float = 1.0,
        labels: Optional[Dict[str, str]] = None,
    ):
        """Increment a counter."""
        key = self._get_key(name, labels)
        self._counters[key] += value
        
        # Store in time series
        metric = Metric(
            name=f"{self.namespace}_{name}",
            value=self._counters[key],
            metric_type=MetricType.COUNTER,
            labels=labels or {},
        )
        self._time_series[key].append(metric)
    
    def set(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None,
    ):
        """Set a gauge value."""
        key = self._get_key(name, labels)
        self._gauges[key] = value
        
        # Store in time series
        metric = Metric(
            name=f"{self.namespace}_{name}",
            value=value,
            metric_type=MetricType.GAUGE,
            labels=labels or {},
        )
        self._time_series[key].append(metric)
    
    def observe(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None,
    ):
        """Observe a histogram value."""
        key = self._get_key(name, labels)
        self._histograms[key].append(value)
        
        # Store in time series
        metric = Metric(
            name=f"{self.namespace}_{name}",
            value=value,
            metric_type=MetricType.HISTOGRAM,
            labels=labels or {},
        )
        self._time_series[key].append(metric)
    
    def timer(self, name: str, labels: Optional[Dict[str, str]] = None):
        """
        Context manager for timing operations.
        
        Usage:
            with metrics.timer("request_latency_ms"):
                # do something
        """
        return _Timer(self, name, labels)
    
    async def async_timer(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ):
        """
        Async context manager for timing operations.
        
        Usage:
            async with metrics.async_timer("request_latency_ms"):
                # do something
        """
        return _AsyncTimer(self, name, labels)
    
    def get_counter(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ) -> float:
        """Get current counter value."""
        key = self._get_key(name, labels)
        return self._counters.get(key, 0.0)
    
    def get_gauge(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ) -> float:
        """Get current gauge value."""
        key = self._get_key(name, labels)
        return self._gauges.get(key, 0.0)
    
    def get_histogram_stats(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ) -> Dict[str, float]:
        """Get histogram statistics."""
        key = self._get_key(name, labels)
        values = self._histograms.get(key, [])
        
        if not values:
            return {
                "count": 0,
                "sum": 0,
                "min": 0,
                "max": 0,
                "avg": 0,
                "p50": 0,
                "p90": 0,
                "p99": 0,
            }
        
        sorted_values = sorted(values)
        count = len(values)
        
        return {
            "count": count,
            "sum": sum(values),
            "min": min(values),
            "max": max(values),
            "avg": sum(values) / count,
            "p50": sorted_values[int(count * 0.5)],
            "p90": sorted_values[int(count * 0.9)],
            "p99": sorted_values[min(int(count * 0.99), count - 1)],
        }
    
    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all current metrics."""
        metrics = {
            "counters": dict(self._counters),
            "gauges": dict(self._gauges),
            "histograms": {},
        }
        
        for key in self._histograms:
            metrics["histograms"][key] = self.get_histogram_stats(
                key.split("{")[0].replace(f"{self.namespace}_", "")
            )
        
        return metrics
    
    def export_prometheus(self) -> str:
        """Export metrics in Prometheus format."""
        lines = []
        
        # Export counters
        for key, value in self._counters.items():
            lines.append(f"{key} {value}")
        
        # Export gauges
        for key, value in self._gauges.items():
            lines.append(f"{key} {value}")
        
        # Export histograms
        for key, values in self._histograms.items():
            if not values:
                continue
            
            stats = self.get_histogram_stats(
                key.split("{")[0].replace(f"{self.namespace}_", "")
            )
            
            lines.append(f"{key}_count {stats['count']}")
            lines.append(f"{key}_sum {stats['sum']}")
            
            # Buckets
            sorted_values = sorted(values)
            for bucket in self.DEFAULT_BUCKETS:
                count = sum(1 for v in sorted_values if v <= bucket)
                lines.append(f'{key}_bucket{{le="{bucket}"}} {count}')
            lines.append(f'{key}_bucket{{le="+Inf"}} {len(values)}')
        
        return "\n".join(lines)
    
    def cleanup_old_data(self):
        """Remove old time series data."""
        cutoff = datetime.utcnow() - timedelta(hours=self.retention_hours)
        
        for key in list(self._time_series.keys()):
            self._time_series[key] = [
                m for m in self._time_series[key]
                if m.timestamp > cutoff
            ]
    
    def reset(self):
        """Reset all metrics."""
        self._counters.clear()
        self._gauges.clear()
        self._histograms.clear()
        self._time_series.clear()
        
        logger.info("metrics_reset")


class _Timer:
    """Context manager for timing operations."""
    
    def __init__(
        self,
        collector: MetricsCollector,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ):
        self.collector = collector
        self.name = name
        self.labels = labels
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.perf_counter() - self.start_time) * 1000
        self.collector.observe(self.name, elapsed_ms, self.labels)


class _AsyncTimer:
    """Async context manager for timing operations."""
    
    def __init__(
        self,
        collector: MetricsCollector,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ):
        self.collector = collector
        self.name = name
        self.labels = labels
        self.start_time = None
    
    async def __aenter__(self):
        self.start_time = time.perf_counter()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.perf_counter() - self.start_time) * 1000
        self.collector.observe(self.name, elapsed_ms, self.labels)


# Global metrics collector instance
_metrics_collector: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    """Get the global metrics collector."""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector
