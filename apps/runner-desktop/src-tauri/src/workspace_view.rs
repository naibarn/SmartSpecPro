//! Local desktop projection; never publish local paths to the control plane.
use serde::Serialize;
use smartaihub_runner::{
    config::RunnerConfig,
    workspace_registry::{self, LocalWorkspaceDetails, WorkspaceSnapshotFacts},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceView {
    #[serde(flatten)]
    pub local: LocalWorkspaceDetails,
    pub facts: WorkspaceSnapshotFacts,
}

pub fn list(config: &RunnerConfig) -> Result<Vec<WorkspaceView>, String> {
    let facts = workspace_registry::snapshot_facts(config)?;
    workspace_registry::list_local_details(config)?
        .into_iter()
        .map(|local| {
            let facts = facts
                .iter()
                .find(|fact| fact.workspace_id == local.workspace_id)
                .cloned()
                .ok_or("RUNNER_WORKSPACE_NOT_REGISTERED")?;
            Ok(WorkspaceView { local, facts })
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
