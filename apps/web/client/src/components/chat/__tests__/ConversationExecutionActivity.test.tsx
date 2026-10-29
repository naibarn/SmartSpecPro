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
      "chat.executionActivityStale": "Refresh failed. Showing the last authorized task status as of",
      "chat.executionDetailsUnavailable": "Task details could not be loaded. The latest status is still shown.",
      "chat.executionActivityRetry": "Retry loading status",
      "chat.executionActivityRetrying": "Retrying…",
      "chat.executionActivityRecorded": "Activity recorded",
      "chat.executionSelectJob": "Choose task activity",
      "chat.executionAgent": "Agent",
      "chat.executionWorker": "Worker",
      "chat.executionJob": "Job",
      "chat.executionHarness": "Harness",
      "chat.executionModel": "Model",
      "chat.executionRunner": "Runner",
      "chat.executionRun": "Run",
      "chat.executionNotRecorded": "Not recorded",
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
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.detailQuery.mockReturnValue({
      data: { timeline: [{ id: "event-1", type: "PROGRESS", at: "2026-10-29T10:00:00.000Z", phase: "private phase value" }] },
      error: null,
      isFetching: false,
      refetch: vi.fn(),
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

  it("shows the actual execution identity shared with Task Control", () => {
    mocks.detailQuery.mockReturnValue({ data: {
      timeline: [],
      executionIdentity: { agent: null, agentType: "external_agent_task", harness: "codex", model: "gpt-6-luna", reasoningEffort: "high", runId: "run-224-actual" },
      worker: { displayName: "Debian Agent Worker" },
      runner: { displayName: "Debian Runner" },
    }, error: null });
    render(<ConversationExecutionActivity conversationId={241} />);
    expect(screen.getByText("Harness").nextElementSibling).toHaveTextContent("codex");
    expect(screen.getByText("Model").nextElementSibling).toHaveTextContent("gpt-6-luna");
    expect(screen.getByText("Runner").nextElementSibling).toHaveTextContent("Debian Runner");
    expect(screen.getByText("Run").nextElementSibling).toHaveTextContent("run-224-actual");
    expect(screen.getByText("Agent").nextElementSibling).toHaveTextContent("Not recorded");
    expect(screen.getByText("Worker").nextElementSibling).toHaveTextContent("Debian Agent Worker");
    expect(screen.getByText("Job").nextElementSibling).toHaveTextContent("job-1");
  });

  it("lets users inspect the exact Job when one Thread has multiple executions", () => {
    mocks.observabilityQuery.mockReturnValue({
      data: { snapshot: { projectionToken: "projection-token" }, items: [
        { id: "job-active", jobType: "spec224.development", status: "running" },
        { id: "job-review", jobType: "spec224.verify", status: "completed" },
      ] },
      error: null,
      isLoading: false,
    });
    const { rerender } = render(<ConversationExecutionActivity conversationId={241} />);
    const selector = screen.getByRole("combobox", { name: "Choose task activity" });
    expect(selector).toHaveValue("job-active");
    fireEvent.change(selector, { target: { value: "job-review" } });
    rerender(<ConversationExecutionActivity conversationId={241} />);
    expect(mocks.detailQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ jobId: "job-review", projectionToken: "projection-token" }),
      expect.anything(),
    );
  });

  it("does not request or display execution activity without a conversation", () => {
    const { container } = render(<ConversationExecutionActivity conversationId={null} />);
    expect(mocks.observabilityQuery).toHaveBeenCalledWith({}, expect.objectContaining({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a retry when the authorized work status query fails", () => {
    const refetch = vi.fn();
    mocks.observabilityQuery.mockReturnValue({ data: undefined, error: new Error("temporary 500"), isLoading: false, isFetching: false, refetch });
    mocks.detailQuery.mockReturnValue({ data: undefined, error: null, isFetching: false, refetch: vi.fn() });

    render(<ConversationExecutionActivity conversationId={241} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Work status is temporarily unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading status" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the job status visible and retries only task details when that read fails", () => {
    const refetchDetails = vi.fn();
    mocks.detailQuery.mockReturnValue({ data: undefined, error: new Error("temporary 500"), isFetching: false, refetch: refetchDetails });

    render(<ConversationExecutionActivity conversationId={241} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Task details could not be loaded. The latest status is still shown.");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading status" }));
    expect(refetchDetails).toHaveBeenCalledTimes(1);
    expect(mocks.observabilityQuery.mock.results.at(-1)?.value.refetch).not.toHaveBeenCalled();
  });

  it("keeps the last authorized status visible after a transient refresh failure", () => {
    const refetch = vi.fn();
    mocks.observabilityQuery.mockReturnValue({
      data: { snapshot: { projectionToken: "projection-token", asOf: "2026-10-29T10:00:00.000Z" }, items: [{ id: "job-1", status: "running" }] },
      error: Object.assign(new Error("temporary 500"), { data: { code: "INTERNAL_SERVER_ERROR" } }),
      isLoading: false,
      isFetching: false,
      refetch,
    });

    render(<ConversationExecutionActivity conversationId={241} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Refresh failed. Showing the last authorized task status as of · 2026-10-29T10:00:00.000Z");
    expect(screen.getByText("Agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading status" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not render cached task status after an authorization denial", () => {
    mocks.observabilityQuery.mockReturnValue({
      data: { snapshot: { projectionToken: "projection-token" }, items: [{ id: "job-1", status: "running" }] },
      error: Object.assign(new Error("forbidden"), { data: { code: "FORBIDDEN" } }),
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<ConversationExecutionActivity conversationId={241} />);

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Work status is temporarily unavailable.");
  });
});
