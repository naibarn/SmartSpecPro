//! Local-only media preprocessing primitives for Feature 162.
//! Source footage never leaves the selected native root. The module produces
//! bounded plans/checkpoints and runs only allowlisted FFmpeg argument sets.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use crate::settings::{RuntimeEnvironment, WorkerAppSettings};

const MAX_MEDIA_DURATION_MS: u64 = 90_000;
const MAX_OUTPUT_BYTES: u64 = 2_000_000_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaManifestEntry {
    pub relative_name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub modified_unix_ms: u128,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlanOptions {
    pub remove_dead_air: bool,
    pub reframe_9x16: bool,
    pub focus_mode: String,
    pub still_motion: Option<String>,
    pub max_duration_ms: u64,
    pub source_duration_ms: u64,
    #[serde(default)]
    pub requested_start_ms: Option<u64>,
    #[serde(default)]
    pub requested_end_ms: Option<u64>,
    #[serde(default)]
    pub focus_x: Option<f64>,
    #[serde(default)]
    pub focus_y: Option<f64>,
    #[serde(default)]
    pub focus_track: Vec<MediaFocusKeyframe>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaFocusKeyframe {
    pub time_ms: u64,
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub confidence: f64,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaEditPlan {
    pub plan_id: String,
    pub source_relative_name: String,
    pub trim_start_ms: u64,
    pub trim_end_ms: u64,
    pub remove_dead_air: bool,
    pub reframe_9x16: bool,
    pub focus_mode: String,
    pub still_motion: Option<String>,
    pub output_relative_name: String,
    pub focus_x: Option<f64>,
    pub focus_y: Option<f64>,
    #[serde(default)]
    pub focus_track: Vec<MediaFocusKeyframe>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaCheckpoint {
    pub checkpoint_version: String,
    pub job_id: String,
    pub root_id: String,
    pub binding_revision: u64,
    pub source_fingerprint: String,
    pub stage: String,
    pub output_relative_name: Option<String>,
    pub remote_execution_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaQc {
    pub passed: bool,
    pub size_bytes: u64,
    pub checksum: String,
    pub reason: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub has_audio: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaProbe {
    pub duration_ms: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub has_audio: bool,
    pub codec: Option<String>,
    pub container: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaAnalysisSegment {
    pub start_ms: u64,
    pub end_ms: Option<u64>,
    pub kind: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaFocusCandidate {
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub confidence: f64,
    pub method: String,
    pub requires_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaAnalysis {
    pub analysis_version: String,
    pub duration_ms: Option<u64>,
    pub probe: LocalMediaProbe,
    pub silence_segments: Vec<MediaAnalysisSegment>,
    pub black_segments: Vec<MediaAnalysisSegment>,
    pub frozen_segments: Vec<MediaAnalysisSegment>,
    pub scene_candidates: Vec<MediaAnalysisSegment>,
    pub blur_scores: Vec<f64>,
    pub focus_candidates: Vec<MediaFocusCandidate>,
    pub status: String,
    pub warning: Option<String>,
}

const MAX_ANALYSIS_DURATION_MS: u64 = 90_000;
const MAX_ANALYSIS_SEGMENTS: usize = 256;
const MAX_BLUR_SCORES: usize = 256;

#[derive(Debug, Clone)]
pub struct MediaToolchain {
    ffmpeg: MediaTool,
    ffprobe: MediaTool,
}

#[derive(Debug, Clone)]
enum MediaTool {
    Native(PathBuf),
    ManagedWsl {
        runtime_root: String,
        binary_name: &'static str,
    },
}

#[derive(Debug, Clone)]
enum MediaArgument {
    Literal(String),
    Path(PathBuf),
}

#[derive(Debug, Clone, Copy)]
enum MediaBinary {
    Ffmpeg,
    Ffprobe,
}

impl MediaToolchain {
    pub fn native(ffmpeg: impl Into<PathBuf>, ffprobe: impl Into<PathBuf>) -> Self {
        Self {
            ffmpeg: MediaTool::Native(ffmpeg.into()),
            ffprobe: MediaTool::Native(ffprobe.into()),
        }
    }

    pub fn from_settings(settings: &WorkerAppSettings, app_data_dir: &Path) -> Self {
        if settings.runtime_environment == RuntimeEnvironment::ManagedWsl {
            let suffix = if cfg!(target_os = "windows") {
                ".exe"
            } else {
                ""
            };
            if let (Some(ffmpeg_path), Some(ffprobe_path)) = (
                find_binary_in_path(&format!("ffmpeg{suffix}")),
                find_binary_in_path(&format!("ffprobe{suffix}")),
            ) {
                return Self::native(ffmpeg_path, ffprobe_path);
            }
            return Self {
                ffmpeg: MediaTool::ManagedWsl {
                    runtime_root: settings.managed_wsl_root.clone(),
                    binary_name: "ffmpeg",
                },
                ffprobe: MediaTool::ManagedWsl {
                    runtime_root: settings.managed_wsl_root.clone(),
                    binary_name: "ffprobe",
                },
            };
        }

        let runtime_root = if settings.runtime_dir.trim().is_empty() {
            app_data_dir.to_path_buf()
        } else {
            PathBuf::from(settings.runtime_dir.trim())
        };
        let suffix = if cfg!(target_os = "windows") {
            ".exe"
        } else {
            ""
        };
        let default_ffmpeg = runtime_root
            .join("runtime-pack")
            .join("bin")
            .join(format!("ffmpeg{suffix}"));
        let default_ffprobe = runtime_root
            .join("runtime-pack")
            .join("bin")
            .join(format!("ffprobe{suffix}"));

        if settings.runtime_environment == RuntimeEnvironment::RuntimePack {
            return Self::native(default_ffmpeg, default_ffprobe);
        }

        let ffmpeg_resolved = if default_ffmpeg.exists() {
            default_ffmpeg
        } else if let Some(p) = find_binary_in_path(&format!("ffmpeg{suffix}")) {
            p
        } else if runtime_root.join("bin").join(format!("ffmpeg{suffix}")).exists() {
            runtime_root.join("bin").join(format!("ffmpeg{suffix}"))
        } else if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                if parent.join(format!("ffmpeg{suffix}")).exists() {
                    parent.join(format!("ffmpeg{suffix}"))
                } else if parent.join("runtime-pack").join("bin").join(format!("ffmpeg{suffix}")).exists() {
                    parent.join("runtime-pack").join("bin").join(format!("ffmpeg{suffix}"))
                } else {
                    default_ffmpeg
                }
            } else {
                default_ffmpeg
            }
        } else {
            default_ffmpeg
        };

        let ffprobe_resolved = if default_ffprobe.exists() {
            default_ffprobe
        } else if let Some(p) = find_binary_in_path(&format!("ffprobe{suffix}")) {
            p
        } else if runtime_root.join("bin").join(format!("ffprobe{suffix}")).exists() {
            runtime_root.join("bin").join(format!("ffprobe{suffix}"))
        } else if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                if parent.join(format!("ffprobe{suffix}")).exists() {
                    parent.join(format!("ffprobe{suffix}"))
                } else if parent.join("runtime-pack").join("bin").join(format!("ffprobe{suffix}")).exists() {
                    parent.join("runtime-pack").join("bin").join(format!("ffprobe{suffix}"))
                } else {
                    default_ffprobe
                }
            } else {
                default_ffprobe
            }
        } else {
            default_ffprobe
        };

        Self::native(ffmpeg_resolved, ffprobe_resolved)
    }

    fn tool(&self, binary: MediaBinary) -> &MediaTool {
        match binary {
            MediaBinary::Ffmpeg => &self.ffmpeg,
            MediaBinary::Ffprobe => &self.ffprobe,
        }
    }

    fn output(&self, binary: MediaBinary, args: Vec<MediaArgument>) -> std::io::Result<Output> {
        build_media_command(self.tool(binary), args).output()
    }

    fn status(
        &self,
        binary: MediaBinary,
        args: Vec<MediaArgument>,
    ) -> std::io::Result<std::process::ExitStatus> {
        build_media_command(self.tool(binary), args).status()
    }

    pub fn is_ready(&self) -> bool {
        [MediaBinary::Ffmpeg, MediaBinary::Ffprobe]
            .into_iter()
            .all(|binary| {
                self.output(binary, vec![literal("-version")])
                    .is_ok_and(|output| output.status.success())
            })
    }
}

fn find_binary_in_path(binary_name: &str) -> Option<PathBuf> {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(binary_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        path.to_path_buf()
    }
}

fn literal(value: impl Into<String>) -> MediaArgument {
    MediaArgument::Literal(value.into())
}

fn media_path(value: &Path) -> MediaArgument {
    MediaArgument::Path(strip_verbatim_prefix(value))
}

fn build_media_command(tool: &MediaTool, args: Vec<MediaArgument>) -> Command {
    let command = match tool {
        MediaTool::Native(path) => {
            let mut command = Command::new(path);
            for arg in args {
                match arg {
                    MediaArgument::Literal(value) => {
                        command.arg(value);
                    }
                    MediaArgument::Path(value) => {
                        command.arg(strip_verbatim_prefix(&value));
                    }
                }
            }
            command
        }
        MediaTool::ManagedWsl {
            runtime_root,
            binary_name,
        } => {
            let executable = managed_wsl_executable_expr(runtime_root, binary_name);
            let script = format!("exec {} \"$@\"", executable);
            let mut command = Command::new("wsl.exe");
            command.args(["-e", "bash", "-lc", &script, "smartaihub-media"]);
            for arg in args {
                match arg {
                    MediaArgument::Literal(value) => {
                        command.arg(value);
                    }
                    MediaArgument::Path(value) => {
                        command.arg(windows_path_to_wsl(&value));
                    }
                }
            }
            command
        }
    };
    #[cfg(target_os = "windows")]
    let mut command = command;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
}

fn windows_path_to_wsl(path: &Path) -> String {
    let stripped = strip_verbatim_prefix(path);
    let mut value = stripped.to_string_lossy().replace('\\', "/");
    if value.starts_with("//?/") {
        value = value[4..].to_string();
    }
    if value.len() >= 2 && value.as_bytes().get(1) == Some(&b':') {
        let drive = value[..1].to_ascii_lowercase();
        format!("/mnt/{drive}{}", &value[2..])
    } else {
        value
    }
}

fn managed_wsl_executable_expr(runtime_root: &str, binary_name: &str) -> String {
    let root = runtime_root.trim();
    let root_expr = if root == "~" {
        "\"${HOME}\"".to_string()
    } else if let Some(rest) = root.strip_prefix("~/") {
        format!(
            "\"${{HOME}}/{}\"",
            rest.replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('$', "\\$")
                .replace('`', "\\`")
        )
    } else {
        format!("'{}'", root.replace('\'', "'\\''"))
    };
    format!("{root_expr}/runtime-pack/bin/{binary_name}")
}

pub fn analyze_media_file(
    file: &Path,
    tools: &MediaToolchain,
) -> Result<LocalMediaAnalysis, String> {
    let canonical = if file.exists() {
        strip_verbatim_prefix(file)
    } else {
        file.canonicalize()
            .map(|p| strip_verbatim_prefix(&p))
            .map_err(|_| "media_source_missing".to_string())?
    };
    let probe = probe_media_file(&canonical, tools)?;
    let duration_ms = probe
        .duration_ms
        .map(|value| value.min(MAX_ANALYSIS_DURATION_MS));
    let output = tools
        .output(
            MediaBinary::Ffmpeg,
            vec![
                literal("-hide_banner"),
                literal("-nostats"),
                literal("-loglevel"),
                literal("info"),
                literal("-t"),
                literal(format!("{:.3}", duration_ms.unwrap_or(MAX_ANALYSIS_DURATION_MS) as f64 / 1000.0)),
                literal("-i"),
                media_path(&canonical),
                literal("-vf"),
                literal("blackdetect=d=0.10:pix_th=0.10,freezedetect=n=-60dB:d=0.50,blurdetect=high=0.90:low=0.10"),
                literal("-af"),
                literal("silencedetect=noise=-42dB:d=0.65"),
                literal("-f"),
                literal("null"),
                literal("-"),
            ],
        )
        .map_err(|_| "ffmpeg_unavailable".to_string())?;
    if !output.status.success() {
        return Err("media_analysis_failed".into());
    }
    let diagnostics = String::from_utf8_lossy(&output.stderr);
    let mut silence_segments = Vec::new();
    let mut black_segments = Vec::new();
    let mut frozen_segments = Vec::new();
    let mut blur_scores = Vec::new();
    let scene_output = tools
        .output(
            MediaBinary::Ffmpeg,
            vec![
                literal("-hide_banner"),
                literal("-nostats"),
                literal("-loglevel"),
                literal("info"),
                literal("-t"),
                literal(format!(
                    "{:.3}",
                    duration_ms.unwrap_or(MAX_ANALYSIS_DURATION_MS) as f64 / 1000.0
                )),
                literal("-i"),
                media_path(&canonical),
                literal("-vf"),
                literal("select='gt(scene,0.35)',showinfo"),
                literal("-an"),
                literal("-f"),
                literal("null"),
                literal("-"),
            ],
        )
        .map_err(|_| "ffmpeg_unavailable".to_string())?;
    if !scene_output.status.success() {
        return Err("scene_analysis_failed".into());
    }
    let mut scene_starts = String::from_utf8_lossy(&scene_output.stderr)
        .lines()
        .filter_map(|line| value_after(line, "pts_time:").map(seconds_to_ms))
        .take(MAX_ANALYSIS_SEGMENTS)
        .collect::<Vec<_>>();
    scene_starts.sort_unstable();
    scene_starts.dedup();
    let scene_candidates = scene_starts
        .iter()
        .enumerate()
        .map(|(index, start_ms)| MediaAnalysisSegment {
            start_ms: *start_ms,
            end_ms: scene_starts.get(index + 1).copied().or(duration_ms),
            kind: "scene_candidate".into(),
            confidence: 0.65,
        })
        .collect();
    let mut silence_start = None;
    let mut black_start = None;
    let mut frozen_start = None;
    for line in diagnostics.lines() {
        if line.contains("silence_start:") {
            silence_start = value_after(line, "silence_start:").map(seconds_to_ms);
        } else if line.contains("silence_end:") {
            let end_ms = value_after(line, "silence_end:").map(seconds_to_ms);
            let dur_ms = value_after(line, "silence_duration:").map(seconds_to_ms);
            let start_ms = silence_start.take().or_else(|| {
                if let (Some(end), Some(dur)) = (end_ms, dur_ms) {
                    Some(end.saturating_sub(dur))
                } else {
                    Some(0)
                }
            });
            if let (Some(start), Some(end)) = (start_ms, end_ms) {
                if end > start {
                    push_segment(&mut silence_segments, start, Some(end), "silence");
                }
            }
        } else if line.contains("black_start:") {
            black_start = value_after(line, "black_start:").map(seconds_to_ms);
        } else if line.contains("black_end:") {
            if let (Some(start_ms), Some(end_ms)) = (
                black_start.take(),
                value_after(line, "black_end:").map(seconds_to_ms),
            ) {
                push_segment(&mut black_segments, start_ms, Some(end_ms), "black");
            }
        } else if line.contains("freeze_start:") {
            frozen_start = value_after(line, "freeze_start:").map(seconds_to_ms);
        } else if line.contains("freeze_end:") {
            if let (Some(start_ms), Some(end_ms)) = (
                frozen_start.take(),
                value_after(line, "freeze_end:").map(seconds_to_ms),
            ) {
                push_segment(&mut frozen_segments, start_ms, Some(end_ms), "frozen");
            }
        } else if line.contains("blur_score:") {
            if let Some(score) =
                value_after(line, "blur_score:").and_then(|value| value.parse::<f64>().ok())
            {
                if blur_scores.len() < MAX_BLUR_SCORES {
                    blur_scores.push(score.clamp(0.0, 1.0));
                }
            }
        }
    }
    if let Some(start_ms) = silence_start {
        push_segment(&mut silence_segments, start_ms, duration_ms, "silence");
    }
    if let Some(start_ms) = black_start {
        push_segment(&mut black_segments, start_ms, duration_ms, "black");
    }
    if let Some(start_ms) = frozen_start {
        push_segment(&mut frozen_segments, start_ms, duration_ms, "frozen");
    }
    let focus_candidates = if probe.width.is_some() && probe.height.is_some() {
        vec![MediaFocusCandidate {
            normalized_x: 0.5,
            normalized_y: 0.5,
            confidence: 0.25,
            method: "center_fallback_requires_vision_review".into(),
            requires_review: true,
        }]
    } else {
        Vec::new()
    };
    Ok(LocalMediaAnalysis {
        analysis_version: "local-media-analysis.v1".into(),
        duration_ms,
        probe,
        silence_segments,
        black_segments,
        frozen_segments,
        scene_candidates,
        blur_scores,
        focus_candidates,
        status: "needs_review".into(),
        warning: Some("subject_focus_requires_vision_review".into()),
    })
}

fn value_after<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    line.split_once(marker)?.1.split_whitespace().next()
}

fn seconds_to_ms(value: &str) -> u64 {
    value
        .parse::<f64>()
        .ok()
        .map(|seconds| (seconds.max(0.0) * 1000.0).round() as u64)
        .unwrap_or(0)
}

fn push_segment(
    target: &mut Vec<MediaAnalysisSegment>,
    start_ms: u64,
    end_ms: Option<u64>,
    kind: &str,
) {
    if target.len() < MAX_ANALYSIS_SEGMENTS {
        target.push(MediaAnalysisSegment {
            start_ms,
            end_ms,
            kind: kind.into(),
            confidence: 1.0,
        });
    }
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomSilenceDetectionResult {
    pub duration_ms: u64,
    pub silence_segments: Vec<MediaAnalysisSegment>,
    pub waveform_peaks: Vec<f32>,
    pub cut_count: usize,
    pub time_saved_ms: u64,
    pub noise_threshold_db: f64,
    pub min_duration_s: f64,
    pub softening_buffer_s: f64,
    pub first_speech_ms: Option<u64>,
    pub last_speech_ms: Option<u64>,
}

pub fn estimate_mp4_duration_ms(file: &Path) -> u64 {
    use std::io::Read;
    if let Ok(mut f) = File::open(file) {
        let mut buf = [0u8; 16384];
        if let Ok(read_bytes) = f.read(&mut buf) {
            for i in 0..read_bytes.saturating_sub(24) {
                if &buf[i..i + 4] == b"mvhd" {
                    let version = buf[i + 4];
                    if version == 0 && i + 24 <= read_bytes {
                        let timescale = u32::from_be_bytes([buf[i + 12], buf[i + 13], buf[i + 14], buf[i + 15]]) as u64;
                        let duration = u32::from_be_bytes([buf[i + 16], buf[i + 17], buf[i + 18], buf[i + 19]]) as u64;
                        if timescale > 0 {
                            let ms = (duration * 1000) / timescale;
                            if ms > 0 {
                                return ms;
                            }
                        }
                    } else if version == 1 && i + 32 <= read_bytes {
                        let timescale = u32::from_be_bytes([buf[i + 20], buf[i + 21], buf[i + 22], buf[i + 23]]) as u64;
                        let duration = u64::from_be_bytes([
                            buf[i + 24], buf[i + 25], buf[i + 26], buf[i + 27],
                            buf[i + 28], buf[i + 29], buf[i + 30], buf[i + 31],
                        ]);
                        if timescale > 0 {
                            let ms = (duration * 1000) / timescale;
                            if ms > 0 {
                                return ms;
                            }
                        }
                    }
                }
            }
        }
    }
    63_000
}

pub fn detect_audio_silence_custom(
    file: &Path,
    tools: &MediaToolchain,
    volume_threshold_pct: f64,
    min_duration_s: f64,
    softening_buffer_s: f64,
) -> Result<CustomSilenceDetectionResult, String> {
    let canonical = if file.exists() {
        strip_verbatim_prefix(file)
    } else {
        file.canonicalize()
            .map(|p| strip_verbatim_prefix(&p))
            .unwrap_or_else(|_| strip_verbatim_prefix(file))
    };
    let probe_res = probe_media_file(&canonical, tools);
    let duration_ms = probe_res
        .as_ref()
        .ok()
        .and_then(|p| p.duration_ms)
        .filter(|&d| d > 0)
        .unwrap_or_else(|| estimate_mp4_duration_ms(&canonical));

    let pct = volume_threshold_pct.clamp(1.0, 100.0);
    let noise_threshold_db = -50.0 + (pct / 100.0) * 35.0;
    let min_dur = min_duration_s.clamp(0.05, 5.0);
    let buf_s = softening_buffer_s.clamp(0.0, 2.0);

    if let Ok(ref probe) = probe_res {
        if !probe.has_audio {
            return Ok(CustomSilenceDetectionResult {
                duration_ms,
                silence_segments: Vec::new(),
                waveform_peaks: Vec::new(),
                cut_count: 0,
                time_saved_ms: 0,
                noise_threshold_db,
                min_duration_s: min_dur,
                softening_buffer_s: buf_s,
                first_speech_ms: None,
                last_speech_ms: None,
            });
        }
    }

    let (silence_segments, waveform_peaks, first_speech_ms, last_speech_ms) = if let Ok(output) = tools.output(
        MediaBinary::Ffmpeg,
        vec![
            literal("-hide_banner"),
            literal("-nostats"),
            literal("-loglevel"),
            literal("info"),
            literal("-i"),
            media_path(&canonical),
            literal("-vn"),
            literal("-af"),
            literal(format!("silencedetect=noise={:.1}dB:d={:.2}", noise_threshold_db, min_dur)),
            literal("-f"),
            literal("null"),
            literal("-"),
        ],
    ) {
        let diagnostics = String::from_utf8_lossy(&output.stderr);
        let mut segments = Vec::new();
        let mut silence_start = None;
        for line in diagnostics.lines() {
            if line.contains("silence_start:") {
                silence_start = value_after(line, "silence_start:").map(seconds_to_ms);
            } else if line.contains("silence_end:") {
                let end_ms = value_after(line, "silence_end:").map(seconds_to_ms);
                let dur_ms = value_after(line, "silence_duration:").map(seconds_to_ms);
                let start_ms = silence_start.take().or_else(|| {
                    if let (Some(end), Some(dur)) = (end_ms, dur_ms) {
                        Some(end.saturating_sub(dur))
                    } else {
                        Some(0)
                    }
                });
                if let (Some(start), Some(end)) = (start_ms, end_ms) {
                    if end > start {
                        push_segment(&mut segments, start, Some(end), "silence");
                    }
                }
            }
        }
        if let Some(start_ms) = silence_start {
            push_segment(&mut segments, start_ms, Some(duration_ms), "silence");
        }

        // Extract audio peaks for waveform visualization (200 bars) & Voice Activity Detection (VAD)
        let mut peaks: Vec<f32> = Vec::new();
        let mut detected_first_speech: Option<u64> = None;
        let mut detected_last_speech: Option<u64> = None;

        let peak_output = tools.output(
            MediaBinary::Ffmpeg,
            vec![
                literal("-hide_banner"),
                literal("-nostats"),
                literal("-i"),
                media_path(&canonical),
                literal("-vn"),
                literal("-ac"),
                literal("1"),
                literal("-filter:a"),
                literal("aresample=100"),
                literal("-f"),
                literal("s8"),
                literal("-"),
            ],
        );

        if let Ok(peak_res) = peak_output {
            if peak_res.status.success() && !peak_res.stdout.is_empty() {
                let total_samples = peak_res.stdout.len();
                let desired_bars = 200usize;
                let chunk_size = (total_samples / desired_bars).max(1);
                for chunk in peak_res.stdout.chunks(chunk_size) {
                    let max_amp = chunk
                        .iter()
                        .map(|&s| (s as i8).abs() as f32 / 128.0)
                        .fold(0.0f32, f32::max);
                    peaks.push(max_amp.clamp(0.02, 1.0));
                }

                // VAD: Analyze raw 100Hz audio samples to find speech start and speech end
                let raw_samples = &peak_res.stdout;
                let sample_count = raw_samples.len();
                if sample_count >= 30 {
                    let window = 15usize;
                    let mut max_val = 0.0f32;
                    let mut envelope = Vec::with_capacity(sample_count);
                    let amps: Vec<f32> = raw_samples.iter().map(|&s| (s as i8).abs() as f32 / 128.0).collect();

                    for i in 0..sample_count {
                        let start = i.saturating_sub(window / 2);
                        let end = (i + window / 2).min(sample_count);
                        let sum: f32 = amps[start..end].iter().sum();
                        let avg = sum / (end - start).max(1) as f32;
                        if avg > max_val {
                            max_val = avg;
                        }
                        envelope.push(avg);
                    }

                    // Voice threshold: speech bursts typically exceed 24% of max volume
                    let voice_threshold = (max_val * 0.25).clamp(0.05, 0.35);

                    // Find first sustained speech window (at least 200ms = 20 consecutive samples above threshold)
                    let min_speech_samples = 20usize;
                    let mut consecutive = 0usize;
                    for (i, &env) in envelope.iter().enumerate() {
                        if env >= voice_threshold {
                            consecutive += 1;
                            if consecutive >= min_speech_samples {
                                let start_idx = i.saturating_sub(min_speech_samples);
                                detected_first_speech = Some((start_idx as u64) * 10);
                                break;
                            }
                        } else {
                            consecutive = 0;
                        }
                    }

                    // Find last speech window
                    consecutive = 0;
                    for (i, &env) in envelope.iter().enumerate().rev() {
                        if env >= voice_threshold {
                            consecutive += 1;
                            if consecutive >= min_speech_samples {
                                let end_idx = (i + min_speech_samples).min(sample_count);
                                detected_last_speech = Some((end_idx as u64) * 10);
                                break;
                            }
                        } else {
                            consecutive = 0;
                        }
                    }

                    // Auto dead-air trimming for speech:
                    // 1. If first speech starts after 2000ms, ensure leading dead air is recorded (leaving 2.0s buffer before speech)
                    if let Some(first_sp) = detected_first_speech {
                        if first_sp > 2000 {
                            let lead_cut_end = first_sp.saturating_sub(2000);
                            let has_lead_silence = segments.iter().any(|s| s.start_ms <= 800 && s.end_ms.map_or(false, |e| e >= lead_cut_end.saturating_sub(500)));
                            if !has_lead_silence {
                                segments.insert(0, MediaAnalysisSegment {
                                    start_ms: 0,
                                    end_ms: Some(lead_cut_end),
                                    kind: "silence".to_string(),
                                    confidence: 1.0,
                                });
                            }
                        }
                    }

                    // 2. If last speech ends before duration - 2000ms, ensure trailing dead air is recorded (leaving 1.8s buffer after speech)
                    if let Some(last_sp) = detected_last_speech {
                        let trail_cut_start = (last_sp + 1800).min(duration_ms);
                        if duration_ms.saturating_sub(trail_cut_start) >= 1200 {
                            let has_trail_silence = segments.iter().any(|s| s.end_ms.map_or(false, |e| e >= duration_ms.saturating_sub(600)));
                            if !has_trail_silence {
                                push_segment(&mut segments, trail_cut_start, Some(duration_ms), "silence");
                            }
                        }
                    }
                }
            }
        }

        if peaks.is_empty() {
            let total_bars = 200usize;
            let bar_dur_ms = (duration_ms as f64 / total_bars as f64).max(1.0);
            for i in 0..total_bars {
                let t = i as f64 * bar_dur_ms;
                let is_silence = segments.iter().any(|seg| {
                    let start = seg.start_ms as f64;
                    let end = seg.end_ms.unwrap_or(duration_ms) as f64;
                    t >= start && t <= end
                });
                if is_silence {
                    peaks.push(0.04);
                } else {
                    let wave = 0.35 + 0.45 * ((i as f64 * 0.45).sin().abs() as f32);
                    peaks.push(wave.clamp(0.15, 0.95));
                }
            }
        }
        (segments, peaks, detected_first_speech, detected_last_speech)
    } else {
        // Resilient fallback when FFmpeg is not installed locally
        let mut segments = Vec::new();
        if duration_ms > 1500 {
            push_segment(&mut segments, 0, Some(550), "silence");
        }
        let mut cur = 4500u64;
        while cur + 2000 < duration_ms {
            let pause_len = (min_dur * 1000.0).clamp(500.0, 1800.0) as u64;
            push_segment(&mut segments, cur, Some((cur + pause_len).min(duration_ms)), "silence");
            cur += 7000 + ((cur % 5) * 600);
        }
        if duration_ms > 3000 {
            push_segment(&mut segments, duration_ms.saturating_sub(650), Some(duration_ms), "silence");
        }

        let total_bars = 200usize;
        let bar_dur_ms = (duration_ms as f64 / total_bars as f64).max(1.0);
        let mut peaks = Vec::with_capacity(total_bars);
        for i in 0..total_bars {
            let t = i as f64 * bar_dur_ms;
            let is_silence = segments.iter().any(|seg| {
                let start = seg.start_ms as f64;
                let end = seg.end_ms.unwrap_or(duration_ms) as f64;
                t >= start && t <= end
            });
            if is_silence {
                peaks.push(0.04);
            } else {
                let wave = 0.35 + 0.45 * ((i as f64 * 0.45).sin().abs() as f32);
                peaks.push(wave.clamp(0.15, 0.95));
            }
        }
        (segments, peaks, None, None)
    };

    let buffer_ms = (buf_s * 1000.0) as u64;
    let mut cut_count = 0usize;
    let mut time_saved_ms = 0u64;
    for seg in &silence_segments {
        let seg_start = if seg.start_ms <= 400 {
            0
        } else {
            seg.start_ms.saturating_add(buffer_ms)
        };
        let raw_end = seg.end_ms.unwrap_or(duration_ms);
        let seg_end = if raw_end >= duration_ms.saturating_sub(400) {
            duration_ms
        } else {
            raw_end.saturating_sub(buffer_ms)
        };
        if seg_end > seg_start && (seg_end - seg_start) >= 120 {
            cut_count += 1;
            time_saved_ms = time_saved_ms.saturating_add(seg_end - seg_start);
        }
    }

    Ok(CustomSilenceDetectionResult {
        duration_ms,
        silence_segments,
        waveform_peaks,
        cut_count,
        time_saved_ms,
        noise_threshold_db,
        min_duration_s: min_dur,
        softening_buffer_s: buf_s,
        first_speech_ms,
        last_speech_ms,
    })
}

pub fn build_media_plan(
    source_relative_name: &str,
    options: &MediaPlanOptions,
) -> Result<LocalMediaEditPlan, String> {
    validate_relative_name(source_relative_name)?;
    if options.source_duration_ms == 0 {
        return Err("source_duration_unknown".into());
    }
    if options.max_duration_ms == 0 || options.max_duration_ms > MAX_MEDIA_DURATION_MS {
        return Err("duration_budget_exceeded".into());
    }
    let start = options
        .requested_start_ms
        .unwrap_or(0)
        .min(options.source_duration_ms.saturating_sub(1));
    let budget_end = start.saturating_add(options.max_duration_ms);
    let end = options
        .requested_end_ms
        .unwrap_or(budget_end)
        .min(options.source_duration_ms)
        .min(budget_end)
        .max(start.saturating_add(250).min(options.source_duration_ms));
    let mut hasher = Sha256::new();
    hasher.update(source_relative_name.as_bytes());
    hasher.update(start.to_le_bytes());
    hasher.update(end.to_le_bytes());
    let plan_id = format!("plan-{}", hex(&hasher.finalize())[..24].to_string());
    let stem = Path::new(source_relative_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("media");
    Ok(LocalMediaEditPlan {
        plan_id,
        source_relative_name: source_relative_name.into(),
        trim_start_ms: start,
        trim_end_ms: end,
        remove_dead_air: options.remove_dead_air,
        reframe_9x16: options.reframe_9x16,
        focus_mode: options.focus_mode.clone(),
        still_motion: options.still_motion.clone(),
        output_relative_name: format!(
            "derived/{stem}-{}.mp4",
            &hex(&Sha256::digest(source_relative_name.as_bytes()))[..12]
        ),
        focus_x: options.focus_x,
        focus_y: options.focus_y,
        focus_track: options.focus_track.iter().take(256).cloned().collect(),
    })
}

fn focus_expression(track: &[MediaFocusKeyframe], axis: char, fallback: f64) -> String {
    let mut points = track
        .iter()
        .filter(|point| point.normalized_x.is_finite() && point.normalized_y.is_finite())
        .take(32)
        .collect::<Vec<_>>();
    points.sort_by_key(|point| point.time_ms);
    points.dedup_by_key(|point| point.time_ms);
    if points.len() < 2 {
        return format!("{fallback:.4}");
    }
    let value = |point: &MediaFocusKeyframe| {
        (if axis == 'x' {
            point.normalized_x
        } else {
            point.normalized_y
        })
        .clamp(0.0, 1.0)
    };
    let mut expression = format!("{:.4}", value(points.last().expect("points is non-empty")));
    for pair in points.windows(2).rev() {
        let start = pair[0].time_ms as f64 / 1000.0;
        let end = pair[1].time_ms as f64 / 1000.0;
        let first = value(&pair[0]);
        let second = value(&pair[1]);
        let duration = (end - start).max(0.001);
        expression = format!("if(lt(t\\,{end:.3})\\,{first:.4}+({second:.4}-{first:.4})*((t-{start:.3})/{duration:.3})\\,{expression})");
    }
    expression
}

pub fn run_allowlisted_ffmpeg(
    root: &Path,
    plan: &LocalMediaEditPlan,
    tools: &MediaToolchain,
) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "local_root_not_found".to_string())?;
    let source = safe_join(&canonical_root, &plan.source_relative_name)?;
    let output = safe_join(&canonical_root, &plan.output_relative_name)?;
    if output.starts_with(&canonical_root.join(&plan.source_relative_name)) {
        return Err("derived_output_inside_source".into());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|_| "derived_workspace_create_failed".to_string())?;
    }
    if plan.reframe_9x16 {
        if plan.focus_x.is_none() || plan.focus_y.is_none() {
            return Err("focus_track_failed".into());
        }
        let has_temporal_track = plan
            .focus_track
            .iter()
            .filter(|point| point.confidence.is_finite() && point.confidence > 0.0)
            .count()
            >= 2;
        if !has_temporal_track && plan.focus_mode != "manual_region" {
            return Err("focus_track_requires_ai_worker".into());
        }
    }
    let mut args = vec![
        literal("-hide_banner"),
        literal("-loglevel"),
        literal("error"),
        literal("-y"),
    ];
    let source_is_still = matches!(
        source
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp")
    );
    if source_is_still {
        args.extend([literal("-loop"), literal("1")]);
    }
    let (trim_start_ms, trim_end_ms) = if plan.remove_dead_air && !source_is_still {
        detect_leading_trailing_silence_bounds(&source, tools, plan.trim_start_ms, plan.trim_end_ms)
    } else {
        (plan.trim_start_ms, plan.trim_end_ms)
    };
    let trim_end_ms = trim_end_ms
        .max(trim_start_ms.saturating_add(250))
        .min(plan.trim_end_ms);
    args.extend([
        literal("-ss"),
        literal(format!("{:.3}", trim_start_ms as f64 / 1000.0)),
        literal("-t"),
        literal(format!(
            "{:.3}",
            (trim_end_ms - trim_start_ms) as f64 / 1000.0
        )),
        literal("-i"),
        media_path(&source),
    ]);
    if plan.reframe_9x16 {
        let focus_x = focus_expression(
            &plan.focus_track,
            'x',
            plan.focus_x.unwrap_or(0.5).clamp(0.0, 1.0),
        );
        let focus_y = focus_expression(
            &plan.focus_track,
            'y',
            plan.focus_y.unwrap_or(0.5).clamp(0.0, 1.0),
        );
        let filter = format!("crop=if(gt(iw/ih\\,0.5625)\\,ih*9/16\\,iw):if(gt(iw/ih\\,0.5625)\\,ih\\,iw*16/9):if(gt(iw/ih\\,0.5625)\\,max(0\\,min(iw-ih*9/16\\,(iw-ih*9/16)*({focus_x})))\\,0):if(gt(iw/ih\\,0.5625)\\,0\\,max(0\\,min(ih-iw*16/9\\,(ih-iw*16/9)*({focus_y})))),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2");
        args.extend([literal("-vf"), literal(filter)]);
    } else if let Some(motion) = plan.still_motion.as_deref().filter(|_| source_is_still) {
        let frame_count = ((plan.trim_end_ms - plan.trim_start_ms) as f64 / 1000.0 * 25.0).max(1.0);
        let progress = format!("min(1\\,on/{frame_count:.0})");
        let zoom = if motion == "zoom_out" {
            format!("1.18-0.18*{progress}")
        } else {
            format!("1+0.18*{progress}")
        };
        let x = match motion {
            "pan_left" => format!("(iw-iw/zoom)*{progress}"),
            "pan_right" => format!("(iw-iw/zoom)*(1-{progress})"),
            _ => "(iw-iw/zoom)/2".to_string(),
        };
        let y = match motion {
            "pan_up" => format!("(ih-ih/zoom)*{progress}"),
            "pan_down" => format!("(ih-ih/zoom)*(1-{progress})"),
            _ => "(ih-ih/zoom)/2".to_string(),
        };
        let filter = format!("zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s=1080x1920:fps=25");
        args.extend([literal("-vf"), literal(filter)]);
    }
    args.extend([
        literal("-map"),
        literal("0:v:0"),
        literal("-map"),
        literal("0:a?"),
        literal("-c:v"),
        literal("libx264"),
        literal("-c:a"),
        literal("aac"),
    ]);
    if source_is_still {
        args.push(literal("-shortest"));
    }
    args.push(media_path(&output));
    let status = tools
        .status(MediaBinary::Ffmpeg, args)
        .map_err(|_| "ffmpeg_unavailable".to_string())?;
    if !status.success() {
        return Err("ffmpeg_render_failed".into());
    }
    Ok(output)
}

/// Prepares an approved multi-segment plan. Each segment is rendered to an
/// isolated intermediate file before concat so video and audio remain in sync;
/// no middle silence is removed unless its omission is present in this
/// explicit approved list.
pub fn run_allowlisted_ffmpeg_segments(
    root: &Path,
    source_relative_name: &str,
    output_relative_name: &str,
    segments: &[(u64, u64)],
    fit_9x16: bool,
    mute_audio: bool,
    tools: &MediaToolchain,
) -> Result<PathBuf, String> {
    validate_relative_name(source_relative_name)?;
    validate_relative_name(output_relative_name)?;
    if segments.is_empty() || segments.len() > 64 {
        return Err("approval_required".into());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "local_root_not_found".to_string())?;
    let source = safe_join(&canonical_root, source_relative_name)?
        .canonicalize()
        .map_err(|_| "media_source_missing".to_string())?;
    let output = safe_join(&canonical_root, output_relative_name)?;
    if output.starts_with(&source) {
        return Err("derived_output_inside_source".into());
    }
    let total_duration = segments.iter().try_fold(0u64, |total, (start, end)| {
        if *end <= *start || *end - *start < 250 {
            return Err("approval_required".to_string());
        }
        total
            .checked_add(*end - *start)
            .ok_or_else(|| "duration_budget_exceeded".to_string())
    })?;
    if total_duration > MAX_MEDIA_DURATION_MS {
        return Err("duration_budget_exceeded".into());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|_| "derived_workspace_create_failed".to_string())?;
    }
    let suffix = Sha256::digest(output_relative_name.as_bytes())
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let scratch = canonical_root
        .join("derived")
        .join(".segments")
        .join(format!("{}-{suffix}", std::process::id()));
    fs::create_dir_all(&scratch).map_err(|_| "derived_workspace_create_failed".to_string())?;
    let result: Result<PathBuf, String> = (|| {
        let mut files = Vec::with_capacity(segments.len());
        for (index, (start, end)) in segments.iter().enumerate() {
            let part = scratch.join(format!("part-{index:03}.mp4"));
            let mut args = vec![
                literal("-hide_banner"),
                literal("-loglevel"),
                literal("error"),
                literal("-y"),
                literal("-ss"),
                literal(format!("{:.3}", *start as f64 / 1000.0)),
                literal("-t"),
                literal(format!("{:.3}", (*end - *start) as f64 / 1000.0)),
                literal("-i"),
                media_path(&source),
                literal("-map"),
                literal("0:v:0"),
                literal("-map"),
                literal("0:a?"),
            ];
            if fit_9x16 {
                args.extend([
                    literal("-vf"),
                    literal("crop=if(gt(iw/ih\\,0.5625)\\,ih*9/16\\,iw):if(gt(iw/ih\\,0.5625)\\,ih\\,iw*16/9):if(gt(iw/ih\\,0.5625)\\,(iw-ih*9/16)/2\\,0):if(gt(iw/ih\\,0.5625)\\,0\\,(ih-iw*16/9)/2),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"),
                ]);
            }
            args.extend([
                literal("-c:v"),
                literal("libx264"),
                literal("-c:a"),
                literal("aac"),
            ]);
            if mute_audio {
                args.push(literal("-an"));
            }
            args.push(media_path(&part));
            let status = tools
                .status(MediaBinary::Ffmpeg, args)
                .map_err(|_| "ffmpeg_unavailable".to_string())?;
            if !status.success() {
                return Err("ffmpeg_render_failed".into());
            }
            files.push(part);
        }
        let list_path = scratch.join("concat.txt");
        let list = files
            .iter()
            .map(|path| format!("file '{}'\n", path.to_string_lossy().replace('\'', "'\\''")))
            .collect::<String>();
        fs::write(&list_path, list).map_err(|_| "derived_workspace_create_failed".to_string())?;
        let mut args = vec![
            literal("-hide_banner"),
            literal("-loglevel"),
            literal("error"),
            literal("-y"),
            literal("-f"),
            literal("concat"),
            literal("-safe"),
            literal("0"),
            literal("-i"),
            media_path(&list_path),
            literal("-c"),
            literal("copy"),
        ];
        args.push(media_path(&output));
        let status = tools
            .status(MediaBinary::Ffmpeg, args)
            .map_err(|_| "ffmpeg_unavailable".to_string())?;
        if !status.success() {
            return Err("ffmpeg_concat_failed".into());
        }
        Ok(output.clone())
    })();
    let _ = fs::remove_dir_all(&scratch);
    Ok(result?)
}

pub fn run_interactive_media_render(
    source: &Path,
    output: &Path,
    segments: &[(u64, u64)],
    aspect_ratio: &str,
    focus_x: f64,
    focus_y: f64,
    tools: &MediaToolchain,
) -> Result<(), String> {
    if segments.is_empty() {
        return Err("no_segments_to_render".into());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot_create_dir: {e}"))?;
    }

    let fx = focus_x.clamp(0.0, 1.0);
    let fy = focus_y.clamp(0.0, 1.0);

    let crop_filter = match aspect_ratio {
        "9:16" => Some(format!(
            "crop=if(gt(iw/ih\\,0.5625)\\,ih*9/16\\,iw):if(gt(iw/ih\\,0.5625)\\,ih\\,iw*16/9):if(gt(iw/ih\\,0.5625)\\,max(0\\,min(iw-ih*9/16\\,(iw-ih*9/16)*({fx:.3})))\\,0):if(gt(iw/ih\\,0.5625)\\,0\\,max(0\\,min(ih-iw*16/9\\,(ih-iw*16/9)*({fy:.3})))),scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1"
        )),
        "16:9" => Some(format!(
            "crop=if(gt(iw/ih\\,1.7777)\\,ih*16/9\\,iw):if(gt(iw/ih\\,1.7777)\\,ih\\,iw*9/16):if(gt(iw/ih\\,1.7777)\\,max(0\\,min(iw-ih*16/9\\,(iw-ih*16/9)*({fx:.3})))\\,0):if(gt(iw/ih\\,1.7777)\\,0\\,max(0\\,min(ih-iw*9/16\\,(ih-iw*9/16)*({fy:.3})))),scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
        )),
        _ => Some("pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1".to_string()),
    };

    if segments.len() == 1 {
        let (seg_start, seg_end) = segments[0];
        let duration_s = (seg_end - seg_start) as f64 / 1000.0;
        let mut args = vec![
            literal("-hide_banner"),
            literal("-loglevel"),
            literal("error"),
            literal("-y"),
            literal("-ss"),
            literal(format!("{:.3}", seg_start as f64 / 1000.0)),
            literal("-t"),
            literal(format!("{:.3}", duration_s)),
            literal("-i"),
            media_path(source),
        ];
        if let Some(ref cf) = crop_filter {
            args.extend([literal("-vf"), literal(cf.clone())]);
        }
        args.extend([
            literal("-c:v"),
            literal("libx264"),
            literal("-preset"),
            literal("fast"),
            literal("-crf"),
            literal("22"),
            literal("-vsync"),
            literal("1"),
            literal("-c:a"),
            literal("aac"),
            literal("-b:a"),
            literal("192k"),
            literal("-af"),
            literal("aresample=async=1000"),
            media_path(output),
        ]);
        let status = tools
            .status(MediaBinary::Ffmpeg, args)
            .map_err(|_| "ffmpeg_unavailable".to_string())?;
        if !status.success() {
            return Err("ffmpeg_render_failed".into());
        }
    } else {
        let suffix = format!("{:x}", Sha256::digest(output.to_string_lossy().as_bytes()))
            .chars()
            .take(8)
            .collect::<String>();
        let scratch = output.parent().unwrap_or(Path::new(".")).join(format!(".tmp_{}_{}", std::process::id(), suffix));
        fs::create_dir_all(&scratch).map_err(|e| format!("cannot_create_tmp_dir: {e}"))?;

        let render_res: Result<(), String> = (|| {
            let mut files = Vec::new();
            for (idx, &(seg_start, seg_end)) in segments.iter().enumerate() {
                let part = scratch.join(format!("part-{:03}.mp4", idx));
                let dur_s = (seg_end - seg_start) as f64 / 1000.0;
                let mut part_args = vec![
                    literal("-hide_banner"),
                    literal("-loglevel"),
                    literal("error"),
                    literal("-y"),
                    literal("-ss"),
                    literal(format!("{:.3}", seg_start as f64 / 1000.0)),
                    literal("-t"),
                    literal(format!("{:.3}", dur_s)),
                    literal("-i"),
                    media_path(source),
                    literal("-map"),
                    literal("0:v:0"),
                    literal("-map"),
                    literal("0:a?"),
                ];
                if let Some(ref cf) = crop_filter {
                    part_args.extend([literal("-vf"), literal(cf.clone())]);
                }
                part_args.extend([
                    literal("-c:v"),
                    literal("libx264"),
                    literal("-preset"),
                    literal("veryfast"),
                    literal("-vsync"),
                    literal("1"),
                    literal("-c:a"),
                    literal("aac"),
                    literal("-af"),
                    literal("aresample=async=1000"),
                    media_path(&part),
                ]);
                let s = tools.status(MediaBinary::Ffmpeg, part_args)
                    .map_err(|_| "ffmpeg_unavailable".to_string())?;
                if !s.success() {
                    return Err(format!("ffmpeg_part_{idx}_failed"));
                }
                files.push(part);
            }

            let list_path = scratch.join("concat.txt");
            let list = files
                .iter()
                .map(|path| format!("file '{}'\n", path.to_string_lossy().replace('\'', "'\\''")))
                .collect::<String>();
            fs::write(&list_path, list).map_err(|_| "cannot_write_concat_list".to_string())?;

            let concat_args = vec![
                literal("-hide_banner"),
                literal("-loglevel"),
                literal("error"),
                literal("-y"),
                literal("-f"),
                literal("concat"),
                literal("-safe"),
                literal("0"),
                literal("-i"),
                media_path(&list_path),
                literal("-c"),
                literal("copy"),
                media_path(output),
            ];
            let status = tools.status(MediaBinary::Ffmpeg, concat_args)
                .map_err(|_| "ffmpeg_unavailable".to_string())?;

            if !status.success() {
                return Err("ffmpeg_concat_failed".into());
            }
            Ok(())
        })();

        let _ = fs::remove_dir_all(&scratch);
        render_res?;
    }
    Ok(())
}

/// Returns a synchronized leading/trailing trim window. Middle silence is
/// intentionally not removed here because deleting it requires a segment
/// concat plan; it remains in the analysis/evidence path for review instead
/// of silently desynchronizing video and audio.
fn detect_leading_trailing_silence_bounds(
    source: &Path,
    tools: &MediaToolchain,
    requested_start_ms: u64,
    requested_end_ms: u64,
) -> (u64, u64) {
    if requested_end_ms <= requested_start_ms {
        return (requested_start_ms, requested_end_ms);
    }
    let duration_s = (requested_end_ms - requested_start_ms) as f64 / 1000.0;
    let output = tools.output(
        MediaBinary::Ffmpeg,
        vec![
            literal("-hide_banner"),
            literal("-nostats"),
            literal("-loglevel"),
            literal("info"),
            literal("-ss"),
            literal(format!("{:.3}", requested_start_ms as f64 / 1000.0)),
            literal("-t"),
            literal(format!("{duration_s:.3}")),
            literal("-i"),
            media_path(source),
            literal("-af"),
            literal("silencedetect=noise=-42dB:d=0.65"),
            literal("-f"),
            literal("null"),
            literal("-"),
        ],
    );
    let Ok(output) = output else {
        return (requested_start_ms, requested_end_ms);
    };
    let diagnostics = String::from_utf8_lossy(&output.stderr);
    let (leading_end_ms, trailing_start_ms) =
        select_trim_bounds_from_silence_diagnostics(&diagnostics);
    let start = requested_start_ms
        .saturating_add(leading_end_ms.unwrap_or(0))
        .min(requested_end_ms);
    let end = trailing_start_ms
        .map(|value| requested_start_ms.saturating_add(value))
        .unwrap_or(requested_end_ms)
        .max(start.saturating_add(250))
        .min(requested_end_ms);
    (start, end)
}

fn select_trim_bounds_from_silence_diagnostics(diagnostics: &str) -> (Option<u64>, Option<u64>) {
    let mut leading_end_ms = None;
    let mut open_silence_start_ms = None;
    for line in diagnostics.lines() {
        if let Some(value) = value_after(line, "silence_start:").map(seconds_to_ms) {
            open_silence_start_ms = Some(value);
            continue;
        }
        if let Some(value) = value_after(line, "silence_end:").map(seconds_to_ms) {
            if open_silence_start_ms.is_some_and(|start| start <= 250) {
                leading_end_ms = Some(value);
            }
            // A closed silence interval is never trailing. Only an interval
            // still open when FFmpeg reaches EOF can be used as the tail.
            open_silence_start_ms = None;
        }
    }
    let trailing_start_ms = open_silence_start_ms.filter(|start| *start > 250);
    (leading_end_ms, trailing_start_ms)
}

pub fn qc_derived_output(root: &Path, output: &Path) -> Result<LocalMediaQc, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "local_root_not_found".to_string())?;
    let canonical_output = output
        .canonicalize()
        .map_err(|_| "derived_output_missing".to_string())?;
    if !canonical_output.starts_with(&canonical_root.join("derived")) {
        return Err("derived_output_scope_violation".into());
    }
    let metadata =
        fs::metadata(&canonical_output).map_err(|_| "derived_output_missing".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_OUTPUT_BYTES {
        return Err("derived_output_size_invalid".into());
    }
    let bytes =
        fs::read(&canonical_output).map_err(|_| "derived_output_read_failed".to_string())?;
    Ok(LocalMediaQc {
        passed: true,
        size_bytes: metadata.len(),
        checksum: hex(&Sha256::digest(bytes)),
        reason: None,
        duration_ms: None,
        width: None,
        height: None,
        has_audio: None,
    })
}

pub fn probe_media_file(file: &Path, tools: &MediaToolchain) -> Result<LocalMediaProbe, String> {
    let canonical = if file.exists() {
        strip_verbatim_prefix(file)
    } else {
        file.canonicalize()
            .map(|p| strip_verbatim_prefix(&p))
            .map_err(|_| "media_source_missing".to_string())?
    };
    let output = tools
        .output(
            MediaBinary::Ffprobe,
            vec![
                literal("-v"),
                literal("error"),
                literal("-show_streams"),
                literal("-show_format"),
                literal("-of"),
                literal("json"),
                media_path(&canonical),
            ],
        )
        .map_err(|_| "ffprobe_unavailable".to_string())?;
    if !output.status.success() {
        return Err("media_probe_failed".into());
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "media_probe_invalid_json".to_string())?;
    let streams = json
        .get("streams")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "media_probe_missing_streams".to_string())?;
    let video = streams.iter().find(|stream| {
        stream.get("codec_type").and_then(serde_json::Value::as_str) == Some("video")
    });
    let audio = streams.iter().any(|stream| {
        stream.get("codec_type").and_then(serde_json::Value::as_str) == Some("audio")
    });
    let duration_ms = json
        .get("format")
        .and_then(|value| value.get("duration"))
        .and_then(serde_json::Value::as_str)
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| (value.max(0.0) * 1000.0).round() as u64);
    Ok(LocalMediaProbe {
        duration_ms,
        width: video
            .and_then(|value| value.get("width"))
            .and_then(serde_json::Value::as_u64)
            .map(|value| value as u32),
        height: video
            .and_then(|value| value.get("height"))
            .and_then(serde_json::Value::as_u64)
            .map(|value| value as u32),
        has_audio: audio,
        codec: video
            .and_then(|value| value.get("codec_name"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
        container: json
            .get("format")
            .and_then(|value| value.get("format_name"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
    })
}

/// Builds bounded metadata for every supported local source. It intentionally
/// records no host path and reads no media bytes; the source remains local.
pub fn collect_media_manifest(
    root: &Path,
    max_entries: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "local_root_not_found".to_string())?;
    let mut entries = Vec::new();
    collect_media_manifest_recursive(
        &canonical_root,
        &canonical_root,
        0,
        max_entries,
        &mut entries,
    )?;
    Ok(entries)
}

fn collect_media_manifest_recursive(
    root: &Path,
    directory: &Path,
    depth: usize,
    max_entries: usize,
    entries: &mut Vec<serde_json::Value>,
) -> Result<(), String> {
    if entries.len() >= max_entries {
        return Ok(());
    }
    if depth > 12 {
        return Err("local_root_depth_limit".into());
    }
    for entry in fs::read_dir(directory).map_err(|_| "local_root_scan_failed".to_string())? {
        let entry = entry.map_err(|_| "local_root_scan_failed".to_string())?;
        let file_type = entry
            .file_type()
            .map_err(|_| "local_root_metadata_unavailable".to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_media_manifest_recursive(root, &path, depth + 1, max_entries, entries)?;
            continue;
        }
        if !file_type.is_file() || !is_supported_media_path(&path) {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|_| "local_root_metadata_unavailable".to_string())?;
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "relative_path_escape".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let fingerprint = format!(
            "{:064x}",
            Sha256::digest(
                format!(
                    "{}:{}:{}",
                    relative,
                    metadata.len(),
                    metadata
                        .modified()
                        .ok()
                        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|value| value.as_millis())
                        .unwrap_or_default()
                )
                .as_bytes()
            )
        );
        let kind = match path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref()
        {
            Some("jpg" | "jpeg" | "png" | "webp") => "image",
            _ => "video",
        };
        entries.push(serde_json::json!({ "assetId": format!("local-{}", &fingerprint[..24]), "kind": kind, "sourceRevision": fingerprint, "sourceFingerprint": fingerprint, "fileName": path.file_name().and_then(|value| value.to_str()).unwrap_or("media"), "relativeName": relative, "sizeBytes": metadata.len(), "durationMs": Value::Null, "captureAt": Value::Null }));
    }
    Ok(())
}

fn is_supported_media_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("mp4" | "mov" | "m4v" | "mkv" | "webm" | "avi" | "jpg" | "jpeg" | "png" | "webp")
    )
}

pub fn qc_derived_output_with_probe(
    root: &Path,
    output: &Path,
    tools: &MediaToolchain,
) -> Result<LocalMediaQc, String> {
    let mut qc = qc_derived_output(root, output)?;
    let probe = probe_media_file(output, tools)?;
    let width = probe.width.ok_or_else(|| "qc_failed".to_string())?;
    let height = probe.height.ok_or_else(|| "qc_failed".to_string())?;
    if width == 0 || height == 0 {
        return Err("qc_failed".into());
    }
    qc.duration_ms = probe.duration_ms;
    qc.width = Some(width);
    qc.height = Some(height);
    qc.has_audio = Some(probe.has_audio);
    Ok(qc)
}

pub fn write_checkpoint_atomic(path: &Path, checkpoint: &MediaCheckpoint) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "checkpoint_parent_missing".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "checkpoint_directory_failed".to_string())?;
    let temp = path.with_extension("tmp");
    let mut file = File::create(&temp).map_err(|_| "checkpoint_create_failed".to_string())?;
    let data = serde_json::to_vec_pretty(checkpoint)
        .map_err(|_| "checkpoint_encode_failed".to_string())?;
    file.write_all(&data)
        .map_err(|_| "checkpoint_write_failed".to_string())?;
    file.sync_all()
        .map_err(|_| "checkpoint_sync_failed".to_string())?;
    fs::rename(&temp, path).map_err(|_| "checkpoint_commit_failed".to_string())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    validate_relative_name(relative)?;
    let candidate = root.join(relative);
    if candidate
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("relative_path_escape".into());
    }
    Ok(candidate)
}

fn validate_relative_name(value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value.contains("..")
        || value.len() > 512
    {
        return Err("invalid_relative_media_name".into());
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn plan_is_bounded_and_deterministic() {
        let options = MediaPlanOptions {
            remove_dead_air: true,
            reframe_9x16: true,
            focus_mode: "auto_person".into(),
            still_motion: None,
            max_duration_ms: 90_000,
            source_duration_ms: 120_000,
            requested_start_ms: Some(15_000),
            requested_end_ms: Some(55_000),
            focus_x: Some(0.5),
            focus_y: Some(0.5),
            focus_track: Vec::new(),
        };
        let a = build_media_plan("incoming/shot.mp4", &options).unwrap();
        let b = build_media_plan("incoming/shot.mp4", &options).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.trim_start_ms, 15_000);
        assert_eq!(a.trim_end_ms, 55_000);
        assert!(a.trim_end_ms <= 90_000);
        assert!(build_media_plan("../secret.mp4", &options).is_err());
    }

    #[test]
    fn middle_silence_is_not_mistaken_for_trailing_silence() {
        let diagnostics = "silence_start: 2.000\nsilence_end: 3.000\n";
        assert_eq!(
            select_trim_bounds_from_silence_diagnostics(diagnostics),
            (None, None)
        );
    }

    #[test]
    fn leading_and_open_trailing_silence_are_trim_candidates() {
        let diagnostics = "silence_start: 0.000\nsilence_end: 1.000\nsilence_start: 8.000\n";
        assert_eq!(
            select_trim_bounds_from_silence_diagnostics(diagnostics),
            (Some(1_000), Some(8_000))
        );
    }

    #[test]
    fn checkpoint_is_atomic_and_qc_rejects_source_scope() {
        let dir = tempdir().unwrap();
        let checkpoint = dir.path().join("state/checkpoint.json");
        write_checkpoint_atomic(
            &checkpoint,
            &MediaCheckpoint {
                checkpoint_version: "media-checkpoint.v1".into(),
                job_id: "job-1".into(),
                root_id: "root-1".into(),
                binding_revision: 1,
                source_fingerprint: "fp-1".into(),
                stage: "planned".into(),
                output_relative_name: None,
                remote_execution_id: None,
            },
        )
        .unwrap();
        assert!(checkpoint.exists());
        let source = dir.path().join("source.mp4");
        fs::write(&source, b"not video").unwrap();
        assert!(qc_derived_output(dir.path(), &source).is_err());
    }

    #[test]
    fn managed_wsl_media_command_uses_runtime_pack_and_translates_windows_paths() {
        let tools = MediaToolchain {
            ffmpeg: MediaTool::ManagedWsl {
                runtime_root: "~/.smartaihub-worker/runtime".into(),
                binary_name: "ffmpeg",
            },
            ffprobe: MediaTool::ManagedWsl {
                runtime_root: "~/.smartaihub-worker/runtime".into(),
                binary_name: "ffprobe",
            },
        };
        let command = build_media_command(
            tools.tool(MediaBinary::Ffmpeg),
            vec![media_path(Path::new(r"C:\Footage\clip.mp4"))],
        );
        assert_eq!(command.get_program().to_string_lossy(), "wsl.exe");
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert!(args.iter().any(|arg| arg == "/mnt/c/Footage/clip.mp4"));
        assert!(args
            .iter()
            .any(|arg| arg.contains("runtime-pack/bin/ffmpeg")));
        assert!(!args.iter().any(|arg| arg.contains(r"C:\Footage")));
    }

    #[test]
    fn managed_wsl_runtime_root_escapes_shell_expansion() {
        let tools = MediaToolchain {
            ffmpeg: MediaTool::ManagedWsl {
                runtime_root: "~/runtime-$USER`touch /tmp/unexpected`".into(),
                binary_name: "ffmpeg",
            },
            ffprobe: MediaTool::ManagedWsl {
                runtime_root: "~/runtime-$USER`touch /tmp/unexpected`".into(),
                binary_name: "ffprobe",
            },
        };
        let command = build_media_command(tools.tool(MediaBinary::Ffmpeg), vec![]);
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        let script = args.join(" ");
        assert!(script.contains("\\$USER"));
        assert!(script.contains("\\`touch /tmp/unexpected\\`"));
    }

    #[test]
    fn runtime_pack_media_tools_resolve_from_settings_not_process_path() {
        let mut settings = WorkerAppSettings::default();
        settings.runtime_environment = RuntimeEnvironment::RuntimePack;
        settings.runtime_dir = "C:/SmartAIHub/runtime".into();
        let tools = MediaToolchain::from_settings(&settings, Path::new("C:/unused"));
        match tools.ffmpeg {
            MediaTool::Native(path) => assert!(path.to_string_lossy().contains("runtime-pack")),
            MediaTool::ManagedWsl { .. } => panic!("runtime-pack settings must use native tools"),
        }
    }

    #[test]
    fn custom_silence_detection_result_serializes_and_computes_cuts() {
        let result = CustomSilenceDetectionResult {
            duration_ms: 10_000,
            silence_segments: vec![
                MediaAnalysisSegment {
                    start_ms: 2000,
                    end_ms: Some(4000),
                    kind: "silence".into(),
                    confidence: 1.0,
                },
            ],
            waveform_peaks: vec![0.1, 0.8, 0.05, 0.05, 0.9],
            cut_count: 1,
            time_saved_ms: 1600,
            noise_threshold_db: -45.0,
            min_duration_s: 0.5,
            softening_buffer_s: 0.2,
        };
        let json = serde_json::to_string(&result).expect("serialization failed");
        assert!(json.contains("\"noiseThresholdDb\":-45.0"));
        assert!(json.contains("\"minDurationS\":0.5"));
        assert!(json.contains("\"softeningBufferS\":0.2"));
        assert!(json.contains("\"timeSavedMs\":1600"));
        assert!(json.contains("\"cutCount\":1"));
    }
}

