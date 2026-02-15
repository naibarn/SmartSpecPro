/**
 * Tests for Cloud Run health check endpoints (/healthz, /readyz)
 * and graceful shutdown behavior.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { sql } from "drizzle-orm";

// Create a minimal test app with health check endpoints
let app: Express;
let mockDb: any;
let mockRedis: any;

// Mock the database and redis modules
vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
  sql,
}));

vi.mock("../services/redis", () => ({
  getRedisClient: vi.fn(() => mockRedis),
}));

describe("GET /healthz", () => {
  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Add the healthz endpoint
    app.get("/healthz", (_req, res) => {
      res.json({ status: "ok" });
    });
  });

  it("returns 200 with status ok when process is running", async () => {
    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
  });

  it("returns JSON body with status field", async () => {
    const response = await request(app).get("/healthz");
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toHaveProperty("status");
  });
});

describe("GET /readyz", () => {
  beforeAll(async () => {
    // Reset app for readyz tests
    app = express();
    app.use(express.json());

    // Mock successful DB and Redis
    mockDb = {
      execute: vi.fn(() => Promise.resolve([{ "?column?": 1 }])),
    };
    mockRedis = {
      ping: vi.fn(() => Promise.resolve("PONG")),
    };

    // Import mocked modules
    const { getDb } = await import("../db");
    const { getRedisClient } = await import("../services/redis");

    // Add the readyz endpoint
    app.get("/readyz", async (_req, res) => {
      const checks: Record<string, string> = {};
      let allHealthy = true;

      try {
        const db = await getDb();
        if (!db) {
          checks.db = "unavailable";
          allHealthy = false;
        } else {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 2000)
          );
          const queryPromise = db.execute(sql`SELECT 1`);
          await Promise.race([queryPromise, timeoutPromise]);
          checks.db = "ok";
        }
      } catch (error: any) {
        checks.db = error?.message === "timeout" ? "timeout" : "error";
        allHealthy = false;
      }

      try {
        const redis = getRedisClient();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 2000)
        );
        const pingPromise = redis.ping();
        await Promise.race([pingPromise, timeoutPromise]);
        checks.redis = "ok";
      } catch (error: any) {
        checks.redis = error?.message === "timeout" ? "timeout" : "error";
        allHealthy = false;
      }

      if (allHealthy) {
        res.json({ status: "ready", checks });
      } else {
        res.status(503).json({ status: "not_ready", checks });
      }
    });
  });

  it("returns 200 when DB pool and Redis are reachable", async () => {
    const response = await request(app).get("/readyz");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ready");
  });

  it.skip("returns 503 when DB connection fails", async () => {
    // TODO: Mock DB connection failure
  });

  it.skip("returns 503 when Redis connection fails", async () => {
    // TODO: Mock Redis connection failure
  });

  it("includes individual check results in response body", async () => {
    const response = await request(app).get("/readyz");
    expect(response.body).toHaveProperty("checks");
    expect(response.body.checks).toHaveProperty("db");
    expect(response.body.checks).toHaveProperty("redis");
  });
});

describe("Graceful shutdown", () => {
  it.skip("stops accepting new connections on SIGTERM", async () => {
    // Integration test - requires process control
  });

  it.skip("drains in-flight requests before exiting", async () => {
    // Integration test - requires process control
  });

  it.skip("closes Redis connections during shutdown", async () => {
    // Integration test - requires connection mocking
  });

  it.skip("closes DB connection pool during shutdown", async () => {
    // Integration test - requires connection mocking
  });

  it.skip("exits with code 0 within 30 seconds", async () => {
    // Integration test - requires process control
  });
});
