// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunnerReleasePanel } from "../RunnerReleasePanel";

const runnerState = vi.hoisted(() => ({ status: "online", trustState: "trusted" }));
const requestUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key.endsWith("checkVersion")) return "Check Runner release version";
      if (key.endsWith("downloadVersion")) return `Download ${values?.version ?? ""}`;
      if (key.endsWith("updateVersion")) return `Update Runner to ${values?.version ?? ""}`;
      if (key.endsWith("currentVersion")) return `Current: ${values?.version ?? ""}`;
      if (key.endsWith("latestVersion")) return `Latest: ${values?.version ?? ""}`;
      if (key.endsWith("lastChecked")) return `Last checked: ${values?.time ?? ""}`;
      if (key.endsWith("connectedRunners")) return "Connected Runners";
      if (key.endsWith("toolReadiness")) return `Tools ready ${values?.ready ?? ""}/${values?.total ?? ""}`;
      if (key.endsWith("capabilityReadiness")) return `Capabilities allowed ${values?.ready ?? ""}/${values?.total ?? ""}`;
      if (key.endsWith("status.revoked")) return "Revoked";
      if (key.endsWith("updateDisabled.offline")) return "Update is disabled while this Runner is offline or degraded.";
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
    runners: [{
      runnerId: "runner-linux",
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
    refresh: vi.fn(),
    requestUpdate: requestUpdateMock,
  }),
}));

describe("RunnerReleasePanel", () => {
  afterEach(() => {
    runnerState.status = "online";
    runnerState.trustState = "trusted";
    requestUpdateMock.mockReset();
  });

  it("renders same-origin download and version check controls without GitHub details", () => {
    render(<RunnerReleasePanel />);
    expect(screen.getByRole("button", { name: /check runner release version/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download 0.2.0/i })).toHaveAttribute("href", "/api/runner-releases/1/download");
    expect(screen.getByText("Connected Runners")).toBeInTheDocument();
    expect(screen.getByText(/tools ready 2\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/current: 0\.1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/latest: 0\.2\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/last checked:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update runner to 0\.2\.0/i })).toBeEnabled();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
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
