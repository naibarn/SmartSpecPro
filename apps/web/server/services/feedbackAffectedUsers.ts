import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { users } from "../../drizzle/schema";

export interface AffectedUser {
  id: number;
  email: string | null;
}

/**
 * Extract the bounded, numeric affected-user correlation list from an auto
 * report context. Legacy/malformed values are ignored rather than exposed.
 */
export function extractAffectedUserIds(contextJson: unknown): number[] {
  if (!contextJson || typeof contextJson !== "object") return [];

  const values = (contextJson as { affectedUserIds?: unknown }).affectedUserIds;
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values.filter(
        (value): value is number => Number.isInteger(value) && value > 0
      )
    )
  ).slice(0, 5);
}

/**
 * Resolve the current email for affected IDs at an admin-only server boundary.
 * Missing users/emails remain represented by their ID for diagnosis.
 */
export async function resolveAffectedUsers(
  db: DrizzleDB,
  affectedUserIds: number[],
  tenantId?: string | null
): Promise<AffectedUser[]> {
  const ids = Array.from(new Set(affectedUserIds)).slice(0, 5);
  if (ids.length === 0) return [];

  const conditions = [inArray(users.id, ids)];
  if (tenantId) conditions.push(eq(users.currentTenantId, tenantId));

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(...conditions));
  const byId = new Map(rows.map(row => [row.id, row.email ?? null]));

  return ids.map(id => ({ id, email: byId.get(id) ?? null }));
}

export function formatAffectedUsersForText(
  affectedUsers: AffectedUser[]
): string {
  return affectedUsers
    .map(({ id, email }) => (email ? `${email} (user #${id})` : `user #${id}`))
    .join(", ");
}
