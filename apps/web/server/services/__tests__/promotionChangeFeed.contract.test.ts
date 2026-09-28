import { describe, expect, it } from "vitest";
import { validateChangeBatch } from "../promotionChangeFeed";

describe("Feature 188 promotion change feed", () => {
  it("requires ordered watermarks and delete tombstones", () => {
    expect(() => validateChangeBatch([
      { sourceWatermark: "1", tableName: "users", sourceKey: "1", operation: "update", rowVersion: "1" },
      { sourceWatermark: "2", tableName: "users", sourceKey: "1", operation: "delete", rowVersion: "2", deleteTombstone: true },
    ])).not.toThrow();
    expect(() => validateChangeBatch([
      { sourceWatermark: "2", tableName: "users", sourceKey: "1", operation: "update", rowVersion: "2" },
      { sourceWatermark: "1", tableName: "users", sourceKey: "2", operation: "update", rowVersion: "1" },
    ])).toThrow("PROMOTION_WATERMARK_NOT_MONOTONIC");
    expect(() => validateChangeBatch([
      { sourceWatermark: "1", tableName: "users", sourceKey: "1", operation: "delete", rowVersion: "1" },
    ])).toThrow("PROMOTION_DELETE_TOMBSTONE_REQUIRED");
    expect(() => validateChangeBatch([
      { sourceWatermark: "2", tableName: "users", sourceKey: "1", operation: "update", rowVersion: "2" },
    ], "2")).toThrow("PROMOTION_WATERMARK_NOT_AFTER_CHECKPOINT");
  });
});
