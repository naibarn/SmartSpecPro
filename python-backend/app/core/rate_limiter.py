"""
Rate Limiter for LLM API calls

Implements sliding window rate limiting with:
- Per-user limits
- Per-IP limits (for unauthenticated requests)
- Configurable windows and limits
"""

import time
from typing import Dict, Optional, Tuple
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
import structlog

logger = structlog.get_logger()


@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    # Requests per window
    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    requests_per_day: int = 10000
    
    # Token limits (for LLM calls)
    tokens_per_minute: int = 100000
    tokens_per_hour: int = 1000000
    tokens_per_day: int = 10000000
    
    # Burst allowance (extra requests allowed in short bursts)
    burst_allowance: int = 10


@dataclass
class RateLimitWindow:
    """Sliding window for rate limiting"""
    count: int = 0
    tokens: int = 0
    window_start: float = field(default_factory=time.time)


class RateLimiter:
    """
    Sliding window rate limiter for LLM API calls
    
    Features:
    - Per-user rate limiting (by user_id)
    - Per-IP rate limiting (for anonymous requests)
    - Token-based limiting (for LLM usage)
    - Configurable limits per minute/hour/day
    """
    
    def __init__(self, config: Optional[RateLimitConfig] = None):
        self.config = config or RateLimitConfig()
        
        # Separate windows for different time periods
        self._minute_windows: Dict[str, RateLimitWindow] = defaultdict(RateLimitWindow)
        self._hour_windows: Dict[str, RateLimitWindow] = defaultdict(RateLimitWindow)
        self._day_windows: Dict[str, RateLimitWindow] = defaultdict(RateLimitWindow)
        
        # Lock for thread safety
        self._lock = Lock()
    
    def _get_key(self, user_id: Optional[str] = None, ip: Optional[str] = None) -> str:
        """Generate rate limit key from user_id or IP"""
        if user_id:
            return f"user:{user_id}"
        elif ip:
            return f"ip:{ip}"
        else:
            return "anonymous"
    
    def _clean_window(self, window: RateLimitWindow, window_seconds: int) -> RateLimitWindow:
        """Reset window if expired"""
        now = time.time()
        if now - window.window_start >= window_seconds:
            window.count = 0
            window.tokens = 0
            window.window_start = now
        return window
    
    def check_rate_limit(
        self,
        user_id: Optional[str] = None,
        ip: Optional[str] = None,
        estimated_tokens: int = 0
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        Check if request is within rate limits
        
        Args:
            user_id: User ID (for authenticated requests)
            ip: IP address (for anonymous requests)
            estimated_tokens: Estimated tokens for this request
        
        Returns:
            Tuple of (allowed, error_message, retry_after_seconds)
        """
        key = self._get_key(user_id, ip)
        
        with self._lock:
            now = time.time()
            
            # Clean and get windows
            minute_window = self._clean_window(self._minute_windows[key], 60)
            hour_window = self._clean_window(self._hour_windows[key], 3600)
            day_window = self._clean_window(self._day_windows[key], 86400)
            
            # Check request limits
            if minute_window.count >= self.config.requests_per_minute + self.config.burst_allowance:
                retry_after = int(60 - (now - minute_window.window_start))
                return False, "Rate limit exceeded (per minute)", max(1, retry_after)
            
            if hour_window.count >= self.config.requests_per_hour:
                retry_after = int(3600 - (now - hour_window.window_start))
                return False, "Rate limit exceeded (per hour)", max(1, retry_after)
            
            if day_window.count >= self.config.requests_per_day:
                retry_after = int(86400 - (now - day_window.window_start))
                return False, "Rate limit exceeded (per day)", max(1, retry_after)
            
            # Check token limits
            if estimated_tokens > 0:
                if minute_window.tokens + estimated_tokens > self.config.tokens_per_minute:
                    retry_after = int(60 - (now - minute_window.window_start))
                    return False, "Token limit exceeded (per minute)", max(1, retry_after)
                
                if hour_window.tokens + estimated_tokens > self.config.tokens_per_hour:
                    retry_after = int(3600 - (now - hour_window.window_start))
                    return False, "Token limit exceeded (per hour)", max(1, retry_after)
                
                if day_window.tokens + estimated_tokens > self.config.tokens_per_day:
                    retry_after = int(86400 - (now - day_window.window_start))
                    return False, "Token limit exceeded (per day)", max(1, retry_after)
            
            return True, None, None
    
    def record_request(
        self,
        user_id: Optional[str] = None,
        ip: Optional[str] = None,
        tokens_used: int = 0
    ) -> None:
        """
        Record a request for rate limiting
        
        Args:
            user_id: User ID (for authenticated requests)
            ip: IP address (for anonymous requests)
            tokens_used: Actual tokens used in this request
        """
        key = self._get_key(user_id, ip)
        
        with self._lock:
            # Clean and update windows
            minute_window = self._clean_window(self._minute_windows[key], 60)
            hour_window = self._clean_window(self._hour_windows[key], 3600)
            day_window = self._clean_window(self._day_windows[key], 86400)
            
            # Increment counts
            minute_window.count += 1
            hour_window.count += 1
            day_window.count += 1
            
            # Add tokens
            minute_window.tokens += tokens_used
            hour_window.tokens += tokens_used
            day_window.tokens += tokens_used
            
            # Update windows
            self._minute_windows[key] = minute_window
            self._hour_windows[key] = hour_window
            self._day_windows[key] = day_window
    
    def get_usage(
        self,
        user_id: Optional[str] = None,
        ip: Optional[str] = None
    ) -> Dict[str, Dict[str, int]]:
        """
        Get current usage stats for a user/IP
        
        Returns:
            Dict with usage stats per time window
        """
        key = self._get_key(user_id, ip)
        
        with self._lock:
            minute_window = self._clean_window(self._minute_windows[key], 60)
            hour_window = self._clean_window(self._hour_windows[key], 3600)
            day_window = self._clean_window(self._day_windows[key], 86400)
            
            return {
                "minute": {
                    "requests": minute_window.count,
                    "requests_limit": self.config.requests_per_minute,
                    "tokens": minute_window.tokens,
                    "tokens_limit": self.config.tokens_per_minute,
                },
                "hour": {
                    "requests": hour_window.count,
                    "requests_limit": self.config.requests_per_hour,
                    "tokens": hour_window.tokens,
                    "tokens_limit": self.config.tokens_per_hour,
                },
                "day": {
                    "requests": day_window.count,
                    "requests_limit": self.config.requests_per_day,
                    "tokens": day_window.tokens,
                    "tokens_limit": self.config.tokens_per_day,
                },
            }
    
    def reset(self, user_id: Optional[str] = None, ip: Optional[str] = None) -> None:
        """Reset rate limits for a user/IP (admin function)"""
        key = self._get_key(user_id, ip)
        
        with self._lock:
            self._minute_windows.pop(key, None)
            self._hour_windows.pop(key, None)
            self._day_windows.pop(key, None)


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get global rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def configure_rate_limiter(config: RateLimitConfig) -> None:
    """Configure global rate limiter"""
    global _rate_limiter
    _rate_limiter = RateLimiter(config)
