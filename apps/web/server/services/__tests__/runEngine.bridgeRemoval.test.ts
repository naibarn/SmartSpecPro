import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("runEngine — bridge removal verification", () => {
  it("should not import teamOrchestrationBridge", () => {
    const sourceFile = path.resolve(__dirname, "../runEngine.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("teamOrchestrationBridge");
  });

  it("should reference summaryService for final summary generation", () => {
    const sourceFile = path.resolve(__dirname, "../runEngine.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).toContain("summaryService");
  });
});
