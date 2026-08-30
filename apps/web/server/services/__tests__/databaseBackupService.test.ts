import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDatabaseBackupJobDirectory,
  resolveDatabaseBackupArtifactPath,
} from "../databaseBackupService";

const originalRoot = process.env.DATABASE_BACKUP_ROOT;

afterEach(async () => {
  if (originalRoot === undefined) delete process.env.DATABASE_BACKUP_ROOT;
  else process.env.DATABASE_BACKUP_ROOT = originalRoot;
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    mode: "safe",
    expiresAt: new Date(Date.now() + 60_000),
    databaseZipPath: null,
    applicationZipPath: null,
    databaseZipBytes: null,
    applicationZipBytes: null,
    databaseZipSha256: null,
    applicationZipSha256: null,
    ...overrides,
  } as any;
}

describe("database backup artifact safety", () => {
  it("rejects malformed job ids before creating a path", () => {
    expect(() => getDatabaseBackupJobDirectory("../../etc/passwd")).toThrow(
      "Invalid database backup job id"
    );
  });

  it("streams only an existing non-empty file inside the backup root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ssp-backup-test-"));
    process.env.DATABASE_BACKUP_ROOT = root;
    const jobId = "11111111-1111-4111-8111-111111111111";
    const directory = path.join(root, jobId);
    const filePath = path.join(directory, "database.zip");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, "zip");

    await expect(
      resolveDatabaseBackupArtifactPath(
        row({ databaseZipPath: filePath }),
        "database"
      )
    ).resolves.toBe(filePath);
    await expect(
      resolveDatabaseBackupArtifactPath(
        row({ databaseZipPath: "/etc/passwd" }),
        "database"
      )
    ).resolves.toBeNull();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects expired jobs even when the file still exists", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "ssp-backup-expired-")
    );
    process.env.DATABASE_BACKUP_ROOT = root;
    const jobId = "11111111-1111-4111-8111-111111111111";
    const directory = path.join(root, jobId);
    const filePath = path.join(directory, "application.zip");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, "zip");

    await expect(
      resolveDatabaseBackupArtifactPath(
        row({
          applicationZipPath: filePath,
          expiresAt: new Date(Date.now() - 1),
        }),
        "application"
      )
    ).resolves.toBeNull();
    await fs.rm(root, { recursive: true, force: true });
  });
});
