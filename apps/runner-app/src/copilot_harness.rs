//! Copilot SDK discovery helpers. Session execution stays behind Runner's
//! existing external-agent command, lease, approval, and workspace contracts.

use std::path::{Path, PathBuf};
use std::time::Duration;

use github_copilot_sdk::{CliProgram, Client, ClientMode, ClientOptions};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const ADAPTER_ID: &str = "microsoft-copilot.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModel {
    pub id: String,
    pub display_name: String,
    pub capabilities: Vec<String>,
    pub reasoning_efforts: Vec<String>,
    pub default_reasoning_effort: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModelCatalog {
    pub cli_version: String,
    pub account_provider_fingerprint: String,
    pub account_scope_state: String,
    pub revision: String,
    pub source: String,
    pub verification_state: String,
    pub models: Vec<CopilotModel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CopilotRuntimeProbe {
    pub version: String,
    pub authenticated: bool,
    pub healthy: bool,
    pub reason_codes: Vec<String>,
    pub catalog: Option<CopilotModelCatalog>,
}

pub fn refresh_model_catalog(
    program: &Path,
    timeout: Duration,
) -> Result<CopilotModelCatalog, String> {
    let result = probe(program, timeout)?;
    if !result.authenticated {
        return Err("RUNNER_COPILOT_AUTH_REQUIRED".into());
    }
    result
        .catalog
        .ok_or_else(|| "RUNNER_COPILOT_MODEL_CATALOG_EMPTY".into())
}

fn profile_directory() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("COPILOT_HOME") {
        let path = PathBuf::from(path);
        if path.is_absolute() {
            return Ok(path);
        }
        return Err("RUNNER_COPILOT_PROFILE_PATH_INVALID".into());
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or("RUNNER_COPILOT_PROFILE_UNAVAILABLE")?;
    Ok(home.join(".copilot"))
}

/// Uses the official SDK to check runtime, auth, and the account's dynamic
/// model list. The SDK runs in Empty mode and cannot fall back to `gh` login.
pub fn probe(program: &Path, timeout: Duration) -> Result<CopilotRuntimeProbe, String> {
    if timeout.is_zero() || timeout > Duration::from_secs(15) {
        return Err("RUNNER_COPILOT_PROBE_TIMEOUT_INVALID".into());
    }
    if !program.is_absolute() || !program.is_file() {
        return Err("RUNNER_COPILOT_RUNTIME_NOT_INSTALLED".into());
    }
    let options = ClientOptions::default()
        .with_program(CliProgram::Path(program.to_path_buf()))
        .with_use_logged_in_user(false)
        .with_env([("COPILOT_GITHUB_TELEMETRY_DISABLED", "true")])
        .with_env_remove(["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_SDK_AUTH_TOKEN"])
        .with_mode(ClientMode::Empty)
        .with_base_directory(profile_directory()?);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "RUNNER_COPILOT_RUNTIME_UNAVAILABLE")?;
    runtime.block_on(async move {
        let client = tokio::time::timeout(timeout, Client::start(options))
            .await
            .map_err(|_| "RUNNER_COPILOT_PROBE_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_START_FAILED")?;
        let result = async {
            let status = tokio::time::timeout(timeout, client.get_status())
                .await
                .map_err(|_| "RUNNER_COPILOT_PROBE_TIMEOUT")?
                .map_err(|_| "RUNNER_COPILOT_STATUS_FAILED")?;
            let auth = tokio::time::timeout(timeout, client.get_auth_status())
                .await
                .map_err(|_| "RUNNER_COPILOT_PROBE_TIMEOUT")?
                .map_err(|_| "RUNNER_COPILOT_AUTH_PROBE_FAILED")?;
            if !auth.is_authenticated {
                return Ok(CopilotRuntimeProbe {
                    version: status.version,
                    authenticated: false,
                    healthy: true,
                    reason_codes: vec!["version_probe_ok".into(), "auth_required".into()],
                    catalog: None,
                });
            }
            let models = tokio::time::timeout(timeout, client.list_models())
                .await
                .map_err(|_| "RUNNER_COPILOT_PROBE_TIMEOUT")?
                .map_err(|_| "RUNNER_COPILOT_MODEL_DISCOVERY_FAILED")?;
            if models.is_empty() {
                return Err("RUNNER_COPILOT_MODEL_CATALOG_EMPTY".into());
            }
            let mut revision = Sha256::new();
            let mut account = Sha256::new();
            account.update(auth.auth_type.as_deref().unwrap_or("unknown").as_bytes());
            account.update([0]);
            account.update(auth.host.as_deref().unwrap_or("unknown").as_bytes());
            account.update([0]);
            account.update(auth.login.as_deref().unwrap_or("unknown").as_bytes());
            let models = models
                .into_iter()
                .filter(|model| !model.id.trim().is_empty())
                .map(|model| {
                    revision.update(model.id.as_bytes());
                    revision.update([0]);
                    let mut capabilities = vec!["text".into()];
                    if let Some(supports) = model.capabilities.supports.as_ref() {
                        if supports.tool_calls == Some(true) {
                            capabilities.push("tool_calls".into());
                        }
                        if supports.vision == Some(true) {
                            capabilities.push("vision".into());
                        }
                        if supports.thinking == Some(true)
                            || supports.reasoning_effort == Some(true)
                        {
                            capabilities.push("reasoning".into());
                        }
                    }
                    let reasoning_efforts = model.supported_reasoning_efforts.unwrap_or_default();
                    CopilotModel {
                        id: model.id,
                        display_name: model.name,
                        capabilities,
                        reasoning_efforts,
                        default_reasoning_effort: model.default_reasoning_effort,
                        is_default: false,
                    }
                })
                .collect::<Vec<_>>();
            if models.is_empty() {
                return Err("RUNNER_COPILOT_MODEL_CATALOG_EMPTY".into());
            }
            let account_provider_fingerprint =
                format!("copilot-account:sha256:{:x}", account.finalize());
            Ok(CopilotRuntimeProbe {
                version: status.version.clone(),
                authenticated: true,
                healthy: true,
                reason_codes: vec!["version_probe_ok".into(), "auth_status_ok".into()],
                catalog: Some(CopilotModelCatalog {
                    cli_version: status.version,
                    account_provider_fingerprint,
                    account_scope_state: "runner_user_profile".into(),
                    revision: format!("catalog:sha256:{:x}", revision.finalize()),
                    source: "github_copilot_sdk_models_list".into(),
                    verification_state: "account_catalog_unverified_entitlement".into(),
                    models,
                }),
            })
        }
        .await;
        let stop_result = tokio::time::timeout(timeout, client.stop()).await;
        match stop_result {
            Err(_) => return Err("RUNNER_COPILOT_RUNTIME_SHUTDOWN_TIMEOUT".into()),
            Ok(Err(_)) => return Err("RUNNER_COPILOT_RUNTIME_SHUTDOWN_FAILED".into()),
            Ok(Ok(())) => {}
        }
        result
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_timeout_and_missing_runtime() {
        assert_eq!(
            probe(Path::new("/missing/copilot"), Duration::ZERO),
            Err("RUNNER_COPILOT_PROBE_TIMEOUT_INVALID".into())
        );
        assert_eq!(
            probe(Path::new("/missing/copilot"), Duration::from_secs(1)),
            Err("RUNNER_COPILOT_RUNTIME_NOT_INSTALLED".into())
        );
    }
}
