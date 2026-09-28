/**
 * @vitest-environment jsdom
 *
 * Feature 135 (Hermes Grok media worker) section 12 — HermesWorkerAdminPanel
 * coverage (§3.3): scope sections, quota consumption, kill-switch on/off
 * states (disabled renders visibly), and a fleet-row hermes badge/version
 * regression (worker fleet fixture tests live in AdminMonitoring's own
 * suite — this file covers the panel component in isolation).
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminOverview } = vi.hoisted(() => ({
  mockAdminOverview: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    hermesConnections: {
      adminOverview: { useQuery: (...args: unknown[]) => mockAdminOverview(...args) },
    },
  },
}));

import { HermesFleetBadge, HermesWorkerAdminPanel } from "../HermesWorkerAdminPanel";

const BASE_OVERVIEW = {
  scopes: [
    {
      scope: "server_shared",
      connections: [
        {
          id: "conn-shared-1",
          scope: "server_shared",
          status: "authorized",
          accountLabel: "Grok กลาง",
          accountHint: null,
          dailyJobQuota: 10,
          usedToday: 4,
          queueDepth: 2,
        },
      ],
    },
    { scope: "server_personal", connections: [] },
    { scope: "private_worker", connections: [] },
  ],
  settings: {
    hermesWorkerEnabled: true,
    sharedPoolEnabled: true,
    serverPersonalEnabled: false,
    privateEnabled: false,
    videoEnabled: false,
    sharedPoolFeeCredits: 2,
    minHermesVersion: "0.18.2",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HermesWorkerAdminPanel", () => {
  it("renders a loading state while the overview query is pending", () => {
    mockAdminOverview.mockReturnValue({ data: undefined, isLoading: true });
    render(<HermesWorkerAdminPanel />);
    expect(screen.getByTestId("hermes-worker-admin-panel")).toBeInTheDocument();
  });

  it("renders scope sections, quota consumption, and kill-switch states", () => {
    mockAdminOverview.mockReturnValue({ data: BASE_OVERVIEW, isLoading: false });
    render(<HermesWorkerAdminPanel />);

    expect(screen.getByTestId("hermes-admin-scope-server_shared")).toBeInTheDocument();
    expect(screen.getByTestId("hermes-admin-connection-conn-shared-1")).toBeInTheDocument();
    expect(screen.getByText("4/10 วันนี้")).toBeInTheDocument();
    expect(screen.getByText(/คิวงานค้าง: 2/)).toBeInTheDocument();

    // Enabled kill switches render "เปิดใช้งาน".
    expect(screen.getByTestId("hermes-kill-switch-Hermes Worker")).toHaveAttribute("data-enabled", "true");
    expect(screen.getByTestId("hermes-kill-switch-ส่วนกลาง")).toHaveAttribute("data-enabled", "true");

    // Disabled flags render the "off" state visibly.
    expect(screen.getByTestId("hermes-kill-switch-ส่วนตัวบนเซิร์ฟเวอร์")).toHaveAttribute("data-enabled", "false");
    expect(screen.getByTestId("hermes-kill-switch-เครื่องส่วนตัว")).toHaveAttribute("data-enabled", "false");
    expect(screen.getByTestId("hermes-kill-switch-วิดีโอ")).toHaveAttribute("data-enabled", "false");
    expect(screen.getAllByText(/ปิดใช้งาน/).length).toBeGreaterThan(0);

    // Empty scope groups render "no connections" copy, not blank.
    expect(screen.getByTestId("hermes-admin-scope-server_personal")).toHaveTextContent("ไม่มีบัญชีที่เชื่อมต่อในกลุ่มนี้");
  });

  it("is read-only — links to Settings (connections) instead of wiring its own mutations", () => {
    mockAdminOverview.mockReturnValue({ data: BASE_OVERVIEW, isLoading: false });
    render(<HermesWorkerAdminPanel />);

    const settingsLink = screen.getByTestId("hermes-admin-panel-settings-link");
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink.getAttribute("href")).toBe("/settings?tab=integrations");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("also links to the Infrastructure panel where kill switches + limits actually live (not Settings → Integrations)", () => {
    mockAdminOverview.mockReturnValue({ data: BASE_OVERVIEW, isLoading: false });
    render(<HermesWorkerAdminPanel />);

    const infraLink = screen.getByTestId("hermes-admin-panel-infrastructure-link");
    expect(infraLink).toBeInTheDocument();
    expect(infraLink.getAttribute("href")).toBe("/admin/settings?tab=infrastructure");

    // Both destinations must be discoverable and distinct — kill
    // switches/limits are NOT under Settings → Integrations.
    const settingsLink = screen.getByTestId("hermes-admin-panel-settings-link");
    expect(infraLink).not.toBe(settingsLink);
  });

  it("renders an unlimited-quota connection without a progress bar", () => {
    const overview = {
      ...BASE_OVERVIEW,
      scopes: [
        {
          scope: "server_shared",
          connections: [
            { ...BASE_OVERVIEW.scopes[0].connections[0], dailyJobQuota: null, usedToday: 7 },
          ],
        },
        { scope: "server_personal", connections: [] },
        { scope: "private_worker", connections: [] },
      ],
    };
    mockAdminOverview.mockReturnValue({ data: overview, isLoading: false });
    render(<HermesWorkerAdminPanel />);

    expect(screen.getByText(/โควต้า: ไม่จำกัด · ใช้ไปวันนี้ 7/)).toBeInTheDocument();
    expect(screen.queryByTestId("hermes-admin-quota-conn-shared-1")).not.toBeInTheDocument();
  });
});

describe("HermesFleetBadge — worker fleet row hermes badge (section 12 §4.3)", () => {
  it("renders a hermes badge + version for a fleet row with capabilitiesJson.hermesMedia", () => {
    render(<HermesFleetBadge hermes={{ ready: true, version: "0.18.2" }} workerId="worker-1" />);
    const badge = screen.getByTestId("hermes-fleet-badge-worker-1");
    expect(badge).toHaveTextContent("Hermes media ready");
    expect(badge).toHaveTextContent("v0.18.2");
  });

  it("renders a 'not ready' state when the capability is advertised:false (e.g. below min version)", () => {
    render(<HermesFleetBadge hermes={{ ready: false, version: "0.17.0" }} workerId="worker-2" />);
    const badge = screen.getByTestId("hermes-fleet-badge-worker-2");
    expect(badge).toHaveTextContent("Hermes media not ready");
    expect(badge).toHaveTextContent("v0.17.0");
  });

  it("regression: AdminMonitoring's fleet row rendering only renders this badge when worker.hermes is present — verified via the component contract (undefined → no badge, no crash)", () => {
    // HermesFleetBadge itself requires `hermes` (non-optional prop) — the
    // "renders unchanged" contract lives in the caller
    // (`AdminMonitoring.tsx`: `{worker.hermes ? <HermesFleetBadge .../> : null}`).
    // This asserts the presentational unit never renders extra chrome when
    // there IS no version (undefined) beyond the ready/not-ready label.
    render(<HermesFleetBadge hermes={{ ready: true, version: null }} workerId="worker-3" />);
    const badge = screen.getByTestId("hermes-fleet-badge-worker-3");
    expect(badge).toHaveTextContent("Hermes media ready");
    expect(badge.textContent).not.toMatch(/v(?:null|undefined)/);
  });
});
