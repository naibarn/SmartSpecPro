use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunnerEnvironment {
    #[default]
    Production,
    Developer,
}

impl RunnerEnvironment {
    pub fn server_url(self) -> &'static str {
        match self {
            Self::Production => "https://smartaihub.app",
            Self::Developer => "https://aimarkethubs.com",
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Production => "production",
            Self::Developer => "developer",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunnerProfile {
    LocalDevice,
    SharedContainer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerConfig {
    pub profile: RunnerProfile,
    pub runner_id: String,
    pub device_id: Option<String>,
    pub control_url: Option<String>,
    pub job_id: Option<String>,
    pub attempt_id: Option<String>,
    pub lease_id: Option<String>,
    pub data_root: String,
}

impl RunnerConfig {
    pub fn local(runner_id: &str, device_id: &str, control_url: &str) -> Self {
        Self {
            profile: RunnerProfile::LocalDevice,
            runner_id: runner_id.into(),
            device_id: Some(device_id.into()),
            control_url: Some(control_url.into()),
            job_id: None,
            attempt_id: None,
            lease_id: None,
            data_root: default_data_root(),
        }
    }

    pub fn shared(runner_id: &str, job_id: &str, attempt_id: &str, lease_id: &str) -> Self {
        Self {
            profile: RunnerProfile::SharedContainer,
            runner_id: runner_id.into(),
            device_id: None,
            control_url: None,
            job_id: Some(job_id.into()),
            attempt_id: Some(attempt_id.into()),
            lease_id: Some(lease_id.into()),
            data_root: "/tmp/smartaihub-runner".into(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.runner_id.trim().is_empty() || self.runner_id.len() > 160 {
            return Err("runner_id is invalid".into());
        }
        match self.profile {
            RunnerProfile::LocalDevice => {
                if self.device_id.as_deref().unwrap_or("").is_empty()
                    || self.control_url.as_deref().unwrap_or("").is_empty()
                {
                    return Err("local profile requires device_id and control_url".into());
                }
                if self.job_id.is_some() || self.attempt_id.is_some() || self.lease_id.is_some() {
                    return Err("local profile cannot carry container job scope".into());
                }
            }
            RunnerProfile::SharedContainer => {
                if self.job_id.as_deref().unwrap_or("").is_empty()
                    || self.attempt_id.as_deref().unwrap_or("").is_empty()
                    || self.lease_id.as_deref().unwrap_or("").is_empty()
                {
                    return Err("shared profile requires job scope".into());
                }
                if self.device_id.is_some() || self.control_url.is_some() {
                    return Err("shared profile cannot enroll as a device".into());
                }
            }
        }
        Ok(())
    }

    /// Credentials are isolated by website while workspaces stay shared on
    /// this device. The folder name comes from a fixed SmartAIHub endpoint,
    /// never from user-provided URL text.
    pub fn connection_store_root(&self) -> String {
        let host = self
            .control_url
            .as_deref()
            .and_then(|url| url.split_once("://").map(|(_, rest)| rest))
            .map(|rest| rest.split('/').next().unwrap_or_default())
            .unwrap_or("unknown");
        let key = match host.to_ascii_lowercase().as_str() {
            "smartaihub.app" | "www.smartaihub.app" => "production",
            "aimarkethubs.com" | "www.aimarkethubs.com" => "developer",
            _ => "custom",
        };
        format!("{}/connections/{key}", self.data_root)
    }

    pub fn local_for_environment(
        data_root: &str,
        environment: RunnerEnvironment,
    ) -> Result<Self, String> {
        let control_url_override = std::env::var("SAH_RUNNER_CONTROL_URL").ok();
        let connection_root = if control_url_override.is_some() {
            format!("{data_root}/connections/custom")
        } else {
            format!("{data_root}/connections/{}", environment.key())
        };
        let saved = crate::connection::load_connection(&connection_root)?;
        let expected_server_url = control_url_override
            .as_deref()
            .map(|url| url.split('/').take(3).collect::<Vec<_>>().join("/"))
            .unwrap_or_else(|| environment.server_url().to_string());
        if saved.as_ref().is_some_and(|connection| {
            connection.server_url.trim_end_matches('/') != expected_server_url
        }) {
            return Err("RUNNER_CONNECTION_ENVIRONMENT_MISMATCH".into());
        }
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|_| "RUNNER_IDENTITY_GENERATION_FAILED")?;
        let suffix = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let runner_id = std::env::var("SAH_RUNNER_ID").unwrap_or_else(|_| {
            saved
                .as_ref()
                .map(|value| value.runner_id.clone())
                .unwrap_or_else(|| format!("runner-{suffix}"))
        });
        let device_id = std::env::var("SAH_RUNNER_DEVICE_ID").unwrap_or_else(|_| {
            saved
                .as_ref()
                .map(|value| value.device_id.clone())
                .unwrap_or_else(|| format!("runner-device-{suffix}"))
        });
        let control_url = control_url_override.unwrap_or_else(|| {
            format!(
                "{}/api/runners/{runner_id}/control",
                environment.server_url()
            )
        });
        let mut config = Self::local(&runner_id, &device_id, &control_url);
        config.data_root = data_root.to_string();
        config.validate().map(|_| config)
    }

    pub fn from_env() -> Result<Self, String> {
        let profile = match std::env::var("SAH_RUNNER_PROFILE").ok().as_deref() {
            Some("shared_container") => RunnerProfile::SharedContainer,
            _ => RunnerProfile::LocalDevice,
        };
        let config = match profile {
            RunnerProfile::LocalDevice => return Self::local_from_env(&default_data_root()),
            RunnerProfile::SharedContainer => Self::shared(
                &std::env::var("SAH_RUNNER_ID").unwrap_or_else(|_| "managed-container".into()),
                &std::env::var("SAH_RUNNER_JOB_ID").unwrap_or_default(),
                &std::env::var("SAH_RUNNER_ATTEMPT_ID").unwrap_or_default(),
                &std::env::var("SAH_RUNNER_LEASE_ID").unwrap_or_default(),
            ),
        };
        config.validate().map(|_| config)
    }

    /// Reuse the approved installation identity, not the global local-runner /
    /// local-device placeholders shared by every machine. A new pairing writes
    /// these generated IDs into the existing connection store on approval.
    pub fn local_from_env(data_root: &str) -> Result<Self, String> {
        let legacy = crate::connection::load_connection(data_root)?;
        let saved = match legacy {
            Some(connection) => Some(connection),
            None => {
                crate::connection::load_connection(&format!("{data_root}/connections/production"))?
            }
        };
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|_| "RUNNER_IDENTITY_GENERATION_FAILED")?;
        let suffix = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let runner_id = std::env::var("SAH_RUNNER_ID").unwrap_or_else(|_| {
            saved
                .as_ref()
                .map(|value| value.runner_id.clone())
                .unwrap_or_else(|| format!("runner-{suffix}"))
        });
        let device_id = std::env::var("SAH_RUNNER_DEVICE_ID").unwrap_or_else(|_| {
            saved
                .as_ref()
                .map(|value| value.device_id.clone())
                .unwrap_or_else(|| format!("runner-device-{suffix}"))
        });
        let server_url = saved
            .as_ref()
            .map(|value| value.server_url.as_str())
            .unwrap_or("https://smartaihub.app");
        let control_url = std::env::var("SAH_RUNNER_CONTROL_URL").unwrap_or_else(|_| {
            format!(
                "{}/api/runners/{runner_id}/control",
                server_url.trim_end_matches('/')
            )
        });
        let mut config = Self::local(&runner_id, &device_id, &control_url);
        config.data_root = data_root.to_string();
        if std::env::var("SAH_RUNNER_CONTROL_URL").is_err() {
            let _ = crate::connection::migrate_legacy_connection(
                data_root,
                &config.connection_store_root(),
                server_url,
            )?;
        }
        config.validate().map(|_| config)
    }
}

fn default_data_root() -> String {
    std::env::var("SAH_RUNNER_DATA_ROOT").unwrap_or_else(|_| ".smartaihub-runner".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn developer_environment_uses_development_website_and_isolates_connection_store() {
        let root = tempfile::tempdir().unwrap();
        let production = RunnerConfig::local_for_environment(
            root.path().to_str().unwrap(),
            RunnerEnvironment::Production,
        )
        .unwrap();
        let developer = RunnerConfig::local_for_environment(
            root.path().to_str().unwrap(),
            RunnerEnvironment::Developer,
        )
        .unwrap();

        assert!(production
            .control_url
            .as_deref()
            .unwrap()
            .starts_with("https://smartaihub.app/"));
        assert!(developer
            .control_url
            .as_deref()
            .unwrap()
            .starts_with("https://aimarkethubs.com/"));
        assert_ne!(
            production.connection_store_root(),
            developer.connection_store_root()
        );
        assert_eq!(production.data_root, developer.data_root);
    }

    #[test]
    fn existing_connection_is_migrated_to_its_matching_environment_store() {
        let root = tempfile::tempdir().unwrap();
        let legacy_path = root.path().join("runner-connection.json");
        std::fs::write(
            &legacy_path,
            serde_json::json!({
                "runner_id": "existing-runner", "device_id": "existing-device",
                "server_url": "https://aimarkethubs.com", "display_name": "Existing",
                "machine_fingerprint": "fixture", "public_key_pem": "TEST_ONLY",
                "private_key_pem": "TEST_ONLY", "control_token": "TEST_ONLY",
                "refresh_token": "TEST_ONLY"
            })
            .to_string(),
        )
        .unwrap();

        let target_root = root.path().join("connections/developer");
        assert!(crate::connection::migrate_legacy_connection(
            root.path().to_str().unwrap(),
            target_root.to_str().unwrap(),
            "https://aimarkethubs.com"
        )
        .unwrap());
        let migrated = crate::connection::load_connection(target_root.to_str().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(migrated.runner_id, "existing-runner");
        assert_eq!(migrated.device_id, "existing-device");
        assert!(!legacy_path.exists());
    }

    #[test]
    fn switching_environment_does_not_reuse_another_sites_runner_identity() {
        let root = tempfile::tempdir().unwrap();
        let production_root = root.path().join("connections/production");
        std::fs::create_dir_all(&production_root).unwrap();
        std::fs::write(
            production_root.join("runner-connection.json"),
            serde_json::json!({
                "runner_id": "production-runner", "device_id": "production-device",
                "server_url": "https://smartaihub.app", "display_name": "Production",
                "machine_fingerprint": "fixture", "public_key_pem": "TEST_ONLY",
                "private_key_pem": "TEST_ONLY", "control_token": "PRODUCTION_SECRET",
                "refresh_token": "PRODUCTION_REFRESH_SECRET"
            })
            .to_string(),
        )
        .unwrap();

        let production = RunnerConfig::local_for_environment(
            root.path().to_str().unwrap(),
            RunnerEnvironment::Production,
        )
        .unwrap();
        let developer = RunnerConfig::local_for_environment(
            root.path().to_str().unwrap(),
            RunnerEnvironment::Developer,
        )
        .unwrap();
        assert_eq!(production.runner_id, "production-runner");
        assert_ne!(developer.runner_id, "production-runner");
        assert!(
            crate::connection::load_connection(&developer.connection_store_root())
                .unwrap()
                .is_none()
        );
        assert_eq!(production.data_root, developer.data_root);
    }
    #[test]
    fn profiles_cannot_be_mixed() {
        let mut config = RunnerConfig::local("r", "d", "https://example.test");
        assert!(config.validate().is_ok());
        config.job_id = Some("job".into());
        assert!(config.validate().is_err());
        assert!(RunnerConfig::shared("r", "j", "a", "l").validate().is_ok());
    }

    #[test]
    fn local_defaults_to_smartaihub_for_browser_connect() {
        let config = RunnerConfig::from_env().unwrap();
        assert!(config
            .control_url
            .as_deref()
            .unwrap_or_default()
            .starts_with("https://smartaihub.app"));
    }

    #[test]
    fn new_installations_do_not_share_the_global_placeholder_identity() {
        let first_root = tempfile::tempdir().unwrap();
        let second_root = tempfile::tempdir().unwrap();
        let first = RunnerConfig::local_from_env(first_root.path().to_str().unwrap()).unwrap();
        let second = RunnerConfig::local_from_env(second_root.path().to_str().unwrap()).unwrap();
        assert_ne!(first.runner_id, second.runner_id);
        assert_ne!(first.device_id, second.device_id);
        assert_ne!(first.runner_id, "local-runner");
        assert_ne!(first.device_id.as_deref(), Some("local-device"));
    }

    #[test]
    fn approved_identity_and_backend_are_reused_after_restart() {
        let root = tempfile::tempdir().unwrap();
        let saved = serde_json::json!({
            "runner_id": "approved-installation", "device_id": "approved-device",
            "server_url": "https://approved.example.test", "display_name": "Fixture",
            "machine_fingerprint": "fixture", "public_key_pem": "TEST_ONLY",
            "private_key_pem": "TEST_ONLY", "control_token": "TEST_ONLY",
            "refresh_token": "TEST_ONLY"
        });
        std::fs::write(
            root.path().join("runner-connection.json"),
            saved.to_string(),
        )
        .unwrap();
        let config = RunnerConfig::local_from_env(root.path().to_str().unwrap()).unwrap();
        assert_eq!(config.runner_id, "approved-installation");
        assert_eq!(config.device_id.as_deref(), Some("approved-device"));
        assert_eq!(
            config.control_url.as_deref(),
            Some("https://approved.example.test/api/runners/approved-installation/control")
        );
    }
}
