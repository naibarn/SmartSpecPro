/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

let mockNodesState: any[] = [];
let mockEdgesState: any[] = [];
const mockClipboardWriteText = vi.fn();
const mockSetNodes = vi.fn((next: any) => {
  mockNodesState = typeof next === "function" ? next(mockNodesState) : next;
});
const mockSetEdges = vi.fn((next: any) => {
  mockEdgesState = typeof next === "function" ? next(mockEdgesState) : next;
});

// ── React Flow mock ────────────────────────────────────────
vi.mock("@xyflow/react", () => {
  const useNodesState = vi.fn(() => [mockNodesState, mockSetNodes, vi.fn()]);
  const useEdgesState = vi.fn(() => [mockEdgesState, mockSetEdges, vi.fn()]);
  const useReactFlow = vi.fn(() => ({
    getNodes: () => mockNodesState,
    setCenter: vi.fn(),
    getZoom: () => 1,
    fitView: vi.fn(),
  }));

  return {
    __esModule: true,
    ReactFlow: ({ children, nodes, edges, onNodeClick, onPaneClick, onConnect }: any) =>
      createElement(
        "div",
        {
          "data-testid": "react-flow-canvas",
          "data-nodes": JSON.stringify(nodes ?? []),
          "data-edges": JSON.stringify(edges ?? []),
        },
        [
          ...(nodes ?? []).map((node: any) =>
            createElement(
              "button",
              {
                key: node.id,
                type: "button",
                "data-testid": `node-${node.id}`,
                onClick: (event: any) => onNodeClick?.(event, node),
              },
              node.data?.name ?? node.id,
            ),
          ),
          createElement(
            "button",
            {
              key: "pane",
              type: "button",
              "data-testid": "pane-click",
              onClick: (event: any) => onPaneClick?.(event),
            },
            "pane",
          ),
          children,
        ],
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
const mockSkillCreateMutation = vi.fn().mockReturnValue({
  mutateAsync: vi.fn().mockResolvedValue({ id: 99, slug: "exported-skill" }),
  isPending: false,
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      agency: {
        getById: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
      skills: {
        listFromDb: { invalidate: vi.fn() },
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
    skills: {
      create: { useMutation: (...args: any[]) => mockSkillCreateMutation(...args) },
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
const mockUseSearch = vi.fn(() => "");
vi.mock("wouter", () => ({
  useRoute: (...args: any[]) => mockUseRoute(...args),
  useLocation: vi.fn().mockReturnValue(["/agencies/new/edit", mockSetLocation]),
  useSearch: (...args: any[]) => mockUseSearch(...args),
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
  AgencyToolbar: ({ agencyName, agencyStatus, onNameChange, onSave, onPublish, onAutoLayout, onTest, onCopyAgencyLink }: any) =>
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
      createElement("button", { key: "copy", title: "Copy link", onClick: onCopyAgencyLink }, "Copy"),
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

vi.mock("@/components/agency/ExportAsSkillDialog", () => ({
  ExportAsSkillDialog: ({ open, selectedNodes, selectedEdges, onExport, initialName, initialDescription, initialCategory, sourceLink }: any) =>
    open
      ? createElement("div", { "data-testid": "skill-export-dialog" }, [
          createElement("span", { key: "count" }, `selected:${selectedNodes.length}`),
          createElement("span", { key: "edges" }, `edges:${selectedEdges.length}`),
          createElement("span", { key: "name" }, `name:${initialName ?? ""}`),
          createElement("span", { key: "description" }, `description:${initialDescription ?? ""}`),
          createElement("span", { key: "category" }, `category:${initialCategory ?? ""}`),
          sourceLink
            ? createElement(
                "button",
                {
                  key: "copy-source-link",
                  type: "button",
                  onClick: () => mockClipboardWriteText(sourceLink),
                },
                "Copy source link",
              )
            : null,
          createElement(
            "button",
            {
              key: "export",
              type: "button",
              onClick: () => onExport({
                name: initialName || "Graph Assistant",
                description: initialDescription || "Transforms a selected agency graph into a skill.",
                category: initialCategory || "chat_assistant",
                edgeIds: selectedEdges.map((edge: any) => edge.id),
              }),
            },
            "Confirm Export",
          ),
        ])
      : null,
}));

const mockTenantFeatureFlags = vi.fn(() => ({
  agencyHybridAdk: false,
  agencyHybridAdkKillSwitch: false,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => mockTenantFeatureFlags(),
}));

// ── Reactflow CSS no-op ────────────────────────────────────
vi.mock("@xyflow/react/dist/style.css", () => ({}));

describe("AgencyBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockClipboardWriteText,
      },
    });
    mockNodesState = [];
    mockEdgesState = [];
    mockUseRoute.mockReturnValue([true, { id: "new" }]);
    mockUseSearch.mockReturnValue("");
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
    mockSkillCreateMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 99, slug: "exported-skill" }),
      isPending: false,
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

  it("exports the selected agency node as a skill", async () => {
    mockNodesState = [
      {
        id: "node-1",
        type: "agency",
        position: { x: 0, y: 0 },
        data: {
          nodeType: "agent",
          name: "Research Lead",
          description: "Research the topic",
          instructions: "Summarize sources and decisions.",
          subgraphId: null,
          isEntryPoint: true,
          isOptional: false,
          nodeConfig: {},
          tools: [],
          toolIds: [],
          guardrailIds: [],
          examples: [],
          outputSchema: null,
          mcpServers: [],
          runtimeConfig: null,
        },
      },
      {
        id: "node-2",
        type: "agency",
        position: { x: 0, y: 140 },
        data: {
          nodeType: "agent",
          name: "QA Lead",
          description: "Verify the output",
          instructions: "Check the graph for coverage gaps.",
          subgraphId: null,
          isEntryPoint: false,
          isOptional: false,
          nodeConfig: {},
          tools: [],
          toolIds: [],
          guardrailIds: [],
          examples: [],
          outputSchema: null,
          mcpServers: [],
          runtimeConfig: null,
        },
      },
    ];
    mockEdgesState = [
      {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        data: { flowType: "delegation" },
      },
    ];

    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    fireEvent.change(screen.getByDisplayValue("Untitled Agency"), {
      target: { value: "Ops Agency" },
    });
    fireEvent.click(screen.getByTestId("node-node-1"));
    fireEvent.click(screen.getByTestId("node-node-2"), { ctrlKey: true });
    expect(screen.getByText("Export as Skill")).toBeTruthy();

    fireEvent.click(screen.getByText("Export as Skill"));
    expect(screen.getByTestId("skill-export-dialog")).toBeTruthy();
    expect(screen.getByText("selected:2")).toBeTruthy();
    expect(screen.getByText("edges:1")).toBeTruthy();

    fireEvent.click(screen.getByText("Confirm Export"));

    await waitFor(() => {
      expect(
        mockSkillCreateMutation.mock.results.some((result) => {
          const mutateAsync = result.value?.mutateAsync;
          return Boolean(mutateAsync?.mock?.calls?.length);
        }),
      ).toBe(true);
    });

    const exportedResult = mockSkillCreateMutation.mock.results.find((result) =>
      Boolean(result.value?.mutateAsync?.mock?.calls?.length),
    );
    const mutateAsync = exportedResult?.value?.mutateAsync;
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    const payload = mutateAsync.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({
      slug: "graph-assistant",
      name: "Graph Assistant",
      category: "chat_assistant",
      icon: "package",
    }));
    expect(String(payload.skillContent)).toContain("Research Lead");
    expect(String(payload.skillContent)).toContain("QA Lead");
    expect(String(payload.skillContent)).toContain("node-1 -> node-2");
    expect(String(payload.systemPrompt)).toContain("Graph Assistant");
    expect(payload.configJson).toEqual(expect.objectContaining({
      source: "agency_export",
      sourceAgencyName: "Ops Agency",
      sourceAgencyId: null,
      selectedEdgeIds: ["edge-1"],
    }));
    expect(mockSetLocation).toHaveBeenCalledWith("/settings/skills?skillId=99");
  });

  it("copies the agency permalink from the selection banner", async () => {
    mockUseSearch.mockReturnValue("?foo=bar");

    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    fireEvent.click(screen.getByTitle("Copy link"));

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/agencies/new/edit?foo=bar`,
    );
  });

  it("auto-opens export when duplicate skill query parameters are present", async () => {
    mockUseSearch.mockReturnValue(
      "?autoExport=1&duplicateSkillName=Graph%20Assistant&duplicateSkillDescription=Exported%20from%20agency.&duplicateSkillCategory=chat_assistant",
    );
    mockNodesState = [
      {
        id: "node-1",
        type: "agency",
        position: { x: 0, y: 0 },
        data: {
          nodeType: "agent",
          name: "Research Lead",
          description: "Research the topic",
          instructions: "Summarize sources and decisions.",
          subgraphId: null,
          isEntryPoint: true,
          isOptional: false,
          nodeConfig: {},
          tools: [],
          toolIds: [],
          guardrailIds: [],
          examples: [],
          outputSchema: null,
          mcpServers: [],
          runtimeConfig: null,
        },
      },
      {
        id: "node-2",
        type: "agency",
        position: { x: 0, y: 140 },
        data: {
          nodeType: "agent",
          name: "QA Lead",
          description: "Verify the output",
          instructions: "Check the graph for coverage gaps.",
          subgraphId: null,
          isEntryPoint: false,
          isOptional: false,
          nodeConfig: {},
          tools: [],
          toolIds: [],
          guardrailIds: [],
          examples: [],
          outputSchema: null,
          mcpServers: [],
          runtimeConfig: null,
        },
      },
    ];
    mockEdgesState = [
      {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        data: { flowType: "delegation" },
      },
    ];

    const { default: AgencyBuilder } = await import("@/pages/AgencyBuilder");
    render(createElement(AgencyBuilder));

    await waitFor(() => {
      expect(screen.getByTestId("skill-export-dialog")).toBeTruthy();
    });

    expect(screen.getByText("selected:2")).toBeTruthy();
    expect(screen.getByText("edges:1")).toBeTruthy();
    expect(screen.getByText("name:Graph Assistant")).toBeTruthy();
    expect(screen.getByText("description:Exported from agency.")).toBeTruthy();
    expect(screen.getByText("category:chat_assistant")).toBeTruthy();
    expect(screen.getByText("Copy source link")).toBeTruthy();

    fireEvent.click(screen.getByText("Copy source link"));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/agencies/new/edit?autoExport=1&duplicateSkillName=Graph%20Assistant&duplicateSkillDescription=Exported%20from%20agency.&duplicateSkillCategory=chat_assistant`,
    );
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
