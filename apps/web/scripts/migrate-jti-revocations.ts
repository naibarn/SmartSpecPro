import { createClient } from "redis";
import { getDb } from "../server/db";
import { hashJti, importJtiRevocationRecords, type JtiRevocationRecord } from "../server/_core/revocation";

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
  const records = new Map<string, JtiRevocationRecord>();
  let scanned = 0;
  let expiredOrMissing = 0;
  let ignoredValues = 0;
  let persistent = 0;
  let invalidIdentifiers = 0;

  for await (const key of redis.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 500 })) {
    if (!key.startsWith(PREFIX)) continue;
    scanned += 1;
    const jti = key.slice(PREFIX.length);
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
      ignoredValues += 1;
      continue;
    }
    const expiresAt = ttlMs === -1 ? null : new Date(Date.now() + ttlMs);
    if (expiresAt && expiresAt <= new Date()) { expiredOrMissing += 1; continue; }
    if (ttlMs === -1) persistent += 1;
    const jtiHash = hashJti(jti);
    const current = records.get(jtiHash);
    if (!current || (current.expiresAt !== null && expiresAt === null) ||
        (current.expiresAt && expiresAt && expiresAt > current.expiresAt)) {
      records.set(jtiHash, { jtiHash, expiresAt });
    }
  }

  if (APPLY) {
    const pending = [...records.values()];
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      await importJtiRevocationRecords(pending.slice(offset, offset + BATCH_SIZE));
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scannedKeys: scanned,
    activeRevocations: records.size,
    persistentRevocations: persistent,
    expiredOrMissing,
    ignoredNonRevocationValues: ignoredValues,
    invalidIdentifiers,
    imported: APPLY ? records.size : 0,
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
