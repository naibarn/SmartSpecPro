"""
Phase 3: SaaS Readiness - Database Models

Revision ID: phase3_001
Revises: 
Create Date: 2026-01-13

This migration creates tables for:
- Multi-tenancy (tenants, tenant_users)
- RBAC (roles, permissions, role_assignments, policies)
- Approval Gates (approval_requests, approval_responses, approval_rules)
- Secrets Management (secrets, secret_versions, audit_events)
- Vector Store (vector_collections, vector_documents, embedding_jobs)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'phase3_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==========================================
    # Multi-tenancy Tables
    # ==========================================
    
    # Tenants table
    op.create_table(
        'tenants',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('status', sa.String(20), default='active', nullable=False),
        sa.Column('plan', sa.String(20), default='free', nullable=False),
        sa.Column('owner_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('owner_email', sa.String(255), nullable=True),
        sa.Column('settings', sa.JSON, default=dict),
        sa.Column('max_users', sa.Integer, default=5),
        sa.Column('max_projects', sa.Integer, default=10),
        sa.Column('max_storage_gb', sa.Integer, default=10),
        sa.Column('max_api_calls_per_month', sa.Integer, default=10000),
        sa.Column('current_users', sa.Integer, default=0),
        sa.Column('current_projects', sa.Integer, default=0),
        sa.Column('current_storage_gb', sa.Integer, default=0),
        sa.Column('current_api_calls', sa.Integer, default=0),
        sa.Column('billing_email', sa.String(255), nullable=True),
        sa.Column('stripe_customer_id', sa.String(255), nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('website', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('suspended_at', sa.DateTime, nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_tenant_slug', 'tenants', ['slug'])
    op.create_index('idx_tenant_status', 'tenants', ['status'])
    op.create_index('idx_tenant_plan', 'tenants', ['plan'])
    op.create_index('idx_tenant_owner', 'tenants', ['owner_id'])
    
    # Tenant Users table
    op.create_table(
        'tenant_users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), default='member', nullable=False),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('joined_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('last_active_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_tenant_user_tenant', 'tenant_users', ['tenant_id'])
    op.create_index('idx_tenant_user_user', 'tenant_users', ['user_id'])
    op.create_index('idx_tenant_user_unique', 'tenant_users', ['tenant_id', 'user_id'], unique=True)
    
    # ==========================================
    # RBAC Tables
    # ==========================================
    
    # Roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('scope', sa.String(20), default='tenant'),
        sa.Column('permissions', sa.JSON, default=list),
        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('is_default', sa.Boolean, default=False),
        sa.Column('parent_role_id', sa.String(36), sa.ForeignKey('roles.id'), nullable=True),
        sa.Column('priority', sa.Integer, default=0),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_role_name', 'roles', ['name'])
    op.create_index('idx_role_tenant', 'roles', ['tenant_id'])
    op.create_index('idx_role_system', 'roles', ['is_system'])
    
    # Permissions table
    op.create_table(
        'permissions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('resource', sa.String(100), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('scope', sa.String(20), default='tenant'),
        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_permission_resource', 'permissions', ['resource'])
    op.create_index('idx_permission_action', 'permissions', ['action'])
    op.create_index('idx_permission_resource_action', 'permissions', ['resource', 'action'])
    
    # Role Assignments table
    op.create_table(
        'role_assignments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_id', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('assigned_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_role_assignment_user', 'role_assignments', ['user_id'])
    op.create_index('idx_role_assignment_role', 'role_assignments', ['role_id'])
    op.create_index('idx_role_assignment_tenant', 'role_assignments', ['tenant_id'])
    op.create_index('idx_role_assignment_user_tenant', 'role_assignments', ['user_id', 'tenant_id'])
    
    # Policies table
    op.create_table(
        'policies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('effect', sa.String(10), nullable=False),
        sa.Column('principals', sa.JSON, default=list),
        sa.Column('actions', sa.JSON, default=list),
        sa.Column('resources', sa.JSON, default=list),
        sa.Column('conditions', sa.JSON, default=dict),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('priority', sa.Integer, default=0),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_policy_name', 'policies', ['name'])
    op.create_index('idx_policy_tenant', 'policies', ['tenant_id'])
    op.create_index('idx_policy_active', 'policies', ['is_active'])
    
    # ==========================================
    # Approval Gates Tables
    # ==========================================
    
    # Approval Requests table
    op.create_table(
        'approval_requests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('request_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('execution_id', sa.String(36), nullable=True),
        sa.Column('requester_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('requester_type', sa.String(50), default='agent'),
        sa.Column('status', sa.String(20), default='pending', nullable=False),
        sa.Column('payload', sa.JSON, default=dict),
        sa.Column('metadata', sa.JSON, default=dict),
        sa.Column('risk_level', sa.String(20), default='medium'),
        sa.Column('risk_factors', sa.JSON, default=list),
        sa.Column('required_approvers', sa.Integer, default=1),
        sa.Column('current_approvals', sa.Integer, default=0),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('timeout_action', sa.String(20), default='reject'),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_approval_request_status', 'approval_requests', ['status'])
    op.create_index('idx_approval_request_tenant', 'approval_requests', ['tenant_id'])
    op.create_index('idx_approval_request_type', 'approval_requests', ['request_type'])
    op.create_index('idx_approval_request_execution', 'approval_requests', ['execution_id'])
    
    # Approval Responses table
    op.create_table(
        'approval_responses',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('request_id', sa.String(36), sa.ForeignKey('approval_requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('approver_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('decision', sa.String(20), nullable=False),
        sa.Column('comment', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_approval_response_request', 'approval_responses', ['request_id'])
    op.create_index('idx_approval_response_approver', 'approval_responses', ['approver_id'])
    
    # Approval Rules table
    op.create_table(
        'approval_rules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('trigger_type', sa.String(50), nullable=False),
        sa.Column('conditions', sa.JSON, default=dict),
        sa.Column('approver_roles', sa.JSON, default=list),
        sa.Column('approver_users', sa.JSON, default=list),
        sa.Column('required_approvals', sa.Integer, default=1),
        sa.Column('timeout_minutes', sa.Integer, default=60),
        sa.Column('timeout_action', sa.String(20), default='reject'),
        sa.Column('auto_approve_conditions', sa.JSON, default=dict),
        sa.Column('priority', sa.Integer, default=0),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_approval_rule_tenant', 'approval_rules', ['tenant_id'])
    op.create_index('idx_approval_rule_type', 'approval_rules', ['trigger_type'])
    op.create_index('idx_approval_rule_active', 'approval_rules', ['is_active'])
    
    # ==========================================
    # Secrets Management Tables
    # ==========================================
    
    # Secrets table
    op.create_table(
        'secrets',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('secret_type', sa.String(30), default='custom'),
        sa.Column('encrypted_value', sa.Text, nullable=False),
        sa.Column('value_hash', sa.String(64), nullable=True),
        sa.Column('encryption_key_id', sa.String(36), nullable=True),
        sa.Column('encryption_algorithm', sa.String(50), default='AES-256-GCM'),
        sa.Column('rotation_enabled', sa.Boolean, default=False),
        sa.Column('rotation_interval_days', sa.Integer, default=90),
        sa.Column('last_rotated_at', sa.DateTime, nullable=True),
        sa.Column('next_rotation_at', sa.DateTime, nullable=True),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('allowed_services', sa.JSON, default=list),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime, nullable=True),
        sa.Column('access_count', sa.Integer, default=0),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_secret_name', 'secrets', ['name'])
    op.create_index('idx_secret_tenant', 'secrets', ['tenant_id'])
    op.create_index('idx_secret_type', 'secrets', ['secret_type'])
    op.create_index('idx_secret_tenant_name', 'secrets', ['tenant_id', 'name'], unique=True)
    
    # Secret Versions table
    op.create_table(
        'secret_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('secret_id', sa.String(36), sa.ForeignKey('secrets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('encrypted_value', sa.Text, nullable=False),
        sa.Column('value_hash', sa.String(64), nullable=True),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('is_current', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_secret_version_secret', 'secret_versions', ['secret_id'])
    op.create_index('idx_secret_version_current', 'secret_versions', ['secret_id', 'is_current'])
    
    # Audit Events table
    op.create_table(
        'audit_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('actor_id', sa.String(36), nullable=True),
        sa.Column('actor_email', sa.String(255), nullable=True),
        sa.Column('actor_ip', sa.String(45), nullable=True),
        sa.Column('actor_user_agent', sa.Text, nullable=True),
        sa.Column('target_type', sa.String(50), nullable=True),
        sa.Column('target_id', sa.String(36), nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('success', sa.Boolean, default=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('severity', sa.String(20), default='info'),
        sa.Column('metadata', sa.JSON, default=dict),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_audit_action', 'audit_events', ['action'])
    op.create_index('idx_audit_actor', 'audit_events', ['actor_id'])
    op.create_index('idx_audit_tenant', 'audit_events', ['tenant_id'])
    op.create_index('idx_audit_target', 'audit_events', ['target_type', 'target_id'])
    op.create_index('idx_audit_severity', 'audit_events', ['severity'])
    op.create_index('idx_audit_created', 'audit_events', ['created_at'])
    
    # ==========================================
    # Vector Store Tables
    # ==========================================
    
    # Vector Collections table
    op.create_table(
        'vector_collections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', sa.String(36), nullable=True),
        sa.Column('dimension', sa.Integer, nullable=False, default=1536),
        sa.Column('distance_metric', sa.String(20), default='cosine'),
        sa.Column('index_type', sa.String(20), default='hnsw'),
        sa.Column('index_params', sa.JSON, default=dict),
        sa.Column('vector_count', sa.Integer, default=0),
        sa.Column('total_size_bytes', sa.Integer, default=0),
        sa.Column('is_indexed', sa.Boolean, default=False),
        sa.Column('last_indexed_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_vector_collection_name', 'vector_collections', ['name'])
    op.create_index('idx_vector_collection_tenant', 'vector_collections', ['tenant_id'])
    op.create_index('idx_vector_collection_tenant_name', 'vector_collections', ['tenant_id', 'name'], unique=True)
    
    # Vector Documents table
    op.create_table(
        'vector_documents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('collection_id', sa.String(36), sa.ForeignKey('vector_collections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=True),
        sa.Column('metadata', sa.JSON, default=dict),
        sa.Column('source', sa.String(255), nullable=True),
        sa.Column('source_type', sa.String(50), nullable=True),
        sa.Column('chunk_index', sa.Integer, default=0),
        sa.Column('parent_id', sa.String(36), nullable=True),
        sa.Column('embedding_model', sa.String(100), nullable=True),
        sa.Column('embedding_dimension', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('idx_vector_document_collection', 'vector_documents', ['collection_id'])
    op.create_index('idx_vector_document_hash', 'vector_documents', ['content_hash'])
    op.create_index('idx_vector_document_source', 'vector_documents', ['source'])
    
    # Embedding Jobs table
    op.create_table(
        'embedding_jobs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('collection_id', sa.String(36), sa.ForeignKey('vector_collections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('total_documents', sa.Integer, default=0),
        sa.Column('processed_documents', sa.Integer, default=0),
        sa.Column('failed_documents', sa.Integer, default=0),
        sa.Column('embedding_model', sa.String(100), nullable=False),
        sa.Column('batch_size', sa.Integer, default=100),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('errors', sa.JSON, default=list),
        sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        sa.Column('started_at', sa.DateTime, nullable=True),
        sa.Column('completed_at', sa.DateTime, nullable=True),
    )
    op.create_index('idx_embedding_job_collection', 'embedding_jobs', ['collection_id'])
    op.create_index('idx_embedding_job_status', 'embedding_jobs', ['status'])
    
    # ==========================================
    # OpenCode API Keys table (if not exists)
    # ==========================================
    
    # Check if table exists before creating
    # This handles the case where the table was already created
    try:
        op.create_table(
            'opencode_api_keys',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('key_hash', sa.String(64), nullable=False),
            sa.Column('key_prefix', sa.String(10), nullable=False),
            sa.Column('status', sa.String(20), default='active'),
            sa.Column('scopes', sa.JSON, default=list),
            sa.Column('rate_limit_rpm', sa.Integer, default=60),
            sa.Column('rate_limit_rpd', sa.Integer, default=1000),
            sa.Column('last_used_at', sa.DateTime, nullable=True),
            sa.Column('usage_count', sa.Integer, default=0),
            sa.Column('expires_at', sa.DateTime, nullable=True),
            sa.Column('created_at', sa.DateTime, default=sa.func.now(), nullable=False),
        )
        op.create_index('idx_opencode_key_user', 'opencode_api_keys', ['user_id'])
        op.create_index('idx_opencode_key_hash', 'opencode_api_keys', ['key_hash'])
        op.create_index('idx_opencode_key_prefix', 'opencode_api_keys', ['key_prefix'])
    except Exception:
        pass  # Table already exists


def downgrade() -> None:
    # Drop tables in reverse order of creation
    op.drop_table('embedding_jobs')
    op.drop_table('vector_documents')
    op.drop_table('vector_collections')
    op.drop_table('audit_events')
    op.drop_table('secret_versions')
    op.drop_table('secrets')
    op.drop_table('approval_rules')
    op.drop_table('approval_responses')
    op.drop_table('approval_requests')
    op.drop_table('policies')
    op.drop_table('role_assignments')
    op.drop_table('permissions')
    op.drop_table('roles')
    op.drop_table('tenant_users')
    op.drop_table('tenants')
    
    try:
        op.drop_table('opencode_api_keys')
    except Exception:
        pass
