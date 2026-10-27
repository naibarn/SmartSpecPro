//! Local desktop projection; never publish local paths to the control plane.
use serde::Serialize;
use smartaihub_runner::{
    config::RunnerConfig,
    workspace_registry::{self, WorkspaceSnapshotFacts},
};
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceView {
    pub workspace_id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facts: Option<WorkspaceSnapshotFacts>,
}

pub fn list(config: &RunnerConfig, developer_mode: bool) -> Result<Vec<WorkspaceView>, String> {
    let facts = if developer_mode {
        workspace_registry::snapshot_facts(config)?
    } else {
        Vec::new()
    };
    workspace_registry::list_local_details(config)?
        .into_iter()
        .map(|local| {
            let facts = if developer_mode {
                Some(
                    facts
                        .iter()
                        .find(|fact| fact.workspace_id == local.workspace_id)
                        .cloned()
                        .ok_or("RUNNER_WORKSPACE_NOT_REGISTERED")?,
                )
            } else {
                None
            };
            Ok(WorkspaceView {
                workspace_id: local.workspace_id,
                display_name: local.display_name,
                local_path: developer_mode.then_some(local.local_path),
                facts,
            })
        })
        .collect()
}

// Caller holds the existing lifecycle lock across the running check and write.
pub fn bind(
    config: &RunnerConfig,
    running: bool,
    workspace_id: &str,
    project_id: Option<&str>,
    repository_id: Option<&str>,
) -> Result<(), String> {
    if running {
        return Err("RUNNER_WORKSPACE_BINDING_REQUIRES_STOP".into());
    }
    workspace_registry::bind_identity(config, workspace_id, project_id, repository_id)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn simple_projection_omits_local_paths_git_facts_and_binding_ids() {
        let temp = std::env::temp_dir().join(format!(
            "runner-presentation-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let workspace_path = temp.join("SmartSpecPro");
        let data_root = temp.join("runner-data");
        fs::create_dir_all(&workspace_path).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &workspace_path).unwrap();
        workspace_registry::bind_identity(
            &config,
            &registered.workspace_id,
            Some("project-internal"),
            Some("repository-internal"),
        )
        .unwrap();

        let simple = serde_json::to_string(&list(&config, false).unwrap()).unwrap();
        assert!(simple.contains("SmartSpecPro"));
        assert!(!simple.contains("localPath"));
        assert!(!simple.contains("project-internal"));
        assert!(!simple.contains("repository-internal"));

        let developer = serde_json::to_string(&list(&config, true).unwrap()).unwrap();
        assert!(developer.contains(&workspace_path.to_string_lossy().to_string()));
        assert!(developer.contains("project-internal"));
        assert!(developer.contains("repository-internal"));
        fs::remove_dir_all(temp).unwrap();
    }
}
