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
    const job = { runtimeType: "node_job_worker", jobType: "emergency.report.intake", executionClass: "short" };
    expect(createFeature186RuntimeAdapter(job).name).toBe("cloudflare-workflows");
    expect(createFeature186RuntimeAdapter().name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, jobType: "database.backup" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, runtimeType: "python_job_worker" }).name).toBe("postgres-pull");
    expect(createFeature186RuntimeAdapter({ ...job, executionClass: "long" }).name).toBe("postgres-pull");
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "false");
    expect(createFeature186RuntimeAdapter(job).name).toBe("postgres-pull");
  });

  it("fails closed for incomplete Workflow opt-in configuration", () => {
    vi.stubEnv("FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE", "true");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_URL", "");
    vi.stubEnv("CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN", "");
    expect(() => createFeature186RuntimeAdapter({ runtimeType: "node_job_worker", jobType: "emergency.report.intake", executionClass: "short" }))
      .toThrow("CLOUDFLARE_WORKFLOW_RUNTIME_CONFIG_INCOMPLETE");
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
