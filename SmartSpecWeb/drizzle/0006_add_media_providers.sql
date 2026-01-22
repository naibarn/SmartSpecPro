-- Migration: Add Media Providers table for Kie AI, fal.ai, etc.

-- Create enum for media provider types
DO $$ BEGIN
  CREATE TYPE media_provider_type AS ENUM ('image', 'video', 'audio', 'multimodal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create media_providers table
CREATE TABLE IF NOT EXISTS "media_providers" (
  "id" serial PRIMARY KEY NOT NULL,
  "providerName" varchar(64) NOT NULL UNIQUE,
  "displayName" varchar(128) NOT NULL,
  "description" text,
  "providerType" media_provider_type NOT NULL DEFAULT 'multimodal',
  "baseUrl" varchar(512),
  "apiKeyEncrypted" text,
  "hasApiKey" boolean DEFAULT false NOT NULL,
  "availableModels" json,
  "defaultModel" varchar(128),
  "configJson" json,
  "isEnabled" boolean DEFAULT false NOT NULL,
  "isPrimary" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "lastTestedAt" timestamp with time zone,
  "lastTestResult" json,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "media_providers_providerName_idx" ON "media_providers" ("providerName");
CREATE INDEX IF NOT EXISTS "media_providers_isEnabled_idx" ON "media_providers" ("isEnabled");
CREATE INDEX IF NOT EXISTS "media_providers_providerType_idx" ON "media_providers" ("providerType");
