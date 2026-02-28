import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Mock the tRPC core (same pattern as presentation.test.ts)
vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

// Hoisted mocks for DB
const dbMocks = vi.hoisted(() => {
  const insertResult = { returning: vi.fn() };
  const updateResult = { set: vi.fn() };
  const selectResult = { from: vi.fn() };

  return { insertResult, updateResult, selectResult };
});

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@shared/presentation/constants", () => ({
  isPresentationFeatureEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("../services/tenantContext", () => ({
  resolveTenantIdVarchar: vi.fn().mockReturnValue("1"),
}));

import { presentationImportRouter } from "./presentationImport";
import { getDb } from "../db";
import { isPresentationFeatureEnabled } from "@shared/presentation/constants";
import { resolveTenantIdVarchar } from "../services/tenantContext";

// Helpers to call router procedures with a fake context
function makeMockDb(overrides: Record<string, any> = {}) {
  const whereResult = { limit: vi.fn() };
  const fromResult = { where: vi.fn().mockReturnValue(whereResult) };
  const selectResult = { from: vi.fn().mockReturnValue(fromResult) };

  const setResult = { where: vi.fn() };
  const updateResult = { set: vi.fn().mockReturnValue(setResult) };

  const returningResult = { returning: vi.fn() };
  const valuesResult = { returning: vi.fn() };
  const insertResult = { values: vi.fn().mockReturnValue(valuesResult) };

  return {
    select: vi.fn().mockReturnValue(selectResult),
    insert: vi.fn().mockReturnValue(insertResult),
    update: vi.fn().mockReturnValue(updateResult),
    _selectResult: selectResult,
    _fromResult: fromResult,
    _whereResult: whereResult,
    _insertResult: insertResult,
    _valuesResult: valuesResult,
    _updateResult: updateResult,
    _setResult: setResult,
    ...overrides,
  };
}

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    tenantId: "1",
    user: {
      id: 42,
      role: "user",
      currentTenantId: 1,
    },
    ...overrides,
  };
}

describe("presentationImport router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPresentationFeatureEnabled).mockReturnValue(true);
    vi.mocked(resolveTenantIdVarchar).mockReturnValue("1");
    // Reset global fetch mock
    global.fetch = vi.fn();
  });

  describe("startImport", () => {
    it("throws validation error when sourceType=pptx but sourceLibraryItemId is missing", async () => {
      const fn = presentationImportRouter.startImport as Function;
      await expect(
        fn({
          input: { sourceType: "pptx" },
          ctx: makeCtx(),
        }),
      ).rejects.toThrow();
    });

    it("throws validation error when sourceType=google_slides but slidesUrl is missing", async () => {
      const fn = presentationImportRouter.startImport as Function;
      await expect(
        fn({
          input: { sourceType: "google_slides" },
          ctx: makeCtx(),
        }),
      ).rejects.toThrow();
    });

    it("creates a DB record and enqueues for google_slides without OAuth pre-check", async () => {
      const db = makeMockDb();
      db._valuesResult.returning.mockResolvedValue([{ id: 88 }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      vi.mocked(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const fn = presentationImportRouter.startImport as Function;
      const result = await fn({
        input: {
          sourceType: "google_slides",
          slidesUrl: "https://docs.google.com/presentation/d/abc123",
        },
        ctx: makeCtx(),
      });

      expect(result).toEqual({ conversionId: 88 });
      // Python handles OAuth validation — exactly one fetch call (enqueue)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("inserts presentationConversionRecords row with correct fields for PPTX", async () => {
      const db = makeMockDb();
      db._valuesResult.returning.mockResolvedValue([{ id: 99 }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      vi.mocked(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const fn = presentationImportRouter.startImport as Function;
      await fn({
        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
        ctx: makeCtx(),
      });

      expect(db.insert).toHaveBeenCalled();
      const insertedValues = db._insertResult.values.mock.calls[0][0];
      expect(insertedValues).toMatchObject({
        tenantId: "1",
        userId: 42,
        sourceItemId: 7,
        sourceFormat: "pptx",
        status: "queued",
        progress: 0,
      });
    });

    it("calls Python API with conversionId, userId, tenantId for PPTX", async () => {
      const db = makeMockDb();
      db._valuesResult.returning.mockResolvedValue([{ id: 55 }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      vi.mocked(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const fn = presentationImportRouter.startImport as Function;
      await fn({
        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
        ctx: makeCtx(),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/presentation-import/start"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"conversion_id":55'),
        }),
      );
    });

    it("returns { conversionId } on success", async () => {
      const db = makeMockDb();
      db._valuesResult.returning.mockResolvedValue([{ id: 77 }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      vi.mocked(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const fn = presentationImportRouter.startImport as Function;
      const result = await fn({
        input: { sourceType: "pptx", sourceLibraryItemId: 7 },
        ctx: makeCtx(),
      });

      expect(result).toEqual({ conversionId: 77 });
    });
  });

  describe("getImportStatus", () => {
    it("returns status + progress for own tenant's record", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([
        {
          id: 10,
          status: "processing",
          progress: 50,
          fidelityWarnings: [],
          deckLibraryItemId: null,
        },
      ]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      const fn = presentationImportRouter.getImportStatus as Function;
      const result = await fn({
        input: { conversionId: 10 },
        ctx: makeCtx(),
      });

      expect(result).toMatchObject({
        status: "processing",
        progress: 50,
        error: null,
      });
    });

    it("throws NOT_FOUND when conversionId belongs to a different tenant", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      // Simulate different tenant by having no results returned (filter by tenant)
      const fn = presentationImportRouter.getImportStatus as Function;
      await expect(
        fn({
          input: { conversionId: 999 },
          ctx: makeCtx({ tenantId: "2" }),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when conversionId does not exist", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      const fn = presentationImportRouter.getImportStatus as Function;
      await expect(
        fn({
          input: { conversionId: 9999 },
          ctx: makeCtx(),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("cancelImport", () => {
    it("returns { cancelled: true } early without DB update when record is already done", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "done" }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      const fn = presentationImportRouter.cancelImport as Function;
      const result = await fn({
        input: { conversionId: 10 },
        ctx: makeCtx(),
      });

      expect(result).toEqual({ cancelled: true });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("returns { cancelled: true } early without DB update when record is already failed", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "failed" }]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      const fn = presentationImportRouter.cancelImport as Function;
      const result = await fn({
        input: { conversionId: 10 },
        ctx: makeCtx(),
      });

      expect(result).toEqual({ cancelled: true });
      expect(db.update).not.toHaveBeenCalled();
    });

    it("updates status to cancelled and calls Python cancel endpoint for in-progress record", async () => {
      const db = makeMockDb();
      db._whereResult.limit.mockResolvedValue([{ id: 10, status: "processing" }]);
      db._setResult.where.mockResolvedValue([]);
      vi.mocked(getDb).mockResolvedValue(db as any);

      vi.mocked(global.fetch as any).mockResolvedValueOnce({ ok: true });

      const fn = presentationImportRouter.cancelImport as Function;
      const result = await fn({
        input: { conversionId: 10 },
        ctx: makeCtx(),
      });

      expect(result).toEqual({ cancelled: true });
      expect(db.update).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/presentation-import/10"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
