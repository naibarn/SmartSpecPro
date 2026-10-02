/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { initializeDesktopAuthMock, getDesktopUserMock, browserAuthFetchMock } = vi.hoisted(() => ({
  initializeDesktopAuthMock: vi.fn(),
  getDesktopUserMock: vi.fn(),
  browserAuthFetchMock: vi.fn(),
}));

vi.mock("@/lib/webRuntime", () => ({
  hasTauriRuntime: () => true,
  getSmartSpecWebEndpoint: (path: string) => path,
}));

vi.mock("@/services/authService", () => ({
  initializeAuth: initializeDesktopAuthMock,
  getUser: getDesktopUserMock,
  logout: vi.fn(),
}));

vi.mock("@/lib/authBootstrap", () => ({
  AUTH_BOOTSTRAP_TIMEOUT_MS: 100,
  fetchWithTimeout: browserAuthFetchMock,
}));

vi.mock("@/lib/privateVault", () => ({
  clearPrivateVaultAccessToken: vi.fn(),
}));

vi.mock("@/features/local-ai/state/localAiDeviceStateStorage", () => ({
  clearLocalAiDeviceState: vi.fn(),
}));

import { AuthProvider, useAuth } from "./AuthContext";

function AuthStateProbe() {
  const { user, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="auth-loading">{String(isLoading)}</span>
      <span data-testid="auth-user">{user?.email ?? "signed-out"}</span>
      <span data-testid="auth-role">{user?.role ?? "no-role"}</span>
    </div>
  );
}

describe("AuthProvider desktop session bootstrap", () => {
  it("restores the Tauri bearer-token session instead of checking web cookies", async () => {
    initializeDesktopAuthMock.mockResolvedValue(undefined);
    getDesktopUserMock.mockResolvedValue({
      id: "42",
      email: "runner-owner@example.com",
      full_name: "Runner Owner",
      is_admin: false,
    });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("runner-owner@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("auth-role")).toHaveTextContent("user");
    expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
    expect(initializeDesktopAuthMock).toHaveBeenCalledOnce();
    expect(getDesktopUserMock).toHaveBeenCalledOnce();
    expect(browserAuthFetchMock).not.toHaveBeenCalled();
  });
});
