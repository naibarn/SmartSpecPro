-- Migration 005: Prompt Templates and Model Comparisons
-- Add tables for prompt templates and model comparison results

-- Prompt Templates Table
CREATE TABLE IF NOT EXISTS prompt_templates (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template TEXT NOT NULL,
    variables JSON,
    category VARCHAR(100),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    use_count INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    parent_id VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_category (category),
    INDEX idx_is_public (is_public),
    INDEX idx_parent_id (parent_id)
);

-- Model Comparisons Table
CREATE TABLE IF NOT EXISTS model_comparisons (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    prompt TEXT NOT NULL,
    models JSON NOT NULL,
    results JSON NOT NULL,
    total_cost_usd FLOAT NOT NULL DEFAULT 0.0,
    total_credits_used INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Add comments
ALTER TABLE prompt_templates COMMENT = 'Reusable prompt templates with variables';
ALTER TABLE model_comparisons COMMENT = 'Model comparison results';
