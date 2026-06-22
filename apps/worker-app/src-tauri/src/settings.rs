use serde::{Deserialize, Serialize};

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
            server_url: "https://app.smartaihub.com".into(),
            worker_label: "My render worker".into(),
            accept_jobs: false,
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
    pub fn validate(&self) -> Result<(), String> {
        if !(self.server_url.starts_with("https://") || self.server_url.starts_with("http://localhost")) {
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
}
