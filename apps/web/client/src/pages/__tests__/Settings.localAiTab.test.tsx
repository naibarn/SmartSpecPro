/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();
const localAiFlagState = vi.hoisted(() => ({ enabled: false }));

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
  const createNode = (): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "useUtils") {
            return () => ({});
          }

          if (prop === "useQuery") {
            return vi.fn(() => makeQueryResult());
          }

          if (prop === "useMutation") {
            return vi.fn(() => makeMutationResult());
          }

          return createNode();
        },
      },
    );

  return createNode();
});

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", setLocationMock] as const,
  useSearch: () => "tab=localAi",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "tester@example.com",
      name: "Tester Example",
      plan: "pro",
      currentTenantId: "tenant-1",
      role: "user",
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => localAiFlagState.enabled,
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: {
      name: "Acme Labs",
    },
    isLoading: false,
    refreshTenant: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: trpcRoot,
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

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "settings.title": "Settings",
        "settings.description": "Manage your account settings",
        "settings.tabs.profile": "Profile",
        "settings.tabs.account": "Account",
        "settings.tabs.security": "Security",
        "settings.tabs.privateVault": "Private Files",
        "settings.tabs.preferences": "Preferences",
        "settings.tabs.localAi": "Local AI",
        "settings.tabs.notifications": "Notifications",
        "settings.tabs.automation": "Automation",
        "settings.tabs.workers": "Workers",
        "settings.tabs.apiKeys": "API Keys",
        "settings.tabs.billing": "Billing",
        "settings.tabs.integrations": "Integrations",
        "settings.tabs.personas": "Personas",
        "settings.skills": "Skills",
        "settings.localAi.title": "Local AI",
        "settings.localAi.description": "On-device runtime settings",
        "settings.localAi.helpButton": "Help",
        "common.back": "Back",
      };
      return values[key] ?? key;
    },
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("@/components/help", () => ({
  HelpButton: ({
    label,
    topic,
  }: {
    label?: string;
    topic?: string;
  }) => (
    <button data-testid="help-button" data-topic={topic ?? ""}>
      {label ?? "Help"}
    </button>
  ),
}));

vi.mock("@/components/settings/GoogleDrivePanel", () => ({
  GoogleDrivePanel: () => <div />,
}));
vi.mock("@/components/settings/McpServersSettingsPanel", () => ({
  McpServersSettingsPanel: () => <div />,
}));
vi.mock("@/components/settings/OneDrivePanel", () => ({
  OneDrivePanel: () => <div />,
}));
vi.mock("@/components/settings/UploadPostGatewayPanel", () => ({
  UploadPostGatewayPanel: () => <div />,
}));
vi.mock("@/components/settings/UserAPIKeysPanel", () => ({
  UserAPIKeysPanel: () => <div />,
}));
vi.mock("@/components/settings/UserLlmKeysPanel", () => ({
  UserLlmKeysPanel: () => <div />,
}));
vi.mock("@/components/settings/BudgetPanel", () => ({
  BudgetPanel: () => <div />,
}));
vi.mock("@/components/settings/PersonasPanel", () => ({
  PersonasPanel: () => <div />,
}));
vi.mock("@/components/settings/UserAutomationPreferencesPanel", () => ({
  UserAutomationPreferencesPanel: () => <div />,
}));
vi.mock("@/components/settings/WorkerAccessKeysPanel", () => ({
  WorkerAccessKeysPanel: () => <div />,
}));
vi.mock("@/components/settings/NotificationPreferencesPanel", () => ({
  NotificationPreferencesPanel: () => <div />,
}));
vi.mock("@/features/local-ai/components/LocalAiSettingsSection", () => ({
  LocalAiSettingsSection: () => (
    <div data-testid="local-ai-settings-section">Local AI settings content</div>
  ),
}));
vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div />,
}));

import Settings from "../Settings";

describe("Settings local ai tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localAiFlagState.enabled = false;
  });

  it("hides the Local AI tab when the tenant flag is disabled", () => {
    render(<Settings />);

    expect(screen.queryByText("Local AI")).toBeNull();
    expect(screen.queryByTestId("local-ai-settings-section")).toBeNull();
  });

  it("shows the Local AI tab and direct help button when the tenant flag is enabled", () => {
    localAiFlagState.enabled = true;

    render(<Settings />);

    expect(screen.getAllByText("Local AI").length).toBeGreaterThan(0);
    expect(screen.getByTestId("local-ai-settings-section")).toBeTruthy();
    expect(
      screen.getAllByTestId("help-button").some((node) => node.getAttribute("data-topic") === "local-ai"),
    ).toBe(true);
  });
});
