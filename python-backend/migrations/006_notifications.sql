-- Migration: Notifications System
-- Description: Create notifications table for in-app notification system
-- Date: 2024-01-15

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSON,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created_at (created_at),
    
    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create composite index for common queries
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at);

-- Comments
COMMENT ON TABLE notifications IS 'In-app notification system';
COMMENT ON COLUMN notifications.type IS 'Notification type: info, warning, error, success';
COMMENT ON COLUMN notifications.data IS 'Additional JSON data for the notification';
