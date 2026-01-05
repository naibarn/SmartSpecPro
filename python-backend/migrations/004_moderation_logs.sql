-- Migration 004: Moderation Logs
-- Add moderation_logs table for content moderation tracking

CREATE TABLE IF NOT EXISTS moderation_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    content_type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    categories TEXT,
    action_taken VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_flagged (flagged),
    INDEX idx_created_at (created_at)
);

-- Add comments
ALTER TABLE moderation_logs COMMENT = 'Logs of content moderation checks';
