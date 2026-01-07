"""
Unit tests for Exception Handlers
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from app.core.exceptions import (
    http_exception_handler,
    validation_exception_handler,
    sqlalchemy_exception_handler,
    insufficient_credits_exception_handler,
    register_exception_handlers
)
from app.services.credit_service import InsufficientCreditsError


class TestHttpExceptionHandler:
    """Test http_exception_handler"""
    
    @pytest.mark.asyncio
    async def test_handles_generic_exception(self):
        """Test handling of generic exception"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "GET"
        
        exc = Exception("Test error")
        
        response = await http_exception_handler(request, exc)
        
        assert response.status_code == 500
        assert "detail" in response.body.decode()
    
    @pytest.mark.asyncio
    async def test_logs_exception_details(self):
        """Test exception details are logged"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        exc = RuntimeError("Critical error")
        
        with patch('app.core.exceptions.logger') as mock_logger:
            response = await http_exception_handler(request, exc)
            
            mock_logger.error.assert_called_once()
            call_args = mock_logger.error.call_args
            assert "unhandled_exception" in call_args[0]


class TestValidationExceptionHandler:
    """Test validation_exception_handler"""
    
    @pytest.mark.asyncio
    async def test_handles_validation_error(self):
        """Test handling of validation error"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        # Create mock validation error
        exc = Mock(spec=RequestValidationError)
        exc.errors.return_value = [
            {
                "loc": ("body", "email"),
                "msg": "field required",
                "type": "value_error.missing"
            }
        ]
        
        response = await validation_exception_handler(request, exc)
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_serializes_error_context(self):
        """Test error context serialization"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        exc = Mock(spec=RequestValidationError)
        exc.errors.return_value = [
            {
                "loc": ("body", "age"),
                "msg": "value is not a valid integer",
                "type": "type_error.integer",
                "ctx": {"value": "abc"}
            }
        ]
        
        response = await validation_exception_handler(request, exc)
        
        assert response.status_code == 422
        # Verify response contains serialized errors
        body = response.body.decode()
        assert "detail" in body
    
    @pytest.mark.asyncio
    async def test_handles_exception_in_context(self):
        """Test handling of exception objects in context"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        exc = Mock(spec=RequestValidationError)
        exc.errors.return_value = [
            {
                "loc": ("body", "field"),
                "msg": "error",
                "type": "value_error",
                "ctx": {"error": ValueError("test")}
            }
        ]
        
        response = await validation_exception_handler(request, exc)
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_logs_validation_errors(self):
        """Test validation errors are logged"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        exc = Mock(spec=RequestValidationError)
        exc.errors.return_value = [
            {"loc": ("body", "email"), "msg": "invalid", "type": "value_error"}
        ]
        
        with patch('app.core.exceptions.logger') as mock_logger:
            response = await validation_exception_handler(request, exc)
            
            mock_logger.warning.assert_called_once()
            call_args = mock_logger.warning.call_args
            assert "validation_error" in call_args[0]


class TestSQLAlchemyExceptionHandler:
    """Test sqlalchemy_exception_handler"""
    
    @pytest.mark.asyncio
    async def test_handles_database_error(self):
        """Test handling of database error"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "GET"
        
        exc = SQLAlchemyError("Database connection failed")
        
        response = await sqlalchemy_exception_handler(request, exc)
        
        assert response.status_code == 503
        body = response.body.decode()
        assert "Database error" in body
    
    @pytest.mark.asyncio
    async def test_logs_database_error_as_critical(self):
        """Test database errors are logged as critical"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        
        exc = SQLAlchemyError("Connection pool exhausted")
        
        with patch('app.core.exceptions.logger') as mock_logger:
            response = await sqlalchemy_exception_handler(request, exc)
            
            mock_logger.critical.assert_called_once()
            call_args = mock_logger.critical.call_args
            assert "database_error" in call_args[0]


class TestInsufficientCreditsExceptionHandler:
    """Test insufficient_credits_exception_handler"""
    
    @pytest.mark.asyncio
    async def test_handles_insufficient_credits(self):
        """Test handling of insufficient credits error"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        request.state = Mock()
        request.state.user = Mock(id="user123")
        
        exc = InsufficientCreditsError(required=100, available=50)
        
        response = await insufficient_credits_exception_handler(request, exc)
        
        assert response.status_code == 402
        body = response.body.decode()
        assert "Insufficient credits" in body
        assert "100" in body  # required credits
        assert "50" in body   # available credits
    
    @pytest.mark.asyncio
    async def test_handles_no_user_in_request(self):
        """Test handling when no user in request state"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        request.state = Mock(spec=[])  # No user attribute
        
        exc = InsufficientCreditsError(required=100, available=50)
        
        response = await insufficient_credits_exception_handler(request, exc)
        
        assert response.status_code == 402
    
    @pytest.mark.asyncio
    async def test_logs_insufficient_credits(self):
        """Test insufficient credits are logged"""
        request = Mock(spec=Request)
        request.url.path = "/api/test"
        request.method = "POST"
        request.state = Mock()
        request.state.user = Mock(id="user123")
        
        exc = InsufficientCreditsError(required=100, available=50)
        
        with patch('app.core.exceptions.logger') as mock_logger:
            response = await insufficient_credits_exception_handler(request, exc)
            
            mock_logger.warning.assert_called_once()
            call_args = mock_logger.warning.call_args
            assert "insufficient_credits_triggered" in call_args[0]
            assert call_args[1]["required"] == 100
            assert call_args[1]["available"] == 50


class TestRegisterExceptionHandlers:
    """Test register_exception_handlers"""
    
    def test_registers_all_handlers(self):
        """Test all exception handlers are registered"""
        app = Mock()
        
        register_exception_handlers(app)
        
        # Verify add_exception_handler was called for each exception type
        assert app.add_exception_handler.call_count == 4
        
        # Verify the exception types
        call_args_list = app.add_exception_handler.call_args_list
        exception_types = [call[0][0] for call in call_args_list]
        
        assert Exception in exception_types
        assert RequestValidationError in exception_types
        assert SQLAlchemyError in exception_types
        assert InsufficientCreditsError in exception_types
    
    def test_logs_registration(self):
        """Test handler registration is logged"""
        app = Mock()
        
        with patch('app.core.exceptions.logger') as mock_logger:
            register_exception_handlers(app)
            
            mock_logger.info.assert_called_once_with(
                "Custom exception handlers registered."
            )
    
    def test_handler_order(self):
        """Test handlers are registered in correct order"""
        app = Mock()
        
        register_exception_handlers(app)
        
        call_args_list = app.add_exception_handler.call_args_list
        
        # First handler should be for generic Exception
        assert call_args_list[0][0][0] == Exception
        assert call_args_list[0][0][1] == http_exception_handler
        
        # Second handler should be for RequestValidationError
        assert call_args_list[1][0][0] == RequestValidationError
        assert call_args_list[1][0][1] == validation_exception_handler
        
        # Third handler should be for SQLAlchemyError
        assert call_args_list[2][0][0] == SQLAlchemyError
        assert call_args_list[2][0][1] == sqlalchemy_exception_handler
        
        # Fourth handler should be for InsufficientCreditsError
        assert call_args_list[3][0][0] == InsufficientCreditsError
        assert call_args_list[3][0][1] == insufficient_credits_exception_handler
