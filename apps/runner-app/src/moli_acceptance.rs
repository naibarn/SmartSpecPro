//! Explicitly test-authorized Moli launch used only by the SPEC-208 rootless
//! Linux acceptance unit. This capability is excluded from default builds.

use crate::control_channel::{ControlChannel, RunnerExecutionBinding};
use crate::leasing::Lease;
use crate::protocol::{NodeKind, RunnerJobCommand, RunnerJobReceipt, RunnerJobReceiptEventType};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const AUTHORITY: &str = "spec208-rootless-acceptance-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartRequest {
    command: RunnerJobCommand,
    lease: Lease,
    expected_lease: Lease,
    binding: RunnerExecutionBinding,
    runtime_digest: String,
    expected_moli_sha256: String,
    moli_path: PathBuf,
    profile_path: PathBuf,
    port: u16,
}

pub fn run_cli(_config: &crate::config::RunnerConfig) -> Result<(), String> {
    if std::env::var("SPEC208_TEST_AUTHORITY").ok().as_deref() != Some(AUTHORITY) {
        return Err("SPEC208_TEST_AUTHORITY_REQUIRED".into());
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let first_line = receiver
        .recv()
        .map_err(|_| "SPEC208_START_REQUEST_REQUIRED")?
        .map_err(|_| "SPEC208_START_REQUEST_READ_FAILED")?;
    let request: StartRequest =
        serde_json::from_str(&first_line).map_err(|_| "SPEC208_START_REQUEST_INVALID")?;
    validate_start(&request)?;

    let mut channel = ControlChannel::default();
    channel.connect();
    channel.authenticated();
    channel.bind_execution(request.binding.clone());
    channel.accept_job_command(&request.command, &now_iso())?;
    request.lease.validate(now_ms(), &request.expected_lease)?;
    if request.lease.job_id != request.command.job_id
        || request.lease.attempt_id != request.command.attempt.to_string()
        || request.lease.lease_id != request.command.lease_id
        || request.lease.fencing_version != request.command.fencing_token
    {
        return Err("RUNNER_LEASE_COMMAND_BINDING_MISMATCH".into());
    }

    std::fs::create_dir(&request.profile_path).map_err(|_| "RUNNER_MOLI_PROFILE_CREATE_FAILED")?;
    let mut child = match launch_moli(&request) {
        Ok(child) => child,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&request.profile_path);
            return Err(error);
        }
    };
    write_json(&json!({
        "event":"started", "jobId":request.command.job_id,
        "attempt":request.command.attempt, "fencingToken":request.command.fencing_token,
        "pid":child.id(), "port":request.port, "runtimeDigest":request.runtime_digest,
    }))?;

    let action_deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
    let mut crash_status = None;
    let (terminal_kind, terminal) = loop {
        if now_ms() >= request.lease.expires_at_ms {
            break (
                "lease_expired",
                json!({"type":"revoke","reason":"lease_expired"}),
            );
        }
        if now_iso() >= request.command.deadline {
            break (
                "deadline_expired",
                json!({"type":"revoke","reason":"deadline_expired"}),
            );
        }
        if std::time::Instant::now() >= action_deadline {
            break (
                "runtime_timeout",
                json!({"type":"revoke","reason":"runtime_timeout"}),
            );
        }
        match receiver.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(Ok(action)) => match serde_json::from_str::<Value>(&action) {
                Ok(value) => {
                    let kind = match value.get("type").and_then(Value::as_str) {
                        Some("complete") => Some("complete"),
                        Some("cancel") => Some("cancel"),
                        Some("revoke") => Some("revoke"),
                        _ => None,
                    };
                    if let Some(kind) = kind {
                        break (kind, value);
                    }
                    break (
                        "invalid_action",
                        json!({"type":"revoke","reason":"invalid_action"}),
                    );
                }
                Err(_) => {
                    break (
                        "invalid_action",
                        json!({"type":"revoke","reason":"invalid_action"}),
                    )
                }
            },
            Ok(Err(_)) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                break (
                    "input_closed",
                    json!({"type":"revoke","reason":"input_closed"}),
                );
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(Some(status)) = child.try_wait() {
                    use std::os::unix::process::ExitStatusExt;
                    crash_status = Some((status.code(), status.signal()));
                    break (
                        "process_crashed",
                        json!({"type":"revoke","reason":"process_crashed"}),
                    );
                }
            }
        }
    };
    let result = terminal.get("result").cloned();
    let cleanup_status = terminate(&mut child)?;
    let (exit_code, signal) = crash_status.unwrap_or(cleanup_status);
    cleanup(&request.profile_path)?;
    let receipt = RunnerJobReceipt {
        event_id: format!(
            "spec208:{}:{}:{}",
            request.command.job_id, request.command.attempt, request.command.command_id
        ),
        event_type: if terminal_kind == "complete" {
            RunnerJobReceiptEventType::ExecutionCompleted
        } else if matches!(terminal_kind, "cancel" | "revoke") {
            RunnerJobReceiptEventType::CancelAcknowledged
        } else {
            RunnerJobReceiptEventType::ExecutionFailed
        },
        command_id: request.command.command_id.clone(),
        job_id: request.command.job_id.clone(),
        runner_id: request.command.runner_id.clone(),
        runner_session_id: request.command.runner_session_id.clone(),
        sequence: 1,
        observed_at: now_iso(),
        status: if terminal_kind == "complete" {
            "completed"
        } else if matches!(terminal_kind, "cancel" | "revoke") {
            "cancelled"
        } else {
            "failed"
        }
        .into(),
        result_ref: None,
        evidence_refs: None,
        error_code: None,
        error_summary: None,
        correlation: Some(
            json!({"attempt":request.command.attempt,"fencingToken":request.command.fencing_token,"leaseId":request.command.lease_id}),
        ),
        payload: Some(
            json!({"terminalAction":terminal_kind,"pid":child.id(),"exitCode":exit_code,"signal":signal,"profileRemoved":!request.profile_path.exists(),"runtimeDigest":request.runtime_digest,"result":result}),
        ),
    };
    let envelope = channel.build_receipt(NodeKind::ManagedContainer, &request.command, receipt)?;
    write_json(
        &json!({"event":"cleaned","pid":child.id(),"exitCode":exit_code,"signal":signal,"profileRemoved":!request.profile_path.exists(),"receipt":envelope}),
    )
}

fn validate_start(request: &StartRequest) -> Result<(), String> {
    request.command.validate()?;
    if request.command.execution_kind != "computer_use.moli.acceptance"
        || request.command.adapter_id != "moli.acceptance.v1"
        || request
            .command
            .payload
            .get("nonProductionTestAuthority")
            .and_then(Value::as_str)
            != Some(AUTHORITY)
        || request
            .command
            .payload
            .get("runtimeDigest")
            .and_then(Value::as_str)
            != Some(request.runtime_digest.as_str())
    {
        return Err("SPEC208_ACCEPTANCE_AUTHORITY_INVALID".into());
    }
    if std::env::var("SPEC208_RUNTIME_IMAGE_DIGEST")
        .ok()
        .as_deref()
        != Some(request.runtime_digest.as_str())
        || !request.runtime_digest.starts_with("sha256:")
        || request.runtime_digest.len() != 71
        || !request.runtime_digest[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("SPEC208_RUNTIME_DIGEST_MISMATCH".into());
    }
    if request.port == 0 || !request.moli_path.is_absolute() {
        return Err("SPEC208_RUNTIME_PATH_INVALID".into());
    }
    let mut profile_components = request.profile_path.components();
    let profile_is_scoped = matches!(
        profile_components.next(),
        Some(std::path::Component::RootDir)
    ) && matches!(profile_components.next(), Some(std::path::Component::Normal(name)) if name == "profile")
        && matches!(profile_components.next(), Some(std::path::Component::Normal(name)) if name.to_str().is_some_and(|name| name.len() == 64 && name.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())))
        && profile_components.next().is_none();
    if !profile_is_scoped {
        return Err("SPEC208_PROFILE_SCOPE_INVALID".into());
    }
    #[cfg(unix)]
    {
        if unsafe { libc::geteuid() } == 0 {
            return Err("SPEC208_NON_ROOT_REQUIRED".into());
        }
        if request
            .profile_path
            .parent()
            .is_none_or(|parent| !parent.is_dir())
        {
            return Err("SPEC208_PROFILE_ROOT_REQUIRED".into());
        }
    }
    let metadata =
        std::fs::symlink_metadata(&request.moli_path).map_err(|_| "RUNNER_MOLI_PROGRAM_INVALID")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        if metadata.uid() != unsafe { libc::geteuid() }
            || metadata.permissions().mode() & 0o222 != 0
            || metadata.permissions().mode() & 0o111 == 0
        {
            return Err("RUNNER_MOLI_ARTIFACT_PERMISSIONS_INVALID".into());
        }
    }
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("RUNNER_MOLI_PROGRAM_INVALID".into());
    }
    let bytes =
        std::fs::read(&request.moli_path).map_err(|_| "RUNNER_MOLI_ARTIFACT_READ_FAILED")?;
    let digest = format!("{:x}", Sha256::digest(bytes));
    if digest != request.expected_moli_sha256 {
        return Err("RUNNER_MOLI_ARTIFACT_DIGEST_MISMATCH".into());
    }
    Ok(())
}

fn launch_moli(request: &StartRequest) -> Result<Child, String> {
    let args = [
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        &request.port.to_string(),
        "--timeout",
        "8",
        "--profile-dir",
        request
            .profile_path
            .to_str()
            .ok_or("RUNNER_MOLI_PROFILE_PATH_INVALID")?,
        "--http-proxy",
        "http://127.0.0.1:18080",
        "--block-private-networks",
        "--log-level",
        "error",
    ];
    let mut command = Command::new(&request.moli_path);
    command
        .args(args)
        .current_dir(&request.profile_path)
        .env_clear()
        .env("PATH", "/usr/bin")
        .env("HOME", &request.profile_path)
        .env("TMPDIR", "/tmp")
        .env("XDG_CACHE_HOME", request.profile_path.join("cache"))
        .env("XDG_CONFIG_HOME", request.profile_path.join("config"))
        .env("XDG_DATA_HOME", request.profile_path.join("data"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .spawn()
        .map_err(|_| "RUNNER_MOLI_START_FAILED".into())
}

fn terminate(child: &mut Child) -> Result<(Option<i32>, Option<i32>), String> {
    use std::os::unix::process::ExitStatusExt;
    let group = -(child.id() as i32);
    #[cfg(unix)]
    unsafe {
        let result = libc::kill(group, libc::SIGTERM);
        if result != 0 && io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
            return Err("RUNNER_MOLI_PROCESS_TERMINATE_FAILED".into());
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(250));
    #[cfg(unix)]
    unsafe {
        let result = libc::kill(group, libc::SIGKILL);
        if result != 0 && io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
            return Err("RUNNER_MOLI_PROCESS_TERMINATE_FAILED".into());
        }
    }
    let status = child.wait().ok();
    Ok((
        status.as_ref().and_then(|s| s.code()),
        status.and_then(|s| s.signal()),
    ))
}

fn cleanup(profile: &Path) -> Result<(), String> {
    std::fs::remove_dir_all(profile).map_err(|_| "RUNNER_MOLI_PROFILE_CLEANUP_FAILED".into())
}
fn write_json(value: &Value) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, value).map_err(|_| "SPEC208_OUTPUT_FAILED")?;
    stdout
        .write_all(b"\n")
        .and_then(|_| stdout.flush())
        .map_err(|_| "SPEC208_OUTPUT_FAILED".into())
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn now_iso() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let days = (duration.as_secs() / 86_400) as i64;
    let seconds = duration.as_secs() % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds / 3600,
        (seconds % 3600) / 60,
        seconds % 60,
        duration.subsec_millis()
    )
}
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
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
    (year + i64::from(month <= 2), month, day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::BufReader;
    use std::os::unix::process::CommandExt;

    #[test]
    fn termination_kills_descendants_after_moli_leader_exits() {
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", "sleep 60 >/dev/null 2>&1 & echo $!"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        command.process_group(0);
        let mut child = command.spawn().expect("spawn test process group");
        let mut line = String::new();
        BufReader::new(child.stdout.take().expect("captured stdout"))
            .read_line(&mut line)
            .expect("read descendant pid");
        let descendant: libc::pid_t = line.trim().parse().expect("numeric descendant pid");
        assert!(child.wait().expect("leader exits").success());
        assert_eq!(unsafe { libc::kill(descendant, 0) }, 0);

        terminate(&mut child).expect("terminate process group");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while std::time::Instant::now() < deadline && unsafe { libc::kill(descendant, 0) } == 0 {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert_eq!(unsafe { libc::kill(descendant, 0) }, -1);
        assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH));
    }
}
