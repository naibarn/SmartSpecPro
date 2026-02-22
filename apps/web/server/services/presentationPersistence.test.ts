import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  assertNoDuplicateOrderIndexes,
  buildReorderedSlideIds,
  evaluateDeckByteTotals,
  findPresentationByteInconsistencies,
  findOrphanedPresentationAssetLinks,
  findStalePresentationObjectKeys,
} from "./presentationPersistence";

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
