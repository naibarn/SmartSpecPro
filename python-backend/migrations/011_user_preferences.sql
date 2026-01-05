-- User Preferences Migration
-- Create user_preferences table

CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification preferences
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    low_credits_alert BOOLEAN NOT NULL DEFAULT TRUE,
    payment_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    support_ticket_updates BOOLEAN NOT NULL DEFAULT TRUE,
    marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Alert thresholds
    low_credits_threshold INTEGER NOT NULL DEFAULT 1000,
    
    -- LLM preferences
    default_llm_model VARCHAR(100),
    default_llm_provider VARCHAR(50),
    default_budget_priority VARCHAR(20) NOT NULL DEFAULT 'balanced',
    
    -- UI preferences
    theme VARCHAR(20) NOT NULL DEFAULT 'light',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    
    -- Dashboard preferences (JSON)
    dashboard_layout JSONB,
    favorite_features JSONB,
    
    -- API preferences
    default_api_key_rate_limit INTEGER NOT NULL DEFAULT 60,
    
    -- Advanced preferences (JSON)
    custom_settings JSONB,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create default preferences for existing users
INSERT INTO user_preferences (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_preferences);

-- Comments
COMMENT ON TABLE user_preferences IS 'User-specific preferences and settings';
COMMENT ON COLUMN user_preferences.email_notifications IS 'Enable/disable email notifications';
COMMENT ON COLUMN user_preferences.low_credits_alert IS 'Alert when credits are low';
COMMENT ON COLUMN user_preferences.low_credits_threshold IS 'Credit threshold for alerts';
COMMENT ON COLUMN user_preferences.default_llm_model IS 'Default LLM model to use';
COMMENT ON COLUMN user_preferences.default_budget_priority IS 'Default budget priority: cost, balanced, or performance';
COMMENT ON COLUMN user_preferences.theme IS 'UI theme: light, dark, or auto';
COMMENT ON COLUMN user_preferences.language IS 'Preferred language code';
COMMENT ON COLUMN user_preferences.timezone IS 'User timezone';
COMMENT ON COLUMN user_preferences.dashboard_layout IS 'Custom dashboard layout configuration';
COMMENT ON COLUMN user_preferences.favorite_features IS 'List of favorite features';
COMMENT ON COLUMN user_preferences.custom_settings IS 'Additional custom settings';
