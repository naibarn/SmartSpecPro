use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PiRuntimeSessionRequest {
    pub package_id: String,
    pub gateway_base_url: String,
    pub provider_mode: String,
    pub sidecar_command: Option<String>,
    #[serde(default)]
    pub unmanaged_provider_keys: Vec<String>,
    #[serde(default)]
    pub tool_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PiRuntimeSessionPlan {
    pub package_id: String,
    pub boundary: String,
    pub gateway_base_url: String,
    pub provider_mode: String,
    pub tool_names: Vec<String>,
}

fn looks_like_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

pub fn prepare_pi_runtime_session(
    request: PiRuntimeSessionRequest,
) -> Result<PiRuntimeSessionPlan, String> {
    if request.package_id.trim().is_empty() {
        return Err("package_id is required".into());
    }
    if !looks_like_http_url(&request.gateway_base_url) {
        return Err("gateway_base_url must be an HTTP(S) endpoint".into());
    }
    if request.provider_mode != "gateway_only" {
        return Err("managed Pi runtime must use gateway_only provider mode".into());
    }
    if !request.unmanaged_provider_keys.is_empty() {
        return Err("managed Pi runtime rejects unmanaged provider keys".into());
    }
    if request
        .sidecar_command
        .as_ref()
        .map(|value| value.trim().is_empty())
        .unwrap_or(true)
    {
        return Err("managed Pi runtime requires a sidecar command".into());
    }

    Ok(PiRuntimeSessionPlan {
        package_id: request.package_id,
        boundary: "sidecar_rpc".into(),
        gateway_base_url: request.gateway_base_url,
        provider_mode: request.provider_mode,
        tool_names: request.tool_names,
    })
}

#[tauri::command]
pub async fn desktop_host_prepare_pi_runtime_session(
    request: PiRuntimeSessionRequest,
) -> Result<PiRuntimeSessionPlan, String> {
    prepare_pi_runtime_session(request)
}
