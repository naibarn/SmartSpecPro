/**
 * Widget Service — system user management, credit cap enforcement.
 *
 * Per-tenant system user:
 *   - email: widget-system@{tenantId}.internal
 *   - role: 'user' (not 'system' — that role doesn't exist in roleEnum)
 *   - password: random bcrypt hash (cannot be guessed or logged into)
 *
 * Visitor credit caps are stored in PostgreSQL and shared across instances.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { consumeUsageCaps } from "./postgresRateLimitStore";

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
 * Checks and charges all applicable caps in one transaction. Rejected calls
 * do not partially consume another cap's allowance.
 */
export async function checkVisitorCaps(params: CapCheckParams): Promise<void> {
  const { widgetId, visitorSessionId, visitorIp, creditCost, maxPerSession, maxPerDay, monthlyBudget } = params;
  // Hash visitor IP for privacy
  const hashedIp = crypto.createHash("sha256").update(visitorIp).digest("hex").slice(0, 16);

  // Date parts
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthStr = now.toISOString().slice(0, 7);  // YYYY-MM

  const caps = [
    { namespace: "widget:session", subject: visitorSessionId, limit: maxPerSession },
    { namespace: "widget:daily", subject: `${widgetId}:${hashedIp}:${dateStr}`, limit: maxPerDay },
    ...(monthlyBudget === null
      ? []
      : [{ namespace: "widget:monthly", subject: `${widgetId}:${monthStr}`, limit: monthlyBudget }]),
  ];
  const decision = await consumeUsageCaps(caps, creditCost);
  if (!decision.allowed) {
    switch (decision.exceeded?.namespace) {
      case "widget:session":
        throw new WidgetCapExceededError(`Widget session credit cap (${maxPerSession}) exceeded`);
      case "widget:daily":
        throw new WidgetCapExceededError(`Widget daily credit cap (${maxPerDay}) exceeded`);
      default:
        throw new WidgetCapExceededError(`Widget monthly budget (${monthlyBudget}) exceeded`);
    }
  }
}
