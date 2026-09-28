import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1, shot
// 8) regression coverage: lets one test simulate `stateDigest` being empty
// (state query hasn't produced data yet) without a separate mock module.
// Reset to `null` (no override, plain `stateFixture()` wins) after each test.
let mockStateDigestOverride: Record<string, unknown> | null = null;

// Controllable mutateAsync for generateStagedAutoReviewShotPrompt — backs
// StagedCheckpointReviewSurface's onGenerateAndDispatch (the former
// consolidated "สร้างภาพ/สร้างวิดีโอ" one-click chain). No per-shot button
// reaches this anymore after the consolidation was reversed back into 3
// explicit steps (see the "per-shot pipeline buttons wiring" describe block
// below) — kept only because the Surface still defines onGenerateAndDispatch
// and its mocked mutation shape needs a mutateAsync to satisfy the type.
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

// Plain (non-async) `.mutate` for retryStagedAutoReviewShot — this is what
// the per-shot dispatch-only "สร้างภาพ/วิดีโอช็อตที่ N" buttons actually call
// via onRetry now (see StagedCheckpointReviewSurface's onRetry, which calls
// `retryShotMutation.mutate`, never `.mutateAsync`) after the consolidated
// one-click button was split back into 3 explicit steps. Declared at module
// scope (like mockGeneratePromptMutate below) so it survives re-renders.
const mockRetryMutate = vi.fn();

// Set by the retryStagedAutoReviewShot mock below on every render — lets a
// test call the Surface's shared `mutationOptions.onError` directly.
let capturedRetryMutationOptions: {
  onError?: (e: { message: string }) => void;
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
        // Non-null so the dispatch-only "สร้างวิดีโอช็อตที่ 1" button (only
        // enabled once the shot actually has a prompt to dispatch with) is
        // enabled by default in this fixture.
        videoPrompt: "วิดีโอพร้อมส่งช็อต 1",
        imageArtifactUrl: null,
        imageArtifactHash: null,
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
      // Present so the dispatch-only "สร้างวิดีโอช็อตที่ 1" button has a
      // video_prompt checkpoint to key off of (its render gate is
      // `videoCheckpoint && !isTaskInFlight`, same pattern as the image
      // button) — otherwise the button wouldn't render at all in this
      // fixture and the wiring tests below would have nothing to click.
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
          data: { ...stateFixture(), ...(mockStateDigestOverride ?? {}) },
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
      redraftStagedAutoReviewPlan: { useMutation: () => genericMutation() },
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
        useQuery: () => ({ data: [], isLoading: false }),
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

describe("StagedCheckpointReviewSurface — bulk generate digest chaining", () => {
  it("awaits each shot's retry one at a time and threads the FRESH response digest into the next call, never a stale shared digest", async () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    const bulkButton = screen.getByRole("button", {
      name: "⚡ สั่งสร้างทุกช็อตที่ยังไม่มีผลลัพธ์ (2 ช็อต)",
    });
    fireEvent.click(bulkButton);

    await waitFor(() =>
      expect(mockRetryMutateAsync).toHaveBeenCalledTimes(2)
    );

    const [firstCall] = mockRetryMutateAsync.mock.calls[0];
    const [secondCall] = mockRetryMutateAsync.mock.calls[1];

    // Sequential, not concurrent: shot 1 is dispatched before shot 2, and
    // the first call still uses the digest the query originally loaded.
    expect(firstCall).toMatchObject({
      shotId: 1,
      stage: "image",
      expectedStateDigest: "digest-0",
    });

    // The critical regression assertion — the second call must use the
    // digest the FIRST call's response just returned
    // ("digest-after-shot-1"), never the pre-loop "digest-0" and never a
    // value recomputed some other way. Reusing one shared digest across
    // both calls is exactly the bug the old approve-all-images/videos
    // buttons had (only the first of a batch would land; every other call
    // would 409 with staged_state_drift).
    expect(secondCall).toMatchObject({
      shotId: 2,
      stage: "image",
      expectedStateDigest: "digest-after-shot-1",
    });
    expect(secondCall.expectedStateDigest).not.toBe(
      firstCall.expectedStateDigest
    );
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

describe("StagedCheckpointReviewSurface — per-shot pipeline buttons wiring (prompt-only / instruction / dispatch-only, post consolidation-reversal)", () => {
  // Per an explicit user directive, the former one-click "สร้างภาพ/วิดีโอช็อตที่
  // N" consolidation (writes a fresh prompt then immediately dispatches
  // generation, via onGenerateAndDispatch's generatePromptMutation.mutateAsync
  // → retryShotMutation.mutateAsync chain) has been reversed back into 3
  // separate, explicit steps per stage: a prompt-only button
  // (generatePromptMutation.mutate, no instruction), the existing
  // AI-instruction dialog (generatePromptMutation.mutate, with instruction —
  // relabeled from "AI ปรับแต่ง..." to "ปรับปรุง...ด้วยคำสั่ง" but otherwise
  // unchanged), and a dispatch-only button (retryShotMutation.mutate via
  // onRetry, using the CURRENT prompt, never rewriting it). No per-shot
  // button reaches onGenerateAndDispatch's mutateAsync chain anymore.
  beforeEach(() => {
    mockGeneratePromptMutate.mockClear();
    mockGeneratePromptMutateAsync.mockClear();
    mockRetryMutate.mockClear();
    mockRetryMutateAsync.mockClear();
  });

  it("the plain 'สร้าง Prompt ภาพช็อตที่ 1' button calls generatePromptMutation.mutate with no instruction — never mutateAsync, never retryShotMutation", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
    );

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

  it("the dispatch-only 'สร้างภาพช็อตที่ 1' button calls retryShotMutation.mutate DIRECTLY with the current (pre-click) digest — never the generate-prompt-then-dispatch mutateAsync chain", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
    );

    expect(mockRetryMutate).toHaveBeenCalledTimes(1);
    const call = mockRetryMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      shotId: 1,
      stage: "image",
      autoApprove: true,
      expectedStateDigest: "digest-0",
    });
    // Neither generate-prompt mutation fires — this is dispatch-only,
    // reusing the shot's already-approved prompt.
    expect(mockGeneratePromptMutate).not.toHaveBeenCalled();
    expect(mockGeneratePromptMutateAsync).not.toHaveBeenCalled();
    expect(mockRetryMutateAsync).not.toHaveBeenCalled();
  });

  it("the dispatch-only 'สร้างวิดีโอช็อตที่ 1' button calls retryShotMutation.mutate directly with stage: video", () => {
    render(<StagedCheckpointReviewSurface runId="run-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "สร้างวิดีโอช็อตที่ 1" })
    );

    expect(mockRetryMutate).toHaveBeenCalledTimes(1);
    const call = mockRetryMutate.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      shotId: 1,
      stage: "video",
      autoApprove: true,
      expectedStateDigest: "digest-0",
    });
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
