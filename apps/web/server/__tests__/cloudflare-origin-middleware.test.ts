import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudflareOriginMiddleware } from "../_core/cloudflareOriginMiddleware";
import { getSessionCookieOptions } from "../_core/cookies";
import { clearTenantCache, tenantMiddleware } from "../_core/tenant";
import { createAllowedBrowserOrigin } from "../_core/browserOriginPolicy";
import { createCsrfProtection } from "../_core/csrfProtection";

const fixtures = vi.hoisted(() => [
  { id: "tenant-alpha", primaryDomain: "alpha.smartaihub.app", isActive: true, domains: ["staging.account.workers.dev"] },
  { id: "tenant-beta", primaryDomain: "beta.smartaihub.app", isActive: true, domains: [] },
]);

vi.mock("../db", () => ({
  getDb: async () => ({ select: () => ({ from: () => ({ where: (condition: unknown) => {
    // Minimal DB fixture, not a second tenant resolver: inspect bound SQL values.
    const parameters: unknown[] = [];
    const visit = (node: any) => {
      if (node?.queryChunks) node.queryChunks.forEach(visit);
      else if (node?.constructor?.name === "Param") parameters.push(node.value);
    };
    visit(condition);
    const domain = parameters.find(value => typeof value === "string");
    const rows = domain ? fixtures.filter(row => row.primaryDomain === domain) : fixtures;
    return { limit: async () => rows.slice(0, 1), then: (resolve: any) => Promise.resolve(rows).then(resolve) };
  } }) }) }),
}));

const config = {
  AUTH_ORIGIN_TOKEN: "fixture-origin-secret",
  AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.smartaihub.app",
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://alpha.smartaihub.app","https://beta.smartaihub.app","https://staging.account.workers.dev"]',
};

function app(overrides: Partial<typeof config> = {}) {
  const server = express();
  server.set("trust proxy", 1);
  server.use(createCloudflareOriginMiddleware(() => ({ ...config, ...overrides })));
  server.use(cookieParser());
  server.use(tenantMiddleware);
  server.use("/trpc", createCsrfProtection({
    isAllowedOrigin: createAllowedBrowserOrigin({
      production: true,
      allowedOrigins: JSON.parse(config.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS).join(","),
    }),
    isAllowedMarketplaceOrigin: () => false,
    isProduction: () => true,
  }));
  // Fixture handler only; these tests establish actual CSRF, not live login.
  server.post("/trpc/auth.login", (_req, res) => res.json({ reachedHandler: true }));
  server.get("/probe", (req: any, res) => {
    res.cookie("fixture", "test-only", getSessionCookieOptions(req));
    res.json({ hostname: req.hostname, protocol: req.protocol, tenantId: req.tenantId });
  });
  return server;
}

describe("actual Express Cloudflare origin middleware", () => {
  afterEach(() => clearTenantCache());

  it.each([undefined, "wrong-secret"])("requires attestation on the dedicated ingress: %s", async token => {
    const probe = request(app()).get("/probe").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST).set("X-Forwarded-Host", "alpha.smartaihub.app");
    if (token) probe.set("x-cloudflare-origin-token", token);
    expect((await probe).status).toBe(403);
  });

  it.each(["alpha", "beta"])("resolves actual tenant middleware from attested %s public host", async name => {
    const response = await request(app()).get("/probe")
      .set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", `https://${name}.smartaihub.app`)
      .set("X-Forwarded-Host", "attacker.invalid").set("X-Forwarded-Proto", "http");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hostname: `${name}.smartaihub.app`, protocol: "https", tenantId: `tenant-${name}` });
  });

  it.each([undefined, "https://evil.invalid", "https://alpha.smartaihub.app/path", "https://alpha.smartaihub.app,https://beta.smartaihub.app"])("rejects missing, foreign or ambiguous public context: %s", async publicOrigin => {
    const probe = request(app()).get("/probe").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN);
    if (publicOrigin) probe.set("x-smartaihub-public-origin", publicOrigin);
    expect((await probe).status).toBe(403);
  });

  it("preserves direct public traffic while discarding unsigned forwarded host selection", async () => {
    const response = await request(app()).get("/probe").set("Host", "alpha.smartaihub.app")
      .set("X-Forwarded-Host", "beta.smartaihub.app");
    expect(response.status).toBe(200);
    expect(response.body.tenantId).toBe("tenant-alpha");
  });

  it("serializes a host-only Secure/HttpOnly cookie for the attested Worker hostname", async () => {
    const response = await request(app()).get("/probe").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", "https://staging.account.workers.dev");
    expect(response.status).toBe(200);
    expect(response.body.tenantId).toBe("tenant-alpha");
    const cookie = response.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("fails closed for partial protected-origin configuration", async () => {
    const response = await request(app({ AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: "[]" })).get("/probe")
      .set("Host", config.AUTH_ORIGIN_PRIVATE_HOST).set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", "https://alpha.smartaihub.app");
    expect(response.status).toBe(503);
  });

  it.each([
    ["https://alpha.smartaihub.app", 200],
    ["https://beta.smartaihub.app", 403],
    ["https://evil.invalid", 403],
    [undefined, 403],
  ] as const)("binds the real CSRF middleware to attested origin before login: %s", async (origin, status) => {
    const probe = request(app()).post("/trpc/auth.login").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", "https://alpha.smartaihub.app");
    if (origin) probe.set("Origin", origin);
    expect((await probe).status).toBe(status);
  });

  it("retains the bearer transport exemption without manufacturing authenticated identity", async () => {
    const response = await request(app()).post("/trpc/auth.login").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", "https://alpha.smartaihub.app")
      .set("Authorization", "Bearer fixture-only-not-an-authenticated-session");
    expect(response.status).toBe(200); // Downstream authentication is not part of this fixture handler.
  });

  it("does not select the first tenant for an attested but unknown host", async () => {
    const response = await request(app({ AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://unknown.smartaihub.app"]' }))
      .get("/probe").set("Host", config.AUTH_ORIGIN_PRIVATE_HOST)
      .set("x-cloudflare-origin-token", config.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", "https://unknown.smartaihub.app");
    expect(response.status).toBe(404);
  });
});
