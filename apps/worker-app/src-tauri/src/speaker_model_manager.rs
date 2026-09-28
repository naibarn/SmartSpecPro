//! Local Feature 179 model configuration and truthful capability probing.
//!
//! Model weights are user-owned files and are intentionally kept outside the
//! signed runtime archive. This module persists only an allow-listed path map,
//! applies it to the runner process, and never downloads or invents weights.

use crate::speaker_aware_adapters::{
    configure_bundled_runner, configured_runner, probe_configured_runner, AdapterPolicy,
    FallbackPolicy,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "speaker-models.json";

const ADAPTERS: &[&str] = &[
    "SileroOnnx",
    "FireRedOnnx",
    "TenVad",
    "WebRtcVad",
    "PyannoteDiarization",
    "MediaPipeFace",
    "PersonBody",
    "ActiveSpeakerFusion",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerModelConfig {
    #[serde(default)]
    pub paths: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerAdapterStatus {
    pub adapter_id: String,
    pub status: String,
    pub runtime: Option<String>,
    pub device: Option<String>,
    pub model_checksum: Option<String>,
    pub remediation_key: Option<String>,
    pub model_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerModelStatusResponse {
    pub runner_ready: bool,
    pub runner_path: Option<String>,
    pub runner_reason: Option<String>,
    pub adapters: Vec<SpeakerAdapterStatus>,
}

fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_FILE)
}

pub fn load(app_data_dir: &Path) -> SpeakerModelConfig {
    fs::read(config_path(app_data_dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(app_data_dir: &Path, config: &SpeakerModelConfig) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("speaker_model_config_directory: {error}"))?;
    let path = config_path(app_data_dir);
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("speaker_model_config_encode: {error}"))?;
    fs::write(&temporary, bytes).map_err(|error| format!("speaker_model_config_write: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("speaker_model_config_commit: {error}"))
}

fn env_name(adapter_id: &str) -> Option<&'static str> {
    match adapter_id {
        "SileroOnnx" => Some("SMARTAIHUB_SILERO_MODEL"),
        "FireRedOnnx" => Some("SMARTAIHUB_FIRERED_MODEL"),
        "TenVad" => Some("SMARTAIHUB_TENVAD_MODEL"),
        "PyannoteDiarization" => Some("SMARTAIHUB_PYANNOTE_MODEL"),
        "MediaPipeFace" => Some("SMARTAIHUB_MEDIAPIPE_FACE_MODEL"),
        "PersonBody" => Some("SMARTAIHUB_MEDIAPIPE_PERSON_MODEL"),
        _ => None,
    }
}

fn validate_adapter(adapter_id: &str) -> Result<(), String> {
    if ADAPTERS.contains(&adapter_id) {
        Ok(())
    } else {
        Err("speaker_model_unknown_adapter".into())
    }
}

pub fn apply(app_data_dir: &Path) {
    let config = load(app_data_dir);
    for adapter_id in ADAPTERS {
        if let Some(name) = env_name(adapter_id) {
            if let Some(path) = config.paths.get(*adapter_id) {
                std::env::set_var(name, path);
            }
        }
    }
}

fn app_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable: {error}"))?;
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource_dir_unavailable: {error}"))?;
    Ok((data, resource))
}

fn ensure_runner(data: &Path, resource: &Path) -> Result<String, String> {
    apply(data);
    configure_bundled_runner(resource, Some(data));
    probe_configured_runner()
}

fn fallback_status(adapter_id: &str, config: &SpeakerModelConfig) -> SpeakerAdapterStatus {
    let (status, remediation, runtime) = match adapter_id {
        "ActiveSpeakerFusion" => ("ready", None, Some("smartaihub-fusion")),
        "WebRtcVad" => (
            "missing_runtime",
            Some("install_webrtcvad"),
            Some("webrtcvad"),
        ),
        "FireRedOnnx" | "TenVad" => (
            "missing_runtime",
            Some("install_adapter_runtime"),
            Some("onnxruntime"),
        ),
        "PyannoteDiarization" => (
            "missing_model",
            Some("install_pyannote_model"),
            Some("pyannote.audio"),
        ),
        "MediaPipeFace" | "PersonBody" => (
            "missing_model",
            Some("install_mediapipe_model"),
            Some("mediapipe"),
        ),
        _ => ("missing_model", Some("install_model"), Some("onnxruntime")),
    };
    SpeakerAdapterStatus {
        adapter_id: adapter_id.into(),
        status: status.into(),
        runtime: runtime.map(str::to_string),
        device: None,
        model_checksum: None,
        remediation_key: remediation.map(str::to_string),
        model_path: config.paths.get(adapter_id).cloned(),
    }
}

pub fn capabilities(app: &AppHandle) -> Result<SpeakerModelStatusResponse, String> {
    let (data, resource) = app_dirs(app)?;
    let config = load(&data);
    let runner = match ensure_runner(&data, &resource) {
        Ok(path) => path,
        Err(reason) => {
            return Ok(SpeakerModelStatusResponse {
                runner_ready: false,
                runner_path: configured_runner(),
                runner_reason: Some(reason),
                adapters: ADAPTERS
                    .iter()
                    .map(|id| fallback_status(id, &config))
                    .collect(),
            })
        }
    };
    let mut probe = Command::new(&runner);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        probe.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = probe
        .arg("--capabilities")
        .output()
        .map_err(|error| format!("speaker_capabilities_unavailable: {error}"))?;
    if !output.status.success() {
        return Ok(SpeakerModelStatusResponse {
            runner_ready: false,
            runner_path: Some(runner),
            runner_reason: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
            adapters: ADAPTERS
                .iter()
                .map(|id| fallback_status(id, &config))
                .collect(),
        });
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("speaker_capabilities_invalid_json: {error}"))?;
    let adapters = value
        .get("adapterCapabilities")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|item| {
            let adapter_id = item
                .get("adapterId")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            SpeakerAdapterStatus {
                adapter_id: adapter_id.clone(),
                status: item
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("error")
                    .to_string(),
                runtime: item
                    .get("runtime")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                device: item
                    .get("device")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                model_checksum: item
                    .get("modelChecksum")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                remediation_key: item
                    .get("remediationKey")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                model_path: config.paths.get(&adapter_id).cloned(),
            }
        })
        .collect();
    Ok(SpeakerModelStatusResponse {
        runner_ready: true,
        runner_path: Some(runner),
        runner_reason: None,
        adapters,
    })
}

pub fn set_path(
    app: &AppHandle,
    adapter_id: &str,
    path: &str,
) -> Result<SpeakerModelStatusResponse, String> {
    validate_adapter(adapter_id)?;
    if env_name(adapter_id).is_none() {
        return Err("speaker_model_not_configurable".into());
    }
    let source = PathBuf::from(path.trim());
    if path.trim().is_empty() || !source.exists() {
        return Err("speaker_model_path_missing".into());
    }
    let canonical = source
        .canonicalize()
        .map_err(|_| "speaker_model_path_unreadable".to_string())?;
    let (data, _) = app_dirs(app)?;
    let mut config = load(&data);
    config
        .paths
        .insert(adapter_id.into(), canonical.to_string_lossy().into_owned());
    save(&data, &config)?;
    apply(&data);
    capabilities(app)
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("speaker_model_copy_directory: {error}"))?;
    for entry in
        fs::read_dir(source).map_err(|error| format!("speaker_model_read_directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("speaker_model_read_entry: {error}"))?;
        let target = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("speaker_model_read_metadata: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("speaker_model_symlink_not_allowed".into());
        }
        if metadata.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)
                .map_err(|error| format!("speaker_model_copy_file: {error}"))?;
        }
    }
    Ok(())
}

/// Import a user-selected model into the app-managed model directory. The
/// source is never modified and activation happens only after the copy is
/// complete, so an interrupted import leaves the previous configuration intact.
pub fn install_from_path(
    app: &AppHandle,
    adapter_id: &str,
    path: &str,
) -> Result<SpeakerModelStatusResponse, String> {
    validate_adapter(adapter_id)?;
    if env_name(adapter_id).is_none() {
        return Err("speaker_model_not_configurable".into());
    }
    let source = PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|_| "speaker_model_path_unreadable".to_string())?;
    if !source.exists() {
        return Err("speaker_model_path_missing".into());
    }
    let (data, _) = app_dirs(app)?;
    let destination_root = data.join("speaker-models").join(adapter_id);
    let destination_name = source
        .file_name()
        .ok_or_else(|| "speaker_model_filename_missing".to_string())?;
    let destination = destination_root.join(destination_name);
    let temporary = destination_root.with_extension("tmp");
    if temporary.exists() {
        let _ = fs::remove_dir_all(&temporary);
    }
    fs::create_dir_all(&temporary)
        .map_err(|error| format!("speaker_model_import_directory: {error}"))?;
    let temporary_target = temporary.join(destination_name);
    if source.is_dir() {
        copy_directory(&source, &temporary_target)?;
    } else {
        fs::copy(&source, &temporary_target)
            .map_err(|error| format!("speaker_model_import_copy: {error}"))?;
    }
    fs::create_dir_all(&destination_root)
        .map_err(|error| format!("speaker_model_destination_directory: {error}"))?;
    if destination.exists() {
        if destination.is_dir() {
            fs::remove_dir_all(&destination)
                .map_err(|error| format!("speaker_model_replace_directory: {error}"))?;
        } else {
            fs::remove_file(&destination)
                .map_err(|error| format!("speaker_model_replace_file: {error}"))?;
        }
    }
    fs::rename(&temporary_target, &destination)
        .map_err(|error| format!("speaker_model_import_commit: {error}"))?;
    let _ = fs::remove_dir_all(&temporary);
    set_path(app, adapter_id, &destination.to_string_lossy())
}

pub fn clear_path(app: &AppHandle, adapter_id: &str) -> Result<SpeakerModelStatusResponse, String> {
    validate_adapter(adapter_id)?;
    let (data, _) = app_dirs(app)?;
    let mut config = load(&data);
    config.paths.remove(adapter_id);
    if let Some(name) = env_name(adapter_id) {
        std::env::remove_var(name);
    }
    save(&data, &config)?;
    capabilities(app)
}

pub fn preflight(app: &AppHandle, policy: &AdapterPolicy) -> Result<(), String> {
    let status = capabilities(app)?;
    if !status.runner_ready {
        return Err(format!(
            "speaker_aware_preflight_blocked: {}",
            status
                .runner_reason
                .unwrap_or_else(|| "speaker-aware runner unavailable".into())
        ));
    }
    let ready = |id: &_| {
        status
            .adapters
            .iter()
            .any(|item| item.adapter_id == format!("{id:?}") && item.status == "ready")
    };
    for (name, stage) in [
        ("vad", &policy.vad),
        ("diarization", &policy.diarization),
        ("face", &policy.face),
        ("person", &policy.person),
        ("activeSpeaker", &policy.active_speaker),
    ] {
        if !stage.required {
            continue;
        }
        if ready(&stage.primary) {
            continue;
        }
        let fallback_ready = matches!(stage.fallback_policy, FallbackPolicy::AllowListed)
            && stage.fallback_allow_list.iter().any(|id| ready(id));
        if !fallback_ready {
            return Err(format!("speaker_aware_preflight_blocked: {name} primary adapter {:?} is not ready; install its model/runtime or select an explicit ready fallback", stage.primary));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_adapter() {
        assert!(validate_adapter("Nope").is_err());
    }
    #[test]
    fn model_env_names_are_allow_listed() {
        assert_eq!(env_name("SileroOnnx"), Some("SMARTAIHUB_SILERO_MODEL"));
        assert_eq!(env_name("ActiveSpeakerFusion"), None);
    }
}
