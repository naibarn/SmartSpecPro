/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  observabilityQuery: vi.fn(),
  detailQuery: vi.fn(),
  developerEventsQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { workerJobs: {
    observability: { useQuery: (...args: unknown[]) => mocks.observabilityQuery(...args) },
    observabilityDetail: { useQuery: (...args: unknown[]) => mocks.detailQuery(...args) },
    developerExecutionEvents: { useQuery: (...args: unknown[]) => mocks.developerEventsQuery(...args) },
  } },
}));
vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    locale: "en",
    t: (key: string) => ({
      "chat.executionActivityTitle": "Work from this chat",
      "chat.executionRunning": "Running",
      "chat.executionWaiting": "Waiting",
      "chat.executionCompleted": "Completed",
      "chat.executionAttention": "Needs attention",
      "chat.executionCancelled": "Cancelled",
      "chat.executionStatusUnknown": "Status unavailable",
      "chat.executionActivityLoading": "Loading work status…",
      "chat.executionActivityUnavailable": "Work status is temporarily unavailable.",
      "chat.executionActivityRecorded": "Activity recorded",
      "chat.executionOpenTaskControl": "Open Task Control",
      "taskControl.developerMode": "Developer view",
      "taskControl.simpleMode": "Simple view",
      "taskControl.harnessOutputTitle": "Harness output",
      "taskControl.harnessOutputNotStarted": "Execution has not started.",
      "taskControl.harnessOutputLoading": "Loading harness events…",
      "taskControl.harnessOutputUnavailable": "Harness events unavailable.",
      "taskControl.harnessOutputEmpty": "No harness events yet.",
      "taskControl.harnessOutputDiff": "View diff",
      "taskControl.activityProgress": "Progress received",
      "taskControl.activityRecorded": "Activity recorded",
    }[key] ?? key),
  }),
}));

import { ConversationExecutionActivity } from "../ConversationExecutionActivity";

describe("ConversationExecutionActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observabilityQuery.mockReturnValue({
      data: { snapshot: { projectionToken: "projection-token" }, items: [{ id: "job-1", status: "running" }] },
      error: null,
      isLoading: false,
    });
    mocks.detailQuery.mockReturnValue({
      data: { timeline: [{ id: "event-1", type: "PROGRESS", at: "2026-10-29T10:00:00.000Z", phase: "private phase value" }] },
      error: null,
    });
    mocks.developerEventsQuery.mockReturnValue({
      data: { jobId: "job-1", events: [{ id: "harness-1", sequence: 1, at: "2026-10-29T10:00:01.000Z", attempt: 1, kind: "assistant_message", text: "Codex executed the test suite.", chunkIndex: 0, chunkCount: 1 }], hasMore: false, nextSequence: 1 },
      error: null,
      isLoading: false,
    });
  });

  it("shows a safe lifecycle summary and links to Task Control for the same conversation", () => {
    render(<ConversationExecutionActivity conversationId={241} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText(/Progress received/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Task Control" })).toHaveAttribute(
      "href",
      "/chat?panel=control-plane&view=full&c=241",
    );
    expect(screen.queryByText("private phase value")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex executed the test suite.")).not.toBeInTheDocument();
  });

  it("shows full harness events only after the user opens Developer view", async () => {
    render(<ConversationExecutionActivity conversationId={241} />);
    expect(screen.queryByText("Codex executed the test suite.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Developer view" }));

    expect(mocks.developerEventsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", afterSequence: 0, limit: 50 }),
      expect.objectContaining({ enabled: true }),
    );
    await waitFor(() => expect(screen.getByText("Codex executed the test suite.")).toBeInTheDocument());
    expect(screen.getByTestId("chat-harness-output-event")).toBeInTheDocument();
  });

  it("does not request or display execution activity without a conversation", () => {
    const { container } = render(<ConversationExecutionActivity conversationId={null} />);
    expect(mocks.observabilityQuery).toHaveBeenCalledWith({}, expect.objectContaining({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });
});
