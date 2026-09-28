import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetTask,
  mockCreateLibraryItem,
  mockSafeEnqueueLibraryIndexJob,
  mockStoragePut,
  mockDb,
  mockEq,
} = vi.hoisted(() => {
  const db = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };

  return {
    mockDb: db,
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockGetTask: vi.fn(),
    mockCreateLibraryItem: vi.fn(),
    mockSafeEnqueueLibraryIndexJob: vi.fn(),
    mockStoragePut: vi.fn(),
    mockEq: vi.fn(),
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

vi.mock("../storage", () => ({
  storagePut: mockStoragePut,
}));

vi.mock("../../drizzle/schema", () => ({
  libraryItems: {
    id: "id",
  },
  mediaModels: {
    provider: "provider",
    modelId: "modelId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
}));

import {
  addMediaTaskToLibrary,
  autoAddMediaTaskToLibrary,
} from "./mediaLibraryService";

const ORIGINAL_AUTO_ADD = process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const contentType = /\.(mp4|webm)(?:\?|$)/i.test(url) ? "video/mp4" : "image/png";
    return new Response(new Blob(["media"]), {
      status: 200,
      headers: { "content-type": contentType },
    });
  });
  mockStoragePut.mockImplementation(async (key: string) => ({
    key,
    url: `/api/storage/files/${key}`,
  }));
  mockGetDb.mockResolvedValue(mockDb);
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
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
      }
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
        sourceLink: expect.objectContaining({
          linkType: "media_task",
          linkId: "task-123",
        }),
      }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
      mockDb
    );
  });

  it("carries marketplace product trace from media task parameters into library metadata", async () => {
    mockGetTask.mockResolvedValue({
      id: "task-marketplace-1",
      taskId: "provider-marketplace-1",
      userId: "9",
      mediaType: "image",
      status: "completed",
      model: "veo-3-1",
      prompt: "Marketplace product hero",
      parameters: {
        extra_params: {
          __marketplace_product_id: "mp_123",
          __marketplace_product_name: "Wireless Lamp",
          __production_run_id: "prod_run_1",
          __auto_review_run_id: "review_run_1",
        },
        marketplaceContext: {
          externalProductId: "external_456",
          externalShopId: "shop_789",
          sourceUrl: "https://shopee.example/product",
          captureId: "cap_1",
        },
      },
      resultUrl: "https://cdn.example.com/hero.png",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 503 },
      idempotent: false,
    });
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9003,
      status: "pending",
      created: true,
      payloadVersion: "v2",
      dedupeKey: "d3",
    });

    await addMediaTaskToLibrary(
      { mediaTaskId: "task-marketplace-1", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" }
    );

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          productId: "mp_123",
          marketplaceProductId: "mp_123",
          marketplace_product_id: "mp_123",
          productName: "Wireless Lamp",
          externalProductId: "external_456",
          externalShopId: "shop_789",
          sourceUrl: "https://shopee.example/product",
          captureId: "cap_1",
          productionRunId: "prod_run_1",
          autoReviewRunId: "review_run_1",
          task_parameters: expect.objectContaining({
            extra_params: expect.objectContaining({
              __marketplace_product_id: "mp_123",
            }),
          }),
          marketplace_product_trace: expect.objectContaining({
            productId: "mp_123",
            productName: "Wireless Lamp",
          }),
        }),
      }),
      expect.anything(),
      expect.anything()
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

    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 502 },
      idempotent: true,
    });
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9002,
      status: "pending",
      created: false,
      payloadVersion: "v2",
      dedupeKey: "d2",
    });

    const result = await addMediaTaskToLibrary(
      { mediaTaskId: "task-123", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" }
    );

    expect(result.created).toBe(false);
    expect(result.itemId).toBe(502);
  });

  it("repairs product trace metadata when the media task was already added to library", async () => {
    mockGetTask.mockResolvedValue({
      id: "task-existing-marketplace",
      taskId: "provider-existing-marketplace",
      userId: "9",
      mediaType: "image",
      status: "completed",
      model: "veo-3-1",
      prompt: "Existing marketplace item",
      parameters: {
        extra_params: {
          __marketplace_product_id: "mp_existing",
          __marketplace_product_name: "Existing Product",
        },
      },
      resultUrl: "https://cdn.example.com/existing.png",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });

    mockCreateLibraryItem.mockResolvedValue({
      item: {
        id: 504,
        metadata: {
          prompt: "Existing marketplace item",
          source_type: "media_task",
        },
      },
      idempotent: true,
    });
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9004,
      status: "pending",
      created: false,
      payloadVersion: "v2",
      dedupeKey: "d4",
    });

    await addMediaTaskToLibrary(
      { mediaTaskId: "task-existing-marketplace", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" }
    );

    expect(mockDb.update).toHaveBeenCalled();
    const setMock = mockDb.update.mock.results[0]?.value.set;
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          productId: "mp_existing",
          marketplaceProductId: "mp_existing",
          productName: "Existing Product",
          source_type: "media_task",
          marketplace_product_trace: expect.objectContaining({
            productId: "mp_existing",
          }),
        }),
      })
    );
  });

  it("stores provider metadata from database when model exists in media_models", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ provider: "byteplus_modelark" }]),
        }),
      }),
    });
    mockGetTask.mockResolvedValue({
      id: "task-789",
      taskId: "provider-789",
      userId: "9",
      mediaType: "image",
      status: "completed",
      model: "db-only-image-model",
      prompt: "Custom model",
      resultUrl: "https://cdn.example.com/custom.png",
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    });
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 777 },
      idempotent: false,
    });
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 9007,
      status: "pending",
      created: true,
      payloadVersion: "v2",
      dedupeKey: "d7",
    });

    await addMediaTaskToLibrary(
      { mediaTaskId: "task-789", userToken: "token-abc" },
      { userId: 9, tenantId: 44, role: "user" }
    );

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          model: "db-only-image-model",
          provider: "byteplus_modelark",
        }),
      }),
      expect.anything(),
      expect.anything()
    );
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
        { userId: 9, tenantId: 44, role: "user" }
      )
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
        { userId: 9, tenantId: 44, role: "user" }
      )
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

    const error = new Error(
      "Invalid sourceUrl: URL scheme javascript: is not allowed"
    );
    error.name = "LibraryUrlValidationError";
    mockCreateLibraryItem.mockRejectedValue(error);

    await expect(
      addMediaTaskToLibrary(
        { mediaTaskId: "task-3", userToken: "token-abc" },
        { userId: 9, tenantId: 44, role: "user" }
      )
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
      { userId: 9, tenantId: 44, role: "user" }
    );

    expect(result).toEqual({
      skipped: true,
      reason: "MEDIA_LIBRARY_AUTO_ADD_ENABLED is disabled",
    });
    expect(mockGetTask).not.toHaveBeenCalled();
  });
});
