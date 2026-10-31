import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { createAllowedBrowserOrigin } from "../_core/browserOriginPolicy";
import { createCsrfProtection } from "../_core/csrfProtection";

function app(getPublicAppUrl?: () => string, withVerifiedEdgeOrigin = false) {
  const server = express();
  server.use(cookieParser());
  server.use("/api", createCsrfProtection({
    isProduction: () => true,
    isAllowedOrigin: createAllowedBrowserOrigin({
      production: true,
      allowedOrigins: getPublicAppUrl ? "https://staging.account.workers.dev" : undefined,
      appUrl: getPublicAppUrl ? undefined : "https://smartaihub.app",
      getPublicAppUrl,
    }),
    isAllowedMarketplaceOrigin: origin => origin === "chrome-extension://approved-fixture",
    getVerifiedEdgeOrigin: withVerifiedEdgeOrigin ? () => "https://smartaihub.app" : undefined,
  }));
  server.post("/api/fixture", (_req, res) => res.sendStatus(204));
  server.post("/api/runners/connect/start", (_req, res) => res.sendStatus(204));
  server.post("/api/runners/connect/token", (_req, res) => res.sendStatus(204));
  server.post("/api/marketplace-captures", (_req, res) => res.sendStatus(204));
  server.post("/api/webhooks/telegram/fixture", (_req, res) => res.sendStatus(204));
  return server;
}

describe("actual production CSRF middleware", () => {
  it("allows browser writes from the configured public site alongside staging", async () => {
    const server = app(() => "https://smartaihub.app/");
    expect((await request(server).post("/api/fixture").set("Origin", "https://smartaihub.app")).status).toBe(204);
    expect((await request(server).post("/api/fixture").set("Origin", "https://staging.account.workers.dev")).status).toBe(204);
    expect((await request(server).post("/api/fixture").set("Origin", "https://unconfigured.smartaihub.app")).status).toBe(403);
    expect((await request(server).post("/api/fixture").set("Origin", "https://evil.invalid")).status).toBe(403);
  });
  it("uses refreshed public URL settings without retaining the previous origin", async () => {
    let publicUrl = "https://old.example.com";
    const server = app(() => publicUrl);
    expect((await request(server).post("/api/fixture").set("Origin", publicUrl)).status).toBe(204);
    publicUrl = "https://new.example.com";
    expect((await request(server).post("/api/fixture").set("Origin", publicUrl)).status).toBe(204);
    expect((await request(server).post("/api/fixture").set("Origin", "https://old.example.com")).status).toBe(403);
  });
  it("rejects cookie-authenticated writes without Origin", async () => {
    const response = await request(app()).post("/api/fixture").set("Cookie", `${COOKIE_NAME}=fixture-only`);
    expect(response.status).toBe(403);
  });
  it("allows native Runner pairing writes without Origin only when no browser session cookie is present", async () => {
    const server = app(undefined, true);
    expect((await request(server).post("/api/runners/connect/start")).status).toBe(204);
    expect((await request(server).post("/api/runners/connect/token")).status).toBe(204);
    expect((await request(server).post("/api/fixture")).status).toBe(403);
    expect((await request(server).post("/api/runners/connect/start").set("Cookie", `${COOKIE_NAME}=fixture-only`)).status).toBe(403);
    expect((await request(server).post("/api/runners/connect/token").set("Cookie", `${COOKIE_NAME}=fixture-only`)).status).toBe(403);
  });
  it("continues validating Origin on native Runner pairing writes when a browser supplies one", async () => {
    const server = app();
    expect((await request(server).post("/api/runners/connect/start").set("Origin", "https://smartaihub.app")).status).toBe(204);
    expect((await request(server).post("/api/runners/connect/start").set("Origin", "https://evil.invalid")).status).toBe(403);
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
