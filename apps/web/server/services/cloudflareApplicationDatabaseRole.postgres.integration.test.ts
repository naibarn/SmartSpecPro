import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest, applicationDatabaseRolePlanSchema, prepareApplicationDatabaseRole, assertReusableApplicationDatabaseRole } from "./cloudflareApplicationDatabaseRole";
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("native application role with real PostgreSQL and synthetic tenant RLS", () => {
  let disposable: any, client: any, db: any, closeDb: any, app: any;
  const prior = { database: process.env.DATABASE_URL, env: process.env.NODE_ENV };
  const scope = { tenantId: "tenant-runtime-fixture", projectId: "project-runtime-fixture" };
  const plan = () => ({ ...scope, databaseName: new URL(disposable.databaseUrl).pathname.slice(1),
    tables: ["runtime_role_fixture"], sequences: ["runtime_role_fixture_id_seq"],
    expiresAt: new Date(Date.now()+600_000).toISOString(), connectionLimit: 10 as const });
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl; process.env.NODE_ENV = "test";
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    await client.unsafe(`CREATE TABLE runtime_role_fixture(id serial PRIMARY KEY,tenant_id text NOT NULL,value text);
      INSERT INTO runtime_role_fixture(tenant_id,value) VALUES('tenant-a','synthetic-a'),('tenant-b','synthetic-b');
      ALTER TABLE runtime_role_fixture ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fixture_isolation ON runtime_role_fixture USING(tenant_id=current_setting('app.current_tenant_id',true))
        WITH CHECK(tenant_id=current_setting('app.current_tenant_id',true));
      CREATE TABLE runtime_unselected_fixture(id int);
      CREATE TABLE token_blacklist(jti text);
      CREATE TABLE agency_retired_fixture(id int);`);
    const connection = await import("../db"); db = connection.getDb(); closeDb = connection.closeDb;
  }, 30_000);
  afterAll(async () => { if (app) await app.end({ timeout: 2 }); if (closeDb) await closeDb(); if (client) await client.end({ timeout: 2 }); if (disposable) await disposable.close();
    if (prior.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=prior.database;
    if (prior.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=prior.env; }, 20_000);
  it("prepares exact selected DML grants with no privileged attributes, preserves Linux roles and excludes secrets from receipts", async () => {
    let secret: any;
    const baseline = await client`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    const p = plan(), receipt = await prepareApplicationDatabaseRole(db, { plan: p, assertAuthorized: async () => {}, saveSecret: async (_tx, value) => { secret=value; } });
    expect(receipt).toMatchObject({ role: applicationDatabaseRoleName(scope), planDigest: applicationDatabaseRolePlanDigest(p), superuser:false,bypassRls:false,ddlGranted:false,policiesChanged:false,linuxRoleChanged:false });
    expect(JSON.stringify(receipt)).not.toContain(secret.password);
    expect(await client`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`).toEqual(baseline);
    const url = new URL(disposable.databaseUrl); url.username=secret.role; url.password=secret.password;
    app = (await import("postgres")).default(url.toString(), { max: 1 });
    const [identity] = await app`SELECT current_user AS role`;
    expect(identity.role).toBe(secret.role);
    await expect(prepareApplicationDatabaseRole(db,{plan:p,assertAuthorized:async()=>{},saveSecret:async()=>{}})).rejects.toThrow("PREPARATION_DENIED");
  });
  it("enforces positive and cross-tenant SQL, missing/invalid contexts and authorized writes", async () => {
    expect(await app`SELECT value FROM runtime_role_fixture`).toHaveLength(0);
    await app.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_tenant_id','tenant-a',true)`;
      expect(await tx`SELECT value FROM runtime_role_fixture`).toEqual([{value:'synthetic-a'}]);
      expect(await tx`SELECT value FROM runtime_role_fixture WHERE tenant_id='tenant-b'`).toHaveLength(0);
      await tx`INSERT INTO runtime_role_fixture(tenant_id,value) VALUES('tenant-a','synthetic-write')`;
    });
    await expect(app.begin(async (tx: any) => { await tx`SELECT set_config('app.current_tenant_id','tenant-a',true)`;
      await tx`INSERT INTO runtime_role_fixture(tenant_id,value) VALUES('tenant-b','forbidden')`; })).rejects.toMatchObject({ code:'42501' });
    await app.begin(async (tx: any) => { await tx`SELECT set_config('app.current_tenant_id','invalid',true)`;
      expect(await tx`SELECT * FROM runtime_role_fixture`).toHaveLength(0); });
    expect(await app`SELECT * FROM runtime_role_fixture`).toHaveLength(0);
  });
  it("denies unselected/retired tables, persistent DDL and privilege escalation", async () => {
    await expect(app`SELECT * FROM runtime_unselected_fixture`).rejects.toMatchObject({code:'42501'});
    await expect(app`SELECT * FROM agency_retired_fixture`).rejects.toMatchObject({code:'42501'});
    await expect(app.unsafe('CREATE TABLE public.forbidden_fixture(id int)')).rejects.toMatchObject({code:'42501'});
    await expect(app.unsafe('CREATE ROLE forbidden_role')).rejects.toMatchObject({code:'42501'});
  });
  it("grants only read access to the reviewed Python revocation dependency and permits exact compensated reuse", async () => {
    const p = { ...plan(), projectId: "project-python-auth" }, role = applicationDatabaseRoleName(p);
    let secret: any;
    await prepareApplicationDatabaseRole(db, { plan: p, pythonAuthReadOnly: true, assertAuthorized: async () => {}, saveSecret: async (_tx, value) => { secret = value; } });
    const url = new URL(disposable.databaseUrl); url.username = role; url.password = secret.password;
    const connection = (await import("postgres")).default(url.toString(), { max: 1 });
    try {
      expect(await connection`SELECT jti FROM token_blacklist`).toEqual([]);
      await expect(connection`INSERT INTO token_blacklist(jti) VALUES ('fixture')`).rejects.toMatchObject({ code: "42501" });
    } finally { await connection.end({ timeout: 2 }); }
    await client.unsafe(`ALTER ROLE "${role}" NOLOGIN`);
    await expect(assertReusableApplicationDatabaseRole(db, p)).resolves.toBeUndefined();
  });
  it("rolls role creation back atomically on lost authority or secret checkpoint failure", async () => {
    for (const failure of ['authority','checkpoint']) {
      const p={...plan(),projectId:'project-'+failure}, role=applicationDatabaseRoleName({tenantId:p.tenantId,projectId:p.projectId});let checks=0;
      await expect(prepareApplicationDatabaseRole(db,{plan:p,assertAuthorized:async()=>{if(++checks===3&&failure==='authority')throw Error('FIXTURE_REVOKED');},
        saveSecret:async()=>{if(failure==='checkpoint')throw Error('FIXTURE_CHECKPOINT_FAILED');}})).rejects.toThrow('PREPARATION_DENIED');
      expect(await client`SELECT 1 FROM pg_roles WHERE rolname=${role}`).toHaveLength(0);
    }
  });
  it("rejects inherited PUBLIC schema creation and security-definer access before persisting a secret", async () => {
    for (const mode of ["schema", "definer"]) {
      const p = { ...plan(), projectId: `project-public-${mode}` }, role = applicationDatabaseRoleName(p);
      let saved = false;
      try {
        if (mode === "schema") await client.unsafe('CREATE SCHEMA runtime_public_fixture; GRANT CREATE ON SCHEMA runtime_public_fixture TO PUBLIC');
        else await client.unsafe("CREATE FUNCTION public.runtime_definer_fixture() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'");
        await expect(prepareApplicationDatabaseRole(db, { plan: p, assertAuthorized: async () => {}, saveSecret: async () => { saved = true; } })).rejects.toThrow("PREPARATION_DENIED");
        expect(saved).toBe(false);
        expect(await client`SELECT 1 FROM pg_roles WHERE rolname=${role}`).toHaveLength(0);
      } finally {
        if (mode === "schema") await client.unsafe('DROP SCHEMA runtime_public_fixture');
        else await client.unsafe('DROP FUNCTION public.runtime_definer_fixture()');
      }
    }
  });
  it("rejects retired/injected relations, missing tables, wrong database and expired or unbounded plans", async () => {
    for (const tables of [['agency_retired_fixture'],['workflows'],['runtime_role_fixture;DROP TABLE users'],['runtime_role_fixture','runtime_role_fixture']])
      expect(applicationDatabaseRolePlanSchema.safeParse({...plan(),tables}).success).toBe(false);
    for (const mutation of [{databaseName:'wrong_database'},{tables:['missing_relation']},{expiresAt:new Date(Date.now()-1000).toISOString()},
      {expiresAt:new Date(Date.now()+7_200_000).toISOString()}])
      await expect(prepareApplicationDatabaseRole(db,{plan:{...plan(),projectId:'project-negative',...mutation},assertAuthorized:async()=>{},saveSecret:async()=>{}})).rejects.toThrow('PREPARATION_DENIED');
  });
  it("grants exact quoted existing camelCase sequences without granting other sequences", async () => {
    await client.unsafe('CREATE TABLE runtime_mixed_fixture("fencingToken" serial PRIMARY KEY)');
    const p = { ...plan(), projectId: "project-mixed", tables: ["runtime_mixed_fixture"], sequences: ["runtime_mixed_fixture_fencingToken_seq"] };
    let secret: any;
    await prepareApplicationDatabaseRole(db, { plan: p, assertAuthorized: async () => {}, saveSecret: async (_tx, value) => { secret=value; } });
    const url = new URL(disposable.databaseUrl); url.username=secret.role; url.password=secret.password;
    const mixed = (await import("postgres")).default(url.toString(), { max: 1 });
    try {
      expect(await mixed.unsafe('INSERT INTO runtime_mixed_fixture DEFAULT VALUES RETURNING "fencingToken"')).toEqual([{ fencingToken: 1 }]);
      await expect(mixed.unsafe("SELECT nextval('runtime_role_fixture_id_seq')")).rejects.toMatchObject({ code: "42501" });
    } finally { await mixed.end({ timeout: 2 }); }
  });
  it("rotates only a disabled exact checkpoint-owned role under fresh authority and rolls failures back", async () => {
    const p = { ...plan(), projectId: "project-role-reuse" }, role = applicationDatabaseRoleName(p);
    let first: any, rotated: any;
    await prepareApplicationDatabaseRole(db, { plan: p, assertAuthorized: async () => {}, saveSecret: async (_tx, secret) => { first = secret; } });
    await expect(assertReusableApplicationDatabaseRole(db, p)).rejects.toThrow("PREPARATION_DENIED");
    await client.unsafe(`ALTER ROLE "${role}" NOLOGIN`);
    await expect(assertReusableApplicationDatabaseRole(db, p)).resolves.toBeUndefined();
    await client.unsafe(`GRANT SELECT ON runtime_unselected_fixture TO "${role}"`);
    await expect(assertReusableApplicationDatabaseRole(db, p)).rejects.toThrow("PREPARATION_DENIED");
    await client.unsafe(`REVOKE SELECT ON runtime_unselected_fixture FROM "${role}"`);
    await expect(prepareApplicationDatabaseRole(db, { plan: p, reuse: p, assertAuthorized: async () => {},
      saveSecret: async () => { throw Error("FIXTURE_CHECKPOINT_FAILED"); } })).rejects.toThrow("PREPARATION_DENIED");
    expect((await client`SELECT rolcanlogin FROM pg_roles WHERE rolname=${role}`)[0].rolcanlogin).toBe(false);
    const receipt = await prepareApplicationDatabaseRole(db, { plan: p, reuse: p, assertAuthorized: async () => {}, saveSecret: async (_tx, secret) => { rotated = secret; } });
    expect(rotated.password).not.toBe(first.password); expect(receipt.role).toBe(role);
    const url = new URL(disposable.databaseUrl); url.username = role; url.password = rotated.password;
    const connection = (await import("postgres")).default(url.toString(), { max: 1 });
    try { expect((await connection`SELECT current_user AS role`)[0].role).toBe(role); }
    finally { await connection.end({ timeout: 2 }); }
  });
});
