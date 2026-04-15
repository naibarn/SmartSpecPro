use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::thread;
use std::time::SystemTime;

const SUPPORTED_ATTESTATION_MODES: &[&str] = &[
    "software_pkcs8",
    "os_protected",
    "os_keychain",
    "os_attested",
    "hardware_attested",
];
const ATTESTATION_SUPPORT_HELPER_TIMEOUT_MS: u64 = 2_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAttestationSupportReport {
    pub enabled: bool,
    pub evidence_source: String,
    pub helper_configured: bool,
    pub helper_reachable: bool,
    pub helper_path: Option<String>,
    pub default_mode: String,
    pub provider_hint: String,
    pub supported_modes: Vec<String>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DeviceAttestationHelperSupport {
    #[serde(default)]
    provider_id: Option<String>,
    #[serde(default)]
    default_mode: Option<String>,
    #[serde(default)]
    supported_modes: Vec<String>,
    #[serde(default)]
    notes: Vec<String>,
}

fn normalize_attestation_mode(mode: &str) -> Option<String> {
    let normalized = mode.trim().to_ascii_lowercase();
    if SUPPORTED_ATTESTATION_MODES.contains(&normalized.as_str()) {
        Some(normalized)
    } else {
        None
    }
}

fn resolve_binary_from_path(binary_name: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;
    for entry in env::split_paths(&path_value) {
        let candidate = entry.join(binary_name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            let exe_candidate = entry.join(format!("{binary_name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }
    None
}

fn resolve_helper_path() -> Option<PathBuf> {
    let configured = env::var("SMARTSPEC_DEVICE_ATTESTATION_HELPER").ok()?;
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(trimmed);
    if candidate.is_file() {
        return Some(candidate);
    }
    resolve_binary_from_path(trimmed)
}

fn parse_provider_and_mode_from_env_json() -> Option<(String, String)> {
    let raw_json = env::var("SMARTSPEC_DEVICE_ATTESTATION_EVIDENCE_JSON").ok()?;
    let trimmed = raw_json.trim();
    if trimmed.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(trimmed).ok()?;
    let provider_hint = value
        .get("providerId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("env_json");
    let default_mode = value
        .get("attestationMode")
        .and_then(Value::as_str)
        .and_then(normalize_attestation_mode)
        .unwrap_or_else(|| "hardware_attested".into());
    Some((provider_hint.to_string(), default_mode))
}

fn parse_helper_support_json(raw: &str) -> Result<DeviceAttestationHelperSupport, String> {
    let parsed: DeviceAttestationHelperSupport =
        serde_json::from_str(raw).map_err(|error| format!("invalid attestation helper support json: {error}"))?;
    Ok(parsed)
}

fn run_attestation_helper_support_probe(
    helper_path: &str,
) -> Result<DeviceAttestationHelperSupport, String> {
    let mut child = Command::new(helper_path)
        .args(["--describe-support", "--format", "json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let started = SystemTime::now();
    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => {
                let output = child.wait_with_output().map_err(|error| error.to_string())?;
                if !status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    return Err(if stderr.is_empty() {
                        "device attestation support probe failed".into()
                    } else {
                        stderr
                    });
                }
                return parse_helper_support_json(&String::from_utf8_lossy(&output.stdout));
            }
            None => {
                let elapsed = started
                    .elapsed()
                    .map_err(|error| format!("failed to track attestation support probe: {error}"))?;
                if elapsed.as_millis() > u128::from(ATTESTATION_SUPPORT_HELPER_TIMEOUT_MS) {
                    child.kill().map_err(|error| error.to_string())?;
                    let _ = child.wait();
                    return Err("device attestation support probe timed out".into());
                }
                thread::sleep(std::time::Duration::from_millis(25));
            }
        }
    }
}

pub fn describe_device_attestation_support() -> DeviceAttestationSupportReport {
    let helper_path = resolve_helper_path();
    let helper_configured = env::var("SMARTSPEC_DEVICE_ATTESTATION_HELPER")
        .ok()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let helper_reachable = helper_path.is_some();
    let helper_path_string = helper_path.map(|path| path.to_string_lossy().to_string());

    let mut notes = Vec::new();
    let helper_support = if let Some(helper_path) = helper_path_string.as_deref() {
        match run_attestation_helper_support_probe(helper_path) {
            Ok(report) => Some(report),
            Err(error) => {
                notes.push(format!("attestation helper support probe failed: {error}"));
                None
            }
        }
    } else {
        None
    };

    let (evidence_source, provider_hint, default_mode, supported_modes) =
        if let Some((provider_hint, mode)) = parse_provider_and_mode_from_env_json() {
            (
                "env_json".to_string(),
                provider_hint,
                mode,
                SUPPORTED_ATTESTATION_MODES
                    .iter()
                    .map(|value| value.to_string())
                    .collect(),
            )
        } else if helper_reachable {
            let provider_hint = helper_support
                .as_ref()
                .and_then(|report| report.provider_id.clone())
                .or_else(|| {
                    helper_path_string
                        .as_deref()
                        .and_then(|path| {
                            PathBuf::from(path)
                                .file_stem()
                                .map(|value| value.to_string_lossy().to_string())
                        })
                })
                .unwrap_or_else(|| "external_helper".into());
            let default_mode = helper_support
                .as_ref()
                .and_then(|report| report.default_mode.as_deref())
                .and_then(normalize_attestation_mode)
                .unwrap_or_else(|| "hardware_attested".into());
            let supported_modes = helper_support
                .as_ref()
                .map(|report| {
                    let mut normalized = report
                        .supported_modes
                        .iter()
                        .filter_map(|mode| normalize_attestation_mode(mode))
                        .collect::<Vec<_>>();
                    if normalized.is_empty() {
                        normalized = SUPPORTED_ATTESTATION_MODES
                            .iter()
                            .map(|value| value.to_string())
                            .collect();
                    }
                    normalized.sort();
                    normalized.dedup();
                    normalized
                })
                .unwrap_or_else(|| {
                    SUPPORTED_ATTESTATION_MODES
                        .iter()
                        .map(|value| value.to_string())
                        .collect()
                });
            if let Some(helper_support) = &helper_support {
                notes.extend(helper_support.notes.clone());
            }
            ("helper".to_string(), provider_hint, default_mode, supported_modes)
        } else if env::var("SMARTSPEC_DEVICE_ATTESTATION_MODE")
            .ok()
            .as_deref()
            .and_then(normalize_attestation_mode)
            .is_some()
        {
            (
                "runtime_override".to_string(),
                "runtime_override".into(),
                env::var("SMARTSPEC_DEVICE_ATTESTATION_MODE")
                    .ok()
                    .as_deref()
                    .and_then(normalize_attestation_mode)
                    .unwrap_or_else(|| "software_pkcs8".into()),
                SUPPORTED_ATTESTATION_MODES
                    .iter()
                    .map(|value| value.to_string())
                    .collect(),
            )
        } else {
            (
                "derived_runtime".to_string(),
                "derived_runtime".into(),
                "software_pkcs8".into(),
                SUPPORTED_ATTESTATION_MODES
                    .iter()
                    .map(|value| value.to_string())
                    .collect(),
            )
        };

    if helper_configured && !helper_reachable {
        notes.push("configured attestation helper could not be resolved".into());
    }
    if evidence_source == "derived_runtime" {
        notes.push("no external attestation broker configured; posture is derived from local runtime and storage hints".into());
    }

    DeviceAttestationSupportReport {
        enabled: true,
        evidence_source,
        helper_configured,
        helper_reachable,
        helper_path: helper_path_string,
        default_mode,
        provider_hint,
        supported_modes,
        notes,
    }
}

#[tauri::command]
pub async fn desktop_host_describe_device_attestation_support() -> Result<DeviceAttestationSupportReport, String> {
    Ok(describe_device_attestation_support())
}
