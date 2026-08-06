use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime};
use tauri::async_runtime::JoinHandle;

use crate::credentials::clear_connection;
use crate::diagnostics::append_diagnostic_event;
use crate::executor_state::{ExecutorState, ExecutorStatus};
use crate::hermes_executor::{
    build_production_refresh_closure, download_and_verify_reference, execute_hermes_media_job_core,
    production_fetch_hermes_media, production_fetch_reference, production_ffprobe,
    run_hermes_connection_authorize,
    run_hermes_connection_disconnect, run_hermes_connection_probe, spawn_hermes_process,
    HermesControlOutcome, HermesFailure, HermesMediaJobDeps, HermesProfileStore,
    ProductionFfprobeMode, RealHermesControlDeps, HERMES_MEDIA_CAPABILITY_FAMILY,
    HERMES_MEDIA_CLAIM_CAPABILITY,
};
use crate::hermes_runtime::{hermes_doctor_from_manifest_path, hermes_runtime_pack_paths, read_hermes_runtime_manifest};
use crate::runtime_manifest::{
    doctor_from_manifest_path, read_runtime_pack_manifest, runtime_pack_paths,
    sidecar_path_from_manifest, DoctorSummary,
};
use crate::settings::WorkerAppSettings;
use crate::worker_control_plane::{
    build_worker_heartbeat_payload, claim_worker_job, report_worker_job_event,
    send_worker_heartbeat, upload_worker_artifact_file, WorkerClaimRequest, WorkerClaimResponse,
    WorkerJobEventPayload, WorkerLoopConnection,
};
use crate::worker_executor::{
    build_failure_event, build_progress_event_plan, build_remotion_render_video_artifacts,
    build_remotion_render_video_completed_event, build_remotion_render_video_failure_event,
    build_remotion_render_video_output_json, build_remotion_render_video_progress_event,
    build_remotion_render_video_sidecar_command, build_required_artifact_uploads,
    build_sidecar_command, build_sidecar_manifest, build_worker_job_display_metadata,
    classify_job_type, compact_json_artifact_metadata, parse_remotion_sidecar_event,
    prepare_hyperframes_execution_plan, prepare_remotion_render_video_execution_plan,
    remotion_render_video_content_hash, sanitize_segment, validate_final_video_artifact,
    validate_workspace_path, ArtifactUploadPlan, ClaimedWorkerJob, RemotionSidecarEvent,
    SidecarCommandPlan, REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
    REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    WorkerEventPlan, WorkerJobKind, HYPERFRAMES_FINAL_VIDEO_MIN_BYTES, HYPERFRAMES_JOB_TYPE,
    REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES, REMOTION_RENDER_VIDEO_JOB_TYPE,
};

/// Feature 135 §11 — hermes has its own single-job slot, independent of the
/// render (HyperFrames) slot(s) governed by `max_concurrent_jobs`. Default 1
/// per spec §11 5.3 ("1 hermes job max; render throughput unaffected").
const HERMES_MEDIA_MAX_CONCURRENT_JOBS: u32 = 1;

/// Feature 135 §11 — claim `capability_hints` construction. Render hints are
/// included only when the render (HyperFrames) doctor is ready; `hermes_media`
/// is appended only when this worker's Hermes doctor is ready. Both gates are
/// independent — a worker with only one runtime installed still claims that
/// runtime's jobs (this is what unblocks a hermes-only worker: previously
/// `worker_loop_tick` bailed out entirely whenever the render doctor wasn't
/// ready, before ever reaching this call).
pub fn build_worker_claim_capability_hints(render_ready: bool, hermes_media_advertised: bool) -> Vec<String> {
    build_worker_claim_capability_hints_with_remotion(render_ready, true, hermes_media_advertised)
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
    if hermes_media_advertised {
        hints.push(HERMES_MEDIA_CLAIM_CAPABILITY.to_string());
    }
    hints
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
    let doctor = hermes_doctor_from_manifest_path(&manifest_path, &pack_root, &profile_root, query_version);
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

fn hermes_doctor_cached(
    app_data_dir: &Path,
    cache: &mut Option<HermesDoctorCache>,
) -> (DoctorSummary, Option<String>) {
    let needs_refresh = cache
        .as_ref()
        .map_or(true, |existing| existing.checked_at.elapsed() >= HERMES_DOCTOR_REFRESH_INTERVAL);
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
    pub stopped: Arc<AtomicBool>,
    pub connection: Arc<Mutex<WorkerLoopConnection>>,
    pub handle: JoinHandle<()>,
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
) -> WorkerLoopHandle {
    let cancel = Arc::new(AtomicBool::new(false));
    let stopped = Arc::new(AtomicBool::new(false));
    let connection = Arc::new(Mutex::new(connection));
    let loop_cancel = cancel.clone();
    let loop_stopped = stopped.clone();
    let loop_connection = connection.clone();
    let handle = tauri::async_runtime::spawn(async move {
        run_worker_loop(
            settings,
            executor,
            resource_dir,
            app_data_dir,
            loop_connection,
            loop_cancel,
            loop_stopped,
        )
        .await;
    });
    WorkerLoopHandle {
        cancel,
        stopped,
        connection,
        handle,
    }
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
    serde_json::from_str::<Value>(payload).ok().filter(Value::is_object)
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
    let mut payload = event
        .as_object()
        .cloned()
        .unwrap_or_default();
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
    stopped: Arc<AtomicBool>,
) {
    set_executor_polling(&executor, "Worker loop started.");
    let mut stopped_for_terminal_error = false;
    // Feature 135 §11 — one profile store per loop lifetime (restored from
    // disk so `verify_connection_affinity` survives a restart) and a
    // doctor cache so hermes readiness isn't re-probed every tick.
    let hermes_profiles = Arc::new(Mutex::new(HermesProfileStore::from_existing_root(
        app_data_dir.join("hermes-profiles"),
    )));
    let mut hermes_doctor_cache: Option<HermesDoctorCache> = None;
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
            &render_active,
            &hermes_active,
            &terminal_error,
        )
        .await;
        if let Err(error) = tick_result {
            if handle_worker_loop_error(&error, &executor, &app_data_dir, &connection, &cancel).await {
                stopped_for_terminal_error = true;
                break;
            }
        }
        if let Some(error) = terminal_error.lock().ok().and_then(|mut guard| guard.take()) {
            if handle_worker_loop_error(&error, &executor, &app_data_dir, &connection, &cancel).await {
                stopped_for_terminal_error = true;
                break;
            }
        }
        sleep_cancelable(IDLE_CLAIM_INTERVAL, &cancel).await;
    }
    if !stopped_for_terminal_error {
        set_executor_idle(&executor, "Worker loop stopped.");
    }
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
        cancel.store(true, Ordering::Relaxed);
        set_executor_error(
            executor,
            format!(
                "Worker loop stopped because the active job lease was lost during render. This prevents claiming the same job again before the control plane settles. {error}"
            ),
        );
        return true;
    }
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
    let mut doctor = doctor_from_manifest_path(&manifest_path, &sidecar_root);
    crate::commands::annotate_runtime_doctor_for_settings(
        &mut doctor,
        &settings_snapshot,
        true,
        &effective_runtime_dir,
    );
    let render_ready = doctor.status == "ready";

    // Feature 135 §11 FIX 1/A — hermes doctor probed (cached, see
    // `HERMES_DOCTOR_REFRESH_INTERVAL`) and folded into the heartbeat's
    // `acceptJobs`/`claimEnabled` signal, the claim's capability hints, AND
    // (FIX A) the heartbeat's own `runtimeMetadataJson.hermesMedia` so the
    // server's persisted `capabilitiesJson.hermesMedia` stays fresh even
    // between full re-registrations.
    let (hermes_doctor, hermes_version) = hermes_doctor_cached(app_data_dir, hermes_doctor_cache);
    let hermes_ready = hermes_doctor.status == "ready";

    let any_runtime_ready = render_ready || hermes_ready;
    let accepts_jobs = settings_snapshot.accept_jobs && any_runtime_ready;
    let connection_snapshot = clone_connection(connection)?;
    let render_active_now = render_active.load(Ordering::Relaxed);
    let hermes_active_now = hermes_active.load(Ordering::Relaxed);
    heartbeat(
        executor,
        &connection_snapshot,
        &settings_snapshot,
        &doctor,
        accepts_jobs,
        Some((&hermes_doctor, hermes_version.as_deref())),
        render_active_now,
        hermes_active_now,
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
    let can_claim_render = render_ready
        && !settings_snapshot.render_update_blocked
        && can_claim_render_job(if render_active_now { 1 } else { 0 }, max_jobs);
    let can_claim_hermes = hermes_ready
        && can_claim_hermes_media_job(if hermes_active_now { 1 } else { 0 });

    if !can_claim_render && !can_claim_hermes {
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
            capability_hints: build_worker_claim_capability_hints_with_remotion(
                can_claim_render,
                remotion_render_video_contract_ready(&doctor),
                can_claim_hermes,
            ),
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
            // FIX E — spawned (not awaited inline) so a render job in
            // flight never blocks a hermes claim on the NEXT tick.
            tauri::async_runtime::spawn(async move {
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
            Ok(())
        }
        WorkerJobKind::RemotionRenderVideo => {
            // `planning/worker-app-remotion-render-video/plan.md` P2 —
            // shares the render concurrency slot with HyperFrames (both are
            // Chromium/ffmpeg-heavy and draw on the same runtime-pack
            // binaries), so it participates in the same `render_active`
            // accounting `can_claim_render_job` gates on.
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
                let result = execute_remotion_render_video_job(
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
                let result =
                    execute_hermes_control_job(&app_data_dir_owned, &connection, job, &hermes_profiles).await;
                hermes_active.store(false, Ordering::Relaxed);
                record_terminal_error_if_needed(&terminal_error, result);
            });
            Ok(())
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
fn record_terminal_error_if_needed(terminal_error: &Arc<Mutex<Option<String>>>, result: Result<(), String>) {
    if let Err(error) = result {
        if is_terminal_worker_auth_error(&error) || is_stale_worker_lease_error(&error) {
            if let Ok(mut guard) = terminal_error.lock() {
                if guard.is_none() {
                    *guard = Some(error);
                }
            }
        }
    }
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
        "renderUpdateBlocked": settings.render_update_blocked,
        "sharingMode": settings.sharing_mode,
        "runtimeChannel": settings.runtime_channel,
        "runtimeVersion": runtime_version,
        "serviceMode": if settings.start_with_windows { "auto_start_requested" } else { "foreground" },
    });
    if let Some(remotion_contract) = remotion_contract {
        runtime_metadata["remotionPlatformContractVersion"] = json!(remotion_contract);
    }
    if let Some(remotion_supported_contracts) = remotion_supported_contracts {
        runtime_metadata["remotionSupportedContractVersions"] = remotion_supported_contracts.clone();
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
    runtime_metadata
}

async fn heartbeat(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &WorkerLoopConnection,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    accepts_jobs: bool,
    hermes_info: Option<(&DoctorSummary, Option<&str>)>,
    render_active: bool,
    hermes_active: bool,
) -> Result<(), String> {
    let current_job_count = active_worker_job_count(
        has_active_job(executor)?,
        render_active,
        hermes_active,
    );
    let status = if doctor.status == "ready" {
        "online"
    } else {
        "unhealthy"
    };
    let warnings = if doctor.status == "ready" {
        Vec::new()
    } else {
        doctor.recommended_actions.clone()
    };
    let payload = build_worker_heartbeat_payload(
        env!("CARGO_PKG_VERSION"),
        status,
        current_job_count,
        current_queue_depth(executor)?,
        warnings,
        build_heartbeat_runtime_metadata(settings, doctor, accepts_jobs, &doctor.status, hermes_info),
    );
    let response = send_worker_heartbeat(connection, &payload).await?;
    apply_hermes_heartbeat_warning(executor, &response.warning_flags_json);
    Ok(())
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

    let mut parts = vec![
        "Official HyperFrames runtime is not ready. Worker will not claim render jobs.".to_string(),
    ];
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

    let result =
        execute_hermes_media_job_inner(app_data_dir, &connection_snapshot, &job, hermes_doctor, hermes_profiles, settings)
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
            let failure = build_failure_event(&job, FAILURE_EVENT_SEQUENCE_NUMBER, "hermes_media_failed", error);
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
        ProductionFfprobeMode::Native(
            effective_runtime_dir
                .join("runtime-pack")
                .join("bin")
                .join("ffprobe.exe"),
        )
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

    let spawn_closure = move |argv: &[String],
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
    let mut upload_fn = move |output: &crate::hermes_executor::CollectedOutput| -> Result<(), String> {
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

    let outcome: Result<Vec<crate::hermes_executor::CollectedOutput>, HermesFailure> = match blocking_result {
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
        .ok_or_else(|| "hermes control job is missing capabilityRequirementsJson.connectionId".to_string())?
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
    let outcome = tauri::async_runtime::spawn_blocking(move || match classify_job_type(&job_type) {
        WorkerJobKind::HermesConnectionAuthorize => {
            run_hermes_connection_authorize(&connection_id_for_execution, &profile_reference, timeout_ms / 1000, &deps)
        }
        WorkerJobKind::HermesConnectionProbe => {
            run_hermes_connection_probe(
                &connection_id_for_execution,
                &profile_reference,
                timeout_ms / 1000,
                test_generation.as_deref(),
                &deps,
            )
        }
        WorkerJobKind::HermesConnectionDisconnect => {
            run_hermes_connection_disconnect(&connection_id_for_execution, &profile_reference, timeout_ms / 1000, &deps)
        }
        _ => HermesControlOutcome::Failure {
            error_code: "HERMES_PROCESS_FAILED".to_string(),
            failure_reason: "process_failed".to_string(),
            diagnostic: "unreachable: non-control job type dispatched to control-job executor".to_string(),
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
    update_executor_progress(executor, &job.id, 55, "Running official HyperFrames sidecar.");
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
        let _ = heartbeat(executor, &connection_snapshot, settings, doctor, true, None, true, false).await;
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
                                metadata.as_object_mut().unwrap().insert(k.clone(), v.clone());
                            }
                        }
                    }

                    metadata.as_object_mut().unwrap().insert(
                        "artifactJsonSummary".to_string(),
                        summary,
                    );
                    if upload.artifact_type == "hyperframes_render_manifest" {
                        if let Some(hash) = parsed
                            .get("finalVideoSha256")
                            .or_else(|| parsed.get("finalVideoChecksumSha256"))
                            .or_else(|| {
                                parsed
                                    .get("outputs")
                                    .and_then(|v| v.get("finalVideo"))
                                    .and_then(|v| v.get("checksumSha256").or_else(|| v.get("sha256")))
                            })
                        {
                            metadata.as_object_mut().unwrap().insert(
                                "finalVideoChecksumSha256".to_string(),
                                hash.clone(),
                            );
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
    update_executor_progress(executor, &job.id, 20, "Running Remotion render-video sidecar.");

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
    validate_workspace_path(workspace_root, &output_path)
        .map_err(|error| format!("sidecar reported an output path outside the worker workspace: {error}"))?;
    let output_metadata = fs::metadata(&output_path)
        .map_err(|error| {
            format!(
                "Remotion render-video output is missing at {}: {error}",
                output_path.display()
            )
        })?;
    let size_bytes = output_metadata.len();

    update_executor_progress(executor, &job.id, 82, "Uploading Remotion render-video artifact.");
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

    // Known scope gap (see this task's final report): the only durable
    // reference this Rust process holds for the uploaded artifact is
    // `storageRef` (a storage key, not a resolved playback URL — the
    // `worker_artifacts` table has no `url` column; a real GET url is only
    // resolvable server-side via `storageGet(storageRef)`). Lane A's
    // `outputUrl` is a real resolved URL from its own `storagePut()`. Using
    // `storageRef` here is the best value obtainable from
    // `apps/worker-app` alone; closing this gap for real requires an
    // `apps/web`-side change (out of this task's file scope) to resolve a
    // playback URL from `storageRef` when persisting `outputJson.outputUrl`.
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

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("failed to start Remotion render-video sidecar: {error}"))?;

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
            return Err("worker loop stopped while Remotion sidecar was running".into());
        }
        if started_at.elapsed() >= timeout {
            terminate_sidecar_child(&mut child, command);
            return Err("Remotion render-video sidecar timed out after 1 hour".into());
        }
        if last_heartbeat.elapsed() >= ACTIVE_HEARTBEAT_INTERVAL {
            let _ =
                crate::commands::try_refresh_connection_if_needed(app_data_dir, connection).await;
            let connection_snapshot = clone_connection(connection)?;
            let _ = heartbeat(executor, &connection_snapshot, settings, doctor, true, None, true, false).await;
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
                return Ok((outcome, next_sequence_number));
            }
            Ok(None) => {
                sleep_cancelable(Duration::from_millis(500), cancel).await;
            }
            Err(error) => {
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
        let _ = heartbeat(executor, &connection_snapshot, settings, doctor, true, None, true, false).await;

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
            download_source_asset(&url, &local_path).await?;
        }

        let digest = file_sha256(&local_path)?;
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

async fn download_source_asset(url: &reqwest::Url, path: &Path) -> Result<(), String> {
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
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read source video asset body: {error}"))?;
    if bytes.len() < HYPERFRAMES_FINAL_VIDEO_MIN_BYTES as usize {
        return Err("source video asset is too small to be a real video".into());
    }
    fs::write(path, &bytes).map_err(|error| format!("failed to write staged source video: {error}"))
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("failed to read staged source video: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(&bytes)))
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
            return Err("worker loop stopped while HyperFrames sidecar was running".into());
        }

        if started_at.elapsed() >= timeout {
            terminate_sidecar_child(&mut child, command);
            return Err("HyperFrames sidecar timed out after 1 hour of rendering".into());
        }

        if last_heartbeat.elapsed() >= ACTIVE_HEARTBEAT_INTERVAL {
            let _ =
                crate::commands::try_refresh_connection_if_needed(app_data_dir, connection).await;
            let connection_snapshot = clone_connection(connection)?;
            let _ = heartbeat(executor, &connection_snapshot, settings, doctor, true, None, true, false).await;
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
            Ok(Some(status)) if status.success() => return Ok(next_sequence_number),
            Ok(Some(status)) => {
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
                        return Err(format!(
                            "Active render progress event failed while HyperFrames sidecar was running: {error}"
                        ));
                    }
                }

                sleep_cancelable(Duration::from_millis(500), cancel).await;
            }
            Err(error) => return Err(format!("failed to monitor HyperFrames sidecar: {error}")),
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

async fn send_event_with_refresh(
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
        state.start_job(
            job.id.clone(),
            metadata.label,
            job.job_type.clone(),
            metadata.project_id,
            metadata.project_name,
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
fn set_executor_job_complete(
    executor: &Arc<Mutex<ExecutorState>>,
    job_id: &str,
    message: &str,
) {
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

        assert!(remotion_render_video_contract_ready(&compatible_legacy_primary));
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
            RemotionRenderOutcome::Failed { failure_code, message } => {
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
        );
        assert_eq!(ready_metadata["hermesMedia"]["advertised"], true);
        assert_eq!(ready_metadata["hermesMedia"]["hermesVersion"], "0.18.2");
        assert_eq!(ready_metadata["hermesMedia"]["capability"], "hermes-media-generation");

        let blocked_metadata = build_heartbeat_runtime_metadata(
            &settings,
            &hermes_blocked,
            true,
            "ready",
            Some((&hermes_blocked, None)),
        );
        assert_eq!(blocked_metadata["hermesMedia"]["advertised"], false);

        // The 3 "active heartbeat" call sites (fired during an in-flight
        // HyperFrames render) pass `None` — no hermesMedia key at all, so
        // the server preserves the last-known value instead of clobbering
        // it with a stale/absent probe.
        let no_hermes_info = build_heartbeat_runtime_metadata(&settings, &hermes_ready, true, "ready", None);
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
        assert_eq!(success.payload_json["capabilities"]["operations"], json!({}));

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
        let (manifest_path, pack_root) = crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
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

        let (ready_hints, ready_doctor, ready_version) = resolve_hermes_claim_hints(&app_data_dir, true, |_path| {
            Ok("hermes-cli 0.18.2".to_string())
        });
        assert_eq!(ready_doctor.status, "ready");
        assert!(ready_hints.contains(&"hermes_media".to_string()));
        assert_eq!(ready_version.as_deref(), Some("0.18.2"));

        let (degraded_hints, degraded_doctor, _degraded_version) =
            resolve_hermes_claim_hints(&app_data_dir, true, |_path| Ok("hermes-cli 0.10.0".to_string()));
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
            (can_claim_render_job(0, max_jobs), can_claim_hermes_media_job(0)),
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
    fn stale_worker_lease_errors_stop_the_loop_instead_of_retrying_claims() {
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
}
