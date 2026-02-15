/**
 * Validates that setInterval-based periodic patterns have been removed
 * from files that are incompatible with Cloud Run's scaling model.
 *
 * Specifically checks that mediaJobs.ts no longer contains the
 * stale Redis cleanup setInterval (original lines 1049-1093).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Cloud Run compatibility: no setInterval for periodic tasks", () => {
  it("mediaJobs.ts does not contain setInterval for Redis cleanup", () => {
    const filePath = path.resolve(
      __dirname,
      "../routers/mediaJobs.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // The stale cleanup setInterval should have been removed
    expect(content).not.toMatch(
      /setInterval\s*\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?media-jobs:user:\*:active/,
    );

    // Should have a comment referencing the Cloud Scheduler replacement
    expect(content).toContain("Cloud Scheduler");
  });
});
