-- ClawFeature: Add webhook_trigger to credit_source_type enum
-- Must run outside transaction (ALTER TYPE ADD VALUE restriction in PostgreSQL)
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'webhook_trigger';
