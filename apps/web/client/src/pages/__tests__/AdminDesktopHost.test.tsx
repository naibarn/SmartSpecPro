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
}));
const authState = vi.hoisted(() => ({
  user: {
    role: "admin" as const,
    currentTenantId: "tenant-1" as string | null,
  },
}));
const desktopReleaseConfigPanelMock = vi.hoisted(() => vi.fn());
const desktopReleasePanelMock = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/desktop-host", navigateMock] as const,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: keyof typeof featureFlagsState) => featureFlagsState[flag],
}));

vi.mock("@/components/help", () => ({
  HelpButton: ({ label = "Help" }: { label?: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/features/desktop-releases/DesktopReleaseConfigPanel", () => ({
  DesktopReleaseConfigPanel: (props: Record<string, unknown>) => {
    desktopReleaseConfigPanelMock(props);
    return <div data-testid="desktop-release-config-panel" />;
  },
}));

vi.mock("@/features/desktop-releases/DesktopReleasePanel", () => ({
  DesktopReleasePanel: (props: Record<string, unknown>) => {
    desktopReleasePanelMock(props);
    return <div data-testid="desktop-release-panel" />;
  },
}));

import AdminDesktopHost from "../AdminDesktopHost";

describe("AdminDesktopHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopReleaseConfigPanelMock.mockClear();
    desktopReleasePanelMock.mockClear();
    authState.user.currentTenantId = "tenant-1";
    authState.user.role = "admin";
  });

  it("renders the desktop release workspace hero", () => {
    render(<AdminDesktopHost />);

    expect(screen.getByText("Desktop release console")).toBeInTheDocument();
    expect(
      screen.getByText(/Prepare Windows, macOS, and Linux releases in one workspace/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open governance console/i })).toBeInTheDocument();
    expect(screen.getByText("Suggested sequence")).toBeInTheDocument();
  });

  it("returns to the dashboard from the back button", () => {
    render(<AdminDesktopHost />);

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));

    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to governance from the workspace", () => {
    render(<AdminDesktopHost />);

    fireEvent.click(screen.getByRole("button", { name: /open governance console/i }));

    expect(navigateMock).toHaveBeenCalledWith("/admin/desktop-host/governance");
  });

  it("enables desktop release controls for admins", () => {
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
