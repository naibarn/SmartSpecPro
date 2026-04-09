use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeDestination {
    Pi,
    AgencySwarm,
    DesktopHost,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MaterializePackageRequest {
    pub package_id: String,
    pub version: String,
    pub runtime_destination: RuntimeDestination,
    pub local_bundle_path: String,
    pub signature: String,
    pub capability_manifest_digest: String,
    pub payload_digest: String,
    pub compatible: bool,
    pub revoked: bool,
    pub trust_class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MaterializedPackage {
    pub package_id: String,
    pub version: String,
    pub runtime_destination: RuntimeDestination,
    pub local_bundle_path: String,
    pub materialized_entry_path: String,
    pub trust_class: String,
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

pub fn materialize_package(
    request: MaterializePackageRequest,
) -> Result<MaterializedPackage, String> {
    if request.package_id.trim().is_empty() || request.version.trim().is_empty() {
        return Err("package identity is required".into());
    }
    if request.local_bundle_path.trim().is_empty() {
        return Err("local_bundle_path is required".into());
    }
    if !is_sha256_hex(&request.signature)
        || !is_sha256_hex(&request.capability_manifest_digest)
        || !is_sha256_hex(&request.payload_digest)
    {
        return Err("signature, capability manifest digest, and payload digest are required".into());
    }
    if !request.compatible {
        return Err("package compatibility metadata rejected this desktop host".into());
    }
    if request.revoked {
        return Err("package has been revoked".into());
    }

    let entry_name = match request.runtime_destination {
        RuntimeDestination::Pi => "pi",
        RuntimeDestination::AgencySwarm => "agency-swarm",
        RuntimeDestination::DesktopHost => "desktop-host",
        RuntimeDestination::Hybrid => "hybrid",
    };

    Ok(MaterializedPackage {
        package_id: request.package_id,
        version: request.version,
        runtime_destination: request.runtime_destination,
        materialized_entry_path: format!("{}/{}", request.local_bundle_path.trim_end_matches('/'), entry_name),
        local_bundle_path: request.local_bundle_path,
        trust_class: request.trust_class,
    })
}

#[tauri::command]
pub async fn desktop_host_materialize_package(
    request: MaterializePackageRequest,
) -> Result<MaterializedPackage, String> {
    materialize_package(request)
}
