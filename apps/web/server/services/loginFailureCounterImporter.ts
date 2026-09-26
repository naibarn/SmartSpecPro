import { LOGIN_FAILURE_THRESHOLD, type LoginFailureCounterImport } from "./loginFailureCounterStore";

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

/** Read a fresh legacy snapshot. Re-run after fencing auth writers; never reuse a prior dry-run. */
export async function collectActiveLoginFailureCounters(
  redis: LegacyLoginCounterRedisReader,
  prefix: string,
  now: () => number = Date.now,
): Promise<LoginFailureCounterScan> {
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
    const failureCount = Number(value);
    if (!email || !Number.isSafeInteger(failureCount) || failureCount < 1) {
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
    records.push({ email, failureCount, expiresAt });
  }

  return { records, scannedKeys, expiredOrMissing, invalidEntries, persistentCounters, activeLockouts };
}
