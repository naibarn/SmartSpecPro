import { describe, expect, it } from "vitest";
import { buildCloudflareProductionRuntimeRoleStatements } from "./cloudflareProductionDatabaseRole";

describe("Cloudflare Production PostgreSQL runtime role plan", () => {
  const base = { role: "sah_cf_prod_0123456789ab", databaseName: "smartspec",
    databasePassword: "A".repeat(64), planDigest: "a".repeat(64) };

  it("limits the login to the exact Worker intake tables and domain writes", () => {
    const { marker, statements } = buildCloudflareProductionRuntimeRoleStatements({ ...base, existing: false });
    expect(statements[0]).toContain("NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5");
    expect(statements).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "sah_cf_prod_0123456789ab"');
    expect(statements).toContain('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "sah_cf_prod_0123456789ab"');
    expect(marker).toBe(`smartspec:cloudflare-production-runtime:v1:${base.planDigest}`);
    expect(statements).toContain('GRANT UPDATE ("status", "updatedAt") ON public."emergency_reports" TO "sah_cf_prod_0123456789ab"');
    expect(statements).toContain('GRANT INSERT ("tenantId", "caseId", "eventIdempotencyKey", "actorType", "actorRef", "eventType", "reason", "revision", "previousHash", "eventHash", "payloadJson", "createdAt") ON public."emergency_case_events" TO "sah_cf_prod_0123456789ab"');
    expect(statements.some(statement => /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER).*worker_jobs/.test(statement))).toBe(false);
    expect(statements.some(statement => /GRANT (?:DELETE|TRUNCATE|REFERENCES|TRIGGER)/.test(statement))).toBe(false);
  });

  it("refuses an identifier or password that could escape the generated scope", () => {
    expect(() => buildCloudflareProductionRuntimeRoleStatements({ ...base, role: 'role"; DROP DATABASE smartspec;--', existing: false })).toThrow("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PLAN_INVALID");
    expect(() => buildCloudflareProductionRuntimeRoleStatements({ ...base, databasePassword: "password' ; DROP ROLE smartspec;--", existing: false })).toThrow("CLOUDFLARE_PRODUCTION_DATABASE_ROLE_PLAN_INVALID");
  });

  it("only alters a role after the caller has independently verified its ownership marker", () => {
    const { statements } = buildCloudflareProductionRuntimeRoleStatements({ ...base, existing: true });
    expect(statements[0]).toMatch(/^ALTER ROLE "sah_cf_prod_0123456789ab" LOGIN PASSWORD/);
    expect(statements[0]).toContain("NOBYPASSRLS CONNECTION LIMIT 5");
  });
});
