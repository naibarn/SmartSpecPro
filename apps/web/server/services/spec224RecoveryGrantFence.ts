import { sql } from "drizzle-orm";

import type { DrizzleDB } from "../db";

const FENCE_SEED = 224;

export function spec224RecoveryGrantFenceIdentity(input: {
  tenantId: string;
  grantId: string;
}): string {
  if (!input.tenantId || !/^[0-9a-f-]{36}$/i.test(input.grantId)) {
    throw new Error("SPEC224_RECOVERY_GRANT_FENCE_IDENTITY_INVALID");
  }
  return `spec224:recovery-grant:${input.tenantId}:${input.grantId}`;
}

/**
 * Shared with Python ApprovalDBService.revoke_spec224_recovery_grant.
 * PostgreSQL owns the hash and the xact lock; callers must pass the
 * tenant/grant identity read from canonical persistence, never request data.
 */
export async function acquireSpec224RecoveryGrantFence(
  tx: DrizzleDB,
  input: { tenantId: string; grantId: string }
): Promise<void> {
  const fenceIdentity = spec224RecoveryGrantFenceIdentity(input);
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${fenceIdentity}, ${FENCE_SEED}))
  `);
}
