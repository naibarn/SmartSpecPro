-- Migration: Create provider_configs table
-- Description: Store encrypted LLM provider API keys and configuration
-- Author: SmartSpec Team
-- Date: 2026-01-08

-- Create provider_configs table
CREATE TABLE IF NOT EXISTS provider_configs (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT,
    base_url VARCHAR(255),
    config_json JSON,
    is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider_name ON provider_configs(provider_name);
CREATE INDEX IF NOT EXISTS idx_provider_configs_is_enabled ON provider_configs(is_enabled);

-- Insert default providers (optional - can be added via UI)
-- Note: API keys must be added via the admin UI
INSERT INTO provider_configs (id, provider_name, display_name, base_url, is_enabled, description)
VALUES
    (
        gen_random_uuid()::text,
        'openai',
        'OpenAI',
        'https://api.openai.com/v1',
        FALSE,
        'GPT-4, GPT-3.5, and other OpenAI models'
    ),
    (
        gen_random_uuid()::text,
        'anthropic',
        'Anthropic Claude',
        'https://api.anthropic.com',
        FALSE,
        'Claude 3 Opus, Sonnet, and Haiku models'
    ),
    (
        gen_random_uuid()::text,
        'google',
        'Google AI (Gemini)',
        NULL,
        FALSE,
        'Gemini Pro and other Google AI models'
    ),
    (
        gen_random_uuid()::text,
        'groq',
        'Groq',
        'https://api.groq.com/openai/v1',
        FALSE,
        'Ultra-fast LLM inference'
    ),
    (
        gen_random_uuid()::text,
        'ollama',
        'Ollama (Local)',
        'http://localhost:11434',
        FALSE,
        'Run models locally with Ollama'
    ),
    (
        gen_random_uuid()::text,
        'openrouter',
        'OpenRouter',
        NULL,
        FALSE,
        'Access 420+ models with unified API'
    ),
    (
        gen_random_uuid()::text,
        'zai',
        'Z.AI (GLM)',
        NULL,
        FALSE,
        'GLM series models from Z.AI'
    ),
    (
        gen_random_uuid()::text,
        'kilocode',
        'Kilo Code',
        'https://api.kilo.ai/api/openrouter',
        FALSE,
        'Access multiple LLM models through Kilo Code API (OpenRouter-compatible)'
    )
ON CONFLICT (provider_name) DO NOTHING;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_provider_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_configs_updated_at
BEFORE UPDATE ON provider_configs
FOR EACH ROW
EXECUTE FUNCTION update_provider_configs_updated_at();

-- Migration complete
SELECT 'Migration: provider_configs table created successfully' AS status;
