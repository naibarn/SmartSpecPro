import { describe, expect, it } from "vitest";
import { hasDatabaseErrorCode } from "../migrationReceiptHelpers";

describe("migration receipt database error classification", () => {
  it("finds PostgreSQL codes wrapped by Drizzle query errors", () => {
    const error = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error("relation missing"), { code: "42P01" }),
    });

    expect(hasDatabaseErrorCode(error, "42P01")).toBe(true);
    expect(hasDatabaseErrorCode(error, "23505")).toBe(false);
  });

  it("does not mistake unrelated wrapped failures for a missing table", () => {
    const error = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }),
    });

    expect(hasDatabaseErrorCode(error, "42P01")).toBe(false);
  });
});
