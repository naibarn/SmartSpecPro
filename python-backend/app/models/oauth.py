"""
OAuth Connection Model
"""

from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from app.core.database import Base


class OAuthConnection(Base):
    """OAuth connection model for social login"""
    
    __tablename__ = "oauth_connections"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)  # google, github, facebook
    provider_user_id = Column(String(255), nullable=False)  # OAuth provider's user ID
    access_token = Column(Text)  # OAuth access token (encrypted in production)
    refresh_token = Column(Text)  # OAuth refresh token (encrypted in production)
    token_expires_at = Column(DateTime(timezone=True))
    profile_data = Column(Text)  # JSON string of profile data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="oauth_connections")
    
    # Unique constraint: one provider account per user
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'},
    )
    
    def __repr__(self):
        return f"<OAuthConnection {self.provider}:{self.provider_user_id}>"
