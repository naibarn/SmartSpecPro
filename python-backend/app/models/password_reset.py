"""
Password Reset Token Model
Stores password reset tokens for forgot password functionality
"""

from datetime import datetime, timedelta
from sqlalchemy import Column, String, DateTime, Boolean
from app.core.database import Base


class PasswordResetToken(Base):
    """
    Password Reset Token
    
    Stores tokens for password reset requests
    """
    __tablename__ = "password_reset_tokens"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    # R12.1: Store a hash of the token, not the token itself
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    
    used_at = Column(DateTime, nullable=True) # R12.2: Mark as used with a timestamp
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(String(255), nullable=True)
    
    def __repr__(self):
        return f"<PasswordResetToken(id={self.id}, user_id={self.user_id}, used={self.used})>"
    
    def is_valid(self) -> bool:
        """Check if token is valid (not expired and not used)."""
        return self.used_at is None and datetime.utcnow() < self.expires_at
    
    @staticmethod
    def get_expiry_time() -> datetime:
        """Get expiry time for new tokens (1 hour from now)"""
        return datetime.utcnow() + timedelta(hours=1)
