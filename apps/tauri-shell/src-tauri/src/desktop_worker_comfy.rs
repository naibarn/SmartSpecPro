use reqwest::blocking::Client;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

fn default_submit_path() -> String {
    "/prompt".into()
}

fn default_history_path_template() -> String {
    "/history/{promptId}".into()
}

fn default_view_path() -> String {
    "/view".into()
}

fn default_poll_interval_ms() -> u64 {
    2_000
}

fn default_timeout_seconds() -> u64 {
    600
}

fn default_local_only() -> bool {
    true
}

fn default_image_width() -> u32 {
    1_024
}

fn default_image_height() -> u32 {
    1_024
}

fn default_batch_size() -> u32 {
    1
}

fn default_steps() -> u32 {
    30
}

fn default_cfg_scale() -> f32 {
    7.0
}

fn default_sampler_name() -> String {
    "euler".into()
}

fn default_gpu_required() -> bool {
    true
}

fn default_publish_images_to_library() -> bool {
    true
}

fn default_publish_manifest_to_library() -> bool {
    true
}

fn default_publish_output_files_to_library() -> bool {
    true
}

fn default_trigger_indexing() -> bool {
    true
}

fn default_max_images() -> u32 {
    8
}

fn default_max_output_files() -> u32 {
    16
}

fn default_fail_on_missing_outputs() -> bool {
    true
}

fn default_expected_output_types() -> Vec<String> {
    vec!["images".into()]
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyServiceBinding {
    pub base_url: String,
    #[serde(default = "default_submit_path")]
    pub submit_path: String,
    #[serde(default = "default_history_path_template")]
    pub history_path_template: String,
    #[serde(default = "default_view_path")]
    pub view_path: String,
    pub client_id: Option<String>,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: u64,
    #[serde(default = "default_local_only")]
    pub local_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyImageGenerationSpec {
    pub prompt_summary: String,
    pub negative_prompt_summary: Option<String>,
    #[serde(default = "default_image_width")]
    pub width: u32,
    #[serde(default = "default_image_height")]
    pub height: u32,
    #[serde(default = "default_batch_size")]
    pub batch_size: u32,
    #[serde(default = "default_steps")]
    pub steps: u32,
    #[serde(default = "default_cfg_scale")]
    pub cfg_scale: f32,
    #[serde(default = "default_sampler_name")]
    pub sampler_name: String,
    pub seed: Option<i64>,
    pub model_checkpoint: Option<String>,
    #[serde(default = "default_gpu_required")]
    pub gpu_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyImageGenerationOutputTargets {
    #[serde(default = "default_publish_images_to_library")]
    pub publish_images_to_library: bool,
    #[serde(default = "default_publish_manifest_to_library")]
    pub publish_manifest_to_library: bool,
    #[serde(default = "default_trigger_indexing")]
    pub trigger_indexing: bool,
    #[serde(default = "default_max_images")]
    pub max_images: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyImageGenerationJobSpec {
    pub service: ComfyServiceBinding,
    #[serde(default)]
    pub workflow_json: Value,
    pub generation_spec: ComfyImageGenerationSpec,
    pub output_targets: ComfyImageGenerationOutputTargets,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyWorkflowExecutionPolicy {
    #[serde(default = "default_expected_output_types")]
    pub expected_output_types: Vec<String>,
    #[serde(default = "default_gpu_required")]
    pub gpu_required: bool,
    #[serde(default = "default_fail_on_missing_outputs")]
    pub fail_on_missing_outputs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyWorkflowRunOutputTargets {
    #[serde(default = "default_publish_output_files_to_library")]
    pub publish_output_files_to_library: bool,
    #[serde(default = "default_publish_manifest_to_library")]
    pub publish_manifest_to_library: bool,
    #[serde(default = "default_trigger_indexing")]
    pub trigger_indexing: bool,
    #[serde(default = "default_max_output_files")]
    pub max_output_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyWorkflowRunJobSpec {
    pub service: ComfyServiceBinding,
    #[serde(default)]
    pub workflow_json: Value,
    pub workflow_label: Option<String>,
    pub execution_policy: ComfyWorkflowExecutionPolicy,
    pub output_targets: ComfyWorkflowRunOutputTargets,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComfyExecutionError {
    pub failure_code: &'static str,
    pub message: String,
}

impl ComfyExecutionError {
    fn new(failure_code: &'static str, message: impl Into<String>) -> Self {
        Self {
            failure_code,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyDownloadedOutput {
    pub output_kind: String,
    pub node_id: String,
    pub file_name: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyExecutionResult {
    pub workspace_root: String,
    pub output_dir: String,
    pub manifest_path: String,
    pub prompt_id: String,
    pub publish_outputs_to_library: bool,
    pub publish_manifest_to_library: bool,
    pub trigger_indexing: bool,
    pub downloaded_outputs: Vec<ComfyDownloadedOutput>,
}

#[derive(Debug, Clone)]
struct ComfyOutputDescriptor {
    output_kind: String,
    node_id: String,
    filename: Option<String>,
    subfolder: Option<String>,
    storage_type: Option<String>,
    inline_text: Option<String>,
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

fn content_type_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("mp4") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("txt") => "text/plain",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn validate_loopback_base_url(service: &ComfyServiceBinding) -> Result<Url, ComfyExecutionError> {
    let base_url = Url::parse(service.base_url.trim()).map_err(|error| {
        ComfyExecutionError::new(
            "adapter_contract_violation",
            format!("invalid ComfyUI base URL: {error}"),
        )
    })?;

    if base_url.username() != "" || base_url.password().is_some() {
        return Err(ComfyExecutionError::new(
            "adapter_contract_violation",
            "ComfyUI base URL must not embed credentials",
        ));
    }

    if service.local_only {
        let Some(host) = base_url.host_str() else {
            return Err(ComfyExecutionError::new(
                "adapter_contract_violation",
                "ComfyUI base URL host is missing",
            ));
        };
        let normalized_host = host.trim().to_ascii_lowercase();
        let is_loopback = normalized_host == "localhost"
            || normalized_host == "127.0.0.1"
            || normalized_host == "::1"
            || normalized_host == "[::1]";
        if !is_loopback {
            return Err(ComfyExecutionError::new(
                "adapter_contract_violation",
                "ComfyUI local-only services must use a loopback base URL",
            ));
        }
    }

    Ok(base_url)
}

fn join_url(base_url: &Url, path: &str) -> Result<Url, ComfyExecutionError> {
    base_url.join(path).map_err(|error| {
        ComfyExecutionError::new(
            "adapter_contract_violation",
            format!("invalid ComfyUI route path {path}: {error}"),
        )
    })
}

fn parse_json_response(
    response: reqwest::blocking::Response,
    failure_code: &'static str,
    error_context: &str,
) -> Result<Value, ComfyExecutionError> {
    let body = response.text().map_err(|error| {
        ComfyExecutionError::new(
            failure_code,
            format!("{error_context}: failed to read response body: {error}"),
        )
    })?;
    serde_json::from_str(&body).map_err(|error| {
        ComfyExecutionError::new(
            failure_code,
            format!("{error_context}: failed to parse JSON body: {error}"),
        )
    })
}

fn canonicalize_workspace_dir(workspace_dir: &str) -> Result<PathBuf, ComfyExecutionError> {
    let path = PathBuf::from(workspace_dir);
    if !path.is_absolute() {
        return Err(ComfyExecutionError::new(
            "adapter_contract_violation",
            format!("workspace directory must be absolute: {workspace_dir}"),
        ));
    }
    fs::create_dir_all(&path).map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to create workspace directory: {error}"),
        )
    })?;
    path.canonicalize().map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to canonicalize workspace directory: {error}"),
        )
    })
}

fn build_client(timeout_seconds: u64) -> Result<Client, ComfyExecutionError> {
    Client::builder()
        .timeout(Duration::from_secs(timeout_seconds.clamp(5, 3_600)))
        .build()
        .map_err(|error| {
            ComfyExecutionError::new(
                "service_unreachable",
                format!("failed to build ComfyUI HTTP client: {error}"),
            )
        })
}

fn ensure_nonempty_workflow_json(workflow_json: &Value, job_type: &str) -> Result<(), ComfyExecutionError> {
    let is_nonempty_object = workflow_json
        .as_object()
        .map(|object| !object.is_empty())
        .unwrap_or(false);
    if !is_nonempty_object {
        return Err(ComfyExecutionError::new(
            "adapter_contract_violation",
            format!("{job_type} requires a non-empty workflow_json object"),
        ));
    }
    Ok(())
}

fn submit_prompt(
    client: &Client,
    base_url: &Url,
    service: &ComfyServiceBinding,
    workflow_json: &Value,
) -> Result<String, ComfyExecutionError> {
    let url = join_url(base_url, &service.submit_path)?;
    let mut body = json!({ "prompt": workflow_json });
    if let Some(client_id) = service.client_id.as_ref().filter(|value| !value.trim().is_empty()) {
        body["client_id"] = json!(client_id);
    }

    let response = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "SmartSpecPro-Tauri/0.1")
        .body(serde_json::to_vec(&body).map_err(|error| {
            ComfyExecutionError::new(
                "adapter_contract_violation",
                format!("failed to serialize ComfyUI prompt body: {error}"),
            )
        })?)
        .send()
        .map_err(|error| {
            ComfyExecutionError::new(
                "service_unreachable",
                format!("failed to submit ComfyUI prompt: {error}"),
            )
        })?;

    let status = response.status();
    let payload = parse_json_response(
        response,
        "workflow_rejected",
        "failed to parse ComfyUI prompt response",
    )?;

    if !status.is_success() {
        return Err(ComfyExecutionError::new(
            "workflow_rejected",
            format!("ComfyUI rejected the workflow request: {payload}"),
        ));
    }

    payload
        .get("prompt_id")
        .and_then(Value::as_str)
        .filter(|value: &&str| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            ComfyExecutionError::new(
                "workflow_rejected",
                "ComfyUI response did not include prompt_id",
            )
        })
}

fn normalize_history_outputs(payload: &Value, prompt_id: &str) -> Option<Value> {
    if payload.get("outputs").is_some() {
        return Some(payload.clone());
    }
    payload
        .get(prompt_id)
        .filter(|value| value.get("outputs").is_some())
        .cloned()
}

fn poll_history_until_outputs(
    client: &Client,
    base_url: &Url,
    service: &ComfyServiceBinding,
    prompt_id: &str,
) -> Result<Value, ComfyExecutionError> {
    let history_path = service.history_path_template.replace("{promptId}", prompt_id);
    let history_url = join_url(base_url, &history_path)?;
    let deadline = Instant::now() + Duration::from_secs(service.timeout_seconds.clamp(5, 3_600));

    loop {
        let response = client
            .get(history_url.clone())
            .header("Accept", "application/json")
            .header("User-Agent", "SmartSpecPro-Tauri/0.1")
            .send()
            .map_err(|error| {
                ComfyExecutionError::new(
                    "service_unreachable",
                    format!("failed to poll ComfyUI history: {error}"),
                )
            })?;

        let payload = parse_json_response(
            response,
            "service_unreachable",
            "failed to parse ComfyUI history response",
        )?;

        if let Some(history_entry) = normalize_history_outputs(&payload, prompt_id) {
            let has_outputs = history_entry
                .get("outputs")
                .and_then(Value::as_object)
                .map(|outputs| !outputs.is_empty())
                .unwrap_or(false);
            if has_outputs {
                return Ok(history_entry);
            }
        }

        if Instant::now() >= deadline {
            return Err(ComfyExecutionError::new(
                "execution_timeout",
                format!("ComfyUI prompt {prompt_id} did not finish before the timeout"),
            ));
        }

        thread::sleep(Duration::from_millis(service.poll_interval_ms.clamp(250, 30_000)));
    }
}

fn collect_output_descriptors(history_entry: &Value) -> Vec<ComfyOutputDescriptor> {
    let mut descriptors = Vec::new();
    let Some(outputs) = history_entry.get("outputs").and_then(Value::as_object) else {
        return descriptors;
    };

    for (node_id, node_output) in outputs {
        let Some(node_object) = node_output.as_object() else {
            continue;
        };

        for (key, value) in node_object {
            match key.as_str() {
                "images" | "videos" | "audio" | "files" | "gifs" => {
                    let output_kind = if key == "gifs" { "videos" } else { key.as_str() };
                    let Some(entries) = value.as_array() else {
                        continue;
                    };
                    for entry in entries {
                        let filename = entry.get("filename").and_then(Value::as_str);
                        if filename.is_none() {
                            continue;
                        }
                        descriptors.push(ComfyOutputDescriptor {
                            output_kind: output_kind.into(),
                            node_id: node_id.clone(),
                            filename: filename.map(str::to_string),
                            subfolder: entry
                                .get("subfolder")
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            storage_type: entry
                                .get("type")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .or_else(|| Some("output".into())),
                            inline_text: None,
                        });
                    }
                }
                "text" => {
                    if let Some(entries) = value.as_array() {
                        for (index, entry) in entries.iter().enumerate() {
                            let text_value = entry
                                .get("text")
                                .and_then(Value::as_str)
                                .or_else(|| entry.as_str());
                            if let Some(text) = text_value {
                                descriptors.push(ComfyOutputDescriptor {
                                    output_kind: "text".into(),
                                    node_id: node_id.clone(),
                                    filename: Some(format!("{}_text_{}.txt", sanitize_name(node_id), index + 1)),
                                    subfolder: None,
                                    storage_type: None,
                                    inline_text: Some(text.to_string()),
                                });
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    descriptors
}

fn filter_output_descriptors(
    descriptors: Vec<ComfyOutputDescriptor>,
    expected_output_types: &[String],
    fail_on_missing_outputs: bool,
    max_files: u32,
) -> Result<Vec<ComfyOutputDescriptor>, ComfyExecutionError> {
    let expected = expected_output_types
        .iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    let matching = descriptors
        .into_iter()
        .filter(|descriptor| expected.contains(&descriptor.output_kind))
        .take(max_files.max(1) as usize)
        .collect::<Vec<_>>();

    if matching.is_empty() && fail_on_missing_outputs {
        return Err(ComfyExecutionError::new(
            "unsupported_output",
            format!(
                "ComfyUI did not produce any expected outputs for kinds: {}",
                expected.join(", ")
            ),
        ));
    }

    Ok(matching)
}

fn write_manifest(
    manifest_path: &Path,
    manifest_json: &Value,
) -> Result<(), ComfyExecutionError> {
    let bytes = serde_json::to_vec_pretty(manifest_json).map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to serialize ComfyUI manifest: {error}"),
        )
    })?;
    fs::write(manifest_path, bytes).map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to write ComfyUI manifest: {error}"),
        )
    })
}

fn download_output_descriptor(
    client: &Client,
    base_url: &Url,
    service: &ComfyServiceBinding,
    descriptor: &ComfyOutputDescriptor,
    output_dir: &Path,
) -> Result<ComfyDownloadedOutput, ComfyExecutionError> {
    fs::create_dir_all(output_dir).map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to create ComfyUI output directory: {error}"),
        )
    })?;

    let file_name = descriptor
        .filename
        .as_ref()
        .map(|value| sanitize_name(value))
        .unwrap_or_else(|| format!("{}_artifact.bin", sanitize_name(&descriptor.node_id)));
    let target_path = output_dir.join(&file_name);

    if let Some(text) = descriptor.inline_text.as_ref() {
        fs::write(&target_path, text).map_err(|error| {
            ComfyExecutionError::new(
                "artifact_publish_failed",
                format!("failed to write ComfyUI text output: {error}"),
            )
        })?;
    } else {
        let mut view_url = join_url(base_url, &service.view_path)?;
        {
            let mut pairs = view_url.query_pairs_mut();
            if let Some(filename) = descriptor.filename.as_ref() {
                pairs.append_pair("filename", filename);
            }
            if let Some(subfolder) = descriptor.subfolder.as_ref() {
                pairs.append_pair("subfolder", subfolder);
            }
            pairs.append_pair(
                "type",
                descriptor.storage_type.as_deref().unwrap_or("output"),
            );
        }

        let response = client
            .get(view_url)
            .header("User-Agent", "SmartSpecPro-Tauri/0.1")
            .send()
            .map_err(|error| {
                ComfyExecutionError::new(
                    "service_unreachable",
                    format!("failed to download ComfyUI output: {error}"),
                )
            })?;

        if !response.status().is_success() {
            return Err(ComfyExecutionError::new(
                "service_unreachable",
                format!("ComfyUI view endpoint returned HTTP {}", response.status()),
            ));
        }

        let bytes = response.bytes().map_err(|error| {
            ComfyExecutionError::new(
                "service_unreachable",
                format!("failed to read ComfyUI output bytes: {error}"),
            )
        })?;

        fs::write(&target_path, bytes).map_err(|error| {
            ComfyExecutionError::new(
                "artifact_publish_failed",
                format!("failed to persist ComfyUI output file: {error}"),
            )
        })?;
    }

    let relative_path = target_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.clone());
    let absolute_path = target_path.canonicalize().unwrap_or(target_path.clone());

    Ok(ComfyDownloadedOutput {
        output_kind: descriptor.output_kind.clone(),
        node_id: descriptor.node_id.clone(),
        file_name: file_name.clone(),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        relative_path,
        content_type: content_type_for_path(&target_path),
    })
}

fn execute_comfy_job(
    job_id: &str,
    workspace_dir: &str,
    service: &ComfyServiceBinding,
    workflow_json: &Value,
    expected_output_types: &[String],
    fail_on_missing_outputs: bool,
    max_files: u32,
    publish_outputs_to_library: bool,
    publish_manifest_to_library: bool,
    trigger_indexing: bool,
    manifest_metadata: Value,
) -> Result<ComfyExecutionResult, ComfyExecutionError> {
    if job_id.trim().is_empty() {
        return Err(ComfyExecutionError::new(
            "adapter_contract_violation",
            "job_id is required",
        ));
    }

    ensure_nonempty_workflow_json(workflow_json, "ComfyUI job")?;
    let base_url = validate_loopback_base_url(service)?;
    let client = build_client(service.timeout_seconds)?;
    let workspace_root = canonicalize_workspace_dir(workspace_dir)?;
    let job_workspace = workspace_root.join(sanitize_name(job_id));
    let output_dir = job_workspace.join("outputs").join("comfy");
    fs::create_dir_all(&output_dir).map_err(|error| {
        ComfyExecutionError::new(
            "artifact_publish_failed",
            format!("failed to create ComfyUI job output directory: {error}"),
        )
    })?;

    let prompt_id = submit_prompt(&client, &base_url, service, workflow_json)?;
    let history_entry = poll_history_until_outputs(&client, &base_url, service, &prompt_id)?;
    let descriptors = collect_output_descriptors(&history_entry);
    let matching_descriptors = filter_output_descriptors(
        descriptors,
        expected_output_types,
        fail_on_missing_outputs,
        max_files,
    )?;

    let downloaded_outputs = matching_descriptors
        .iter()
        .map(|descriptor| download_output_descriptor(&client, &base_url, service, descriptor, &output_dir))
        .collect::<Result<Vec<_>, _>>()?;

    let manifest_path = output_dir.join("comfy_execution_manifest.json");
    let manifest_json = json!({
        "promptId": prompt_id,
        "outputCount": downloaded_outputs.len(),
        "publishOutputsToLibrary": publish_outputs_to_library,
        "publishManifestToLibrary": publish_manifest_to_library,
        "triggerIndexing": trigger_indexing,
        "expectedOutputTypes": expected_output_types,
        "outputs": downloaded_outputs.iter().map(|output| json!({
            "outputKind": output.output_kind,
            "nodeId": output.node_id,
            "fileName": output.file_name,
            "relativePath": output.relative_path,
            "contentType": output.content_type,
        })).collect::<Vec<_>>(),
        "metadata": manifest_metadata,
    });
    write_manifest(&manifest_path, &manifest_json)?;

    Ok(ComfyExecutionResult {
        workspace_root: job_workspace.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        prompt_id,
        publish_outputs_to_library,
        publish_manifest_to_library,
        trigger_indexing,
        downloaded_outputs,
    })
}

pub fn execute_comfy_image_generation(
    job_id: &str,
    workspace_dir: &str,
    job: &ComfyImageGenerationJobSpec,
) -> Result<ComfyExecutionResult, ComfyExecutionError> {
    execute_comfy_job(
        job_id,
        workspace_dir,
        &job.service,
        &job.workflow_json,
        &[String::from("images")],
        true,
        job.output_targets.max_images,
        job.output_targets.publish_images_to_library,
        job.output_targets.publish_manifest_to_library,
        job.output_targets.trigger_indexing,
        json!({
            "jobType": "comfy_image_generation",
            "generationSpec": {
                "promptSummary": job.generation_spec.prompt_summary,
                "negativePromptSummary": job.generation_spec.negative_prompt_summary,
                "width": job.generation_spec.width,
                "height": job.generation_spec.height,
                "batchSize": job.generation_spec.batch_size,
                "steps": job.generation_spec.steps,
                "cfgScale": job.generation_spec.cfg_scale,
                "samplerName": job.generation_spec.sampler_name,
                "seed": job.generation_spec.seed,
                "modelCheckpoint": job.generation_spec.model_checkpoint,
                "gpuRequired": job.generation_spec.gpu_required,
            },
        }),
    )
}

pub fn execute_comfy_workflow_run(
    job_id: &str,
    workspace_dir: &str,
    job: &ComfyWorkflowRunJobSpec,
) -> Result<ComfyExecutionResult, ComfyExecutionError> {
    execute_comfy_job(
        job_id,
        workspace_dir,
        &job.service,
        &job.workflow_json,
        &job.execution_policy.expected_output_types,
        job.execution_policy.fail_on_missing_outputs,
        job.output_targets.max_output_files,
        job.output_targets.publish_output_files_to_library,
        job.output_targets.publish_manifest_to_library,
        job.output_targets.trigger_indexing,
        json!({
            "jobType": "comfy_workflow_run",
            "workflowLabel": job.workflow_label,
            "executionPolicy": {
                "expectedOutputTypes": job.execution_policy.expected_output_types,
                "gpuRequired": job.execution_policy.gpu_required,
                "failOnMissingOutputs": job.execution_policy.fail_on_missing_outputs,
            },
        }),
    )
}
