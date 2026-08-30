import { describe, expect, it } from "vitest";
import {
  createDatabaseBackupInputSchema,
  isTerminalDatabaseBackupStatus,
} from "../databaseBackupContracts";
import { redactApplicationRow } from "../databaseBackupExportService";

describe("database backup contracts", () => {
  it("accepts safe mode without a full-export confirmation", () => {
    expect(createDatabaseBackupInputSchema.parse({ mode: "safe" })).toEqual({
      mode: "safe",
      confirmedFullExport: false,
    });
  });

  it("requires explicit confirmation for full application export", () => {
    expect(() =>
      createDatabaseBackupInputSchema.parse({ mode: "full" })
    ).toThrow("Full export confirmation is required");
    expect(
      createDatabaseBackupInputSchema.parse({
        mode: "full",
        confirmedFullExport: true,
      })
    ).toEqual({
      mode: "full",
      confirmedFullExport: true,
    });
  });

  it("only treats completed, failed and expired jobs as terminal", () => {
    expect(isTerminalDatabaseBackupStatus("queued")).toBe(false);
    expect(isTerminalDatabaseBackupStatus("running")).toBe(false);
    expect(isTerminalDatabaseBackupStatus("completed")).toBe(true);
    expect(isTerminalDatabaseBackupStatus("failed")).toBe(true);
    expect(isTerminalDatabaseBackupStatus("expired")).toBe(true);
  });

  it("redacts sensitive application fields only in safe mode", () => {
    const redactedColumns: string[] = [];
    expect(
      redactApplicationRow(
        { email: "a@example.com", apiKeyEncrypted: "secret", name: "A" },
        "safe",
        redactedColumns
      )
    ).toEqual({
      email: "a@example.com",
      apiKeyEncrypted: "[REDACTED]",
      name: "A",
    });
    expect(redactedColumns).toContain("apiKeyEncrypted");
    expect(
      redactApplicationRow({ apiKeyEncrypted: "secret" }, "full", [])
    ).toEqual({ apiKeyEncrypted: "secret" });
  });
});
