import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  clearRenderWorkerSettingsCache,
  getWebProcessRenderWorkerEnabled,
} from "../renderWorkerSettings";

function createDbMock(rows: Array<{ value: string | null }>) {
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn(() => selectChain),
    selectChain,
  };
}

describe("renderWorkerSettings", () => {
  const originalEnv = process.env.SMARTSPEC_INLINE_RENDER_WORKER;

  beforeEach(() => {
    vi.clearAllMocks();
    clearRenderWorkerSettingsCache();
    delete process.env.SMARTSPEC_INLINE_RENDER_WORKER;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMARTSPEC_INLINE_RENDER_WORKER;
    } else {
      process.env.SMARTSPEC_INLINE_RENDER_WORKER = originalEnv;
    }
  });

  it("defaults to false (env unset, no DB row)", async () => {
    const db = createDbMock([]);
    mockGetDb.mockResolvedValue(db);

    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(false);
  });

  it("falls back to the env var when no row exists", async () => {
    process.env.SMARTSPEC_INLINE_RENDER_WORKER = "true";
    const db = createDbMock([]);
    mockGetDb.mockResolvedValue(db);

    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(true);
  });

  it("prefers a DB row value of \"true\" over an unset env var", async () => {
    const db = createDbMock([{ value: "true" }]);
    mockGetDb.mockResolvedValue(db);

    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(true);
  });

  it("a DB row value of \"false\" wins even when the env var is true", async () => {
    process.env.SMARTSPEC_INLINE_RENDER_WORKER = "true";
    const db = createDbMock([{ value: "false" }]);
    mockGetDb.mockResolvedValue(db);

    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(false);
  });

  it("caches the result within the TTL window (only reads the DB once)", async () => {
    const db = createDbMock([{ value: "true" }]);
    mockGetDb.mockResolvedValue(db);

    await getWebProcessRenderWorkerEnabled();
    await getWebProcessRenderWorkerEnabled();
    await getWebProcessRenderWorkerEnabled();

    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("clearRenderWorkerSettingsCache() forces a re-read on the next call", async () => {
    const db1 = createDbMock([{ value: "true" }]);
    mockGetDb.mockResolvedValueOnce(db1);
    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(true);

    clearRenderWorkerSettingsCache();

    const db2 = createDbMock([{ value: "false" }]);
    mockGetDb.mockResolvedValueOnce(db2);
    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(false);

    expect(mockGetDb).toHaveBeenCalledTimes(2);
  });

  it("falls back to the env default when the DB read throws", async () => {
    process.env.SMARTSPEC_INLINE_RENDER_WORKER = "true";
    mockGetDb.mockRejectedValue(new Error("db unavailable"));

    await expect(getWebProcessRenderWorkerEnabled()).resolves.toBe(true);
  });
});
