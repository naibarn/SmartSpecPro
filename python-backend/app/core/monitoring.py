"""
Monitoring and Metrics
Application monitoring and performance tracking
"""

import time
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import structlog

logger = structlog.get_logger()


class MetricsCollector:
    """
    Metrics Collector
    
    Collects and aggregates application metrics
    """
    
    def __init__(self):
        self.metrics = defaultdict(lambda: {
            "count": 0,
            "total_time": 0,
            "errors": 0,
            "last_updated": None
        })
        self.request_times = []
        self.error_log = []
    
    def record_request(self, endpoint: str, method: str, duration: float, status_code: int):
        """Record API request metrics"""
        key = f"{method}:{endpoint}"
        self.metrics[key]["count"] += 1
        self.metrics[key]["total_time"] += duration
        self.metrics[key]["last_updated"] = datetime.utcnow()
        
        if status_code >= 400:
            self.metrics[key]["errors"] += 1
        
        # Keep last 1000 request times for percentile calculation
        self.request_times.append(duration)
        if len(self.request_times) > 1000:
            self.request_times.pop(0)
    
    def record_error(self, error_type: str, error_message: str, context: Dict[str, Any]):
        """Record error"""
        self.error_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": error_type,
            "message": error_message,
            "context": context
        })
        
        # Keep last 100 errors
        if len(self.error_log) > 100:
            self.error_log.pop(0)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics"""
        total_requests = sum(m["count"] for m in self.metrics.values())
        total_errors = sum(m["errors"] for m in self.metrics.values())
        
        # Calculate percentiles
        if self.request_times:
            sorted_times = sorted(self.request_times)
            p50 = sorted_times[len(sorted_times) // 2]
            p95 = sorted_times[int(len(sorted_times) * 0.95)]
            p99 = sorted_times[int(len(sorted_times) * 0.99)]
        else:
            p50 = p95 = p99 = 0
        
        return {
            "total_requests": total_requests,
            "total_errors": total_errors,
            "error_rate": total_errors / total_requests if total_requests > 0 else 0,
            "avg_response_time": sum(self.request_times) / len(self.request_times) if self.request_times else 0,
            "p50_response_time": p50,
            "p95_response_time": p95,
            "p99_response_time": p99,
            "endpoints": dict(self.metrics),
            "recent_errors": self.error_log[-10:]
        }
    
    def reset(self):
        """Reset metrics"""
        self.metrics.clear()
        self.request_times.clear()
        self.error_log.clear()


# Global metrics collector
metrics_collector = MetricsCollector()


class PerformanceMonitor:
    """
    Performance Monitor
    
    Context manager for monitoring code performance
    """
    
    def __init__(self, operation: str):
        self.operation = operation
        self.start_time = None
        self.end_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        duration = self.end_time - self.start_time
        
        if exc_type is not None:
            logger.error(
                "operation_failed",
                operation=self.operation,
                duration=duration,
                error=str(exc_val)
            )
            metrics_collector.record_error(
                error_type=exc_type.__name__,
                error_message=str(exc_val),
                context={"operation": self.operation, "duration": duration}
            )
        else:
            logger.info(
                "operation_completed",
                operation=self.operation,
                duration=duration
            )
    
    @property
    def duration(self) -> Optional[float]:
        """Get operation duration"""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return None


class HealthChecker:
    """
    Health Checker
    
    Checks health of various system components
    """
    
    def __init__(self):
        self.checks = {}
    
    async def check_database(self, db) -> bool:
        """Check database connectivity"""
        try:
            await db.execute("SELECT 1")
            return True
        except Exception as e:
            logger.error("database_health_check_failed", error=str(e))
            return False
    
    async def check_redis(self, redis) -> bool:
        """Check Redis connectivity"""
        try:
            await redis.ping()
            return True
        except Exception as e:
            logger.error("redis_health_check_failed", error=str(e))
            return False
    
    def check_memory(self) -> Dict[str, Any]:
        """Check memory usage"""
        import psutil
        memory = psutil.virtual_memory()
        return {
            "total": memory.total,
            "available": memory.available,
            "percent": memory.percent,
            "used": memory.used
        }
    
    def check_cpu(self) -> Dict[str, Any]:
        """Check CPU usage"""
        import psutil
        cpu_percent = psutil.cpu_percent(interval=1)
        return {
            "percent": cpu_percent,
            "count": psutil.cpu_count()
        }
    
    def check_disk(self) -> Dict[str, Any]:
        """Check disk usage"""
        import psutil
        disk = psutil.disk_usage('/')
        return {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": disk.percent
        }
    
    async def get_health_status(self, db=None, redis=None) -> Dict[str, Any]:
        """Get overall health status"""
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {}
        }
        
        # Database check
        if db:
            db_healthy = await self.check_database(db)
            health["checks"]["database"] = {
                "status": "healthy" if db_healthy else "unhealthy"
            }
            if not db_healthy:
                health["status"] = "degraded"
        
        # Redis check (if available)
        if redis:
            redis_healthy = await self.check_redis(redis)
            health["checks"]["redis"] = {
                "status": "healthy" if redis_healthy else "unhealthy"
            }
            if not redis_healthy:
                health["status"] = "degraded"
        
        # System checks
        try:
            health["checks"]["memory"] = self.check_memory()
            health["checks"]["cpu"] = self.check_cpu()
            health["checks"]["disk"] = self.check_disk()
        except Exception as e:
            logger.error("system_health_check_failed", error=str(e))
        
        return health


# Global health checker
health_checker = HealthChecker()


class AlertManager:
    """
    Alert Manager
    
    Manages alerts and notifications for critical events
    """
    
    def __init__(self):
        self.alerts = []
        self.alert_thresholds = {
            "error_rate": 0.05,  # 5%
            "response_time_p95": 2.0,  # 2 seconds
            "memory_percent": 90,  # 90%
            "cpu_percent": 90,  # 90%
            "disk_percent": 90  # 90%
        }
    
    def check_thresholds(self, metrics: Dict[str, Any]) -> list:
        """Check if any thresholds are exceeded"""
        alerts = []
        
        # Error rate
        if metrics.get("error_rate", 0) > self.alert_thresholds["error_rate"]:
            alerts.append({
                "severity": "warning",
                "type": "high_error_rate",
                "message": f"Error rate {metrics['error_rate']:.2%} exceeds threshold {self.alert_thresholds['error_rate']:.2%}",
                "timestamp": datetime.utcnow().isoformat()
            })
        
        # Response time
        if metrics.get("p95_response_time", 0) > self.alert_thresholds["response_time_p95"]:
            alerts.append({
                "severity": "warning",
                "type": "slow_response_time",
                "message": f"P95 response time {metrics['p95_response_time']:.2f}s exceeds threshold {self.alert_thresholds['response_time_p95']}s",
                "timestamp": datetime.utcnow().isoformat()
            })
        
        return alerts
    
    def send_alert(self, alert: Dict[str, Any]):
        """Send alert (placeholder for actual implementation)"""
        logger.warning("alert_triggered", **alert)
        self.alerts.append(alert)
        
        # Keep last 100 alerts
        if len(self.alerts) > 100:
            self.alerts.pop(0)
    
    def get_recent_alerts(self, limit: int = 10) -> list:
        """Get recent alerts"""
        return self.alerts[-limit:]


# Global alert manager
alert_manager = AlertManager()
