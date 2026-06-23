use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

use crate::runtime_manifest::DoctorSummary;

pub const HYPERFRAMES_JOB_TYPE: &str = "hyperframes_final_composite";
pub const HYPERFRAMES_RENDER_INTENT: &str = "hyperframes_final_composite";

const PROGRESS_STAGES: [&str; 9] = [
    "resolve_inputs",
    "stage_assets",
    "doctor_runtime",
    "build_composition",
    "render_browser_css",
    "verify_outputs",
    "upload_artifacts",
    "server_verify_artifacts",
    "publish_artifacts",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJob {
    pub id: String,
    pub job_type: String,
    pub lease_owner_token: String,
    pub assignment_attempt: String,
    #[serde(default)]
    pub input_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HyperframesExecutionPlan {
    pub job_id: String,
    pub assignment_attempt: String,
    pub workspace_dir: PathBuf,
    pub sidecar_manifest_path: PathBuf,
    pub output_dir: PathBuf,
    pub final_video_path: PathBuf,
    pub max_duration_sec: u16,
    pub asset_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCommandPlan {
    pub executable: PathBuf,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerEventPlan {
    pub event_type: String,
    pub sequence_number: u32,
    pub lease_owner_token: String,
    pub assignment_attempt: String,
    pub payload_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactUploadPlan {
    pub artifact_type: String,
    pub file_name: String,
    pub content_type: String,
    pub path: PathBuf,
    pub lease_owner_token: String,
    pub assignment_attempt: String,
}

fn value_u16(value: &Value, key: &str) -> Option<u16> {
    value
        .get(key)
        .and_then(|value| value.as_f64())
        .filter(|value| *value > 0.0 && *value <= 300.0)
        .map(|value| value.ceil() as u16)
}

fn read_asset_count(input_json: &Value) -> usize {
    input_json
        .get("assetManifest")
        .and_then(|manifest| manifest.get("sourceVideos"))
        .and_then(|videos| videos.as_array())
        .map(|videos| videos.len())
        .unwrap_or(0)
}

fn sanitize_segment(value: &str) -> String {
    value
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
        .to_string()
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("output path escapes worker workspace".into());
    }
    Ok(root.join(relative_path))
}

pub fn validate_workspace_path(root: &Path, path: &Path) -> Result<(), String> {
    if path.is_absolute() && !path.starts_with(root) {
        return Err("path escapes worker workspace".into());
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("path escapes worker workspace".into());
    }
    Ok(())
}

pub fn prepare_hyperframes_execution_plan(
    job: &ClaimedWorkerJob,
    workspace_root: &Path,
    doctor: &DoctorSummary,
) -> Result<HyperframesExecutionPlan, String> {
    if job.job_type != HYPERFRAMES_JOB_TYPE {
        return Err(format!("unsupported worker job type: {}", job.job_type));
    }
    if doctor.status != "ready" {
        return Err("official HyperFrames runtime is not ready".into());
    }
    if job.assignment_attempt.trim().is_empty() {
        return Err("assignmentAttempt is required before execution".into());
    }
    if job.input_json.get("renderIntent").and_then(Value::as_str) != Some(HYPERFRAMES_RENDER_INTENT)
    {
        return Err("job input is not a HyperFrames final composite render".into());
    }

    let job_segment = sanitize_segment(&job.id);
    if job_segment.is_empty() {
        return Err("job id is invalid for workspace staging".into());
    }
    let workspace_dir = workspace_root.join(job_segment);
    let output_dir = safe_join(&workspace_dir, "out")?;
    let sidecar_manifest_path = safe_join(&workspace_dir, "sidecar-input.json")?;
    let final_video_path = safe_join(&output_dir, "final.mp4")?;
    validate_workspace_path(workspace_root, &workspace_dir)?;
    validate_workspace_path(workspace_root, &output_dir)?;
    validate_workspace_path(workspace_root, &sidecar_manifest_path)?;
    validate_workspace_path(workspace_root, &final_video_path)?;

    Ok(HyperframesExecutionPlan {
        job_id: job.id.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        workspace_dir,
        sidecar_manifest_path,
        output_dir,
        final_video_path,
        max_duration_sec: value_u16(&job.input_json, "finalVideoLengthSec").unwrap_or(300),
        asset_count: read_asset_count(&job.input_json),
    })
}

pub fn build_sidecar_command(
    sidecar_executable: &Path,
    plan: &HyperframesExecutionPlan,
) -> Result<SidecarCommandPlan, String> {
    if sidecar_executable.as_os_str().is_empty() {
        return Err("HyperFrames sidecar executable is required".into());
    }
    validate_workspace_path(&plan.workspace_dir, &plan.sidecar_manifest_path)?;
    validate_workspace_path(&plan.workspace_dir, &plan.output_dir)?;
    Ok(SidecarCommandPlan {
        executable: sidecar_executable.to_path_buf(),
        args: vec![
            "render".into(),
            "--manifest".into(),
            plan.sidecar_manifest_path.to_string_lossy().to_string(),
            "--output-dir".into(),
            plan.output_dir.to_string_lossy().to_string(),
            "--format".into(),
            "mp4".into(),
        ],
    })
}

pub fn build_sidecar_manifest(job: &ClaimedWorkerJob, plan: &HyperframesExecutionPlan) -> Value {
    json!({
        "jobId": job.id,
        "assignmentAttempt": job.assignment_attempt,
        "renderIntent": HYPERFRAMES_RENDER_INTENT,
        "input": job.input_json,
        "output": {
            "finalVideoPath": plan.final_video_path,
            "outputDir": plan.output_dir,
            "maxDurationSec": plan.max_duration_sec,
        },
        "runtimePolicy": {
            "requireOfficialRuntime": true,
            "rejectFallbackRender": true,
            "requireCssBrowserRuntime": true,
            "localHttpServerAllowed": false,
        }
    })
}

pub fn build_progress_event_plan(job: &ClaimedWorkerJob) -> Vec<WorkerEventPlan> {
    PROGRESS_STAGES
        .iter()
        .enumerate()
        .map(|(index, stage)| {
            let sequence_number = (index + 1) as u32;
            WorkerEventPlan {
                event_type: "job.progress".into(),
                sequence_number,
                lease_owner_token: job.lease_owner_token.clone(),
                assignment_attempt: job.assignment_attempt.clone(),
                payload_json: json!({
                    "stage": stage,
                    "percent": ((sequence_number as f32 / PROGRESS_STAGES.len() as f32) * 100.0).round() as u8,
                    "message": format!("HyperFrames stage: {stage}"),
                }),
            }
        })
        .collect()
}

pub fn build_failure_event(
    job: &ClaimedWorkerJob,
    sequence_number: u32,
    failure_code: &str,
    message: &str,
) -> WorkerEventPlan {
    WorkerEventPlan {
        event_type: "job.failed".into(),
        sequence_number,
        lease_owner_token: job.lease_owner_token.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        payload_json: json!({
            "failureCode": failure_code,
            "message": message,
            "recoverable": true,
        }),
    }
}

pub fn build_required_artifact_uploads(
    job: &ClaimedWorkerJob,
    plan: &HyperframesExecutionPlan,
) -> Vec<ArtifactUploadPlan> {
    vec![
        ArtifactUploadPlan {
            artifact_type: "hyperframes_final_video".into(),
            file_name: "final.mp4".into(),
            content_type: "video/mp4".into(),
            path: plan.final_video_path.clone(),
            lease_owner_token: job.lease_owner_token.clone(),
            assignment_attempt: job.assignment_attempt.clone(),
        },
        ArtifactUploadPlan {
            artifact_type: "hyperframes_render_manifest".into(),
            file_name: "manifest.json".into(),
            content_type: "application/json".into(),
            path: plan.output_dir.join("manifest.json"),
            lease_owner_token: job.lease_owner_token.clone(),
            assignment_attempt: job.assignment_attempt.clone(),
        },
        ArtifactUploadPlan {
            artifact_type: "hyperframes_runtime_doctor".into(),
            file_name: "doctor.json".into(),
            content_type: "application/json".into(),
            path: plan.output_dir.join("doctor.json"),
            lease_owner_token: job.lease_owner_token.clone(),
            assignment_attempt: job.assignment_attempt.clone(),
        },
        ArtifactUploadPlan {
            artifact_type: "hyperframes_probe_report".into(),
            file_name: "probe.json".into(),
            content_type: "application/json".into(),
            path: plan.output_dir.join("probe.json"),
            lease_owner_token: job.lease_owner_token.clone(),
            assignment_attempt: job.assignment_attempt.clone(),
        },
    ]
}
