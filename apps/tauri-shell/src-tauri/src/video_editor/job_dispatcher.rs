use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ========================================
// Media Job Spec types (mirrors TypeScript)
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MediaJobType {
    Probe,
    RenderMp4H264,
    RenderHls,
    WaveformPeaks,
    Thumbnails,
    SubtitlesExtract,
    SubtitlesBurnin,
    Concat,
    DeadAirDetect,
    DeadAirCut,
    GenerateClipFromApi,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
    pub asset_id: String,
    pub kind: String,
    pub uri: String,
    pub mime: Option<String>,
    pub label: Option<String>,
    pub duration_ms: Option<u64>,
    pub content_hash: Option<String>,
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaClip {
    pub clip_id: String,
    pub asset_id: String,
    pub in_ms: Option<u64>,
    pub out_ms: Option<u64>,
    pub start_ms: u64,
    pub playback_rate: Option<f64>,
    pub volume: Option<f64>,
    pub mute: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrack {
    pub track_id: String,
    #[serde(rename = "type")]
    pub track_type: String,
    pub clips: Vec<MediaClip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTimeline {
    pub project_id: String,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub tracks: Vec<MediaTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobInputs {
    pub assets: Option<Vec<MediaAsset>>,
    pub project: Option<MediaTimeline>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobOutput {
    pub mode: String,
    pub target: String,
    pub overwrite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobSpec {
    pub spec_version: String,
    pub job_id: String,
    pub job_type: MediaJobType,
    pub priority: Option<String>,
    pub inputs: MediaJobInputs,
    pub params: Option<serde_json::Value>,
    pub output: MediaJobOutput,
    pub engine: Option<serde_json::Value>,
    pub cache: Option<serde_json::Value>,
    pub telemetry: Option<serde_json::Value>,
}

// ========================================
// Job Status and Progress
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobProgress {
    pub job_id: String,
    pub status: String,
    pub progress: f64,
    pub eta_ms: Option<u64>,
    pub stage: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobResult {
    pub job_id: String,
    pub status: String,
    pub artifacts: Vec<MediaArtifact>,
    pub derived: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaArtifact {
    pub kind: String,
    pub uri: String,
    pub mime: Option<String>,
}

// ========================================
// Job Store
// ========================================

pub struct JobStore {
    pub progress: HashMap<String, MediaJobProgress>,
    pub results: HashMap<String, MediaJobResult>,
}

impl Default for JobStore {
    fn default() -> Self {
        Self {
            progress: HashMap::new(),
            results: HashMap::new(),
        }
    }
}

// ========================================
// Validation
// ========================================

fn validate_spec(spec: &MediaJobSpec) -> Result<(), String> {
    if spec.spec_version != "0.1" {
        return Err(format!(
            "Unsupported specVersion: {}. Expected 0.1",
            spec.spec_version
        ));
    }

    if spec.job_id.is_empty() {
        return Err("jobId is required".to_string());
    }

    // Validate URIs don't contain shell metacharacters
    if let Some(assets) = &spec.inputs.assets {
        for asset in assets {
            if asset.uri.contains(';')
                || asset.uri.contains('|')
                || asset.uri.contains('&')
                || asset.uri.contains('`')
                || asset.uri.contains('$')
            {
                return Err(format!(
                    "Asset {} URI contains shell metacharacters",
                    asset.asset_id
                ));
            }
        }
    }

    // Validate clip ranges
    if let Some(project) = &spec.inputs.project {
        for track in &project.tracks {
            for clip in &track.clips {
                if let (Some(in_ms), Some(out_ms)) = (clip.in_ms, clip.out_ms) {
                    if out_ms <= in_ms {
                        return Err(format!(
                            "Clip {} outMs ({}) must be > inMs ({})",
                            clip.clip_id, out_ms, in_ms
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

// ========================================
// Dispatch
// ========================================

pub fn dispatch_job(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    job_store: Arc<Mutex<JobStore>>,
) -> Result<String, String> {
    validate_spec(spec)?;

    let job_id = spec.job_id.clone();
    let spec_clone = spec.clone();
    let app_clone = app.clone();
    let store = Arc::clone(&job_store);

    // Initialize progress
    {
        let mut store_lock = store.lock().unwrap();
        store_lock.progress.insert(
            job_id.clone(),
            MediaJobProgress {
                job_id: job_id.clone(),
                status: "queued".to_string(),
                progress: 0.0,
                eta_ms: None,
                stage: None,
                message: None,
            },
        );
    }

    // Spawn async job handler
    tokio::spawn(async move {
        let result = match spec_clone.job_type {
            MediaJobType::Probe => handle_probe(&spec_clone, &app_clone, &store).await,
            MediaJobType::RenderMp4H264 => {
                handle_render(&spec_clone, &app_clone, &store).await
            }
            MediaJobType::WaveformPeaks => {
                handle_waveform(&spec_clone, &app_clone, &store).await
            }
            MediaJobType::Thumbnails => {
                handle_thumbnails(&spec_clone, &app_clone, &store).await
            }
            MediaJobType::DeadAirDetect => {
                handle_dead_air_detect(&spec_clone, &app_clone, &store).await
            }
            MediaJobType::DeadAirCut => {
                handle_dead_air_cut(&spec_clone, &app_clone, &store).await
            }
            MediaJobType::Concat => handle_concat(&spec_clone, &app_clone, &store).await,
            MediaJobType::SubtitlesExtract => {
                handle_subtitles_extract(&spec_clone, &app_clone, &store).await
            }
            _ => Err(format!("Unsupported job type: {:?}", spec_clone.job_type)),
        };

        // Update final status
        let mut store_lock = store.lock().unwrap();
        match result {
            Ok(job_result) => {
                store_lock.progress.insert(
                    spec_clone.job_id.clone(),
                    MediaJobProgress {
                        job_id: spec_clone.job_id.clone(),
                        status: "done".to_string(),
                        progress: 1.0,
                        eta_ms: None,
                        stage: None,
                        message: None,
                    },
                );
                store_lock
                    .results
                    .insert(spec_clone.job_id.clone(), job_result);
            }
            Err(e) => {
                store_lock.progress.insert(
                    spec_clone.job_id.clone(),
                    MediaJobProgress {
                        job_id: spec_clone.job_id.clone(),
                        status: "error".to_string(),
                        progress: 0.0,
                        eta_ms: None,
                        stage: None,
                        message: Some(e),
                    },
                );
            }
        }
    });

    Ok(job_id)
}

fn emit_progress(app: &tauri::AppHandle, progress: &MediaJobProgress) {
    let _ = app.emit("media-job-progress", progress);
}

// ========================================
// Job Handlers (stubs -- call into ffmpeg.rs / render.rs)
// ========================================

async fn handle_probe(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    let assets = spec.inputs.assets.as_ref().ok_or("No assets for probe")?;
    let asset = assets.first().ok_or("No asset provided")?;

    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.1,
            eta_ms: None,
            stage: Some("probing".to_string()),
            message: None,
        },
    );

    let uri = &asset.uri;
    let path = uri
        .strip_prefix("file:///")
        .or_else(|| uri.strip_prefix("file://"))
        .unwrap_or(uri);

    let info = super::ffmpeg::ffmpeg_probe_file(path.to_string())
        .await
        .map_err(|e| format!("Probe failed: {}", e))?;

    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![],
        derived: Some(serde_json::to_value(&info).unwrap_or_default()),
    })
}

async fn handle_render(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.0,
            eta_ms: None,
            stage: Some("rendering".to_string()),
            message: None,
        },
    );

    // Delegate to RenderEngine (existing implementation)
    // The actual render is handled by the existing start_render flow
    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![MediaArtifact {
            kind: "video".to_string(),
            uri: spec.output.target.clone(),
            mime: Some("video/mp4".to_string()),
        }],
        derived: None,
    })
}

async fn handle_waveform(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    let assets = spec.inputs.assets.as_ref().ok_or("No assets")?;
    let asset = assets.first().ok_or("No asset")?;

    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.1,
            eta_ms: None,
            stage: Some("extracting_waveform".to_string()),
            message: None,
        },
    );

    let bucket_ms: u64 = spec
        .params
        .as_ref()
        .and_then(|p| p.get("bucketMs"))
        .and_then(|v| v.as_u64())
        .unwrap_or(100);

    let path = asset
        .uri
        .strip_prefix("file:///")
        .or_else(|| asset.uri.strip_prefix("file://"))
        .unwrap_or(&asset.uri);

    let peaks = super::ffmpeg::extract_waveform_pcm(path, bucket_ms as usize).await?;

    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![],
        derived: Some(serde_json::json!({
            "bucketMs": bucket_ms,
            "peaks": peaks,
            "durationMs": peaks.len() as u64 * bucket_ms,
        })),
    })
}

async fn handle_thumbnails(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.1,
            eta_ms: None,
            stage: Some("generating_thumbnails".to_string()),
            message: None,
        },
    );

    // Placeholder: actual implementation delegates to ffmpeg_generate_thumbnail
    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![],
        derived: None,
    })
}

async fn handle_dead_air_detect(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    let assets = spec.inputs.assets.as_ref().ok_or("No assets")?;
    let asset = assets.first().ok_or("No asset")?;

    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.1,
            eta_ms: None,
            stage: Some("detecting_silence".to_string()),
            message: None,
        },
    );

    let threshold_db: f64 = spec
        .params
        .as_ref()
        .and_then(|p| p.get("thresholdDb"))
        .and_then(|v| v.as_f64())
        .unwrap_or(-40.0);

    let min_silence_ms: u64 = spec
        .params
        .as_ref()
        .and_then(|p| p.get("minSilenceMs"))
        .and_then(|v| v.as_u64())
        .unwrap_or(500);

    let path = asset
        .uri
        .strip_prefix("file:///")
        .or_else(|| asset.uri.strip_prefix("file://"))
        .unwrap_or(&asset.uri);

    let silence_segments =
        super::ffmpeg::detect_silence(path, threshold_db, min_silence_ms).await?;

    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![],
        derived: Some(serde_json::json!({
            "silenceSegments": silence_segments,
        })),
    })
}

async fn handle_dead_air_cut(
    spec: &MediaJobSpec,
    app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    emit_progress(
        app,
        &MediaJobProgress {
            job_id: spec.job_id.clone(),
            status: "running".to_string(),
            progress: 0.1,
            eta_ms: None,
            stage: Some("cutting_silence".to_string()),
            message: None,
        },
    );

    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![MediaArtifact {
            kind: "video".to_string(),
            uri: spec.output.target.clone(),
            mime: Some("video/mp4".to_string()),
        }],
        derived: None,
    })
}

async fn handle_concat(
    spec: &MediaJobSpec,
    _app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![MediaArtifact {
            kind: "video".to_string(),
            uri: spec.output.target.clone(),
            mime: Some("video/mp4".to_string()),
        }],
        derived: None,
    })
}

async fn handle_subtitles_extract(
    spec: &MediaJobSpec,
    _app: &tauri::AppHandle,
    _store: &Arc<Mutex<JobStore>>,
) -> Result<MediaJobResult, String> {
    Ok(MediaJobResult {
        job_id: spec.job_id.clone(),
        status: "done".to_string(),
        artifacts: vec![],
        derived: None,
    })
}

// ========================================
// Tauri Commands
// ========================================

#[tauri::command]
pub async fn submit_media_job(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<JobStore>>>,
    spec_json: String,
) -> Result<String, String> {
    let spec: MediaJobSpec = serde_json::from_str(&spec_json)
        .map_err(|e| format!("Invalid job spec JSON: {}", e))?;

    let store = Arc::clone(&*state);
    dispatch_job(&spec, &app, store)
}

#[tauri::command]
pub fn get_media_job_status(
    state: tauri::State<'_, Arc<Mutex<JobStore>>>,
    job_id: String,
) -> Result<MediaJobProgress, String> {
    let store = state.lock().unwrap();
    store
        .progress
        .get(&job_id)
        .cloned()
        .ok_or_else(|| format!("Job not found: {}", job_id))
}

#[tauri::command]
pub fn cancel_media_job(
    state: tauri::State<'_, Arc<Mutex<JobStore>>>,
    job_id: String,
) -> Result<(), String> {
    let mut store = state.lock().unwrap();
    if let Some(progress) = store.progress.get_mut(&job_id) {
        progress.status = "canceled".to_string();
        Ok(())
    } else {
        // Best-effort: don't fail if job is unknown
        Ok(())
    }
}
