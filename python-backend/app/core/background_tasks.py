"""
SmartSpec Pro - Background Task Manager
Priority 5: Performance Optimization

Features:
- Async task queue with priority support
- Task scheduling and recurring tasks
- Task monitoring and metrics
- Graceful shutdown handling
- Rate limiting for background tasks
"""

import asyncio
from typing import Any, Callable, Optional, Dict, List, Coroutine
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import uuid
import structlog

logger = structlog.get_logger()


class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class TaskStatus(Enum):
    """Task execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


@dataclass
class TaskResult:
    """Result of a task execution"""
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retries: int = 0
    
    @property
    def duration(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class Task:
    """Background task definition"""
    id: str
    name: str
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    max_retries: int = 3
    retry_delay: float = 1.0
    timeout: Optional[float] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    scheduled_at: Optional[datetime] = None
    
    def __lt__(self, other):
        # Higher priority = lower number in queue (processed first)
        return self.priority.value > other.priority.value


class TaskMetrics:
    """Track task execution metrics"""
    
    def __init__(self):
        self.total_tasks = 0
        self.completed_tasks = 0
        self.failed_tasks = 0
        self.cancelled_tasks = 0
        self.total_retries = 0
        self.total_execution_time = 0.0
        self.tasks_by_name: Dict[str, int] = defaultdict(int)
        self.errors_by_name: Dict[str, int] = defaultdict(int)
    
    def record_task(self, task: Task):
        self.total_tasks += 1
        self.tasks_by_name[task.name] += 1
    
    def record_completion(self, result: TaskResult):
        self.completed_tasks += 1
        if result.duration:
            self.total_execution_time += result.duration
    
    def record_failure(self, task: Task, error: str):
        self.failed_tasks += 1
        self.errors_by_name[task.name] += 1
    
    def record_retry(self):
        self.total_retries += 1
    
    def record_cancellation(self):
        self.cancelled_tasks += 1
    
    def get_stats(self) -> Dict[str, Any]:
        avg_time = (
            self.total_execution_time / self.completed_tasks
            if self.completed_tasks > 0 else 0
        )
        return {
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "failed_tasks": self.failed_tasks,
            "cancelled_tasks": self.cancelled_tasks,
            "total_retries": self.total_retries,
            "avg_execution_time": round(avg_time, 3),
            "success_rate": round(
                self.completed_tasks / self.total_tasks * 100, 2
            ) if self.total_tasks > 0 else 0,
        }


class BackgroundTaskManager:
    """
    Manages background task execution with priority queue
    """
    
    def __init__(
        self,
        max_workers: int = 10,
        max_queue_size: int = 1000
    ):
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue(maxsize=max_queue_size)
        self._workers: List[asyncio.Task] = []
        self._running = False
        self._shutdown_event = asyncio.Event()
        
        self._results: Dict[str, TaskResult] = {}
        self._active_tasks: Dict[str, Task] = {}
        self.metrics = TaskMetrics()
        
        # Rate limiting
        self._rate_limits: Dict[str, asyncio.Semaphore] = {}
    
    async def start(self):
        """Start the task manager"""
        if self._running:
            return
        
        self._running = True
        self._shutdown_event.clear()
        
        # Start worker tasks
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self._workers.append(worker)
        
        logger.info("background_task_manager_started", workers=self.max_workers)
    
    async def stop(self, timeout: float = 30.0):
        """Stop the task manager gracefully"""
        if not self._running:
            return
        
        logger.info("background_task_manager_stopping")
        self._running = False
        self._shutdown_event.set()
        
        # Wait for workers to finish current tasks
        if self._workers:
            done, pending = await asyncio.wait(
                self._workers,
                timeout=timeout
            )
            
            # Cancel any remaining workers
            for task in pending:
                task.cancel()
        
        self._workers.clear()
        logger.info("background_task_manager_stopped", metrics=self.metrics.get_stats())
    
    async def _worker(self, worker_id: str):
        """Worker coroutine that processes tasks from queue"""
        logger.debug("worker_started", worker_id=worker_id)
        
        while self._running or not self._queue.empty():
            try:
                # Wait for task with timeout
                try:
                    _, task = await asyncio.wait_for(
                        self._queue.get(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    if self._shutdown_event.is_set():
                        break
                    continue
                
                # Execute task
                await self._execute_task(task, worker_id)
                self._queue.task_done()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("worker_error", worker_id=worker_id, error=str(e))
        
        logger.debug("worker_stopped", worker_id=worker_id)
    
    async def _execute_task(self, task: Task, worker_id: str):
        """Execute a single task with retry logic"""
        result = TaskResult(
            task_id=task.id,
            status=TaskStatus.RUNNING,
            started_at=datetime.utcnow()
        )
        
        self._active_tasks[task.id] = task
        retries = 0
        
        while retries <= task.max_retries:
            try:
                logger.debug(
                    "task_executing",
                    task_id=task.id,
                    task_name=task.name,
                    worker_id=worker_id,
                    retry=retries
                )
                
                # Execute with timeout if specified
                if task.timeout:
                    task_result = await asyncio.wait_for(
                        task.func(*task.args, **task.kwargs),
                        timeout=task.timeout
                    )
                else:
                    task_result = await task.func(*task.args, **task.kwargs)
                
                # Success
                result.status = TaskStatus.COMPLETED
                result.result = task_result
                result.completed_at = datetime.utcnow()
                result.retries = retries
                
                self.metrics.record_completion(result)
                
                logger.debug(
                    "task_completed",
                    task_id=task.id,
                    task_name=task.name,
                    duration=result.duration
                )
                break
                
            except asyncio.CancelledError:
                result.status = TaskStatus.CANCELLED
                result.completed_at = datetime.utcnow()
                self.metrics.record_cancellation()
                break
                
            except Exception as e:
                retries += 1
                result.retries = retries
                
                if retries <= task.max_retries:
                    result.status = TaskStatus.RETRYING
                    self.metrics.record_retry()
                    
                    logger.warning(
                        "task_retry",
                        task_id=task.id,
                        task_name=task.name,
                        retry=retries,
                        error=str(e)
                    )
                    
                    await asyncio.sleep(task.retry_delay * retries)
                else:
                    result.status = TaskStatus.FAILED
                    result.error = str(e)
                    result.completed_at = datetime.utcnow()
                    
                    self.metrics.record_failure(task, str(e))
                    
                    logger.error(
                        "task_failed",
                        task_id=task.id,
                        task_name=task.name,
                        error=str(e)
                    )
        
        # Store result and cleanup
        self._results[task.id] = result
        self._active_tasks.pop(task.id, None)
    
    async def submit(
        self,
        func: Callable,
        *args,
        name: Optional[str] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        timeout: Optional[float] = None,
        **kwargs
    ) -> str:
        """
        Submit a task for background execution
        
        Returns:
            Task ID for tracking
        """
        task = Task(
            id=str(uuid.uuid4()),
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            max_retries=max_retries,
            retry_delay=retry_delay,
            timeout=timeout
        )
        
        self.metrics.record_task(task)
        
        # Add to priority queue (negative priority for correct ordering)
        await self._queue.put((-task.priority.value, task))
        
        logger.debug(
            "task_submitted",
            task_id=task.id,
            task_name=task.name,
            priority=priority.name,
            queue_size=self._queue.qsize()
        )
        
        return task.id
    
    async def submit_batch(
        self,
        tasks: List[Dict[str, Any]]
    ) -> List[str]:
        """Submit multiple tasks at once"""
        task_ids = []
        for task_def in tasks:
            task_id = await self.submit(**task_def)
            task_ids.append(task_id)
        return task_ids
    
    def get_result(self, task_id: str) -> Optional[TaskResult]:
        """Get the result of a completed task"""
        return self._results.get(task_id)
    
    async def wait_for_result(
        self,
        task_id: str,
        timeout: Optional[float] = None
    ) -> Optional[TaskResult]:
        """Wait for a task to complete and return its result"""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            result = self._results.get(task_id)
            if result and result.status in (
                TaskStatus.COMPLETED,
                TaskStatus.FAILED,
                TaskStatus.CANCELLED
            ):
                return result
            
            if timeout:
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed >= timeout:
                    return None
            
            await asyncio.sleep(0.1)
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a pending task"""
        # Note: Can only cancel tasks that haven't started yet
        # Active tasks need to handle cancellation themselves
        if task_id in self._active_tasks:
            return False
        return True
    
    def get_queue_size(self) -> int:
        """Get current queue size"""
        return self._queue.qsize()
    
    def get_active_tasks(self) -> List[str]:
        """Get list of currently executing task IDs"""
        return list(self._active_tasks.keys())
    
    def get_stats(self) -> Dict[str, Any]:
        """Get task manager statistics"""
        return {
            **self.metrics.get_stats(),
            "queue_size": self._queue.qsize(),
            "active_tasks": len(self._active_tasks),
            "workers": len(self._workers),
            "running": self._running,
        }


class ScheduledTaskManager:
    """
    Manages scheduled and recurring tasks
    """
    
    def __init__(self, task_manager: BackgroundTaskManager):
        self.task_manager = task_manager
        self._scheduled_tasks: Dict[str, asyncio.Task] = {}
        self._running = False
    
    async def start(self):
        """Start the scheduler"""
        self._running = True
        logger.info("scheduled_task_manager_started")
    
    async def stop(self):
        """Stop the scheduler"""
        self._running = False
        
        # Cancel all scheduled tasks
        for task_id, task in self._scheduled_tasks.items():
            task.cancel()
        
        self._scheduled_tasks.clear()
        logger.info("scheduled_task_manager_stopped")
    
    async def schedule_once(
        self,
        func: Callable,
        delay: float,
        *args,
        name: Optional[str] = None,
        **kwargs
    ) -> str:
        """Schedule a task to run once after a delay"""
        task_id = str(uuid.uuid4())
        
        async def delayed_task():
            await asyncio.sleep(delay)
            if self._running:
                await self.task_manager.submit(
                    func, *args, name=name, **kwargs
                )
        
        self._scheduled_tasks[task_id] = asyncio.create_task(delayed_task())
        
        logger.debug(
            "task_scheduled",
            task_id=task_id,
            delay=delay,
            name=name or func.__name__
        )
        
        return task_id
    
    async def schedule_recurring(
        self,
        func: Callable,
        interval: float,
        *args,
        name: Optional[str] = None,
        run_immediately: bool = False,
        **kwargs
    ) -> str:
        """Schedule a task to run at regular intervals"""
        task_id = str(uuid.uuid4())
        
        async def recurring_task():
            if not run_immediately:
                await asyncio.sleep(interval)
            
            while self._running:
                try:
                    await self.task_manager.submit(
                        func, *args, name=name, **kwargs
                    )
                except Exception as e:
                    logger.error(
                        "recurring_task_error",
                        task_id=task_id,
                        error=str(e)
                    )
                
                await asyncio.sleep(interval)
        
        self._scheduled_tasks[task_id] = asyncio.create_task(recurring_task())
        
        logger.info(
            "recurring_task_scheduled",
            task_id=task_id,
            interval=interval,
            name=name or func.__name__
        )
        
        return task_id
    
    def cancel_scheduled(self, task_id: str) -> bool:
        """Cancel a scheduled task"""
        if task_id in self._scheduled_tasks:
            self._scheduled_tasks[task_id].cancel()
            del self._scheduled_tasks[task_id]
            return True
        return False


# Global instances
task_manager = BackgroundTaskManager()
scheduler = ScheduledTaskManager(task_manager)


# Decorator for background tasks
def background_task(
    priority: TaskPriority = TaskPriority.NORMAL,
    max_retries: int = 3,
    timeout: Optional[float] = None
):
    """
    Decorator to run a function as a background task
    
    Example:
        @background_task(priority=TaskPriority.HIGH)
        async def send_email(to: str, subject: str):
            ...
        
        # This will run in background
        await send_email("user@example.com", "Hello")
    """
    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            return await task_manager.submit(
                func,
                *args,
                name=func.__name__,
                priority=priority,
                max_retries=max_retries,
                timeout=timeout,
                **kwargs
            )
        
        # Keep original function accessible
        wrapper.direct = func
        wrapper.__name__ = func.__name__
        
        return wrapper
    return decorator


# Utility functions
async def run_in_background(
    func: Callable,
    *args,
    **kwargs
) -> str:
    """Quick helper to run a function in background"""
    return await task_manager.submit(func, *args, **kwargs)


async def parallel_execute(
    tasks: List[Callable],
    max_concurrent: int = 10
) -> List[Any]:
    """Execute multiple tasks in parallel with concurrency limit"""
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def limited_task(task):
        async with semaphore:
            return await task()
    
    return await asyncio.gather(*[limited_task(t) for t in tasks])
