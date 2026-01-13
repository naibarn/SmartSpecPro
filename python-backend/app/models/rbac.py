"""
SmartSpec Pro - RBAC Database Models
Phase 3: Role-Based Access Control
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    DateTime,
    Boolean,
    Integer,
    Text,
    JSON,
    ForeignKey,
    Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class PermissionScope(str, enum.Enum):
    """Permission scope enum."""
    GLOBAL = "global"
    TENANT = "tenant"
    PROJECT = "project"
    RESOURCE = "resource"


class Role(Base):
    """
    Role model for RBAC.
    Roles define a set of permissions that can be assigned to users.
    """
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Scope
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    scope = Column(SQLEnum(PermissionScope), default=PermissionScope.TENANT)
    
    # Permissions (JSON array of permission strings)
    permissions = Column(JSON, default=list)
    
    # System role flag (cannot be deleted)
    is_system = Column(Boolean, default=False)
    is_default = Column(Boolean, default=False)  # Default role for new users
    
    # Hierarchy
    parent_role_id = Column(String(36), ForeignKey("roles.id"), nullable=True)
    priority = Column(Integer, default=0)  # Higher priority = more important
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    assignments = relationship("RoleAssignment", back_populates="role", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("idx_role_name", "name"),
        Index("idx_role_tenant", "tenant_id"),
        Index("idx_role_system", "is_system"),
    )


class Permission(Base):
    """
    Permission model for fine-grained access control.
    Permissions define specific actions on resources.
    """
    __tablename__ = "permissions"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), unique=True, nullable=False)  # e.g., "projects:read"
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Resource and action
    resource = Column(String(100), nullable=False)  # e.g., "projects"
    action = Column(String(50), nullable=False)  # e.g., "read", "write", "delete"
    
    # Scope
    scope = Column(SQLEnum(PermissionScope), default=PermissionScope.TENANT)
    
    # System permission flag
    is_system = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index("idx_permission_resource", "resource"),
        Index("idx_permission_action", "action"),
        Index("idx_permission_resource_action", "resource", "action"),
    )


class RoleAssignment(Base):
    """
    Role assignment model.
    Links users to roles within a specific context (tenant/project).
    """
    __tablename__ = "role_assignments"

    id = Column(String(36), primary_key=True)
    
    # User
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Role
    role_id = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    
    # Context (where this assignment applies)
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String(36), nullable=True)  # Optional project-level assignment
    
    # Assignment metadata
    assigned_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)
    
    # Validity
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    role = relationship("Role", back_populates="assignments")
    
    # Indexes
    __table_args__ = (
        Index("idx_role_assignment_user", "user_id"),
        Index("idx_role_assignment_role", "role_id"),
        Index("idx_role_assignment_tenant", "tenant_id"),
        Index("idx_role_assignment_user_tenant", "user_id", "tenant_id"),
    )


class Policy(Base):
    """
    Policy model for attribute-based access control (ABAC).
    Policies define complex access rules based on attributes.
    """
    __tablename__ = "policies"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Policy definition
    effect = Column(String(10), nullable=False)  # "allow" or "deny"
    principals = Column(JSON, default=list)  # Who this policy applies to
    actions = Column(JSON, default=list)  # What actions are affected
    resources = Column(JSON, default=list)  # What resources are affected
    conditions = Column(JSON, default=dict)  # Additional conditions
    
    # Scope
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    
    # Priority (higher = evaluated first)
    priority = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index("idx_policy_name", "name"),
        Index("idx_policy_tenant", "tenant_id"),
        Index("idx_policy_active", "is_active"),
    )
