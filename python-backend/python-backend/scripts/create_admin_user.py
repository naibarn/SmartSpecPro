#!/usr/bin/env python3
"""
Create Admin User Script

Creates a default admin user for SmartSpec Pro.
Run this script after database initialization.

Usage:
    python scripts/create_admin_user.py

Or with custom credentials:
    python scripts/create_admin_user.py --email admin@example.com --password YourPassword123!
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import async_engine, async_session_maker
from app.core.auth import get_password_hash
from app.models.user import User
import argparse


async def create_admin_user(email: str, password: str, full_name: str):
    """
    Create an admin user in the database.

    Args:
        email: Admin email
        password: Admin password
        full_name: Admin full name
    """
    async with async_session_maker() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"⚠️  User {email} already exists")

            # Update to admin if not already
            if not existing_user.is_admin:
                existing_user.is_admin = True
                await db.commit()
                print(f"✅ Updated {email} to admin")
            else:
                print(f"ℹ️  {email} is already an admin")

            return existing_user

        # Create new admin user
        admin_user = User(
            email=email,
            password_hash=get_password_hash(password),
            full_name=full_name,
            credits_balance=100000,  # Give admin user 100,000 credits
            is_active=True,
            is_admin=True,
            email_verified=True  # Auto-verify admin email
        )

        db.add(admin_user)
        await db.commit()
        await db.refresh(admin_user)

        print(f"✅ Admin user created successfully!")
        print(f"   Email: {admin_user.email}")
        print(f"   Full Name: {admin_user.full_name}")
        print(f"   Credits: {admin_user.credits_balance:,}")
        print(f"   Admin: {admin_user.is_admin}")
        print(f"   Email Verified: {admin_user.email_verified}")

        return admin_user


async def main():
    parser = argparse.ArgumentParser(description="Create admin user for SmartSpec Pro")
    parser.add_argument(
        "--email",
        default="admin@smartspec.local",
        help="Admin email (default: admin@smartspec.local)"
    )
    parser.add_argument(
        "--password",
        default="Admin123!@#",
        help="Admin password (default: Admin123!@#)"
    )
    parser.add_argument(
        "--name",
        default="System Administrator",
        help="Admin full name (default: System Administrator)"
    )

    args = parser.parse_args()

    print("🚀 SmartSpec Pro - Admin User Creator")
    print("=" * 50)

    try:
        admin = await create_admin_user(
            email=args.email,
            password=args.password,
            full_name=args.name
        )

        print("\n" + "=" * 50)
        print("🎉 Done! You can now login with:")
        print(f"   Email: {args.email}")
        print(f"   Password: {args.password}")
        print("\n⚠️  IMPORTANT: Change the password after first login!")

    except Exception as e:
        print(f"\n❌ Error creating admin user: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
