use std::process::{Command, Stdio, Child};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderJob {
    pub id: String,
    pub output_path: String,
    pub status: RenderStatus,
    pub progress: f64,  // 0.0 - 1.0
    pub error: Option<String>,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RenderStatus {
    Pending,
    Rendering,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub sample_rate: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Clip {
    pub asset_id: String,
    pub start_time: f64,
    pub duration: f64,
    pub trim_in: f64,
    pub trim_out: f64,
    pub volume: f64,
    pub speed: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    #[serde(rename = "type")]
    pub track_type: String,  // "video" or "audio"
    pub clips: Vec<Clip>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub asset_type: String,  // "video", "audio"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DuckingConfig {
    pub enabled: bool,
    pub voiceover_track_id: String,
    pub threshold: f64,
    pub ratio: f64,
    pub attack: f64,    // milliseconds
    pub release: f64,   // milliseconds
    pub makeup_gain: f64,
    pub background_gain: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioMixing {
    pub ducking: DuckingConfig,
    pub master_volume: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportSettings {
    pub codec: String,
    pub bitrate: u32,
    pub audio_codec: String,
    pub audio_bitrate: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Timeline {
    pub tracks: Vec<Track>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoEditorProject {
    pub settings: ProjectSettings,
    pub timeline: Timeline,
    pub assets: HashMap<String, Asset>,
    pub audio_mixing: AudioMixing,
    pub export: ExportSettings,
}

pub struct RenderEngine {
    jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl Default for RenderEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl RenderEngine {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a render job
    pub async fn start_render_internal(
        jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
        processes: Arc<Mutex<HashMap<String, Child>>>,
        project_json: String,
        output_path: String
    ) -> Result<String, String> {
        let project: VideoEditorProject = serde_json::from_str(&project_json)
            .map_err(|e| format!("Invalid project JSON: {}", e))?;

        let job_id = uuid::Uuid::new_v4().to_string();

        let job = RenderJob {
            id: job_id.clone(),
            output_path: output_path.clone(),
            status: RenderStatus::Pending,
            progress: 0.0,
            error: None,
            started_at: None,
            completed_at: None,
        };

        // Store job
        jobs.lock().unwrap().insert(job_id.clone(), job.clone());

        // Spawn render task
        let jobs_clone = Arc::clone(&jobs);
        let processes_clone = Arc::clone(&processes);
        tokio::spawn(async move {
            Self::execute_render(jobs_clone, processes_clone, job_id, project, output_path).await;
        });

        Ok(job_id)
    }

    async fn execute_render(
        jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
        processes: Arc<Mutex<HashMap<String, Child>>>,
        job_id: String,
        project: VideoEditorProject,
        output_path: String
    ) {
        // Update status to rendering
        let started_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        {
            let mut jobs_lock = jobs.lock().unwrap();
            if let Some(job) = jobs_lock.get_mut(&job_id) {
                job.status = RenderStatus::Rendering;
                job.started_at = Some(started_at);
            }
        }

        // Generate FFmpeg command
        let ffmpeg_cmd = match Self::generate_ffmpeg_command(&project, &output_path) {
            Ok(cmd) => cmd,
            Err(e) => {
                let mut jobs_lock = jobs.lock().unwrap();
                if let Some(job) = jobs_lock.get_mut(&job_id) {
                    job.status = RenderStatus::Failed;
                    job.error = Some(e);
                }
                return;
            }
        };

        // Execute FFmpeg
        let ffmpeg_path = super::ffmpeg::get_ffmpeg_path();

        let mut child = match Command::new(&ffmpeg_path)
            .args(&ffmpeg_cmd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                let mut jobs_lock = jobs.lock().unwrap();
                if let Some(job) = jobs_lock.get_mut(&job_id) {
                    job.status = RenderStatus::Failed;
                    job.error = Some(format!("Failed to spawn ffmpeg: {}", e));
                }
                return;
            }
        };

        // Note: We can't store the child process here because it needs to be moved
        // For now, we'll just wait for completion
        // In a production version, we'd use a more sophisticated approach

        // Wait for completion
        let result = child.wait();

        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut jobs_lock = jobs.lock().unwrap();
        if let Some(job) = jobs_lock.get_mut(&job_id) {
            match result {
                Ok(status) if status.success() => {
                    job.status = RenderStatus::Completed;
                    job.progress = 1.0;
                    job.completed_at = Some(completed_at);
                }
                Ok(_) => {
                    job.status = RenderStatus::Failed;
                    job.error = Some("FFmpeg process failed".to_string());
                    job.completed_at = Some(completed_at);
                }
                Err(e) => {
                    job.status = RenderStatus::Failed;
                    job.error = Some(format!("Process error: {}", e));
                    job.completed_at = Some(completed_at);
                }
            }
        }
    }

    fn generate_ffmpeg_command(
        project: &VideoEditorProject,
        output_path: &str
    ) -> Result<Vec<String>, String> {
        let mut args = Vec::new();

        // Collect all unique input files
        let mut inputs: Vec<&Asset> = Vec::new();
        let mut input_map: HashMap<String, usize> = HashMap::new();

        for track in &project.timeline.tracks {
            for clip in &track.clips {
                let asset = project.assets.get(&clip.asset_id)
                    .ok_or_else(|| format!("Asset not found: {}", clip.asset_id))?;

                if !input_map.contains_key(&asset.path) {
                    input_map.insert(asset.path.clone(), inputs.len());
                    inputs.push(asset);
                }
            }
        }

        // Add inputs
        for input in &inputs {
            args.push("-i".to_string());
            args.push(input.path.clone());
        }

        // Build filter_complex for basic concatenation
        // This is simplified - full implementation will be more complex
        let filter = Self::build_filter_complex(project, inputs.as_slice())?;

        if !filter.is_empty() {
            args.push("-filter_complex".to_string());
            args.push(filter);

            // Map outputs
            args.push("-map".to_string());
            args.push("[vout]".to_string());
            args.push("-map".to_string());
            args.push("[aout]".to_string());
        } else {
            // Simple case - single input
            args.push("-map".to_string());
            args.push("0:v".to_string());
            args.push("-map".to_string());
            args.push("0:a".to_string());
        }

        // Video codec
        args.push("-c:v".to_string());
        args.push(project.export.codec.clone());
        args.push("-b:v".to_string());
        args.push(format!("{}k", project.export.bitrate));
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());

        // Audio codec
        args.push("-c:a".to_string());
        args.push(project.export.audio_codec.clone());
        args.push("-b:a".to_string());
        args.push(format!("{}k", project.export.audio_bitrate));
        args.push("-ar".to_string());
        args.push(project.settings.sample_rate.to_string());

        // Output options
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
        args.push("-y".to_string());  // Overwrite
        args.push(output_path.to_string());

        Ok(args)
    }

    fn build_filter_complex(
        project: &VideoEditorProject,
        _inputs: &[Asset]
    ) -> Result<String, String> {
        // Simplified filter for Phase 0
        // Full implementation will handle:
        // - Trimming clips
        // - Concatenating multiple clips
        // - Audio ducking
        // - Volume adjustments

        let video_tracks: Vec<_> = project.timeline.tracks.iter()
            .filter(|t| t.track_type == "video")
            .collect();

        let audio_tracks: Vec<_> = project.timeline.tracks.iter()
            .filter(|t| t.track_type == "audio")
            .collect();

        if video_tracks.is_empty() || audio_tracks.is_empty() {
            return Ok(String::new());  // Will use simple mapping
        }

        // For now, just scale and resample
        Ok(format!(
            "[0:v]scale={}:{}[vout];[0:a]aresample={}[aout]",
            project.settings.width,
            project.settings.height,
            project.settings.sample_rate
        ))
    }
}

// Tauri commands

#[tauri::command]
pub async fn start_render(
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
    project_json: String,
    output_path: String
) -> Result<String, String> {
    let engine = state.lock().unwrap();
    let jobs = Arc::clone(&engine.jobs);
    let processes = Arc::clone(&engine.processes);

    RenderEngine::start_render_internal(jobs, processes, project_json, output_path).await
}

#[tauri::command]
pub fn get_render_status(
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
    job_id: String
) -> Result<RenderJob, String> {
    let engine = state.lock().unwrap();
    let jobs = engine.jobs.lock().unwrap();

    jobs.get(&job_id)
        .cloned()
        .ok_or_else(|| "Job not found".to_string())
}

#[tauri::command]
pub fn cancel_render(
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
    job_id: String
) -> Result<(), String> {
    let engine = state.lock().unwrap();

    // Kill the process
    {
        let mut processes = engine.processes.lock().unwrap();
        if let Some(mut child) = processes.remove(&job_id) {
            let _ = child.kill();
        }
    }

    // Update job status
    let mut jobs = engine.jobs.lock().unwrap();
    if let Some(job) = jobs.get_mut(&job_id) {
        job.status = RenderStatus::Cancelled;
        Ok(())
    } else {
        Err("Job not found".to_string())
    }
}

#[tauri::command]
pub fn list_render_jobs(
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
) -> Result<Vec<RenderJob>, String> {
    let engine = state.lock().unwrap();
    let jobs = engine.jobs.lock().unwrap();

    Ok(jobs.values().cloned().collect())
}
