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

  it("accepts only an explicit exact Staging Worker origin without requiring a custom DNS name", () => {
    const issuedAt = new Date(Date.now() - 1000).toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const base = {
      configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40),
      targetId: "smartspec-cloudflare-staging" as const, accountRef: "a".repeat(32),
      namespace: "smartspec-staging-abcdef012345", image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
      issuedAt, expiresAt, maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120,
      idleTimeoutSeconds: 10, instance: "basic" as const, networkAccess: "application-outbound" as const,
    };
    const profile = (runtime: "node-http" | "python-http") => ({
      ...base, runtime, image: base.image.replace("-node-http@", `-${runtime}@`),
    });
    const namespace = { idFromName: vi.fn(value => value), get: vi.fn() };
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_JOB_TRANSPORT: "queues",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" }, JOB_QUEUE: { send: vi.fn() },
      CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: "staging-full-http-v1", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
      CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile("node-http")),
      CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(profile("python-http")),
      AUTH_ORIGIN_TOKEN: "x".repeat(64),
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://smartspec-cloudflare-staging.smartaihub-f3fb0b68.workers.dev"]',
      NODE_HTTP: namespace, PYTHON_HTTP: namespace,
    };

    expect(inspectBindingReadiness(env).applicationIngress).toEqual({ enabled: true, ready: true, missing: [] });
    expect(inspectBindingReadiness({ ...env, AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: "[]" }).applicationIngress)
      .toMatchObject({ ready: false, missing: expect.arrayContaining(["AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS"]) });
  });

  it("reports expired Node/Python profiles as the application ingress blocker without exposing profile contents", () => {
    const now = Date.now();
    const base = {
      configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40),
      targetId: "smartspec-cloudflare-staging" as const, accountRef: "a".repeat(32),
      namespace: "smartspec-staging-abcdef012345", image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
      issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now - 1000).toISOString(), maxStarts: 1,
      maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic" as const,
      networkAccess: "application-outbound" as const,
    };
    const profile = (runtime: "node-http" | "python-http") => ({ ...base, runtime, image: base.image.replace("-node-http@", `-${runtime}@`) });
    const namespace = { idFromName: vi.fn(value => value), get: vi.fn() };
    const readiness = inspectBindingReadiness({
      CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: "staging-full-http-v1",
      CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile("node-http")),
      CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(profile("python-http")), AUTH_ORIGIN_TOKEN: "x".repeat(64),
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://staging.example.workers.dev"]', NODE_HTTP: namespace, PYTHON_HTTP: namespace,
    });

    expect(readiness.applicationIngress).toMatchObject({ enabled: true, ready: false, reason: "APPLICATION_HTTP_PROFILE_EXPIRED",
      missing: ["CLOUDFLARE_NODE_HTTP_PROFILE", "CLOUDFLARE_PYTHON_HTTP_PROFILE"] });
    expect(JSON.stringify(readiness.applicationIngress)).not.toContain("x".repeat(64));
  });
});
