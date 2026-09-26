import { hashJti, type JtiRevocationRecord } from "../_core/revocation";

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

/** Take a fresh snapshot. Re-run after all writers are fenced; never reuse a prior dry-run. */
export async function collectActiveJtiRevocations(
  redis: LegacyJtiRedisReader,
  prefix: string,
  now: () => number = Date.now,
): Promise<JtiRevocationScan> {
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
