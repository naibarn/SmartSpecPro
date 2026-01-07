"""
Unit tests for ConfigValidator
"""

import os
import pytest
from unittest.mock import patch, MagicMock
from app.core.config_validator import ConfigValidator, ConfigurationError


class TestConfigValidator:
    """Test ConfigValidator class"""
    
    def test_validate_llm_providers_with_openai(self):
        """Test LLM provider validation with OpenAI configured"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test123456789"}):
            result = ConfigValidator._validate_llm_providers()
            
            assert result["has_any_provider"] is True
            assert result["configured_count"] >= 1
            assert result["providers"]["openai"]["configured"] is True
            assert result["providers"]["openai"]["key_length"] > 0
    
    def test_validate_llm_providers_with_multiple(self):
        """Test LLM provider validation with multiple providers"""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-test123",
            "ANTHROPIC_API_KEY": "sk-ant-test123",
            "GOOGLE_API_KEY": "AIza-test123"
        }):
            result = ConfigValidator._validate_llm_providers()
            
            assert result["configured_count"] >= 3
            assert result["providers"]["openai"]["configured"] is True
            assert result["providers"]["anthropic"]["configured"] is True
            assert result["providers"]["google"]["configured"] is True
    
    def test_validate_llm_providers_no_providers(self):
        """Test LLM provider validation with no providers"""
        with patch.dict(os.environ, {}, clear=True):
            result = ConfigValidator._validate_llm_providers()
            
            # Ollama is always available
            assert result["has_any_provider"] is True
            assert result["providers"]["ollama"]["configured"] is True
    
    def test_validate_llm_providers_ollama_always_available(self):
        """Test that Ollama is always marked as available"""
        result = ConfigValidator._validate_llm_providers()
        
        assert result["providers"]["ollama"]["configured"] is True
        assert "url" in result["providers"]["ollama"]
    
    def test_validate_database_success(self):
        """Test database validation with valid PostgreSQL URL"""
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:pass@localhost/db"}):
            valid, msg = ConfigValidator._validate_database()
            
            assert valid is True
            assert msg == "OK"
    
    def test_validate_database_missing_url(self):
        """Test database validation with missing DATABASE_URL"""
        with patch.dict(os.environ, {}, clear=True):
            valid, msg = ConfigValidator._validate_database()
            
            assert valid is False
            assert "not set" in msg
    
    def test_validate_database_wrong_type(self):
        """Test database validation with non-PostgreSQL URL"""
        with patch.dict(os.environ, {"DATABASE_URL": "mysql://user:pass@localhost/db"}):
            valid, msg = ConfigValidator._validate_database()
            
            assert valid is False
            assert "PostgreSQL" in msg
    
    def test_validate_directories_creates_missing(self, tmp_path):
        """Test directory validation creates missing directories"""
        checkpoint_dir = tmp_path / "checkpoints"
        state_dir = tmp_path / "state"
        
        with patch.dict(os.environ, {
            "CHECKPOINT_DIR": str(checkpoint_dir),
            "STATE_DIR": str(state_dir)
        }):
            valid, msg = ConfigValidator._validate_directories()
            
            assert valid is True
            assert msg == "OK"
            assert checkpoint_dir.exists()
            assert state_dir.exists()
    
    def test_validate_directories_existing(self, tmp_path):
        """Test directory validation with existing directories"""
        checkpoint_dir = tmp_path / "checkpoints"
        state_dir = tmp_path / "state"
        checkpoint_dir.mkdir()
        state_dir.mkdir()
        
        with patch.dict(os.environ, {
            "CHECKPOINT_DIR": str(checkpoint_dir),
            "STATE_DIR": str(state_dir)
        }):
            valid, msg = ConfigValidator._validate_directories()
            
            assert valid is True
            assert msg == "OK"
    
    def test_validate_security_valid_key(self):
        """Test security validation with valid SECRET_KEY"""
        with patch.dict(os.environ, {"SECRET_KEY": "a" * 32}):
            valid, msg = ConfigValidator._validate_security()
            
            assert valid is True
            assert msg == "OK"
    
    def test_validate_security_missing_key(self):
        """Test security validation with missing SECRET_KEY"""
        with patch.dict(os.environ, {}, clear=True):
            valid, msg = ConfigValidator._validate_security()
            
            assert valid is False
            assert "must be set" in msg
    
    def test_validate_security_default_key(self):
        """Test security validation with default SECRET_KEY"""
        with patch.dict(os.environ, {"SECRET_KEY": "change-this-in-production"}):
            valid, msg = ConfigValidator._validate_security()
            
            assert valid is False
            assert "secure value" in msg
    
    def test_validate_security_short_key(self):
        """Test security validation with short SECRET_KEY"""
        with patch.dict(os.environ, {"SECRET_KEY": "short"}):
            valid, msg = ConfigValidator._validate_security()
            
            assert valid is False
            assert "32 characters" in msg
    
    def test_validate_all_success(self):
        """Test complete validation with valid configuration"""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-test123",
            "DATABASE_URL": "postgresql://user:pass@localhost/db",
            "SECRET_KEY": "a" * 32
        }):
            result = ConfigValidator.validate_all()
            
            assert result["valid"] is True
            assert len(result["errors"]) == 0
            assert "llm_providers" in result
    
    def test_validate_all_with_warnings(self):
        """Test validation with warnings but no errors"""
        with patch.dict(os.environ, {
            "SECRET_KEY": "a" * 32
        }, clear=True):
            result = ConfigValidator.validate_all()
            
            # May have warnings but should still be valid if SECRET_KEY is set
            assert isinstance(result["warnings"], list)
    
    def test_validate_all_security_error(self):
        """Test validation fails with security error"""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://user:pass@localhost/db"
        }, clear=True):
            result = ConfigValidator.validate_all()
            
            assert result["valid"] is False
            assert len(result["errors"]) > 0
            assert any("Security" in err for err in result["errors"])
    
    def test_validate_and_report_success(self):
        """Test validate_and_report with valid configuration"""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-test123",
            "DATABASE_URL": "postgresql://user:pass@localhost/db",
            "SECRET_KEY": "a" * 32
        }):
            result = ConfigValidator.validate_and_report()
            
            assert result["valid"] is True
    
    def test_validate_and_report_failure(self):
        """Test validate_and_report raises on invalid configuration"""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ConfigurationError):
                ConfigValidator.validate_and_report()
    
    def test_configuration_error_exception(self):
        """Test ConfigurationError can be raised and caught"""
        with pytest.raises(ConfigurationError) as exc_info:
            raise ConfigurationError("Test error")
        
        assert "Test error" in str(exc_info.value)
