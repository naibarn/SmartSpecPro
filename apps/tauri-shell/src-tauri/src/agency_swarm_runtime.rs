use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgencySwarmRuntimeRequest {
    pub package_id: String,
    pub gateway_base_url: String,
    pub provider_mode: String,
    #[serde(default)]
    pub unmanaged_provider_keys: Vec<String>,
    #[serde(default)]
    pub connector_actions: Vec<String>,
    #[serde(default)]
    pub capability_manifest: Vec<String>,
    pub runtime_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgencySwarmRuntimePlan {
    pub package_id: String,
    pub runtime_mode: String,
    pub gateway_base_url: String,
    pub provider_mode: String,
    pub connector_actions: Vec<String>,
    pub capability_manifest: Vec<String>,
}

fn looks_like_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

pub fn prepare_agency_swarm_runtime(
    request: AgencySwarmRuntimeRequest,
) -> Result<AgencySwarmRuntimePlan, String> {
    if request.package_id.trim().is_empty() {
        return Err("package_id is required".into());
    }
    if !looks_like_http_url(&request.gateway_base_url) {
        return Err("gateway_base_url must be an HTTP(S) endpoint".into());
    }
    if request.provider_mode != "gateway_only" {
        return Err("managed Agency Swarm runtime must use gateway_only provider mode".into());
    }
    if !request.unmanaged_provider_keys.is_empty() {
        return Err("managed Agency Swarm runtime rejects unmanaged provider keys".into());
    }

    Ok(AgencySwarmRuntimePlan {
        package_id: request.package_id,
        runtime_mode: request
            .runtime_mode
            .unwrap_or_else(|| "docker_managed".into()),
        gateway_base_url: request.gateway_base_url,
        provider_mode: request.provider_mode,
        connector_actions: request.connector_actions,
        capability_manifest: request.capability_manifest,
    })
}

#[tauri::command]
pub async fn desktop_host_prepare_agency_swarm_runtime(
    request: AgencySwarmRuntimeRequest,
) -> Result<AgencySwarmRuntimePlan, String> {
    prepare_agency_swarm_runtime(request)
}
