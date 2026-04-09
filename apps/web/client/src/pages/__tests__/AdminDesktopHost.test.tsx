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
const tenantStatusState = vi.hoisted(() => ({
  status: {
    generatedAt: "2026-04-09T10:00:00.000Z",
    devices: [
      {
        deviceId: "device-1",
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        healthStatus: "online",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
        enrolledAt: "2026-04-09T09:00:00.000Z",
        lastSeenAt: "2026-04-09T10:00:00.000Z",
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        warningFlags: [],
        capabilities: {},
        localRoots: [],
        packageCachePaths: [],
        packageSyncState: {
          syncStatus: "ready",
          lastSyncAt: null,
          lastError: null,
          syncedPackageIds: [],
          packageCount: 0,
          lastRevocationCheckAt: null,
        },
        pendingActions: [],
        currentWorkspaceProfile: null,
        lastRunSummary: null,
        policyVersion: null,
        policyExpiresAt: null,
      },
    ],
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
const desktopReleaseConfigPanelMock = vi.hoisted(() => vi.fn());
const desktopReleasePanelMock = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/desktop-host", navigateMock] as const,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      role: "admin",
    },
  }),
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
  DesktopHostSettingsPanel: () => (
    <div>
      <h2>Tenant Devices</h2>
      <h2>Desktop Package Catalog</h2>
    </div>
  ),
}));

vi.mock("@/features/desktop-releases/DesktopReleaseConfigPanel", () => ({
  DesktopReleaseConfigPanel: (props: Record<string, unknown>) => {
    desktopReleaseConfigPanelMock(props);
    return null;
  },
}));

vi.mock("@/features/desktop-releases/DesktopReleasePanel", () => ({
  DesktopReleasePanel: (props: Record<string, unknown>) => {
    desktopReleasePanelMock(props);
    return null;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) {
        return key;
      }
      return Object.entries(values).reduce(
        (message, [name, value]) => message.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
    locale: "en",
  }),
}));

import AdminDesktopHost from "../AdminDesktopHost";

describe("AdminDesktopHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopReleaseConfigPanelMock.mockClear();
    desktopReleasePanelMock.mockClear();
  });

  it("renders tenant governance posture", () => {
    render(<AdminDesktopHost />);

    expect(screen.getByText("Tenant Desktop Governance")).toBeInTheDocument();
    expect(screen.getByText("Tenant Devices")).toBeInTheDocument();
    expect(screen.getByText("Desktop Package Catalog")).toBeInTheDocument();
  });

  it("returns to the dashboard from the back button", () => {
    render(<AdminDesktopHost />);

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("enables desktop build triggers for admins", () => {
    render(<AdminDesktopHost />);

    expect(desktopReleaseConfigPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
    expect(desktopReleasePanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "admin",
        enabled: true,
        canTriggerBuild: true,
      }),
    );
  });
});
