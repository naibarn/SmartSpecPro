"""
SmartSpec Pro - Error Handling
Phase 0.4

Custom exceptions and error handlers
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status
import structlog

logger = structlog.get_logger()


class SmartSpecError(Exception):
    """Base exception for SmartSpec Pro"""
    
    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code or "SMARTSPEC_ERROR"
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(SmartSpecError):
    """Input validation error"""
    
    def __init__(self, message: str, field: Optional[str] = None, **kwargs):
        details = {"field": field} if field else {}
        details.update(kwargs)
        super().__init__(message, "VALIDATION_ERROR", details)


class SecurityError(SmartSpecError):
    """Security-related error"""
    
    def __init__(self, message: str, **kwargs):
        super().__init__(message, "SECURITY_ERROR", kwargs)


class WorkflowError(SmartSpecError):
    """Workflow execution error"""
    
    def __init__(self, message: str, workflow_id: Optional[str] = None, **kwargs):
        details = {"workflow_id": workflow_id} if workflow_id else {}
        details.update(kwargs)
        super().__init__(message, "WORKFLOW_ERROR", details)


class ExecutionError(SmartSpecError):
    """Execution error"""
    
    def __init__(
        self,
        message: str,
        execution_id: Optional[str] = None,
        step_id: Optional[str] = None,
        **kwargs
    ):
        details = {}
        if execution_id:
            details["execution_id"] = execution_id
        if step_id:
            details["step_id"] = step_id
        details.update(kwargs)
        super().__init__(message, "EXECUTION_ERROR", details)


class LLMError(SmartSpecError):
    """LLM-related error"""
    
    def __init__(
        self,
        message: str,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ):
        details = {}
        if provider:
            details["provider"] = provider
        if model:
            details["model"] = model
        details.update(kwargs)
        super().__init__(message, "LLM_ERROR", details)


class CheckpointError(SmartSpecError):
    """Checkpoint-related error"""
    
    def __init__(self, message: str, checkpoint_id: Optional[str] = None, **kwargs):
        details = {"checkpoint_id": checkpoint_id} if checkpoint_id else {}
        details.update(kwargs)
        super().__init__(message, "CHECKPOINT_ERROR", details)


class ResourceNotFoundError(SmartSpecError):
    """Resource not found error"""
    
    def __init__(self, resource_type: str, resource_id: str, **kwargs):
        message = f"{resource_type} not found: {resource_id}"
        details = {"resource_type": resource_type, "resource_id": resource_id}
        details.update(kwargs)
        super().__init__(message, "RESOURCE_NOT_FOUND", details)


class RateLimitError(SmartSpecError):
    """Rate limit exceeded error"""
    
    def __init__(self, message: str = "Rate limit exceeded", **kwargs):
        super().__init__(message, "RATE_LIMIT_EXCEEDED", kwargs)


class ConfigurationError(SmartSpecError):
    """Configuration error"""
    
    def __init__(self, message: str, config_key: Optional[str] = None, **kwargs):
        details = {"config_key": config_key} if config_key else {}
        details.update(kwargs)
        super().__init__(message, "CONFIGURATION_ERROR", details)


def to_http_exception(error: SmartSpecError) -> HTTPException:
    """
    Convert SmartSpec error to HTTP exception
    
    Args:
        error: SmartSpec error
    
    Returns:
        HTTPException
    """
    status_code_map = {
        "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
        "SECURITY_ERROR": status.HTTP_403_FORBIDDEN,
        "RESOURCE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "RATE_LIMIT_EXCEEDED": status.HTTP_429_TOO_MANY_REQUESTS,
        "CONFIGURATION_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "WORKFLOW_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "EXECUTION_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "LLM_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "CHECKPOINT_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
    }
    
    status_code = status_code_map.get(error.error_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return HTTPException(
        status_code=status_code,
        detail={
            "error": error.error_code,
            "message": error.message,
            "details": error.details
        }
    )


class ErrorHandler:
    """Centralized error handling"""
    
    @staticmethod
    def handle_error(error: Exception, context: Optional[Dict[str, Any]] = None):
        """
        Handle error with logging and optional recovery
        
        Args:
            error: Exception to handle
            context: Additional context for logging
        """
        context = context or {}
        
        if isinstance(error, SmartSpecError):
            logger.error(
                "SmartSpec error",
                error_code=error.error_code,
                message=error.message,
                details=error.details,
                **context
            )
        else:
            logger.error(
                "Unexpected error",
                error=str(error),
                error_type=type(error).__name__,
                **context,
                exc_info=error
            )
    
    @staticmethod
    def should_retry(error: Exception, retry_count: int, max_retries: int = 3) -> bool:
        """
        Determine if operation should be retried
        
        Args:
            error: Exception that occurred
            retry_count: Current retry count
            max_retries: Maximum retries allowed
        
        Returns:
            True if should retry, False otherwise
        """
        if retry_count >= max_retries:
            return False
        
        # Retry on transient errors
        retryable_errors = (
            LLMError,
            ExecutionError,
        )
        
        # Don't retry on validation or security errors
        non_retryable_errors = (
            ValidationError,
            SecurityError,
            ResourceNotFoundError,
        )
        
        if isinstance(error, non_retryable_errors):
            return False
        
        if isinstance(error, retryable_errors):
            return True
        
        # Default: retry on unknown errors
        return True
    
    @staticmethod
    async def with_retry(
        func,
        max_retries: int = 3,
        context: Optional[Dict[str, Any]] = None
    ):
        """
        Execute function with retry logic
        
        Args:
            func: Async function to execute
            max_retries: Maximum retries
            context: Additional context for logging
        
        Returns:
            Function result
        
        Raises:
            Last exception if all retries fail
        """
        import asyncio
        
        retry_count = 0
        last_error = None
        
        while retry_count <= max_retries:
            try:
                return await func()
            except Exception as e:
                last_error = e
                ErrorHandler.handle_error(e, context)
                
                if not ErrorHandler.should_retry(e, retry_count, max_retries):
                    raise
                
                retry_count += 1
                
                if retry_count <= max_retries:
                    delay = 2 ** retry_count  # Exponential backoff
                    logger.info(
                        "Retrying operation",
                        retry_count=retry_count,
                        max_retries=max_retries,
                        delay_seconds=delay
                    )
                    await asyncio.sleep(delay)
        
        # All retries failed
        raise last_error


# Global error handler instance
error_handler = ErrorHandler()
