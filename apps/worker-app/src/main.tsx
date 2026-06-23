import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
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
};

type ExecutorState = {
  acceptingJobs: boolean;
  currentJobId?: string | null;
  currentJobLabel?: string | null;
  progressPercent: number;
  status: "idle" | "polling" | "running" | "paused" | "error";
  lastMessage: string;
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

type RuntimeInstallResult = {
  status: "installed" | "blocked" | "error";
  message: string;
  doctor: DoctorSummary;
  manifest?: Record<string, unknown> | null;
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
};

const fallbackDoctor: DoctorSummary = {
  status: "blocked",
  checks: [
    {
      id: "runtime_manifest",
      status: "error",
      message: "Render runtime is not installed.",
      detailsJson: {},
    },
  ],
  recommendedActions: ["Install official HyperFrames runtime pack"],
};

const fallbackExecutor: ExecutorState = {
  acceptingJobs: false,
  currentJobId: null,
  currentJobLabel: null,
  progressPercent: 0,
  status: "idle",
  lastMessage: "Idle. Connect and pass readiness checks to accept jobs.",
};

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
  if (!executionExpiresAt) {
    return 6 * 60 * 60 * 1000;
  }
  const now = Date.now();
  const refreshAt = executionExpiresAt - (15 * 60 * 1000);
  return Math.max(60_000, refreshAt - now);
}

function shouldRefreshBeforeStartingLoop(session: SavedConnectionSession): boolean {
  const executionExpiresAt = decodeJwtExpirationMs(session.tokens.executionToken);
  if (!executionExpiresAt) return true;
  return executionExpiresAt - Date.now() <= 2 * 60 * 1000;
}

const runtimeRequirements = [
  "Official HyperFrames sidecar for this Worker App build",
  "Managed browser runtime for CSS/HTML render parity",
  "FFmpeg and ffprobe binaries",
  "Thai font pack for subtitle and overlay output",
  "Writable workspace folder for staging and uploads",
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
  const [runtimeInstalling, setRuntimeInstalling] = useState(false);
  const [savedConnection, setSavedConnection] = useState<SavedConnectionSession | null>(null);
  const [loopStatus, setLoopStatus] = useState<WorkerLoopStatus>(fallbackLoopStatus);

  async function refresh(options: { updateConnectionMessage?: boolean } = {}) {
    const updateConnectionMessage = options.updateConnectionMessage ?? true;
    const [nextSettings, nextDoctor, nextExecutor, nextLoopStatus, restoredConnection] = await Promise.all([
      safeInvoke<Settings>("worker_app_get_settings", fallbackSettings),
      safeInvoke<DoctorSummary>("worker_app_run_doctor", fallbackDoctor),
      safeInvoke<ExecutorState>("worker_app_get_executor_state", fallbackExecutor),
      safeInvoke<WorkerLoopStatus>("worker_app_get_worker_loop_status", fallbackLoopStatus),
      safeInvoke<SavedConnectionSession | null>("worker_app_get_saved_connection", null),
    ]);
    setSettings(nextSettings);
    setDoctor(nextDoctor);
    setExecutor(nextExecutor);
    setLoopStatus(nextLoopStatus);
    setSavedConnection(restoredConnection);
    setConnectedWorker(restoredConnection?.worker ?? null);
    if (restoredConnection) {
      setConnectionState("connected");
      if (updateConnectionMessage) {
        setConnectMessage("Connected. Access tokens will refresh automatically.");
      }
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

  const readinessLabel = useMemo(() => {
    if (doctor.status === "ready") return "Ready for render jobs";
    if (doctor.status === "degraded") return "Needs attention";
    return "Runtime blocked";
  }, [doctor.status]);

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
    let activeSession = session;
    if (!activeSession) {
      setConnectMessage("Connect this Worker App before starting the worker loop.");
      return;
    }
    try {
      if (shouldRefreshBeforeStartingLoop(activeSession)) {
        setConnectMessage("Refreshing Worker App access before starting the loop...");
        activeSession = await invoke<SavedConnectionSession>("worker_app_refresh_saved_connection");
        setSavedConnection(activeSession);
        setConnectedWorker(activeSession.worker);
      }
      const status = await invoke<WorkerLoopStatus>("worker_app_start_saved_worker_loop");
      setLoopStatus(status);
      setConnectMessage(status.message);
      void refresh();
    } catch (error) {
      setLoopStatus({ running: false, mode: "manual", message: String(error) });
      setConnectMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const stopLoop = async () => {
    const status = await safeInvoke<WorkerLoopStatus>("worker_app_stop_worker_loop", fallbackLoopStatus);
    setLoopStatus(status);
    setConnectMessage(status.message);
    void refresh();
  };

  const installRuntime = async () => {
    setRuntimeInstalling(true);
    setRuntimeInstallMessage("Checking Smart AI Hub runtime release...");
    try {
      const result = await invoke<RuntimeInstallResult>("worker_app_install_runtime_pack");
      setDoctor(result.doctor);
      setRuntimeInstallMessage(result.message);
      if (result.status === "installed") {
        void refresh();
      }
    } catch (error) {
      setRuntimeInstallMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeInstalling(false);
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
        setConnectMessage("Connected. Access renewed automatically.");
      } catch (error) {
        if (cancelled) return;
        await safeInvoke<void>("worker_app_clear_saved_connection", undefined);
        setSavedConnection(null);
        setConnectedWorker(null);
        setConnectionState("error");
        setConnectMessage(error instanceof Error ? error.message : "Connection expired. Start Connect again.");
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
            <button type="button" className="secondary-button" onClick={() => void startLoop()}>
              Start worker loop
            </button>
            <button type="button" className="secondary-button" onClick={() => void stopLoop()}>
              Stop loop
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Current job</p>
            <h2>{executor.currentJobLabel || "No active job"}</h2>
          </div>
          <p className={`loop-badge ${loopStatus.running ? "running" : "stopped"}`}>
            {loopStatus.running ? "Loop running" : "Loop stopped"} · {loopStatus.mode}
          </p>
          <div className="progress-track" aria-label="Current job progress">
            <span style={{ width: `${executor.progressPercent}%` }} />
          </div>
          <p className="subtle">{executor.lastMessage}</p>
        </article>

        <article className="panel wide">
          <div className="panel-heading inline">
            <div>
              <p className="eyebrow">Readiness</p>
              <h2>Runtime doctor</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refresh()}>
              Run checks
            </button>
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
              <strong>Required for HyperFrames jobs</strong>
              <ul>
                {runtimeRequirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="subtle">
                The Worker App downloads the official pack from Smart AI Hub, verifies its
                checksum, installs it locally, then re-runs readiness checks. It will not claim
                render jobs until the installed pack is allowed and complete.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void installRuntime()}
                disabled={runtimeInstalling}
              >
                {runtimeInstalling ? "Installing runtime..." : "Download render runtime"}
              </button>
              {runtimeInstallMessage ? (
                <p className="connect-message">{runtimeInstallMessage}</p>
              ) : null}
            </div>
          ) : null}
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
