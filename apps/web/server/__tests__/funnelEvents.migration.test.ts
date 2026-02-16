import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const migrationPath = path.join(drizzleDir, "0026_add_funnel_events.sql");

describe("funnel_events migration", () => {
  it("has a journal entry in the next migration slot", () => {
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    const latest = journal.entries[journal.entries.length - 1];
    expect(latest).toBeDefined();
    expect(latest.idx).toBe(26);
    expect(latest.tag).toBe("0026_add_funnel_events");
  });

  it("creates funnel_events and required supporting indexes", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).toContain('CREATE TABLE IF NOT EXISTS "funnel_events"');
    expect(content).toContain('"eventKey" varchar(255) NOT NULL');
    expect(content).toContain('"eventTime" timestamp with time zone NOT NULL');

    expect(content).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_key_unique"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_tenant_event_time_idx"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_domain_event_time_idx"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_name_event_time_idx"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_user_name_time_idx"');

    expect(content).toContain('CREATE INDEX IF NOT EXISTS "registration_events_created_user_idx"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "messages_created_at_idx"');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS "credit_transactions_type_created_idx"');
  });

  it("remains additive and non-destructive", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(content).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(content).not.toMatch(/\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i);
  });
});
