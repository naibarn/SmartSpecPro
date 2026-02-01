use std::process::{Command, Stdio};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaFileInfo {
    pub duration: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub codec_video: Option<String>,
    pub codec_audio: Option<String>,
    pub has_video: bool,
    pub has_audio: bool,
}

/// Get bundled FFmpeg path based on platform
pub fn get_ffmpeg_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let exe_dir = std::env::current_exe()
            .expect("Failed to get exe path")
            .parent()
            .expect("Failed to get exe dir")
            .to_path_buf();
        exe_dir.join("resources").join("ffmpeg").join("win").join("ffmpeg.exe")
    }

    #[cfg(target_os = "macos")]
    {
        let exe_dir = std::env::current_exe()
            .expect("Failed to get exe path")
            .parent()
            .expect("Failed to get exe dir")
            .to_path_buf();
        exe_dir.join("..").join("Resources").join("ffmpeg").join("mac").join("ffmpeg")
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        panic!("Unsupported platform for bundled FFmpeg");
    }
}

/// Get FFprobe path (same directory as FFmpeg)
pub fn get_ffprobe_path() -> PathBuf {
    let ffmpeg_path = get_ffmpeg_path();
    let parent = ffmpeg_path.parent().expect("Failed to get ffmpeg parent dir");

    #[cfg(target_os = "windows")]
    return parent.join("ffprobe.exe");

    #[cfg(not(target_os = "windows"))]
    return parent.join("ffprobe");
}

/// Probe media file with ffprobe to extract metadata
#[tauri::command]
pub async fn ffmpeg_probe_file(path: String) -> Result<MediaFileInfo, String> {
    let ffprobe_path = get_ffprobe_path();

    // Check if ffprobe exists
    if !ffprobe_path.exists() {
        return Err(format!(
            "FFprobe not found at: {}. Please ensure FFmpeg is bundled with the application.",
            ffprobe_path.display()
        ));
    }

    let output = Command::new(&ffprobe_path)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Extract info from JSON
    let format = &json["format"];
    let empty_vec = vec![];
    let streams = json["streams"].as_array().unwrap_or(&empty_vec);

    let video_stream = streams.iter()
        .find(|s| s["codec_type"] == "video");
    let audio_stream = streams.iter()
        .find(|s| s["codec_type"] == "audio");

    Ok(MediaFileInfo {
        duration: format["duration"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        width: video_stream
            .and_then(|s| s["width"].as_u64())
            .map(|v| v as u32),
        height: video_stream
            .and_then(|s| s["height"].as_u64())
            .map(|v| v as u32),
        fps: video_stream
            .and_then(|s| s["r_frame_rate"].as_str())
            .and_then(parse_fps),
        sample_rate: audio_stream
            .and_then(|s| s["sample_rate"].as_str())
            .and_then(|s| s.parse().ok()),
        codec_video: video_stream
            .and_then(|s| s["codec_name"].as_str())
            .map(|s| s.to_string()),
        codec_audio: audio_stream
            .and_then(|s| s["codec_name"].as_str())
            .map(|s| s.to_string()),
        has_video: video_stream.is_some(),
        has_audio: audio_stream.is_some(),
    })
}

/// Generate thumbnail from video at specified time
#[tauri::command]
pub async fn ffmpeg_generate_thumbnail(
    input_path: String,
    output_path: String,
    time_seconds: f64
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path();

    if !ffmpeg_path.exists() {
        return Err(format!(
            "FFmpeg not found at: {}",
            ffmpeg_path.display()
        ));
    }

    let status = Command::new(&ffmpeg_path)
        .args(&[
            "-ss", &time_seconds.to_string(),
            "-i", &input_path,
            "-vframes", "1",
            "-q:v", "2",
            "-vf", "scale=320:-1",  // 320px width, maintain aspect ratio
            "-y",
            &output_path
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("Thumbnail generation failed".to_string());
    }

    Ok(())
}

/// Detect available H.264 encoders on the system
#[tauri::command]
pub async fn ffmpeg_detect_encoders() -> Result<Vec<String>, String> {
    let ffmpeg_path = get_ffmpeg_path();

    if !ffmpeg_path.exists() {
        return Err(format!(
            "FFmpeg not found at: {}",
            ffmpeg_path.display()
        ));
    }

    let output = Command::new(&ffmpeg_path)
        .args(&["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut encoders = Vec::new();

    // Check for hardware encoders first (preferred)
    if stdout.contains("h264_videotoolbox") {
        encoders.push("h264_videotoolbox".to_string());
    }
    if stdout.contains("h264_mf") {
        encoders.push("h264_mf".to_string());
    }
    if stdout.contains("h264_qsv") {
        encoders.push("h264_qsv".to_string());
    }
    if stdout.contains("h264_nvenc") {
        encoders.push("h264_nvenc".to_string());
    }
    if stdout.contains("h264_amf") {
        encoders.push("h264_amf".to_string());
    }
    if stdout.contains("libopenh264") {
        encoders.push("libopenh264".to_string());
    }

    if encoders.is_empty() {
        return Err("No suitable H.264 encoder found. Hardware acceleration may not be available.".to_string());
    }

    Ok(encoders)
}

/// Get FFmpeg version info
#[tauri::command]
pub async fn ffmpeg_version() -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path();

    if !ffmpeg_path.exists() {
        return Err(format!(
            "FFmpeg not found at: {}",
            ffmpeg_path.display()
        ));
    }

    let output = Command::new(&ffmpeg_path)
        .args(&["-version"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Extract first line (version info)
    let version = stdout
        .lines()
        .next()
        .unwrap_or("Unknown version")
        .to_string();

    Ok(version)
}

/// Extract audio waveform data for visualization
/// Returns array of amplitude values (0.0 - 1.0)
/// FIXED: Added resource limits to prevent DoS
#[tauri::command]
pub async fn ffmpeg_extract_waveform(
    input_path: String,
    samples: usize
) -> Result<Vec<f32>, String> {
    // Security: Limit maximum samples to prevent resource exhaustion
    const MAX_WAVEFORM_SAMPLES: usize = 10000;
    if samples > MAX_WAVEFORM_SAMPLES {
        return Err(format!(
            "Too many samples requested: {} (max: {})",
            samples, MAX_WAVEFORM_SAMPLES
        ));
    }

    if samples == 0 {
        return Err("Samples must be greater than 0".to_string());
    }

    let ffmpeg_path = get_ffmpeg_path();

    if !ffmpeg_path.exists() {
        return Err(format!(
            "FFmpeg not found at: {}",
            ffmpeg_path.display()
        ));
    }

    // Generate temp file for audio data
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("waveform_{}.txt", uuid::Uuid::new_v4()));

    // Extract audio as text using astats filter
    let status = Command::new(&ffmpeg_path)
        .args(&[
            "-i", &input_path,
            "-af", &format!("aformat=channel_layouts=mono,compand,showwavespic=s={}x100:colors=white", samples),
            "-frames:v", "1",
            "-f", "null",
            "-"
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("Waveform extraction failed".to_string());
    }

    // For now, return dummy data
    // In production, this should parse actual audio data
    Ok(vec![0.5; samples])
}

/// Parse FPS string like "30/1" or "29.97"
fn parse_fps(fps_str: &str) -> Option<f64> {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        Some(num / den)
    } else {
        fps_str.parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fps() {
        assert_eq!(parse_fps("30/1"), Some(30.0));
        assert_eq!(parse_fps("29.97"), Some(29.97));
        assert_eq!(parse_fps("60/1"), Some(60.0));
    }
}
