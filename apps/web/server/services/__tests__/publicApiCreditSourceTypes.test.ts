import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CreditSourceType } from "../creditService";

describe("CreditSourceType includes api_* source types", () => {
  // Compile-time verification: assigning each string literal to CreditSourceType
  // If any are invalid, TypeScript will fail at compile time (caught by pnpm check)
  const apiSourceTypes: CreditSourceType[] = [
    "api_chat",
    "api_skill",
    "api_agency",
    "api_job",
    "api_mcp",
    "api_media",
    "api_presentation",
    "api_video_project",
  ];

  it.each(apiSourceTypes)("includes %s", (sourceType) => {
    // Runtime check that the type assignment above is valid
    expect(typeof sourceType).toBe("string");
  });

  it("has all 8 api source types", () => {
    expect(apiSourceTypes).toHaveLength(8);
  });

  it("repairs every api source in drifted local databases", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0283_credit_source_api_enum_repair.sql"),
      "utf8"
    );
    for (const sourceType of apiSourceTypes) {
      expect(migration).toContain(`ADD VALUE IF NOT EXISTS '${sourceType}'`);
    }
  });

  it("includes worker_runtime for external worker scheduling flows", () => {
    const workerSource: CreditSourceType = "worker_runtime";
    expect(workerSource).toBe("worker_runtime");
  });
});
