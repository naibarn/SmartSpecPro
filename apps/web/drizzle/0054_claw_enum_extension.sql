-- ClawFeature: Enum extension (must run outside transaction)
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'tts';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'browser_automation';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'widget_chat';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'webhook_chat';
