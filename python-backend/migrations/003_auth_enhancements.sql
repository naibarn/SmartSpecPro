-- Migration 003: Authentication Enhancements
-- Adds token blacklist and password reset tables

-- Token Blacklist Table
CREATE TABLE IF NOT EXISTS token_blacklist (
    jti VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_type VARCHAR(20) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100),
    INDEX idx_expires_at (expires_at),
    INDEX idx_user_id_token_type (user_id, token_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add last_login field to users table if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login DATETIME;

-- Cleanup old tokens (run periodically)
-- DELETE FROM token_blacklist WHERE expires_at < NOW();
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR (used = TRUE AND used_at < DATE_SUB(NOW(), INTERVAL 24 HOUR));
