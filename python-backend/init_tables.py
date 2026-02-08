#!/usr/bin/env python3
"""
Initialize database tables
"""
import asyncio
from app.core.database import init_db

async def main():
    print("Initializing database tables...")
    await init_db()
    print("✓ Database tables created successfully!")

if __name__ == "__main__":
    asyncio.run(main())
