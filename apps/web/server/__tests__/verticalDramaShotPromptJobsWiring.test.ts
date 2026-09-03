import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function count(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe("Vertical Drama shot prompt background-job wiring", () => {
  it("initializes once and closes on both graceful shutdown signals", () => {
    const source = read("../_core/index.ts");
    expect(count(source, "initVerticalDramaShotPromptJobsQueue()"))
      .toBe(1);
    expect(count(source, "closeVerticalDramaShotPromptJobsQueue()"))
      .toBe(2);
  });

  it("keeps the public prompt mutation submit-only", () => {
    const source = read("../routers/verticalDramaEpisodes.ts");
    const start = source.indexOf(
      "generateShotStartFramePrompt: verticalDramaProcedure"
    );
    const end = source.indexOf(
      "getShotStartFramePromptJob: verticalDramaProcedure",
      start
    );
    const submitProcedure = source.slice(start, end);

    expect(submitProcedure).toContain("enqueueVerticalDramaShotPromptJob");
    expect(submitProcedure).not.toContain("generateStartFrameShotPrompt");
    expect(submitProcedure).not.toContain("ensurePromptWithinLimit");
  });

  it("restricts the synchronous resolver to a live worker execution token", () => {
    const source = read("../routers/verticalDramaEpisodes.ts");
    const start = source.indexOf(
      "executeShotStartFramePromptJob: verticalDramaProcedure"
    );
    const end = source.indexOf("generateShotReferenceFramePrompt:", start);
    const workerProcedure = source.slice(start, end);

    expect(workerProcedure).toContain(
      "isVerticalDramaShotPromptWorkerExecution"
    );
    expect(workerProcedure).toContain('code: "FORBIDDEN"');
  });

  it("brokers Enhanced vision references before crossing the provider boundary", () => {
    const source = read("../routers/verticalDramaEpisodes.ts");
    const start = source.indexOf("const rawVisionReferences = [");
    const end = source.indexOf("const storyboard = row.storyboard", start);
    const enhancedContext = source.slice(start, end);

    expect(enhancedContext).toContain("resolveExternalMediaReferenceUrls");
    expect(enhancedContext).toContain("tenantId: input.tenantId");
    expect(enhancedContext).toContain("providerUrls?.[index]");
  });
});
