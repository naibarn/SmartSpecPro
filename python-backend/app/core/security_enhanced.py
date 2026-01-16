"""
Enhanced Security Module
Additional security features for production
"""

import hashlib
import secrets
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from collections import defaultdict
import structlog

logger = structlog.get_logger()


class AdvancedRateLimiter:
    """
    Advanced Rate Limiter
    
    Implements token bucket algorithm with multiple tiers
    """
    
    def __init__(self):
        self.buckets = defaultdict(lambda: {
            "tokens": 0,
            "last_update": datetime.utcnow()
        })
        self.limits = {
            "auth": {"requests": 10, "window": 60},  # 10 req/min
            "dashboard": {"requests": 60, "window": 60},  # 60 req/min
            "payments": {"requests": 30, "window": 60},  # 30 req/min
            "llm": {"requests": 100, "window": 60},  # 100 req/min
            "opencode": {"requests": 200, "window": 60},  # 200 req/min for OpenCode
            "default": {"requests": 60, "window": 60}  # 60 req/min
        }
    
    def _get_limit(self, endpoint: str) -> Dict[str, int]:
        """Get rate limit for endpoint"""
        for key, limit in self.limits.items():
            if key in endpoint:
                return limit
        return self.limits["default"]
    
    def check_rate_limit(self, identifier: str, endpoint: str) -> tuple[bool, Dict[str, Any]]:
        """Check if request is within rate limit"""
        key = f"{identifier}:{endpoint}"
        bucket = self.buckets[key]
        limit = self._get_limit(endpoint)
        
        now = datetime.utcnow()
        time_passed = (now - bucket["last_update"]).total_seconds()
        
        # Refill tokens
        bucket["tokens"] = min(
            limit["requests"],
            bucket["tokens"] + (time_passed / limit["window"]) * limit["requests"]
        )
        bucket["last_update"] = now
        
        # Check if request allowed
        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True, {
                "remaining": int(bucket["tokens"]),
                "limit": limit["requests"],
                "reset": (now + timedelta(seconds=limit["window"])).isoformat()
            }
        else:
            return False, {
                "remaining": 0,
                "limit": limit["requests"],
                "reset": (now + timedelta(seconds=limit["window"])).isoformat()
            }


class SecurityHeaders:
    """Security Headers for production"""
    
    @staticmethod
    def get_headers() -> Dict[str, str]:
        """Get security headers"""
        return {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self' https://api.stripe.com"
            ),
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
        }


class TokenGenerator:
    """Secure token generator"""
    
    # API Key prefix for SmartSpec
    API_KEY_PREFIX = "sk-smartspec-"
    
    @staticmethod
    def generate_token(length: int = 32) -> str:
        """Generate secure random token"""
        return secrets.token_urlsafe(length)
    
    @staticmethod
    def generate_api_key() -> str:
        """
        Generate API key with SmartSpec format.
        
        Format: sk-smartspec-{random_43_chars}
        Total length: ~55 characters
        
        Returns:
            API key string starting with sk-smartspec-
        """
        # Generate 32 bytes = 43 characters in base64url
        token = secrets.token_urlsafe(32)
        return f"{TokenGenerator.API_KEY_PREFIX}{token}"
    
    @staticmethod
    def hash_token(token: str) -> str:
        """Hash token for storage using SHA-256"""
        return hashlib.sha256(token.encode()).hexdigest()
    
    @staticmethod
    def is_valid_api_key_format(key: str) -> bool:
        """
        Check if API key has valid format.
        
        Args:
            key: API key to validate
            
        Returns:
            True if format is valid
        """
        if not key:
            return False
        return key.startswith(TokenGenerator.API_KEY_PREFIX)


class AuditLogger:
    """Audit logger for security events"""
    
    def __init__(self):
        self.events = []
    
    def log_event(
        self,
        event_type: str,
        user_id: Optional[str],
        ip_address: str,
        details: Dict[str, Any]
    ):
        """Log security event"""
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "type": event_type,
            "user_id": user_id,
            "ip_address": ip_address,
            "details": details
        }
        
        self.events.append(event)
        logger.info("security_event", **event)
        
        if len(self.events) > 1000:
            self.events.pop(0)
    
    def get_events(
        self,
        user_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 100
    ) -> list:
        """Get audit events"""
        events = self.events
        
        if user_id:
            events = [e for e in events if e["user_id"] == user_id]
        
        if event_type:
            events = [e for e in events if e["type"] == event_type]
        
        return events[-limit:]


class PasswordPolicy:
    """Password policy enforcement"""
    
    MIN_LENGTH = 8
    REQUIRE_UPPERCASE = True
    REQUIRE_LOWERCASE = True
    REQUIRE_DIGIT = True
    
    @classmethod
    def validate(cls, password: str) -> tuple[bool, Optional[str]]:
        """Validate password against policy"""
        if len(password) < cls.MIN_LENGTH:
            return False, f"Password must be at least {cls.MIN_LENGTH} characters"
        
        if cls.REQUIRE_UPPERCASE and not any(c.isupper() for c in password):
            return False, "Password must contain at least one uppercase letter"
        
        if cls.REQUIRE_LOWERCASE and not any(c.islower() for c in password):
            return False, "Password must contain at least one lowercase letter"
        
        if cls.REQUIRE_DIGIT and not any(c.isdigit() for c in password):
            return False, "Password must contain at least one digit"
        
        return True, None


# Global instances
advanced_rate_limiter = AdvancedRateLimiter()
audit_logger = AuditLogger()
