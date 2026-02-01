/**
 * Dialect-Agnostic Schema Types
 *
 * These types represent database rows and insert shapes
 * without any Drizzle dialect dependency.
 * Both PostgreSQL and SQLite adapters map to these types.
 */

// ========================================
// User
// ========================================

export interface User {
  id: number;
  openId: string;
  role: "user" | "admin" | "domain_admin";
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  credits: number;
  lastSignedIn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertUser {
  openId: string;
  role?: User["role"];
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  credits?: number;
}

// ========================================
// Conversation
// ========================================

export interface Conversation {
  id: number;
  userId: number;
  title: string | null;
  model: string | null;
  temperature: string | null;
  messageCount: number;
  totalCreditsUsed: string | null;
  isArchived: boolean;
  isTrashed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertConversation {
  userId: number;
  title?: string | null;
  model?: string | null;
  temperature?: string | null;
}

// ========================================
// Message
// ========================================

export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  creditsUsed: string | null;
  modelUsed: string | null;
  createdAt: Date;
}

export interface InsertMessage {
  conversationId: number;
  role: Message["role"];
  content: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  creditsUsed?: string | null;
  modelUsed?: string | null;
}

// ========================================
// Skill
// ========================================

export interface Skill {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  version: string | null;
  icon: string | null;
  tags: string[];
  isEnabled: boolean;
  enabledByDefault: boolean;
  isAutoTrigger: boolean;
  triggerPatterns: string[] | null;
  priority: number;
  creditMultiplier: string | null;
  availableModels: string[] | null;
  defaultModel: string | null;
  systemPrompt: string | null;
  skillContent: string | null;
  folderPath: string | null;
  contentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertSkill {
  slug: string;
  name: string;
  description?: string | null;
  category: string;
  version?: string | null;
  icon?: string | null;
  tags?: string[];
  isEnabled?: boolean;
  enabledByDefault?: boolean;
  isAutoTrigger?: boolean;
  triggerPatterns?: string[];
  priority?: number;
  creditMultiplier?: string | null;
  systemPrompt?: string | null;
  skillContent?: string | null;
  folderPath?: string | null;
  contentHash?: string | null;
}

// ========================================
// Memory (Entity Memory)
// ========================================

export interface EntityMemory {
  id: number;
  userId: number;
  entityType: string;
  entityName: string;
  facts: string[];
  sourceConversationId: number | null;
  confidence: string | null;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertEntityMemory {
  userId: number;
  entityType: string;
  entityName: string;
  facts: string[];
  sourceConversationId?: number | null;
  confidence?: string | null;
  importance?: number;
}

// ========================================
// Settings (key-value)
// ========================================

export interface Setting {
  key: string;
  value: string;
  updatedAt: Date;
}

// ========================================
// Gallery Item (media content)
// ========================================

export interface GalleryItem {
  id: number;
  type: "image" | "video" | "website";
  title: string | null;
  description: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  authorId: number | null;
  views: number;
  likes: number;
  createdAt: Date;
}

export interface InsertGalleryItem {
  type: GalleryItem["type"];
  title?: string | null;
  description?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  authorId?: number | null;
}

// ========================================
// Credit Transaction (web-specific but in interface)
// ========================================

export interface CreditTransaction {
  id: number;
  userId: number;
  amount: number;
  type: string;
  description: string | null;
  createdAt: Date;
}

export interface InsertCreditTransaction {
  userId: number;
  amount: number;
  type: string;
  description?: string | null;
}
