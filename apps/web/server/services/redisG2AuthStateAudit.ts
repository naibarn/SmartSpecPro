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
  const stateCounts = { activeLoginLockouts: 0, devicePending: 0, deviceAuthorized: 0, pairingPending: 0, pairingApproved: 0, malformedValues: 0 };
  for (const [family, pattern] of Object.entries(PATTERNS)) {
    let keyCount = 0;
    const ttl = { maximum: 0, persistent: 0, expiredDuringScan: 0 };
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 500 })) {
      keyCount += 1;
      const [remaining, value] = await Promise.all([redis.pTTL(key), redis.get(key)]);
      if (remaining === -1) ttl.persistent += 1;
      else if (remaining === -2 || value === null) ttl.expiredDuringScan += 1;
      else ttl.maximum = Math.max(ttl.maximum, remaining);
      if (family === "loginFailureCounter" && Number(value) >= 5) stateCounts.activeLoginLockouts += 1;
      if (value && (family === "deviceAuthorization" || family === "runnerDevice" || family === "workerDevice")) {
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          if (family === "deviceAuthorization") {
            if (parsed.authorized === true) stateCounts.deviceAuthorized += 1;
            else stateCounts.devicePending += 1;
          } else if (parsed.status === "approved") stateCounts.pairingApproved += 1;
          else if (parsed.status === "pending") stateCounts.pairingPending += 1;
        } catch { stateCounts.malformedValues += 1; }
      }
    }
    counts[family] = keyCount;
    ttlMs[family] = ttl;
  }
  return { counts, ttlMs, stateCounts };
}
