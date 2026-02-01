/**
 * Check media models in database
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

async function checkMediaModels() {
  const sql = postgres(DATABASE_URL);

  try {
    // Check if table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'media_models'
      )
    `;

    if (!tableExists[0].exists) {
      console.log("media_models table does not exist yet");
      await sql.end();
      return;
    }

    const models = await sql`
      SELECT id, "modelId", name, "modelType", provider, "creditCost", "isEnabled", priority
      FROM media_models
      ORDER BY "modelType", provider, priority
    `;

    console.log("\nMedia Models in database:");
    console.log("=".repeat(100));

    if (models.length === 0) {
      console.log("No media models found in database");
    } else {
      models.forEach(m => {
        console.log(`[${m.id}] ${m.modelId}`);
        console.log(`    Name: ${m.name}, Type: ${m.modelType}, Provider: ${m.provider}`);
        console.log(`    Cost: ${m.creditCost} credits, Enabled: ${m.isEnabled}, Priority: ${m.priority}`);
        console.log();
      });
      console.log(`\nTotal: ${models.length} models`);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sql.end();
  }
}

checkMediaModels();
