import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

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

const fallbackSettings: Settings = {
  serverUrl: "https://app.smartaihub.com",
  workerLabel: "My render worker",
  acceptJobs: false,
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
  recommendedActions: ["Download render runtime"],
};

const fallbackExecutor: ExecutorState = {
  acceptingJobs: false,
  currentJobId: null,
  currentJobLabel: null,
  progressPercent: 0,
  status: "idle",
  lastMessage: "Idle. Connect and pass readiness checks to accept jobs.",
};

async function safeInvoke<T>(command: string, fallback: T): Promise<T> {
  try {
    return await invoke<T>(command);
  } catch {
    return fallback;
  }
}

function App() {
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [doctor, setDoctor] = useState<DoctorSummary>(fallbackDoctor);
  const [executor, setExecutor] = useState<ExecutorState>(fallbackExecutor);
  const [connectionState, setConnectionState] = useState<"not_connected" | "pending" | "connected">(
    "not_connected",
  );

  async function refresh() {
    const [nextSettings, nextDoctor, nextExecutor] = await Promise.all([
      safeInvoke<Settings>("worker_app_get_settings", fallbackSettings),
      safeInvoke<DoctorSummary>("worker_app_run_doctor", fallbackDoctor),
      safeInvoke<ExecutorState>("worker_app_get_executor_state", fallbackExecutor),
    ]);
    setSettings(nextSettings);
    setDoctor(nextDoctor);
    setExecutor(nextExecutor);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const readinessLabel = useMemo(() => {
    if (doctor.status === "ready") return "Ready for render jobs";
    if (doctor.status === "degraded") return "Needs attention";
    return "Runtime blocked";
  }, [doctor.status]);

  const saveSettings = async (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    const saved = await safeInvoke<Settings>("worker_app_save_settings", nextSettings);
    setSettings(saved);
  };

  const connect = async () => {
    setConnectionState("pending");
    await safeInvoke("worker_app_start_connect", null);
  };

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
          <button type="button" className="primary-button" onClick={connect}>
            {connectionState === "pending" ? "Waiting for browser approval" : "Connect to Smart AI Hub"}
          </button>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <p className="eyebrow">Current job</p>
            <h2>{executor.currentJobLabel || "No active job"}</h2>
          </div>
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
            <button type="button" className="secondary-button" onClick={refresh}>
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
            <button type="button" className="secondary-button">
              Download render runtime
            </button>
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
                <option value="https://app.smartaihub.com">Smart AI Hub Cloud</option>
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
              Accept jobs
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.minimizeToTray}
                onChange={(event) => void saveSettings({ minimizeToTray: event.target.checked })}
              />
              Minimize to tray
            </label>
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
