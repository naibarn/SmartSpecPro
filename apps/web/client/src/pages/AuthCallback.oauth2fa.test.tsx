/**
 * @vitest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPendingOAuthTwoFactor } from "@/lib/authRedirects";
import AuthCallback from "./AuthCallback";

const {
  mockUseLocation,
  mockUseRoute,
} = vi.hoisted(() => ({
  mockUseLocation: vi.fn(),
  mockUseRoute: vi.fn(),
}));

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

vi.mock("wouter", () => ({
  useLocation: mockUseLocation,
  useRoute: mockUseRoute,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    metaChannels: {
      completeOAuth: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "callback.processing": "Processing authentication…",
        "callback.success": "Authentication successful.",
        "callback.redirecting": "Redirecting…",
        "callback.twoFactorRedirect":
          "Additional verification required. Redirecting to the two-factor step…",
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock("@/lib/webRuntime", () => ({
  getSmartSpecWebEndpoint: (path: string) => path,
}));

describe("AuthCallback OAuth 2FA flow", () => {
  let setLocation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("auth:return-url", "/auth/device?user_code=ABCD1234");
    window.sessionStorage.setItem("oauth_state", "oauth-state-1");
    window.history.replaceState(
      {},
      "",
      "/auth/callback/google?code=oauth-code&state=oauth-state-1",
    );

    setLocation = vi.fn();
    mockUseLocation.mockReturnValue(["/auth/callback/google", setLocation]);
    mockUseRoute.mockReturnValue([true, { provider: "google" }]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeResponse(200, {
            access_token: "python-oauth-token",
          }),
        )
        .mockResolvedValueOnce(
          makeResponse(200, {
            result: {
              data: {
                json: {
                  success: false,
                  requires2FA: true,
                  email: "user@example.com",
                  hasBackupEmail: true,
                  hasPhone: false,
                },
              },
            },
          }),
        ),
    );
  });

  it("stores pending 2FA state and redirects to the login 2FA step", async () => {
    render(<AuthCallback />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/trpc/auth.oauthExchangeSession",
      expect.objectContaining({
        body: JSON.stringify({
          json: {
            accessToken: "python-oauth-token",
            provider: "google",
            isNewUser: false,
          },
        }),
      }),
    );
    expect(getPendingOAuthTwoFactor()).toEqual({
      email: "user@example.com",
      hasBackupEmail: true,
      hasPhone: false,
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(setLocation).toHaveBeenCalledWith(
      "/login?mode=2fa&returnUrl=%2Fauth%2Fdevice%3Fuser_code%3DABCD1234",
    );
  });
});
