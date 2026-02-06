#!/usr/bin/env tsx
/**
 * Migration script to add apiStyle column to model_provider_map
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://smartspec:smartspec123@localhost:5432/smartspec';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Running migration for apiStyle...');

    // First check if enum exists
    const enumExists = await sql`SELECT 1 FROM pg_type WHERE typname = 'api_style'`;
    if (enumExists.length === 0) {
      await sql`CREATE TYPE api_style AS ENUM('chat-completions', 'responses', 'messages', 'gemini')`;
      console.log('✓ Created api_style enum');
    } else {
      console.log('✓ api_style enum already exists');
    }

    // Check if column exists
    const colExists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'model_provider_map' AND column_name = 'apiStyle'
    `;
    if (colExists.length === 0) {
      await sql`ALTER TABLE model_provider_map ADD COLUMN "apiStyle" api_style DEFAULT 'chat-completions' NOT NULL`;
      console.log('✓ Added apiStyle column');
    } else {
      console.log('✓ apiStyle column already exists');
    }

    await sql.end();
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

migrate();
