use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const DEFAULT_SERVER_URL: &str = "https://smartaihub.app";
const SETTINGS_FILE_NAME: &str = "worker-settings.json";

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
    pub diagnostics_level: DiagnosticsLevel,
}

impl Default for WorkerAppSettings {
    fn default() -> Self {
        Self {
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
            diagnostics_level: DiagnosticsLevel::Standard,
        }
    }
}

impl WorkerAppSettings {
    pub fn normalized_server_url(&self) -> String {
        self.server_url.trim().trim_end_matches('/').to_string()
    }

    pub fn validate(&self) -> Result<(), String> {
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
        Ok(())
    }
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
    fs::write(path, contents).map_err(|error| format!("failed to save settings: {error}"))
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
    fn rejects_non_https_non_localhost_server_urls() {
        let mut settings = WorkerAppSettings::default();
        settings.server_url = "http://example.com".into();

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
}
