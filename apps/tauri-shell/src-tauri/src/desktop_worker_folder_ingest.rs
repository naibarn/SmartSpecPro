use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::local_file_index::{build_managed_root, ManagedLocalRoot, WritebackMode};

const LOCAL_FOLDER_INGEST_PROGRESS_STAGES: &[&str] = &[
    "resolve_roots",
    "index_files",
    "extract_previews",
    "write_manifest",
    "upload_artifacts",
    "publish_artifacts",
    "trigger_indexing",
];

fn default_advanced_local_mode() -> bool {
    false
}

fn default_ingest_max_depth() -> u32 {
    5
}

fn default_ingest_max_files() -> u32 {
    250
}

fn default_include_preview_text() -> bool {
    true
}

fn default_preview_file_limit() -> u32 {
    25
}

fn default_snippet_file_limit() -> u32 {
    10
}

fn default_publish_manifest_to_library() -> bool {
    true
}

fn default_publish_summary_to_library() -> bool {
    true
}

fn default_trigger_indexing() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalFolderIngestWritebackMode {
    ReadSearchOnly,
    ManagedOutputOnly,
    UserConfirmedRootWrite,
    AdvancedLocalOverride,
}

impl LocalFolderIngestWritebackMode {
    fn to_writeback_mode(&self) -> WritebackMode {
        match self {
            Self::ReadSearchOnly => WritebackMode::ReadSearchOnly,
            Self::ManagedOutputOnly => WritebackMode::ManagedOutputOnly,
            Self::UserConfirmedRootWrite => WritebackMode::UserConfirmedRootWrite,
            Self::AdvancedLocalOverride => WritebackMode::AdvancedLocalOverride,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestRootSpec {
    pub root_id: String,
    pub name: String,
    pub path: String,
    pub requested_writeback_mode: Option<LocalFolderIngestWritebackMode>,
    #[serde(default = "default_advanced_local_mode")]
    pub advanced_local_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestWorkspacePolicy {
    pub mode: String,
    pub allowed_source_roots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestPolicy {
    #[serde(default = "default_ingest_max_depth")]
    pub max_depth: u32,
    #[serde(default = "default_ingest_max_files")]
    pub max_files: u32,
    #[serde(default = "default_include_preview_text")]
    pub include_preview_text: bool,
    #[serde(default = "default_preview_file_limit")]
    pub preview_file_limit: u32,
    pub snippet_query: Option<String>,
    #[serde(default = "default_snippet_file_limit")]
    pub snippet_file_limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestOutputTargets {
    #[serde(default = "default_publish_manifest_to_library")]
    pub publish_manifest_to_library: bool,
    #[serde(default = "default_publish_summary_to_library")]
    pub publish_summary_to_library: bool,
    #[serde(default = "default_trigger_indexing")]
    pub trigger_indexing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestJobSpec {
    pub roots: Vec<LocalFolderIngestRootSpec>,
    pub workspace_policy: LocalFolderIngestWorkspacePolicy,
    pub ingest_policy: LocalFolderIngestPolicy,
    pub output_targets: LocalFolderIngestOutputTargets,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestPlanRequest {
    pub job_id: String,
    pub workspace_dir: String,
    pub job: LocalFolderIngestJobSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderIngestExecutionPlan {
    pub job_id: String,
    pub workspace_root: String,
    pub output_dir: String,
    pub managed_roots: Vec<ManagedLocalRoot>,
    pub manifest_output_path: String,
    pub summary_output_path: String,
    pub max_depth: u32,
    pub max_files: u32,
    pub include_preview_text: bool,
    pub preview_file_limit: u32,
    pub snippet_query: Option<String>,
    pub snippet_file_limit: u32,
    pub publish_manifest_to_library: bool,
    pub publish_summary_to_library: bool,
    pub trigger_indexing: bool,
    pub progress_stages: Vec<String>,
}

fn sanitize_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "artifact".into()
    } else {
        sanitized
    }
}

fn canonicalize_existing_dir(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err(format!("directory must be absolute: {raw_path}"));
    }
    if !path.exists() || !path.is_dir() {
        return Err(format!("directory does not exist or is not a directory: {raw_path}"));
    }
    path.canonicalize().map_err(|error| error.to_string())
}

fn is_within_allowed_roots(candidate: &Path, allowed_roots: &[String]) -> Result<bool, String> {
    for root in allowed_roots {
        let canonical_root = canonicalize_existing_dir(root)?;
        if candidate == canonical_root || candidate.starts_with(&canonical_root) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn prepare_local_folder_ingest_execution(
    request: LocalFolderIngestPlanRequest,
) -> Result<LocalFolderIngestExecutionPlan, String> {
    if request.job_id.trim().is_empty() {
        return Err("job_id is required".into());
    }
    if request.job.roots.is_empty() {
        return Err("local_folder_ingest requires at least one root".into());
    }
    if !request.job.output_targets.publish_manifest_to_library
        && !request.job.output_targets.publish_summary_to_library
    {
        return Err("local_folder_ingest requires at least one publishable artifact target".into());
    }

    let workspace_dir = canonicalize_existing_dir(&request.workspace_dir)?;
    let job_workspace = workspace_dir.join(sanitize_name(&request.job_id));
    let output_dir = job_workspace.join("outputs");
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;

    let mut seen_root_ids = HashSet::new();
    let mut managed_roots = Vec::new();

    for root in &request.job.roots {
        if root.root_id.trim().is_empty() {
            return Err("local_folder_ingest rootId is required".into());
        }
        if !seen_root_ids.insert(root.root_id.clone()) {
            return Err(format!("duplicate local_folder_ingest rootId: {}", root.root_id));
        }

        let canonical_root = canonicalize_existing_dir(&root.path)?;
        if !is_within_allowed_roots(
            &canonical_root,
            &request.job.workspace_policy.allowed_source_roots,
        )? {
            return Err(format!(
                "path is outside the approved workspace roots: {}",
                canonical_root.to_string_lossy()
            ));
        }

        let managed_root = build_managed_root(
            &root.root_id,
            &root.name,
            &canonical_root.to_string_lossy(),
            root.requested_writeback_mode
                .as_ref()
                .map(LocalFolderIngestWritebackMode::to_writeback_mode),
            root.advanced_local_mode,
        )?;
        if managed_root.denied_by_default || !managed_root.indexing_enabled {
            return Err(format!(
                "local_folder_ingest root {} is blocked by desktop policy",
                root.root_id
            ));
        }
        managed_roots.push(managed_root);
    }

    Ok(LocalFolderIngestExecutionPlan {
        job_id: request.job_id,
        workspace_root: job_workspace.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        managed_roots,
        manifest_output_path: output_dir
            .join("local_folder_ingest_manifest.json")
            .to_string_lossy()
            .to_string(),
        summary_output_path: output_dir
            .join("local_folder_ingest_summary.txt")
            .to_string_lossy()
            .to_string(),
        max_depth: request.job.ingest_policy.max_depth.clamp(1, 12),
        max_files: request.job.ingest_policy.max_files.clamp(1, 1000),
        include_preview_text: request.job.ingest_policy.include_preview_text,
        preview_file_limit: request.job.ingest_policy.preview_file_limit.min(100),
        snippet_query: request
            .job
            .ingest_policy
            .snippet_query
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        snippet_file_limit: request.job.ingest_policy.snippet_file_limit.min(50),
        publish_manifest_to_library: request.job.output_targets.publish_manifest_to_library,
        publish_summary_to_library: request.job.output_targets.publish_summary_to_library,
        trigger_indexing: request.job.output_targets.trigger_indexing,
        progress_stages: LOCAL_FOLDER_INGEST_PROGRESS_STAGES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
    })
}

#[tauri::command]
pub async fn desktop_host_prepare_local_folder_ingest(
    request: LocalFolderIngestPlanRequest,
) -> Result<LocalFolderIngestExecutionPlan, String> {
    prepare_local_folder_ingest_execution(request)
}
