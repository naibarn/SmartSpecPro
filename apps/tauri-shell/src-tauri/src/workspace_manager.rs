use serde::{Deserialize, Serialize};

use crate::local_file_index::{ManagedLocalRoot, WritebackMode};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceProfileName {
    StandardManaged,
    AdvancedLocal,
    IndexingWorker,
    ConnectorHelper,
    PiSidecarManaged,
    AgencySwarmManaged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceNetworkClass {
    GatewayOnly,
    ServerOnly,
    ApprovedConnectorsOnly,
    ApprovedPublicWeb,
    UnrestrictedAdvancedLocal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceMountType {
    ProjectWorkspace,
    LocalRoot,
    OutputCache,
    PackageCache,
    ConnectorSocket,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceMount {
    pub mount_type: WorkspaceMountType,
    pub source_path: String,
    pub target_path: String,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceProfileRequest {
    pub profile_name: WorkspaceProfileName,
    pub project_workspace_path: String,
    pub package_cache_path: Option<String>,
    pub local_roots: Vec<ManagedLocalRoot>,
    pub needs_connector_sidecar: bool,
    pub advanced_local_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceProfile {
    pub profile_name: WorkspaceProfileName,
    pub network_class: WorkspaceNetworkClass,
    pub cpu_limit: u32,
    pub memory_mb: u32,
    pub mounts: Vec<WorkspaceMount>,
    pub connector_sidecar_allowed: bool,
    pub writeback_mode: WritebackMode,
}

pub fn build_workspace_profile(
    request: WorkspaceProfileRequest,
) -> Result<WorkspaceProfile, String> {
    if request.project_workspace_path.trim().is_empty() {
        return Err("project_workspace_path cannot be empty".into());
    }

    let mut mounts = vec![WorkspaceMount {
        mount_type: WorkspaceMountType::ProjectWorkspace,
        source_path: request.project_workspace_path.clone(),
        target_path: "/workspace".into(),
        read_only: false,
    }];

    for root in request.local_roots.iter().filter(|root| !root.denied_by_default) {
        mounts.push(WorkspaceMount {
            mount_type: WorkspaceMountType::LocalRoot,
            source_path: root.absolute_path.clone(),
            target_path: format!("/roots/{}", root.root_id),
            read_only: !request.advanced_local_mode
                && root.writeback_mode != WritebackMode::UserConfirmedRootWrite
                && root.writeback_mode != WritebackMode::AdvancedLocalOverride,
        });
    }

    if let Some(package_cache_path) = request.package_cache_path.as_ref() {
        mounts.push(WorkspaceMount {
            mount_type: WorkspaceMountType::PackageCache,
            source_path: package_cache_path.clone(),
            target_path: "/packages".into(),
            read_only: true,
        });
    }

    Ok(WorkspaceProfile {
        profile_name: request.profile_name,
        network_class: if request.advanced_local_mode {
            WorkspaceNetworkClass::ApprovedPublicWeb
        } else if request.needs_connector_sidecar {
            WorkspaceNetworkClass::ApprovedConnectorsOnly
        } else {
            WorkspaceNetworkClass::GatewayOnly
        },
        cpu_limit: if request.advanced_local_mode { 8 } else { 4 },
        memory_mb: if request.advanced_local_mode { 8192 } else { 4096 },
        mounts,
        connector_sidecar_allowed: request.needs_connector_sidecar,
        writeback_mode: if request.advanced_local_mode {
            WritebackMode::AdvancedLocalOverride
        } else {
            WritebackMode::ManagedOutputOnly
        },
    })
}

#[tauri::command]
pub async fn desktop_host_build_workspace_profile(
    request: WorkspaceProfileRequest,
) -> Result<WorkspaceProfile, String> {
    build_workspace_profile(request)
}
