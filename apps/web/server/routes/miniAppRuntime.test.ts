import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  resolvePreview: vi.fn(),
  resolveVersion: vi.fn(),
  resolveViewer: vi.fn(),
  readValue: vi.fn(),
  writeValue: vi.fn(),
}));

vi.mock("../_core/context", () => ({ createContext: mocks.createContext }));
vi.mock("../_core/env", () => ({ ENV: { cookieSecret: "mini-app-runtime-route-test-secret-32-chars" } }));
vi.mock("../services/personalMiniAppPreview", () => ({ resolvePersonalMiniAppPreview: mocks.resolvePreview, resolveMiniAppDeploymentVersion: mocks.resolveVersion }));
vi.mock("../services/appIdentityRepository", () => ({ resolveMiniAppForViewer: mocks.resolveViewer }));
vi.mock("../services/miniAppRuntime", async importOriginal => {
  const actual = await importOriginal<typeof import("../services/miniAppRuntime")>();
  return { ...actual, readMiniAppRuntimeValue: mocks.readValue, writeMiniAppRuntimeValue: mocks.writeValue };
});

import {
  applyMiniAppRuntimeStorageCors,
  registerMiniAppRuntimeRoutes,
} from "./miniAppRuntime";
import { createMiniAppRuntimeReadyMarker, createMiniAppRuntimeStorageToken } from "../services/miniAppRuntime";

const scope = { appId: "app_expense", tenantId: "tenant-owner", userId: 23 };
const artifact = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"></head><body><main>expense app</main></body></html>';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(applyMiniAppRuntimeStorageCors);
  registerMiniAppRuntimeRoutes(app);
  app.use((_req, res) => res.status(404).end());
  return app;
}

describe("Mini-App isolated runtime routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createContext.mockImplementation(async ({ req }: any) => ({
      req,
      res: {},
      user: { id: scope.userId },
      tenantId: scope.tenantId,
      publicUrl: "https://smartaihub.app",
    }));
    mocks.resolvePreview.mockResolvedValue({
      app: { ...scope, ownerUserId: scope.userId, visibility: "private", deploymentVersion: 1, lastKnownGoodArtifactRef: "r2://preview" },
      html: artifact,
      artifactDigest: "a".repeat(64),
    });
    mocks.resolveVersion.mockResolvedValue(null);
    mocks.resolveViewer.mockResolvedValue({ ...scope, ownerUserId: scope.userId, visibility: "private" });
  });

  it("serves a private artifact as a top-level sandboxed document after migration readiness", async () => {
    const response = await request(makeApp())
      .get(`/miniapp/${scope.appId}`)
      .set("Cookie", `miniapp_runtime_ready=${createMiniAppRuntimeReadyMarker(scope)}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("sandbox allow-scripts allow-forms");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.text).toContain("<main>expense app</main>");
    expect(response.text).toContain("Back to Development");
  });

  it("keeps canonical app as the SPA bootstrap until legacy browser data migration completes", async () => {
    const response = await request(makeApp()).get(`/miniapp/${scope.appId}`);
    expect(response.status).toBe(404);
    expect(mocks.createContext).not.toHaveBeenCalled();
  });

  it("requires the owner for runtime document delivery and denies anonymous private reads", async () => {
    mocks.createContext.mockResolvedValueOnce({ req: {}, res: {}, user: null, tenantId: null, publicUrl: null });
    const response = await request(makeApp())
      .get(`/miniapp/${scope.appId}`)
      .set("Cookie", `miniapp_runtime_ready=${createMiniAppRuntimeReadyMarker(scope)}`);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain("expense app");
  });

  it("serves only the selected immutable deployment version", async () => {
    const current = await request(makeApp())
      .get(`/miniapp/${scope.appId}/preview/1`)
      .set("Cookie", `miniapp_runtime_ready=${createMiniAppRuntimeReadyMarker(scope)}`);
    expect(current.status).toBe(200);
    expect(current.text).toContain("<main>expense app</main>");

    const response = await request(makeApp())
      .get(`/miniapp/${scope.appId}/preview/2`)
      .set("Cookie", `miniapp_runtime_ready=${createMiniAppRuntimeReadyMarker(scope)}`);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain("expense app");
  });

  it("loads the exact immutable historical version when its source/artifact binding exists", async () => {
    const selected = {
      app: { ...scope, ownerUserId: scope.userId, visibility: "private", deploymentVersion: 1, lastKnownGoodArtifactRef: "r2://version-1" },
      html: artifact,
      artifactDigest: "a".repeat(64),
      sourceRef: "r2://source-version-1",
      sourceDigest: "b".repeat(64),
      developmentRunId: "run-" + "c".repeat(40),
    };
    mocks.resolveVersion.mockResolvedValueOnce(selected);
    const response = await request(makeApp())
      .get(`/miniapp/${scope.appId}/preview/1`)
      .set("Cookie", `miniapp_runtime_ready=${createMiniAppRuntimeReadyMarker(scope)}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain("<main>expense app</main>");
    expect(mocks.resolveVersion).toHaveBeenCalledWith({ ...scope, deploymentVersion: 1 });
  });

  it("accepts opaque-origin storage only with the scoped bearer token", async () => {
    mocks.readValue.mockResolvedValueOnce([{ amount: 12 }]);
    const token = createMiniAppRuntimeStorageToken(scope);
    const response = await request(makeApp())
      .post(`/_miniapp-runtime/${scope.appId}/storage`)
      .set("Origin", "null")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "GET", key: "expenses" });
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("null");
    expect(response.body).toEqual({ value: [{ amount: 12 }] });

    const denied = await request(makeApp())
      .post(`/_miniapp-runtime/${scope.appId}/storage`)
      .set("Origin", "null")
      .set("Authorization", `Bearer ${createMiniAppRuntimeStorageToken({ ...scope, appId: "app_other" })}`)
      .send({ action: "GET", key: "expenses" });
    expect(denied.status).toBe(401);
  });

  it("responds to only the opaque-origin storage preflight", async () => {
    const response = await request(makeApp())
      .options(`/_miniapp-runtime/${scope.appId}/storage`)
      .set("Origin", "null")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("null");
  });
});
