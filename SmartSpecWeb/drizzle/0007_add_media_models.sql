-- Migration: Add Media Models table for AI generation models

-- Create enum for media model types
DO $$ BEGIN
  CREATE TYPE media_model_type AS ENUM ('image', 'video', 'audio');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create media_models table
CREATE TABLE IF NOT EXISTS "media_models" (
  "id" serial PRIMARY KEY NOT NULL,
  "modelId" varchar(128) NOT NULL UNIQUE,
  "name" varchar(128) NOT NULL,
  "description" text,
  "modelType" media_model_type NOT NULL,
  "provider" varchar(64) NOT NULL,
  "aliases" json DEFAULT '[]',
  "creditCost" integer DEFAULT 10 NOT NULL,
  "aspectRatios" json,
  "sizes" json,
  "durations" json,
  "voices" json,
  "configJson" json,
  "isEnabled" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 99 NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS "media_models_modelId_idx" ON "media_models" ("modelId");
CREATE INDEX IF NOT EXISTS "media_models_modelType_idx" ON "media_models" ("modelType");
CREATE INDEX IF NOT EXISTS "media_models_isEnabled_idx" ON "media_models" ("isEnabled");
CREATE INDEX IF NOT EXISTS "media_models_provider_idx" ON "media_models" ("provider");

-- Insert default models (same as modelRegistry.ts)
INSERT INTO "media_models" ("modelId", "name", "description", "modelType", "provider", "aliases", "creditCost", "aspectRatios", "sizes", "priority", "sortOrder") VALUES
-- Image models
('google-nano-banana-pro', 'Google Nano Banana Pro', 'High-quality image generation with Google''s latest model', 'image', 'kie.ai',
 '["nano banana pro", "nano_banana_pro", "nanobananapro", "google nano banana", "gemini 3", "banana pro", "nano-banana-pro"]',
 10, '["1:1", "16:9", "9:16", "4:3", "3:4"]', '["1024x1024", "1024x1792", "1792x1024"]', 1, 1),

('flux-2.0', 'Flux 2.0', 'Fast and creative image generation', 'image', 'kie.ai',
 '["flux 2.0", "flux 2", "flux2", "flux_2_0", "flux-2.0", "flux"]',
 8, '["1:1", "16:9", "9:16"]', '["1024x1024", "1024x1792", "1792x1024"]', 2, 2),

('z-image', 'Z-Image', 'Artistic style image generation', 'image', 'kie.ai',
 '["z-image", "z image", "z_image", "zimage"]',
 5, '["1:1"]', '["1024x1024"]', 3, 3),

('grok-imagine', 'Grok Imagine', 'xAI''s image generation model', 'image', 'kie.ai',
 '["grok imagine", "grok-imagine", "grok_imagine", "grokimagine", "grok"]',
 12, '["1:1", "16:9", "9:16"]', '["1024x1024", "1024x1792", "1792x1024"]', 4, 4),

-- Video models
('veo-3-1', 'Veo 3.1', 'Google''s video generation model', 'video', 'kie.ai',
 '["veo 3.1", "veo 3", "veo3", "veo_3_1", "veo-3.1", "google veo", "veo"]',
 50, '["16:9", "9:16", "1:1"]', NULL, 1, 5),

('sora-2', 'Sora 2', 'OpenAI''s video generation model', 'video', 'kie.ai',
 '["sora 2", "sora2", "sora_2", "sora-2", "openai sora", "sora"]',
 80, '["16:9", "9:16", "1:1"]', NULL, 2, 6),

('kling-2.6', 'Kling 2.6', 'Kling video generation model', 'video', 'kie.ai',
 '["kling 2.6", "kling 2", "kling2", "kling_2_6", "kling-2.6", "kling"]',
 40, '["16:9", "9:16"]', NULL, 3, 7),

-- Audio models
('elevenlabs-tts', 'ElevenLabs Text-to-Speech', 'High-quality text-to-speech', 'audio', 'kie.ai',
 '["elevenlabs tts", "elevenlabs", "eleven labs", "11labs", "text to speech", "tts"]',
 5, NULL, NULL, 1, 8),

('elevenlabs-sfx', 'ElevenLabs Sound Effects', 'Sound effects generation', 'audio', 'kie.ai',
 '["elevenlabs sfx", "elevenlabs sound", "sound effects", "sfx"]',
 3, NULL, NULL, 2, 9)

ON CONFLICT ("modelId") DO NOTHING;

-- Update video models with durations
UPDATE "media_models" SET "durations" = '[5, 10, 15]' WHERE "modelId" = 'veo-3-1';
UPDATE "media_models" SET "durations" = '[5, 10, 15, 20]' WHERE "modelId" = 'sora-2';
UPDATE "media_models" SET "durations" = '[5, 10]' WHERE "modelId" = 'kling-2.6';

-- Update audio models with voices
UPDATE "media_models" SET "voices" = '["alloy", "echo", "fable", "onyx", "nova", "shimmer"]' WHERE "modelId" = 'elevenlabs-tts';
