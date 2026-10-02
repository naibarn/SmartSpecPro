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
}
use crate::config::RunnerConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisteredWorkspace {
    pub workspace_id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceRecord {
    workspace_id: String,
    display_name: String,
    local_path: PathBuf,
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
        })
        .collect())
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
        });
        save_records(config, &records)?;
    }
    Ok(workspace)
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
