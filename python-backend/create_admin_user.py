"""
Create Admin User Script

Usage:
    python create_admin_user.py [email] [password]

Example:
    python create_admin_user.py admin@smartspec.pro admin123
"""

import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import uuid

# Import after path setup
from app.core.config import settings
from app.models.user import User
from app.core.auth import get_password_hash


async def create_admin_user(email: str = "admin@smartspec.pro", password: str = "admin123"):
    """Create an admin user"""

    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
    )

    # Create async session
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        # Check if user already exists
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"✅ User {email} already exists")

            # Update to admin if not already
            if not existing_user.is_admin:
                existing_user.is_admin = True
                await session.commit()
                print(f"✅ Updated {email} to admin")
            else:
                print(f"✅ User {email} is already an admin")

            print(f"\nℹ️  Login credentials:")
            print(f"   Email: {email}")
            print(f"   Password: (use your existing password)")
            return existing_user

        # Create new admin user
        hashed_password = get_password_hash(password)

        admin_user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=hashed_password,
            is_admin=True,
            is_active=True,
            credits_balance=100000000,  # Give admin lots of credits (100,000 USD worth)
        )

        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        print(f"✅ Created admin user: {email}")
        print(f"\nℹ️  Login credentials:")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print(f"\n⚠️  IMPORTANT: Change the password after first login!")

        return admin_user

    await engine.dispose()


async def main():
    """Main function"""
    # Get email and password from command line args
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@smartspec.pro"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin123"

    print("🚀 Creating admin user...")
    print(f"   Email: {email}")
    print(f"   Password: {'*' * len(password)}")
    print()

    try:
        user = await create_admin_user(email, password)
        print(f"\n✅ Success! User ID: {user.id}")
        print(f"\n📱 You can now login to:")
        print(f"   Desktop App: http://localhost:1420")
        print(f"   With: {email} / {password if password != 'admin123' else '(your password)'}")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
