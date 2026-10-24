import { describe, expect, it } from "vitest";
import { applyApplicationRuntimeConnections, getApplicationRuntimeProfile } from "./applicationRuntime";

describe("application request-runtime ownership", () => {
  it("preserves the standard runtime and production-readonly debug ownership", () => {
    expect(getApplicationRuntimeProfile({ NODE_ENV: "production" })).toEqual({ mode: "standard", ownsBackgroundWork: true, serveSpaAssets: true });
    expect(getApplicationRuntimeProfile({ NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development", SMARTSPEC_DEV_DATABASE_MODE: "production-readonly" })).toMatchObject({ ownsBackgroundWork: false, serveSpaAssets: true });
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

describe("private application connections", () => {
  const config = { pythonBackendUrl: "http://old-linux:8000", internalNodeUrl: "http://old-linux:3000",
    smartspecInternalUrl: "http://old-linux:3000", uploadPostApiBaseUrl: "http://old-linux:8000" };
  const env = { NODE_ENV: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http",
    CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_APPLICATION_BRIDGE: "private-http-v1" };
  it("pins deployment-local services without changing shared Admin settings", () => {
    expect(applyApplicationRuntimeConnections(config, env)).toEqual({ pythonBackendUrl: "http://python.application.internal",
      internalNodeUrl: "http://127.0.0.1:3000", smartspecInternalUrl: "http://127.0.0.1:3000", uploadPostApiBaseUrl: "http://python.application.internal" });
    expect(config.pythonBackendUrl).toBe("http://old-linux:8000");
    expect(applyApplicationRuntimeConnections(config, {})).toBe(config);
  });
  it("preserves an explicitly configured external upload service", () => {
    expect(applyApplicationRuntimeConnections({ ...config, uploadPostApiBaseUrl: "https://upload.example/api" }, env).uploadPostApiBaseUrl)
      .toBe("https://upload.example/api");
    expect(applyApplicationRuntimeConnections({ ...config, uploadPostApiBaseUrl: "http://localhost:8000/" }, env).uploadPostApiBaseUrl)
      .toBe("http://python.application.internal");
  });
  it("rejects unknown bridges and enabling the private bridge outside the HTTP profile", () => {
    expect(() => applyApplicationRuntimeConnections(config, { ...env, CLOUDFLARE_APPLICATION_BRIDGE: "unknown" })).toThrow();
    expect(() => applyApplicationRuntimeConnections(config, { ...env, SMARTAIHUB_APPLICATION_RUNTIME: "standard" })).toThrow();
  });
});
