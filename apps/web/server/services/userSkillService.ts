/**
 * User Skill Visibility Service
 * Manages per-user skill visibility preferences with caching and lazy initialization
 */

import { getDb } from "../db";
import { skills as skillsTable, userSkillVisibility, skillPermissions, groupMembers, users } from "../../drizzle/schema";
import { eq, and, sql, ilike, or, count, inArray } from "drizzle-orm";
import { sanitizeBrandText } from "./brandingSanitizer";
import path from "path";
import { hasRelativeSkillManifest } from "./skillFiles";
import { refreshModelCache } from "./modelRegistry";
import { resolveMediaTypeFromSkillCategory, sanitizeMediaModelSelection } from "./mediaModelSelection";

// Per-user cache with TTL
const userVisibleCache = new Map<number, { skillIds: number[], expiry: number }>();
const USER_CACHE_TTL = 120_000; // 2 minutes

function invalidateUserCache(userId: number) {
  userVisibleCache.delete(userId);
}

function hasLocalSkillFolder(slug: string): boolean {
  return hasRelativeSkillManifest(path.join("skills", slug));
}

function sanitizeSkillMediaModelConfig<T extends {
  category?: string | null;
  availableModels?: string[] | null;
  defaultModel?: string | null;
}>(skill: T): T & {
  availableModels: string[] | null;
  defaultModel: string | null;
} {
  const mediaType = resolveMediaTypeFromSkillCategory(skill.category);
  if (!mediaType) {
    return {
      ...skill,
      availableModels: skill.availableModels ?? null,
      defaultModel: skill.defaultModel ?? null,
    };
  }

  return {
    ...skill,
    ...sanitizeMediaModelSelection(mediaType, {
      availableModels: skill.availableModels,
      defaultModel: skill.defaultModel,
    }),
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  return db;
}

/**
 * Lazy-initialize visibility for a user who has no rows yet.
 * Copies all skills with visibleByDefault=true.
 */
async function initializeUserVisibility(userId: number): Promise<number[]> {
  const db = await requireDb();

  // Insert defaults for this user (only public skills)
  await db.execute(sql`
    INSERT INTO user_skill_visibility ("userId", "skillId", visible, "autoTriggerEnabled", "createdAt", "updatedAt")
    SELECT ${userId}, s.id, true, true, NOW(), NOW()
    FROM skills s
    WHERE s."visibleByDefault" = true AND s."isEnabled" = true AND s."visibility" = 'public'
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
  const db = await requireDb();
  const [row] = await db
    .select({ id: userSkillVisibility.id })
    .from(userSkillVisibility)
    .where(eq(userSkillVisibility.userId, userId))
    .limit(1);

  if (!row) {
    await initializeUserVisibility(userId);
  } else {
    // Sync any newly added public skills that are visibleByDefault but not yet in user's visibility
    await db.execute(sql`
      INSERT INTO user_skill_visibility ("userId", "skillId", visible, "autoTriggerEnabled", "createdAt", "updatedAt")
      SELECT ${userId}, s.id, true, true, NOW(), NOW()
      FROM skills s
      WHERE s."visibleByDefault" = true AND s."isEnabled" = true AND s."visibility" = 'public'
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

  const db = await requireDb();

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
  const db = await requireDb();

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
  const db = await requireDb();
  const { search, category, limit = 50, offset = 0 } = options;

  await refreshModelCache().catch((error) => {
    console.warn("[UserSkillService] Failed to refresh media model cache before loading visible skills", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Ensure user has visibility rows (lazy init)
  await ensureUserInitialized(userId);

  // Chat should show every skill the user can access immediately, even before
  // a per-user visibility row exists for newly imported/approved skills.
  const groupSharedSkillIds = db
    .select({ skillId: skillPermissions.skillId })
    .from(skillPermissions)
    .innerJoin(groupMembers, and(
      eq(groupMembers.groupId, skillPermissions.groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.status, "active"),
    ));

  const conditions: any[] = [
    eq(skillsTable.isEnabled, true),
    sql`${userSkillVisibility.visible} IS DISTINCT FROM false`,
    or(
      eq(skillsTable.visibility, "public"),
      eq(skillsTable.createdBy, userId),
      and(
        eq(skillsTable.visibility, "private"),
        inArray(skillsTable.id, groupSharedSkillIds),
      ),
    )!,
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
        llmModelId: skillsTable.llmModelId,
        preferredProviderId: skillsTable.preferredProviderId,
        strictProviderPin: skillsTable.strictProviderPin,
        configJson: skillsTable.configJson,
        enabledByDefault: skillsTable.enabledByDefault,
        executionMode: skillsTable.executionMode, // Added for endpoint routing
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
      .orderBy(skillsTable.priority)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(skillsTable)
      .leftJoin(
        userSkillVisibility,
        and(
          eq(userSkillVisibility.skillId, skillsTable.id),
          eq(userSkillVisibility.userId, userId)
        )
      )
      .where(and(...conditions)),
  ]);

  return {
    skills: items.map((item) => ({
      ...sanitizeSkillMediaModelConfig(item),
      name: sanitizeBrandText(item.name || ""),
      description: sanitizeBrandText(item.description || ""),
      autoTriggerEnabled: item.autoTriggerEnabled ?? true,
    })),
    total: totalResult[0]?.total ?? 0,
  };
}

/**
 * Browse skills the user has permission to see/use (for settings page).
 * Shows: public skills, own skills (any visibility), and private skills shared via groups.
 * Returns ownership info so the frontend can show sharing UI for owned skills.
 */
export async function getAllSkillsForUser(
  userId: number,
  options: { search?: string; category?: string; limit?: number; offset?: number } = {}
) {
  const db = await requireDb();
  const { search, category, limit = 20, offset = 0 } = options;

  await refreshModelCache().catch((error) => {
    console.warn("[UserSkillService] Failed to refresh media model cache before loading browseable skills", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const conditions: any[] = [eq(skillsTable.isEnabled, true)];

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

  // Permission filter: public OR owned by user OR shared via group membership
  const groupSharedSkillIds = db
    .select({ skillId: skillPermissions.skillId })
    .from(skillPermissions)
    .innerJoin(groupMembers, and(
      eq(groupMembers.groupId, skillPermissions.groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.status, "active"),
    ));

  conditions.push(
    or(
      eq(skillsTable.visibility, "public"),
      eq(skillsTable.createdBy, userId),
      and(
        eq(skillsTable.visibility, "private"),
        inArray(skillsTable.id, groupSharedSkillIds),
      ),
    )
  );

  const selectFields = {
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
    llmModelId: skillsTable.llmModelId,
    preferredProviderId: skillsTable.preferredProviderId,
    strictProviderPin: skillsTable.strictProviderPin,
    executionMode: skillsTable.executionMode,
    createdBy: skillsTable.createdBy,
    visibility: skillsTable.visibility,
    visible: userSkillVisibility.visible,
    autoTriggerEnabled: userSkillVisibility.autoTriggerEnabled,
    ownerName: users.name,
  };

  const [items, totalResult] = await Promise.all([
    db
      .select(selectFields)
      .from(skillsTable)
      .leftJoin(
        userSkillVisibility,
        and(
          eq(userSkillVisibility.skillId, skillsTable.id),
          eq(userSkillVisibility.userId, userId)
        )
      )
      .leftJoin(users, eq(skillsTable.createdBy, users.id))
      .where(and(...conditions))
      .orderBy(skillsTable.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(skillsTable)
      .leftJoin(
        userSkillVisibility,
        and(
          eq(userSkillVisibility.skillId, skillsTable.id),
          eq(userSkillVisibility.userId, userId)
        )
      )
      .leftJoin(users, eq(skillsTable.createdBy, users.id))
      .where(and(...conditions)),
  ]);

  return {
    skills: items.map((s) => ({
      ...sanitizeSkillMediaModelConfig(s),
      name: sanitizeBrandText(s.name || ""),
      description: sanitizeBrandText(s.description || ""),
      visible: s.visible ?? false,
      autoTriggerEnabled: s.autoTriggerEnabled ?? true,
      ownerName: s.ownerName ? sanitizeBrandText(s.ownerName) : null,
      isOwner: s.createdBy === userId,
      hasLocalFolder: hasLocalSkillFolder(s.slug),
    })),
    total: totalResult[0]?.total ?? 0,
  };
}

/**
 * Toggle visibility for a single skill
 */
export async function setSkillVisibility(userId: number, skillId: number, visible: boolean) {
  const db = await requireDb();

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
  const db = await requireDb();

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
  const db = await requireDb();

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
  const db = await requireDb();

  // Ensure user has visibility rows (lazy init)
  await ensureUserInitialized(userId);

  const rows = await db
    .select({
      slug: skillsTable.slug,
      name: skillsTable.name,
      icon: skillsTable.icon,
      description: skillsTable.description,
      category: skillsTable.category,
      visibleByDefault: skillsTable.visibleByDefault,
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

  return rows.map((row) => ({
    ...row,
    name: sanitizeBrandText(row.name || ""),
    description: sanitizeBrandText(row.description || ""),
  }));
}
