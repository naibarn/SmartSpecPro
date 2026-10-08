#[cfg(test)]
mod tests {
    use crate::{config::RunnerConfig, workspace_registry};
    use std::fs;

    #[test]
    fn registers_workspace_without_serializing_local_path() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("my-project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };

        let registered = workspace_registry::register(&config, &project).unwrap();
        let listed = workspace_registry::list(&config).unwrap();
        let stored = fs::read_to_string(workspace_registry::registry_file(&config)).unwrap();
        let stored_records: Vec<workspace_registry::WorkspaceRecord> =
            serde_json::from_str(&stored).unwrap();
        let published = serde_json::to_string(&listed).unwrap();
        let canonical_project = project.canonicalize().unwrap();

        assert_eq!(listed, vec![registered.clone()]);
        assert!(registered.workspace_id.starts_with("ws-my-project-"));
        assert_eq!(stored_records.len(), 1);
        assert_eq!(stored_records[0].local_path, canonical_project);
        assert!(!published.contains(&project.to_string_lossy().to_string()));
        assert!(
            workspace_registry::resolve(&config, &registered.workspace_id)
                .unwrap()
                .is_dir()
        );
    }

    #[test]
    fn publishes_only_explicit_project_repository_and_current_task_identity() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("private-project-folder");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();
        let bound = workspace_registry::bind_identity(
            &config,
            &registered.workspace_id,
            Some("project-a"),
            Some("github.com/org/repository"),
        )
        .unwrap();
        assert_eq!(bound.project_id.as_deref(), Some("project-a"));
        assert_eq!(
            bound.repository_id.as_deref(),
            Some("github.com/org/repository")
        );

        let facts = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(facts[0].project_id.as_deref(), Some("project-a"));
        assert_eq!(
            facts[0].repository_id.as_deref(),
            Some("github.com/org/repository")
        );
        assert_eq!(facts[0].task_id, None);
        assert_eq!(facts[0].convergence_state, "NOT_REPORTED");
        let serialized = serde_json::to_string(&facts).unwrap();
        assert!(serialized.contains("\"projectId\":\"project-a\""));
        assert!(serialized.contains("\"repositoryId\":\"github.com/org/repository\""));
        assert!(!serialized.contains(&project.to_string_lossy().to_string()));

        assert_eq!(
            workspace_registry::bind_identity(
                &config,
                &registered.workspace_id,
                Some("https://token@github.com/org/repository"),
                None,
            )
            .unwrap_err(),
            "RUNNER_WORKSPACE_IDENTITY_INVALID"
        );
    }

    #[test]
    fn loads_legacy_workspace_records_without_identity_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("legacy-project");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: temp
                .path()
                .join("runner-data")
                .to_string_lossy()
                .into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        fs::create_dir_all(&config.data_root).unwrap();
        let legacy = serde_json::json!([{
            "workspace_id": "workspace-legacy",
            "display_name": "Legacy",
            "local_path": project.canonicalize().unwrap(),
        }]);
        fs::write(
            workspace_registry::registry_file(&config),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();

        assert_eq!(
            workspace_registry::list(&config).unwrap(),
            vec![workspace_registry::RegisteredWorkspace {
                workspace_id: "workspace-legacy".into(),
                display_name: "Legacy".into(),
                project_id: None,
                repository_id: None,
            }]
        );
    }

    #[test]
    fn rejects_unregistered_workspace_ids_and_non_directories() {
        let temp = tempfile::tempdir().unwrap();
        let config = RunnerConfig {
            data_root: temp
                .path()
                .join("runner-data")
                .to_string_lossy()
                .into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let file = temp.path().join("not-a-directory");
        fs::write(&file, "test").unwrap();

        assert!(workspace_registry::register(&config, &file).is_err());
        assert!(workspace_registry::resolve(&config, "ws-forged").is_err());
    }

    #[test]
    fn rejects_path_replacement_after_workspace_registration() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();
        fs::remove_dir(&project).unwrap();
        fs::write(&project, "replacement").unwrap();

        assert!(workspace_registry::resolve(&config, &registered.workspace_id).is_err());
    }

    #[test]
    fn snapshot_facts_keep_non_git_and_missing_workspaces_redacted_and_bounded() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("non-git-project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();

        let facts = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].workspace_id, registered.workspace_id);
        assert_eq!(facts[0].display_name, registered.display_name);
        assert_eq!(facts[0].git_head, None);
        assert_eq!(facts[0].git_branch, None);
        assert!(!facts[0].dirty);
        let published = serde_json::to_string(&facts).unwrap();
        assert!(!published.contains(&project.to_string_lossy().to_string()));

        fs::remove_dir(&project).unwrap();
        let missing = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(missing[0].workspace_id, registered.workspace_id);
        assert_eq!(missing[0].git_head, None);
        assert_eq!(missing[0].git_branch, None);
        assert!(!missing[0].dirty);
    }

    #[test]
    fn snapshot_fingerprint_tracks_source_content_but_ignores_gitignored_files() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&project)
            .status()
            .unwrap();
        fs::write(project.join(".gitignore"), "ignored.txt\n").unwrap();
        fs::write(project.join("source.txt"), "one").unwrap();
        std::process::Command::new("git")
            .args(["add", ".gitignore", "source.txt"])
            .current_dir(&project)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-qm",
                "baseline",
            ])
            .current_dir(&project)
            .status()
            .unwrap();
        workspace_registry::register(&config, &project).unwrap();

        let first = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        fs::write(project.join("ignored.txt"), "secret or generated").unwrap();
        let ignored = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_eq!(first, ignored);
        fs::write(project.join("source.txt"), "two").unwrap();
        let changed = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, changed);
        assert!(first.as_deref().is_some_and(|value| value.len() == 64));

        std::process::Command::new("git")
            .args(["checkout", "--", "source.txt"])
            .current_dir(&project)
            .status()
            .unwrap();
        fs::write(project.join("new.md"), "untracked").unwrap();
        let untracked = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, untracked);
        fs::remove_file(project.join("new.md")).unwrap();

        fs::remove_file(project.join("source.txt")).unwrap();
        let deleted = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, deleted);
        fs::write(project.join("source.txt"), "one").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                project.join("source.txt"),
                fs::Permissions::from_mode(0o755),
            )
            .unwrap();
            let executable = workspace_registry::snapshot_facts(&config).unwrap()[0]
                .content_fingerprint
                .clone();
            assert_ne!(first, executable);
        }
    }

    #[test]
    fn rejects_unbounded_git_fields_before_publishing() {
        assert!(workspace_registry::valid_git_head(&"a".repeat(40)));
        assert!(!workspace_registry::valid_git_head(
            "remote:https://private.example/repo"
        ));
        assert!(workspace_registry::valid_git_branch(
            "feature/workspace-facts_1"
        ));
        assert!(!workspace_registry::valid_git_branch(
            "origin/https://private.example/repo"
        ));
        assert!(!workspace_registry::valid_git_branch(&"a".repeat(121)));
    }

    #[test]
    fn workspace_fingerprint_path_encoding_supports_unicode_names() {
        let path = std::path::Path::new("src/ผู้ช่วย.rs");
        let parsed = workspace_registry::path_from_git_bytes("src/ผู้ช่วย.rs".as_bytes());

        assert_eq!(parsed.as_deref(), Some(path));
        assert!(!workspace_registry::os_str_identity_bytes(path.as_os_str()).is_empty());
    }
}
use crate::config::RunnerConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::ffi::OsStr;
use std::fs;
#[cfg(unix)]
use std::os::unix::ffi::OsStrExt;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisteredWorkspace {
    pub workspace_id: String,
    pub display_name: String,
    pub project_id: Option<String>,
    pub repository_id: Option<String>,
}

/// Redacted, read-only facts that a Runner may include in its capability
/// snapshot. Local paths and Git remotes intentionally never leave the device.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotFacts {
    pub workspace_id: String,
    pub project_id: Option<String>,
    pub repository_id: Option<String>,
    pub display_name: String,
    pub git_head: Option<String>,
    pub git_branch: Option<String>,
    pub dirty: bool,
    pub content_fingerprint: Option<String>,
    pub task_id: Option<String>,
    pub convergence_state: String,
    pub convergence_canonical_sha: Option<String>,
}

/// Local-only workspace details for the Runner desktop UI. Never include this
/// type in a control-plane capability snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWorkspaceDetails {
    pub workspace_id: String,
    pub display_name: String,
    pub local_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceRecord {
    workspace_id: String,
    display_name: String,
    local_path: PathBuf,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    repository_id: Option<String>,
}

pub fn registry_file(config: &RunnerConfig) -> PathBuf {
    PathBuf::from(&config.data_root).join("workspace_registry.json")
}

pub fn list(config: &RunnerConfig) -> Result<Vec<RegisteredWorkspace>, String> {
    Ok(load_records(config)?
        .into_iter()
        .map(|record| RegisteredWorkspace {
            workspace_id: record.workspace_id,
            display_name: record.display_name,
            project_id: record.project_id,
            repository_id: record.repository_id,
        })
        .collect())
}

pub fn list_local_details(config: &RunnerConfig) -> Result<Vec<LocalWorkspaceDetails>, String> {
    Ok(load_records(config)?
        .into_iter()
        .map(|record| LocalWorkspaceDetails {
            workspace_id: record.workspace_id,
            display_name: record.display_name,
            local_path: record.local_path,
        })
        .collect())
}

/// Return bounded repository facts for registered workspaces without exposing
/// their filesystem locations or remotes. A missing or non-Git workspace stays
/// visible by ID and is reported with no Git identity and `dirty: false`.
pub fn snapshot_facts(config: &RunnerConfig) -> Result<Vec<WorkspaceSnapshotFacts>, String> {
    Ok(load_records(config)?
        .into_iter()
        .map(|record| {
            let inspection = inspect_git_workspace(&record.local_path);
            WorkspaceSnapshotFacts {
                workspace_id: record.workspace_id,
                project_id: record.project_id,
                repository_id: record.repository_id,
                display_name: record.display_name,
                git_head: inspection.git_head,
                git_branch: inspection.git_branch,
                dirty: inspection.dirty,
                content_fingerprint: fingerprint_workspace(&record.local_path),
                task_id: None,
                convergence_state: "NOT_REPORTED".into(),
                convergence_canonical_sha: None,
            }
        })
        .collect())
}

pub(crate) fn fingerprint_workspace(workspace: &Path) -> Option<String> {
    if !workspace.is_dir() {
        return None;
    }
    let listed = Command::new("git")
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .current_dir(workspace)
        .output()
        .ok()
        .filter(|output| output.status.success());
    let paths: Vec<PathBuf> = if let Some(output) = listed {
        let parsed: Option<Vec<PathBuf>> = output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|part| !part.is_empty())
            .map(path_from_git_bytes)
            .collect();
        if let Some(paths) = parsed {
            paths
        } else {
            let mut paths = Vec::new();
            collect_files(workspace, workspace, &mut paths)?;
            paths
        }
    } else {
        let mut paths = Vec::new();
        collect_files(workspace, workspace, &mut paths)?;
        paths
    };
    if paths.len() > 50_000 {
        return None;
    }
    let mut normalized = paths;
    normalized.sort();
    let mut hasher = Sha256::new();
    let mut total = 0u64;
    for relative in normalized {
        if relative.is_absolute()
            || relative.components().any(|part| {
                matches!(
                    part,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return None;
        }
        let path = workspace.join(&relative);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                hasher.update(b"deleted\0");
                hasher.update(os_str_identity_bytes(relative.as_os_str()).as_ref());
                continue;
            }
            Err(_) => return None,
        };
        if metadata.file_type().is_symlink() {
            return None;
        }
        if !metadata.is_file() {
            continue;
        }
        total = total.checked_add(metadata.len())?;
        if total > 512 * 1024 * 1024 {
            return None;
        }
        let bytes = fs::read(&path).ok()?;
        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111
        };
        #[cfg(not(unix))]
        let mode = 0u32;
        let relative_bytes = os_str_identity_bytes(relative.as_os_str());
        hasher.update((relative_bytes.len() as u64).to_be_bytes());
        hasher.update(relative_bytes.as_ref());
        hasher.update(mode.to_be_bytes());
        hasher.update(Sha256::digest(bytes));
    }
    Some(format!("{:x}", hasher.finalize()))
}

#[cfg(unix)]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    Some(PathBuf::from(OsStr::from_bytes(bytes)))
}

#[cfg(windows)]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    String::from_utf8(bytes.to_vec()).ok().map(PathBuf::from)
}

#[cfg(not(any(unix, windows)))]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    String::from_utf8(bytes.to_vec()).ok().map(PathBuf::from)
}

#[cfg(unix)]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Borrowed(value.as_bytes())
}

#[cfg(windows)]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Owned(value.encode_wide().flat_map(u16::to_le_bytes).collect())
}

#[cfg(not(any(unix, windows)))]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Owned(value.to_string_lossy().as_bytes().to_vec())
}

fn collect_files(root: &Path, directory: &Path, result: &mut Vec<PathBuf>) -> Option<()> {
    for entry in fs::read_dir(directory).ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let kind = entry.file_type().ok()?;
        if kind.is_symlink() {
            return None;
        }
        if kind.is_dir() {
            collect_files(root, &entry.path(), result)?;
        } else if kind.is_file() {
            result.push(entry.path().strip_prefix(root).ok()?.to_path_buf());
        }
    }
    Some(())
}

#[derive(Default)]
struct GitWorkspaceInspection {
    git_head: Option<String>,
    git_branch: Option<String>,
    dirty: bool,
}

fn inspect_git_workspace(workspace: &Path) -> GitWorkspaceInspection {
    if !workspace.is_dir() {
        return GitWorkspaceInspection::default();
    }
    let git_dir = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(workspace)
        .output();
    let Ok(git_dir) = git_dir else {
        return GitWorkspaceInspection::default();
    };
    if !git_dir.status.success() {
        return GitWorkspaceInspection::default();
    }

    let git_head = git_output(workspace, &["rev-parse", "--verify", "HEAD"])
        .filter(|value| valid_git_head(value));
    let git_branch = git_output(workspace, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .filter(|value| valid_git_branch(value));
    let dirty = Command::new("git")
        .args(["status", "--porcelain", "--untracked-files=normal"])
        .current_dir(workspace)
        .output()
        .map(|output| output.status.success() && !output.stdout.is_empty())
        .unwrap_or(false);
    GitWorkspaceInspection {
        git_head,
        git_branch,
        dirty,
    }
}

fn git_output(workspace: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn valid_git_head(value: &str) -> bool {
    (40..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_git_branch(value: &str) -> bool {
    (1..=120).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'.' | b'-'))
}

pub fn register(config: &RunnerConfig, path: &Path) -> Result<RegisteredWorkspace, String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "RUNNER_WORKSPACE_PATH_NOT_FOUND".to_string())?;
    if !canonical_path.is_dir() {
        return Err("RUNNER_WORKSPACE_MUST_BE_DIRECTORY".into());
    }
    let name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "RUNNER_WORKSPACE_NAME_INVALID".to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(canonical_path.as_os_str().to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let slug = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let workspace = RegisteredWorkspace {
        workspace_id: format!("ws-{}-{}", slug.trim_matches('-'), &digest[..12]),
        display_name: name.chars().take(80).collect(),
        project_id: None,
        repository_id: None,
    };

    let mut records = load_records(config)?;
    if let Some(existing) = records
        .iter()
        .find(|record| record.workspace_id == workspace.workspace_id)
    {
        if existing.local_path != canonical_path {
            return Err("RUNNER_WORKSPACE_ID_COLLISION".into());
        }
    } else {
        records.push(WorkspaceRecord {
            workspace_id: workspace.workspace_id.clone(),
            display_name: workspace.display_name.clone(),
            local_path: canonical_path,
            project_id: None,
            repository_id: None,
        });
        save_records(config, &records)?;
    }
    let record = records
        .iter()
        .find(|record| record.workspace_id == workspace.workspace_id);
    Ok(RegisteredWorkspace {
        project_id: record.and_then(|record| record.project_id.clone()),
        repository_id: record.and_then(|record| record.repository_id.clone()),
        ..workspace
    })
}

pub fn bind_identity(
    config: &RunnerConfig,
    workspace_id: &str,
    project_id: Option<&str>,
    repository_id: Option<&str>,
) -> Result<RegisteredWorkspace, String> {
    fn valid_identity(value: &str) -> bool {
        !value.is_empty()
            && value.len() <= 200
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'/' | b'-')
            })
            && !value.contains("://")
            && !value.contains('@')
            && !value.contains("//")
            && !value.contains("..")
            && value.as_bytes()[0].is_ascii_alphanumeric()
    }
    if project_id.is_some_and(|value| !valid_identity(value))
        || repository_id.is_some_and(|value| !valid_identity(value))
    {
        return Err("RUNNER_WORKSPACE_IDENTITY_INVALID".into());
    }
    let mut records = load_records(config)?;
    let record = records
        .iter_mut()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or_else(|| "RUNNER_WORKSPACE_NOT_REGISTERED".to_string())?;
    record.project_id = project_id.map(str::to_string);
    record.repository_id = repository_id.map(str::to_string);
    let result = RegisteredWorkspace {
        workspace_id: record.workspace_id.clone(),
        display_name: record.display_name.clone(),
        project_id: record.project_id.clone(),
        repository_id: record.repository_id.clone(),
    };
    save_records(config, &records)?;
    Ok(result)
}

pub fn remove(config: &RunnerConfig, workspace_id: &str) -> Result<bool, String> {
    let mut records = load_records(config)?;
    let original_len = records.len();
    records.retain(|record| record.workspace_id != workspace_id);
    if records.len() == original_len {
        return Ok(false);
    }
    save_records(config, &records)?;
    Ok(true)
}

pub fn resolve(config: &RunnerConfig, workspace_id: &str) -> Result<PathBuf, String> {
    let record = load_records(config)?
        .into_iter()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or_else(|| "RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".to_string())?;
    let current = record
        .local_path
        .canonicalize()
        .map_err(|_| "RUNNER_TRUSTED_WORKSPACE_CHANGED".to_string())?;
    if !current.is_dir() || current != record.local_path {
        return Err("RUNNER_TRUSTED_WORKSPACE_CHANGED".into());
    }
    Ok(current)
}

fn load_records(config: &RunnerConfig) -> Result<Vec<WorkspaceRecord>, String> {
    let path = registry_file(config);
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("RUNNER_WORKSPACE_REGISTRY_READ_FAILED".into()),
    };
    let records: Vec<WorkspaceRecord> = serde_json::from_str(&contents)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_INVALID".to_string())?;
    if records.len() > 128 {
        return Err("RUNNER_WORKSPACE_REGISTRY_LIMIT_EXCEEDED".into());
    }
    let mut ids = std::collections::HashSet::new();
    for record in &records {
        if record.workspace_id.trim().is_empty()
            || record.display_name.trim().is_empty()
            || !record.local_path.is_absolute()
            || !ids.insert(record.workspace_id.as_str())
        {
            return Err("RUNNER_WORKSPACE_REGISTRY_INVALID".into());
        }
    }
    Ok(records)
}

fn save_records(config: &RunnerConfig, records: &[WorkspaceRecord]) -> Result<(), String> {
    let path = registry_file(config);
    let parent = path
        .parent()
        .ok_or_else(|| "RUNNER_WORKSPACE_REGISTRY_PATH_INVALID".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED".to_string())?;
    set_private_directory_permissions(parent)?;
    let temporary = parent.join(format!(".workspace_registry.{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec(records)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_SERIALIZE_FAILED".to_string())?;
    fs::write(&temporary, bytes)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED".to_string())?;
    set_private_file_permissions(&temporary)?;
    fs::rename(&temporary, &path)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_COMMIT_FAILED".to_string())?;
    Ok(())
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_PERMISSIONS_FAILED".to_string())
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_PERMISSIONS_FAILED".to_string())
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}
