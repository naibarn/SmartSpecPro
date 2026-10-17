import { describe, expect, it, vi } from "vitest";
import { proxyAuthToOrigin } from "./authOriginProxy";

const config = {
  AUTH_ORIGIN: "https://auth-origin.internal.example/",
  AUTH_ORIGIN_PRIVATE_HOST: "auth-origin.internal.example",
  AUTH_ORIGIN_TOKEN: "worker-only-secret",
};

describe("auth origin proxy", () => {
  it.each([
    ["login", "POST", "/api/auth/login?next=%2Fhome"],
    ["logout", "POST", "/api/auth/logout"],
    ["csrf", "GET", "/api/auth/csrf"],
    ["oauth callback", "GET", "/api/auth/google/callback?code=abc&state=xyz"],
    ["refresh", "POST", "/api/auth/refresh"],
  ])("preserves %s request semantics and derives trusted host context", async (_name, method, path) => {
    let sent: Request | undefined;
    const response = await proxyAuthToOrigin(new Request(`https://tenant-a.smartaihub.app${path}`, {
      method,
      headers: {
        cookie: "session=s1", authorization: "Bearer client", origin: "https://tenant-a.smartaihub.app",
        referer: "https://tenant-a.smartaihub.app/login", "x-csrf-token": "csrf", "x-xsrf-token": "xsrf",
        "content-type": "application/json", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "http",
        "x-forwarded-port": "1234", forwarded: "host=evil.invalid", "x-cloudflare-origin-token": "attacker",
        "idempotency-key": "write-123", "x-internal-token": "attacker-secret",
      },
      ...(method === "POST" ? { body: JSON.stringify({ opaque: true }) } : {}),
    }), config, async (request) => {
      sent = request;
      return new Response("ok", { status: 200 });
    });

    expect(response.status).toBe(200);
    expect(sent?.method).toBe(method);
    expect(sent?.url).toBe(`https://auth-origin.internal.example${path}`);
    expect(sent?.headers.get("cookie")).toBe("session=s1");
    expect(sent?.headers.get("authorization")).toBe("Bearer client");
    expect(sent?.headers.get("origin")).toBe("https://tenant-a.smartaihub.app");
    expect(sent?.headers.get("referer")).toBe("https://tenant-a.smartaihub.app/login");
    expect(sent?.headers.get("x-csrf-token")).toBe("csrf");
    expect(sent?.headers.get("x-xsrf-token")).toBe("xsrf");
    expect(sent?.headers.get("x-forwarded-host")).toBe("tenant-a.smartaihub.app");
    expect(sent?.headers.get("x-forwarded-proto")).toBe("https");
    expect(sent?.headers.get("x-forwarded-port")).toBeNull();
    expect(sent?.headers.get("forwarded")).toBeNull();
    expect(sent?.headers.get("x-cloudflare-origin-token")).toBe("worker-only-secret");
    expect(sent?.headers.get("idempotency-key")).toBe("write-123");
    expect(sent?.headers.get("x-internal-token")).toBeNull();
    if (method === "POST") expect(await sent?.text()).toBe(JSON.stringify({ opaque: true }));
  });

  it("preserves OAuth redirects and multiple session cookie headers", async () => {
    let redirectMode: RequestRedirect | undefined;
    const response = await proxyAuthToOrigin(new Request("https://tenant-b.smartaihub.app/api/auth/provider/callback"), config, async (request) => {
      redirectMode = request.redirect;
      const headers = new Headers({ location: "https://tenant-b.smartaihub.app/account", "content-type": "text/plain", "content-disposition": "attachment; filename=report.csv", connection: "keep-alive" });
      headers.append("set-cookie", "session=one; Path=/; HttpOnly; Secure");
      headers.append("set-cookie", "csrf=two; Path=/; Secure; SameSite=Lax");
      return new Response(null, { status: 302, headers });
    });
    expect(redirectMode).toBe("manual");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://tenant-b.smartaihub.app/account");
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=report.csv");
    expect(response.headers.get("connection")).toBeNull();
    expect((response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()).toEqual([
      "session=one; Path=/; HttpOnly; Secure", "csrf=two; Path=/; Secure; SameSite=Lax",
    ]);
  });

  it("does not choose tenant identity: forwards each original host independently", async () => {
    const hosts: string[] = [];
    for (const host of ["alpha.smartaihub.app", "beta.smartaihub.app"]) {
      await proxyAuthToOrigin(new Request(`https://${host}/api/auth/session`), config, async (request) => {
        hosts.push(request.headers.get("x-forwarded-host") ?? "");
        return new Response("ok");
      });
    }
    expect(hosts).toEqual(["alpha.smartaihub.app", "beta.smartaihub.app"]);
  });

  it("fails closed for missing config, mismatched/private origin, and caller path injection", async () => {
    const fetcher = vi.fn(async () => new Response("should not run"));
    const request = new Request("https://tenant.smartaihub.app/api/auth/login");
    expect((await proxyAuthToOrigin(request, {}, fetcher)).status).toBe(503);
    expect((await proxyAuthToOrigin(request, { ...config, AUTH_ORIGIN_PRIVATE_HOST: "other.internal.example" }, fetcher)).status).toBe(503);
    expect((await proxyAuthToOrigin(request, { ...config, AUTH_ORIGIN: "https://auth-origin.internal.example/override" }, fetcher)).status).toBe(503);
    const pathInjection = new Request("https://tenant.smartaihub.app//attacker.invalid/api/auth/login");
    await proxyAuthToOrigin(pathInjection, config, async (outbound) => {
      expect(new URL(outbound.url).host).toBe("auth-origin.internal.example");
      expect(outbound.url).toContain("//attacker.invalid/api/auth/login");
      return new Response("ok");
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates caller abort and enforces an upstream timeout", async () => {
    const caller = new AbortController();
    let callerSignal: AbortSignal | undefined;
    const callerRequest = new Request("https://tenant.smartaihub.app/api/auth/session", { signal: caller.signal });
    const callerPending = proxyAuthToOrigin(callerRequest, config, async (request) => new Promise<Response>((_resolve, reject) => {
      if (request.signal.aborted) {
        reject(request.signal.reason);
        return;
      }
      callerSignal = request.signal;
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    }), 1000);
    caller.abort(new Error("client disconnected"));
    expect((await callerPending).status).toBe(503);
    expect(callerSignal?.aborted).toBe(true);

    let timedOutSignal: AbortSignal | undefined;
    const timeoutResponse = await proxyAuthToOrigin(new Request("https://tenant.smartaihub.app/api/auth/session"), config, async (request) => new Promise<Response>((_resolve, reject) => {
      if (request.signal.aborted) {
        reject(request.signal.reason);
        return;
      }
      timedOutSignal = request.signal;
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    }), 5);
    expect(timeoutResponse.status).toBe(503);
    expect(timedOutSignal?.aborted).toBe(true);
  });
});
