import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicWebhooksRouter } from "../publicWebhooksApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
}));

vi.mock("../../services/ssrfValidation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/ssrfValidation")>();
  return {
    ...actual,
    sanitizeUri: vi.fn((url: string) => {
      if (!url.startsWith("https://")) throw new actual.ApiValidationError("Only HTTPS URLs are allowed");
      return url;
    }),
    assertPublicIp: vi.fn(async (hostname: string) => {
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "192.168.1.1") {
        throw new actual.ApiValidationError("URL resolves to a private IP address");
      }
    }),
  };
});

import { getDb } from "../../db";

const mockGetDb = vi.mocked(getDb);

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function makeInsertMock() {
  return vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
}

function makeSelectMock(rows: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  chain.select = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeUpdateMock() {
  const chain: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  chain.update = vi.fn().mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["webhooks:manage"]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes,
    };
    next();
  });
  app.use("/v1/webhooks", createPublicWebhooksRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validUrl = "https://example.com/webhook";
const validEvents = ["job.completed", "media.ready"];

const existingEndpoint = {
  id: "wh-1",
  tenantId: "tenant-1",
  url: validUrl,
  events: validEvents,
  retryPolicy: "exponential",
  isActive: true,
  failureCount: 0,
  lastDeliveredAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /v1/webhooks
// ---------------------------------------------------------------------------

describe("POST /v1/webhooks", () => {
  it("registers a webhook and returns secret once", async () => {
    mockGetDb.mockResolvedValue({
      insert: makeInsertMock(),
    } as any);

    const res = await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: validUrl, events: validEvents });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("secret");
    expect(res.body.secret).toHaveLength(64); // 32 bytes hex
    expect(res.body.url).toBe(validUrl);
  });

  it("encrypts the signing secret (not stored plaintext)", async () => {
    const { encrypt } = await import("../../services/crypto");
    const mockEncrypt = vi.mocked(encrypt);

    mockGetDb.mockResolvedValue({
      insert: makeInsertMock(),
    } as any);

    await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: validUrl, events: validEvents });

    expect(mockEncrypt).toHaveBeenCalled();
    const encryptedArg = mockEncrypt.mock.calls[0][0];
    expect(encryptedArg).toHaveLength(64); // raw hex secret
  });

  it("requires webhooks:manage scope", async () => {
    const res = await request(makeApp([]))
      .post("/v1/webhooks")
      .send({ url: validUrl, events: validEvents });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("rejects non-HTTPS URLs (http://)", async () => {
    const res = await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: "http://example.com/hook", events: validEvents });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("rejects URLs to private IP ranges", async () => {
    const res = await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: "https://localhost/hook", events: validEvents });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("rejects URLs to 127.0.0.1", async () => {
    const res = await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: "https://127.0.0.1/hook", events: validEvents });

    expect(res.status).toBe(400);
  });

  it("rejects unknown event types", async () => {
    const res = await request(makeApp())
      .post("/v1/webhooks")
      .send({ url: validUrl, events: ["invalid.event"] });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/webhooks
// ---------------------------------------------------------------------------

describe("GET /v1/webhooks", () => {
  it("returns list of endpoints for tenant", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingEndpoint]),
        }),
      }),
    } as any);

    const res = await request(makeApp()).get("/v1/webhooks");
    expect(res.status).toBe(200);
    expect(res.body.webhooks).toHaveLength(1);
    expect(res.body.webhooks[0].id).toBe("wh-1");
  });

  it("does not expose signing secrets", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingEndpoint]),
        }),
      }),
    } as any);

    const res = await request(makeApp()).get("/v1/webhooks");
    const webhook = res.body.webhooks[0];
    expect(webhook).not.toHaveProperty("secretEncrypted");
    expect(webhook).not.toHaveProperty("secret");
  });

  it("requires webhooks:manage scope", async () => {
    const res = await request(makeApp([])).get("/v1/webhooks");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/webhooks/:id
// ---------------------------------------------------------------------------

describe("DELETE /v1/webhooks/:id", () => {
  it("deactivates endpoint (soft delete)", async () => {
    const updateWhere = vi.fn().mockResolvedValue([]);
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "wh-1", tenantId: "tenant-1" }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: updateWhere }),
      }),
    } as any);

    const res = await request(makeApp()).delete("/v1/webhooks/wh-1");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(updateWhere).toHaveBeenCalled();
  });

  it("returns 404 for wrong tenant (no leak of existence)", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "wh-1", tenantId: "tenant-other" }]),
        }),
      }),
    } as any);

    const res = await request(makeApp()).delete("/v1/webhooks/wh-1");
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent webhook", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    const res = await request(makeApp()).delete("/v1/webhooks/non-existent");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/webhooks/:id
// ---------------------------------------------------------------------------

describe("PATCH /v1/webhooks/:id", () => {
  it("re-enables a disabled endpoint", async () => {
    const updateWhere = vi.fn().mockResolvedValue([]);
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ...existingEndpoint, isActive: false, failureCount: 3 }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: updateWhere }),
      }),
    } as any);

    const res = await request(makeApp())
      .patch("/v1/webhooks/wh-1")
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
    expect(res.body.failure_count).toBe(0);
  });

  it("returns 404 for wrong tenant", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ...existingEndpoint, tenantId: "other-tenant" }]),
        }),
      }),
    } as any);

    const res = await request(makeApp())
      .patch("/v1/webhooks/wh-1")
      .send({ is_active: true });

    expect(res.status).toBe(404);
  });
});
