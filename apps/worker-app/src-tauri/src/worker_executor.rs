use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use crate::hermes_executor::{
    HERMES_CONNECTION_AUTHORIZE_JOB_TYPE, HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
    HERMES_CONNECTION_PROBE_JOB_TYPE, HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE,
};
use crate::runtime_manifest::DoctorSummary;

pub const HYPERFRAMES_JOB_TYPE: &str = "hyperframes_final_composite";
pub const HYPERFRAMES_RENDER_INTENT: &str = "hyperframes_final_composite";

/// Feature 135 §11 — dispatch classification. `worker_loop.rs`/`commands.rs`
/// use this to route a claimed job to either the (existing) HyperFrames
/// render flow or the (new) Hermes media/connection-control flow. Unknown
/// job types are left untouched (`Unknown`) — no behavior change for any
/// job type this module didn't already know about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerJobKind {
    Hyperframes,
    HermesMediaImage,
    HermesMediaVideo,
    HermesConnectionAuthorize,
    HermesConnectionProbe,
    HermesConnectionDisconnect,
    Unknown,
}

pub fn classify_job_type(job_type: &str) -> WorkerJobKind {
    match job_type {
        HYPERFRAMES_JOB_TYPE => WorkerJobKind::Hyperframes,
        HERMES_MEDIA_IMAGE_JOB_TYPE => WorkerJobKind::HermesMediaImage,
        HERMES_MEDIA_VIDEO_JOB_TYPE => WorkerJobKind::HermesMediaVideo,
        HERMES_CONNECTION_AUTHORIZE_JOB_TYPE => WorkerJobKind::HermesConnectionAuthorize,
        HERMES_CONNECTION_PROBE_JOB_TYPE => WorkerJobKind::HermesConnectionProbe,
        HERMES_CONNECTION_DISCONNECT_JOB_TYPE => WorkerJobKind::HermesConnectionDisconnect,
        _ => WorkerJobKind::Unknown,
    }
}

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

pub const HYPERFRAMES_FINAL_VIDEO_MIN_BYTES: u64 = 1024;
const ARTIFACT_METADATA_INLINE_STRING_MAX: usize = 1000;

/// Feature 135 §11 — a hermes_media_* job's fresh presigned reference URLs,
/// minted server-side at claim time (section 06) and re-mintable mid-job via
/// `POST /api/worker-jobs/:jobId/references/urls`. Never persisted — this is
/// a claim/refresh-response-only field (the job's `inputJson` references
/// stay `{assetId, index, role, label, sha256}`, never a URL).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesJobReferenceUrl {
    pub asset_id: String,
    pub url: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedWorkerJob {
    pub id: String,
    pub job_type: String,
    pub lease_owner_token: String,
    pub assignment_attempt: String,
    #[serde(default)]
    pub input_json: Value,
    /// Feature 135 §11 — present on hermes_media_*/hermes_connection_* jobs;
    /// carries `{ connectionId }` (and other claim-gating fields) so the
    /// Rust-side affinity re-check (`verify_connection_affinity`) can refuse
    /// a job pinned to a connection this worker does not host, even if the
    /// server offered it.
    #[serde(default)]
    pub capability_requirements_json: Value,
    /// Feature 135 §11 — populated on the claim response for hermes_media_*
    /// jobs only (section 06). Empty for every other job type.
    #[serde(default)]
    pub reference_urls: Vec<HermesJobReferenceUrl>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobDisplayMetadata {
    pub label: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
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
    pub render_log_path: PathBuf,
    pub max_duration_sec: u16,
    pub asset_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCommandPlan {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub current_dir: PathBuf,
    pub envs: std::collections::HashMap<String, String>,
    pub stdin_data: Option<String>,
    pub preview_stdin_data: Option<String>,
    pub cleanup: Option<SidecarCleanupPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCleanupPlan {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub current_dir: PathBuf,
    pub envs: std::collections::HashMap<String, String>,
    pub stdin_data: Option<String>,
}

const DEFAULT_RENDER_ENV: &[(&str, &str)] = &[
    ("SMARTAIHUB_ENABLE_GPU_ENCODING", "1"),
    ("SMARTAIHUB_DISABLE_BROWSER_GPU", "1"),
    ("SMARTAIHUB_RENDER_WORKERS", ""),
    ("SMARTAIHUB_HYPERFRAMES_DEBUG", "0"),
    ("PRODUCER_LOW_MEMORY_MODE", "false"),
];

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

impl ArtifactUploadPlan {
    pub fn size_bytes(&self) -> u64 {
        fs::metadata(&self.path)
            .map(|metadata| metadata.len())
            .unwrap_or(0)
    }
}

pub fn compact_json_artifact_metadata(
    artifact_type: &str,
    parsed: &Value,
    size_bytes: u64,
) -> Value {
    match artifact_type {
        "hyperframes_render_manifest" => json!({
            "artifactJsonStoredInUpload": true,
            "artifactJsonKind": "manifest",
            "artifactJsonSizeBytes": size_bytes,
            "renderJobId": parsed.get("renderJobId").cloned().unwrap_or(Value::Null),
            "compositionHash": parsed.get("compositionHash").cloned().unwrap_or(Value::Null),
            "finalVideoPath": parsed.get("finalVideoPath").cloned().unwrap_or(Value::Null),
            "fallbackRender": parsed.get("fallbackRender").cloned().unwrap_or(Value::Null),
        }),
        "hyperframes_probe_report" => json!({
            "artifactJsonStoredInUpload": true,
            "artifactJsonKind": "probe",
            "artifactJsonSizeBytes": size_bytes,
            "durationSec": parsed.get("durationSec").cloned().unwrap_or(Value::Null),
            "aspectRatio": parsed.get("aspectRatio").cloned().unwrap_or(Value::Null),
            "fps": parsed.get("fps").cloned().unwrap_or(Value::Null),
            "hasAudio": parsed.get("hasAudio").cloned().unwrap_or(Value::Null),
        }),
        "hyperframes_runtime_doctor" => json!({
            "artifactJsonStoredInUpload": true,
            "artifactJsonKind": "runtime_doctor",
            "artifactJsonSizeBytes": size_bytes,
            "status": parsed.get("status").cloned().unwrap_or(Value::Null),
            "officialHyperframesRuntime": parsed.get("officialHyperframesRuntime").cloned().unwrap_or(Value::Null),
            "runtimeKind": parsed.get("runtimeKind").cloned().unwrap_or(Value::Null),
            "runtimeModel": parsed.get("runtimeModel").cloned().unwrap_or(Value::Null),
            "runtimeVersion": parsed.get("runtimeVersion").cloned().unwrap_or(Value::Null),
            "fallbackRender": parsed.get("fallbackRender").cloned().unwrap_or(Value::Null),
            "recommendedActionCount": parsed.get("recommendedActions").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0),
            "checkCount": parsed.get("checks").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0),
        }),
        _ => compact_json_value(parsed, 0),
    }
}

fn compact_json_value(value: &Value, depth: usize) -> Value {
    if depth >= 4 {
        return Value::String("[truncated]".into());
    }
    match value {
        Value::String(text) => {
            let cleaned: String = text
                .chars()
                .map(|ch| {
                    if ch == '\n' || ch == '\r' || ch == '\t' || !ch.is_control() {
                        ch
                    } else {
                        ' '
                    }
                })
                .take(ARTIFACT_METADATA_INLINE_STRING_MAX)
                .collect();
            if text.chars().count() > ARTIFACT_METADATA_INLINE_STRING_MAX {
                Value::String(format!("{cleaned}...[truncated]"))
            } else {
                Value::String(cleaned)
            }
        }
        Value::Array(items) => Value::Array(
            items
                .iter()
                .take(20)
                .map(|entry| compact_json_value(entry, depth + 1))
                .collect(),
        ),
        Value::Object(map) => Value::Object(
            map.iter()
                .take(30)
                .map(|(key, entry)| (key.clone(), compact_json_value(entry, depth + 1)))
                .collect(),
        ),
        _ => value.clone(),
    }
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

fn has_real_composition_html(input_json: &Value) -> bool {
    input_json
        .get("compositionHtml")
        .and_then(Value::as_str)
        .is_some_and(|html| {
            let trimmed = html.trim();
            !trimmed.is_empty() && trimmed.contains("<video") && trimmed.contains("source-video")
        })
}

fn value_as_display_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(text)) if !text.trim().is_empty() => Some(text.trim().to_string()),
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

pub fn build_worker_job_display_metadata(job: &ClaimedWorkerJob) -> WorkerJobDisplayMetadata {
    let source = job.input_json.get("source");
    let project_name = source
        .and_then(|source| value_as_display_string(source.get("manualProjectName")))
        .or_else(|| value_as_display_string(job.input_json.get("projectName")))
        .or_else(|| value_as_display_string(job.input_json.get("name")));
    let project_id = source
        .and_then(|source| value_as_display_string(source.get("storyboardReviewId")))
        .map(|id| format!("storyboardReview:{id}"))
        .or_else(|| {
            source
                .and_then(|source| value_as_display_string(source.get("productId")))
                .map(|id| format!("product:{id}"))
        })
        .or_else(|| {
            source
                .and_then(|source| value_as_display_string(source.get("runId")))
                .map(|id| format!("run:{id}"))
        })
        .or_else(|| value_as_display_string(job.input_json.get("projectId")));
    let label = match job.job_type.as_str() {
        HYPERFRAMES_JOB_TYPE => project_name
            .as_ref()
            .map(|name| format!("HyperFrames final composite · {name}"))
            .unwrap_or_else(|| "HyperFrames final composite".into()),
        _ => project_name
            .as_ref()
            .map(|name| format!("{} · {name}", job.job_type))
            .unwrap_or_else(|| job.job_type.clone()),
    };

    WorkerJobDisplayMetadata {
        label,
        project_id,
        project_name,
    }
}

pub fn sanitize_segment(value: &str) -> String {
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
    let relative_part = if path.is_absolute() {
        path.strip_prefix(root).unwrap_or(path)
    } else {
        path
    };
    if relative_part
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
    if !has_real_composition_html(&job.input_json) {
        return Err(
            "HyperFrames final composite requires real compositionHtml with source-video elements"
                .into(),
        );
    }
    if read_asset_count(&job.input_json) == 0 {
        return Err("HyperFrames final composite requires at least one source video asset".into());
    }

    let job_segment = sanitize_segment(&job.id);
    if job_segment.is_empty() {
        return Err("job id is invalid for workspace staging".into());
    }
    let workspace_dir = workspace_root.join(job_segment);
    let output_dir = safe_join(&workspace_dir, "out")?;
    let sidecar_manifest_path = safe_join(&workspace_dir, "sidecar-input.json")?;
    let final_video_path = safe_join(&output_dir, "final.mp4")?;
    let render_log_path = safe_join(&workspace_dir, "render.log")?;
    validate_workspace_path(workspace_root, &workspace_dir)?;
    validate_workspace_path(workspace_root, &output_dir)?;
    validate_workspace_path(workspace_root, &sidecar_manifest_path)?;
    validate_workspace_path(workspace_root, &final_video_path)?;
    validate_workspace_path(workspace_root, &render_log_path)?;

    Ok(HyperframesExecutionPlan {
        job_id: job.id.clone(),
        assignment_attempt: job.assignment_attempt.clone(),
        workspace_dir,
        sidecar_manifest_path,
        output_dir,
        final_video_path,
        render_log_path,
        max_duration_sec: value_u16(&job.input_json, "finalVideoLengthSec").unwrap_or(300),
        asset_count: read_asset_count(&job.input_json),
    })
}

pub fn build_sidecar_command(
    sidecar_executable: &Path,
    plan: &HyperframesExecutionPlan,
    use_wsl2: bool,
    managed_wsl_root: Option<&str>,
    managed_wsl_workspace_root: Option<&str>,
) -> Result<SidecarCommandPlan, String> {
    if sidecar_executable.as_os_str().is_empty() {
        return Err("HyperFrames sidecar executable path is empty".into());
    }

    let runtime_root = runtime_root_for_sidecar(sidecar_executable);
    let current_dir = plan.workspace_dir.clone();

    if use_wsl2 {
        if let Some(managed_wsl_root) = managed_wsl_root
            .map(str::trim)
            .filter(|root| !root.is_empty())
        {
            let executable = PathBuf::from("wsl.exe");
            let root_expr = wsl_shell_assignment_expr(managed_wsl_root);
            let workspace_root_expr = managed_wsl_workspace_root
                .map(str::trim)
                .filter(|root| !root.is_empty())
                .map(wsl_shell_assignment_expr)
                .unwrap_or_else(|| "\"\"".into());
            let job_segment = plan
                .workspace_dir
                .file_name()
                .and_then(|name| name.to_str())
                .map(shell_single_quote)
                .ok_or_else(|| "managed WSL workspace job segment is invalid".to_string())?;
            let windows_workspace = shell_single_quote(&to_wsl_path(&plan.workspace_dir));
            let windows_output_dir = shell_single_quote(&to_wsl_path(&plan.output_dir));
            let script = format!(
                "set -Eeuo pipefail\n\
                \n\
                ROOT={root_expr}\n\
                CONFIGURED_WORKSPACE_ROOT={workspace_root_expr}\n\
                \n\
                if [ -z \"$CONFIGURED_WORKSPACE_ROOT\" ]; then\n\
                  RUNTIME_PARENT=$(dirname \"$ROOT\")\n\
                  CONFIGURED_WORKSPACE_ROOT=\"$RUNTIME_PARENT/workspace\"\n\
                fi\n\
                \n\
                WINDOWS_WORKSPACE={windows_workspace}\n\
                WINDOWS_OUTPUT_DIR={windows_output_dir}\n\
                JOB_SEGMENT={job_segment}\n\
                \n\
                WSL_JOB_WORKSPACE=\"$CONFIGURED_WORKSPACE_ROOT/$JOB_SEGMENT\"\n\
                WSL_OUTPUT_DIR=\"$WSL_JOB_WORKSPACE/out\"\n\
                WSL_MANIFEST=\"$WSL_JOB_WORKSPACE/sidecar-input.json\"\n\
                \n\
                NODE_BIN=\"$ROOT/runtime-pack/node/bin/node\"\n\
                HF_CLI=\"$ROOT/runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js\"\n\
                RENDER_SIDECAR=\"$ROOT/runtime-pack/hyperframes-sidecar/render.mjs\"\n\
                \n\
                export SMARTAIHUB_RUNTIME_ROOT=\"$ROOT\"\n\
                export SMARTAIHUB_MANAGED_WSL_JOB_WORKSPACE=\"$WSL_JOB_WORKSPACE\"\n\
                export SMARTAIHUB_ENABLE_GPU_ENCODING=\"${{SMARTAIHUB_ENABLE_GPU_ENCODING:-1}}\"\n\
                export SMARTAIHUB_DISABLE_BROWSER_GPU=\"${{SMARTAIHUB_DISABLE_BROWSER_GPU:-1}}\"\n\
                \n\
                export FFMPEG_PATH=\"$ROOT/runtime-pack/bin/ffmpeg\"\n\
                export FFPROBE_PATH=\"$ROOT/runtime-pack/bin/ffprobe\"\n\
                export HYPERFRAMES_FFMPEG_PATH=\"$FFMPEG_PATH\"\n\
                export HYPERFRAMES_FFPROBE_PATH=\"$FFPROBE_PATH\"\n\
                \n\
                export BROWSER_PATH=\"$ROOT/runtime-pack/browser/chrome\"\n\
                export CHROME_PATH=\"$BROWSER_PATH\"\n\
                export PUPPETEER_EXECUTABLE_PATH=\"$BROWSER_PATH\"\n\
                export HYPERFRAMES_BROWSER_PATH=\"$BROWSER_PATH\"\n\
                export PRODUCER_HEADLESS_SHELL_PATH=\"$BROWSER_PATH\"\n\
                \n\
                export HYPERFRAMES_NO_AUTO_INSTALL=1\n\
                \n\
                RENDER_TIMEOUT_SECONDS=\"${{RENDER_TIMEOUT_SECONDS:-3600}}\"\n\
                \n\
                sync_render_output() {{\n\
                  if [ -d \"$WSL_OUTPUT_DIR\" ]; then\n\
                    mkdir -p \"$WINDOWS_OUTPUT_DIR\"\n\
                    cp -a \"$WSL_OUTPUT_DIR\"/. \"$WINDOWS_OUTPUT_DIR\"/ 2>/dev/null || true\n\
                  fi\n\
                }}\n\
                \n\
                cleanup_render_tree() {{\n\
                  status=$?\n\
                  trap - EXIT INT TERM HUP\n\
                \n\
                  if [ -n \"${{render_pid:-}}\" ]; then\n\
                    kill -TERM -\"$render_pid\" 2>/dev/null || kill -TERM \"$render_pid\" 2>/dev/null || true\n\
                    sleep 2\n\
                    kill -KILL -\"$render_pid\" 2>/dev/null || kill -KILL \"$render_pid\" 2>/dev/null || true\n\
                  fi\n\
                \n\
                  sync_render_output\n\
                  exit \"$status\"\n\
                }}\n\
                \n\
                trap cleanup_render_tree EXIT INT TERM HUP\n\
                \n\
                echo \"[Setup] Preparing WSL workspace...\"\n\
                rm -rf \"$WSL_JOB_WORKSPACE\"\n\
                mkdir -p \"$WSL_JOB_WORKSPACE\" \"$WINDOWS_OUTPUT_DIR\"\n\
                \n\
                cp -a \"$WINDOWS_WORKSPACE\"/. \"$WSL_JOB_WORKSPACE\"/\n\
                \n\
                # Clear copied/stale output after copying workspace\n\
                rm -rf \"$WSL_OUTPUT_DIR\"\n\
                mkdir -p \"$WSL_OUTPUT_DIR\"\n\
                \n\
                cd \"$WSL_JOB_WORKSPACE\"\n\
                \n\
                echo \"[Preflight] Checking required files...\"\n\
                \n\
                if [ ! -f \"$WSL_JOB_WORKSPACE/index.html\" ]; then\n\
                  echo \"[ERROR] Missing index.html: $WSL_JOB_WORKSPACE/index.html\" >&2\n\
                  exit 21\n\
                fi\n\
                \n\
                if [ ! -f \"$WSL_MANIFEST\" ]; then\n\
                  echo \"[ERROR] Missing sidecar-input.json: $WSL_MANIFEST\" >&2\n\
                  exit 22\n\
                fi\n\
                \n\
                if [ ! -x \"$NODE_BIN\" ]; then\n\
                  echo \"[ERROR] Node not executable: $NODE_BIN\" >&2\n\
                  exit 23\n\
                fi\n\
                \n\
                if [ ! -f \"$HF_CLI\" ]; then\n\
                  echo \"[ERROR] HyperFrames CLI not found: $HF_CLI\" >&2\n\
                  exit 24\n\
                fi\n\
                \n\
                if [ ! -f \"$RENDER_SIDECAR\" ]; then\n\
                  echo \"[ERROR] Render sidecar not found: $RENDER_SIDECAR\" >&2\n\
                  exit 25\n\
                fi\n\
                \n\
                if [ ! -x \"$FFMPEG_PATH\" ]; then\n\
                  echo \"[ERROR] FFmpeg not executable: $FFMPEG_PATH\" >&2\n\
                  exit 26\n\
                fi\n\
                \n\
                if [ ! -x \"$BROWSER_PATH\" ]; then\n\
                  echo \"[ERROR] Browser not executable: $BROWSER_PATH\" >&2\n\
                  exit 27\n\
                fi\n\
                \n\
                echo \"[Preflight] Running HyperFrames lint...\"\n\
                \"$NODE_BIN\" \"$HF_CLI\" lint --composition . || true\n\
                \n\
                echo \"[Preflight] Running HyperFrames validate...\"\n\
                \"$NODE_BIN\" \"$HF_CLI\" validate --composition . || true\n\
                \n\
                echo \"[Render] Starting render with timeout ${{RENDER_TIMEOUT_SECONDS}}s...\"\n\
                \n\
                set +e\n\
                \n\
                timeout --signal=TERM --kill-after=20s \"$RENDER_TIMEOUT_SECONDS\" \\\n  setsid \"$NODE_BIN\" \"$RENDER_SIDECAR\" \\\n  render \\\n  --manifest \"$WSL_MANIFEST\" \\\n  --workspace \"$WSL_JOB_WORKSPACE\" \\\n  --output-dir \"$WSL_OUTPUT_DIR\" \\\n  --format mp4 &\n\
                \n\
                render_pid=$!\n\
                wait \"$render_pid\"\n\
                render_status=$?\n\
                \n\
                set -e\n\
                \n\
                trap - EXIT INT TERM HUP\n\
                \n\
                echo \"[Render] Finished with status: $render_status\"\n\
                \n\
                sync_render_output\n\
                \n\
                exit \"$render_status\""
            );
            let cleanup_script = format!(
                "set +e\nROOT={root_expr}\nCONFIGURED_WORKSPACE_ROOT={workspace_root_expr}\nif [ -z \"$CONFIGURED_WORKSPACE_ROOT\" ]; then\n  RUNTIME_PARENT=$(dirname \"$ROOT\")\n  CONFIGURED_WORKSPACE_ROOT=\"$RUNTIME_PARENT/workspace\"\nfi\nJOB_SEGMENT={job_segment}\nworkspace=\"$CONFIGURED_WORKSPACE_ROOT/$JOB_SEGMENT\"\nfor pid in $(pgrep -f \"hyperframes-sidecar/render.mjs.*--workspace $workspace\" || true); do\n  pgid=$(ps -o pgid= -p \"$pid\" | tr -d ' ')\n  if [ -n \"$pgid\" ]; then\n    kill -TERM -\"$pgid\" 2>/dev/null || true\n  else\n    kill -TERM \"$pid\" 2>/dev/null || true\n  fi\ndone\nsleep 2\nfor pid in $(pgrep -f \"hyperframes-sidecar/render.mjs.*--workspace $workspace\" || true); do\n  pgid=$(ps -o pgid= -p \"$pid\" | tr -d ' ')\n  if [ -n \"$pgid\" ]; then\n    kill -KILL -\"$pgid\" 2>/dev/null || true\n  else\n    kill -KILL \"$pid\" 2>/dev/null || true\n  fi\ndone"
            );
            let args = vec!["-e".into(), "bash".into(), "-s".into()];
            let cleanup_args = vec!["-e".into(), "bash".into(), "-s".into()];
            let mut envs = std::collections::HashMap::new();
            envs.insert(
                "SMARTAIHUB_MANAGED_WSL_ROOT".into(),
                managed_wsl_root.into(),
            );
            if let Some(managed_wsl_workspace_root) = managed_wsl_workspace_root
                .map(str::trim)
                .filter(|root| !root.is_empty())
            {
                envs.insert(
                    "SMARTAIHUB_MANAGED_WSL_WORKSPACE_ROOT".into(),
                    managed_wsl_workspace_root.into(),
                );
            }
            for (key, value) in DEFAULT_RENDER_ENV {
                envs.insert((*key).into(), (*value).into());
            }
            let preview_script = format!(
                "set -Eeuo pipefail\n\
                \n\
                ROOT={root_expr}\n\
                JOB_SEGMENT={job_segment}\n\
                \n\
                CONFIGURED_WORKSPACE_ROOT={workspace_root_expr}\n\
                if [ -z \"$CONFIGURED_WORKSPACE_ROOT\" ]; then\n\
                  CONFIGURED_WORKSPACE_ROOT=\"$(dirname \"$ROOT\")/workspace\"\n\
                fi\n\
                \n\
                WINDOWS_WORKSPACE={windows_workspace}\n\
                WSL_JOB_WORKSPACE=\"$CONFIGURED_WORKSPACE_ROOT/$JOB_SEGMENT\"\n\
                \n\
                NODE_BIN=\"$ROOT/runtime-pack/node/bin/node\"\n\
                HF_CLI=\"$ROOT/runtime-pack/hyperframes/node_modules/hyperframes/dist/cli.js\"\n\
                \n\
                export SMARTAIHUB_RUNTIME_ROOT=\"$ROOT\"\n\
                export BROWSER_PATH=\"$ROOT/runtime-pack/browser/chrome\"\n\
                export CHROME_PATH=\"$BROWSER_PATH\"\n\
                export PUPPETEER_EXECUTABLE_PATH=\"$BROWSER_PATH\"\n\
                export HYPERFRAMES_BROWSER_PATH=\"$BROWSER_PATH\"\n\
                export HYPERFRAMES_NO_AUTO_INSTALL=1\n\
                \n\
                echo \"[Preview] Preparing WSL workspace...\"\n\
                rm -rf \"$WSL_JOB_WORKSPACE\"\n\
                mkdir -p \"$WSL_JOB_WORKSPACE\"\n\
                \n\
                cp -a \"$WINDOWS_WORKSPACE\"/. \"$WSL_JOB_WORKSPACE\"/\n\
                \n\
                cd \"$WSL_JOB_WORKSPACE\"\n\
                \n\
                if [ ! -f index.html ]; then\n\
                  echo \"[ERROR] Missing index.html\" >&2\n\
                  exit 21\n\
                fi\n\
                \n\
                echo \"[Preview] Starting HyperFrames preview...\"\n\
                \"$NODE_BIN\" \"$HF_CLI\" preview --composition . --host 0.0.0.0\n"
            );
            return Ok(SidecarCommandPlan {
                executable,
                args,
                current_dir,
                envs: envs.clone(),
                stdin_data: Some(script),
                preview_stdin_data: Some(preview_script),
                cleanup: Some(SidecarCleanupPlan {
                    executable: PathBuf::from("wsl.exe"),
                    args: cleanup_args,
                    current_dir: plan.workspace_dir.clone(),
                    envs,
                    stdin_data: Some(cleanup_script),
                }),
            });
        }

        let executable = PathBuf::from("wsl.exe");
        let runtime_pack_root = runtime_root.join("runtime-pack");
        let node_binary = runtime_pack_root.join("node").join("bin").join("node");
        let render_script = runtime_pack_root
            .join("hyperframes-sidecar")
            .join("render.mjs");
        let ffmpeg_path = runtime_pack_root.join("bin").join("ffmpeg");
        let ffprobe_path = runtime_pack_root.join("bin").join("ffprobe");
        let browser_path = runtime_pack_root.join("browser").join("chrome");

        let args = vec![
            "-e".into(),
            to_wsl_path(&node_binary),
            to_wsl_path(&render_script),
            "render".into(),
            "--manifest".into(),
            to_wsl_path(&plan.sidecar_manifest_path),
            "--workspace".into(),
            to_wsl_path(&plan.workspace_dir),
            "--output-dir".into(),
            to_wsl_path(&plan.output_dir),
            "--format".into(),
            "mp4".into(),
        ];

        let mut envs = std::collections::HashMap::new();
        envs.insert(
            "WSLENV".into(),
            [
                "SMARTAIHUB_RUNTIME_ROOT",
                "FFMPEG_PATH",
                "FFPROBE_PATH",
                "HYPERFRAMES_FFMPEG_PATH",
                "HYPERFRAMES_FFPROBE_PATH",
                "BROWSER_PATH",
                "CHROME_PATH",
                "PUPPETEER_EXECUTABLE_PATH",
                "HYPERFRAMES_BROWSER_PATH",
                "PRODUCER_HEADLESS_SHELL_PATH",
                "HYPERFRAMES_NO_AUTO_INSTALL",
                "SMARTAIHUB_ENABLE_GPU_ENCODING",
                "SMARTAIHUB_DISABLE_BROWSER_GPU",
                "SMARTAIHUB_HYPERFRAMES_DEBUG",
            ]
            .join(":"),
        );
        envs.insert("SMARTAIHUB_RUNTIME_ROOT".into(), to_wsl_path(&runtime_root));
        envs.insert("FFMPEG_PATH".into(), to_wsl_path(&ffmpeg_path));
        envs.insert("FFPROBE_PATH".into(), to_wsl_path(&ffprobe_path));
        envs.insert("HYPERFRAMES_FFMPEG_PATH".into(), to_wsl_path(&ffmpeg_path));
        envs.insert(
            "HYPERFRAMES_FFPROBE_PATH".into(),
            to_wsl_path(&ffprobe_path),
        );
        let browser_path = to_wsl_path(&browser_path);
        envs.insert("BROWSER_PATH".into(), browser_path.clone());
        envs.insert("CHROME_PATH".into(), browser_path.clone());
        envs.insert("PUPPETEER_EXECUTABLE_PATH".into(), browser_path.clone());
        envs.insert("HYPERFRAMES_BROWSER_PATH".into(), browser_path.clone());
        envs.insert("PRODUCER_HEADLESS_SHELL_PATH".into(), browser_path);
        envs.insert("HYPERFRAMES_NO_AUTO_INSTALL".into(), "1".into());
        for (key, value) in DEFAULT_RENDER_ENV {
            envs.insert((*key).into(), (*value).into());
        }

        return Ok(SidecarCommandPlan {
            executable,
            args,
            current_dir,
            envs,
            stdin_data: None,
            preview_stdin_data: None,
            cleanup: None,
        });
    }

    #[cfg(target_os = "windows")]
    let node_binary = runtime_root
        .join("runtime-pack")
        .join("node")
        .join("node.exe");
    #[cfg(not(target_os = "windows"))]
    let node_binary = runtime_root
        .join("runtime-pack")
        .join("node")
        .join("bin")
        .join("node");

    let executable = if node_binary.exists() {
        node_binary
    } else {
        PathBuf::from("node")
    };

    let args = vec![
        sidecar_executable.to_string_lossy().to_string(),
        "render".into(),
        "--manifest".into(),
        plan.sidecar_manifest_path.to_string_lossy().to_string(),
        "--workspace".into(),
        plan.workspace_dir.to_string_lossy().to_string(),
        "--output-dir".into(),
        plan.output_dir.to_string_lossy().to_string(),
        "--format".into(),
        "mp4".into(),
    ];

    let mut envs = std::collections::HashMap::new();
    envs.insert(
        "SMARTAIHUB_RUNTIME_ROOT".into(),
        runtime_root.to_string_lossy().to_string(),
    );
    for (key, value) in DEFAULT_RENDER_ENV {
        envs.insert((*key).into(), (*value).into());
    }

    #[cfg(target_os = "windows")]
    {
        envs.insert(
            "FFMPEG_PATH".into(),
            runtime_root
                .join("runtime-pack")
                .join("bin")
                .join("ffmpeg.exe")
                .to_string_lossy()
                .to_string(),
        );
        envs.insert(
            "FFPROBE_PATH".into(),
            runtime_root
                .join("runtime-pack")
                .join("bin")
                .join("ffprobe.exe")
                .to_string_lossy()
                .to_string(),
        );
    }
    #[cfg(not(target_os = "windows"))]
    {
        envs.insert(
            "FFMPEG_PATH".into(),
            runtime_root
                .join("runtime-pack")
                .join("bin")
                .join("ffmpeg")
                .to_string_lossy()
                .to_string(),
        );
        envs.insert(
            "FFPROBE_PATH".into(),
            runtime_root
                .join("runtime-pack")
                .join("bin")
                .join("ffprobe")
                .to_string_lossy()
                .to_string(),
        );
    }

    Ok(SidecarCommandPlan {
        executable,
        args,
        current_dir,
        envs,
        stdin_data: None,
        preview_stdin_data: None,
        cleanup: None,
    })
}

fn runtime_root_for_sidecar(sidecar_executable: &Path) -> PathBuf {
    let sidecar_dir = sidecar_executable.parent().unwrap_or_else(|| Path::new(""));
    if sidecar_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "sidecars")
    {
        return sidecar_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| sidecar_dir.to_path_buf());
    }
    sidecar_dir.to_path_buf()
}

pub fn build_sidecar_manifest(job: &ClaimedWorkerJob, plan: &HyperframesExecutionPlan) -> Value {
    json!({
        "jobId": job.id,
        "assignmentAttempt": job.assignment_attempt,
        "renderIntent": HYPERFRAMES_RENDER_INTENT,
        "input": job.input_json,
        "output": {
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
                event_type: if *stage == "publish_artifacts" {
                    "job.completed".into()
                } else {
                    "job.progress".into()
                },
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

pub fn validate_final_video_artifact(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("HyperFrames final video is missing: {error}"))?;
    if !metadata.is_file() {
        return Err("HyperFrames final video path is not a file".into());
    }
    let size_bytes = metadata.len();
    if size_bytes < HYPERFRAMES_FINAL_VIDEO_MIN_BYTES {
        return Err(format!(
            "HyperFrames final video is too small to be a valid MP4 output ({size_bytes} bytes)"
        ));
    }

    let mut file = fs::File::open(path)
        .map_err(|error| format!("failed to open HyperFrames final video: {error}"))?;
    let mut header = [0u8; 12];
    file.read_exact(&mut header)
        .map_err(|error| format!("failed to read HyperFrames final video header: {error}"))?;
    if &header[4..8] != b"ftyp" {
        return Err("HyperFrames final video is not a valid MP4 container".into());
    }

    Ok(size_bytes)
}

fn to_wsl_path(path: &Path) -> String {
    let s = path.to_string_lossy().to_string();
    let mut s = s.replace('\\', "/");
    if s.starts_with("//?/") {
        s = s[4..].to_string();
    }
    if s.len() >= 2 && s.chars().nth(1) == Some(':') {
        let drive = s.chars().next().unwrap().to_lowercase().to_string();
        format!("/mnt/{}{}", drive, &s[2..])
    } else {
        s
    }
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_metadata_uses_hyperframes_source_fields() {
        let job = ClaimedWorkerJob {
            id: "job-1".into(),
            job_type: HYPERFRAMES_JOB_TYPE.into(),
            lease_owner_token: "lease-1".into(),
            assignment_attempt: "attempt-1".into(),
            input_json: json!({
                "source": {
                    "storyboardReviewId": 42,
                    "manualProjectName": "Launch render"
                }
            }),
            ..Default::default()
        };

        let metadata = build_worker_job_display_metadata(&job);

        assert_eq!(
            metadata.label,
            "HyperFrames final composite · Launch render"
        );
        assert_eq!(metadata.project_id.as_deref(), Some("storyboardReview:42"));
        assert_eq!(metadata.project_name.as_deref(), Some("Launch render"));
    }

    #[test]
    fn classify_job_type_routes_hyperframes_hermes_and_unknown_job_types() {
        assert_eq!(
            classify_job_type(HYPERFRAMES_JOB_TYPE),
            WorkerJobKind::Hyperframes
        );
        assert_eq!(
            classify_job_type(HERMES_MEDIA_IMAGE_JOB_TYPE),
            WorkerJobKind::HermesMediaImage
        );
        assert_eq!(
            classify_job_type(HERMES_MEDIA_VIDEO_JOB_TYPE),
            WorkerJobKind::HermesMediaVideo
        );
        assert_eq!(
            classify_job_type(HERMES_CONNECTION_AUTHORIZE_JOB_TYPE),
            WorkerJobKind::HermesConnectionAuthorize
        );
        assert_eq!(
            classify_job_type(HERMES_CONNECTION_PROBE_JOB_TYPE),
            WorkerJobKind::HermesConnectionProbe
        );
        assert_eq!(
            classify_job_type(HERMES_CONNECTION_DISCONNECT_JOB_TYPE),
            WorkerJobKind::HermesConnectionDisconnect
        );
        assert_eq!(classify_job_type("video_assembly"), WorkerJobKind::Unknown);
    }

    #[test]
    fn claimed_worker_job_defaults_hermes_fields_when_absent_from_json() {
        let job: ClaimedWorkerJob = serde_json::from_value(json!({
            "id": "job-1",
            "jobType": HYPERFRAMES_JOB_TYPE,
            "leaseOwnerToken": "lease-1",
            "assignmentAttempt": "attempt-1",
        }))
        .unwrap();

        assert_eq!(job.capability_requirements_json, Value::Null);
        assert!(job.reference_urls.is_empty());
    }
}
