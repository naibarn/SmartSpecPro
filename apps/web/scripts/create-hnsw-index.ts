/**
 * Create HNSW Index on multimodal_memory_vectors (Section 12)
 *
 * Run AFTER the backfill script completes. Creating the index post-backfill
 * avoids index maintenance overhead during bulk inserts.
 *
 * Usage:
 *   npx tsx scripts/create-hnsw-index.ts
 *
 * Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
 */

export const HNSW_INDEX_SQL = [
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_multimodal_memory_vectors_embedding",
  "ON multimodal_memory_vectors",
  "USING hnsw (embedding vector_cosine_ops)",
  "WITH (m = 16, ef_construction = 128)",
].join(" ");

async function main() {
  const postgres = (await import("postgres")).default;

  // CONCURRENTLY requires non-transaction connection (no_transaction: true not supported in this lib)
  // Use unsafe() directly without wrapping in transaction
  const sql = postgres(
    process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec",
    { max: 1 }
  );

  console.log("[hnsw-index] Creating HNSW index on multimodal_memory_vectors.embedding...");
  console.log(`[hnsw-index] SQL: ${HNSW_INDEX_SQL}`);

  const start = Date.now();
  try {
    await sql.unsafe(HNSW_INDEX_SQL);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[hnsw-index] HNSW index created in ${elapsed} seconds.`);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[hnsw-index] Fatal error:", err);
    process.exit(1);
  });
}
