-- Migration: Audit Logs System
-- Description: Create tables for comprehensive audit logging
-- Date: 2024-01-15

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User information
    user_id UUID,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    
    -- Impersonation tracking
    impersonator_id UUID,
    impersonator_email VARCHAR(255),
    is_impersonated VARCHAR(10) DEFAULT 'false',
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    
    -- Request details
    method VARCHAR(10),
    endpoint VARCHAR(500),
    status_code VARCHAR(10),
    
    -- Additional data
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Metadata
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_impersonator_id ON audit_logs(impersonator_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_endpoint ON audit_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_timestamp ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_impersonator ON audit_logs(impersonator_id, timestamp DESC);

-- Comments
COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for all user and admin actions';
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action';
COMMENT ON COLUMN audit_logs.impersonator_id IS 'Admin who is impersonating (if applicable)';
COMMENT ON COLUMN audit_logs.is_impersonated IS 'Whether this action was performed during impersonation';
COMMENT ON COLUMN audit_logs.action IS 'Action type (e.g., user.login, payment.create, llm.request)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., user, payment, llm_request)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional action-specific details in JSON format';
