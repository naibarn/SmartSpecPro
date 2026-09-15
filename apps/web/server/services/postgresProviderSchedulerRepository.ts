import { eq, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { createJobControlPlane } from "./jobControlPlane";
import { workerJobProviderReservations } from "../../drizzle/schema";
import {
  deriveServerUserKey,
  getProviderSchedulerLimits,
  normalizeProviderClass,
  nextFairnessEligibleAt,
} from "./providerSchedulerPolicy";
import type {
  ProviderAdmissionDecision,
  ProviderQueueCandidate,
  ProviderReservation,
  ProviderSchedulerRepository,
} from "./providerSchedulerService";
import type { ProviderPollRecord, ProviderPollRepository, ProviderPollObservation } from "./providerPollerService";

type ProviderRow = Record<string, unknown>;

function rows(value: unknown): ProviderRow[] {
  return Array.isArray(value) ? value as ProviderRow[] : [];
}

function stringValue(row: ProviderRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(row: ProviderRow, key: string): number | null {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(row: ProviderRow, key: string): Date | null {
  const value = row[key];
  if (value instanceof Date) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
}

function providerKind(provider: string): "llm" | "media" {
  return provider.trim().toLowerCase().replace(/[.\-]/g, "_") === "openrouter" ? "llm" : "media";
}

function canonicalProviderName(provider: string): string {
  return normalizeProviderClass(provider) ?? provider.trim().toLowerCase().replace(/[.\-]/g, "_");
}

function activeReservationStatusSql() {
  return sql`('reserved', 'unknown')`;
}

/**
 * PostgreSQL implementation of the provider scheduler ports. It intentionally
 * uses short row-locked transactions and never performs HTTP inside one.
 */
export function createPostgresProviderSchedulerRepository(): ProviderSchedulerRepository & ProviderPollRepository {
  return {
    async findCandidates(input) {
      getDb();
      const result = await (getDb() as any).execute(sql`
        SELECT
          "id" AS "jobId",
          "tenantId",
          "requestedByUserId",
          "attempt" AS "businessAttempt",
          "priority",
          "createdAt",
          COALESCE("inputJson"->>'providerName', "inputJson"->>'provider') AS "provider",
          COALESCE("inputJson"->>'logicalOperation', "jobType") AS "logicalOperation"
        FROM "worker_jobs"
        WHERE "status" = 'queued'
          AND "operatorReviewRequired" = false
          AND COALESCE("inputJson"->>'providerName', "inputJson"->>'provider') IS NOT NULL
        ORDER BY "priority" DESC, "createdAt" ASC, "id" ASC
        LIMIT ${Math.min(2_000, Math.max(1, input.limit * 4))}
      `);
      return rows(result).flatMap(row => {
        const jobId = stringValue(row, "jobId");
        const tenantId = stringValue(row, "tenantId");
        const provider = stringValue(row, "provider");
        if (!jobId || !tenantId || !provider) return [];
        const canonicalProvider = canonicalProviderName(provider);
        const userId = numberValue(row, "requestedByUserId");
        const userKey = userId === null ? `system:${tenantId}` : deriveServerUserKey(tenantId, userId);
        return [{
          jobId,
          tenantId,
          userKey,
          businessAttempt: numberValue(row, "businessAttempt") ?? 1,
          provider: canonicalProvider,
          providerPoolKey: `${providerKind(canonicalProvider)}:${canonicalProvider}:account-pool`,
          logicalOperation: stringValue(row, "logicalOperation") ?? "generate",
          eligibleAt: dateValue(row, "createdAt") ?? input.now,
          priority: numberValue(row, "priority") ?? 0,
          createdAt: dateValue(row, "createdAt") ?? input.now,
        } satisfies ProviderQueueCandidate];
      }).slice(0, input.limit);
    },

    async getCompetitorState(input) {
      getDb();
      const providerName = input.providerPoolKey.split(":")[1] ?? "";
      const limits = getProviderSchedulerLimits(providerName);
      if (!limits) return { capacity: 0, competitorExists: false };
      const active = await (getDb() as any).execute(sql`
        SELECT count(*)::int AS "count"
        FROM "worker_job_provider_reservations"
        WHERE "providerName" = ${providerName}
          AND "reservationKind" = 'running'
          AND "reservationStatus" IN ${activeReservationStatusSql()}
      `);
      const competitors = await (getDb() as any).execute(sql`
        SELECT 1
        FROM "provider_scheduler_states"
        WHERE "providerPoolKey" = ${input.providerPoolKey}
          AND "userKey" <> ${input.userKey}
          AND ("fairnessEligibleAt" IS NULL OR "fairnessEligibleAt" <= ${input.now})
        LIMIT 1
      `);
      return {
        capacity: Math.max(0, limits.providerMaxConcurrent - (numberValue(rows(active)[0] ?? {}, "count") ?? 0)),
        competitorExists: rows(competitors).length > 0,
      };
    },

    async reserve(input): Promise<ProviderAdmissionDecision> {
      const provider = canonicalProviderName(input.candidate.provider);
      const limits = getProviderSchedulerLimits(provider);
      if (!limits) return { kind: "skipped", reason: "provider_policy_missing" };
      const reservation = await db.transaction(async tx => {
        const query = tx as any;
        const [job] = await query.execute(sql`
          SELECT "id", "status", "attempt", "tenantId", "requestedByUserId"
          FROM "worker_jobs"
          WHERE "id" = ${input.candidate.jobId}
          FOR UPDATE
        `);
        if (!job || job.status !== "queued" || Number(job.attempt) !== input.candidate.businessAttempt) return null;

        const [existingReservation] = rows(await query.execute(sql`
          SELECT "id"
          FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey}
          FOR UPDATE
        `));
        if (existingReservation) return null;

        const kind = providerKind(provider);
        const providerPoolKey = `${kind}:${provider}:account-pool`;
        const accountRows = kind === "llm"
          ? await query.execute(sql`
              SELECT a."id", a."limitConfigJson"
              FROM "llm_provider_accounts" a
              JOIN "llm_providers" p ON p."id" = a."providerId"
              WHERE lower(replace(replace(p."providerName", '.', '_'), '-', '_')) = lower(${provider})
                AND a."isEnabled" = true AND a."hasApiKey" = true
                AND (a."cooldownUntil" IS NULL OR a."cooldownUntil" <= ${input.now})
              ORDER BY a."accountSlot" ASC
              LIMIT 5
              FOR UPDATE OF a
            `)
          : await query.execute(sql`
              SELECT a."id", a."limitConfigJson"
              FROM "media_provider_accounts" a
              JOIN "media_providers" p ON p."id" = a."providerId"
              WHERE lower(replace(replace(p."providerName", '.', '_'), '-', '_')) = lower(${provider})
                AND a."isEnabled" = true AND a."hasApiKey" = true
                AND (a."cooldownUntil" IS NULL OR a."cooldownUntil" <= ${input.now})
              ORDER BY a."accountSlot" ASC
              LIMIT 5
              FOR UPDATE OF a
            `);
        for (const account of rows(accountRows)) {
          const accountId = numberValue(account, "id");
          if (accountId === null) continue;
          const runningRows = await query.execute(sql`
            SELECT count(*)::int AS "count"
            FROM "worker_job_provider_reservations"
            WHERE "providerName" = ${provider}
              AND "providerAccountId" = ${accountId}
              AND "reservationKind" = 'running'
              AND "reservationStatus" IN ${activeReservationStatusSql()}
          `);
          const userRows = await query.execute(sql`
            SELECT count(*)::int AS "count"
            FROM "worker_job_provider_reservations"
            WHERE "providerName" = ${provider}
              AND "userKey" = ${input.candidate.userKey}
              AND "reservationKind" = 'running'
              AND "reservationStatus" IN ${activeReservationStatusSql()}
          `);
          const configured = account.limitConfigJson && typeof account.limitConfigJson === "object" ? account.limitConfigJson as Record<string, unknown> : {};
          const accountMax = Number(configured.maxConcurrent ?? limits.providerMaxConcurrent);
          const userMax = Number(configured.perUserMaxConcurrent ?? limits.userMaxConcurrent);
          if ((numberValue(rows(runningRows)[0] ?? {}, "count") ?? 0) >= accountMax) continue;
          if ((numberValue(rows(userRows)[0] ?? {}, "count") ?? 0) >= userMax) continue;

          const windowStartMs = Math.floor(input.now.getTime() / (limits.submissionWindowSeconds * 1_000)) * limits.submissionWindowSeconds * 1_000;
          const windowStart = new Date(windowStartMs);
          const windowRows = await query.execute(sql`
            INSERT INTO "provider_admission_windows" (
              "providerKind", "providerName", "providerAccountId", "windowKind",
              "windowStartedAt", "windowSeconds", "usedCount", "maxCount"
            ) VALUES (${kind}, ${provider}, ${accountId}, 'submission', ${windowStart}, ${limits.submissionWindowSeconds}, 1, ${limits.submissionWindowMax})
            ON CONFLICT ("providerKind", "providerName", "providerAccountId", "windowKind", "windowStartedAt")
            DO UPDATE SET "usedCount" = "provider_admission_windows"."usedCount" + 1, "updatedAt" = now()
            WHERE "provider_admission_windows"."usedCount" < "provider_admission_windows"."maxCount"
            RETURNING "id"
          `);
          if (rows(windowRows).length === 0) continue;

          if (limits.dailyWindowSeconds && limits.dailyWindowMax) {
            const dailyWindowStart = new Date(
              Math.floor(input.now.getTime() / (limits.dailyWindowSeconds * 1_000))
                * limits.dailyWindowSeconds * 1_000,
            );
            const dailyWindowRows = await query.execute(sql`
              INSERT INTO "provider_admission_windows" (
                "providerKind", "providerName", "providerAccountId", "windowKind",
                "windowStartedAt", "windowSeconds", "usedCount", "maxCount"
              ) VALUES (${kind}, ${provider}, ${accountId}, 'daily', ${dailyWindowStart}, ${limits.dailyWindowSeconds}, 1, ${limits.dailyWindowMax})
              ON CONFLICT ("providerKind", "providerName", "providerAccountId", "windowKind", "windowStartedAt")
              DO UPDATE SET "usedCount" = "provider_admission_windows"."usedCount" + 1, "updatedAt" = now()
              WHERE "provider_admission_windows"."usedCount" < "provider_admission_windows"."maxCount"
              RETURNING "id"
            `);
            if (rows(dailyWindowRows).length === 0) {
              await query.execute(sql`
                UPDATE "provider_admission_windows"
                SET "usedCount" = GREATEST(0, "usedCount" - 1), "updatedAt" = now()
                WHERE "providerKind" = ${kind}
                  AND "providerName" = ${provider}
                  AND "providerAccountId" = ${accountId}
                  AND "windowKind" = 'submission'
                  AND "windowStartedAt" = ${windowStart}
              `);
              continue;
            }
          }

          await query.execute(sql`
            INSERT INTO "provider_scheduler_states" ("providerKind", "providerPoolKey", "userKey", "activeCount", "lastServedAt", "fairnessEligibleAt")
            VALUES (${kind}, ${providerPoolKey}, ${input.candidate.userKey}, 1, ${input.now}, ${nextFairnessEligibleAt(input.now, limits.fairnessCooldownMs)})
            ON CONFLICT ("providerPoolKey", "userKey") DO UPDATE SET
              "activeCount" = "provider_scheduler_states"."activeCount" + 1,
              "lastServedAt" = EXCLUDED."lastServedAt",
              "fairnessEligibleAt" = EXCLUDED."fairnessEligibleAt",
              "updatedAt" = now()
          `);
          const reservationRows = await query.execute(sql`
            INSERT INTO "worker_job_provider_reservations" (
              "workerJobId", "attemptId", "businessAttempt", "providerKind", "providerName", "providerAccountId",
              "reservationKind", "reservationStatus", "userKey", "operationKey", "providerDeadlineAt"
            ) VALUES (${input.candidate.jobId}, NULL, ${input.candidate.businessAttempt}, ${kind}, ${provider}, ${accountId}, 'running', 'reserved', ${input.candidate.userKey}, ${input.operationKey}, ${new Date(input.now.getTime() + limits.providerDeadlineMs)})
            ON CONFLICT DO NOTHING
            RETURNING "id"
          `);
          if (rows(reservationRows).length === 0) return null;
          const reservationId = stringValue(rows(reservationRows)[0], "id") ?? input.operationKey;
          return {
            reservationId,
            jobId: input.candidate.jobId,
            businessAttempt: input.candidate.businessAttempt,
            provider,
            providerPoolKey,
            operationKey: input.operationKey,
          } satisfies ProviderReservation;
        }
        return "full" as const;
      });
      if (reservation === "full") return { kind: "full", nextEligibleAt: nextFairnessEligibleAt(input.now, 15_000) };
      if (!reservation) return { kind: "skipped", reason: "job_state_changed_or_duplicate" };
      return { kind: "reserved", reservation };
    },

    async markSubmitted(input) {
      const controlPlane = createJobControlPlane();
      const [existing] = await db.select({
        providerJobId: workerJobProviderReservations.providerJobId,
      }).from(workerJobProviderReservations)
        .where(eq(workerJobProviderReservations.operationKey, input.reservation.operationKey))
        .limit(1);
      if (existing?.providerJobId === input.providerJobId) return;
      if (existing?.providerJobId && existing.providerJobId !== input.providerJobId) {
        throw new Error("PROVIDER_OPERATION_REFERENCE_CONFLICT");
      }
      const held = await controlPlane.holdQueued(input.reservation.jobId, input.reservation.operationKey, "provider_wait");
      if (!held) throw new Error("PROVIDER_JOB_NOT_QUEUED_FOR_EXTERNAL_WAIT");
      try {
        const updated = await db.update(workerJobProviderReservations).set({
          providerJobId: input.providerJobId,
          nextPollAt: input.nextPollAt,
          updatedAt: input.now,
        }).where(sql`"operationKey" = ${input.reservation.operationKey} AND "reservationStatus" = 'reserved'`).returning({ id: workerJobProviderReservations.id });
        if (updated.length === 0) throw new Error("PROVIDER_RESERVATION_NOT_FOUND");
      } catch (error) {
        // The canonical row is already waiting. If the provider reference
        // cannot be persisted, fail closed instead of leaving an unpollable
        // paid operation hidden behind a waiting job.
        await controlPlane.failExternalWait(
          input.reservation.jobId,
          error instanceof Error ? error.message : "provider_reference_persist_failed",
          true,
          input.now,
          input.reservation.operationKey,
        );
        await db.update(workerJobProviderReservations).set({
          reservationStatus: "unknown",
          safeErrorCode: "PROVIDER_REFERENCE_PERSIST_FAILED",
          operatorReviewReason: "provider_reference_persist_failed",
          updatedAt: input.now,
        }).where(sql`"operationKey" = ${input.reservation.operationKey} AND "reservationStatus" = 'reserved'`);
        throw error;
      }
    },

    async markAmbiguous(input) {
      await createJobControlPlane().markProviderSubmissionReview(input.reservation.jobId, input.reservation.operationKey, input.reason, input.now);
      await db.update(workerJobProviderReservations).set({
        reservationStatus: "unknown",
        safeErrorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
        operatorReviewReason: input.reason.slice(0, 500),
        updatedAt: input.now,
      }).where(sql`"operationKey" = ${input.reservation.operationKey} AND "reservationStatus" = 'reserved'`);
    },

    async claimDue(input) {
      getDb();
      const result = await (getDb() as any).execute(sql`
        UPDATE "worker_job_provider_reservations"
        SET "pollerLeaseTokenHash" = encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'),
            "pollerLeaseExpiresAt" = ${new Date(input.now.getTime() + input.leaseMs)},
            "pollAttempt" = "pollAttempt" + 1,
            "updatedAt" = ${input.now}
        WHERE "id" IN (
          SELECT "id" FROM "worker_job_provider_reservations"
          WHERE "reservationKind" = 'running'
            AND "reservationStatus" = 'reserved'
            AND "nextPollAt" IS NOT NULL AND "nextPollAt" <= ${input.now}
            AND ("pollerLeaseExpiresAt" IS NULL OR "pollerLeaseExpiresAt" <= ${input.now})
          ORDER BY "nextPollAt" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${Math.min(500, Math.max(1, input.limit))}
        )
          RETURNING "id" AS "reservationId", "workerJobId" AS "jobId", "attemptId", "providerName" AS "provider", "operationKey", "providerJobId", "pollAttempt", "providerDeadlineAt", "providerKind", "userKey", "pollerLeaseTokenHash",
            (SELECT "attempt" FROM "worker_jobs" WHERE "worker_jobs"."id" = "worker_job_provider_reservations"."workerJobId") AS "businessAttempt"
      `);
      return rows(result).flatMap(row => {
        const providerJobId = stringValue(row, "providerJobId");
        const jobId = stringValue(row, "jobId");
        const provider = stringValue(row, "provider");
        const operationKey = stringValue(row, "operationKey");
        const deadline = dateValue(row, "providerDeadlineAt");
        const pollerLeaseTokenHash = stringValue(row, "pollerLeaseTokenHash");
        const providerPoolKey = `${stringValue(row, "providerKind") ?? providerKind(provider)}:${provider}:account-pool`;
        const userKey = stringValue(row, "userKey");
        if (!providerJobId || !jobId || !provider || !operationKey || !deadline || !providerPoolKey || !userKey || !pollerLeaseTokenHash) return [];
        return [{
          reservationId: stringValue(row, "reservationId") ?? operationKey,
          jobId,
          businessAttempt: numberValue(row, "businessAttempt") ?? 1,
          provider,
          providerPoolKey,
          userKey,
          operationKey,
          providerJobId,
          pollerLeaseTokenHash,
          pollAttempt: numberValue(row, "pollAttempt") ?? 1,
          providerDeadlineAt: deadline,
        } satisfies ProviderPollRecord];
      });
    },

    async recordObservation(input) {
      const controlPlane = createJobControlPlane();
      if (input.observation.status === "completed") {
        await controlPlane.completeExternal(input.record.jobId, input.observation.resultRef, input.record.operationKey, input.now, input.record.pollerLeaseTokenHash);
      } else if (input.observation.status === "failed" || input.observation.status === "cancelled" || input.observation.status === "timeout") {
        await controlPlane.failExternalWait(input.record.jobId, input.observation.safeErrorCode, false, input.now, input.record.operationKey, input.record.pollerLeaseTokenHash);
      }
      const released = await db.update(workerJobProviderReservations).set({
        reservationStatus: input.nextPollAt ? "reserved" : "released",
        nextPollAt: input.nextPollAt,
        lastObservedStatus: input.observation.status,
        lastObservedAt: input.now,
        releasedAt: input.nextPollAt ? null : input.now,
        pollerLeaseTokenHash: null,
        pollerLeaseExpiresAt: null,
        safeErrorCode: input.observation.status === "failed" || input.observation.status === "cancelled" || input.observation.status === "timeout"
          ? input.observation.safeErrorCode
          : null,
        updatedAt: input.now,
      }).where(sql`"id" = ${input.record.reservationId} AND "reservationStatus" = 'reserved' AND "pollerLeaseTokenHash" = ${input.record.pollerLeaseTokenHash}`).returning({ id: workerJobProviderReservations.id });
      if (!input.nextPollAt && released.length > 0) {
        await (getDb() as any).execute(sql`
          UPDATE "provider_scheduler_states"
          SET "activeCount" = GREATEST(0, "activeCount" - 1), "updatedAt" = ${input.now}
          WHERE "providerPoolKey" = ${input.record.providerPoolKey}
            AND "userKey" = ${input.record.userKey}
        `);
      }
    },

    async recordUnknown(input) {
      await createJobControlPlane().failExternalWait(input.record.jobId, input.reason, true, input.now, input.record.operationKey, input.record.pollerLeaseTokenHash);
      await db.update(workerJobProviderReservations).set({
        reservationStatus: "unknown",
        safeErrorCode: "PROVIDER_POLL_AMBIGUOUS",
        operatorReviewReason: input.reason.slice(0, 500),
        lastObservedStatus: "unknown",
        lastObservedAt: input.now,
        pollerLeaseTokenHash: null,
        pollerLeaseExpiresAt: null,
        updatedAt: input.now,
      }).where(sql`"id" = ${input.record.reservationId} AND "reservationStatus" = 'reserved' AND "pollerLeaseTokenHash" = ${input.record.pollerLeaseTokenHash}`);
    },
  };
}

/**
 * Compatibility bridge for Python media executors that already submitted a
 * provider operation before the durable scheduler was enabled. It records
 * the operation in the same poll ledger without creating another job.
 */
export async function registerPostgresProviderOperation(input: {
  jobId: string;
  operationKey: string;
  provider: string;
  providerJobId: string;
  nextPollAt: Date;
  providerDeadlineAt: Date;
}): Promise<boolean> {
  const normalizedProvider = canonicalProviderName(input.provider);
  if (!normalizedProvider || !input.operationKey.trim() || !input.providerJobId.trim()) return false;
  const limits = getProviderSchedulerLimits(normalizedProvider);
  if (!limits) return false;
  return db.transaction(async tx => {
    const query = tx as any;
    const [job] = rows(await query.execute(sql`
      SELECT "id", "status", "attempt", "tenantId", "requestedByUserId", "progressJson"
      FROM "worker_jobs"
      WHERE "id" = ${input.jobId}
      FOR UPDATE
    `));
    if (!job || stringValue(job, "status") !== "waiting_external") return false;
    const progress = job.progressJson && typeof job.progressJson === "object" && !Array.isArray(job.progressJson)
      ? job.progressJson as { externalWait?: { operationKey?: string } }
      : {};
    if (progress.externalWait?.operationKey !== input.operationKey) return false;

    const [existing] = rows(await query.execute(sql`
      SELECT "id", "providerJobId"
      FROM "worker_job_provider_reservations"
      WHERE "operationKey" = ${input.operationKey}
      FOR UPDATE
    `));
    if (existing) return stringValue(existing, "providerJobId") === input.providerJobId;

    const userId = numberValue(job, "requestedByUserId");
    const tenantId = stringValue(job, "tenantId") ?? "system";
    const userKey = userId === null ? `system:${tenantId}` : deriveServerUserKey(tenantId, userId);
    const kind = providerKind(normalizedProvider);
    const poolKey = `${kind}:${normalizedProvider}:account-pool`;
    const inserted = rows(await query.execute(sql`
      INSERT INTO "worker_job_provider_reservations" (
        "workerJobId", "attemptId", "businessAttempt", "providerKind", "providerName", "providerAccountId",
        "reservationKind", "reservationStatus", "userKey", "operationKey", "providerJobId",
        "nextPollAt", "providerDeadlineAt"
      ) VALUES (
        ${input.jobId}, NULL, ${numberValue(job, "attempt") ?? 1}, ${kind}, ${normalizedProvider}, NULL,
        'running', 'reserved', ${userKey}, ${input.operationKey}, ${input.providerJobId},
        ${input.nextPollAt}, ${input.providerDeadlineAt}
      )
      RETURNING "id"
    `));
    if (inserted.length === 0) return false;
    await query.execute(sql`
      INSERT INTO "provider_scheduler_states" (
        "providerKind", "providerPoolKey", "userKey", "activeCount", "lastServedAt", "fairnessEligibleAt"
      ) VALUES (${kind}, ${poolKey}, ${userKey}, 1, now(), ${nextFairnessEligibleAt(new Date(), limits.fairnessCooldownMs)})
      ON CONFLICT ("providerPoolKey", "userKey") DO UPDATE SET
        "activeCount" = "provider_scheduler_states"."activeCount" + 1,
        "updatedAt" = now()
    `);
    return true;
  });
}
