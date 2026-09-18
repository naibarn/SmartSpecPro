use crate::discovery::{ToolCandidate, ToolKind, TrustState};
use crate::process::ProcessSpec;
use std::io::Read as _;
use std::path::Path;
use std::time::{Duration, Instant};

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
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterProbeResult {
    pub version: String,
    pub authenticated: bool,
    pub healthy: bool,
    pub available: bool,
    pub reason_codes: Vec<String>,
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
    candidate.reason_codes = result.reason_codes;
    candidate.trust_state = if result.available && result.healthy && result.authenticated {
        TrustState::Ready
    } else if !result.authenticated {
        TrustState::AuthRequired
    } else if !result.available {
        TrustState::Degraded
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
    let mut child = std::process::Command::new(program)
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|_| "RUNNER_ADAPTER_PROBE_SPAWN_FAILED".to_string())?;
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
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "RUNNER_ADAPTER_PROBE_STATUS_FAILED".to_string())?
        {
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
    Ok(AdapterProbeResult {
        version,
        authenticated: false,
        healthy: status.success(),
        available: status.success(),
        reason_codes: if status.success() {
            vec!["version_probe_ok".into(), "auth_probe_required".into()]
        } else {
            vec!["version_probe_failed".into()]
        },
    })
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
    Ok(ProcessSpec {
        program,
        args: args.to_vec(),
        working_directory: workspace.to_path_buf(),
        environment: vec![("SAH_RUNNER_ADAPTER".into(), candidate.tool_id.clone())],
    })
}

pub fn can_execute(candidate: &ToolCandidate) -> bool {
    candidate.trust_state == TrustState::Ready && approved_manifest(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
