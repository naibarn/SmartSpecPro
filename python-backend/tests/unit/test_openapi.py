"""
Unit tests for OpenAPI Configuration
"""

import pytest
from unittest.mock import Mock, patch
from fastapi import FastAPI
from app.core.openapi import custom_openapi, setup_openapi


class TestCustomOpenAPI:
    """Test custom_openapi function"""
    
    def test_returns_cached_schema(self):
        """Test returns cached schema if already generated"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = {"cached": "schema"}
        
        result = custom_openapi(app)
        
        assert result == {"cached": "schema"}
    
    def test_generates_new_schema(self):
        """Test generates new schema if not cached"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            mock_get_openapi.assert_called_once()
            assert result is not None
    
    def test_schema_has_correct_title(self):
        """Test schema has correct title"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            custom_openapi(app)
            
            call_kwargs = mock_get_openapi.call_args[1]
            assert call_kwargs["title"] == "SmartSpec Pro API"
    
    def test_schema_has_version(self):
        """Test schema has version"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            custom_openapi(app)
            
            call_kwargs = mock_get_openapi.call_args[1]
            assert call_kwargs["version"] == "1.0.0"
    
    def test_schema_has_description(self):
        """Test schema has description"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            custom_openapi(app)
            
            call_kwargs = mock_get_openapi.call_args[1]
            assert "SmartSpec Pro" in call_kwargs["description"]
    
    def test_schema_has_tags(self):
        """Test schema has API tags"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            custom_openapi(app)
            
            call_kwargs = mock_get_openapi.call_args[1]
            tags = call_kwargs["tags"]
            
            tag_names = [tag["name"] for tag in tags]
            assert "Health" in tag_names
            assert "Authentication" in tag_names
            assert "Credits" in tag_names
            assert "Payments" in tag_names
            assert "Dashboard" in tag_names
            assert "LLM Proxy" in tag_names
    
    def test_adds_security_schemes(self):
        """Test adds security schemes to schema"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "securitySchemes" in result["components"]
            assert "BearerAuth" in result["components"]["securitySchemes"]
            assert result["components"]["securitySchemes"]["BearerAuth"]["type"] == "http"
            assert result["components"]["securitySchemes"]["BearerAuth"]["scheme"] == "bearer"
    
    def test_adds_global_security(self):
        """Test adds global security requirement"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "security" in result
            assert result["security"] == [{"BearerAuth": []}]
    
    def test_adds_servers(self):
        """Test adds server configurations"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "servers" in result
            assert len(result["servers"]) == 3
            
            server_urls = [server["url"] for server in result["servers"]]
            assert "https://api.smartspec.pro" in server_urls
            assert "https://staging-api.smartspec.pro" in server_urls
            assert "http://localhost:8000" in server_urls
    
    def test_adds_contact_info(self):
        """Test adds contact information"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "contact" in result["info"]
            assert result["info"]["contact"]["name"] == "SmartSpec Pro Support"
            assert "url" in result["info"]["contact"]
            assert "email" in result["info"]["contact"]
    
    def test_adds_license(self):
        """Test adds license information"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "license" in result["info"]
            assert result["info"]["license"]["name"] == "Proprietary"
    
    def test_adds_external_docs(self):
        """Test adds external documentation"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert "externalDocs" in result
            assert "description" in result["externalDocs"]
            assert "url" in result["externalDocs"]
    
    def test_caches_schema_on_app(self):
        """Test caches generated schema on app"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        with patch('app.core.openapi.get_openapi') as mock_get_openapi:
            mock_get_openapi.return_value = {
                "info": {},
                "components": {}
            }
            
            result = custom_openapi(app)
            
            assert app.openapi_schema == result


class TestSetupOpenAPI:
    """Test setup_openapi function"""
    
    def test_sets_openapi_function(self):
        """Test sets custom openapi function on app"""
        app = Mock(spec=FastAPI)
        
        setup_openapi(app)
        
        assert app.openapi is not None
        assert callable(app.openapi)
    
    def test_openapi_function_calls_custom_openapi(self):
        """Test openapi function calls custom_openapi"""
        app = Mock(spec=FastAPI)
        app.openapi_schema = None
        app.routes = []
        
        setup_openapi(app)
        
        with patch('app.core.openapi.custom_openapi') as mock_custom:
            mock_custom.return_value = {"test": "schema"}
            
            result = app.openapi()
            
            mock_custom.assert_called_once_with(app)
            assert result == {"test": "schema"}
