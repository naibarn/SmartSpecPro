import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec");

async function migrate() {
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'decision'`);
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'plan'`);
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'architecture'`);
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'component'`);
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'task'`);
  await sql.unsafe(`ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'code_knowledge'`);
  await sql.unsafe(`ALTER TABLE entity_memories ADD COLUMN IF NOT EXISTS importance integer DEFAULT 5`);
  await sql.unsafe(`ALTER TABLE entity_memories ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'auto'`);
  console.log("Migration done");
  await sql.end();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
