import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerOAuthProxyRoutes } from "./oauthProxy";
import { createCloudflareOriginMiddleware } from "./cloudflareOriginMiddleware";

const getAppRuntimeConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: getAppRuntimeConfigMock,
}));

const stagedOrigin = "https://staging.account.workers.dev";
const ingress = { AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.example.com", AUTH_ORIGIN_TOKEN: "fixture-attestation",
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([stagedOrigin]) };

function makeApp(protectedOrigin = false) {
  const app = express();
  app.use(express.json());
  if (protectedOrigin) app.use(createCloudflareOriginMiddleware(() => ingress));
  registerOAuthProxyRoutes(app);
  return app;
}

describe("OAuth proxy routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getAppRuntimeConfigMock.mockReset();
  });

  it("forwards Google authorize requests to the Python backend", async () => {
    getAppRuntimeConfigMock.mockResolvedValue({
      pythonBackendUrl: "http://python-backend.test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authorization_url: "https://accounts.google.com/o/oauth2/auth",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const response = await request(makeApp())
      .get("/api/oauth/google/authorize?redirect=%2Flogin")
      .set("accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.body.authorization_url).toContain("accounts.google.com");
    const [authorizeUrl, authorizeOptions] = fetchMock.mock.calls[0] ?? [];
    expect(String(authorizeUrl)).toBe(
      "http://python-backend.test/api/oauth/google/authorize?redirect=%2Flogin"
    );
    expect(authorizeOptions?.method).toBe("GET");
  });

  it("forwards the OAuth callback body without forwarding browser cookies", async () => {
    getAppRuntimeConfigMock.mockResolvedValue({
      pythonBackendUrl: "http://python-backend.test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "python-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await request(makeApp())
      .post("/api/oauth/google/callback")
      .set("cookie", "session=should-not-forward")
      .send({ code: "oauth-code", state: "oauth-state" });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBe("python-token");
    const [callbackUrl, callbackOptions] = fetchMock.mock.calls[0] ?? [];
    expect(String(callbackUrl)).toBe(
      "http://python-backend.test/api/oauth/google/callback"
    );
    expect(callbackOptions?.method).toBe("POST");
    expect(callbackOptions?.body).toBe(
      JSON.stringify({ code: "oauth-code", state: "oauth-state" })
    );
    expect(callbackOptions?.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(callbackOptions?.headers).not.toHaveProperty("cookie");
  });

  it("rejects providers outside the supported login providers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await request(makeApp()).get("/api/oauth/meta/authorize");

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["https://smartaihub.app/auth/callback/google", "https://staging.account.workers.dev/auth/callback/drive", null])("fails closed when an attested staged authorize response has an unusable callback: %s", async callback => {
    getAppRuntimeConfigMock.mockResolvedValue({ pythonBackendUrl: "http://python-backend.test" });
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    if (callback) authorization.searchParams.set("redirect_uri", callback);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ authorization_url: authorization.href, state: "private-state" }));
    const response = await request(makeApp(true)).get("/api/oauth/google/authorize")
      .set("host", ingress.AUTH_ORIGIN_PRIVATE_HOST).set("x-cloudflare-origin-token", ingress.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", stagedOrigin);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("OAUTH_CALLBACK_ORIGIN_MISMATCH");
    expect(JSON.stringify(response.body)).not.toMatch(/private-state|authorization_url/);
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("preserves authorize URL/state for an explicit same-site callback and ignores unsigned forwarding", async () => {
    getAppRuntimeConfigMock.mockResolvedValue({ pythonBackendUrl: "http://python-backend.test" });
    const payload = { authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(stagedOrigin + "/auth/callback/google")}`, state: "fixture-state" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(payload));
    const staged = await request(makeApp(true)).get("/api/oauth/google/authorize")
      .set("host", ingress.AUTH_ORIGIN_PRIVATE_HOST).set("x-cloudflare-origin-token", ingress.AUTH_ORIGIN_TOKEN)
      .set("x-smartaihub-public-origin", stagedOrigin);
    expect(staged.status).toBe(200);
    expect(staged.body).toEqual(payload);
    const unsigned = await request(makeApp(true)).get("/api/oauth/google/authorize")
      .set("host", "smartaihub.app").set("x-forwarded-host", "attacker.example.com");
    expect(unsigned.status).toBe(200);
    expect(unsigned.body).toEqual(payload);
  });

  it.each(["authorize", "callback"])("pins %s to the verified origin and strips unsigned profile selection", async action => {
    getAppRuntimeConfigMock.mockResolvedValue({ pythonBackendUrl: "http://python-backend.test" });
    const payload = action === "authorize" ? { authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(stagedOrigin + "/auth/callback/google")}` } : { access_token: "fixture" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(payload));
    for (const protectedRequest of [true, false]) {
      const app = makeApp(true);
      let req = action === "authorize" ? request(app).get(`/api/oauth/google/${action}?login_origin=https://attacker.example.com`) : request(app).post(`/api/oauth/google/${action}?login_origin=https://attacker.example.com`).send({ code: "fixture", state: "fixture" });
      if (protectedRequest) req = req.set("host", ingress.AUTH_ORIGIN_PRIVATE_HOST).set("x-cloudflare-origin-token", ingress.AUTH_ORIGIN_TOKEN).set("x-smartaihub-public-origin", stagedOrigin);
      else req = req.set("host", "smartaihub.app").set("x-forwarded-host", "attacker.example.com");
      expect((await req).status).toBe(200);
      const target = new URL(String(fetchMock.mock.calls.at(-1)?.[0]));
      expect(target.searchParams.getAll("login_origin")).toEqual(protectedRequest ? [stagedOrigin] : []);
    }
  });
});
