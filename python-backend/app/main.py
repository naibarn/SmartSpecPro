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
    admin_provider_config,
    internal_provider,
    artifacts,
    control_plane_proxy,  # Control Plane Proxy for desktop-app
    opencode_gateway,  # Phase 2: OpenCode Gateway API
    tenants,  # Phase 3: Multi-tenancy
    tenant_current,  # Phase 3: Current tenant API for frontend
    rbac,  # Phase 3: RBAC
    approvals,  # Phase 3: Approval Gates
    csrf,  # CSRF Protection
    oauth,  # OAuth Social Login
    telegram_webhook,  # Telegram bot webhook for account linking
    internal_mcp,  # Internal MCP tools API (Google Drive)
)
from app.api.v1 import (
    skills,
    auth_generator,
    media_generation,
    assets,
    admin_skills,
    prompt_enhancement,
    skill_customization,
    media_advanced,
    webhooks,
)

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

        # Seed default admin user and tenant on first startup
        try:
            from app.core.seed import run_seed

            await run_seed()
            logger.info("Database seeding completed")
        except Exception as seed_error:
            logger.warning("Database seeding skipped", error=str(seed_error))

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
        from app.core.database import AsyncSessionLocal

        # Create database session to load provider configs
        async with AsyncSessionLocal() as session:
            await unified_client.initialize(db=session)
        logger.info("LLM Proxy initialized successfully")
    except Exception as e:
        logger.warning("LLM Proxy initialization failed", error=str(e))

    # Initialize PostgreSQL Checkpointer (for LangGraph workflow state persistence)
    try:
        from app.core.checkpointer import get_postgres_checkpointer

        await get_postgres_checkpointer()
        logger.info("PostgreSQL checkpointer initialized successfully")
    except Exception as e:
        logger.warning("PostgreSQL checkpointer initialization failed (workflows will use in-memory)", error=str(e))

    logger.info("Application startup complete")

    yield

    # Cleanup
    logger.info("Shutting down SmartSpec Pro Python Backend")

    # Close checkpointer connection pool
    try:
        from app.core.checkpointer import cleanup_checkpointers

        await cleanup_checkpointers()
        logger.info("Checkpointer connection pool closed")
    except Exception as e:
        logger.warning("Checkpointer cleanup failed", error=str(e))

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
app.include_router(csrf.router, tags=["CSRF Protection"])
app.include_router(auth.router, tags=["Authentication"])
app.include_router(credits.router, tags=["Credits"])
app.include_router(payments.router, prefix="/api", tags=["Payments"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(users.router, tags=["Users"])
app.include_router(admin.router, tags=["Admin"])
app.include_router(admin_provider_config.router, tags=["Admin - Provider Config"])
app.include_router(internal_provider.router, tags=["Internal - Provider"])
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
app.include_router(admin_skills.router, prefix="/api/v1", tags=["Admin - Skills"])
app.include_router(auth_generator.router, prefix="/api/v1", tags=["Auth Generator"])
app.include_router(media_generation.router, prefix="/api/v1/media", tags=["Media Generation"])
app.include_router(media_advanced.router, prefix="/api/v1/media/tasks", tags=["Media Advanced"])
app.include_router(webhooks.router, prefix="/api/v1", tags=["Webhooks"])
app.include_router(telegram_webhook.router, prefix="/webhook", tags=["Telegram Webhook"])
app.include_router(prompt_enhancement.router, prefix="/api/v1/prompt", tags=["Prompt Enhancement"])
app.include_router(skill_customization.router, prefix="/api/v1", tags=["Skill Customization"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Asset Management"])

# Media Job processing (FFmpeg worker bridge)
from app.api.v1 import media_jobs as media_jobs_api
app.include_router(media_jobs_api.router, prefix="/api/v1", tags=["Media Jobs"])

# OpenAI-compatible surface for desktop/runner/proxy (forwarded to SmartSpecWeb gateway)
app.include_router(openai_compat.router)
app.include_router(kilo_cli.router)
app.include_router(kilo_pty.router)
app.include_router(kilo_media.router)
app.include_router(ws_ticket.router)
app.include_router(artifacts.router)
app.include_router(control_plane_proxy.router)

# Phase 2: OpenCode Gateway for external tools (OpenCode CLI, etc.)
app.include_router(opencode_gateway.router, tags=["OpenCode Gateway"])

# Phase 3: SaaS Features
app.include_router(tenants.router, tags=["Tenants"])
app.include_router(tenant_current.router, tags=["Tenant Current"])
app.include_router(rbac.router, tags=["RBAC"])
app.include_router(approvals.router, tags=["Approvals"])
app.include_router(oauth.router, tags=["OAuth"])
app.include_router(internal_mcp.router, tags=["Internal MCP"])

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
