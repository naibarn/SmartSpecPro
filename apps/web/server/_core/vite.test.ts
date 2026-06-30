import { describe, expect, it, vi } from "vitest";
import express from "express";
import path from "path";
import request from "supertest";

import { isApiRequestPath } from "./apiPathGuard";
import { cacheControlForStaticFile, serveStatic } from "./vite";

vi.mock("../../vite.config", () => ({ default: {} }));

describe("vite api fallback guard", () => {
  it("classifies tRPC and API paths as API requests", () => {
    expect(isApiRequestPath("/trpc/chat.executeSkill")).toBe(true);
    expect(isApiRequestPath("/trpc/chat.executeSkill?batch=1")).toBe(true);
    expect(isApiRequestPath("/api/oauth/google/authorize")).toBe(true);
  });

  it("does not classify app routes or static assets as API requests", () => {
    expect(isApiRequestPath("/chat?c=71")).toBe(false);
    expect(isApiRequestPath("/assets/index.js")).toBe(false);
  });
});

describe("vite production static serving", () => {
  it("prevents stale HTML while keeping hashed assets cacheable", () => {
    expect(cacheControlForStaticFile(path.join("dist", "public", "index.html"))).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    expect(cacheControlForStaticFile(path.join("dist", "public", "assets", "index-abc123.js"))).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(cacheControlForStaticFile(path.join("dist", "public", "images", "dashboard-preview.jpg"))).toBeNull();
  });

  it("serves a lightweight health response before the SPA fallback", async () => {
    const app = express();
    serveStatic(app);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      status: "ok",
      service: "smartaihub-web",
    });
  });
});
