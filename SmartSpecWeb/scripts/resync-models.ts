/**
 * Re-sync OpenRouter models after data loss
 * OpenRouter /api/v1/models is a public endpoint (no auth required)
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";
const sql = postgres(DATABASE_URL);

async function main() {
  try {
    // Fetch models from OpenRouter (public API, no auth needed)
    console.log("Fetching models from OpenRouter...");
    const resp = await fetch("https://openrouter.ai/api/v1/models");
    const data = await resp.json();
    const models = data.data || [];
    console.log("Total models from OpenRouter:", models.length);

    // Convert to our format
    const converted = models
      .filter((m: any) => m.id && m.name)
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.id.split("/")[0] || "unknown",
        contextLength: m.context_length || 4096,
        pricing: {
          input: parseFloat(m.pricing?.prompt || "0") * 1000000,
          output: parseFloat(m.pricing?.completion || "0") * 1000000,
        },
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    console.log("Converted models:", converted.length);

    // Save to DB
    await sql`UPDATE llm_providers SET "availableModels" = ${JSON.stringify(converted)}::jsonb, "updatedAt" = NOW() WHERE id = 1`;
    console.log("Models saved to database successfully");

    // Verify
    const [check] = await sql`SELECT jsonb_array_length("availableModels"::jsonb) as count FROM llm_providers WHERE id = 1`;
    console.log("Verified model count in DB:", check?.count);
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await sql.end();
  }
}

main();
