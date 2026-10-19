import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { createAllowedBrowserOrigin } from "../_core/browserOriginPolicy";
import { createCsrfProtection } from "../_core/csrfProtection";

function app() {
  const server = express();
  server.use(cookieParser());
  server.use("/api", createCsrfProtection({
    isProduction: () => true,
    isAllowedOrigin: createAllowedBrowserOrigin({ production: true, appUrl: "https://smartaihub.app" }),
    isAllowedMarketplaceOrigin: origin => origin === "chrome-extension://approved-fixture",
  }));
  server.post("/api/fixture", (_req, res) => res.sendStatus(204));
  server.post("/api/marketplace-captures", (_req, res) => res.sendStatus(204));
  server.post("/api/webhooks/telegram/fixture", (_req, res) => res.sendStatus(204));
  return server;
}

describe("actual production CSRF middleware", () => {
  it("rejects cookie-authenticated writes without Origin", async () => {
    const response = await request(app()).post("/api/fixture").set("Cookie", `${COOKIE_NAME}=fixture-only`);
    expect(response.status).toBe(403);
  });
  it.each(["https://evil.invalid", "https://staging.account.workers.dev", "https://smartaihub.app/path"])("rejects unconfigured or malformed browser origin %s", async origin => {
    expect((await request(app()).post("/api/fixture").set("Origin", origin)).status).toBe(403);
  });
  it("preserves configured production and bearer transport behavior", async () => {
    expect((await request(app()).post("/api/fixture").set("Origin", "https://smartaihub.app")).status).toBe(204);
    expect((await request(app()).post("/api/fixture").set("Authorization", "Bearer fixture-only")).status).toBe(204);
  });
  it("preserves the existing signed-provider callback exemption", async () => {
    expect((await request(app()).post("/api/webhooks/telegram/fixture").set("Origin", "https://provider.invalid")).status).toBe(204);
  });
  it("requires bearer transport for the existing Marketplace extension exception", async () => {
    expect((await request(app()).post("/api/marketplace-captures").set("Origin", "chrome-extension://approved-fixture")).status).toBe(403);
    expect((await request(app()).post("/api/marketplace-captures").set("Origin", "chrome-extension://approved-fixture").set("Authorization", "Bearer fixture-only")).status).toBe(204);
  });
});
