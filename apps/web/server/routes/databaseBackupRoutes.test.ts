import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../_core/authz", () => ({
  authorizeRequest: vi
    .fn()
    .mockResolvedValue({ ok: true, mode: "session", user: { role: "user" } }),
}));
vi.mock("../services/databaseBackupService", () => ({
  getDatabaseBackupJob: vi.fn(),
  resolveDatabaseBackupArtifactPath: vi.fn(),
}));

describe("database backup download route", () => {
  it("rejects non-admin session users", async () => {
    const { registerDatabaseBackupRoutes } =
      await import("./databaseBackupRoutes");
    const app = express();
    registerDatabaseBackupRoutes(app);
    const response = await request(app).get(
      "/api/admin/database-backups/11111111-1111-4111-8111-111111111111/database/download"
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("forbidden");
  });
});
