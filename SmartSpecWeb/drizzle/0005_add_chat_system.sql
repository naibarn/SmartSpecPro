-- Migration: Add Chat System Tables
-- Date: 2026-01-22
-- Description: Creates tables for conversations, messages, summaries, entity memories, and skill preferences

-- Create enums for chat system
DO $$ BEGIN
  CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE entity_type AS ENUM ('user', 'project', 'preference', 'technical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
  model VARCHAR(100) DEFAULT 'gpt-4o-mini',
  temperature NUMERIC(3, 2) DEFAULT 0.7,
  "systemPrompt" TEXT,
  "skillSettings" JSONB DEFAULT '{"autoDetect": true, "enabledSkills": [], "detectionMode": "auto"}',
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "totalCreditsUsed" NUMERIC(12, 4) DEFAULT 0,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  "inputTokens" INTEGER DEFAULT 0,
  "outputTokens" INTEGER DEFAULT 0,
  "creditsUsed" NUMERIC(10, 4) DEFAULT 0,
  "modelUsed" VARCHAR(100),
  attachments JSONB DEFAULT '[]',
  artifacts JSONB DEFAULT '[]',
  "skillUsed" VARCHAR(100),
  "skillArgs" JSONB,
  error TEXT,
  "isRegenerated" BOOLEAN DEFAULT false,
  "parentMessageId" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Conversation summaries table
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  "messageRangeStart" INTEGER NOT NULL,
  "messageRangeEnd" INTEGER NOT NULL,
  "messageCount" INTEGER NOT NULL,
  "tokensUsed" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Entity memories table
CREATE TABLE IF NOT EXISTS entity_memories (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "entityType" entity_type NOT NULL,
  "entityName" VARCHAR(255) NOT NULL,
  facts JSONB NOT NULL DEFAULT '[]',
  "sourceConversationId" INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  confidence NUMERIC(3, 2) DEFAULT 0.8,
  "lastAccessedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "reinforcementCount" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Skill preferences table
CREATE TABLE IF NOT EXISTS skill_preferences (
  id SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "skillId" VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  "customSettings" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE("conversationId", "skillId")
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations("userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_active ON conversations("userId", "isArchived") WHERE "isArchived" = false;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages("conversationId", role);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation ON conversation_summaries("conversationId");
CREATE INDEX IF NOT EXISTS idx_entity_memories_user ON entity_memories("userId", "entityType");
CREATE INDEX IF NOT EXISTS idx_entity_memories_user_name ON entity_memories("userId", "entityType", "entityName");
CREATE INDEX IF NOT EXISTS idx_skill_preferences_conversation ON skill_preferences("conversationId");

-- Add unique constraint for entity memories
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_memories_unique ON entity_memories("userId", "entityType", "entityName");

-- Create function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updatedAt
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_entity_memories_updated_at ON entity_memories;
CREATE TRIGGER update_entity_memories_updated_at
  BEFORE UPDATE ON entity_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
