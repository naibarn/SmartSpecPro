import { describe, expect, it } from "vitest";
import type { CloudflareOriginDescriptor, CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { getStagingApplicationPreparation } from "./cloudflareStagingApplicationPreparation";
import { httpApplicationNamespace } from "./cloudflareHttpApplicationBindings";

const descriptor = (overrides: Partial<CloudflareOriginDescriptor> = {}) => ({
  schemaVersion: "cloudflare.origin-configuration.v1", versionId: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare",
  accountRef: "a".repeat(32), targetId: "smartspec-cloudflare-staging", origin: "https://origin-staging.smartaihub.app",
  allowedPublicOrigins: ["https://staging.example.workers.dev"], accessApplicationId: "00000000-0000-4000-8000-000000000002",
  accessTeamName: "staging", accessAudience: "staging-audience", expiresAt: new Date(Date.now() + 60_000).toISOString(),
  ...overrides,
} as CloudflareOriginDescriptor);
const secrets = (applicationHttp?: CloudflareOriginVersionBindings["secrets"]["applicationHttp"]) => ({
  token: "origin-token-123456789012345678901234567890", clientId: "access-client-id", secret: "access-secret",
  ...(applicationHttp ? { applicationHttp } : {}),
} as CloudflareOriginVersionBindings["secrets"]);

describe("Staging Full Application preparation projection", () => {
  it("keeps namespace-only configuration blocked by missing HTTP runtime fields, while reporting DB acceptance separately", () => {
    const value = getStagingApplicationPreparation(descriptor({
      applicationHttpPhase: "namespace-only",
      applicationHttp: { mode: "private-canary", namespace: "smartspec-staging-aaaaaaaaaaaa", sourceSha: "b".repeat(40),
        node: { provisionJobId: "00000000-0000-4000-8000-000000000003", planDigest: "c".repeat(64), image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-aaaaaaaaaaaa-node-http@sha256:${"d".repeat(64)}` },
        python: { provisionJobId: "00000000-0000-4000-8000-000000000004", planDigest: "e".repeat(64), image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-aaaaaaaaaaaa-python-http@sha256:${"f".repeat(64)}` },
        issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic",
      }, nativeResources: { privateDatabase: { plan: { namespace: "smartspec-staging-aaaaaaaaaaaa", hostname: "db-staging.smartaihub.app",
        databaseName: "staging_app", connectionLimit: 5 } } } as never,
    }), secrets({ node: { CONTROL_PLANE_API_KEY: "must-never-be-returned-this-is-secret" }, python: {} }), `cf-origin:${"1".repeat(64)}`);
    expect(value.phase).toBe("NAMESPACE_ONLY");
    expect(value.candidateStatus).toBe("BLOCKED");
    expect(value.databaseAuthority).toMatchObject({ code: "STAGING_DB_WRITE_ACCEPTANCE_NOT_VERIFIED", status: "NOT_VERIFIED",
      existingRoleAccess: "READ_ONLY_PROBE_ONLY", host: "db-staging.smartaihub.app", databaseName: "staging_app" });
    expect(value.missingRuntimeFields).toContain("CLOUDFLARE_APPLICATION_HTTP_TRAFFIC");
    expect(value.missingRuntimeFields).toContain("NODE_HTTP");
    expect(JSON.stringify(value)).not.toContain("must-never-be-returned-this-is-secret");
  });

  it("recognizes complete runtime configuration without claiming DB acceptance or deployment", () => {
    const base = descriptor(), namespace = httpApplicationNamespace(base.tenantId, base.projectId, "staging");
    base.applicationHttp = { mode: "private-canary", namespace, sourceSha: "b".repeat(40), traffic: "staging-full-http-v1",
      node: { provisionJobId: "00000000-0000-4000-8000-000000000003", planDigest: "c".repeat(64), image: `registry.cloudflare.com/${base.accountRef}/${namespace}-node-http@sha256:${"d".repeat(64)}` },
      python: { provisionJobId: "00000000-0000-4000-8000-000000000004", planDigest: "e".repeat(64), image: `registry.cloudflare.com/${base.accountRef}/${namespace}-python-http@sha256:${"f".repeat(64)}` },
      issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" };
    const value = getStagingApplicationPreparation(base, secrets({ node: { CONTROL_PLANE_API_KEY: "fixture-secret-not-returned" }, python: {} }), `cf-origin:${"2".repeat(64)}`);
    expect(value.phase).toBe("FULL_HTTP");
    expect(value.candidateStatus).toBe("RUNTIME_CONFIGURED");
    expect(value.databaseAuthority.code).toBe("STAGING_DB_WRITE_ACCEPTANCE_NOT_VERIFIED");
    expect(value.databaseAuthority.status).toBe("NOT_VERIFIED");
    expect(value.missingRuntimeFields).toEqual([]);
    expect(value.deploymentAuthorized).toBe(false);
    expect(JSON.stringify(value)).not.toContain("fixture-secret-not-returned");
  });
});
