import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

const { mockStoragePut } = vi.hoisted(() => ({
  mockStoragePut: vi.fn(),
}));

vi.mock("../storage", () => ({
  assertR2StorageActive: vi.fn().mockResolvedValue(undefined),
  storagePut: mockStoragePut,
  storageDelete: vi.fn().mockResolvedValue(true),
}));

const creditServiceMocks = vi.hoisted(() => ({
  calculateLibraryUploadCreditCost: vi.fn().mockResolvedValue({
    category: "document",
    totalCredits: 5,
    baseCredits: 5,
    stepCredits: 0,
    extraSteps: 0,
    sizeStepMb: 10,
  }),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  deductCredits: vi.fn().mockResolvedValue({ success: true, creditsUsed: 5, newBalance: 95, transactionId: 1 }),
  refundCredits: vi.fn().mockResolvedValue({ success: true, creditsAdded: 5, newBalance: 100, transactionId: 2 }),
}));

const libraryUploadPipelineMocks = vi.hoisted(() => ({
  enrichLibraryUploadContent: vi.fn(),
}));

vi.mock("./creditService", () => ({
  calculateLibraryUploadCreditCost: creditServiceMocks.calculateLibraryUploadCreditCost,
  hasEnoughCredits: creditServiceMocks.hasEnoughCredits,
  deductCredits: creditServiceMocks.deductCredits,
  refundCredits: creditServiceMocks.refundCredits,
}));

vi.mock("./libraryUploadPipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("./libraryUploadPipeline")>();
  libraryUploadPipelineMocks.enrichLibraryUploadContent.mockImplementation(original.enrichLibraryUploadContent);
  return {
    ...original,
    enrichLibraryUploadContent: libraryUploadPipelineMocks.enrichLibraryUploadContent,
  };
});

vi.mock("./documentOcrSettings", () => ({
  calculateOcrCredits: (pageCount: number, creditsPerPage: number) => Math.max(0, Math.round(pageCount) * creditsPerPage),
  getDocumentOcrSettings: vi.fn().mockResolvedValue({
    landingAiApiKey: "",
    googleAiApiKey: "",
    creditsPerPage: 1,
  }),
  isOcrExtractor: () => false,
  resolveOcrPageCount: () => 1,
  resolveOcrProvider: (_metadata: Record<string, unknown>, extractor: string | null) => extractor || null,
  classifyOcrFileClass: (params: { mimeType?: string | null }) =>
    String(params.mimeType ?? "").toLowerCase() === "application/pdf" ? "pdf" : "image",
  getDocumentOcrCreditsPerUnit: (_settings: any, _providerId: string | null | undefined, _fileClass: string) => 1,
}));

const groupsServiceMocks = vi.hoisted(() => ({
  getUserGroups: vi.fn().mockResolvedValue([]),
}));

vi.mock("./groupsService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./groupsService")>();
  return {
    ...orig,
    getUserGroups: groupsServiceMocks.getUserGroups,
  };
});

import {
  LibraryUrlValidationError,
  canReadLibraryItem,
  collectLibraryVectorCleanupTargets,
  createLibraryItem,
  getPublicShareLinkState,
  getLibraryItemById,
  publishLibraryItemToGallery,
  listLibraryDocuments,
  normalizeLibraryMetadata,
  replaceLibraryFile,
  shareLibraryToGroup,
  uploadLibraryFile,
  updateLibraryItem,
} from "./libraryService";

function makeSelectChain(rows: any[], withJoin = false) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock });

  const fromResult: any = {
    where: whereMock,
    orderBy: orderByMock,
  };

  if (withJoin) {
    fromResult.innerJoin = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
  }

  return {
    from: vi.fn().mockReturnValue(fromResult),
  };
}

function makeSelectWhereChain(rows: any[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  return {
    from: vi.fn().mockReturnValue({
      where: whereMock,
    }),
  };
}

function makeSelectOrderByChain(rows: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({
    orderBy: orderByMock,
  });
  return {
    from: vi.fn().mockReturnValue({
      where: whereMock,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
  mockDb.select.mockReturnValue(makeSelectChain([]));
  groupsServiceMocks.getUserGroups.mockResolvedValue([]);
  creditServiceMocks.calculateLibraryUploadCreditCost.mockResolvedValue({
    category: "document",
    totalCredits: 5,
    baseCredits: 5,
    stepCredits: 0,
    extraSteps: 0,
    sizeStepMb: 10,
  });
  creditServiceMocks.hasEnoughCredits.mockResolvedValue(true);
  creditServiceMocks.deductCredits.mockResolvedValue({ success: true, creditsUsed: 5, newBalance: 95, transactionId: 1 });
  creditServiceMocks.refundCredits.mockResolvedValue({ success: true, creditsAdded: 5, newBalance: 100, transactionId: 2 });
});

describe("normalizeLibraryMetadata", () => {
  it("normalizes metadata into consistent shape", () => {
    const normalized = normalizeLibraryMetadata({
      tags: [" video ", "video", " product "],
      providerName: "  kie.ai  ",
      ignoredNull: null,
      score: 0.8,
    });

    expect(normalized).toEqual({
      providerName: "kie.ai",
      score: 0.8,
      tags: ["video", "product"],
    });
  });

  it("normalizes markdown-fenced prompt values", () => {
    const normalized = normalizeLibraryMetadata({
      prompt: "```json\n{\n  \"prompt\": \"A soft portrait\"\n}\n```",
    });

    expect(normalized).toEqual({
      prompt: "{\n  \"prompt\": \"A soft portrait\"\n}",
    });
  });
});

describe("ACL helpers", () => {
  it("rejects unauthorized read for private item", () => {
    const allowed = canReadLibraryItem(
      {
        tenantId: 10,
        ownerUserId: 1,
        visibility: "private",
      },
      {
        userId: 999,
        tenantId: 10,
        role: "user",
      },
      null,
    );

    expect(allowed).toBe(false);
  });

  it("collects explicit vector cleanup targets from persisted chunk metadata", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectWhereChain([
        {
          vectorRefId: "vec-1",
          vectorIndexName: "finance-library-v2",
          metadata: { source: "document_upload" },
        },
      ]))
      .mockReturnValueOnce(makeSelectWhereChain([
        {
          metadata: { source: "document_upload" },
        },
      ]));

    const targets = await collectLibraryVectorCleanupTargets(77, 5);

    expect(targets.vectorRefIds).toEqual(["vec-1"]);
    expect(targets.indexNames).toEqual(["finance-library-v2"]);
  });
});

describe("createLibraryItem", () => {
  it("returns idempotent result when duplicate source link already exists", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 77,
      tenantId: 5,
      ownerUserId: 42,
      itemType: "image",
      source: "media_history",
      title: "Existing",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ item: existingItem }], true));

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Should be idempotent",
        sourceLink: {
          linkType: "media_task",
          linkId: "task-123",
        },
      },
      {
        userId: 42,
        tenantId: 5,
        role: "user",
      },
    );

    expect(result.idempotent).toBe(true);
    expect(result.item.id).toBe(77);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("rejects unsafe sourceUrl with deterministic validation error", async () => {
    await expect(
      createLibraryItem(
        {
          itemType: "image",
          source: "media_history",
          title: "Unsafe",
          sourceUrl: "javascript:alert(1)",
        },
        {
          userId: 42,
          tenantId: 5,
          role: "user",
        },
      ),
    ).rejects.toMatchObject({
      name: "LibraryUrlValidationError",
      field: "sourceUrl",
      reason: "blocked_scheme",
      message: "Invalid sourceUrl: URL scheme javascript: is not allowed",
    } satisfies Partial<LibraryUrlValidationError>);

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("persists normalized sourceUrl and thumbnailUrl values", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const valuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 88,
          tenantId: "5",
          ownerUserId: 42,
          itemType: "image",
          source: "media_history",
          title: "Normalized",
          description: null,
          status: "ready",
          visibility: "private",
          metadata: {},
          sourceUrl: "https://cdn.example.com/a.png",
          thumbnailUrl: "/uploads/thumb.png",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });
    mockDb.insert.mockReturnValueOnce({
      values: valuesMock,
    });

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Normalized",
        sourceUrl: " https://cdn.example.com/a.png ",
        thumbnailUrl: " /uploads/thumb.png ",
      },
      {
        userId: 42,
        tenantId: 5,
        role: "user",
      },
    );

    expect(result.item.sourceUrl).toBe("https://cdn.example.com/a.png");
    expect(result.item.thumbnailUrl).toBe("/uploads/thumb.png");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/a.png",
        thumbnailUrl: "/uploads/thumb.png",
      }),
    );
  });

  it("keeps string tenant id and numeric owner user id aligned on insert", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const valuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 89,
          tenantId: "tenant-ZCSKEM9s",
          ownerUserId: 42,
          itemType: "image",
          source: "media_history",
          title: "Tenant String",
          description: null,
          status: "ready",
          visibility: "private",
          metadata: {},
          sourceUrl: null,
          thumbnailUrl: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });
    mockDb.insert.mockReturnValueOnce({
      values: valuesMock,
    });

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Tenant String",
      },
      {
        userId: 42,
        tenantId: "tenant-ZCSKEM9s",
        role: "user",
      },
    );

    expect(result.item.tenantId).toBe("tenant-ZCSKEM9s");
    expect(result.item.ownerUserId).toBe(42);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-ZCSKEM9s",
        ownerUserId: 42,
      }),
    );
  });
});

describe("tenant boundaries", () => {
  it("does not return item outside tenant scope", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const item = await getLibraryItemById(123, {
      userId: 1,
      tenantId: 99,
      role: "user",
    });

    expect(item).toBeNull();
  });

  it("blocks update when actor lacks owner/permission rights", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 18,
      tenantId: 7,
      ownerUserId: 10,
      itemType: "video",
      source: "media_studio",
      title: "Before",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([existingItem]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await updateLibraryItem(
      18,
      { title: "After" },
      {
        userId: 100,
        tenantId: 7,
        role: "user",
      },
    );

    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects unsafe thumbnailUrl updates before DB write", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 19,
      tenantId: 7,
      ownerUserId: 10,
      itemType: "video",
      source: "media_studio",
      title: "Before",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([existingItem]))
      .mockReturnValueOnce(makeSelectChain([{ permissionLevel: "owner" }]));

    await expect(
      updateLibraryItem(
        19,
        { thumbnailUrl: "file:///etc/passwd" },
        {
          userId: 10,
          tenantId: 7,
          role: "user",
        },
      ),
    ).rejects.toMatchObject({
      name: "LibraryUrlValidationError",
      field: "thumbnailUrl",
      reason: "blocked_scheme",
    } satisfies Partial<LibraryUrlValidationError>);

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("Library Gallery publication", () => {
  it("publishes image media with managed keys and a stable public URL", async () => {
    const item = {
      id: 501,
      tenantId: "tenant-a",
      ownerUserId: 9,
      itemType: "image",
      source: "document_upload",
      title: "Hero image",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: { source_key: "library/uploads/tenant-a/9/hero.png" },
      sourceUrl: "/api/storage/files/library/uploads/tenant-a/9/hero.png",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const galleryInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 701 }]),
    });
    const linkInsertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({ limit: () => Promise.resolve([]) }),
          }),
        }),
      }),
      insert: vi.fn()
        .mockReturnValueOnce({ values: galleryInsertValues })
        .mockReturnValueOnce({ values: linkInsertValues }),
    };

    mockDb.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([item]) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([item]) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([]) }),
      });
    (mockDb as any).transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await publishLibraryItemToGallery(501, {
      userId: 1,
      tenantId: "tenant-a",
      role: "admin",
    });

    expect(result).toEqual({
      success: true,
      galleryItemId: 701,
      created: true,
      publicUrl: "/api/gallery/media/701/file",
    });
    expect(galleryInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fileKey: "library/uploads/tenant-a/9/hero.png",
        thumbnailKey: "library/uploads/tenant-a/9/hero.png",
        fileUrl: "/api/storage/files/library/uploads/tenant-a/9/hero.png",
        isPublished: true,
      }),
    );
    expect(linkInsertValues).toHaveBeenCalled();
  });
});

describe("uploadLibraryFile", () => {
  it("rejects spoofed file types when magic bytes do not match", async () => {
    const pdfBytes = Buffer.from("%PDF-1.7 fake pdf", "utf8").toString("base64");

    await expect(
      uploadLibraryFile(
        {
          fileName: "hero.png",
          fileType: "image/png",
          fileBase64: pdfBytes,
        },
        {
          userId: 9,
          tenantId: 44,
          role: "user",
        },
      ),
    ).rejects.toThrow("declared file type");

    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("sniffs octet-stream image uploads and routes them to OCR enrichment", async () => {
    mockStoragePut.mockResolvedValueOnce({
      key: "library/uploads/t-1/9/slip.jpg",
      url: "https://cdn.example.com/slip.jpg",
    });

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([], true))
      .mockReturnValueOnce(makeSelectChain([]));

    const insertLibraryItemValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 912,
          tenantId: "44",
          ownerUserId: 9,
          itemType: "image",
          source: "document_upload",
          title: "slip.jpg",
          description: null,
          status: "indexing",
          visibility: "private",
          metadata: {
            file_type: "image/jpeg",
          },
          sourceUrl: "https://cdn.example.com/slip.jpg",
          thumbnailUrl: "https://cdn.example.com/slip.jpg",
          deletedAt: null,
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          updatedAt: new Date("2026-02-10T00:00:00.000Z"),
        },
      ]),
    });
    const insertLibraryLinkValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    const enqueueValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 44,
          status: "pending",
        },
      ]),
    });

    mockDb.insert
      .mockReturnValueOnce({ values: insertLibraryItemValues })
      .mockReturnValueOnce({ values: insertLibraryLinkValues })
      .mockReturnValueOnce({ values: enqueueValues });

    libraryUploadPipelineMocks.enrichLibraryUploadContent.mockResolvedValueOnce({
      extractedText: null,
      extractor: "mocked",
      warnings: [],
      searchQuality: "metadata_only",
      stageMessage: "mocked",
      extraMetadata: {},
    });

    const result = await uploadLibraryFile(
      {
        fileName: "slip.jpg",
        fileType: "application/octet-stream",
        fileBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08]).toString("base64"),
      },
      {
        userId: 9,
        tenantId: 44,
        role: "user",
      },
    );

    expect(libraryUploadPipelineMocks.enrichLibraryUploadContent).toHaveBeenCalledWith(
      expect.objectContaining({
        fileType: "image/jpeg",
        fileName: "slip.jpg",
        sourceUrl: "https://cdn.example.com/slip.jpg",
      }),
    );
    expect(result.item.itemType).toBe("image");
    expect(result.item.metadata?.file_type).toBe("image/jpeg");
  });

  it("rejects unsafe svg payload before persisting", async () => {
    const unsafeSvg = Buffer.from(`<svg><script>alert(1)</script></svg>`, "utf8").toString("base64");
    await expect(
      uploadLibraryFile(
        {
          fileName: "unsafe.svg",
          fileType: "image/svg+xml",
          fileBase64: unsafeSvg,
        },
        {
          userId: 9,
          tenantId: 44,
          role: "user",
        },
      ),
    ).rejects.toThrow("Unsafe SVG content is not allowed");

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("reuses an existing exact upload duplicate without recharging credits", async () => {
    const existingItem = {
      id: 915,
      tenantId: "44",
      ownerUserId: 9,
      itemType: "text",
      source: "document_upload",
      title: "notes.txt",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        content_checksum_sha256: "existing",
      },
      sourceUrl: "https://cdn.example.com/notes.txt",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
      updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    };

    mockDb.select.mockReturnValueOnce(makeSelectChain([existingItem]));

    const result = await uploadLibraryFile(
      {
        fileName: "notes.txt",
        fileType: "text/plain",
        fileBase64: Buffer.from("same content", "utf8").toString("base64"),
      },
      {
        userId: 9,
        tenantId: 44,
        role: "user",
      },
    );

    expect(result.duplicateOfItemId).toBe(915);
    expect(result.indexJob.status).toBe("duplicate_reused");
    expect(result.billing.creditsCharged).toBe(0);
    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(creditServiceMocks.deductCredits).not.toHaveBeenCalled();
  });

  it("preserves primary write success when enqueue fails transiently", async () => {
    mockStoragePut.mockResolvedValueOnce({
      key: "library/uploads/t-1/9/file.txt",
      url: "https://cdn.example.com/file.txt",
    });

    const now = new Date("2026-02-10T00:00:00.000Z");
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([], true))
      .mockReturnValueOnce(makeSelectChain([]));

    const insertLibraryItemValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 901,
          tenantId: "44",
          ownerUserId: 9,
          itemType: "text",
          source: "document_upload",
          title: "file.txt",
          description: null,
          status: "indexing",
          visibility: "private",
          metadata: {},
          sourceUrl: "https://cdn.example.com/file.txt",
          thumbnailUrl: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });

    const insertLibraryLinkValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });

    const sourceChunkValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const enqueueValues = vi.fn().mockImplementation(() => {
      throw new Error("queue timeout");
    });

    mockDb.insert
      .mockReturnValueOnce({ values: insertLibraryItemValues })
      .mockReturnValueOnce({ values: insertLibraryLinkValues })
      .mockReturnValueOnce({ values: sourceChunkValues })
      .mockReturnValueOnce({ values: enqueueValues });

    const result = await uploadLibraryFile(
      {
        fileName: "file.txt",
        fileType: "text/plain",
        fileBase64: Buffer.from("hello world", "utf8").toString("base64"),
      },
      {
        userId: 9,
        tenantId: 44,
        role: "user",
      },
    );

    expect(result.item.id).toBe(901);
    expect(result.indexJob.created).toBe(false);
    expect(result.indexJob.status).toBe("enqueue_error");
    expect(result.indexJob.error).toContain("queue timeout");
    expect(result.billing.creditsCharged).toBe(5);
    expect(creditServiceMocks.deductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        amount: 5,
        idempotencyKey: "library-upload:901",
      }),
    );
  });

  it("rejects upload when user lacks credits for upload pricing", async () => {
    creditServiceMocks.hasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      uploadLibraryFile(
        {
          fileName: "file.txt",
          fileType: "text/plain",
          fileBase64: Buffer.from("hello world", "utf8").toString("base64"),
        },
        {
          userId: 9,
          tenantId: 44,
          role: "user",
        },
      ),
    ).rejects.toThrow("Insufficient credits");

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(creditServiceMocks.deductCredits).not.toHaveBeenCalled();
  });
});

describe("public share link management", () => {
  it("allows a matching upload metadata owner to manage a public link", async () => {
    const now = new Date("2026-03-27T00:00:00.000Z");
    const item = {
      id: 501,
      tenantId: "t1",
      ownerUserId: 99,
      itemType: "document",
      source: "document_upload",
      title: "Report.md",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        uploaded_by_user_id: 7,
        file_name: "Report.md",
      },
      sourceUrl: "https://example.com/report.md",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([item]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await getPublicShareLinkState(
      { itemId: 501 },
      { userId: 7, tenantId: "t1", role: "user" },
    );

    expect(result.canManage).toBe(true);
    expect(result.link).toBeNull();
  });
});

describe("replaceLibraryFile billing", () => {
  it("rejects replace when user lacks credits for upload pricing", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 300,
      tenantId: "44",
      ownerUserId: 9,
      itemType: "text",
      source: "document_upload",
      title: "legacy.txt",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: "https://cdn.example.com/legacy.txt",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([existingItem]))
      .mockReturnValueOnce(makeSelectChain([]));
    creditServiceMocks.hasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      replaceLibraryFile(
        {
          itemId: 300,
          fileName: "new.txt",
          fileType: "text/plain",
          fileBase64: Buffer.from("next revision", "utf8").toString("base64"),
        },
        {
          userId: 9,
          tenantId: "44",
          role: "user",
        },
      ),
    ).rejects.toThrow("Insufficient credits");

    expect(creditServiceMocks.deductCredits).not.toHaveBeenCalled();
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("deducts credits before replacing stored content", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 301,
      tenantId: "44",
      ownerUserId: 9,
      itemType: "text",
      source: "document_upload",
      title: "legacy.txt",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: "https://cdn.example.com/legacy.txt",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([existingItem]))
      .mockReturnValueOnce(makeSelectChain([]));
    creditServiceMocks.deductCredits.mockRejectedValueOnce(new Error("billing charge failure"));

    await expect(
      replaceLibraryFile(
        {
          itemId: 301,
          fileName: "new.txt",
          fileType: "text/plain",
          fileBase64: Buffer.from("next revision", "utf8").toString("base64"),
        },
        {
          userId: 9,
          tenantId: "44",
          role: "user",
        },
      ),
    ).rejects.toThrow("billing charge failure");

    expect(creditServiceMocks.deductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        amount: 5,
        description: "Library replace (document): new.txt",
      }),
    );
    expect(mockStoragePut).not.toHaveBeenCalled();
  });
});

// Section 03: Group Permissions Tests
describe("libraryService - Group Permissions", () => {
  describe("rankPermissionLevel", () => {
    it.todo("returns correct rank for read (1)");
    it.todo("returns correct rank for write (2)");
    it.todo("returns correct rank for delete (3)");
    it.todo("returns correct rank for owner (4)");
  });

  describe("canManageLibraryItem", () => {
    it.todo("returns true for owner permission level");
    it.todo("returns true for delete permission level");
    it.todo("returns false for write permission level");
    it.todo("returns false for read permission level");
  });

  describe("getUserEffectivePermission", () => {
    it.todo("includes group permissions in resolution");
    it.todo("returns highest permission level when multiple sources exist");
    it.todo("returns all permission sources in sources array");
    it.todo("includes direct user share in sources");
    it.todo("includes group share in sources with groupName");
    it.todo("returns null when user has no access");
    it.todo("handles user in multiple groups with different permissions");
    it.todo("prioritizes owner over all other sources");
    it.todo("prioritizes delete over write/read");
  });

  describe("shareLibraryItem", () => {
    it.todo("creates permission for subjectType = group");
    it.todo("validates group exists before creating permission");
    it.todo("validates group is in same tenant as item");
    it.todo("rejects when actor lacks delete or owner permission");
    it.todo("rejects when group is from different tenant (cross-tenant isolation)");
  });

  describe("softDeleteLibraryItem", () => {
    it.todo("sets deletedAt timestamp");
    it.todo("sets deletedBy to actor.userId");
    it.todo("existing soft deletes remain functional after update");
  });

  describe("searchLibraryWithPermissions", () => {
    it.todo("includes files shared via group permissions");
    it.todo("excludes deleted files (deletedAt IS NOT NULL)");
    it.todo("filters by owner, direct share, group share, role share, and public");
    it.todo("handles user with no groups gracefully");
    it.todo("applies group permissions for user in multiple groups");
  });
});

describe("libraryService - Pre-requisite Refactoring", () => {
  it.todo("hasTenantRoleShare (renamed from hasGroupShare) works with existing data");
  it.todo("tenantRoleMatches (renamed from groupMatches) filters correctly");
  it.todo("no references to old hasGroupShare function remain");
  it.todo("no references to old groupMatches function remain");
});

// Section 10: Caching & Performance Tests
describe("libraryService - Batch Permission Checks", () => {
  describe("getLibraryItemShares batching", () => {
    it.todo("resolves user and group names in batch queries instead of N+1");
  });

  describe("listLibraryDocuments group permissions", () => {
    it.todo("includes group permissions in batch permission query");
  });

  describe("searchLibraryItems group permissions", () => {
    it.todo("passes group IDs to getPermissionLevelForItem for correct resolution");
  });
});

describe("libraryService - Permission Resolution", () => {
  // Test getPermissionLevelForItem with group support
  // These functions are internal but tested via canReadLibraryItem

  describe("canReadLibraryItem", () => {
    it("allows admin to read any item in tenant", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t1", role: "admin" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows owner to read own item", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 42, visibility: "private" },
        { userId: 42, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows reading with permission level from group share", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t1", role: "user" },
        "read",
      );
      expect(result).toBe(true);
    });

    it("rejects cross-tenant access", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t2", role: "admin" },
        "owner",
      );
      expect(result).toBe(false);
    });

    it("allows reading public items without permission", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "public" },
        { userId: 99, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows reading team items without permission", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "team" },
        { userId: 99, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });
  });
});

describe("listLibraryDocuments scope filtering", () => {
  it("shared_groups includes only explicit group-shared items", async () => {
    const now = new Date("2026-03-05T10:00:00.000Z");
    const itemRows = [
      {
        id: 101,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Group Shared Deck",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://cdn.example.com/group.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 102,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Team Visible Deck",
        description: null,
        status: "ready",
        visibility: "team",
        metadata: {},
        sourceUrl: "https://cdn.example.com/team.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 103,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Role Shared Deck",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://cdn.example.com/role.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 104,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Public Deck",
        description: null,
        status: "ready",
        visibility: "public",
        metadata: {},
        sourceUrl: "https://cdn.example.com/public.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 105,
        tenantId: "t1",
        ownerUserId: 99,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "My Own Deck Shared To Group",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://cdn.example.com/my-own.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const permissionRows = [
      {
        libraryItemId: 101,
        subjectType: "group",
        subjectId: "10",
        permissionLevel: "read",
        expiresAt: null,
      },
      {
        libraryItemId: 103,
        subjectType: "tenant_role",
        subjectId: "user",
        permissionLevel: "read",
        expiresAt: null,
      },
      {
        libraryItemId: 105,
        subjectType: "group",
        subjectId: "10",
        permissionLevel: "read",
        expiresAt: null,
      },
    ];

    groupsServiceMocks.getUserGroups.mockResolvedValueOnce([
      { id: 10, name: "Design", role: "member" },
    ]);

    mockDb.select
      .mockReturnValueOnce(makeSelectOrderByChain(itemRows))
      .mockReturnValueOnce(makeSelectWhereChain(permissionRows))
      .mockReturnValueOnce(makeSelectWhereChain([
        { libraryItemId: 101 },
        { libraryItemId: 103 },
        { libraryItemId: 105 },
      ]));

    const result = await listLibraryDocuments(
      {
        scope: "shared_groups",
        limit: 50,
        offset: 0,
      },
      {
        userId: 99,
        tenantId: "t1",
        role: "user",
      },
    );

    expect(result.results.map((item) => item.id)).toEqual([101]);
  });

  it("filters document library items by source", async () => {
    const now = new Date("2026-06-05T10:00:00.000Z");
    const itemRows = [
      {
        id: 301,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "video",
        source: "marketplace_auto_review_hyperframes_render",
        title: "Auto Review Render",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {
          marketplaceProductId: "product_1",
          autoReviewRunId: "mar_1",
        },
        sourceUrl: "https://cdn.example.com/auto-review.mp4",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 302,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "video",
        source: "document_management",
        title: "Manual Upload",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {
          productId: "product_2",
          runId: "mar_2",
        },
        sourceUrl: "https://cdn.example.com/manual.mp4",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectOrderByChain(itemRows))
      .mockReturnValueOnce(makeSelectWhereChain([]))
      .mockReturnValueOnce(makeSelectWhereChain([]));

    const result = await listLibraryDocuments(
      {
        scope: "my_library",
        filters: {
          itemType: "video",
          source: "marketplace_auto_review_hyperframes_render",
          productId: "product_1",
          runId: "mar_1",
        },
        limit: 50,
        offset: 0,
      },
      {
        userId: 1,
        tenantId: "t1",
        role: "user",
      },
    );

    expect(result.results.map((item) => item.id)).toEqual([301]);
  });

  it("shared_with_me includes only explicit direct user shares", async () => {
    const now = new Date("2026-03-05T10:00:00.000Z");
    const itemRows = [
      {
        id: 201,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Direct Shared Deck",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://cdn.example.com/direct.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 202,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Group Shared Deck",
        description: null,
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: "https://cdn.example.com/group-only.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 203,
        tenantId: "t1",
        ownerUserId: 1,
        parentId: null,
        itemType: "presentation",
        source: "document_management",
        title: "Team Visible Deck",
        description: null,
        status: "ready",
        visibility: "team",
        metadata: {},
        sourceUrl: "https://cdn.example.com/team-only.pptx",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const permissionRows = [
      {
        libraryItemId: 201,
        subjectType: "user",
        subjectId: "99",
        permissionLevel: "read",
        expiresAt: null,
      },
      {
        libraryItemId: 202,
        subjectType: "group",
        subjectId: "10",
        permissionLevel: "read",
        expiresAt: null,
      },
    ];

    groupsServiceMocks.getUserGroups.mockResolvedValueOnce([
      { id: 10, name: "Design", role: "member" },
    ]);

    mockDb.select
      .mockReturnValueOnce(makeSelectOrderByChain(itemRows))
      .mockReturnValueOnce(makeSelectWhereChain(permissionRows))
      .mockReturnValueOnce(makeSelectWhereChain([
        { libraryItemId: 201 },
        { libraryItemId: 202 },
      ]));

    const result = await listLibraryDocuments(
      {
        scope: "shared_with_me",
        limit: 50,
        offset: 0,
      },
      {
        userId: 99,
        tenantId: "t1",
        role: "user",
      },
    );

    expect(result.results.map((item) => item.id)).toEqual([201]);
  });
});

describe("shareLibraryToGroup folder-scoped", () => {
  it("shares only items inside selected folder tree", async () => {
    mockDb.select
      // group exists
      .mockReturnValueOnce(makeSelectChain([{ id: 10 }]))
      // folder exists and is owned by actor
      .mockReturnValueOnce(makeSelectChain([{ id: 55 }]))
      // descendant folders lookup (none)
      .mockReturnValueOnce(makeSelectWhereChain([]))
      // owned items in folder tree
      .mockReturnValueOnce(makeSelectWhereChain([{ id: 901 }, { id: 902 }]));

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockDb.insert.mockReturnValueOnce({ values: valuesMock });

    const result = await shareLibraryToGroup(
      {
        folderId: 55,
        groupId: 10,
        permissionLevel: "read",
      },
      {
        userId: 42,
        tenantId: "t1",
        role: "user",
      },
    );

    expect(result.shared).toBe(2);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          libraryItemId: 901,
          subjectType: "group",
          subjectId: "10",
          permissionLevel: "read",
        }),
        expect.objectContaining({
          libraryItemId: 902,
          subjectType: "group",
          subjectId: "10",
          permissionLevel: "read",
        }),
      ]),
    );
  });

  it("rejects when folder is not found/owned", async () => {
    mockDb.select
      // group exists
      .mockReturnValueOnce(makeSelectChain([{ id: 10 }]))
      // folder not found/not owned
      .mockReturnValueOnce(makeSelectChain([]));

    await expect(
      shareLibraryToGroup(
        {
          folderId: 999,
          groupId: 10,
          permissionLevel: "read",
        },
        {
          userId: 42,
          tenantId: "t1",
          role: "user",
        },
      ),
    ).rejects.toThrow("Folder not found");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
