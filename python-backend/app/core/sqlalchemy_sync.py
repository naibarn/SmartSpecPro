"""Helpers for building sync SQLAlchemy URLs from async application settings."""

from __future__ import annotations


def to_sync_sqlalchemy_url(url: str) -> str:
    """Normalize an async SQLAlchemy URL for synchronous engine usage.

    The app uses ``asyncpg`` for async access and ``psycopg`` for sync access.
    Mapping explicitly to ``postgresql+psycopg`` avoids SQLAlchemy falling back
    to ``psycopg2`` when a task or utility creates a sync engine.
    """
    if not url:
        return url

    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)

    return url
