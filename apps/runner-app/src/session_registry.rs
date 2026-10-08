use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

pub const SESSION_REGISTRY_SCHEMA_VERSION: u32 = 1;
const REGISTRY_FILE: &str = "sessions.json";
const LOCK_FILE: &str = "sessions.lock";
const MAX_REGISTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SESSIONS: usize = 2048;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalProcessIdentity {
    pub pid: u32,
    pub started_at: String,
    pub host_boot_id: String,
    pub identity_digest: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionManifest {
    pub schema_version: u32,
    pub session_id: String,
    pub worker_job_id: String,
    pub worker_job_attempt: u32,
    pub lease_fencing_version: u64,
    pub runner_id: String,
    pub session_generation: u64,
    pub authority_epoch: u64,
    pub placement_epoch: u64,
    pub job_control_revision: u64,
    pub driver_id: String,
    pub continuity_class: String,
    pub session_host_version: String,
    pub process: LocalProcessIdentity,
    #[serde(default)]
    pub host_process: Option<LocalProcessIdentity>,
    pub workspace_ref: String,
    pub command_sequence: u64,
    pub event_sequence: u64,
    pub last_state: String,
}

impl LocalSessionManifest {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema_version != SESSION_REGISTRY_SCHEMA_VERSION {
            return Err("RUNNER_SESSION_SCHEMA_UNSUPPORTED");
        }
        if self.session_id.trim().is_empty()
            || self.session_id.len() > 160
            || self.worker_job_id.trim().is_empty()
            || self.worker_job_id.len() > 160
            || self.runner_id.trim().is_empty()
            || self.runner_id.len() > 160
            || self.driver_id.trim().is_empty()
            || self.driver_id.len() > 128
            || !safe_workspace_ref(&self.workspace_ref)
            || self.continuity_class.len() > 32
            || self.session_host_version.len() > 64
        {
            return Err("RUNNER_SESSION_MANIFEST_IDENTITY_INVALID");
        }
        if self.session_generation == 0
            || self.worker_job_attempt == 0
            || self.job_control_revision == 0
            || self.process.pid == 0
        {
            return Err("RUNNER_SESSION_MANIFEST_REVISION_INVALID");
        }
        if self.process.host_boot_id.trim().is_empty()
            || self.process.host_boot_id.len() > 128
            || self.process.identity_digest.trim().is_empty()
            || !self
                .process
                .identity_digest
                .strip_prefix("sha256:")
                .is_some_and(valid_digest)
            || self.process.started_at.trim().is_empty()
            || self.process.started_at.len() > 64
        {
            return Err("RUNNER_SESSION_PROCESS_IDENTITY_INCOMPLETE");
        }
        if self.host_process.as_ref().is_some_and(|identity| {
            identity.pid < 2
                || identity.host_boot_id.trim().is_empty()
                || identity.host_boot_id.len() > 128
                || !identity
                    .identity_digest
                    .strip_prefix("sha256:")
                    .is_some_and(valid_digest)
                || identity.started_at.trim().is_empty()
                || identity.started_at.len() > 64
        }) {
            return Err("RUNNER_SESSION_HOST_PROCESS_IDENTITY_INCOMPLETE");
        }
        Ok(())
    }
}

fn safe_workspace_ref(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
        && value != "."
        && value != ".."
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Captures kernel-reported process identity. `started_at` stores Linux
/// `/proc/<pid>/stat` start ticks; wall-clock timestamps are not safe for PID
/// reuse checks.
pub fn capture_process_identity(pid: u32) -> Result<LocalProcessIdentity, String> {
    #[cfg(target_os = "linux")]
    {
        let host_boot_id = fs::read_to_string("/proc/sys/kernel/random/boot_id")
            .map_err(|_| "RUNNER_SESSION_PROCESS_IDENTITY_UNAVAILABLE")?
            .trim()
            .to_owned();
        let started_at = linux_process_start_ticks(pid)?;
        let identity_digest = process_identity_digest(pid, &started_at, &host_boot_id);
        return Ok(LocalProcessIdentity {
            pid,
            started_at,
            host_boot_id,
            identity_digest,
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = pid;
        Err("RUNNER_SESSION_PROCESS_IDENTITY_UNSUPPORTED".into())
    }
}

/// Fails closed when the PID now names a different process or the host rebooted.
pub fn verify_process_identity(identity: &LocalProcessIdentity) -> Result<(), String> {
    let current = capture_process_identity(identity.pid)?;
    if current == *identity {
        Ok(())
    } else {
        Err("RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH".into())
    }
}

#[cfg(target_os = "linux")]
fn linux_process_start_ticks(pid: u32) -> Result<String, String> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat"))
        .map_err(|_| "RUNNER_SESSION_PROCESS_IDENTITY_UNAVAILABLE")?;
    // `comm` is parenthesized and may itself contain spaces or parentheses.
    let fields = stat
        .rsplit_once(')')
        .ok_or("RUNNER_SESSION_PROCESS_IDENTITY_INVALID")?
        .1
        .split_whitespace()
        .collect::<Vec<_>>();
    fields
        .get(19)
        .filter(|value| value.bytes().all(|byte| byte.is_ascii_digit()))
        .map(|value| (*value).to_owned())
        .ok_or_else(|| "RUNNER_SESSION_PROCESS_IDENTITY_INVALID".into())
}

#[cfg(target_os = "linux")]
fn process_identity_digest(pid: u32, started_at: &str, host_boot_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pid.to_le_bytes());
    hasher.update([0]);
    hasher.update(started_at.as_bytes());
    hasher.update([0]);
    hasher.update(host_boot_id.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

#[derive(Debug, Serialize, Deserialize)]
struct RegistryEnvelope {
    schema_version: u32,
    sessions: Vec<LocalSessionManifest>,
    checksum_sha256: String,
}

pub struct SessionRegistry {
    root: PathBuf,
    sessions: Vec<LocalSessionManifest>,
    _lock: File,
}

impl SessionRegistry {
    pub fn open(root: &Path) -> Result<Self, String> {
        let root = prepare_protected_root(root)?;
        let lock_path = root.join(LOCK_FILE);
        if fs::symlink_metadata(&lock_path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("RUNNER_SESSION_REGISTRY_SYMLINK_FORBIDDEN".into());
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| "RUNNER_SESSION_REGISTRY_LOCK_UNAVAILABLE")?;
        set_private_file_permissions(&lock_path)?;
        lock.lock_exclusive()
            .map_err(|_| "RUNNER_SESSION_REGISTRY_LOCK_FAILED")?;

        let registry_path = root.join(REGISTRY_FILE);
        let sessions = match fs::symlink_metadata(&registry_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                quarantine(&registry_path)?;
                return Err("RUNNER_SESSION_REGISTRY_SYMLINK_QUARANTINED".into());
            }
            Ok(metadata) => {
                if metadata.len() > MAX_REGISTRY_BYTES {
                    quarantine(&registry_path)?;
                    return Err("RUNNER_SESSION_REGISTRY_TOO_LARGE_QUARANTINED".into());
                }
                match read_registry(&registry_path) {
                    Ok(sessions) => sessions,
                    Err(_) => {
                        quarantine(&registry_path)?;
                        return Err("RUNNER_SESSION_REGISTRY_CORRUPT_QUARANTINED".into());
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(_) => return Err("RUNNER_SESSION_REGISTRY_READ_FAILED".into()),
        };
        Ok(Self {
            root,
            sessions,
            _lock: lock,
        })
    }

    pub fn inventory(&self) -> &[LocalSessionManifest] {
        &self.sessions
    }

    /// Returns only records whose PID, kernel start time, and boot identity
    /// still match. Callers must never treat `inventory()` as attach authority.
    pub fn verified_process_inventory(&self) -> Result<Vec<&LocalSessionManifest>, String> {
        let mut verified = Vec::new();
        for session in &self.sessions {
            match verify_process_identity(&session.process) {
                Ok(()) => {
                    if let Some(host) = session.host_process.as_ref() {
                        match verify_process_identity(host) {
                            Ok(()) => verified.push(session),
                            Err(error)
                                if error == "RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH"
                                    || error == "RUNNER_SESSION_PROCESS_IDENTITY_UNAVAILABLE" => {}
                            Err(error) => return Err(error),
                        }
                    } else {
                        verified.push(session);
                    }
                }
                Err(error)
                    if error == "RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH"
                        || error == "RUNNER_SESSION_PROCESS_IDENTITY_UNAVAILABLE" => {}
                Err(error) => return Err(error),
            }
        }
        Ok(verified)
    }

    pub fn upsert(&mut self, manifest: LocalSessionManifest) -> Result<(), String> {
        manifest.validate().map_err(str::to_string)?;
        if let Some(existing) = self
            .sessions
            .iter_mut()
            .find(|session| session.session_id == manifest.session_id)
        {
            if existing.worker_job_id != manifest.worker_job_id
                || existing.session_generation != manifest.session_generation
            {
                return Err("RUNNER_SESSION_MANIFEST_IDENTITY_CONFLICT".into());
            }
            if manifest.command_sequence < existing.command_sequence
                || manifest.event_sequence < existing.event_sequence
                || manifest.authority_epoch < existing.authority_epoch
                || manifest.job_control_revision < existing.job_control_revision
            {
                return Err("RUNNER_SESSION_MANIFEST_WATERMARK_REGRESSION".into());
            }
            *existing = manifest;
        } else {
            if self.sessions.len() >= MAX_SESSIONS {
                return Err("RUNNER_SESSION_REGISTRY_CAPACITY_EXCEEDED".into());
            }
            self.sessions.push(manifest);
        }
        self.persist()
    }

    pub fn persist(&self) -> Result<(), String> {
        let checksum = checksum(&self.sessions)?;
        let envelope = RegistryEnvelope {
            schema_version: SESSION_REGISTRY_SCHEMA_VERSION,
            sessions: self.sessions.clone(),
            checksum_sha256: checksum,
        };
        let encoded =
            serde_json::to_vec(&envelope).map_err(|_| "RUNNER_SESSION_REGISTRY_ENCODE_FAILED")?;
        if encoded.len() as u64 > MAX_REGISTRY_BYTES {
            return Err("RUNNER_SESSION_REGISTRY_TOO_LARGE".into());
        }

        let mut nonce = [0u8; 16];
        getrandom::fill(&mut nonce).map_err(|_| "RUNNER_SESSION_REGISTRY_TEMP_UNAVAILABLE")?;
        let nonce = nonce
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let temporary_path = self.root.join(format!(".{REGISTRY_FILE}.{nonce}.tmp"));
        let target_path = self.root.join(REGISTRY_FILE);
        let mut temporary = open_new_private_temp(&temporary_path)?;
        temporary
            .write_all(&encoded)
            .map_err(|_| "RUNNER_SESSION_REGISTRY_WRITE_FAILED")?;
        temporary
            .sync_all()
            .map_err(|_| "RUNNER_SESSION_REGISTRY_SYNC_FAILED")?;
        fs::rename(&temporary_path, &target_path)
            .map_err(|_| "RUNNER_SESSION_REGISTRY_COMMIT_FAILED")?;
        #[cfg(unix)]
        File::open(&self.root)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| "RUNNER_SESSION_REGISTRY_DIRECTORY_SYNC_FAILED")?;
        Ok(())
    }
}

fn open_new_private_temp(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let file = options
        .open(path)
        .map_err(|_| "RUNNER_SESSION_REGISTRY_TEMP_UNAVAILABLE")?;
    set_private_file_permissions(path)?;
    Ok(file)
}

fn read_registry(path: &Path) -> Result<Vec<LocalSessionManifest>, String> {
    let bytes = fs::read(path).map_err(|_| "RUNNER_SESSION_REGISTRY_READ_FAILED")?;
    let envelope: RegistryEnvelope =
        serde_json::from_slice(&bytes).map_err(|_| "RUNNER_SESSION_REGISTRY_PARSE_FAILED")?;
    if envelope.schema_version != SESSION_REGISTRY_SCHEMA_VERSION
        || envelope.sessions.len() > MAX_SESSIONS
        || checksum(&envelope.sessions)? != envelope.checksum_sha256
    {
        return Err("RUNNER_SESSION_REGISTRY_CHECKSUM_INVALID".into());
    }
    for manifest in &envelope.sessions {
        manifest.validate().map_err(str::to_string)?;
    }
    let mut seen = std::collections::HashSet::new();
    if envelope
        .sessions
        .iter()
        .any(|session| !seen.insert(session.session_id.as_str()))
    {
        return Err("RUNNER_SESSION_REGISTRY_DUPLICATE_SESSION".into());
    }
    Ok(envelope.sessions)
}

fn checksum(sessions: &[LocalSessionManifest]) -> Result<String, String> {
    let encoded = serde_json::to_vec(sessions)
        .map_err(|_| "RUNNER_SESSION_REGISTRY_CHECKSUM_ENCODE_FAILED")?;
    let mut hasher = Sha256::new();
    hasher.update(encoded);
    Ok(format!("{:x}", hasher.finalize()))
}

fn prepare_protected_root(root: &Path) -> Result<PathBuf, String> {
    let absolute = if root.is_absolute() {
        root.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "RUNNER_SESSION_REGISTRY_ROOT_INVALID")?
            .join(root)
    };
    let mut current = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => current.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => return Err("RUNNER_SESSION_REGISTRY_ROOT_INVALID".into()),
            Component::Normal(part) => {
                current.push(part);
                match fs::symlink_metadata(&current) {
                    Ok(metadata) if metadata.file_type().is_symlink() => {
                        return Err("RUNNER_SESSION_REGISTRY_SYMLINK_FORBIDDEN".into());
                    }
                    Ok(metadata) if !metadata.is_dir() => {
                        return Err("RUNNER_SESSION_REGISTRY_ROOT_NOT_DIRECTORY".into());
                    }
                    Ok(_) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        fs::create_dir(&current)
                            .map_err(|_| "RUNNER_SESSION_REGISTRY_ROOT_CREATE_FAILED")?;
                    }
                    Err(_) => return Err("RUNNER_SESSION_REGISTRY_ROOT_UNAVAILABLE".into()),
                }
            }
        }
    }
    set_private_directory_permissions(&current)?;
    Ok(current)
}

fn quarantine(path: &Path) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "RUNNER_SESSION_REGISTRY_CLOCK_INVALID")?
        .as_secs();
    let target = path.with_file_name(format!("sessions.corrupt.{stamp}.json"));
    fs::rename(path, target).map_err(|_| "RUNNER_SESSION_REGISTRY_QUARANTINE_FAILED".to_string())
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "RUNNER_SESSION_REGISTRY_PERMISSIONS_FAILED".into())
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "RUNNER_SESSION_REGISTRY_PERMISSIONS_FAILED".into())
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn verifies_process_start_identity_and_rejects_stale_pid_metadata() {
        let identity = capture_process_identity(std::process::id()).unwrap();
        assert!(verify_process_identity(&identity).is_ok());

        let mut stale = identity;
        stale.started_at = stale
            .started_at
            .parse::<u64>()
            .unwrap()
            .saturating_sub(1)
            .to_string();
        assert_eq!(
            verify_process_identity(&stale),
            Err("RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH".into())
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn recovery_inventory_excludes_pid_with_stale_start_identity() {
        let temp = tempfile::tempdir().unwrap();
        let mut live = manifest();
        live.process = capture_process_identity(std::process::id()).unwrap();
        live.process.identity_digest = live.process.identity_digest.to_lowercase();
        let mut registry = SessionRegistry::open(temp.path()).unwrap();
        registry.upsert(live.clone()).unwrap();

        let verified = registry.verified_process_inventory().unwrap();
        assert_eq!(verified.len(), 1);
        assert_eq!(verified[0].session_id, live.session_id);

        let mut stale = live;
        stale.session_id = "ses-stale".into();
        stale.process.started_at = "1".into();
        stale.process.identity_digest =
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into();
        registry.upsert(stale).unwrap();
        assert_eq!(registry.verified_process_inventory().unwrap().len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn registry_temp_creation_does_not_follow_symlinks() {
        let temp = tempfile::tempdir().unwrap();
        let victim = temp.path().join("victim.txt");
        fs::write(&victim, b"keep").unwrap();
        let temp_link = temp.path().join("sessions.test.tmp");
        std::os::unix::fs::symlink(&victim, &temp_link).unwrap();

        assert!(open_new_private_temp(&temp_link).is_err());
        assert_eq!(fs::read(victim).unwrap(), b"keep");
    }

    fn manifest() -> LocalSessionManifest {
        LocalSessionManifest {
            schema_version: SESSION_REGISTRY_SCHEMA_VERSION,
            session_id: "ses-1".into(),
            worker_job_id: "job-1".into(),
            worker_job_attempt: 1,
            lease_fencing_version: 2,
            runner_id: "runner-1".into(),
            session_generation: 1,
            authority_epoch: 1,
            placement_epoch: 1,
            job_control_revision: 1,
            driver_id: "local.pty.v1".into(),
            continuity_class: "reattachable".into(),
            session_host_version: "1".into(),
            process: LocalProcessIdentity {
                pid: 1234,
                started_at: "2026-10-05T00:00:00Z".into(),
                host_boot_id: "boot-a".into(),
                identity_digest: format!("sha256:{}", "a".repeat(64)),
            },
            host_process: None,
            workspace_ref: "workspace-1".into(),
            command_sequence: 1,
            event_sequence: 1,
            last_state: "running".into(),
        }
    }

    #[test]
    fn persists_and_reloads_bounded_manifest_without_secrets() {
        let temp = tempfile::tempdir().unwrap();
        {
            let mut registry = SessionRegistry::open(temp.path()).unwrap();
            registry.upsert(manifest()).unwrap();
            assert_eq!(registry.inventory().len(), 1);
        }
        let bytes = fs::read(temp.path().join(REGISTRY_FILE)).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(!text.contains("token"));
        let registry = SessionRegistry::open(temp.path()).unwrap();
        assert_eq!(registry.inventory(), &[manifest()]);
    }

    #[test]
    fn rejects_watermark_regression_and_quarantines_corruption() {
        let temp = tempfile::tempdir().unwrap();
        {
            let mut registry = SessionRegistry::open(temp.path()).unwrap();
            registry.upsert(manifest()).unwrap();
            let mut stale = manifest();
            stale.event_sequence = 0;
            assert_eq!(
                registry.upsert(stale),
                Err("RUNNER_SESSION_MANIFEST_WATERMARK_REGRESSION".into())
            );
        }
        fs::write(temp.path().join(REGISTRY_FILE), b"not-json").unwrap();
        assert!(SessionRegistry::open(temp.path()).is_err());
        assert!(fs::read_dir(temp.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("sessions.corrupt.")
        }));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_control_roots() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("target");
        fs::create_dir(&target).unwrap();
        let link = temp.path().join("link");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(SessionRegistry::open(&link).is_err());
    }
}
