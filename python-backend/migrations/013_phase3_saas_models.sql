-- ==========================================
-- Phase 3: SaaS Readiness - Database Models
-- Migration: 013_phase3_saas_models.sql
-- Date: 2026-01-13
-- ==========================================

-- ==========================================
-- Multi-tenancy Tables
-- ==========================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    plan VARCHAR(20) DEFAULT 'free' NOT NULL,
    owner_id VARCHAR(36) REFERENCES users(id),
    owner_email VARCHAR(255),
    settings JSON DEFAULT '{}',
    max_users INTEGER DEFAULT 5,
    max_projects INTEGER DEFAULT 10,
    max_storage_gb INTEGER DEFAULT 10,
    max_api_calls_per_month INTEGER DEFAULT 10000,
    current_users INTEGER DEFAULT 0,
    current_projects INTEGER DEFAULT 0,
    current_storage_gb INTEGER DEFAULT 0,
    current_api_calls INTEGER DEFAULT 0,
    billing_email VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    description TEXT,
    logo_url VARCHAR(500),
    website VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    suspended_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenant_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenant_owner ON tenants(owner_id);

-- Tenant Users table
CREATE TABLE IF NOT EXISTS tenant_users (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_active_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_user_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_user_user ON tenant_users(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_user_unique ON tenant_users(tenant_id, user_id);

-- ==========================================
-- RBAC Tables
-- ==========================================

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    scope VARCHAR(20) DEFAULT 'tenant',
    permissions JSON DEFAULT '[]',
    is_system BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    parent_role_id VARCHAR(36) REFERENCES roles(id),
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_role_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_role_system ON roles(is_system);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    scope VARCHAR(20) DEFAULT 'tenant',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permission_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permission_action ON permissions(action);
CREATE INDEX IF NOT EXISTS idx_permission_resource_action ON permissions(resource, action);

-- Role Assignments table
CREATE TABLE IF NOT EXISTS role_assignments (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36),
    assigned_by VARCHAR(36) REFERENCES users(id),
    reason TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_assignment_user ON role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_role ON role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_tenant ON role_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_role_assignment_user_tenant ON role_assignments(user_id, tenant_id);

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    effect VARCHAR(10) NOT NULL,
    principals JSON DEFAULT '[]',
    actions JSON DEFAULT '[]',
    resources JSON DEFAULT '[]',
    conditions JSON DEFAULT '{}',
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policy_name ON policies(name);
CREATE INDEX IF NOT EXISTS idx_policy_tenant ON policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_active ON policies(is_active);

-- ==========================================
-- Approval Gates Tables
-- ==========================================

-- Approval Requests table
CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(36) PRIMARY KEY,
    request_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36),
    execution_id VARCHAR(36),
    requester_id VARCHAR(36) REFERENCES users(id),
    requester_type VARCHAR(50) DEFAULT 'agent',
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    payload JSON DEFAULT '{}',
    metadata JSON DEFAULT '{}',
    risk_level VARCHAR(20) DEFAULT 'medium',
    risk_factors JSON DEFAULT '[]',
    required_approvers INTEGER DEFAULT 1,
    current_approvals INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    timeout_action VARCHAR(20) DEFAULT 'reject',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approval_request_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_request_tenant ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_type ON approval_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_approval_request_execution ON approval_requests(execution_id);

-- Approval Responses table
CREATE TABLE IF NOT EXISTS approval_responses (
    id VARCHAR(36) PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    approver_id VARCHAR(36) NOT NULL REFERENCES users(id),
    decision VARCHAR(20) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_response_request ON approval_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_approval_response_approver ON approval_responses(approver_id);

-- Approval Rules table
CREATE TABLE IF NOT EXISTS approval_rules (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36),
    trigger_type VARCHAR(50) NOT NULL,
    conditions JSON DEFAULT '{}',
    approver_roles JSON DEFAULT '[]',
    approver_users JSON DEFAULT '[]',
    required_approvals INTEGER DEFAULT 1,
    timeout_minutes INTEGER DEFAULT 60,
    timeout_action VARCHAR(20) DEFAULT 'reject',
    auto_approve_conditions JSON DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approval_rule_tenant ON approval_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_rule_type ON approval_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_approval_rule_active ON approval_rules(is_active);

-- ==========================================
-- Secrets Management Tables
-- ==========================================

-- Secrets table
CREATE TABLE IF NOT EXISTS secrets (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36),
    secret_type VARCHAR(30) DEFAULT 'custom',
    encrypted_value TEXT NOT NULL,
    value_hash VARCHAR(64),
    encryption_key_id VARCHAR(36),
    encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    rotation_enabled BOOLEAN DEFAULT FALSE,
    rotation_interval_days INTEGER DEFAULT 90,
    last_rotated_at TIMESTAMP,
    next_rotation_at TIMESTAMP,
    expires_at TIMESTAMP,
    allowed_services JSON DEFAULT '[]',
    created_by VARCHAR(36) REFERENCES users(id),
    last_accessed_at TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_secret_name ON secrets(name);
CREATE INDEX IF NOT EXISTS idx_secret_tenant ON secrets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_secret_type ON secrets(secret_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_secret_tenant_name ON secrets(tenant_id, name);

-- Secret Versions table
CREATE TABLE IF NOT EXISTS secret_versions (
    id VARCHAR(36) PRIMARY KEY,
    secret_id VARCHAR(36) NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    encrypted_value TEXT NOT NULL,
    value_hash VARCHAR(64),
    created_by VARCHAR(36) REFERENCES users(id),
    reason TEXT,
    is_current BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secret_version_secret ON secret_versions(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_version_current ON secret_versions(secret_id, is_current);

-- Audit Events table
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(36) PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    actor_id VARCHAR(36),
    actor_email VARCHAR(255),
    actor_ip VARCHAR(45),
    actor_user_agent TEXT,
    target_type VARCHAR(50),
    target_id VARCHAR(36),
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE SET NULL,
    project_id VARCHAR(36),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_events(severity);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

-- ==========================================
-- Vector Store Tables
-- ==========================================

-- Vector Collections table
CREATE TABLE IF NOT EXISTS vector_collections (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36),
    dimension INTEGER NOT NULL DEFAULT 1536,
    distance_metric VARCHAR(20) DEFAULT 'cosine',
    index_type VARCHAR(20) DEFAULT 'hnsw',
    index_params JSON DEFAULT '{}',
    vector_count INTEGER DEFAULT 0,
    total_size_bytes INTEGER DEFAULT 0,
    is_indexed BOOLEAN DEFAULT FALSE,
    last_indexed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vector_collection_name ON vector_collections(name);
CREATE INDEX IF NOT EXISTS idx_vector_collection_tenant ON vector_collections(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_collection_tenant_name ON vector_collections(tenant_id, name);

-- Vector Documents table
CREATE TABLE IF NOT EXISTS vector_documents (
    id VARCHAR(36) PRIMARY KEY,
    collection_id VARCHAR(36) NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_hash VARCHAR(64),
    metadata JSON DEFAULT '{}',
    source VARCHAR(255),
    source_type VARCHAR(50),
    chunk_index INTEGER DEFAULT 0,
    parent_id VARCHAR(36),
    embedding_model VARCHAR(100),
    embedding_dimension INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vector_document_collection ON vector_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_vector_document_hash ON vector_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_vector_document_source ON vector_documents(source);

-- Embedding Jobs table
CREATE TABLE IF NOT EXISTS embedding_jobs (
    id VARCHAR(36) PRIMARY KEY,
    collection_id VARCHAR(36) NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    total_documents INTEGER DEFAULT 0,
    processed_documents INTEGER DEFAULT 0,
    failed_documents INTEGER DEFAULT 0,
    embedding_model VARCHAR(100) NOT NULL,
    batch_size INTEGER DEFAULT 100,
    error_message TEXT,
    errors JSON DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_embedding_job_collection ON embedding_jobs(collection_id);
CREATE INDEX IF NOT EXISTS idx_embedding_job_status ON embedding_jobs(status);

-- ==========================================
-- OpenCode API Keys table
-- ==========================================

CREATE TABLE IF NOT EXISTS opencode_api_keys (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    scopes JSON DEFAULT '[]',
    rate_limit_rpm INTEGER DEFAULT 60,
    rate_limit_rpd INTEGER DEFAULT 1000,
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opencode_key_user ON opencode_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_opencode_key_hash ON opencode_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_opencode_key_prefix ON opencode_api_keys(key_prefix);

-- ==========================================
-- Insert Default System Roles
-- ==========================================

INSERT INTO roles (id, name, display_name, description, scope, permissions, is_system, is_default, priority)
VALUES 
    ('role-owner', 'owner', 'Owner', 'Full access to all resources', 'tenant', '["*:*"]', TRUE, FALSE, 100),
    ('role-admin', 'admin', 'Administrator', 'Administrative access', 'tenant', '["*:read", "*:write", "*:delete", "users:*", "settings:*"]', TRUE, FALSE, 90),
    ('role-developer', 'developer', 'Developer', 'Development access', 'tenant', '["projects:*", "executions:*", "files:*", "api:*"]', TRUE, TRUE, 50),
    ('role-viewer', 'viewer', 'Viewer', 'Read-only access', 'tenant', '["*:read"]', TRUE, FALSE, 10)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- Insert Default Permissions
-- ==========================================

INSERT INTO permissions (id, name, display_name, description, resource, action, is_system)
VALUES 
    ('perm-projects-read', 'projects:read', 'Read Projects', 'View projects', 'projects', 'read', TRUE),
    ('perm-projects-write', 'projects:write', 'Write Projects', 'Create and edit projects', 'projects', 'write', TRUE),
    ('perm-projects-delete', 'projects:delete', 'Delete Projects', 'Delete projects', 'projects', 'delete', TRUE),
    ('perm-executions-read', 'executions:read', 'Read Executions', 'View executions', 'executions', 'read', TRUE),
    ('perm-executions-write', 'executions:write', 'Write Executions', 'Create and manage executions', 'executions', 'write', TRUE),
    ('perm-users-read', 'users:read', 'Read Users', 'View users', 'users', 'read', TRUE),
    ('perm-users-write', 'users:write', 'Write Users', 'Manage users', 'users', 'write', TRUE),
    ('perm-settings-read', 'settings:read', 'Read Settings', 'View settings', 'settings', 'read', TRUE),
    ('perm-settings-write', 'settings:write', 'Write Settings', 'Manage settings', 'settings', 'write', TRUE),
    ('perm-secrets-read', 'secrets:read', 'Read Secrets', 'View secrets', 'secrets', 'read', TRUE),
    ('perm-secrets-write', 'secrets:write', 'Write Secrets', 'Manage secrets', 'secrets', 'write', TRUE),
    ('perm-approvals-read', 'approvals:read', 'Read Approvals', 'View approvals', 'approvals', 'read', TRUE),
    ('perm-approvals-write', 'approvals:write', 'Write Approvals', 'Manage approvals', 'approvals', 'write', TRUE)
ON CONFLICT (id) DO NOTHING;
