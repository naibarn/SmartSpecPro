-- Add domain_admin role to enum
ALTER TYPE role ADD VALUE IF NOT EXISTS 'domain_admin';

-- Add isDisabled column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isDisabled" boolean DEFAULT false NOT NULL;
