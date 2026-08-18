import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("VerticalDramaEpisodePage prompt + image flow", () => {
  it("does not run the whole-episode start-frame planning stage from the per-shot button", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("async function handleGeneratePromptAndImage("),
      source.indexOf(
        "/* ---- Video prompt pack",
        source.indexOf("async function handleGeneratePromptAndImage(")
      )
    );

    expect(handler).not.toContain("runStageMutation.mutateAsync");
    expect(handler).toContain("submitAndWaitForShotStartFramePrompt");
  });

  it("polls a background prompt job to terminal success before image admission", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const helper = source.slice(
      source.indexOf("async function submitAndWaitForShotStartFramePrompt("),
      source.indexOf(
        "async function pollStartFrameTask(",
        source.indexOf("async function submitAndWaitForShotStartFramePrompt(")
      )
    );

    expect(helper).toContain(
      "generateShotStartFramePromptMutation.mutateAsync(input)"
    );
    expect(helper).toContain("getShotStartFramePromptJob.fetch");
    expect(helper).toContain('job.status === "succeeded"');
    expect(helper).toContain('job.status === "failed"');

    const handler = source.slice(
      source.indexOf("async function handleGeneratePromptAndImage("),
      source.indexOf(
        "/* ---- Video prompt pack",
        source.indexOf("async function handleGeneratePromptAndImage(")
      )
    );
    expect(
      handler.indexOf("submitAndWaitForShotStartFramePrompt")
    ).toBeLessThan(
      handler.indexOf("generateStartFrameImageMutation.mutateAsync")
    );
  });

  it("waits for the terminal prompt job in AI-edit and repair consumers", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const aiEdit = source.slice(
      source.indexOf("<ImagePromptAiEditDialog"),
      source.indexOf("<VerticalDramaRepairDialog")
    );
    const repair = source.slice(
      source.indexOf("<VerticalDramaRepairDialog"),
      source.indexOf('repairStage === "video_motion_prompt_pack"')
    );

    expect(aiEdit).toContain("await submitAndWaitForShotStartFramePrompt");
    expect(aiEdit).toContain('setImagePromptAiEditJobStatus("succeeded")');
    expect(repair).toContain("await submitAndWaitForShotStartFramePrompt");
    expect(repair).toContain('setRepairJobStatus("succeeded")');
  });

  it("uses the authored prompt response instead of a concurrent stale episode snapshot", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("async function handleGeneratePromptAndImage("),
      source.indexOf(
        "/* ---- Video prompt pack",
        source.indexOf("async function handleGeneratePromptAndImage(")
      )
    );

    expect(handler).toContain("const promptResult");
    expect(handler).toContain("preparedImagePrompt = promptResult.prompt");
    expect(handler).not.toContain("getEpisodeDetail.fetch");
    expect(handler).toContain(
      "await generateStartFrameImageMutation.mutateAsync(request)"
    );
  });

  it("persists the image task before polling and resumes durable tasks after reload", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );

    expect(source).toContain(
      "trpc.verticalDramaEpisodes.persistStartFrameImageTask.useMutation()"
    );
    expect(source).toContain("await persistStartFrameTask(variables.shotNumber");
    expect(source).toContain('status: "submitted"');
    expect(source).toContain("shouldResumeStartFramePoll(");
    expect(source).toContain("activeStartFrameShots");
    expect(source).toContain("frame.imageTask?.pendingTaskId");
  });

  it("keeps prompt success and image failure independently actionable", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );

    expect(source).toContain("failureStage: \"admission\"");
    expect(source).toContain("failureStage: \"provider\"");
    expect(source).toContain("failureStage: \"sync\"");
    expect(source).toContain("onRetryStartFrameImage");
    expect(source).toContain("onRetryStartFrameSync");
    expect(source).toContain("void handleGeneratePromptAndImage(shotNumber, \"single\", false)");
    expect(source).toContain("async function handleRetryStartFrameSync(");
    expect(source).toContain("utils.media.getTask.fetch({ taskId })");
  });

  it("refetches the episode detail after the whole-episode video prompt stage succeeds", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("async function handleGenerateVideoPromptPack()"),
      source.indexOf(
        "/* ---- Phase 3B.5",
        source.indexOf("async function handleGenerateVideoPromptPack()")
      )
    );

    expect(handler).toContain(
      "await refreshEpisodeDetailAfterPromptMutation();"
    );
  });

  it("refreshes the episode detail after a per-shot video prompt succeeds", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("function handleGenerateShotVideoPrompt("),
      source.indexOf(
        "/* ---- 2026-07-07 unusable-dialogue fix",
        source.indexOf("function handleGenerateShotVideoPrompt(")
      )
    );

    expect(handler).toContain("refreshEpisodeDetailAfterPromptMutation");
  });

  it("shows the actual video-prompt precondition instead of always claiming the main image is missing", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const mutation = source.slice(
      source.indexOf("const generateShotVideoPromptMutation"),
      source.indexOf(
        "function handleGenerateShotVideoPrompt(",
        source.indexOf("const generateShotVideoPromptMutation")
      )
    );

    expect(mutation).toContain("toast.error(err.message)");
    expect(mutation).not.toContain('lang === "th"');
  });

  it("keeps View 2 image repair targeted to the barrier reference asset", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const repairFlow = source.slice(
      source.indexOf("function handleSubmitRepairImage("),
      source.indexOf(
        "function handleDiscardRepairImage(",
        source.indexOf("function handleSubmitRepairImage(")
      )
    );

    expect(repairFlow).toContain('targetRole === "barrier_reference"');
    expect(repairFlow).toContain(
      "frame?.barrierMultiView?.referenceView.referenceFrameAssetId"
    );
    expect(repairFlow).toContain('role: "barrier_reference"');
    expect(repairFlow).toContain('source: "reference_frame"');
    expect(repairFlow).toContain("result.targetRole");
  });
});
