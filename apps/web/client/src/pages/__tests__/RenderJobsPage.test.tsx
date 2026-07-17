/**
 * RenderJobsPage coverage (Feature 133, section-08) — asserts the new
 * `remotion_render_video` jobType renders with its Thai label
 * ("เรนเดอร์วิดีโอ Remotion") both in the job list and the detail panel, and
 * that `sceneIndex`/`sceneTotal`-shaped progress (via the existing
 * `shotIndex`/`shotTotal` event fields) still renders unchanged for this
 * job type (no structural change needed — same hand-rolled `@/lib/trpc`
 * mock convention used throughout this codebase's page tests).
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listQueryMock = vi.fn();
const detailQueryMock = vi.fn();
const cancelMutationMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workerJobs: { list: { invalidate: vi.fn() }, detail: { invalidate: vi.fn() } },
    }),
    workerJobs: {
      list: { useQuery: (...args: unknown[]) => listQueryMock(...args) },
      detail: { useQuery: (...args: unknown[]) => detailQueryMock(...args) },
      cancelQueued: { useMutation: (...args: unknown[]) => cancelMutationMock(...args) },
    },
  },
}));

import RenderJobsPage from "../RenderJobsPage";

const REMOTION_JOB = {
  id: "job-remotion-1",
  jobType: "remotion_render_video",
  status: "running",
  worker: { displayName: "Worker A", machineName: "host-1" },
  latestEvent: {
    id: "evt-1",
    eventType: "progress",
    sidecarEventType: "remotion_render_video.progress",
    message: "Rendering shot 2 of 4",
    progressPercent: 50,
    shotIndex: 1,
    shotTotal: 4,
    createdAt: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
};

describe("RenderJobsPage — remotion_render_video jobType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listQueryMock.mockReturnValue({
      data: { items: [REMOTION_JOB] },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    detailQueryMock.mockReturnValue({
      data: {
        id: REMOTION_JOB.id,
        jobType: "remotion_render_video",
        status: "running",
        startedAt: null,
        finishedAt: null,
        worker: { displayName: "Worker A", status: "online" },
        failureReason: null,
        canCancel: true,
        workflowRunId: null,
        outputRefs: [],
        events: [
          {
            id: "evt-1",
            eventType: "progress",
            sidecarEventType: "remotion_render_video.progress",
            message: "Rendering shot 2 of 4",
            progressPercent: 50,
            shotIndex: 1,
            shotTotal: 4,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    cancelMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders the Thai label for remotion_render_video in the job list", () => {
    render(<RenderJobsPage />);
    const rows = screen.getAllByText("เรนเดอร์วิดีโอ Remotion");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("renders the Thai label for remotion_render_video in the detail panel", () => {
    render(<RenderJobsPage />);
    // Appears at least twice: once in the list row, once in the detail panel.
    const occurrences = screen.getAllByText("เรนเดอร์วิดีโอ Remotion");
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("still maps shotIndex/shotTotal progress for this job type (no structural change)", () => {
    render(<RenderJobsPage />);
    expect(screen.getAllByText(/Shot 2\/4/).length).toBeGreaterThan(0);
  });

  it("falls back to the raw jobType string for an unrecognized job type", () => {
    listQueryMock.mockReturnValue({
      data: { items: [{ ...REMOTION_JOB, id: "job-other", jobType: "some_other_job_type" }] },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<RenderJobsPage />);
    expect(screen.getAllByText("some_other_job_type").length).toBeGreaterThan(0);
  });
});

describe("RenderJobsPage — Feature 135 (Hermes Grok media worker) section 12 job type labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    cancelMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it.each([
    ["hermes_media_image_generate", "สร้างภาพ (Grok ผ่าน Hermes)"],
    ["hermes_media_video_generate", "สร้างวิดีโอ (Grok ผ่าน Hermes)"],
    ["hermes_connection_authorize", "เชื่อมต่อบัญชี Grok (Hermes)"],
    ["hermes_connection_probe", "ตรวจสอบการเชื่อมต่อ Grok (Hermes)"],
    ["hermes_connection_disconnect", "ยกเลิกการเชื่อมต่อ Grok (Hermes)"],
  ] as const)("renders the Thai label for %s", (jobType, label) => {
    listQueryMock.mockReturnValue({
      data: { items: [{ ...REMOTION_JOB, id: `job-${jobType}`, jobType }] },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<RenderJobsPage />);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });
});
