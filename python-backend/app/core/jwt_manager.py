"""
JWT Token Manager with RS256 support and refresh tokens
Implements secure token management with JTI tracking
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


class JWTManager:
    """
    JWT token manager supporting both HS256 (symmetric) and RS256 (asymmetric)
    """

    def __init__(self):
        self.algorithm = settings.ALGORITHM
        self.access_token_expire = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        self.refresh_token_expire = settings.REFRESH_TOKEN_EXPIRE_DAYS

        # For HS256, use JWT_SECRET
        if self.algorithm == "HS256":
            self.secret_key = settings.JWT_SECRET
            self.public_key = None
            logger.info("jwt_manager_initialized", algorithm="HS256")

        # For RS256, load keys from files
        elif self.algorithm == "RS256":
            try:
                self.secret_key = self._load_private_key()
                self.public_key = self._load_public_key()
                logger.info("jwt_manager_initialized", algorithm="RS256")
            except Exception as e:
                if settings.ENVIRONMENT == "production":
                    raise ValueError(
                        f"RS256 keys are required in production but not found: {e}. "
                        "Generate keys with: python -m app.core.keys.generate_keys"
                    )
                logger.warning(
                    "rs256_keys_not_found_fallback_to_hs256",
                    error=str(e),
                    environment=settings.ENVIRONMENT,
                )
                self.algorithm = "HS256"
                self.secret_key = settings.JWT_SECRET
                self.public_key = None
        else:
            raise ValueError(f"Unsupported JWT algorithm: {self.algorithm}")

    def _load_private_key(self) -> str:
        """Load RS256 private key from file"""
        import os
        key_path = getattr(settings, 'JWT_PRIVATE_KEY_PATH', None)
        if not key_path:
            key_path = os.path.join(os.path.dirname(__file__), 'keys', 'private.pem')
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"RS256 private key not found at {key_path}")
        with open(key_path, 'r') as f:
            return f.read()

    def _load_public_key(self) -> str:
        """Load RS256 public key from file"""
        import os
        key_path = getattr(settings, 'JWT_PUBLIC_KEY_PATH', None)
        if not key_path:
            key_path = os.path.join(os.path.dirname(__file__), 'keys', 'public.pem')
        if not os.path.exists(key_path):
            raise FileNotFoundError(f"RS256 public key not found at {key_path}")
        with open(key_path, 'r') as f:
            return f.read()

    def create_access_token(
        self,
        user_id: int,
        additional_claims: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create access token with short expiration

        Args:
            user_id: User ID to encode in token
            additional_claims: Optional additional claims to include

        Returns:
            Encoded JWT token
        """
        now = datetime.utcnow()
        jti = str(uuid.uuid4())

        payload = {
            "sub": str(user_id),
            "type": "access",
            "jti": jti,
            "iat": now,
            "exp": now + timedelta(minutes=self.access_token_expire)
        }

        # Add additional claims if provided
        if additional_claims:
            payload.update(additional_claims)

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

        logger.debug(
            "access_token_created",
            user_id=user_id,
            jti=jti,
            expires_in=self.access_token_expire
        )

        return token

    def create_refresh_token(self, user_id: int) -> str:
        """
        Create refresh token with long expiration

        Args:
            user_id: User ID to encode in token

        Returns:
            Encoded JWT refresh token
        """
        now = datetime.utcnow()
        jti = str(uuid.uuid4())

        payload = {
            "sub": str(user_id),
            "type": "refresh",
            "jti": jti,
            "iat": now,
            "exp": now + timedelta(days=self.refresh_token_expire)
        }

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

        logger.debug(
            "refresh_token_created",
            user_id=user_id,
            jti=jti,
            expires_in_days=self.refresh_token_expire
        )

        return token

    def verify_token(
        self,
        token: str,
        expected_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify and decode JWT token

        Args:
            token: JWT token to verify
            expected_type: Expected token type ("access" or "refresh")

        Returns:
            Decoded token payload

        Raises:
            JWTError: If token is invalid, expired, or wrong type
        """
        try:
            # For RS256, use public key; for HS256, use secret key
            verify_key = self.public_key if self.algorithm == "RS256" else self.secret_key

            payload = jwt.decode(
                token,
                verify_key,
                algorithms=[self.algorithm]
            )

            # Verify token type if specified
            if expected_type and payload.get("type") != expected_type:
                raise JWTError(f"Invalid token type. Expected {expected_type}, got {payload.get('type')}")

            # Check if token is revoked (in-memory blacklist)
            jti = payload.get("jti")
            if jti:
                from app.core.security import is_token_blacklisted
                if is_token_blacklisted(jti):
                    raise JWTError("Token has been revoked")

            logger.debug(
                "token_verified",
                user_id=payload.get("sub"),
                token_type=payload.get("type"),
                jti=payload.get("jti")
            )

            return payload

        except JWTError as e:
            logger.warning(
                "token_verification_failed",
                error=str(e),
                error_type=type(e).__name__
            )
            raise

    def decode_token_unsafe(self, token: str) -> Dict[str, Any]:
        """
        Decode token without verification (for debugging only)

        Args:
            token: JWT token to decode

        Returns:
            Decoded token payload (unverified)
        """
        try:
            payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": False}
            )
            return payload
        except Exception as e:
            logger.error("token_decode_failed", error=str(e))
            return {}

    def get_token_expiration(self, token: str) -> Optional[datetime]:
        """
        Get expiration time from token

        Args:
            token: JWT token

        Returns:
            Expiration datetime or None if not found
        """
        try:
            payload = self.decode_token_unsafe(token)
            exp = payload.get("exp")
            if exp:
                return datetime.fromtimestamp(exp)
            return None
        except Exception:
            return None

    def is_token_expired(self, token: str) -> bool:
        """
        Check if token is expired

        Args:
            token: JWT token

        Returns:
            True if expired, False otherwise
        """
        exp_time = self.get_token_expiration(token)
        if exp_time:
            return datetime.utcnow() > exp_time
        return True

    def refresh_access_token(self, refresh_token: str) -> tuple[str, str]:
        """
        Create new access token from refresh token

        Args:
            refresh_token: Valid refresh token

        Returns:
            Tuple of (new_access_token, new_refresh_token)

        Raises:
            JWTError: If refresh token is invalid
        """
        # Verify refresh token
        payload = self.verify_token(refresh_token, expected_type="refresh")

        user_id = int(payload["sub"])

        # Create new tokens
        new_access_token = self.create_access_token(user_id)
        new_refresh_token = self.create_refresh_token(user_id)

        logger.info(
            "tokens_refreshed",
            user_id=user_id,
            old_jti=payload.get("jti")
        )

        return new_access_token, new_refresh_token


# Global JWT manager instance
_jwt_manager: Optional[JWTManager] = None


def get_jwt_manager() -> JWTManager:
    """Get or create global JWT manager instance"""
    global _jwt_manager
    if _jwt_manager is None:
        _jwt_manager = JWTManager()
    return _jwt_manager


# Convenience functions
def create_access_token(user_id: int, **additional_claims) -> str:
    """Create access token"""
    return get_jwt_manager().create_access_token(user_id, additional_claims)


def create_refresh_token(user_id: int) -> str:
    """Create refresh token"""
    return get_jwt_manager().create_refresh_token(user_id)


def verify_token(token: str, expected_type: Optional[str] = None) -> Dict[str, Any]:
    """Verify token"""
    return get_jwt_manager().verify_token(token, expected_type)


def refresh_tokens(refresh_token: str) -> tuple[str, str]:
    """Refresh both access and refresh tokens"""
    return get_jwt_manager().refresh_access_token(refresh_token)
