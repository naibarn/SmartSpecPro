import { describe, expect, it, afterEach } from "vitest";
import { runPgDump } from "../databaseBackupExportService";

describe("database backup pg_dump execution", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalBinary = process.env.PG_DUMP_BINARY;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalBinary === undefined) delete process.env.PG_DUMP_BINARY;
    else process.env.PG_DUMP_BINARY = originalBinary;
  });

  it("rejects when pg_dump is unavailable instead of leaving the job running", async () => {
    process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/app";
    process.env.PG_DUMP_BINARY = "missing-pg-dump-for-test";

    await expect(runPgDump("/tmp/database-backup-test.dump")).rejects.toThrow(
      "pg_dump is unavailable"
    );
  });
});
