import { createClient } from "redis";
import { getDb } from "../server/db";
import { importLoginFailureCounters, LOGIN_FAILURE_THRESHOLD, type LoginFailureCounterImport } from "../server/services/loginFailureCounterStore";

const APPLY = process.argv.includes("--apply");
const PREFIX = "auth:login:fail:";
const REDIS_URL = process.env.TOKEN_REVOKE_REDIS_URL || process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("Set the same Redis URL used by the Web cache client");
if (APPLY && (process.env.AUTH_STATE_MAINTENANCE_CONFIRMED !== "1" || process.env.AUTH_WRITERS_PAUSED !== "1")) {
  throw new Error("Apply requires AUTH_STATE_MAINTENANCE_CONFIRMED=1 and AUTH_WRITERS_PAUSED=1 after every auth writer is paused");
}

const redis = createClient({ url: REDIS_URL });
redis.on("error", () => {});

async function main() {
  await redis.connect();
  const records: LoginFailureCounterImport[] = [];
  let scanned = 0;
  let expiredOrMissing = 0;
  let invalid = 0;
  let persistent = 0;
  let activeLockouts = 0;
  for await (const key of redis.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 500 })) {
    if (!key.startsWith(PREFIX)) continue;
    scanned += 1;
    const email = key.slice(PREFIX.length);
    const [value, ttlMs] = await Promise.all([redis.get(key), redis.pTTL(key)]);
    if (ttlMs === -2 || value === null) { expiredOrMissing += 1; continue; }
    const failureCount = Number(value);
    if (!email || !Number.isSafeInteger(failureCount) || failureCount < 1) { invalid += 1; continue; }
    const expiresAt = ttlMs === -1 ? null : new Date(Date.now() + ttlMs);
    if (expiresAt && expiresAt <= new Date()) { expiredOrMissing += 1; continue; }
    if (ttlMs === -1) persistent += 1;
    if (failureCount >= LOGIN_FAILURE_THRESHOLD) activeLockouts += 1;
    records.push({ email, failureCount, expiresAt });
  }
  if (APPLY && invalid === 0) await importLoginFailureCounters(records);
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scannedKeys: scanned,
    activeCounters: records.length,
    activeLockouts,
    persistentCounters: persistent,
    expiredOrMissing,
    invalidEntries: invalid,
    imported: APPLY && invalid === 0 ? records.length : 0,
    rawEmailsOrValuesLogged: false,
  }));
  await redis.quit();
  await getDb().$client.end({ timeout: 5 });
  if (APPLY && invalid > 0) process.exitCode = 2;
}

main().catch(async () => {
  console.error("Login counter transfer failed; no account identifier or connection detail was logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  try { await getDb().$client.end({ timeout: 5 }); } catch {}
  process.exitCode = 1;
});
