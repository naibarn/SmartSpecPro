/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const revokeAllMock = vi.fn();
const updatePermissionsMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      connectedDevices: { list: { invalidate: invalidateMock } },
    }),
    connectedDevices: {
      list: {
        useQuery: () => ({
          data: {
            devices: [
              {
                deviceId: "device-claude",
                displayName: "Claude Desktop",
                clientName: "Claude Desktop",
                runtimeType: "mcp-client",
                authKind: "mcp_oauth",
                connectionMethod: "oauth",
                platform: "macos",
                architecture: "arm64",
                deviceFingerprint: "abc123def456",
                scopes: ["mcp:read", "media:download"],
                allowedScopes: ["mcp:read", "media:download"],
                permissionPolicyCustomized: false,
                effectiveScopes: ["mcp:read", "media:download"],
                status: "active",
                approvedAt: "2026-08-17T01:00:00.000Z",
                lastSeenAt: "2026-08-17T01:05:00.000Z",
                accessTokenExpiresAt: "2026-08-17T01:20:00.000Z",
                refreshTokenExpiresAt: "2026-09-16T01:00:00.000Z",
                revokedAt: null,
                revokedByUserId: null,
                revocationReason: null,
                workerId: null,
                consentId: null,
                tenantId: "tenant-smartaihub",
                tenantName: "SmartAIHub",
                clientId: "client-claude",
                clientOrigin: "https://claude.ai",
                redirectUri: "https://claude.ai/oauth/callback",
              },
            ],
          },
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        }),
      },
      revoke: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          variables: undefined,
        }),
      },
      revokeAllMcp: {
        useMutation: () => ({
          mutate: revokeAllMock,
          isPending: false,
          variables: undefined,
        }),
      },
      updatePermissions: {
        useMutation: () => ({
          mutate: updatePermissionsMock,
          isPending: false,
          variables: undefined,
        }),
      },
    },
    tenantFeatureFlags: {
      getFeatureFlags: {
        useQuery: () => ({
          data: {
            mcpModernProtocolEnabled: true,
            mcpResourcesEnabled: true,
            mcpOAuthProtectedResourceEnabled: true,
            mcpOAuthAuthorizationServerEnabled: true,
            remotionDedicatedExecutorEnabled: true,
          },
        }),
      },
    },
  },
}));

vi.mock("@/components/ui/confirm/ConfirmProvider", () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children, trailing }: any) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      {trailing}
      {children}
    </section>
  ),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const values: Record<string, string> = {
        "connectedDevices.title": "MCP & Connected Devices",
        "connectedDevices.description": "Review connected devices",
        "connectedDevices.revokeAll": "Revoke all MCP access",
        "connectedDevices.revokeAllDisabled": "No active MCP connections",
        "connectedDevices.quickStartTitle":
          "Choose how to connect your AI client",
        "connectedDevices.fallbackTitle":
          "If this client does not support OAuth",
        "connectedDevices.fallbackDescription": "Use the protected fallback.",
        "connectedDevices.clientOriginVerified": "Verified application origin",
        "connectedDevices.clientOriginVerifiedDescription":
          "Matched registered callback.",
        "connectedDevices.tenantContext": "Approved tenant/workspace",
        "connectedDevices.permissionsTitle": "Granted permissions",
        "connectedDevices.effectivePermissions": `Effective now: ${options?.count ?? 0}`,
        "connectedDevices.deniedPermissions": `Blocked: ${options?.count ?? 0}`,
        "connectedDevices.permissionPolicyTitle": "Permissions for this device",
        "connectedDevices.permissionPolicyDescription": "Uncheck a scope",
        "connectedDevices.permissionReset": "Allow all approved",
        "connectedDevices.permissionSave": "Save permissions",
        "connectedDevices.permissionSaveHint": "Save changed permissions",
        "connectedDevices.permissionNoChanges": "No permission changes",
        "connectedDevices.moduleStatusTitle": "MCP and runtime readiness",
        "connectedDevices.moduleStatusDescription": "Live status",
        "connectedDevices.statusReady": "Ready",
        "connectedDevices.statusUnavailable": "Unavailable",
        "connectedDevices.statusChecking": "Checking status...",
        "connectedDevices.httpStatus": "HTTP",
        "connectedDevices.tenantFeatureFlags": "Current tenant feature flags",
        "connectedDevices.flagOn": "On",
        "connectedDevices.flagOff": "Off",
        "connectedDevices.probe.protectedResource": "Protected resource metadata",
        "connectedDevices.probe.authorizationServer": "Authorization server",
        "connectedDevices.probe.jwks": "JWKS",
        "connectedDevices.flag.modernMcp": "Modern MCP",
        "connectedDevices.flag.mcpResources": "MCP resources",
        "connectedDevices.flag.oauthPrm": "OAuth PRM",
        "connectedDevices.flag.oauthAuthorization": "OAuth authorization",
        "connectedDevices.flag.remotion": "Remotion executor",
        "connectedDevices.scope.mcp_read": "Discover and read MCP",
        "connectedDevices.scope.media_download": "Download media",
        "connectedDevices.scopeDescription.mcp_read":
          "Read permitted tools and resources.",
        "connectedDevices.scopeDescription.media_download":
          "Download permitted media files.",
        "connectedDevices.scopes": `${options?.count ?? 0} scopes`,
        "connectedDevices.clients.hermesOne.title": "Hermes One",
        "connectedDevices.clients.hermesOne.step1": "Open Hermes One",
        "connectedDevices.clients.hermesOne.step2": "Confirm",
        "connectedDevices.clients.hermesOne.step3": "Approve",
        "connectedDevices.clients.hermesOne.connect": "Connect in Hermes One",
        "connectedDevices.clients.hermesCli.title": "Hermes CLI / Agent",
        "connectedDevices.clients.hermesCli.step1": "Open terminal",
        "connectedDevices.clients.hermesCli.step2": "Run setup",
        "connectedDevices.clients.hermesCli.step3": "Verify",
        "connectedDevices.clients.hermesCli.copyCommand": "Copy CLI setup",
        "connectedDevices.clients.claude.title": "Claude",
        "connectedDevices.clients.codex.title": "Codex",
        "connectedDevices.clients.claude.step1": "Add endpoint",
        "connectedDevices.clients.claude.step2": "Sign in",
        "connectedDevices.clients.claude.step3": "Approve",
        "connectedDevices.clients.claude.copyEndpoint": "Copy Claude endpoint",
        "connectedDevices.clients.claude.open": "Open Claude",
        "connectedDevices.clients.codex.step1": "Add endpoint",
        "connectedDevices.clients.codex.step2": "Sign in",
        "connectedDevices.clients.codex.step3": "Approve",
        "connectedDevices.clients.codex.copyEndpoint": "Copy Codex endpoint",
        "connectedDevices.otherClients.title": "Other MCP clients",
        "connectedDevices.otherClients.description":
          "Use remote HTTP and OAuth.",
        "connectedDevices.otherClients.step1": "Set endpoint",
        "connectedDevices.otherClients.step2": "Sign in",
        "connectedDevices.otherClients.step3": "Verify",
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return {
    CheckCircle2: Icon,
    Code2: Icon,
    Clock3: Icon,
    Copy: Icon,
    ExternalLink: Icon,
    HelpCircle: Icon,
    Bot: Icon,
    Laptop: Icon,
    Loader2: Icon,
    MonitorCog: Icon,
    Plug: Icon,
    RefreshCw: Icon,
    ShieldCheck: Icon,
    ShieldOff: Icon,
    TriangleAlert: Icon,
    Trash2: Icon,
    RotateCcw: Icon,
    Save: Icon,
  };
});

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onCheckedChange(event.target.checked)}
    />
  ),
}));

import { ConnectedDevicesPanel } from "../ConnectedDevicesPanel";

describe("ConnectedDevicesPanel", () => {
  it("shows named permissions, tenant context, verified origin, and client onboarding", async () => {
    render(<ConnectedDevicesPanel />);

    expect(
      screen.getByRole("button", { name: "Revoke all MCP access" })
    ).toBeTruthy();
    expect(screen.getAllByText("Discover and read MCP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Download media").length).toBeGreaterThan(0);
    expect(screen.getByText("SmartAIHub")).toBeTruthy();
    expect(screen.getByText("tenant-smartaihub")).toBeTruthy();
    expect(screen.getByText("https://claude.ai")).toBeTruthy();
    expect(
      screen.getByText("Choose how to connect your AI client")
    ).toBeTruthy();
    expect(screen.getByText("Hermes CLI / Agent")).toBeTruthy();
    expect(screen.getByText("Other MCP clients")).toBeTruthy();
    expect(screen.getByText("MCP and runtime readiness")).toBeTruthy();
    expect(screen.getByText("Permissions for this device")).toBeTruthy();
    expect(
      screen.getByText("If this client does not support OAuth")
    ).toBeTruthy();
    await waitFor(() => {
      const hermesLink = screen.getByRole("link", {
        name: "Connect in Hermes One",
      });
      expect(hermesLink.getAttribute("href")).toMatch(
        /^hermes:\/\/mcp\/install\?/
      );
    });
    expect(
      screen.getByRole("button", { name: "Copy Claude endpoint" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy Codex endpoint" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy CLI setup" })).toBeTruthy();
  });

  it("sends a revoke-all MCP request after confirmation", async () => {
    render(<ConnectedDevicesPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke all MCP access" })
    );

    await waitFor(() =>
      expect(revokeAllMock).toHaveBeenCalledWith({
        reason: "user_revoked_all_mcp_connections",
      })
    );
  });

  it("sends a server-enforced device scope policy update", async () => {
    render(<ConnectedDevicesPanel />);
    const mediaCheckbox = screen.getAllByRole("checkbox")[1];
    fireEvent.click(mediaCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));

    await waitFor(() =>
      expect(updatePermissionsMock).toHaveBeenCalledWith({
        deviceId: "device-claude",
        allowedScopes: ["mcp:read"],
      })
    );
  });

  it("fails closed when OAuth discovery is not ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<ConnectedDevicesPanel />);

    await waitFor(() => {
      const hermesLink = screen.getByTestId("connect-hermes-mcp");
      expect(hermesLink.getAttribute("href")).toBeNull();
      expect(hermesLink.getAttribute("aria-disabled")).toBe("true");
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
});
