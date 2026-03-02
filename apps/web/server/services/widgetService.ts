/**
 * Widget Service — system user management, credit cap enforcement.
 *
 * Per-tenant system user:
 *   - email: widget-system@{tenantId}.internal
 *   - role: 'user' (not 'system' — that role doesn't exist in roleEnum)
 *   - password: random bcrypt hash (cannot be guessed or logged into)
 *
 * Redis cap keys:
 *   - widget:session:{visitorSessionId}         — TTL: 1 hour
 *   - widget:daily:{widgetId}:{hashedIp}:{date} — TTL: 24 hours
 *   - widget:monthly:{widgetId}:{YYYY-MM}       — TTL: 32 days
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { getRedisClient } from "../services/redis";

// ── TTL constants ──────────────────────────────────────────────────────────────

export const WIDGET_SESSION_CAP_TTL = 3600;       // 1 hour
export const WIDGET_DAILY_CAP_TTL = 86400;        // 24 hours
export const WIDGET_MONTHLY_CAP_TTL = 32 * 86400; // 32 days

// ── System user ────────────────────────────────────────────────────────────────

/**
 * Returns true if the email matches the widget system user pattern.
 * Used by the login flow to reject login attempts for these accounts.
 */
export function isWidgetSystemEmail(email: string): boolean {
  return /^widget-system@.+\.internal$/.test(email);
}

/**
 * Get or create the per-tenant system user for widget anonymous traffic.
 * Idempotent — always returns the same user for the same tenantId.
 */
export async function getOrCreateSystemUser(
  tenantId: string,
): Promise<{ userId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const email = `widget-system@${tenantId}.internal`;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { userId: existing.id };
  }

  // Random password — this account can never be logged into
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const hashedPassword = await bcrypt.hash(randomPassword, 12);

  const [created] = await db
    .insert(users)
    .values({
      email,
      username: `Widget System (${tenantId})`,
      password: hashedPassword,
      role: "user",
      currentTenantId: tenantId,
      isActive: true,
    } as any)
    .returning();

  return { userId: created.id };
}

// ── Visitor cap enforcement ────────────────────────────────────────────────────

export interface CapCheckParams {
  widgetId: string;
  visitorSessionId: string;
  visitorIp: string;
  creditCost: number;
  maxPerSession: number;
  maxPerDay: number;
  monthlyBudget: number | null;
}

export class WidgetCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetCapExceededError";
  }
}

/**
 * Check and increment all per-visitor credit caps.
 * Throws WidgetCapExceededError if any cap would be exceeded.
 *
 * Uses GET-check-INCR pattern to minimize over-cap risk. Small concurrent
 * races (< creditCost over cap per concurrent request) are acceptable for
 * widget billing where exact precision is less critical than availability.
 * TTL is set only when key is first created (count === creditCost) to avoid
 * resetting the window on every request.
 */
export async function checkVisitorCaps(params: CapCheckParams): Promise<void> {
  const { widgetId, visitorSessionId, visitorIp, creditCost, maxPerSession, maxPerDay, monthlyBudget } = params;
  const redis = getRedisClient();

  // Hash visitor IP for privacy
  const hashedIp = crypto.createHash("sha256").update(visitorIp).digest("hex").slice(0, 16);

  // Date parts
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthStr = now.toISOString().slice(0, 7);  // YYYY-MM

  // ── Session cap ────────────────────────────────────────────────────────────
  const sessionKey = `widget:session:${visitorSessionId}`;
  const sessionCurrent = parseInt((await redis.get(sessionKey)) ?? "0", 10);
  if (sessionCurrent + creditCost > maxPerSession) {
    throw new WidgetCapExceededError(`Widget session credit cap (${maxPerSession}) exceeded`);
  }
  const sessionTotal = await redis.incrby(sessionKey, creditCost);
  // Set TTL only on first creation
  if (sessionTotal === creditCost) {
    await redis.expire(sessionKey, WIDGET_SESSION_CAP_TTL);
  }

  // ── Daily cap ──────────────────────────────────────────────────────────────
  const dailyKey = `widget:daily:${widgetId}:${hashedIp}:${dateStr}`;
  const dailyCurrent = parseInt((await redis.get(dailyKey)) ?? "0", 10);
  if (dailyCurrent + creditCost > maxPerDay) {
    throw new WidgetCapExceededError(`Widget daily credit cap (${maxPerDay}) exceeded`);
  }
  const dailyTotal = await redis.incrby(dailyKey, creditCost);
  if (dailyTotal === creditCost) {
    await redis.expire(dailyKey, WIDGET_DAILY_CAP_TTL);
  }

  // ── Monthly budget cap ─────────────────────────────────────────────────────
  if (monthlyBudget !== null) {
    const monthlyKey = `widget:monthly:${widgetId}:${monthStr}`;
    const monthlyCurrent = parseInt((await redis.get(monthlyKey)) ?? "0", 10);
    if (monthlyCurrent + creditCost > monthlyBudget) {
      throw new WidgetCapExceededError(`Widget monthly budget (${monthlyBudget}) exceeded`);
    }
    const monthlyTotal = await redis.incrby(monthlyKey, creditCost);
    if (monthlyTotal === creditCost) {
      await redis.expire(monthlyKey, WIDGET_MONTHLY_CAP_TTL);
    }
  }
}
