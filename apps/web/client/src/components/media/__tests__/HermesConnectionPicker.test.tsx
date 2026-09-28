/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ locale: "th", t: (key: string) => key }),
}));

const { mockListConnections } = vi.hoisted(() => ({
  mockListConnections: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    hermesConnections: {
      listConnections: { useQuery: mockListConnections },
    },
  },
}));

import { HermesConnectionPicker } from "../HermesConnectionPicker";

type Row = {
  id: string;
  scope: "server_shared" | "server_personal" | "private_worker";
  status: string;
  accountLabel: string | null;
  accountHint: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  assignedWorkerOnline: boolean;
  capabilitySummary: { imageEnabled: boolean; videoEnabled: boolean };
};

function makeRow(overrides: Partial<Row>): Row {
  return {
    id: "conn-1",
    scope: "server_personal",
    status: "authorized",
    accountLabel: "My Grok",
    accountHint: null,
    defaultForImage: false,
    defaultForVideo: false,
    assignedWorkerOnline: true,
    capabilitySummary: { imageEnabled: true, videoEnabled: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HermesConnectionPicker", () => {
  it("renders only authorized + capability-enabled + online rows as selectable options", () => {
    const eligible = makeRow({ id: "conn-eligible" });
    const pending = makeRow({ id: "conn-pending", status: "pending" });
    const disconnected = makeRow({ id: "conn-disconnected", status: "disconnected" });
    const error = makeRow({ id: "conn-error", status: "error" });
    mockListConnections.mockReturnValue({
      data: [eligible, pending, disconnected, error],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(
      <HermesConnectionPicker value="conn-eligible" onChange={onChange} assetType="image" />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((option) => option.value);
    expect(optionValues).toContain("conn-eligible");
    expect(optionValues).not.toContain("conn-pending");
    expect(optionValues).not.toContain("conn-disconnected");
    expect(optionValues).not.toContain("conn-error");
  });

  it("auto-selects when exactly one eligible connection exists", async () => {
    mockListConnections.mockReturnValue({
      data: [makeRow({ id: "conn-only" })],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value={null} onChange={onChange} assetType="image" />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("conn-only");
    });
  });

  it("does not auto-select when two or more connections are eligible", () => {
    mockListConnections.mockReturnValue({
      data: [makeRow({ id: "conn-a" }), makeRow({ id: "conn-b" })],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value={null} onChange={onChange} assetType="image" />);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears a stale selection that is no longer eligible", async () => {
    mockListConnections.mockReturnValue({
      data: [makeRow({ id: "conn-a", status: "reauth_required" })],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value="conn-a" onChange={onChange} assetType="image" />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it("shows the scope badge text per scope in the option label", () => {
    mockListConnections.mockReturnValue({
      data: [
        makeRow({ id: "conn-shared", scope: "server_shared" }),
        makeRow({ id: "conn-personal", scope: "server_personal" }),
        makeRow({ id: "conn-private", scope: "private_worker" }),
      ],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value="conn-shared" onChange={onChange} assetType="image" />);

    expect(screen.getByText(/ส่วนกลาง/)).toBeDefined();
    expect(screen.getByText(/ส่วนตัวบนเซิร์ฟเวอร์/)).toBeDefined();
    expect(screen.getByText(/เครื่องของฉัน/)).toBeDefined();
  });

  it("renders a worker-offline row as disabled with a reason and refuses to select it", () => {
    mockListConnections.mockReturnValue({
      data: [
        makeRow({ id: "conn-offline", assignedWorkerOnline: false }),
      ],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value={null} onChange={onChange} assetType="image" />);

    const option = screen.getByText(/Worker ออฟไลน์ในขณะนี้/).closest("option") as HTMLOptionElement;
    expect(option.disabled).toBe(true);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "conn-offline" } });
    expect(onChange).not.toHaveBeenCalledWith("conn-offline");
  });

  it("private_worker offline reason tells the user to start the Worker App", () => {
    mockListConnections.mockReturnValue({
      data: [
        makeRow({ id: "conn-priv-offline", scope: "private_worker", assignedWorkerOnline: false }),
      ],
      isLoading: false,
    });
    render(<HermesConnectionPicker value={null} onChange={vi.fn()} assetType="image" />);

    expect(screen.getByText(/เปิด Worker App/)).toBeDefined();
  });

  it("renders reauth_required and entitlement_restricted rows disabled with their status reason, never offered for generation", () => {
    mockListConnections.mockReturnValue({
      data: [
        makeRow({ id: "conn-reauth", status: "reauth_required" }),
        makeRow({ id: "conn-restricted", status: "entitlement_restricted" }),
      ],
      isLoading: false,
    });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value={null} onChange={onChange} assetType="image" />);

    const reauthOption = screen.getByText(/จำเป็นต้องเชื่อมต่อบัญชีใหม่อีกครั้ง/).closest("option") as HTMLOptionElement;
    const restrictedOption = screen
      .getByText(/xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API/)
      .closest("option") as HTMLOptionElement;
    expect(reauthOption.disabled).toBe(true);
    expect(restrictedOption.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalledWith("conn-reauth");
    expect(onChange).not.toHaveBeenCalledWith("conn-restricted");
  });

  it("empty state links to the Settings AI-providers tab and does not crash or auto-select", () => {
    mockListConnections.mockReturnValue({ data: [], isLoading: false });
    const onChange = vi.fn();

    render(<HermesConnectionPicker value={null} onChange={onChange} assetType="image" />);

    const link = screen.getByRole("link", { name: /เชื่อมต่อบัญชี Grok/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/settings?tab=integrations");
    expect(onChange).not.toHaveBeenCalled();
  });
});
