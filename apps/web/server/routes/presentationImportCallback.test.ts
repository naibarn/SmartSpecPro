import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../drizzle/schema", () => ({
  libraryItems: "libraryItems",
  presentationConversionRecords: "presentationConversionRecords",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

vi.mock("../services/presentationImportService", () => ({
  createDeckFromImportResult: vi.fn(),
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// ENV is evaluated at request-time so we can override it per-test
vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "secret-test-token" },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getDb } from "../db";
import { createDeckFromImportResult } from "../services/presentationImportService";
import { ENV } from "../_core/env";
import { presentationImportCallbackHandler } from "./presentationImportCallback";

const mockGetDb = vi.mocked(getDb);
const mockCreateDeck = vi.mocked(createDeckFromImportResult);

// ── Test app ──────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post(
    "/api/internal/presentation-import/callback",
    presentationImportCallbackHandler,
  );
  return app;
}

/** Build a DB mock for the callback route (read → optionally update) */
function makeMockDb(records: Record<string, any>[] = []) {
  const limitMock = vi.fn().mockResolvedValue(records);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  // update chain for failed path
  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });

  return {
    db: { select: selectMock, update: updateMock } as any,
    mocks: { selectMock, whereMock, limitMock, updateMock, updateSet, updateWhere },
  };
}

const VALID_BODY = {
  conversionId: 1,
  status: "done",
  slides: [{ type: "slide" }],
  fidelityWarnings: [],
};

const AUTH_HEADER = "Bearer secret-test-token";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/internal/presentation-import/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ENV has a valid token
    vi.mocked(ENV).webGatewayToken = "secret-test-token";
  });

  it("returns 401 with empty body when Authorization header is missing", async () => {
    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({});
    expect(res.text).toBe("");
  });

  it("returns 401 when the Bearer token does not match ENV.webGatewayToken", async () => {
    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", "Bearer wrong-token")
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.text).toBe("");
  });

  it("returns 400 when body fails Zod validation (malformed body)", async () => {
    const { db } = makeMockDb();
    mockGetDb.mockResolvedValue(db);

    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", AUTH_HEADER)
      .send({ conversionId: "not-a-number", status: "done" });

    expect(res.status).toBe(400);
  });

  it("returns 200 immediately without calling createDeckFromImportResult when status='done' and record is already done (idempotency)", async () => {
    const { db } = makeMockDb([
      {
        id: 1,
        status: "done",
        deckLibraryItemId: 77,
        userId: 5,
        tenantId: "t1",
        sourceFormat: "pptx",
        sourceItemId: null,
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", AUTH_HEADER)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deckLibraryItemId: 77 });
    expect(mockCreateDeck).not.toHaveBeenCalled();
  });

  it("returns 200 and calls createDeckFromImportResult when status='done' and record is not yet done", async () => {
    const { db } = makeMockDb([
      {
        id: 1,
        status: "queued",
        deckLibraryItemId: null,
        userId: 5,
        tenantId: "tenant-xyz",
        sourceFormat: "pptx",
        sourceItemId: null,
      },
    ]);
    mockGetDb.mockResolvedValue(db);
    mockCreateDeck.mockResolvedValue({ deckLibraryItemId: 99 });

    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", AUTH_HEADER)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deckLibraryItemId: 99 });
    expect(mockCreateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        conversionId: 1,
        tenantId: "tenant-xyz",
        userId: 5,
        sourceFormat: "pptx",
      }),
    );
  });

  it("updates presentationConversionRecords to status='failed' and returns 200 when status='failed'", async () => {
    const { db, mocks } = makeMockDb([
      {
        id: 1,
        status: "processing",
        deckLibraryItemId: null,
        userId: 5,
        tenantId: "t1",
        sourceFormat: "pptx",
        sourceItemId: null,
      },
    ]);
    mockGetDb.mockResolvedValue(db);

    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", AUTH_HEADER)
      .send({ conversionId: 1, status: "failed", error: "Import failed: bad format" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Import failed: bad format",
      }),
    );
    expect(mockCreateDeck).not.toHaveBeenCalled();
  });

  it("responds 200 even when createDeckFromImportResult throws (logs error, does not bubble up)", async () => {
    const { db } = makeMockDb([
      {
        id: 1,
        status: "queued",
        deckLibraryItemId: null,
        userId: 5,
        tenantId: "t1",
        sourceFormat: "pptx",
        sourceItemId: null,
      },
    ]);
    mockGetDb.mockResolvedValue(db);
    mockCreateDeck.mockRejectedValue(new Error("DB constraint violation"));

    const res = await supertest(makeApp())
      .post("/api/internal/presentation-import/callback")
      .set("Authorization", AUTH_HEADER)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, error: "internal" });
  });
});
