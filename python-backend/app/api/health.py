"""
SmartSpec Pro - Health Check API
"""

from fastapi import APIRouter, status, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import structlog

from app.core.config import settings
from app.core.database import get_db
from app.core.cache import cache_manager
from app.llm_proxy.unified_client import unified_client

logger = structlog.get_logger()

router = APIRouter()


class ServiceStatus(BaseModel):
    """Service status"""
    name: str
    status: str  # healthy, degraded, unhealthy
    message: str = ""
    latency_ms: float = 0


class HealthResponse(BaseModel):
    """Health check response"""
    status: str  # healthy, degraded, unhealthy
    timestamp: datetime
    version: str
    services: list[ServiceStatus]


async def check_database(db: AsyncSession) -> ServiceStatus:
    """Check database connection"""
    try:
        start = datetime.utcnow()
        await db.execute(text("SELECT 1"))
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        return ServiceStatus(
            name="database",
            status="healthy",
            message="Connected",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))
        return ServiceStatus(
            name="database",
            status="unhealthy",
            message=f"Connection failed: {str(e)}"
        )


async def check_redis() -> ServiceStatus:
    """Check Redis connection"""
    try:
        if not cache_manager.redis:
            return ServiceStatus(
                name="redis",
                status="degraded",
                message="Not initialized (using memory cache)"
            )
        
        start = datetime.utcnow()
        await cache_manager.redis.ping()
        latency = (datetime.utcnow() - start).total_seconds() * 1000
        
        return ServiceStatus(
            name="redis",
            status="healthy",
            message="Connected",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error("redis_health_check_failed", error=str(e))
        return ServiceStatus(
            name="redis",
            status="degraded",
            message=f"Connection failed (using memory cache): {str(e)}"
        )


async def check_llm_proxy() -> ServiceStatus:
    """Check LLM Proxy status"""
    try:
        if not unified_client._initialized:
            return ServiceStatus(
                name="llm_proxy",
                status="degraded",
                message="Not initialized"
            )
        
        # Check if any provider is available
        has_openrouter = unified_client.openrouter_client is not None
        has_direct = len(unified_client.direct_providers) > 0
        
        if has_openrouter or has_direct:
            providers = []
            if has_openrouter:
                providers.append("openrouter")
            providers.extend(unified_client.direct_providers.keys())
            
            return ServiceStatus(
                name="llm_proxy",
                status="healthy",
                message=f"Available providers: {', '.join(providers)}"
            )
        else:
            return ServiceStatus(
                name="llm_proxy",
                status="unhealthy",
                message="No providers available"
            )
    except Exception as e:
        logger.error("llm_proxy_health_check_failed", error=str(e))
        return ServiceStatus(
            name="llm_proxy",
            status="unhealthy",
            message=f"Check failed: {str(e)}"
        )


@router.get("", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Comprehensive health check endpoint
    
    Checks:
    - Database connection
    - Redis connection
    - LLM Proxy status
    
    Returns:
    - 200 if all services are healthy
    - 503 if any critical service is unhealthy
    - 200 with degraded status if non-critical services are down
    """
    
    # Check all services
    services = []
    
    # Database (critical)
    db_status = await check_database(db)
    services.append(db_status)
    
    # Redis (non-critical, has fallback)
    redis_status = await check_redis()
    services.append(redis_status)
    
    # LLM Proxy (critical)
    llm_status = await check_llm_proxy()
    services.append(llm_status)
    
    # Determine overall status
    unhealthy_count = sum(1 for s in services if s.status == "unhealthy")
    degraded_count = sum(1 for s in services if s.status == "degraded")
    
    if unhealthy_count > 0:
        # Check if critical services are unhealthy
        critical_unhealthy = any(
            s.status == "unhealthy" and s.name in ["database", "llm_proxy"]
            for s in services
        )
        
        if critical_unhealthy:
            overall_status = "unhealthy"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        else:
            overall_status = "degraded"
            status_code = status.HTTP_200_OK
    elif degraded_count > 0:
        overall_status = "degraded"
        status_code = status.HTTP_200_OK
    else:
        overall_status = "healthy"
        status_code = status.HTTP_200_OK
    
    response = HealthResponse(
        status=overall_status,
        timestamp=datetime.utcnow(),
        version=settings.APP_VERSION,
        services=services
    )
    
    logger.info(
        "health_check",
        status=overall_status,
        services={s.name: s.status for s in services}
    )
    
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode="json")
    )


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """
    Readiness check endpoint
    
    Returns 200 if the application is ready to serve traffic
    Returns 503 if not ready
    
    Used by Kubernetes readiness probes
    """
    
    try:
        # Check database
        await db.execute(text("SELECT 1"))
        
        # Check LLM Proxy
        if not unified_client._initialized:
            raise Exception("LLM Proxy not initialized")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "ready",
                "timestamp": datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error("readiness_check_failed", error=str(e))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get("/live")
async def liveness_check():
    """
    Liveness check endpoint
    
    Always returns 200 if the application is running
    
    Used by Kubernetes liveness probes
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }
