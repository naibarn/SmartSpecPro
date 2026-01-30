"""
Database Seed Script
Creates default admin user on first startup
"""

import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, engine, Base
from app.core.auth import get_password_hash
from app.models.user import User, Role, Plan


# Admin credentials — loaded from environment variables (no hardcoded defaults)
import os
import secrets as _secrets

DEFAULT_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@smartspec.pro")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")  # MUST be set via env
DEFAULT_ADMIN_NAME = "System Admin"
DEFAULT_ADMIN_CREDITS = 100000  # 100k credits for admin

# Default tenant settings
DEFAULT_TENANT_NAME = "SmartSpec Pro"
DEFAULT_TENANT_COMPANY = "SmartSpec"


async def seed_admin_user(db: AsyncSession) -> bool:
    """
    Create default admin user if no admin exists

    Returns True if admin was created, False if already exists
    """
    # Check if any admin user exists
    result = await db.execute(
        select(User).where(User.role == Role.admin).limit(1)
    )
    existing_admin = result.scalar_one_or_none()

    if existing_admin:
        print(f"[Seed] Admin user already exists: {existing_admin.email}")
        return False

    # Resolve password: env var, or generate a secure random one
    admin_password = DEFAULT_ADMIN_PASSWORD
    generated = False
    if not admin_password:
        admin_password = _secrets.token_urlsafe(16)
        generated = True

    # Check if admin email already exists as regular user
    result = await db.execute(
        select(User).where(User.email == DEFAULT_ADMIN_EMAIL).limit(1)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # Upgrade existing user to admin
        existing_user.role = Role.admin
        existing_user.credits = DEFAULT_ADMIN_CREDITS
        existing_user.plan = Plan.enterprise
        existing_user.password = get_password_hash(admin_password)
        await db.commit()
        print(f"[Seed] Upgraded existing user to admin: {existing_user.email}")
        if generated:
            print(f"       Generated password: {admin_password}")
            print(f"       CHANGE PASSWORD AFTER FIRST LOGIN!")
        return True

    # Create new admin user
    admin_user = User(
        email=DEFAULT_ADMIN_EMAIL,
        password=get_password_hash(admin_password),
        name=DEFAULT_ADMIN_NAME,
        role=Role.admin,
        plan=Plan.enterprise,
        credits=DEFAULT_ADMIN_CREDITS,
        openId=f"admin-{DEFAULT_ADMIN_EMAIL}",  # Generate a unique openId
        loginMethod="password",
        isDisabled=False,
    )

    db.add(admin_user)
    await db.commit()
    await db.refresh(admin_user)

    print(f"[Seed] Created default admin user:")
    print(f"       Email: {DEFAULT_ADMIN_EMAIL}")
    if generated:
        print(f"       Generated password: {admin_password}")
    else:
        print(f"       Password: (set via ADMIN_PASSWORD env var)")
    print(f"       Credits: {DEFAULT_ADMIN_CREDITS}")
    print(f"       CHANGE PASSWORD AFTER FIRST LOGIN!")

    return True


async def seed_default_tenant(db: AsyncSession) -> bool:
    """
    Create default tenant in database if no tenant exists
    This creates the tenant in PostgreSQL for SmartSpecWeb compatibility

    Returns True if tenant was created, False if already exists
    """
    from sqlalchemy import text
    import json

    # Check if any tenant exists in database
    result = await db.execute(text("SELECT COUNT(*) FROM tenants"))
    count = result.scalar()

    if count > 0:
        result = await db.execute(text("SELECT name, slug FROM tenants LIMIT 1"))
        tenant = result.fetchone()
        print(f"[Seed] Tenant already exists: {tenant[0]} ({tenant[1]})")
        return False

    # Create default tenant in database
    tenant_id = "tenant-001"
    slug = "smartspec-pro"
    domains = json.dumps(["smartspec.local", "localhost", "smartspec.pro"])

    await db.execute(text("""
        INSERT INTO tenants (
            id, name, slug, "primaryDomain", domains,
            "isActive", status, plan,
            created_at, updated_at, "createdAt", "updatedAt"
        ) VALUES (
            :id, :name, :slug, :primary_domain, :domains::json,
            true, 'ACTIVE', 'ENTERPRISE',
            NOW(), NOW(), NOW(), NOW()
        )
    """), {
        "id": tenant_id,
        "name": DEFAULT_TENANT_NAME,
        "slug": slug,
        "primary_domain": "localhost",
        "domains": domains
    })

    await db.commit()

    print(f"[Seed] Created default tenant in database:")
    print(f"       Name: {DEFAULT_TENANT_NAME}")
    print(f"       Slug: {slug}")
    print(f"       Domains: localhost, smartspec.local, smartspec.pro")
    print(f"       Plan: ENTERPRISE")
    print(f"       Tenant ID: {tenant_id}")

    # Also create in-memory tenant for Python backend
    try:
        from app.multitenancy.tenant_service import get_tenant_service
        from app.multitenancy.tenant_model import TenantPlan

        tenant_service = get_tenant_service()
        await tenant_service.create_tenant(
            name=DEFAULT_TENANT_NAME,
            admin_email=DEFAULT_ADMIN_EMAIL,
            plan=TenantPlan.ENTERPRISE,
            company_name=DEFAULT_TENANT_COMPANY,
            trial_days=0,
            metadata={
                "is_default": True,
                "created_by": "seed_script",
                "database_id": tenant_id,
            }
        )
        print(f"[Seed] Also created in-memory tenant for Python backend")
    except Exception as e:
        print(f"[Seed] Warning: Could not create in-memory tenant: {e}")

    return True


async def run_seed():
    """Run all seed operations"""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Seed admin user
            admin_created = await seed_admin_user(db)

            # Seed default tenant (both database and in-memory)
            tenant_created = await seed_default_tenant(db)

            if admin_created or tenant_created:
                print("[Seed] Database seeding completed successfully")
            else:
                print("[Seed] Database already seeded, skipping")
        except Exception as e:
            print(f"[Seed] Error during seeding: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(run_seed())
