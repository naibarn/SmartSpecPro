import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  conversations,
  creditTransactions,
  messages,
  registrationEvents,
  users,
} from "../../drizzle/schema";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

describe("SPEC-014 funnel query indexes", () => {
  const migration = readFileSync(
    path.join(drizzleDir, "0399_spec014_funnel_query_indexes.sql"),
    "utf8",
  );

  it("adds only the missing required cohort and outcome indexes", () => {
    expect(indexNames(users)).toEqual(expect.arrayContaining([
      "idx_users_created_at",
      "idx_users_last_signed_in",
      "idx_users_plan",
    ]));
    expect(indexNames(registrationEvents)).toEqual(expect.arrayContaining([
      "registration_events_created_user_idx",
      "idx_registration_events_outcome",
    ]));
    expect(indexNames(creditTransactions)).toEqual(expect.arrayContaining([
      "credit_transactions_type_created_idx",
      "idx_credit_transactions_user_created",
    ]));
    expect(indexNames(conversations)).toContain("idx_conversations_user_created");
    expect(indexNames(messages)).toContain("messages_conversation_created_idx");

    expect(migration.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(6);
    expect(migration).toContain('("userId", "createdAt")');
    expect(migration).toContain('("outcome", "createdAt")');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)|\bDELETE\s+FROM\b/i);
  });

  it("keeps the migration journal entry aligned", () => {
    const journal = JSON.parse(
      readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; version: string; tag: string; breakpoints: boolean }> };
    const entryIndex = journal.entries.findIndex(
      (entry) => entry.tag === "0399_spec014_funnel_query_indexes",
    );
    expect(entryIndex).toBe(385);
    expect(journal.entries[entryIndex]).toMatchObject({
      idx: entryIndex,
      version: "7",
      tag: "0399_spec014_funnel_query_indexes",
      breakpoints: true,
    });
  });
});
