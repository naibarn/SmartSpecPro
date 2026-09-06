//! Feature 179 adapter policy and runtime preflight.
//!
//! This module deliberately reports unavailable runtimes instead of replacing
//! them with synthetic detections. The Web contract owns the same policy
//! vocabulary; this Rust copy is the Worker admission boundary.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::fs;
use std::time::{Duration, Instant};
use sha2::{Digest, Sha256};

pub const SPEAKER_AWARE_CONTRACT_VERSION: &str = "feature-179-v1";
pub const SPEAKER_AWARE_RUNNER_ENV: &str = "SMARTAIHUB_SPEAKER_AWARE_RUNNER";
pub const SPEAKER_AWARE_CAPABILITY: &str = "speaker-aware-media-v1";

fn canonical_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(value) => value.to_string(),
        serde_json::Value::Number(value) => value.to_string(),
        serde_json::Value::String(value) => serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into()),
        serde_json::Value::Array(values) => format!("[{}]", values.iter().map(canonical_json).collect::<Vec<_>>().join(",")),
        serde_json::Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort();
            format!("{{{}}}", keys.into_iter().map(|key| format!("{}:{}", serde_json::to_string(key).unwrap_or_else(|_| "\"\"".into()), canonical_json(&values[key]))).collect::<Vec<_>>().join(","))
        }
    }
}

pub fn hash_policy_value(value: &serde_json::Value) -> String {
    format!("{:x}", Sha256::digest(canonical_json(value).as_bytes()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AdapterId { SileroOnnx, FireRedOnnx, TenVad, WebRtcVad, PyannoteDiarization, MediaPipeFace, PersonBody, ActiveSpeakerFusion }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AdapterStatus { Ready, MissingModel, MissingRuntime, GpuUnavailable, Incompatible, Disabled, Error }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCapability {
    pub adapter_id: AdapterId,
    pub version: String,
    pub status: AdapterStatus,
    pub runtime: Option<String>,
    pub device: String,
    pub model_checksum: Option<String>,
    pub remediation_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FallbackPolicy { Deny, AllowListed, ReportUnknown }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdapterStagePolicy {
    pub enabled_adapters: Vec<AdapterId>,
    pub primary: AdapterId,
    pub fallback_policy: FallbackPolicy,
    #[serde(default)]
    pub fallback_allow_list: Vec<AdapterId>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdapterPolicy {
    pub contract_version: String,
    pub vad: AdapterStagePolicy,
    pub diarization: AdapterStagePolicy,
    pub face: AdapterStagePolicy,
    pub person: AdapterStagePolicy,
    pub active_speaker: AdapterStagePolicy,
    pub max_scan_window_ms: u64,
    pub max_concurrent_processes: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdapterResolution {
    pub adapter_id: Option<AdapterId>,
    pub status: String,
    pub fallback_from: Option<AdapterId>,
    pub reason: String,
}

pub fn validate_policy(policy: &AdapterPolicy) -> Result<(), String> {
    if policy.contract_version != SPEAKER_AWARE_CONTRACT_VERSION { return Err("invalid_contract: unsupported speaker-aware policy version".into()); }
    if !(250..=60_000).contains(&policy.max_scan_window_ms) { return Err("invalid_contract: maxScanWindowMs out of bounds".into()); }
    if !(1..=8).contains(&policy.max_concurrent_processes) { return Err("invalid_contract: maxConcurrentProcesses out of bounds".into()); }
    for (name, stage) in [("vad", &policy.vad), ("diarization", &policy.diarization), ("face", &policy.face), ("person", &policy.person), ("activeSpeaker", &policy.active_speaker)] {
        if stage.required && !stage.enabled_adapters.contains(&stage.primary) { return Err(format!("invalid_contract: {name} required primary adapter is not enabled")); }
        if matches!(stage.fallback_policy, FallbackPolicy::AllowListed) && stage.fallback_allow_list.is_empty() { return Err(format!("invalid_contract: {name} fallback allow-list is empty")); }
        if stage.fallback_allow_list.iter().any(|adapter| !stage.enabled_adapters.contains(adapter)) { return Err(format!("invalid_contract: {name} fallback adapter is disabled")); }
    }
    Ok(())
}

pub fn resolve_adapter(stage: &AdapterStagePolicy, capabilities: &[AdapterCapability]) -> AdapterResolution {
    let status_for = |id: &AdapterId| capabilities.iter().find(|item| &item.adapter_id == id);
    if status_for(&stage.primary).is_some_and(|item| item.status == AdapterStatus::Ready) {
        return AdapterResolution { adapter_id: Some(stage.primary.clone()), status: "ready".into(), fallback_from: None, reason: "primary adapter ready".into() };
    }
    match stage.fallback_policy {
        FallbackPolicy::Deny => AdapterResolution { adapter_id: None, status: "blocked".into(), fallback_from: Some(stage.primary.clone()), reason: "primary adapter unavailable and fallback denied".into() },
        FallbackPolicy::ReportUnknown => AdapterResolution { adapter_id: None, status: "unknown".into(), fallback_from: Some(stage.primary.clone()), reason: "primary adapter unavailable and policy is report-only".into() },
        FallbackPolicy::AllowListed => stage.fallback_allow_list.iter().find(|id| status_for(id).is_some_and(|item| item.status == AdapterStatus::Ready)).map(|id| AdapterResolution { adapter_id: Some(id.clone()), status: "fallback".into(), fallback_from: Some(stage.primary.clone()), reason: "explicit allow-listed fallback".into() }).unwrap_or_else(|| AdapterResolution { adapter_id: None, status: "blocked".into(), fallback_from: Some(stage.primary.clone()), reason: "no ready adapter in allow-list".into() }),
    }
}

pub fn probe_allowlisted_command(command: &str, model_path: Option<&Path>, gpu_required: bool) -> AdapterCapability {
    let adapter_id = match command { "silero-onnx" => AdapterId::SileroOnnx, "firered-vad" => AdapterId::FireRedOnnx, "ten-vad" => AdapterId::TenVad, "webrtc-vad" => AdapterId::WebRtcVad, "pyannote" => AdapterId::PyannoteDiarization, "mediapipe-face" => AdapterId::MediaPipeFace, "person-body" => AdapterId::PersonBody, "active-speaker-fusion" => AdapterId::ActiveSpeakerFusion, _ => return AdapterCapability { adapter_id: AdapterId::WebRtcVad, version: "unknown".into(), status: AdapterStatus::Incompatible, runtime: None, device: "unknown".into(), model_checksum: None, remediation_key: Some("unknown_adapter".into()) } };
    if gpu_required && std::env::var("CUDA_VISIBLE_DEVICES").ok().as_deref() == Some("") { return AdapterCapability { adapter_id, version: "unknown".into(), status: AdapterStatus::GpuUnavailable, runtime: Some(command.into()), device: "cuda".into(), model_checksum: None, remediation_key: Some("gpu_required".into()) }; }
    if model_path.is_some_and(|path| !path.is_file()) { return AdapterCapability { adapter_id, version: "unknown".into(), status: AdapterStatus::MissingModel, runtime: Some(command.into()), device: if gpu_required { "cuda" } else { "cpu" }.into(), model_checksum: None, remediation_key: Some("install_model".into()) }; }
    let ready = Command::new(command).arg("--version").output().is_ok();
    AdapterCapability { adapter_id, version: "unknown".into(), status: if ready { AdapterStatus::Ready } else { AdapterStatus::MissingRuntime }, runtime: Some(command.into()), device: if gpu_required { "cuda" } else { "cpu" }.into(), model_checksum: None, remediation_key: if ready { None } else { Some("install_runtime".into()) } }
}

/// The Worker never accepts an executable path from a queued job. A single
/// operator-configured runner is used as the trust boundary and receives the
/// selected adapter policy in a request file. The runner must emit the
/// contract-specific JSON artifact; an absent runner is a truthful blocked
/// state, never a synthetic detection.
pub fn configured_runner() -> Option<String> {
    std::env::var(SPEAKER_AWARE_RUNNER_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn probe_configured_runner() -> Result<String, String> {
    let command = configured_runner().ok_or_else(|| "workflow_capability_blocked: speaker-aware runner is not configured".to_string())?;
    let output = Command::new(&command).arg("--version").output()
        .map_err(|error| format!("workflow_capability_blocked: speaker-aware runner unavailable: {error}"))?;
    if !output.status.success() {
        return Err("workflow_capability_blocked: speaker-aware runner failed --version".into());
    }
    Ok(command)
}

pub fn run_configured_runner(
    request_path: &Path,
    input_path: &Path,
    output_path: &Path,
    timeout: Duration,
) -> Result<(), String> {
    let command = probe_configured_runner()?;
    let mut child = Command::new(&command)
        .arg("--request").arg(request_path)
        .arg("--input").arg(input_path)
        .arg("--output").arg(output_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|error| format!("speaker_aware_runner_failed: {error}"))?;
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|error| format!("speaker_aware_runner_failed: {error}"))? {
            if !status.success() {
                return Err(format!("speaker_aware_runner_failed: exit status {status}"));
            }
            if !output_path.is_file() {
                return Err("speaker_aware_runner_failed: runner did not create output artifact".into());
            }
            let bytes = fs::read(output_path).map_err(|error| format!("speaker_aware_runner_failed: output unreadable: {error}"))?;
            let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|error| format!("invalid_contract: runner output is not JSON: {error}"))?;
            let object = value.as_object().ok_or_else(|| "invalid_contract: runner output must be an object".to_string())?;
            if object.get("contractVersion").and_then(serde_json::Value::as_str) != Some(SPEAKER_AWARE_CONTRACT_VERSION) {
                return Err("invalid_contract: runner output contractVersion mismatch".into());
            }
            return Ok(());
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            return Err("speaker_aware_runner_timeout".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn stage(primary: AdapterId, fallback: FallbackPolicy, list: Vec<AdapterId>) -> AdapterStagePolicy { let mut enabled = vec![primary.clone()]; enabled.extend(list.clone()); AdapterStagePolicy { enabled_adapters: enabled, primary, fallback_policy: fallback, fallback_allow_list: list, required: true } }
    #[test] fn deny_does_not_fallback() { let resolution = resolve_adapter(&stage(AdapterId::SileroOnnx, FallbackPolicy::Deny, vec![]), &[]); assert_eq!(resolution.status, "blocked"); assert_eq!(resolution.adapter_id, None); }
    #[test] fn only_allow_listed_ready_adapter_can_fallback() { let policy = stage(AdapterId::SileroOnnx, FallbackPolicy::AllowListed, vec![AdapterId::WebRtcVad]); let caps = vec![AdapterCapability { adapter_id: AdapterId::WebRtcVad, version: "1".into(), status: AdapterStatus::Ready, runtime: Some("webrtc-vad".into()), device: "cpu".into(), model_checksum: None, remediation_key: None }]; let resolution = resolve_adapter(&policy, &caps); assert_eq!(resolution.status, "fallback"); assert_eq!(resolution.adapter_id, Some(AdapterId::WebRtcVad)); }
    #[test] fn invalid_policy_is_rejected() { let invalid = AdapterPolicy { contract_version: "old".into(), vad: stage(AdapterId::SileroOnnx, FallbackPolicy::Deny, vec![]), diarization: stage(AdapterId::PyannoteDiarization, FallbackPolicy::Deny, vec![]), face: stage(AdapterId::MediaPipeFace, FallbackPolicy::Deny, vec![]), person: stage(AdapterId::PersonBody, FallbackPolicy::Deny, vec![]), active_speaker: stage(AdapterId::ActiveSpeakerFusion, FallbackPolicy::Deny, vec![]), max_scan_window_ms: 1000, max_concurrent_processes: 1 }; assert!(validate_policy(&invalid).is_err()); }
}
