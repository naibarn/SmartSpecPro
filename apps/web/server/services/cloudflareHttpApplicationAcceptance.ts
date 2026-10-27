import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";

type FixturePlan = { m1JobId: string; foreignTestTenantId: string; evidenceDigest: string };
type AcceptanceScope = { jobId: string; tenantId: string; projectId: string; actorUserId: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = (): never => { throw Error("HTTP_APPLICATION_FIXTURE_SCOPE_INVALID"); };

/** Creates one password-login account in the selected tenant and binds the
 * cross-tenant negative probe to the already accepted M1 synthetic tenant. No tenant, business, credit, billing or job
 * data is written; generated passwords are returned only to the encrypted
 * execution checkpoint and the capability-protected Worker probe. */
export async function createHttpApplicationAcceptanceFixtures(db: DrizzleDB, scope: AcceptanceScope, plan: FixturePlan,
  onCreated?: (transaction: DrizzleDB, fixture: { primary: { email: string; password: string; tenantId: string; userId: number };
    users: Array<{ id: number; email: string; tenantId: string; role: string }> }) => Promise<void>) {
  if (!/^tenant-codex-[a-f0-9-]{1,24}$/.test(plan.foreignTestTenantId) || plan.foreignTestTenantId === scope.tenantId ||
      !/^[a-f0-9]{64}$/.test(plan.evidenceDigest) || !/^[a-f0-9-]{36}$/.test(plan.m1JobId) || !/^[a-f0-9-]{36}$/.test(scope.jobId)) invalid();
  const suffix = hash(`cloudflare-m3-application-acceptance-v1:${scope.jobId}:${scope.tenantId}:${plan.foreignTestTenantId}`).slice(0, 16);
  const user = { email: `m3-accept-${suffix}-a@example.invalid`, tenantId: scope.tenantId, role: "primary" as const,
    password: `${randomBytes(32).toString("base64url")}Aa7` };
  const bcrypt = await import("bcrypt");
  const created: Array<{ id: number; email: string; tenantId: string; role: string }> = [];
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-m3-fixtures:${scope.jobId}`}))`);
      const tenantRows = await tx.execute(sql`SELECT id,"ownerId","isActive" FROM tenants
        WHERE id IN (${scope.tenantId},${plan.foreignTestTenantId}) ORDER BY id FOR KEY SHARE`);
      const primaryTenant = tenantRows.find(row => row.id === scope.tenantId), foreignTenant = tenantRows.find(row => row.id === plan.foreignTestTenantId);
      if (tenantRows.length !== 2 || Number(primaryTenant?.ownerId) !== scope.actorUserId || primaryTenant?.isActive !== true ||
          Number(foreignTenant?.ownerId) !== scope.actorUserId || foreignTenant?.isActive !== false) invalid();
      const collisions = await tx.execute(sql`SELECT id FROM users WHERE lower(btrim(email))=lower(btrim(${user.email}))
        OR "openId"=${`m3accept_${hash(`${scope.jobId}:${user.role}`).slice(0, 40)}`} LIMIT 1`);
      if (collisions.length) throw Error("HTTP_APPLICATION_FIXTURE_IDEMPOTENCY_COLLISION");
      const passwordHash = await bcrypt.hash(user.password, 12);
      const openId = `m3accept_${hash(`${scope.jobId}:${user.role}`).slice(0, 40)}`;
      const rows = await tx.execute(sql`INSERT INTO users ("openId",email,name,password,"loginMethod",role,"currentTenantId",credits,"isDisabled","lastSignedIn")
        VALUES (${openId},${user.email},'Cloudflare synthetic acceptance',${passwordHash},'email','user',${user.tenantId},0,false,now()) RETURNING id`);
      if (rows.length !== 1 || !Number.isSafeInteger(Number(rows[0].id))) throw Error("HTTP_APPLICATION_FIXTURE_CREATE_FAILED");
      created.push({ id: Number(rows[0].id), email: user.email, tenantId: user.tenantId, role: user.role });
      await onCreated?.(tx as unknown as DrizzleDB, { primary: { email: user.email, password: user.password, tenantId: user.tenantId,
        userId: created[0].id }, users: created });
    });
  } catch (error) {
    if (created.length) {
      try { await removeHttpApplicationAcceptanceFixtures(db, scope, created); }
      catch { throw Error("HTTP_APPLICATION_FIXTURE_CLEANUP_REQUIRED"); }
    }
    if (error instanceof Error && /^HTTP_APPLICATION_[A-Z0-9_]+$/.test(error.message)) throw error;
    throw Error("HTTP_APPLICATION_FIXTURE_CREATE_FAILED");
  }
  return {
    primary: { email: user.email, password: user.password, tenantId: user.tenantId, userId: created[0].id },
    foreignTenantId: plan.foreignTestTenantId,
    users: created,
  };
}

/** Deletes only the two exact synthetic user IDs recorded by this executor.
 * It is idempotent and will not remove accounts whose email/tenant marker
 * changed during the test. */
export async function removeHttpApplicationAcceptanceFixtures(db: DrizzleDB, scope: AcceptanceScope,
  users: Array<{ id: number; email: string; tenantId: string; role: string }>) {
  if (users.length > 1 || users.some(user => !Number.isSafeInteger(user.id) ||
      !/^m3-accept-[a-f0-9]{16}-a@example\.invalid$/.test(user.email) || user.tenantId !== scope.tenantId || user.role !== "primary")) invalid();
  if (!users.length) return { removed: 0 };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloudflare-m3-fixtures:${scope.jobId}`}))`);
    const expected = users.map(user => ({ id: user.id, email: user.email, tenantId: user.tenantId }));
    const removed = await tx.execute(sql`DELETE FROM users u USING (VALUES ${sql.join(expected.map(user =>
      sql`(${user.id}::integer,${user.email}::text,${user.tenantId}::varchar)`), sql`,`)}) AS fixture(id,email,tenant_id)
      WHERE u.id=fixture.id AND u.email=fixture.email AND u."currentTenantId"=fixture.tenant_id RETURNING u.id`);
    if (removed.length !== users.length) {
      const remaining = await tx.execute(sql`SELECT id FROM users WHERE id IN (${sql.join(users.map(user => sql`${user.id}`), sql`,`)})`);
      // Idempotent after a transaction rollback or an earlier exact cleanup;
      // a surviving row with a changed tenant/email marker remains a hard stop.
      if (remaining.length) throw Error("HTTP_APPLICATION_FIXTURE_CLEANUP_INCOMPLETE");
    }
    return { removed: removed.length };
  });
}
