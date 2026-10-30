import { describe, expect, it } from "vitest";
import { validateApplicationDatabasePolicy } from "./applicationDatabaseBridge";

function profile(targetId: "smartspec-cloudflare-staging" | "smartspec-cloudflare-runtime", runtime: "node-http" | "python-http") {
  const accountRef = "c".repeat(32), namespace = targetId === "smartspec-cloudflare-staging" ? "smartspec-staging-123456789012" : "smartspec-production-123456789012";
  return { configurationRef: `cf-origin:${"a".repeat(64)}`, sourceSha: "b".repeat(40), targetId,
    runtime, accountRef, namespace, image: `registry.cloudflare.com/${accountRef}/${namespace}-${runtime}@sha256:${"d".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic",
    networkAccess: "application-outbound" as const };
}

describe("private application database bridge policy", () => {
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
