import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/gallery", vi.fn()],
}));

// Mock tRPC
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      getTemplate: { useQuery: vi.fn() },
      useTemplate: { useMutation: vi.fn() },
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GalleryDetailDrawer } from "../GalleryDetailDrawer";
import { trpc } from "@/lib/trpc";

const mockGetTemplateQuery = vi.mocked(trpc.workflow.getTemplate.useQuery);
const mockUseTemplateMutation = vi.mocked(
  trpc.workflow.useTemplate.useMutation
);

const mockFullTemplate = {
  id: 1,
  name: "Daily Sales Report",
  description: "Full description text here.",
  categoryId: 1,
  stepCount: 5,
  estimatedSetupMinutes: 20,
  industry: ["E-commerce"],
  tags: ["schedule"],
  downloadCount: 42,
  templateKey: "tpl-001",
  previewSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect x="10" y="10" width="140" height="50" fill="#10B981"/></svg>',
  workflowJson: {
    nodes: [
      {
        id: "n1",
        type: "workflow",
        position: { x: 100, y: 200 },
        data: { nodeType: "schedule_trigger", label: "Every Morning 7AM", config: {} },
      },
      {
        id: "n2",
        type: "workflow",
        position: { x: 350, y: 200 },
        data: { nodeType: "llm_call", label: "Generate Summary", config: {} },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  },
  isPublic: true,
  isFeatured: false,
  status: "published",
  version: "1.0",
  authorId: 1,
  tenantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  searchVector: null,
};

function renderDrawer(props: Partial<React.ComponentProps<typeof GalleryDetailDrawer>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <GalleryDetailDrawer
        open={true}
        templateId={1}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("GalleryDetailDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);
  });

  it("renders Skeleton while getTemplate query is loading", () => {
    mockGetTemplateQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);
    renderDrawer();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders SVG as <img> with data:image/svg+xml;base64 src", () => {
    mockGetTemplateQuery.mockReturnValue({
      data: mockFullTemplate,
      isLoading: false,
    } as any);
    renderDrawer();
    const img = screen.getByAltText("Workflow topology diagram");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("renders node type badges for unique nodeTypes", () => {
    mockGetTemplateQuery.mockReturnValue({
      data: mockFullTemplate,
      isLoading: false,
    } as any);
    renderDrawer();
    expect(screen.getByText("schedule_trigger")).toBeInTheDocument();
    expect(screen.getByText("llm_call")).toBeInTheDocument();
  });

  it('"Use This Template" button is present and enabled when loaded', () => {
    mockGetTemplateQuery.mockReturnValue({
      data: mockFullTemplate,
      isLoading: false,
    } as any);
    renderDrawer();
    const btn = screen.getByRole("button", { name: /use this template/i });
    expect(btn).toBeEnabled();
  });

  it("shows loading spinner on button during mutation", () => {
    mockGetTemplateQuery.mockReturnValue({
      data: mockFullTemplate,
      isLoading: false,
    } as any);
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);
    renderDrawer();
    const btn = screen.getByRole("button", { name: /use this template/i });
    expect(btn).toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("on mutation success: calls onClose", async () => {
    const onClose = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({ id: 99 });
    mockGetTemplateQuery.mockReturnValue({
      data: mockFullTemplate,
      isLoading: false,
    } as any);
    mockUseTemplateMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
      mutate: vi.fn(),
      reset: vi.fn(),
    } as any);

    renderDrawer({ onClose });
    fireEvent.click(
      screen.getByRole("button", { name: /use this template/i })
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
