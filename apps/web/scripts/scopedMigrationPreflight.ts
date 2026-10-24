import { createHash } from "node:crypto";

export type ScopedMigration = { tag: string; when: number; hash: string };

export type ScopedPendingEvaluation =
  | { status: "READY"; pending: ScopedMigration[] }
  | { status: "BLOCKED"; reason: string };

export function parseExpectedPendingTags(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  const tags = value.split(",").map(tag => tag.trim());
  if (tags.length === 0 || tags.some(tag => !/^\d{4}_[a-z0-9_]+$/.test(tag))) {
    throw new Error("MIGRATION_EXPECTED_PENDING_TAGS_INVALID");
  }
  if (new Set(tags).size !== tags.length) throw new Error("MIGRATION_EXPECTED_PENDING_TAGS_DUPLICATE");
  return tags;
}

export function evaluateScopedPendingMigrations(input: {
  journal: ScopedMigration[];
  latestAppliedAt: number | null;
  expectedTags: string[];
}): ScopedPendingEvaluation {
  const tags = new Set(input.journal.map(migration => migration.tag));
  if (tags.size !== input.journal.length || input.journal.some(migration => !Number.isSafeInteger(migration.when))) {
    return { status: "BLOCKED", reason: "migration_journal_invalid" };
  }
  if (input.expectedTags.length === 0 || input.expectedTags.some(tag => !tags.has(tag))) {
    return { status: "BLOCKED", reason: "expected_migration_not_in_journal" };
  }
  const pending = input.journal
    .filter(migration => input.latestAppliedAt === null || migration.when > input.latestAppliedAt)
    .sort((left, right) => left.when - right.when);
  const actualTags = pending.map(migration => migration.tag);
  if (actualTags.length !== input.expectedTags.length || actualTags.some((tag, index) => tag !== input.expectedTags[index])) {
    return { status: "BLOCKED", reason: "pending_migration_set_mismatch" };
  }
  return { status: "READY", pending };
}

export function fingerprintMigrationDatabase(facts: {
  serverAddress: string | null;
  serverPort: number | null;
  clusterName: string | null;
  database: string;
  schema: string;
  role: string;
  serverVersion: string;
}): string {
  const parts = [
    facts.serverAddress || "unknown-address",
    facts.serverPort == null ? "unknown-port" : String(facts.serverPort),
    facts.clusterName || "unknown-cluster",
    facts.database || "unknown-database",
    facts.schema || "unknown-schema",
    facts.role || "unknown-role",
    facts.serverVersion || "unknown-version",
  ];
  return `sha256:${createHash("sha256").update(parts.join("\u0000")).digest("hex")}`;
}
