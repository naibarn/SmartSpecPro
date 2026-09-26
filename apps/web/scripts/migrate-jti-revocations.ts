import { createClient } from "redis";
import { getDb } from "../server/db";
import { importJtiRevocationRecords } from "../server/_core/revocation";
import { collectActiveJtiRevocations } from "../server/services/jtiRevocationImporter";

const APPLY = process.argv.includes("--apply");
const PREFIX = process.env.TOKEN_REVOKE_PREFIX || "revoked:";
const REDIS_URL = process.env.TOKEN_REVOKE_REDIS_URL || process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
const BATCH_SIZE = 250;

if (!REDIS_URL) throw new Error("Set REDIS_URL or TOKEN_REVOKE_REDIS_URL before running this migration");
if (!PREFIX || /[*?\[\]\\]/.test(PREFIX)) {
  throw new Error("TOKEN_REVOKE_PREFIX must be a literal prefix without Redis glob characters");
}
if (APPLY && (process.env.JTI_REVOCATION_MAINTENANCE_CONFIRMED !== "1" || process.env.AUTH_WRITERS_PAUSED !== "1")) {
  throw new Error("Apply requires JTI_REVOCATION_MAINTENANCE_CONFIRMED=1 and AUTH_WRITERS_PAUSED=1 after every auth writer is paused");
}

const redis = createClient({ url: REDIS_URL });
redis.on("error", () => {}); // Never log connection details or credential-bearing URLs.

async function main() {
  await redis.connect();
  const snapshot = await collectActiveJtiRevocations(redis, PREFIX);

  if (APPLY) {
    const pending = snapshot.records;
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      await importJtiRevocationRecords(pending.slice(offset, offset + BATCH_SIZE));
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scannedKeys: snapshot.scannedKeys,
    activeRevocations: snapshot.records.length,
    persistentRevocations: snapshot.persistentRevocations,
    expiredOrMissing: snapshot.expiredOrMissing,
    ignoredNonRevocationValues: snapshot.ignoredNonRevocationValues,
    invalidIdentifiers: snapshot.invalidIdentifiers,
    imported: APPLY ? snapshot.records.length : 0,
    rawIdentifiersLogged: false,
  }));
  await redis.quit();
  const db = getDb();
  await db.$client.end({ timeout: 5 });
}

main().catch(async () => {
  console.error("JTI revocation transfer failed; no raw token identifiers or connection details were logged");
  try { if (redis.isOpen) await redis.quit(); } catch {}
  process.exitCode = 1;
});
