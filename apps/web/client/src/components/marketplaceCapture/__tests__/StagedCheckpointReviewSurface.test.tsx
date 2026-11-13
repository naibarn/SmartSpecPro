import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY } from "@/lib/marketplaceCaptureAutoReviewPreferences";

// Regression coverage for increment 5 of the "remove per-item approval
// gates" change: the old "approve all images"/"approve all videos" bulk
// buttons fired a synchronous `.forEach(cp => props.onApprove(...))` over
// several checkpoints, all closing over ONE captured stateDigest. The
// run-wide optimistic-concurrency check only lets the first of those calls
// land — every other one 409s with staged_state_drift, silently. The new
// bulk-generate action replaces that with a sequential chain that reads the
// fresh stateDigest out of EACH mutation response and feeds it into the
// NEXT call. This file proves that chaining directly against a mocked
// retryStagedAutoReviewShot mutation, independent of the Panel's own
// (Surface-agnostic) rendering tests.
// Stable mock captured outside the component tree — the mocked
// `useMutation()` factory below is re-invoked on every render, so anything
// declared purely inline would be a different vi.fn() instance by the time
// assertions run after a user interaction.
const mockGeneratePromptMutate = vi.fn();
const mockBulkGenerateMutate = vi.fn();

// Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1, shot
// 8) regression coverage: lets one test simulate `stateDigest` being empty
// (state query hasn't produced data yet) without a separate mock module.
// Reset to `null` (no override, plain `stateFixture()` wins) after each test.
let mockStateDigestOverride: Record<string, unknown> | null = null;
let mockStateFixtureOverride: Record<string, unknown> | null = null;

// Controllable mutateAsync for generateStagedAutoReviewShotPrompt — backs
// per-shot background prompt authoring. Media generation itself is admitted
// through startStagedAutoReviewBulkGeneration below.
const mockGeneratePromptMutateAsync = vi.fn(
  async (input: { shotId: number; stage: string }) => ({
    runId: "run-1",
    operation: {
      operationId: `op-prompt-${input.shotId}`,
      runId: "run-1",
      stateDigest: `digest-after-prompt-${input.shotId}-${input.stage}`,
      planRevision: 1,
      status: "queued" as const,
    },
    status: "queued" as const,
  })
);

const mockRetryMutateAsync = vi.fn(
  async (input: { shotId: number; expectedStateDigest: string }) => ({
    runId: "run-1",
    operation: {
      operationId: `op-${input.shotId}`,
      runId: "run-1",
      stateDigest: `digest-after-shot-${input.shotId}`,
      planRevision: 1,
      status: "queued" as const,
    },
    status: "queued" as const,
  })
);

// Plain `.mutate` for the legacy retry endpoint. Per-shot media dispatch is
// expected to use `mockBulkGenerateMutate` so it creates a durable,
// shot-scoped Worker Jobs entry instead.
const mockRetryMutate = vi.fn();

// Set by the retryStagedAutoReviewShot mock below on every render — lets a
// test call the Surface's shared `mutationOptions.onError` directly.
let capturedRetryMutationOptions: {
  onError?: (e: { message: string }) => void;
} | null = null;

let capturedRedraftMutationOptions: {
  onSuccess?: (result: unknown, variables: unknown) => Promise<void>;
} | null = null;

// Controllable mutateAsync for uploadStagedAutoReviewShotMedia — the manual
// drag-and-drop / tap-to-browse shot media replacement mutation.
const mockUploadShotMediaMutateAsync = vi.fn(
  async (input: { shotId: number; stage: string }) => ({
    runId: "run-1",
    operation: {
      operationId: `op-upload-${input.shotId}`,
      runId: "run-1",
      stateDigest: `digest-after-upload-${input.shotId}-${input.stage}`,
      planRevision: 1,
      status: "completed" as const,
    },
    status: "completed" as const,
  })
);

function genericMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  };
}

function stateFixture() {
  return {
    stateDigest: "digest-0",
    outputMode: "full_video",
    planRevision: 1,
    planReview: { status: "approved", redraftCount: 0 },
    storyPlan: { title: "รีวิวแก้วน้ำ", storySummary: "เรื่องย่อ" },
    shots: [
      {
        shotId: 1,
        title: "เปิดเรื่อง",
        storySummary: "เปิดภาพสินค้า",
        dialogue: "สวัสดี",
        imagePrompt: "สร้างภาพสินค้า 1",
        // Both video prerequisites are present so the per-shot dispatch
        // action is enabled by default in this fixture.
        videoPrompt: "วิดีโอพร้อมส่งช็อต 1",
        imageArtifactUrl: "/media/shot-1.png",
        imageArtifactHash: "shot-1-image-hash",
      },
      {
        shotId: 2,
        title: "ต่อเนื่อง",
        storySummary: "หยิบสินค้าขึ้นมา",
        dialogue: "ลองดูสิ",
        imagePrompt: "สร้างภาพสินค้า 2",
        videoPrompt: null,
        imageArtifactUrl: null,
        imageArtifactHash: null,
      },
    ],
    checkpoints: [
      {
        checkpointId: "image-result:run-1:shot-1:r1",
        kind: "image_result",
        shotId: 1,
        state: "approved",
        revision: 1,
        contentHash: "shot-1-image-hash",
        estimatedCredits: 0,
        consumed: true,
      },
      {
        checkpointId: "image-prompt:run-1:shot-1:r1",
        kind: "image_prompt",
        shotId: 1,
        state: "approved",
        revision: 1,
        contentHash: "prompt-hash-1",
        estimatedCredits: 3,
        consumed: true,
      },
      {
        checkpointId: "image-prompt:run-1:shot-2:r1",
        kind: "image_prompt",
        shotId: 2,
        state: "approved",
        revision: 1,
        contentHash: "prompt-hash-2",
        estimatedCredits: 3,
        consumed: true,
      },
      // Prompt checkpoint retained for legacy status rendering; the button
      // itself also renders if this record is absent.
      {
        checkpointId: "video-prompt:run-1:shot-1:r1",
        kind: "video_prompt",
        shotId: 1,
        state: "approved",
        revision: 1,
        contentHash: "video-prompt-hash-1",
        estimatedCredits: 4,
        consumed: true,
      },
    ],
  };
}

// Two-character-conversation feature (planning/marketplace-two-character-
// conversation/plan.md §3.7/§3.8) — StagedCheckpointReviewPanel now calls
// `useTenantFeatureFlag` directly (raw `@tanstack/react-query`, bypassing the
// mocked `trpc` client below entirely) — mock it out so no real
// QueryClientProvider is required, same convention as
// `FeatureFlagGate.test.tsx`. Every test in this file exercises the
// flag-off/no-VD-characters default.
vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      getStagedAutoReviewCheckpointState: {
        // `mockStateDigestOverride` lets one test simulate `stateDigest`
        // being empty (state not loaded yet / query errored with no prior
        // successful fetch) without needing a separate mock module per
        // test — see the "missing stateDigest" describe block below.
        useQuery: () => ({
          data: {
            ...stateFixture(),
            ...(mockStateFixtureOverride ?? {}),
            ...(mockStateDigestOverride ?? {}),
          },
          isLoading: false,
          error: null,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      approveStagedAutoReviewCheckpoint: {
        useMutation: () => genericMutation(),
      },
      acceptStagedAutoReviewImage: { useMutation: () => genericMutation() },
      rejectStagedAutoReviewCheckpoint: {
        useMutation: () => genericMutation(),
      },
      editStagedAutoReviewShot: { useMutation: () => genericMutation() },
      generateStagedAutoReviewShotPrompt: {
        useMutation: () => ({
          mutate: mockGeneratePromptMutate,
          mutateAsync: mockGeneratePromptMutateAsync,
          isPending: false,
        }),
      },
      startStagedAutoReviewBulkGeneration: {
        useMutation: () => ({
          mutate: mockBulkGenerateMutate,
          mutateAsync: vi.fn().mockResolvedValue({ status: "queued" }),
          isPending: false,
        }),
      },
      editStagedAutoReviewAudioPlan: { useMutation: () => genericMutation() },
      editStagedAutoReviewFinalAssembly: {
        useMutation: () => genericMutation(),
      },
      retryStagedAutoReviewShot: {
        // Captures the `mutationOptions` the Surface passes in, so a test can
        // invoke `onError` directly and assert the shared plain-Thai reason-
        // code remap (`friendlyActionError`) without needing a real failing
        // request. See the "friendly reason-code remap" describe block below.
        useMutation: (options?: { onError?: (e: { message: string }) => void }) => {
          capturedRetryMutationOptions = options ?? null;
          return {
            mutate: mockRetryMutate,
            mutateAsync: mockRetryMutateAsync,
            isPending: false,
          };
        },
      },
      retryStagedAutoReviewAudioPlan: {
        useMutation: () => genericMutation(),
      },
      retryStagedAutoReviewFinalAssembly: {
        useMutation: () => genericMutation(),
      },
      redraftStagedAutoReviewPlan: {
        useMutation: (options?: {
          onSuccess?: (result: unknown, variables: unknown) => Promise<void>;
        }) => {
          capturedRedraftMutationOptions = options ?? null;
          return genericMutation();
        },
      },
      saveAutoReviewSequentialLanguagePlan: {
        useMutation: () => genericMutation(),
      },
      updateStagedAutoReviewReferenceManifest: {
        useMutation: () => genericMutation(),
      },
      // Per-shot cast presence / look override
      // (`planning/marketplace-four-character-cast/plan.md` §6).
      updateStagedAutoReviewShotCast: {
        useMutation: () => genericMutation(),
      },
      // Not part of this feature — the Surface has called this since the
      // final-render-settings work landed, but the mock was never given the
      // shape, so every test in this file threw before reaching its
      // assertions. Stubbed here so the file can actually run.
      updateStagedAutoReviewFinalRenderSettings: {
        useMutation: () => genericMutation(),
      },
      submitStagedAutoReviewFinalRender: {
        useMutation: () => genericMutation(),
      },
      uploadStagedAutoReviewOverlayImage: {
        useMutation: () => genericMutation(),
      },
      listDramaCharactersForPicker: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
      uploadStagedAutoReviewShotMedia: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockUploadShotMediaMutateAsync,
          isPending: false,
        }),
      },
      listQualityPlanningModels: {
        useQuery: () => ({
          data: [{ modelId: "test-story-llm", label: "Test Story LLM" }],
          isLoading: false,
        }),
      },
    },
    // Stubbed even though `useTenantFeatureFlag` above always resolves the
    // gate to `false` — the Panel calls this query unconditionally (only
    // `enabled` is gated by the flag), so the mocked client needs the shape
    // present or the call throws before `enabled` is ever read.
    verticalDramaSeries: {
      list: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
    media: {
      getModels: {
        useQuery: () => ({
          data: {
            models: [
              {
                id: "google-banana-2",
                name: "Google Banana 2",
                provider: "google",
              },
              {
                id: "veo3/generate-veo-3-video-lite",
                name: "Veo 3 Video Lite",
                provider: "google",
              },
            ],
            defaults: {
              image: "google-banana-2",
              video: "veo3/generate-veo-3-video-lite",
            },
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { StagedCheckpointReviewSurface } from "../StagedCheckpointReviewSurface";

describe("StagedCheckpointReviewSurface — concept confirmation navigation", () => {
  it("signals the parent only after a selected concept is accepted", async () => {
    const onStoryConceptConfirmed = vi.fn();
    render(
      <StagedCheckpointReviewSurface
        runId="run-1"
        onStoryConceptConfirmed={onStoryConceptConfirmed}
      />
    );

    expect(capturedRedraftMutationOptions?.onSuccess).toBeTypeOf("function");
    await capturedRedraftMutationOptions!.onSuccess!({}, {
      selectedConcept: {
        conceptId: "concept-2",
        title: "ใช้จริงทุกวัน",
        angle: "เล่าจากประสบการณ์ใช้งาน",
        storySummary: "ทดลองใช้และเห็นผลจากชีวิตประจำวัน",
        dialoguePreview: "พิมพ์ชนก: ลองใช้มาสักพักแล้ว รู้สึกว่าหยิบใช้สะดวกขึ้นจริงนะ",
      },
    });

    expect(onStoryConceptConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe("StagedCheckpointReviewSurface — bulk background generation", () => {
  beforeEach(() => {
    mockBulkGenerateMutate.mockClear();
    mockStateFixtureOverride = null;
  });

  it("submits every missing shot in one worker job instead of firing per-shot requests", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    const bulkButton = screen.getByRole("button", {
      name: "สร้าง Prompt ภาพทุกช็อต (2)",
    });
    fireEvent.click(bulkButton);
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() => expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1));
    expect(mockBulkGenerateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        expectedStateDigest: "digest-0",
        targets: [
          expect.objectContaining({ shotId: 1, stage: "image", promptOnly: true, refreshPrompt: true }),
          expect.objectContaining({ shotId: 2, stage: "image", promptOnly: true, refreshPrompt: true }),
        ],
      })
    );
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
  });

  it("submits image generation for every shot as one worker batch from saved prompts", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างภาพทุกช็อต (2)" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() => expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1));
    expect(mockBulkGenerateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({ shotId: 1, stage: "image", replaceExisting: true }),
          expect.objectContaining({ shotId: 2, stage: "image", replaceExisting: true }),
        ],
      })
    );
  });

  it("bulk video-prompt generation queues prompt-only targets without submitting video renders", async () => {
    const state = stateFixture();
    mockStateFixtureOverride = {
      shots: state.shots.map(shot => ({
        ...shot,
        imageArtifactUrl: `/media/shot-${shot.shotId}.png`,
        imageArtifactHash: `image-hash-${shot.shotId}`,
      })),
      checkpoints: [
        ...state.checkpoints,
        ...state.shots.map(shot => ({
          checkpointId: `image-result-${shot.shotId}`,
          kind: "image_result",
          shotId: shot.shotId,
          state: "approved",
          revision: 1,
          contentHash: `image-hash-${shot.shotId}`,
        })),
      ],
    };
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt วิดีโอทุกช็อต (2)" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() => expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1));
    expect(mockBulkGenerateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            shotId: 1,
            stage: "video",
            promptOnly: true,
            refreshPrompt: true,
          }),
          expect.objectContaining({
            shotId: 2,
            stage: "video",
            promptOnly: true,
            refreshPrompt: true,
          }),
        ],
      })
    );
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
    mockStateFixtureOverride = null;
  });

  it("submits saved video prompts for every shot as one worker batch", async () => {
    const state = stateFixture();
    mockStateFixtureOverride = {
      shots: state.shots.map(shot => ({
        ...shot,
        videoPrompt: `saved video prompt ${shot.shotId}`,
        imageArtifactUrl: `/media/shot-${shot.shotId}.png`,
        imageArtifactHash: `image-hash-${shot.shotId}`,
      })),
      checkpoints: [
        ...state.checkpoints,
        ...state.shots.flatMap(shot => [
          {
            checkpointId: `image-result-${shot.shotId}`,
            kind: "image_result",
            shotId: shot.shotId,
            state: "approved",
            revision: 1,
            contentHash: `image-hash-${shot.shotId}`,
          },
          {
            checkpointId: `video-prompt-${shot.shotId}`,
            kind: "video_prompt",
            shotId: shot.shotId,
            state: "approved",
            revision: 1,
            contentHash: `video-prompt-hash-${shot.shotId}`,
          },
        ]),
      ],
    };
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างวิดีโอทุกช็อต (2)" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() => expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1));
    expect(mockBulkGenerateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({ shotId: 1, stage: "video", replaceExisting: true }),
          expect.objectContaining({ shotId: 2, stage: "video", replaceExisting: true }),
        ],
      })
    );
    mockStateFixtureOverride = null;
  });
});

describe("StagedCheckpointReviewSurface — manual shot media upload wiring", () => {
  beforeEach(() => {
    mockUploadShotMediaMutateAsync.mockClear();
  });

  it("dropping a valid image file on shot 1's image slot reads it as base64 and calls uploadStagedAutoReviewShotMedia with the correct payload", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    const dropZone = screen.getByTestId("staged-shot-image-drop-1");
    const file = new File(["fake-bytes"], "photo.png", { type: "image/png" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(mockUploadShotMediaMutateAsync).toHaveBeenCalledTimes(1)
    );
    const call = mockUploadShotMediaMutateAsync.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      shotId: 1,
      stage: "image",
      fileName: "photo.png",
      fileType: "image/png",
      expectedStateDigest: "digest-0",
    });
    expect(call.fileBase64).toMatch(/^data:image\/png;base64,/);
    expect(typeof call.idempotencyKey).toBe("string");
  });

  it("uploading via the tap-to-browse fallback input on the video slot calls the mutation with stage: video, independent of the image slot", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    const fileInput = screen.getByTestId(
      "staged-shot-video-file-input-1"
    ) as HTMLInputElement;
    const file = new File(["fake-video-bytes"], "clip.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockUploadShotMediaMutateAsync).toHaveBeenCalledTimes(1)
    );
    const call = mockUploadShotMediaMutateAsync.mock.calls[0][0];
    expect(call).toMatchObject({
      shotId: 1,
      stage: "video",
      fileName: "clip.mp4",
      fileType: "video/mp4",
    });
    expect(call.fileBase64).toMatch(/^data:video\/mp4;base64,/);
  });
});

describe("StagedCheckpointReviewSurface — per-shot pipeline buttons wiring", () => {
  // Prompt drafting stays a separate worker-backed action. Image and video
  // dispatch use a single-shot staged_bulk_generation request, so the job
  // can be queued independently and tracked after browser refresh.
  beforeEach(() => {
    mockGeneratePromptMutate.mockClear();
    mockGeneratePromptMutateAsync.mockClear();
    mockBulkGenerateMutate.mockClear();
    mockRetryMutate.mockClear();
    mockRetryMutateAsync.mockClear();
  });

  it("the plain 'สร้าง Prompt ภาพช็อตที่ 1' button calls generatePromptMutation.mutate with no instruction — never mutateAsync, never retryShotMutation", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockGeneratePromptMutate).toHaveBeenCalledTimes(1);
    const call = mockGeneratePromptMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      shotId: 1,
      stage: "image",
      expectedStateDigest: "digest-0",
    });
    expect(call.instruction).toBeUndefined();
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
  });

  it("creating a video prompt submits only the prompt-generation job, never a video-render job", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt วิดีโอช็อตที่ 1" })
    );
    expect(
      screen.getByTestId("staged-generation-confirmation-dialog").textContent
    ).toContain("สร้าง Prompt วิดีโอช็อตที่ 1");
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockGeneratePromptMutate).toHaveBeenCalledTimes(1);
    expect(mockGeneratePromptMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        shotId: 1,
        stage: "video",
        expectedStateDigest: "digest-0",
      })
    );
    expect(mockBulkGenerateMutate).not.toHaveBeenCalled();
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
  });

  it("uses and remembers the selected story LLM when generating a shot prompt", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.change(screen.getByLabelText("โมเดล LLM ร่างเรื่อง"), {
      target: { value: "test-story-llm" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockGeneratePromptMutate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-story-llm", stage: "image" })
    );
    expect(
      JSON.parse(localStorage.getItem(AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY) ?? "{}")
    ).toMatchObject({ storyPlanningModel: "test-story-llm" });
  });

  it("submitting the (relabeled) 'ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง' AI-instruction dialog forwards `instruction` into generatePromptMutation.mutate's payload", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
      })
    );
    fireEvent.change(screen.getByTestId("staged-ai-instruction-textarea"), {
      target: { value: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก" },
    });
    fireEvent.click(screen.getByTestId("staged-ai-instruction-submit"));
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockGeneratePromptMutate).toHaveBeenCalledTimes(1);
    const call = mockGeneratePromptMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      shotId: 1,
      stage: "image",
      expectedStateDigest: "digest-0",
      instruction: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก",
    });
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
    expect(mockRetryMutate).not.toHaveBeenCalled();
  });

  it("the 'สร้างภาพช็อตที่ 1' button queues a shot-scoped Worker Job using the saved prompt", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1);
    const call = mockBulkGenerateMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      expectedStateDigest: "digest-0",
      targets: [{ shotId: 1, stage: "image", replaceExisting: true }],
    });
    expect(screen.getByText(/กำลังส่งงานสร้างภาพช็อตที่ 1 เข้า Worker/)).toBeTruthy();
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
  });

  it("the 'สร้างวิดีโอช็อตที่ 1' button queues a shot-scoped Worker Job with the saved model", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างวิดีโอช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    expect(mockBulkGenerateMutate).toHaveBeenCalledTimes(1);
    const call = mockBulkGenerateMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      expectedStateDigest: "digest-0",
      targets: [{ shotId: 1, stage: "video", model: "veo3/generate-veo-3-video-lite", replaceExisting: true }],
    });
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
  });
});

/**
 * Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1, shot
 * 8): every action handler in StagedCheckpointReviewSurface used to
 * silently `return` when `stateDigest` was empty — a click that produced no
 * error, no toast, and no request reaching the server at all (confirmed via
 * server logs), which the user experienced as "the button does nothing."
 * Fixed by a shared `requireStateDigest()` guard that surfaces
 * `actionError` (rendered by the Panel as `role="alert"`) instead of
 * no-oping. This suite proves the fix for the split-out per-shot buttons
 * (prompt-only, dispatch-only) that replaced the former consolidated
 * generate-and-dispatch button, plus plain approve — confirming no mutation
 * is ever attempted in that state, on either handler `requireStateDigest()`
 * guards.
 */
describe("StagedCheckpointReviewSurface — missing stateDigest surfaces an error instead of silently no-oping", () => {
  beforeEach(() => {
    mockStateDigestOverride = { stateDigest: "" };
    // These are shared vi.fn() instances across the whole file (declared at
    // module scope) — clear call history from whatever ran in an earlier
    // describe block so `.not.toHaveBeenCalled()` below reflects only THIS
    // test's click, not stale counts from a preceding test.
    mockGeneratePromptMutate.mockClear();
    mockGeneratePromptMutateAsync.mockClear();
    mockRetryMutate.mockClear();
    mockRetryMutateAsync.mockClear();
  });
  afterEach(() => {
    mockStateDigestOverride = null;
  });

  it("clicking the dispatch-only generate-image button shows an actionable Thai message and calls no mutation (onRetry's requireStateDigest guard)", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "ระบบยังโหลดข้อมูลล่าสุดไม่เสร็จ"
      )
    );
    expect(mockRetryMutate).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
  });

  it("clicking the plain prompt-only generate-image button also surfaces the message instead of no-oping (onGeneratePrompt's requireStateDigest guard)", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
    );
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "ระบบยังโหลดข้อมูลล่าสุดไม่เสร็จ"
      )
    );
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockRetryMutate).not.toHaveBeenCalled();
  });

  it("clicking the AI-instruction generate-prompt-only path also surfaces the message instead of no-oping", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
      })
    );
    fireEvent.change(screen.getByTestId("staged-ai-instruction-textarea"), {
      target: { value: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก" },
    });
    fireEvent.click(screen.getByTestId("staged-ai-instruction-submit"));
    fireEvent.click(screen.getByTestId("staged-generation-confirm-submit"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "ระบบยังโหลดข้อมูลล่าสุดไม่เสร็จ"
      )
    );
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
  });
});

/**
 * The plain-Thai remap of user-actionable backend reason codes originally
 * lived inside `onGenerateAndDispatch`'s catch block. When the consolidated
 * one-click button was split back into separate "สร้าง Prompt" / "สร้างภาพ"
 * steps, no button reached that catch anymore and the dispatch-only video
 * button silently regressed to showing the raw code
 * ("staged_image_result_not_approved"). The remap now lives on the SHARED
 * `mutationOptions.onError` (`friendlyActionError`), so every mutation path
 * gets it. This suite pins that.
 */
describe("StagedCheckpointReviewSurface — friendly reason-code remap on the shared mutation onError", () => {
  it("replaces staged_image_result_not_approved with a plain-Thai explanation", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);
    expect(capturedRetryMutationOptions?.onError).toBeTypeOf("function");

    capturedRetryMutationOptions!.onError!({
      message: "staged_image_result_not_approved",
    });

    await waitFor(() => {
      const text = screen.getByRole("alert").textContent ?? "";
      expect(text).toContain("ยังไม่มีภาพที่อนุมัติแล้ว");
      expect(text).not.toContain("staged_image_result_not_approved");
    });
  });

  it("replaces staged_image_artifact_missing the same way", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);
    capturedRetryMutationOptions!.onError!({
      message: "staged_image_artifact_missing",
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "ยังไม่มีภาพที่อนุมัติแล้ว"
      )
    );
  });

  it("passes through any other error message unchanged (no over-eager rewriting)", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);
    // Deliberately a code with NO friendly mapping — `staged_state_drift`
    // can no longer be used here since it gained its own mapping (see the
    // dedicated test below).
    capturedRetryMutationOptions!.onError!({
      message: "staged_some_unmapped_backend_code",
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "staged_some_unmapped_backend_code"
      )
    );
  });

  /**
   * 2026-07-30 dead-button incident follow-ups: the dispatch buttons are no
   * longer disabled on client-derived preconditions, so the server's
   * rejection reason is now the ONLY thing the user sees. Each of these must
   * be plain Thai, never a raw code.
   */
  it.each([
    ["staged_image_prompt_missing", "ยังไม่มี Prompt ภาพ"],
    ["staged_video_prompt_missing", "ยังไม่มี Prompt วิดีโอ"],
    ["staged_media_task_in_flight", "กำลังสร้างอยู่แล้ว"],
    ["staged_state_drift", "ไม่ตรงกับเซิร์ฟเวอร์"],
  ])("maps %s to a plain-Thai explanation", async (code, expected) => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);
    capturedRetryMutationOptions!.onError!({ message: code });

    await waitFor(() => {
      const text = screen.getByRole("alert").textContent ?? "";
      expect(text).toContain(expected);
      expect(text).not.toContain(code);
    });
  });
});
