import { createClient } from "redis";
import { auditRedisG2AuthState } from "../server/services/redisG2AuthStateAudit";

const REDIS_URL = process.env.TOKEN_REVOKE_REDIS_URL || process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("Set the same Redis URL used by the Web cache client");

const redis = createClient({ url: REDIS_URL });
redis.on("error", () => {});

async function main() {
  await redis.connect();
  const snapshot = await auditRedisG2AuthState(redis);
  console.log(JSON.stringify({ scannedAt: new Date().toISOString(), ...snapshot, rawKeysEmailsCodesAndValuesLogged: false }));
  await redis.quit();
}

main().catch(async () => {
  console.error("Redis auth-state audit failed; no key, account, code or connection detail was logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  process.exitCode = 1;
});
