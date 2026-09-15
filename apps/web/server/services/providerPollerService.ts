import {
  computeNextPollAt,
  getProviderSchedulerLimits,
  isProviderPollDue,
} from "./providerSchedulerPolicy";

export type ProviderPollRecord = {
  reservationId: string;
  jobId: string;
  businessAttempt: number;
  provider: string;
  providerPoolKey: string;
  userKey: string;
  operationKey: string;
  providerJobId: string;
  /** Hash of the short-lived poller lease that claimed this record. */
  pollerLeaseTokenHash: string;
  pollAttempt: number;
  providerDeadlineAt: Date;
};

export type ProviderPollObservation =
  | { status: "pending"; providerStatus?: string; retryAfterMs?: number }
  | { status: "completed"; resultRef: string }
  | { status: "failed" | "cancelled" | "timeout"; safeErrorCode: string; message?: string }
  | { status: "unknown"; reason: string };

export type ProviderPollClient = {
  inspect(input: { providerJobId: string; operationKey: string }): Promise<ProviderPollObservation>;
};

/**
 * Poll persistence port. Every method is expected to be a short PostgreSQL
 * transaction. The provider call is made only after claimDue returns and
 * before recordObservation is called.
 */
export type ProviderPollRepository = {
  claimDue(input: { now: Date; limit: number; leaseMs: number }): Promise<ProviderPollRecord[]>;
  recordObservation(input: {
    record: ProviderPollRecord;
    observation: ProviderPollObservation;
    nextPollAt: Date | null;
    now: Date;
  }): Promise<void>;
  recordUnknown(input: { record: ProviderPollRecord; reason: string; now: Date }): Promise<void>;
};

export type ProviderPollerResult = {
  claimed: number;
  pending: number;
  completed: number;
  failed: number;
  unknown: number;
};

export async function runProviderPollerOnce(input: {
  repository: ProviderPollRepository;
  clients: ReadonlyMap<string, ProviderPollClient>;
  now?: Date;
  limit?: number;
  leaseMs?: number;
}): Promise<ProviderPollerResult> {
  const now = input.now ?? new Date();
  const records = await input.repository.claimDue({
    now,
    limit: Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100))),
    leaseMs: Math.max(5_000, Math.min(120_000, Math.trunc(input.leaseMs ?? 30_000))),
  });
  const result: ProviderPollerResult = { claimed: records.length, pending: 0, completed: 0, failed: 0, unknown: 0 };

  for (const record of records) {
    const provider = record.provider.trim().toLowerCase().replace(/[.\-]/g, "_");
    const client = input.clients.get(provider);
    const limits = getProviderSchedulerLimits(provider);
    if (!client || !limits) {
      result.unknown += 1;
      await input.repository.recordUnknown({ record, reason: "provider_poller_not_configured", now });
      continue;
    }
    try {
      const observation = await client.inspect({
        providerJobId: record.providerJobId,
        operationKey: record.operationKey,
      });
      if (observation.status === "pending") {
        result.pending += 1;
        const nextPollAt = computeNextPollAt({
          provider,
          pollAttempt: record.pollAttempt,
          now,
          retryAfterMs: observation.retryAfterMs,
          providerDeadlineAt: record.providerDeadlineAt,
        });
        if (!nextPollAt || !isProviderPollDue(nextPollAt, now)) {
          await input.repository.recordObservation({ record, observation, nextPollAt, now });
        } else {
          await input.repository.recordUnknown({ record, reason: "provider_deadline_reached", now });
          result.pending -= 1;
          result.unknown += 1;
        }
        continue;
      }
      if (observation.status === "completed") {
        result.completed += 1;
      } else if (observation.status === "failed" || observation.status === "cancelled" || observation.status === "timeout") {
        result.failed += 1;
      } else {
        result.unknown += 1;
      }
      await input.repository.recordObservation({ record, observation, nextPollAt: null, now });
    } catch (error) {
      result.unknown += 1;
      await input.repository.recordUnknown({
        record,
        reason: error instanceof Error ? error.message.slice(0, 500) : "provider_poll_ambiguous",
        now,
      });
    }
  }
  return result;
}
