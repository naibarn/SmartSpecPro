"""
Token Blacklist Model
Stores revoked JWT tokens for logout functionality
"""

from datetime import datetime
from sqlalchemy import Column, String, DateTime, Index
from app.core.database import Base


class TokenBlacklist(Base):
    """
    Token Blacklist for logout functionality
    
    Stores JTI (JWT ID) of revoked tokens
    """
    __tablename__ = "token_blacklist"
    
    jti = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    token_type = Column(String(20), nullable=False)  # 'access' or 'refresh'
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reason = Column(String(100), nullable=True)  # 'logout', 'password_change', 'admin_revoke'
    
    # Index for cleanup queries
    __table_args__ = (
        Index('idx_expires_at', 'expires_at'),
        Index('idx_user_id_token_type', 'user_id', 'token_type'),
    )
    
    def __repr__(self):
        return f"<TokenBlacklist(jti={self.jti}, user_id={self.user_id}, type={self.token_type})>"
