import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExportRecord,
  updateExportRecord,
  getExportRecord,
  getExportRecordByIdempotencyKey,
  getExportRecordByCeleryTaskId,
} from "./presentationExportService";

function makeExportRow(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    deckId: 101,
    userId: 9,
    tenantId: "tenant-1",
    format: "mp4",
    quality: null,
    width: 1920,
    height: 1080,
    fps: null,
    status: "queued",
    progressPct: 0,
    stage: null,
    errorMessage: null,
    outputUrl: null,
    outputStorageKey: null,
    outputBytes: null,
    celeryTaskId: null,
    idempotencyKey: "key-1",
    createdAt: new Date("2026-02-22T10:00:00.000Z"),
    updatedAt: new Date("2026-02-22T10:00:00.000Z"),
    ...overrides,
  };
}

function makeInsertDb(result: ReturnType<typeof makeExportRow>[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert } as any;
}

function makeUpdateDb(result: ReturnType<typeof makeExportRow>[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { update } as any;
}

function makeSelectDb(result: ReturnType<typeof makeExportRow>[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as any;
}

describe("presentationExportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createExportRecord inserts row with status='queued' and progressPct=0", async () => {
    const row = makeExportRow({ status: "queued", progressPct: 0 });
    const db = makeInsertDb([row]);

    const result = await createExportRecord(
      {
        deckId: 101,
        userId: 9,
        tenantId: "tenant-1",
        format: "mp4",
        width: 1920,
        height: 1080,
        idempotencyKey: "key-1",
      },
      db,
    );

    expect(result.status).toBe("queued");
    expect(result.progressPct).toBe(0);
  });

  it("createExportRecord sets idempotencyKey from input", async () => {
    const row = makeExportRow({ idempotencyKey: "idem-abc-123" });
    const db = makeInsertDb([row]);

    const valuesCapture = db.insert().values;
    const result = await createExportRecord(
      {
        deckId: 101,
        userId: 9,
        tenantId: "tenant-1",
        format: "png",
        width: 1920,
        height: 1080,
        idempotencyKey: "idem-abc-123",
      },
      makeInsertDb([row]),
    );

    expect(result.idempotencyKey).toBe("idem-abc-123");
  });

  it("createExportRecord passes idempotencyKey to insert call", async () => {
    const row = makeExportRow({ idempotencyKey: "idem-xyz" });
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as any;

    await createExportRecord(
      {
        deckId: 101,
        userId: 9,
        tenantId: "tenant-1",
        format: "png",
        width: 1920,
        height: 1080,
        idempotencyKey: "idem-xyz",
      },
      db,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-xyz", status: "queued", progressPct: 0 }),
    );
  });

  it("updateExportRecord sets only the provided fields (partial update)", async () => {
    const updatedRow = makeExportRow({ progressPct: 42 });
    const returning = vi.fn().mockResolvedValue([updatedRow]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as any;

    const result = await updateExportRecord(1, { progressPct: 42 }, db);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ progressPct: 42 }));
    expect(result?.progressPct).toBe(42);
  });

  it("getExportRecord returns null for unknown id", async () => {
    const db = makeSelectDb([]);

    const result = await getExportRecord(999, db);

    expect(result).toBeNull();
  });

  it("getExportRecord returns the inserted row with correct fields", async () => {
    const row = makeExportRow({ id: 42, deckId: 101 });
    const db = makeSelectDb([row]);

    const result = await getExportRecord(42, db);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
    expect(result?.deckId).toBe(101);
  });

  it("getExportRecordByIdempotencyKey returns existing row for a duplicate key", async () => {
    const row = makeExportRow({ idempotencyKey: "dup-key-1", status: "processing" });
    const db = makeSelectDb([row]);

    const result = await getExportRecordByIdempotencyKey("dup-key-1", db);

    expect(result).not.toBeNull();
    expect(result?.idempotencyKey).toBe("dup-key-1");
    expect(result?.status).toBe("processing");
  });

  it("getExportRecordByIdempotencyKey returns null for unknown key", async () => {
    const db = makeSelectDb([]);

    const result = await getExportRecordByIdempotencyKey("unknown-key", db);

    expect(result).toBeNull();
  });

  it("getExportRecordByCeleryTaskId returns correct row", async () => {
    const row = makeExportRow({ celeryTaskId: "celery-task-abc" });
    const db = makeSelectDb([row]);

    const result = await getExportRecordByCeleryTaskId("celery-task-abc", db);

    expect(result).not.toBeNull();
    expect(result?.celeryTaskId).toBe("celery-task-abc");
  });
});
