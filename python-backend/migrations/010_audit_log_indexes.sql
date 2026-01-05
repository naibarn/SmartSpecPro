-- Migration: Add composite indexes to audit_logs for performance
-- Date: 2024-01-15
-- Description: Add composite indexes for frequently queried patterns

-- Composite index for user actions over time
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action_time 
ON audit_logs(user_id, action, timestamp DESC);

-- Composite index for resource queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_time 
ON audit_logs(resource_type, resource_id, timestamp DESC);

-- Composite index for impersonation queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_impersonator_time 
ON audit_logs(impersonator_id, timestamp DESC) 
WHERE impersonator_id IS NOT NULL;

-- Composite index for action type queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time 
ON audit_logs(action, timestamp DESC);

-- Composite index for endpoint queries (API monitoring)
CREATE INDEX IF NOT EXISTS idx_audit_logs_endpoint_time 
ON audit_logs(endpoint, method, timestamp DESC) 
WHERE endpoint IS NOT NULL;

-- Composite index for status code queries (error monitoring)
CREATE INDEX IF NOT EXISTS idx_audit_logs_status_time 
ON audit_logs(status_code, timestamp DESC) 
WHERE status_code IS NOT NULL;

-- Comment explaining the indexes
COMMENT ON INDEX idx_audit_logs_user_action_time IS 'Optimizes queries for user activity history';
COMMENT ON INDEX idx_audit_logs_resource_time IS 'Optimizes queries for resource access history';
COMMENT ON INDEX idx_audit_logs_impersonator_time IS 'Optimizes queries for impersonation sessions';
COMMENT ON INDEX idx_audit_logs_action_time IS 'Optimizes queries for specific action types';
COMMENT ON INDEX idx_audit_logs_endpoint_time IS 'Optimizes queries for API endpoint monitoring';
COMMENT ON INDEX idx_audit_logs_status_time IS 'Optimizes queries for error tracking';
