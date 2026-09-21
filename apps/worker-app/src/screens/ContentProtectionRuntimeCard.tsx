import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ContentProtectionRuntimeStatus = {
  status: "ready" | "blocked" | "not_installed" | string;
  message: string;
  runtimeId: string;
  version?: string | null;
  providerReady: boolean;
  workerRuntimeReady: boolean;
};

type InstallResult = {
  status: string;
  message: string;
  version?: string | null;
  providerReady: boolean;
};

export function ContentProtectionRuntimeCard() {
  const [runtime, setRuntime] = useState<ContentProtectionRuntimeStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<ContentProtectionRuntimeStatus>(
        "worker_app_get_content_protection_runtime_status",
      );
      setRuntime(next);
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = async (force: boolean) => {
    setInstalling(true);
    setMessage("Downloading optional Content Protection runtime...");
    setError("");
    try {
      const result = await invoke<InstallResult>(
        "worker_app_install_content_protection_runtime",
        { force },
      );
      setMessage(result.message);
      await refresh();
    } catch (reason) {
      setError(String(reason));
      setMessage("");
    } finally {
      setInstalling(false);
    }
  };

  const statusLabel = runtime?.status === "ready"
    ? "Ready"
    : runtime?.status === "unsupported"
      ? "Windows x64 only"
    : runtime?.status === "blocked"
      ? "Needs attention"
      : runtime?.status === "not_installed"
        ? "Not installed"
        : "Checking";

  return (
    <article className="panel wide" data-testid="content-protection-runtime-card">
      <div className="panel-heading inline">
        <div>
          <p className="eyebrow">Optional native capability</p>
          <h2>Content Protection runtime</h2>
        </div>
        <span className={`status-dot ${runtime?.status ?? "warn"}`} />
      </div>
      <p className="subtle">
        Installs the separate Windows x64 Content Protection native runtime.
        It is not included in the main Worker App installer, so the base
        installer size stays unchanged.
      </p>
      <div className="readiness-card">
        <div>
          <strong>{statusLabel}</strong>
          <p>{runtime?.message ?? "Checking optional runtime status..."}</p>
          {runtime?.version ? <p className="field-help">Version: {runtime.version}</p> : null}
        </div>
      </div>
      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          onClick={() => void install(runtime?.status === "ready")}
          disabled={installing || runtime?.status === "unsupported"}
          data-testid="content-protection-runtime-install"
        >
          {installing
            ? "Installing..."
            : runtime?.status === "ready"
              ? "Update / repair Content Protection runtime"
              : "Install Content Protection runtime"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={installing}
        >
          Check status
        </button>
      </div>
      {message ? <p className="connect-message">{message}</p> : null}
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
    </article>
  );
}
