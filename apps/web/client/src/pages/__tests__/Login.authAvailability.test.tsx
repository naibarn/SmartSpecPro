/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();

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
  useLocation: () => ["/login", setLocationMock] as const,
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
  hasTauriRuntime: () => false,
}));

vi.mock("../../lib/trpc", () => ({
  trpc: {
    auth: {
      oauthProviders: {
        useQuery: () => ({
          data: {
            google: false,
            github: true,
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
        "login.googleUnavailableMessage":
          "Google sign-in is disabled until an administrator completes the Google OAuth setup. On desktop, Google and 2FA accounts should continue through browser sign-in after setup is complete.",
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

import Login from "../Login";

describe("Login auth availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/login");
    window.sessionStorage.clear();
  });

  it("shows Google as disabled with a clear warning when Google OAuth is not ready", () => {
    render(<Login />);

    const googleButton = screen.getByRole("button", { name: "Google" });
    expect(googleButton).toBeDisabled();
    expect(
      screen.getByText(
        "Google sign-in is disabled until an administrator completes the Google OAuth setup. On desktop, Google and 2FA accounts should continue through browser sign-in after setup is complete.",
      ),
    ).toBeInTheDocument();
  });
});
