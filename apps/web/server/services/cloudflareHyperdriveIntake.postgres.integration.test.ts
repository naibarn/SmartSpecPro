import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { executeHyperdriveEmergencyIntake } from "../../../cloudflare/src/emergencyHyperdriveIntake";
import { withHyperdrivePostgres } from "../../../cloudflare/src/postgresClient";
import type { CanonicalWorkerExecution } from "../../../cloudflare/src/contracts";

const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("direct Hyperdrive intake semantics in owner-marked disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql: postgres.Sql;
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    sql = postgres(disposable.databaseUrl, { max: 2 });
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(sql);
    // Exact columns/constraints used by this transaction. Unused PostGIS
    // location columns are omitted; these tests do not certify spatial APIs.
    await sql.unsafe(`CREATE TABLE emergency_reports (
      id varchar(36) PRIMARY KEY,"tenantId" varchar(36) NOT NULL,"workerJobId" varchar(36),
      "publicRef" varchar(24),"idempotencyKeyHash" varchar(64),"reportType" varchar(64),summary text,
      status varchar(32) NOT NULL DEFAULT 'received',"updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await sql.unsafe(`CREATE TABLE emergency_cases (
      id varchar(36) PRIMARY KEY,"tenantId" varchar(36) NOT NULL,"reportId" varchar(36),
      status varchar(32) NOT NULL DEFAULT 'open',revision integer NOT NULL DEFAULT 0,
      "caseContextJson" jsonb NOT NULL DEFAULT '{}',"updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await sql.unsafe(`CREATE TABLE emergency_case_events (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),"tenantId" varchar(36) NOT NULL,"caseId" varchar(36) NOT NULL,
      "eventIdempotencyKey" varchar(160) NOT NULL,"actorType" varchar(24) NOT NULL,"actorRef" varchar(160),
      "eventType" varchar(64) NOT NULL,reason varchar(1000) NOT NULL,revision integer NOT NULL,
      "previousHash" varchar(64),"eventHash" varchar(64) NOT NULL,"payloadJson" jsonb NOT NULL DEFAULT '{}',
      "createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("tenantId","eventIdempotencyKey"),UNIQUE("caseId",revision))`);
  }, 30_000);
  afterAll(async () => { if (sql) await sql.end({ timeout: 5 }); if (disposable) await disposable.close(); }, 20_000);
  async function fixture() {
    const jobId = randomUUID(), reportId = randomUUID(), caseId = randomUUID(), attemptId = randomUUID(), dispatchId = randomUUID();
    const token = "disposable-lease-" + randomUUID(), hash = createHash("sha256").update(token).digest("hex");
    const input = { tenantId: "tenant-disposable-a", reportId }, dedupeKey = `job:${jobId}:attempt:1`;
    const envelope = { job_id: jobId, business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
      dispatch_id: dispatchId, dedupe_key: dedupeKey, routing_metadata: {} };
    await sql`INSERT INTO worker_jobs (id,"tenantId","runtimeType","jobType",status,"leaseOwnerToken","leaseExpiresAt","fencingVersion","inputJson")
      VALUES (${jobId},${input.tenantId},'node_job_worker','emergency.report.intake','running',${hash},now()+interval '5 minutes',1,${sql.json(input)})`;
    await sql`INSERT INTO worker_job_attempts (id,"workerJobId",attempt,"leaseGeneration","leaseTokenHash","leaseExpiresAt")
      VALUES (${attemptId},${jobId},1,1,${hash},now()+interval '5 minutes')`;
    await sql`INSERT INTO worker_job_dispatches (id,"workerJobId",adapter,"referenceNamespace","dedupeKey","publicationStatus","publishedAt","consumedAt")
      VALUES (${dispatchId},${jobId},'cloudflare-workflows','cloudflare',${dedupeKey},'consumed',now(),now())`;
    await sql`INSERT INTO worker_job_outbox (id,"workerJobId","envelopeVersion","envelopeJson","dedupeKey","publishedAt")
      VALUES (${dispatchId},${jobId},'feature-186-v1',${sql.json({ businessAttempt: 1 })},${dedupeKey},now())`;
    await sql`INSERT INTO emergency_reports (id,"tenantId","workerJobId","publicRef","idempotencyKeyHash","reportType",summary)
      VALUES (${reportId},${input.tenantId},${jobId},${reportId.slice(0,24)},${createHash('sha256').update(reportId).digest('hex')},'disposable_test','Automated disposable fixture')`;
    await sql`INSERT INTO emergency_cases (id,"tenantId","reportId",status,"caseContextJson")
      VALUES (${caseId},${input.tenantId},${reportId},'closed',${sql.json({ qualificationOnly: true })})`;
    const delivery: Parameters<CanonicalWorkerExecution>[0] = {
      env: { CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_JOB_TRANSPORT: "workflows", CLOUDFLARE_WORKFLOW_DATABASE: "hyperdrive-intake",
        CLOUDFLARE_WORKFLOW_TENANT_ID: input.tenantId, CLOUDFLARE_WORKFLOW_EXPIRES_AT: new Date(Date.now()+120_000).toISOString() },
      job: { jobId, tenantId: input.tenantId, jobType: "emergency.report.intake", executionClass: "short", businessAttempt: 1,
        contractVersion: "feature-186-v1", status: "running", operatorReviewRequired: false, input }, envelope,
      claim: { attemptId, leaseToken: token, fencingVersion: 1 },
    };
    return { delivery, jobId, reportId, caseId, dispatchId, attemptId };
  }
  function run(delivery: Parameters<CanonicalWorkerExecution>[0]) {
    return withHyperdrivePostgres({ connectionString: disposable.databaseUrl }, client => executeHyperdriveEmergencyIntake(delivery, client));
  }
  it("atomically performs the domain write, preserves legacy hash bytes, and serializes concurrent duplicate delivery", async () => {
    const f = await fixture();
    await Promise.all([run(f.delivery),run(f.delivery)]);
    const [report] = await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`;
    const [caseRow] = await sql`SELECT status,revision,"caseContextJson" FROM emergency_cases WHERE id=${f.caseId}`;
    const events = await sql`SELECT * FROM emergency_case_events WHERE "caseId"=${f.caseId}`;
    expect(report.status).toBe("triage"); expect(caseRow).toMatchObject({ status: "closed", revision: 1, caseContextJson: { qualificationOnly: true, intakeStatus: "triage_available" } });
    expect(events).toHaveLength(1);
    const e = events[0], payload = { revision: 1, intakeStatus: "triage_available", reportStatus: "triage" };
    const legacy = { tenantId: f.delivery.job.tenantId, caseId: f.caseId, previousHash: null, revision: 1,
      eventType: "triage_available", reason: "Emergency report is durably queued for human triage", actorType: "system",
      actorRef: "spec260.emergency-report-intake", payload, createdAt: e.createdAt.toISOString() };
    expect(e.eventHash).toBe(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"));
    // The Worker does not replace the canonical settlement owner.
    expect((await sql`SELECT status FROM worker_jobs WHERE id=${f.jobId}`)[0].status).toBe("running");
  });
  it.each(["token", "generation", "expired", "attempt", "dispatch", "quarantine", "stored-input", "stored-tenant", "report-job"])("rejects persisted %s substitution without domain writes", async scenario => {
    const f = await fixture();
    if (scenario === "token") f.delivery.claim.leaseToken = "foreign";
    if (scenario === "generation") await sql`UPDATE worker_jobs SET "fencingVersion"=2 WHERE id=${f.jobId}`;
    if (scenario === "expired") await sql`UPDATE worker_jobs SET "leaseExpiresAt"=now()-interval '1 second' WHERE id=${f.jobId}`;
    if (scenario === "attempt") await sql`UPDATE worker_job_attempts SET "leaseGeneration"=2 WHERE id=${f.attemptId}`;
    if (scenario === "dispatch") await sql`UPDATE worker_job_dispatches SET adapter='postgres-pull' WHERE id=${f.dispatchId}`;
    if (scenario === "quarantine") await sql`UPDATE worker_job_outbox SET "quarantinedAt"=now() WHERE id=${f.dispatchId}`;
    if (scenario === "stored-input") await sql`UPDATE worker_jobs SET "inputJson"='{}'::jsonb WHERE id=${f.jobId}`;
    if (scenario === "stored-tenant") await sql`UPDATE worker_jobs SET "tenantId"='tenant-disposable-b' WHERE id=${f.jobId}`;
    if (scenario === "report-job") await sql`UPDATE emergency_reports SET "workerJobId"=NULL WHERE id=${f.reportId}`;
    await expect(run(f.delivery)).rejects.toThrow(/HYPERDRIVE_INTAKE_/);
    expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("received");
    expect(await sql`SELECT id FROM emergency_case_events WHERE "caseId"=${f.caseId}`).toHaveLength(0);
  });
  it.each(["policy", "legacy"])("rejects an elapsed %s hard deadline despite a live lease", async mode => {
    const f = await fixture();
    await sql`UPDATE worker_jobs SET "startedAt"=now()-interval '2 seconds',"timeoutSeconds"=1,
      "timeoutPolicyJson"=${sql.json(mode === "policy" ? { hardTimeoutMs: 1 } : {})} WHERE id=${f.jobId}`;
    await expect(run(f.delivery)).rejects.toThrow("LEASE_STALE");
    expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("received");
    expect(await sql`SELECT id FROM emergency_case_events WHERE "caseId"=${f.caseId}`).toHaveLength(0);
  });
  it("rolls back domain writes when the hard deadline elapses inside the transaction", async () => {
    const f = await fixture();
    await sql`UPDATE worker_jobs SET "startedAt"=now(),"timeoutPolicyJson"=${sql.json({ hardTimeoutMs: 700 })} WHERE id=${f.jobId}`;
    await sql.unsafe(`CREATE FUNCTION delay_intake_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.9); RETURN NEW; END $$`);
    await sql.unsafe(`CREATE TRIGGER delay_intake_update BEFORE UPDATE ON emergency_cases FOR EACH ROW EXECUTE FUNCTION delay_intake_update()`);
    try {
      await expect(run(f.delivery)).rejects.toThrow("LEASE_STALE");
      expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("received");
      expect((await sql`SELECT revision FROM emergency_cases WHERE id=${f.caseId}`)[0].revision).toBe(0);
      expect(await sql`SELECT id FROM emergency_case_events WHERE "caseId"=${f.caseId}`).toHaveLength(0);
    } finally { await sql.unsafe(`DROP TRIGGER delay_intake_update ON emergency_cases`); }
  });
  it("rolls back all writes if a later database operation fails", async () => {
    const f = await fixture();
    await sql.unsafe(`CREATE FUNCTION reject_intake_case_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable write failure'; END $$`);
    await sql.unsafe(`CREATE TRIGGER reject_intake_case_update BEFORE UPDATE ON emergency_cases FOR EACH ROW EXECUTE FUNCTION reject_intake_case_update()`);
    try {
      await expect(run(f.delivery)).rejects.toThrow("disposable write failure");
      expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("received");
      expect(await sql`SELECT id FROM emergency_case_events WHERE "caseId"=${f.caseId}`).toHaveLength(0);
    } finally { await sql.unsafe(`DROP TRIGGER reject_intake_case_update ON emergency_cases`); }
  });
  it("cannot promote a read-only qualification role into a domain writer", async () => {
    const f = await fixture();
    await sql.unsafe(`CREATE ROLE disposable_hyperdrive_reader LOGIN`);
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO disposable_hyperdrive_reader`);
    await sql.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO disposable_hyperdrive_reader`);
    await sql.unsafe(`ALTER ROLE disposable_hyperdrive_reader SET default_transaction_read_only=on`);
    const url = new URL(disposable.databaseUrl); url.username = "disposable_hyperdrive_reader";
    await expect(withHyperdrivePostgres({ connectionString: url.href }, client => executeHyperdriveEmergencyIntake(f.delivery, client))).rejects.toThrow();
    expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("received");
  });
  it("admits the Queue capability only with its own exact persisted adapter", async () => {
    const f=await fixture();f.delivery.env.CLOUDFLARE_JOB_TRANSPORT="queues";
    await expect(run(f.delivery)).rejects.toThrow("LEASE_STALE");
    await sql`UPDATE worker_job_dispatches SET adapter='cloudflare-queues' WHERE id=${f.dispatchId}`;
    await run(f.delivery);
    expect((await sql`SELECT status FROM emergency_reports WHERE id=${f.reportId}`)[0].status).toBe("triage");
  });
});
