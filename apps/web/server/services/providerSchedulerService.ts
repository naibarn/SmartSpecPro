import {
  deriveProviderOperationKey,
  getProviderSchedulerLimits,
  nextFairnessEligibleAt,
  selectFairProviderCandidates,
  type FairnessCandidate,
} from "./providerSchedulerPolicy";

export type ProviderQueueCandidate = FairnessCandidate & {
  tenantId: string;
  businessAttempt: number;
  provider: string;
  providerPoolKey: string;
  logicalOperation: string;
};

export type ProviderReservation = {
  reservationId: string;
  jobId: string;
  businessAttempt: number;
  provider: string;
  providerPoolKey: string;
  operationKey: string;
};

export type ProviderAdmissionDecision =
  | { kind: "reserved"; reservation: ProviderReservation }
  | { kind: "full"; nextEligibleAt: Date }
  | { kind: "skipped"; reason: string };

export type ProviderSubmissionResult = {
  providerJobId: string;
  rawStatus?: string;
};

export type ProviderSubmissionClient = {
  submit(input: { candidate: ProviderQueueCandidate; operationKey: string }): Promise<ProviderSubmissionResult>;
  inspect(input: { candidate: ProviderQueueCandidate; operationKey: string }): Promise<ProviderSubmissionResult | null>;
};

/**
 * Repository port deliberately exposes transaction-sized operations only.
 * Implementations must reserve/lock in PostgreSQL and must not hold a
 * transaction while calling `submit` or `inspect`.
 */
export type ProviderSchedulerRepository = {
  findCandidates(input: { providerPoolKey?: string; limit: number; now: Date }): Promise<ProviderQueueCandidate[]>;
  getCompetitorState(input: { providerPoolKey: string; userKey: string; now: Date }): Promise<{
    capacity: number;
    competitorExists: boolean;
    lastSelectedUserKey?: string;
  }>;
  reserve(input: {
    candidate: ProviderQueueCandidate;
    operationKey: string;
    now: Date;
    fairnessEligibleAt: Date;
  }): Promise<ProviderAdmissionDecision>;
  markSubmitted(input: {
    reservation: ProviderReservation;
    providerJobId: string;
    now: Date;
    nextPollAt: Date;
  }): Promise<void>;
  markAmbiguous(input: {
    reservation: ProviderReservation;
    reason: string;
    now: Date;
  }): Promise<void>;
};

export type ProviderSchedulerOptions = {
  repository: ProviderSchedulerRepository;
  clients: ReadonlyMap<string, ProviderSubmissionClient>;
  now?: Date;
  limit?: number;
};

export type ProviderSchedulerResult = {
  candidates: number;
  reserved: number;
  submitted: number;
  full: number;
  ambiguous: number;
  skipped: number;
};

function normalizedProvider(provider: string): string {
  return provider.trim().toLowerCase().replace(/[.\-]/g, "_");
}

/**
 * One bounded scheduler tick. All durable state changes belong to the
 * repository; this function only coordinates short reservation transactions
 * and external calls, making lost responses safe to test and recover.
 */
export async function runProviderSchedulerOnce(options: ProviderSchedulerOptions): Promise<ProviderSchedulerResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100)));
  const candidates = await options.repository.findCandidates({ limit, now });
  const result: ProviderSchedulerResult = {
    candidates: candidates.length,
    reserved: 0,
    submitted: 0,
    full: 0,
    ambiguous: 0,
    skipped: 0,
  };

  const pools = new Map<string, ProviderQueueCandidate[]>();
  for (const candidate of candidates) {
    const pool = pools.get(candidate.providerPoolKey) ?? [];
    pool.push(candidate);
    pools.set(candidate.providerPoolKey, pool);
  }

  for (const [providerPoolKey, pool] of pools) {
    const provider = normalizedProvider(pool[0].provider);
    const limits = getProviderSchedulerLimits(provider);
    const client = options.clients.get(provider);
    if (!limits || !client) {
      result.skipped += pool.length;
      continue;
    }
    const state = await options.repository.getCompetitorState({
      providerPoolKey,
      userKey: pool[0].userKey,
      now,
    });
    const selection = selectFairProviderCandidates({
      candidates: pool,
      now,
      capacity: Math.min(state.capacity, limits.providerMaxConcurrent),
      competitorExists: state.competitorExists,
      lastSelectedUserKey: state.lastSelectedUserKey,
      fairnessCooldownMs: limits.fairnessCooldownMs,
    });

    for (const candidate of selection.selected) {
      const operationKey = deriveProviderOperationKey({
        jobId: candidate.jobId,
        businessAttempt: candidate.businessAttempt,
        provider,
        logicalOperation: candidate.logicalOperation,
      });
      const reservation = await options.repository.reserve({
        candidate,
        operationKey,
        now,
        fairnessEligibleAt: nextFairnessEligibleAt(now, limits.fairnessCooldownMs),
      });
      if (reservation.kind === "full") {
        result.full += 1;
        continue;
      }
      if (reservation.kind === "skipped") {
        result.skipped += 1;
        continue;
      }
      result.reserved += 1;

      try {
        const submitted = await client.submit({ candidate, operationKey });
        await options.repository.markSubmitted({
          reservation: reservation.reservation,
          providerJobId: submitted.providerJobId,
          now,
          nextPollAt: new Date(now.getTime() + limits.pollMinDelayMs),
        });
        result.submitted += 1;
      } catch (error) {
        // The HTTP request may have reached the provider. Query the same
        // operation key before deciding that no provider task exists.
        try {
          const observed = await client.inspect({ candidate, operationKey });
          if (observed?.providerJobId) {
            await options.repository.markSubmitted({
              reservation: reservation.reservation,
              providerJobId: observed.providerJobId,
              now,
              nextPollAt: new Date(now.getTime() + limits.pollMinDelayMs),
            });
            result.submitted += 1;
            continue;
          }
        } catch {
          // Keep the original ambiguity and quarantine below.
        }
        result.ambiguous += 1;
        await options.repository.markAmbiguous({
          reservation: reservation.reservation,
          reason: error instanceof Error ? error.message.slice(0, 500) : "provider_submission_ambiguous",
          now,
        });
      }
    }
  }
  return result;
}
