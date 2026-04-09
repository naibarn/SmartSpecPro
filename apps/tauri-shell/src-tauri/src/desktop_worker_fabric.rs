use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::desktop_worker_runtime::{
    prepare_video_assembly_execution, VideoAssemblyExecutionPlan, VideoAssemblyPlanRequest,
};

pub const WORKER_RUNTIME_PROTOCOL_VERSION: &str = "2026-04-06";
pub const WORKER_RUNTIME_FAMILY_SCHEMA_VERSION: &str = "2026-04-08";
pub const WORKER_RUNTIME_PROFILE_SCHEMA_VERSION: &str = "2026-04-08";

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerRuntimeType {
    OpenClawGateway,
    DesktopZeroClawManaged,
    NemoClawSandbox,
    HiClawCluster,
}

impl WorkerRuntimeType {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OpenClawGateway => "openclaw_gateway",
            Self::DesktopZeroClawManaged => "desktop_zeroclaw_managed",
            Self::NemoClawSandbox => "nemoclaw_sandbox",
            Self::HiClawCluster => "hiclaw_cluster",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerMode {
    PerUser,
    SharedDepartment,
    DedicatedGpu,
    ExternalRuntime,
}

impl WorkerMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::PerUser => "per_user",
            Self::SharedDepartment => "shared_department",
            Self::DedicatedGpu => "dedicated_gpu",
            Self::ExternalRuntime => "external_runtime",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerRuntimeMode {
    NativeConstrained,
    Wsl2Managed,
    DockerIsolated,
    ExternalManaged,
}

impl WorkerRuntimeMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::NativeConstrained => "native_constrained",
            Self::Wsl2Managed => "wsl2_managed",
            Self::DockerIsolated => "docker_isolated",
            Self::ExternalManaged => "external_managed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerFileScopeMode {
    WorkspaceScoped,
    TeamDrive,
    FullMachine,
}

impl WorkerFileScopeMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WorkspaceScoped => "workspace_scoped",
            Self::TeamDrive => "team_drive",
            Self::FullMachine => "full_machine",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerStatus {
    Online,
    Offline,
    Unhealthy,
    Disabled,
    Draining,
}

impl WorkerStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Online => "online",
            Self::Offline => "offline",
            Self::Unhealthy => "unhealthy",
            Self::Disabled => "disabled",
            Self::Draining => "draining",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopServiceMode {
    Foreground,
    BackgroundTray,
    AutoStart,
    ManagedStartup,
    Maintenance,
}

impl DesktopServiceMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Foreground => "foreground",
            Self::BackgroundTray => "background_tray",
            Self::AutoStart => "auto_start",
            Self::ManagedStartup => "managed_startup",
            Self::Maintenance => "maintenance",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionIdentityMode {
    UserBound,
    ServiceIdentity,
}

impl ExecutionIdentityMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::UserBound => "user_bound",
            Self::ServiceIdentity => "service_identity",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    OwnerApproved,
    TeamApproved,
    AdminApproved,
    PreapprovedTypedJobs,
    PerJobApproval,
    AdminOnly,
}

impl ApprovalMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OwnerApproved => "owner_approved",
            Self::TeamApproved => "team_approved",
            Self::AdminApproved => "admin_approved",
            Self::PreapprovedTypedJobs => "preapproved_typed_jobs",
            Self::PerJobApproval => "per_job_approval",
            Self::AdminOnly => "admin_only",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BudgetAttributionMode {
    OwnerBudget,
    TeamBudget,
    CostCenterBudget,
    RequestingActorBudget,
    ServiceCostCenterBudget,
}

impl BudgetAttributionMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OwnerBudget => "owner_budget",
            Self::TeamBudget => "team_budget",
            Self::CostCenterBudget => "cost_center_budget",
            Self::RequestingActorBudget => "requesting_actor_budget",
            Self::ServiceCostCenterBudget => "service_cost_center_budget",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TokenRotationTrigger {
    ManualReissue,
    PeriodicRotation,
    PolicyChange,
    Revocation,
    WorkerReassignment,
    Offboarding,
    OwnershipTransfer,
    DrainEvent,
}

impl TokenRotationTrigger {
    fn as_str(&self) -> &'static str {
        match self {
            Self::ManualReissue => "manual_reissue",
            Self::PeriodicRotation => "periodic_rotation",
            Self::PolicyChange => "policy_change",
            Self::Revocation => "revocation",
            Self::WorkerReassignment => "worker_reassignment",
            Self::Offboarding => "offboarding",
            Self::OwnershipTransfer => "ownership_transfer",
            Self::DrainEvent => "drain_event",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerProtocolCompatibility {
    pub protocol_version: String,
    pub runtime_version: String,
    pub runtime_family_schema_version: String,
    pub runtime_profile_schema_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRootSummary {
    pub root: String,
    pub access_mode: WorkerFileScopeMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopExecutionIdentity {
    pub mode: ExecutionIdentityMode,
    pub approval_mode: ApprovalMode,
    pub budget_attribution_mode: BudgetAttributionMode,
    pub token_rotation_triggers: Vec<TokenRotationTrigger>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeMetadata {
    pub desktop_version: String,
    pub runtime_profile: WorkerRuntimeMode,
    pub workspace_roots_summary: Vec<WorkspaceRootSummary>,
    pub gpu_snapshot: Value,
    pub toolchain_summary: Value,
    pub doctor_summary: Value,
    pub service_mode: DesktopServiceMode,
    pub execution_identity: DesktopExecutionIdentity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerRegistrationPlanRequest {
    pub runtime_version: String,
    pub desktop_version: String,
    pub worker_mode: WorkerMode,
    pub runtime_mode: WorkerRuntimeMode,
    pub file_scope_mode: WorkerFileScopeMode,
    pub display_name: String,
    pub device_id: String,
    pub machine_id: Option<String>,
    pub machine_name: Option<String>,
    pub team_id: Option<String>,
    pub runtime_profile_name: Option<String>,
    pub policy_profile_name: Option<String>,
    pub workspace_roots_summary: Vec<WorkspaceRootSummary>,
    pub gpu_snapshot: Value,
    pub toolchain_summary: Value,
    pub doctor_summary: Value,
    pub service_mode: DesktopServiceMode,
    pub execution_identity: DesktopExecutionIdentity,
    pub capabilities_json: Value,
    pub hardware_json: Value,
    pub health_summary_json: Value,
    pub warning_flags_json: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRegistrationPayload {
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
    pub capabilities_json: Value,
    pub hardware_json: Value,
    pub health_summary_json: Value,
    pub warning_flags_json: Vec<String>,
    pub runtime_metadata_json: Value,
    pub file_scope_mode: String,
    pub runtime_profile_name: Option<String>,
    pub policy_profile_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerHeartbeatPlanRequest {
    pub runtime_version: String,
    pub status: WorkerStatus,
    pub current_job_count: u32,
    pub queue_depth: u32,
    pub free_disk_bytes: Option<u64>,
    pub metrics_json: Value,
    pub warnings_json: Vec<String>,
    pub runtime_metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerHeartbeatPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub runtime_type: String,
    pub status: String,
    pub current_job_count: u32,
    pub queue_depth: u32,
    pub free_disk_bytes: Option<u64>,
    pub metrics_json: Value,
    pub warnings_json: Vec<String>,
    pub runtime_metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerClaimRequestPayload {
    pub max_jobs: u32,
    pub capability_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJob {
    pub id: String,
    pub runtime_type: String,
    pub job_type: String,
    pub input_json: Value,
    pub instructions_json: Option<Value>,
    pub lease_owner_token: String,
    pub lease_expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJobExecutionRequest {
    pub workspace_dir: String,
    pub job: ClaimedWorkerJob,
    #[serde(default)]
    pub prefetched_inputs: Vec<crate::desktop_worker_runtime::VideoAssemblyPrefetchedInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJobExecutionPlan {
    pub job_id: String,
    pub runtime_type: String,
    pub job_type: String,
    pub lease_owner_token: String,
    pub lease_expires_at: String,
    pub required_progress_stages: Vec<String>,
    pub failure_codes: Vec<String>,
    pub video_assembly_plan: Option<VideoAssemblyExecutionPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobEventPayload {
    pub event_type: String,
    pub payload_json: Value,
    pub sequence_number: u32,
    pub lease_owner_token: String,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactCompletePayload {
    pub artifact_type: String,
    pub storage_ref: String,
    pub checksum_sha256: String,
    pub size_bytes: u64,
    pub content_type: Option<String>,
    pub metadata_json: Value,
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyProgressEventRequest {
    pub stage: String,
    pub sequence_number: u32,
    pub lease_owner_token: String,
    pub progress_percent: Option<u8>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyFailureEventRequest {
    pub failure_code: String,
    pub sequence_number: u32,
    pub lease_owner_token: String,
    pub message: String,
    pub retryable: bool,
}

fn default_compatibility(runtime_version: &str) -> WorkerProtocolCompatibility {
    WorkerProtocolCompatibility {
        protocol_version: WORKER_RUNTIME_PROTOCOL_VERSION.into(),
        runtime_version: runtime_version.into(),
        runtime_family_schema_version: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION.into(),
        runtime_profile_schema_version: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION.into(),
    }
}

fn sanitize_identifier(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("identifier cannot be empty".into());
    }
    let sanitized = trimmed
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if sanitized.is_empty() {
        return Err("identifier cannot be empty after sanitization".into());
    }
    Ok(sanitized)
}

pub fn build_desktop_worker_external_reference(device_id: &str) -> Result<String, String> {
    Ok(format!(
        "desktop://{}",
        sanitize_identifier(device_id)?,
    ))
}

pub fn build_worker_registration_payload(
    request: DesktopWorkerRegistrationPlanRequest,
) -> Result<WorkerRegistrationPayload, String> {
    if request.display_name.trim().is_empty() {
        return Err("display_name is required".into());
    }

    if request.worker_mode != WorkerMode::PerUser
        && request.execution_identity.mode != ExecutionIdentityMode::ServiceIdentity
    {
        return Err(
            "shared or dedicated desktop workers must use service_identity execution mode".into(),
        );
    }

    let runtime_metadata_json = json!({
        "desktopVersion": request.desktop_version,
        "runtimeProfile": request.runtime_mode.as_str(),
        "workspaceRootsSummary": request.workspace_roots_summary.iter().map(|root| json!({
            "root": root.root,
            "accessMode": root.access_mode.as_str(),
        })).collect::<Vec<_>>(),
        "gpuSnapshot": request.gpu_snapshot,
        "toolchainSummary": request.toolchain_summary,
        "doctorSummary": request.doctor_summary,
        "serviceMode": request.service_mode.as_str(),
        "executionIdentity": {
            "mode": request.execution_identity.mode.as_str(),
            "approvalMode": request.execution_identity.approval_mode.as_str(),
            "budgetAttributionMode": request.execution_identity.budget_attribution_mode.as_str(),
            "tokenRotationTriggers": request.execution_identity.token_rotation_triggers
                .iter()
                .map(TokenRotationTrigger::as_str)
                .collect::<Vec<_>>(),
        },
    });

    Ok(WorkerRegistrationPayload {
        compatibility: default_compatibility(&request.runtime_version),
        runtime_type: WorkerRuntimeType::DesktopZeroClawManaged.as_str().into(),
        worker_mode: request.worker_mode.as_str().into(),
        display_name: request.display_name,
        external_reference: build_desktop_worker_external_reference(&request.device_id)?,
        runtime_mode: request.runtime_mode.as_str().into(),
        team_id: request.team_id,
        machine_id: request.machine_id,
        machine_name: request.machine_name,
        dashboard_url: None,
        capabilities_json: request.capabilities_json,
        hardware_json: request.hardware_json,
        health_summary_json: request.health_summary_json,
        warning_flags_json: request.warning_flags_json,
        runtime_metadata_json,
        file_scope_mode: request.file_scope_mode.as_str().into(),
        runtime_profile_name: request.runtime_profile_name,
        policy_profile_name: request.policy_profile_name,
    })
}

pub fn build_worker_heartbeat_payload(
    request: DesktopWorkerHeartbeatPlanRequest,
) -> WorkerHeartbeatPayload {
    WorkerHeartbeatPayload {
        compatibility: default_compatibility(&request.runtime_version),
        runtime_type: WorkerRuntimeType::DesktopZeroClawManaged.as_str().into(),
        status: request.status.as_str().into(),
        current_job_count: request.current_job_count,
        queue_depth: request.queue_depth,
        free_disk_bytes: request.free_disk_bytes,
        metrics_json: request.metrics_json,
        warnings_json: request.warnings_json,
        runtime_metadata_json: request.runtime_metadata_json,
    }
}

pub fn build_worker_claim_request_payload(
    max_jobs: u32,
    capability_hints: Vec<String>,
) -> WorkerClaimRequestPayload {
    WorkerClaimRequestPayload {
        max_jobs: max_jobs.clamp(1, 10),
        capability_hints,
    }
}

pub fn prepare_claimed_worker_job_execution(
    request: ClaimedWorkerJobExecutionRequest,
) -> Result<ClaimedWorkerJobExecutionPlan, String> {
    if request.job.runtime_type != WorkerRuntimeType::DesktopZeroClawManaged.as_str() {
        return Err(format!(
            "unsupported runtime type for desktop execution: {}",
            request.job.runtime_type
        ));
    }

    let video_assembly_plan = if request.job.job_type == "video_assembly" {
        let job_spec = serde_json::from_value(request.job.input_json.clone())
            .map_err(|error| format!("invalid video_assembly input_json: {error}"))?;
        Some(prepare_video_assembly_execution(VideoAssemblyPlanRequest {
            job_id: request.job.id.clone(),
            workspace_dir: request.workspace_dir,
            job: job_spec,
            prefetched_inputs: request.prefetched_inputs,
        })?)
    } else {
        return Err(format!(
            "unsupported desktop worker job type: {}",
            request.job.job_type
        ));
    };

    Ok(ClaimedWorkerJobExecutionPlan {
        job_id: request.job.id,
        runtime_type: request.job.runtime_type,
        job_type: request.job.job_type,
        lease_owner_token: request.job.lease_owner_token,
        lease_expires_at: request.job.lease_expires_at,
        required_progress_stages: VIDEO_ASSEMBLY_PROGRESS_STAGES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        failure_codes: VIDEO_ASSEMBLY_FAILURE_CODES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        video_assembly_plan,
    })
}

pub fn build_video_assembly_progress_event(
    request: VideoAssemblyProgressEventRequest,
) -> Result<WorkerJobEventPayload, String> {
    if !VIDEO_ASSEMBLY_PROGRESS_STAGES.contains(&request.stage.as_str()) {
        return Err(format!("unsupported video_assembly progress stage: {}", request.stage));
    }

    Ok(WorkerJobEventPayload {
        event_type: "job.progress".into(),
        payload_json: json!({
            "stage": request.stage,
            "progressPercent": request.progress_percent,
            "message": request.message,
        }),
        sequence_number: request.sequence_number,
        lease_owner_token: request.lease_owner_token,
    })
}

pub fn build_video_assembly_failure_event(
    request: VideoAssemblyFailureEventRequest,
) -> Result<WorkerJobEventPayload, String> {
    if !VIDEO_ASSEMBLY_FAILURE_CODES.contains(&request.failure_code.as_str()) {
        return Err(format!("unsupported video_assembly failure code: {}", request.failure_code));
    }

    Ok(WorkerJobEventPayload {
        event_type: "job.failed".into(),
        payload_json: json!({
            "failureCode": request.failure_code,
            "message": request.message,
            "retryable": request.retryable,
            "error": request.message,
        }),
        sequence_number: request.sequence_number,
        lease_owner_token: request.lease_owner_token,
    })
}

pub fn build_worker_artifact_init_payload(
    artifact_type: &str,
    file_name: &str,
    content_type: &str,
    size_bytes: u64,
    checksum_sha256: Option<String>,
    lease_owner_token: &str,
) -> Result<WorkerArtifactInitPayload, String> {
    if artifact_type.trim().is_empty()
        || file_name.trim().is_empty()
        || content_type.trim().is_empty()
        || lease_owner_token.trim().is_empty()
    {
        return Err("artifact_type, file_name, content_type, and lease_owner_token are required".into());
    }

    Ok(WorkerArtifactInitPayload {
        artifact_type: artifact_type.into(),
        file_name: file_name.into(),
        content_type: content_type.into(),
        size_bytes,
        checksum_sha256,
        lease_owner_token: lease_owner_token.into(),
    })
}

pub fn build_worker_artifact_complete_payload(
    artifact_type: &str,
    storage_ref: &str,
    checksum_sha256: &str,
    size_bytes: u64,
    content_type: Option<String>,
    metadata_json: Value,
    lease_owner_token: &str,
) -> Result<WorkerArtifactCompletePayload, String> {
    if artifact_type.trim().is_empty()
        || storage_ref.trim().is_empty()
        || checksum_sha256.trim().is_empty()
        || lease_owner_token.trim().is_empty()
    {
        return Err("artifact_type, storage_ref, checksum_sha256, and lease_owner_token are required".into());
    }

    Ok(WorkerArtifactCompletePayload {
        artifact_type: artifact_type.into(),
        storage_ref: storage_ref.into(),
        checksum_sha256: checksum_sha256.into(),
        size_bytes,
        content_type,
        metadata_json,
        lease_owner_token: lease_owner_token.into(),
    })
}

#[tauri::command]
pub async fn desktop_host_build_worker_registration_payload(
    request: DesktopWorkerRegistrationPlanRequest,
) -> Result<WorkerRegistrationPayload, String> {
    build_worker_registration_payload(request)
}

#[tauri::command]
pub async fn desktop_host_build_worker_heartbeat_payload(
    request: DesktopWorkerHeartbeatPlanRequest,
) -> Result<WorkerHeartbeatPayload, String> {
    Ok(build_worker_heartbeat_payload(request))
}

#[tauri::command]
pub async fn desktop_host_prepare_claimed_worker_job_execution(
    request: ClaimedWorkerJobExecutionRequest,
) -> Result<ClaimedWorkerJobExecutionPlan, String> {
    prepare_claimed_worker_job_execution(request)
}

#[tauri::command]
pub async fn desktop_host_build_video_assembly_progress_event(
    request: VideoAssemblyProgressEventRequest,
) -> Result<WorkerJobEventPayload, String> {
    build_video_assembly_progress_event(request)
}

#[tauri::command]
pub async fn desktop_host_build_video_assembly_failure_event(
    request: VideoAssemblyFailureEventRequest,
) -> Result<WorkerJobEventPayload, String> {
    build_video_assembly_failure_event(request)
}
