import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoist mock functions before vi.mock() calls
const { mockUseQuery, mockUseMutation, mockInvalidate } = vi.hoisted(() => ({
  mockUseQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  mockUseMutation: vi.fn().mockReturnValue({
    mutate: vi.fn(),
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

vi.mock("@/components/ui/dialog", () => ({
  Dialog: (props: Record<string, unknown>) => {
    if (!props.open) return null;
    return React.createElement("div", { "data-testid": "dialog" }, props.children as React.ReactNode);
  },
  DialogContent: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "dialog-content" }, props.children as React.ReactNode),
  DialogHeader: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "dialog-header" }, props.children as React.ReactNode),
  DialogTitle: (props: Record<string, unknown>) =>
    React.createElement("h2", {}, props.children as React.ReactNode),
  DialogDescription: (props: Record<string, unknown>) =>
    React.createElement("p", {}, props.children as React.ReactNode),
  DialogFooter: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "dialog-footer" }, props.children as React.ReactNode),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) =>
    React.createElement("input", props),
}));

vi.mock("@/components/ui/label", () => ({
  Label: (props: Record<string, unknown>) =>
    React.createElement("label", {}, props.children as React.ReactNode),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "select" }, props.children as React.ReactNode),
  SelectContent: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "select-content" }, props.children as React.ReactNode),
  SelectItem: (props: Record<string, unknown>) =>
    React.createElement("option", { value: props.value as string }, props.children as React.ReactNode),
  SelectTrigger: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "select-trigger", "aria-label": props["aria-label"] as string }, props.children as React.ReactNode),
  SelectValue: (props: Record<string, unknown>) =>
    React.createElement("span", {}, (props.placeholder ?? "") as string),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("lucide-react", () => ({
  ExternalLink: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-external-link" }),
  Loader2: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "loader" }),
  Search: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-search" }),
  Users: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-users" }),
  X: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-x" }),
}));

// Mock PermissionBadge
vi.mock("./PermissionBadge", () => ({
  PermissionBadge: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": `badge-${props.level}` }, props.level as string),
}));

vi.mock("./CopyLinkButton", () => ({
  CopyLinkButton: () => React.createElement("button", { type: "button" }, "Copy link"),
}));

// Mock tRPC with hoisted functions
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      library: {
        getItemShares: { invalidate: mockInvalidate },
        getPublicShareLink: { invalidate: mockInvalidate },
      },
    }),
    library: {
      getItemShares: { useQuery: mockUseQuery },
      getPublicShareLink: { useQuery: mockUseQuery },
      shareItem: { useMutation: mockUseMutation },
      removeShare: { useMutation: mockUseMutation },
      updateSharePermission: { useMutation: mockUseMutation },
      createPublicShareLink: { useMutation: mockUseMutation },
      revokePublicShareLink: { useMutation: mockUseMutation },
    },
    groups: {
      list: { useQuery: mockUseQuery },
      searchTenantUsers: { useQuery: mockUseQuery },
    },
  },
}));

import { ShareDialog } from "./ShareDialog";

beforeEach(() => {
  mockUseQuery.mockReturnValue({ data: null, isLoading: false });
  mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("ShareDialog", () => {
  it("renders when open", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("dialog");
    expect(html).toContain("Add people or groups");
  });

  it("does not render when closed", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: false,
        onClose: vi.fn(),
      }),
    );
    expect(html).toBe("");
  });

  it("renders user search input (separate from groups)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Search by name or email");
    expect(html).toContain("Search for people");
  });

  it("renders group dropdown (separate from users)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Or select a group");
    expect(html).toContain("Select group...");
  });

  it("renders permission level selector", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Permission level");
    expect(html).toContain("Read Only");
    expect(html).toContain("Can Edit");
    expect(html).toContain("Can Delete");
  });

  it("renders 'Who has access' section", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Who has access");
  });

  it("shows 'No shares yet' when no shares exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("No shares yet");
  });

  it("renders dialog title with item title", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        itemTitle: "My Document.pdf",
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain('Share &quot;My Document.pdf&quot;');
  });

  it("renders Close button in footer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Close");
    expect(html).toContain("dialog-footer");
  });

  it("has accessible ARIA labels on inputs", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Search for users to share with"');
    expect(html).toContain('aria-label="Select group to share with"');
    expect(html).toContain('aria-label="Permission level"');
  });

  it("renders Add button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain(">Add</button>");
  });
});

describe("ShareDialog - shares display", () => {
  it("shows owner row with owner badge", () => {
    mockUseQuery.mockImplementation((input: unknown) => {
      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
        return {
          data: {
            shares: [
              {
                id: 1,
                subjectType: "user",
                subjectId: "42",
                permissionLevel: "owner",
                expiresAt: null,
                userName: "John Owner",
              },
            ],
          },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    });

    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("John Owner");
    expect(html).toContain("badge-owner");
    expect(html).toContain("Cannot remove owner");
  });

  it("shows user shares with permission selector", () => {
    mockUseQuery.mockImplementation((input: unknown) => {
      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
        return {
          data: {
            shares: [
              {
                id: 2,
                subjectType: "user",
                subjectId: "10",
                permissionLevel: "write",
                expiresAt: null,
                userName: "Jane Editor",
              },
            ],
          },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    });

    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("Jane Editor");
    expect(html).toContain("Remove access for Jane Editor");
  });

  it("shows group shares with group icon", () => {
    mockUseQuery.mockImplementation((input: unknown) => {
      if (input && typeof input === "object" && "itemId" in (input as Record<string, unknown>)) {
        return {
          data: {
            shares: [
              {
                id: 3,
                subjectType: "group",
                subjectId: "5",
                permissionLevel: "read",
                expiresAt: null,
                groupName: "Marketing Team",
              },
            ],
          },
          isLoading: false,
        };
      }
      return { data: null, isLoading: false };
    });

    const html = renderToStaticMarkup(
      React.createElement(ShareDialog, {
        itemId: 1,
        isOpen: true,
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("Marketing Team");
    expect(html).toContain("icon-users");
    expect(html).toContain("Group");
  });
});
