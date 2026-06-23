use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::async_runtime::JoinHandle;

use crate::executor_state::{ExecutorState, ExecutorStatus};
use crate::runtime_manifest::{
    doctor_from_manifest_path, read_runtime_pack_manifest, runtime_pack_paths,
    sidecar_path_from_manifest, DoctorSummary,
};
use crate::settings::WorkerAppSettings;
use crate::worker_control_plane::{
    build_worker_heartbeat_payload, claim_worker_job, report_worker_job_event,
    send_worker_heartbeat, upload_worker_artifact_file, WorkerClaimRequest, WorkerJobEventPayload,
    WorkerLoopConnection,
};
use crate::worker_executor::{
    build_failure_event, build_progress_event_plan, build_required_artifact_uploads,
    build_sidecar_command, build_sidecar_manifest, prepare_hyperframes_execution_plan,
    ClaimedWorkerJob, WorkerEventPlan, HYPERFRAMES_JOB_TYPE,
};

const IDLE_CLAIM_INTERVAL: Duration = Duration::from_secs(10);
const ACTIVE_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Debug)]
pub struct WorkerLoopHandle {
    pub cancel: Arc<AtomicBool>,
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
    let connection = Arc::new(Mutex::new(connection));
    let loop_cancel = cancel.clone();
    let loop_connection = connection.clone();
    let handle = tauri::async_runtime::spawn(async move {
        run_worker_loop(
            settings,
            executor,
            resource_dir,
            app_data_dir,
            loop_connection,
            loop_cancel,
        )
        .await;
    });
    WorkerLoopHandle {
        cancel,
        connection,
        handle,
    }
}

async fn run_worker_loop(
    settings: Arc<Mutex<WorkerAppSettings>>,
    executor: Arc<Mutex<ExecutorState>>,
    resource_dir: PathBuf,
    app_data_dir: PathBuf,
    connection: Arc<Mutex<WorkerLoopConnection>>,
    cancel: Arc<AtomicBool>,
) {
    set_executor_polling(&executor, "Worker loop started.");
    while !cancel.load(Ordering::Relaxed) {
        let tick_result = worker_loop_tick(
            &settings,
            &executor,
            &resource_dir,
            &app_data_dir,
            &connection,
            &cancel,
        )
        .await;
        if let Err(error) = tick_result {
            set_executor_error(&executor, format!("Worker loop error: {error}"));
        }
        sleep_cancelable(IDLE_CLAIM_INTERVAL, &cancel);
    }
    set_executor_idle(&executor, "Worker loop stopped.");
}

async fn worker_loop_tick(
    settings: &Arc<Mutex<WorkerAppSettings>>,
    executor: &Arc<Mutex<ExecutorState>>,
    resource_dir: &Path,
    app_data_dir: &Path,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let settings_snapshot = settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, app_data_dir);
    let doctor = doctor_from_manifest_path(&manifest_path, &sidecar_root);
    let runtime_ready = doctor.status == "ready";
    let accepts_jobs = settings_snapshot.accept_jobs && runtime_ready;
    let connection_snapshot = clone_connection(connection)?;
    heartbeat(
        executor,
        &connection_snapshot,
        &settings_snapshot,
        &doctor,
        accepts_jobs,
    )
    .await?;

    if !settings_snapshot.accept_jobs {
        set_executor_paused(
            executor,
            "Accept jobs is paused. Heartbeat is still active.",
        );
        return Ok(());
    }
    if !runtime_ready {
        set_executor_error(
            executor,
            "Official HyperFrames runtime is not ready. Worker will not claim render jobs.".into(),
        );
        return Ok(());
    }
    if has_active_job(executor)? {
        return Ok(());
    }

    let max_jobs = settings_snapshot.max_concurrent_jobs.max(1) as u32;
    let claimed = claim_worker_job(
        &connection_snapshot,
        &WorkerClaimRequest {
            max_jobs,
            capability_hints: vec![
                "hyperframes-final-composite".into(),
                HYPERFRAMES_JOB_TYPE.into(),
            ],
        },
    )
    .await?;
    let Some(job) = claimed.job else {
        set_executor_polling(executor, "No queued jobs. Heartbeat is active.");
        return Ok(());
    };

    execute_hyperframes_job(
        executor,
        resource_dir,
        app_data_dir,
        connection,
        job,
        &doctor,
        &settings_snapshot,
        cancel,
    )
    .await
}

async fn heartbeat(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &WorkerLoopConnection,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    accepts_jobs: bool,
) -> Result<(), String> {
    let current_job_count = if has_active_job(executor)? { 1 } else { 0 };
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
        warnings,
        json!({
            "doctorStatus": doctor.status,
            "acceptJobs": settings.accept_jobs,
            "claimEnabled": accepts_jobs,
            "sharingMode": settings.sharing_mode,
            "runtimeChannel": settings.runtime_channel,
            "runtimeVersion": settings.runtime_version,
            "serviceMode": if settings.start_with_windows { "auto_start_requested" } else { "foreground" },
        }),
    );
    send_worker_heartbeat(connection, &payload).await?;
    Ok(())
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
    set_executor_job(executor, &job.id, "HyperFrames final composite");
    let workspace_root = workspace_root(settings, app_data_dir)?;
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
    if let Err(error) = &result {
        let failure = build_failure_event(&job, 99, "render_failed", error);
        if let Ok(connection_snapshot) = clone_connection(connection) {
            let _ = send_event(&connection_snapshot, &job.id, failure).await;
        }
        set_executor_error(executor, format!("Job failed: {error}"));
    } else {
        set_executor_complete(executor, "Job completed and artifacts uploaded.");
    }
    result
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
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, app_data_dir);
    let manifest = read_runtime_pack_manifest(&manifest_path)?;
    let sidecar_executable = sidecar_path_from_manifest(&manifest, &sidecar_root);
    let plan = prepare_hyperframes_execution_plan(job, workspace_root, doctor)?;
    fs::create_dir_all(&plan.output_dir)
        .map_err(|error| format!("failed to create worker output dir: {error}"))?;
    let sidecar_manifest = build_sidecar_manifest(job, &plan);
    fs::write(
        &plan.sidecar_manifest_path,
        serde_json::to_vec_pretty(&sidecar_manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write sidecar manifest: {error}"))?;
    fs::write(
        plan.output_dir.join("doctor.json"),
        serde_json::to_vec_pretty(doctor).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write doctor report: {error}"))?;

    for event in build_progress_event_plan(job).into_iter().take(4) {
        update_progress_from_event(executor, &event);
        let connection_snapshot = clone_connection(connection)?;
        send_event(&connection_snapshot, &job.id, event).await?;
    }

    let command = build_sidecar_command(&sidecar_executable, &plan)?;
    update_executor_progress(executor, 55, "Running official HyperFrames sidecar.");
    run_sidecar_with_active_heartbeat(
        executor,
        connection,
        settings,
        doctor,
        &command.executable,
        &command.args,
        cancel,
    )
    .await?;

    for event in build_progress_event_plan(job).into_iter().skip(4).take(2) {
        update_progress_from_event(executor, &event);
        let connection_snapshot = clone_connection(connection)?;
        send_event(&connection_snapshot, &job.id, event).await?;
    }

    for upload in build_required_artifact_uploads(job, &plan) {
        update_executor_progress(
            executor,
            82,
            format!("Uploading artifact: {}", upload.file_name),
        );
        let connection_snapshot = clone_connection(connection)?;
        heartbeat(executor, &connection_snapshot, settings, doctor, true).await?;
        upload_worker_artifact_file(
            &connection_snapshot,
            &job.id,
            &upload.artifact_type,
            &upload.path,
            &upload.file_name,
            &upload.content_type,
            &upload.lease_owner_token,
            &upload.assignment_attempt,
            json!({
                "assignmentAttempt": job.assignment_attempt,
                "runtimeId": manifest.runtime_id,
                "runtimeVersion": manifest.version,
            }),
        )
        .await?;
    }

    for event in build_progress_event_plan(job).into_iter().skip(6) {
        update_progress_from_event(executor, &event);
        let connection_snapshot = clone_connection(connection)?;
        send_event(&connection_snapshot, &job.id, event).await?;
    }
    Ok(())
}

async fn run_sidecar_with_active_heartbeat(
    executor: &Arc<Mutex<ExecutorState>>,
    connection: &Arc<Mutex<WorkerLoopConnection>>,
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    executable: &Path,
    args: &[String],
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    let mut child = Command::new(executable)
        .args(args)
        .spawn()
        .map_err(|error| format!("failed to start HyperFrames sidecar: {error}"))?;
    let mut last_heartbeat = Instant::now() - ACTIVE_HEARTBEAT_INTERVAL;

    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("worker loop stopped while HyperFrames sidecar was running".into());
        }

        if last_heartbeat.elapsed() >= ACTIVE_HEARTBEAT_INTERVAL {
            let connection_snapshot = clone_connection(connection)?;
            heartbeat(executor, &connection_snapshot, settings, doctor, true).await?;
            last_heartbeat = Instant::now();
        }

        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                return Err(format!(
                    "HyperFrames sidecar exited with {status}. Check the runtime logs in the worker workspace."
                ));
            }
            Ok(None) => sleep_cancelable(Duration::from_millis(500), cancel),
            Err(error) => return Err(format!("failed to monitor HyperFrames sidecar: {error}")),
        }
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

fn workspace_root(settings: &WorkerAppSettings, app_data_dir: &Path) -> Result<PathBuf, String> {
    let root = if settings.workspace_dir.trim().is_empty() {
        app_data_dir.join("worker-workspace")
    } else {
        PathBuf::from(settings.workspace_dir.trim())
    };
    fs::create_dir_all(&root)
        .map_err(|error| format!("failed to create worker workspace: {error}"))?;
    Ok(root)
}

fn has_active_job(executor: &Arc<Mutex<ExecutorState>>) -> Result<bool, String> {
    executor
        .lock()
        .map(|state| matches!(state.status, ExecutorStatus::Running))
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

fn set_executor_polling(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = true;
        state.status = ExecutorStatus::Polling;
        state.current_job_id = None;
        state.current_job_label = None;
        state.progress_percent = 0;
        state.last_message = message.into();
    }
}

fn set_executor_paused(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.status = ExecutorStatus::Paused;
        state.current_job_id = None;
        state.current_job_label = None;
        state.progress_percent = 0;
        state.last_message = message.into();
    }
}

fn set_executor_idle(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.status = ExecutorStatus::Idle;
        state.current_job_id = None;
        state.current_job_label = None;
        state.progress_percent = 0;
        state.last_message = message.into();
    }
}

fn set_executor_error(executor: &Arc<Mutex<ExecutorState>>, message: String) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = false;
        state.status = ExecutorStatus::Error;
        state.last_message = message;
    }
}

fn set_executor_job(executor: &Arc<Mutex<ExecutorState>>, job_id: &str, label: &str) {
    if let Ok(mut state) = executor.lock() {
        state.start_job(job_id.into(), label.into());
    }
}

fn update_executor_progress(
    executor: &Arc<Mutex<ExecutorState>>,
    percent: u8,
    message: impl Into<String>,
) {
    if let Ok(mut state) = executor.lock() {
        state.update_progress(percent, message.into());
    }
}

fn update_progress_from_event(executor: &Arc<Mutex<ExecutorState>>, event: &WorkerEventPlan) {
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
    update_executor_progress(executor, percent, message);
}

fn set_executor_complete(executor: &Arc<Mutex<ExecutorState>>, message: &str) {
    if let Ok(mut state) = executor.lock() {
        state.accepting_jobs = true;
        state.status = ExecutorStatus::Polling;
        state.current_job_id = None;
        state.current_job_label = None;
        state.progress_percent = 100;
        state.last_message = message.into();
    }
}

fn sleep_cancelable(duration: Duration, cancel: &AtomicBool) {
    let slice = Duration::from_millis(250);
    let mut elapsed = Duration::ZERO;
    while elapsed < duration && !cancel.load(Ordering::Relaxed) {
        std::thread::sleep(slice);
        elapsed += slice;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::ensure_device_proof_material;
    use crate::worker_control_plane::WorkerApiTokens;

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
