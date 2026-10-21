import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./crypto", () => ({ decrypt: (value: string) => value }));

describe("request-only runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMARTAIHUB_APPLICATION_RUNTIME", "cloudflare-http");
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "on-demand");
    vi.stubEnv("CLOUDFLARE_APPLICATION_BRIDGE", "private-http-v1");
    vi.stubEnv("PYTHON_BACKEND_URL", "http://localhost:8000");
    mocks.getDb.mockImplementation(() => ({ select: () => ({ from: () => ({ where: async () => [
      { key: "python_backend_url", value: "http://old-linux:8000", isSensitive: false },
      { key: "smartspec_web_gateway_token", value: "saved-internal-token", isSensitive: true },
    ] }) }) }));
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("retains stored encrypted credentials while pinning connection addresses", async () => {
    const { getAppRuntimeConfig } = await import("./appRuntimeConfig");
    expect(await getAppRuntimeConfig()).toMatchObject({ pythonBackendUrl: "http://python.application.internal", webGatewayToken: "saved-internal-token" });
  });
  it("does not fall back to Linux or localhost when database settings cannot be loaded", async () => {
    mocks.getDb.mockImplementation(() => { throw Error("settings unavailable"); });
    const { getAppRuntimeConfig, getCachedPythonBackendUrl } = await import("./appRuntimeConfig");
    expect(getCachedPythonBackendUrl()).toBe("http://python.application.internal");
    expect((await getAppRuntimeConfig()).pythonBackendUrl).toBe("http://python.application.internal");
  });
  it("preserves stored settings precedence for the standard service", async () => {
    vi.stubEnv("SMARTAIHUB_APPLICATION_RUNTIME", "standard");
    vi.stubEnv("CLOUDFLARE_APPLICATION_BRIDGE", undefined);
    const { getAppRuntimeConfig } = await import("./appRuntimeConfig");
    expect((await getAppRuntimeConfig()).pythonBackendUrl).toBe("http://old-linux:8000");
  });
});
