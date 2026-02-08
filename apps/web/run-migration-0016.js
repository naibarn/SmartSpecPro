#!/usr/bin/env node
/**
 * Quick migration runner for 0016_handy_multiple_man.sql
 * Runs the Phase 2 workflow tables migration directly
 */

import { readFileSync } from 'fs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const migrationSQL = readFileSync('./drizzle/0016_handy_multiple_man.sql', 'utf-8');

console.log('🚀 Running migration 0016_handy_multiple_man...');

try {
  await sql.unsafe(migrationSQL);
  console.log('✅ Migration completed successfully!');

  // Record migration in drizzle migrations table
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('0016_handy_multiple_man', ${Date.now()})
    ON CONFLICT (hash) DO NOTHING
  `;

  console.log('✅ Migration recorded in __drizzle_migrations');

} catch (error) {
  // If tables already exist, that's fine (likely already migrated)
  if (error.message.includes('already exists')) {
    console.log('ℹ️  Tables already exist - migration already applied');
  } else {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
} finally {
  await sql.end();
}

console.log('✨ Done!');
