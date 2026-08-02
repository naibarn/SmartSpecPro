import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { StagedCheckpointReviewPanel } from "../StagedCheckpointReviewPanel";

// UI/UX/a11y audit fixes (two-character-conversation feature) — the "2
// characters added" nudge (A3) uses Sonner, same convention as the rest of
// this codebase (see CustomToolCreator.test.tsx for the established mock
// shape).
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Two-character-conversation feature (planning/marketplace-two-character-
// conversation/plan.md §3.7/§3.8) — the Panel now calls `useTenantFeatureFlag`
// directly (bypassing the mocked `trpc` client entirely, via raw
// `@tanstack/react-query`), same convention as `FeatureFlagGate.test.tsx`:
// mock the hook out so no real QueryClientProvider is needed. Every existing
// test in this file exercises the flag-off/no-VD-characters default, so a
// constant `false` return keeps their assertions byte-identical.
vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      listQualityPlanningModels: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      // Look families for the per-shot cast row
      // (`planning/marketplace-four-character-cast/plan.md` §6). Called
      // unconditionally like the others, so the shape must exist even though
      // it is `enabled: false` without a VD-sourced cast.
      listDramaCharactersForPicker: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
    media: {
      getModels: {
        useQuery: () => ({
          data: {
            models: [
              { id: "google-banana-2", name: "Google Banana 2", provider: "google" },
            ],
            defaults: { image: "google-banana-2", video: "veo3/generate-veo-3-video-lite" },
          },
          isLoading: false,
        }),
      },
    },
    // Stubbed even though `useTenantFeatureFlag` above always resolves the
    // gate to `false` (so this query stays effectively `enabled: false`) —
    // the Panel still calls the hook unconditionally, so the mocked client
    // needs the shape present or the call throws before `enabled` is ever
    // read.
    verticalDramaSeries: {
      list: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
  },
}));

const baseCheckpoint = {
  checkpointId: "image-prompt:run-1:shot-1:r1",
  kind: "image_prompt",
  shotId: 1,
  state: "awaiting",
  revision: 1,
  contentHash: "prompt-hash",
  estimatedCredits: 3,
  approvedModel: "google-banana-2",
  approvedProvider: "media-provider",
  approvedSafetyVerdict: "passed",
  approvedReferenceManifestHash: "refs-1",
};

function stateFixture() {
  return {
    stateDigest: "digest-1",
    outputMode: "full_video",
    planRevision: 1,
    planReview: { status: "awaiting", redraftCount: 0 },
    storyPlan: { title: "รีวิวแก้วน้ำ", storySummary: "เรื่องย่อ" },
    shots: [
      {
        shotId: 1,
        title: "เปิดเรื่อง",
        storySummary: "เปิดภาพสินค้า",
        dialogue: "สวัสดี",
        imagePrompt: "สร้างภาพสินค้า",
        videoPrompt: null,
        imageArtifactUrl: null,
        imageArtifactHash: null,
      },
    ],
    checkpoints: [baseCheckpoint],
  };
}

function props() {
  return {
    runId: "run-1",
    state: stateFixture(),
    onRefresh: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onGeneratePrompt: vi.fn(),
    onGenerateAndDispatch: vi.fn(),
    onRetry: vi.fn(),
    onUploadShotMedia: vi.fn().mockResolvedValue(undefined),
  };
}

describe("StagedCheckpointReviewPanel", () => {
  it("hides the per-shot image-prompt approve action (auto-approved server-side now) but keeps reject and prompt editing available", () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    expect(
      screen.getByText(
        "ตรวจเนื้อเรื่อง → ตรวจ Prompt ภาพ → Storyboard Review / ผลภาพ → ยืนยัน Prompt วิดีโอ → ตรวจผลวิดีโอ → ตรวจเสียง → ตรวจและยืนยันการประกอบ"
      )
    ).toBeTruthy();
    expect(screen.getByText("Checkpoint progress")).toBeTruthy();
    expect(screen.getByText("ถัดไป: Prompt ภาพ")).toBeTruthy();
    // image_prompt checkpoints now auto-approve at construction — neither
    // render site (the media placeholder or the "1 · Prompt ภาพ" action bar)
    // exposes an approve trigger for them anymore.
    expect(
      screen.queryByRole("button", { name: "ยืนยันสร้างภาพช็อตที่ 1" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "🎨 สั่งสร้างภาพช็อตที่ 1 ทันที" })
    ).toBeNull();
    expect(input.onApprove).not.toHaveBeenCalled();

    const reject = screen.getByRole("button", {
      name: "ขอแก้ Prompt ภาพช็อตที่ 1",
    });
    fireEvent.click(reject);
    expect(input.onReject).toHaveBeenCalledWith(baseCheckpoint);

    fireEvent.change(screen.getByLabelText("Prompt ภาพช็อตที่ 1"), {
      target: { value: "Prompt ภาพฉบับแก้ไข" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึก Prompt ภาพช็อตที่ 1" })
    );
    expect(input.onEdit).toHaveBeenCalledWith({
      shotId: 1,
      imagePrompt: "Prompt ภาพฉบับแก้ไข",
    });
  });

  it("no longer exposes an image-result approve action (auto-approved server-side now) but keeps reject and the artifact preview", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [
        {
          ...input.state.shots[0],
          imageArtifactUrl: "/media/staged-image.png",
          imageArtifactHash: "image-hash",
        },
      ],
      checkpoints: [
        { ...baseCheckpoint, state: "approved", consumed: true },
        {
          ...baseCheckpoint,
          checkpointId: "image-result:run-1:shot-1:r1",
          kind: "image_result",
          state: "awaiting",
          contentHash: "image-hash",
          estimatedCredits: 0,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);
    expect(
      screen.queryByRole("button", { name: "ยอมรับผลภาพช็อตที่ 1" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "✅ ยอมรับผลภาพช็อตที่ 1 (เปิดสร้างวิดีโอ)",
      })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "ปฏิเสธผลภาพช็อตที่ 1" })
    );
    expect(input.onReject).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image_result", shotId: 1 })
    );
    expect(screen.getByAltText("ผลภาพช็อตที่ 1")).toHaveAttribute(
      "src",
      "/media/staged-image.png"
    );
  });

  it("keeps the story approve action but hides approve for every other run-level checkpoint kind, leaving reject/edit/retry available", () => {
    const input = props();
    input.state = {
      ...input.state,
      storyPlan: { title: "รีวิวแก้วน้ำ", storySummary: "เรื่องย่อเดิม" },
      audioPlan: {
        text: "บทพูดเดิม",
        language: "th",
        model: "elevenlabs-tts",
        estimatedCredits: 2,
      },
      finalAssembly: {
        shotCount: 1,
        hasAudio: true,
        includeAudio: true,
        shots: [{ shotId: 1 }],
      },
      checkpoints: [
        {
          ...baseCheckpoint,
          kind: "story_plan",
          shotId: null,
          checkpointId: "story:run-1",
          state: "awaiting",
          estimatedCredits: 0,
        },
        {
          ...baseCheckpoint,
          kind: "image_prompt",
          checkpointId: "image:run-1",
          state: "awaiting",
        },
        {
          ...baseCheckpoint,
          kind: "image_result",
          checkpointId: "image-result:run-1",
          state: "awaiting",
          contentHash: "image-hash",
          estimatedCredits: 0,
        },
        {
          ...baseCheckpoint,
          kind: "video_prompt",
          checkpointId: "video:run-1",
          state: "awaiting",
          estimatedCredits: 4,
        },
        {
          ...baseCheckpoint,
          kind: "audio_plan",
          shotId: null,
          checkpointId: "audio:run-1",
          state: "awaiting",
          estimatedCredits: 2,
        },
        {
          ...baseCheckpoint,
          kind: "final_assembly",
          shotId: null,
          checkpointId: "final:run-1",
          state: "awaiting",
          estimatedCredits: 10,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);
    expect(
      screen.getByRole("button", { name: /ยืนยันเนื้อเรื่อง/ })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ขอแก้เนื้อเรื่อง" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /ร่างเนื้อเรื่องใหม่/ })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ขอแก้ Prompt ภาพช็อตที่ 1" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ปฏิเสธผลภาพช็อตที่ 1" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ขอแก้ Prompt วิดีโอช็อตที่ 1" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "ขอแก้แผนเสียง" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ขอแก้การประกอบ" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "สร้าง preview การประกอบใหม่" })
    ).toBeTruthy();
    // Every non-story kind above is "awaiting" in this fixture too, but none
    // of them expose an approve trigger anymore — only story_plan keeps its
    // manual gate.
    expect(
      screen.queryByRole("button", { name: "ยืนยันสร้างภาพช็อตที่ 1" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "ยอมรับผลภาพช็อตที่ 1" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "ยืนยันและสร้างวิดีโอช็อตที่ 1" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "ยืนยันเสียง" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "ยืนยันการประกอบ" })
    ).toBeNull();
  });

  it("keeps story and dialogue repair available after the story checkpoint was approved", () => {
    const input = props();
    input.state = {
      ...input.state,
      runStatus: "running",
      planReview: { status: "approved", redraftCount: 0 },
      checkpoints: [
        {
          ...baseCheckpoint,
          kind: "story_plan",
          shotId: null,
          checkpointId: "story:run-1:r1",
          state: "approved",
          estimatedCredits: 0,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    fireEvent.change(screen.getByLabelText("เรื่องราวช็อต"), {
      target: { value: "แก้ฉากเปิดเรื่องเฉพาะช็อตนี้" },
    });
    fireEvent.change(screen.getByLabelText("บทพูด"), {
      target: { value: "บทพูดใหม่เฉพาะช็อตนี้" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึกเรื่องและบทพูดช็อตที่ 1" })
    );

    expect(input.onEdit).toHaveBeenCalledWith({
      shotId: 1,
      storySummary: "แก้ฉากเปิดเรื่องเฉพาะช็อตนี้",
      dialogue: "บทพูดใหม่เฉพาะช็อตนี้",
    });
  });

  it("allows editing the rejected image prompt for its shot and dispatch-only generation (onRetry, current prompt) for it", () => {
    const input = props();
    input.state = {
      ...input.state,
      checkpoints: [
        {
          ...baseCheckpoint,
          state: "rejected",
          rejectionReasonCode: "user_requested_correction",
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    fireEvent.change(screen.getByLabelText("Prompt ภาพช็อตที่ 1"), {
      target: { value: "Prompt ภาพฉบับแก้ไขเฉพาะช็อตที่ 1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "บันทึก Prompt ภาพช็อตที่ 1" })
    );
    // Per the explicit user directive reversing the earlier one-click
    // consolidation, "สร้างภาพช็อตที่ 1" is now dispatch-only (onRetry, the
    // shot's CURRENT prompt) — it no longer rewrites the prompt itself via
    // onGenerateAndDispatch.
    fireEvent.click(
      screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
    );

    expect(input.onEdit).toHaveBeenCalledWith({
      shotId: 1,
      imagePrompt: "Prompt ภาพฉบับแก้ไขเฉพาะช็อตที่ 1",
    });
    expect(input.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: 1,
        stage: "image",
        autoApprove: true,
      })
    );
    expect(input.onGeneratePrompt).not.toHaveBeenCalled();
    expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
  });

  it("shows exactly one dispatch-only generate-image button for a stuck submission (no duplicate inside the placeholder) and wires it to onRetry", () => {
    const input = props();
    input.state = {
      ...input.state,
      // Approved (and consumed) but no artifact ever arrived: the "task
      // stuck" recovery path, not a content dispute — same prompt, just
      // needs resubmitting.
      checkpoints: [{ ...baseCheckpoint, state: "approved", consumed: true }],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    // Old behavior duplicated this button — one inside the image
    // placeholder ("🔄 รีเซ็ตและสร้างภาพช็อตที่ 1 ใหม่") and one in the action
    // bar below it. There must be exactly ONE, in the action bar, with the
    // "รีเซ็ทและ...ใหม่" wording dropped.
    expect(
      screen.queryByRole("button", {
        name: "🔄 รีเซ็ตและสร้างภาพช็อตที่ 1 ใหม่",
      })
    ).toBeNull();
    const generateButtons = screen.getAllByRole("button", {
      name: "สร้างภาพช็อตที่ 1",
    });
    expect(generateButtons).toHaveLength(1);
    // The placeholder still tells the user where to click, just without its
    // own button.
    expect(
      screen.getByText(/ระบบส่งงานสร้างภาพค้างอยู่/)
    ).toBeTruthy();

    fireEvent.click(generateButtons[0]);

    expect(input.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: 1,
        stage: "image",
        autoApprove: true,
      })
    );
    expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
  });

  it("dispatches the video generation (onRetry, current prompt) when the video prompt was rejected", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [
        {
          ...input.state.shots[0],
          imagePrompt: "ภาพที่ผ่านแล้ว",
          imageArtifactHash: "accepted-image-hash",
          videoPrompt: "วิดีโอที่ต้องแก้",
        },
      ],
      checkpoints: [
        {
          ...baseCheckpoint,
          kind: "video_prompt",
          checkpointId: "video-prompt:run-1:shot-1:r1",
          state: "rejected",
          estimatedCredits: 4,
        },
        {
          ...baseCheckpoint,
          kind: "image_result",
          checkpointId: "image-result:run-1:shot-1:r1",
          state: "approved",
          contentHash: "accepted-image-hash",
          estimatedCredits: 0,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    // The old separate "สร้าง Prompt วิดีโอ...ใหม่" (prompt-only) button is
    // gone from THIS spot (a plain "สร้าง Prompt วิดีโอ..." step-1 button now
    // lives here instead) — "สร้างวิดีโอช็อตที่ N" is dispatch-only.
    fireEvent.click(
      screen.getByRole("button", { name: "สร้างวิดีโอช็อตที่ 1" })
    );
    expect(input.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: 1,
        stage: "video",
        autoApprove: true,
      })
    );
    expect(input.onGeneratePrompt).not.toHaveBeenCalled();
    expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
  });

  it("renders the dispatch video-generate button even when the shot's image result isn't approved yet — the two buttons are fully independent, the backend enforces the image-first precondition", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [
        {
          ...input.state.shots[0],
          imagePrompt: "ภาพที่ยังไม่อนุมัติ",
          imageArtifactHash: null,
          videoPrompt: "วิดีโอพร้อมส่ง",
        },
      ],
      checkpoints: [
        {
          ...baseCheckpoint,
          kind: "video_prompt",
          checkpointId: "video-prompt:run-1:shot-1:r1",
          state: "approved",
          estimatedCredits: 4,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    const videoButton = screen.getByRole("button", {
      name: "สร้างวิดีโอช็อตที่ 1",
    });
    fireEvent.click(videoButton);
    expect(input.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: 1,
        stage: "video",
        autoApprove: true,
      })
    );
  });

  /**
   * 2026-07-30 dead-button incident: the generate-image button used to be
   * `disabled` whenever the client thought the shot had no prompt. Any
   * client/server mismatch then turned it into a silently dead button — the
   * user saw a prompt on screen, clicked, and nothing happened with no
   * error. The button must now ALWAYS be clickable; the hint stays as
   * guidance and the server is the authority (it rejects a promptless
   * dispatch with `staged_image_prompt_missing`, which the Surface maps to
   * a plain-Thai message).
   */
  it("keeps the dispatch-only generate-image button CLICKABLE even when the shot has no image prompt yet, showing the hint as guidance rather than a block", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [{ ...input.state.shots[0], imagePrompt: null }],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    const dispatchButton = screen.getByRole("button", {
      name: "สร้างภาพช็อตที่ 1",
    });
    // Never blocked — this is the whole point of the fix.
    expect(dispatchButton).not.toBeDisabled();
    // Guidance is still surfaced, both as a tooltip and as visible text.
    expect(dispatchButton).toHaveAttribute(
      "title",
      'แนะนำให้กด "สร้าง Prompt ภาพ" ก่อน'
    );
    expect(screen.getByText("สร้าง Prompt ภาพก่อน")).toBeTruthy();

    // Clicking actually reaches the handler instead of doing nothing.
    fireEvent.click(dispatchButton);
    expect(input.onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ shotId: 1, stage: "image" })
    );

    // The other two steps stay fully available regardless.
    expect(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
      })
    ).not.toBeDisabled();
  });

  /**
   * The root cause of the same incident: `props.pending` was a SINGLE
   * panel-wide flag, so one slow mutation disabled every button on all 9
   * shots — and the Surface's `onSuccess` awaits a refetch, so the flag
   * stayed raised even after the new prompt had rendered. Only the exact
   * running button may be disabled now.
   */
  it("with a mutation in flight, disables ONLY the button that is running — every other shot's buttons stay clickable", () => {
    const input = props();
    input.pending = true;
    input.pendingAction = "generate-prompt-image-1";
    render(<StagedCheckpointReviewPanel {...input} />);

    // The running button reports itself and is the only one blocked.
    const running = screen.getByRole("button", {
      name: "สร้าง Prompt ภาพช็อตที่ 1",
    });
    expect(running).toBeDisabled();
    expect(running.textContent).toContain("กำลังดำเนินการ");

    // Same shot's next step is NOT blocked by the prompt call.
    expect(
      screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
      })
    ).not.toBeDisabled();
  });

  it("no longer exposes a video-result approve action (auto-approved server-side now) but keeps reject and shot-local video repair", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [
        {
          ...input.state.shots[0],
          imageArtifactUrl: "/media/staged-image.png",
          imageArtifactHash: "image-hash",
          videoPrompt: "ขยับกล้องช้า ๆ",
          videoArtifactUrl: "/media/staged-video.mp4",
          videoArtifactHash: "video-hash",
        },
      ],
      checkpoints: [
        { ...baseCheckpoint, state: "approved", consumed: true },
        {
          ...baseCheckpoint,
          checkpointId: "image-result:run-1:shot-1:r1",
          kind: "image_result",
          state: "approved",
          contentHash: "image-hash",
          estimatedCredits: 0,
          consumed: true,
        },
        {
          ...baseCheckpoint,
          checkpointId: "video-prompt:run-1:shot-1:r1",
          kind: "video_prompt",
          state: "approved",
          contentHash: "video-prompt-hash",
          consumed: true,
          estimatedCredits: 4,
        },
        {
          ...baseCheckpoint,
          checkpointId: "video-result:run-1:shot-1:r1",
          kind: "video_result",
          state: "awaiting",
          contentHash: "video-hash",
          estimatedCredits: 0,
        },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);
    expect(
      screen.queryByRole("button", { name: "ยอมรับผลวิดีโอช็อตที่ 1" })
    ).toBeNull();
    expect(screen.getByLabelText("ผลวิดีโอช็อตที่ 1")).toHaveAttribute(
      "src",
      "/media/staged-video.mp4"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ปฏิเสธผลวิดีโอช็อตที่ 1" })
    );
    expect(input.onReject).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "video_result", shotId: 1 })
    );
  });

  it("renders the complete shot board with separate prompt editors and media slots", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: Array.from({ length: 9 }, (_, index) => ({
        shotId: index + 1,
        title: `ช็อต ${index + 1}`,
        state: "image_prompt_awaiting",
        storySummary: `เรื่องย่อช็อต ${index + 1}`,
        dialogue: `บทพูดช็อต ${index + 1}`,
        imagePrompt: `image prompt ${index + 1}`,
        videoPrompt: `video prompt ${index + 1}`,
        imageArtifactUrl: index === 0 ? "/media/shot-1.png" : null,
        videoArtifactUrl: index === 0 ? "/media/shot-1.mp4" : null,
      })),
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    expect(screen.getAllByText(/Shot 0[1-9]/)).toHaveLength(9);
    expect(
      screen.getAllByRole("textbox", { name: /Prompt ภาพช็อตที่/ })
    ).toHaveLength(9);
    expect(
      screen.getAllByRole("textbox", { name: /Prompt วิดีโอช็อตที่/ })
    ).toHaveLength(9);
    expect(screen.getByAltText("ผลภาพช็อตที่ 1")).toHaveAttribute(
      "src",
      "/media/shot-1.png"
    );
    expect(screen.getByLabelText("ผลวิดีโอช็อตที่ 1")).toHaveAttribute(
      "src",
      "/media/shot-1.mp4"
    );
    expect(
      screen.getAllByText("ภาพของช็อตนี้จะแสดงที่นี่หลังจากกดยืนยันสร้างภาพ")
    ).toHaveLength(8);
  });

  it("renders Character and Product reference image cards with drag and drop zones and selection checkboxes", () => {
    const input = props();
    input.state = {
      ...input.state,
      referenceManifest: [
        { index: 1, role: "character", url: "https://example.com/char.png", label: "พรีเซนเตอร์", active: true },
        { index: 2, role: "primary_product", url: "https://example.com/prod1.png", label: "สินค้าหลัก", active: true },
        { index: 3, role: "product_angle", url: "https://example.com/prod2.png", label: "มุมข้าง", active: false },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    expect(screen.getByText(/ภาพตัวละครอ้างอิง/)).toBeTruthy();
    expect(screen.getByText(/ภาพสินค้าอ้างอิง/)).toBeTruthy();
    expect(screen.getByText("ลากภาพตัวละครมาวางที่นี่ หรือคลิกเพื่อเพิ่ม")).toBeTruthy();
    expect(screen.getByText("ลากภาพสินค้ามาวางที่นี่ หรือคลิกเพื่อเพิ่ม")).toBeTruthy();
    // Character label now renders as an editable name input (falls back to
    // the legacy `label` value) rather than plain text — see the two-
    // character-conversation feature's per-card name field.
    expect(screen.getByDisplayValue("พรีเซนเตอร์")).toBeTruthy();
    expect(screen.getByText("สินค้าหลัก")).toBeTruthy();
    expect(screen.getByText("มุมข้าง")).toBeTruthy();
  });

  it("keeps both edits when two reference checkboxes are toggled before the server round-trip reflects the first one", () => {
    const input = props();
    input.onUpdateReferenceManifest = vi.fn();
    input.state = {
      ...input.state,
      referenceManifest: [
        { index: 1, role: "primary_product", url: "https://example.com/prod1.png", label: "สินค้าหลัก", active: true },
        { index: 2, role: "product_angle", url: "https://example.com/prod2.png", label: "มุมข้าง", active: false },
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    // Real usage never re-renders with fresh props between two quick clicks
    // — the mutation + refetch round-trip takes longer than a click. Firing
    // both without updating input.state in between reproduces that.
    fireEvent.click(screen.getByRole("checkbox", { name: "สินค้าหลัก" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "มุมข้าง" }));

    expect(input.onUpdateReferenceManifest).toHaveBeenCalledTimes(2);
    const lastCall =
      input.onUpdateReferenceManifest.mock.calls[
        input.onUpdateReferenceManifest.mock.calls.length - 1
      ][0];
    expect(lastCall.find((item: any) => item.label === "สินค้าหลัก").active).toBe(
      false
    );
    expect(lastCall.find((item: any) => item.label === "มุมข้าง").active).toBe(
      true
    );
  });

  it("shows the reference manifest once the query resolves, even though state is still undefined on first mount", () => {
    const input = props();
    // Mirrors real usage: the Surface passes `state={stateQuery.data}` and
    // `loading={stateQuery.isLoading}` — state is undefined until the query
    // resolves, never a pre-populated object.
    input.state = undefined as any;
    (input as any).loading = true;
    const { rerender } = render(<StagedCheckpointReviewPanel {...input} />);

    expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลด");

    const loaded = {
      ...stateFixture(),
      referenceManifest: [
        { index: 1, role: "character", url: "https://example.com/char.png", label: "พรีเซนเตอร์", active: true },
        { index: 2, role: "primary_product", url: "https://example.com/prod1.png", label: "สินค้าหลัก", active: true },
      ],
    };
    rerender(<StagedCheckpointReviewPanel {...input} state={loaded} loading={false} />);

    // Character label now renders as an editable name input (falls back to
    // the legacy `label` value) rather than plain text — see the two-
    // character-conversation feature's per-card name field.
    expect(screen.getByDisplayValue("พรีเซนเตอร์")).toBeTruthy();
    expect(screen.getByText("สินค้าหลัก")).toBeTruthy();
  });

  describe("per-shot pipeline steps split back into 3 explicit actions (reverses the earlier one-click consolidation)", () => {
    it("the plain 'สร้าง Prompt ภาพช็อตที่ N' button calls onGeneratePrompt with no instruction, and never onGenerateAndDispatch/onRetry", () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1" })
      );

      expect(input.onGeneratePrompt).toHaveBeenCalledTimes(1);
      expect(input.onGeneratePrompt).toHaveBeenCalledWith({
        shotId: 1,
        stage: "image",
      });
      expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
      expect(input.onRetry).not.toHaveBeenCalled();
    });

    it("the dispatch-only 'สร้างภาพช็อตที่ N' button calls onRetry (current prompt), not onGeneratePrompt/onGenerateAndDispatch", () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", { name: "สร้างภาพช็อตที่ 1" })
      );

      expect(input.onRetry).toHaveBeenCalledTimes(1);
      const call = input.onRetry.mock.calls[0][0];
      expect(call).toMatchObject({
        shotId: 1,
        stage: "image",
        autoApprove: true,
      });
      expect(input.onGeneratePrompt).not.toHaveBeenCalled();
      expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
    });

    it("opening the AI-instruction dialog (now labeled 'ปรับปรุง Prompt...'), typing an instruction, and submitting calls onGeneratePrompt with the instruction text included", () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
        })
      );

      const textarea = screen.getByTestId("staged-ai-instruction-textarea");
      fireEvent.change(textarea, {
        target: { value: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก" },
      });
      fireEvent.click(screen.getByTestId("staged-ai-instruction-submit"));

      expect(input.onGeneratePrompt).toHaveBeenCalledTimes(1);
      expect(input.onGeneratePrompt).toHaveBeenCalledWith({
        shotId: 1,
        stage: "image",
        instruction: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก",
      });

      // Dialog closes after submit.
      expect(
        screen.queryByTestId("staged-ai-instruction-textarea")
      ).toBeNull();
    });

    it("clicking an example chip appends it to the instruction textarea instead of replacing it", () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "ปรับปรุง Prompt ภาพช็อตที่ 1 ด้วยคำสั่ง",
        })
      );
      fireEvent.click(screen.getByTestId("staged-ai-instruction-example-0"));

      const textarea = screen.getByTestId(
        "staged-ai-instruction-textarea"
      ) as HTMLTextAreaElement;
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    it("video section: the plain 'สร้าง Prompt วิดีโอช็อตที่ N' and relabeled 'ปรับปรุง Prompt วิดีโอ...' instruction buttons both call onGeneratePrompt (stage: video), gated on the image already being approved", () => {
      const input = props();
      input.state = {
        ...input.state,
        shots: [
          {
            ...input.state.shots[0],
            imageArtifactHash: "accepted-image-hash",
            videoPrompt: "ขยับกล้องช้า ๆ",
          },
        ],
        checkpoints: [
          { ...baseCheckpoint, state: "approved", consumed: true },
          {
            ...baseCheckpoint,
            checkpointId: "image-result:run-1:shot-1:r1",
            kind: "image_result",
            state: "approved",
            contentHash: "accepted-image-hash",
            estimatedCredits: 0,
            consumed: true,
          },
          {
            ...baseCheckpoint,
            checkpointId: "video-prompt:run-1:shot-1:r1",
            kind: "video_prompt",
            state: "approved",
            contentHash: "video-prompt-hash",
            estimatedCredits: 4,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", { name: "สร้าง Prompt วิดีโอช็อตที่ 1" })
      );
      expect(input.onGeneratePrompt).toHaveBeenCalledWith({
        shotId: 1,
        stage: "video",
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "ปรับปรุง Prompt วิดีโอช็อตที่ 1 ด้วยคำสั่ง",
        })
      );
      expect(
        screen.getByTestId("staged-ai-instruction-textarea")
      ).toBeTruthy();

      expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
      expect(input.onRetry).not.toHaveBeenCalled();
    });

    it("video section: the dispatch-only 'สร้างวิดีโอช็อตที่ N' button calls onRetry (current prompt, stage: video)", () => {
      const input = props();
      input.state = {
        ...input.state,
        shots: [
          { ...input.state.shots[0], videoPrompt: "ขยับกล้องช้า ๆ" },
        ],
        checkpoints: [
          {
            ...baseCheckpoint,
            kind: "video_prompt",
            checkpointId: "video-prompt:run-1:shot-1:r1",
            state: "approved",
            estimatedCredits: 4,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      fireEvent.click(
        screen.getByRole("button", { name: "สร้างวิดีโอช็อตที่ 1" })
      );

      expect(input.onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          shotId: 1,
          stage: "video",
          autoApprove: true,
        })
      );
      expect(input.onGeneratePrompt).not.toHaveBeenCalled();
      expect(input.onGenerateAndDispatch).not.toHaveBeenCalled();
    });
  });

  describe("bulk generate (replaces the old approve-all-images/approve-all-videos buttons)", () => {
    it("renders one bulk action covering every shot missing a result and calls onBulkGenerate once with the full target list", () => {
      const input = props();
      input.onBulkGenerate = vi.fn();
      input.state = {
        ...input.state,
        outputMode: "full_video",
        shots: [
          { ...input.state.shots[0], shotId: 1, imageArtifactUrl: null },
          {
            ...input.state.shots[0],
            shotId: 2,
            imageArtifactUrl: "/media/shot-2.png",
            imageArtifactHash: "shot-2-hash",
            videoArtifactUrl: null,
          },
        ],
        checkpoints: [],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      const bulkButton = screen.getByRole("button", {
        name: "⚡ สั่งสร้างทุกช็อตที่ยังไม่มีผลลัพธ์ (2 ช็อต)",
      });
      expect(input.onBulkGenerate).not.toHaveBeenCalled();
      fireEvent.click(bulkButton);

      // One call with the whole list — never one call per shot (that
      // forEach-of-onApprove pattern is exactly the bug this replaces).
      expect(input.onBulkGenerate).toHaveBeenCalledTimes(1);
      expect(input.onBulkGenerate).toHaveBeenCalledWith([
        expect.objectContaining({ shotId: 1, stage: "image" }),
        expect.objectContaining({ shotId: 2, stage: "video" }),
      ]);
    });

    it("does not render the bulk action once every shot already has its required result", () => {
      const input = props();
      input.onBulkGenerate = vi.fn();
      input.state = {
        ...input.state,
        outputMode: "storyboard_images",
        shots: [
          { ...input.state.shots[0], imageArtifactUrl: "/media/shot-1.png" },
        ],
        checkpoints: [],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(
        screen.queryByRole("button", {
          name: /สั่งสร้างทุกช็อตที่ยังไม่มีผลลัพธ์/,
        })
      ).toBeNull();
    });

    it("does not render the bulk action when onBulkGenerate is not provided", () => {
      const input = props();
      // input.onBulkGenerate intentionally left unset — the base props()
      // fixture's single shot has no imageArtifactUrl, so there would
      // otherwise be a target for it.
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(
        screen.queryByRole("button", {
          name: /สั่งสร้างทุกช็อตที่ยังไม่มีผลลัพธ์/,
        })
      ).toBeNull();
    });
  });

  describe("manual shot media upload (drag-and-drop / tap-to-browse replacement)", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function oversizedFile(name: string, type: string, bytes: number) {
      const file = new File(["x"], name, { type });
      Object.defineProperty(file, "size", { value: bytes });
      return file;
    }

    it("dropping a valid image file on an EMPTY image slot calls onUploadShotMedia with the correct shotId/stage", async () => {
      const input = props();
      // base fixture's shot 1 has imageArtifactUrl: null already.
      render(<StagedCheckpointReviewPanel {...input} />);

      const dropZone = screen.getByTestId("staged-shot-image-drop-1");
      const file = new File(["fake-image-bytes"], "photo.png", {
        type: "image/png",
      });
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      await waitFor(() =>
        expect(input.onUploadShotMedia).toHaveBeenCalledWith({
          shotId: 1,
          stage: "image",
          file,
        })
      );
    });

    it("dropping a valid image file on a slot that ALREADY has an image also works (replace case)", async () => {
      const input = props();
      input.state = {
        ...input.state,
        shots: [
          {
            ...input.state.shots[0],
            imageArtifactUrl: "/media/existing-shot-1.png",
            imageArtifactHash: "existing-hash",
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      // Sanity check: the slot really is in the "has artifact" branch.
      expect(screen.getByAltText("ผลภาพช็อตที่ 1")).toHaveAttribute(
        "src",
        "/media/existing-shot-1.png"
      );

      const dropZone = screen.getByTestId("staged-shot-image-drop-1");
      const file = new File(["replacement-bytes"], "replacement.jpg", {
        type: "image/jpeg",
      });
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      await waitFor(() =>
        expect(input.onUploadShotMedia).toHaveBeenCalledWith({
          shotId: 1,
          stage: "image",
          file,
        })
      );
    });

    it("rejects a wrong-type file client-side with a clear Thai message and never calls the mutation", async () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      const dropZone = screen.getByTestId("staged-shot-image-drop-1");
      const file = new File(["not an image"], "notes.txt", {
        type: "text/plain",
      });
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain(
          "ไม่ใช่ไฟล์ภาพ"
        )
      );
      expect(input.onUploadShotMedia).not.toHaveBeenCalled();
    });

    it("rejects an oversized image file client-side with a clear Thai message and never calls the mutation", async () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      const dropZone = screen.getByTestId("staged-shot-image-drop-1");
      const file = oversizedFile(
        "huge.png",
        "image/png",
        21 * 1024 * 1024 // over the 20MB image ceiling
      );
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain("ใหญ่เกินไป")
      );
      expect(input.onUploadShotMedia).not.toHaveBeenCalled();
    });

    it("the tap-to-browse hidden file input exists and firing a change event on it also calls the mutation", async () => {
      const input = props();
      render(<StagedCheckpointReviewPanel {...input} />);

      // The always-visible fallback button for tablets/unreliable OS drag.
      expect(
        screen.getByRole("button", {
          name: "อัปโหลดไฟล์แทนที่ภาพช็อตที่ 1",
        })
      ).toBeTruthy();

      const fileInput = screen.getByTestId(
        "staged-shot-image-file-input-1"
      ) as HTMLInputElement;
      const file = new File(["tap-to-browse-bytes"], "browsed.png", {
        type: "image/png",
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() =>
        expect(input.onUploadShotMedia).toHaveBeenCalledWith({
          shotId: 1,
          stage: "image",
          file,
        })
      );
    });

    it("the video slot's upload is fully independent of the image slot's — uploading one never touches the other's state or mutation calls", async () => {
      const input = props();
      const pendingImageUpload = deferred<void>();
      input.onUploadShotMedia = vi.fn(({ stage }) =>
        stage === "image" ? pendingImageUpload.promise : Promise.resolve()
      );
      render(<StagedCheckpointReviewPanel {...input} />);

      const imageDrop = screen.getByTestId("staged-shot-image-drop-1");
      const videoDrop = screen.getByTestId("staged-shot-video-drop-1");
      expect(imageDrop).toHaveAttribute("aria-busy", "false");
      expect(videoDrop).toHaveAttribute("aria-busy", "false");

      const imageFile = new File(["img"], "shot.png", { type: "image/png" });
      fireEvent.drop(imageDrop, { dataTransfer: { files: [imageFile] } });

      await waitFor(() => expect(imageDrop).toHaveAttribute("aria-busy", "true"));
      // The video slot stays completely unaffected while the image upload
      // for the SAME shot is still in flight.
      expect(videoDrop).toHaveAttribute("aria-busy", "false");
      expect(input.onUploadShotMedia).toHaveBeenCalledTimes(1);
      expect(input.onUploadShotMedia).toHaveBeenCalledWith(
        expect.objectContaining({ stage: "image" })
      );

      const videoFile = new File(["vid"], "shot.mp4", { type: "video/mp4" });
      fireEvent.drop(videoDrop, { dataTransfer: { files: [videoFile] } });

      await waitFor(() =>
        expect(input.onUploadShotMedia).toHaveBeenCalledTimes(2)
      );
      expect(input.onUploadShotMedia).toHaveBeenLastCalledWith({
        shotId: 1,
        stage: "video",
        file: videoFile,
      });
      // The still-pending image upload is untouched by the video drop.
      expect(imageDrop).toHaveAttribute("aria-busy", "true");

      pendingImageUpload.resolve();
      await waitFor(() =>
        expect(imageDrop).toHaveAttribute("aria-busy", "false")
      );
    });
  });

  describe("two-character-conversation UI/UX/a11y audit fixes", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("warns inline on an uploaded character card with no name once conversation mode is active (2 characters)", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "",
            active: true,
          },
          {
            index: 2,
            role: "character",
            url: "https://example.com/char2.png",
            label: "ชื่อสอง",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      // Only the blank-named card gets the warning — the other, named card
      // does not.
      expect(
        screen.getAllByText(/ยังไม่ได้ตั้งชื่อ/)
      ).toHaveLength(1);
    });

    it("does not warn about a missing name while only 1 character is active (not conversation mode yet)", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(screen.queryByText(/ยังไม่ได้ตั้งชื่อ/)).toBeNull();
    });

    /* Copy updated by `planning/marketplace-four-character-cast/plan.md` P1:
       with a 4-person roster the nudge is about a duplicated LEAD role, not
       "both characters" — any number of `support` entries is fine. */
    it("shows a role-conflict warning when two characters share the same LEAD role", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "หนึ่ง",
            characterRole: "host",
            active: true,
          },
          {
            index: 2,
            role: "character",
            url: "https://example.com/char2.png",
            label: "สอง",
            characterRole: "host",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(
        screen.getByText(/ถือบทบาทหลักเดียวกัน/)
      ).toBeTruthy();
    });

    it("does NOT warn when several characters share the support role — that is the normal 4-person shape", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "หนึ่ง",
            characterRole: "host",
            active: true,
          },
          {
            index: 2,
            role: "character",
            url: "https://example.com/char2.png",
            label: "สอง",
            characterRole: "guest",
            active: true,
          },
          {
            index: 3,
            role: "character",
            url: "https://example.com/char3.png",
            label: "สาม",
            characterRole: "support",
            active: true,
          },
          {
            index: 4,
            role: "character",
            url: "https://example.com/char4.png",
            label: "สี่",
            characterRole: "support",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(screen.queryByText(/ถือบทบาทหลักเดียวกัน/)).toBeNull();
      // Four characters is the cap, so the "roster full" notice shows.
      expect(screen.getByText(/ตัวละครครบ 4 คนแล้ว/)).toBeTruthy();
      // ...and two supporting characters never make it a conversation on
      // their own — the badge still reports the two LEADS.
      expect(screen.getByText(/\+ ตัวประกอบ 2/)).toBeTruthy();
    });

    it("does not warn about role conflict when the two active characters have different roles", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "หนึ่ง",
            characterRole: "host",
            active: true,
          },
          {
            index: 2,
            role: "character",
            url: "https://example.com/char2.png",
            label: "สอง",
            characterRole: "guest",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(
        screen.queryByText(/ตัวละครทั้งสองมีบทบาทเดียวกัน/)
      ).toBeNull();
    });

    it("toasts exactly once when uploading crosses the 0/1 → 2 active-character threshold, and never re-toasts on a later re-render of the same instance", async () => {
      const input = props();
      const { rerender } = render(<StagedCheckpointReviewPanel {...input} />);

      expect(toast.success).not.toHaveBeenCalled();

      const fileInput = screen.getByLabelText("อัปโหลดภาพตัวละคร");
      const file1 = new File(["a"], "char1.png", { type: "image/png" });
      const file2 = new File(["b"], "char2.png", { type: "image/png" });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledTimes(1)
      );
      expect(toast.success).toHaveBeenCalledWith(
        "เพิ่ม 2 ตัวละครแล้ว — ระบบจะสร้างบทสนทนา 2 คนโดยอัตโนมัติ"
      );

      // A later, unrelated re-render of the SAME instance (e.g. a
      // pendingAction flip) must not fire the toast again.
      rerender(<StagedCheckpointReviewPanel {...input} pendingAction="refresh" />);
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it("does not toast on initial mount of a run that already has 2 characters saved", () => {
      const input = props();
      input.state = {
        ...input.state,
        referenceManifest: [
          {
            index: 1,
            role: "character",
            url: "https://example.com/char1.png",
            label: "หนึ่ง",
            active: true,
          },
          {
            index: 2,
            role: "character",
            url: "https://example.com/char2.png",
            label: "สอง",
            active: true,
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(toast.success).not.toHaveBeenCalled();
    });

    it("renders adherenceWarnings on the story_plan checkpoint as an informational (non-blocking) list", () => {
      const input = props();
      input.state = {
        ...input.state,
        checkpoints: [
          {
            ...baseCheckpoint,
            kind: "story_plan",
            shotId: null,
            checkpointId: "story:run-1",
            state: "awaiting",
            estimatedCredits: 0,
            adherenceWarnings: [
              "staged_tone_not_adhered",
              "staged_conversation_turns_missing",
            ],
          },
        ],
      };
      render(<StagedCheckpointReviewPanel {...input} />);

      expect(
        screen.getByText("บทพูดอาจไม่สะท้อนโทนที่เลือกไว้ชัดเจนพอ")
      ).toBeTruthy();
      expect(
        screen.getByText("บางช็อตอาจมีบทสนทนาสองคนไม่ครบ")
      ).toBeTruthy();
      // The approve action stays available — this QC is fail-open/advisory.
      expect(
        screen.getByRole("button", { name: /ยืนยันเนื้อเรื่อง/ })
      ).toBeTruthy();
    });
  });

  // Marketplace flexible-shots-and-creation-casting (planning/marketplace-
  // flexible-shots-and-creation-casting/plan.md, W3) — the staged pipeline's
  // shot count is now variable (7-30); the final-order editor must validate
  // against the run's ACTUAL shot count, never a hardcoded 9.
  describe("final shot order validation (flexible shot count)", () => {
    function twelveShotState() {
      const shots = Array.from({ length: 12 }, (_, index) => ({
        shotId: index + 1,
        title: `ช็อต ${index + 1}`,
        storySummary: `เนื้อหาช็อต ${index + 1}`,
        dialogue: "",
        imagePrompt: "",
        videoPrompt: null,
        imageArtifactUrl: null,
        imageArtifactHash: null,
      }));
      return {
        stateDigest: "digest-12",
        outputMode: "full_video",
        planRevision: 1,
        planReview: { status: "approved", redraftCount: 0 },
        storyPlan: { title: "รีวิว 12 ช็อต", storySummary: "เรื่องย่อ" },
        finalAssembly: {
          shotCount: 12,
          hasAudio: false,
          includeAudio: false,
          shots: shots.map(shot => ({ shotId: shot.shotId })),
        },
        shots,
        checkpoints: [
          {
            ...baseCheckpoint,
            kind: "final_assembly",
            shotId: null,
            checkpointId: "final:run-1",
            state: "awaiting",
            estimatedCredits: 10,
          },
        ],
      };
    }

    it("accepts a full 1..12 permutation as valid (no warning) on a 12-shot run", () => {
      const input = props();
      input.state = twelveShotState();
      render(<StagedCheckpointReviewPanel {...input} />);

      const orderInput = screen.getByLabelText("ลำดับช็อต (เช่น 1,2,3)");
      fireEvent.change(orderInput, {
        target: { value: "12,11,10,9,8,7,6,5,4,3,2,1" },
      });

      expect(
        screen.queryByText(/ลำดับต้องมีช็อต 1–\d+/)
      ).toBeNull();
    });

    it("rejects a 9-value order on a 12-shot run and reports the 1–12 range (not the old 1–9)", () => {
      const input = props();
      input.state = twelveShotState();
      render(<StagedCheckpointReviewPanel {...input} />);

      const orderInput = screen.getByLabelText("ลำดับช็อต (เช่น 1,2,3)");
      fireEvent.change(orderInput, {
        target: { value: "1,2,3,4,5,6,7,8,9" },
      });

      expect(
        screen.getByText("ลำดับต้องมีช็อต 1–12 ครบทุกหมายเลขและห้ามซ้ำ")
      ).toBeTruthy();
    });
  });
});
