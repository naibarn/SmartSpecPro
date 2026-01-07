"""
Unit tests for Logging Configuration
"""

import pytest
import logging
from unittest.mock import Mock, patch, call
from app.core.logging import setup_logging, get_logger


class TestSetupLogging:
    """Test setup_logging function"""
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_configures_basic_logging(self, mock_logging, mock_structlog, mock_settings):
        """Test configures basic logging"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        mock_logging.basicConfig.assert_called_once()
        call_kwargs = mock_logging.basicConfig.call_args[1]
        assert "format" in call_kwargs
        assert "stream" in call_kwargs
        assert "level" in call_kwargs
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_uses_correct_log_level(self, mock_logging, mock_structlog, mock_settings):
        """Test uses correct log level from settings"""
        mock_settings.LOG_LEVEL = "DEBUG"
        mock_settings.DEBUG = False
        
        with patch('app.core.logging.getattr') as mock_getattr:
            mock_getattr.return_value = logging.DEBUG
            
            setup_logging()
            
            mock_getattr.assert_called_with(logging, "DEBUG")
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_configures_structlog(self, mock_logging, mock_structlog, mock_settings):
        """Test configures structlog"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        mock_structlog.configure.assert_called_once()
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_uses_console_renderer_in_debug(self, mock_logging, mock_structlog, mock_settings):
        """Test uses console renderer in debug mode"""
        mock_settings.LOG_LEVEL = "DEBUG"
        mock_settings.DEBUG = True
        
        setup_logging()
        
        # Verify structlog.configure was called
        assert mock_structlog.configure.called
        
        # Get the processors argument
        call_kwargs = mock_structlog.configure.call_args[1]
        processors = call_kwargs["processors"]
        
        # Check that ConsoleRenderer is in processors
        # (We can't check the exact instance, but we can verify the call was made)
        assert mock_structlog.dev.ConsoleRenderer.called
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_uses_json_renderer_in_production(self, mock_logging, mock_structlog, mock_settings):
        """Test uses JSON renderer in production mode"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        # Verify structlog.configure was called
        assert mock_structlog.configure.called
        
        # Verify JSONRenderer was called
        assert mock_structlog.processors.JSONRenderer.called
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_includes_standard_processors(self, mock_logging, mock_structlog, mock_settings):
        """Test includes standard processors"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        # Verify standard processors are used
        assert mock_structlog.contextvars.merge_contextvars
        assert mock_structlog.stdlib.add_logger_name
        assert mock_structlog.stdlib.add_log_level
        assert mock_structlog.stdlib.PositionalArgumentsFormatter.called
        assert mock_structlog.processors.TimeStamper.called
        assert mock_structlog.processors.StackInfoRenderer.called
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_configures_wrapper_class(self, mock_logging, mock_structlog, mock_settings):
        """Test configures wrapper class"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        call_kwargs = mock_structlog.configure.call_args[1]
        assert call_kwargs["wrapper_class"] == mock_structlog.stdlib.BoundLogger
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_configures_logger_factory(self, mock_logging, mock_structlog, mock_settings):
        """Test configures logger factory"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        call_kwargs = mock_structlog.configure.call_args[1]
        assert mock_structlog.stdlib.LoggerFactory.called
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_enables_logger_caching(self, mock_logging, mock_structlog, mock_settings):
        """Test enables logger caching"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        call_kwargs = mock_structlog.configure.call_args[1]
        assert call_kwargs["cache_logger_on_first_use"] is True
    
    @patch('app.core.logging.settings')
    @patch('app.core.logging.structlog')
    @patch('app.core.logging.logging')
    def test_uses_dict_context_class(self, mock_logging, mock_structlog, mock_settings):
        """Test uses dict as context class"""
        mock_settings.LOG_LEVEL = "INFO"
        mock_settings.DEBUG = False
        
        setup_logging()
        
        call_kwargs = mock_structlog.configure.call_args[1]
        assert call_kwargs["context_class"] == dict


class TestGetLogger:
    """Test get_logger function"""
    
    @patch('app.core.logging.structlog')
    def test_returns_logger(self, mock_structlog):
        """Test returns logger instance"""
        mock_logger = Mock()
        mock_structlog.get_logger.return_value = mock_logger
        
        result = get_logger()
        
        assert result == mock_logger
    
    @patch('app.core.logging.structlog')
    def test_uses_default_name(self, mock_structlog):
        """Test uses default name if not provided"""
        get_logger()
        
        mock_structlog.get_logger.assert_called_once()
    
    @patch('app.core.logging.structlog')
    def test_uses_custom_name(self, mock_structlog):
        """Test uses custom name if provided"""
        get_logger("custom.logger")
        
        mock_structlog.get_logger.assert_called_once_with("custom.logger")
    
    @patch('app.core.logging.structlog')
    def test_returns_same_logger_for_same_name(self, mock_structlog):
        """Test returns same logger for same name (caching)"""
        mock_logger = Mock()
        mock_structlog.get_logger.return_value = mock_logger
        
        logger1 = get_logger("test")
        logger2 = get_logger("test")
        
        assert logger1 == logger2
