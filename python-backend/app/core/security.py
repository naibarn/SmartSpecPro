"""
SmartSpec Pro - Security Module
Phase 0.4

Security features:
- Input sanitization
- Command injection prevention
- Path traversal prevention
- Rate limiting
- API key validation
"""

import re
import os
from pathlib import Path
from typing import Optional
import structlog
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
from typing import Any, Dict, List

# R1.1: Use passlib for strong password hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# R1.2: Centralized JWT configuration
# R8.1: Use RS256 with public/private key pair
JWT_ALGORITHM = "RS256"

# Load keys from files
KEYS_DIR = Path(__file__).parent / "keys"
with open(KEYS_DIR / "jwt_private_key.pem", "rb") as f:
    JWT_PRIVATE_KEY = f.read()
with open(KEYS_DIR / "jwt_public_key.pem", "rb") as f:
    JWT_PUBLIC_KEY = f.read()
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# R1.3: In-memory token blacklist for immediate session invalidation
TOKEN_BLACKLIST: set = set()


logger = structlog.get_logger()


class SecurityValidator:
    """Validates and sanitizes inputs for security"""
    
    # Dangerous patterns
    COMMAND_INJECTION_PATTERNS = [
        r'[;&|`$()]',  # Shell metacharacters
        r'\.\./|\.\.\\',  # Path traversal
        r'<script',  # XSS
        r'javascript:',  # XSS
        r'on\w+\s*=',  # Event handlers
    ]
    
    # Allowed file extensions
    ALLOWED_EXTENSIONS = {
        '.py', '.js', '.ts', '.tsx', '.jsx',
        '.md', '.txt', '.json', '.yaml', '.yml',
        '.html', '.css', '.scss', '.sass',
        '.sh', '.bash',
        '.sql', '.env',
        '.gitignore', '.dockerignore',
    }
    
    def __init__(self):
        self.patterns = [re.compile(p, re.IGNORECASE) for p in self.COMMAND_INJECTION_PATTERNS]
    
    def sanitize_string(self, value: str, max_length: int = 10000) -> str:
        """
        Sanitize string input
        
        Args:
            value: String to sanitize
            max_length: Maximum allowed length
        
        Returns:
            Sanitized string
        
        Raises:
            ValueError: If input is dangerous
        """
        if not isinstance(value, str):
            raise ValueError("Input must be a string")
        
        if len(value) > max_length:
            raise ValueError(f"Input too long (max {max_length} characters)")
        
        # Check for dangerous patterns
        for pattern in self.patterns:
            if pattern.search(value):
                logger.warning("Dangerous pattern detected", pattern=pattern.pattern, value=value[:100])
                raise ValueError(f"Input contains dangerous pattern: {pattern.pattern}")
        
        return value
    
    def validate_file_path(self, file_path: str, base_dir: Optional[str] = None) -> Path:
        """
        Validate file path for security
        
        Args:
            file_path: File path to validate
            base_dir: Base directory to restrict access to
        
        Returns:
            Validated Path object
        
        Raises:
            ValueError: If path is dangerous
        """
        if not file_path:
            raise ValueError("File path cannot be empty")
        
        # Convert to Path
        path = Path(file_path).resolve()
        
        # Check for path traversal
        if '..' in file_path:
            raise ValueError("Path traversal detected")
        
        # If base_dir specified, ensure path is within it
        if base_dir:
            base = Path(base_dir).resolve()
            try:
                path.relative_to(base)
            except ValueError:
                raise ValueError(f"Path must be within {base_dir}")
        
        # Check file extension
        if path.suffix and path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            logger.warning("Suspicious file extension", extension=path.suffix, path=str(path))
            # Don't raise error, just warn
        
        return path
    
    def validate_command(self, command: str, allowed_commands: Optional[list] = None) -> str:
        """
        Validate command for execution
        
        Args:
            command: Command to validate
            allowed_commands: List of allowed command names
        
        Returns:
            Validated command
        
        Raises:
            ValueError: If command is dangerous
        """
        if not command:
            raise ValueError("Command cannot be empty")
        
        # Extract command name (first word)
        cmd_name = command.split()[0]
        
        # Check if command is in allowed list
        if allowed_commands and cmd_name not in allowed_commands:
            raise ValueError(f"Command not allowed: {cmd_name}")
        
        # Check for dangerous patterns
        dangerous_chars = [';', '&', '|', '`', '$', '(', ')']
        for char in dangerous_chars:
            if char in command:
                raise ValueError(f"Dangerous character in command: {char}")
        
        return command
    
    def validate_workflow_id(self, workflow_id: str) -> str:
        """
        Validate workflow ID
        
        Args:
            workflow_id: Workflow ID to validate
        
        Returns:
            Validated workflow ID
        
        Raises:
            ValueError: If workflow ID is invalid
        """
        if not workflow_id:
            raise ValueError("Workflow ID cannot be empty")
        
        # Only allow alphanumeric, underscore, hyphen
        if not re.match(r'^[a-zA-Z0-9_-]+$', workflow_id):
            raise ValueError("Workflow ID contains invalid characters")
        
        if len(workflow_id) > 100:
            raise ValueError("Workflow ID too long")
        
        return workflow_id
    
    def validate_execution_id(self, execution_id: str) -> str:
        """
        Validate execution ID (UUID format)
        
        Args:
            execution_id: Execution ID to validate
        
        Returns:
            Validated execution ID
        
        Raises:
            ValueError: If execution ID is invalid
        """
        if not execution_id:
            raise ValueError("Execution ID cannot be empty")
        
        # UUID format: 8-4-4-4-12
        uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        if not re.match(uuid_pattern, execution_id, re.IGNORECASE):
            raise ValueError("Invalid execution ID format")
        
        return execution_id
    
    def sanitize_llm_output(self, output: str) -> str:
        """
        Sanitize LLM output before using in commands
        
        Args:
            output: LLM output to sanitize
        
        Returns:
            Sanitized output
        """
        # Remove shell metacharacters
        dangerous_chars = [';', '&', '|', '`', '$', '(', ')']
        sanitized = output
        for char in dangerous_chars:
            sanitized = sanitized.replace(char, '')
        
        return sanitized.strip()


class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = {}
    
    def check_rate_limit(self, key: str) -> bool:
        """
        Check if request is within rate limit
        
        Args:
            key: Unique identifier for rate limiting (e.g., IP, user ID)
        
        Returns:
            True if allowed, False if rate limited
        """
        import time
        
        now = time.time()
        
        # Get request history for this key
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside window
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.window_seconds
        ]
        
        # Check if under limit
        if len(self.requests[key]) >= self.max_requests:
            logger.warning("Rate limit exceeded", key=key, count=len(self.requests[key]))
            return False
        
        # Add current request
        self.requests[key].append(now)
        return True
    
    def reset(self, key: str):
        """Reset rate limit for a key"""
        if key in self.requests:
            del self.requests[key]


# Global instances
security_validator = SecurityValidator()
rate_limiter = RateLimiter()


# --- Password and JWT Functions (R1 Mitigation) ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a hashed one."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hashes a password."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a new access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, JWT_PRIVATE_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a new refresh token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, JWT_PRIVATE_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes a JWT token, returns payload if valid."""
    if is_token_blacklisted(token):
        logger.warning("Attempted to use a blacklisted token")
        return None
    try:
        payload = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.error("Invalid token", error=str(e))
        return None

def add_to_blacklist(jti: str):
    """Adds a token's JTI to the blacklist."""
    TOKEN_BLACKLIST.add(jti)
    logger.info("Token JTI added to blacklist", jti=jti)

def is_token_blacklisted(jti: str) -> bool:
    """Checks if a token's JTI is in the blacklist."""
    return jti in TOKEN_BLACKLIST
