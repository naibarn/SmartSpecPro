use fs2::FileExt;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::session_driver::{CheckpointManifest, RestoreScope};

const MAX_CHECKPOINT_BYTES: usize = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_STORE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_CHECKPOINTS: usize = 2048;

/// Durable, content-addressed checkpoint storage. This stores bytes and their
/// committed scope manifest; it does not provide provider certification.
pub struct CheckpointStore {
    root: PathBuf,
    _lock: File,
}

impl Drop for CheckpointStore {
    fn drop(&mut self) {
        let _ = self._lock.unlock();
    }
}

impl CheckpointStore {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, String> {
        let root = root.as_ref();
        reject_symlink_components(root)?;
        fs::create_dir_all(root).map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        reject_symlink_components(root)?;
        let supplied_metadata =
            fs::symlink_metadata(root).map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        if supplied_metadata.file_type().is_symlink() {
            return Err("RUNNER_CHECKPOINT_STORE_UNSAFE_ROOT".into());
        }
        let root = fs::canonicalize(root).map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        let metadata =
            fs::symlink_metadata(&root).map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("RUNNER_CHECKPOINT_STORE_UNSAFE_ROOT".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                .map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        }
        let lock_path = root.join("store.lock");
        let lock = open_control_file(&lock_path, true)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            lock.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        }
        lock.try_lock_exclusive()
            .map_err(|_| "RUNNER_CHECKPOINT_STORE_BUSY")?;
        Ok(Self { root, _lock: lock })
    }

    pub fn commit(
        &self,
        mut manifest: CheckpointManifest,
        content: &[u8],
        scope: &RestoreScope<'_>,
    ) -> Result<CheckpointManifest, String> {
        validate_checkpoint_id(&manifest.checkpoint_id)?;
        if content.is_empty() || content.len() > MAX_CHECKPOINT_BYTES {
            return Err("RUNNER_CHECKPOINT_SIZE_INVALID".into());
        }
        let digest = sha256(content);
        if manifest.content_sha256 != digest {
            return Err("RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID".into());
        }
        manifest.committed = true;
        manifest.lineage_sha256 =
            crate::session_driver::canonical_lineage_sha256(&manifest).map_err(str::to_owned)?;
        manifest
            .validate_restore(scope, &digest, &manifest.lineage_sha256)
            .map_err(str::to_owned)?;

        let manifest_path = self
            .root
            .join(format!("{}.manifest", manifest.checkpoint_id));
        let encoded =
            serde_json::to_vec(&manifest).map_err(|_| "RUNNER_CHECKPOINT_MANIFEST_INVALID")?;
        if encoded.len() as u64 > MAX_MANIFEST_BYTES {
            return Err("RUNNER_CHECKPOINT_MANIFEST_TOO_LARGE".into());
        }
        if manifest_path.exists() {
            let existing = read_bounded(&manifest_path, MAX_MANIFEST_BYTES as usize)?;
            if existing != encoded {
                return Err("RUNNER_CHECKPOINT_ID_CONFLICT".into());
            }
        }

        let blob = self.root.join(format!("{digest}.blob"));
        let additional_bytes = if blob.exists() {
            0
        } else {
            content.len() as u64
        } + if manifest_path.exists() {
            0
        } else {
            encoded.len() as u64
        };
        ensure_capacity(&self.root, additional_bytes, !manifest_path.exists())?;
        if blob.exists() {
            let existing = read_bounded(&blob, MAX_CHECKPOINT_BYTES)?;
            if existing != content {
                return Err("RUNNER_CHECKPOINT_CONTENT_ADDRESS_CONFLICT".into());
            }
        } else {
            write_immutable(&blob, content)?;
        }
        if !manifest_path.exists() {
            write_immutable(&manifest_path, &encoded)?;
        }
        sync_directory(&self.root)?;
        Ok(manifest)
    }

    pub fn load(
        &self,
        checkpoint_id: &str,
        scope: &RestoreScope<'_>,
    ) -> Result<(CheckpointManifest, Vec<u8>), String> {
        validate_checkpoint_id(checkpoint_id)?;
        let manifest_path = self.root.join(format!("{checkpoint_id}.manifest"));
        let encoded = read_bounded(&manifest_path, MAX_MANIFEST_BYTES as usize)?;
        let manifest: CheckpointManifest =
            serde_json::from_slice(&encoded).map_err(|_| "RUNNER_CHECKPOINT_MANIFEST_INVALID")?;
        if manifest.checkpoint_id != checkpoint_id || !manifest.committed {
            return Err("RUNNER_SESSION_CHECKPOINT_NOT_COMMITTED".into());
        }
        if manifest.content_sha256.len() != 64
            || !manifest
                .content_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID".into());
        }
        let content = read_bounded(
            &self.root.join(format!("{}.blob", manifest.content_sha256)),
            MAX_CHECKPOINT_BYTES,
        )?;
        let digest = sha256(&content);
        manifest
            .validate_restore(scope, &digest, &manifest.lineage_sha256)
            .map_err(str::to_owned)?;
        Ok((manifest, content))
    }
}

fn validate_checkpoint_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("RUNNER_CHECKPOINT_ID_INVALID".into());
    }
    Ok(())
}

fn reject_symlink_components(path: &Path) -> Result<(), String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?
            .join(path)
    };
    let mut current = PathBuf::new();
    for component in absolute.components() {
        current.push(component.as_os_str());
        if let Ok(metadata) = fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() {
                return Err("RUNNER_CHECKPOINT_STORE_UNSAFE_ROOT".into());
            }
        }
    }
    Ok(())
}

fn ensure_capacity(root: &Path, additional: u64, adds_checkpoint: bool) -> Result<(), String> {
    let mut bytes = 0u64;
    let mut checkpoints = 0usize;
    for entry in fs::read_dir(root).map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")? {
        let entry = entry.map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("RUNNER_CHECKPOINT_STORE_UNSAFE_ENTRY".into());
        }
        bytes = bytes.saturating_add(metadata.len());
        if entry.file_name().to_string_lossy().ends_with(".manifest") {
            checkpoints = checkpoints.saturating_add(1);
        }
    }
    if (adds_checkpoint && checkpoints >= MAX_CHECKPOINTS)
        || bytes.saturating_add(additional) > MAX_STORE_BYTES
    {
        return Err("RUNNER_CHECKPOINT_STORE_QUOTA_EXCEEDED".into());
    }
    Ok(())
}

fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn open_control_file(path: &Path, create: bool) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    if create {
        options.create(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    options
        .open(path)
        .map_err(|_| "RUNNER_CHECKPOINT_STORE_UNAVAILABLE".into())
}

fn read_bounded(path: &Path, max_bytes: usize) -> Result<Vec<u8>, String> {
    let file = open_control_file(path, false)?;
    let mut bytes = Vec::new();
    file.take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "RUNNER_CHECKPOINT_READ_FAILED")?;
    if bytes.len() > max_bytes {
        return Err("RUNNER_CHECKPOINT_SIZE_INVALID".into());
    }
    Ok(bytes)
}

fn write_immutable(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if fs::symlink_metadata(path).is_ok() {
        return Err("RUNNER_CHECKPOINT_WRITE_CONFLICT".into());
    }
    let mut nonce = [0u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| "RUNNER_CHECKPOINT_WRITE_FAILED")?;
    let suffix = nonce
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let file_name = path.file_name().ok_or("RUNNER_CHECKPOINT_WRITE_FAILED")?;
    let mut temp_name = std::ffi::OsString::from(".");
    temp_name.push(file_name);
    temp_name.push(format!(".{suffix}.tmp"));
    let temp_path = path.with_file_name(temp_name);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    let mut file = options
        .open(&temp_path)
        .map_err(|_| "RUNNER_CHECKPOINT_WRITE_CONFLICT")?;
    file.write_all(bytes)
        .map_err(|_| "RUNNER_CHECKPOINT_WRITE_FAILED")?;
    file.sync_all()
        .map_err(|_| "RUNNER_CHECKPOINT_SYNC_FAILED")?;
    fs::hard_link(&temp_path, path).map_err(|_| "RUNNER_CHECKPOINT_COMMIT_FAILED".to_string())?;
    fs::remove_file(&temp_path).map_err(|_| "RUNNER_CHECKPOINT_COMMIT_FAILED".to_string())
}

fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "RUNNER_CHECKPOINT_SYNC_FAILED")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> RestoreScope<'static> {
        RestoreScope {
            tenant_id: "tenant-1",
            worker_job_id: "job-1",
            session_id: "session-1",
            session_generation: 2,
            workspace_generation: 3,
            driver_id: "local.fs.v1",
            driver_version: "1",
        }
    }

    fn manifest(content: &[u8]) -> CheckpointManifest {
        CheckpointManifest {
            checkpoint_id: "checkpoint-1".into(),
            tenant_id: "tenant-1".into(),
            worker_job_id: "job-1".into(),
            session_id: "session-1".into(),
            session_generation: 2,
            workspace_generation: 3,
            driver_id: "local.fs.v1".into(),
            driver_version: "1".into(),
            parent_checkpoint_id: None,
            artifact_refs: vec!["artifact:one".into()],
            content_sha256: sha256(content),
            lineage_sha256: String::new(),
            committed: false,
        }
    }

    #[test]
    fn committed_checkpoint_survives_reopen_and_is_scope_bound() {
        let root = tempfile::tempdir().unwrap();
        let content = b"checkpoint payload";
        let store = CheckpointStore::open(root.path()).unwrap();
        let committed = store.commit(manifest(content), content, &scope()).unwrap();
        assert!(committed.committed);
        drop(store);

        let reopened = CheckpointStore::open(root.path()).unwrap();
        let (loaded, bytes) = reopened.load("checkpoint-1", &scope()).unwrap();
        assert_eq!(loaded, committed);
        assert_eq!(bytes, content);
        let other_scope = RestoreScope {
            tenant_id: "tenant-2",
            ..scope()
        };
        assert_eq!(
            reopened.load("checkpoint-1", &other_scope).unwrap_err(),
            "RUNNER_SESSION_CHECKPOINT_SCOPE_MISMATCH"
        );
    }

    #[test]
    fn checkpoint_store_rejects_id_reuse_and_tampered_blob() {
        let root = tempfile::tempdir().unwrap();
        let content = b"checkpoint payload";
        let store = CheckpointStore::open(root.path()).unwrap();
        store.commit(manifest(content), content, &scope()).unwrap();
        let mut other = manifest(b"different payload");
        assert_eq!(
            store
                .commit(other.clone(), b"different payload", &scope())
                .unwrap_err(),
            "RUNNER_CHECKPOINT_ID_CONFLICT"
        );
        other.checkpoint_id = "../escape".into();
        assert_eq!(
            store
                .commit(other, b"different payload", &scope())
                .unwrap_err(),
            "RUNNER_CHECKPOINT_ID_INVALID"
        );
        fs::write(
            root.path().join(format!("{}.blob", sha256(content))),
            b"tampered",
        )
        .unwrap();
        assert_eq!(
            store.load("checkpoint-1", &scope()).unwrap_err(),
            "RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID"
        );
    }

    #[cfg(unix)]
    #[test]
    fn checkpoint_store_rejects_symlink_root() {
        let parent = tempfile::tempdir().unwrap();
        let actual = parent.path().join("actual");
        fs::create_dir(&actual).unwrap();
        let alias = parent.path().join("alias");
        std::os::unix::fs::symlink(&actual, &alias).unwrap();
        assert_eq!(
            CheckpointStore::open(&alias).err().as_deref(),
            Some("RUNNER_CHECKPOINT_STORE_UNSAFE_ROOT")
        );
    }
}
