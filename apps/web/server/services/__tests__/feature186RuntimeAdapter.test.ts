import { beforeEach, describe, expect, it } from "vitest";

import { createFeature186RuntimeAdapter } from "../feature186RuntimeAdapter";

describe("Feature 186 runtime adapter policy", () => {
  beforeEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
    delete process.env.FEATURE_186_CLOUDFLARE_HARD_CUTOVER;
    delete process.env.CLOUDFLARE_RUNTIME_URL;
    delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
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
