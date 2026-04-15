/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();
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
            return vi.fn(() => ({
              data: undefined,
              isLoading: false,
              error: null,
              refetch: vi.fn(),
            }));
          }

          if (prop === "useMutation") {
            return vi.fn(() => ({
              mutate: vi.fn(),
              mutateAsync: vi.fn(),
              isPending: false,
            }));
          }

          return createNode();
        },
      },
    );

  return createNode();
});

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", setLocationMock] as const,
  useSearch: () => "tab=workers",
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
  useTenantFeatureFlag: () => false,
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
        "settings.tabs.notifications": "Notifications",
        "settings.tabs.automation": "Automation",
        "settings.tabs.workers": "Workers",
        "settings.tabs.apiKeys": "API Keys",
        "settings.tabs.billing": "Billing",
        "settings.tabs.integrations": "Integrations",
        "settings.tabs.personas": "Personas",
        "settings.skills": "Skills",
        "settings.workers.title": "Worker registration keys",
        "settings.workers.description": "Create one-time registration tokens for workers.",
        "settings.workers.eyebrow": "Workers",
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
  HelpButton: () => <button data-testid="help-button">Help</button>,
}));

vi.mock("@/components/settings/GoogleDrivePanel", () => ({ GoogleDrivePanel: () => <div /> }));
vi.mock("@/components/settings/McpServersSettingsPanel", () => ({ McpServersSettingsPanel: () => <div /> }));
vi.mock("@/components/settings/OneDrivePanel", () => ({ OneDrivePanel: () => <div /> }));
vi.mock("@/components/settings/UploadPostGatewayPanel", () => ({ UploadPostGatewayPanel: () => <div /> }));
vi.mock("@/components/settings/UserAPIKeysPanel", () => ({ UserAPIKeysPanel: () => <div /> }));
vi.mock("@/components/settings/UserLlmKeysPanel", () => ({ UserLlmKeysPanel: () => <div /> }));
vi.mock("@/components/settings/BudgetPanel", () => ({ BudgetPanel: () => <div /> }));
vi.mock("@/components/settings/PersonasPanel", () => ({ PersonasPanel: () => <div /> }));
vi.mock("@/components/settings/UserAutomationPreferencesPanel", () => ({ UserAutomationPreferencesPanel: () => <div /> }));
vi.mock("@/components/settings/WorkerAccessKeysPanel", () => ({
  WorkerAccessKeysPanel: () => <div data-testid="workers-panel">Workers panel</div>,
}));
vi.mock("@/components/settings/NotificationPreferencesPanel", () => ({ NotificationPreferencesPanel: () => <div /> }));
vi.mock("@/features/local-ai/components/LocalAiSettingsSection", () => ({ LocalAiSettingsSection: () => <div /> }));
vi.mock("@/components/LocaleToggle", () => ({ LocaleToggle: () => <div /> }));
vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({ useDesktopHostStatus: () => ({ status: null, isLoading: false, error: null, refresh: vi.fn() }) }));
vi.mock("@/features/desktop-host/useDesktopDeviceControlPlaneState", () => ({ useDesktopDeviceControlPlaneState: () => ({ state: null, isLoading: false, error: null, refresh: vi.fn() }) }));
vi.mock("@/features/desktop-host/useDesktopPackageCatalog", () => ({ useDesktopPackageCatalog: () => ({ catalog: null, isLoading: false, error: null, refresh: vi.fn() }) }));

import Settings from "../Settings";

describe("Settings workers tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Workers tab and opens the worker registration panel", () => {
    render(<Settings />);

    expect(screen.getAllByText("Workers").length).toBeGreaterThan(0);
    expect(screen.getByTestId("workers-panel")).toBeTruthy();
  });
});

