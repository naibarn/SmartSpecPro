import { SignJWT } from "jose";
import { getDb } from "../../db";
import { users } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "../../_core/env";

export const SYSTEM_USER_ID = -1;
const SYSTEM_USER_OPENID = "system-guardian-internal";
const SYSTEM_USER_EMAIL = "system-agent@internal";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Ensure the system user (id: -1) exists in the database.
 * Called once at server startup. Idempotent.
 */
export async function ensureSystemUser(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[VirtualAdmin] Cannot ensure system user: database not available");
    return;
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, SYSTEM_USER_ID))
    .limit(1);

  if (existing.length > 0) {
    return; // Already exists
  }

  await db
    .insert(users)
    .values({
      id: SYSTEM_USER_ID,
      openId: SYSTEM_USER_OPENID,
      email: SYSTEM_USER_EMAIL,
      name: "System Guardian",
      role: "system_agent",
      plan: "free",
      credits: 0,
      isDisabled: false,
      isSystemUser: true,
      loginMethod: "system",
    })
    .onConflictDoNothing();
}

/**
 * Get a JWT token for the system user.
 * Cached in memory; regenerated when expired.
 */
export async function getSystemUserToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const expiresAt = Math.floor((Date.now() + EIGHT_HOURS_MS) / 1000);

  cachedToken = await new SignJWT({
    userId: SYSTEM_USER_ID,
    role: "system_agent",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(secret);

  tokenExpiresAt = expiresAt * 1000; // Convert back to ms

  return cachedToken;
}
