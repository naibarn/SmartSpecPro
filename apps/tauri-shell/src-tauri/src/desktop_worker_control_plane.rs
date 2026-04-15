use reqwest::blocking::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;

use crate::desktop_worker_folder_ingest::{
    prepare_local_folder_ingest_execution, LocalFolderIngestExecutionPlan,
    LocalFolderIngestJobSpec, LocalFolderIngestPlanRequest,
};
use crate::desktop_worker_runtime::{
    prepare_video_assembly_execution, VideoAssemblyExecutionPlan, VideoAssemblyJobSpec,
    VideoAssemblyPlanRequest, VideoAssemblyPrefetchedInput,
};

const WORKER_RUNTIME_PROTOCOL_VERSION: &str = "2026-04-06";
const WORKER_RUNTIME_FAMILY_SCHEMA_VERSION: &str = "2026-04-08";
const WORKER_RUNTIME_PROFILE_SCHEMA_VERSION: &str = "2026-04-08";
const DESKTOP_HOST_PROTOCOL_VERSION: &str = "2026-04-08";
const DESKTOP_WORKER_RUNTIME_TYPE: &str = "desktop_zeroclaw_managed";
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 30_000;
const VIDEO_ASSEMBLY_PROGRESS_STAGES: &[&str] = &[
    "resolve_inputs",
    "stage_workspace",
    "probe_media",
    "build_edit_plan",
    "render_outputs",
    "verify_outputs",
    "upload_artifacts",
    "publish_artifacts",
    "trigger_indexing",
];
const LOCAL_FOLDER_INGEST_PROGRESS_STAGES: &[&str] = &[
    "resolve_roots",
    "index_files",
    "extract_previews",
    "write_manifest",
    "upload_artifacts",
    "publish_artifacts",
    "trigger_indexing",
];
const COMFY_IMAGE_GENERATION_PROGRESS_STAGES: &[&str] = &[
    "validate_service",
    "submit_workflow",
    "poll_execution",
    "collect_outputs",
    "upload_artifacts",
    "publish_artifacts",
    "trigger_indexing",
];
const COMFY_WORKFLOW_RUN_PROGRESS_STAGES: &[&str] = &[
    "validate_service",
    "submit_workflow",
    "poll_execution",
    "collect_outputs",
    "upload_artifacts",
    "publish_artifacts",
    "trigger_indexing",
];
const VIDEO_ASSEMBLY_FAILURE_CODES: &[&str] = &[
    "transient_input_fetch_failed",
    "temporary_disk_pressure",
    "runtime_restart_required",
    "artifact_upload_failed",
    "index_enqueue_failed",
    "unauthorized_path",
    "unsupported_media",
    "insufficient_gpu",
    "insufficient_temp_disk",
    "adapter_contract_violation",
    "render_failed",
    "artifact_publish_failed",
];
const LOCAL_FOLDER_INGEST_FAILURE_CODES: &[&str] = &[
    "temporary_disk_pressure",
    "artifact_upload_failed",
    "index_enqueue_failed",
    "unauthorized_path",
    "unsupported_media",
    "adapter_contract_violation",
    "artifact_publish_failed",
];
const COMFY_IMAGE_GENERATION_FAILURE_CODES: &[&str] = &[
    "service_unreachable",
    "workflow_rejected",
    "execution_timeout",
    "artifact_upload_failed",
    "index_enqueue_failed",
    "adapter_contract_violation",
    "artifact_publish_failed",
    "unsupported_output",
];
const COMFY_WORKFLOW_RUN_FAILURE_CODES: &[&str] = &[
    "service_unreachable",
    "workflow_rejected",
    "execution_timeout",
    "artifact_upload_failed",
    "index_enqueue_failed",
    "adapter_contract_violation",
    "artifact_publish_failed",
    "unsupported_output",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerProtocolCompatibility {
    pub protocol_version: String,
    pub runtime_version: String,
    pub min_server_protocol_version: Option<String>,
    pub max_server_protocol_version: Option<String>,
    pub runtime_family_schema_version: String,
    pub runtime_profile_schema_version: String,
    pub min_runtime_family_schema_version: Option<String>,
    pub max_runtime_family_schema_version: Option<String>,
    pub min_runtime_profile_schema_version: Option<String>,
    pub max_runtime_profile_schema_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDevicePlatform {
    pub os: String,
    pub os_version: Option<String>,
    pub arch: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceRegistrationDescriptor {
    pub runtime_version: String,
    pub tenant_id: String,
    pub user_id: String,
    pub device_id: String,
    pub display_name: String,
    pub machine_name: Option<String>,
    pub platform: DesktopDevicePlatform,
    pub worker_projection_enabled: bool,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceRegistrationPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub tenant_id: String,
    pub user_id: String,
    pub device_id: String,
    pub display_name: String,
    pub machine_name: Option<String>,
    pub platform: DesktopDevicePlatform,
    pub worker_projection_enabled: bool,
    pub projected_worker_runtime_type: Option<String>,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceHeartbeatDescriptor {
    pub runtime_version: String,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
    pub policy_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceHeartbeatPayload {
    pub compatibility: WorkerProtocolCompatibility,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
    pub policy_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceRegisterRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub payload: DesktopDeviceRegistrationPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceHeartbeatRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub device_id: String,
    pub payload: DesktopDeviceHeartbeatPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeviceRouteResponse {
    pub created: Option<bool>,
    pub device: Value,
    pub worker_projection: Value,
    pub policy_snapshot: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProjectedWorkerBootstrapRequest {
    pub device_registration: DesktopDeviceRegisterRequest,
    pub worker_registration_payload: DesktopWorkerRegistrationPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProjectedWorkerBootstrapResponse {
    pub device_registration: DesktopDeviceRouteResponse,
    pub worker_registration: WorkerRegistrationResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerRegistrationDescriptor {
    pub runtime_version: String,
    pub worker_mode: String,
    pub display_name: String,
    pub external_reference: String,
    pub runtime_mode: String,
    pub team_id: Option<String>,
    pub machine_id: Option<String>,
    pub machine_name: Option<String>,
    pub dashboard_url: Option<String>,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub hardware_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
    #[serde(default)]
    pub runtime_metadata_json: Value,
    pub file_scope_mode: String,
    pub runtime_profile_name: Option<String>,
    pub policy_profile_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerRegistrationPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub runtime_type: String,
    pub worker_mode: String,
    pub display_name: String,
    pub external_reference: String,
    pub runtime_mode: String,
    pub team_id: Option<String>,
    pub machine_id: Option<String>,
    pub machine_name: Option<String>,
    pub dashboard_url: Option<String>,
    #[serde(default)]
    pub capabilities_json: Value,
    #[serde(default)]
    pub hardware_json: Value,
    #[serde(default)]
    pub health_summary_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
    #[serde(default)]
    pub runtime_metadata_json: Value,
    pub file_scope_mode: String,
    pub runtime_profile_name: Option<String>,
    pub policy_profile_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerHeartbeatDescriptor {
    pub runtime_version: String,
    pub status: String,
    pub current_job_count: u32,
    pub queue_depth: u32,
    pub free_disk_bytes: Option<u64>,
    #[serde(default)]
    pub metrics_json: Value,
    #[serde(default)]
    pub warnings_json: Vec<String>,
    #[serde(default)]
    pub runtime_metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerHeartbeatPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub runtime_type: String,
    pub status: String,
    pub current_job_count: u32,
    pub queue_depth: u32,
    pub free_disk_bytes: Option<u64>,
    #[serde(default)]
    pub metrics_json: Value,
    #[serde(default)]
    pub warnings_json: Vec<String>,
    #[serde(default)]
    pub runtime_metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAccessTokens {
    pub execution_token: String,
    pub upload_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRegistrationResponse {
    pub created: bool,
    pub tokens: WorkerAccessTokens,
    pub worker: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerHeartbeatResponse {
    pub status: String,
    pub worker_id: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerClaimRequest {
    pub max_jobs: u32,
    #[serde(default)]
    pub capability_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJob {
    pub id: String,
    pub tenant_id: Option<String>,
    pub team_id: Option<String>,
    pub worker_id: Option<String>,
    pub runtime_type: String,
    pub job_type: String,
    pub status: Option<String>,
    pub status_reason: Option<String>,
    pub priority: Option<i32>,
    pub resource_profile: Option<String>,
    #[serde(default)]
    pub input_json: Value,
    #[serde(default)]
    pub instructions_json: Value,
    #[serde(default)]
    pub output_json: Value,
    pub lease_owner_token: String,
    pub lease_expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerClaimResponse {
    pub job: Option<ClaimedWorkerJob>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobEventPayload {
    pub event_type: String,
    #[serde(default)]
    pub payload_json: Value,
    pub sequence_number: Option<u32>,
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobEventResponse {
    pub accepted: bool,
    pub replayed: bool,
    pub job: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactInitPayload {
    pub artifact_type: String,
    pub file_name: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub checksum_sha256: Option<String>,
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactInitResponse {
    pub key: String,
    pub method: String,
    pub storage_ref: String,
    pub upload_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactCompletePayload {
    pub artifact_type: String,
    pub storage_ref: String,
    pub checksum_sha256: String,
    pub size_bytes: u64,
    pub content_type: Option<String>,
    #[serde(default)]
    pub metadata_json: Value,
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactCompleteResponse {
    pub created: bool,
    pub artifact: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDiagnosticsPayload {
    #[serde(default)]
    pub summary_json: Value,
    #[serde(default)]
    pub details_json: Value,
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDiagnosticsResponse {
    pub accepted: bool,
    pub worker: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerApiRequest {
    pub control_plane_base_url: String,
    pub bearer_token: String,
    pub request_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerRegistrationRequest {
    pub control_plane_base_url: String,
    pub registration_token: String,
    pub request_timeout_ms: Option<u64>,
    pub payload: DesktopWorkerRegistrationPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerHeartbeatRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub worker_id: String,
    pub payload: DesktopWorkerHeartbeatPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerPolicyRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub worker_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerClaimJobRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub worker_id: String,
    pub payload: WorkerClaimRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerClaimAndPrepareRequest {
    #[serde(flatten)]
    pub claim: DesktopWorkerClaimJobRequest,
    pub workspace_dir: String,
    #[serde(default)]
    pub prefetched_inputs: Vec<VideoAssemblyPrefetchedInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerClaimAndPrepareResponse {
    pub claimed: bool,
    pub job: Option<ClaimedWorkerJob>,
    pub video_assembly_plan: Option<VideoAssemblyExecutionPlan>,
    pub local_folder_ingest_plan: Option<LocalFolderIngestExecutionPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerEventRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub job_id: String,
    pub payload: WorkerJobEventPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerDiagnosticsRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub worker_id: String,
    pub payload: WorkerDiagnosticsPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerArtifactInitRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub job_id: String,
    pub payload: WorkerArtifactInitPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerArtifactCompleteRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub job_id: String,
    pub payload: WorkerArtifactCompletePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerArtifactUploadFileRequest {
    #[serde(flatten)]
    pub api: DesktopWorkerApiRequest,
    pub job_id: String,
    pub artifact_type: String,
    pub file_path: String,
    pub file_name: Option<String>,
    pub content_type: String,
    #[serde(default)]
    pub metadata_json: Value,
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerArtifactUploadFileResponse {
    pub file_name: String,
    pub absolute_path: String,
    pub checksum_sha256: String,
    pub size_bytes: u64,
    pub init_upload: WorkerArtifactInitResponse,
    pub completed_artifact: WorkerArtifactCompleteResponse,
}

fn build_worker_protocol_compatibility(runtime_version: &str) -> Result<WorkerProtocolCompatibility, String> {
    let trimmed_runtime_version = runtime_version.trim();
    if trimmed_runtime_version.is_empty() {
        return Err("runtime_version is required".into());
    }
    Ok(WorkerProtocolCompatibility {
        protocol_version: WORKER_RUNTIME_PROTOCOL_VERSION.into(),
        runtime_version: trimmed_runtime_version.into(),
        min_server_protocol_version: None,
        max_server_protocol_version: None,
        runtime_family_schema_version: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION.into(),
        runtime_profile_schema_version: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION.into(),
        min_runtime_family_schema_version: None,
        max_runtime_family_schema_version: None,
        min_runtime_profile_schema_version: None,
        max_runtime_profile_schema_version: None,
    })
}

fn build_desktop_host_protocol_compatibility(
    runtime_version: &str,
) -> Result<WorkerProtocolCompatibility, String> {
    let trimmed_runtime_version = runtime_version.trim();
    if trimmed_runtime_version.is_empty() {
        return Err("runtime_version is required".into());
    }
    Ok(WorkerProtocolCompatibility {
        protocol_version: DESKTOP_HOST_PROTOCOL_VERSION.into(),
        runtime_version: trimmed_runtime_version.into(),
        min_server_protocol_version: Some(WORKER_RUNTIME_PROTOCOL_VERSION.into()),
        max_server_protocol_version: None,
        runtime_family_schema_version: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION.into(),
        runtime_profile_schema_version: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION.into(),
        min_runtime_family_schema_version: None,
        max_runtime_family_schema_version: None,
        min_runtime_profile_schema_version: None,
        max_runtime_profile_schema_version: None,
    })
}

pub fn build_desktop_device_registration_payload(
    descriptor: DesktopDeviceRegistrationDescriptor,
) -> Result<DesktopDeviceRegistrationPayload, String> {
    if descriptor.tenant_id.trim().is_empty() {
        return Err("tenant_id is required".into());
    }
    if descriptor.user_id.trim().is_empty() {
        return Err("user_id is required".into());
    }
    if descriptor.device_id.trim().is_empty() {
        return Err("device_id is required".into());
    }
    if descriptor.display_name.trim().is_empty() {
        return Err("display_name is required".into());
    }
    if descriptor.platform.os.trim().is_empty()
        || descriptor.platform.arch.trim().is_empty()
        || descriptor.platform.app_version.trim().is_empty()
    {
        return Err("platform.os, platform.arch, and platform.app_version are required".into());
    }

    Ok(DesktopDeviceRegistrationPayload {
        compatibility: build_desktop_host_protocol_compatibility(&descriptor.runtime_version)?,
        tenant_id: descriptor.tenant_id,
        user_id: descriptor.user_id,
        device_id: descriptor.device_id,
        display_name: descriptor.display_name,
        machine_name: descriptor.machine_name,
        platform: descriptor.platform,
        worker_projection_enabled: descriptor.worker_projection_enabled,
        projected_worker_runtime_type: if descriptor.worker_projection_enabled {
            Some(DESKTOP_WORKER_RUNTIME_TYPE.into())
        } else {
            None
        },
        capabilities_json: descriptor.capabilities_json,
        health_summary_json: descriptor.health_summary_json,
        warning_flags_json: descriptor.warning_flags_json,
    })
}

pub fn build_desktop_device_heartbeat_payload(
    descriptor: DesktopDeviceHeartbeatDescriptor,
) -> Result<DesktopDeviceHeartbeatPayload, String> {
    Ok(DesktopDeviceHeartbeatPayload {
        compatibility: build_desktop_host_protocol_compatibility(&descriptor.runtime_version)?,
        capabilities_json: descriptor.capabilities_json,
        health_summary_json: descriptor.health_summary_json,
        warning_flags_json: descriptor.warning_flags_json,
        policy_cursor: descriptor.policy_cursor,
    })
}

pub fn build_desktop_worker_registration_payload(
    descriptor: DesktopWorkerRegistrationDescriptor,
) -> Result<DesktopWorkerRegistrationPayload, String> {
    if descriptor.display_name.trim().is_empty() {
        return Err("display_name is required".into());
    }
    if descriptor.external_reference.trim().is_empty() {
        return Err("external_reference is required".into());
    }
    if descriptor.worker_mode.trim().is_empty() {
        return Err("worker_mode is required".into());
    }
    if descriptor.runtime_mode.trim().is_empty() {
        return Err("runtime_mode is required".into());
    }
    if descriptor.file_scope_mode.trim().is_empty() {
        return Err("file_scope_mode is required".into());
    }

    Ok(DesktopWorkerRegistrationPayload {
        compatibility: build_worker_protocol_compatibility(&descriptor.runtime_version)?,
        runtime_type: DESKTOP_WORKER_RUNTIME_TYPE.into(),
        worker_mode: descriptor.worker_mode,
        display_name: descriptor.display_name,
        external_reference: descriptor.external_reference,
        runtime_mode: descriptor.runtime_mode,
        team_id: descriptor.team_id,
        machine_id: descriptor.machine_id,
        machine_name: descriptor.machine_name,
        dashboard_url: descriptor.dashboard_url,
        capabilities_json: descriptor.capabilities_json,
        hardware_json: descriptor.hardware_json,
        health_summary_json: descriptor.health_summary_json,
        warning_flags_json: descriptor.warning_flags_json,
        runtime_metadata_json: descriptor.runtime_metadata_json,
        file_scope_mode: descriptor.file_scope_mode,
        runtime_profile_name: descriptor.runtime_profile_name,
        policy_profile_name: descriptor.policy_profile_name,
    })
}

pub fn build_desktop_worker_heartbeat_payload(
    descriptor: DesktopWorkerHeartbeatDescriptor,
) -> Result<DesktopWorkerHeartbeatPayload, String> {
    if descriptor.status.trim().is_empty() {
        return Err("status is required".into());
    }

    Ok(DesktopWorkerHeartbeatPayload {
        compatibility: build_worker_protocol_compatibility(&descriptor.runtime_version)?,
        runtime_type: DESKTOP_WORKER_RUNTIME_TYPE.into(),
        status: descriptor.status,
        current_job_count: descriptor.current_job_count,
        queue_depth: descriptor.queue_depth,
        free_disk_bytes: descriptor.free_disk_bytes,
        metrics_json: descriptor.metrics_json,
        warnings_json: descriptor.warnings_json,
        runtime_metadata_json: descriptor.runtime_metadata_json,
    })
}

pub fn build_worker_job_progress_event(
    lease_owner_token: &str,
    sequence_number: u32,
    stage: &str,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_progress_event(
        lease_owner_token,
        sequence_number,
        stage,
        progress_percent,
        extra_payload,
        VIDEO_ASSEMBLY_PROGRESS_STAGES,
        "video_assembly",
    )
}

pub fn build_local_folder_ingest_progress_event(
    lease_owner_token: &str,
    sequence_number: u32,
    stage: &str,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_progress_event(
        lease_owner_token,
        sequence_number,
        stage,
        progress_percent,
        extra_payload,
        LOCAL_FOLDER_INGEST_PROGRESS_STAGES,
        "local_folder_ingest",
    )
}

pub fn build_comfy_image_generation_progress_event(
    lease_owner_token: &str,
    sequence_number: u32,
    stage: &str,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_progress_event(
        lease_owner_token,
        sequence_number,
        stage,
        progress_percent,
        extra_payload,
        COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
        "comfy_image_generation",
    )
}

pub fn build_comfy_workflow_run_progress_event(
    lease_owner_token: &str,
    sequence_number: u32,
    stage: &str,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_progress_event(
        lease_owner_token,
        sequence_number,
        stage,
        progress_percent,
        extra_payload,
        COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
        "comfy_workflow_run",
    )
}

fn build_typed_worker_job_progress_event(
    lease_owner_token: &str,
    sequence_number: u32,
    stage: &str,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
    allowed_stages: &[&str],
    job_type: &str,
) -> Result<WorkerJobEventPayload, String> {
    if lease_owner_token.trim().is_empty() {
        return Err("lease_owner_token is required".into());
    }
    if sequence_number == 0 {
        return Err("sequence_number must be positive".into());
    }
    if !allowed_stages.contains(&stage.trim()) {
        return Err(format!("unsupported {job_type} progress stage: {stage}"));
    }

    let mut payload_json = json!({ "stage": stage.trim() });
    if let Some(percent) = progress_percent {
        payload_json["progressPercent"] = json!(percent);
    }
    merge_json_object(&mut payload_json, extra_payload)?;

    Ok(WorkerJobEventPayload {
        event_type: "job.progress".into(),
        payload_json,
        sequence_number: Some(sequence_number),
        lease_owner_token: lease_owner_token.trim().into(),
    })
}

pub fn build_worker_job_failure_event(
    lease_owner_token: &str,
    sequence_number: u32,
    failure_code: &str,
    error_message: &str,
    retryable: bool,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_failure_event(
        lease_owner_token,
        sequence_number,
        failure_code,
        error_message,
        retryable,
        extra_payload,
        VIDEO_ASSEMBLY_FAILURE_CODES,
        "video_assembly",
    )
}

pub fn build_local_folder_ingest_failure_event(
    lease_owner_token: &str,
    sequence_number: u32,
    failure_code: &str,
    error_message: &str,
    retryable: bool,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_failure_event(
        lease_owner_token,
        sequence_number,
        failure_code,
        error_message,
        retryable,
        extra_payload,
        LOCAL_FOLDER_INGEST_FAILURE_CODES,
        "local_folder_ingest",
    )
}

pub fn build_comfy_image_generation_failure_event(
    lease_owner_token: &str,
    sequence_number: u32,
    failure_code: &str,
    error_message: &str,
    retryable: bool,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_failure_event(
        lease_owner_token,
        sequence_number,
        failure_code,
        error_message,
        retryable,
        extra_payload,
        COMFY_IMAGE_GENERATION_FAILURE_CODES,
        "comfy_image_generation",
    )
}

pub fn build_comfy_workflow_run_failure_event(
    lease_owner_token: &str,
    sequence_number: u32,
    failure_code: &str,
    error_message: &str,
    retryable: bool,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_typed_worker_job_failure_event(
        lease_owner_token,
        sequence_number,
        failure_code,
        error_message,
        retryable,
        extra_payload,
        COMFY_WORKFLOW_RUN_FAILURE_CODES,
        "comfy_workflow_run",
    )
}

fn build_typed_worker_job_failure_event(
    lease_owner_token: &str,
    sequence_number: u32,
    failure_code: &str,
    error_message: &str,
    retryable: bool,
    extra_payload: Option<Value>,
    allowed_failure_codes: &[&str],
    job_type: &str,
) -> Result<WorkerJobEventPayload, String> {
    if lease_owner_token.trim().is_empty() {
        return Err("lease_owner_token is required".into());
    }
    if sequence_number == 0 {
        return Err("sequence_number must be positive".into());
    }
    if error_message.trim().is_empty() {
        return Err("error_message is required".into());
    }
    if !allowed_failure_codes.contains(&failure_code.trim()) {
        return Err(format!("unsupported {job_type} failure code: {failure_code}"));
    }

    let mut payload_json = json!({
        "failureCode": failure_code.trim(),
        "error": error_message.trim(),
        "retryable": retryable,
    });
    merge_json_object(&mut payload_json, extra_payload)?;

    Ok(WorkerJobEventPayload {
        event_type: "job.failed".into(),
        payload_json,
        sequence_number: Some(sequence_number),
        lease_owner_token: lease_owner_token.trim().into(),
    })
}

pub fn prepare_claimed_video_assembly_job(
    job: ClaimedWorkerJob,
    workspace_dir: &str,
    prefetched_inputs: Vec<VideoAssemblyPrefetchedInput>,
) -> Result<DesktopWorkerClaimAndPrepareResponse, String> {
    if job.job_type != "video_assembly" {
        return Err(format!(
            "desktop worker currently supports only video_assembly claimed jobs, received {}",
            job.job_type
        ));
    }
    if job.runtime_type != DESKTOP_WORKER_RUNTIME_TYPE {
        return Err(format!(
            "claimed job runtime {} does not match desktop worker runtime {}",
            job.runtime_type, DESKTOP_WORKER_RUNTIME_TYPE
        ));
    }

    let job_spec: VideoAssemblyJobSpec = serde_json::from_value(job.input_json.clone())
        .map_err(|error| format!("failed to parse claimed video_assembly job payload: {error}"))?;
    let plan = prepare_video_assembly_execution(VideoAssemblyPlanRequest {
        job_id: job.id.clone(),
        workspace_dir: workspace_dir.into(),
        job: job_spec,
        prefetched_inputs,
    })?;

    Ok(DesktopWorkerClaimAndPrepareResponse {
        claimed: true,
        job: Some(job),
        video_assembly_plan: Some(plan),
        local_folder_ingest_plan: None,
    })
}

pub fn prepare_claimed_local_folder_ingest_job(
    job: ClaimedWorkerJob,
    workspace_dir: &str,
) -> Result<DesktopWorkerClaimAndPrepareResponse, String> {
    if job.job_type != "local_folder_ingest" {
        return Err(format!(
            "desktop worker currently supports only local_folder_ingest claimed jobs here, received {}",
            job.job_type
        ));
    }
    if job.runtime_type != DESKTOP_WORKER_RUNTIME_TYPE {
        return Err(format!(
            "claimed job runtime {} does not match desktop worker runtime {}",
            job.runtime_type, DESKTOP_WORKER_RUNTIME_TYPE
        ));
    }

    let job_spec: LocalFolderIngestJobSpec = serde_json::from_value(job.input_json.clone())
        .map_err(|error| format!("failed to parse claimed local_folder_ingest job payload: {error}"))?;
    let plan = prepare_local_folder_ingest_execution(LocalFolderIngestPlanRequest {
        job_id: job.id.clone(),
        workspace_dir: workspace_dir.into(),
        job: job_spec,
    })?;

    Ok(DesktopWorkerClaimAndPrepareResponse {
        claimed: true,
        job: Some(job),
        video_assembly_plan: None,
        local_folder_ingest_plan: Some(plan),
    })
}

fn sanitize_timeout_ms(value: Option<u64>) -> u64 {
    value.unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS).clamp(5_000, 300_000)
}

fn is_loopback_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }

    host.parse::<IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

fn validate_http_url(raw: &str, allow_http_loopback_only: bool) -> Result<reqwest::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("desktop_worker_missing_base_url".into());
    }

    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| "desktop_worker_invalid_base_url".to_string())?;
    match parsed.scheme() {
        "https" => {}
        "http" if allow_http_loopback_only => {
            let Some(host) = parsed.host_str() else {
                return Err("desktop_worker_invalid_base_url".into());
            };
            if !is_loopback_host(host) {
                return Err("desktop_worker_insecure_http_base_url".into());
            }
        }
        _ => return Err("desktop_worker_invalid_base_url".into()),
    }

    if parsed.username() != "" || parsed.password().is_some() {
        return Err("desktop_worker_invalid_base_url".into());
    }

    Ok(parsed)
}

fn build_client(timeout_ms: Option<u64>) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_millis(sanitize_timeout_ms(timeout_ms)))
        .build()
        .map_err(|error| format!("failed to build desktop worker HTTP client: {error}"))
}

fn read_json_response<T: DeserializeOwned>(response: reqwest::blocking::Response) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("failed to read control plane response: {error}"))?;

    if !status.is_success() {
        if let Ok(payload) = serde_json::from_str::<Value>(&body) {
            let code = payload
                .get("code")
                .or_else(|| payload.get("error"))
                .and_then(Value::as_str)
                .unwrap_or("desktop_worker_control_plane_http_error");
            let message = payload
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or_else(|| body.trim());
            return Err(format!("{code}: {message}"));
        }
        return Err(format!("desktop worker control plane returned HTTP {status}: {}", body.trim()));
    }

    serde_json::from_str::<T>(&body)
        .map_err(|error| format!("failed to parse control plane JSON response: {error}"))
}

fn post_json<T: DeserializeOwned, P: Serialize>(
    client: &Client,
    url: reqwest::Url,
    bearer_token: &str,
    payload: &P,
) -> Result<T, String> {
    if bearer_token.trim().is_empty() {
        return Err("bearer token is required".into());
    }

    let body = serde_json::to_vec(payload)
        .map_err(|error| format!("failed to serialize desktop worker request: {error}"))?;

    let response = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "SmartAIHub-Tauri/0.1")
        .bearer_auth(bearer_token.trim())
        .body(body)
        .send()
        .map_err(|error| format!("desktop worker request failed: {error}"))?;

    read_json_response(response)
}

fn get_json<T: DeserializeOwned>(
    client: &Client,
    url: reqwest::Url,
    bearer_token: &str,
) -> Result<T, String> {
    if bearer_token.trim().is_empty() {
        return Err("bearer token is required".into());
    }

    let response = client
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "SmartAIHub-Tauri/0.1")
        .bearer_auth(bearer_token.trim())
        .send()
        .map_err(|error| format!("desktop worker request failed: {error}"))?;

    read_json_response(response)
}

fn join_url(base_url: &str, path: &str) -> Result<reqwest::Url, String> {
    let base = validate_http_url(base_url, true)?;
    base.join(path)
        .map_err(|_| "desktop_worker_invalid_base_url".to_string())
}

fn merge_json_object(target: &mut Value, extra_payload: Option<Value>) -> Result<(), String> {
    let Some(extra) = extra_payload else {
        return Ok(());
    };
    let Some(target_object) = target.as_object_mut() else {
        return Err("target JSON payload must be an object".into());
    };
    let Some(extra_object) = extra.as_object() else {
        return Err("extra payload must be a JSON object".into());
    };
    for (key, value) in extra_object {
        target_object.insert(key.clone(), value.clone());
    }
    Ok(())
}

fn require_absolute_file(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err("artifact file path must be absolute".into());
    }
    if !path.is_file() {
        return Err(format!("artifact file does not exist: {raw_path}"));
    }
    path.canonicalize().map_err(|error| error.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn upload_presigned_artifact(
    client: &Client,
    upload_url: &str,
    content_type: &str,
    file_bytes: Vec<u8>,
) -> Result<(), String> {
    let validated_upload_url = validate_http_url(upload_url, true)?;
    let response = client
        .put(validated_upload_url)
        .header("Content-Type", content_type)
        .header("User-Agent", "SmartAIHub-Tauri/0.1")
        .body(file_bytes)
        .send()
        .map_err(|error| format!("artifact upload request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("artifact upload failed with HTTP {}", response.status()));
    }

    Ok(())
}

pub fn register_worker_with_control_plane(
    request: DesktopWorkerRegistrationRequest,
) -> Result<WorkerRegistrationResponse, String> {
    let client = build_client(request.request_timeout_ms)?;
    let url = join_url(&request.control_plane_base_url, "/api/workers/register")?;
    post_json(&client, url, &request.registration_token, &request.payload)
}

pub fn bootstrap_projected_worker_with_control_plane(
    request: DesktopProjectedWorkerBootstrapRequest,
) -> Result<DesktopProjectedWorkerBootstrapResponse, String> {
    let fallback_base_url = request.device_registration.api.control_plane_base_url.clone();
    let request_timeout_ms = request.device_registration.api.request_timeout_ms;
    let device_registration = register_desktop_device_with_control_plane(request.device_registration)?;
    let registration_token = device_registration
        .worker_projection
        .get("registrationToken")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "desktop worker projection registration token is missing".to_string())?;

    let worker_registration = register_worker_with_control_plane(DesktopWorkerRegistrationRequest {
        control_plane_base_url: device_registration
            .policy_snapshot
            .get("controlPlaneBaseUrl")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or(fallback_base_url),
        registration_token: registration_token.to_string(),
        request_timeout_ms,
        payload: request.worker_registration_payload,
    })?;

    Ok(DesktopProjectedWorkerBootstrapResponse {
        device_registration,
        worker_registration,
    })
}

pub fn register_desktop_device_with_control_plane(
    request: DesktopDeviceRegisterRequest,
) -> Result<DesktopDeviceRouteResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(&request.api.control_plane_base_url, "/api/desktop-host/devices/register")?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn send_desktop_device_heartbeat(
    request: DesktopDeviceHeartbeatRequest,
) -> Result<DesktopDeviceRouteResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/desktop-host/devices/{}/heartbeat", request.device_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn send_worker_heartbeat(
    request: DesktopWorkerHeartbeatRequest,
) -> Result<WorkerHeartbeatResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/workers/{}/heartbeat", request.worker_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn get_worker_policy_snapshot(
    request: DesktopWorkerPolicyRequest,
) -> Result<Value, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/workers/{}/policy", request.worker_id),
    )?;
    get_json(&client, url, &request.api.bearer_token)
}

pub fn claim_worker_job(
    request: DesktopWorkerClaimJobRequest,
) -> Result<WorkerClaimResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/workers/{}/jobs/claim", request.worker_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn claim_and_prepare_worker_job(
    request: DesktopWorkerClaimAndPrepareRequest,
) -> Result<DesktopWorkerClaimAndPrepareResponse, String> {
    let claimed = claim_worker_job(request.claim)?;
    let Some(job) = claimed.job else {
        return Ok(DesktopWorkerClaimAndPrepareResponse {
            claimed: false,
            job: None,
            video_assembly_plan: None,
            local_folder_ingest_plan: None,
        });
    };

    match job.job_type.as_str() {
        "video_assembly" => prepare_claimed_video_assembly_job(
            job,
            &request.workspace_dir,
            request.prefetched_inputs,
        ),
        "local_folder_ingest" => prepare_claimed_local_folder_ingest_job(job, &request.workspace_dir),
        "comfy_image_generation" | "comfy_workflow_run" => Ok(DesktopWorkerClaimAndPrepareResponse {
            claimed: true,
            job: Some(job),
            video_assembly_plan: None,
            local_folder_ingest_plan: None,
        }),
        other => Err(format!(
            "desktop worker currently supports only video_assembly, local_folder_ingest, comfy_image_generation, and comfy_workflow_run claimed jobs, received {}",
            other
        )),
    }
}

pub fn report_worker_job_event(
    request: DesktopWorkerEventRequest,
) -> Result<WorkerJobEventResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/worker-jobs/{}/events", request.job_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn push_worker_diagnostics(
    request: DesktopWorkerDiagnosticsRequest,
) -> Result<WorkerDiagnosticsResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/workers/{}/diagnostics", request.worker_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn init_worker_artifact_upload(
    request: DesktopWorkerArtifactInitRequest,
) -> Result<WorkerArtifactInitResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/worker-jobs/{}/artifacts/init-upload", request.job_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn complete_worker_artifact(
    request: DesktopWorkerArtifactCompleteRequest,
) -> Result<WorkerArtifactCompleteResponse, String> {
    let client = build_client(request.api.request_timeout_ms)?;
    let url = join_url(
        &request.api.control_plane_base_url,
        &format!("/api/worker-jobs/{}/artifacts/complete", request.job_id),
    )?;
    post_json(&client, url, &request.api.bearer_token, &request.payload)
}

pub fn upload_worker_artifact_file(
    request: DesktopWorkerArtifactUploadFileRequest,
) -> Result<DesktopWorkerArtifactUploadFileResponse, String> {
    if request.artifact_type.trim().is_empty() {
        return Err("artifact_type is required".into());
    }
    if request.content_type.trim().is_empty() {
        return Err("content_type is required".into());
    }
    if request.lease_owner_token.trim().is_empty() {
        return Err("lease_owner_token is required".into());
    }

    let absolute_path = require_absolute_file(&request.file_path)?;
    let file_name = request
        .file_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            absolute_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("artifact.bin")
                .to_string()
        });
    let file_bytes = fs::read(&absolute_path).map_err(|error| error.to_string())?;
    let checksum_sha256 = sha256_hex(&file_bytes);
    let size_bytes = file_bytes.len() as u64;

    let init_upload = init_worker_artifact_upload(DesktopWorkerArtifactInitRequest {
        api: request.api.clone(),
        job_id: request.job_id.clone(),
        payload: WorkerArtifactInitPayload {
            artifact_type: request.artifact_type.clone(),
            file_name: file_name.clone(),
            content_type: request.content_type.clone(),
            size_bytes,
            checksum_sha256: Some(checksum_sha256.clone()),
            lease_owner_token: request.lease_owner_token.clone(),
        },
    })?;

    if init_upload.method != "presigned" {
        return Err(format!(
            "unsupported artifact upload method from control plane: {}",
            init_upload.method
        ));
    }
    let upload_url = init_upload
        .upload_url
        .clone()
        .ok_or_else(|| "presigned artifact upload is missing uploadUrl".to_string())?;
    let upload_client = build_client(request.api.request_timeout_ms)?;
    upload_presigned_artifact(&upload_client, &upload_url, &request.content_type, file_bytes)?;

    let mut metadata_json = if request.metadata_json.is_object() {
        request.metadata_json.clone()
    } else {
        json!({})
    };
    merge_json_object(&mut metadata_json, Some(json!({ "fileName": file_name.clone() })))?;
    let completed_artifact = complete_worker_artifact(DesktopWorkerArtifactCompleteRequest {
        api: request.api,
        job_id: request.job_id,
        payload: WorkerArtifactCompletePayload {
            artifact_type: request.artifact_type,
            storage_ref: init_upload.storage_ref.clone(),
            checksum_sha256: checksum_sha256.clone(),
            size_bytes,
            content_type: Some(request.content_type),
            metadata_json,
            lease_owner_token: request.lease_owner_token,
        },
    })?;

    Ok(DesktopWorkerArtifactUploadFileResponse {
        file_name,
        absolute_path: absolute_path.to_string_lossy().to_string(),
        checksum_sha256,
        size_bytes,
        init_upload,
        completed_artifact,
    })
}

#[tauri::command]
pub async fn desktop_host_build_desktop_worker_registration_payload(
    descriptor: DesktopWorkerRegistrationDescriptor,
) -> Result<DesktopWorkerRegistrationPayload, String> {
    build_desktop_worker_registration_payload(descriptor)
}

#[tauri::command]
pub async fn desktop_host_build_desktop_device_registration_payload(
    descriptor: DesktopDeviceRegistrationDescriptor,
) -> Result<DesktopDeviceRegistrationPayload, String> {
    build_desktop_device_registration_payload(descriptor)
}

#[tauri::command]
pub async fn desktop_host_build_desktop_device_heartbeat_payload(
    descriptor: DesktopDeviceHeartbeatDescriptor,
) -> Result<DesktopDeviceHeartbeatPayload, String> {
    build_desktop_device_heartbeat_payload(descriptor)
}

#[tauri::command]
pub async fn desktop_host_build_desktop_worker_heartbeat_payload(
    descriptor: DesktopWorkerHeartbeatDescriptor,
) -> Result<DesktopWorkerHeartbeatPayload, String> {
    build_desktop_worker_heartbeat_payload(descriptor)
}

#[tauri::command]
pub async fn desktop_host_build_worker_job_progress_event(
    lease_owner_token: String,
    sequence_number: u32,
    stage: String,
    progress_percent: Option<f32>,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_worker_job_progress_event(
        &lease_owner_token,
        sequence_number,
        &stage,
        progress_percent,
        extra_payload,
    )
}

#[tauri::command]
pub async fn desktop_host_build_worker_job_failure_event(
    lease_owner_token: String,
    sequence_number: u32,
    failure_code: String,
    error_message: String,
    retryable: bool,
    extra_payload: Option<Value>,
) -> Result<WorkerJobEventPayload, String> {
    build_worker_job_failure_event(
        &lease_owner_token,
        sequence_number,
        &failure_code,
        &error_message,
        retryable,
        extra_payload,
    )
}

#[tauri::command]
pub async fn desktop_host_register_worker_with_control_plane(
    request: DesktopWorkerRegistrationRequest,
) -> Result<WorkerRegistrationResponse, String> {
    register_worker_with_control_plane(request)
}

#[tauri::command]
pub async fn desktop_host_register_device_with_control_plane(
    request: DesktopDeviceRegisterRequest,
) -> Result<DesktopDeviceRouteResponse, String> {
    register_desktop_device_with_control_plane(request)
}

#[tauri::command]
pub async fn desktop_host_bootstrap_projected_worker_with_control_plane(
    request: DesktopProjectedWorkerBootstrapRequest,
) -> Result<DesktopProjectedWorkerBootstrapResponse, String> {
    bootstrap_projected_worker_with_control_plane(request)
}

#[tauri::command]
pub async fn desktop_host_send_device_heartbeat(
    request: DesktopDeviceHeartbeatRequest,
) -> Result<DesktopDeviceRouteResponse, String> {
    send_desktop_device_heartbeat(request)
}

#[tauri::command]
pub async fn desktop_host_send_worker_heartbeat(
    request: DesktopWorkerHeartbeatRequest,
) -> Result<WorkerHeartbeatResponse, String> {
    send_worker_heartbeat(request)
}

#[tauri::command]
pub async fn desktop_host_get_worker_policy_snapshot(
    request: DesktopWorkerPolicyRequest,
) -> Result<Value, String> {
    get_worker_policy_snapshot(request)
}

#[tauri::command]
pub async fn desktop_host_claim_worker_job(
    request: DesktopWorkerClaimJobRequest,
) -> Result<WorkerClaimResponse, String> {
    claim_worker_job(request)
}

#[tauri::command]
pub async fn desktop_host_claim_and_prepare_worker_job(
    request: DesktopWorkerClaimAndPrepareRequest,
) -> Result<DesktopWorkerClaimAndPrepareResponse, String> {
    claim_and_prepare_worker_job(request)
}

#[tauri::command]
pub async fn desktop_host_report_worker_job_event(
    request: DesktopWorkerEventRequest,
) -> Result<WorkerJobEventResponse, String> {
    report_worker_job_event(request)
}

#[tauri::command]
pub async fn desktop_host_push_worker_diagnostics(
    request: DesktopWorkerDiagnosticsRequest,
) -> Result<WorkerDiagnosticsResponse, String> {
    push_worker_diagnostics(request)
}

#[tauri::command]
pub async fn desktop_host_init_worker_artifact_upload(
    request: DesktopWorkerArtifactInitRequest,
) -> Result<WorkerArtifactInitResponse, String> {
    init_worker_artifact_upload(request)
}

#[tauri::command]
pub async fn desktop_host_complete_worker_artifact(
    request: DesktopWorkerArtifactCompleteRequest,
) -> Result<WorkerArtifactCompleteResponse, String> {
    complete_worker_artifact(request)
}

#[tauri::command]
pub async fn desktop_host_upload_worker_artifact_file(
    request: DesktopWorkerArtifactUploadFileRequest,
) -> Result<DesktopWorkerArtifactUploadFileResponse, String> {
    upload_worker_artifact_file(request)
}
