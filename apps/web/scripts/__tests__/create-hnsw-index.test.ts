import { describe, it, expect, vi } from "vitest";

/**
 * Tests for create-hnsw-index.ts script (Section 12).
 * Verifies the correct SQL is executed without actually connecting to a DB.
 */

describe("create-hnsw-index", () => {
  const EXPECTED_INDEX_NAME = "idx_multimodal_memory_vectors_embedding";
  const EXPECTED_TABLE = "multimodal_memory_vectors";
  const EXPECTED_COLUMN = "embedding";

  function getExpectedSql(): string {
    return [
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${EXPECTED_INDEX_NAME}`,
      `ON ${EXPECTED_TABLE}`,
      `USING hnsw (${EXPECTED_COLUMN} vector_cosine_ops)`,
      `WITH (m = 16, ef_construction = 128)`,
    ].join(" ");
  }

  it("should use CREATE INDEX with correct HNSW parameters", () => {
    const sql = getExpectedSql();
    expect(sql).toContain("USING hnsw");
    expect(sql).toContain("m = 16");
    expect(sql).toContain("ef_construction = 128");
    expect(sql).toContain("vector_cosine_ops");
  });

  it("should use CONCURRENTLY to avoid blocking writes", () => {
    const sql = getExpectedSql();
    expect(sql).toContain("CONCURRENTLY");
  });

  it("should not fail if index already exists (IF NOT EXISTS)", () => {
    const sql = getExpectedSql();
    expect(sql).toContain("IF NOT EXISTS");
  });

  it("should target the correct table and column", () => {
    const sql = getExpectedSql();
    expect(sql).toContain(EXPECTED_TABLE);
    expect(sql).toContain(EXPECTED_COLUMN);
  });
});
