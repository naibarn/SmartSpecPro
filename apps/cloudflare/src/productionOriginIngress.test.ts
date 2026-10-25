import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudflareWorker } from "./index";
import type { CloudflareEnvironment } from "./contracts";

const env = {
  CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_INGRESS_MODE: "production-origin-bridge-v1",
  CLOUDFLARE_ACTIVATION: "disabled", AUTH_ORIGIN: "https://private-origin.example.com",
  AUTH_ORIGIN_PRIVATE_HOST: "private-origin.example.com", AUTH_ORIGIN_TOKEN: "t".repeat(32),
  AUTH_ORIGIN_ACCESS_CLIENT_ID: "private-access-id", AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "s".repeat(32),
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://smartaihub.app", "https://alpha.smartaihub.app", "https://beta.smartaihub.app"]),
} as CloudflareEnvironment;
afterEach(() => vi.unstubAllGlobals());
describe("M2 production origin bridge without M1/M3 workload bindings", () => {
  it.each(["/", "/assets/app.js", "/login", "/healthz", "/readyz", "/trpc/auth.me", "/api/auth/csrf"])("preserves the Linux response for %s with serving identity", async path => {
    const fetchOrigin = vi.fn(async (request: Request) => {
      expect(new URL(request.url).origin).toBe(env.AUTH_ORIGIN);
      expect(request.headers.get("x-forwarded-host")).toBe("smartaihub.app");
      return new Response(path === "/" ? "<!doctype html><title>existing app</title>" : "existing-response", {
        headers: { "content-type": path === "/" ? "text/html" : "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchOrigin);
    const response = await createCloudflareWorker().fetch(new Request(`https://smartaihub.app${path}`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-smartaihub-ingress")).toBe("cloudflare-worker");
    expect(response.headers.get("x-smartaihub-application-runtime")).toBe("linux-origin");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
  });
  it("keeps login body, session/CSRF cookies and original tenant host without acquiring internal trust", async () => {
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
      hosts.push(request.headers.get("x-forwarded-host")!);
      expect(request.headers.get("x-internal-token")).toBeNull();
      expect(request.headers.get("cookie")).toBe("app_session_id=app-session; csrf=csrf-value");
      expect(await request.text()).toBe('{"email":"fixture@example.com"}');
      const headers = new Headers({ location: "/dashboard" });
      headers.append("set-cookie", "app_session_id=new-session; Path=/; HttpOnly; Secure; SameSite=Lax");
      headers.append("set-cookie", "csrf=new-csrf; Path=/; Secure; SameSite=Lax");
      headers.append("set-cookie", "CF_Authorization=private-access; Path=/");
      return new Response(null, { status: 302, headers });
    }));
    for (const host of ["alpha.smartaihub.app", "beta.smartaihub.app"]) {
      const response = await createCloudflareWorker().fetch(new Request(`https://${host}/api/auth/login`, {
        method: "POST", body: '{"email":"fixture@example.com"}', headers: {
          cookie: "app_session_id=app-session; CF_Authorization=private-value; csrf=csrf-value", "x-internal-token": "forged",
          "content-type": "application/json", "x-csrf-token": "csrf-value",
        },
      }), env);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/dashboard");
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.get("set-cookie")).not.toContain("CF_Authorization");
    }
    expect(hosts).toEqual(["alpha.smartaihub.app", "beta.smartaihub.app"]);
  });
  it("rejects a recursive origin or wrong environment before fetching", async () => {
    const fetchOrigin = vi.fn(); vi.stubGlobal("fetch", fetchOrigin);
    const request = new Request("https://smartaihub.app/");
    expect((await createCloudflareWorker().fetch(request, { ...env, AUTH_ORIGIN: "https://smartaihub.app", AUTH_ORIGIN_PRIVATE_HOST: "smartaihub.app" })).status).toBe(503);
    expect((await createCloudflareWorker().fetch(request, { ...env, CLOUDFLARE_ENVIRONMENT: "staging" })).status).toBe(503);
    expect(fetchOrigin).not.toHaveBeenCalled();
  });
  it("does not retry an ambiguous write against another origin", async () => {
    const fetchOrigin = vi.fn(async () => { throw new Error("origin socket lost"); }); vi.stubGlobal("fetch", fetchOrigin);
    const response = await createCloudflareWorker().fetch(new Request("https://smartaihub.app/api/auth/login", { method: "POST", body: "opaque" }), env);
    expect(response.status).toBe(503); expect(fetchOrigin).toHaveBeenCalledTimes(1);
  });
});
