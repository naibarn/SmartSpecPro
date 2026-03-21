/**
 * Notification Digest Job
 *
 * BullMQ recurring job that runs every hour, collecting unread notifications
 * for users with email digest preferences and sending digest emails.
 */

import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { getDb } from "../db";
import {
  notificationPreferences,
  userNotifications,
  users,
} from "../../drizzle/schema";
import { and, eq, gt, desc, isNotNull } from "drizzle-orm";
import { getRedisClient } from "../services/redis";
import { sendNotificationDigest } from "../services/notificationEmailService";

const QUEUE_NAME = "notification-digest";
const DIGEST_LIMIT = 20;
const REDIS_TTL = 604800; // 7 days in seconds

let queue: Queue | null = null;
let worker: Worker | null = null;

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

  const redis = getRedisClient();
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

        // Read last digest timestamp from Redis
        const redisKey = `notification:digest:last:${user.userId}`;
        let lastDigestTime: Date;
        try {
          const stored = redis ? await redis.get(redisKey) : null;
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
          // Redis unavailable — fall back to 1 hour ago
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
          // Update Redis timestamp
          try {
            if (redis) {
              await redis.set(
                redisKey,
                new Date().toISOString(),
                "EX",
                REDIS_TTL,
              );
            }
          } catch {
            // Redis write failure is non-fatal
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

// ─── BullMQ Initialization ───────────────────────────────────────────────────

export async function initializeDigestJob(): Promise<void> {
  if (queue) return; // Already initialized

  const redis = getRedisClient();
  if (!redis) {
    console.warn("[DigestJob] Redis not available, skipping digest job init");
    return;
  }

  // Pass IORedis instance directly as connection — avoids issues with URL-based configs
  const connection = redis.duplicate();

  queue = new Queue(QUEUE_NAME, { connection: connection as any });

  // Add repeatable job: every hour (3600000ms)
  await queue.add(
    "digest-run",
    {},
    {
      repeat: { every: 3_600_000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      await executeDigestRun();
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error("[DigestJob] Job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  console.log("[DigestJob] Initialized with hourly schedule");
}

export async function shutdownDigestJob(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
