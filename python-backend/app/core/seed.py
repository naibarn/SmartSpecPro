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


# Default admin credentials - CHANGE THESE IN PRODUCTION!
DEFAULT_ADMIN_EMAIL = "admin@smartspec.io"
DEFAULT_ADMIN_PASSWORD = "Admin@123!"  # Meets password requirements
DEFAULT_ADMIN_NAME = "System Admin"
DEFAULT_ADMIN_CREDITS = 100000  # 100k credits for admin


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
        existing_user.password = get_password_hash(DEFAULT_ADMIN_PASSWORD)
        await db.commit()
        print(f"[Seed] Upgraded existing user to admin: {existing_user.email}")
        return True

    # Create new admin user
    admin_user = User(
        email=DEFAULT_ADMIN_EMAIL,
        password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
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
    print(f"       Password: {DEFAULT_ADMIN_PASSWORD}")
    print(f"       Credits: {DEFAULT_ADMIN_CREDITS}")
    print(f"       ⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!")

    return True


async def run_seed():
    """Run all seed operations"""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            created = await seed_admin_user(db)
            if created:
                print("[Seed] Database seeding completed successfully")
            else:
                print("[Seed] Database already seeded, skipping")
        except Exception as e:
            print(f"[Seed] Error during seeding: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(run_seed())
