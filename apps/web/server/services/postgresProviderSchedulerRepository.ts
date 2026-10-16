import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { appendJobEvent, createJobControlPlane } from "./jobControlPlane";
import { workerJobProviderReservations } from "../../drizzle/schema";
import {
  deriveServerUserKey,
  getCodexSubscriptionAdmissionLimits,
  getProviderSchedulerLimits,
  normalizeProviderClass,
  nextFairnessEligibleAt,
} from "./providerSchedulerPolicy";
import type {
  ProviderAdmissionDecision,
  ProviderQueueCandidate,
  ProviderReservation,
  ProviderSchedulerRepository,
  CodexModelAdmissionRepository,
  CodexModelUsageCorrectionRepository,
  CodexModelCallInput,
  CodexModelUsage,
} from "./providerSchedulerService";
import type { ProviderPollRecord, ProviderPollRepository, ProviderPollObservation } from "./providerPollerService";

type ProviderRow = Record<string, unknown>;

function hashLeaseToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function codexModelCallOperationKey(jobId: string, runId: string, modelCallId: string): string {
  const material = `${jobId}\0${runId}\0${modelCallId}`;
  return `spec224-codex-turn:${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

function validNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function modelCallAuthorityBound(job: ProviderRow, input: CodexModelCallInput): boolean {
  if (stringValue(job, "status") !== "running" ||
      numberValue(job, "attempt") === null ||
      stringValue(job, "tenantId") === null) return false;
  const inputJson = objectValue(job.inputJson) ?? {};
  const run = inputJson.developerWorkUnit && typeof inputJson.developerWorkUnit === "object" && !Array.isArray(inputJson.developerWorkUnit)
    ? inputJson.developerWorkUnit as Record<string, unknown>
    : null;
  return Boolean(
    stringValue(job, "jobType") === "developer.fast_lane" &&
    run?.runId === input.runId &&
    run?.workerJobId === input.lease.jobId &&
    run?.tenantId === job.tenantId &&
    Number(run?.actorId) === numberValue(job, "requestedByUserId") &&
    run?.contractVersion === "developer-fast-lane-v1"
  );
}

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

function timestampParameter(value: Date): string {
  return value.toISOString();
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
export function createPostgresProviderSchedulerRepository(): ProviderSchedulerRepository & ProviderPollRepository & CodexModelAdmissionRepository & CodexModelUsageCorrectionRepository {
  return {
    async reserveCodexModelCall(input) {
      const now = input.now ?? new Date();
      const limits = getCodexSubscriptionAdmissionLimits();
      if (input.requestedModel !== "gpt-6-luna" || input.reasoningEffort !== "medium") {
        return { kind: "denied", reason: "model_policy" };
      }
      if (!input.modelCallId.trim() || input.modelCallId.length > 160 ||
          !input.runId.trim() || input.runId.length > 160 ||
          !input.phase.trim() || input.phase.length > 40 ||
          !input.role.trim() || input.role.length > 64 ||
          !Number.isSafeInteger(input.promptBytes) || input.promptBytes < 0 || input.promptBytes > 1_000_000) {
        return { kind: "denied", reason: "idempotency_conflict" };
      }
      // This is only a local admission estimate: UTF-8 prompt bytes plus a
      // configured output allowance. It is not provider tokenization or a hard cap.
      const operationKey = codexModelCallOperationKey(input.lease.jobId, input.runId, input.modelCallId);
      const reservedTokens = input.promptBytes + limits.maxOutputTokensPerTurn;
      if (reservedTokens > limits.maxTokensPerWindow) {
        return { kind: "waiting_budget", operationKey, reason: "token_budget", nextEligibleAt: new Date(now.getTime() + limits.windowSeconds * 1_000) };
      }
      const tokenWindowStartedAt = new Date(Math.floor(now.getTime() / (limits.windowSeconds * 1_000)) * limits.windowSeconds * 1_000);
      return db.transaction(async tx => {
        const query = tx as any;
        const [job] = rows(await query.execute(sql`
          SELECT j."id", j."tenantId", j."requestedByUserId", j."jobType", j."status", j."attempt",
                 j."leaseOwnerToken", j."leaseExpiresAt", j."fencingVersion", j."inputJson",
                 a."id" AS "activeAttemptId", a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j
          JOIN "worker_job_attempts" a ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId}
          FOR UPDATE OF j, a
        `));
        if (!job || !modelCallAuthorityBound(job, input) ||
            stringValue(job, "status") !== "running" ||
            numberValue(job, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(job, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(job, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(job, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(job, "leaseExpiresAt") || dateValue(job, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }

        if (!stringValue(job, "tenantId")) return { kind: "denied", reason: "run_binding" };
        const poolKey = "llm:codex_subscription:shared";
        // Account identity is not exposed by the Codex SDK. Use one conservative
        // installation-wide bucket so distinct WorkUnit owners cannot each
        // reserve an independent copy of the same local budget.
        const userKey = "codex_subscription:shared";
        await query.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userKey}))`);
        const existing = rows(await query.execute(sql`
          SELECT "id", "modelCallId", "modelPhase", "modelRole", "requestedModel", "reasoningEffort", "modelSelectionJson",
                 "reservedTokens", "tokenWindowStartedAt", "dispatchState", "threadId", "turnId", "usageState",
                 "attemptId", "businessAttempt", "leaseFencingVersion", "reservationStatus"
          FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${operationKey}
          FOR UPDATE
        `))[0];
        if (existing) {
          if (stringValue(existing, "modelCallId") !== input.modelCallId ||
              stringValue(existing, "modelPhase") !== input.phase ||
              stringValue(existing, "modelRole") !== input.role ||
              stringValue(existing, "requestedModel") !== input.requestedModel ||
              stringValue(existing, "reasoningEffort") !== input.reasoningEffort ||
              stableJson(objectValue(existing.modelSelectionJson)) !== stableJson(input.selection ?? null)) {
            return { kind: "denied", reason: "idempotency_conflict" };
          }
          if (stringValue(existing, "dispatchState") && stringValue(existing, "dispatchState") !== "reserved") {
            return {
              kind: "reconcile_required",
              operationKey,
              threadId: stringValue(existing, "threadId"),
              turnId: stringValue(existing, "turnId"),
            };
          }
          if (numberValue(existing, "leaseFencingVersion") !== input.lease.fencingVersion) {
            if (stringValue(existing, "reservationStatus") !== "reserved" ||
                stringValue(existing, "usageState") !== "reserved") {
              return { kind: "denied", reason: "stale_lease" };
            }
            // A reservation proven not to have reached dispatch is safe to
            // rebind to the newly claimed canonical attempt.
            await query.execute(sql`
              UPDATE "worker_job_provider_reservations"
              SET "attemptId" = ${input.lease.attemptId}, "businessAttempt" = ${numberValue(job, "attempt")},
                  "leaseFencingVersion" = ${input.lease.fencingVersion}, "updatedAt" = ${timestampParameter(now)}
              WHERE "operationKey" = ${operationKey} AND "reservationKind" = 'model_call'
                AND "dispatchState" = 'reserved' AND "reservationStatus" = 'reserved' AND "usageState" = 'reserved'
            `);
          }
          return {
            kind: "reserved",
            operationKey,
            reservedTokens: numberValue(existing, "reservedTokens") ?? reservedTokens,
            tokenWindowStartedAt: dateValue(existing, "tokenWindowStartedAt") ?? tokenWindowStartedAt,
            replayed: true,
          };
        }

        await query.execute(sql`
          INSERT INTO "provider_scheduler_states" ("providerKind", "providerPoolKey", "userKey", "activeCount")
          VALUES ('llm', ${poolKey}, ${userKey}, 0)
          ON CONFLICT ("providerPoolKey", "userKey") DO NOTHING
        `);
        await query.execute(sql`
          SELECT "id" FROM "provider_scheduler_states"
          WHERE "providerPoolKey" = ${poolKey} AND "userKey" = ${userKey}
          FOR UPDATE
        `);
        const activeRows = rows(await query.execute(sql`
          SELECT count(*)::int AS "count"
          FROM "worker_job_provider_reservations" r
          WHERE r."providerName" = 'codex_subscription'
            AND r."userKey" = ${userKey}
            AND r."reservationKind" = 'model_call'
            AND r."reservationStatus" IN ('reserved', 'unknown')
        `));
        if ((numberValue(activeRows[0] ?? {}, "count") ?? 0) >= limits.maxConcurrentTurnsPerUser) {
          return {
            kind: "waiting_budget",
            operationKey,
            reason: "concurrent_capacity",
            // Unsettled turns keep their slot until the token window rotates;
            // expired execution leases alone do not prove the provider turn ended.
            nextEligibleAt: new Date(tokenWindowStartedAt.getTime() + limits.windowSeconds * 1_000),
          };
        }
        const spentRows = rows(await query.execute(sql`
          SELECT COALESCE(sum(
            CASE WHEN "usageState" = 'known'
              THEN COALESCE("inputTokens", 0) + COALESCE("outputTokens", 0)
              WHEN "usageState" = 'not_dispatched' THEN 0
              ELSE COALESCE("reservedTokens", 0)
            END
          ), 0)::bigint AS "spentTokens"
          FROM "worker_job_provider_reservations"
          WHERE "providerName" = 'codex_subscription' AND "userKey" = ${userKey}
            AND "reservationKind" = 'model_call'
            AND "tokenWindowStartedAt" = ${timestampParameter(tokenWindowStartedAt)}
        `));
        const spentTokens = numberValue(spentRows[0] ?? {}, "spentTokens") ?? 0;
        if (spentTokens + reservedTokens > limits.maxTokensPerWindow) {
          return {
            kind: "waiting_budget",
            operationKey,
            reason: "token_budget",
            nextEligibleAt: new Date(tokenWindowStartedAt.getTime() + limits.windowSeconds * 1_000),
          };
        }

        await query.execute(sql`
          INSERT INTO "worker_job_provider_reservations" (
            "workerJobId", "attemptId", "businessAttempt", "providerKind", "providerName",
            "reservationKind", "reservationStatus", "userKey", "operationKey", "modelCallId",
            "leaseFencingVersion", "dispatchState", "modelPhase", "modelRole", "requestedModel",
            "reasoningEffort", "modelSelectionJson", "threadId", "tokenWindowStartedAt", "reservedTokens", "usageState"
          ) VALUES (
            ${input.lease.jobId}, ${input.lease.attemptId}, ${numberValue(job, "attempt")}, 'llm', 'codex_subscription',
            'model_call', 'reserved', ${userKey}, ${operationKey}, ${input.modelCallId},
            ${input.lease.fencingVersion}, 'reserved', ${input.phase}, ${input.role}, ${input.requestedModel},
            ${input.reasoningEffort}, ${JSON.stringify(input.selection ?? null)}::jsonb, ${input.threadId ?? null}, ${timestampParameter(tokenWindowStartedAt)}, ${reservedTokens}, 'reserved'
          )
        `);
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_TURN_RESERVED",
          eventIdempotencyKey: `${operationKey}:reserved`,
          payloadJson: {
            operationKey, runId: input.runId, modelCallId: input.modelCallId,
            phase: input.phase, role: input.role, requestedModel: input.requestedModel,
            reasoningEffort: input.reasoningEffort, selection: input.selection ?? null,
            reservationEstimateTokens: reservedTokens,
            reservationBasis: "utf8_prompt_bytes_plus_configured_output_allowance",
            tokenWindowStartedAt: tokenWindowStartedAt.toISOString(),
            localEstimatedAdmissionBudget: limits.maxTokensPerWindow,
          },
        });
        return { kind: "reserved", operationKey, reservedTokens, tokenWindowStartedAt, replayed: false };
      });
    },

    async markCodexModelCallDispatching(input) {
      const now = input.now ?? new Date();
      return db.transaction(async tx => {
        const query = tx as any;
        const [active] = rows(await query.execute(sql`
          SELECT j."status", j."leaseOwnerToken", j."leaseExpiresAt", j."fencingVersion", a."id" AS "attemptId", a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j JOIN "worker_job_attempts" a ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId} FOR UPDATE OF j, a
        `));
        if (!active || stringValue(active, "status") !== "running" ||
            numberValue(active, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(active, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(active, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(active, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(active, "leaseExpiresAt") || dateValue(active, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }
        const reservationRows = rows(await query.execute(sql`
          SELECT "workerJobId", "attemptId", "leaseFencingVersion", "dispatchState", "threadId", "turnId"
          FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call'
          FOR UPDATE
        `));
        const reservation = reservationRows[0];
        if (!reservation || stringValue(reservation, "workerJobId") !== input.lease.jobId ||
            numberValue(reservation, "leaseFencingVersion") !== input.lease.fencingVersion) {
          return { kind: "denied", reason: "reservation_missing" };
        }
        if (stringValue(reservation, "dispatchState") !== "reserved") return { kind: "duplicate" };
        await query.execute(sql`
          UPDATE "worker_job_provider_reservations"
          SET "dispatchState" = 'dispatching', "threadId" = COALESCE(${input.threadId ?? null}, "threadId"), "updatedAt" = ${timestampParameter(now)}
          WHERE "operationKey" = ${input.operationKey} AND "reservationStatus" = 'reserved'
        `);
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_TURN_DISPATCHING",
          eventIdempotencyKey: `${input.operationKey}:dispatching`,
          payloadJson: { operationKey: input.operationKey, threadId: input.threadId ?? null },
        });
        return { kind: "marked" };
      });
    },

    async recordCodexModelThreadIdentity(input) {
      const now = input.now ?? new Date();
      return db.transaction(async tx => {
        const query = tx as any;
        const [active] = rows(await query.execute(sql`
          SELECT j."status", j."leaseOwnerToken", j."leaseExpiresAt", j."fencingVersion", a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j JOIN "worker_job_attempts" a ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId} FOR UPDATE OF j, a
        `));
        if (!active || stringValue(active, "status") !== "running" ||
            numberValue(active, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(active, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(active, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(active, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(active, "leaseExpiresAt") || dateValue(active, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }
        const [reservation] = rows(await query.execute(sql`
          SELECT "workerJobId", "leaseFencingVersion", "dispatchState", "threadId"
          FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call' FOR UPDATE
        `));
        if (!reservation || stringValue(reservation, "workerJobId") !== input.lease.jobId) {
          return { kind: "denied", reason: "reservation_missing" };
        }
        const priorThread = stringValue(reservation, "threadId");
        if (priorThread && priorThread !== input.threadId) return { kind: "denied", reason: "thread_conflict" };
        if (priorThread) return { kind: "duplicate" };
        if (stringValue(reservation, "dispatchState") !== "dispatching") return { kind: "denied", reason: "reservation_missing" };
        if (numberValue(reservation, "leaseFencingVersion") !== input.lease.fencingVersion && !input.reconcile) {
          return { kind: "denied", reason: "reservation_missing" };
        }
        await query.execute(sql`
          UPDATE "worker_job_provider_reservations" SET "threadId" = ${input.threadId}, "updatedAt" = ${timestampParameter(now)}
          WHERE "operationKey" = ${input.operationKey} AND "reservationStatus" = 'reserved'
        `);
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_THREAD_CREATED",
          eventIdempotencyKey: `${input.operationKey}:thread-created`,
          payloadJson: { operationKey: input.operationKey, threadId: input.threadId },
        });
        return { kind: "recorded" };
      });
    },

    async recordCodexModelTurnIdentity(input) {
      const now = input.now ?? new Date();
      return db.transaction(async tx => {
        const query = tx as any;
        const [active] = rows(await query.execute(sql`
          SELECT j."status", j."attempt" AS "businessAttempt", j."leaseOwnerToken", j."leaseExpiresAt", j."fencingVersion", a."id" AS "attemptId", a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j JOIN "worker_job_attempts" a ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId} FOR UPDATE OF j, a
        `));
        if (!active || stringValue(active, "status") !== "running" ||
            numberValue(active, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(active, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(active, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(active, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(active, "leaseExpiresAt") || dateValue(active, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }
        const [reservation] = rows(await query.execute(sql`
          SELECT "workerJobId", "leaseFencingVersion", "dispatchState", "threadId", "turnId"
          FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call'
          FOR UPDATE
        `));
        if (!reservation || stringValue(reservation, "workerJobId") !== input.lease.jobId) {
          return { kind: "denied", reason: "reservation_missing" };
        }
        const priorThread = stringValue(reservation, "threadId");
        const priorTurn = stringValue(reservation, "turnId");
        if ((priorThread && priorThread !== input.threadId) || (priorTurn && priorTurn !== input.turnId)) {
          return { kind: "denied", reason: "turn_conflict" };
        }
        if (priorTurn) return { kind: "duplicate" };
        if (stringValue(reservation, "dispatchState") !== "dispatching") return { kind: "denied", reason: "reservation_missing" };
        if (numberValue(reservation, "leaseFencingVersion") !== input.lease.fencingVersion) {
          if (!input.reconcile || !priorThread || priorThread !== input.threadId) {
            return { kind: "denied", reason: "reservation_missing" };
          }
          await query.execute(sql`
            UPDATE "worker_job_provider_reservations"
            SET "attemptId" = ${input.lease.attemptId}, "businessAttempt" = ${numberValue(active, "businessAttempt")},
                "leaseFencingVersion" = ${input.lease.fencingVersion}, "dispatchState" = 'started',
                "turnId" = ${input.turnId}, "updatedAt" = ${timestampParameter(now)}
            WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call'
          `);
          await appendJobEvent(query, {
            workerJobId: input.lease.jobId,
            attemptId: input.lease.attemptId,
            eventType: "CODEX_MODEL_TURN_RECONCILED",
            eventIdempotencyKey: `${input.operationKey}:turn-reconciled:${input.lease.fencingVersion}`,
            payloadJson: { operationKey: input.operationKey, threadId: input.threadId, turnId: input.turnId, priorFencingVersion: numberValue(reservation, "leaseFencingVersion"), fencingVersion: input.lease.fencingVersion },
          });
          return { kind: "recorded" };
        }
        await query.execute(sql`
          UPDATE "worker_job_provider_reservations"
          SET "dispatchState" = 'started', "threadId" = ${input.threadId}, "turnId" = ${input.turnId}, "updatedAt" = ${timestampParameter(now)}
          WHERE "operationKey" = ${input.operationKey} AND "reservationStatus" = 'reserved'
        `);
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_TURN_STARTED",
          eventIdempotencyKey: `${input.operationKey}:turn-started`,
          payloadJson: { operationKey: input.operationKey, threadId: input.threadId, turnId: input.turnId },
        });
        return { kind: "recorded" };
      });
    },

    async settleCodexModelCall(input) {
      const now = input.now ?? new Date();
      return db.transaction(async tx => {
        const query = tx as any;
        const [job] = rows(await query.execute(sql`
          SELECT j."id", j."tenantId", j."requestedByUserId", j."jobType", j."status", j."attempt",
                 j."leaseOwnerToken", j."leaseExpiresAt", j."fencingVersion", j."inputJson",
                 a."id" AS "activeAttemptId", a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j
          JOIN "worker_job_attempts" a ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId}
          FOR UPDATE OF j, a
        `));
        if (!job || stringValue(job, "status") !== "running" ||
            numberValue(job, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(job, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(job, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(job, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(job, "leaseExpiresAt") || dateValue(job, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }
        const jobInput = objectValue(job.inputJson) ?? {};
        const devRun = jobInput.developerWorkUnit && typeof jobInput.developerWorkUnit === "object" && !Array.isArray(jobInput.developerWorkUnit)
          ? jobInput.developerWorkUnit as Record<string, unknown>
          : null;
        if (stringValue(job, "jobType") !== "developer.fast_lane" ||
            devRun?.contractVersion !== "developer-fast-lane-v1" ||
            devRun.runId !== input.runId || devRun.workerJobId !== input.lease.jobId ||
            devRun.tenantId !== stringValue(job, "tenantId") ||
            Number(devRun.actorId) !== numberValue(job, "requestedByUserId")) {
          return { kind: "denied", reason: "reservation_missing" };
        }
        const [reservation] = rows(await query.execute(sql`
          SELECT * FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey} AND "workerJobId" = ${input.lease.jobId}
            AND "reservationKind" = 'model_call'
          FOR UPDATE
        `));
        if (!reservation) return { kind: "denied", reason: "reservation_missing" };
        const storedTurnId = stringValue(reservation, "turnId");
        const storedThreadId = stringValue(reservation, "threadId");
        const reservationFence = numberValue(reservation, "leaseFencingVersion");
        const fenceChanged = reservationFence !== input.lease.fencingVersion;
        if (fenceChanged && (!input.reconcile || !storedTurnId || input.usage?.turnId !== storedTurnId)) {
          return { kind: "denied", reason: "stale_lease" };
        }
        if (input.usage?.turnId && storedTurnId && input.usage.turnId !== storedTurnId) {
          return { kind: "denied", reason: "receipt_conflict" };
        }
        if (input.usage?.threadId && storedThreadId && input.usage.threadId !== storedThreadId) {
          return { kind: "denied", reason: "receipt_conflict" };
        }
        if (!input.usage) {
          const charged = numberValue(reservation, "reservedTokens") ?? 0;
          if (!["dispatching", "started", "unknown"].includes(stringValue(reservation, "dispatchState") ?? "")) {
            return { kind: "denied", reason: "receipt_conflict" };
          }
          if (stringValue(reservation, "usageState") === "known") {
            return { kind: "denied", reason: "receipt_conflict" };
          }
          await query.execute(sql`
            UPDATE "worker_job_provider_reservations"
            SET "reservationStatus" = 'unknown', "usageState" = 'unknown',
                "dispatchState" = 'unknown', "updatedAt" = ${timestampParameter(now)}
            WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call'
          `);
          await appendJobEvent(query, {
            workerJobId: input.lease.jobId,
            attemptId: input.lease.attemptId,
            eventType: "CODEX_MODEL_USAGE_UNKNOWN",
            eventIdempotencyKey: `${input.operationKey}:usage-unknown`,
            payloadJson: {
              operationKey: input.operationKey,
              runId: input.runId,
              modelCallId: reservation.modelCallId,
              conservativeTokens: charged,
              usageUnknown: true,
            },
          });
          return { kind: "unknown", operationKey: input.operationKey, conservativelyChargedTokens: charged };
        }
        const usage = input.usage;
        if (!validNonNegativeInteger(usage.inputTokens) ||
            !validNonNegativeInteger(usage.cachedInputTokens) ||
            usage.cachedInputTokens > usage.inputTokens ||
            !validNonNegativeInteger(usage.outputTokens) ||
            !usage.turnId.trim() || usage.turnId.length > 160 || storedTurnId !== usage.turnId ||
            (stringValue(reservation, "usageState") !== "known" &&
              !["started", "unknown"].includes(stringValue(reservation, "dispatchState") ?? "")) ||
            !usage.observedAt.trim() || !Number.isFinite(Date.parse(usage.observedAt)) ||
            !usage.threadId || usage.threadId.length > 160 || storedThreadId !== usage.threadId ||
            (usage.effectiveModel !== undefined && usage.effectiveModel !== null &&
              (typeof usage.effectiveModel !== "string" || usage.effectiveModel.length > 120))) {
          return { kind: "denied", reason: "receipt_conflict" };
        }
        const normalizedReceipt = {
          schemaVersion: "codex-model-usage.v1",
          modelCallId: reservation.modelCallId,
          requestedModel: reservation.requestedModel,
          effectiveModel: usage.effectiveModel ?? null,
          selection: objectValue(reservation.modelSelectionJson),
          role: reservation.modelRole,
          phase: reservation.modelPhase,
          threadId: usage.threadId,
          turnId: usage.turnId,
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          reservationEstimateTokens: numberValue(reservation, "reservedTokens") ?? 0,
          actualTotalTokens: usage.inputTokens + usage.outputTokens,
          overrunTokens: Math.max(0, usage.inputTokens + usage.outputTokens - (numberValue(reservation, "reservedTokens") ?? 0)),
          reservationBasis: "utf8_prompt_bytes_plus_configured_output_allowance",
          usageState: "known",
          observedAt: usage.observedAt,
        };
        if (stringValue(reservation, "usageState") === "known") {
          const priorReceipt = objectValue(reservation.usageReceiptJson);
          if (!priorReceipt || stableJson(priorReceipt) !== stableJson(normalizedReceipt)) {
            return { kind: "denied", reason: "receipt_conflict" };
          }
          // A later audited correction changes the accounting projection, never
          // this historical receipt. Replay must not refund the correction.
          return { kind: "duplicate", operationKey: input.operationKey,
            chargedTokens: Number(reservation.inputTokens) + Number(reservation.outputTokens) };
        }
        const chargedTokens = usage.inputTokens + usage.outputTokens;
        const reservationEstimateTokens = numberValue(reservation, "reservedTokens") ?? 0;
        const overrunTokens = Math.max(0, chargedTokens - reservationEstimateTokens);
        await query.execute(sql`
          UPDATE "worker_job_provider_reservations"
          SET "reservationStatus" = 'released', "usageState" = 'known', "dispatchState" = 'settled',
              "inputTokens" = ${usage.inputTokens}, "cachedInputTokens" = ${usage.cachedInputTokens},
              "outputTokens" = ${usage.outputTokens}, "threadId" = COALESCE(${usage.threadId}, "threadId"),
              "turnId" = ${usage.turnId}, "usageReceiptJson" = ${JSON.stringify(normalizedReceipt)}::jsonb,
              "releasedAt" = ${timestampParameter(now)}, "updatedAt" = ${timestampParameter(now)}
          WHERE "operationKey" = ${input.operationKey} AND "reservationKind" = 'model_call'
        `);
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId,
          attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_USAGE_SETTLED",
          eventIdempotencyKey: `${input.operationKey}:usage-settled`,
          payloadJson: {
            ...normalizedReceipt, operationKey: input.operationKey,
            chargedTokens, overrunTokens,
            ...(overrunTokens > 0 ? { admissionAction: "actual_usage_charged_to_window_and_next_reservations_checked_against_actual" } : {}),
          },
        });
        if (overrunTokens > 0) {
          await appendJobEvent(query, {
            workerJobId: input.lease.jobId,
            attemptId: input.lease.attemptId,
            eventType: "CODEX_MODEL_BUDGET_OVERRUN",
            eventIdempotencyKey: `${input.operationKey}:budget-overrun`,
            payloadJson: {
              operationKey: input.operationKey,
              reservationEstimateTokens,
              actualTokens: chargedTokens,
              overrunTokens,
              reservationBasis: "utf8_prompt_bytes_plus_configured_output_allowance",
              nextAdmissionUsesActualUsage: true,
            },
          });
        }
        return { kind: "settled", operationKey: input.operationKey, chargedTokens, overrunTokens };
      });
    },

    async correctCodexModelUsage(input) {
      const now = input.now ?? new Date();
      const auth = input.authorization;
      const usage = input.usage;
      if (!auth || !Number.isSafeInteger(auth.actorId) || auth.actorId <= 0 ||
          typeof auth.tenantId !== "string" || !auth.tenantId.trim() ||
          typeof auth.reference !== "string" || !auth.reference.trim() || auth.reference.length > 200 ||
          !/^[a-f0-9]{64}$/.test(auth.providerEvidenceSha256 ?? "") ||
          typeof input.expectedReceiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedReceiptSha256) ||
          typeof input.correctionId !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.correctionId)) {
        return { kind: "denied", reason: "authorization" };
      }
      if (!usage || !validNonNegativeInteger(input.expectedChargedTokens) ||
          !validNonNegativeInteger(usage.inputTokens) || !validNonNegativeInteger(usage.cachedInputTokens) ||
          !validNonNegativeInteger(usage.outputTokens) || usage.cachedInputTokens > usage.inputTokens ||
          usage.inputTokens + usage.outputTokens > 2_147_483_647 ||
          typeof usage.threadId !== "string" || !usage.threadId.trim() || usage.threadId.length > 160 ||
          typeof usage.turnId !== "string" || !usage.turnId.trim() || usage.turnId.length > 160 ||
          typeof usage.observedAt !== "string" || !Number.isFinite(Date.parse(usage.observedAt))) {
        return { kind: "denied", reason: "receipt_conflict" };
      }
      const requestDigest = createHash("sha256").update(stableJson({
        runId: input.runId, operationKey: input.operationKey, correctionId: input.correctionId,
        expectedReceiptSha256: input.expectedReceiptSha256, expectedChargedTokens: input.expectedChargedTokens,
        usage, authorization: auth,
      })).digest("hex");
      const eventKey = `codex-usage-correction:${createHash("sha256").update(`${input.operationKey}\0${input.correctionId}`).digest("hex")}`;
      return db.transaction(async tx => {
        const query = tx as any;
        const [job] = rows(await query.execute(sql`
          SELECT j.*, a."leaseGeneration", a."leaseTokenHash"
          FROM "worker_jobs" j JOIN "worker_job_attempts" a
            ON a."workerJobId" = j."id" AND a."attempt" = j."attempt"
          WHERE j."id" = ${input.lease.jobId} AND a."id" = ${input.lease.attemptId}
          FOR UPDATE OF j, a
        `));
        if (!job || stringValue(job, "status") !== "running" ||
            numberValue(job, "fencingVersion") !== input.lease.fencingVersion ||
            numberValue(job, "leaseGeneration") !== input.lease.fencingVersion ||
            stringValue(job, "leaseOwnerToken") !== hashLeaseToken(input.lease.leaseToken) ||
            stringValue(job, "leaseTokenHash") !== hashLeaseToken(input.lease.leaseToken) ||
            !dateValue(job, "leaseExpiresAt") || dateValue(job, "leaseExpiresAt")! <= now) {
          return { kind: "denied", reason: "stale_lease" };
        }
        const run = objectValue(objectValue(job.inputJson)?.developerWorkUnit);
        if (job.jobType !== "developer.fast_lane" || run?.contractVersion !== "developer-fast-lane-v1" ||
            run.runId !== input.runId || run.workerJobId !== input.lease.jobId ||
            run.tenantId !== job.tenantId || Number(run.actorId) !== Number(job.requestedByUserId)) {
          return { kind: "denied", reason: "run_binding" };
        }
        if (auth.actorId !== Number(job.requestedByUserId) || auth.tenantId !== job.tenantId) {
          return { kind: "denied", reason: "authorization" };
        }
        // Serialize with shared admission, including reservations by other Jobs.
        await query.execute(sql`SELECT pg_advisory_xact_lock(hashtext('codex_subscription:shared'))`);
        const [reservation] = rows(await query.execute(sql`
          SELECT * FROM "worker_job_provider_reservations"
          WHERE "operationKey" = ${input.operationKey} AND "workerJobId" = ${input.lease.jobId}
            AND "reservationKind" = 'model_call' AND "providerName" = 'codex_subscription'
          FOR UPDATE
        `));
        if (!reservation) return { kind: "denied", reason: "reservation_missing" };
        const originalReceipt = objectValue(reservation.usageReceiptJson);
        if (reservation.usageState !== "known" || reservation.dispatchState !== "settled" ||
            reservation.reservationStatus !== "released" || !originalReceipt ||
            createHash("sha256").update(stableJson(originalReceipt)).digest("hex") !== input.expectedReceiptSha256 ||
            reservation.threadId !== usage.threadId || reservation.turnId !== usage.turnId ||
            (usage.effectiveModel ?? null) !== (originalReceipt.effectiveModel ?? null)) {
          return { kind: "denied", reason: "receipt_conflict" };
        }
        const chargedTokens = usage.inputTokens + usage.outputTokens;
        const [priorEvent] = rows(await query.execute(sql`
          SELECT "payloadJson" FROM "worker_job_events"
          WHERE "workerJobId" = ${input.lease.jobId} AND "eventIdempotencyKey" = ${eventKey}
        `));
        if (priorEvent) {
          const receipt = objectValue(priorEvent.payloadJson);
          if (receipt?.requestDigest !== requestDigest) return { kind: "denied", reason: "receipt_conflict" };
          return { kind: "duplicate", operationKey: input.operationKey,
            chargedTokens: Number(reservation.inputTokens) + Number(reservation.outputTokens),
            additionalTokens: Number(receipt.additionalCharge) };
        }
        const previousTokens = Number(reservation.inputTokens) + Number(reservation.outputTokens);
        // Corrections repair proven omissions only. Unknown usage, refunds and
        // arbitrary rewrites require their own authority, never this port.
        if (previousTokens !== input.expectedChargedTokens || chargedTokens <= previousTokens ||
            usage.inputTokens < Number(reservation.inputTokens) || usage.outputTokens < Number(reservation.outputTokens) ||
            usage.cachedInputTokens < Number(reservation.cachedInputTokens)) {
          return { kind: "denied", reason: "receipt_conflict" };
        }
        const additionalTokens = chargedTokens - previousTokens;
        await appendJobEvent(query, {
          workerJobId: input.lease.jobId, attemptId: input.lease.attemptId,
          eventType: "CODEX_MODEL_USAGE_CORRECTED", eventIdempotencyKey: eventKey,
          payloadJson: {
            schemaVersion: "codex-model-usage-correction.v1", requestDigest,
            correctionId: input.correctionId, operationKey: input.operationKey, runId: input.runId,
            modelCallId: reservation.modelCallId, threadId: usage.threadId, turnId: usage.turnId,
            requestedModel: reservation.requestedModel, role: reservation.modelRole, phase: reservation.modelPhase,
            originalReceiptSha256: input.expectedReceiptSha256, operator: auth,
            previousUsage: { inputTokens: reservation.inputTokens, cachedInputTokens: reservation.cachedInputTokens, outputTokens: reservation.outputTokens },
            correctedUsage: usage, previousCharge: previousTokens, chargedTokens, additionalCharge: additionalTokens,
            overrunTokens: Math.max(0, chargedTokens - Number(reservation.reservedTokens)),
            windowStartedAt: dateValue(reservation, "tokenWindowStartedAt")?.toISOString(),
            fencingVersion: input.lease.fencingVersion, correctedAt: now.toISOString(),
          },
        });
        // These columns are the admission projection. The original receipt,
        // usage-settled event, identities and token window remain immutable.
        await query.execute(sql`
          UPDATE "worker_job_provider_reservations"
          SET "inputTokens" = ${usage.inputTokens}, "cachedInputTokens" = ${usage.cachedInputTokens},
              "outputTokens" = ${usage.outputTokens}, "updatedAt" = ${timestampParameter(now)}
          WHERE "operationKey" = ${input.operationKey} AND "workerJobId" = ${input.lease.jobId}
            AND "reservationKind" = 'model_call'
        `);
        return { kind: "corrected", operationKey: input.operationKey, chargedTokens, additionalTokens };
      });
    },


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
          AND ("fairnessEligibleAt" IS NULL OR "fairnessEligibleAt" <= ${timestampParameter(input.now)})
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
                AND (a."cooldownUntil" IS NULL OR a."cooldownUntil" <= ${timestampParameter(input.now)})
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
                AND (a."cooldownUntil" IS NULL OR a."cooldownUntil" <= ${timestampParameter(input.now)})
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
            ) VALUES (${kind}, ${provider}, ${accountId}, 'submission', ${timestampParameter(windowStart)}, ${limits.submissionWindowSeconds}, 1, ${limits.submissionWindowMax})
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
              ) VALUES (${kind}, ${provider}, ${accountId}, 'daily', ${timestampParameter(dailyWindowStart)}, ${limits.dailyWindowSeconds}, 1, ${limits.dailyWindowMax})
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
                  AND "windowStartedAt" = ${timestampParameter(windowStart)}
              `);
              continue;
            }
          }

          await query.execute(sql`
            INSERT INTO "provider_scheduler_states" ("providerKind", "providerPoolKey", "userKey", "activeCount", "lastServedAt", "fairnessEligibleAt")
            VALUES (${kind}, ${providerPoolKey}, ${input.candidate.userKey}, 1, ${timestampParameter(input.now)}, ${timestampParameter(nextFairnessEligibleAt(input.now, limits.fairnessCooldownMs))})
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
            ) VALUES (${input.candidate.jobId}, NULL, ${input.candidate.businessAttempt}, ${kind}, ${provider}, ${accountId}, 'running', 'reserved', ${input.candidate.userKey}, ${input.operationKey}, ${timestampParameter(new Date(input.now.getTime() + limits.providerDeadlineMs))})
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
            "pollerLeaseExpiresAt" = ${timestampParameter(new Date(input.now.getTime() + input.leaseMs))},
            "pollAttempt" = "pollAttempt" + 1,
            "updatedAt" = ${timestampParameter(input.now)}
        WHERE "id" IN (
          SELECT "id" FROM "worker_job_provider_reservations"
          WHERE "reservationKind" = 'running'
            AND "reservationStatus" = 'reserved'
            AND "nextPollAt" IS NOT NULL AND "nextPollAt" <= ${timestampParameter(input.now)}
            AND ("pollerLeaseExpiresAt" IS NULL OR "pollerLeaseExpiresAt" <= ${timestampParameter(input.now)})
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
        if (!provider) return [];
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
          SET "activeCount" = GREATEST(0, "activeCount" - 1), "updatedAt" = ${timestampParameter(input.now)}
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
        ${input.nextPollAt ? timestampParameter(input.nextPollAt) : null}, ${input.providerDeadlineAt ? timestampParameter(input.providerDeadlineAt) : null}
      )
      RETURNING "id"
    `));
    if (inserted.length === 0) return false;
    await query.execute(sql`
      INSERT INTO "provider_scheduler_states" (
        "providerKind", "providerPoolKey", "userKey", "activeCount", "lastServedAt", "fairnessEligibleAt"
      ) VALUES (${kind}, ${poolKey}, ${userKey}, 1, now(), ${timestampParameter(nextFairnessEligibleAt(new Date(), limits.fairnessCooldownMs))})
      ON CONFLICT ("providerPoolKey", "userKey") DO UPDATE SET
        "activeCount" = "provider_scheduler_states"."activeCount" + 1,
        "updatedAt" = now()
    `);
    return true;
  });
}
