import { describe, expect, it } from "vitest";
import { applicationDatabaseConnectionDeadline, validateApplicationDatabasePolicy } from "./applicationDatabaseBridge";

function profile(targetId: "smartspec-cloudflare-staging" | "smartspec-cloudflare-runtime", runtime: "node-http" | "python-http") {
  const accountRef = "c".repeat(32), namespace = targetId === "smartspec-cloudflare-staging" ? "smartspec-staging-123456789012" : "smartspec-production-123456789012";
  return { configurationRef: `cf-origin:${"a".repeat(64)}`, sourceSha: "b".repeat(40), targetId,
    runtime, accountRef, namespace, image: `registry.cloudflare.com/${accountRef}/${namespace}-${runtime}@sha256:${"d".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic",
    networkAccess: "application-outbound" as const };
}

describe("private application database bridge policy", () => {
  it("accepts the 30-minute Staging configuration while bounding each database connection", () => {
    const now = Date.parse("2026-10-31T04:11:23.377Z");
    const node = { ...profile("smartspec-cloudflare-staging", "node-http"),
      issuedAt: "2026-10-31T04:10:04.969Z", expiresAt: "2026-10-31T04:40:04.969Z" };
    const python = { ...node, runtime: "python-http" as const,
      image: node.image.replace("-node-http@", "-python-http@") };
    const policy = { transport: "private-vpc-websocket-v1" as const, environment: "staging" as const,
      targetId: "smartspec-cloudflare-staging" as const, configurationRef: node.configurationRef, namespace: node.namespace,
      tunnelId: "11111111-1111-4111-8111-111111111111", hostname: "db-staging.smartaihub.app" as const,
      port: 5432 as const, expiresAt: node.expiresAt };

    expect(validateApplicationDatabasePolicy(policy, node, python, now)).toEqual(policy);
    expect(applicationDatabaseConnectionDeadline(policy, node, now)).toBe(now + 600_000);
    expect(applicationDatabaseConnectionDeadline(policy, { ...node, hardLifetimeSeconds: 120 }, now)).toBe(now + 120_000);
    expect(applicationDatabaseConnectionDeadline(policy, node, Date.parse(policy.expiresAt) - 60_000))
      .toBe(Date.parse(policy.expiresAt));
    expect(() => validateApplicationDatabasePolicy(policy, node, python, Date.parse(policy.expiresAt)))
      .toThrow("APPLICATION_HTTP_PROFILE_DENIED");
    expect(() => validateApplicationDatabasePolicy({ ...policy, expiresAt: "2026-10-31T04:41:04.969Z" }, node, python, now))
      .toThrow("APPLICATION_DATABASE_POLICY_DENIED");
  });

  it("allows the exact Staging target and private tunnel endpoint", () => {
    const node = profile("smartspec-cloudflare-staging", "node-http"), python = profile("smartspec-cloudflare-staging", "python-http");
    // A valid profile pair is minted atomically; separate Date.now() calls
    // must not make the fixture disagree on its shared capability lifetime.
    python.issuedAt = node.issuedAt;
    python.expiresAt = node.expiresAt;
    const policy = { transport: "private-vpc-websocket-v1" as const, environment: "staging" as const,
      targetId: "smartspec-cloudflare-staging" as const, configurationRef: node.configurationRef, namespace: node.namespace,
      tunnelId: "11111111-1111-4111-8111-111111111111", hostname: "db-staging.smartaihub.app" as const,
      port: 5432 as const, expiresAt: node.expiresAt };
    expect(validateApplicationDatabasePolicy(policy, node, python)).toEqual(policy);
    expect(() => validateApplicationDatabasePolicy({ ...policy, hostname: "db.smartaihub.app" as any }, node, python)).toThrow("APPLICATION_DATABASE_POLICY_DENIED");
    expect(() => validateApplicationDatabasePolicy({ ...policy, targetId: "smartspec-cloudflare-runtime" as any }, node, python)).toThrow("APPLICATION_DATABASE_POLICY_DENIED");
  });
});
