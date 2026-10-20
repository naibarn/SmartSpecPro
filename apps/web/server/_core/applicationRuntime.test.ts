import { describe, expect, it } from "vitest";
import { getApplicationRuntimeProfile } from "./applicationRuntime";

describe("application request-runtime ownership", () => {
  it("preserves the standard runtime and shared-production debug ownership", () => {
    expect(getApplicationRuntimeProfile({ NODE_ENV: "production" })).toEqual({ mode: "standard", ownsBackgroundWork: true, serveSpaAssets: true });
    expect(getApplicationRuntimeProfile({ NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development", SMARTSPEC_DEV_DATABASE_MODE: "shared-production" })).toMatchObject({ ownsBackgroundWork: false, serveSpaAssets: true });
  });
  it("admits an explicitly on-demand production HTTP runtime without scheduler or SPA ownership", () => {
    expect(getApplicationRuntimeProfile({ NODE_ENV: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand" }))
      .toEqual({ mode: "cloudflare-http", ownsBackgroundWork: false, serveSpaAssets: false });
  });
  it.each([
    { SMARTAIHUB_APPLICATION_RUNTIME: "unknown" },
    { SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", NODE_ENV: "development", CLOUDFLARE_CONTAINER_POLICY: "on-demand" },
    { SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", NODE_ENV: "production" },
    { SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", NODE_ENV: "production", CLOUDFLARE_CONTAINER_POLICY: "always-on" },
  ])("fails startup for an invalid or unbounded HTTP profile", env => {
    expect(() => getApplicationRuntimeProfile(env)).toThrow("APPLICATION_RUNTIME_CONFIGURATION_DENIED");
  });
});
