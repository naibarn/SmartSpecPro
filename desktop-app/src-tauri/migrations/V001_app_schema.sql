-- ============================================
-- SmartSpecPro App-level Database Schema
-- Version: 1
-- Location: ~/SmartSpec/config/app.db
-- ============================================

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- Global Settings
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('app_version', '1.0.0'),
    ('theme', 'system'),
    ('language', 'en'),
    ('telemetry_enabled', 'false'),
    ('auto_update', 'true'),
    ('default_workspace_path', '~/SmartSpec/workspaces'),
    ('schema_version', '1');

-- ============================================
-- User Profile
-- ============================================

CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Single user
    name TEXT,
    email TEXT,
    avatar_path TEXT,
    github_username TEXT,
    preferences_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default profile
INSERT OR IGNORE INTO user_profile (id) VALUES (1);

-- ============================================
-- LLM Provider Configurations
-- ============================================

CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('openrouter', 'openai', 'anthropic', 'google', 'local', 'custom')),
    api_key_encrypted TEXT,
    base_url TEXT,
    is_enabled BOOLEAN DEFAULT 1,
    priority INTEGER DEFAULT 0,
    config_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default providers
INSERT OR IGNORE INTO llm_providers (id, name, type, base_url, is_enabled, priority) VALUES
    ('openrouter', 'OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1', 1, 100),
    ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 0, 90),
    ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com/v1', 0, 80),
    ('google', 'Google AI', 'google', 'https://generativelanguage.googleapis.com/v1beta', 0, 70);

-- ============================================
-- Available Models
-- ============================================

CREATE TABLE IF NOT EXISTS llm_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT,
    context_length INTEGER,
    input_price_per_1m REAL,
    output_price_per_1m REAL,
    is_enabled BOOLEAN DEFAULT 1,
    capabilities_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON llm_models(provider_id, is_enabled);

-- Default models (OpenRouter)
INSERT OR IGNORE INTO llm_models (id, provider_id, name, display_name, context_length, input_price_per_1m, output_price_per_1m, capabilities_json) VALUES
    ('anthropic/claude-3.5-sonnet', 'openrouter', 'claude-3.5-sonnet', 'Claude 3.5 Sonnet', 200000, 3.0, 15.0, '["chat", "code", "analysis"]'),
    ('anthropic/claude-3-opus', 'openrouter', 'claude-3-opus', 'Claude 3 Opus', 200000, 15.0, 75.0, '["chat", "code", "analysis", "creative"]'),
    ('openai/gpt-4o', 'openrouter', 'gpt-4o', 'GPT-4o', 128000, 5.0, 15.0, '["chat", "code", "vision"]'),
    ('openai/gpt-4o-mini', 'openrouter', 'gpt-4o-mini', 'GPT-4o Mini', 128000, 0.15, 0.6, '["chat", "code"]'),
    ('google/gemini-pro-1.5', 'openrouter', 'gemini-pro-1.5', 'Gemini Pro 1.5', 1000000, 1.25, 5.0, '["chat", "code", "vision"]'),
    ('deepseek/deepseek-coder', 'openrouter', 'deepseek-coder', 'DeepSeek Coder', 128000, 0.14, 0.28, '["code"]'),
    ('meta-llama/llama-3.1-70b-instruct', 'openrouter', 'llama-3.1-70b', 'Llama 3.1 70B', 131072, 0.52, 0.75, '["chat", "code"]');

-- ============================================
-- Model Preferences (per mode)
-- ============================================

CREATE TABLE IF NOT EXISTS model_preferences (
    mode TEXT PRIMARY KEY CHECK(mode IN ('chat', 'spec', 'plan', 'implement', 'debug', 'review', 'orchestrator')),
    model_id TEXT NOT NULL REFERENCES llm_models(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default preferences
INSERT OR IGNORE INTO model_preferences (mode, model_id) VALUES
    ('chat', 'anthropic/claude-3.5-sonnet'),
    ('spec', 'anthropic/claude-3.5-sonnet'),
    ('plan', 'anthropic/claude-3.5-sonnet'),
    ('implement', 'anthropic/claude-3.5-sonnet'),
    ('debug', 'anthropic/claude-3.5-sonnet'),
    ('review', 'anthropic/claude-3.5-sonnet'),
    ('orchestrator', 'anthropic/claude-3.5-sonnet');

-- ============================================
-- Usage Summary (aggregated across workspaces)
-- ============================================

CREATE TABLE IF NOT EXISTS usage_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    provider_id TEXT,
    model_id TEXT,
    workspace_id TEXT,
    total_requests INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    UNIQUE(date, provider_id, model_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_summary(date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_summary(workspace_id, date DESC);

-- ============================================
-- Recent Workspaces
-- ============================================

CREATE TABLE IF NOT EXISTS recent_workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recent_accessed ON recent_workspaces(last_accessed_at DESC);

-- ============================================
-- Keyboard Shortcuts
-- ============================================

CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
    action TEXT PRIMARY KEY,
    shortcut TEXT NOT NULL,
    is_custom BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default shortcuts
INSERT OR IGNORE INTO keyboard_shortcuts (action, shortcut) VALUES
    ('new_chat', 'Ctrl+N'),
    ('send_message', 'Ctrl+Enter'),
    ('toggle_sidebar', 'Ctrl+B'),
    ('command_palette', 'Ctrl+Shift+P'),
    ('search', 'Ctrl+F'),
    ('save', 'Ctrl+S'),
    ('undo', 'Ctrl+Z'),
    ('redo', 'Ctrl+Shift+Z'),
    ('switch_workspace', 'Ctrl+Shift+W'),
    ('open_terminal', 'Ctrl+`'),
    ('open_opencode', 'Ctrl+Shift+O'),
    ('open_kilo', 'Ctrl+Shift+K');
