import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaTask } from "../mediaGenerationService";

const mockDownload = vi.fn();
const mockAssertR2 = vi.fn();
const mockPut = vi.fn();
const mockStorageExists = vi.fn();
const mockGetDb = vi.fn();

vi.mock("../verticalDramaMediaAssetService", () => ({
  downloadMediaToTempFile: mockDownload,
}));
vi.mock("../../storage", () => ({
  assertR2StorageActive: mockAssertR2,
  storageExists: mockStorageExists,
  storagePutFromPath: mockPut,
}));
vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

const { ensurePresentationTaskResultDurable } = await import("../presentationMediaAssetService");

function task(overrides: Partial<MediaTask> = {}): MediaTask {
  return {
    id: "task-1",
    status: "completed",
    mediaType: "image",
    resultUrl: "https://provider.example/image.png",
    resultData: {},
    ...overrides,
  } as MediaTask;
}

function makeDb(existing: Array<{ id: number }> = []) {
  const selectChain: any = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.limit = vi.fn(async () => existing);

  const updateChain: any = {};
  updateChain.set = vi.fn(() => updateChain);
  updateChain.where = vi.fn(async () => undefined);

  const insertChain: any = {};
  insertChain.values = vi.fn(() => insertChain);
  insertChain.returning = vi.fn(async () => [{ id: 101 }]);

  return {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
  };
}

describe("presentation media durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownload.mockResolvedValue({
      tempDir: "/tmp/presentation-media-test",
      tempPath: "/tmp/presentation-media-test/source.bin",
      mimeType: "image/png",
    });
    mockStorageExists.mockResolvedValue(false);
    mockGetDb.mockResolvedValue(makeDb());
    mockPut.mockResolvedValue({ key: "presentation/tenant/deck-7/image/slot-1/task-1.png", url: "" });
  });

  it("returns managed provider output after uploading to R2", async () => {
    const result = await ensurePresentationTaskResultDurable({
      tenantId: "tenant-1",
      userId: 4,
      deckId: 7,
      task: task(),
      mediaType: "image",
      slotId: "slot-1",
    });

    expect(result?.durableUrl).toBe("/api/storage/files/presentation/tenant/deck-7/image/slot-1/task-1.png");
    expect(mockAssertR2).toHaveBeenCalledOnce();
    expect(mockPut).toHaveBeenCalledOnce();
    expect(result?.task.resultUrl).toBe(result?.durableUrl);
    expect(result?.task.resultData).toEqual({
      presentationDurabilityStatus: "ready",
      presentationStorageKey: result?.storageKey,
      presentationMediaAssetId: 101,
    });
    expect(result?.task.resultData).not.toHaveProperty("providerUrl");
  });

  it("does not download an already managed URL", async () => {
    mockStorageExists.mockResolvedValue(true);
    const result = await ensurePresentationTaskResultDurable({
      tenantId: "tenant-1",
      userId: 4,
      deckId: 7,
      task: task({ resultUrl: "/api/storage/files/presentation/tenant/deck-7/image/slot-1/existing.png" }),
      mediaType: "image",
      slotId: "slot-1",
    });

    expect(result?.durableUrl).toContain("/api/storage/files/presentation/");
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("reuses the deterministic cache key when the provider URL has expired", async () => {
    mockStorageExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const input = {
      tenantId: "tenant-1",
      userId: 4,
      deckId: 7,
      task: task(),
      mediaType: "image" as const,
      slotId: "slot-1",
    };

    await ensurePresentationTaskResultDurable(input);
    mockDownload.mockRejectedValueOnce(new Error("provider URL expired"));
    const result = await ensurePresentationTaskResultDurable(input);

    expect(result?.durableUrl).toContain("/api/storage/files/presentation/");
    expect(mockDownload).toHaveBeenCalledOnce();
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it("does not turn a non-terminal task into a durable asset", async () => {
    const result = await ensurePresentationTaskResultDurable({
      tenantId: "tenant-1",
      userId: 4,
      deckId: 7,
      task: task({ status: "processing", resultUrl: undefined }),
      mediaType: "video",
    });

    expect(result).toBeNull();
    expect(mockAssertR2).not.toHaveBeenCalled();
  });
});
