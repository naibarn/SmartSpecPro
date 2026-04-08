import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HybridOrchestrationCard } from "../HybridOrchestrationCard";
import type { HybridOrchestrationPlan } from "@shared/orchestration/hybridOrchestration";

const setLocation = vi.fn();
const mockCreatePreviewTokenMutation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/chat", setLocation],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      list: {
        useQuery: vi.fn(() => ({
          data: {
            agencies: [{ id: "agency-1", name: "Agency One" }],
          },
        })),
      },
    },
    hybridOrchestration: {
      createPreviewToken: {
        useMutation: vi.fn(() => mockCreatePreviewTokenMutation()),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "chat.hybridCard.confirmTitle": "Use Hybrid Flow?",
        "chat.hybridCard.confirmDescription": "I found a possible hybrid workflow for this request. Please confirm whether you want to open the hybrid flow or keep this as a normal chat question.",
        "chat.hybridCard.confirmHybrid": "Yes, Open Hybrid Flow",
        "chat.hybridCard.answerInChat": "Answer in Chat Instead",
        "chat.hybridCard.approvalRequired": "Approval required",
        "chat.hybridCard.stages": "Stages",
        "chat.hybridCard.routing": "Routing",
        "chat.hybridCard.instructionsPreview": "Hybrid instructions preview",
        "chat.hybridCard.openingPreview": "Opening preview...",
        "hybridPreview.workflowAnchor": "Workflow anchor",
        "hybridPreview.owner.workflow": "Workflow",
        "hybridPreview.owner.swarm": "Swarm",
        "hybridPreview.owner.human": "Human",
      };
      return translations[key] ?? key;
    },
  }),
}));

const plan: HybridOrchestrationPlan = {
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
};

describe("HybridOrchestrationCard", () => {
  beforeEach(() => {
    setLocation.mockReset();
    window.sessionStorage.clear();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid");
    mockCreatePreviewTokenMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        token: "preview-token-123",
        expiresAt: "2026-03-24T12:00:00.000Z",
      }),
      isPending: false,
    });
  });

  it("opens the hybrid preview route with a signed token", async () => {
    render(
      <HybridOrchestrationCard
        message="Build a hybrid flow"
        reason="cooperative request"
        plan={plan}
        onKeepInChat={vi.fn()}
      />,
    );

    expect(screen.getByText(/use hybrid flow\\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, open hybrid flow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /answer in chat instead/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /yes, open hybrid flow/i }));

    await waitFor(() => {
      expect(setLocation).toHaveBeenCalledWith("/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123");
    });
  });

  it("lets the user keep the request in chat", () => {
    const onKeepInChat = vi.fn();

    render(
      <HybridOrchestrationCard
        message="Build a hybrid flow"
        reason="cooperative request"
        plan={plan}
        onKeepInChat={onKeepInChat}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /answer in chat instead/i }));

    expect(onKeepInChat).toHaveBeenCalledTimes(1);
  });
});
