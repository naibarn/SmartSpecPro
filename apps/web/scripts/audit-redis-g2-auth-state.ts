import { createClient } from "redis";

const REDIS_URL = process.env.TOKEN_REVOKE_REDIS_URL || process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("Set the same Redis URL used by the Web cache client");

const patterns = {
  deviceAuthorization: "devicecode:*",
  loginFailureCounter: "auth:login:fail:*",
  runnerDevice: "runner:connect:device:*",
  runnerUser: "runner:connect:user:*",
  workerDevice: "worker-connect:device:*",
  workerUser: "worker-connect:user:*",
} as const;
const redis = createClient({ url: REDIS_URL });
redis.on("error", () => {});

async function main() {
  await redis.connect();
  const counts: Record<string, number> = {};
  const ttlMs: Record<string, { maximum: number; persistent: number; expiredDuringScan: number }> = {};
  const stateCounts = { activeLoginLockouts: 0, devicePending: 0, deviceAuthorized: 0, pairingPending: 0, pairingApproved: 0, malformedValues: 0 };
  for (const [family, pattern] of Object.entries(patterns)) {
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
  console.log(JSON.stringify({ scannedAt: new Date().toISOString(), counts, ttlMs, stateCounts, rawKeysEmailsCodesAndValuesLogged: false }));
  await redis.quit();
}

main().catch(async () => {
  console.error("Redis auth-state audit failed; no key, account, code or connection detail was logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  process.exitCode = 1;
});
