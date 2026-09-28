import { hashJti, type JtiRevocationRecord } from "../_core/revocation";
import { assertLiteralRedisPrefix } from "./redisKeyPrefix";

export interface LegacyJtiRedisReader {
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
  get(key: string): Promise<string | null>;
  pTTL(key: string): Promise<number>;
}

export type JtiRevocationScan = {
  records: JtiRevocationRecord[];
  scannedKeys: number;
  persistentRevocations: number;
  expiredOrMissing: number;
  ignoredNonRevocationValues: number;
  invalidIdentifiers: number;
};

export function assertJtiRevocationScanIsSafeToApply(snapshot: JtiRevocationScan): void {
  if (snapshot.invalidIdentifiers > 0 || snapshot.ignoredNonRevocationValues > 0) {
    throw new Error("JTI revocation snapshot contains invalid or non-revocation values; apply is blocked");
  }
}

export function assertJtiRevocationScansMatchForApply(before: JtiRevocationScan, after: JtiRevocationScan): void {
  const expirySamplingToleranceMs = 1_000;
  const initialRecords = new Map(before.records.map((record) => [record.jtiHash, record.expiresAt]));
  const finalRecords = new Map(after.records.map((record) => [record.jtiHash, record.expiresAt]));
  if (initialRecords.size !== finalRecords.size) {
    throw new Error("JTI revocation snapshot changed during apply preflight; apply is blocked");
  }
  for (const [jtiHash, initialExpiry] of initialRecords) {
    if (!finalRecords.has(jtiHash)) {
      throw new Error("JTI revocation snapshot changed during apply preflight; apply is blocked");
    }
    const finalExpiry = finalRecords.get(jtiHash)!;
    const permanenceChanged = (initialExpiry === null) !== (finalExpiry === null);
    const expiryShift = initialExpiry && finalExpiry ? Math.abs(initialExpiry.getTime() - finalExpiry.getTime()) : 0;
    if (permanenceChanged || expiryShift > expirySamplingToleranceMs) {
      throw new Error("JTI revocation snapshot changed during apply preflight; apply is blocked");
    }
  }
}

/** Take a fresh snapshot. Re-run after all writers are fenced; never reuse a prior dry-run. */
export async function collectActiveJtiRevocations(
  redis: LegacyJtiRedisReader,
  prefix: string,
  now: () => number = Date.now,
): Promise<JtiRevocationScan> {
  assertLiteralRedisPrefix(prefix, "JTI revocation prefix");
  const recordsByHash = new Map<string, JtiRevocationRecord>();
  let scannedKeys = 0;
  let persistentRevocations = 0;
  let expiredOrMissing = 0;
  let ignoredNonRevocationValues = 0;
  let invalidIdentifiers = 0;

  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 500 })) {
    if (!key.startsWith(prefix)) continue;
    scannedKeys += 1;
    const jti = key.slice(prefix.length);
    if (!jti || Buffer.byteLength(jti, "utf8") > 512) {
      invalidIdentifiers += 1;
      continue;
    }
    const [value, ttlMs] = await Promise.all([redis.get(key), redis.pTTL(key)]);
    if (ttlMs === -2 || value === null) {
      expiredOrMissing += 1;
      continue;
    }
    if (value !== "1") {
      ignoredNonRevocationValues += 1;
      continue;
    }
    const expiresAt = ttlMs === -1 ? null : new Date(now() + ttlMs);
    if (expiresAt && expiresAt.getTime() <= now()) {
      expiredOrMissing += 1;
      continue;
    }
    if (ttlMs === -1) persistentRevocations += 1;
    const jtiHash = hashJti(jti);
    const previous = recordsByHash.get(jtiHash);
    if (!previous || (previous.expiresAt !== null && expiresAt === null) ||
        (previous.expiresAt && expiresAt && expiresAt > previous.expiresAt)) {
      recordsByHash.set(jtiHash, { jtiHash, expiresAt });
    }
  }

  return {
    records: [...recordsByHash.values()],
    scannedKeys,
    persistentRevocations,
    expiredOrMissing,
    ignoredNonRevocationValues,
    invalidIdentifiers,
  };
}
