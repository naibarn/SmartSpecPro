/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as privateVault from "@/lib/privateVault";

vi.mock("wouter", () => ({
  useLocation: () => ["/finance", vi.fn()] as const,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "7" },
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue ?? key,
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: vi.fn(),
    },
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

const { unlockPrivateVaultUseQuery, unlockPrivateVaultUseMutation } = vi.hoisted(() => ({
  unlockPrivateVaultUseQuery: vi.fn(),
  unlockPrivateVaultUseMutation: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      getPreferences: {
        useQuery: vi.fn(() => ({
          data: { privateVault: { enabled: true } },
          isLoading: false,
        })),
      },
      unlockPrivateVault: {
        useMutation: unlockPrivateVaultUseMutation,
        useQuery: unlockPrivateVaultUseQuery,
      },
    },
  },
}));

vi.mock("@/lib/privateVault", () => ({
  getPrivateVaultAccessToken: vi.fn(() => null),
  setPrivateVaultAccessToken: vi.fn(),
  clearPrivateVaultAccessToken: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import FinanceAccessGate from "../FinanceAccessGate";

describe("FinanceAccessGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the unlock prompt when the private vault is enabled and no token exists", () => {
    render(
      <FinanceAccessGate>
        <div data-testid="finance-content">finance content</div>
      </FinanceAccessGate>,
    );

    expect(screen.getByRole("heading", { name: /privateVault\.unlockTitle/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("privateVault.pinPlaceholder")).toBeInTheDocument();
    expect(screen.queryByTestId("finance-content")).not.toBeInTheDocument();
  });

  it("renders children when a private vault token is already available", () => {
    vi.mocked(privateVault.getPrivateVaultAccessToken).mockReturnValue("token-123");

    render(
      <FinanceAccessGate>
        <div data-testid="finance-content">finance content</div>
      </FinanceAccessGate>,
    );

    expect(screen.getByTestId("finance-content")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /privateVault\.unlockTitle/i })).not.toBeInTheDocument();
  });
});
