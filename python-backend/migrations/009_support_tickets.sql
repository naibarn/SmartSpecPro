-- Migration: Support Ticket System
-- Description: Create tables for user support tickets
-- Date: 2024-01-15

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ticket number (human-readable)
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    
    -- User information
    user_id UUID NOT NULL,
    
    -- Ticket details
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' NOT NULL,
    status VARCHAR(20) DEFAULT 'open' NOT NULL,
    
    -- Assignment
    assigned_to UUID,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    
    -- Foreign keys
    CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_ticket_number ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_ticket_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ticket_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_ticket_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_created_at ON support_tickets(created_at);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ticket_user_status ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned_status ON support_tickets(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_ticket_status_priority ON support_tickets(status, priority);

-- Create ticket_messages table
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ticket reference
    ticket_id UUID NOT NULL,
    
    -- Message details
    user_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_staff_response VARCHAR(10) DEFAULT 'false',
    
    -- Attachments (JSON array of file URLs)
    attachments TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Foreign keys
    CONSTRAINT fk_message_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for ticket_messages
CREATE INDEX IF NOT EXISTS idx_message_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_message_created_at ON ticket_messages(created_at);

-- Create function to auto-generate ticket numbers
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate ticket number in format: TICK-YYYYMMDD-XXXX
    NEW.ticket_number := 'TICK-' || 
                        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                        LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM support_tickets WHERE ticket_number = NEW.ticket_number) LOOP
        NEW.ticket_number := 'TICK-' || 
                            TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                            LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating ticket numbers
DROP TRIGGER IF EXISTS trigger_generate_ticket_number ON support_tickets;
CREATE TRIGGER trigger_generate_ticket_number
    BEFORE INSERT ON support_tickets
    FOR EACH ROW
    WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
    EXECUTE FUNCTION generate_ticket_number();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating timestamp
DROP TRIGGER IF EXISTS trigger_update_ticket_timestamp ON support_tickets;
CREATE TRIGGER trigger_update_ticket_timestamp
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_timestamp();

-- Comments
COMMENT ON TABLE support_tickets IS 'User support tickets';
COMMENT ON TABLE ticket_messages IS 'Messages/responses for support tickets';
COMMENT ON COLUMN support_tickets.ticket_number IS 'Human-readable ticket number (e.g., TICK-20240115-1234)';
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, billing, feature_request, bug_report, account, other';
COMMENT ON COLUMN support_tickets.priority IS 'Ticket priority: low, medium, high, urgent';
COMMENT ON COLUMN support_tickets.status IS 'Ticket status: open, in_progress, waiting_user, resolved, closed';
COMMENT ON COLUMN ticket_messages.is_staff_response IS 'Whether this message is from staff (true) or user (false)';
COMMENT ON COLUMN ticket_messages.attachments IS 'JSON array of attachment file URLs';
