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
    /// Redacted references emitted only after an authenticated adapter probe.
    #[serde(default)]
    pub authorization_evidence_ref: Option<String>,
    #[serde(default)]
    pub probe_evidence_ref: Option<String>,
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
    ("browser", ToolKind::Browser),
];

const LOCAL_SCAN_LIMIT: usize = 128;
const BROWSER_CACHE_SCAN_DEPTH: usize = 6;
const BROWSER_CACHE_ENTRY_LIMIT: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserExecutableResolution {
    pub executable_path: Option<PathBuf>,
    pub discovery_source: String,
    pub reason: Option<String>,
}

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
    if profile == RunnerProfile::SharedContainer {
        return scan_path_entries(profile, &entries);
    }
    let resolution = resolve_browser_executable_from_environment(&entries);
    scan_path_entries_with_resolution(profile, &entries, Some(&resolution))
}

pub fn scan_path_entries(profile: RunnerProfile, path_entries: &[PathBuf]) -> Vec<ToolCandidate> {
    scan_path_entries_with_resolution(profile, path_entries, None)
}

fn scan_path_entries_with_resolution(
    profile: RunnerProfile,
    path_entries: &[PathBuf],
    browser_resolution: Option<&BrowserExecutableResolution>,
) -> Vec<ToolCandidate> {
    if profile == RunnerProfile::SharedContainer {
        return scan_known_tools(profile, &[]);
    }

    KNOWN_TOOLS
        .iter()
        .map(|(name, kind)| {
            if *name == "browser" {
                if let Some(resolution) = browser_resolution {
                    return match &resolution.executable_path {
                        Some(path) => candidate_with_path(
                            name,
                            *kind,
                            &resolution.discovery_source,
                            Some(path.clone()),
                        ),
                        None => unsupported_candidate_with_source_reason(
                            name,
                            *kind,
                            &resolution.discovery_source,
                            resolution
                                .reason
                                .as_deref()
                                .unwrap_or("browser_executable_not_found"),
                        ),
                    };
                }
            }
            let executable_path = find_executable(path_entries, name);
            match executable_path {
                Some(path) => candidate_with_path(name, *kind, "path", Some(path)),
                None => unsupported_candidate(name, *kind),
            }
        })
        .collect()
}

pub fn resolve_browser_executable(
    explicit: Option<&Path>,
    playwright_roots: &[PathBuf],
    runner_cache_roots: &[PathBuf],
    os_roots: &[PathBuf],
    path_entries: &[PathBuf],
) -> BrowserExecutableResolution {
    if let Some(path) = explicit {
        if !path.is_absolute() {
            return BrowserExecutableResolution {
                executable_path: None,
                discovery_source: "explicit_config".into(),
                reason: Some("explicit_executable_must_be_absolute".into()),
            };
        }
        return match canonical_file(path) {
            Some(path) => BrowserExecutableResolution {
                executable_path: Some(path),
                discovery_source: "explicit_config".into(),
                reason: None,
            },
            None => BrowserExecutableResolution {
                executable_path: None,
                discovery_source: "explicit_config".into(),
                reason: Some("explicit_executable_not_found".into()),
            },
        };
    }

    for (roots, source) in [
        (playwright_roots, "playwright_cache"),
        (runner_cache_roots, "runner_cache"),
        (os_roots, "os_install"),
    ] {
        if let Some(path) = find_browser_in_roots(roots) {
            return BrowserExecutableResolution {
                executable_path: Some(path),
                discovery_source: source.into(),
                reason: None,
            };
        }
    }

    if let Some(path) = find_executable(path_entries, "browser") {
        return BrowserExecutableResolution {
            executable_path: Some(path),
            discovery_source: "path".into(),
            reason: None,
        };
    }

    BrowserExecutableResolution {
        executable_path: None,
        discovery_source: "not_found".into(),
        reason: Some("browser_executable_not_found".into()),
    }
}

fn resolve_browser_executable_from_environment(
    path_entries: &[PathBuf],
) -> BrowserExecutableResolution {
    let explicit = std::env::var_os("SAH_RUNNER_BROWSER_EXECUTABLE").map(PathBuf::from);
    let cache_root = user_cache_root();
    let mut playwright_roots = env_path("PLAYWRIGHT_BROWSERS_PATH")
        .into_iter()
        .collect::<Vec<_>>();
    if let Some(root) = cache_root.as_ref() {
        playwright_roots.push(root.join("ms-playwright"));
    }
    let mut runner_cache_roots = env_path("SAH_RUNNER_BROWSER_CACHE")
        .into_iter()
        .collect::<Vec<_>>();
    if let Some(data_root) = std::env::var_os("SAH_RUNNER_DATA_ROOT") {
        let root = PathBuf::from(data_root);
        runner_cache_roots.push(root.join("browser"));
        runner_cache_roots.push(root.join("browser-cache"));
    }
    if let Some(root) = cache_root.as_ref() {
        runner_cache_roots.push(root.join("smartaihub-runner").join("browser"));
        runner_cache_roots.push(root.join("smartaihub-runner").join("browser-cache"));
        runner_cache_roots.push(root.join("puppeteer"));
    }
    let os_roots = os_browser_roots();
    resolve_browser_executable(
        explicit.as_deref(),
        &deduplicate_paths(playwright_roots),
        &deduplicate_paths(runner_cache_roots),
        &os_roots,
        path_entries,
    )
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty() && path != Path::new("0"))
}

fn user_cache_root() -> Option<PathBuf> {
    if let Some(root) = std::env::var_os("XDG_CACHE_HOME") {
        return Some(PathBuf::from(root));
    }
    if cfg!(windows) {
        if let Some(root) = std::env::var_os("LOCALAPPDATA") {
            return Some(PathBuf::from(root));
        }
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|home| PathBuf::from(home).join(".cache"))
}

fn os_browser_roots() -> Vec<PathBuf> {
    if cfg!(windows) {
        let mut roots = Vec::new();
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Some(root) = std::env::var_os(variable) {
                roots.push(PathBuf::from(root));
            }
        }
        roots
    } else {
        [
            "/usr/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/opt/google/chrome",
            "/Applications/Google Chrome.app/Contents/MacOS",
        ]
        .into_iter()
        .map(PathBuf::from)
        .collect()
    }
}

fn deduplicate_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique = Vec::new();
    for path in paths {
        if !unique.iter().any(|candidate| candidate == &path) {
            unique.push(path);
        }
    }
    unique
}

fn find_browser_in_roots(roots: &[PathBuf]) -> Option<PathBuf> {
    roots.iter().find_map(|root| find_browser_in_root(root))
}

fn find_browser_in_root(root: &Path) -> Option<PathBuf> {
    if root.is_file() {
        return browser_executable_name(root)
            .then(|| canonical_file(root))
            .flatten();
    }
    let mut pending = vec![(root.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    while let Some((directory, depth)) = pending.pop() {
        if depth > BROWSER_CACHE_SCAN_DEPTH || visited >= BROWSER_CACHE_ENTRY_LIMIT {
            continue;
        }
        let Ok(read_dir) = std::fs::read_dir(&directory) else {
            continue;
        };
        let mut entries = read_dir.filter_map(Result::ok).collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.path());
        for entry in entries.into_iter().rev() {
            visited += 1;
            let path = entry.path();
            if path.is_file() && browser_executable_name(&path) {
                if let Some(canonical) = canonical_file(&path) {
                    return Some(canonical);
                }
            } else if depth < BROWSER_CACHE_SCAN_DEPTH && path.is_dir() {
                pending.push((path, depth + 1));
            }
            if visited >= BROWSER_CACHE_ENTRY_LIMIT {
                break;
            }
        }
    }
    None
}

fn browser_executable_name(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    executable_names(Path::new(""), "browser")
        .iter()
        .filter_map(|candidate| candidate.file_name())
        .any(|candidate| candidate == name)
}

fn canonical_file(path: &Path) -> Option<PathBuf> {
    path.is_file()
        .then(|| std::fs::canonicalize(path).ok())
        .flatten()
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
        authorization_evidence_ref: None,
        probe_evidence_ref: None,
    }
}

fn unsupported_candidate(name: &str, kind: ToolKind) -> ToolCandidate {
    unsupported_candidate_with_source_reason(name, kind, "catalog", "not_found")
}

fn unsupported_candidate_with_source_reason(
    name: &str,
    kind: ToolKind,
    source: &str,
    reason: &str,
) -> ToolCandidate {
    ToolCandidate {
        tool_id: name.into(),
        display_name: name.into(),
        kind,
        version: None,
        adapter_id: None,
        discovery_source: source.into(),
        fingerprint: fingerprint(name, source),
        trust_state: TrustState::Unsupported,
        reason_codes: vec![reason.into()],
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
        authorization_evidence_ref: None,
        probe_evidence_ref: None,
    }
}

fn find_executable(path_entries: &[PathBuf], name: &str) -> Option<PathBuf> {
    for directory in path_entries.iter().take(LOCAL_SCAN_LIMIT) {
        for candidate in executable_names(directory, name) {
            if let Some(path) = canonical_file(&candidate) {
                return Some(path);
            }
        }
    }
    None
}

fn executable_names(directory: &Path, name: &str) -> Vec<PathBuf> {
    if name == "browser" {
        return [
            "browser",
            "browser.exe",
            "chromium",
            "chromium.exe",
            "chromium-browser",
            "chromium-browser.exe",
            "google-chrome",
            "google-chrome.exe",
            "google-chrome-stable",
            "google-chrome-stable.exe",
            "chrome",
            "chrome.exe",
        ]
        .into_iter()
        .map(|candidate| directory.join(candidate))
        .collect();
    }
    vec![directory.join(name), directory.join(format!("{name}.exe"))]
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

    fn browser_fixture(root: &Path, relative: &str) -> PathBuf {
        let executable = root.join(relative);
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"placeholder").unwrap();
        executable
    }

    fn resolution(
        explicit: Option<&Path>,
        playwright: &[PathBuf],
        runner_cache: &[PathBuf],
        os: &[PathBuf],
        path: &[PathBuf],
    ) -> BrowserExecutableResolution {
        resolve_browser_executable(explicit, playwright, runner_cache, os, path)
    }
    #[test]
    fn path_name_is_not_ready_and_container_is_allowlisted() {
        for name in [
            "claude",
            "codex",
            "deepseek",
            "antigravity",
            "hermes",
            "openclaw",
            "browser",
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

    #[test]
    fn browser_discovery_accepts_known_chromium_executable_names() {
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join(if cfg!(windows) {
            "chromium.exe"
        } else {
            "chromium"
        });
        std::fs::write(&executable, b"placeholder").unwrap();

        let tools = scan_path_entries(RunnerProfile::LocalDevice, &[temp.path().to_path_buf()]);
        let browser = tools.iter().find(|tool| tool.tool_id == "browser").unwrap();

        assert_eq!(browser.adapter_id.as_deref(), Some("browser.v1"));
        assert_eq!(browser.trust_state, TrustState::Discovered);
        assert_eq!(
            browser.executable_path.as_deref(),
            Some(executable.as_path())
        );
    }

    #[test]
    fn browser_resolution_prefers_explicit_configuration_and_fails_closed_when_invalid() {
        let temp = tempfile::tempdir().unwrap();
        let explicit = browser_fixture(temp.path(), "explicit/chrome");
        let playwright = browser_fixture(temp.path(), "playwright/chrome-linux/chrome");
        let runner_cache = browser_fixture(temp.path(), "runner-cache/chrome");
        let os = browser_fixture(temp.path(), "os/chromium");
        let path = browser_fixture(temp.path(), "path/google-chrome");

        let selected = resolution(
            Some(explicit.as_path()),
            &[playwright.parent().unwrap().parent().unwrap().to_path_buf()],
            &[runner_cache.parent().unwrap().to_path_buf()],
            &[os.parent().unwrap().to_path_buf()],
            &[path.parent().unwrap().to_path_buf()],
        );
        assert_eq!(selected.discovery_source, "explicit_config");
        assert_eq!(
            selected.executable_path,
            Some(std::fs::canonicalize(explicit).unwrap())
        );

        let invalid = resolution(
            Some(temp.path().join("missing/chrome").as_path()),
            &[playwright.parent().unwrap().parent().unwrap().to_path_buf()],
            &[runner_cache.parent().unwrap().to_path_buf()],
            &[os.parent().unwrap().to_path_buf()],
            &[path.parent().unwrap().to_path_buf()],
        );
        assert_eq!(invalid.executable_path, None);
        assert_eq!(invalid.discovery_source, "explicit_config");
        assert_eq!(
            invalid.reason.as_deref(),
            Some("explicit_executable_not_found")
        );
    }

    #[test]
    fn browser_resolution_uses_managed_sources_before_os_and_path() {
        let temp = tempfile::tempdir().unwrap();
        let playwright = browser_fixture(temp.path(), "playwright/chromium-1/chrome-linux/chrome");
        let runner_cache = browser_fixture(temp.path(), "runner-cache/chrome");
        let os = browser_fixture(temp.path(), "os/chromium");
        let path = browser_fixture(temp.path(), "path/google-chrome");

        let selected = resolution(
            None,
            &[playwright.parent().unwrap().parent().unwrap().to_path_buf()],
            &[runner_cache.parent().unwrap().to_path_buf()],
            &[os.parent().unwrap().to_path_buf()],
            &[path.parent().unwrap().to_path_buf()],
        );
        assert_eq!(selected.discovery_source, "playwright_cache");
        assert_eq!(
            selected.executable_path,
            Some(std::fs::canonicalize(playwright).unwrap())
        );

        let selected = resolution(
            None,
            &[],
            &[runner_cache.parent().unwrap().to_path_buf()],
            &[os.parent().unwrap().to_path_buf()],
            &[path.parent().unwrap().to_path_buf()],
        );
        assert_eq!(selected.discovery_source, "runner_cache");
        assert_eq!(
            selected.executable_path,
            Some(std::fs::canonicalize(runner_cache).unwrap())
        );

        let selected = resolution(
            None,
            &[],
            &[],
            &[os.parent().unwrap().to_path_buf()],
            &[path.parent().unwrap().to_path_buf()],
        );
        assert_eq!(selected.discovery_source, "os_install");
        assert_eq!(
            selected.executable_path,
            Some(std::fs::canonicalize(os).unwrap())
        );

        let selected = resolution(None, &[], &[], &[], &[path.parent().unwrap().to_path_buf()]);
        assert_eq!(selected.discovery_source, "path");
        assert_eq!(
            selected.executable_path,
            Some(std::fs::canonicalize(path).unwrap())
        );
    }
}
