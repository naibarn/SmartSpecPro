import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/gallery", vi.fn()],
}));

// Mock sonner
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      listTemplates: { useQuery: vi.fn() },
      listTemplateCategories: { useQuery: vi.fn() },
      getTemplate: { useQuery: vi.fn() },
      useTemplate: { useMutation: vi.fn() },
    },
  },
}));

import WorkflowGallery from "../WorkflowGallery";
import { trpc } from "@/lib/trpc";

const mockListTemplates = vi.mocked(trpc.workflow.listTemplates.useQuery);
const mockListCategories = vi.mocked(
  trpc.workflow.listTemplateCategories.useQuery
);
const mockGetTemplate = vi.mocked(trpc.workflow.getTemplate.useQuery);
const mockUseTemplate = vi.mocked(trpc.workflow.useTemplate.useMutation);

function makeTemplate(id: number) {
  return {
    id,
    name: `Template ${id}`,
    description: "A test template description.",
    category: "Sales & Marketing",
    stepCount: 4,
    estimatedSetupMinutes: 15,
    industry: ["E-commerce"],
    tags: ["schedule"],
    downloadCount: 0,
    templateKey: `tpl-${String(id).padStart(3, "0")}`,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <WorkflowGallery />
    </QueryClientProvider>
  );
}

describe("WorkflowGallery page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplate.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);
    mockUseTemplate.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
    mockListCategories.mockReturnValue({
      data: [
        { id: 1, name: "Sales & Marketing", templateCount: 8 },
        { id: 2, name: "IT & DevOps", templateCount: 4 },
      ],
      isLoading: false,
    } as any);
  });

  it("renders 24 skeleton cards while listTemplates is loading", () => {
    mockListTemplates.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(24);
  });

  it("renders template cards once query resolves", () => {
    const items = Array.from({ length: 8 }, (_, i) => makeTemplate(i + 1));
    mockListTemplates.mockReturnValue({
      data: { items, total: 8 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    expect(screen.getByText("Template 1")).toBeInTheDocument();
    expect(screen.getByText("Template 8")).toBeInTheDocument();
  });

  it("shows error state message when listTemplates query fails", () => {
    mockListTemplates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as any);
    renderPage();
    expect(
      screen.getByText(/could not load templates/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });

  it("shows empty state message when query returns 0 results", () => {
    mockListTemplates.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    expect(screen.getByText(/no templates found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear filters/i })
    ).toBeInTheDocument();
  });

  it("clicking a category in the sidebar updates the filter", () => {
    mockListTemplates.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    } as any);
    renderPage();
    const itDevOpsBtn = screen.getByText(/IT & DevOps/);
    fireEvent.click(itDevOpsBtn);
    expect(mockListTemplates).toHaveBeenCalled();
  });
});
