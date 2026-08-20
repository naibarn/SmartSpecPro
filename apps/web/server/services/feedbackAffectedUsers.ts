import { inArray } from "drizzle-orm";
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
 *
 * The ticket query is already tenant-scoped before this helper is called.
 * Do not additionally filter by `users.currentTenantId`: that field describes
 * the user's current tenant and can hide the historical reporter for a ticket
 * after the user changes tenant.
 */
export async function resolveAffectedUsers(
  db: DrizzleDB,
  affectedUserIds: number[],
  _tenantId?: string | null,
  maxUsers = 5
): Promise<AffectedUser[]> {
  const ids = Array.from(new Set(affectedUserIds)).slice(0, maxUsers);
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
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
