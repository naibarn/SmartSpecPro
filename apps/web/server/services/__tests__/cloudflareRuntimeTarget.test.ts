import { beforeEach, describe, expect, it } from "vitest";

import {
  assertGoogleRuntimeDisabled,
  cloudflareRuntimeStatus,
  feature186RuntimeReadiness,
  isCloudflareHardCutoverEnabled,
  isPostgresPullHarnessEnabled,
} from "../cloudflareRuntimeTarget";

describe("Cloudflare hard-cutover runtime target", () => {
  beforeEach(() => {
    for (const key of [
      "FEATURE_186_HARD_CUTOVER",
      "FEATURE_186_CLOUDFLARE_HARD_CUTOVER",
      "USE_CLOUD_TASKS",
      "CLOUD_TASKS_SECRET",
      "CLOUD_RUN_NODE_URL",
      "CLOUD_RUN_PYTHON_URL",
      "CLOUD_RUN_SA_EMAIL",
      "GCP_PROJECT_ID",
      "GCP_REGION",
      "CLOUDFLARE_RUNTIME_URL",
      "CLOUDFLARE_RUNTIME_TOKEN",
      "FEATURE_186_POSTGRES_PULL_HARNESS",
      "NODE_ENV",
    ]) delete process.env[key];
  });

  it("requires the canonical hard-cutover flag", () => {
    expect(isCloudflareHardCutoverEnabled()).toBe(false);
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    expect(isCloudflareHardCutoverEnabled()).toBe(true);
  });

  it("rejects old Google runtime settings without rejecting product OAuth/Drive settings", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.GOOGLE_CLIENT_ID = "product-oauth-client";
    process.env.GCP_PROJECT_ID = "oauth-project-metadata";
    process.env.GCP_REGION = "oauth-region-metadata";
    expect(() => assertGoogleRuntimeDisabled()).not.toThrow();
    process.env.CLOUD_RUN_PYTHON_URL = "https://legacy.invalid";
    expect(() => assertGoogleRuntimeDisabled()).toThrow("GOOGLE_CLOUD_RUNTIME_RETIRED");
  });

  it("reports Cloudflare as the only runtime target", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    expect(cloudflareRuntimeStatus()).toMatchObject({
      target: "cloudflare",
      hardCutover: true,
      googleRuntime: "retired",
      googleOauthAndDrive: "product-integrations-only",
    });
  });

  it("requires both Cloudflare endpoint and token for hard-cutover readiness", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    expect(feature186RuntimeReadiness()).toMatchObject({
      mode: "misconfigured",
      ready: false,
      reason: "cloudflare_url_missing",
    });
    process.env.CLOUDFLARE_RUNTIME_URL = "https://runtime.example";
    expect(feature186RuntimeReadiness()).toMatchObject({
      mode: "misconfigured",
      ready: false,
      reason: "cloudflare_token_missing",
    });
    process.env.CLOUDFLARE_RUNTIME_TOKEN = "runtime-token";
    expect(feature186RuntimeReadiness()).toMatchObject({ mode: "cloudflare", ready: true });
  });

  it("allows Postgres-pull only as an explicit non-production harness", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.FEATURE_186_POSTGRES_PULL_HARNESS = "true";
    process.env.NODE_ENV = "test";
    expect(isPostgresPullHarnessEnabled()).toBe(true);
    expect(feature186RuntimeReadiness()).toMatchObject({ mode: "postgres-pull-harness", ready: true });
    process.env.NODE_ENV = "production";
    expect(isPostgresPullHarnessEnabled()).toBe(false);
    expect(feature186RuntimeReadiness()).toMatchObject({
      mode: "misconfigured",
      ready: false,
      reason: "postgres_pull_harness_forbidden",
    });
  });
});
