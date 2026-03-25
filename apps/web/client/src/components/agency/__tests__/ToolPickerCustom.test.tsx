/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

// ── Radix Dialog mock ────────────────────────────────────────
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? createElement("div", { "data-testid": "dialog" }, children) : null,
  DialogContent: ({ children }: any) =>
    createElement("div", { "data-testid": "dialog-content" }, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) =>
    createElement("h2", null, children),
  DialogFooter: ({ children }: any) => createElement("div", null, children),
}));

// ── Radix Select mock ────────────────────────────────────────
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => createElement("div", null, children),
  SelectTrigger: ({ children, ...props }: any) =>
    createElement("button", { ...props, type: "button" }, children),
  SelectValue: () => createElement("span"),
  SelectContent: ({ children }: any) => createElement("div", null, children),
  SelectItem: ({ children, value }: any) =>
    createElement("option", { value }, children),
}));

// ── Switch mock ──────────────────────────────────────────────
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: any) =>
    createElement("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e: any) => onCheckedChange?.(e.target.checked),
    }),
}));

// ── Checkbox mock ────────────────────────────────────────────
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
    createElement("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e: any) => onCheckedChange?.(e.target.checked),
      ...props,
    }),
}));

// ── Sonner mock ──────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── ToolConfigPanel mock ─────────────────────────────────────
vi.mock("../ToolConfigPanel", () => ({
  ToolConfigPanel: () => createElement("div", { "data-testid": "tool-config-panel" }),
}));

// ── tRPC mock ────────────────────────────────────────────────
const mockListToolsData = {
  tools: [
    {
      id: "builtin-web-search",
      name: "Web Search",
      description: "Search the web",
      toolType: "builtin",
      riskLevel: "low",
      isEnabled: true,
    },
    {
      id: "custom-uuid-1",
      name: "My Custom API",
      description: "Custom API call",
      toolType: "http_api",
      riskLevel: "medium",
      isEnabled: true,
      isOwned: true,
    },
    {
      id: "custom-uuid-2",
      name: "Disabled Tool",
      description: "Should not appear",
      toolType: "http_api",
      riskLevel: "low",
      isEnabled: false,
    },
  ],
};

const mockDeleteMutate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listTools: {
        useQuery: () => ({ data: mockListToolsData }),
      },
      deleteCustomTool: {
        useMutation: (opts: any) => ({
          mutate: (...args: any[]) => {
            mockDeleteMutate(...args);
            opts?.onSuccess?.();
          },
        }),
      },
      createCustomTool: {
        useMutation: (opts: any) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      updateCustomTool: {
        useMutation: (opts: any) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      testCustomTool: {
        useMutation: (opts: any) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      listCustomTools: {
        useQuery: () => ({ data: undefined }),
      },
    },
    useUtils: () => ({
      agency: { listTools: { invalidate: vi.fn() } },
    }),
  },
}));

describe("ToolPicker with custom tools", () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
    onSelect = vi.fn();
    // Mock window.confirm for delete
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it('renders "Custom API" group section when custom tools exist', async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    // Should show "Custom API" group header for http_api tools
    expect(screen.getByText("Custom API")).toBeTruthy();
    expect(screen.getByText("My Custom API")).toBeTruthy();
  });

  it('custom tools display a "Custom" badge', async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    // The custom tool should have a "Custom" badge
    const badges = screen.getAllByText("Custom");
    expect(badges.length).toBeGreaterThan(0);
  });

  it('"Create Custom Tool" button appears', async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    expect(screen.getByTestId("create-custom-tool-btn")).toBeTruthy();
    expect(screen.getByText("Create Tool")).toBeTruthy();
  });

  it("disabled custom tools (isEnabled=false) are excluded from the list", async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    // "Disabled Tool" should not appear
    expect(screen.queryByText("Disabled Tool")).toBeNull();
  });

  it("edit icon on custom tool exists", async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    expect(screen.getByTestId("edit-tool-custom-uuid-1")).toBeTruthy();
  });

  it("builtin tools do not have edit/delete buttons", async () => {
    const { ToolPicker } = await import("../ToolPicker");
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        excludeToolIds: [],
      }),
    );

    expect(screen.queryByTestId("edit-tool-builtin-web-search")).toBeNull();
    expect(screen.queryByTestId("delete-tool-builtin-web-search")).toBeNull();
  });

  it("shows a Connect MCP Server action when the callback is provided", async () => {
    const { ToolPicker } = await import("../ToolPicker");
    const onManageMcpServers = vi.fn();
    render(
      createElement(ToolPicker, {
        open: true,
        onClose,
        onSelect,
        onManageMcpServers,
        excludeToolIds: [],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /connect mcp server/i }));
    expect(onManageMcpServers).toHaveBeenCalledOnce();
  });

  it("shows a guidance banner for MCP tools and social publishing", async () => {
    const originalTools = [...mockListToolsData.tools];
    mockListToolsData.tools = [
      ...originalTools,
      {
        id: "builtin-social-publish",
        name: "Social Publish",
        description: "Schedule or publish posts to Facebook Pages",
        toolType: "builtin",
        riskLevel: "medium",
        isEnabled: true,
      },
      {
        id: "mcp-tool-1",
        name: "MCP Analytics",
        description: "Example MCP tool",
        toolType: "mcp_bridge",
        riskLevel: "low",
        isEnabled: true,
      },
    ];

    try {
      const { ToolPicker } = await import("../ToolPicker");
      render(
        createElement(ToolPicker, {
          open: true,
          onClose,
          onSelect,
          onManageMcpServers: vi.fn(),
          excludeToolIds: [],
        }),
      );

      expect(screen.getByText(/mcp tools loaded/i)).toBeTruthy();
      expect(screen.getByText(/fb auto-post ready/i)).toBeTruthy();
      expect(screen.getByText(/facebook page with valid page access/i)).toBeTruthy();
    } finally {
      mockListToolsData.tools = originalTools;
    }
  });
});
