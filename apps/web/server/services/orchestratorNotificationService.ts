/**
 * Orchestrator Notification Service — persistent notifications for team events.
 */

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  orchestratorNotifications,
  type OrchestratorNotification,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  tenantId: string;
  userId: number;
  teamId?: string;
  roomId?: string;
  runId?: string;
  notificationType: string;
  severity?: "info" | "warning" | "error" | "critical";
  title: string;
  body?: string;
  actionUrl?: string;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createNotification(
  input: CreateNotificationInput,
): Promise<OrchestratorNotification> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [notification] = await db
    .insert(orchestratorNotifications)
    .values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      teamId: input.teamId ?? null,
      roomId: input.roomId ?? null,
      runId: input.runId ?? null,
      notificationType: input.notificationType,
      severity: (input.severity as any) ?? "info",
      title: input.title,
      body: input.body ?? null,
      actionUrl: input.actionUrl ?? null,
    })
    .returning();

  // TODO: Publish to Redis for SSE delivery (Section 11)

  return notification;
}

export async function markAsRead(
  notificationId: string,
  userId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(orchestratorNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(orchestratorNotifications.id, notificationId),
        eq(orchestratorNotifications.userId, userId),
      ),
    );
}

export async function dismissNotification(
  notificationId: string,
  userId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(orchestratorNotifications)
    .set({ isDismissed: true })
    .where(
      and(
        eq(orchestratorNotifications.id, notificationId),
        eq(orchestratorNotifications.userId, userId),
      ),
    );
}

export async function getUnreadNotifications(
  userId: number,
  tenantId: string,
  limit: number = 50,
): Promise<OrchestratorNotification[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(orchestratorNotifications)
    .where(
      and(
        eq(orchestratorNotifications.userId, userId),
        eq(orchestratorNotifications.tenantId, tenantId),
        eq(orchestratorNotifications.isRead, false),
        eq(orchestratorNotifications.isDismissed, false),
      ),
    )
    .orderBy(desc(orchestratorNotifications.createdAt))
    .limit(limit);
}

export async function getNotifications(
  userId: number,
  tenantId: string,
  options: { limit?: number; includeRead?: boolean } = {},
): Promise<OrchestratorNotification[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [
    eq(orchestratorNotifications.userId, userId),
    eq(orchestratorNotifications.tenantId, tenantId),
    eq(orchestratorNotifications.isDismissed, false),
  ];

  if (!options.includeRead) {
    conditions.push(eq(orchestratorNotifications.isRead, false));
  }

  return db
    .select()
    .from(orchestratorNotifications)
    .where(and(...conditions))
    .orderBy(desc(orchestratorNotifications.createdAt))
    .limit(options.limit ?? 50);
}
