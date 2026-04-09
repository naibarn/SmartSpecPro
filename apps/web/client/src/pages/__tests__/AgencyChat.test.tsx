/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  mockSetLocation,
  mockUseRoute,
  mockGetPreviewFetch,
  mockGetCompilePreviewFetch,
  mockCreateHybridPreviewTokenMutateAsync,
  mockSubmitApprovalMutateAsync,
} = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockUseRoute: vi.fn((pattern: string) => (
    pattern === "/agencies/:id/review"
      ? [false, null]
      : [true, { id: "agency-1" }]
  )),
  mockGetPreviewFetch: vi.fn(),
  mockGetCompilePreviewFetch: vi.fn(),
  mockCreateHybridPreviewTokenMutateAsync: vi.fn(),
  mockSubmitApprovalMutateAsync: vi.fn(),
}));

// Mock wouter
vi.mock("wouter", () => ({
  useRoute: mockUseRoute,
  useLocation: vi.fn(() => ["/agencies/agency-1", mockSetLocation]),
}));

// Mock auth
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "42", name: "Test" },
  })),
}));

// Mock tRPC hooks
vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyById: vi.fn(() => ({
    data: { id: "agency-1", name: "Test Agency" },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agency: {
        getImprovementSuggestions: { invalidate: vi.fn() },
        getImprovementHistory: { invalidate: vi.fn() },
        getCompilePreview: { fetch: mockGetCompilePreviewFetch },
      },
      hybridOrchestration: {
        getPreview: {
          fetch: mockGetPreviewFetch,
        },
      },
      liveBrowser: {
        getSession: { fetch: vi.fn() },
      },
    }),
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: () => ({ data: { agencyBrowserSessionUi: false } }),
      },
    },
    agency: {
      getImprovementSuggestions: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      getImprovementHistory: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      reviewAgency: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      submitApproval: {
        useMutation: () => ({ mutateAsync: mockSubmitApprovalMutateAsync, isPending: false }),
      },
      applyImprovement: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    hybridOrchestration: {
      createPreviewToken: {
        useMutation: () => ({
          mutateAsync: mockCreateHybridPreviewTokenMutateAsync,
          isPending: false,
        }),
      },
      refreshPreviewToken: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    liveBrowser: {
      createSession: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      sendCommand: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const dictionary: Record<string, string> = {
        "chat.agency": "Agency",
        "chat.agencyNotFound": "Agency not found",
        "chat.agentsCount": `${values?.count ?? 0} agents`,
        "chat.sendMessage": "Send a message to start the conversation",
        "chat.messagePlaceholder": `Message ${values?.name ?? "Agency"}`,
        "chat.credits": "credits",
        "chat.hybridLoaded": "Hybrid orchestration loaded",
        "chat.stages": `${values?.count ?? 0} stages`,
        "chat.openDetailedPreview": "Open detailed preview",
        "chat.regeneratePreviewToken": "Regenerate preview token",
        "chat.previewFailed": "Preview failed",
        "chat.toast.previewLoadFailed": "Preview load failed",
        "chat.toast.previewFailed": "Preview failed",
        "chat.errorTitle": "Something went wrong",
        "chat.retry": "Retry",
      };
      return dictionary[key] ?? key;
    },
  }),
}));

// Mock stream hook
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
vi.mock("@/hooks/useAgencyStream", () => ({
  useAgencyStream: vi.fn(() => ({
    runId: null,
    messages: [],
    activeAgent: null,
    isStreaming: false,
    error: null,
    creditsUsed: 0,
    activityEvents: [],
    toolCalls: [],
    guardrailEvents: [],
    pendingApproval: null,
    isPollingFallback: false,
    hybridSummary: null,
    stepAttemptSnapshots: [],
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}));

import AgencyChat from "../AgencyChat";

describe("AgencyChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRoute.mockImplementation((pattern: string) => (
      pattern === "/agencies/:id/review"
        ? [false, null]
        : [true, { id: "agency-1" }]
    ));
    mockGetPreviewFetch.mockResolvedValue({
      draft: "Create a hybrid orchestration flow",
      plan: {
        mode: "hybrid",
        blendMode: "balanced-mixed",
        summary: "Hybrid orchestration summary.",
        workflowAnchor: "workflow-planner",
        swarmRoles: ["explorer", "critic"],
        requiresApproval: true,
        reason: "cooperative_flow",
        stages: [
          {
            id: "workflow-intake",
            type: "intake",
            owner: "workflow",
            title: "Lock scope",
            description: "Create a brief.",
            inputs: ["message"],
            outputs: ["brief"],
          },
          {
            id: "swarm-explore",
            type: "explore",
            owner: "swarm",
            title: "Explore options",
            description: "Research options.",
            inputs: ["brief"],
            outputs: ["options"],
          },
          {
            id: "human-approval",
            type: "approval",
            owner: "human",
            title: "Approve",
            description: "Approve the flow.",
            inputs: ["options"],
            outputs: ["approval"],
            gate: "required",
          },
          {
            id: "workflow-commit",
            type: "commit",
            owner: "workflow",
            title: "Commit",
            description: "Execute the plan.",
            inputs: ["approval"],
            outputs: ["result"],
          },
        ],
      },
    });
    mockCreateHybridPreviewTokenMutateAsync.mockResolvedValue({
      token: "preview-token-regenerated",
      expiresAt: "2026-03-24T11:30:00.000Z",
    });
    mockSubmitApprovalMutateAsync.mockResolvedValue({ success: true });
    mockGetCompilePreviewFetch.mockResolvedValue({
      status: "success",
      diagnostics: [],
      planSummary: {
        engineMix: ["agency_swarm"],
        subgraphCount: 1,
        bridgeCount: 0,
      },
    });
  });

  it("renders agency name in header", () => {
    render(<AgencyChat />);
    expect(screen.getAllByText("Test Agency").length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state when no messages", () => {
    render(<AgencyChat />);
    expect(screen.getByText("Send a message to start the conversation")).toBeTruthy();
  });

  it("renders message input area", () => {
    render(<AgencyChat />);
    expect(
      screen.getByPlaceholderText(/Message Test Agency/i),
    ).toBeTruthy();
  });

  it("renders with messages from stream", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [
        { id: "u1", role: "user", content: "Hello" },
        {
          id: "a1",
          role: "assistant",
          content: "Hi there!",
          agentName: "Researcher",
        },
      ],
      activeAgent: "Researcher",
      isStreaming: false,
      error: null,
      creditsUsed: 0.5,
      activityEvents: [],
      toolCalls: [],
      guardrailEvents: [],
      pendingApproval: null,
      isPollingFallback: false,
      hybridSummary: null,
      stepAttemptSnapshots: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("Hi there!")).toBeTruthy();
    expect(screen.getAllByText("Researcher").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error message when stream errors", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [],
      activeAgent: null,
      isStreaming: false,
      error: "Connection lost",
      creditsUsed: 0,
      activityEvents: [],
      toolCalls: [],
      guardrailEvents: [],
      pendingApproval: null,
      isPollingFallback: false,
      hybridSummary: null,
      stepAttemptSnapshots: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("Connection lost")).toBeTruthy();
  });

  it("shows credit usage when available", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [{ id: "u1", role: "user", content: "test" }],
      activeAgent: null,
      isStreaming: false,
      error: null,
      creditsUsed: 1.25,
      activityEvents: [],
      toolCalls: [],
      guardrailEvents: [],
      pendingApproval: null,
      isPollingFallback: false,
      hybridSummary: null,
      stepAttemptSnapshots: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("1.25 credits")).toBeTruthy();
  });

  it("shows regenerate preview controls for loaded hybrid flows", async () => {
    mockUseRoute.mockImplementation((pattern: string) => (
      pattern === "/agencies/:id/review"
        ? [false, null]
        : [true, { id: "agency-1" }]
    ));
    window.history.pushState({}, "", "/agencies/agency-1?hybridPreviewToken=preview-token-123");

    render(<AgencyChat />);

    expect(await screen.findByText("Hybrid orchestration loaded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /regenerate preview token/i }));

    await waitFor(() => {
      expect(mockCreateHybridPreviewTokenMutateAsync).toHaveBeenCalledWith({
        agencyId: "agency-1",
        payload: {
          draft: "Create a hybrid orchestration flow",
          plan: expect.objectContaining({
            mode: "hybrid",
          }),
        },
        sourceSurface: "agency-chat",
      });
    });

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-regenerated",
      );
    });
  });

  it("shows regenerate preview controls in review center header", async () => {
    mockUseRoute.mockImplementation((pattern: string) => (
      pattern === "/agencies/:id/review"
        ? [true, { id: "agency-1" }]
        : [false, null]
    ));
    window.history.pushState({}, "", "/agencies/agency-1/review?hybridPreviewToken=preview-token-123");

    render(<AgencyChat />);

    expect(await screen.findByText("Hybrid orchestration loaded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /regenerate preview token/i }));

    await waitFor(() => {
      expect(mockCreateHybridPreviewTokenMutateAsync).toHaveBeenCalledWith({
        agencyId: "agency-1",
        payload: {
          draft: "Create a hybrid orchestration flow",
          plan: expect.objectContaining({
            mode: "hybrid",
          }),
        },
        sourceSurface: "agency-chat",
      });
    });

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-regenerated",
      );
    });
  });

  it("loads compile preview before connecting a run", async () => {
    render(<AgencyChat />);

    const input = screen.getByPlaceholderText(/Message Test Agency/i);
    fireEvent.change(input, { target: { value: "Please help" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(mockGetCompilePreviewFetch).toHaveBeenCalledWith({ agencyId: "agency-1" });
    });

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
        agencyId: "agency-1",
        message: "Please help",
        compilePreview: expect.objectContaining({
          status: "success",
        }),
      }));
    });
  });
});
