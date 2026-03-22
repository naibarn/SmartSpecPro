import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock dependencies before importing the module
vi.mock("../../db", () => ({
  db: {
    instance: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../../services/featureFlags", () => ({
  getFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/crypto", () => ({
  decrypt: vi.fn().mockReturnValue('{"X-Custom": "value"}'),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("../../middleware/requireScopes", () => ({
  requireScopes: () => (req: any, _res: any, next: any) => next(),
}));

vi.mock("../../middleware/publicApiHeaders", () => ({
  sendApiError: (res: any, status: number, code: string, message: string) => {
    res.status(status).json({ error: { code, message, type: "error" } });
  },
}));

import { createAgencyToolsApiRouter } from "../agencyToolsApi";
import { db } from "../../db";
import { getFeatureFlag } from "../../services/featureFlags";

function createTestApp(auth?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) {
      (req as any).auth = auth;
    }
    next();
  });
  app.use("/api/v1/agency-tools", createAgencyToolsApiRouter());
  return app;
}

const validApiKeyAuth = {
  ok: true,
  mode: "api_key",
  tenantId: "tenant-1",
  sub: "user-1",
  apiKeyId: "key-hash-1",
  userId: 1,
  scopes: ["agency:tool:execute"],
  rateLimit: 100,
  creditLimit: null,
  quotaHourly: null,
  quotaDaily: null,
  quotaWeekly: null,
  quotaMonthly: null,
};

describe("Standalone Tool API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFeatureFlag).mockResolvedValue(true);
  });

  describe("POST /api/v1/agency-tools/:toolId/execute", () => {
    it("requires API key authentication", async () => {
      const app = createTestApp(); // No auth
      const res = await request(app)
        .post("/api/v1/agency-tools/test-id/execute")
        .send({ query: "test" });
      expect(res.status).toBe(401);
    });

    it("rejects non-api_key auth mode", async () => {
      const app = createTestApp({ ok: true, mode: "bearer", sub: "user-1", scopes: [] });
      const res = await request(app)
        .post("/api/v1/agency-tools/test-id/execute")
        .send({ query: "test" });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain("API key authentication required");
    });

    it("rejects tool not marked isExposedAsApi", async () => {
      const app = createTestApp(validApiKeyAuth);
      vi.mocked(db.instance.limit).mockResolvedValue([]);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({ query: "test" });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain("not found or not exposed");
    });

    it("validates input against tool inputSchema", async () => {
      const app = createTestApp(validApiKeyAuth);

      vi.mocked(db.instance.limit).mockResolvedValue([
        {
          id: "tool-123",
          tenantId: "tenant-1",
          isExposedAsApi: true,
          isEnabled: true,
          name: "Test Tool",
          inputSchema: {
            type: "object",
            required: ["query"],
            properties: { query: { type: "string" } },
          },
          outputSchema: null,
          config: { endpoint_url: "https://example.com/api" },
          httpMethod: "POST",
          headersEncrypted: null,
        },
      ]);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({ wrong_field: "value" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    });

    it("blocks SSRF on tool endpoint URL", async () => {
      const app = createTestApp(validApiKeyAuth);

      vi.mocked(db.instance.limit).mockResolvedValue([
        {
          id: "tool-123",
          tenantId: "tenant-1",
          isExposedAsApi: true,
          isEnabled: true,
          name: "SSRF Tool",
          inputSchema: null,
          outputSchema: null,
          config: { endpoint_url: "http://169.254.169.254/latest/meta-data" },
          httpMethod: "GET",
          headersEncrypted: null,
        },
      ]);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("ssrf_blocked");
    });

    it("succeeds with valid input", async () => {
      const app = createTestApp(validApiKeyAuth);

      vi.mocked(db.instance.limit).mockResolvedValue([
        {
          id: "tool-123",
          tenantId: "tenant-1",
          isExposedAsApi: true,
          isEnabled: true,
          name: "Test Tool",
          inputSchema: null,
          outputSchema: null,
          config: { endpoint_url: "https://example.com/api" },
          httpMethod: "POST",
          headersEncrypted: null,
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"result": "ok"}',
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({ query: "test" });

      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({ result: "ok" });
      vi.unstubAllGlobals();
    });

    it("returns 403 when feature flag is disabled", async () => {
      vi.mocked(getFeatureFlag).mockResolvedValue(false);
      const app = createTestApp(validApiKeyAuth);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({ query: "test" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("feature_disabled");
    });

    it("returns 500 when header decryption fails", async () => {
      const app = createTestApp(validApiKeyAuth);
      const { decrypt } = await import("../../services/crypto");
      vi.mocked(decrypt).mockImplementation(() => { throw new Error("decrypt failed"); });

      vi.mocked(db.instance.limit).mockResolvedValue([
        {
          id: "tool-123",
          tenantId: "tenant-1",
          isExposedAsApi: true,
          isEnabled: true,
          name: "Test Tool",
          inputSchema: null,
          outputSchema: null,
          config: { endpoint_url: "https://example.com/api" },
          httpMethod: "POST",
          headersEncrypted: "encrypted-data-here",
        },
      ]);

      const res = await request(app)
        .post("/api/v1/agency-tools/tool-123/execute")
        .send({ query: "test" });

      expect(res.status).toBe(500);
      expect(res.body.error.message).toContain("decrypt tool authentication");
    });
  });

  describe("GET /api/v1/agency-tools/openapi.json", () => {
    it("returns valid OpenAPI 3.0 spec", async () => {
      const app = createTestApp(validApiKeyAuth);

      vi.mocked(db.instance.where).mockResolvedValue([
        {
          id: "tool-1",
          name: "Search Tool",
          description: "Searches the web",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
          outputSchema: { type: "object" },
        },
        {
          id: "tool-2",
          name: "Translate Tool",
          description: "Translates text",
          inputSchema: { type: "object", properties: { text: { type: "string" } } },
          outputSchema: null,
        },
      ]);

      const res = await request(app).get("/api/v1/agency-tools/openapi.json");

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe("3.0.3");
      expect(res.body.info.title).toBe("SmartSpecPro Agency Tools API");
      expect(res.body.paths[`/api/v1/agency-tools/tool-1/execute`]).toBeDefined();
      expect(res.body.paths[`/api/v1/agency-tools/tool-2/execute`]).toBeDefined();
      expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
      expect(res.body.components.securitySchemes.apiKeyHeader).toBeDefined();
    });

    it("excludes non-exposed tools", async () => {
      const app = createTestApp(validApiKeyAuth);

      vi.mocked(db.instance.where).mockResolvedValue([
        {
          id: "tool-exposed",
          name: "Exposed Tool",
          description: "Visible",
          inputSchema: null,
          outputSchema: null,
        },
      ]);

      const res = await request(app).get("/api/v1/agency-tools/openapi.json");

      expect(res.status).toBe(200);
      const pathKeys = Object.keys(res.body.paths);
      expect(pathKeys.length).toBe(1);
      expect(pathKeys[0]).toContain("tool-exposed");
    });

    it("returns empty paths for tenant with no exposed tools", async () => {
      const app = createTestApp(validApiKeyAuth);
      vi.mocked(db.instance.where).mockResolvedValue([]);

      const res = await request(app).get("/api/v1/agency-tools/openapi.json");

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.paths)).toHaveLength(0);
    });

    it("rejects non-api_key auth", async () => {
      const app = createTestApp({ ok: true, mode: "session", user: {}, sub: "u1", scopes: [] });

      const res = await request(app).get("/api/v1/agency-tools/openapi.json");

      expect(res.status).toBe(401);
    });
  });
});
