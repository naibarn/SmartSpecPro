import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Server } from "node:http";

// Only the external object store is replaced. Authentication, cookies, tenant
// resolution, CSRF, tRPC handlers and PostgreSQL are the real implementations.
const objects = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("../storage", async original => ({
  ...await original<typeof import("../storage")>(),
  assertR2StorageActive: async () => {},
  storagePut: async (key: string, bytes: Buffer) => {
    objects.set(key, Buffer.from(bytes));
    return { key, url: `https://storage.fixture.invalid/${key}` };
  },
}));

const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("HYBRID_INGRESS real authentication and persistence through the production proxy", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let client: import("postgres").Sql;
  let server: Server;
  let base: string;
  let closeDb: typeof import("../db").closeDb;
  let proxy: typeof import("../../../cloudflare/src/authOriginProxy").proxyAuthToOrigin;
  let original: Record<string, string | undefined>;
  const publicOrigin = "https://smartaihub.app";
  const privateHost = "origin.fixture.invalid";
  const config = {
    AUTH_ORIGIN: `https://${privateHost}`,
    AUTH_ORIGIN_PRIVATE_HOST: privateHost,
    AUTH_ORIGIN_TOKEN: "isolated-origin-attestation-only",
    AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([publicOrigin, "https://beta.smartaihub.app"]),
    AUTH_ORIGIN_ACCESS_CLIENT_ID: "isolated-access-client",
    AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "isolated-access-secret",
  };
  const password = "Isolated-acceptance-password-57!";
  let cookieA = "", cookieB = "";

  beforeAll(async () => {
    original = Object.fromEntries(["DATABASE_URL", "NODE_ENV", "JWT_SECRET", "ADMIN_EMAIL", "CONTROL_PLANE_API_KEY"].map(key => [key, process.env[key]]));
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "isolated-hybrid-session-signing-key-only";
    process.env.ADMIN_EMAIL = "not-a-fixture-user@example.invalid";
    process.env.CONTROL_PLANE_API_KEY = "isolated-hybrid-control-plane-key-only";
    (await import("prom-client")).register.clear();
    vi.resetModules();
    client = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    const schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(client, [
      schema.systemSettings, schema.users, schema.tenants, schema.revokedTokenJtis, schema.conversations,
    ]);
    const hash = await (await import("bcrypt")).hash(password, 4);
    await client`INSERT INTO tenants (id,slug,name,"primaryDomain") VALUES
      ('hybrid-a','hybrid-a','Isolated A','smartaihub.app'),
      ('hybrid-b','hybrid-b','Isolated B','beta.smartaihub.app')`;
    await client`INSERT INTO users (id,"openId",email,name,password,role,"currentTenantId","loginMethod","userPreferences") VALUES
      (71,'hybrid-isolated-a','hybrid-a@example.invalid','Fixture A',${hash},'user','hybrid-a','email','{}'),
      (72,'hybrid-isolated-b','hybrid-b@example.invalid','Fixture B',${hash},'user','hybrid-b','email','{}')`;
    await client`INSERT INTO conversations (id,"userId",title) VALUES (701,71,'Only A'),(702,72,'Only B')`;
    const express = (await import("express")).default;
    const cookieParser = (await import("cookie-parser")).default;
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { createCloudflareOriginMiddleware } = await import("../_core/cloudflareOriginMiddleware");
    const { createCsrfProtection } = await import("../_core/csrfProtection");
    const { createContext } = await import("../_core/context");
    const { tenantMiddleware } = await import("../_core/tenant");
    const { appRouter } = await import("../routers");
    ({ closeDb } = await import("../db"));
    ({ proxyAuthToOrigin: proxy } = await import("../../../cloudflare/src/authOriginProxy"));
    const app = express();
    app.set("trust proxy", 1);
    app.use(createCloudflareOriginMiddleware(() => config));
    app.use(express.json({ limit: "2mb" }), cookieParser(), tenantMiddleware);
    app.use("/trpc", createCsrfProtection({ isProduction: () => true,
      isAllowedOrigin: origin => origin === publicOrigin || origin === "https://beta.smartaihub.app",
      isAllowedMarketplaceOrigin: () => false,
    }));
    app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("ISOLATED_ORIGIN_NOT_LISTENING");
    base = `http://127.0.0.1:${address.port}`;
  }, 40_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (closeDb) await closeDb();
    if (client) await client.end({ timeout: 3 });
    if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(original ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }, 20_000);

  async function call(path: string, options: { cookie?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {}) {
    const headers = new Headers(options.headers);
    if (options.cookie) headers.set("cookie", options.cookie);
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      if (options.origin !== null) headers.set("origin", options.origin ?? publicOrigin);
    }
    // Replace only the network destination, never the trust headers or request
    // context. The private-origin middleware validates the actual proxy output.
    return proxy(new Request(`${publicOrigin}/trpc/${path}`, {
      method: options.body === undefined ? "GET" : "POST", headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify({ json: options.body }) }),
    }), config, async request => {
      const url = new URL(request.url);
      return fetch(`${base}${url.pathname}${url.search}`, {
        method: request.method, headers: { ...Object.fromEntries(request.headers), host: privateHost },
        ...(request.body ? { body: request.body, duplex: "half" } as RequestInit : {}),
        redirect: "manual", signal: request.signal,
      });
    });
  }
  async function json(response: Response) { return (await response.json()).result?.data?.json; }
  function session(response: Response) {
    const cookies = response.headers.getSetCookie();
    const value = cookies.find(cookie => cookie.startsWith("app_session_id="));
    expect(value).toContain("Domain=.smartaihub.app");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=None");
    expect(cookies.join(";")).not.toContain("CF_Authorization");
    return value!.split(";", 1)[0];
  }

  it("logs in with real bcrypt/JWT, preserves sessions, blocks CSRF and writes only the authenticated account", async () => {
    expect(await json(await call("auth.me"))).toBeNull();
    const credentials = { email: "hybrid-a@example.invalid", password };
    expect((await call("auth.login", { body: credentials, origin: "https://evil.invalid" })).status).toBe(403);
    expect((await call("auth.login", { body: credentials, origin: null })).status).toBe(403);
    expect((await call("auth.login", { body: { ...credentials, password: "wrong" } })).status).toBe(401);
    const loginA = await call("auth.login", { body: credentials });
    expect(loginA.status).toBe(200);
    expect(await json(loginA)).toMatchObject({ success: true, user: { id: 71, currentTenantId: "hybrid-a" } });
    cookieA = session(loginA);
    const loginB = await call("auth.login", { body: { email: "hybrid-b@example.invalid", password } });
    expect(loginB.status).toBe(200);
    cookieB = session(loginB);
    expect(await json(await call("auth.me", { cookie: cookieA }))).toMatchObject({ id: 71, currentTenantId: "hybrid-a" });
    expect(await json(await call("auth.me", { cookie: cookieB }))).toMatchObject({ id: 72, currentTenantId: "hybrid-b" });
    expect((await call("users.updatePreferences", { cookie: cookieA, body: { displayLocale: "th" }, origin: null })).status).toBe(403);
    expect((await call("users.updatePreferences", { cookie: cookieA, body: { displayLocale: "th" }, origin: "https://beta.smartaihub.app" })).status).toBe(403);
    const write = await call("users.updatePreferences", { cookie: cookieA, body: { displayLocale: "th" } });
    expect(write.status).toBe(200);
    expect(await json(await call("users.getPreferences", { cookie: cookieA }))).toMatchObject({ displayLocale: "th" });
    const rows = await client`SELECT id,"userPreferences" FROM users ORDER BY id`;
    expect(rows[0].userPreferences.displayLocale).toBe("th");
    expect(rows[1].userPreferences).toEqual({});
  });

  it("keeps account tenant authority, denies foreign reads and internal-header spoofing, and preserves upload bytes", async () => {
    const forged = { "x-forwarded-host": "beta.smartaihub.app", "x-smartaihub-public-origin": "https://beta.smartaihub.app",
      "x-tenant-id": "hybrid-b", "x-internal-token": "forged-internal", "x-cloudflare-origin-token": "forged-origin" };
    const own = await call('chat.getConversation?input='+encodeURIComponent(JSON.stringify({json:{id:701}})), { cookie: cookieA, headers: forged });
    expect(own.status).toBe(200);
    expect(await json(own)).toMatchObject({ id: 701, title: "Only A" });
    expect((await call('chat.getConversation?input='+encodeURIComponent(JSON.stringify({json:{id:702}})), { cookie: cookieA, headers: forged })).status).toBe(404);
    expect((await call('chat.getConversation?input='+encodeURIComponent(JSON.stringify({json:{id:701}})), { cookie: cookieB })).status).toBe(404);
    const bytes = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(96*1024, 0x57)]);
    const upload = await call("ai.upload", { cookie: `${cookieB}; CF_Authorization=untrusted-private-cookie`, headers: forged,
      body: { fileName: "isolated-upload.png", fileType: "image/png", fileBase64: bytes.toString("base64") } });
    expect(upload.status).toBe(200);
    const value = await json(upload);
    expect(value.key).toMatch(/^chat\/uploads\/hybrid-b\/72\//);
    expect(createHash("sha256").update(objects.get(value.key)!).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await call("ai.upload", { body: { fileName: "x.png", fileType: "image/png", fileBase64: bytes.toString("base64") } })).status).toBe(401);
  });

  it("logs out, clears the same cookie domain and revokes the old session in PostgreSQL", async () => {
    const result = await call("auth.logout", { cookie: cookieA, body: {} });
    expect(result.status).toBe(200);
    expect(await json(result)).toEqual({ success: true });
    expect(result.headers.get("set-cookie")).toContain("app_session_id=;");
    expect(result.headers.get("set-cookie")).toContain("Domain=.smartaihub.app");
    expect(await json(await call("auth.me", { cookie: cookieA }))).toBeNull();
    expect(await json(await call("auth.me", { headers: { authorization: `Bearer ${cookieA.slice("app_session_id=".length)}` } }))).toBeNull();
    expect((await client`SELECT count(*)::int AS n FROM revoked_token_jtis`)[0].n).toBe(1);
    expect(await json(await call("auth.me", { cookie: cookieB }))).toMatchObject({ id: 72 });
  });

  it("fails closed when the durable session-revocation store is unavailable", async () => {
    await client`ALTER TABLE revoked_token_jtis RENAME TO isolated_revocations_offline`;
    expect(await json(await call("auth.me", { cookie: cookieB }))).toBeNull();
  });
});
