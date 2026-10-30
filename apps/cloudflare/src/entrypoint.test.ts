import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {}, DurableObject: class {}, WorkerEntrypoint: class {} }));
import entrypoint, * as workerExports from "./entrypoint";
const env = {
  CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_INGRESS_MODE: "production-origin-bridge-v1",
  CLOUDFLARE_APPLICATION_CANARY_TOKEN: "p".repeat(64),
  AUTH_ORIGIN: "https://origin.fixture.invalid", AUTH_ORIGIN_PRIVATE_HOST: "origin.fixture.invalid",
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://smartaihub.app", "https://runtime.smartaihub.app"]),
  AUTH_ORIGIN_TOKEN: "t".repeat(64), AUTH_ORIGIN_ACCESS_CLIENT_ID: "i".repeat(32), AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "s".repeat(64),
} as any;
afterEach(() => vi.unstubAllGlobals());
describe("deployed Worker entrypoint canary dispatch", () => {
  it("exports the private database bridge required by the application Containers", () => {
    expect(workerExports.ApplicationDatabaseBridge).toBeTypeOf("function");
  });

  it.each(["web", "auth"])("dispatches the narrower M2 %s probe before the Container canary prefix", async resource => {
    const fetchImpl = vi.fn(async (request: any) => {
      const url = new URL(request instanceof Request ? request.url : String(request));
      expect(url.origin).toBe(env.AUTH_ORIGIN);
      expect(url.pathname).toBe(resource === "web" ? "/" : "/trpc/auth.me");
      return new Response(resource === "web" ? "<html>fixture</html>" : JSON.stringify({ result: { data: { json: null } } }),
        { headers: { "content-type": resource === "web" ? "text/html" : "application/json" } });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const response = await entrypoint.fetch(new Request(`https://runtime.smartaihub.app/_ops/application-canary/ingress/${resource}`,
      { headers: { "x-smartaihub-application-canary-token": env.CLOUDFLARE_APPLICATION_CANARY_TOKEN } }), env);
    expect(response.status).toBe(200); expect(response.headers.get("x-smartaihub-ingress")).toBe("cloudflare-worker");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(["wrong-token", "wrong-host", "wrong-mode"])("retains M2 denial for %s", async kind => {
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const response = await entrypoint.fetch(new Request(`https://${kind === "wrong-host" ? "smartaihub.app" : "runtime.smartaihub.app"}/_ops/application-canary/ingress/auth`,
      { headers: { "x-smartaihub-application-canary-token": kind === "wrong-token" ? "x".repeat(64) : env.CLOUDFLARE_APPLICATION_CANARY_TOKEN } }),
      { ...env, ...(kind === "wrong-mode" ? { CLOUDFLARE_INGRESS_MODE: "invalid" } : {}) });
    expect([404, 503]).toContain(response.status); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("preserves the separate Container canary handler", async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const response = await entrypoint.fetch(new Request("https://runtime.smartaihub.app/_ops/application-canary/unknown",
      { headers: { "x-smartaihub-application-canary-token": env.CLOUDFLARE_APPLICATION_CANARY_TOKEN } }), env);
    expect(response.status).toBe(404); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
