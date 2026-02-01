/**
 * PostgreSQL Adapter — implements DbAdapter for the web app.
 *
 * Wraps existing query functions from db.ts and chatService.ts
 * so that any code written against DbAdapter works on the web platform.
 */

import type {
  DbAdapter,
  User as DbUser,
  InsertUser as DbInsertUser,
  Conversation as DbConversation,
  InsertConversation as DbInsertConversation,
  Message as DbMessage,
  InsertMessage as DbInsertMessage,
  Skill as DbSkill,
  InsertSkill as DbInsertSkill,
  EntityMemory as DbEntityMemory,
  InsertEntityMemory as DbInsertEntityMemory,
  InsertCreditTransaction as DbInsertCreditTransaction,
  GalleryItem as DbGalleryItem,
  InsertGalleryItem as DbInsertGalleryItem,
} from "@smartspec/db";

import {
  getDb,
  getUserByOpenId,
  upsertUser,
  updateLastSignedIn,
  getGalleryItems,
  createGalleryItem,
  getGalleryItemsCount,
} from "../db";

import {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  createMessage,
  getMessages,
  upsertEntityMemory,
  getEntityMemories,
} from "./chatService";

import {
  getSkillRegistryAsync,
  getSkillByIdAsync,
} from "./skillRegistry";

import { eq, desc, sql } from "drizzle-orm";
import { skills as skillsTable, systemSettings, creditTransactions } from "../../drizzle/schema";

export class PostgresAdapter implements DbAdapter {
  // ---- Users ----

  async getUser(openId: string): Promise<DbUser | undefined> {
    const row = await getUserByOpenId(openId);
    if (!row) return undefined;
    return row as unknown as DbUser;
  }

  async upsertUser(user: DbInsertUser): Promise<DbUser> {
    await upsertUser(user as any);
    const result = await getUserByOpenId(user.openId);
    return result as unknown as DbUser;
  }

  async updateLastSignedIn(openId: string): Promise<void> {
    await updateLastSignedIn(openId);
  }

  // ---- Conversations ----

  async listConversations(
    userId: number,
    opts: { limit: number; offset?: number }
  ): Promise<{ conversations: DbConversation[]; total: number }> {
    const conversations = await getConversations({
      userId,
      limit: opts.limit,
      offset: opts.offset,
    });
    // getConversations doesn't return total — approximate from result length
    return {
      conversations: conversations as unknown as DbConversation[],
      total: conversations.length,
    };
  }

  async getConversation(id: number, userId?: number): Promise<DbConversation | undefined> {
    if (!userId) throw new Error("userId is required for getConversation");
    const conv = await getConversationById(id, userId);
    return conv as unknown as DbConversation | undefined;
  }

  async createConversation(conv: DbInsertConversation): Promise<number> {
    const result = await createConversation(conv as any);
    return result.id;
  }

  async updateConversation(id: number, data: Partial<DbConversation>, userId?: number): Promise<void> {
    if (!userId) throw new Error("userId is required for updateConversation");
    await updateConversation(id, userId, data as any);
  }

  async deleteConversation(id: number, userId?: number): Promise<void> {
    if (!userId) throw new Error("userId is required for deleteConversation");
    await deleteConversation(id, userId);
  }

  // ---- Messages ----

  async getMessages(conversationId: number): Promise<DbMessage[]> {
    const messages = await getMessages({ conversationId });
    return messages as unknown as DbMessage[];
  }

  async createMessage(msg: DbInsertMessage): Promise<number> {
    const result = await createMessage(msg as any);
    return result.id;
  }

  // ---- Skills ----

  async listSkills(opts?: { category?: string; enabled?: boolean }): Promise<DbSkill[]> {
    const db = await getDb();
    if (!db) return [];

    let query = db.select().from(skillsTable);
    const conditions: any[] = [];

    if (opts?.enabled !== undefined) {
      conditions.push(eq(skillsTable.isEnabled, opts.enabled));
    }
    if (opts?.category) {
      conditions.push(eq(skillsTable.category, opts.category as any));
    }

    if (conditions.length > 0) {
      const { and } = await import("drizzle-orm");
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.orderBy(desc(skillsTable.priority));
    return rows as unknown as DbSkill[];
  }

  async getSkillBySlug(slug: string): Promise<DbSkill | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const rows = await db
      .select()
      .from(skillsTable)
      .where(eq(skillsTable.slug, slug))
      .limit(1);

    return rows.length > 0 ? (rows[0] as unknown as DbSkill) : undefined;
  }

  async upsertSkill(skill: DbInsertSkill): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(skillsTable)
      .values(skill as any)
      .onConflictDoUpdate({
        target: skillsTable.slug,
        set: skill as any,
      });
  }

  // ---- Memory ----

  async getMemories(userId: number, conversationId?: number): Promise<DbEntityMemory[]> {
    const memories = await getEntityMemories({ userId, conversationId });
    return memories as unknown as DbEntityMemory[];
  }

  async saveMemory(memory: DbInsertEntityMemory): Promise<void> {
    await upsertEntityMemory(memory as any);
  }

  // ---- Settings ----

  async getSetting(key: string): Promise<string | null> {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    return rows.length > 0 ? rows[0].value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(systemSettings)
      .values({ key, value } as any)
      .onConflictDoUpdate({
        target: (systemSettings as any).key,
        set: { value },
      });
  }

  // ---- Credits ----

  async getCreditBalance(userId: number): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    const { users } = await import("../../drizzle/schema");
    const rows = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows.length > 0 ? (rows[0].credits ?? 0) : 0;
  }

  async addCreditTransaction(tx: DbInsertCreditTransaction): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.insert(creditTransactions).values(tx as any);
  }

  // ---- Gallery ----

  async listGalleryItems(
    opts: { userId?: number; type?: DbGalleryItem["type"]; limit: number; offset?: number }
  ): Promise<{ items: DbGalleryItem[]; total: number }> {
    const items = await getGalleryItems({
      type: opts.type,
      limit: opts.limit,
      offset: opts.offset,
    });
    const total = await getGalleryItemsCount({ type: opts.type });
    return {
      items: items as unknown as DbGalleryItem[],
      total,
    };
  }

  async createGalleryItem(item: DbInsertGalleryItem): Promise<number> {
    return await createGalleryItem(item as any);
  }
}
