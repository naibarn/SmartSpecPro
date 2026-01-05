-- Webhooks Migration
-- Create webhooks and webhook_deliveries tables

-- Webhook status enum
CREATE TYPE webhook_status AS ENUM ('active', 'inactive', 'failed');

-- Webhook delivery status enum
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Webhook details
    url VARCHAR(2048) NOT NULL,
    description TEXT,
    secret VARCHAR(64) NOT NULL,
    
    -- Events to subscribe to (JSON array)
    events JSONB NOT NULL,
    
    -- Status
    status webhook_status NOT NULL DEFAULT 'active',
    
    -- Retry configuration
    max_retries INTEGER NOT NULL DEFAULT 3,
    retry_delay INTEGER NOT NULL DEFAULT 60,
    
    -- Statistics
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    successful_deliveries INTEGER NOT NULL DEFAULT 0,
    failed_deliveries INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMP,
    last_success_at TIMESTAMP,
    last_failure_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    
    -- Delivery details
    event VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    
    -- Request/Response
    request_headers JSONB,
    response_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    
    -- Status
    status webhook_delivery_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    
    -- Retry tracking
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_status ON webhooks(status);
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

-- Comments
COMMENT ON TABLE webhooks IS 'Webhook configurations for event notifications';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery logs and retry tracking';
COMMENT ON COLUMN webhooks.url IS 'Webhook endpoint URL';
COMMENT ON COLUMN webhooks.secret IS 'Secret for HMAC signature verification';
COMMENT ON COLUMN webhooks.events IS 'JSON array of subscribed event types';
COMMENT ON COLUMN webhooks.max_retries IS 'Maximum number of delivery retries';
COMMENT ON COLUMN webhooks.retry_delay IS 'Delay between retries in seconds';
COMMENT ON COLUMN webhook_deliveries.payload IS 'Event payload sent to webhook';
COMMENT ON COLUMN webhook_deliveries.attempts IS 'Number of delivery attempts';
