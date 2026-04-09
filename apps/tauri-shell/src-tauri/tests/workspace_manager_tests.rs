use smartspec_shell_lib::local_file_index::{build_managed_root, WritebackMode};
use smartspec_shell_lib::workspace_manager::{
    build_workspace_profile, WorkspaceNetworkClass, WorkspaceProfileName,
    WorkspaceProfileRequest,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-workspace-manager-{name}-{suffix}"));
    path
}

#[test]
fn builds_managed_workspace_profiles_with_gateway_only_network() {
    let root_dir = temp_dir("managed-root");
    std::fs::create_dir_all(&root_dir).unwrap();
    let workspace_dir = temp_dir("workspace");
    let package_cache_dir = temp_dir("packages");

    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let profile = build_workspace_profile(WorkspaceProfileRequest {
        profile_name: WorkspaceProfileName::PiSidecarManaged,
        project_workspace_path: workspace_dir.to_string_lossy().to_string(),
        package_cache_path: Some(package_cache_dir.to_string_lossy().to_string()),
        local_roots: vec![root],
        needs_connector_sidecar: false,
        advanced_local_mode: false,
    })
    .unwrap();

    assert_eq!(profile.network_class, WorkspaceNetworkClass::GatewayOnly);
    assert_eq!(profile.cpu_limit, 4);
    assert!(profile.mounts.iter().any(|mount| mount.target_path == "/workspace"));
    assert!(profile.mounts.iter().any(|mount| mount.target_path == "/packages"));
    assert!(profile.mounts.iter().any(|mount| mount.target_path == "/roots/quotes"));
}

#[test]
fn upgrades_network_and_writeback_in_advanced_local_mode() {
    let root_dir = temp_dir("advanced-root");
    std::fs::create_dir_all(&root_dir).unwrap();
    let workspace_dir = temp_dir("advanced-workspace");

    let root = build_managed_root(
        "assets",
        "Assets",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::UserConfirmedRootWrite),
        true,
    )
    .unwrap();

    let profile = build_workspace_profile(WorkspaceProfileRequest {
        profile_name: WorkspaceProfileName::AdvancedLocal,
        project_workspace_path: workspace_dir.to_string_lossy().to_string(),
        package_cache_path: None,
        local_roots: vec![root],
        needs_connector_sidecar: true,
        advanced_local_mode: true,
    })
    .unwrap();

    assert_eq!(profile.network_class, WorkspaceNetworkClass::ApprovedPublicWeb);
    assert_eq!(profile.cpu_limit, 8);
    assert_eq!(profile.writeback_mode, WritebackMode::AdvancedLocalOverride);
}
