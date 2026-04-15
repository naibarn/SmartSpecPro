use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use crate::desktop_worker_control_plane::{
    build_comfy_image_generation_failure_event, build_comfy_image_generation_progress_event,
    build_comfy_workflow_run_failure_event, build_comfy_workflow_run_progress_event,
    build_local_folder_ingest_failure_event, build_local_folder_ingest_progress_event,
    build_worker_job_failure_event, build_worker_job_progress_event, claim_and_prepare_worker_job,
    report_worker_job_event, upload_worker_artifact_file,
    DesktopWorkerApiRequest, DesktopWorkerArtifactUploadFileRequest,
    DesktopWorkerArtifactUploadFileResponse, DesktopWorkerClaimAndPrepareRequest,
    DesktopWorkerClaimAndPrepareResponse, DesktopWorkerClaimJobRequest,
    DesktopWorkerEventRequest, WorkerClaimRequest, WorkerJobEventPayload,
};
use crate::desktop_worker_comfy::{
    execute_comfy_image_generation, execute_comfy_workflow_run, ComfyExecutionResult,
    ComfyImageGenerationJobSpec, ComfyWorkflowRunJobSpec,
};
use crate::desktop_worker_folder_ingest::LocalFolderIngestExecutionPlan;
use crate::desktop_worker_runtime::{
    VideoAssemblyExecutionPlan, VideoAssemblyPrefetchedInput, VideoAssemblySubtitleMode,
};
use crate::local_file_index::index_root_files;
use crate::local_file_service::{get_preview_internal, get_snippets_internal};
use crate::video_editor::ffmpeg::{
    burn_in_subtitle_track_sync, generate_thumbnail_sync, mux_subtitle_track_sync,
    probe_media_file_sync,
};
use crate::video_editor::render::render_project_blocking;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerCycleRequest {
    pub control_plane_base_url: String,
    pub worker_id: String,
    pub execution_token: String,
    pub upload_token: String,
    pub workspace_dir: String,
    pub request_timeout_ms: Option<u64>,
    #[serde(default)]
    pub capability_hints: Vec<String>,
    #[serde(default)]
    pub prefetched_inputs: Vec<VideoAssemblyPrefetchedInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopWorkerCycleOutcome {
    Idle,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerLocalArtifact {
    pub artifact_type: String,
    pub absolute_path: String,
    pub file_name: Option<String>,
    pub content_type: String,
    #[serde(default)]
    pub metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerCycleResult {
    pub outcome: DesktopWorkerCycleOutcome,
    pub worker_id: String,
    pub job_id: Option<String>,
    pub lease_owner_token: Option<String>,
    pub workspace_root: Option<String>,
    pub sequence_number: u32,
    #[serde(default)]
    pub uploaded_artifacts: Vec<DesktopWorkerArtifactUploadFileResponse>,
    #[serde(default)]
    pub local_artifacts: Vec<DesktopWorkerLocalArtifact>,
    pub failure_code: Option<String>,
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerLoopRequest {
    pub cycle_request: DesktopWorkerCycleRequest,
    pub max_cycles: u32,
    pub stop_on_idle: bool,
    pub idle_backoff_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerLoopResult {
    pub iterations: u32,
    pub completed_cycles: u32,
    pub failed_cycles: u32,
    pub idle_cycles: u32,
    pub last_result: Option<DesktopWorkerCycleResult>,
}

#[derive(Debug, Clone)]
struct DesktopWorkerExecutionError {
    failure_code: &'static str,
    message: String,
}

impl DesktopWorkerExecutionError {
    fn new(failure_code: &'static str, message: impl Into<String>) -> Self {
        Self {
            failure_code,
            message: message.into(),
        }
    }
}

fn build_exec_api(request: &DesktopWorkerCycleRequest) -> DesktopWorkerApiRequest {
    DesktopWorkerApiRequest {
        control_plane_base_url: request.control_plane_base_url.clone(),
        bearer_token: request.execution_token.clone(),
        request_timeout_ms: request.request_timeout_ms,
    }
}

fn build_upload_api(request: &DesktopWorkerCycleRequest) -> DesktopWorkerApiRequest {
    DesktopWorkerApiRequest {
        control_plane_base_url: request.control_plane_base_url.clone(),
        bearer_token: request.upload_token.clone(),
        request_timeout_ms: request.request_timeout_ms,
    }
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("artifact.bin")
        .to_string()
}

fn content_type_for_path(path: &str) -> String {
    match Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("json") => "application/json",
        Some("srt") => "application/x-subrip",
        Some("vtt") => "text/vtt",
        Some("txt") => "text/plain",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn checksum_sha256(path: &str) -> Result<String, DesktopWorkerExecutionError> {
    let bytes = fs::read(path).map_err(|error| {
        DesktopWorkerExecutionError::new(
            "artifact_publish_failed",
            format!("failed to read artifact for checksum: {error}"),
        )
    })?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn digest_string_sha256(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn ensure_path_exists(path: &str, failure_code: &'static str) -> Result<(), DesktopWorkerExecutionError> {
    let path_buf = PathBuf::from(path);
    if !path_buf.is_absolute() || !path_buf.is_file() {
        return Err(DesktopWorkerExecutionError::new(
            failure_code,
            format!("expected artifact file to exist: {path}"),
        ));
    }
    Ok(())
}

fn canonicalize_existing_dir(
    path: &str,
    failure_code: &'static str,
) -> Result<PathBuf, DesktopWorkerExecutionError> {
    let path_buf = PathBuf::from(path);
    if !path_buf.is_absolute() || !path_buf.is_dir() {
        return Err(DesktopWorkerExecutionError::new(
            failure_code,
            format!("expected workspace directory to exist: {path}"),
        ));
    }
    path_buf.canonicalize().map_err(|error| {
        DesktopWorkerExecutionError::new(
            failure_code,
            format!("failed to canonicalize directory {path}: {error}"),
        )
    })
}

fn ensure_existing_file_within_workspace(
    path: &str,
    workspace_root: &str,
    failure_code: &'static str,
) -> Result<String, DesktopWorkerExecutionError> {
    ensure_path_exists(path, failure_code)?;
    let canonical_workspace_root = canonicalize_existing_dir(workspace_root, failure_code)?;
    let canonical_path = PathBuf::from(path).canonicalize().map_err(|error| {
        DesktopWorkerExecutionError::new(
            failure_code,
            format!("failed to canonicalize file {path}: {error}"),
        )
    })?;
    if canonical_path == canonical_workspace_root || canonical_path.starts_with(&canonical_workspace_root) {
        return Ok(canonical_path.to_string_lossy().to_string());
    }
    Err(DesktopWorkerExecutionError::new(
        failure_code,
        format!("file path escapes workspace root: {path}"),
    ))
}

fn ensure_output_parent_within_workspace(
    output_path: &str,
    workspace_root: &str,
    failure_code: &'static str,
) -> Result<(), DesktopWorkerExecutionError> {
    let output_path_buf = PathBuf::from(output_path);
    let Some(parent_dir) = output_path_buf.parent() else {
        return Err(DesktopWorkerExecutionError::new(
            failure_code,
            format!("output path must have a parent directory: {output_path}"),
        ));
    };
    let canonical_workspace_root = canonicalize_existing_dir(workspace_root, failure_code)?;
    let canonical_parent_dir = parent_dir.canonicalize().map_err(|error| {
        DesktopWorkerExecutionError::new(
            failure_code,
            format!("failed to canonicalize output directory for {output_path}: {error}"),
        )
    })?;
    if canonical_parent_dir == canonical_workspace_root || canonical_parent_dir.starts_with(&canonical_workspace_root) {
        return Ok(());
    }
    Err(DesktopWorkerExecutionError::new(
        failure_code,
        format!("output directory escapes workspace root: {output_path}"),
    ))
}

fn subtitle_mode_key(mode: &VideoAssemblySubtitleMode) -> &'static str {
    match mode {
        VideoAssemblySubtitleMode::BurnIn => "burn_in",
        VideoAssemblySubtitleMode::SoftMux => "soft_mux",
        VideoAssemblySubtitleMode::None => "none",
    }
}

fn derived_postprocessed_output_path(
    rendered_output_path: &str,
    subtitle_mode: &VideoAssemblySubtitleMode,
) -> String {
    let output_path = PathBuf::from(rendered_output_path);
    let extension = output_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp4");
    let stem = output_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("rendered");
    let suffix = match subtitle_mode {
        VideoAssemblySubtitleMode::BurnIn => "burnin",
        VideoAssemblySubtitleMode::SoftMux => "softmux",
        VideoAssemblySubtitleMode::None => "processed",
    };
    output_path
        .with_file_name(format!("{stem}_{suffix}.{extension}"))
        .to_string_lossy()
        .to_string()
}

fn report_event_internal<ReportFn>(
    report_event: &ReportFn,
    request: &DesktopWorkerCycleRequest,
    job_id: &str,
    payload: WorkerJobEventPayload,
) -> Result<(), DesktopWorkerExecutionError>
where
    ReportFn: Fn(DesktopWorkerEventRequest) -> Result<(), DesktopWorkerExecutionError>,
{
    report_event(DesktopWorkerEventRequest {
        api: build_exec_api(request),
        job_id: job_id.to_string(),
        payload,
    })
}

fn materialize_video_assembly_artifacts(
    plan: &VideoAssemblyExecutionPlan,
) -> Result<Vec<DesktopWorkerLocalArtifact>, DesktopWorkerExecutionError> {
    let mut artifacts = Vec::new();
    let mut final_output_paths = HashMap::<String, String>::new();
    let subtitle_mode = plan.subtitle_task.as_ref().map(|task| &task.mode);
    let staged_subtitle_path = if let Some(subtitle_task) = &plan.subtitle_task {
        match subtitle_task.mode {
            VideoAssemblySubtitleMode::None => None,
            VideoAssemblySubtitleMode::SoftMux | VideoAssemblySubtitleMode::BurnIn => {
                let subtitle_path = subtitle_task.staged_subtitle_path.as_ref().ok_or_else(|| {
                    DesktopWorkerExecutionError::new(
                        "adapter_contract_violation",
                        "video_assembly subtitle mode requires a staged subtitle file",
                    )
                })?;
                Some(ensure_existing_file_within_workspace(
                    subtitle_path,
                    &plan.workspace_root,
                    "unsupported_media",
                )?)
            }
        }
    } else {
        None
    };
    let staged_transcript_path = if let Some(subtitle_task) = &plan.subtitle_task {
        if let Some(transcript_path) = subtitle_task.staged_transcript_path.as_ref() {
            Some(ensure_existing_file_within_workspace(
                transcript_path,
                &plan.workspace_root,
                "unsupported_media",
            )?)
        } else {
            None
        }
    } else {
        None
    };

    for render_task in &plan.render_tasks {
        let render_job = render_project_blocking(&render_task.project_json, &render_task.output_path)
            .map_err(|error| DesktopWorkerExecutionError::new("render_failed", error))?;
        let rendered_output_path = ensure_existing_file_within_workspace(
            &render_task.output_path,
            &plan.workspace_root,
            "render_failed",
        )?;
        let final_output_path = if let (Some(mode), Some(subtitle_path)) =
            (subtitle_mode, staged_subtitle_path.as_ref())
        {
            let postprocessed_output_path =
                derived_postprocessed_output_path(&rendered_output_path, mode);
            ensure_output_parent_within_workspace(
                &postprocessed_output_path,
                &plan.workspace_root,
                "unauthorized_path",
            )?;
            match mode {
                VideoAssemblySubtitleMode::BurnIn => burn_in_subtitle_track_sync(
                    &rendered_output_path,
                    subtitle_path,
                    &postprocessed_output_path,
                )
                .map_err(|error| DesktopWorkerExecutionError::new("render_failed", error))?,
                VideoAssemblySubtitleMode::SoftMux => mux_subtitle_track_sync(
                    &rendered_output_path,
                    subtitle_path,
                    &postprocessed_output_path,
                )
                .map_err(|error| DesktopWorkerExecutionError::new("render_failed", error))?,
                VideoAssemblySubtitleMode::None => {}
            }
            ensure_existing_file_within_workspace(
                &postprocessed_output_path,
                &plan.workspace_root,
                "render_failed",
            )?
        } else {
            rendered_output_path
        };
        final_output_paths.insert(render_task.output_path.clone(), final_output_path.clone());

        let media_info = probe_media_file_sync(&final_output_path).map_err(|error| {
            DesktopWorkerExecutionError::new("unsupported_media", format!("failed to probe rendered output: {error}"))
        })?;
        let file_size_bytes = fs::metadata(&final_output_path)
            .map_err(|error| {
                DesktopWorkerExecutionError::new(
                    "artifact_publish_failed",
                    format!("failed to stat rendered output: {error}"),
                )
            })?
            .len();
        let checksum = checksum_sha256(&final_output_path)?;
        let manifest = json!({
            "jobId": plan.job_id,
            "label": render_task.label,
            "aspectRatio": render_task.aspect_ratio,
            "publishToLibrary": render_task.publish_to_library,
            "gpuRequired": render_task.gpu_required,
            "subtitleMode": subtitle_mode.map(subtitle_mode_key).unwrap_or("none"),
            "renderStatus": render_job.status,
            "renderedOutput": {
                "path": final_output_path,
                "sizeBytes": file_size_bytes,
                "checksumSha256": checksum,
                "durationSeconds": media_info.duration,
                "width": media_info.width,
                "height": media_info.height,
                "fps": media_info.fps,
                "codecVideo": media_info.codec_video,
                "codecAudio": media_info.codec_audio,
            },
            "sourceRenderOutputPath": render_task.output_path,
            "subtitleFilePath": staged_subtitle_path.clone(),
            "transcriptFilePath": staged_transcript_path.clone(),
        });
        fs::write(
            &render_task.metadata_manifest_path,
            serde_json::to_vec_pretty(&manifest).map_err(|error| {
                DesktopWorkerExecutionError::new(
                    "artifact_publish_failed",
                    format!("failed to serialize render manifest: {error}"),
                )
            })?,
        )
        .map_err(|error| {
            DesktopWorkerExecutionError::new(
                "artifact_publish_failed",
                format!("failed to write render manifest: {error}"),
            )
        })?;

        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "rendered_video".into(),
            absolute_path: final_output_path.clone(),
            file_name: Some(file_name_from_path(&final_output_path)),
            content_type: "video/mp4".into(),
            metadata_json: json!({
                "label": render_task.label,
                "aspectRatio": render_task.aspect_ratio,
                "publishToLibrary": render_task.publish_to_library,
                "gpuRequired": render_task.gpu_required,
                "subtitleMode": subtitle_mode.map(subtitle_mode_key).unwrap_or("none"),
                "sourceRenderOutputPath": render_task.output_path,
                "durationSeconds": media_info.duration,
                "width": media_info.width,
                "height": media_info.height,
                "fps": media_info.fps,
                "codecVideo": media_info.codec_video,
                "codecAudio": media_info.codec_audio,
            }),
        });
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "render_manifest".into(),
            absolute_path: ensure_existing_file_within_workspace(
                &render_task.metadata_manifest_path,
                &plan.workspace_root,
                "artifact_publish_failed",
            )?,
            file_name: Some(file_name_from_path(&render_task.metadata_manifest_path)),
            content_type: "application/json".into(),
            metadata_json: json!({
                "label": render_task.label,
                "aspectRatio": render_task.aspect_ratio,
                "manifestKind": "video_assembly_render_manifest",
            }),
        });
    }

    if let Some(subtitle_path) = staged_subtitle_path.as_ref() {
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "subtitle_file".into(),
            absolute_path: subtitle_path.clone(),
            file_name: Some(file_name_from_path(subtitle_path)),
            content_type: content_type_for_path(subtitle_path),
            metadata_json: json!({
                "source": subtitle_mode.map(subtitle_mode_key).unwrap_or("none"),
                "workspaceRoot": plan.workspace_root,
            }),
        });
    }
    if let Some(transcript_path) = staged_transcript_path.as_ref() {
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "transcript_file".into(),
            absolute_path: transcript_path.clone(),
            file_name: Some(file_name_from_path(transcript_path)),
            content_type: content_type_for_path(transcript_path),
            metadata_json: json!({
                "source": subtitle_mode.map(subtitle_mode_key).unwrap_or("none"),
                "workspaceRoot": plan.workspace_root,
            }),
        });
    }

    for thumbnail_task in &plan.thumbnail_tasks {
        let thumbnail_source_output_path = final_output_paths
            .get(&thumbnail_task.source_output_path)
            .cloned()
            .unwrap_or_else(|| thumbnail_task.source_output_path.clone());
        generate_thumbnail_sync(
            &thumbnail_source_output_path,
            &thumbnail_task.thumbnail_output_path,
            thumbnail_task.time_seconds as f64,
        )
        .map_err(|error| DesktopWorkerExecutionError::new("render_failed", error))?;
        let thumbnail_output_path = ensure_existing_file_within_workspace(
            &thumbnail_task.thumbnail_output_path,
            &plan.workspace_root,
            "render_failed",
        )?;
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "thumbnail_image".into(),
            absolute_path: thumbnail_output_path,
            file_name: Some(file_name_from_path(&thumbnail_task.thumbnail_output_path)),
            content_type: content_type_for_path(&thumbnail_task.thumbnail_output_path),
            metadata_json: json!({
                "label": thumbnail_task.label,
                "timeSeconds": thumbnail_task.time_seconds,
                "sourceOutputPath": thumbnail_source_output_path,
            }),
        });
    }

    if artifacts.is_empty() {
        return Err(DesktopWorkerExecutionError::new(
            "adapter_contract_violation",
            "video_assembly execution did not produce any local artifacts",
        ));
    }

    Ok(artifacts)
}

fn materialize_local_folder_ingest_artifacts(
    plan: &LocalFolderIngestExecutionPlan,
) -> Result<Vec<DesktopWorkerLocalArtifact>, DesktopWorkerExecutionError> {
    let mut artifacts = Vec::new();
    let mut root_summaries = Vec::new();
    let mut indexed_files = Vec::new();
    let mut summary_lines = vec![
        "SmartAIHub Local Folder Ingest Summary".to_string(),
        format!("Job ID: {}", plan.job_id),
        String::new(),
    ];

    let mut remaining_files = plan.max_files as usize;
    let mut remaining_previews = plan.preview_file_limit as usize;
    let mut remaining_snippet_files = plan.snippet_file_limit as usize;
    let mut total_files = 0_usize;
    let mut total_size_bytes = 0_u64;
    let mut total_previews = 0_usize;
    let mut total_snippets = 0_usize;
    let mut truncated = false;

    for root in &plan.managed_roots {
        let mut root_records = index_root_files(root, plan.max_depth).map_err(|error| {
            DesktopWorkerExecutionError::new(
                "adapter_contract_violation",
                format!("failed to index managed root {}: {error}", root.root_id),
            )
        })?;
        root_records.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

        let discovered_count = root_records.len();
        let included_records = if remaining_files == 0 {
            truncated = true;
            Vec::new()
        } else {
            root_records
                .into_iter()
                .take(remaining_files)
                .collect::<Vec<_>>()
        };
        if discovered_count > included_records.len() {
            truncated = true;
        }
        remaining_files = remaining_files.saturating_sub(included_records.len());

        let mut root_file_count = 0_usize;
        let mut root_size_bytes = 0_u64;
        let mut root_previews = 0_usize;
        let mut root_snippets = 0_usize;
        let root_path_hash = digest_string_sha256(&root.absolute_path);

        summary_lines.push(format!("Root: {} ({})", root.name, root.root_id));
        summary_lines.push(format!(
            "Path Hash: {}",
            &root_path_hash[..16]
        ));

        for record in included_records {
            root_file_count += 1;
            total_files += 1;
            root_size_bytes += record.size_bytes;
            total_size_bytes += record.size_bytes;

            let mut file_entry = json!({
                "rootId": record.root_id,
                "fileName": record.file_name,
                "relativePath": record.relative_path,
                "extension": record.extension,
                "sizeBytes": record.size_bytes,
                "sourcePathHash": digest_string_sha256(&record.absolute_path),
            });

            summary_lines.push(format!(
                "- {} [{} bytes]",
                file_entry["relativePath"].as_str().unwrap_or_default(),
                record.size_bytes,
            ));

            if plan.include_preview_text && remaining_previews > 0 {
                if let Ok(preview) = get_preview_internal(vec![root.clone()], &record.absolute_path) {
                    let preview_text = preview.preview_text.trim().chars().take(280).collect::<String>();
                    if !preview_text.is_empty() {
                        file_entry["previewText"] = json!(preview_text.clone());
                        remaining_previews -= 1;
                        root_previews += 1;
                        total_previews += 1;
                        summary_lines.push(format!("  Preview: {}", preview_text.replace('\n', " ")));
                    }
                }
            }

            if let Some(snippet_query) = plan.snippet_query.as_ref() {
                if remaining_snippet_files > 0 {
                    if let Ok(snippets) = get_snippets_internal(
                        vec![root.clone()],
                        &record.absolute_path,
                        snippet_query,
                    ) {
                        let snippet_payload = snippets
                            .into_iter()
                            .take(3)
                            .map(|snippet| {
                                root_snippets += 1;
                                total_snippets += 1;
                                json!({
                                    "lineNumber": snippet.line_number,
                                    "snippet": snippet.snippet,
                                })
                            })
                            .collect::<Vec<_>>();
                        if !snippet_payload.is_empty() {
                            file_entry["snippets"] = json!(snippet_payload);
                            remaining_snippet_files -= 1;
                        }
                    }
                }
            }

            indexed_files.push(file_entry);
        }

        summary_lines.push(format!(
            "Included Files: {} | Bytes: {} | Previews: {} | Snippets: {}",
            root_file_count, root_size_bytes, root_previews, root_snippets
        ));
        summary_lines.push(String::new());

        root_summaries.push(json!({
            "rootId": root.root_id,
            "name": root.name,
            "pathHash": root_path_hash,
            "includedFileCount": root_file_count,
            "discoveredFileCount": discovered_count,
            "sizeBytes": root_size_bytes,
            "previewCount": root_previews,
            "snippetCount": root_snippets,
        }));
    }

    let manifest = json!({
        "jobId": plan.job_id,
        "manifestKind": "local_folder_ingest_manifest",
        "roots": root_summaries,
        "files": indexed_files,
        "summary": {
            "rootCount": plan.managed_roots.len(),
            "indexedFileCount": total_files,
            "totalSizeBytes": total_size_bytes,
            "previewCount": total_previews,
            "snippetCount": total_snippets,
            "truncated": truncated,
        },
        "ingestPolicy": {
            "maxDepth": plan.max_depth,
            "maxFiles": plan.max_files,
            "includePreviewText": plan.include_preview_text,
            "previewFileLimit": plan.preview_file_limit,
            "snippetQuery": plan.snippet_query,
            "snippetFileLimit": plan.snippet_file_limit,
        },
        "outputTargets": {
            "publishManifestToLibrary": plan.publish_manifest_to_library,
            "publishSummaryToLibrary": plan.publish_summary_to_library,
            "triggerIndexing": plan.trigger_indexing,
        },
    });

    fs::write(
        &plan.manifest_output_path,
        serde_json::to_vec_pretty(&manifest).map_err(|error| {
            DesktopWorkerExecutionError::new(
                "artifact_publish_failed",
                format!("failed to serialize local_folder_ingest manifest: {error}"),
            )
        })?,
    )
    .map_err(|error| {
        DesktopWorkerExecutionError::new(
            "artifact_publish_failed",
            format!("failed to write local_folder_ingest manifest: {error}"),
        )
    })?;
    fs::write(&plan.summary_output_path, summary_lines.join("\n")).map_err(|error| {
        DesktopWorkerExecutionError::new(
            "artifact_publish_failed",
            format!("failed to write local_folder_ingest summary: {error}"),
        )
    })?;

    if plan.publish_manifest_to_library {
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "ingest_manifest".into(),
            absolute_path: ensure_existing_file_within_workspace(
                &plan.manifest_output_path,
                &plan.workspace_root,
                "artifact_publish_failed",
            )?,
            file_name: Some(file_name_from_path(&plan.manifest_output_path)),
            content_type: "application/json".into(),
            metadata_json: json!({
                "manifestKind": "local_folder_ingest_manifest",
                "rootCount": plan.managed_roots.len(),
                "indexedFileCount": total_files,
                "totalSizeBytes": total_size_bytes,
                "previewCount": total_previews,
                "snippetCount": total_snippets,
                "truncated": truncated,
            }),
        });
    }

    if plan.publish_summary_to_library {
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: "ingest_summary".into(),
            absolute_path: ensure_existing_file_within_workspace(
                &plan.summary_output_path,
                &plan.workspace_root,
                "artifact_publish_failed",
            )?,
            file_name: Some(file_name_from_path(&plan.summary_output_path)),
            content_type: "text/plain".into(),
            metadata_json: json!({
                "summaryKind": "local_folder_ingest_summary",
                "rootCount": plan.managed_roots.len(),
                "indexedFileCount": total_files,
                "truncated": truncated,
            }),
        });
    }

    if artifacts.is_empty() {
        return Err(DesktopWorkerExecutionError::new(
            "adapter_contract_violation",
            "local_folder_ingest execution did not produce any publishable artifacts",
        ));
    }

    Ok(artifacts)
}

fn materialize_comfy_artifacts(
    result: &ComfyExecutionResult,
    output_artifact_type: &str,
    manifest_artifact_type: &str,
) -> Result<Vec<DesktopWorkerLocalArtifact>, DesktopWorkerExecutionError> {
    let mut artifacts = Vec::new();

    if result.publish_outputs_to_library {
        for output in &result.downloaded_outputs {
            artifacts.push(DesktopWorkerLocalArtifact {
                artifact_type: output_artifact_type.into(),
                absolute_path: ensure_existing_file_within_workspace(
                    &output.absolute_path,
                    &result.workspace_root,
                    "artifact_publish_failed",
                )?,
                file_name: Some(output.file_name.clone()),
                content_type: output.content_type.clone(),
                metadata_json: json!({
                    "promptId": result.prompt_id,
                    "outputKind": output.output_kind,
                    "nodeId": output.node_id,
                    "relativePath": output.relative_path,
                }),
            });
        }
    }

    if result.publish_manifest_to_library {
        artifacts.push(DesktopWorkerLocalArtifact {
            artifact_type: manifest_artifact_type.into(),
            absolute_path: ensure_existing_file_within_workspace(
                &result.manifest_path,
                &result.workspace_root,
                "artifact_publish_failed",
            )?,
            file_name: Some(file_name_from_path(&result.manifest_path)),
            content_type: "application/json".into(),
            metadata_json: json!({
                "promptId": result.prompt_id,
                "outputCount": result.downloaded_outputs.len(),
                "triggerIndexing": result.trigger_indexing,
            }),
        });
    }

    if artifacts.is_empty() {
        return Err(DesktopWorkerExecutionError::new(
            "adapter_contract_violation",
            "ComfyUI execution did not produce any publishable artifacts",
        ));
    }

    Ok(artifacts)
}

fn upload_local_artifacts<UploadFn>(
    upload_artifact: &UploadFn,
    request: &DesktopWorkerCycleRequest,
    job_id: &str,
    lease_owner_token: &str,
    artifacts: &[DesktopWorkerLocalArtifact],
) -> Result<Vec<DesktopWorkerArtifactUploadFileResponse>, DesktopWorkerExecutionError>
where
    UploadFn: Fn(DesktopWorkerArtifactUploadFileRequest) -> Result<DesktopWorkerArtifactUploadFileResponse, DesktopWorkerExecutionError>,
{
    let mut uploaded = Vec::new();
    for artifact in artifacts {
        uploaded.push(upload_artifact(DesktopWorkerArtifactUploadFileRequest {
            api: build_upload_api(request),
            job_id: job_id.to_string(),
            artifact_type: artifact.artifact_type.clone(),
            file_path: artifact.absolute_path.clone(),
            file_name: artifact.file_name.clone(),
            content_type: artifact.content_type.clone(),
            metadata_json: artifact.metadata_json.clone(),
            lease_owner_token: lease_owner_token.to_string(),
        })?);
    }
    Ok(uploaded)
}

fn execute_video_assembly_cycle_with_ops<ClaimFn, ReportFn, MaterializeFn, UploadFn>(
    request: DesktopWorkerCycleRequest,
    claim_and_prepare: ClaimFn,
    report_event: ReportFn,
    materialize_artifacts: MaterializeFn,
    upload_artifact: UploadFn,
) -> Result<DesktopWorkerCycleResult, String>
where
    ClaimFn: Fn(DesktopWorkerClaimAndPrepareRequest) -> Result<DesktopWorkerClaimAndPrepareResponse, String>,
    ReportFn: Fn(DesktopWorkerEventRequest) -> Result<(), DesktopWorkerExecutionError>,
    MaterializeFn: Fn(&VideoAssemblyExecutionPlan) -> Result<Vec<DesktopWorkerLocalArtifact>, DesktopWorkerExecutionError>,
    UploadFn: Fn(DesktopWorkerArtifactUploadFileRequest) -> Result<DesktopWorkerArtifactUploadFileResponse, DesktopWorkerExecutionError>,
{
    let claimed = claim_and_prepare(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: build_exec_api(&request),
            worker_id: request.worker_id.clone(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: request.capability_hints.clone(),
            },
        },
        workspace_dir: request.workspace_dir.clone(),
        prefetched_inputs: request.prefetched_inputs.clone(),
    })?;

    let Some(job) = claimed.job else {
        return Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Idle,
            worker_id: request.worker_id,
            job_id: None,
            lease_owner_token: None,
            workspace_root: None,
            sequence_number: 0,
            uploaded_artifacts: Vec::new(),
            local_artifacts: Vec::new(),
            failure_code: None,
            failure_message: None,
        });
    };

    let Some(plan) = claimed.video_assembly_plan else {
        return Err("claimed worker job did not include a prepared video_assembly plan".into());
    };

    let job_id = job.id.clone();
    let lease_owner_token = job.lease_owner_token.clone();
    let mut sequence_number = 0_u32;

    let mut next_sequence = || {
        sequence_number += 1;
        sequence_number
    };

    let mut run = || -> Result<(Vec<DesktopWorkerLocalArtifact>, Vec<DesktopWorkerArtifactUploadFileResponse>), DesktopWorkerExecutionError> {
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.preparing".into(),
                payload_json: json!({
                    "workspaceRoot": plan.workspace_root,
                    "renderTaskCount": plan.render_tasks.len(),
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        for (stage, progress) in [
            ("resolve_inputs", 0.05_f32),
            ("stage_workspace", 0.1_f32),
            ("probe_media", 0.2_f32),
            ("build_edit_plan", 0.3_f32),
        ] {
            report_event_internal(
                &report_event,
                &request,
                &job_id,
                build_worker_job_progress_event(
                    &lease_owner_token,
                    next_sequence(),
                    stage,
                    Some(progress),
                    None,
                )
                .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
            )?;
        }

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.running".into(),
                payload_json: json!({
                    "renderTaskCount": plan.render_tasks.len(),
                    "thumbnailTaskCount": plan.thumbnail_tasks.len(),
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_worker_job_progress_event(
                &lease_owner_token,
                next_sequence(),
                "render_outputs",
                Some(0.5),
                Some(json!({ "renderTaskCount": plan.render_tasks.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let local_artifacts = materialize_artifacts(&plan)?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_worker_job_progress_event(
                &lease_owner_token,
                next_sequence(),
                "verify_outputs",
                Some(0.7),
                Some(json!({ "localArtifactCount": local_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.uploading".into(),
                payload_json: json!({ "artifactCount": local_artifacts.len() }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_worker_job_progress_event(
                &lease_owner_token,
                next_sequence(),
                "upload_artifacts",
                Some(0.82),
                Some(json!({ "artifactCount": local_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let uploaded_artifacts = upload_local_artifacts(
            &upload_artifact,
            &request,
            &job_id,
            &lease_owner_token,
            &local_artifacts,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_worker_job_progress_event(
                &lease_owner_token,
                next_sequence(),
                "publish_artifacts",
                Some(0.92),
                Some(json!({ "uploadedArtifactCount": uploaded_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.indexing".into(),
                payload_json: json!({ "uploadedArtifactCount": uploaded_artifacts.len() }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_worker_job_progress_event(
                &lease_owner_token,
                next_sequence(),
                "trigger_indexing",
                Some(0.97),
                Some(json!({ "uploadedArtifactCount": uploaded_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.completed".into(),
                payload_json: json!({
                    "artifactCount": uploaded_artifacts.len(),
                    "localArtifactCount": local_artifacts.len(),
                    "workspaceRoot": plan.workspace_root,
                    "outputDir": plan.output_dir,
                    "actualCreditsUsed": 0,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;

        Ok((local_artifacts, uploaded_artifacts))
    };

    match run() {
        Ok((local_artifacts, uploaded_artifacts)) => Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Completed,
            worker_id: request.worker_id,
            job_id: Some(job_id),
            lease_owner_token: Some(lease_owner_token),
            workspace_root: Some(plan.workspace_root),
            sequence_number,
            uploaded_artifacts,
            local_artifacts,
            failure_code: None,
            failure_message: None,
        }),
        Err(error) => {
            let failure_payload = build_worker_job_failure_event(
                &lease_owner_token,
                next_sequence(),
                error.failure_code,
                &error.message,
                matches!(
                    error.failure_code,
                    "transient_input_fetch_failed"
                        | "temporary_disk_pressure"
                        | "runtime_restart_required"
                        | "artifact_upload_failed"
                        | "index_enqueue_failed"
                ),
                None,
            )
            .map_err(|build_error| build_error.to_string())?;
            let _ = report_event_internal(&report_event, &request, &job_id, failure_payload);

            Ok(DesktopWorkerCycleResult {
                outcome: DesktopWorkerCycleOutcome::Failed,
                worker_id: request.worker_id,
                job_id: Some(job_id),
                lease_owner_token: Some(lease_owner_token),
                workspace_root: Some(plan.workspace_root),
                sequence_number,
                uploaded_artifacts: Vec::new(),
                local_artifacts: Vec::new(),
                failure_code: Some(error.failure_code.into()),
                failure_message: Some(error.message),
            })
        }
    }
}

fn execute_local_folder_ingest_cycle_with_ops<ClaimFn, ReportFn, MaterializeFn, UploadFn>(
    request: DesktopWorkerCycleRequest,
    claim_and_prepare: ClaimFn,
    report_event: ReportFn,
    materialize_artifacts: MaterializeFn,
    upload_artifact: UploadFn,
) -> Result<DesktopWorkerCycleResult, String>
where
    ClaimFn: Fn(DesktopWorkerClaimAndPrepareRequest) -> Result<DesktopWorkerClaimAndPrepareResponse, String>,
    ReportFn: Fn(DesktopWorkerEventRequest) -> Result<(), DesktopWorkerExecutionError>,
    MaterializeFn: Fn(&LocalFolderIngestExecutionPlan) -> Result<Vec<DesktopWorkerLocalArtifact>, DesktopWorkerExecutionError>,
    UploadFn: Fn(DesktopWorkerArtifactUploadFileRequest) -> Result<DesktopWorkerArtifactUploadFileResponse, DesktopWorkerExecutionError>,
{
    let claimed = claim_and_prepare(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: build_exec_api(&request),
            worker_id: request.worker_id.clone(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: request.capability_hints.clone(),
            },
        },
        workspace_dir: request.workspace_dir.clone(),
        prefetched_inputs: request.prefetched_inputs.clone(),
    })?;

    let Some(job) = claimed.job else {
        return Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Idle,
            worker_id: request.worker_id,
            job_id: None,
            lease_owner_token: None,
            workspace_root: None,
            sequence_number: 0,
            uploaded_artifacts: Vec::new(),
            local_artifacts: Vec::new(),
            failure_code: None,
            failure_message: None,
        });
    };

    let Some(plan) = claimed.local_folder_ingest_plan else {
        return Err("claimed worker job did not include a prepared local_folder_ingest plan".into());
    };

    let job_id = job.id.clone();
    let lease_owner_token = job.lease_owner_token.clone();
    let mut sequence_number = 0_u32;

    let mut next_sequence = || {
        sequence_number += 1;
        sequence_number
    };

    let mut run = || -> Result<(Vec<DesktopWorkerLocalArtifact>, Vec<DesktopWorkerArtifactUploadFileResponse>), DesktopWorkerExecutionError> {
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.preparing".into(),
                payload_json: json!({
                    "workspaceRoot": plan.workspace_root,
                    "rootCount": plan.managed_roots.len(),
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        for (stage, progress, extra) in [
            (
                "resolve_roots",
                0.08_f32,
                json!({ "rootCount": plan.managed_roots.len() }),
            ),
            (
                "index_files",
                0.35_f32,
                json!({ "maxDepth": plan.max_depth, "maxFiles": plan.max_files }),
            ),
            (
                "extract_previews",
                0.6_f32,
                json!({
                    "includePreviewText": plan.include_preview_text,
                    "previewFileLimit": plan.preview_file_limit,
                    "snippetQuery": plan.snippet_query,
                    "snippetFileLimit": plan.snippet_file_limit,
                }),
            ),
            (
                "write_manifest",
                0.76_f32,
                json!({
                    "publishManifestToLibrary": plan.publish_manifest_to_library,
                    "publishSummaryToLibrary": plan.publish_summary_to_library,
                }),
            ),
        ] {
            report_event_internal(
                &report_event,
                &request,
                &job_id,
                build_local_folder_ingest_progress_event(
                    &lease_owner_token,
                    next_sequence(),
                    stage,
                    Some(progress),
                    Some(extra),
                )
                .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
            )?;
        }

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.running".into(),
                payload_json: json!({
                    "rootCount": plan.managed_roots.len(),
                    "publishManifestToLibrary": plan.publish_manifest_to_library,
                    "publishSummaryToLibrary": plan.publish_summary_to_library,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;

        let local_artifacts = materialize_artifacts(&plan)?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.uploading".into(),
                payload_json: json!({ "artifactCount": local_artifacts.len() }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_local_folder_ingest_progress_event(
                &lease_owner_token,
                next_sequence(),
                "upload_artifacts",
                Some(0.88),
                Some(json!({ "artifactCount": local_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let uploaded_artifacts = upload_local_artifacts(
            &upload_artifact,
            &request,
            &job_id,
            &lease_owner_token,
            &local_artifacts,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_local_folder_ingest_progress_event(
                &lease_owner_token,
                next_sequence(),
                "publish_artifacts",
                Some(0.94),
                Some(json!({ "uploadedArtifactCount": uploaded_artifacts.len() })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.indexing".into(),
                payload_json: json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": plan.trigger_indexing,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_local_folder_ingest_progress_event(
                &lease_owner_token,
                next_sequence(),
                "trigger_indexing",
                Some(0.98),
                Some(json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": plan.trigger_indexing,
                })),
            )
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let indexed_file_count = local_artifacts
            .iter()
            .find(|artifact| artifact.artifact_type == "ingest_manifest")
            .and_then(|artifact| artifact.metadata_json.get("indexedFileCount"))
            .and_then(Value::as_u64)
            .unwrap_or(0);

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.completed".into(),
                payload_json: json!({
                    "artifactCount": uploaded_artifacts.len(),
                    "localArtifactCount": local_artifacts.len(),
                    "workspaceRoot": plan.workspace_root,
                    "outputDir": plan.output_dir,
                    "rootCount": plan.managed_roots.len(),
                    "indexedFileCount": indexed_file_count,
                    "actualCreditsUsed": 0,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;

        Ok((local_artifacts, uploaded_artifacts))
    };

    match run() {
        Ok((local_artifacts, uploaded_artifacts)) => Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Completed,
            worker_id: request.worker_id,
            job_id: Some(job_id),
            lease_owner_token: Some(lease_owner_token),
            workspace_root: Some(plan.workspace_root),
            sequence_number,
            uploaded_artifacts,
            local_artifacts,
            failure_code: None,
            failure_message: None,
        }),
        Err(error) => {
            let failure_payload = build_local_folder_ingest_failure_event(
                &lease_owner_token,
                next_sequence(),
                error.failure_code,
                &error.message,
                matches!(
                    error.failure_code,
                    "temporary_disk_pressure"
                        | "artifact_upload_failed"
                        | "index_enqueue_failed"
                ),
                None,
            )
            .map_err(|build_error| build_error.to_string())?;
            let _ = report_event_internal(&report_event, &request, &job_id, failure_payload);

            Ok(DesktopWorkerCycleResult {
                outcome: DesktopWorkerCycleOutcome::Failed,
                worker_id: request.worker_id,
                job_id: Some(job_id),
                lease_owner_token: Some(lease_owner_token),
                workspace_root: Some(plan.workspace_root),
                sequence_number,
                uploaded_artifacts: Vec::new(),
                local_artifacts: Vec::new(),
                failure_code: Some(error.failure_code.into()),
                failure_message: Some(error.message),
            })
        }
    }
}

fn execute_comfy_image_generation_cycle_with_ops<ClaimFn, ReportFn, ExecuteFn, UploadFn>(
    request: DesktopWorkerCycleRequest,
    claim_and_prepare: ClaimFn,
    report_event: ReportFn,
    execute_job: ExecuteFn,
    upload_artifact: UploadFn,
) -> Result<DesktopWorkerCycleResult, String>
where
    ClaimFn: Fn(DesktopWorkerClaimAndPrepareRequest) -> Result<DesktopWorkerClaimAndPrepareResponse, String>,
    ReportFn: Fn(DesktopWorkerEventRequest) -> Result<(), DesktopWorkerExecutionError>,
    ExecuteFn: Fn(&str, &str, &ComfyImageGenerationJobSpec) -> Result<ComfyExecutionResult, crate::desktop_worker_comfy::ComfyExecutionError>,
    UploadFn: Fn(DesktopWorkerArtifactUploadFileRequest) -> Result<DesktopWorkerArtifactUploadFileResponse, DesktopWorkerExecutionError>,
{
    let claimed = claim_and_prepare(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: build_exec_api(&request),
            worker_id: request.worker_id.clone(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: request.capability_hints.clone(),
            },
        },
        workspace_dir: request.workspace_dir.clone(),
        prefetched_inputs: request.prefetched_inputs.clone(),
    })?;

    let Some(job) = claimed.job else {
        return Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Idle,
            worker_id: request.worker_id,
            job_id: None,
            lease_owner_token: None,
            workspace_root: None,
            sequence_number: 0,
            uploaded_artifacts: Vec::new(),
            local_artifacts: Vec::new(),
            failure_code: None,
            failure_message: None,
        });
    };

    let job_id = job.id.clone();
    let lease_owner_token = job.lease_owner_token.clone();
    let mut sequence_number = 0_u32;
    let mut next_sequence = || {
        sequence_number += 1;
        sequence_number
    };

    let mut run = || -> Result<(String, Vec<DesktopWorkerLocalArtifact>, Vec<DesktopWorkerArtifactUploadFileResponse>), DesktopWorkerExecutionError> {
        let job_spec: ComfyImageGenerationJobSpec = serde_json::from_value(job.input_json.clone())
            .map_err(|error| DesktopWorkerExecutionError::new(
                "adapter_contract_violation",
                format!("failed to parse comfy_image_generation job payload: {error}"),
            ))?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.preparing".into(),
                payload_json: json!({
                    "serviceBaseUrl": job_spec.service.base_url,
                    "publishImagesToLibrary": job_spec.output_targets.publish_images_to_library,
                    "publishManifestToLibrary": job_spec.output_targets.publish_manifest_to_library,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "validate_service",
                Some(0.08),
                Some(json!({
                    "baseUrl": job_spec.service.base_url,
                    "localOnly": job_spec.service.local_only,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.running".into(),
                payload_json: json!({
                    "batchSize": job_spec.generation_spec.batch_size,
                    "gpuRequired": job_spec.generation_spec.gpu_required,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "submit_workflow",
                Some(0.22),
                Some(json!({
                    "batchSize": job_spec.generation_spec.batch_size,
                    "steps": job_spec.generation_spec.steps,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "poll_execution",
                Some(0.48),
                Some(json!({
                    "timeoutSeconds": job_spec.service.timeout_seconds,
                    "pollIntervalMs": job_spec.service.poll_interval_ms,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let execution_result = execute_job(&job_id, &request.workspace_dir, &job_spec).map_err(|error| {
            DesktopWorkerExecutionError::new(error.failure_code, error.message)
        })?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "collect_outputs",
                Some(0.72),
                Some(json!({
                    "promptId": execution_result.prompt_id,
                    "outputCount": execution_result.downloaded_outputs.len(),
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let local_artifacts = materialize_comfy_artifacts(
            &execution_result,
            "generated_image",
            "comfy_generation_manifest",
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.uploading".into(),
                payload_json: json!({ "artifactCount": local_artifacts.len() }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "upload_artifacts",
                Some(0.88),
                Some(json!({ "artifactCount": local_artifacts.len() })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let uploaded_artifacts = upload_local_artifacts(
            &upload_artifact,
            &request,
            &job_id,
            &lease_owner_token,
            &local_artifacts,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "publish_artifacts",
                Some(0.94),
                Some(json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "promptId": execution_result.prompt_id,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.indexing".into(),
                payload_json: json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": execution_result.trigger_indexing,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_image_generation_progress_event(
                &lease_owner_token,
                next_sequence(),
                "trigger_indexing",
                Some(0.98),
                Some(json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": execution_result.trigger_indexing,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.completed".into(),
                payload_json: json!({
                    "artifactCount": uploaded_artifacts.len(),
                    "localArtifactCount": local_artifacts.len(),
                    "workspaceRoot": execution_result.workspace_root,
                    "outputDir": execution_result.output_dir,
                    "promptId": execution_result.prompt_id,
                    "actualCreditsUsed": 0,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;

        Ok((execution_result.workspace_root, local_artifacts, uploaded_artifacts))
    };

    match run() {
        Ok((workspace_root, local_artifacts, uploaded_artifacts)) => Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Completed,
            worker_id: request.worker_id,
            job_id: Some(job_id),
            lease_owner_token: Some(lease_owner_token),
            workspace_root: Some(workspace_root),
            sequence_number,
            uploaded_artifacts,
            local_artifacts,
            failure_code: None,
            failure_message: None,
        }),
        Err(error) => {
            let failure_payload = build_comfy_image_generation_failure_event(
                &lease_owner_token,
                next_sequence(),
                error.failure_code,
                &error.message,
                matches!(
                    error.failure_code,
                    "service_unreachable" | "workflow_rejected" | "execution_timeout" | "artifact_upload_failed" | "index_enqueue_failed"
                ),
                None,
            ).map_err(|build_error| build_error.to_string())?;
            let _ = report_event_internal(&report_event, &request, &job_id, failure_payload);

            Ok(DesktopWorkerCycleResult {
                outcome: DesktopWorkerCycleOutcome::Failed,
                worker_id: request.worker_id,
                job_id: Some(job_id),
                lease_owner_token: Some(lease_owner_token),
                workspace_root: Some(request.workspace_dir.clone()),
                sequence_number,
                uploaded_artifacts: Vec::new(),
                local_artifacts: Vec::new(),
                failure_code: Some(error.failure_code.into()),
                failure_message: Some(error.message),
            })
        }
    }
}

fn execute_comfy_workflow_run_cycle_with_ops<ClaimFn, ReportFn, ExecuteFn, UploadFn>(
    request: DesktopWorkerCycleRequest,
    claim_and_prepare: ClaimFn,
    report_event: ReportFn,
    execute_job: ExecuteFn,
    upload_artifact: UploadFn,
) -> Result<DesktopWorkerCycleResult, String>
where
    ClaimFn: Fn(DesktopWorkerClaimAndPrepareRequest) -> Result<DesktopWorkerClaimAndPrepareResponse, String>,
    ReportFn: Fn(DesktopWorkerEventRequest) -> Result<(), DesktopWorkerExecutionError>,
    ExecuteFn: Fn(&str, &str, &ComfyWorkflowRunJobSpec) -> Result<ComfyExecutionResult, crate::desktop_worker_comfy::ComfyExecutionError>,
    UploadFn: Fn(DesktopWorkerArtifactUploadFileRequest) -> Result<DesktopWorkerArtifactUploadFileResponse, DesktopWorkerExecutionError>,
{
    let claimed = claim_and_prepare(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: build_exec_api(&request),
            worker_id: request.worker_id.clone(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: request.capability_hints.clone(),
            },
        },
        workspace_dir: request.workspace_dir.clone(),
        prefetched_inputs: request.prefetched_inputs.clone(),
    })?;

    let Some(job) = claimed.job else {
        return Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Idle,
            worker_id: request.worker_id,
            job_id: None,
            lease_owner_token: None,
            workspace_root: None,
            sequence_number: 0,
            uploaded_artifacts: Vec::new(),
            local_artifacts: Vec::new(),
            failure_code: None,
            failure_message: None,
        });
    };

    let job_id = job.id.clone();
    let lease_owner_token = job.lease_owner_token.clone();
    let mut sequence_number = 0_u32;
    let mut next_sequence = || {
        sequence_number += 1;
        sequence_number
    };

    let mut run = || -> Result<(String, Vec<DesktopWorkerLocalArtifact>, Vec<DesktopWorkerArtifactUploadFileResponse>), DesktopWorkerExecutionError> {
        let job_spec: ComfyWorkflowRunJobSpec = serde_json::from_value(job.input_json.clone())
            .map_err(|error| DesktopWorkerExecutionError::new(
                "adapter_contract_violation",
                format!("failed to parse comfy_workflow_run job payload: {error}"),
            ))?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.preparing".into(),
                payload_json: json!({
                    "serviceBaseUrl": job_spec.service.base_url,
                    "workflowLabel": job_spec.workflow_label,
                    "expectedOutputTypes": job_spec.execution_policy.expected_output_types,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "validate_service",
                Some(0.08),
                Some(json!({
                    "baseUrl": job_spec.service.base_url,
                    "localOnly": job_spec.service.local_only,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.running".into(),
                payload_json: json!({
                    "workflowLabel": job_spec.workflow_label,
                    "gpuRequired": job_spec.execution_policy.gpu_required,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "submit_workflow",
                Some(0.22),
                Some(json!({
                    "workflowLabel": job_spec.workflow_label,
                    "expectedOutputTypes": job_spec.execution_policy.expected_output_types,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "poll_execution",
                Some(0.48),
                Some(json!({
                    "timeoutSeconds": job_spec.service.timeout_seconds,
                    "pollIntervalMs": job_spec.service.poll_interval_ms,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let execution_result = execute_job(&job_id, &request.workspace_dir, &job_spec).map_err(|error| {
            DesktopWorkerExecutionError::new(error.failure_code, error.message)
        })?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "collect_outputs",
                Some(0.72),
                Some(json!({
                    "promptId": execution_result.prompt_id,
                    "outputCount": execution_result.downloaded_outputs.len(),
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let local_artifacts = materialize_comfy_artifacts(
            &execution_result,
            "workflow_output",
            "comfy_workflow_manifest",
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.uploading".into(),
                payload_json: json!({ "artifactCount": local_artifacts.len() }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "upload_artifacts",
                Some(0.88),
                Some(json!({ "artifactCount": local_artifacts.len() })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        let uploaded_artifacts = upload_local_artifacts(
            &upload_artifact,
            &request,
            &job_id,
            &lease_owner_token,
            &local_artifacts,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "publish_artifacts",
                Some(0.94),
                Some(json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "promptId": execution_result.prompt_id,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.indexing".into(),
                payload_json: json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": execution_result.trigger_indexing,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;
        report_event_internal(
            &report_event,
            &request,
            &job_id,
            build_comfy_workflow_run_progress_event(
                &lease_owner_token,
                next_sequence(),
                "trigger_indexing",
                Some(0.98),
                Some(json!({
                    "uploadedArtifactCount": uploaded_artifacts.len(),
                    "triggerIndexingRequested": execution_result.trigger_indexing,
                })),
            ).map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))?,
        )?;

        report_event_internal(
            &report_event,
            &request,
            &job_id,
            WorkerJobEventPayload {
                event_type: "job.completed".into(),
                payload_json: json!({
                    "artifactCount": uploaded_artifacts.len(),
                    "localArtifactCount": local_artifacts.len(),
                    "workspaceRoot": execution_result.workspace_root,
                    "outputDir": execution_result.output_dir,
                    "promptId": execution_result.prompt_id,
                    "actualCreditsUsed": 0,
                }),
                sequence_number: Some(next_sequence()),
                lease_owner_token: lease_owner_token.clone(),
            },
        )?;

        Ok((execution_result.workspace_root, local_artifacts, uploaded_artifacts))
    };

    match run() {
        Ok((workspace_root, local_artifacts, uploaded_artifacts)) => Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Completed,
            worker_id: request.worker_id,
            job_id: Some(job_id),
            lease_owner_token: Some(lease_owner_token),
            workspace_root: Some(workspace_root),
            sequence_number,
            uploaded_artifacts,
            local_artifacts,
            failure_code: None,
            failure_message: None,
        }),
        Err(error) => {
            let failure_payload = build_comfy_workflow_run_failure_event(
                &lease_owner_token,
                next_sequence(),
                error.failure_code,
                &error.message,
                matches!(
                    error.failure_code,
                    "service_unreachable" | "workflow_rejected" | "execution_timeout" | "artifact_upload_failed" | "index_enqueue_failed"
                ),
                None,
            ).map_err(|build_error| build_error.to_string())?;
            let _ = report_event_internal(&report_event, &request, &job_id, failure_payload);

            Ok(DesktopWorkerCycleResult {
                outcome: DesktopWorkerCycleOutcome::Failed,
                worker_id: request.worker_id,
                job_id: Some(job_id),
                lease_owner_token: Some(lease_owner_token),
                workspace_root: Some(request.workspace_dir.clone()),
                sequence_number,
                uploaded_artifacts: Vec::new(),
                local_artifacts: Vec::new(),
                failure_code: Some(error.failure_code.into()),
                failure_message: Some(error.message),
            })
        }
    }
}

pub fn execute_single_worker_cycle(
    request: DesktopWorkerCycleRequest,
) -> Result<DesktopWorkerCycleResult, String> {
    let claimed = claim_and_prepare_worker_job(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: build_exec_api(&request),
            worker_id: request.worker_id.clone(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: request.capability_hints.clone(),
            },
        },
        workspace_dir: request.workspace_dir.clone(),
        prefetched_inputs: request.prefetched_inputs.clone(),
    })?;

    if claimed.job.is_none() {
        return Ok(DesktopWorkerCycleResult {
            outcome: DesktopWorkerCycleOutcome::Idle,
            worker_id: request.worker_id,
            job_id: None,
            lease_owner_token: None,
            workspace_root: None,
            sequence_number: 0,
            uploaded_artifacts: vec![],
            local_artifacts: vec![],
            failure_code: None,
            failure_message: None,
        });
    }

    let job_type = claimed
        .job
        .as_ref()
        .map(|job| job.job_type.clone())
        .unwrap_or_default();
    let claim_once = move |_request: DesktopWorkerClaimAndPrepareRequest| Ok(claimed.clone());
    let report = |request| {
        report_worker_job_event(request)
            .map(|_| ())
            .map_err(|error| DesktopWorkerExecutionError::new("adapter_contract_violation", error))
    };
    let upload = |request| {
        upload_worker_artifact_file(request)
            .map_err(|error| DesktopWorkerExecutionError::new("artifact_upload_failed", error))
    };

    match job_type.as_str() {
        "video_assembly" => execute_video_assembly_cycle_with_ops(
            request,
            claim_once,
            report,
            materialize_video_assembly_artifacts,
            upload,
        ),
        "local_folder_ingest" => execute_local_folder_ingest_cycle_with_ops(
            request,
            claim_once,
            report,
            materialize_local_folder_ingest_artifacts,
            upload,
        ),
        "comfy_image_generation" => execute_comfy_image_generation_cycle_with_ops(
            request,
            claim_once,
            report,
            execute_comfy_image_generation,
            upload,
        ),
        "comfy_workflow_run" => execute_comfy_workflow_run_cycle_with_ops(
            request,
            claim_once,
            report,
            execute_comfy_workflow_run,
            upload,
        ),
        other => Err(format!("unsupported desktop worker job type: {other}")),
    }
}

fn execute_worker_loop_with_runner<RunFn>(
    request: DesktopWorkerLoopRequest,
    run_cycle: RunFn,
) -> Result<DesktopWorkerLoopResult, String>
where
    RunFn: Fn(DesktopWorkerCycleRequest) -> Result<DesktopWorkerCycleResult, String>,
{
    let max_cycles = request.max_cycles.max(1).min(1_000);
    let mut completed_cycles = 0_u32;
    let mut failed_cycles = 0_u32;
    let mut idle_cycles = 0_u32;
    let mut last_result = None;

    for iteration in 0..max_cycles {
        let result = run_cycle(request.cycle_request.clone())?;
        match result.outcome {
            DesktopWorkerCycleOutcome::Completed => completed_cycles += 1,
            DesktopWorkerCycleOutcome::Failed => failed_cycles += 1,
            DesktopWorkerCycleOutcome::Idle => idle_cycles += 1,
        }

        let should_break_on_idle =
            request.stop_on_idle && matches!(result.outcome, DesktopWorkerCycleOutcome::Idle);
        last_result = Some(result);

        if should_break_on_idle {
            return Ok(DesktopWorkerLoopResult {
                iterations: iteration + 1,
                completed_cycles,
                failed_cycles,
                idle_cycles,
                last_result,
            });
        }

        if iteration + 1 < max_cycles && request.idle_backoff_ms > 0 {
            thread::sleep(Duration::from_millis(request.idle_backoff_ms.min(30_000)));
        }
    }

    Ok(DesktopWorkerLoopResult {
        iterations: max_cycles,
        completed_cycles,
        failed_cycles,
        idle_cycles,
        last_result,
    })
}

pub fn execute_worker_loop(
    request: DesktopWorkerLoopRequest,
) -> Result<DesktopWorkerLoopResult, String> {
    execute_worker_loop_with_runner(request, execute_single_worker_cycle)
}

#[tauri::command]
pub async fn desktop_host_run_single_worker_cycle(
    request: DesktopWorkerCycleRequest,
) -> Result<DesktopWorkerCycleResult, String> {
    tokio::task::spawn_blocking(move || execute_single_worker_cycle(request))
        .await
        .map_err(|error| format!("desktop worker cycle task failed: {error}"))?
}

#[tauri::command]
pub async fn desktop_host_run_worker_loop(
    request: DesktopWorkerLoopRequest,
) -> Result<DesktopWorkerLoopResult, String> {
    tokio::task::spawn_blocking(move || execute_worker_loop(request))
        .await
        .map_err(|error| format!("desktop worker loop task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_file_index::{ManagedLocalRoot, WritebackMode};
    use crate::desktop_worker_runtime::VideoAssemblyAspectRatio;
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("smartspec-desktop-worker-executor-{name}-{suffix}"));
        path
    }

    fn build_plan(workspace_root: &Path) -> VideoAssemblyExecutionPlan {
        let output_dir = workspace_root.join("outputs");
        fs::create_dir_all(&output_dir).unwrap();
        let output_path = output_dir.join("landscape_16_9.mp4");
        let manifest_path = output_dir.join("landscape_16_9_manifest.json");

        VideoAssemblyExecutionPlan {
            job_id: "job-1".into(),
            workspace_root: workspace_root.to_string_lossy().to_string(),
            staging_dir: workspace_root.join("staging").to_string_lossy().to_string(),
            temp_dir: workspace_root.join("temp").to_string_lossy().to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
            staged_inputs: vec![],
            render_tasks: vec![crate::desktop_worker_runtime::VideoAssemblyRenderTask {
                label: "landscape".into(),
                aspect_ratio: VideoAssemblyAspectRatio::Ratio16x9,
                output_path: output_path.to_string_lossy().to_string(),
                metadata_manifest_path: manifest_path.to_string_lossy().to_string(),
                project_json: "{}".into(),
                publish_to_library: true,
                gpu_required: false,
            }],
            subtitle_task: None,
            thumbnail_tasks: vec![],
            progress_stages: vec![],
        }
    }

    fn build_cycle_request(workspace_root: &Path) -> DesktopWorkerCycleRequest {
        DesktopWorkerCycleRequest {
            control_plane_base_url: "http://127.0.0.1:9999".into(),
            worker_id: "worker-1".into(),
            execution_token: "exec-token".into(),
            upload_token: "upload-token".into(),
            workspace_dir: workspace_root.to_string_lossy().to_string(),
            request_timeout_ms: Some(5_000),
            capability_hints: vec!["video-edit".into()],
            prefetched_inputs: vec![],
        }
    }

    fn build_local_folder_cycle_request(workspace_root: &Path) -> DesktopWorkerCycleRequest {
        DesktopWorkerCycleRequest {
            control_plane_base_url: "http://127.0.0.1:9999".into(),
            worker_id: "worker-1".into(),
            execution_token: "exec-token".into(),
            upload_token: "upload-token".into(),
            workspace_dir: workspace_root.to_string_lossy().to_string(),
            request_timeout_ms: Some(5_000),
            capability_hints: vec!["file-access".into(), "doc-indexing".into()],
            prefetched_inputs: vec![],
        }
    }

    fn build_comfy_cycle_request(workspace_root: &Path) -> DesktopWorkerCycleRequest {
        DesktopWorkerCycleRequest {
            control_plane_base_url: "http://127.0.0.1:9999".into(),
            worker_id: "worker-1".into(),
            execution_token: "exec-token".into(),
            upload_token: "upload-token".into(),
            workspace_dir: workspace_root.to_string_lossy().to_string(),
            request_timeout_ms: Some(5_000),
            capability_hints: vec!["comfyui-image-generate".into()],
            prefetched_inputs: vec![],
        }
    }

    fn build_local_folder_ingest_plan(
        workspace_root: &Path,
        source_root: &Path,
    ) -> LocalFolderIngestExecutionPlan {
        let output_dir = workspace_root.join("outputs");
        fs::create_dir_all(&output_dir).unwrap();

        LocalFolderIngestExecutionPlan {
            job_id: "job-folder-1".into(),
            workspace_root: workspace_root.to_string_lossy().to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
            managed_roots: vec![ManagedLocalRoot {
                root_id: "quotes".into(),
                name: "Quotes".into(),
                absolute_path: source_root.to_string_lossy().to_string(),
                writeback_mode: WritebackMode::ManagedOutputOnly,
                indexing_enabled: true,
                preview_enabled: true,
                vector_index_enabled: false,
                denied_by_default: false,
                denial_reason: None,
            }],
            manifest_output_path: output_dir
                .join("local_folder_ingest_manifest.json")
                .to_string_lossy()
                .to_string(),
            summary_output_path: output_dir
                .join("local_folder_ingest_summary.txt")
                .to_string_lossy()
                .to_string(),
            max_depth: 4,
            max_files: 50,
            include_preview_text: true,
            preview_file_limit: 10,
            snippet_query: Some("launch".into()),
            snippet_file_limit: 5,
            publish_manifest_to_library: true,
            publish_summary_to_library: true,
            trigger_indexing: true,
            progress_stages: vec![],
        }
    }

    #[test]
    fn derives_postprocessed_output_path_from_render_target() {
        let burn_in_path = derived_postprocessed_output_path(
            "/tmp/smartspec/output/rendered.mp4",
            &VideoAssemblySubtitleMode::BurnIn,
        );
        let soft_mux_path = derived_postprocessed_output_path(
            "/tmp/smartspec/output/rendered.mp4",
            &VideoAssemblySubtitleMode::SoftMux,
        );
        assert_eq!(burn_in_path, "/tmp/smartspec/output/rendered_burnin.mp4");
        assert_eq!(soft_mux_path, "/tmp/smartspec/output/rendered_softmux.mp4");
    }

    #[test]
    fn rejects_existing_files_that_escape_workspace_root() {
        let workspace_root = temp_dir("workspace-root");
        let foreign_root = temp_dir("foreign-root");
        fs::create_dir_all(&workspace_root).unwrap();
        fs::create_dir_all(&foreign_root).unwrap();
        let foreign_file = foreign_root.join("artifact.txt");
        fs::write(&foreign_file, b"artifact").unwrap();

        let result = ensure_existing_file_within_workspace(
            &foreign_file.to_string_lossy(),
            &workspace_root.to_string_lossy(),
            "unauthorized_path",
        );

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().failure_code, "unauthorized_path");
    }

    #[test]
    fn executes_video_assembly_cycle_to_completion_with_ordered_events() {
        let workspace_root = temp_dir("success");
        fs::create_dir_all(&workspace_root).unwrap();
        let plan = build_plan(&workspace_root);
        let uploaded_path = workspace_root.join("rendered.mp4");
        fs::write(&uploaded_path, b"video-bytes").unwrap();

        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let events_clone = Arc::clone(&events);

        let result = execute_video_assembly_cycle_with_ops(
            build_cycle_request(&workspace_root),
            move |_| {
                Ok(DesktopWorkerClaimAndPrepareResponse {
                    claimed: true,
                    job: Some(crate::desktop_worker_control_plane::ClaimedWorkerJob {
                        id: "job-1".into(),
                        tenant_id: Some("tenant-1".into()),
                        team_id: None,
                        worker_id: Some("worker-1".into()),
                        runtime_type: "desktop_zeroclaw_managed".into(),
                        job_type: "video_assembly".into(),
                        status: Some("claimed".into()),
                        status_reason: None,
                        priority: Some(25),
                        resource_profile: Some("cpu_heavy".into()),
                        input_json: json!({}),
                        instructions_json: json!({}),
                        output_json: json!({}),
                        lease_owner_token: "lease-1".into(),
                        lease_expires_at: "2030-01-01T00:00:00.000Z".into(),
                    }),
                    video_assembly_plan: Some(plan.clone()),
                    local_folder_ingest_plan: None,
                })
            },
            move |request| {
                events_clone
                    .lock()
                    .unwrap()
                    .push(request.payload.event_type.clone());
                Ok(())
            },
            move |_| {
                Ok(vec![DesktopWorkerLocalArtifact {
                    artifact_type: "rendered_video".into(),
                    absolute_path: uploaded_path.to_string_lossy().to_string(),
                    file_name: Some("rendered.mp4".into()),
                    content_type: "video/mp4".into(),
                    metadata_json: json!({ "label": "landscape" }),
                }])
            },
            move |request| {
                Ok(DesktopWorkerArtifactUploadFileResponse {
                    file_name: request.file_name.unwrap_or_else(|| "rendered.mp4".into()),
                    absolute_path: request.file_path,
                    checksum_sha256: "a".repeat(64),
                    size_bytes: 11,
                    init_upload: crate::desktop_worker_control_plane::WorkerArtifactInitResponse {
                        key: "key-1".into(),
                        method: "presigned".into(),
                        storage_ref: "worker-artifacts/tenant/job-1/rendered.mp4".into(),
                        upload_url: Some("http://127.0.0.1:9999/upload".into()),
                    },
                    completed_artifact: crate::desktop_worker_control_plane::WorkerArtifactCompleteResponse {
                        created: true,
                        artifact: json!({ "id": "artifact-1" }),
                    },
                })
            },
        )
        .unwrap();

        let recorded_events = events.lock().unwrap().clone();
        assert_eq!(result.outcome, DesktopWorkerCycleOutcome::Completed);
        assert_eq!(result.job_id.as_deref(), Some("job-1"));
        assert_eq!(result.uploaded_artifacts.len(), 1);
        assert_eq!(
            recorded_events,
            vec![
                "job.preparing",
                "job.progress",
                "job.progress",
                "job.progress",
                "job.progress",
                "job.running",
                "job.progress",
                "job.progress",
                "job.uploading",
                "job.progress",
                "job.progress",
                "job.indexing",
                "job.progress",
                "job.completed",
            ]
        );
    }

    #[test]
    fn reports_failed_event_when_local_execution_fails() {
        let workspace_root = temp_dir("failure");
        fs::create_dir_all(&workspace_root).unwrap();
        let plan = build_plan(&workspace_root);

        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let events_clone = Arc::clone(&events);

        let result = execute_video_assembly_cycle_with_ops(
            build_cycle_request(&workspace_root),
            move |_| {
                Ok(DesktopWorkerClaimAndPrepareResponse {
                    claimed: true,
                    job: Some(crate::desktop_worker_control_plane::ClaimedWorkerJob {
                        id: "job-1".into(),
                        tenant_id: Some("tenant-1".into()),
                        team_id: None,
                        worker_id: Some("worker-1".into()),
                        runtime_type: "desktop_zeroclaw_managed".into(),
                        job_type: "video_assembly".into(),
                        status: Some("claimed".into()),
                        status_reason: None,
                        priority: Some(25),
                        resource_profile: Some("cpu_heavy".into()),
                        input_json: json!({}),
                        instructions_json: json!({}),
                        output_json: json!({}),
                        lease_owner_token: "lease-1".into(),
                        lease_expires_at: "2030-01-01T00:00:00.000Z".into(),
                    }),
                    video_assembly_plan: Some(plan.clone()),
                    local_folder_ingest_plan: None,
                })
            },
            move |request| {
                events_clone
                    .lock()
                    .unwrap()
                    .push(request.payload.event_type.clone());
                Ok(())
            },
            move |_| {
                Err(DesktopWorkerExecutionError::new(
                    "render_failed",
                    "ffmpeg exited with status 1",
                ))
            },
            move |_request| unreachable!("upload should not run when render fails"),
        )
        .unwrap();

        let recorded_events = events.lock().unwrap().clone();
        assert_eq!(result.outcome, DesktopWorkerCycleOutcome::Failed);
        assert_eq!(result.failure_code.as_deref(), Some("render_failed"));
        assert_eq!(recorded_events.last().map(String::as_str), Some("job.failed"));
    }

    #[test]
    fn materializes_local_folder_ingest_artifacts_without_absolute_paths() {
        let workspace_root = temp_dir("folder-manifest-workspace");
        let source_root = temp_dir("folder-manifest-source");
        fs::create_dir_all(&workspace_root).unwrap();
        fs::create_dir_all(&source_root).unwrap();
        fs::write(
            source_root.join("quote.txt"),
            "Launch fast.\nLaunch often.\nKeep the narrative clear.\n",
        )
        .unwrap();

        let plan = build_local_folder_ingest_plan(&workspace_root, &source_root);
        let artifacts = materialize_local_folder_ingest_artifacts(&plan).unwrap();
        let manifest_json: Value =
            serde_json::from_slice(&fs::read(&plan.manifest_output_path).unwrap()).unwrap();
        let summary_text = fs::read_to_string(&plan.summary_output_path).unwrap();
        let source_root_string = source_root.to_string_lossy().to_string();

        assert_eq!(artifacts.len(), 2);
        assert_eq!(manifest_json["files"][0]["relativePath"], "quote.txt");
        assert!(manifest_json["files"][0].get("absolutePath").is_none());
        assert!(manifest_json["files"][0]["sourcePathHash"].as_str().is_some());
        assert!(!fs::read_to_string(&plan.manifest_output_path)
            .unwrap()
            .contains(&source_root_string));
        assert!(!summary_text.contains(&source_root_string));
        assert!(summary_text.contains("Path Hash:"));
    }

    #[test]
    fn executes_local_folder_ingest_cycle_to_completion_with_ordered_events() {
        let workspace_root = temp_dir("folder-success-workspace");
        let source_root = temp_dir("folder-success-source");
        fs::create_dir_all(&workspace_root).unwrap();
        fs::create_dir_all(&source_root).unwrap();
        fs::write(
            source_root.join("quote.txt"),
            "Launch fast.\nLaunch often.\nKeep the narrative clear.\n",
        )
        .unwrap();
        fs::write(source_root.join("outline.md"), "# Launch plan\nNarrative beats\n").unwrap();

        let plan = build_local_folder_ingest_plan(&workspace_root, &source_root);
        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let events_clone = Arc::clone(&events);

        let result = execute_local_folder_ingest_cycle_with_ops(
            build_local_folder_cycle_request(&workspace_root),
            move |_| {
                Ok(DesktopWorkerClaimAndPrepareResponse {
                    claimed: true,
                    job: Some(crate::desktop_worker_control_plane::ClaimedWorkerJob {
                        id: "job-folder-1".into(),
                        tenant_id: Some("tenant-1".into()),
                        team_id: None,
                        worker_id: Some("worker-1".into()),
                        runtime_type: "desktop_zeroclaw_managed".into(),
                        job_type: "local_folder_ingest".into(),
                        status: Some("claimed".into()),
                        status_reason: None,
                        priority: Some(20),
                        resource_profile: Some("cpu_heavy".into()),
                        input_json: json!({}),
                        instructions_json: json!({}),
                        output_json: json!({}),
                        lease_owner_token: "lease-folder-1".into(),
                        lease_expires_at: "2030-01-01T00:00:00.000Z".into(),
                    }),
                    video_assembly_plan: None,
                    local_folder_ingest_plan: Some(plan.clone()),
                })
            },
            move |request| {
                events_clone
                    .lock()
                    .unwrap()
                    .push(request.payload.event_type.clone());
                Ok(())
            },
            materialize_local_folder_ingest_artifacts,
            move |request| {
                let file_name = request.file_name.unwrap_or_else(|| file_name_from_path(&request.file_path));
                Ok(DesktopWorkerArtifactUploadFileResponse {
                    file_name: file_name.clone(),
                    absolute_path: request.file_path,
                    checksum_sha256: "b".repeat(64),
                    size_bytes: 32,
                    init_upload: crate::desktop_worker_control_plane::WorkerArtifactInitResponse {
                        key: format!("key-{file_name}"),
                        method: "presigned".into(),
                        storage_ref: format!("worker-artifacts/tenant/job-folder-1/{file_name}"),
                        upload_url: Some("http://127.0.0.1:9999/upload".into()),
                    },
                    completed_artifact:
                        crate::desktop_worker_control_plane::WorkerArtifactCompleteResponse {
                            created: true,
                            artifact: json!({ "id": format!("artifact-{file_name}") }),
                        },
                })
            },
        )
        .unwrap();

        let recorded_events = events.lock().unwrap().clone();
        assert_eq!(result.outcome, DesktopWorkerCycleOutcome::Completed);
        assert_eq!(result.job_id.as_deref(), Some("job-folder-1"));
        assert_eq!(result.local_artifacts.len(), 2);
        assert_eq!(result.uploaded_artifacts.len(), 2);
        assert_eq!(
            recorded_events,
            vec![
                "job.preparing",
                "job.progress",
                "job.progress",
                "job.progress",
                "job.progress",
                "job.running",
                "job.uploading",
                "job.progress",
                "job.progress",
                "job.indexing",
                "job.progress",
                "job.completed",
            ]
        );
    }

    #[test]
    fn executes_comfy_image_generation_cycle_to_completion_with_ordered_events() {
        let workspace_root = temp_dir("comfy-image-success");
        fs::create_dir_all(&workspace_root).unwrap();
        let comfy_output_path = workspace_root.join("job-comfy-image-1").join("outputs").join("comfy").join("rendered.png");
        let comfy_manifest_path = workspace_root.join("job-comfy-image-1").join("outputs").join("comfy").join("comfy_execution_manifest.json");
        fs::create_dir_all(comfy_output_path.parent().unwrap()).unwrap();
        fs::write(&comfy_output_path, b"png-bytes").unwrap();
        fs::write(&comfy_manifest_path, b"{}").unwrap();

        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let events_clone = Arc::clone(&events);
        let workspace_root_string = workspace_root.to_string_lossy().to_string();

        let result = execute_comfy_image_generation_cycle_with_ops(
            build_comfy_cycle_request(&workspace_root),
            move |_| {
                Ok(DesktopWorkerClaimAndPrepareResponse {
                    claimed: true,
                    job: Some(crate::desktop_worker_control_plane::ClaimedWorkerJob {
                        id: "job-comfy-image-1".into(),
                        tenant_id: Some("tenant-1".into()),
                        team_id: None,
                        worker_id: Some("worker-1".into()),
                        runtime_type: "desktop_zeroclaw_managed".into(),
                        job_type: "comfy_image_generation".into(),
                        status: Some("claimed".into()),
                        status_reason: None,
                        priority: Some(15),
                        resource_profile: Some("gpu_required".into()),
                        input_json: json!({
                            "service": {
                                "baseUrl": "http://127.0.0.1:8188",
                                "submitPath": "/prompt",
                                "historyPathTemplate": "/history/{promptId}",
                                "viewPath": "/view",
                                "pollIntervalMs": 50,
                                "timeoutSeconds": 30,
                                "localOnly": true
                            },
                            "workflowJson": { "9": { "class_type": "SaveImage" } },
                            "generationSpec": {
                                "promptSummary": "portrait",
                                "width": 1024,
                                "height": 1024,
                                "batchSize": 1,
                                "steps": 20,
                                "cfgScale": 7.0,
                                "samplerName": "euler",
                                "gpuRequired": true
                            },
                            "outputTargets": {
                                "publishImagesToLibrary": true,
                                "publishManifestToLibrary": true,
                                "triggerIndexing": true,
                                "maxImages": 4
                            }
                        }),
                        instructions_json: json!({}),
                        output_json: json!({}),
                        lease_owner_token: "lease-comfy-image-1".into(),
                        lease_expires_at: "2030-01-01T00:00:00.000Z".into(),
                    }),
                    video_assembly_plan: None,
                    local_folder_ingest_plan: None,
                })
            },
            move |request| {
                events_clone
                    .lock()
                    .unwrap()
                    .push(request.payload.event_type.clone());
                Ok(())
            },
            move |_job_id, _workspace_dir, _job| {
                Ok(ComfyExecutionResult {
                    workspace_root: workspace_root_string.clone(),
                    output_dir: comfy_output_path
                        .parent()
                        .unwrap()
                        .to_string_lossy()
                        .to_string(),
                    manifest_path: comfy_manifest_path.to_string_lossy().to_string(),
                    prompt_id: "prompt-1".into(),
                    publish_outputs_to_library: true,
                    publish_manifest_to_library: true,
                    trigger_indexing: true,
                    downloaded_outputs: vec![crate::desktop_worker_comfy::ComfyDownloadedOutput {
                        output_kind: "images".into(),
                        node_id: "9".into(),
                        file_name: "rendered.png".into(),
                        absolute_path: comfy_output_path.to_string_lossy().to_string(),
                        relative_path: "rendered.png".into(),
                        content_type: "image/png".into(),
                    }],
                })
            },
            move |request| {
                let file_name =
                    request.file_name.unwrap_or_else(|| file_name_from_path(&request.file_path));
                Ok(DesktopWorkerArtifactUploadFileResponse {
                    file_name: file_name.clone(),
                    absolute_path: request.file_path,
                    checksum_sha256: "c".repeat(64),
                    size_bytes: 16,
                    init_upload: crate::desktop_worker_control_plane::WorkerArtifactInitResponse {
                        key: format!("key-{file_name}"),
                        method: "presigned".into(),
                        storage_ref: format!(
                            "worker-artifacts/tenant/job-comfy-image-1/{file_name}"
                        ),
                        upload_url: Some("http://127.0.0.1:9999/upload".into()),
                    },
                    completed_artifact:
                        crate::desktop_worker_control_plane::WorkerArtifactCompleteResponse {
                            created: true,
                            artifact: json!({ "id": format!("artifact-{file_name}") }),
                        },
                })
            },
        )
        .unwrap();

        let recorded_events = events.lock().unwrap().clone();
        assert_eq!(result.outcome, DesktopWorkerCycleOutcome::Completed);
        assert_eq!(result.job_id.as_deref(), Some("job-comfy-image-1"));
        assert_eq!(result.local_artifacts.len(), 2);
        assert_eq!(result.uploaded_artifacts.len(), 2);
        assert_eq!(
            recorded_events,
            vec![
                "job.preparing",
                "job.progress",
                "job.running",
                "job.progress",
                "job.progress",
                "job.progress",
                "job.uploading",
                "job.progress",
                "job.progress",
                "job.indexing",
                "job.progress",
                "job.completed",
            ]
        );
    }

    #[test]
    fn reports_failed_event_when_comfy_workflow_run_fails() {
        let workspace_root = temp_dir("comfy-workflow-failure");
        fs::create_dir_all(&workspace_root).unwrap();
        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let events_clone = Arc::clone(&events);

        let result = execute_comfy_workflow_run_cycle_with_ops(
            build_comfy_cycle_request(&workspace_root),
            move |_| {
                Ok(DesktopWorkerClaimAndPrepareResponse {
                    claimed: true,
                    job: Some(crate::desktop_worker_control_plane::ClaimedWorkerJob {
                        id: "job-comfy-workflow-1".into(),
                        tenant_id: Some("tenant-1".into()),
                        team_id: None,
                        worker_id: Some("worker-1".into()),
                        runtime_type: "desktop_zeroclaw_managed".into(),
                        job_type: "comfy_workflow_run".into(),
                        status: Some("claimed".into()),
                        status_reason: None,
                        priority: Some(10),
                        resource_profile: Some("gpu_required".into()),
                        input_json: json!({
                            "service": {
                                "baseUrl": "http://127.0.0.1:8188",
                                "localOnly": true
                            },
                            "workflowJson": { "17": { "class_type": "TextOutput" } },
                            "workflowLabel": "Narrative Workflow",
                            "executionPolicy": {
                                "expectedOutputTypes": ["text"],
                                "gpuRequired": false,
                                "failOnMissingOutputs": true
                            },
                            "outputTargets": {
                                "publishOutputFilesToLibrary": true,
                                "publishManifestToLibrary": true,
                                "triggerIndexing": true,
                                "maxOutputFiles": 4
                            }
                        }),
                        instructions_json: json!({}),
                        output_json: json!({}),
                        lease_owner_token: "lease-comfy-workflow-1".into(),
                        lease_expires_at: "2030-01-01T00:00:00.000Z".into(),
                    }),
                    video_assembly_plan: None,
                    local_folder_ingest_plan: None,
                })
            },
            move |request| {
                events_clone
                    .lock()
                    .unwrap()
                    .push(request.payload.event_type.clone());
                Ok(())
            },
            move |_job_id, _workspace_dir, _job| {
                Err(crate::desktop_worker_comfy::ComfyExecutionError {
                    failure_code: "workflow_rejected",
                    message: "ComfyUI rejected the workflow".into(),
                })
            },
            move |_request| unreachable!("upload should not run when comfy workflow execution fails"),
        )
        .unwrap();

        let recorded_events = events.lock().unwrap().clone();
        assert_eq!(result.outcome, DesktopWorkerCycleOutcome::Failed);
        assert_eq!(result.failure_code.as_deref(), Some("workflow_rejected"));
        assert_eq!(recorded_events.last().map(String::as_str), Some("job.failed"));
    }

    #[test]
    fn worker_loop_stops_on_idle_when_requested() {
        let workspace_root = temp_dir("loop");
        fs::create_dir_all(&workspace_root).unwrap();

        let loop_result = execute_worker_loop_with_runner(
            DesktopWorkerLoopRequest {
                cycle_request: build_cycle_request(&workspace_root),
                max_cycles: 5,
                stop_on_idle: true,
                idle_backoff_ms: 0,
            },
            |_request| {
                Ok(DesktopWorkerCycleResult {
                    outcome: DesktopWorkerCycleOutcome::Idle,
                    worker_id: "worker-1".into(),
                    job_id: None,
                    lease_owner_token: None,
                    workspace_root: None,
                    sequence_number: 0,
                    uploaded_artifacts: vec![],
                    local_artifacts: vec![],
                    failure_code: None,
                    failure_message: None,
                })
            },
        )
        .unwrap();

        assert_eq!(loop_result.iterations, 1);
        assert_eq!(loop_result.idle_cycles, 1);
        assert_eq!(loop_result.completed_cycles, 0);
        assert_eq!(
            loop_result.last_result.as_ref().map(|value| &value.outcome),
            Some(&DesktopWorkerCycleOutcome::Idle)
        );
    }
}
