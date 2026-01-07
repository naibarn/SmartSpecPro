"""
Unit tests for Monitoring
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime
from app.core.monitoring import (
    MetricsCollector,
    PerformanceMonitor,
    HealthChecker,
    AlertManager,
    metrics_collector,
    health_checker,
    alert_manager
)


class TestMetricsCollector:
    """Test MetricsCollector class"""
    
    def test_initialization(self):
        """Test metrics collector initialization"""
        collector = MetricsCollector()
        
        assert collector.metrics is not None
        assert collector.request_times == []
        assert collector.error_log == []
    
    def test_record_request_success(self):
        """Test recording successful request"""
        collector = MetricsCollector()
        
        collector.record_request("/api/test", "GET", 0.5, 200)
        
        assert collector.metrics["GET:/api/test"]["count"] == 1
        assert collector.metrics["GET:/api/test"]["total_time"] == 0.5
        assert collector.metrics["GET:/api/test"]["errors"] == 0
        assert len(collector.request_times) == 1
    
    def test_record_request_error(self):
        """Test recording error request"""
        collector = MetricsCollector()
        
        collector.record_request("/api/test", "POST", 1.0, 500)
        
        assert collector.metrics["POST:/api/test"]["count"] == 1
        assert collector.metrics["POST:/api/test"]["errors"] == 1
    
    def test_record_multiple_requests(self):
        """Test recording multiple requests"""
        collector = MetricsCollector()
        
        collector.record_request("/api/test", "GET", 0.5, 200)
        collector.record_request("/api/test", "GET", 0.7, 200)
        collector.record_request("/api/test", "GET", 0.3, 404)
        
        assert collector.metrics["GET:/api/test"]["count"] == 3
        assert collector.metrics["GET:/api/test"]["total_time"] == 1.5
        assert collector.metrics["GET:/api/test"]["errors"] == 1
    
    def test_request_times_limit(self):
        """Test request times list is limited to 1000"""
        collector = MetricsCollector()
        
        for i in range(1100):
            collector.record_request("/api/test", "GET", 0.1, 200)
        
        assert len(collector.request_times) == 1000
    
    def test_record_error(self):
        """Test recording error"""
        collector = MetricsCollector()
        
        collector.record_error("ValueError", "Test error", {"user_id": "123"})
        
        assert len(collector.error_log) == 1
        assert collector.error_log[0]["type"] == "ValueError"
        assert collector.error_log[0]["message"] == "Test error"
        assert collector.error_log[0]["context"]["user_id"] == "123"
    
    def test_error_log_limit(self):
        """Test error log is limited to 100"""
        collector = MetricsCollector()
        
        for i in range(150):
            collector.record_error("Error", f"Error {i}", {})
        
        assert len(collector.error_log) == 100
    
    def test_get_metrics_empty(self):
        """Test get metrics with no data"""
        collector = MetricsCollector()
        
        metrics = collector.get_metrics()
        
        assert metrics["total_requests"] == 0
        assert metrics["total_errors"] == 0
        assert metrics["error_rate"] == 0
        assert metrics["avg_response_time"] == 0
    
    def test_get_metrics_with_data(self):
        """Test get metrics with data"""
        collector = MetricsCollector()
        
        collector.record_request("/api/test", "GET", 0.5, 200)
        collector.record_request("/api/test", "GET", 1.0, 500)
        collector.record_request("/api/other", "POST", 0.3, 200)
        
        metrics = collector.get_metrics()
        
        assert metrics["total_requests"] == 3
        assert metrics["total_errors"] == 1
        assert metrics["error_rate"] == 1/3
        assert metrics["avg_response_time"] > 0
    
    def test_get_metrics_percentiles(self):
        """Test metrics percentile calculation"""
        collector = MetricsCollector()
        
        # Add requests with known times
        for time in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
            collector.record_request("/api/test", "GET", time, 200)
        
        metrics = collector.get_metrics()
        
        assert metrics["p50_response_time"] > 0
        assert metrics["p95_response_time"] > metrics["p50_response_time"]
        assert metrics["p99_response_time"] >= metrics["p95_response_time"]
    
    def test_reset(self):
        """Test reset metrics"""
        collector = MetricsCollector()
        
        collector.record_request("/api/test", "GET", 0.5, 200)
        collector.record_error("Error", "Test", {})
        
        collector.reset()
        
        assert len(collector.metrics) == 0
        assert len(collector.request_times) == 0
        assert len(collector.error_log) == 0


class TestPerformanceMonitor:
    """Test PerformanceMonitor class"""
    
    def test_context_manager_success(self):
        """Test performance monitor with successful operation"""
        with PerformanceMonitor("test_operation") as monitor:
            pass
        
        assert monitor.duration is not None
        assert monitor.duration >= 0
    
    def test_context_manager_with_error(self):
        """Test performance monitor with error"""
        try:
            with PerformanceMonitor("test_operation") as monitor:
                raise ValueError("Test error")
        except ValueError:
            pass
        
        assert monitor.duration is not None
    
    def test_duration_property(self):
        """Test duration property"""
        monitor = PerformanceMonitor("test")
        
        # Before execution
        assert monitor.duration is None
        
        # After execution
        with monitor:
            pass
        
        assert monitor.duration is not None
        assert monitor.duration >= 0


class TestHealthChecker:
    """Test HealthChecker class"""
    
    @pytest.mark.asyncio
    async def test_check_database_success(self):
        """Test successful database check"""
        checker = HealthChecker()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=True)
        
        result = await checker.check_database(db)
        
        assert result is True
        db.execute.assert_called_once_with("SELECT 1")
    
    @pytest.mark.asyncio
    async def test_check_database_failure(self):
        """Test failed database check"""
        checker = HealthChecker()
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=Exception("Connection failed"))
        
        result = await checker.check_database(db)
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_redis_success(self):
        """Test successful Redis check"""
        checker = HealthChecker()
        redis = AsyncMock()
        redis.ping = AsyncMock(return_value=True)
        
        result = await checker.check_redis(redis)
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_redis_failure(self):
        """Test failed Redis check"""
        checker = HealthChecker()
        redis = AsyncMock()
        redis.ping = AsyncMock(side_effect=Exception("Connection failed"))
        
        result = await checker.check_redis(redis)
        
        assert result is False
    
    @patch('app.core.monitoring.psutil')
    def test_check_memory(self, mock_psutil):
        """Test memory check"""
        checker = HealthChecker()
        mock_psutil.virtual_memory.return_value = Mock(
            total=16000000000,
            available=8000000000,
            percent=50.0,
            used=8000000000
        )
        
        result = checker.check_memory()
        
        assert result["total"] == 16000000000
        assert result["available"] == 8000000000
        assert result["percent"] == 50.0
    
    @patch('app.core.monitoring.psutil')
    def test_check_cpu(self, mock_psutil):
        """Test CPU check"""
        checker = HealthChecker()
        mock_psutil.cpu_percent.return_value = 25.5
        mock_psutil.cpu_count.return_value = 8
        
        result = checker.check_cpu()
        
        assert result["percent"] == 25.5
        assert result["count"] == 8
    
    @patch('app.core.monitoring.psutil')
    def test_check_disk(self, mock_psutil):
        """Test disk check"""
        checker = HealthChecker()
        mock_psutil.disk_usage.return_value = Mock(
            total=1000000000000,
            used=500000000000,
            free=500000000000,
            percent=50.0
        )
        
        result = checker.check_disk()
        
        assert result["total"] == 1000000000000
        assert result["percent"] == 50.0
    
    @pytest.mark.asyncio
    async def test_get_health_status_all_healthy(self):
        """Test health status with all systems healthy"""
        checker = HealthChecker()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=True)
        redis = AsyncMock()
        redis.ping = AsyncMock(return_value=True)
        
        with patch('app.core.monitoring.psutil'):
            health = await checker.get_health_status(db, redis)
        
        assert health["status"] == "healthy"
        assert "database" in health["checks"]
        assert "redis" in health["checks"]
    
    @pytest.mark.asyncio
    async def test_get_health_status_degraded(self):
        """Test health status with degraded systems"""
        checker = HealthChecker()
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=Exception("DB error"))
        
        with patch('app.core.monitoring.psutil'):
            health = await checker.get_health_status(db, None)
        
        assert health["status"] == "degraded"
        assert health["checks"]["database"]["status"] == "unhealthy"


class TestAlertManager:
    """Test AlertManager class"""
    
    def test_initialization(self):
        """Test alert manager initialization"""
        manager = AlertManager()
        
        assert manager.alerts == []
        assert "error_rate" in manager.alert_thresholds
        assert "response_time_p95" in manager.alert_thresholds
    
    def test_check_thresholds_no_alerts(self):
        """Test threshold check with no alerts"""
        manager = AlertManager()
        metrics = {
            "error_rate": 0.01,
            "p95_response_time": 1.0
        }
        
        alerts = manager.check_thresholds(metrics)
        
        assert len(alerts) == 0
    
    def test_check_thresholds_high_error_rate(self):
        """Test threshold check with high error rate"""
        manager = AlertManager()
        metrics = {
            "error_rate": 0.10,  # 10% > 5% threshold
            "p95_response_time": 1.0
        }
        
        alerts = manager.check_thresholds(metrics)
        
        assert len(alerts) == 1
        assert alerts[0]["type"] == "high_error_rate"
        assert alerts[0]["severity"] == "warning"
    
    def test_check_thresholds_slow_response(self):
        """Test threshold check with slow response time"""
        manager = AlertManager()
        metrics = {
            "error_rate": 0.01,
            "p95_response_time": 3.0  # 3s > 2s threshold
        }
        
        alerts = manager.check_thresholds(metrics)
        
        assert len(alerts) == 1
        assert alerts[0]["type"] == "slow_response_time"
    
    def test_send_alert(self):
        """Test sending alert"""
        manager = AlertManager()
        alert = {
            "severity": "warning",
            "type": "test_alert",
            "message": "Test message"
        }
        
        manager.send_alert(alert)
        
        assert len(manager.alerts) == 1
        assert manager.alerts[0] == alert
    
    def test_alerts_limit(self):
        """Test alerts list is limited to 100"""
        manager = AlertManager()
        
        for i in range(150):
            manager.send_alert({"type": f"alert_{i}"})
        
        assert len(manager.alerts) == 100
    
    def test_get_recent_alerts(self):
        """Test getting recent alerts"""
        manager = AlertManager()
        
        for i in range(20):
            manager.send_alert({"type": f"alert_{i}"})
        
        recent = manager.get_recent_alerts(limit=5)
        
        assert len(recent) == 5
        assert recent[-1]["type"] == "alert_19"


class TestGlobalInstances:
    """Test global instances"""
    
    def test_metrics_collector_instance(self):
        """Test global metrics collector exists"""
        assert metrics_collector is not None
        assert isinstance(metrics_collector, MetricsCollector)
    
    def test_health_checker_instance(self):
        """Test global health checker exists"""
        assert health_checker is not None
        assert isinstance(health_checker, HealthChecker)
    
    def test_alert_manager_instance(self):
        """Test global alert manager exists"""
        assert alert_manager is not None
        assert isinstance(alert_manager, AlertManager)
