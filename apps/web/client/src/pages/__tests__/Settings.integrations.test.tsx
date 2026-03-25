/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();

const makeQueryResult = (data: unknown = undefined) => ({
  data,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});

const makeMutationResult = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
});

const trpcRoot = vi.hoisted(() => {
  const createNode = (path: string[] = []): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "useUtils") {
            return () => ({
              uploadPost: {
                getConnection: {
                  invalidate: vi.fn(),
                },
              },
            });
          }

          if (prop === "useQuery") {
            return vi.fn(() => {
              const key = path.join(".");
              if (key === "tenantFeatureFlags.getFeatureFlags") {
                return makeQueryResult({ UPLOAD_POST_GATEWAY_ENABLED: true });
              }
              if (key === "uploadPost.getConnection") {
                return makeQueryResult(null);
              }
              return makeQueryResult();
            });
          }

          if (prop === "useMutation") {
            return vi.fn(() => makeMutationResult());
          }

          return createNode([...path, String(prop)]);
        },
      },
    );

  return createNode();
});

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", setLocationMock] as const,
  useSearch: () => "tab=integrations",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "tester@example.com",
      name: "Tester",
      currentTenantId: "tenant-1",
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: trpcRoot,
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
    section: (props: React.HTMLAttributes<HTMLElement>) => <section {...props} />,
  },
}));

vi.mock("@/components/help", () => ({
  HelpButton: () => <div data-testid="help-button" />,
}));

vi.mock("@/components/settings/GoogleDrivePanel", () => ({
  GoogleDrivePanel: () => <div data-testid="google-drive-panel" />,
}));

vi.mock("@/components/settings/McpServersSettingsPanel", () => ({
  McpServersSettingsPanel: () => <div data-testid="mcp-servers-panel" />,
}));

vi.mock("@/components/settings/OneDrivePanel", () => ({
  OneDrivePanel: () => <div data-testid="one-drive-panel" />,
}));

vi.mock("@/components/settings/UserAPIKeysPanel", () => ({
  UserAPIKeysPanel: () => <div data-testid="user-api-keys-panel" />,
}));

vi.mock("@/components/settings/UserLlmKeysPanel", () => ({
  UserLlmKeysPanel: () => <div data-testid="user-llm-keys-panel" />,
}));

vi.mock("@/components/settings/BudgetPanel", () => ({
  BudgetPanel: () => <div data-testid="budget-panel" />,
}));

vi.mock("@/components/settings/PersonasPanel", () => ({
  PersonasPanel: () => <div data-testid="personas-panel" />,
}));

vi.mock("@/components/settings/UserAutomationPreferencesPanel", () => ({
  UserAutomationPreferencesPanel: () => <div data-testid="automation-panel" />,
}));

vi.mock("@/components/settings/NotificationPreferencesPanel", () => ({
  NotificationPreferencesPanel: () => <div data-testid="notification-panel" />,
}));

import Settings from "../Settings";

describe("Settings integrations smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Upload-Post gateway panel from the integrations tab", async () => {
    render(<Settings />);

    expect(await screen.findByText("Upload-Post Gateway")).toBeTruthy();
    expect(screen.getByText("Connect Upload-Post")).toBeTruthy();
    expect(screen.getByText("Disclosure required")).toBeTruthy();
  });
});
