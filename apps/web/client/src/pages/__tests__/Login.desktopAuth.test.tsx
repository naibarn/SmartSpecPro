/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  mockSetLocation,
  mockFetch,
  mockHasTauriRuntime,
  mockToastSuccess,
  mockToastError,
  mockSetAuthToken,
  mockSetAuthRefreshToken,
  mockSetDesktopAuthUser,
  mockSignInDesktopWithBrowser,
} = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockFetch: vi.fn(),
  mockHasTauriRuntime: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockSetAuthToken: vi.fn(),
  mockSetAuthRefreshToken: vi.fn(),
  mockSetDesktopAuthUser: vi.fn(),
  mockSignInDesktopWithBrowser: vi.fn(),
}));

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    statusText: "",
    type: "basic" as ResponseType,
    url: "",
    clone: () => makeResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocation: () => ["/login", mockSetLocation] as const,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
  }),
}));

vi.mock("@/lib/fingerprint", () => ({
  generateFingerprint: vi.fn(() => Promise.resolve("fp")),
}));

vi.mock("@/lib/posthog", () => ({
  getPostHog: () => null,
}));

vi.mock("@/lib/webRuntime", () => ({
  getSmartSpecWebEndpoint: (path: string) => path,
  hasTauriRuntime: () => mockHasTauriRuntime(),
}));

vi.mock("../../lib/trpc", () => ({
  trpc: {
    auth: {
      oauthProviders: {
        useQuery: () => ({
          data: {
            google: false,
            github: false,
          },
        }),
      },
      getRecoveryCapabilities: {
        useQuery: () => ({
          data: {
            sms: {
              enabled: false,
            },
          },
        }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "login.signIn": "Sign In",
        "login.continueWithEmailDivider": "or continue with email",
        "login.desktopBrowserCode": "Browser sign-in code: {{code}}",
        "login.desktopBrowserSignIn": "Sign in via browser",
        "login.desktopBrowserSignInHint": "Use this for Google, GitHub, or two-factor accounts.",
        "login.desktopBrowserWaiting": "Waiting for browser sign-in...",
        "login.toast.success": "Login successful! Redirecting...",
        "login.toast.failed": "Login failed. Please try again.",
        "login.toast.networkError": "Unable to reach the sign-in server. Please check your connection and try again.",
        "login.toast.desktopBrowserRequired": "This account must sign in through the browser. Please use Sign in via browser.",
        "login.toast.desktopBrowserFailed": "Browser sign-in failed. Please try again.",
        "login.invalidCredentials": "Invalid email or password.",
        "login.toast.emailVerificationRequired": "Please verify your email before logging in.",
        "login.toast.accountLocked": "Your account is temporarily locked. Please try again later.",
        "login.toast.serverError": "The sign-in server returned an error. Please try again.",
        "login.toast.unexpectedResponse": "Unexpected response from the authentication server. Please try again.",
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("@/services/authService", () => ({
  setAuthRefreshToken: mockSetAuthRefreshToken,
  setAuthToken: mockSetAuthToken,
  setUser: mockSetDesktopAuthUser,
  signInDesktopWithBrowser: mockSignInDesktopWithBrowser,
}));

import Login from "../Login";

describe("Login desktop auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTauriRuntime.mockReturnValue(false);
    window.history.replaceState({}, "", "/login");
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  it("uses the web login path outside Tauri", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        result: {
          data: {
            json: {
              success: true,
              user: {
                id: 42,
                email: "admin@smartaihub.app",
                name: "Admin",
                currentTenantId: null,
              },
            },
          },
        },
      }),
    );

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "admin@smartaihub.app" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "P@ssw0rd123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/trpc/auth.login",
        expect.objectContaining({
          credentials: "include",
        }),
      );
    });

    expect(mockSetAuthToken).not.toHaveBeenCalled();
    expect(mockSetAuthRefreshToken).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Login successful! Redirecting...");
    expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
  });

  it("uses the desktop login path in Tauri and stores the returned token", async () => {
    mockHasTauriRuntime.mockReturnValue(true);
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        access_token: "desktop-token",
        refresh_token: "desktop-refresh",
        user: {
          id: 7,
          email: "admin@smartaihub.app",
          name: "Admin",
          role: "admin",
        },
      }),
    );

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "admin@smartaihub.app" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "P@ssw0rd123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/auth/desktop/login",
        expect.objectContaining({
          credentials: "omit",
        }),
      );
    });

    expect(mockSetAuthToken).toHaveBeenCalledWith("desktop-token");
    expect(mockSetAuthRefreshToken).toHaveBeenCalledWith("desktop-refresh");
    expect(mockSetDesktopAuthUser).toHaveBeenCalledWith({
      id: "7",
      email: "admin@smartaihub.app",
      full_name: "Admin",
      is_admin: true,
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Login successful! Redirecting...");
    expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
  });

  it("shows a clear browser-sign-in message for desktop accounts that require it", async () => {
    mockHasTauriRuntime.mockReturnValue(true);
    mockFetch.mockResolvedValueOnce(
      makeResponse(409, {
        error: {
          message: "Desktop direct login does not yet support 2FA verification. Use 'Sign in via browser' to complete sign-in.",
        },
        requiresBrowserSignIn: true,
        reason: "two_factor_requires_browser",
      }),
    );

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "admin@smartaihub.app" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "P@ssw0rd123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "This account must sign in through the browser. Please use Sign in via browser.",
      );
    });

    expect(mockSetAuthToken).not.toHaveBeenCalled();
    expect(mockSetAuthRefreshToken).not.toHaveBeenCalled();
    expect(mockSetDesktopAuthUser).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalledWith("/dashboard");
  });

  it("starts desktop browser sign-in and redirects after tokens are stored", async () => {
    mockHasTauriRuntime.mockReturnValue(true);
    mockSignInDesktopWithBrowser.mockImplementationOnce(async ({ onUserCode }) => {
      onUserCode?.("ABCD-1234");
      return {
        id: "7",
        email: "admin@smartaihub.app",
        full_name: "Admin",
        is_admin: true,
      };
    });

    render(<Login />);

    fireEvent.click(screen.getByRole("button", { name: /sign in via browser/i }));

    await waitFor(() => {
      expect(mockSignInDesktopWithBrowser).toHaveBeenCalled();
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Login successful! Redirecting...");
    expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
  });
});
