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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      getById: { useQuery: (...args: any[]) => mockUseQuery(...args) },
      update: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      create: { useMutation: (...args: any[]) => mockUseMutation(...args) },
      saveBuilder: { useMutation: (...args: any[]) => mockUseMutation(...args) },
    },
  },
}));

// ── Auth mock ──────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "u1" },
  }),
}));

// ── Wouter mock ────────────────────────────────────────────
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useRoute: vi.fn().mockReturnValue([true, { id: "new" }]),
  useLocation: vi.fn().mockReturnValue(["/agencies/new/edit", mockSetLocation]),
}));

// ── Sonner mock ────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Reactflow CSS no-op ────────────────────────────────────
vi.mock("reactflow/dist/style.css", () => ({}));

describe("AgencyBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
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
    const { useAuth } = await import("@/contexts/AuthContext");
    (useAuth as any).mockReturnValue({
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
});
