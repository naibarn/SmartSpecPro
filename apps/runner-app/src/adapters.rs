use crate::discovery::{ToolCandidate, ToolKind, TrustState};
use crate::process::{command_for_cli, ProcessSpec};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Read as _;
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct AdapterManifest {
    pub id: &'static str,
    pub tool_id: &'static str,
    pub kind: ToolKind,
    pub allowed: bool,
}

pub const ADAPTERS: &[AdapterManifest] = &[
    AdapterManifest {
        id: "claude.v1",
        tool_id: "claude",
        kind: ToolKind::AgentCli,
        allowed: true,
    },
    AdapterManifest {
        id: "codex.v1",
        tool_id: "codex",
        kind: ToolKind::AgentCli,
        allowed: true,
    },
    AdapterManifest {
        id: "deepseek.v1",
        tool_id: "deepseek",
        kind: ToolKind::AgentHarness,
        allowed: true,
    },
    AdapterManifest {
        id: "antigravity.v1",
        tool_id: "antigravity",
        kind: ToolKind::AgentRuntime,
        allowed: true,
    },
    AdapterManifest {
        id: "hermes.v1",
        tool_id: "hermes",
        kind: ToolKind::AgentHarness,
        allowed: true,
    },
    AdapterManifest {
        id: "openclaw.v1",
        tool_id: "openclaw",
        kind: ToolKind::AgentRuntime,
        allowed: true,
    },
    AdapterManifest {
        id: "browser.v1",
        tool_id: "browser",
        kind: ToolKind::Browser,
        allowed: true,
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterProbeResult {
    pub version: String,
    pub authenticated: bool,
    pub healthy: bool,
    pub available: bool,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserAuthorizationGrant {
    pub runner_id: String,
    pub runner_session_id: String,
    pub tenant_id: String,
    pub authorization_evidence_ref: String,
    pub expires_at_ms: u64,
    pub revoked: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrowserProbeState {
    AuthRequired,
    Authenticating,
    Authorized,
    Probing,
    Ready,
    AuthFailed,
    ProbeFailed,
    Unavailable,
    Stale,
    Revoked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserProbeEvidence {
    pub probe_evidence_ref: String,
    pub executable_discovery_source: String,
    pub browser_version: String,
    pub observed_at_ms: u64,
    pub expires_at_ms: u64,
    pub cleanup_succeeded: bool,
}

impl BrowserProbeEvidence {
    #[allow(clippy::too_many_arguments)]
    pub fn from_observation(
        runner_id: &str,
        runner_session_id: &str,
        tenant_id: &str,
        engine: &str,
        executable_discovery_source: &str,
        browser_version: &str,
        dom_observation: &str,
        accessibility_observation: &str,
        screenshot_base64: &str,
        cleanup_succeeded: bool,
    ) -> Self {
        let observed_at_ms = current_time_ms();
        let expires_at_ms = observed_at_ms.saturating_add(5 * 60 * 1000);
        let mut hasher = Sha256::new();
        hasher.update(runner_id.as_bytes());
        hasher.update([0]);
        hasher.update(runner_session_id.as_bytes());
        hasher.update([0]);
        hasher.update(tenant_id.as_bytes());
        hasher.update([0]);
        hasher.update(engine.as_bytes());
        hasher.update([0]);
        hasher.update(executable_discovery_source.as_bytes());
        hasher.update([0]);
        hasher.update(browser_version.as_bytes());
        hasher.update([0]);
        hasher.update(dom_observation.as_bytes());
        hasher.update([0]);
        hasher.update(accessibility_observation.as_bytes());
        hasher.update([0]);
        hasher.update(screenshot_base64.as_bytes());
        hasher.update([u8::from(cleanup_succeeded)]);
        Self {
            probe_evidence_ref: format!("browser-probe:sha256:{:x}", hasher.finalize()),
            executable_discovery_source: executable_discovery_source.into(),
            browser_version: browser_version.into(),
            observed_at_ms,
            expires_at_ms,
            cleanup_succeeded,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedBrowserProbe {
    pub result: AdapterProbeResult,
    pub evidence: BrowserProbeEvidence,
}

pub fn build_browser_authorization_grant(
    runner_id: &str,
    runner_session_id: &str,
    tenant_id: &str,
    expires_at_ms: u64,
) -> BrowserAuthorizationGrant {
    let mut hasher = Sha256::new();
    hasher.update(runner_id.as_bytes());
    hasher.update([0]);
    hasher.update(runner_session_id.as_bytes());
    hasher.update([0]);
    hasher.update(tenant_id.as_bytes());
    hasher.update([0]);
    hasher.update(expires_at_ms.to_le_bytes());
    BrowserAuthorizationGrant {
        runner_id: runner_id.into(),
        runner_session_id: runner_session_id.into(),
        tenant_id: tenant_id.into(),
        authorization_evidence_ref: format!("runner-auth:sha256:{:x}", hasher.finalize()),
        expires_at_ms,
        revoked: false,
    }
}

/// Derives a redacted adapter authorization reference for a bounded Runner
/// capability snapshot. The reference contains no credential; the control
/// plane still decides whether the corresponding provider policy is allowed.
pub fn build_external_agent_authorization_ref(
    runner_id: &str,
    runner_session_id: &str,
    tenant_id: &str,
    adapter_id: &str,
    expires_at_ms: u64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(runner_id.as_bytes());
    hasher.update([0]);
    hasher.update(runner_session_id.as_bytes());
    hasher.update([0]);
    hasher.update(tenant_id.as_bytes());
    hasher.update([0]);
    hasher.update(adapter_id.as_bytes());
    hasher.update([0]);
    hasher.update(expires_at_ms.to_le_bytes());
    format!("runner-agent-auth:sha256:{:x}", hasher.finalize())
}

pub fn validate_browser_authorization_grant(
    grant: &BrowserAuthorizationGrant,
    runner_id: &str,
    runner_session_id: &str,
    tenant_id: &str,
    now_ms: u64,
) -> Result<(), String> {
    if grant.runner_id != runner_id
        || grant.runner_session_id != runner_session_id
        || grant.tenant_id != tenant_id
        || grant.authorization_evidence_ref.trim().is_empty()
    {
        return Err("RUNNER_AUTHORIZATION_BINDING_MISMATCH".into());
    }
    if grant.revoked {
        return Err("RUNNER_AUTHORIZATION_REVOKED".into());
    }
    if grant.expires_at_ms <= now_ms {
        return Err("RUNNER_AUTHORIZATION_EXPIRED".into());
    }
    Ok(())
}

pub fn derive_browser_probe_state(
    authorized: bool,
    probe_succeeded: bool,
    evidence_fresh: bool,
) -> BrowserProbeState {
    if !authorized {
        return BrowserProbeState::AuthRequired;
    }
    if !probe_succeeded {
        return BrowserProbeState::ProbeFailed;
    }
    if !evidence_fresh {
        return BrowserProbeState::Stale;
    }
    BrowserProbeState::Ready
}

pub fn apply_probe(
    candidate: &mut ToolCandidate,
    result: AdapterProbeResult,
) -> Result<(), String> {
    if !approved_manifest(candidate) {
        return Err("RUNNER_ADAPTER_NOT_APPROVED".into());
    }
    candidate.version = Some(result.version);
    candidate.auth_state = if result.authenticated {
        crate::discovery::CapabilityDimension::Ready
    } else {
        crate::discovery::CapabilityDimension::Required
    };
    candidate.health_state = if result.healthy {
        crate::discovery::CapabilityDimension::Ready
    } else {
        crate::discovery::CapabilityDimension::Failed
    };
    candidate.availability_state = if result.available {
        crate::discovery::CapabilityDimension::Ready
    } else {
        crate::discovery::CapabilityDimension::Unavailable
    };
    candidate.configuration_state = if result.available && result.healthy && result.authenticated {
        crate::discovery::CapabilityDimension::Ready
    } else {
        candidate.configuration_state
    };
    candidate.reason_codes = result.reason_codes;
    candidate.trust_state = if result.available && result.healthy && result.authenticated {
        TrustState::Ready
    } else if !result.healthy || !result.available {
        TrustState::Degraded
    } else if !result.authenticated {
        TrustState::AuthRequired
    } else {
        TrustState::Degraded
    };
    Ok(())
}

/// Runs only the approved adapter's bounded version probe. Authentication is deliberately a
/// separate dimension: a successful `--version` command never proves that a user account is
/// authorized to execute work.
pub fn probe_candidate(
    candidate: &ToolCandidate,
    timeout: Duration,
) -> Result<AdapterProbeResult, String> {
    run_version_probe(candidate, timeout)
}

/// Converts bounded probe errors into public reason codes. Raw process and OS
/// errors are intentionally not returned because they can contain local paths.
pub fn probe_failure_reason(error: &str) -> &'static str {
    match error {
        "RUNNER_ADAPTER_PROBE_TIMEOUT" => "probe_timeout",
        "RUNNER_ADAPTER_PROBE_SPAWN_FAILED" => "probe_launch_failed",
        "RUNNER_ADAPTER_PROBE_SPAWN_NOT_FOUND" => "probe_executable_not_found",
        "RUNNER_ADAPTER_PROBE_SPAWN_PERMISSION_DENIED" => "probe_permission_denied",
        "RUNNER_ADAPTER_PROBE_SPAWN_INVALID_EXECUTABLE" => "probe_invalid_executable",
        "RUNNER_ADAPTER_PROBE_STATUS_FAILED" => "probe_status_failed",
        "RUNNER_ADAPTER_PROBE_EXITED_NONZERO" => "probe_nonzero_exit",
        "RUNNER_WINDOWS_SYSTEM_ROOT_UNAVAILABLE" => "probe_system_path_unavailable",
        "RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT" => "probe_unsafe_cli_shim",
        _ => "probe_failed",
    }
}

fn probe_spawn_error(error: std::io::Error) -> String {
    let code = match error.kind() {
        std::io::ErrorKind::NotFound => "RUNNER_ADAPTER_PROBE_SPAWN_NOT_FOUND",
        std::io::ErrorKind::PermissionDenied => "RUNNER_ADAPTER_PROBE_SPAWN_PERMISSION_DENIED",
        std::io::ErrorKind::InvalidInput | std::io::ErrorKind::InvalidData => {
            "RUNNER_ADAPTER_PROBE_SPAWN_INVALID_EXECUTABLE"
        }
        _ => "RUNNER_ADAPTER_PROBE_SPAWN_FAILED",
    };
    code.to_string()
}

/// Extends the approved browser.v1 version probe with the authenticated,
/// isolated Chromium/CDP lifecycle. This remains an adapter primitive: it
/// does not plan or execute Computer Use operations.
pub fn probe_browser_candidate(
    candidate: &ToolCandidate,
    timeout: Duration,
    grant: &BrowserAuthorizationGrant,
) -> Result<AuthenticatedBrowserProbe, String> {
    if !matches!(candidate.kind, ToolKind::Browser)
        || candidate.adapter_id.as_deref() != Some("browser.v1")
    {
        return Err("RUNNER_BROWSER_ADAPTER_REQUIRED".into());
    }
    validate_browser_authorization_grant(
        grant,
        &grant.runner_id,
        &grant.runner_session_id,
        &grant.tenant_id,
        current_time_ms(),
    )?;
    let version_probe = run_version_probe(candidate, timeout.min(Duration::from_secs(10)))?;
    if !version_probe.healthy || !version_probe.available {
        return Err("RUNNER_BROWSER_VERSION_PROBE_FAILED".into());
    }
    let executable = candidate
        .executable_path
        .as_ref()
        .ok_or_else(|| "RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING".to_string())?;
    let fixture_url = std::env::var("SAH_RUNNER_BROWSER_CERTIFICATION_FIXTURE_URL")
        .unwrap_or_else(|_| "https://smartaihub.app/healthz".into());
    if !fixture_url.starts_with("https://smartaihub.app/") {
        return Err("RUNNER_BROWSER_FIXTURE_URL_INVALID".into());
    }
    let mut browser = BrowserProbeProcess::launch(executable, timeout)?;
    let probe = browser.run_cdp_probe(
        &fixture_url,
        timeout,
        &grant.runner_id,
        &grant.runner_session_id,
        &grant.tenant_id,
        &candidate.discovery_source,
        &version_probe.version,
    );
    let cleanup = browser.cleanup();
    let (_dom, _accessibility, _screenshot, mut evidence) = match probe {
        Ok(values) => values,
        Err(error) => {
            let cleanup_error = cleanup.err().unwrap_or_default();
            return Err(if cleanup_error.is_empty() {
                error
            } else {
                format!("{error}; {cleanup_error}")
            });
        }
    };
    if let Err(error) = cleanup {
        evidence.cleanup_succeeded = false;
        return Err(error);
    }
    evidence.cleanup_succeeded = true;
    Ok(AuthenticatedBrowserProbe {
        result: AdapterProbeResult {
            version: version_probe.version.clone(),
            authenticated: true,
            healthy: true,
            available: true,
            reason_codes: vec![
                "version_probe_ok".into(),
                "runner_session_authorized".into(),
                "cdp_transport_connected".into(),
                "isolated_context_ready".into(),
                "structured_observation_ready".into(),
                "accessibility_observation_ready".into(),
                "screenshot_evidence_ready".into(),
                "browser_cleanup_ok".into(),
            ],
        },
        evidence,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserExecutionEvidence {
    pub result_ref: String,
    pub evidence_refs: Vec<String>,
    pub observation_ref: String,
    pub action_ref: String,
    pub verification_input_ref: String,
    pub semantic_observation: Option<Value>,
    pub cleanup_succeeded: bool,
}

fn wait_for_semantic_target<F>(
    target_ref: &str,
    timeout: Duration,
    mut read_candidates: F,
) -> Result<Vec<Value>, String>
where
    F: FnMut() -> Result<Vec<Value>, String>,
{
    let deadline = Instant::now() + timeout;
    loop {
        let candidates = read_candidates()?;
        if candidates
            .iter()
            .any(|candidate| candidate.get("targetId").and_then(Value::as_str) == Some(target_ref))
        {
            return Ok(candidates);
        }
        if Instant::now() >= deadline {
            return Err("RUNNER_SEMANTIC_TARGET_NOT_IN_OBSERVATION".into());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        std::thread::sleep(remaining.min(Duration::from_millis(100)));
    }
}

fn filter_named_browser_candidates(candidates: Vec<Value>) -> Vec<Value> {
    candidates
        .into_iter()
        .filter(|candidate| {
            candidate
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| !name.trim().is_empty())
        })
        .collect()
}

/// Give server-rendered pages a bounded hydration window before semantic
/// observation. The initial prerender can be a valid but incomplete candidate
/// set (for example, navigation links before a form mounts). Requiring a
/// stable candidate signature after a short minimum window avoids observing
/// that transient shell while preserving a hard deadline for empty/dynamic
/// pages.
fn wait_for_browser_dom_settle<F>(
    timeout: Duration,
    mut read_candidates: F,
) -> Result<Vec<Value>, String>
where
    F: FnMut() -> Result<Vec<Value>, String>,
{
    let started_at = Instant::now();
    let deadline = started_at + timeout;
    // A prerender shell can remain stable for several samples while a lazy
    // route chunk is still mounting. Keep this bounded, but do not let that
    // early shell become the semantic observation solely because it settled
    // before hydration completed.
    let minimum_settle = timeout.min(Duration::from_secs(2));
    let mut previous_signature: Option<String> = None;
    let mut stable_samples = 0_u8;

    loop {
        let latest = read_candidates()?;
        let signature = serde_json::to_string(&latest)
            .map_err(|_| "RUNNER_BROWSER_CANDIDATE_SIGNATURE_FAILED".to_string())?;
        if started_at.elapsed() >= minimum_settle {
            if previous_signature.as_deref() == Some(signature.as_str()) {
                stable_samples = stable_samples.saturating_add(1);
                if stable_samples >= 2 {
                    return Ok(latest);
                }
            } else {
                previous_signature = Some(signature);
                stable_samples = 0;
            }
        } else {
            previous_signature = Some(signature);
            stable_samples = 0;
        }

        if Instant::now() >= deadline {
            return Ok(latest);
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        std::thread::sleep(remaining.min(Duration::from_millis(100)));
    }
}

/// Executes only a server-selected, bounded browser primitive. Candidate
/// selection, DecisionProvider and policy decisions are supplied as redacted
/// references in `payload`; this adapter never plans a new action.
pub fn execute_browser_candidate(
    candidate: &ToolCandidate,
    timeout: Duration,
    grant: &BrowserAuthorizationGrant,
    payload: &Value,
) -> Result<BrowserExecutionEvidence, String> {
    if !matches!(candidate.kind, ToolKind::Browser)
        || candidate.adapter_id.as_deref() != Some("browser.v1")
    {
        return Err("RUNNER_BROWSER_ADAPTER_REQUIRED".into());
    }
    validate_browser_authorization_grant(
        grant,
        &grant.runner_id,
        &grant.runner_session_id,
        &grant.tenant_id,
        current_time_ms(),
    )?;
    let version_probe = run_version_probe(candidate, timeout.min(Duration::from_secs(10)))?;
    if !version_probe.healthy || !version_probe.available {
        return Err("RUNNER_BROWSER_VERSION_PROBE_FAILED".into());
    }
    let executable = candidate
        .executable_path
        .as_ref()
        .ok_or_else(|| "RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING".to_string())?;
    let fixture_url = payload
        .get("fixtureUrl")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| std::env::var("SAH_RUNNER_BROWSER_CERTIFICATION_FIXTURE_URL").ok())
        .unwrap_or_else(|| "https://smartaihub.app/healthz".into());
    if !fixture_url.starts_with("https://smartaihub.app/") {
        return Err("RUNNER_BROWSER_FIXTURE_URL_INVALID".into());
    }
    let mut browser = BrowserProbeProcess::launch(executable, timeout)?;
    let operation = browser.run_cdp_operation(
        &fixture_url,
        timeout,
        payload,
        &grant.runner_id,
        &grant.runner_session_id,
        &grant.tenant_id,
        &version_probe.version,
    );
    let cleanup = browser.cleanup();
    let mut evidence = match operation {
        Ok(evidence) => evidence,
        Err(error) => {
            let cleanup_error = cleanup.err().unwrap_or_default();
            return Err(if cleanup_error.is_empty() {
                error
            } else {
                format!("{error}; {cleanup_error}")
            });
        }
    };
    if let Err(error) = cleanup {
        evidence.cleanup_succeeded = false;
        return Err(error);
    }
    evidence.cleanup_succeeded = true;
    Ok(evidence)
}

fn run_version_probe(
    candidate: &ToolCandidate,
    timeout: Duration,
) -> Result<AdapterProbeResult, String> {
    if !approved_manifest(candidate) {
        return Err("RUNNER_ADAPTER_NOT_APPROVED".into());
    }
    if timeout.is_zero() || timeout > Duration::from_secs(10) {
        return Err("RUNNER_ADAPTER_PROBE_TIMEOUT_INVALID".into());
    }
    let program = candidate
        .executable_path
        .as_ref()
        .ok_or_else(|| "RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING".to_string())?;
    let mut command = command_for_cli(program, &["--version".into()])?;
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    hide_console_window(&mut command);
    let mut child = command.spawn().map_err(probe_spawn_error)?;
    let stdout = child
        .stdout
        .take()
        .map(|stream| std::thread::spawn(move || read_probe_output(stream)));
    let stderr = child
        .stderr
        .take()
        .map(|stream| std::thread::spawn(move || read_probe_output(stream)));
    let deadline = Instant::now() + timeout;
    let status = loop {
        let status = match child.try_wait() {
            Ok(status) => status,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("RUNNER_ADAPTER_PROBE_STATUS_FAILED".into());
            }
        };
        if let Some(status) = status {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("RUNNER_ADAPTER_PROBE_TIMEOUT".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let output = stdout
        .and_then(|thread| thread.join().ok())
        .unwrap_or_default();
    let _ = stderr.and_then(|thread| thread.join().ok());
    let version = output
        .split(|byte| *byte == b'\n' || *byte == b'\r')
        .next()
        .and_then(|line| std::str::from_utf8(line).ok())
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.chars().take(256).collect::<String>())
        .unwrap_or_else(|| "version_probe_completed".into());
    let deterministic = std::env::var("SAH_RUNNER_CERTIFICATION_ADAPTER").as_deref()
        == Ok("deterministic")
        && matches!(
            candidate.adapter_id.as_deref(),
            Some("codex.v1" | "claude.v1")
        )
        && std::env::var("SAH_RUNNER_CONTROL_URL")
            .map(|url| {
                url.starts_with("http://127.0.0.1:")
                    || url.starts_with("http://localhost:")
                    || url.starts_with("http://[::1]:")
            })
            .unwrap_or(false);
    if !status.success() {
        return Err("RUNNER_ADAPTER_PROBE_EXITED_NONZERO".into());
    }
    let mut authenticated = deterministic;
    let mut reason_codes = if deterministic {
        vec![
            "version_probe_ok".into(),
            "deterministic_certification_adapter".into(),
        ]
    } else {
        vec!["version_probe_ok".into(), "auth_probe_required".into()]
    };

    if !deterministic && candidate.adapter_id.as_deref() == Some("codex.v1") {
        match run_codex_login_status(program, timeout) {
            Ok(true) => {
                authenticated = true;
                reason_codes = vec!["version_probe_ok".into(), "auth_status_ok".into()];
            }
            Ok(false) => {
                let auth_reason = if codex_wif_is_configured() {
                    "auth_probe_deferred"
                } else {
                    "auth_probe_required"
                };
                reason_codes = vec!["version_probe_ok".into(), auth_reason.into()];
            }
            Err(_) => reason_codes = vec!["version_probe_ok".into(), "auth_probe_failed".into()],
        }
    }

    Ok(AdapterProbeResult {
        version,
        authenticated,
        healthy: true,
        available: true,
        reason_codes,
    })
}

/// Reads Codex's local login state without executing a prompt. WIF checks can
/// consume a one-time assertion, so automatic Runner probes must defer when a
/// WIF environment is present.
fn run_codex_login_status(program: &Path, timeout: Duration) -> Result<bool, String> {
    if codex_wif_is_configured() {
        return Ok(false);
    }
    if timeout.is_zero() || timeout > Duration::from_secs(10) {
        return Err("RUNNER_ADAPTER_PROBE_TIMEOUT_INVALID".into());
    }
    let mut command = command_for_cli(program, &["login".into(), "status".into()])?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut command);
    let mut child = command.spawn().map_err(probe_spawn_error)?;
    let stdout = child
        .stdout
        .take()
        .map(|stream| std::thread::spawn(move || read_probe_output(stream)));
    let stderr = child
        .stderr
        .take()
        .map(|stream| std::thread::spawn(move || read_probe_output(stream)));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("RUNNER_ADAPTER_PROBE_TIMEOUT".into());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("RUNNER_ADAPTER_PROBE_STATUS_FAILED".into());
            }
        }
    };
    let mut output = stdout
        .and_then(|thread| thread.join().ok())
        .unwrap_or_default();
    output.extend(
        stderr
            .and_then(|thread| thread.join().ok())
            .unwrap_or_default(),
    );
    Ok(status.success() && codex_login_status_authenticated(&output))
}

fn codex_login_status_authenticated(output: &[u8]) -> bool {
    let Ok(output) = std::str::from_utf8(output) else {
        return false;
    };
    output.lines().any(|line| {
        matches!(
            line.trim(),
            "Logged in using ChatGPT" | "Logged in using API key"
        )
    })
}

fn codex_wif_is_configured() -> bool {
    codex_wif_configured(
        std::env::var_os("OPENAI_FEDERATION_RULE_ID").is_some(),
        std::env::var_os("OPENAI_IDENTITY_TOKEN_FILE").is_some(),
    )
}

fn codex_wif_configured(federation_rule_present: bool, identity_token_file_present: bool) -> bool {
    federation_rule_present || identity_token_file_present
}

/// Whether this discovered command has a documented, non-interactive prompt
/// interface that Runner can safely invoke for a user-requested task check.
pub fn supports_task_smoke_test(adapter_id: Option<&str>) -> bool {
    matches!(
        adapter_id,
        Some(
            "codex.v1"
                | "claude.v1"
                | "deepseek.v1"
                | "antigravity.v1"
                | "openclaw.v1"
                | "hermes.v1"
        )
    )
}

/// Sends a fixed, harmless greeting through a supported local agent CLI. This
/// is intentionally separate from discovery and only called after the user
/// presses Verify. Passing requires a real, non-empty final answer.
pub fn run_task_smoke_test(
    candidate: &ToolCandidate,
) -> (&'static str, Option<String>, Option<String>) {
    if !approved_manifest(candidate) || !supports_task_smoke_test(candidate.adapter_id.as_deref()) {
        return ("unsupported", None, Some("task_probe_unsupported".into()));
    }
    let Some(program) = candidate.executable_path.as_deref() else {
        return ("failed", None, Some("probe_launch_failed".into()));
    };
    let mut entropy = [0u8; 16];
    if getrandom::fill(&mut entropy).is_err() {
        return ("failed", None, Some("task_probe_temp_unavailable".into()));
    }
    let suffix = entropy
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let workspace = std::env::temp_dir().join(format!("smartaihub-runner-verify-{suffix}"));
    if std::fs::create_dir(&workspace).is_err() {
        return ("failed", None, Some("task_probe_temp_unavailable".into()));
    }

    let adapter_id = candidate.adapter_id.as_deref().unwrap_or_default();
    let prompt = "สวัสดี ช่วยตอบกลับเป็นภาษาไทยสั้น ๆ ว่า ระบบพร้อมแล้วมีอะไรให้ช่วยไหม โดยไม่ต้องใช้เครื่องมือ";
    let (args, output_format) = match adapter_id {
        "codex.v1" => (
            vec![
                "exec".into(),
                "--json".into(),
                "--ephemeral".into(),
                "--sandbox".into(),
                "read-only".into(),
                "--skip-git-repo-check".into(),
                prompt.into(),
            ],
            TaskOutputFormat::CodexJsonl,
        ),
        "claude.v1" => (
            vec![
                "--safe-mode".into(),
                "-p".into(),
                "--output-format".into(),
                "json".into(),
                "--no-session-persistence".into(),
                "--max-turns".into(),
                "1".into(),
                "--max-budget-usd".into(),
                "0.05".into(),
                "--tools".into(),
                "".into(),
                "--disallowedTools".into(),
                "mcp__*".into(),
                prompt.into(),
            ],
            TaskOutputFormat::Json,
        ),
        "deepseek.v1" => (
            vec![
                "--profile".into(),
                "headless".into(),
                "--json".into(),
                prompt.into(),
            ],
            TaskOutputFormat::FinalJsonl,
        ),
        "antigravity.v1" => (
            vec![
                "-p".into(),
                prompt.into(),
                "--output-format".into(),
                "json".into(),
                "--sandbox".into(),
                "--print-timeout".into(),
                "50s".into(),
            ],
            TaskOutputFormat::Json,
        ),
        "openclaw.v1" => (
            vec![
                "agent".into(),
                "--agent".into(),
                "main".into(),
                "--message".into(),
                prompt.into(),
                "--json".into(),
                "--timeout".into(),
                "50".into(),
                "--session-key".into(),
                format!("agent:main:runner-verify-{suffix}"),
            ],
            TaskOutputFormat::Json,
        ),
        "hermes.v1" => (vec!["-z".into(), prompt.into()], TaskOutputFormat::Text),
        _ => unreachable!("unsupported adapters are rejected above"),
    };

    let mut command = match command_for_cli(program, &args) {
        Ok(command) => command,
        Err(_) => {
            return (
                "failed",
                None,
                Some("task_probe_arguments_unsupported".into()),
            )
        }
    };
    command
        .current_dir(&workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut command);
    let result =
        match command.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take().map(|stream| {
                    std::thread::spawn(move || read_bounded_output(stream, 256 * 1024))
                });
                let stderr = child.stderr.take().map(|stream| {
                    std::thread::spawn(move || read_bounded_output(stream, 32 * 1024))
                });
                let deadline = Instant::now() + Duration::from_secs(60);
                let status = loop {
                    match child.try_wait() {
                        Ok(Some(status)) => break Some(status),
                        Ok(None) if Instant::now() < deadline => {
                            std::thread::sleep(Duration::from_millis(20));
                        }
                        Ok(None) | Err(_) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            break None;
                        }
                    }
                };
                let output = stdout
                    .and_then(|reader| reader.join().ok())
                    .unwrap_or_default();
                let _ = stderr.and_then(|reader| reader.join().ok());
                match status {
                    None => ("failed", None, Some("task_probe_timeout".into())),
                    Some(status) if !status.success() => {
                        ("failed", None, Some("task_probe_failed".into()))
                    }
                    Some(_) => {
                        let response = match output_format {
                            TaskOutputFormat::CodexJsonl => codex_final_message(&output),
                            TaskOutputFormat::FinalJsonl => final_jsonl_message(&output),
                            TaskOutputFormat::Json => json_agent_response(&output),
                            TaskOutputFormat::Text => text_agent_response(&output),
                        };
                        match response {
                            Some(message) => ("passed", Some(message), None),
                            None => ("failed", None, Some("task_probe_no_response".into())),
                        }
                    }
                }
            }
            Err(_) => ("failed", None, Some("task_probe_launch_failed".into())),
        };
    let _ = std::fs::remove_dir_all(workspace);
    result
}

#[derive(Clone, Copy)]
enum TaskOutputFormat {
    CodexJsonl,
    FinalJsonl,
    Json,
    Text,
}

fn json_agent_response(output: &[u8]) -> Option<String> {
    let value = serde_json::from_slice::<Value>(output).ok()?;
    if value.get("isError").and_then(Value::as_bool) == Some(true)
        || value
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| {
                !matches!(
                    status.to_ascii_lowercase().as_str(),
                    "success" | "completed" | "ok"
                )
            })
        || value.get("error").is_some_and(|error| !error.is_null())
    {
        return None;
    }
    [
        "result", "response", "reply", "text", "message", "content", "payloads",
    ]
    .iter()
    .find_map(|key| value.get(key).and_then(json_text))
    .or_else(|| json_text(&value))
    .filter(|text| !text.trim().is_empty())
    .map(|text| text.trim().chars().take(2_000).collect())
}

fn final_jsonl_message(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output);
    let mut final_message = None;
    for line in text.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("error") => return None,
            Some("final") => {
                final_message = ["text", "response", "message", "result"]
                    .iter()
                    .find_map(|key| event.get(key).and_then(json_text));
            }
            _ => {}
        }
    }
    final_message
        .filter(|message| !message.trim().is_empty())
        .map(|message| message.trim().chars().take(2_000).collect())
}

fn json_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
        Value::Array(items) => items.iter().find_map(json_text),
        Value::Object(map) => ["text", "content", "message", "response", "result"]
            .iter()
            .find_map(|key| map.get(*key).and_then(json_text)),
        _ => None,
    }
}

fn text_agent_response(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output);
    let response = text.trim();
    (!response.is_empty()).then(|| response.chars().take(2_000).collect())
}

fn codex_final_message(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output);
    let mut final_message = None;
    for line in text.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) == Some("item.completed")
            && event.pointer("/item/type").and_then(Value::as_str) == Some("agent_message")
        {
            if let Some(message) = event.pointer("/item/text").and_then(Value::as_str) {
                let message = message.trim();
                if !message.is_empty() {
                    final_message = Some(message.chars().take(2_000).collect());
                }
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("turn.failed") {
            return None;
        }
    }
    final_message
}

fn read_bounded_output<R: std::io::Read>(stream: R, limit: u64) -> Vec<u8> {
    let mut output = Vec::new();
    let mut stream = stream;
    let mut buffer = [0u8; 8192];
    loop {
        let Ok(read) = stream.read(&mut buffer) else {
            break;
        };
        if read == 0 {
            break;
        }
        let limit = (limit as usize).min(usize::MAX);
        if limit == 0 {
            continue;
        }
        output.extend_from_slice(&buffer[..read]);
        if output.len() > limit {
            let overflow = output.len() - limit;
            output.drain(..overflow);
        }
    }
    output
}

fn hide_console_window(_command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        _command.creation_flags(0x0800_0000);
    }
}

struct BrowserProbeProcess {
    child: Child,
    profile_dir: std::path::PathBuf,
    socket: Option<tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>>,
    next_message_id: u64,
    cleaned: bool,
}

const BROWSER_CLEANUP_RETRY_COUNT: usize = 8;
const BROWSER_CLEANUP_RETRY_DELAY: Duration = Duration::from_millis(25);

fn remove_profile_dir_with_retry<F>(path: &Path, mut remove: F) -> Result<(), String>
where
    F: FnMut(&Path) -> std::io::Result<()>,
{
    let mut last_error = None;
    for attempt in 0..BROWSER_CLEANUP_RETRY_COUNT {
        match remove(path) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < BROWSER_CLEANUP_RETRY_COUNT {
                    std::thread::sleep(BROWSER_CLEANUP_RETRY_DELAY);
                }
            }
        }
    }
    let _ = last_error;
    Err("RUNNER_BROWSER_CLEANUP_FAILED".to_string())
}

impl BrowserProbeProcess {
    fn launch(executable: &Path, timeout: Duration) -> Result<Self, String> {
        let port = TcpListener::bind("127.0.0.1:0")
            .map_err(|_| "RUNNER_BROWSER_DEBUG_PORT_UNAVAILABLE")?
            .local_addr()
            .map_err(|_| "RUNNER_BROWSER_DEBUG_PORT_UNAVAILABLE")?
            .port();
        let profile_dir = std::env::temp_dir().join(format!(
            "sah-browser-v1-probe-{}-{}",
            std::process::id(),
            current_time_ms()
        ));
        std::fs::create_dir_all(&profile_dir)
            .map_err(|_| "RUNNER_BROWSER_PROFILE_CREATE_FAILED")?;
        let mut command = Command::new(executable);
        command
            .args([
                "--headless=new",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--remote-allow-origins=*",
            ])
            .arg(format!("--remote-debugging-port={port}"))
            .arg(format!("--user-data-dir={}", profile_dir.display()))
            .arg("about:blank")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        command.arg("--no-sandbox");
        let mut child = command
            .spawn()
            .map_err(|_| "RUNNER_BROWSER_LAUNCH_FAILED")?;
        let deadline = Instant::now() + timeout;
        let version_url = format!("http://127.0.0.1:{port}/json/version");
        let websocket_url = loop {
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_dir_all(&profile_dir);
                return Err("RUNNER_BROWSER_CDP_ENDPOINT_TIMEOUT".into());
            }
            if let Ok(version) = read_debugger_version(&version_url, Duration::from_millis(250)) {
                if let Some(url) = version.get("webSocketDebuggerUrl").and_then(Value::as_str) {
                    break url.to_string();
                }
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        let (socket, _) = match tungstenite::connect(websocket_url.as_str()) {
            Ok(connection) => connection,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_dir_all(&profile_dir);
                return Err("RUNNER_BROWSER_CDP_CONNECT_FAILED".into());
            }
        };
        Ok(Self {
            child,
            profile_dir,
            socket: Some(socket),
            next_message_id: 1,
            cleaned: false,
        })
    }

    fn run_cdp_probe(
        &mut self,
        fixture_url: &str,
        timeout: Duration,
        runner_id: &str,
        session_id: &str,
        tenant_id: &str,
        executable_discovery_source: &str,
        browser_version: &str,
    ) -> Result<(String, String, String, BrowserProbeEvidence), String> {
        let browser_context = self
            .command("Target.createBrowserContext", json!({}), None, timeout)?
            .get("browserContextId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_CONTEXT_CREATE_FAILED".to_string())?
            .to_string();
        let target = self
            .command(
                "Target.createTarget",
                json!({ "url": "about:blank", "browserContextId": browser_context }),
                None,
                timeout,
            )?
            .get("targetId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_TARGET_CREATE_FAILED".to_string())?
            .to_string();
        let attached = self.command(
            "Target.attachToTarget",
            json!({ "targetId": target, "flatten": true }),
            None,
            timeout,
        )?;
        let cdp_session = attached
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_TARGET_ATTACH_FAILED".to_string())?
            .to_string();
        self.command("Page.enable", json!({}), Some(&cdp_session), timeout)?;
        self.command("Runtime.enable", json!({}), Some(&cdp_session), timeout)?;
        self.command(
            "Page.navigate",
            json!({ "url": fixture_url }),
            Some(&cdp_session),
            timeout,
        )?;
        std::thread::sleep(Duration::from_millis(250).min(timeout));
        let observation = self.command(
            "Runtime.evaluate",
            json!({
                "expression": "JSON.stringify({title: document.title, url: location.href, html: (document.documentElement && document.documentElement.outerHTML || '').slice(0, 65536), text: (document.body && document.body.innerText || '').slice(0, 16384)})",
                "returnByValue": true,
            }),
            Some(&cdp_session),
            timeout,
        )?;
        let dom = cdp_string_value(&observation, "RUNNER_BROWSER_DOM_OBSERVATION_FAILED")?;
        let accessibility = self.command(
            "Accessibility.getFullAXTree",
            json!({}),
            Some(&cdp_session),
            timeout,
        )?;
        let accessibility_json = serde_json::to_string(&accessibility)
            .map_err(|_| "RUNNER_BROWSER_ACCESSIBILITY_SERIALIZE_FAILED")?;
        let screenshot = self.command(
            "Page.captureScreenshot",
            json!({ "format": "png" }),
            Some(&cdp_session),
            timeout,
        )?;
        let screenshot_base64 = screenshot
            .get("data")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "RUNNER_BROWSER_SCREENSHOT_FAILED".to_string())?
            .to_string();
        self.command(
            "Target.closeTarget",
            json!({ "targetId": target }),
            None,
            timeout,
        )?;
        self.command(
            "Target.disposeBrowserContext",
            json!({ "browserContextId": browser_context }),
            None,
            timeout,
        )?;
        let evidence = BrowserProbeEvidence::from_observation(
            runner_id,
            session_id,
            tenant_id,
            "chromium",
            executable_discovery_source,
            browser_version,
            &dom,
            &accessibility_json,
            &screenshot_base64,
            true,
        );
        Ok((dom, accessibility_json, screenshot_base64, evidence))
    }

    fn run_cdp_operation(
        &mut self,
        fixture_url: &str,
        timeout: Duration,
        payload: &Value,
        runner_id: &str,
        session_id: &str,
        tenant_id: &str,
        browser_version: &str,
    ) -> Result<BrowserExecutionEvidence, String> {
        let browser_context = self
            .command("Target.createBrowserContext", json!({}), None, timeout)?
            .get("browserContextId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_CONTEXT_CREATE_FAILED".to_string())?
            .to_string();
        let target = self
            .command(
                "Target.createTarget",
                json!({ "url": "about:blank", "browserContextId": browser_context }),
                None,
                timeout,
            )?
            .get("targetId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_TARGET_CREATE_FAILED".to_string())?
            .to_string();
        let attached = self.command(
            "Target.attachToTarget",
            json!({ "targetId": target, "flatten": true }),
            None,
            timeout,
        )?;
        let cdp_session = attached
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| "RUNNER_BROWSER_TARGET_ATTACH_FAILED".to_string())?
            .to_string();
        self.command("Page.enable", json!({}), Some(&cdp_session), timeout)?;
        self.command("Runtime.enable", json!({}), Some(&cdp_session), timeout)?;
        self.command(
            "Page.navigate",
            json!({ "url": fixture_url }),
            Some(&cdp_session),
            timeout,
        )?;
        let _ = wait_for_browser_dom_settle(timeout.min(Duration::from_secs(5)), || {
            let refreshed = self.command(
                "Runtime.evaluate",
                json!({
                    "expression": "JSON.stringify({candidates: Array.from(document.querySelectorAll('a,button,input,textarea,select')).slice(0, 32).map((el,index) => ({targetId: 'candidate-' + index, role: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('name') || '').slice(0, 160)}))})",
                    "returnByValue": true,
                }),
                Some(&cdp_session),
                timeout,
            )?;
            let refreshed_dom =
                cdp_string_value(&refreshed, "RUNNER_BROWSER_DOM_OBSERVATION_FAILED")?;
            let refreshed_observed: Value = serde_json::from_str(&refreshed_dom)
                .map_err(|_| "RUNNER_BROWSER_OBSERVATION_INVALID".to_string())?;
            Ok(refreshed_observed
                .get("candidates")
                .and_then(Value::as_array)
                .cloned()
                .map(filter_named_browser_candidates)
                .unwrap_or_default())
        })?;

        let observation = self.command(
            "Runtime.evaluate",
            json!({
                "expression": "JSON.stringify({title: document.title, url: location.href, html: (document.documentElement && document.documentElement.outerHTML || '').slice(0, 65536), text: (document.body && document.body.innerText || '').slice(0, 16384), candidates: Array.from(document.querySelectorAll('a,button,input,textarea,select')).slice(0, 32).map((el,index) => ({targetId: 'candidate-' + index, role: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('name') || '').slice(0, 160)}))})",
                "returnByValue": true,
            }),
            Some(&cdp_session),
            timeout,
        )?;
        let dom = cdp_string_value(&observation, "RUNNER_BROWSER_DOM_OBSERVATION_FAILED")?;
        let observed: Value =
            serde_json::from_str(&dom).map_err(|_| "RUNNER_BROWSER_OBSERVATION_INVALID")?;
        let candidates = observed
            .get("candidates")
            .and_then(Value::as_array)
            .cloned()
            .map(filter_named_browser_candidates)
            .unwrap_or_default();
        let accessibility = self.command(
            "Accessibility.getFullAXTree",
            json!({}),
            Some(&cdp_session),
            timeout,
        )?;
        let accessibility_json = serde_json::to_string(&accessibility)
            .map_err(|_| "RUNNER_BROWSER_ACCESSIBILITY_SERIALIZE_FAILED")?;
        let screenshot = self.command(
            "Page.captureScreenshot",
            json!({ "format": "png" }),
            Some(&cdp_session),
            timeout,
        )?;
        let screenshot_base64 = screenshot
            .get("data")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "RUNNER_BROWSER_SCREENSHOT_FAILED".to_string())?;
        let stage = payload.get("stage").and_then(Value::as_str);
        if payload.get("requiresIndependentVerification") == Some(&json!(true))
            && !matches!(
                stage,
                Some("observe") | Some("action") | Some("post_action_observe")
            )
        {
            return Err("RUNNER_SEMANTIC_STAGE_REQUIRED".into());
        }
        let (operation, action, semantic_observation) = match stage {
            Some("observe") | Some("post_action_observe") => {
                let request = payload
                    .get("observationRequest")
                    .ok_or_else(|| "RUNNER_OBSERVATION_REQUEST_REQUIRED".to_string())?;
                let revision = request
                    .get("minimumRevision")
                    .and_then(Value::as_u64)
                    .unwrap_or(1);
                let browser_generation = hash_reference(
                    "browser-generation",
                    &[runner_id, session_id, fixture_url, browser_version],
                );
                let observation_id = hash_reference(
                    "observation-id",
                    &[
                        &dom,
                        &accessibility_json,
                        screenshot_base64,
                        &revision.to_string(),
                    ],
                );
                let elements = candidates
                    .iter()
                    .map(|candidate| {
                        let role = candidate.get("role").and_then(Value::as_str).unwrap_or("element");
                        let family = if matches!(role, "input" | "textarea") { "type" } else { "click" };
                        json!({
                            "targetRef": candidate.get("targetId").and_then(Value::as_str).unwrap_or("candidate-unknown"),
                            "role": role,
                            "name": candidate.get("name").and_then(Value::as_str).unwrap_or("element"),
                            "visible": true,
                            "enabled": true,
                            "occluded": false,
                            "frameId": "main",
                            "origin": fixture_url.split('/').take(3).collect::<Vec<_>>().join("/"),
                            "supportedActionFamilies": [family],
                        })
                    })
                    .collect::<Vec<_>>();
                let origin = fixture_url.split('/').take(3).collect::<Vec<_>>().join("/");
                let observation = json!({
                    "observationId": observation_id,
                    "revision": revision,
                    "observedAt": current_time_iso(),
                    "origin": origin,
                    "url": fixture_url,
                    "browserGeneration": browser_generation,
                    "elements": elements,
                });
                (stage.unwrap_or("observe"), "none", Some(observation))
            }
            Some("action") => {
                let lineage = payload
                    .get("lineage")
                    .and_then(Value::as_object)
                    .ok_or_else(|| "RUNNER_SEMANTIC_LINEAGE_REQUIRED".to_string())?;
                for field in [
                    "observationId",
                    "observationRevision",
                    "browserGeneration",
                    "candidateSetId",
                    "candidateSetHash",
                    "decisionId",
                    "selectedCandidateId",
                    "policyDecisionId",
                    "actionId",
                    "actionType",
                    "targetRef",
                    "targetIdentity",
                ] {
                    if lineage.get(field).is_none() {
                        return Err(format!("RUNNER_SEMANTIC_LINEAGE_{field}_REQUIRED"));
                    }
                }
                let target_ref = lineage
                    .get("targetRef")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "RUNNER_SEMANTIC_TARGET_REQUIRED".to_string())?;
                if !candidates.iter().any(|candidate| {
                    candidate.get("targetId").and_then(Value::as_str) == Some(target_ref)
                }) {
                    let _ = wait_for_semantic_target(
                        target_ref,
                        timeout.min(Duration::from_secs(5)),
                        || {
                            let refreshed = self.command(
                                "Runtime.evaluate",
                                json!({
                                    "expression": "JSON.stringify({candidates: Array.from(document.querySelectorAll('a,button,input,textarea,select')).slice(0, 32).map((el,index) => ({targetId: 'candidate-' + index, role: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('name') || '').slice(0, 160)}))})",
                                    "returnByValue": true,
                                }),
                                Some(&cdp_session),
                                timeout,
                            )?;
                            let refreshed_dom = cdp_string_value(
                                &refreshed,
                                "RUNNER_BROWSER_DOM_OBSERVATION_FAILED",
                            )?;
                            let refreshed_observed: Value = serde_json::from_str(&refreshed_dom)
                                .map_err(|_| "RUNNER_BROWSER_OBSERVATION_INVALID")?;
                            Ok(refreshed_observed
                                .get("candidates")
                                .and_then(Value::as_array)
                                .cloned()
                                .map(filter_named_browser_candidates)
                                .unwrap_or_default())
                        },
                    )?;
                }
                let action_type = lineage
                    .get("actionType")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "RUNNER_SEMANTIC_ACTION_TYPE_REQUIRED".to_string())?;
                let index = target_ref
                    .strip_prefix("candidate-")
                    .and_then(|value| value.parse::<usize>().ok())
                    .ok_or_else(|| "RUNNER_SEMANTIC_TARGET_REFERENCE_INVALID".to_string())?;
                let selector = format!(
                    "a,button,input,textarea,select:nth-of-type({})",
                    index.saturating_add(1)
                );
                let params = lineage
                    .get("parameters")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                let script = match action_type {
                    "click" => format!("(() => {{ const el = document.querySelectorAll('a,button,input,textarea,select')[{}]; if (!el) throw new Error('target'); el.click(); return 'clicked'; }})()", index),
                    "type" => {
                        let text = params.get("text").and_then(Value::as_str).ok_or_else(|| "RUNNER_SEMANTIC_TEXT_REQUIRED".to_string())?;
                        if text.len() > 2_000 { return Err("RUNNER_SEMANTIC_TEXT_TOO_LARGE".into()); }
                        format!("(() => {{ const el = document.querySelectorAll('a,button,input,textarea,select')[{}]; if (!el) throw new Error('target'); el.value = {}; el.dispatchEvent(new Event('input', {{bubbles:true}})); return 'typed'; }})()", index, serde_json::to_string(text).unwrap_or_default())
                    }
                    _ => return Err("RUNNER_SEMANTIC_ACTION_UNSUPPORTED".into()),
                };
                self.command(
                    "Runtime.evaluate",
                    json!({ "expression": script, "returnByValue": true }),
                    Some(&cdp_session),
                    timeout,
                )?;
                let _ = selector;
                ("action", action_type, None)
            }
            _ => {
                let operation = payload
                    .get("operation")
                    .and_then(Value::as_str)
                    .unwrap_or("observe");
                let action = payload
                    .get("action")
                    .and_then(Value::as_str)
                    .unwrap_or("none");
                if operation != "observe" && operation != "observe_and_act" {
                    return Err("RUNNER_BROWSER_OPERATION_UNSUPPORTED".into());
                }
                (operation, action, None)
            }
        };
        let correlation = payload
            .get("correlation")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let observation_ref = hash_reference(
            "observation",
            &[&dom, &accessibility_json, screenshot_base64],
        );
        let action_ref = hash_reference("action", &[operation, action, &dom]);
        let verification_input_ref = hash_reference(
            "verification-input",
            &[&observation_ref, &action_ref, fixture_url],
        );
        let result_ref = hash_reference(
            "result",
            &[
                runner_id,
                session_id,
                tenant_id,
                browser_version,
                &observation_ref,
                &action_ref,
                &verification_input_ref,
                &correlation.to_string(),
            ],
        );
        self.command(
            "Target.closeTarget",
            json!({ "targetId": target }),
            None,
            timeout,
        )?;
        self.command(
            "Target.disposeBrowserContext",
            json!({ "browserContextId": browser_context }),
            None,
            timeout,
        )?;
        let _ = candidates;
        Ok(BrowserExecutionEvidence {
            result_ref,
            evidence_refs: vec![
                observation_ref.clone(),
                action_ref.clone(),
                verification_input_ref.clone(),
            ],
            observation_ref,
            action_ref,
            verification_input_ref,
            semantic_observation,
            cleanup_succeeded: true,
        })
    }

    fn command(
        &mut self,
        method: &str,
        params: Value,
        session_id: Option<&str>,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next_message_id;
        self.next_message_id = self.next_message_id.saturating_add(1);
        let mut message = json!({ "id": id, "method": method, "params": params });
        if let Some(session_id) = session_id {
            message["sessionId"] = Value::String(session_id.to_string());
        }
        let socket = self
            .socket
            .as_mut()
            .ok_or_else(|| "RUNNER_BROWSER_CDP_NOT_CONNECTED".to_string())?;
        socket
            .send(tungstenite::Message::Text(message.to_string().into()))
            .map_err(|_| "RUNNER_BROWSER_CDP_SEND_FAILED")?;
        let deadline = Instant::now() + timeout;
        loop {
            if Instant::now() >= deadline {
                return Err(format!("RUNNER_BROWSER_CDP_TIMEOUT_{method}"));
            }
            let message = socket
                .read()
                .map_err(|_| "RUNNER_BROWSER_CDP_READ_FAILED")?;
            let text = match message {
                tungstenite::Message::Text(text) => text.to_string(),
                tungstenite::Message::Binary(bytes) => String::from_utf8(bytes.to_vec())
                    .map_err(|_| "RUNNER_BROWSER_CDP_MESSAGE_INVALID")?,
                _ => continue,
            };
            let value: Value =
                serde_json::from_str(&text).map_err(|_| "RUNNER_BROWSER_CDP_MESSAGE_INVALID")?;
            if value.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if value.get("error").is_some() {
                return Err(format!("RUNNER_BROWSER_CDP_COMMAND_FAILED_{method}"));
            }
            return Ok(value.get("result").cloned().unwrap_or_else(|| json!({})));
        }
    }

    fn cleanup(&mut self) -> Result<(), String> {
        if self.cleaned {
            return Ok(());
        }
        self.cleaned = true;
        self.socket.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
        remove_profile_dir_with_retry(&self.profile_dir, |path| std::fs::remove_dir_all(path))
    }
}

impl Drop for BrowserProbeProcess {
    fn drop(&mut self) {
        if !self.cleaned {
            let _ = self.child.kill();
            let _ = self.child.wait();
            let _ = std::fs::remove_dir_all(&self.profile_dir);
        }
    }
}

fn read_debugger_version(url: &str, timeout: Duration) -> Result<Value, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .http_status_as_error(false)
        .build()
        .new_agent();
    let response = agent
        .get(url)
        .call()
        .map_err(|_| "RUNNER_BROWSER_CDP_VERSION_UNAVAILABLE")?;
    if !response.status().is_success() {
        return Err("RUNNER_BROWSER_CDP_VERSION_REJECTED".into());
    }
    let bytes = response
        .into_body()
        .with_config()
        .limit(64 * 1024)
        .read_to_vec()
        .map_err(|_| "RUNNER_BROWSER_CDP_VERSION_READ_FAILED")?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_BROWSER_CDP_VERSION_INVALID".into())
}

fn cdp_string_value(value: &Value, error: &str) -> Result<String, String> {
    value
        .get("result")
        .and_then(|result| result.get("value"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| error.to_string())
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn current_time_iso() -> String {
    let now = SystemTime::now();
    let duration = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    let total_days = (duration.as_secs() / 86_400) as i64;
    let seconds_today = duration.as_secs() % 86_400;
    let (year, month, day) = civil_from_days(total_days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds_today / 3_600,
        (seconds_today % 3_600) / 60,
        seconds_today % 60,
        duration.subsec_millis()
    )
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let shifted = days_since_epoch + 719_468;
    let era = if shifted >= 0 {
        shifted / 146_097
    } else {
        (shifted - 146_096) / 146_097
    };
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn hash_reference(prefix: &str, values: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for value in values {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    format!("{prefix}:sha256:{:x}", hasher.finalize())
}

fn read_probe_output<R: std::io::Read>(mut stream: R) -> Vec<u8> {
    let mut output = Vec::new();
    let mut limited = stream.by_ref().take(16 * 1024);
    let _ = limited.read_to_end(&mut output);
    output
}

pub fn approved_manifest(candidate: &ToolCandidate) -> bool {
    candidate.adapter_id.as_deref().is_some_and(|adapter| {
        ADAPTERS
            .iter()
            .any(|manifest| manifest.id == adapter && manifest.allowed)
    })
}

pub fn build_process_spec(
    candidate: &ToolCandidate,
    workspace: &Path,
    args: &[String],
) -> Result<ProcessSpec, String> {
    if !can_execute(candidate) {
        return Err("RUNNER_ADAPTER_NOT_READY".into());
    }
    let program = candidate
        .executable_path
        .clone()
        .ok_or_else(|| "RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING".to_string())?;
    if args.len() > 64 || args.iter().any(|arg| arg.contains('\0')) {
        return Err("RUNNER_ADAPTER_ARGUMENTS_INVALID".into());
    }
    let mut environment = vec![("SAH_RUNNER_ADAPTER".into(), candidate.tool_id.clone())];
    for key in [
        "PATH",
        "HOME",
        "USERPROFILE",
        "XDG_CONFIG_HOME",
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
    ] {
        if let Ok(value) = std::env::var(key) {
            environment.push((key.into(), value));
        }
    }
    Ok(ProcessSpec {
        program,
        args: args.to_vec(),
        working_directory: workspace.to_path_buf(),
        environment,
    })
}

pub fn can_execute(candidate: &ToolCandidate) -> bool {
    candidate.trust_state == TrustState::Ready && approved_manifest(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_spawn_failures_map_to_safe_actionable_reason_codes() {
        assert_eq!(
            probe_failure_reason("RUNNER_ADAPTER_PROBE_SPAWN_NOT_FOUND"),
            "probe_executable_not_found"
        );
        assert_eq!(
            probe_failure_reason("RUNNER_ADAPTER_PROBE_SPAWN_PERMISSION_DENIED"),
            "probe_permission_denied"
        );
        assert_eq!(
            probe_failure_reason("RUNNER_ADAPTER_PROBE_SPAWN_INVALID_EXECUTABLE"),
            "probe_invalid_executable"
        );
        assert_eq!(
            probe_failure_reason("RUNNER_WINDOWS_SYSTEM_ROOT_UNAVAILABLE"),
            "probe_system_path_unavailable"
        );
        assert_eq!(
            probe_failure_reason("RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT"),
            "probe_unsafe_cli_shim"
        );
        assert_eq!(
            probe_spawn_error(std::io::Error::from(std::io::ErrorKind::NotFound)),
            "RUNNER_ADAPTER_PROBE_SPAWN_NOT_FOUND"
        );
        assert_eq!(
            probe_spawn_error(std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
            "RUNNER_ADAPTER_PROBE_SPAWN_PERMISSION_DENIED"
        );
        assert_eq!(
            probe_spawn_error(std::io::Error::from(std::io::ErrorKind::InvalidInput)),
            "RUNNER_ADAPTER_PROBE_SPAWN_INVALID_EXECUTABLE"
        );
    }

    #[test]
    fn only_harnesses_with_a_documented_one_shot_prompt_are_task_verifiable() {
        for adapter in [
            "codex.v1",
            "claude.v1",
            "deepseek.v1",
            "antigravity.v1",
            "openclaw.v1",
            "hermes.v1",
        ] {
            assert!(supports_task_smoke_test(Some(adapter)), "{adapter}");
        }
        assert!(!supports_task_smoke_test(Some("browser.v1")));
        assert!(!supports_task_smoke_test(None));
    }

    #[test]
    fn task_result_parsers_require_a_real_final_response() {
        assert_eq!(
            json_agent_response(r#"{"status":"SUCCESS","response":"ระบบพร้อมแล้ว"}"#.as_bytes()),
            Some("ระบบพร้อมแล้ว".into())
        );
        assert_eq!(
            json_agent_response(r#"{"status":"error","response":"ignored"}"#.as_bytes()),
            None
        );
        assert_eq!(
            final_jsonl_message(
                r#"{"type":"text","text":"intermediate"}
{"type":"final","text":"ระบบพร้อมแล้ว"}"#
                    .as_bytes()
            ),
            Some("ระบบพร้อมแล้ว".into())
        );
        assert_eq!(
            final_jsonl_message(r#"{"type":"error","message":"not authenticated"}"#.as_bytes()),
            None
        );
    }

    #[test]
    fn semantic_target_wait_retries_until_fresh_candidate_is_present() {
        let mut attempts = 0;
        let candidates =
            wait_for_semantic_target("candidate-3", Duration::from_millis(500), || {
                attempts += 1;
                Ok(if attempts == 1 {
                    vec![json!({"targetId": "candidate-0"})]
                } else {
                    vec![json!({"targetId": "candidate-3"})]
                })
            })
            .expect("target should become available within the bounded wait");

        assert_eq!(attempts, 2);
        assert_eq!(candidates[0].get("targetId"), Some(&json!("candidate-3")));
    }

    #[test]
    fn semantic_target_wait_fails_closed_after_deadline() {
        let error = wait_for_semantic_target("candidate-3", Duration::from_millis(1), || {
            Ok(vec![json!({"targetId": "candidate-0"})])
        })
        .expect_err("missing target must fail closed");

        assert_eq!(error, "RUNNER_SEMANTIC_TARGET_NOT_IN_OBSERVATION");
    }

    #[test]
    fn browser_dom_settle_waits_through_prerender_hydration() {
        let mut attempts = 0;
        let candidates = wait_for_browser_dom_settle(Duration::from_millis(500), || {
            attempts += 1;
            Ok(if attempts < 4 {
                vec![json!({"targetId": "candidate-0", "role": "a"})]
            } else {
                vec![
                    json!({"targetId": "candidate-0", "role": "a"}),
                    json!({"targetId": "candidate-1", "role": "input"}),
                ]
            })
        })
        .expect("hydrated candidates should be returned after the DOM settles");

        assert_eq!(
            candidates.len(),
            2,
            "settle must return hydrated candidates"
        );
        assert_eq!(candidates[1].get("role"), Some(&json!("input")));
    }

    #[test]
    fn browser_dom_settle_does_not_freeze_on_a_slow_prerender_shell() {
        let mut attempts = 0;
        let candidates = wait_for_browser_dom_settle(Duration::from_secs(2), || {
            attempts += 1;
            Ok(if attempts < 12 {
                vec![json!({"targetId": "candidate-0", "role": "a", "name": "Site Index"})]
            } else {
                vec![
                    json!({"targetId": "candidate-0", "role": "a", "name": "Site Index"}),
                    json!({"targetId": "candidate-24", "role": "input", "name": "email"}),
                ]
            })
        })
        .expect("the bounded settle must return the hydrated candidate set");

        assert_eq!(
            candidates.len(),
            2,
            "settle must not accept the early shell"
        );
        assert_eq!(candidates[1].get("name"), Some(&json!("email")));
    }

    #[test]
    fn browser_candidates_without_names_are_excluded_before_observation() {
        let candidates = filter_named_browser_candidates(vec![
            json!({"targetId": "candidate-0", "role": "a", "name": "   "}),
            json!({"targetId": "candidate-1", "role": "input", "name": "email"}),
        ]);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].get("targetId"), Some(&json!("candidate-1")));
    }

    fn valid_browser_grant() -> BrowserAuthorizationGrant {
        BrowserAuthorizationGrant {
            runner_id: "runner-p213".into(),
            runner_session_id: "session-p213".into(),
            tenant_id: "tenant-p213".into(),
            authorization_evidence_ref: "runner-auth:sha256:auth-proof".into(),
            expires_at_ms: u64::MAX,
            revoked: false,
        }
    }

    #[test]
    fn browser_grant_requires_current_runner_session_and_tenant_binding() {
        let grant = valid_browser_grant();
        assert!(validate_browser_authorization_grant(
            &grant,
            "runner-p213",
            "session-p213",
            "tenant-p213",
            1,
        )
        .is_ok());
        assert_eq!(
            validate_browser_authorization_grant(
                &grant,
                "runner-other",
                "session-p213",
                "tenant-p213",
                1,
            )
            .unwrap_err(),
            "RUNNER_AUTHORIZATION_BINDING_MISMATCH"
        );
        assert_eq!(
            validate_browser_authorization_grant(
                &grant,
                "runner-p213",
                "session-other",
                "tenant-p213",
                1,
            )
            .unwrap_err(),
            "RUNNER_AUTHORIZATION_BINDING_MISMATCH"
        );
        assert_eq!(
            validate_browser_authorization_grant(
                &grant,
                "runner-p213",
                "session-p213",
                "tenant-other",
                1,
            )
            .unwrap_err(),
            "RUNNER_AUTHORIZATION_BINDING_MISMATCH"
        );
    }

    #[test]
    fn expired_or_revoked_browser_grant_fails_closed() {
        let mut expired = valid_browser_grant();
        expired.expires_at_ms = 10;
        assert_eq!(
            validate_browser_authorization_grant(
                &expired,
                "runner-p213",
                "session-p213",
                "tenant-p213",
                11,
            )
            .unwrap_err(),
            "RUNNER_AUTHORIZATION_EXPIRED"
        );
        let mut revoked = valid_browser_grant();
        revoked.revoked = true;
        assert_eq!(
            validate_browser_authorization_grant(
                &revoked,
                "runner-p213",
                "session-p213",
                "tenant-p213",
                1,
            )
            .unwrap_err(),
            "RUNNER_AUTHORIZATION_REVOKED"
        );
    }

    #[test]
    fn browser_probe_state_never_becomes_ready_without_auth_and_probe() {
        assert_eq!(
            derive_browser_probe_state(false, false, true),
            BrowserProbeState::AuthRequired
        );
        assert_eq!(
            derive_browser_probe_state(true, false, true),
            BrowserProbeState::ProbeFailed
        );
        assert_eq!(
            derive_browser_probe_state(true, true, false),
            BrowserProbeState::Stale
        );
        assert_eq!(
            derive_browser_probe_state(true, true, true),
            BrowserProbeState::Ready
        );
    }

    #[test]
    fn probe_evidence_is_reference_only_and_cleanup_failure_is_not_ready() {
        let evidence = BrowserProbeEvidence::from_observation(
            "runner-p213",
            "session-p213",
            "tenant-p213",
            "chromium",
            "runner_cache",
            "153.0.8010.12",
            "<html>p213</html>",
            "AXTree:p213",
            "screenshot-bytes",
            false,
        );
        assert!(evidence
            .probe_evidence_ref
            .starts_with("browser-probe:sha256:"));
        assert_eq!(evidence.executable_discovery_source, "runner_cache");
        assert_eq!(evidence.browser_version, "153.0.8010.12");
        assert!(!evidence.probe_evidence_ref.contains("screenshot-bytes"));
        assert_eq!(
            derive_browser_probe_state(true, false, true),
            BrowserProbeState::ProbeFailed
        );
    }

    #[test]
    fn browser_profile_cleanup_retries_transient_remove_failures() {
        let temp = tempfile::tempdir().unwrap();
        let profile = temp.path().join("browser-profile");
        std::fs::create_dir(&profile).unwrap();
        let mut attempts = 0;
        let result = remove_profile_dir_with_retry(&profile, |path| {
            attempts += 1;
            if attempts < 3 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "transient cleanup contention",
                ));
            }
            std::fs::remove_dir_all(path)
        });
        assert!(result.is_ok());
        assert_eq!(attempts, 3);
        assert!(!profile.exists());
    }

    #[test]
    fn only_approved_ready_adapter_can_execute() {
        let mut candidate = crate::discovery::scan_known_tools(
            crate::config::RunnerProfile::LocalDevice,
            &["codex".into()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "codex")
        .unwrap();
        assert!(!can_execute(&candidate));
        candidate.trust_state = TrustState::Ready;
        assert!(can_execute(&candidate));
        candidate.adapter_id = Some("unknown.v1".into());
        assert!(!can_execute(&candidate));
    }

    #[test]
    fn browser_adapter_is_approved_but_not_ready_without_authentication() {
        let mut candidate = crate::discovery::scan_known_tools(
            crate::config::RunnerProfile::LocalDevice,
            &["browser".into()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "browser")
        .unwrap();

        apply_probe(
            &mut candidate,
            AdapterProbeResult {
                version: "chromium-120".into(),
                authenticated: false,
                healthy: true,
                available: true,
                reason_codes: vec!["browser_probe_ok".into(), "pairing_required".into()],
            },
        )
        .unwrap();

        assert!(approved_manifest(&candidate));
        assert_eq!(candidate.trust_state, TrustState::AuthRequired);
        assert!(!can_execute(&candidate));
    }

    #[test]
    fn ready_requires_bounded_probe_and_process_spec_uses_discovered_path() {
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("codex");
        std::fs::write(&executable, b"placeholder").unwrap();
        let mut candidate = crate::discovery::scan_path_entries(
            crate::config::RunnerProfile::LocalDevice,
            &[temp.path().to_path_buf()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "codex")
        .unwrap();
        assert!(!can_execute(&candidate));
        apply_probe(
            &mut candidate,
            AdapterProbeResult {
                version: "1.0.0".into(),
                authenticated: true,
                healthy: true,
                available: true,
                reason_codes: vec!["probe_ok".into()],
            },
        )
        .unwrap();
        let spec = build_process_spec(&candidate, temp.path(), &["--version".into()]).unwrap();
        assert_eq!(spec.program, executable.canonicalize().unwrap());
        assert!(can_execute(&candidate));
    }

    #[cfg(unix)]
    #[test]
    fn real_probe_is_bounded_and_does_not_promote_health_to_authentication() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        symlink("/bin/echo", temp.path().join("codex")).unwrap();
        let candidate = crate::discovery::scan_path_entries(
            crate::config::RunnerProfile::LocalDevice,
            &[temp.path().to_path_buf()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "codex")
        .unwrap();
        let result = probe_candidate(&candidate, Duration::from_secs(1)).unwrap();
        assert!(result.healthy);
        assert!(result
            .reason_codes
            .iter()
            .any(|code| code == "auth_probe_required"));
        assert!(!result.authenticated);
    }

    #[test]
    fn codex_login_status_requires_an_exact_known_success_line() {
        assert!(codex_login_status_authenticated(
            b"Logged in using ChatGPT\n"
        ));
        assert!(codex_login_status_authenticated(
            b"Logged in using API key\n"
        ));
        assert!(!codex_login_status_authenticated(b"not logged in\n"));
        assert!(!codex_login_status_authenticated(
            b"Logged in using ChatGPT; token=secret\n"
        ));
        assert!(!codex_login_status_authenticated(b"\xff"));
    }

    #[test]
    fn codex_wif_configuration_defers_status_probe_when_either_variable_is_present() {
        assert!(!codex_wif_configured(false, false));
        assert!(codex_wif_configured(true, false));
        assert!(codex_wif_configured(false, true));
        assert!(codex_wif_configured(true, true));
    }

    #[cfg(unix)]
    #[test]
    fn codex_adapter_probe_uses_bounded_local_login_status_without_exposing_output() {
        use std::os::unix::fs::PermissionsExt;

        if codex_wif_is_configured() {
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("codex");
        std::fs::write(
            &executable,
            b"#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf 'codex 0.162.0\\n'; exit 0; fi\nif [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then printf 'Logged in using ChatGPT\\n'; exit 0; fi\nexit 1\n",
        )
        .unwrap();
        let mut permissions = std::fs::metadata(&executable).unwrap().permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&executable, permissions).unwrap();
        let candidate = crate::discovery::scan_path_entries(
            crate::config::RunnerProfile::LocalDevice,
            &[temp.path().to_path_buf()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "codex")
        .unwrap();

        let result = probe_candidate(&candidate, Duration::from_secs(1)).unwrap();
        assert_eq!(result.version, "codex 0.162.0");
        assert!(result.authenticated);
        assert!(result
            .reason_codes
            .iter()
            .any(|code| code == "auth_status_ok"));
        assert!(!format!("{result:?}").contains("Logged in using"));
    }
}
