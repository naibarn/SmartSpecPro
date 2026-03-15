import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

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

class MockEventSource {
  static instances: MockEventSource[] = [];
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  withCredentials: boolean;
  readyState = MockEventSource.OPEN;
  listeners: Record<string, Array<(event: any) => void>> = {};
  closed = false;

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (event: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  close() {
    this.closed = true;
    this.readyState = MockEventSource.CLOSED;
  }

  emit(event: string, data?: unknown) {
    const handlers = this.listeners[event] || [];
    handlers.forEach((handler) => handler({
      data: data == null ? "" : JSON.stringify(data),
      lastEventId: typeof data === "object" && data && "cursor" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).cursor)
        : "",
    }));
  }
}

vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

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
    pageSensitivity: "none",
  },
  activeTabCount: 2,
  startedAt: "2026-03-12T10:00:00Z",
  lastActivityAt: "2026-03-12T10:05:00Z",
  pendingApprovalRequestId: "apr_123",
};

const resumedLiveSession = {
  ...liveSession,
  sessionId: "lbs_456",
  sourceId: "task-2",
  sessionVersion: 2,
  status: "agent_running" as const,
  controlMode: "agent_control" as const,
  pendingApprovalRequestId: undefined,
  browserContextRef: {
    activeTabId: "tab_1",
    url: "https://example.com/results",
    pageTitle: "Results",
    pageSensitivity: "none",
  },
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
    MockEventSource.instances = [];
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
        executionIntent: {
          prompt: "Open example.com and review checkout.",
          skillId: "checkout_assistant",
          discoverWebsites: true,
          autoDraftSkill: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Approval requested/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(executeMutateAsync).not.toHaveBeenCalled();
  });

  it("applies live-browser event session snapshots without refetching the session", async () => {
    await moveToPreviewReady();

    fireEvent.click(screen.getByRole("button", { name: /Run in Live Mode/i }));

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/live-browser/sessions/lbs_123/stream");

    await act(async () => {
      MockEventSource.instances[0].emit("live_browser_event", {
        eventId: "evt_2",
        sessionId: "lbs_123",
        sessionVersion: 5,
        type: "command_started",
        timestamp: "2026-03-12T10:06:00Z",
        payload: {
          session: {
            ...liveSession,
            sessionVersion: 5,
            status: "agent_running",
          },
        },
        cursor: "lbs_123:5:evt_2",
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("v5").length).toBeGreaterThan(0);
    });

    expect(getSessionFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a debounced session refresh when stream events omit a session snapshot", async () => {
    await moveToPreviewReady();

    fireEvent.click(screen.getByRole("button", { name: /Run in Live Mode/i }));

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    getSessionFetch.mockResolvedValueOnce({
      ...liveSession,
      sessionVersion: 5,
      status: "agent_running" as const,
    });

    await act(async () => {
      MockEventSource.instances[0].emit("live_browser_event", {
        eventId: "evt_3",
        sessionId: "lbs_123",
        sessionVersion: 5,
        type: "command_started",
        timestamp: "2026-03-12T10:06:00Z",
        payload: {},
        cursor: "lbs_123:5:evt_3",
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await waitFor(() => {
      expect(getSessionFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores malformed live-browser stream events instead of mutating session state", async () => {
    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });
    const baselineSessionFetches = getSessionFetch.mock.calls.length;

    const source = MockEventSource.instances.at(-1);
    expect(source).toBeDefined();

    act(() => {
      source?.emit("live_browser_event", {
        eventId: 123,
        payload: "invalid",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(getSessionFetch).toHaveBeenCalledTimes(baselineSessionFetches);
    expect(screen.getAllByText("v4").length).toBeGreaterThan(0);
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
        commandSkillId="general_navigation"
        busyAction={null}
        noticeMessage="Re-authentication required before takeover."
        stepUpCode=""
        showStepUpCodeInput={false}
        onCommandDraftChange={vi.fn()}
        onCommandSkillIdChange={vi.fn()}
        onStepUpCodeChange={vi.fn()}
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
      screen.getByRole("button", { name: /Manual control is unavailable on this screen size\./i }),
    ).toBeDisabled();
    expect(screen.getByText(/Re-authentication required before takeover./i)).toBeInTheDocument();
    expect(screen.getAllByText(/Review Required before AI can continue\./i)).toHaveLength(2);
  });

  it("renders commitment gate labels for payment review barriers", () => {
    render(
      <LiveBrowserWorkspace
        session={{
          ...liveSession,
          barrierType: "payment_review_required" as const,
          policyContext: {
            activeBarrier: {
              type: "payment_review_required",
              prompt: "Confirm the payment amount before submitting checkout.",
            },
          },
        }}
        events={liveEvents}
        reconnectState="connected"
        compactViewport={false}
        commandDraft=""
        commandSkillId="general_navigation"
        busyAction={null}
        noticeMessage={null}
        stepUpCode=""
        showStepUpCodeInput={false}
        onCommandDraftChange={vi.fn()}
        onCommandSkillIdChange={vi.fn()}
        onStepUpCodeChange={vi.fn()}
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

    expect(screen.getAllByText(/Payment Review Required before AI can continue\./i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Approve Payment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject Payment/i })).toBeInTheDocument();
    expect(screen.getByText(/Confirm the payment amount before submitting checkout\./i)).toBeInTheDocument();
  });

  it("requires takeover-first handling for login barriers", () => {
    render(
      <LiveBrowserWorkspace
        session={{
          ...liveSession,
          pendingApprovalRequestId: null,
          pendingAssistRequestId: "assist_login_1",
          barrierType: "login_required" as const,
          policyContext: {
            activeBarrier: {
              type: "login_required",
              prompt: "Log in to continue with this booking.",
            },
          },
          browserContextRef: {
            ...liveSession.browserContextRef,
            url: "https://accounts.example.com/login",
            pageTitle: "Sign in",
            pageSensitivity: "auth",
          },
        }}
        events={liveEvents}
        reconnectState="connected"
        compactViewport={false}
        commandDraft=""
        commandSkillId="general_navigation"
        busyAction={null}
        noticeMessage={null}
        stepUpCode=""
        showStepUpCodeInput
        onCommandDraftChange={vi.fn()}
        onCommandSkillIdChange={vi.fn()}
        onStepUpCodeChange={vi.fn()}
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

    expect(screen.getAllByText(/Login Required before AI can continue\./i)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Send Assist Response/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Take control to complete login, then return control to AI\./i)).toBeInTheDocument();
  });

  it("renders an explicit ready state when the browser skill draft has completed", () => {
    render(
      <LiveBrowserWorkspace
        session={{
          ...liveSession,
          policyContext: {
            skillDraft: {
              status: "ready",
              skillId: "compare_options",
              note: "Reusable browser skill draft is ready. Live execution is continuing with the drafted plan.",
              syncedSkillSlug: "browser-booking-skill",
            },
          },
        }}
        events={liveEvents}
        reconnectState="connected"
        compactViewport={false}
        commandDraft=""
        commandSkillId="compare_options"
        busyAction={null}
        noticeMessage={null}
        stepUpCode=""
        showStepUpCodeInput={false}
        onCommandDraftChange={vi.fn()}
        onCommandSkillIdChange={vi.fn()}
        onStepUpCodeChange={vi.fn()}
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

    expect(screen.getByText("Browser Skill Draft Ready")).toBeInTheDocument();
    expect(screen.getByText(/browser-booking-skill/i)).toBeInTheDocument();
  });

  it("resets the live event replay cursor when resuming a different Browser Session", async () => {
    getSessionFetch.mockImplementation(async ({ sessionId }: { sessionId: string }) => (
      sessionId === "lbs_456" ? resumedLiveSession : liveSession
    ));
    issueStreamTokenMutateAsync
      .mockResolvedValueOnce({
        sessionId: "lbs_123",
        scope: "viewer",
        token: "viewer-token-resume",
        expiresAt: "2026-03-12T10:15:00Z",
      })
      .mockResolvedValueOnce({
        sessionId: "lbs_456",
        scope: "viewer",
        token: "viewer-token-resume-2",
        expiresAt: "2026-03-12T10:20:00Z",
      });

    const view = render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    const baselineSourceCount = MockEventSource.instances.length;
    const firstSource = MockEventSource.instances.at(-1);
    expect(firstSource?.url).toBe("/api/live-browser/sessions/lbs_123/stream");

    act(() => {
      firstSource?.emit("live_browser_event", {
        eventId: "evt_2",
        sessionId: "lbs_123",
        sessionVersion: 5,
        type: "command_started",
        timestamp: "2026-03-13T02:00:00Z",
        payload: {
          session: {
            ...liveSession,
            sessionVersion: 5,
          },
        },
        cursor: "lbs_123:5:evt_2",
      });
    });

    view.rerender(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_456"
      />,
    );

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(baselineSourceCount);
    });

    const secondSource = MockEventSource.instances.at(-1);
    expect(secondSource).toBeDefined();
    expect(secondSource).not.toBe(firstSource);
    expect(secondSource?.url).toBe("/api/live-browser/sessions/lbs_456/stream");
  });

  it("shows an inline live-workspace notice when takeover requires re-authentication", async () => {
    takeControlMutateAsync.mockRejectedValue(
      new Error("Live Browser takeover requires recent step-up authentication proof"),
    );

    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Take Control/i }));

    await waitFor(() => {
      expect(screen.getByText(/Take control is blocked until you complete a recent sign-in check/i)).toBeInTheDocument();
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Live Browser takeover requires recent step-up authentication proof",
    );
  });

  it("collects an MFA code for sensitive-page takeover retries", async () => {
    getSessionFetch.mockResolvedValue({
      ...liveSession,
      browserContextRef: {
        ...liveSession.browserContextRef,
        pageSensitivity: "auth",
        url: "https://accounts.example.com/login",
        pageTitle: "Sign in",
      },
    });
    takeControlMutateAsync.mockResolvedValue({
      accepted: true,
      status: "human_controlling",
      controlMode: "takeover",
      sessionVersion: 5,
      stream: {
        viewerToken: "viewer-token",
        controllerToken: "controller-token",
        expiresAt: "2026-03-12T10:15:00Z",
        leaseExpiresAt: "2026-03-12T10:20:00Z",
      },
    });

    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/MFA Or Recovery Code/i), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Take Control/i }));

    await waitFor(() => {
      expect(takeControlMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        stepUpCode: "654321",
      }));
    });
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

  it("queues an additional Browser Session instruction from the live workspace", async () => {
    sendCommandMutateAsync.mockResolvedValue({
      accepted: true,
      sessionVersion: 5,
      commandId: "cmd_live_1",
    });

    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText(/Tell the AI what to do next in this Browser Session/i),
      { target: { value: "Look for the right website and continue." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Send Browser Instruction/i }));

    await waitFor(() => {
      expect(sendCommandMutateAsync).toHaveBeenCalledWith({
        sessionId: "lbs_123",
        sessionVersion: 4,
        idempotencyKey: expect.stringMatching(/^live-cmd-/),
        actor: { actorType: "user", actorId: "42" },
        command: {
          type: "natural_language",
          text: expect.stringContaining("User goal: Look for the right website and continue."),
        },
      });
    });
  });

  it("uses the locally updated session version for rapid consecutive Browser Session instructions", async () => {
    sendCommandMutateAsync
      .mockResolvedValueOnce({
        accepted: true,
        sessionVersion: 5,
        queuedCommandId: "cmd_live_1",
      })
      .mockResolvedValueOnce({
        accepted: true,
        sessionVersion: 6,
        queuedCommandId: "cmd_live_2",
      });

    render(
      <AutomationChatModal
        open
        onOpenChange={vi.fn()}
        initialLiveSessionId="lbs_123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("live-browser-workspace")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(
      /Tell the AI what to do next in this Browser Session/i,
    );
    const sendButton = screen.getByRole("button", { name: /Send Browser Instruction/i });

    fireEvent.change(textarea, { target: { value: "First follow-up action." } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(sendCommandMutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
        sessionVersion: 4,
      }));
    });

    fireEvent.change(textarea, { target: { value: "Second follow-up action." } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(sendCommandMutateAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
        sessionVersion: 5,
      }));
    });
  });
});
