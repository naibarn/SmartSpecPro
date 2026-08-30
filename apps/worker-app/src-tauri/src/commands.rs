use crate::credentials::{
    clear_connection, ensure_device_proof_material, load_connection, load_connection_device_proof,
    save_connection_with_device_proof, save_device_proof_material, StoredWorkerConnection,
    WorkerDeviceProofMaterial,
};
use crate::diagnostics::{append_diagnostic_event, diagnostic_log_path, token_reference, LogLevel};
use crate::executor_state::ExecutorState;
use crate::runtime_manifest::{
    doctor_from_installed_or_default_paths, read_runtime_pack_manifest, runtime_pack_paths,
    DoctorCheck, DoctorSummary, RuntimePackManifest,
};
use crate::settings::{save_settings, WorkerAppSettings};
use crate::WorkerAppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{atomic::AtomicBool, Arc};
use std::time::{Duration, Instant};
#[cfg(target_os = "windows")]
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::control_plane::{
    build_registration_payload_with_hermes, HermesRegistrationInfo, WorkerAppRegistrationPayload,
};
use crate::comfy_profiles::{resolve_bridge_args, ComfyConnectionProfile, ComfyProfileProjection, ComfyProfileStore};
use crate::comfy_mcp_client::{command_available_with_path, discover_manifest, extract_mcp_execution_id, run_generic_workflow_with_lifecycle_for_tool, ComfyMcpConfig};
use crate::comfy_mcp_transport::ComfyHttpMcpTransport;
use crate::comfy_profiles::{ComfyTransportKind, ComfyCredentialKind};
use crate::executor_state::ExecutorStatus;
use crate::media_pipeline::{
    analyze_media_file, build_media_plan, probe_media_file, qc_derived_output_with_probe,
    run_allowlisted_ffmpeg, LocalMediaAnalysis, LocalMediaEditPlan, LocalMediaQc, MediaPlanOptions,
    MediaToolchain,
};
use crate::series_workspace::{
    clear_root_state, create_child_folder, import_files_into_root, load_root_state_for_series,
    persist_root_state, redacted_projection, root_fingerprint, root_id, scan_preview,
    validate_local_root, ImportFilesResult, SeriesWorkspaceProjection, SeriesWorkspaceRoot,
};
use crate::worker_control_plane::{
    get_worker_json, post_worker_json, post_worker_json_with_if_match, WorkerApiTokens,
    WorkerLoopConnection,
};
#[cfg(target_os = "windows")]
use crate::worker_executor::REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION;
use crate::worker_loop::{start_worker_loop, WorkerLoopStatus};
use base64::Engine;

/// Serialises EVERY refresh-token rotation in this process.
///
/// The refresh token is single-use: the server revokes the presented `jti` the
/// moment it issues a replacement. Four independent drivers rotate it — the
/// launch/hourly health check, the React renewal timer, `startLoop`, and the
/// worker loop's expiry guard — all reading the same `connection.json`. Two of
/// them overlapping means one presents a token the other already spent, which
/// surfaces as `401 Worker token has been revoked` on a connection that is
/// perfectly valid. The whole read → rotate → persist sequence must be atomic,
/// so the lock is held across the network call, not just around the file I/O.
static REFRESH_GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// How recently a rotation must have succeeded for the next caller to reuse
/// its result instead of rotating again.
///
/// This is what turns "two callers raced" into "the second one got the first
/// one's tokens". It also stops the hourly health check from burning a
/// rotation on credentials with hours of life left — every rotation is a
/// chance to lose the replacement in transit and lock the machine out.
const REFRESH_COALESCE_WINDOW_SECONDS: i64 = 120;

/// Tokens with at least this much life left do not need rotating.
const REFRESH_MIN_REMAINING_SECONDS: i64 = 30 * 60;

/// True when `stored` was refreshed inside the coalescing window AND its
/// tokens still have comfortable life left.
fn refresh_can_be_coalesced(stored: &StoredWorkerConnection) -> bool {
    let Some(last_refreshed_at) = stored.last_refreshed_at.as_deref() else {
        return false;
    };
    let Ok(last_refreshed) = OffsetDateTime::parse(last_refreshed_at, &Rfc3339) else {
        return false;
    };
    let now = OffsetDateTime::now_utc().unix_timestamp();
    if now - last_refreshed.unix_timestamp() > REFRESH_COALESCE_WINDOW_SECONDS {
        return false;
    }
    remaining_token_seconds(stored) > REFRESH_MIN_REMAINING_SECONDS
}

/// Seconds until the FIRST of the execution/upload tokens expires. The upload
/// token has the shorter TTL (2h vs 8h), so it decides.
fn remaining_token_seconds(stored: &StoredWorkerConnection) -> i64 {
    let now = OffsetDateTime::now_utc().unix_timestamp();
    let execution = jwt_exp_epoch_seconds(&stored.tokens.execution_token);
    let upload = jwt_exp_epoch_seconds(&stored.tokens.upload_token);
    match (execution, upload) {
        (Some(execution), Some(upload)) => execution.min(upload) - now,
        (Some(single), None) | (None, Some(single)) => single - now,
        (None, None) => 0,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkerTokenBindingSummary {
    connection_id: Option<String>,
    device_id: Option<String>,
    expires_at: Option<i64>,
    jti: Option<String>,
    machine_fingerprint_hash: Option<String>,
    public_key_fingerprint: Option<String>,
    token_use: Option<String>,
    worker_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LocalDeviceProofSummary {
    device_id: String,
    machine_fingerprint_hash: String,
    public_key_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectSession {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectPollResponse {
    pub status: String,
    pub interval: Option<u64>,
    pub expires_at: Option<String>,
    pub worker: Option<WorkerConnectWorker>,
    pub tokens: Option<WorkerConnectTokens>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectWorker {
    pub id: String,
    pub display_name: String,
    pub runtime_type: String,
    pub machine_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectTokens {
    pub execution_token: String,
    pub upload_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallResult {
    pub status: String,
    pub message: String,
    pub manifest: Option<RuntimePackManifest>,
    pub doctor: DoctorSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeUpdateCheck {
    pub runtime_id: String,
    pub channel: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WorkerConnectRefreshEnvelope {
    pub tokens: WorkerConnectTokens,
}

fn get_effective_runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    // Load settings, if failed or if runtime_dir is empty, use app_data_dir
    let settings = crate::settings::load_settings(&app_data_dir);
    if !settings.runtime_dir.trim().is_empty() {
        let custom_path = PathBuf::from(settings.runtime_dir.trim());
        // Create the directory if it doesn't exist
        if !custom_path.exists() {
            if let Err(e) = std::fs::create_dir_all(&custom_path) {
                return Err(format!("Failed to create custom runtime directory: {}", e));
            }
        }
        return Ok(custom_path);
    }

    Ok(app_data_dir)
}

#[tauri::command]
pub async fn worker_app_get_settings(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerAppSettings, String> {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyProfilesProjection {
    pub profiles: Vec<ComfyProfileProjection>,
    pub active_profile_id: Option<String>,
}

fn comfy_profile_store(app: &tauri::AppHandle) -> Result<ComfyProfileStore, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    let mut store = ComfyProfileStore::load(&app_data_dir)?;
    if store.profiles().next().is_none() {
        let settings = crate::settings::load_settings(&app_data_dir);
        let legacy = ComfyConnectionProfile {
            profile_id: "legacy-local-comfy".into(),
            worker_id: "legacy-local-worker".into(),
            display_name: "Legacy local ComfyUI".into(),
            transport: crate::comfy_profiles::ComfyTransportKind::LocalStdio,
            endpoint: None,
            command: Some(settings.comfyui_mcp_command),
            args: Vec::new(),
            credential_kind: crate::comfy_profiles::ComfyCredentialKind::None,
            credential_ref: None,
            enabled: settings.comfyui_mcp_enabled,
            profile_revision: 1,
            permission_revision: 1,
            policy_revision: 1,
            projection_revision: 1,
            expires_at: None,
            last_probe_at: None,
            last_probe_status: Some("legacy_unverified".into()),
        };
        store.upsert(legacy)?;
    }
    Ok(store)
}

#[tauri::command]
pub async fn worker_app_get_comfy_profiles(app: tauri::AppHandle) -> Result<ComfyProfilesProjection, String> {
    let store = comfy_profile_store(&app)?;
    Ok(ComfyProfilesProjection {
        profiles: store.projections(),
        active_profile_id: store.active_profile().map(|profile| profile.profile_id.clone()),
    })
}

#[tauri::command]
pub async fn worker_app_get_comfy_mcp_runtime(
    app: tauri::AppHandle,
) -> Result<crate::comfy_mcp_runtime::ComfyMcpRuntimeStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_dir_unavailable".to_string())?;
    Ok(crate::comfy_mcp_runtime::status(&app_data_dir).await)
}

/// Installs the official local MCP server and comfy-cli into a Worker-owned
/// virtual environment. It does not install arbitrary custom nodes or write
/// into the user's ComfyUI workspace.
#[tauri::command]
pub async fn worker_app_install_comfy_mcp(
    app: tauri::AppHandle,
) -> Result<crate::comfy_mcp_runtime::ComfyMcpInstallResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_dir_unavailable".to_string())?;
    crate::comfy_mcp_runtime::install(&app_data_dir).await
}

#[tauri::command]
pub async fn worker_app_save_comfy_profile(app: tauri::AppHandle, profile: ComfyConnectionProfile) -> Result<ComfyProfileProjection, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    if let Some(connection) = load_connection(&app_data_dir)? {
        if profile.worker_id != connection.worker.id {
            return Err("comfy_profile_worker_mismatch".into());
        }
    }
    let mut store = ComfyProfileStore::load(&app_data_dir)?;
    let projection = profile.projection();
    store.upsert(profile)?;
    Ok(projection)
}

#[tauri::command]
pub async fn worker_app_activate_comfy_profile(app: tauri::AppHandle, profile_id: String) -> Result<ComfyProfilesProjection, String> {
    let mut store = comfy_profile_store(&app)?;
    store.activate(&profile_id)?;
    Ok(ComfyProfilesProjection { profiles: store.projections(), active_profile_id: store.active_profile().map(|profile| profile.profile_id.clone()) })
}

#[tauri::command]
pub async fn worker_app_disable_comfy_profile(app: tauri::AppHandle, profile_id: String) -> Result<ComfyProfilesProjection, String> {
    let mut store = comfy_profile_store(&app)?;
    store.disable(&profile_id)?;
    Ok(ComfyProfilesProjection { profiles: store.projections(), active_profile_id: store.active_profile().map(|profile| profile.profile_id.clone()) })
}

/// Store a ComfyUI API/OAuth secret in the native OS credential store. The
/// secret is write-only at the Tauri boundary and is never returned to React.
#[tauri::command]
pub async fn worker_app_set_comfy_credential(app: tauri::AppHandle, profile_id: String, secret: String) -> Result<ComfyProfileProjection, String> {
    let store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == profile_id).ok_or_else(|| "comfy_profile_not_found".to_string())?;
    let reference = profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?;
    crate::comfy_credentials::store(reference, &secret)?;
    Ok(profile.projection())
}

#[tauri::command]
pub async fn worker_app_delete_comfy_credential(app: tauri::AppHandle, profile_id: String) -> Result<ComfyProfileProjection, String> {
    let store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == profile_id).ok_or_else(|| "comfy_profile_not_found".to_string())?;
    let reference = profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?;
    crate::comfy_credentials::delete(reference)?;
    Ok(profile.projection())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyProfileProbeResult {
    pub profile: ComfyProfileProjection,
    pub status: String,
    pub protocol_version: Option<String>,
    pub tool_names: Vec<String>,
    pub workflow_ids: Vec<String>,
    pub capabilities: Vec<String>,
    pub tool_schemas: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyWorkflowSchemaRequest {
    pub profile_id: String,
    pub workflow_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyWorkflowSchemaResult {
    pub profile_id: String,
    pub workflow_id: String,
    pub tool_name: String,
    pub input_schema: Value,
    pub output_schema: Value,
    pub result: Value,
}

fn ensure_comfy_profile_owner(app: &tauri::AppHandle, profile: &ComfyConnectionProfile) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    if let Some(connection) = load_connection(&app_data_dir)? {
        if profile.worker_id != connection.worker.id { return Err("comfy_profile_worker_mismatch".into()); }
    }
    Ok(())
}

/// Probe is a real MCP initialize/tools-list negotiation. It never returns a
/// credential value or a local path to the WebView.
#[tauri::command]
pub async fn worker_app_probe_comfy_profile(app: tauri::AppHandle, profile_id: String) -> Result<ComfyProfileProbeResult, String> {
    let mut store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == profile_id).cloned().ok_or_else(|| "comfy_profile_not_found".to_string())?;
    ensure_comfy_profile_owner(&app, &profile)?;
    if !profile.enabled { return Err("comfy_profile_disabled".into()); }
    let manifest_result = match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let command = profile.command.clone().ok_or_else(|| "comfy_profile_command_missing".to_string())?;
            let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
            let managed_command_path = (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                && crate::comfy_mcp_runtime::normalize_command(&command)
                    == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                .then(|| crate::comfy_mcp_runtime::managed_command_path(&app_data_dir))
                .flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) { return Err("comfy_mcp_unavailable".into()); }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) { resolve_bridge_args(&profile.args, profile.endpoint.as_deref().ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?)? } else { profile.args.clone() };
            discover_manifest(&ComfyMcpConfig { command, managed_command_path, args, timeout_ms: 10_000 }).await
        }
        ComfyTransportKind::SelfHostedHttpMcp | ComfyTransportKind::ComfyCloud | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) } else { None };
            let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() { Some(crate::comfy_ssh_tunnel::open_with_identity(&profile.args, key)?) } else { None };
            let endpoint = profile.endpoint.clone().ok_or_else(|| "comfy_endpoint_missing".to_string())?;
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) || profile.credential_kind == ComfyCredentialKind::None {
                None
            } else {
                Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?)
            };
            let mut transport = ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(15))?;
            let response = transport.discover_tools().await?;
            crate::comfy_mcp_client::parse_tools_manifest(&response)
        }
    };
    let manifest = match manifest_result {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = store.record_probe(&profile_id, "failed");
            return Err(error);
        }
    };
    store.record_probe(&profile_id, "ready")?;
    let refreshed = store.profiles().find(|item| item.profile_id == profile_id).ok_or_else(|| "comfy_profile_not_found".to_string())?;
    Ok(ComfyProfileProbeResult { profile: refreshed.projection(), status: "ready".into(), protocol_version: manifest.protocol_version, tool_names: manifest.tool_names, workflow_ids: manifest.workflow_ids, capabilities: manifest.capabilities, tool_schemas: manifest.tool_schemas })
}

/// Reads the schema for the selected workflow/template from MCP when the
/// connection advertises a dedicated schema tool. This is separate from the
/// generic `tools/list` input schema because hosted template inputs can vary
/// by workflow.
#[tauri::command]
pub async fn worker_app_inspect_comfy_workflow(
    app: tauri::AppHandle,
    request: ComfyWorkflowSchemaRequest,
) -> Result<ComfyWorkflowSchemaResult, String> {
    if request.workflow_id.trim().is_empty() || request.workflow_id.len() > 160 || !request.workflow_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-/".contains(&byte)) {
        return Err("comfy_workflow_id_invalid".into());
    }
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    let store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == request.profile_id).cloned().ok_or_else(|| "comfy_profile_not_found".to_string())?;
    ensure_comfy_profile_owner(&app, &profile)?;
    if !profile.enabled { return Err("comfy_profile_disabled".into()); }
    let schema_tools = ["get_template_schema", "get_workflow_schema", "workflow_schema", "inspect_workflow"];
    let (tool_name, result) = match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let command = profile.command.clone().ok_or_else(|| "comfy_profile_command_missing".to_string())?;
            let managed_command_path = (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                && crate::comfy_mcp_runtime::normalize_command(&command) == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                .then(|| crate::comfy_mcp_runtime::managed_command_path(&app_data_dir)).flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) { return Err("comfy_mcp_unavailable".into()); }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) {
                resolve_bridge_args(&profile.args, profile.endpoint.as_deref().ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?)?
            } else { profile.args.clone() };
            let config = ComfyMcpConfig { command, managed_command_path, args, timeout_ms: 30_000 };
            let manifest = discover_manifest(&config).await?;
            let tool = schema_tools.iter().find(|candidate| manifest.tool_names.iter().any(|name| name == **candidate)).ok_or_else(|| "comfy_mcp_workflow_schema_tool_missing".to_string())?;
            let schema = manifest.tool_schemas.iter().find(|(name, _)| name == *tool).map(|(_, schema)| schema.as_str());
            let arguments = build_comfy_workflow_schema_arguments(schema, &request.workflow_id);
            ((*tool).to_string(), crate::comfy_mcp_client::call_tool(&config, tool, arguments).await?)
        }
        ComfyTransportKind::SelfHostedHttpMcp | ComfyTransportKind::ComfyCloud | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) } else { None };
            let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() { Some(crate::comfy_ssh_tunnel::open_with_identity(&profile.args, key)?) } else { None };
            let endpoint = profile.endpoint.clone().ok_or_else(|| "comfy_endpoint_missing".to_string())?;
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) || profile.credential_kind == ComfyCredentialKind::None { None } else { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) };
            let mut transport = ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(30))?;
            let tools = transport.discover_tools().await?;
            let manifest = crate::comfy_mcp_client::parse_tools_manifest(&tools)?;
            let tool = schema_tools.iter().find(|candidate| manifest.tool_names.iter().any(|name| name == **candidate)).ok_or_else(|| "comfy_mcp_workflow_schema_tool_missing".to_string())?;
            let schema = manifest.tool_schemas.iter().find(|(name, _)| name == *tool).map(|(_, schema)| schema.as_str());
            let arguments = build_comfy_workflow_schema_arguments(schema, &request.workflow_id);
            ((*tool).to_string(), transport.call_tool(tool, arguments).await?)
        }
    };
    let encoded = serde_json::to_vec(&result).map_err(|_| "comfy_workflow_schema_encode_failed".to_string())?;
    if encoded.len() > 4 * 1024 * 1024 { return Err("comfy_workflow_schema_too_large".into()); }
    Ok(ComfyWorkflowSchemaResult {
        profile_id: request.profile_id,
        workflow_id: request.workflow_id,
        tool_name,
        input_schema: find_comfy_schema_section(&result, &["inputSchema", "input_schema", "inputs", "parameters", "schema"]),
        output_schema: find_comfy_schema_section(&result, &["outputSchema", "output_schema", "outputs", "output"]),
        result,
    })
}

fn build_comfy_workflow_schema_arguments(schema: Option<&str>, workflow_id: &str) -> Value {
    let properties = schema.and_then(|value| serde_json::from_str::<Value>(value).ok()).and_then(|value| value.get("properties").cloned()).and_then(|value| value.as_object().cloned()).unwrap_or_default();
    let key = ["template_name", "templateName", "template_id", "templateId", "workflow_id", "workflowId", "workflow_path", "workflowPath", "name", "id"].iter().find(|candidate| properties.contains_key(**candidate)).copied().unwrap_or("workflowId");
    json!({ key: workflow_id })
}

fn find_comfy_schema_section(value: &Value, keys: &[&str]) -> Value {
    if let Some(object) = value.as_object() {
        for key in keys {
            if let Some(section) = object.get(*key) { return section.clone(); }
        }
        // Some MCP schema tools return the JSON Schema object directly rather
        // than wrapping it under `inputSchema`/`schema`. Preserve that useful
        // contract for the Workbench instead of showing a misleading null.
        if keys.iter().any(|key| *key == "schema")
            && (object.contains_key("properties") || object.contains_key("required"))
        {
            return value.clone();
        }
        for child in object.values() {
            let found = find_comfy_schema_section(child, keys);
            if !found.is_null() { return found; }
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            let found = find_comfy_schema_section(child, keys);
            if !found.is_null() { return found; }
        }
    } else if let Some(text) = value.as_str() {
        if let Ok(parsed) = serde_json::from_str::<Value>(text) { return find_comfy_schema_section(&parsed, keys); }
    }
    Value::Null
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyInteractiveRunRequest {
    pub profile_id: String,
    pub tool_name: Option<String>,
    pub run_id: Option<String>,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyInteractiveRunResult {
    pub status: String,
    pub profile_id: String,
    pub tool_name: Option<String>,
    pub run_id: String,
    pub workflow_id: Option<String>,
    pub execution_id: Option<String>,
    pub output_dir: String,
    pub local_files: Vec<String>,
    pub result: Value,
}

/// Runs a ComfyUI MCP workflow directly from the Workflows screen. This is a
/// local Worker operation: it does not create a SmartAIHub render-job and it
/// never sends the Worker filesystem path to the server.
#[tauri::command]
pub async fn worker_app_run_comfy_workflow(
    app: tauri::AppHandle,
    request: ComfyInteractiveRunRequest,
) -> Result<ComfyInteractiveRunResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    let store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == request.profile_id).cloned().ok_or_else(|| "comfy_profile_not_found".to_string())?;
    ensure_comfy_profile_owner(&app, &profile)?;
    if !profile.enabled { return Err("comfy_profile_disabled".into()); }
    if !request.arguments.is_object() { return Err("comfy_workbench_arguments_must_be_object".into()); }
    let encoded = serde_json::to_vec(&request.arguments).map_err(|_| "comfy_workbench_arguments_invalid".to_string())?;
    if encoded.len() > 2 * 1024 * 1024 { return Err("comfy_workbench_arguments_too_large".into()); }
    if let Some(tool_name) = request.tool_name.as_deref() {
        if tool_name.trim().is_empty() || tool_name.len() > 160 || !tool_name.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte)) {
            return Err("comfy_workbench_tool_name_invalid".into());
        }
    }
    let run_id = request.run_id.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| OffsetDateTime::now_utc().unix_timestamp_nanos().to_string());
    if run_id.len() > 160 || !run_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte)) { return Err("comfy_workbench_run_id_invalid".into()); }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<WorkerAppState>();
        let mut runs = state.comfy_interactive_runs.lock().map_err(|_| "comfy_workbench_state_unavailable".to_string())?;
        if runs.insert(run_id.clone(), cancel.clone()).is_some() { return Err("comfy_workbench_run_already_exists".into()); }
    }
    let output_dir = app_data_dir.join("comfy-workbench").join("runs").join(&run_id);
    let tool_name = request.tool_name.clone();
    let result: Result<Value, String> = async {
        fs::create_dir_all(&output_dir).map_err(|_| "comfy_workbench_output_directory_failed".to_string())?;
        Ok(match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let command = profile.command.clone().ok_or_else(|| "comfy_profile_command_missing".to_string())?;
            let managed_command_path = (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                && crate::comfy_mcp_runtime::normalize_command(&command) == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                .then(|| crate::comfy_mcp_runtime::managed_command_path(&app_data_dir)).flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) { return Err("comfy_mcp_unavailable".into()); }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) {
                resolve_bridge_args(&profile.args, profile.endpoint.as_deref().ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?)?
            } else { profile.args.clone() };
            run_generic_workflow_with_lifecycle_for_tool(
                &ComfyMcpConfig { command, managed_command_path, args, timeout_ms: 10 * 60 * 1000 },
                request.arguments.clone(), tool_name.as_deref(), Some(&output_dir), cancel.as_ref(), |_| {},
            ).await?
        }
        ComfyTransportKind::SelfHostedHttpMcp | ComfyTransportKind::ComfyCloud | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) } else { None };
            let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() { Some(crate::comfy_ssh_tunnel::open_with_identity(&profile.args, key)?) } else { None };
            let endpoint = profile.endpoint.clone().ok_or_else(|| "comfy_endpoint_missing".to_string())?;
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) || profile.credential_kind == ComfyCredentialKind::None { None } else { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) };
            let mut transport = ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(30))?;
            transport.run_workflow_with_lifecycle_for_tool(request.arguments.clone(), tool_name.as_deref(), cancel.clone(), |_| {}).await?
        }
        })
    }.await;
    {
        let state = app.state::<WorkerAppState>();
        if let Ok(mut runs) = state.comfy_interactive_runs.lock() { runs.remove(&run_id); };
    }
    let result = result?;
    let local_files = materialize_comfy_outputs(&result, &output_dir).await;
    let result_path = output_dir.join("result.json");
    fs::write(&result_path, serde_json::to_vec_pretty(&result).map_err(|_| "comfy_workbench_result_encode_failed".to_string())?).map_err(|_| "comfy_workbench_result_write_failed".to_string())?;
    Ok(ComfyInteractiveRunResult {
        status: "completed".into(),
        profile_id: request.profile_id,
        tool_name,
        run_id,
        workflow_id: request.arguments.get("workflowId").or_else(|| request.arguments.get("workflow_id")).and_then(Value::as_str).map(str::to_string),
        execution_id: extract_mcp_execution_id(&result),
        output_dir: output_dir.to_string_lossy().to_string(),
        local_files,
        result,
    })
}

/// Requests cancellation of a directly-running Workbench execution. The
/// lifecycle loop then calls the advertised MCP cancellation tool and closes
/// the session; it does not kill an unrelated ComfyUI process.
#[tauri::command]
pub fn worker_app_cancel_comfy_workflow(app: tauri::AppHandle, run_id: String) -> Result<(), String> {
    if run_id.len() > 160 || !run_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte)) { return Err("comfy_workbench_run_id_invalid".into()); }
    let state = app.state::<WorkerAppState>();
    let runs = state.comfy_interactive_runs.lock().map_err(|_| "comfy_workbench_state_unavailable".to_string())?;
    let cancel = runs.get(&run_id).ok_or_else(|| "comfy_workbench_run_not_found".to_string())?;
    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

async fn materialize_comfy_outputs(result: &Value, output_dir: &Path) -> Vec<String> {
    let mut candidates = Vec::new();
    collect_comfy_output_candidates(result, None, &mut candidates);
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30 * 60)).redirect(reqwest::redirect::Policy::none()).build().ok();
    let mut used_names = std::collections::HashSet::new();
    let mut saved = Vec::new();
    for (index, (kind, value, name)) in candidates.into_iter().take(16).enumerate() {
        let mut filename = safe_comfy_output_name(name.as_deref(), value.as_str(), index);
        if filename.eq_ignore_ascii_case("result.json") {
            filename = format!("output-{index}.json");
        }
        if !used_names.insert(filename.clone()) {
            filename = format!("output-{index}-{filename}");
            used_names.insert(filename.clone());
        }
        let destination = output_dir.join(filename);
        if kind == "path" {
            let source = PathBuf::from(value.as_str().unwrap_or_default());
            let is_regular_media = fs::symlink_metadata(&source)
                .map(|metadata| metadata.file_type().is_file() && metadata.len() <= 512 * 1024 * 1024)
                .unwrap_or(false)
                && is_allowed_comfy_output_path(&source);
            if is_regular_media && source != destination && fs::copy(&source, &destination).is_ok() { saved.push(destination.to_string_lossy().to_string()); }
        } else if kind == "url" && (value.as_str().unwrap_or_default().starts_with("https://") || value.as_str().unwrap_or_default().starts_with("http://127.0.0.1:") || value.as_str().unwrap_or_default().starts_with("http://localhost:")) {
            let Some(client) = client.as_ref() else { continue; };
            let Ok(response) = client.get(value.as_str().unwrap_or_default()).send().await else { continue; };
            if !response.status().is_success() || response.content_length().is_some_and(|size| size > 512 * 1024 * 1024) { continue; }
            let Ok(bytes) = response.bytes().await else { continue; };
            if bytes.len() > 512 * 1024 * 1024 || fs::write(&destination, &bytes).is_err() { continue; }
            saved.push(destination.to_string_lossy().to_string());
        }
    }
    saved
}

fn is_allowed_comfy_output_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "mp4" | "webm" | "mov" | "mkv" | "wav" | "mp3" | "flac")
    )
}

fn collect_comfy_output_candidates(value: &Value, inherited_name: Option<String>, output: &mut Vec<(String, Value, Option<String>)>) {
    if let Some(object) = value.as_object() {
        let name = ["fileName", "file_name", "filename", "name"].iter().find_map(|key| object.get(*key).and_then(Value::as_str)).map(str::to_string).or(inherited_name);
        for key in ["artifactPath", "artifact_path", "outputPath", "output_path"] {
            if let Some(path) = object.get(key).filter(|value| value.is_string()) { output.push(("path".into(), path.clone(), name.clone())); }
        }
        for key in ["artifactUrl", "artifact_url", "outputUrl", "output_url", "downloadUrl", "download_url", "url"] {
            if let Some(url) = object.get(key).filter(|value| value.is_string()) { output.push(("url".into(), url.clone(), name.clone())); }
        }
        for child in object.values() { collect_comfy_output_candidates(child, name.clone(), output); }
    } else if let Some(array) = value.as_array() {
        for child in array { collect_comfy_output_candidates(child, inherited_name.clone(), output); }
    }
}

fn safe_comfy_output_name(name: Option<&str>, source: Option<&str>, index: usize) -> String {
    let candidate = name.or_else(|| source.and_then(|value| value.split('/').next_back().map(|part| part.split('?').next().unwrap_or(part)))).unwrap_or("");
    let basename = Path::new(candidate).file_name().and_then(|value| value.to_str()).unwrap_or("");
    let sanitized: String = basename.chars().map(|value| if value.is_ascii_alphanumeric() || matches!(value, '.' | '-' | '_') { value } else { '_' }).collect();
    if sanitized.is_empty() { format!("output-{index}") } else { sanitized }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyInteractiveUploadRequest {
    pub profile_id: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyInteractiveUploadResult {
    pub tool_name: String,
    pub file_name: String,
    pub reference: Option<String>,
    pub result: Value,
}

/// Uploads a user-selected media input through the selected MCP connection.
/// Local MCP may receive a path; remote MCP receives base64 only when its
/// advertised `upload_file` schema supports a data field.
#[tauri::command]
pub async fn worker_app_upload_comfy_file(
    app: tauri::AppHandle,
    request: ComfyInteractiveUploadRequest,
) -> Result<ComfyInteractiveUploadResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    let store = comfy_profile_store(&app)?;
    let profile = store.profiles().find(|item| item.profile_id == request.profile_id).cloned().ok_or_else(|| "comfy_profile_not_found".to_string())?;
    ensure_comfy_profile_owner(&app, &profile)?;
    if !profile.enabled { return Err("comfy_profile_disabled".into()); }
    let path = PathBuf::from(request.file_path.trim());
    let metadata = fs::metadata(&path).map_err(|_| "comfy_workbench_input_file_unavailable".to_string())?;
    if !metadata.is_file() { return Err("comfy_workbench_input_file_invalid".into()); }
    if metadata.len() > 50 * 1024 * 1024 { return Err("comfy_workbench_input_file_too_large".into()); }
    let file_name = path.file_name().and_then(|name| name.to_str()).filter(|name| !name.is_empty() && !name.contains(['/', '\\'])).ok_or_else(|| "comfy_workbench_input_file_name_invalid".to_string())?.to_string();
    let bytes = fs::read(&path).map_err(|_| "comfy_workbench_input_file_unreadable".to_string())?;
    let content_type = match path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", "gif" => "image/gif",
        "mp4" => "video/mp4", "webm" => "video/webm", "mov" => "video/quicktime", "wav" => "audio/wav", "mp3" => "audio/mpeg", "flac" => "audio/flac",
        _ => return Err("comfy_workbench_input_file_type_unsupported".into()),
    };
    let upload_tool_candidates = ["upload_file", "upload_image", "upload_media", "upload_input"];
    let (tool_name, result) = match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let command = profile.command.clone().ok_or_else(|| "comfy_profile_command_missing".to_string())?;
            let managed_command_path = (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                && crate::comfy_mcp_runtime::normalize_command(&command) == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                .then(|| crate::comfy_mcp_runtime::managed_command_path(&app_data_dir)).flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) { return Err("comfy_mcp_unavailable".into()); }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) { resolve_bridge_args(&profile.args, profile.endpoint.as_deref().ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?)? } else { profile.args.clone() };
            let config = ComfyMcpConfig { command, managed_command_path, args, timeout_ms: 30_000 };
            let manifest = discover_manifest(&config).await?;
            let tool = upload_tool_candidates.iter().find(|candidate| manifest.tool_names.iter().any(|name| name == **candidate)).ok_or_else(|| "comfy_mcp_upload_tool_missing".to_string())?;
            let schema = manifest.tool_schemas.iter().find(|(name, _)| name == *tool).map(|(_, value)| value.clone());
            let arguments = build_comfy_upload_arguments(schema.as_deref(), &path, &file_name, content_type, &bytes, true)?;
            let result = crate::comfy_mcp_client::call_tool(&config, tool, arguments).await?;
            ((*tool).to_string(), result)
        }
        ComfyTransportKind::SelfHostedHttpMcp | ComfyTransportKind::ComfyCloud | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) } else { None };
            let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() { Some(crate::comfy_ssh_tunnel::open_with_identity(&profile.args, key)?) } else { None };
            let endpoint = profile.endpoint.clone().ok_or_else(|| "comfy_endpoint_missing".to_string())?;
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) || profile.credential_kind == ComfyCredentialKind::None { None } else { Some(crate::comfy_credentials::resolve(profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) };
            let mut transport = ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(30))?;
            let tools = transport.discover_tools().await?;
            let manifest = crate::comfy_mcp_client::parse_tools_manifest(&tools)?;
            let tool = upload_tool_candidates.iter().find(|candidate| manifest.tool_names.iter().any(|name| name == **candidate)).ok_or_else(|| "comfy_mcp_upload_tool_missing".to_string())?;
            let schema = manifest.tool_schemas.iter().find(|(name, _)| name == *tool).map(|(_, value)| value.clone());
            let arguments = build_comfy_upload_arguments(schema.as_deref(), &path, &file_name, content_type, &bytes, false)?;
            let result = transport.call_tool(tool, arguments).await?;
            ((*tool).to_string(), result)
        }
    };
    let reference = find_comfy_reference(&result);
    Ok(ComfyInteractiveUploadResult { tool_name, file_name, reference, result })
}

fn build_comfy_upload_arguments(schema: Option<&str>, path: &Path, file_name: &str, content_type: &str, bytes: &[u8], local: bool) -> Result<Value, String> {
    let properties = schema.and_then(|value| serde_json::from_str::<Value>(value).ok()).and_then(|value| value.get("properties").cloned()).and_then(|value| value.as_object().cloned()).unwrap_or_default();
    let mut arguments = serde_json::Map::new();
    let path_key = ["file_path", "filePath", "path"].iter().find(|key| properties.contains_key(**key)).copied();
    let data_key = ["data", "base64", "content", "contentBase64"].iter().find(|key| properties.contains_key(**key)).copied();
    if local {
        if let Some(key) = path_key { arguments.insert(key.to_string(), Value::String(path.to_string_lossy().to_string())); }
        else if let Some(key) = data_key { arguments.insert(key.to_string(), Value::String(base64::engine::general_purpose::STANDARD.encode(bytes))); }
        else { return Err("comfy_mcp_upload_schema_unsupported".into()); }
    } else if let Some(key) = data_key {
        arguments.insert(key.to_string(), Value::String(base64::engine::general_purpose::STANDARD.encode(bytes)));
    } else {
        return Err("comfy_mcp_remote_upload_requires_data_input".into());
    }
    for key in ["file_name", "fileName", "filename", "name"] {
        if properties.contains_key(key) { arguments.insert(key.to_string(), Value::String(file_name.to_string())); break; }
    }
    for key in ["mime_type", "mimeType", "content_type", "contentType"] {
        if properties.contains_key(key) { arguments.insert(key.to_string(), Value::String(content_type.to_string())); break; }
    }
    Ok(Value::Object(arguments))
}

fn find_comfy_reference(value: &Value) -> Option<String> {
    if let Some(object) = value.as_object() {
        for key in ["filePath", "file_path", "path", "url", "downloadUrl", "download_url", "assetId", "asset_id", "name"] {
            if let Some(found) = object.get(key).and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { return Some(found.to_string()); }
        }
        for child in object.values() { if let Some(found) = find_comfy_reference(child) { return Some(found); } }
    }
    if let Some(array) = value.as_array() { for child in array { if let Some(found) = find_comfy_reference(child) { return Some(found); } } }
    None
}

#[tauri::command]
pub async fn worker_app_pick_local_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    path: String,
) -> Result<SeriesWorkspaceProjection, String> {
    let canonical = validate_local_root(Path::new(path.trim()))?;
    let device_key = active_connected_device_proof(&state)?
        .map(|proof| proof.machine_fingerprint)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "worker_device_proof_required".to_string())?;
    let fingerprint = root_fingerprint(&device_key, &canonical, "local_only");
    let root = SeriesWorkspaceRoot {
        series_id,
        root_id: root_id(&fingerprint),
        root_path: canonical,
        root_fingerprint: fingerprint,
        workspace_mode: "local_only".into(),
    };
    let projection = redacted_projection(&root, None, "selected");
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    workspace.root = Some(root);
    workspace.projection = Some(projection.clone());
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    persist_root_state(
        &app_data_dir,
        workspace.root.as_ref().expect("root set above"),
    )?;
    Ok(projection)
}

#[tauri::command]
pub async fn worker_app_select_series_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
) -> Result<Option<SeriesWorkspaceProjection>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let root = load_root_state_for_series(&app_data_dir, &series_id)?;
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let Some(root) = root else {
        workspace.root = None;
        workspace.projection = None;
        crate::series_workspace::stop_coordinator(&workspace);
        return Ok(None);
    };
    let canonical = validate_local_root(&root.root_path)?;
    if canonical != root.root_path {
        return Err("local_root_identity_changed".into());
    }
    let projection = redacted_projection(&root, None, "selected");
    workspace.root = Some(root);
    workspace.projection = Some(projection.clone());
    Ok(Some(projection))
}

#[tauri::command]
pub async fn worker_app_create_series_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    folder_name: String,
    parent_path: Option<String>,
) -> Result<SeriesWorkspaceProjection, String> {
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let current = workspace
        .root
        .clone()
        .filter(|root| root.series_id == series_id);
    let parent = if let Some(current) = current {
        current.root_path
    } else {
        let path = parent_path.ok_or_else(|| "local_root_not_selected".to_string())?;
        validate_local_root(Path::new(path.trim()))?
    };
    let child_path = create_child_folder(&parent, &folder_name)?;
    let device_key = active_connected_device_proof(&state)?
        .map(|proof| proof.machine_fingerprint)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "worker_device_proof_required".to_string())?;
    let fingerprint = root_fingerprint(&device_key, &child_path, "local_only");
    let root = SeriesWorkspaceRoot {
        series_id,
        root_id: root_id(&fingerprint),
        root_path: child_path,
        root_fingerprint: fingerprint,
        workspace_mode: "local_only".into(),
    };
    let projection = redacted_projection(&root, None, "selected");
    workspace.root = Some(root);
    workspace.projection = Some(projection.clone());
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    persist_root_state(
        &app_data_dir,
        workspace.root.as_ref().expect("root set above"),
    )?;
    Ok(projection)
}

#[tauri::command]
pub async fn worker_app_validate_local_root(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<SeriesWorkspaceProjection, String> {
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    let canonical = validate_local_root(&root.root_path)?;
    if canonical != root.root_path {
        return Err("local_root_identity_changed".into());
    }
    let projection = redacted_projection(&root, None, "validated");
    workspace.projection = Some(projection.clone());
    Ok(projection)
}

#[tauri::command]
pub async fn worker_app_scan_preview(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<crate::series_workspace::ScanPreview, String> {
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    let scan = scan_preview(&root)?;
    workspace.projection = Some(redacted_projection(&root, Some(&scan), "scan_ready"));
    Ok(scan)
}

#[tauri::command]
pub async fn worker_app_import_local_files(
    state: tauri::State<'_, WorkerAppState>,
    source_paths: Vec<String>,
) -> Result<ImportFilesResult, String> {
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    let result = import_files_into_root(&root, &source_paths)?;
    workspace.projection = Some(redacted_projection(&root, Some(&result.scan), "scan_ready"));
    Ok(result)
}

#[tauri::command]
pub async fn worker_app_analyze_media_asset(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    source_relative_name: String,
) -> Result<LocalMediaAnalysis, String> {
    let workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .as_ref()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    let source = root
        .root_path
        .join(&source_relative_name)
        .canonicalize()
        .map_err(|_| "media_source_missing".to_string())?;
    if !source.starts_with(&root.root_path) {
        return Err("relative_path_escape".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let tools = MediaToolchain::from_settings(&settings, &app_data_dir);
    analyze_media_file(&source, &tools)
}

#[tauri::command]
pub async fn worker_app_get_local_workspace_status(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<Option<SeriesWorkspaceProjection>, String> {
    state
        .series_workspace
        .lock()
        .map(|workspace| workspace.projection.clone())
        .map_err(|_| "workspace lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_revoke_local_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
) -> Result<(), String> {
    let mut workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    if workspace
        .root
        .as_ref()
        .is_some_and(|root| root.series_id == series_id)
    {
        workspace.root = None;
        workspace.projection = None;
        crate::series_workspace::stop_coordinator(&workspace);
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    clear_root_state(&app_data_dir, &series_id)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerSeriesProjection {
    pub series_id: String,
    pub title: String,
    pub status: String,
    pub access_mode: String,
    pub access_source: String,
    pub authority_revision: String,
    pub binding_revision: Option<i64>,
    pub binding_status: Option<String>,
    pub can_bind: bool,
    pub can_process: bool,
    pub can_publish: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerSeriesListResponse {
    pub contract_version: String,
    pub items: Vec<WorkerSeriesProjection>,
    pub next_cursor: Option<String>,
}

fn load_series_control_plane_connection(
    app_data_dir: &Path,
) -> Result<WorkerLoopConnection, String> {
    let stored =
        load_connection(app_data_dir)?.ok_or_else(|| "worker_connection_required".to_string())?;
    let device_proof = load_connection_device_proof(app_data_dir)?
        .ok_or_else(|| "worker_device_proof_required".to_string())?;
    Ok(WorkerLoopConnection {
        server_url: stored.server_url.trim_end_matches('/').to_string(),
        worker_id: stored.worker.id,
        worker_label: stored.worker.display_name,
        tokens: WorkerApiTokens {
            execution_token: stored.tokens.execution_token,
            upload_token: stored.tokens.upload_token,
        },
        device_proof,
    })
}

#[tauri::command]
pub async fn worker_app_list_series(
    app: tauri::AppHandle,
    query: Option<String>,
    cursor: Option<String>,
) -> Result<WorkerSeriesListResponse, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let mut params = Vec::new();
    if let Some(value) = query
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        params.push(format!("q={}", urlencoding::encode(&value)));
    }
    if let Some(value) = cursor
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        params.push(format!("cursor={}", urlencoding::encode(&value)));
    }
    let path = format!(
        "/api/workers/{}/series{}",
        connection.worker_id,
        if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        }
    );
    get_worker_json(
        &connection.server_url,
        &path,
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await
}

/// Execute only the no-payload Series Quick Actions from the Worker shell.
/// Actions that need a root, source selection, or QC payload stay in the
/// Media Workspace so a toolbar click can never acknowledge unsafe work.
#[tauri::command]
pub async fn worker_app_execute_series_quick_action(
    app: tauri::AppHandle,
    series_id: String,
    action: String,
    job_ids: Option<Vec<String>>,
    reason: Option<String>,
) -> Result<Value, String> {
    if series_id.trim().is_empty() {
        return Err("series_id_required".into());
    }
    if !matches!(
        action.as_str(),
        "index" | "review" | "pause" | "resume" | "cancel" | "retry"
    ) {
        return Err("quick_action_requires_media_workspace".into());
    }
    if matches!(action.as_str(), "pause" | "resume" | "cancel" | "retry")
        && job_ids.as_ref().map_or(true, Vec::is_empty)
    {
        return Err("job_ids_required".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let request_id = format!(
        "worker-quick-{}-{}",
        action,
        chrono::Utc::now().timestamp_millis()
    );
    let action_payload = match action.as_str() {
        "pause" | "cancel" => json!({
            "action": action.clone(),
            "seriesId": series_id.clone(),
            "jobIds": job_ids.unwrap_or_default(),
            "reason": reason.unwrap_or_else(|| "user_requested".into()),
        }),
        "resume" | "retry" => json!({
            "action": action.clone(),
            "seriesId": series_id.clone(),
            "jobIds": job_ids.unwrap_or_default(),
        }),
        _ => json!({ "action": action.clone(), "seriesId": series_id.clone(), "assetIds": [] }),
    };
    let body = json!({
        "requestId": request_id,
        "idempotencyKey": format!("worker-quick:{}:{}:{}", action, series_id, chrono::Utc::now().timestamp_millis()),
        "action": action_payload
    });
    post_worker_json(
        &connection.server_url,
        &format!("/api/workers/{}/quick-actions", connection.worker_id),
        &connection.tokens.execution_token,
        &body,
        &connection.device_proof,
    )
    .await
}

#[tauri::command]
pub async fn worker_app_get_series_media_workspace(
    app: tauri::AppHandle,
    series_id: String,
) -> Result<Value, String> {
    if series_id.trim().is_empty() {
        return Err("series_id_required".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    get_worker_json(
        &connection.server_url,
        &format!(
            "/api/workers/{}/series/{}/media-workspace",
            connection.worker_id,
            urlencoding::encode(&series_id)
        ),
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await
}

#[tauri::command]
pub async fn worker_app_get_series_queue(
    app: tauri::AppHandle,
    series_id: Option<String>,
) -> Result<Value, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let path = series_id
        .map(|value| {
            format!(
                "/api/workers/{}/queue?seriesId={}",
                connection.worker_id,
                urlencoding::encode(value.trim())
            )
        })
        .unwrap_or_else(|| format!("/api/workers/{}/queue", connection.worker_id));
    get_worker_json(
        &connection.server_url,
        &path,
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await
}

/// Returns the authoritative cross-workload job projection for this Worker.
/// The series queue endpoint is intentionally retained for series actions, but
/// Overview must read this endpoint so ComfyUI, Remotion, media, Hermes, and
/// future worker lanes are visible in one place.
#[tauri::command]
pub async fn worker_app_get_worker_job_summary(
    app: tauri::AppHandle,
    job_type: Option<String>,
) -> Result<Value, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let path = job_type
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("/api/worker-runtime/jobs/summary?jobType={}", urlencoding::encode(value.trim())))
        .unwrap_or_else(|| "/api/worker-runtime/jobs/summary".to_string());
    get_worker_json(
        &connection.server_url,
        &path,
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await
}

/// Fetches the server-authoritative policy and effective token scopes for the
/// connected Worker. This is read-only; changing grants remains a browser/admin
/// action and the next request observes revocation immediately.
#[tauri::command]
pub async fn worker_app_get_worker_policy(app: tauri::AppHandle) -> Result<Value, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_dir_unavailable".to_string())?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let path = format!("/api/workers/{}/policy", connection.worker_id);
    get_worker_json(
        &connection.server_url,
        &path,
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await
}

#[tauri::command]
pub async fn worker_app_bind_series(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    expected_revision: i32,
    idempotency_key: String,
) -> Result<Value, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let root = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    if root.series_id != series_id {
        return Err("local_root_series_mismatch".into());
    }
    let body = json!({
        "seriesId": series_id,
        "rootId": root.root_id,
        "rootFingerprint": root.root_fingerprint,
        "expectedRevision": expected_revision,
        "idempotencyKey": idempotency_key,
    });
    let if_match = if expected_revision > 0 {
        Some(expected_revision.to_string())
    } else {
        None
    };
    post_worker_json_with_if_match(
        &connection.server_url,
        &format!("/api/workers/{}/series-bindings", connection.worker_id),
        &connection.tokens.execution_token,
        &body,
        &connection.device_proof,
        if_match.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn worker_app_build_media_plan(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    source_relative_name: String,
    options: MediaPlanOptions,
) -> Result<LocalMediaEditPlan, String> {
    let workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .as_ref()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    if root.series_id != series_id {
        return Err("local_root_series_mismatch".into());
    }
    if source_relative_name.trim().is_empty()
        || source_relative_name.starts_with('/')
        || source_relative_name.contains('\\')
        || source_relative_name
            .split('/')
            .any(|part| part == ".." || part.is_empty())
    {
        return Err("relative_path_escape".into());
    }
    let source = root
        .root_path
        .join(&source_relative_name)
        .canonicalize()
        .map_err(|_| "media_source_missing".to_string())?;
    if !source.starts_with(&root.root_path) {
        return Err("relative_path_escape".into());
    }
    let source_is_still = matches!(
        source
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp")
    );
    let actual_duration_ms = if source_is_still {
        options.source_duration_ms.max(1)
    } else {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("app data directory unavailable: {error}"))?;
        let settings = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned".to_string())?
            .clone();
        let tools = MediaToolchain::from_settings(&settings, &app_data_dir);
        probe_media_file(&source, &tools)?
            .duration_ms
            .ok_or_else(|| "source_duration_unknown".to_string())?
    };
    let mut bounded_options = options;
    bounded_options.source_duration_ms = actual_duration_ms;
    build_media_plan(&source_relative_name, &bounded_options)
}

#[tauri::command]
pub async fn worker_app_process_media_asset(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    plan: LocalMediaEditPlan,
) -> Result<LocalMediaQc, String> {
    let workspace = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let root = workspace
        .root
        .as_ref()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    if root.series_id != series_id {
        return Err("local_root_series_mismatch".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let tools = MediaToolchain::from_settings(&settings, &app_data_dir);
    let output = run_allowlisted_ffmpeg(&root.root_path, &plan, &tools)?;
    qc_derived_output_with_probe(&root.root_path, &output, &tools)
}

#[tauri::command]
pub async fn worker_app_submit_media_job(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    binding_revision: i32,
    source_relative_name: String,
    remove_dead_air: bool,
    reframe_9x16: bool,
    focus_mode: String,
    focus_x: f64,
    focus_y: f64,
    still_motion: Option<String>,
    max_duration_ms: u64,
    processing_mode: String,
    idempotency_key: String,
) -> Result<Value, String> {
    if binding_revision <= 0 {
        return Err("series_binding_revision_required".into());
    }
    if processing_mode != "manual_intent" && processing_mode != "automated_ai_editing" {
        return Err("media_processing_mode_invalid".into());
    }
    // Automated AI editing is an intent mode, not a reason to reject the
    // deterministic local pipeline. Auto subject tracking is still blocked
    // below until a validated vision track exists; manual focus remains a
    // valid user-controlled input for automated trimming/reframing.
    if reframe_9x16 && !matches!(focus_mode.as_str(), "manual_region") {
        return Err("focus_track_requires_ai_worker".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    let tools = MediaToolchain::from_settings(&settings, &app_data_dir);
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let root = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    if root.series_id != series_id {
        return Err("local_root_series_mismatch".into());
    }
    let canonical_source = root
        .root_path
        .join(&source_relative_name)
        .canonicalize()
        .map_err(|_| "media_source_missing".to_string())?;
    if !canonical_source.starts_with(&root.root_path) {
        return Err("relative_path_escape".into());
    }
    let metadata =
        fs::metadata(&canonical_source).map_err(|_| "media_source_missing".to_string())?;
    let fingerprint = format!(
        "{:064x}",
        Sha256::digest(
            format!(
                "{}:{}:{}",
                source_relative_name,
                metadata.len(),
                metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|value| value.as_millis())
                    .unwrap_or_default()
            )
            .as_bytes()
        )
    );
    let asset_id = format!("local-{}", &fingerprint[..24]);
    let source_probe = crate::media_pipeline::probe_media_file(&canonical_source, &tools).ok();
    let duration_ms = source_probe.as_ref().and_then(|probe| probe.duration_ms);
    let kind = match canonical_source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg" | "png" | "webp") => "image",
        _ => "video",
    };
    let target = if reframe_9x16 {
        Some(
            json!({ "targetId": "local-focus", "label": "Worker focus region", "kind": "manual_region", "confidence": 1.0, "normalizedX": focus_x.clamp(0.0, 1.0), "normalizedY": focus_y.clamp(0.0, 1.0) }),
        )
    } else {
        None
    };
    let focus_track = if reframe_9x16 {
        json!([{ "timeMs": 0, "normalizedX": focus_x.clamp(0.0, 1.0), "normalizedY": focus_y.clamp(0.0, 1.0), "confidence": 1.0, "method": "user_focus_region" }, { "timeMs": duration_ms.unwrap_or(max_duration_ms).min(max_duration_ms), "normalizedX": focus_x.clamp(0.0, 1.0), "normalizedY": focus_y.clamp(0.0, 1.0), "confidence": 1.0, "method": "user_focus_region" }])
    } else {
        json!([])
    };
    let tracking_mode = match focus_mode.as_str() {
        "auto_object" => "auto_object",
        "auto_subject" => "auto_subject",
        "manual_region" => "manual_region",
        _ => "auto_person",
    };
    let payload = json!({ "kind": "broll_preprocess", "seriesId": series_id, "binding": { "seriesId": root.series_id, "rootId": root.root_id, "rootFingerprint": root.root_fingerprint, "bindingRevision": binding_revision, "workspaceMode": root.workspace_mode, "status": "active" }, "source": { "assetId": asset_id, "kind": kind, "sourceRevision": fingerprint, "sourceFingerprint": fingerprint, "fileName": canonical_source.file_name().and_then(|value| value.to_str()).unwrap_or("media"), "relativeName": source_relative_name, "sizeBytes": metadata.len(), "durationMs": duration_ms, "captureAt": Value::Null }, "probe": { "width": source_probe.as_ref().and_then(|probe| probe.width), "height": source_probe.as_ref().and_then(|probe| probe.height), "fps": Value::Null, "durationMs": duration_ms, "hasAudio": source_probe.as_ref().map(|probe| probe.has_audio).unwrap_or(false), "rotationDegrees": 0, "codec": source_probe.as_ref().and_then(|probe| probe.codec.clone()), "container": source_probe.as_ref().and_then(|probe| probe.container.clone()) }, "editPlan": { "planId": format!("plan-{}", &fingerprint[..24]), "planRevision": "worker-local-v1", "mode": processing_mode, "aspectRatio": if reframe_9x16 { "9:16" } else { "source" }, "deadAir": { "enabled": remove_dead_air, "thresholdDb": -42, "minSilenceMs": 650, "padMs": 120 }, "budget": { "maxDurationMs": max_duration_ms.clamp(1000, 90000), "minDurationMs": 1000, "maxBrollMs": max_duration_ms.clamp(1000, 90000), "preserveNarrativeAudio": true }, "segments": [{ "segmentId": "segment-1", "sourceAssetId": asset_id, "sourceRevision": fingerprint, "startMs": 0, "endMs": duration_ms.unwrap_or(max_duration_ms).min(max_duration_ms), "removeDeadAir": remove_dead_air, "reframe": { "enabled": reframe_9x16, "target": target, "trackingMode": tracking_mode, "aspectRatio": "9:16", "maxCropFraction": 0.6, "fallback": "reject", "focusTrack": focus_track }, "stillMotion": still_motion.map(|motion| json!({ "enabled": true, "motion": motion, "startScale": 1.0, "endScale": 1.18, "durationMs": max_duration_ms.clamp(500, 90000) })) }], "rationale": if processing_mode == "automated_ai_editing" { "Worker App automated AI editing intent" } else { "Worker App local preprocessing intent" } }, "idempotencyKey": idempotency_key });
    post_worker_json(
        &connection.server_url,
        &format!("/api/workers/{}/media-jobs", connection.worker_id),
        &connection.tokens.execution_token,
        &json!({ "payload": payload }),
        &connection.device_proof,
    )
    .await
}

#[tauri::command]
pub async fn worker_app_submit_media_ingest_job(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    series_id: String,
    binding_revision: i32,
    idempotency_key: String,
) -> Result<Value, String> {
    if binding_revision <= 0 {
        return Err("series_binding_revision_required".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let connection = load_series_control_plane_connection(&app_data_dir)?;
    let root = state
        .series_workspace
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?
        .root
        .clone()
        .ok_or_else(|| "local_root_not_selected".to_string())?;
    if root.series_id != series_id {
        return Err("local_root_series_mismatch".into());
    }
    let root_fingerprint = format!("{:064x}", Sha256::digest(root.root_id.as_bytes()));
    let payload = json!({ "kind": "media_ingest", "seriesId": series_id, "binding": { "seriesId": root.series_id, "rootId": root.root_id, "rootFingerprint": root.root_fingerprint, "bindingRevision": binding_revision, "workspaceMode": root.workspace_mode, "status": "active" }, "source": { "assetId": format!("root-{}", &root_fingerprint[..24]), "kind": "video", "sourceRevision": root_fingerprint, "sourceFingerprint": root_fingerprint, "fileName": "local-footage-root", "relativeName": ".", "sizeBytes": 0, "durationMs": Value::Null, "captureAt": Value::Null }, "idempotencyKey": idempotency_key });
    post_worker_json(
        &connection.server_url,
        &format!("/api/workers/{}/media-jobs", connection.worker_id),
        &connection.tokens.execution_token,
        &json!({ "payload": payload }),
        &connection.device_proof,
    )
    .await
}

#[tauri::command]
pub async fn worker_app_save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    settings: WorkerAppSettings,
) -> Result<WorkerAppSettings, String> {
    settings.validate()?;
    let settings = WorkerAppSettings {
        server_url: settings.normalized_server_url(),
        ..settings
    };
    let mut locked = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    *locked = settings.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    save_settings(&app_data_dir, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn worker_app_set_render_update_blocked(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    blocked: bool,
) -> Result<WorkerAppSettings, String> {
    let mut settings = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?
        .clone();
    settings.render_update_blocked = blocked;
    settings.validate()?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    save_settings(&app_data_dir, &settings)?;
    *state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())? = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub async fn worker_app_get_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<Option<StoredWorkerConnection>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let Some(connection) = load_connection(&app_data_dir)? else {
        append_diagnostic_event(&app_data_dir, "connection.restore.none", json!({}));
        return Ok(None);
    };
    let device_proof = match load_connection_device_proof(&app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "connection.restore",
        &connection.tokens,
        &device_proof,
    )
    .inspect_err(|_| {
        let _ = clear_connection(&app_data_dir);
    })?;
    set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
    append_diagnostic_event(
        &app_data_dir,
        "connection.restore.ok",
        json!({
            "workerId": connection.worker.id,
            "serverUrl": connection.server_url,
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    Ok(Some(connection))
}

#[tauri::command]
pub async fn worker_app_clear_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    reason: Option<String>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    // Clearing the connection is the app's most destructive local action — it
    // silently demotes a working machine to "must reconnect by hand", which is
    // indistinguishable from "autostart never ran" the next morning. It is
    // also triggered automatically on some refresh errors, so the reason must
    // outlive the session that decided it.
    crate::diagnostics::log_warn(
        &app_data_dir,
        "connection.cleared",
        json!({
            "reason": reason.unwrap_or_else(|| "unspecified".to_string()),
            "workerId": load_connection(&app_data_dir)
                .ok()
                .flatten()
                .map(|stored| stored.worker.id),
        }),
    );
    clear_connection(&app_data_dir)?;
    set_active_connected_device_proof(&state, None)?;
    if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
        *pending = None;
    }
    worker_app_stop_worker_loop(state).await.map(|_| ())
}

#[tauri::command]
pub async fn worker_app_get_executor_state(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<ExecutorState, String> {
    state
        .executor
        .lock()
        .map(|executor| executor.clone())
        .map_err(|_| "executor lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_run_doctor(app: tauri::AppHandle) -> Result<DoctorSummary, String> {
    build_runtime_doctor(app, false)
}

#[tauri::command]
pub async fn worker_app_run_full_doctor(app: tauri::AppHandle) -> Result<DoctorSummary, String> {
    build_runtime_doctor(app, true)
}

#[tauri::command]
pub async fn worker_app_check_runtime_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<RuntimeUpdateCheck, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;
    let runtime_id = settings.hyperframes_runtime_id();
    let channel = settings.runtime_channel.as_query_value();
    let current_version = if settings.runtime_environment.is_managed_wsl() {
        read_managed_wsl_runtime_version(&settings.managed_wsl_root)?
    } else {
        let (current_manifest_path, _) = runtime_pack_paths(&resource_dir, &effective_runtime_dir);
        read_runtime_pack_manifest(&current_manifest_path)
            .ok()
            .map(|manifest| manifest.version)
    };
    let latest_manifest =
        fetch_runtime_manifest(&settings.normalized_server_url(), runtime_id, channel).await?;
    if latest_manifest.runtime_id != runtime_id {
        return Err(format!(
            "Runtime manifest returned {} but {} was requested.",
            latest_manifest.runtime_id, runtime_id
        ));
    }
    let latest_version = Some(latest_manifest.version.clone());

    Ok(RuntimeUpdateCheck {
        runtime_id: runtime_id.into(),
        channel: channel.into(),
        update_available: runtime_update_available(
            current_version.as_deref(),
            latest_version.as_deref(),
            latest_manifest.allowed,
        ),
        current_version,
        latest_version,
    })
}

#[cfg(target_os = "windows")]
const WSL_BROWSER_DEPENDENCY_REPAIR_SCRIPT: &str = r#"set -Eeuo pipefail
sudo dpkg --configure -a || true
sudo apt-get --fix-broken install -y || true
sudo apt-get update
resolve_pkg() {
  for candidate in "$@"; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}
PACKAGES=(libnspr4 libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core)
AUDIO_PKG="$(resolve_pkg libasound2t64 libasound2 liboss4-salsa-asound2 || true)"
if [ -n "$AUDIO_PKG" ]; then PACKAGES+=("$AUDIO_PKG"); fi
sudo apt-get install -y --no-install-recommends "${PACKAGES[@]}"
fc-cache -fv || true
echo
echo Smart AI Hub WSL browser dependency repair finished.
read -r -p 'Press Enter to close this window...'
"#;

#[cfg(target_os = "windows")]
const MANAGED_WSL_RUNTIME_SETUP_SCRIPT_TEMPLATE: &str = r#"#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=__SMARTAIHUB_MANAGED_WSL_ROOT_EXPR__
SERVER_URL=__SMARTAIHUB_SERVER_URL_EXPR__
RUNTIME_CHANNEL=__SMARTAIHUB_RUNTIME_CHANNEL_EXPR__
mkdir -p "$ROOT" "$ROOT/cache" "$ROOT/logs" "$ROOT/tools"
LOG_PATH="$ROOT/logs/setup-$(date +%Y%m%d-%H%M%S).log"
STATUS_PATH="$ROOT/setup-status.json"
exec > >(tee -a "$LOG_PATH") 2>&1
printf '{"status":"running","message":"Managed WSL runtime setup is running.","version":null,"logPath":"%s","updatedAt":"%s"}\n' "$LOG_PATH" "$(date -Is)" > "$STATUS_PATH"
finish() {
  status=$?
  if [ "$status" -eq 0 ]; then
    status_value="succeeded"
    status_message="Managed WSL runtime setup completed successfully."
  else
    status_value="failed"
    status_message="Managed WSL runtime setup failed with exit code $status."
  fi
  printf '{"status":"%s","message":"%s","version":"%s","logPath":"%s","updatedAt":"%s"}\n' "$status_value" "$status_message" "${RUNTIME_VERSION:-}" "$LOG_PATH" "$(date -Is)" > "$STATUS_PATH"
  echo
  echo "Managed WSL setup log: $LOG_PATH"
  if [ "$status" -eq 0 ]; then
    echo "Managed WSL runtime setup completed successfully."
    echo "Return to the Worker App. It will verify the runtime automatically."
  else
    echo "Managed WSL runtime setup failed with exit code $status."
    echo "Read the error above, then fix it and click Prepare managed WSL runtime again."
  fi
  echo
  read -r -p 'Press Enter to close this window...'
  exit "$status"
}
trap finish EXIT
echo "Smart AI Hub managed WSL runtime root: $ROOT"
echo "Smart AI Hub runtime source: $SERVER_URL"

repair_apt_state() {
  echo "Repairing WSL apt/dpkg state if needed..."
  sudo dpkg --configure -a || true
  sudo apt-get --fix-broken install -y || true
  sudo apt-get update
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  repair_apt_state
  sudo apt-get install -y --no-install-recommends python3-minimal
}

download_url() {
  url="$1"
  dest="$2"
  mkdir -p "$(dirname "$dest")"
  if command -v curl >/dev/null 2>&1; then
    echo "Downloading with WSL curl: $url"
    curl --fail --location --retry 3 --retry-delay 2 --connect-timeout 30 --continue-at - --output "$dest" "$url"
    return 0
  fi
  if [ -x /mnt/c/Windows/System32/curl.exe ]; then
    echo "Downloading with Windows curl.exe through WSL: $url"
    tmp_dest="${dest}.windows-curl-download"
    rm -f "$tmp_dest"
    /mnt/c/Windows/System32/curl.exe --fail --location --retry 3 --retry-delay 2 --connect-timeout 30 "$url" > "$tmp_dest"
    mv "$tmp_dest" "$dest"
    return 0
  fi
  echo "curl was not found; falling back to Python urllib downloader."
  python3 - "$1" "$2" <<'PY'
import os
import shutil
import sys
import urllib.error
import urllib.request

url, dest = sys.argv[1], sys.argv[2]
os.makedirs(os.path.dirname(dest), exist_ok=True)
partial = os.path.getsize(dest) if os.path.exists(dest) else 0
headers = {
    "User-Agent": "SmartAIHub-Worker-App/managed-wsl-runtime (+https://smartaihub.app)",
    "Accept": "application/json, application/zip, application/octet-stream, */*",
    "Connection": "close",
}
mode = "wb"
if partial > 0:
    headers["Range"] = f"bytes={partial}-"
    mode = "ab"
request = urllib.request.Request(url, headers=headers)
try:
    response = urllib.request.urlopen(request, timeout=60)
except urllib.error.HTTPError as exc:
    if exc.code == 416 and partial > 0:
        print(f"Download already complete: {dest}")
        raise SystemExit(0)
    print(f"Download failed: HTTP {exc.code} {exc.reason} for {url}", file=sys.stderr)
    body = exc.read(512)
    if body:
        print(body.decode("utf-8", errors="replace"), file=sys.stderr)
    raise
status = getattr(response, "status", 200)
if status == 200 and partial > 0:
    print("Server did not resume partial download; restarting this archive download.")
    mode = "wb"
    partial = 0
total_header = response.headers.get("Content-Length")
total = int(total_header) + partial if total_header and total_header.isdigit() else 0
downloaded = partial
last_pct = -1
with open(dest, mode + ("" if "b" in mode else "b")) as handle:
    while True:
        chunk = response.read(1024 * 1024)
        if not chunk:
            break
        handle.write(chunk)
        downloaded += len(chunk)
        if total > 0:
            pct = int(downloaded * 100 / total)
            if pct >= last_pct + 5 or pct == 100:
                last_pct = pct
                print(f"Download progress: {pct}% ({downloaded}/{total} bytes)", flush=True)
        else:
            print(f"Downloaded {downloaded} bytes", flush=True)
print(f"Downloaded: {dest}")
PY
}

extract_zip() {
  python3 - "$1" "$2" <<'PY'
import os
import sys
import zipfile

# Field incident 2026-07-30 (Lane B smoke render failed
# `bundle_failed: spawn .../@esbuild/linux-x64/bin/esbuild EACCES`):
# `extractall()` applies a default mode and DROPS the Unix permission bits
# stored in each entry's `external_attr`, so every bundled executable lands
# without its +x bit. Historically that was papered over by the hardcoded
# `chmod +x` list below (node/ffmpeg/ffprobe/chrome) — which silently fails
# to cover anything new, e.g. the Remotion sidecar's own
# `node_modules/@esbuild/linux-x64/bin/esbuild`. Restore the recorded mode
# for every entry instead, so any future bundled binary just works.
archive, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(archive) as zf:
    for info in zf.infolist():
        extracted = zf.extract(info, dest)
        mode = info.external_attr >> 16
        # Older archives (built before the packaging fix) record mode 0 —
        # leave those to the chmod fallback rather than chmod'ing to 000.
        if mode:
            os.chmod(extracted, mode & 0o7777)
print(f"Extracted: {archive}")
PY
}

ensure_python
sudo apt-get update
resolve_pkg() {
  for candidate in "$@"; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}
BASE_PACKAGES=(ca-certificates libnspr4 libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core)
OPTIONAL_PACKAGES=()
AUDIO_PKG="$(resolve_pkg libasound2t64 libasound2 liboss4-salsa-asound2 || true)"
if [ -n "$AUDIO_PKG" ]; then
  OPTIONAL_PACKAGES+=("$AUDIO_PKG")
fi
echo "Installing managed WSL dependencies..."
printf 'Base packages: %s\n' "${BASE_PACKAGES[*]}"
printf 'Audio package: %s\n' "${OPTIONAL_PACKAGES[*]:-none detected}"
repair_apt_state
sudo apt-get install -y --no-install-recommends "${BASE_PACKAGES[@]}" "${OPTIONAL_PACKAGES[@]}"
fc-cache -fv || true
MANIFEST_URL="$SERVER_URL/api/workers/runtime-pack/manifest?runtimeId=hyperframes-wsl2&channel=$RUNTIME_CHANNEL"
MANIFEST_PATH="$ROOT/cache/runtime-manifest.json"
INSTALLED_MARKER="$ROOT/installed-runtime.json"
echo "Downloading runtime manifest..."
rm -f "$MANIFEST_PATH"
download_url "$MANIFEST_URL" "$MANIFEST_PATH"
eval "$(python3 - "$MANIFEST_PATH" "$SERVER_URL" <<'PY'
import json
import sys
from urllib.parse import urljoin

manifest_path, server_url = sys.argv[1], sys.argv[2].rstrip("/") + "/"
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
archive_url = manifest.get("archiveUrl")
archive_sha256 = manifest.get("archiveSha256")
archive_size = manifest.get("archiveSizeBytes")
version = manifest.get("version")
if not archive_url or not archive_sha256:
    raise SystemExit("runtime manifest is missing archiveUrl/archiveSha256")
if not archive_url.startswith(("http://", "https://")):
    archive_url = urljoin(server_url, archive_url.lstrip("/"))
print("ARCHIVE_URL=" + repr(archive_url))
print("ARCHIVE_SHA256=" + repr(archive_sha256))
print("ARCHIVE_SIZE_BYTES=" + repr(str(archive_size or "")))
print("RUNTIME_VERSION=" + repr(str(version or "")))
PY
)"
SAFE_RUNTIME_VERSION="${RUNTIME_VERSION//[^A-Za-z0-9._-]/_}"
ARCHIVE_PATH="$ROOT/cache/runtime-pack-${SAFE_RUNTIME_VERSION}-${ARCHIVE_SHA256:0:16}.zip"
TMP_ARCHIVE_PATH="${ARCHIVE_PATH}.download"
echo "Cleaning stale managed runtime downloads..."
find "$ROOT/cache" -maxdepth 1 -type f \( -name 'runtime-pack.zip' -o -name 'runtime-pack-*.zip' -o -name 'runtime-pack-*.zip.download' \) \
  ! -name "$(basename "$ARCHIVE_PATH")" \
  ! -name "$(basename "$TMP_ARCHIVE_PATH")" \
  -print -delete || true
INSTALLED_SHA256=""
INSTALLED_VERSION=""
if [ -f "$INSTALLED_MARKER" ]; then
  eval "$(python3 - "$INSTALLED_MARKER" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    data = {}
print("INSTALLED_VERSION=" + repr(str(data.get("version") or "")))
print("INSTALLED_SHA256=" + repr(str(data.get("archiveSha256") or "")))
PY
)"
fi
if [ "$INSTALLED_VERSION" = "$RUNTIME_VERSION" ] && [ "$INSTALLED_SHA256" = "$ARCHIVE_SHA256" ] && [ -x "$ROOT/runtime-pack/node/bin/node" ] && [ -x "$ROOT/runtime-pack/browser/chrome" ]; then
  echo "Managed WSL runtime ${RUNTIME_VERSION} is already installed. Re-validating dependencies and executable permissions."
else
  echo "Managed WSL runtime update available or not installed."
  echo "Installed: ${INSTALLED_VERSION:-none} ${INSTALLED_SHA256:-}"
  echo "Latest:    ${RUNTIME_VERSION} ${ARCHIVE_SHA256}"
fi
echo "Downloading HyperFrames managed WSL runtime ${RUNTIME_VERSION}..."
echo "Archive size: ${ARCHIVE_SIZE_BYTES:-unknown} bytes"
if [ -f "$ARCHIVE_PATH" ]; then
  if echo "${ARCHIVE_SHA256}  ${ARCHIVE_PATH}" | sha256sum -c - >/dev/null 2>&1; then
    echo "Using verified cached runtime archive: $ARCHIVE_PATH"
  else
    echo "Cached runtime archive hash changed; removing stale cache."
    rm -f "$ARCHIVE_PATH"
  fi
fi
if [ ! -f "$ARCHIVE_PATH" ]; then
  download_url "$ARCHIVE_URL" "$TMP_ARCHIVE_PATH"
  echo "${ARCHIVE_SHA256}  ${TMP_ARCHIVE_PATH}" | sha256sum -c -
  mv "$TMP_ARCHIVE_PATH" "$ARCHIVE_PATH"
fi
echo "${ARCHIVE_SHA256}  ${ARCHIVE_PATH}" | sha256sum -c -
STAGE="$ROOT/.runtime-install-$$"
rm -rf "$STAGE"
mkdir -p "$STAGE"
echo "Extracting runtime archive..."
extract_zip "$ARCHIVE_PATH" "$STAGE"
test -f "$STAGE/runtime-pack/manifest.json"
rm -rf "$ROOT/runtime-pack" "$ROOT/sidecars"
mv "$STAGE/runtime-pack" "$ROOT/runtime-pack"
if [ -d "$STAGE/sidecars" ]; then
  mv "$STAGE/sidecars" "$ROOT/sidecars"
fi
rm -rf "$STAGE"
chmod +x "$ROOT/runtime-pack/node/bin/node" "$ROOT/runtime-pack/bin/ffmpeg" "$ROOT/runtime-pack/bin/ffprobe" || true
# Belt-and-braces for archives built before the permission-preserving
# packaging fix (mode 0 entries): every bundled node_modules binary needs
# +x, most importantly the Remotion sidecar's esbuild, whose missing +x is
# what surfaced as `bundle_failed: ... esbuild EACCES`. `.../bin/*` and
# `@esbuild/*/bin/*` are the only executables npm ships in a dep tree.
find "$ROOT/runtime-pack" -type d -name node_modules -prune -exec \
  find {} -type f \( -path '*/bin/*' -o -name 'esbuild' \) -exec chmod +x {} \; \; 2>/dev/null || true
find "$ROOT/runtime-pack/browser" -maxdepth 1 -type f \( \
  -name 'chrome' -o \
  -name 'chrome_crashpad_handler' -o \
  -name 'chrome_sandbox' -o \
  -name 'headless_shell' \
\) -exec chmod +x {} \; || true
python3 - "$INSTALLED_MARKER" "$RUNTIME_VERSION" "$ARCHIVE_SHA256" "$ARCHIVE_SIZE_BYTES" "$ARCHIVE_URL" <<'PY'
import json
import sys
from datetime import datetime, timezone

marker_path, version, archive_sha256, archive_size, archive_url = sys.argv[1:6]
payload = {
    "version": version,
    "archiveSha256": archive_sha256,
    "archiveSizeBytes": archive_size,
    "archiveUrl": archive_url,
    "installedAt": datetime.now(timezone.utc).isoformat(),
}
with open(marker_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
cat > "$ROOT/README.txt" <<'EOF'
Smart AI Hub managed WSL runtime environment

This directory is the editable WSL render runtime. Managed mode runs from this root directly and does not fall back to the old runtime-pack execution path.
EOF
echo
echo "Managed WSL runtime environment is ready."
echo "Run Worker App checks again. Managed WSL mode will run from this root directly."
"#;

#[tauri::command]
pub async fn worker_app_open_wsl_dependency_repair() -> Result<String, String> {
    open_wsl_dependency_repair_terminal()
}

#[tauri::command]
pub async fn worker_app_open_managed_wsl_runtime_setup(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<String, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    open_managed_wsl_runtime_setup_terminal(
        &settings.managed_wsl_root,
        &settings.normalized_server_url(),
        settings.runtime_channel.as_query_value(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedWslRuntimeSetupStatus {
    pub status: String,
    pub message: String,
    pub version: Option<String>,
    pub log_path: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn worker_app_get_managed_wsl_runtime_setup_status(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<ManagedWslRuntimeSetupStatus, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    read_managed_wsl_runtime_setup_status(&settings.managed_wsl_root)
}

#[cfg(target_os = "windows")]
fn open_wsl_dependency_repair_terminal() -> Result<String, String> {
    let script = WSL_BROWSER_DEPENDENCY_REPAIR_SCRIPT;
    if std::process::Command::new("wt.exe")
        .args(["wsl.exe", "-e", "bash", "-lc", script])
        .spawn()
        .is_ok()
    {
        return Ok(
            "Opened Windows Terminal to repair WSL browser dependencies. Enter your WSL sudo password if prompted, then run checks again."
                .into(),
        );
    }

    std::process::Command::new("cmd.exe")
        .args([
            "/C",
            "start",
            "Smart AI Hub WSL Repair",
            "wsl.exe",
            "-e",
            "bash",
            "-lc",
            script,
        ])
        .spawn()
        .map_err(|error| format!("failed to open WSL repair terminal: {error}"))?;
    Ok(
        "Opened a WSL terminal to repair browser dependencies. Enter your WSL sudo password if prompted, then run checks again."
            .into(),
    )
}

#[cfg(target_os = "windows")]
fn open_managed_wsl_runtime_setup_terminal(
    managed_wsl_root: &str,
    server_url: &str,
    runtime_channel: &str,
) -> Result<String, String> {
    let root = if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    };
    let script = MANAGED_WSL_RUNTIME_SETUP_SCRIPT_TEMPLATE
        .replace(
            "__SMARTAIHUB_MANAGED_WSL_ROOT_EXPR__",
            &wsl_shell_assignment_expr(root),
        )
        .replace(
            "__SMARTAIHUB_SERVER_URL_EXPR__",
            &shell_single_quote(server_url.trim_end_matches('/')),
        )
        .replace(
            "__SMARTAIHUB_RUNTIME_CHANNEL_EXPR__",
            &shell_single_quote(runtime_channel),
        );
    let setup_script_path = write_managed_wsl_setup_script(&script)?;
    let wsl_setup_script_path = windows_path_to_wsl_string(&setup_script_path);
    if std::process::Command::new("wt.exe")
        .args(["wsl.exe", "-e", "bash", &wsl_setup_script_path])
        .spawn()
        .is_ok()
    {
        return Ok(
            "Opened a visible Windows Terminal to install the managed WSL runtime. Keep that terminal open, enter your WSL sudo password if prompted, watch the download/extract progress, then run checks again after it finishes."
                .into(),
        );
    }

    std::process::Command::new("cmd.exe")
        .args([
            "/C",
            "start",
            "Smart AI Hub Managed WSL Runtime",
            "wsl.exe",
            "-e",
            "bash",
            &wsl_setup_script_path,
        ])
        .spawn()
        .map_err(|error| format!("failed to open managed WSL setup terminal: {error}"))?;
    Ok(
        "Opened a visible WSL terminal to install the managed runtime. Keep that terminal open, enter your WSL sudo password if prompted, watch the download/extract progress, then run checks again after it finishes."
            .into(),
    )
}

#[cfg(target_os = "windows")]
fn read_managed_wsl_runtime_setup_status(
    managed_wsl_root: &str,
) -> Result<ManagedWslRuntimeSetupStatus, String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let root_expr = wsl_shell_assignment_expr(if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    });
    let script = format!(
        r#"ROOT={root_expr}
STATUS_PATH="$ROOT/setup-status.json"
if [ ! -f "$STATUS_PATH" ]; then
  printf '{{"status":"not_started","message":"Managed WSL runtime setup has not started yet.","version":null,"logPath":null,"updatedAt":null}}'
else
  cat "$STATUS_PATH"
fi"#
    );
    let output = std::process::Command::new("wsl.exe")
        .args(["-e", "bash", "-lc", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("unable to inspect Managed WSL setup status: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "unable to inspect Managed WSL setup status: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice::<ManagedWslRuntimeSetupStatus>(&output.stdout)
        .map_err(|error| format!("invalid Managed WSL setup status: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn read_managed_wsl_runtime_setup_status(
    _managed_wsl_root: &str,
) -> Result<ManagedWslRuntimeSetupStatus, String> {
    Ok(ManagedWslRuntimeSetupStatus {
        status: "not_started".into(),
        message: "Managed WSL runtime setup can only run from Windows.".into(),
        version: None,
        log_path: None,
        updated_at: None,
    })
}

#[cfg(target_os = "windows")]
fn write_managed_wsl_setup_script(script: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("smart-ai-hub-worker-app");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create managed WSL setup script dir: {error}"))?;
    let path = dir.join("managed-wsl-runtime-setup.sh");
    fs::write(&path, script)
        .map_err(|error| format!("failed to write managed WSL setup script: {error}"))?;
    Ok(path)
}

#[cfg(not(target_os = "windows"))]
fn open_wsl_dependency_repair_terminal() -> Result<String, String> {
    Err("WSL dependency repair can only be launched from the Windows Worker App.".into())
}

#[cfg(not(target_os = "windows"))]
fn open_managed_wsl_runtime_setup_terminal(
    _managed_wsl_root: &str,
    _server_url: &str,
    _runtime_channel: &str,
) -> Result<String, String> {
    Err("Managed WSL runtime setup can only be launched from the Windows Worker App.".into())
}

fn build_runtime_doctor(
    app: tauri::AppHandle,
    include_host_checks: bool,
) -> Result<DoctorSummary, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let settings = crate::settings::load_settings(&app_data_dir);
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;
    let mut doctor = doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir);
    annotate_runtime_doctor_for_settings(
        &mut doctor,
        &settings,
        include_host_checks,
        &effective_runtime_dir,
    );
    Ok(doctor)
}

pub(crate) fn annotate_runtime_doctor_for_settings(
    doctor: &mut DoctorSummary,
    settings: &WorkerAppSettings,
    include_host_checks: bool,
    effective_runtime_dir: &Path,
) {
    let runtime_manifest = doctor
        .checks
        .iter()
        .find(|check| check.id == "runtime_manifest");
    let runtime_id = runtime_manifest
        .and_then(|check| detail_string(&check.details_json, "runtimeId"))
        .unwrap_or_else(|| "unknown".to_string());
    let runtime_platform = doctor
        .checks
        .iter()
        .find(|check| check.id == "official_hyperframes_renderer")
        .and_then(|check| detail_string(&check.details_json, "runtimePlatform"))
        .unwrap_or_else(|| runtime_id.clone());
    let runtime_platform_normalized = runtime_platform.to_ascii_lowercase();
    let installed_wsl2_profile = runtime_platform_normalized.contains("wsl2")
        || runtime_platform_normalized.contains("linux")
        || runtime_id.to_ascii_lowercase().contains("wsl2");

    let uses_wsl2_runtime = settings.uses_wsl2_runtime();

    if settings.runtime_environment.is_managed_wsl() {
        doctor.checks.clear();
        if include_host_checks {
            doctor.checks.push(wsl2_host_check());
            doctor
                .checks
                .push(managed_wsl_runtime_check(&settings.managed_wsl_root));
        } else {
            doctor.checks.push(DoctorCheck {
                id: "managed_wsl_runtime".into(),
                status: "warn".into(),
                message:
                    "Managed WSL runtime mode is selected. Run full checks to verify the WSL runtime root."
                        .into(),
                details_json: json!({
                    "managedWslRoot": settings.managed_wsl_root.clone(),
                }),
            });
        }
        let managed_has_error = doctor.checks.iter().any(|check| check.status == "error");
        let managed_verified = doctor
            .checks
            .iter()
            .any(|check| check.id == "managed_wsl_runtime" && check.status == "ok");
        doctor.checks.push(DoctorCheck {
            id: "installer_set".into(),
            status: if managed_has_error {
                "error"
            } else if managed_verified {
                "ok"
            } else {
                "warn"
            }
            .into(),
            message: if managed_has_error {
                "Managed WSL runtime is not ready. The Worker App will not claim render jobs until the WSL runtime root passes checks."
                    .into()
            } else if managed_verified {
                "Managed WSL runtime is ready. Render jobs will run from the managed WSL runtime root."
                    .into()
            } else {
                "Managed WSL runtime has not been fully checked yet. Run checks after the visible setup terminal finishes."
                    .into()
            },
            details_json: json!({
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "managedWslRoot": settings.managed_wsl_root.clone(),
            }),
        });
        if managed_has_error || !managed_verified {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Open Prepare managed WSL runtime, keep the terminal visible until download/extract finishes, then run checks again. Managed mode does not fall back to the old runtime-pack execution path.",
            );
        }
        recompute_doctor_status(doctor);
        doctor.official_hyperframes_runtime = Some(true);
        doctor.runtime_kind = Some("official_hyperframes".into());
        return;
    }

    if uses_wsl2_runtime {
        let wsl2_profile_ok = installed_wsl2_profile;
        doctor.checks.push(DoctorCheck {
            id: "wsl2_runtime_profile".into(),
            status: if wsl2_profile_ok { "ok" } else { "error" }.into(),
            message: if wsl2_profile_ok {
                "Runtime settings and installed pack are aligned for the WSL2 HyperFrames profile."
                    .into()
            } else {
                "Worker App is set to use WSL2, but the installed runtime pack is not the WSL2/Linux HyperFrames pack."
                    .into()
            },
            details_json: json!({
                "useWsl2Setting": settings.use_wsl2,
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "runtimeId": runtime_id,
                "runtimePlatform": runtime_platform,
            }),
        });
        if !wsl2_profile_ok {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Download the default WSL2 HyperFrames runtime pack, or use legacy Windows runtime mode only if WSL2 is not available.",
            );
        }
        if include_host_checks {
            doctor.checks.push(wsl2_host_check());
            doctor
                .checks
                .push(wsl2_browser_dependencies_check(effective_runtime_dir));
            if doctor
                .checks
                .iter()
                .any(|check| check.id == "wsl2_browser_dependencies" && check.status == "error")
            {
                push_unique_action(
                    &mut doctor.recommended_actions,
                    "Repair WSL2 browser dependencies by clicking Prepare managed WSL runtime again. On Ubuntu 24.04 the app will install libasound2t64 instead of the old virtual libasound2 package.",
                );
            }
        }
    } else if cfg!(target_os = "macos") {
        let native_mac_runtime = runtime_id == "hyperframes-macos-arm64"
            && runtime_platform_normalized.contains("macos");
        doctor.checks.push(DoctorCheck {
            id: "macos_runtime_profile".into(),
            status: if native_mac_runtime { "ok" } else { "error" }.into(),
            message: if native_mac_runtime {
                "Worker App is locked to the native macOS arm64 HyperFrames runtime.".into()
            } else {
                "macOS Worker App refuses WSL2 and Windows runtime profiles.".into()
            },
            details_json: json!({
                "runtimeId": runtime_id,
                "runtimePlatform": runtime_platform,
                "requiredRuntimeId": "hyperframes-macos-arm64",
            }),
        });
        if !native_mac_runtime {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Install hyperframes-macos-arm64. Do not use WSL2 or Windows runtime archives on macOS.",
            );
        }
    } else {
        doctor.checks.push(DoctorCheck {
            id: "wsl2_runtime_profile".into(),
            status: if installed_wsl2_profile { "warn" } else { "ok" }.into(),
            message: if installed_wsl2_profile {
                "A WSL2/Linux runtime pack is installed while the Worker App is configured for legacy Windows runtime mode."
                    .into()
            } else {
                "Worker App is configured for legacy Windows runtime mode.".into()
            },
            details_json: json!({
                "useWsl2Setting": settings.use_wsl2,
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "runtimeId": runtime_id,
                "runtimePlatform": runtime_platform,
            }),
        });
        if installed_wsl2_profile {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Enable WSL2 in Worker preferences to use the installed WSL2 HyperFrames runtime pack.",
            );
        }
    }

    let required_runtime_checks = [
        "runtime_manifest",
        "runtime_host_platform",
        "runtime_bundle",
        "official_hyperframes_renderer",
        "hyperframes_native_dependencies",
        "browser_runtime",
        "media_tools",
        "hyperframes_sidecar",
        "runtime_sidecar_policy",
        "runtime_hash",
        "runtime_signature_bundle",
        "thai_font",
        "tool_versions",
    ];
    let missing_runtime_checks: Vec<String> = required_runtime_checks
        .iter()
        .filter(|id| {
            doctor
                .checks
                .iter()
                .find(|check| check.id == **id)
                .map(|check| check.status == "error")
                .unwrap_or(true)
        })
        .map(|id| (*id).to_string())
        .collect();
    let wsl2_blocked = uses_wsl2_runtime
        && include_host_checks
        && doctor.checks.iter().any(|check| {
            (check.id == "wsl2_host" || check.id == "wsl2_browser_dependencies")
                && check.status == "error"
        });
    let installer_complete = missing_runtime_checks.is_empty() && !wsl2_blocked;
    doctor.checks.push(DoctorCheck {
        id: "installer_set".into(),
        status: if installer_complete { "ok" } else { "error" }.into(),
        message: if installer_complete {
            if cfg!(target_os = "macos") {
                "Native macOS arm64 runtime, sidecar, media tools, browser runtime, checksum, signature, and Thai font metadata are complete.".into()
            } else {
                "WSL2 readiness, runtime pack, sidecar, media tools, browser runtime, checksum, signature, and Thai font metadata are complete.".into()
            }
        } else {
            "The Worker App installation is not complete enough to safely claim HyperFrames render jobs."
                .into()
        },
        details_json: json!({
            "missingRuntimeChecks": missing_runtime_checks,
            "wsl2Blocked": wsl2_blocked,
        }),
    });
    if !installer_complete {
        push_unique_action(
            &mut doctor.recommended_actions,
            if cfg!(target_os = "macos") {
                "Install the native hyperframes-macos-arm64 runtime, then run checks again. WSL2 and Windows runtimes are not valid on macOS."
            } else {
                "Run Download render runtime, then run checks again. If WSL2 host is blocked, install or repair WSL2 before accepting render jobs."
            },
        );
    }

    recompute_doctor_status(doctor);
}

fn detail_string(details: &Value, key: &str) -> Option<String> {
    details
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn push_unique_action(actions: &mut Vec<String>, action: &str) {
    if !actions.iter().any(|existing| existing == action) {
        actions.push(action.to_string());
    }
}

fn recompute_doctor_status(doctor: &mut DoctorSummary) {
    let has_error = doctor.checks.iter().any(|check| check.status == "error");
    let has_warn = doctor.checks.iter().any(|check| check.status == "warn");
    doctor.status = if has_error {
        "blocked"
    } else if has_warn {
        "degraded"
    } else {
        "ready"
    }
    .into();
}

#[cfg(target_os = "windows")]
fn managed_wsl_runtime_check(managed_wsl_root: &str) -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let root = if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    };
    let root_expr = wsl_shell_assignment_expr(root);
    let script = format!(
        r#"ROOT={root_expr}
missing=0
check_file() {{
  if [ ! -e "$1" ]; then
    echo "missing: $1"
    missing=1
  elif [ "$2" = executable ] && [ ! -x "$1" ]; then
    echo "not executable: $1"
    missing=1
  fi
}}
check_command() {{
  label="$1"
  shift
  if ! output="$("$@" 2>&1 | head -n 1)"; then
    echo "$label failed: $output"
    missing=1
  else
    echo "$label: $output"
  fi
}}
check_file "$ROOT/runtime-pack/node/bin/node" executable
check_file "$ROOT/runtime-pack/hyperframes-sidecar/render.mjs" file
check_file "$ROOT/runtime-pack/bin/ffmpeg" executable
check_file "$ROOT/runtime-pack/bin/ffprobe" executable
check_file "$ROOT/runtime-pack/browser/chrome" executable
check_file "$ROOT/runtime-pack/browser/chrome_crashpad_handler" executable
check_file "$ROOT/installed-runtime.json" file
if [ -x "$ROOT/runtime-pack/node/bin/node" ]; then
  NODE_MAJOR="$("$ROOT/runtime-pack/node/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [ "${{NODE_MAJOR:-0}}" -lt 22 ]; then
    echo "node version too old: $("$ROOT/runtime-pack/node/bin/node" --version 2>/dev/null || echo unknown)"
    missing=1
  else
    check_command "node" "$ROOT/runtime-pack/node/bin/node" --version
  fi
fi
if [ -x "$ROOT/runtime-pack/bin/ffmpeg" ]; then check_command "ffmpeg" "$ROOT/runtime-pack/bin/ffmpeg" -version; fi
if [ -x "$ROOT/runtime-pack/bin/ffprobe" ]; then check_command "ffprobe" "$ROOT/runtime-pack/bin/ffprobe" -version; fi
if [ -x "$ROOT/runtime-pack/browser/chrome" ]; then
  ldd "$ROOT/runtime-pack/browser/chrome" | awk '/not found/ {{ print "missing shared library: " $1; missing=1 }} END {{ exit missing }}' || missing=1
  check_command "chrome" "$ROOT/runtime-pack/browser/chrome" --version
fi
if command -v fc-match >/dev/null 2>&1; then
  echo "fontconfig: $(fc-match 'Noto Sans Thai' | head -n 1)"
else
  echo "missing command: fc-match"
  missing=1
fi
if [ -f "$ROOT/runtime-pack/manifest.json" ]; then
  python3 - "$ROOT/runtime-pack/manifest.json" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
print("runtime_manifest_version=" + str(manifest.get("version") or ""))
print("runtime_manifest_remotion_contract=" + str(manifest.get("remotionPlatformContractVersion") or ""))
PY
fi
if [ -d /dev/shm ]; then
  SHM_MB="$(df -Pm /dev/shm | awk 'NR==2 {{ print $2 }}')"
  echo "dev shm: ${{SHM_MB:-unknown}} MB"
  if [ "${{SHM_MB:-0}}" -lt 256 ]; then
    echo "warning: /dev/shm is below upstream recommended 256 MB"
  fi
fi
exit $missing"#
    );

    match std::process::Command::new("wsl.exe")
        .args(["-e", "bash", "-lc", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let runtime_version = stdout
                .lines()
                .find_map(|line| line.strip_prefix("runtime_manifest_version="))
                .unwrap_or_default()
                .to_string();
            let remotion_contract = stdout
                .lines()
                .find_map(|line| line.strip_prefix("runtime_manifest_remotion_contract="))
                .unwrap_or_default()
                .to_string();
            let remotion_contract_ready = remotion_contract
                == REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION;
            DoctorCheck {
                id: "managed_wsl_runtime".into(),
                status: "ok".into(),
                message: "Managed WSL runtime root contains the latest prepared runtime marker, Node 22+, HyperFrames sidecar, FFmpeg, ffprobe, Chrome, fonts, and required Chrome shared libraries.".into(),
                details_json: json!({
                    "managedWslRoot": root,
                    "stdout": stdout,
                    "runtimeVersion": runtime_version,
                    "remotionPlatformContractVersion": remotion_contract,
                    "remotionContractReady": remotion_contract_ready,
                }),
            }
        },
        Ok(output) => DoctorCheck {
            id: "managed_wsl_runtime".into(),
            status: "error".into(),
            message: "Managed WSL runtime root is incomplete. The Worker App will not fall back to the old runtime-pack execution path.".into(),
            details_json: json!({
                "managedWslRoot": root,
                "exitCode": output.status.code(),
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "managed_wsl_runtime".into(),
            status: "error".into(),
            message: "Managed WSL runtime could not be checked because wsl.exe failed to start.".into(),
            details_json: json!({
                "managedWslRoot": root,
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn managed_wsl_runtime_check(managed_wsl_root: &str) -> DoctorCheck {
    DoctorCheck {
        id: "managed_wsl_runtime".into(),
        status: "warn".into(),
        message:
            "Managed WSL runtime checks run only in the Windows Worker App because they require wsl.exe."
                .into(),
        details_json: json!({
            "managedWslRoot": managed_wsl_root,
        }),
    }
}

#[cfg(target_os = "windows")]
fn wsl2_host_check() -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    match std::process::Command::new("wsl.exe")
        .arg("--status")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => DoctorCheck {
            id: "wsl2_host".into(),
            status: "ok".into(),
            message: "WSL2 is installed and responding on this Windows host.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
            }),
        },
        Ok(output) => DoctorCheck {
            id: "wsl2_host".into(),
            status: "error".into(),
            message: "WSL2 is installed but did not report a healthy status.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "exitCode": output.status.code(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "wsl2_host".into(),
            status: "error".into(),
            message: "WSL2 is not available to the Worker App on this Windows host.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn wsl2_host_check() -> DoctorCheck {
    DoctorCheck {
        id: "wsl2_host".into(),
        status: "warn".into(),
        message: "WSL2 host readiness can only be verified from the Windows Worker App runtime."
            .into(),
        details_json: json!({
            "command": "wsl.exe --status",
            "hostPlatform": std::env::consts::OS,
        }),
    }
}

#[cfg(target_os = "windows")]
fn wsl2_browser_dependencies_check(effective_runtime_dir: &Path) -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let browser_root = effective_runtime_dir.join("runtime-pack").join("browser");
    let Some(browser_path) = find_browser_binary(&browser_root) else {
        return DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 browser dependency check could not find the bundled Linux browser."
                .into(),
            details_json: json!({
                "browserRoot": browser_root.to_string_lossy(),
            }),
        };
    };
    let wsl_browser_path = windows_path_to_wsl(&browser_path);
    let browser_libs_path = browser_root
        .parent()
        .map(|runtime_pack| runtime_pack.join("browser-libs"))
        .unwrap_or_else(|| {
            effective_runtime_dir
                .join("runtime-pack")
                .join("browser-libs")
        });
    let wsl_browser_libs_path = windows_path_to_wsl(&browser_libs_path);
    let ldd_script = format!(
        "LD_LIBRARY_PATH={} ldd {}",
        shell_single_quote(&wsl_browser_libs_path),
        shell_single_quote(&wsl_browser_path)
    );
    match std::process::Command::new("wsl.exe")
        .arg("-e")
        .arg("bash")
        .arg("-lc")
        .arg(&ldd_script)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let missing: Vec<String> = stdout
                .lines()
                .filter(|line| line.contains("not found"))
                .map(|line| line.trim().to_string())
                .collect();
            if missing.is_empty() {
                DoctorCheck {
                    id: "wsl2_browser_dependencies".into(),
                    status: "ok".into(),
                    message: "WSL2 can load the bundled Linux browser shared libraries.".into(),
                    details_json: json!({
                        "command": "wsl.exe -e ldd <bundled-browser>",
                        "browser": wsl_browser_path,
                        "browserLibs": wsl_browser_libs_path,
                    }),
                }
            } else {
                DoctorCheck {
                    id: "wsl2_browser_dependencies".into(),
                    status: "error".into(),
                    message:
                        "WSL2 is missing Linux shared libraries required by the bundled browser."
                            .into(),
                    details_json: json!({
                        "command": "wsl.exe -e ldd <bundled-browser>",
                        "browser": wsl_browser_path,
                        "browserLibs": wsl_browser_libs_path,
                        "missing": missing,
                        "recommendedUbuntuPackages": "libnss3 libnspr4 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libasound2t64|libasound2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fonts-liberation fonts-dejavu-core",
                    }),
                }
            }
        }
        Ok(output) => DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 could not inspect the bundled browser shared libraries.".into(),
            details_json: json!({
                "command": "wsl.exe -e ldd <bundled-browser>",
                "browser": wsl_browser_path,
                "browserLibs": wsl_browser_libs_path,
                "exitCode": output.status.code(),
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 browser dependency check could not run ldd.".into(),
            details_json: json!({
                "command": "wsl.exe -e ldd <bundled-browser>",
                "browser": wsl_browser_path,
                "browserLibs": wsl_browser_libs_path,
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn wsl2_browser_dependencies_check(_effective_runtime_dir: &Path) -> DoctorCheck {
    DoctorCheck {
        id: "wsl2_browser_dependencies".into(),
        status: "warn".into(),
        message:
            "WSL2 browser shared-library readiness can only be verified from the Windows Worker App runtime."
                .into(),
        details_json: json!({
            "command": "wsl.exe -e ldd <bundled-browser>",
            "hostPlatform": std::env::consts::OS,
        }),
    }
}

#[cfg(target_os = "windows")]
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "windows")]
fn wsl_shell_assignment_expr(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "~" {
        return "\"${HOME}\"".into();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return format!("\"${{HOME}}/{}\"", rest.replace('"', "\\\""));
    }
    shell_single_quote(trimmed)
}

#[cfg(target_os = "windows")]
fn windows_path_to_wsl_string(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = normalized
            .chars()
            .next()
            .unwrap_or('c')
            .to_ascii_lowercase();
        format!("/mnt/{drive}{}", &normalized[2..])
    } else {
        normalized
    }
}

#[cfg(target_os = "windows")]
fn find_browser_binary(root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_browser_binary(&path) {
                return Some(found);
            }
        } else if path.is_file() {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if matches!(
                name.as_str(),
                "chrome" | "headless_shell" | "chrome-headless-shell"
            ) {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_path_to_wsl(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = normalized
            .chars()
            .next()
            .unwrap_or('c')
            .to_ascii_lowercase();
        format!("/mnt/{drive}{}", &normalized[2..])
    } else {
        normalized
    }
}

#[tauri::command]
pub async fn worker_app_clear_runtime_pack(app: tauri::AppHandle) -> Result<(), String> {
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;

    let runtime_pack = effective_runtime_dir.join("runtime-pack");
    let sidecars = effective_runtime_dir.join("sidecars");

    // Use the safe replacement pattern to avoid Windows locking issues
    if runtime_pack.exists() {
        let temp_old = effective_runtime_dir.join(format!(
            "runtime-pack_old_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        if fs::rename(&runtime_pack, &temp_old).is_ok() {
            let _ = fs::remove_dir_all(&temp_old);
        } else {
            let _ = fs::remove_dir_all(&runtime_pack);
        }
    }

    if sidecars.exists() {
        let temp_old = effective_runtime_dir.join(format!(
            "sidecars_old_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        if fs::rename(&sidecars, &temp_old).is_ok() {
            let _ = fs::remove_dir_all(&temp_old);
        } else {
            let _ = fs::remove_dir_all(&sidecars);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn worker_app_install_runtime_pack(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<RuntimeInstallResult, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let runtime_id = settings.hyperframes_runtime_id();
    let manifest = fetch_runtime_manifest(
        &settings.normalized_server_url(),
        runtime_id,
        settings.runtime_channel.as_query_value(),
    )
    .await?;
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;
    if !manifest.allowed {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Runtime pack is not allowed by server policy.".into()),
            manifest: Some(manifest),
            doctor: doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir),
        });
    }
    let archive_url = manifest
        .archive_url
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveUrl.".to_string())?;
    let archive_sha256 = manifest
        .archive_sha256
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveSha256.".to_string())?;
    let absolute_archive_url = absolute_url(&settings.normalized_server_url(), &archive_url)?;
    let temp_dir = effective_runtime_dir.join("runtime-downloads");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("failed to create runtime download directory: {error}"))?;
    let archive_path = temp_dir.join(format!(
        "{}-{}.zip",
        sanitize_file_segment(&manifest.runtime_id),
        sanitize_file_segment(&manifest.version)
    ));
    download_runtime_archive(
        &absolute_archive_url,
        &archive_path,
        manifest.archive_size_bytes,
    )
    .await?;
    let digest = file_sha256(&archive_path)?;
    if !digest.eq_ignore_ascii_case(&archive_sha256) {
        return Err(format!(
            "Runtime archive checksum mismatch. Expected {archive_sha256}, got {digest}."
        ));
    }
    extract_runtime_archive(&archive_path, &effective_runtime_dir)?;

    let installed_manifest_path = effective_runtime_dir
        .join("runtime-pack")
        .join("manifest.json");
    let installed_manifest = read_runtime_pack_manifest(&installed_manifest_path)?;
    if installed_manifest.runtime_profile_hash != manifest.runtime_profile_hash {
        return Err("Installed runtime profile hash does not match server manifest.".into());
    }
    let doctor = doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir);
    if doctor.status != "ready" {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: "Runtime was installed, but readiness checks are still blocked.".into(),
            manifest: Some(installed_manifest),
            doctor,
        });
    }
    Ok(RuntimeInstallResult {
        status: "installed".into(),
        message: format!("Runtime pack {} is ready.", installed_manifest.version),
        manifest: Some(installed_manifest),
        doctor,
    })
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 §11 — Hermes runtime pack install + doctor. Mirrors
// `worker_app_install_runtime_pack`/`worker_app_run_doctor` step-for-step
// against the hermes-specific manifest/doctor in `hermes_runtime.rs`.
// ────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRuntimeInstallResult {
    pub status: String,
    pub message: String,
    pub doctor: DoctorSummary,
}

fn hermes_profile_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("hermes-profiles")
}

/// Real `hermes --version` probe (production `query_version` implementation
/// for `hermes_doctor_from_manifest_path`). Tests inject their own closure.
pub(crate) fn query_hermes_version(hermes_executable: &Path) -> Result<String, String> {
    let mut command = std::process::Command::new(hermes_executable);
    command.arg("--version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = command
        .output()
        .map_err(|error| format!("failed to run hermes --version: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "hermes --version exited with {:?}",
            output.status.code()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// FIX A — shared production doctor+version computation, used by BOTH the
/// standalone `worker_app_hermes_doctor` command AND the real registration
/// call site (`worker_app_start_connect_session`) so registration always
/// carries real hermes readiness instead of `HermesRegistrationInfo::not_installed()`.
pub(crate) fn compute_hermes_doctor_and_version(
    app_data_dir: &Path,
) -> (DoctorSummary, Option<String>) {
    let (manifest_path, pack_root) = crate::hermes_runtime::hermes_runtime_pack_paths(app_data_dir);
    let profile_root = hermes_profile_root(app_data_dir);
    let doctor = crate::hermes_runtime::hermes_doctor_from_manifest_path(
        &manifest_path,
        &pack_root,
        &profile_root,
        query_hermes_version,
    );
    let hermes_version = crate::hermes_runtime::read_hermes_runtime_manifest(&manifest_path)
        .ok()
        .map(|manifest| manifest.hermes_version);
    (doctor, hermes_version)
}

#[tauri::command]
pub async fn worker_app_hermes_doctor(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<DoctorSummary, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let (doctor, hermes_version) = compute_hermes_doctor_and_version(&app_data_dir);
    if let Ok(mut executor) = state.executor.lock() {
        executor.set_hermes_doctor(doctor.status.clone(), hermes_version);
    }
    Ok(doctor)
}

async fn fetch_hermes_runtime_manifest(
    server_url: &str,
    runtime_id: &str,
    channel: &str,
) -> Result<crate::hermes_runtime::HermesRuntimeManifest, String> {
    let url = format!(
        "{}/api/workers/runtime-pack/manifest?runtimeId={}&channel={}",
        server_url.trim().trim_end_matches('/'),
        runtime_id.trim(),
        channel.trim()
    );
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to fetch hermes runtime manifest: {error}"))?;
    parse_json_response::<crate::hermes_runtime::HermesRuntimeManifest>(response)
        .await
        .map_err(|error| format!("hermes runtime manifest unavailable: {error}"))
}

fn extract_hermes_runtime_archive(archive_path: &Path, app_data_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path)
        .map_err(|error| format!("failed to open hermes runtime archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("hermes runtime archive is not a valid zip: {error}"))?;
    let install_root = app_data_dir.join("hermes-runtime-install");
    if install_root.exists() {
        fs::remove_dir_all(&install_root)
            .map_err(|error| format!("failed to clear hermes runtime install staging: {error}"))?;
    }
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("failed to create hermes runtime install staging: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read hermes runtime archive entry: {error}"))?;
        let out_path = safe_archive_output_path(&install_root, entry.name())?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("failed to create hermes runtime directory: {error}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create hermes runtime directory: {error}"))?;
        }
        let mut out_file = File::create(&out_path)
            .map_err(|error| format!("failed to create hermes runtime file: {error}"))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|error| format!("failed to extract hermes runtime file: {error}"))?;
    }
    if !install_root.join("manifest.json").is_file() {
        return Err("Hermes runtime archive must contain manifest.json.".into());
    }
    replace_dir(&install_root, &app_data_dir.join("hermes-runtime"))?;
    Ok(())
}

#[tauri::command]
pub async fn worker_app_install_hermes_runtime(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<HermesRuntimeInstallResult, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    // Keep the Hermes runtime family platform-specific: macOS selects the
    // native Apple Silicon pack while Windows continues selecting its own
    // x64 pack and is never affected by a Mac runtime release.
    let runtime_id = if cfg!(target_os = "macos") {
        crate::hermes_runtime::HERMES_RUNTIME_ID_MACOS
    } else {
        crate::hermes_runtime::HERMES_RUNTIME_ID_WINDOWS
    };
    let manifest = fetch_hermes_runtime_manifest(
        &settings.normalized_server_url(),
        runtime_id,
        settings.runtime_channel.as_query_value(),
    )
    .await?;
    let (manifest_path, pack_root) =
        crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
    let profile_root = hermes_profile_root(&app_data_dir);
    if !manifest.allowed {
        return Ok(HermesRuntimeInstallResult {
            status: "blocked".into(),
            message: manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Hermes runtime pack is not allowed by server policy.".into()),
            doctor: crate::hermes_runtime::hermes_doctor_from_manifest_path(
                &manifest_path,
                &pack_root,
                &profile_root,
                query_hermes_version,
            ),
        });
    }
    let archive_url = manifest
        .archive_url
        .clone()
        .ok_or_else(|| "Hermes runtime manifest does not include archiveUrl.".to_string())?;
    let archive_sha256 = manifest
        .archive_sha256
        .clone()
        .ok_or_else(|| "Hermes runtime manifest does not include archiveSha256.".to_string())?;
    let absolute_archive_url = absolute_url(&settings.normalized_server_url(), &archive_url)?;
    let temp_dir = app_data_dir.join("hermes-runtime-downloads");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("failed to create hermes runtime download directory: {error}"))?;
    let archive_path = temp_dir.join(format!(
        "{}-{}.zip",
        sanitize_file_segment(&manifest.runtime_id),
        sanitize_file_segment(&manifest.version)
    ));
    download_runtime_archive(
        &absolute_archive_url,
        &archive_path,
        manifest.archive_size_bytes,
    )
    .await?;
    let digest = file_sha256(&archive_path)?;
    if !digest.eq_ignore_ascii_case(&archive_sha256) {
        return Err(format!(
            "Hermes runtime archive checksum mismatch. Expected {archive_sha256}, got {digest}."
        ));
    }
    extract_hermes_runtime_archive(&archive_path, &app_data_dir)?;

    let doctor = crate::hermes_runtime::hermes_doctor_from_manifest_path(
        &manifest_path,
        &pack_root,
        &profile_root,
        query_hermes_version,
    );
    if let Ok(mut executor) = state.executor.lock() {
        executor.set_hermes_doctor(doctor.status.clone(), Some(manifest.hermes_version.clone()));
    }
    let status = if doctor.status == "ready" {
        "installed"
    } else {
        "blocked"
    };
    Ok(HermesRuntimeInstallResult {
        status: status.into(),
        message: format!("Hermes runtime pack {} installed.", manifest.version),
        doctor,
    })
}

/// FIX A — the EXACT payload-construction logic `worker_app_start_connect_session`
/// (the real registration call site) uses. Extracted as a plain, directly
/// testable function (this codebase's established pattern for verifying
/// `#[tauri::command]` bodies — see e.g. `worker_connect_url`,
/// `token_device_binding_mismatches` — since a `tauri::command` itself
/// can't be invoked without a running app/`AppHandle`). Wires the REAL
/// `HermesRegistrationInfo` (never `HermesRegistrationInfo::not_installed()`)
/// through `build_registration_payload_with_hermes`, so registration
/// actually reports `capabilitiesJson.hermesMedia.advertised` correctly.
pub(crate) fn build_start_connect_registration_payload(
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    hermes_doctor: &DoctorSummary,
    hermes_version: Option<String>,
    device_binding: crate::credentials::WorkerDeviceBinding,
) -> WorkerAppRegistrationPayload {
    let hermes_info = HermesRegistrationInfo::from_doctor(hermes_doctor, hermes_version);
    build_registration_payload_with_hermes(settings, doctor, device_binding, &hermes_info)
}

#[tauri::command]
pub async fn worker_app_start_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<(), String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let url = worker_connect_url(&server_url);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))
}

#[tauri::command]
pub async fn worker_app_start_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerConnectSession, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let doctor = worker_app_run_doctor(app.clone()).await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    {
        let mut pending = state
            .pending_connect_device_proof
            .lock()
            .map_err(|_| "pending connect device proof lock poisoned".to_string())?;
        *pending = Some(device_proof.clone());
    }
    append_diagnostic_event(
        &app_data_dir,
        "connect.start.device_proof",
        json!({
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
            "serverUrl": settings.normalized_server_url(),
        }),
    );
    let (hermes_doctor, hermes_version) = compute_hermes_doctor_and_version(&app_data_dir);
    let payload = build_start_connect_registration_payload(
        &settings,
        &doctor,
        &hermes_doctor,
        hermes_version,
        device_proof.binding(),
    );
    let session = start_worker_connect_session(&settings.normalized_server_url(), &payload).await?;
    app.opener()
        .open_url(session.verification_uri_complete.clone(), None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))?;
    Ok(session)
}

#[tauri::command]
pub async fn worker_app_poll_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    device_code: String,
) -> Result<WorkerConnectPollResponse, String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let response = poll_worker_connect_session(&server_url, &device_code).await?;
    if response.status == "approved" {
        if let (Some(worker), Some(tokens)) = (response.worker.clone(), response.tokens.clone()) {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory unavailable: {error}"))?;
            let pending_device_proof = state
                .pending_connect_device_proof
                .lock()
                .map_err(|_| "pending connect device proof lock poisoned".to_string())?
                .clone();
            let used_pending_device_proof = pending_device_proof.is_some();
            let device_proof = match pending_device_proof {
                Some(device_proof) => device_proof,
                None => ensure_device_proof_material(&app_data_dir)?,
            };
            save_device_proof_material(&app_data_dir, &device_proof)?;
            append_diagnostic_event(
                &app_data_dir,
                "connect.poll.approved.device_proof_selected",
                json!({
                    "source": if used_pending_device_proof { "pending_connect_session" } else { "app_data_file" },
                    "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
                }),
            );
            validate_connection_tokens_match_device_proof(
                &app_data_dir,
                "connect.poll.approved",
                &tokens,
                &device_proof,
            )?;
            set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
            let stored_connection = StoredWorkerConnection {
                server_url: server_url.clone(),
                worker: worker.clone(),
                tokens: tokens.clone(),
                connected_at: now_rfc3339(),
                last_refreshed_at: None,
            };
            save_connection_with_device_proof(&app_data_dir, &stored_connection, &device_proof)?;
            append_diagnostic_event(
                &app_data_dir,
                "connect.poll.approved.saved",
                json!({
                    "workerId": worker.id,
                    "serverUrl": server_url,
                    "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
                    "tokens": tokens_summary_json(&tokens),
                }),
            );
            if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
                *pending = None;
            }
        }
    } else if matches!(response.status.as_str(), "expired" | "denied" | "error") {
        if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
            *pending = None;
        }
    }
    Ok(response)
}

// `worker_app_refresh_connect_tokens` was removed on 2026-08-02.
//
// It rotated the single-use refresh token and returned the replacement to its
// caller WITHOUT persisting it or taking the refresh gate — the exact shape
// that spends a token with nothing on disk to show for it and locks the
// machine out until the user redoes browser approval. Nothing invoked it (the
// UI has always used `worker_app_refresh_saved_connection`, which persists),
// so it was a live hazard with no user. Anything needing a rotation must go
// through `worker_app_refresh_saved_connection`.

/// Health + expiry summary for the SAVED connection.
///
/// Added 2026-07-31: the app restored a saved connection on every launch but
/// never checked whether the server still accepts it, so a revoked/expired
/// worker looked "connected" and silently claimed nothing. `checkedAt` proves
/// a real round-trip happened rather than a cache read.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHealth {
    /// Transport availability is deliberately separate from credential
    /// validity. A timeout during a server restart must not become a
    /// reconnect-required verdict.
    pub status: ConnectionHealthStatus,
    /// `false` means the current health check did not prove a healthy
    /// connection. Inspect `status` before deciding whether reconnect is
    /// required; transient outages must not trigger a native dialog.
    pub healthy: bool,
    pub connected: bool,
    pub reason: Option<String>,
    pub worker_name: Option<String>,
    /// Refresh-token expiry (RFC3339), decoded from the JWT's `exp` claim.
    pub expires_at: Option<String>,
    pub hours_until_expiry: Option<i64>,
    /// `true` when the refresh token expires within 24h — the user should
    /// reconnect before it lapses.
    pub expiring_soon: bool,
    pub checked_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionHealthStatus {
    Healthy,
    Transient,
    Unavailable,
    ReconnectRequired,
}

/// Why a read-only access probe could not answer.
enum ProbeOutcome {
    /// The server actively refused the credentials — this is a real verdict
    /// and the user must reconnect.
    Rejected(String),
    /// The server could not answer, so this is not a verdict about the
    /// credentials. The UI should retry without asking the user to reconnect.
    Transient(String),
    /// The probe could not be made with the credentials on hand (execution
    /// token missing or about to expire). Not a verdict about the connection.
    NeedsRefresh(String),
}

/// How much life the execution token needs for a probe to be meaningful.
const PROBE_MIN_EXECUTION_TOKEN_SECONDS: i64 = 60;

/// Asks the control plane whether it still accepts this worker, WITHOUT
/// spending the refresh token.
///
/// `GET /api/workers/:id/policy` runs the full worker auth stack — token
/// signature, revocation denylist, device proof, tenant feature flag, and
/// `readWorkerRevokedAt` on the worker record — and mutates nothing.
///
/// A transport failure is deliberately NOT a rejection: "the server did not
/// answer" and "the server said no" are different facts, and reporting the
/// first as the second is how a Wi-Fi hiccup at login turns into a
/// "reconnect required" dialog on a healthy machine.
async fn probe_worker_access(
    app_data_dir: &Path,
    stored: &StoredWorkerConnection,
) -> Result<(), ProbeOutcome> {
    let execution_token = stored.tokens.execution_token.trim().to_string();
    if execution_token.is_empty() {
        return Err(ProbeOutcome::NeedsRefresh(
            "saved connection has no execution token".into(),
        ));
    }
    let remaining = jwt_exp_epoch_seconds(&execution_token)
        .map(|exp| exp - OffsetDateTime::now_utc().unix_timestamp())
        .unwrap_or(0);
    if remaining < PROBE_MIN_EXECUTION_TOKEN_SECONDS {
        return Err(ProbeOutcome::NeedsRefresh(format!(
            "execution token expires in {remaining}s"
        )));
    }
    let device_proof = match load_connection_device_proof(app_data_dir) {
        Ok(Some(device_proof)) => device_proof,
        Ok(None) => {
            return Err(ProbeOutcome::NeedsRefresh(
                "no device proof bound to the saved connection".into(),
            ))
        }
        Err(error) => return Err(ProbeOutcome::NeedsRefresh(error)),
    };

    let path = format!("/api/workers/{}/policy", stored.worker.id);
    let result = crate::worker_control_plane::get_worker_json::<Value>(
        &stored.server_url,
        &path,
        &execution_token,
        &device_proof,
    )
    .await;

    match result {
        Ok(_) => {
            append_diagnostic_event(
                app_data_dir,
                "connection.probe.ok",
                json!({
                    "workerId": stored.worker.id,
                    "executionTokenRemainingSeconds": remaining,
                }),
            );
            Ok(())
        }
        Err(error) => {
            let rejected = is_worker_auth_rejection(&error);
            crate::diagnostics::log_event(
                app_data_dir,
                if rejected {
                    crate::diagnostics::LogLevel::Error
                } else {
                    crate::diagnostics::LogLevel::Warn
                },
                "connection.probe.failed",
                json!({
                    "workerId": stored.worker.id,
                    "error": error,
                    "treatedAsRejection": rejected,
                }),
            );
            if rejected {
                Err(ProbeOutcome::Rejected(error))
            } else {
                // Unreachable server, timeout, 5xx, rate limit: say nothing
                // about the credentials. Retry without invalidating the
                // saved connection.
                Err(ProbeOutcome::Transient(error))
            }
        }
    }
}

/// True only for verdicts the SERVER issued about these credentials.
fn is_worker_auth_rejection(error: &str) -> bool {
    let normalized = error.to_lowercase();
    // 429 is a rate limit, not an auth verdict, and it embeds no auth wording.
    if normalized.contains("(429)") {
        return false;
    }
    normalized.contains("(401)")
        || normalized.contains("(403)")
        || normalized.contains("revoked")
        || normalized.contains("device")
}

/// True only for failures where the control plane did not provide a durable
/// credential verdict. Keep this separate from `is_worker_auth_rejection` so
/// the health command can preserve the saved connection during an outage.
fn is_transient_control_plane_error(error: &str) -> bool {
    let normalized = error.to_lowercase();
    normalized.contains("timed out")
        || normalized.contains("control plane request failed")
        || normalized.contains("failed to read control plane response")
        || normalized.contains("failed to parse worker control plane json")
        || [
            "(408)", "(425)", "(429)", "(500)", "(501)", "(502)", "(503)", "(504)", "(505)",
            "http 408", "http 425", "http 429", "http 500", "http 501", "http 502", "http 503",
            "http 504", "http 505",
        ]
        .iter()
        .any(|marker| normalized.contains(marker))
}

fn connection_health_for(
    stored: &StoredWorkerConnection,
    status: ConnectionHealthStatus,
    reason: Option<String>,
) -> ConnectionHealth {
    let (expires_at, hours_until_expiry) = refresh_token_expiry_summary(stored);
    ConnectionHealth {
        status,
        healthy: matches!(status, ConnectionHealthStatus::Healthy),
        connected: true,
        reason,
        worker_name: Some(stored.worker.display_name.clone()),
        expires_at,
        expiring_soon: hours_until_expiry.is_some_and(|hours| hours <= 24),
        hours_until_expiry,
        checked_at: now_rfc3339(),
    }
}

/// Reads the `exp` claim out of a JWT WITHOUT verifying the signature.
///
/// Verification is the server's job — the client only needs the timestamp to
/// warn the user. Deliberately tolerant: any malformed segment yields `None`
/// (no expiry shown) rather than an error, because a token this client cannot
/// parse is still one the SERVER may accept.
fn jwt_exp_epoch_seconds(token: &str) -> Option<i64> {
    use base64::Engine as _;
    let payload_b64 = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64.as_bytes())
        .ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    claims.get("exp").and_then(serde_json::Value::as_i64)
}

fn refresh_token_expiry_summary(
    connection: &StoredWorkerConnection,
) -> (Option<String>, Option<i64>) {
    let Some(epoch) = connection
        .tokens
        .refresh_token
        .as_deref()
        .and_then(jwt_exp_epoch_seconds)
    else {
        return (None, None);
    };
    let now = chrono::Utc::now().timestamp();
    (
        chrono::DateTime::from_timestamp(epoch, 0).map(|dt| dt.to_rfc3339()),
        Some((epoch - now) / 3600),
    )
}

#[tauri::command]
pub async fn worker_app_check_connection_health(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<ConnectionHealth, String> {
    let checked_at = now_rfc3339();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let Some(stored) = load_connection(&app_data_dir)? else {
        return Ok(ConnectionHealth {
            status: ConnectionHealthStatus::ReconnectRequired,
            healthy: false,
            connected: false,
            reason: Some("No saved Worker App connection.".into()),
            worker_name: None,
            expires_at: None,
            hours_until_expiry: None,
            expiring_soon: false,
            checked_at,
        });
    };
    let worker_name = Some(stored.worker.display_name.clone());

    // A real round-trip is still required — a read-only "is the file there"
    // check would report healthy for a revoked worker. But it must not be a
    // REFRESH: that spends the single-use refresh token on a question that did
    // not need it, once per launch and once per hour. `probe_worker_access`
    // asks the same auth stack with the execution token and changes nothing,
    // and it additionally catches an admin revocation of the worker record,
    // which the refresh endpoint never checks.
    let probed = match probe_worker_access(&app_data_dir, &stored).await {
        Ok(()) => Ok(stored.clone()),
        Err(ProbeOutcome::Rejected(reason)) => Err(reason),
        Err(ProbeOutcome::Transient(reason)) => {
            return Ok(connection_health_for(
                &stored,
                ConnectionHealthStatus::Transient,
                Some(reason),
            ));
        }
        // The execution token is too old to probe with (or absent). Fall back
        // to a rotation — which is the correct action anyway at that point.
        Err(ProbeOutcome::NeedsRefresh(detail)) => {
            append_diagnostic_event(
                &app_data_dir,
                "connection.health.probe_needs_refresh",
                json!({ "detail": detail }),
            );
            worker_app_refresh_saved_connection(app.clone(), state, Some("health_check".into()))
                .await
        }
    };
    match probed {
        Ok(connection) => {
            let (expires_at, hours_until_expiry) = refresh_token_expiry_summary(&connection);
            append_diagnostic_event(
                &app_data_dir,
                "connection.health.ok",
                json!({
                    "workerName": worker_name,
                    "refreshTokenExpiresAt": expires_at,
                    "hoursUntilExpiry": hours_until_expiry,
                }),
            );
            Ok(ConnectionHealth {
                status: ConnectionHealthStatus::Healthy,
                healthy: true,
                connected: true,
                reason: None,
                worker_name,
                expires_at,
                // Warn a full day ahead so there is time to act.
                expiring_soon: hours_until_expiry.is_some_and(|h| h <= 24),
                hours_until_expiry,
                checked_at,
            })
        }
        Err(error) => {
            // This is the verdict behind the "reconnect required" dialog. It
            // is recorded separately from `connection.refresh.failed` because
            // the user only ever sees THIS one, and a bug report needs the two
            // side by side to tell a real revocation from a lost race.
            let status = if is_transient_control_plane_error(&error) {
                ConnectionHealthStatus::Transient
            } else {
                ConnectionHealthStatus::ReconnectRequired
            };
            let event = if matches!(status, ConnectionHealthStatus::Transient) {
                "connection.health.transient"
            } else {
                "connection.health.unhealthy"
            };
            crate::diagnostics::log_event(
                &app_data_dir,
                if matches!(status, ConnectionHealthStatus::Transient) {
                    LogLevel::Warn
                } else {
                    LogLevel::Error
                },
                event,
                json!({
                    "workerName": worker_name,
                    "reason": error,
                    "status": status,
                }),
            );
            Ok(connection_health_for(&stored, status, Some(error)))
        }
    }
}

#[tauri::command]
pub async fn worker_app_refresh_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    caller: Option<String>,
) -> Result<StoredWorkerConnection, String> {
    // `caller` is optional so older frontends keep working, but it is the
    // field that makes concurrent rotations readable in the log: several
    // independent drivers (launch health check, renewal timer, loop start,
    // background loop) all rotate the SAME single-use refresh token.
    let caller = caller.unwrap_or_else(|| "unspecified".to_string());
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    // Held across the network call: the token read below must still be the
    // unspent one when the request reaches the server.
    let _gate = REFRESH_GATE.lock().await;
    let mut stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Worker App is not connected yet.".to_string())?;
    // Read AFTER taking the lock — a caller that queued behind a rotation must
    // see its result, not the token it spent.
    if refresh_can_be_coalesced(&stored) {
        append_diagnostic_event(
            &app_data_dir,
            "connection.refresh.coalesced",
            json!({
                "caller": caller,
                "lastRefreshedAt": stored.last_refreshed_at,
                "remainingTokenSeconds": remaining_token_seconds(&stored),
            }),
        );
        set_active_connected_device_proof(&state, load_connection_device_proof(&app_data_dir)?)?;
        update_running_loop_connection(&state, &stored, &app_data_dir)?;
        return Ok(stored);
    }
    let refresh_token = stored
        .tokens
        .refresh_token
        .clone()
        .ok_or_else(|| "Worker connection does not include a refresh token.".to_string())?;
    let device_proof = match load_connection_device_proof(&app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    append_diagnostic_event(
        &app_data_dir,
        "connection.refresh.saved.device_proof_selected",
        json!({
            "caller": caller,
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    stored.tokens = refresh_worker_connect_tokens(
        &app_data_dir,
        &format!("saved_connection:{caller}"),
        &stored.server_url,
        &refresh_token,
        &device_proof,
    )
    .await?;
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "connection.refresh.saved",
        &stored.tokens,
        &device_proof,
    )?;
    set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
    stored.last_refreshed_at = Some(now_rfc3339());
    save_connection_with_device_proof(&app_data_dir, &stored, &device_proof)?;
    // Logged AFTER the write: a rotation is only survivable once the new
    // refresh token is on disk. An `ok` with no matching `persisted` in the
    // log is the signature of a token rotated on the server but lost here —
    // which locks this machine out until the user reconnects.
    append_diagnostic_event(
        &app_data_dir,
        "connection.refresh.persisted",
        json!({
            "caller": caller,
            "workerId": stored.worker.id,
            "refreshToken": stored
                .tokens
                .refresh_token
                .as_deref()
                .map(token_reference)
                .unwrap_or(Value::Null),
        }),
    );
    update_running_loop_connection(&state, &stored, &app_data_dir)?;
    Ok(stored)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerLoopStartRequest {
    pub server_url: String,
    pub worker_id: String,
    pub worker_label: String,
    pub execution_token: String,
    pub upload_token: String,
}

#[tauri::command]
pub async fn worker_app_start_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    request: WorkerLoopStartRequest,
) -> Result<WorkerLoopStatus, String> {
    if request.worker_id.trim().is_empty() {
        return Err("worker id is required before starting the background loop".into());
    }
    if request.execution_token.trim().is_empty() || request.upload_token.trim().is_empty() {
        return Err("worker execution and upload tokens are required".into());
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let active_device_proof = active_connected_device_proof(&state)?;
    let used_active_device_proof = active_device_proof.is_some();
    let device_proof = match active_device_proof {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.start.device_proof_selected",
        json!({
            "source": if used_active_device_proof { "active_connected_session" } else { "app_data_file" },
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    let request_tokens = WorkerConnectTokens {
        execution_token: request.execution_token.trim().to_string(),
        upload_token: request.upload_token.trim().to_string(),
        refresh_token: None,
    };
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "worker_loop.start",
        &request_tokens,
        &device_proof,
    )?;
    let connection = WorkerLoopConnection {
        server_url: request.server_url.trim().trim_end_matches('/').to_string(),
        worker_id: request.worker_id.trim().to_string(),
        worker_label: request.worker_label.trim().to_string(),
        tokens: WorkerApiTokens {
            execution_token: request.execution_token.trim().to_string(),
            upload_token: request.upload_token.trim().to_string(),
        },
        device_proof,
    };
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.start.ok",
        json!({
            "workerId": connection.worker_id,
            "serverUrl": connection.server_url,
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&connection.device_proof)),
            "tokens": tokens_summary_json(&request_tokens),
        }),
    );

    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if locked_loop
        .as_ref()
        .is_some_and(|existing| existing.stopped.load(std::sync::atomic::Ordering::Relaxed))
    {
        locked_loop.take();
    }
    if let Some(existing) = locked_loop.as_ref() {
        let mut locked_connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        *locked_connection = connection;
        return Ok(WorkerLoopStatus {
            running: true,
            mode: "foreground_background_loop".into(),
            message: "Worker loop is already running; connection tokens were updated without stopping active work.".into(),
        });
    }
    let handle = start_worker_loop(
        state.settings.clone(),
        state.executor.clone(),
        resource_dir,
        app_data_dir,
        connection,
    );
    *locked_loop = Some(handle);
    Ok(WorkerLoopStatus {
        running: true,
        mode: "foreground_background_loop".into(),
        message: "Worker loop is running in this app process.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_start_saved_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Connect this Worker App before starting the worker loop.".to_string())?;
    worker_app_start_worker_loop(
        app,
        state,
        WorkerLoopStartRequest {
            server_url: stored.server_url,
            worker_id: stored.worker.id,
            worker_label: stored.worker.display_name,
            execution_token: stored.tokens.execution_token,
            upload_token: stored.tokens.upload_token,
        },
    )
    .await
}

#[tauri::command]
pub async fn worker_app_stop_worker_loop(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    stop_worker_loop_state(&state).await
}

pub async fn stop_worker_loop_state(state: &WorkerAppState) -> Result<WorkerLoopStatus, String> {
    let existing = {
        let mut locked_loop = state
            .worker_loop
            .lock()
            .map_err(|_| "worker loop lock poisoned".to_string())?;
        locked_loop.take()
    };

    if let Some(existing) = existing {
        let stopped = existing.stopped.clone();
        existing
            .cancel
            .store(true, std::sync::atomic::Ordering::Relaxed);
        let handle = existing.handle;
        let started = Instant::now();
        while !stopped.load(std::sync::atomic::Ordering::Relaxed)
            && started.elapsed() < Duration::from_secs(8)
        {
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(Duration::from_millis(250));
            })
            .await;
        }
        if stopped.load(std::sync::atomic::Ordering::Relaxed) {
            let _ = handle.await;
        } else {
            // The render task should normally observe cancel and clean up the WSL
            // process group. Abort is kept as a final app-shutdown fallback.
            handle.abort();
            let _ = handle.await;
        }
    }
    if let Ok(mut executor) = state.executor.lock() {
        executor.accepting_jobs = false;
        executor.current_job_id = None;
        executor.current_job_label = None;
        executor.current_job_type = None;
        executor.current_project_id = None;
        executor.current_project_name = None;
        executor.manual_command = None;
        executor.log_tail = None;
        executor.progress_percent = 0;
        executor.status = ExecutorStatus::Idle;
        executor.last_message = "Worker loop stopped and render cleanup requested.".into();
    }
    Ok(WorkerLoopStatus {
        running: false,
        mode: "manual".into(),
        message: "Worker loop stopped and render cleanup requested.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_get_worker_loop_status(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if locked_loop
        .as_ref()
        .is_some_and(|existing| existing.stopped.load(std::sync::atomic::Ordering::Relaxed))
    {
        locked_loop.take();
    }
    let running = locked_loop.is_some();
    Ok(WorkerLoopStatus {
        running,
        mode: if running {
            "foreground_background_loop".into()
        } else {
            "manual".into()
        },
        message: if running {
            "Worker loop is running in this app process.".into()
        } else {
            "Worker loop is stopped.".into()
        },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupModeStatus {
    pub start_with_windows: bool,
    pub service_available: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsLogLocation {
    pub log_path: String,
    pub app_data_dir: String,
    /// Current file first, then rotated generations — the order to read them
    /// in when reconstructing what happened before a failure.
    pub files: Vec<String>,
}

/// Where the on-disk log lives, so the user can attach it to a bug report
/// without being told to hunt through `%APPDATA%`.
#[tauri::command]
pub async fn worker_app_get_diagnostics_log(
    app: tauri::AppHandle,
) -> Result<DiagnosticsLogLocation, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    Ok(DiagnosticsLogLocation {
        log_path: diagnostic_log_path(&app_data_dir)
            .to_string_lossy()
            .to_string(),
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        files: crate::diagnostics::diagnostic_log_paths(&app_data_dir)
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
    })
}

#[tauri::command]
pub async fn worker_app_configure_startup(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<StartupModeStatus, String> {
    let result = configure_windows_login_startup(enabled);
    // "I ticked the box and it does not start at login" is unanswerable
    // without knowing what the OS reported at the moment the box was ticked,
    // and which executable path got registered — an entry pointing at a path
    // from a previous install verifies as ON and still starts nothing.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let details = json!({
            "requested": enabled,
            "executable": std::env::current_exe()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|_| "unknown".into()),
            "osReportsEnabled": query_login_startup_enabled(),
            "error": result.as_ref().err(),
        });
        match result.as_ref() {
            Ok(_) => append_diagnostic_event(&app_data_dir, "startup.configure.ok", details),
            Err(_) => {
                crate::diagnostics::log_error(&app_data_dir, "startup.configure.failed", details)
            }
        }
    }
    result
}

/// Reads the ACTUAL OS autostart state rather than trusting the settings file.
///
/// Field audit 2026-07-31: the checkbox rendered `settings.startWithWindows`
/// (a JSON file this app writes) while the real state lives in the Windows
/// `Run` key. Those diverge whenever the entry is removed outside the app —
/// an uninstall/reinstall, a cleanup tool, antivirus — leaving the UI claiming
/// autostart is ON when Windows will never start anything.
#[cfg(target_os = "windows")]
pub fn query_login_startup_enabled() -> bool {
    std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "SmartAIHubWorkerApp",
        ])
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub fn query_login_startup_enabled() -> bool {
    std::env::var("HOME")
        .map(|home| {
            std::path::Path::new(&home)
                .join("Library/LaunchAgents/app.smartaihub.workerapp.login.plist")
                .exists()
        })
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn query_login_startup_enabled() -> bool {
    false
}

/// Reports the REAL autostart state, so the UI can reconcile its checkbox with
/// the OS instead of echoing what it last wrote.
/// Result of launching the interactive Hermes terminal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HermesTuiLaunch {
    pub launched: bool,
    /// The exact command a user can paste into their own terminal. Always
    /// returned, even on success, so the guide in the UI is never guesswork.
    pub command: String,
    pub message: String,
}

/// Opens `hermes --tui` in a REAL terminal window.
///
/// The worker otherwise drives Hermes non-interactively (`hermes -z <envelope>
/// --provider xai-oauth …`), which is the wrong shape for a human: the TUI
/// wants a tty. So spawn the platform's terminal rather than trying to render
/// a terminal inside this app.
#[tauri::command]
pub async fn worker_app_open_hermes_tui(
    app: tauri::AppHandle,
    extra_args: Option<Vec<String>>,
) -> Result<HermesTuiLaunch, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    // NOTE the ORDER: this returns (manifest_path, pack_root). Binding it the
    // other way round made `manifest_path` the pack DIRECTORY, and reading a
    // directory as a file fails with "Access is denied. (os error 5)" on
    // Windows — reported as "Hermes runtime is not installed yet" even though
    // the pack was installed and the doctor read it fine (2026-07-31).
    let (manifest_path, pack_root) =
        crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
    let manifest = crate::hermes_runtime::read_hermes_runtime_manifest(&manifest_path)
        .map_err(|error| format!("Hermes runtime is not installed yet: {error}"))?;
    let hermes = pack_root.join(&manifest.hermes_relative_path);
    if !hermes.exists() {
        return Err(format!(
            "Hermes CLI not found at {} — install the Hermes runtime first.",
            hermes.display()
        ));
    }
    let hermes_str = hermes.to_string_lossy().to_string();
    let mut args: Vec<String> = extra_args.unwrap_or_default();
    if args.is_empty() {
        args.push("--tui".to_string());
    }
    // The manifest stores a POSIX-ish relative path, so the joined result can
    // read `...\\hermes-runtime\\python/hermes.exe`. Harmless for
    // `Command::new`, but confusing in a copyable command string.
    let hermes_display = hermes_str.replace('/', std::path::MAIN_SEPARATOR_STR);
    let printable = format!("\"{hermes_display}\" {}", args.join(" "));

    // `cmd /K` takes the command as ONE argument. Passing the already-quoted
    // string through `Command::args` made Rust escape it a SECOND time, so the
    // shell received a literal `'\"C:\...\hermes.exe\"'` and reported
    // "is not recognized as an internal or external command" (2026-07-31).
    // `raw_arg` bypasses Rust's escaping so `cmd` sees exactly what we built.
    #[cfg(target_os = "windows")]
    let spawned = {
        use std::os::windows::process::CommandExt as _;
        let mut command = std::process::Command::new("cmd");
        command.raw_arg("/C");
        command.raw_arg("start");
        command.raw_arg("\"Hermes\"");
        command.raw_arg("cmd");
        command.raw_arg("/K");
        command.raw_arg(&printable);
        command.spawn()
    };

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("osascript")
        .args([
            "-e",
            &format!("tell application \"Terminal\" to do script \"{printable}\""),
        ])
        .spawn();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let spawned = std::process::Command::new("x-terminal-emulator")
        .args(["-e", &printable])
        .spawn();

    match spawned {
        Ok(_) => Ok(HermesTuiLaunch {
            launched: true,
            command: printable,
            message: "Hermes TUI opened in a new terminal window.".into(),
        }),
        // A missing terminal emulator is common on locked-down machines —
        // hand the user the exact command instead of just failing.
        Err(error) => Ok(HermesTuiLaunch {
            launched: false,
            command: printable,
            message: format!(
                "Could not open a terminal automatically ({error}). Copy the command below and run it yourself."
            ),
        }),
    }
}

/// Result of the browser-based xAI/Grok sign-in.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HermesSignInStart {
    pub started: bool,
    pub user_code: Option<String>,
    pub verification_url: Option<String>,
    pub expires_at: Option<String>,
    pub message: String,
}

/// Starts the xAI device-code sign-in and OPENS THE BROWSER.
///
/// Replaces the previous "spawn a terminal and let the user type" approach
/// (2026-07-31): a device-code flow ends in a browser anyway, so dropping the
/// user at a `cmd` prompt was strictly worse — and the shell quoting for the
/// spawned command was broken on top of that.
///
/// `--no-browser` makes Hermes PRINT the code + URL instead of trying to open
/// a browser itself from a non-interactive child process; this app then opens
/// the URL and shows the code.
#[tauri::command]
pub async fn worker_app_hermes_signin_xai(
    app: tauri::AppHandle,
) -> Result<HermesSignInStart, String> {
    use std::io::{BufRead, BufReader};

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let (manifest_path, pack_root) =
        crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
    let manifest = crate::hermes_runtime::read_hermes_runtime_manifest(&manifest_path)
        .map_err(|error| format!("Hermes runtime is not installed yet: {error}"))?;
    let hermes = pack_root.join(&manifest.hermes_relative_path);
    if !hermes.exists() {
        return Err(format!(
            "Hermes CLI not found at {} — install the Hermes runtime first.",
            hermes.display()
        ));
    }

    // Spawned with an argv array (no shell), so paths containing spaces need no
    // quoting at all — the broken `cmd /K "\"C:\...\hermes.exe\""` string is
    // gone with the terminal approach that produced it.
    let mut command = std::process::Command::new(&hermes);
    command
        .args(["auth", "add", "xai-oauth", "--no-browser"])
        .stdout(std::process::Stdio::piped())
        // Hermes may print the device code on stderr, and merging both streams
        // means the parser sees everything it printed. Reading only stdout is
        // why this returned "did not print a device code within 45 seconds"
        // even though the CLI had produced output (2026-07-31).
        .stderr(std::process::Stdio::piped())
        // A GUI process has no usable stdin. Leaving it INHERITED meant any
        // prompt Hermes emitted blocked on a handle that would never deliver
        // anything, so it printed nothing and simply waited out the timeout.
        // A closed stdin makes it fail fast and say so instead.
        .stdin(std::process::Stdio::null());
    // Without CREATE_NO_WINDOW a GUI app spawning a CONSOLE executable gets a
    // blank black console window (stdout is piped away, so it shows nothing)
    // that sits there while Hermes waits for browser approval — exactly what a
    // user reported as "ค้างอยู่" (2026-07-31). Every other spawn in this
    // codebase already sets this flag; these new commands had missed it.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt as _;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start Hermes sign-in: {error}"))?;

    // Read only until the device code appears — the process then WAITS for the
    // user to approve in the browser, so waiting for exit here would block the
    // UI for the whole approval window.
    // Read on a worker thread with a hard deadline. Hermes keeps the pipe open
    // while it waits for the user to approve in the browser, so a plain
    // blocking read here would never return and the command would hang.
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    // Both streams feed the SAME channel — whichever carries the code wins.
    for stream in [
        child
            .stdout
            .take()
            .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        child
            .stderr
            .take()
            .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut captured = String::new();
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                captured.push_str(&line);
                captured.push('\n');
                let parsed =
                    crate::hermes_executor::parse_hermes_device_code_output_for_app(&captured);
                if (parsed.0.is_some() && parsed.1.is_some()) || captured.len() > 64_000 {
                    break;
                }
            }
            let _ = tx.send(captured);
        });
    }
    drop(tx);
    // NEVER hang and never fail blind: whatever Hermes printed (even nothing)
    // comes back so the panel can show it. An earlier version returned Err on
    // timeout, which left the button spinning with no explanation — the exact
    // silent-failure shape this whole flow keeps falling into (2026-07-31).
    let captured = rx
        .recv_timeout(std::time::Duration::from_secs(20))
        .unwrap_or_default();
    let timed_out = captured.is_empty();
    if timed_out {
        // Do not leave an orphan process holding the provider's device-code
        // session open.
        let _ = child.kill();
    }
    let (user_code, verification_url, expires_at) =
        crate::hermes_executor::parse_hermes_device_code_output_for_app(&captured);

    if let Some(url) = verification_url.as_deref() {
        // Opening the browser is the whole point of this command.
        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
    }

    Ok(HermesSignInStart {
        started: user_code.is_some(),
        message: if user_code.is_some() {
            "Browser opened. Enter the code below to finish signing in, then press \"Refresh sign-in status\".".into()
        } else if timed_out {
            format!(
                "Hermes printed nothing within 20 seconds, so it may be waiting on something this app cannot see. Run this in the Hermes TUI to sign in manually and read the real output:\n\n\"{}\" auth add xai-oauth --no-browser",
                hermes.display()
            )
        } else {
            format!(
                "Hermes ran but did not print a device code. Raw output was:\n\n{}\n\nIf this looks like a prompt, run it in the Hermes TUI instead — it needs a terminal.",
                captured.trim()
            )
        },
        user_code,
        verification_url,
        expires_at,
    })
}

/// Provider login state, read from `hermes auth list` (pooled credentials).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HermesAuthSummary {
    pub available: bool,
    /// Raw `hermes auth list` output — shown verbatim so the UI never has to
    /// guess at a provider list that Hermes may extend between versions.
    pub raw: String,
    pub providers: Vec<String>,
    pub xai_logged_in: bool,
}

#[tauri::command]
pub async fn worker_app_hermes_auth_summary(
    app: tauri::AppHandle,
) -> Result<HermesAuthSummary, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    // NOTE the ORDER: this returns (manifest_path, pack_root). Binding it the
    // other way round made `manifest_path` the pack DIRECTORY, and reading a
    // directory as a file fails with "Access is denied. (os error 5)" on
    // Windows — reported as "Hermes runtime is not installed yet" even though
    // the pack was installed and the doctor read it fine (2026-07-31).
    let (manifest_path, pack_root) =
        crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
    let Ok(manifest) = crate::hermes_runtime::read_hermes_runtime_manifest(&manifest_path) else {
        return Ok(HermesAuthSummary {
            available: false,
            raw: String::new(),
            providers: vec![],
            xai_logged_in: false,
        });
    };
    let hermes = pack_root.join(&manifest.hermes_relative_path);
    let mut list_command = std::process::Command::new(&hermes);
    list_command.args(["auth", "list"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt as _;
        list_command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = list_command.output();
    let Ok(output) = output else {
        return Ok(HermesAuthSummary {
            available: false,
            raw: String::new(),
            providers: vec![],
            xai_logged_in: false,
        });
    };
    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    // `hermes auth list` prints "<provider> (<n> credentials):" headers.
    let providers: Vec<String> = raw
        .lines()
        .filter(|line| !line.starts_with(' ') && line.contains("credential"))
        .filter_map(|line| line.split_whitespace().next().map(str::to_string))
        .collect();
    let xai_logged_in = providers
        .iter()
        .any(|p| p.starts_with("xai") || p == "grok");
    Ok(HermesAuthSummary {
        available: output.status.success(),
        raw,
        providers,
        xai_logged_in,
    })
}

#[tauri::command]
pub async fn worker_app_get_startup_status() -> Result<StartupModeStatus, String> {
    let enabled = query_login_startup_enabled();
    Ok(StartupModeStatus {
        start_with_windows: enabled,
        service_available: false,
        message: if enabled {
            "Autostart on sign-in is active.".into()
        } else {
            "Autostart on sign-in is off.".into()
        },
    })
}

#[cfg(target_os = "windows")]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("unable to resolve Worker App executable path: {error}"))?;
    let exe = exe
        .to_str()
        .ok_or_else(|| "Worker App executable path is not valid UTF-8".to_string())?;
    let status = if enabled {
        std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{exe}\""),
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to configure Windows login startup: {error}"))?
    } else {
        std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to remove Windows login startup: {error}"))?
    };
    // `reg delete` exits non-zero when the value is simply absent. Turning
    // autostart OFF when it is already off is a no-op, not a failure — the old
    // code surfaced an error for it.
    if !status.success() && enabled {
        return Err(format!(
            "Windows startup registry command failed with {status}"
        ));
    }
    // Verify against the OS instead of assuming the command did what we asked.
    // "the `reg` process exited 0" is not the same claim as "Windows will
    // start this app at sign-in".
    let actual = query_login_startup_enabled();
    if actual != enabled {
        return Err(format!(
            "Windows startup entry did not change as requested (registry now reports {}). \
             Check whether another tool or policy manages HKCU\\...\\Run.",
            if actual { "enabled" } else { "disabled" }
        ));
    }
    Ok(StartupModeStatus {
        start_with_windows: actual,
        service_available: false,
        message: if actual {
            "Worker App will start when this Windows user signs in. This is not a Windows service."
                .into()
        } else {
            "Windows login autostart is disabled.".into()
        },
    })
}

/// macOS login-item equivalent of the Windows `Run` registry key: a per-user
/// LaunchAgent. Added 2026-07-31 — the toggle previously did nothing at all on
/// macOS ("can only be configured from the Windows build"), so a Mac user
/// could tick it and get no autostart and no error.
///
/// `RunAtLoad` starts the app at LOGIN (not at boot) — the same scope as the
/// Windows HKCU Run key, and the same limitation: it needs a logged-in user
/// session. Boot-time start without login is the separate "run as a service"
/// feature.
#[cfg(target_os = "macos")]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    use std::io::Write as _;

    const LABEL: &str = "app.smartaihub.workerapp.login";
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let agents_dir = std::path::Path::new(&home).join("Library/LaunchAgents");
    let plist_path = agents_dir.join(format!("{LABEL}.plist"));

    if !enabled {
        // `launchctl unload` fails when it was never loaded — that is not an
        // error for "make sure autostart is off".
        let _ = std::process::Command::new("launchctl")
            .args(["unload", &plist_path.to_string_lossy()])
            .status();
        let _ = std::fs::remove_file(&plist_path);
        return Ok(StartupModeStatus {
            start_with_windows: false,
            service_available: false,
            message: "Login autostart is disabled.".into(),
        });
    }

    let exe = std::env::current_exe()
        .map_err(|error| format!("cannot resolve the app executable: {error}"))?;
    std::fs::create_dir_all(&agents_dir)
        .map_err(|error| format!("cannot create {}: {error}", agents_dir.display()))?;
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key><array><string>{exe}</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
"#,
        exe = exe.to_string_lossy()
    );
    let mut file = std::fs::File::create(&plist_path)
        .map_err(|error| format!("cannot write {}: {error}", plist_path.display()))?;
    file.write_all(plist.as_bytes())
        .map_err(|error| format!("cannot write {}: {error}", plist_path.display()))?;
    let _ = std::process::Command::new("launchctl")
        .args(["unload", &plist_path.to_string_lossy()])
        .status();
    let status = std::process::Command::new("launchctl")
        .args(["load", &plist_path.to_string_lossy()])
        .status()
        .map_err(|error| format!("launchctl load failed: {error}"))?;
    if !status.success() {
        return Err(format!("launchctl load failed with {status}"));
    }
    let actual = query_login_startup_enabled();
    if !actual {
        return Err("LaunchAgent was not created — autostart is NOT active.".into());
    }
    Ok(StartupModeStatus {
        start_with_windows: true,
        service_available: false,
        message: "Worker App will start when you log in to macOS (LaunchAgent).".into(),
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    Ok(StartupModeStatus {
        start_with_windows: false,
        service_available: false,
        message: if enabled {
            "Login autostart is only supported on the Windows and macOS builds.".into()
        } else {
            "Login autostart is disabled.".into()
        },
    })
}

async fn start_worker_connect_session(
    server_url: &str,
    payload: &WorkerAppRegistrationPayload,
) -> Result<WorkerConnectSession, String> {
    let url = format!(
        "{}/api/workers/connect/start",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "payload": payload }))
        .send()
        .await
        .map_err(|error| format!("unable to start browser approval: {error}"))?;
    parse_json_response::<WorkerConnectSession>(response).await
}

async fn poll_worker_connect_session(
    server_url: &str,
    device_code: &str,
) -> Result<WorkerConnectPollResponse, String> {
    let url = format!(
        "{}/api/workers/connect/token",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(|error| format!("unable to check browser approval: {error}"))?;
    parse_json_response::<WorkerConnectPollResponse>(response).await
}

/// Rotates the worker access tokens, and RECORDS the attempt either way.
///
/// The refresh token is single-use: the server revokes the presented `jti` the
/// moment it issues a replacement. That makes every rotation a point of no
/// return, so a postmortem needs three facts that used to be unrecorded —
/// which code path asked (`caller`), WHICH token was presented
/// (`refreshToken.jti`, so a reused/stale one is visible), and what the server
/// said. Without them "Worker token has been revoked" is unattributable: it
/// looks identical whether an admin revoked the worker, a second copy of the
/// app rotated first, or this process raced itself.
async fn refresh_worker_connect_tokens(
    app_data_dir: &Path,
    caller: &str,
    server_url: &str,
    refresh_token: &str,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<WorkerConnectTokens, String> {
    let started = Instant::now();
    append_diagnostic_event(
        app_data_dir,
        "connection.refresh.attempt",
        json!({
            "caller": caller,
            "serverUrl": server_url,
            "refreshToken": token_reference(refresh_token),
        }),
    );
    let result = post_worker_json::<WorkerConnectRefreshEnvelope, _>(
        server_url,
        "/api/workers/connect/refresh",
        refresh_token,
        &json!({}),
        device_proof,
    )
    .await
    .map_err(|error| format!("unable to refresh worker access: {error}"));

    match result {
        Ok(envelope) => {
            append_diagnostic_event(
                app_data_dir,
                "connection.refresh.ok",
                json!({
                    "caller": caller,
                    "elapsedMs": started.elapsed().as_millis() as u64,
                    "presentedRefreshToken": token_reference(refresh_token),
                    "issuedExecutionToken": token_reference(&envelope.tokens.execution_token),
                    "issuedUploadToken": token_reference(&envelope.tokens.upload_token),
                    "issuedRefreshToken": envelope
                        .tokens
                        .refresh_token
                        .as_deref()
                        .map(token_reference)
                        .unwrap_or(Value::Null),
                }),
            );
            Ok(envelope.tokens)
        }
        Err(error) => {
            crate::diagnostics::log_error(
                app_data_dir,
                "connection.refresh.failed",
                json!({
                    "caller": caller,
                    "elapsedMs": started.elapsed().as_millis() as u64,
                    "serverUrl": server_url,
                    "presentedRefreshToken": token_reference(refresh_token),
                    "error": error,
                    // The server revokes the presented jti on a SUCCESSFUL
                    // rotation, so a "revoked" verdict means this exact token
                    // was already spent — by another caller, another instance,
                    // or a rotation whose response we never persisted.
                    "tokenAlreadySpent": error.to_lowercase().contains("revoked"),
                }),
            );
            Err(error)
        }
    }
}

async fn fetch_runtime_manifest(
    server_url: &str,
    runtime_id: &str,
    channel: &str,
) -> Result<RuntimePackManifest, String> {
    let url = format!(
        "{}/api/workers/runtime-pack/manifest?runtimeId={}&channel={}",
        server_url.trim().trim_end_matches('/'),
        runtime_id.trim(),
        channel.trim()
    );
    let client = reqwest::Client::builder()
        // The published manifest includes a complete archive entry list for
        // verification and is several megabytes. Keep startup checks
        // reliable on slower worker connections instead of failing silently
        // before the UI can show the runtime update warning.
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("unable to create runtime manifest client: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to fetch runtime manifest: {error}"))?;
    parse_json_response::<RuntimePackManifest>(response)
        .await
        .map_err(|error| format!("runtime manifest unavailable: {error}"))
}

fn runtime_update_available(
    current_version: Option<&str>,
    latest_version: Option<&str>,
    latest_allowed: bool,
) -> bool {
    if !latest_allowed {
        return false;
    }
    let Some(latest_version) = latest_version
        .map(str::trim)
        .filter(|version| !version.is_empty())
    else {
        return false;
    };
    let Some(current_version) = current_version
        .map(str::trim)
        .filter(|version| !version.is_empty())
    else {
        return true;
    };
    compare_version_strings(latest_version, current_version) == Ordering::Greater
}

fn compare_version_strings(left: &str, right: &str) -> Ordering {
    let left_segments: Vec<&str> = left
        .trim()
        .split(['.', '+', '-'])
        .filter(|segment| !segment.is_empty())
        .collect();
    let right_segments: Vec<&str> = right
        .trim()
        .split(['.', '+', '-'])
        .filter(|segment| !segment.is_empty())
        .collect();
    let length = left_segments.len().max(right_segments.len());

    for index in 0..length {
        let left_segment = left_segments.get(index).copied().unwrap_or("0");
        let right_segment = right_segments.get(index).copied().unwrap_or("0");
        let ordering = match (
            left_segment
                .chars()
                .all(|character| character.is_ascii_digit()),
            right_segment
                .chars()
                .all(|character| character.is_ascii_digit()),
        ) {
            (true, true) => compare_numeric_segments(left_segment, right_segment),
            _ => left_segment
                .to_ascii_lowercase()
                .cmp(&right_segment.to_ascii_lowercase()),
        };
        if ordering != Ordering::Equal {
            return ordering;
        }
    }

    Ordering::Equal
}

fn compare_numeric_segments(left: &str, right: &str) -> Ordering {
    let left = left.trim_start_matches('0');
    let right = right.trim_start_matches('0');
    let left = if left.is_empty() { "0" } else { left };
    let right = if right.is_empty() { "0" } else { right };
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

#[cfg(any(target_os = "windows", test))]
fn parse_managed_wsl_runtime_version(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .find_map(|line| line.strip_prefix("runtime_manifest_version="))
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(target_os = "windows")]
fn read_managed_wsl_runtime_version(managed_wsl_root: &str) -> Result<Option<String>, String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let root_expr = wsl_shell_assignment_expr(if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    });
    let script = format!(
        r#"ROOT={root_expr}
MANIFEST="$ROOT/runtime-pack/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  exit 0
fi
python3 - "$MANIFEST" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
print("runtime_manifest_version=" + str(manifest.get("version") or ""))
PY"#
    );

    let output = std::process::Command::new("wsl.exe")
        .args(["-e", "bash", "-lc", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("unable to inspect Managed WSL runtime manifest: {error}"))?;
    if output.status.success() {
        return Ok(parse_managed_wsl_runtime_version(&String::from_utf8_lossy(
            &output.stdout,
        )));
    }

    Ok(None)
}

#[cfg(not(target_os = "windows"))]
fn read_managed_wsl_runtime_version(_managed_wsl_root: &str) -> Result<Option<String>, String> {
    Ok(None)
}

fn absolute_url(server_url: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.starts_with("https://") || value.starts_with("http://") {
        return Ok(value.to_string());
    }
    if !value.starts_with('/') {
        return Err("runtime archiveUrl must be absolute or root-relative".into());
    }
    Ok(format!(
        "{}{}",
        server_url.trim().trim_end_matches('/'),
        value
    ))
}

fn sanitize_file_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    sanitized.trim_matches(&['-', '.'][..]).to_string()
}

async fn download_runtime_archive(
    url: &str,
    archive_path: &Path,
    expected_size_bytes: Option<u64>,
) -> Result<(), String> {
    let mut response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to download runtime archive: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "runtime archive download failed with {}",
            response.status()
        ));
    }
    let mut file = File::create(archive_path)
        .map_err(|error| format!("failed to create runtime archive: {error}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("failed while downloading runtime archive: {error}"))?
    {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        file.write_all(&chunk)
            .map_err(|error| format!("failed to write runtime archive: {error}"))?;
    }
    file.flush()
        .map_err(|error| format!("failed to flush runtime archive: {error}"))?;
    if let Some(expected) = expected_size_bytes {
        if expected != downloaded {
            return Err(format!(
                "runtime archive size mismatch. Expected {expected} bytes, got {downloaded} bytes."
            ));
        }
    }
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("failed to open file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("failed to read file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn extract_runtime_archive(archive_path: &Path, app_data_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path)
        .map_err(|error| format!("failed to open runtime archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("runtime archive is not a valid zip: {error}"))?;
    let install_root = app_data_dir.join("runtime-install");
    if install_root.exists() {
        fs::remove_dir_all(&install_root)
            .map_err(|error| format!("failed to clear runtime install staging: {error}"))?;
    }
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("failed to create runtime install staging: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read runtime archive entry: {error}"))?;
        let out_path = safe_archive_output_path(&install_root, entry.name())?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
        }
        let mut out_file = File::create(&out_path)
            .map_err(|error| format!("failed to create runtime file: {error}"))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|error| format!("failed to extract runtime file: {error}"))?;
    }
    let staged_runtime_pack = install_root.join("runtime-pack");
    let staged_sidecars = install_root.join("sidecars");
    if !staged_runtime_pack.join("manifest.json").is_file() {
        return Err("Runtime archive must contain runtime-pack/manifest.json.".into());
    }
    if !staged_sidecars.is_dir() {
        return Err("Runtime archive must contain sidecars/.".into());
    }
    replace_runtime_directories(&staged_runtime_pack, &staged_sidecars, app_data_dir)?;
    let _ = fs::remove_dir_all(&install_root);
    Ok(())
}

fn safe_archive_output_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let relative = Path::new(name);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Runtime archive contains an unsafe path.".into());
    }
    Ok(root.join(relative))
}

fn replace_dir(from: &Path, to: &Path) -> Result<(), String> {
    let previous = if to.exists() {
        let backup = to.with_file_name(format!(
            "{}_old_{}",
            to.file_name().unwrap_or_default().to_string_lossy(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));

        if let Err(error) = fs::rename(to, &backup) {
            return Err(format!(
                "failed to move previous runtime directory: {error}"
            ));
        }
        Some(backup)
    } else {
        None
    };

    if let Some(parent) = to.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            if let Some(previous) = previous.as_ref() {
                let _ = fs::rename(previous, to);
            }
            return Err(format!(
                "failed to create runtime parent directory: {error}"
            ));
        }
    }

    match fs::rename(from, to) {
        Ok(()) => {
            if let Some(previous) = previous {
                let _ = fs::remove_dir_all(previous);
            }
            Ok(())
        }
        Err(error) => {
            let restore_error = previous.and_then(|previous| fs::rename(previous, to).err());
            if let Some(restore_error) = restore_error {
                Err(format!(
                    "failed to install runtime directory: {error}; failed to restore previous runtime directory: {restore_error}"
                ))
            } else {
                Err(format!("failed to install runtime directory: {error}"))
            }
        }
    }
}

/// Replace the two directories that form one runtime release as a single
/// recoverable operation. Keeping `runtime-pack` and `sidecars` from
/// different archives can make the next launch fail in non-obvious ways, so
/// a failure in either move restores the previous pair before returning.
fn replace_runtime_directories(
    staged_runtime_pack: &Path,
    staged_sidecars: &Path,
    app_data_dir: &Path,
) -> Result<(), String> {
    let runtime_pack = app_data_dir.join("runtime-pack");
    let sidecars = app_data_dir.join("sidecars");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let runtime_pack_backup = app_data_dir.join(format!("runtime-pack_old_{stamp}"));
    let sidecars_backup = app_data_dir.join(format!("sidecars_old_{stamp}"));

    if !staged_runtime_pack.is_dir() {
        return Err("staged runtime-pack directory is missing".into());
    }
    if !staged_sidecars.is_dir() {
        return Err("staged sidecars directory is missing".into());
    }

    let mut runtime_pack_backed_up = false;
    let mut sidecars_backed_up = false;
    let mut runtime_pack_installed = false;
    let mut sidecars_installed = false;

    let result = (|| {
        if runtime_pack.exists() {
            fs::rename(&runtime_pack, &runtime_pack_backup)
                .map_err(|error| format!("failed to move previous runtime directory: {error}"))?;
            runtime_pack_backed_up = true;
        }
        if sidecars.exists() {
            if let Err(error) = fs::rename(&sidecars, &sidecars_backup) {
                return Err(format!(
                    "failed to move previous sidecars directory: {error}"
                ));
            }
            sidecars_backed_up = true;
        }
        fs::rename(staged_runtime_pack, &runtime_pack)
            .map_err(|error| format!("failed to install runtime directory: {error}"))?;
        runtime_pack_installed = true;
        fs::rename(staged_sidecars, &sidecars)
            .map_err(|error| format!("failed to install sidecars directory: {error}"))?;
        sidecars_installed = true;
        Ok(())
    })();

    if result.is_ok() {
        if runtime_pack_backed_up {
            let _ = fs::remove_dir_all(&runtime_pack_backup);
        }
        if sidecars_backed_up {
            let _ = fs::remove_dir_all(&sidecars_backup);
        }
        return Ok(());
    }

    if sidecars_installed {
        let _ = fs::remove_dir_all(&sidecars);
    }
    if runtime_pack_installed {
        let _ = fs::remove_dir_all(&runtime_pack);
    }
    if sidecars_backed_up {
        let _ = fs::rename(&sidecars_backup, &sidecars);
    }
    if runtime_pack_backed_up {
        let _ = fs::rename(&runtime_pack_backup, &runtime_pack);
    }

    result
}

fn active_connected_device_proof(
    state: &tauri::State<'_, WorkerAppState>,
) -> Result<Option<WorkerDeviceProofMaterial>, String> {
    state
        .active_connected_device_proof
        .lock()
        .map(|proof| proof.clone())
        .map_err(|_| "active connected device proof lock poisoned".to_string())
}

fn set_active_connected_device_proof(
    state: &tauri::State<'_, WorkerAppState>,
    device_proof: Option<WorkerDeviceProofMaterial>,
) -> Result<(), String> {
    let mut active = state
        .active_connected_device_proof
        .lock()
        .map_err(|_| "active connected device proof lock poisoned".to_string())?;
    *active = device_proof;
    Ok(())
}

fn update_running_loop_connection(
    state: &tauri::State<'_, WorkerAppState>,
    stored: &StoredWorkerConnection,
    app_data_dir: &std::path::Path,
) -> Result<(), String> {
    let locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if let Some(existing) = locked_loop.as_ref() {
        let mut connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        let device_proof = match active_connected_device_proof(state)? {
            Some(device_proof) => device_proof,
            None => ensure_device_proof_material(app_data_dir)?,
        };
        validate_connection_tokens_match_device_proof(
            app_data_dir,
            "worker_loop.update_connection",
            &stored.tokens,
            &device_proof,
        )?;
        *connection = WorkerLoopConnection {
            server_url: stored.server_url.trim().trim_end_matches('/').to_string(),
            worker_id: stored.worker.id.trim().to_string(),
            worker_label: stored.worker.display_name.trim().to_string(),
            tokens: WorkerApiTokens {
                execution_token: stored.tokens.execution_token.trim().to_string(),
                upload_token: stored.tokens.upload_token.trim().to_string(),
            },
            device_proof,
        };
    }
    Ok(())
}

fn validate_connection_tokens_match_device_proof(
    app_data_dir: &Path,
    context: &str,
    tokens: &WorkerConnectTokens,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<(), String> {
    let local = summarize_local_device_proof(device_proof);
    let token_summaries = [
        ("execution", Some(tokens.execution_token.as_str())),
        ("upload", Some(tokens.upload_token.as_str())),
        ("refresh", tokens.refresh_token.as_deref()),
    ]
    .into_iter()
    .filter_map(|(name, token)| {
        token
            .filter(|value| !value.trim().is_empty())
            .map(|value| decode_worker_token_binding(value).map(|summary| (name, summary)))
    })
    .collect::<Result<Vec<_>, _>>()?;

    for (name, summary) in &token_summaries {
        let mismatches = token_device_binding_mismatches(summary, &local);
        if !mismatches.is_empty() {
            append_diagnostic_event(
                app_data_dir,
                "token.device_binding_mismatch",
                json!({
                    "context": context,
                    "tokenName": name,
                    "mismatches": mismatches,
                    "localDeviceProof": local_device_proof_summary_json(&local),
                    "token": token_binding_summary_json(summary),
                }),
            );
            return Err(format!(
                "Worker App token/device proof mismatch before {context}. Reconnect this Worker App in your browser. Diagnostic log: {}",
                diagnostic_log_path(app_data_dir).to_string_lossy()
            ));
        }
    }

    append_diagnostic_event(
        app_data_dir,
        "token.device_binding_ok",
        json!({
            "context": context,
            "localDeviceProof": local_device_proof_summary_json(&local),
            "tokens": token_summaries
                .iter()
                .map(|(name, summary)| json!({
                    "name": name,
                    "claims": token_binding_summary_json(summary),
                }))
                .collect::<Vec<_>>(),
        }),
    );
    Ok(())
}

fn decode_worker_token_binding(token: &str) -> Result<WorkerTokenBindingSummary, String> {
    let payload = token
        .trim()
        .split('.')
        .nth(1)
        .ok_or_else(|| "worker token is not a JWT".to_string())?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload)
        .map_err(|error| format!("worker token payload is invalid: {error}"))?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("worker token payload is not JSON: {error}"))?;
    Ok(WorkerTokenBindingSummary {
        connection_id: string_claim(&value, "workerConnectionId"),
        device_id: string_claim(&value, "deviceId"),
        expires_at: value.get("exp").and_then(Value::as_i64),
        jti: string_claim(&value, "jti"),
        machine_fingerprint_hash: string_claim(&value, "machineFingerprintHash"),
        public_key_fingerprint: string_claim(&value, "devicePublicKeyFingerprint"),
        token_use: string_claim(&value, "tokenUse"),
        worker_id: string_claim(&value, "workerId"),
    })
}

fn string_claim(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn summarize_local_device_proof(
    device_proof: &WorkerDeviceProofMaterial,
) -> LocalDeviceProofSummary {
    LocalDeviceProofSummary {
        device_id: device_proof.device_id.trim().to_string(),
        machine_fingerprint_hash: normalize_machine_fingerprint_hash(
            &device_proof.machine_fingerprint,
        ),
        public_key_fingerprint: sha256_hex(
            normalize_public_key(&device_proof.public_key_pem).as_bytes(),
        ),
    }
}

fn token_device_binding_mismatches(
    token: &WorkerTokenBindingSummary,
    local: &LocalDeviceProofSummary,
) -> Vec<&'static str> {
    let mut mismatches = Vec::new();
    if token
        .device_id
        .as_deref()
        .is_some_and(|device_id| device_id != local.device_id)
    {
        mismatches.push("deviceId");
    }
    if token
        .public_key_fingerprint
        .as_deref()
        .is_some_and(|fingerprint| fingerprint != local.public_key_fingerprint)
    {
        mismatches.push("devicePublicKeyFingerprint");
    }
    if token
        .machine_fingerprint_hash
        .as_deref()
        .is_some_and(|fingerprint| fingerprint != local.machine_fingerprint_hash)
    {
        mismatches.push("machineFingerprintHash");
    }
    mismatches
}

fn tokens_summary_json(tokens: &WorkerConnectTokens) -> Value {
    json!({
        "execution": decode_worker_token_binding(&tokens.execution_token)
            .map(|summary| token_binding_summary_json(&summary))
            .unwrap_or_else(|error| json!({ "decodeError": error })),
        "upload": decode_worker_token_binding(&tokens.upload_token)
            .map(|summary| token_binding_summary_json(&summary))
            .unwrap_or_else(|error| json!({ "decodeError": error })),
        "refresh": tokens.refresh_token.as_ref().map(|token| {
            decode_worker_token_binding(token)
                .map(|summary| token_binding_summary_json(&summary))
                .unwrap_or_else(|error| json!({ "decodeError": error }))
        }),
    })
}

fn token_binding_summary_json(summary: &WorkerTokenBindingSummary) -> Value {
    json!({
        "connectionIdHash": summary.connection_id.as_deref().map(hash_for_log),
        "deviceIdHash": summary.device_id.as_deref().map(hash_for_log),
        "expiresAt": summary.expires_at,
        "jtiHash": summary.jti.as_deref().map(hash_for_log),
        "machineFingerprintHash": summary.machine_fingerprint_hash,
        "publicKeyFingerprint": summary.public_key_fingerprint,
        "tokenUse": summary.token_use,
        "workerId": summary.worker_id,
    })
}

fn local_device_proof_summary_json(summary: &LocalDeviceProofSummary) -> Value {
    json!({
        "deviceIdHash": hash_for_log(&summary.device_id),
        "machineFingerprintHash": summary.machine_fingerprint_hash,
        "publicKeyFingerprint": summary.public_key_fingerprint,
    })
}

fn normalize_public_key(public_key: &str) -> String {
    public_key
        .replace("\\n", "\n")
        .replace("\r\n", "\n")
        .trim()
        .to_string()
}

fn normalize_machine_fingerprint_hash(machine_fingerprint: &str) -> String {
    let trimmed = machine_fingerprint.trim();
    if trimmed.len() == 64 && trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        trimmed.to_lowercase()
    } else {
        sha256_hex(trimmed.as_bytes())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn hash_for_log(value: &str) -> String {
    sha256_hex(value.as_bytes())
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

async fn parse_json_response<T>(response: reqwest::Response) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("unable to read server response: {error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|message| message.as_str())
                    .map(str::to_string)
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
            })
            .unwrap_or_else(|| text.chars().take(240).collect());
        return Err(format!(
            "server rejected worker connection ({status}): {message}"
        ));
    }
    serde_json::from_str::<T>(&text)
        .map_err(|error| format!("server returned an unexpected response: {error}"))
}

fn worker_connect_url(server_url: &str) -> String {
    format!(
        "{}/workers/connect",
        server_url.trim().trim_end_matches('/')
    )
}

pub async fn try_refresh_connection_if_needed(
    app_data_dir: &std::path::Path,
    running_connection: &std::sync::Arc<std::sync::Mutex<WorkerLoopConnection>>,
) -> Result<(), String> {
    let current_tokens = {
        let lock = running_connection
            .lock()
            .map_err(|_| "worker connection lock poisoned".to_string())?;
        lock.tokens.clone()
    };

    let execution_exp =
        crate::worker_control_plane::jwt_exp(&current_tokens.execution_token).unwrap_or(0);
    let upload_exp =
        crate::worker_control_plane::jwt_exp(&current_tokens.upload_token).unwrap_or(0);
    let exp = execution_exp.min(upload_exp);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    if exp > now + 300 {
        return Ok(());
    }

    // Same gate as the command path — the worker loop is the fourth driver
    // that can rotate this single-use token.
    let _gate = REFRESH_GATE.lock().await;
    let mut stored = load_connection(app_data_dir)?
        .ok_or_else(|| "Worker App is not connected yet.".to_string())?;

    // Another caller may have rotated while this one waited for the gate. Its
    // tokens are already on disk and already valid — adopt them.
    if refresh_can_be_coalesced(&stored) {
        append_diagnostic_event(
            app_data_dir,
            "connection.refresh.coalesced",
            json!({
                "caller": "worker_loop_expiry_guard",
                "lastRefreshedAt": stored.last_refreshed_at,
                "remainingTokenSeconds": remaining_token_seconds(&stored),
            }),
        );
        let mut lock = running_connection
            .lock()
            .map_err(|_| "worker connection lock poisoned".to_string())?;
        lock.tokens = WorkerApiTokens {
            execution_token: stored.tokens.execution_token.clone(),
            upload_token: stored.tokens.upload_token.clone(),
        };
        return Ok(());
    }

    let refresh_token = stored
        .tokens
        .refresh_token
        .clone()
        .ok_or_else(|| "Worker connection does not include a refresh token.".to_string())?;

    let device_proof = match load_connection_device_proof(app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(app_data_dir)?,
    };

    let new_tokens = refresh_worker_connect_tokens(
        app_data_dir,
        "worker_loop_expiry_guard",
        &stored.server_url,
        &refresh_token,
        &device_proof,
    )
    .await?;

    stored.tokens = new_tokens;
    stored.last_refreshed_at = Some(
        time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap(),
    );
    save_connection_with_device_proof(app_data_dir, &stored, &device_proof)?;

    {
        let mut lock = running_connection
            .lock()
            .map_err(|_| "worker connection lock poisoned".to_string())?;
        lock.tokens = WorkerApiTokens {
            execution_token: stored.tokens.execution_token.clone(),
            upload_token: stored.tokens.upload_token.clone(),
        };
    }

    Ok(())
}

#[tauri::command]
pub async fn worker_app_open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn is_windows_installer_payload(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == b'M' && bytes[1] == b'Z'
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn validate_windows_installer(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("downloaded Worker App installer is unavailable: {error}"))?;
    if metadata.len() < 2 {
        return Err("downloaded Worker App installer is empty or truncated.".into());
    }

    let mut file = File::open(path)
        .map_err(|error| format!("downloaded Worker App installer cannot be opened: {error}"))?;
    let mut signature = [0_u8; 2];
    file.read_exact(&mut signature)
        .map_err(|error| format!("downloaded Worker App installer cannot be read: {error}"))?;
    if !is_windows_installer_payload(&signature) {
        return Err(
            "downloaded Worker App update is not a Windows installer (missing MZ signature)."
                .into(),
        );
    }
    Ok(metadata.len())
}

#[cfg(target_os = "windows")]
fn launch_windows_installer(installer_path: &Path) -> Result<(), String> {
    let mut last_sharing_error = None;
    for attempt in 0..5_u64 {
        match std::process::Command::new(installer_path).spawn() {
            Ok(_) => return Ok(()),
            Err(error) if error.raw_os_error() == Some(32) => {
                last_sharing_error = Some(error.to_string());
                std::thread::sleep(Duration::from_millis(400 * (attempt + 1)));
            }
            Err(error) => {
                return Err(format!("failed to open Worker App installer: {error}"));
            }
        }
    }

    // Antivirus/indexer software can keep a newly downloaded PE file open
    // longer than the short retry window above. Hand off to a detached
    // PowerShell process that waits for a readable handle before launching
    // the installer; this process survives the current Worker App exiting.
    let wait_and_launch_script = r#"
$path = $args[0]
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  try {
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $stream.Dispose()
    Start-Process -FilePath $path
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
exit 1
"#;
    std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            wait_and_launch_script,
        ])
        .arg(installer_path)
        .spawn()
        .map_err(|fallback_error| {
            format!(
                "failed to open Worker App installer after sharing violation ({}) and fallback launch also failed: {fallback_error}",
                last_sharing_error.unwrap_or_else(|| "unknown sharing violation".into()),
            )
        })?;
    Ok(())
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn is_worker_app_update_url(server_url: &str, candidate_url: &str) -> bool {
    if !(candidate_url.starts_with("https://") || candidate_url.starts_with("http://localhost"))
        || !same_url_origin(server_url, candidate_url)
    {
        return false;
    }
    reqwest::Url::parse(candidate_url)
        .map(|url| url.path() == "/api/desktop-releases/worker-app/download")
        .unwrap_or(false)
}

#[tauri::command]
pub async fn worker_app_install_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    url: String,
    version: String,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&app, &state, &url, &version);
        return Err("Worker App self-update is only supported on Windows.".into());
    }

    #[cfg(target_os = "windows")]
    {
        let url = url.trim();
        let version = version.trim();
        if version.is_empty() {
            return Err("Worker App update version is missing.".into());
        }
        let server_url = state
            .settings
            .lock()
            .map(|settings| settings.normalized_server_url())
            .map_err(|_| "settings lock poisoned".to_string())?;
        if !is_worker_app_update_url(&server_url, url) {
            return Err("Update URL must use the configured Smart AI Hub server origin.".into());
        }

        let update_dir = std::env::temp_dir().join("smartaihub-worker-app-updates");
        fs::create_dir_all(&update_dir)
            .map_err(|error| format!("failed to create Worker App update directory: {error}"))?;
        let safe_version = sanitize_file_segment(version);
        if safe_version.is_empty() {
            return Err("Worker App update version is invalid.".into());
        }
        let update_nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        let installer_path = update_dir.join(format!(
            "smart-ai-hub-worker-app-update-{safe_version}-{update_nonce}.exe"
        ));
        let partial_path = update_dir.join(format!(
            "smart-ai-hub-worker-app-update-{safe_version}-{update_nonce}.exe.download"
        ));

        let response = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("unable to create Worker App update client: {error}"))?
            .get(url)
            .send()
            .await
            .map_err(|error| format!("unable to download Worker App update: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Worker App update download failed with {}.",
                response.status()
            ));
        }
        let expected_size = response.content_length();
        let mut response = response;
        let mut file = File::create(&partial_path)
            .map_err(|error| format!("failed to create Worker App update file: {error}"))?;
        let mut downloaded = 0_u64;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("failed while downloading Worker App update: {error}"))?
        {
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            file.write_all(&chunk)
                .map_err(|error| format!("failed to save Worker App update: {error}"))?;
        }
        file.flush()
            .map_err(|error| format!("failed to flush Worker App update: {error}"))?;
        // Windows keeps the file handle open until `file` leaves scope. Close
        // it before validation, rename, and especially before spawning the
        // installer; otherwise CreateProcess returns ERROR_SHARING_VIOLATION
        // (os error 32) even when no other process is holding the file.
        drop(file);
        if let Some(expected) = expected_size {
            if expected != downloaded {
                return Err(format!(
                    "Worker App update size mismatch. Expected {expected} bytes, got {downloaded} bytes."
                ));
            }
        }
        validate_windows_installer(&partial_path)?;
        fs::rename(&partial_path, &installer_path)
            .map_err(|error| format!("failed to prepare Worker App installer: {error}"))?;

        stop_worker_loop_state(&state).await?;
        launch_windows_installer(&installer_path)?;
        // Let the invoke call resolve so the UI can show that the installer
        // started before the current executable exits and NSIS replaces it.
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(Duration::from_millis(750));
            app.exit(0);
        });
        Ok(format!("Worker App update {version} installer started."))
    }
}

#[tauri::command]
pub async fn worker_app_open_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    url: String,
) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://localhost")) {
        return Err("Only HTTPS or localhost URLs can be opened by Worker App.".into());
    }
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    if !same_url_origin(&server_url, url) {
        return Err("Update URL must use the configured Smart AI Hub server origin.".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn same_url_origin(base_url: &str, candidate_url: &str) -> bool {
    let Ok(base) = reqwest::Url::parse(base_url) else {
        return false;
    };
    let Ok(candidate) = reqwest::Url::parse(candidate_url) else {
        return false;
    };
    base.scheme() == candidate.scheme()
        && base.host_str() == candidate.host_str()
        && base.port_or_known_default() == candidate.port_or_known_default()
}

#[cfg(test)]
mod connection_health_tests {
    use super::jwt_exp_epoch_seconds;
    use base64::Engine as _;

    fn jwt_with_payload(payload: &str) -> String {
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.as_bytes());
        format!("header.{b64}.signature")
    }

    #[test]
    fn reads_the_exp_claim() {
        let token = jwt_with_payload(r#"{"sub":"worker-1","exp":1785500000}"#);
        assert_eq!(jwt_exp_epoch_seconds(&token), Some(1785500000));
    }

    #[test]
    fn returns_none_when_exp_is_absent() {
        let token = jwt_with_payload(r#"{"sub":"worker-1"}"#);
        assert_eq!(jwt_exp_epoch_seconds(&token), None);
    }

    /// A token this client cannot parse may still be one the SERVER accepts,
    /// so every malformed shape degrades to "no expiry shown" rather than an
    /// error that would look like a broken connection.
    #[test]
    fn tolerates_malformed_tokens_without_erroring() {
        assert_eq!(jwt_exp_epoch_seconds(""), None);
        assert_eq!(jwt_exp_epoch_seconds("not-a-jwt"), None);
        assert_eq!(jwt_exp_epoch_seconds("header.!!!not-base64!!!.sig"), None);
        assert_eq!(jwt_exp_epoch_seconds(&jwt_with_payload("not json")), None);
        assert_eq!(
            jwt_exp_epoch_seconds(&jwt_with_payload(r#"{"exp":"tomorrow"}"#)),
            None
        );
    }
}

/// Guards the rotation-race fix: four independent drivers rotate one
/// single-use refresh token, and the coalescing rules below are what stop the
/// loser of that race from presenting a token the winner already spent.
#[cfg(test)]
mod refresh_coalescing_tests {
    use super::{
        is_transient_control_plane_error, is_worker_auth_rejection, refresh_can_be_coalesced,
        remaining_token_seconds, REFRESH_COALESCE_WINDOW_SECONDS,
    };
    use super::{ConnectionHealthStatus, WorkerConnectTokens, WorkerConnectWorker};
    use crate::credentials::StoredWorkerConnection;
    use base64::Engine as _;
    use time::{format_description::well_known::Rfc3339, OffsetDateTime};

    fn token_expiring_in(seconds: i64) -> String {
        let exp = OffsetDateTime::now_utc().unix_timestamp() + seconds;
        let payload = format!(r#"{{"sub":"worker-1","exp":{exp}}}"#);
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.as_bytes());
        format!("header.{b64}.signature")
    }

    fn connection(
        refreshed_seconds_ago: Option<i64>,
        token_life_seconds: i64,
    ) -> StoredWorkerConnection {
        StoredWorkerConnection {
            server_url: "https://smartaihub.app".into(),
            worker: WorkerConnectWorker {
                id: "wrk_1".into(),
                display_name: "Render worker".into(),
                runtime_type: "desktop_zeroclaw_managed".into(),
                machine_name: None,
            },
            tokens: WorkerConnectTokens {
                execution_token: token_expiring_in(token_life_seconds),
                upload_token: token_expiring_in(token_life_seconds),
                refresh_token: Some(token_expiring_in(7 * 24 * 3600)),
            },
            connected_at: "2026-06-23T00:00:00Z".into(),
            last_refreshed_at: refreshed_seconds_ago.map(|ago| {
                (OffsetDateTime::now_utc() - time::Duration::seconds(ago))
                    .format(&Rfc3339)
                    .unwrap()
            }),
        }
    }

    #[test]
    fn a_caller_queued_behind_a_fresh_rotation_reuses_its_result() {
        assert!(refresh_can_be_coalesced(&connection(Some(2), 8 * 3600)));
    }

    #[test]
    fn a_rotation_older_than_the_window_is_not_reused() {
        let stale = connection(Some(REFRESH_COALESCE_WINDOW_SECONDS + 5), 8 * 3600);
        assert!(!refresh_can_be_coalesced(&stale));
    }

    /// A recent rotation is not enough on its own — tokens about to expire
    /// must still rotate, or the coalescing would hand back credentials that
    /// die mid-job.
    #[test]
    fn recent_rotation_does_not_excuse_nearly_expired_tokens() {
        assert!(!refresh_can_be_coalesced(&connection(Some(2), 60)));
    }

    #[test]
    fn a_connection_that_never_refreshed_always_rotates() {
        assert!(!refresh_can_be_coalesced(&connection(None, 8 * 3600)));
    }

    #[test]
    fn remaining_seconds_follows_the_shorter_of_the_two_tokens() {
        let mut stored = connection(None, 8 * 3600);
        stored.tokens.upload_token = token_expiring_in(600);
        let remaining = remaining_token_seconds(&stored);
        assert!((595..=605).contains(&remaining), "got {remaining}");
    }

    /// "The server did not answer" must never be reported as "the server said
    /// no" — that is what turns a Wi-Fi hiccup at login into a spurious
    /// "reconnect required" dialog on a healthy machine.
    #[test]
    fn transport_failures_are_not_auth_rejections() {
        assert!(!is_worker_auth_rejection(
            "worker control plane request timed out after 15000ms"
        ));
        assert!(!is_worker_auth_rejection(
            "server rejected worker connection (503): upstream unavailable"
        ));
        assert!(!is_worker_auth_rejection(
            "server rejected worker connection (429): too many requests"
        ));
    }

    #[test]
    fn transient_control_plane_failures_are_retryable() {
        for error in [
            "worker control plane request timed out after 30000ms",
            "worker control plane request failed: connection reset",
            "worker control plane returned HTTP 429: too many requests",
            "worker control plane returned HTTP 503: upstream unavailable",
        ] {
            assert!(is_transient_control_plane_error(error), "{error}");
        }
    }

    #[test]
    fn credential_verdicts_are_not_transient() {
        for error in [
            "worker control plane returned HTTP 401: Worker token has been revoked",
            "worker control plane returned HTTP 403: worker scope mismatch",
            "worker control plane returned HTTP 401: Worker device proof is required",
        ] {
            assert!(!is_transient_control_plane_error(error), "{error}");
        }
    }

    #[test]
    fn health_status_uses_the_react_boundary_names() {
        assert_eq!(
            serde_json::to_string(&ConnectionHealthStatus::ReconnectRequired).unwrap(),
            "\"reconnectRequired\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionHealthStatus::Transient).unwrap(),
            "\"transient\""
        );
    }

    #[test]
    fn server_auth_verdicts_are_rejections() {
        assert!(is_worker_auth_rejection(
            "server rejected worker connection (401): Worker token has been revoked"
        ));
        assert!(is_worker_auth_rejection(
            "server rejected worker connection (403): worker scope mismatch"
        ));
        assert!(is_worker_auth_rejection(
            "server rejected worker connection (401): Worker device proof is required"
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_start_connect_registration_payload, is_windows_installer_payload,
        is_worker_app_update_url, normalize_machine_fingerprint_hash,
        parse_managed_wsl_runtime_version, replace_dir, replace_runtime_directories,
        runtime_update_available, same_url_origin, summarize_local_device_proof,
        token_device_binding_mismatches, validate_windows_installer, worker_connect_url,
        WorkerTokenBindingSummary,
        build_comfy_upload_arguments,
        find_comfy_schema_section, is_allowed_comfy_output_path,
    };
    use crate::credentials::{WorkerDeviceBinding, WorkerDeviceProofMaterial};
    use crate::runtime_manifest::DoctorSummary;
    use crate::settings::WorkerAppSettings;
    use base64::Engine;
    use std::fs;
    use std::path::Path;

    #[test]
    fn worker_connect_url_uses_configured_server_without_double_slashes() {
        assert_eq!(
            worker_connect_url("https://smartaihub.app/"),
            "https://smartaihub.app/workers/connect",
        );
    }

    #[test]
    fn comfy_upload_arguments_use_path_for_local_and_base64_for_remote() {
        let schema = r#"{"type":"object","properties":{"file_path":{"type":"string"},"file_name":{"type":"string"},"mime_type":{"type":"string"}}}"#;
        let local = build_comfy_upload_arguments(Some(schema), Path::new("C:/input/a.png"), "a.png", "image/png", b"png", true).unwrap();
        assert_eq!(local.get("file_path").and_then(|value| value.as_str()), Some("C:/input/a.png"));
        let remote_schema = r#"{"type":"object","properties":{"data":{"type":"string"},"fileName":{"type":"string"}}}"#;
        let remote = build_comfy_upload_arguments(Some(remote_schema), Path::new("a.png"), "a.png", "image/png", b"png", false).unwrap();
        assert_eq!(remote.get("data").and_then(|value| value.as_str()), Some("cG5n"));
        assert_eq!(remote.get("fileName").and_then(|value| value.as_str()), Some("a.png"));
    }

    #[test]
    fn direct_workflow_schema_is_used_when_mcp_does_not_wrap_input() {
        let schema = serde_json::json!({"type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"]});
        assert_eq!(find_comfy_schema_section(&schema, &["inputSchema", "schema"]), schema);
    }

    #[test]
    fn local_comfy_outputs_are_limited_to_media_files() {
        assert!(is_allowed_comfy_output_path(Path::new("output.png")));
        assert!(is_allowed_comfy_output_path(Path::new("clip.MP4")));
        assert!(!is_allowed_comfy_output_path(Path::new("result.json")));
        assert!(!is_allowed_comfy_output_path(Path::new("secret.txt")));
    }

    #[test]
    fn runtime_update_check_uses_numeric_version_ordering() {
        assert!(runtime_update_available(
            Some("2026.08.04.1"),
            Some("2026.08.04.2"),
            true
        ));
        assert!(!runtime_update_available(
            Some("2026.08.04.2"),
            Some("2026.08.04.2"),
            true
        ));
        assert!(!runtime_update_available(
            Some("2026.08.04.3"),
            Some("2026.08.04.2"),
            true
        ));
    }

    #[test]
    fn runtime_update_check_requires_an_allowed_latest_manifest() {
        assert!(!runtime_update_available(
            Some("2026.08.04.1"),
            Some("2026.08.04.2"),
            false
        ));
        assert!(runtime_update_available(None, Some("2026.08.04.2"), true));
        assert!(!runtime_update_available(Some("2026.08.04.1"), None, true));
    }

    #[test]
    fn replacing_runtime_restores_previous_directory_when_install_fails() {
        let temp = tempfile::tempdir().unwrap();
        let current = temp.path().join("runtime-pack");
        let missing_staged = temp.path().join("staged-runtime-pack");
        fs::create_dir_all(&current).unwrap();
        fs::write(current.join("marker.txt"), "previous").unwrap();

        let result = replace_dir(&missing_staged, &current);

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(current.join("marker.txt")).unwrap(),
            "previous"
        );
    }

    #[test]
    fn replacing_runtime_directories_installs_matching_runtime_and_sidecars() {
        let temp = tempfile::tempdir().unwrap();
        let staged = temp.path().join("runtime-install");
        let staged_runtime = staged.join("runtime-pack");
        let staged_sidecars = staged.join("sidecars");
        fs::create_dir_all(&staged_runtime).unwrap();
        fs::create_dir_all(&staged_sidecars).unwrap();
        fs::write(staged_runtime.join("manifest.json"), "new-runtime").unwrap();
        fs::write(staged_sidecars.join("render.mjs"), "new-sidecar").unwrap();

        let current_runtime = temp.path().join("runtime-pack");
        let current_sidecars = temp.path().join("sidecars");
        fs::create_dir_all(&current_runtime).unwrap();
        fs::create_dir_all(&current_sidecars).unwrap();
        fs::write(current_runtime.join("manifest.json"), "old-runtime").unwrap();
        fs::write(current_sidecars.join("render.mjs"), "old-sidecar").unwrap();

        replace_runtime_directories(&staged_runtime, &staged_sidecars, temp.path()).unwrap();

        assert_eq!(
            fs::read_to_string(current_runtime.join("manifest.json")).unwrap(),
            "new-runtime"
        );
        assert_eq!(
            fs::read_to_string(current_sidecars.join("render.mjs")).unwrap(),
            "new-sidecar"
        );
        assert!(!staged_runtime.exists());
        assert!(!staged_sidecars.exists());
        assert_eq!(
            fs::read_dir(temp.path())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("_old_"))
                .count(),
            0
        );
    }

    #[test]
    fn managed_wsl_runtime_version_parser_reads_the_actual_manifest_marker() {
        assert_eq!(
            parse_managed_wsl_runtime_version(
                "runtime_manifest_version=2026.08.04.5\nruntime_manifest_remotion_contract=2026-08-04.2"
            ),
            Some("2026.08.04.5".into())
        );
        assert_eq!(
            parse_managed_wsl_runtime_version("runtime is not installed"),
            None
        );
    }

    #[test]
    fn update_opener_rejects_cross_origin_urls() {
        assert!(same_url_origin(
            "https://smartaihub.app",
            "https://smartaihub.app/api/desktop-releases/worker-app/download"
        ));
        assert!(same_url_origin(
            "http://localhost:5000",
            "http://localhost:5000/api/desktop-releases/worker-app/download"
        ));
        assert!(!same_url_origin(
            "https://smartaihub.app",
            "https://evil.example/download.exe"
        ));
        assert!(!same_url_origin(
            "https://smartaihub.app",
            "http://smartaihub.app/api/desktop-releases/worker-app/download"
        ));
    }

    #[test]
    fn worker_app_update_accepts_only_the_dashboard_installer_endpoint() {
        assert!(is_worker_app_update_url(
            "https://smartaihub.app",
            "https://smartaihub.app/api/desktop-releases/worker-app/download"
        ));
        assert!(!is_worker_app_update_url(
            "https://smartaihub.app",
            "https://smartaihub.app/api/desktop-releases/worker-app/latest"
        ));
        assert!(!is_worker_app_update_url(
            "https://smartaihub.app",
            "https://evil.example/api/desktop-releases/worker-app/download"
        ));
    }

    #[test]
    fn worker_app_update_accepts_only_windows_executable_payloads() {
        assert!(is_windows_installer_payload(b"MZ\x90\x00"));
        assert!(!is_windows_installer_payload(b"PK\x03\x04"));
        assert!(!is_windows_installer_payload(b""));
    }

    #[test]
    fn worker_app_update_rejects_truncated_or_non_executable_downloads() {
        let temp = tempfile::tempdir().unwrap();
        let invalid_path = temp.path().join("invalid.exe");
        fs::write(&invalid_path, b"<!doctype html>").unwrap();
        assert!(validate_windows_installer(&invalid_path)
            .unwrap_err()
            .contains("missing MZ signature"));

        let valid_path = temp.path().join("valid.exe");
        fs::write(&valid_path, b"MZfake-installer").unwrap();
        assert_eq!(validate_windows_installer(&valid_path).unwrap(), 16);
    }

    #[test]
    fn fix_a_start_connect_registration_payload_carries_real_hermes_readiness() {
        let settings = WorkerAppSettings::default();
        let render_doctor = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: None,
        };
        let hermes_ready = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: Some("hermes".into()),
        };
        let hermes_blocked = DoctorSummary {
            status: "blocked".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: Some("hermes".into()),
        };
        let device_binding = WorkerDeviceBinding {
            device_id: "wdev_test".into(),
            machine_fingerprint: "machine_test".into(),
            public_key: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----".into(),
        };

        // This is EXACTLY what `worker_app_start_connect_session` calls —
        // no more `HermesRegistrationInfo::not_installed()` default.
        let ready_payload = build_start_connect_registration_payload(
            &settings,
            &render_doctor,
            &hermes_ready,
            Some("hermes-cli 0.18.2".into()),
            device_binding.clone(),
        );
        let blocked_payload = build_start_connect_registration_payload(
            &settings,
            &render_doctor,
            &hermes_blocked,
            None,
            device_binding,
        );

        assert_eq!(
            ready_payload.capabilities_json["hermesMedia"]["advertised"],
            true
        );
        assert_eq!(
            ready_payload.capabilities_json["hermesMedia"]["hermesVersion"],
            "hermes-cli 0.18.2"
        );
        assert_eq!(
            blocked_payload.capabilities_json["hermesMedia"]["advertised"],
            false
        );
    }

    #[test]
    fn local_device_proof_summary_matches_server_binding_hash_rules() {
        let material = WorkerDeviceProofMaterial {
            device_id: "wdev_1".into(),
            machine_fingerprint: "machine_same".into(),
            public_key_pem: "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----".into(),
            private_key_pem: "private".into(),
        };

        let summary = summarize_local_device_proof(&material);

        assert_eq!(summary.device_id, "wdev_1");
        assert_eq!(
            summary.machine_fingerprint_hash,
            normalize_machine_fingerprint_hash("machine_same")
        );
        assert_eq!(summary.public_key_fingerprint.len(), 64);
    }

    #[test]
    fn token_device_binding_mismatch_identifies_exact_claims() {
        let token = WorkerTokenBindingSummary {
            connection_id: Some("conn-1".into()),
            device_id: Some("wdev_old".into()),
            expires_at: None,
            jti: Some("jti-1".into()),
            machine_fingerprint_hash: Some("machine-old".into()),
            public_key_fingerprint: Some("public-old".into()),
            token_use: Some("worker_execution".into()),
            worker_id: Some("worker-1".into()),
        };
        let material = WorkerDeviceProofMaterial {
            device_id: "wdev_new".into(),
            machine_fingerprint: "machine_new".into(),
            public_key_pem: "public-new".into(),
            private_key_pem: "private".into(),
        };
        let local = summarize_local_device_proof(&material);

        assert_eq!(
            token_device_binding_mismatches(&token, &local),
            vec![
                "deviceId",
                "devicePublicKeyFingerprint",
                "machineFingerprintHash"
            ]
        );
    }

    #[test]
    fn worker_token_binding_decoder_reads_claims_without_logging_token() {
        let payload = serde_json::json!({
            "workerConnectionId": "conn-1",
            "deviceId": "wdev_1",
            "devicePublicKeyFingerprint": "public-fp",
            "machineFingerprintHash": "machine-fp",
            "jti": "jti-1",
            "exp": 123,
            "tokenUse": "worker_execution",
            "workerId": "worker-1"
        });
        let token = format!(
            "{}.{}.sig",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode("{}"),
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
        );

        let decoded = super::decode_worker_token_binding(&token).unwrap();

        assert_eq!(decoded.device_id.as_deref(), Some("wdev_1"));
        assert_eq!(decoded.public_key_fingerprint.as_deref(), Some("public-fp"));
        assert_eq!(
            decoded.machine_fingerprint_hash.as_deref(),
            Some("machine-fp")
        );
        assert_eq!(decoded.expires_at, Some(123));
    }
}

#[tauri::command]
pub async fn worker_app_run_manual_command(command: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(&["/C", &command])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| format!("failed to spawn cmd: {e}"))?
    };

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(&["-c", &command])
        .output()
        .map_err(|e| format!("failed to spawn shell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(format!("Success:\n{stdout}\n{stderr}"))
    } else {
        Err(format!("Exited {}:\n{stdout}\n{stderr}", output.status))
    }
}
