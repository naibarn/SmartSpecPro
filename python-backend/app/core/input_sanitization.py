"""
Input Sanitization
Comprehensive input sanitization to prevent injection attacks
"""

import re
import html
from typing import Any, Optional
import structlog

logger = structlog.get_logger()


class InputSanitizer:
    """
    Input sanitizer for preventing injection attacks
    
    Features:
    - HTML/Script injection prevention
    - SQL injection prevention
    - Path traversal prevention
    - Command injection prevention
    - XSS prevention
    """
    
    # Dangerous patterns
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)",
        r"(--|;|\/\*|\*\/|xp_|sp_)",
        r"(\bOR\b.*=.*)",
        r"(\bAND\b.*=.*)",
        r"('|(\\'))",
    ]
    
    COMMAND_INJECTION_PATTERNS = [
        r"[;&|`$()]",
        r"(\.\./|\.\.\\\\)",
        r"(~|%00)",
    ]
    
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe",
        r"<object",
        r"<embed",
    ]
    
    @classmethod
    def sanitize_string(
        cls,
        value: str,
        max_length: Optional[int] = None,
        allow_html: bool = False,
        strip_whitespace: bool = True
    ) -> str:
        """
        Sanitize string input
        
        Args:
            value: Input string
            max_length: Maximum allowed length
            allow_html: Whether to allow HTML tags
            strip_whitespace: Whether to strip leading/trailing whitespace
        
        Returns:
            Sanitized string
        """
        if not isinstance(value, str):
            logger.warning(
                "sanitize_non_string",
                value_type=type(value).__name__
            )
            value = str(value)
        
        # Strip whitespace
        if strip_whitespace:
            value = value.strip()
        
        # Check length
        if max_length and len(value) > max_length:
            logger.warning(
                "input_too_long",
                length=len(value),
                max_length=max_length
            )
            value = value[:max_length]
        
        # HTML escape if not allowing HTML
        if not allow_html:
            value = html.escape(value)
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        return value
    
    @classmethod
    def sanitize_email(cls, email: str) -> str:
        """
        Sanitize email address
        
        Args:
            email: Email address
        
        Returns:
            Sanitized email
        """
        email = cls.sanitize_string(email, max_length=255)
        email = email.lower()
        
        # Basic email validation
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise ValueError(f"Invalid email format: {email}")
        
        return email
    
    @classmethod
    def sanitize_filename(cls, filename: str) -> str:
        """
        Sanitize filename to prevent path traversal
        
        Args:
            filename: Filename
        
        Returns:
            Sanitized filename
        """
        # Remove path components
        filename = filename.split('/')[-1]
        filename = filename.split('\\')[-1]
        
        # Remove dangerous characters
        filename = re.sub(r'[^\w\s.-]', '', filename)
        
        # Remove leading dots
        filename = filename.lstrip('.')
        
        # Limit length
        if len(filename) > 255:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            filename = name[:250] + ('.' + ext if ext else '')
        
        return filename
    
    @classmethod
    def check_sql_injection(cls, value: str) -> bool:
        """
        Check if input contains SQL injection patterns
        
        Args:
            value: Input string
        
        Returns:
            True if suspicious patterns found
        """
        value_upper = value.upper()
        
        for pattern in cls.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value_upper, re.IGNORECASE):
                logger.warning(
                    "sql_injection_detected",
                    pattern=pattern,
                    value_preview=value[:50]
                )
                return True
        
        return False
    
    @classmethod
    def check_command_injection(cls, value: str) -> bool:
        """
        Check if input contains command injection patterns
        
        Args:
            value: Input string
        
        Returns:
            True if suspicious patterns found
        """
        for pattern in cls.COMMAND_INJECTION_PATTERNS:
            if re.search(pattern, value):
                logger.warning(
                    "command_injection_detected",
                    pattern=pattern,
                    value_preview=value[:50]
                )
                return True
        
        return False
    
    @classmethod
    def check_xss(cls, value: str) -> bool:
        """
        Check if input contains XSS patterns
        
        Args:
            value: Input string
        
        Returns:
            True if suspicious patterns found
        """
        for pattern in cls.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning(
                    "xss_detected",
                    pattern=pattern,
                    value_preview=value[:50]
                )
                return True
        
        return False
    
    @classmethod
    def sanitize_and_validate(
        cls,
        value: str,
        field_name: str = "input",
        max_length: Optional[int] = None,
        allow_html: bool = False,
        check_injection: bool = True
    ) -> str:
        """
        Comprehensive sanitization and validation
        
        Args:
            value: Input value
            field_name: Field name for logging
            max_length: Maximum length
            allow_html: Allow HTML tags
            check_injection: Check for injection attacks
        
        Returns:
            Sanitized value
        
        Raises:
            ValueError: If suspicious patterns detected
        """
        # Sanitize
        value = cls.sanitize_string(
            value,
            max_length=max_length,
            allow_html=allow_html
        )
        
        # Check for injection attacks
        if check_injection and not allow_html:
            if cls.check_sql_injection(value):
                raise ValueError(f"{field_name}: SQL injection pattern detected")
            
            if cls.check_command_injection(value):
                raise ValueError(f"{field_name}: Command injection pattern detected")
            
            if cls.check_xss(value):
                raise ValueError(f"{field_name}: XSS pattern detected")
        
        return value


def sanitize_dict(
    data: dict,
    max_string_length: int = 1000,
    allow_html: bool = False
) -> dict:
    """
    Recursively sanitize dictionary values
    
    Args:
        data: Dictionary to sanitize
        max_string_length: Maximum string length
        allow_html: Allow HTML in strings
    
    Returns:
        Sanitized dictionary
    """
    sanitized = {}
    
    for key, value in data.items():
        # Sanitize key
        if isinstance(key, str):
            key = InputSanitizer.sanitize_string(key, max_length=100)
        
        # Sanitize value
        if isinstance(value, str):
            value = InputSanitizer.sanitize_string(
                value,
                max_length=max_string_length,
                allow_html=allow_html
            )
        elif isinstance(value, dict):
            value = sanitize_dict(value, max_string_length, allow_html)
        elif isinstance(value, list):
            value = [
                InputSanitizer.sanitize_string(v, max_length=max_string_length, allow_html=allow_html)
                if isinstance(v, str) else v
                for v in value
            ]
        
        sanitized[key] = value
    
    return sanitized
