/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const setLocationMock = vi.fn();
const featureState = vi.hoisted(() => ({ enabled: true }));
const settingsQueryState = vi.hoisted(() => ({
  data: { defaultChoice: "off", requireConfirmationOnExport: true },
  isLoading: false,
  isError: false,
}));
const saveDefaultChoiceMock = vi.hoisted(() => vi.fn());

const trpcRoot = vi.hoisted(() => {
  const createNode = (): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          const configuredValue = Reflect.get(_target, prop);
          if (configuredValue) {
            return configuredValue;
          }
          if (prop === "useUtils") {
            return () => ({
              contentProtection: {
                getSettings: { invalidate: vi.fn() },
              },
            });
          }
          if (prop === "useQuery") {
            return vi.fn(() => ({
              data: undefined,
              isLoading: false,
              isError: false,
              error: null,
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
      }
    );

  const root = createNode();
  root.contentProtection = {
    getSettings: { useQuery: vi.fn(() => settingsQueryState) },
    setDefaultChoice: {
      useMutation: vi.fn(() => ({
        mutate: saveDefaultChoiceMock,
        isPending: false,
      })),
    },
  };
  return root;
});

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", setLocationMock] as const,
  useSearch: () => "section=contentProtection",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      currentTenantId: "tenant-1",
      role: "user",
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { name: "Acme" },
    isLoading: false,
    refreshTenant: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: string) =>
    flag === "contentProtectionEnabled" && featureState.enabled,
}));

vi.mock("@/lib/trpc", () => ({ trpc: trpcRoot }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/confirm/ConfirmProvider", () => ({
  useConfirm: () => ({ confirm: vi.fn(), prompt: vi.fn() }),
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", switchable: false, toggleTheme: vi.fn() }),
}));
vi.mock("@/contexts/AstryxPaletteContext", () => ({
  useAstryxPalette: () => ({
    palette: "neutral",
    setPalette: vi.fn(),
    themes: [],
  }),
}));
vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({
  useDesktopHostStatus: () => ({
    status: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/desktop-host/useDesktopDeviceControlPlaneState", () => ({
  useDesktopDeviceControlPlaneState: () => ({
    state: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/desktop-host/useDesktopPackageCatalog", () => ({
  useDesktopPackageCatalog: () => ({
    catalog: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
    section: (props: React.HTMLAttributes<HTMLElement>) => (
      <section {...props} />
    ),
  },
}));
vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", resolvedLanguage: "en", changeLanguage: vi.fn() },
  }),
}));
vi.mock("@/components/help", () => ({
  HelpButton: () => <button type="button">Help</button>,
}));
vi.mock("@/components/LocaleToggle", () => ({ LocaleToggle: () => <div /> }));
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
  LocalAiSettingsSection: () => <div />,
}));

import Settings from "../Settings";

describe("Settings Content Protection tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    featureState.enabled = true;
    settingsQueryState.data = {
      defaultChoice: "off",
      requireConfirmationOnExport: true,
    };
    settingsQueryState.isLoading = false;
    settingsQueryState.isError = false;
  });

  it("exposes the user-owned default choice and sends an explicit ON intent", () => {
    render(<Settings />);

    expect(
      screen.getByTestId("settings-content-protection-control")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings.contentProtection.on" })
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "settings.contentProtection.on" })
    );

    expect(saveDefaultChoiceMock).toHaveBeenCalledWith({ defaultChoice: "on" });
  });

  it("does not leave a gated deep link on an empty settings page", async () => {
    featureState.enabled = false;
    render(<Settings />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("settings-content-protection-control")
      ).not.toBeInTheDocument();
    });
  });
});
