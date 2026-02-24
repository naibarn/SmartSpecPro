import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeckFromImportResult } from "./presentationImportService";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

// Expose table refs as stable string tokens so we can assert insert/update calls
vi.mock("../../drizzle/schema", () => ({
  libraryItems: "libraryItems",
  presentationConversionRecords: "presentationConversionRecords",
  presentationSourceAttachments: "presentationSourceAttachments",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, __eq: true })),
}));

vi.mock("./presentationService", () => ({
  createPresentationDeckForLibraryItem: vi.fn(),
  addSlideToDeck: vi.fn(),
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { getDb } from "../db";
import {
  createPresentationDeckForLibraryItem,
  addSlideToDeck,
} from "./presentationService";
import { debugLog } from "../_core/logger";

const mockGetDb = vi.mocked(getDb);
const mockCreateDeck = vi.mocked(createPresentationDeckForLibraryItem);
const mockAddSlide = vi.mocked(addSlideToDeck);
const mockDebugLog = vi.mocked(debugLog);

/** Build a DB mock whose insert/update return chained mocks. */
function makeMockDb(libraryItemId = 42, deckId = 99) {
  // insert(libraryItems).values(...).returning(...) → [{ id: libraryItemId }]
  const returningLibraryItem = vi.fn().mockResolvedValue([{ id: libraryItemId }]);
  const valuesLibraryItem = vi.fn().mockReturnValue({ returning: returningLibraryItem });

  // insert(presentationSourceAttachments).values(...) → awaitable (no returning)
  const valuesAttachment = vi.fn().mockResolvedValue(undefined);

  const insertMock = vi
    .fn()
    .mockImplementationOnce(() => ({ values: valuesLibraryItem }))
    .mockImplementationOnce(() => ({ values: valuesAttachment }));

  // update(presentationConversionRecords).set(...).where(...) → awaitable
  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateMock = vi.fn().mockReturnValue({ set: updateSet });

  const db = { insert: insertMock, update: updateMock } as any;

  // transaction mock: call callback with the same mock db (acting as tx)
  const transactionMock = vi.fn().mockImplementation(async (callback: (tx: any) => any) => {
    return callback(db);
  });
  db.transaction = transactionMock;

  return {
    db,
    mocks: {
      insert: insertMock,
      valuesLibraryItem,
      returningLibraryItem,
      valuesAttachment,
      update: updateMock,
      updateSet,
      updateWhere,
      transaction: transactionMock,
    },
  };
}

const BASE_PARAMS = {
  conversionId: 1,
  tenantId: "tenant-abc",
  userId: 7,
  slides: [{ type: "slide", content: "hello" }],
  title: "My Presentation",
  fidelityWarnings: [],
  sourceFormat: "pptx",
  sourceLibraryItemId: 5,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createDeckFromImportResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDeck.mockResolvedValue({
      created: true,
      deck: { id: 99 } as any,
    });
    mockAddSlide.mockResolvedValue({ id: 1 } as any);
  });

  it("creates a libraryItem Drizzle insert with itemType='presentation' and status='ready'", async () => {
    const { db, mocks } = makeMockDb();
    mockGetDb.mockResolvedValue(db);

    await createDeckFromImportResult(BASE_PARAMS);

    expect(mocks.insert).toHaveBeenNthCalledWith(1, "libraryItems");
    expect(mocks.valuesLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-abc",
        ownerUserId: 7,
        itemType: "presentation",
        source: "import",
        title: "My Presentation",
        status: "ready",
        visibility: "private",
      }),
    );
  });

  it("calls createPresentationDeckForLibraryItem with the new libraryItemId", async () => {
    const { db } = makeMockDb(42);
    mockGetDb.mockResolvedValue(db);

    await createDeckFromImportResult(BASE_PARAMS);

    expect(mockCreateDeck).toHaveBeenCalledWith(
      { libraryItemId: 42, title: "My Presentation" },
      expect.objectContaining({ userId: 7, tenantId: "tenant-abc", role: "user" }),
      expect.anything(), // tx client
    );
  });

  it("calls addSlideToDeck for each slide with incrementing expectedVersion starting at 0", async () => {
    const { db } = makeMockDb();
    mockGetDb.mockResolvedValue(db);

    const slides = [
      { type: "slide", idx: 0 },
      { type: "slide", idx: 1 },
      { type: "slide", idx: 2 },
    ];
    await createDeckFromImportResult({ ...BASE_PARAMS, slides });

    expect(mockAddSlide).toHaveBeenCalledTimes(3);
    expect(mockAddSlide).toHaveBeenNthCalledWith(
      1,
      { deckId: 99, expectedVersion: 0, slideContent: slides[0] },
      expect.objectContaining({ userId: 7 }),
      expect.anything(), // tx client
    );
    expect(mockAddSlide).toHaveBeenNthCalledWith(
      2,
      { deckId: 99, expectedVersion: 1, slideContent: slides[1] },
      expect.objectContaining({ userId: 7 }),
      expect.anything(), // tx client
    );
    expect(mockAddSlide).toHaveBeenNthCalledWith(
      3,
      { deckId: 99, expectedVersion: 2, slideContent: slides[2] },
      expect.objectContaining({ userId: 7 }),
      expect.anything(), // tx client
    );
  });

  it("inserts a presentationSourceAttachments row linking the deck to its source", async () => {
    const { db, mocks } = makeMockDb(42, 99);
    mockGetDb.mockResolvedValue(db);

    await createDeckFromImportResult({
      ...BASE_PARAMS,
      fidelityWarnings: ["font not supported"],
    });

    expect(mocks.insert).toHaveBeenNthCalledWith(2, "presentationSourceAttachments");
    expect(mocks.valuesAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 99,
        sourceLibraryItemId: 5,
        sourceFormat: "pptx",
        conversionStatus: "done",
        partialFidelity: true,
        fidelityWarnings: ["font not supported"],
      }),
    );
  });

  it("updates presentationConversionRecords with deckId, deckLibraryItemId, status='done', progress=100", async () => {
    const { db, mocks } = makeMockDb(42, 99);
    mockGetDb.mockResolvedValue(db);

    await createDeckFromImportResult(BASE_PARAMS);

    expect(mocks.update).toHaveBeenCalledWith("presentationConversionRecords");
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 99,
        deckLibraryItemId: 42,
        status: "done",
        progress: 100,
      }),
    );
  });

  it("truncates slides to 200 when more than 200 slides are provided", async () => {
    const { db } = makeMockDb();
    mockGetDb.mockResolvedValue(db);

    const slides = Array.from({ length: 250 }, (_, i) => ({ idx: i }));
    await createDeckFromImportResult({ ...BASE_PARAMS, slides });

    expect(mockAddSlide).toHaveBeenCalledTimes(200);
    expect(mockDebugLog).toHaveBeenCalledWith(
      "presentationImportService",
      "slides truncated",
      expect.objectContaining({ original: 250, truncated: 200 }),
    );
  });

  it("returns { deckLibraryItemId } on success", async () => {
    const { db } = makeMockDb(42);
    mockGetDb.mockResolvedValue(db);

    const result = await createDeckFromImportResult(BASE_PARAMS);
    expect(result).toEqual({ deckLibraryItemId: 42 });
  });
});
