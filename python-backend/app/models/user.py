"""
User Model - Compatible with SmartSpecWeb's schema
"""

from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text, Enum as SQLEnum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class Role(str, enum.Enum):
    """User role enum - must match SmartSpecWeb schema exactly"""
    user = "user"
    admin = "admin"
    domain_admin = "domain_admin"


class Plan(str, enum.Enum):
    """User plan enum - must match SmartSpecWeb schema exactly"""
    free = "free"
    starter = "starter"  # SmartSpecWeb uses 'starter', not 'basic'
    pro = "pro"
    enterprise = "enterprise"


class User(Base):
    """
    User model - matches SmartSpecWeb's users table schema
    """

    __tablename__ = "users"

    # Primary key - INTEGER auto-increment (SmartSpecWeb schema)
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)

    # OAuth fields
    openId = Column(String(64), unique=True, nullable=True)

    # Basic info
    name = Column(Text, nullable=True)
    email = Column(String(320), unique=True, nullable=True, index=True)
    password = Column(Text, nullable=True)  # SmartSpecWeb uses 'password' not 'password_hash'
    loginMethod = Column(String(64), nullable=True)

    # Role and plan
    role = Column(SQLEnum(Role, name='role', create_type=False), nullable=False, default=Role.user)
    plan = Column(SQLEnum(Plan, name='plan', create_type=False), nullable=False, default=Plan.free)

    # Credits (SmartSpecWeb uses 'credits' not 'credits_balance')
    credits = Column(Integer, default=0, nullable=False)

    # Timestamps (SmartSpecWeb uses camelCase)
    createdAt = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    lastSignedIn = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Domain and tenant
    registeredDomain = Column(String(255), nullable=True)
    currentTenantId = Column(String(36), ForeignKey("tenants.id"), nullable=True)

    # Trust scoring / anti-abuse
    normalizedEmail = Column(String(320), nullable=True)
    trustScore = Column(Integer, default=100, nullable=True)
    registrationIp = Column(String(45), nullable=True)

    # Status (SmartSpecWeb uses 'isDisabled' not 'is_active')
    isDisabled = Column(Boolean, default=False, nullable=False)

    # Ban fields
    is_banned = Column(Boolean, default=False, nullable=False)
    banned_until = Column(DateTime(timezone=True), nullable=True)
    ban_reason = Column(Text, nullable=True)

    # Relationships that exist in SmartSpecWeb
    # (Commenting out Python-specific relationships that don't exist in SmartSpecWeb)
    # credit_transactions = relationship("CreditTransaction", back_populates="user", lazy="dynamic")
    # payment_transactions = relationship("PaymentTransaction", back_populates="user", lazy="dynamic")
    # api_keys = relationship("APIKey", back_populates="user", lazy="dynamic")
    # oauth_connections = relationship("OAuthConnection", back_populates="user", lazy="dynamic")
    # semantic_memories = relationship("SemanticMemory", back_populates="user", lazy="dynamic")
    # opencode_api_keys = relationship("OpenCodeAPIKey", back_populates="user", lazy="dynamic")
    # media_tasks = relationship("MediaTask", back_populates="user", lazy="dynamic")
    # custom_skill_prompts = relationship("CustomSkillPrompt", back_populates="user", lazy="dynamic")
    # created_templates = relationship("MarketplaceTemplate", foreign_keys="MarketplaceTemplate.creator_id", back_populates="creator", lazy="dynamic")
    # template_purchases = relationship("TemplatePurchase", back_populates="buyer", lazy="dynamic")
    # preferences = relationship("UserPreferences", back_populates="user", uselist=False)

    # Compatibility properties for code that expects the old schema
    @property
    def is_active(self) -> bool:
        """Compatibility: returns True if user is not disabled"""
        return not self.isDisabled

    @property
    def is_admin(self) -> bool:
        """Compatibility: returns True if role is admin"""
        return self.role == Role.admin

    @property
    def full_name(self) -> str:
        """Compatibility: returns name field"""
        return self.name or ""

    @property
    def credits_balance(self) -> int:
        """Compatibility: returns credits field"""
        return self.credits

    @property
    def created_at(self):
        """Compatibility: returns createdAt field"""
        return self.createdAt

    @property
    def updated_at(self):
        """Compatibility: returns updatedAt field"""
        return self.updatedAt

    @property
    def email_verified(self) -> bool:
        """Compatibility: always returns True (no email verification in SmartSpecWeb)"""
        return True

    def __repr__(self):
        return f"<User {self.email}>"
