/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseUtils,
  mockListProviderTemplates,
  mockListConnections,
  mockListShares,
  mockListUsage,
  mockGroupsList,
  mockStartOAuth,
  mockDisconnect,
  mockTestConnection,
  mockUpdateShare,
} = vi.hoisted(() => ({
  mockUseUtils: vi.fn(),
  mockListProviderTemplates: vi.fn(),
  mockListConnections: vi.fn(),
  mockListShares: vi.fn(),
  mockListUsage: vi.fn(),
  mockGroupsList: vi.fn(),
  mockStartOAuth: vi.fn(),
  mockDisconnect: vi.fn(),
  mockTestConnection: vi.fn(),
  mockUpdateShare: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mockUseUtils,
    mcpConnections: {
      listProviderTemplates: { useQuery: mockListProviderTemplates },
      listConnections: { useQuery: mockListConnections },
      listShares: { useQuery: mockListShares },
      listUsage: { useQuery: mockListUsage },
      startOAuth: { useMutation: mockStartOAuth },
      disconnect: { useMutation: mockDisconnect },
      testConnection: { useMutation: mockTestConnection },
      updateShare: { useMutation: mockUpdateShare },
    },
    groups: {
      list: { useQuery: mockGroupsList },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
}));

import { McpConnectPanel } from "../McpConnectPanel";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "open").mockReturnValue({
    closed: false,
    document: { write: vi.fn() },
    location: { href: "" },
  } as unknown as Window);
  mockUseUtils.mockReturnValue({
    mcpConnections: {
      listConnections: { invalidate: vi.fn() },
      listProviderTemplates: { invalidate: vi.fn() },
      listShares: { invalidate: vi.fn() },
    },
  });
  mockListProviderTemplates.mockReturnValue({ data: [], isLoading: false });
  mockListConnections.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() });
  mockListShares.mockReturnValue({ data: [], isLoading: false });
  mockListUsage.mockReturnValue({ data: [], isLoading: false });
  mockGroupsList.mockReturnValue({ data: [], isLoading: false });
  mockStartOAuth.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockDisconnect.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockTestConnection.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUpdateShare.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
});

describe("McpConnectPanel", () => {
  it("shows Magnific and Higgsfield connect actions when provider templates are empty", () => {
    render(<McpConnectPanel />);

    expect(screen.getByText("Magnific")).toBeDefined();
    expect(screen.getByText("Higgsfield")).toBeDefined();
    expect(screen.getAllByRole("button", { name: /Connect/i })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Open web/i })).toHaveLength(2);
    expect(screen.queryByText(/Provider setup is not fully enabled/i)).toBeNull();
  });

  it("starts MCP OAuth for the selected fallback provider", () => {
    const mutate = vi.fn();
    mockStartOAuth.mockReturnValue({ mutate, isPending: false });

    render(<McpConnectPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /Connect/i })[0]);

    expect(window.open).toHaveBeenCalledWith("about:blank", "mcp-connect", "width=960,height=780");
    expect(mutate).toHaveBeenCalledWith({ providerKey: "magnific" }, expect.any(Object));
  });

  it("shares connected provider accounts independently with selected groups", async () => {
    const mutate = vi.fn();
    mockUpdateShare.mockReturnValue({ mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    mockGroupsList.mockReturnValue({
      data: [
        { id: 7, name: "Tiktok Group" },
        { id: 9, name: "Cinema Group" },
      ],
      isLoading: false,
    });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
        {
          id: "conn-higgsfield",
          providerKey: "higgsfield",
          providerDisplayName: "Higgsfield",
          providerAccountLabel: "higgsfield account",
          displayName: "Higgsfield",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<McpConnectPanel defaultTab="sharing" />);
    fireEvent.change(screen.getByLabelText("Group for Magnific"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Group for Higgsfield"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /Share Magnific/i }));
    fireEvent.click(screen.getByRole("button", { name: /Share Higgsfield/i }));

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-magnific", groupId: 7 }),
      expect.any(Object),
    );
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-higgsfield", groupId: 9 }),
      expect.any(Object),
    );
  });

  it("hydrates saved share limits after refresh", async () => {
    mockGroupsList.mockReturnValue({ data: [{ id: 7, name: "Tiktok Group" }], isLoading: false });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-1",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 100,
          concurrencyLimit: 10,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });

    render(<McpConnectPanel defaultTab="sharing" />);

    await waitFor(() => {
      expect(screen.getByText("Tiktok Group")).toBeDefined();
      expect(screen.getByLabelText("Daily use limit for Magnific (Tiktok Group)")).toHaveValue("100");
      expect(screen.getByLabelText("Concurrency limit for Magnific (Tiktok Group)")).toHaveValue("10");
    });
    expect(screen.getByRole("button", { name: /Save Magnific \(Tiktok Group\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Stop sharing Magnific \(Tiktok Group\)/i })).toBeDefined();
  });

  it("can stop sharing one provider without changing another provider share", async () => {
    const mutate = vi.fn();
    mockUpdateShare.mockReturnValue({ mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    mockGroupsList.mockReturnValue({ data: [{ id: 7, name: "Tiktok Group" }], isLoading: false });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
        {
          id: "conn-higgsfield",
          providerKey: "higgsfield",
          providerDisplayName: "Higgsfield",
          providerAccountLabel: "higgsfield account",
          displayName: "Higgsfield",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: null,
          concurrencyLimit: null,
          requiresVideoApproval: true,
        },
        {
          id: "share-higgsfield",
          connectionId: "conn-higgsfield",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 100,
          concurrencyLimit: 2,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });

    render(<McpConnectPanel defaultTab="sharing" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Stop sharing Magnific \(Tiktok Group\)/i })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Stop sharing Magnific \(Tiktok Group\)/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-magnific", groupId: 7, enabled: false }),
      expect.any(Object),
    );
    expect(mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn-higgsfield", enabled: false }),
      expect.any(Object),
    );
  });

  it("does not hydrate disabled share records as active sharing", async () => {
    mockGroupsList.mockReturnValue({ data: [{ id: 7, name: "Tiktok Group" }], isLoading: false });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
        {
          id: "conn-higgsfield",
          providerKey: "higgsfield",
          providerDisplayName: "Higgsfield",
          providerAccountLabel: "higgsfield account",
          displayName: "Higgsfield",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: false,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 100,
          concurrencyLimit: 2,
          requiresVideoApproval: true,
        },
        {
          id: "share-higgsfield",
          connectionId: "conn-higgsfield",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 100,
          concurrencyLimit: 2,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });

    render(<McpConnectPanel defaultTab="sharing" />);

    await waitFor(() => {
      // Magnific's share is disabled -> no editable row, group 7 still selectable in its Add dropdown.
      expect(screen.queryByLabelText("Daily use limit for Magnific (Tiktok Group)")).toBeNull();
      const magnificGroupOptions = screen.getByLabelText("Group for Magnific") as HTMLSelectElement;
      expect(Array.from(magnificGroupOptions.options).map((option) => option.value)).toContain("7");

      // Higgsfield's share is enabled -> editable row exists, group 7 no longer offered in its Add dropdown.
      expect(screen.getByLabelText("Daily use limit for Higgsfield (Tiktok Group)")).toHaveValue("100");
      const higgsfieldGroupOptions = screen.getByLabelText("Group for Higgsfield") as HTMLSelectElement;
      expect(Array.from(higgsfieldGroupOptions.options).map((option) => option.value)).not.toContain("7");
    });
    expect(screen.queryByRole("button", { name: /Stop sharing Magnific/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Stop sharing Higgsfield \(Tiktok Group\)/i })).toBeDefined();
    expect(screen.getByText("1 active share policy record(s)")).toBeDefined();
  });

  it("renders two rows for a connection with two enabled group shares and stops only the targeted group", async () => {
    const mutate = vi.fn();
    mockUpdateShare.mockReturnValue({ mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    mockGroupsList.mockReturnValue({
      data: [
        { id: 7, name: "Tiktok Group" },
        { id: 9, name: "Cinema Group" },
      ],
      isLoading: false,
    });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific-tiktok",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 50,
          concurrencyLimit: 5,
          requiresVideoApproval: true,
        },
        {
          id: "share-magnific-cinema",
          connectionId: "conn-magnific",
          groupId: 9,
          enabled: true,
          allowedAssetTypes: ["image"],
          dailyUseLimit: null,
          concurrencyLimit: null,
          requiresVideoApproval: false,
        },
      ],
      isLoading: false,
    });

    render(<McpConnectPanel defaultTab="sharing" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Daily use limit for Magnific (Tiktok Group)")).toHaveValue("50");
      expect(screen.getByLabelText("Daily use limit for Magnific (Cinema Group)")).toHaveValue("");
    });
    expect(screen.getByText("2 active share policy record(s)")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Stop sharing Magnific \(Cinema Group\)/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-magnific",
        groupId: 9,
        enabled: false,
        allowedAssetTypes: ["image"],
      }),
      expect.any(Object),
    );
    expect(mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 7, enabled: false }),
      expect.any(Object),
    );
  });

  it("keeps each group's form values independent when shares refetch (no cross-group overwrite)", async () => {
    mockGroupsList.mockReturnValue({
      data: [
        { id: 7, name: "Tiktok Group" },
        { id: 9, name: "Cinema Group" },
      ],
      isLoading: false,
    });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    // First render: only group 7 is shared (enabled), with saved limits.
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific-tiktok",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 50,
          concurrencyLimit: 5,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });

    const { rerender } = render(<McpConnectPanel defaultTab="sharing" />);
    await waitFor(() => {
      expect(screen.getByLabelText("Daily use limit for Magnific (Tiktok Group)")).toHaveValue("50");
    });

    // Simulate a refetch (e.g. after saving group 9) that now returns a newer,
    // first-iterated disabled row for group 9 alongside the still-enabled group 7 row.
    // Group 7's hydrated form must not be reset by group 9's disabled row.
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific-cinema",
          connectionId: "conn-magnific",
          groupId: 9,
          enabled: false,
          allowedAssetTypes: ["image"],
          dailyUseLimit: null,
          concurrencyLimit: null,
          requiresVideoApproval: false,
        },
        {
          id: "share-magnific-tiktok",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: 50,
          concurrencyLimit: 5,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });
    rerender(<McpConnectPanel defaultTab="sharing" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Daily use limit for Magnific (Tiktok Group)")).toHaveValue("50");
      expect(screen.getByLabelText("Concurrency limit for Magnific (Tiktok Group)")).toHaveValue("5");
    });
    // Group 9 is disabled, so it must not render an editable row of its own.
    expect(screen.queryByLabelText("Daily use limit for Magnific (Cinema Group)")).toBeNull();
    expect(screen.getByText("1 active share policy record(s)")).toBeDefined();
  });

  it("round-trips the owner-approval-for-video checkbox into the updateShare payload", async () => {
    const mutate = vi.fn();
    mockUpdateShare.mockReturnValue({ mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    mockGroupsList.mockReturnValue({ data: [{ id: 7, name: "Tiktok Group" }], isLoading: false });
    mockListConnections.mockReturnValue({
      data: [
        {
          id: "conn-magnific",
          providerKey: "magnific",
          providerDisplayName: "Magnific",
          providerAccountLabel: "magnific account",
          displayName: "Magnific",
          connectionScope: "personal",
          status: "connected",
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockListShares.mockReturnValue({
      data: [
        {
          id: "share-magnific-tiktok",
          connectionId: "conn-magnific",
          groupId: 7,
          enabled: true,
          allowedAssetTypes: ["image", "video"],
          dailyUseLimit: null,
          concurrencyLimit: null,
          requiresVideoApproval: true,
        },
      ],
      isLoading: false,
    });

    render(<McpConnectPanel defaultTab="sharing" />);
    await waitFor(() => {
      expect(screen.getByLabelText("Daily use limit for Magnific (Tiktok Group)")).toHaveValue("");
    });

    const approvalCheckbox = screen.getByLabelText("Owner approval required for video for Magnific (Tiktok Group)");
    expect(approvalCheckbox).toBeChecked();
    fireEvent.click(approvalCheckbox);
    expect(approvalCheckbox).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Save Magnific \(Tiktok Group\)/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-magnific",
        groupId: 7,
        requiresVideoApproval: false,
      }),
      expect.any(Object),
    );
  });
});
