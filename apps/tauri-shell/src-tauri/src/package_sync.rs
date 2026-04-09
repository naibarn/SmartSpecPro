use serde::{Deserialize, Serialize};

use crate::package_materializer::{
    materialize_package, MaterializePackageRequest, MaterializedPackage, RuntimeDestination,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageSyncRequest {
    pub tenant_id: String,
    pub package_id: String,
    pub version: String,
    pub runtime_destination: RuntimeDestination,
    pub cache_root_dir: String,
    pub signature: String,
    pub capability_manifest_digest: String,
    pub payload_digest: String,
    pub trust_class: String,
    pub package_state: String,
    pub compatible: bool,
    pub revoked: bool,
    pub revocation_checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageSyncPlan {
    pub tenant_id: String,
    pub package_id: String,
    pub version: String,
    pub cache_bundle_path: String,
    pub envelope_path: String,
    pub trust_class: String,
    pub package_state: String,
    pub revocation_checked_at: String,
    pub materialization_required: bool,
    pub materialized_package: MaterializedPackage,
}

fn is_server_publishable_trust_class(value: &str) -> bool {
    matches!(value, "built_in_verified" | "org_verified")
}

fn is_syncable_package_state(value: &str) -> bool {
    matches!(value, "trusted" | "restricted" | "requires_review")
}

pub fn prepare_package_sync(request: PackageSyncRequest) -> Result<PackageSyncPlan, String> {
    if request.tenant_id.trim().is_empty()
        || request.package_id.trim().is_empty()
        || request.version.trim().is_empty()
    {
        return Err("tenant_id, package_id, and version are required".into());
    }
    if request.cache_root_dir.trim().is_empty() {
        return Err("cache_root_dir is required".into());
    }
    if request.revocation_checked_at.trim().is_empty() {
        return Err("revocation_checked_at is required".into());
    }
    if !is_server_publishable_trust_class(&request.trust_class) {
        return Err("desktop sync accepts only built-in or org-verified packages".into());
    }
    if !is_syncable_package_state(&request.package_state) {
        return Err("desktop sync requires a trusted, restricted, or requires-review package state".into());
    }

    let cache_bundle_path = format!(
        "{}/{}/{}",
        request.cache_root_dir.trim_end_matches('/'),
        request.package_id,
        request.version
    );
    let envelope_path = format!("{cache_bundle_path}/desktop-package.json");

    let materialized_package = materialize_package(MaterializePackageRequest {
        package_id: request.package_id.clone(),
        version: request.version.clone(),
        runtime_destination: request.runtime_destination.clone(),
        local_bundle_path: cache_bundle_path.clone(),
        signature: request.signature.clone(),
        capability_manifest_digest: request.capability_manifest_digest.clone(),
        payload_digest: request.payload_digest.clone(),
        compatible: request.compatible,
        revoked: request.revoked,
        trust_class: request.trust_class.clone(),
    })?;

    Ok(PackageSyncPlan {
        tenant_id: request.tenant_id,
        package_id: request.package_id,
        version: request.version,
        cache_bundle_path,
        envelope_path,
        trust_class: request.trust_class,
        package_state: request.package_state,
        revocation_checked_at: request.revocation_checked_at,
        materialization_required: true,
        materialized_package,
    })
}

#[tauri::command]
pub async fn desktop_host_prepare_package_sync(
    request: PackageSyncRequest,
) -> Result<PackageSyncPlan, String> {
    prepare_package_sync(request)
}
