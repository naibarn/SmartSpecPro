import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ withClient: vi.fn(), unsafe: vi.fn(), begin: vi.fn() }));
vi.mock("./postgresClient", () => ({ withHyperdrivePostgres: mocks.withClient }));
import { productionDatabaseDiagnostic, type ProductionDatabaseDiagnosticEnv } from "./productionDatabaseDiagnostic";

const env: ProductionDatabaseDiagnosticEnv = { HYPERDRIVE: { connectionString: "postgres://restricted:secret@hyperdrive/database" },
  PROBE_TOKEN: "a".repeat(64), PROBE_EXPIRES_AT: "", EXPECTED_DATABASE: "smartspec", EXPECTED_ROLE: "sah_cf_prod_0123456789ab", PLAN_DIGEST: "b".repeat(64) };
function request(remote = true) {
  const req = new Request("https://isolated.invalid/__m1_sql_probe", { headers: { authorization: `Bearer ${env.PROBE_TOKEN}` } });
  if (remote) Object.defineProperty(req, "cf", { value: { colo: "SIN" } });
  return req;
}
beforeEach(() => {
  vi.resetAllMocks(); env.PROBE_EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();
  mocks.begin.mockImplementation(fn => fn({ unsafe: mocks.unsafe }));
  mocks.withClient.mockImplementation((_binding, fn) => fn({ begin: mocks.begin }));
  mocks.unsafe.mockImplementation(async query => {
    if (query.startsWith("SELECT 1")) return [{ connected: 1, database: env.EXPECTED_DATABASE, role: env.EXPECTED_ROLE, read_only: "on", backend_ssl: false }];
    if (query.includes("rolsuper")) return [{ rolcanlogin: true, rolconnlimit: 5, memberships: 0, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolinherit: false, marker: `smartspec:cloudflare-production-runtime:v1:${env.PLAN_DIGEST}` }];
    if (query.includes("has_schema_privilege")) return [{ public_usage: true, report_id_select: true, users_select: false, jobs_select: false }];
    if (query.startsWith("SELECT * FROM public.users")) throw Object.assign(Error("permission denied"), { code: "42501" });
    return [];
  });
});
describe("isolated Cloudflare Production database diagnostic", () => {
  it("runs bounded fixed read-only SQL, verifies denied access and never claims tenant acceptance", async () => {
    const response = await productionDatabaseDiagnostic(request(), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sql: "PASS", roleVerified: true, deniedSchemaAccessVerified: true,
      tenantIsolation: "NOT_VERIFIED_NO_AUTHORIZED_FIXTURES", backend_ssl: false, tlsEvidence: "VERIFY_VPC_AND_ORIGIN_TLS_TERMINATOR",
      businessRowsRead: 0, businessWrites: 0, acceptance: "NOT_ACCEPTED" });
    expect(mocks.begin).toHaveBeenCalledTimes(2);
    expect(mocks.unsafe.mock.calls.filter(([q]) => q === "SET TRANSACTION READ ONLY")).toHaveLength(2);
    expect(mocks.unsafe.mock.calls.every(([q]) => /^(SELECT|SET (TRANSACTION READ ONLY|LOCAL statement_timeout))/.test(q))).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["anonymous", "unicode_token", "expired", "excess_expiry", "wrong_path", "post", "malformed_scope", "local"])("rejects %s before SQL", async kind => {
    let req = request(); const config = { ...env };
    if (kind === "anonymous") req.headers.delete("authorization");
    if (kind === "unicode_token") req.headers.set("authorization", `Bearer ${"é".repeat(64)}`);
    if (kind === "expired") config.PROBE_EXPIRES_AT = new Date(Date.now() - 1).toISOString();
    if (kind === "excess_expiry") config.PROBE_EXPIRES_AT = new Date(Date.now() + 16 * 60_000).toISOString();
    if (kind === "wrong_path") req = new Request("https://isolated.invalid/sql");
    if (kind === "post") req = new Request(req, { method: "POST" });
    if (kind === "malformed_scope") config.EXPECTED_ROLE = "superuser";
    if (kind === "local") req = request(false);
    expect((await productionDatabaseDiagnostic(req, config)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.withClient).not.toHaveBeenCalled();
  });
  it("does not accept a readable forbidden table or unrestricted role", async () => {
    mocks.unsafe.mockImplementation(async query => query.startsWith("SELECT 1") ? [{ connected: 1, database: env.EXPECTED_DATABASE, role: env.EXPECTED_ROLE, read_only: "on", origin_ssl: true }] :
      query.includes("rolsuper") ? [{ rolsuper: true }] : query.includes("has_schema_privilege") ? [{}] : []);
    const response = await productionDatabaseDiagnostic(request(), env);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ sql: "FAIL", roleVerified: false, deniedSchemaAccessVerified: false });
  });
  it("returns stage and sanitized SQLSTATE without the binding connection string or token", async () => {
    mocks.withClient.mockRejectedValue(Object.assign(Error(`cannot connect ${env.HYPERDRIVE.connectionString} ${env.PROBE_TOKEN}`), { code: "08006" }));
    const response = await productionDatabaseDiagnostic(request(), env), body = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toMatchObject({ stage: "connectivity", code: "08006", sql: "FAIL" });
    expect(body).not.toContain("restricted:secret"); expect(body).not.toContain(env.PROBE_TOKEN);
  });
});
