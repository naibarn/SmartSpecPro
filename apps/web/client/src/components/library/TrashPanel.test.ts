import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoist mock functions before vi.mock() calls
const { mockUseQuery, mockUseMutation, mockInvalidate } = vi.hoisted(() => ({
  mockUseQuery: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  mockUseMutation: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  mockInvalidate: vi.fn(),
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return React.createElement("button", rest, children as React.ReactNode);
  },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: (props: Record<string, unknown>) => {
    if (!props.open) return null;
    return React.createElement(
      "div",
      { "data-testid": "alert-dialog" },
      props.children as React.ReactNode,
    );
  },
  AlertDialogContent: (props: Record<string, unknown>) =>
    React.createElement(
      "div",
      { "data-testid": "alert-dialog-content" },
      props.children as React.ReactNode,
    ),
  AlertDialogHeader: (props: Record<string, unknown>) =>
    React.createElement("div", {}, props.children as React.ReactNode),
  AlertDialogTitle: (props: Record<string, unknown>) =>
    React.createElement("h2", {}, props.children as React.ReactNode),
  AlertDialogDescription: (props: Record<string, unknown>) =>
    React.createElement("p", {}, props.children as React.ReactNode),
  AlertDialogFooter: (props: Record<string, unknown>) =>
    React.createElement("div", {}, props.children as React.ReactNode),
  AlertDialogCancel: (props: Record<string, unknown>) =>
    React.createElement("button", {}, props.children as React.ReactNode),
  AlertDialogAction: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return React.createElement("button", rest, children as React.ReactNode);
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: (props: Record<string, unknown>) =>
    React.createElement("svg", {
      ...props,
      "data-testid": "icon-alert-triangle",
    }),
  Loader2: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-loader" }),
  RotateCcw: (props: Record<string, unknown>) =>
    React.createElement("svg", {
      ...props,
      "data-testid": "icon-rotate-ccw",
    }),
  Trash2: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-trash2" }),
}));

// Mock tRPC with hoisted functions
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      library: {
        listTrash: { invalidate: mockInvalidate },
        listDocuments: { invalidate: mockInvalidate },
      },
    }),
    library: {
      listTrash: { useQuery: mockUseQuery },
      restoreFromTrash: { useMutation: mockUseMutation },
      permanentDelete: { useMutation: mockUseMutation },
    },
  },
}));

import { TrashPanel } from "./TrashPanel";

beforeEach(() => {
  mockUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Marketing Plan Q1.docx",
    itemType: "docx",
    source: "upload",
    thumbnailUrl: null,
    deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    deletedBy: null,
    daysInTrash: 5,
    daysUntilPurge: 85,
    ...overrides,
  };
}

describe("TrashPanel", () => {
  describe("Rendering", () => {
    it("shows retention info when items exist", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem()], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("permanently deleted after 90 days");
    });

    it("shows empty state when trash is empty", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Trash is empty");
      expect(html).toContain("Deleted items will appear here");
    });

    it("shows loading state with spinner", () => {
      mockUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("icon-loader");
      expect(html).toContain("Loading trash items");
    });

    it("shows error state with retry button", () => {
      mockUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: "Network error" },
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Failed to load trash");
      expect(html).toContain("Retry");
    });

    it("renders trash items with title", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem()], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Marketing Plan Q1.docx");
    });

    it("shows days until auto-purge for items with >= 7 days", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ daysInTrash: 15, daysUntilPurge: 75 })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("75 days left");
    });

    it("shows warning badge when < 7 days remaining", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ daysInTrash: 87, daysUntilPurge: 3 })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("3 days left");
      expect(html).toContain("bg-red-100");
      expect(html).toContain(
        'aria-label="Item will be deleted in 3 days"',
      );
    });

    it("does not show warning badge when >= 7 days remaining", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ daysInTrash: 10, daysUntilPurge: 80 })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).not.toContain("bg-red-100");
    });

    it("shows relative deletion date", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem({ daysInTrash: 5 })], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Deleted 5 days ago");
    });

    it('shows "Deleted today" for items deleted today', () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem({ daysInTrash: 0 })], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Deleted today");
    });

    it('shows "Deleted yesterday" for 1 day old', () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem({ daysInTrash: 1 })], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Deleted yesterday");
    });
  });

  describe("Actions", () => {
    it("renders restore button with aria-label", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ title: "Report.xlsx" })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('aria-label="Restore Report.xlsx"');
    });

    it("renders delete button with aria-label", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ title: "Report.xlsx" })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('aria-label="Permanently delete Report.xlsx"');
    });

    it("renders empty trash button when items exist", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [makeItem()], total: 1 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Empty Trash");
      expect(html).toContain('aria-label="Empty all trash items"');
    });

    it("does not render empty trash button when trash is empty", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).not.toContain("Empty Trash");
    });

    it("renders restore and delete buttons for each item", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [
            makeItem({ id: 1, title: "File A.pdf" }),
            makeItem({ id: 2, title: "File B.docx" }),
          ],
          total: 2,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('aria-label="Restore File A.pdf"');
      expect(html).toContain('aria-label="Restore File B.docx"');
      expect(html).toContain('aria-label="Permanently delete File A.pdf"');
      expect(html).toContain('aria-label="Permanently delete File B.docx"');
    });
  });

  describe("Accessibility", () => {
    it("has accessible empty state with role=status", () => {
      mockUseQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('role="status"');
      expect(html).toContain("Trash is empty");
    });

    it("has accessible loading state", () => {
      mockUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain("Loading trash items");
    });

    it("has proper ARIA labels for all action buttons", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ title: "Doc.pdf" })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('aria-label="Restore Doc.pdf"');
      expect(html).toContain('aria-label="Permanently delete Doc.pdf"');
      expect(html).toContain('aria-label="Empty all trash items"');
    });

    it("warning badge has aria-label with days remaining", () => {
      mockUseQuery.mockReturnValue({
        data: {
          items: [makeItem({ daysInTrash: 85, daysUntilPurge: 5 })],
          total: 1,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain(
        'aria-label="Item will be deleted in 5 days"',
      );
    });

    it("loading spinner icon is aria-hidden", () => {
      mockUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const html = renderToStaticMarkup(React.createElement(TrashPanel));
      expect(html).toContain('aria-hidden="true"');
    });
  });
});
