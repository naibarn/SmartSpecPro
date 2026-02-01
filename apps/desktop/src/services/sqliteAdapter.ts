/**
 * SQLite Adapter — implements DbAdapter for the desktop app.
 *
 * Uses Tauri's SQLite plugin or invoke commands to access a local database.
 * Desktop uses a simplified schema (no tenants, stripe, oauth, etc.)
 *
 * Database file: $APPDATA/SmartSpecPro/data.db
 *
 * TODO: Wire up actual SQLite queries via Tauri commands once
 * the Rust backend (src-tauri/src/db.rs) is implemented.
 * For now, this provides an in-memory stub that satisfies the interface.
 */

import type {
  DbAdapter,
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
} from "@smartspec/db";

let nextId = 1;
function genId(): number {
  return nextId++;
}

/**
 * In-memory SQLite adapter stub.
 * Replace with real Tauri SQLite invoke calls when backend is ready.
 */
export class SqliteAdapter implements DbAdapter {
  private users: Map<string, User> = new Map();
  private conversations: Map<number, Conversation> = new Map();
  private messages: Map<number, Message[]> = new Map();
  private skills: Map<string, Skill> = new Map();
  private memories: EntityMemory[] = [];
  private settings: Map<string, string> = new Map();
  private gallery: Map<number, GalleryItem> = new Map();

  // ---- Users ----

  async getUser(openId: string): Promise<User | undefined> {
    return this.users.get(openId);
  }

  async upsertUser(user: InsertUser): Promise<User> {
    const existing = this.users.get(user.openId);
    if (existing) {
      const updated = { ...existing, ...user, updatedAt: new Date() };
      this.users.set(user.openId, updated);
      return updated;
    }
    const newUser: User = {
      id: genId(),
      openId: user.openId,
      role: user.role ?? "user",
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      credits: user.credits ?? 0,
      lastSignedIn: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.openId, newUser);
    return newUser;
  }

  async updateLastSignedIn(openId: string): Promise<void> {
    const user = this.users.get(openId);
    if (user) user.lastSignedIn = new Date();
  }

  // ---- Conversations ----

  async listConversations(
    userId: number,
    opts: { limit: number; offset?: number }
  ): Promise<{ conversations: Conversation[]; total: number }> {
    const all = [...this.conversations.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const offset = opts.offset ?? 0;
    return {
      conversations: all.slice(offset, offset + opts.limit),
      total: all.length,
    };
  }

  async getConversation(id: number, _userId?: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(conv: InsertConversation): Promise<number> {
    const id = genId();
    const now = new Date();
    this.conversations.set(id, {
      id,
      userId: conv.userId,
      title: conv.title ?? null,
      model: conv.model ?? null,
      temperature: conv.temperature ?? null,
      messageCount: 0,
      totalCreditsUsed: null,
      isArchived: false,
      isTrashed: false,
      createdAt: now,
      updatedAt: now,
    });
    this.messages.set(id, []);
    return id;
  }

  async updateConversation(id: number, data: Partial<Conversation>, _userId?: number): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) {
      Object.assign(conv, data, { updatedAt: new Date() });
    }
  }

  async deleteConversation(id: number, _userId?: number): Promise<void> {
    this.conversations.delete(id);
    this.messages.delete(id);
  }

  // ---- Messages ----

  async getMessages(conversationId: number): Promise<Message[]> {
    return this.messages.get(conversationId) ?? [];
  }

  async createMessage(msg: InsertMessage): Promise<number> {
    const id = genId();
    const message: Message = {
      id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      inputTokens: msg.inputTokens ?? null,
      outputTokens: msg.outputTokens ?? null,
      creditsUsed: msg.creditsUsed ?? null,
      modelUsed: msg.modelUsed ?? null,
      createdAt: new Date(),
    };
    const list = this.messages.get(msg.conversationId) ?? [];
    list.push(message);
    this.messages.set(msg.conversationId, list);

    // Update conversation message count
    const conv = this.conversations.get(msg.conversationId);
    if (conv) conv.messageCount = list.length;

    return id;
  }

  // ---- Skills ----

  async listSkills(opts?: { category?: string; enabled?: boolean }): Promise<Skill[]> {
    let result = [...this.skills.values()];
    if (opts?.category) result = result.filter((s) => s.category === opts.category);
    if (opts?.enabled !== undefined) result = result.filter((s) => s.isEnabled === opts.enabled);
    return result.sort((a, b) => b.priority - a.priority);
  }

  async getSkillBySlug(slug: string): Promise<Skill | undefined> {
    return this.skills.get(slug);
  }

  async upsertSkill(skill: InsertSkill): Promise<void> {
    const existing = this.skills.get(skill.slug);
    const now = new Date();
    if (existing) {
      this.skills.set(skill.slug, { ...existing, ...skill, updatedAt: now } as Skill);
    } else {
      this.skills.set(skill.slug, {
        id: genId(),
        slug: skill.slug,
        name: skill.name,
        description: skill.description ?? null,
        category: skill.category,
        version: skill.version ?? null,
        icon: skill.icon ?? null,
        tags: skill.tags ?? [],
        isEnabled: skill.isEnabled ?? true,
        enabledByDefault: skill.enabledByDefault ?? true,
        isAutoTrigger: skill.isAutoTrigger ?? false,
        triggerPatterns: skill.triggerPatterns ?? null,
        priority: skill.priority ?? 50,
        creditMultiplier: skill.creditMultiplier ?? null,
        availableModels: null,
        defaultModel: null,
        systemPrompt: skill.systemPrompt ?? null,
        skillContent: skill.skillContent ?? null,
        folderPath: skill.folderPath ?? null,
        contentHash: skill.contentHash ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ---- Memory ----

  async getMemories(userId: number, conversationId?: number): Promise<EntityMemory[]> {
    return this.memories.filter(
      (m) => m.userId === userId && (conversationId == null || m.sourceConversationId === conversationId)
    );
  }

  async saveMemory(memory: InsertEntityMemory): Promise<void> {
    this.memories.push({
      id: genId(),
      userId: memory.userId,
      entityType: memory.entityType,
      entityName: memory.entityName,
      facts: memory.facts,
      sourceConversationId: memory.sourceConversationId ?? null,
      confidence: memory.confidence ?? null,
      importance: memory.importance ?? 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ---- Settings ----

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  // ---- Credits (desktop: unlimited) ----

  async getCreditBalance(_userId: number): Promise<number> {
    return Infinity;
  }

  async addCreditTransaction(_tx: InsertCreditTransaction): Promise<void> {
    // no-op on desktop
  }

  // ---- Gallery ----

  async listGalleryItems(
    opts: { userId?: number; type?: GalleryItem["type"]; limit: number; offset?: number }
  ): Promise<{ items: GalleryItem[]; total: number }> {
    let items = [...this.gallery.values()];
    if (opts.type) items = items.filter((i) => i.type === opts.type);
    if (opts.userId) items = items.filter((i) => i.authorId === opts.userId);
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = opts.offset ?? 0;
    return {
      items: items.slice(offset, offset + opts.limit),
      total: items.length,
    };
  }

  async createGalleryItem(item: InsertGalleryItem): Promise<number> {
    const id = genId();
    this.gallery.set(id, {
      id,
      type: item.type,
      title: item.title ?? null,
      description: item.description ?? null,
      url: item.url ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      authorId: item.authorId ?? null,
      views: 0,
      likes: 0,
      createdAt: new Date(),
    });
    return id;
  }
}
