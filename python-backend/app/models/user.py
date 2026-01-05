"""
User Model
"""

from sqlalchemy import Column, String, Boolean, BigInteger, DateTime, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship


import uuid

from app.core.database import Base


class User(Base):
    """User model for authentication and credit management"""
    
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    # R5.1: Use BigInteger for credits to prevent overflow
    credits_balance = Column(BigInteger, default=0, nullable=False)  # Credits (1 USD = 1,000 credits)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    credit_transactions = relationship("CreditTransaction", back_populates="user", lazy="dynamic")
    payment_transactions = relationship("PaymentTransaction", back_populates="user", lazy="dynamic")
    api_keys = relationship("APIKey", back_populates="user", lazy="dynamic")
    oauth_connections = relationship("OAuthConnection", back_populates="user", lazy="dynamic")
    semantic_memories = relationship("SemanticMemory", back_populates="user", lazy="dynamic")
    
    # Generation relationships
    generation_tasks = relationship("GenerationTask", back_populates="user", lazy="dynamic")
    generation_api_keys = relationship("GenerationAPIKey", back_populates="user", lazy="dynamic")
    provider_credentials = relationship("ProviderCredential", back_populates="user", lazy="dynamic")
    
    # Gallery relationships
    gallery_items = relationship("GalleryItem", back_populates="user", lazy="dynamic")
    
    # Enhanced API Key v2 relationships
    api_keys_v2 = relationship("APIKeyV2", back_populates="user", lazy="dynamic")
    
    # Credits and Usage relationships
    credits_balance_record = relationship("CreditsBalance", back_populates="user", uselist=False)
    usage_records = relationship("UsageRecord", back_populates="user", lazy="dynamic")
    
    def __repr__(self):
        return f"<User {self.email}>"



