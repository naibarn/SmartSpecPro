import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFeature186RuntimeAdapter } from "../feature186RuntimeAdapter";

describe("Feature 186 runtime adapter policy", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
    delete process.env.FEATURE_186_CLOUDFLARE_HARD_CUTOVER;
    delete process.env.CLOUDFLARE_RUNTIME_URL;
    delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "false");
  });

  it("opts only short canonical Node intake into Workflow without a Queue cutover", () => {
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "true");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_URL", "https://staging.example.workers.dev");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN", "test-workflow-runtime-token");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "tenant-a");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", new Date(Date.now() + 60_000).toISOString());
    const job = { runtimeType: "node_job_worker", jobType: "emergency.report.intake", executionClass: "short", tenantId: "tenant-a" };
    expect(createFeature186RuntimeAdapter(job).name).toBe("cloudflare-workflows");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TRANSPORT", "queues");
    expect(createFeature186RuntimeAdapter(job).name).toBe("cloudflare-queues");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TRANSPORT", "unknown");
    expect(() => createFeature186RuntimeAdapter(job)).toThrow("TRANSPORT_INVALID");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TRANSPORT", "workflows");
    expect(createFeature186RuntimeAdapter().name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, jobType: "database.backup" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, runtimeType: "python_job_worker" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, executionClass: "long" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, tenantId: "tenant-b" }).name).toBe("postgres-pull");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", "2000-01-01T00:00:00Z");
    expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", "");
    expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "false");
    expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
  });

  it("fails closed for incomplete Workflow opt-in configuration", () => {
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "true");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_URL", "");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN", "");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "tenant-a");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", new Date(Date.now() + 60_000).toISOString());
    expect(() => createFeature186RuntimeAdapter({ runtimeType: "node_job_worker", jobType: "emergency.report.intake", executionClass: "short", tenantId: "tenant-a" }))
      .toThrow("CLOUDFLARE_WORKFLOW_RUNTIME_CONFIG_INCOMPLETE");
  });


  it("selects only the existing exact media probe wrapper under independent tenant/expiry opt-in", () => {
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "on-demand"); vi.stubEnv("FEATURE_186_CLOUDFLARE_MEDIA_PROBE", "true"); vi.stubEnv("CLOUDFLARE_MEDIA_PROBE", "container-media-probe-v1");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "tenant-a"); vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", new Date(Date.now() + 60_000).toISOString());
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_URL", "https://staging.example.workers.dev"); vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN", "test-bounded-runtime");
    const input = { taskName: "app.tasks.media_job_worker.execute_media_job", taskImportPath: "app.tasks.media_job_worker.execute_media_job",
      args: [JSON.stringify({ jobId: "external-1", jobType: "probe", inputs: { assets: [{ uri: "r2://uploads/7/input.wav" }] } }), "7", "external-1"], kwargs: {}, queue: null, legacyUserId: "7" };
    const job = { runtimeType: "python_job_worker", jobType: "python.legacy_task", executionClass: "long", tenantId: "tenant-a", inputJson: input };
    expect(createFeature186RuntimeAdapter(job).name).toBe("cloudflare-workflows");
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", ""); expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "always-on"); expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "on-demand");
    expect(createFeature186RuntimeAdapter({ ...job, tenantId: "tenant-b" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, inputJson: { ...input, taskImportPath: "app.tasks.unapproved" } }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, inputJson: { ...input, kwargs: { command: "curl" } } }).name).toBe("postgres-pull");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", "2000-01-01T00:00:00Z"); expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
  });

  it("selects PostgreSQL-pull without Cloudflare configuration", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.NODE_ENV = "production";

    expect(createFeature186RuntimeAdapter().name).toBe("postgres-pull");
  });

  it("selects Cloudflare only after explicit activation and complete config", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.FEATURE_186_CLOUDFLARE_HARD_CUTOVER = "true";
    process.env.CLOUDFLARE_RUNTIME_URL = "https://runtime.example";
    process.env.CLOUDFLARE_RUNTIME_TOKEN = "runtime-token";

    expect(createFeature186RuntimeAdapter().name).toBe("cloudflare-queues");
  });

  it("fails closed when Cloudflare was explicitly selected but is incomplete", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.FEATURE_186_CLOUDFLARE_HARD_CUTOVER = "true";

    expect(() => createFeature186RuntimeAdapter()).toThrow(
      "CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE"
    );
  });
});
