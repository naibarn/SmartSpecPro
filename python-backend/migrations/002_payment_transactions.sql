-- Migration: Add payment_transactions table
-- Version: 0.3.0
-- Date: 2025-12-30

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(36) NOT NULL,
    
    -- Stripe info
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    
    -- Payment info
    amount_usd DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    
    -- Credits info
    credits_amount INTEGER,
    credits_added_at TIMESTAMP,
    
    -- Metadata
    payment_method VARCHAR(50),
    metadata JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id 
    ON payment_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_session_id 
    ON payment_transactions(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status 
    ON payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_status 
    ON payment_transactions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created 
    ON payment_transactions(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_payment_transactions_updated_at
    AFTER UPDATE ON payment_transactions
    FOR EACH ROW
BEGIN
    UPDATE payment_transactions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;
