import { getDb } from "../server/db";
import { createEphemeralAuthorizationSessionStore } from "../server/services/ephemeralAuthorizationSessionStore";

const APPLY = process.argv.includes("--apply");
if (APPLY && process.env.AUTH_SESSION_KEY_ROTATION_CONFIRMED !== "1") {
  throw new Error("Apply requires AUTH_SESSION_KEY_ROTATION_CONFIRMED=1 after every Web instance has the complete keyring");
}

async function main() {
  const store = createEphemeralAuthorizationSessionStore(getDb());
  let scanned = 0;
  let rotated = 0;
  if (!APPLY) {
    scanned = await store.countSessionsNeedingKeyRotation();
  } else {
    while (true) {
      const result = await store.rotateEncryptionKeyBatch(100);
      scanned += result.scanned;
      rotated += result.rotated;
      if (result.scanned === 0) break;
      // No progress means concurrent writers won every compare-and-swap. Retry
      // after yielding rather than claiming rotation is complete.
      if (result.rotated === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", keyIdsOrPayloadsLogged: false, scanned, rotated }));
  await getDb().$client.end({ timeout: 5 });
}

main().catch(async () => {
  console.error("Pairing session key rotation failed; no key material or session data was logged");
  try { await getDb().$client.end({ timeout: 5 }); } catch {}
  process.exitCode = 1;
});
