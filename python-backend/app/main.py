"""
SmartSpec Pro - Python Backend
Main FastAPI Application
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
import structlog
from dotenv import load_dotenv

# R16.1: Load environment variables from .env file
load_dotenv()

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import setup_middleware
from app.core.database import init_db, close_db
from app.core.config_validator import ConfigValidator
from app.core.openapi import setup_openapi
from app.core.exceptions import register_exception_handlers

from app.api import (
    health,
    llm_proxy,
    orchestrator,
    workflows,
    autopilot,
    auth,
    credits,
    payments,
    dashboard,
    users,
    admin,
    llm_v1,
    llm_features,
    analytics,
    api_keys,
    rate_limits,
    admin_impersonation,
    system_health,
    audit_logs,
    support_tickets,
    openai_compat,
    kilo_cli,
    kilo_pty,
    kilo_media,
    ws_ticket,
)
from app.api.v1 import skills, auth_generator

# Setup logging
setup_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting SmartSpec Pro Python Backend", version=settings.APP_VERSION)

    # Validate configuration
    try:
        ConfigValidator.validate_and_report()
    except Exception as e:
        logger.error("Configuration validation failed", error=str(e))
        # Continue anyway in development
        if not settings.DEBUG:
            raise

    # Initialize services
    try:
        await init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.warning("Database initialization failed", error=str(e))

    # Initialize Redis
    try:
        from app.core.cache import cache_manager

        await cache_manager.initialize()
        logger.info("Redis initialized successfully")
    except Exception as e:
        logger.warning("Redis initialization failed", error=str(e))
        if not settings.DEBUG:
            raise

    # Initialize LLM Proxy
    try:
        from app.llm_proxy.unified_client import unified_client

        await unified_client.initialize()
        logger.info("LLM Proxy initialized successfully")
    except Exception as e:
        logger.warning("LLM Proxy initialization failed", error=str(e))

    logger.info("Application startup complete")

    yield

    # Cleanup
    logger.info("Shutting down SmartSpec Pro Python Backend")

    # Close Redis connection
    try:
        from app.core.cache import cache_manager

        await cache_manager.close()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.warning("Redis cleanup failed", error=str(e))
    try:
        await close_db()
        logger.info("Database connection closed")
    except Exception as e:
        logger.warning("Database cleanup failed", error=str(e))


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="SmartSpec Pro Python Backend - Autopilot System for Production-Grade SaaS Generation",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Setup middleware
setup_middleware(app)

# Setup OpenAPI documentation
setup_openapi(app)

# Register custom exception handlers
register_exception_handlers(app)

# Include routers
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(auth.router, tags=["Authentication"])
app.include_router(credits.router, tags=["Credits"])
app.include_router(payments.router, prefix="/api", tags=["Payments"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(users.router, tags=["Users"])
app.include_router(admin.router, tags=["Admin"])
app.include_router(llm_proxy.router, prefix="/api/v1/llm", tags=["LLM Proxy"])
app.include_router(llm_v1.router, tags=["LLM v1"])
app.include_router(llm_features.router, tags=["LLM Features"])
app.include_router(analytics.router, tags=["Analytics & Notifications"])
app.include_router(api_keys.router, tags=["API Keys"])
app.include_router(rate_limits.router, tags=["Rate Limits"])
app.include_router(admin_impersonation.router, tags=["Admin - Impersonation"])
app.include_router(system_health.router, tags=["System Health"])
app.include_router(audit_logs.router, tags=["Audit Logs"])
app.include_router(support_tickets.router, tags=["Support Tickets"])
app.include_router(orchestrator.router, prefix="/api/v1/orchestrator", tags=["Orchestrator"])
app.include_router(workflows.router, prefix="/api/v1/workflows", tags=["Workflows"])
app.include_router(autopilot.router, prefix="/api/v1/autopilot", tags=["Autopilot"])
app.include_router(skills.router, prefix="/api/v1", tags=["Skills"])
app.include_router(auth_generator.router, prefix="/api/v1", tags=["Auth Generator"])

# OpenAI-compatible surface for desktop/runner/proxy (forwarded to SmartSpecWeb gateway)
app.include_router(openai_compat.router)
app.include_router(kilo_cli.router)
app.include_router(kilo_pty.router)
app.include_router(kilo_media.router)
app.include_router(ws_ticket.router)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs" if settings.DEBUG else None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
