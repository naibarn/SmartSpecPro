"""
SmartAIHub - Current Tenant API
Returns the current tenant information for the frontend
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from sqlalchemy import text

from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tenant", tags=["Tenant"])


class TenantTheme(BaseModel):
    primaryColor: str = "#6366f1"
    secondaryColor: str = "#8b5cf6"
    accentColor: str = "#ec4899"
    backgroundColor: str = "#ffffff"
    textColor: str = "#1f2937"
    fontFamily: str = "Plus Jakarta Sans, sans-serif"
    headingFont: str = "Plus Jakarta Sans, sans-serif"
    layout: str = "modern"
    headerStyle: str = "blur"
    footerStyle: str = "minimal"
    buttonStyle: str = "rounded"
    cardStyle: str = "elevated"
    customCss: Optional[str] = None


class TenantSeo(BaseModel):
    defaultTitle: str = "SmartAIHub"
    defaultDescription: str = "AI-Powered Code Generation Platform"
    defaultKeywords: List[str] = ["AI", "code generation", "SaaS"]
    ogImage: Optional[str] = None
    twitterCard: str = "summary_large_image"
    aiContext: Optional[str] = None
    aiKeyFacts: Optional[List[str]] = None
    geoTargeting: Optional[Dict[str, str]] = None


class TenantContactInfo(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    socialLinks: Optional[Dict[str, str]] = None


class TenantData(BaseModel):
    id: str
    slug: str
    name: str
    primaryDomain: str
    logoUrl: Optional[str] = None
    faviconUrl: Optional[str] = None
    theme: TenantTheme = TenantTheme()
    seo: TenantSeo = TenantSeo()
    settings: Dict[str, Any] = {}
    contactInfo: Optional[TenantContactInfo] = None


class TenantResponse(BaseModel):
    tenant: TenantData


@router.get("/current", response_model=TenantResponse)
async def get_current_tenant(request: Request):
    """
    Get the current tenant information based on the request domain.

    This endpoint is used by the frontend to load tenant-specific
    configuration, theme, and SEO settings.
    """
    # Get the host from the request
    host = request.headers.get("host", "localhost")
    # Remove port if present
    domain = host.split(":")[0]

    # Try to find tenant from database
    try:
        async with AsyncSessionLocal() as db:
            # First try to find by domain match
            result = await db.execute(
                text("""
                    SELECT id, name, slug, "primaryDomain", "logoUrl", "faviconUrl",
                           settings, status, plan
                    FROM tenants
                    WHERE "isActive" = true
                    AND (
                        "primaryDomain" = :domain
                        OR domains::text LIKE :domain_pattern
                        OR :domain = 'localhost'
                        OR :domain LIKE '192.168.%'
                        OR :domain LIKE '10.%'
                        OR :domain LIKE '172.%'
                    )
                    LIMIT 1
                """),
                {"domain": domain, "domain_pattern": f'%"{domain}"%'}
            )
            row = result.fetchone()

            if row:
                tenant_data = TenantData(
                    id=row[0],  # id
                    name=row[1],  # name
                    slug=row[2],  # slug
                    primaryDomain=row[3] or domain,  # primaryDomain
                    logoUrl=row[4],  # logoUrl
                    faviconUrl=row[5],  # faviconUrl
                    settings=row[6] if row[6] else {},  # settings
                    theme=TenantTheme(),
                    seo=TenantSeo(
                        defaultTitle=f"{row[1]} - SmartAIHub",
                        defaultDescription=f"Welcome to {row[1]}",
                    ),
                )
                return TenantResponse(tenant=tenant_data)
    except Exception as e:
        # Log error but continue with default tenant
        logger.error("tenant_current_database_error", extra={"error_type": type(e).__name__})

    # Return default tenant if not found
    default_tenant = TenantData(
        id="default",
        slug="smartaihub",
        name="SmartAIHub",
        primaryDomain=domain,
        theme=TenantTheme(),
        seo=TenantSeo(),
    )

    return TenantResponse(tenant=default_tenant)


class ThemePreset(BaseModel):
    """Theme preset for quick theming"""
    id: str
    name: str
    theme: TenantTheme
    preview: Optional[str] = None


@router.get("/theme-presets")
async def get_theme_presets():
    """
    Get available theme presets for tenant customization.
    """
    presets = [
        ThemePreset(
            id="default",
            name="Default",
            theme=TenantTheme(),
            preview="/themes/default.png"
        ),
        ThemePreset(
            id="dark",
            name="Dark Mode",
            theme=TenantTheme(
                primaryColor="#8b5cf6",
                secondaryColor="#6366f1",
                accentColor="#ec4899",
                backgroundColor="#0f172a",
                textColor="#f1f5f9",
            ),
            preview="/themes/dark.png"
        ),
        ThemePreset(
            id="ocean",
            name="Ocean Blue",
            theme=TenantTheme(
                primaryColor="#0ea5e9",
                secondaryColor="#06b6d4",
                accentColor="#14b8a6",
                backgroundColor="#ffffff",
                textColor="#0f172a",
            ),
            preview="/themes/ocean.png"
        ),
        ThemePreset(
            id="forest",
            name="Forest Green",
            theme=TenantTheme(
                primaryColor="#22c55e",
                secondaryColor="#16a34a",
                accentColor="#84cc16",
                backgroundColor="#ffffff",
                textColor="#1f2937",
            ),
            preview="/themes/forest.png"
        ),
        ThemePreset(
            id="sunset",
            name="Sunset Orange",
            theme=TenantTheme(
                primaryColor="#f97316",
                secondaryColor="#ef4444",
                accentColor="#fbbf24",
                backgroundColor="#ffffff",
                textColor="#1f2937",
            ),
            preview="/themes/sunset.png"
        ),
        ThemePreset(
            id="corporate",
            name="Corporate",
            theme=TenantTheme(
                primaryColor="#1e40af",
                secondaryColor="#1d4ed8",
                accentColor="#3b82f6",
                backgroundColor="#f8fafc",
                textColor="#1e293b",
                buttonStyle="square",
                cardStyle="bordered",
            ),
            preview="/themes/corporate.png"
        ),
    ]
    return {"presets": presets}
