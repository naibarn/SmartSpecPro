import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vertical Drama start-frame task durability wiring", () => {
  it("persists the provider task before polling and guards terminal writes by task id", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../routers/verticalDramaEpisodes.ts"),
      "utf8"
    );
    const start = source.indexOf(
      "persistStartFrameImageTask: verticalDramaProcedure"
    );
    const end = source.indexOf(
      "setVideoStartFrameAsset: verticalDramaVideoSafeStartFramesProcedure",
      start
    );
    const mutation = source.slice(start, end);

    expect(mutation).toContain('.for("update")');
    expect(mutation).toContain("pendingTaskId");
    expect(mutation).toContain("failureStage");
    expect(mutation).toContain("failureStage !== \"admission\"");
    expect(mutation).toContain("taskId: z.string().min(1).optional()");
    expect(mutation).toContain("currentTask?.pendingTaskId !== input.imageTask.taskId");
    expect(mutation).toContain("isRecoveredSyncCompletion");
    expect(mutation).toContain("currentTask.failureStage === \"sync\"");
    expect(mutation).toContain('input.imageTask.status === "failed"');
    expect(mutation).toContain('input.imageTask.status === "completed"');
  });

  it("returns the post-QC prompt hash used by task attachment", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../routers/verticalDramaEpisodes.ts"),
      "utf8"
    );
    const start = source.indexOf("generateStartFrameImage: verticalDramaProcedure");
    const end = source.indexOf(
      "generateStartFrameAngleVariations: verticalDramaProcedure",
      start
    );
    const mutation = source.slice(start, end);

    expect(mutation).toContain(
      "const renderPromptHash = sha256Prompt(imagePromptQc.prompt);"
    );
    expect(
      mutation.match(/promptHash: renderPromptHash/g) ?? []
    ).toHaveLength(2);
    expect(mutation).not.toContain("promptHash: sha256Prompt(sourcePrompt)");
  });
});
