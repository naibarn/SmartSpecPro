"""
Unit tests for Error Handling
"""

import pytest
import asyncio
from decimal import Decimal
from unittest.mock import Mock, AsyncMock, patch
from app.core.error_handling import (
    RetryableError,
    NonRetryableError,
    ExternalAPIError,
    DatabaseError,
    ValidationError,
    InsufficientCreditsError,
    retry_with_exponential_backoff,
    handle_errors,
    ErrorContext,
    safe_decimal_conversion,
    safe_int_conversion
)


class TestErrorClasses:
    """Test custom error classes"""
    
    def test_retryable_error(self):
        """Test RetryableError can be raised"""
        with pytest.raises(RetryableError):
            raise RetryableError("Test error")
    
    def test_non_retryable_error(self):
        """Test NonRetryableError can be raised"""
        with pytest.raises(NonRetryableError):
            raise NonRetryableError("Test error")
    
    def test_external_api_error(self):
        """Test ExternalAPIError is retryable"""
        error = ExternalAPIError("API failed")
        assert isinstance(error, RetryableError)
    
    def test_database_error(self):
        """Test DatabaseError is retryable"""
        error = DatabaseError("DB failed")
        assert isinstance(error, RetryableError)
    
    def test_validation_error(self):
        """Test ValidationError is non-retryable"""
        error = ValidationError("Invalid input")
        assert isinstance(error, NonRetryableError)
    
    def test_insufficient_credits_error(self):
        """Test InsufficientCreditsError is non-retryable"""
        error = InsufficientCreditsError("No credits")
        assert isinstance(error, NonRetryableError)


class TestRetryDecorator:
    """Test retry_with_exponential_backoff decorator"""
    
    @pytest.mark.asyncio
    async def test_async_success_no_retry(self):
        """Test async function succeeds without retry"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3)
        async def test_func():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = await test_func()
        
        assert result == "success"
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_async_retry_then_success(self):
        """Test async function retries then succeeds"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RetryableError("Temporary failure")
            return "success"
        
        result = await test_func()
        
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_async_max_retries_exceeded(self):
        """Test async function exhausts retries"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise RetryableError("Persistent failure")
        
        with pytest.raises(RetryableError):
            await test_func()
        
        assert call_count == 3  # Initial + 2 retries
    
    @pytest.mark.asyncio
    async def test_async_non_retryable_error(self):
        """Test async function doesn't retry non-retryable errors"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3)
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise NonRetryableError("Non-retryable")
        
        with pytest.raises(NonRetryableError):
            await test_func()
        
        assert call_count == 1  # No retries
    
    @pytest.mark.asyncio
    async def test_async_unexpected_error(self):
        """Test async function doesn't retry unexpected errors"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3)
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise ValueError("Unexpected error")
        
        with pytest.raises(ValueError):
            await test_func()
        
        assert call_count == 1  # No retries
    
    @pytest.mark.asyncio
    async def test_async_exponential_backoff(self):
        """Test exponential backoff timing"""
        call_times = []
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.1, exponential_base=2.0)
        async def test_func():
            call_times.append(asyncio.get_event_loop().time())
            raise RetryableError("Fail")
        
        start_time = asyncio.get_event_loop().time()
        
        with pytest.raises(RetryableError):
            await test_func()
        
        # Verify delays are increasing
        assert len(call_times) == 3
        # First retry should wait ~0.1s, second ~0.2s
        # Total time should be > 0.3s
        total_time = asyncio.get_event_loop().time() - start_time
        assert total_time >= 0.3
    
    def test_sync_success_no_retry(self):
        """Test sync function succeeds without retry"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3)
        def test_func():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = test_func()
        
        assert result == "success"
        assert call_count == 1
    
    def test_sync_retry_then_success(self):
        """Test sync function retries then succeeds"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RetryableError("Temporary failure")
            return "success"
        
        result = test_func()
        
        assert result == "success"
        assert call_count == 3
    
    def test_sync_max_retries_exceeded(self):
        """Test sync function exhausts retries"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        def test_func():
            nonlocal call_count
            call_count += 1
            raise RetryableError("Persistent failure")
        
        with pytest.raises(RetryableError):
            test_func()
        
        assert call_count == 3
    
    def test_sync_non_retryable_error(self):
        """Test sync function doesn't retry non-retryable errors"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3)
        def test_func():
            nonlocal call_count
            call_count += 1
            raise NonRetryableError("Non-retryable")
        
        with pytest.raises(NonRetryableError):
            test_func()
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_custom_retryable_exceptions(self):
        """Test custom retryable exceptions"""
        call_count = 0
        
        @retry_with_exponential_backoff(
            max_retries=2,
            initial_delay=0.01,
            retryable_exceptions=(ValueError,)
        )
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ValueError("Retryable ValueError")
            return "success"
        
        result = await test_func()
        
        assert result == "success"
        assert call_count == 2


class TestHandleErrorsDecorator:
    """Test handle_errors decorator"""
    
    @pytest.mark.asyncio
    async def test_async_success(self):
        """Test async function succeeds"""
        @handle_errors("Operation failed")
        async def test_func():
            return "success"
        
        result = await test_func()
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_async_validation_error(self):
        """Test async function with validation error"""
        @handle_errors("Operation failed")
        async def test_func():
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            await test_func()
    
    @pytest.mark.asyncio
    async def test_async_insufficient_credits_error(self):
        """Test async function with insufficient credits error"""
        @handle_errors("Operation failed")
        async def test_func():
            raise InsufficientCreditsError("No credits")
        
        with pytest.raises(InsufficientCreditsError):
            await test_func()
    
    @pytest.mark.asyncio
    async def test_async_non_retryable_error(self):
        """Test async function with non-retryable error"""
        @handle_errors("Operation failed")
        async def test_func():
            raise NonRetryableError("Cannot retry")
        
        with pytest.raises(NonRetryableError):
            await test_func()
    
    @pytest.mark.asyncio
    async def test_async_unexpected_error(self):
        """Test async function with unexpected error"""
        @handle_errors("Operation failed")
        async def test_func():
            raise RuntimeError("Unexpected")
        
        with pytest.raises(RuntimeError):
            await test_func()
    
    def test_sync_success(self):
        """Test sync function succeeds"""
        @handle_errors("Operation failed")
        def test_func():
            return "success"
        
        result = test_func()
        assert result == "success"
    
    def test_sync_validation_error(self):
        """Test sync function with validation error"""
        @handle_errors("Operation failed")
        def test_func():
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            test_func()


class TestErrorContext:
    """Test ErrorContext context manager"""
    
    @pytest.mark.asyncio
    async def test_success_no_cleanup(self):
        """Test context manager with successful operation"""
        async with ErrorContext("Test operation") as ctx:
            result = "success"
        
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_error_with_cleanup(self):
        """Test context manager with error and cleanup"""
        cleanup_called = False
        
        def cleanup():
            nonlocal cleanup_called
            cleanup_called = True
        
        with pytest.raises(ValueError):
            async with ErrorContext("Test operation") as ctx:
                ctx.add_cleanup(cleanup)
                raise ValueError("Test error")
        
        assert cleanup_called
    
    @pytest.mark.asyncio
    async def test_async_cleanup(self):
        """Test context manager with async cleanup"""
        cleanup_called = False
        
        async def async_cleanup():
            nonlocal cleanup_called
            cleanup_called = True
        
        with pytest.raises(ValueError):
            async with ErrorContext("Test operation") as ctx:
                ctx.add_cleanup(async_cleanup)
                raise ValueError("Test error")
        
        assert cleanup_called
    
    @pytest.mark.asyncio
    async def test_multiple_cleanups(self):
        """Test context manager with multiple cleanup functions"""
        cleanup_order = []
        
        def cleanup1():
            cleanup_order.append(1)
        
        def cleanup2():
            cleanup_order.append(2)
        
        with pytest.raises(ValueError):
            async with ErrorContext("Test operation") as ctx:
                ctx.add_cleanup(cleanup1)
                ctx.add_cleanup(cleanup2)
                raise ValueError("Test error")
        
        assert cleanup_order == [1, 2]
    
    @pytest.mark.asyncio
    async def test_cleanup_error_handling(self):
        """Test context manager handles cleanup errors"""
        def failing_cleanup():
            raise RuntimeError("Cleanup failed")
        
        # Original error should still be raised
        with pytest.raises(ValueError):
            async with ErrorContext("Test operation") as ctx:
                ctx.add_cleanup(failing_cleanup)
                raise ValueError("Test error")


class TestSafeConversions:
    """Test safe conversion functions"""
    
    def test_safe_decimal_conversion_from_int(self):
        """Test decimal conversion from int"""
        result = safe_decimal_conversion(123)
        assert result == Decimal("123")
    
    def test_safe_decimal_conversion_from_float(self):
        """Test decimal conversion from float"""
        result = safe_decimal_conversion(123.45)
        assert result == Decimal("123.45")
    
    def test_safe_decimal_conversion_from_string(self):
        """Test decimal conversion from string"""
        result = safe_decimal_conversion("123.45")
        assert result == Decimal("123.45")
    
    def test_safe_decimal_conversion_from_decimal(self):
        """Test decimal conversion from decimal"""
        value = Decimal("123.45")
        result = safe_decimal_conversion(value)
        assert result == value
    
    def test_safe_decimal_conversion_none(self):
        """Test decimal conversion from None"""
        result = safe_decimal_conversion(None)
        assert result == Decimal("0")
    
    def test_safe_decimal_conversion_custom_default(self):
        """Test decimal conversion with custom default"""
        result = safe_decimal_conversion(None, default=Decimal("100"))
        assert result == Decimal("100")
    
    def test_safe_decimal_conversion_invalid_type(self):
        """Test decimal conversion from invalid type"""
        result = safe_decimal_conversion([1, 2, 3])
        assert result == Decimal("0")
    
    def test_safe_decimal_conversion_invalid_string(self):
        """Test decimal conversion from invalid string"""
        result = safe_decimal_conversion("not a number")
        assert result == Decimal("0")
    
    def test_safe_int_conversion_from_int(self):
        """Test int conversion from int"""
        result = safe_int_conversion(123)
        assert result == 123
    
    def test_safe_int_conversion_from_float(self):
        """Test int conversion from float"""
        result = safe_int_conversion(123.99)
        assert result == 123
    
    def test_safe_int_conversion_from_string(self):
        """Test int conversion from string"""
        result = safe_int_conversion("123")
        assert result == 123
    
    def test_safe_int_conversion_from_decimal(self):
        """Test int conversion from Decimal"""
        result = safe_int_conversion(Decimal("123.45"))
        assert result == 123
    
    def test_safe_int_conversion_none(self):
        """Test int conversion from None"""
        result = safe_int_conversion(None)
        assert result == 0
    
    def test_safe_int_conversion_custom_default(self):
        """Test int conversion with custom default"""
        result = safe_int_conversion(None, default=100)
        assert result == 100
    
    def test_safe_int_conversion_invalid_type(self):
        """Test int conversion from invalid type"""
        result = safe_int_conversion([1, 2, 3])
        assert result == 0
    
    def test_safe_int_conversion_invalid_string(self):
        """Test int conversion from invalid string"""
        result = safe_int_conversion("not a number")
        assert result == 0
