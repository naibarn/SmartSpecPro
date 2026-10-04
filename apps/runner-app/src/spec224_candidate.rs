//! Local Spec 224 candidate workspaces. Provider writes remain under the
//! Runner data root until the complete delta passes write-set and per-path CAS.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const MAX_FILES: usize = 50_000;
const MAX_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Candidate {
    pub original: PathBuf,
    pub root: PathBuf,
    baseline: BTreeMap<String, Option<String>>,
    allowed: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct JournalEntry {
    path: String,
    existed: bool,
}
#[derive(Serialize, Deserialize)]
struct JournalFile {
    original: String,
    candidate: String,
    entries: Vec<JournalEntry>,
}

pub fn create_for_command(
    config: &crate::config::RunnerConfig,
    command: &crate::protocol::RunnerJobCommand,
) -> Result<Candidate, String> {
    let policy = command
        .payload
        .get("spec224Execution")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "SPEC224_EXECUTION_POLICY_REQUIRED".to_string())?;
    if policy.len() != 3
        || !matches!(
            policy.get("mode").and_then(serde_json::Value::as_str),
            Some("prompt" | "work_package")
        )
    {
        return Err("SPEC224_EXECUTION_POLICY_INVALID".into());
    }
    let fingerprint = policy
        .get("sourceFingerprint")
        .and_then(serde_json::Value::as_str)
        .filter(|v| {
            v.len() == 64
                && v.bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
        .ok_or_else(|| "SPEC224_EXECUTION_POLICY_INVALID".to_string())?;
    let allowed = policy
        .get("allowedWriteSet")
        .and_then(serde_json::Value::as_array)
        .filter(|v| !v.is_empty() && v.len() <= 256)
        .ok_or_else(|| "SPEC224_EXECUTION_POLICY_INVALID".to_string())?
        .iter()
        .map(|item| {
            item.as_str()
                .map(str::to_owned)
                .ok_or_else(|| "SPEC224_EXECUTION_POLICY_INVALID".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let workspace = crate::external_agent::workspace_path(
        config,
        command
            .workspace_ref
            .as_deref()
            .ok_or_else(|| "RUNNER_WORKSPACE_REFERENCE_REQUIRED".to_string())?,
    )?;
    Candidate::create(
        &workspace,
        Path::new(&config.data_root),
        &command.command_id,
        fingerprint,
        allowed,
    )
}

fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 240
        && !path.contains('\\')
        && Path::new(path)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}
#[cfg(unix)]
fn set_private_dir(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "SPEC224_CANDIDATE_PERMISSIONS_FAILED".into())
}
#[cfg(not(unix))]
fn set_private_dir(_path: &Path) -> Result<(), String> {
    Ok(())
}
fn file_hash(path: &Path) -> Result<Option<String>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("SPEC224_SOURCE_READ_FAILED".into()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("SPEC224_SOURCE_ENTRY_UNSUPPORTED".into());
    }
    let bytes = fs::read(path).map_err(|_| "SPEC224_SOURCE_READ_FAILED")?;
    let mut hash = Sha256::new();
    hash.update(bytes);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        hash.update((metadata.permissions().mode() & 0o111).to_be_bytes());
    }
    Ok(Some(format!("{:x}", hash.finalize())))
}
fn validate_no_symlink_ancestors(root: &Path, relative: &str) -> Result<(), String> {
    if !safe_relative(relative) {
        return Err("SPEC224_CANDIDATE_PATH_INVALID".into());
    }
    let mut current = root.to_path_buf();
    let components: Vec<_> = Path::new(relative).components().collect();
    for (index, part) in components.iter().enumerate() {
        let Component::Normal(name) = part else {
            return Err("SPEC224_CANDIDATE_PATH_INVALID".into());
        };
        current.push(name);
        if index + 1 == components.len() {
            break;
        }
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err("SPEC224_CANDIDATE_PATH_UNSAFE".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return Err("SPEC224_SOURCE_READ_FAILED".into()),
        }
    }
    Ok(())
}
fn source_files(root: &Path) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .current_dir(root)
        .output()
        .map_err(|_| "SPEC224_SOURCE_ENUMERATION_FAILED")?;
    if !output.status.success() {
        return Err("SPEC224_SOURCE_NOT_GIT".into());
    }
    let mut paths = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .map(|part| {
            String::from_utf8(part.to_vec()).map_err(|_| "SPEC224_SOURCE_PATH_INVALID".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    if paths.len() > MAX_FILES || paths.iter().any(|path| !safe_relative(path)) {
        return Err("SPEC224_SOURCE_LIMIT_OR_PATH_INVALID".into());
    }
    let mut total = 0u64;
    for path in &paths {
        if let Ok(metadata) = fs::symlink_metadata(root.join(path)) {
            if metadata.is_file() && !metadata.file_type().is_symlink() {
                total = total.saturating_add(metadata.len());
            }
        }
        if total > MAX_BYTES {
            return Err("SPEC224_SOURCE_LIMIT_EXCEEDED".into());
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}
fn fingerprint(root: &Path) -> Result<String, String> {
    crate::workspace_registry::fingerprint_workspace(root)
        .ok_or_else(|| "SPEC224_SOURCE_FINGERPRINT_FAILED".into())
}
fn allowed(path: &str, set: &[String]) -> bool {
    set.iter().any(|entry| {
        entry == "**"
            || entry == path
            || path.starts_with(&format!("{entry}/"))
            || entry
                .strip_suffix("/**")
                .is_some_and(|prefix| path.starts_with(&format!("{prefix}/")))
    })
}

impl Candidate {
    pub fn recovery_ref(&self) -> String {
        format!(
            "spec224-candidate:{}",
            self.root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown")
        )
    }
    pub fn create(
        original: &Path,
        data_root: &Path,
        run_id: &str,
        expected: &str,
        allowed_write_set: Vec<String>,
    ) -> Result<Self, String> {
        if allowed_write_set.is_empty()
            || allowed_write_set.len() > 256
            || allowed_write_set
                .iter()
                .any(|p| p != "**" && !safe_relative(p))
        {
            return Err("SPEC224_WRITE_SET_INVALID".into());
        }
        let original = original
            .canonicalize()
            .map_err(|_| "SPEC224_WORKSPACE_INVALID")?;
        fs::create_dir_all(data_root).map_err(|_| "SPEC224_CANDIDATE_STORAGE_UNAVAILABLE")?;
        let data_root = data_root
            .canonicalize()
            .map_err(|_| "SPEC224_CANDIDATE_STORAGE_UNAVAILABLE")?;
        if data_root.starts_with(&original) || original.starts_with(&data_root) {
            return Err("SPEC224_CANDIDATE_STORAGE_OVERLAPS_WORKSPACE".into());
        }
        let paths = source_files(&original)?;
        if fingerprint(&original)? != expected {
            return Err("SPEC224_WORKSPACE_FINGERPRINT_STALE".into());
        }
        let run_hash = format!("{:x}", Sha256::digest(run_id.as_bytes()));
        let candidates_root = data_root.join("spec224-candidates");
        fs::create_dir_all(&candidates_root).map_err(|_| "SPEC224_CANDIDATE_CREATE_FAILED")?;
        set_private_dir(&candidates_root)?;
        let root = candidates_root.join(&run_hash[..32]);
        if root.exists() {
            return Err("SPEC224_CANDIDATE_ALREADY_EXISTS".into());
        }
        fs::create_dir_all(&root).map_err(|_| "SPEC224_CANDIDATE_CREATE_FAILED")?;
        set_private_dir(&root)?;
        let mut baseline = BTreeMap::new();
        for path in paths {
            let source = original.join(&path);
            let hash = file_hash(&source)?;
            if let Some(_) = hash {
                let destination = root.join(&path);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|_| "SPEC224_CANDIDATE_CREATE_FAILED")?;
                }
                fs::copy(&source, &destination).map_err(|_| "SPEC224_CANDIDATE_COPY_FAILED")?;
            }
            baseline.insert(path, hash);
        }
        Ok(Self {
            original,
            root,
            baseline,
            allowed: allowed_write_set,
        })
    }
    /// Apply only after provider success. Each target is rechecked against the
    /// original state captured before execution; conflicts retain the candidate.
    pub fn apply(self) -> Result<(), String> {
        let mut changed = Vec::new();
        let mut candidate_paths = Vec::new();
        collect_candidate(&self.root, &self.root, &mut candidate_paths)?;
        let candidate_set: HashSet<String> = candidate_paths.into_iter().collect();
        let all: HashSet<String> = self
            .baseline
            .keys()
            .cloned()
            .chain(candidate_set.iter().cloned())
            .collect();
        for path in all {
            validate_no_symlink_ancestors(&self.original, &path)?;
            validate_no_symlink_ancestors(&self.root, &path)?;
            let before = self.baseline.get(&path).cloned().unwrap_or(None);
            let after = file_hash(&self.root.join(&path))?;
            if before != after {
                if !allowed(&path, &self.allowed) {
                    return Err("SPEC224_WRITE_SET_VIOLATION".into());
                }
                if file_hash(&self.original.join(&path))? != before {
                    return Err("SPEC224_CAS_CONFLICT".into());
                }
                changed.push((path, after));
            }
        }
        let journal_dir = self
            .root
            .parent()
            .and_then(Path::parent)
            .ok_or("SPEC224_JOURNAL_FAILED")?
            .join("spec224-journals");
        fs::create_dir_all(&journal_dir).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        set_private_dir(&journal_dir)?;
        let journal = journal_dir.join(format!(
            "{}.json",
            self.root
                .file_name()
                .and_then(|v| v.to_str())
                .ok_or("SPEC224_JOURNAL_FAILED")?
        ));
        let backup_root = journal.with_extension("backups");
        fs::create_dir_all(&backup_root).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        let mut journal_entries = Vec::new();
        for (path, _) in &changed {
            if !safe_relative(path) {
                return Err("SPEC224_CANDIDATE_PATH_INVALID".into());
            }
            let source = self.original.join(path);
            let existed = source.exists();
            if existed {
                let backup = backup_root.join(path);
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
                }
                fs::copy(source, backup).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
            }
            journal_entries.push(JournalEntry {
                path: path.clone(),
                existed,
            });
        }
        let record = JournalFile {
            original: self.original.to_string_lossy().into_owned(),
            candidate: self.root.to_string_lossy().into_owned(),
            entries: journal_entries,
        };
        let encoded = serde_json::to_vec(&record).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        let temp_journal = journal.with_extension("tmp");
        let mut journal_file =
            fs::File::create(&temp_journal).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        use std::io::Write;
        journal_file
            .write_all(&encoded)
            .and_then(|_| journal_file.sync_all())
            .map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        fs::rename(temp_journal, &journal).map_err(|_| "SPEC224_JOURNAL_FAILED")?;
        for (path, after) in changed {
            let source = self.root.join(&path);
            let target = self.original.join(&path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|_| "SPEC224_APPLY_FAILED")?;
            }
            if after.is_some() {
                let temp = target.with_extension(format!("spec224-{}.tmp", std::process::id()));
                fs::copy(&source, &temp).map_err(|_| "SPEC224_APPLY_FAILED")?;
                if let Err(_) = fs::rename(temp, target) {
                    let _ = rollback_journal(&journal);
                    return Err("SPEC224_APPLY_FAILED".into());
                }
            } else if target.exists() {
                if fs::remove_file(target).is_err() {
                    let _ = rollback_journal(&journal);
                    return Err("SPEC224_APPLY_FAILED".into());
                }
            }
        }
        let _ = fs::remove_dir_all(self.root);
        let _ = fs::remove_dir_all(backup_root);
        let _ = fs::remove_file(journal);
        Ok(())
    }
}
fn rollback_journal(journal: &Path) -> Result<(), String> {
    if !journal.exists() {
        return Ok(());
    }
    let record: JournalFile =
        serde_json::from_slice(&fs::read(journal).map_err(|_| "SPEC224_JOURNAL_INVALID")?)
            .map_err(|_| "SPEC224_JOURNAL_INVALID")?;
    let original = Path::new(&record.original);
    for entry in record.entries.into_iter().rev() {
        if !safe_relative(&entry.path) {
            return Err("SPEC224_JOURNAL_INVALID".into());
        }
        let target = original.join(&entry.path);
        if entry.existed {
            let backup = journal.with_extension("backups").join(&entry.path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|_| "SPEC224_RECOVERY_FAILED")?;
            }
            let temp = target.with_extension("spec224-recovery.tmp");
            fs::copy(backup, &temp)
                .and_then(|_| fs::rename(temp, target))
                .map_err(|_| "SPEC224_RECOVERY_FAILED")?;
        } else if target.exists() {
            fs::remove_file(target).map_err(|_| "SPEC224_RECOVERY_FAILED")?;
        }
    }
    Ok(())
}
pub fn recover_pending(config: &crate::config::RunnerConfig) -> Result<usize, String> {
    let root = Path::new(&config.data_root).join("spec224-journals");
    if !root.exists() {
        return Ok(0);
    }
    let mut recovered = 0;
    for entry in fs::read_dir(&root).map_err(|_| "SPEC224_RECOVERY_SCAN_FAILED")? {
        let journal = entry.map_err(|_| "SPEC224_RECOVERY_SCAN_FAILED")?.path();
        if journal.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }
        let record: JournalFile =
            serde_json::from_slice(&fs::read(&journal).map_err(|_| "SPEC224_JOURNAL_INVALID")?)
                .map_err(|_| "SPEC224_JOURNAL_INVALID")?;
        let registered = crate::workspace_registry::list_local_details(config)?;
        let trusted = registered
            .iter()
            .any(|workspace| workspace.local_path == PathBuf::from(&record.original));
        if !trusted
            || !Path::new(&record.candidate)
                .starts_with(Path::new(&config.data_root).join("spec224-candidates"))
        {
            return Err("SPEC224_RECOVERY_TARGET_UNTRUSTED".into());
        }
        rollback_journal(&journal)?;
        let _ = fs::remove_dir_all(record.candidate);
        let _ = fs::remove_dir_all(journal.with_extension("backups"));
        recovered += 1;
        let _ = fs::remove_file(journal);
    }
    Ok(recovered)
}
fn collect_candidate(root: &Path, dir: &Path, result: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|_| "SPEC224_CANDIDATE_READ_FAILED")? {
        let entry = entry.map_err(|_| "SPEC224_CANDIDATE_READ_FAILED")?;
        let path = entry.path();
        let name = entry.file_name();
        if name == ".git" || name == ".apply-journal.json" {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|_| "SPEC224_CANDIDATE_READ_FAILED")?;
        if kind.is_symlink() {
            return Err("SPEC224_CANDIDATE_SYMLINK_FORBIDDEN".into());
        }
        if kind.is_dir() {
            collect_candidate(root, &path, result)?;
        } else if kind.is_file() {
            let rel = path
                .strip_prefix(root)
                .map_err(|_| "SPEC224_CANDIDATE_PATH_INVALID")?
                .to_string_lossy()
                .replace('\\', "/");
            if rel.starts_with(".smartaihub/spec224-inputs/") {
                continue;
            }
            if !safe_relative(&rel) {
                return Err("SPEC224_CANDIDATE_PATH_INVALID".into());
            }
            result.push(rel);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, String) {
        let temp = tempfile::tempdir().unwrap();
        let workspace = temp.path().join("workspace");
        let data = temp.path().join("runner-data");
        fs::create_dir_all(&workspace).unwrap();
        Command::new("git")
            .args(["init", "-q"])
            .current_dir(&workspace)
            .status()
            .unwrap();
        fs::write(workspace.join(".gitignore"), "ignored.txt\n").unwrap();
        fs::write(workspace.join("src.txt"), "base").unwrap();
        let mut f = fs::File::create(workspace.join("untracked.md")).unwrap();
        f.write_all(b"spec").unwrap();
        fs::write(workspace.join("ignored.txt"), "excluded").unwrap();
        Command::new("git")
            .args(["add", ".gitignore", "src.txt"])
            .current_dir(&workspace)
            .status()
            .unwrap();
        Command::new("git")
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-qm",
                "baseline",
            ])
            .current_dir(&workspace)
            .status()
            .unwrap();
        let fingerprint = crate::workspace_registry::fingerprint_workspace(&workspace).unwrap();
        (temp, workspace, data, fingerprint)
    }

    #[test]
    fn creates_candidate_outside_workspace_and_applies_only_allowed_delta() {
        let (_temp, workspace, data, fingerprint) = fixture();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-1",
            &fingerprint,
            vec!["src.txt".into()],
        )
        .unwrap();
        assert!(!candidate.root.starts_with(&workspace));
        assert!(candidate.root.join("src.txt").exists());
        assert!(candidate.root.join("untracked.md").exists());
        assert!(!candidate.root.join("ignored.txt").exists());
        assert!(!candidate.root.join(".git").exists());
        fs::write(candidate.root.join("src.txt"), "candidate").unwrap();
        candidate.apply().unwrap();
        assert_eq!(
            fs::read_to_string(workspace.join("src.txt")).unwrap(),
            "candidate"
        );
    }

    #[test]
    fn rejects_denied_delta_and_preserves_concurrent_user_edits() {
        let (_temp, workspace, data, fingerprint) = fixture();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-2",
            &fingerprint,
            vec!["src.txt".into()],
        )
        .unwrap();
        fs::write(candidate.root.join("untracked.md"), "forbidden").unwrap();
        assert_eq!(
            candidate.apply().unwrap_err(),
            "SPEC224_WRITE_SET_VIOLATION"
        );

        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-3",
            &fingerprint,
            vec!["src.txt".into()],
        )
        .unwrap();
        fs::write(candidate.root.join("src.txt"), "agent").unwrap();
        fs::write(workspace.join("src.txt"), "user").unwrap();
        assert_eq!(candidate.apply().unwrap_err(), "SPEC224_CAS_CONFLICT");
        assert_eq!(
            fs::read_to_string(workspace.join("src.txt")).unwrap(),
            "user"
        );
    }

    #[test]
    fn journal_rollback_restores_pre_apply_bytes_after_interruption() {
        let (_temp, workspace, data, fingerprint) = fixture();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-recover",
            &fingerprint,
            vec!["src.txt".into()],
        )
        .unwrap();
        let journal_dir = data.join("spec224-journals");
        fs::create_dir_all(&journal_dir).unwrap();
        let journal = journal_dir.join("run.json");
        let backups = journal.with_extension("backups");
        fs::create_dir_all(backups.join("src.txt").parent().unwrap()).unwrap();
        fs::copy(workspace.join("src.txt"), backups.join("src.txt")).unwrap();
        fs::write(workspace.join("src.txt"), "partially-applied").unwrap();
        let record = JournalFile {
            original: workspace.to_string_lossy().into_owned(),
            candidate: candidate.root.to_string_lossy().into_owned(),
            entries: vec![JournalEntry {
                path: "src.txt".into(),
                existed: true,
            }],
        };
        fs::write(&journal, serde_json::to_vec(&record).unwrap()).unwrap();
        rollback_journal(&journal).unwrap();
        assert_eq!(
            fs::read_to_string(workspace.join("src.txt")).unwrap(),
            "base"
        );
    }

    #[test]
    fn preserves_unrelated_source_edits_and_applies_allowed_new_and_deleted_paths() {
        let (_temp, workspace, data, fingerprint) = fixture();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-unrelated",
            &fingerprint,
            vec!["src.txt".into(), "src".into()],
        )
        .unwrap();
        fs::write(candidate.root.join("src.txt"), "edited").unwrap();
        fs::create_dir_all(candidate.root.join("src")).unwrap();
        fs::write(candidate.root.join("src/new.txt"), "new").unwrap();
        fs::write(workspace.join("unrelated.txt"), "user edit").unwrap();
        candidate.apply().unwrap();
        assert_eq!(
            fs::read_to_string(workspace.join("src.txt")).unwrap(),
            "edited"
        );
        assert_eq!(
            fs::read_to_string(workspace.join("src/new.txt")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(workspace.join("unrelated.txt")).unwrap(),
            "user edit"
        );

        let fingerprint = crate::workspace_registry::fingerprint_workspace(&workspace).unwrap();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-delete",
            &fingerprint,
            vec!["src.txt".into()],
        )
        .unwrap();
        fs::remove_file(candidate.root.join("src.txt")).unwrap();
        candidate.apply().unwrap();
        assert!(!workspace.join("src.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_candidate_symlink_escape_without_touching_target() {
        use std::os::unix::fs::symlink;
        let (_temp, workspace, data, fingerprint) = fixture();
        let outside = data.parent().unwrap().join("outside.txt");
        fs::write(&outside, "safe").unwrap();
        let candidate = Candidate::create(
            &workspace,
            &data,
            "run-symlink",
            &fingerprint,
            vec!["**".into()],
        )
        .unwrap();
        symlink(&outside, candidate.root.join("escape.txt")).unwrap();
        assert_eq!(
            candidate.apply().unwrap_err(),
            "SPEC224_CANDIDATE_SYMLINK_FORBIDDEN"
        );
        assert_eq!(fs::read_to_string(outside).unwrap(), "safe");
    }
}
