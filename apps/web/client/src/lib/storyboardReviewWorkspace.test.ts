import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyStoryboardReviewVideoOptionsToDraft,
  applyRegeneratedVideoSegmentPromptToDraft,
  buildFirstLastFrameStoryboardTasks,
  evaluateStoryboardVideoSegmentPromptGenerationGate,
  getStoryboardReviewAutoReviewRunIdFromDraft,
  getStoryboardReviewProductIdFromDraft,
  getStoryboardTaskEffectiveGenerationContext,
  normalizeStoryboardTransportMetadata,
  mergeFresherStoryboardReviewTasks,
  normalizeStoryboardReviewDraft,
  readStoryboardReviewDraft,
  replaceStoryboardVideoSlot,
  replaceStoryboardReferenceFrame,
  splitStoryboardVideoSegmentTaskToPerShotFallback,
  storyboardDraftToReviewTasks,
  STORYBOARD_REVIEW_DRAFT_STORAGE_KEY,
  type StoryboardReviewDraft,
} from "./storyboardReviewWorkspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Storyboard Review video segment state", () => {
  it("keeps MCP provider route metadata while normalizing drafts", () => {
    expect(normalizeStoryboardTransportMetadata({
      transport: "mcp",
      originSurface: "storyboard_review",
      assetType: "video",
      connectionId: "mcp_conn_1",
      providerKey: "higgsfield",
      providerModelId: "seedance_unlimited",
      toolName: "generate_video",
      argumentShape: "higgsfield.generate_video",
      creditPolicy: "provider_credits_tracked",
    })).toMatchObject({
      transport: "mcp",
      connectionId: "mcp_conn_1",
      providerKey: "higgsfield",
      providerModelId: "seedance_unlimited",
      toolName: "generate_video",
      argumentShape: "higgsfield.generate_video",
    });
  });

  it("applies Storyboard Review video options to task generation context", () => {
    const now = 123_456;
    const draft = normalizeStoryboardReviewDraft({
      version: 1,
      updatedAt: now - 1,
      taskIds: ["task-1", "task-2"],
      selectedTaskIds: ["task-1", "task-2"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "per_shot",
        promptSource: "initial",
        staleTaskIds: [],
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "per_shot",
          effectiveMode: "per_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          transport: "gateway_api",
          audioStrategy: "native_video_audio",
          referenceMode: "start_stop",
          creativePresets: [],
          segments: [],
          warnings: [],
          planHash: "vsp_existing",
        },
      },
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Old prompt 1",
          model: "veo3/generate-veo-3-video-lite",
          url: "https://example.com/old-1.mp4",
          createdAt: now - 10,
          updatedAt: now - 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            model: "veo3/generate-veo-3-video-lite",
            referenceImages: [
              { url: "https://example.com/1.jpg" },
              { url: "https://example.com/2.jpg" },
            ],
            referenceVideos: [],
            extraParams: {
              shotId: "shot-1",
              storyboardPromptPlanner: {
                includeVoiceover: true,
                speechMode: "th",
                speechLanguage: "Thai",
              },
            },
          },
        },
        {
          id: "task-2",
          index: 1,
          status: "queued",
          type: "video",
          prompt: "Old prompt 2",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now - 10,
          updatedAt: now - 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            model: "veo3/generate-veo-3-video-lite",
            referenceImages: [
              { url: "https://example.com/2.jpg" },
              { url: "https://example.com/3.jpg" },
            ],
            referenceVideos: [],
            extraParams: { shotId: "shot-2" },
          },
        },
      ],
    });

    expect(draft).toBeTruthy();
    const updated = applyStoryboardReviewVideoOptionsToDraft(draft!, {
      videoModel: "custom-video-model",
      videoStructureMode: "per_shot",
      includeVoiceover: false,
      speechMode: "none",
      speechLanguage: "",
      now,
    });

    expect(updated.videoSegmentState?.videoSegmentPlan.videoModelId).toBe("custom-video-model");
    expect(updated.videoSegmentState?.videoSegmentPlan.audioStrategy).toBe("silent");
    expect(updated.videoSegmentState?.staleTaskIds).toEqual(["task-1", "task-2"]);
    expect(updated.tasks[0]).toMatchObject({
      model: "custom-video-model",
      status: "queued",
      url: undefined,
    });
    expect(updated.tasks[0]?.storyboardContext).toMatchObject({
      model: "custom-video-model",
      extraParams: {
        audioStrategy: "silent",
        resolvedAudioStrategy: "silent",
        videoSegmentPromptStale: true,
        storyboardPromptPlanner: {
          includeVoiceover: false,
          speechMode: "none",
          speechLanguage: "",
        },
      },
    });
  });

  it("applies MCP video model route metadata to every storyboard video task", () => {
    const now = 223_456;
    const draft = normalizeStoryboardReviewDraft({
      version: 1,
      updatedAt: now - 1,
      taskIds: ["task-1", "task-2"],
      selectedTaskIds: ["task-1", "task-2"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "per_shot",
        promptSource: "initial",
        staleTaskIds: [],
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "per_shot",
          effectiveMode: "per_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          transport: "gateway_api",
          audioStrategy: "native_video_audio",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg-1",
              index: 0,
              shotIds: ["shot-1"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/1.jpg"],
              subShots: [{ shotId: "shot-1", index: 0, durationSeconds: 5 }],
              warnings: [],
            },
            {
              segmentId: "seg-2",
              index: 1,
              shotIds: ["shot-2"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/2.jpg"],
              subShots: [{ shotId: "shot-2", index: 1, durationSeconds: 5 }],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_gateway_1",
        },
      },
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "queued",
          type: "video",
          prompt: "Shot 1 prompt",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now - 10,
          updatedAt: now - 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            model: "veo3/generate-veo-3-video-lite",
            referenceImages: [{ url: "https://example.com/1.jpg" }],
            referenceVideos: [],
            extraParams: { shotId: "shot-1" },
          },
        },
        {
          id: "task-2",
          index: 1,
          status: "queued",
          type: "video",
          prompt: "Shot 2 prompt",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now - 9,
          updatedAt: now - 9,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            model: "veo3/generate-veo-3-video-lite",
            referenceImages: [{ url: "https://example.com/2.jpg" }],
            referenceVideos: [],
            extraParams: { shotId: "shot-2" },
          },
        },
      ],
    });

    const updated = applyStoryboardReviewVideoOptionsToDraft(draft!, {
      videoModel: "higgsfield/seedance_2_0_fast",
      videoStructureMode: "adaptive_multi_shot",
      manualVideoGroupSize: 3,
      provider: "higgsfield",
      transport: "mcp",
      transportMetadata: {
        transport: "mcp",
        connectionId: "mcp_conn_1",
        providerKey: "higgsfield",
        providerModelId: "seedance_2_0_fast",
        toolName: "generate_video",
        argumentShape: "higgsfield.generate_video",
        originSurface: "storyboard_review",
      },
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      includeSound: true,
      now,
    });

    expect(updated.videoSegmentState?.videoSegmentPlan).toMatchObject({
      videoModelId: "higgsfield/seedance_2_0_fast",
      provider: "higgsfield",
      transport: "mcp",
      mode: "adaptive_multi_shot",
    });
    expect(updated.videoSegmentState?.staleReason).toBe("video_structure_changed");
    expect(updated.videoSegmentState?.staleTaskIds).toEqual(["task-1", "task-2"]);
    for (const task of updated.tasks) {
      expect(task.model).toBe("higgsfield/seedance_2_0_fast");
      expect(task.transportMetadata).toMatchObject({
        transport: "mcp",
        connectionId: "mcp_conn_1",
        providerKey: "higgsfield",
        providerModelId: "seedance_2_0_fast",
        toolName: "generate_video",
        argumentShape: "higgsfield.generate_video",
      });
      expect(task.storyboardContext).toMatchObject({
        model: "higgsfield/seedance_2_0_fast",
        transportMetadata: {
          transport: "mcp",
          connectionId: "mcp_conn_1",
          providerKey: "higgsfield",
          providerModelId: "seedance_2_0_fast",
          toolName: "generate_video",
          argumentShape: "higgsfield.generate_video",
        },
        extraParams: {
          mediaTransport: "mcp",
          mediaProvider: "higgsfield",
          videoSegmentPromptStale: true,
        },
      });
    }
  });

  it("normalizes legacy Higgsfield Unlimited drafts to the supported Seedance Fast MCP model", () => {
    const now = 323_456;
    const draft = normalizeStoryboardReviewDraft({
      version: 1,
      updatedAt: now,
      taskIds: ["task-1"],
      selectedTaskIds: ["task-1"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "adaptive_multi_shot",
        promptSource: "initial",
        staleTaskIds: [],
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "adaptive_multi_shot",
          effectiveMode: "adaptive_multi_shot",
          videoModelId: "higgsfield/seedance_unlimited",
          provider: "higgsfield",
          transport: "mcp",
          audioStrategy: "native_video_audio",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [],
          warnings: [],
          planHash: "vsp_higgsfield_selected",
        },
      },
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "queued",
          type: "video",
          prompt: "Shot prompt",
          model: "higgsfield/seedance_unlimited",
          createdAt: now,
          updatedAt: now,
          transportMetadata: {
            transport: "mcp",
            connectionId: "mcp_conn_higgsfield",
            providerKey: "higgsfield",
            providerModelId: "seedance_unlimited",
            toolName: "generate_video",
            argumentShape: "higgsfield.generate_video",
          },
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 8,
            model: "veo3/generate-veo-3-video-lite",
            referenceImages: [
              { url: "https://cdn.example.com/storyboard-frame.jpg" },
              { url: "https://cdn.example.com/character-lock.jpg" },
            ],
            referenceVideos: [],
            extraParams: {
              shotId: "shot-1",
            },
          },
        },
      ],
    });

    expect(draft).toBeTruthy();
    const context = getStoryboardTaskEffectiveGenerationContext(draft!.tasks[0]!, draft);

    expect(context?.model).toBe("higgsfield/seedance_2_0_fast");
    expect(context?.transportMetadata).toMatchObject({
      transport: "mcp",
      connectionId: "mcp_conn_higgsfield",
      providerKey: "higgsfield",
      providerModelId: "seedance_unlimited",
    });
    expect(context?.referenceImages.map((image) => image.url)).toEqual([
      "https://cdn.example.com/storyboard-frame.jpg",
      "https://cdn.example.com/character-lock.jpg",
    ]);
  });

  it("synthesizes per-shot video segment state for legacy review drafts", () => {
    const now = Date.now();
    const draft = normalizeStoryboardReviewDraft({
      version: 1,
      updatedAt: now,
      taskIds: ["task-1", "task-2"],
      selectedTaskIds: ["task-1", "task-2"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "queued",
          type: "video",
          prompt: "Shot 1 prompt",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now,
          updatedAt: now,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            referenceImages: [{ url: "https://example.com/start.png" }],
            referenceVideos: [],
            extraParams: { shotId: "shot-1" },
          },
        },
        {
          id: "task-2",
          index: 1,
          status: "queued",
          type: "video",
          prompt: "Shot 2 prompt",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now,
          updatedAt: now,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            referenceImages: [{ url: "https://example.com/next.png" }],
            referenceVideos: [],
            extraParams: { shotId: "shot-2" },
          },
        },
      ],
    });

    expect(draft?.videoSegmentState?.effectiveMode).toBe("per_shot");
    expect(draft?.videoSegmentState?.videoSegmentPlan.segments).toHaveLength(2);
    expect(
      draft?.videoSegmentState?.videoSegmentPlan.segments[0]?.shotIds
    ).toEqual(["shot-1"]);
  });

  it("projects segment lineage into review task generation params", () => {
    const now = Date.now();
    const draft = normalizeStoryboardReviewDraft({
      version: 1,
      updatedAt: now,
      taskIds: ["task-1"],
      selectedTaskIds: ["task-1"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "queued",
          type: "video",
          prompt: "Shot 1 prompt",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now,
          updatedAt: now,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            referenceImages: [{ url: "https://example.com/start.png" }],
            referenceVideos: [],
            extraParams: { shotId: "shot-1" },
          },
        },
      ],
    });
    const tasks = storyboardDraftToReviewTasks(draft);

    expect(tasks[0]?.generationExtraParams).toMatchObject({
      videoSegmentEffectiveMode: "per_shot",
      videoSegmentPromptStale: false,
    });
    expect(tasks[0]?.generationExtraParams?.videoSegmentPlanHash).toBeTruthy();
  });

  it("blocks paid generation for stale auto-generated segment prompts", () => {
    const gate = evaluateStoryboardVideoSegmentPromptGenerationGate({
      taskId: "task-1",
      taskExtraParams: {
        videoSegmentPromptStale: true,
        promptSource: "initial",
      },
    });

    expect(gate).toMatchObject({
      allowed: false,
      reasonCode: "video_segment_prompt_stale",
    });
  });

  it("allows stale segment prompts only after manual edit or explicit keep", () => {
    expect(
      evaluateStoryboardVideoSegmentPromptGenerationGate({
        taskId: "task-1",
        taskExtraParams: {
          videoSegmentPromptStale: true,
          promptSource: "manual_edit",
        },
      })
    ).toEqual({ allowed: true });
    expect(
      evaluateStoryboardVideoSegmentPromptGenerationGate({
        taskId: "task-1",
        taskExtraParams: {
          videoSegmentPromptStale: true,
          videoSegmentPromptExplicitlyKept: true,
        },
      })
    ).toEqual({ allowed: true });
  });

  it("applies regenerated segment prompts only to affected tasks", () => {
    const now = 123_456;
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: now - 1,
      taskIds: ["task-1", "task-2"],
      selectedTaskIds: ["task-1", "task-2"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "multi_shot",
        promptSource: "initial",
        staleTaskIds: ["task-1", "task-2"],
        staleReason: "creative_brief_changed",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "auto",
          effectiveMode: "multi_shot",
          videoModelId: "veo3/generate-veo-3-video-lite",
          provider: "kie.ai",
          transport: "gateway_api",
          audioStrategy: "separate_tts_voiceover",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [],
          warnings: [],
          planHash: "vsp_test",
        },
      },
      tasks: [
        {
          id: "task-1",
          index: 0,
          status: "queued",
          type: "video",
          prompt: "Old segment 1",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now - 10,
          updatedAt: now - 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            referenceImages: [],
            referenceVideos: [],
            extraParams: {
              videoSegmentId: "seg-1",
              videoSegmentPromptStale: true,
              promptSource: "initial",
            },
          },
        },
        {
          id: "task-2",
          index: 1,
          status: "queued",
          type: "video",
          prompt: "Old segment 2",
          model: "veo3/generate-veo-3-video-lite",
          createdAt: now - 10,
          updatedAt: now - 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 5,
            referenceImages: [],
            referenceVideos: [],
            extraParams: {
              videoSegmentId: "seg-2",
              videoSegmentPromptStale: true,
              promptSource: "initial",
            },
          },
        },
      ],
    };

    const updated = applyRegeneratedVideoSegmentPromptToDraft(draft, {
      segmentId: "seg-1",
      prompt: "New regenerated prompt",
      taskIds: ["task-1"],
      creativeBriefHash: "brief_hash",
      generatedAt: "2026-06-19T00:00:00.000Z",
      now,
    });

    expect(updated.tasks[0]?.prompt).toBe("New regenerated prompt");
    expect(updated.tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      promptSource: "regenerated",
      videoSegmentPrompt: "New regenerated prompt",
      videoSegmentPromptStale: false,
      videoSegmentPromptCreativeBriefHash: "brief_hash",
    });
    expect(updated.tasks[1]?.prompt).toBe("Old segment 2");
    expect(updated.tasks[1]?.storyboardContext?.extraParams?.videoSegmentPromptStale).toBe(true);
    expect(updated.videoSegmentState?.staleTaskIds).toEqual(["task-2"]);
    expect(updated.videoSegmentState?.staleReason).toBe("creative_brief_changed");
  });

  it("does not update sibling shots in the same segment when taskIds are explicit", () => {
    const now = 123_456;
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: now - 1,
      taskIds: ["task-1", "task-2", "task-3"],
      selectedTaskIds: ["task-1", "task-2", "task-3"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "compact_multi_shot",
        promptSource: "initial",
        staleTaskIds: ["task-1", "task-2", "task-3"],
        staleReason: "creative_brief_changed",
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "compact_multi_shot",
          effectiveMode: "compact_multi_shot",
          videoModelId: "higgsfield/seedance_2_0_fast",
          provider: "higgsfield",
          transport: "mcp",
          audioStrategy: "native_audio",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [],
          warnings: [],
          planHash: "vsp_same_segment",
        },
      },
      tasks: ["task-1", "task-2", "task-3"].map((id, index) => ({
        id,
        index,
        status: "queued",
        type: "video",
        prompt: `Old prompt ${index + 1}`,
        model: "higgsfield/seedance_2_0_fast",
        createdAt: now - 10,
        updatedAt: now - 10,
        storyboardContext: {
          aspectRatio: "9:16",
          duration: 5,
          referenceImages: [],
          referenceVideos: [],
          extraParams: {
            videoSegmentId: "seg-1",
            videoSegmentPromptStale: true,
            promptSource: "initial",
          },
        },
      })),
    };

    const updated = applyRegeneratedVideoSegmentPromptToDraft(draft, {
      segmentId: "seg-1",
      prompt: "Shot 1 regenerated prompt",
      taskIds: ["task-1"],
      generatedAt: "2026-06-19T00:00:00.000Z",
      now,
    });

    expect(updated.tasks.map((task) => task.prompt)).toEqual([
      "Shot 1 regenerated prompt",
      "Old prompt 2",
      "Old prompt 3",
    ]);
    expect(updated.tasks[0]?.storyboardContext?.extraParams?.videoSegmentPromptStale).toBe(false);
    expect(updated.tasks[1]?.storyboardContext?.extraParams?.videoSegmentPromptStale).toBe(true);
    expect(updated.tasks[2]?.storyboardContext?.extraParams?.videoSegmentPromptStale).toBe(true);
    expect(updated.videoSegmentState?.staleTaskIds).toEqual(["task-2", "task-3"]);
  });

  it("requires confirmation before splitting a failed multi-shot segment to per-shot tasks", () => {
    const now = 123_456;
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: now - 1,
      taskIds: ["segment-task"],
      selectedTaskIds: ["segment-task"],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      videoSegmentState: {
        schemaVersion: 1,
        effectiveMode: "adaptive_multi_shot",
        promptSource: "initial",
        staleTaskIds: [],
        staleReason: null,
        splitRetryRequiresConfirmation: false,
        videoSegmentPlan: {
          schemaVersion: 1,
          sourceSurface: "storyboard_review",
          mode: "adaptive_multi_shot",
          effectiveMode: "adaptive_multi_shot",
          videoModelId: "seedance-2",
          provider: "kie.ai",
          transport: "gateway_api",
          audioStrategy: "separate_tts_voiceover",
          referenceMode: "single_storyboard_frame",
          creativePresets: [],
          segments: [
            {
              segmentId: "seg_1",
              index: 0,
              shotIds: ["shot-1", "shot-2"],
              durationSeconds: 10,
              referenceMode: "single_storyboard_frame",
              referenceImageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
              subShots: [
                {
                  shotId: "shot-1",
                  index: 0,
                  durationSeconds: 5,
                  title: "Hook",
                  visualPrompt: "Show the product hook.",
                },
                {
                  shotId: "shot-2",
                  index: 1,
                  durationSeconds: 5,
                  title: "Proof",
                  visualPrompt: "Show the product proof.",
                },
              ],
              warnings: [],
            },
          ],
          warnings: [],
          planHash: "vsp_split_test",
        },
      },
      tasks: [
        {
          id: "segment-task",
          index: 0,
          status: "error",
          type: "video",
          prompt: "Combined prompt",
          model: "seedance-2",
          createdAt: now - 10,
          updatedAt: now - 10,
          error: "Provider rejected multi-shot payload",
          durationSeconds: 10,
          storyboardContext: {
            aspectRatio: "9:16",
            duration: 10,
            referenceImages: [
              { url: "https://example.com/1.jpg" },
              { url: "https://example.com/2.jpg" },
            ],
            referenceVideos: [],
            extraParams: {
              videoSegmentId: "seg_1",
              videoSegmentShotIds: ["shot-1", "shot-2"],
            },
          },
        },
      ],
    };

    const blocked = splitStoryboardVideoSegmentTaskToPerShotFallback(draft, {
      taskId: "segment-task",
      confirmed: false,
      now,
    });

    expect(blocked.tasks).toHaveLength(1);
    expect(blocked.videoSegmentState?.splitRetryRequiresConfirmation).toBe(true);
    expect(blocked.tasks[0]?.storyboardContext?.extraParams?.splitRetryRequiresConfirmation).toBe(true);

    const split = splitStoryboardVideoSegmentTaskToPerShotFallback(blocked, {
      taskId: "segment-task",
      confirmed: true,
      now: now + 1,
    });

    expect(split.tasks).toHaveLength(2);
    expect(split.taskIds).toEqual(["segment-task-split-1", "segment-task-split-2"]);
    expect(split.tasks.map((task) => task.status)).toEqual(["queued", "queued"]);
    expect(split.tasks.map((task) => task.prompt)).toEqual([
      "Show the product hook.",
      "Show the product proof.",
    ]);
    expect(split.tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      shotId: "shot-1",
      videoSegmentShotIds: ["shot-1"],
      splitFallbackFromSegmentId: "seg_1",
      splitFallbackOriginalError: "Provider rejected multi-shot payload",
      splitRetryRequiresConfirmation: false,
    });
    expect(split.videoSegmentState?.splitRetryRequiresConfirmation).toBe(false);
    expect(split.videoSegmentState?.videoSegmentPlan.effectiveMode).toBe("per_shot");
    expect(split.videoSegmentState?.videoSegmentPlan.fallbackReason).toBe("split_fallback_per_shot");
  });
});

describe("buildFirstLastFrameStoryboardTasks", () => {
  it("creates one queued video task per adjacent image pair", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        extraParams: { resolution: "1080p" },
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "split-storyboard-12345-1",
      index: 0,
      status: "queued",
      type: "video",
      model: "veo-3-1",
      durationSeconds: 8,
    });
    expect(tasks[0]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
    expect(tasks[1]?.storyboardContext?.referenceImages.map((image) => image.url)).toEqual([
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      resolution: "1080p",
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    });
    expect(tasks[0]?.prompt).toContain("Create an 8-second cinematic video.");
    expect(tasks[0]?.prompt).toContain("Scene:\n");
    expect(tasks[0]?.prompt).toContain("Action:\n");
    expect(tasks[0]?.prompt).toContain("Camera:\n");
    expect(tasks[0]?.prompt).toContain("Audio:\n");
    expect(tasks[0]?.prompt).toContain("Dialogue:\nNo spoken dialogue.");
  });

  it("keeps generated Thai child-product fallback voiceover gender-neutral", () => {
    const marketplaceProduct = {
      platform: "shopee" as const,
      productName: "เก้าอี้กินข้าวเด็ก high chair",
    };
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        {
          url: "https://example.com/1.jpg",
          name: "Frame 1",
          marketplaceProduct,
        },
        {
          url: "https://example.com/2.jpg",
          name: "Frame 2",
          marketplaceProduct,
        },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        storyboardGuide: "สินค้าแม่และเด็ก ใช้กับมื้ออาหารของลูก",
        now: 12345,
      },
    );

    expect(tasks[0]?.prompt).toContain("Presenter พูดเป็นภาษาไทยว่า");
    expect(tasks[0]?.prompt).toContain("ลูก");
    expect(tasks[0]?.prompt).not.toMatch(/ค่ะ|คะ|ครับ/);
  });

  it("keeps marketplace metadata on sliced frame storyboard tasks", () => {
    const marketplaceContext = {
      productId: "product-1",
      platform: "shopee" as const,
      productName: "Shelf bracket",
      shopName: "Fixture Shop",
      shopId: "shop-123",
      itemId: "item-456",
      sourceUrl: "https://shopee.example/item-456",
    };

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        marketplaceContext,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.marketplaceProduct).toEqual(marketplaceContext);
    expect(tasks[0]?.durationSeconds).toBe(8);
    expect(tasks[0]?.storyboardContext?.duration).toBe(8);
    expect(tasks[0]?.storyboardContext?.referenceImages).toEqual([
      { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
      { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      marketplaceContext,
      storyboardShotDurationSeconds: 8,
      storyboardTotalDurationSeconds: 8,
    });
  });

  it("stores total storyboard timing from ordered frame count and shot duration", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
        { url: "https://example.com/3.jpg" },
        { url: "https://example.com/4.jpg" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 6,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(3);
    expect(tasks.map((task) => task.durationSeconds)).toEqual([6, 6, 6]);
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      storyboardShotDurationSeconds: 6,
      storyboardTotalDurationSeconds: 18,
    });
    expect(tasks[2]?.prompt).toContain("Create a 6-second cinematic video.");
  });

  it("applies split storyboard speech and sound planner options to Veo prompts", () => {
    const marketplaceContext = {
      productId: "product-1",
      platform: "tiktok_shop" as const,
      productName: "โต๊ะข้างเตียง",
    };
    const conceptDetails = "PRODUCT FACTS LOCK: โต๊ะข้างเตียงไม้ 2 ชั้น สำหรับจัดของข้างเตียง. ห้ามเปลี่ยนประเภทสินค้า ขนาด จำนวนชั้น หรือสไตล์สินค้า.";

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        marketplaceContext,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        includeSound: true,
        conceptDetails,
        storyboardGuide: `Concept and product facts:\n${conceptDetails}\n\nShot order: use Frame 1 as start and Frame 2 as end, then preserve continuity.`,
        promptTone: "sales",
        promptLanguage: "th",
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.prompt).toContain("Guide: Shot order: use Frame 1 as start and Frame 2 as end, then preserve continuity.");
    expect(tasks[0]?.prompt.match(/PRODUCT FACTS LOCK/g)).toHaveLength(1);
    expect(tasks[0]?.prompt).not.toContain("Product/concept details:");
    expect(tasks[0]?.prompt.length).toBeLessThan(2600);
    expect(tasks[0]?.storyboardContext?.extraParams?.storyboardGuide).toContain("Shot order");
    expect(tasks[0]?.prompt).not.toContain("Prompt planning options:");
    expect(tasks[0]?.prompt).toContain("Sound design: Soft ecommerce room tone");
    expect(tasks[0]?.prompt).toContain("Dialogue must be spoken in natural Thai, central Thai accent.");
    expect(tasks[0]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "มุมข้างเตียงรก ๆ แบบนี้');
    expect(tasks[0]?.prompt).not.toContain("ปัญหาหน้างาน");
    expect(tasks[0]?.prompt).not.toContain("ทางออกที่ใช้งานได้จริง");
    expect(tasks[0]?.storyboardContext?.extraParams?.storyboardPromptPlanner).toMatchObject({
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      includeSound: true,
      tone: "sales",
      language: "th",
    });
  });

  it("propagates production context and uses supplied shot voiceover lines", () => {
    const productionContext = {
      productionRunId: "run-123",
      productionProjectTitle: "Bedside Shelf Launch",
      productionStoryConceptId: "concept-problem-solution",
      productionStoryConceptTitle: "Problem Solution",
      videoConcept: "Messy bedside corner becomes organized with a 3-tier shelf.",
      voiceoverFullScript: "VOICEOVER SCRIPT BY SHOT:1. 0-6.7s เปิดปัญหา: เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ2. 6.7-13.3s ขยาย pain point: พอเจอทุกวัน มุมนั้นก็ใช้งานไม่ค่อยสบาย3. 13.3-20s สินค้าเข้ามาแก้: พอเอา Greenforst ชั้นวางข้างเตียงเข้ามา มุมนี้ก็เริ่มมีตำแหน่งชัดขึ้น",
      storyboardGuide: "Shot 1 opens on clutter, Shot 2 expands the pain point, Shot 3 introduces the product.",
      sourceGridUrl: "https://example.com/grid.jpg",
    };

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", productionContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", productionContext },
        { url: "https://example.com/3.jpg", name: "Frame 3", productionContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        storyboardGuide: productionContext.storyboardGuide,
        voiceoverFullScript: productionContext.voiceoverFullScript,
        productionContext,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.productionContext).toMatchObject({
      productionRunId: "run-123",
      productionStoryConceptId: "concept-problem-solution",
    });
    expect(tasks[0]?.storyboardContext?.productionContext).toMatchObject({
      productionRunId: "run-123",
    });
    expect(tasks[0]?.storyboardContext?.extraParams).toMatchObject({
      productionRunId: "run-123",
      productionStoryConceptId: "concept-problem-solution",
      voiceoverFullScript: expect.stringContaining("VOICEOVER SCRIPT BY SHOT"),
    });
    expect(tasks[0]?.prompt).toContain("เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ");
    expect(tasks[1]?.prompt).toContain("พอเอา Greenforst ชั้นวางข้างเตียงเข้ามา");
    expect(tasks[0]?.prompt).toContain("Product fidelity lock");
  });

  it("uses natural Thai speech for child dining chair split storyboard prompts", () => {
    const marketplaceContext = {
      productId: "product-2",
      platform: "tiktok_shop" as const,
      productName: "เก้าอี้กินข้าวเด็ก",
    };
    const conceptDetails = "PRODUCT FACTS LOCK: เก้าอี้กินข้าวเด็ก โต๊ะกินข้าวเด็ก เด็ก 6 เดือน 3 in 1. หลังซื้อปรับระดับให้พอดีกับโต๊ะ แล้วคาดเข็มขัดนิรภัยให้ลูกนั่งได้ตำแหน่งเดิมทุกมื้อ.";

    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/2.jpg", name: "Frame 2", marketplaceProduct: marketplaceContext },
        { url: "https://example.com/3.jpg", name: "Frame 3", marketplaceProduct: marketplaceContext },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        duration: 8,
        marketplaceContext,
        includeVoiceover: true,
        speechMode: "th",
        speechLanguage: "Thai",
        includeSound: false,
        conceptDetails,
        now: 12345,
      },
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "มื้ออาหารจะง่ายขึ้นมาก');
    expect(tasks[1]?.prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "ทำซ้ำไม่กี่มื้อ');
    expect(tasks[0]?.prompt).not.toContain("Speaker 1:");
    expect(tasks[0]?.prompt).not.toContain("[energetic]");
    expect(tasks[0]?.prompt).not.toContain("ปัญหาหน้างาน");
  });

  it("does not create tasks without at least two usable images", () => {
    expect(buildFirstLastFrameStoryboardTasks([{ url: "https://example.com/1.jpg" }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
    expect(buildFirstLastFrameStoryboardTasks([{ url: "" }, { url: "   " }], { model: "veo-3-1", aspectRatio: "auto" })).toEqual([]);
  });

  it("replaces shared boundary frames and invalidates affected queued videos", () => {
    const tasks = buildFirstLastFrameStoryboardTasks(
      [
        { url: "https://example.com/1.jpg", name: "Frame 1" },
        { url: "https://example.com/2.jpg", name: "Frame 2" },
        { url: "https://example.com/3.jpg", name: "Frame 3" },
      ],
      {
        model: "veo-3-1",
        aspectRatio: "9:16",
        now: 1000,
      },
    );
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: tasks.map((task) => task.id),
      selectedTaskIds: tasks.map((task) => task.id),
      tasks: tasks.map((task) => ({ ...task, status: "completed", url: `https://example.com/${task.id}.mp4` })),
      companionAudio: [],
      compoundStatus: "ready",
      projectLink: "/video-editor?projectId=1",
      renderJobId: "render-1",
    };

    const next = replaceStoryboardReferenceFrame(draft, {
      taskId: tasks[0]!.id,
      frameIndex: 1,
      image: { url: "https://example.com/replacement.jpg", name: "Replacement" },
      now: 2000,
      statusDetail: "Frame changed",
    });

    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]?.status).toBe("queued");
    expect(next.tasks[0]?.url).toBeUndefined();
    expect(next.tasks[0]?.storyboardContext?.referenceImages[1]?.url).toBe("https://example.com/replacement.jpg");
    expect(next.tasks[1]?.status).toBe("queued");
    expect(next.tasks[1]?.url).toBeUndefined();
    expect(next.tasks[1]?.storyboardContext?.referenceImages[0]?.url).toBe("https://example.com/replacement.jpg");
  });

  it("carries imported video aspect ratio into review tasks", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["imported-1"],
      selectedTaskIds: ["imported-1"],
      tasks: [
        {
          id: "imported-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Uploaded clip",
          model: "Imported",
          createdAt: 1000,
          updatedAt: 1000,
          url: "https://example.com/uploaded.mp4",
          source: "imported",
          aspectRatio: "9:16",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };

    expect(storyboardDraftToReviewTasks(draft)[0]?.generationAspectRatio).toBe("9:16");
  });

  it("renders review tasks in saved taskIds order after refresh or merge", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      updatedAt: 1000,
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1", "shot-2"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
        {
          id: "shot-2",
          index: 2,
          status: "completed",
          type: "video",
          prompt: "Shot 2",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-2.mp4",
        },
        {
          id: "inserted-1",
          index: 1,
          status: "completed",
          type: "image",
          prompt: "Inserted upload",
          model: "Uploaded",
          durationSeconds: 6,
          transition: { name: "crossfade", durationMs: 500, alignment: "center" },
          createdAt: 2000,
          updatedAt: 2000,
          url: "/files/inserted.jpg",
          source: "imported",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };

    expect(storyboardDraftToReviewTasks(draft).map((task) => task.id)).toEqual([
      "shot-1",
      "inserted-1",
      "shot-2",
    ]);
    expect(storyboardDraftToReviewTasks(draft)[1]).toMatchObject({
      mediaType: "image",
      durationSeconds: 6,
      transition: { name: "crossfade", durationMs: 500, alignment: "center" },
      canRegenerate: false,
      isImported: true,
    });
  });

  it("replaces a video slot with the uploaded clip and invalidates stale render links", () => {
    const draft: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 1000,
      taskIds: ["shot-1"],
      selectedTaskIds: [],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Old generated clip",
          model: "veo-3-1",
          createdAt: 900,
          updatedAt: 1000,
          url: "https://example.com/old.mp4",
          storyboardContext: {
            aspectRatio: "16:9",
            model: "veo-3-1",
            referenceImages: [],
            referenceVideos: [],
          },
        },
      ],
      companionAudio: [],
      compoundStatus: "Rendered old project",
      projectLink: "/video-editor?projectId=old",
      renderJobId: "old-render",
    };

    const next = replaceStoryboardVideoSlot(draft, {
      taskId: "shot-1",
      mode: "replace",
      now: 2000,
      importedTask: {
        id: "uploaded-video-replace-1",
        index: 0,
        status: "completed",
        type: "video",
        prompt: "Uploaded replacement",
        model: "Uploaded video",
        durationSeconds: 6,
        createdAt: 2000,
        updatedAt: 2000,
        url: "https://example.com/new.mp4",
        source: "imported",
        aspectRatio: "9:16",
      },
    });

    expect(next.updatedAt).toBe(2000);
    expect(next.taskIds).toEqual(["shot-1"]);
    expect(next.selectedTaskIds).toEqual(["shot-1"]);
    expect(next.projectLink).toBeNull();
    expect(next.renderJobId).toBeNull();
    expect(next.compoundStatus).toBeNull();
    expect(next.tasks[0]).toMatchObject({
      id: "shot-1",
      index: 0,
      status: "completed",
      url: "https://example.com/new.mp4",
      source: "imported",
      aspectRatio: "9:16",
      createdAt: 900,
      updatedAt: 2000,
    });
    expect(next.tasks[0]?.storyboardContext).toMatchObject({
      aspectRatio: "16:9",
      model: "veo-3-1",
    });
  });

  it("keeps fresher task media when merging a stale draft with a newer timestamp", () => {
    const existing = {
      version: 1 as const,
      updatedAt: 3000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed" as const,
          type: "video",
          prompt: "v7.mp4",
          model: "Uploaded",
          createdAt: 1000,
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          ...existing.tasks[0]!,
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [{ id: "shot-1", updatedAt: 3000, url: "/files/v7.mp4" }],
    });
  });

  it("keeps an imported inserted shot when a refreshed draft does not include it yet", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 3000,
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
        {
          id: "inserted-1",
          index: 1,
          status: "completed",
          type: "video",
          prompt: "Inserted upload",
          model: "Uploaded",
          createdAt: 3000,
          updatedAt: 3000,
          url: "/files/inserted.mp4",
          source: "imported",
        },
        {
          id: "shot-2",
          index: 2,
          status: "completed",
          type: "video",
          prompt: "Shot 2",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-2.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 3500,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1"],
      tasks: existing.tasks.filter((task) => task.id !== "inserted-1"),
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      taskIds: ["shot-1", "inserted-1", "shot-2"],
      selectedTaskIds: ["shot-1", "inserted-1"],
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "inserted-1", source: "imported", url: "/files/inserted.mp4" }),
      ]),
    });
  });

  it("keeps locally added companion audio when a stale refreshed draft does not include it yet", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 4000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
          targetDurationSeconds: 45,
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 3500,
      companionAudioUpdatedAt: 3000,
      companionAudio: [],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("keeps a newer local companion audio removal instead of restoring older server audio", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming: StoryboardReviewDraft = {
      ...existing,
      updatedAt: 6000,
      companionAudioUpdatedAt: 4000,
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old narration",
          prompt: "Old narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [],
    });
  });

  it("does not let legacy audio without an explicit audio timestamp overwrite newer audio", () => {
    const existing: StoryboardReviewDraft = {
      version: 1,
      reviewId: 12,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          model: "uvoice/tts-natural",
          kind: "voiceover",
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    };
    const incoming = {
      ...existing,
      updatedAt: 6000,
      companionAudioUpdatedAt: null,
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          model: "imported",
          kind: "music" as const,
        },
      ],
    };

    expect(mergeFresherStoryboardReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("does not hydrate legacy stored audio without an explicit audio timestamp", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    storage.set(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      reviewId: 12,
      updatedAt: Date.now(),
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [
        {
          id: "shot-1",
          index: 0,
          status: "completed",
          type: "video",
          prompt: "Shot 1",
          model: "veo",
          createdAt: 1000,
          updatedAt: 1000,
          url: "/files/shot-1.mp4",
        },
      ],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          model: "imported",
          kind: "music",
        },
      ],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
    }));

    expect(readStoryboardReviewDraft()).toMatchObject({
      companionAudio: [],
      companionAudioUpdatedAt: null,
    });
  });

  it("hydrates edited voiceover script planning preference from storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    storage.set(STORYBOARD_REVIEW_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      taskIds: ["shot-1"],
      selectedTaskIds: ["shot-1"],
      tasks: [],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      voiceoverFullScript: "Edited full narration",
      useVoiceoverScriptAsConcept: true,
    }));

    expect(readStoryboardReviewDraft()).toMatchObject({
      voiceoverFullScript: "Edited full narration",
      useVoiceoverScriptAsConcept: true,
    });
  });
});

describe("Storyboard Review HyperFrames context helpers", () => {
  const baseDraft: StoryboardReviewDraft = {
    version: 1,
    updatedAt: 12345,
    taskIds: ["shot-1"],
    selectedTaskIds: ["shot-1"],
    companionAudio: [],
    compoundStatus: null,
    projectLink: null,
    renderJobId: null,
    tasks: [
      {
        id: "shot-1",
        index: 0,
        status: "completed",
        type: "video",
        prompt: "Shot 1",
        model: "veo",
        createdAt: 12345,
        updatedAt: 12345,
        url: "/api/storage/files/videos/generated/1/shot-1.mp4",
        storyboardContext: {
          aspectRatio: "9:16",
          referenceImages: [],
          referenceVideos: [],
          extraParams: {
            marketplaceProductId: "mp_123",
            autoReviewRunId: "mar_123",
          },
        },
      },
    ],
  };

  it("resolves product and Auto Review run context from task extra params", () => {
    expect(getStoryboardReviewProductIdFromDraft(baseDraft)).toBe("mp_123");
    expect(getStoryboardReviewAutoReviewRunIdFromDraft(baseDraft)).toBe("mar_123");
  });

  it("does not guess the Auto Review run when completed shots come from mixed runs", () => {
    const mixedDraft: StoryboardReviewDraft = {
      ...baseDraft,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1", "shot-2"],
      tasks: [
        baseDraft.tasks[0]!,
        {
          ...baseDraft.tasks[0]!,
          id: "shot-2",
          index: 1,
          storyboardContext: {
            aspectRatio: "9:16",
            referenceImages: [],
            referenceVideos: [],
            extraParams: {
              marketplaceProductId: "mp_123",
              autoReviewRunId: "mar_other",
            },
          },
        },
      ],
    };

    expect(getStoryboardReviewProductIdFromDraft(mixedDraft)).toBe("mp_123");
    expect(getStoryboardReviewAutoReviewRunIdFromDraft(mixedDraft)).toBe("");
  });

  it("preserves manual HyperFrames identity without treating it as Auto Review context", () => {
    const manualDraft = normalizeStoryboardReviewDraft({
      version: 1,
      reviewId: 11,
      name: "Manual Storyboard",
      updatedAt: 12345,
      taskIds: [],
      selectedTaskIds: [],
      tasks: [],
      companionAudio: [],
      compoundStatus: null,
      projectLink: null,
      renderJobId: null,
      marketplaceContext: null,
      manualHyperframesProductId: " manual_product_1 ",
      manualHyperframesRunId: " manual_run_1 ",
    });

    expect(manualDraft?.manualHyperframesProductId).toBe("manual_product_1");
    expect(manualDraft?.manualHyperframesRunId).toBe("manual_run_1");
    expect(getStoryboardReviewProductIdFromDraft(manualDraft)).toBe("");
    expect(getStoryboardReviewAutoReviewRunIdFromDraft(manualDraft)).toBe("");
  });
});
