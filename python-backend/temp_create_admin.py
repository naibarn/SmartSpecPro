import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.models.user import User
from app.core.auth import get_password_hash

# Create engine
engine = create_async_engine("sqlite+aiosqlite:///./data/smartspec.db")
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def create_admin():
    async with async_session() as db:
        # Check if admin exists
        result = await db.execute(select(User).where(User.email == "admin@smartspec.local"))
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"✅ Admin user already exists: {existing.email}")
            if not existing.is_admin:
                existing.is_admin = True
                await db.commit()
                print("✅ Updated to admin")
            return
        
        # Create new admin
        admin = User(
            email="admin@smartspec.local",
            password_hash=get_password_hash("Admin123!@#"),
            full_name="System Administrator",
            credits_balance=100000,
            is_admin=True,
            is_active=True,
            email_verified=True
        )
        
        db.add(admin)
        await db.commit()
        print("✅ Admin user created!")
        print(f"   Email: admin@smartspec.local")
        print(f"   Password: Admin123!@#")

asyncio.run(create_admin())
