import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  convertOfficeSourceToPresentation,
  getPresentationCompatibilityOpen,
  resetPresentationConversionStateForTests,
  type PresentationConversionDependencies,
} from "./presentationCompatibilityService";

const actor = {
  userId: 9,
  tenantId: "tenant-1",
  role: "user",
} as const;

function buildSourceItem(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 501,
    tenantId: actor.tenantId,
    ownerUserId: actor.userId,
    itemType: "document",
    source: "document_management",
    title: "Roadmap.pptx",
    description: "Quarterly roadmap",
    status: "ready",
    visibility: "private",
    metadata: { extension: "pptx" },
    sourceUrl: "https://example.com/Roadmap.pptx",
    thumbnailUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createDeps(overrides?: Partial<PresentationConversionDependencies>): PresentationConversionDependencies {
  const sourceStore = new Map<string, any>();
  const idempotencyStore = new Map<string, any>();
  const lockStore = new Set<string>();

  return {
    useInMemoryStateFallback: true,
    getLibraryItemById: vi.fn().mockResolvedValue(buildSourceItem()),
    createLibraryItem: vi.fn().mockResolvedValue({
      item: {
        id: 777,
      },
      idempotent: false,
    }),
    createPresentationDeckForLibraryItem: vi.fn().mockResolvedValue({
      created: true,
      deck: {
        id: 888,
      },
    }),
    upsertSourceAttachment: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredConversionState: vi.fn().mockResolvedValue(undefined),
    getStoredConversionBySource: vi.fn(async ({ tenantId, sourceItemId }) => {
      return sourceStore.get(`${tenantId}:${sourceItemId}`) ?? null;
    }),
    getStoredConversionByIdempotency: vi.fn(async ({ tenantId, sourceItemId, idempotencyKey }) => {
      return idempotencyStore.get(`${tenantId}:${sourceItemId}:${idempotencyKey}`) ?? null;
    }),
    upsertStoredConversionRecord: vi.fn(async (input: any) => {
      const record = {
        sourceItemId: input.sourceItemId,
        sourceFormat: input.sourceFormat,
        deckLibraryItemId: input.deckLibraryItemId,
        deckId: input.deckId,
        partialFidelity: input.partialFidelity,
        fidelityWarnings: input.fidelityWarnings,
      };
      sourceStore.set(`${input.tenantId}:${input.sourceItemId}`, record);
      idempotencyStore.set(`${input.tenantId}:${input.sourceItemId}:${input.idempotencyKey}`, record);
      return record;
    }),
    acquireConversionLock: vi.fn(async ({ tenantId, sourceItemId }) => {
      const key = `${tenantId}:${sourceItemId}`;
      if (lockStore.has(key)) {
        return false;
      }
      lockStore.add(key);
      return true;
    }),
    releaseConversionLock: vi.fn(async ({ tenantId, sourceItemId }) => {
      lockStore.delete(`${tenantId}:${sourceItemId}`);
    }),
    now: () => Date.parse("2026-02-22T10:00:00.000Z"),
    conversionLockTtlMs: 3 * 60_000,
    conversionRecordTtlMs: 24 * 60 * 60_000,
    ...overrides,
  };
}

describe("presentationCompatibilityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPresentationConversionStateForTests();
  });

  it("returns read-only compatibility path for pptx source item", async () => {
    const deps = createDeps();

    const result = await getPresentationCompatibilityOpen(501, actor, deps);

    expect(result.mode).toBe("read_only");
    expect(result.sourceFormat).toBe("pptx");
    expect(result.canConvert).toBe(true);
  });

  it("returns unsupported guidance for legacy .ppt files", async () => {
    const deps = createDeps({
      getLibraryItemById: vi.fn().mockResolvedValue(
        buildSourceItem({
          title: "Legacy.ppt",
          metadata: { extension: "ppt" },
          sourceUrl: "https://example.com/Legacy.ppt",
        }),
      ),
    });

    const result = await getPresentationCompatibilityOpen(501, actor, deps);

    expect(result.mode).toBe("read_only");
    expect(result.sourceFormat).toBe("ppt");
    expect(result.canConvert).toBe(false);
    expect(result.guidance.toLowerCase()).toContain(".ppt");
  });

  it("reuses one converted deck for repeated idempotency requests", async () => {
    const state = new Map<string, any>();
    const deps = createDeps({
      getStoredConversionBySource: vi.fn(async () => state.get("source") ?? null),
      getStoredConversionByIdempotency: vi.fn(async () => state.get("idempotency") ?? null),
      upsertStoredConversionRecord: vi.fn(async (input: any) => {
        const record = {
          sourceItemId: input.sourceItemId,
          sourceFormat: input.sourceFormat,
          deckLibraryItemId: input.deckLibraryItemId,
          deckId: input.deckId,
          partialFidelity: input.partialFidelity,
          fidelityWarnings: input.fidelityWarnings,
        };
        state.set("source", record);
        state.set("idempotency", record);
        return record;
      }),
    });

    const first = await convertOfficeSourceToPresentation(
      {
        sourceItemId: 501,
        idempotencyKey: "request-1",
      },
      actor,
      deps,
    );

    const second = await convertOfficeSourceToPresentation(
      {
        sourceItemId: 501,
        idempotencyKey: "request-1",
      },
      actor,
      deps,
    );

    expect(first.conversionStatus).toBe("created");
    expect(second.conversionStatus).toBe("existing");
    expect(second.deckId).toBe(first.deckId);
    expect(deps.createLibraryItem).toHaveBeenCalledTimes(1);
    expect(deps.createPresentationDeckForLibraryItem).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicates across dependency instances when state is shared", async () => {
    const sourceStore = new Map<string, any>();
    const idempotencyStore = new Map<string, any>();
    const lockStore = new Set<string>();
    const now = Date.parse("2026-02-22T10:01:00.000Z");

    const sharedState: Partial<PresentationConversionDependencies> = {
      getStoredConversionBySource: async ({ tenantId, sourceItemId }) => {
        return sourceStore.get(`${tenantId}:${sourceItemId}`) ?? null;
      },
      getStoredConversionByIdempotency: async ({ tenantId, sourceItemId, idempotencyKey }) => {
        return idempotencyStore.get(`${tenantId}:${sourceItemId}:${idempotencyKey}`) ?? null;
      },
      upsertStoredConversionRecord: async (input) => {
        const record = {
          sourceItemId: input.sourceItemId,
          sourceFormat: input.sourceFormat,
          deckLibraryItemId: input.deckLibraryItemId,
          deckId: input.deckId,
          partialFidelity: input.partialFidelity,
          fidelityWarnings: input.fidelityWarnings,
        };
        sourceStore.set(`${input.tenantId}:${input.sourceItemId}`, record);
        idempotencyStore.set(`${input.tenantId}:${input.sourceItemId}:${input.idempotencyKey}`, record);
        return record;
      },
      acquireConversionLock: async ({ tenantId, sourceItemId }) => {
        const key = `${tenantId}:${sourceItemId}`;
        if (lockStore.has(key)) {
          return false;
        }
        lockStore.add(key);
        return true;
      },
      releaseConversionLock: async ({ tenantId, sourceItemId }) => {
        lockStore.delete(`${tenantId}:${sourceItemId}`);
      },
      now: () => now,
    };

    const createLibraryItem = vi.fn().mockResolvedValue({
      item: { id: 777 },
      idempotent: false,
    });
    const createPresentationDeckForLibraryItem = vi.fn().mockResolvedValue({
      created: true,
      deck: { id: 888 },
    });

    const depsA = createDeps({
      ...sharedState,
      createLibraryItem,
      createPresentationDeckForLibraryItem,
    });
    const depsB = createDeps({
      ...sharedState,
      createLibraryItem,
      createPresentationDeckForLibraryItem,
    });

    const first = await convertOfficeSourceToPresentation(
      { sourceItemId: 501, idempotencyKey: "multi-a" },
      actor,
      depsA,
    );
    const second = await convertOfficeSourceToPresentation(
      { sourceItemId: 501, idempotencyKey: "multi-b" },
      actor,
      depsB,
    );

    expect(first.conversionStatus).toBe("created");
    expect(second.conversionStatus).toBe("existing");
    expect(second.deckId).toBe(first.deckId);
    expect(createLibraryItem).toHaveBeenCalledTimes(1);
    expect(createPresentationDeckForLibraryItem).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent conversions with source lock response", async () => {
    let releaseCreateItem: (() => void) | null = null;
    const blockedCreateItem = new Promise((resolve) => {
      releaseCreateItem = () => resolve({
        item: { id: 777 },
        idempotent: false,
      });
    });

    const deps = createDeps({
      createLibraryItem: vi.fn().mockReturnValue(blockedCreateItem),
    });

    const firstPromise = convertOfficeSourceToPresentation(
      { sourceItemId: 501, idempotencyKey: "job-a" },
      actor,
      deps,
    );

    const second = await convertOfficeSourceToPresentation(
      { sourceItemId: 501, idempotencyKey: "job-b" },
      actor,
      deps,
    );

    expect(second.conversionStatus).toBe("locked");

    if (releaseCreateItem) {
      releaseCreateItem();
    }
    await firstPromise;
  });

  it("surfaces partial fidelity markers from source metadata", async () => {
    const deps = createDeps({
      getLibraryItemById: vi.fn().mockResolvedValue(
        buildSourceItem({
          metadata: {
            extension: "pptx",
            unsupportedConstructs: ["smart_art", "custom_font"],
          },
        }),
      ),
    });

    const result = await convertOfficeSourceToPresentation(
      {
        sourceItemId: 501,
        idempotencyKey: "fidelity-1",
      },
      actor,
      deps,
    );

    expect(result.partialFidelity).toBe(true);
    expect(result.fidelityWarnings).toContain("Unsupported construct: smart_art");
    expect(result.fidelityWarnings).toContain("Unsupported construct: custom_font");
  });
});
