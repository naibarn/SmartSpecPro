import { createClient } from "redis";
import { getDb } from "../server/db";
import { importLoginFailureCounters } from "../server/services/loginFailureCounterStore";
import { collectActiveLoginFailureCounters } from "../server/services/loginFailureCounterImporter";

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
  const snapshot = await collectActiveLoginFailureCounters(redis, PREFIX);
  if (APPLY && snapshot.invalidEntries === 0) await importLoginFailureCounters(snapshot.records);
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scannedKeys: snapshot.scannedKeys,
    activeCounters: snapshot.records.length,
    activeLockouts: snapshot.activeLockouts,
    persistentCounters: snapshot.persistentCounters,
    expiredOrMissing: snapshot.expiredOrMissing,
    invalidEntries: snapshot.invalidEntries,
    imported: APPLY && snapshot.invalidEntries === 0 ? snapshot.records.length : 0,
    rawEmailsOrValuesLogged: false,
  }));
  await redis.quit();
  await getDb().$client.end({ timeout: 5 });
  if (APPLY && snapshot.invalidEntries > 0) process.exitCode = 2;
}

main().catch(async () => {
  console.error("Login counter transfer failed; no account identifier or connection detail was logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  try { await getDb().$client.end({ timeout: 5 }); } catch {}
  process.exitCode = 1;
});
