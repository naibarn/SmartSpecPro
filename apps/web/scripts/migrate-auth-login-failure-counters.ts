import { createClient } from "redis";
import { getDb } from "../server/db";
import { importLoginFailureCounters } from "../server/services/loginFailureCounterStore";
import {
  assertLoginFailureCounterScanIsSafeToApply,
  assertLoginFailureCounterScansMatchForApply,
  collectActiveLoginFailureCounters,
} from "../server/services/loginFailureCounterImporter";
import { assertRedisG2AuthStateSafeToApply, auditRedisG2AuthState } from "../server/services/redisG2AuthStateAudit";

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
  let snapshot = await collectActiveLoginFailureCounters(redis, PREFIX);
  let g2Audit: Awaited<ReturnType<typeof auditRedisG2AuthState>> | undefined;
  if (APPLY) {
    assertLoginFailureCounterScanIsSafeToApply(snapshot);
    const finalSnapshot = await collectActiveLoginFailureCounters(redis, PREFIX);
    assertLoginFailureCounterScanIsSafeToApply(finalSnapshot);
    assertLoginFailureCounterScansMatchForApply(snapshot, finalSnapshot);
    snapshot = finalSnapshot;
    g2Audit = await auditRedisG2AuthState(redis);
    assertRedisG2AuthStateSafeToApply(g2Audit);
    await importLoginFailureCounters(snapshot.records);
  }
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scannedKeys: snapshot.scannedKeys,
    activeCounters: snapshot.records.length,
    activeLockouts: snapshot.activeLockouts,
    persistentCounters: snapshot.persistentCounters,
    expiredOrMissing: snapshot.expiredOrMissing,
    invalidEntries: snapshot.invalidEntries,
    g2Audit: g2Audit?.stateCounts,
    imported: APPLY ? snapshot.records.length : 0,
    rawEmailsOrValuesLogged: false,
  }));
  await redis.quit();
  await getDb().$client.end({ timeout: 5 });
}

main().catch(async () => {
  console.error("Login counter transfer failed; no account identifier or connection detail was logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  try { await getDb().$client.end({ timeout: 5 }); } catch {}
  process.exitCode = 1;
});
