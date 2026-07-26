import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StagedCheckpointReviewPanel } from "../StagedCheckpointReviewPanel";

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
    onRetry: vi.fn(),
  };
}

describe("StagedCheckpointReviewPanel", () => {
  it("requires an explicit per-shot image approval and exposes the expected spend evidence", () => {
    const input = props();
    render(<StagedCheckpointReviewPanel {...input} />);
    expect(
      screen.getByText(
        "ตรวจเนื้อเรื่อง → ตรวจ Prompt ภาพ → Storyboard Review / ผลภาพ → ยืนยัน Prompt วิดีโอ → ตรวจผลวิดีโอ → ตรวจเสียง → ตรวจและยืนยันการประกอบ"
      )
    ).toBeTruthy();
    expect(screen.getByText("Checkpoint progress")).toBeTruthy();
    expect(screen.getByText("ถัดไป: Prompt ภาพ")).toBeTruthy();
    const approve = screen.getByRole("button", {
      name: "ยืนยันสร้างภาพช็อตที่ 1",
    });
    expect(approve).toBeTruthy();
    expect(input.onApprove).not.toHaveBeenCalled();
    fireEvent.click(approve);
    expect(input.onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: baseCheckpoint,
        expected: expect.objectContaining({
          contentHash: "prompt-hash",
          estimatedCredits: 3,
        }),
      })
    );
  });

  it("renders an image result acceptance action only when the image artifact checkpoint is awaiting", () => {
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
      screen.getByRole("button", { name: "ยอมรับผลภาพช็อตที่ 1" })
    ).toBeTruthy();
    expect(screen.getByAltText("ผลภาพช็อตที่ 1")).toHaveAttribute(
      "src",
      "/media/staged-image.png"
    );
  });

  it("exposes approve, reject, edit, and retry actions for every run-level checkpoint", () => {
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
      screen.getByRole("button", { name: "ยืนยันเนื้อเรื่อง" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ขอแก้เนื้อเรื่อง" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ร่างเนื้อเรื่องใหม่" })
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

  it("allows editing and retrying only the rejected image prompt for its shot", () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "สร้าง Prompt ภาพช็อตที่ 1 ใหม่" })
    );

    expect(input.onEdit).toHaveBeenCalledWith({
      shotId: 1,
      imagePrompt: "Prompt ภาพฉบับแก้ไขเฉพาะช็อตที่ 1",
    });
    expect(input.onRetry).toHaveBeenCalledWith({ shotId: 1, stage: "image" });
  });

  it("keeps retry available when only the video prompt was rejected", () => {
    const input = props();
    input.state = {
      ...input.state,
      shots: [
        {
          ...input.state.shots[0],
          imagePrompt: "ภาพที่ผ่านแล้ว",
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
      ],
    };
    render(<StagedCheckpointReviewPanel {...input} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "สร้าง Prompt วิดีโอช็อตที่ 1 ใหม่",
      })
    );
    expect(input.onRetry).toHaveBeenCalledWith({ shotId: 1, stage: "video" });
  });

  it("requires video result acceptance and exposes shot-local video repair", () => {
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
      screen.getByRole("button", { name: "ยอมรับผลวิดีโอช็อตที่ 1" })
    ).toBeTruthy();
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
});
