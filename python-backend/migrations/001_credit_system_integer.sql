-- Migration: Change credit system from DECIMAL to INTEGER
-- Date: 2025-12-30
-- Description: Change credits_balance and transaction amounts from DECIMAL(10,4) to INTEGER
--              New system: 1 USD = 1,000 credits

-- For SQLite (Development)
-- SQLite doesn't support ALTER COLUMN directly, so we need to:
-- 1. Create new tables with INTEGER columns
-- 2. Migrate data (convert DECIMAL to INTEGER by multiplying by 1000)
-- 3. Drop old tables
-- 4. Rename new tables

-- Note: This migration assumes existing balances are in USD
-- They will be converted to credits (multiplied by 1000)

BEGIN TRANSACTION;

-- Step 1: Create new users table with INTEGER credits_balance
CREATE TABLE users_new (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    credits_balance INTEGER NOT NULL DEFAULT 0,  -- Changed from DECIMAL to INTEGER
    is_active BOOLEAN NOT NULL DEFAULT 1,
    is_admin BOOLEAN NOT NULL DEFAULT 0,
    email_verified BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Migrate user data (convert USD to credits)
INSERT INTO users_new (
    id, email, password_hash, full_name, 
    credits_balance, is_active, is_admin, email_verified, 
    created_at, updated_at
)
SELECT 
    id, email, password_hash, full_name,
    CAST(credits_balance * 1000 AS INTEGER) as credits_balance,  -- Convert USD to credits
    is_active, is_admin, email_verified,
    created_at, updated_at
FROM users;

-- Step 3: Create new credit_transactions table with INTEGER amounts
CREATE TABLE credit_transactions_new (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL,  -- Changed from DECIMAL to INTEGER
    description TEXT,
    balance_before INTEGER NOT NULL,  -- Changed from DECIMAL to INTEGER
    balance_after INTEGER NOT NULL,  -- Changed from DECIMAL to INTEGER
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users_new(id)
);

-- Step 4: Migrate transaction data (convert USD to credits)
INSERT INTO credit_transactions_new (
    id, user_id, type, amount, description,
    balance_before, balance_after, metadata, created_at
)
SELECT 
    id, user_id, type,
    CAST(amount * 1000 AS INTEGER) as amount,  -- Convert USD to credits
    description,
    CAST(balance_before * 1000 AS INTEGER) as balance_before,  -- Convert USD to credits
    CAST(balance_after * 1000 AS INTEGER) as balance_after,  -- Convert USD to credits
    metadata, created_at
FROM credit_transactions;

-- Step 5: Drop old tables
DROP TABLE IF EXISTS credit_transactions;
DROP TABLE IF EXISTS users;

-- Step 6: Rename new tables
ALTER TABLE users_new RENAME TO users;
ALTER TABLE credit_transactions_new RENAME TO credit_transactions;

-- Step 7: Recreate indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);

COMMIT;

-- For PostgreSQL (Production)
-- PostgreSQL supports ALTER COLUMN, so it's simpler:
/*
BEGIN;

-- Convert existing balances from USD to credits
UPDATE users SET credits_balance = credits_balance * 1000;
UPDATE credit_transactions SET 
    amount = amount * 1000,
    balance_before = balance_before * 1000,
    balance_after = balance_after * 1000;

-- Change column types
ALTER TABLE users ALTER COLUMN credits_balance TYPE INTEGER USING credits_balance::INTEGER;
ALTER TABLE credit_transactions ALTER COLUMN amount TYPE INTEGER USING amount::INTEGER;
ALTER TABLE credit_transactions ALTER COLUMN balance_before TYPE INTEGER USING balance_before::INTEGER;
ALTER TABLE credit_transactions ALTER COLUMN balance_after TYPE INTEGER USING balance_after::INTEGER;

COMMIT;
*/
