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
from datetime import datetime, timedelta
from typing import Any, Dict, List

from app.core.config import settings

# R1.1: Unified password hashing — argon2id (single implementation)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# R1.2: JWT configuration delegated to jwt_manager.py
# These constants are kept for backwards compatibility but sourced from settings
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS


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
    """
    Advanced rate limiter with support for both IP-based and user-based limiting.
    Uses sliding window algorithm for accurate rate limiting.
    """

    def __init__(
        self,
        max_requests_anonymous: int = 60,
        max_requests_authenticated: int = 120,
        window_seconds: int = 60,
        burst_multiplier: float = 1.5
    ):
        """
        Initialize rate limiter with different limits for anonymous and authenticated users.

        Args:
            max_requests_anonymous: Max requests per window for unauthenticated users
            max_requests_authenticated: Max requests per window for authenticated users
            window_seconds: Time window in seconds
            burst_multiplier: Multiplier for burst allowance
        """
        self.max_requests_anonymous = max_requests_anonymous
        self.max_requests_authenticated = max_requests_authenticated
        self.window_seconds = window_seconds
        self.burst_multiplier = burst_multiplier
        self.requests: dict[str, list[float]] = {}
        self.user_tiers: dict[str, str] = {}  # Track user tier (anonymous, authenticated, premium)

    def check_rate_limit(
        self,
        key: str,
        is_authenticated: bool = False,
        tier: str = "standard"
    ) -> tuple[bool, dict]:
        """
        Check if request is within rate limit with enhanced tracking.

        Args:
            key: Unique identifier for rate limiting (IP or user:user_id)
            is_authenticated: Whether the request is from an authenticated user
            tier: User tier for different rate limits (standard, premium, admin)

        Returns:
            Tuple of (allowed: bool, info: dict with rate limit info)
        """
        import time

        now = time.time()

        # Determine max requests based on authentication and tier
        if tier == "admin":
            max_requests = self.max_requests_authenticated * 10  # Admins get 10x limit
        elif tier == "premium":
            max_requests = self.max_requests_authenticated * 2  # Premium users get 2x limit
        elif is_authenticated:
            max_requests = self.max_requests_authenticated
        else:
            max_requests = self.max_requests_anonymous

        # Calculate burst allowance
        burst_limit = int(max_requests * self.burst_multiplier)

        # Get request history for this key
        if key not in self.requests:
            self.requests[key] = []

        # Remove old requests outside window (sliding window)
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.window_seconds
        ]

        current_count = len(self.requests[key])

        # Check if under limit
        if current_count >= burst_limit:
            # Calculate retry-after time
            oldest_request = self.requests[key][0] if self.requests[key] else now
            retry_after = int(self.window_seconds - (now - oldest_request)) + 1

            logger.warning(
                "Rate limit exceeded",
                key=key,
                count=current_count,
                limit=max_requests,
                burst_limit=burst_limit,
                is_authenticated=is_authenticated,
                tier=tier
            )

            return False, {
                "allowed": False,
                "limit": max_requests,
                "remaining": 0,
                "reset": int(now + retry_after),
                "retry_after": retry_after
            }

        # Add current request
        self.requests[key].append(now)

        # Calculate remaining requests
        remaining = max_requests - (current_count + 1)
        reset_time = int(now + self.window_seconds)

        return True, {
            "allowed": True,
            "limit": max_requests,
            "remaining": max(0, remaining),
            "reset": reset_time,
            "retry_after": 0
        }

    def reset(self, key: str):
        """Reset rate limit for a specific key"""
        if key in self.requests:
            del self.requests[key]
            logger.info("Rate limit reset", key=key)

    def clear_all(self):
        """Clear all rate limit data (use with caution)"""
        self.requests.clear()
        self.user_tiers.clear()
        logger.info("All rate limits cleared")

    def get_stats(self, key: str) -> dict:
        """Get current rate limit stats for a key"""
        import time
        now = time.time()

        if key not in self.requests:
            return {
                "key": key,
                "current_count": 0,
                "window_seconds": self.window_seconds
            }

        # Clean old requests
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.window_seconds
        ]

        return {
            "key": key,
            "current_count": len(self.requests[key]),
            "window_seconds": self.window_seconds,
            "requests": self.requests[key]
        }


# Global instances
security_validator = SecurityValidator()
rate_limiter = RateLimiter()


# --- Password and JWT Functions (R1 Mitigation) ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a hashed one (supports argon2 + bcrypt migration)."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hashes a password using argon2id (preferred scheme)."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a new access token via unified jwt_manager."""
    from app.core.jwt_manager import get_jwt_manager
    mgr = get_jwt_manager()
    user_id = data.get("sub") or data.get("user_id")
    if not user_id:
        raise ValueError("user_id (sub) is required in token data")
    additional = {k: v for k, v in data.items() if k not in ("sub", "exp", "iat", "user_id", "type")}
    return mgr.create_access_token(int(user_id), additional_claims=additional)

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a new refresh token via unified jwt_manager."""
    from app.core.jwt_manager import get_jwt_manager
    mgr = get_jwt_manager()
    user_id = data.get("sub") or data.get("user_id")
    if not user_id:
        raise ValueError("user_id (sub) is required in token data")
    return mgr.create_refresh_token(int(user_id))

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes a JWT token, returns payload if valid."""
    from app.core.jwt_manager import get_jwt_manager
    try:
        mgr = get_jwt_manager()
        return mgr.verify_token(token)
    except Exception as e:
        logger.warning("Token decode failed", error=str(e))
        return None

def add_to_blacklist(jti: str):
    """Adds a token's JTI to the Redis/memory blacklist."""
    # Use cache_manager for distributed blacklist
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_async_blacklist_add(jti))
    except RuntimeError:
        # No running loop — fall back to memory
        _MEMORY_BLACKLIST.add(jti)
    logger.info("Token JTI blacklisted", jti=jti)

def is_token_blacklisted(jti: str) -> bool:
    """Checks if a token's JTI is in the blacklist (sync check — memory only)."""
    return jti in _MEMORY_BLACKLIST

# In-memory fallback set (also populated by async Redis check)
_MEMORY_BLACKLIST: set = set()

async def _async_blacklist_add(jti: str):
    """Add JTI to Redis blacklist with TTL equal to token max lifetime."""
    from app.core.cache import cache_manager
    _MEMORY_BLACKLIST.add(jti)
    await cache_manager.set(f"blacklist:{jti}", True, ttl=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

async def is_token_blacklisted_async(jti: str) -> bool:
    """Async check — Redis + memory."""
    if jti in _MEMORY_BLACKLIST:
        return True
    from app.core.cache import cache_manager
    val = await cache_manager.get(f"blacklist:{jti}")
    if val:
        _MEMORY_BLACKLIST.add(jti)
        return True
    return False
