use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::video_editor::render::{
    Asset, AudioMixing, Clip, DuckingConfig, ExportSettings, ProjectSettings, Timeline, Track,
    VideoEditorProject,
};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VideoAssemblyInputSourceKind {
    LibraryAsset,
    AuthorizedLocalPath,
    StagedUpload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VideoAssemblySubtitleMode {
    BurnIn,
    SoftMux,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum VideoAssemblyAspectRatio {
    #[serde(rename = "16:9")]
    Ratio16x9,
    #[serde(rename = "9:16")]
    Ratio9x16,
    #[serde(rename = "1:1")]
    Ratio1x1,
    #[serde(rename = "4:5")]
    Ratio4x5,
}

impl VideoAssemblyAspectRatio {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Ratio16x9 => "16:9",
            Self::Ratio9x16 => "9:16",
            Self::Ratio1x1 => "1:1",
            Self::Ratio4x5 => "4:5",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyInputRef {
    pub source_kind: VideoAssemblyInputSourceKind,
    pub ref_id: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyTrim {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyClipSpec {
    pub source_ref: String,
    pub trim: VideoAssemblyTrim,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyEditPlan {
    pub clips: Vec<VideoAssemblyClipSpec>,
    pub apply_watermark: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblySubtitlePlan {
    pub source_priority: String,
    pub mode: VideoAssemblySubtitleMode,
    pub transcript_ref: Option<String>,
    pub subtitle_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyRenderProfile {
    pub aspect_ratios: Vec<VideoAssemblyAspectRatio>,
    pub codec_preset: String,
    pub quality_preset: String,
    pub gpu_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyWorkspacePolicy {
    pub mode: String,
    pub allowed_source_roots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyOutputAssetTarget {
    pub label: String,
    pub aspect_ratio: VideoAssemblyAspectRatio,
    pub publish_to_library: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyOutputTargets {
    pub rendered_assets: Vec<VideoAssemblyOutputAssetTarget>,
    pub subtitles_optional: bool,
    pub thumbnails_optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyJobSpec {
    pub input_refs: Vec<VideoAssemblyInputRef>,
    pub edit_plan: VideoAssemblyEditPlan,
    pub subtitle_plan: VideoAssemblySubtitlePlan,
    pub render_profile: VideoAssemblyRenderProfile,
    pub workspace_policy: VideoAssemblyWorkspacePolicy,
    pub output_targets: VideoAssemblyOutputTargets,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyPrefetchedInput {
    pub ref_id: String,
    pub absolute_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyPlanRequest {
    pub job_id: String,
    pub workspace_dir: String,
    pub job: VideoAssemblyJobSpec,
    #[serde(default)]
    pub prefetched_inputs: Vec<VideoAssemblyPrefetchedInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyStagedInput {
    pub source_ref: String,
    pub source_kind: String,
    pub original_path: String,
    pub staged_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblySubtitleTask {
    pub mode: VideoAssemblySubtitleMode,
    pub staged_subtitle_path: Option<String>,
    pub staged_transcript_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyThumbnailTask {
    pub label: String,
    pub source_output_path: String,
    pub thumbnail_output_path: String,
    pub time_seconds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyRenderTask {
    pub label: String,
    pub aspect_ratio: VideoAssemblyAspectRatio,
    pub output_path: String,
    pub metadata_manifest_path: String,
    pub project_json: String,
    pub publish_to_library: bool,
    pub gpu_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoAssemblyExecutionPlan {
    pub job_id: String,
    pub workspace_root: String,
    pub staging_dir: String,
    pub temp_dir: String,
    pub output_dir: String,
    pub staged_inputs: Vec<VideoAssemblyStagedInput>,
    pub render_tasks: Vec<VideoAssemblyRenderTask>,
    pub subtitle_task: Option<VideoAssemblySubtitleTask>,
    pub thumbnail_tasks: Vec<VideoAssemblyThumbnailTask>,
    pub progress_stages: Vec<String>,
}

fn require_absolute_existing_file(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err(format!("path must be absolute: {raw_path}"));
    }
    if !path.exists() || !path.is_file() {
        return Err(format!("path does not exist or is not a file: {raw_path}"));
    }
    path.canonicalize().map_err(|error| error.to_string())
}

fn canonicalize_existing_dir(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err(format!("directory must be absolute: {raw_path}"));
    }
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.canonicalize().map_err(|error| error.to_string())
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

fn is_within_allowed_roots(candidate: &Path, allowed_roots: &[String]) -> Result<bool, String> {
    for root in allowed_roots {
        let canonical_root = require_absolute_existing_file_or_dir(root)?;
        if candidate == canonical_root || candidate.starts_with(&canonical_root) {
            return Ok(true);
        }
    }

    Ok(false)
}

fn require_absolute_existing_file_or_dir(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err(format!("path must be absolute: {raw_path}"));
    }
    if !path.exists() {
        return Err(format!("path does not exist: {raw_path}"));
    }
    path.canonicalize().map_err(|error| error.to_string())
}

fn stage_file(
    source_path: &Path,
    staging_dir: &Path,
    unique_prefix: &str,
) -> Result<String, String> {
    fs::create_dir_all(staging_dir).map_err(|error| error.to_string())?;
    let file_name = source_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "input.bin".into());
    let staged_name = format!("{}_{}", sanitize_name(unique_prefix), sanitize_name(&file_name));
    let staged_path = staging_dir.join(staged_name);
    fs::copy(source_path, &staged_path).map_err(|error| error.to_string())?;
    Ok(staged_path.to_string_lossy().to_string())
}

fn stage_local_input(
    source_path: &str,
    allowed_roots: &[String],
    staging_dir: &Path,
    unique_prefix: &str,
) -> Result<String, String> {
    let canonical_source = require_absolute_existing_file(source_path)?;
    if !is_within_allowed_roots(&canonical_source, allowed_roots)? {
        return Err(format!(
            "path is outside the approved workspace roots: {}",
            canonical_source.to_string_lossy()
        ));
    }
    stage_file(&canonical_source, staging_dir, unique_prefix)
}

fn stage_prefetched_input(
    source_path: &str,
    staging_dir: &Path,
    unique_prefix: &str,
) -> Result<String, String> {
    let canonical_source = require_absolute_existing_file(source_path)?;
    stage_file(&canonical_source, staging_dir, unique_prefix)
}

fn resolve_dimensions(aspect_ratio: &VideoAssemblyAspectRatio) -> (u32, u32) {
    match aspect_ratio {
        VideoAssemblyAspectRatio::Ratio16x9 => (1920, 1080),
        VideoAssemblyAspectRatio::Ratio9x16 => (1080, 1920),
        VideoAssemblyAspectRatio::Ratio1x1 => (1080, 1080),
        VideoAssemblyAspectRatio::Ratio4x5 => (1080, 1350),
    }
}

fn resolve_video_codec(codec_preset: &str, gpu_required: bool) -> String {
    let lower = codec_preset.to_ascii_lowercase();
    if lower.contains("h265") || lower.contains("hevc") {
        if gpu_required {
            "hevc_nvenc".into()
        } else {
            "libx265".into()
        }
    } else if gpu_required {
        "h264_nvenc".into()
    } else {
        "libx264".into()
    }
}

fn resolve_bitrate_kbps(quality_preset: &str, aspect_ratio: &VideoAssemblyAspectRatio) -> u32 {
    let base = match quality_preset.to_ascii_lowercase().as_str() {
        "low" | "draft" => 2500,
        "medium" | "standard" => 5000,
        "high" => 8000,
        "source" | "master" => 12000,
        _ => 5000,
    };

    match aspect_ratio {
        VideoAssemblyAspectRatio::Ratio16x9 => base,
        VideoAssemblyAspectRatio::Ratio9x16 => base,
        VideoAssemblyAspectRatio::Ratio1x1 => base.saturating_sub(500),
        VideoAssemblyAspectRatio::Ratio4x5 => base.saturating_sub(250),
    }
}

fn default_audio_mixing() -> AudioMixing {
    AudioMixing {
        ducking: DuckingConfig {
            enabled: false,
            voiceover_track_id: "voiceover".into(),
            threshold: -18.0,
            ratio: 4.0,
            attack: 20.0,
            release: 180.0,
            makeup_gain: 0.0,
            background_gain: 0.5,
        },
        master_volume: 1.0,
    }
}

fn build_render_project(
    job_id: &str,
    output_target: &VideoAssemblyOutputAssetTarget,
    job: &VideoAssemblyJobSpec,
    staged_sources: &HashMap<String, String>,
) -> Result<VideoEditorProject, String> {
    let (width, height) = resolve_dimensions(&output_target.aspect_ratio);
    let mut assets = HashMap::new();
    let mut clips = Vec::new();
    let mut start_time_seconds = 0.0_f64;

    for (index, clip_spec) in job.edit_plan.clips.iter().enumerate() {
        let staged_path = staged_sources
            .get(&clip_spec.source_ref)
            .ok_or_else(|| format!("missing staged source for {}", clip_spec.source_ref))?;

        let asset_id = format!("asset_{}", index + 1);
        assets.insert(
            asset_id.clone(),
            Asset {
                id: asset_id.clone(),
                path: staged_path.clone(),
                asset_type: "video".into(),
            },
        );

        let trim_start = clip_spec.trim.start_ms as f64 / 1000.0;
        let trim_end = clip_spec.trim.end_ms as f64 / 1000.0;
        if trim_end <= trim_start {
            return Err(format!(
                "clip {} trim end must be greater than trim start",
                clip_spec.source_ref
            ));
        }
        let duration = trim_end - trim_start;

        clips.push(Clip {
            asset_id,
            start_time: start_time_seconds,
            duration,
            trim_in: trim_start,
            trim_out: trim_end,
            volume: 1.0,
            speed: 1.0,
        });
        start_time_seconds += duration;
    }

    Ok(VideoEditorProject {
        settings: ProjectSettings {
            width,
            height,
            fps: 30,
            sample_rate: 48_000,
        },
        timeline: Timeline {
            tracks: vec![Track {
                id: format!("{job_id}_video_track"),
                track_type: "video".into(),
                clips,
            }],
        },
        assets,
        audio_mixing: default_audio_mixing(),
        export: ExportSettings {
            codec: resolve_video_codec(&job.render_profile.codec_preset, job.render_profile.gpu_required),
            bitrate: resolve_bitrate_kbps(&job.render_profile.quality_preset, &output_target.aspect_ratio),
            audio_codec: "aac".into(),
            audio_bitrate: 192,
        },
    })
}

fn stage_optional_supporting_ref(
    source_ref: &Option<String>,
    job: &VideoAssemblyJobSpec,
    prefetched_inputs: &HashMap<String, String>,
    staging_dir: &Path,
    label: &str,
) -> Result<Option<String>, String> {
    let Some(reference) = source_ref.as_ref() else {
        return Ok(None);
    };

    if let Some(prefetched) = prefetched_inputs.get(reference) {
        return stage_prefetched_input(prefetched, staging_dir, label).map(Some);
    }

    if PathBuf::from(reference).is_absolute() {
        return stage_local_input(reference, &job.workspace_policy.allowed_source_roots, staging_dir, label)
            .map(Some);
    }

    Ok(None)
}

pub fn prepare_video_assembly_execution(
    request: VideoAssemblyPlanRequest,
) -> Result<VideoAssemblyExecutionPlan, String> {
    if request.job_id.trim().is_empty() {
        return Err("job_id is required".into());
    }
    if request.job.edit_plan.apply_watermark {
        return Err("video_assembly watermark application is not supported by the desktop render bridge yet".into());
    }
    if request.job.output_targets.rendered_assets.is_empty() {
        return Err("video_assembly requires at least one rendered asset target".into());
    }

    let workspace_dir = canonicalize_existing_dir(&request.workspace_dir)?;
    let job_workspace = workspace_dir.join(sanitize_name(&request.job_id));
    let staging_dir = job_workspace.join("staging");
    let temp_dir = job_workspace.join("temp");
    let output_dir = job_workspace.join("outputs");
    fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;

    let prefetched_inputs = request
        .prefetched_inputs
        .iter()
        .map(|entry| (entry.ref_id.clone(), entry.absolute_path.clone()))
        .collect::<HashMap<_, _>>();

    let mut staged_inputs = Vec::new();
    let mut staged_source_map = HashMap::new();

    for (index, input_ref) in request.job.input_refs.iter().enumerate() {
        let staged_path = match input_ref.source_kind {
            VideoAssemblyInputSourceKind::AuthorizedLocalPath => {
                let source_path = input_ref
                    .path
                    .as_ref()
                    .ok_or_else(|| "authorized_local_path refs require path".to_string())?;
                stage_local_input(
                    source_path,
                    &request.job.workspace_policy.allowed_source_roots,
                    &staging_dir,
                    &format!("input_{}", index + 1),
                )?
            }
            VideoAssemblyInputSourceKind::LibraryAsset => {
                let ref_id = input_ref
                    .ref_id
                    .as_ref()
                    .ok_or_else(|| "library_asset refs require refId".to_string())?;
                let prefetched = prefetched_inputs
                    .get(ref_id)
                    .ok_or_else(|| format!("missing prefetched input for {ref_id}"))?;
                stage_prefetched_input(prefetched, &staging_dir, &format!("library_{}", index + 1))?
            }
            VideoAssemblyInputSourceKind::StagedUpload => {
                if let Some(path) = input_ref.path.as_ref() {
                    stage_prefetched_input(path, &staging_dir, &format!("upload_{}", index + 1))?
                } else {
                    let ref_id = input_ref
                        .ref_id
                        .as_ref()
                        .ok_or_else(|| "staged_upload refs require path or refId".to_string())?;
                    let prefetched = prefetched_inputs
                        .get(ref_id)
                        .ok_or_else(|| format!("missing prefetched staged upload for {ref_id}"))?;
                    stage_prefetched_input(prefetched, &staging_dir, &format!("upload_{}", index + 1))?
                }
            }
        };

        if let Some(ref_id) = input_ref.ref_id.as_ref() {
            staged_source_map.insert(ref_id.clone(), staged_path.clone());
        }
        if let Some(path) = input_ref.path.as_ref() {
            staged_source_map.insert(path.clone(), staged_path.clone());
        }

        staged_inputs.push(VideoAssemblyStagedInput {
            source_ref: input_ref
                .ref_id
                .clone()
                .or_else(|| input_ref.path.clone())
                .unwrap_or_else(|| format!("input_{}", index + 1)),
            source_kind: match input_ref.source_kind {
                VideoAssemblyInputSourceKind::LibraryAsset => "library_asset".into(),
                VideoAssemblyInputSourceKind::AuthorizedLocalPath => "authorized_local_path".into(),
                VideoAssemblyInputSourceKind::StagedUpload => "staged_upload".into(),
            },
            original_path: input_ref
                .path
                .clone()
                .or_else(|| input_ref.ref_id.clone())
                .unwrap_or_default(),
            staged_path,
        });
    }

    let staged_subtitle_path = stage_optional_supporting_ref(
        &request.job.subtitle_plan.subtitle_ref,
        &request.job,
        &prefetched_inputs,
        &staging_dir,
        "subtitle",
    )?;
    let staged_transcript_path = stage_optional_supporting_ref(
        &request.job.subtitle_plan.transcript_ref,
        &request.job,
        &prefetched_inputs,
        &staging_dir,
        "transcript",
    )?;

    let mut render_tasks = Vec::new();
    let mut thumbnail_tasks = Vec::new();

    for output_target in &request.job.output_targets.rendered_assets {
        if !request
            .job
            .render_profile
            .aspect_ratios
            .iter()
            .any(|ratio| ratio == &output_target.aspect_ratio)
        {
            return Err(format!(
                "output target {} uses aspect ratio {} that is not declared in renderProfile",
                output_target.label,
                output_target.aspect_ratio.as_str()
            ));
        }

        let output_path = output_dir.join(format!(
            "{}_{}.mp4",
            sanitize_name(&output_target.label),
            sanitize_name(output_target.aspect_ratio.as_str())
        ));
        let metadata_manifest_path = output_dir.join(format!(
            "{}_{}_manifest.json",
            sanitize_name(&output_target.label),
            sanitize_name(output_target.aspect_ratio.as_str())
        ));

        let project = build_render_project(
            &request.job_id,
            output_target,
            &request.job,
            &staged_source_map,
        )?;
        let project_json = serde_json::to_string(&project).map_err(|error| error.to_string())?;

        let output_path_string = output_path.to_string_lossy().to_string();
        render_tasks.push(VideoAssemblyRenderTask {
            label: output_target.label.clone(),
            aspect_ratio: output_target.aspect_ratio.clone(),
            output_path: output_path_string.clone(),
            metadata_manifest_path: metadata_manifest_path.to_string_lossy().to_string(),
            project_json,
            publish_to_library: output_target.publish_to_library,
            gpu_required: request.job.render_profile.gpu_required,
        });

        if request.job.output_targets.thumbnails_optional {
            thumbnail_tasks.push(VideoAssemblyThumbnailTask {
                label: output_target.label.clone(),
                source_output_path: output_path_string,
                thumbnail_output_path: output_dir
                    .join(format!(
                        "{}_{}_thumb.jpg",
                        sanitize_name(&output_target.label),
                        sanitize_name(output_target.aspect_ratio.as_str())
                    ))
                    .to_string_lossy()
                    .to_string(),
                time_seconds: 1,
            });
        }
    }

    let subtitle_task = if request.job.subtitle_plan.mode == VideoAssemblySubtitleMode::None {
        None
    } else {
        Some(VideoAssemblySubtitleTask {
            mode: request.job.subtitle_plan.mode.clone(),
            staged_subtitle_path,
            staged_transcript_path,
        })
    };

    Ok(VideoAssemblyExecutionPlan {
        job_id: request.job_id,
        workspace_root: job_workspace.to_string_lossy().to_string(),
        staging_dir: staging_dir.to_string_lossy().to_string(),
        temp_dir: temp_dir.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        staged_inputs,
        render_tasks,
        subtitle_task,
        thumbnail_tasks,
        progress_stages: VIDEO_ASSEMBLY_PROGRESS_STAGES
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
    })
}

#[tauri::command]
pub async fn desktop_host_prepare_video_assembly(
    request: VideoAssemblyPlanRequest,
) -> Result<VideoAssemblyExecutionPlan, String> {
    prepare_video_assembly_execution(request)
}
