/**
 * DbAdapter Interface
 *
 * Unified database abstraction for both PostgreSQL (web) and SQLite (desktop).
 * Each platform implements this interface with its own Drizzle dialect.
 */

import type {
  User,
  InsertUser,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  Skill,
  InsertSkill,
  EntityMemory,
  InsertEntityMemory,
  InsertCreditTransaction,
  GalleryItem,
  InsertGalleryItem,
} from "./schema-types";

export interface DbAdapter {
  // ---- Users ----
  getUser(openId: string): Promise<User | undefined>;
  upsertUser(user: InsertUser): Promise<User>;
  updateLastSignedIn(openId: string): Promise<void>;

  // ---- Conversations ----
  listConversations(
    userId: number,
    opts: { limit: number; offset?: number }
  ): Promise<{ conversations: Conversation[]; total: number }>;
  getConversation(id: number, userId?: number): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<number>;
  updateConversation(id: number, data: Partial<Conversation>, userId?: number): Promise<void>;
  deleteConversation(id: number, userId?: number): Promise<void>;

  // ---- Messages ----
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<number>;

  // ---- Skills ----
  listSkills(opts?: { category?: string; enabled?: boolean }): Promise<Skill[]>;
  getSkillBySlug(slug: string): Promise<Skill | undefined>;
  upsertSkill(skill: InsertSkill): Promise<void>;

  // ---- Memory ----
  getMemories(userId: number, conversationId?: number): Promise<EntityMemory[]>;
  saveMemory(memory: InsertEntityMemory): Promise<void>;

  // ---- Settings (key-value) ----
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // ---- Credits (web uses real credits; desktop can no-op or use local budget) ----
  getCreditBalance(userId: number): Promise<number>;
  addCreditTransaction(tx: InsertCreditTransaction): Promise<void>;

  // ---- Gallery / Media ----
  listGalleryItems(
    opts: { userId?: number; type?: GalleryItem["type"]; limit: number; offset?: number }
  ): Promise<{ items: GalleryItem[]; total: number }>;
  createGalleryItem(item: InsertGalleryItem): Promise<number>;
}

/**
 * A no-op adapter for features not supported on a given platform.
 * Desktop can extend this for credit-related methods, for example.
 */
export class NoOpCreditAdapter {
  async getCreditBalance(_userId: number): Promise<number> {
    return Infinity; // Desktop has no credit limits
  }
  async addCreditTransaction(_tx: InsertCreditTransaction): Promise<void> {
    // no-op on desktop
  }
}
