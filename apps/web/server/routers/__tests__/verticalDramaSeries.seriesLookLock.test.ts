import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockTx,
  mockForUpdateLock,
  resetHarness,
  setBible,
  getWrittenBible,
  getAuditValues,
} = vi.hoisted(() => {
  let bible: unknown = null;
  let rowExists = true;
  let writtenBible: unknown;
  let auditValues: unknown[] = [];
  const mockForUpdateLock = vi.fn(() => Promise.resolve(rowExists ? [{ bible }] : []));
  const selectBuilder = () => {
    const chain: any = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.for = mockForUpdateLock;
    return chain;
  };
  const mockTx = {
    select: vi.fn(() => selectBuilder()),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        writtenBible = values.bible;
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
  };
  const mockDb = {
    transaction: vi.fn((callback: (tx: any) => Promise<unknown>) => callback(mockTx)),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        auditValues.push(values);
        return Promise.resolve(undefined);
      }),
    })),
    select: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  return {
    mockDb,
    mockTx,
    mockForUpdateLock,
    resetHarness: () => {
      bible = null;
      rowExists = true;
      writtenBible = undefined;
      auditValues = [];
      vi.clearAllMocks();
    },
    setBible: (value: unknown, exists = true) => { bible = value; rowExists = exists; },
    getWrittenBible: () => writtenBible,
    getAuditValues: () => auditValues,
  };
});

vi.mock("../../db", () => ({ db: mockDb }));
vi.mock("../../_core/trpc", () => {
  const procedure: any = {
    use: () => procedure,
    input: () => procedure,
    query: (handler: Function) => handler,
    mutation: (handler: Function) => handler,
  };
  return { router: (routes: unknown) => routes, protectedProcedure: procedure };
});
vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (value: unknown) => value,
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

import {
  setSeriesLookLockInput,
  verticalDramaSeriesRouter,
} from "../verticalDramaSeries";
import {
  VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
  recordSeriesLookLockAuditEvent,
} from "../../services/verticalDramaSeriesLookLockAudit";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;
const ctx = { tenantId: "tenant-1", user: { id: 42, role: "user" } };

const identity = {
  styleName: "Inherited",
  palette: ["cream", "navy", "rose"],
  lighting: "soft light",
  environmentMotifs: [],
  wardrobeGrammar: [],
  signaturePropsAndCompanions: [],
  cameraGrammar: "still framing",
  characterArchetypes: [],
  imagePromptFragments: { positive: ["soft light"], negative: ["neon"] },
};

beforeEach(resetHarness);

describe("setSeriesLookLock", () => {
  it("validates mode-specific fields", () => {
    expect(setSeriesLookLockInput.safeParse({
      seriesId: "10", mode: "genre", expectedRevision: 0,
    }).success).toBe(false);
    expect(setSeriesLookLockInput.safeParse({
      seriesId: "10", mode: "manual", expectedRevision: 0,
    }).success).toBe(false);
  });

  it("row-locks the fresh bible and preserves simultaneous story fields", async () => {
    setBible({ story: "fresh concurrent edit", presetVisualIdentity: identity });
    const result = await router.setSeriesLookLock({
      ctx,
      input: {
        seriesId: "10", mode: "genre", genreKey: "horror_thriller",
        expectedRevision: 0,
      },
    });
    expect(mockForUpdateLock).toHaveBeenCalledWith("update");
    expect(getWrittenBible()).toMatchObject({ story: "fresh concurrent edit" });
    expect(result.control).toMatchObject({ mode: "genre", revision: 1 });
    expect(getAuditValues()).toEqual([
      expect.objectContaining({
        eventType: "vd_series_look_lock_changed",
        metadata: expect.objectContaining({
          tenantId: "tenant-1",
          seriesId: 10,
          mode: "genre",
          revision: 1,
          outcome: "updated",
        }),
      }),
    ]);
  });

  it("rejects stale writes with the current revision and does not update", async () => {
    setBible({
      presetVisualIdentity: identity,
      lookLockControl: {
        mode: "genre", genreKey: "action_epic", revision: 3,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    });
    await expect(router.setSeriesLookLock({
      ctx,
      input: { seriesId: "10", mode: "none", expectedRevision: 2 },
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(getAuditValues()).toEqual([
      expect.objectContaining({
        eventType: "vd_series_look_lock_changed",
        statusCode: 409,
        metadata: expect.objectContaining({
          tenantId: "tenant-1",
          seriesId: 10,
          outcome: "conflict",
        }),
      }),
    ]);
  });

  it("returns NOT_FOUND for a series outside the ownership predicate", async () => {
    setBible(null, false);
    await expect(router.setSeriesLookLock({
      ctx,
      input: { seriesId: "10", mode: "none", expectedRevision: 0 },
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("records the named applied event without prompt fragments", async () => {
    await recordSeriesLookLockAuditEvent({
      eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      path: "episodes.generateStartFrameImage",
    });
    expect(getAuditValues()).toEqual([
      expect.objectContaining({
        eventType: "vd_series_look_lock_applied",
        metadata: {
          tenantId: "tenant-1",
          seriesId: 10,
          path: "episodes.generateStartFrameImage",
        },
      }),
    ]);
    expect(JSON.stringify(getAuditValues())).not.toContain("imagePromptFragments");
  });
});
