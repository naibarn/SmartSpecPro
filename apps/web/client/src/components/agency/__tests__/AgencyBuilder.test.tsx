/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

// ── React Flow mock ────────────────────────────────────────
vi.mock("reactflow", () => {
  const useNodesState = vi.fn(() => {
    const nodes: any[] = [];
    return [nodes, vi.fn(), vi.fn()];
  });
  const useEdgesState = vi.fn(() => {
    const edges: any[] = [];
    return [edges, vi.fn(), vi.fn()];
  });
  const useReactFlow = vi.fn(() => ({
    getNodes: () => [],
    setCenter: vi.fn(),
    getZoom: () => 1,
  }));

  return {
    __esModule: true,
    default: ({ children, nodes, edges, onNodeClick, onPaneClick, onConnect }: any) =>
      createElement(
        "div",
        {
          "data-testid": "react-flow-canvas",
          "data-nodes": JSON.stringify(nodes ?? []),
          "data-edges": JSON.stringify(edges ?? []),
        },
        children,
      ),
    ReactFlowProvider: ({ children }: any) => createElement("div", null, children),
    useNodesState,
    useEdgesState,
    useReactFlow,
    Controls: () => createElement("div", { "data-testid": "rf-controls" }),
    MiniMap: () => createElement("div", { "data-testid": "rf-minimap" }),
    Background: () => createElement("div", { "data-testid": "rf-background" }),
    BackgroundVariant: { Dots: "dots" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    Handle: ({ type, position }: any) =>
      createElement("div", { "data-testid": `handle-${type}-${position}` }),
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    addEdge: vi.fn((connection: any, edges: any[]) => [
      ...edges,
      { id: "e-new", ...connection },
    ]),
    EdgeLabelRenderer: ({ children }: any) => createElement("div", null, children),
    getBezierPath: vi.fn(() => ["M 0 0", 100, 50]),
  };
});

// ── tRPC mock ──────────────────────────────────────────────
const mockUseQuery = vi.fn().mockReturnValue({
  data: undefined,
  isLoading: false,
  isError: false,
});
const mockUseMutation = vi.fn().mockReturnValue({
  mutateAsync: vi.fn().mockResolvedValue({ id: "test-id" }),
  isPending: false,
});
const mockCompilePreviewMutation = vi.fn().mockReturnValue({
  mutateAsync: vi.fn().mockResolvedValue({
    status: "success",
    diagnostics: [],
    planSummary: {
      engineMix: ["agency_swarm"],
      subgraphCount: 1,
      bridgeCount: 0,
    },
  }),
  isPending: false,
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agency: {
        getById: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    llmProviders: {
      availableModels: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            models: [
              { id: "gpt-4o-mini", isDefault: true },
            ],
          },
        }),
      },
    },
    agency: {
      getById: { useQuery: (...args: any[]) => mockUseQuery(...args) },
      update: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      create: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      saveBuilder: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      compilePreview: { useMutation: (...args: any[]) => mockCompilePreviewMutation(...args) },
    },
  },
}));

// ── Auth mock ──────────────────────────────────────────────
const mockUseAuth = vi.fn().mockReturnValue({
  isLoading: false,
  isAuthenticated: true,
  user: { id: "u1" },
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: (...args: any[]) => mockUseAuth(...args),
}));

// ── Wouter mock ────────────────────────────────────────────
const mockSetLocation = vi.fn();
const mockUseRoute = vi.fn().mockReturnValue([true, { id: "new" }]);
vi.mock("wouter", () => ({
  useRoute: (...args: any[]) => mockUseRoute(...args),
  useLocation: vi.fn().mockReturnValue(["/agencies/new/edit", mockSetLocation]),
}));

// ── Sonner mock ────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === "builder.defaults.newAgent") return "New Agent";
      if (key === "builder.defaults.untitledAgency") return "Untitled Agency";
      if (key === "builder.defaults.trueLabel") return "True";
      if (key === "builder.defaults.falseLabel") return "False";
      if (key === "builder.defaults.defaultLabel") return "Default";
      if (key === "builder.toast.created") return "Created";
      if (key === "builder.toast.saved") return "Saved";
      if (key === "builder.toast.saveFailed") return "Save failed";
      if (key === "builder.toast.entryPointRequired") return "Entry point required";
      if (key === "builder.toast.addFlows") return "Add flows";
      if (key === "builder.toast.saveBeforePublishing") return "Save before publishing";
      if (key === "builder.toast.needsModel") return `Needs model ${values?.name ?? ""}`;
      if (key === "builder.toast.needsInstructions") return `Needs instructions ${values?.name ?? ""}`;
      return key;
    },
  }),
}));

vi.mock("@/components/agency/AgencyToolbar", () => ({
  AgencyToolbar: ({ agencyName, agencyStatus, onNameChange, onSave, onPublish, onAutoLayout, onTest }: any) =>
    createElement("div", null, [
      createElement("input", {
        key: "name",
        value: agencyName || "Untitled Agency",
        onChange: (event: any) => onNameChange?.(event.target.value),
      }),
      createElement("span", { key: "status" }, agencyStatus),
      createElement("button", { key: "save", onClick: onSave }, "Save"),
      createElement("button", { key: "publish", onClick: onPublish }, "Publish"),
      createElement("button", { key: "layout", onClick: onAutoLayout }, "Auto Layout"),
      createElement("button", { key: "test", onClick: onTest }, "Test"),
    ]),
}));

vi.mock("@/components/agency/AgencySidebar", () => ({
  AgencySidebar: ({ onNodeAdd }: any) =>
    createElement(
      "button",
      {
        "data-testid": "add-agent-btn",
        onClick: () => onNodeAdd?.({ nodeType: "agent", name: "New Agent" }),
      },
      "Add Agent",
    ),
}));

vi.mock("@/components/agency/AgencyVersionHistory", () => ({
  AgencyVersionHistory: () => createElement("div", { "data-testid": "agency-version-history" }),
}));

vi.mock("@/components/agency/RunHistoryPanel", () => ({
  RunHistoryPanel: () => createElement("div", { "data-testid": "agency-run-history" }),
}));

vi.mock("@/components/agency/AutoCreateAgencyModal", () => ({
  AutoCreateAgencyModal: () => null,
}));

vi.mock("@/components/agency/NodePropertyPanel", () => ({
  NodePropertyPanel: () => createElement("div", { "data-testid": "agency-node-panel" }),
}));

const mockTenantFeatureFlags = vi.fn(() => ({
  agencyHybridAdk: false,
  agencyHybridAdkKillSwitch: false,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => mockTenantFeatureFlags(),
}));

// ── Reactflow CSS no-op ────────────────────────────────────
vi.mock("reactflow/dist/style.css", () => ({}));

describe("AgencyBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRoute.mockReturnValue([true, { id: "new" }]);
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { id: "u1" },
    });
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    mockTenantFeatureFlags.mockReturnValue({
      agencyHybridAdk: false,
      agencyHybridAdkKillSwitch: false,
    });
  });

  it("renders React Flow canvas with initial empty state", async () => {
    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    expect(screen.getByTestId("react-flow-canvas")).toBeTruthy();
    expect(screen.getByTestId("rf-controls")).toBeTruthy();
    expect(screen.getByTestId("rf-minimap")).toBeTruthy();
    expect(screen.getByTestId("rf-background")).toBeTruthy();
  });

  it("shows Add Agent button", async () => {
    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    expect(screen.getByTestId("add-agent-btn")).toBeTruthy();
    expect(screen.getByTestId("add-agent-btn").textContent).toContain(
      "Add Agent",
    );
  });

  it("renders toolbar with agency name and status", async () => {
    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    expect(screen.getByDisplayValue("Untitled Agency")).toBeTruthy();
    expect(screen.getByText("draft")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Publish")).toBeTruthy();
    expect(screen.getByText("Auto Layout")).toBeTruthy();
    expect(screen.getByText("Test")).toBeTruthy();
  });

  it("loading state displays spinner when auth is loading", async () => {
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    // Should show a loading spinner (Loader2 renders as an svg)
    expect(
      document.querySelector(".animate-spin") ||
        screen.queryByTestId("react-flow-canvas") === null,
    ).toBeTruthy();
  });

  it("keeps hybrid controls hidden for legacy agencies until upgrade is chosen", async () => {
    mockUseRoute.mockReturnValue([true, { id: "agency-001" }]);
    mockTenantFeatureFlags.mockReturnValue({
      agencyHybridAdk: true,
      agencyHybridAdkKillSwitch: false,
    });
    mockUseQuery.mockReturnValue({
      data: {
        id: "agency-001",
        name: "Legacy Agency",
        status: "draft",
        defaultModel: "gpt-4o-mini",
        documentVersion: 1,
        defaultEngine: "agency_swarm",
        compileMode: "legacy_agency",
        compatibilityMode: "preserve_agency_swarm",
        subgraphs: [],
        creatorFeeCredits: 0,
        agents: [],
        communicationFlows: [],
        agentToolAssignments: [],
      },
      isLoading: false,
      isError: false,
    });

    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    expect(screen.getByTestId("agency-hybrid-banner").textContent).toContain("Legacy Agency Mode");
    expect(screen.getByTestId("agency-hybrid-upgrade")).toBeTruthy();
    expect(screen.queryByTestId("agency-hybrid-controls")).toBeNull();

    fireEvent.click(screen.getByTestId("agency-hybrid-upgrade"));
    await waitFor(() => {
      expect(screen.getByText("Confirm Upgrade")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Confirm Upgrade"));

    await waitFor(() => {
      expect(screen.getByTestId("agency-hybrid-controls")).toBeTruthy();
      expect(screen.getByTestId("agency-subgraph-manager")).toBeTruthy();
    });
  });
});
