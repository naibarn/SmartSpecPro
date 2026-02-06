/**
 * User Skill Visibility Service
 * Manages per-user skill visibility preferences with caching and lazy initialization
 */

import { getDb } from "../db";
import { skills as skillsTable, userSkillVisibility } from "../../drizzle/schema";
import { eq, and, sql, ilike, or, count } from "drizzle-orm";

// Per-user cache with TTL
const userVisibleCache = new Map<number, { skillIds: number[], expiry: number }>();
const USER_CACHE_TTL = 120_000; // 2 minutes

function invalidateUserCache(userId: number) {
  userVisibleCache.delete(userId);
}

/**
 * Lazy-initialize visibility for a user who has no rows yet.
 * Copies all skills with visibleByDefault=true.
 */
async function initializeUserVisibility(userId: number): Promise<number[]> {
  const db = await getDb();

  // Insert defaults for this user
  await db.execute(sql`
    INSERT INTO user_skill_visibility ("userId", "skillId", visible, "autoTriggerEnabled", "createdAt", "updatedAt")
    SELECT ${userId}, s.id, true, true, NOW(), NOW()
    FROM skills s
    WHERE s."visibleByDefault" = true AND s."isEnabled" = true
    ON CONFLICT DO NOTHING
  `);

  // Return the IDs
  const rows = await db
    .select({ skillId: userSkillVisibility.skillId })
    .from(userSkillVisibility)
    .where(and(eq(userSkillVisibility.userId, userId), eq(userSkillVisibility.visible, true)));

  return rows.map((r) => r.skillId);
}

/**
 * Ensure a user has visibility rows. If none exist, lazy-init from defaults.
 */
async function ensureUserInitialized(userId: number): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .select({ id: userSkillVisibility.id })
    .from(userSkillVisibility)
    .where(eq(userSkillVisibility.userId, userId))
    .limit(1);

  if (!row) {
    await initializeUserVisibility(userId);
  } else {
    // Sync any newly added skills that are visibleByDefault but not yet in user's visibility
    await db.execute(sql`
      INSERT INTO user_skill_visibility ("userId", "skillId", visible, "autoTriggerEnabled", "createdAt", "updatedAt")
      SELECT ${userId}, s.id, true, true, NOW(), NOW()
      FROM skills s
      WHERE s."visibleByDefault" = true AND s."isEnabled" = true
        AND s.id NOT IN (
          SELECT "skillId" FROM user_skill_visibility WHERE "userId" = ${userId}
        )
      ON CONFLICT DO NOTHING
    `);
  }
}

/**
 * Get IDs of skills visible to a user. Lazy-inits if needed.
 */
export async function getUserVisibleSkillIds(userId: number): Promise<number[]> {
  // Check cache
  const cached = userVisibleCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.skillIds;
  }

  const db = await getDb();

  // Check if user has any visibility rows
  const rows = await db
    .select({ skillId: userSkillVisibility.skillId })
    .from(userSkillVisibility)
    .where(and(eq(userSkillVisibility.userId, userId), eq(userSkillVisibility.visible, true)));

  let skillIds: number[];
  if (rows.length === 0) {
    // Lazy init
    skillIds = await initializeUserVisibility(userId);
  } else {
    skillIds = rows.map((r) => r.skillId);
  }

  // Cache
  userVisibleCache.set(userId, { skillIds, expiry: Date.now() + USER_CACHE_TTL });
  return skillIds;
}

/**
 * Get user's visible skills with auto-trigger info (for skill detection)
 */
export async function getUserVisibleSkillsWithAutoTrigger(userId: number): Promise<{ skillId: number; autoTriggerEnabled: boolean }[]> {
  const db = await getDb();

  const rows = await db
    .select({
      skillId: userSkillVisibility.skillId,
      autoTriggerEnabled: userSkillVisibility.autoTriggerEnabled,
    })
    .from(userSkillVisibility)
    .where(and(eq(userSkillVisibility.userId, userId), eq(userSkillVisibility.visible, true)));

  if (rows.length === 0) {
    await initializeUserVisibility(userId);
    return getUserVisibleSkillsWithAutoTrigger(userId);
  }

  return rows;
}

/**
 * Paginated visible skills for chat panel
 */
export async function getUserVisibleSkills(
  userId: number,
  options: { search?: string; category?: string; limit?: number; offset?: number } = {}
) {
  const db = await getDb();
  const { search, category, limit = 50, offset = 0 } = options;

  // Ensure user has visibility rows (lazy init)
  await ensureUserInitialized(userId);

  const conditions = [
    eq(userSkillVisibility.userId, userId),
    eq(userSkillVisibility.visible, true),
    eq(skillsTable.isEnabled, true),
  ];

  if (category && category !== "all") {
    conditions.push(eq(skillsTable.category, category as any));
  }

  if (search) {
    conditions.push(
      or(
        ilike(skillsTable.name, `%${search}%`),
        ilike(skillsTable.description, `%${search}%`)
      )!
    );
  }

  const [items, totalResult] = await Promise.all([
    db
      .select({
        id: skillsTable.id,
        slug: skillsTable.slug,
        name: skillsTable.name,
        description: skillsTable.description,
        category: skillsTable.category,
        icon: skillsTable.icon,
        tags: skillsTable.tags,
        isAutoTrigger: skillsTable.isAutoTrigger,
        creditMultiplier: skillsTable.creditMultiplier,
        priority: skillsTable.priority,
        availableModels: skillsTable.availableModels,
        defaultModel: skillsTable.defaultModel,
        enabledByDefault: skillsTable.enabledByDefault,
        executionMode: skillsTable.executionMode, // Added for endpoint routing
        autoTriggerEnabled: userSkillVisibility.autoTriggerEnabled,
      })
      .from(userSkillVisibility)
      .innerJoin(skillsTable, eq(userSkillVisibility.skillId, skillsTable.id))
      .where(and(...conditions))
      .orderBy(skillsTable.priority)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(userSkillVisibility)
      .innerJoin(skillsTable, eq(userSkillVisibility.skillId, skillsTable.id))
      .where(and(...conditions)),
  ]);

  return { skills: items, total: totalResult[0]?.total ?? 0 };
}

/**
 * Browse ALL skills with user's visibility flag (for settings page)
 */
export async function getAllSkillsForUser(
  userId: number,
  options: { search?: string; category?: string; limit?: number; offset?: number } = {}
) {
  const db = await getDb();
  const { search, category, limit = 20, offset = 0 } = options;

  const conditions = [eq(skillsTable.isEnabled, true)];

  if (category && category !== "all") {
    conditions.push(eq(skillsTable.category, category as any));
  }

  if (search) {
    conditions.push(
      or(
        ilike(skillsTable.name, `%${search}%`),
        ilike(skillsTable.description, `%${search}%`)
      )!
    );
  }

  const [items, totalResult] = await Promise.all([
    db
      .select({
        id: skillsTable.id,
        slug: skillsTable.slug,
        name: skillsTable.name,
        description: skillsTable.description,
        category: skillsTable.category,
        icon: skillsTable.icon,
        tags: skillsTable.tags,
        isAutoTrigger: skillsTable.isAutoTrigger,
        creditMultiplier: skillsTable.creditMultiplier,
        priority: skillsTable.priority,
        availableModels: skillsTable.availableModels,
        defaultModel: skillsTable.defaultModel,
        executionMode: skillsTable.executionMode, // Added for endpoint routing
        visible: userSkillVisibility.visible,
        autoTriggerEnabled: userSkillVisibility.autoTriggerEnabled,
      })
      .from(skillsTable)
      .leftJoin(
        userSkillVisibility,
        and(
          eq(userSkillVisibility.skillId, skillsTable.id),
          eq(userSkillVisibility.userId, userId)
        )
      )
      .where(and(...conditions))
      .orderBy(skillsTable.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(skillsTable)
      .where(and(...conditions)),
  ]);

  return {
    skills: items.map((s) => ({
      ...s,
      visible: s.visible ?? false,
      autoTriggerEnabled: s.autoTriggerEnabled ?? true,
    })),
    total: totalResult[0]?.total ?? 0,
  };
}

/**
 * Toggle visibility for a single skill
 */
export async function setSkillVisibility(userId: number, skillId: number, visible: boolean) {
  const db = await getDb();

  await db
    .insert(userSkillVisibility)
    .values({ userId, skillId, visible, autoTriggerEnabled: true })
    .onConflictDoUpdate({
      target: [userSkillVisibility.userId, userSkillVisibility.skillId],
      set: { visible, updatedAt: new Date() },
    });

  invalidateUserCache(userId);
}

/**
 * Batch toggle visibility
 */
export async function batchSetVisibility(userId: number, updates: { skillId: number; visible: boolean }[]) {
  const db = await getDb();

  for (const { skillId, visible } of updates) {
    await db
      .insert(userSkillVisibility)
      .values({ userId, skillId, visible, autoTriggerEnabled: true })
      .onConflictDoUpdate({
        target: [userSkillVisibility.userId, userSkillVisibility.skillId],
        set: { visible, updatedAt: new Date() },
      });
  }

  invalidateUserCache(userId);
}

/**
 * Toggle auto-trigger for a specific skill
 */
export async function setAutoTrigger(userId: number, skillId: number, enabled: boolean) {
  const db = await getDb();

  await db
    .insert(userSkillVisibility)
    .values({ userId, skillId, visible: true, autoTriggerEnabled: enabled })
    .onConflictDoUpdate({
      target: [userSkillVisibility.userId, userSkillVisibility.skillId],
      set: { autoTriggerEnabled: enabled, updatedAt: new Date() },
    });

  invalidateUserCache(userId);
}

/**
 * Get lightweight slash command list for a user (slug, name, icon only)
 */
export async function getSlashCommands(userId: number) {
  const db = await getDb();

  // Ensure user has visibility rows (lazy init)
  await ensureUserInitialized(userId);

  const rows = await db
    .select({
      slug: skillsTable.slug,
      name: skillsTable.name,
      icon: skillsTable.icon,
      description: skillsTable.description,
      category: skillsTable.category,
    })
    .from(userSkillVisibility)
    .innerJoin(skillsTable, eq(userSkillVisibility.skillId, skillsTable.id))
    .where(
      and(
        eq(userSkillVisibility.userId, userId),
        eq(userSkillVisibility.visible, true),
        eq(skillsTable.isEnabled, true)
      )
    )
    .orderBy(skillsTable.priority);

  return rows;
}
