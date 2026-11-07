/**
 * `planning/vd-remotion-render-option/plan.md` wave 2 coverage for
 * `VerticalDramaStoryboardPanel.tsx`'s whole-episode compiled-video card:
 * a small "Remotion" outline badge shows next to the compiled video result
 * whenever `compiledVideo.renderEngine === "remotion_queue"`, and no badge
 * shows for the ffmpeg default (absent/`"ffmpeg"`). Mirrors
 * `VerticalDramaStoryboardPanel.modelFamilyBadge.test.tsx`'s minimal
 * render/screen convention.
 */
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    onAssembleCompiledVideo: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — Remotion render badge (planning/vd-remotion-render-option/plan.md wave 2)", () => {
  it("shows the Remotion badge when compiledVideo.renderEngine is 'remotion_queue'", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
            renderEngine: "remotion_queue",
          },
        }) as any)}
      />
    );
    const badge = await screen.findByTestId(
      "vd-compiled-video-remotion-badge"
    );
    expect(badge).toHaveTextContent("Remotion");
  });

  it("shows no Remotion badge when renderEngine is 'ffmpeg'", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
            renderEngine: "ffmpeg",
          },
        }) as any)}
      />
    );
    await screen.findByTestId("vd-compiled-video-download");
    expect(
      screen.queryByTestId("vd-compiled-video-remotion-badge")
    ).not.toBeInTheDocument();
  });

  it("shows no Remotion badge when renderEngine is absent (legacy compiled video)", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
          },
        }) as any)}
      />
    );
    await screen.findByTestId("vd-compiled-video-download");
    expect(
      screen.queryByTestId("vd-compiled-video-remotion-badge")
    ).not.toBeInTheDocument();
  });

  it("labels partial output from its stored canonical missing-shot list", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/partial.mp4",
            shotCount: 1,
            assemblyCompleteness: {
              expectedShotNumbers: [1, 9],
              includedShotNumbers: [1],
              missingShotNumbers: [9],
              partial: true,
            },
          },
        }) as any)}
      />
    );

    expect(
      await screen.findByTestId("vd-compiled-video-partial-badge")
    ).toHaveTextContent("บางส่วน (1 คลิป)");
    expect(screen.getByTestId("vd-compiled-video-partial-status")).toHaveTextContent(
      "เว้นช็อต 9 ที่ยังขาดไว้"
    );
    expect(screen.getByTestId("vd-compiled-video-partial-status")).toHaveTextContent(
      "ภาพนิ่งและ placeholder จะไม่นับเป็นคลิปวิดีโอที่สร้างแล้ว"
    );
  });

  it("does not infer partial output from clip count when the stored shot scope is complete", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/complete.mp4",
            shotCount: 0,
            assemblyCompleteness: {
              expectedShotNumbers: [1],
              includedShotNumbers: [1],
              missingShotNumbers: [],
              partial: false,
            },
          },
        }) as any)}
      />
    );

    await screen.findByTestId("vd-compiled-video-download");
    expect(screen.queryByTestId("vd-compiled-video-partial-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-compiled-video-partial-status")).not.toBeInTheDocument();
  });

  it("labels the partial assembly choice before explicitly submitting allowPartial", async () => {
    const onAssemble = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          storyboard: {
            shots: [
              { shot_number: 1, visual_description: "ready", characters: [] },
              { shot_number: 2, visual_description: "missing", characters: [] },
            ],
          },
          motionPromptPack: {
            selectedVideoModelId: "model",
            durationProfileId: "test",
            motionMode: "image_to_video",
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "ready",
                durationSeconds: 8,
                videoTask: { videoUrl: "/ready.mp4" },
              },
            ],
            warnings: [],
          },
          onAssembleCompiledVideo: onAssemble,
        }) as any)}
      />
    );

    const assembleButton = await screen.findByTestId("vd-compiled-video-assemble");
    expect(assembleButton).toHaveTextContent("ประกอบเฉพาะช็อตที่เสร็จแล้ว");
    fireEvent.click(assembleButton);
    expect(onAssemble).toHaveBeenCalledWith({ allowPartial: true });
  });

  it("shows a direct retry action for a server-approved existing worker job", async () => {
    const onRetry = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "failed",
            pendingJobId: "job-remotion-1",
            error: "revisionId is not defined",
          },
          compiledVideoRetryAvailable: true,
          onRetryCompiledVideoJob: onRetry,
        }) as any)}
      />
    );

    const retryButton = await screen.findByTestId("vd-compiled-video-retry-existing");
    expect(retryButton).toHaveTextContent("ลอง retry งานเดิม");
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the existing-job retry action while the source projection is still pending", async () => {
    const onRetry = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "pending",
            pendingJobId: "job-remotion-completed-no-artifact",
            renderEngine: "remotion_queue",
          },
          compiledVideoRetryAvailable: true,
          onRetryCompiledVideoJob: onRetry,
        }) as any)}
      />
    );

    const retryButton = await screen.findByTestId(
      "vd-compiled-video-retry-existing-pending"
    );
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows raw and protected artifact choices while keeping raw selected by default", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/raw.mp4",
            artifactVersions: [
              {
                id: "raw-v1",
                versionNumber: 1,
                artifactKind: "raw_render",
                status: "available",
                videoUrl: "https://cdn.example.com/raw.mp4",
                createdAt: "2026-09-19T00:00:00.000Z",
              },
              {
                id: "protected-v2",
                versionNumber: 2,
                artifactKind: "protected_render",
                status: "available",
                videoUrl: "https://cdn.example.com/protected.mp4",
                createdAt: "2026-09-19T00:01:00.000Z",
              },
            ],
          },
        }) as any)}
      />
    );

    const player = await screen.findByTestId("vd-compiled-video-player");
    expect(player).toHaveAttribute("src", "https://cdn.example.com/raw.mp4");
    expect(screen.getByTestId("vd-compiled-video-artifact-raw")).toHaveTextContent(
      "ไม่ Protect",
    );
    const protectedButton = screen.getByTestId("vd-compiled-video-artifact-protected");
    expect(protectedButton).toHaveTextContent("ผ่าน Protection");

    fireEvent.click(protectedButton);
    expect(screen.getByTestId("vd-compiled-video-player")).toHaveAttribute(
      "src",
      "https://cdn.example.com/protected.mp4",
    );
  });

  it("keeps the raw video visible and exposes a protection warning and retry", async () => {
    const onRetry = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/raw.mp4",
            protectionStatus: "failed",
            protectionError: "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
          },
          compiledVideoRetryAvailable: true,
          onRetryCompiledVideoJob: onRetry,
        }) as any)}
      />
    );

    expect(await screen.findByTestId("vd-compiled-video-player")).toHaveAttribute(
      "src",
      "https://cdn.example.com/raw.mp4",
    );
    expect(screen.getByTestId("vd-compiled-video-protection-warning")).toHaveTextContent(
      "ติดตั้งหรือซ่อมแซม Content Protection native runtime",
    );
    fireEvent.click(screen.getByTestId("vd-compiled-video-protection-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("turns a protection deadline into an actionable runtime message", async () => {
    const onRetry = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/raw.mp4",
            protectionStatus: "failed",
            protectionError: "Job deadline has elapsed",
          },
          compiledVideoRetryAvailable: true,
          onRetryCompiledVideoJob: onRetry,
        }) as any)}
      />
    );

    expect(screen.getByTestId("vd-compiled-video-protection-warning")).toHaveTextContent(
      "ติดตั้งหรือซ่อมแซม Content Protection native runtime",
    );
    fireEvent.click(screen.getByTestId("vd-compiled-video-protection-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
