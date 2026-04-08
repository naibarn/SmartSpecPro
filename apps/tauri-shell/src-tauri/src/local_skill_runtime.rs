use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io;
use std::io::Read;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::video_editor::ffmpeg::get_ffmpeg_path;

const LOCAL_SCRIPT_ENABLE_ENV: &str = "SMARTSPEC_TAURI_ENABLE_LOCAL_SCRIPT_SKILLS";
const LOCAL_SCRIPT_NODE_ENV: &str = "SMARTSPEC_LOCAL_SKILL_NODE_PATH";
const LOCAL_SCRIPT_PERMISSION_PROFILE: &str = "tauri-local-safe-default";
const LOCAL_RESULT_FILE_NAMES: [&str; 2] = ["local-skill-result.json", "result.json"];
const LOCAL_LLM_ENABLE_ENV: &str = "SMARTSPEC_TAURI_ENABLE_GEMMA4_TEXT_RUNTIME";
const LOCAL_LLM_BINARY_ENV: &str = "SMARTSPEC_LOCAL_LITERT_LM_PATH";
const LOCAL_LLM_MODEL_DIR_ENV: &str = "SMARTSPEC_LOCAL_LITERT_MODEL_DIR";
const LOCAL_LLM_MANAGED_MODELS_DIR_NAME: &str = "models";
const LOCAL_LLM_MAX_PROMPT_CHARS: usize = 24_000;
const LOCAL_LLM_MAX_AUDIO_BYTES: usize = 12 * 1024 * 1024;
const LOCAL_LLM_MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const LOCAL_LLM_MAX_AUDIO_SECONDS: u32 = 30;
const LOCAL_LLM_AUDIO_PROMPT: &str = "Transcribe the spoken audio faithfully. Return only the spoken words in the same language. Do not add commentary, labels, or explanations. If there is no intelligible speech, return an empty string.";
const GEMMA4_SUPPORTED_PROFILES: [&str; 2] = [
    "gemma4-e2b-tauri-fast",
    "gemma4-e4b-tauri-balanced",
];

#[derive(Default)]
pub struct LocalLlmProcessRegistry {
    pub processes: HashMap<String, Arc<Mutex<Child>>>,
    pub active_tts_process: Option<(String, Arc<Mutex<Child>>)>,
}

#[derive(Clone, Copy)]
struct GemmaProfileSpec {
    repo_id: &'static str,
    model_file_name: &'static str,
    checksum_sha256: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillRuntimeStatus {
    pub available: bool,
    pub supports_script_bundle: bool,
    pub supports_gemma4_text: bool,
    pub supports_gemma4_image: bool,
    pub supports_gemma4_voice: bool,
    pub node_path: Option<String>,
    pub litert_lm_path: Option<String>,
    pub runtime_root: Option<String>,
    pub managed_model_root: Option<String>,
    pub bundle_mode: Option<String>,
    pub gemma_profile_ids: Vec<String>,
    pub bundled_gemma_profile_ids: Vec<String>,
    pub installed_gemma_profile_ids: Vec<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmGenerationRequest {
    pub profile_id: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmGenerationResult {
    pub success: bool,
    pub profile_id: String,
    pub text: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmTranscriptionRequest {
    pub profile_id: String,
    pub audio_base64: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmTranscriptionResult {
    pub success: bool,
    pub profile_id: String,
    pub text: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmImageAnalysisRequest {
    pub profile_id: String,
    pub image_base64: String,
    pub mime_type: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmImageAnalysisResult {
    pub success: bool,
    pub profile_id: String,
    pub text: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmGenerationStreamRequest {
    pub request_id: String,
    pub profile_id: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmCancelStreamRequest {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmStreamChunkEvent {
    pub request_id: String,
    pub profile_id: String,
    pub chunk: String,
    pub accumulated_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmStreamCompleteEvent {
    pub request_id: String,
    pub profile_id: String,
    pub success: bool,
    pub text: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalLlmBundleManifest {
    runtime_kind: Option<String>,
    #[serde(rename = "runtimePackageSpec")]
    #[allow(dead_code)]
    runtime_package_spec: Option<String>,
    relative_executable_path: Option<String>,
    relative_library_dir: Option<String>,
    bundle_mode: Option<String>,
    bundled_profiles: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelRequest {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelStatus {
    pub profile_id: String,
    pub installed: bool,
    pub managed: bool,
    pub bundled: bool,
    pub source_kind: Option<String>,
    pub model_path: Option<String>,
    pub source_repo: Option<String>,
    pub file_name: Option<String>,
    pub checksum_sha256: Option<String>,
    pub verified: bool,
    pub verification_error: Option<String>,
    pub needs_repair: bool,
    pub update_available: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalHttpBackendChatCompletionRequest {
    pub request_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub request_timeout_ms: u64,
    pub messages: Value,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalHttpBackendChatCompletionResult {
    pub success: bool,
    pub model: Option<String>,
    pub text: Option<String>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub http_status: Option<u16>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTtsStatus {
    pub available: bool,
    pub backend: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTtsSpeakRequest {
    pub text: String,
    pub lang: Option<String>,
    pub rate: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillExecutionEnvelope {
    pub skill_id: String,
    pub local_execution_id: String,
    pub runtime_kind: String,
    pub params: Value,
    pub staged_inputs: Vec<Value>,
    pub output_contract: Option<Value>,
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillExecutionRequest {
    pub skill_id: String,
    pub skill_file_path: String,
    pub reviewed_entry: String,
    pub artifact_digest_sha256: String,
    pub permission_profile: String,
    pub envelope: LocalSkillExecutionEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillExecutionResult {
    pub success: bool,
    pub skill_id: String,
    #[serde(rename = "type")]
    pub result_type: String,
    pub result_url: Option<String>,
    pub result_urls: Option<Vec<String>>,
    pub message: Option<String>,
    pub error: Option<String>,
    pub credits_used: Option<u32>,
    pub task_id: Option<String>,
    pub job_id: Option<String>,
    pub is_async: Option<bool>,
}

fn local_script_runtime_enabled() -> bool {
    matches!(
        env::var(LOCAL_SCRIPT_ENABLE_ENV)
            .ok()
            .map(|value| value.trim().to_ascii_lowercase()),
        Some(value) if value == "1" || value == "true" || value == "yes" || value == "on"
    )
}

fn local_gemma4_text_runtime_enabled() -> bool {
    matches!(
        env::var(LOCAL_LLM_ENABLE_ENV)
            .ok()
            .map(|value| value.trim().to_ascii_lowercase()),
        Some(value) if value == "1" || value == "true" || value == "yes" || value == "on"
    )
}

fn local_runtime_root() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to resolve home directory for local skill runtime".to_string())?;
    let root = home_dir.join("SmartSpecPro").join("LocalSkillRuntime");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create local skill runtime root: {error}"))?;
    Ok(root)
}

fn local_llm_managed_model_root() -> Result<PathBuf, String> {
    let root = local_runtime_root()?.join(LOCAL_LLM_MANAGED_MODELS_DIR_NAME);
    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create local Gemma model root: {error}"))?;
    Ok(root)
}

fn find_node_binary() -> Option<PathBuf> {
    if let Some(candidate) = env::var_os(LOCAL_SCRIPT_NODE_ENV) {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }

    let path_var = env::var_os("PATH")?;
    for entry in env::split_paths(&path_var) {
        let candidate = entry.join(if cfg!(windows) { "node.exe" } else { "node" });
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_litert_lm_binary() -> Option<PathBuf> {
    if let Some(candidate) = resolve_bundled_litert_runtime_executable() {
        return Some(candidate);
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let prefixes = ["litert-lm", "litert_lm_main"];
            if let Ok(entries) = fs::read_dir(exe_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }
                    let file_name = match path.file_name().and_then(|value| value.to_str()) {
                        Some(value) => value,
                        None => continue,
                    };
                    let is_match = prefixes.iter().any(|prefix| {
                        file_name == *prefix
                            || file_name == format!("{prefix}.exe")
                            || file_name.starts_with(&format!("{prefix}-"))
                            || file_name.starts_with(&format!("{prefix}_"))
                    });
                    if is_match {
                        return Some(path);
                    }
                }
            }
        }
    }

    if let Some(candidate) = env::var_os(LOCAL_LLM_BINARY_ENV) {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }

    let path_var = env::var_os("PATH")?;
    for entry in env::split_paths(&path_var) {
        for binary_name in [
            if cfg!(windows) { "litert-lm.exe" } else { "litert-lm" },
            if cfg!(windows) { "litert_lm_main.exe" } else { "litert_lm_main" },
        ] {
            let candidate = entry.join(binary_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn litert_binary_runtime_error(path: &Path) -> Option<String> {
    if fs::read(path)
        .ok()
        .is_some_and(|contents| contents.starts_with(b"#!"))
    {
        return None;
    }
    let output = Command::new("ldd").arg(path).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}\n{stderr}");
    if combined.contains("=> not found") || combined.contains("not found") {
        return Some("litert_shared_libraries_missing".to_string());
    }
    None
}

#[cfg(not(target_os = "linux"))]
fn litert_binary_runtime_error(_path: &Path) -> Option<String> {
    None
}

fn resolve_gemma4_profile_spec(profile_id: &str) -> Option<GemmaProfileSpec> {
    match profile_id.trim() {
        "gemma4-e2b-tauri-fast" => Some(GemmaProfileSpec {
            repo_id: "litert-community/gemma-4-E2B-it-litert-lm",
            model_file_name: "gemma-4-E2B-it.litertlm",
            checksum_sha256:
                "ab7838cdfc8f77e54d8ca45eadceb20452d9f01e4bfade03e5dce27911b27e42",
        }),
        "gemma4-e4b-tauri-balanced" => Some(GemmaProfileSpec {
            repo_id: "litert-community/gemma-4-E4B-it-litert-lm",
            model_file_name: "gemma-4-E4B-it.litertlm",
            checksum_sha256:
                "f335f2bfd1b758dc6476db16c0f41854bd6237e2658d604cbe566bcefd00a7bc",
        }),
        _ => None,
    }
}

fn resolve_managed_gemma_model_path(profile_id: &str) -> Result<PathBuf, String> {
    let model_file_name = resolve_gemma4_profile_spec(profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for Tauri local runtime".to_string())?;
    let profile_dir = local_llm_managed_model_root()?.join(profile_id.trim());
    fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("Failed to prepare local Gemma profile directory: {error}"))?;
    Ok(profile_dir.join(model_file_name.model_file_name))
}

fn resolve_external_gemma_model_path(profile_id: &str) -> Option<PathBuf> {
    let profile = resolve_gemma4_profile_spec(profile_id)?;
    env::var_os(LOCAL_LLM_MODEL_DIR_ENV)
        .map(PathBuf::from)
        .map(|dir| dir.join(profile.model_file_name))
        .filter(|path| path.is_file())
}

fn resolve_bundled_gemma_model_path(profile_id: &str) -> Option<PathBuf> {
    let profile = resolve_gemma4_profile_spec(profile_id)?;
    let current_exe = env::current_exe().ok()?;
    let exe_dir = current_exe.parent()?;

    #[cfg(target_os = "windows")]
    let candidates = [
        exe_dir
            .join("resources")
            .join("litert-lm-models")
            .join(profile_id)
            .join(profile.model_file_name),
    ];

    #[cfg(target_os = "macos")]
    let candidates = [
        exe_dir
            .join("..")
            .join("Resources")
            .join("litert-lm-models")
            .join(profile_id)
            .join(profile.model_file_name),
        exe_dir
            .join("resources")
            .join("litert-lm-models")
            .join(profile_id)
            .join(profile.model_file_name),
    ];

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let candidates = [
        exe_dir
            .join("resources")
            .join("litert-lm-models")
            .join(profile_id)
            .join(profile.model_file_name),
    ];

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn resolve_bundled_runtime_manifest_path() -> Option<PathBuf> {
    let current_exe = env::current_exe().ok()?;
    let exe_dir = current_exe.parent()?;

    #[cfg(target_os = "windows")]
    let candidates = [exe_dir
        .join("resources")
        .join("litert-lm-runtime")
        .join("bundle-manifest.json")];

    #[cfg(target_os = "macos")]
    let candidates = [
        exe_dir
            .join("..")
            .join("Resources")
            .join("litert-lm-runtime")
            .join("bundle-manifest.json"),
        exe_dir
            .join("resources")
            .join("litert-lm-runtime")
            .join("bundle-manifest.json"),
    ];

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let candidates = [exe_dir
        .join("resources")
        .join("litert-lm-runtime")
        .join("bundle-manifest.json")];

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn resolve_bundled_runtime_root() -> Option<PathBuf> {
    resolve_bundled_runtime_manifest_path()
        .and_then(|manifest_path| manifest_path.parent().map(Path::to_path_buf))
}

fn read_bundled_runtime_manifest() -> Option<LocalLlmBundleManifest> {
    let manifest_path = resolve_bundled_runtime_manifest_path()?;
    let raw = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<LocalLlmBundleManifest>(&raw).ok()
}

fn resolve_bundled_litert_runtime_executable() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;
    let manifest = read_bundled_runtime_manifest()?;
    if manifest.runtime_kind.as_deref() != Some("uv_venv") {
        return None;
    }

    let relative_path = manifest.relative_executable_path?;
    let candidate = runtime_root.join(relative_path);
    if candidate.is_file() {
        return Some(candidate);
    }

    #[cfg(target_os = "windows")]
    let fallbacks = [
        runtime_root.join("venv").join("Scripts").join("litert-lm.exe"),
        runtime_root.join("venv").join("Scripts").join("litert-lm"),
    ];

    #[cfg(not(target_os = "windows"))]
    let fallbacks = [runtime_root.join("venv").join("bin").join("litert-lm")];

    fallbacks.into_iter().find(|path| path.is_file())
}

fn resolve_bundled_litert_library_dir() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;
    let manifest = read_bundled_runtime_manifest()?;
    let relative_path = manifest.relative_library_dir?;
    let candidate = runtime_root.join(relative_path);
    if candidate.is_dir() {
        return Some(candidate);
    }
    None
}

fn resolve_bundled_litert_python_executable() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;

    #[cfg(target_os = "windows")]
    let candidates = [
        runtime_root.join("venv").join("Scripts").join("python.exe"),
        runtime_root.join("venv").join("Scripts").join("python"),
    ];

    #[cfg(not(target_os = "windows"))]
    let candidates = [
        runtime_root.join("venv").join("bin").join("python"),
        runtime_root.join("venv").join("bin").join("python3"),
    ];

    candidates.into_iter().find(|path| path.is_file())
}

fn resolve_bundled_transcription_helper_script() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;
    let candidate = runtime_root.join("transcribe_audio.py");
    if candidate.is_file() {
        return Some(candidate);
    }
    None
}

fn resolve_bundled_image_helper_script() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;
    let candidate = runtime_root.join("describe_image.py");
    if candidate.is_file() {
        return Some(candidate);
    }
    None
}

fn detect_bundled_gemma_profile_ids() -> Vec<String> {
    GEMMA4_SUPPORTED_PROFILES
        .iter()
        .filter_map(|profile_id| {
            resolve_bundled_gemma_model_path(profile_id)
                .map(|_| (*profile_id).to_string())
        })
        .collect()
}

fn resolve_any_gemma_model_path(profile_id: &str) -> Result<Option<(PathBuf, bool)>, String> {
    let managed_path = resolve_managed_gemma_model_path(profile_id)?;
    if managed_path.is_file() {
        return Ok(Some((managed_path, true)));
    }

    if let Some(bundled_path) = resolve_bundled_gemma_model_path(profile_id) {
        return Ok(Some((bundled_path, false)));
    }

    if let Some(external_path) = resolve_external_gemma_model_path(profile_id) {
        return Ok(Some((external_path, false)));
    }

    Ok(None)
}

fn resolve_any_gemma_model_path_with_source_kind(
    profile_id: &str,
) -> Result<Option<(PathBuf, &'static str, bool)>, String> {
    let managed_path = resolve_managed_gemma_model_path(profile_id)?;
    if managed_path.is_file() {
        return Ok(Some((managed_path, "managed", true)));
    }

    if let Some(bundled_path) = resolve_bundled_gemma_model_path(profile_id) {
        return Ok(Some((bundled_path, "bundled", false)));
    }

    if let Some(external_path) = resolve_external_gemma_model_path(profile_id) {
        return Ok(Some((external_path, "external", false)));
    }

    Ok(None)
}

fn build_huggingface_model_download_url(repo_id: &str, model_file_name: &str) -> String {
    format!(
        "https://huggingface.co/{repo_id}/resolve/main/{model_file_name}?download=1"
    )
}

fn sha256_hex_for_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|error| format!("Failed to open model file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];

    loop {
        let read_count = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read model file: {error}"))?;
        if read_count == 0 {
            break;
        }
        hasher.update(&buffer[..read_count]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_gemma_model_checksum(path: &Path, expected_sha256: &str) -> Result<(), String> {
    let actual = sha256_hex_for_file(path)?;
    if actual != expected_sha256.to_ascii_lowercase() {
        return Err("Downloaded Gemma 4 model checksum verification failed".to_string());
    }
    Ok(())
}

fn is_allowed_local_backend_host(hostname: &str) -> bool {
    if matches!(hostname, "localhost" | "127.0.0.1" | "::1" | "[::1]") {
        return true;
    }

    let normalized = hostname.trim().trim_matches(['[', ']']);
    if let Ok(ip_addr) = normalized.parse::<IpAddr>() {
        return match ip_addr {
            IpAddr::V4(ipv4) => ipv4.is_private(),
            IpAddr::V6(ipv6) => ipv6.is_loopback() || (ipv6.segments()[0] & 0xfe00) == 0xfc00,
        };
    }

    false
}

fn validate_local_http_backend_request_url(raw: &str) -> Result<reqwest::Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("external_local_backend_missing_base_url".to_string());
    }

    let parsed =
        reqwest::Url::parse(trimmed).map_err(|_| "external_local_backend_invalid_url".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("external_local_backend_invalid_url".to_string()),
    }

    let Some(host) = parsed.host_str() else {
        return Err("external_local_backend_invalid_url".to_string());
    };
    if !is_allowed_local_backend_host(host) {
        return Err("external_local_backend_invalid_url".to_string());
    }

    Ok(parsed)
}

fn extract_openai_compatible_response_text(payload: &Value) -> Option<String> {
    let first_choice = payload.get("choices")?.as_array()?.first()?;
    if let Some(text) = first_choice.get("text").and_then(Value::as_str) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let content = first_choice
        .get("message")
        .and_then(|message| message.get("content"))?;
    if let Some(text) = content.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(parts) = content.as_array() {
        let combined = parts
            .iter()
            .filter_map(|part| {
                if part.get("type").and_then(Value::as_str) == Some("text") {
                    part.get("text").and_then(Value::as_str).map(str::trim)
                } else {
                    None
                }
            })
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        if !combined.is_empty() {
            return Some(combined);
        }
    }

    None
}

fn build_local_llm_model_status(
    profile_id: &str,
    error: Option<String>,
) -> Result<LocalLlmModelStatus, String> {
    let profile = resolve_gemma4_profile_spec(profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for Tauri local runtime".to_string())?;
    let installed = resolve_any_gemma_model_path_with_source_kind(profile_id)?;
    let (checksum_sha256, verification_error) = if let Some((model_path, _, _)) = installed.as_ref()
    {
        match sha256_hex_for_file(model_path) {
            Ok(actual) => {
                if actual == profile.checksum_sha256.to_ascii_lowercase() {
                    (Some(actual), None)
                } else {
                    (
                        Some(actual),
                        Some("Gemma 4 model checksum verification failed".to_string()),
                    )
                }
            }
            Err(verify_error) => (None, Some(verify_error)),
        }
    } else {
        (None, None)
    };
    let source_kind = installed
        .as_ref()
        .map(|(_, source_kind, _)| (*source_kind).to_string());
    let bundled = matches!(source_kind.as_deref(), Some("bundled"));
    let managed = installed
        .as_ref()
        .map(|(_, _, managed)| *managed)
        .unwrap_or(false);
    let verified = installed.is_some() && verification_error.is_none();
    Ok(LocalLlmModelStatus {
        profile_id: profile_id.to_string(),
        installed: installed.is_some(),
        managed,
        bundled,
        source_kind,
        model_path: installed
            .as_ref()
            .map(|(path, _, _)| path.to_string_lossy().to_string()),
        source_repo: Some(profile.repo_id.to_string()),
        file_name: Some(profile.model_file_name.to_string()),
        checksum_sha256,
        verified,
        verification_error: verification_error.clone(),
        needs_repair: installed.is_some() && verification_error.is_some(),
        update_available: false,
        error,
    })
}

fn remove_managed_gemma_model_artifacts(profile_id: &str) -> Result<(), String> {
    let model_path = resolve_managed_gemma_model_path(profile_id)?;
    let partial_path = model_path.with_extension("litertlm.partial");
    if model_path.is_file() {
        fs::remove_file(&model_path)
            .map_err(|error| format!("Failed to remove local Gemma 4 model file: {error}"))?;
    }
    if partial_path.is_file() {
        fs::remove_file(&partial_path)
            .map_err(|error| format!("Failed to remove partial Gemma 4 model file: {error}"))?;
    }
    if let Some(parent_dir) = model_path.parent() {
        if parent_dir.is_dir() {
            let _ = fs::remove_dir(parent_dir);
        }
    }
    Ok(())
}

fn sanitize_generation_prompt(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Prompt is required for local Gemma 4 generation".to_string());
    }
    if trimmed.chars().count() > LOCAL_LLM_MAX_PROMPT_CHARS {
        return Err(format!(
            "Prompt exceeds the local Gemma 4 limit of {} characters",
            LOCAL_LLM_MAX_PROMPT_CHARS
        ));
    }
    Ok(trimmed.to_string())
}

fn sanitize_tts_text(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Text is required for local voice readback".to_string());
    }
    if trimmed.chars().count() > 500 {
        return Err("Local voice readback is limited to 500 characters per utterance".to_string());
    }
    Ok(trimmed.to_string())
}

fn find_program_in_path(candidates: &[&str]) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for entry in env::split_paths(&path_var) {
        for candidate in candidates {
            let path = entry.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_native_tts_backend() -> Option<(PathBuf, &'static str)> {
    #[cfg(target_os = "macos")]
    {
        return find_program_in_path(&["say"]).map(|path| (path, "say"));
    }
    #[cfg(target_os = "windows")]
    {
        return find_program_in_path(&["pwsh.exe", "powershell.exe"])
            .map(|path| (path, "powershell"));
    }
    #[cfg(target_os = "linux")]
    {
        return find_program_in_path(&["espeak-ng", "espeak"])
            .map(|path| (path, "espeak"));
    }
    #[allow(unreachable_code)]
    None
}

fn build_local_tts_status() -> LocalTtsStatus {
    match resolve_native_tts_backend() {
        Some((_, backend)) => LocalTtsStatus {
            available: true,
            backend: Some(backend.to_string()),
            reason: None,
        },
        None => LocalTtsStatus {
            available: false,
            backend: None,
            reason: Some("native_tts_backend_unavailable".to_string()),
        },
    }
}

fn apply_native_tts_env(command: &mut Command) {
    for env_key in [
        "PATH",
        "HOME",
        "USERPROFILE",
        "XDG_RUNTIME_DIR",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "DBUS_SESSION_BUS_ADDRESS",
        "PULSE_SERVER",
        "TMPDIR",
        "TEMP",
        "TMP",
    ] {
        if let Some(value) = env::var_os(env_key) {
            command.env(env_key, value);
        }
    }
}

fn build_native_tts_command(request: &LocalTtsSpeakRequest) -> Result<(Command, String), String> {
    let text = sanitize_tts_text(&request.text)?;
    let (binary_path, backend) = resolve_native_tts_backend()
        .ok_or_else(|| "No native TTS backend is available on this Tauri runtime".to_string())?;
    let mut command = Command::new(binary_path);
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command.env_clear();
    apply_native_tts_env(&mut command);

    #[cfg(target_os = "macos")]
    {
        let words_per_minute = request
            .rate
            .unwrap_or(1.0)
            .clamp(0.7, 1.6)
            .mul_add(120.0, 60.0)
            .round() as u32;
        command.arg("-r").arg(words_per_minute.to_string());
        command.arg(text);
    }

    #[cfg(target_os = "linux")]
    {
        let words_per_minute = request
            .rate
            .unwrap_or(1.0)
            .clamp(0.7, 1.6)
            .mul_add(120.0, 60.0)
            .round() as u32;
        command.arg("-s").arg(words_per_minute.to_string());
        command.arg(text);
    }

    #[cfg(target_os = "windows")]
    {
        let rate = request.rate.unwrap_or(1.0).clamp(0.5, 1.5);
        let sapi_rate = ((rate - 1.0) * 6.0).round() as i32;
        command.arg("-NoProfile");
        command.arg("-NonInteractive");
        command.arg("-Command");
        command.arg("Add-Type -AssemblyName System.Speech; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speaker.Rate = [int]$env:SMARTSPEC_TAURI_TTS_RATE; $text = $env:SMARTSPEC_TAURI_TTS_TEXT; if ([string]::IsNullOrWhiteSpace($text)) { exit 1 }; $speaker.Speak($text);");
        command.env("SMARTSPEC_TAURI_TTS_TEXT", text);
        command.env("SMARTSPEC_TAURI_TTS_RATE", sapi_rate.to_string());
    }

    Ok((command, backend.to_string()))
}

fn stop_active_tts_process(
    state: &Arc<Mutex<LocalLlmProcessRegistry>>,
) -> Result<bool, String> {
    let active_child = {
        let mut registry = state
            .lock()
            .map_err(|_| "Local TTS process registry lock was poisoned".to_string())?;
        registry.active_tts_process.take()
    };

    let Some((_, child)) = active_child else {
        return Ok(false);
    };

    let mut child_guard = child
        .lock()
        .map_err(|_| "Local TTS process lock was poisoned".to_string())?;
    match child_guard.kill() {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => Ok(false),
        Err(error) => Err(format!("Failed to stop local TTS process: {error}")),
    }
}

fn apply_litert_runtime_env(command: &mut Command) {
    for env_key in [
        "HOME",
        "USERPROFILE",
        "PATH",
        "HF_HOME",
        "HUGGINGFACE_HUB_CACHE",
        "XDG_CACHE_HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
    ] {
        if let Some(value) = env::var_os(env_key) {
            command.env(env_key, value);
        }
    }

    if let Some(library_dir) = resolve_bundled_litert_library_dir() {
        #[cfg(target_os = "linux")]
        {
            let mut paths = vec![library_dir];
            if let Some(existing) = env::var_os("LD_LIBRARY_PATH") {
                paths.extend(env::split_paths(&existing));
            }
            if let Ok(joined) = env::join_paths(paths) {
                command.env("LD_LIBRARY_PATH", joined);
            }
        }

        #[cfg(target_os = "macos")]
        {
            let mut paths = vec![library_dir];
            if let Some(existing) = env::var_os("DYLD_LIBRARY_PATH") {
                paths.extend(env::split_paths(&existing));
            }
            if let Ok(joined) = env::join_paths(paths) {
                command.env("DYLD_LIBRARY_PATH", joined);
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut paths = vec![library_dir];
            if let Some(existing) = env::var_os("PATH") {
                paths.extend(env::split_paths(&existing));
            }
            if let Ok(joined) = env::join_paths(paths) {
                command.env("PATH", joined);
            }
        }
    }
}

fn cleanup_path(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

fn sanitize_audio_mime_type(raw: &str) -> Result<(&'static str, &'static str), String> {
    let normalized = raw
        .trim()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match normalized.as_str() {
        "audio/webm" => Ok(("audio/webm", "webm")),
        "audio/wav" | "audio/x-wav" => Ok(("audio/wav", "wav")),
        "audio/ogg" => Ok(("audio/ogg", "ogg")),
        "audio/mp4" | "audio/x-m4a" | "audio/m4a" => Ok(("audio/mp4", "m4a")),
        "audio/mpeg" | "audio/mp3" => Ok(("audio/mpeg", "mp3")),
        _ => Err("Unsupported local audio format for Gemma 4 transcription".to_string()),
    }
}

fn sanitize_image_mime_type(raw: &str) -> Result<(&'static str, &'static str), String> {
    let normalized = raw
        .trim()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match normalized.as_str() {
        "image/png" => Ok(("image/png", "png")),
        "image/jpeg" | "image/jpg" => Ok(("image/jpeg", "jpg")),
        "image/webp" => Ok(("image/webp", "webp")),
        "image/gif" => Ok(("image/gif", "gif")),
        _ => Err("Unsupported local image format for Gemma 4 image analysis".to_string()),
    }
}

fn stage_local_audio_input(
    audio_base64: &str,
    mime_type: &str,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let (_, extension) = sanitize_audio_mime_type(mime_type)?;
    let trimmed = audio_base64.trim();
    if trimmed.is_empty() {
        return Err("Audio payload is required for local Gemma 4 transcription".to_string());
    }

    let audio_bytes = BASE64_STANDARD
        .decode(trimmed)
        .map_err(|error| format!("Failed to decode recorded audio payload: {error}"))?;
    if audio_bytes.is_empty() {
        return Err("Recorded audio payload is empty".to_string());
    }
    if audio_bytes.len() > LOCAL_LLM_MAX_AUDIO_BYTES {
        return Err(format!(
            "Recorded audio exceeds the local Gemma 4 limit of {} MB",
            LOCAL_LLM_MAX_AUDIO_BYTES / (1024 * 1024)
        ));
    }

    let transcription_root = local_runtime_root()?.join("voice-transcription");
    fs::create_dir_all(&transcription_root)
        .map_err(|error| format!("Failed to prepare local voice transcription root: {error}"))?;
    let execution_dir = transcription_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&execution_dir)
        .map_err(|error| format!("Failed to prepare local voice transcription directory: {error}"))?;

    let raw_audio_path = execution_dir.join(format!("input.{extension}"));
    fs::write(&raw_audio_path, audio_bytes)
        .map_err(|error| format!("Failed to stage recorded audio for local transcription: {error}"))?;
    let wav_path = execution_dir.join("input.wav");
    Ok((execution_dir, raw_audio_path, wav_path))
}

fn stage_local_image_input(
    image_base64: &str,
    mime_type: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let (_, extension) = sanitize_image_mime_type(mime_type)?;
    let trimmed = image_base64.trim();
    if trimmed.is_empty() {
        return Err("Image payload is required for local Gemma 4 image analysis".to_string());
    }

    let image_bytes = BASE64_STANDARD
        .decode(trimmed)
        .map_err(|error| format!("Failed to decode image payload: {error}"))?;
    if image_bytes.is_empty() {
        return Err("Image payload is empty".to_string());
    }
    if image_bytes.len() > LOCAL_LLM_MAX_IMAGE_BYTES {
        return Err(format!(
            "Image exceeds the local Gemma 4 limit of {} MB",
            LOCAL_LLM_MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }

    let vision_root = local_runtime_root()?.join("vision-analysis");
    fs::create_dir_all(&vision_root)
        .map_err(|error| format!("Failed to prepare local image analysis root: {error}"))?;
    let execution_dir = vision_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&execution_dir)
        .map_err(|error| format!("Failed to prepare local image analysis directory: {error}"))?;

    let image_path = execution_dir.join(format!("input.{extension}"));
    fs::write(&image_path, image_bytes)
        .map_err(|error| format!("Failed to stage local image input: {error}"))?;
    Ok((execution_dir, image_path))
}

fn transcode_audio_for_local_transcription(
    input_path: &Path,
    wav_path: &Path,
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path();
    let output = Command::new(&ffmpeg_path)
        .arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(input_path)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg("-t")
        .arg(LOCAL_LLM_MAX_AUDIO_SECONDS.to_string())
        .arg(wav_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to start FFmpeg for local voice transcription: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("FFmpeg exited with status {}", output.status)
        });
    }

    let metadata = fs::metadata(wav_path)
        .map_err(|error| format!("Failed to inspect transcoded local audio: {error}"))?;
    if metadata.len() < 256 {
        return Err("Transcoded local audio payload is unexpectedly small".to_string());
    }
    Ok(())
}

fn run_local_audio_transcription_script(
    model_path: &Path,
    wav_path: &Path,
) -> Result<String, String> {
    let python_path = resolve_bundled_litert_python_executable()
        .ok_or_else(|| "Bundled LiteRT Python runtime is not available".to_string())?;
    let script_path = resolve_bundled_transcription_helper_script().ok_or_else(|| {
        "Bundled Gemma 4 audio transcription helper is not available".to_string()
    })?;

    let mut command = Command::new(python_path);
    command
        .arg(script_path)
        .arg("--model-path")
        .arg(model_path)
        .arg("--audio-path")
        .arg(wav_path)
        .arg("--backend")
        .arg("cpu")
        .arg("--prompt")
        .arg(LOCAL_LLM_AUDIO_PROMPT);
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    command.env_clear();
    apply_litert_runtime_env(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("Failed to start bundled Gemma 4 audio transcription: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed_payload = (!stdout.is_empty())
        .then(|| serde_json::from_str::<Value>(&stdout).ok())
        .flatten();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if let Some(payload) = &parsed_payload {
            let text = payload
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            let payload_error = payload
                .get("error")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);
            if payload_error.is_none() && !text.is_empty() {
                return Ok(text);
            }
        }
        if !stderr.is_empty() {
            return Err(stderr);
        }
        if !stdout.is_empty() {
            if let Some(payload) = parsed_payload {
                if let Some(error) = payload.get("error").and_then(Value::as_str) {
                    return Err(error.to_string());
                }
            }
            return Err(stdout);
        }
        return Err(format!(
            "Gemma 4 audio transcription helper exited with status {}",
            output.status
        ));
    }

    let payload = parsed_payload.ok_or_else(|| {
        "Failed to parse Gemma 4 audio transcription payload".to_string()
    })?;
    Ok(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string())
}

fn run_local_image_analysis_script(
    model_path: &Path,
    image_path: &Path,
    prompt: &str,
) -> Result<String, String> {
    let python_path = resolve_bundled_litert_python_executable()
        .ok_or_else(|| "Bundled LiteRT Python runtime is not available".to_string())?;
    let script_path = resolve_bundled_image_helper_script()
        .ok_or_else(|| "Bundled Gemma 4 image analysis helper is not available".to_string())?;

    let mut command = Command::new(python_path);
    command
        .arg(script_path)
        .arg("--model-path")
        .arg(model_path)
        .arg("--image-path")
        .arg(image_path)
        .arg("--backend")
        .arg("cpu")
        .arg("--prompt")
        .arg(prompt);
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    command.env_clear();
    apply_litert_runtime_env(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("Failed to start bundled Gemma 4 image analysis: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed_payload = (!stdout.is_empty())
        .then(|| serde_json::from_str::<Value>(&stdout).ok())
        .flatten();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if let Some(payload) = &parsed_payload {
            let text = payload
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            let payload_error = payload
                .get("error")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);
            if payload_error.is_none() && !text.is_empty() {
                return Ok(text);
            }
        }
        if !stderr.is_empty() {
            return Err(stderr);
        }
        if !stdout.is_empty() {
            if let Some(payload) = parsed_payload {
                if let Some(error) = payload.get("error").and_then(Value::as_str) {
                    return Err(error.to_string());
                }
            }
            return Err(stdout);
        }
        return Err(format!(
            "Gemma 4 image analysis helper exited with status {}",
            output.status
        ));
    }

    let payload = parsed_payload.ok_or_else(|| {
        "Failed to parse Gemma 4 image analysis payload".to_string()
    })?;
    Ok(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string())
}

fn is_path_inside(root: &Path, candidate: &Path) -> bool {
    let relative = match candidate.strip_prefix(root) {
        Ok(value) => value,
        Err(_) => return false,
    };
    !relative.as_os_str().is_empty()
}

fn resolve_bundle_dir(skill_file_path: &str) -> Result<PathBuf, String> {
    let skill_path = PathBuf::from(skill_file_path);
    if !skill_path.is_absolute() {
        return Err("skillFilePath must be absolute for local execution".to_string());
    }

    let skill_dir = skill_path
        .parent()
        .ok_or_else(|| "Could not resolve skill directory".to_string())?;

    let direct_manifest = skill_dir.join("skill.manifest.json");
    if direct_manifest.is_file() {
        return Ok(skill_dir.to_path_buf());
    }

    let entries = fs::read_dir(skill_dir)
        .map_err(|error| format!("Failed to read skill directory: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect skill directory entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() && path.join("skill.manifest.json").is_file() {
            return Ok(path);
        }
    }

    Err("No reviewed local skill bundle was found for this skill".to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn validate_execution_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 120 {
        return Err("Invalid localExecutionId".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("localExecutionId contains invalid characters".to_string());
    }
    Ok(trimmed.to_string())
}

fn sanitize_result_path(candidate: &str, output_dir: &Path) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("data:") {
        return Some(trimmed.to_string());
    }

    let candidate_path = PathBuf::from(trimmed);
    let resolved = if candidate_path.is_absolute() {
        candidate_path
    } else {
        output_dir.join(candidate_path)
    };
    let canonical = fs::canonicalize(&resolved).ok()?;
    let canonical_output_dir = fs::canonicalize(output_dir).ok()?;
    if !is_path_inside(&canonical_output_dir, &canonical) && canonical != canonical_output_dir {
        return None;
    }
    Some(canonical.to_string_lossy().to_string())
}

fn sanitize_result_paths(result: &mut LocalSkillExecutionResult, output_dir: &Path) {
    result.result_url = result
        .result_url
        .as_deref()
        .and_then(|value| sanitize_result_path(value, output_dir));

    result.result_urls = result.result_urls.as_ref().map(|items| {
        items
            .iter()
            .filter_map(|value| sanitize_result_path(value, output_dir))
            .collect::<Vec<_>>()
    });
}

fn build_runtime_status() -> Result<LocalSkillRuntimeStatus, String> {
    let runtime_root = local_runtime_root()?;
    let managed_model_root = local_llm_managed_model_root()?;
    let node_path = find_node_binary();
    let litert_lm_path = find_litert_lm_binary();
    let litert_runtime_error = litert_lm_path
        .as_deref()
        .and_then(litert_binary_runtime_error);
    let script_enabled = local_script_runtime_enabled();
    let gemma_enabled = local_gemma4_text_runtime_enabled();
    let supports_script_bundle = script_enabled && node_path.is_some();
    let supports_gemma4_text =
        gemma_enabled && litert_lm_path.is_some() && litert_runtime_error.is_none();
    let supports_gemma4_image = supports_gemma4_text
        && resolve_bundled_litert_python_executable().is_some()
        && resolve_bundled_image_helper_script().is_some();
    let supports_gemma4_voice = supports_gemma4_text
        && resolve_bundled_litert_python_executable().is_some()
        && resolve_bundled_transcription_helper_script().is_some();
    let bundle_manifest = read_bundled_runtime_manifest();
    let bundled_gemma_profile_ids = bundle_manifest
        .as_ref()
        .and_then(|manifest| manifest.bundled_profiles.clone())
        .unwrap_or_else(detect_bundled_gemma_profile_ids);
    let bundle_mode = bundle_manifest
        .as_ref()
        .and_then(|manifest| manifest.bundle_mode.clone());
    let installed_gemma_profile_ids = GEMMA4_SUPPORTED_PROFILES
        .iter()
        .filter_map(|profile_id| match resolve_any_gemma_model_path(profile_id) {
            Ok(Some(_)) => Some((*profile_id).to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();

    if !script_enabled && !gemma_enabled {
        return Ok(LocalSkillRuntimeStatus {
            available: false,
            supports_script_bundle,
            supports_gemma4_text,
            supports_gemma4_image,
            supports_gemma4_voice,
            node_path: node_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            litert_lm_path: litert_lm_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            runtime_root: Some(runtime_root.to_string_lossy().to_string()),
            managed_model_root: Some(managed_model_root.to_string_lossy().to_string()),
            bundle_mode,
            gemma_profile_ids: GEMMA4_SUPPORTED_PROFILES
                .iter()
                .map(|value| value.to_string())
                .collect(),
            bundled_gemma_profile_ids,
            installed_gemma_profile_ids,
            reason: Some("local_runtime_disabled".to_string()),
        });
    }

    Ok(LocalSkillRuntimeStatus {
        available: supports_script_bundle || supports_gemma4_text,
        supports_script_bundle,
        supports_gemma4_text,
        supports_gemma4_image,
        supports_gemma4_voice,
        node_path: node_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        litert_lm_path: litert_lm_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        runtime_root: Some(runtime_root.to_string_lossy().to_string()),
        managed_model_root: Some(managed_model_root.to_string_lossy().to_string()),
        bundle_mode,
        gemma_profile_ids: GEMMA4_SUPPORTED_PROFILES
            .iter()
            .map(|value| value.to_string())
            .collect(),
        bundled_gemma_profile_ids,
        installed_gemma_profile_ids,
        reason: if supports_script_bundle || supports_gemma4_text {
            None
        } else if script_enabled && node_path.is_none() {
            Some("node_binary_missing".to_string())
        } else if gemma_enabled && litert_lm_path.is_none() {
            Some("litert_lm_binary_missing".to_string())
        } else if litert_runtime_error.is_some() {
            litert_runtime_error
        } else {
            Some("local_runtime_unavailable".to_string())
        },
    })
}

#[tauri::command]
pub fn local_skill_get_runtime_status() -> Result<LocalSkillRuntimeStatus, String> {
    build_runtime_status()
}

#[tauri::command]
pub fn local_skill_execute(request: LocalSkillExecutionRequest) -> Result<LocalSkillExecutionResult, String> {
    let status = build_runtime_status()?;
    if !status.supports_script_bundle {
        return Err(status
            .reason
            .unwrap_or_else(|| "local_script_runtime_unavailable".to_string()));
    }
    let node_path = status
        .node_path
        .map(PathBuf::from)
        .ok_or_else(|| "Node.js runtime is not available for local skill execution".to_string())?;

    if request.permission_profile.trim() != LOCAL_SCRIPT_PERMISSION_PROFILE {
        return Err("Only the reviewed tauri-local-safe-default permission profile is allowed".to_string());
    }
    if request.envelope.runtime_kind.trim() != "script_bundle" {
        return Err("Only script_bundle local skills are supported in this build".to_string());
    }

    let execution_id = validate_execution_id(&request.envelope.local_execution_id)?;
    let runtime_root = local_runtime_root()?;
    let bundle_dir = resolve_bundle_dir(&request.skill_file_path)?;
    let canonical_bundle_dir = fs::canonicalize(&bundle_dir)
        .map_err(|error| format!("Failed to canonicalize bundle directory: {error}"))?;

    let reviewed_entry = canonical_bundle_dir.join(request.reviewed_entry.trim());
    let canonical_reviewed_entry = fs::canonicalize(&reviewed_entry)
        .map_err(|error| format!("Failed to resolve reviewed bundle entry: {error}"))?;
    if !is_path_inside(&canonical_bundle_dir, &canonical_reviewed_entry) {
        return Err("Reviewed entry must stay inside the local skill bundle".to_string());
    }

    let reviewed_bytes = fs::read(&canonical_reviewed_entry)
        .map_err(|error| format!("Failed to read reviewed bundle entry: {error}"))?;
    let actual_digest = sha256_hex(&reviewed_bytes);
    if actual_digest != request.artifact_digest_sha256.trim().to_ascii_lowercase() {
        return Err("Reviewed local skill bundle digest verification failed".to_string());
    }

    let execution_root = runtime_root.join("executions").join(&execution_id);
    let input_path = execution_root.join("input.json");
    let output_dir = execution_root.join("output");
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Failed to prepare local skill output directory: {error}"))?;

    let input_payload = serde_json::to_vec_pretty(&request.envelope)
        .map_err(|error| format!("Failed to serialize local skill input payload: {error}"))?;
    fs::write(&input_path, input_payload)
        .map_err(|error| format!("Failed to stage local skill input payload: {error}"))?;

    let command_output = Command::new(&node_path)
        .arg(&canonical_reviewed_entry)
        .arg(&input_path)
        .arg(&output_dir)
        .current_dir(&canonical_bundle_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_clear()
        .output()
        .map_err(|error| format!("Failed to start local skill runtime: {error}"))?;

    if !command_output.status.success() {
      let stderr = String::from_utf8_lossy(&command_output.stderr).trim().to_string();
      let stdout = String::from_utf8_lossy(&command_output.stdout).trim().to_string();
      let message = if !stderr.is_empty() {
          stderr
      } else if !stdout.is_empty() {
          stdout
      } else {
          format!("Local skill runner exited with status {}", command_output.status)
      };
      return Ok(LocalSkillExecutionResult {
          success: false,
          skill_id: request.skill_id,
          result_type: "text".to_string(),
          result_url: None,
          result_urls: None,
          message: None,
          error: Some(message),
          credits_used: None,
          task_id: None,
          job_id: None,
          is_async: Some(false),
      });
    }

    for result_file_name in LOCAL_RESULT_FILE_NAMES {
        let result_path = output_dir.join(result_file_name);
        if !result_path.is_file() {
            continue;
        }

        let raw = fs::read_to_string(&result_path)
            .map_err(|error| format!("Failed to read local skill result payload: {error}"))?;
        let mut parsed: LocalSkillExecutionResult = serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse local skill result payload: {error}"))?;
        if parsed.skill_id.trim().is_empty() {
            parsed.skill_id = request.skill_id.clone();
        }
        sanitize_result_paths(&mut parsed, &output_dir);
        return Ok(parsed);
    }

    let stdout = String::from_utf8_lossy(&command_output.stdout).trim().to_string();
    Ok(LocalSkillExecutionResult {
        success: true,
        skill_id: request.skill_id,
        result_type: "text".to_string(),
        result_url: None,
        result_urls: None,
        message: if stdout.is_empty() { Some("Local skill completed.".to_string()) } else { Some(stdout) },
        error: None,
        credits_used: None,
        task_id: None,
        job_id: None,
        is_async: Some(false),
    })
}

#[tauri::command]
pub async fn local_http_backend_chat_completion(
    request: LocalHttpBackendChatCompletionRequest,
) -> Result<LocalHttpBackendChatCompletionResult, String> {
    let request_url = validate_local_http_backend_request_url(&request.request_url)?;
    let model = request.model.trim().to_string();
    if model.is_empty() {
        return Ok(LocalHttpBackendChatCompletionResult {
            success: false,
            model: None,
            text: None,
            error_code: Some("missing_model".to_string()),
            error_detail: Some("The Local AI URL backend model is required.".to_string()),
            http_status: None,
        });
    }

    let timeout_ms = request.request_timeout_ms.clamp(5_000, 300_000);
    let api_key = request
        .api_key
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let messages = request.messages.clone();
    let max_tokens = request.max_tokens.unwrap_or(512);
    let temperature = request.temperature.unwrap_or(0.2);
    let model_for_task = model.clone();
    let request_url_for_task = request_url.to_string();

    tokio::task::spawn_blocking(move || -> Result<LocalHttpBackendChatCompletionResult, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|error| format!("Failed to initialize local HTTP backend client: {error}"))?;

        let mut http_request = client
            .post(request_url_for_task)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", "SmartSpecPro-Tauri/0.1");
        if let Some(api_key) = api_key {
            http_request = http_request.bearer_auth(api_key);
        }

        let body = serde_json::json!({
            "model": model_for_task.clone(),
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": false,
        });
        let body_bytes = serde_json::to_vec(&body).map_err(|error| {
            format!("Failed to serialize Local AI URL backend request payload: {error}")
        })?;

        let response = match http_request.body(body_bytes).send() {
            Ok(response) => response,
            Err(error) => {
                let error_code = if error.is_timeout() {
                    "external_local_backend_timeout"
                } else {
                    "external_local_backend_unreachable"
                };
                return Ok(LocalHttpBackendChatCompletionResult {
                    success: false,
                    model: Some(model_for_task),
                    text: None,
                    error_code: Some(error_code.to_string()),
                    error_detail: Some(error.to_string()),
                    http_status: None,
                });
            }
        };

        let status = response.status();
        let payload_text = response
            .text()
            .map_err(|error| format!("Failed to read local HTTP backend response: {error}"))?;
        let parsed_payload = serde_json::from_str::<Value>(&payload_text).ok();

        if !status.is_success() {
            let error_detail = parsed_payload
                .as_ref()
                .and_then(|payload| payload.get("error"))
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .or_else(|| {
                    let trimmed = payload_text.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                });

            return Ok(LocalHttpBackendChatCompletionResult {
                success: false,
                model: Some(model_for_task),
                text: None,
                error_code: Some("external_local_backend_http".to_string()),
                error_detail,
                http_status: Some(status.as_u16()),
            });
        }

        let Some(payload) = parsed_payload else {
            return Ok(LocalHttpBackendChatCompletionResult {
                success: false,
                model: Some(model_for_task),
                text: None,
                error_code: Some("external_local_backend_invalid_json".to_string()),
                error_detail: Some("The Local AI URL backend did not return JSON.".to_string()),
                http_status: Some(status.as_u16()),
            });
        };

        let text = extract_openai_compatible_response_text(&payload);
        if text.as_deref().unwrap_or("").trim().is_empty() {
            return Ok(LocalHttpBackendChatCompletionResult {
                success: false,
                model: payload
                    .get("model")
                    .and_then(Value::as_str)
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .or(Some(model_for_task)),
                text: None,
                error_code: Some("external_local_backend_empty_response".to_string()),
                error_detail: None,
                http_status: Some(status.as_u16()),
            });
        }

        Ok(LocalHttpBackendChatCompletionResult {
            success: true,
            model: payload
                .get("model")
                .and_then(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .or(Some(model_for_task)),
            text,
            error_code: None,
            error_detail: None,
            http_status: Some(status.as_u16()),
        })
    })
    .await
    .map_err(|error| format!("Local HTTP backend task failed: {error}"))?
}

#[tauri::command]
pub async fn local_llm_prepare_model(
    request: LocalLlmModelRequest,
) -> Result<LocalLlmModelStatus, String> {
    let profile_id = request.profile_id.trim().to_string();
    let profile = resolve_gemma4_profile_spec(&profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for Tauri local runtime".to_string())?;
    let model_path = resolve_managed_gemma_model_path(&profile_id)?;

    if model_path.is_file() {
        return build_local_llm_model_status(&profile_id, None);
    }

    let download_url =
        build_huggingface_model_download_url(profile.repo_id, profile.model_file_name);
    let partial_path = model_path.with_extension("litertlm.partial");
    if let Some(parent_dir) = model_path.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("Failed to prepare model directory: {error}"))?;
    }

    let download_url_for_task = download_url.clone();
    let model_path_for_task = model_path.clone();
    let partial_path_for_task = partial_path.clone();
    let expected_checksum = profile.checksum_sha256.to_string();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let response = reqwest::blocking::Client::builder()
            .build()
            .map_err(|error| format!("Failed to initialize model download client: {error}"))?
            .get(download_url_for_task)
            .header("User-Agent", "SmartSpecPro-Tauri/0.1")
            .send()
            .map_err(|error| format!("Failed to download Gemma 4 model: {error}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to download Gemma 4 model: HTTP {}",
                response.status()
            ));
        }

        let mut reader = response;
        let mut output_file = fs::File::create(&partial_path_for_task)
            .map_err(|error| format!("Failed to create model file: {error}"))?;
        io::copy(&mut reader, &mut output_file)
            .map_err(|error| format!("Failed to write model file: {error}"))?;
        output_file
            .sync_all()
            .map_err(|error| format!("Failed to flush model file: {error}"))?;

        let metadata = fs::metadata(&partial_path_for_task)
            .map_err(|error| format!("Failed to inspect downloaded model file: {error}"))?;
        if metadata.len() < 1_000_000 {
            let _ = fs::remove_file(&partial_path_for_task);
            return Err("Downloaded Gemma 4 model file is unexpectedly small".to_string());
        }

        if let Err(error) =
            verify_gemma_model_checksum(&partial_path_for_task, &expected_checksum)
        {
            let _ = fs::remove_file(&partial_path_for_task);
            return Err(error);
        }

        fs::rename(&partial_path_for_task, &model_path_for_task)
            .map_err(|error| format!("Failed to finalize model file: {error}"))?;
        Ok(())
    })
    .await
    .map_err(|error| format!("Local Gemma model download task failed: {error}"))??;

    build_local_llm_model_status(&profile_id, None)
}

#[tauri::command]
pub fn local_llm_verify_model(
    request: LocalLlmModelRequest,
) -> Result<LocalLlmModelStatus, String> {
    build_local_llm_model_status(request.profile_id.trim(), None)
}

#[tauri::command]
pub async fn local_llm_update_model(
    request: LocalLlmModelRequest,
) -> Result<LocalLlmModelStatus, String> {
    let profile_id = request.profile_id.trim().to_string();

    if resolve_bundled_gemma_model_path(&profile_id).is_some() {
        return build_local_llm_model_status(
            &profile_id,
            Some("bundled_model_read_only".to_string()),
        );
    }

    if resolve_external_gemma_model_path(&profile_id).is_some() {
        return build_local_llm_model_status(
            &profile_id,
            Some("external_model_managed_outside_app".to_string()),
        );
    }

    remove_managed_gemma_model_artifacts(&profile_id)?;
    local_llm_prepare_model(LocalLlmModelRequest { profile_id }).await
}

#[tauri::command]
pub async fn local_llm_repair_model(
    request: LocalLlmModelRequest,
) -> Result<LocalLlmModelStatus, String> {
    let profile_id = request.profile_id.trim().to_string();
    let current = build_local_llm_model_status(&profile_id, None)?;
    if !current.needs_repair && current.installed {
        return Ok(current);
    }
    if current.bundled {
        return build_local_llm_model_status(
            &profile_id,
            Some("bundled_model_read_only".to_string()),
        );
    }
    if matches!(current.source_kind.as_deref(), Some("external")) {
        return build_local_llm_model_status(
            &profile_id,
            Some("external_model_managed_outside_app".to_string()),
        );
    }
    remove_managed_gemma_model_artifacts(&profile_id)?;
    local_llm_prepare_model(LocalLlmModelRequest { profile_id }).await
}

#[tauri::command]
pub fn local_llm_remove_model(
    request: LocalLlmModelRequest,
) -> Result<LocalLlmModelStatus, String> {
    let profile_id = request.profile_id.trim().to_string();
    let model_path = resolve_managed_gemma_model_path(&profile_id)?;

    if model_path.is_file() {
        remove_managed_gemma_model_artifacts(&profile_id)?;
        return build_local_llm_model_status(&profile_id, None);
    }

    if resolve_bundled_gemma_model_path(&profile_id).is_some() {
        return build_local_llm_model_status(
            &profile_id,
            Some("bundled_model_read_only".to_string()),
        );
    }

    if resolve_external_gemma_model_path(&profile_id).is_some() {
        return build_local_llm_model_status(
            &profile_id,
            Some("external_model_managed_outside_app".to_string()),
        );
    }

    build_local_llm_model_status(&profile_id, None)
}

#[tauri::command]
pub fn local_llm_generate(
    request: LocalLlmGenerationRequest,
) -> Result<LocalLlmGenerationResult, String> {
    let status = build_runtime_status()?;
    if !status.supports_gemma4_text {
        return Err(
            status
                .reason
                .unwrap_or_else(|| "local_gemma4_text_runtime_unavailable".to_string()),
        );
    }

    let binary_path = status
        .litert_lm_path
        .map(PathBuf::from)
        .ok_or_else(|| "LiteRT-LM binary is not available".to_string())?;
    let prompt = sanitize_generation_prompt(&request.prompt)?;
    let profile = resolve_gemma4_profile_spec(&request.profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for Tauri local runtime".to_string())?;

    let mut command = Command::new(binary_path);
    let local_model_path = if let Some((model_path, _)) =
        resolve_any_gemma_model_path(&request.profile_id)?
    {
        model_path
    } else {
        return Ok(LocalLlmGenerationResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(format!(
                "Gemma 4 model is not prepared for this device. Install {} from Settings first.",
                profile.model_file_name
            )),
        });
    };
    let binary_name = command
        .get_program();
    let binary_name = Path::new(binary_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if binary_name.starts_with("litert_lm_main") {
        command
            .arg("--backend=cpu")
            .arg(format!("--model_path={}", local_model_path.to_string_lossy()))
            .arg(format!("--input_prompt={prompt}"));
    } else {
        command
            .arg("run")
            .arg(local_model_path)
            .arg(format!("--prompt={prompt}"));
    }
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    command.env_clear();
    apply_litert_runtime_env(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("Failed to start LiteRT-LM runtime: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let error_message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("LiteRT-LM exited with status {}", output.status)
        };
        return Ok(LocalLlmGenerationResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(error_message),
        });
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(LocalLlmGenerationResult {
        success: true,
        profile_id: request.profile_id,
        text,
        error: None,
    })
}

#[tauri::command]
pub fn local_llm_transcribe_audio(
    request: LocalLlmTranscriptionRequest,
) -> Result<LocalLlmTranscriptionResult, String> {
    let status = build_runtime_status()?;
    if !status.supports_gemma4_voice {
        return Err(
            status
                .reason
                .unwrap_or_else(|| "local_gemma4_voice_runtime_unavailable".to_string()),
        );
    }

    let profile = resolve_gemma4_profile_spec(&request.profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for local voice transcription".to_string())?;
    let (model_path, _) = if let Some(value) = resolve_any_gemma_model_path(&request.profile_id)? {
        value
    } else {
        return Ok(LocalLlmTranscriptionResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(format!(
                "Gemma 4 model is not prepared for this device. Install {} from Settings first.",
                profile.model_file_name
            )),
        });
    };

    let (execution_dir, raw_audio_path, wav_path) =
        stage_local_audio_input(&request.audio_base64, &request.mime_type)?;
    let transcription_result = (|| -> Result<String, String> {
        transcode_audio_for_local_transcription(&raw_audio_path, &wav_path)?;
        run_local_audio_transcription_script(&model_path, &wav_path)
    })();
    cleanup_path(&execution_dir);

    match transcription_result {
        Ok(text) => Ok(LocalLlmTranscriptionResult {
            success: true,
            profile_id: request.profile_id,
            text,
            error: None,
        }),
        Err(error) => Ok(LocalLlmTranscriptionResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(error),
        }),
    }
}

#[tauri::command]
pub fn local_llm_analyze_image(
    request: LocalLlmImageAnalysisRequest,
) -> Result<LocalLlmImageAnalysisResult, String> {
    let status = build_runtime_status()?;
    if !status.supports_gemma4_image {
        return Err(
            status
                .reason
                .unwrap_or_else(|| "local_gemma4_image_runtime_unavailable".to_string()),
        );
    }

    let profile = resolve_gemma4_profile_spec(&request.profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for local image analysis".to_string())?;
    let prompt = sanitize_generation_prompt(&request.prompt)?;
    let (model_path, _) = if let Some(value) = resolve_any_gemma_model_path(&request.profile_id)? {
        value
    } else {
        return Ok(LocalLlmImageAnalysisResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(format!(
                "Gemma 4 model is not prepared for this device. Install {} from Settings first.",
                profile.model_file_name
            )),
        });
    };

    let (execution_dir, image_path) =
        stage_local_image_input(&request.image_base64, &request.mime_type)?;
    let image_result = run_local_image_analysis_script(&model_path, &image_path, &prompt);
    cleanup_path(&execution_dir);

    match image_result {
        Ok(text) => Ok(LocalLlmImageAnalysisResult {
            success: true,
            profile_id: request.profile_id,
            text,
            error: None,
        }),
        Err(error) => Ok(LocalLlmImageAnalysisResult {
            success: false,
            profile_id: request.profile_id,
            text: String::new(),
            error: Some(error),
        }),
    }
}

#[tauri::command]
pub fn local_llm_generate_stream(
    request: LocalLlmGenerationStreamRequest,
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<LocalLlmProcessRegistry>>>,
) -> Result<(), String> {
    let status = build_runtime_status()?;
    if !status.supports_gemma4_text {
        return Err(
            status
                .reason
                .unwrap_or_else(|| "local_gemma4_text_runtime_unavailable".to_string()),
        );
    }

    let request_id = validate_execution_id(&request.request_id)?;
    let binary_path = status
        .litert_lm_path
        .map(PathBuf::from)
        .ok_or_else(|| "LiteRT-LM binary is not available".to_string())?;
    let prompt = sanitize_generation_prompt(&request.prompt)?;
    let profile = resolve_gemma4_profile_spec(&request.profile_id)
        .ok_or_else(|| "Unsupported Gemma 4 profile for Tauri local runtime".to_string())?;

    let mut command = Command::new(binary_path);
    let local_model_path = if let Some((model_path, _)) =
        resolve_any_gemma_model_path(&request.profile_id)?
    {
        model_path
    } else {
        return Err(format!(
            "Gemma 4 model is not prepared for this device. Install {} from Settings first.",
            profile.model_file_name
        ));
    };
    let binary_name = command
        .get_program();
    let binary_name = Path::new(binary_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if binary_name.starts_with("litert_lm_main") {
        command
            .arg("--backend=cpu")
            .arg(format!("--model_path={}", local_model_path.to_string_lossy()))
            .arg(format!("--input_prompt={prompt}"));
    } else {
        command
            .arg("run")
            .arg(local_model_path)
            .arg(format!("--prompt={prompt}"));
    }
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    command.env_clear();
    apply_litert_runtime_env(&mut command);

    let child = Arc::new(Mutex::new(
        command
            .spawn()
            .map_err(|error| format!("Failed to start LiteRT-LM runtime: {error}"))?,
    ));
    let (mut stdout, mut stderr) = {
        let mut child_guard = child
            .lock()
            .map_err(|_| "LiteRT-LM process lock was poisoned".to_string())?;
        let stdout = child_guard
            .stdout
            .take()
        .ok_or_else(|| "LiteRT-LM stdout stream is not available".to_string())?;
        let stderr = child_guard
            .stderr
            .take()
        .ok_or_else(|| "LiteRT-LM stderr stream is not available".to_string())?;
        (stdout, stderr)
    };

    {
        let mut registry = state
            .lock()
            .map_err(|_| "LiteRT-LM process registry lock was poisoned".to_string())?;
        registry.processes.insert(request_id.clone(), child.clone());
    }

    let app_handle = app.clone();
    let profile_id = request.profile_id.clone();
    let registry_state = Arc::clone(state.inner());
    thread::spawn(move || {
        let stderr_handle = thread::spawn(move || -> String {
            let mut stderr_text = String::new();
            let _ = stderr.read_to_string(&mut stderr_text);
            stderr_text
        });

        let mut accumulated = String::new();
        let mut read_error: Option<String> = None;
        let mut buffer = [0_u8; 1024];

        loop {
            match stdout.read(&mut buffer) {
                Ok(0) => break,
                Ok(read_count) => {
                    let chunk = String::from_utf8_lossy(&buffer[..read_count]).to_string();
                    accumulated.push_str(&chunk);
                    let _ = app_handle.emit(
                        "local-llm-chunk",
                        LocalLlmStreamChunkEvent {
                            request_id: request_id.clone(),
                            profile_id: profile_id.clone(),
                            chunk,
                            accumulated_text: accumulated.clone(),
                        },
                    );
                }
                Err(error) => {
                    read_error = Some(format!("Failed to read LiteRT-LM output: {error}"));
                    break;
                }
            }
        }

        let wait_result = loop {
            let next_status = {
                match child.lock() {
                    Ok(mut child_guard) => child_guard.try_wait(),
                    Err(_) => Err(io::Error::new(
                        io::ErrorKind::Other,
                        "LiteRT-LM process lock was poisoned",
                    )),
                }
            };
            match next_status {
                Ok(Some(exit_status)) => break Ok(exit_status),
                Ok(None) => {
                    thread::sleep(Duration::from_millis(40));
                }
                Err(error) => break Err(error),
            }
        };
        let stderr_text = stderr_handle.join().unwrap_or_default();
        let trimmed_text = accumulated.trim().to_string();
        let final_text = if trimmed_text.is_empty() {
            accumulated.clone()
        } else {
            trimmed_text
        };

        let completion = match read_error {
            Some(error) => LocalLlmStreamCompleteEvent {
                request_id,
                profile_id,
                success: false,
                text: String::new(),
                error: Some(error),
            },
            None => match wait_result {
                Ok(exit_status) if exit_status.success() => LocalLlmStreamCompleteEvent {
                    request_id,
                    profile_id,
                    success: true,
                    text: final_text,
                    error: None,
                },
                Ok(exit_status) => {
                    let stderr_trimmed = stderr_text.trim().to_string();
                    let stdout_trimmed = final_text.trim().to_string();
                    let error = if !stderr_trimmed.is_empty() {
                        stderr_trimmed
                    } else if !stdout_trimmed.is_empty() {
                        stdout_trimmed
                    } else {
                        format!("LiteRT-LM exited with status {exit_status}")
                    };
                    LocalLlmStreamCompleteEvent {
                        request_id,
                        profile_id,
                        success: false,
                        text: String::new(),
                        error: Some(error),
                    }
                }
                Err(error) => LocalLlmStreamCompleteEvent {
                    request_id,
                    profile_id,
                    success: false,
                    text: String::new(),
                    error: Some(format!("Failed to wait for LiteRT-LM process: {error}")),
                },
            },
        };

        if let Ok(mut registry) = registry_state.lock() {
            registry.processes.remove(&completion.request_id);
        }

        let _ = app_handle.emit("local-llm-complete", completion);
    });

    Ok(())
}

#[tauri::command]
pub fn local_llm_cancel_stream(
    request: LocalLlmCancelStreamRequest,
    state: tauri::State<'_, Arc<Mutex<LocalLlmProcessRegistry>>>,
) -> Result<bool, String> {
    let request_id = validate_execution_id(&request.request_id)?;
    let child = {
        let registry = state
            .lock()
            .map_err(|_| "LiteRT-LM process registry lock was poisoned".to_string())?;
        registry.processes.get(&request_id).cloned()
    };

    let Some(child) = child else {
        return Ok(false);
    };

    let mut child_guard = child
        .lock()
        .map_err(|_| "LiteRT-LM process lock was poisoned".to_string())?;
    match child_guard.kill() {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => Ok(false),
        Err(error) => Err(format!("Failed to stop LiteRT-LM process: {error}")),
    }
}

#[tauri::command]
pub fn local_tts_get_status() -> LocalTtsStatus {
    build_local_tts_status()
}

#[tauri::command]
pub fn local_tts_speak_text(
    request: LocalTtsSpeakRequest,
    state: tauri::State<'_, Arc<Mutex<LocalLlmProcessRegistry>>>,
) -> Result<bool, String> {
    stop_active_tts_process(state.inner())?;

    let (mut command, _backend) = build_native_tts_command(&request)?;
    let child = Arc::new(Mutex::new(
        command
            .spawn()
            .map_err(|error| format!("Failed to start native local TTS: {error}"))?,
    ));
    let request_id = Uuid::new_v4().to_string();

    {
        let mut registry = state
            .lock()
            .map_err(|_| "Local TTS process registry lock was poisoned".to_string())?;
        registry.active_tts_process = Some((request_id.clone(), Arc::clone(&child)));
    }

    let registry_state = Arc::clone(state.inner());
    thread::spawn(move || {
        if let Ok(mut child_guard) = child.lock() {
            let _ = child_guard.wait();
        }
        if let Ok(mut registry) = registry_state.lock() {
            let should_clear = registry
                .active_tts_process
                .as_ref()
                .map(|(active_id, _)| active_id == &request_id)
                .unwrap_or(false);
            if should_clear {
                registry.active_tts_process = None;
            }
        }
    });

    Ok(true)
}

#[tauri::command]
pub fn local_tts_stop_speaking(
    state: tauri::State<'_, Arc<Mutex<LocalLlmProcessRegistry>>>,
) -> Result<bool, String> {
    stop_active_tts_process(state.inner())
}
