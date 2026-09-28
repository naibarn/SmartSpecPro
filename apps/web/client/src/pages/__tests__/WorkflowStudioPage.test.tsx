/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ path: "/studio/workflow" }));
const trpcState = vi.hoisted(() => ({
  nodeTypes: vi.fn(() => ({
    data: [
      "core.trigger", "data.transform", "ai.model", "ai.agent",
      "core.capability", "data.retrieval", "flow.subflow", "flow.router",
      "flow.join", "flow.loop", "human.approval", "human.input", "flow.wait",
      "automation.computer_use", "data.artifact", "quality.verifier",
    ].map(typeId => ({ identity: { typeId, version: "1.0.0" } })),
    isLoading: false,
    isError: false,
  })),
  list: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  marketplace: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  get: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  getRun: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  marketplaceDetail: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
  skillsList: vi.fn(() => ({ data: { skills: [] }, isLoading: false, isError: false })),
  skillSchema: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  mutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("wouter", () => ({
  useLocation: () => [routeState.path, vi.fn()],
  useRoute: (path: string) => [routeState.path === path, {}],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", changeLanguage: vi.fn() } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflowStudio: {
      nodeTypes: { useQuery: trpcState.nodeTypes },
      list: { useQuery: trpcState.list },
      marketplace: { useQuery: trpcState.marketplace },
      get: { useQuery: trpcState.get },
      getRun: { useQuery: trpcState.getRun },
      marketplaceDetail: { useQuery: trpcState.marketplaceDetail },
      run: { useMutation: trpcState.mutation },
      controlRun: { useMutation: trpcState.mutation },
      createDraft: { useMutation: trpcState.mutation },
      saveDraft: { useMutation: trpcState.mutation },
      publishVersion: { useMutation: trpcState.mutation },
      previewCandidate: { useMutation: trpcState.mutation },
      generateDraft: { useMutation: trpcState.mutation },
      editDraft: { useMutation: trpcState.mutation },
    },
    skills: {
      listForWorkflow: { useQuery: trpcState.skillsList },
      getInputSchema: { useQuery: trpcState.skillSchema },
    },
  },
}));

vi.mock("@xyflow/react", () => ({
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  Position: { Left: "left", Right: "right" },
  ReactFlowProvider: ({ children }: { children: unknown }) => children,
  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    screenToFlowPosition: (position: { x: number; y: number }) => position,
  }),
  useUpdateNodeInternals: () => vi.fn(),
  ReactFlow: ({
    nodes,
    nodeTypes,
    children,
  }: {
    nodes: Array<Record<string, unknown>>;
    nodeTypes: Record<string, React.ComponentType<any>>;
    children: unknown;
  }) => (
    <section>
      {nodes.map(node => {
        const Component = nodeTypes[String(node.type)];
        return Component ? (
          <Component key={String(node.id)} {...node} selected={false} />
        ) : null;
      })}
      {children}
    </section>
  ),
}));

vi.mock("@/components/AppPage", () => ({
  AppPage: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: unknown;
    children: unknown;
  }) => (
    <main>
      <h1>{title}</h1>
      <section aria-label="page actions">{actions}</section>
      {children}
    </main>
  ),
}));

import WorkflowStudioPage from "../WorkflowStudioPage";

describe("WorkflowStudioPage mockup surfaces", () => {
  beforeEach(() => {
    routeState.path = "/studio/workflow";
  });

  it("renders the builder hierarchy and exposes typed subflow bindings", () => {
    render(<WorkflowStudioPage />);

    expect(screen.getByTestId("workflow-studio-builder")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Workflow studio navigation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Selected node inspector" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Workflow run and debug drawer" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "studio.subflow" }));
    expect(screen.getByText("studio.compatibleSources")).toBeInTheDocument();
    expect(screen.getByText("input.document.text")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "studio.data" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "studio.logs" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "studio.errors" })
    ).toBeInTheDocument();
  });

  it("renders the separate run surface and fails closed before runtime setup", () => {
    routeState.path = "/studio/workflow/run";
    render(<WorkflowStudioPage />);

    expect(screen.getByTestId("workflow-studio-run")).toBeInTheDocument();
    expect(screen.getByLabelText("studio.input")).toBeInTheDocument();
    const runButton = screen.getByRole("button", {
      name: "studio.runWorkflow",
    });
    fireEvent.click(runButton);
    expect(runButton).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "studio.validationError"
    );
    expect(
      screen.queryByText("Job admitted to canonical control plane")
    ).not.toBeInTheDocument();
  });

  it("exposes library and marketplace states from the studio navigation", () => {
    render(<WorkflowStudioPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "studio.library" })[0]
    );
    expect(screen.getByTestId("workflow-studio-library")).toBeInTheDocument();
    expect(screen.getByText("studio.emptyLibrary")).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: "studio.marketplace" })[0]
    );
    expect(
      screen.getByTestId("workflow-studio-marketplace")
    ).toBeInTheDocument();
    expect(screen.getByText("studio.emptyMarketplace")).toBeInTheDocument();
  });

  it("renders top navigation and a searchable expandable node palette", () => {
    render(<WorkflowStudioPage />);

    const topNavigation = screen.getByTestId("workflow-studio-top-navigation");
    expect(
      within(topNavigation).getByRole("button", { name: "studio.builder" })
    ).toBeInTheDocument();
    expect(
      within(topNavigation).getByRole("button", { name: "studio.library" })
    ).toBeInTheDocument();
    expect(
      within(topNavigation).getByRole("button", { name: "studio.marketplace" })
    ).toBeInTheDocument();

    const palette = screen.getByTestId("workflow-studio-node-palette");
    const search = within(palette).getByRole("searchbox", {
      name: "studio.searchNodeTypes",
    });
    expect(search).toBeInTheDocument();
    expect(
      within(palette).getByRole("button", { name: "AI Model" })
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "AI Model" } });
    expect(
      within(palette).getByRole("button", { name: "AI Model" })
    ).toBeInTheDocument();
    expect(
      within(palette).queryByRole("button", { name: "AI Agent" })
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const aiCategory = within(palette).getByRole("button", {
      name: "studio.nodeCategory.ai",
    });
    fireEvent.click(aiCategory);
    expect(
      within(palette).queryByRole("button", { name: "AI Model" })
    ).not.toBeInTheDocument();
  });
});
