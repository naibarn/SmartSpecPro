import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetTask,
  mockCreateLibraryItem,
  mockSafeEnqueueLibraryIndexJob,
  mockDb,
} = vi.hoisted(() => {
  const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };

  return {
    mockDb: db,
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockGetTask: vi.fn(),
    mockCreateLibraryItem: vi.fn(),
    mockSafeEnqueueLibraryIndexJob: vi.fn(),
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./mediaGenerationService", () => ({
  MEDIA_MODELS: {
    "veo-3-1": { provider: "kie.ai" },
  },
  mediaGenerationService: {
    getTask: mockGetTask,
  },
}));

vi.mock("./libraryService", () => ({
  createLibraryItem: mockCreateLibraryItem,
  safeEnqueueLibraryIndexJob: mockSafeEnqueueLibraryIndexJob,
}));

import { addMediaTaskToLibrary, autoAddMediaTaskToLibrary } from "./mediaLibraryService";

const ORIGINAL_AUTO_ADD = process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
});

afterEach(() => {
  if (ORIGINAL_AUTO_ADD === undefined) {
    delete process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED;
  } else {
    process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED = ORIGINAL_AUTO_ADD;
  }
});

describe("addMediaTaskToLibrary", () => {
  it("creates library item + index job for completed task", async () => {
    mockGetTask.mockResolvedValue({
      id: "task-123",
      taskId: "provider-123",
      userId: "9",
      mediaType: "video",
      status: "completed",
      model: "veo-3-1",
      prompt: "A cinematic sunrise",
      resultUrl: "https://cdn.example.com/video.mp4",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 501 },
      idempotent: false,
    });

    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9001,
      status: "pending",
      created: true,
      payloadVersion: "v2",
      dedupeKey: "d1",
    });

    const result = await addMediaTaskToLibrary(
      {
        mediaTaskId: "task-123",
        userToken: "token-abc",
      },
      {
        userId: 9,
        tenantId: 44,
        role: "user",
      },
    );

    expect(result).toEqual({
      itemId: 501,
      created: true,
      indexJob: {
        jobId: 9001,
        status: "pending",
        created: true,
        payloadVersion: "v2",
        dedupeKey: "d1",
      },
      taskStatus: "completed",
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: "video",
        source: "media_task",
        status: "indexing",
        sourceLink: expect.objectContaining({ linkType: "media_task", linkId: "task-123" }),
      }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
      mockDb,
    );
  });

  it("returns created=false when add-to-library is idempotent", async () => {
    mockGetTask.mockResolvedValue({
      id: "task-123",
      taskId: "provider-123",
      userId: "9",
      mediaType: "image",
      status: "completed",
      model: "veo-3-1",
      prompt: "Poster",
      resultUrl: "https://cdn.example.com/poster.png",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    mockCreateLibraryItem.mockResolvedValue({ item: { id: 502 }, idempotent: true });
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9002,
      status: "pending",
      created: false,
      payloadVersion: "v2",
      dedupeKey: "d2",
    });

    const result = await addMediaTaskToLibrary(
      { mediaTaskId: "task-123", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" },
    );

    expect(result.created).toBe(false);
    expect(result.itemId).toBe(502);
  });

  it("rejects non-completed or unauthorized tasks", async () => {
    mockGetTask.mockResolvedValueOnce({
      id: "task-1",
      userId: "9",
      mediaType: "video",
      status: "processing",
      model: "veo-3-1",
      prompt: "Still running",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    await expect(
      addMediaTaskToLibrary(
        { mediaTaskId: "task-1", userToken: "token-abc" },
        { userId: 9, tenantId: 44, role: "user" },
      ),
    ).rejects.toThrow("Only completed media tasks can be added to library");

    mockGetTask.mockResolvedValueOnce({
      id: "task-2",
      userId: "99",
      mediaType: "video",
      status: "completed",
      model: "veo-3-1",
      prompt: "No access",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    await expect(
      addMediaTaskToLibrary(
        { mediaTaskId: "task-2", userToken: "token-abc" },
        { userId: 9, tenantId: 44, role: "user" },
      ),
    ).rejects.toThrow("Media task not found");
  });

  it("propagates URL validation failures from library item creation", async () => {
    mockGetTask.mockResolvedValue({
      id: "task-3",
      taskId: "provider-3",
      userId: "9",
      mediaType: "image",
      status: "completed",
      model: "veo-3-1",
      prompt: "Unsafe source",
      resultUrl: "javascript:alert(1)",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    const error = new Error("Invalid sourceUrl: URL scheme javascript: is not allowed");
    error.name = "LibraryUrlValidationError";
    mockCreateLibraryItem.mockRejectedValue(error);

    await expect(
      addMediaTaskToLibrary(
        { mediaTaskId: "task-3", userToken: "token-abc" },
        { userId: 9, tenantId: 44, role: "user" },
      ),
    ).rejects.toMatchObject({
      name: "LibraryUrlValidationError",
      message: "Invalid sourceUrl: URL scheme javascript: is not allowed",
    });
  });
});

describe("autoAddMediaTaskToLibrary", () => {
  it("skips implicit ingestion when auto-add flag is OFF", async () => {
    process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED = "false";

    const result = await autoAddMediaTaskToLibrary(
      { mediaTaskId: "task-3", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" },
    );

    expect(result).toEqual({
      skipped: true,
      reason: "MEDIA_LIBRARY_AUTO_ADD_ENABLED is disabled",
    });
    expect(mockGetTask).not.toHaveBeenCalled();
  });
});
