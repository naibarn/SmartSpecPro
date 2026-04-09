/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DesktopHostBootstrapCard } from "../DesktopHostBootstrapCard";
import { DesktopHostRolloutGatePanel } from "../DesktopHostRolloutGatePanel";
import { DesktopHostSettingsPanel } from "../DesktopHostSettingsPanel";
import { DesktopAgencyHandoffLinks } from "../agencies/DesktopAgencyHandoffLinks";
import { LocalFileRootsPanel } from "../local-files/LocalFileRootsPanel";
import { DesktopRunBadgeRow } from "../runs/DesktopRunBadgeRow";
import { buildDesktopHandoffLinks, buildDesktopLaunchUri, resolveDesktopViewHref } from "../labels";

describe("desktop host UI helpers", () => {
  it("renders run labels and local file roots", () => {
    render(
      <div>
        <DesktopRunBadgeRow
          labels={{
            surface: "desktop",
            runtime: "pi",
            locality: "hybrid",
            workspace: "local_workspace",
            trustClass: "org_verified",
          }}
        />
        <LocalFileRootsPanel
          roots={[
            {
              rootId: "quotes",
              name: "Quotes",
              absolutePath: "/Users/demo/Documents/Quotes",
              writebackMode: "managed_output_only",
              indexingEnabled: true,
              previewEnabled: true,
              vectorIndexEnabled: false,
              deniedByDefault: false,
              denialReason: null,
            },
          ]}
          workspaceProfile={{
            profileName: "standard_managed",
            networkClass: "gateway_only",
            cpuLimit: 4,
            memoryMb: 4096,
            mounts: [],
            outputDirectoryName: "outputs",
            connectorSidecarAllowed: false,
            writebackMode: "managed_output_only",
          }}
        />
      </div>,
    );

    expect(screen.getByText("Surface: Desktop")).toBeInTheDocument();
    expect(screen.getByText("Managed Local Roots")).toBeInTheDocument();
    expect(screen.getByText("Quotes")).toBeInTheDocument();
  });

  it("renders bootstrap steps, rollout gates, and handoff links", () => {
    render(
      <div>
        <DesktopHostBootstrapCard
          steps={[
            { id: "signin", title: "Sign in", status: "done" },
            { id: "roots", title: "Choose roots", status: "pending" },
          ]}
        />
        <DesktopHostRolloutGatePanel
          gates={[
            {
              gate: "device_binding_ready",
              satisfied: true,
              reason: "proof_of_possession_device_binding_live",
            },
            {
              gate: "signed_updates_enforced",
              satisfied: false,
              reason: "signed_update_verification_bypassable",
            },
          ]}
        />
        <DesktopAgencyHandoffLinks agencyId="proposal-orchestrator" runId="run-1" />
      </div>,
    );

    expect(screen.getByText("Desktop Bootstrap")).toBeInTheDocument();
    expect(screen.getByText("Rollout Gates")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Desktop" })).toHaveAttribute(
      "href",
      expect.stringContaining("agencyId=proposal-orchestrator"),
    );
  });

  it("renders the Desktop Host settings preview panel", () => {
    render(
      <DesktopHostSettingsPanel
        featureFlags={{
          desktopHostEnabled: true,
          desktopAdvancedLocalMode: false,
          desktopPackageSync: true,
          desktopAgencyRuntime: false,
          desktopWorkerProjection: true,
        }}
        status={{
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
                  attestationMode: "software_pkcs8",
                  secretStorage: "file_store",
                  proofKind: "ed25519_signature",
                },
                localFileService: {
                  enabled: true,
                  isolationMode: "python_subprocess_bounded",
                  supportedFormats: ["pdf", "docx", "pptx", "xlsx", "png"],
                  maxInputBytes: 8_388_608,
                  timeoutMs: 8_000,
                  ocrEnabled: false,
                  pdfExtractor: "internal_heuristic",
                  ocrProvider: "none",
                  fullRenderingSupported: false,
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
      }}
        controlPlaneState={{
          device: {
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
            capabilities: {},
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
            lastRunSummary: null,
            policyVersion: "desktop-host-policy-2026-04-08",
            policyExpiresAt: "2026-04-09T11:00:00.000Z",
          },
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
              desktopAgencyRuntime: false,
              desktopWorkerProjection: true,
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
            derivedStorePolicy: {},
            workspaceProfiles: [
              {
                profileName: "pi_sidecar_managed",
                networkClass: "gateway_only",
                cpuLimit: 4,
                memoryMb: 4096,
                mounts: [],
                outputDirectoryName: "outputs",
                connectorSidecarAllowed: false,
                writebackMode: "managed_output_only",
              },
            ],
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
        }}
        packageCatalog={{
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
        }}
        onDisableDevice={() => {}}
      />,
    );

    expect(screen.getByText("Unified web + desktop managed mode")).toBeInTheDocument();
    expect(screen.getByText("Desktop Host enabled")).toBeInTheDocument();
    expect(screen.getByText("Enrolled Devices")).toBeInTheDocument();
    expect(screen.getByText("Control Plane")).toBeInTheDocument();
    expect(screen.getByText("Desktop Package Catalog")).toBeInTheDocument();
    expect(screen.getByText("Rich Document Parser")).toBeInTheDocument();
    expect(screen.getByText("Quotes")).toBeInTheDocument();
    expect(screen.getByText("Storyboard Writer")).toBeInTheDocument();
    expect(screen.getByText(/ed25519 \/ ed25519_signature/i)).toBeInTheDocument();
    expect(screen.getByText("PDF internal_heuristic")).toBeInTheDocument();
    expect(screen.getByText("Extraction only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable device/i })).toBeInTheDocument();
  });

  it("builds stable handoff links", () => {
    expect(
      buildDesktopHandoffLinks({
        runId: "run-1",
        agencyId: "proposal-orchestrator",
      }),
    ).toEqual({
      openInDesktop: "/desktop/open?runId=run-1&agencyId=proposal-orchestrator",
      viewOnWeb: "/desktop/view?runId=run-1&agencyId=proposal-orchestrator",
    });
    expect(buildDesktopLaunchUri({
      runId: "run-1",
      agencyId: "proposal-orchestrator",
    })).toBe("smartspecpro://desktop/open?runId=run-1&agencyId=proposal-orchestrator");
    expect(resolveDesktopViewHref({
      agencyId: "proposal-orchestrator",
    })).toBe("/agencies/proposal-orchestrator");
  });
});
