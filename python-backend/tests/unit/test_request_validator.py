"""
Unit tests for Request Validation Middleware
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi import Request
from starlette.responses import JSONResponse
from app.core.request_validator import (
    RequestValidationMiddleware,
    validate_json_depth,
    validate_string_length
)


class TestRequestValidationMiddleware:
    """Test RequestValidationMiddleware class"""
    
    @pytest.fixture
    def middleware(self):
        """Create middleware instance"""
        return RequestValidationMiddleware(app=Mock())
    
    @pytest.mark.asyncio
    async def test_valid_request(self, middleware):
        """Test valid request passes through"""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json"}
        request.method = "GET"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(return_value=JSONResponse(content={"status": "ok"}))
        
        response = await middleware.dispatch(request, call_next)
        
        assert call_next.called
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_request_too_large(self, middleware):
        """Test request size validation"""
        request = Mock(spec=Request)
        request.headers = {"content-length": str(20 * 1024 * 1024)}  # 20MB
        request.method = "POST"
        request.url.path = "/api/test"
        
        call_next = AsyncMock()
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 413
        assert not call_next.called
    
    @pytest.mark.asyncio
    async def test_request_within_size_limit(self, middleware):
        """Test request within size limit"""
        request = Mock(spec=Request)
        request.headers = {
            "content-length": str(5 * 1024 * 1024),  # 5MB
            "content-type": "application/json"
        }
        request.method = "POST"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(return_value=JSONResponse(content={"status": "ok"}))
        
        response = await middleware.dispatch(request, call_next)
        
        assert call_next.called
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_missing_content_type_post(self, middleware):
        """Test POST request without content-type"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "POST"
        request.url.path = "/api/test"
        
        call_next = AsyncMock()
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 400
        assert not call_next.called
    
    @pytest.mark.asyncio
    async def test_missing_content_type_put(self, middleware):
        """Test PUT request without content-type"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "PUT"
        request.url.path = "/api/test"
        
        call_next = AsyncMock()
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 400
        assert not call_next.called
    
    @pytest.mark.asyncio
    async def test_missing_content_type_patch(self, middleware):
        """Test PATCH request without content-type"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "PATCH"
        request.url.path = "/api/test"
        
        call_next = AsyncMock()
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 400
        assert not call_next.called
    
    @pytest.mark.asyncio
    async def test_invalid_content_type(self, middleware):
        """Test request with invalid content-type"""
        request = Mock(spec=Request)
        request.headers = {"content-type": "text/plain"}
        request.method = "POST"
        request.url.path = "/api/test"
        
        call_next = AsyncMock()
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 415
        assert not call_next.called
    
    @pytest.mark.asyncio
    async def test_valid_json_content_type(self, middleware):
        """Test request with valid JSON content-type"""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json; charset=utf-8"}
        request.method = "POST"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(return_value=JSONResponse(content={"status": "ok"}))
        
        response = await middleware.dispatch(request, call_next)
        
        assert call_next.called
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_request_no_content_type_required(self, middleware):
        """Test GET request doesn't require content-type"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "GET"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(return_value=JSONResponse(content={"status": "ok"}))
        
        response = await middleware.dispatch(request, call_next)
        
        assert call_next.called
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_delete_request_no_content_type_required(self, middleware):
        """Test DELETE request doesn't require content-type"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "DELETE"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(return_value=JSONResponse(content={"status": "ok"}))
        
        response = await middleware.dispatch(request, call_next)
        
        assert call_next.called
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_exception_handling(self, middleware):
        """Test exception handling in middleware"""
        request = Mock(spec=Request)
        request.headers = {}
        request.method = "GET"
        request.url.path = "/api/test"
        
        call_next = AsyncMock(side_effect=Exception("Test error"))
        
        response = await middleware.dispatch(request, call_next)
        
        assert response.status_code == 500


class TestValidateJsonDepth:
    """Test validate_json_depth function"""
    
    def test_shallow_dict(self):
        """Test shallow dictionary passes"""
        data = {"key": "value"}
        validate_json_depth(data, max_depth=5)  # Should not raise
    
    def test_shallow_list(self):
        """Test shallow list passes"""
        data = [1, 2, 3]
        validate_json_depth(data, max_depth=5)  # Should not raise
    
    def test_nested_dict_within_limit(self):
        """Test nested dictionary within limit"""
        data = {
            "level1": {
                "level2": {
                    "level3": "value"
                }
            }
        }
        validate_json_depth(data, max_depth=10)  # Should not raise
    
    def test_nested_dict_exceeds_limit(self):
        """Test nested dictionary exceeds limit"""
        data = {
            "l1": {
                "l2": {
                    "l3": {
                        "l4": {
                            "l5": "value"
                        }
                    }
                }
            }
        }
        with pytest.raises(ValueError, match="depth exceeds maximum"):
            validate_json_depth(data, max_depth=3)
    
    def test_nested_list_within_limit(self):
        """Test nested list within limit"""
        data = [[[1, 2], [3, 4]], [[5, 6]]]
        validate_json_depth(data, max_depth=10)  # Should not raise
    
    def test_nested_list_exceeds_limit(self):
        """Test nested list exceeds limit"""
        data = [[[[[[1]]]]]]
        with pytest.raises(ValueError, match="depth exceeds maximum"):
            validate_json_depth(data, max_depth=3)
    
    def test_mixed_nesting_within_limit(self):
        """Test mixed dict/list nesting within limit"""
        data = {
            "list": [
                {"nested": [1, 2, 3]},
                {"nested": [4, 5, 6]}
            ]
        }
        validate_json_depth(data, max_depth=10)  # Should not raise
    
    def test_mixed_nesting_exceeds_limit(self):
        """Test mixed dict/list nesting exceeds limit"""
        data = {
            "l1": [
                {"l2": [
                    {"l3": [
                        {"l4": "value"}
                    ]}
                ]}
            ]
        }
        with pytest.raises(ValueError, match="depth exceeds maximum"):
            validate_json_depth(data, max_depth=3)
    
    def test_primitive_values(self):
        """Test primitive values don't count as depth"""
        data = {"string": "value", "number": 123, "bool": True, "null": None}
        validate_json_depth(data, max_depth=1)  # Should not raise
    
    def test_empty_structures(self):
        """Test empty dict and list"""
        validate_json_depth({}, max_depth=1)  # Should not raise
        validate_json_depth([], max_depth=1)  # Should not raise
    
    def test_default_max_depth(self):
        """Test default max depth of 20"""
        # Create a deeply nested structure (15 levels)
        data = {"l": {}}
        current = data["l"]
        for i in range(14):
            current["l"] = {}
            current = current["l"]
        
        validate_json_depth(data)  # Should not raise with default max_depth=20
    
    def test_very_deep_structure(self):
        """Test very deep structure exceeds default limit"""
        # Create a deeply nested structure (25 levels)
        data = {"l": {}}
        current = data["l"]
        for i in range(24):
            current["l"] = {}
            current = current["l"]
        
        with pytest.raises(ValueError, match="depth exceeds maximum"):
            validate_json_depth(data)  # Should raise with default max_depth=20


class TestValidateStringLength:
    """Test validate_string_length function"""
    
    def test_short_string(self):
        """Test short string passes"""
        validate_string_length("hello", max_length=100)  # Should not raise
    
    def test_string_at_limit(self):
        """Test string at exact limit"""
        validate_string_length("a" * 100, max_length=100)  # Should not raise
    
    def test_string_exceeds_limit(self):
        """Test string exceeds limit"""
        with pytest.raises(ValueError, match="exceeds maximum length"):
            validate_string_length("a" * 101, max_length=100)
    
    def test_empty_string(self):
        """Test empty string"""
        validate_string_length("", max_length=100)  # Should not raise
    
    def test_custom_field_name(self):
        """Test custom field name in error message"""
        with pytest.raises(ValueError, match="username exceeds"):
            validate_string_length("a" * 101, max_length=100, field_name="username")
    
    def test_default_max_length(self):
        """Test default max length of 10000"""
        validate_string_length("a" * 9999)  # Should not raise
        
        with pytest.raises(ValueError):
            validate_string_length("a" * 10001)  # Should raise
    
    def test_unicode_string(self):
        """Test unicode string length"""
        unicode_str = "สวัสดี" * 100  # Thai characters
        validate_string_length(unicode_str, max_length=1000)  # Should not raise
    
    def test_multiline_string(self):
        """Test multiline string"""
        multiline = "line1\nline2\nline3"
        validate_string_length(multiline, max_length=100)  # Should not raise
