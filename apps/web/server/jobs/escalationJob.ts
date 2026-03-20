/**
 * Escalation Job — BullMQ recurring job that checks for unacknowledged
 * critical notifications past their escalation policy trigger window.
 *
 * Runs every 5 minutes. Creates escalation notifications with
 * metadata.isEscalated=true to bypass preference checks (section-05).
 */

import { Queue, Worker } from "bullmq";
import { eq, and, sql, lte } from "drizzle-orm";
import { getDb } from "../db";
import { getRealtimeClient } from "../services/redisClients";
import {
  escalationPolicies,
  userNotifications,
  users,
} from "../../drizzle/schema";
import { createNotification } from "../services/notificationService";

const QUEUE_NAME = "notification-escalation";

let escalationQueue: Queue | null = null;
let escalationWorker: Worker | null = null;

function isEscalationEnabled(): boolean {
  return process.env.NOTIFICATION_ESCALATION_ENABLED === "true";
}

/**
 * Core escalation check logic — exported separately for direct testing.
 */
export async function executeEscalationCheck(): Promise<void> {
  if (!isEscalationEnabled()) {
    console.log("[escalationJob] escalation_job_skipped", {
      reason: "feature_flag_disabled",
    });
    return;
  }

  const db = getDb();
  const startMs = Date.now();
  let escalationsCreated = 0;

  // 1. Query all enabled escalation policies
  const policies = await db
    .select()
    .from(escalationPolicies)
    .where(eq(escalationPolicies.isEnabled, true));

  if (policies.length === 0) {
    console.log("[escalationJob] escalation_job_completed", {
      escalationsCreated: 0,
      policiesChecked: 0,
      durationMs: Date.now() - startMs,
    });
    return;
  }

  // 2. For each policy, find unacknowledged notifications past trigger window
  for (const policy of policies) {
    const cutoff = new Date(Date.now() - policy.triggerMinutes * 60_000);

    // Tenant-scoped query: join through users to match the policy's tenant
    const notifications = await db
      .select({
        id: userNotifications.id,
        userId: userNotifications.userId,
        title: userNotifications.title,
        content: userNotifications.content,
        priority: userNotifications.priority,
        relatedResourceType: userNotifications.relatedResourceType,
        actionUrl: userNotifications.actionUrl,
        metadata: userNotifications.metadata,
      })
      .from(userNotifications)
      .innerJoin(users, eq(userNotifications.userId, users.id))
      .where(
        and(
          eq(userNotifications.priority, policy.triggerSeverity),
          eq(userNotifications.isRead, false),
          eq(userNotifications.isDismissed, false),
          lte(userNotifications.createdAt, cutoff),
          // Tenant isolation: only match notifications from users in this policy's tenant
          sql`${users.currentTenantId}::text = ${policy.tenantId}`,
          // Exclude already-escalated notifications
          sql`(${userNotifications.metadata}->>'isEscalated') IS DISTINCT FROM 'true'`,
          sql`(${userNotifications.metadata}->>'escalatedAt') IS NULL`
        )
      );

    for (const notif of notifications) {
      // Determine escalation targets
      let targetUserIds: number[] = [];

      if (policy.escalateToUserId) {
        targetUserIds = [policy.escalateToUserId];
      } else if (policy.escalateToRole) {
        // Tenant-scoped: only target users in the same tenant as the policy
        const roleUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.role, policy.escalateToRole),
              sql`${users.currentTenantId}::text = ${policy.tenantId}`
            )
          );
        targetUserIds = roleUsers.map((u) => u.id);
      }

      const escalationTitle =
        policy.escalateMessage ||
        `Escalation: Unacknowledged ${notif.priority} alert`;

      // Create escalation notification for each target
      for (const targetId of targetUserIds) {
        try {
          await createNotification({
            db,
            userId: targetId,
            type: "alert",
            title: escalationTitle,
            content: notif.content,
            priority: "critical",
            relatedResourceType: notif.relatedResourceType as any,
            actionUrl: notif.actionUrl ?? undefined,
            metadata: {
              isEscalated: true,
              escalatedAt: new Date().toISOString(),
              escalatedTo: String(targetId),
              source: "jobs.escalation",
              relatedItems: {
                originalNotificationId: String(notif.id),
                escalationPolicyId: String(policy.id),
                originalUserId: String(notif.userId),
              },
            },
          });
          escalationsCreated++;

          console.log("[escalationJob] notification_escalated", {
            policyId: policy.id,
            originalNotificationId: notif.id,
            targetUserId: targetId,
            triggerMinutes: policy.triggerMinutes,
          });
        } catch (err) {
          console.error(
            "[escalationJob] Failed to create escalation notification:",
            err instanceof Error ? err.message : err
          );
          // Continue processing other targets/notifications
        }
      }

      // Mark original notification as escalated (only if there were targets)
      if (targetUserIds.length > 0) {
        try {
          const escalationMeta = JSON.stringify({
            escalatedAt: new Date().toISOString(),
            escalatedTo: targetUserIds.join(","),
          });
          await db
            .update(userNotifications)
            .set({
              metadata: sql`COALESCE(${userNotifications.metadata}, '{}'::jsonb) || ${escalationMeta}::jsonb`,
            })
            .where(eq(userNotifications.id, notif.id));
        } catch (err) {
          console.error(
            "[escalationJob] Failed to update original notification metadata:",
            err instanceof Error ? err.message : err
          );
        }
      } else {
        console.log("[escalationJob] escalation_no_targets", {
          policyId: policy.id,
          originalNotificationId: notif.id,
        });
      }
    }
  }

  console.log("[escalationJob] escalation_job_completed", {
    escalationsCreated,
    policiesChecked: policies.length,
    durationMs: Date.now() - startMs,
  });
}

/**
 * Initialize the escalation BullMQ queue and worker.
 * Idempotent — safe to call multiple times.
 */
export async function initializeEscalationJob(): Promise<void> {
  if (escalationQueue) return;

  const redis = getRealtimeClient();

  escalationQueue = new Queue(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  // Register repeatable job (every 5 minutes)
  await escalationQueue.upsertJobScheduler(
    "escalation-check",
    { every: 5 * 60 * 1000 },
    { name: "escalation-check" }
  );

  escalationWorker = new Worker(
    QUEUE_NAME,
    async () => {
      await executeEscalationCheck();
    },
    {
      connection: redis.duplicate(),
      concurrency: 1,
    }
  );

  console.log("[escalationJob] Escalation job initialized (every 5 minutes)");
}

/**
 * Gracefully shut down the escalation queue and worker.
 */
export async function shutdownEscalationJob(): Promise<void> {
  if (escalationWorker) {
    await escalationWorker.close();
    escalationWorker = null;
  }
  if (escalationQueue) {
    await escalationQueue.close();
    escalationQueue = null;
  }
}
