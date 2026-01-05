"""
Comprehensive Error Handling
Centralized error handling with retry logic and proper error responses
"""

import asyncio
import functools
import time
from typing import Callable, Any, Optional, Type
from decimal import Decimal
import structlog

logger = structlog.get_logger()


class RetryableError(Exception):
    """Base class for errors that should be retried"""
    pass


class NonRetryableError(Exception):
    """Base class for errors that should not be retried"""
    pass


class ExternalAPIError(RetryableError):
    """External API call failed"""
    pass


class DatabaseError(RetryableError):
    """Database operation failed"""
    pass


class ValidationError(NonRetryableError):
    """Input validation failed"""
    pass


class InsufficientCreditsError(NonRetryableError):
    """User has insufficient credits"""
    pass


def retry_with_exponential_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    retryable_exceptions: tuple = (RetryableError, asyncio.TimeoutError, ConnectionError)
):
    """
    Decorator for retrying functions with exponential backoff
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff
        retryable_exceptions: Tuple of exceptions to retry on
    
    Example:
        @retry_with_exponential_backoff(max_retries=3)
        async def call_external_api():
            ...
    """
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            delay = initial_delay
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                
                except retryable_exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(
                            "retry_exhausted",
                            function=func.__name__,
                            attempts=attempt + 1,
                            error=str(e)
                        )
                        raise
                    
                    logger.warning(
                        "retry_attempt",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        delay=delay,
                        error=str(e)
                    )
                    
                    await asyncio.sleep(delay)
                    delay = min(delay * exponential_base, max_delay)
                
                except NonRetryableError:
                    # Don't retry non-retryable errors
                    raise
                
                except Exception as e:
                    # Unknown exception, don't retry
                    logger.error(
                        "unexpected_error",
                        function=func.__name__,
                        error=str(e),
                        error_type=type(e).__name__
                    )
                    raise
            
            # Should never reach here
            raise last_exception
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            delay = initial_delay
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                
                except retryable_exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(
                            "retry_exhausted",
                            function=func.__name__,
                            attempts=attempt + 1,
                            error=str(e)
                        )
                        raise
                    
                    logger.warning(
                        "retry_attempt",
                        function=func.__name__,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        delay=delay,
                        error=str(e)
                    )
                    
                    time.sleep(delay)
                    delay = min(delay * exponential_base, max_delay)
                
                except NonRetryableError:
                    raise
                
                except Exception as e:
                    logger.error(
                        "unexpected_error",
                        function=func.__name__,
                        error=str(e),
                        error_type=type(e).__name__
                    )
                    raise
            
            raise last_exception
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def handle_errors(
    error_message: str = "Operation failed",
    log_level: str = "error"
):
    """
    Decorator for handling errors with proper logging
    
    Args:
        error_message: Default error message
        log_level: Log level (error, warning, info)
    
    Example:
        @handle_errors("Failed to process payment")
        async def process_payment():
            ...
    """
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            try:
                return await func(*args, **kwargs)
            
            except ValidationError as e:
                logger.warning(
                    "validation_error",
                    function=func.__name__,
                    error=str(e)
                )
                raise
            
            except InsufficientCreditsError as e:
                logger.info(
                    "insufficient_credits",
                    function=func.__name__,
                    error=str(e)
                )
                raise
            
            except NonRetryableError as e:
                getattr(logger, log_level)(
                    "non_retryable_error",
                    function=func.__name__,
                    error=str(e),
                    error_type=type(e).__name__
                )
                raise
            
            except Exception as e:
                getattr(logger, log_level)(
                    "unexpected_error",
                    function=func.__name__,
                    error_message=error_message,
                    error=str(e),
                    error_type=type(e).__name__
                )
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            try:
                return func(*args, **kwargs)
            
            except ValidationError as e:
                logger.warning(
                    "validation_error",
                    function=func.__name__,
                    error=str(e)
                )
                raise
            
            except InsufficientCreditsError as e:
                logger.info(
                    "insufficient_credits",
                    function=func.__name__,
                    error=str(e)
                )
                raise
            
            except NonRetryableError as e:
                getattr(logger, log_level)(
                    "non_retryable_error",
                    function=func.__name__,
                    error=str(e),
                    error_type=type(e).__name__
                )
                raise
            
            except Exception as e:
                getattr(logger, log_level)(
                    "unexpected_error",
                    function=func.__name__,
                    error_message=error_message,
                    error=str(e),
                    error_type=type(e).__name__
                )
                raise
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class ErrorContext:
    """
    Context manager for error handling with cleanup
    
    Example:
        async with ErrorContext("Processing payment") as ctx:
            # Do something
            ctx.add_cleanup(lambda: cleanup_resources())
    """
    
    def __init__(self, operation: str):
        self.operation = operation
        self.cleanup_functions = []
    
    def add_cleanup(self, cleanup_func: Callable):
        """Add cleanup function to be called on error"""
        self.cleanup_functions.append(cleanup_func)
    
    async def __aenter__(self):
        logger.info("operation_started", operation=self.operation)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            logger.error(
                "operation_failed",
                operation=self.operation,
                error=str(exc_val),
                error_type=exc_type.__name__
            )
            
            # Run cleanup functions
            for cleanup_func in self.cleanup_functions:
                try:
                    if asyncio.iscoroutinefunction(cleanup_func):
                        await cleanup_func()
                    else:
                        cleanup_func()
                except Exception as e:
                    logger.error(
                        "cleanup_failed",
                        operation=self.operation,
                        error=str(e)
                    )
        else:
            logger.info("operation_completed", operation=self.operation)
        
        return False  # Don't suppress exception


def safe_decimal_conversion(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    """
    Safely convert value to Decimal
    
    Args:
        value: Value to convert
        default: Default value if conversion fails
    
    Returns:
        Decimal value
    """
    try:
        if value is None:
            return default
        
        if isinstance(value, Decimal):
            return value
        
        if isinstance(value, (int, float, str)):
            return Decimal(str(value))
        
        logger.warning(
            "decimal_conversion_failed",
            value=value,
            value_type=type(value).__name__
        )
        return default
    
    except Exception as e:
        logger.error(
            "decimal_conversion_error",
            value=value,
            error=str(e)
        )
        return default


def safe_int_conversion(value: Any, default: int = 0) -> int:
    """
    Safely convert value to int
    
    Args:
        value: Value to convert
        default: Default value if conversion fails
    
    Returns:
        Integer value
    """
    try:
        if value is None:
            return default
        
        if isinstance(value, int):
            return value
        
        if isinstance(value, (float, str, Decimal)):
            return int(value)
        
        logger.warning(
            "int_conversion_failed",
            value=value,
            value_type=type(value).__name__
        )
        return default
    
    except Exception as e:
        logger.error(
            "int_conversion_error",
            value=value,
            error=str(e)
        )
        return default
