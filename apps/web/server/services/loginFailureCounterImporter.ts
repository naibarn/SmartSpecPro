import {
  hashNormalizedAuthEmail,
  LOGIN_FAILURE_THRESHOLD,
  type LoginFailureCounterImport,
} from "./loginFailureCounterStore";
import { assertLiteralRedisPrefix } from "./redisKeyPrefix";
import { authEmailSchema } from "./emailNormalization";

export interface LegacyLoginCounterRedisReader {
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
  get(key: string): Promise<string | null>;
  pTTL(key: string): Promise<number>;
}

export type LoginFailureCounterScan = {
  records: LoginFailureCounterImport[];
  scannedKeys: number;
  expiredOrMissing: number;
  invalidEntries: number;
  persistentCounters: number;
  activeLockouts: number;
};

export function assertLoginFailureCounterScanIsSafeToApply(snapshot: LoginFailureCounterScan): void {
  if (snapshot.invalidEntries > 0) {
    throw new Error("Login failure counter snapshot contains invalid entries; apply is blocked");
  }
}

export function assertLoginFailureCounterScansMatchForApply(
  before: LoginFailureCounterScan,
  after: LoginFailureCounterScan,
): void {
  const expirySamplingToleranceMs = 1_000;
  const canonical = (snapshot: LoginFailureCounterScan) => {
    const records = new Map<string, { failureCount: number; expiresAt: Date | null }>();
    for (const record of snapshot.records) {
      const emailHash = hashNormalizedAuthEmail(record.email);
      const previous = records.get(emailHash);
      records.set(emailHash, {
        failureCount: Math.max(previous?.failureCount ?? 0, record.failureCount),
        expiresAt: previous?.expiresAt === null || record.expiresAt === null
          ? null
          : previous?.expiresAt && record.expiresAt
            ? new Date(Math.max(previous.expiresAt.getTime(), record.expiresAt.getTime()))
            : previous?.expiresAt ?? record.expiresAt,
      });
    }
    return records;
  };
  const initialRecords = canonical(before);
  const finalRecords = canonical(after);
  if (initialRecords.size !== finalRecords.size) {
    throw new Error("Login failure counter snapshot changed during apply preflight; apply is blocked");
  }
  for (const [emailHash, initial] of initialRecords) {
    const final = finalRecords.get(emailHash);
    if (!final || initial.failureCount !== final.failureCount ||
        (initial.expiresAt === null) !== (final.expiresAt === null) ||
        initial.expiresAt && final.expiresAt && Math.abs(initial.expiresAt.getTime() - final.expiresAt.getTime()) > expirySamplingToleranceMs) {
      throw new Error("Login failure counter snapshot changed during apply preflight; apply is blocked");
    }
  }
}

/** Read a fresh legacy snapshot. Re-run after fencing auth writers; never reuse a prior dry-run. */
export async function collectActiveLoginFailureCounters(
  redis: LegacyLoginCounterRedisReader,
  prefix: string,
  now: () => number = Date.now,
): Promise<LoginFailureCounterScan> {
  assertLiteralRedisPrefix(prefix, "Login failure counter prefix");
  const records: LoginFailureCounterImport[] = [];
  let scannedKeys = 0;
  let expiredOrMissing = 0;
  let invalidEntries = 0;
  let persistentCounters = 0;
  let activeLockouts = 0;

  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 500 })) {
    if (!key.startsWith(prefix)) continue;
    scannedKeys += 1;
    const email = key.slice(prefix.length);
    const [value, ttlMs] = await Promise.all([redis.get(key), redis.pTTL(key)]);
    if (ttlMs === -2 || value === null) {
      expiredOrMissing += 1;
      continue;
    }
    const parsedIdentity = authEmailSchema.safeParse(email);
    if (!parsedIdentity.success || parsedIdentity.data !== email || !/^[1-9]\d*$/.test(value)) {
      invalidEntries += 1;
      continue;
    }
    try { hashNormalizedAuthEmail(parsedIdentity.data); } catch {
      invalidEntries += 1;
      continue;
    }
    const normalizedEmail = parsedIdentity.data;
    const failureCount = Number(value);
    if (!Number.isSafeInteger(failureCount)) {
      invalidEntries += 1;
      continue;
    }
    const expiresAt = ttlMs === -1 ? null : new Date(now() + ttlMs);
    if (expiresAt && expiresAt.getTime() <= now()) {
      expiredOrMissing += 1;
      continue;
    }
    if (ttlMs === -1) persistentCounters += 1;
    if (failureCount >= LOGIN_FAILURE_THRESHOLD) activeLockouts += 1;
    records.push({ email: normalizedEmail, failureCount, expiresAt });
  }

  return { records, scannedKeys, expiredOrMissing, invalidEntries, persistentCounters, activeLockouts };
}
