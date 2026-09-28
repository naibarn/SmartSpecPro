import { LOGIN_FAILURE_THRESHOLD } from "./loginFailureCounterStore";

export interface RedisG2StateReader {
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
  get(key: string): Promise<string | null>;
  pTTL(key: string): Promise<number>;
}

const PATTERNS = {
  deviceAuthorization: "devicecode:*",
  loginFailureCounter: "auth:login:fail:*",
  runnerDevice: "runner:connect:device:*",
  runnerUser: "runner:connect:user:*",
  workerDevice: "worker-connect:device:*",
  workerUser: "worker-connect:user:*",
} as const;

export async function auditRedisG2AuthState(redis: RedisG2StateReader) {
  const counts: Record<string, number> = {};
  const ttlMs: Record<string, { maximum: number; persistent: number; expiredDuringScan: number }> = {};
  const stateCounts = {
    activeLoginLockouts: 0,
    invalidLoginCounters: 0,
    devicePending: 0,
    deviceAuthorized: 0,
    deviceUnclassified: 0,
    pairingPending: 0,
    pairingApproved: 0,
    pairingRevoked: 0,
    pairingExpired: 0,
    pairingRedeemed: 0,
    pairingUnclassified: 0,
    pairingUserRecords: 0,
    malformedValues: 0,
  };
  for (const [family, pattern] of Object.entries(PATTERNS)) {
    let keyCount = 0;
    const ttl = { maximum: 0, persistent: 0, expiredDuringScan: 0 };
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 500 })) {
      keyCount += 1;
      const [remaining, value] = await Promise.all([redis.pTTL(key), redis.get(key)]);
      if (remaining === -1) ttl.persistent += 1;
      else if (remaining === -2 || value === null) ttl.expiredDuringScan += 1;
      else ttl.maximum = Math.max(ttl.maximum, remaining);
      if (remaining === -2 || value === null) continue;
      if (family === "loginFailureCounter") {
        if (!/^[1-9]\d*$/.test(value)) {
          stateCounts.invalidLoginCounters += 1;
          continue;
        }
        const count = Number(value);
        if (!Number.isSafeInteger(count)) stateCounts.invalidLoginCounters += 1;
        else if (count >= LOGIN_FAILURE_THRESHOLD) stateCounts.activeLoginLockouts += 1;
        continue;
      }
      if (family === "runnerUser" || family === "workerUser") {
        // User-side records are counted separately because the Redis representation
        // does not provide a safe correlation key for deduplicating a logical pair.
        stateCounts.pairingUserRecords += 1;
        stateCounts.pairingUnclassified += 1;
        continue;
      }
      if (family === "deviceAuthorization" || family === "runnerDevice" || family === "workerDevice") {
        if (value === null) {
          stateCounts.malformedValues += 1;
          if (family === "deviceAuthorization") stateCounts.deviceUnclassified += 1;
          else stateCounts.pairingUnclassified += 1;
          continue;
        }
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          if (family === "deviceAuthorization") {
            if (parsed.authorized === true) stateCounts.deviceAuthorized += 1;
            else if (parsed.authorized === false) stateCounts.devicePending += 1;
            else stateCounts.deviceUnclassified += 1;
          } else if (parsed.status === "approved" || parsed.status === "active") stateCounts.pairingApproved += 1;
          else if (parsed.status === "pending") stateCounts.pairingPending += 1;
          else if (parsed.status === "revoked") stateCounts.pairingRevoked += 1;
          else if (parsed.status === "expired") stateCounts.pairingExpired += 1;
          else if (parsed.status === "redeemed") stateCounts.pairingRedeemed += 1;
          else stateCounts.pairingUnclassified += 1;
        } catch {
          stateCounts.malformedValues += 1;
          if (family === "deviceAuthorization") stateCounts.deviceUnclassified += 1;
          else stateCounts.pairingUnclassified += 1;
        }
      }
    }
    counts[family] = keyCount;
    ttlMs[family] = ttl;
  }
  return { counts, ttlMs, stateCounts };
}

export type RedisG2AuthStateAudit = Awaited<ReturnType<typeof auditRedisG2AuthState>>;

/** Fail closed before JTI apply when any scanned G2 family remains unclassified. */
export function assertRedisG2AuthStateSafeToApply(audit: RedisG2AuthStateAudit): void {
  const { invalidLoginCounters, deviceUnclassified, pairingUnclassified, malformedValues } = audit.stateCounts;
  if (invalidLoginCounters + deviceUnclassified + pairingUnclassified + malformedValues > 0) {
    throw new Error("G2 auth-state audit contains malformed or unclassified state; apply is blocked");
  }
}
