use crate::adapters::{build_process_spec, can_execute};
use crate::config::RunnerConfig;
use crate::discovery::ToolCandidate;
use crate::protocol::RunnerJobCommand;
use sha2::{Digest, Sha256};
use std::io::{Read, Seek, SeekFrom};
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
    child: Option<Child>,
    #[cfg(windows)]
    windows_job: crate::windows_process::WindowsProcessJob,
    #[cfg(target_os = "linux")]
    session_host: Option<crate::session_host::SessionHostClient>,
    output_path: PathBuf,
    error_path: PathBuf,
    adapter_id: String,
    output_offset: u64,
    pending_line: Vec<u8>,
    discard_until_newline: bool,
    harness_output_finalized: bool,
    started_at: Instant,
    deadline: Instant,
    candidate: Option<crate::spec224_candidate::Candidate>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinnedCodexModelSelection {
    adapter_id: String,
    policy: String,
    selected_model_id: Option<String>,
    resolved_model_id: String,
    reasoning_effort: String,
    catalog_revision: String,
    account_provider_fingerprint: Option<String>,
    capability_snapshot_revision: String,
}

fn pinned_codex_model_selection(
    command: &RunnerJobCommand,
) -> Result<Option<PinnedCodexModelSelection>, String> {
    pinned_model_selection(command, "codex.v1")
}

fn pinned_model_selection(
    command: &RunnerJobCommand,
    expected_adapter: &str,
) -> Result<Option<PinnedCodexModelSelection>, String> {
    let Some(value) = command.payload.get("spec224ModelSelection") else {
        return Ok(None);
    };
    let selection: PinnedCodexModelSelection = serde_json::from_value(value.clone())
        .map_err(|_| "RUNNER_MODEL_SELECTION_INVALID".to_string())?;
    if command.adapter_id != expected_adapter
        || selection.adapter_id != expected_adapter
        || !matches!(selection.policy.as_str(), "auto" | "explicit")
        || selection.resolved_model_id.trim().is_empty()
        || selection.resolved_model_id.len() > 160
        || selection.reasoning_effort.trim().is_empty()
        || selection.reasoning_effort.len() > 32
        || selection.account_provider_fingerprint.is_none()
        || selection.capability_snapshot_revision != command.capability_snapshot_revision
        || (selection.policy == "explicit"
            && selection.selected_model_id.as_deref() != Some(selection.resolved_model_id.as_str()))
        || (selection.policy == "auto" && selection.selected_model_id.is_some())
    {
        return Err("RUNNER_MODEL_SELECTION_INVALID".into());
    }
    Ok(Some(selection))
}

fn verify_live_copilot_model_selection(
    command: &RunnerJobCommand,
    candidate: &ToolCandidate,
) -> Result<PinnedCodexModelSelection, String> {
    let selection = pinned_model_selection(command, crate::copilot_harness::ADAPTER_ID)?
        .ok_or("RUNNER_MODEL_SELECTION_REQUIRED")?;
    let program = candidate
        .executable_path
        .as_deref()
        .ok_or("RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING")?;
    let catalog = crate::copilot_harness::refresh_model_catalog(program, Duration::from_secs(10))?;
    if selection.catalog_revision != catalog.revision
        || selection.account_provider_fingerprint.as_deref()
            != Some(catalog.account_provider_fingerprint.as_str())
    {
        return Err("RUNNER_MODEL_ACCOUNT_SCOPE_CHANGED".into());
    }
    let model = catalog
        .models
        .iter()
        .find(|model| model.id == selection.resolved_model_id)
        .ok_or("RUNNER_SELECTED_MODEL_UNAVAILABLE")?;
    if !model
        .reasoning_efforts
        .iter()
        .any(|effort| effort == &selection.reasoning_effort)
    {
        return Err("RUNNER_SELECTED_MODEL_REASONING_UNSUPPORTED".into());
    }
    Ok(selection)
}

fn verify_live_codex_model_selection(
    command: &RunnerJobCommand,
    candidate: &ToolCandidate,
) -> Result<Option<PinnedCodexModelSelection>, String> {
    let Some(selection) = pinned_codex_model_selection(command)? else {
        return Ok(None);
    };
    crate::adapters::verify_selected_model(
        candidate,
        &selection.resolved_model_id,
        &selection.reasoning_effort,
        selection
            .account_provider_fingerprint
            .as_deref()
            .unwrap_or_default(),
        Duration::from_secs(10),
    )
    .map_err(|error| {
        if error == "RUNNER_MODEL_ACCOUNT_SCOPE_CHANGED"
            || error == "RUNNER_SELECTED_MODEL_UNAVAILABLE"
            || error == "RUNNER_SELECTED_MODEL_REASONING_UNSUPPORTED"
        {
            error
        } else {
            "RUNNER_MODEL_CATALOG_REFRESH_FAILED".to_string()
        }
    })?;
    Ok(Some(selection))
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
    let instruction = fixed_provider_instruction(command)?;
    match command.adapter_id.as_str() {
        "codex.v1" => {
            let selection = pinned_codex_model_selection(command)?;
            let mut args = Vec::new();
            if let Some(selection) = selection.as_ref() {
                args.extend([
                    "-c".into(),
                    format!("model_reasoning_effort=\"{}\"", selection.reasoning_effort),
                ]);
            }
            args.push("exec".into());
            if let Some(selection) = selection {
                args.extend(["--model".into(), selection.resolved_model_id]);
            }
            args.extend([
                "--json".into(),
                "--sandbox".into(),
                "workspace-write".into(),
                "--ephemeral".into(),
                "--skip-git-repo-check".into(),
                "--".into(),
                instruction,
            ]);
            Ok(args)
        }
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

pub fn fixed_provider_instruction(command: &RunnerJobCommand) -> Result<String, String> {
    let task_id = command
        .payload
        .get("taskId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_AGENT_TASK_ID_REQUIRED".to_string())?;
    Ok(if command.input_ref.starts_with("spec224-input:") {
        let manifest = crate::run_input::manifest_relative_path(&command.input_ref);
        format!(
            "SmartAIHub task {task_id}. Read the verified governed task input manifest at {manifest} in the isolated candidate workspace and make only the requested source changes. Do not build, test, or launch the application; those actions are controlled separately by the user."
        )
    } else {
        format!(
            "SmartAIHub task {task_id}. Read the governed task input reference {} from the isolated candidate workspace and make only the requested source changes. Do not build, test, or launch the application; those actions are controlled separately by the user.",
            command.input_ref
        )
    })
}

fn agent_process_command(
    spec: &crate::process::ProcessSpec,
    stdout: std::fs::File,
    stderr: std::fs::File,
) -> Result<Command, String> {
    let mut process = crate::process::command_for_cli(&spec.program, &spec.args)?;
    process
        .current_dir(&spec.working_directory)
        // Provider credentials must come from the provider's approved local
        // profile, never from an inherited Web/Runner environment.
        .env_clear()
        .envs(spec.environment.iter().map(|(key, value)| (key, value)))
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(unix)]
    if spec.args.first().map(String::as_str) == Some("__sah-copilot-sdk-worker") {
        use std::os::unix::process::CommandExt;
        process.process_group(0);
    }
    Ok(process)
}

fn terminate_external_child(child: &mut Child, adapter_id: &str) -> Result<(), String> {
    #[cfg(unix)]
    if adapter_id == crate::copilot_harness::ADAPTER_ID {
        let group = -(child.id() as i32);
        // The worker starts the SDK-owned Copilot CLI in the same process
        // group so timeout/cancel reaps the complete provider process tree.
        let result = unsafe { libc::kill(group, libc::SIGKILL) };
        if result != 0 && child.try_wait().ok().flatten().is_none() {
            return Err("RUNNER_AGENT_CANCEL_FAILED".into());
        }
        let _ = child.wait();
        return Ok(());
    }
    child
        .kill()
        .map_err(|_| "RUNNER_AGENT_CANCEL_FAILED".to_string())?;
    let _ = child.wait();
    Ok(())
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
    if command.adapter_id == "codex.v1" {
        verify_live_codex_model_selection(command, candidate)?;
    }
    let spec = if command.adapter_id == crate::copilot_harness::ADAPTER_ID {
        let selection = verify_live_copilot_model_selection(command, candidate)?;
        let executable = candidate
            .executable_path
            .as_ref()
            .ok_or("RUNNER_ADAPTER_EXECUTABLE_PATH_MISSING")?;
        let prompt = fixed_provider_instruction(command)?;
        let capabilities = command
            .payload
            .get("requestedCapabilities")
            .and_then(serde_json::Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .filter(|value| {
                        matches!(
                            *value,
                            "workspace.read"
                                | "file.read"
                                | "read"
                                | "workspace.write"
                                | "file.write"
                                | "write"
                                | "shell.execute"
                                | "terminal.execute"
                                | "shell"
                                | "agent.external_task"
                        )
                    })
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let approval_bound = command
            .payload
            .get("approvalRef")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| !value.is_empty())
            && !command.authorization_grant_ref.is_empty();
        let mut hasher = Sha256::new();
        hasher.update(command.tenant_id.as_bytes());
        hasher.update([0]);
        hasher.update(command.job_id.as_bytes());
        hasher.update([0]);
        hasher.update(command.attempt.to_le_bytes());
        hasher.update([0]);
        hasher.update(command.idempotency_key.as_bytes());
        let session_id = format!("sah-{:x}", hasher.finalize());
        let profile = crate::copilot_harness::profile_directory()?;
        let mut spec = build_process_spec(candidate, &workspace, &[])?;
        spec.program = std::env::current_exe().map_err(|_| "RUNNER_EXECUTABLE_UNAVAILABLE")?;
        spec.args = vec![
            "__sah-copilot-sdk-worker".into(),
            executable.to_string_lossy().into_owned(),
            selection.resolved_model_id,
            prompt,
            serde_json::to_string(&capabilities).map_err(|_| "RUNNER_COPILOT_POLICY_INVALID")?,
            if approval_bound { "approved" } else { "denied" }.into(),
            session_id,
        ];
        spec.environment.push((
            "COPILOT_HOME".into(),
            profile.to_string_lossy().into_owned(),
        ));
        spec
    } else {
        let args = fixed_provider_args(command)?;
        if command.adapter_id == "claude.v1" {
            ensure_claude_sandbox_available()?;
        }
        build_process_spec(candidate, &workspace, &args)?
    };
    let bounded_duration = deadline_duration(&command.deadline)?;
    #[cfg(target_os = "linux")]
    if std::env::var("SMARTAIHUB_SPEC278_SESSION_HOST").as_deref() == Ok("true") {
        return start_in_session_host(
            config,
            command,
            spec224_candidate,
            spec,
            now,
            bounded_duration,
        );
    }
    let log_root = PathBuf::from(&config.data_root).join("agent-logs");
    std::fs::create_dir_all(&log_root).map_err(|_| "RUNNER_AGENT_OUTPUT_CREATE_FAILED")?;
    #[cfg(target_os = "linux")]
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
    let mut process = agent_process_command(&spec, stdout, stderr)?;
    #[cfg(windows)]
    let (child, windows_job) = crate::windows_process::WindowsProcessJob::spawn(&mut process)?;
    #[cfg(not(windows))]
    let child = process
        .spawn()
        .map_err(|_| "RUNNER_AGENT_PROCESS_SPAWN_FAILED".to_string())?;
    Ok(ExternalAgentProcess {
        child: Some(child),
        #[cfg(windows)]
        windows_job,
        #[cfg(target_os = "linux")]
        session_host: None,
        output_path,
        error_path,
        adapter_id: command.adapter_id.clone(),
        output_offset: 0,
        pending_line: Vec::new(),
        discard_until_newline: false,
        harness_output_finalized: false,
        started_at: now,
        // The server has already bounded the command deadline. The local cap
        // prevents a malformed or distant timestamp from creating an unbounded
        // process in the Runner.
        deadline: now + bounded_duration,
        candidate: spec224_candidate,
    })
}

#[cfg(target_os = "linux")]
pub(crate) fn reattach_session_host(
    config: &RunnerConfig,
    command: &RunnerJobCommand,
) -> Result<Option<ExternalAgentProcess>, String> {
    use crate::authority_grant::{ExecutionAuthorityGrant, ExpectedAuthority};
    use crate::session_contract::ExecutionSessionProjection;
    use crate::session_host::{SessionHostClient, SessionHostDescriptor};
    use std::collections::HashMap;

    if std::env::var("SMARTAIHUB_SPEC278_SESSION_HOST").as_deref() != Ok("true") {
        return Ok(None);
    }
    let session: ExecutionSessionProjection = serde_json::from_value(
        command
            .payload
            .get("executionSession")
            .cloned()
            .ok_or("RUNNER_SESSION_BINDING_REQUIRED")?,
    )
    .map_err(|_| "RUNNER_SESSION_BINDING_REQUIRED")?;
    let grant: ExecutionAuthorityGrant = serde_json::from_value(
        command
            .payload
            .get("executionAuthorityGrant")
            .cloned()
            .ok_or("RUNNER_AUTHORITY_GRANT_REQUIRED")?,
    )
    .map_err(|_| "RUNNER_AUTHORITY_GRANT_INVALID")?;
    let trusted: HashMap<String, String> = serde_json::from_str(
        &std::env::var("SAH_RUNNER_AUTHORITY_PUBLIC_KEYS_JSON")
            .map_err(|_| "RUNNER_AUTHORITY_TRUST_ROOT_UNAVAILABLE")?,
    )
    .map_err(|_| "RUNNER_AUTHORITY_TRUST_ROOT_INVALID")?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "RUNNER_AUTHORITY_CLOCK_INVALID")?
        .as_millis() as u64;
    let expected = ExpectedAuthority {
        worker_job_id: &command.job_id,
        session_id: &session.session_id,
        runner_id: &command.runner_id,
        session_generation: session.generation,
        minimum_authority_epoch: session.authority_epoch,
        minimum_placement_epoch: session.placement_epoch,
        minimum_job_control_revision: session.job_control_revision,
        allowed_effect_class: "external_agent_task",
        supported_safety_features: &["session_host_pty", "workspace_write_sandbox"],
    };
    let accepted = grant
        .verify(&trusted, &expected, now_ms)
        .map_err(str::to_string)?;
    let deadline = deadline_duration(&command.deadline)?;
    let ttl = accepted
        .remaining(now_ms, Instant::now())
        .map_err(str::to_string)?;
    let state = PathBuf::from(&config.data_root)
        .join("execution-sessions")
        .join(format!("{}-{}", session.session_id, session.generation));
    let descriptor = SessionHostDescriptor::load(&state)
        .or_else(|_| SessionHostDescriptor::load_for_terminal_receipt(&state))?;
    if descriptor.session_id != session.session_id
        || descriptor.session_generation != session.generation
    {
        return Err("RUNNER_SESSION_HOST_DESCRIPTOR_SCOPE_MISMATCH".into());
    }
    let registry =
        crate::session_registry::SessionRegistry::open(&PathBuf::from(&config.data_root))?;
    let registered = registry.inventory().iter().any(|manifest| {
        manifest.session_id == session.session_id
            && manifest.worker_job_id == command.job_id
            && manifest.worker_job_attempt == command.attempt
            && manifest.lease_fencing_version == command.fencing_token
            && manifest.runner_id == command.runner_id
            && manifest.session_generation == session.generation
            && manifest.authority_epoch == session.authority_epoch
            && manifest.placement_epoch == session.placement_epoch
            && manifest.job_control_revision == session.job_control_revision
            && descriptor
                .child_identity
                .as_ref()
                .is_some_and(|identity| manifest.process == *identity)
            && manifest.host_process == Some(descriptor.host_identity.clone())
    });
    if !registered {
        return Err("RUNNER_SESSION_REGISTRY_FENCE_MISMATCH".into());
    }
    let (client, host_running) = match SessionHostClient::attach(descriptor.clone()) {
        Ok(client) => match client.status() {
            Ok(status) => (client, status.status == "running"),
            Err(_) if client.read_terminal_receipt().is_ok() => (client, false),
            Err(_) => return Err("RUNNER_SESSION_HOST_STATUS_UNAVAILABLE".into()),
        },
        Err(_) => {
            let client = SessionHostClient::attach_for_terminal_receipt(descriptor)?;
            client.read_terminal_receipt()?;
            (client, false)
        }
    };
    if !host_running && client.read_terminal_receipt().is_err() {
        return Err("RUNNER_SESSION_HOST_TERMINAL_RECEIPT_UNAVAILABLE".into());
    }
    if host_running && ttl.is_zero() {
        if let Ok(status) = client.status() {
            let _ = client.terminate(
                status.command_sequence.saturating_add(1),
                "authority-expired",
            );
        }
        return Ok(None);
    }
    let candidate = if command.payload.get("spec224Execution").is_some() {
        match crate::spec224_candidate::Candidate::reattach_for_command(config, command) {
            Ok(candidate) => Some(candidate),
            Err(error) => {
                if host_running {
                    if let Ok(status) = client.status() {
                        let _ = client.terminate(
                            status.command_sequence.saturating_add(1),
                            "spec224-candidate-recovery-failed",
                        );
                    }
                    let _ = client.wait_for_exit(Duration::from_secs(2));
                }
                return Err(error);
            }
        }
    } else {
        None
    };
    Ok(Some(ExternalAgentProcess {
        child: None,
        session_host: Some(client),
        output_path: PathBuf::new(),
        error_path: PathBuf::new(),
        adapter_id: command.adapter_id.clone(),
        output_offset: 0,
        pending_line: Vec::new(),
        discard_until_newline: false,
        harness_output_finalized: false,
        started_at: Instant::now(),
        deadline: Instant::now() + deadline.min(ttl),
        candidate,
    }))
}

#[cfg(target_os = "linux")]
fn start_in_session_host(
    config: &RunnerConfig,
    command: &RunnerJobCommand,
    candidate: Option<crate::spec224_candidate::Candidate>,
    process: crate::process::ProcessSpec,
    now: Instant,
    deadline: Duration,
) -> Result<ExternalAgentProcess, String> {
    use crate::authority_grant::{ExecutionAuthorityGrant, ExpectedAuthority};
    use crate::session_contract::ExecutionSessionProjection;
    use crate::session_host::{
        launch_registered_with_authority, SessionHostClient, SessionHostRegistration,
    };
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;

    let session: ExecutionSessionProjection = serde_json::from_value(
        command
            .payload
            .get("executionSession")
            .cloned()
            .ok_or("RUNNER_SESSION_BINDING_REQUIRED")?,
    )
    .map_err(|_| "RUNNER_SESSION_BINDING_REQUIRED")?;
    let grant: ExecutionAuthorityGrant = serde_json::from_value(
        command
            .payload
            .get("executionAuthorityGrant")
            .cloned()
            .ok_or("RUNNER_AUTHORITY_GRANT_REQUIRED")?,
    )
    .map_err(|_| "RUNNER_AUTHORITY_GRANT_INVALID")?;
    let trusted: HashMap<String, String> = serde_json::from_str(
        &std::env::var("SAH_RUNNER_AUTHORITY_PUBLIC_KEYS_JSON")
            .map_err(|_| "RUNNER_AUTHORITY_TRUST_ROOT_UNAVAILABLE")?,
    )
    .map_err(|_| "RUNNER_AUTHORITY_TRUST_ROOT_INVALID")?;
    if trusted.is_empty() || trusted.len() > 16 {
        return Err("RUNNER_AUTHORITY_TRUST_ROOT_INVALID".into());
    }
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "RUNNER_AUTHORITY_CLOCK_INVALID")?
        .as_millis() as u64;
    let expected = ExpectedAuthority {
        worker_job_id: &command.job_id,
        session_id: &session.session_id,
        runner_id: &command.runner_id,
        session_generation: session.generation,
        minimum_authority_epoch: session.authority_epoch,
        minimum_placement_epoch: session.placement_epoch,
        minimum_job_control_revision: session.job_control_revision,
        allowed_effect_class: "external_agent_task",
        supported_safety_features: &["session_host_pty", "workspace_write_sandbox"],
    };
    let accepted = grant
        .verify(&trusted, &expected, now_ms)
        .map_err(str::to_string)?;
    let ttl = accepted
        .remaining(now_ms, Instant::now())
        .map_err(str::to_string)?;
    let executable = std::env::var_os("SAH_RUNNER_SESSION_HOST_BINARY")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(|p| p.join("smartaihub-session-host")))
        })
        .ok_or("RUNNER_SESSION_HOST_BINARY_UNAVAILABLE")?;
    let expected_hash = std::env::var("SAH_RUNNER_SESSION_HOST_SHA256")
        .map_err(|_| "RUNNER_SESSION_HOST_HASH_UNPINNED")?;
    if expected_hash.len() != 64
        || !expected_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || std::fs::symlink_metadata(&executable)
            .map_err(|_| "RUNNER_SESSION_HOST_BINARY_UNAVAILABLE")?
            .file_type()
            .is_symlink()
    {
        return Err("RUNNER_SESSION_HOST_BINARY_UNTRUSTED".into());
    }
    let mut file =
        std::fs::File::open(&executable).map_err(|_| "RUNNER_SESSION_HOST_BINARY_UNAVAILABLE")?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|_| "RUNNER_SESSION_HOST_BINARY_UNAVAILABLE")?;
    if format!("{:x}", hasher.finalize()) != expected_hash.to_ascii_lowercase() {
        return Err("RUNNER_SESSION_HOST_BINARY_HASH_MISMATCH".into());
    }
    let state = PathBuf::from(&config.data_root)
        .join("execution-sessions")
        .join(format!("{}-{}", session.session_id, session.generation));
    let registration = SessionHostRegistration {
        worker_job_id: command.job_id.clone(),
        worker_job_attempt: command.attempt,
        lease_fencing_version: command.fencing_token,
        runner_id: command.runner_id.clone(),
        authority_epoch: session.authority_epoch,
        placement_epoch: session.placement_epoch,
        job_control_revision: session.job_control_revision,
        driver_id: session.driver_id.clone(),
        continuity_class: serde_json::to_value(session.continuity)
            .ok()
            .and_then(|v| v.as_str().map(str::to_owned))
            .ok_or("RUNNER_SESSION_BINDING_INVALID")?,
        workspace_ref: command
            .workspace_ref
            .clone()
            .ok_or("RUNNER_WORKSPACE_REFERENCE_REQUIRED")?,
        session_host_version: crate::RUNNER_VERSION.into(),
    };
    let descriptor = launch_registered_with_authority(
        &executable,
        &state,
        &PathBuf::from(&config.data_root),
        &session.session_id,
        session.generation,
        &registration,
        &process,
        ttl,
    )?;
    let client = SessionHostClient::attach(descriptor)?;
    Ok(ExternalAgentProcess {
        child: None,
        session_host: Some(client),
        output_path: PathBuf::new(),
        error_path: PathBuf::new(),
        adapter_id: command.adapter_id.clone(),
        output_offset: 0,
        pending_line: Vec::new(),
        discard_until_newline: false,
        harness_output_finalized: false,
        started_at: now,
        deadline: now + deadline,
        candidate,
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

    /// Read newly appended harness JSONL, project only user-visible events,
    /// and keep an incomplete line bounded until its newline arrives.
    pub fn drain_harness_events(&mut self) -> Result<Vec<serde_json::Value>, String> {
        const MAX_READ_PER_POLL: usize = 256 * 1024;
        const MAX_PENDING_LINE: usize = 1024 * 1024;
        if self.harness_output_finalized {
            return Ok(Vec::new());
        }
        let mut appended = Vec::new();
        let mut terminal = false;
        #[cfg(target_os = "linux")]
        if let Some(host) = self.session_host.as_ref() {
            let terminal_receipt = host.read_terminal_receipt().ok();
            let (snapshot, start_offset) = if let Some(receipt) = terminal_receipt.as_ref() {
                terminal = true;
                host.read_terminal_output(receipt)?
            } else {
                let (snapshot, _truncated, start_offset) = host.read_output_window()?;
                (snapshot, start_offset)
            };
            let end_offset = start_offset.saturating_add(snapshot.len() as u64);
            if end_offset > self.output_offset {
                let local_offset = self.output_offset.saturating_sub(start_offset) as usize;
                let local_offset = local_offset.min(snapshot.len());
                appended.extend_from_slice(&snapshot[local_offset..]);
                if self.output_offset < start_offset {
                    // The session host uses a bounded tail. Record that some
                    // old output was unavailable; never replay the retained
                    // prefix as though it were newly emitted.
                    self.discard_until_newline = true;
                }
                self.output_offset = end_offset;
            }
        } else {
            read_appended_file(
                &self.output_path,
                &mut self.output_offset,
                MAX_READ_PER_POLL,
                &mut appended,
            )?;
            let child_exited = self
                .child
                .as_mut()
                .and_then(|child| child.try_wait().ok().flatten())
                .is_some();
            terminal = child_exited
                && std::fs::metadata(&self.output_path)
                    .map(|metadata| self.output_offset >= metadata.len())
                    .unwrap_or(true);
        }
        #[cfg(not(target_os = "linux"))]
        {
            read_appended_file(
                &self.output_path,
                &mut self.output_offset,
                MAX_READ_PER_POLL,
                &mut appended,
            )?;
            let child_exited = self
                .child
                .as_mut()
                .and_then(|child| child.try_wait().ok().flatten())
                .is_some();
            terminal = child_exited
                && std::fs::metadata(&self.output_path)
                    .map(|metadata| self.output_offset >= metadata.len())
                    .unwrap_or(true);
        }

        let mut events = Vec::new();
        for byte in appended {
            if byte == b'\n' {
                if !self.discard_until_newline && !self.pending_line.is_empty() {
                    events.extend(crate::harness_output::project_harness_json_line(
                        &self.adapter_id,
                        &self.pending_line,
                    ));
                }
                self.pending_line.clear();
                self.discard_until_newline = false;
            } else if !self.discard_until_newline {
                if self.pending_line.len() >= MAX_PENDING_LINE {
                    self.pending_line.clear();
                    self.discard_until_newline = true;
                } else {
                    self.pending_line.push(byte);
                }
            }
        }
        if terminal {
            if !self.discard_until_newline && !self.pending_line.is_empty() {
                events.extend(crate::harness_output::project_harness_json_line(
                    &self.adapter_id,
                    &self.pending_line,
                ));
            }
            self.pending_line.clear();
            self.harness_output_finalized = true;
        }
        Ok(events)
    }

    pub fn try_collect(&mut self, now: Instant) -> Result<Option<ExternalAgentResult>, String> {
        if now >= self.deadline {
            #[cfg(target_os = "linux")]
            if let Some(host) = self.session_host.as_ref() {
                if let Ok(status) = host.status() {
                    let _ = host.terminate(status.command_sequence + 1, "command-deadline");
                }
            } else if let Some(child) = self.child.as_mut() {
                let _ = terminate_external_child(child, &self.adapter_id);
            }
            #[cfg(windows)]
            self.windows_job
                .terminate()
                .map_err(|error| self.with_recovery_ref(&error))?;
            #[cfg(not(target_os = "linux"))]
            if let Some(child) = self.child.as_mut() {
                let _ = terminate_external_child(child, &self.adapter_id);
            }
            return Err(self.with_recovery_ref("RUNNER_AGENT_TIMEOUT"));
        }
        #[cfg(target_os = "linux")]
        if let Some(host) = self.session_host.as_ref() {
            match host.status() {
                Ok(status) if status.status == "running" => return Ok(None),
                Ok(_) => {}
                Err(_) => {
                    // A completed Host exits after persisting its terminal receipt.
                    // Its death is expected here; the receipt is the durable result.
                }
            }
            let receipt = host
                .read_terminal_receipt()
                .map_err(|_| "RUNNER_AGENT_TERMINAL_RECEIPT_UNAVAILABLE".to_string())?;
            if self.harness_output_finalized {
                let _ = host.clear_terminal_output();
            }
            if receipt.exit_code != 0 {
                return Err(
                    self.with_recovery_ref(&format!("RUNNER_AGENT_EXITED_{}", receipt.exit_code))
                );
            }
            if let Some(candidate) = self.candidate.take() {
                let recovery_ref = candidate.recovery_ref();
                candidate
                    .apply()
                    .map_err(|error| format!("{error}:{recovery_ref}"))?;
            }
            return Ok(Some(ExternalAgentResult {
                result_ref: format!("agent-result:sha256:{}", receipt.output_sha256),
                evidence_ref: format!("agent-evidence:sha256:{}", receipt.output_sha256),
                exit_code: receipt.exit_code,
            }));
        }
        let child = self.child.as_mut().ok_or("RUNNER_AGENT_STATUS_FAILED")?;
        let Some(status) = child
            .try_wait()
            .map_err(|_| "RUNNER_AGENT_STATUS_FAILED".to_string())?
        else {
            return Ok(None);
        };
        #[cfg(windows)]
        self.windows_job
            .terminate()
            .map_err(|error| self.with_recovery_ref(&error))?;
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
        #[cfg(target_os = "linux")]
        if let Some(host) = self.session_host.as_ref() {
            let sequence = host
                .status()
                .map_err(|_| "RUNNER_AGENT_CANCEL_FAILED")?
                .command_sequence;
            host.terminate(sequence + 1, "runner-cancel")?;
            if let Some(candidate) = self.candidate.as_ref() {
                candidate.mark_lifecycle("CANCELLED");
            }
            return Ok(());
        }
        #[cfg(windows)]
        self.windows_job.terminate()?;
        let child = self.child.as_mut().ok_or("RUNNER_AGENT_CANCEL_FAILED")?;
        if child
            .try_wait()
            .map_err(|_| "RUNNER_AGENT_CANCEL_FAILED")?
            .is_none()
        {
            terminate_external_child(child, &self.adapter_id).map_err(|_| {
                format!(
                    "RUNNER_AGENT_CANCEL_FAILED:{}",
                    recovery_ref.unwrap_or_default()
                )
            })?;
        }
        let _ = std::fs::remove_file(&self.output_path);
        let _ = std::fs::remove_file(&self.error_path);
        if let Some(candidate) = self.candidate.as_ref() {
            candidate.mark_lifecycle("CANCELLED");
        }
        Ok(())
    }

    fn with_recovery_ref(&self, error: &str) -> String {
        match &self.candidate {
            Some(candidate) => {
                candidate.mark_lifecycle("RECOVERY_REQUIRED");
                format!("{error}:{}", candidate.recovery_ref())
            }
            None => error.to_string(),
        }
    }
}

fn read_appended_file(
    path: &Path,
    offset: &mut u64,
    max_bytes: usize,
    output: &mut Vec<u8>,
) -> Result<(), String> {
    let Ok(mut file) = std::fs::File::open(path) else {
        return Ok(());
    };
    file.seek(SeekFrom::Start(*offset))
        .map_err(|_| "RUNNER_AGENT_OUTPUT_READ_FAILED")?;
    let mut buffer = vec![0; max_bytes];
    let read = file
        .read(&mut buffer)
        .map_err(|_| "RUNNER_AGENT_OUTPUT_READ_FAILED")?;
    output.extend_from_slice(&buffer[..read]);
    *offset = offset.saturating_add(read as u64);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn completed_short_harness_output_is_drained_including_final_partial_line() {
        let directory = tempfile::tempdir().expect("temporary output directory");
        let output_path = directory.path().join("harness.jsonl");
        std::fs::write(
            &output_path,
            br#"{"type":"item.completed","item":{"type":"agent_message","text":"short run done"}}"#,
        )
        .expect("write completed harness output");
        let mut child = Command::new("/bin/true")
            .spawn()
            .expect("spawn short-lived process");
        let _ = child.wait().expect("wait for short-lived process");
        let now = Instant::now();
        let mut process = ExternalAgentProcess {
            child: Some(child),
            session_host: None,
            output_path,
            error_path: directory.path().join("harness.stderr"),
            adapter_id: "codex.v1".into(),
            output_offset: 0,
            pending_line: Vec::new(),
            discard_until_newline: false,
            harness_output_finalized: false,
            started_at: now,
            deadline: now + Duration::from_secs(5),
            candidate: None,
        };

        let events = process
            .drain_harness_events()
            .expect("drain completed output");
        assert!(events.iter().any(|event| {
            event["kind"] == "assistant_message" && event["text"] == "short run done"
        }));
        assert!(process.harness_output_finalized);
    }

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

    #[cfg(windows)]
    #[test]
    fn windows_external_agent_uses_cli_shim_and_preserves_spaced_workspace() {
        let root = tempfile::tempdir().unwrap();
        let workspace = root.path().join("owned workspace");
        std::fs::create_dir(&workspace).unwrap();
        let shim = root.path().join("codex.cmd");
        std::fs::write(&shim, "@echo off\r\necho CODEX_SHIM_TEST_ONLY\r\n").unwrap();
        let spec = crate::process::ProcessSpec {
            program: shim.canonicalize().unwrap(),
            args: fixed_provider_args(&command("codex.v1")).unwrap(),
            working_directory: workspace.clone(),
            environment: ["SystemRoot", "PATH", "TEMP", "TMP"]
                .iter()
                .filter_map(|key| std::env::var(key).ok().map(|v| ((*key).into(), v)))
                .collect(),
        };
        let output_path = root.path().join("stdout");
        let mut launch = agent_process_command(
            &spec,
            std::fs::File::create(&output_path).unwrap(),
            std::fs::File::create(root.path().join("stderr")).unwrap(),
        )
        .unwrap();
        let (mut child, job) =
            crate::windows_process::WindowsProcessJob::spawn(&mut launch).unwrap();
        assert!(child.wait().unwrap().success());
        job.terminate().unwrap();
        assert!(std::fs::read_to_string(output_path)
            .unwrap()
            .contains("CODEX_SHIM_TEST_ONLY"));
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

    #[test]
    fn codex_launch_pins_model_and_reasoning_without_global_config_changes() {
        let mut command = command("codex.v1");
        command.payload["spec224ModelSelection"] = serde_json::json!({
            "adapterId": "codex.v1",
            "policy": "explicit",
            "selectedModelId": "gpt-6.1-terra",
            "resolvedModelId": "gpt-6.1-terra",
            "reasoningEffort": "high",
            "catalogRevision": "catalog:sha256:abcdef",
            "accountProviderFingerprint": "codex-account:sha256:abcdef",
            "capabilityProfile": ["text"],
            "cliVersion": "codex-cli 0.165.0",
            "capabilitySnapshotRevision": "revision-1"
        });
        let args = fixed_provider_args(&command).unwrap();
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-c", "model_reasoning_effort=\"high\""]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--model", "gpt-6.1-terra"]));
        assert!(!args.iter().any(|arg| arg.contains("config.toml")));
    }

    #[test]
    fn codex_launch_rejects_unscoped_or_mismatched_model_selection() {
        let mut command = command("codex.v1");
        command.payload["spec224ModelSelection"] = serde_json::json!({
            "adapterId": "claude.v1",
            "policy": "explicit",
            "selectedModelId": "model-a",
            "resolvedModelId": "model-a",
            "reasoningEffort": "high",
            "accountProviderFingerprint": "codex-account:sha256:abcdef",
            "capabilitySnapshotRevision": "revision-1"
        });
        assert_eq!(
            fixed_provider_args(&command).unwrap_err(),
            "RUNNER_MODEL_SELECTION_INVALID"
        );
        command.payload["spec224ModelSelection"]["adapterId"] = serde_json::json!("codex.v1");
        command.payload["spec224ModelSelection"]["accountProviderFingerprint"] =
            serde_json::Value::Null;
        assert_eq!(
            fixed_provider_args(&command).unwrap_err(),
            "RUNNER_MODEL_SELECTION_INVALID"
        );
    }
}
