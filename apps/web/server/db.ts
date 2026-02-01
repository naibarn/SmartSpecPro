import { eq, desc, asc, and, sql, like, or, inArray, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, galleryItems, InsertGalleryItem, GalleryItem, creditTransactions, creditPackages } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL);
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Synchronous db getter for services that need direct access
// Note: This will throw if called before getDb() has been called at least once
export const db = {
  get instance() {
    if (!_db) {
      throw new Error("Database not initialized. Call getDb() first.");
    }
    return _db;
  },
  select: (...args: Parameters<NonNullable<typeof _db>['select']>) => {
    if (!_db) throw new Error("Database not initialized");
    return _db.select(...args);
  },
  insert: (...args: Parameters<NonNullable<typeof _db>['insert']>) => {
    if (!_db) throw new Error("Database not initialized");
    return _db.insert(...args);
  },
  update: (...args: Parameters<NonNullable<typeof _db>['update']>) => {
    if (!_db) throw new Error("Database not initialized");
    return _db.update(...args);
  },
  delete: (...args: Parameters<NonNullable<typeof _db>['delete']>) => {
    if (!_db) throw new Error("Database not initialized");
    return _db.delete(...args);
  },
  transaction: async <T>(fn: (tx: NonNullable<typeof _db>) => Promise<T>): Promise<T> => {
    if (!_db) throw new Error("Database not initialized");
    return _db.transaction(fn);
  },
};

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "normalizedEmail", "registrationIp"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else {
      // Always include default role for INSERT to avoid NOT NULL constraint violation
      values.role = 'user';
      // Don't update role if not specified - keep existing role on conflict
    }

    // Set registeredDomain only on first insert (new user)
    if (user.registeredDomain !== undefined) {
      values.registeredDomain = user.registeredDomain;
      // Do NOT include in updateSet - registeredDomain should only be set once
    }

    // Set trustScore only on first insert (new user)
    if (user.trustScore !== undefined) {
      values.trustScore = user.trustScore;
      // Do NOT include in updateSet - trustScore set at registration
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert syntax
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/**
 * Update only the lastSignedIn timestamp for an existing user
 * This avoids the INSERT...ON CONFLICT issues with NOT NULL constraints
 */
export async function updateLastSignedIn(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lastSignedIn: database not available");
    return;
  }

  try {
    await db.update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.openId, openId));
  } catch (error) {
    console.warn("[Database] Failed to update lastSignedIn:", error);
    // Don't throw - this is a non-critical operation
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get total user count
 * Used for determining if this is the first user (auto-admin)
 */
export async function getUserCount(): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user count: database not available");
    return 0;
  }

  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  return Number(result[0]?.count) || 0;
}

/**
 * Update a user's role by their ID
 * Used for promoting users to admin in local development
 */
export async function updateUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user role: database not available");
    return;
  }

  try {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update user role:", error);
    throw error;
  }
}

// ==================== Gallery Queries ====================

export type GalleryType = 'image' | 'video' | 'website';
export type AspectRatio = '1:1' | '9:16' | '16:9';

export interface GalleryFilters {
  tenantId?: number;
  type?: GalleryType;
  isPublished?: boolean;
  isFeatured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get all gallery items with optional filters
 */
export async function getGalleryItems(filters: GalleryFilters = {}): Promise<GalleryItem[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get gallery items: database not available");
    return [];
  }

  const conditions = [];

  if (filters.tenantId !== undefined) {
    conditions.push(eq(galleryItems.tenantId, filters.tenantId));
  }

  if (filters.type) {
    conditions.push(eq(galleryItems.type, filters.type));
  }

  if (filters.isPublished !== undefined) {
    conditions.push(eq(galleryItems.isPublished, filters.isPublished));
  }

  if (filters.isFeatured !== undefined) {
    conditions.push(eq(galleryItems.isFeatured, filters.isFeatured));
  }

  if (filters.search) {
    conditions.push(
      or(
        like(galleryItems.title, `%${filters.search}%`),
        like(galleryItems.description, `%${filters.search}%`)
      )
    );
  }

  let query = db.select().from(galleryItems);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  query = query.orderBy(asc(galleryItems.sortOrder), desc(galleryItems.createdAt)) as typeof query;
  
  if (filters.limit) {
    query = query.limit(filters.limit) as typeof query;
  }
  
  if (filters.offset) {
    query = query.offset(filters.offset) as typeof query;
  }

  return await query;
}

/**
 * Get a single gallery item by ID
 */
export async function getGalleryItemById(id: number): Promise<GalleryItem | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get gallery item: database not available");
    return undefined;
  }

  const result = await db.select().from(galleryItems).where(eq(galleryItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create a new gallery item
 */
export async function createGalleryItem(item: InsertGalleryItem): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(galleryItems).values(item).returning({ id: galleryItems.id });
  return result[0].id;
}

/**
 * Update a gallery item
 */
export async function updateGalleryItem(id: number, item: Partial<InsertGalleryItem>): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(galleryItems).set(item).where(eq(galleryItems.id, id));
}

/**
 * Delete a gallery item
 */
export async function deleteGalleryItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(galleryItems).where(eq(galleryItems.id, id));
}

/**
 * Increment view count
 */
export async function incrementGalleryViews(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(galleryItems)
    .set({ views: sql`${galleryItems.views} + 1` })
    .where(eq(galleryItems.id, id));
}

/**
 * Increment like count
 */
export async function incrementGalleryLikes(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(galleryItems)
    .set({ likes: sql`${galleryItems.likes} + 1` })
    .where(eq(galleryItems.id, id));
}

/**
 * Increment download count
 */
export async function incrementGalleryDownloads(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(galleryItems)
    .set({ downloads: sql`${galleryItems.downloads} + 1` })
    .where(eq(galleryItems.id, id));
}

/**
 * Bulk delete gallery items
 */
export async function bulkDeleteGalleryItems(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(galleryItems).where(inArray(galleryItems.id, ids));
}

/**
 * Bulk update publish status
 */
export async function bulkUpdateGalleryPublish(ids: number[], isPublished: boolean): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(galleryItems)
    .set({ isPublished })
    .where(inArray(galleryItems.id, ids));
}

/**
 * Bulk update featured status
 */
export async function bulkUpdateGalleryFeatured(ids: number[], isFeatured: boolean): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(galleryItems)
    .set({ isFeatured })
    .where(inArray(galleryItems.id, ids));
}

/**
 * Get gallery items count (for pagination)
 */
export async function getGalleryItemsCount(filters: {
  tenantId?: number;
  type?: GalleryType;
  isPublished?: boolean;
  isFeatured?: boolean;
  search?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) {
    return 0;
  }

  const conditions: SQL<unknown>[] = [];

  if (filters.tenantId !== undefined) {
    conditions.push(eq(galleryItems.tenantId, filters.tenantId));
  }

  if (filters.type) {
    conditions.push(eq(galleryItems.type, filters.type));
  }

  if (filters.isPublished !== undefined) {
    conditions.push(eq(galleryItems.isPublished, filters.isPublished));
  }

  if (filters.isFeatured !== undefined) {
    conditions.push(eq(galleryItems.isFeatured, filters.isFeatured));
  }

  if (filters.search) {
    conditions.push(
      or(
        like(galleryItems.title, `%${filters.search}%`),
        like(galleryItems.description, `%${filters.search}%`)
      )
    );
  }

  let query = db.select({ count: sql<number>`COUNT(*)` }).from(galleryItems);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const result = await query;
  return Number(result[0]?.count) || 0;
}

/**
 * Get gallery analytics
 */
export async function getGalleryAnalytics(days: number = 30): Promise<{
  dailyStats: Array<{ date: string; views: number; likes: number; downloads: number }>;
  topItems: Array<{ id: number; title: string; type: string; views: number; likes: number }>;
  typeDistribution: Array<{ type: string; count: number }>;
}> {
  const db = await getDb();
  if (!db) {
    return { dailyStats: [], topItems: [], typeDistribution: [] };
  }

  // Get top items by views
  const topItems = await db.select({
    id: galleryItems.id,
    title: galleryItems.title,
    type: galleryItems.type,
    views: galleryItems.views,
    likes: galleryItems.likes,
  })
    .from(galleryItems)
    .orderBy(desc(galleryItems.views))
    .limit(10);

  // Get type distribution
  const typeDistribution = await db.select({
    type: galleryItems.type,
    count: sql<number>`COUNT(*)`,
  })
    .from(galleryItems)
    .groupBy(galleryItems.type);

  return {
    dailyStats: [], // Would need a separate analytics table for daily tracking
    topItems: topItems.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      views: item.views,
      likes: item.likes,
    })),
    typeDistribution: typeDistribution.map(item => ({
      type: item.type,
      count: Number(item.count),
    })),
  };
}

/**
 * Get gallery stats
 */
export async function getGalleryStats(): Promise<{
  totalItems: number;
  totalImages: number;
  totalVideos: number;
  totalWebsites: number;
  totalViews: number;
  totalLikes: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalItems: 0,
      totalImages: 0,
      totalVideos: 0,
      totalWebsites: 0,
      totalViews: 0,
      totalLikes: 0
    };
  }

  const [stats] = await db.select({
    totalItems: sql<number>`COUNT(*)`,
    totalImages: sql<number>`SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END)`,
    totalVideos: sql<number>`SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END)`,
    totalWebsites: sql<number>`SUM(CASE WHEN type = 'website' THEN 1 ELSE 0 END)`,
    totalViews: sql<number>`SUM(views)`,
    totalLikes: sql<number>`SUM(likes)`
  }).from(galleryItems);

  return {
    totalItems: Number(stats.totalItems) || 0,
    totalImages: Number(stats.totalImages) || 0,
    totalVideos: Number(stats.totalVideos) || 0,
    totalWebsites: Number(stats.totalWebsites) || 0,
    totalViews: Number(stats.totalViews) || 0,
    totalLikes: Number(stats.totalLikes) || 0
  };
}
