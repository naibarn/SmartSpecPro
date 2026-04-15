/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();
const featureFlagsState = vi.hoisted(() => ({
  localClientLlmMode: false,
  desktopHostEnabled: false,
  desktopAdvancedLocalMode: false,
  desktopPackageSync: false,
  desktopAgencyRuntime: false,
  desktopWorkerProjection: false,
}));

const desktopHostStatusState = vi.hoisted(() => ({
  status: null as
    | {
      generatedAt: string;
      devices: Array<Record<string, unknown>>;
    }
    | null,
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

const desktopDeviceControlPlaneState = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

const desktopPackageCatalogState = vi.hoisted(() => ({
  catalog: null as Record<string, unknown> | null,
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

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
  useSearch: () => "tab=desktopHost",
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
  useTenantFeatureFlag: (flag: keyof typeof featureFlagsState) => featureFlagsState[flag] ?? false,
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
        "settings.tabs.desktopHost": "Desktop Host",
        "settings.tabs.notifications": "Notifications",
        "settings.tabs.automation": "Automation",
        "settings.tabs.workers": "Workers",
        "settings.tabs.apiKeys": "API Keys",
        "settings.tabs.billing": "Billing",
        "settings.tabs.integrations": "Integrations",
        "settings.tabs.personas": "Personas",
        "settings.skills": "Skills",
        "settings.desktopHost.title": "Desktop Host",
        "settings.desktopHost.description": "Governed web + desktop execution with package trust, local files, and rollout gates.",
        "settings.desktopHost.helpButton": "Help",
        "settings.desktopHost.badges.enabled": "Desktop Host enabled",
        "settings.desktopHost.badges.preview": "Desktop Host preview",
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
  LocalAiSettingsSection: () => <div />,
}));
vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({
  useDesktopHostStatus: () => desktopHostStatusState,
}));
vi.mock("@/features/desktop-host/useDesktopDeviceControlPlaneState", () => ({
  useDesktopDeviceControlPlaneState: () => desktopDeviceControlPlaneState,
}));
vi.mock("@/features/desktop-host/useDesktopPackageCatalog", () => ({
  useDesktopPackageCatalog: () => desktopPackageCatalogState,
}));
vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div />,
}));

import Settings from "../Settings";

describe("Settings desktop host tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(featureFlagsState, {
      localClientLlmMode: false,
      desktopHostEnabled: false,
      desktopAdvancedLocalMode: false,
      desktopPackageSync: false,
      desktopAgencyRuntime: false,
      desktopWorkerProjection: false,
    });
    Object.assign(desktopHostStatusState, {
      status: null,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    Object.assign(desktopDeviceControlPlaneState, {
      state: null,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    Object.assign(desktopPackageCatalogState, {
      catalog: null,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("hides the Desktop Host tab when the tenant flag is disabled", () => {
    render(<Settings />);

    expect(screen.queryByText("Desktop Host")).toBeNull();
    expect(screen.queryByText("Desktop Bootstrap")).toBeNull();
  });

  it("shows Desktop Host rollout, bootstrap, and managed roots panels when enabled", () => {
    Object.assign(featureFlagsState, {
      desktopHostEnabled: true,
      desktopPackageSync: true,
      desktopAgencyRuntime: true,
      desktopWorkerProjection: true,
    });
    Object.assign(desktopHostStatusState, {
      status: {
        generatedAt: "2026-04-09T10:00:00.000Z",
        devices: [
          {
            deviceId: "device-1",
            displayName: "Ops Desktop",
            machineName: "ops-desktop",
            healthStatus: "online",
            platform: {
              os: "windows",
              osVersion: "11",
              arch: "x64",
              appVersion: "0.1.0",
            },
            enrolledAt: "2026-04-09T09:00:00.000Z",
            lastSeenAt: "2026-04-09T10:00:00.000Z",
            workerProjectionEnabled: true,
            projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
            warningFlags: [],
            capabilities: {
              deviceIdentity: {
                keyAlgorithm: "ed25519",
                keyVersion: 2,
                publicKeyDigestSha256: "a".repeat(64),
                attestationMode: "hardware_attested",
                secretStorage: "windows_dpapi",
                storageProtection: "os_protected",
                storageProvider: "test_attestation_helper",
                osAttested: true,
                hardwareBacked: true,
                attestationProvider: "test_attestation_helper",
                attestationEvidenceSha256: "b".repeat(64),
                attestationClaims: ["device_id:device-1", "key_version:2"],
                proofKind: "ed25519_signature",
              },
              localFileService: {
                enabled: true,
                isolationMode: "python_subprocess_bounded",
                supportedFormats: ["pdf", "docx", "pptx", "xlsx", "png"],
                maxInputBytes: 8_388_608,
                timeoutMs: 8_000,
                ocrEnabled: true,
                pdfExtractor: "internal_heuristic",
                ocrProvider: "tesseract",
                renderBackend: "pdftoppm+soffice",
                officeRenderer: "soffice",
                renderedPreviewFormats: ["pdf", "docx", "pptx"],
                complexDocumentSupport: "ocr_rendering",
                multiPageRenderingSupported: true,
                maxRenderedPages: 3,
                ocrLayoutMode: "page_segmented",
                fullRenderingSupported: true,
                activeContentExecutionAllowed: false,
              },
            },
            localRoots: [
              {
                rootId: "quotes",
                name: "Quotes",
                absolutePath: "C:/Users/demo/Documents/Quotes",
                writebackMode: "managed_output_only",
                indexingEnabled: true,
                previewEnabled: true,
                vectorIndexEnabled: false,
                deniedByDefault: false,
                denialReason: null,
              },
            ],
            packageCachePaths: ["C:/SmartSpec/packages"],
            packageSyncState: {
              syncStatus: "ready",
              lastSyncAt: "2026-04-09T09:59:00.000Z",
              lastError: null,
              syncedPackageIds: ["storyboard-writer"],
              packageCount: 1,
              lastRevocationCheckAt: "2026-04-09T09:59:30.000Z",
            },
            pendingActions: [],
            currentWorkspaceProfile: {
              profileName: "pi_sidecar_managed",
              networkClass: "gateway_only",
              cpuLimit: 4,
              memoryMb: 4096,
              mounts: [],
              outputDirectoryName: "outputs",
              connectorSidecarAllowed: false,
              writebackMode: "managed_output_only",
            },
            lastRunSummary: {
              reportedAt: "2026-04-09T09:58:00.000Z",
              selection: {
                selectedRuntime: "pi",
                reason: "local_file_heavy",
                labels: {
                  surface: "desktop",
                  runtime: "pi",
                  locality: "hybrid",
                  workspace: "local_workspace",
                  trustClass: "built_in_verified",
                },
                sidecarBoundaryRequired: true,
                transport: {
                  preferredTransport: "http",
                  mcpFallbackAllowed: true,
                },
              },
            },
            policyVersion: "desktop-host-policy-2026-04-08",
            policyExpiresAt: "2026-04-09T11:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    Object.assign(desktopDeviceControlPlaneState, {
      state: {
        device: desktopHostStatusState.status?.devices[0],
        policySnapshot: {
          policyVersion: "desktop-host-policy-2026-04-08",
          tenantId: "tenant-1",
          deviceId: "device-1",
          fetchedAt: "2026-04-09T10:00:00.000Z",
          expiresAt: "2026-04-09T11:00:00.000Z",
          trustFreshnessTtlSeconds: 3600,
          featureFlags: {
            desktopHostEnabled: true,
            desktopAdvancedLocalMode: false,
            desktopPackageSync: true,
            desktopAgencyRuntime: true,
            desktopWorkerProjection: true,
          },
          localRoots: desktopHostStatusState.status?.devices[0]?.localRoots ?? [],
          derivedStorePolicy: {},
          workspaceProfiles: [desktopHostStatusState.status?.devices[0]?.currentWorkspaceProfile],
          approvalRules: [],
          rolloutGates: [
            {
              gate: "device_binding_ready",
              satisfied: true,
              reason: "proof_of_possession_device_binding_live",
            },
          ],
          workerProjectionRuntimeType: "desktop_zeroclaw_managed",
          tokenPolicy: {
            protocolVersion: "2026-04-08",
            bootstrapTokenUse: "desktop_bootstrap",
            refreshTokenUse: "desktop_refresh",
            runtimeTokenUse: "desktop_runtime",
          },
          transport: {
            preferredTransport: "http",
            mcpFallbackAllowed: true,
          },
        },
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    Object.assign(desktopPackageCatalogState, {
      catalog: {
        generatedAt: "2026-04-09T10:00:00.000Z",
        packages: [
          {
            packageId: "storyboard-writer",
            name: "Storyboard Writer",
            packageType: "skill_package",
            runtimeDestination: "pi",
            trustClass: "built_in_verified",
            state: "trusted",
            version: "2.4.0",
            signerId: "desktop-host-dev-signer",
            signerKeyVersion: "2026-04-08",
            summary: "Create visual storyboards from briefs.",
            availableOnDesktop: true,
            source: "built_in",
          },
        ],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getAllByText("Desktop Host").length).toBeGreaterThan(0);
    expect(screen.getByText("Desktop Bootstrap")).toBeInTheDocument();
    expect(screen.getByText("Rollout Gates")).toBeInTheDocument();
    expect(screen.getByText("Managed Local Roots")).toBeInTheDocument();
    expect(screen.queryByText("Tenant Desktop Governance")).toBeNull();
    expect(screen.getByText("Enrolled Devices")).toBeInTheDocument();
    expect(screen.getByText("Control Plane")).toBeInTheDocument();
    expect(screen.getByText("Desktop Package Catalog")).toBeInTheDocument();
    expect(screen.getByText("Rich Document Parser")).toBeInTheDocument();
    expect(screen.getByText(/python_subprocess_bounded/i)).toBeInTheDocument();
    expect(screen.getByText("PDF internal_heuristic")).toBeInTheDocument();
    expect(screen.getByText("Rendering + extraction")).toBeInTheDocument();
    expect(screen.getByText("Up to 3 pages")).toBeInTheDocument();
    expect(screen.getByText("Quotes")).toBeInTheDocument();
    expect(screen.getByText("Storyboard Writer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable device/i })).toBeInTheDocument();
    expect(
      screen.getAllByTestId("help-button").some((node) => node.getAttribute("data-topic") === "desktop-host"),
    ).toBe(true);
  });
});
