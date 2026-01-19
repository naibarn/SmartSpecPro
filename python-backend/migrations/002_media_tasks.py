"""
Migration: Create media_tasks table for async media generation
Date: 2025-01-19
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ForeignKey, JSON, create_engine
from sqlalchemy.orm import declarative_base
import enum

Base = declarative_base()


class TaskStatus(str, enum.Enum):
    """Task status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MediaType(str, enum.Enum):
    """Media type enum"""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


def upgrade(engine):
    """Create media_tasks table"""
    from sqlalchemy import Table, MetaData

    metadata = MetaData()

    media_tasks = Table(
        'media_tasks',
        metadata,
        Column('id', String(36), primary_key=True),
        Column('user_id', String(36), ForeignKey('users.id'), nullable=False, index=True),
        Column('media_type', Enum(MediaType), nullable=False, index=True),
        Column('status', Enum(TaskStatus), nullable=False, index=True),
        Column('model', String(100), nullable=False),
        Column('prompt', Text, nullable=False),
        Column('parameters', JSON, nullable=True),
        Column('result_url', Text, nullable=True),
        Column('result_data', JSON, nullable=True),
        Column('error_message', Text, nullable=True),
        Column('credits_used', Integer, nullable=True),
        Column('credits_balance', Integer, nullable=True),
        Column('created_at', DateTime, nullable=False, index=True),
        Column('started_at', DateTime, nullable=True),
        Column('completed_at', DateTime, nullable=True),
    )

    metadata.create_all(engine)
    print("✓ Created media_tasks table")


def downgrade(engine):
    """Drop media_tasks table"""
    from sqlalchemy import Table, MetaData

    metadata = MetaData()
    media_tasks = Table('media_tasks', metadata, autoload_with=engine)
    media_tasks.drop(engine)
    print("✓ Dropped media_tasks table")


if __name__ == "__main__":
    # Manual migration runner
    import os
    from app.core.config import settings

    engine = create_engine(settings.DATABASE_URL)

    print("Running migration: 002_media_tasks")
    try:
        upgrade(engine)
        print("Migration completed successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
        raise
