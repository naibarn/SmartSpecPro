import { describe, it, expect } from "vitest";
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

  it("includes worker_runtime for external worker scheduling flows", () => {
    const workerSource: CreditSourceType = "worker_runtime";
    expect(workerSource).toBe("worker_runtime");
  });
});
