"""
System Health Service
Monitor system health and service status
"""

import psutil
import time
import httpx
from typing import Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import redis.asyncio as redis

from app.core.config import settings


class HealthService:
    """Service for system health monitoring"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_system_health(self) -> Dict[str, Any]:
        """
        Get overall system health status
        
        Returns:
            Comprehensive health status
        """
        start_time = time.time()
        
        # Check all services
        database_health = await self._check_database()
        redis_health = await self._check_redis()
        disk_health = self._check_disk()
        memory_health = self._check_memory()
        cpu_health = self._check_cpu()
        
        # Determine overall status
        all_checks = [
            database_health["status"],
            redis_health["status"],
            disk_health["status"],
            memory_health["status"],
            cpu_health["status"]
        ]
        
        if all(status == "healthy" for status in all_checks):
            overall_status = "healthy"
        elif any(status == "critical" for status in all_checks):
            overall_status = "critical"
        else:
            overall_status = "degraded"
        
        response_time = (time.time() - start_time) * 1000  # ms
        
        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat(),
            "response_time_ms": round(response_time, 2),
            "services": {
                "database": database_health,
                "redis": redis_health,
                "disk": disk_health,
                "memory": memory_health,
                "cpu": cpu_health
            }
        }
    
    async def _check_database(self) -> Dict[str, Any]:
        """Check database health"""
        try:
            start_time = time.time()
            
            # Simple query to check connection
            result = await self.db.execute(text("SELECT 1"))
            result.scalar()
            
            response_time = (time.time() - start_time) * 1000
            
            # Check connection pool status
            pool_size = self.db.bind.pool.size() if hasattr(self.db.bind, 'pool') else None
            pool_checked_out = self.db.bind.pool.checked_out_connections() if hasattr(self.db.bind, 'pool') else None
            
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "pool_size": pool_size,
                "connections_in_use": pool_checked_out,
                "message": "Database is operational"
            }
        except Exception as e:
            return {
                "status": "critical",
                "error": str(e),
                "message": "Database connection failed"
            }
    
    async def _check_redis(self) -> Dict[str, Any]:
        """Check Redis health"""
        try:
            start_time = time.time()
            
            redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            
            # Ping Redis
            await redis_client.ping()
            
            # Get info
            info = await redis_client.info()
            
            response_time = (time.time() - start_time) * 1000
            
            await redis_client.close()
            
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
                "uptime_seconds": info.get("uptime_in_seconds", 0),
                "message": "Redis is operational"
            }
        except Exception as e:
            return {
                "status": "critical",
                "error": str(e),
                "message": "Redis connection failed"
            }
    
    def _check_disk(self) -> Dict[str, Any]:
        """Check disk usage"""
        try:
            disk = psutil.disk_usage('/')
            
            percent_used = disk.percent
            
            if percent_used >= 90:
                status = "critical"
                message = "Disk usage critical"
            elif percent_used >= 80:
                status = "degraded"
                message = "Disk usage high"
            else:
                status = "healthy"
                message = "Disk usage normal"
            
            return {
                "status": status,
                "total_gb": round(disk.total / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "percent_used": percent_used,
                "message": message
            }
        except Exception as e:
            return {
                "status": "unknown",
                "error": str(e),
                "message": "Could not check disk usage"
            }
    
    def _check_memory(self) -> Dict[str, Any]:
        """Check memory usage"""
        try:
            memory = psutil.virtual_memory()
            
            percent_used = memory.percent
            
            if percent_used >= 90:
                status = "critical"
                message = "Memory usage critical"
            elif percent_used >= 80:
                status = "degraded"
                message = "Memory usage high"
            else:
                status = "healthy"
                message = "Memory usage normal"
            
            return {
                "status": status,
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "percent_used": percent_used,
                "message": message
            }
        except Exception as e:
            return {
                "status": "unknown",
                "error": str(e),
                "message": "Could not check memory usage"
            }
    
    def _check_cpu(self) -> Dict[str, Any]:
        """Check CPU usage"""
        try:
            # Get CPU usage over 1 second
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            if cpu_percent >= 90:
                status = "critical"
                message = "CPU usage critical"
            elif cpu_percent >= 80:
                status = "degraded"
                message = "CPU usage high"
            else:
                status = "healthy"
                message = "CPU usage normal"
            
            return {
                "status": status,
                "percent_used": cpu_percent,
                "cpu_count": cpu_count,
                "message": message
            }
        except Exception as e:
            return {
                "status": "unknown",
                "error": str(e),
                "message": "Could not check CPU usage"
            }
    
    async def get_llm_providers_health(self) -> Dict[str, Any]:
        """
        Check health of LLM providers
        
        Returns:
            Health status of all LLM providers
        """
        providers = {
            "openai": "https://api.openai.com/v1/models",
            "anthropic": "https://api.anthropic.com/v1/messages",
            "google": "https://generativelanguage.googleapis.com/v1/models",
        }
        
        results = {}
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            for provider, url in providers.items():
                try:
                    start_time = time.time()
                    response = await client.get(url, headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}"
                    })
                    response_time = (time.time() - start_time) * 1000
                    
                    if response.status_code < 500:
                        status = "healthy"
                        message = "Provider is operational"
                    else:
                        status = "degraded"
                        message = f"Provider returned {response.status_code}"
                    
                    results[provider] = {
                        "status": status,
                        "response_time_ms": round(response_time, 2),
                        "status_code": response.status_code,
                        "message": message
                    }
                except Exception as e:
                    results[provider] = {
                        "status": "critical",
                        "error": str(e),
                        "message": "Provider unreachable"
                    }
        
        return results
    
    async def get_metrics(self) -> Dict[str, Any]:
        """
        Get detailed system metrics
        
        Returns:
            Detailed metrics for monitoring
        """
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "system": {
                "cpu": {
                    "percent": psutil.cpu_percent(interval=1),
                    "count": psutil.cpu_count(),
                    "per_cpu": psutil.cpu_percent(interval=1, percpu=True)
                },
                "memory": {
                    "total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
                    "used_gb": round(psutil.virtual_memory().used / (1024**3), 2),
                    "percent": psutil.virtual_memory().percent
                },
                "disk": {
                    "total_gb": round(psutil.disk_usage('/').total / (1024**3), 2),
                    "used_gb": round(psutil.disk_usage('/').used / (1024**3), 2),
                    "percent": psutil.disk_usage('/').percent
                },
                "network": {
                    "bytes_sent": psutil.net_io_counters().bytes_sent,
                    "bytes_recv": psutil.net_io_counters().bytes_recv,
                    "packets_sent": psutil.net_io_counters().packets_sent,
                    "packets_recv": psutil.net_io_counters().packets_recv
                }
            },
            "process": {
                "cpu_percent": psutil.Process().cpu_percent(interval=1),
                "memory_mb": round(psutil.Process().memory_info().rss / (1024**2), 2),
                "num_threads": psutil.Process().num_threads(),
                "num_fds": psutil.Process().num_fds() if hasattr(psutil.Process(), 'num_fds') else None
            }
        }
    
    async def get_uptime(self) -> Dict[str, Any]:
        """
        Get system uptime
        
        Returns:
            System uptime information
        """
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime_seconds = (datetime.now() - boot_time).total_seconds()
        
        return {
            "boot_time": boot_time.isoformat(),
            "uptime_seconds": int(uptime_seconds),
            "uptime_days": round(uptime_seconds / 86400, 2),
            "current_time": datetime.utcnow().isoformat()
        }
