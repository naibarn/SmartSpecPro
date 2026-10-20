import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { PUBLIC_RUNNER_RELEASE_SELECT, PUBLIC_RUNNER_RELEASE_PREDICATE } from "../../../../packages/shared/src/cloudflarePublicReleases";
import { handleRunnerReleaseCatalog } from "../../../cloudflare/src/runnerReleaseCatalog";

const suite = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("native public Runner catalog against disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql: postgres.Sql, closeDb: () => Promise<void>;
  const previousUrl = process.env.DATABASE_URL;
  const namespace = "smartspec-staging-aaaaaaaaaaaa", viewName = "sah_cf_releases_aaaaaaaaaaaa";
  const env = () => ({ CLOUDFLARE_RUNNER_RELEASE_NAMESPACE: namespace, CLOUDFLARE_RUNNER_RELEASE_CATALOG: "hyperdrive", CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT: new Date(Date.now()+120_000).toISOString(), HYPERDRIVE: { connectionString: disposable.databaseUrl } });
  const request = (suffix = "") => new Request("https://smartaihub.app/api/runner-releases"+suffix);
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    sql = postgres(disposable.databaseUrl, { max: 2 }); process.env.DATABASE_URL = disposable.databaseUrl;
    const { runnerReleaseAssets } = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(sql, [runnerReleaseAssets]);
    closeDb = (await import("../db")).closeDb;
    for (const [id, version, channel, assetKind, isPublished, withdrawnAt, validationStatus, platform] of [
      [1, "1.9.0", "stable", "package", true, null, "valid", "linux"],
      [2, "1.10.0", "stable", "package", true, null, "valid", "linux"],
      [3, "1.11.0", "stable", "update_binary", true, null, "valid", "linux"],
      [4, "99.0.0", "beta", "package", true, null, "valid", "linux"],
      [5, "88.0.0", "stable", "package", false, null, "valid", "linux"],
      [6, "77.0.0", "stable", "package", true, new Date(), "valid", "linux"],
      [7, "66.0.0", "stable", "package", true, null, "invalid", "linux"],
      [8, "1.0.0", "stable", "checksums", true, null, "valid", "macos"],
      [9, "0.1.0", "stable", "manifest", true, null, "valid", "container"],
    ] as const) {
      await sql`INSERT INTO runner_release_assets (id,version,platform,architecture,profile,channel,"assetKind","fileName","storageKey",
        "fileSizeBytes","fileSha256","provenanceJson","isPublished","withdrawnAt","validationStatus")
        VALUES (${id},${version},${platform},${platform === "container" ? "multi" : "x64"},${platform === "container" ? "shared_container" : "local_device"},${channel},${assetKind},'runner.zip',${"runner-releases/private/"+id},
        100,${"a".repeat(64)},${sql.json({ sourceCommit: "b".repeat(40), workflowRunId: null, releaseTag: null, signatureAlgorithm: null })},${isPublished},${withdrawnAt},${validationStatus})`;
    }
    await sql.unsafe(`CREATE VIEW public."${viewName}" WITH (security_barrier=true) AS SELECT ${PUBLIC_RUNNER_RELEASE_SELECT} FROM public.runner_release_assets WHERE ${PUBLIC_RUNNER_RELEASE_PREDICATE}`);
    await sql.unsafe("CREATE ROLE public_release_reader LOGIN");
    await sql.unsafe("GRANT SELECT ON sah_cf_releases_aaaaaaaaaaaa TO public_release_reader");
  }, 30_000);
  afterAll(async () => {
    if (closeDb) await closeDb(); if (sql) await sql.end({ timeout: 5 }); if (disposable) await disposable.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }, 20_000);

  it("matches the existing Node catalog and latest including version, provenance, manifest and checksum semantics", async () => {
    const { listRunnerReleaseCatalog, getLatestRunnerRelease } = await import("./runnerReleaseService");
    const response = await handleRunnerReleaseCatalog(request(), env()), native = await response.json();
    expect(response.status).toBe(200);
    const legacy = await listRunnerReleaseCatalog({ channel: "stable" });
    expect({ ...native, generatedAt: null }).toEqual({ ...legacy, generatedAt: null });
    expect(native.releases.map(row => row.id).sort()).toEqual([1,2,3,8,9]);
    expect(native.latestByTarget.find(row => row.platform === "linux")).toMatchObject({ version: "1.11.0", package: { id: 2 }, updateBinary: { id: 3 } });
    expect(native.latestByTarget.find(row => row.platform === "container")).toMatchObject({ package: null, updateBinary: null });
    expect(JSON.stringify(native)).not.toContain("runner-releases/private");
    const latest = await handleRunnerReleaseCatalog(request("/latest?platform=linux&architecture=x64&profile=local_device"), env());
    expect(await latest.json()).toEqual(await getLatestRunnerRelease({ platform: "linux", architecture: "x64", profile: "local_device" }));
  });
  it.each(["beta", "nightly", "stable"])("filters %s exactly and keeps missing targets empty", async channel => {
    const response = await handleRunnerReleaseCatalog(request(`?channel=${channel}&platform=linux&architecture=x64&profile=local_device`), env());
    const body = await response.json(); expect(response.status).toBe(200);
    expect(body.releases.every(row => row.channel === channel && row.platform === "linux")).toBe(true);
    if (channel === "nightly") expect(body.releases).toEqual([]);
    if (channel === "beta") expect(body.releases.map(row => row.id)).toEqual([4]);
    const empty = await handleRunnerReleaseCatalog(request("/latest?platform=linux&architecture=arm64&profile=local_device"), env());
    expect(await empty.json()).toEqual({ package: null, updateBinary: null });
  });
  it("works with SELECT-only credentials and denies a role with no table grant", async () => {
    const readerUrl = new URL(disposable.databaseUrl); readerUrl.username = "public_release_reader";
    expect((await handleRunnerReleaseCatalog(request(), { ...env(), HYPERDRIVE: { connectionString: readerUrl.href } })).status).toBe(200);
    await sql.unsafe("CREATE ROLE no_release_reader LOGIN"); readerUrl.username = "no_release_reader";
    const denied = await handleRunnerReleaseCatalog(request(), { ...env(), HYPERDRIVE: { connectionString: readerUrl.href } });
    expect(denied.status).toBe(503); expect(await denied.text()).not.toContain("permission denied");
  });
  it("uses a read-only DB transaction and enforces a bounded lock wait", async () => {
    const { withHyperdrivePostgres } = await import("../../../cloudflare/src/postgresClient");
    let readOnly = false;
    const response = await handleRunnerReleaseCatalog(request(), env(), { withDatabase: (binding, work) => withHyperdrivePostgres(binding, client => work({ ...client,
      begin: callback => client.begin(async transaction => callback({ ...transaction, unsafe: async (query, values) => {
        if (query.startsWith("SELECT")) readOnly = (await transaction.unsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only"))[0].transaction_read_only === "on";
        return transaction.unsafe(query, values);
      } })),
    })) });
    expect(response.status).toBe(200); expect(readOnly).toBe(true);
    let releaseLock!: () => void, lockReady!: () => void;
    const ready = new Promise<void>(resolve => { lockReady = resolve; }), release = new Promise<void>(resolve => { releaseLock = resolve; });
    const locker = sql.begin(async transaction => { await transaction.unsafe("LOCK TABLE runner_release_assets IN ACCESS EXCLUSIVE MODE"); lockReady(); await release; });
    try {
      await ready; const start = Date.now(), blocked = await handleRunnerReleaseCatalog(request(), env());
      expect(blocked.status).toBe(503); expect(Date.now()-start).toBeLessThan(6500);
    } finally { releaseLock(); await locker; }
  });

  it("runs the actual Worker entrypoint and supported SQL driver in local workerd without any Node origin API", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sah-native-catalog-")), listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const port = (listener.address() as { port: number }).port; await new Promise<void>(resolve => listener.close(() => resolve()));
    const localUrl = new URL(disposable.databaseUrl); localUrl.password = "disposable-loopback-only";
    const configuration = { name: "sah-native-public-catalog-fixture", main: resolve(process.cwd(), "../cloudflare/src/entrypoint.ts"),
      compatibility_date: "2026-10-19", compatibility_flags: ["nodejs_compat"],
      vars: { CLOUDFLARE_RUNNER_RELEASE_NAMESPACE: namespace, CLOUDFLARE_RUNNER_RELEASE_CATALOG: "hyperdrive", CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT: new Date(Date.now()+120_000).toISOString() },
      hyperdrive: [{ binding: "HYPERDRIVE", id: "a".repeat(32), localConnectionString: localUrl.href }] };
    await writeFile(join(directory, "wrangler.json"), JSON.stringify(configuration));
    const child = spawn("pnpm", ["dlx", "wrangler@4.151.1", "dev", "--config", join(directory, "wrangler.json"), "--local", "--port", String(port), "--persist-to", join(directory, "state")],
      { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    let log = ""; for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { log = (log+data).slice(-4000); });
    try {
      let ready = false;
      for (let attempt=0; attempt<80; attempt++) {
        try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
        if (ready || child.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 250));
      }
      expect(ready, log).toBe(true);
      const liveRequest = (suffix = "", method = "GET") => fetch(`http://127.0.0.1:${port}/api/runner-releases${suffix}`, { method });
      const response = await liveRequest(), body = await response.json(); expect(response.status, JSON.stringify(body)+log).toBe(200);
      expect(body.releases.map(row => row.id).sort()).toEqual([1,2,3,8,9]);
      const latest = await liveRequest("/latest?platform=linux&architecture=x64&profile=local_device");
      expect(await latest.json()).toMatchObject({ package: { id: 2 }, updateBinary: { id: 3 } });
      const head = await liveRequest("", "HEAD"); expect(head.status).toBe(200); expect(await head.text()).toBe("");
      await sql`UPDATE runner_release_assets SET "withdrawnAt"=now() WHERE id=2`;
      try {
        const withdrawn = await liveRequest("/latest?platform=linux&architecture=x64&profile=local_device");
        expect(await withdrawn.json()).toMatchObject({ package: { id: 1 } });
        expect(withdrawn.headers.get("cache-control")).toBe("no-store");
      } finally { await sql`UPDATE runner_release_assets SET "withdrawnAt"=NULL WHERE id=2`; }
      // AUTH_ORIGIN is absent: this unrelated download still fails closed at its original owner.
      expect((await liveRequest("/1/download")).status).toBe(503);
    } finally {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      await new Promise<void>(resolve => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} resolve(); }, 3000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
      await rm(directory, { recursive: true, force: true });
    }
  }, 45_000);
});
