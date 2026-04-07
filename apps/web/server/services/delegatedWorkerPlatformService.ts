import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  creditTransactions,
  workerJobs,
  workers,
} from "../../drizzle/schema";
import { getTraceId } from "./traceContext";
import { getRedisClient, isRedisAvailable } from "./redis";
import { acquireSemaphore, type SemaphoreHandle } from "./redisSemaphore";
import {
  getDelegatedScopeProfilePolicy,
  type DelegatedWorkerAuthContext,
} from "./workerDelegationService";

type WorkerRecord = Record<string, any>;
type WorkerJobRecord = Record<string, any>;

type DelegatedWorkerAuth = {
  mode?: string;
  tenantId?: string;
  userId?: number;
  ownerUserId?: number;
  workerId?: string;
  workerJobId?: string;
  delegatedSessionId?: string;
  runtimeType?: string;
  scopeProfile?: string;
};

export type DelegatedWorkerActionClass = "read" | "compute" | "media" | "mcp_write";

export type WorkerSpendBudgetPolicy = {
  hourlyCredits?: number | null;
  fiveHourCredits?: number | null;
  dailyCredits?: number | null;
  weeklyCredits?: number | null;
  monthlyCredits?: number | null;
};

export type DelegatedWorkerOriginMetadata = {
  originSurface: string;
  workerId: string;
  workerJobId: string;
  runtimeType: string;
  delegatedSessionId: string;
  delegatedByUserId: number;
  ownerUserId: number;
  traceId: string;
  leaseId: string;
  recursionDepth: number;
};

type ConcurrencyPolicy = {
  maxConcurrent: number;
  ttlSeconds: number;
};

type ConcurrencyHandle = {
  release(): Promise<void>;
};

type WindowDefinition = {
  label: "hourly" | "five_hour" | "daily" | "weekly" | "monthly";
  key: keyof WorkerSpendBudgetPolicy;
  durationMs: number;
};

const WINDOW_DEFINITIONS: WindowDefinition[] = [
  { label: "hourly", key: "hourlyCredits", durationMs: 60 * 60 * 1000 },
  { label: "five_hour", key: "fiveHourCredits", durationMs: 5 * 60 * 60 * 1000 },
  { label: "daily", key: "dailyCredits", durationMs: 24 * 60 * 60 * 1000 },
  { label: "weekly", key: "weeklyCredits", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { label: "monthly", key: "monthlyCredits", durationMs: 30 * 24 * 60 * 60 * 1000 },
];

const CONCURRENCY_POLICIES: Record<DelegatedWorkerActionClass, ConcurrencyPolicy> = {
  read: { maxConcurrent: 4, ttlSeconds: 90 },
  compute: { maxConcurrent: 2, ttlSeconds: 180 },
  media: { maxConcurrent: 1, ttlSeconds: 300 },
  mcp_write: { maxConcurrent: 1, ttlSeconds: 120 },
};

const NOOP_CONCURRENCY_HANDLE: ConcurrencyHandle = {
  async release() {},
};

const localConcurrencyCounters = new Map<string, number>();

export class DelegatedWorkerPlatformError extends Error {
  code: string;
  statusCode: number;
  type: string;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    type = "invalid_request_error",
  ) {
    super(message);
    this.name = "DelegatedWorkerPlatformError";
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

function isDelegatedWorkerAuth(auth: DelegatedWorkerAuth | null | undefined): auth is Required<Pick<
  DelegatedWorkerAuth,
  "tenantId" | "userId" | "ownerUserId" | "workerId" | "workerJobId" | "delegatedSessionId" | "runtimeType" | "scopeProfile"
>> & { mode: "delegated_worker" } {
  return Boolean(
    auth
      && auth.mode === "delegated_worker"
      && auth.tenantId
      && auth.userId
      && auth.ownerUserId
      && auth.workerId
      && auth.workerJobId
      && auth.delegatedSessionId
      && auth.runtimeType
      && auth.scopeProfile
  );
}

function sanitizeBudgetValue(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = Math.floor(numeric);
  return normalized > 0 ? normalized : null;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildConcurrencyKey(
  auth: Required<Pick<
    DelegatedWorkerAuth,
    "tenantId" | "workerId" | "workerJobId"
  >>,
  actionClass: DelegatedWorkerActionClass,
): string {
  return [
    "delegated-worker",
    "concurrency",
    auth.tenantId,
    auth.workerId,
    auth.workerJobId,
    actionClass,
  ].join(":");
}

function acquireLocalSemaphore(
  key: string,
  maxSlots: number,
): ConcurrencyHandle | null {
  const current = localConcurrencyCounters.get(key) ?? 0;
  if (current >= maxSlots) {
    return null;
  }

  localConcurrencyCounters.set(key, current + 1);

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) {
        return;
      }
      released = true;
      const next = (localConcurrencyCounters.get(key) ?? 1) - 1;
      if (next <= 0) {
        localConcurrencyCounters.delete(key);
        return;
      }
      localConcurrencyCounters.set(key, next);
    },
  };
}

function readWorkerSpendBudgetPolicy(worker: WorkerRecord | null): WorkerSpendBudgetPolicy {
  const source = worker?.capabilitiesJson;
  if (!source || typeof source !== "object") {
    return {};
  }
  const rawPolicy = (source as Record<string, unknown>).delegatedSpendCaps;
  if (!rawPolicy || typeof rawPolicy !== "object") {
    return {};
  }
  const policy = rawPolicy as Record<string, unknown>;
  return {
    hourlyCredits: sanitizeBudgetValue(policy.hourlyCredits),
    fiveHourCredits: sanitizeBudgetValue(policy.fiveHourCredits),
    dailyCredits: sanitizeBudgetValue(policy.dailyCredits),
    weeklyCredits: sanitizeBudgetValue(policy.weeklyCredits),
    monthlyCredits: sanitizeBudgetValue(policy.monthlyCredits),
  };
}

function readReservedCredits(job: WorkerJobRecord | null): number | null {
  const billing = job?.instructionsJson?.workerBilling;
  if (!billing || typeof billing !== "object") {
    return null;
  }
  return sanitizeBudgetValue((billing as Record<string, unknown>).reservedCredits);
}

async function sumWorkerUsageCreditsSince(
  userId: number,
  workerId: string,
  since: Date,
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(case when ${creditTransactions.amount} < 0 then -${creditTransactions.amount} else 0 end), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage"),
        gte(creditTransactions.createdAt, since),
        sql`${creditTransactions.metadata} ->> 'workerId' = ${workerId}`,
      ),
    );
  return Number(row?.total ?? 0);
}

async function sumWorkerJobUsageCredits(
  userId: number,
  workerJobId: string,
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(case when ${creditTransactions.amount} < 0 then -${creditTransactions.amount} else 0 end), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage"),
        sql`${creditTransactions.metadata} ->> 'workerJobId' = ${workerJobId}`,
      ),
    );
  return Number(row?.total ?? 0);
}

async function hasExistingIdempotentCharge(
  userId: number,
  idempotencyKey: string,
): Promise<boolean> {
  if (!idempotencyKey.trim()) {
    return false;
  }
  const db = await getDb();
  const [row] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return Boolean(row?.id);
}

async function loadWorkerContext(
  auth: Required<Pick<
    DelegatedWorkerAuth,
    "tenantId" | "workerId" | "workerJobId"
  >>,
): Promise<{
  worker: WorkerRecord | null;
  job: WorkerJobRecord | null;
}> {
  const db = await getDb();
  const [worker, job] = await Promise.all([
    db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, auth.tenantId), eq(workers.id, auth.workerId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, auth.tenantId), eq(workerJobs.id, auth.workerJobId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);
  return { worker, job };
}

export function buildDelegatedWorkerOriginMetadata(
  auth: DelegatedWorkerAuth | null | undefined,
  originSurface: string,
  extraMetadata: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!isDelegatedWorkerAuth(auth)) {
    return extraMetadata;
  }

  const traceId = getTraceId() || String(extraMetadata.traceId || "");
  return {
    ...extraMetadata,
    originSurface,
    workerId: auth.workerId,
    workerJobId: auth.workerJobId,
    runtimeType: auth.runtimeType,
    delegatedSessionId: auth.delegatedSessionId,
    delegatedByUserId: auth.userId,
    ownerUserId: auth.ownerUserId,
    traceId: traceId || undefined,
    leaseId: auth.delegatedSessionId,
    recursionDepth:
      typeof extraMetadata.recursionDepth === "number"
        ? extraMetadata.recursionDepth
        : Number(extraMetadata.recursionDepth ?? 0),
  };
}

export async function enforceDelegatedWorkerSpendGuardrails(
  input: {
    auth: DelegatedWorkerAuth | null | undefined;
    estimatedCredits: number;
    idempotencyKey?: string | null;
  },
): Promise<void> {
  if (!isDelegatedWorkerAuth(input.auth)) {
    return;
  }

  const estimatedCredits = Math.max(0, Math.ceil(Number(input.estimatedCredits || 0)));
  if (estimatedCredits <= 0) {
    return;
  }

  if (input.idempotencyKey && await hasExistingIdempotentCharge(input.auth.userId, input.idempotencyKey)) {
    return;
  }

  const { worker, job } = await loadWorkerContext(input.auth);
  if (!worker || !job) {
    throw new DelegatedWorkerPlatformError(
      "worker_context_not_found",
      404,
      "Delegated worker context was not found",
      "not_found_error",
    );
  }
  if (worker.status === "disabled") {
    throw new DelegatedWorkerPlatformError(
      "worker_disabled",
      409,
      "This worker is disabled and cannot spend credits",
    );
  }

  const reservedCredits = readReservedCredits(job);
  if (reservedCredits != null) {
    const consumed = await sumWorkerJobUsageCredits(input.auth.userId, input.auth.workerJobId);
    if (consumed + estimatedCredits > reservedCredits) {
      throw new DelegatedWorkerPlatformError(
        "worker_job_budget_exhausted",
        409,
        `Worker job budget would exceed the reserved credit envelope (${consumed}/${reservedCredits})`,
      );
    }
  }

  const spendPolicy = readWorkerSpendBudgetPolicy(worker);
  for (const windowDef of WINDOW_DEFINITIONS) {
    const cap = spendPolicy[windowDef.key];
    if (cap == null) {
      continue;
    }
    const since = new Date(Date.now() - windowDef.durationMs);
    const used = await sumWorkerUsageCreditsSince(input.auth.userId, input.auth.workerId, since);
    if (used + estimatedCredits > cap) {
      throw new DelegatedWorkerPlatformError(
        "worker_spend_limit_exhausted",
        409,
        `Worker ${windowDef.label} credit cap has been reached`,
      );
    }
  }
}

export async function acquireDelegatedWorkerConcurrencySlot(
  input: {
    auth: DelegatedWorkerAuth | null | undefined;
    actionClass: DelegatedWorkerActionClass;
  },
): Promise<ConcurrencyHandle> {
  if (!isDelegatedWorkerAuth(input.auth)) {
    return NOOP_CONCURRENCY_HANDLE;
  }

  const policy = CONCURRENCY_POLICIES[input.actionClass];
  const key = buildConcurrencyKey(input.auth, input.actionClass);

  let handle: SemaphoreHandle | ConcurrencyHandle | null = null;
  if (isRedisAvailable()) {
    handle = await acquireSemaphore(
      getRedisClient(),
      key,
      policy.maxConcurrent,
      policy.ttlSeconds,
    );
  } else {
    handle = acquireLocalSemaphore(key, policy.maxConcurrent);
  }

  if (!handle) {
    throw new DelegatedWorkerPlatformError(
      "worker_concurrency_limit_exceeded",
      429,
      "This worker job already has too many concurrent delegated actions",
      "rate_limit_error",
    );
  }

  return {
    async release(): Promise<void> {
      await handle.release();
    },
  };
}

export async function runWithDelegatedWorkerExecution<T>(
  input: {
    auth: DelegatedWorkerAuth | null | undefined;
    actionClass: DelegatedWorkerActionClass;
    estimatedCredits?: number;
    idempotencyKey?: string | null;
  },
  fn: () => Promise<T>,
): Promise<T> {
  await enforceDelegatedWorkerSpendGuardrails({
    auth: input.auth,
    estimatedCredits: input.estimatedCredits ?? 0,
    idempotencyKey: input.idempotencyKey,
  });

  const handle = await acquireDelegatedWorkerConcurrencySlot({
    auth: input.auth,
    actionClass: input.actionClass,
  });

  try {
    return await fn();
  } finally {
    await handle.release();
  }
}

export function enforceDelegatedWorkerModelSelectionPolicy(
  input: {
    auth: DelegatedWorkerAuth | null | undefined;
    rawRequestedModel?: string | null;
    resolvedModelId?: string | null;
    preferredProviderId?: number | null;
    providerName?: string | null;
  },
): void {
  if (!isDelegatedWorkerAuth(input.auth)) {
    return;
  }

  const profile = input.auth.scopeProfile as DelegatedWorkerAuthContext["scopeProfile"] | undefined;
  if (!profile) {
    return;
  }

  const { allowedModelAliases, allowedProviderProfiles } =
    getDelegatedScopeProfilePolicy(profile);

  const rawRequestedModel = typeof input.rawRequestedModel === "string"
    ? input.rawRequestedModel.trim()
    : "";
  if (rawRequestedModel.includes("/")) {
    throw new DelegatedWorkerPlatformError(
      "worker_model_not_allowed",
      403,
      "Delegated workers must use SmartSpecPro-approved model aliases instead of raw provider model identifiers",
      "auth_error",
    );
  }

  const resolvedModelId = typeof input.resolvedModelId === "string"
    ? input.resolvedModelId.trim()
    : "";
  if (resolvedModelId && allowedModelAliases.length > 0) {
    const normalizedResolved = normalizeValue(resolvedModelId);
    const allowed = allowedModelAliases.some((candidate) =>
      normalizeValue(candidate) === normalizedResolved,
    );
    if (!allowed) {
      throw new DelegatedWorkerPlatformError(
        "worker_model_not_allowed",
        403,
        "The selected model is not allowed for this delegated worker session",
        "auth_error",
      );
    }
  }

  if (input.preferredProviderId != null) {
    if (!allowedProviderProfiles.length) {
      throw new DelegatedWorkerPlatformError(
        "worker_provider_not_allowed",
        403,
        "This delegated worker session cannot pin a specific provider",
        "auth_error",
      );
    }

    const providerName = typeof input.providerName === "string"
      ? input.providerName.trim()
      : "";
    if (providerName) {
      const normalizedProviderName = normalizeValue(providerName);
      const allowed = allowedProviderProfiles.some((candidate) =>
        normalizeValue(candidate) === normalizedProviderName,
      );
      if (!allowed) {
        throw new DelegatedWorkerPlatformError(
          "worker_provider_not_allowed",
          403,
          "The selected provider is not allowed for this delegated worker session",
          "auth_error",
        );
      }
    }
  }
}

export async function getDelegatedWorkerDownstreamCreditsUsed(
  tenantId: string,
  userId: number,
  workerJobId: string,
): Promise<number> {
  const db = await getDb();
  const [job] = await db
    .select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.id, workerJobId)))
    .limit(1);
  if (!job) {
    return 0;
  }
  return sumWorkerJobUsageCredits(userId, workerJobId);
}

export function readDelegatedWorkerSpendBudgetPolicy(
  worker: WorkerRecord | null | undefined,
): WorkerSpendBudgetPolicy {
  return readWorkerSpendBudgetPolicy(worker ?? null);
}

export function resetDelegatedWorkerConcurrencyForTests(): void {
  localConcurrencyCounters.clear();
}
