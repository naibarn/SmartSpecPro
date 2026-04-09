use std::process::{Command, Stdio};
use super::render::sanitize_path;
use std::path::PathBuf;
use std::io::Read as IoRead;
use std::env;
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

/// Search PATH for a binary by name. Returns the full path if found, None otherwise.
/// This function never panics.
pub fn find_system_binary(name: &str) -> Option<PathBuf> {
    let path_var = env::var("PATH").ok()?;

    #[cfg(target_os = "windows")]
    let separator = ';';
    #[cfg(not(target_os = "windows"))]
    let separator = ':';

    for dir in path_var.split(separator) {
        let candidate = PathBuf::from(dir).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        // On Windows, also check with .exe extension
        #[cfg(target_os = "windows")]
        {
            let with_exe = PathBuf::from(dir).join(format!("{}.exe", name));
            if with_exe.is_file() {
                return Some(with_exe);
            }
        }
    }
    None
}

/// Find system ffmpeg on PATH (fallback for dev/Linux).
/// Returns the full path if found, None otherwise. Never panics.
pub fn find_system_ffmpeg() -> Option<PathBuf> {
    find_system_binary("ffmpeg")
}

/// Find system ffprobe on PATH (fallback for dev/Linux).
/// Returns the full path if found, None otherwise. Never panics.
pub fn find_system_ffprobe() -> Option<PathBuf> {
    find_system_binary("ffprobe")
}

/// Get FFmpeg path using a resolution chain:
/// 1. Tauri sidecar binary (bundled via externalBin)
/// 2. Legacy bundled resource path (Windows/macOS)
/// 3. System PATH search
/// 4. Bare "ffmpeg" name (let the OS resolve it)
pub fn get_ffmpeg_path() -> PathBuf {
    // 1. Try Tauri sidecar path (next to the executable)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar = exe_dir.join("ffmpeg");
            #[cfg(target_os = "windows")]
            let sidecar = exe_dir.join("ffmpeg.exe");
            if sidecar.is_file() {
                return sidecar;
            }
        }
    }

    // 2. Try legacy resource paths
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let legacy = exe_dir.join("resources").join("ffmpeg").join("win").join("ffmpeg.exe");
                if legacy.is_file() {
                    return legacy;
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let legacy = exe_dir.join("..").join("Resources").join("ffmpeg").join("mac").join("ffmpeg");
                if legacy.is_file() {
                    return legacy;
                }
            }
        }
    }

    // 3. Search system PATH
    if let Some(system_path) = find_system_ffmpeg() {
        return system_path;
    }

    // 4. Bare name fallback — let the OS try to resolve it
    PathBuf::from("ffmpeg")
}

/// Get FFprobe path using the same resolution chain as get_ffmpeg_path.
pub fn get_ffprobe_path() -> PathBuf {
    // 1. Try Tauri sidecar path
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar = exe_dir.join("ffprobe");
            #[cfg(target_os = "windows")]
            let sidecar = exe_dir.join("ffprobe.exe");
            if sidecar.is_file() {
                return sidecar;
            }
        }
    }

    // 2. Try legacy resource paths
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let legacy = exe_dir.join("resources").join("ffmpeg").join("win").join("ffprobe.exe");
                if legacy.is_file() {
                    return legacy;
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let legacy = exe_dir.join("..").join("Resources").join("ffmpeg").join("mac").join("ffprobe");
                if legacy.is_file() {
                    return legacy;
                }
            }
        }
    }

    // 3. Search system PATH
    if let Some(system_path) = find_system_ffprobe() {
        return system_path;
    }

    // 4. Bare name fallback
    PathBuf::from("ffprobe")
}

/// Probe media file with ffprobe to extract metadata
pub fn probe_media_file_sync(path: &str) -> Result<MediaFileInfo, String> {
    let ffprobe_path = get_ffprobe_path();

    let output = Command::new(&ffprobe_path)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path
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

#[tauri::command]
pub async fn ffmpeg_probe_file(path: String) -> Result<MediaFileInfo, String> {
    probe_media_file_sync(&path)
}

/// Generate thumbnail from video at specified time
pub fn generate_thumbnail_sync(
    input_path: &str,
    output_path: &str,
    time_seconds: f64,
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path();

    let status = Command::new(&ffmpeg_path)
        .args(&[
            "-ss", &time_seconds.to_string(),
            "-i", input_path,
            "-vframes", "1",
            "-q:v", "2",
            "-vf", "scale=320:-1",
            "-y",
            output_path
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

fn run_ffmpeg_sync(args: &[String], failure_prefix: &str) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path();
    let output = Command::new(&ffmpeg_path)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run ffmpeg: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        failure_prefix.to_string()
    } else {
        format!("{failure_prefix}: {stderr}")
    })
}

fn escape_subtitle_filter_path(path: &str) -> Result<String, String> {
    let safe_path = sanitize_path(path)?;
    Ok(safe_path
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('[', "\\[")
        .replace(']', "\\]")
        .replace(',', "\\,")
        .replace(';', "\\;")
        .replace('=', "\\="))
}

pub fn mux_subtitle_track_sync(
    input_video_path: &str,
    subtitle_path: &str,
    output_path: &str,
) -> Result<(), String> {
    let safe_input_video_path = sanitize_path(input_video_path)?;
    let safe_subtitle_path = sanitize_path(subtitle_path)?;
    let safe_output_path = sanitize_path(output_path)?;

    run_ffmpeg_sync(
        &[
            "-i".into(),
            safe_input_video_path,
            "-i".into(),
            safe_subtitle_path,
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a?".into(),
            "-map".into(),
            "1:0".into(),
            "-c:v".into(),
            "copy".into(),
            "-c:a".into(),
            "copy".into(),
            "-c:s".into(),
            "mov_text".into(),
            "-metadata:s:s:0".into(),
            "language=und".into(),
            "-movflags".into(),
            "+faststart".into(),
            "-y".into(),
            safe_output_path,
        ],
        "Subtitle muxing failed",
    )
}

pub fn burn_in_subtitle_track_sync(
    input_video_path: &str,
    subtitle_path: &str,
    output_path: &str,
) -> Result<(), String> {
    let safe_input_video_path = sanitize_path(input_video_path)?;
    let safe_output_path = sanitize_path(output_path)?;
    let subtitle_filter = format!("subtitles='{}'", escape_subtitle_filter_path(subtitle_path)?);

    run_ffmpeg_sync(
        &[
            "-i".into(),
            safe_input_video_path,
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a?".into(),
            "-vf".into(),
            subtitle_filter,
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "18".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "copy".into(),
            "-movflags".into(),
            "+faststart".into(),
            "-y".into(),
            safe_output_path,
        ],
        "Subtitle burn-in failed",
    )
}

#[tauri::command]
pub async fn ffmpeg_generate_thumbnail(
    input_path: String,
    output_path: String,
    time_seconds: f64
) -> Result<(), String> {
    generate_thumbnail_sync(&input_path, &output_path, time_seconds)
}

/// Detect available H.264 encoders on the system
#[tauri::command]
pub async fn ffmpeg_detect_encoders() -> Result<Vec<String>, String> {
    let ffmpeg_path = get_ffmpeg_path();

    let output = Command::new(&ffmpeg_path)
        .args(&["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut encoders = Vec::new();

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
        return Err("No suitable H.264 encoder found.".to_string());
    }

    Ok(encoders)
}

/// Get FFmpeg version info
#[tauri::command]
pub async fn ffmpeg_version() -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path();

    let output = Command::new(&ffmpeg_path)
        .args(&["-version"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let version = stdout
        .lines()
        .next()
        .unwrap_or("Unknown version")
        .to_string();

    Ok(version)
}

/// Extract audio waveform data for visualization (legacy API)
#[tauri::command]
pub async fn ffmpeg_extract_waveform(
    input_path: String,
    samples: usize
) -> Result<Vec<f32>, String> {
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

    // Delegate to the new PCM-based extraction with default bucket size
    extract_waveform_pcm(&input_path, 100).await
}

/// Extract real waveform peaks from raw PCM audio data
pub async fn extract_waveform_pcm(
    input_path: &str,
    bucket_ms: usize,
) -> Result<Vec<f32>, String> {
    const MAX_BUCKETS: usize = 10000;
    let ffmpeg_path = get_ffmpeg_path();

    // Extract raw 16-bit signed mono PCM via ffmpeg
    let mut child = Command::new(&ffmpeg_path)
        .args(&[
            "-i", input_path,
            "-af", "aformat=sample_fmts=s16:channel_layouts=mono",
            "-f", "s16le",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg for waveform: {}", e))?;

    let mut pcm_data = Vec::new();
    if let Some(mut stdout) = child.stdout.take() {
        stdout
            .read_to_end(&mut pcm_data)
            .map_err(|e| format!("Failed to read PCM data: {}", e))?;
    }

    let _ = child.wait();

    if pcm_data.is_empty() {
        return Err("No audio data extracted".to_string());
    }

    let peaks = parse_waveform_pcm(&pcm_data, 44100, bucket_ms, MAX_BUCKETS);
    Ok(peaks)
}

/// Parse raw 16-bit signed LE PCM data into per-bucket peak values (0.0-1.0)
pub fn parse_waveform_pcm(
    pcm_data: &[u8],
    sample_rate: u32,
    bucket_ms: usize,
    max_buckets: usize,
) -> Vec<f32> {
    let samples_per_bucket = (sample_rate as usize * bucket_ms) / 1000;
    if samples_per_bucket == 0 {
        return vec![];
    }

    let total_samples = pcm_data.len() / 2; // 2 bytes per i16 sample
    let num_buckets = (total_samples + samples_per_bucket - 1) / samples_per_bucket;
    let num_buckets = num_buckets.min(max_buckets);

    let mut peaks = Vec::with_capacity(num_buckets);

    for bucket_idx in 0..num_buckets {
        let start_sample = bucket_idx * samples_per_bucket;
        let end_sample = ((bucket_idx + 1) * samples_per_bucket).min(total_samples);

        let mut max_abs: i16 = 0;
        for s in start_sample..end_sample {
            let byte_offset = s * 2;
            if byte_offset + 1 < pcm_data.len() {
                let sample =
                    i16::from_le_bytes([pcm_data[byte_offset], pcm_data[byte_offset + 1]]);
                let abs_val = sample.saturating_abs();
                if abs_val > max_abs {
                    max_abs = abs_val;
                }
            }
        }

        peaks.push(max_abs as f32 / i16::MAX as f32);
    }

    peaks
}

// ========================================
// Silence Detection
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub duration_ms: u64,
}

/// Detect silence in audio using FFmpeg's silencedetect filter
pub async fn detect_silence(
    input_path: &str,
    threshold_db: f64,
    min_silence_ms: u64,
) -> Result<Vec<SilenceSegment>, String> {
    let ffmpeg_path = get_ffmpeg_path();

    let min_duration = min_silence_ms as f64 / 1000.0;
    let af_filter = format!(
        "silencedetect=noise={}dB:d={}",
        threshold_db, min_duration
    );

    let output = Command::new(&ffmpeg_path)
        .args(&[
            "-i", input_path,
            "-af", &af_filter,
            "-f", "null",
            "-",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run silence detection: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(parse_silence_detect_output(&stderr))
}

/// Parse FFmpeg silencedetect output from stderr
pub fn parse_silence_detect_output(stderr: &str) -> Vec<SilenceSegment> {
    let mut segments = Vec::new();
    let mut current_start: Option<f64> = None;

    for line in stderr.lines() {
        if line.contains("silence_start:") {
            if let Some(val) = extract_float_after(line, "silence_start:") {
                current_start = Some(val);
            }
        } else if line.contains("silence_end:") {
            if let (Some(start), Some(end)) =
                (current_start, extract_float_after(line, "silence_end:"))
            {
                let duration = extract_float_after(line, "silence_duration:")
                    .unwrap_or(end - start);
                segments.push(SilenceSegment {
                    start_ms: (start * 1000.0) as u64,
                    end_ms: (end * 1000.0) as u64,
                    duration_ms: (duration * 1000.0) as u64,
                });
                current_start = None;
            }
        }
    }

    segments
}

/// Extract a float value after a given prefix in a string
fn extract_float_after(line: &str, prefix: &str) -> Option<f64> {
    let idx = line.find(prefix)?;
    let after = &line[idx + prefix.len()..];
    let trimmed = after.trim().split(|c: char| !c.is_ascii_digit() && c != '.' && c != '-')
        .next()?;
    trimmed.trim().parse().ok()
}

/// Compute keep segments by inverting silence segments
#[cfg_attr(not(test), allow(dead_code))]
pub fn compute_keep_segments(
    silence_segments: &[SilenceSegment],
    total_duration_ms: u64,
    padding_ms: u64,
) -> Vec<(u64, u64)> {
    if silence_segments.is_empty() {
        return vec![(0, total_duration_ms)];
    }

    let mut keep = Vec::new();
    let mut cursor: u64 = 0;

    for seg in silence_segments {
        let keep_end = seg.start_ms.saturating_add(padding_ms);
        if cursor < keep_end {
            keep.push((cursor, keep_end.min(total_duration_ms)));
        }
        cursor = seg.end_ms.saturating_sub(padding_ms);
    }

    if cursor < total_duration_ms {
        keep.push((cursor, total_duration_ms));
    }

    // Merge adjacent segments closer than 2*padding
    merge_keep_segments(keep, padding_ms * 2)
}

#[cfg_attr(not(test), allow(dead_code))]
fn merge_keep_segments(segments: Vec<(u64, u64)>, merge_threshold: u64) -> Vec<(u64, u64)> {
    if segments.is_empty() {
        return segments;
    }

    let mut merged = vec![segments[0]];

    for &(start, end) in &segments[1..] {
        let last = merged.last_mut().unwrap();
        if start <= last.1 + merge_threshold {
            last.1 = last.1.max(end);
        } else {
            merged.push((start, end));
        }
    }

    merged
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
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("smartspec-ffmpeg-tests-{name}-{suffix}"));
        path
    }

    fn ffmpeg_command_available() -> bool {
        Command::new(get_ffmpeg_path())
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    fn ffmpeg_supports_subtitles_filter() -> bool {
        let Ok(output) = Command::new(get_ffmpeg_path())
            .args(["-hide_banner", "-filters"])
            .output() else {
            return false;
        };
        output.status.success()
            && String::from_utf8_lossy(&output.stdout).contains(" subtitles ")
    }

    fn create_sample_video(output_path: &str) -> Result<(), String> {
        run_ffmpeg_sync(
            &[
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                "color=c=blue:s=320x240:d=1".into(),
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                "sine=frequency=1000:duration=1".into(),
                "-shortest".into(),
                "-c:v".into(),
                "libx264".into(),
                "-c:a".into(),
                "aac".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-y".into(),
                output_path.into(),
            ],
            "Sample video generation failed",
        )
    }

    #[test]
    fn test_parse_fps() {
        assert_eq!(parse_fps("30/1"), Some(30.0));
        assert_eq!(parse_fps("29.97"), Some(29.97));
        assert_eq!(parse_fps("60/1"), Some(60.0));
    }

    #[test]
    fn test_parse_waveform_pcm_basic() {
        // Create PCM data: 4 samples at i16::MAX
        let mut pcm = Vec::new();
        for _ in 0..4 {
            pcm.extend_from_slice(&i16::MAX.to_le_bytes());
        }
        let peaks = parse_waveform_pcm(&pcm, 4, 1000, 100); // 4 Hz, 1000ms bucket = all in one bucket
        assert_eq!(peaks.len(), 1);
        assert!((peaks[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_waveform_pcm_normalized() {
        // Half amplitude
        let mut pcm = Vec::new();
        let half = i16::MAX / 2;
        for _ in 0..4 {
            pcm.extend_from_slice(&half.to_le_bytes());
        }
        let peaks = parse_waveform_pcm(&pcm, 4, 1000, 100);
        assert_eq!(peaks.len(), 1);
        assert!((peaks[0] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_parse_waveform_pcm_multiple_buckets() {
        // 8 samples at 8 Hz, bucketMs=500 => 2 buckets of 4 samples
        let mut pcm = Vec::new();
        // Bucket 0: low amplitude
        for _ in 0..4 {
            pcm.extend_from_slice(&1000i16.to_le_bytes());
        }
        // Bucket 1: high amplitude
        for _ in 0..4 {
            pcm.extend_from_slice(&i16::MAX.to_le_bytes());
        }
        let peaks = parse_waveform_pcm(&pcm, 8, 500, 100);
        assert_eq!(peaks.len(), 2);
        assert!(peaks[0] < 0.1);
        assert!((peaks[1] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_silence_detect_output_basic() {
        let stderr = r#"
[silencedetect @ 0x1234] silence_start: 1.234
[silencedetect @ 0x1234] silence_end: 3.456 | silence_duration: 2.222
"#;
        let segments = parse_silence_detect_output(stderr);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_ms, 1234);
        assert_eq!(segments[0].end_ms, 3456);
        assert_eq!(segments[0].duration_ms, 2222);
    }

    #[test]
    fn test_parse_silence_detect_output_empty() {
        let stderr = "Some random FFmpeg output\nNo silence here";
        let segments = parse_silence_detect_output(stderr);
        assert!(segments.is_empty());
    }

    #[test]
    fn test_parse_silence_detect_output_multiple() {
        let stderr = r#"
[silencedetect @ 0x1] silence_start: 1.0
[silencedetect @ 0x1] silence_end: 2.0 | silence_duration: 1.0
[silencedetect @ 0x1] silence_start: 5.0
[silencedetect @ 0x1] silence_end: 7.5 | silence_duration: 2.5
"#;
        let segments = parse_silence_detect_output(stderr);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].start_ms, 1000);
        assert_eq!(segments[1].start_ms, 5000);
        assert_eq!(segments[1].end_ms, 7500);
    }

    #[test]
    fn test_compute_keep_segments_basic() {
        let silence = vec![SilenceSegment {
            start_ms: 2000,
            end_ms: 4000,
            duration_ms: 2000,
        }];
        let keeps = compute_keep_segments(&silence, 10000, 200);
        assert_eq!(keeps.len(), 2);
        assert_eq!(keeps[0], (0, 2200));
        assert_eq!(keeps[1], (3800, 10000));
    }

    #[test]
    fn test_compute_keep_segments_no_silence() {
        let keeps = compute_keep_segments(&[], 10000, 200);
        assert_eq!(keeps.len(), 1);
        assert_eq!(keeps[0], (0, 10000));
    }

    #[test]
    fn test_find_system_ffmpeg_does_not_panic() {
        // find_system_ffmpeg() should never panic regardless of whether ffmpeg is installed
        let result = find_system_ffmpeg();
        // We can't assert Some/None since CI may or may not have ffmpeg
        // The key assertion is that we reached this line without panicking
        let _ = result;
    }

    #[test]
    fn test_find_system_ffprobe_does_not_panic() {
        let result = find_system_ffprobe();
        let _ = result;
    }

    #[test]
    fn test_find_system_binary_with_nonexistent() {
        // A binary that definitely doesn't exist should return None
        let result = find_system_binary("__nonexistent_binary_smartspec_test__");
        assert!(result.is_none());
    }

    #[test]
    fn test_get_ffmpeg_path_does_not_panic() {
        // Previously could panic on Linux — now should never panic
        let path = get_ffmpeg_path();
        // Must return a non-empty path
        assert!(!path.as_os_str().is_empty());
    }

    #[test]
    fn test_get_ffprobe_path_does_not_panic() {
        let path = get_ffprobe_path();
        assert!(!path.as_os_str().is_empty());
    }

    #[test]
    fn test_escape_subtitle_filter_path_normalizes_special_characters() {
        let escaped = escape_subtitle_filter_path("C:\\clips\\hello world.srt").unwrap();
        assert_eq!(escaped, "C\\:/clips/hello world.srt");
    }

    #[test]
    fn test_mux_subtitle_track_sync_generates_output_when_ffmpeg_available() {
        if !ffmpeg_command_available() {
            return;
        }

        let root_dir = temp_dir("softmux");
        fs::create_dir_all(&root_dir).unwrap();
        let input_video = root_dir.join("input.mp4");
        let output_video = root_dir.join("output_softmux.mp4");
        let subtitle_file = root_dir.join("captions.srt");

        create_sample_video(&input_video.to_string_lossy()).unwrap();
        fs::write(
            &subtitle_file,
            "1\n00:00:00,000 --> 00:00:00,800\nHello SmartSpec\n",
        )
        .unwrap();

        mux_subtitle_track_sync(
            &input_video.to_string_lossy(),
            &subtitle_file.to_string_lossy(),
            &output_video.to_string_lossy(),
        )
        .unwrap();

        assert!(output_video.exists());
        assert!(fs::metadata(output_video).unwrap().len() > 0);
    }

    #[test]
    fn test_burn_in_subtitle_track_sync_generates_output_when_filter_available() {
        if !ffmpeg_command_available() || !ffmpeg_supports_subtitles_filter() {
            return;
        }

        let root_dir = temp_dir("burnin");
        fs::create_dir_all(&root_dir).unwrap();
        let input_video = root_dir.join("input.mp4");
        let output_video = root_dir.join("output_burnin.mp4");
        let subtitle_file = root_dir.join("captions.srt");

        create_sample_video(&input_video.to_string_lossy()).unwrap();
        fs::write(
            &subtitle_file,
            "1\n00:00:00,000 --> 00:00:00,800\nHello Burn In\n",
        )
        .unwrap();

        burn_in_subtitle_track_sync(
            &input_video.to_string_lossy(),
            &subtitle_file.to_string_lossy(),
            &output_video.to_string_lossy(),
        )
        .unwrap();

        assert!(output_video.exists());
        assert!(fs::metadata(output_video).unwrap().len() > 0);
    }
}
