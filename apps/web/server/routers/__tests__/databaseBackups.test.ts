import { describe, expect, it } from "vitest";

describe("databaseBackups router", () => {
  it("exposes only the admin backup procedures", async () => {
    const { databaseBackupsRouter } = await import("../databaseBackups");
    expect(Object.keys(databaseBackupsRouter._def.procedures)).toEqual([
      "create",
      "list",
      "get",
    ]);
  });
});
