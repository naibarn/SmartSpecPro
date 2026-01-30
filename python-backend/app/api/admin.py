"""
Admin API Endpoints
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.credit import CreditTransaction
from app.models.payment import PaymentTransaction
from app.services.credit_service import CreditService
from app.services.audit_service import AuditService

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
            print("[Admin Auth] JWT_SECRET not configured")
            return None

        payload = jwt.decode(
            session_cookie,
            jwt_secret,
            algorithms=["HS256"]
        )

        open_id = payload.get("openId")
        if not open_id:
            print("[Admin Auth] No openId in session payload")
            return None

        # Look up user by openId
        result = await db.execute(
            select(User).where(User.openId == open_id)
        )
        user = result.scalar_one_or_none()

        if user:
            print(f"[Admin Auth] Found user from cookie: {user.email}, role: {user.role}")

        return user

    except JWTError as e:
        print(f"[Admin Auth] JWT verification failed: {e}")
        return None
    except Exception as e:
        print(f"[Admin Auth] Error getting user from cookie: {e}")
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
                print(f"[Admin Auth] Bearer token auth failed: {e}")

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
        query += f" LIMIT {limit} OFFSET {skip}"

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
        print(f"[admin_list_tenants] Error: {e}")
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
