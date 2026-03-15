/**
 * @vitest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAgencyStreamMock } = vi.hoisted(() => ({
  useAgencyStreamMock: vi.fn(),
}));
const { trackBrowserSessionOpened, trackBrowserSessionReopened } = vi.hoisted(() => ({
  trackBrowserSessionOpened: vi.fn(),
  trackBrowserSessionReopened: vi.fn(),
}));

const mockSetLocation = vi.fn();
const createLiveBrowserSessionMutateAsync = vi.fn();
const sendLiveBrowserCommandMutateAsync = vi.fn();
const getSessionFetch = vi.fn();
const getRunPreviewFetch = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/agencies/agency-1", mockSetLocation],
  useRoute: () => [true, { id: "agency-1" }],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 42 },
  }),
}));

vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyById: () => ({
    data: {
      id: "agency-1",
      name: "Support Agency",
      description: "Helps users navigate workflows.",
      agents: [{ id: "agent-1", name: "Guide", nodeType: "agent", isEntryPoint: true }],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useAgencyStream", () => ({
  useAgencyStream: useAgencyStreamMock,
}));

vi.mock("@/components/agency/ModelPicker", () => ({
  ModelPicker: () => <div>Model Picker</div>,
}));

vi.mock("@/components/agency/AgencyActivityPanel", () => ({
  default: () => <div>Activity Panel</div>,
}));

vi.mock("@/components/chat/SafeMarkdown", () => ({
  SafeMarkdown: ({ children }: { children: string }) => <>{children}</>,
}));

vi.mock("@/lib/analytics/browserSessionEvents", () => ({
  trackBrowserSessionOpened,
  trackBrowserSessionReopened,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agency: {
        getRunPreview: { fetch: getRunPreviewFetch },
      },
      liveBrowser: {
        getSession: { fetch: getSessionFetch },
      },
    }),
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: () => ({ data: { agencyBrowserSessionUi: true } }),
      },
    },
    agency: {
      commitPreview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
  },
}));

import AgencyChat from "../AgencyChat";

describe("AgencyChat Browser Session surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgencyStreamMock.mockReturnValue({
      messages: [],
      activeAgent: null,
      isStreaming: false,
      error: null,
      creditsUsed: 0,
      activityEvents: [],
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/agencies/agency-1");
    getSessionFetch.mockResolvedValue({
      sessionId: "lbs_agency_1",
      tenantId: "tenant-1",
      userId: 42,
      sourceType: "agency",
      sourceId: "agency-1",
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
        pageTitle: "Account Dashboard",
        url: "https://example.com/dashboard",
      },
      activeTabCount: 1,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastActivityAt: "2026-03-12T10:05:00.000Z",
      endedAt: null,
      endReason: null,
    });
    createLiveBrowserSessionMutateAsync.mockResolvedValue({
      sessionId: "lbs_agency_1",
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
      commandId: "cmd_agency_1",
    });
    getRunPreviewFetch.mockResolvedValue({
      preview: {
        previewType: "comparison",
        artifactId: "art-preview-1",
        intent: "hotel_comparison",
        lifecycleState: "preview_generated",
        summaryText: "Comparison ready.",
        provenance: [],
        commit: {
          status: "preview_generated",
          token: "commit-tok-1",
          available: true,
          supported: true,
          targetType: null,
          targetId: null,
        },
        data: {
          comparisonKind: "hotel",
          title: "Hotels near BTS Asok",
          summary: "Best balance of price and distance.",
          locationSummary: "Asok, Bangkok",
          comparedAt: "2026-03-12T10:07:00.000Z",
          sortHint: "Lowest total price first",
          recommendations: ["Pick the closest refundable option."],
          options: [
            {
              vendor: "Booking.com",
              optionTitle: "Centre Point Asok",
              price: 4200,
              currency: "THB",
              priceLabel: "THB 4,200",
              distance: 350,
              distanceUnit: "m",
              distanceLabel: "350 m",
              locationSummary: "7-minute walk to BTS Asok",
              availabilityState: "limited",
              refundable: true,
              bookingLink: "https://example.com/hotel-1",
              notes: "Breakfast included",
              capturedAt: "2026-03-12T10:07:00.000Z",
              evidence: [
                {
                  label: "Rate card",
                  url: "https://example.com/rate-1",
                  snippet: "Breakfast included",
                },
              ],
            },
          ],
        },
      },
    });
  });

  it("creates and opens a Browser Session from Agency Chat", async () => {
    render(<AgencyChat />);

    fireEvent.click(screen.getByRole("button", { name: /Open Browser Session/i }));

    await waitFor(() => {
      expect(createLiveBrowserSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "agency",
        sourceId: "agency-1",
        mode: "observe",
      });
    });

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/automation/live/lbs_agency_1?"),
      );
    });

    expect(trackBrowserSessionOpened).toHaveBeenCalledWith({
      origin_surface: "agency",
      compact_layout: false,
      session_kind: "created",
      launch_path: "direct",
      launch_intent: undefined,
    });
  });

  it("renders the returned Browser Session state rail inside Agency Chat", async () => {
    getSessionFetch.mockResolvedValue({
      sessionId: "lbs_agency_1",
      tenantId: "tenant-1",
      userId: 42,
      sourceType: "agency",
      sourceId: "agency-1",
      status: "waiting_for_human",
      controlMode: "observe",
      sessionVersion: 4,
      controllerActorType: null,
      controllerActorId: null,
      controllerConnectionId: null,
      controllerLeaseExpiresAt: null,
      pauseReason: "assist_pending",
      pendingAssistRequestId: "assist_1",
      pendingApprovalRequestId: null,
      policyContext: {},
      browserContextRef: {
        pageTitle: "Checkout",
        url: "https://example.com/checkout",
      },
      activeTabCount: 1,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastActivityAt: "2026-03-12T10:06:00.000Z",
      endedAt: null,
      endReason: null,
    });
    window.history.replaceState({}, "", "/agencies/agency-1?browserSessionId=lbs_agency_1");

    render(<AgencyChat />);

    await waitFor(() => {
      expect(screen.getByText("Browser Session")).toBeInTheDocument();
    });

    expect(screen.getByText("Needs Your Input before AI can continue.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Continue in Browser/i })).toHaveLength(2);
  });

  it("renders streamed Browser Session artifacts from Agency runs", async () => {
    render(<AgencyChat />);

    const streamOptions = useAgencyStreamMock.mock.calls[0]?.[0];
    expect(streamOptions?.onBrowserSession).toBeTypeOf("function");

    act(() => {
      streamOptions.onBrowserSession({
        sessionId: "lbs_agency_stream_1",
        summary: {
          sessionId: "lbs_agency_stream_1",
          state: "needs_user_input",
          badgeLabel: "Take Control",
          statusLine: "Take control to continue this Browser Session.",
          primaryActionLabel: "Take Control",
          pageTitle: "Payment",
          url: "https://example.com/payment",
          compactNotice: null,
          sourceLabel: "Agency",
        },
        updatedAt: "2026-03-12T10:07:00.000Z",
      });
    });

    expect(screen.getByText("Take control to continue this Browser Session.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Take Control/i })).toHaveLength(2);
    expect(window.sessionStorage.getItem("agency-browser-session:agency-1")).toContain("lbs_agency_stream_1");
  });

  it("queues a quick Browser Session instruction inline from Agency Chat", async () => {
    window.history.replaceState({}, "", "/agencies/agency-1?browserSessionId=lbs_agency_1");

    render(<AgencyChat />);

    await waitFor(() => {
      expect(screen.getByText("Browser Session")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText(/Find the right site, compare choices/i),
      { target: { value: "Find the right site, compare choices, and continue automatically." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Send Browser Instruction/i }));

    await waitFor(() => {
      expect(sendLiveBrowserCommandMutateAsync).toHaveBeenCalledWith({
        sessionId: "lbs_agency_1",
        sessionVersion: 3,
        idempotencyKey: expect.stringMatching(/^agency-browser-cmd-/),
        actor: { actorType: "user", actorId: "42" },
        command: {
          type: "natural_language",
          text: expect.stringContaining("User goal: Find the right site, compare choices, and continue automatically."),
        },
      });
    });

    expect(screen.getByText("Instruction queued for this Browser Session.")).toBeInTheDocument();
  });

  it("suggests a Browser Session from agency intent and opens it after confirmation", async () => {
    render(<AgencyChat />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, {
      target: { value: "ช่วยหาโรงแรมเปรียบเทียบราคาแล้วจองให้หน่อย" },
    });
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter", charCode: 13 });

    fireEvent.click(await screen.findByRole("button", { name: "Research in Browser" }));

    await waitFor(() => {
      expect(createLiveBrowserSessionMutateAsync).toHaveBeenCalledWith({
        actor: { actorType: "user", actorId: "42" },
        sourceType: "agency",
        sourceId: "agency-1",
        mode: "observe",
        executionIntent: {
          prompt: "ช่วยหาโรงแรมเปรียบเทียบราคาแล้วจองให้หน่อย",
          skillId: "checkout_assistant",
          discoverWebsites: true,
        },
      });
    });

    expect(trackBrowserSessionOpened).toHaveBeenCalledWith({
      origin_surface: "agency",
      compact_layout: false,
      session_kind: "created",
      launch_path: "suggested",
      launch_intent: "research_in_browser",
    });
  });

  it("renders comparison previews from preview_ready stream events", async () => {
    render(<AgencyChat />);

    const streamOptions = useAgencyStreamMock.mock.calls[0]?.[0];
    expect(streamOptions?.onPreviewReady).toBeTypeOf("function");

    await act(async () => {
      await streamOptions.onPreviewReady({
        runId: "run-42",
        previewArtifactIds: ["artifact-1"],
        intent: "hotel_comparison",
        summary: "Comparison ready.",
      });
    });

    await waitFor(() => {
      expect(getRunPreviewFetch).toHaveBeenCalledWith({
        agencyId: "agency-1",
        runId: "run-42",
      });
    });

    expect(screen.getByText("Hotels near BTS Asok")).toBeInTheDocument();
    expect(screen.getByText("THB 4,200")).toBeInTheDocument();
    expect(screen.getByText("350 m")).toBeInTheDocument();
    expect(screen.getByText("Rate card")).toBeInTheDocument();
  });
});
