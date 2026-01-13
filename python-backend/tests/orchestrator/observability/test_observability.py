"""
Tests for Observability Module
Phase 2: Quality & Intelligence
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
import time

from app.orchestrator.observability.metrics import (
    MetricsCollector,
    MetricType,
    Metric,
    get_metrics,
)
from app.orchestrator.observability.tracing import (
    Tracer,
    Span,
    SpanContext,
    SpanStatus,
    get_tracer,
)
from app.orchestrator.observability.cost_tracker import (
    CostTracker,
    CostEntry,
    CostReport,
    get_cost_tracker,
    MODEL_PRICING,
)


class TestMetric:
    """Tests for Metric dataclass."""
    
    def test_metric_creation(self):
        """Test creating a Metric."""
        metric = Metric(
            name="test_metric",
            value=42.0,
            metric_type=MetricType.COUNTER,
            labels={"env": "test"},
        )
        
        assert metric.name == "test_metric"
        assert metric.value == 42.0
        assert metric.metric_type == MetricType.COUNTER
        assert metric.labels["env"] == "test"
    
    def test_metric_to_dict(self):
        """Test serialization to dict."""
        metric = Metric(
            name="test",
            value=1.0,
            metric_type=MetricType.GAUGE,
        )
        
        data = metric.to_dict()
        
        assert data["name"] == "test"
        assert data["value"] == 1.0
        assert data["type"] == "gauge"


class TestMetricsCollector:
    """Tests for MetricsCollector."""
    
    @pytest.fixture
    def collector(self):
        """Create a MetricsCollector instance."""
        return MetricsCollector(namespace="test")
    
    def test_initialization(self, collector):
        """Test collector initialization."""
        assert collector.namespace == "test"
        assert len(collector._registered) > 0
    
    def test_increment_counter(self, collector):
        """Test incrementing a counter."""
        collector.inc("requests_total")
        collector.inc("requests_total")
        collector.inc("requests_total", value=3)
        
        assert collector.get_counter("requests_total") == 5.0
    
    def test_increment_counter_with_labels(self, collector):
        """Test incrementing a counter with labels."""
        collector.inc("requests_total", labels={"method": "GET"})
        collector.inc("requests_total", labels={"method": "POST"})
        collector.inc("requests_total", labels={"method": "GET"})
        
        assert collector.get_counter("requests_total", labels={"method": "GET"}) == 2.0
        assert collector.get_counter("requests_total", labels={"method": "POST"}) == 1.0
    
    def test_set_gauge(self, collector):
        """Test setting a gauge."""
        collector.set("active_sessions", 10)
        assert collector.get_gauge("active_sessions") == 10
        
        collector.set("active_sessions", 15)
        assert collector.get_gauge("active_sessions") == 15
    
    def test_observe_histogram(self, collector):
        """Test observing histogram values."""
        collector.observe("request_latency_ms", 100)
        collector.observe("request_latency_ms", 200)
        collector.observe("request_latency_ms", 150)
        
        stats = collector.get_histogram_stats("request_latency_ms")
        
        assert stats["count"] == 3
        assert stats["min"] == 100
        assert stats["max"] == 200
        assert stats["avg"] == 150
    
    def test_timer_context_manager(self, collector):
        """Test timer context manager."""
        with collector.timer("request_latency_ms"):
            time.sleep(0.01)  # 10ms
        
        stats = collector.get_histogram_stats("request_latency_ms")
        
        assert stats["count"] == 1
        assert stats["min"] >= 10  # At least 10ms
    
    def test_get_all_metrics(self, collector):
        """Test getting all metrics."""
        collector.inc("requests_total")
        collector.set("active_sessions", 5)
        collector.observe("request_latency_ms", 100)
        
        metrics = collector.get_all_metrics()
        
        assert "counters" in metrics
        assert "gauges" in metrics
        assert "histograms" in metrics
    
    def test_export_prometheus(self, collector):
        """Test Prometheus export format."""
        collector.inc("requests_total")
        collector.set("active_sessions", 5)
        
        output = collector.export_prometheus()
        
        assert "test_requests_total" in output
        assert "test_active_sessions" in output
    
    def test_reset(self, collector):
        """Test resetting metrics."""
        collector.inc("requests_total")
        collector.set("active_sessions", 5)
        
        collector.reset()
        
        assert collector.get_counter("requests_total") == 0
        assert collector.get_gauge("active_sessions") == 0


class TestSpanContext:
    """Tests for SpanContext."""
    
    def test_span_context_creation(self):
        """Test creating a SpanContext."""
        context = SpanContext(
            trace_id="abc123",
            span_id="def456",
            parent_span_id="ghi789",
        )
        
        assert context.trace_id == "abc123"
        assert context.span_id == "def456"
        assert context.parent_span_id == "ghi789"
    
    def test_span_context_to_header(self):
        """Test converting to header format."""
        context = SpanContext(
            trace_id="abc123",
            span_id="def456",
        )
        
        header = context.to_header()
        
        assert "abc123" in header
        assert "def456" in header
    
    def test_span_context_from_header(self):
        """Test parsing from header."""
        header = "00-abc123-def456-01"
        
        context = SpanContext.from_header(header)
        
        assert context.trace_id == "abc123"
        assert context.span_id == "def456"


class TestSpan:
    """Tests for Span."""
    
    def test_span_creation(self):
        """Test creating a Span."""
        context = SpanContext(trace_id="t1", span_id="s1")
        span = Span(name="test_operation", context=context)
        
        assert span.name == "test_operation"
        assert span.status == SpanStatus.UNSET
        assert span.is_ended is False
    
    def test_span_attributes(self):
        """Test setting span attributes."""
        context = SpanContext(trace_id="t1", span_id="s1")
        span = Span(name="test", context=context)
        
        span.set_attribute("key", "value")
        span.set_attributes({"a": 1, "b": 2})
        
        assert span.attributes["key"] == "value"
        assert span.attributes["a"] == 1
        assert span.attributes["b"] == 2
    
    def test_span_events(self):
        """Test adding span events."""
        context = SpanContext(trace_id="t1", span_id="s1")
        span = Span(name="test", context=context)
        
        span.add_event("checkpoint", {"progress": 50})
        
        assert len(span.events) == 1
        assert span.events[0].name == "checkpoint"
    
    def test_span_end(self):
        """Test ending a span."""
        context = SpanContext(trace_id="t1", span_id="s1")
        span = Span(name="test", context=context)
        
        time.sleep(0.01)
        span.end()
        
        assert span.is_ended is True
        assert span.duration_ms >= 10


class TestTracer:
    """Tests for Tracer."""
    
    @pytest.fixture
    def tracer(self):
        """Create a Tracer instance."""
        return Tracer(service_name="test-service", export_enabled=False)
    
    def test_initialization(self, tracer):
        """Test tracer initialization."""
        assert tracer.service_name == "test-service"
    
    def test_start_span(self, tracer):
        """Test starting a span."""
        span = tracer.start_span("test_operation")
        
        assert span.name == "test_operation"
        assert span.context.trace_id is not None
        assert span.context.span_id is not None
    
    def test_start_child_span(self, tracer):
        """Test starting a child span."""
        parent = tracer.start_span("parent")
        child = tracer.start_span("child", parent_context=parent.context)
        
        assert child.context.trace_id == parent.context.trace_id
        assert child.context.parent_span_id == parent.context.span_id
    
    def test_span_context_manager(self, tracer):
        """Test span context manager."""
        with tracer.span("test_operation") as span:
            span.set_attribute("test", True)
        
        assert span.is_ended is True
        assert span.status == SpanStatus.OK
    
    def test_span_context_manager_error(self, tracer):
        """Test span context manager with error."""
        with pytest.raises(ValueError):
            with tracer.span("test_operation") as span:
                raise ValueError("Test error")
        
        assert span.status == SpanStatus.ERROR
        assert len(span.events) == 1  # Exception event
    
    def test_get_trace(self, tracer):
        """Test getting a trace."""
        span = tracer.start_span("test")
        tracer.end_span(span)
        
        trace = tracer.get_trace(span.context.trace_id)
        
        assert len(trace) == 1
        assert trace[0].name == "test"
    
    def test_inject_extract_context(self, tracer):
        """Test context injection and extraction."""
        with tracer.span("test") as span:
            headers = {}
            tracer.inject_context(headers)
            
            assert "traceparent" in headers
            
            extracted = tracer.extract_context(headers)
            assert extracted is not None


class TestCostEntry:
    """Tests for CostEntry."""
    
    def test_cost_entry_creation(self):
        """Test creating a CostEntry."""
        entry = CostEntry(
            entry_id="test-1",
            model="gpt-4o",
            input_tokens=1000,
            output_tokens=500,
            total_cost=0.05,
        )
        
        assert entry.model == "gpt-4o"
        assert entry.input_tokens == 1000
        assert entry.total_cost == 0.05
    
    def test_cost_entry_to_dict(self):
        """Test serialization to dict."""
        entry = CostEntry(
            entry_id="test-1",
            model="gpt-4o",
            total_cost=0.05,
        )
        
        data = entry.to_dict()
        
        assert data["entry_id"] == "test-1"
        assert data["model"] == "gpt-4o"


class TestCostTracker:
    """Tests for CostTracker."""
    
    @pytest.fixture
    def tracker(self):
        """Create a CostTracker instance."""
        return CostTracker(budget_limit=100.0)
    
    def test_initialization(self, tracker):
        """Test tracker initialization."""
        assert tracker.budget_limit == 100.0
        assert len(tracker.pricing) > 0
    
    def test_calculate_cost(self, tracker):
        """Test cost calculation."""
        cost = tracker.calculate_cost(
            model="gpt-4o",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        
        # GPT-4o: $2.50/1M input, $10.00/1M output
        assert cost["input_cost"] == 2.50
        assert cost["output_cost"] == 10.00
        assert cost["total_cost"] == 12.50
    
    def test_calculate_cost_unknown_model(self, tracker):
        """Test cost calculation for unknown model."""
        cost = tracker.calculate_cost(
            model="unknown-model",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        
        # Should use default pricing
        assert cost["total_cost"] > 0
    
    def test_record_cost(self, tracker):
        """Test recording a cost entry."""
        entry = tracker.record(
            model="gpt-4o",
            input_tokens=1000,
            output_tokens=500,
            user_id="user-1",
            operation="chat",
        )
        
        assert entry.model == "gpt-4o"
        assert entry.total_cost > 0
        assert len(tracker._entries) == 1
    
    def test_get_daily_cost(self, tracker):
        """Test getting daily cost."""
        tracker.record(model="gpt-4o", input_tokens=1000, output_tokens=500)
        tracker.record(model="gpt-4o", input_tokens=2000, output_tokens=1000)
        
        daily_cost = tracker.get_daily_cost()
        
        assert daily_cost > 0
    
    def test_get_report(self, tracker):
        """Test generating a cost report."""
        tracker.record(model="gpt-4o", input_tokens=1000, output_tokens=500, user_id="user-1")
        tracker.record(model="claude-3-5-sonnet", input_tokens=2000, output_tokens=1000, user_id="user-2")
        
        report = tracker.get_report()
        
        assert report.total_requests == 2
        assert report.total_cost > 0
        assert "gpt-4o" in report.by_model
        assert "claude-3-5-sonnet" in report.by_model
    
    def test_estimate_cost(self, tracker):
        """Test cost estimation."""
        estimate = tracker.estimate_cost(
            model="gpt-4o",
            prompt="Hello, how are you?",
            estimated_output_tokens=100,
        )
        
        assert estimate["model"] == "gpt-4o"
        assert estimate["estimated_input_tokens"] > 0
        assert estimate["total_cost"] > 0
    
    def test_budget_alert(self, tracker):
        """Test budget alert triggering."""
        # Set low budget for testing
        tracker.budget_limit = 0.001
        tracker.alert_threshold = 0.5
        
        with patch('structlog.get_logger') as mock_logger:
            mock_logger.return_value.warning = lambda *args, **kwargs: None
            
            # Record cost that exceeds threshold
            tracker.record(model="gpt-4o", input_tokens=100000, output_tokens=50000)
        
        # Alert should be sent
        day_key = datetime.utcnow().strftime("%Y-%m-%d")
        assert day_key in tracker._budget_alerts_sent
    
    def test_cleanup(self, tracker):
        """Test cleanup of old entries."""
        # Add old entry
        old_entry = CostEntry(
            entry_id="old",
            model="gpt-4o",
            total_cost=1.0,
        )
        old_entry.timestamp = datetime.utcnow() - timedelta(days=100)
        tracker._entries.append(old_entry)
        
        # Add recent entry
        tracker.record(model="gpt-4o", input_tokens=1000, output_tokens=500)
        
        tracker.cleanup(retention_days=30)
        
        assert len(tracker._entries) == 1


class TestGlobalInstances:
    """Tests for global instance getters."""
    
    def test_get_metrics(self):
        """Test getting global metrics collector."""
        metrics = get_metrics()
        assert isinstance(metrics, MetricsCollector)
    
    def test_get_tracer(self):
        """Test getting global tracer."""
        tracer = get_tracer()
        assert isinstance(tracer, Tracer)
    
    def test_get_cost_tracker(self):
        """Test getting global cost tracker."""
        tracker = get_cost_tracker()
        assert isinstance(tracker, CostTracker)
