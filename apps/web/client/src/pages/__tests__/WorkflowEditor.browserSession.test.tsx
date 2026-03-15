/**
 * @vitest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetLocation = vi.fn();
const getSessionFetch = vi.fn();
const sendLiveBrowserCommandMutateAsync = vi.fn();
const executionStoreState = {
  isExecuting: false,
  executionId: null as string | null,
  logs: [] as Array<Record<string, unknown>>,
  nodeStatuses: {} as Record<string, unknown>,
  startExecution: vi.fn(),
  updateNodeStatus: vi.fn(),
  addLog: vi.fn(),
  completeExecution: vi.fn(),
  resetExecution: vi.fn(),
  getNodeStatus: vi.fn(() => "pending"),
  getLogs() {
    return executionStoreState.logs;
  },
  canExecute: vi.fn(() => true),
};

vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/editor/17", mockSetLocation],
  useRoute: () => [true, { id: "17" }],
}));

vi.mock("@/stores/executionStore", () => {
  const useExecutionStore = ((selector?: (state: typeof executionStoreState) => unknown) => (
    selector ? selector(executionStoreState) : executionStoreState
  )) as typeof import("@/stores/executionStore").useExecutionStore;

  useExecutionStore.setState = (partial) => {
    Object.assign(executionStoreState, partial);
  };
  useExecutionStore.getState = () => executionStoreState;

  return { useExecutionStore };
});

vi.mock("reactflow", async () => {
  const ReactModule = await import("react");

  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    addEdge: vi.fn(),
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = ReactModule.useState(initial);
      return [nodes, setNodes, vi.fn()] as const;
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = ReactModule.useState(initial);
      return [edges, setEdges, vi.fn()] as const;
    },
    Controls: () => null,
    MiniMap: () => null,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MarkerType: {},
  };
});

vi.mock("@/components/workflow/AutoCreateWorkflowModal", () => ({
  AutoCreateWorkflowModal: () => null,
}));

vi.mock("@/components/workflow/AutoEditWorkflowModal", () => ({
  AutoEditWorkflowModal: () => null,
}));

vi.mock("@/components/workflow/ConvertWithISCDialog", () => ({
  ConvertWithISCDialog: () => null,
}));

vi.mock("@/components/workflow/WorkflowVersionHistory", () => ({
  WorkflowVersionHistory: () => null,
}));

vi.mock("@/components/workflow/nodes/BaseNode", () => ({
  BaseNode: () => null,
}));

vi.mock("@/components/workflow/nodes/GroupNode", () => ({
  default: () => null,
}));

vi.mock("@/components/workflow/config/DynamicNodeConfig", () => ({
  DynamicNodeConfig: () => <div>Dynamic Config</div>,
}));

vi.mock("@/components/workflow/execution/ExecutionLogPanel", () => ({
  ExecutionLogPanel: () => <div>Execution Log Panel</div>,
}));

vi.mock("@/components/workflow/execution/ConsolePanel", () => ({
  ConsolePanel: () => <div>Console Panel</div>,
}));

vi.mock("@/components/workflow/execution/CostEstimation", () => ({
  CostEstimation: () => <div>Cost Estimation</div>,
}));

vi.mock("@/components/workflow/execution/WorkflowRunDialog", () => ({
  WorkflowRunDialog: () => null,
}));

vi.mock("@/components/workflow/TemplateBrowser", () => ({
  TemplateBrowser: () => null,
}));

vi.mock("@/components/workflow/LLMModelSelector", () => ({
  __esModule: true,
  default: () => <div>LLM Model Selector</div>,
}));

vi.mock("@/lib/workflow/useNodeRegistry", () => ({
  useNodeRegistry: () => ({
    nodeTypes: [],
    isLoading: false,
    getNodeTypesByCategory: () => [],
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({
    workflowBrowserSessionNodes: true,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      liveBrowser: {
        getSession: { fetch: getSessionFetch },
      },
    }),
    auth: {
      me: {
        useQuery: () => ({ data: { id: 42 } }),
      },
    },
    liveBrowser: {
      sendCommand: {
        useMutation: () => ({ mutateAsync: sendLiveBrowserCommandMutateAsync, isPending: false }),
      },
    },
    multiProvider: {
      getAvailableModelsWithProviders: {
        useQuery: () => ({ data: {}, isLoading: false }),
      },
    },
    workflow: {
      compile: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      execute: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      save: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      load: {
        useQuery: () => ({
          data: {
            id: 17,
            name: "Trip Workflow",
            description: "Plans itineraries",
            defaultModel: "",
            workflowJson: { nodes: [], edges: [] },
          },
          refetch: vi.fn(),
        }),
      },
      listSaved: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}));

import WorkflowEditor from "../WorkflowEditor";

describe("WorkflowEditor Browser Session integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/workflows/editor/17?browserSessionId=lbs_workflow_1");
    sendLiveBrowserCommandMutateAsync.mockResolvedValue({
      accepted: true,
      sessionVersion: 5,
      commandId: "cmd_workflow_1",
    });
    getSessionFetch.mockResolvedValue({
      sessionId: "lbs_workflow_1",
      tenantId: "tenant-1",
      userId: 42,
      sourceType: "workflow",
      sourceId: "17",
      status: "waiting_for_human",
      controlMode: "observe",
      sessionVersion: 4,
      controllerActorType: null,
      controllerActorId: null,
      controllerConnectionId: null,
      controllerLeaseExpiresAt: null,
      pauseReason: null,
      pendingAssistRequestId: "assist_1",
      pendingApprovalRequestId: null,
      barrierType: "captcha_required",
      policyContext: {},
      browserContextRef: {
        pageTitle: "Captcha Check",
        url: "https://example.com/captcha",
      },
      activeTabCount: 1,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastActivityAt: "2026-03-12T10:08:00.000Z",
      endedAt: null,
      endReason: null,
    });
  });

  it("rehydrates returned Browser Sessions and reopens them from the workflow rail", async () => {
    render(<WorkflowEditor />);

    await waitFor(() => {
      expect(screen.getByText("Captcha Required before AI can continue.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Take Control/i }));

    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/automation/live/lbs_workflow_1?"),
    );

    expect(window.location.search).not.toContain("browserSessionId=lbs_workflow_1");
  });

  it("queues a quick Browser Session instruction inline from Workflow", async () => {
    render(<WorkflowEditor />);

    await waitFor(() => {
      expect(screen.getByText("Browser Session")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText(/Find the best site for this task/i),
      { target: { value: "Find the best site for this workflow task and continue." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Send Browser Instruction/i }));

    await waitFor(() => {
      expect(sendLiveBrowserCommandMutateAsync).toHaveBeenCalledWith({
        sessionId: "lbs_workflow_1",
        sessionVersion: 4,
        idempotencyKey: expect.stringMatching(/^workflow-browser-cmd-/),
        actor: { actorType: "user", actorId: "42" },
        command: {
          type: "natural_language",
          text: expect.stringContaining("User goal: Find the best site for this workflow task and continue."),
        },
      });
    });

    expect(screen.getByText("Instruction queued for this Browser Session.")).toBeInTheDocument();
  });
});
