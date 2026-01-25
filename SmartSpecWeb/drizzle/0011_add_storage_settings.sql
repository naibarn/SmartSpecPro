-- Add storage_settings table for S3/R2 configuration
-- This allows admins to configure object storage without modifying .env files

-- Create enum for storage provider type
DO $$ BEGIN
  CREATE TYPE storage_provider_type AS ENUM ('r2', 's3', 'local');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create storage_settings table
CREATE TABLE IF NOT EXISTS storage_settings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  "displayName" VARCHAR(128) NOT NULL,
  description TEXT,
  "providerType" storage_provider_type NOT NULL DEFAULT 'r2',
  endpoint VARCHAR(512),
  region VARCHAR(64) DEFAULT 'auto',
  bucket VARCHAR(128),
  "accessKeyIdEncrypted" TEXT,
  "secretAccessKeyEncrypted" TEXT,
  "hasCredentials" BOOLEAN NOT NULL DEFAULT false,
  "publicUrlPrefix" VARCHAR(512),
  "devTunnelUrl" VARCHAR(512),
  "pathPrefix" VARCHAR(128) DEFAULT 'uploads/',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "configJson" JSONB,
  "lastTestedAt" TIMESTAMP WITH TIME ZONE,
  "lastTestResult" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on isActive for quick lookup of active storage
CREATE INDEX IF NOT EXISTS idx_storage_settings_is_active ON storage_settings("isActive");

-- Insert default R2 configuration template (inactive by default)
INSERT INTO storage_settings (name, "displayName", description, "providerType", region, "pathPrefix", "isActive")
VALUES (
  'primary',
  'Primary Storage (R2)',
  'Cloudflare R2 storage for generated images and reference files. Configure this to allow external services like Kie.ai to access reference images.',
  'r2',
  'auto',
  'media/',
  false
) ON CONFLICT (name) DO NOTHING;
