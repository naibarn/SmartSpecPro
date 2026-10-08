// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunnerReleasePanel } from "../RunnerReleasePanel";

const runnerState = vi.hoisted(() => ({ status: "online", trustState: "trusted", runners: [] as Array<Record<string, unknown>> }));
const requestUpdateMock = vi.hoisted(() => vi.fn());
const desktopDownloadState = vi.hoisted(() => ({
  downloads: [] as Array<{
    buildId: string;
    version: string;
    platform: "windows" | "macos";
    name: string;
    sizeBytes: number;
    expiresAt: string;
    downloadUrl: string;
  }>,
  error: null as string | null,
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key.endsWith("checkVersion")) return "Check Runner release version";
      if (key.endsWith("desktopReviewVersion")) return `Version ${values?.version ?? ""}`;
      if (key.endsWith("downloadWindowsDesktop")) return `Download Windows GUI ${values?.version ?? ""} (ZIP)`;
      if (key.endsWith("downloadMacDesktop")) return `Download macOS GUI ${values?.version ?? ""} (ZIP)`;
      if (key.endsWith("artifactExpires")) return `Expires ${values?.time ?? ""}`;
      if (key.endsWith("downloadVersion")) return `Download ${values?.version ?? ""}`;
      if (key.endsWith("downloadCliVersion")) return `Download CLI package ${values?.version ?? ""}`;
      if (key.endsWith("releaseTypesNote")) return "Choose the CLI package or the Windows/macOS desktop installer.";
      if (key.endsWith("updateVersion")) return `Update Runner to ${values?.version ?? ""}`;
      if (key.endsWith("currentVersion")) return `Current: ${values?.version ?? ""}`;
      if (key.endsWith("latestVersion")) return `Latest: ${values?.version ?? ""}`;
      if (key.endsWith("lastChecked")) return `Last checked: ${values?.time ?? ""}`;
      if (key.endsWith("connectedRunners")) return "Connected Runners";
      if (key.endsWith("toolReadiness")) return `Tools ready ${values?.ready ?? ""}/${values?.total ?? ""}`;
      if (key.endsWith("capabilityReadiness")) return `Capabilities allowed ${values?.ready ?? ""}/${values?.total ?? ""}`;
      if (key.endsWith("previousMachineRegistrations")) return `Show ${values?.count ?? 0} previous registrations for this verified machine`;
      if (key.endsWith("possibleDuplicateRegistrations")) return `Show ${values?.count ?? 0} older registrations with the same name and platform`;
      if (key.endsWith("identityUnverified")) return "Machine identity is unavailable for these older registrations; they may be separate machines.";
      if (key.endsWith("status.revoked")) return "Revoked";
      if (key.endsWith("updateDisabled.offline")) return "Update is disabled while this Runner is offline or degraded.";
      if (key.endsWith("updateDisabled.identityAmbiguous")) return "Updates are disabled because this Runner shares its name with registrations whose machine identity is unknown.";
      if (key.endsWith("updateDisabled.revoked")) return "Update is disabled because this Runner has been revoked.";
      if (key.endsWith("phase.downloading")) return "Downloading";
      return key;
    },
  }),
}));

vi.mock("../useRunnerReleaseCatalog", () => ({
  detectRunnerTarget: () => ({ platform: "linux", architecture: "x64" }),
  useRunnerReleaseCatalog: () => ({
    catalog: {
      generatedAt: "2026-09-18T00:00:00.000Z",
      releases: [],
      latestByTarget: [{
        targetKey: "local_device:linux:x64:stable",
        platform: "linux",
        architecture: "x64",
        profile: "local_device",
        channel: "stable",
        version: "0.2.0",
        package: {
          id: 1,
          version: "0.2.0",
          platform: "linux",
          architecture: "x64",
          profile: "local_device",
          channel: "stable",
          assetKind: "package",
          fileName: "runner.tar.gz",
          contentType: "application/gzip",
          fileSizeBytes: 1024,
          fileSha256: "a".repeat(64),
          signature: null,
          contractVersion: "sah-runner-v1",
          manifest: null,
          validationStatus: "valid",
          validationChecks: [{ id: "sha256", status: "ok", message: "ok" }],
          provenance: { sourceCommit: "abc", workflowRunId: null, releaseTag: null, signatureAlgorithm: null },
          releaseNotes: null,
          isPublished: true,
          publishedAt: "2026-09-18T00:00:00.000Z",
          withdrawnAt: null,
          uploadedAt: "2026-09-18T00:00:00.000Z",
          updatedAt: "2026-09-18T00:00:00.000Z",
          downloadUrl: "/api/runner-releases/1/download",
        },
        updateBinary: {
          id: 2,
          version: "0.2.0",
          platform: "linux",
          architecture: "x64",
          profile: "local_device",
          channel: "stable",
          assetKind: "update_binary",
          fileName: "runner-update",
          contentType: "application/octet-stream",
          fileSizeBytes: 1024,
          fileSha256: "b".repeat(64),
          signature: null,
          contractVersion: "sah-runner-v1",
          manifest: null,
          validationStatus: "valid",
          validationChecks: [{ id: "sha256", status: "ok", message: "ok" }],
          provenance: { sourceCommit: "abc", workflowRunId: null, releaseTag: null, signatureAlgorithm: null },
          releaseNotes: null,
          isPublished: true,
          publishedAt: "2026-09-18T00:00:00.000Z",
          withdrawnAt: null,
          uploadedAt: "2026-09-18T00:00:00.000Z",
          updatedAt: "2026-09-18T00:00:00.000Z",
          downloadUrl: "/api/runner-releases/2/download",
        },
      }],
    },
    runners: runnerState.runners.length ? runnerState.runners : [{
      runnerId: "runner-linux",
      deviceId: "device-linux",
      machineFingerprintHash: null,
      displayName: "Linux Runner",
      profile: "local_device",
      nodeKind: "local_device",
      status: runnerState.status,
      trustState: runnerState.trustState,
      lastSeenAt: "2026-09-18T00:00:00.000Z",
      runnerVersion: "0.1.0",
      platform: { os: "linux", architecture: "x86_64", target: "x86_64-unknown-linux-gnu" },
      toolCount: 3,
      readyToolCount: 2,
      capabilityCount: 3,
      readyCapabilityCount: 2,
    }],
    isLoading: false,
    error: null,
    checkedAt: "2026-09-18T00:00:00.000Z",
    desktopDownloads: desktopDownloadState.downloads,
    desktopDownloadError: desktopDownloadState.error,
    refresh: vi.fn(),
    requestUpdate: requestUpdateMock,
  }),
}));

describe("RunnerReleasePanel", () => {
  afterEach(() => {
    runnerState.status = "online";
    runnerState.trustState = "trusted";
    desktopDownloadState.downloads = [];
    desktopDownloadState.error = null;
    requestUpdateMock.mockReset();
    runnerState.runners = [];
  });

  it("renders same-origin download and version check controls without GitHub details", () => {
    render(<RunnerReleasePanel />);
    expect(screen.getByRole("button", { name: /check runner release version/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download cli package 0.2.0/i })).toHaveAttribute("href", "/api/runner-releases/1/download");
    expect(screen.getByText(/choose the CLI package or the Windows\/macOS desktop installer/i)).toBeInTheDocument();
    expect(screen.getByText("Connected Runners")).toBeInTheDocument();
    expect(screen.getByText(/tools ready 2\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/current: 0\.1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/latest: 0\.2\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/last checked:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update runner to 0\.2\.0/i })).toBeEnabled();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
  });

  it("shows only the newest registration for a verified machine identity", () => {
    runnerState.runners = [
      { runnerId: "old", deviceId: "old-install", machineFingerprintHash: "a".repeat(64), displayName: "Shared workstation", profile: "local_device", nodeKind: "local_device", status: "offline", trustState: "trusted", lastSeenAt: "2026-09-01T00:00:00.000Z", runnerVersion: "0.1.0", platform: { os: "windows", architecture: "x64" }, toolInventory: [], toolCount: 0, readyToolCount: 0, capabilityCount: 0, readyCapabilityCount: 0 },
      { runnerId: "new", deviceId: "new-install", machineFingerprintHash: "a".repeat(64), displayName: "Shared workstation", profile: "local_device", nodeKind: "local_device", status: "online", trustState: "trusted", lastSeenAt: "2026-10-08T00:00:00.000Z", runnerVersion: "0.2.15", platform: { os: "windows", architecture: "x64" }, toolInventory: [], toolCount: 0, readyToolCount: 0, capabilityCount: 0, readyCapabilityCount: 0 },
      { runnerId: "other", deviceId: "other-device", machineFingerprintHash: "b".repeat(64), displayName: "Shared workstation", profile: "local_device", nodeKind: "local_device", status: "online", trustState: "trusted", lastSeenAt: "2026-10-07T00:00:00.000Z", runnerVersion: "0.2.14", platform: { os: "windows", architecture: "x64" }, toolInventory: [], toolCount: 0, readyToolCount: 0, capabilityCount: 0, readyCapabilityCount: 0 },
    ];

    render(<RunnerReleasePanel />);

    expect(screen.getAllByText("Shared workstation")).toHaveLength(2);
    expect(screen.getAllByText(/0\.2\.15/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.1\.0/).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Show 1 previous registrations for this verified machine")).toBeInTheDocument();
  });

  it("collapses older same-name registrations with unverified identity and keeps them in history", () => {
    runnerState.runners = [
      { runnerId: "legacy-old", deviceId: "old-id", machineFingerprintHash: null, displayName: "SmartAIHub Runner", profile: "local_device", nodeKind: "local_device", status: "offline", trustState: "trusted", lastSeenAt: "2026-09-01T00:00:00.000Z", runnerVersion: "0.1.0", platform: { os: "windows", architecture: "x64" }, toolInventory: [], toolCount: 0, readyToolCount: 0, capabilityCount: 0, readyCapabilityCount: 0 },
      { runnerId: "legacy-new", deviceId: "new-id", machineFingerprintHash: null, displayName: "SmartAIHub Runner", profile: "local_device", nodeKind: "local_device", status: "online", trustState: "trusted", lastSeenAt: "2026-10-08T00:00:00.000Z", runnerVersion: "0.1.0", platform: { os: "windows", architecture: "x64" }, toolInventory: [], toolCount: 0, readyToolCount: 0, capabilityCount: 0, readyCapabilityCount: 0 },
    ];

    render(<RunnerReleasePanel />);

    expect(screen.getAllByText("SmartAIHub Runner")).toHaveLength(1);
    expect(screen.getByText("Show 1 older registrations with the same name and platform")).toBeInTheDocument();
    expect(screen.getByText("Machine identity is unavailable for these older registrations; they may be separate machines.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update runner to 0\.2\.0/i })).toBeDisabled();
    expect(screen.getByText("Updates are disabled because this Runner shares its name with registrations whose machine identity is unknown.")).toBeInTheDocument();
  });

  it("shows no more than five recent desktop versions with platform downloads grouped by version", () => {
    desktopDownloadState.downloads = ["0.2.10", "0.2.9", "0.2.8", "0.2.7", "0.2.6", "0.2.5"]
      .flatMap((version, index) => ["windows", "macos"].map(platform => ({
        buildId: `build-${index}-${platform}`,
        version,
        platform: platform as "windows" | "macos",
        name: `smartaihub-runner-${platform}-${version}.zip`,
        sizeBytes: 1024,
        expiresAt: "2027-01-02T00:00:00.000Z",
        downloadUrl: `/api/runner-releases/desktop-review/build-${index}-${platform}/artifacts/${index + 1}`,
      })));

    render(<RunnerReleasePanel />);

    expect(screen.getByRole("heading", { name: "Version 0.2.10" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Version 0.2.6" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Version 0.2.5" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Windows GUI 0.2.10 (ZIP)" }))
      .toHaveAttribute("href", "/api/runner-releases/desktop-review/build-0-windows/artifacts/1");
    expect(screen.getByRole("link", { name: "Download macOS GUI 0.2.10 (ZIP)" }))
      .toHaveAttribute("href", "/api/runner-releases/desktop-review/build-0-macos/artifacts/1");
  });

  it("disables updates and explains the offline state", () => {
    runnerState.status = "offline";
    render(<RunnerReleasePanel />);
    expect(screen.getByRole("button", { name: /update runner to 0\.2\.0/i })).toBeDisabled();
    expect(screen.getByText(/update is disabled while this runner is offline/i)).toBeInTheDocument();
  });

  it("keeps revoked runners visible and blocks update controls", () => {
    runnerState.status = "revoked";
    runnerState.trustState = "revoked";
    render(<RunnerReleasePanel />);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update runner to 0\.2\.0/i })).toBeDisabled();
    expect(screen.getByText(/update is disabled because this runner has been revoked/i)).toBeInTheDocument();
  });

  it("localizes update phases instead of exposing raw enum values", async () => {
    requestUpdateMock.mockResolvedValue({
      commandId: "command-1",
      status: "downloading",
      phase: "downloading",
    });
    render(<RunnerReleasePanel />);
    fireEvent.click(screen.getByRole("button", { name: /update runner to 0\.2\.0/i }));
    expect(await screen.findByText("Downloading")).toBeInTheDocument();
  });
});
