"""
Unit tests for Custom Errors
"""

import pytest
from fastapi import HTTPException, status
from app.core.errors import (
    SmartSpecError,
    ValidationError,
    SecurityError,
    WorkflowError,
    ExecutionError,
    LLMError,
    CheckpointError,
    ResourceNotFoundError,
    RateLimitError,
    ConfigurationError,
    to_http_exception,
    ErrorHandler,
    error_handler
)


class TestSmartSpecError:
    """Test SmartSpecError base class"""
    
    def test_basic_error(self):
        """Test basic error creation"""
        error = SmartSpecError("Test error")
        assert str(error) == "Test error"
        assert error.message == "Test error"
        assert error.error_code == "SMARTSPEC_ERROR"
        assert error.details == {}
    
    def test_error_with_code(self):
        """Test error with custom code"""
        error = SmartSpecError("Test error", error_code="CUSTOM_ERROR")
        assert error.error_code == "CUSTOM_ERROR"
    
    def test_error_with_details(self):
        """Test error with details"""
        details = {"field": "email", "value": "invalid"}
        error = SmartSpecError("Test error", details=details)
        assert error.details == details


class TestValidationError:
    """Test ValidationError"""
    
    def test_basic_validation_error(self):
        """Test basic validation error"""
        error = ValidationError("Invalid input")
        assert error.message == "Invalid input"
        assert error.error_code == "VALIDATION_ERROR"
    
    def test_validation_error_with_field(self):
        """Test validation error with field"""
        error = ValidationError("Invalid email", field="email")
        assert error.details["field"] == "email"
    
    def test_validation_error_with_extra_details(self):
        """Test validation error with extra details"""
        error = ValidationError("Invalid input", field="age", min_value=0, max_value=120)
        assert error.details["field"] == "age"
        assert error.details["min_value"] == 0
        assert error.details["max_value"] == 120


class TestSecurityError:
    """Test SecurityError"""
    
    def test_basic_security_error(self):
        """Test basic security error"""
        error = SecurityError("Unauthorized access")
        assert error.message == "Unauthorized access"
        assert error.error_code == "SECURITY_ERROR"
    
    def test_security_error_with_details(self):
        """Test security error with details"""
        error = SecurityError("Invalid token", token_type="Bearer", reason="expired")
        assert error.details["token_type"] == "Bearer"
        assert error.details["reason"] == "expired"


class TestWorkflowError:
    """Test WorkflowError"""
    
    def test_basic_workflow_error(self):
        """Test basic workflow error"""
        error = WorkflowError("Workflow failed")
        assert error.message == "Workflow failed"
        assert error.error_code == "WORKFLOW_ERROR"
    
    def test_workflow_error_with_id(self):
        """Test workflow error with workflow ID"""
        error = WorkflowError("Workflow failed", workflow_id="wf-123")
        assert error.details["workflow_id"] == "wf-123"
    
    def test_workflow_error_with_extra_details(self):
        """Test workflow error with extra details"""
        error = WorkflowError("Workflow failed", workflow_id="wf-123", step="validate", reason="timeout")
        assert error.details["workflow_id"] == "wf-123"
        assert error.details["step"] == "validate"
        assert error.details["reason"] == "timeout"


class TestExecutionError:
    """Test ExecutionError"""
    
    def test_basic_execution_error(self):
        """Test basic execution error"""
        error = ExecutionError("Execution failed")
        assert error.message == "Execution failed"
        assert error.error_code == "EXECUTION_ERROR"
    
    def test_execution_error_with_ids(self):
        """Test execution error with IDs"""
        error = ExecutionError("Execution failed", execution_id="exec-123", step_id="step-456")
        assert error.details["execution_id"] == "exec-123"
        assert error.details["step_id"] == "step-456"
    
    def test_execution_error_with_extra_details(self):
        """Test execution error with extra details"""
        error = ExecutionError("Execution failed", execution_id="exec-123", reason="timeout", duration=30)
        assert error.details["execution_id"] == "exec-123"
        assert error.details["reason"] == "timeout"
        assert error.details["duration"] == 30


class TestLLMError:
    """Test LLMError"""
    
    def test_basic_llm_error(self):
        """Test basic LLM error"""
        error = LLMError("LLM request failed")
        assert error.message == "LLM request failed"
        assert error.error_code == "LLM_ERROR"
    
    def test_llm_error_with_provider_and_model(self):
        """Test LLM error with provider and model"""
        error = LLMError("LLM request failed", provider="openai", model="gpt-4")
        assert error.details["provider"] == "openai"
        assert error.details["model"] == "gpt-4"
    
    def test_llm_error_with_extra_details(self):
        """Test LLM error with extra details"""
        error = LLMError("Rate limit exceeded", provider="openai", model="gpt-4", retry_after=60)
        assert error.details["provider"] == "openai"
        assert error.details["model"] == "gpt-4"
        assert error.details["retry_after"] == 60


class TestCheckpointError:
    """Test CheckpointError"""
    
    def test_basic_checkpoint_error(self):
        """Test basic checkpoint error"""
        error = CheckpointError("Checkpoint failed")
        assert error.message == "Checkpoint failed"
        assert error.error_code == "CHECKPOINT_ERROR"
    
    def test_checkpoint_error_with_id(self):
        """Test checkpoint error with checkpoint ID"""
        error = CheckpointError("Checkpoint not found", checkpoint_id="cp-123")
        assert error.details["checkpoint_id"] == "cp-123"


class TestResourceNotFoundError:
    """Test ResourceNotFoundError"""
    
    def test_resource_not_found(self):
        """Test resource not found error"""
        error = ResourceNotFoundError("User", "user-123")
        assert "User not found: user-123" in error.message
        assert error.error_code == "RESOURCE_NOT_FOUND"
        assert error.details["resource_type"] == "User"
        assert error.details["resource_id"] == "user-123"
    
    def test_resource_not_found_with_extra_details(self):
        """Test resource not found with extra details"""
        error = ResourceNotFoundError("Workflow", "wf-456", reason="deleted")
        assert error.details["resource_type"] == "Workflow"
        assert error.details["resource_id"] == "wf-456"
        assert error.details["reason"] == "deleted"


class TestRateLimitError:
    """Test RateLimitError"""
    
    def test_basic_rate_limit_error(self):
        """Test basic rate limit error"""
        error = RateLimitError()
        assert error.message == "Rate limit exceeded"
        assert error.error_code == "RATE_LIMIT_EXCEEDED"
    
    def test_rate_limit_error_custom_message(self):
        """Test rate limit error with custom message"""
        error = RateLimitError("Too many requests")
        assert error.message == "Too many requests"
    
    def test_rate_limit_error_with_details(self):
        """Test rate limit error with details"""
        error = RateLimitError("Rate limit exceeded", limit=100, window=60, retry_after=30)
        assert error.details["limit"] == 100
        assert error.details["window"] == 60
        assert error.details["retry_after"] == 30


class TestConfigurationError:
    """Test ConfigurationError"""
    
    def test_basic_configuration_error(self):
        """Test basic configuration error"""
        error = ConfigurationError("Invalid configuration")
        assert error.message == "Invalid configuration"
        assert error.error_code == "CONFIGURATION_ERROR"
    
    def test_configuration_error_with_key(self):
        """Test configuration error with config key"""
        error = ConfigurationError("Missing required config", config_key="DATABASE_URL")
        assert error.details["config_key"] == "DATABASE_URL"


class TestToHttpException:
    """Test to_http_exception function"""
    
    def test_validation_error_to_http(self):
        """Test validation error converts to 400"""
        error = ValidationError("Invalid input")
        http_exc = to_http_exception(error)
        
        assert isinstance(http_exc, HTTPException)
        assert http_exc.status_code == status.HTTP_400_BAD_REQUEST
        assert http_exc.detail["error"] == "VALIDATION_ERROR"
        assert http_exc.detail["message"] == "Invalid input"
    
    def test_security_error_to_http(self):
        """Test security error converts to 403"""
        error = SecurityError("Unauthorized")
        http_exc = to_http_exception(error)
        
        assert http_exc.status_code == status.HTTP_403_FORBIDDEN
        assert http_exc.detail["error"] == "SECURITY_ERROR"
    
    def test_resource_not_found_to_http(self):
        """Test resource not found converts to 404"""
        error = ResourceNotFoundError("User", "123")
        http_exc = to_http_exception(error)
        
        assert http_exc.status_code == status.HTTP_404_NOT_FOUND
        assert http_exc.detail["error"] == "RESOURCE_NOT_FOUND"
    
    def test_rate_limit_error_to_http(self):
        """Test rate limit error converts to 429"""
        error = RateLimitError()
        http_exc = to_http_exception(error)
        
        assert http_exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert http_exc.detail["error"] == "RATE_LIMIT_EXCEEDED"
    
    def test_workflow_error_to_http(self):
        """Test workflow error converts to 500"""
        error = WorkflowError("Workflow failed")
        http_exc = to_http_exception(error)
        
        assert http_exc.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert http_exc.detail["error"] == "WORKFLOW_ERROR"
    
    def test_unknown_error_code_to_http(self):
        """Test unknown error code defaults to 500"""
        error = SmartSpecError("Unknown error", error_code="UNKNOWN_ERROR")
        http_exc = to_http_exception(error)
        
        assert http_exc.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


class TestErrorHandler:
    """Test ErrorHandler class"""
    
    def test_handle_smartspec_error(self):
        """Test handling SmartSpec error"""
        error = ValidationError("Invalid input", field="email")
        context = {"user_id": "123"}
        
        # Should not raise
        ErrorHandler.handle_error(error, context)
    
    def test_handle_generic_error(self):
        """Test handling generic error"""
        error = ValueError("Generic error")
        context = {"operation": "test"}
        
        # Should not raise
        ErrorHandler.handle_error(error, context)
    
    def test_handle_error_without_context(self):
        """Test handling error without context"""
        error = RuntimeError("Test error")
        
        # Should not raise
        ErrorHandler.handle_error(error)
    
    def test_should_retry_below_max(self):
        """Test should retry when below max retries"""
        error = LLMError("Temporary failure")
        assert ErrorHandler.should_retry(error, retry_count=1, max_retries=3) is True
    
    def test_should_retry_at_max(self):
        """Test should not retry at max retries"""
        error = LLMError("Temporary failure")
        assert ErrorHandler.should_retry(error, retry_count=3, max_retries=3) is False
    
    def test_should_not_retry_validation_error(self):
        """Test should not retry validation error"""
        error = ValidationError("Invalid input")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is False
    
    def test_should_not_retry_security_error(self):
        """Test should not retry security error"""
        error = SecurityError("Unauthorized")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is False
    
    def test_should_not_retry_resource_not_found(self):
        """Test should not retry resource not found"""
        error = ResourceNotFoundError("User", "123")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is False
    
    def test_should_retry_llm_error(self):
        """Test should retry LLM error"""
        error = LLMError("Timeout")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is True
    
    def test_should_retry_execution_error(self):
        """Test should retry execution error"""
        error = ExecutionError("Temporary failure")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is True
    
    def test_should_retry_unknown_error(self):
        """Test should retry unknown error by default"""
        error = RuntimeError("Unknown error")
        assert ErrorHandler.should_retry(error, retry_count=0, max_retries=3) is True
    
    @pytest.mark.asyncio
    async def test_with_retry_success(self):
        """Test with_retry succeeds on first attempt"""
        call_count = 0
        
        async def test_func():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = await ErrorHandler.with_retry(test_func, max_retries=3)
        
        assert result == "success"
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_with_retry_retries_then_succeeds(self):
        """Test with_retry retries then succeeds"""
        call_count = 0
        
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise LLMError("Temporary failure")
            return "success"
        
        result = await ErrorHandler.with_retry(test_func, max_retries=3)
        
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_with_retry_non_retryable_error(self):
        """Test with_retry doesn't retry non-retryable errors"""
        call_count = 0
        
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise ValidationError("Invalid input")
        
        with pytest.raises(ValidationError):
            await ErrorHandler.with_retry(test_func, max_retries=3)
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_with_retry_exhausts_retries(self):
        """Test with_retry exhausts all retries"""
        call_count = 0
        
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise LLMError("Persistent failure")
        
        with pytest.raises(LLMError):
            await ErrorHandler.with_retry(test_func, max_retries=2)
        
        assert call_count == 3  # Initial + 2 retries


class TestGlobalErrorHandler:
    """Test global error_handler instance"""
    
    def test_error_handler_instance_exists(self):
        """Test global error_handler instance exists"""
        assert error_handler is not None
        assert isinstance(error_handler, ErrorHandler)
