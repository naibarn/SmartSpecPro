import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "../db";
import { getRedisClient, isRedisAvailable } from "./redis";
import { groupMembers, libraryPermissions, userGroups, users } from "../../drizzle/schema";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const GROUPS_CACHE_TTL_SECONDS = 60;
const MAX_GROUPS_PER_OWNER = 50;
const MAX_GROUP_MEMBERS = 100;
const MAX_GROUP_NAME_LENGTH = 128;
const MAX_GROUP_DESCRIPTION_LENGTH = 512;

export type GroupsTenantId = string | number;
export type GroupVisibility = "private" | "public";
export type GroupJoinPolicy = "invite_only" | "request_to_join" | "open";
export type GroupMemberRole = "admin" | "member";

export interface GroupsActor {
  userId: number;
  tenantId: GroupsTenantId;
  role?: string | null;
}

export interface CreateUserGroupInput {
  name: string;
  description?: string | null;
  visibility?: GroupVisibility;
  joinPolicy?: GroupJoinPolicy;
  iconUrl?: string | null;
}

export interface AddGroupMemberInput {
  groupId: number;
  userId: number;
  role?: GroupMemberRole;
}

export interface RemoveGroupMemberInput {
  groupId: number;
  userId: number;
}

export interface JoinRequestDecisionInput {
  groupId: number;
  userId: number;
}

export interface SearchPublicGroupsInput {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface GroupWithRole {
  id: number;
  tenantId: string;
  name: string;
  description: string | null;
  ownerId: number;
  iconUrl: string | null;
  settings: {
    visibility: GroupVisibility;
    joinPolicy: GroupJoinPolicy;
  };
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  role: GroupMemberRole;
}

function normalizeTenantId(tenantId: GroupsTenantId): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for group operations",
    });
  }
  return normalized;
}

function validateGroupName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group name is required",
    });
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Group name must be at most ${MAX_GROUP_NAME_LENGTH} characters`,
    });
  }
  // Block control characters (except normal whitespace)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group name contains invalid characters",
    });
  }
  // Block HTML tags
  if (/<[^>]*>/.test(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group name must not contain HTML tags",
    });
  }
  // Normalize consecutive whitespace
  return trimmed.replace(/\s+/g, " ");
}

function validateGroupDescription(description?: string | null): string | null {
  if (description === undefined || description === null) {
    return null;
  }
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_GROUP_DESCRIPTION_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Group description must be at most ${MAX_GROUP_DESCRIPTION_LENGTH} characters`,
    });
  }
  return trimmed;
}

function getGroupsCacheKey(userId: number, tenantId: string): string {
  return `user:${userId}:groups:${tenantId}`;
}

function getRedisOrNull() {
  if (!isRedisAvailable()) {
    return null;
  }
  try {
    return getRedisClient();
  } catch {
    return null;
  }
}

async function invalidateUserGroupsCache(userId: number, tenantId: string): Promise<void> {
  const redis = getRedisOrNull();
  if (!redis) return;
  await redis.del(getGroupsCacheKey(userId, tenantId));
}

async function invalidateManyUsersGroupsCache(userIds: number[], tenantId: string): Promise<void> {
  if (!userIds.length) return;
  const redis = getRedisOrNull();
  if (!redis) return;
  await Promise.all(userIds.map((userId) => redis.del(getGroupsCacheKey(userId, tenantId))));
}

async function resolveDb(dbClient?: DbClient): Promise<DbClient> {
  if (dbClient) return dbClient;
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  return db;
}

async function getGroupForTenant(db: DbClient, groupId: number, tenantId: string) {
  const rows = await db
    .select()
    .from(userGroups)
    .where(and(
      eq(userGroups.id, groupId),
      eq(userGroups.tenantId, tenantId),
      isNull(userGroups.deletedAt),
    ))
    .limit(1);

  return rows[0] ?? null;
}

async function hasAdminMembership(db: DbClient, groupId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.status, "active"),
    ))
    .limit(1);

  return rows[0]?.role === "admin";
}

async function requireAdminOrOwner(db: DbClient, groupId: number, actor: GroupsActor) {
  const tenantId = normalizeTenantId(actor.tenantId);
  const group = await getGroupForTenant(db, groupId, tenantId);
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  if (group.ownerId === actor.userId) {
    return group;
  }

  const isAdmin = await hasAdminMembership(db, groupId, actor.userId);
  if (!isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only group admins can perform this action",
    });
  }

  return group;
}

async function requireTargetUserInTenant(db: DbClient, userId: number, tenantId: string): Promise<void> {
  const rows = await db
    .select({
      id: users.id,
      currentTenantId: users.currentTenantId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  if (target.currentTenantId === null || String(target.currentTenantId) !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot add users from another tenant",
    });
  }
}

function mapRole(inputRole?: string | null): GroupMemberRole {
  return inputRole === "admin" ? "admin" : "member";
}

export async function createUserGroup(
  input: CreateUserGroupInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const now = new Date();

  const name = validateGroupName(input.name);
  const description = validateGroupDescription(input.description);
  const visibility: GroupVisibility = input.visibility ?? "private";
  const joinPolicy: GroupJoinPolicy = input.joinPolicy ?? "invite_only";

  const ownedCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(userGroups)
    .where(and(
      eq(userGroups.tenantId, tenantId),
      eq(userGroups.ownerId, actor.userId),
      isNull(userGroups.deletedAt),
    ));

  const ownedCount = Number(ownedCountRows[0]?.count ?? 0);
  if (ownedCount >= MAX_GROUPS_PER_OWNER) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Maximum ${MAX_GROUPS_PER_OWNER} groups per user`,
    });
  }

  try {
    const createdGroup = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(userGroups)
        .values({
          tenantId,
          name,
          description,
          ownerId: actor.userId,
          iconUrl: input.iconUrl ?? null,
          settings: {
            visibility,
            joinPolicy,
          },
          memberCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const group = inserted[0];
      if (!group) {
        throw new Error("Failed to create group");
      }

      await tx.insert(groupMembers).values({
        groupId: group.id,
        userId: actor.userId,
        role: "admin",
        addedBy: actor.userId,
        status: "active",
        joinedAt: now,
      });

      await tx
        .update(userGroups)
        .set({
          memberCount: 1,
          updatedAt: now,
        })
        .where(eq(userGroups.id, group.id));

      return {
        ...group,
        memberCount: 1,
      };
    });

    await invalidateUserGroupsCache(actor.userId, tenantId);
    return createdGroup;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("duplicate key")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A group with this name already exists in your workspace",
      });
    }
    throw error;
  }
}

export async function getUserGroups(
  actor: GroupsActor,
  dbClient?: DbClient,
): Promise<GroupWithRole[]> {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const cacheKey = getGroupsCacheKey(actor.userId, tenantId);
  const redis = getRedisOrNull();

  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as GroupWithRole[];
      } catch {
        await redis.del(cacheKey);
      }
    }
  }

  const rows = await db
    .select({
      group: userGroups,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
    .where(and(
      eq(groupMembers.userId, actor.userId),
      eq(groupMembers.status, "active"),
      eq(userGroups.tenantId, tenantId),
      isNull(userGroups.deletedAt),
    ))
    .orderBy(desc(userGroups.updatedAt), asc(userGroups.id));

  const result = rows.map((row) => ({
    ...row.group,
    role: mapRole(row.role),
  }));

  if (redis) {
    await redis.setex(cacheKey, GROUPS_CACHE_TTL_SECONDS, JSON.stringify(result));
  }

  return result;
}

export async function addGroupMember(
  input: AddGroupMemberInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await requireAdminOrOwner(db, input.groupId, actor);
  const tenantId = normalizeTenantId(group.tenantId);

  await requireTargetUserInTenant(db, input.userId, tenantId);

  const now = new Date();
  await db.transaction(async (tx) => {
    // Lock the group row to serialize concurrent member additions
    await tx.execute(sql`SELECT 1 FROM ${userGroups} WHERE ${userGroups.id} = ${input.groupId} FOR UPDATE`);

    // Check member count INSIDE the transaction (after lock) to prevent race condition
    const activeMemberCountRows = await tx
      .select({ count: sql<number>`count(*)` })
      .from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.status, "active"),
      ));

    const memberCount = Number(activeMemberCountRows[0]?.count ?? 0);
    if (memberCount >= MAX_GROUP_MEMBERS) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Maximum ${MAX_GROUP_MEMBERS} members per group`,
      });
    }

    const existingRows = await tx
      .select()
      .from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, input.userId),
      ))
      .limit(1);

    const existing = existingRows[0];
    if (existing?.status === "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "User is already a group member",
      });
    }

    if (existing) {
      await tx
        .update(groupMembers)
        .set({
          role: input.role ?? "member",
          addedBy: actor.userId,
          status: "active",
          joinedAt: now,
          removedAt: null,
        })
        .where(eq(groupMembers.id, existing.id));
    } else {
      await tx.insert(groupMembers).values({
        groupId: input.groupId,
        userId: input.userId,
        role: input.role ?? "member",
        addedBy: actor.userId,
        status: "active",
        joinedAt: now,
      });
    }

    await tx
      .update(userGroups)
      .set({
        memberCount: sql`${userGroups.memberCount} + 1`,
        updatedAt: now,
      })
      .where(eq(userGroups.id, input.groupId));
  });

  await invalidateUserGroupsCache(input.userId, tenantId);
  return { success: true };
}

export async function removeGroupMember(
  input: RemoveGroupMemberInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await getGroupForTenant(db, input.groupId, normalizeTenantId(actor.tenantId));
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  const isSelfRemoval = input.userId === actor.userId;
  if (!isSelfRemoval) {
    await requireAdminOrOwner(db, input.groupId, actor);
  }

  if (input.userId === group.ownerId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Owner cannot leave or be removed from the group",
    });
  }

  const membershipRows = await db
    .select()
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, input.groupId),
      eq(groupMembers.userId, input.userId),
      eq(groupMembers.status, "active"),
    ))
    .limit(1);

  const membership = membershipRows[0];
  if (!membership) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Member not found",
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(groupMembers)
      .set({
        status: "removed",
        removedAt: now,
      })
      .where(eq(groupMembers.id, membership.id));

    await tx
      .update(userGroups)
      .set({
        memberCount: sql`GREATEST(${userGroups.memberCount} - 1, 0)`,
        updatedAt: now,
      })
      .where(eq(userGroups.id, input.groupId));
  });

  await invalidateUserGroupsCache(input.userId, group.tenantId);
  return { success: true };
}

export async function deleteUserGroup(
  groupId: number,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await getGroupForTenant(db, groupId, normalizeTenantId(actor.tenantId));
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }
  if (group.ownerId !== actor.userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only group owner can delete this group",
    });
  }

  // Check if group has active shared permissions — warn before silent removal
  const permCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryPermissions)
    .where(and(
      eq(libraryPermissions.tenantId, group.tenantId),
      eq(libraryPermissions.subjectType, "group"),
      eq(libraryPermissions.subjectId, String(groupId)),
    ));

  const permCount = Number(permCountRows[0]?.count ?? 0);
  if (permCount > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot delete group with ${permCount} active shared permission(s). Remove shares first.`,
    });
  }

  const memberRows = await db
    .select({
      userId: groupMembers.userId,
    })
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.status, "active"),
    ));

  const memberIds = Array.from(new Set(memberRows.map((row) => row.userId)));
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(userGroups)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(userGroups.id, groupId));

    await tx
      .delete(libraryPermissions)
      .where(and(
        eq(libraryPermissions.tenantId, group.tenantId),
        eq(libraryPermissions.subjectType, "group"),
        eq(libraryPermissions.subjectId, String(groupId)),
      ));
  });

  await invalidateManyUsersGroupsCache(memberIds, group.tenantId);
  return { success: true };
}

export async function approveJoinRequest(
  input: JoinRequestDecisionInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await requireAdminOrOwner(db, input.groupId, actor);

  const pendingRows = await db
    .select()
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, input.groupId),
      eq(groupMembers.userId, input.userId),
      eq(groupMembers.status, "pending"),
    ))
    .limit(1);

  const pending = pendingRows[0];
  if (!pending) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pending join request not found",
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(groupMembers)
      .set({
        status: "active",
        removedAt: null,
        joinedAt: now,
      })
      .where(eq(groupMembers.id, pending.id));

    await tx
      .update(userGroups)
      .set({
        memberCount: sql`${userGroups.memberCount} + 1`,
        updatedAt: now,
      })
      .where(eq(userGroups.id, input.groupId));
  });

  await invalidateUserGroupsCache(input.userId, group.tenantId);
  return { success: true };
}

export async function rejectJoinRequest(
  input: JoinRequestDecisionInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  await requireAdminOrOwner(db, input.groupId, actor);

  await db
    .delete(groupMembers)
    .where(and(
      eq(groupMembers.groupId, input.groupId),
      eq(groupMembers.userId, input.userId),
      eq(groupMembers.status, "pending"),
    ));

  return { success: true };
}

export interface UpdateUserGroupInput {
  name?: string;
  description?: string | null;
  visibility?: GroupVisibility;
  joinPolicy?: GroupJoinPolicy;
  iconUrl?: string | null;
}

export async function updateUserGroup(
  groupId: number,
  input: UpdateUserGroupInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await requireAdminOrOwner(db, groupId, actor);
  const tenantId = normalizeTenantId(group.tenantId);

  const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    updatePayload.name = validateGroupName(input.name);
  }
  if (input.description !== undefined) {
    updatePayload.description = validateGroupDescription(input.description);
  }
  if (input.visibility !== undefined || input.joinPolicy !== undefined) {
    const currentSettings = (group.settings ?? { visibility: "private", joinPolicy: "invite_only" }) as {
      visibility: GroupVisibility;
      joinPolicy: GroupJoinPolicy;
    };
    updatePayload.settings = {
      ...currentSettings,
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}),
    };
  }
  if (input.iconUrl !== undefined) {
    updatePayload.iconUrl = input.iconUrl;
  }

  await db
    .update(userGroups)
    .set(updatePayload)
    .where(and(eq(userGroups.id, groupId), eq(userGroups.tenantId, tenantId)));

  // Invalidate cache for all group members
  const memberRows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));

  await invalidateManyUsersGroupsCache(
    memberRows.map((r) => r.userId),
    tenantId,
  );

  return { success: true };
}

export async function updateGroupMemberRole(
  groupId: number,
  userId: number,
  role: GroupMemberRole,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const group = await requireAdminOrOwner(db, groupId, actor);
  const tenantId = normalizeTenantId(group.tenantId);

  // Prevent changing the owner's role
  if (userId === group.ownerId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot change the group owner's role",
    });
  }

  const updated = await db
    .update(groupMembers)
    .set({ role })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .returning({ id: groupMembers.id });

  if (!updated[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Active member not found in group",
    });
  }

  await invalidateUserGroupsCache(userId, tenantId);
  return { success: true };
}

export async function joinOpenGroup(
  groupId: number,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const group = await getGroupForTenant(db, groupId, tenantId);
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  const settings = (group.settings ?? {}) as { joinPolicy?: string };
  const joinPolicy = settings.joinPolicy ?? "invite_only";

  if (joinPolicy !== "open") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        joinPolicy === "request_to_join"
          ? "This group requires a join request. Use requestJoin instead."
          : "This group is invite-only",
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    // Lock the group row to serialize concurrent join operations
    await tx.execute(sql`SELECT 1 FROM ${userGroups} WHERE ${userGroups.id} = ${groupId} FOR UPDATE`);

    // Check member count INSIDE the transaction (after lock) to prevent race condition
    const activeMemberCountRows = await tx
      .select({ count: sql<number>`count(*)` })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));

    if (Number(activeMemberCountRows[0]?.count ?? 0) >= MAX_GROUP_MEMBERS) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Maximum ${MAX_GROUP_MEMBERS} members per group`,
      });
    }

    const existingRows = await tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actor.userId)))
      .limit(1);

    const existing = existingRows[0];
    if (existing?.status === "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "You are already a member of this group",
      });
    }

    if (existing) {
      await tx
        .update(groupMembers)
        .set({ role: "member", status: "active", joinedAt: now, removedAt: null })
        .where(eq(groupMembers.id, existing.id));
    } else {
      await tx.insert(groupMembers).values({
        groupId,
        userId: actor.userId,
        role: "member",
        addedBy: null,
        status: "active",
        joinedAt: now,
      });
    }

    await tx
      .update(userGroups)
      .set({ memberCount: sql`${userGroups.memberCount} + 1`, updatedAt: now })
      .where(eq(userGroups.id, groupId));
  });

  await invalidateUserGroupsCache(actor.userId, tenantId);
  return { success: true };
}

export async function requestJoinGroup(
  groupId: number,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const group = await getGroupForTenant(db, groupId, tenantId);
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  const settings = (group.settings ?? {}) as { joinPolicy?: string };
  const joinPolicy = settings.joinPolicy ?? "invite_only";

  if (joinPolicy === "invite_only") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This group is invite-only",
    });
  }
  if (joinPolicy === "open") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This group is open. Use join instead of requestJoin.",
    });
  }

  // Check existing membership
  const existingRows = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actor.userId)))
    .limit(1);

  const existing = existingRows[0];
  if (existing?.status === "active") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already a member of this group",
    });
  }
  if (existing?.status === "pending") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You already have a pending join request",
    });
  }

  // Re-activate removed membership as pending, or create new
  if (existing) {
    await db
      .update(groupMembers)
      .set({ status: "pending", role: "member", joinedAt: new Date(), removedAt: null })
      .where(eq(groupMembers.id, existing.id));
  } else {
    await db.insert(groupMembers).values({
      groupId,
      userId: actor.userId,
      role: "member",
      addedBy: null,
      status: "pending",
      joinedAt: new Date(),
    });
  }

  return { success: true };
}

export interface GroupMemberDetail {
  userId: number;
  userName: string | null;
  userEmail: string | null;
  role: GroupMemberRole;
  status: string;
  joinedAt: Date;
}

export async function getGroupMembers(
  groupId: number,
  actor: GroupsActor,
  dbClient?: DbClient,
): Promise<GroupMemberDetail[]> {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const group = await getGroupForTenant(db, groupId, tenantId);
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  // Verify caller is a member of this group
  const membershipRows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, actor.userId),
      eq(groupMembers.status, "active"),
    ))
    .limit(1);

  if (membershipRows.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member to view group members",
    });
  }

  const rows = await db
    .select({
      userId: groupMembers.userId,
      userName: users.name,
      userEmail: users.email,
      role: groupMembers.role,
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(
      eq(groupMembers.groupId, groupId),
      or(
        eq(groupMembers.status, "active"),
        eq(groupMembers.status, "pending"),
      ),
    ))
    .orderBy(asc(groupMembers.role), asc(users.name));

  return rows.map((r) => ({
    ...r,
    role: mapRole(r.role),
  }));
}

export async function searchTenantUsers(
  query: string,
  tenantId: GroupsTenantId,
  excludeGroupId: number | undefined,
  limit: number,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const normalizedTenantId = normalizeTenantId(tenantId);
  const escaped = query.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");
  const searchPattern = `%${escaped}%`;

  const conditions: SQL[] = [
    or(
      ilike(users.name, searchPattern),
      ilike(users.email, searchPattern),
    )!,
  ];

  // Filter to users in the same tenant (by registeredDomain or currentTenantId)
  // Using currentTenantId for tenant scoping
  conditions.push(sql`${users.currentTenantId}::text = ${normalizedTenantId}`);

  if (excludeGroupId) {
    // Exclude users already in the group
    conditions.push(
      sql`${users.id} NOT IN (
        SELECT ${groupMembers.userId} FROM ${groupMembers}
        WHERE ${groupMembers.groupId} = ${excludeGroupId}
          AND ${groupMembers.status} IN ('active', 'pending')
      )`,
    );
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(...conditions))
    .limit(Math.min(limit, 20));

  return rows;
}

export async function searchPublicGroups(
  input: SearchPublicGroupsInput,
  actor: GroupsActor,
  dbClient?: DbClient,
) {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeTenantId(actor.tenantId);
  const query = input.query?.trim() ?? "";
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const offset = Math.max(0, input.offset ?? 0);

  const conditions: SQL[] = [
    eq(userGroups.tenantId, tenantId),
    isNull(userGroups.deletedAt),
    sql`${userGroups.settings}->>'visibility' = 'public'`,
  ];

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(or(
      ilike(userGroups.name, pattern),
      ilike(userGroups.description, pattern),
    )!);
  }

  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions)!;

  const rows = await db
    .select()
    .from(userGroups)
    .where(whereCondition)
    .orderBy(desc(userGroups.memberCount), asc(userGroups.name))
    .limit(limit)
    .offset(offset);

  return rows;
}
