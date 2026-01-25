-- Migration: Add skills table for centralized skill management
-- This table stores all skills that can be used in chat, media studio, etc.

-- Create skill category enum
DO $$ BEGIN
  CREATE TYPE skill_category AS ENUM (
    'image_generation',
    'video_generation',
    'audio_generation',
    'sound_effects',
    'prompt_enhancement',
    'code_assistant',
    'document_analysis',
    'web_search',
    'data_analysis',
    'translation',
    'summarization',
    'chat_assistant',
    'automation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create skills table
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,

  -- Identity
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Categorization
  category skill_category NOT NULL DEFAULT 'other',
  version VARCHAR(20) DEFAULT '1.0.0',
  author VARCHAR(255),
  icon VARCHAR(50) DEFAULT 'sparkles',
  tags JSONB DEFAULT '[]',

  -- File location
  "folderPath" VARCHAR(512),

  -- Auto-trigger settings
  "isAutoTrigger" BOOLEAN NOT NULL DEFAULT FALSE,
  "triggerPatterns" JSONB DEFAULT '[]',

  -- Enable/disable
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "enabledByDefault" BOOLEAN NOT NULL DEFAULT TRUE,

  -- Execution settings
  "creditMultiplier" NUMERIC(5, 2) DEFAULT 1.0,
  priority INTEGER NOT NULL DEFAULT 50,

  -- Model configuration
  "availableModels" JSONB,
  "defaultModel" VARCHAR(128),

  -- Content
  "systemPrompt" TEXT,
  "skillContent" TEXT,
  knowledgebase TEXT,

  -- Additional config
  "configJson" JSONB,

  -- Import tracking
  "importSource" VARCHAR(50) DEFAULT 'manual',
  "importedFromZip" VARCHAR(512),
  "createdBy" INTEGER REFERENCES users(id),

  -- Timestamps
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_is_enabled ON skills("isEnabled");
CREATE INDEX IF NOT EXISTS idx_skills_is_auto_trigger ON skills("isAutoTrigger");
CREATE INDEX IF NOT EXISTS idx_skills_priority ON skills(priority DESC);

-- Seed default skills (from existing hardcoded skillRegistry)
INSERT INTO skills (slug, name, description, category, version, icon, "isAutoTrigger", "triggerPatterns", "isEnabled", "enabledByDefault", "creditMultiplier", priority)
VALUES
  ('image-generation', 'Image Generation', 'Generate images using AI models', 'image_generation', '1.0.0', 'image', true,
   '["สร้าง(รูป|ภาพ|image)", "generate\\s+(an?\\s+)?image", "create\\s+(an?\\s+)?(picture|image|photo)", "draw\\s+(me\\s+)?", "paint\\s+(me\\s+)?", "ขอรูป", "วาด(รูป|ภาพ)?"]',
   true, true, 2.0, 90),

  ('video-generation', 'Video Generation', 'Generate videos using AI models', 'video_generation', '1.0.0', 'video', true,
   '["สร้าง(วีดีโอ|วิดีโอ|คลิป|video)", "generate\\s+(a\\s+)?video", "create\\s+(a\\s+)?(video|clip|animation)", "ทำวีดีโอ", "make\\s+(a\\s+)?video"]',
   true, true, 10.0, 85),

  ('audio-generation', 'Audio Generation', 'Generate speech and sound effects', 'audio_generation', '1.0.0', 'music', true,
   '["สร้าง(เสียง|audio|sound)", "generate\\s+(a\\s+)?(audio|sound|speech)", "text\\s+to\\s+speech", "tts", "อ่านออกเสียง", "พูดให้ฟัง"]',
   true, true, 1.0, 80),

  ('create-image-prompt', 'Create Image Prompt', 'Generate professional AI image prompts using PromptDepth Pro v8.9', 'prompt_enhancement', '8.9.0', 'sparkles', true,
   '["create\\s+prompt", "generate\\s+(image\\s+)?prompt", "write\\s+(a\\s+)?prompt", "สร้าง\\s*prompt", "เขียน\\s*prompt", "auto\\s*prompt"]',
   true, true, 0.5, 75),

  ('code-assistant', 'Code Assistant', 'Help with code review, refactoring, and generation', 'code_assistant', '1.0.0', 'code', true,
   '["review\\s+(this\\s+)?code", "refactor\\s+(this\\s+)?", "write\\s+(me\\s+)?(a\\s+)?code", "debug", "fix\\s+(this\\s+)?(bug|error)", "เขียนโค้ด", "แก้โค้ด"]',
   true, true, 1.0, 70),

  ('document-analysis', 'Document Analysis', 'Analyze PDFs, documents, and extract information', 'document_analysis', '1.0.0', 'file-text', true,
   '["analyze\\s+(this\\s+)?(document|file|pdf)", "summarize\\s+(this\\s+)?(document|file|pdf|text)", "extract\\s+(from|info|data)", "วิเคราะห์(เอกสาร|ไฟล์)", "สรุป(เอกสาร|ไฟล์)"]',
   true, true, 1.5, 60),

  ('web-search', 'Web Search', 'Search the web for information', 'web_search', '1.0.0', 'search', false,
   '["search\\s+(the\\s+)?(web|internet|online)", "find\\s+(info|information)\\s+(about|on)", "look\\s+up", "ค้นหา(ข้อมูล)?", "หาข้อมูล"]',
   true, false, 0.5, 50)
ON CONFLICT (slug) DO NOTHING;

-- Add comment to table
COMMENT ON TABLE skills IS 'Centralized skill registry for Claude/OpenCode compatibility';
