//! Linux local Session Host. The host is a separate process, owns the child
//! process and keeps bounded output available while Worker clients reconnect.
//! It does not own canonical job completion or lease renewal.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::process::ProcessSpec;
use crate::session_registry::capture_process_identity;

const MAX_IPC_LINE_BYTES: usize = 1024 * 1024;
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_DEDUPE_RECEIPTS: usize = 256;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionHostDescriptor {
    pub session_id: String,
    pub session_generation: u64,
    pub socket_path: PathBuf,
    pub auth_token: String,
    pub host_pid: u32,
    pub child_pid: u32,
    pub host_identity: crate::session_registry::LocalProcessIdentity,
    pub child_identity: Option<crate::session_registry::LocalProcessIdentity>,
}

impl SessionHostDescriptor {
    pub fn persist(&self, state_directory: &Path) -> Result<(), String> {
        validate_identity(&self.session_id, self.session_generation)?;
        if self.auth_token.len() != 64
            || !self.auth_token.bytes().all(|byte| byte.is_ascii_hexdigit())
            || self.host_pid == 0
            || self.child_pid == 0
            || self.host_identity.pid != self.host_pid
            || self
                .child_identity
                .as_ref()
                .is_none_or(|identity| identity.pid != self.child_pid)
            || self.socket_path.parent() != Some(state_directory)
            || self
                .socket_path
                .file_name()
                .is_none_or(|name| name != "session-host.sock")
        {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        secure_directory(state_directory)?;
        let path = state_directory.join("host-attach.json");
        if fs::symlink_metadata(&path).is_ok() {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_EXISTS".into());
        }
        let encoded =
            serde_json::to_vec(self).map_err(|_| "RUNNER_SESSION_HOST_DESCRIPTOR_INVALID")?;
        write_atomic_private(&path, &encoded)
    }

    pub fn load(state_directory: &Path) -> Result<Self, String> {
        Self::load_inner(state_directory, true)
    }

    /// Load only the protected descriptor metadata after the Host has exited.
    /// Callers must additionally match it to the durable Runner registry before
    /// trusting its terminal receipt.
    pub fn load_for_terminal_receipt(state_directory: &Path) -> Result<Self, String> {
        Self::load_inner(state_directory, false)
    }

    fn load_inner(state_directory: &Path, verify_processes: bool) -> Result<Self, String> {
        let root = fs::canonicalize(state_directory)
            .map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID")?;
        let descriptor_path = root.join("host-attach.json");
        let metadata = fs::symlink_metadata(&descriptor_path)
            .map_err(|_| "RUNNER_SESSION_HOST_DESCRIPTOR_UNAVAILABLE")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 16 * 1024 {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_PERMISSIONS_INVALID".into());
        }
        let mut options = OpenOptions::new();
        options
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
        let file = options
            .open(&descriptor_path)
            .map_err(|_| "RUNNER_SESSION_HOST_DESCRIPTOR_UNAVAILABLE")?;
        let mut encoded = Vec::new();
        file.take(16 * 1024 + 1)
            .read_to_end(&mut encoded)
            .map_err(|_| "RUNNER_SESSION_HOST_DESCRIPTOR_UNAVAILABLE")?;
        if encoded.len() > 16 * 1024 {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        let descriptor: Self = serde_json::from_slice(&encoded)
            .map_err(|_| "RUNNER_SESSION_HOST_DESCRIPTOR_INVALID")?;
        validate_identity(&descriptor.session_id, descriptor.session_generation)?;
        if descriptor.auth_token.len() != 64
            || !descriptor
                .auth_token
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            || descriptor.host_pid == 0
            || descriptor.child_pid == 0
            || descriptor.socket_path.parent() != Some(root.as_path())
            || descriptor
                .socket_path
                .file_name()
                .is_none_or(|name| name != "session-host.sock")
        {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        if descriptor.host_identity.pid != descriptor.host_pid
            || descriptor
                .child_identity
                .as_ref()
                .is_none_or(|identity| identity.pid != descriptor.child_pid)
        {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        if verify_processes {
            crate::session_registry::verify_process_identity(&descriptor.host_identity)?;
            crate::session_registry::verify_process_identity(
                descriptor.child_identity.as_ref().expect("checked above"),
            )?;
        }
        Ok(descriptor)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "operation")]
enum HostRequest {
    Status,
    ReadOutput,
    WriteInput {
        sequence: u64,
        idempotency_key: String,
        data_base64: String,
    },
    Terminate {
        sequence: u64,
        idempotency_key: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IpcEnvelope {
    session_id: String,
    session_generation: u64,
    auth_token: String,
    request: HostRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub status: String,
    pub child_pid: u32,
    pub exit_code: Option<i32>,
    pub output_base64: Option<String>,
    pub output_truncated: bool,
    pub command_sequence: u64,
    pub receipt: Option<CommandReceipt>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandReceipt {
    pub sequence: u64,
    pub idempotency_key: String,
    pub result: String,
    pub payload_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionHostTerminalReceipt {
    pub session_id: String,
    pub session_generation: u64,
    pub process_identity: Option<crate::session_registry::LocalProcessIdentity>,
    pub exit_code: i32,
    pub termination_reason: String,
    pub finished_at_unix_ms: u128,
    pub final_command_sequence: u64,
    pub output_sha256: String,
    pub output_truncated: bool,
}

#[derive(Default)]
struct OutputState {
    bytes: VecDeque<u8>,
    truncated: bool,
    digest: Sha256,
}

struct CommandState {
    sequence: u64,
    receipts: VecDeque<CommandReceipt>,
    terminate_requested: bool,
    terminate_at: Option<Instant>,
    force_kill_sent: bool,
    authority_expired: bool,
}

/// Start a standalone host executable. Configuration is sent over stdin so
/// command arguments, environment values, and the IPC token do not appear in
/// the host process argument list.
#[cfg(target_os = "linux")]
pub fn launch(
    host_executable: &Path,
    state_directory: &Path,
    session_id: &str,
    session_generation: u64,
    process: &ProcessSpec,
) -> Result<SessionHostDescriptor, String> {
    launch_with_authority_ttl(
        host_executable,
        state_directory,
        session_id,
        session_generation,
        process,
        None,
    )
}

#[cfg(target_os = "linux")]
pub fn launch_with_authority_ttl(
    host_executable: &Path,
    state_directory: &Path,
    session_id: &str,
    session_generation: u64,
    process: &ProcessSpec,
    authority_ttl: Option<Duration>,
) -> Result<SessionHostDescriptor, String> {
    validate_identity(session_id, session_generation)?;
    process.validate()?;
    if authority_ttl.is_some_and(|ttl| ttl.is_zero() || ttl > Duration::from_secs(900)) {
        return Err("RUNNER_SESSION_HOST_AUTHORITY_TTL_INVALID".into());
    }
    secure_directory(state_directory)?;
    let state_directory = fs::canonicalize(state_directory)
        .map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID")?;
    let socket_path = state_directory.join("session-host.sock");
    if socket_path.as_os_str().len() > 100 {
        return Err("RUNNER_SESSION_HOST_SOCKET_PATH_TOO_LONG".into());
    }
    if fs::symlink_metadata(&socket_path).is_ok() {
        return Err("RUNNER_SESSION_HOST_SOCKET_ALREADY_EXISTS".into());
    }
    let auth_token = random_token()?;
    let request = HostLaunch {
        session_id: session_id.to_owned(),
        session_generation,
        socket_path: socket_path.clone(),
        state_directory: state_directory.clone(),
        auth_token: auth_token.clone(),
        process: process.clone(),
        authority_ttl_ms: authority_ttl.map(|ttl| ttl.as_millis() as u64),
    };
    let mut child = Command::new(host_executable)
        .arg("run")
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|_| "RUNNER_SESSION_HOST_LAUNCH_FAILED")?;
    let host_pid = child.id();
    let mut stdin = child
        .stdin
        .take()
        .ok_or("RUNNER_SESSION_HOST_LAUNCH_FAILED")?;
    serde_json::to_writer(&mut stdin, &request).map_err(|_| "RUNNER_SESSION_HOST_LAUNCH_FAILED")?;
    stdin
        .flush()
        .map_err(|_| "RUNNER_SESSION_HOST_LAUNCH_FAILED")?;
    drop(stdin);

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        if UnixStream::connect(&socket_path).is_ok() {
            let descriptor = SessionHostDescriptor {
                session_id: session_id.to_owned(),
                session_generation,
                socket_path,
                auth_token,
                host_pid,
                child_pid: 0,
                host_identity: capture_process_identity(host_pid)?,
                child_identity: None,
            };
            let status = SessionHostClient::attach_unverified(descriptor.clone()).status()?;
            let descriptor = SessionHostDescriptor {
                child_pid: status.child_pid,
                child_identity: Some(capture_process_identity(status.child_pid)?),
                ..descriptor
            };
            if let Err(error) = descriptor.persist(&state_directory) {
                let _ = SessionHostClient::attach(descriptor.clone())
                    .and_then(|client| client.terminate(1, "abort-launch"));
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                return Err(error);
            }
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return Ok(descriptor);
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "RUNNER_SESSION_HOST_LAUNCH_FAILED")?
        {
            return Err(if status.success() {
                "RUNNER_SESSION_HOST_EXITED_BEFORE_READY"
            } else {
                "RUNNER_SESSION_HOST_START_FAILED"
            }
            .into());
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("RUNNER_SESSION_HOST_READY_TIMEOUT".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Launches the independent Host, verifies both process identities, then
/// commits their shared session and canonical job fence to the Runner registry.
/// A registry failure terminates the just-created Host so it cannot become an
/// undiscoverable execution process.
#[cfg(target_os = "linux")]
pub fn launch_registered(
    host_executable: &Path,
    state_directory: &Path,
    registry_root: &Path,
    session_id: &str,
    session_generation: u64,
    registration: &SessionHostRegistration,
    process: &ProcessSpec,
) -> Result<SessionHostDescriptor, String> {
    launch_registered_inner(
        host_executable,
        state_directory,
        registry_root,
        session_id,
        session_generation,
        registration,
        process,
        None,
    )
}

#[cfg(target_os = "linux")]
pub fn launch_registered_with_authority(
    host_executable: &Path,
    state_directory: &Path,
    registry_root: &Path,
    session_id: &str,
    session_generation: u64,
    registration: &SessionHostRegistration,
    process: &ProcessSpec,
    authority_ttl: Duration,
) -> Result<SessionHostDescriptor, String> {
    if authority_ttl.is_zero() {
        return Err("RUNNER_SESSION_HOST_AUTHORITY_TTL_INVALID".into());
    }
    launch_registered_inner(
        host_executable,
        state_directory,
        registry_root,
        session_id,
        session_generation,
        registration,
        process,
        Some(authority_ttl),
    )
}

#[cfg(target_os = "linux")]
fn launch_registered_inner(
    host_executable: &Path,
    state_directory: &Path,
    registry_root: &Path,
    session_id: &str,
    session_generation: u64,
    registration: &SessionHostRegistration,
    process: &ProcessSpec,
    authority_ttl: Option<Duration>,
) -> Result<SessionHostDescriptor, String> {
    validate_session_host_registration(session_id, session_generation, registration)?;
    let descriptor = launch_with_authority_ttl(
        host_executable,
        state_directory,
        session_id,
        session_generation,
        process,
        authority_ttl,
    )?;
    let registration_result = (|| {
        let status = SessionHostClient::attach(descriptor.clone())?.status()?;
        let child_identity = descriptor
            .child_identity
            .clone()
            .ok_or("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID")?;
        let manifest = crate::session_registry::LocalSessionManifest {
            schema_version: crate::session_registry::SESSION_REGISTRY_SCHEMA_VERSION,
            session_id: session_id.to_owned(),
            worker_job_id: registration.worker_job_id.clone(),
            worker_job_attempt: registration.worker_job_attempt,
            lease_fencing_version: registration.lease_fencing_version,
            runner_id: registration.runner_id.clone(),
            session_generation,
            authority_epoch: registration.authority_epoch,
            placement_epoch: registration.placement_epoch,
            job_control_revision: registration.job_control_revision,
            driver_id: registration.driver_id.clone(),
            continuity_class: registration.continuity_class.clone(),
            session_host_version: registration.session_host_version.clone(),
            process: child_identity,
            host_process: Some(descriptor.host_identity.clone()),
            workspace_ref: registration.workspace_ref.clone(),
            command_sequence: status.command_sequence,
            event_sequence: 0,
            last_state: "running".into(),
        };
        let mut registry = crate::session_registry::SessionRegistry::open(registry_root)?;
        registry.upsert(manifest)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = registration_result {
        if let Ok(client) = SessionHostClient::attach(descriptor.clone()) {
            let _ = client.terminate(1, "registry-registration-failed");
            let _ = client.wait_for_exit(Duration::from_secs(2));
        }
        if let Some(root) = descriptor.socket_path.parent() {
            let _ = fs::remove_file(root.join("host-attach.json"));
        }
        return Err(error);
    }
    Ok(descriptor)
}

fn validate_session_host_registration(
    session_id: &str,
    session_generation: u64,
    registration: &SessionHostRegistration,
) -> Result<(), String> {
    const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    let valid_uuid = |value: &str| {
        let bytes = value.as_bytes();
        bytes.len() == 36
            && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
            && bytes
                .iter()
                .enumerate()
                .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
            && matches!(bytes[14].to_ascii_lowercase(), b'1'..=b'8')
            && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
    };
    let valid_session_id = !session_id.is_empty()
        && session_id.len() <= 160
        && session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'));
    let revisions = [
        session_generation,
        registration.lease_fencing_version,
        registration.authority_epoch,
        registration.placement_epoch,
        registration.job_control_revision,
    ];
    let valid_continuity = matches!(
        registration.continuity_class.as_str(),
        "process_persistent" | "reattachable" | "checkpointable" | "reconstructable" | "ephemeral"
    );
    if !valid_session_id
        || session_generation == 0
        || !valid_uuid(&registration.worker_job_id)
        || registration.worker_job_attempt == 0
        || registration.worker_job_attempt as u64 > MAX_SAFE_INTEGER
        || revisions.iter().any(|value| *value > MAX_SAFE_INTEGER)
        || registration.job_control_revision == 0
        || registration.runner_id.trim().is_empty()
        || registration.runner_id.len() > 160
        || registration.driver_id.trim().is_empty()
        || registration.driver_id.len() > 128
        || !valid_continuity
        || registration.workspace_ref.is_empty()
        || registration.workspace_ref.len() > 160
        || !registration
            .workspace_ref
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
        || registration.workspace_ref == "."
        || registration.workspace_ref == ".."
        || registration.session_host_version.trim().is_empty()
        || registration.session_host_version.len() > 64
    {
        return Err("RUNNER_SESSION_REGISTRATION_INVALID".into());
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn launch(
    _host_executable: &Path,
    _state_directory: &Path,
    _session_id: &str,
    _session_generation: u64,
    _process: &ProcessSpec,
) -> Result<SessionHostDescriptor, String> {
    Err("RUNNER_SESSION_HOST_PLATFORM_UNSUPPORTED".into())
}

pub struct SessionHostClient {
    descriptor: SessionHostDescriptor,
}

#[derive(Debug, Clone)]
pub struct SessionHostRegistration {
    pub worker_job_id: String,
    pub worker_job_attempt: u32,
    pub lease_fencing_version: u64,
    pub runner_id: String,
    pub authority_epoch: u64,
    pub placement_epoch: u64,
    pub job_control_revision: u64,
    pub driver_id: String,
    pub continuity_class: String,
    pub workspace_ref: String,
    pub session_host_version: String,
}

impl SessionHostClient {
    pub fn attach(descriptor: SessionHostDescriptor) -> Result<Self, String> {
        if descriptor.host_identity.pid != descriptor.host_pid
            || descriptor
                .child_identity
                .as_ref()
                .is_none_or(|identity| identity.pid != descriptor.child_pid)
        {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        crate::session_registry::verify_process_identity(&descriptor.host_identity)?;
        crate::session_registry::verify_process_identity(
            descriptor.child_identity.as_ref().expect("checked above"),
        )?;
        Ok(Self { descriptor })
    }

    pub fn attach_for_terminal_receipt(descriptor: SessionHostDescriptor) -> Result<Self, String> {
        if descriptor.host_identity.pid != descriptor.host_pid
            || descriptor
                .child_identity
                .as_ref()
                .is_none_or(|identity| identity.pid != descriptor.child_pid)
        {
            return Err("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID".into());
        }
        Ok(Self { descriptor })
    }

    fn attach_unverified(descriptor: SessionHostDescriptor) -> Self {
        Self { descriptor }
    }

    pub fn status(&self) -> Result<HostResponse, String> {
        self.call(HostRequest::Status)
    }

    pub fn wait_for_exit(&self, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        loop {
            match crate::session_registry::verify_process_identity(&self.descriptor.host_identity) {
                Ok(()) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(()) => return Err("RUNNER_SESSION_HOST_EXIT_TIMEOUT".into()),
                Err(error)
                    if error == "RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH"
                        || error == "RUNNER_SESSION_PROCESS_IDENTITY_UNAVAILABLE" =>
                {
                    return Ok(())
                }
                Err(error) => return Err(error),
            }
        }
    }

    pub fn read_output(&self) -> Result<(Vec<u8>, bool), String> {
        let response = self.call(HostRequest::ReadOutput)?;
        let encoded = response
            .output_base64
            .ok_or_else(|| "RUNNER_SESSION_HOST_RESPONSE_INVALID".to_string())?;
        let output = BASE64
            .decode(encoded)
            .map_err(|_| "RUNNER_SESSION_HOST_RESPONSE_INVALID")?;
        Ok((output, response.output_truncated))
    }

    pub fn read_terminal_receipt(&self) -> Result<SessionHostTerminalReceipt, String> {
        let directory = self
            .descriptor
            .socket_path
            .parent()
            .ok_or("RUNNER_SESSION_HOST_DESCRIPTOR_INVALID")?;
        let path = directory.join("terminal-receipt.json");
        let metadata =
            fs::symlink_metadata(&path).map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_UNAVAILABLE")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 16 * 1024 {
            return Err("RUNNER_SESSION_HOST_RECEIPT_INVALID".into());
        }
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("RUNNER_SESSION_HOST_RECEIPT_PERMISSIONS_INVALID".into());
        }
        let mut options = OpenOptions::new();
        options
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
        let file = options
            .open(&path)
            .map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_UNAVAILABLE")?;
        let mut bytes = Vec::new();
        file.take(16 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_UNAVAILABLE")?;
        if bytes.len() > 16 * 1024 {
            return Err("RUNNER_SESSION_HOST_RECEIPT_INVALID".into());
        }
        let receipt: SessionHostTerminalReceipt =
            serde_json::from_slice(&bytes).map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_INVALID")?;
        if receipt.session_id != self.descriptor.session_id
            || receipt.session_generation != self.descriptor.session_generation
            || receipt.process_identity != self.descriptor.child_identity
            || receipt.output_sha256.len() != 64
            || !receipt
                .output_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("RUNNER_SESSION_HOST_RECEIPT_SCOPE_MISMATCH".into());
        }
        Ok(receipt)
    }

    pub fn write_input(
        &self,
        sequence: u64,
        idempotency_key: &str,
        data: &[u8],
    ) -> Result<HostResponse, String> {
        if data.len() > MAX_INPUT_BYTES {
            return Err("RUNNER_SESSION_HOST_INPUT_TOO_LARGE".into());
        }
        self.call(HostRequest::WriteInput {
            sequence,
            idempotency_key: idempotency_key.to_owned(),
            data_base64: BASE64.encode(data),
        })
    }

    pub fn terminate(&self, sequence: u64, idempotency_key: &str) -> Result<HostResponse, String> {
        self.call(HostRequest::Terminate {
            sequence,
            idempotency_key: idempotency_key.to_owned(),
        })
    }

    fn call(&self, request: HostRequest) -> Result<HostResponse, String> {
        let mut stream = UnixStream::connect(&self.descriptor.socket_path)
            .map_err(|_| "RUNNER_SESSION_HOST_UNAVAILABLE")?;
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .map_err(|_| "RUNNER_SESSION_HOST_UNAVAILABLE")?;
        let envelope = IpcEnvelope {
            session_id: self.descriptor.session_id.clone(),
            session_generation: self.descriptor.session_generation,
            auth_token: self.descriptor.auth_token.clone(),
            request,
        };
        serde_json::to_writer(&mut stream, &envelope)
            .map_err(|_| "RUNNER_SESSION_HOST_REQUEST_INVALID")?;
        stream
            .write_all(b"\n")
            .map_err(|_| "RUNNER_SESSION_HOST_UNAVAILABLE")?;
        stream
            .shutdown(std::net::Shutdown::Write)
            .map_err(|_| "RUNNER_SESSION_HOST_UNAVAILABLE")?;
        let reader = BufReader::new(stream);
        let mut line = String::new();
        reader
            .take(MAX_IPC_LINE_BYTES as u64)
            .read_line(&mut line)
            .map_err(|_| "RUNNER_SESSION_HOST_UNAVAILABLE")?;
        serde_json::from_str(&line).map_err(|_| "RUNNER_SESSION_HOST_RESPONSE_INVALID".into())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostLaunch {
    session_id: String,
    session_generation: u64,
    socket_path: PathBuf,
    state_directory: PathBuf,
    auth_token: String,
    process: ProcessSpec,
    #[serde(default)]
    authority_ttl_ms: Option<u64>,
}

impl Serialize for ProcessSpec {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct Wire<'a> {
            program: &'a Path,
            args: &'a [String],
            working_directory: &'a Path,
            environment: &'a [(String, String)],
        }
        Wire {
            program: &self.program,
            args: &self.args,
            working_directory: &self.working_directory,
            environment: &self.environment,
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ProcessSpec {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Wire {
            program: PathBuf,
            args: Vec<String>,
            working_directory: PathBuf,
            environment: Vec<(String, String)>,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            program: wire.program,
            args: wire.args,
            working_directory: wire.working_directory,
            environment: wire.environment,
        })
    }
}

impl Serialize for HostLaunch {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Wire<'a> {
            session_id: &'a str,
            session_generation: u64,
            socket_path: &'a Path,
            state_directory: &'a Path,
            auth_token: &'a str,
            process: &'a ProcessSpec,
            authority_ttl_ms: Option<u64>,
        }
        Wire {
            session_id: &self.session_id,
            session_generation: self.session_generation,
            socket_path: &self.socket_path,
            state_directory: &self.state_directory,
            auth_token: &self.auth_token,
            process: &self.process,
            authority_ttl_ms: self.authority_ttl_ms,
        }
        .serialize(serializer)
    }
}

/// Entrypoint for the separate `smartaihub-session-host` binary.
pub fn run_host() -> Result<(), String> {
    let stdin = std::io::stdin();
    let launch: HostLaunch =
        serde_json::from_reader(stdin.lock()).map_err(|_| "RUNNER_SESSION_HOST_CONFIG_INVALID")?;
    validate_identity(&launch.session_id, launch.session_generation)?;
    if launch.auth_token.len() != 64
        || !launch
            .auth_token
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || launch.socket_path.parent() != Some(launch.state_directory.as_path())
        || launch
            .socket_path
            .file_name()
            .is_none_or(|name| name != "session-host.sock")
    {
        return Err("RUNNER_SESSION_HOST_CONFIG_INVALID".into());
    }
    secure_directory(&launch.state_directory)?;
    launch.process.validate()?;
    run_server(launch)
}

fn run_server(launch: HostLaunch) -> Result<(), String> {
    if launch
        .authority_ttl_ms
        .is_some_and(|ttl| ttl == 0 || ttl > 900_000)
    {
        return Err("RUNNER_SESSION_HOST_AUTHORITY_TTL_INVALID".into());
    }
    let authority_deadline_boottime_ms = launch
        .authority_ttl_ms
        .map(|ttl| {
            boottime_millis().and_then(|now| {
                now.checked_add(ttl)
                    .ok_or("RUNNER_SESSION_HOST_CLOCK_UNAVAILABLE".into())
            })
        })
        .transpose()?;
    let listener = UnixListener::bind(&launch.socket_path)
        .map_err(|_| "RUNNER_SESSION_HOST_SOCKET_BIND_FAILED")?;
    let _socket_cleanup = SocketPathCleanup(launch.socket_path.clone());
    fs::set_permissions(&launch.socket_path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "RUNNER_SESSION_HOST_SOCKET_PERMISSIONS_FAILED")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "RUNNER_SESSION_HOST_SOCKET_FAILED")?;

    let (pty_master, pty_slave) = open_pty()?;
    let child_input = pty_slave
        .try_clone()
        .map_err(|_| "RUNNER_SESSION_HOST_PTY_UNAVAILABLE")?;
    let child_output = pty_slave
        .try_clone()
        .map_err(|_| "RUNNER_SESSION_HOST_PTY_UNAVAILABLE")?;
    let master_writer = pty_master
        .try_clone()
        .map_err(|_| "RUNNER_SESSION_HOST_PTY_UNAVAILABLE")?;
    let slave_fd = pty_slave.as_raw_fd();
    let mut command = Command::new(&launch.process.program);
    command
        .args(&launch.process.args)
        .current_dir(&launch.process.working_directory)
        .envs(
            launch
                .process
                .environment
                .iter()
                .map(|(key, value)| (key, value)),
        )
        .stdin(Stdio::from(child_input))
        .stdout(Stdio::from(child_output))
        .stderr(Stdio::from(pty_slave));
    // SAFETY: this child is a single-use exec. setsid and TIOCSCTTY are called
    // in the async-signal-safe pre-exec hook, and the PTY slave remains open
    // until spawn has completed.
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() < 0 || libc::ioctl(slave_fd, libc::TIOCSCTTY, 0) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command
        .spawn()
        .map_err(|_| "RUNNER_SESSION_HOST_CHILD_START_FAILED")?;
    drop(command);
    let child_pid = child.id();
    let process_identity = capture_process_identity(child_pid).ok();
    let child_stdin = Mutex::new(master_writer);
    let output = Arc::new(Mutex::new(OutputState::default()));
    let output_reader = spawn_output_reader(pty_master, Arc::clone(&output));

    let mut command_state = CommandState {
        sequence: 0,
        receipts: VecDeque::new(),
        terminate_requested: false,
        terminate_at: None,
        force_kill_sent: false,
        authority_expired: false,
    };
    loop {
        if let Some(deadline) = authority_deadline_boottime_ms {
            if boottime_millis()? >= deadline && !command_state.terminate_requested {
                let group = -(child_pid as libc::pid_t);
                let sent = unsafe { libc::kill(group, libc::SIGTERM) };
                if sent != 0 && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
                {
                    return Err("RUNNER_SESSION_HOST_TERMINATE_FAILED".into());
                }
                command_state.terminate_requested = true;
                command_state.authority_expired = true;
                command_state.terminate_at = Some(Instant::now());
            }
        }
        if let Some(exit) = child
            .try_wait()
            .map_err(|_| "RUNNER_SESSION_HOST_CHILD_STATUS_FAILED")?
        {
            let _ = output_reader.join();
            write_terminal_receipt(
                &launch,
                process_identity,
                exit.code().unwrap_or(-1),
                if command_state.authority_expired {
                    "authority_expired"
                } else if command_state.force_kill_sent {
                    "force_kill"
                } else if command_state.terminate_requested {
                    "graceful"
                } else {
                    "exited"
                },
                command_state.sequence,
                &output,
            )?;
            let _ = fs::remove_file(&launch.socket_path);
            File::open(&launch.state_directory)
                .and_then(|directory| directory.sync_all())
                .map_err(|_| "RUNNER_SESSION_HOST_SOCKET_FAILED")?;
            return Ok(());
        }
        if !command_state.force_kill_sent
            && command_state
                .terminate_at
                .is_some_and(|at| at.elapsed() >= Duration::from_millis(500))
        {
            let group = -(child_pid as libc::pid_t);
            let sent = unsafe { libc::kill(group, libc::SIGKILL) };
            if sent != 0 && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
                return Err("RUNNER_SESSION_HOST_TERMINATE_FAILED".into());
            }
            command_state.force_kill_sent = true;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = handle_connection(
                    stream,
                    &launch,
                    child_pid,
                    &mut child,
                    &child_stdin,
                    &output,
                    &mut command_state,
                );
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return Err("RUNNER_SESSION_HOST_SOCKET_FAILED".into()),
        }
    }
}

fn boottime_millis() -> Result<u64, String> {
    let mut now: libc::timespec = unsafe { std::mem::zeroed() };
    if unsafe { libc::clock_gettime(libc::CLOCK_BOOTTIME, &mut now) } != 0 {
        return Err("RUNNER_SESSION_HOST_CLOCK_UNAVAILABLE".into());
    }
    let millis = (now.tv_sec as u64)
        .checked_mul(1_000)
        .and_then(|value| value.checked_add(now.tv_nsec as u64 / 1_000_000))
        .ok_or_else(|| "RUNNER_SESSION_HOST_CLOCK_UNAVAILABLE".to_string())?;
    Ok(millis)
}

struct SocketPathCleanup(PathBuf);

impl Drop for SocketPathCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn spawn_output_reader<R: Read + Send + 'static>(
    mut reader: R,
    output: Arc<Mutex<OutputState>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            let read = match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => read,
            };
            if let Ok(mut state) = output.lock() {
                state.digest.update(&buffer[..read]);
                for byte in &buffer[..read] {
                    state.bytes.push_back(*byte);
                }
                while state.bytes.len() > MAX_OUTPUT_BYTES {
                    state.bytes.pop_front();
                    state.truncated = true;
                }
            }
        }
    })
}

fn open_pty() -> Result<(File, File), String> {
    let master_fd = unsafe { libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY | libc::O_CLOEXEC) };
    if master_fd < 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    let master = unsafe { File::from_raw_fd(master_fd) };
    if unsafe { libc::grantpt(master_fd) } != 0 || unsafe { libc::unlockpt(master_fd) } != 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    let mut name = [0i8; 256];
    if unsafe { libc::ptsname_r(master_fd, name.as_mut_ptr(), name.len()) } != 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    let slave_fd = unsafe {
        libc::open(
            name.as_ptr(),
            libc::O_RDWR | libc::O_NOCTTY | libc::O_CLOEXEC,
        )
    };
    if slave_fd < 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    let slave = unsafe { File::from_raw_fd(slave_fd) };
    let mut attributes = unsafe { std::mem::zeroed::<libc::termios>() };
    if unsafe { libc::tcgetattr(slave_fd, &mut attributes) } != 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    attributes.c_lflag &= !(libc::ICANON | libc::ECHO);
    attributes.c_cc[libc::VMIN] = 1;
    attributes.c_cc[libc::VTIME] = 0;
    if unsafe { libc::tcsetattr(slave_fd, libc::TCSANOW, &attributes) } != 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    let size = libc::winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    if unsafe { libc::ioctl(slave_fd, libc::TIOCSWINSZ, &size) } != 0 {
        return Err("RUNNER_SESSION_HOST_PTY_UNAVAILABLE".into());
    }
    Ok((master, slave))
}

#[allow(clippy::too_many_arguments)]
fn handle_connection(
    mut stream: UnixStream,
    launch: &HostLaunch,
    child_pid: u32,
    child: &mut Child,
    child_stdin: &Mutex<File>,
    output: &Arc<Mutex<OutputState>>,
    command_state: &mut CommandState,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|_| "RUNNER_SESSION_HOST_IPC_FAILED")?;
    let mut line = String::new();
    BufReader::new(
        stream
            .try_clone()
            .map_err(|_| "RUNNER_SESSION_HOST_IPC_FAILED")?,
    )
    .take(MAX_IPC_LINE_BYTES as u64)
    .read_line(&mut line)
    .map_err(|_| "RUNNER_SESSION_HOST_IPC_FAILED")?;
    let response = match serde_json::from_str::<IpcEnvelope>(&line) {
        Ok(envelope) => process_request(
            envelope,
            launch,
            child_pid,
            child,
            child_stdin,
            output,
            command_state,
        ),
        Err(_) => error_response(
            "RUNNER_SESSION_HOST_REQUEST_INVALID",
            child_pid,
            command_state,
        ),
    };
    serde_json::to_writer(&mut stream, &response).map_err(|_| "RUNNER_SESSION_HOST_IPC_FAILED")?;
    stream
        .write_all(b"\n")
        .map_err(|_| "RUNNER_SESSION_HOST_IPC_FAILED".to_string())
}

#[allow(clippy::too_many_arguments)]
fn process_request(
    envelope: IpcEnvelope,
    launch: &HostLaunch,
    child_pid: u32,
    child: &mut Child,
    child_stdin: &Mutex<File>,
    output: &Arc<Mutex<OutputState>>,
    command_state: &mut CommandState,
) -> HostResponse {
    if envelope.session_id != launch.session_id
        || envelope.session_generation != launch.session_generation
        || !constant_time_eq(envelope.auth_token.as_bytes(), launch.auth_token.as_bytes())
    {
        return error_response("RUNNER_SESSION_HOST_AUTH_FAILED", child_pid, command_state);
    }
    let exit_code = child
        .try_wait()
        .ok()
        .flatten()
        .map(|status| status.code().unwrap_or(-1));
    match envelope.request {
        HostRequest::Status => HostResponse {
            ok: true,
            error: None,
            status: if exit_code.is_some() {
                "exited"
            } else {
                "running"
            }
            .into(),
            child_pid,
            exit_code,
            output_base64: None,
            output_truncated: output.lock().map(|state| state.truncated).unwrap_or(true),
            command_sequence: command_state.sequence,
            receipt: None,
        },
        HostRequest::ReadOutput => {
            let snapshot = output.lock();
            match snapshot {
                Ok(state) => HostResponse {
                    ok: true,
                    error: None,
                    status: if exit_code.is_some() {
                        "exited"
                    } else {
                        "running"
                    }
                    .into(),
                    child_pid,
                    exit_code,
                    output_base64: Some(
                        BASE64.encode(state.bytes.iter().copied().collect::<Vec<_>>()),
                    ),
                    output_truncated: state.truncated,
                    command_sequence: command_state.sequence,
                    receipt: None,
                },
                Err(_) => error_response(
                    "RUNNER_SESSION_HOST_STATE_UNAVAILABLE",
                    child_pid,
                    command_state,
                ),
            }
        }
        HostRequest::WriteInput {
            sequence,
            idempotency_key,
            data_base64,
        } => {
            let data = match BASE64.decode(data_base64) {
                Ok(data) if data.len() <= MAX_INPUT_BYTES => data,
                _ => {
                    return error_response(
                        "RUNNER_SESSION_HOST_INPUT_INVALID",
                        child_pid,
                        command_state,
                    )
                }
            };
            execute_command(
                sequence,
                idempotency_key,
                "write",
                &sha256_hex(&data),
                child_pid,
                command_state,
                || {
                    if exit_code.is_some() {
                        return Err("RUNNER_SESSION_HOST_CHILD_EXITED");
                    }
                    child_stdin
                        .lock()
                        .map_err(|_| "RUNNER_SESSION_HOST_STDIN_UNAVAILABLE")?
                        .write_all(&data)
                        .map_err(|_| "RUNNER_SESSION_HOST_STDIN_WRITE_FAILED")
                },
            )
        }
        HostRequest::Terminate {
            sequence,
            idempotency_key,
        } => {
            let response = execute_command(
                sequence,
                idempotency_key,
                "terminate",
                &sha256_hex(b""),
                child_pid,
                command_state,
                || {
                    if exit_code.is_none() {
                        let group = -(child_pid as libc::pid_t);
                        let sent = unsafe { libc::kill(group, libc::SIGTERM) };
                        if sent != 0
                            && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
                        {
                            return Err("RUNNER_SESSION_HOST_TERMINATE_FAILED");
                        }
                    }
                    Ok(())
                },
            );
            if response.ok {
                command_state.terminate_requested = true;
                command_state.terminate_at.get_or_insert_with(Instant::now);
            }
            response
        }
    }
}

fn execute_command<F>(
    sequence: u64,
    idempotency_key: String,
    result: &str,
    payload_sha256: &str,
    child_pid: u32,
    state: &mut CommandState,
    operation: F,
) -> HostResponse
where
    F: FnOnce() -> Result<(), &'static str>,
{
    if idempotency_key.trim().is_empty() || idempotency_key.len() > 200 {
        return error_response("RUNNER_SESSION_HOST_COMMAND_ID_INVALID", child_pid, state);
    }
    if let Some(receipt) = state
        .receipts
        .iter()
        .find(|receipt| receipt.idempotency_key == idempotency_key)
    {
        return if receipt.sequence == sequence
            && receipt.result == result
            && receipt.payload_sha256 == payload_sha256
        {
            success_response(child_pid, state, Some(receipt.clone()))
        } else {
            error_response("RUNNER_SESSION_HOST_IDEMPOTENCY_CONFLICT", child_pid, state)
        };
    }
    if sequence != state.sequence.saturating_add(1) {
        return error_response(
            "RUNNER_SESSION_HOST_COMMAND_SEQUENCE_INVALID",
            child_pid,
            state,
        );
    }
    if let Err(error) = operation() {
        return error_response(error, child_pid, state);
    }
    state.sequence = sequence;
    let receipt = CommandReceipt {
        sequence,
        idempotency_key,
        result: result.into(),
        payload_sha256: payload_sha256.into(),
    };
    state.receipts.push_back(receipt.clone());
    while state.receipts.len() > MAX_DEDUPE_RECEIPTS {
        state.receipts.pop_front();
    }
    success_response(child_pid, state, Some(receipt))
}

fn success_response(
    pid: u32,
    state: &CommandState,
    receipt: Option<CommandReceipt>,
) -> HostResponse {
    HostResponse {
        ok: true,
        error: None,
        status: "running".into(),
        child_pid: pid,
        exit_code: None,
        output_base64: None,
        output_truncated: false,
        command_sequence: state.sequence,
        receipt,
    }
}

fn error_response(error: &str, pid: u32, state: &CommandState) -> HostResponse {
    HostResponse {
        ok: false,
        error: Some(error.into()),
        status: "unknown".into(),
        child_pid: pid,
        exit_code: None,
        output_base64: None,
        output_truncated: false,
        command_sequence: state.sequence,
        receipt: None,
    }
}

fn write_terminal_receipt(
    launch: &HostLaunch,
    process_identity: Option<crate::session_registry::LocalProcessIdentity>,
    exit_code: i32,
    termination_reason: &str,
    command_sequence: u64,
    output: &Arc<Mutex<OutputState>>,
) -> Result<(), String> {
    let (output_sha256, output_truncated) = {
        let state = output
            .lock()
            .map_err(|_| "RUNNER_SESSION_HOST_STATE_UNAVAILABLE")?;
        (
            format!("{:x}", state.digest.clone().finalize()),
            state.truncated,
        )
    };
    let receipt = SessionHostTerminalReceipt {
        session_id: launch.session_id.clone(),
        session_generation: launch.session_generation,
        process_identity,
        exit_code,
        termination_reason: termination_reason.into(),
        finished_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        final_command_sequence: command_sequence,
        output_sha256,
        output_truncated,
    };
    let path = launch.state_directory.join("terminal-receipt.json");
    let encoded =
        serde_json::to_vec(&receipt).map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_INVALID")?;
    write_atomic_private(&path, &encoded)
}

fn write_atomic_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let nonce = random_token()?;
    let mut name = std::ffi::OsString::from(".");
    name.push(format!("{nonce}.tmp"));
    let temp = path.with_file_name(name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(&temp)
        .map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_WRITE_FAILED")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_WRITE_FAILED")?;
    fs::rename(&temp, path).map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_COMMIT_FAILED")?;
    File::open(
        path.parent()
            .ok_or("RUNNER_SESSION_HOST_RECEIPT_COMMIT_FAILED")?,
    )
    .and_then(|directory| directory.sync_all())
    .map_err(|_| "RUNNER_SESSION_HOST_RECEIPT_COMMIT_FAILED".to_string())
}

fn secure_directory(path: &Path) -> Result<(), String> {
    reject_symlink_components(path)?;
    fs::create_dir_all(path).map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID")?;
    reject_symlink_components(path)?;
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID".into());
    }
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID".to_string())
}

fn reject_symlink_components(path: &Path) -> Result<(), String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID")?
            .join(path)
    };
    let mut current = PathBuf::new();
    for component in absolute.components() {
        current.push(component.as_os_str());
        if let Ok(metadata) = fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() {
                return Err("RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID".into());
            }
        }
    }
    Ok(())
}

fn validate_identity(session_id: &str, generation: u64) -> Result<(), String> {
    if session_id.is_empty()
        || session_id.len() > 160
        || !session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        || generation == 0
    {
        return Err("RUNNER_SESSION_HOST_IDENTITY_INVALID".into());
    }
    Ok(())
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "RUNNER_SESSION_HOST_RANDOM_FAILED")?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}
