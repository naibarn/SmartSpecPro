import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";

/**
 * Ensure a persisted user has the stable subject required by existing session
 * and device-token formats. The nullable database column is retained for
 * cross-service compatibility; legacy rows are repaired only when used.
 */
export async function ensureUserOpenId(user: {
  id: number;
  openId: string | null;
}): Promise<string> {
  if (typeof user.openId === "string" && user.openId.trim()) {
    return user.openId;
  }

  const db = getDb();

  const candidate = `local_${randomUUID()}`;
  await db
    .update(users)
    .set({ openId: candidate })
    .where(and(eq(users.id, user.id), isNull(users.openId)));

  const [persisted] = await db
    .select({ openId: users.openId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (typeof persisted?.openId === "string" && persisted.openId.trim()) {
    return persisted.openId;
  }
  throw new Error("USER_IDENTITY_OPEN_ID_PERSIST_FAILED");
}
