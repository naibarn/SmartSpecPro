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
    expect(count(source, "initVerticalDramaShotPromptJobsQueue()")).toBe(1);
    expect(count(source, "closeVerticalDramaShotPromptJobsQueue()")).toBe(2);
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

  it("does not make Enhanced context depend on Legacy prompt text", () => {
    const source = read("../routers/verticalDramaEpisodes.ts");
    const start = source.indexOf("async function loadEnhancedShotContext");
    const end = source.indexOf("function throwIfEnhancedBlocked", start);
    const enhancedContext = source.slice(start, end);

    expect(enhancedContext).toContain("const existingClip = pack.clips.find");
    expect(enhancedContext).toContain("const clip = existingClip ??");
    expect(enhancedContext).not.toContain("if (!clip)");
    expect(enhancedContext).not.toContain("ต้องมี Legacy prompt");

    const startJob = source.indexOf("async function executeEnhancedShotVideoPromptJob");
    const endJob = source.indexOf("async function mutateEnhancedVariant", startJob);
    const enhancedJob = source.slice(startJob, endJob);
    expect(enhancedJob).toContain("freshClipIndex >= 0");
    expect(enhancedJob).toContain("...freshPack.clips, updatedClip");
    expect(enhancedJob).not.toContain("Legacy prompt changed before Enhanced merge");
  });

  it("keeps Stop Frame removal slot-only", () => {
    const source = read("../routers/verticalDramaEpisodes.ts");
    const start = source.indexOf("clearShotStopFrame:");
    const end = source.indexOf("persistStartFrameImageTask:", start);
    const clearProcedure = source.slice(start, end);

    expect(clearProcedure).toContain("approvedStopFrameAssetId: undefined");
    expect(clearProcedure).toContain("staleStopFrameAssetId: undefined");
    expect(clearProcedure).not.toContain("db.delete");
  });
});
