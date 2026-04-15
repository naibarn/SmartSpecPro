/**
 * @vitest-environment jsdom
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const navigateMock = vi.fn();
const featureFlagsState = vi.hoisted(() => ({
  desktopHostEnabled: true,
  desktopAdvancedLocalMode: false,
  desktopPackageSync: true,
  desktopAgencyRuntime: true,
  desktopWorkerProjection: true,
}));
const authState = vi.hoisted(() => ({
  user: {
    role: "admin" as const,
    currentTenantId: "tenant-1" as string | null,
  },
}));
const tenantStatusState = vi.hoisted(() => ({
  status: {
    generatedAt: "2026-04-09T10:00:00.000Z",
    devices: [],
  },
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));
const controlPlaneState = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));
const packageCatalogState = vi.hoisted(() => ({
  catalog: {
    generatedAt: "2026-04-09T10:00:00.000Z",
    packages: [],
  },
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/desktop-host/governance", navigateMock] as const,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: keyof typeof featureFlagsState) => featureFlagsState[flag],
}));

vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({
  useDesktopHostStatus: () => tenantStatusState,
}));

vi.mock("@/features/desktop-host/useDesktopDeviceControlPlaneState", () => ({
  useDesktopDeviceControlPlaneState: () => controlPlaneState,
}));

vi.mock("@/features/desktop-host/useDesktopPackageCatalog", () => ({
  useDesktopPackageCatalog: () => packageCatalogState,
}));

vi.mock("@/features/desktop-host/DesktopHostSettingsPanel", () => ({
  DesktopHostSettingsPanel: () => <div data-testid="desktop-host-settings-panel">Governance panel</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import DesktopHostGovernance from "../DesktopHostGovernance";

describe("DesktopHostGovernance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user.currentTenantId = "tenant-1";
    authState.user.role = "admin";
  });

  it("renders the governance workspace and returns to the release workspace", () => {
    render(<DesktopHostGovernance />);

    expect(screen.getByText("Desktop host governance")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-host-settings-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to release workspace/i }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/desktop-host");
  });
});
