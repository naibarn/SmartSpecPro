import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Spec 260 retryable webhook inbox migration", () => {
  it("adds retry lease metadata and a bounded pending lookup index", () => {
    const migration = readFileSync(new URL("../0369_spec260_retryable_billing_webhook_inbox.sql", import.meta.url), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "processingStartedAt" timestamptz');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "processingAttempts" integer NOT NULL DEFAULT 0');
    expect(migration).toContain('ON "webhook_events" ("createdAt")');
    expect(migration).toContain('WHERE "processingStatus" = \'pending\'');
  });
});
