/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListConnections } = vi.hoisted(() => ({
  mockListConnections: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    mcpConnections: {
      listConnections: { useQuery: mockListConnections },
    },
  },
}));

import { McpConnectionPicker } from "../McpConnectionPicker";

type Connection = {
  id: string;
  providerKey: string;
  providerDisplayName: string;
  providerAccountLabel?: string;
  displayName: string;
  status: string;
  connectionScope: "personal" | "shared";
  sharedGroupId?: number | null;
  allowedAssetTypes?: string[];
};

const sharedConnection: Connection = {
  id: "conn-shared-1",
  providerKey: "magnific",
  providerDisplayName: "Magnific",
  providerAccountLabel: "Team Magnific",
  displayName: "Magnific",
  status: "connected",
  connectionScope: "shared",
  sharedGroupId: 42,
  allowedAssetTypes: ["image"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("McpConnectionPicker", () => {
  it("auto-selects the single eligible shared connection and reports both id and group", async () => {
    mockListConnections.mockReturnValue({ data: [sharedConnection], isLoading: false });
    const onChange = vi.fn();
    const onSharedGroupChange = vi.fn();

    render(
      <McpConnectionPicker
        value={null}
        sharedGroupId={null}
        onChange={onChange}
        onSharedGroupChange={onSharedGroupChange}
        assetType="image"
      />,
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("conn-shared-1");
      expect(onSharedGroupChange).toHaveBeenCalledWith(42);
    });
  });

  it("manually selecting a shared option keeps it selected after the parent re-renders with the new value/group (regression guard)", async () => {
    const connA: Connection = {
      id: "conn-a",
      providerKey: "magnific",
      providerDisplayName: "Magnific",
      providerAccountLabel: "Team A",
      displayName: "Magnific",
      status: "connected",
      connectionScope: "shared",
      sharedGroupId: 7,
      allowedAssetTypes: ["image"],
    };
    const connB: Connection = {
      id: "conn-b",
      providerKey: "magnific",
      providerDisplayName: "Magnific",
      providerAccountLabel: "Team B",
      displayName: "Magnific",
      status: "connected",
      connectionScope: "shared",
      sharedGroupId: 9,
      allowedAssetTypes: ["image"],
    };
    mockListConnections.mockReturnValue({ data: [connA, connB], isLoading: false });
    const onChange = vi.fn();
    const onSharedGroupChange = vi.fn();

    const { rerender } = render(
      <McpConnectionPicker
        value={null}
        sharedGroupId={null}
        onChange={onChange}
        onSharedGroupChange={onSharedGroupChange}
        assetType="image"
      />,
    );

    // Two eligible options means the auto-select effect should NOT fire.
    expect(onChange).not.toHaveBeenCalled();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "conn-a:7" } });

    expect(onChange).toHaveBeenCalledWith("conn-a");
    expect(onSharedGroupChange).toHaveBeenCalledWith(7);

    rerender(
      <McpConnectionPicker
        value="conn-a"
        sharedGroupId={7}
        onChange={onChange}
        onSharedGroupChange={onSharedGroupChange}
        assetType="image"
      />,
    );

    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("conn-a:7");
  });

  it("resolves a shared connection by id alone when the parent does not track sharedGroupId, and does not clear the selection", async () => {
    mockListConnections.mockReturnValue({ data: [sharedConnection], isLoading: false });
    const onChange = vi.fn();

    render(
      <McpConnectionPicker
        value="conn-shared-1"
        onChange={onChange}
        assetType="image"
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("conn-shared-1:42");

    // Give any effects a chance to run; onChange must never be called with null here.
    await waitFor(() => {
      expect(onChange).not.toHaveBeenCalledWith(null);
    });
  });

  it("disambiguates two shares of the same connection id by sharedGroupId when the parent tracks group", async () => {
    const shareGroupA: Connection = {
      id: "conn-dual",
      providerKey: "magnific",
      providerDisplayName: "Magnific",
      providerAccountLabel: "Group A share",
      displayName: "Magnific",
      status: "connected",
      connectionScope: "shared",
      sharedGroupId: 11,
      allowedAssetTypes: ["image"],
    };
    const shareGroupB: Connection = {
      id: "conn-dual",
      providerKey: "magnific",
      providerDisplayName: "Magnific",
      providerAccountLabel: "Group B share",
      displayName: "Magnific",
      status: "connected",
      connectionScope: "shared",
      sharedGroupId: 22,
      allowedAssetTypes: ["image"],
    };
    mockListConnections.mockReturnValue({ data: [shareGroupA, shareGroupB], isLoading: false });
    const onChange = vi.fn();
    const onSharedGroupChange = vi.fn();

    render(
      <McpConnectionPicker
        value="conn-dual"
        sharedGroupId={22}
        onChange={onChange}
        onSharedGroupChange={onSharedGroupChange}
        assetType="image"
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("conn-dual:22");
  });
});
