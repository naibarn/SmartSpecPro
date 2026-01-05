"""
Unit Tests for Error Handling Module
Tests retry logic, error classes, and error responses
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

from app.core.error_handling import (
    RetryableError,
    NonRetryableError,
    ExternalAPIError,
    DatabaseError,
    ValidationError,
    InsufficientCreditsError,
    retry_with_exponential_backoff
)


class TestErrorClasses:
    """Test error class hierarchy"""
    
    def test_retryable_error(self):
        """Test RetryableError can be raised"""
        with pytest.raises(RetryableError):
            raise RetryableError("Test error")
    
    def test_non_retryable_error(self):
        """Test NonRetryableError can be raised"""
        with pytest.raises(NonRetryableError):
            raise NonRetryableError("Test error")
    
    def test_external_api_error_is_retryable(self):
        """Test ExternalAPIError is a RetryableError"""
        error = ExternalAPIError("API failed")
        assert isinstance(error, RetryableError)
    
    def test_database_error_is_retryable(self):
        """Test DatabaseError is a RetryableError"""
        error = DatabaseError("DB failed")
        assert isinstance(error, RetryableError)
    
    def test_validation_error_is_non_retryable(self):
        """Test ValidationError is a NonRetryableError"""
        error = ValidationError("Invalid input")
        assert isinstance(error, NonRetryableError)
    
    def test_insufficient_credits_error_is_non_retryable(self):
        """Test InsufficientCreditsError is a NonRetryableError"""
        error = InsufficientCreditsError("No credits")
        assert isinstance(error, NonRetryableError)


class TestRetryDecorator:
    """Test retry with exponential backoff decorator"""
    
    @pytest.mark.asyncio
    async def test_successful_call_no_retry(self):
        """Test that successful call doesn't retry"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        async def successful_function():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = await successful_function()
        
        assert result == "success"
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_retry_on_retryable_error(self):
        """Test that function retries on RetryableError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        async def failing_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ExternalAPIError("API failed")
            return "success"
        
        result = await failing_then_success()
        
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_no_retry_on_non_retryable_error(self):
        """Test that function doesn't retry on NonRetryableError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        async def non_retryable_failure():
            nonlocal call_count
            call_count += 1
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            await non_retryable_failure()
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_max_retries_exhausted(self):
        """Test that error is raised after max retries"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        async def always_failing():
            nonlocal call_count
            call_count += 1
            raise ExternalAPIError("Always fails")
        
        with pytest.raises(ExternalAPIError):
            await always_failing()
        
        # Initial call + 2 retries = 3 total calls
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_retry_on_timeout_error(self):
        """Test that function retries on TimeoutError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        async def timeout_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise asyncio.TimeoutError()
            return "success"
        
        result = await timeout_then_success()
        
        assert result == "success"
        assert call_count == 2
    
    @pytest.mark.asyncio
    async def test_retry_on_connection_error(self):
        """Test that function retries on ConnectionError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        async def connection_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError()
            return "success"
        
        result = await connection_then_success()
        
        assert result == "success"
        assert call_count == 2


class TestRetryDecoratorParameters:
    """Test retry decorator parameters"""
    
    @pytest.mark.asyncio
    async def test_custom_max_retries(self):
        """Test custom max_retries parameter"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=5, initial_delay=0.01)
        async def always_failing():
            nonlocal call_count
            call_count += 1
            raise ExternalAPIError("Fails")
        
        with pytest.raises(ExternalAPIError):
            await always_failing()
        
        # Initial + 5 retries = 6
        assert call_count == 6
    
    @pytest.mark.asyncio
    async def test_zero_retries(self):
        """Test with zero retries"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=0, initial_delay=0.01)
        async def no_retry_function():
            nonlocal call_count
            call_count += 1
            raise ExternalAPIError("Fails")
        
        with pytest.raises(ExternalAPIError):
            await no_retry_function()
        
        assert call_count == 1


class TestErrorMessages:
    """Test error messages"""
    
    def test_retryable_error_message(self):
        """Test RetryableError has correct message"""
        error = RetryableError("Custom message")
        assert str(error) == "Custom message"
    
    def test_external_api_error_message(self):
        """Test ExternalAPIError has correct message"""
        error = ExternalAPIError("API timeout")
        assert str(error) == "API timeout"
    
    def test_validation_error_message(self):
        """Test ValidationError has correct message"""
        error = ValidationError("Invalid email format")
        assert str(error) == "Invalid email format"
    
    def test_insufficient_credits_error_message(self):
        """Test InsufficientCreditsError has correct message"""
        error = InsufficientCreditsError("Balance: 0")
        assert str(error) == "Balance: 0"


class TestErrorInheritance:
    """Test error class inheritance"""
    
    def test_retryable_error_is_exception(self):
        """Test RetryableError inherits from Exception"""
        assert issubclass(RetryableError, Exception)
    
    def test_non_retryable_error_is_exception(self):
        """Test NonRetryableError inherits from Exception"""
        assert issubclass(NonRetryableError, Exception)
    
    def test_external_api_error_inheritance(self):
        """Test ExternalAPIError inheritance chain"""
        assert issubclass(ExternalAPIError, RetryableError)
        assert issubclass(ExternalAPIError, Exception)
    
    def test_database_error_inheritance(self):
        """Test DatabaseError inheritance chain"""
        assert issubclass(DatabaseError, RetryableError)
        assert issubclass(DatabaseError, Exception)
    
    def test_validation_error_inheritance(self):
        """Test ValidationError inheritance chain"""
        assert issubclass(ValidationError, NonRetryableError)
        assert issubclass(ValidationError, Exception)


class TestExceptionCatching:
    """Test exception catching behavior"""
    
    def test_catch_retryable_errors(self):
        """Test catching all retryable errors"""
        errors = [
            ExternalAPIError("API"),
            DatabaseError("DB")
        ]
        
        for error in errors:
            try:
                raise error
            except RetryableError as e:
                assert True
            except Exception:
                pytest.fail(f"{type(error).__name__} should be caught as RetryableError")
    
    def test_catch_non_retryable_errors(self):
        """Test catching all non-retryable errors"""
        errors = [
            ValidationError("Validation"),
            InsufficientCreditsError("Credits")
        ]
        
        for error in errors:
            try:
                raise error
            except NonRetryableError as e:
                assert True
            except Exception:
                pytest.fail(f"{type(error).__name__} should be caught as NonRetryableError")


# =============================================================================
# Additional Tests for Uncovered Code Paths
# =============================================================================

class TestSyncRetryDecorator:
    """Test sync version of retry decorator"""
    
    def test_sync_successful_call(self):
        """Test sync function succeeds without retry"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        def sync_success():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = sync_success()
        assert result == "success"
        assert call_count == 1
    
    def test_sync_retry_on_retryable_error(self):
        """Test sync function retries on RetryableError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        def sync_failing():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ExternalAPIError("API failed")
            return "success"
        
        result = sync_failing()
        assert result == "success"
        assert call_count == 3
    
    def test_sync_max_retries_exhausted(self):
        """Test sync function raises after max retries"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=2, initial_delay=0.01)
        def sync_always_fails():
            nonlocal call_count
            call_count += 1
            raise DatabaseError("DB failed")
        
        with pytest.raises(DatabaseError):
            sync_always_fails()
        
        assert call_count == 3  # Initial + 2 retries
    
    def test_sync_no_retry_on_non_retryable(self):
        """Test sync function doesn't retry NonRetryableError"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        def sync_validation_fail():
            nonlocal call_count
            call_count += 1
            raise ValidationError("Invalid")
        
        with pytest.raises(ValidationError):
            sync_validation_fail()
        
        assert call_count == 1
    
    def test_sync_unexpected_exception(self):
        """Test sync function handles unexpected exceptions"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        def sync_unexpected():
            nonlocal call_count
            call_count += 1
            raise ValueError("Unexpected")
        
        with pytest.raises(ValueError):
            sync_unexpected()
        
        assert call_count == 1


class TestAsyncUnexpectedException:
    """Test async unexpected exception handling"""
    
    @pytest.mark.asyncio
    async def test_async_unexpected_exception(self):
        """Test async function handles unexpected exceptions"""
        call_count = 0
        
        @retry_with_exponential_backoff(max_retries=3, initial_delay=0.01)
        async def async_unexpected():
            nonlocal call_count
            call_count += 1
            raise ValueError("Unexpected error")
        
        with pytest.raises(ValueError):
            await async_unexpected()
        
        assert call_count == 1


class TestHandleErrorsDecorator:
    """Test handle_errors decorator"""
    
    @pytest.mark.asyncio
    async def test_async_handle_errors_success(self):
        """Test async function succeeds with handle_errors"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        async def async_success():
            return "success"
        
        result = await async_success()
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_async_handle_errors_validation_error(self):
        """Test async function handles ValidationError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        async def async_validation_fail():
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            await async_validation_fail()
    
    @pytest.mark.asyncio
    async def test_async_handle_errors_insufficient_credits(self):
        """Test async function handles InsufficientCreditsError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        async def async_credits_fail():
            raise InsufficientCreditsError("No credits")
        
        with pytest.raises(InsufficientCreditsError):
            await async_credits_fail()
    
    @pytest.mark.asyncio
    async def test_async_handle_errors_non_retryable(self):
        """Test async function handles NonRetryableError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        async def async_non_retryable():
            raise NonRetryableError("Cannot retry")
        
        with pytest.raises(NonRetryableError):
            await async_non_retryable()
    
    @pytest.mark.asyncio
    async def test_async_handle_errors_unexpected(self):
        """Test async function handles unexpected exceptions"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        async def async_unexpected():
            raise RuntimeError("Unexpected")
        
        with pytest.raises(RuntimeError):
            await async_unexpected()
    
    def test_sync_handle_errors_success(self):
        """Test sync function succeeds with handle_errors"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        def sync_success():
            return "success"
        
        result = sync_success()
        assert result == "success"
    
    def test_sync_handle_errors_validation_error(self):
        """Test sync function handles ValidationError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        def sync_validation_fail():
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            sync_validation_fail()
    
    def test_sync_handle_errors_insufficient_credits(self):
        """Test sync function handles InsufficientCreditsError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        def sync_credits_fail():
            raise InsufficientCreditsError("No credits")
        
        with pytest.raises(InsufficientCreditsError):
            sync_credits_fail()
    
    def test_sync_handle_errors_non_retryable(self):
        """Test sync function handles NonRetryableError"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        def sync_non_retryable():
            raise NonRetryableError("Cannot retry")
        
        with pytest.raises(NonRetryableError):
            sync_non_retryable()
    
    def test_sync_handle_errors_unexpected(self):
        """Test sync function handles unexpected exceptions"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test operation failed")
        def sync_unexpected():
            raise RuntimeError("Unexpected")
        
        with pytest.raises(RuntimeError):
            sync_unexpected()
    
    def test_handle_errors_custom_log_level(self):
        """Test handle_errors with custom log level"""
        from app.core.error_handling import handle_errors
        
        @handle_errors("Test failed", log_level="warning")
        def sync_with_warning():
            raise RuntimeError("Warning level error")
        
        with pytest.raises(RuntimeError):
            sync_with_warning()



class TestErrorContext:
    """Test ErrorContext context manager"""
    
    @pytest.mark.asyncio
    async def test_error_context_success(self):
        """Test ErrorContext with successful operation"""
        from app.core.error_handling import ErrorContext
        
        async with ErrorContext("test_operation") as ctx:
            result = "success"
        
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_error_context_with_error(self):
        """Test ErrorContext with error"""
        from app.core.error_handling import ErrorContext
        
        with pytest.raises(ValueError):
            async with ErrorContext("test_operation") as ctx:
                raise ValueError("Test error")
    
    @pytest.mark.asyncio
    async def test_error_context_cleanup_sync(self):
        """Test ErrorContext runs sync cleanup on error"""
        from app.core.error_handling import ErrorContext
        
        cleanup_called = False
        
        def cleanup():
            nonlocal cleanup_called
            cleanup_called = True
        
        with pytest.raises(ValueError):
            async with ErrorContext("test_operation") as ctx:
                ctx.add_cleanup(cleanup)
                raise ValueError("Test error")
        
        assert cleanup_called
    
    @pytest.mark.asyncio
    async def test_error_context_cleanup_async(self):
        """Test ErrorContext runs async cleanup on error"""
        from app.core.error_handling import ErrorContext
        
        cleanup_called = False
        
        async def async_cleanup():
            nonlocal cleanup_called
            cleanup_called = True
        
        with pytest.raises(ValueError):
            async with ErrorContext("test_operation") as ctx:
                ctx.add_cleanup(async_cleanup)
                raise ValueError("Test error")
        
        assert cleanup_called
    
    @pytest.mark.asyncio
    async def test_error_context_cleanup_error_handled(self):
        """Test ErrorContext handles cleanup errors gracefully"""
        from app.core.error_handling import ErrorContext
        
        def failing_cleanup():
            raise RuntimeError("Cleanup failed")
        
        with pytest.raises(ValueError):
            async with ErrorContext("test_operation") as ctx:
                ctx.add_cleanup(failing_cleanup)
                raise ValueError("Test error")


class TestSafeDecimalConversion:
    """Test safe_decimal_conversion function"""
    
    def test_decimal_conversion_none(self):
        """Test conversion of None returns default"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion(None)
        assert result == Decimal("0")
    
    def test_decimal_conversion_decimal(self):
        """Test conversion of Decimal returns same value"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        value = Decimal("123.45")
        result = safe_decimal_conversion(value)
        assert result == value
    
    def test_decimal_conversion_int(self):
        """Test conversion of int"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion(42)
        assert result == Decimal("42")
    
    def test_decimal_conversion_float(self):
        """Test conversion of float"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion(3.14)
        assert result == Decimal("3.14")
    
    def test_decimal_conversion_string(self):
        """Test conversion of string"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion("99.99")
        assert result == Decimal("99.99")
    
    def test_decimal_conversion_invalid_type(self):
        """Test conversion of invalid type returns default"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion([1, 2, 3])
        assert result == Decimal("0")
    
    def test_decimal_conversion_invalid_string(self):
        """Test conversion of invalid string returns default"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion("not a number")
        assert result == Decimal("0")
    
    def test_decimal_conversion_custom_default(self):
        """Test conversion with custom default"""
        from app.core.error_handling import safe_decimal_conversion
        from decimal import Decimal
        
        result = safe_decimal_conversion(None, default=Decimal("100"))
        assert result == Decimal("100")


class TestSafeIntConversion:
    """Test safe_int_conversion function"""
    
    def test_int_conversion_none(self):
        """Test conversion of None returns default"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion(None)
        assert result == 0
    
    def test_int_conversion_int(self):
        """Test conversion of int returns same value"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion(42)
        assert result == 42
    
    def test_int_conversion_float(self):
        """Test conversion of float"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion(3.7)
        assert result == 3
    
    def test_int_conversion_string(self):
        """Test conversion of string"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion("99")
        assert result == 99
    
    def test_int_conversion_decimal(self):
        """Test conversion of Decimal"""
        from app.core.error_handling import safe_int_conversion
        from decimal import Decimal
        
        result = safe_int_conversion(Decimal("123.45"))
        assert result == 123
    
    def test_int_conversion_invalid_type(self):
        """Test conversion of invalid type returns default"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion([1, 2, 3])
        assert result == 0
    
    def test_int_conversion_invalid_string(self):
        """Test conversion of invalid string returns default"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion("not a number")
        assert result == 0
    
    def test_int_conversion_custom_default(self):
        """Test conversion with custom default"""
        from app.core.error_handling import safe_int_conversion
        
        result = safe_int_conversion(None, default=100)
        assert result == 100
