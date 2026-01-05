"""
System Health API
Endpoints for system health monitoring
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.health_service import HealthService


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Middleware for admin check
# ============================================================================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============================================================================
# Health Check Endpoints
# ============================================================================

@router.get("/health/system")
async def get_system_health(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get overall system health status
    
    **Admin Only**
    
    Returns comprehensive health status including:
    - Database connectivity
    - Redis connectivity
    - Disk usage
    - Memory usage
    - CPU usage
    
    **Status Values:**
    - `healthy`: All systems operational
    - `degraded`: Some systems experiencing issues
    - `critical`: Critical systems down
    
    **Example Response:**
    ```json
    {
        "status": "healthy",
        "timestamp": "2024-01-15T10:30:00",
        "response_time_ms": 45.2,
        "services": {
            "database": {
                "status": "healthy",
                "response_time_ms": 12.5,
                "pool_size": 10,
                "connections_in_use": 3
            },
            "redis": {
                "status": "healthy",
                "response_time_ms": 5.3,
                "connected_clients": 2,
                "used_memory_mb": 15.2
            },
            "disk": {
                "status": "healthy",
                "total_gb": 100.0,
                "used_gb": 45.2,
                "percent_used": 45.2
            },
            "memory": {
                "status": "healthy",
                "total_gb": 16.0,
                "used_gb": 8.5,
                "percent_used": 53.1
            },
            "cpu": {
                "status": "healthy",
                "percent_used": 25.3,
                "cpu_count": 8
            }
        }
    }
    ```
    """
    service = HealthService(db)
    
    health = await service.get_system_health()
    
    return health


@router.get("/health/llm-providers")
async def get_llm_providers_health(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get health status of LLM providers
    
    **Admin Only**
    
    Checks connectivity and response times for all configured LLM providers:
    - OpenAI
    - Anthropic
    - Google
    - Groq
    - Others
    
    **Useful for:**
    - Monitoring provider availability
    - Detecting provider outages
    - Performance monitoring
    """
    service = HealthService(db)
    
    providers_health = await service.get_llm_providers_health()
    
    return {
        "timestamp": service.db.bind.pool.size() if hasattr(service.db.bind, 'pool') else None,
        "providers": providers_health,
        "total_providers": len(providers_health)
    }


@router.get("/health/metrics")
async def get_system_metrics(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get detailed system metrics
    
    **Admin Only**
    
    Returns detailed metrics for monitoring and alerting:
    - CPU usage (overall and per-core)
    - Memory usage (total, used, available)
    - Disk usage (total, used, free)
    - Network I/O (bytes sent/received)
    - Process metrics (CPU, memory, threads)
    
    **Use Cases:**
    - Prometheus/Grafana integration
    - Custom monitoring dashboards
    - Performance analysis
    - Capacity planning
    """
    service = HealthService(db)
    
    metrics = await service.get_metrics()
    
    return metrics


@router.get("/health/uptime")
async def get_system_uptime(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get system uptime
    
    **Admin Only**
    
    Returns system boot time and uptime information.
    """
    service = HealthService(db)
    
    uptime = await service.get_uptime()
    
    return uptime


# ============================================================================
# Public Health Check (No Auth Required)
# ============================================================================

@router.get("/health")
async def health_check():
    """
    Basic health check endpoint
    
    **Public** - No authentication required
    
    Returns simple health status for load balancers and monitoring tools.
    
    **Response:**
    ```json
    {
        "status": "ok",
        "timestamp": "2024-01-15T10:30:00"
    }
    ```
    """
    from datetime import datetime
    
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "SmartSpec Pro API"
    }


@router.get("/health/ready")
async def readiness_check(db = Depends(get_db)):
    """
    Readiness check endpoint
    
    **Public** - No authentication required
    
    Checks if the service is ready to accept requests.
    Used by Kubernetes and other orchestration systems.
    
    **Checks:**
    - Database connectivity
    
    **Response:**
    - 200 OK: Service is ready
    - 503 Service Unavailable: Service is not ready
    """
    service = HealthService(db)
    
    # Check database
    db_health = await service._check_database()
    
    if db_health["status"] == "healthy":
        return {
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat()
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready"
        )


@router.get("/health/live")
async def liveness_check():
    """
    Liveness check endpoint
    
    **Public** - No authentication required
    
    Checks if the service is alive and responding.
    Used by Kubernetes and other orchestration systems.
    
    **Response:**
    - 200 OK: Service is alive
    """
    from datetime import datetime
    
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }
