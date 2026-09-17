"""
Admin API Endpoints
"""

import asyncio
import logging
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text, update
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.api.internal_library import (
    REINDEX_BATCH_TTL_SECONDS,
    REINDEX_TASK_NAME,
    REINDEX_TASK_ID_KEY,
    _build_reindex_batch_summary,
    _determine_reindex_status,
    _load_reindex_batch_metadata,
    _match_reindex_batch_metadata,
    _merge_reindex_batch_outcome,
    _store_reindex_batch_metadata,
)
from app.models.library import LibraryBackfillCampaign, LibraryIndexJob
from app.models.user import User
from app.models.credit import CreditTransaction
from app.models.payment import PaymentTransaction
from app.services.credit_service import CreditService
from app.services.audit_service import AuditService
from app.services.library_vector_observability_service import (
    build_admin_vector_health_snapshot,
    build_indexing_status,
    build_provider_settings_diagnostics,
    evaluate_vector_alert_policies,
)
from app.services.library_cutover_service import (
    approve_read_cutover,
    apply_either_trigger_rollback,
    assert_config_edit_allowed,
    get_or_create_switch_state,
    maybe_auto_promote_vectorize_cutover,
    evaluate_server_vectorize_readiness,
    request_provider_cutover,
)
from app.services.library_backfill_service import (
    create_backfill_campaign,
    run_backfill_campaign_batch,
)
from app.services.library_indexing_service import resolve_library_vector_provider_from_db
from app.services.embedding_service import CloudflareWorkersAIEmbedding
from app.orchestrator.vector_store.cloudflare_vectorize_store import (
    CloudflareVectorizeStore,
    VectorizeConfig,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================
# Admin Authorization (with cookie support)
# ============================================================

async def get_user_from_session_cookie(request: Request, db: AsyncSession) -> Optional[User]:
    """
    Get user from SmartSpecWeb session cookie.
    This allows the admin endpoints to work with the frontend's cookie-based auth.
    """
    cookie_name = "app_session_id"
    session_cookie = request.cookies.get(cookie_name)

    if not session_cookie:
        return None

    try:
        # Verify JWT using the same secret as SmartSpecWeb
        jwt_secret = settings.JWT_SECRET
        if not jwt_secret:
            logger.warning("admin_auth_jwt_secret_not_configured")
            return None

        payload = jwt.decode(
            session_cookie,
            jwt_secret,
            algorithms=["HS256"]
        )

        open_id = payload.get("openId")
        if not open_id:
            logger.warning("admin_auth_no_openid_in_payload")
            return None

        # Look up user by openId
        result = await db.execute(
            select(User).where(User.openId == open_id)
        )
        user = result.scalar_one_or_none()

        if user:
            logger.info("admin_auth_cookie_success", extra={"user_id": user.id, "role": user.role})

        return user

    except JWTError as e:
        logger.warning("admin_auth_jwt_failed", extra={"error": str(e)[:100]})
        return None
    except Exception as e:
        logger.warning("admin_auth_cookie_error", extra={"error": str(e)[:100]})
        return None


async def require_admin(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Require admin role.
    Supports both Bearer token auth and SmartSpecWeb session cookie.
    """
    user = None

    # First try session cookie (SmartSpecWeb frontend)
    user = await get_user_from_session_cookie(request, db)

    # If no cookie, try Bearer token
    if not user:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                # Import and use the regular auth
                from app.core.auth import verify_token
                token = auth_header[7:]
                payload = verify_token(token, expected_type="access")
                if payload:
                    user_id = payload.get("sub") or payload.get("user_id")
                    if user_id:
                        result = await db.execute(
                            select(User).where(User.id == int(user_id))
                        )
                        user = result.scalar_one_or_none()
            except Exception as e:
                logger.warning("admin_auth_bearer_failed", extra={"error": str(e)[:100]})

    # Check if we have a valid admin user
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return user


# ============================================================
# Request/Response Models
# ============================================================

class UserListResponse(BaseModel):
    """User list response"""
    id: str
    email: str
    full_name: str
    credits_balance: int
    is_admin: bool
    email_verified: bool
    created_at: str
    last_login: Optional[str] = None


class UserDetailResponse(BaseModel):
    """User detail response"""
    id: str
    email: str
    full_name: str
    credits_balance: int
    is_admin: bool
    email_verified: bool
    created_at: str
    updated_at: Optional[str] = None
    last_login: Optional[str] = None
    total_spent: float
    total_credits_purchased: int
    total_credits_used: int


class AdjustCreditsRequest(BaseModel):
    """Adjust credits request"""
    user_id: str
    amount: int = Field(..., description="Amount to add (positive) or deduct (negative)")
    reason: str = Field(..., min_length=1, max_length=500)


class BanUserRequest(BaseModel):
    """Ban user request"""
    user_id: str
    reason: str = Field(..., min_length=1, max_length=500)
    duration_days: Optional[int] = Field(None, description="Ban duration in days (None = permanent)")


class SystemStatsResponse(BaseModel):
    """System statistics response"""
    total_users: int
    active_users_30d: int
    total_revenue: float
    total_credits_sold: int
    total_credits_used: int
    avg_credits_per_user: float


class CutoverConfigEditRequest(BaseModel):
    tenant_id: Optional[str] = None
    emergency: bool = False


class CutoverRequestPayload(BaseModel):
    target_provider: str
    tenant_id: Optional[str] = None
    campaign_id: Optional[int] = None
    campaign_completed: bool = False
    connectivity_ok: bool = False
    expected_version: Optional[int] = None


class CutoverApprovePayload(BaseModel):
    tenant_id: Optional[str] = None
    coverage_ratio: float
    smoke_passed: bool
    parity_ratio: float
    reconciliation_report: Dict[str, Any] = Field(default_factory=dict)
    expected_version: Optional[int] = None


class CutoverRollbackPayload(BaseModel):
    tenant_id: Optional[str] = None
    indexing_failure_rate: float
    search_latency_factor: float
    search_regression_detected: bool = False
    expected_version: Optional[int] = None


class VectorBackfillCampaignPayload(BaseModel):
    tenant_id: Optional[str] = None
    domain: str = "library"
    rebuild_from_canonical: bool = True


class VectorBackfillBatchPayload(BaseModel):
    campaign_id: int
    batch_size: int = Field(default=100, ge=1, le=500)
    max_enqueue: int = Field(default=25, ge=1, le=100)
    dry_run: bool = True
    paused: bool = False


def _schedule_vector_db_backfill_campaign(campaign_id: int) -> bool:
    """Start durable backfill processing without blocking the admin request."""
    from app.tasks.vector_db_backfill_tasks import run_vector_db_backfill_campaign

    run_vector_db_backfill_campaign.delay(int(campaign_id))
    return True


async def _reset_failed_vector_db_index_jobs_for_retry(db: AsyncSession) -> int:
    """Requeue only credential-blocked backfill jobs after target repair."""
    credential_blocked_errors = (
        "Cloudflare Workers AI embedding credentials not configured",
        "Cloudflare Workers AI embedding request failed",
    )
    result = await db.execute(
        update(LibraryIndexJob)
        .where(
            LibraryIndexJob.status == "failed",
            LibraryIndexJob.job_type == "backfill_index",
            LibraryIndexJob.last_error.in_(credential_blocked_errors),
        )
        .values(
            status="retry_pending",
            next_retry_at=datetime.utcnow(),
            completed_at=None,
            last_error=None,
            updated_at=datetime.utcnow(),
        )
        .returning(LibraryIndexJob.id)
    )
    await db.commit()
    return len(result.fetchall())


def _schedule_vector_db_index_retry() -> bool:
    """Wake the existing bounded library-index retry worker immediately."""
    from app.tasks.media_tasks import retry_library_index_jobs

    retry_library_index_jobs.delay()
    return True


def _status_for_cutover_runtime_error(exc: RuntimeError) -> int:
    message = str(exc)
    if "switch_state_version_conflict" in message:
        return status.HTTP_409_CONFLICT
    return status.HTTP_400_BAD_REQUEST


async def _probe_vectorize_cutover_target(
    db: AsyncSession,
    *,
    tenant_id: str | None,
) -> dict[str, Any]:
    """Verify the saved Vectorize target before a cutover request is accepted."""
    _active_provider, config = await resolve_library_vector_provider_from_db(
        db,
        tenant_id=tenant_id,
    )
    account_id = str(config.get("vectorizeAccountId") or "").strip()
    api_token = str(config.get("vectorizeApiToken") or "").strip()
    index_name = str(
        config.get("vectorizeKnowledgeIndexName")
        or config.get("vectorizeIndexName")
        or ""
    ).strip()
    if not account_id or not api_token or not index_name:
        raise RuntimeError("target_connectivity_check_failed:vectorize_config_incomplete")

    store = CloudflareVectorizeStore(
        VectorizeConfig(
            account_id=account_id,
            api_token=api_token,
            index_name=index_name,
        )
    )
    probe = await store.test_connection()
    if not probe.get("success"):
        raise RuntimeError("target_connectivity_check_failed:vectorize_probe_failed")

    index_config = probe.get("config") if isinstance(probe.get("config"), dict) else {}
    dimensions = int(index_config.get("dimensions") or 0)
    metric = str(index_config.get("metric") or "").strip().lower()
    if dimensions != 768 or metric != "cosine":
        raise RuntimeError(
            "target_connectivity_check_failed:vectorize_schema_mismatch"
        )

    embedding_token = str(
        config.get("cloudflareAiApiKey")
        or config.get("vectorizeApiToken")
        or ""
    ).strip()
    if not embedding_token:
        raise RuntimeError(
            "target_connectivity_check_failed:workers_ai_embedding_credentials_missing"
        )
    try:
        embedder = CloudflareWorkersAIEmbedding(
            account_id=account_id,
            api_token=embedding_token,
        )
        embedding = await asyncio.to_thread(
            embedder.embed_text,
            "SmartAIHub Vectorize readiness probe",
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "target_connectivity_check_failed:workers_ai_embedding_probe_failed"
        ) from exc
    if len(embedding) != 768:
        raise RuntimeError(
            "target_connectivity_check_failed:workers_ai_embedding_schema_mismatch"
        )

    return {
        "index_name": index_name,
        "dimensions": dimensions,
        "metric": metric,
        "embedding_dimensions": len(embedding),
    }


@router.post("/vectordb/backfill/campaign")
async def create_vectordb_backfill_campaign(
    payload: VectorBackfillCampaignPayload,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a resumable canonical SQL/R2 rebuild campaign."""
    try:
        campaign = await create_backfill_campaign(
            db,
            domain=payload.domain,
            tenant_id=payload.tenant_id,
            rebuild_from_canonical=payload.rebuild_from_canonical,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "campaign_id": int(campaign.id),
        "tenant_id": campaign.tenant_id,
        "domain": campaign.domain,
        "status": campaign.status,
        "rebuild_from_canonical": bool(
            (campaign.checkpoint_json or {}).get("rebuild_from_canonical", False)
        ),
        "snapshot_id": (campaign.checkpoint_json or {}).get("snapshot_id"),
        "source_high_water_mark": (campaign.checkpoint_json or {}).get("source_high_water_mark", 0),
        "legacy_vector_values_read": 0,
    }


@router.post("/vectordb/backfill/campaign/batch")
async def run_vectordb_backfill_campaign_batch(
    payload: VectorBackfillBatchPayload,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Run one bounded campaign batch; repeat until the campaign is complete."""
    try:
        return await run_backfill_campaign_batch(
            db,
            campaign_id=payload.campaign_id,
            batch_size=payload.batch_size,
            max_enqueue=payload.max_enqueue,
            dry_run=payload.dry_run,
            paused=payload.paused,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ============================================================
# User Management
# ============================================================

@router.get("/users", response_model=List[UserListResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    List all users (admin only)
    
    - Requires admin role
    - Supports pagination
    - Supports search by email or name
    """
    query = select(User)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (User.email.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern))
        )
    
    # Order by created_at desc
    query = query.order_by(desc(User.created_at))
    
    # Pagination
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return [
        UserListResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            credits_balance=user.credits_balance,
            is_admin=user.is_admin,
            email_verified=user.email_verified,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None
        )
        for user in users
    ]


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user details (admin only)
    
    - Requires admin role
    - Returns detailed user information
    - Includes spending and usage statistics
    """
    # Get user
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Calculate statistics
    # Total spent (from payments)
    result = await db.execute(
        select(func.sum(PaymentTransaction.amount_usd)).where(
            (PaymentTransaction.user_id == user_id) &
            (PaymentTransaction.status == "completed")
        )
    )
    total_spent = result.scalar() or 0.0
    
    # Total credits purchased
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            (CreditTransaction.user_id == user_id) &
            (CreditTransaction.type.in_(["topup", "adjustment"]))
        )
    )
    total_credits_purchased = result.scalar() or 0
    
    # Total credits used
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            (CreditTransaction.user_id == user_id) &
            (CreditTransaction.type == "deduction")
        )
    )
    total_credits_used = result.scalar() or 0
    
    return UserDetailResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        credits_balance=user.credits_balance,
        is_admin=user.is_admin,
        email_verified=user.email_verified,
        created_at=user.created_at.isoformat(),
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
        total_spent=float(total_spent),
        total_credits_purchased=total_credits_purchased,
        total_credits_used=total_credits_used
    )


# ============================================================
# Credit Management
# ============================================================

@router.post("/credits/adjust")
async def adjust_user_credits(
    request: AdjustCreditsRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Adjust user credits (admin only)
    
    - Requires admin role
    - Can add or deduct credits
    - Records transaction with reason
    """
    credit_service = CreditService(db)
    
    try:
        transaction = await credit_service.add_credits(
            user_id=request.user_id,
            amount=request.amount,
            description=f"Admin adjustment: {request.reason}",
            transaction_type="adjustment",
            metadata={
                "admin_id": str(admin.id),
                "admin_email": admin.email,
                "reason": request.reason
            }
        )
        
        return {
            "message": "Credits adjusted successfully",
            "transaction_id": str(transaction.id),
            "amount": request.amount,
            "new_balance": transaction.balance_after
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


# ============================================================
# User Moderation
# ============================================================

@router.post("/users/ban")
async def ban_user(
    request: BanUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Ban user (admin only)
    
    - Requires admin role
    - Prevents user from logging in
    - Can be temporary or permanent
    
    Note: This is a placeholder - full implementation requires:
    - is_banned field in User model
    - banned_until field in User model
    - ban_reason field in User model
    - Check in login endpoint
    """
    # Get user
    result = await db.execute(
        select(User).where(User.id == request.user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # R13.3: Prevent admin from banning themselves
    if str(admin.id) == request.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot ban themselves"
        )

    user.is_banned = True
    user.ban_reason = request.reason
    if request.duration_days:
        user.banned_until = datetime.utcnow() + timedelta(days=request.duration_days)
    else:
        user.banned_until = None  # Permanent ban

    await db.commit()

    # Invalidate all user sessions
    from app.services.auth_service import AuthService
    auth_service = AuthService(db)
    await auth_service.logout_all_sessions(request.user_id)

    return {
        "message": f"User {user.email} has been banned",
        "banned_until": user.banned_until.isoformat() if user.banned_until else "permanent",
        "reason": user.ban_reason
    }


# ============================================================
# System Statistics
# ============================================================

@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get system statistics (admin only)
    
    - Requires admin role
    - Returns overall system metrics
    """
    # Total users
    result = await db.execute(select(func.count(User.id)))
    total_users = result.scalar() or 0
    
    # Active users (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    result = await db.execute(
        select(func.count(User.id)).where(User.last_login >= thirty_days_ago)
    )
    active_users_30d = result.scalar() or 0
    
    # Total revenue
    result = await db.execute(
        select(func.sum(PaymentTransaction.amount_usd)).where(
            PaymentTransaction.status == "completed"
        )
    )
    total_revenue = result.scalar() or 0.0
    
    # Total credits sold
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            CreditTransaction.type.in_(["topup", "adjustment"])
        )
    )
    total_credits_sold = result.scalar() or 0
    
    # Total credits used
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            CreditTransaction.type == "deduction"
        )
    )
    total_credits_used = result.scalar() or 0
    
    # Average credits per user
    avg_credits_per_user = total_credits_sold / total_users if total_users > 0 else 0.0
    
    return SystemStatsResponse(
        total_users=total_users,
        active_users_30d=active_users_30d,
        total_revenue=float(total_revenue),
        total_credits_sold=total_credits_sold,
        total_credits_used=total_credits_used,
        avg_credits_per_user=avg_credits_per_user
    )


# ============================================================
# Tenant Management (Admin)
# ============================================================

class TenantThemeConfig(BaseModel):
    """Tenant theme configuration"""
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


class TenantListItem(BaseModel):
    """Tenant list item response"""
    id: str  # String ID (e.g., "tenant-001")
    name: str
    slug: str
    primaryDomain: Optional[str] = None
    logoUrl: Optional[str] = None
    faviconUrl: Optional[str] = None
    isActive: bool = True
    plan: str = "free"
    status: str = "active"
    createdAt: str
    updatedAt: Optional[str] = None
    settings: Dict[str, Any] = {}
    theme: Optional[TenantThemeConfig] = None


class TenantCreate(BaseModel):
    """Request model for creating a tenant"""
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100)
    primaryDomain: Optional[str] = None
    plan: str = "free"
    settings: Dict[str, Any] = {}
    theme: Optional[TenantThemeConfig] = None


class TenantUpdate(BaseModel):
    """Request model for updating a tenant"""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    slug: Optional[str] = Field(None, min_length=2, max_length=100)
    primaryDomain: Optional[str] = None
    logoUrl: Optional[str] = None
    faviconUrl: Optional[str] = None
    isActive: Optional[bool] = None
    plan: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    theme: Optional[TenantThemeConfig] = None


@router.get("/tenants", response_model=List[TenantListItem])
async def admin_list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    List all tenants (admin only)
    """
    try:
        query = """
            SELECT id, name, slug, "primaryDomain", "logoUrl", "faviconUrl",
                   "isActive", plan, status, "createdAt", "updatedAt", settings
            FROM tenants
        """
        params = {}

        if search:
            query += " WHERE name ILIKE :search OR slug ILIKE :search"
            params["search"] = f"%{search}%"

        query += " ORDER BY \"createdAt\" DESC"
        query += " LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip

        result = await db.execute(text(query), params)
        rows = result.fetchall()

        tenants = []
        for row in rows:
            tenants.append(TenantListItem(
                id=row[0],
                name=row[1],
                slug=row[2],
                primaryDomain=row[3],
                logoUrl=row[4],
                faviconUrl=row[5],
                isActive=row[6] if row[6] is not None else True,
                plan=row[7] or "free",
                status=row[8] or "active",
                createdAt=row[9].isoformat() if row[9] else datetime.utcnow().isoformat(),
                updatedAt=row[10].isoformat() if row[10] else None,
                settings=row[11] if row[11] else {},
                theme=None
            ))

        return tenants

    except Exception as e:
        logger.error("admin_list_tenants_error", error=type(e).__name__)
        # Return empty list if table doesn't exist or other error
        return []


@router.post("/tenants", response_model=TenantListItem)
async def admin_create_tenant(
    data: TenantCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new tenant (admin only)
    """
    try:
        import json
        settings_json = json.dumps(data.settings) if data.settings else "{}"

        result = await db.execute(
            text("""
                INSERT INTO tenants (name, slug, "primaryDomain", plan, settings, "isActive", status, "createdAt", "updatedAt")
                VALUES (:name, :slug, :domain, :plan, :settings::jsonb, true, 'active', NOW(), NOW())
                RETURNING id, name, slug, "primaryDomain", "logoUrl", "faviconUrl",
                          "isActive", plan, status, "createdAt", "updatedAt", settings
            """),
            {
                "name": data.name,
                "slug": data.slug,
                "domain": data.primaryDomain,
                "plan": data.plan,
                "settings": settings_json
            }
        )
        await db.commit()

        row = result.fetchone()
        return TenantListItem(
            id=row[0],
            name=row[1],
            slug=row[2],
            primaryDomain=row[3],
            logoUrl=row[4],
            faviconUrl=row[5],
            isActive=row[6] if row[6] is not None else True,
            plan=row[7] or "free",
            status=row[8] or "active",
            createdAt=row[9].isoformat() if row[9] else datetime.utcnow().isoformat(),
            updatedAt=row[10].isoformat() if row[10] else None,
            settings=row[11] if row[11] else {},
            theme=None
        )

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create tenant: {str(e)}"
        )


@router.get("/tenants/{tenant_id}", response_model=TenantListItem)
async def admin_get_tenant(
    tenant_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get tenant details (admin only)
    """
    result = await db.execute(
        text("""
            SELECT id, name, slug, "primaryDomain", "logoUrl", "faviconUrl",
                   "isActive", plan, status, "createdAt", "updatedAt", settings
            FROM tenants
            WHERE id = :id
        """),
        {"id": tenant_id}
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )

    return TenantListItem(
        id=row[0],
        name=row[1],
        slug=row[2],
        primaryDomain=row[3],
        logoUrl=row[4],
        faviconUrl=row[5],
        isActive=row[6] if row[6] is not None else True,
        plan=row[7] or "free",
        status=row[8] or "active",
        createdAt=row[9].isoformat() if row[9] else datetime.utcnow().isoformat(),
        updatedAt=row[10].isoformat() if row[10] else None,
        settings=row[11] if row[11] else {},
        theme=None
    )


@router.put("/tenants/{tenant_id}", response_model=TenantListItem)
async def admin_update_tenant(
    tenant_id: str,
    data: TenantUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Update tenant (admin only)
    """
    # Build update query dynamically
    updates = []
    params = {"id": tenant_id}

    if data.name is not None:
        updates.append('name = :name')
        params["name"] = data.name
    if data.slug is not None:
        updates.append('slug = :slug')
        params["slug"] = data.slug
    if data.primaryDomain is not None:
        updates.append('"primaryDomain" = :domain')
        params["domain"] = data.primaryDomain
    if data.logoUrl is not None:
        updates.append('"logoUrl" = :logo')
        params["logo"] = data.logoUrl
    if data.faviconUrl is not None:
        updates.append('"faviconUrl" = :favicon')
        params["favicon"] = data.faviconUrl
    if data.isActive is not None:
        updates.append('"isActive" = :active')
        params["active"] = data.isActive
    if data.plan is not None:
        updates.append('plan = :plan')
        params["plan"] = data.plan
    if data.status is not None:
        updates.append('status = :status')
        params["status"] = data.status
    if data.settings is not None:
        import json
        updates.append('settings = :settings::jsonb')
        params["settings"] = json.dumps(data.settings)

    updates.append('"updatedAt" = NOW()')

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    try:
        query = f"""
            UPDATE tenants SET {', '.join(updates)}
            WHERE id = :id
            RETURNING id, name, slug, "primaryDomain", "logoUrl", "faviconUrl",
                      "isActive", plan, status, "createdAt", "updatedAt", settings
        """

        result = await db.execute(text(query), params)
        await db.commit()

        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found"
            )

        return TenantListItem(
            id=row[0],
            name=row[1],
            slug=row[2],
            primaryDomain=row[3],
            logoUrl=row[4],
            faviconUrl=row[5],
            isActive=row[6] if row[6] is not None else True,
            plan=row[7] or "free",
            status=row[8] or "active",
            createdAt=row[9].isoformat() if row[9] else datetime.utcnow().isoformat(),
            updatedAt=row[10].isoformat() if row[10] else None,
            settings=row[11] if row[11] else {},
            theme=None
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update tenant: {str(e)}"
        )


@router.delete("/tenants/{tenant_id}")
async def admin_delete_tenant(
    tenant_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete tenant (admin only)
    """
    try:
        result = await db.execute(
            text("DELETE FROM tenants WHERE id = :id RETURNING id"),
            {"id": tenant_id}
        )
        await db.commit()

        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found"
            )

        return {"message": "Tenant deleted successfully", "id": tenant_id}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete tenant: {str(e)}"
        )


# ============================================================
# Vector Database — Reindex
# ============================================================

@router.get("/vectordb/provider-switch/state")
async def get_vectordb_provider_switch_state(
    request: Request,
    tenant_id: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return current provider switch-state for cutover governance."""
    state = await get_or_create_switch_state(db, tenant_id=tenant_id)
    return {
        "tenant_id": state.tenant_id,
        "switch_version": int(state.switch_version),
        "status": state.status,
        "campaign_status": state.campaign_status,
        "current_read_provider": state.current_read_provider,
        "previous_read_provider": state.previous_read_provider,
        "target_provider": state.target_provider,
        "mirror_writes": bool(state.mirror_writes),
        "freeze_non_emergency_edits": bool(state.freeze_non_emergency_edits),
        "readiness_gate": state.readiness_gate,
        "campaign_id": state.campaign_id,
    }


@router.post("/vectordb/provider-switch/assert-config-edit")
async def assert_vectordb_config_edit_allowed(
    payload: CutoverConfigEditRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Validate whether non-emergency provider configuration edits are currently allowed."""
    state = await get_or_create_switch_state(db, tenant_id=payload.tenant_id)
    try:
        assert_config_edit_allowed(state, emergency=payload.emergency)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return {
        "allowed": True,
        "tenant_id": state.tenant_id,
        "switch_version": int(state.switch_version),
        "status": state.status,
        "freeze_non_emergency_edits": bool(state.freeze_non_emergency_edits),
    }


@router.post("/vectordb/provider-switch/request")
async def request_vectordb_provider_cutover(
    payload: CutoverRequestPayload,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Request staged provider cutover with campaign/connectivity prechecks."""
    target_provider = str(payload.target_provider or "").strip().lower()
    campaign_completed = bool(payload.campaign_completed)
    connectivity_ok = bool(payload.connectivity_ok)
    target_probe: dict[str, Any] | None = None
    campaign_id = payload.campaign_id
    campaign_was_created = False
    cutover_was_already_staged = False
    if target_provider == "cloudflare_vectorize":
        try:
            target_probe = await _probe_vectorize_cutover_target(
                db,
                tenant_id=payload.tenant_id,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        current_state = await get_or_create_switch_state(db, tenant_id=payload.tenant_id)
        if (
            campaign_id is None
            and current_state.target_provider == target_provider
            and current_state.campaign_id is not None
        ):
            campaign_id = int(current_state.campaign_id)

        campaign = None
        if campaign_id is not None:
            campaign = await db.scalar(
                select(LibraryBackfillCampaign).where(
                    LibraryBackfillCampaign.id == campaign_id,
                    LibraryBackfillCampaign.tenant_id == payload.tenant_id,
                    LibraryBackfillCampaign.domain == "library",
                )
            )
        if campaign is None and campaign_id is None:
            campaign = await create_backfill_campaign(
                db,
                domain="library",
                tenant_id=payload.tenant_id,
                rebuild_from_canonical=True,
            )
            campaign_id = int(campaign.id)
            campaign_was_created = True
        campaign_status = str(campaign.status).strip().lower() if campaign else ""
        if campaign is None or campaign_status not in {"queued", "running", "paused", "completed"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="campaign_prerequisite_incomplete:campaign_not_ready",
            )
        # Requesting the staged state enables bounded mirror writes while
        # pgvector remains authoritative. Automatic promotion waits for the
        # target projection to be acknowledged by the registry.
        campaign_completed = True
        connectivity_ok = True
        cutover_was_already_staged = (
            current_state.status in {"active", "ready_for_cutover"}
            and current_state.target_provider == target_provider
            and current_state.campaign_id == campaign_id
        )

    if cutover_was_already_staged:
        state = current_state
    else:
        try:
            state = await request_provider_cutover(
                db,
                target_provider=target_provider,
                tenant_id=payload.tenant_id,
                campaign_id=campaign_id,
                campaign_completed=campaign_completed,
                connectivity_ok=connectivity_ok,
                expected_version=payload.expected_version,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=_status_for_cutover_runtime_error(exc), detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    backfill_scheduled = False
    failed_jobs_reset = 0
    retry_scheduled = False
    state_campaign_id = getattr(state, "campaign_id", None)
    if (
        target_provider == "cloudflare_vectorize"
        and state_campaign_id is not None
        and not cutover_was_already_staged
    ):
        try:
            backfill_scheduled = _schedule_vector_db_backfill_campaign(int(state_campaign_id))
        except Exception as exc:  # noqa: BLE001
            # The cutover state remains durable and observable. A later retry
            # from the UI can schedule the same idempotent campaign again.
            logger.error(
                "vector_db_backfill_schedule_failed",
                campaign_id=state_campaign_id,
                error=str(exc),
            )
    if target_provider == "cloudflare_vectorize" and cutover_was_already_staged:
        try:
            failed_jobs_reset = await _reset_failed_vector_db_index_jobs_for_retry(db)
            if failed_jobs_reset:
                retry_scheduled = _schedule_vector_db_index_retry()
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "vector_db_index_retry_schedule_failed",
                error=str(exc),
            )

    auto_promotion: dict[str, Any] | None = None
    if target_provider == "cloudflare_vectorize" and target_probe is not None:
        # The request stages mirror writes while pgvector remains authoritative.
        # If the campaign/projection gates are already complete, promote in the
        # same request; otherwise the health/job completion hooks retry it.
        try:
            auto_promotion = await maybe_auto_promote_vectorize_cutover(
                db,
                tenant_id=payload.tenant_id,
                target_index=target_probe["index_name"],
                smoke_passed=True,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=_status_for_cutover_runtime_error(exc),
                detail=str(exc),
            ) from exc
        if auto_promotion.get("cutover_applied"):
            state = await get_or_create_switch_state(db, tenant_id=payload.tenant_id)

    return {
        "tenant_id": state.tenant_id,
        "switch_version": int(state.switch_version),
        "status": state.status,
        "campaign_status": state.campaign_status,
        "current_read_provider": state.current_read_provider,
        "target_provider": state.target_provider,
        "mirror_writes": bool(state.mirror_writes),
        "freeze_non_emergency_edits": bool(state.freeze_non_emergency_edits),
        "automatic_promotion": auto_promotion,
        "preparation": {
            "campaign_id": int(state_campaign_id) if state_campaign_id is not None else None,
            "campaign_created": campaign_was_created,
            "backfill_scheduled": backfill_scheduled,
            "failed_jobs_reset": failed_jobs_reset,
            "retry_scheduled": retry_scheduled,
        },
    }


@router.post("/vectordb/provider-switch/approve")
async def approve_vectordb_provider_cutover(
    payload: CutoverApprovePayload,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate readiness gate and apply read-provider cutover when thresholds pass."""
    state = await get_or_create_switch_state(db, tenant_id=payload.tenant_id)
    if state.target_provider == "cloudflare_vectorize":
        try:
            target_probe = await _probe_vectorize_cutover_target(
                db,
                tenant_id=payload.tenant_id,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        if state.campaign_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="campaign_prerequisite_incomplete:campaign_id_required",
            )
        campaign = await db.scalar(
            select(LibraryBackfillCampaign).where(
                LibraryBackfillCampaign.id == state.campaign_id,
                LibraryBackfillCampaign.tenant_id == payload.tenant_id,
                LibraryBackfillCampaign.domain == "library",
            )
        )
        if campaign is None or str(campaign.status).strip().lower() != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="campaign_prerequisite_incomplete:campaign_not_completed",
            )

        # Keep this endpoint backward-compatible for existing callers, but do
        # not trust client-reported ratios. Automatic promotion uses the same
        # server-measured evidence and therefore needs no manual approval.
        try:
            return await maybe_auto_promote_vectorize_cutover(
                db,
                tenant_id=payload.tenant_id,
                target_index=target_probe["index_name"],
                smoke_passed=True,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=_status_for_cutover_runtime_error(exc),
                detail=str(exc),
            ) from exc

    try:
        result = await approve_read_cutover(
            db,
            tenant_id=payload.tenant_id,
            coverage_ratio=payload.coverage_ratio,
            # A successful server-side target probe is the smoke evidence for
            # Vectorize; do not let the client assert it independently.
            smoke_passed=True if state.target_provider == "cloudflare_vectorize" else payload.smoke_passed,
            parity_ratio=payload.parity_ratio,
            reconciliation_report=payload.reconciliation_report,
            expected_version=payload.expected_version,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=_status_for_cutover_runtime_error(exc), detail=str(exc)) from exc

    return result


@router.post("/vectordb/provider-switch/rollback")
async def rollback_vectordb_provider_cutover(
    payload: CutoverRollbackPayload,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Apply either-trigger rollback when failure-rate or search regression is detected."""
    try:
        result = await apply_either_trigger_rollback(
            db,
            tenant_id=payload.tenant_id,
            indexing_failure_rate=payload.indexing_failure_rate,
            search_latency_factor=payload.search_latency_factor,
            search_regression_detected=payload.search_regression_detected,
            expected_version=payload.expected_version,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=_status_for_cutover_runtime_error(exc), detail=str(exc)) from exc

    return result

@router.post("/vectordb/reindex")
async def trigger_vectordb_reindex(
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a full reindex of all library items via Celery."""
    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
        from app.services.job_control_plane import JobControlPlaneClient, dispatch_python_task

        baseline_job_id = int(await db.scalar(select(func.max(LibraryIndexJob.id))) or 0)
        task = dispatch_python_task(
            REINDEX_TASK_NAME,
            kwargs={"tenant_id": None},
            tenant_id=os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
            idempotency_key=f"library:reindex:global:{baseline_job_id}",
            correlation_id="admin:library-reindex",
        )
        if not task.created:
            snapshot = await asyncio.to_thread(JobControlPlaneClient().status, task.id)
            canonical = str(snapshot.get("status") or "queued")
            return {
                "task_id": task.id,
                "status": "running" if canonical in {"queued", "leased", "running", "waiting_external", "retry_scheduled"} else canonical,
                "message": "A canonical reindex job already exists",
            }
        return {"task_id": task.id, "status": "started", "message": "Reindex job has been queued"}

    import redis
    from app.tasks.media_tasks import reindex_all_library_task
    from app.services.legacy_task_status import read_legacy_task_status

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    existing_task_id = r.get(REINDEX_TASK_ID_KEY)
    existing_batch = _load_reindex_batch_metadata(r)
    if existing_task_id:
        existing_task_id = existing_task_id.decode() if isinstance(existing_task_id, bytes) else existing_task_id
        existing_batch = _match_reindex_batch_metadata(existing_batch, task_id=str(existing_task_id))
        result = read_legacy_task_status(existing_task_id)
        existing_summary = await _build_reindex_batch_summary(db, existing_batch)
        existing_task_result = result.result if isinstance(result.result, dict) else None
        if _determine_reindex_status(
            queue_state=result.state,
            batch_summary=existing_summary,
            batch_metadata=existing_batch,
            task_result=existing_task_result,
        ) == "running":
            return {
                "task_id": existing_task_id,
                "status": "already_running",
                "message": "A reindex job is already in progress",
            }

    baseline_job_id = int(
        await db.scalar(select(func.max(LibraryIndexJob.id)))
        or 0
    )
    from app.services.job_control_plane import dispatch_python_task

    task = dispatch_python_task(
        reindex_all_library_task.name,
        kwargs={"tenant_id": None},
        tenant_id=os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
        idempotency_key=f"library:reindex:global:{baseline_job_id}",
        correlation_id="admin:library-reindex",
        legacy_task=reindex_all_library_task,
    )
    batch_metadata = {
        "task_id": task.id,
        "baseline_job_id": baseline_job_id,
        "tenant_id": None,
        "requested_at": datetime.utcnow().isoformat(),
    }
    r.set(REINDEX_TASK_ID_KEY, task.id, ex=REINDEX_BATCH_TTL_SECONDS)
    _store_reindex_batch_metadata(r, batch_metadata)

    return {
        "task_id": task.id,
        "status": "started",
        "message": "Reindex job has been queued",
    }


@router.get("/vectordb/reindex/status")
async def get_vectordb_reindex_status(
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Check the status of the current reindex job."""
    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
        from app.services.job_control_plane import JobControlPlaneClient

        task_id = await asyncio.to_thread(
            JobControlPlaneClient().latest,
            REINDEX_TASK_NAME,
            tenant_id=os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
        )
        if not task_id:
            return {"status": "idle", "task_id": None, "result": None}
        snapshot = await asyncio.to_thread(JobControlPlaneClient().status, task_id)
        canonical = str(snapshot.get("status") or "queued")
        status_map = {
            "queued": "running",
            "leased": "running",
            "running": "running",
            "waiting_external": "running",
            "retry_scheduled": "running",
            "succeeded": "completed",
            "failed": "failed",
            "cancelled": "cancelled",
            "expired": "failed",
        }
        return {
            "task_id": task_id,
            "status": status_map.get(canonical, canonical),
            "result": snapshot.get("output") if isinstance(snapshot.get("output"), dict) else None,
        }

    import redis
    from app.services.legacy_task_status import read_legacy_task_status

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    task_id = r.get(REINDEX_TASK_ID_KEY)
    batch_metadata = _load_reindex_batch_metadata(r)

    if not task_id:
        return {"status": "idle", "task_id": None, "result": None}

    task_id = task_id.decode() if isinstance(task_id, bytes) else task_id
    batch_metadata = _match_reindex_batch_metadata(batch_metadata, task_id=str(task_id))
    result = read_legacy_task_status(task_id)
    batch_summary = await _build_reindex_batch_summary(db, batch_metadata)
    task_result = result.result if isinstance(result.result, dict) else None
    merged_batch_metadata = _merge_reindex_batch_outcome(batch_metadata, task_result)
    if merged_batch_metadata and merged_batch_metadata != (batch_metadata or {}):
        _store_reindex_batch_metadata(r, merged_batch_metadata)

    response: Dict[str, Any] = {
        "task_id": task_id,
        "status": result.state.lower(),
        "result": None,
    }
    if batch_summary:
        response["result"] = {
            "queue_task_state": result.state.lower(),
            **batch_summary,
        }
    if merged_batch_metadata:
        response["result"] = {
            **(response["result"] or {}),
            "expected_total_items": int(merged_batch_metadata.get("expected_total_items") or 0),
            "expected_enqueued_jobs": int(merged_batch_metadata.get("expected_enqueued_jobs") or 0),
            "enqueue_errors": int(merged_batch_metadata.get("enqueue_errors") or 0),
        }

    response["status"] = _determine_reindex_status(
        queue_state=result.state,
        batch_summary=batch_summary,
        batch_metadata=merged_batch_metadata,
        task_result=task_result,
    )

    if result.state == "SUCCESS":
        if task_result is not None:
            response["result"] = {
                **(response["result"] or {}),
                **task_result,
            }
        elif response["result"] is None:
            response["result"] = result.result
    elif result.state == "FAILURE":
        response["status"] = "failed"
        response["result"] = {
            **(response["result"] or {}),
            "error": str(result.result),
        }

    return response


@router.get("/vectordb/health")
async def get_vectordb_health(
    request: Request,
    tenant_id: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return vector provider, queue, campaign, and alert diagnostics for admin operations."""
    snapshot = await build_admin_vector_health_snapshot(db, tenant_id=tenant_id)
    automatic_promotion: dict[str, Any] | None = None
    snapshot_provider_status = dict(snapshot.get("provider_status") or {})
    if (
        str(snapshot_provider_status.get("switch_status") or "").strip().lower()
        in {"active", "ready_for_cutover"}
        and str(snapshot_provider_status.get("target_provider") or "").strip().lower()
        == "cloudflare_vectorize"
    ):
        try:
            target_probe = await _probe_vectorize_cutover_target(
                db,
                tenant_id=tenant_id,
            )
            automatic_promotion = await maybe_auto_promote_vectorize_cutover(
                db,
                tenant_id=tenant_id,
                target_index=target_probe["index_name"],
                smoke_passed=True,
            )
            if automatic_promotion.get("cutover_applied"):
                snapshot = await build_admin_vector_health_snapshot(
                    db,
                    tenant_id=tenant_id,
                )
        except RuntimeError as exc:
            # Health must remain observable when the external target is down;
            # it must never promote based on a stale successful probe.
            automatic_promotion = {
                "cutover_applied": False,
                "automatic": True,
                "failed_checks": [str(exc)],
            }

    provider, resolved_config = await resolve_library_vector_provider_from_db(
        db,
        tenant_id=tenant_id,
    )
    snapshot = {
        **snapshot,
        "provider_status": {
            **dict(snapshot.get("provider_status") or {}),
            "current_read_provider": provider,
        },
    }
    provider_config: Dict[str, Any]
    provider_capabilities: Dict[str, Any]
    connection_health: Dict[str, Any]

    if provider == "pgvector":
        provider_config = {
            "host": resolved_config.get("pgvectorHost") or os.getenv("PGVECTOR_HOST"),
            "port": resolved_config.get("pgvectorPort") or os.getenv("PGVECTOR_PORT"),
            "database": resolved_config.get("pgvectorDatabase") or os.getenv("PGVECTOR_DATABASE"),
            "user": resolved_config.get("pgvectorUser") or os.getenv("PGVECTOR_USER"),
            "password_configured": bool(
                resolved_config.get("pgvectorPassword") or os.getenv("PGVECTOR_PASSWORD")
            ),
        }
        connection_health = {
            "healthy": bool(provider_config["host"] and provider_config["database"]),
            "status": "configured" if (provider_config["host"] and provider_config["database"]) else "misconfigured",
            "message": "pgvector host/database settings detected",
            "checked_at": datetime.utcnow().isoformat(),
        }
        provider_capabilities = {
            "supports_metadata_filter": True,
            "supports_hybrid_search": True,
        }
    elif provider == "cloudflare_vectorize":
        provider_config = {
            "account_id_configured": bool(
                resolved_config.get("vectorizeAccountId")
                or os.getenv("VECTORIZE_ACCOUNT_ID")
                or os.getenv("CF_ACCOUNT_ID")
                or os.getenv("CLOUDFLARE_ACCOUNT_ID")
            ),
            "api_token_configured": bool(
                resolved_config.get("vectorizeApiToken")
                or os.getenv("VECTORIZE_API_TOKEN")
                or os.getenv("CF_VECTORIZE_API_TOKEN")
            ),
            "index_name": (
                resolved_config.get("vectorizeKnowledgeIndexName")
                or resolved_config.get("vectorizeIndexName")
                or os.getenv("VECTORIZE_INDEX_NAME")
                or os.getenv("VECTORIZE_LIBRARY_INDEX")
                or os.getenv("CF_VECTORIZE_INDEX")
            ),
        }
        connection_health = {
            "healthy": provider_config["account_id_configured"] and provider_config["api_token_configured"],
            "status": (
                "configured"
                if (provider_config["account_id_configured"] and provider_config["api_token_configured"])
                else "misconfigured"
            ),
            "message": "Cloudflare Vectorize credentials detected",
            "checked_at": datetime.utcnow().isoformat(),
        }
        provider_capabilities = {
            "supports_metadata_filter": True,
            "supports_hybrid_search": False,
        }
    else:
        provider_config = {
            "persist_dir": os.getenv("CHROMA_PERSIST_DIR"),
        }
        connection_health = {
            "healthy": bool(provider_config["persist_dir"]),
            "status": "configured" if provider_config["persist_dir"] else "misconfigured",
            "message": "Chroma persistence directory detected",
            "checked_at": datetime.utcnow().isoformat(),
        }
        provider_capabilities = {
            "supports_metadata_filter": True,
            "supports_hybrid_search": False,
        }

    # Campaign counters show durable scheduling progress, while this evidence
    # confirms that the target projection is actually acknowledged by
    # Vectorize. Reuse persisted evidence after cutover and measure once when
    # older cutovers do not have it yet.
    indexing_status = snapshot.get("indexing_status")
    if not isinstance(indexing_status, dict):
        indexing_status = build_indexing_status(
            campaign_progress=snapshot.get("campaign_progress") or {},
            provider_status=snapshot.get("provider_status") or {},
        )
    server_evidence = None
    if isinstance(automatic_promotion, dict):
        server_evidence = automatic_promotion.get("server_evidence")
        if not isinstance(server_evidence, dict):
            gate = automatic_promotion.get("gate")
            if isinstance(gate, dict):
                server_evidence = gate.get("server_evidence")

    vectorize_index_name = str(
        resolved_config.get("vectorizeKnowledgeIndexName")
        or resolved_config.get("vectorizeIndexName")
        or ""
    ).strip()
    switch_status = str(
        (snapshot.get("provider_status") or {}).get("switch_status") or ""
    ).strip().lower()
    target_is_vectorize = str(
        (snapshot.get("provider_status") or {}).get("target_provider") or ""
    ).strip().lower() == "cloudflare_vectorize"
    can_measure_vectorize_projection = (
        provider == "cloudflare_vectorize" or target_is_vectorize
    ) and switch_status in {"active", "ready_for_cutover", "cutover_complete"}
    if (
        not isinstance(server_evidence, dict)
        and can_measure_vectorize_projection
        and vectorize_index_name
    ):
        try:
            readiness = await evaluate_server_vectorize_readiness(
                db,
                tenant_id=tenant_id,
                target_index=vectorize_index_name,
                smoke_passed=True,
            )
            server_evidence = (readiness.get("gate") or {}).get("server_evidence")
            if (
                provider == "cloudflare_vectorize"
                and switch_status == "cutover_complete"
                and isinstance(server_evidence, dict)
            ):
                state = await get_or_create_switch_state(db, tenant_id=tenant_id)
                state.readiness_json = {
                    **dict(state.readiness_json or {}),
                    "server_evidence": server_evidence,
                }
                await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("vectorize_indexing_evidence_unavailable", exc_info=exc)

    if isinstance(server_evidence, dict):
        indexing_status = build_indexing_status(
            campaign_progress=snapshot.get("campaign_progress") or {},
            provider_status=snapshot.get("provider_status") or {},
            server_evidence=server_evidence,
        )

    diagnostics = build_provider_settings_diagnostics(
        provider_name=provider,
        config=provider_config,
        connection_health=connection_health,
        capabilities=provider_capabilities,
    )

    processed = int(snapshot["campaign_progress"].get("processed", 0))
    failed = int(snapshot["campaign_progress"].get("failed", 0))
    failure_rate = (float(failed) / float(processed)) if processed > 0 else 0.0
    latency_status = snapshot.get("latency_status") if isinstance(snapshot.get("latency_status"), dict) else {}
    latency_p95_ms = float(latency_status.get("current_p95_ms", 0.0))
    latency_baseline_p95_ms = float(latency_status.get("baseline_p95_ms", 1.0))
    latency_window_minutes = float(latency_status.get("window_minutes", 15.0))

    alerts = evaluate_vector_alert_policies(
        queue_lag_minutes=float(snapshot["queue_status"]["lag_minutes"]),
        queue_lag_window_minutes=15.0,
        failure_rate=failure_rate,
        failure_window_minutes=30.0,
        latency_p95_ms=latency_p95_ms,
        latency_baseline_p95_ms=latency_baseline_p95_ms,
        latency_window_minutes=latency_window_minutes,
        owner="vector-oncall",
        runbook_base_url="https://runbooks.smartaihub.app/vector",
    )

    return {
        **snapshot,
        "indexing_status": indexing_status,
        # Keep health fields at the same level consumed by the admin UI. The
        # diagnostics object remains the masked/configuration detail view.
        "connection_health": connection_health,
        "provider_capabilities": provider_capabilities,
        "automatic_promotion": automatic_promotion,
        "alerts": alerts,
        "provider_diagnostics": diagnostics,
    }
