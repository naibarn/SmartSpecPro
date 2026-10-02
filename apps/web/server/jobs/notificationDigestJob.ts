/**
 * Notification Digest Job
 *
 * Canonical worker_jobs recurring job that runs every hour, collecting unread notifications
 * for users with email digest preferences and sending digest emails.
 */

import { getDb } from "../db";
import {
  notificationPreferences,
  userNotifications,
  users,
} from "../../drizzle/schema";
import { and, eq, gt, desc, isNotNull } from "drizzle-orm";
import { putEphemeralValue, readEphemeralValue } from "../services/postgresEphemeralStore";
import { sendNotificationDigest } from "../services/notificationEmailService";
import { startFeature186SystemSchedule, stopFeature186SystemSchedule } from "./feature186SystemScheduler";
const DIGEST_LIMIT = 20;
const DIGEST_STATE_TTL_SECONDS = 604800; // 7 days


// ─── Core Logic (exported for testing) ────────────────────────────────────────

interface DigestUser {
  userId: number;
  emailDigestFrequency: string;
  emailDigestHour: number | null;
  email: string;
  name: string | null;
  locale?: string | null;
}

export async function executeDigestRun(): Promise<void> {
  const db = getDb();
  if (!db) {
    console.error("[DigestJob] DB not available, skipping run");
    return;
  }

  let usersProcessed = 0;
  let digestsSent = 0;
  let errors = 0;

  try {
    // Query users with email digest preferences
    const eligibleUsers: DigestUser[] = await db
      .select({
        userId: notificationPreferences.userId,
        emailDigestFrequency: notificationPreferences.emailDigestFrequency,
        emailDigestHour: notificationPreferences.emailDigestHour,
        email: users.email,
        name: users.name,
      })
      .from(notificationPreferences)
      .innerJoin(users, eq(users.id, notificationPreferences.userId))
      .where(
        and(
          eq(notificationPreferences.email, true),
          isNotNull(notificationPreferences.emailDigestFrequency),
        ),
      ) as any;

    const currentHour = new Date().getUTCHours();

    // Deduplicate by userId (a user may have multiple preference rows per category)
    const uniqueUsers = new Map<number, DigestUser>();
    for (const u of eligibleUsers) {
      if (!u.emailDigestFrequency) continue;
      if (!uniqueUsers.has(u.userId)) {
        uniqueUsers.set(u.userId, u);
      }
    }

    for (const [, user] of uniqueUsers) {
      try {
        // Check daily schedule
        if (user.emailDigestFrequency === "daily") {
          const digestHour = user.emailDigestHour ?? 8;
          if (currentHour !== digestHour) continue;
        }

        usersProcessed++;

        // Read the shared last-send timestamp.
        let lastDigestTime: Date;
        try {
          const stored = await readEphemeralValue<string>("notification:digest:last", String(user.userId));
          if (stored) {
            lastDigestTime = new Date(stored);
          } else {
            // Default: 1 hour ago for hourly, 24 hours ago for daily
            const hoursAgo =
              user.emailDigestFrequency === "daily" ? 24 : 1;
            lastDigestTime = new Date(
              Date.now() - hoursAgo * 60 * 60 * 1000,
            );
          }
        } catch {
          // State unavailable — fall back to the existing bounded lookback.
          lastDigestTime = new Date(Date.now() - 60 * 60 * 1000);
        }

        // Query unread notifications since last digest
        const notifications = await db
          .select({
            id: userNotifications.id,
            title: userNotifications.title,
            content: userNotifications.content,
            priority: userNotifications.priority,
            createdAt: userNotifications.createdAt,
            actionUrl: userNotifications.actionUrl,
          })
          .from(userNotifications)
          .where(
            and(
              eq(userNotifications.userId, user.userId),
              eq(userNotifications.isRead, false),
              gt(userNotifications.createdAt, lastDigestTime),
            ),
          )
          .orderBy(desc(userNotifications.createdAt))
          .limit(DIGEST_LIMIT);

        if (notifications.length === 0) continue;

        // Send digest
        const sent = await sendNotificationDigest({
          userEmail: user.email,
          userName: user.name ?? undefined,
          locale: user.locale || "en",
          userId: user.userId,
          notifications: notifications.map((n: any) => ({
            id: n.id,
            title: n.title,
            content: n.content || "",
            priority: n.priority || "normal",
            createdAt: n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt),
            actionUrl: n.actionUrl ?? undefined,
          })),
        });

        if (sent) {
          digestsSent++;
          // Update shared last-send timestamp.
          try {
            await putEphemeralValue(
              "notification:digest:last",
              String(user.userId),
              new Date().toISOString(),
              DIGEST_STATE_TTL_SECONDS,
            );
          } catch {
            // Shared state write failure is non-fatal; the next run has a bounded lookback.
          }
        }
      } catch (err) {
        errors++;
        console.error("[DigestJob] User processing failed (continuing)", {
          userId: user.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error("[DigestJob] Run failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  console.log("[DigestJob] Run complete", {
    usersProcessed,
    digestsSent,
    errors,
  });
}

// ─── Canonical worker_jobs schedule ──────────────────────────────────────────

export async function initializeDigestJob(): Promise<void> {
  startFeature186SystemSchedule({
      scheduleId: "notification-digest",
      jobType: "notification.digest",
      executionClass: "short",
      scheduleVersion: "1",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      isDue: () => true,
      occurrenceKey: now => now.toISOString().slice(0, 13),
      intervalMs: 60_000,
  });
}

export async function shutdownDigestJob(): Promise<void> {
  stopFeature186SystemSchedule("notification-digest");
}
