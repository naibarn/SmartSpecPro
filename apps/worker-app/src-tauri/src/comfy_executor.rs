//! Small, typed ComfyUI adapter for the desktop worker.
//!
//! The server owns authorization, job admission, billing, and publication.
//! This module only talks to an authenticated worker's registered loopback
//! ComfyUI service, stages output files in the job workspace, and returns
//! bounded artifact descriptors for the existing control-plane uploader.

use reqwest::{Client, Url};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::hermes_executor::FfprobeCheckResult;

const COMFY_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const COMFY_MAX_OUTPUT_FILES: usize = 64;
const COMFY_MAX_OUTPUT_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComfyArtifactFile {
    pub path: PathBuf,
    pub file_name: String,
    pub content_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComfyExecutionResult {
    pub prompt_id: String,
    pub files: Vec<ComfyArtifactFile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComfyServiceBinding {
    pub base_url: String,
    pub submit_path: String,
    pub history_path_template: String,
    pub view_path: String,
    pub client_id: Option<String>,
    pub poll_interval_ms: u64,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComfyReadiness {
    pub ready: bool,
    pub reason: String,
}

fn normalized_loopback_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|error| format!("invalid ComfyUI URL: {error}"))?;
    let loopback = matches!(
        url.host_str(),
        Some("127.0.0.1") | Some("localhost") | Some("[::1]") | Some("::1")
    );
    if url.scheme() != "http" || !loopback || url.username() != "" || url.password().is_some() {
        return Err("ComfyUI must be an unauthenticated HTTP loopback service".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("ComfyUI base URL must not contain query or fragment data".into());
    }
    Ok(url)
}

/// The server may describe the Comfy API shape, but it must never redirect a
/// worker to a different local service than the one the operator registered in
/// Worker App settings. Compare the normalized URL before any request is made.
pub fn validate_registered_service(
    job_base_url: &str,
    registered_base_url: &str,
) -> Result<(), String> {
    let job = normalized_loopback_url(job_base_url)?;
    let registered = normalized_loopback_url(registered_base_url)?;
    if job != registered {
        return Err(
            "ComfyUI job service does not match the Worker App registered local service".into(),
        );
    }
    Ok(())
}

fn endpoint(base: &Url, path: &str) -> Result<Url, String> {
    let normalized = path.strip_prefix('/').unwrap_or(path);
    if normalized.is_empty()
        || normalized.contains('?')
        || normalized.contains('#')
        || normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("ComfyUI endpoint path is invalid".into());
    }
    base.join(normalized)
        .map_err(|error| format!("invalid ComfyUI endpoint: {error}"))
}

fn history_path(template: &str, prompt_id: &str) -> Result<String, String> {
    if !template.contains("{promptId}") {
        return Err("ComfyUI history path must include {promptId}".into());
    }
    let path = template.replace("{promptId}", prompt_id);
    if path.contains('{') || path.contains('}') {
        return Err("ComfyUI history path contains an unsupported placeholder".into());
    }
    Ok(path)
}

pub async fn check_readiness(base_url: &str) -> ComfyReadiness {
    let base = match normalized_loopback_url(base_url) {
        Ok(value) => value,
        Err(reason) => {
            return ComfyReadiness {
                ready: false,
                reason,
            }
        }
    };
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(value) => value,
        Err(error) => {
            return ComfyReadiness {
                ready: false,
                reason: format!("ComfyUI HTTP client unavailable: {error}"),
            }
        }
    };
    let url = match endpoint(&base, "system_stats") {
        Ok(value) => value,
        Err(reason) => {
            return ComfyReadiness {
                ready: false,
                reason,
            }
        }
    };
    match client.get(url).send().await {
        Ok(response) if response.status().is_success() => ComfyReadiness {
            ready: true,
            reason: "system_stats_ok".into(),
        },
        Ok(response) => ComfyReadiness {
            ready: false,
            reason: format!("ComfyUI readiness returned HTTP {}", response.status()),
        },
        Err(error) => ComfyReadiness {
            ready: false,
            reason: format!("ComfyUI is unreachable: {error}"),
        },
    }
}

fn safe_component(value: &str, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 255 {
        return Err(format!("ComfyUI {field} is empty or too long"));
    }
    let path = Path::new(trimmed);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        || path.file_name().and_then(|name| name.to_str()) != Some(trimmed)
    {
        return Err(format!("ComfyUI {field} must be a single safe file name"));
    }
    Ok(trimmed.into())
}

fn safe_subfolder(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 512 {
        return Err("ComfyUI output subfolder is empty or too long".into());
    }
    let path = Path::new(trimmed);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("ComfyUI output subfolder must be a safe relative path".into());
    }
    Ok(trimmed.into())
}

fn content_type(file_name: &str) -> Option<&'static str> {
    let extension = Path::new(file_name)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => return None,
    })
}

fn detect_image_format(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn validate_downloaded_output(
    path: &Path,
    declared_content_type: &str,
    ffprobe: &(dyn Fn(&Path) -> FfprobeCheckResult + Send + Sync),
) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|error| format!("ComfyUI output read failed: {error}"))?;
    if bytes.is_empty() {
        return Err("ComfyUI output is empty".into());
    }
    if declared_content_type.starts_with("video/") {
        let probe = ffprobe(path);
        if !probe.ok || !probe.has_video_stream {
            return Err("ComfyUI video output failed ffprobe validation".into());
        }
    } else if detect_image_format(&bytes) != Some(declared_content_type) {
        return Err("ComfyUI image output failed magic-byte validation".into());
    }
    Ok(())
}

fn output_entries(history: &Value) -> Vec<(String, String, String)> {
    let mut entries = Vec::new();
    let Some(outputs) = history.get("outputs").and_then(Value::as_object) else {
        return entries;
    };
    for output in outputs.values() {
        for key in ["images", "gifs", "videos"] {
            let Some(items) = output.get(key).and_then(Value::as_array) else {
                continue;
            };
            for item in items {
                let Some(file_name) = item.get("filename").and_then(Value::as_str) else {
                    continue;
                };
                let subfolder = item.get("subfolder").and_then(Value::as_str).unwrap_or("");
                let output_type = item.get("type").and_then(Value::as_str).unwrap_or("output");
                entries.push((
                    file_name.to_string(),
                    subfolder.to_string(),
                    output_type.to_string(),
                ));
                if entries.len() >= COMFY_MAX_OUTPUT_FILES {
                    return entries;
                }
            }
        }
    }
    entries
}

fn is_complete(history: &Value) -> bool {
    history
        .get("status")
        .and_then(|status| status.get("completed"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || history
            .get("status")
            .and_then(|status| status.get("status_str"))
            .and_then(Value::as_str)
            .is_some_and(|value| value.eq_ignore_ascii_case("success"))
}

fn failure_message(history: &Value) -> Option<String> {
    let status = history.get("status")?.get("status_str")?.as_str()?;
    (!status.eq_ignore_ascii_case("success") && !status.eq_ignore_ascii_case("running"))
        .then(|| format!("ComfyUI execution ended with status {status}"))
}

pub async fn execute_workflow(
    service: &ComfyServiceBinding,
    workflow: &Map<String, Value>,
    workspace_dir: &Path,
    cancel: &Arc<AtomicBool>,
    max_outputs: usize,
    ffprobe: &(dyn Fn(&Path) -> FfprobeCheckResult + Send + Sync),
) -> Result<ComfyExecutionResult, String> {
    let base = normalized_loopback_url(&service.base_url)?;
    let submit_path = endpoint(&base, &service.submit_path)?;
    let view_path = endpoint(&base, &service.view_path)?;
    let poll_interval = Duration::from_millis(service.poll_interval_ms.clamp(250, 30_000));
    let timeout_seconds = service.timeout_seconds.clamp(5, 3_600);
    let max_polls = ((timeout_seconds * 1_000) + poll_interval.as_millis() as u64 - 1)
        / poll_interval.as_millis() as u64;
    if workflow.is_empty() {
        return Err("ComfyUI workflow is empty".into());
    }
    let max_outputs = max_outputs.clamp(1, COMFY_MAX_OUTPUT_FILES);
    fs::create_dir_all(workspace_dir)
        .map_err(|error| format!("failed to create ComfyUI workspace: {error}"))?;
    let client = Client::builder()
        .timeout(COMFY_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let prompt_response = client
        .post(submit_path)
        .json(&json!({
            "prompt": workflow,
            "client_id": service.client_id.clone().unwrap_or_else(|| {
                format!("smartaihub-worker-{}", std::process::id())
            }),
        }))
        .send()
        .await
        .map_err(|error| format!("ComfyUI submit failed: {error}"))?;
    let prompt_status = prompt_response.status();
    let prompt_body: Value = prompt_response
        .json()
        .await
        .map_err(|error| format!("invalid ComfyUI submit response: {error}"))?;
    if !prompt_status.is_success() {
        return Err(format!("ComfyUI workflow rejected (HTTP {prompt_status})"));
    }
    let prompt_id = prompt_body
        .get("prompt_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "ComfyUI submit response did not contain prompt_id".to_string())?
        .to_string();
    if prompt_id.len() > 128
        || !prompt_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("ComfyUI returned an invalid prompt_id".into());
    }

    let history_url = endpoint(
        &base,
        &history_path(&service.history_path_template, &prompt_id)?,
    )?;
    let mut history = Value::Null;
    for _ in 0..max_polls {
        if cancel.load(Ordering::Relaxed) {
            let _ = client
                .post(endpoint(&base, "interrupt")?)
                .json(&json!({ "prompt_id": prompt_id }))
                .send()
                .await;
            return Err("ComfyUI job canceled".into());
        }
        let response = client
            .get(history_url.clone())
            .send()
            .await
            .map_err(|error| format!("ComfyUI history failed: {error}"))?;
        if response.status().is_success() {
            let body: Value = response
                .json()
                .await
                .map_err(|error| format!("invalid ComfyUI history response: {error}"))?;
            history = body.get(&prompt_id).cloned().unwrap_or(body);
            if let Some(message) = failure_message(&history) {
                return Err(message);
            }
            if is_complete(&history) {
                break;
            }
        }
        tokio::time::sleep(poll_interval).await;
    }
    if !is_complete(&history) {
        return Err("ComfyUI execution timed out".into());
    }

    let mut files = Vec::new();
    for (index, (file_name, subfolder, output_type)) in output_entries(&history)
        .into_iter()
        .enumerate()
        .take(max_outputs)
    {
        let safe_name = safe_component(&file_name, "output filename")?;
        let safe_subfolder = if subfolder.is_empty() {
            None
        } else {
            Some(safe_subfolder(&subfolder)?)
        };
        let mime = content_type(&safe_name)
            .ok_or_else(|| format!("unsupported ComfyUI output format: {safe_name}"))?;
        let response = client
            .get(view_path.clone())
            .query(&[
                ("filename", safe_name.as_str()),
                ("subfolder", safe_subfolder.as_deref().unwrap_or("")),
                ("type", output_type.as_str()),
            ])
            .send()
            .await
            .map_err(|error| format!("ComfyUI output download failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "ComfyUI output download returned HTTP {}",
                response.status()
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("ComfyUI output read failed: {error}"))?;
        if bytes.is_empty() || bytes.len() > COMFY_MAX_OUTPUT_BYTES {
            return Err("ComfyUI output is empty or exceeds the worker size limit".into());
        }
        let output_name = format!("{index:03}-{safe_name}");
        let path = workspace_dir.join(&output_name);
        fs::write(&path, &bytes)
            .map_err(|error| format!("failed to stage ComfyUI output: {error}"))?;
        validate_downloaded_output(&path, mime, ffprobe)?;
        files.push(ComfyArtifactFile {
            path,
            file_name: output_name,
            content_type: mime.into(),
        });
    }
    if files.is_empty() {
        return Err("ComfyUI completed without supported outputs".into());
    }
    Ok(ComfyExecutionResult { prompt_id, files })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_loopback_http_services() {
        assert!(normalized_loopback_url("http://127.0.0.1:8188").is_ok());
        assert!(normalized_loopback_url("http://localhost:8188/").is_ok());
        assert!(normalized_loopback_url("https://example.test").is_err());
        assert!(normalized_loopback_url("http://user:pass@127.0.0.1:8188").is_err());
    }

    #[test]
    fn worker_accepts_only_the_registered_local_service() {
        assert!(
            validate_registered_service("http://127.0.0.1:8188/", "http://127.0.0.1:8188").is_ok()
        );
        assert!(
            validate_registered_service("http://127.0.0.1:8189", "http://127.0.0.1:8188").is_err()
        );
        assert!(
            validate_registered_service("http://evil.test:8188", "http://127.0.0.1:8188").is_err()
        );
    }

    #[test]
    fn validates_custom_paths_and_prompt_placeholder() {
        assert!(endpoint(
            &normalized_loopback_url("http://127.0.0.1:8188").unwrap(),
            "/prompt"
        )
        .is_ok());
        assert!(endpoint(
            &normalized_loopback_url("http://127.0.0.1:8188").unwrap(),
            "/history/../secret"
        )
        .is_err());
        assert_eq!(
            history_path("/history/{promptId}", "abc-123").unwrap(),
            "/history/abc-123"
        );
        assert!(history_path("/history/latest", "abc-123").is_err());
    }

    #[test]
    fn output_entries_are_bounded_and_support_image_video_families() {
        let history = json!({"outputs": {"3": {"images": [{"filename":"a.png","subfolder":"","type":"output"}], "videos": [{"filename":"b.mp4","subfolder":"","type":"output"}]}}});
        let entries = output_entries(&history);
        assert_eq!(entries.len(), 2);
        assert_eq!(content_type(&entries[0].0), Some("image/png"));
        assert_eq!(content_type(&entries[1].0), Some("video/mp4"));
    }

    #[test]
    fn rejects_parent_output_names() {
        assert!(safe_component("../escape.png", "output filename").is_err());
        assert!(safe_component("/tmp/escape.png", "output filename").is_err());
        assert!(safe_subfolder("nested/frames").is_ok());
        assert!(safe_subfolder("../escape").is_err());
    }

    #[test]
    fn validates_image_magic_bytes_and_video_ffprobe_result() {
        fn passing_ffprobe(_: &Path) -> FfprobeCheckResult {
            FfprobeCheckResult {
                ok: true,
                has_video_stream: true,
            }
        }
        fn failing_ffprobe(_: &Path) -> FfprobeCheckResult {
            FfprobeCheckResult::default()
        }
        let workspace = tempfile::tempdir().unwrap();
        let image = workspace.path().join("image.png");
        fs::write(&image, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).unwrap();
        assert!(validate_downloaded_output(&image, "image/png", &passing_ffprobe).is_ok());

        let video = workspace.path().join("video.mp4");
        fs::write(&video, b"not-a-real-mp4").unwrap();
        assert!(validate_downloaded_output(&video, "video/mp4", &passing_ffprobe).is_ok());
        assert!(validate_downloaded_output(&video, "video/mp4", &failing_ffprobe).is_err());
    }
}
