"""
SmartSpec Pro - Optimized Database Configuration
Priority 5: Performance Optimization

Features:
- Enhanced connection pooling with health checks
- Query optimization utilities
- Connection monitoring and metrics
- Automatic retry with exponential backoff
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool, NullPool
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, AsyncGenerator
from datetime import datetime, timedelta
import asyncio
import structlog
import re
import time

from app.core.config import settings

logger = structlog.get_logger()

# Create declarative base for models
Base = declarative_base()


class DatabaseMetrics:
    """Track database connection and query metrics"""
    
    def __init__(self):
        self.total_connections = 0
        self.active_connections = 0
        self.total_queries = 0
        self.slow_queries = 0
        self.failed_queries = 0
        self.total_query_time = 0.0
        self.connection_errors = 0
        self.last_health_check = None
        self.is_healthy = True
        
    def record_connection(self):
        self.total_connections += 1
        self.active_connections += 1
        
    def release_connection(self):
        self.active_connections = max(0, self.active_connections - 1)
        
    def record_query(self, duration: float, is_slow: bool = False):
        self.total_queries += 1
        self.total_query_time += duration
        if is_slow:
            self.slow_queries += 1
            
    def record_error(self, is_connection: bool = False):
        self.failed_queries += 1
        if is_connection:
            self.connection_errors += 1
            
    def get_stats(self) -> Dict[str, Any]:
        avg_query_time = (
            self.total_query_time / self.total_queries 
            if self.total_queries > 0 else 0
        )
        return {
            "total_connections": self.total_connections,
            "active_connections": self.active_connections,
            "total_queries": self.total_queries,
            "slow_queries": self.slow_queries,
            "failed_queries": self.failed_queries,
            "avg_query_time_ms": round(avg_query_time * 1000, 2),
            "connection_errors": self.connection_errors,
            "is_healthy": self.is_healthy,
            "last_health_check": self.last_health_check.isoformat() if self.last_health_check else None,
        }


# Global metrics instance
db_metrics = DatabaseMetrics()


class DatabaseConfig:
    """Database configuration with environment-aware settings"""
    
    # Connection pool settings
    POOL_SIZE = int(getattr(settings, 'DB_POOL_SIZE', 10))
    MAX_OVERFLOW = int(getattr(settings, 'DB_MAX_OVERFLOW', 20))
    POOL_TIMEOUT = int(getattr(settings, 'DB_POOL_TIMEOUT', 30))
    POOL_RECYCLE = int(getattr(settings, 'DB_POOL_RECYCLE', 1800))  # 30 minutes
    POOL_PRE_PING = True
    
    # Query settings
    SLOW_QUERY_THRESHOLD = float(getattr(settings, 'DB_SLOW_QUERY_THRESHOLD', 1.0))  # seconds
    STATEMENT_TIMEOUT = int(getattr(settings, 'DB_STATEMENT_TIMEOUT', 30000))  # ms
    
    # Retry settings
    MAX_RETRIES = 3
    RETRY_DELAY = 0.5  # seconds
    RETRY_BACKOFF = 2.0  # exponential backoff multiplier
    
    # Health check settings
    HEALTH_CHECK_INTERVAL = 60  # seconds


def sanitize_db_url(url: str) -> str:
    """Sanitize database URL by removing password"""
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', url)


def get_engine_options(is_async: bool = True) -> Dict[str, Any]:
    """Get SQLAlchemy engine options based on database type"""
    
    db_url = settings.DATABASE_URL
    
    # SQLite doesn't support connection pooling
    if db_url.startswith("sqlite"):
        return {
            "echo": settings.DEBUG,
        }
    
    # PostgreSQL/MySQL options
    options = {
        "echo": settings.DEBUG,
        "pool_pre_ping": DatabaseConfig.POOL_PRE_PING,
        "pool_size": DatabaseConfig.POOL_SIZE,
        "max_overflow": DatabaseConfig.MAX_OVERFLOW,
        "pool_timeout": DatabaseConfig.POOL_TIMEOUT,
        "pool_recycle": DatabaseConfig.POOL_RECYCLE,
        "poolclass": QueuePool,
    }
    
    # Add PostgreSQL-specific options
    if "postgresql" in db_url:
        options["connect_args"] = {
            "command_timeout": DatabaseConfig.STATEMENT_TIMEOUT / 1000,
            "options": f"-c statement_timeout={DatabaseConfig.STATEMENT_TIMEOUT}",
        }
    
    return options


# Create async engine with optimized settings
engine = create_async_engine(
    settings.DATABASE_URL,
    **get_engine_options(is_async=True)
)


# Create async session factory with optimized settings
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# Event listeners for monitoring
@event.listens_for(engine.sync_engine, "connect")
def on_connect(dbapi_connection, connection_record):
    """Called when a new connection is established"""
    db_metrics.record_connection()
    logger.debug("database_connection_established")


@event.listens_for(engine.sync_engine, "checkout")
def on_checkout(dbapi_connection, connection_record, connection_proxy):
    """Called when a connection is checked out from the pool"""
    connection_record.info['checkout_time'] = time.time()


@event.listens_for(engine.sync_engine, "checkin")
def on_checkin(dbapi_connection, connection_record):
    """Called when a connection is returned to the pool"""
    db_metrics.release_connection()
    
    checkout_time = connection_record.info.get('checkout_time')
    if checkout_time:
        duration = time.time() - checkout_time
        if duration > DatabaseConfig.SLOW_QUERY_THRESHOLD:
            logger.warning(
                "slow_connection_usage",
                duration_seconds=round(duration, 3)
            )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database session with retry logic
    """
    retries = 0
    last_error = None
    
    while retries < DatabaseConfig.MAX_RETRIES:
        try:
            async with AsyncSessionLocal() as session:
                try:
                    yield session
                    await session.commit()
                    return
                except Exception as e:
                    await session.rollback()
                    db_metrics.record_error()
                    raise
                finally:
                    await session.close()
        except Exception as e:
            last_error = e
            retries += 1
            db_metrics.record_error(is_connection=True)
            
            if retries < DatabaseConfig.MAX_RETRIES:
                delay = DatabaseConfig.RETRY_DELAY * (DatabaseConfig.RETRY_BACKOFF ** (retries - 1))
                logger.warning(
                    "database_connection_retry",
                    attempt=retries,
                    delay=delay,
                    error=str(e)
                )
                await asyncio.sleep(delay)
    
    logger.error("database_connection_failed", error=str(last_error))
    raise last_error


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database session (for non-FastAPI usage)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def execute_with_retry(
    session: AsyncSession,
    query,
    params: Optional[Dict] = None,
    max_retries: int = 3
) -> Any:
    """
    Execute a query with automatic retry on transient failures
    """
    retries = 0
    last_error = None
    
    while retries < max_retries:
        try:
            start_time = time.time()
            
            if params:
                result = await session.execute(query, params)
            else:
                result = await session.execute(query)
            
            duration = time.time() - start_time
            is_slow = duration > DatabaseConfig.SLOW_QUERY_THRESHOLD
            db_metrics.record_query(duration, is_slow)
            
            if is_slow:
                logger.warning(
                    "slow_query_detected",
                    duration_seconds=round(duration, 3),
                    query=str(query)[:200]
                )
            
            return result
            
        except Exception as e:
            last_error = e
            retries += 1
            db_metrics.record_error()
            
            # Check if error is retryable
            error_str = str(e).lower()
            retryable_errors = [
                "connection",
                "timeout",
                "deadlock",
                "serialization",
                "too many connections"
            ]
            
            is_retryable = any(err in error_str for err in retryable_errors)
            
            if is_retryable and retries < max_retries:
                delay = DatabaseConfig.RETRY_DELAY * (DatabaseConfig.RETRY_BACKOFF ** (retries - 1))
                logger.warning(
                    "query_retry",
                    attempt=retries,
                    delay=delay,
                    error=str(e)
                )
                await asyncio.sleep(delay)
            else:
                raise
    
    raise last_error


async def health_check() -> Dict[str, Any]:
    """
    Perform database health check
    """
    try:
        start_time = time.time()
        
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        
        duration = time.time() - start_time
        
        db_metrics.is_healthy = True
        db_metrics.last_health_check = datetime.utcnow()
        
        return {
            "status": "healthy",
            "latency_ms": round(duration * 1000, 2),
            "pool_stats": get_pool_stats(),
            "metrics": db_metrics.get_stats()
        }
        
    except Exception as e:
        db_metrics.is_healthy = False
        db_metrics.last_health_check = datetime.utcnow()
        
        logger.error("database_health_check_failed", error=str(e))
        
        return {
            "status": "unhealthy",
            "error": str(e),
            "metrics": db_metrics.get_stats()
        }


def get_pool_stats() -> Dict[str, Any]:
    """Get connection pool statistics"""
    pool = engine.sync_engine.pool
    
    return {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalidatedcount() if hasattr(pool, 'invalidatedcount') else 0,
    }


async def init_db():
    """Initialize database - create all tables"""
    from app.models import (
        audit_log, credit, api_key, oauth, 
        password_reset, payment, refund, 
        support_ticket, user, semantic_memory
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info(
        "database_initialized",
        url=sanitize_db_url(settings.DATABASE_URL),
        pool_config={
            "pool_size": DatabaseConfig.POOL_SIZE,
            "max_overflow": DatabaseConfig.MAX_OVERFLOW,
            "pool_timeout": DatabaseConfig.POOL_TIMEOUT,
            "pool_recycle": DatabaseConfig.POOL_RECYCLE,
        }
    )


async def close_db():
    """Close database connection and cleanup"""
    await engine.dispose()
    
    logger.info(
        "database_connection_closed",
        url=sanitize_db_url(settings.DATABASE_URL),
        final_metrics=db_metrics.get_stats()
    )


class QueryBuilder:
    """
    Query optimization utilities
    """
    
    @staticmethod
    def with_pagination(query, page: int = 1, page_size: int = 20, max_page_size: int = 100):
        """Add pagination to query with safety limits"""
        page_size = min(page_size, max_page_size)
        offset = (page - 1) * page_size
        return query.limit(page_size).offset(offset)
    
    @staticmethod
    def with_timeout(query, timeout_ms: int = 5000):
        """Add query timeout hint"""
        # PostgreSQL specific
        return query.execution_options(timeout=timeout_ms)
    
    @staticmethod
    def batch_insert(session: AsyncSession, model, items: list, batch_size: int = 1000):
        """Batch insert for better performance"""
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            session.add_all([model(**item) for item in batch])
    
    @staticmethod
    async def bulk_update(
        session: AsyncSession,
        model,
        updates: list[Dict],
        id_field: str = "id"
    ):
        """Bulk update multiple records efficiently"""
        from sqlalchemy import update
        
        for item in updates:
            item_id = item.pop(id_field)
            stmt = (
                update(model)
                .where(getattr(model, id_field) == item_id)
                .values(**item)
            )
            await session.execute(stmt)


# Background task for periodic health checks
async def periodic_health_check():
    """Run periodic health checks"""
    while True:
        await health_check()
        await asyncio.sleep(DatabaseConfig.HEALTH_CHECK_INTERVAL)
