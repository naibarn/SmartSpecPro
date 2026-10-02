import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type IdempotencyResponse = {
  statusCode: number;
  body: string;
  contentType?: string;
};

type ExistingIdempotencyRow = {
  status: "processing" | "complete";
  response: IdempotencyResponse | null;
};

export type IdempotencyClaim =
  | { kind: "claimed"; claimId: string }
  | { kind: "processing" }
  | { kind: "complete"; response: IdempotencyResponse };

function keyHash(tenantId: string, key: string): string {
  return createHash("sha256").update(`${tenantId}\0${key}`).digest("hex");
}

export async function claimIdempotencyKey(tenantId: string, key: string): Promise<IdempotencyClaim> {
  const hash = keyHash(tenantId, key);
  const claimId = randomUUID();
  const inserted = await getDb().execute(sql<Array<{ claim_id: string }>>`
    INSERT INTO api_idempotency_responses (key_hash, claim_id, status, response, lease_until, expires_at, updated_at)
    VALUES (${hash}, ${claimId}::uuid, 'processing', NULL, now() + interval '60 seconds', now() + interval '1 day', now())
    ON CONFLICT (key_hash) DO UPDATE SET
      claim_id = EXCLUDED.claim_id,
      status = 'processing',
      response = NULL,
      lease_until = EXCLUDED.lease_until,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE api_idempotency_responses.expires_at <= now()
       OR (api_idempotency_responses.status = 'processing' AND api_idempotency_responses.lease_until <= now())
    RETURNING claim_id::text
  `);
  if (inserted[0]) return { kind: "claimed", claimId: inserted[0].claim_id };

  const existing = await getDb().execute(sql<Array<ExistingIdempotencyRow>>`
    SELECT status, response FROM api_idempotency_responses
    WHERE key_hash = ${hash} AND expires_at > now()
  `);
  const row = existing[0];
  if (row?.status === "complete" && row.response) return { kind: "complete", response: row.response };
  return { kind: "processing" };
}

export async function completeIdempotencyKey(
  tenantId: string,
  key: string,
  claimId: string,
  response: IdempotencyResponse,
  ttlSeconds: number,
): Promise<void> {
  await getDb().execute(sql`
    UPDATE api_idempotency_responses
    SET status = 'complete', response = ${JSON.stringify(response)}::jsonb,
        claim_id = NULL, lease_until = NULL,
        expires_at = now() + (${ttlSeconds} * interval '1 second'), updated_at = now()
    WHERE key_hash = ${keyHash(tenantId, key)} AND claim_id = ${claimId}::uuid AND status = 'processing'
  `);
}

export async function releaseIdempotencyClaim(tenantId: string, key: string, claimId: string): Promise<void> {
  await getDb().execute(sql`
    DELETE FROM api_idempotency_responses
    WHERE key_hash = ${keyHash(tenantId, key)} AND claim_id = ${claimId}::uuid AND status = 'processing'
  `);
}
