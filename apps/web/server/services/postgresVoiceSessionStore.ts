import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface VoiceSessionToken {
  userId: number;
  tenantId: string;
}

const TOKEN_NAMESPACE = "voice:token";
const ACTIVE_NAMESPACE = "voice:active";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function isVoiceSessionActive(userId: number): Promise<boolean> {
  const result = await getDb().execute(sql<Array<{ present: number }>>`
    SELECT 1 AS present FROM runtime_ephemeral_values
    WHERE namespace = ${ACTIVE_NAMESPACE}
      AND key_hash = ${hashKey(String(userId))}
      AND expires_at > now()
    LIMIT 1
  `);
  return result.length > 0;
}

export async function issueVoiceSessionToken(
  token: string,
  payload: VoiceSessionToken,
  ttlSeconds: number,
): Promise<void> {
  const result = await getDb().execute(sql<Array<{ key_hash: string }>>`
    INSERT INTO runtime_ephemeral_values (namespace, key_hash, value, expires_at)
    VALUES (${TOKEN_NAMESPACE}, ${hashKey(token)}, ${JSON.stringify(payload)}::jsonb,
      now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
    WHERE runtime_ephemeral_values.expires_at <= now()
    RETURNING key_hash
  `);
  if (result.length === 0) throw new Error("VOICE_TOKEN_COLLISION");
}

/** Atomically consume a token so it cannot authorize two WebSocket upgrades. */
export async function consumeVoiceSessionToken(token: string): Promise<VoiceSessionToken | null> {
  const result = await getDb().execute(sql<Array<{ value: VoiceSessionToken }>>`
    DELETE FROM runtime_ephemeral_values
    WHERE namespace = ${TOKEN_NAMESPACE}
      AND key_hash = ${hashKey(token)}
      AND expires_at > now()
    RETURNING value
  `);
  return result[0]?.value ?? null;
}

/** Claim the one-session-per-user slot, with an owner value for safe release. */
export async function claimVoiceSession(
  userId: number,
  owner: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await getDb().execute(sql<Array<{ key_hash: string }>>`
    INSERT INTO runtime_ephemeral_values (namespace, key_hash, value, expires_at)
    VALUES (${ACTIVE_NAMESPACE}, ${hashKey(String(userId))}, ${JSON.stringify(owner)}::jsonb,
      now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
    WHERE runtime_ephemeral_values.expires_at <= now()
    RETURNING key_hash
  `);
  return result.length > 0;
}

export async function releaseVoiceSession(userId: number, owner: string): Promise<void> {
  await getDb().execute(sql`
    DELETE FROM runtime_ephemeral_values
    WHERE namespace = ${ACTIVE_NAMESPACE}
      AND key_hash = ${hashKey(String(userId))}
      AND value = ${JSON.stringify(owner)}::jsonb
  `);
}
