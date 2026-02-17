-- Workflow Addition Feature (015) - Database Migrations
-- Created: 2026-02-17

-- ============================================
-- Workflow Schedules for Trigger Nodes
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    trigger_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_run 
ON workflow_schedules(next_run_at) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow 
ON workflow_schedules(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_tenant 
ON workflow_schedules(tenant_id);

-- ============================================
-- Webhook Registrations
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    path VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_path ON webhooks(path);
CREATE INDEX IF NOT EXISTS idx_webhooks_workflow ON webhooks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

-- ============================================
-- Execution Checkpoints for Resume
-- ============================================
CREATE TABLE IF NOT EXISTS execution_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_checkpoints_execution 
ON execution_checkpoints(execution_id);

-- ============================================
-- Skills Table Extensions
-- ============================================
DO $$
BEGIN
    -- Add workflow_id column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'skills' AND column_name = 'workflow_id'
    ) THEN
        ALTER TABLE skills 
        ADD COLUMN workflow_id INTEGER REFERENCES workflows(id);
    END IF;

    -- Add conversion_metadata column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'skills' AND column_name = 'conversion_metadata'
    ) THEN
        ALTER TABLE skills 
        ADD COLUMN conversion_metadata JSONB;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skills_workflow ON skills(workflow_id) 
WHERE workflow_id IS NOT NULL;

-- ============================================
-- Circuit Breaker State (optional - can use Redis instead)
-- ============================================
CREATE TABLE IF NOT EXISTS circuit_breaker_states (
    id VARCHAR(255) PRIMARY KEY,
    circuit_id VARCHAR(255) NOT NULL,
    tenant_id INTEGER REFERENCES tenants(id),
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failures INTEGER DEFAULT 0,
    successes INTEGER DEFAULT 0,
    last_failure_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_states_circuit ON circuit_breaker_states(circuit_id);
CREATE INDEX IF NOT EXISTS idx_circuit_states_tenant ON circuit_breaker_states(tenant_id);

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE workflow_schedules IS 'Stores cron schedules for workflow automation triggers';
COMMENT ON TABLE webhooks IS 'Stores webhook registrations for external integrations';
COMMENT ON TABLE execution_checkpoints IS 'Stores workflow execution state for resume capability';
COMMENT ON TABLE circuit_breaker_states IS 'Stores circuit breaker state for fault tolerance (optional, Redis preferred)';
