import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getVersion } from "@tauri-apps/api/app";
import {
  confirm as nativeConfirm,
  message as nativeMessage,
} from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";
import { MediaWorkspacePanel, SeriesWorkspacePanel } from "./SeriesWorkspacePanel";
import { WorkerAppShell } from "./app/WorkerAppShell";
import { localizeConnectionPresentation, type WorkerConnectionPresentation } from "./app/workerDashboard";
import { localizedWorkerRoutes, resolveWorkerRoute, type CanonicalWorkerRouteId, type WorkerRouteId } from "./app/workerRoutes";
import { CanonicalWorkerRouteScreen } from "./screens/CanonicalWorkerRouteScreen";
import { ComfyConnectionsScreen } from "./screens/ComfyConnectionsScreen";
import { ComfyWorkflowsScreen } from "./screens/ComfyWorkflowsScreen";
import { ComfyJobsScreen } from "./screens/ComfyJobsScreen";
import { WorkerPermissionsPanel } from "./screens/WorkerPermissionsPanel";
import {
  fetchJsonWithTimeout,
  isNewerVersion,
  resolveSameOriginUrl,
  type RuntimeInstallResult,
  type RuntimeSetupStatus,
  type RuntimeUpdateCheck,
  type WorkerAppRelease,
} from "./versionUpdate";

const SMART_AI_HUB_CLOUD_URL = "https://smartaihub.app";
const CONNECTION_HEALTH_RETRY_BUDGET_MS = 2 * 60 * 1000;
const CONNECTION_HEALTH_RETRY_INITIAL_DELAY_MS = 2_000;
const isMacOSHost =
  typeof navigator !== "undefined" &&
  /macintosh|mac os x/i.test(`${navigator.platform} ${navigator.userAgent}`);

type Settings = {
  locale: "th" | "en";
  serverUrl: string;
  workerLabel: string;
  acceptJobs: boolean;
  sharingMode: "private" | "group" | "tenant";
  startWithWindows: boolean;
  minimizeToTray: boolean;
  maxConcurrentJobs: number;
  workspaceDir: string;
  runtimeChannel: "stable" | "preview";
  runtimeVersion: string;
  renderUpdateBlocked: boolean;
  diagnosticsLevel: "errors" | "standard" | "verbose";
  useWsl2: boolean;
  runtimeDir: string;
  runtimeEnvironment: "runtime_pack" | "managed_wsl";
  managedWslRoot: string;
  managedWslWorkspaceRoot: string;
  comfyuiEnabled: boolean;
  comfyuiBaseUrl: string;
};

type DoctorCheck = {
  id: string;
  status: "ok" | "warn" | "error";
  message: string;
  detailsJson: Record<string, unknown>;
};

type DoctorSummary = {
  status: "ready" | "degraded" | "blocked";
  checks: DoctorCheck[];
  recommendedActions: string[];
  officialHyperframesRuntime?: boolean | null;
  runtimeKind?: string | null;
};

type LastJobSummary = {
  jobId: string;
  jobLabel: string;
  projectName?: string | null;
  status: string;
  message: string;
  logPath?: string | null;
};

// Feature 135 §11 — Hermes runtime status, polled alongside the rest of
// ExecutorState. Kept dumb: the Rust side (hermes_runtime.rs/commands.rs)
// computes doctor/version/update-required state, this UI only renders it.
type HermesActiveAuth = {
  verificationUrl: string;
  userCode: string;
  expiresAt?: string | null;
};

type HermesExecutorSummary = {
  doctorStatus: "ready" | "degraded" | "blocked" | string;
  hermesVersion?: string | null;
  updateRequired: boolean;
  updateRequiredReason?: string | null;
  activeAuth?: HermesActiveAuth | null;
};

type ActiveJobSummary = {
  jobId: string;
  jobLabel: string;
  jobType: string;
  createdAt?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  progressPercent: number;
  message: string;
};

type HermesTuiLaunch = {
  launched: boolean;
  command: string;
  message: string;
};

type HermesSignInStart = {
  started: boolean;
  userCode?: string | null;
  verificationUrl?: string | null;
  expiresAt?: string | null;
  message: string;
};

type HermesAuthSummary = {
  available: boolean;
  raw: string;
  providers: string[];
  xaiLoggedIn: boolean;
};

type DiagnosticsLogLocation = {
  logPath: string;
  appDataDir: string;
  files: string[];
};

type StartupModeStatus = {
  startWithWindows: boolean;
  serviceAvailable: boolean;
  message: string;
};

type ConnectionHealth = {
  status: "healthy" | "transient" | "unavailable" | "reconnectRequired";
  healthy: boolean;
  connected: boolean;
  reason?: string | null;
  workerName?: string | null;
  expiresAt?: string | null;
  hoursUntilExpiry?: number | null;
  expiringSoon: boolean;
  checkedAt: string;
};

type ExecutorState = {
  acceptingJobs: boolean;
  currentJobId?: string | null;
  currentJobLabel?: string | null;
  activeJobs?: ActiveJobSummary[];
  currentJobType?: string | null;
  currentProjectId?: string | null;
  currentProjectName?: string | null;
  queueDepth: number;
  progressPercent: number;
  status: "idle" | "polling" | "running" | "paused" | "error";
  lastMessage: string;
  manualCommand?: string | null;
  previewCommand?: string | null;
  logTail?: string | null;
  lastCompletedJob?: LastJobSummary | null;
  hermes?: HermesExecutorSummary | null;
};

type WorkerLoopStatus = {
  running: boolean;
  mode: string;
  message: string;
};

type WorkerConnectSession = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

type WorkerConnectPollResponse = {
  status: "pending" | "approved" | "denied" | "expired" | "error";
  interval?: number | null;
  expiresAt?: string | null;
  worker?: {
    id: string;
    displayName: string;
    runtimeType: string;
    machineName?: string | null;
  } | null;
  tokens?: {
    executionToken: string;
    uploadToken: string;
    refreshToken?: string | null;
  } | null;
  errorMessage?: string | null;
};

type SavedConnectionSession = {
  serverUrl: string;
  worker: NonNullable<WorkerConnectPollResponse["worker"]>;
  tokens: NonNullable<WorkerConnectPollResponse["tokens"]>;
  connectedAt: string;
  lastRefreshedAt: string | null;
};

const fallbackSettings: Settings = {
  locale: "en",
  serverUrl: SMART_AI_HUB_CLOUD_URL,
  workerLabel: "My render worker",
  acceptJobs: true,
  sharingMode: "private",
  startWithWindows: false,
  minimizeToTray: true,
  maxConcurrentJobs: 1,
  workspaceDir: "",
  runtimeChannel: "stable",
  runtimeVersion: "not-installed",
  renderUpdateBlocked: false,
  diagnosticsLevel: "standard",
  useWsl2: !isMacOSHost,
  runtimeDir: "",
  runtimeEnvironment: isMacOSHost ? "runtime_pack" : "managed_wsl",
  managedWslRoot: "~/.smartaihub-worker/runtime",
  managedWslWorkspaceRoot: "",
  comfyuiEnabled: true,
  comfyuiBaseUrl: "http://127.0.0.1:8188",
};

const fallbackDoctor: DoctorSummary = {
  status: "blocked",
  checks: [
    {
      id: isMacOSHost ? "runtime_host_platform" : "managed_wsl_runtime",
      status: "error",
      message: isMacOSHost
        ? "Worker App runtime has not been checked yet."
        : "Worker App runtime has not been checked yet.",
      detailsJson: {},
    },
  ],
  recommendedActions: [
    isMacOSHost
      ? "Download the Worker App runtime, then run checks again."
      : "Prepare the Worker App runtime environment, then run checks again.",
  ],
};

const fallbackExecutor: ExecutorState = {
  acceptingJobs: false,
  currentJobId: null,
  currentJobLabel: null,
  activeJobs: [],
  currentJobType: null,
  currentProjectId: null,
  currentProjectName: null,
  queueDepth: 0,
  progressPercent: 0,
  status: "idle",
  lastMessage: "Idle. Connect and pass readiness checks to accept jobs.",
  manualCommand: null,
  previewCommand: null,
  logTail: null,
};

function renderTerminalText(executor: ExecutorState): string {
  if (executor.logTail?.trim()) {
    return executor.logTail;
  }
  if (!executor.currentJobId) {
    return "";
  }
  return [
    "Waiting for Worker App runtime output...",
    executor.lastMessage,
    "If CPU or memory stays high without new lines, the runtime process may be stuck before it emits progress.",
  ]
    .filter(Boolean)
    .join("\n");
}

const fallbackLoopStatus: WorkerLoopStatus = {
  running: false,
  mode: "manual",
  message: "Worker loop is stopped.",
};

async function safeInvoke<T>(
  command: string,
  fallback: T,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch {
    return fallback;
  }
}

function formatInvokeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTransientWorkerConnectionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timed out") ||
    normalized.includes("control plane request failed") ||
    normalized.includes("failed to read control plane response") ||
    normalized.includes("failed to parse worker control plane json") ||
    /\b(?:408|425|429|500|501|502|503|504|505)\b/.test(normalized)
  );
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as T;
  } catch {
    return null;
  }
}

function decodeJwtExpirationMs(
  token: string | null | undefined,
): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = decodeBase64UrlJson<{ exp?: number }>(parts[1]);
  if (!payload?.exp || !Number.isFinite(payload.exp)) return null;
  return payload.exp * 1000;
}

function computeRefreshDelayMs(session: SavedConnectionSession): number {
  const executionExpiresAt = decodeJwtExpirationMs(
    session.tokens.executionToken,
  );
  const uploadExpiresAt =
    decodeJwtExpirationMs(session.tokens.uploadToken) ?? executionExpiresAt;
  if (!executionExpiresAt) {
    return 6 * 60 * 60 * 1000;
  }
  const minExpiresAt = Math.min(executionExpiresAt, uploadExpiresAt!);
  const now = Date.now();
  const refreshAt = minExpiresAt - 15 * 60 * 1000;
  return Math.max(60_000, refreshAt - now);
}

function shouldRefreshBeforeStartingLoop(
  session: SavedConnectionSession,
): boolean {
  const executionExpiresAt = decodeJwtExpirationMs(
    session.tokens.executionToken,
  );
  const uploadExpiresAt =
    decodeJwtExpirationMs(session.tokens.uploadToken) ?? executionExpiresAt;
  if (!executionExpiresAt) return true;
  const minExpiresAt = Math.min(executionExpiresAt, uploadExpiresAt!);
  return minExpiresAt - Date.now() <= 2 * 60 * 1000;
}

function formatConnectionExpiry(health: ConnectionHealth): string {
  if (!health.expiresAt) {
    return "Server did not report an expiry time";
  }
  if (
    typeof health.hoursUntilExpiry === "number" &&
    health.hoursUntilExpiry < 0
  ) {
    return `Expired at ${new Date(health.expiresAt).toLocaleString()}`;
  }
  const remaining =
    typeof health.hoursUntilExpiry === "number"
      ? ` (about ${health.hoursUntilExpiry} hour${health.hoursUntilExpiry === 1 ? "" : "s"} remaining)`
      : "";
  return `Expires ${new Date(health.expiresAt).toLocaleString()}${remaining}`;
}

/// Deleting the saved connection is irreversible from the app's side — the
/// user must redo browser approval. So it is reserved for verdicts that a
/// retry genuinely cannot recover.
///
/// "revoked" / "reuse" / "replay" were removed on 2026-08-02: they used to be
/// the ROUTINE outcome of two of this app's own refresh drivers racing each
/// other on a single-use token, so a lost race silently disconnected a working
/// machine — which then looked like "autostart stopped working" the next
/// morning. Rotation is now serialised locally and the server honours a reuse
/// grace window, so a rotation failure is worth retrying, not self-destructing
/// over. A genuine server-side revocation still surfaces as a clear error and
/// a "Reconnect Worker App" button the user drives.
function shouldClearSavedConnectionAfterRefreshError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "expired refresh",
    "refresh token is invalid",
    "refresh token is missing worker binding",
    "does not include a refresh token",
    "device proof",
    "wrong device",
  ].some((marker) => normalized.includes(marker));
}

const runtimeRequirements = isMacOSHost
  ? [
      "Native macOS arm64 host (Darwin + arm64) is detected",
      "The Worker App runtime manifest is present",
      "Required runtime tools and media components are present",
      "Required native runtime dependencies are present",
      "Runtime checksum/signature and required fonts are verified",
    ]
  : [
      "WSL2 host responds to wsl.exe --status on Windows",
      "The latest Worker App runtime manifest is checked before installation",
      "The managed runtime root contains the required Worker App runtime files",
      "Required browser and media tools are executable in WSL",
      "Chrome shared libraries, fontconfig, and Noto/Liberation fonts are resolved inside WSL",
    ];

function App() {
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [doctor, setDoctor] = useState<DoctorSummary>(fallbackDoctor);
  const [executor, setExecutor] = useState<ExecutorState>(fallbackExecutor);
  const [connectionState, setConnectionState] = useState<
    "not_connected" | "pending" | "connected" | "error"
  >("not_connected");
  const [connectSession, setConnectSession] =
    useState<WorkerConnectSession | null>(null);
  const [connectedWorker, setConnectedWorker] =
    useState<WorkerConnectPollResponse["worker"]>(null);
  const [connectMessage, setConnectMessage] = useState("");
  const [runtimeInstallMessage, setRuntimeInstallMessage] = useState("");
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [savedConnection, setSavedConnection] =
    useState<SavedConnectionSession | null>(null);
  const [loopStatus, setLoopStatus] =
    useState<WorkerLoopStatus>(fallbackLoopStatus);
  const [appVersion, setAppVersion] = useState("");
  const [workerAppUpdate, setWorkerAppUpdate] =
    useState<WorkerAppRelease | null>(null);
  const [workerAppUpdateStatus, setWorkerAppUpdateStatus] = useState<
    string | null
  >(null);
  const [runtimeUpdate, setRuntimeUpdate] = useState<RuntimeUpdateCheck | null>(
    null,
  );
  const [runtimeVersionCheck, setRuntimeVersionCheck] =
    useState<RuntimeUpdateCheck | null>(null);
  const [runtimeUpdateCheckError, setRuntimeUpdateCheckError] = useState<
    string | null
  >(null);
  const [runtimeInstallError, setRuntimeInstallError] = useState<string | null>(
    null,
  );
  const [runtimeSetupStatus, setRuntimeSetupStatus] =
    useState<RuntimeSetupStatus | null>(null);
  const [renderUpdateBlocked, setRenderUpdateBlocked] = useState(false);
  const [runtimeInstallRequested, setRuntimeInstallRequested] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [appVersionReady, setAppVersionReady] = useState(false);
  const [startupUpdateCheckDone, setStartupUpdateCheckDone] = useState(false);
  const [localRunning, setLocalRunning] = useState(false);
  const [localResult, setLocalResult] = useState<string | null>(null);
  const [hermesInstalling, setHermesInstalling] = useState(false);
  const [hermesMessage, setHermesMessage] = useState("");
  const connectionStateRef = useRef(connectionState);
  const loopStartingRef = useRef(false);
  const loopTransientRetryTimerRef = useRef<number | null>(null);
  const loopTransientRetryStartedAtRef = useRef<number | null>(null);
  const liveLogRef = useRef<HTMLPreElement | null>(null);
  const updateCheckRunningRef = useRef(false);
  const updatePromptedRef = useRef<string | null>(null);
  const runtimeAutoInstallKeyRef = useRef<string | null>(null);
  const runtimeInstallStartedAtRef = useRef<number | null>(null);

  const applyRuntimeUpdateCheck = (check: RuntimeUpdateCheck) => {
    setRuntimeVersionCheck(check);
    setRuntimeUpdate(check.updateAvailable ? check : null);
  };

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""))
      .finally(() => setAppVersionReady(true));
  }, []);

  async function refresh(
    options: { updateConnectionMessage?: boolean; fullDoctor?: boolean } = {},
  ) {
    const updateConnectionMessage = options.updateConnectionMessage ?? true;
    const doctorCommand =
      options.fullDoctor || loopStatus.running
        ? "worker_app_run_full_doctor"
        : "worker_app_run_doctor";
    const restoredConnectionResult = invoke<SavedConnectionSession | null>(
      "worker_app_get_saved_connection",
    )
      .then((connection) => ({ connection, error: null as string | null }))
      .catch((error) => ({
        connection: null,
        error: formatInvokeError(error),
      }));
    const [
      nextSettings,
      nextDoctor,
      nextExecutor,
      nextLoopStatus,
      restoredConnection,
    ] = await Promise.all([
      safeInvoke<Settings>("worker_app_get_settings", fallbackSettings),
      safeInvoke<DoctorSummary>(doctorCommand, fallbackDoctor),
      safeInvoke<ExecutorState>(
        "worker_app_get_executor_state",
        fallbackExecutor,
      ),
      safeInvoke<WorkerLoopStatus>(
        "worker_app_get_worker_loop_status",
        fallbackLoopStatus,
      ),
      restoredConnectionResult,
    ]);
    setSettings(nextSettings);
    setRenderUpdateBlocked(
      (current) => current || nextSettings.renderUpdateBlocked,
    );
    setSettingsReady(true);
    setDoctor(nextDoctor);
    setExecutor(nextExecutor);
    setLoopStatus(nextLoopStatus);

    if (restoredConnection.error) {
      setSavedConnection(null);
      setConnectedWorker(null);
      if (updateConnectionMessage) {
        setConnectionState("error");
        setConnectMessage(
          `Unable to restore saved Worker App connection: ${restoredConnection.error}`,
        );
      }
      return;
    }

    setSavedConnection(restoredConnection.connection);
    setConnectedWorker(restoredConnection.connection?.worker ?? null);
    if (restoredConnection.connection) {
      setConnectionState("connected");
      if (updateConnectionMessage) {
        setConnectMessage(
          "Restored saved Worker App connection. Access tokens will refresh automatically.",
        );
      }
    } else if (connectionStateRef.current !== "pending") {
      setConnectionState("not_connected");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.locale === "th" ? "th" : "en";
  }, [settings.locale]);

  const openManagedWslSetup = async () => {
    runtimeInstallStartedAtRef.current = Date.now();
    setRuntimeSetupStatus(null);
    const message = await invoke<string>(
      "worker_app_open_managed_wsl_runtime_setup",
    );
    setRuntimeInstallMessage(message);
    setRuntimeInstallRequested(true);
    return message;
  };

  const startRuntimeInstall = async (runtimeUpdate: RuntimeUpdateCheck) => {
    const installKey = [
      settings.serverUrl,
      runtimeUpdate.runtimeId,
      runtimeUpdate.channel,
      runtimeUpdate.latestVersion ?? "unknown",
    ].join(":");
    if (runtimeAutoInstallKeyRef.current === installKey) {
      return runtimeUpdate.updateAvailable;
    }

    runtimeAutoInstallKeyRef.current = installKey;
    runtimeInstallStartedAtRef.current = Date.now();
    setRuntimeInstallError(null);
    setRuntimeUpdateCheckError(null);
    setRuntimeInstallRequested(true);
    setRuntimeInstallMessage(
      `Downloading Worker App runtime... Installed ${runtimeUpdate.currentVersion ?? "not installed"}; latest ${runtimeUpdate.latestVersion ?? "unknown"}.`,
    );

    try {
      if (!isMacOSHost && settings.runtimeEnvironment === "managed_wsl") {
        await openManagedWslSetup();
        setRuntimeInstallMessage(
          "Worker App runtime download and installation started automatically. Keep the setup window open; this app will verify the result and continue automatically.",
        );
        return true;
      }

      const result = await invoke<RuntimeInstallResult>(
        "worker_app_install_runtime_pack",
      );
      setRuntimeInstallMessage(result.message);

      const verifiedRuntime = await invoke<RuntimeUpdateCheck>(
        "worker_app_check_runtime_update",
      );
      applyRuntimeUpdateCheck(verifiedRuntime);
      const stillNeedsUpdate = verifiedRuntime.updateAvailable;
      setRenderUpdateBlocked(stillNeedsUpdate);
      await invoke<Settings>("worker_app_set_render_update_blocked", {
        blocked: stillNeedsUpdate,
      });
      if (!stillNeedsUpdate) {
        setRuntimeInstallRequested(false);
        runtimeInstallStartedAtRef.current = null;
        await refresh({
          updateConnectionMessage: false,
          fullDoctor: true,
        });
      } else {
        runtimeAutoInstallKeyRef.current = null;
        setRuntimeInstallMessage(
          `Worker App runtime installation finished, but version ${verifiedRuntime.currentVersion ?? "not installed"} is still below latest ${verifiedRuntime.latestVersion ?? "unknown"}.`,
        );
      }
      return stillNeedsUpdate;
    } catch (error) {
      const message = formatInvokeError(error);
      runtimeAutoInstallKeyRef.current = null;
      setRuntimeInstallRequested(false);
      setRenderUpdateBlocked(true);
      setRuntimeInstallError(message);
      setRuntimeInstallMessage(
        `Automatic Worker App runtime installation failed: ${message}`,
      );
      return true;
    }
  };

  useEffect(() => {
    if (
      !settingsReady ||
      !appVersionReady ||
      startupUpdateCheckDone ||
      updateCheckRunningRef.current
    )
      return;
    // Runtime freshness must be checked independently from the Worker App
    // version. A transient Tauri app-version read failure must not suppress a
    // Worker App runtime warning.
    if (!settings.serverUrl.trim()) {
      setStartupUpdateCheckDone(true);
      return;
    }

    let cancelled = false;
    updateCheckRunningRef.current = true;

    const checkForUpdates = async () => {
      try {
        let release: WorkerAppRelease | null = null;
        let appCheckSucceeded = false;
        try {
          const payload = await fetchJsonWithTimeout<{
            release: WorkerAppRelease | null;
          }>(
            `${settings.serverUrl.trim().replace(/\/$/, "")}/api/desktop-releases/worker-app/latest`,
          );
          release = payload.release ?? null;
          appCheckSucceeded = true;
        } catch {
          // Version checks are advisory. A server/network failure must not stop
          // a worker from starting or make a healthy connection look broken.
          // Runtime checking below still gets a chance to run independently.
        }
        if (cancelled) return;

        if (
          appVersion &&
          release &&
          isNewerVersion(appVersion, release.version)
        ) {
          setWorkerAppUpdate(release);
          const downloadUrl = resolveSameOriginUrl(
            settings.serverUrl,
            release.downloadUrl,
          );
          if (downloadUrl) {
            const promptKey = `worker:${settings.serverUrl}:${release.version}`;
            if (updatePromptedRef.current !== promptKey) {
              updatePromptedRef.current = promptKey;
              const confirmed = await nativeConfirm(
                `A newer Smart AI Hub Worker App is available.\n\nInstalled: ${appVersion}\nLatest: ${release.version}\n\nDownload and install the update now? The app will open the Windows installer and close itself.`,
                {
                  title: "Smart AI Hub Worker — update available",
                  kind: "info",
                },
              );
              if (!cancelled && confirmed) {
                setWorkerAppUpdateStatus(
                  "Downloading the Worker App installer...",
                );
                try {
                  setWorkerAppUpdateStatus(
                    "Preparing the Worker App installer...",
                  );
                  await invoke("worker_app_install_update", {
                    url: downloadUrl,
                    version: release.version,
                  });
                } catch (error) {
                  setWorkerAppUpdateStatus(null);
                  await nativeMessage(
                    `The Worker App update could not be installed automatically.\n\n${formatInvokeError(error)}\n\nYou can download the installer manually from the Dashboard.`,
                    {
                      title: "Smart AI Hub Worker — update failed",
                      kind: "error",
                    },
                  ).catch(() => undefined);
                }
              }
            }
          }
        } else if (appCheckSucceeded) {
          setWorkerAppUpdate(null);
        }

        let runtimeUpdate: RuntimeUpdateCheck;
        try {
          runtimeUpdate = await invoke<RuntimeUpdateCheck>(
            "worker_app_check_runtime_update",
          );
        } catch (error) {
          // Runtime availability is advisory, but a silent failure makes the
          // update flow look dead. Keep the worker usable and show the reason.
          if (!cancelled) setRuntimeUpdateCheckError(formatInvokeError(error));
          return;
        }
        if (cancelled) return;
        setRuntimeUpdateCheckError(null);
        applyRuntimeUpdateCheck(runtimeUpdate);
        const runtimeUpdateRequired = runtimeUpdate.updateAvailable;
        const shouldBlockRender =
          runtimeUpdateRequired || (!appCheckSucceeded && renderUpdateBlocked);
        setRenderUpdateBlocked(shouldBlockRender);
        void invoke<Settings>("worker_app_set_render_update_blocked", {
          blocked: shouldBlockRender,
        })
          .then((updatedSettings) => {
            if (!cancelled) setSettings(updatedSettings);
          })
          .catch(() => undefined);

        if (!runtimeUpdateRequired || !runtimeUpdate.latestVersion) return;

        if (cancelled) return;
        await startRuntimeInstall(runtimeUpdate);
      } finally {
        updateCheckRunningRef.current = false;
        if (!cancelled) setStartupUpdateCheckDone(true);
      }
    };

    void checkForUpdates();
    return () => {
      cancelled = true;
    };
  }, [
    appVersion,
    appVersionReady,
    settings.runtimeEnvironment,
    settings.serverUrl,
    settingsReady,
    startupUpdateCheckDone,
  ]);

  // Verify the RESTORED connection for real, on every launch.
  //
  // Before this (2026-07-31) the app happily reported "Restored saved Worker
  // App connection" without ever asking the server whether those credentials
  // still worked — a revoked or expired worker looked connected and silently
  // claimed nothing. `worker_app_check_connection_health` does a real token
  // refresh round-trip.
  //
  // Both warnings use a NATIVE OS dialog rather than in-app text on purpose:
  // this app spends its life minimised behind other windows running the
  // background loop, so an in-app banner would never be seen.
  // REAL autostart state as reported by the OS, not the settings file. These
  // diverge whenever the Run key / LaunchAgent is removed outside this app
  // (reinstall, cleanup tool, antivirus) — the checkbox used to keep claiming
  // autostart was on while nothing would actually start.
  const [activeRoute, setActiveRoute] = useState<CanonicalWorkerRouteId>("overview");
  const navigateWorkerRoute = (route: WorkerRouteId) => {
    setActiveRoute(resolveWorkerRoute(route));
  };
  const [hermesAuth, setHermesAuth] = useState<HermesAuthSummary | null>(null);
  const [hermesTui, setHermesTui] = useState<HermesTuiLaunch | null>(null);
  const [hermesError, setHermesError] = useState<string>("");
  const [hermesSignIn, setHermesSignIn] = useState<HermesSignInStart | null>(
    null,
  );
  const [hermesSigningIn, setHermesSigningIn] = useState(false);
  const startHermesSignIn = async () => {
    setHermesError("");
    setHermesSigningIn(true);
    try {
      const result = await invoke<HermesSignInStart>(
        "worker_app_hermes_signin_xai",
      );
      setHermesSignIn(result);
    } catch (error) {
      setHermesSignIn(null);
      setHermesError(formatInvokeError(error));
    } finally {
      setHermesSigningIn(false);
    }
  };
  const refreshHermesAuth = async () => {
    // NOT `safeInvoke`: that swallows the error and returns the fallback, which
    // is exactly how these buttons came to look dead (2026-07-31 — the Hermes
    // runtime was not installed, the command returned Err, and nothing at all
    // happened on screen).
    try {
      const summary = await invoke<HermesAuthSummary>(
        "worker_app_hermes_auth_summary",
      );
      setHermesAuth(summary);
      setHermesError("");
    } catch (error) {
      setHermesAuth(null);
      setHermesError(formatInvokeError(error));
    }
  };
  const openHermesTui = async (extraArgs?: string[]) => {
    setHermesError("");
    try {
      const result = await invoke<HermesTuiLaunch>(
        "worker_app_open_hermes_tui",
        {
          extraArgs,
        },
      );
      setHermesTui(result);
    } catch (error) {
      setHermesTui(null);
      setHermesError(formatInvokeError(error));
      return;
    }
    // Signing in inside the TUI changes provider state, so re-read it after.
    await refreshHermesAuth();
  };
  useEffect(() => {
    if (activeRoute === "runtime") void refreshHermesAuth();
  }, [activeRoute]);
  const [diagnosticsLogPath, setDiagnosticsLogPath] = useState<string>("");
  useEffect(() => {
    void safeInvoke<DiagnosticsLogLocation | null>(
      "worker_app_get_diagnostics_log",
      null,
    ).then((location) => setDiagnosticsLogPath(location?.logPath ?? ""));
  }, []);
  const openDiagnosticsLog = async () => {
    const location = await safeInvoke<DiagnosticsLogLocation | null>(
      "worker_app_get_diagnostics_log",
      null,
    );
    if (!location) return;
    setDiagnosticsLogPath(location.logPath);
    // Open the folder, not the file: the rotated generations next to it are
    // usually where the run BEFORE the failure was recorded.
    await safeInvoke<void>("worker_app_open_file", undefined, {
      path: location.appDataDir,
    });
  };

  const [startupActual, setStartupActual] = useState<boolean | null>(null);
  const [startupMessage, setStartupMessage] = useState<string>("");
  const refreshStartupStatus = async () => {
    const status = await safeInvoke<StartupModeStatus | null>(
      "worker_app_get_startup_status",
      null,
    );
    if (status) {
      setStartupActual(status.startWithWindows);
      setStartupMessage(status.message ?? "");
    }
  };
  useEffect(() => {
    void refreshStartupStatus();
  }, []);

  const [connectionHealth, setConnectionHealth] =
    useState<ConnectionHealth | null>(null);
  const connectionHealthAlertedRef = useRef<string | null>(null);
  const connectionHealthRetryTimerRef = useRef<number | null>(null);
  const connectionHealthTransientStartedAtRef = useRef<number | null>(null);
  const [connectionHealthRecoveryTimedOut, setConnectionHealthRecoveryTimedOut] =
    useState(false);
  const [connectionHealthStale, setConnectionHealthStale] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const scheduleNextCheck = () => {
      if (cancelled) return;
      if (connectionHealthRetryTimerRef.current !== null) {
        window.clearTimeout(connectionHealthRetryTimerRef.current);
      }
      connectionHealthRetryTimerRef.current = window.setTimeout(() => {
        connectionHealthRetryTimerRef.current = null;
        void check();
      }, 5_000);
    };
    const check = async () => {
      const health = await safeInvoke<ConnectionHealth | null>(
        "worker_app_check_connection_health",
        null,
      );
      if (cancelled) return;
      if (!health) {
        setConnectionHealthStale(true);
        scheduleNextCheck();
        return;
      }
      setConnectionHealthStale(false);
      setConnectionHealth(health);
      if (!health.connected) {
        scheduleNextCheck();
        return;
      }
      if (health.status === "transient" || health.status === "unavailable") {
        const startedAt =
          connectionHealthTransientStartedAtRef.current ?? Date.now();
        connectionHealthTransientStartedAtRef.current = startedAt;
        const elapsedMs = Date.now() - startedAt;
        const timedOut = elapsedMs >= CONNECTION_HEALTH_RETRY_BUDGET_MS;
        setConnectionHealthRecoveryTimedOut(timedOut);
        setConnectionHealth((current) =>
          current
            ? { ...current, status: timedOut ? "unavailable" : "transient" }
            : current,
        );
        // A transport failure must not block the existing worker loop or
        // prevent the normal startup loop from continuing with cached tokens.
        setConnectionState((current) =>
          current === "pending" ? current : "connected",
        );
        connectionHealthAlertedRef.current = null;
        setConnectMessage(
          timedOut
            ? "Smart AI Hub is still unavailable after 2 minutes. The app will keep retrying automatically."
            : "Smart AI Hub is temporarily unavailable. Retrying automatically...",
        );
        scheduleNextCheck();
        return;
      }
      if (health.status === "reconnectRequired" || !health.healthy) {
        // De-duplicate on the reason so a persistent outage does not reopen a
        // modal every poll — only a CHANGED problem interrupts again.
        const key = `unhealthy:${health.reason ?? ""}`;
        if (connectionHealthAlertedRef.current === key) return;
        connectionHealthAlertedRef.current = key;
        setConnectionState("error");
        setConnectMessage(
          `Saved connection is no longer valid: ${health.reason ?? "unknown error"}`,
        );
        await nativeMessage(
          `The saved connection for "${health.workerName ?? "this worker"}" is no longer accepted by Smart AI Hub.\n\n${health.reason ?? ""}\n\nOpen Smart AI Hub Worker App and press "Reconnect Worker App" — no jobs will run until you do.`,
          { title: "Smart AI Hub Worker — reconnect required", kind: "error" },
        ).catch(() => undefined);
        return;
      }
      const recoveredFromUnavailable =
        connectionHealthTransientStartedAtRef.current !== null ||
        connectionStateRef.current === "error";
      connectionHealthTransientStartedAtRef.current = null;
      setConnectionHealthRecoveryTimedOut(false);
      // A successful health check must clear a previous transient/error state;
      // clearing only the dialog de-duplication key leaves the card stuck.
      setConnectionState((current) =>
        current === "pending" ? current : "connected",
      );
      if (recoveredFromUnavailable) {
        setConnectMessage("Connected. Access recovered automatically.");
      }
      if (health.expiringSoon) {
        const key = `expiring:${health.expiresAt ?? ""}`;
        if (connectionHealthAlertedRef.current === key) {
          scheduleNextCheck();
          return;
        }
        connectionHealthAlertedRef.current = key;
        const hours = health.hoursUntilExpiry ?? 0;
        await nativeMessage(
          `The Worker App connection for "${health.workerName ?? "this worker"}" expires in about ${hours} hour(s)${health.expiresAt ? ` (${new Date(health.expiresAt).toLocaleString()})` : ""}.\n\nReconnect before then so rendering keeps running uninterrupted.`,
          {
            title: "Smart AI Hub Worker — connection expiring soon",
            kind: "warning",
          },
        ).catch(() => undefined);
        scheduleNextCheck();
        return;
      }
      connectionHealthAlertedRef.current = null;
      scheduleNextCheck();
    };
    void check();
    return () => {
      cancelled = true;
      if (connectionHealthRetryTimerRef.current !== null) {
        window.clearTimeout(connectionHealthRetryTimerRef.current);
        connectionHealthRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const intervalMs = 5_000;
    const handle = window.setInterval(() => {
      void refresh({ updateConnectionMessage: false });
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [loopStatus.running]);

  useEffect(() => {
    const logEl = liveLogRef.current;
    if (!logEl) return;
    logEl.scrollTop = logEl.scrollHeight;
  }, [executor.logTail]);

  const activeJobs = useMemo(
    () => (Array.isArray(executor.activeJobs) ? executor.activeJobs : []),
    [executor.activeJobs],
  );
  const formatActiveJobTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString(settings.locale === "th" ? "th-TH" : "en-US")
      : settings.locale === "th"
        ? "ไม่พบเวลาสร้างจาก Server"
        : "Creation time unavailable from Server";
  // The render lane is the one users ask about ("is it rendering?"), so call it
  // out separately from the short Hermes media jobs sharing the same worker.
  const renderJob = useMemo(
    () =>
      activeJobs.find(
        (job) =>
          job.jobType === "remotion_render_video" ||
          job.jobType.startsWith("hyperframes"),
      ) ?? null,
    [activeJobs],
  );

  const readinessLabel = useMemo(() => {
    if (renderUpdateBlocked) return "Update required for render jobs";
    if (doctor.status === "ready") return "Ready for render jobs";
    if (doctor.status === "degraded") return "Needs attention";
    return "Runtime blocked";
  }, [doctor.status, renderUpdateBlocked]);

  const runtimeVersionStatus = useMemo(() => {
    if (runtimeInstallError) {
      return {
        tone: "error",
        label: "Worker App runtime installation failed",
        detail: "Retry from the Video render tab after resolving the issue.",
      };
    }
    if (runtimeInstallRequested) {
      return {
        tone: "pending",
        label: "Downloading Worker App runtime...",
        detail:
          runtimeInstallMessage ||
          "The app is downloading and installing the runtime automatically.",
      };
    }
    if (runtimeUpdateCheckError) {
      return {
        tone: "error",
        label: "Runtime version could not be verified",
        detail: "Run checks in the Video render tab to try again.",
      };
    }
    if (!runtimeVersionCheck) {
      return {
        tone: startupUpdateCheckDone ? "error" : "pending",
        label: startupUpdateCheckDone
          ? "Runtime version not verified"
          : "Checking runtime version...",
        detail: startupUpdateCheckDone
          ? "The latest runtime version is unavailable right now."
          : "Checking the installed runtime against the latest published version.",
      };
    }
    const installed = runtimeVersionCheck.currentVersion ?? "not installed";
    const latest = runtimeVersionCheck.latestVersion ?? "unknown";
    if (runtimeVersionCheck.updateAvailable) {
      return {
        tone: "warning",
        label: "Runtime update available",
        detail: `Installed ${installed} · Latest ${latest}`,
      };
    }
    return {
      tone: "ready",
      label: "Runtime is up to date",
      detail: `Installed ${installed} · Latest ${latest}`,
    };
  }, [
    runtimeInstallError,
    runtimeInstallMessage,
    runtimeInstallRequested,
    runtimeUpdateCheckError,
    runtimeVersionCheck,
    startupUpdateCheckDone,
  ]);

  const connectionStatus = useMemo<WorkerConnectionPresentation>(() => {
    if (connectionState === "pending") {
      return {
        label: "Approval pending",
        detail: "Approve this Worker App in the browser.",
        tone: "pending",
      };
    }
    if (!savedConnection) {
      return {
        label: "Not connected",
        detail: "Connect this machine to receive worker jobs.",
        tone: "error",
      };
    }
    if (!connectionHealth) {
      return {
        label: "Connected · checking access",
        detail: "Verifying the saved connection with Smart AI Hub...",
        tone: "pending",
      };
    }
    if (connectionHealthStale) {
      return {
        label: "Connection check delayed",
        detail:
          "The last connection result is stale. The Worker App is checking again and will not claim readiness until the server responds.",
        tone: "warning",
      };
    }
    if (!connectionHealth.connected) {
      return {
        label: "Not connected",
        detail: "Connect this machine to receive worker jobs.",
        tone: "error",
      };
    }
    if (
      connectionHealth.status === "transient" ||
      connectionHealth.status === "unavailable"
    ) {
      return {
        label: connectionHealthRecoveryTimedOut
          ? "Smart AI Hub unavailable · retrying"
          : "Reconnecting automatically",
        detail: connectionHealthRecoveryTimedOut
          ? "Smart AI Hub has not responded for 2 minutes. The Worker App will continue retrying without deleting this connection."
          : "Smart AI Hub is temporarily unavailable. The Worker App will retry automatically.",
        tone: connectionHealthRecoveryTimedOut ? "warning" : "pending",
      };
    }
    if (
      connectionHealth.status === "reconnectRequired" ||
      !connectionHealth.healthy ||
      connectionState === "error"
    ) {
      return {
        label: "Reconnect required",
        detail:
          connectionHealth.reason ??
          connectMessage ??
          "The server did not accept the saved connection.",
        tone: "error",
      };
    }
    if (renderUpdateBlocked) {
      return {
        label: "Connected · render paused",
        detail:
          "Access is valid. Complete the runtime update/readiness check to receive render jobs.",
        tone: "warning",
      };
    }
    if (loopStatus.running && executor.status === "error") {
      return {
        label: "Connected · worker loop error",
        detail:
          executor.lastMessage ||
          "The server rejected the worker heartbeat or queue request.",
        tone: "error",
      };
    }
    if (doctor.status === "ready" && loopStatus.running) {
      return {
        label: "Ready to receive jobs",
        detail: "Connection, runtime, and worker loop are active.",
        tone: "ready",
      };
    }
    if (doctor.status === "ready") {
      return {
        label: "Connected · loop stopped",
        detail:
          "Access and runtime are valid. Start the worker loop to receive jobs.",
        tone: "warning",
      };
    }
    return {
      label: "Connected · runtime needs attention",
      detail: "Access is valid, but render readiness checks are not complete.",
      tone: "warning",
    };
  }, [
    connectMessage,
    connectionHealth,
    connectionHealthRecoveryTimedOut,
    connectionHealthStale,
    connectionState,
    doctor.status,
    executor.lastMessage,
    executor.status,
    loopStatus.running,
    renderUpdateBlocked,
    savedConnection,
  ]);
  const localizedConnectionStatus = localizeConnectionPresentation(connectionStatus, settings.locale);

  const doctorCheckById = useMemo(() => {
    return new Map(doctor.checks.map((check) => [check.id, check]));
  }, [doctor.checks]);

  const readinessSummaryItems = useMemo(
    () => [
      ...(isMacOSHost
        ? []
        : [
            {
              id: "wsl2",
              label: "WSL2 readiness",
              check:
                doctorCheckById.get("wsl2_browser_dependencies") ??
                doctorCheckById.get("wsl2_host") ??
                doctorCheckById.get("wsl2_runtime_profile"),
            },
          ]),
      {
        id: "runtime",
        label: "Worker App runtime",
        check: (() => {
          const checks = [
            ...(isMacOSHost ? [] : [doctorCheckById.get("managed_wsl_runtime")]),
            doctorCheckById.get("runtime_host_platform"),
            doctorCheckById.get("hyperframes_native_dependencies"),
            doctorCheckById.get("official_hyperframes_renderer"),
            doctorCheckById.get("runtime_bundle"),
            doctorCheckById.get("runtime_manifest"),
          ].filter((check): check is DoctorCheck => Boolean(check));
          return (
            checks.find((check) => check.status === "error") ??
            checks.find((check) => check.status === "warn") ??
            checks[0]
          );
        })(),
      },
      {
        id: "installer",
        label: "Install set",
        check:
          doctorCheckById.get("installer_set") ??
          doctorCheckById.get("runtime_signature_bundle"),
      },
    ],
    [doctorCheckById],
  );

  const startLoopDisabled =
    !startupUpdateCheckDone ||
    !savedConnection ||
    loopStatus.running ||
    connectionState === "pending";
  const stopLoopDisabled = !loopStatus.running;
  const terminalText = renderTerminalText(executor);
  const startLoopLabel = !startupUpdateCheckDone
    ? "Checking for updates..."
    : loopStatus.running
      ? "Loop already running"
      : savedConnection
        ? "Start worker loop"
        : connectionState === "pending"
          ? "Waiting for approval"
          : "Connect before starting";
  const stopLoopLabel = loopStatus.running
    ? "Stop loop"
    : "Loop already stopped";

  const saveSettings = async (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    const saved = await safeInvoke<Settings>(
      "worker_app_save_settings",
      nextSettings,
      {
        settings: nextSettings,
      },
    );
    setSettings(saved);
    if (Object.prototype.hasOwnProperty.call(patch, "startWithWindows")) {
      let startup: { message: string };
      try {
        startup = await invoke<{ message: string }>(
          "worker_app_configure_startup",
          {
            enabled: Boolean(patch.startWithWindows),
          },
        );
      } catch (error) {
        startup = {
          message: error instanceof Error ? error.message : String(error),
        };
      }
      setConnectMessage(startup.message);
    }
  };

  const connect = async () => {
    setConnectionState("pending");
    setConnectMessage("Opening browser approval...");
    setConnectedWorker(null);
    try {
      const session = await invoke<WorkerConnectSession>(
        "worker_app_start_connect_session",
      );
      setConnectSession(session);
      setConnectMessage("Approve this Worker App in your browser.");
    } catch (error) {
      setConnectionState("error");
      setConnectMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (connectionState !== "pending" || !connectSession?.deviceCode) return;
    let cancelled = false;
    const intervalMs = Math.max(2, connectSession.interval || 3) * 1000;

    async function poll() {
      try {
        const result = await invoke<WorkerConnectPollResponse>(
          "worker_app_poll_connect_session",
          {
            deviceCode: connectSession!.deviceCode,
          },
        );
        if (cancelled) return;
        if (result.status === "approved") {
          if (result.worker && result.tokens) {
            const nextSession: SavedConnectionSession = {
              serverUrl: settings.serverUrl,
              worker: result.worker,
              tokens: result.tokens,
              connectedAt: new Date().toISOString(),
              lastRefreshedAt: null,
            };
            setSavedConnection(nextSession);
          }
          setConnectionState("connected");
          setConnectedWorker(result.worker ?? null);
          setConnectMessage(
            renderUpdateBlocked
              ? "Connected. Render jobs remain paused until the runtime update and readiness checks pass."
              : "Connected. This app can now receive worker jobs.",
          );
          return;
        }
        if (
          result.status === "expired" ||
          result.status === "denied" ||
          result.status === "error"
        ) {
          setConnectionState("error");
          setConnectMessage(
            result.errorMessage ||
              `Connection ${result.status}. Start Connect again.`,
          );
          return;
        }
        setConnectMessage("Waiting for browser approval...");
      } catch (error) {
        if (!cancelled) {
          setConnectionState("error");
          setConnectMessage(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    void poll();
    const handle = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [connectionState, connectSession, settings.serverUrl]);

  const startLoop = async (
    session: SavedConnectionSession | null = savedConnection,
  ) => {
    if (loopStartingRef.current) return;
    let activeSession = session;
    if (!activeSession) {
      setConnectMessage(
        "Connect this Worker App before starting the worker loop.",
      );
      return;
    }
    loopStartingRef.current = true;
    try {
      if (shouldRefreshBeforeStartingLoop(activeSession)) {
        setConnectMessage(
          "Refreshing Worker App access before starting the loop...",
        );
        activeSession = await invoke<SavedConnectionSession>(
          "worker_app_refresh_saved_connection",
          {
            caller: "start_loop",
          },
        );
        setSavedConnection(activeSession);
        setConnectedWorker(activeSession.worker);
      }
      const status = await invoke<WorkerLoopStatus>(
        "worker_app_start_worker_loop",
        {
          request: {
            serverUrl: activeSession.serverUrl,
            workerId: activeSession.worker.id,
            workerLabel: activeSession.worker.displayName,
            executionToken: activeSession.tokens.executionToken,
            uploadToken: activeSession.tokens.uploadToken,
          },
        },
      );
      setLoopStatus(status);
      setConnectMessage(
        renderUpdateBlocked
          ? `${status.message} Render jobs remain paused until the runtime update and readiness checks pass.`
          : status.message,
      );
      loopTransientRetryStartedAtRef.current = null;
      if (loopTransientRetryTimerRef.current !== null) {
        window.clearTimeout(loopTransientRetryTimerRef.current);
        loopTransientRetryTimerRef.current = null;
      }
      void refresh({ fullDoctor: status.running });
    } catch (error) {
      const message = formatInvokeError(error);
      if (isTransientWorkerConnectionError(message)) {
        setLoopStatus({
          running: false,
          mode: "automatic_retry",
          message: "Smart AI Hub is temporarily unavailable. Retrying the worker loop automatically.",
        });
        setConnectionState("connected");
        setConnectMessage(
          "Smart AI Hub is temporarily unavailable. Retrying automatically...",
        );
        const startedAt =
          loopTransientRetryStartedAtRef.current ?? Date.now();
        loopTransientRetryStartedAtRef.current = startedAt;
        if (loopTransientRetryTimerRef.current === null) {
          const elapsedMs = Date.now() - startedAt;
          loopTransientRetryTimerRef.current = window.setTimeout(() => {
            loopTransientRetryTimerRef.current = null;
            void startLoop(activeSession);
          },
          elapsedMs < CONNECTION_HEALTH_RETRY_BUDGET_MS
            ? CONNECTION_HEALTH_RETRY_INITIAL_DELAY_MS
            : 30_000);
        }
        return;
      }
      setLoopStatus({ running: false, mode: "manual", message });
      setConnectionState("error");
      setConnectMessage(message);
    } finally {
      loopStartingRef.current = false;
    }
  };

  const stopLoop = async () => {
    if (loopTransientRetryTimerRef.current !== null) {
      window.clearTimeout(loopTransientRetryTimerRef.current);
      loopTransientRetryTimerRef.current = null;
    }
    loopTransientRetryStartedAtRef.current = null;
    const status = await safeInvoke<WorkerLoopStatus>(
      "worker_app_stop_worker_loop",
      fallbackLoopStatus,
    );
    setLoopStatus(status);
    setConnectMessage(status.message);
    void refresh();
  };

  const runLocalCommand = async () => {
    if (!executor.manualCommand) return;
    setLocalRunning(true);
    setLocalResult(
      "Running local render... Please wait. This may take several minutes.",
    );
    try {
      const result = await invoke<string>("worker_app_run_manual_command", {
        command: executor.manualCommand,
      });
      setLocalResult(result);
    } catch (error) {
      setLocalResult(formatInvokeError(error));
    } finally {
      setLocalRunning(false);
    }
  };

  const runLocalPreview = async () => {
    if (!executor.previewCommand) return;
    setLocalRunning(true);
    setLocalResult("Starting preview server locally...");
    try {
      const result = await invoke<string>("worker_app_run_manual_command", {
        command: executor.previewCommand,
      });
      setLocalResult(result);
    } catch (error) {
      setLocalResult(formatInvokeError(error));
    } finally {
      setLocalRunning(false);
    }
  };

  const runDoctorChecks = async () => {
    setDoctorRunning(true);
    try {
      const nextDoctor = await safeInvoke<DoctorSummary>(
        "worker_app_run_full_doctor",
        fallbackDoctor,
      );
      setDoctor(nextDoctor);

      let appCheckSucceeded = false;
      let appUpdateRequired = Boolean(
        workerAppUpdate && isNewerVersion(appVersion, workerAppUpdate.version),
      );
      try {
        const payload = await fetchJsonWithTimeout<{
          release: WorkerAppRelease | null;
        }>(
          `${settings.serverUrl.trim().replace(/\/$/, "")}/api/desktop-releases/worker-app/latest`,
        );
        const release = payload.release ?? null;
        appCheckSucceeded = true;
        appUpdateRequired = Boolean(
          release && isNewerVersion(appVersion, release.version),
        );
        setWorkerAppUpdate(appUpdateRequired ? release : null);
      } catch {
        // Keep the existing advisory when the release check is offline.
      }

      let nextRuntimeUpdate: RuntimeUpdateCheck;
      try {
        nextRuntimeUpdate = await invoke<RuntimeUpdateCheck>(
          "worker_app_check_runtime_update",
        );
      } catch (error) {
        setRuntimeUpdateCheckError(formatInvokeError(error));
        setRuntimeInstallMessage(
          `Runtime update check failed: ${formatInvokeError(error)}`,
        );
        return;
      }
      setRuntimeUpdateCheckError(null);
      let runtimeUpdateRequired = nextRuntimeUpdate.updateAvailable;
      applyRuntimeUpdateCheck(nextRuntimeUpdate);
      if (runtimeUpdateRequired) {
        runtimeUpdateRequired = await startRuntimeInstall(nextRuntimeUpdate);
      }
      const shouldBlockRender =
        runtimeUpdateRequired || (!appCheckSucceeded && renderUpdateBlocked);
      setRenderUpdateBlocked(shouldBlockRender);
      const updatedSettings = await invoke<Settings>(
        "worker_app_set_render_update_blocked",
        {
          blocked: shouldBlockRender,
        },
      );
      setSettings(updatedSettings);
      if (!shouldBlockRender) {
        setRuntimeInstallRequested(false);
        setRuntimeInstallMessage(
          nextDoctor.status === "ready"
            ? "Runtime is current and render readiness checks passed."
            : "Runtime version is current. Resolve the remaining readiness checks before rendering.",
        );
      }
    } finally {
      setDoctorRunning(false);
    }
  };

  useEffect(() => {
    if (!runtimeInstallRequested) return;
    let cancelled = false;
    let checking = false;
    const startedAt = Date.now();

    const pollInstalledRuntime = async () => {
      if (cancelled || checking) return;
      if (Date.now() - startedAt > 30 * 60 * 1000) {
        setRuntimeInstallRequested(false);
        return;
      }
      checking = true;
      try {
        let observedSetupStatus: RuntimeSetupStatus | null = null;
        if (settings.runtimeEnvironment === "managed_wsl") {
          const setupStatus = await invoke<RuntimeSetupStatus>(
            "worker_app_get_managed_wsl_runtime_setup_status",
          ).catch(() => null);
          if (cancelled) return;
          if (setupStatus) {
            observedSetupStatus = setupStatus;
            setRuntimeSetupStatus(setupStatus);
            const statusUpdatedAt = setupStatus.updatedAt
              ? Date.parse(setupStatus.updatedAt)
              : NaN;
            const staleStatus =
              runtimeInstallStartedAtRef.current !== null &&
              Number.isFinite(statusUpdatedAt) &&
              statusUpdatedAt < runtimeInstallStartedAtRef.current;
            if (staleStatus) {
              setRuntimeInstallMessage(
                "Starting the runtime installer and waiting for its status file...",
              );
              return;
            }
            if (
              setupStatus.status === "running" ||
              setupStatus.status === "not_started"
            ) {
              setRuntimeInstallMessage(
                setupStatus.message ||
                  "Waiting for managed WSL runtime installation to start...",
              );
              return;
            }
            if (setupStatus.status === "failed") {
              runtimeAutoInstallKeyRef.current = null;
              setRuntimeInstallRequested(false);
              setRenderUpdateBlocked(true);
              setRuntimeInstallError(
                setupStatus.message || "Worker App runtime installation failed.",
              );
              setRuntimeInstallMessage(
                `Runtime installation failed. ${setupStatus.message || "Read the setup terminal and try again."}`,
              );
              return;
            }
            if (setupStatus.status === "succeeded") {
              setRuntimeInstallMessage(
                "Runtime download and extraction completed. Verifying the installed manifest and render readiness...",
              );
            }
          }
        }
        const nextRuntimeUpdate = await invoke<RuntimeUpdateCheck>(
          "worker_app_check_runtime_update",
        );
        if (cancelled) return;
        applyRuntimeUpdateCheck(nextRuntimeUpdate);
        if (nextRuntimeUpdate.updateAvailable) {
          setRuntimeInstallMessage(
            observedSetupStatus?.status === "succeeded"
              ? `The installer finished, but the installed runtime is still ${nextRuntimeUpdate.currentVersion ?? "not detected"}; latest is ${nextRuntimeUpdate.latestVersion ?? "unknown"}. Run the setup again after reviewing the terminal.`
              : `Downloading runtime update... installed ${nextRuntimeUpdate.currentVersion ?? "not installed"}; latest ${nextRuntimeUpdate.latestVersion ?? "unknown"}.`,
          );
          if (observedSetupStatus?.status === "succeeded")
            runtimeAutoInstallKeyRef.current = null;
          if (observedSetupStatus?.status === "succeeded")
            setRuntimeInstallRequested(false);
          return;
        }

        const shouldBlockRender = false;
        setRenderUpdateBlocked(shouldBlockRender);
        const updatedSettings = await invoke<Settings>(
          "worker_app_set_render_update_blocked",
          {
            blocked: shouldBlockRender,
          },
        );
        if (cancelled) return;
        setSettings(updatedSettings);
        setRuntimeInstallRequested(false);
        runtimeInstallStartedAtRef.current = null;
        const nextDoctor = await invoke<DoctorSummary>(
          "worker_app_run_full_doctor",
        );
        if (cancelled) return;
        setDoctor(nextDoctor);
        setRuntimeInstallMessage(
          nextDoctor.status === "ready"
            ? "Runtime installation completed and render readiness passed. The existing connection can continue without reconnecting."
            : "Runtime installation completed. Resolve the remaining readiness checks before rendering.",
        );
      } catch {
        setRuntimeInstallMessage(
          "Runtime installation is still in progress. Keep the setup terminal open; the app will verify it again automatically.",
        );
      } finally {
        checking = false;
      }
    };

    void pollInstalledRuntime();
    const handle = window.setInterval(() => void pollInstalledRuntime(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [
    appVersion,
    runtimeInstallRequested,
    settings.runtimeEnvironment,
    settings.serverUrl,
    workerAppUpdate,
  ]);

  const runHermesDoctor = async () => {
    try {
      await invoke("worker_app_hermes_doctor");
      void refresh({ updateConnectionMessage: false });
    } catch (error) {
      setHermesMessage(formatInvokeError(error));
    }
  };

  const installHermesRuntime = async () => {
    setHermesInstalling(true);
    setHermesMessage("Installing Hermes runtime pack...");
    try {
      const result = await invoke<{ status: string; message: string }>(
        "worker_app_install_hermes_runtime",
      );
      setHermesMessage(result.message);
      void refresh({ updateConnectionMessage: false });
    } catch (error) {
      setHermesMessage(formatInvokeError(error));
    } finally {
      setHermesInstalling(false);
    }
  };

  useEffect(() => {
    if (
      !startupUpdateCheckDone ||
      connectionState !== "connected" ||
      !savedConnection
    )
      return;
    void startLoop(savedConnection);
  }, [
    connectionState,
    renderUpdateBlocked,
    savedConnection?.tokens.executionToken,
    savedConnection?.tokens.uploadToken,
    startupUpdateCheckDone,
  ]);

  useEffect(() => {
    if (
      connectionState !== "connected" ||
      !savedConnection?.tokens.refreshToken
    ) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextSession = await invoke<SavedConnectionSession>(
          "worker_app_refresh_saved_connection",
          {
            caller: "renewal_timer",
          },
        );
        if (cancelled) return;
        setSavedConnection(nextSession);
        setConnectedWorker(nextSession.worker);
        setConnectionState("connected");
        setConnectMessage("Connected. Access renewed automatically.");
      } catch (error) {
        if (cancelled) return;
        const message = formatInvokeError(error);
        if (isTransientWorkerConnectionError(message)) {
          // A renewal timeout is an availability problem, not proof that the
          // saved connection was revoked. Keep the loop and let the health
          // retry path converge once the server is back.
          setConnectionState("connected");
          setConnectionHealth((current) =>
            current
              ? {
                  ...current,
                  status: "transient",
                  healthy: false,
                  reason: message,
                }
              : current,
          );
          setConnectionHealthRecoveryTimedOut(false);
          setConnectMessage(
            "Smart AI Hub is temporarily unavailable. Retrying automatically...",
          );
          return;
        }
        if (shouldClearSavedConnectionAfterRefreshError(message)) {
          await safeInvoke<void>(
            "worker_app_clear_saved_connection",
            undefined,
            {
              reason: `renewal_timer_refresh_error: ${message}`,
            },
          );
          setSavedConnection(null);
          setConnectedWorker(null);
        }
        setConnectionState("error");
        setConnectMessage(
          `${message}. Reconnect this Worker App if browser approval was revoked or expired.`,
        );
      }
    }, computeRefreshDelayMs(savedConnection));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connectionState, savedConnection]);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Lightweight worker helper</p>
          <h1>Smart AI Hub Worker App</h1>
          {appVersion ? (
            <p className="app-version">Version {appVersion}</p>
          ) : null}
          <div
            className={`runtime-version-card ${runtimeVersionStatus.tone}`}
            data-testid="runtime-version-status"
            role="status"
            aria-live="polite"
          >
            <div className="runtime-version-heading">
              <span>Worker App runtime</span>
            </div>
            <strong>{runtimeVersionStatus.label}</strong>
            <span>{runtimeVersionStatus.detail}</span>
          </div>
          <p className="subtle">
            Connect in your browser, verify the Worker App runtime, then let this
            app process jobs in the background.
          </p>
        </div>
        <div className="hero-status-stack">
          <div className={`readiness-pill ${doctor.status}`}>
            {readinessLabel}
          </div>
          <div
            className={`connection-status-card ${connectionStatus.tone}`}
            data-testid="connection-status"
          >
            <strong>{localizedConnectionStatus.label}</strong>
            <span>{localizedConnectionStatus.detail}</span>
          </div>
        </div>
      </section>
      {renderUpdateBlocked ? (
        <div className="connect-message error" role="alert">
          <strong>Worker App runtime update required.</strong>{" "}
          {runtimeUpdate
            ? `Latest version is ${runtimeUpdate.latestVersion ?? "unknown"}; installed version is ${runtimeUpdate.currentVersion ?? "not installed"}. The app will download it automatically.`
            : "The app cannot prove that the Worker App runtime is current. Complete the update check before using render jobs."}
        </div>
      ) : null}
      {runtimeUpdateCheckError ? (
        <div
          className="connect-message pending"
          role="alert"
          data-testid="runtime-update-check-error"
        >
          <strong>Worker App runtime update check incomplete.</strong>{" "}
          {`The latest Worker App runtime could not be verified: ${runtimeUpdateCheckError} Use Run checks in the Runtime tab to try again.`}
        </div>
      ) : null}
      {workerAppUpdate ? (
        <div className="connect-message pending" role="status">
          <strong>Worker App update available.</strong>{" "}
          {`Installed ${appVersion || "unknown"}; latest ${workerAppUpdate.version}. Confirm the update to download and open the Windows installer.`}
        </div>
      ) : null}
      {workerAppUpdateStatus ? (
        <div
          className="connect-message pending"
          role="status"
          data-testid="worker-app-update-status"
        >
          <strong>Worker App update:</strong> {workerAppUpdateStatus}
        </div>
      ) : null}
      {runtimeInstallRequested && runtimeInstallMessage ? (
        <div
          className="connect-message pending"
          role="status"
          data-testid="runtime-install-status"
        >
          <strong>
            Worker App runtime update
            {runtimeSetupStatus ? `: ${runtimeSetupStatus.status}` : ""}
          </strong>{" "}
          {runtimeSetupStatus?.message || runtimeInstallMessage}
        </div>
      ) : null}

      {/* Tabbed layout (2026-07-31). One long scrolling grid mixed connection,
          render, Hermes and settings together, so nothing read as a coherent
          area of responsibility. Each tab is now one job the user came to do. */}
      <WorkerAppShell routes={localizedWorkerRoutes(settings.locale)} activeRoute={activeRoute} onNavigate={navigateWorkerRoute} connected={Boolean(savedConnection && connectionHealth?.connected)} connectionStatus={{ ...localizedConnectionStatus, connected: Boolean(savedConnection && connectionHealth?.connected), expiresAt: connectionHealth?.expiresAt, hoursUntilExpiry: connectionHealth?.hoursUntilExpiry, checkedAt: connectionHealth?.checkedAt, stale: connectionHealthStale }} queueDepth={executor.queueDepth} runtimeStatus={doctor.status} loopRunning={loopStatus.running} locale={settings.locale}>

      {["overview", "queue"].includes(activeRoute) ? (
        <CanonicalWorkerRouteScreen
          route={activeRoute}
          connected={Boolean(savedConnection && connectionHealth?.connected)}
          loopRunning={loopStatus.running}
          queueDepth={executor.queueDepth}
          lastMessage={executor.lastMessage}
          runtimeStatus={doctor.status}
          connectionStatus={{ ...localizedConnectionStatus, connected: Boolean(savedConnection && connectionHealth?.connected), expiresAt: connectionHealth?.expiresAt, hoursUntilExpiry: connectionHealth?.hoursUntilExpiry, checkedAt: connectionHealth?.checkedAt, stale: connectionHealthStale }}
          executorState={executor}
          onNavigate={navigateWorkerRoute}
        />
      ) : null}

      {activeRoute === "connection" ? (
        <section className="dashboard-grid" role="tabpanel">
          <article className="panel connect-panel">
            <div className="panel-heading">
              <p className="eyebrow">Connection</p>
              <h2>Connect to Smart AI Hub</h2>
            </div>
            <p className="subtle">
              Approval opens in your browser. This app never asks for a
              username, password, API key, manual token, cookie, or pasted
              credential.
            </p>
            {connectedWorker ? (
              <p className="connection-summary">
                Connected worker: <strong>{connectedWorker.displayName}</strong>
              </p>
            ) : null}
            <div
              className={`connection-status-card ${connectionStatus.tone}`}
              data-testid="connection-status-panel"
            >
              <strong>{localizedConnectionStatus.label}</strong>
              <span>{localizedConnectionStatus.detail}</span>
            </div>
            {savedConnection?.lastRefreshedAt ? (
              <p className="subtle">
                Last token refresh:{" "}
                {new Date(savedConnection.lastRefreshedAt).toLocaleString()}
              </p>
            ) : null}
            {/* Expiry was computed for the warning dialogs but never SHOWN, so
              "last refresh" left the obvious question — when does it run out?
              — unanswered (2026-07-31). */}
            {connectionHealth ? (
              <p
                className={`subtle${connectionHealth.expiringSoon || (connectionHealth.hoursUntilExpiry ?? 0) < 0 ? " warning" : ""}`}
                data-testid="connection-expiry"
              >
                {formatConnectionExpiry(connectionHealth)}
                {connectionHealth.expiringSoon ? " — reconnect soon" : ""}
                {` · Last checked ${new Date(connectionHealth.checkedAt).toLocaleString()}`}
              </p>
            ) : (
              <p className="subtle" data-testid="connection-expiry">
                Connection status and expiry: checking...
              </p>
            )}
            {connectSession && connectionState === "pending" ? (
              <div className="connect-code-box">
                <span>Browser code</span>
                <strong>{connectSession.userCode}</strong>
                <a href={connectSession.verificationUriComplete}>
                  {connectSession.verificationUriComplete}
                </a>
              </div>
            ) : null}
            {connectMessage ? (
              <p className={`connect-message ${connectionState}`}>
                {connectMessage}
              </p>
            ) : null}
            <button type="button" className="primary-button" onClick={connect}>
              {connectionState === "pending"
                ? "Waiting for browser approval"
                : connectionState === "connected" ||
                    (savedConnection && connectionState === "error")
                  ? "Reconnect Worker App"
                  : "Connect to Smart AI Hub"}
            </button>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void startLoop()}
                disabled={startLoopDisabled}
              >
                {startLoopLabel}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void stopLoop()}
                disabled={stopLoopDisabled}
              >
                {stopLoopLabel}
              </button>
            </div>
          </article>
          <WorkerPermissionsPanel />
        </section>
      ) : null}

      {activeRoute === "series" ? <SeriesWorkspacePanel /> : null}
      {activeRoute === "media-workspace" ? <MediaWorkspacePanel onNavigate={navigateWorkerRoute} /> : null}
      {activeRoute === "comfy" ? <ComfyConnectionsScreen onNavigate={route => navigateWorkerRoute(route)} /> : null}
      {activeRoute === "workflows" ? <ComfyWorkflowsScreen /> : null}
      {activeRoute === "comfy-jobs" ? <ComfyJobsScreen /> : null}

      {(activeRoute as string) === "render" ? (
        <section className="dashboard-grid" role="tabpanel">
          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Current job</p>
              <h2>
                {renderJob
                  ? `Rendering · ${renderJob.jobLabel || renderJob.jobType}`
                  : activeJobs.length > 0
                    ? `${activeJobs.length} job${activeJobs.length > 1 ? "s" : ""} running`
                    : executor.currentJobLabel || "No active job"}
              </h2>
            </div>
            <div className="queue-summary" aria-label="Worker queue summary">
              <div>
                <span>Waiting queue</span>
                <strong>{executor.queueDepth}</strong>
              </div>
              <div>
                <span>Jobs in flight</span>
                <strong>{activeJobs.length}</strong>
              </div>
              <div>
                <span>Active render</span>
                <strong>
                  {renderJob ? `${renderJob.progressPercent}%` : "None"}
                </strong>
              </div>
            </div>
            {/* Every lane, not just the primary. The worker runs the render lane
              and the Hermes media lane concurrently, and before this list
              existed a short Hermes job finishing mid-render blanked the whole
              panel to "No active job" while the render was still going. */}
            {activeJobs.length > 0 ? (
              <ul className="active-job-list" aria-label="Jobs in flight">
                {activeJobs.map((activeJob) => (
                  <li key={activeJob.jobId} className="active-job-row">
                    <div className="active-job-head">
                      <strong>{activeJob.jobLabel || activeJob.jobType}</strong>
                      <span>{activeJob.progressPercent}%</span>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{ width: `${activeJob.progressPercent}%` }}
                      />
                    </div>
                    <p className="subtle">
                      {settings.locale === "th" ? "เลข Job" : "Job ID"}: {activeJob.jobId}
                      {` · ${settings.locale === "th" ? "ชนิดงาน" : "Type"}: ${activeJob.jobType}`}
                      {` · ${settings.locale === "th" ? "สร้างเมื่อ" : "Created"}: ${formatActiveJobTime(activeJob.createdAt)}`}
                      {activeJob.projectName
                        ? ` · ${activeJob.projectName}`
                        : ""}
                      {activeJob.message ? ` · ${activeJob.message}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {executor.currentJobId ? (
              <dl className="job-details">
                <div>
                  <dt>Job ID</dt>
                  <dd>{executor.currentJobId}</dd>
                </div>
                {executor.currentJobType ? (
                  <div>
                    <dt>Job type</dt>
                    <dd>{executor.currentJobType}</dd>
                  </div>
                ) : null}
                {executor.currentProjectName ? (
                  <div>
                    <dt>Project</dt>
                    <dd>{executor.currentProjectName}</dd>
                  </div>
                ) : null}
                {executor.currentProjectId ? (
                  <div>
                    <dt>Project ID</dt>
                    <dd>{executor.currentProjectId}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <p
              className={`loop-badge ${loopStatus.running ? "running" : "stopped"}`}
            >
              {loopStatus.running ? "Loop running" : "Loop stopped"} ·{" "}
              {loopStatus.mode}
            </p>
            <div className="progress-track" aria-label="Current job progress">
              <span style={{ width: `${executor.progressPercent}%` }} />
            </div>
            {!executor.currentJobId ? (
              <p className="subtle">{executor.lastMessage}</p>
            ) : null}

            {executor.currentJobId ? (
              <div className="live-log-tail">
                <div className="live-log-header">
                  <span className="eyebrow">Live Render Output</span>
                  <span>{executor.progressPercent}%</span>
                </div>
                <pre ref={liveLogRef}>{terminalText}</pre>
              </div>
            ) : null}

            {executor.manualCommand ? (
              <div className="manual-command-box">
                <div className="manual-command-header">
                  <span className="eyebrow">Manual Commands</span>
                </div>
                <div style={{ marginTop: "8px", marginBottom: "8px" }}>
                  <p style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    Render Command:
                  </p>
                  <div
                    style={{ display: "flex", gap: "8px", marginBottom: "8px" }}
                  >
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={() => void runLocalCommand()}
                      disabled={localRunning}
                      title="Run render command locally to bypass the cloud queue"
                    >
                      {localRunning ? "Running..." : "Run Render Locally"}
                    </button>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() =>
                        navigator.clipboard.writeText(executor.manualCommand!)
                      }
                      title="Copy command to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="manual-command-text">
                    {executor.manualCommand}
                  </pre>
                </div>

                {executor.previewCommand ? (
                  <div style={{ marginTop: "16px" }}>
                    <p style={{ fontWeight: "bold", marginBottom: "4px" }}>
                      Preview Command:
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-button small"
                        onClick={() => void runLocalPreview()}
                        disabled={localRunning}
                        title="Run preview server locally"
                      >
                        {localRunning ? "Running..." : "Run Preview Locally"}
                      </button>
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            executor.previewCommand!,
                          )
                        }
                        title="Copy preview command to clipboard"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="manual-command-text">
                      {executor.previewCommand}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {executor.lastCompletedJob ? (
              <div
                className={`last-job-summary ${executor.lastCompletedJob.status}`}
              >
                <div className="panel-heading">
                  <p className="eyebrow">Last job</p>
                  <h3>{executor.lastCompletedJob.jobLabel}</h3>
                </div>
                <p className="subtle">
                  Project: {executor.lastCompletedJob.projectName || "Unknown"}
                </p>
                <p className="last-job-status">
                  Status:{" "}
                  <strong>
                    {executor.lastCompletedJob.status.toUpperCase()}
                  </strong>{" "}
                  - {executor.lastCompletedJob.message}
                </p>
                {executor.lastCompletedJob.logPath ? (
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() =>
                      invoke("worker_app_open_file", {
                        path: executor.lastCompletedJob!.logPath,
                      })
                    }
                  >
                    View Render Log
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>

          <article className="panel wide">
            <div className="panel-heading inline">
              <div>
                <p className="eyebrow">Readiness</p>
                <h2>Worker App runtime checks</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void runDoctorChecks()}
                disabled={doctorRunning}
              >
                {doctorRunning ? "Checking..." : "Run checks"}
              </button>
            </div>
            <div className="readiness-summary">
              {readinessSummaryItems.map((item) => (
                <div className="readiness-card" key={item.id}>
                  <span
                    className={`status-dot ${item.check?.status ?? "warn"}`}
                  />
                  <div>
                    <strong>{item.label}</strong>
                    <p>
                      {item.check?.message ??
                        "Run checks to verify this requirement."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="check-list">
              {doctor.checks.map((check) => (
                <div className="check-row" key={check.id}>
                  <span className={`status-dot ${check.status}`} />
                  <div>
                    <strong>{check.id.replaceAll("_", " ")}</strong>
                    <p>{check.message}</p>
                  </div>
                </div>
              ))}
            </div>
            {doctor.recommendedActions.length > 0 ? (
              <div className="runtime-help">
                <strong>What to fix next</strong>
                <ul>
                  {doctor.recommendedActions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <strong className="runtime-help-subheading">
                  {isMacOSHost ? "Complete native macOS arm64 install set" : "Complete managed WSL install set"}
                </strong>
                <ul>
                  {runtimeRequirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="subtle">
                  {isMacOSHost
                    ? "The Worker App uses the installed runtime for this machine and does not fall back to another platform's runtime."
                    : "The Worker App uses the managed runtime environment and reports the real missing file, executable, or shared library when a check fails."}
                </p>
                {!isMacOSHost ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await openManagedWslSetup();
                      } catch (err) {
                        setRuntimeInstallMessage(
                          "Failed to open managed WSL setup: " + err,
                        );
                      }
                    }}
                  >
                    Prepare managed WSL runtime
                  </button>
                ) : null}
                {runtimeInstallMessage ? (
                  <p className="connect-message">{runtimeInstallMessage}</p>
                ) : null}
              </div>
            ) : (
              <div className="runtime-help">
                <p className="subtle">
                  {isMacOSHost
                    ? "Native macOS arm64 runtime is ready. Render jobs run without WSL2 or Windows compatibility layers."
                    : "Managed WSL runtime is ready. Render jobs will run from the configured WSL runtime root."}
                </p>
                {runtimeInstallMessage ? (
                  <p className="connect-message">{runtimeInstallMessage}</p>
                ) : null}
              </div>
            )}
          </article>
        </section>
      ) : null}

      {(activeRoute as string) === "runtime" ? (
        <section className="dashboard-grid" role="tabpanel">
          <article className="panel wide">
            <div className="panel-heading inline">
              <div>
                <p className="eyebrow">Hermes agent</p>
                <h2>Interactive terminal &amp; sign-in</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void refreshHermesAuth()}
              >
                Refresh sign-in status
              </button>
            </div>
            <div className="queue-summary" aria-label="Hermes sign-in">
              <div>
                <span>xAI / Grok sign-in</span>
                <strong>
                  {hermesAuth === null
                    ? "Unknown"
                    : hermesAuth.xaiLoggedIn
                      ? "Signed in"
                      : "Not signed in"}
                </strong>
              </div>
              <div>
                <span>Providers with credentials</span>
                <strong>{hermesAuth?.providers.length ?? 0}</strong>
              </div>
            </div>
            {hermesAuth?.providers.length ? (
              <p className="subtle">{hermesAuth.providers.join(", ")}</p>
            ) : null}
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void openHermesTui()}
                data-testid="hermes-open-tui"
              >
                Open Hermes TUI
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void openHermesTui(["chat"])}
                data-testid="hermes-open-chat"
              >
                Open Grok chat
              </button>
              {/* One-click sign-in: opens a terminal already running the device-code
                flow, so the user never has to remember the command. */}
              <button
                type="button"
                className="secondary-button"
                onClick={() => void startHermesSignIn()}
                disabled={hermesSigningIn}
                data-testid="hermes-signin-xai"
              >
                {hermesSigningIn
                  ? "Starting sign-in…"
                  : hermesAuth?.xaiLoggedIn
                    ? "Re-authorise xAI / Grok"
                    : "Sign in to xAI / Grok"}
              </button>
            </div>
            {hermesTui ? (
              <div className="live-log-tail">
                <div className="live-log-header">
                  <span className="eyebrow">Command</span>
                </div>
                <pre>{hermesTui.command}</pre>
                <p className="subtle">{hermesTui.message}</p>
              </div>
            ) : null}
            {hermesSignIn ? (
              <div
                className="connect-code-box"
                data-testid="hermes-device-code"
              >
                {hermesSignIn.userCode ? (
                  <>
                    <span>Enter this code in the browser</span>
                    <strong>{hermesSignIn.userCode}</strong>
                    {hermesSignIn.verificationUrl ? (
                      <p className="subtle">{hermesSignIn.verificationUrl}</p>
                    ) : null}
                  </>
                ) : (
                  <span>Sign-in did not produce a code</span>
                )}
                {/* `pre` because the fallback message carries Hermes' RAW output —
                  losing its line breaks would destroy the one useful
                  diagnostic. */}
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: 8,
                    fontSize: "0.78rem",
                  }}
                >
                  {hermesSignIn.message}
                </pre>
                {!hermesSignIn.userCode ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      void openHermesTui([
                        "auth",
                        "add",
                        "xai-oauth",
                        "--no-browser",
                      ])
                    }
                    data-testid="hermes-signin-fallback-tui"
                  >
                    Run sign-in in a terminal instead
                  </button>
                ) : null}
              </div>
            ) : null}
            {hermesError ? (
              <div className="connect-message error" role="alert">
                <strong>Could not run Hermes:</strong> {hermesError}
                <p style={{ marginTop: 6 }}>
                  Most often the Hermes runtime is not installed on this machine
                  yet. Scroll down to <em>Hermes (Grok media) runtime</em> and
                  press <em>Install / update Hermes runtime</em>, then try
                  again.
                </p>
              </div>
            ) : null}
            {hermesAuth && !hermesAuth.available && !hermesError ? (
              <p className="connect-message">
                Hermes runtime is not installed on this machine yet — install it
                below before opening the TUI or signing in.
              </p>
            ) : null}
            <p className="field-help">
              The TUI runs in its own terminal window because it needs a real
              tty. Sign-in is per provider: use{" "}
              <code>hermes auth add xai-oauth</code> (device code) or{" "}
              <code>hermes login</code> inside that terminal. LLM traffic goes
              straight from this machine to the provider — it does NOT route
              through the Smart AI Hub gateway.
            </p>
          </article>

          <article className="panel wide">
            <div className="panel-heading inline">
              <div>
                <p className="eyebrow">Feature 135</p>
                <h2>Hermes (Grok media) runtime</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void runHermesDoctor()}
                disabled={hermesInstalling}
              >
                Run Hermes checks
              </button>
            </div>
            <p className="subtle">
              Lets this machine execute your private Grok connections'
              image/video generation jobs. The Grok OAuth token never leaves
              this computer.
            </p>
            {executor.hermes?.updateRequired ? (
              <div className="connect-message error">
                Update required:{" "}
                {executor.hermes.updateRequiredReason ||
                  "This worker's Hermes runtime is below the server's minimum supported version."}
              </div>
            ) : null}
            <div className="readiness-summary">
              <div className="readiness-card">
                <span
                  className={`status-dot ${executor.hermes?.doctorStatus ?? "warn"}`}
                />
                <div>
                  <strong>Runtime doctor</strong>
                  <p>
                    {executor.hermes
                      ? `${executor.hermes.doctorStatus} (${executor.hermes.hermesVersion ?? "version unknown"})`
                      : "Not installed yet."}
                  </p>
                </div>
              </div>
            </div>
            {executor.hermes?.activeAuth ? (
              <div className="connect-code-box">
                <span>Grok device-code approval</span>
                <strong>{executor.hermes.activeAuth.userCode}</strong>
                <a href={executor.hermes.activeAuth.verificationUrl}>
                  {executor.hermes.activeAuth.verificationUrl}
                </a>
              </div>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={() => void installHermesRuntime()}
              disabled={hermesInstalling}
            >
              {hermesInstalling
                ? "Installing..."
                : "Install / update Hermes runtime"}
            </button>
            {hermesMessage ? (
              <p className="connect-message">{hermesMessage}</p>
            ) : null}
          </article>
        </section>
      ) : null}

      {activeRoute === "settings" ? (
        <section className="dashboard-grid" role="tabpanel">
          <article className="panel wide settings-panel">
            <div className="panel-heading">
              <p className="eyebrow">Settings</p>
              <h2>Worker preferences</h2>
            </div>
            <div className="settings-grid">
              <label>
                Language / ภาษา
                <select
                  value={settings.locale}
                  onChange={(event) =>
                    void saveSettings({
                      locale: event.target.value as Settings["locale"],
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="th">ไทย</option>
                </select>
                <span className="field-help">
                  Applies to the Worker App after saving. / มีผลกับ Worker App หลังบันทึก
                </span>
              </label>
              <label>
                Server URL preset
                <select
                  value={settings.serverUrl}
                  onChange={(event) =>
                    void saveSettings({ serverUrl: event.target.value })
                  }
                >
                  <option value={SMART_AI_HUB_CLOUD_URL}>
                    Smart AI Hub Cloud
                  </option>
                  <option value="http://localhost:5000">
                    Local development
                  </option>
                </select>
              </label>
              <label>
                Worker label
                <input
                  value={settings.workerLabel}
                  onChange={(event) =>
                    void saveSettings({ workerLabel: event.target.value })
                  }
                />
              </label>
              <label>
                Sharing mode
                <select
                  value={settings.sharingMode}
                  onChange={(event) =>
                    void saveSettings({
                      sharingMode: event.target
                        .value as Settings["sharingMode"],
                    })
                  }
                >
                  <option value="private">Private</option>
                  <option value="group">Group shared</option>
                  <option value="tenant">Tenant shared</option>
                </select>
                <span className="field-help">
                  Private picks only your own jobs. Group shared follows the
                  allowed groups configured on the web settings page.
                </span>
              </label>
              <label>
                Max concurrent jobs
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={settings.maxConcurrentJobs}
                  onChange={(event) =>
                    void saveSettings({
                      maxConcurrentJobs: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.acceptJobs}
                  onChange={(event) =>
                    void saveSettings({ acceptJobs: event.target.checked })
                  }
                />
                Accept jobs immediately
              </label>
              <p className="field-help">
                Queue pickup defaults to on. If you pause it, reconnect this
                worker so the server-side claim policy sees the latest state.
              </p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.minimizeToTray}
                  onChange={(event) =>
                    void saveSettings({ minimizeToTray: event.target.checked })
                  }
                />
                Minimize to tray
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={startupActual ?? settings.startWithWindows}
                  onChange={(event) => {
                    void (async () => {
                      await saveSettings({
                        startWithWindows: event.target.checked,
                      });
                      // Re-read the OS afterwards: `saveSettings` reports what it
                      // was ASKED to do, this reports what actually happened.
                      await refreshStartupStatus();
                    })();
                  }}
                />
                Start with Windows sign-in
              </label>
              {startupActual !== null ? (
                <p
                  className={`field-help${
                    startupActual !== settings.startWithWindows
                      ? " warning"
                      : ""
                  }`}
                  data-testid="startup-actual-state"
                >
                  {startupActual !== settings.startWithWindows
                    ? `Saved preference and the operating system disagree — the OS currently reports autostart ${startupActual ? "ON" : "OFF"}. Toggle it once to re-apply.`
                    : startupMessage}
                </p>
              ) : null}
              {!isMacOSHost ? (
                <>
                  <label>
                    Managed WSL runtime root
                    <input
                      type="text"
                      value={settings.managedWslRoot}
                      onChange={(event) =>
                        void saveSettings({ managedWslRoot: event.target.value })
                      }
                    />
                    <span className="field-help">
                      This folder lives inside WSL, for example
                      ~/.smartaihub-worker/runtime. The setup terminal installs
                      the required Worker App runtime components into this root.
                    </span>
                  </label>
                  <label>
                    Managed WSL workspace root
                    <input
                      type="text"
                      placeholder="Auto: sibling workspace next to the runtime root"
                      value={settings.managedWslWorkspaceRoot}
                      onChange={(event) =>
                        void saveSettings({
                          managedWslWorkspaceRoot: event.target.value,
                        })
                      }
                    />
                    <span className="field-help">
                      Render jobs are staged here inside WSL before running. Keep
                      this on the Linux filesystem or on the same drive as your
                      managed WSL runtime; avoid /mnt/c for large video jobs.
                    </span>
                  </label>
                </>
              ) : (
                <p className="field-help">
                  macOS uses the Worker App runtime for this platform. WSL2 and
                  Windows runtime settings are not available.
                </p>
              )}
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.comfyuiEnabled}
                  onChange={(event) =>
                    void saveSettings({ comfyuiEnabled: event.target.checked })
                  }
                />
                Detect and accept ComfyUI jobs
              </label>
              <label>
                ComfyUI local service URL
                <input
                  type="url"
                  value={settings.comfyuiBaseUrl}
                  disabled={!settings.comfyuiEnabled}
                  onChange={(event) =>
                    void saveSettings({ comfyuiBaseUrl: event.target.value })
                  }
                />
                <span className="field-help">
                  The Worker App accepts only an HTTP loopback service such as
                  http://127.0.0.1:8188. Install and configure ComfyUI, its
                  models, and any custom nodes separately; this setting only
                  enables safe detection and job transfer.
                </span>
              </label>
              {!isMacOSHost ? (
                <div style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await openManagedWslSetup();
                      } catch (err) {
                        setRuntimeInstallMessage(
                          "Failed to open managed WSL setup: " + err,
                        );
                      }
                    }}
                  >
                    Prepare managed WSL runtime
                  </button>
                </div>
              ) : null}
              <p className="field-help">
                This is Windows user-login autostart, not a Windows service.
                Service mode is not installed in this build and will not be
                shown as ready.
              </p>
              <div style={{ marginTop: "8px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void openDiagnosticsLog()}
                >
                  Open diagnostics log
                </button>
              </div>
              <p className="field-help">
                Every run appends to <code>worker-diagnostics.jsonl</code>: app
                start, sign-in autostart state, each token refresh and its
                verdict, and every error. Attach this file when reporting a
                connection problem — it records what happened before the
                failure, which the on-screen message cannot.
                {diagnosticsLogPath ? (
                  <>
                    <br />
                    {diagnosticsLogPath}
                  </>
                ) : null}
              </p>
            </div>
          </article>
        </section>
      ) : null}
      </WorkerAppShell>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
