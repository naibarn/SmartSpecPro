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

  it("keeps episode-level image and video model pickers available for special tie-ins", () => {
    const pageSource = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const storyboardPropStart = pageSource.lastIndexOf(
      "onOpenStoredAngleGrid:"
    );
    const storyboardProps = pageSource.slice(
      storyboardPropStart,
      pageSource.indexOf("mcpConnectionId,", storyboardPropStart)
    );
    expect(storyboardProps).toContain("imageModels,");
    expect(storyboardProps).toContain("videoModels,");
    expect(storyboardProps).toContain("onSelectImageModel: handleSelectImageModel");
    expect(storyboardProps).toContain("onSelectVideoModel: handleSelectVideoModel");

    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "../../../../server/routers/verticalDramaEpisodes.ts"),
      "utf8"
    );
    const selectionMutation = routerSource.slice(
      routerSource.indexOf("setEpisodeModelSelection:"),
      routerSource.indexOf("setEpisodeVideoPromptLanguage:")
    );
    expect(selectionMutation).not.toContain(
      "Special tie-in models are episode-local; edit the special episode brief instead"
    );

    const workspaceSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx"
      ),
      "utf8"
    );
    expect(workspaceSource).toContain(
      "advancedMetaOpen={specialEpisode || advancedStagesOpen}"
    );
  });

  it("keeps every episode type on the same two-button image flow", () => {
    const pageSource = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const storyboardProps = pageSource.slice(
      pageSource.lastIndexOf("storyboardPanel={{"),
      pageSource.indexOf("qualityReview:", pageSource.lastIndexOf("storyboardPanel={{"))
    );

    expect(storyboardProps).toContain(
      "onGeneratePromptAndImage: handleGeneratePromptAndImage"
    );
    expect(storyboardProps).toContain(
      "storyboard: unifiedStoryboardData.storyboard"
    );
    expect(storyboardProps).toContain(
      "canonicalShotDrafts: unifiedStoryboardData.canonicalShotDrafts"
    );

    const panelSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx"
      ),
      "utf8"
    );
    expect(panelSource).toContain("onGenerateStartFrameImage &&\n                  frame?.imagePrompt");

    const handler = pageSource.slice(
      pageSource.indexOf("async function handleGeneratePromptAndImage("),
      pageSource.indexOf(
        "/* ---- Video prompt pack",
        pageSource.indexOf("async function handleGeneratePromptAndImage(")
      )
    );
    expect(handler).toContain("if (reauthor) {");
    expect(handler).toContain("ยังไม่มี prompt ภาพ กรุณากด ‘สร้าง prompt + ภาพ’ ก่อน");
  });

  it("bridges special tie-in clip dialogue into the canonical storyboard preview", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    expect(source).toContain("buildVerticalDramaUnifiedStoryboardData");
    expect(source).toContain("dialogueLines");
    expect(source).toContain(
      "canonicalShotDrafts: unifiedStoryboardData.canonicalShotDrafts"
    );
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

  it("uses the authored prompt response while re-reading only the look gate", () => {
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
    expect(handler).toContain("getEpisodeDetail.fetch");
    expect(handler).toContain("getVerticalDramaPendingLookLabels");
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
    expect(source).toContain(
      "shouldReauthorStartFrameImageRetry(errorMessage)"
    );
    expect(source).toContain(
      "shouldReauthorStartFrameImageRetry(err.message)"
    );
    expect(source).toContain("autoRecoveringCompositionShotsRef");
    expect(source).toContain("กำลังซิงก์ข้อมูลจัดองค์ประกอบช็อตใหม่");
    expect(source).toContain("async function handleRetryStartFrameSync(");
    expect(source).toContain("utils.media.getTask.fetch({ taskId })");
  });

  it("repairs old sync failures from the durable task result without paid rerender", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );

    expect(source).toContain("readVerticalDramaTaskMediaAssetId");
    expect(source).toContain("shouldAutoRepairFrameSync");
    expect(source).toContain("autoRepairPersistedFrameSync");
    expect(source).toContain("task.failureStage === \"sync\"");
    expect(source).toContain("verticalDramaMediaAssetId");
    expect(source).toContain("never starts a new provider generation");
  });

  it("does not run a second generic artifact pass in media.getTask", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../../server/routers/media.ts"),
      "utf8"
    );
    const getTask = source.slice(
      source.indexOf("getTask: protectedProcedure"),
      source.indexOf("// Persist a failed provider-capacity task", source.indexOf("getTask: protectedProcedure"))
    );
    expect(getTask).toContain("return task;");
    expect(getTask).not.toContain("ensureMediaTaskArtifactsForPolling({");
  });

  it("automatically retries one start-frame provider policy failure with a softened prompt", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const startFramePoll = source.slice(
      source.indexOf("async function pollStartFrameTask("),
      source.indexOf("/** Retry the non-paid result-linking step", source.indexOf("async function pollStartFrameTask("))
    );
    const anglePoll = source.slice(
      source.indexOf("async function pollAngleVariationsTask("),
      source.indexOf("const generateAngleVariationsMutation", source.indexOf("async function pollAngleVariationsTask("))
    );
    const repairPoll = source.slice(
      source.indexOf("async function pollRepairImageTask("),
      source.indexOf("function handleSubmitRepairImage", source.indexOf("async function pollRepairImageTask("))
    );

    expect(startFramePoll).toContain("shouldAutoRetryPolicyFailure");
    expect(startFramePoll).toContain('"single"');
    expect(startFramePoll).toContain("setTimeout");
    expect(startFramePoll).toContain("hasRetried: softenLevel !== undefined");
    expect(source).toContain("softenLevel: taskSoftenLevel");
    expect(source).toContain("imageTask?.softenLevel");
    expect(source).toContain("false,\n                false,\n                1");
    for (const poll of [anglePoll, repairPoll]) {
      expect(poll).not.toContain("crypto.randomUUID()");
      expect(poll).not.toContain("softenLevel: 1");
    }
    expect(startFramePoll).toContain("persistTerminalImageFailure");
    expect(anglePoll).toContain("persistAngleGrid(shotNumber, null)");
    expect(repairPoll).toContain("setRepairImageErrorByShot");
  });

  it("applies the same pending-look gate to the paid video-safe render", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const handler = source.slice(
      source.indexOf("async function handleGenerateVideoSafeStartFrame("),
      source.indexOf(
        "function handleClearVideoStartFrame(",
        source.indexOf("async function handleGenerateVideoSafeStartFrame(")
      )
    );

    expect(handler).toContain("getVerticalDramaPendingLookLabels");
    expect(handler).toContain("getEpisodeDetail.fetch");
    expect(handler).toContain("setGeneratingVideoSafeStartFrameForShot");
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
