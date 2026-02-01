import postgres from "postgres";
const sql = postgres("postgresql://smartspec:smartspec_dev@localhost:5432/smartspec");
async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      "tenantId" VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      slug VARCHAR(255) NOT NULL,
      title VARCHAR(500) NOT NULL,
      excerpt TEXT,
      content TEXT,
      "coverImage" VARCHAR(1024),
      author VARCHAR(255),
      "authorAvatar" VARCHAR(1024),
      category VARCHAR(100),
      tags JSON,
      "readTime" VARCHAR(50),
      "isPublished" BOOLEAN NOT NULL DEFAULT false,
      "isFeatured" BOOLEAN NOT NULL DEFAULT false,
      "metaDescription" TEXT,
      "metaKeywords" VARCHAR(500),
      "publishedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("blog_posts table created");
  await sql.end();
}
run().catch(e => { console.error(e); process.exit(1); });
