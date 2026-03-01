import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockRedisGet,
  mockRedisSet,
  mockRedisDel,
  mockRedisEval,
  mockRedisPublish,
  mockGetDb,
  mockDbSelect,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn().mockResolvedValue("OK"),
  mockRedisDel: vi.fn().mockResolvedValue(1),
  mockRedisEval: vi.fn(),
  mockRedisPublish: vi.fn().mockResolvedValue(0),
  mockGetDb: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    eval: mockRedisEval,
    publish: mockRedisPublish,
    duplicate: vi.fn(() => ({
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
      eval: mockRedisEval,
      publish: mockRedisPublish,
      psubscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    })),
    psubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/sttService", () => ({
  transcribe: vi.fn().mockResolvedValue({ text: "test", language: "en", confidence: 0.9, duration: 2 }),
  calculateSTTCredits: vi.fn().mockReturnValue(0),
}));

vi.mock("../../services/ttsService", () => ({
  synthesize: vi.fn().mockResolvedValue({ audioBuffer: Buffer.alloc(64), contentType: "audio/mpeg", duration: 1 }),
  calculateTTSCredits: vi.fn().mockReturnValue(3),
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/costTracker", () => ({
  logRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../drizzle/schema", () => ({
  users: { id: "u.id", voiceConsentGrantedAt: "u.voiceConsentGrantedAt", credits: "u.credits" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
}));

// Mock ws module
vi.mock("ws", () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    handleUpgrade: vi.fn(),
    on: vi.fn(),
    clients: new Set(),
  })),
}));

// ── Auth middleware mock ────────────────────────────────────────────────────

// We'll simulate the auth middleware by injecting user data directly

// ── Import after mocks ─────────────────────────────────────────────────────

import { createVoiceSessionRouter } from "../voiceGateway";

// ── Test Setup ─────────────────────────────────────────────────────────────

function buildApp(userId: number | null = 1, voiceConsentGrantedAt: Date | null = new Date()) {
  const app = express();
  app.use(express.json());

  // Inject auth context
  app.use((req, _res, next) => {
    if (userId !== null) {
      (req as any).user = { id: userId, currentTenantId: "tenant-1" };
    }
    next();
  });

  // Setup DB mock
  mockGetDb.mockResolvedValue({
    select: mockDbSelect,
    update: mockDbUpdate,
  });

  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          { id: userId, voiceConsentGrantedAt, credits: 100 },
        ]),
      }),
    }),
  }));

  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockDbUpdate.mockReturnValue({ set: setFn });

  app.use("/api/voice", createVoiceSessionRouter());

  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("voiceGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/voice/session", () => {
    it("returns a one-time token for authenticated user with consent", async () => {
      mockRedisGet.mockResolvedValue(null); // no active session
      mockRedisSet.mockResolvedValue("OK");

      const app = buildApp(1, new Date());
      const res = await request(app).post("/api/voice/session");

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.token.length).toBeGreaterThanOrEqual(32);
      expect(res.body.wsUrl).toBe("/api/voice/stream");
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = buildApp(null);
      const res = await request(app).post("/api/voice/session");
      expect(res.status).toBe(401);
    });

    it("rejects when voiceConsentGrantedAt is null (no consent)", async () => {
      const app = buildApp(1, null); // no consent
      const res = await request(app).post("/api/voice/session");
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/consent/i);
    });

    it("rejects when user already has active voice session (409)", async () => {
      mockRedisGet.mockResolvedValue("1"); // active session exists

      const app = buildApp(1, new Date());
      const res = await request(app).post("/api/voice/session");
      expect(res.status).toBe(409);
    });

    it("stores token in Redis with 30s TTL", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue("OK");

      const app = buildApp(1, new Date());
      const res = await request(app).post("/api/voice/session");

      expect(res.status).toBe(200);
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining("voice:token:"),
        expect.stringContaining("1:tenant-1"),
        "EX",
        30,
      );
    });
  });

  describe("voice consent mutations", () => {
    it("grantConsent sets voiceConsentGrantedAt to now", async () => {
      const app = buildApp(1, null);
      const res = await request(app).post("/api/voice/consent/grant");
      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("withdrawConsent sets voiceConsentGrantedAt to null", async () => {
      mockRedisPublish.mockResolvedValue(0);
      const app = buildApp(1, new Date());
      const res = await request(app).post("/api/voice/consent/withdraw");
      expect(res.status).toBe(200);
      expect(mockRedisPublish).toHaveBeenCalledWith(
        expect.stringContaining("voice:consent:revoked:1"),
        "revoked",
      );
    });
  });
});
