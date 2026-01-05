"""
SmartSpec Pro - Security Tests
Phase 0.4
"""

import pytest
from pathlib import Path
from app.core.security import SecurityValidator, RateLimiter
from app.core.errors import ValidationError, SecurityError


@pytest.fixture
def validator():
    """Create security validator"""
    return SecurityValidator()


@pytest.fixture
def rate_limiter():
    """Create rate limiter"""
    return RateLimiter(max_requests=5, window_seconds=60)


# SecurityValidator Tests

def test_sanitize_string_valid(validator):
    """Test sanitizing valid string"""
    result = validator.sanitize_string("Hello world")
    assert result == "Hello world"


def test_sanitize_string_too_long(validator):
    """Test sanitizing too long string"""
    with pytest.raises(ValueError, match="too long"):
        validator.sanitize_string("a" * 20000)


def test_sanitize_string_command_injection(validator):
    """Test detecting command injection"""
    dangerous_inputs = [
        "test; rm -rf /",
        "test && cat /etc/passwd",
        "test | grep secret",
        "test `whoami`",
        "test $(whoami)",
    ]
    
    for dangerous in dangerous_inputs:
        with pytest.raises(ValueError, match="dangerous pattern"):
            validator.sanitize_string(dangerous)


def test_sanitize_string_xss(validator):
    """Test detecting XSS"""
    dangerous_inputs = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img onerror='alert(1)'>",
    ]
    
    for dangerous in dangerous_inputs:
        with pytest.raises(ValueError, match="dangerous pattern"):
            validator.sanitize_string(dangerous)


def test_validate_file_path_valid(validator):
    """Test validating valid file path"""
    path = validator.validate_file_path("/home/user/project/file.py")
    assert isinstance(path, Path)


def test_validate_file_path_traversal(validator):
    """Test detecting path traversal"""
    with pytest.raises(ValueError, match="traversal"):
        validator.validate_file_path("../../../etc/passwd")


def test_validate_file_path_base_dir(validator, tmp_path):
    """Test validating path within base directory"""
    base_dir = str(tmp_path)
    
    # Valid path within base_dir
    valid_path = tmp_path / "subdir" / "file.py"
    result = validator.validate_file_path(str(valid_path), base_dir)
    assert result == valid_path.resolve()
    
    # Invalid path outside base_dir
    with pytest.raises(ValueError, match="must be within"):
        validator.validate_file_path("/etc/passwd", base_dir)


def test_validate_command_valid(validator):
    """Test validating valid command"""
    allowed = ["ls", "cat", "grep"]
    result = validator.validate_command("ls -la", allowed)
    assert result == "ls -la"


def test_validate_command_not_allowed(validator):
    """Test detecting non-allowed command"""
    allowed = ["ls", "cat"]
    with pytest.raises(ValueError, match="not allowed"):
        validator.validate_command("rm -rf /", allowed)


def test_validate_command_dangerous_chars(validator):
    """Test detecting dangerous characters in command"""
    dangerous_commands = [
        "ls; rm -rf /",
        "cat file && rm file",
        "echo test | grep test",
        "whoami `id`",
        "test $(whoami)",
    ]
    
    for dangerous in dangerous_commands:
        with pytest.raises(ValueError, match="Dangerous character"):
            validator.validate_command(dangerous)


def test_validate_workflow_id_valid(validator):
    """Test validating valid workflow ID"""
    result = validator.validate_workflow_id("my-workflow_123")
    assert result == "my-workflow_123"


def test_validate_workflow_id_invalid(validator):
    """Test detecting invalid workflow ID"""
    invalid_ids = [
        "workflow with spaces",
        "workflow@special",
        "workflow#123",
        "a" * 200,  # Too long
    ]
    
    for invalid in invalid_ids:
        with pytest.raises(ValueError):
            validator.validate_workflow_id(invalid)


def test_validate_execution_id_valid(validator):
    """Test validating valid execution ID (UUID)"""
    result = validator.validate_execution_id("550e8400-e29b-41d4-a716-446655440000")
    assert result == "550e8400-e29b-41d4-a716-446655440000"


def test_validate_execution_id_invalid(validator):
    """Test detecting invalid execution ID"""
    invalid_ids = [
        "not-a-uuid",
        "12345",
        "550e8400-e29b-41d4-a716",  # Incomplete
    ]
    
    for invalid in invalid_ids:
        with pytest.raises(ValueError, match="Invalid execution ID"):
            validator.validate_execution_id(invalid)


def test_sanitize_llm_output(validator):
    """Test sanitizing LLM output"""
    dangerous = "echo 'test'; rm -rf /"
    sanitized = validator.sanitize_llm_output(dangerous)
    assert ";" not in sanitized
    assert "rm -rf /" in sanitized  # Text remains but ; is removed


# RateLimiter Tests

def test_rate_limiter_allow(rate_limiter):
    """Test rate limiter allows requests under limit"""
    for i in range(5):
        assert rate_limiter.check_rate_limit("user1") is True


def test_rate_limiter_block(rate_limiter):
    """Test rate limiter blocks requests over limit"""
    # Use up the limit
    for i in range(5):
        rate_limiter.check_rate_limit("user2")
    
    # Next request should be blocked
    assert rate_limiter.check_rate_limit("user2") is False


def test_rate_limiter_separate_keys(rate_limiter):
    """Test rate limiter tracks keys separately"""
    # User 1 uses up limit
    for i in range(5):
        rate_limiter.check_rate_limit("user1")
    
    # User 2 should still be allowed
    assert rate_limiter.check_rate_limit("user2") is True


def test_rate_limiter_reset(rate_limiter):
    """Test rate limiter reset"""
    # Use up limit
    for i in range(5):
        rate_limiter.check_rate_limit("user1")
    
    # Reset
    rate_limiter.reset("user1")
    
    # Should be allowed again
    assert rate_limiter.check_rate_limit("user1") is True
