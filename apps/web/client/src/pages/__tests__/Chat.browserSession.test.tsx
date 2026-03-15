/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackBrowserSessionOpened, trackBrowserSessionReopened } = vi.hoisted(() => ({
  trackBrowserSessionOpened: vi.fn(),
  trackBrowserSessionReopened: vi.fn(),
}));

const mockSetLocation = vi.fn();
const createLiveBrowserSessionMutateAsync = vi.fn();
const sendLiveBrowserCommandMutateAsync = vi.fn();
const saveAssistantMessageMutateAsync = vi.fn();
const createConversationMutateAsync = vi.fn();
const updateConversationMutateAsync = vi.fn();
const getSessionFetch = vi.fn();
const invalidateMessages = vi.fn();
const invalidateConversations = vi.fn();

let messagesData: Array<Record<string, unknown>> = [];
let tenantFlagsData: Record<string, unknown> | undefined = { chatBrowserSessionEntry: true };

vi.mock("wouter", () => ({
  useLocation: () => ["/chat", mockSetLocation],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "42" },
  }),
}));

vi.mock("@/components/chat", () => ({
  ChatSidebar: () => <div>Chat Sidebar</div>,
  ChatHelpDialog: () => <button type="button">Chat Help</button>,
  ChatView: ({
    conversationId,
    browserSessionSuggestion,
    showBrowserSessionEntry,
    onStartBrowserSession,
    browserSessionEntryPending,
    onUserMessageSent,
    onConfirmBrowserSessionSuggestion,
    onDismissBrowserSessionSuggestion,
  }: {
    conversationId: number | null;
    browserSessionSuggestion?: {
      title: string;
      confirmLabel: string;
      suggestionId: string;
    } | null;
    showBrowserSessionEntry?: boolean;
    onStartBrowserSession?: () => void;
    browserSessionEntryPending?: boolean;
    onUserMessageSent?: (message: string) => void;
    onConfirmBrowserSessionSuggestion?: (suggestion: {
      title: string;
      confirmLabel: string;
      suggestionId: string;
    }) => void;
    onDismissBrowserSessionSuggestion?: (suggestionId: string) => void;
  }) => (
    <div>
      <div>Chat View {conversationId}</div>
      {showBrowserSessionEntry ? (
        <button
          type="button"
          onClick={() => onStartBrowserSession?.()}
          disabled={browserSessionEntryPending}
        >
          Start Browser Session
        </button>
      ) : null}
      <button type="button" onClick={() => onUserMessageSent?.("ช่วยหาโรงแรมเปรียบเทียบราคาให้หน่อย")}>
        Trigger Suggestion
      </button>
      {browserSessionSuggestion ? (
        <div>
          <div>{browserSessionSuggestion.title}</div>
          <button
            type="button"
            onClick={() => onConfirmBrowserSessionSuggestion?.(browserSessionSuggestion)}
          >
            {browserSessionSuggestion.confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => onDismissBrowserSessionSuggestion?.(browserSessionSuggestion.suggestionId)}
          >
            Dismiss Suggestion
          </button>
        </div>
      ) : null}
    </div>
  ),
  MemoryPanel: () => <div>Memory Panel</div>,
  SkillSettings: () => <div>Skill Settings</div>,
  ArtifactPanel: () => <div>Artifact Panel</div>,
  MediaGenerationPanel: () => <div>Media Generation Panel</div>,
  SchedulePanel: () => <div>Schedule Panel</div>,
}));

vi.mock("@/components/chat/canvas/CanvasPane", () => ({
  CanvasPane: () => <div>Canvas Pane</div>,
}));

vi.mock("@/components/browser-session/BrowserSessionHelpDialog", () => ({
  BrowserSessionHelpDialog: () => <button type="button">Help</button>,
}));

vi.mock("@/lib/analytics/browserSessionEvents", () => ({
  trackBrowserSessionOpened,
  trackBrowserSessionReopened,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      liveBrowser: {
        getSession: { fetch: getSessionFetch },
      },
      chat: {
        getMessages: { invalidate: invalidateMessages },
        listConversations: { invalidate: invalidateConversations },
      },
    }),
    llmProviders: {
      availableModels: {
        useQuery: () => ({ data: { models: [] } }),
      },
    },
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: () => ({ data: tenantFlagsData }),
      },
    },
    chat: {
      getMessages: {
        useQuery: () => ({ data: messagesData }),
      },
      createConversation: {
        useMutation: () => ({ mutateAsync: createConversationMutateAsync }),
      },
      updateConversation: {
        useMutation: () => ({ mutateAsync: updateConversationMutateAsync }),
      },
      saveAssistantMessage: {
        useMutation: () => ({ mutateAsync: saveAssistantMessageMutateAsync }),
      },
    },
    liveBrowser: {
      createSession: {
        useMutation: () => ({ mutateAsync: createLiveBrowserSessionMutateAsync, isPending: false }),
      },
      sendCommand: {
        useMutation: () => ({ mutateAsync: sendLiveBrowserCommandMutateAsync, isPending: false }),
      },
    },
    memory: {
      upsertEntityMemory: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

import Chat from "../Chat";

describe("Chat Browser Session entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messagesData = [];
    tenantFlagsData = { chatBrowserSessionEntry: true };
    window.history.replaceState({}, "", "/chat?c=12");
    createConversationMutateAsync.mockResolvedValue({ id: 88 });
    getSessionFetch.mockResolvedValue({
      sessionId: "lbs_chat_1",
      tenantId: "tenant-1",
      userId: 42,
      sourceType: "chat",
      sourceId: "12",
      status: "agent_running",
      controlMode: "agent_control",
      sessionVersion: 3,
      controllerActorType: null,
      controllerActorId: null,
      controllerConnectionId: null,
      controllerLeaseExpiresAt: null,
      pauseReason: null,
      pendingAssistRequestId: null,
      pendingApprovalRequestId: null,
      policyContext: {},
      browserContextRef: {
        pageTitle: "Acme Dashboard",
        url: "https://example.com/app",
      },
      activeTabCount: 1,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastActivityAt: "2026-03-12T10:05:00.000Z",
      endedAt: null,
      endReason: null,
    });
    createLiveBrowserSessionMutateAsync.mockResolvedValue({
      sessionId: "lbs_chat_1",
      status: "ready",
      controlMode: "observe",
      sessionVersion: 1,
      stream: {
        viewerToken: "viewer-token",
        expiresAt: "2026-03-12T10:10:00.000Z",
      },
    });
    sendLiveBrowserCommandMutateAsync.mockResolvedValue({
      accepted: true,
      sessionVersion: 4,
      commandId: "cmd_chat_1",
    });
  });

  it("shows a Browser Session launcher card inside Chat before any session exists", () => {
    render(<Chat />);

    expect(screen.getByText(/Let AI work in a live browser directly from this chat\./i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Start Browser Session" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Help" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Chat Help" })).toBeInTheDocument();
  });

  it("keeps the Browser Session launcher visible when tenant flags have not loaded yet", () => {
    tenantFlagsData = undefined;

    render(<Chat />);

    expect(screen.getAllByRole("button", { name: "Start Browser Session" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Help" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Chat Help" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Browser Session/i })).toBeInTheDocument();
  });

  it("keeps the right panel collapsed until a panel is opened", () => {
    render(<Chat />);

    const rightPanel = screen.getByTestId("chat-right-panel");
    expect(rightPanel).toHaveAttribute("aria-hidden", "true");
    expect(rightPanel).toHaveClass("w-0");
    expect(rightPanel).toHaveClass("pointer-events-none");
    expect(rightPanel).not.toHaveClass("sm:w-96");
    expect(rightPanel).not.toHaveClass("lg:w-[28rem]");

    fireEvent.click(screen.getByRole("button", { name: "Memory" }));

    expect(rightPanel).toHaveAttribute("aria-hidden", "false");
    expect(rightPanel).toHaveClass("w-full");
    expect(rightPanel).toHaveClass("sm:w-96");
    expect(rightPanel).toHaveClass("lg:w-[28rem]");
  });

  it("creates and opens a Browser Session from Chat", async () => {
    render(<Chat />);

    fireEvent.click(screen.getByRole("button", { name: /Open Browser Session/i }));

    await waitFor(() => {
      expect(createLiveBrowserSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "chat",
        sourceId: "12",
        mode: "observe",
      });
    });

    await waitFor(() => {
      expect(saveAssistantMessageMutateAsync).toHaveBeenCalled();
    });

    expect(trackBrowserSessionOpened).toHaveBeenCalledWith({
      origin_surface: "chat",
      compact_layout: false,
      session_kind: "created",
      launch_path: "direct",
      launch_intent: undefined,
    });
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/automation/live/lbs_chat_1?"),
    );
  });

  it("creates a new conversation first when starting a Browser Session from the welcome state", async () => {
    window.history.replaceState({}, "", "/chat");

    render(<Chat />);

    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Browser Session" }));

    await waitFor(() => {
      expect(createConversationMutateAsync).toHaveBeenCalledWith({
        title: "New Chat",
        model: undefined,
      });
    });

    await waitFor(() => {
      expect(createLiveBrowserSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "chat",
        sourceId: "88",
        mode: "observe",
      });
    });

    await waitFor(() => {
      expect(saveAssistantMessageMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 88,
          content: "Opened Browser Session from Chat.",
        }),
      );
    });
  });

  it("reopens the latest Browser Session instead of creating a new one", async () => {
    messagesData = [
      {
        id: 91,
        role: "assistant",
        content: "Browser Session returned to Chat.",
        artifacts: [
          {
            id: "browser-session-lbs_chat_1-3",
            type: "markdown",
            title: "Browser Session",
            content: "AI is controlling this Browser Session.",
            metadata: {
              browserSession: {
                sessionId: "lbs_chat_1",
                summary: {
                  sessionId: "lbs_chat_1",
                  state: "ai_in_control",
                  badgeLabel: "AI In Control",
                  statusLine: "AI is controlling this Browser Session.",
                  primaryActionLabel: "Continue in Browser",
                  sourceLabel: "Chat",
                },
                launchContext: {
                  originSurface: "chat",
                  originLabel: "Chat",
                  sourceId: "12",
                  returnContext: {
                    path: "/chat?c=12&browserSessionId=lbs_chat_1",
                    label: "Return to Chat",
                  },
                },
                updatedAt: "2026-03-12T10:05:00.000Z",
              },
            },
          },
        ],
      },
    ];

    render(<Chat />);

    fireEvent.click(screen.getAllByRole("button", { name: /Continue in Browser/i })[0]);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/automation/live/lbs_chat_1?"),
      );
    });
    expect(createLiveBrowserSessionMutateAsync).not.toHaveBeenCalled();
    expect(trackBrowserSessionReopened).toHaveBeenCalledWith({
      origin_surface: "chat",
      compact_layout: false,
      session_kind: "resumed",
      launch_path: "direct",
      launch_intent: undefined,
    });
  });

  it("creates and opens a Browser Session from a suggested Chat action", async () => {
    render(<Chat />);

    fireEvent.click(screen.getByRole("button", { name: "Trigger Suggestion" }));

    fireEvent.click(await screen.findByRole("button", { name: "Research in Browser" }));

    await waitFor(() => {
      expect(createLiveBrowserSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "chat",
        sourceId: "12",
        mode: "observe",
        executionIntent: {
          prompt: "ช่วยหาโรงแรมเปรียบเทียบราคาให้หน่อย",
          skillId: "compare_options",
          discoverWebsites: true,
        },
      });
    });

    await waitFor(() => {
      expect(saveAssistantMessageMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 12,
          content: "Opened Browser Session from Chat.",
          artifacts: [
            expect.objectContaining({
              metadata: {
                browserSession: expect.objectContaining({
                  sessionId: "lbs_chat_1",
                  launchContext: expect.objectContaining({
                    originSurface: "chat",
                    sourceId: "12",
                  }),
                }),
              },
            }),
          ],
        }),
      );
    });

    expect(trackBrowserSessionOpened).toHaveBeenCalledWith({
      origin_surface: "chat",
      compact_layout: false,
      session_kind: "created",
      launch_path: "suggested",
      launch_intent: "research_in_browser",
    });
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/automation/live/lbs_chat_1?"),
    );
  });

  it("queues a quick Browser Session instruction inline from Chat", async () => {
    messagesData = [
      {
        id: 91,
        role: "assistant",
        content: "Browser Session returned to Chat.",
        artifacts: [
          {
            id: "browser-session-lbs_chat_1-3",
            type: "markdown",
            title: "Browser Session",
            content: "AI is controlling this Browser Session.",
            metadata: {
              browserSession: {
                sessionId: "lbs_chat_1",
                summary: {
                  sessionId: "lbs_chat_1",
                  state: "ai_in_control",
                  badgeLabel: "AI In Control",
                  statusLine: "AI is controlling this Browser Session.",
                  primaryActionLabel: "Continue in Browser",
                  sourceLabel: "Chat",
                },
                launchContext: {
                  originSurface: "chat",
                  originLabel: "Chat",
                  sourceId: "12",
                  returnContext: {
                    path: "/chat?c=12&browserSessionId=lbs_chat_1",
                    label: "Return to Chat",
                  },
                },
                updatedAt: "2026-03-12T10:05:00.000Z",
              },
            },
          },
        ],
      },
    ];

    render(<Chat />);

    fireEvent.change(
      screen.getByPlaceholderText(/Find the best site for this task/i),
      { target: { value: "Find the best site for this task and continue automatically." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Send Browser Instruction/i }));

    await waitFor(() => {
      expect(sendLiveBrowserCommandMutateAsync).toHaveBeenCalledWith({
        sessionId: "lbs_chat_1",
        sessionVersion: 3,
        idempotencyKey: expect.stringMatching(/^chat-browser-cmd-/),
        actor: { actorType: "user", actorId: "42" },
        command: {
          type: "natural_language",
          text: expect.stringContaining("User goal: Find the best site for this task and continue automatically."),
        },
      });
    });

    expect(screen.getByText("Instruction queued for this Browser Session.")).toBeInTheDocument();
  });
});
