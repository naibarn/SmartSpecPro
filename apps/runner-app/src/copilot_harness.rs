//! Copilot SDK discovery helpers. Session execution stays behind Runner's
//! existing external-agent command, lease, approval, and workspace contracts.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use github_copilot_sdk::handler::{PermissionHandler, PermissionResult};
use github_copilot_sdk::rpc::{
    SandboxConfig, SandboxConfigUserPolicy, SandboxConfigUserPolicyFilesystem,
    SandboxConfigUserPolicyNetwork,
};
use github_copilot_sdk::{
    CliProgram, Client, ClientMode, ClientOptions, PermissionRequestData, PermissionRequestKind,
    SessionConfig,
};
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

pub fn profile_directory() -> Result<PathBuf, String> {
    let path = std::env::var_os("COPILOT_HOME")
        .map(PathBuf::from)
        .ok_or("RUNNER_COPILOT_PROFILE_UNAVAILABLE")?;
    if !path.is_absolute() {
        return Err("RUNNER_COPILOT_PROFILE_PATH_INVALID".into());
    }
    Ok(path)
}

struct CapabilityPermissionHandler {
    capabilities: Vec<String>,
    approval_bound: bool,
}

#[async_trait::async_trait]
impl PermissionHandler for CapabilityPermissionHandler {
    async fn handle(
        &self,
        _session_id: github_copilot_sdk::SessionId,
        _request_id: github_copilot_sdk::RequestId,
        data: PermissionRequestData,
    ) -> PermissionResult {
        let allowed = match data.kind {
            Some(PermissionRequestKind::Read) => {
                ["workspace.read", "file.read", "read", "agent.external_task"].as_slice()
            }
            Some(PermissionRequestKind::Write) => [
                "workspace.write",
                "file.write",
                "write",
                "agent.external_task",
            ]
            .as_slice(),
            Some(PermissionRequestKind::Shell) => [
                "shell.execute",
                "terminal.execute",
                "shell",
                "agent.external_task",
            ]
            .as_slice(),
            _ => [].as_slice(),
        };
        if self.approval_bound
            && allowed
                .iter()
                .any(|required| self.capabilities.iter().any(|value| value == required))
        {
            PermissionResult::approve_once()
        } else {
            PermissionResult::user_not_available()
        }
    }
}

fn emit_safe_event(event: &github_copilot_sdk::SessionEvent) -> Result<(), String> {
    use serde_json::json;
    let mut projected = match event.event_type.as_str() {
        "session.start" | "assistant.turn_start" => json!({"type": event.event_type}),
        "assistant.message_delta" => {
            let Some(text) = event.data.get("delta").and_then(serde_json::Value::as_str) else {
                return Ok(());
            };
            json!({"type":"assistant.message_delta", "delta": text})
        }
        "assistant.message" => {
            let Some(text) = event
                .data
                .get("content")
                .and_then(serde_json::Value::as_str)
                .or_else(|| {
                    event
                        .data
                        .pointer("/message/content")
                        .and_then(serde_json::Value::as_str)
                })
            else {
                return Ok(());
            };
            json!({"type":"assistant.message", "text": text})
        }
        "assistant.usage" => {
            let mut usage = json!({"type":"assistant.usage", "source":"copilot_reported"});
            if let Some(model) = event.data.get("model").and_then(serde_json::Value::as_str) {
                usage["modelId"] = json!(crate::harness_output::clean_text(model)
                    .chars()
                    .take(160)
                    .collect::<String>());
            }
            for (source, target) in [
                ("inputTokens", "inputTokens"),
                ("outputTokens", "outputTokens"),
                ("cacheReadTokens", "cacheReadTokens"),
                ("cacheWriteTokens", "cacheWriteTokens"),
                ("reasoningTokens", "reasoningTokens"),
                ("duration", "durationMs"),
            ] {
                if let Some(value) = event
                    .data
                    .get(source)
                    .and_then(serde_json::Value::as_i64)
                    .filter(|value| *value >= 0)
                {
                    usage[target] = json!(value);
                }
            }
            if let Some(byok) = event
                .data
                .get("isByok")
                .and_then(serde_json::Value::as_bool)
            {
                usage["isByok"] = json!(byok);
            }
            usage
        }
        "session.quota_observation" => {
            let Some(observation) = event.data.get("observation") else {
                return Ok(());
            };
            let mut quota =
                json!({"type":"session.quota_observation", "source":"copilot_reported"});
            for (source, target, allowed) in [
                (
                    "accessState",
                    "accessState",
                    &[
                        "allowed",
                        "denied",
                        "not_required",
                        "unknown",
                        "unavailable",
                    ][..],
                ),
                (
                    "capacityState",
                    "capacityState",
                    &[
                        "available",
                        "exhausted",
                        "unlimited",
                        "not_required",
                        "not_applicable",
                        "unknown",
                        "unavailable",
                    ][..],
                ),
                (
                    "acquisitionStatus",
                    "acquisitionStatus",
                    &["succeeded", "unavailable", "failed", "unknown"][..],
                ),
                (
                    "unit",
                    "unit",
                    &["requests", "tokens", "credits", "ai_credits", "unknown"][..],
                ),
            ] {
                if let Some(value) = observation
                    .get(source)
                    .and_then(serde_json::Value::as_str)
                    .filter(|value| allowed.contains(value))
                {
                    quota[target] = json!(value);
                }
            }
            for (source, target) in [
                ("availableQuantity", "availableQuantity"),
                ("entitledQuantity", "entitledQuantity"),
            ] {
                if let Some(value) = observation.get(source).and_then(serde_json::Value::as_i64) {
                    quota[target] = json!(value);
                }
            }
            quota
        }
        "session.usage_info" => {
            let mut usage = json!({"type":"session.usage_info", "source":"copilot_reported"});
            for key in ["currentTokens", "tokenLimit", "messagesLength"] {
                if let Some(value) = event
                    .data
                    .get(key)
                    .and_then(serde_json::Value::as_i64)
                    .filter(|value| *value >= 0)
                {
                    usage[key] = json!(value);
                }
            }
            usage
        }
        "assistant.reasoning" | "assistant.reasoning_delta" => return Ok(()),
        "tool.execution_start" => {
            let name = event
                .data
                .get("toolName")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("tool");
            json!({"type":"tool.execution_start", "toolName": crate::harness_output::clean_text(name).chars().take(120).collect::<String>()})
        }
        "tool.execution_complete" => {
            json!({"type":"tool.execution_complete", "success": event.data.get("success").and_then(serde_json::Value::as_bool).unwrap_or(false)})
        }
        "session.idle" | "session.autopilot_stopped" => json!({"type": event.event_type}),
        "session.error" => json!({"type":"session.error", "errorType":"copilot_runtime_error"}),
        "permission.requested" | "permission.denied" => {
            let kind = event
                .data
                .get("kind")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown");
            let safe_kind = if matches!(kind, "read" | "write" | "shell" | "url" | "mcp") {
                kind
            } else {
                "other"
            };
            json!({"type":"permission.required", "permissionKind": safe_kind})
        }
        _ => return Ok(()),
    };
    if let Some(text) = projected
        .get_mut("delta")
        .and_then(|value| value.as_str())
        .map(|value| {
            crate::harness_output::clean_text(value)
                .chars()
                .take(6_000)
                .collect::<String>()
        })
    {
        projected["delta"] = json!(text);
    }
    if let Some(text) = projected
        .get_mut("text")
        .and_then(|value| value.as_str())
        .map(|value| {
            crate::harness_output::clean_text(value)
                .chars()
                .take(6_000)
                .collect::<String>()
        })
    {
        projected["text"] = json!(text);
    }
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, &projected)
        .map_err(|_| "RUNNER_COPILOT_EVENT_SERIALIZE_FAILED")?;
    stdout
        .write_all(b"\n")
        .map_err(|_| "RUNNER_COPILOT_EVENT_WRITE_FAILED")?;
    stdout
        .flush()
        .map_err(|_| "RUNNER_COPILOT_EVENT_WRITE_FAILED".into())
}

/// Internal child mode launched only by the existing fenced Runner execution.
/// The request uses fixed argument slots; arbitrary CLI arguments are never forwarded.
pub fn run_worker_cli(args: &[String]) -> Result<(), String> {
    if args.len() != 6 {
        return Err("RUNNER_COPILOT_WORKER_ARGUMENTS_INVALID".into());
    }
    let program = PathBuf::from(&args[0]);
    let model_id = args[1].clone();
    let prompt = args[2].clone();
    let capabilities: Vec<String> =
        serde_json::from_str(&args[3]).map_err(|_| "RUNNER_COPILOT_WORKER_ARGUMENTS_INVALID")?;
    let approval_bound = args[4] == "approved";
    let workspace = std::env::current_dir().map_err(|_| "RUNNER_COPILOT_WORKSPACE_UNAVAILABLE")?;
    let session_id = args[5].clone();
    let profile = profile_directory()?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "RUNNER_COPILOT_RUNTIME_UNAVAILABLE")?;
    runtime.block_on(async move {
        let options = ClientOptions::default()
            .with_program(CliProgram::Path(program))
            .with_cwd(workspace.to_string_lossy().to_string())
            .with_use_logged_in_user(false)
            .with_env([("COPILOT_GITHUB_TELEMETRY_DISABLED", "true")])
            .with_env_remove(["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_SDK_AUTH_TOKEN"])
            .with_mode(ClientMode::Empty)
            .with_base_directory(profile);
        let client = tokio::time::timeout(Duration::from_secs(12), Client::start(options))
            .await
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_START_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_START_FAILED")?;
        let auth = tokio::time::timeout(Duration::from_secs(8), client.get_auth_status())
            .await
            .map_err(|_| "RUNNER_COPILOT_AUTH_PROBE_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_AUTH_PROBE_FAILED")?;
        if !auth.is_authenticated {
            return Err("RUNNER_COPILOT_AUTH_REQUIRED".into());
        }
        let permissions = Arc::new(CapabilityPermissionHandler {
            capabilities,
            approval_bound,
        });
        let mut filesystem = SandboxConfigUserPolicyFilesystem::default();
        filesystem.clear_policy_on_exit = Some(true);
        filesystem.readwrite_paths = Some(vec![workspace.to_string_lossy().to_string()]);
        let mut policy = SandboxConfigUserPolicy::default();
        policy.filesystem = Some(filesystem);
        let mut network = SandboxConfigUserPolicyNetwork::default();
        network.allow_outbound = Some(false);
        network.allow_local_network = Some(false);
        policy.network = Some(network);
        let mut sandbox = SandboxConfig::default();
        sandbox.enabled = true;
        sandbox.allow_bypass = Some(false);
        sandbox.allow_dev_tool_access = Some(false);
        sandbox.add_current_working_directory = Some(false);
        sandbox.user_policy = Some(policy);
        let host_support = tokio::time::timeout(
            Duration::from_secs(8),
            client.rpc().sandbox().get_host_support(),
        )
        .await
        .map_err(|_| "RUNNER_COPILOT_SANDBOX_PROBE_TIMEOUT")?
        .map_err(|_| "RUNNER_COPILOT_SANDBOX_PROBE_FAILED")?;
        if !host_support.supported
            || !host_support
                .capabilities
                .iter()
                .any(|capability| capability.name == "shell" && capability.supported)
        {
            return Err("RUNNER_COPILOT_SANDBOX_UNAVAILABLE".into());
        }
        let config = SessionConfig::default()
            .with_session_id(session_id)
            .with_model(model_id)
            .with_working_directory(workspace)
            .with_streaming(true)
            .with_available_tools(["view", "edit", "shell"])
            .with_permission_handler(permissions)
            .with_sandbox_config(sandbox);
        let session = tokio::time::timeout(Duration::from_secs(15), client.create_session(config))
            .await
            .map_err(|_| "RUNNER_COPILOT_SESSION_START_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_SESSION_START_FAILED")?;
        let mut events = session.subscribe();
        let outcome: Result<(), String> = async {
            session
                .send(prompt)
                .await
                .map_err(|_| "RUNNER_COPILOT_PROMPT_SEND_FAILED")?;
            loop {
                match tokio::time::timeout(Duration::from_secs(600), events.recv()).await {
                    Err(_) => {
                        let _ = session.abort().await;
                        return Err("RUNNER_COPILOT_SESSION_TIMEOUT".into());
                    }
                    Ok(Err(_)) => return Err("RUNNER_COPILOT_EVENT_STREAM_CLOSED".into()),
                    Ok(Ok(event)) => {
                        let terminal = matches!(
                            event.event_type.as_str(),
                            "session.idle" | "session.autopilot_stopped" | "session.error"
                        );
                        emit_safe_event(&event)?;
                        if terminal {
                            return if event.event_type == "session.error" {
                                Err("RUNNER_COPILOT_EXECUTION_FAILED".into())
                            } else {
                                Ok(())
                            };
                        }
                    }
                }
            }
        }
        .await;
        tokio::time::timeout(Duration::from_secs(8), session.disconnect())
            .await
            .map_err(|_| "RUNNER_COPILOT_SESSION_CLEANUP_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_SESSION_CLEANUP_FAILED")?;
        tokio::time::timeout(Duration::from_secs(10), client.stop())
            .await
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_SHUTDOWN_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_SHUTDOWN_FAILED")?;
        outcome
    })
}

/// Explicit Verify-button smoke test. It uses a real, dynamically listed model
/// with no tools enabled and never approves or invokes workspace operations.
pub fn run_task_smoke_test(program: &Path, workspace: &Path) -> Result<String, String> {
    if !program.is_absolute() || !workspace.is_absolute() || !workspace.is_dir() {
        return Err("RUNNER_COPILOT_SESSION_BINDING_INVALID".into());
    }
    let options = ClientOptions::default()
        .with_program(CliProgram::Path(program.to_path_buf()))
        .with_cwd(workspace.to_string_lossy().to_string())
        .with_use_logged_in_user(false)
        .with_env([("COPILOT_GITHUB_TELEMETRY_DISABLED", "true")])
        .with_env_remove(["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_SDK_AUTH_TOKEN"])
        .with_mode(ClientMode::Empty)
        .with_base_directory(profile_directory()?);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "RUNNER_COPILOT_RUNTIME_UNAVAILABLE")?;
    runtime.block_on(async {
        let client = tokio::time::timeout(Duration::from_secs(12), Client::start(options))
            .await
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_START_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_RUNTIME_START_FAILED")?;
        let result = async {
            let auth = tokio::time::timeout(Duration::from_secs(8), client.get_auth_status())
                .await
                .map_err(|_| "RUNNER_COPILOT_AUTH_PROBE_TIMEOUT")?
                .map_err(|_| "RUNNER_COPILOT_AUTH_PROBE_FAILED")?;
            if !auth.is_authenticated {
                return Err("RUNNER_COPILOT_AUTH_REQUIRED".into());
            }
            let sandbox = tokio::time::timeout(
                Duration::from_secs(8),
                client.rpc().sandbox().get_host_support(),
            )
            .await
            .map_err(|_| "RUNNER_COPILOT_SANDBOX_PROBE_TIMEOUT")?
            .map_err(|_| "RUNNER_COPILOT_SANDBOX_PROBE_FAILED")?;
            if !sandbox.supported
                || !sandbox
                    .capabilities
                    .iter()
                    .any(|capability| capability.name == "shell" && capability.supported)
            {
                return Err("RUNNER_COPILOT_SANDBOX_UNAVAILABLE".into());
            }
            let models = tokio::time::timeout(Duration::from_secs(8), client.list_models())
                .await
                .map_err(|_| "RUNNER_COPILOT_MODEL_DISCOVERY_TIMEOUT")?
                .map_err(|_| "RUNNER_COPILOT_MODEL_DISCOVERY_FAILED")?;
            let model = models.first().ok_or("RUNNER_COPILOT_MODEL_CATALOG_EMPTY")?;
            let config = SessionConfig::default()
                .with_model(model.id.clone())
                .with_available_tools(std::iter::empty::<String>())
                .with_working_directory(workspace.to_path_buf())
                .with_sandbox_config({
                    let mut sandbox = SandboxConfig::default();
                    sandbox.enabled = true;
                    sandbox.allow_bypass = Some(false);
                    sandbox.allow_dev_tool_access = Some(false);
                    sandbox.add_current_working_directory = Some(false);
                    let mut policy = SandboxConfigUserPolicy::default();
                    let mut filesystem = SandboxConfigUserPolicyFilesystem::default();
                    filesystem.readwrite_paths =
                        Some(vec![workspace.to_string_lossy().to_string()]);
                    filesystem.clear_policy_on_exit = Some(true);
                    policy.filesystem = Some(filesystem);
                    let mut network = SandboxConfigUserPolicyNetwork::default();
                    network.allow_outbound = Some(false);
                    network.allow_local_network = Some(false);
                    policy.network = Some(network);
                    sandbox.user_policy = Some(policy);
                    sandbox
                });
            let session =
                tokio::time::timeout(Duration::from_secs(15), client.create_session(config))
                    .await
                    .map_err(|_| "RUNNER_COPILOT_SESSION_START_TIMEOUT")?
                    .map_err(|_| "RUNNER_COPILOT_SESSION_START_FAILED")?;
            let mut events = session.subscribe();
            session
                .send("Reply exactly READY.")
                .await
                .map_err(|_| "RUNNER_COPILOT_PROMPT_SEND_FAILED")?;
            loop {
                match tokio::time::timeout(Duration::from_secs(45), events.recv()).await {
                    Err(_) => return Err("RUNNER_COPILOT_SESSION_TIMEOUT".into()),
                    Ok(Err(_)) => return Err("RUNNER_COPILOT_EVENT_STREAM_CLOSED".into()),
                    Ok(Ok(event)) if event.event_type == "assistant.message" => {
                        let response = event
                            .data
                            .get("content")
                            .and_then(serde_json::Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .ok_or("RUNNER_COPILOT_SMOKE_RESPONSE_EMPTY")?;
                        let _ = session.disconnect().await;
                        return Ok(response.chars().take(200).collect());
                    }
                    Ok(Ok(event)) if event.event_type == "session.error" => {
                        return Err("RUNNER_COPILOT_EXECUTION_FAILED".into());
                    }
                    Ok(Ok(_)) => {}
                }
            }
        }
        .await;
        let stop = tokio::time::timeout(Duration::from_secs(10), client.stop()).await;
        if stop.is_err() {
            return Err("RUNNER_COPILOT_RUNTIME_SHUTDOWN_TIMEOUT".into());
        }
        result
    })
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
