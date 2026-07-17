/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseUtils,
  mockGetAvailability,
  mockListConnections,
  mockListConnectedWorkers,
  mockAdminList,
  mockStartConnect,
  mockGetConnectStatus,
  mockSetDefault,
  mockDisconnect,
  mockProbe,
  mockAdminSetQuota,
  mockAdminDisable,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockUseUtils: vi.fn(),
  mockGetAvailability: vi.fn(),
  mockListConnections: vi.fn(),
  mockListConnectedWorkers: vi.fn(),
  mockAdminList: vi.fn(),
  mockStartConnect: vi.fn(),
  mockGetConnectStatus: vi.fn(),
  mockSetDefault: vi.fn(),
  mockDisconnect: vi.fn(),
  mockProbe: vi.fn(),
  mockAdminSetQuota: vi.fn(),
  mockAdminDisable: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mockUseUtils,
    hermesConnections: {
      getAvailability: { useQuery: mockGetAvailability },
      listConnections: { useQuery: mockListConnections },
      adminList: { useQuery: mockAdminList },
      startConnect: { useMutation: mockStartConnect },
      getConnectStatus: { useQuery: mockGetConnectStatus },
      setDefault: { useMutation: mockSetDefault },
      disconnect: { useMutation: mockDisconnect },
      probe: { useMutation: mockProbe },
      adminSetQuota: { useMutation: mockAdminSetQuota },
      adminDisable: { useMutation: mockAdminDisable },
    },
    users: {
      listConnectedWorkers: { useQuery: mockListConnectedWorkers },
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
}));

import { HermesConnectPanel, formatHermesDeviceCodeCountdown } from "../HermesConnectPanel";

const AVAILABLE = {
  enabled: true,
  videoEnabled: true,
  scopes: { serverShared: true, serverPersonal: true, privateWorker: true },
};

function baseConnectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "conn-1",
    scope: "server_personal",
    status: "authorized",
    accountLabel: "My Grok",
    accountHint: null,
    defaultForImage: false,
    defaultForVideo: false,
    entitlementStatus: null,
    assignedWorkerId: null,
    assignedWorkerOnline: true,
    capabilitySummary: {
      probedAt: null,
      imageEnabled: true,
      videoEnabled: true,
      maxEditReferences: 3,
    },
    dailyJobQuota: null,
    createdAt: new Date().toISOString(),
    authorizedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { role: "user" } });
  mockUseUtils.mockReturnValue({
    hermesConnections: {
      listConnections: { invalidate: vi.fn() },
      adminList: { invalidate: vi.fn() },
    },
  });
  mockGetAvailability.mockReturnValue({ data: AVAILABLE, isLoading: false });
  mockListConnections.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() });
  mockListConnectedWorkers.mockReturnValue({ data: { workers: [] }, isLoading: false });
  mockAdminList.mockReturnValue({ data: [], isLoading: false });
  mockStartConnect.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockGetConnectStatus.mockReturnValue({ data: undefined, isLoading: false });
  mockSetDefault.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockDisconnect.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockProbe.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockAdminSetQuota.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockAdminDisable.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("HermesConnectPanel", () => {
  it("shows the disabled explanation and no connect buttons when the feature is disabled", () => {
    mockGetAvailability.mockReturnValue({
      data: { enabled: false, videoEnabled: false, scopes: { serverShared: false, serverPersonal: false, privateWorker: false } },
      isLoading: false,
    });

    render(<HermesConnectPanel />);

    expect(screen.getByTestId("hermes-panel-disabled-explanation")).toBeDefined();
    expect(screen.queryByTestId("hermes-connect-button-server_personal")).toBeNull();
  });

  it("hides the private-worker connect entry with a reason when that scope is unavailable", () => {
    mockGetAvailability.mockReturnValue({
      data: { enabled: true, videoEnabled: true, scopes: { serverShared: true, serverPersonal: true, privateWorker: false } },
      isLoading: false,
    });

    render(<HermesConnectPanel />);

    expect(screen.queryByTestId("hermes-connect-button-private_worker")).toBeNull();
    expect(screen.getByTestId("hermes-connect-disabled-private_worker")).toBeDefined();
  });

  it("gates startConnect behind an explicit consent acknowledgment", () => {
    const mutate = vi.fn();
    mockStartConnect.mockReturnValue({ mutate, isPending: false });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByTestId("hermes-connect-button-server_personal"));

    expect(screen.getByTestId("hermes-consent-server_personal")).toBeDefined();
    const confirmButton = screen.getByRole("button", { name: /ยืนยันและเชื่อมต่อ/ });
    expect(confirmButton).toHaveProperty("disabled", true);
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI/));
    fireEvent.click(confirmButton);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "server_personal", consentAcknowledged: true }),
    );
  });

  it("renders the server_shared pool-wide-sharing addendum only for that scope", () => {
    render(<HermesConnectPanel />);

    fireEvent.click(screen.getByTestId("hermes-connect-button-server_personal"));
    expect(screen.queryByTestId("hermes-consent-shared-addendum")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ยกเลิก/ }));

    fireEvent.click(screen.getByTestId("hermes-connect-button-private_worker"));
    expect(screen.queryByTestId("hermes-consent-shared-addendum")).toBeNull();
  });

  it("shows the private-worker selector only for that scope and auto-selects a single online worker", () => {
    mockListConnectedWorkers.mockReturnValue({
      data: { workers: [{ workerId: "worker-1", displayName: "My Desktop", status: "online" }] },
      isLoading: false,
    });
    const mutate = vi.fn();
    mockStartConnect.mockReturnValue({ mutate, isPending: false });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByTestId("hermes-connect-button-private_worker"));

    expect(screen.getByTestId("hermes-private-worker-selector")).toBeDefined();
    fireEvent.click(screen.getByLabelText(/รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI/));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันและเชื่อมต่อ/ }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "private_worker", workerId: "worker-1" }),
    );
  });

  it("renders the device-code screen with verification link, user code, and countdown", async () => {
    mockStartConnect.mockReturnValue({
      mutate: (input: unknown, opts?: { onSuccess?: (r: { connectionId: string }) => void }) => {
        // Simulate the tRPC mutation's own onSuccess callback firing.
      },
      isPending: false,
    });
    // Force the connecting state directly via getConnectStatus + a click flow:
    // simplest is to click connect, ack consent, click confirm (which calls the
    // panel's own onSuccess through the mutation options captured internally).
    let capturedOnSuccess: ((result: { connectionId: string }) => void) | undefined;
    mockStartConnect.mockImplementation((opts: { onSuccess?: (result: { connectionId: string }) => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return { mutate: vi.fn(), isPending: false };
    });
    mockGetConnectStatus.mockReturnValue({
      data: {
        status: "pending",
        verificationUrl: "https://x.ai/device",
        userCode: "ABCD-1234",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      isLoading: false,
    });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByTestId("hermes-connect-button-server_personal"));
    fireEvent.click(screen.getByLabelText(/รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI/));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันและเชื่อมต่อ/ }));
    act(() => {
      capturedOnSuccess?.({ connectionId: "conn-new" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("hermes-user-code").textContent).toBe("ABCD-1234");
    });
    expect(screen.getByRole("button", { name: /เปิดหน้าเชื่อมต่อของ xAI/ })).toBeDefined();
    expect(screen.getByTestId("hermes-device-code-countdown").textContent).not.toBe("");
  });

  it("renders the typed error copy + retry affordance for HERMES_OAUTH_SESSION_EXPIRED", async () => {
    let capturedOnSuccess: ((result: { connectionId: string }) => void) | undefined;
    mockStartConnect.mockImplementation((opts: { onSuccess?: (result: { connectionId: string }) => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return { mutate: vi.fn(), isPending: false };
    });
    mockGetConnectStatus.mockReturnValue({
      data: { status: "error", errorCode: "HERMES_OAUTH_SESSION_EXPIRED" },
      isLoading: false,
    });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByTestId("hermes-connect-button-server_personal"));
    fireEvent.click(screen.getByLabelText(/รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI/));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันและเชื่อมต่อ/ }));
    act(() => {
      capturedOnSuccess?.({ connectionId: "conn-new" });
    });

    await waitFor(() => {
      expect(screen.getByText(/เซสชัน OAuth หมดอายุ/)).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /ลองใหม่ \/ Reconnect/ })).toBeDefined();
  });

  it("invalidates listConnections and shows success once status flips to authorized", async () => {
    const invalidate = vi.fn();
    mockUseUtils.mockReturnValue({
      hermesConnections: {
        listConnections: { invalidate },
        adminList: { invalidate: vi.fn() },
      },
    });
    let capturedOnSuccess: ((result: { connectionId: string }) => void) | undefined;
    mockStartConnect.mockImplementation((opts: { onSuccess?: (result: { connectionId: string }) => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return { mutate: vi.fn(), isPending: false };
    });
    mockGetConnectStatus.mockReturnValue({ data: { status: "authorized" }, isLoading: false });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByTestId("hermes-connect-button-server_personal"));
    fireEvent.click(screen.getByLabelText(/รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI/));
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันและเชื่อมต่อ/ }));
    act(() => {
      capturedOnSuccess?.({ connectionId: "conn-new" });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("wires disconnect/probe/setDefault actions to the matching mutations", () => {
    const disconnectMutate = vi.fn();
    const probeMutate = vi.fn();
    const setDefaultMutate = vi.fn();
    mockDisconnect.mockReturnValue({ mutate: disconnectMutate, isPending: false });
    mockProbe.mockReturnValue({ mutate: probeMutate, isPending: false });
    mockSetDefault.mockReturnValue({ mutate: setDefaultMutate, isPending: false });
    mockListConnections.mockReturnValue({
      data: [baseConnectionRow()],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^ตรวจสอบ$/ }));
    expect(probeMutate).toHaveBeenCalledWith({ connectionId: "conn-1" });

    fireEvent.click(screen.getByRole("button", { name: /ยกเลิกการเชื่อมต่อ/ }));
    expect(disconnectMutate).toHaveBeenCalledWith({ connectionId: "conn-1" });

    fireEvent.click(screen.getByLabelText(/ตั้งเป็นค่าเริ่มต้นสำหรับภาพ/));
    expect(setDefaultMutate).toHaveBeenCalledWith({ connectionId: "conn-1", assetType: "image" });
  });

  it("wires the test-generation buttons to probe with testGeneration, and keeps the plain probe button free of it (regression)", () => {
    const probeMutate = vi.fn();
    mockProbe.mockReturnValue({ mutate: probeMutate, isPending: false });
    mockListConnections.mockReturnValue({
      data: [baseConnectionRow()],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    fireEvent.click(screen.getByRole("button", { name: /^ตรวจสอบ$/ }));
    expect(probeMutate).toHaveBeenCalledWith({ connectionId: "conn-1" });

    fireEvent.click(screen.getByTestId("hermes-test-image-button-conn-1"));
    expect(probeMutate).toHaveBeenCalledWith({ connectionId: "conn-1", testGeneration: "image" });

    fireEvent.click(screen.getByTestId("hermes-test-video-button-conn-1"));
    expect(probeMutate).toHaveBeenCalledWith({ connectionId: "conn-1", testGeneration: "video" });
  });

  it("hides the video test-generation button when videoEnabled is false, shows it when true", () => {
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-novideo",
          capabilitySummary: {
            probedAt: null,
            imageEnabled: true,
            videoEnabled: false,
            maxEditReferences: null,
            lastGenerationTest: null,
          },
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<HermesConnectPanel />);
    expect(screen.getByTestId("hermes-test-image-button-conn-novideo")).toBeDefined();
    expect(screen.queryByTestId("hermes-test-video-button-conn-novideo")).toBeNull();

    mockListConnections.mockReturnValue({
      data: [baseConnectionRow({ id: "conn-withvideo" })],
      isLoading: false,
      refetch: vi.fn(),
    });
    rerender(<HermesConnectPanel />);
    expect(screen.getByTestId("hermes-test-video-button-conn-withvideo")).toBeDefined();
  });

  it("renders a success line with the timestamp for a passing lastGenerationTest", () => {
    const at = new Date().toISOString();
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-tested-ok",
          capabilitySummary: {
            probedAt: null,
            imageEnabled: true,
            videoEnabled: true,
            maxEditReferences: null,
            lastGenerationTest: { assetType: "image", ok: true, at },
          },
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    const result = screen.getByTestId("hermes-generation-test-result-conn-tested-ok");
    expect(result.textContent).toMatch(/ทดสอบสร้างภาพสำเร็จ/);
    expect(result.textContent).toMatch(/น\./);
  });

  it("renders the human Thai message (not the bare code) for a failing lastGenerationTest", () => {
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-tested-fail",
          capabilitySummary: {
            probedAt: null,
            imageEnabled: true,
            videoEnabled: true,
            maxEditReferences: null,
            lastGenerationTest: {
              assetType: "image",
              ok: false,
              at: new Date().toISOString(),
              errorCode: "HERMES_ENTITLEMENT_RESTRICTED",
            },
          },
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    const result = screen.getByTestId("hermes-generation-test-result-conn-tested-fail");
    expect(result.textContent).toMatch(/xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API/);
    expect(result.textContent).not.toMatch(/HERMES_ENTITLEMENT_RESTRICTED/);
  });

  it("disables the probe/test-generation buttons while probe is pending", () => {
    mockProbe.mockReturnValue({ mutate: vi.fn(), isPending: true });
    mockListConnections.mockReturnValue({
      data: [baseConnectionRow()],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(screen.getByRole("button", { name: /ตรวจสอบ/ })).toHaveProperty("disabled", true);
    expect(screen.getByTestId("hermes-test-image-button-conn-1")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("hermes-test-video-button-conn-1")).toHaveProperty("disabled", true);
  });

  it("renders the entitlement_restricted spec copy with a reconnect affordance", () => {
    mockListConnections.mockReturnValue({
      data: [baseConnectionRow({ id: "conn-restricted", status: "entitlement_restricted" })],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(screen.getByTestId("hermes-entitlement-restricted-conn-restricted")).toBeDefined();
    expect(
      screen.getByText(/เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาต/),
    ).toBeDefined();
    expect(screen.getAllByRole("button", { name: /เชื่อมต่อใหม่/ }).length).toBeGreaterThan(0);
  });

  it("hides the reconnect CTA for a server_shared entitlement_restricted row when the caller is not admin", () => {
    mockUseAuth.mockReturnValue({ user: { role: "user" } });
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-shared-restricted",
          scope: "server_shared",
          status: "entitlement_restricted",
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(
      screen.queryByRole("button", { name: /เชื่อมต่อใหม่/ }),
    ).toBeNull();
    expect(screen.getByTestId("hermes-reconnect-contact-admin-conn-shared-restricted")).toBeDefined();
    expect(screen.getByText(/ติดต่อผู้ดูแลระบบ/)).toBeDefined();
  });

  it("hides the reconnect CTA for a server_shared reauth_required row when the caller is not admin", () => {
    mockUseAuth.mockReturnValue({ user: { role: "user" } });
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-shared-reauth",
          scope: "server_shared",
          status: "reauth_required",
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(screen.queryByRole("button", { name: /เชื่อมต่อใหม่/ })).toBeNull();
    expect(screen.getByTestId("hermes-reconnect-contact-admin-conn-shared-reauth")).toBeDefined();
  });

  it("shows the reconnect CTA for a server_shared entitlement_restricted/reauth_required row when the caller IS admin", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-shared-restricted-admin",
          scope: "server_shared",
          status: "entitlement_restricted",
        }),
        baseConnectionRow({
          id: "conn-shared-reauth-admin",
          scope: "server_shared",
          status: "reauth_required",
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(screen.getAllByRole("button", { name: /เชื่อมต่อใหม่/ }).length).toBe(2);
    expect(screen.queryByTestId("hermes-reconnect-contact-admin-conn-shared-restricted-admin")).toBeNull();
    expect(screen.queryByTestId("hermes-reconnect-contact-admin-conn-shared-reauth-admin")).toBeNull();
  });

  it("still shows the reconnect CTA for a non-admin on server_personal/private_worker rows (regression — only server_shared is gated)", () => {
    mockUseAuth.mockReturnValue({ user: { role: "user" } });
    mockListConnections.mockReturnValue({
      data: [
        baseConnectionRow({
          id: "conn-personal-reauth",
          scope: "server_personal",
          status: "reauth_required",
        }),
        baseConnectionRow({
          id: "conn-private-restricted",
          scope: "private_worker",
          status: "entitlement_restricted",
        }),
      ],
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HermesConnectPanel />);

    expect(screen.getAllByRole("button", { name: /เชื่อมต่อใหม่/ }).length).toBe(2);
    expect(screen.queryByTestId("hermes-reconnect-contact-admin-conn-personal-reauth")).toBeNull();
    expect(screen.queryByTestId("hermes-reconnect-contact-admin-conn-private-restricted")).toBeNull();
  });

  it("renders no admin sub-panel or server_shared controls for a non-admin user", () => {
    mockUseAuth.mockReturnValue({ user: { role: "user" } });

    render(<HermesConnectPanel />);

    expect(screen.queryByTestId("hermes-admin-subpanel")).toBeNull();
    expect(screen.queryByTestId("hermes-admin-connect-shared")).toBeNull();
  });

  it("renders the admin sub-panel with adminSetQuota/adminDisable wired for an admin user", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    const setQuotaMutate = vi.fn();
    const disableMutate = vi.fn();
    mockAdminSetQuota.mockReturnValue({ mutate: setQuotaMutate, isPending: false });
    mockAdminDisable.mockReturnValue({ mutate: disableMutate, isPending: false });
    mockAdminList.mockReturnValue({
      data: [baseConnectionRow({ id: "conn-shared", scope: "server_shared", dailyJobQuota: 50 })],
      isLoading: false,
    });

    render(<HermesConnectPanel />);

    expect(screen.getByTestId("hermes-admin-subpanel")).toBeDefined();
    expect(screen.getByTestId("hermes-admin-connect-shared")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /ปิดใช้งาน/ }));
    expect(disableMutate).toHaveBeenCalledWith({ connectionId: "conn-shared" });

    fireEvent.click(screen.getByRole("button", { name: /บันทึกโควต้า/ }));
    expect(setQuotaMutate).toHaveBeenCalledWith({ connectionId: "conn-shared", dailyJobQuota: 50 });
  });

  it("never renders a token-like string from the connection fixtures", () => {
    mockListConnections.mockReturnValue({
      data: [baseConnectionRow({ id: "conn-safe" })],
      isLoading: false,
      refetch: vi.fn(),
    });

    const { container } = render(<HermesConnectPanel />);
    expect(container.textContent).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(container.textContent).not.toMatch(/access_token|refresh_token/i);
  });
});

describe("formatHermesDeviceCodeCountdown", () => {
  it("renders mm:ss for a future expiry", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 90 * 1000).toISOString();
    expect(formatHermesDeviceCodeCountdown(expiresAt, now)).toBe("1:30");
  });

  it("renders an expired label once the deadline has passed", () => {
    const now = Date.now();
    const expiresAt = new Date(now - 1000).toISOString();
    expect(formatHermesDeviceCodeCountdown(expiresAt, now)).toBe("หมดอายุแล้ว");
  });

  it("returns an empty string when there is no expiry", () => {
    expect(formatHermesDeviceCodeCountdown(null, Date.now())).toBe("");
    expect(formatHermesDeviceCodeCountdown(undefined, Date.now())).toBe("");
  });
});
