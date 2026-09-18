use crate::config::RunnerProfile;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    AgentCli,
    AgentHarness,
    AgentRuntime,
    Media,
    Browser,
    Desktop,
    LocalAi,
    Mcp,
    GenericCli,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustState {
    Discovered,
    Probed,
    Verified,
    Ready,
    Busy,
    Degraded,
    AuthRequired,
    Unsupported,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityDimension {
    Unknown,
    Ready,
    Required,
    Failed,
    Unavailable,
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCandidate {
    pub tool_id: String,
    pub display_name: String,
    pub kind: ToolKind,
    pub version: Option<String>,
    pub adapter_id: Option<String>,
    pub discovery_source: String,
    pub fingerprint: String,
    pub trust_state: TrustState,
    pub reason_codes: Vec<String>,
    pub install_state: CapabilityDimension,
    pub configuration_state: CapabilityDimension,
    pub auth_state: CapabilityDimension,
    pub health_state: CapabilityDimension,
    pub availability_state: CapabilityDimension,
    pub control_profile: String,
    pub concurrency_limit: u16,
    pub observed_at_ms: u64,
    pub expires_at_ms: Option<u64>,
    /// Kept inside the Runner process only; never serialized into a capability snapshot.
    #[serde(skip_serializing, skip_deserializing)]
    pub executable_path: Option<PathBuf>,
}

pub const KNOWN_TOOLS: &[(&str, ToolKind)] = &[
    ("claude", ToolKind::AgentCli),
    ("codex", ToolKind::AgentCli),
    ("deepseek", ToolKind::AgentHarness),
    ("antigravity", ToolKind::AgentRuntime),
    ("hermes", ToolKind::AgentHarness),
    ("openclaw", ToolKind::AgentRuntime),
    ("ffmpeg", ToolKind::Media),
    ("ffprobe", ToolKind::Media),
    ("remotion", ToolKind::Media),
    ("comfyui", ToolKind::LocalAi),
];

const LOCAL_SCAN_LIMIT: usize = 128;

/// Scans the host PATH without executing anything. A discovered executable is still only
/// metadata until the adapter-specific bounded probe succeeds.
pub fn scan_environment(profile: RunnerProfile) -> Vec<ToolCandidate> {
    let entries = std::env::var_os("PATH")
        .map(|path| {
            std::env::split_paths(&path)
                .take(LOCAL_SCAN_LIMIT)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    scan_path_entries(profile, &entries)
}

pub fn scan_path_entries(profile: RunnerProfile, path_entries: &[PathBuf]) -> Vec<ToolCandidate> {
    if profile == RunnerProfile::SharedContainer {
        return scan_known_tools(profile, &[]);
    }

    KNOWN_TOOLS
        .iter()
        .map(|(name, kind)| {
            let executable_path = find_executable(path_entries, name);
            match executable_path {
                Some(path) => candidate_with_path(name, *kind, "path", Some(path)),
                None => unsupported_candidate(name, *kind),
            }
        })
        .collect()
}

pub fn scan_known_tools(profile: RunnerProfile, path_entries: &[String]) -> Vec<ToolCandidate> {
    if profile == RunnerProfile::SharedContainer {
        return KNOWN_TOOLS
            .iter()
            .filter(|(name, _)| ["ffmpeg", "ffprobe", "remotion"].contains(name))
            .map(|(name, kind)| candidate(name, *kind, "container_allowlist"))
            .collect();
    }
    KNOWN_TOOLS
        .iter()
        .filter_map(|(name, kind)| {
            let found = path_entries.iter().any(|entry| entry == name);
            Some(if found {
                candidate(name, *kind, "path")
            } else {
                unsupported_candidate(name, *kind)
            })
        })
        .collect()
}

fn candidate(name: &str, kind: ToolKind, source: &str) -> ToolCandidate {
    candidate_with_path(name, kind, source, None)
}

fn candidate_with_path(
    name: &str,
    kind: ToolKind,
    source: &str,
    executable_path: Option<PathBuf>,
) -> ToolCandidate {
    ToolCandidate {
        tool_id: name.into(),
        display_name: name.into(),
        kind,
        version: None,
        adapter_id: Some(format!("{name}.v1")),
        discovery_source: source.into(),
        fingerprint: fingerprint(
            name,
            executable_path
                .as_deref()
                .and_then(|path| path.to_str())
                .unwrap_or(source),
        ),
        trust_state: TrustState::Discovered,
        reason_codes: vec!["probe_required".into()],
        install_state: CapabilityDimension::Ready,
        configuration_state: CapabilityDimension::Unknown,
        auth_state: CapabilityDimension::Unknown,
        health_state: CapabilityDimension::Unknown,
        availability_state: CapabilityDimension::Unknown,
        control_profile: "runner_gateway".into(),
        concurrency_limit: 1,
        observed_at_ms: current_time_ms(),
        expires_at_ms: None,
        executable_path,
    }
}

fn unsupported_candidate(name: &str, kind: ToolKind) -> ToolCandidate {
    ToolCandidate {
        tool_id: name.into(),
        display_name: name.into(),
        kind,
        version: None,
        adapter_id: None,
        discovery_source: "catalog".into(),
        fingerprint: fingerprint(name, "absent"),
        trust_state: TrustState::Unsupported,
        reason_codes: vec!["not_found".into()],
        install_state: CapabilityDimension::Unavailable,
        configuration_state: CapabilityDimension::NotApplicable,
        auth_state: CapabilityDimension::NotApplicable,
        health_state: CapabilityDimension::NotApplicable,
        availability_state: CapabilityDimension::Unavailable,
        control_profile: "runner_gateway".into(),
        concurrency_limit: 0,
        observed_at_ms: current_time_ms(),
        expires_at_ms: None,
        executable_path: None,
    }
}

fn find_executable(path_entries: &[PathBuf], name: &str) -> Option<PathBuf> {
    for directory in path_entries.iter().take(LOCAL_SCAN_LIMIT) {
        for candidate in executable_names(directory, name) {
            if candidate.is_file() {
                return std::fs::canonicalize(candidate).ok();
            }
        }
    }
    None
}

fn executable_names(directory: &Path, name: &str) -> [PathBuf; 2] {
    [directory.join(name), directory.join(format!("{name}.exe"))]
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn fingerprint(name: &str, source: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{name}:{source}"));
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn path_name_is_not_ready_and_container_is_allowlisted() {
        for name in [
            "claude",
            "codex",
            "deepseek",
            "antigravity",
            "hermes",
            "openclaw",
        ] {
            assert!(KNOWN_TOOLS.iter().any(|(known, _)| *known == name));
        }
        let tools = scan_known_tools(RunnerProfile::LocalDevice, &["codex".into()]);
        let codex = tools.iter().find(|tool| tool.tool_id == "codex").unwrap();
        assert_eq!(codex.trust_state, TrustState::Discovered);
        let container = scan_known_tools(RunnerProfile::SharedContainer, &["claude".into()]);
        assert!(container
            .iter()
            .all(|tool| tool.discovery_source == "container_allowlist"));
        assert!(!container.iter().any(|tool| tool.tool_id == "claude"));
    }

    #[test]
    fn bounded_path_scan_keeps_absolute_executable_local_and_does_not_claim_ready() {
        let temp = tempfile::tempdir().unwrap();
        let executable = temp
            .path()
            .join(if cfg!(windows) { "codex.exe" } else { "codex" });
        std::fs::write(&executable, b"placeholder").unwrap();
        let tools = scan_path_entries(
            RunnerProfile::LocalDevice,
            &[temp.path().to_path_buf(), temp.path().to_path_buf()],
        );
        let codex = tools.iter().find(|tool| tool.tool_id == "codex").unwrap();
        assert_eq!(codex.trust_state, TrustState::Discovered);
        assert_eq!(codex.install_state, CapabilityDimension::Ready);
        assert!(codex.executable_path.as_ref().unwrap().is_absolute());
        assert!(!serde_json::to_string(codex)
            .unwrap()
            .contains(executable.to_str().unwrap()));
    }
}
