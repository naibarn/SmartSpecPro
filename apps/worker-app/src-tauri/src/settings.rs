use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const DEFAULT_SERVER_URL: &str = "https://smartaihub.app";
const SETTINGS_FILE_NAME: &str = "worker-settings.json";
const DEFAULT_MANAGED_WSL_ROOT: &str = "~/.smartaihub-worker/runtime";
const DEFAULT_MANAGED_WSL_WORKSPACE_ROOT: &str = "";
const DEFAULT_COMFYUI_BASE_URL: &str = "http://127.0.0.1:8188";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SharingMode {
    Private,
    Group,
    Tenant,
}

impl Default for SharingMode {
    fn default() -> Self {
        Self::Private
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeChannel {
    Stable,
    Preview,
}

impl Default for RuntimeChannel {
    fn default() -> Self {
        Self::Stable
    }
}

impl RuntimeChannel {
    pub fn as_query_value(&self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Preview => "preview",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEnvironment {
    RuntimePack,
    ManagedWsl,
}

impl Default for RuntimeEnvironment {
    fn default() -> Self {
        if cfg!(target_os = "windows") {
            Self::ManagedWsl
        } else {
            Self::RuntimePack
        }
    }
}

impl RuntimeEnvironment {
    pub fn is_managed_wsl(&self) -> bool {
        matches!(self, Self::ManagedWsl)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticsLevel {
    Errors,
    Standard,
    Verbose,
}

impl Default for DiagnosticsLevel {
    fn default() -> Self {
        Self::Standard
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAppSettings {
    #[serde(default = "default_locale")]
    pub locale: String,
    pub server_url: String,
    pub worker_label: String,
    pub accept_jobs: bool,
    pub sharing_mode: SharingMode,
    pub start_with_windows: bool,
    pub minimize_to_tray: bool,
    pub max_concurrent_jobs: u8,
    pub workspace_dir: String,
    pub runtime_channel: RuntimeChannel,
    pub runtime_version: String,
    #[serde(default)]
    pub render_update_blocked: bool,
    pub diagnostics_level: DiagnosticsLevel,
    pub use_wsl2: bool,
    pub runtime_dir: String,
    #[serde(default)]
    pub runtime_environment: RuntimeEnvironment,
    #[serde(default = "default_managed_wsl_root")]
    pub managed_wsl_root: String,
    #[serde(default = "default_managed_wsl_workspace_root")]
    pub managed_wsl_workspace_root: String,
    /// When enabled, the worker probes the registered loopback ComfyUI
    /// service and advertises typed image/workflow capabilities only while it
    /// is reachable. No remote URL is accepted here.
    #[serde(default = "default_comfyui_enabled")]
    pub comfyui_enabled: bool,
    #[serde(default = "default_comfyui_base_url")]
    pub comfyui_base_url: String,
    #[serde(default = "default_comfyui_mcp_enabled")]
    pub comfyui_mcp_enabled: bool,
    #[serde(default = "default_comfyui_mcp_command")]
    pub comfyui_mcp_command: String,
}

impl Default for WorkerAppSettings {
    fn default() -> Self {
        Self {
            locale: default_locale(),
            server_url: DEFAULT_SERVER_URL.into(),
            worker_label: "My render worker".into(),
            accept_jobs: true,
            sharing_mode: SharingMode::Private,
            start_with_windows: false,
            minimize_to_tray: true,
            max_concurrent_jobs: 1,
            workspace_dir: String::new(),
            runtime_channel: RuntimeChannel::Stable,
            runtime_version: "not-installed".into(),
            render_update_blocked: false,
            diagnostics_level: DiagnosticsLevel::Standard,
            use_wsl2: cfg!(target_os = "windows"),
            runtime_dir: String::new(),
            runtime_environment: RuntimeEnvironment::default(),
            managed_wsl_root: default_managed_wsl_root(),
            managed_wsl_workspace_root: default_managed_wsl_workspace_root(),
            comfyui_enabled: true,
            comfyui_base_url: default_comfyui_base_url(),
            comfyui_mcp_enabled: true,
            comfyui_mcp_command: default_comfyui_mcp_command(),
        }
    }
}

impl WorkerAppSettings {
    pub fn normalized_server_url(&self) -> String {
        self.server_url.trim().trim_end_matches('/').to_string()
    }

    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.locale.as_str(), "th" | "en") {
            return Err("locale must be th or en".into());
        }
        let server_url = self.normalized_server_url();
        if !(server_url.starts_with("https://") || server_url.starts_with("http://localhost")) {
            return Err("server_url must use https or localhost development".into());
        }
        if self.worker_label.trim().is_empty() {
            return Err("worker_label is required".into());
        }
        if !(1..=4).contains(&self.max_concurrent_jobs) {
            return Err("max_concurrent_jobs must be between 1 and 4".into());
        }
        if self.comfyui_enabled && !is_loopback_http_url(&self.comfyui_base_url) {
            return Err("comfyui_base_url must be an http loopback URL".into());
        }
        if (self.use_wsl2 || self.runtime_environment.is_managed_wsl())
            && !cfg!(target_os = "windows")
        {
            return Err(
                "WSL2 runtime is supported only by the Windows Worker App; use the native runtime pack on this host".into(),
            );
        }
        if cfg!(target_os = "macos") && (self.use_wsl2 || self.runtime_environment.is_managed_wsl())
        {
            return Err(
                "macOS Worker App only supports the native hyperframes-macos-arm64 runtime; WSL2 is unavailable".into(),
            );
        }
        Ok(())
    }

    pub fn uses_wsl2_runtime(&self) -> bool {
        !cfg!(target_os = "macos") && (self.use_wsl2 || self.runtime_environment.is_managed_wsl())
    }

    pub fn hyperframes_runtime_id(&self) -> &'static str {
        if cfg!(target_os = "macos") {
            "hyperframes-macos-arm64"
        } else if self.uses_wsl2_runtime() {
            "hyperframes-wsl2"
        } else {
            "hyperframes-windows-x64"
        }
    }
}

fn default_managed_wsl_root() -> String {
    DEFAULT_MANAGED_WSL_ROOT.into()
}

fn default_locale() -> String {
    "en".into()
}

fn default_managed_wsl_workspace_root() -> String {
    DEFAULT_MANAGED_WSL_WORKSPACE_ROOT.into()
}

fn default_comfyui_enabled() -> bool {
    true
}

fn default_comfyui_base_url() -> String {
    DEFAULT_COMFYUI_BASE_URL.into()
}

fn default_comfyui_mcp_enabled() -> bool {
    true
}

fn default_comfyui_mcp_command() -> String {
    crate::comfy_mcp_runtime::STANDARD_COMMAND.into()
}

fn is_loopback_http_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value.trim()) else {
        return false;
    };
    matches!(url.scheme(), "http")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && matches!(
            url.host_str(),
            Some("127.0.0.1") | Some("localhost") | Some("[::1]") | Some("::1")
        )
}

pub fn load_settings(app_data_dir: &Path) -> WorkerAppSettings {
    let path = app_data_dir.join(SETTINGS_FILE_NAME);
    let Ok(contents) = fs::read_to_string(path) else {
        return WorkerAppSettings::default();
    };
    let Ok(mut settings) = serde_json::from_str::<WorkerAppSettings>(&contents) else {
        return WorkerAppSettings::default();
    };
    settings.server_url = settings.normalized_server_url();
    settings.locale = if settings.locale == "th" {
        "th".into()
    } else {
        "en".into()
    };
    // Older builds wrote the pre-standard command names. Keep existing
    // settings usable while making every newly persisted setting canonical.
    settings.comfyui_mcp_command = crate::comfy_mcp_runtime::normalize_command(
        &settings.comfyui_mcp_command,
    );
    if cfg!(target_os = "macos") {
        // A settings file copied from Windows must not make a Mac attempt WSL2.
        settings.runtime_environment = RuntimeEnvironment::RuntimePack;
        settings.use_wsl2 = false;
    } else if cfg!(target_os = "windows") {
        settings.runtime_environment = RuntimeEnvironment::ManagedWsl;
        settings.use_wsl2 = true;
    } else {
        settings.runtime_environment = RuntimeEnvironment::RuntimePack;
        settings.use_wsl2 = false;
    }
    if settings.validate().is_err() {
        return WorkerAppSettings::default();
    }
    settings
}

pub fn save_settings(app_data_dir: &Path, settings: &WorkerAppSettings) -> Result<(), String> {
    settings.validate()?;
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create settings directory: {error}"))?;
    let path = app_data_dir.join(SETTINGS_FILE_NAME);
    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("failed to serialize settings: {error}"))?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, contents).map_err(|error| format!("failed to save settings: {error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("failed to commit settings: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_do_not_serialize_credentials() {
        let value = serde_json::to_value(WorkerAppSettings::default()).unwrap();
        let serialized = value.to_string();

        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("apiKey"));
        assert!(serialized.contains("serverUrl"));
    }

    #[test]
    fn local_comfy_mcp_defaults_to_the_standard_command() {
        assert_eq!(WorkerAppSettings::default().comfyui_mcp_command, "comfy-mcp");
    }

    #[test]
    fn rejects_non_https_non_localhost_server_urls() {
        let mut settings = WorkerAppSettings::default();
        settings.server_url = "http://example.com".into();

        assert!(settings.validate().is_err());
    }

    #[test]
    fn accepts_only_exact_loopback_comfyui_urls() {
        assert!(is_loopback_http_url("http://127.0.0.1:8188"));
        assert!(is_loopback_http_url("http://[::1]:8188/"));
        assert!(!is_loopback_http_url("http://127.0.0.1:8188@evil.test"));
        assert!(!is_loopback_http_url("http://localhost.evil.test:8188"));
        assert!(!is_loopback_http_url("https://127.0.0.1:8188"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn rejects_managed_wsl_runtime_on_non_windows_hosts() {
        let mut settings = WorkerAppSettings::default();
        settings.runtime_environment = RuntimeEnvironment::ManagedWsl;

        assert!(settings.validate().is_err());
    }

    #[test]
    fn settings_round_trip_to_app_data_file() {
        let temp = tempfile::tempdir().unwrap();
        let mut settings = WorkerAppSettings::default();
        settings.worker_label = "Office GPU worker".into();
        settings.accept_jobs = false;

        save_settings(temp.path(), &settings).unwrap();
        let loaded = load_settings(temp.path());

        assert_eq!(loaded.worker_label, "Office GPU worker");
        assert!(!loaded.accept_jobs);
    }

    #[test]
    fn old_settings_without_runtime_environment_still_load() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(
            temp.path().join(SETTINGS_FILE_NAME),
            r#"{
              "serverUrl": "https://smartaihub.app",
              "workerLabel": "Existing worker",
              "acceptJobs": true,
              "sharingMode": "private",
              "startWithWindows": false,
              "minimizeToTray": true,
              "maxConcurrentJobs": 1,
              "workspaceDir": "",
              "runtimeChannel": "stable",
              "runtimeVersion": "not-installed",
              "diagnosticsLevel": "standard",
              "useWsl2": true,
              "runtimeDir": ""
            }"#,
        )
        .unwrap();

        let loaded = load_settings(temp.path());

        assert_eq!(loaded.worker_label, "Existing worker");
        assert_eq!(
            loaded.runtime_environment,
            if cfg!(target_os = "windows") {
                RuntimeEnvironment::ManagedWsl
            } else {
                RuntimeEnvironment::RuntimePack
            }
        );
        assert_eq!(loaded.managed_wsl_root, "~/.smartaihub-worker/runtime");
        assert_eq!(loaded.managed_wsl_workspace_root, "");
    }
}
