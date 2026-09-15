use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const UNIFIED_AUDIO_CAPABILITY: &str = "unified-audio-v2";
pub const UNIFIED_AUDIO_TTS_JOB_TYPE: &str = "tts_utterance_generate";
pub const UNIFIED_AUDIO_TRAINING_JOB_TYPE: &str = "voice_training_run";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TtsProviderMode {
    ReferenceClone,
    TranscriptClone,
    CatalogVoice,
    SyntheticDesign,
    TrainedVoice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TtsProviderTarget {
    WorkerLocal,
    ServerCloud,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TtsProviderManifest {
    pub provider_id: &'static str,
    pub model_id: &'static str,
    pub target: TtsProviderTarget,
    pub enabled: bool,
    pub transcript_optional: bool,
    pub min_reference_seconds: Option<u32>,
    pub max_reference_seconds: Option<u32>,
}

pub const LOCAL_PROVIDER_MANIFESTS: &[TtsProviderManifest] = &[
    TtsProviderManifest {
        provider_id: "voxcpm2",
        model_id: "VoxCPM2",
        target: TtsProviderTarget::WorkerLocal,
        enabled: true,
        transcript_optional: true,
        min_reference_seconds: Some(3),
        max_reference_seconds: Some(30),
    },
    TtsProviderManifest {
        provider_id: "confucius4-tts",
        model_id: "Confucius4-TTS",
        target: TtsProviderTarget::WorkerLocal,
        enabled: true,
        transcript_optional: true,
        min_reference_seconds: Some(3),
        max_reference_seconds: Some(30),
    },
    TtsProviderManifest {
        provider_id: "moss-tts",
        model_id: "MOSS-TTS",
        target: TtsProviderTarget::WorkerLocal,
        enabled: true,
        transcript_optional: true,
        min_reference_seconds: Some(3),
        max_reference_seconds: Some(30),
    },
    TtsProviderManifest {
        provider_id: "fish-speech",
        model_id: "Fish-Speech",
        target: TtsProviderTarget::WorkerLocal,
        enabled: false,
        transcript_optional: true,
        min_reference_seconds: Some(10),
        max_reference_seconds: Some(30),
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TtsAdmission {
    pub provider_id: String,
    pub model_id: String,
    pub mode: String,
    pub target: TtsProviderTarget,
    pub reference_ids: Vec<String>,
    pub trained_model_artifact_id: Option<String>,
}

pub fn provider_manifest(
    provider_id: &str,
    model_id: &str,
) -> Option<&'static TtsProviderManifest> {
    LOCAL_PROVIDER_MANIFESTS
        .iter()
        .find(|manifest| manifest.provider_id == provider_id && manifest.model_id == model_id)
}

pub fn local_runtime_command(app_data_dir: &Path) -> Option<PathBuf> {
    if let Ok(value) = std::env::var("SMARTSPEC_TTS_RUNTIME") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Some(path);
        }
    }
    let candidates = [
        app_data_dir
            .join("runtime-pack")
            .join("tts-runtime")
            .join("venv")
            .join("bin")
            .join("python"),
        app_data_dir
            .join("runtime-pack")
            .join("tts-runtime")
            .join("venv")
            .join("Scripts")
            .join("python.exe"),
    ];
    if let Some(path) = candidates.into_iter().find(|path| path.is_file()) {
        return Some(path);
    }
    let available = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };
    let mut command = Command::new(available);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|_| PathBuf::from(available))
}

pub fn local_runtime_ready(app_data_dir: &Path) -> bool {
    local_runtime_command(app_data_dir).is_some()
        && app_data_dir
            .join("runtime-pack")
            .join("tts-runtime")
            .join("provider_runner.py")
            .is_file()
}

fn command_env(provider_id: &str, training: bool) -> Option<&'static str> {
    match (provider_id, training) {
        ("voxcpm2", false) => Some("SMARTSPEC_TTS_VOXCPM2_COMMAND"),
        ("confucius4-tts", false) => Some("SMARTSPEC_TTS_CONFUCIUS4_COMMAND"),
        ("moss-tts", false) => Some("SMARTSPEC_TTS_MOSS_COMMAND"),
        ("voxcpm2", true) => Some("SMARTSPEC_TTS_VOXCPM2_TRAIN_COMMAND"),
        ("confucius4-tts", true) => Some("SMARTSPEC_TTS_CONFUCIUS4_TRAIN_COMMAND"),
        ("moss-tts", true) => Some("SMARTSPEC_TTS_MOSS_TRAIN_COMMAND"),
        _ => None,
    }
}

fn operator_command_ready(provider_id: &str, training: bool) -> bool {
    command_env(provider_id, training)
        .and_then(|env_name| std::env::var(env_name).ok())
        .map(|value| {
            let path = PathBuf::from(value.trim());
            !value.trim().is_empty() && path.is_file()
        })
        .unwrap_or(false)
}

pub fn local_tts_provider_ready(provider_id: &str) -> bool {
    operator_command_ready(provider_id, false)
}

pub fn local_training_provider_ready(provider_id: &str) -> bool {
    operator_command_ready(provider_id, true)
}

pub fn local_unified_audio_ready(app_data_dir: &Path) -> bool {
    local_runtime_ready(app_data_dir)
        && LOCAL_PROVIDER_MANIFESTS.iter().any(|manifest| {
            manifest.enabled
                && (local_tts_provider_ready(manifest.provider_id)
                    || local_training_provider_ready(manifest.provider_id))
        })
}

pub fn validate_tts_request(input: &Value) -> Result<TtsAdmission, String> {
    let binding = input
        .pointer("/voiceBindingId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let profile = input
        .pointer("/voiceProfileId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if binding.is_empty() || profile.is_empty() {
        return Err("VOICE_BINDING_STALE: voice binding identity is missing".into());
    }
    let policy_mode = input
        .pointer("/executionPolicy/mode")
        .and_then(Value::as_str)
        .unwrap_or("");
    let binding_target = input
        .pointer("/voiceBinding/target")
        .and_then(Value::as_str)
        .unwrap_or("worker_local");
    if binding_target == "server_cloud" || policy_mode == "cloud_only" {
        return Err(
            "TTS_PROVIDER_UNAVAILABLE: cloud TTS must execute in the server adapter".into(),
        );
    }
    let mode = input
        .pointer("/voiceBinding/mode")
        .and_then(Value::as_str)
        .unwrap_or("");
    let provider_id = input
        .pointer("/voiceBinding/providerId")
        .and_then(Value::as_str)
        .or_else(|| input.pointer("/providerId").and_then(Value::as_str))
        .unwrap_or("");
    let model_id = input
        .pointer("/voiceBinding/modelId")
        .and_then(Value::as_str)
        .or_else(|| input.pointer("/modelId").and_then(Value::as_str))
        .unwrap_or("");
    if provider_id.is_empty() || model_id.is_empty() {
        return Err(
            "VOICE_MODE_UNSUPPORTED: provider/model identity is missing from the immutable binding"
                .into(),
        );
    }
    let manifest = provider_manifest(provider_id, model_id).ok_or_else(|| {
        "TTS_PROVIDER_UNAVAILABLE: local provider/model is not registered".to_string()
    })?;
    if !manifest.enabled {
        return Err(
            "TTS_PROVIDER_UNAVAILABLE: provider is disabled by license/runtime gate".into(),
        );
    }
    if mode == "trained_voice" {
        let artifact_id = input
            .pointer("/voiceBinding/trainedModelArtifactId")
            .and_then(Value::as_str)
            .unwrap_or("");
        if artifact_id.is_empty() {
            return Err(
                "TRAINING_MODEL_INVALID: trained voice binding has no model artifact".into(),
            );
        }
        return Ok(TtsAdmission {
            provider_id: provider_id.to_owned(),
            model_id: model_id.to_owned(),
            mode: mode.to_owned(),
            target: TtsProviderTarget::WorkerLocal,
            reference_ids: Vec::new(),
            trained_model_artifact_id: Some(artifact_id.to_owned()),
        });
    }
    if mode == "reference_clone" || mode == "transcript_clone" {
        let selected = input
            .pointer("/voiceBinding/selectedReferenceAudioArtifactIds")
            .and_then(Value::as_array)
            .or_else(|| {
                input
                    .pointer("/selectedReferenceAudioArtifactIds")
                    .and_then(Value::as_array)
            })
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if selected.is_empty() {
            return Err(
                "REFERENCE_NOT_FINALIZED: clone request has no selected reference artifact".into(),
            );
        }
        return Ok(TtsAdmission {
            provider_id: provider_id.to_owned(),
            model_id: model_id.to_owned(),
            mode: mode.to_owned(),
            target: TtsProviderTarget::WorkerLocal,
            reference_ids: selected,
            trained_model_artifact_id: None,
        });
    }
    Err(format!(
        "VOICE_MODE_UNSUPPORTED: local provider does not support mode {mode}"
    ))
}

pub fn validate_training_request(input: &Value) -> Result<(String, String), String> {
    if input.get("target").and_then(Value::as_str).unwrap_or("") != "worker_local" {
        return Err(
            "TRAINING_UNAVAILABLE: only the verified local training lane is enabled".into(),
        );
    }
    let recipe = input
        .get("recipe")
        .ok_or_else(|| "invalid_contract: training recipe is missing".to_string())?;
    let provider_id = recipe
        .get("providerId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let model_id = recipe.get("modelId").and_then(Value::as_str).unwrap_or("");
    let method = recipe.get("method").and_then(Value::as_str).unwrap_or("");
    if provider_id != "voxcpm2" || model_id != "VoxCPM2" || method != "lora" {
        return Err("TRAINING_UNAVAILABLE: only the pinned VoxCPM2 LoRA recipe is enabled".into());
    }
    let manifest = provider_manifest(provider_id, model_id)
        .ok_or_else(|| "TRAINING_UNAVAILABLE: provider/model is not registered".to_string())?;
    if !manifest.enabled {
        return Err("TRAINING_UNAVAILABLE: provider is disabled by license/runtime gate".into());
    }
    Ok((provider_id.to_owned(), model_id.to_owned()))
}

pub fn capability_hints() -> Vec<String> {
    let mut hints = vec![UNIFIED_AUDIO_CAPABILITY.to_string()];
    for manifest in LOCAL_PROVIDER_MANIFESTS
        .iter()
        .filter(|manifest| manifest.enabled)
    {
        if local_tts_provider_ready(manifest.provider_id) {
            hints.push(UNIFIED_AUDIO_TTS_JOB_TYPE.to_string());
            hints.push(format!("tts-provider:{}", manifest.provider_id));
            hints.push(format!("tts-model:{}", manifest.model_id));
        }
        if local_training_provider_ready(manifest.provider_id) {
            hints.push(UNIFIED_AUDIO_TRAINING_JOB_TYPE.to_string());
            hints.push(format!("tts-training-provider:{}", manifest.provider_id));
            hints.push(format!("tts-model:{}", manifest.model_id));
        }
    }
    hints
}

pub fn model_not_installed_message(provider_id: &str, model_id: &str) -> String {
    format!("TTS model is not installed for local provider {provider_id}/{model_id}; install and pass a verified runtime manifest before retrying")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn registry_is_fail_closed_for_fish_speech() {
        assert!(provider_manifest("fish-speech", "Fish-Speech").is_some());
        assert!(
            !provider_manifest("fish-speech", "Fish-Speech")
                .unwrap()
                .enabled
        );
    }

    #[test]
    fn request_requires_reference_for_clone() {
        let request = json!({
            "executionPolicy": {"mode": "local_only"}, "voiceBindingId": "vb", "voiceProfileId": "vp",
            "providerId": "voxcpm2", "modelId": "VoxCPM2", "voiceBinding": {"mode": "reference_clone"}
        });
        assert!(validate_tts_request(&request)
            .unwrap_err()
            .starts_with("REFERENCE_NOT_FINALIZED"));
    }

    #[test]
    fn prefer_cloud_does_not_reject_an_explicit_local_binding() {
        let request = json!({
            "executionPolicy": {"mode": "prefer_cloud"}, "voiceBindingId": "vb", "voiceProfileId": "vp",
            "voiceBinding": {"target": "worker_local", "providerId": "voxcpm2", "modelId": "VoxCPM2", "mode": "reference_clone", "selectedReferenceAudioArtifactIds": ["ref"]}
        });
        assert!(validate_tts_request(&request).is_ok());
    }

    #[test]
    fn trained_voice_requires_a_promoted_model_artifact_snapshot() {
        let missing = json!({
            "executionPolicy": {"mode": "local_only"}, "voiceBindingId": "vb", "voiceProfileId": "vp",
            "providerId": "voxcpm2", "modelId": "VoxCPM2", "voiceBinding": {"mode": "trained_voice"}
        });
        assert!(validate_tts_request(&missing)
            .unwrap_err()
            .starts_with("TRAINING_MODEL_INVALID"));
        let request = json!({
            "executionPolicy": {"mode": "local_only"}, "voiceBindingId": "vb", "voiceProfileId": "vp",
            "providerId": "voxcpm2", "modelId": "VoxCPM2", "voiceBinding": {"mode": "trained_voice", "trainedModelArtifactId": "model-artifact"}
        });
        let admission = validate_tts_request(&request).unwrap();
        assert_eq!(admission.mode, "trained_voice");
        assert_eq!(
            admission.trained_model_artifact_id.as_deref(),
            Some("model-artifact")
        );
    }

    #[test]
    fn training_is_pinned_to_the_verified_voxcpm_lora_lane() {
        let request = json!({
            "target": "worker_local",
            "recipe": {"providerId": "voxcpm2", "modelId": "VoxCPM2", "method": "lora"}
        });
        assert_eq!(
            validate_training_request(&request).unwrap(),
            ("voxcpm2".to_string(), "VoxCPM2".to_string())
        );
        let unsupported = json!({"target": "worker_local", "recipe": {"providerId": "moss-tts", "modelId": "MOSS-TTS", "method": "sft"}});
        assert!(validate_training_request(&unsupported)
            .unwrap_err()
            .starts_with("TRAINING_UNAVAILABLE"));
    }
}
