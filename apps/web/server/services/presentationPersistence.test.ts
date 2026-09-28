import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

// Mock the DB connector only — real drizzle-orm helpers (eq/sql) and the real
// schema table objects are still used so the query-builder chain shape below
// matches production exactly.
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import {
  assertNoDuplicateOrderIndexes,
  buildReorderedSlideIds,
  createPresentationSlide,
  evaluateDeckByteTotals,
  findPresentationByteInconsistencies,
  findOrphanedPresentationAssetLinks,
  findStalePresentationObjectKeys,
} from "./presentationPersistence";

const mockGetDb = vi.mocked(getDb);

describe("presentation schema migration", () => {
  it("is additive and includes required constraints", () => {
    const migrationPath = path.resolve(import.meta.dirname, "../../drizzle/0032_presentation_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_decks");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_slides");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_asset_links");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS presentation_slides_deck_order_unique");
    expect(sql.toUpperCase()).not.toContain("DROP TABLE");
    expect(sql.toUpperCase()).not.toContain("DROP COLUMN");
  });
});

describe("presentation hardening migration", () => {
  it("adds durable conversion state and tenant integrity constraints", () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../../drizzle/0033_presentation_hardening_stream_c.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_conversion_records");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS presentation_conversion_locks");
    expect(sql).toContain("presentation_asset_links_deck_tenant_fk");
    expect(sql).toContain("presentation_asset_links_library_item_tenant_fk");
    expect(sql).toContain("presentation_asset_links_slide_deck_fk");
    expect(sql.toUpperCase()).not.toContain("DROP TABLE");
    expect(sql.toUpperCase()).not.toContain("DROP COLUMN");
  });
});

describe("slide ordering invariants", () => {
  it("rejects duplicate order indexes", () => {
    expect(() => assertNoDuplicateOrderIndexes([0, 1, 1, 2])).toThrow(/duplicate/i);
  });

  it("reorders by moving a slide to middle position", () => {
    const next = buildReorderedSlideIds([101, 102, 103, 104], 104, 1);
    expect(next).toEqual([101, 104, 102, 103]);
  });

  it("reorders by moving a slide to first position", () => {
    const next = buildReorderedSlideIds([101, 102, 103, 104], 103, 0);
    expect(next).toEqual([103, 101, 102, 104]);
  });
});

describe("deck byte accounting", () => {
  it("evaluates warning and hard-limit thresholds", () => {
    expect(evaluateDeckByteTotals(70 * 1024 * 1024)).toEqual({
      warningExceeded: false,
      hardLimitExceeded: false,
    });

    expect(evaluateDeckByteTotals(80 * 1024 * 1024)).toEqual({
      warningExceeded: true,
      hardLimitExceeded: false,
    });

    expect(evaluateDeckByteTotals(101 * 1024 * 1024)).toEqual({
      warningExceeded: true,
      hardLimitExceeded: true,
    });
  });

  it("finds reconciliation mismatches", () => {
    const mismatches = findPresentationByteInconsistencies([
      { deckId: 1, persistedTotalBytes: 100, summedAssetBytes: 100 },
      { deckId: 2, persistedTotalBytes: 150, summedAssetBytes: 180 },
      { deckId: 3, persistedTotalBytes: 20, summedAssetBytes: 0 },
    ]);

    expect(mismatches).toEqual([
      { deckId: 2, persistedTotalBytes: 150, summedAssetBytes: 180, deltaBytes: 30 },
      { deckId: 3, persistedTotalBytes: 20, summedAssetBytes: 0, deltaBytes: -20 },
    ]);
  });
});

describe("cleanup consistency helpers", () => {
  it("detects orphaned asset links with explicit reason codes", () => {
    const findings = findOrphanedPresentationAssetLinks([
      {
        linkId: 10,
        deckExists: true,
        slideId: 101,
        slideExists: true,
        libraryItemExists: true,
      },
      {
        linkId: 11,
        deckExists: false,
        slideId: 102,
        slideExists: true,
        libraryItemExists: true,
      },
      {
        linkId: 12,
        deckExists: true,
        slideId: 103,
        slideExists: false,
        libraryItemExists: true,
      },
      {
        linkId: 13,
        deckExists: true,
        slideId: null,
        slideExists: true,
        libraryItemExists: false,
      },
    ]);

    expect(findings).toEqual([
      { linkId: 11, reasons: ["missing_deck"] },
      { linkId: 12, reasons: ["missing_slide"] },
      { linkId: 13, reasons: ["missing_library_item"] },
    ]);
  });

  it("detects stale objects not referenced by any active asset link", () => {
    const stale = findStalePresentationObjectKeys([
      { objectKey: "presentation/tenant-1/deck-1/asset-a.png", referenced: true },
      { objectKey: "presentation/tenant-1/deck-1/asset-b.png", referenced: false },
      { objectKey: "presentation/tenant-1/deck-1/asset-c.png", referenced: false },
      { objectKey: "presentation/tenant-1/deck-1/asset-c.png", referenced: false },
    ]);

    expect(stale).toEqual([
      "presentation/tenant-1/deck-1/asset-b.png",
      "presentation/tenant-1/deck-1/asset-c.png",
    ]);
  });
});

describe("createPresentationSlide concurrency guard (deck row lock)", () => {
  /**
   * Regression test for the production race: two concurrent addSlide calls
   * for the same deck both read the same max(order_index) before either
   * inserts, then both insert at the same order_index and one violates
   * presentation_slides_deck_order_unique. The fix takes a
   * `SELECT ... FOR UPDATE` lock on the parent deck row, inside a
   * transaction, BEFORE computing nextOrderIndex, so concurrent calls for
   * the same deck serialize. This test asserts that exact call ordering
   * against a mocked db client rather than re-diagnosing the race itself.
   */

  function buildMockTx(callOrder: string[], insertedSlide: Record<string, unknown>) {
    let selectCallCount = 0;

    const tx: any = {
      select: vi.fn((_shape: unknown) => {
        selectCallCount += 1;
        const isLockQuery = selectCallCount === 1;
        callOrder.push(isLockQuery ? "select:lockDeck" : "select:maxOrderIndex");

        const chain: any = {
          from: vi.fn(() => chain),
          where: vi.fn(() => chain),
          for: vi.fn((mode: string) => {
            callOrder.push(`for:${mode}`);
            return chain;
          }),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            const value = isLockQuery ? [{ id: 77 }] : [{ maxOrderIndex: 2 }];
            return Promise.resolve(value).then(resolve, reject);
          },
        };
        return chain;
      }),
      insert: vi.fn(() => {
        callOrder.push("insert:slide");
        return {
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([insertedSlide]),
          })),
        };
      }),
      update: vi.fn(() => {
        callOrder.push("update:deck");
        return {
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        };
      }),
    };

    return tx;
  }

  it("locks the deck row (FOR UPDATE) BEFORE reading max(order_index), inside a transaction", async () => {
    const callOrder: string[] = [];
    const insertedSlide = { id: 501, deckId: 77, orderIndex: 3, title: "Slide 4" };
    const tx = buildMockTx(callOrder, insertedSlide);

    const transactionMock = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
    const db: any = { transaction: transactionMock };
    mockGetDb.mockResolvedValue(db);

    const result = await createPresentationSlide({ deckId: 77, title: "New Slide" });

    expect(result).toEqual(insertedSlide);

    // The whole read-then-write sequence must run inside a single transaction
    // (a nested call from an already-open tx becomes a SAVEPOINT).
    expect(transactionMock).toHaveBeenCalledTimes(1);

    // Exact ordering: deck row lock → max(order_index) read → insert → deck update.
    expect(callOrder).toEqual([
      "select:lockDeck",
      "for:update",
      "select:maxOrderIndex",
      "insert:slide",
      "update:deck",
    ]);

    const lockIndex = callOrder.indexOf("for:update");
    const maxOrderIndex = callOrder.indexOf("select:maxOrderIndex");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(maxOrderIndex).toBeGreaterThan(lockIndex);
  });

  it("throws when the insert returns no row", async () => {
    const callOrder: string[] = [];
    const tx = buildMockTx(callOrder, undefined as any);
    // Simulate insert().values().returning() resolving to an empty array.
    tx.insert = vi.fn(() => {
      callOrder.push("insert:slide");
      return {
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      };
    });

    const transactionMock = vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx));
    const db: any = { transaction: transactionMock };
    mockGetDb.mockResolvedValue(db);

    await expect(
      createPresentationSlide({ deckId: 77, title: "New Slide" }),
    ).rejects.toThrow("Failed to create presentation slide");
  });

  it("re-enters via the passed-in dbClient's own transaction() when called with an already-open tx (nested/SAVEPOINT path, as presentationImportService.ts does)", async () => {
    const callOrder: string[] = [];
    const insertedSlide = { id: 502, deckId: 77, orderIndex: 4, title: "Slide 5" };
    const innerTx = buildMockTx(callOrder, insertedSlide);

    // Simulates drizzle-orm's postgres-js PostgresJsTransaction: calling
    // `.transaction()` on an object that is ITSELF already a tx opens a
    // SAVEPOINT and hands back a nested tx (here, the same mock for simplicity).
    const nestedTransactionMock = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(innerTx),
    );
    const openTxDbClient: any = { transaction: nestedTransactionMock };

    mockGetDb.mockClear();

    const result = await createPresentationSlide(
      { deckId: 77, title: "New Slide" },
      openTxDbClient,
    );

    expect(result).toEqual(insertedSlide);

    // getDb() must NOT be called — resolveDb() returns the passed-in dbClient
    // as-is instead of opening a brand-new top-level connection/transaction.
    expect(mockGetDb).not.toHaveBeenCalled();

    // createPresentationSlide must call .transaction() on the SAME object it
    // was handed (the open tx), not on a fresh db — this is what makes the
    // nested call become a SAVEPOINT rather than a new top-level transaction.
    expect(nestedTransactionMock).toHaveBeenCalledTimes(1);

    // The lock-then-read ordering invariant must still hold inside the nested tx.
    expect(callOrder).toEqual([
      "select:lockDeck",
      "for:update",
      "select:maxOrderIndex",
      "insert:slide",
      "update:deck",
    ]);
  });
});
