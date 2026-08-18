import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerOAuthProxyRoutes } from "./oauthProxy";

const getAppRuntimeConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: getAppRuntimeConfigMock,
}));

function makeApp() {
  const app = express();
  app.use(express.json());
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
});
