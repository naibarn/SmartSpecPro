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
}

fn workspace_path(config: &RunnerConfig, reference: &str) -> Result<PathBuf, String> {
    let path = Path::new(reference);
    if reference.trim().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err("RUNNER_WORKSPACE_REFERENCE_INVALID".into());
    }
    let root = PathBuf::from(&config.data_root).join("workspaces");
    let workspace = root.join(path);
    if !workspace.is_dir() {
        return Err("RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".into());
    }
    Ok(workspace)
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
    let input_ref = &command.input_ref;
    let instruction = format!(
        "SmartAIHub task {task_id}. Read the governed task input reference {input_ref} from the approved workspace and make only the requested changes."
    );
    match command.adapter_id.as_str() {
        "codex.v1" => Ok(vec![
            "exec".into(),
            "--json".into(),
            "--full-auto".into(),
            "--".into(),
            instruction,
        ]),
        "claude.v1" => Ok(vec![
            "-p".into(),
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
    let workspace = workspace_path(
        config,
        command
            .workspace_ref
            .as_deref()
            .ok_or_else(|| "RUNNER_WORKSPACE_REFERENCE_REQUIRED".to_string())?,
    )?;
    let args = fixed_provider_args(command)?;
    let spec = build_process_spec(candidate, &workspace, &args)?;
    let bounded_duration = deadline_duration(&command.deadline)?;
    let output_path = workspace.join(format!(".smartaihub-{}.stdout", command.command_id));
    let error_path = workspace.join(format!(".smartaihub-{}.stderr", command.command_id));
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
    })
}

impl ExternalAgentProcess {
    pub fn try_collect(&mut self, now: Instant) -> Result<Option<ExternalAgentResult>, String> {
        if now >= self.deadline {
            let _ = self.child.kill();
            let _ = self.child.wait();
            return Err("RUNNER_AGENT_TIMEOUT".into());
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
            return Err(format!(
                "RUNNER_AGENT_EXITED_{}",
                status.code().unwrap_or(-1)
            ));
        }
        Ok(Some(ExternalAgentResult {
            result_ref: format!("agent-result:sha256:{digest}"),
            evidence_ref: format!("agent-evidence:sha256:{digest}"),
            exit_code: status.code().unwrap_or(0),
        }))
    }

    pub fn cancel(&mut self) -> Result<(), String> {
        self.child
            .kill()
            .map_err(|_| "RUNNER_AGENT_CANCEL_FAILED".to_string())?;
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.output_path);
        let _ = std::fs::remove_file(&self.error_path);
        Ok(())
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
        assert!(args.iter().any(|value| value.contains("task-1")));
        assert!(fixed_provider_args(&command("shell.v1")).is_err());
    }
}
