import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

const SMART_AI_HUB_CLOUD_URL = "https://smartaihub.app";

type Settings = {
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
  diagnosticsLevel: "errors" | "standard" | "verbose";
  useWsl2: boolean;
  runtimeDir: string;
  runtimeEnvironment: "runtime_pack" | "managed_wsl";
  managedWslRoot: string;
  managedWslWorkspaceRoot: string;
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

type ExecutorState = {
  acceptingJobs: boolean;
  currentJobId?: string | null;
  currentJobLabel?: string | null;
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
  diagnosticsLevel: "standard",
  useWsl2: true,
  runtimeDir: "",
  runtimeEnvironment: "managed_wsl",
  managedWslRoot: "~/.smartaihub-worker/runtime",
  managedWslWorkspaceRoot: "",
};

const fallbackDoctor: DoctorSummary = {
  status: "blocked",
  checks: [
    {
      id: "managed_wsl_runtime",
      status: "error",
      message: "Managed WSL runtime has not been checked yet.",
      detailsJson: {},
    },
  ],
  recommendedActions: [
    "Prepare the managed WSL runtime environment, then run checks again.",
  ],
};

const fallbackExecutor: ExecutorState = {
  acceptingJobs: false,
  currentJobId: null,
  currentJobLabel: null,
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
    "Waiting for HyperFrames render output...",
    executor.lastMessage,
    "If CPU or memory stays high without new lines, the render process may be stuck before HyperFrames emits progress.",
  ].filter(Boolean).join("\n");
}

const fallbackLoopStatus: WorkerLoopStatus = {
  running: false,
  mode: "manual",
  message: "Worker loop is stopped.",
};

async function safeInvoke<T>(command: string, fallback: T, args?: Record<string, unknown>): Promise<T> {
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

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as T;
  } catch {
    return null;
  }
}

function decodeJwtExpirationMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = decodeBase64UrlJson<{ exp?: number }>(parts[1]);
  if (!payload?.exp || !Number.isFinite(payload.exp)) return null;
  return payload.exp * 1000;
}

function computeRefreshDelayMs(session: SavedConnectionSession): number {
  const executionExpiresAt = decodeJwtExpirationMs(session.tokens.executionToken);
  const uploadExpiresAt = decodeJwtExpirationMs(session.tokens.uploadToken) ?? executionExpiresAt;
  if (!executionExpiresAt) {
    return 6 * 60 * 60 * 1000;
  }
  const minExpiresAt = Math.min(executionExpiresAt, uploadExpiresAt!);
  const now = Date.now();
  const refreshAt = minExpiresAt - (15 * 60 * 1000);
  return Math.max(60_000, refreshAt - now);
}

function shouldRefreshBeforeStartingLoop(session: SavedConnectionSession): boolean {
  const executionExpiresAt = decodeJwtExpirationMs(session.tokens.executionToken);
  const uploadExpiresAt = decodeJwtExpirationMs(session.tokens.uploadToken) ?? executionExpiresAt;
  if (!executionExpiresAt) return true;
  const minExpiresAt = Math.min(executionExpiresAt, uploadExpiresAt!);
  return minExpiresAt - Date.now() <= 2 * 60 * 1000;
}

function shouldClearSavedConnectionAfterRefreshError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "revoked",
    "reuse",
    "replay",
    "expired refresh",
    "refresh token is invalid",
    "refresh token is missing worker binding",
    "does not include a refresh token",
    "device proof",
    "wrong device",
  ].some((marker) => normalized.includes(marker));
}

const runtimeRequirements = [
  "WSL2 host responds to wsl.exe --status on Windows",
  "Prepare checks the latest Smart AI Hub runtime manifest and updates the WSL root when HyperFrames changes",
  "Managed WSL runtime root contains Node 22+ and the HyperFrames render script",
  "Linux Chrome Headless Shell plus FFmpeg and ffprobe are executable in WSL",
  "Chrome shared libraries, fontconfig, and Noto/Liberation fonts are resolved inside WSL",
];

function App() {
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [doctor, setDoctor] = useState<DoctorSummary>(fallbackDoctor);
  const [executor, setExecutor] = useState<ExecutorState>(fallbackExecutor);
  const [connectionState, setConnectionState] = useState<"not_connected" | "pending" | "connected" | "error">("not_connected");
  const [connectSession, setConnectSession] = useState<WorkerConnectSession | null>(null);
  const [connectedWorker, setConnectedWorker] = useState<WorkerConnectPollResponse["worker"]>(null);
  const [connectMessage, setConnectMessage] = useState("");
  const [runtimeInstallMessage, setRuntimeInstallMessage] = useState("");
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [savedConnection, setSavedConnection] = useState<SavedConnectionSession | null>(null);
  const [loopStatus, setLoopStatus] = useState<WorkerLoopStatus>(fallbackLoopStatus);
  const [appVersion, setAppVersion] = useState("");
  const [localRunning, setLocalRunning] = useState(false);
  const [localResult, setLocalResult] = useState<string | null>(null);
  const connectionStateRef = useRef(connectionState);
  const loopStartingRef = useRef(false);
  const liveLogRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  async function refresh(options: { updateConnectionMessage?: boolean; fullDoctor?: boolean } = {}) {
    const updateConnectionMessage = options.updateConnectionMessage ?? true;
    const doctorCommand = options.fullDoctor || loopStatus.running ? "worker_app_run_full_doctor" : "worker_app_run_doctor";
    const restoredConnectionResult = invoke<SavedConnectionSession | null>("worker_app_get_saved_connection")
      .then((connection) => ({ connection, error: null as string | null }))
      .catch((error) => ({ connection: null, error: formatInvokeError(error) }));
    const [nextSettings, nextDoctor, nextExecutor, nextLoopStatus, restoredConnection] = await Promise.all([
      safeInvoke<Settings>("worker_app_get_settings", fallbackSettings),
      safeInvoke<DoctorSummary>(doctorCommand, fallbackDoctor),
      safeInvoke<ExecutorState>("worker_app_get_executor_state", fallbackExecutor),
      safeInvoke<WorkerLoopStatus>("worker_app_get_worker_loop_status", fallbackLoopStatus),
      restoredConnectionResult,
    ]);
    setSettings(nextSettings);
    setDoctor(nextDoctor);
    setExecutor(nextExecutor);
    setLoopStatus(nextLoopStatus);

    if (restoredConnection.error) {
      setSavedConnection(null);
      setConnectedWorker(null);
      if (updateConnectionMessage) {
        setConnectionState("error");
        setConnectMessage(`Unable to restore saved Worker App connection: ${restoredConnection.error}`);
      }
      return;
    }

    setSavedConnection(restoredConnection.connection);
    setConnectedWorker(restoredConnection.connection?.worker ?? null);
    if (restoredConnection.connection) {
      setConnectionState("connected");
      if (updateConnectionMessage) {
        setConnectMessage("Restored saved Worker App connection. Access tokens will refresh automatically.");
      }
    } else if (connectionStateRef.current !== "pending") {
      setConnectionState("not_connected");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const intervalMs = loopStatus.running ? 2_000 : 10_000;
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

  const readinessLabel = useMemo(() => {
    if (doctor.status === "ready") return "Ready for render jobs";
    if (doctor.status === "degraded") return "Needs attention";
    return "Runtime blocked";
  }, [doctor.status]);

  const doctorCheckById = useMemo(() => {
    return new Map(doctor.checks.map((check) => [check.id, check]));
  }, [doctor.checks]);

  const readinessSummaryItems = useMemo(
    () => [
      {
        id: "wsl2",
        label: "WSL2 readiness",
        check:
          doctorCheckById.get("wsl2_browser_dependencies") ??
          doctorCheckById.get("wsl2_host") ??
          doctorCheckById.get("wsl2_runtime_profile"),
      },
      {
        id: "runtime",
        label: "Managed runtime",
        check: (() => {
          const checks = [
            doctorCheckById.get("managed_wsl_runtime"),
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
        check: doctorCheckById.get("installer_set") ?? doctorCheckById.get("runtime_signature_bundle"),
      },
    ],
    [doctorCheckById],
  );

  const startLoopDisabled = !savedConnection || loopStatus.running || connectionState === "pending";
  const stopLoopDisabled = !loopStatus.running;
  const terminalText = renderTerminalText(executor);
  const startLoopLabel = loopStatus.running
    ? "Loop already running"
    : savedConnection
      ? "Start worker loop"
      : connectionState === "pending"
        ? "Waiting for approval"
        : "Connect before starting";
  const stopLoopLabel = loopStatus.running ? "Stop loop" : "Loop already stopped";

  const saveSettings = async (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    const saved = await safeInvoke<Settings>("worker_app_save_settings", nextSettings, {
      settings: nextSettings,
    });
    setSettings(saved);
    if (Object.prototype.hasOwnProperty.call(patch, "startWithWindows")) {
      let startup: { message: string };
      try {
        startup = await invoke<{ message: string }>("worker_app_configure_startup", {
          enabled: Boolean(patch.startWithWindows),
        });
      } catch (error) {
        startup = { message: error instanceof Error ? error.message : String(error) };
      }
      setConnectMessage(startup.message);
    }
  };

  const connect = async () => {
    setConnectionState("pending");
    setConnectMessage("Opening browser approval...");
    setConnectedWorker(null);
    try {
      const session = await invoke<WorkerConnectSession>("worker_app_start_connect_session");
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
        const result = await invoke<WorkerConnectPollResponse>("worker_app_poll_connect_session", {
          deviceCode: connectSession!.deviceCode,
        });
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
          setConnectMessage("Connected. This app can now receive worker jobs.");
          return;
        }
        if (result.status === "expired" || result.status === "denied" || result.status === "error") {
          setConnectionState("error");
          setConnectMessage(result.errorMessage || `Connection ${result.status}. Start Connect again.`);
          return;
        }
        setConnectMessage("Waiting for browser approval...");
      } catch (error) {
        if (!cancelled) {
          setConnectionState("error");
          setConnectMessage(error instanceof Error ? error.message : String(error));
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

  const startLoop = async (session: SavedConnectionSession | null = savedConnection) => {
    if (loopStartingRef.current) return;
    let activeSession = session;
    if (!activeSession) {
      setConnectMessage("Connect this Worker App before starting the worker loop.");
      return;
    }
    loopStartingRef.current = true;
    try {
      if (shouldRefreshBeforeStartingLoop(activeSession)) {
        setConnectMessage("Refreshing Worker App access before starting the loop...");
        activeSession = await invoke<SavedConnectionSession>("worker_app_refresh_saved_connection");
        setSavedConnection(activeSession);
        setConnectedWorker(activeSession.worker);
      }
      const status = await invoke<WorkerLoopStatus>("worker_app_start_worker_loop", {
        request: {
          serverUrl: activeSession.serverUrl,
          workerId: activeSession.worker.id,
          workerLabel: activeSession.worker.displayName,
          executionToken: activeSession.tokens.executionToken,
          uploadToken: activeSession.tokens.uploadToken,
        },
      });
      setLoopStatus(status);
      setConnectMessage(status.message);
      void refresh({ fullDoctor: status.running });
    } catch (error) {
      setLoopStatus({ running: false, mode: "manual", message: String(error) });
      setConnectionState("error");
      setConnectMessage(formatInvokeError(error));
    } finally {
      loopStartingRef.current = false;
    }
  };

  const stopLoop = async () => {
    const status = await safeInvoke<WorkerLoopStatus>("worker_app_stop_worker_loop", fallbackLoopStatus);
    setLoopStatus(status);
    setConnectMessage(status.message);
    void refresh();
  };

  const runLocalCommand = async () => {
    if (!executor.manualCommand) return;
    setLocalRunning(true);
    setLocalResult("Running local render... Please wait. This may take several minutes.");
    try {
      const result = await invoke<string>("worker_app_run_manual_command", { command: executor.manualCommand });
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
      const result = await invoke<string>("worker_app_run_manual_command", { command: executor.previewCommand });
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
      const nextDoctor = await safeInvoke<DoctorSummary>("worker_app_run_full_doctor", fallbackDoctor);
      setDoctor(nextDoctor);
    } finally {
      setDoctorRunning(false);
    }
  };

  useEffect(() => {
    if (connectionState !== "connected" || !savedConnection) return;
    void startLoop(savedConnection);
  }, [connectionState, savedConnection?.tokens.executionToken, savedConnection?.tokens.uploadToken]);

  useEffect(() => {
    if (connectionState !== "connected" || !savedConnection?.tokens.refreshToken) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextSession = await invoke<SavedConnectionSession>("worker_app_refresh_saved_connection");
        if (cancelled) return;
        setSavedConnection(nextSession);
        setConnectedWorker(nextSession.worker);
        setConnectionState("connected");
        setConnectMessage("Connected. Access renewed automatically.");
      } catch (error) {
        if (cancelled) return;
        const message = formatInvokeError(error);
        if (shouldClearSavedConnectionAfterRefreshError(message)) {
          await safeInvoke<void>("worker_app_clear_saved_connection", undefined);
          setSavedConnection(null);
          setConnectedWorker(null);
        }
        setConnectionState("error");
        setConnectMessage(`${message}. Reconnect this Worker App if browser approval was revoked or expired.`);
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
          {appVersion ? <p className="app-version">Version {appVersion}</p> : null}
          <p className="subtle">
            Connect in your browser, verify the render runtime, then let this app process jobs in
            the background.
          </p>
        </div>
        <div className={`readiness-pill ${doctor.status}`}>{readinessLabel}</div>
      </section>

      <section className="dashboard-grid">
        <article className="panel connect-panel">
          <div className="panel-heading">
            <p className="eyebrow">Connection</p>
            <h2>Connect to Smart AI Hub</h2>
          </div>
          <p className="subtle">
            Approval opens in your browser. This app never asks for a username, password, API key,
            manual token, cookie, or pasted credential.
          </p>
          {connectedWorker ? (
            <p className="connection-summary">
              Connected worker: <strong>{connectedWorker.displayName}</strong>
            </p>
          ) : null}
          {savedConnection?.lastRefreshedAt ? (
            <p className="subtle">Last token refresh: {new Date(savedConnection.lastRefreshedAt).toLocaleString()}</p>
          ) : null}
          {connectSession && connectionState === "pending" ? (
            <div className="connect-code-box">
              <span>Browser code</span>
              <strong>{connectSession.userCode}</strong>
              <a href={connectSession.verificationUriComplete}>{connectSession.verificationUriComplete}</a>
            </div>
          ) : null}
          {connectMessage ? <p className={`connect-message ${connectionState}`}>{connectMessage}</p> : null}
          <button type="button" className="primary-button" onClick={connect}>
            {connectionState === "pending"
              ? "Waiting for browser approval"
              : connectionState === "connected"
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

        <article className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Current job</p>
            <h2>{executor.currentJobLabel || "No active job"}</h2>
          </div>
          <div className="queue-summary" aria-label="Worker queue summary">
            <div>
              <span>Waiting queue</span>
              <strong>{executor.queueDepth}</strong>
            </div>
            <div>
              <span>Active render</span>
              <strong>{executor.currentJobId ? "Running" : "None"}</strong>
            </div>
          </div>
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
          <p className={`loop-badge ${loopStatus.running ? "running" : "stopped"}`}>
            {loopStatus.running ? "Loop running" : "Loop stopped"} · {loopStatus.mode}
          </p>
          <div className="progress-track" aria-label="Current job progress">
            <span style={{ width: `${executor.progressPercent}%` }} />
          </div>
          {!executor.currentJobId ? <p className="subtle">{executor.lastMessage}</p> : null}
          
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
                <p style={{ fontWeight: "bold", marginBottom: "4px" }}>Render Command:</p>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
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
                    onClick={() => navigator.clipboard.writeText(executor.manualCommand!)}
                    title="Copy command to clipboard"
                  >
                    Copy
                  </button>
                </div>
                <pre className="manual-command-text">{executor.manualCommand}</pre>
              </div>

              {executor.previewCommand ? (
                <div style={{ marginTop: "16px" }}>
                  <p style={{ fontWeight: "bold", marginBottom: "4px" }}>Preview Command:</p>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
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
                      onClick={() => navigator.clipboard.writeText(executor.previewCommand!)}
                      title="Copy preview command to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="manual-command-text">{executor.previewCommand}</pre>
                </div>
              ) : null}
            </div>
          ) : null}

          {executor.lastCompletedJob ? (
            <div className={`last-job-summary ${executor.lastCompletedJob.status}`}>
              <div className="panel-heading">
                <p className="eyebrow">Last job</p>
                <h3>{executor.lastCompletedJob.jobLabel}</h3>
              </div>
              <p className="subtle">Project: {executor.lastCompletedJob.projectName || "Unknown"}</p>
              <p className="last-job-status">
                Status: <strong>{executor.lastCompletedJob.status.toUpperCase()}</strong> - {executor.lastCompletedJob.message}
              </p>
              {executor.lastCompletedJob.logPath ? (
                <button
                  type="button"
                  className="secondary-button small"
                  onClick={() => invoke("worker_app_open_file", { path: executor.lastCompletedJob!.logPath })}
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
              <h2>Runtime doctor</h2>
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
                <span className={`status-dot ${item.check?.status ?? "warn"}`} />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.check?.message ?? "Run checks to verify this requirement."}</p>
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
              <strong className="runtime-help-subheading">Complete managed WSL install set</strong>
              <ul>
                {runtimeRequirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="subtle">
                Managed WSL is the default render path. The Worker App runs directly from the WSL runtime root and reports
                the real missing file, executable, or shared library instead of falling back to the legacy runtime path.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  try {
                    const message = await invoke<string>("worker_app_open_managed_wsl_runtime_setup");
                    setRuntimeInstallMessage(message);
                  } catch (err) {
                    setRuntimeInstallMessage("Failed to open managed WSL setup: " + err);
                  }
                }}
              >
                Prepare managed WSL runtime
              </button>
              {runtimeInstallMessage ? (
                <p className="connect-message">{runtimeInstallMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="runtime-help">
              <p className="subtle">
                Managed WSL runtime is ready. Render jobs will run from the configured WSL runtime root.
              </p>
              {runtimeInstallMessage ? (
                <p className="connect-message">{runtimeInstallMessage}</p>
              ) : null}
            </div>
          )}
        </article>

        <article className="panel wide settings-panel">
          <div className="panel-heading">
            <p className="eyebrow">Settings</p>
            <h2>Worker preferences</h2>
          </div>
          <div className="settings-grid">
            <label>
              Server URL preset
              <select
                value={settings.serverUrl}
                onChange={(event) => void saveSettings({ serverUrl: event.target.value })}
              >
                <option value={SMART_AI_HUB_CLOUD_URL}>Smart AI Hub Cloud</option>
                <option value="http://localhost:5000">Local development</option>
              </select>
            </label>
            <label>
              Worker label
              <input
                value={settings.workerLabel}
                onChange={(event) => void saveSettings({ workerLabel: event.target.value })}
              />
            </label>
            <label>
              Sharing mode
              <select
                value={settings.sharingMode}
                onChange={(event) =>
                  void saveSettings({ sharingMode: event.target.value as Settings["sharingMode"] })
                }
              >
                <option value="private">Private</option>
                <option value="group">Group shared</option>
                <option value="tenant">Tenant shared</option>
              </select>
              <span className="field-help">
                Private picks only your own jobs. Group shared follows the allowed groups configured on the web settings page.
              </span>
            </label>
            <label>
              Max concurrent jobs
              <input
                type="number"
                min={1}
                max={4}
                value={settings.maxConcurrentJobs}
                onChange={(event) => void saveSettings({ maxConcurrentJobs: Number(event.target.value) })}
              />
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.acceptJobs}
                onChange={(event) => void saveSettings({ acceptJobs: event.target.checked })}
              />
              Accept jobs immediately
            </label>
            <p className="field-help">
              Queue pickup defaults to on. If you pause it, reconnect this worker so the server-side claim policy sees the latest state.
            </p>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.minimizeToTray}
                onChange={(event) => void saveSettings({ minimizeToTray: event.target.checked })}
              />
              Minimize to tray
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.startWithWindows}
                onChange={(event) => void saveSettings({ startWithWindows: event.target.checked })}
              />
              Start with Windows sign-in
            </label>
            <label>
              Managed WSL runtime root
              <input
                type="text"
                value={settings.managedWslRoot}
                onChange={(event) => void saveSettings({ managedWslRoot: event.target.value })}
              />
              <span className="field-help">
                This folder lives inside WSL, for example ~/.smartaihub-worker/runtime. The setup terminal installs Node, HyperFrames, Chrome, FFmpeg, and Linux dependencies into this root.
              </span>
            </label>
            <label>
              Managed WSL workspace root
              <input
                type="text"
                placeholder="Auto: sibling workspace next to the runtime root"
                value={settings.managedWslWorkspaceRoot}
                onChange={(event) => void saveSettings({ managedWslWorkspaceRoot: event.target.value })}
              />
              <span className="field-help">
                Render jobs are staged here inside WSL before running. Keep this on the Linux filesystem or on the same drive as your managed WSL runtime; avoid /mnt/c for large video jobs.
              </span>
            </label>
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  try {
                    const message = await invoke<string>("worker_app_open_managed_wsl_runtime_setup");
                    setRuntimeInstallMessage(message);
                  } catch (err) {
                    setRuntimeInstallMessage("Failed to open managed WSL setup: " + err);
                  }
                }}
              >
                Prepare managed WSL runtime
              </button>
            </div>
            <p className="field-help">
              This is Windows user-login autostart, not a Windows service. Service mode is not
              installed in this build and will not be shown as ready.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
