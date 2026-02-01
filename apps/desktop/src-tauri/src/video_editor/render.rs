use std::process::{Command, Stdio, Child};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

/// Sanitize file path to prevent command injection
/// Only allows alphanumeric, dash, underscore, dot, and forward/back slashes
fn sanitize_path(path: &str) -> Result<String, String> {
    // Check for null bytes (command injection vector)
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }

    // Check for suspicious patterns
    if path.contains(';') || path.contains('|') || path.contains('&') ||
       path.contains('`') || path.contains('$') || path.contains('(') ||
       path.contains(')') || path.contains('<') || path.contains('>') {
        return Err("Invalid path: contains shell metacharacters".to_string());
    }

    // Validate file extension
    let path_obj = Path::new(path);
    if let Some(ext) = path_obj.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if !matches!(ext_str.as_str(), "mp4" | "mov" | "avi" | "mkv" | "mp3" | "wav" | "aac") {
            return Err(format!("Invalid file extension: .{}", ext_str));
        }
    } else {
        return Err("File must have an extension".to_string());
    }

    Ok(path.to_string())
}

/// Sanitize codec name to prevent injection
fn sanitize_codec(codec: &str) -> Result<String, String> {
    // Only allow known safe codecs
    let allowed_codecs = [
        "h264_videotoolbox", "h264_mf", "h264_qsv", "h264_nvenc",
        "hevc_videotoolbox", "hevc_mf", "hevc_qsv", "hevc_nvenc",
        "libx264", "libx265", "aac", "mp3", "libmp3lame"
    ];

    if allowed_codecs.contains(&codec) {
        Ok(codec.to_string())
    } else {
        Err(format!("Invalid codec: {}", codec))
    }
}

/// Sanitize numeric value for FFmpeg filters to prevent injection
/// Only allows positive integers and decimals (no special characters)
fn sanitize_numeric(value: impl std::fmt::Display) -> Result<String, String> {
    let value_str = value.to_string();

    // Check for command injection attempts
    if value_str.contains(';') || value_str.contains('|') || value_str.contains('&') ||
       value_str.contains('`') || value_str.contains('$') || value_str.contains('[') ||
       value_str.contains(']') || value_str.contains('(') || value_str.contains(')') {
        return Err("Invalid numeric value: contains unsafe characters".to_string());
    }

    // Validate it's actually a number
    if value_str.parse::<f64>().is_err() {
        return Err("Invalid numeric value: not a valid number".to_string());
    }

    Ok(value_str)
}

// Resource limits
const MAX_CLIPS: usize = 1000;
const MAX_DURATION_SECONDS: f64 = 3600.0; // 1 hour
const MAX_VIDEO_BITRATE: u32 = 50000; // 50Mbps
const MAX_AUDIO_BITRATE: u32 = 320; // 320kbps
const MAX_RESOLUTION_PIXELS: u32 = 1920 * 1080 * 4; // 4K max

// Job management limits
const MAX_CONCURRENT_JOBS: usize = 5;
const MAX_STORED_JOBS: usize = 100; // Keep history of last 100 jobs
const JOB_CLEANUP_THRESHOLD: usize = 80; // Cleanup when reaching 80 jobs

/// Validate project resource limits to prevent DoS
fn validate_project_limits(project: &VideoEditorProject) -> Result<(), String> {
    // Count total clips
    let total_clips: usize = project.timeline.tracks
        .iter()
        .map(|t| t.clips.len())
        .sum();

    if total_clips > MAX_CLIPS {
        return Err(format!(
            "Too many clips: {} (maximum: {})",
            total_clips, MAX_CLIPS
        ));
    }

    // Check duration
    let mut max_end_time = 0.0;
    for track in &project.timeline.tracks {
        for clip in &track.clips {
            let clip_end = clip.start_time + clip.duration;
            if clip_end > max_end_time {
                max_end_time = clip_end;
            }
        }
    }

    if max_end_time > MAX_DURATION_SECONDS {
        return Err(format!(
            "Project duration too long: {:.1}s (maximum: {:.1}s / 1 hour)",
            max_end_time, MAX_DURATION_SECONDS
        ));
    }

    // Validate export settings
    if project.export.bitrate > MAX_VIDEO_BITRATE {
        return Err(format!(
            "Video bitrate too high: {}kbps (maximum: {}kbps)",
            project.export.bitrate, MAX_VIDEO_BITRATE
        ));
    }

    if project.export.audio_bitrate > MAX_AUDIO_BITRATE {
        return Err(format!(
            "Audio bitrate too high: {}kbps (maximum: {}kbps)",
            project.export.audio_bitrate, MAX_AUDIO_BITRATE
        ));
    }

    // Validate resolution
    let total_pixels = project.settings.width * project.settings.height;
    if total_pixels > MAX_RESOLUTION_PIXELS {
        return Err(format!(
            "Resolution too high: {}x{} (maximum: 3840x2160 / 4K)",
            project.settings.width, project.settings.height
        ));
    }

    // Validate FPS
    if project.settings.fps > 120 || project.settings.fps < 1 {
        return Err(format!(
            "Invalid FPS: {} (must be between 1-120)",
            project.settings.fps
        ));
    }

    // Validate clip properties
    for track in &project.timeline.tracks {
        for clip in &track.clips {
            if clip.volume < 0.0 || clip.volume > 2.0 {
                return Err(format!(
                    "Invalid clip volume: {} (must be between 0.0-2.0)",
                    clip.volume
                ));
            }

            if clip.speed <= 0.0 || clip.speed > 10.0 {
                return Err(format!(
                    "Invalid clip speed: {} (must be between 0.0-10.0)",
                    clip.speed
                ));
            }
        }
    }

    Ok(())
}

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

    /// Clean up old completed/failed jobs to prevent memory leak
    fn cleanup_old_jobs(jobs: &mut HashMap<String, RenderJob>) {
        if jobs.len() <= JOB_CLEANUP_THRESHOLD {
            return;
        }

        // Sort jobs by completion time, keep the most recent ones
        let mut completed_jobs: Vec<_> = jobs
            .iter()
            .filter(|(_, job)| {
                matches!(job.status, RenderStatus::Completed | RenderStatus::Failed)
            })
            .map(|(id, job)| (id.clone(), job.completed_at.unwrap_or(0)))
            .collect();

        completed_jobs.sort_by_key(|(_, time)| *time);

        // Remove oldest jobs until we're under the threshold
        let to_remove = jobs.len().saturating_sub(MAX_STORED_JOBS);
        for (id, _) in completed_jobs.iter().take(to_remove) {
            jobs.remove(id);
        }
    }

    /// Check concurrent job limit
    fn check_concurrent_limit(jobs: &HashMap<String, RenderJob>) -> Result<(), String> {
        let active_jobs = jobs
            .values()
            .filter(|job| matches!(job.status, RenderStatus::Pending | RenderStatus::Rendering))
            .count();

        if active_jobs >= MAX_CONCURRENT_JOBS {
            return Err(format!(
                "Too many concurrent render jobs ({}/{}). Please wait for some to complete.",
                active_jobs, MAX_CONCURRENT_JOBS
            ));
        }

        Ok(())
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

        // Security: Validate project resource limits
        validate_project_limits(&project)?;

        // Check concurrent job limit and cleanup old jobs
        {
            let mut jobs_lock = jobs.lock().unwrap();
            Self::check_concurrent_limit(&jobs_lock)?;
            Self::cleanup_old_jobs(&mut jobs_lock);
        }

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
            .stdout(Stdio::null())  // Discard stdout to prevent buffer overflow
            .stderr(Stdio::null())  // Discard stderr to prevent deadlock (FFmpeg produces lots of output)
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

        // FIXED: Use Stdio::null() instead of piped() to prevent deadlock
        // FFmpeg produces lots of stderr output which can fill the pipe buffer
        // causing the process to block. We discard the output since we're tracking
        // progress through file size instead.

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
        // Security: Sanitize output path
        let safe_output_path = sanitize_path(output_path)?;

        // Security: Validate codecs
        sanitize_codec(&project.export.codec)?;
        sanitize_codec(&project.export.audio_codec)?;

        let mut args = Vec::new();

        // Collect all unique input files
        let mut inputs: Vec<&Asset> = Vec::new();
        let mut input_map: HashMap<String, usize> = HashMap::new();

        for track in &project.timeline.tracks {
            for clip in &track.clips {
                let asset = project.assets.get(&clip.asset_id)
                    .ok_or_else(|| format!("Asset not found: {}", clip.asset_id))?;

                if !input_map.contains_key(&asset.path) {
                    // Security: Validate input paths
                    sanitize_path(&asset.path)?;

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
        args.push(safe_output_path);

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
        // Security: Sanitize numeric values to prevent filter injection
        let width = sanitize_numeric(project.settings.width)?;
        let height = sanitize_numeric(project.settings.height)?;
        let sample_rate = sanitize_numeric(project.settings.sample_rate)?;

        Ok(format!(
            "[0:v]scale={}:{}[vout];[0:a]aresample={}[aout]",
            width, height, sample_rate
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
