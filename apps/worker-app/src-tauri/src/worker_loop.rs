use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime};
#[cfg(test)]
use tauri::async_runtime::JoinHandle as AsyncJoinHandle;

use crate::comfy_execution_ledger::{ExecutionLedger, ExecutionLedgerEntry, ExecutionLedgerState};
use crate::comfy_executor;
use crate::comfy_mcp_client::{
    command_available_with_path, discover_manifest, extract_mcp_execution_id,
    run_generic_workflow_with_lifecycle, run_workflow_with_lifecycle, ComfyMcpConfig,
    ComfyMcpManifest,
};
use crate::comfy_mcp_transport::ComfyHttpMcpTransport;
use crate::comfy_profiles::{
    resolve_bridge_args, ComfyConnectionProfile, ComfyCredentialKind, ComfyProfileStore,
    ComfyTransportKind,
};
use crate::credentials::{clear_connection, load_connection};
use crate::diagnostics::append_diagnostic_event;
use crate::executor_state::{ExecutorState, ExecutorStatus};
use crate::hermes_executor::{
    build_production_refresh_closure, download_and_verify_reference, execute_hermes_media_job_core,
    production_fetch_hermes_media, production_fetch_reference, production_ffprobe,
    run_hermes_connection_authorize, run_hermes_connection_disconnect, run_hermes_connection_probe,
    spawn_hermes_process, HermesControlOutcome, HermesFailure, HermesMediaJobDeps,
    HermesProfileStore, ProductionFfprobeMode, RealHermesControlDeps,
    HERMES_MEDIA_CAPABILITY_FAMILY, HERMES_MEDIA_CLAIM_CAPABILITY,
};
use crate::hermes_runtime::{
    hermes_doctor_from_manifest_path, hermes_runtime_pack_paths, read_hermes_runtime_manifest,
};
use crate::media_pipeline::{
    analyze_media_file, build_media_plan, collect_media_manifest, probe_media_file,
    qc_derived_output_with_probe, run_allowlisted_ffmpeg, run_allowlisted_ffmpeg_segments,
    write_checkpoint_atomic, LocalMediaAnalysis, LocalMediaProbe, LocalMediaQc, MediaCheckpoint,
    MediaFocusKeyframe, MediaPlanOptions, MediaToolchain,
};
use crate::runtime_manifest::{
    doctor_from_manifest_path, read_runtime_pack_manifest, runtime_pack_paths,
    runtime_pack_root_for_sidecars, sidecar_path_from_manifest, DoctorSummary,
    RuntimeTranscriptionManifest,
};
use crate::series_workspace::{load_root_state, load_root_state_for_series, validate_local_root};
use crate::settings::WorkerAppSettings;
use crate::local_llm_registry::{load_registry, LocalLlmRegistry};
use crate::worker_control_plane::{
    build_worker_heartbeat_payload, claim_worker_job, download_worker_bytes, download_worker_file,
    get_worker_json, post_worker_json_with_idempotency, publish_vertical_drama_media, report_worker_job_event, send_worker_heartbeat,
    upload_worker_artifact_file, WorkerClaimRequest, WorkerClaimResponse, WorkerJobEventPayload,
    WorkerLoopConnection,
};
use crate::worker_executor::{
    build_comfy_completed_event, build_comfy_failure_event, build_comfy_progress_event,
    build_failure_event, build_progress_event_plan, build_remotion_render_video_artifacts,
    build_remotion_render_video_completed_event, build_remotion_render_video_failure_event,
    build_remotion_render_video_output_json, build_remotion_render_video_progress_event,
    build_remotion_render_video_sidecar_command, build_required_artifact_uploads,
    build_sidecar_command, build_sidecar_manifest, build_worker_job_display_metadata,
    classify_job_type, compact_json_artifact_metadata, execute_local_llm_job, parse_remotion_sidecar_event,
    prepare_hyperframes_execution_plan, prepare_remotion_render_video_execution_plan,
    remotion_render_video_content_hash, sanitize_segment, validate_final_video_artifact,
    validate_workspace_path, ArtifactUploadPlan, ClaimedWorkerJob, RemotionSidecarEvent,
    SidecarCommandPlan, WorkerEventPlan, WorkerJobKind, COMFY_CAPABILITY_FAMILIES,
    COMFY_IMAGE_GENERATION_JOB_TYPE, COMFY_VIDEO_GENERATION_JOB_TYPE, COMFY_WORKFLOW_RUN_JOB_TYPE,
    HYPERFRAMES_FINAL_VIDEO_MIN_BYTES, HYPERFRAMES_JOB_TYPE,
    REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES, REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
    REMOTION_RENDER_VIDEO_JOB_TYPE, REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    VERTICAL_DRAMA_BROLL_PREPROCESS_JOB_TYPE, VERTICAL_DRAMA_FOOTAGE_ANALYSIS_CAPABILITY,
    VERTICAL_DRAMA_FOOTAGE_BROLL_RENDER_CAPABILITY, VERTICAL_DRAMA_FOOTAGE_BROLL_RENDER_JOB_TYPE,
    VERTICAL_DRAMA_FOOTAGE_PREPARE_CAPABILITY, VERTICAL_DRAMA_FOOTAGE_PREPARE_JOB_TYPE,
    VERTICAL_DRAMA_FOOTAGE_PROBE_JOB_TYPE, VERTICAL_DRAMA_MEDIA_CAPABILITY,
    VERTICAL_DRAMA_MEDIA_INGEST_JOB_TYPE, VERTICAL_DRAMA_SHOT_VIDEO_GENERATION_JOB_TYPE,
};

/// Feature 135 §11 — hermes has its own single-job slot, independent of the
/// render (HyperFrames) slot(s) governed by `max_concurrent_jobs`. Default 1
/// per spec §11 5.3 ("1 hermes job max; render throughput unaffected").
const HERMES_MEDIA_MAX_CONCURRENT_JOBS: u32 = 1;

/// Worker progress events are idempotent by `(jobId, assignmentAttempt,
/// sequenceNumber)` on the server. A response can be lost after the server
/// has committed the event, so retry the exact same event instead of failing
/// an otherwise healthy render.
const WORKER_EVENT_MAX_ATTEMPTS: u8 = 3;
const WORKER_EVENT_RETRY_BACKOFF_MS: [u64; 2] = [250, 750];
const HYPERFRAMES_SOURCE_MAX_BYTES: u64 = 2_000 * 1024 * 1024;

static COMFY_MCP_MANIFEST_CACHE: std::sync::OnceLock<Mutex<Option<(String, ComfyMcpManifest)>>> =
    std::sync::OnceLock::new();
static COMFY_MCP_PROBE_FAILURE_CACHE: std::sync::OnceLock<
    Mutex<Option<(String, Instant, String)>>,
> = std::sync::OnceLock::new();

/// Feature 135 §11 — claim `capability_hints` construction. Render hints are
/// included only when the render (HyperFrames) doctor is ready; `hermes_media`
/// is appended only when this worker's Hermes doctor is ready. Both gates are
/// independent — a worker with only one runtime installed still claims that
/// runtime's jobs (this is what unblocks a hermes-only worker: previously
/// `worker_loop_tick` bailed out entirely whenever the render doctor wasn't
/// ready, before ever reaching this call).
pub fn build_worker_claim_capability_hints(
    render_ready: bool,
    hermes_media_advertised: bool,
) -> Vec<String> {
    build_worker_claim_capability_hints_with_media(
        render_ready,
        true,
        hermes_media_advertised,
        render_ready,
    )
}

/// Builds claim hints with an explicit Remotion contract gate. HyperFrames
/// readiness remains independent: an old pack may still run HyperFrames, but
/// it must not advertise the Remotion lane until its sidecar contract matches
/// the server payload contract.
pub fn build_worker_claim_capability_hints_with_remotion(
    render_ready: bool,
    remotion_contract_ready: bool,
    hermes_media_advertised: bool,
) -> Vec<String> {
    build_worker_claim_capability_hints_with_media(
        render_ready,
        remotion_contract_ready,
        hermes_media_advertised,
        render_ready,
    )
}

/// Builds claim hints for the independent local-media lane. Local ingest and
/// B-roll preprocessing require only a bound, healthy footage root plus the
/// allowlisted FFmpeg binary; they must remain claimable when the Chromium
/// render pack is absent or blocked.
pub fn build_worker_claim_capability_hints_with_media(
    render_ready: bool,
    remotion_contract_ready: bool,
    hermes_media_advertised: bool,
    media_ready: bool,
) -> Vec<String> {
    build_worker_claim_capability_hints_with_media_and_mcp(
        render_ready,
        remotion_contract_ready,
        hermes_media_advertised,
        media_ready,
        false,
    )
}

/// Builds claim hints for both local footage processing and the optional
/// shell-free ComfyUI MCP adapter. The two lanes are intentionally separate:
/// a worker may claim local ingest/B-roll without MCP, or shot generation with
/// MCP without claiming a local footage job that has no bound root.
pub fn build_worker_claim_capability_hints_with_media_and_mcp(
    render_ready: bool,
    remotion_contract_ready: bool,
    hermes_media_advertised: bool,
    media_ready: bool,
    mcp_ready: bool,
) -> Vec<String> {
    let mut hints = Vec::new();
    if render_ready {
        hints.push("hyperframes-final-composite".to_string());
        hints.push(HYPERFRAMES_JOB_TYPE.to_string());
        // `planning/worker-app-remotion-render-video/plan.md` P2 — the
        // Remotion `render-video` sidecar reuses the SAME bundled
        // Chromium/ffmpeg/node runtime-pack binaries the HyperFrames render
        // doctor already gates on. `remotion_contract_ready` adds the
        // sidecar-schema gate on top of those shared binaries. The primary
        // capability-family superset check
        // (`workerSchedulerService.ts#workerJobMatchesSelection`) AND the
        // defense-in-depth `REMOTION_RENDER_VIDEO_REQUIRED_CLAIM_CAPABILITY`
        // check (`workerRegistryService.ts`) require `"remotion-render"` to
        // be present before this worker may claim a `remotion_render_video`
        // job at all.
        if remotion_contract_ready {
            for family in REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES {
                hints.push(family.to_string());
            }
            hints.push(REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY.to_string());
            hints.push(REMOTION_RENDER_VIDEO_JOB_TYPE.to_string());
        }
    }
    // Feature 162 deterministic local ingest/preprocess is independent from
    // the Chromium/HyperFrames doctor, but never advertises Comfy/H3.
    if media_ready {
        hints.push(VERTICAL_DRAMA_MEDIA_CAPABILITY.to_string());
        hints.push(VERTICAL_DRAMA_MEDIA_INGEST_JOB_TYPE.to_string());
        hints.push(VERTICAL_DRAMA_BROLL_PREPROCESS_JOB_TYPE.to_string());
        hints.push(VERTICAL_DRAMA_FOOTAGE_PROBE_JOB_TYPE.to_string());
        hints.push(VERTICAL_DRAMA_FOOTAGE_PREPARE_JOB_TYPE.to_string());
        hints.push(VERTICAL_DRAMA_FOOTAGE_ANALYSIS_CAPABILITY.to_string());
        hints.push(VERTICAL_DRAMA_FOOTAGE_PREPARE_CAPABILITY.to_string());
        if remotion_contract_ready {
            hints.push(VERTICAL_DRAMA_FOOTAGE_BROLL_RENDER_JOB_TYPE.to_string());
            hints.push(VERTICAL_DRAMA_FOOTAGE_BROLL_RENDER_CAPABILITY.to_string());
        }
    }
    if mcp_ready {
        for family in COMFY_CAPABILITY_FAMILIES {
            hints.push(family.to_string());
        }
        hints.push(COMFY_IMAGE_GENERATION_JOB_TYPE.to_string());
        hints.push(COMFY_VIDEO_GENERATION_JOB_TYPE.to_string());
        hints.push(COMFY_WORKFLOW_RUN_JOB_TYPE.to_string());
        hints.push(VERTICAL_DRAMA_MEDIA_CAPABILITY.to_string());
        hints.push(VERTICAL_DRAMA_SHOT_VIDEO_GENERATION_JOB_TYPE.to_string());
    }
    if hermes_media_advertised {
        hints.push(HERMES_MEDIA_CLAIM_CAPABILITY.to_string());
    }
    hints
}

fn local_media_runtime_ready(app_data_dir: &Path, settings: &WorkerAppSettings) -> bool {
    let Ok(Some(root)) = load_root_state(app_data_dir) else {
        return false;
    };
    if validate_local_root(&root.root_path).is_err() {
        return false;
    }
    MediaToolchain::from_settings(settings, app_data_dir).is_ready()
}

fn active_comfy_profile(
    app_data_dir: &Path,
    settings: &WorkerAppSettings,
    requested_id: Option<&str>,
) -> Result<ComfyConnectionProfile, String> {
    let store = ComfyProfileStore::load(app_data_dir)?;
    let paired_worker_id = load_connection(app_data_dir)
        .ok()
        .flatten()
        .map(|connection| connection.worker.id);
    let belongs_to_this_worker = |profile: &ComfyConnectionProfile| {
        profile.enabled
            && paired_worker_id
                .as_deref()
                .is_none_or(|worker_id| worker_id == profile.worker_id)
    };
    if let Some(profile_id) = requested_id {
        return store
            .profiles()
            .find(|profile| profile.profile_id == profile_id && belongs_to_this_worker(profile))
            .cloned()
            .ok_or_else(|| "comfy_profile_not_found_or_disabled".into());
    }
    if let Some(profile) = store
        .active_profile()
        .filter(|profile| belongs_to_this_worker(profile))
    {
        return Ok(profile.clone());
    }
    if settings.comfyui_mcp_enabled {
        let profile = ComfyConnectionProfile {
            profile_id: "legacy-local-comfy".into(),
            worker_id: "legacy-local-worker".into(),
            display_name: "Legacy local ComfyUI".into(),
            transport: ComfyTransportKind::LocalStdio,
            endpoint: None,
            command: Some(settings.comfyui_mcp_command.clone()),
            args: Vec::new(),
            credential_kind: ComfyCredentialKind::None,
            credential_ref: None,
            enabled: true,
            profile_revision: 1,
            permission_revision: 1,
            policy_revision: 1,
            projection_revision: 1,
            expires_at: None,
            last_probe_at: None,
            last_probe_status: None,
        };
        profile.validate()?;
        return Ok(profile);
    }
    Err("comfy_profile_not_selected".into())
}

fn negotiated_mcp_runtime_ready(manifest: Option<&ComfyMcpManifest>) -> bool {
    manifest.is_some_and(|manifest| {
        ["run_workflow", "submit_workflow", "create_execution"]
            .iter()
            .any(|candidate| manifest.tool_names.iter().any(|name| name == candidate))
            && !manifest.workflow_ids.is_empty()
    })
}

async fn probe_active_comfy_mcp_profile(
    app_data_dir: &Path,
    settings: &WorkerAppSettings,
) -> (bool, String, Option<ComfyMcpManifest>) {
    let profile = match active_comfy_profile(app_data_dir, settings, None) {
        Ok(profile) => profile,
        Err(error) => return (false, error, None),
    };
    let result = match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let Some(command) = profile.command.clone() else {
                return (false, "comfy_profile_command_missing".into(), None);
            };
            let managed_command_path =
                (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                    && crate::comfy_mcp_runtime::normalize_command(&command)
                        == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                    .then(|| crate::comfy_mcp_runtime::managed_command_path(app_data_dir))
                    .flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) {
                return (false, "comfy_mcp_unavailable".into(), None);
            }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) {
                let Some(endpoint) = profile.endpoint.as_deref() else {
                    return (false, "comfy_bridge_endpoint_missing".into(), None);
                };
                match resolve_bridge_args(&profile.args, endpoint) {
                    Ok(args) => args,
                    Err(error) => return (false, error, None),
                }
            } else {
                profile.args.clone()
            };
            discover_manifest(&ComfyMcpConfig {
                command,
                managed_command_path,
                args,
                timeout_ms: 5_000,
            })
            .await
        }
        ComfyTransportKind::SelfHostedHttpMcp
        | ComfyTransportKind::ComfyCloud
        | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) {
                match profile
                    .credential_ref
                    .as_deref()
                    .ok_or_else(|| "comfy_credential_ref_missing".to_string())
                    .and_then(crate::comfy_credentials::resolve)
                {
                    Ok(value) => Some(value),
                    Err(error) => return (false, error, None),
                }
            } else {
                None
            };
            let _ssh_tunnel = match ssh_key.as_deref() {
                Some(key) => {
                    match crate::comfy_ssh_tunnel::open_with_identity(&profile.args, key) {
                        Ok(tunnel) => Some(tunnel),
                        Err(error) => return (false, error, None),
                    }
                }
                None => None,
            };
            let Some(endpoint) = profile.endpoint.clone() else {
                return (false, "comfy_endpoint_missing".into(), None);
            };
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel)
                || profile.credential_kind == ComfyCredentialKind::None
            {
                None
            } else {
                match profile
                    .credential_ref
                    .as_deref()
                    .ok_or_else(|| "comfy_credential_ref_missing".to_string())
                    .and_then(crate::comfy_credentials::resolve)
                {
                    Ok(value) => Some(value),
                    Err(error) => return (false, error, None),
                }
            };
            let mut transport =
                match ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(15)) {
                    Ok(transport) => transport,
                    Err(error) => return (false, error, None),
                };
            transport
                .discover_tools()
                .await
                .and_then(|response| crate::comfy_mcp_client::parse_tools_manifest(&response))
        }
    };
    match result {
        Ok(manifest) => (true, "mcp_negotiation_passed".into(), Some(manifest)),
        Err(error) => (false, error, None),
    }
}

fn comfy_readiness_for_heartbeat(
    legacy: &comfy_executor::ComfyReadiness,
    mcp_ready: bool,
    mcp_reason: &str,
) -> comfy_executor::ComfyReadiness {
    if mcp_ready {
        return comfy_executor::ComfyReadiness {
            ready: true,
            reason: mcp_reason.to_string(),
        };
    }
    if legacy.ready {
        return legacy.clone();
    }
    comfy_executor::ComfyReadiness {
        ready: false,
        reason: mcp_reason.to_string(),
    }
}

pub fn remotion_render_video_contract_ready(doctor: &DoctorSummary) -> bool {
    doctor.checks.iter().any(|check| {
        if check.id != "runtime_manifest" && check.id != "managed_wsl_runtime" {
            return false;
        }
        if check
            .details_json
            .get("remotionPlatformContractVersion")
            .and_then(Value::as_str)
            == Some(REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION)
        {
            return true;
        }
        check
            .details_json
            .get("contracts")
            .and_then(Value::as_array)
            .is_some_and(|contracts| {
                contracts.iter().any(|contract| {
                    contract.as_str() == Some(REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION)
                })
            })
    })
}

/// Remotion is compatible with runtime packs that predate the optional
/// transcription lane. Keep the render admission gate focused on the files
/// that Remotion/HyperFrames actually needs; transcription has its own doctor
/// check and must not take an otherwise usable render worker offline.
pub fn render_runtime_ready(doctor: &DoctorSummary) -> bool {
    let managed_wsl = doctor
        .checks
        .iter()
        .any(|check| check.id == "managed_wsl_runtime");
    let required = if managed_wsl {
        &["wsl2_host", "managed_wsl_runtime", "installer_set"][..]
    } else {
        &[
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
            "installer_set",
        ][..]
    };
    required.iter().all(|id| {
        doctor
            .checks
            .iter()
            .find(|check| check.id == *id)
            .is_some_and(|check| check.status == "ok")
    })
}

/// Slot accounting: a second hermes job is never claimed concurrently while
/// one is already running; render slot availability (`max_concurrent_jobs`)
/// is entirely independent of hermes activity.
pub fn can_claim_hermes_media_job(hermes_jobs_active: u32) -> bool {
    hermes_jobs_active < HERMES_MEDIA_MAX_CONCURRENT_JOBS
}

pub fn can_claim_render_job(render_jobs_active: u32, max_concurrent_jobs: u32) -> bool {
    render_jobs_active < max_concurrent_jobs.max(1)
}

/// Feature 135 §11 FIX 1 — resolves the hermes doctor (python present,
/// `hermes --version` == pin, profile root writable) from the app data dir
/// and folds it into the claim `capability_hints`, in ONE call so the
/// wiring is directly testable end-to-end (real filesystem + injected
/// version-query closure — no network).
pub fn resolve_hermes_doctor_and_version(
    app_data_dir: &Path,
    query_version: impl Fn(&Path) -> Result<String, String>,
) -> (DoctorSummary, Option<String>) {
    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
    let profile_root = app_data_dir.join("hermes-profiles");
    let doctor =
        hermes_doctor_from_manifest_path(&manifest_path, &pack_root, &profile_root, query_version);
    let hermes_version = read_hermes_runtime_manifest(&manifest_path)
        .ok()
        .map(|manifest| manifest.hermes_version);
    (doctor, hermes_version)
}

/// Combines a fresh hermes doctor probe with the pure hint builder — the
/// integration-level seam `resolve_hermes_claim_hints_reflects_a_real_doctor_computation`
/// exercises directly (real filesystem doctor computation, no network).
pub fn resolve_hermes_claim_hints(
    app_data_dir: &Path,
    render_ready: bool,
    query_version: impl Fn(&Path) -> Result<String, String>,
) -> (Vec<String>, DoctorSummary, Option<String>) {
    let (doctor, hermes_version) = resolve_hermes_doctor_and_version(app_data_dir, query_version);
    let hints = build_worker_claim_capability_hints(render_ready, doctor.status == "ready");
    (hints, doctor, hermes_version)
}

/// Caches the hermes doctor probe (+ pinned pack version) so the loop does
/// not shell out to `hermes --version` on every 10s tick (spec: "cache it
/// per tick or per N ticks — don't shell out every loop").
struct HermesDoctorCache {
    checked_at: Instant,
    doctor: DoctorSummary,
    hermes_version: Option<String>,
}

const HERMES_DOCTOR_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
const COMFY_MCP_PROBE_FAILURE_RETRY_INTERVAL: Duration = Duration::from_secs(60);
const RUNTIME_DOCTOR_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
struct RuntimeDoctorCache {
    checked_at: Instant,
    settings_key: String,
    doctor: DoctorSummary,
}

fn hermes_doctor_cached(
    app_data_dir: &Path,
    cache: &mut Option<HermesDoctorCache>,
) -> (DoctorSummary, Option<String>) {
    let needs_refresh = cache.as_ref().map_or(true, |existing| {
        existing.checked_at.elapsed() >= HERMES_DOCTOR_REFRESH_INTERVAL
    });
    if needs_refresh {
        let (doctor, hermes_version) =
            resolve_hermes_doctor_and_version(app_data_dir, crate::commands::query_hermes_version);
        *cache = Some(HermesDoctorCache {
            checked_at: Instant::now(),
            doctor,
            hermes_version,
        });
    }
    let existing = cache.as_ref().expect("cache is populated above");
    (existing.doctor.clone(), existing.hermes_version.clone())
}

const IDLE_CLAIM_INTERVAL: Duration = Duration::from_secs(10);
const ACTIVE_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const CLAIM_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(20);
const FAILURE_LOG_SIGNAL_LINES: usize = 20;
const FAILURE_LOG_TAIL_LINES: usize = 25;
const FAILURE_LOG_MAX_CHARS: usize = 10_000;
const LIVE_RENDER_LOG_TAIL_LINES: usize = 80;
const LIVE_RENDER_LOG_MAX_CHARS: usize = 14_000;
const FAILURE_EVENT_SEQUENCE_NUMBER: u32 = 1_000_000;
const SIDECAR_WORKER_EVENT_PREFIX: &str = "SMARTAIHUB_EVENT ";

#[derive(Debug)]
pub struct WorkerLoopHandle {
    pub cancel: Arc<AtomicBool>,
    pub started: Arc<AtomicBool>,
    pub stopped: Arc<AtomicBool>,
    pub connection: Arc<Mutex<WorkerLoopConnection>>,
    pub handle: std::thread::JoinHandle<()>,
}

/// Owns an async task for the task-failure unit test. Production uses a
/// dedicated OS thread to keep loop scheduling and diagnostics isolated.
#[cfg(test)]
struct WorkerLoopTaskGuard {
    task: Option<AsyncJoinHandle<()>>,
}

#[cfg(test)]
impl WorkerLoopTaskGuard {
    async fn wait(mut self) -> Result<(), String> {
        let result = self
            .task
            .as_mut()
            .expect("worker loop task guard must contain a task")
            .await;
        self.task.take();
        result.map_err(|error| error.to_string())
    }
}

#[cfg(test)]
impl Drop for WorkerLoopTaskGuard {
    fn drop(&mut self) {
        if let Some(task) = self.task.as_ref() {
            task.abort();
        }
    }
}

/// Makes an abnormal async-task panic visible to the UI and guarantees that
/// Stop loop does not wait forever. Tokio isolates task panics from the app
/// process, while the process-level panic hook records the backtrace.
struct WorkerLoopLifecycleGuard {
    executor: Arc<Mutex<ExecutorState>>,
    app_data_dir: PathBuf,
    stopped: Arc<AtomicBool>,
}

impl Drop for WorkerLoopLifecycleGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            append_diagnostic_event(
                &self.app_data_dir,
                "worker_loop.task_panicked",
                json!({
                    "message": "Worker loop task panicked; the Worker App process remains open.",
                    "sessionId": crate::diagnostics::session_id(),
                }),
            );
            set_executor_error(
                &self.executor,
                "Worker loop stopped unexpectedly because the loop task panicked. Check Diagnostics for the panic backtrace.".into(),
            );
        }
        self.stopped.store(true, Ordering::Relaxed);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerLoopStatus {
    pub running: bool,
    pub mode: String,
    pub message: String,
}

pub fn start_worker_loop(
    settings: Arc<Mutex<WorkerAppSettings>>,
    executor: Arc<Mutex<ExecutorState>>,
    resource_dir: PathBuf,
    app_data_dir: PathBuf,
    connection: WorkerLoopConnection,
) -> Result<WorkerLoopHandle, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    let started = Arc::new(AtomicBool::new(false));
    let stopped = Arc::new(AtomicBool::new(false));
    let connection = Arc::new(Mutex::new(connection));
    let loop_cancel = cancel.clone();
    let loop_started = started.clone();
    let loop_stopped = stopped.clone();
    let loop_connection = connection.clone();
    // Run the loop from a dedicated OS thread and enter Tauri's async runtime
    // from there. The previous implementation scheduled the whole lifecycle
    // with `tauri::async_runtime::spawn`; on Windows the process disappeared
    // immediately after `worker_loop.start.ok`, before the first task event
    // could be written. Keeping the public UI command on the Tauri runtime but
    // moving the loop root to a named thread isolates that start boundary and
    // lets us record ordinary thread panics. Process-level failures such as a
    // Windows stack overflow still require keeping async futures small.
    let thread_executor = executor.clone();
    let thread_app_data_dir = app_data_dir.clone();
    let thread_stopped = loop_stopped.clone();
    let handle = std::thread::Builder::new()
        .name("smartaihub-worker-loop".into())
        .spawn(move || {
            let panic_executor = thread_executor.clone();
            let panic_app_data_dir = thread_app_data_dir.clone();
            let panic_stopped = thread_stopped.clone();
            append_diagnostic_event(
                &panic_app_data_dir,
                "worker_loop.thread.started",
                json!({
                    "sessionId": crate::diagnostics::session_id(),
                    "thread": "smartaihub-worker-loop",
                }),
            );
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|error| error.to_string())
                    .expect("failed to create Worker App loop runtime");
                runtime.block_on(async move {
                    let lifecycle_guard = WorkerLoopLifecycleGuard {
                        executor: thread_executor.clone(),
                        app_data_dir: thread_app_data_dir.clone(),
                        stopped: thread_stopped.clone(),
                    };
                    append_diagnostic_event(
                        &thread_app_data_dir,
                        "worker_loop.supervisor.spawned",
                        json!({
                            "sessionId": crate::diagnostics::session_id(),
                            "thread": "smartaihub-worker-loop",
                        }),
                    );
                    append_diagnostic_event(
                        &thread_app_data_dir,
                        "worker_loop.supervisor.task_created",
                        json!({
                            "sessionId": crate::diagnostics::session_id(),
                            "thread": "smartaihub-worker-loop",
                        }),
                    );
                    run_worker_loop(
                        settings,
                        thread_executor,
                        resource_dir,
                        thread_app_data_dir,
                        loop_connection,
                        loop_cancel,
                        loop_started,
                        thread_stopped,
                    )
                    .await;
                    drop(lifecycle_guard);
                });
            }));
            if result.is_err() {
                append_diagnostic_event(
                    &panic_app_data_dir,
                    "worker_loop.thread_panicked",
                    json!({
                        "message": "Worker loop thread panicked; the Worker App process remains open.",
                        "sessionId": crate::diagnostics::session_id(),
                    }),
                );
                set_executor_error(
                    &panic_executor,
                    "Worker loop thread stopped unexpectedly. Check Diagnostics for the panic backtrace.".into(),
                );
                panic_stopped.store(true, Ordering::Relaxed);
            }
        })
        .map_err(|error| format!("failed to spawn Worker App loop thread: {error}"))?;
    Ok(WorkerLoopHandle {
        cancel,
        started,
        stopped,
        connection,
        handle,
    })
}

#[cfg(test)]
fn worker_loop_task_failure_message(error: &str) -> String {
    format!(
        "Worker loop stopped unexpectedly, but the app remains open. Check Diagnostics for the task error. {error}"
    )
}

#[cfg(test)]
async fn supervise_worker_loop(
    loop_task: AsyncJoinHandle<()>,
    executor: Arc<Mutex<ExecutorState>>,
    app_data_dir: PathBuf,
    stopped: Arc<AtomicBool>,
) {
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.supervisor.started",
        json!({"sessionId": crate::diagnostics::session_id()}),
    );
    let task_result = WorkerLoopTaskGuard {
        task: Some(loop_task),
    }
    .wait()
    .await;
    if let Err(error) = task_result {
        let message = worker_loop_task_failure_message(&error);
        append_diagnostic_event(
            &app_data_dir,
            "worker_loop.task_failed",
            json!({
                "error": error,
                "message": message,
                "sessionId": crate::diagnostics::session_id(),
            }),
        );
        set_executor_error(&executor, message);
    }
    stopped.store(true, Ordering::Relaxed);
}

fn is_failure_signal_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    [
        "fatal",
        "error:",
        "error ",
        "failed",
        "permission denied",
        "not found",
        "no such file",
        "cannot open",
        "exited with",
        "exception",
        "stderr:",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

fn build_failure_log_excerpt(lines: Vec<String>) -> String {
    let mut excerpt = Vec::new();

    for line in lines.iter().filter(|line| is_failure_signal_line(line)) {
        if excerpt.len() >= FAILURE_LOG_SIGNAL_LINES {
            break;
        }
        if !excerpt.iter().any(|existing| existing == line) {
            excerpt.push(line.clone());
        }
    }

    let tail_start = lines.len().saturating_sub(FAILURE_LOG_TAIL_LINES);
    if !excerpt.is_empty() && tail_start > 0 {
        excerpt.push("--- last log lines ---".to_string());
    }
    for line in lines.iter().skip(tail_start) {
        if !excerpt.iter().any(|existing| existing == line) {
            excerpt.push(line.clone());
        }
    }

    let joined = excerpt.join("\n");
    if joined.chars().count() <= FAILURE_LOG_MAX_CHARS {
        joined
    } else {
        joined
            .chars()
            .take(FAILURE_LOG_MAX_CHARS)
            .collect::<String>()
            + "\n... [log excerpt truncated]"
    }
}

fn build_live_render_log_tail(lines: &[String]) -> String {
    let tail_start = lines.len().saturating_sub(LIVE_RENDER_LOG_TAIL_LINES);
    let joined = lines
        .iter()
        .skip(tail_start)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    if joined.chars().count() <= LIVE_RENDER_LOG_MAX_CHARS {
        joined
    } else {
        let chars = joined.chars().collect::<Vec<_>>();
        chars[chars.len().saturating_sub(LIVE_RENDER_LOG_MAX_CHARS)..]
            .iter()
            .collect()
    }
}

fn parse_render_log_percent(line: &str) -> Option<u8> {
    let percent_index = line.find('%')?;
    let before_percent = &line[..percent_index];
    let digits = before_percent
        .chars()
        .rev()
        .skip_while(|ch| ch.is_whitespace())
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u8>().ok().map(|value| value.min(100))
}

fn parse_sidecar_worker_event_line(line: &str) -> Option<Value> {
    let payload = line.trim().strip_prefix(SIDECAR_WORKER_EVENT_PREFIX)?;
    serde_json::from_str::<Value>(payload)
        .ok()
        .filter(Value::is_object)
}

fn sidecar_event_percent(event: &Value) -> Option<u8> {
    event
        .get("percent")
        .and_then(Value::as_u64)
        .map(|value| (value as u8).min(100))
}

fn sidecar_event_message(event: &Value) -> Option<String> {
    event
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn build_sidecar_structured_event(
    job: &ClaimedWorkerJob,
    event: Value,
    fallback_percent: u8,
) -> WorkerEventPlan {
    let mut payload = event.as_object().cloned().unwrap_or_default();
    payload
        .entry("stage")
        .or_insert_with(|| json!("render_browser_css"));
    payload
        .entry("percent")
        .or_insert_with(|| json!(fallback_percent.min(100)));
    payload.insert("structuredSidecarEvent".into(), json!(true));
    WorkerEventPlan {
        event_type: "job.progress".into(),
        sequence_number: 0,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        payload_json: Value::Object(payload),
    }
}

fn build_source_download_event(
    job: &ClaimedWorkerJob,
    sidecar_event_type: &str,
    shot_id: &str,
    shot_index: usize,
    shot_total: usize,
    percent: u8,
    message: String,
    source_sha256: Option<String>,
) -> WorkerEventPlan {
    WorkerEventPlan {
        event_type: "job.progress".into(),
        sequence_number: 0,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        payload_json: json!({
            "eventType": sidecar_event_type,
            "stage": "stage_assets",
            "percent": percent.min(100),
            "message": message,
            "shotId": shot_id,
            "shotIndex": shot_index,
            "shotTotal": shot_total,
            "cacheHit": sidecar_event_type.ends_with("cache_hit"),
            "sourceSha256": source_sha256,
        }),
    }
}

fn build_sidecar_keepalive_event(
    job: &ClaimedWorkerJob,
    progress_percent: u8,
    current_progress_line: &str,
) -> WorkerEventPlan {
    let line = current_progress_line.trim();
    WorkerEventPlan {
        event_type: "job.progress".into(),
        sequence_number: 0,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        payload_json: json!({
            "stage": "render_browser_css",
            "keepalive": true,
            "percent": progress_percent,
            "message": if line.is_empty() {
                "HyperFrames sidecar is still rendering."
            } else {
                line
            },
        }),
    }
}

async fn run_worker_loop(
    settings: Arc<Mutex<WorkerAppSettings>>,
    executor: Arc<Mutex<ExecutorState>>,
    resource_dir: PathBuf,
    app_data_dir: PathBuf,
    connection: Arc<Mutex<WorkerLoopConnection>>,
    cancel: Arc<AtomicBool>,
    started: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
) {
    started.store(true, Ordering::Relaxed);
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.task.started",
        json!({"sessionId": crate::diagnostics::session_id()}),
    );
    set_executor_polling(&executor, "Worker loop started.");
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.started",
        json!({
            "runtimeResourceDir": resource_dir.to_string_lossy(),
            "sessionId": crate::diagnostics::session_id(),
        }),
    );
    let mut stopped_for_terminal_error = false;
    // Feature 135 §11 — one profile store per loop lifetime (restored from
    // disk so `verify_connection_affinity` survives a restart) and a
    // doctor cache so hermes readiness isn't re-probed every tick.
    let hermes_profiles = Arc::new(Mutex::new(HermesProfileStore::from_existing_root(
        app_data_dir.join("hermes-profiles"),
    )));
    let mut hermes_doctor_cache: Option<HermesDoctorCache> = None;
    let mut runtime_doctor_cache: Option<RuntimeDoctorCache> = None;
    // FIX E — independent render/hermes "a job of this kind is in flight"
    // flags. Job execution is SPAWNED (not awaited inline in the tick — see
    // `worker_loop_tick`'s dispatch below), so a hermes job running under
    // `hermes_active` never blocks a render claim (gated only by
    // `render_active`) and vice versa. `can_claim_hermes_media_job`/
    // `can_claim_render_job` read these flags every tick.
    let render_active = Arc::new(AtomicBool::new(false));
    let hermes_active = Arc::new(AtomicBool::new(false));
    // Since job execution is now spawned rather than awaited inline, a
    // terminal error (revoked token, stale lease) surfacing INSIDE a
    // spawned job's execution can no longer propagate back through this
    // tick's own `Result` — the spawned task instead records it here, and
    // this loop checks it every iteration (same shutdown handling either
    // way, via `handle_worker_loop_error`).
    let terminal_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    while !cancel.load(Ordering::Relaxed) {
        let _ = crate::commands::try_refresh_connection_if_needed(&app_data_dir, &connection).await;

        let tick_result = worker_loop_tick(
            &settings,
            &executor,
            &resource_dir,
            &app_data_dir,
            &connection,
            &cancel,
            &hermes_profiles,
            &mut hermes_doctor_cache,
            &mut runtime_doctor_cache,
            &render_active,
            &hermes_active,
            &terminal_error,
        )
        .await;
        if let Err(error) = tick_result {
            if handle_worker_loop_error(&error, &executor, &app_data_dir, &connection, &cancel)
                .await
            {
                stopped_for_terminal_error = true;
                break;
            }
        }
        if let Some(error) = terminal_error
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
        {
            if handle_worker_loop_error(&error, &executor, &app_data_dir, &connection, &cancel)
                .await
            {
                stopped_for_terminal_error = true;
                break;
            }
        }
        sleep_cancelable(IDLE_CLAIM_INTERVAL, &cancel).await;
    }
    if !stopped_for_terminal_error {
        set_executor_idle(&executor, "Worker loop stopped.");
    }
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.stopped",
        json!({
            "terminalError": stopped_for_terminal_error,
            "cancelled": cancel.load(Ordering::Relaxed),
        }),
    );
    stopped.store(true, Ordering::Relaxed);
}

/// Shared terminal-error handling for both the tick's own directly-returned
/// error AND a spawned job's error recorded into `terminal_error` (FIX E —
/// job execution is spawned, so this can no longer be inline in the `while`
/// loop's single `if let Err(error) = tick_result` branch). Returns `true`
/// when the caller should stop the loop.
async fn handle_worker_loop_error(
    error: &str,
    executor: &Arc<Mutex<ExecutorState>>,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    cancel: &Arc<AtomicBool>,
) -> bool {
    if is_terminal_worker_auth_error(error) {
        let connection_snapshot = clone_connection(connection).ok();
        append_diagnostic_event(
            app_data_dir,
            "worker_loop.terminal_auth_error",
            json!({
                "error": error,
                "workerId": connection_snapshot.as_ref().map(|connection| connection.worker_id.as_str()),
                "serverUrl": connection_snapshot.as_ref().map(|connection| connection.server_url.as_str()),
            }),
        );
        let _ = clear_connection(app_data_dir);
        cancel.store(true, Ordering::Relaxed);
        set_executor_error(executor, terminal_worker_auth_message(error));
        return true;
    }
    if is_stale_worker_lease_error(error) {
        let connection_snapshot = clone_connection(connection).ok();
        append_diagnostic_event(
            app_data_dir,
            "worker_loop.stale_job_lease",
            json!({
                "error": error,
                "workerId": connection_snapshot.as_ref().map(|connection| connection.worker_id.as_str()),
                "serverUrl": connection_snapshot.as_ref().map(|connection| connection.server_url.as_str()),
            }),
        );
        // Do NOT cancel the worker loop (`cancel.store(true)`).
        // A stale/expired lease on a single job during heavy rendering or network delays
        // must not terminate the entire Worker App. Instead, reset the executor to polling
        // so the worker continues servicing new jobs smoothly.
        set_executor_polling(
            executor,
            "Job lease expired during render; continuing to poll for next available jobs.",
        );
        return false;
    }
    crate::diagnostics::log_error(app_data_dir, "worker_loop.error", json!({ "error": error }));
    set_executor_error(executor, format!("Worker loop error: {error}"));
    false
}

async fn worker_loop_tick(
    settings: &Arc<Mutex<WorkerAppSettings>>,
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    cancel: &Arc<AtomicBool>,
    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
    hermes_doctor_cache: &mut Option<HermesDoctorCache>,
    runtime_doctor_cache: &mut Option<RuntimeDoctorCache>,
    render_active: &Arc<AtomicBool>,
    hermes_active: &Arc<AtomicBool>,
    terminal_error: &Arc<Mutex<Option<String>>>,
) -> Result<(), String> {
    let settings_snapshot = settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let effective_runtime_dir = if settings_snapshot.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings_snapshot.runtime_dir.trim())
    };
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, &effective_runtime_dir);
    let runtime_settings_key = format!(
        "{:?}|{}|{}",
        settings_snapshot.runtime_environment,
        effective_runtime_dir.display(),
        settings_snapshot.managed_wsl_root,
    );
    let use_cached_runtime_doctor = runtime_doctor_cache.as_ref().is_some_and(|cache| {
        cache.settings_key == runtime_settings_key
            && cache.checked_at.elapsed() < RUNTIME_DOCTOR_REFRESH_INTERVAL
    });
    let doctor = if use_cached_runtime_doctor {
        runtime_doctor_cache
            .as_ref()
            .map(|cache| cache.doctor.clone())
            .ok_or_else(|| "runtime doctor cache disappeared".to_string())?
    } else {
        append_diagnostic_event(
            app_data_dir,
            "worker_loop.runtime_check.started",
            json!({
                "fullHostChecks": true,
                "settingsKey": runtime_settings_key,
                "sessionId": crate::diagnostics::session_id(),
            }),
        );
        let mut fresh_doctor = doctor_from_manifest_path(&manifest_path, &sidecar_root);
        crate::commands::annotate_runtime_doctor_for_settings(
            &mut fresh_doctor,
            &settings_snapshot,
            true,
            &effective_runtime_dir,
        );
        append_diagnostic_event(
            app_data_dir,
            "worker_loop.runtime_check.completed",
            json!({
                "status": fresh_doctor.status,
                "checkCount": fresh_doctor.checks.len(),
                "sessionId": crate::diagnostics::session_id(),
            }),
        );
        *runtime_doctor_cache = Some(RuntimeDoctorCache {
            checked_at: Instant::now(),
            settings_key: runtime_settings_key,
            doctor: fresh_doctor.clone(),
        });
        fresh_doctor
    };
    let render_ready = render_runtime_ready(&doctor);
    let render_active_now = render_active.load(Ordering::Relaxed);

    // Feature 135 §11 FIX 1/A — hermes doctor probed (cached, see
    // `HERMES_DOCTOR_REFRESH_INTERVAL`) and folded into the heartbeat's
    // `acceptJobs`/`claimEnabled` signal, the claim's capability hints, AND
    // (FIX A) the heartbeat's own `runtimeMetadataJson.hermesMedia` so the
    // server's persisted `capabilitiesJson.hermesMedia` stays fresh even
    // between full re-registrations.
    let (hermes_doctor, hermes_version) = hermes_doctor_cached(app_data_dir, hermes_doctor_cache);
    let hermes_ready = hermes_doctor.status == "ready";
    // Once a render has been claimed, do not start unrelated WSL/Comfy
    // probes from the 10-second polling tick. The Transcribe/media addition
    // introduced these probes into the shared loop; on Windows this meant
    // ffmpeg/ffprobe and MCP processes could be launched alongside Chromium
    // and the Remotion sidecar. Render owns the render lane, so its heartbeat
    // is enough until the job finishes.
    let legacy_comfy_readiness = if render_active_now {
        comfy_executor::ComfyReadiness {
            ready: false,
            reason: "probe_skipped_while_render_active".into(),
        }
    } else if settings_snapshot.comfyui_enabled {
        comfy_executor::check_readiness(&settings_snapshot.comfyui_base_url).await
    } else {
        comfy_executor::ComfyReadiness {
            ready: false,
            reason: "comfyui_disabled".into(),
        }
    };
    let comfy_ready = legacy_comfy_readiness.ready;

    let media_ready = if render_active_now {
        false
    } else {
        local_media_runtime_ready(app_data_dir, &settings_snapshot)
    };
    let active_profile_id = active_comfy_profile(app_data_dir, &settings_snapshot, None)
        .ok()
        .map(|profile| profile.profile_id);
    let cached_manifest = active_profile_id.as_deref().and_then(|profile_id| {
        COMFY_MCP_MANIFEST_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()
            .and_then(|cache| {
                cache
                    .as_ref()
                    .filter(|(cached_id, _)| cached_id == profile_id)
                    .map(|(_, manifest)| manifest.clone())
            })
    });
    let cached_probe_failure = active_profile_id.as_deref().and_then(|profile_id| {
        COMFY_MCP_PROBE_FAILURE_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()
            .and_then(|cache| {
                cache
                    .as_ref()
                    .filter(|(cached_id, checked_at, _)| {
                        cached_id == profile_id
                            && checked_at.elapsed() < COMFY_MCP_PROBE_FAILURE_RETRY_INTERVAL
                    })
                    .map(|(_, _, reason)| reason.clone())
            })
    });
    let had_cached_probe_failure = cached_probe_failure.is_some();
    let (_mcp_probe_ready, mcp_probe_reason, mcp_manifest) = if render_active_now {
        if let Some(manifest) = cached_manifest.as_ref() {
            (
                true,
                "mcp_manifest_cached_while_job_active".to_string(),
                Some(manifest.clone()),
            )
        } else if let Some(reason) = cached_probe_failure.as_ref() {
            (false, reason.clone(), None)
        } else {
            (
                false,
                "mcp_probe_skipped_while_render_active".to_string(),
                None,
            )
        }
    } else if let Some(manifest) = cached_manifest.as_ref() {
        (
            true,
            "mcp_manifest_cached".to_string(),
            Some(manifest.clone()),
        )
    } else if let Some(reason) = cached_probe_failure.as_ref() {
        (false, reason.clone(), None)
    } else {
        probe_active_comfy_mcp_profile(app_data_dir, &settings_snapshot).await
    };
    if let Ok(mut cache) = COMFY_MCP_PROBE_FAILURE_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        if let Some(profile_id) = active_profile_id.as_ref() {
            if mcp_manifest.is_some() {
                *cache = None;
            } else if !had_cached_probe_failure {
                *cache = Some((profile_id.clone(), Instant::now(), mcp_probe_reason.clone()));
            }
        } else {
            *cache = None;
        }
    }
    if let Ok(mut cache) = COMFY_MCP_MANIFEST_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *cache = active_profile_id.zip(mcp_manifest.clone());
    }
    let mcp_ready = negotiated_mcp_runtime_ready(mcp_manifest.as_ref());
    let heartbeat_comfy_readiness =
        comfy_readiness_for_heartbeat(&legacy_comfy_readiness, mcp_ready, &mcp_probe_reason);
    let any_runtime_ready = render_ready || hermes_ready || comfy_ready || media_ready || mcp_ready;
    let accepts_jobs = settings_snapshot.accept_jobs && any_runtime_ready;
    let connection_snapshot = clone_connection(connection)?;
    let hermes_active_now = hermes_active.load(Ordering::Relaxed);
    heartbeat(
        executor,
        app_data_dir,
        &connection_snapshot,
        &settings_snapshot,
        &doctor,
        accepts_jobs,
        Some((&hermes_doctor, hermes_version.as_deref())),
        render_active_now,
        hermes_active_now,
        (!render_active_now).then_some(&heartbeat_comfy_readiness),
        (!render_active_now).then_some(media_ready),
        (!render_active_now).then_some(mcp_ready),
    )
    .await?;

    if !settings_snapshot.accept_jobs {
        set_executor_paused(
            executor,
            "Accept jobs is paused. Heartbeat is still active.",
        );
        return Ok(());
    }
    if !any_runtime_ready {
        set_executor_error(executor, runtime_block_message(&doctor));
        return Ok(());
    }

    // FIX E — independent slot accounting: a hermes job in flight
    // (`hermes_active`) no longer blocks a render claim, and vice versa.
    // `can_claim_render_job`/`can_claim_hermes_media_job` are the same
    // pure functions the unit tests exercise directly.
    let max_jobs = settings_snapshot.max_concurrent_jobs.max(1) as u32;
    // Runtime version freshness is advisory. Only the doctor capability state
    // determines whether a render lane can claim work; an older compatible
    // runtime must not pause the queue until a user chooses to update it.
    let can_claim_render =
        render_ready && can_claim_render_job(if render_active_now { 1 } else { 0 }, max_jobs);
    let can_claim_hermes =
        hermes_ready && can_claim_hermes_media_job(if hermes_active_now { 1 } else { 0 });
    let can_claim_comfy =
        comfy_ready && can_claim_render_job(if render_active_now { 1 } else { 0 }, max_jobs);
    let can_claim_media =
        media_ready && can_claim_render_job(if render_active_now { 1 } else { 0 }, max_jobs);
    let can_claim_mcp =
        mcp_ready && can_claim_render_job(if render_active_now { 1 } else { 0 }, max_jobs);

    if !can_claim_render
        && !can_claim_hermes
        && !can_claim_comfy
        && !can_claim_media
        && !can_claim_mcp
    {
        set_executor_polling(
            executor,
            if render_active_now || hermes_active_now {
                "A job is already running in every available slot. Heartbeat is active."
            } else {
                "No claimable runtime is ready. Heartbeat is active."
            },
        );
        return Ok(());
    }

    set_executor_polling(executor, "Checking Smart AI Hub worker queue.");
    let claimed = match claim_worker_job_with_watchdog(
        connection_snapshot,
        WorkerClaimRequest {
            max_jobs,
            capability_hints: {
                let mut hints = build_worker_claim_capability_hints_with_media_and_mcp(
                    can_claim_render,
                    remotion_render_video_contract_ready(&doctor),
                    can_claim_hermes,
                    can_claim_media,
                    can_claim_mcp,
                );
                if can_claim_comfy {
                    hints.extend(
                        COMFY_CAPABILITY_FAMILIES
                            .iter()
                            .map(|family| (*family).to_string()),
                    );
                    hints.push(COMFY_IMAGE_GENERATION_JOB_TYPE.into());
                    hints.push(COMFY_VIDEO_GENERATION_JOB_TYPE.into());
                    hints.push(COMFY_WORKFLOW_RUN_JOB_TYPE.into());
                    hints.push("gpu-nvidia".into());
                }
                if let Ok(registry) = load_registry(app_data_dir) {
                    let has_enabled_provider = registry.providers.iter().any(|provider| provider.enabled);
                    if has_enabled_provider && registry.models.iter().any(|model| model.enabled) {
                        hints.push("llm_gateway".into());
                        hints.push("llm_invoke".into());
                        hints.extend(registry.models.iter().flat_map(|model| model.capabilities.iter().cloned()));
                    }
                }
                hints
            },
        },
        CLAIM_WATCHDOG_TIMEOUT,
    )
    .await
    {
        Ok(claimed) => claimed,
        Err(error) => {
            set_executor_polling(
                executor,
                format!("Queue check failed; heartbeat is active and will retry. {error}"),
            );
            return Ok(());
        }
    };
    set_executor_queue_depth(executor, claimed.queue_depth);
    let Some(job) = claimed.job else {
        set_executor_polling(executor, "No queued jobs. Heartbeat is active.");
        return Ok(());
    };

    append_diagnostic_event(
        app_data_dir,
        "job.claimed",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "assignmentAttempt": job.assignment_attempt,
        }),
    );
    append_diagnostic_event(
        app_data_dir,
        "job.dispatch",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "assignmentAttempt": job.assignment_attempt,
            "renderLane": matches!(classify_job_type(&job.job_type), WorkerJobKind::Hyperframes | WorkerJobKind::RemotionRenderVideo | WorkerJobKind::VerticalDramaFootageRender),
        }),
    );

    match classify_job_type(&job.job_type) {
        WorkerJobKind::Hyperframes => {
            render_active.store(true, Ordering::Relaxed);
            let executor = executor.clone();
            let resource_dir_owned = resource_dir.to_path_buf();
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let doctor_owned = doctor.clone();
            let settings_owned = settings_snapshot.clone();
            let cancel = cancel.clone();
            let render_active = render_active.clone();
            let terminal_error = terminal_error.clone();
            let monitored_executor = executor.clone();
            let monitored_connection = connection.clone();
            // The render payload can contain a large Remotion template and
            // asset manifest. Keep only the lease identity for the panic
            // reporter; cloning the full `ClaimedWorkerJob` here doubles the
            // payload immediately before the task is scheduled and can make
            // Windows terminate the process under memory pressure.
            let monitored_job = job_failure_report_view(&job);
            let monitored_app_data_dir = app_data_dir.to_path_buf();
            let monitored_render_active = render_active.clone();
            // FIX E — spawned (not awaited inline) so a render job in
            // flight never blocks a hermes claim on the NEXT tick.
            let task = tauri::async_runtime::spawn(async move {
                let result = execute_hyperframes_job(
                    &executor,
                    &resource_dir_owned,
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &doctor_owned,
                    &settings_owned,
                    &cancel,
                )
                .await;
                render_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            let monitored_job_id = monitored_job.id.clone();
            append_diagnostic_event(
                app_data_dir,
                "job.render.task_spawned",
                json!({ "jobId": monitored_job_id, "jobType": HYPERFRAMES_JOB_TYPE }),
            );
            tauri::async_runtime::spawn(async move {
                if let Err(error) = task.await {
                    monitored_render_active.store(false, Ordering::Relaxed);
                    report_render_task_failure(
                        &monitored_executor,
                        &monitored_connection,
                        &monitored_app_data_dir,
                        &monitored_job,
                        HYPERFRAMES_JOB_TYPE,
                        error.to_string(),
                    )
                    .await;
                }
            });
            Ok(())
        }
        WorkerJobKind::RemotionRenderVideo => {
            // `planning/worker-app-remotion-render-video/plan.md` P2 —
            // shares the render concurrency slot with HyperFrames (both are
            // Chromium/ffmpeg-heavy and draw on the same runtime-pack
            // binaries), so it participates in the same `render_active`
            // accounting `can_claim_render_job` gates on.
            render_active.store(true, Ordering::Relaxed);
            // Remotion owns the worker's only Chromium/FFmpeg lane. Keep this
            // job on the loop's awaited path so a failure during dispatch,
            // workspace preparation, WSL startup, or sidecar monitoring cannot
            // disappear with an unobserved detached task. The sidecar runner
            // emits its own active heartbeats while this call is in flight.
            let render_job_id = job.id.clone();
            append_diagnostic_event(
                app_data_dir,
                "job.render.inline_started",
                json!({ "jobId": render_job_id.clone(), "jobType": REMOTION_RENDER_VIDEO_JOB_TYPE }),
            );
            let result = execute_remotion_render_video_job(
                executor,
                resource_dir,
                app_data_dir,
                connection,
                job,
                &doctor,
                &settings_snapshot,
                cancel,
            )
            .await;
            render_active.store(false, Ordering::Relaxed);
            record_terminal_error_if_needed(terminal_error, result);
            append_diagnostic_event(
                app_data_dir,
                "job.render.inline_finished",
                json!({ "jobId": render_job_id, "jobType": REMOTION_RENDER_VIDEO_JOB_TYPE }),
            );
            Ok(())
        }
        WorkerJobKind::VerticalDramaFootageRender => {
            render_active.store(true, Ordering::Relaxed);
            let executor = executor.clone();
            let resource_dir_owned = resource_dir.to_path_buf();
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let doctor_owned = doctor.clone();
            let settings_owned = settings_snapshot.clone();
            let cancel = cancel.clone();
            let render_active = render_active.clone();
            let terminal_error = terminal_error.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute_footage_broll_render_job(
                    &executor,
                    &resource_dir_owned,
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &doctor_owned,
                    &settings_owned,
                    &cancel,
                )
                .await;
                render_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
        }
        WorkerJobKind::ComfyImageGeneration
        | WorkerJobKind::ComfyVideoGeneration
        | WorkerJobKind::ComfyWorkflowRun => {
            render_active.store(true, Ordering::Relaxed);
            let executor = executor.clone();
            let resource_dir_owned = resource_dir.to_path_buf();
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let settings_owned = settings_snapshot.clone();
            let cancel = cancel.clone();
            let render_active = render_active.clone();
            let terminal_error = terminal_error.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute_comfy_job(
                    &executor,
                    &resource_dir_owned,
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &settings_owned,
                    &cancel,
                )
                .await;
                render_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
        }
        WorkerJobKind::VerticalDramaMedia => {
            render_active.store(true, Ordering::Relaxed);
            let executor = executor.clone();
            let resource_dir_owned = resource_dir.to_path_buf();
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let settings_owned = settings_snapshot.clone();
            let cancel = cancel.clone();
            let render_active = render_active.clone();
            let terminal_error = terminal_error.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute_vertical_drama_media_job(
                    &executor,
                    &resource_dir_owned,
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &settings_owned,
                    &cancel,
                )
                .await;
                render_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
        }
        WorkerJobKind::HermesMediaImage | WorkerJobKind::HermesMediaVideo => {
            hermes_active.store(true, Ordering::Relaxed);
            let executor = executor.clone();
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let hermes_doctor_owned = hermes_doctor.clone();
            let hermes_profiles = hermes_profiles.clone();
            let settings_owned = settings_snapshot.clone();
            let hermes_active = hermes_active.clone();
            let terminal_error = terminal_error.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute_hermes_media_job(
                    &executor,
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &hermes_doctor_owned,
                    &hermes_profiles,
                    &settings_owned,
                )
                .await;
                hermes_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
        }
        WorkerJobKind::HermesConnectionAuthorize
        | WorkerJobKind::HermesConnectionProbe
        | WorkerJobKind::HermesConnectionDisconnect => {
            hermes_active.store(true, Ordering::Relaxed);
            let app_data_dir_owned = app_data_dir.to_path_buf();
            let connection = connection.clone();
            let hermes_profiles = hermes_profiles.clone();
            let hermes_active = hermes_active.clone();
            let terminal_error = terminal_error.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute_hermes_control_job(
                    &app_data_dir_owned,
                    &connection,
                    job,
                    &hermes_profiles,
                )
                .await;
                hermes_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
        }
        WorkerJobKind::LocalLlmInvoke => {
            let result = execute_local_llm_job(app_data_dir, &job, cancel).await;
            match result {
                Ok(output) => {
                    let event = WorkerEventPlan {
                        event_type: "job.completed".into(),
                        sequence_number: 1,
                        lease_owner_token: job.lease_owner_token.clone(),
                        assignment_attempt: job.assignment_attempt.clone(),
                        payload_json: json!({ "status": "completed", "result": output }),
                    };
                    send_event_with_refresh(app_data_dir, connection, &job.id, event).await
                }
                Err(error) => {
                    let failure = build_failure_event(&job, 1, "local_llm_failed", &error);
                    send_event_with_refresh(app_data_dir, connection, &job.id, failure).await
                }
            }
        }
        WorkerJobKind::Unknown => {
            // The server offered a job type this Worker App build does not
            // know how to execute — fail explicitly rather than silently
            // assuming it's a HyperFrames render (the prior, section-11-era
            // behavior, back when this dispatch only ever knew one job kind).
            let failure = build_failure_event(
                &job,
                FAILURE_EVENT_SEQUENCE_NUMBER,
                "unsupported_job_type",
                &format!("Worker App does not support job type: {}", job.job_type),
            );
            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
            Err(format!(
                "worker received an unsupported job type: {}",
                job.job_type
            ))
        }
    }
}

/// A spawned job's error can no longer propagate back through the tick's
/// own `Result` (see `handle_worker_loop_error`'s doc comment) — if it's
/// terminal, latch it into the shared slot the main loop polls every
/// iteration.
fn record_terminal_error_if_needed(
    terminal_error: &Arc<Mutex<Option<String>>>,
    result: Result<(), String>,
) {
    if let Err(error) = result {
        if is_terminal_worker_auth_error(&error) {
            if let Ok(mut guard) = terminal_error.lock() {
                if guard.is_none() {
                    *guard = Some(error);
                }
            }
        }
    }
}

/// The task monitor only needs the lease identity to report a panic. Keeping
/// this view deliberately payload-free is important for Remotion jobs: their
/// `input_json` may contain a large template and many asset references, and a
/// second deep clone at dispatch time can turn a recoverable render failure
/// into an OS-level process termination before the task even starts.
fn job_failure_report_view(job: &ClaimedWorkerJob) -> ClaimedWorkerJob {
    ClaimedWorkerJob {
        id: job.id.clone(),
        job_type: job.job_type.clone(),
        created_at: job.created_at.clone(),
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        input_json: Value::Null,
        capability_requirements_json: Value::Null,
        reference_urls: Vec::new(),
    }
}

/// A render task runs outside the worker-loop tick so the loop can continue
/// heartbeats while Chromium/FFmpeg is active. If that task panics, the
/// `JoinError` must become a durable job failure as well; logging only the
/// panic leaves the server job stuck in `running` and makes the app appear to
/// have disappeared when the UI refreshes.
async fn report_render_task_failure(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    app_data_dir: &Path,
    job: &ClaimedWorkerJob,
    job_type: &str,
    error: String,
) {
    let failure_message = format!("Worker render task terminated unexpectedly: {error}");
    let failure = if job_type == REMOTION_RENDER_VIDEO_JOB_TYPE {
        build_remotion_render_video_failure_event(
            job,
            FAILURE_EVENT_SEQUENCE_NUMBER,
            "render_failed",
            &failure_message,
        )
    } else {
        build_failure_event(
            job,
            FAILURE_EVENT_SEQUENCE_NUMBER,
            "render_failed",
            &failure_message,
        )
    };
    if let Err(report_error) =
        send_event_with_refresh(app_data_dir, connection, &job.id, failure).await
    {
        crate::diagnostics::log_error(
            app_data_dir,
            "job.task_failure_report_failed",
            json!({ "jobId": job.id, "jobType": job_type, "error": report_error }),
        );
    }
    crate::diagnostics::log_error(
        app_data_dir,
        "job.task_panicked",
        json!({
            "jobId": job.id,
            "jobType": job_type,
            "error": error,
            "failureReported": true,
        }),
    );
    set_executor_last_job(executor, job, "error", &failure_message, None);
    set_executor_job_error(executor, &job.id, failure_message);
}

async fn claim_worker_job_with_watchdog(
    connection: WorkerLoopConnection,
    payload: WorkerClaimRequest,
    timeout: Duration,
) -> Result<WorkerClaimResponse, String> {
    let handle =
        tauri::async_runtime::spawn(async move { claim_worker_job(&connection, &payload).await });
    let started_at = Instant::now();
    loop {
        if handle.inner().is_finished() {
            return handle
                .await
                .map_err(|error| format!("worker claim task failed: {error}"))?;
        }
        if started_at.elapsed() >= timeout {
            handle.abort();
            return Err(format!(
                "worker queue claim did not finish within {}s",
                timeout.as_secs()
            ));
        }
        let _ =
            tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(100)))
                .await;
    }
}

/// Feature 135 §11 FIX A — builds the heartbeat's `runtimeMetadataJson`,
/// including `hermesMedia` when hermes readiness is available for THIS
/// heartbeat call. `hermes_info` is `None` for the "active heartbeat" calls
/// fired while a HyperFrames render is in flight (those sites have no
/// per-tick hermes doctor cache to read from) — the server preserves the
/// last-known `capabilitiesJson.hermesMedia` in that case (see
/// `workerRegistryService.ts::recordWorkerHeartbeat`, which only overwrites
/// it when this field is present).
fn build_heartbeat_runtime_metadata(
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    accepts_jobs: bool,
    doctor_status: &str,
    hermes_info: Option<(&DoctorSummary, Option<&str>)>,
    comfy_readiness: Option<&comfy_executor::ComfyReadiness>,
    media_ready: Option<bool>,
    mcp_ready: Option<bool>,
) -> Value {
    let runtime_version = doctor
        .checks
        .iter()
        .find(|check| check.id == "managed_wsl_runtime" || check.id == "runtime_manifest")
        .and_then(|check| {
            check
                .details_json
                .get("runtimeVersion")
                .or_else(|| check.details_json.get("version"))
                .and_then(Value::as_str)
        })
        .unwrap_or(settings.runtime_version.as_str());
    let remotion_contract = doctor.checks.iter().find_map(|check| {
        check
            .details_json
            .get("remotionPlatformContractVersion")
            .and_then(Value::as_str)
    });
    let remotion_supported_contracts = doctor.checks.iter().find_map(|check| {
        check
            .details_json
            .get("contracts")
            .filter(|value| value.is_array())
    });
    let mut runtime_metadata = json!({
        "doctorStatus": doctor_status,
        "acceptJobs": settings.accept_jobs,
        "claimEnabled": accepts_jobs,
        "sharingMode": settings.sharing_mode,
        "runtimeChannel": settings.runtime_channel,
        "runtimeVersion": runtime_version,
        "serviceMode": if settings.start_with_windows { "auto_start_requested" } else { "foreground" },
    });
    if let Some(remotion_contract) = remotion_contract {
        runtime_metadata["remotionPlatformContractVersion"] = json!(remotion_contract);
    }
    if let Some(remotion_supported_contracts) = remotion_supported_contracts {
        runtime_metadata["remotionSupportedContractVersions"] =
            remotion_supported_contracts.clone();
    }
    if let Some((hermes_doctor, hermes_version)) = hermes_info {
        let hermes_ready = hermes_doctor.status == "ready";
        runtime_metadata["hermesMedia"] = json!({
            "capability": HERMES_MEDIA_CAPABILITY_FAMILY,
            "advertised": hermes_ready,
            "reason": if hermes_ready { "doctor_passed" } else { "doctor_not_ready" },
            "hermesVersion": hermes_version,
        });
    }
    if let Some(comfy_readiness) = comfy_readiness {
        runtime_metadata["comfyUi"] = json!({
            "adapter": if mcp_ready.unwrap_or(false) { "mcp" } else { "legacy_rest" },
            "advertised": comfy_readiness.ready || mcp_ready.unwrap_or(false),
            "mcpReady": mcp_ready.unwrap_or(false),
            "reason": if mcp_ready.unwrap_or(false) { "mcp_negotiation_passed" } else { comfy_readiness.reason.as_str() },
            "capabilityFamilies": COMFY_CAPABILITY_FAMILIES,
            "workflowIds": COMFY_MCP_MANIFEST_CACHE.get_or_init(|| Mutex::new(None)).lock().ok().and_then(|cache| cache.clone()).map(|(_, manifest)| manifest.workflow_ids).unwrap_or_default(),
            "mcpTools": COMFY_MCP_MANIFEST_CACHE.get_or_init(|| Mutex::new(None)).lock().ok().and_then(|cache| cache.clone()).map(|(_, manifest)| manifest.tool_names).unwrap_or_default(),
        });
    }
    if let Some(media_ready) = media_ready {
        // Do not advertise shot generation merely because the configured MCP
        // executable exists. The caller must pass the result of the live
        // tools/list negotiation and workflow capability check.
        let mcp_ready = mcp_ready.unwrap_or(false);
        let mcp_manifest = COMFY_MCP_MANIFEST_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()
            .and_then(|cache| cache.clone().map(|(_, manifest)| manifest));
        let mut media_capabilities = Vec::new();
        if media_ready {
            media_capabilities.extend(["media-ingest", "broll-preprocess"]);
        }
        if mcp_ready {
            media_capabilities.push("shot_video_generation");
            if let Some(manifest) = mcp_manifest.as_ref() {
                media_capabilities.extend(manifest.capabilities.iter().map(String::as_str));
            }
        }
        runtime_metadata["verticalDramaMedia"] = json!({
            "adapter": "worker_local",
            "ready": media_ready,
            "localReady": media_ready,
            "mcpReady": mcp_ready,
            "capabilityRevision": format!("worker-media-{}", env!("CARGO_PKG_VERSION")),
            "capabilities": media_capabilities,
            "workflowIds": mcp_manifest.as_ref().map(|manifest| manifest.workflow_ids.clone()).unwrap_or_default(),
            "mcpTools": mcp_manifest.as_ref().map(|manifest| manifest.tool_names.clone()).unwrap_or_default(),
            "models": [],
            "reason": if media_ready || mcp_ready { "media_adapter_ready" } else { "local_root_ffmpeg_or_mcp_not_ready" },
        });
    }
    runtime_metadata
}

async fn heartbeat(
    executor: &Arc<Mutex<ExecutorState>>,
    app_data_dir: &Path,
    connection: &WorkerLoopConnection,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    accepts_jobs: bool,
    hermes_info: Option<(&DoctorSummary, Option<&str>)>,
    render_active: bool,
    hermes_active: bool,
    comfy_readiness: Option<&comfy_executor::ComfyReadiness>,
    media_ready: Option<bool>,
    mcp_ready: Option<bool>,
) -> Result<(), String> {
    let current_job_count =
        active_worker_job_count(has_active_job(executor)?, render_active, hermes_active);
    let active_job_ids = active_worker_job_ids(executor)?;
    let status = if doctor.status == "ready" || accepts_jobs {
        "online"
    } else {
        "unhealthy"
    };
    let warnings = if doctor.status == "ready" || accepts_jobs {
        Vec::new()
    } else {
        doctor.recommended_actions.clone()
    };
    let payload = build_worker_heartbeat_payload(
        env!("CARGO_PKG_VERSION"),
        status,
        current_job_count,
        current_queue_depth(executor)?,
        active_job_ids,
        warnings,
        build_heartbeat_runtime_metadata(
            settings,
            doctor,
            accepts_jobs,
            &doctor.status,
            hermes_info,
            comfy_readiness,
            media_ready,
            mcp_ready,
        ),
    );
    let response = send_worker_heartbeat(connection, &payload).await?;
    apply_hermes_heartbeat_warning(executor, &response.warning_flags_json);
    if let Err(error) = sync_local_llm_inventory(connection, &load_registry(app_data_dir).unwrap_or_default()).await {
        // Inventory is an auxiliary projection. A temporary sync failure must
        // not take the control-plane heartbeat or legacy job lanes offline.
        crate::diagnostics::log_error(app_data_dir, "local_llm.inventory_sync_failed", json!({ "error": error }));
    }
    Ok(())
}

fn build_local_llm_inventory(registry: &LocalLlmRegistry) -> Value {
    json!({
        "schemaVersion": "worker-llm-inventory/1",
        "inventoryRevision": registry.inventory_revision,
        "providers": registry.providers.iter().map(|provider| json!({
            "localProviderId": provider.local_provider_id,
            "providerKind": provider.provider_kind,
            "displayName": provider.display_name,
            "enabled": provider.enabled,
            "models": registry.models.iter()
                .filter(|model| model.local_provider_id == provider.local_provider_id)
                .map(|model| json!({
                    "localModelId": model.local_model_id,
                    "providerModelId": model.provider_model_id,
                    "displayName": model.display_name,
                    "capabilities": model.capabilities,
                    "contextWindow": model.context_window,
                    "readiness": if model.enabled { "ready" } else { "blocked" },
                    "metadata": {},
                }))
                .collect::<Vec<_>>(),
            "metadata": {},
        })).collect::<Vec<_>>(),
    })
}

async fn sync_local_llm_inventory(
    connection: &WorkerLoopConnection,
    registry: &LocalLlmRegistry,
) -> Result<(), String> {
    let inventory = build_local_llm_inventory(registry);
    let serialized = serde_json::to_vec(&inventory).map_err(|error| error.to_string())?;
    let hash = Sha256::digest(serialized);
    let idempotency_key = format!("inventory-{:x}", hash);
    let _: Value = post_worker_json_with_idempotency(
        &connection.server_url,
        &format!("/api/workers/{}/llm/inventory", connection.worker_id),
        &connection.tokens.execution_token,
        &inventory,
        &connection.device_proof,
        &idempotency_key,
    ).await?;
    Ok(())
}

fn active_worker_job_ids(executor: &Arc<Mutex<ExecutorState>>) -> Result<Vec<String>, String> {
    executor
        .lock()
        .map(|state| {
            state
                .active_jobs
                .iter()
                .map(|job| job.job_id.clone())
                .take(10)
                .collect()
        })
        .map_err(|_| "executor lock poisoned".to_string())
}

fn active_worker_job_count(
    executor_running: bool,
    render_active: bool,
    hermes_active: bool,
) -> u32 {
    let active_slots = u32::from(render_active) + u32::from(hermes_active);
    active_slots.max(u32::from(executor_running))
}

/// Feature 135 §11 FIX 4 — surfaces the server's `hermes_worker_min_version`
/// enforcement warning (see `workerRegistryService.ts::enforceHermesMinVersion`)
/// from the heartbeat response into `ExecutorState.hermes`, which
/// `src/main.tsx`'s "update required" banner already renders.
fn find_hermes_update_warning(warnings: &[String]) -> Option<String> {
    warnings
        .iter()
        .find(|warning| warning.starts_with("Hermes runtime version"))
        .cloned()
}

fn apply_hermes_heartbeat_warning(executor: &Arc<Mutex<ExecutorState>>, warnings: &[String]) {
    let reason = find_hermes_update_warning(warnings);
    if let Ok(mut executor) = executor.lock() {
        executor.set_hermes_update_required(reason.is_some(), reason);
    }
}

fn runtime_block_message(doctor: &DoctorSummary) -> String {
    let preferred_check_ids = [
        "wsl2_browser_dependencies",
        "wsl2_host",
        "installer_set",
        "wsl2_runtime_profile",
        "hyperframes_native_dependencies",
        "browser_runtime",
        "media_tools",
        "official_hyperframes_renderer",
        "runtime_manifest",
    ];
    let blocking_check = preferred_check_ids
        .iter()
        .find_map(|id| {
            doctor
                .checks
                .iter()
                .find(|check| check.id == *id && check.status == "error")
        })
        .or_else(|| doctor.checks.iter().find(|check| check.status == "error"));

    let mut parts =
        vec!["No local Worker capability is ready. Worker will not claim jobs.".to_string()];
    if let Some(check) = blocking_check {
        parts.push(format!("Blocked by {}: {}", check.id, check.message));
        if let Some(missing) = check
            .details_json
            .get("missing")
            .and_then(|value| value.as_array())
        {
            let missing_lines: Vec<String> = missing
                .iter()
                .filter_map(|value| value.as_str())
                .take(6)
                .map(str::to_string)
                .collect();
            if !missing_lines.is_empty() {
                parts.push(format!("Missing libraries: {}", missing_lines.join("; ")));
            }
        }
    }
    if let Some(action) = doctor.recommended_actions.first() {
        parts.push(format!("Next step: {action}"));
    }
    parts.join(" ")
}

async fn execute_comfy_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    let result = execute_comfy_job_inner(
        executor,
        resource_dir,
        app_data_dir,
        connection,
        &job,
        settings,
        cancel,
    )
    .await;
    match &result {
        Ok(()) => {
            set_executor_last_job(
                executor,
                &job,
                "success",
                "ComfyUI job completed and artifacts uploaded.",
                None,
            );
            set_executor_job_complete(
                executor,
                &job.id,
                "ComfyUI job completed and artifacts uploaded.",
            );
        }
        Err(error) => {
            let failure_code = if error.contains("unreachable") || error.contains("HTTP") {
                "service_unreachable"
            } else if error.contains("rejected") || error.contains("prompt_id") {
                "workflow_rejected"
            } else if error.contains("timed out") {
                "execution_timeout"
            } else if error.contains("output format") || error.contains("supported outputs") {
                "unsupported_output"
            } else if error.contains("upload") {
                "artifact_upload_failed"
            } else {
                "adapter_contract_violation"
            };
            let failure =
                build_comfy_failure_event(&job, FAILURE_EVENT_SEQUENCE_NUMBER, failure_code, error);
            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
            let error_msg = format!("ComfyUI job failed: {error}");
            set_executor_last_job(executor, &job, "error", &error_msg, None);
            set_executor_job_error(executor, &job.id, error_msg);
        }
    }
    result
}

fn extract_mcp_artifact_path(value: &Value) -> Option<String> {
    if let Some(path) = value.get("artifactPath").and_then(Value::as_str) {
        return Some(path.to_string());
    }
    if let Some(structured) = value.get("structuredContent") {
        if let Some(path) = extract_mcp_artifact_path(structured) {
            return Some(path);
        }
    }
    value
        .get("content")
        .and_then(Value::as_array)
        .and_then(|blocks| {
            blocks.iter().find_map(|block| {
                block.get("text").and_then(Value::as_str).and_then(|text| {
                    serde_json::from_str::<Value>(text)
                        .ok()
                        .and_then(|parsed| extract_mcp_artifact_path(&parsed))
                })
            })
        })
}

fn extract_mcp_artifact_url(value: &Value) -> Option<String> {
    if let Some(url) = value
        .get("artifactUrl")
        .or_else(|| value.get("artifact_url"))
        .or_else(|| value.get("outputUrl"))
        .or_else(|| value.get("output_url"))
        .and_then(Value::as_str)
    {
        return Some(url.to_string());
    }
    if let Some(structured) = value.get("structuredContent") {
        if let Some(url) = extract_mcp_artifact_url(structured) {
            return Some(url);
        }
    }
    value
        .get("content")
        .and_then(Value::as_array)
        .and_then(|blocks| {
            blocks.iter().find_map(|block| {
                block
                    .get("text")
                    .and_then(Value::as_str)
                    .and_then(|text| serde_json::from_str::<Value>(text).ok())
                    .and_then(|parsed| extract_mcp_artifact_url(&parsed))
            })
        })
}

fn ensure_portrait_9x16_qc(qc: &LocalMediaQc) -> Result<(), String> {
    let width = u64::from(
        qc.width
            .ok_or_else(|| "qc_aspect_ratio_failed".to_string())?,
    );
    let height = u64::from(
        qc.height
            .ok_or_else(|| "qc_aspect_ratio_failed".to_string())?,
    );
    if width == 0 || height == 0 || width.saturating_mul(16) != height.saturating_mul(9) {
        return Err("qc_aspect_ratio_failed".into());
    }
    Ok(())
}

fn resolve_worker_media_source_path(
    root_path: &Path,
    source_name: &str,
) -> Result<PathBuf, String> {
    if source_name.trim().is_empty()
        || source_name.starts_with('/')
        || source_name.contains('\\')
        || source_name
            .split('/')
            .any(|part| part.is_empty() || part == "..")
    {
        return Err("relative_path_escape".into());
    }
    let source_path = root_path
        .join(source_name)
        .canonicalize()
        .map_err(|_| "media_source_missing".to_string())?;
    if !source_path.starts_with(root_path) {
        return Err("relative_path_escape".into());
    }
    Ok(source_path)
}

fn is_supported_frame_bytes(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0xff, 0xd8, 0xff])
        || bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
}

async fn materialize_shot_media_asset(
    root_path: &Path,
    connection: &WorkerLoopConnection,
    job: &ClaimedWorkerJob,
    series_id: &str,
    asset: &Value,
    label: &str,
    index: usize,
    media_type: &str,
    max_bytes: usize,
) -> Result<Value, String> {
    let asset_id = asset
        .get("assetId")
        .and_then(Value::as_str)
        .and_then(|value| value.strip_prefix("media-"))
        .filter(|value| !value.is_empty() && value.chars().all(|ch| ch.is_ascii_digit()))
        .ok_or_else(|| "shot_frame_asset_id_missing".to_string())?;
    let expected = asset
        .get("fingerprint")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64)
        .ok_or_else(|| "shot_frame_fingerprint_missing".to_string())?;
    let path = format!(
        "/api/workers/{}/media-inputs/{}?jobId={}&seriesId={}",
        connection.worker_id, asset_id, job.id, series_id
    );
    let bytes = download_worker_bytes(
        &connection.server_url,
        &path,
        &connection.tokens.execution_token,
        &connection.device_proof,
    )
    .await?;
    if bytes.is_empty()
        || bytes.len() > max_bytes
        || (media_type == "image" && !is_supported_frame_bytes(&bytes))
        || !matches!(media_type, "image" | "video" | "audio")
    {
        return Err("shot_frame_format_invalid".into());
    }
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != expected {
        return Err("shot_frame_checksum_mismatch".into());
    }
    let extension = match media_type {
        "image" => "img",
        "video" => "video",
        "audio" => "audio",
        _ => return Err("shot_media_type_invalid".into()),
    };
    let relative = format!(
        "derived/.inputs/{}/{}-{}.{}",
        job.id, label, index, extension
    );
    let output = root_path.join(&relative);
    validate_workspace_path(root_path, &output)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("shot_frame_workspace_failed: {error}"))?;
    }
    fs::write(&output, &bytes).map_err(|error| format!("shot_frame_write_failed: {error}"))?;
    let mut materialized = asset.clone();
    let object = materialized
        .as_object_mut()
        .ok_or_else(|| "shot_frame_contract_invalid".to_string())?;
    object.insert("materializedPath".into(), Value::String(relative));
    object.remove("storageKey");
    Ok(materialized)
}

async fn materialize_shot_frame(
    root_path: &Path,
    connection: &WorkerLoopConnection,
    job: &ClaimedWorkerJob,
    series_id: &str,
    frame: &Value,
    label: &str,
    index: usize,
) -> Result<Value, String> {
    materialize_shot_media_asset(
        root_path,
        connection,
        job,
        series_id,
        frame,
        label,
        index,
        "image",
        64 * 1024 * 1024,
    )
    .await
}

async fn materialize_shot_inputs(
    root_path: &Path,
    connection: &WorkerLoopConnection,
    job: &ClaimedWorkerJob,
    series_id: &str,
    start_frame: &Value,
    reference_frames: &Value,
) -> Result<(Value, Value), String> {
    let materialized_start = if start_frame.is_null() {
        Value::Null
    } else {
        materialize_shot_frame(
            root_path,
            connection,
            job,
            series_id,
            start_frame,
            "start",
            0,
        )
        .await?
    };
    let materialized_refs = if reference_frames.is_null() {
        Value::Null
    } else {
        let mut pack = reference_frames.clone();
        let object = pack
            .as_object_mut()
            .ok_or_else(|| "reference_pack_contract_invalid".to_string())?;
        if let Some(frames) = object.get_mut("frames").and_then(Value::as_array_mut) {
            for (index, frame) in frames.iter_mut().enumerate() {
                *frame = materialize_shot_frame(
                    root_path,
                    connection,
                    job,
                    series_id,
                    frame,
                    "reference",
                    index,
                )
                .await?;
            }
        }
        if let Some(last_frame) = object.get_mut("lastFrame") {
            if !last_frame.is_null() {
                *last_frame = materialize_shot_frame(
                    root_path, connection, job, series_id, last_frame, "last", 0,
                )
                .await?;
            }
        }
        if let Some(references) = object.get_mut("references").and_then(Value::as_array_mut) {
            for (index, reference) in references.iter_mut().enumerate() {
                let media_type = reference
                    .get("mediaType")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "shot_reference_media_type_missing".to_string())?
                    .to_string();
                *reference = materialize_shot_media_asset(
                    root_path,
                    connection,
                    job,
                    series_id,
                    reference,
                    "reference-media",
                    index,
                    &media_type,
                    512 * 1024 * 1024,
                )
                .await?;
            }
        }
        pack
    };
    Ok((materialized_start, materialized_refs))
}

async fn materialize_footage_source(
    root_path: &Path,
    connection: &WorkerLoopConnection,
    job: &ClaimedWorkerJob,
    series_id: &str,
    source: &Value,
) -> Result<PathBuf, String> {
    if let Some(relative_name) = source.get("relativeName").and_then(Value::as_str) {
        return resolve_worker_media_source_path(root_path, relative_name);
    }
    let asset_id = source
        .get("assetId")
        .and_then(Value::as_str)
        .and_then(|value| value.strip_prefix("media-"))
        .filter(|value| !value.is_empty() && value.chars().all(|ch| ch.is_ascii_digit()))
        .ok_or_else(|| "media_source_name_missing".to_string())?;
    let expected = source
        .get("sourceFingerprint")
        .and_then(Value::as_str)
        .filter(|value| value.len() == 64)
        .ok_or_else(|| "source_fingerprint_missing".to_string())?;
    let request_path = format!(
        "/api/workers/{}/media-inputs/{}?jobId={}&seriesId={}",
        connection.worker_id, asset_id, job.id, series_id
    );
    let extension = source
        .get("fileName")
        .and_then(Value::as_str)
        .and_then(|value| Path::new(value).extension())
        .and_then(|value| value.to_str())
        .filter(|value| value.len() <= 8 && value.chars().all(|ch| ch.is_ascii_alphanumeric()))
        .unwrap_or("mp4");
    let relative = format!(
        "derived/.inputs/{}/source.{extension}",
        sanitize_segment(&job.id)
    );
    let output = root_path.join(&relative);
    validate_workspace_path(root_path, &output)?;
    let (size_bytes, digest) = download_worker_file(
        &connection.server_url,
        &request_path,
        &connection.tokens.execution_token,
        &connection.device_proof,
        &output,
        // Keep the Worker admission limit aligned with the Web presigned
        // upload contract (2 GiB). The file is streamed to the private root,
        // so this limit does not turn the download into an in-memory buffer.
        2_000 * 1024 * 1024,
    )
    .await?;
    if size_bytes == 0 {
        return Err("unsupported_media".into());
    }
    if digest != expected {
        return Err("source_fingerprint_mismatch".into());
    }
    Ok(output)
}

fn footage_silence_kind(index: usize, total: usize) -> &'static str {
    if index == 0 {
        "leading"
    } else if index + 1 == total {
        "trailing"
    } else {
        "middle"
    }
}

fn transcript_text_and_tokens(value: &Value) -> (String, Vec<Value>) {
    let text = value
        .get("text")
        .or_else(|| value.get("transcript"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(4000)
        .collect::<String>();
    let mut tokens = Vec::new();
    let mut collect = |item: &Value| {
        if tokens.len() >= 12_000 {
            return;
        }
        let token_text = item
            .get("text")
            .or_else(|| item.get("word"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let start = item.get("startMs").and_then(Value::as_u64).or_else(|| {
            item.get("start")
                .and_then(Value::as_f64)
                .map(|v| (v * 1000.0) as u64)
        });
        let end = item.get("endMs").and_then(Value::as_u64).or_else(|| {
            item.get("end")
                .and_then(Value::as_f64)
                .map(|v| (v * 1000.0) as u64)
        });
        if !token_text.is_empty() && start.is_some() && end.is_some() && end > start {
            tokens.push(json!({ "text": token_text.chars().take(500).collect::<String>(), "startMs": start.unwrap(), "endMs": end.unwrap(), "confidence": item.get("confidence").or_else(|| item.get("probability")).and_then(Value::as_f64) }));
        }
    };
    if let Some(items) = value.get("words").and_then(Value::as_array) {
        for item in items {
            collect(item);
        }
    }
    if let Some(segments) = value.get("segments").and_then(Value::as_array) {
        for segment in segments {
            if let Some(items) = segment.get("words").and_then(Value::as_array) {
                for item in items {
                    collect(item);
                }
            }
        }
    }
    (text, tokens)
}

fn runtime_relative_path(runtime_root: &Path, relative: &str) -> Option<PathBuf> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(runtime_root.join(relative_path))
}

fn transcription_output_dir(app_data_dir: &Path, source_path: &Path) -> PathBuf {
    let mut fingerprint = Sha256::new();
    fingerprint.update(source_path.to_string_lossy().as_bytes());
    if let Ok(metadata) = fs::metadata(source_path) {
        fingerprint.update(metadata.len().to_le_bytes());
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.duration_since(SystemTime::UNIX_EPOCH) {
                fingerprint.update(elapsed.as_nanos().to_le_bytes());
            }
        }
    }
    let id = format!("{:x}", fingerprint.finalize());
    app_data_dir
        .join("worker-workspace")
        .join("transcriptions")
        .join(&id[..24])
}

fn windows_path_to_wsl(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    if value.starts_with("//?/") {
        value = value[4..].to_string();
    }
    if value.len() >= 2 && value.as_bytes().get(1) == Some(&b':') {
        let drive = value[..1].to_ascii_lowercase();
        format!("/mnt/{drive}{}", &value[2..])
    } else {
        value
    }
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn managed_wsl_root_expr(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "~" {
        return "\"$HOME\"".into();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        // Keep HOME expansion, but quote the user-provided suffix as a
        // literal shell word. Double-quoting the whole value would allow
        // `$()`, backticks, or `$VAR` in a configured path to execute/expand.
        return format!("\"$HOME\"/{}", shell_single_quote(rest));
    }
    shell_single_quote(trimmed)
}

fn normalize_hyperframes_transcript_output(
    output: &Value,
    output_dir: &Path,
) -> Result<Value, String> {
    let transcript_path = output_dir.join("transcript.json");
    let bytes = fs::read(&transcript_path).map_err(|_| "transcription_failed".to_string())?;
    let words: Value =
        serde_json::from_slice(&bytes).map_err(|_| "transcription_failed".to_string())?;
    let words_array = words
        .as_array()
        .ok_or_else(|| "transcription_failed".to_string())?;
    let text = words_array
        .iter()
        .filter_map(|word| {
            word.get("text")
                .or_else(|| word.get("word"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Ok(json!({
        "text": text,
        "words": words_array,
        "provider": "hyperframes-whisper.cpp",
        "status": if words_array.is_empty() { "empty" } else { "ready" },
        "metadata": output,
    }))
}

fn execute_hyperframes_transcription_process(
    managed_wsl: bool,
    managed_wsl_root: String,
    source_path: PathBuf,
    output_dir: PathBuf,
    language: String,
    model: String,
    whisper_path: PathBuf,
    node: PathBuf,
    cli: PathBuf,
) -> Result<std::process::Output, String> {
    if managed_wsl {
        let root_expr = managed_wsl_root_expr(&managed_wsl_root);
        let binary_name = whisper_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("whisper-cli");
        let script = format!(
            "set -eu\nROOT={root_expr}\nWHISPER_HOME=\"$ROOT/runtime-pack/whisper\"\nexport HOME=\"$WHISPER_HOME\"\nexport USERPROFILE=\"$WHISPER_HOME\"\nexport HYPERFRAMES_WHISPER_PATH=\"$WHISPER_HOME/{binary_name}\"\nNODE=\"$ROOT/runtime-pack/node/bin/node\"\nCLI=\"$ROOT/runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js\"\nif [ ! -x \"$HYPERFRAMES_WHISPER_PATH\" ] || [ ! -s \"$WHISPER_HOME/.cache/hyperframes/whisper/models/ggml-$4.bin\" ] || [ ! -x \"$NODE\" ] || [ ! -f \"$CLI\" ]; then\n  echo \"bundled transcription runtime is incomplete\" >&2\n  exit 24\nfi\nexec \"$NODE\" \"$CLI\" transcribe \"$1\" --dir \"$2\" --language \"$3\" --model \"$4\" --json\n",
        );
        let mut command = Command::new("wsl.exe");
        command.args([
            "-e",
            "bash",
            "-lc",
            &script,
            "smartaihub-transcribe",
            &windows_path_to_wsl(&source_path),
            &windows_path_to_wsl(&output_dir),
            &language,
            &model,
        ]);
        command
            .output()
            .map_err(|_| "transcription_unavailable".to_string())
    } else {
        let whisper_home = whisper_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let mut command = Command::new(&node);
        command
            .current_dir(source_path.parent().unwrap_or(Path::new(".")))
            .env("HYPERFRAMES_WHISPER_PATH", &whisper_path)
            .env("HOME", &whisper_home)
            .env("USERPROFILE", &whisper_home)
            .args([
                cli.to_string_lossy().as_ref(),
                "transcribe",
                source_path.to_string_lossy().as_ref(),
                "--dir",
                output_dir.to_string_lossy().as_ref(),
                "--language",
                &language,
                "--model",
                &model,
                "--json",
            ])
            .output()
            .map_err(|_| "transcription_unavailable".to_string())
    }
}

fn build_footage_guide(
    source: &Value,
    probe: &LocalMediaProbe,
    analysis: Option<&LocalMediaAnalysis>,
    transcript: Option<&Value>,
    language: &str,
    runtime_version: &str,
    runtime_transcription: Option<&RuntimeTranscriptionManifest>,
) -> Value {
    let duration = probe.duration_ms.unwrap_or(0);
    let silence_segments = analysis
        .map(|item| item.silence_segments.as_slice())
        .unwrap_or(&[]);
    let silence_ranges: Vec<Value> = silence_segments.iter().enumerate().filter_map(|(index, item)| {
        let end = item.end_ms.or(Some(duration)).filter(|value| *value > item.start_ms)?;
        Some(json!({ "startMs": item.start_ms, "endMs": end, "kind": footage_silence_kind(index, silence_segments.len()), "confidence": item.confidence }))
    }).collect::<Vec<_>>();
    let mut speech_ranges = Vec::new();
    let mut cursor = 0u64;
    for item in &silence_ranges {
        let start = item
            .get("startMs")
            .and_then(Value::as_u64)
            .unwrap_or(cursor);
        if start > cursor {
            speech_ranges.push(json!({ "startMs": cursor, "endMs": start, "confidence": 0.6 }));
        }
        cursor = item.get("endMs").and_then(Value::as_u64).unwrap_or(cursor);
    }
    if duration > cursor {
        speech_ranges.push(json!({ "startMs": cursor, "endMs": duration, "confidence": 0.5 }));
    }
    let scene_ranges = analysis.map(|item| item.scene_candidates.iter().filter_map(|scene| Some(json!({ "startMs": scene.start_ms, "endMs": scene.end_ms?, "confidence": scene.confidence, "keyframeAssetId": Value::Null }))).collect::<Vec<_>>()).unwrap_or_default();
    let runtime_model = runtime_transcription
        .map(|item| item.model.as_str())
        .unwrap_or("large-v3");
    let transcript_json = transcript.map(|raw| {
        let (text, tokens) = transcript_text_and_tokens(raw);
        let status = raw.get("status").and_then(Value::as_str).unwrap_or("ready");
        json!({ "language": language, "model": runtime_model, "text": text, "tokens": tokens, "fingerprint": format!("{:x}", Sha256::digest(text.as_bytes())), "status": status, "reason": Value::Null })
    });
    let mut warnings = Vec::<Value>::new();
    let visual_ready = analysis.is_some();
    if !visual_ready {
        warnings.push(json!("visual_analysis_unavailable"));
    }
    if transcript_json.is_none() {
        warnings.push(json!("transcription_unavailable"));
    } else if transcript_json
        .as_ref()
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        == Some("empty")
    {
        warnings.push(json!("transcription_empty"));
    }
    if silence_ranges.is_empty() {
        warnings.push(json!("silence_detection_empty"));
    }
    let warning_strings = warnings
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    let unknowns = warning_strings
        .iter()
        .map(|value| json!(value))
        .collect::<Vec<_>>();
    let transcript_status = transcript_json
        .as_ref()
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("unavailable");
    let guide_status = if warning_strings.is_empty() {
        "ready"
    } else {
        "partial"
    };
    json!({
        "schemaVersion": "vd-footage-guide-v1",
        "sourceAssetId": source.get("assetId").cloned().unwrap_or(Value::Null),
        "sourceRevision": source.get("sourceRevision").cloned().unwrap_or(Value::Null),
        "sourceFingerprint": source.get("sourceFingerprint").cloned().unwrap_or(Value::Null),
        "timelineTimebase": "milliseconds",
        "probe": probe,
        "speechRanges": speech_ranges,
        "silenceRanges": silence_ranges,
        "sceneRanges": scene_ranges,
        "transcript": transcript_json,
        "semanticGuide": {
            "observations": if visual_ready { vec![json!({ "text": "วิดีโอมีข้อมูลภาพและช่วงเวลาสำหรับวางแผน tie-in", "confidence": 0.6, "evidence": "ffprobe_visual_analysis" })] } else { Vec::new() },
            "recommendedTieIn": vec![json!({ "text": "วาง tie-in ในช่วงภาพที่มีการเคลื่อนไหวหรือช่วงเงียบที่ตรวจสอบแล้ว โดยไม่อ้างสิ่งที่ระบบยืนยันไม่ได้", "evidence": "footage_guide_policy" })],
            "avoid": unknowns.iter().map(|item| json!({ "text": format!("อย่าเดาเนื้อหาที่ไม่พบหลักฐาน: {}", item.as_str().unwrap_or("unknown")), "evidence": "analysis_warning" })).collect::<Vec<_>>(),
            "confidence": if guide_status == "ready" { 0.8 } else { 0.45 }
        },
        "status": { "probe": "ready", "transcript": transcript_status, "visual": if visual_ready { "ready" } else { "unavailable" }, "guide": guide_status, "warnings": warning_strings, "unknowns": unknowns.iter().filter_map(Value::as_str).collect::<Vec<_>>() },
        "runtime": {
            "manifestVersion": runtime_version,
            "binaryFingerprint": runtime_transcription.map(|item| item.binary_sha256.as_str()),
            "modelFingerprint": runtime_transcription.map(|item| item.model_sha256.as_str()),
            "model": runtime_model
        }
    })
}

async fn run_hyperframes_transcription(
    resource_dir: &Path,
    app_data_dir: &Path,
    settings: &WorkerAppSettings,
    source_path: &Path,
    language: &str,
    policy: &str,
) -> Result<Option<Value>, String> {
    if policy == "disabled" {
        return Ok(None);
    }
    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings.runtime_dir.trim())
    };
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, &effective_runtime_dir);
    let runtime_root = runtime_pack_root_for_sidecars(&sidecar_root);
    let manifest = read_runtime_pack_manifest(&manifest_path)?;
    let Some(transcription) = manifest.transcription.as_ref() else {
        return if policy == "required" {
            Err("transcription_unavailable".into())
        } else {
            Ok(None)
        };
    };
    let Some(whisper_path) = runtime_relative_path(&runtime_root, &transcription.binary_path)
    else {
        return if policy == "required" {
            Err("transcription_unavailable".into())
        } else {
            Ok(None)
        };
    };
    let Some(model_path) = runtime_relative_path(&runtime_root, &transcription.model_path) else {
        return if policy == "required" {
            Err("transcription_unavailable".into())
        } else {
            Ok(None)
        };
    };
    let node = if settings.runtime_environment.is_managed_wsl() || cfg!(target_os = "macos") {
        runtime_root.join("node/bin/node")
    } else {
        runtime_root.join("node/node.exe")
    };
    let cli = runtime_root.join("hyperframes/node_modules/hyperframes/dist/cli.js");
    let output_dir = transcription_output_dir(app_data_dir, source_path);
    fs::create_dir_all(&output_dir).map_err(|_| "transcription_unavailable".to_string())?;
    if !settings.runtime_environment.is_managed_wsl()
        && (!whisper_path.is_file() || !model_path.is_file() || !node.is_file() || !cli.is_file())
    {
        return if policy == "required" {
            Err("transcription_unavailable".into())
        } else {
            Ok(None)
        };
    }
    let output = tauri::async_runtime::spawn_blocking({
        let managed_wsl = settings.runtime_environment.is_managed_wsl();
        let managed_wsl_root = settings.managed_wsl_root.clone();
        let source_path = source_path.to_path_buf();
        let output_dir = output_dir.clone();
        let language = language.to_string();
        let model = transcription.model.clone();
        let whisper_path = whisper_path.clone();
        let node = node.clone();
        let cli = cli.clone();
        move || {
            execute_hyperframes_transcription_process(
                managed_wsl,
                managed_wsl_root,
                source_path,
                output_dir,
                language,
                model,
                whisper_path,
                node,
                cli,
            )
        }
    })
    .await
    .map_err(|_| "transcription_unavailable".to_string())??;
    if !output.status.success() {
        return if policy == "required" {
            Err("transcription_failed".into())
        } else {
            Ok(None)
        };
    }
    let raw: Value =
        serde_json::from_slice(&output.stdout).map_err(|_| "transcription_failed".to_string())?;
    match normalize_hyperframes_transcript_output(&raw, &output_dir) {
        Ok(value) => Ok(Some(value)),
        Err(error) => {
            if policy == "required" {
                Err(error)
            } else {
                Ok(None)
            }
        }
    }
}

async fn execute_vertical_drama_media_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    let result = async {
        if cancel.load(Ordering::Relaxed) { return Err("media_job_canceled".to_string()); }
        let kind = job.input_json.get("kind").and_then(Value::as_str).unwrap_or_default();
        let series_id = job.input_json.get("seriesId").and_then(Value::as_str).ok_or_else(|| "series_id_missing".to_string())?;
        let root = load_root_state_for_series(app_data_dir, series_id)?.ok_or_else(|| "root_not_bound".to_string())?;
        let root_path = validate_local_root(&root.root_path)?;
        let media_tools = MediaToolchain::from_settings(settings, app_data_dir);
        let expected_binding_revision = job.input_json.get("binding").and_then(|value| value.get("bindingRevision")).and_then(Value::as_u64).unwrap_or(0);
        let control_plane = refresh_connection_for_control_plane(app_data_dir, connection, "media binding validation").await?;
        let series_projection: Value = get_worker_json(&control_plane.server_url, &format!("/api/workers/{}/series/{}", control_plane.worker_id, series_id), &control_plane.tokens.execution_token, &control_plane.device_proof).await?;
        // The canonical Series detail route returns `binding`; older control
        // plane projections used `item`. Read the canonical shape first and
        // retain the compatibility fallback so an upgraded Worker does not
        // reject every valid media job as stale during a rolling deploy.
        let (current_binding, current_status) = read_media_binding_projection(&series_projection);
        if current_binding != Some(expected_binding_revision) || current_status != Some("active".to_string()) { return Err("root_revision_stale".to_string()); }
        send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.running".into(), sequence_number: 1, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "stage": "local_media_prepare", "percent": 5 }) }).await?;
        if kind == VERTICAL_DRAMA_MEDIA_INGEST_JOB_TYPE {
            let inventory = collect_media_manifest(&root_path, 5000)?;
            let completed = WorkerEventPlan { event_type: "job.completed".into(), sequence_number: 2, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "status": "ingested", "source": job.input_json.get("source").cloned().unwrap_or_else(|| json!({})), "inventory": inventory, "rootId": root.root_id }) };
            send_event_with_refresh(app_data_dir, connection, &job.id, completed).await?;
            return Ok(());
        }
        if kind == VERTICAL_DRAMA_FOOTAGE_PROBE_JOB_TYPE {
            let source = job.input_json.get("source").ok_or_else(|| "media_source_missing".to_string())?;
            let source_path = materialize_footage_source(&root_path, &control_plane, &job, series_id, source).await?;
            let local_probe = probe_media_file(&source_path, &media_tools)?;
            let local_analysis = analyze_media_file(&source_path, &media_tools).ok();
            let transcription_policy = job.input_json.get("transcriptionPolicy").and_then(Value::as_str).unwrap_or("preferred");
            let language = job.input_json.get("requestedLanguage").and_then(Value::as_str).unwrap_or("th");
            let transcript = run_hyperframes_transcription(resource_dir, app_data_dir, settings, &source_path, language, transcription_policy).await?;
            let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() { app_data_dir.to_path_buf() } else { PathBuf::from(settings.runtime_dir.trim()) };
            let (manifest_path, _) = runtime_pack_paths(resource_dir, &effective_runtime_dir);
            let runtime_manifest = read_runtime_pack_manifest(&manifest_path).ok();
            let runtime_version = runtime_manifest.as_ref().map(|manifest| manifest.version.as_str()).unwrap_or("runtime-unknown");
            let guide = build_footage_guide(source, &local_probe, local_analysis.as_ref(), transcript.as_ref(), language, runtime_version, runtime_manifest.as_ref().and_then(|manifest| manifest.transcription.as_ref()));
            let guide_dir = root_path.join("derived/.analysis").join(sanitize_segment(&job.id));
            fs::create_dir_all(&guide_dir).map_err(|_| "guide_workspace_failed".to_string())?;
            let guide_path = guide_dir.join("footage-guide.json");
            fs::write(&guide_path, serde_json::to_vec_pretty(&guide).map_err(|_| "guide_serialize_failed".to_string())?).map_err(|_| "guide_write_failed".to_string())?;
            let artifact = upload_worker_artifact_file_with_refresh(app_data_dir, connection, &job.id, "footage_guide", &guide_path, "footage-guide.json", "application/json", &job.lease_owner_token, &job.assignment_attempt, json!({ "kind": "analysis", "guide": guide, "sourceAssetId": source.get("assetId"), "sourceRevision": source.get("sourceRevision") })).await?;
            write_checkpoint_atomic(&root_path.join("derived/.checkpoints").join(format!("{}.json", job.id)), &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision: expected_binding_revision, source_fingerprint: source.get("sourceFingerprint").and_then(Value::as_str).unwrap_or_default().into(), stage: "published".into(), output_relative_name: Some(format!("derived/.analysis/{}/footage-guide.json", sanitize_segment(&job.id))), remote_execution_id: artifact.artifact.get("id").and_then(Value::as_str).map(str::to_string) })?;
            send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.completed".into(), sequence_number: 2, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "status": "published", "guide": guide, "artifact": artifact.artifact }) }).await?;
            return Ok(());
        }
        if kind == VERTICAL_DRAMA_FOOTAGE_PREPARE_JOB_TYPE {
            let source = job.input_json.get("source").ok_or_else(|| "media_source_missing".to_string())?;
            let source_path = materialize_footage_source(&root_path, &control_plane, &job, series_id, source).await?;
            let local_probe = probe_media_file(&source_path, &media_tools)?;
            let source_relative = source_path.strip_prefix(&root_path).map_err(|_| "media_source_scope_violation".to_string())?.to_string_lossy().replace('\\', "/");
            let source_duration = local_probe.duration_ms.unwrap_or(90_000);
            let requested_segments = job.input_json.get("segments").and_then(Value::as_array).ok_or_else(|| "approval_required".to_string())?;
            let mut requested_approved_segments = Vec::new();
            for segment in requested_segments {
                if segment.get("keep").and_then(Value::as_bool) != Some(true) { continue; }
                let start = segment.get("sourceInMs").and_then(Value::as_u64).ok_or_else(|| "approval_required".to_string())?;
                let end = segment.get("sourceOutMs").and_then(Value::as_u64).ok_or_else(|| "approval_required".to_string())?;
                if end <= start || end > source_duration { return Err("approval_required".into()); }
                requested_approved_segments.push((start, end));
            }
            if requested_approved_segments.is_empty() { return Err("approval_required".into()); }
            let silence_ranges = job.input_json.get("silenceRanges").and_then(Value::as_array).map(|ranges| ranges.iter().filter_map(|range| Some((range.get("startMs")?.as_u64()?, range.get("endMs")?.as_u64()?))).collect::<Vec<_>>()).unwrap_or_default();
            let remove_dead_air = job.input_json.get("trimPolicy").and_then(|value| value.get("removeDeadAir")).and_then(Value::as_bool).unwrap_or(false);
            let preserve_padding_ms = job.input_json.get("trimPolicy").and_then(|value| value.get("preserveSpeechPaddingMs")).and_then(Value::as_u64).unwrap_or(250).min(2_000);
            let approved_segments = if remove_dead_air && !silence_ranges.is_empty() { remove_approved_silence(&requested_approved_segments, &silence_ranges, preserve_padding_ms) } else { requested_approved_segments.clone() };
            if approved_segments.is_empty() { return Err("approval_required".into()); }
            let max_duration = job.input_json.get("outputProfile").and_then(|value| value.get("maxDurationMs")).and_then(Value::as_u64).unwrap_or(90_000).min(90_000);
            if approved_segments.iter().map(|(start, end)| end - start).sum::<u64>() > max_duration { return Err("duration_budget_exceeded".into()); }
            let output_relative = format!("derived/footage-prepared/{}/prepared.mp4", sanitize_segment(&job.id));
            let fit_policy = job.input_json.get("fitPolicy").and_then(Value::as_str).unwrap_or("9:16_cover");
            let mute_audio = job.input_json.get("baseAudioPolicy").and_then(Value::as_str) == Some("mute");
            let output = run_allowlisted_ffmpeg_segments(&root_path, &source_relative, &output_relative, &approved_segments, fit_policy == "9:16_cover", mute_audio, &media_tools)?;
            let qc = qc_derived_output_with_probe(&root_path, &output, &media_tools)?;
            if fit_policy != "source" { ensure_portrait_9x16_qc(&qc)?; }
            let mut prepared_cursor = 0u64;
            let source_time_map = approved_segments.iter().map(|(start, end)| {
                let prepared_start = prepared_cursor;
                prepared_cursor = prepared_cursor.saturating_add(end - start);
                json!({ "sourceStartMs": start, "sourceEndMs": end, "preparedStartMs": prepared_start, "preparedEndMs": prepared_cursor })
            }).collect::<Vec<_>>();
            let artifact = upload_worker_artifact_file_with_refresh(app_data_dir, connection, &job.id, "normalized_video", &output, "prepared-footage.mp4", "video/mp4", &job.lease_owner_token, &job.assignment_attempt, json!({ "qc": qc, "sourceAssetId": source.get("assetId"), "sourceRevision": source.get("sourceRevision"), "preparedRevision": job.input_json.get("analysisRevision"), "approvedSegments": approved_segments, "sourceTimeMap": source_time_map })).await?;
            let artifact_id = artifact.artifact.get("id").and_then(Value::as_str).ok_or_else(|| "artifact_id_missing".to_string())?;
            let qc_json = json!({ "qcVersion": "media-qc-v1", "passed": qc.passed, "durationMs": qc.duration_ms.unwrap_or(0), "width": qc.width.ok_or_else(|| "qc_failed".to_string())?, "height": qc.height.ok_or_else(|| "qc_failed".to_string())?, "hasAudio": qc.has_audio.unwrap_or(false), "checksum": qc.checksum, "checks": [{ "code": "approved_segments", "passed": true, "messageKey": "approved_segments_rendered" }], "failureCode": Value::Null });
            let publication_payload = json!({ "jobId": job.id, "workerArtifactId": artifact_id, "bindingRevision": expected_binding_revision, "artifact": { "artifactId": artifact_id, "artifactRevision": job.input_json.get("analysisRevision").cloned().unwrap_or_else(|| json!("prepared-v1")), "kind": "normalized_video", "storageKey": artifact_id, "checksum": qc.checksum, "sizeBytes": qc.size_bytes, "contentType": "video/mp4", "durationMs": qc.duration_ms, "qc": qc_json, "sourceAssetId": source.get("assetId"), "sourceRevision": source.get("sourceRevision"), "intelligence": { "tags": ["footage_prepared", "approved_segments"], "subjects": [], "scenes": [], "silenceSegments": [], "focusTrack": [], "transform": { "aspectRatio": if fit_policy == "source" { "source" } else { "9:16" }, "trackingMode": "center_fallback", "fallback": Value::Null, "stillMotion": Value::Null } } }, "qc": qc_json });
            let publication = publish_vertical_drama_media(&control_plane, series_id, &publication_payload).await?;
            send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.completed".into(), sequence_number: 2, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "status": "published", "artifact": artifact.artifact, "preparedSource": { "assetId": format!("artifact-{}", artifact_id), "kind": "video", "sourceRevision": job.input_json.get("analysisRevision").cloned().unwrap_or_else(|| json!("prepared-v1")), "sourceFingerprint": qc.checksum, "fileName": "prepared-footage.mp4", "relativeName": output_relative, "sizeBytes": qc.size_bytes, "durationMs": qc.duration_ms, "captureAt": Value::Null }, "qc": qc_json, "publication": publication }) }).await?;
            return Ok(());
        }
        if kind == VERTICAL_DRAMA_SHOT_VIDEO_GENERATION_JOB_TYPE {
            let selected_profile_id = job.input_json.get("connectionResolution").and_then(|value| value.get("selectedProfileId")).and_then(Value::as_str);
            let comfy_profile = active_comfy_profile(app_data_dir, settings, selected_profile_id)?;
            let workflow_id = job.input_json.get("workflowResolution").and_then(|value| value.get("selectedWorkflowId")).and_then(Value::as_str).ok_or_else(|| "workflow_capability_blocked".to_string())?;
            let workflow_request = job.input_json.get("workflowRequest").ok_or_else(|| "workflow_capability_blocked".to_string())?;
            let start_frame = job.input_json.get("startFrame").cloned().unwrap_or(Value::Null);
            let reference_frames = job.input_json.get("referenceFrames").cloned().unwrap_or(Value::Null);
            let has_start_frame = !start_frame.is_null();
            let has_reference_frames = !reference_frames.is_null();
            let model_route = workflow_id.to_ascii_lowercase();
            let model_route = if model_route.contains("minimax_h3_reference") || has_reference_frames {
                "minimax_h3_reference_to_video"
            } else if model_route.contains("minimax_h3_i2v") || has_start_frame {
                "minimax_h3_i2v"
            } else {
                "minimax_h3_t2v"
            };
            let operation = if has_start_frame && has_reference_frames {
                "first_last_frame_to_video"
            } else if has_reference_frames {
                "reference_to_video"
            } else if has_start_frame {
                "image_to_video"
            } else {
                "text_to_video"
            };
            let duration_ms = job.input_json.get("budget").and_then(|value| value.get("maxDurationMs")).and_then(Value::as_u64).unwrap_or(90_000).clamp(1_000, 90_000);
            let checkpoint_path = root_path.join("derived/.checkpoints").join(format!("{}.json", job.id));
            let source_revision = job.input_json.get("shotRevision").and_then(Value::as_str).unwrap_or("shot-v1").to_string();
            write_checkpoint_atomic(&checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision: expected_binding_revision, source_fingerprint: source_revision.clone(), stage: "planned".into(), output_relative_name: None, remote_execution_id: None })?;
            let callback_checkpoint_path = checkpoint_path.clone();
            let callback_job_id = job.id.clone();
            let callback_root_id = root.root_id.clone();
            let callback_source_revision = source_revision.clone();
            let (materialized_start_frame, materialized_reference_frames) = materialize_shot_inputs(
                &root_path,
                &control_plane,
                &job,
                series_id,
                &start_frame,
                &reference_frames,
            ).await?;
            let mcp_arguments = json!({
                    "workflowId": workflow_id,
                    "operation": operation,
                    "startFrame": materialized_start_frame,
                    "referenceFrames": materialized_reference_frames,
                    "durationMs": duration_ms,
                    "aspectRatio": "9:16",
                    "modelRoute": model_route,
                    "intent": workflow_request.get("intent"),
                    "shotId": job.input_json.get("shotId"),
                    "episodeId": job.input_json.get("episodeId"),
                    "outputDir": "derived",
                    "inputRoot": format!("derived/.inputs/{}", job.id)
                });
            let result = match comfy_profile.transport {
                ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
                    let command = comfy_profile.command.clone().ok_or_else(|| "comfy_profile_command_missing".to_string())?;
                    let managed_command_path = (matches!(comfy_profile.transport, ComfyTransportKind::LocalStdio)
                        && crate::comfy_mcp_runtime::normalize_command(&command)
                            == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                        .then(|| crate::comfy_mcp_runtime::managed_command_path(app_data_dir))
                        .flatten();
                    if !command_available_with_path(&command, managed_command_path.as_deref()) { return Err("comfy_mcp_unavailable".into()); }
                    run_workflow_with_lifecycle(
                        &ComfyMcpConfig { command, managed_command_path, args: if matches!(comfy_profile.transport, ComfyTransportKind::SelfHostedStdioBridge) { resolve_bridge_args(&comfy_profile.args, comfy_profile.endpoint.as_deref().ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?)? } else { comfy_profile.args.clone() }, timeout_ms: 10 * 60 * 1000 },
                        mcp_arguments,
                        cancel,
                        move |execution_id| {
                            let _ = write_checkpoint_atomic(&callback_checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: callback_job_id.clone(), root_id: callback_root_id.clone(), binding_revision: expected_binding_revision, source_fingerprint: callback_source_revision.clone(), stage: "remote_submitted".into(), output_relative_name: None, remote_execution_id: Some(execution_id.to_string()) });
                        },
                    ).await?
                }
                ComfyTransportKind::SelfHostedHttpMcp | ComfyTransportKind::ComfyCloud | ComfyTransportKind::SshTunnel => {
                    let ssh_key = if matches!(&comfy_profile.transport, ComfyTransportKind::SshTunnel) { Some(crate::comfy_credentials::resolve(comfy_profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) } else { None };
                    let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() { Some(crate::comfy_ssh_tunnel::open_with_identity(&comfy_profile.args, key)?) } else { None };
                    let endpoint = comfy_profile.endpoint.clone().ok_or_else(|| "comfy_endpoint_missing".to_string())?;
                    let token = if matches!(&comfy_profile.transport, ComfyTransportKind::SshTunnel) || comfy_profile.credential_kind == ComfyCredentialKind::None { None } else { Some(crate::comfy_credentials::resolve(comfy_profile.credential_ref.as_deref().ok_or_else(|| "comfy_credential_ref_missing".to_string())?)?) };
                    let mut transport = ComfyHttpMcpTransport::new(endpoint, token, Duration::from_secs(10 * 60))?;
                    transport.run_workflow_with_lifecycle(mcp_arguments, Arc::clone(cancel)).await?
                }
            };
            let remote_execution_id = extract_mcp_execution_id(&result);
            write_checkpoint_atomic(&checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision: expected_binding_revision, source_fingerprint: source_revision.clone(), stage: "remote_completed".into(), output_relative_name: None, remote_execution_id: remote_execution_id.clone() })?;
            let output_name = extract_mcp_artifact_path(&result);
            let output_url = extract_mcp_artifact_url(&result);
            let output = if let Some(output_name) = output_name {
                if output_name.trim().is_empty() || output_name.starts_with('/') || output_name.contains('\\') || output_name.split('/').any(|part| part == "..") { return Err("comfy_mcp_output_invalid".into()); }
                root_path.join(&output_name).canonicalize().map_err(|_| "comfy_mcp_output_missing".to_string())?
            } else if let Some(output_url) = output_url {
                let output_workspace = root_path.join("derived").join(".mcp-downloads").join(sanitize_segment(&job.id));
                fs::create_dir_all(&output_workspace).map_err(|_| "comfy_mcp_workspace_failed".to_string())?;
                download_mcp_output(&output_url, &output_workspace).await?
            } else {
                return Err("comfy_mcp_output_missing".into());
            };
            if !output.starts_with(root_path.join("derived")) { return Err("derived_output_scope_violation".into()); }
            let qc = qc_derived_output_with_probe(&root_path, &output, &media_tools)?;
            ensure_portrait_9x16_qc(&qc)?;
            let artifact = upload_worker_artifact_file_with_refresh(app_data_dir, connection, &job.id, "shot_video", &output, output.file_name().and_then(|name| name.to_str()).unwrap_or("shot-video.mp4"), "video/mp4", &job.lease_owner_token, &job.assignment_attempt, json!({ "qc": qc, "shotId": job.input_json.get("shotId"), "episodeId": job.input_json.get("episodeId"), "workflowId": workflow_id })).await?;
            let artifact_id = artifact.artifact.get("id").and_then(Value::as_str).ok_or_else(|| "artifact_id_missing".to_string())?;
            let source_asset_id = format!("shot-{}", job.input_json.get("shotId").and_then(Value::as_str).unwrap_or("unknown"));
            let qc_json = json!({ "qcVersion": "media-qc.v1", "passed": qc.passed, "durationMs": qc.duration_ms.unwrap_or(0), "width": qc.width.ok_or_else(|| "qc_failed".to_string())?, "height": qc.height.ok_or_else(|| "qc_failed".to_string())?, "hasAudio": qc.has_audio.unwrap_or(false), "checksum": qc.checksum, "checks": [{ "code": "mcp_output", "passed": true, "messageKey": "mcp_derived_output_verified" }], "failureCode": Value::Null });
            let publication_payload = json!({ "jobId": job.id, "workerArtifactId": artifact_id, "bindingRevision": expected_binding_revision, "artifact": { "artifactId": artifact_id, "artifactRevision": source_revision, "kind": "shot_video", "storageKey": artifact_id, "checksum": qc.checksum, "sizeBytes": qc.size_bytes, "contentType": "video/mp4", "durationMs": qc.duration_ms, "qc": qc_json, "sourceAssetId": source_asset_id, "sourceRevision": source_revision, "intelligence": { "tags": ["generated-shot", workflow_id], "subjects": [], "scenes": [], "silenceSegments": [], "focusTrack": [], "transform": { "aspectRatio": "9:16", "trackingMode": if has_reference_frames { "manual_keyframes" } else { "center_fallback" }, "fallback": "reject", "stillMotion": Value::Null } } }, "qc": qc_json });
            let connection_snapshot = refresh_connection_for_control_plane(app_data_dir, connection, "MCP shot publication").await?;
            let publication = publish_vertical_drama_media(&connection_snapshot, series_id, &publication_payload).await?;
            let output_name = output.strip_prefix(&root_path).ok().and_then(|value| value.to_str()).unwrap_or("derived/comfy-output").to_string();
            write_checkpoint_atomic(&checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision: expected_binding_revision, source_fingerprint: source_revision.to_string(), stage: "published".into(), output_relative_name: Some(output_name), remote_execution_id: remote_execution_id.or_else(|| Some(artifact_id.into())) })?;
            send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.completed".into(), sequence_number: 2, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "status": "published", "artifact": artifact.artifact, "qc": qc_json, "publication": publication, "adapter": "comfy_mcp" }) }).await?;
            return Ok(());
        }
        let source = job.input_json.get("source").ok_or_else(|| "media_source_missing".to_string())?;
        let source_name = source.get("relativeName").and_then(Value::as_str).or_else(|| source.get("fileName").and_then(Value::as_str)).ok_or_else(|| "media_source_name_missing".to_string())?;
        let probe = job.input_json.get("probe").cloned().unwrap_or_else(|| json!({}));
        let source_path = resolve_worker_media_source_path(&root_path, source_name)?;
        let local_probe = probe_media_file(&source_path, &media_tools)?;
        let duration_ms = local_probe.duration_ms.or_else(|| probe.get("durationMs").and_then(Value::as_u64)).unwrap_or(90_000);
        let edit_plan = job.input_json.get("editPlan").cloned().unwrap_or_else(|| json!({}));
        let remove_dead_air_requested = edit_plan.get("deadAir").and_then(|value| value.get("enabled")).and_then(Value::as_bool).unwrap_or(false);
        let local_analysis = if kind == "image" {
            None
        } else {
            match analyze_media_file(&source_path, &media_tools) {
                Ok(analysis) => Some(analysis),
                Err(_) if remove_dead_air_requested => return Err("dead_air_detection_failed".into()),
                Err(_) => None,
            }
        };
        let budget = edit_plan.get("budget").cloned().unwrap_or_else(|| json!({}));
        let target = edit_plan.get("segments").and_then(Value::as_array).and_then(|segments| segments.first()).and_then(|segment| segment.get("reframe")).and_then(|reframe| reframe.get("target"));
        let still_motion = edit_plan.get("segments").and_then(Value::as_array).and_then(|segments| segments.first()).and_then(|segment| segment.get("stillMotion")).and_then(|motion| motion.get("motion")).and_then(Value::as_str).map(str::to_string);
        let focus_track = edit_plan.get("segments").and_then(Value::as_array).and_then(|segments| segments.first()).and_then(|segment| segment.get("reframe")).and_then(|value| value.get("focusTrack")).and_then(|value| serde_json::from_value::<Vec<MediaFocusKeyframe>>(value.clone()).ok()).unwrap_or_default();
        let selected_segment = edit_plan.get("segments").and_then(Value::as_array).and_then(|segments| segments.first());
        let options = MediaPlanOptions { remove_dead_air: edit_plan.get("deadAir").and_then(|value| value.get("enabled")).and_then(Value::as_bool).unwrap_or(false), reframe_9x16: edit_plan.get("aspectRatio").and_then(Value::as_str) == Some("9:16"), focus_mode: edit_plan.get("segments").and_then(Value::as_array).and_then(|segments| segments.first()).and_then(|segment| segment.get("reframe")).and_then(|value| value.get("trackingMode")).and_then(Value::as_str).unwrap_or("auto_person").into(), still_motion, max_duration_ms: budget.get("maxDurationMs").and_then(Value::as_u64).unwrap_or(90_000).min(90_000), source_duration_ms: duration_ms, requested_start_ms: selected_segment.and_then(|segment| segment.get("startMs")).and_then(Value::as_u64), requested_end_ms: selected_segment.and_then(|segment| segment.get("endMs")).and_then(Value::as_u64), focus_x: target.and_then(|value| value.get("normalizedX")).and_then(Value::as_f64), focus_y: target.and_then(|value| value.get("normalizedY")).and_then(Value::as_f64), focus_track };
        let plan = build_media_plan(source_name, &options)?;
        let binding_revision = expected_binding_revision;
        let checkpoint_path = root_path.join("derived/.checkpoints").join(format!("{}.json", job.id));
        write_checkpoint_atomic(&checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision, source_fingerprint: source.get("sourceFingerprint").and_then(Value::as_str).unwrap_or_default().into(), stage: "planned".into(), output_relative_name: Some(plan.output_relative_name.clone()), remote_execution_id: None })?;
        send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.progress".into(), sequence_number: 2, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "stage": "local_media_render", "percent": 35 }) }).await?;
        let output = run_allowlisted_ffmpeg(&root_path, &plan, &media_tools)?;
        let qc = qc_derived_output_with_probe(&root_path, &output, &media_tools)?;
        if options.reframe_9x16 {
            ensure_portrait_9x16_qc(&qc)?;
        }
        let assignment_attempt = job.assignment_attempt.as_str();
        let artifact = upload_worker_artifact_file_with_refresh(app_data_dir, connection, &job.id, "normalized_video", &output, output.file_name().and_then(|name| name.to_str()).unwrap_or("normalized-video.mp4"), "video/mp4", &job.lease_owner_token, assignment_attempt, json!({ "qc": qc, "sourceAssetId": source.get("assetId"), "sourceRevision": source.get("sourceRevision"), "rootId": root.root_id })).await?;
        let artifact_id = artifact.artifact.get("id").and_then(Value::as_str).ok_or_else(|| "artifact_id_missing".to_string())?;
        let qc_json = json!({ "qcVersion": "media-qc-v1", "passed": qc.passed, "durationMs": qc.duration_ms.unwrap_or(duration_ms), "width": qc.width.ok_or_else(|| "qc_failed".to_string())?, "height": qc.height.ok_or_else(|| "qc_failed".to_string())?, "hasAudio": qc.has_audio.unwrap_or(local_probe.has_audio), "checksum": qc.checksum, "checks": [{ "code": "output_scope", "passed": true, "messageKey": "derived_output_verified" }], "failureCode": Value::Null });
        let has_focus = options.focus_x.is_some() && options.focus_y.is_some();
        let focus_track = if has_focus {
            json!([{ "timeMs": 0, "normalizedX": options.focus_x.unwrap_or(0.5), "normalizedY": options.focus_y.unwrap_or(0.5), "confidence": 1.0, "method": "user_focus_region" }, { "timeMs": duration_ms.min(options.max_duration_ms), "normalizedX": options.focus_x.unwrap_or(0.5), "normalizedY": options.focus_y.unwrap_or(0.5), "confidence": 1.0, "method": "user_focus_region" }])
        } else {
            json!([])
        };
        let analysis_scenes = local_analysis.as_ref().map(|analysis| analysis.scene_candidates.iter().enumerate().map(|(index, segment)| json!({ "startMs": segment.start_ms, "endMs": segment.end_ms, "label": format!("scene-{}", index + 1), "confidence": segment.confidence })).collect::<Vec<_>>()).unwrap_or_default();
        let analysis_silence = local_analysis.as_ref().map(|analysis| analysis.silence_segments.iter().map(|segment| json!({ "startMs": segment.start_ms, "endMs": segment.end_ms })).collect::<Vec<_>>()).unwrap_or_default();
        let mut intelligence_tags = vec![source.get("kind").and_then(Value::as_str).unwrap_or("media").to_string()];
        if !analysis_silence.is_empty() { intelligence_tags.push("has_dead_air".into()); }
        if !analysis_scenes.is_empty() { intelligence_tags.push("scene_candidates".into()); }
        if local_analysis.as_ref().is_some_and(|analysis| analysis.focus_candidates.iter().any(|candidate| candidate.requires_review)) { intelligence_tags.push("focus_requires_review".into()); }
        let intelligence = json!({ "tags": intelligence_tags, "subjects": if has_focus { vec!["manual_region"] } else { Vec::<&str>::new() }, "scenes": analysis_scenes, "silenceSegments": analysis_silence, "focusTrack": focus_track, "transform": { "aspectRatio": if options.reframe_9x16 { "9:16" } else { "source" }, "trackingMode": if has_focus { "manual_region" } else { "center_fallback" }, "fallback": if options.reframe_9x16 { json!("reject") } else { Value::Null }, "stillMotion": options.still_motion.clone() } });
        let publication_payload = json!({ "jobId": job.id, "workerArtifactId": artifact_id, "bindingRevision": binding_revision, "artifact": { "artifactId": artifact_id, "artifactRevision": plan.plan_id, "kind": "normalized_video", "storageKey": artifact_id, "checksum": qc.checksum, "sizeBytes": qc.size_bytes, "contentType": "video/mp4", "durationMs": qc.duration_ms.unwrap_or(duration_ms), "qc": qc_json, "sourceAssetId": source.get("assetId"), "sourceRevision": source.get("sourceRevision"), "intelligence": intelligence }, "qc": qc_json });
        let connection_snapshot = refresh_connection_for_control_plane(app_data_dir, connection, "media publication").await?;
        let publication = publish_vertical_drama_media(&connection_snapshot, job.input_json.get("seriesId").and_then(Value::as_str).ok_or_else(|| "series_id_missing".to_string())?, &publication_payload).await?;
        write_checkpoint_atomic(&checkpoint_path, &MediaCheckpoint { checkpoint_version: "media-checkpoint.v1".into(), job_id: job.id.clone(), root_id: root.root_id.clone(), binding_revision, source_fingerprint: source.get("sourceFingerprint").and_then(Value::as_str).unwrap_or_default().into(), stage: "published".into(), output_relative_name: Some(plan.output_relative_name.clone()), remote_execution_id: Some(artifact_id.into()) })?;
        send_event_with_refresh(app_data_dir, connection, &job.id, WorkerEventPlan { event_type: "job.completed".into(), sequence_number: 3, lease_owner_token: job.lease_owner_token.clone(), assignment_attempt: job.assignment_attempt.clone(), payload_json: json!({ "status": "published", "artifact": artifact.artifact, "qc": qc_json, "publication": publication }) }).await?;
        Ok(())
    }.await;
    match &result {
        Ok(()) => {
            set_executor_last_job(
                executor,
                &job,
                "success",
                "Local media preprocessing completed.",
                None,
            );
            set_executor_job_complete(executor, &job.id, "Local media preprocessing completed.");
        }
        Err(error) => {
            let failure = build_failure_event(
                &job,
                FAILURE_EVENT_SEQUENCE_NUMBER,
                media_failure_code(error),
                error,
            );
            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
            set_executor_last_job(executor, &job, "error", error, None);
            set_executor_job_error(executor, &job.id, error.clone());
        }
    }
    result
}

fn read_media_binding_projection(value: &Value) -> (Option<u64>, Option<String>) {
    let binding = value.get("binding").or_else(|| value.get("item"));
    (
        binding
            .and_then(|item| item.get("bindingRevision"))
            .and_then(Value::as_u64),
        binding
            .and_then(|item| item.get("status").or_else(|| item.get("bindingStatus")))
            .and_then(Value::as_str)
            .map(str::to_string),
    )
}

/// Preserve the server's typed media failure code when a local media branch
/// fails. The old generic `unsupported_job_type` mapping made valid source,
/// approval and QC failures look like classifier bugs and prevented the UI
/// from offering the right retry/repair action.
fn media_failure_code(error: &str) -> &'static str {
    let code = error.split(':').next().unwrap_or_default().trim();
    const KNOWN_CODES: &[&str] = &[
        "invalid_contract",
        "root_not_bound",
        "root_revision_stale",
        "source_not_stable",
        "unsupported_media",
        "dead_air_detection_failed",
        "focus_track_failed",
        "duration_budget_exceeded",
        "qc_failed",
        "workflow_capability_blocked",
        "artifact_checksum_mismatch",
        "artifact_ownership_failed",
        "publication_rejected",
        "index_enqueue_failed",
        "source_reference_expired",
        "source_fingerprint_mismatch",
        "transcription_unavailable",
        "transcription_failed",
        "unsupported_composition_executor",
        "placement_out_of_bounds",
        "placement_source_not_ready",
        "approval_required",
        "render_contract_mismatch",
    ];
    KNOWN_CODES
        .iter()
        .copied()
        .find(|candidate| *candidate == code)
        .unwrap_or("unsupported_job_type")
}

fn remove_approved_silence(
    segments: &[(u64, u64)],
    silence_ranges: &[(u64, u64)],
    padding_ms: u64,
) -> Vec<(u64, u64)> {
    const MIN_RENDER_SEGMENT_MS: u64 = 250;
    let mut result = Vec::new();
    for &(segment_start, segment_end) in segments {
        let mut cursor = segment_start;
        let mut silences = silence_ranges
            .iter()
            .filter_map(|&(silence_start, silence_end)| {
                let start = silence_start.max(segment_start);
                let end = silence_end.min(segment_end);
                (end > start).then_some((start, end))
            })
            .collect::<Vec<_>>();
        silences.sort_unstable();
        for (silence_start, silence_end) in silences {
            let cut_start = silence_start.saturating_sub(padding_ms).max(segment_start);
            let cut_end = silence_end.saturating_add(padding_ms).min(segment_end);
            if cut_start > cursor && cut_start - cursor >= MIN_RENDER_SEGMENT_MS {
                result.push((cursor, cut_start));
            }
            cursor = cursor.max(cut_end);
        }
        if segment_end > cursor && segment_end - cursor >= MIN_RENDER_SEGMENT_MS {
            result.push((cursor, segment_end));
        }
    }
    result
}

async fn execute_comfy_job_inner(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    if job.input_json.get("adapter").and_then(Value::as_str) == Some("comfy_mcp")
        || job.input_json.get("connectionResolution").is_some()
    {
        return execute_comfy_mcp_job(
            executor,
            resource_dir,
            app_data_dir,
            connection,
            job,
            settings,
            cancel,
        )
        .await;
    }
    let service_input = job.input_json.get("service");
    let service = comfy_executor::ComfyServiceBinding {
        base_url: service_input
            .and_then(|value| value.get("baseUrl"))
            .and_then(Value::as_str)
            .unwrap_or(settings.comfyui_base_url.as_str())
            .to_string(),
        submit_path: service_input
            .and_then(|value| value.get("submitPath"))
            .and_then(Value::as_str)
            .unwrap_or("/prompt")
            .to_string(),
        history_path_template: service_input
            .and_then(|value| value.get("historyPathTemplate"))
            .and_then(Value::as_str)
            .unwrap_or("/history/{promptId}")
            .to_string(),
        view_path: service_input
            .and_then(|value| value.get("viewPath"))
            .and_then(Value::as_str)
            .unwrap_or("/view")
            .to_string(),
        client_id: service_input
            .and_then(|value| value.get("clientId"))
            .and_then(Value::as_str)
            .map(str::to_string),
        poll_interval_ms: service_input
            .and_then(|value| value.get("pollIntervalMs"))
            .and_then(Value::as_u64)
            .unwrap_or(2_000),
        timeout_seconds: service_input
            .and_then(|value| value.get("timeoutSeconds"))
            .and_then(Value::as_u64)
            .unwrap_or(600),
    };
    comfy_executor::validate_registered_service(&service.base_url, &settings.comfyui_base_url)?;
    let workflow = job
        .input_json
        .get("workflowJson")
        .and_then(Value::as_object)
        .ok_or_else(|| "ComfyUI workflowJson must be an object".to_string())?;
    let max_outputs = job
        .input_json
        .get("outputTargets")
        .and_then(|value| {
            value
                .get("maxImages")
                .or_else(|| value.get("maxOutputFiles"))
        })
        .and_then(Value::as_u64)
        .unwrap_or(8) as usize;
    let workspace_root = workspace_root(settings, resource_dir, app_data_dir)?;
    let workspace = workspace_root.join(sanitize_segment(&job.id));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("failed to create ComfyUI workspace: {error}"))?;
    let mut next_sequence = 1u32;
    for (stage, percent, message) in [
        (
            "validate_service",
            5,
            "Checking the registered local ComfyUI service.",
        ),
        (
            "submit_workflow",
            15,
            "Submitting the typed workflow to ComfyUI.",
        ),
    ] {
        let event = build_comfy_progress_event(job, next_sequence, stage, percent, Some(message))
            .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event,
            &mut next_sequence,
        )
        .await?;
    }
    update_executor_progress(executor, &job.id, 20, "Running ComfyUI workflow.");
    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings.runtime_dir.trim())
    };
    let ffprobe_mode = if settings.runtime_environment.is_managed_wsl() {
        ProductionFfprobeMode::ManagedWsl {
            runtime_root: settings.managed_wsl_root.clone(),
        }
    } else {
        let executable = if cfg!(target_os = "windows") {
            "ffprobe.exe"
        } else {
            "ffprobe"
        };
        ProductionFfprobeMode::Native(
            effective_runtime_dir
                .join("runtime-pack")
                .join("bin")
                .join(executable),
        )
    };
    let ffprobe = production_ffprobe(ffprobe_mode);
    let result = comfy_executor::execute_workflow(
        &service,
        workflow,
        &workspace,
        cancel,
        max_outputs,
        &ffprobe,
    )
    .await?;
    let poll_event = build_comfy_progress_event(
        job,
        next_sequence,
        "poll_execution",
        65,
        Some("ComfyUI execution completed."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        poll_event,
        &mut next_sequence,
    )
    .await?;
    let collect_event = build_comfy_progress_event(
        job,
        next_sequence,
        "collect_outputs",
        75,
        Some("Validating ComfyUI outputs."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        collect_event,
        &mut next_sequence,
    )
    .await?;

    let mut artifacts = Vec::new();
    for file in result.files {
        let upload_event = build_comfy_progress_event(
            job,
            next_sequence,
            "upload_artifacts",
            85,
            Some("Uploading a verified artifact."),
        )
        .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            upload_event,
            &mut next_sequence,
        )
        .await?;
        let artifact_type = if file.content_type.starts_with("video/") {
            "comfy_video_output"
        } else {
            "comfy_image_output"
        };
        let uploaded = upload_worker_artifact_file_with_refresh(
            app_data_dir,
            connection,
            &job.id,
            artifact_type,
            &file.path,
            &file.file_name,
            &file.content_type,
            &job.lease_owner_token,
            &job.assignment_attempt,
            json!({ "promptId": result.prompt_id, "contentType": file.content_type }),
        )
        .await
        .map_err(|error| format!("artifact upload failed: {error}"))?;
        artifacts.push(json!({
            "artifactType": artifact_type,
            "fileName": file.file_name,
            "contentType": file.content_type,
            "artifact": uploaded.artifact,
        }));
    }
    let publish_event = build_comfy_progress_event(
        job,
        next_sequence,
        "publish_artifacts",
        95,
        Some("Artifacts accepted by SmartAIHub."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        publish_event,
        &mut next_sequence,
    )
    .await?;
    let index_event = build_comfy_progress_event(
        job,
        next_sequence,
        "trigger_indexing",
        100,
        Some("ComfyUI outputs are ready."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        index_event,
        &mut next_sequence,
    )
    .await?;
    let completed = build_comfy_completed_event(
        job,
        next_sequence,
        json!({ "promptId": result.prompt_id, "artifacts": artifacts }),
    );
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        completed,
        &mut next_sequence,
    )
    .await?;
    Ok(())
}

async fn execute_comfy_mcp_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let selected_id = job
        .input_json
        .get("connectionResolution")
        .and_then(|value| value.get("selectedProfileId"))
        .and_then(Value::as_str);
    let profile = active_comfy_profile(app_data_dir, settings, selected_id)?;
    let workflow_id = job
        .input_json
        .get("workflowResolution")
        .and_then(|value| {
            value
                .get("workflowId")
                .or_else(|| value.get("selectedWorkflowId"))
        })
        .and_then(Value::as_str)
        .or_else(|| job.input_json.get("workflowId").and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "comfy_workflow_id_missing".to_string())?;
    let mut arguments = job.input_json.get("mcpArguments").cloned().unwrap_or_else(|| json!({
        "workflowId": workflow_id,
        "inputs": job.input_json.get("inputs").cloned().unwrap_or_else(|| json!({})),
        "outputPolicy": job.input_json.get("outputPolicy").cloned().unwrap_or_else(|| json!({ "saveLocally": true })),
    }));
    if let Some(object) = arguments.as_object_mut() {
        object
            .entry("workflowId")
            .or_insert_with(|| json!(workflow_id));
    }
    if arguments.get("workflowId").and_then(Value::as_str) != Some(workflow_id) {
        return Err("comfy_workflow_resolution_mismatch".into());
    }
    let workspace_root = workspace_root(settings, resource_dir, app_data_dir)?;
    let workspace = workspace_root
        .join("comfy-mcp")
        .join(sanitize_segment(&job.id));
    fs::create_dir_all(&workspace).map_err(|_| "comfy_mcp_workspace_failed".to_string())?;
    let mut sequence = 1_u32;
    for (stage, percent, message) in [
        (
            "validate_service",
            5,
            "Checking the selected ComfyUI MCP connection.",
        ),
        (
            "submit_workflow",
            15,
            "Submitting the resolved workflow through MCP.",
        ),
    ] {
        let event = build_comfy_progress_event(job, sequence, stage, percent, Some(message))
            .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event,
            &mut sequence,
        )
        .await?;
    }
    update_executor_progress(
        executor,
        &job.id,
        20,
        "Running ComfyUI workflow through MCP.",
    );
    let mut ledger = ExecutionLedger::load(app_data_dir)?;
    let profile_revision = profile.profile_revision;
    let workflow_version = job
        .input_json
        .get("workflowResolution")
        .and_then(|value| value.get("version"))
        .and_then(Value::as_str)
        .unwrap_or("unversioned")
        .to_string();
    let now = format!("{:?}", SystemTime::now());
    ledger.upsert(ExecutionLedgerEntry {
        job_id: job.id.clone(),
        attempt: job.assignment_attempt.clone(),
        profile_id: profile.profile_id.clone(),
        profile_revision,
        workflow_version: workflow_version.clone(),
        remote_execution_id: None,
        state: ExecutionLedgerState::Claimed,
        event_sequence: sequence as u64,
        output_fingerprints: Vec::new(),
        upload_session_id: None,
        updated_at: now,
    })?;
    let remote_execution_id = Arc::new(Mutex::new(None::<String>));
    let record_execution_id = {
        let remote_execution_id = Arc::clone(&remote_execution_id);
        move |execution_id: &str| {
            if let Ok(mut recorded) = remote_execution_id.lock() {
                *recorded = Some(execution_id.to_string());
            }
        }
    };
    let result = match profile.transport {
        ComfyTransportKind::LocalStdio | ComfyTransportKind::SelfHostedStdioBridge => {
            let command = profile
                .command
                .clone()
                .ok_or_else(|| "comfy_profile_command_missing".to_string())?;
            let managed_command_path =
                (matches!(profile.transport, ComfyTransportKind::LocalStdio)
                    && crate::comfy_mcp_runtime::normalize_command(&command)
                        == crate::comfy_mcp_runtime::STANDARD_COMMAND)
                    .then(|| crate::comfy_mcp_runtime::managed_command_path(app_data_dir))
                    .flatten();
            if !command_available_with_path(&command, managed_command_path.as_deref()) {
                return Err("comfy_mcp_unavailable".into());
            }
            let args = if matches!(profile.transport, ComfyTransportKind::SelfHostedStdioBridge) {
                resolve_bridge_args(
                    &profile.args,
                    profile
                        .endpoint
                        .as_deref()
                        .ok_or_else(|| "comfy_bridge_endpoint_missing".to_string())?,
                )?
            } else {
                profile.args.clone()
            };
            run_generic_workflow_with_lifecycle(
                &ComfyMcpConfig {
                    command,
                    managed_command_path,
                    args,
                    timeout_ms: job_timeout_ms(job),
                },
                arguments,
                cancel,
                record_execution_id,
            )
            .await
        }
        ComfyTransportKind::SelfHostedHttpMcp
        | ComfyTransportKind::ComfyCloud
        | ComfyTransportKind::SshTunnel => {
            let ssh_key = if matches!(&profile.transport, ComfyTransportKind::SshTunnel) {
                Some(crate::comfy_credentials::resolve(
                    profile
                        .credential_ref
                        .as_deref()
                        .ok_or_else(|| "comfy_credential_ref_missing".to_string())?,
                )?)
            } else {
                None
            };
            let _ssh_tunnel = if let Some(key) = ssh_key.as_deref() {
                Some(crate::comfy_ssh_tunnel::open_with_identity(
                    &profile.args,
                    key,
                )?)
            } else {
                None
            };
            let endpoint = profile
                .endpoint
                .clone()
                .ok_or_else(|| "comfy_endpoint_missing".to_string())?;
            let token = if matches!(&profile.transport, ComfyTransportKind::SshTunnel)
                || profile.credential_kind == ComfyCredentialKind::None
            {
                None
            } else {
                Some(crate::comfy_credentials::resolve(
                    profile
                        .credential_ref
                        .as_deref()
                        .ok_or_else(|| "comfy_credential_ref_missing".to_string())?,
                )?)
            };
            let mut transport = ComfyHttpMcpTransport::new(
                endpoint,
                token,
                Duration::from_millis(job_timeout_ms(job)),
            )?;
            transport
                .run_workflow_with_lifecycle_and_callback(
                    arguments,
                    Arc::clone(cancel),
                    record_execution_id,
                )
                .await
        }
    };
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            let _ = ledger.upsert(ExecutionLedgerEntry {
                job_id: job.id.clone(),
                attempt: job.assignment_attempt.clone(),
                profile_id: profile.profile_id.clone(),
                profile_revision: profile.profile_revision,
                workflow_version: workflow_version.clone(),
                remote_execution_id: None,
                state: ExecutionLedgerState::Failed,
                event_sequence: sequence as u64,
                output_fingerprints: Vec::new(),
                upload_session_id: None,
                updated_at: format!("{:?}", SystemTime::now()),
            });
            return Err(error);
        }
    };
    let recorded_execution_id = remote_execution_id
        .lock()
        .ok()
        .and_then(|value| value.clone())
        .or_else(|| extract_mcp_execution_id(&result));
    if let Some(execution_id) = recorded_execution_id.as_ref() {
        let now = format!("{:?}", SystemTime::now());
        ledger.upsert(ExecutionLedgerEntry {
            job_id: job.id.clone(),
            attempt: job.assignment_attempt.clone(),
            profile_id: profile.profile_id.clone(),
            profile_revision: profile.profile_revision,
            workflow_version: job
                .input_json
                .get("workflowResolution")
                .and_then(|value| value.get("version"))
                .and_then(Value::as_str)
                .unwrap_or("unversioned")
                .into(),
            remote_execution_id: Some(execution_id.clone()),
            state: ExecutionLedgerState::Collected,
            event_sequence: sequence as u64,
            output_fingerprints: Vec::new(),
            upload_session_id: None,
            updated_at: now,
        })?;
    }
    let output_path = extract_mcp_artifact_path(&result);
    let output_url = extract_mcp_artifact_url(&result);
    let local_path = if let Some(path) = output_path {
        let candidate = if Path::new(&path).is_absolute() {
            PathBuf::from(path)
        } else {
            workspace.join(path)
        };
        validate_workspace_path(&workspace, &candidate)?;
        candidate
            .canonicalize()
            .map_err(|_| "comfy_mcp_output_missing".to_string())?
    } else if let Some(url) = output_url {
        download_mcp_output(&url, &workspace).await?
    } else {
        return Err("comfy_mcp_output_missing".into());
    };
    if !local_path.is_file() {
        return Err("comfy_mcp_output_missing".into());
    }
    let digest = file_sha256(&local_path)?;
    let file_name = local_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("comfy-output.bin")
        .to_string();
    let content_type = content_type_for_file(&file_name);
    let upload_library = job
        .input_json
        .get("outputPolicy")
        .and_then(|value| value.get("uploadLibrary"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    if !upload_library {
        update_executor_progress(
            executor,
            &job.id,
            95,
            &format!("Saved locally: {}", local_path.display()),
        );
        ledger.upsert(ExecutionLedgerEntry {
            job_id: job.id.clone(),
            attempt: job.assignment_attempt.clone(),
            profile_id: profile.profile_id.clone(),
            profile_revision: profile.profile_revision,
            workflow_version,
            remote_execution_id: recorded_execution_id.clone(),
            state: ExecutionLedgerState::Saved,
            event_sequence: sequence as u64,
            output_fingerprints: vec![digest.clone()],
            upload_session_id: None,
            updated_at: format!("{:?}", SystemTime::now()),
        })?;
        send_progress_event_with_next_sequence(app_data_dir, connection, &job.id, build_comfy_completed_event(job, sequence, json!({ "status": "saved_locally", "profileId": profile.profile_id, "workflowId": workflow_id, "fileName": file_name, "contentType": content_type, "sha256": digest })), &mut sequence).await?;
        return Ok(());
    }
    ledger.upsert(ExecutionLedgerEntry {
        job_id: job.id.clone(),
        attempt: job.assignment_attempt.clone(),
        profile_id: profile.profile_id.clone(),
        profile_revision: profile.profile_revision,
        workflow_version: workflow_version.clone(),
        remote_execution_id: recorded_execution_id.clone(),
        state: ExecutionLedgerState::Saved,
        event_sequence: sequence as u64,
        output_fingerprints: vec![digest.clone()],
        upload_session_id: None,
        updated_at: format!("{:?}", SystemTime::now()),
    })?;
    let collect = build_comfy_progress_event(
        job,
        sequence,
        "collect_outputs",
        75,
        Some("Validating the local ComfyUI output."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        collect,
        &mut sequence,
    )
    .await?;
    let upload = build_comfy_progress_event(
        job,
        sequence,
        "upload_artifacts",
        85,
        Some("Uploading the verified artifact."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        upload,
        &mut sequence,
    )
    .await?;
    let uploaded = match upload_worker_artifact_file_with_refresh(
        app_data_dir,
        connection,
        &job.id,
        if content_type.starts_with("video/") {
            "comfy_video_output"
        } else {
            "comfy_image_output"
        },
        &local_path,
        &file_name,
        content_type,
        &job.lease_owner_token,
        &job.assignment_attempt,
        json!({ "sha256": digest, "profileId": profile.profile_id, "workflowId": workflow_id }),
    )
    .await
    {
        Ok(uploaded) => uploaded,
        Err(error) => {
            let _ = ledger.upsert(ExecutionLedgerEntry {
                job_id: job.id.clone(),
                attempt: job.assignment_attempt.clone(),
                profile_id: profile.profile_id.clone(),
                profile_revision: profile.profile_revision,
                workflow_version: workflow_version.clone(),
                remote_execution_id: recorded_execution_id.clone(),
                state: ExecutionLedgerState::Failed,
                event_sequence: sequence as u64,
                output_fingerprints: vec![digest.clone()],
                upload_session_id: None,
                updated_at: format!("{:?}", SystemTime::now()),
            });
            return Err(format!("artifact upload failed: {error}"));
        }
    };
    ledger.upsert(ExecutionLedgerEntry {
        job_id: job.id.clone(),
        attempt: job.assignment_attempt.clone(),
        profile_id: profile.profile_id.clone(),
        profile_revision: profile.profile_revision,
        workflow_version,
        remote_execution_id: recorded_execution_id.clone(),
        state: ExecutionLedgerState::Published,
        event_sequence: sequence as u64,
        output_fingerprints: vec![digest.clone()],
        upload_session_id: None,
        updated_at: format!("{:?}", SystemTime::now()),
    })?;
    let publish = build_comfy_progress_event(
        job,
        sequence,
        "publish_artifacts",
        95,
        Some("ComfyUI artifact accepted by SmartAIHub."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        publish,
        &mut sequence,
    )
    .await?;
    let index = build_comfy_progress_event(
        job,
        sequence,
        "trigger_indexing",
        100,
        Some("ComfyUI output is ready."),
    )
    .ok_or_else(|| "invalid ComfyUI progress stage".to_string())?;
    send_progress_event_with_next_sequence(app_data_dir, connection, &job.id, index, &mut sequence)
        .await?;
    send_progress_event_with_next_sequence(app_data_dir, connection, &job.id, build_comfy_completed_event(job, sequence, json!({ "profileId": profile.profile_id, "workflowId": workflow_id, "artifacts": [{ "fileName": file_name, "contentType": content_type, "sha256": digest, "artifact": uploaded.artifact }] })), &mut sequence).await?;
    Ok(())
}

fn job_timeout_ms(job: &ClaimedWorkerJob) -> u64 {
    job.input_json
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(10 * 60 * 1000)
        .clamp(5_000, 60 * 60 * 1000)
}

fn content_type_for_file(file_name: &str) -> &'static str {
    match Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "webm" | "mov" | "mkv" => "video/mp4",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn safe_output_extension(url: &reqwest::Url, content_type: Option<&str>) -> &'static str {
    let from_path = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|name| Path::new(name).extension().and_then(|value| value.to_str()))
        .map(str::to_ascii_lowercase);
    match from_path.as_deref() {
        Some("mp4") | Some("webm") | Some("mov") | Some("mkv") => "mp4",
        Some("jpg") | Some("jpeg") => "jpg",
        Some("png") => "png",
        Some("webp") => "webp",
        _ => match content_type
            .unwrap_or_default()
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
        {
            "video/webm" => "webm",
            "video/quicktime" => "mov",
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => "bin",
        },
    }
}

async fn download_mcp_output(url: &str, workspace: &Path) -> Result<PathBuf, String> {
    let parsed =
        reqwest::Url::parse(url).map_err(|_| "comfy_mcp_output_url_invalid".to_string())?;
    if parsed.scheme() != "https"
        && !matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
    {
        return Err("comfy_mcp_output_url_invalid".into());
    }
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(30 * 60))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "comfy_mcp_output_download_failed".to_string())?
        .get(parsed.clone())
        .send()
        .await
        .map_err(|_| "comfy_mcp_output_download_failed".to_string())?;
    if !response.status().is_success() {
        return Err("comfy_mcp_output_download_failed".into());
    }
    if response
        .content_length()
        .is_some_and(|size| size > 4 * 1024 * 1024 * 1024)
    {
        return Err("comfy_mcp_output_too_large".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    let extension = safe_output_extension(&parsed, content_type);
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "comfy_mcp_output_download_failed".to_string())?;
    if bytes.is_empty() {
        return Err("comfy_mcp_output_empty".into());
    }
    let path = workspace.join(format!("comfy-output.{extension}"));
    fs::write(&path, bytes).map_err(|_| "comfy_mcp_output_write_failed".to_string())?;
    Ok(path)
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 §11 FIX 1/2 — hermes media job dispatch, wired to REAL
// production deps (spawn_hermes_process, reqwest reference download/refresh,
// upload_worker_artifact_file, report_worker_job_event) via
// `execute_hermes_media_job_core`. All blocking + `block_on`-bridged network
// I/O runs inside `spawn_blocking` (never on the main async executor thread).
// ────────────────────────────────────────────────────────────────────────

async fn execute_hermes_media_job(
    executor: &Arc<Mutex<ExecutorState>>,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    hermes_doctor: &DoctorSummary,
    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
    settings: &WorkerAppSettings,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    let connection_snapshot = clone_connection(connection)?;

    let result = execute_hermes_media_job_inner(
        app_data_dir,
        &connection_snapshot,
        &job,
        hermes_doctor,
        hermes_profiles,
        settings,
    )
    .await;

    match &result {
        Ok(()) => {
            set_executor_last_job(
                executor,
                &job,
                "success",
                "Hermes media job completed and artifacts uploaded.",
                None,
            );
            set_executor_job_complete(
                executor,
                &job.id,
                "Hermes media job completed and artifacts uploaded.",
            );
        }
        Err(error) => {
            let failure = build_failure_event(
                &job,
                FAILURE_EVENT_SEQUENCE_NUMBER,
                "hermes_media_failed",
                error,
            );
            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
            let error_msg = format!("Hermes media job failed: {error}");
            set_executor_last_job(executor, &job, "error", &error_msg, None);
            set_executor_job_error(executor, &job.id, error_msg);
        }
    }
    result
}

async fn execute_hermes_media_job_inner(
    app_data_dir: &Path,
    connection: &WorkerLoopConnection,
    job: &ClaimedWorkerJob,
    hermes_doctor: &DoctorSummary,
    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
    settings: &WorkerAppSettings,
) -> Result<(), String> {
    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
    let manifest = read_hermes_runtime_manifest(&manifest_path)
        .map_err(|error| format!("hermes runtime manifest unavailable: {error}"))?;
    let hermes_python_executable = pack_root.join(&manifest.python_relative_path);

    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings.runtime_dir.trim())
    };
    // Reuse the render runtime pack's bundled ffprobe. Managed WSL binaries
    // must be launched through wsl.exe; they are not Windows executables.
    let ffprobe_mode = if settings.runtime_environment.is_managed_wsl() {
        ProductionFfprobeMode::ManagedWsl {
            runtime_root: settings.managed_wsl_root.clone(),
        }
    } else {
        ProductionFfprobeMode::Native(effective_runtime_dir.join("runtime-pack").join("bin").join(
            if cfg!(target_os = "windows") {
                "ffprobe.exe"
            } else {
                "ffprobe"
            },
        ))
    };

    let workspace_base = if !settings.workspace_dir.trim().is_empty() {
        PathBuf::from(settings.workspace_dir.trim())
    } else {
        app_data_dir.join("worker-workspace")
    };
    fs::create_dir_all(&workspace_base)
        .map_err(|error| format!("failed to create hermes workspace: {error}"))?;
    let hermes_workspace_root = workspace_base.join("hermes-jobs");

    let job_started_at = SystemTime::now();
    let job_segment = sanitize_segment(&job.id);
    let tmp_dir = hermes_workspace_root.join(&job_segment).join("tmp");

    let (forbidden_roots, cache_dirs) = {
        let profiles = hermes_profiles
            .lock()
            .map_err(|_| "hermes profile store lock poisoned".to_string())?;
        let connection_id = job
            .capability_requirements_json
            .get("connectionId")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                "Hermes media job is missing capabilityRequirementsJson.connectionId".to_string()
            })?;
        let profile_dir = profiles.profile_dir(connection_id)?;
        (
            vec![profiles.root().to_path_buf()],
            vec![
                profile_dir.join("cache").join("images"),
                profile_dir.join("cache").join("videos"),
            ],
        )
    };

    let job_owned = job.clone();
    let doctor_owned = hermes_doctor.clone();
    let profiles_arc = hermes_profiles.clone();
    let workspace_root_owned = hermes_workspace_root.clone();

    let reference_urls = job.reference_urls.clone();
    let refresh_closure = build_production_refresh_closure(
        connection.clone(),
        job.id.clone(),
        job.lease_owner_token.clone(),
    );
    let download_reference =
        move |reference: &crate::hermes_executor::HermesJobReference| -> Result<PathBuf, HermesFailure> {
            let url = reference_urls
                .iter()
                .find(|entry| entry.asset_id == reference.asset_id)
                .map(|entry| entry.url.clone())
                .ok_or_else(|| HermesFailure {
                    code: "HERMES_REFERENCE_DOWNLOAD_FAILED".to_string(),
                    message: format!("no referenceUrl for asset {}", reference.asset_id),
                })?;
            download_and_verify_reference(
                &reference.asset_id,
                &url,
                &reference.sha256,
                &tmp_dir,
                &production_fetch_reference,
                &refresh_closure,
            )
        };

    let spawn_closure =
        move |argv: &[String],
              cwd: &Path,
              env: &HashMap<String, String>,
              timeouts: crate::hermes_executor::HermesSpawnTimeouts| {
            spawn_hermes_process(
                &hermes_python_executable,
                argv,
                cwd,
                env,
                timeouts,
                &mut |_line: &str| {},
                &mut || {
                    // FIX F — soft timeout notification. No dedicated event
                    // channel exists yet for this (spec: "logged/reported via
                    // onSoftTimeout, never kills"); the hard/inactivity timers
                    // below are what actually protect the job slot.
                },
            )
        };
    let ffprobe_closure = production_ffprobe(ffprobe_mode);

    let connection_for_upload = connection.clone();
    let job_for_upload = job.clone();
    let mut upload_fn =
        move |output: &crate::hermes_executor::CollectedOutput| -> Result<(), String> {
            let artifact_type = if output.kind == "video" {
                "hermes_media_video"
            } else {
                "hermes_media_image"
            };
            let file_name = output
                .path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("output.bin")
                .to_string();
            let content_type = output.content_type.clone();
            let path = output.path.clone();
            let connection = connection_for_upload.clone();
            let job = job_for_upload.clone();
            tauri::async_runtime::block_on(async move {
                upload_worker_artifact_file(
                    &connection,
                    &job.id,
                    artifact_type,
                    &path,
                    &file_name,
                    &content_type,
                    &job.lease_owner_token,
                    &job.assignment_attempt,
                    json!({}),
                )
                .await
                .map(|_| ())
            })
        };

    let connection_for_progress = connection.clone();
    let job_for_progress = job.clone();
    let mut sequence_number: u32 = 1;
    let mut emit_fn = move |stage: &str| {
        let connection = connection_for_progress.clone();
        let job = job_for_progress.clone();
        let stage = stage.to_string();
        let seq = sequence_number;
        sequence_number = sequence_number.saturating_add(1);
        let _ = tauri::async_runtime::block_on(async move {
            report_worker_job_event(
                &connection,
                &job.id,
                &WorkerJobEventPayload {
                    event_type: "job.progress".to_string(),
                    payload_json: json!({ "stage": stage }),
                    sequence_number: Some(seq),
                    lease_owner_token: job.lease_owner_token.clone(),
                    assignment_attempt: Some(job.assignment_attempt.clone()),
                },
            )
            .await
        });
    };

    let blocking_result = tauri::async_runtime::spawn_blocking(move || {
        let profiles_guard = profiles_arc.lock().map_err(|_| HermesFailure {
            code: "HERMES_PROCESS_FAILED".to_string(),
            message: "hermes profile store lock poisoned".to_string(),
        })?;
        let mut deps = HermesMediaJobDeps {
            download_reference: &download_reference,
            fetch_output: &production_fetch_hermes_media,
            spawn: &spawn_closure,
            ffprobe: &ffprobe_closure,
            upload_artifact: &mut upload_fn,
            emit_stage: &mut emit_fn,
        };
        execute_hermes_media_job_core(
            &job_owned,
            &doctor_owned,
            &profiles_guard,
            &workspace_root_owned,
            &cache_dirs,
            &forbidden_roots,
            job_started_at,
            &mut deps,
        )
    })
    .await;

    let outcome: Result<Vec<crate::hermes_executor::CollectedOutput>, HermesFailure> =
        match blocking_result {
            Ok(inner_result) => inner_result,
            Err(join_error) => Err(HermesFailure {
                code: "HERMES_PROCESS_FAILED".to_string(),
                message: format!("hermes media job task failed: {join_error}"),
            }),
        };

    outcome
        .map(|_collected| ())
        .map_err(|failure| format!("[{}] {}", failure.code, failure.message))
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 §11 FIX 1/2 — hermes connection-control job dispatch
// (authorize/probe/disconnect), wired to `RealHermesControlDeps`.
// ────────────────────────────────────────────────────────────────────────

async fn execute_hermes_control_job(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
) -> Result<(), String> {
    let connection_snapshot = clone_connection(connection)?;
    let connection_id = job
        .capability_requirements_json
        .get("connectionId")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            "hermes control job is missing capabilityRequirementsJson.connectionId".to_string()
        })?
        .to_string();
    let profile_reference = format!("conn_{connection_id}");

    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
    let manifest = read_hermes_runtime_manifest(&manifest_path)
        .map_err(|error| format!("hermes runtime manifest unavailable: {error}"))?;
    let hermes_executable = pack_root.join(&manifest.hermes_relative_path);
    let python_executable = pack_root.join(&manifest.python_relative_path);

    // Control jobs have a generous default timeout ceiling; the device-code
    // authorize flow is bounded by the job's own `assignmentAttempt` lease
    // lifetime server-side, not by this local ceiling.
    let timeout_ms: u64 = 15 * 60 * 1000;
    send_event_with_refresh(
        app_data_dir,
        connection,
        &job.id,
        WorkerEventPlan {
            event_type: "job.running".to_string(),
            sequence_number: 1,
            lease_owner_token: job.lease_owner_token.clone(),
            assignment_attempt: job.assignment_attempt.clone(),
            payload_json: json!({ "stage": "starting_hermes_control" }),
        },
    )
    .await
    .map_err(|error| format!("failed to report Hermes control-job start: {error}"))?;

    let event_sequence_number = Arc::new(std::sync::atomic::AtomicU32::new(2));
    let deps = RealHermesControlDeps {
        hermes_executable,
        python_executable,
        connection: connection_snapshot,
        job_id: job.id.clone(),
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        event_sequence_number,
        connection_id: connection_id.clone(),
        profiles: hermes_profiles.clone(),
        app_data_dir: app_data_dir.to_path_buf(),
        timeout_ms,
    };

    let job_type = job.job_type.clone();
    let connection_id_for_execution = connection_id.clone();
    let test_generation = job
        .input_json
        .get("testGeneration")
        .and_then(Value::as_str)
        .map(str::to_string);
    let outcome =
        tauri::async_runtime::spawn_blocking(move || match classify_job_type(&job_type) {
            WorkerJobKind::HermesConnectionAuthorize => run_hermes_connection_authorize(
                &connection_id_for_execution,
                &profile_reference,
                timeout_ms / 1000,
                &deps,
            ),
            WorkerJobKind::HermesConnectionProbe => run_hermes_connection_probe(
                &connection_id_for_execution,
                &profile_reference,
                timeout_ms / 1000,
                test_generation.as_deref(),
                &deps,
            ),
            WorkerJobKind::HermesConnectionDisconnect => run_hermes_connection_disconnect(
                &connection_id_for_execution,
                &profile_reference,
                timeout_ms / 1000,
                &deps,
            ),
            _ => HermesControlOutcome::Failure {
                error_code: "HERMES_PROCESS_FAILED".to_string(),
                failure_reason: "process_failed".to_string(),
                diagnostic: "unreachable: non-control job type dispatched to control-job executor"
                    .to_string(),
            },
        })
        .await
        .map_err(|error| format!("hermes control job task failed: {error}"))?;

    if let HermesControlOutcome::Failure {
        error_code,
        failure_reason,
        diagnostic,
    } = &outcome
    {
        crate::diagnostics::append_diagnostic_event(
            app_data_dir,
            "hermes_control.failure",
            json!({
                "jobId": job.id,
                "connectionId": connection_id,
                "errorCode": error_code,
                "failureReason": failure_reason,
                "diagnostic": diagnostic,
            }),
        );
    }

    let terminal_event = build_hermes_control_terminal_event(&job, &outcome);
    send_event_with_refresh(app_data_dir, connection, &job.id, terminal_event)
        .await
        .map_err(|error| format!("failed to report Hermes control-job outcome: {error}"))?;

    match outcome {
        HermesControlOutcome::Success { .. } => Ok(()),
        HermesControlOutcome::Failure {
            error_code,
            diagnostic,
            ..
        } => Err(format!("[{error_code}] {diagnostic}")),
    }
}

fn build_hermes_control_terminal_event(
    job: &ClaimedWorkerJob,
    outcome: &HermesControlOutcome,
) -> WorkerEventPlan {
    let (event_type, payload_json) = match outcome {
        HermesControlOutcome::Success {
            account_hint,
            manifest,
        } => (
            "job.completed",
            json!({
                "accountHint": account_hint,
                "capabilities": manifest,
            }),
        ),
        HermesControlOutcome::Failure {
            error_code,
            failure_reason,
            diagnostic,
        } => (
            "job.failed",
            json!({
                "errorCode": error_code,
                "failureReason": failure_reason,
                "diagnostic": diagnostic,
                "message": diagnostic,
            }),
        ),
    };

    WorkerEventPlan {
        event_type: event_type.to_string(),
        sequence_number: FAILURE_EVENT_SEQUENCE_NUMBER,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        payload_json,
    }
}

async fn execute_hyperframes_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    doctor: &DoctorSummary,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    append_diagnostic_event(
        app_data_dir,
        "job.render.started",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "runtimeEnvironment": settings.runtime_environment,
        }),
    );
    let workspace_root = workspace_root(settings, resource_dir, app_data_dir)?;
    let result = execute_hyperframes_job_inner(
        executor,
        resource_dir,
        app_data_dir,
        connection,
        &job,
        doctor,
        &workspace_root,
        settings,
        cancel,
    )
    .await;
    append_diagnostic_event(
        app_data_dir,
        "job.render.result",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "success": result.is_ok(),
            "error": result.as_ref().err(),
        }),
    );
    let workspace_dir = workspace_root.join(crate::worker_executor::sanitize_segment(&job.id));
    let render_log_path = workspace_dir.join("render.log");

    if let Err(error) = &result {
        let failure =
            build_failure_event(&job, FAILURE_EVENT_SEQUENCE_NUMBER, "render_failed", error);
        let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
        crate::diagnostics::append_diagnostic_event(
            app_data_dir,
            "job.failed",
            json!({
                "jobId": job.id,
                "error": error
            }),
        );
        let error_msg = format!("Job failed: {error}");
        set_executor_last_job(
            executor,
            &job,
            "error",
            &error_msg,
            Some(render_log_path.to_string_lossy().to_string()),
        );
        set_executor_job_error(executor, &job.id, error_msg);
    } else {
        set_executor_last_job(
            executor,
            &job,
            "success",
            "Job completed and artifacts uploaded.",
            Some(render_log_path.to_string_lossy().to_string()),
        );
        set_executor_job_complete(executor, &job.id, "Job completed and artifacts uploaded.");
    }

    if render_log_path.exists() {
        let _ = upload_worker_artifact_file_with_refresh(
            app_data_dir,
            connection,
            &job.id,
            "hyperframes_render_log",
            &render_log_path,
            "render.log",
            "text/plain",
            &job.lease_owner_token,
            &job.assignment_attempt,
            json!({}),
        )
        .await;
    }

    result
}

async fn send_progress_event_with_next_sequence(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job_id: &str,
    mut event: WorkerEventPlan,
    next_sequence_number: &mut u32,
) -> Result<(), String> {
    event.sequence_number = *next_sequence_number;
    *next_sequence_number = next_sequence_number.saturating_add(1);
    send_event_with_refresh(app_data_dir, connection, job_id, event).await
}

async fn execute_hyperframes_job_inner(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    doctor: &DoctorSummary,
    workspace_root: &Path,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings.runtime_dir.trim())
    };
    let (sidecar_executable, runtime_id, runtime_version) =
        if settings.runtime_environment.is_managed_wsl() {
            (
                PathBuf::from("managed-wsl-runtime"),
                "managed-wsl".to_string(),
                settings.managed_wsl_root.clone(),
            )
        } else {
            let (manifest_path, sidecar_root) =
                runtime_pack_paths(resource_dir, &effective_runtime_dir);
            let manifest = read_runtime_pack_manifest(&manifest_path)?;
            (
                sidecar_path_from_manifest(&manifest, &sidecar_root),
                manifest.runtime_id,
                manifest.version,
            )
        };
    let plan = prepare_hyperframes_execution_plan(job, workspace_root, doctor)?;
    fs::create_dir_all(&plan.output_dir)
        .map_err(|error| format!("failed to create worker output dir: {error}"))?;
    fs::create_dir_all(plan.workspace_dir.join("assets"))
        .map_err(|error| format!("failed to create worker asset dir: {error}"))?;

    let progress_plan = build_progress_event_plan(job);
    let mut next_sequence_number = 1;

    for event in progress_plan.iter().take(2) {
        update_progress_from_event(executor, &job.id, event);
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event.clone(),
            &mut next_sequence_number,
        )
        .await?;
    }

    let mut staged_job = job.clone();
    stage_hyperframes_source_videos(
        executor,
        app_data_dir,
        connection,
        job,
        settings,
        doctor,
        &mut staged_job.input_json,
        &plan,
        &mut next_sequence_number,
    )
    .await?;
    let sidecar_manifest = build_sidecar_manifest(&staged_job, &plan);
    fs::write(
        &plan.sidecar_manifest_path,
        serde_json::to_vec_pretty(&sidecar_manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write sidecar manifest: {error}"))?;

    if let Some(composition_html) = staged_job
        .input_json
        .get("compositionHtml")
        .and_then(serde_json::Value::as_str)
    {
        fs::write(
            plan.workspace_dir.join("index.html"),
            composition_html.as_bytes(),
        )
        .map_err(|error| format!("failed to write index.html: {error}"))?;
    }
    fs::write(
        plan.output_dir.join("doctor.json"),
        serde_json::to_vec_pretty(doctor).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write doctor report: {error}"))?;

    for event in progress_plan.iter().skip(2).take(2) {
        update_progress_from_event(executor, &job.id, event);
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event.clone(),
            &mut next_sequence_number,
        )
        .await?;
    }

    let managed_wsl_root = settings
        .runtime_environment
        .is_managed_wsl()
        .then_some(settings.managed_wsl_root.as_str());
    let managed_wsl_workspace_root = settings
        .runtime_environment
        .is_managed_wsl()
        .then_some(settings.managed_wsl_workspace_root.as_str());
    let command = build_sidecar_command(
        &sidecar_executable,
        &plan,
        settings.uses_wsl2_runtime(),
        managed_wsl_root,
        managed_wsl_workspace_root,
    )?;
    update_executor_progress(
        executor,
        &job.id,
        55,
        "Running official HyperFrames sidecar.",
    );
    next_sequence_number = run_sidecar_with_active_heartbeat(
        executor,
        connection,
        job,
        settings,
        doctor,
        &command,
        cancel,
        app_data_dir,
        next_sequence_number,
    )
    .await?;
    let final_video_size_bytes = validate_final_video_artifact(&plan.final_video_path)?;

    for event in progress_plan.iter().skip(4).take(2) {
        update_progress_from_event(executor, &job.id, event);
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event.clone(),
            &mut next_sequence_number,
        )
        .await?;
    }

    for upload in build_required_artifact_uploads(job, &plan) {
        update_executor_progress(
            executor,
            &job.id,
            82,
            format!("Uploading artifact: {}", upload.file_name),
        );
        let connection_snapshot =
            refresh_connection_for_control_plane(app_data_dir, connection, "artifact upload")
                .await?;
        let _ = heartbeat(
            executor,
            app_data_dir,
            &connection_snapshot,
            settings,
            doctor,
            true,
            None,
            true,
            false,
            None,
            None,
            None,
        )
        .await;
        let mut metadata = json!({
            "assignmentAttempt": job.assignment_attempt,
            "runtimeId": runtime_id,
            "runtimeVersion": runtime_version,
        });
        if upload.artifact_type == "hyperframes_final_video" {
            metadata.as_object_mut().unwrap().insert(
                "validatedSizeBytes".to_string(),
                json!(final_video_size_bytes),
            );
            metadata
                .as_object_mut()
                .unwrap()
                .insert("containerVerified".to_string(), json!("mp4_ftyp_header"));
        }

        if upload.content_type == "application/json" {
            if let Ok(content) = std::fs::read_to_string(&upload.path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    let summary = compact_json_artifact_metadata(
                        &upload.artifact_type,
                        &parsed,
                        upload.size_bytes(),
                    );

                    if let Some(summary_obj) = summary.as_object() {
                        for (k, v) in summary_obj {
                            if !v.is_null() {
                                metadata
                                    .as_object_mut()
                                    .unwrap()
                                    .insert(k.clone(), v.clone());
                            }
                        }
                    }

                    metadata
                        .as_object_mut()
                        .unwrap()
                        .insert("artifactJsonSummary".to_string(), summary);
                    if upload.artifact_type == "hyperframes_render_manifest" {
                        if let Some(hash) = parsed
                            .get("finalVideoSha256")
                            .or_else(|| parsed.get("finalVideoChecksumSha256"))
                            .or_else(|| {
                                parsed
                                    .get("outputs")
                                    .and_then(|v| v.get("finalVideo"))
                                    .and_then(|v| {
                                        v.get("checksumSha256").or_else(|| v.get("sha256"))
                                    })
                            })
                        {
                            metadata
                                .as_object_mut()
                                .unwrap()
                                .insert("finalVideoChecksumSha256".to_string(), hash.clone());
                        }
                    }
                }
            }
        }

        upload_worker_artifact_file_with_refresh(
            app_data_dir,
            connection,
            &job.id,
            &upload.artifact_type,
            &upload.path,
            &upload.file_name,
            &upload.content_type,
            &upload.lease_owner_token,
            &upload.assignment_attempt,
            metadata,
        )
        .await?;
    }

    for event in progress_plan.iter().skip(6) {
        update_progress_from_event(executor, &job.id, event);
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event.clone(),
            &mut next_sequence_number,
        )
        .await?;
    }
    Ok(())
}

/// Footage B-roll composition is deliberately fail-closed until the caller
/// supplies a Remotion asset manifest with worker-fetchable URLs. A media
/// source manifest contains storage identity only; treating its relative
/// path as a browser URL would silently render a blank layer.
async fn execute_footage_broll_render_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    doctor: &DoctorSummary,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    if let Some(remotion_input) = job.input_json.get("remotionInput") {
        // The Server compiles the URL-bearing, strict Remotion payload after
        // authorizing every source. Reuse the existing proven executor so
        // this feature does not grow a second Chromium/FFmpeg implementation.
        let mut delegated_job = job.clone();
        delegated_job.job_type = "remotion_render_video".into();
        delegated_job.input_json = remotion_input.clone();
        return execute_remotion_render_video_job(
            executor,
            resource_dir,
            app_data_dir,
            connection,
            delegated_job,
            doctor,
            settings,
            cancel,
        )
        .await;
    }
    let result = if job.input_json.get("kind").and_then(Value::as_str)
        != Some(VERTICAL_DRAMA_FOOTAGE_BROLL_RENDER_JOB_TYPE)
    {
        Err("render_contract_mismatch".to_string())
    } else if job
        .input_json
        .get("renderProfile")
        .and_then(|value| value.get("compositionExecutor"))
        .and_then(Value::as_str)
        != Some("remotion_render_video")
    {
        Err("unsupported_composition_executor".to_string())
    } else {
        Err(
            "unsupported_composition_executor: Remotion asset URLs are required before render"
                .to_string(),
        )
    };
    if let Err(error) = &result {
        let failure_code = error
            .split(':')
            .next()
            .unwrap_or("unsupported_composition_executor");
        let _ = send_event_with_refresh(
            app_data_dir,
            connection,
            &job.id,
            build_failure_event(&job, FAILURE_EVENT_SEQUENCE_NUMBER, failure_code, error),
        )
        .await;
        set_executor_last_job(executor, &job, "error", error, None);
        set_executor_job_error(executor, &job.id, error.clone());
    }
    result
}

/// `planning/worker-app-remotion-render-video/plan.md` P2 — top-level entry
/// point for a claimed `remotion_render_video` job. Mirrors
/// `execute_hyperframes_job`'s shape (resolve workspace → run inner →
/// report failure/success → best-effort log upload) but the inner function
/// spawns the Remotion `render-video` sidecar mode instead.
async fn execute_remotion_render_video_job(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: ClaimedWorkerJob,
    doctor: &DoctorSummary,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    set_executor_job(executor, &job);
    append_diagnostic_event(
        app_data_dir,
        "job.render.started",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "runtimeEnvironment": settings.runtime_environment,
        }),
    );
    let workspace_root = workspace_root(settings, resource_dir, app_data_dir)?;
    let result = execute_remotion_render_video_job_inner(
        executor,
        resource_dir,
        app_data_dir,
        connection,
        &job,
        doctor,
        &workspace_root,
        settings,
        cancel,
    )
    .await;
    append_diagnostic_event(
        app_data_dir,
        "job.render.result",
        json!({
            "jobId": job.id,
            "jobType": job.job_type,
            "success": result.is_ok(),
            "error": result.as_ref().err(),
        }),
    );
    let workspace_dir = workspace_root.join(crate::worker_executor::sanitize_segment(&job.id));
    let render_log_path = workspace_dir.join("render.log");

    if let Err(error) = &result {
        let failure = build_remotion_render_video_failure_event(
            &job,
            FAILURE_EVENT_SEQUENCE_NUMBER,
            "render_failed",
            error,
        );
        let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
        crate::diagnostics::append_diagnostic_event(
            app_data_dir,
            "job.failed",
            json!({
                "jobId": job.id,
                "jobType": job.job_type,
                "error": error
            }),
        );
        let error_msg = format!("Job failed: {error}");
        set_executor_last_job(
            executor,
            &job,
            "error",
            &error_msg,
            Some(render_log_path.to_string_lossy().to_string()),
        );
        set_executor_job_error(executor, &job.id, error_msg);
    } else {
        set_executor_last_job(
            executor,
            &job,
            "success",
            "Job completed and artifacts uploaded.",
            Some(render_log_path.to_string_lossy().to_string()),
        );
        set_executor_job_complete(executor, &job.id, "Job completed and artifacts uploaded.");
    }

    if render_log_path.exists() {
        let _ = upload_worker_artifact_file_with_refresh(
            app_data_dir,
            connection,
            &job.id,
            "remotion_render_log_file",
            &render_log_path,
            "render.log",
            "text/plain",
            &job.lease_owner_token,
            &job.assignment_attempt,
            json!({}),
        )
        .await;
    }

    result
}

/// Sidecar-agnostic outcome of running the Remotion `render-video`
/// process to completion — either the sidecar's `completed` event (with the
/// sequence number the caller should continue from) or a
/// `(failure_code, message)` pair suitable for
/// `build_remotion_render_video_failure_event`.
#[derive(Debug, Clone, PartialEq)]
enum RemotionRenderOutcome {
    Completed {
        output_path: String,
        duration_sec: f64,
        sha256: String,
        width_px: u32,
        height_px: u32,
    },
    Failed {
        failure_code: String,
        message: String,
    },
}

async fn execute_remotion_render_video_job_inner(
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    doctor: &DoctorSummary,
    workspace_root: &Path,
    settings: &WorkerAppSettings,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
        app_data_dir.to_path_buf()
    } else {
        PathBuf::from(settings.runtime_dir.trim())
    };
    // Same runtime-pack resolution `execute_hyperframes_job_inner` uses —
    // the Remotion `render-video` sidecar lives under the SAME runtime pack
    // (`runtime-pack/remotion-sidecar/render.mjs`, a sibling of
    // `runtime-pack/hyperframes-sidecar/`), so the manifest-declared
    // HyperFrames sidecar path is only used here to derive the shared
    // runtime root (`build_remotion_render_video_sidecar_command` picks its
    // own `remotion-sidecar` script path — see `SidecarKind`).
    let sidecar_executable = if settings.runtime_environment.is_managed_wsl() {
        PathBuf::from("managed-wsl-runtime")
    } else {
        let (manifest_path, sidecar_root) =
            runtime_pack_paths(resource_dir, &effective_runtime_dir);
        let manifest = read_runtime_pack_manifest(&manifest_path)?;
        sidecar_path_from_manifest(&manifest, &sidecar_root)
    };

    let plan = prepare_remotion_render_video_execution_plan(job, workspace_root)?;
    fs::create_dir_all(&plan.output_dir)
        .map_err(|error| format!("failed to create worker output dir: {error}"))?;

    // FROZEN sidecar contract (P1) — the job's `inputJson` is written
    // verbatim, byte-for-byte, as the payload file; Rust never mutates it
    // (unlike the HyperFrames path, asset staging happens INSIDE the
    // sidecar via `defaultStageRemotionRenderVideoAssets`, not here).
    fs::write(
        &plan.payload_path,
        serde_json::to_vec_pretty(&job.input_json).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write remotion_render_video payload: {error}"))?;

    let mut next_sequence_number = 1u32;
    if let Some(event) = build_remotion_render_video_progress_event(
        job,
        next_sequence_number,
        "resolve_inputs",
        5,
        None,
    ) {
        send_progress_event_with_next_sequence(
            app_data_dir,
            connection,
            &job.id,
            event,
            &mut next_sequence_number,
        )
        .await?;
    }

    let managed_wsl_root = settings
        .runtime_environment
        .is_managed_wsl()
        .then_some(settings.managed_wsl_root.as_str());
    let managed_wsl_workspace_root = settings
        .runtime_environment
        .is_managed_wsl()
        .then_some(settings.managed_wsl_workspace_root.as_str());
    let command = build_remotion_render_video_sidecar_command(
        &sidecar_executable,
        &plan,
        settings.uses_wsl2_runtime(),
        managed_wsl_root,
        managed_wsl_workspace_root,
    )?;
    update_executor_progress(
        executor,
        &job.id,
        20,
        "Running Remotion render-video sidecar.",
    );

    let (outcome, sequence_after_run) = run_remotion_sidecar_and_collect(
        executor,
        connection,
        job,
        settings,
        doctor,
        &command,
        cancel,
        app_data_dir,
        next_sequence_number,
    )
    .await?;
    next_sequence_number = sequence_after_run;

    let (output_path, duration_sec, sha256, _width_px, _height_px) = match outcome {
        RemotionRenderOutcome::Completed {
            output_path,
            duration_sec,
            sha256,
            width_px,
            height_px,
        } => (output_path, duration_sec, sha256, width_px, height_px),
        RemotionRenderOutcome::Failed {
            failure_code,
            message,
        } => {
            return Err(format!("{failure_code}: {message}"));
        }
    };

    // Field incident 2026-07-30 (first real Lane B render:
    // `Remotion render-video output is missing: The system cannot find the
    // path specified. (os error 3)`): the sidecar runs INSIDE WSL, so the
    // `outputPath` it reports is a WSL path (`/home/<user>/...`) that this
    // Windows-side process cannot stat. Rust already knows where the file
    // physically is — it passed `to_wsl_path(&plan.output_dir)` as
    // `--output-dir` — so resolve the artifact against its OWN
    // `plan.output_dir`, taking only the file NAME from the sidecar. This
    // mirrors the HyperFrames path, which likewise uses its own
    // `plan.final_video_path` rather than trusting a sidecar-echoed path.
    let reported_output = PathBuf::from(&output_path);
    let output_file_name = reported_output
        .file_name()
        .ok_or_else(|| format!("sidecar reported an unusable output path: {output_path}"))?;
    let output_path = plan.output_dir.join(output_file_name);
    validate_workspace_path(workspace_root, &output_path).map_err(|error| {
        format!("sidecar reported an output path outside the worker workspace: {error}")
    })?;
    let output_metadata = fs::metadata(&output_path).map_err(|error| {
        format!(
            "Remotion render-video output is missing at {}: {error}",
            output_path.display()
        )
    })?;
    let size_bytes = output_metadata.len();

    update_executor_progress(
        executor,
        &job.id,
        82,
        "Uploading Remotion render-video artifact.",
    );
    let upload = ArtifactUploadPlan {
        artifact_type: "remotion_render_mp4".into(),
        file_name: "render.mp4".into(),
        content_type: "video/mp4".into(),
        path: output_path,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
    };
    let upload_response = upload_worker_artifact_file_with_refresh(
        app_data_dir,
        connection,
        &job.id,
        &upload.artifact_type,
        &upload.path,
        &upload.file_name,
        &upload.content_type,
        &upload.lease_owner_token,
        &upload.assignment_attempt,
        json!({ "assignmentAttempt": job.assignment_attempt, "checksumSha256": sha256 }),
    )
    .await?;

    // The Worker stores the durable artifact identity as `storageRef`. The
    // Web control plane resolves that protected reference to a short-lived
    // playback URL before returning job status to the browser; the Worker
    // must never mint or log a public media URL.
    let storage_ref = upload_response
        .artifact
        .get("storageRef")
        .and_then(Value::as_str)
        .unwrap_or(&upload.file_name)
        .to_string();
    let content_hash = remotion_render_video_content_hash(&sha256);
    let artifacts = build_remotion_render_video_artifacts(
        &job.input_json,
        &storage_ref,
        &storage_ref,
        &content_hash,
        size_bytes,
        duration_sec,
    );
    let output_json = build_remotion_render_video_output_json(
        &job.input_json,
        &storage_ref,
        artifacts[0].clone(),
        artifacts,
    );

    for stage in ["server_verify_artifacts", "publish_artifacts"] {
        if let Some(event) =
            build_remotion_render_video_progress_event(job, next_sequence_number, stage, 95, None)
        {
            send_progress_event_with_next_sequence(
                app_data_dir,
                connection,
                &job.id,
                event,
                &mut next_sequence_number,
            )
            .await?;
        }
    }

    let completed_event =
        build_remotion_render_video_completed_event(job, next_sequence_number, output_json);
    send_progress_event_with_next_sequence(
        app_data_dir,
        connection,
        &job.id,
        completed_event,
        &mut next_sequence_number,
    )
    .await?;

    Ok(())
}

/// Spawns the Remotion `render-video` sidecar, tails its stdout for
/// `SMARTAIHUB_EVENT` lines, forwards recognized progress stages as
/// `job.progress` events (unrecognized stages are logged and skipped, never
/// fatal), and returns the terminal `completed`/`failed` outcome. If the
/// process exits non-zero without ever emitting a `failed` event, the
/// outcome is synthesized as `render_failed` with a tail of captured
/// stderr/stdout.
#[allow(clippy::too_many_arguments)]
async fn run_remotion_sidecar_and_collect(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    command: &SidecarCommandPlan,
    cancel: &Arc<AtomicBool>,
    app_data_dir: &Path,
    mut next_sequence_number: u32,
) -> Result<(RemotionRenderOutcome, u32), String> {
    let log_path = command.current_dir.join("render.log");
    let log_file = fs::File::create(&log_path)
        .map_err(|error| format!("failed to create render.log: {error}"))?;
    let log_file_err = log_file
        .try_clone()
        .map_err(|error| format!("failed to clone render.log handle: {error}"))?;

    let mut cmd = Command::new(&command.executable);
    cmd.args(&command.args)
        .current_dir(&command.current_dir)
        .envs(&command.envs)
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_err));

    if command.stdin_data.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => {
            crate::diagnostics::log_error(
                app_data_dir,
                "sidecar.spawn_failed",
                json!({
                    "kind": "remotion_render_video",
                    "jobId": job.id,
                    "executable": command.executable.to_string_lossy(),
                    "arguments": command.args,
                    "currentDir": command.current_dir.to_string_lossy(),
                    "logPath": log_path.to_string_lossy(),
                    "error": error.to_string(),
                }),
            );
            return Err(format!(
                "failed to start Remotion render-video sidecar: {error}"
            ));
        }
    };
    crate::diagnostics::append_diagnostic_event(
        app_data_dir,
        "sidecar.started",
        json!({
            "kind": "remotion_render_video",
            "jobId": job.id,
            "executable": command.executable.to_string_lossy(),
            "logPath": log_path.to_string_lossy(),
            "arguments": command.args,
        }),
    );

    if let Some(stdin_data) = &command.stdin_data {
        if let Some(mut stdin) = child.stdin.take() {
            let data = stdin_data.clone();
            std::thread::spawn(move || {
                use std::io::Write;
                let _ = stdin.write_all(data.as_bytes());
            });
        }
    }

    let mut log_reader = fs::File::open(&log_path).map(std::io::BufReader::new).ok();
    let mut tail_lines: Vec<String> = Vec::new();
    let mut completed: Option<RemotionRenderOutcome> = None;

    let started_at = Instant::now();
    let timeout = Duration::from_secs(3600);
    let mut last_heartbeat = Instant::now() - ACTIVE_HEARTBEAT_INTERVAL;

    loop {
        if cancel.load(Ordering::Relaxed) {
            terminate_sidecar_child(&mut child, command);
            crate::diagnostics::log_warn(
                app_data_dir,
                "sidecar.stopped",
                json!({ "kind": "remotion_render_video", "jobId": job.id, "reason": "cancelled" }),
            );
            return Err("worker loop stopped while Remotion sidecar was running".into());
        }
        if started_at.elapsed() >= timeout {
            terminate_sidecar_child(&mut child, command);
            crate::diagnostics::log_error(
                app_data_dir,
                "sidecar.timeout",
                json!({ "kind": "remotion_render_video", "jobId": job.id, "elapsedMs": started_at.elapsed().as_millis() as u64 }),
            );
            return Err("Remotion render-video sidecar timed out after 1 hour".into());
        }
        if last_heartbeat.elapsed() >= ACTIVE_HEARTBEAT_INTERVAL {
            let _ =
                crate::commands::try_refresh_connection_if_needed(app_data_dir, connection).await;
            let connection_snapshot = clone_connection(connection)?;
            let _ = heartbeat(
                executor,
                app_data_dir,
                &connection_snapshot,
                settings,
                doctor,
                true,
                None,
                true,
                false,
                None,
                None,
                None,
            )
            .await;
            last_heartbeat = Instant::now();
        }

        // Drain any newly written lines before checking exit status so a
        // `completed`/`failed` event emitted right before the process exits
        // is never lost to a race against `try_wait`.
        if let Some(reader) = &mut log_reader {
            use std::io::BufRead;
            let mut line = String::new();
            while let Ok(bytes) = reader.read_line(&mut line) {
                if bytes == 0 {
                    break;
                }
                let trimmed = line.trim().to_string();
                if !trimmed.is_empty() {
                    tail_lines.push(trimmed.clone());
                    if tail_lines.len() > LIVE_RENDER_LOG_TAIL_LINES * 2 {
                        let keep_from = tail_lines.len().saturating_sub(LIVE_RENDER_LOG_TAIL_LINES);
                        tail_lines.drain(0..keep_from);
                    }
                    match parse_remotion_sidecar_event(&trimmed) {
                        Some(RemotionSidecarEvent::Progress { stage, message }) => {
                            if let Some(event) = build_remotion_render_video_progress_event(
                                job,
                                next_sequence_number,
                                &stage,
                                60,
                                message.as_deref(),
                            ) {
                                update_executor_progress(
                                    executor,
                                    &job.id,
                                    60,
                                    message.clone().unwrap_or_else(|| stage.clone()),
                                );
                                if let Err(error) = send_progress_event_with_next_sequence(
                                    app_data_dir,
                                    connection,
                                    &job.id,
                                    event,
                                    &mut next_sequence_number,
                                )
                                .await
                                {
                                    terminate_sidecar_child(&mut child, command);
                                    return Err(format!(
                                        "Active render progress event failed while Remotion sidecar was running: {error}"
                                    ));
                                }
                            } else {
                                // Unknown stage — the server would reject
                                // this event outright; log it locally and
                                // move on instead of crashing or forwarding
                                // an invalid stage.
                                crate::diagnostics::append_diagnostic_event(
                                    app_data_dir,
                                    "remotion.progress.unknown_stage",
                                    json!({ "jobId": job.id, "stage": stage }),
                                );
                            }
                        }
                        Some(RemotionSidecarEvent::Completed {
                            output_path,
                            duration_sec,
                            sha256,
                            width_px,
                            height_px,
                        }) => {
                            completed = Some(RemotionRenderOutcome::Completed {
                                output_path,
                                duration_sec,
                                sha256,
                                width_px,
                                height_px,
                            });
                        }
                        Some(RemotionSidecarEvent::Failed {
                            failure_code,
                            message,
                        }) => {
                            completed = Some(RemotionRenderOutcome::Failed {
                                failure_code,
                                message,
                            });
                        }
                        None => {}
                    }
                }
                line.clear();
            }
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let outcome = classify_remotion_sidecar_exit(
                    status.success(),
                    completed,
                    &tail_lines,
                    status.to_string(),
                );
                crate::diagnostics::append_diagnostic_event(
                    app_data_dir,
                    "sidecar.exited",
                    json!({
                        "kind": "remotion_render_video",
                        "jobId": job.id,
                        "success": status.success(),
                        "status": status.to_string(),
                        "elapsedMs": started_at.elapsed().as_millis() as u64,
                        "capturedLogLines": tail_lines.len(),
                        "outputTail": build_failure_log_excerpt(tail_lines.clone()),
                    }),
                );
                return Ok((outcome, next_sequence_number));
            }
            Ok(None) => {
                sleep_cancelable(Duration::from_millis(500), cancel).await;
            }
            Err(error) => {
                crate::diagnostics::log_error(
                    app_data_dir,
                    "sidecar.monitor_failed",
                    json!({ "kind": "remotion_render_video", "jobId": job.id, "error": error.to_string() }),
                );
                return Err(format!("failed to monitor Remotion sidecar: {error}"));
            }
        }
    }
}

/// Pure exit-classification helper for `run_remotion_sidecar_and_collect` —
/// separated out so the "process exited without ever reporting a terminal
/// sidecar event" fallback logic is unit-testable without spawning a real
/// child process. `already_captured` is whatever `completed`/`failed` event
/// was parsed from stdout WHILE the process was still running (if any) —
/// this always wins over exit-status inference. Only when nothing was
/// captured does exit status matter: a non-zero exit synthesizes
/// `render_failed` with a tail of captured log lines (task requirement); a
/// zero exit with nothing captured is ALSO `render_failed` (the frozen
/// sidecar contract guarantees exactly one of `completed`/`failed` on every
/// run, so a clean exit with neither is itself a contract violation, not a
/// silent success).
fn classify_remotion_sidecar_exit(
    exited_successfully: bool,
    already_captured: Option<RemotionRenderOutcome>,
    tail_lines: &[String],
    status_display: String,
) -> RemotionRenderOutcome {
    if let Some(outcome) = already_captured {
        return outcome;
    }
    if exited_successfully {
        return RemotionRenderOutcome::Failed {
            failure_code: "render_failed".into(),
            message: "Remotion render-video sidecar exited successfully without reporting a completed event".into(),
        };
    }
    let tail = build_failure_log_excerpt(tail_lines.to_vec());
    RemotionRenderOutcome::Failed {
        failure_code: "render_failed".into(),
        message: format!(
            "Remotion render-video sidecar exited with {status_display}.\n\nLogs:\n{tail}"
        ),
    }
}

async fn stage_hyperframes_source_videos(
    executor: &Arc<Mutex<ExecutorState>>,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    input_json: &mut Value,
    plan: &crate::worker_executor::HyperframesExecutionPlan,
    next_sequence_number: &mut u32,
) -> Result<(), String> {
    let source_videos = input_json
        .get_mut("assetManifest")
        .and_then(|manifest| manifest.get_mut("sourceVideos"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "HyperFrames sourceVideos manifest is missing".to_string())?;
    if source_videos.is_empty() {
        return Err("HyperFrames sourceVideos manifest is empty".into());
    }

    let total_videos = source_videos.len();
    let mut replacements: Vec<(String, String)> = Vec::new();
    for (index, source_video) in source_videos.iter_mut().enumerate() {
        update_executor_progress(
            executor,
            &job.id,
            22, // roughly corresponds to stage_assets percent
            format!("Downloading source video {}/{}", index + 1, total_videos),
        );
        let connection_snapshot = clone_connection(connection)?;
        let _ = heartbeat(
            executor,
            app_data_dir,
            &connection_snapshot,
            settings,
            doctor,
            true,
            None,
            true,
            false,
            None,
            None,
            None,
        )
        .await;

        let shot_id = source_video
            .get("shotId")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("source video {index} is missing shotId"))?
            .to_string();
        let storage_ref = source_video
            .get("storageRef")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let download_ref = source_video
            .get("downloadUrl")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                if storage_ref.starts_with("http://")
                    || storage_ref.starts_with("https://")
                    || storage_ref.starts_with('/')
                {
                    Some(storage_ref.as_str())
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                format!("source video {shot_id} has no signed downloadUrl or directly downloadable storageRef")
            })?
            .to_string();
        let url = resolve_worker_download_url(&connection_snapshot.server_url, &download_ref)?;
        let local_name = format!("{}.mp4", sanitize_file_stem(&shot_id, index));
        let relative_path = format!("assets/{local_name}");
        let local_path = plan.workspace_dir.join(&relative_path);
        let expected_digest = source_video
            .get("checksumSha256")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit()))
            .map(str::to_string);
        let mut used_download_cache = false;
        if let Some(expected) = expected_digest.as_deref() {
            if local_path.exists() {
                let existing_digest = file_sha256(&local_path)?;
                if existing_digest.eq_ignore_ascii_case(expected) {
                    used_download_cache = true;
                    let event = build_source_download_event(
                        job,
                        "source.download.cache_hit",
                        &shot_id,
                        index,
                        total_videos,
                        22,
                        format!(
                            "ใช้ source video เดิมจาก cache สำหรับ Shot {}/{}: {}",
                            index + 1,
                            total_videos,
                            shot_id
                        ),
                        Some(existing_digest),
                    );
                    send_progress_event_with_next_sequence(
                        app_data_dir,
                        connection,
                        &job.id,
                        event,
                        next_sequence_number,
                    )
                    .await?;
                }
            }
        }
        if !used_download_cache {
            let event = build_source_download_event(
                job,
                "source.download.started",
                &shot_id,
                index,
                total_videos,
                20,
                format!(
                    "Downloading source video {}/{}: {}",
                    index + 1,
                    total_videos,
                    shot_id
                ),
                None,
            );
            send_progress_event_with_next_sequence(
                app_data_dir,
                connection,
                &job.id,
                event,
                next_sequence_number,
            )
            .await?;
            let digest = download_source_asset(&url, &local_path).await?;
            source_video["checksumSha256"] = json!(digest);
        }

        let digest = if used_download_cache {
            file_sha256(&local_path)?
        } else {
            source_video
                .get("checksumSha256")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        if let Some(expected) = expected_digest.as_deref() {
            if !digest.eq_ignore_ascii_case(expected) {
                return Err(format!("source video {shot_id} checksum mismatch"));
            }
        }
        if !used_download_cache {
            let event = build_source_download_event(
                job,
                "source.download.succeeded",
                &shot_id,
                index,
                total_videos,
                22,
                format!(
                    "Downloaded source video {}/{}: {}",
                    index + 1,
                    total_videos,
                    shot_id
                ),
                Some(digest.clone()),
            );
            send_progress_event_with_next_sequence(
                app_data_dir,
                connection,
                &job.id,
                event,
                next_sequence_number,
            )
            .await?;
        }

        if let Some(object) = source_video.as_object_mut() {
            object.insert("localPath".into(), json!(relative_path));
            object.insert("localSha256".into(), json!(digest));
        }
        if !storage_ref.is_empty() {
            replacements.push((storage_ref, relative_path.clone()));
        }
        replacements.push((download_ref, relative_path));
    }

    let html = input_json
        .get("compositionHtml")
        .and_then(Value::as_str)
        .ok_or_else(|| "HyperFrames compositionHtml is missing".to_string())?;
    let mut staged_html = html.to_string();
    for (from, to) in replacements {
        staged_html = staged_html.replace(&from, &to);
    }
    if staged_html.contains("http://") || staged_html.contains("https://") {
        return Err(
            "HyperFrames compositionHtml still references remote video URLs after staging".into(),
        );
    }
    if !staged_html.contains("source-video") || !staged_html.contains("assets/") {
        return Err(
            "HyperFrames compositionHtml was not rewritten to staged source video assets".into(),
        );
    }
    if let Some(object) = input_json.as_object_mut() {
        object.insert("compositionHtml".into(), json!(staged_html));
    }
    Ok(())
}

fn resolve_worker_download_url(
    server_url: &str,
    download_ref: &str,
) -> Result<reqwest::Url, String> {
    if download_ref.starts_with("http://") || download_ref.starts_with("https://") {
        return reqwest::Url::parse(download_ref)
            .map_err(|error| format!("invalid asset downloadUrl: {error}"));
    }
    if download_ref.starts_with('/') {
        return reqwest::Url::parse(server_url)
            .map_err(|error| format!("invalid worker server URL: {error}"))?
            .join(download_ref.trim_start_matches('/'))
            .map_err(|error| format!("invalid relative asset downloadUrl: {error}"));
    }
    Err("asset downloadUrl must be absolute http(s) or server-relative".into())
}

async fn download_source_asset(url: &reqwest::Url, path: &Path) -> Result<String, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|error| format!("failed to build source asset downloader: {error}"))?
        .get(url.clone())
        .header("Accept", "video/*,application/octet-stream")
        .send()
        .await
        .map_err(|error| format!("failed to download source video asset: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "source video download returned HTTP {}",
            response.status()
        ));
    }

    if response
        .content_length()
        .is_some_and(|size| size > HYPERFRAMES_SOURCE_MAX_BYTES)
    {
        return Err(format!(
            "source video asset is too large (maximum {} bytes)",
            HYPERFRAMES_SOURCE_MAX_BYTES
        ));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create staged source directory: {error}"))?;
    }
    let partial_path = path.with_extension("part");
    let _ = fs::remove_file(&partial_path);
    let result = async {
        let mut file = fs::File::create(&partial_path)
            .map_err(|error| format!("failed to create partial source video: {error}"))?;
        let mut digest = Sha256::new();
        let mut total_bytes = 0_u64;
        let mut response = response;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("failed to read source video asset body: {error}"))?
        {
            total_bytes = total_bytes.saturating_add(chunk.len() as u64);
            if total_bytes > HYPERFRAMES_SOURCE_MAX_BYTES {
                return Err(format!(
                    "source video asset is too large (maximum {} bytes)",
                    HYPERFRAMES_SOURCE_MAX_BYTES
                ));
            }
            file.write_all(&chunk)
                .map_err(|error| format!("failed to write staged source video: {error}"))?;
            digest.update(&chunk);
        }
        if total_bytes < HYPERFRAMES_FINAL_VIDEO_MIN_BYTES {
            return Err("source video asset is too small to be a real video".into());
        }
        file.flush()
            .map_err(|error| format!("failed to flush staged source video: {error}"))?;
        drop(file);
        let _ = fs::remove_file(path);
        fs::rename(&partial_path, path)
            .map_err(|error| format!("failed to finalize staged source video: {error}"))?;
        Ok(format!("{:x}", digest.finalize()))
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&partial_path);
    }
    result
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("failed to read staged source video: {error}"))?;
    let mut reader = BufReader::with_capacity(1024 * 1024, file);
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|error| format!("failed to hash staged source video: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        digest.update(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn sanitize_file_stem(value: &str, fallback_index: usize) -> String {
    let stem = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if stem.is_empty() {
        format!("shot_{fallback_index}")
    } else {
        stem
    }
}

async fn run_sidecar_with_active_heartbeat(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job: &ClaimedWorkerJob,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    command: &SidecarCommandPlan,
    cancel: &Arc<AtomicBool>,
    app_data_dir: &Path,
    mut next_sequence_number: u32,
) -> Result<u32, String> {
    let log_path = command.current_dir.join("render.log");
    let mut log_file = fs::File::create(&log_path)
        .map_err(|error| format!("failed to create render.log: {error}"))?;

    if let Ok(_html) = std::fs::read_to_string(command.current_dir.join("index.html")) {
        use std::io::Write;
        let _ = writeln!(
            log_file,
            "[Preflight] =========================================="
        );
        let _ = writeln!(log_file, "[Preflight] Loading index.html layout...");
        let _ = writeln!(
            log_file,
            "[Preflight] ==========================================\n"
        );
    }

    let log_file_err = log_file
        .try_clone()
        .map_err(|error| format!("failed to clone render.log handle: {error}"))?;

    let mut cmd = Command::new(&command.executable);
    cmd.args(&command.args)
        .current_dir(&command.current_dir)
        .envs(&command.envs)
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_err));

    if command.stdin_data.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("failed to start HyperFrames sidecar: {error}"))?;
    crate::diagnostics::append_diagnostic_event(
        app_data_dir,
        "sidecar.started",
        json!({
            "kind": "hyperframes",
            "jobId": job.id,
            "executable": command.executable.to_string_lossy(),
            "logPath": log_path.to_string_lossy(),
        }),
    );

    if let Some(stdin_data) = &command.stdin_data {
        if let Some(mut stdin) = child.stdin.take() {
            let data = stdin_data.clone();
            std::thread::spawn(move || {
                use std::io::Write;
                let _ = stdin.write_all(data.as_bytes());
            });
        }
    }

    let mut log_reader = fs::File::open(&log_path).map(std::io::BufReader::new).ok();
    let mut current_progress_line = String::new();
    let mut live_log_tail_lines: Vec<String> = Vec::new();

    let command_string = if let Some(stdin) = &command.stdin_data {
        format!(
            "cd {}\n\n$script = @'\n{}\n'@\n\n$script | {} {}",
            command.current_dir.display(),
            stdin,
            command.executable.display(),
            command.args.join(" ")
        )
    } else {
        format!(
            "cd {} && {} {}",
            command.current_dir.display(),
            command.executable.display(),
            command.args.join(" ")
        )
    };

    let preview_command_string = if let Some(stdin) = &command.preview_stdin_data {
        Some(format!(
            "cd {}\n\n$script = @'\n{}\n'@\n\n$script | {} {}",
            command.current_dir.display(),
            stdin,
            command.executable.display(),
            command.args.join(" ")
        ))
    } else {
        None
    };

    let started_at = Instant::now();
    let timeout = Duration::from_secs(3600); // 1 hour timeout
    let mut last_heartbeat = Instant::now() - ACTIVE_HEARTBEAT_INTERVAL;

    loop {
        if cancel.load(Ordering::Relaxed) {
            terminate_sidecar_child(&mut child, command);
            crate::diagnostics::log_warn(
                app_data_dir,
                "sidecar.stopped",
                json!({ "kind": "hyperframes", "jobId": job.id, "reason": "cancelled" }),
            );
            return Err("worker loop stopped while HyperFrames sidecar was running".into());
        }

        if started_at.elapsed() >= timeout {
            terminate_sidecar_child(&mut child, command);
            crate::diagnostics::log_error(
                app_data_dir,
                "sidecar.timeout",
                json!({ "kind": "hyperframes", "jobId": job.id, "elapsedMs": started_at.elapsed().as_millis() as u64 }),
            );
            return Err("HyperFrames sidecar timed out after 1 hour of rendering".into());
        }

        if last_heartbeat.elapsed() >= ACTIVE_HEARTBEAT_INTERVAL {
            let _ =
                crate::commands::try_refresh_connection_if_needed(app_data_dir, connection).await;
            let connection_snapshot = clone_connection(connection)?;
            let _ = heartbeat(
                executor,
                app_data_dir,
                &connection_snapshot,
                settings,
                doctor,
                true,
                None,
                true,
                false,
                None,
                None,
                None,
            )
            .await;
            let keepalive = build_sidecar_keepalive_event(
                job,
                parse_render_log_percent(&current_progress_line).unwrap_or(55),
                &current_progress_line,
            );
            if let Err(error) = send_progress_event_with_next_sequence(
                app_data_dir,
                connection,
                &job.id,
                keepalive,
                &mut next_sequence_number,
            )
            .await
            {
                terminate_sidecar_child(&mut child, command);
                return Err(format!(
                    "Active render lease keepalive failed while HyperFrames sidecar was running: {error}"
                ));
            }
            last_heartbeat = Instant::now();
        }

        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                crate::diagnostics::append_diagnostic_event(
                    app_data_dir,
                    "sidecar.exited",
                    json!({
                        "kind": "hyperframes",
                        "jobId": job.id,
                        "success": true,
                        "status": status.to_string(),
                        "elapsedMs": started_at.elapsed().as_millis() as u64,
                        "capturedLogLines": live_log_tail_lines.len(),
                        "outputTail": build_failure_log_excerpt(live_log_tail_lines.clone()),
                    }),
                );
                return Ok(next_sequence_number);
            }
            Ok(Some(status)) => {
                crate::diagnostics::log_error(
                    app_data_dir,
                    "sidecar.exited",
                    json!({
                        "kind": "hyperframes",
                        "jobId": job.id,
                        "success": false,
                        "status": status.to_string(),
                        "elapsedMs": started_at.elapsed().as_millis() as u64,
                        "capturedLogLines": live_log_tail_lines.len(),
                        "outputTail": build_failure_log_excerpt(live_log_tail_lines.clone()),
                    }),
                );
                let mut error_msg = format!("HyperFrames sidecar exited with {status}.");
                if let Some(reader) = &mut log_reader {
                    use std::io::BufRead;
                    let lines: Vec<String> = reader.lines().filter_map(Result::ok).collect();
                    if !lines.is_empty() {
                        let excerpt = build_failure_log_excerpt(lines);
                        error_msg.push_str(&format!("\n\nLogs:\n{}", excerpt));
                    }
                } else if !current_progress_line.is_empty() {
                    error_msg.push_str(&format!("\n\nLogs:\n{}", current_progress_line));
                }
                return Err(error_msg);
            }
            Ok(None) => {
                let mut log_tail_str = String::new();
                let mut render_progress_percent = None;
                let mut structured_events: Vec<Value> = Vec::new();
                if let Some(reader) = &mut log_reader {
                    use std::io::BufRead;
                    let mut line = String::new();
                    while let Ok(bytes) = reader.read_line(&mut line) {
                        if bytes == 0 {
                            break;
                        }
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            if let Some(event) = parse_sidecar_worker_event_line(trimmed) {
                                if let Some(percent) = sidecar_event_percent(&event) {
                                    render_progress_percent = Some(percent);
                                }
                                current_progress_line = sidecar_event_message(&event)
                                    .unwrap_or_else(|| trimmed.to_string());
                                live_log_tail_lines.push(current_progress_line.clone());
                                structured_events.push(event);
                            } else {
                                current_progress_line = trimmed.to_string();
                                if let Some(percent) = parse_render_log_percent(trimmed) {
                                    render_progress_percent = Some(percent);
                                }
                                live_log_tail_lines.push(trimmed.to_string());
                            }
                            if live_log_tail_lines.len() > LIVE_RENDER_LOG_TAIL_LINES * 2 {
                                let keep_from = live_log_tail_lines
                                    .len()
                                    .saturating_sub(LIVE_RENDER_LOG_TAIL_LINES);
                                live_log_tail_lines.drain(0..keep_from);
                            }
                        }
                        line.clear();
                    }
                    if !live_log_tail_lines.is_empty() {
                        log_tail_str = build_live_render_log_tail(&live_log_tail_lines);
                    } else if !current_progress_line.is_empty() {
                        log_tail_str = current_progress_line.clone();
                    }
                }

                set_executor_sidecar_progress(
                    executor,
                    render_progress_percent.unwrap_or(44),
                    Some(command_string.clone()),
                    preview_command_string.clone(),
                    if log_tail_str.is_empty() {
                        None
                    } else {
                        Some(log_tail_str)
                    },
                );

                for event in structured_events {
                    let percent = sidecar_event_percent(&event)
                        .or(render_progress_percent)
                        .unwrap_or(55);
                    let structured_event = build_sidecar_structured_event(job, event, percent);
                    if let Err(error) = send_progress_event_with_next_sequence(
                        app_data_dir,
                        connection,
                        &job.id,
                        structured_event,
                        &mut next_sequence_number,
                    )
                    .await
                    {
                        terminate_sidecar_child(&mut child, command);
                        crate::diagnostics::log_error(
                            app_data_dir,
                            "sidecar.progress_failed",
                            json!({ "kind": "hyperframes", "jobId": job.id, "error": error.to_string() }),
                        );
                        return Err(format!(
                            "Active render progress event failed while HyperFrames sidecar was running: {error}"
                        ));
                    }
                }

                sleep_cancelable(Duration::from_millis(500), cancel).await;
            }
            Err(error) => {
                crate::diagnostics::log_error(
                    app_data_dir,
                    "sidecar.monitor_failed",
                    json!({ "kind": "hyperframes", "jobId": job.id, "error": error.to_string() }),
                );
                return Err(format!("failed to monitor HyperFrames sidecar: {error}"));
            }
        }
    }
}

fn terminate_sidecar_child(child: &mut Child, command: &SidecarCommandPlan) {
    let _ = child.kill();
    let _ = child.wait();
    run_sidecar_cleanup(command);
}

fn run_sidecar_cleanup(command: &SidecarCommandPlan) {
    let Some(cleanup) = &command.cleanup else {
        return;
    };
    let mut cmd = Command::new(&cleanup.executable);
    cmd.args(&cleanup.args)
        .current_dir(&cleanup.current_dir)
        .envs(&cleanup.envs)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if cleanup.stdin_data.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    if let Ok(mut child) = cmd.spawn() {
        if let Some(stdin_data) = &cleanup.stdin_data {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(stdin_data.as_bytes());
            }
        }
        let _ = child.wait();
    }
}

async fn send_event(
    connection: &WorkerLoopConnection,
    job_id: &str,
    event: WorkerEventPlan,
) -> Result<(), String> {
    let payload = WorkerJobEventPayload {
        event_type: event.event_type,
        payload_json: event.payload_json,
        sequence_number: Some(event.sequence_number),
        lease_owner_token: event.lease_owner_token,
        assignment_attempt: Some(event.assignment_attempt),
    };
    report_worker_job_event(connection, job_id, &payload)
        .await
        .map(|_| ())
}

fn is_expired_worker_token_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("jwt expired")
        || normalized.contains("token expired")
        || normalized.contains("expired token")
}

fn is_stale_worker_lease_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("stale_worker_lease")
        || normalized.contains("worker lease token is stale")
        || normalized.contains("worker lease has expired")
        || normalized.contains("worker lease token is stale or invalid")
}

async fn refresh_connection_for_control_plane(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    context: &str,
) -> Result<WorkerLoopConnection, String> {
    crate::commands::try_refresh_connection_if_needed(app_data_dir, connection)
        .await
        .map_err(|error| format!("failed to refresh worker token before {context}: {error}"))?;
    clone_connection(connection)
}

async fn refresh_connection_after_expired_token(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    context: &str,
    previous_error: &str,
) -> Result<WorkerLoopConnection, String> {
    crate::commands::try_refresh_connection_if_needed(app_data_dir, connection)
        .await
        .map_err(|error| {
            format!(
                "{previous_error}; worker token expired and refresh before retry failed during {context}: {error}"
            )
        })?;
    clone_connection(connection)
}

async fn send_event_once_with_refresh(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job_id: &str,
    event: WorkerEventPlan,
) -> Result<(), String> {
    let connection_snapshot =
        refresh_connection_for_control_plane(app_data_dir, connection, "worker event").await?;
    match send_event(&connection_snapshot, job_id, event.clone()).await {
        Ok(()) => Ok(()),
        Err(error) if is_expired_worker_token_error(&error) => {
            let connection_snapshot = refresh_connection_after_expired_token(
                app_data_dir,
                connection,
                "worker event retry",
                &error,
            )
            .await?;
            send_event(&connection_snapshot, job_id, event)
                .await
                .map_err(|retry_error| {
                    format!("{retry_error}; previous worker event attempt failed with: {error}")
                })
        }
        Err(error) => Err(error),
    }
}

async fn send_event_with_refresh(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job_id: &str,
    event: WorkerEventPlan,
) -> Result<(), String> {
    let mut last_error = None;

    for attempt in 0..WORKER_EVENT_MAX_ATTEMPTS {
        match send_event_once_with_refresh(app_data_dir, connection, job_id, event.clone()).await {
            Ok(()) => return Ok(()),
            Err(error)
                if is_retryable_worker_event_error(&error)
                    && attempt + 1 < WORKER_EVENT_MAX_ATTEMPTS =>
            {
                last_error = Some(error.clone());
                append_diagnostic_event(
                    app_data_dir,
                    "worker.event.retry",
                    json!({
                        "jobId": job_id,
                        "attempt": attempt + 1,
                        "maxAttempts": WORKER_EVENT_MAX_ATTEMPTS,
                        "errorClass": "transient_worker_event_transport",
                    }),
                );
                let backoff = WORKER_EVENT_RETRY_BACKOFF_MS
                    .get(attempt as usize)
                    .copied()
                    .unwrap_or(750);
                tokio::time::sleep(Duration::from_millis(backoff)).await;
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error.unwrap_or_else(|| "worker event failed without an error".into()))
}

fn is_retryable_worker_event_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    if is_expired_worker_token_error(message)
        || is_terminal_worker_auth_error(message)
        || is_stale_worker_lease_error(message)
    {
        return false;
    }

    [
        "failed to read control plane response",
        "worker control plane request failed",
        "worker control plane request timed out",
        "http 408 request timeout",
        "http 425 too early",
        "http 429 too many requests",
        "http 500 internal server error",
        "http 502 bad gateway",
        "http 503 service unavailable",
        "http 504 gateway timeout",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

async fn upload_worker_artifact_file_with_refresh(
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    job_id: &str,
    artifact_type: &str,
    file_path: &Path,
    file_name: &str,
    content_type: &str,
    lease_owner_token: &str,
    assignment_attempt: &str,
    metadata_json: Value,
) -> Result<crate::worker_control_plane::WorkerArtifactCompleteResponse, String> {
    let connection_snapshot =
        refresh_connection_for_control_plane(app_data_dir, connection, "artifact upload").await?;
    match upload_worker_artifact_file(
        &connection_snapshot,
        job_id,
        artifact_type,
        file_path,
        file_name,
        content_type,
        lease_owner_token,
        assignment_attempt,
        metadata_json.clone(),
    )
    .await
    {
        Ok(response) => Ok(response),
        Err(error) if is_expired_worker_token_error(&error) => {
            let connection_snapshot = refresh_connection_after_expired_token(
                app_data_dir,
                connection,
                "artifact upload retry",
                &error,
            )
            .await?;
            upload_worker_artifact_file(
                &connection_snapshot,
                job_id,
                artifact_type,
                file_path,
                file_name,
                content_type,
                lease_owner_token,
                assignment_attempt,
                metadata_json,
            )
            .await
            .map_err(|retry_error| {
                format!("{retry_error}; previous artifact upload attempt failed with: {error}")
            })
        }
        Err(error) => Err(error),
    }
}

fn workspace_root(
    settings: &WorkerAppSettings,
    resource_dir: &Path,
    app_data_dir: &Path,
) -> Result<PathBuf, String> {
    if !settings.workspace_dir.trim().is_empty() {
        let root = PathBuf::from(settings.workspace_dir.trim());
        fs::create_dir_all(&root)
            .map_err(|error| format!("failed to create worker workspace: {error}"))?;
        return Ok(root);
    }

    let mut candidates = Vec::new();
    if !settings.runtime_dir.trim().is_empty() {
        candidates.push(PathBuf::from(settings.runtime_dir.trim()).join("worker-workspace"));
    }
    if let Some(install_dir) = resource_dir.parent() {
        candidates.push(install_dir.join("worker-workspace"));
    }
    candidates.push(app_data_dir.join("worker-workspace"));

    let mut errors = Vec::new();
    for root in candidates {
        match fs::create_dir_all(&root) {
            Ok(()) => return Ok(root),
            Err(error) => errors.push(format!("{}: {error}", root.display())),
        }
    }

    Err(format!(
        "failed to create worker workspace in runtime/install/app data locations: {}",
        errors.join("; ")
    ))
}

fn has_active_job(executor: &Arc<Mutex<ExecutorState>>) -> Result<bool, String> {
    executor
        .lock()
        .map(|state| matches!(state.status, ExecutorStatus::Running))
        .map_err(|_| "executor lock poisoned".to_string())
}

fn current_queue_depth(executor: &Arc<Mutex<ExecutorState>>) -> Result<u32, String> {
    executor
        .lock()
        .map(|state| state.queue_depth)
        .map_err(|_| "executor lock poisoned".to_string())
}

fn clone_connection(
    connection: &Arc<Mutex<WorkerLoopConnection>>,
) -> Result<WorkerLoopConnection, String> {
    connection
        .lock()
        .map(|connection| connection.clone())
        .map_err(|_| "worker loop connection lock poisoned".to_string())
}

// The three loop-lifecycle transitions below run on EVERY tick (10s), including
// while a spawned render job is still executing. They report the state of the
// LOOP, never of the jobs — so they delegate to `apply_loop_status`, which
// preserves anything still in flight (2026-08-01 incident: a lone render job
// vanished from the panel one tick after it started).
fn set_executor_polling(executor: &Arc<Mutex<ExecutorState>>, message: impl Into<String>) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = true;
        state.apply_loop_status(ExecutorStatus::Polling, message.into());
    }
}

fn set_executor_paused(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.apply_loop_status(ExecutorStatus::Paused, message.into());
    }
}

fn set_executor_idle(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.apply_loop_status(ExecutorStatus::Idle, message.into());
    }
}

fn set_executor_error(executor: &Arc<Mutex<ExecutorState>>, message: String) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.status = ExecutorStatus::Error;
        state.last_message = message;
    }
}

fn set_executor_queue_depth(executor: &Arc<Mutex<ExecutorState>>, queue_depth: u32) {
    if let Ok(mut state) = executor.lock() {
        state.set_queue_depth(queue_depth);
    }
}

fn set_executor_job(executor: &Arc<Mutex<ExecutorState>>, job: &ClaimedWorkerJob) {
    if let Ok(mut state) = executor.lock() {
        let metadata = build_worker_job_display_metadata(job);
        state.start_job_with_created_at(
            job.id.clone(),
            metadata.label,
            job.job_type.clone(),
            metadata.project_id,
            metadata.project_name,
            job.created_at.clone(),
        );
    }
}

/// Records progress for `job_id`. Writes BOTH the per-job entry (authoritative
/// while several lanes run at once) and the legacy top-level fields, but the
/// legacy fields are only touched when this job is the displayed primary —
/// otherwise a Hermes job's progress would visibly rewind an in-flight render's
/// percentage (2026-07-30 incident).
fn update_executor_progress(
    executor: &Arc<Mutex<ExecutorState>>,
    job_id: &str,
    progress_percent: u8,
    message: impl Into<String>,
) {
    let message = message.into();
    if let Ok(mut state) = executor.lock() {
        state.update_job_progress(job_id, progress_percent, &message);
        if state.current_job_id.as_deref() == Some(job_id) {
            state.update_progress(progress_percent, message);
        }
    }
}

fn set_executor_sidecar_progress(
    executor: &Arc<Mutex<ExecutorState>>,
    progress_percent: u8,
    manual_command: Option<String>,
    preview_command: Option<String>,
    log_tail: Option<String>,
) {
    if let Ok(mut state) = executor.lock() {
        state.update_sidecar_progress(progress_percent, manual_command, preview_command, log_tail);
    }
}

fn update_progress_from_event(
    executor: &Arc<Mutex<ExecutorState>>,
    job_id: &str,
    event: &WorkerEventPlan,
) {
    let percent = event
        .payload_json
        .get("percent")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(100) as u8;
    let message = event
        .payload_json
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("HyperFrames progress")
        .to_string();
    update_executor_progress(executor, job_id, percent, message);
}

/// Lane-scoped completion. Removes ONLY `job_id` from the in-flight set and,
/// when other lanes are still working, leaves the executor in `Running` with
/// a promoted primary job instead of reporting the whole worker idle.
///
/// Field incident 2026-07-30: a Hermes image job finishing mid-render called
/// the global `set_executor_complete` above, which cleared the single
/// current-job slot — the app showed "No active job" while the same worker was
/// at `render_frames 60%` on the server.
fn set_executor_job_complete(executor: &Arc<Mutex<ExecutorState>>, job_id: &str, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.finish_job(job_id);
        state.accepting_jobs = true;
        if state.current_job_id.is_some() {
            state.status = ExecutorStatus::Running;
        } else {
            state.status = ExecutorStatus::Polling;
            state.progress_percent = 100;
            state.last_message = message.into();
        }
    }
}

/// Lane-scoped failure counterpart of `set_executor_job_complete`. A failure
/// in one lane must not flip the whole worker to `Error` (and stop it
/// accepting jobs) while another lane is mid-render.
fn set_executor_job_error(executor: &Arc<Mutex<ExecutorState>>, job_id: &str, message: String) {
    if let Ok(mut state) = executor.lock() {
        state.finish_job(job_id);
        if state.current_job_id.is_some() {
            state.status = ExecutorStatus::Running;
            state.accepting_jobs = true;
            state.last_message = message;
        } else {
            state.accepting_jobs = false;
            state.status = ExecutorStatus::Error;
            state.last_message = message;
        }
    }
}

fn set_executor_last_job(
    executor: &Arc<Mutex<ExecutorState>>,
    job: &ClaimedWorkerJob,
    status: &str,
    message: &str,
    log_path: Option<String>,
) {
    if let Ok(mut state) = executor.lock() {
        let metadata = build_worker_job_display_metadata(job);
        state.update_last_completed_job(crate::executor_state::LastJobSummary {
            job_id: job.id.clone(),
            job_label: metadata.label,
            project_name: metadata.project_name,
            status: status.to_string(),
            message: message.to_string(),
            log_path,
        });
    }
}

fn is_terminal_worker_auth_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    if normalized.contains("jwt expired") || normalized.contains("token expired") {
        return false;
    }
    [
        "http 401 unauthorized",
        "worker token has been revoked",
        "used from a different device",
        "device proof",
        "wrong device",
        "worker_auth_invalid",
        "worker_auth_revoked",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn terminal_worker_auth_message(error: &str) -> String {
    if error
        .to_lowercase()
        .contains("used from a different device")
    {
        return "Worker connection was rejected because this token belongs to another device. Click Connect to approve this computer again.".into();
    }
    "Worker connection is no longer valid. Click Connect to approve this Worker App again in your browser.".into()
}

async fn sleep_cancelable(duration: Duration, cancel: &AtomicBool) {
    let slice = Duration::from_millis(250);
    let mut elapsed = Duration::ZERO;
    while elapsed < duration && !cancel.load(Ordering::Relaxed) {
        let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(slice)).await;
        elapsed += slice;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::ensure_device_proof_material;
    use crate::worker_control_plane::WorkerApiTokens;

    #[test]
    fn media_binding_projection_reads_canonical_and_legacy_shapes() {
        assert_eq!(
            read_media_binding_projection(&json!({
                "binding": { "bindingRevision": 7, "status": "active" }
            })),
            (Some(7), Some("active".to_string()))
        );
        assert_eq!(
            read_media_binding_projection(&json!({
                "item": { "bindingRevision": 8, "bindingStatus": "stale" }
            })),
            (Some(8), Some("stale".to_string()))
        );
    }

    #[test]
    fn render_task_failure_view_does_not_clone_job_payload() {
        let job = ClaimedWorkerJob {
            id: "job-123".into(),
            job_type: REMOTION_RENDER_VIDEO_JOB_TYPE.into(),
            created_at: Some("2026-08-31T00:00:00Z".into()),
            lease_owner_token: "lease".into(),
            assignment_attempt: "attempt".into(),
            input_json: json!({ "remotionTemplate": { "composition": "large" } }),
            capability_requirements_json: json!({ "capability": "render" }),
            reference_urls: vec![],
        };

        let view = job_failure_report_view(&job);

        assert_eq!(view.id, job.id);
        assert_eq!(view.lease_owner_token, job.lease_owner_token);
        assert_eq!(view.assignment_attempt, job.assignment_attempt);
        assert!(view.input_json.is_null());
        assert!(view.capability_requirements_json.is_null());
        assert!(view.reference_urls.is_empty());
    }

    #[test]
    fn hyperframes_transcript_output_is_normalized_from_transcript_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("transcript.json"),
            r#"[{"text":"สวัสดี","start":0.1,"end":0.8},{"word":"ครับ","start":0.9,"end":1.2}]"#
                .as_bytes(),
        )
        .unwrap();
        let normalized = normalize_hyperframes_transcript_output(
            &json!({ "ok": true, "transcriptPath": "ignored-by-worker" }),
            dir.path(),
        )
        .unwrap();
        assert_eq!(normalized["text"], "สวัสดี ครับ");
        assert_eq!(normalized["words"].as_array().unwrap().len(), 2);
        assert_eq!(transcript_text_and_tokens(&normalized).0, "สวัสดี ครับ");
    }

    #[test]
    fn empty_hyperframes_transcript_is_reported_without_false_success() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("transcript.json"), b"[]").unwrap();
        let normalized =
            normalize_hyperframes_transcript_output(&json!({ "ok": true }), dir.path()).unwrap();

        assert_eq!(normalized["status"], "empty");
        assert_eq!(normalized["text"], "");
        assert!(normalized["words"].as_array().unwrap().is_empty());
    }

    #[test]
    fn runtime_relative_path_rejects_absolute_and_parent_paths() {
        let root = Path::new("/runtime-pack");
        assert!(runtime_relative_path(root, "/etc/passwd").is_none());
        assert!(runtime_relative_path(root, "../outside").is_none());
        assert_eq!(
            runtime_relative_path(root, "whisper/whisper-cli").unwrap(),
            root.join("whisper/whisper-cli")
        );
    }

    #[test]
    fn managed_wsl_root_expression_quotes_home_suffix_as_a_literal() {
        assert_eq!(managed_wsl_root_expr("~"), "\"$HOME\"");
        assert_eq!(
            managed_wsl_root_expr("~/runtime pack/$HOME`touch /tmp/pwned`"),
            "\"$HOME\"/'runtime pack/$HOME`touch /tmp/pwned`'"
        );
        assert_eq!(
            managed_wsl_root_expr("C:\\Program Files\\Smart AI Hub"),
            "'C:\\Program Files\\Smart AI Hub'"
        );
    }

    #[test]
    fn comfy_output_extension_comes_from_url_or_content_type() {
        let video_url =
            reqwest::Url::parse("https://comfy.example/output/result.mp4?token=redacted").unwrap();
        assert_eq!(
            safe_output_extension(&video_url, Some("application/octet-stream")),
            "mp4"
        );

        let image_url = reqwest::Url::parse("https://comfy.example/output/result").unwrap();
        assert_eq!(
            safe_output_extension(&image_url, Some("image/png; charset=binary")),
            "png"
        );

        assert_eq!(
            safe_output_extension(&image_url, Some("application/octet-stream")),
            "bin"
        );
    }

    #[test]
    fn local_media_source_resolution_rejects_absolute_and_traversal_paths_before_probe() {
        let root = Path::new("/worker/series");
        assert_eq!(
            resolve_worker_media_source_path(root, "../outside.mp4"),
            Err("relative_path_escape".into())
        );
        assert_eq!(
            resolve_worker_media_source_path(root, "/outside.mp4"),
            Err("relative_path_escape".into())
        );
        assert_eq!(
            resolve_worker_media_source_path(root, "nested\\outside.mp4"),
            Err("relative_path_escape".into())
        );
    }

    #[test]
    fn runtime_block_message_is_generic_for_current_capability_lanes() {
        let message = runtime_block_message(&DoctorSummary {
            status: "blocked".into(),
            checks: vec![crate::runtime_manifest::DoctorCheck {
                id: "media_tools".into(),
                status: "error".into(),
                message: "FFmpeg or ffprobe is missing.".into(),
                details_json: json!({}),
            }],
            recommended_actions: vec!["Install the media runtime pack".into()],
            official_hyperframes_runtime: None,
            runtime_kind: None,
        });

        assert!(message.starts_with("No local Worker capability is ready."));
        assert!(!message.contains("HyperFrames"));
    }

    #[test]
    fn worker_loop_task_failure_is_recorded_without_panicking_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let executor = Arc::new(Mutex::new(ExecutorState::default()));
        let stopped = Arc::new(AtomicBool::new(false));
        let loop_task = tauri::async_runtime::spawn(async {
            panic!("simulated worker loop task panic");
        });
        let supervisor = tauri::async_runtime::spawn(supervise_worker_loop(
            loop_task,
            executor.clone(),
            dir.path().to_path_buf(),
            stopped.clone(),
        ));

        tauri::async_runtime::block_on(async {
            supervisor.await.unwrap();
        });

        assert!(stopped.load(Ordering::Relaxed));
        let state = executor.lock().unwrap();
        assert_eq!(state.status, ExecutorStatus::Error);
        assert!(state.last_message.contains("stopped unexpectedly"));
        drop(state);

        let log = fs::read_to_string(crate::diagnostics::diagnostic_log_path(dir.path())).unwrap();
        assert!(log.contains("worker_loop.task_failed"));
    }

    #[test]
    fn render_runtime_readiness_does_not_block_on_transcription_lane() {
        let legacy_required = [
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
            "installer_set",
        ];
        let mut checks = legacy_required
            .iter()
            .map(|id| crate::runtime_manifest::DoctorCheck {
                id: (*id).into(),
                status: "ok".into(),
                message: "ready".into(),
                details_json: json!({}),
            })
            .collect::<Vec<_>>();
        checks.push(crate::runtime_manifest::DoctorCheck {
            id: "transcription_runtime".into(),
            status: "error".into(),
            message: "not installed".into(),
            details_json: json!({}),
        });
        let legacy = DoctorSummary {
            status: "blocked".into(),
            checks,
            recommended_actions: vec![],
            official_hyperframes_runtime: Some(true),
            runtime_kind: Some("official_hyperframes".into()),
        };
        assert!(render_runtime_ready(&legacy));

        let managed = DoctorSummary {
            status: "blocked".into(),
            checks: vec![
                crate::runtime_manifest::DoctorCheck {
                    id: "wsl2_host".into(),
                    status: "ok".into(),
                    message: "ready".into(),
                    details_json: json!({}),
                },
                crate::runtime_manifest::DoctorCheck {
                    id: "managed_wsl_runtime".into(),
                    status: "ok".into(),
                    message: "ready".into(),
                    details_json: json!({}),
                },
                crate::runtime_manifest::DoctorCheck {
                    id: "installer_set".into(),
                    status: "ok".into(),
                    message: "ready".into(),
                    details_json: json!({}),
                },
                crate::runtime_manifest::DoctorCheck {
                    id: "transcription_runtime".into(),
                    status: "error".into(),
                    message: "not installed".into(),
                    details_json: json!({}),
                },
            ],
            recommended_actions: vec![],
            official_hyperframes_runtime: Some(true),
            runtime_kind: Some("official_hyperframes".into()),
        };
        assert!(render_runtime_ready(&managed));

        let mut render_blocked = legacy.clone();
        render_blocked
            .checks
            .iter_mut()
            .find(|check| check.id == "browser_runtime")
            .unwrap()
            .status = "error".into();
        assert!(!render_runtime_ready(&render_blocked));
    }

    #[test]
    fn remotion_claim_hints_include_capability_families_only_when_render_ready() {
        let ready = build_worker_claim_capability_hints(true, false);
        assert!(ready.contains(&"remotion-render".to_string()));
        assert!(ready.contains(&"chromium-render".to_string()));
        assert!(ready.contains(&"ffmpeg-probe".to_string()));
        assert!(ready.contains(&REMOTION_RENDER_VIDEO_JOB_TYPE.to_string()));

        let not_ready = build_worker_claim_capability_hints(false, false);
        assert!(!not_ready.contains(&"remotion-render".to_string()));
        assert!(not_ready.is_empty());
    }

    #[test]
    fn local_media_claim_hints_are_independent_from_render_doctor() {
        let local_only = build_worker_claim_capability_hints_with_media(false, false, false, true);
        assert!(local_only.contains(&VERTICAL_DRAMA_MEDIA_CAPABILITY.to_string()));
        assert!(local_only.contains(&VERTICAL_DRAMA_MEDIA_INGEST_JOB_TYPE.to_string()));
        assert!(local_only.contains(&VERTICAL_DRAMA_BROLL_PREPROCESS_JOB_TYPE.to_string()));
        assert!(!local_only.contains(&HYPERFRAMES_JOB_TYPE.to_string()));

        let unavailable =
            build_worker_claim_capability_hints_with_media(false, false, false, false);
        assert!(unavailable.is_empty());
    }

    #[test]
    fn mcp_claim_hints_are_separate_from_local_media_hints() {
        let mcp_only = build_worker_claim_capability_hints_with_media_and_mcp(
            false, false, false, false, true,
        );
        assert!(mcp_only.contains(&VERTICAL_DRAMA_MEDIA_CAPABILITY.to_string()));
        assert!(mcp_only.contains(&VERTICAL_DRAMA_SHOT_VIDEO_GENERATION_JOB_TYPE.to_string()));
        assert!(!mcp_only.contains(&VERTICAL_DRAMA_MEDIA_INGEST_JOB_TYPE.to_string()));
        assert!(!mcp_only.contains(&VERTICAL_DRAMA_BROLL_PREPROCESS_JOB_TYPE.to_string()));
    }

    #[test]
    fn remotion_claim_hints_require_the_current_runtime_pack_contract() {
        let current = DoctorSummary {
            status: "ready".into(),
            checks: vec![crate::runtime_manifest::DoctorCheck {
                id: "runtime_manifest".into(),
                status: "ok".into(),
                message: "ready".into(),
                details_json: json!({
                    "remotionPlatformContractVersion": REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
                }),
            }],
            recommended_actions: vec![],
            official_hyperframes_runtime: Some(true),
            runtime_kind: Some("official_hyperframes".into()),
        };
        let stale = DoctorSummary {
            checks: vec![crate::runtime_manifest::DoctorCheck {
                id: "runtime_manifest".into(),
                status: "ok".into(),
                message: "ready".into(),
                details_json: json!({
                    "remotionPlatformContractVersion": "2026-07-12",
                }),
            }],
            ..current.clone()
        };

        let current_hints = build_worker_claim_capability_hints_with_remotion(
            true,
            remotion_render_video_contract_ready(&current),
            false,
        );
        let stale_hints = build_worker_claim_capability_hints_with_remotion(
            true,
            remotion_render_video_contract_ready(&stale),
            false,
        );

        assert!(current_hints.contains(&REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY.to_string()));
        assert!(!stale_hints.contains(&REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY.to_string()));
        assert!(stale_hints.contains(&HYPERFRAMES_JOB_TYPE.to_string()));

        let managed_wsl = DoctorSummary {
            status: "ready".into(),
            checks: vec![crate::runtime_manifest::DoctorCheck {
                id: "managed_wsl_runtime".into(),
                status: "ok".into(),
                message: "managed runtime ready".into(),
                details_json: serde_json::json!({
                    "remotionPlatformContractVersion": REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
                }),
            }],
            ..current.clone()
        };
        assert!(remotion_render_video_contract_ready(&managed_wsl));
    }

    #[test]
    fn remotion_claim_accepts_a_runtime_that_explicitly_supports_the_current_contract() {
        let compatible_legacy_primary = DoctorSummary {
            status: "ready".into(),
            checks: vec![crate::runtime_manifest::DoctorCheck {
                id: "runtime_manifest".into(),
                status: "ok".into(),
                message: "ready".into(),
                details_json: json!({
                    "remotionPlatformContractVersion": "2026-07-12",
                    "contracts": ["2026-07-12", REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION],
                }),
            }],
            recommended_actions: vec![],
            official_hyperframes_runtime: Some(true),
            runtime_kind: Some("official_hyperframes".into()),
        };

        assert!(remotion_render_video_contract_ready(
            &compatible_legacy_primary
        ));
    }

    #[test]
    fn remotion_sidecar_exit_prefers_captured_terminal_event_over_exit_status() {
        let captured = RemotionRenderOutcome::Completed {
            output_path: "/workspace/out/render.mp4".into(),
            duration_sec: 12.5,
            sha256: "abc123".into(),
            width_px: 1080,
            height_px: 1920,
        };
        let outcome = classify_remotion_sidecar_exit(
            false,
            Some(captured.clone()),
            &[],
            "exit status: 1".into(),
        );
        assert_eq!(outcome, captured);
    }

    #[test]
    fn remotion_sidecar_non_zero_exit_without_failed_event_synthesizes_render_failed() {
        let outcome = classify_remotion_sidecar_exit(
            false,
            None,
            &["fatal: chromium crashed".to_string()],
            "exit status: 1".into(),
        );
        match outcome {
            RemotionRenderOutcome::Failed {
                failure_code,
                message,
            } => {
                assert_eq!(failure_code, "render_failed");
                assert!(message.contains("chromium crashed"));
            }
            RemotionRenderOutcome::Completed { .. } => panic!("expected a Failed outcome"),
        }
    }

    #[test]
    fn remotion_sidecar_zero_exit_without_completed_event_is_also_render_failed() {
        // The frozen sidecar contract guarantees exactly one of
        // completed/failed on every run — a clean exit with neither
        // captured is a contract violation, not a silent success.
        let outcome = classify_remotion_sidecar_exit(true, None, &[], "exit status: 0".into());
        match outcome {
            RemotionRenderOutcome::Failed { failure_code, .. } => {
                assert_eq!(failure_code, "render_failed");
            }
            RemotionRenderOutcome::Completed { .. } => panic!("expected a Failed outcome"),
        }
    }

    #[test]
    fn fix_a_heartbeat_runtime_metadata_carries_real_hermes_readiness() {
        let settings = WorkerAppSettings::default();
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

        let ready_metadata = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_ready,
            true,
            "ready",
            Some((&hermes_ready, Some("0.18.2"))),
            None,
            None,
            None,
        );
        assert_eq!(ready_metadata["hermesMedia"]["advertised"], true);
        assert_eq!(ready_metadata["hermesMedia"]["hermesVersion"], "0.18.2");
        assert_eq!(
            ready_metadata["hermesMedia"]["capability"],
            "hermes-media-generation"
        );

        let comfy_ready = comfy_executor::ComfyReadiness {
            ready: true,
            reason: "system_stats_ok".into(),
        };
        let comfy_metadata = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_ready,
            true,
            "ready",
            None,
            Some(&comfy_ready),
            None,
            None,
        );
        assert_eq!(comfy_metadata["comfyUi"]["advertised"], true);
        assert_eq!(
            comfy_metadata["comfyUi"]["capabilityFamilies"][0],
            "comfyui-image-generate"
        );

        let local_media_metadata = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_ready,
            true,
            "ready",
            None,
            None,
            Some(true),
            Some(false),
        );
        assert_eq!(
            local_media_metadata["verticalDramaMedia"]["mcpReady"],
            false
        );
        assert!(!local_media_metadata["verticalDramaMedia"]["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|capability| capability == "shot_video_generation"));

        let blocked_metadata = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_blocked,
            true,
            "ready",
            Some((&hermes_blocked, None)),
            None,
            None,
            None,
        );
        assert_eq!(blocked_metadata["hermesMedia"]["advertised"], false);

        // The 3 "active heartbeat" call sites (fired during an in-flight
        // HyperFrames render) pass `None` — no hermesMedia key at all, so
        // the server preserves the last-known value instead of clobbering
        // it with a stale/absent probe.
        let no_hermes_info = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_ready,
            true,
            "ready",
            None,
            None,
            None,
            None,
        );
        assert!(no_hermes_info.get("hermesMedia").is_none());
    }

    #[test]
    fn hermes_update_warning_is_extracted_from_heartbeat_response_warnings() {
        assert_eq!(
            find_hermes_update_warning(&[
                "some unrelated warning".to_string(),
                "Hermes runtime version 0.17.0 is below the required minimum 0.18.2.".to_string(),
            ]),
            Some("Hermes runtime version 0.17.0 is below the required minimum 0.18.2.".to_string())
        );
        assert_eq!(find_hermes_update_warning(&["unrelated".to_string()]), None);
        assert_eq!(find_hermes_update_warning(&[]), None);
    }

    #[test]
    fn claim_hints_include_hermes_media_only_when_advertised() {
        let without_hermes = build_worker_claim_capability_hints(true, false);
        assert!(!without_hermes.contains(&"hermes_media".to_string()));
        assert!(without_hermes.contains(&HYPERFRAMES_JOB_TYPE.to_string()));

        let with_hermes = build_worker_claim_capability_hints(true, true);
        assert!(with_hermes.contains(&"hermes_media".to_string()));
        // Render hints are unaffected by the hermes gate.
        assert!(with_hermes.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
        assert!(with_hermes.contains(&"hyperframes-final-composite".to_string()));
    }

    #[test]
    fn render_hints_are_excluded_when_render_doctor_is_not_ready_but_hermes_is() {
        // FIX 1 — a hermes-only worker (no HyperFrames runtime installed)
        // must still be able to claim hermes jobs; render hints must not be
        // advertised while its own doctor is not ready.
        let hermes_only = build_worker_claim_capability_hints(false, true);
        assert!(!hermes_only.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
        assert!(!hermes_only.contains(&"hyperframes-final-composite".to_string()));
        assert!(hermes_only.contains(&"hermes_media".to_string()));

        let neither_ready = build_worker_claim_capability_hints(false, false);
        assert!(neither_ready.is_empty());
    }

    #[test]
    fn hermes_control_terminal_events_preserve_outcome_and_use_a_terminal_sequence() {
        let job = ClaimedWorkerJob {
            id: "job-control".to_string(),
            job_type: "hermes_connection_probe".to_string(),
            created_at: None,
            lease_owner_token: "lease-control".to_string(),
            assignment_attempt: "attempt-control".to_string(),
            input_json: json!({}),
            capability_requirements_json: json!({ "connectionId": "conn-1" }),
            reference_urls: Vec::new(),
        };
        let success = build_hermes_control_terminal_event(
            &job,
            &HermesControlOutcome::Success {
                account_hint: Some("account@example.com".to_string()),
                manifest: Some(json!({ "operations": {} })),
            },
        );
        assert_eq!(success.event_type, "job.completed");
        assert_eq!(success.sequence_number, FAILURE_EVENT_SEQUENCE_NUMBER);
        assert_eq!(success.payload_json["accountHint"], "account@example.com");
        assert_eq!(
            success.payload_json["capabilities"]["operations"],
            json!({})
        );

        let failure = build_hermes_control_terminal_event(
            &job,
            &HermesControlOutcome::Failure {
                error_code: "HERMES_PROCESS_FAILED".to_string(),
                failure_reason: "process_failed".to_string(),
                diagnostic: "runtime failed".to_string(),
            },
        );
        assert_eq!(failure.event_type, "job.failed");
        assert_eq!(failure.payload_json["failureReason"], "process_failed");
        assert_eq!(failure.payload_json["errorCode"], "HERMES_PROCESS_FAILED");
    }

    #[test]
    fn resolve_hermes_claim_hints_reflects_a_real_doctor_computation() {
        // FIX 1 — "with doctor ready the claim sends the hermes_media hint;
        // with doctor degraded it doesn't" against the REAL doctor pipeline
        // (real filesystem manifest/profile-root checks), not just the pure
        // hint builder in isolation.
        let dir = tempfile::tempdir().unwrap();
        let app_data_dir = dir.path().join("app-data");
        let (manifest_path, pack_root) =
            crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
        fs::create_dir_all(manifest_path.parent().unwrap()).unwrap();
        let python_relative_path = "python/python.exe";
        fs::create_dir_all(pack_root.join("python")).unwrap();
        fs::write(pack_root.join(python_relative_path), b"fake python").unwrap();
        fs::write(
            &manifest_path,
            serde_json::to_vec(&serde_json::json!({
                "runtimeId": "hermes-windows-x64",
                "version": "0.1.0",
                "hermesVersion": "0.18.2",
                "pythonRelativePath": python_relative_path,
                "hermesRelativePath": "python/Scripts/hermes.exe",
                "checksumFile": "SHA256SUMS",
                "signatureFile": "SHA256SUMS.sig",
                "allowed": true,
            }))
            .unwrap(),
        )
        .unwrap();

        let (ready_hints, ready_doctor, ready_version) =
            resolve_hermes_claim_hints(&app_data_dir, true, |_path| {
                Ok("hermes-cli 0.18.2".to_string())
            });
        assert_eq!(ready_doctor.status, "ready");
        assert!(ready_hints.contains(&"hermes_media".to_string()));
        assert_eq!(ready_version.as_deref(), Some("0.18.2"));

        let (degraded_hints, degraded_doctor, _degraded_version) =
            resolve_hermes_claim_hints(&app_data_dir, true, |_path| {
                Ok("hermes-cli 0.10.0".to_string())
            });
        assert_eq!(degraded_doctor.status, "degraded");
        assert!(!degraded_hints.contains(&"hermes_media".to_string()));
        // Render hint is untouched by the hermes gate either way.
        assert!(degraded_hints.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
    }

    #[test]
    fn hermes_slot_accounting_allows_one_concurrent_job_independent_of_render_slots() {
        assert!(can_claim_hermes_media_job(0));
        assert!(!can_claim_hermes_media_job(1));

        // Render slot availability never depends on hermes activity.
        assert!(can_claim_render_job(0, 1));
        assert!(!can_claim_render_job(1, 1));
        assert!(can_claim_render_job(1, 2));
    }

    #[test]
    fn heartbeat_counts_hermes_control_work_even_when_the_shared_executor_is_polling() {
        assert_eq!(active_worker_job_count(false, false, false), 0);
        assert_eq!(active_worker_job_count(false, false, true), 1);
        assert_eq!(active_worker_job_count(false, true, true), 2);
        assert_eq!(active_worker_job_count(true, false, false), 1);
    }

    #[test]
    fn fix_e_a_render_job_in_flight_never_blocks_a_hermes_claim_and_vice_versa() {
        // Mirrors the EXACT expressions `worker_loop_tick` evaluates every
        // tick from the independent `render_active`/`hermes_active` atomics
        // (not the single `has_active_job` gate this replaced).
        let max_jobs = 1u32;

        // A render job is running; hermes is idle — hermes must still be
        // claimable this tick.
        let render_busy_hermes_idle = (
            can_claim_render_job(1, max_jobs),
            can_claim_hermes_media_job(0),
        );
        assert_eq!(render_busy_hermes_idle, (false, true));

        // A hermes job is running; render is idle — render must still be
        // claimable this tick.
        let hermes_busy_render_idle = (
            can_claim_render_job(0, max_jobs),
            can_claim_hermes_media_job(1),
        );
        assert_eq!(hermes_busy_render_idle, (true, false));

        // Both idle — both claimable.
        assert_eq!(
            (
                can_claim_render_job(0, max_jobs),
                can_claim_hermes_media_job(0)
            ),
            (true, true)
        );
    }

    #[test]
    fn terminal_worker_auth_errors_are_not_retryable() {
        assert!(is_terminal_worker_auth_error(
            "worker control plane returned HTTP 401 Unauthorized: Worker token has been revoked"
        ));
        assert!(is_terminal_worker_auth_error(
            "worker control plane returned HTTP 401 Unauthorized: Worker token was used from a different device"
        ));
        assert!(!is_terminal_worker_auth_error(
            "worker control plane returned HTTP 500 Internal Server Error"
        ));
    }

    #[test]
    fn jwt_expired_errors_are_retryable_refresh_signals() {
        assert!(is_expired_worker_token_error(
            "worker control plane returned HTTP 401 Unauthorized: Invalid token: jwt expired"
        ));
        assert!(is_expired_worker_token_error(
            "server rejected worker connection (401 Unauthorized): token expired"
        ));
        assert!(!is_expired_worker_token_error(
            "worker control plane returned HTTP 401 Unauthorized: Worker token has been revoked"
        ));
    }

    #[test]
    fn transient_worker_event_transport_errors_are_retryable() {
        assert!(is_retryable_worker_event_error(
            "failed to read control plane response: error decoding response body for url"
        ));
        assert!(is_retryable_worker_event_error(
            "worker control plane returned HTTP 503 Service Unavailable"
        ));
        assert!(is_retryable_worker_event_error(
            "worker control plane request timed out after 30000ms"
        ));
    }

    #[test]
    fn terminal_worker_event_errors_are_not_retried() {
        assert!(!is_retryable_worker_event_error(
            "worker control plane returned HTTP 409 Conflict: Worker lease token is stale or invalid"
        ));
        assert!(!is_retryable_worker_event_error(
            "worker control plane returned HTTP 401 Unauthorized: Worker token has been revoked"
        ));
        assert!(!is_retryable_worker_event_error(
            "worker control plane returned HTTP 400 Bad Request: invalid progress stage"
        ));
        assert!(!is_retryable_worker_event_error(
            "worker control plane returned HTTP 401 Unauthorized: jwt expired"
        ));
    }

    #[test]
    fn stale_worker_lease_errors_detected_for_unretryable_events_without_stopping_app() {
        assert!(is_stale_worker_lease_error(
            "worker control plane returned HTTP 409 Conflict: Worker lease token is stale or invalid"
        ));
        assert!(is_stale_worker_lease_error(
            "stale_worker_lease: Worker lease has expired"
        ));
        assert!(!is_stale_worker_lease_error(
            "worker control plane returned HTTP 409 Conflict: another worker already claimed this job"
        ));
    }

    #[test]
    fn sidecar_keepalive_event_renews_the_active_assignment() {
        let job = ClaimedWorkerJob {
            id: "job-1".into(),
            job_type: HYPERFRAMES_JOB_TYPE.into(),
            lease_owner_token: "lease-1".into(),
            assignment_attempt: "attempt-1".into(),
            input_json: json!({}),
            ..Default::default()
        };

        let event = build_sidecar_keepalive_event(
            &job,
            42,
            "\u{1b}[2K  ██████████░░░░░░░░░░░░░░░  42%  Capturing frame 2700/7149",
        );

        assert_eq!(event.event_type, "job.progress");
        assert_eq!(event.sequence_number, 0);
        assert_eq!(event.lease_owner_token, "lease-1");
        assert_eq!(event.assignment_attempt, "attempt-1");
        assert_eq!(event.payload_json["stage"], "render_browser_css");
        assert_eq!(event.payload_json["keepalive"], true);
        assert_eq!(event.payload_json["percent"], 42);
        assert!(event.payload_json["message"]
            .as_str()
            .unwrap()
            .contains("Capturing frame"));
    }

    #[test]
    fn sidecar_structured_event_preserves_shot_progress_metadata() {
        let job = ClaimedWorkerJob {
            id: "job-1".into(),
            job_type: HYPERFRAMES_JOB_TYPE.into(),
            lease_owner_token: "lease-1".into(),
            assignment_attempt: "attempt-1".into(),
            input_json: json!({}),
            ..Default::default()
        };
        let parsed = parse_sidecar_worker_event_line(
            r#"SMARTAIHUB_EVENT {"eventType":"shot.render.started","stage":"render_browser_css","shotId":"shot-6","shotIndex":5,"shotTotal":8,"percent":55,"message":"Rendering shot 6/8"}"#,
        )
        .expect("structured sidecar event should parse");
        let event = build_sidecar_structured_event(&job, parsed, 44);

        assert_eq!(event.event_type, "job.progress");
        assert_eq!(event.payload_json["eventType"], "shot.render.started");
        assert_eq!(event.payload_json["shotId"], "shot-6");
        assert_eq!(event.payload_json["shotIndex"], 5);
        assert_eq!(event.payload_json["shotTotal"], 8);
        assert_eq!(event.payload_json["percent"], 55);
        assert_eq!(event.payload_json["structuredSidecarEvent"], true);
    }

    #[test]
    fn failure_log_excerpt_keeps_root_cause_before_tail() {
        let mut lines = (0..40)
            .map(|index| format!("[INFO] progress line {index}"))
            .collect::<Vec<_>>();
        lines.insert(
            4,
            "[FATAL:spawn_subprocess.cc:237] posix_spawn chrome_crashpad_handler: Permission denied (13)".into(),
        );
        lines.push("at ModuleJob.run (node:internal/modules/esm/module_job:343:25)".into());

        let excerpt = build_failure_log_excerpt(lines);

        assert!(excerpt.contains("chrome_crashpad_handler"));
        assert!(excerpt.contains("Permission denied"));
        assert!(excerpt.contains("--- last log lines ---"));
        assert!(excerpt.contains("ModuleJob.run"));
    }

    #[test]
    fn live_render_log_tail_keeps_recent_terminal_lines() {
        let lines = (0..100)
            .map(|index| format!("Capturing frame {index}"))
            .collect::<Vec<_>>();
        let tail = build_live_render_log_tail(&lines);

        assert!(!tail.contains("Capturing frame 0"));
        assert!(tail.contains("Capturing frame 99"));
    }

    #[test]
    fn render_log_percent_parser_reads_terminal_progress() {
        assert_eq!(
            parse_render_log_percent(
                "\u{1b}[2K  █████████████████░░░░░░░░  70%  Capturing frame 7149/7149"
            ),
            Some(70)
        );
        assert_eq!(
            parse_render_log_percent(
                "\u{1b}[2K  ██████████████████████░░░  90%  Assembling final video"
            ),
            Some(90)
        );
        assert_eq!(parse_render_log_percent("[INFO] Render complete"), None);
    }

    #[test]
    fn loop_connection_is_serializable_without_manual_api_key_fields() {
        let temp = tempfile::tempdir().unwrap();
        let connection = WorkerLoopConnection {
            server_url: "https://smartaihub.app".into(),
            worker_id: "wrk_1".into(),
            worker_label: "Render worker".into(),
            tokens: WorkerApiTokens {
                execution_token: "execution.jwt".into(),
                upload_token: "upload.jwt".into(),
            },
            device_proof: ensure_device_proof_material(temp.path()).unwrap(),
        };
        let serialized = serde_json::to_string(&connection).unwrap();

        assert!(serialized.contains("executionToken"));
        assert!(!serialized.contains("privateKey"));
        assert!(!serialized.contains("BEGIN PRIVATE KEY"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("apiKey"));
    }

    #[test]
    fn remove_approved_silence_preserves_padded_speech_edges() {
        let result = remove_approved_silence(&[(0, 10_000)], &[(4_000, 6_000)], 250);
        assert_eq!(result, vec![(0, 3_750), (6_250, 10_000)]);
    }

    #[test]
    fn media_failure_code_keeps_typed_errors_and_hides_unknowns() {
        assert_eq!(
            media_failure_code("source_fingerprint_mismatch: bad bytes"),
            "source_fingerprint_mismatch"
        );
        assert_eq!(
            media_failure_code("unexpected private path"),
            "unsupported_job_type"
        );
    }
}
