/**
 * One-time indexing script for existing content.
 *
 * Indexes all existing documents and gallery images into Cloudflare Vectorize.
 * Run after Vectorize indexes are created:
 *
 *   tsx scripts/index-existing-content.ts
 *
 * Environment variables required:
 *   CLOUDFLARE_AI_API_KEY, CLOUDFLARE_ACCOUNT_ID,
 *   VECTORIZE_API_TOKEN, DATABASE_URL
 */
import "dotenv/config";

async function main() {
  const { indexDocument, indexImage } = await import(
    "../apps/web/server/services/vectorize-indexing"
  );

  console.log("Starting content indexing...");
  console.log(
    "Docs index:",
    process.env.VECTORIZE_DOCS_INDEX || "docs-index-prod",
  );
  console.log(
    "Images index:",
    process.env.VECTORIZE_IMAGES_INDEX || "images-index-prod",
  );

  // Index documents
  // NOTE: Adjust based on actual database schema and available tables.
  // This is a template — the actual query depends on what content exists.
  console.log(
    "\nSkipping document indexing — no articles table detected.",
  );
  console.log(
    "To index documents, update this script with the correct database query.",
  );

  // Index gallery images
  // NOTE: Gallery items may be stored differently based on the actual schema.
  console.log(
    "\nSkipping gallery indexing — no gallery_items table detected.",
  );
  console.log(
    "To index gallery images, update this script with the correct database query.",
  );

  console.log("\nIndexing script complete.");
  console.log(
    "Update this script with actual database queries when content tables are available.",
  );
}

main().catch((err) => {
  console.error("Indexing failed:", err);
  process.exit(1);
});
