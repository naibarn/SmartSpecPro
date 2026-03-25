import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HybridOrchestrationExecution, HybridPlanPayload } from "@shared/orchestration/hybridOrchestration";

const {
  setLocation,
  mockUseUtils,
  mockGetPreviewUseQuery,
  mockGetExecutionUseQuery,
  mockCreatePreviewTokenMutation,
  mockRefreshPreviewTokenMutation,
  mockStartExecutionMutation,
  mockAdvanceExecutionMutation,
} = vi.hoisted(() => ({
  setLocation: vi.fn(),
  mockUseUtils: vi.fn(),
  mockGetPreviewUseQuery: vi.fn(),
  mockGetExecutionUseQuery: vi.fn(),
  mockCreatePreviewTokenMutation: vi.fn(),
  mockRefreshPreviewTokenMutation: vi.fn(),
  mockStartExecutionMutation: vi.fn(),
  mockAdvanceExecutionMutation: vi.fn(),
}));

import HybridOrchestrationPreview from "../HybridOrchestrationPreview";

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "agency-1" }],
  useLocation: () => [
    "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123",
    setLocation,
  ],
}));

vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyById: () => ({
    data: {
      id: "agency-1",
      name: "Agency One",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mockUseUtils,
    hybridOrchestration: {
      getPreview: {
        useQuery: mockGetPreviewUseQuery,
      },
      getExecution: {
        useQuery: mockGetExecutionUseQuery,
      },
      createPreviewToken: {
        useMutation: mockCreatePreviewTokenMutation,
      },
      refreshPreviewToken: {
        useMutation: mockRefreshPreviewTokenMutation,
      },
      startExecution: {
        useMutation: mockStartExecutionMutation,
      },
      advanceExecution: {
        useMutation: mockAdvanceExecutionMutation,
      },
    },
  },
}));

const payload: HybridPlanPayload = {
  draft: "Create a hybrid orchestration flow",
  plan: {
    mode: "hybrid",
    blendMode: "balanced-mixed",
    summary: "Hybrid flow uses workflow for control and swarm for reasoning.",
    workflowAnchor: "workflow-planner",
    swarmRoles: ["explorer", "critic", "synthesizer"],
    requiresApproval: true,
    reason: "cooperative_multi_step_request",
    stages: [
      {
        id: "workflow-intake",
        type: "intake",
        owner: "workflow",
        title: "Lock scope and constraints",
        description: "Convert the request into a deterministic brief.",
        inputs: ["user message"],
        outputs: ["brief"],
      },
      {
        id: "swarm-explore",
        type: "explore",
        owner: "swarm",
        title: "Explore alternatives",
        description: "Generate options in parallel.",
        inputs: ["brief"],
        outputs: ["options"],
      },
      {
        id: "workflow-validate",
        type: "validate",
        owner: "workflow",
        title: "Validate and reconcile",
        description: "Merge the best output.",
        inputs: ["options"],
        outputs: ["validated plan"],
      },
      {
        id: "human-approval",
        type: "approval",
        owner: "human",
        title: "Approve or adjust",
        description: "Human review point.",
        inputs: ["validated plan"],
        outputs: ["approval decision"],
        gate: "required",
      },
      {
        id: "workflow-commit",
        type: "commit",
        owner: "workflow",
        title: "Commit the final action",
        description: "Execute the approved plan.",
        inputs: ["approval decision"],
        outputs: ["result"],
      },
    ],
  },
};

const execution: HybridOrchestrationExecution = {
  executionId: "exec-1",
  previewToken: "preview-token-123",
  tenantId: "tenant-1",
  userId: 7,
  agencyId: "agency-1",
  status: "awaiting_approval",
  blendMode: "balanced-mixed",
  currentStageIndex: 3,
  currentStageId: "human-approval",
  plan: payload.plan,
  draft: payload.draft,
  stageStates: payload.plan.stages.map((stage, index) => ({
    id: stage.id,
    status: index < 3 ? "completed" : index === 3 ? "running" : "pending",
    startedAt: index < 3 ? "2026-03-24T10:00:00.000Z" : index === 3 ? "2026-03-24T10:01:00.000Z" : null,
    completedAt: index < 3 ? "2026-03-24T10:00:30.000Z" : null,
    note: null,
  })),
  history: [
    {
      at: "2026-03-24T10:00:00.000Z",
      action: "start",
      stageId: null,
      note: "Hybrid flow started in balanced-mixed mode",
    },
  ],
  approvalDecision: null,
  revisionCount: 0,
  notes: null,
  createdAt: "2026-03-24T10:00:00.000Z",
  updatedAt: "2026-03-24T10:01:00.000Z",
  expiresAt: "2026-03-24T10:30:00.000Z",
};

describe("HybridOrchestrationPreview", () => {
  beforeEach(() => {
    setLocation.mockReset();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123");

    mockUseUtils.mockReturnValue({
      hybridOrchestration: {
        getExecution: {
          invalidate: vi.fn(),
        },
      },
    });

    mockGetPreviewUseQuery.mockImplementation((input: { token: string }) => ({
      data: input.token === "preview-token-123" ? payload : undefined,
      isLoading: false,
    }));

    mockGetExecutionUseQuery.mockImplementation((input: { executionId: string }) => ({
      data: input.executionId === "exec-1" ? execution : undefined,
      isLoading: false,
    }));

    mockCreatePreviewTokenMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockRefreshPreviewTokenMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockStartExecutionMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        execution,
      }),
      isPending: false,
    });

    mockAdvanceExecutionMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        execution,
      }),
      isPending: false,
    });
  });

  it("shows the preview details, supports blend mode selection, and starts from the token route", async () => {
    render(<HybridOrchestrationPreview />);

    expect(screen.getByText(/Hybrid Preview/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        (content, element) =>
          element?.getAttribute("data-slot") === "card-description" &&
          content.includes("Hybrid flow uses workflow for control and swarm for reasoning"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Stage Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow-first vs Swarm-first/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workflow-first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Swarm-first" })).toBeInTheDocument();
    expect(screen.getByText(/Suggested balance/i)).toBeInTheDocument();
    expect(
      screen.getByText(/workflow-first should lead the execution while the swarm feeds options/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Lock scope and constraints/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /swarm-first/i }));

    fireEvent.click(screen.getByRole("button", { name: /start hybrid flow/i }));

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123&executionId=exec-1",
      );
    });
  });

  it("automatically refreshes an expired preview token without interrupting the page", async () => {
    const refreshedPayload = payload;
    const refreshMutateAsync = vi.fn().mockResolvedValue({
      token: "preview-token-456",
      expiresAt: "2026-03-24T11:00:00.000Z",
    });
    const getPreviewAfterRefresh = vi.fn((input: { token: string }) => ({
      data: input.token === "preview-token-456" ? refreshedPayload : undefined,
      isLoading: false,
      isFetched: true,
    }));

    mockGetPreviewUseQuery.mockImplementation(getPreviewAfterRefresh);
    mockRefreshPreviewTokenMutation.mockReturnValue({
      mutateAsync: refreshMutateAsync,
      isPending: false,
    });

    render(<HybridOrchestrationPreview />);

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledWith({ previewToken: "preview-token-123" });
    });

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-456",
      );
    });

    expect(screen.getByText(/Hybrid Preview/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        (content, element) =>
          element?.getAttribute("data-slot") === "card-description" &&
          content.includes("Hybrid flow uses workflow for control and swarm for reasoning"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No hybrid plan loaded/i)).not.toBeInTheDocument();
  });

  it("can regenerate a fresh preview token from the loaded snapshot", async () => {
    const regenerateMutateAsync = vi.fn().mockResolvedValue({
      token: "preview-token-789",
      expiresAt: "2026-03-24T11:30:00.000Z",
    });
    mockCreatePreviewTokenMutation.mockReturnValue({
      mutateAsync: regenerateMutateAsync,
      isPending: false,
    });

    render(<HybridOrchestrationPreview />);

    fireEvent.click(screen.getByRole("button", { name: /regenerate preview token/i }));

    await waitFor(() => {
      expect(regenerateMutateAsync).toHaveBeenCalledWith({
        agencyId: "agency-1",
        payload: {
          draft: payload.draft,
          plan: payload.plan,
        },
        sourceSurface: "review-center",
      });
    });

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-789",
      );
    });
  });
});
