import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeMutateAsync = vi.fn();
const executeMutateAsync = vi.fn();
const cancelMutateAsync = vi.fn();
const saveTemplateMutateAsync = vi.fn();
const createSessionMutateAsync = vi.fn();
const sendCommandMutateAsync = vi.fn();
const takeControlMutateAsync = vi.fn();
const returnControlMutateAsync = vi.fn();
const resolveApprovalMutateAsync = vi.fn();
const submitAssistMutateAsync = vi.fn();
const cancelSessionMutateAsync = vi.fn();
const issueStreamTokenMutateAsync = vi.fn();
const getStatusFetch = vi.fn();
const getSessionFetch = vi.fn();
const listEventsFetch = vi.fn();
let intervalCallbacks: Array<() => Promise<void> | void> = [];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "42" },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      automationCopilot: {
        getStatus: { fetch: getStatusFetch },
      },
      liveBrowser: {
        getSession: { fetch: getSessionFetch },
        listEvents: { fetch: listEventsFetch },
      },
    }),
    automationCopilot: {
      analyze: { useMutation: () => ({ mutateAsync: analyzeMutateAsync, isPending: false }) },
      execute: { useMutation: () => ({ mutateAsync: executeMutateAsync, isPending: false }) },
      cancel: { useMutation: () => ({ mutateAsync: cancelMutateAsync, isPending: false }) },
      saveTemplate: { useMutation: () => ({ mutateAsync: saveTemplateMutateAsync, isPending: false }) },
    },
    liveBrowser: {
      createSession: { useMutation: () => ({ mutateAsync: createSessionMutateAsync, isPending: false }) },
      sendCommand: { useMutation: () => ({ mutateAsync: sendCommandMutateAsync, isPending: false }) },
      takeControl: { useMutation: () => ({ mutateAsync: takeControlMutateAsync, isPending: false }) },
      returnControl: { useMutation: () => ({ mutateAsync: returnControlMutateAsync, isPending: false }) },
      resolveApproval: { useMutation: () => ({ mutateAsync: resolveApprovalMutateAsync, isPending: false }) },
      submitAssistResponse: { useMutation: () => ({ mutateAsync: submitAssistMutateAsync, isPending: false }) },
      cancelSession: { useMutation: () => ({ mutateAsync: cancelSessionMutateAsync, isPending: false }) },
      issueStreamToken: { useMutation: () => ({ mutateAsync: issueStreamTokenMutateAsync, isPending: false }) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { AutomationChatModal } from "../AutomationChatModal";
import { LiveBrowserWorkspace } from "../LiveBrowserWorkspace";

const previewStatus = {
  status: "preview_ready",
  intent: {
    steps: [
      {
        description: "Open the pricing page",
        actionType: "navigate",
        selectorConfidence: 0.9,
      },
    ],
  },
  cost_estimate: {
    estimated_credits: 12,
    breakdown: { browser_actions: 8, llm_calls: 4, web_searches: 0 },
    max_possible_credits: 18,
  },
};

const liveSession = {
  sessionId: "lbs_123",
  tenantId: "tenant-123",
  userId: 42,
  sourceType: "automation" as const,
  sourceId: "task-1",
  status: "waiting_for_human" as const,
  controlMode: "observe" as const,
  sessionVersion: 4,
  policyContext: {},
  browserContextRef: {
    activeTabId: "tab_2",
    url: "https://example.com/checkout",
    pageTitle: "Checkout",
  },
  activeTabCount: 2,
  startedAt: "2026-03-12T10:00:00Z",
  lastActivityAt: "2026-03-12T10:05:00Z",
  pendingApprovalRequestId: "apr_123",
};

const liveEvents = [
  {
    eventId: "evt_1",
    sessionId: "lbs_123",
    sessionVersion: 4,
    type: "approval_requested" as const,
    timestamp: "2026-03-12T10:05:00Z",
    payload: {},
    cursor: "lbs_123:4:evt_1",
  },
];

async function moveToPreviewReady() {
  render(<AutomationChatModal open onOpenChange={vi.fn()} />);

  fireEvent.change(
    screen.getByPlaceholderText(/Describe what you want to automate/i),
    { target: { value: "Open example.com and review checkout." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

  await waitFor(() => expect(analyzeMutateAsync).toHaveBeenCalledWith({ prompt: "Open example.com and review checkout." }));

  await act(async () => {
    const poll = intervalCallbacks.at(-1);
    expect(poll).toBeTypeOf("function");
    await poll?.();
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Run in Live Mode/i })).toBeInTheDocument();
  });
}

describe("AutomationChatModal live mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intervalCallbacks = [];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: TimerHandler) => {
      intervalCallbacks.push(callback as () => Promise<void> | void);
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
    analyzeMutateAsync.mockResolvedValue({ taskId: "task-1" });
    getStatusFetch.mockResolvedValue(previewStatus);
    getSessionFetch.mockResolvedValue(liveSession);
    listEventsFetch.mockResolvedValue({
      sessionId: "lbs_123",
      events: liveEvents,
      nextCursor: "lbs_123:4:evt_1",
      hasMore: false,
    });
    createSessionMutateAsync.mockResolvedValue({
      sessionId: "lbs_123",
      status: "provisioning",
      controlMode: "observe",
      sessionVersion: 1,
      stream: {
        viewerToken: "viewer-token",
        expiresAt: "2026-03-12T10:10:00Z",
      },
    });
    issueStreamTokenMutateAsync.mockResolvedValue({
      sessionId: "lbs_123",
      scope: "viewer",
      token: "viewer-token-resume",
      expiresAt: "2026-03-12T10:15:00Z",
    });
  });

  it("launches live mode from the automation modal and shows the live workspace", async () => {
    await moveToPreviewReady();

    fireEvent.click(screen.getByRole("button", { name: /Run in Live Mode/i }));

    await waitFor(() => {
      expect(createSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "automation",
        sourceId: "task-1",
        mode: "observe",
        executionIntent: { prompt: "Open example.com and review checkout." },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Approval requested/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(executeMutateAsync).not.toHaveBeenCalled();
  });

  it("fails closed when live session creation fails", async () => {
    createSessionMutateAsync.mockRejectedValue(new Error("stream unavailable"));

    await moveToPreviewReady();
    fireEvent.click(screen.getByRole("button", { name: /Run in Live Mode/i }));

    await waitFor(() => {
      expect(screen.getByText(/Live mode failed to start: stream unavailable/i)).toBeInTheDocument();
    });

    expect(executeMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId("live-browser-workspace")).not.toBeInTheDocument();
  });

  it("renders live workspace mobile constraints and accessibility announcements", () => {
    render(
      <LiveBrowserWorkspace
        session={liveSession}
        events={liveEvents}
        reconnectState="connected"
        compactViewport
        commandDraft=""
        busyAction={null}
        onCommandDraftChange={vi.fn()}
        onSendCommand={vi.fn()}
        onRefresh={vi.fn()}
        onTakeControl={vi.fn()}
        onReturnControl={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onResolveAssist={vi.fn()}
        onCancelSession={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Takeover unavailable on mobile/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Approval requested. Agent is waiting for human input./i),
    ).toBeInTheDocument();
  });

  it("hydrates an existing live session from the route-backed resume path", async () => {
    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(issueStreamTokenMutateAsync).toHaveBeenCalledWith({
        sessionId: "lbs_123",
        actor: { actorType: "user", actorId: "42" },
        scope: "viewer",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });
});
