use crate::adapters::{build_process_spec, can_execute};
use crate::config::RunnerConfig;
use crate::discovery::ToolCandidate;
use crate::protocol::RunnerJobCommand;
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalAgentResult {
    pub result_ref: String,
    pub evidence_ref: String,
    pub exit_code: i32,
}

pub struct ExternalAgentProcess {
    child: Child,
    output_path: PathBuf,
    error_path: PathBuf,
    started_at: Instant,
    deadline: Instant,
    candidate: Option<crate::spec224_candidate::Candidate>,
}

pub(crate) fn workspace_path(config: &RunnerConfig, reference: &str) -> Result<PathBuf, String> {
    let reference = if reference.trim().is_empty() {
        std::env::var("SAH_RUNNER_DEFAULT_WORKSPACE_ID").unwrap_or_default()
    } else {
        reference.to_string()
    };
    let path = Path::new(&reference);
    if reference.trim().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err("RUNNER_WORKSPACE_REFERENCE_INVALID".into());
    }
    if crate::workspace_registry::registry_file(config).exists() {
        match crate::workspace_registry::resolve(config, &reference) {
            Ok(workspace) => return Ok(workspace),
            Err(error) if reference.starts_with("ws-") => return Err(error),
            Err(_) => {}
        }
    }
    let root = PathBuf::from(&config.data_root).join("workspaces");
    let workspace = root.join(path);
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".to_string())?;
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|_| "RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".to_string())?;
    if !canonical_workspace.is_dir() || !canonical_workspace.starts_with(canonical_root) {
        return Err("RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".into());
    }
    Ok(canonical_workspace)
}

fn deadline_duration(deadline: &str) -> Result<Duration, String> {
    let (date, time) = deadline
        .strip_suffix('Z')
        .and_then(|value| value.split_once('T'))
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let mut date_parts = date.split('-').map(|part| part.parse::<i64>());
    let year = date_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let month = date_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let day = date_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let time = time.split('.').next().unwrap_or(time);
    let mut time_parts = time.split(':').map(|part| part.parse::<u64>());
    let hour = time_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let minute = time_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let second = time_parts
        .next()
        .transpose()
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_INVALID")?
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return Err("RUNNER_COMMAND_DEADLINE_INVALID".into());
    }
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146097 + day_of_era - 719468;
    let seconds = days
        .checked_mul(86_400)
        .and_then(|value| value.checked_add((hour * 3_600 + minute * 60 + second) as i64))
        .ok_or_else(|| "RUNNER_COMMAND_DEADLINE_INVALID".to_string())?;
    let deadline = if seconds < 0 {
        return Err("RUNNER_COMMAND_DEADLINE_INVALID".into());
    } else {
        UNIX_EPOCH + Duration::from_secs(seconds as u64)
    };
    deadline
        .duration_since(SystemTime::now())
        .map(|remaining| remaining.min(Duration::from_secs(7_200)))
        .map_err(|_| "RUNNER_COMMAND_DEADLINE_EXPIRED".to_string())
}

pub fn fixed_provider_args(command: &RunnerJobCommand) -> Result<Vec<String>, String> {
    let task_id = command
        .payload
        .get("taskId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_AGENT_TASK_ID_REQUIRED".to_string())?;
    let instruction = if command.input_ref.starts_with("spec224-input:") {
        let manifest = crate::run_input::manifest_relative_path(&command.input_ref);
        format!(
            "SmartAIHub task {task_id}. Read the verified governed task input manifest at {manifest} in the isolated candidate workspace and make only the requested source changes. Do not build, test, or launch the application; those actions are controlled separately by the user."
        )
    } else {
        format!(
            "SmartAIHub task {task_id}. Read the governed task input reference {} from the isolated candidate workspace and make only the requested source changes. Do not build, test, or launch the application; those actions are controlled separately by the user.",
            command.input_ref
        )
    };
    match command.adapter_id.as_str() {
        "codex.v1" => Ok(vec![
            "exec".into(),
            "--json".into(),
            "--sandbox".into(),
            "workspace-write".into(),
            "--ephemeral".into(),
            "--skip-git-repo-check".into(),
            "--".into(),
            instruction,
        ]),
        "claude.v1" => Ok(vec![
            "-p".into(),
            "--permission-mode".into(),
            "acceptEdits".into(),
            "--settings".into(),
            r#"{"sandbox":{"enabled":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true}}"#.into(),
            "--output-format".into(),
            "stream-json".into(),
            instruction,
        ]),
        _ => Err("RUNNER_COMMAND_ADAPTER_UNSUPPORTED".into()),
    }
}

pub fn start_external_agent(
    config: &RunnerConfig,
    command: &RunnerJobCommand,
    candidate: &ToolCandidate,
    spec224_candidate: Option<crate::spec224_candidate::Candidate>,
    now: Instant,
) -> Result<ExternalAgentProcess, String> {
    if command.execution_kind != "external_agent_task" {
        return Err("RUNNER_EXECUTION_KIND_UNSUPPORTED".into());
    }
    if candidate.adapter_id.as_deref() != Some(command.adapter_id.as_str())
        || !can_execute(candidate)
    {
        return Err("RUNNER_AGENT_CAPABILITY_NOT_READY".into());
    }
    let workspace = if let Some(candidate) = &spec224_candidate {
        candidate.root.clone()
    } else {
        workspace_path(
            config,
            command
                .workspace_ref
                .as_deref()
                .ok_or_else(|| "RUNNER_WORKSPACE_REFERENCE_REQUIRED".to_string())?,
        )?
    };
    let args = fixed_provider_args(command)?;
    if command.adapter_id == "claude.v1" {
        ensure_claude_sandbox_available()?;
    }
    let spec = build_process_spec(candidate, &workspace, &args)?;
    let bounded_duration = deadline_duration(&command.deadline)?;
    let log_root = PathBuf::from(&config.data_root).join("agent-logs");
    std::fs::create_dir_all(&log_root).map_err(|_| "RUNNER_AGENT_OUTPUT_CREATE_FAILED")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&log_root, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "RUNNER_AGENT_OUTPUT_CREATE_FAILED")?;
    }
    let output_path = log_root.join(format!("{}.stdout", command.command_id));
    let error_path = log_root.join(format!("{}.stderr", command.command_id));
    let stdout = std::fs::File::create(&output_path)
        .map_err(|_| "RUNNER_AGENT_OUTPUT_CREATE_FAILED".to_string())?;
    let stderr = std::fs::File::create(&error_path)
        .map_err(|_| "RUNNER_AGENT_ERROR_CREATE_FAILED".to_string())?;
    let mut process = Command::new(&spec.program);
    process
        .args(&spec.args)
        .current_dir(&spec.working_directory)
        // Provider credentials must come from the provider's approved local
        // profile, never from an inherited Web/Runner environment.
        .env_clear()
        .envs(spec.environment.iter().map(|(key, value)| (key, value)))
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    let child = process
        .spawn()
        .map_err(|_| "RUNNER_AGENT_PROCESS_SPAWN_FAILED".to_string())?;
    Ok(ExternalAgentProcess {
        child,
        output_path,
        error_path,
        started_at: now,
        // The server has already bounded the command deadline. The local cap
        // prevents a malformed or distant timestamp from creating an unbounded
        // process in the Runner.
        deadline: now + bounded_duration,
        candidate: spec224_candidate,
    })
}

fn ensure_claude_sandbox_available() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let path = std::env::var_os("PATH").unwrap_or_default();
        for required in ["bwrap", "socat"] {
            let found =
                std::env::split_paths(&path).any(|directory| directory.join(required).is_file());
            if !found {
                return Err("RUNNER_CLAUDE_SANDBOX_UNAVAILABLE".into());
            }
        }
    }
    Ok(())
}

impl ExternalAgentProcess {
    pub fn recovery_ref(&self) -> Option<String> {
        self.candidate
            .as_ref()
            .map(crate::spec224_candidate::Candidate::recovery_ref)
    }
    pub fn try_collect(&mut self, now: Instant) -> Result<Option<ExternalAgentResult>, String> {
        if now >= self.deadline {
            let _ = self.child.kill();
            let _ = self.child.wait();
            return Err(self.with_recovery_ref("RUNNER_AGENT_TIMEOUT"));
        }
        let Some(status) = self
            .child
            .try_wait()
            .map_err(|_| "RUNNER_AGENT_STATUS_FAILED".to_string())?
        else {
            return Ok(None);
        };
        let stdout = std::fs::read(&self.output_path).unwrap_or_default();
        let stderr = std::fs::read(&self.error_path).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(&stdout);
        hasher.update([0]);
        hasher.update(&stderr);
        hasher.update(status.code().unwrap_or(-1).to_le_bytes());
        let digest = format!("{:x}", hasher.finalize());
        let _ = std::fs::remove_file(&self.output_path);
        let _ = std::fs::remove_file(&self.error_path);
        let _elapsed = self.started_at.elapsed();
        if !status.success() {
            return Err(self.with_recovery_ref(&format!(
                "RUNNER_AGENT_EXITED_{}",
                status.code().unwrap_or(-1)
            )));
        }
        if let Some(candidate) = self.candidate.take() {
            let recovery_ref = candidate.recovery_ref();
            candidate
                .apply()
                .map_err(|error| format!("{error}:{recovery_ref}"))?;
        }
        Ok(Some(ExternalAgentResult {
            result_ref: format!("agent-result:sha256:{digest}"),
            evidence_ref: format!("agent-evidence:sha256:{digest}"),
            exit_code: status.code().unwrap_or(0),
        }))
    }

    pub fn cancel(&mut self) -> Result<(), String> {
        let recovery_ref = self.recovery_ref();
        self.child.kill().map_err(|_| {
            format!(
                "RUNNER_AGENT_CANCEL_FAILED:{}",
                recovery_ref.unwrap_or_default()
            )
        })?;
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.output_path);
        let _ = std::fs::remove_file(&self.error_path);
        Ok(())
    }

    fn with_recovery_ref(&self, error: &str) -> String {
        match &self.candidate {
            Some(candidate) => format!("{error}:{}", candidate.recovery_ref()),
            None => error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command(adapter_id: &str) -> RunnerJobCommand {
        RunnerJobCommand {
            command_id: "command-1".into(),
            command_type: "execute".into(),
            contract_version: "runner-job-v1".into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token: 1,
            tenant_id: "tenant-1".into(),
            user_id: Some(1),
            project_ref: None,
            workspace_ref: Some("workspace-1".into()),
            runner_id: "runner-1".into(),
            runner_session_id: "session-1".into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            execution_kind: "external_agent_task".into(),
            adapter_id: adapter_id.into(),
            adapter_version_constraint: Some("0.1.0".into()),
            browser_engine_constraint: None,
            idempotency_key: "agent:task-1:plan:plan-1:1".into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "grant-1".into(),
            input_ref: "input-1".into(),
            payload: serde_json::json!({"taskId": "task-1"}),
        }
    }

    #[test]
    fn provider_args_are_fixed_and_never_take_arbitrary_shell_input() {
        let args = fixed_provider_args(&command("codex.v1")).unwrap();
        assert_eq!(args[0], "exec");
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--sandbox", "workspace-write"]));
        assert!(args.iter().any(|value| value == "--skip-git-repo-check"));
        assert!(args.iter().any(|value| value.contains("task-1")));
        let claude = fixed_provider_args(&command("claude.v1")).unwrap();
        let settings = claude
            .iter()
            .find(|value| value.starts_with("{\"sandbox\""))
            .unwrap();
        assert!(settings.contains("\"allowUnsandboxedCommands\":false"));
        assert!(settings.contains("\"failIfUnavailable\":true"));
        assert!(fixed_provider_args(&command("shell.v1")).is_err());
    }
}
