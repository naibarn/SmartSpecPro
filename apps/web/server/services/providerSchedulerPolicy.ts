import { createHash } from "node:crypto";

export type ProviderClass = "kie_ai" | "wavespeed_ai" | "openrouter";
export type ProviderKind = "llm" | "media";

export type ProviderSchedulerLimits = {
  submissionWindowSeconds: number;
  submissionWindowMax: number;
  dailyWindowSeconds?: number;
  dailyWindowMax?: number;
  providerMaxConcurrent: number;
  userMaxConcurrent: number;
  pollMinDelayMs: number;
  pollMaxDelayMs: number;
  providerDeadlineMs: number;
  fairnessCooldownMs: number;
};

const LIMITS: Record<ProviderClass, ProviderSchedulerLimits> = {
  kie_ai: {
    submissionWindowSeconds: 10,
    submissionWindowMax: 18,
    providerMaxConcurrent: 50,
    userMaxConcurrent: 3,
    pollMinDelayMs: 5_000,
    pollMaxDelayMs: 30_000,
    providerDeadlineMs: 2 * 60 * 60_000,
    fairnessCooldownMs: 15_000,
  },
  wavespeed_ai: {
    submissionWindowSeconds: 60,
    submissionWindowMax: 5,
    providerMaxConcurrent: 2,
    userMaxConcurrent: 3,
    pollMinDelayMs: 5_000,
    pollMaxDelayMs: 30_000,
    providerDeadlineMs: 2 * 60 * 60_000,
    fairnessCooldownMs: 15_000,
  },
  openrouter: {
    submissionWindowSeconds: 60,
    submissionWindowMax: 20,
    dailyWindowSeconds: 24 * 60 * 60,
    dailyWindowMax: 1_000,
    providerMaxConcurrent: 10,
    userMaxConcurrent: 3,
    pollMinDelayMs: 2_000,
    pollMaxDelayMs: 15_000,
    providerDeadlineMs: 30 * 60_000,
    fairnessCooldownMs: 15_000,
  },
};

export function normalizeProviderClass(provider: string): ProviderClass | null {
  const normalized = provider.trim().toLowerCase().replace(/[.\-]/g, "_");
  if (normalized === "kie" || normalized === "kieai") return "kie_ai";
  if (normalized === "wavespeed" || normalized === "wavespeedai") return "wavespeed_ai";
  if (normalized === "open_router") return "openrouter";
  return normalized in LIMITS ? normalized as ProviderClass : null;
}

export function getProviderSchedulerLimits(
  provider: string,
  overrides?: Partial<ProviderSchedulerLimits>,
): ProviderSchedulerLimits | null {
  const providerClass = normalizeProviderClass(provider);
  if (!providerClass) return null;
  const base = LIMITS[providerClass];
  return {
    ...base,
    ...overrides,
    fairnessCooldownMs: Math.min(
      15_000,
      Math.max(0, overrides?.fairnessCooldownMs ?? base.fairnessCooldownMs),
    ),
  };
}

export function deriveServerUserKey(tenantId: string, userId: number | string): string {
  return createHash("sha256")
    .update(`${tenantId.trim()}\0${String(userId).trim()}`, "utf8")
    .digest("hex");
}

export function deriveProviderOperationKey(input: {
  jobId: string;
  businessAttempt: number;
  provider: string;
  logicalOperation: string;
}): string {
  const provider = normalizeProviderClass(input.provider) ?? input.provider.trim().toLowerCase();
  const material = `${provider}\0${input.jobId}\0${input.businessAttempt}\0${input.logicalOperation}`;
  return `feature-186:${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

export type PollScheduleInput = {
  provider: string;
  pollAttempt: number;
  now?: Date;
  retryAfterMs?: number;
  providerDeadlineAt?: Date;
};

export function computeNextPollAt(input: PollScheduleInput): Date | null {
  const limits = getProviderSchedulerLimits(input.provider);
  if (!limits) return null;
  const now = input.now ?? new Date();
  const attempt = Math.max(0, Math.trunc(input.pollAttempt));
  const exponential = Math.min(
    limits.pollMaxDelayMs,
    limits.pollMinDelayMs * 2 ** Math.min(attempt, 8),
  );
  const delayMs = Math.min(
    limits.pollMaxDelayMs,
    Math.max(limits.pollMinDelayMs, input.retryAfterMs ?? exponential),
  );
  const next = new Date(now.getTime() + delayMs);
  if (input.providerDeadlineAt && next > input.providerDeadlineAt) return input.providerDeadlineAt;
  return next;
}

export type FairnessCandidate = {
  jobId: string;
  userKey: string;
  eligibleAt: Date;
  lastServedAt?: Date | null;
  priority: number;
  createdAt: Date;
};

export type FairnessSelection = {
  selected: FairnessCandidate[];
  sameUserFallbackUsed: boolean;
};

/**
 * Deterministic fair selection for a single provider pool. SQL callers should
 * apply the same ordering while locking rows; this pure function is the
 * contract test and avoids hiding fairness in process memory.
 */
export function selectFairProviderCandidates(input: {
  candidates: FairnessCandidate[];
  now?: Date;
  capacity: number;
  competitorExists: boolean;
  lastSelectedUserKey?: string;
  fairnessCooldownMs?: number;
}): FairnessSelection {
  const now = input.now ?? new Date();
  const capacity = Math.max(0, Math.trunc(input.capacity));
  const eligible = input.candidates
    .filter(candidate => candidate.eligibleAt <= now)
    .sort((a, b) =>
      a.eligibleAt.getTime() - b.eligibleAt.getTime()
      || (a.lastServedAt?.getTime() ?? 0) - (b.lastServedAt?.getTime() ?? 0)
      || b.priority - a.priority
      || a.createdAt.getTime() - b.createdAt.getTime()
      || a.jobId.localeCompare(b.jobId),
    );
  if (capacity === 0 || eligible.length === 0) return { selected: [], sameUserFallbackUsed: false };

  const selected: FairnessCandidate[] = [];
  const usedUsers = new Set<string>();
  const cooldownMs = Math.min(15_000, Math.max(0, input.fairnessCooldownMs ?? 15_000));
  const preferred = input.lastSelectedUserKey;
  const competitor = eligible.find(candidate => candidate.userKey !== preferred);
  const first = competitor ?? eligible[0];
  selected.push(first);
  usedUsers.add(first.userKey);

  for (const candidate of eligible) {
    if (selected.length >= capacity) break;
    if (candidate.userKey !== first.userKey) {
      selected.push(candidate);
      usedUsers.add(candidate.userKey);
    }
  }

  const sameUserFallbackUsed = Boolean(
    !input.competitorExists
    && selected.length < capacity
    && usedUsers.size === 1
    && first.userKey === preferred,
  );
  // `cooldownMs` is intentionally clamped above and returned through the
  // caller's persisted fairnessEligibleAt calculation. Keeping the variable
  // here documents that the 15s cap is part of selection policy.
  void cooldownMs;
  return { selected, sameUserFallbackUsed };
}

export function nextFairnessEligibleAt(now = new Date(), cooldownMs = 15_000): Date {
  return new Date(now.getTime() + Math.min(15_000, Math.max(0, cooldownMs)));
}

export function isProviderPollDue(nextPollAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(nextPollAt && nextPollAt.getTime() <= now.getTime());
}
