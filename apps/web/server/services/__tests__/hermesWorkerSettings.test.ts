import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  HERMES_WORKER_FULL_ENABLEMENT_PRESET,
  HERMES_WORKER_SAFE_ENABLEMENT_PRESET,
  HERMES_WORKER_SETTINGS_KEYS,
  clearHermesWorkerSettingsCache,
  getHermesWorkerSettings,
} from "../hermesWorkerSettings";

function createDbMock(rows: Array<{ key: string; value: string | null }>) {
  const selectChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  return {
    select: vi.fn(() => selectChain),
    selectChain,
  };
}

describe("hermesWorkerSettings", () => {
  const originalEnv = process.env.SMARTSPEC_INLINE_HERMES_WORKER;

  beforeEach(() => {
    vi.clearAllMocks();
    clearHermesWorkerSettingsCache();
    delete process.env.SMARTSPEC_INLINE_HERMES_WORKER;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMARTSPEC_INLINE_HERMES_WORKER;
    } else {
      process.env.SMARTSPEC_INLINE_HERMES_WORKER = originalEnv;
    }
  });

  it("defines a safe private-worker preset without shared or in-web execution", () => {
    expect(HERMES_WORKER_SAFE_ENABLEMENT_PRESET).toEqual({
      [HERMES_WORKER_SETTINGS_KEYS.enabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.privateEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.videoEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled]: "false",
      [HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled]: "false",
      [HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled]: "false",
    });
  });

  it("defines a full preset for all three modes without in-web execution", () => {
    expect(HERMES_WORKER_FULL_ENABLEMENT_PRESET).toEqual({
      [HERMES_WORKER_SETTINGS_KEYS.enabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.privateEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.videoEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled]: "true",
      [HERMES_WORKER_SETTINGS_KEYS.minHermesVersion]: "0.18.2",
      [HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled]: "false",
    });
  });

  it("returns the documented defaults when no rows exist", async () => {
    const db = createDbMock([]);
    mockGetDb.mockResolvedValue(db);

    const settings = await getHermesWorkerSettings();

    expect(settings).toEqual({
      enabled: false,
      sharedPoolEnabled: false,
      serverPersonalEnabled: false,
      privateEnabled: false,
      videoEnabled: false,
      sharedPoolFeeCredits: 0,
      maxRunningPerConnection: 1,
      maxConcurrentPerSharedWorker: 2,
      maxQueuedPerUser: 8,
      maxQueuedPerTenantSharedPool: 20,
      submitWindowPerUser: 10,
      submitWindowPerTenant: 60,
      minHermesVersion: "",
      sharedWorkerId: null,
      webProcessWorkerEnabled: false,
    });
  });

  it("falls back to the env var for webProcessWorkerEnabled only when no row exists", async () => {
    process.env.SMARTSPEC_INLINE_HERMES_WORKER = "true";
    const db = createDbMock([]);
    mockGetDb.mockResolvedValue(db);

    const settings = await getHermesWorkerSettings();
    expect(settings.webProcessWorkerEnabled).toBe(true);
  });

  it("overrides defaults with parsed DB rows", async () => {
    const db = createDbMock([
      { key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" },
      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled, value: "true" },
      { key: HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled, value: "true" },
      { key: HERMES_WORKER_SETTINGS_KEYS.privateEnabled, value: "true" },
      { key: HERMES_WORKER_SETTINGS_KEYS.videoEnabled, value: "true" },
      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits, value: "5" },
      { key: HERMES_WORKER_SETTINGS_KEYS.maxRunningPerConnection, value: "3" },
      { key: HERMES_WORKER_SETTINGS_KEYS.maxConcurrentPerSharedWorker, value: "6" },
      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser, value: "12" },
      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerTenantSharedPool, value: "40" },
      { key: HERMES_WORKER_SETTINGS_KEYS.submitWindowPerUser, value: "20" },
      { key: HERMES_WORKER_SETTINGS_KEYS.submitWindowPerTenant, value: "80" },
      { key: HERMES_WORKER_SETTINGS_KEYS.minHermesVersion, value: "1.2.0" },
      { key: HERMES_WORKER_SETTINGS_KEYS.sharedWorkerId, value: "worker-123" },
      { key: HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled, value: "true" },
    ]);
    mockGetDb.mockResolvedValue(db);

    const settings = await getHermesWorkerSettings();

    expect(settings).toEqual({
      enabled: true,
      sharedPoolEnabled: true,
      serverPersonalEnabled: true,
      privateEnabled: true,
      videoEnabled: true,
      sharedPoolFeeCredits: 5,
      maxRunningPerConnection: 3,
      maxConcurrentPerSharedWorker: 6,
      maxQueuedPerUser: 12,
      maxQueuedPerTenantSharedPool: 40,
      submitWindowPerUser: 20,
      submitWindowPerTenant: 80,
      minHermesVersion: "1.2.0",
      sharedWorkerId: "worker-123",
      webProcessWorkerEnabled: true,
    });
  });

  it("a DB row value of \"false\" wins over the env var for webProcessWorkerEnabled", async () => {
    process.env.SMARTSPEC_INLINE_HERMES_WORKER = "true";
    const db = createDbMock([
      { key: HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled, value: "false" },
    ]);
    mockGetDb.mockResolvedValue(db);

    const settings = await getHermesWorkerSettings();
    expect(settings.webProcessWorkerEnabled).toBe(false);
  });

  it("falls back to defaults for malformed integer values without throwing", async () => {
    const db = createDbMock([
      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser, value: "not-a-number" },
      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits, value: "-5" },
    ]);
    mockGetDb.mockResolvedValue(db);

    const settings = await getHermesWorkerSettings();
    expect(settings.maxQueuedPerUser).toBe(8);
    expect(settings.sharedPoolFeeCredits).toBe(0);
  });

  it("never throws when the DB read rejects — falls back to defaults", async () => {
    mockGetDb.mockRejectedValue(new Error("db unavailable"));

    await expect(getHermesWorkerSettings()).resolves.toMatchObject({
      enabled: false,
      maxRunningPerConnection: 1,
    });
  });

  it("caches the result within the TTL window (only reads the DB once)", async () => {
    const db = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
    mockGetDb.mockResolvedValue(db);

    await getHermesWorkerSettings();
    await getHermesWorkerSettings();
    await getHermesWorkerSettings();

    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("clearHermesWorkerSettingsCache() forces a re-read on the next call", async () => {
    const db1 = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
    mockGetDb.mockResolvedValueOnce(db1);
    await expect(getHermesWorkerSettings()).resolves.toMatchObject({ enabled: true });

    clearHermesWorkerSettingsCache();

    const db2 = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "false" }]);
    mockGetDb.mockResolvedValueOnce(db2);
    await expect(getHermesWorkerSettings()).resolves.toMatchObject({ enabled: false });

    expect(mockGetDb).toHaveBeenCalledTimes(2);
  });

  it("de-dupes concurrent first calls into a single in-flight refresh", async () => {
    const db = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
    mockGetDb.mockResolvedValue(db);

    const [a, b, c] = await Promise.all([
      getHermesWorkerSettings(),
      getHermesWorkerSettings(),
      getHermesWorkerSettings(),
    ]);

    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });
});
