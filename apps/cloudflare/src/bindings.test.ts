import { describe, expect, it, vi } from "vitest";
import { inspectBindingReadiness } from "./bindings";

describe("runtime binding readiness profiles", () => {
  it("accepts the production Queue profile without provisioning unrelated job Containers", () => {
    const queueProfile = inspectBindingReadiness({
      CLOUDFLARE_ACTIVATION: "enabled",
      CLOUDFLARE_ENVIRONMENT: "production",
      CLOUDFLARE_JOB_TRANSPORT: "queues",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
    });

    expect(queueProfile).toMatchObject({
      activation: "enabled",
      transport: "queues",
      ready: true,
      selectedMissing: [],
    });
    expect(queueProfile.missing).toContain("JOB_CONTAINERS");
    expect(queueProfile.missing).toContain("JOB_WORKFLOW");
    expect(queueProfile.applicationIngress).toMatchObject({
      enabled: false,
      ready: false,
      missing: expect.arrayContaining(["CLOUDFLARE_APPLICATION_HTTP_TRAFFIC", "NODE_HTTP", "PYTHON_HTTP"]),
    });
  });

  it("reports full production website/API readiness separately from queue readiness", () => {
    const issuedAt = new Date(Date.now() - 1000).toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const base = {
      configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40),
      targetId: "smartspec-cloudflare-runtime" as const, accountRef: "a".repeat(32),
      namespace: "smartspec-production-abcdef012345", image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
      issuedAt, expiresAt, maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120,
      idleTimeoutSeconds: 10, instance: "basic" as const, networkAccess: "application-outbound" as const,
    };
    const profile = (runtime: "node-http" | "python-http") => ({
      ...base, runtime, image: base.image.replace("-node-http@", `-${runtime}@`),
    });
    const namespace = { idFromName: vi.fn(value => value), get: vi.fn() };
    const readiness = inspectBindingReadiness({
      CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_JOB_TRANSPORT: "queues",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" }, JOB_QUEUE: { send: vi.fn() },
      CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: "production-full-http-v1", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
      CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile("node-http")),
      CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(profile("python-http")),
      AUTH_ORIGIN_TOKEN: "x".repeat(64), AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://smartaihub.app"]',
      NODE_HTTP: namespace, PYTHON_HTTP: namespace,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.applicationIngress).toEqual({ enabled: true, ready: true, missing: [] });
  });
});
