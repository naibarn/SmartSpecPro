import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
const f = vi.hoisted(() => ({ jobId: "11111111-1111-4111-8111-111111111111", digest: "a".repeat(64), role: "sah_cf_prod_0123456789ab" }));
vi.mock("./cloudflareProductionDatabaseExecutor", async original => ({ ...(await original<any>()), createCloudflareProductionDatabaseRuntime: () => ({
  resolveGrant: async () => ({ grant: { planDigest: f.digest, requesterUserId: 17, plan: { databaseUser: f.role, databaseName: process.env.M1_FIXTURE_DATABASE } } })
}) }));
vi.mock("./cloudflareProductionDatabaseRecovery", () => ({ inspectProductionDatabaseRecovery: async () => ({
  vpcServiceId: "01a175b0-3c44-7131-8805-2cd56db223ac", hyperdriveId: "db6b46010af44ad381dd6e3e2674913a" }) }));
vi.mock("./cloudflareProductionDatabaseReconciliation", async original => ({ ...(await original<any>()),
  readProductionDatabaseReadbackObservation: async () => ({ databaseConnectionVerified: true, restrictedRoleVerified: true }) }));
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("Owner M1 fixture operation: actual database atomicity and tenant scope", () => {
  let disposable: any, client: any, db: any, service: typeof import("./cloudflareProductionTenantIsolation"), closeDb: any;
  const previous = new Map<string, string | undefined>();
  const scope = { jobId: f.jobId, tenantId: "tenant-fixture-owner", projectId: "project-fixture-owner", actorUserId: 17 };
  beforeAll(async () => {
    for (const k of ["DATABASE_URL","NODE_ENV","M1_FIXTURE_DATABASE"]) previous.set(k,process.env[k]);
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    Object.assign(process.env,{DATABASE_URL:disposable.databaseUrl,NODE_ENV:"test",M1_FIXTURE_DATABASE:new URL(disposable.databaseUrl).pathname.slice(1)});
    client = (await import("postgres")).default(disposable.databaseUrl,{max:2});
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client,[schema.systemSettings,schema.users,schema.tenants]);
    await client.unsafe(`CREATE TABLE canonical_projects(tenant_id text,project_id text,lifecycle text,owner_principal_id text);
      CREATE TABLE emergency_reports(id text PRIMARY KEY,"tenantId" text,"publicRef" text,"idempotencyKeyHash" text,"reportType" text,status text,summary text,"detailsJson" jsonb);
      CREATE TABLE emergency_cases(id text PRIMARY KEY,"tenantId" text,"reportId" text,status text,"caseContextJson" jsonb);
      CREATE TABLE emergency_case_events(id text PRIMARY KEY,"tenantId" text,"caseId" text,"eventIdempotencyKey" text,"actorType" text,"actorRef" text,"eventType" text,reason text,revision int,"eventHash" text,"payloadJson" jsonb);
      CREATE ROLE ${f.role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT;
      COMMENT ON ROLE ${f.role} IS 'smartspec:cloudflare-production-runtime:v1:${f.digest}';
      CREATE FUNCTION cloudflare_validate_emergency_intake_v1(text,text,integer,text,integer,text,text,text,jsonb,text) RETURNS boolean
        LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS 'SELECT false';
      COMMENT ON FUNCTION cloudflare_validate_emergency_intake_v1(text,text,integer,text,integer,text,text,text,jsonb,text)
        IS 'smartspec:cloudflare-production-fence:v1:${f.digest}';
      GRANT USAGE ON SCHEMA public TO ${f.role};
      GRANT SELECT(id,"tenantId") ON emergency_reports,emergency_cases TO ${f.role};
      GRANT SELECT("caseId","tenantId") ON emergency_case_events TO ${f.role};`);
    await client`INSERT INTO users(id,"openId",role) VALUES(17,'m1-owner','admin'),(18,'other-user','user')`;
    await client`INSERT INTO tenants(id,slug,name,"ownerId") VALUES(${scope.tenantId},'m1-fixture','Disposable fixture',17)`;
    await client`INSERT INTO canonical_projects VALUES(${scope.tenantId},${scope.projectId},'ACTIVE','user:17')`;
    await client`INSERT INTO worker_jobs(id,"tenantId","runtimeType","jobType","contractVersion","requestedByUserId",status,attempt,"maxAttempts","inputJson","errorCode")
      VALUES(${f.jobId},${scope.tenantId},'node_job_worker','cloudflare.production.database.provision','cloudflare-prod-db-provision-v1',17,'failed',4,4,
        ${client.json({projectId:scope.projectId,planDigest:f.digest})},'CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH')`;
    const connection = await import("../db");db=connection.getDb();closeDb=connection.closeDb;
    service=await import("./cloudflareProductionTenantIsolation");
  },30_000);
  afterAll(async()=>{if(closeDb)await closeDb();if(client)await client.end({timeout:3});if(disposable)await disposable.close();
    for(const[k,v]of previous)if(v===undefined)delete process.env[k];else process.env[k]=v;},20_000);
  it("prepares read-only and rejects wrong Owner, tenant and changed action before DDL",async()=>{
    const p=await service.getProductionTenantIsolationPreflight(db,scope);
    expect(p).toMatchObject({ready:true,prepared:false,syntheticRows:6,businessRowsRead:0,trafficMutation:false});
    expect(await client`SELECT id FROM tenants`).toHaveLength(1);
    expect(await client`SELECT id FROM emergency_reports`).toHaveLength(0);
    await expect(service.getProductionTenantIsolationPreflight(db,{...scope,actorUserId:18})).rejects.toThrow("JOB_SCOPE_DENIED");
    await expect(service.getProductionTenantIsolationPreflight(db,{...scope,tenantId:"foreign"})).rejects.toThrow("JOB_SCOPE_DENIED");
    await expect(service.prepareProductionTenantIsolation(db,{...scope,actionDigest:"f".repeat(64)})).rejects.toThrow("PLAN_CHANGED");
    expect(await client`SELECT 1 FROM pg_policies WHERE tablename LIKE 'emergency_%'`).toHaveLength(0);
  });
  it("rolls back policy and fixture tenant creation if any fixture insert fails",async()=>{
    const h=createHash("sha256").update(`m1-isolation:v1:${scope.jobId}:${scope.tenantId}:report`).digest("hex");
    const collision=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    await client`INSERT INTO emergency_reports(id,"tenantId",summary)VALUES(${collision},${scope.tenantId},'Existing disposable collision')`;
    const p=await service.getProductionTenantIsolationPreflight(db,scope);if(p.prepared)throw Error("unexpected");
    await expect(service.prepareProductionTenantIsolation(db,{...scope,actionDigest:p.actionDigest})).rejects.toThrow("M1_ISOLATION_DATABASE_SQLSTATE_23505");
    expect(await client`SELECT id FROM tenants`).toHaveLength(1);
    expect(await client`SELECT 1 FROM pg_policies WHERE tablename LIKE 'emergency_%'`).toHaveLength(0);
    expect(await client`SELECT key FROM system_settings WHERE category='cloudflare_production_tenant_fixtures'`).toHaveLength(0);
    expect((await client`SELECT summary FROM emergency_reports WHERE id=${collision}`)[0].summary).toBe('Existing disposable collision');
    await client`DELETE FROM emergency_reports WHERE id=${collision}`;
  });
  it("creates exactly six marked rows and an inactive fixture tenant once, preserves failed4/4 and records the Owner action",async()=>{
    const before=(await client`SELECT * FROM worker_jobs WHERE id=${scope.jobId}`)[0];
    const p=await service.getProductionTenantIsolationPreflight(db,scope);if(p.prepared)throw Error("unexpected");
    const receipt=await service.prepareProductionTenantIsolation(db,{...scope,actionDigest:p.actionDigest});
    expect(receipt).toMatchObject({acceptance:"NOT_ACCEPTED",syntheticRows:6,preparedBy:17});
    expect(await client`SELECT id FROM emergency_reports`).toHaveLength(2);
    expect(await client`SELECT id FROM emergency_cases`).toHaveLength(2);
    expect(await client`SELECT id FROM emergency_case_events`).toHaveLength(2);
    expect((await client`SELECT "isActive" FROM tenants WHERE id=${receipt.foreignTestTenantId}`)[0].isActive).toBe(false);
    expect(await service.prepareProductionTenantIsolation(db,{...scope,actionDigest:p.actionDigest})).toEqual(receipt);
    expect((await client`SELECT * FROM worker_jobs WHERE id=${scope.jobId}`)[0]).toEqual(before);
    expect(await client`SELECT 1 FROM worker_job_events WHERE "workerJobId"=${scope.jobId} AND "eventType"='PRODUCTION_DATABASE_TENANT_FIXTURES_PREPARED'`).toHaveLength(1);
    expect((await service.getProductionTenantIsolationPreflight(db,scope)).prepared).toBe(true);
  });
  it("records a fresh exact-scope isolation observation independently and rejects mismatched or stale assertions",async()=>{
    const prepared=await service.getProductionTenantIsolationPreflight(db,scope);if(!prepared.prepared)throw Error("fixture required");
    const own=prepared.fixture.fixtures.find((x:any)=>x.tenantId===scope.tenantId),foreign=prepared.fixture.fixtures.find((x:any)=>x.tenantId!==scope.tenantId);
    const postgres=(await import("postgres")).default;
    const url=new URL(disposable.databaseUrl);url.username=f.role;const restricted=postgres(url.toString(),{max:1});
    let isolation:any;
    try {isolation=await(await import("../../../cloudflare/src/productionTenantIsolationProbe")).probeProductionTenantIsolation(restricted as any,
      {tenantId:scope.tenantId,foreignTestTenantId:foreign.tenantId,reportA:own.reportId,reportB:foreign.reportId,caseA:own.caseId,caseB:foreign.caseId});}
    finally{await restricted.end({timeout:3});}
    expect(isolation.passed).toBe(true);
    // Simulated remote envelope in a disposable-only integration test, not live Edge evidence.
    const observation={runtime:"cloudflare-remote-preview",colo:"BKK",cfRay:"1234567890abcdef-BKK",diagnosticBundleDigest:`sha256:${"b".repeat(64)}`,
      observedAt:new Date().toISOString(),planDigest:f.digest,database:process.env.M1_FIXTURE_DATABASE,role:f.role,sql:"PASS",restrictedRoleVerified:true,
      deniedSchemaAccessVerified:true,readOnly:true,isolation};
    const input={jobId:scope.jobId,tenantId:scope.tenantId,projectId:scope.projectId,observation};
    await expect(service.recordProductionTenantIsolationObservation(db,{...input,observation:{...observation,role:"sah_cf_prod_ffffffffffff"}})).rejects.toThrow("SCOPE_DENIED");
    await expect(service.recordProductionTenantIsolationObservation(db,{...input,observation:{...observation,observedAt:"2020-01-01T00:00:00.000Z"}})).rejects.toThrow("SCOPE_DENIED");
    const accepted=await service.recordProductionTenantIsolationObservation(db,input);
    expect(accepted).toMatchObject({acceptance:"M1_ACCEPTED",canonicalEvidenceRecorded:true,grantRenewed:false,providerMutations:0,provisioningAttemptConsumed:false});
    const payload=(await client`SELECT "payloadJson" FROM worker_job_events WHERE "workerJobId"=${scope.jobId} AND "eventType"='PRODUCTION_DATABASE_TENANT_ISOLATION_VERIFIED'`)[0].payloadJson;
    const projected=service.projectProductionTenantIsolationObservation(payload,{jobId:scope.jobId,tenantId:scope.tenantId,projectId:scope.projectId,planDigest:f.digest,
      vpcServiceId:accepted.vpcServiceId,hyperdriveId:accepted.hyperdriveId!});
    expect(projected?.acceptance).toBe("M1_ACCEPTED");
    expect(service.projectProductionTenantIsolationObservation({...payload,tenantId:"foreign"},{jobId:scope.jobId,tenantId:scope.tenantId,projectId:scope.projectId,
      planDigest:f.digest,vpcServiceId:accepted.vpcServiceId,hyperdriveId:accepted.hyperdriveId!})).toBeNull();
    expect((await client`SELECT status,attempt,"maxAttempts" FROM worker_jobs WHERE id=${scope.jobId}`)[0]).toEqual({status:"failed",attempt:4,maxAttempts:4});
  });
});
