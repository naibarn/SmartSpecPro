"""
Unit tests for Performance Optimization modules
Priority 5: Performance Optimization
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import time


# ============================================================================
# Tests for Database Optimization
# ============================================================================

class TestDatabaseMetrics:
    """Tests for DatabaseMetrics class"""
    
    def test_record_connection(self):
        """Test connection recording"""
        from app.core.database_optimized import DatabaseMetrics
        
        metrics = DatabaseMetrics()
        assert metrics.total_connections == 0
        assert metrics.active_connections == 0
        
        metrics.record_connection()
        assert metrics.total_connections == 1
        assert metrics.active_connections == 1
        
        metrics.record_connection()
        assert metrics.total_connections == 2
        assert metrics.active_connections == 2
    
    def test_release_connection(self):
        """Test connection release"""
        from app.core.database_optimized import DatabaseMetrics
        
        metrics = DatabaseMetrics()
        metrics.record_connection()
        metrics.record_connection()
        
        metrics.release_connection()
        assert metrics.active_connections == 1
        
        # Should not go below 0
        metrics.release_connection()
        metrics.release_connection()
        assert metrics.active_connections == 0
    
    def test_record_query(self):
        """Test query recording"""
        from app.core.database_optimized import DatabaseMetrics
        
        metrics = DatabaseMetrics()
        
        metrics.record_query(0.5, is_slow=False)
        assert metrics.total_queries == 1
        assert metrics.slow_queries == 0
        
        metrics.record_query(2.0, is_slow=True)
        assert metrics.total_queries == 2
        assert metrics.slow_queries == 1
    
    def test_get_stats(self):
        """Test stats retrieval"""
        from app.core.database_optimized import DatabaseMetrics
        
        metrics = DatabaseMetrics()
        metrics.record_connection()
        metrics.record_query(0.5)
        metrics.record_query(1.5, is_slow=True)
        
        stats = metrics.get_stats()
        
        assert stats["total_connections"] == 1
        assert stats["total_queries"] == 2
        assert stats["slow_queries"] == 1
        assert stats["avg_query_time_ms"] == 1000.0  # (0.5 + 1.5) / 2 * 1000


class TestQueryBuilder:
    """Tests for QueryBuilder utilities"""
    
    def test_with_pagination(self):
        """Test pagination helper"""
        from app.core.database_optimized import QueryBuilder
        
        mock_query = MagicMock()
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        
        result = QueryBuilder.with_pagination(mock_query, page=2, page_size=20)
        
        mock_query.limit.assert_called_once_with(20)
        mock_query.offset.assert_called_once_with(20)  # (2-1) * 20
    
    def test_with_pagination_max_limit(self):
        """Test pagination respects max page size"""
        from app.core.database_optimized import QueryBuilder
        
        mock_query = MagicMock()
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        
        result = QueryBuilder.with_pagination(mock_query, page=1, page_size=500, max_page_size=100)
        
        mock_query.limit.assert_called_once_with(100)  # Capped at max


# ============================================================================
# Tests for the current PostgreSQL-backed cache
# ============================================================================

class TestCacheManager:
    """Tests for the current PostgreSQL-backed cache contract."""

    def test_generate_key_uses_sha256_and_arguments(self):
        from app.core.cache import CacheManager

        cache = CacheManager()
        first = cache._generate_key("user", 7, role="admin")

        assert len(first) == 64
        assert first == cache._generate_key("user", 7, role="admin")
        assert first != cache._generate_key("user", 8, role="admin")

    @pytest.mark.asyncio
    async def test_set_persists_value_and_get_reads_it(self, monkeypatch):
        import app.core.cache as cache_module

        persisted = {"value": {"status": "ready"}}
        put_value = AsyncMock()
        read_value = AsyncMock(side_effect=lambda _namespace, key: persisted.get(key))
        monkeypatch.setattr(cache_module, "put_value", put_value)
        monkeypatch.setattr(cache_module, "read_value", read_value)
        cache = cache_module.CacheManager()

        await cache.set("value", {"status": "ready"}, ttl=60)

        assert await cache.get("value") == {"status": "ready"}
        put_value.assert_awaited_once_with(
            "application_cache", "value", {"status": "ready"}, 60
        )
        read_value.assert_awaited_once_with("application_cache", "value")

    @pytest.mark.asyncio
    async def test_get_falls_back_to_memory_when_database_is_unavailable(self, monkeypatch):
        import app.core.cache as cache_module

        monkeypatch.setattr(
            cache_module,
            "read_value",
            AsyncMock(side_effect=ConnectionError("database unavailable")),
        )
        cache = cache_module.CacheManager()
        cache.memory_cache["key"] = "cached"

        assert await cache.get("key") == "cached"

    @pytest.mark.asyncio
    async def test_delete_removes_persistent_and_memory_value(self, monkeypatch):
        import app.core.cache as cache_module

        delete_value = AsyncMock()
        monkeypatch.setattr(cache_module, "delete_value", delete_value)
        cache = cache_module.CacheManager()
        cache.memory_cache["key"] = "cached"

        await cache.delete("key")

        delete_value.assert_awaited_once_with("application_cache", "key")
        assert "key" not in cache.memory_cache

    @pytest.mark.asyncio
    async def test_clear_namespace_clears_database_and_memory(self, monkeypatch):
        import app.core.cache as cache_module

        delete_namespace = AsyncMock()
        monkeypatch.setattr(cache_module, "delete_namespace", delete_namespace)
        cache = cache_module.CacheManager()
        cache.memory_cache.update({"a": 1, "b": 2})

        await cache.clear()

        delete_namespace.assert_awaited_once_with("application_cache")
        assert cache.memory_cache == {}


# Tests for Background Tasks
# ============================================================================

class TestTaskResult:
    """Tests for TaskResult class"""
    
    def test_duration_calculation(self):
        """Test duration calculation"""
        from app.core.background_tasks import TaskResult, TaskStatus
        
        started = datetime.utcnow()
        completed = started + timedelta(seconds=5)
        
        result = TaskResult(
            task_id="test",
            status=TaskStatus.COMPLETED,
            started_at=started,
            completed_at=completed
        )
        
        assert result.duration == 5.0
    
    def test_duration_none_when_incomplete(self):
        """Test duration is None when task incomplete"""
        from app.core.background_tasks import TaskResult, TaskStatus
        
        result = TaskResult(
            task_id="test",
            status=TaskStatus.RUNNING,
            started_at=datetime.utcnow()
        )
        
        assert result.duration is None


class TestTask:
    """Tests for Task class"""
    
    def test_task_comparison(self):
        """Test task priority comparison"""
        from app.core.background_tasks import Task, TaskPriority
        
        low = Task(id="1", name="low", func=lambda: None, priority=TaskPriority.LOW)
        high = Task(id="2", name="high", func=lambda: None, priority=TaskPriority.HIGH)
        
        # Higher priority should be "less than" for priority queue
        assert high < low


class TestTaskMetrics:
    """Tests for TaskMetrics class"""
    
    def test_record_task(self):
        """Test task recording"""
        from app.core.background_tasks import TaskMetrics, Task, TaskPriority
        
        metrics = TaskMetrics()
        task = Task(id="1", name="test_task", func=lambda: None, priority=TaskPriority.NORMAL)
        
        metrics.record_task(task)
        
        assert metrics.total_tasks == 1
        assert metrics.tasks_by_name["test_task"] == 1
    
    def test_success_rate(self):
        """Test success rate calculation"""
        from app.core.background_tasks import TaskMetrics, Task, TaskResult, TaskStatus, TaskPriority
        
        metrics = TaskMetrics()
        
        # Record 4 tasks
        for i in range(4):
            task = Task(id=str(i), name="task", func=lambda: None, priority=TaskPriority.NORMAL)
            metrics.record_task(task)
        
        # 3 completed, 1 failed
        for i in range(3):
            result = TaskResult(task_id=str(i), status=TaskStatus.COMPLETED)
            metrics.record_completion(result)
        
        task = Task(id="3", name="task", func=lambda: None, priority=TaskPriority.NORMAL)
        metrics.record_failure(task, "error")
        
        stats = metrics.get_stats()
        assert stats["success_rate"] == 75.0  # 3/4 * 100


class TestBackgroundTaskManager:
    """Tests for BackgroundTaskManager class"""
    
    @pytest.mark.asyncio
    async def test_submit_and_execute(self):
        """Test task submission and execution"""
        from app.core.background_tasks import BackgroundTaskManager
        
        manager = BackgroundTaskManager(max_workers=2)
        await manager.start()
        
        result_value = None
        
        async def test_task():
            nonlocal result_value
            result_value = "executed"
            return "success"
        
        task_id = await manager.submit(test_task, name="test")
        
        # Wait for completion
        result = await manager.wait_for_result(task_id, timeout=5.0)
        
        await manager.stop()
        
        assert result is not None
        assert result.result == "success"
        assert result_value == "executed"
    
    @pytest.mark.asyncio
    async def test_task_with_retry(self):
        """Test task retry on failure"""
        from app.core.background_tasks import BackgroundTaskManager, TaskStatus
        
        manager = BackgroundTaskManager(max_workers=1)
        await manager.start()
        
        attempt_count = 0
        
        async def failing_task():
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count < 3:
                raise Exception("Temporary failure")
            return "success"
        
        task_id = await manager.submit(
            failing_task,
            name="retry_test",
            max_retries=3,
            retry_delay=0.1
        )
        
        result = await manager.wait_for_result(task_id, timeout=10.0)
        
        await manager.stop()
        
        assert result is not None
        assert result.status == TaskStatus.COMPLETED
        assert result.retries == 2  # Failed twice, succeeded on third
        assert attempt_count == 3
    
    @pytest.mark.asyncio
    async def test_get_stats(self):
        """Test stats retrieval"""
        from app.core.background_tasks import BackgroundTaskManager
        
        manager = BackgroundTaskManager(max_workers=2)
        await manager.start()
        
        async def simple_task():
            return "done"
        
        await manager.submit(simple_task)
        await asyncio.sleep(0.5)  # Wait for execution
        
        stats = manager.get_stats()
        
        await manager.stop()
        
        assert "total_tasks" in stats
        assert "queue_size" in stats
        assert "workers" in stats


class TestScheduledTaskManager:
    """Tests for ScheduledTaskManager class"""
    
    @pytest.mark.asyncio
    async def test_schedule_once(self):
        """Test one-time scheduled task"""
        from app.core.background_tasks import BackgroundTaskManager, ScheduledTaskManager
        
        task_manager = BackgroundTaskManager(max_workers=1)
        scheduler = ScheduledTaskManager(task_manager)
        
        await task_manager.start()
        await scheduler.start()
        
        executed = False
        
        async def delayed_task():
            nonlocal executed
            executed = True
        
        task_id = await scheduler.schedule_once(delayed_task, delay=0.1)
        
        await asyncio.sleep(0.5)
        
        await scheduler.stop()
        await task_manager.stop()
        
        assert executed is True
    
    @pytest.mark.asyncio
    async def test_cancel_scheduled(self):
        """Test cancelling scheduled task"""
        from app.core.background_tasks import BackgroundTaskManager, ScheduledTaskManager
        
        task_manager = BackgroundTaskManager(max_workers=1)
        scheduler = ScheduledTaskManager(task_manager)
        
        await task_manager.start()
        await scheduler.start()
        
        executed = False
        
        async def delayed_task():
            nonlocal executed
            executed = True
        
        task_id = await scheduler.schedule_once(delayed_task, delay=1.0)
        
        # Cancel before execution
        result = scheduler.cancel_scheduled(task_id)
        assert result is True
        
        await asyncio.sleep(1.5)
        
        await scheduler.stop()
        await task_manager.stop()
        
        assert executed is False


# ============================================================================
# Integration Tests
# ============================================================================

class TestCacheIntegration:
    """Integration tests for caching system"""
    
    @pytest.mark.asyncio
    async def test_cached_decorator(self, monkeypatch):
        """Test cached decorator"""
        from app.core.cache import cached, cache_manager
        
        call_count = 0
        values = {}

        async def get_cached(key):
            return values.get(key)

        async def set_cached(key, value, ttl=None):
            values[key] = value

        monkeypatch.setattr(cache_manager, "get", get_cached)
        monkeypatch.setattr(cache_manager, "set", set_cached)

        @cached(ttl=60, key_prefix="test")
        async def expensive_function(x: int):
            nonlocal call_count
            call_count += 1
            return x * 2
        
        # First call - cache miss
        result1 = await expensive_function(5)
        assert result1 == 10
        assert call_count == 1
        
        # Second call - cache hit
        result2 = await expensive_function(5)
        assert result2 == 10
        assert call_count == 1  # Not called again
        
        # Different argument - cache miss
        result3 = await expensive_function(10)
        assert result3 == 20
        assert call_count == 2


class TestBackgroundTaskIntegration:
    """Integration tests for background task system"""
    
    @pytest.mark.asyncio
    async def test_parallel_execute(self):
        """Test parallel execution utility"""
        from app.core.background_tasks import parallel_execute
        
        results = []
        
        async def task(n):
            await asyncio.sleep(0.1)
            return n * 2
        
        tasks = [lambda n=i: task(n) for i in range(5)]
        
        start = time.time()
        results = await parallel_execute(tasks, max_concurrent=5)
        duration = time.time() - start
        
        assert results == [0, 2, 4, 6, 8]
        assert duration < 0.5  # Should run in parallel
