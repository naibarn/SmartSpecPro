-- SmartSpec Pro Database Schema
-- Version: 1.0.0
-- Created: 2025-12-29

-- Workflows table
-- Stores workflow definitions and metadata
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    config TEXT,  -- JSON string
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

-- Executions table
-- Stores workflow execution history
CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'stopped')),
    output TEXT,  -- JSON string
    error TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);

-- Configs table
-- Stores workflow configuration key-value pairs
CREATE TABLE IF NOT EXISTS configs (
    id TEXT PRIMARY KEY NOT NULL,
    workflow_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    UNIQUE(workflow_id, key)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_configs_workflow_id ON configs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_configs_key ON configs(key);

-- Metadata table
-- Stores database version and other metadata
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Insert initial metadata
INSERT OR IGNORE INTO metadata (key, value, updated_at) 
VALUES ('schema_version', '1.0.0', strftime('%s', 'now'));

INSERT OR IGNORE INTO metadata (key, value, updated_at) 
VALUES ('created_at', strftime('%s', 'now'), strftime('%s', 'now'));
