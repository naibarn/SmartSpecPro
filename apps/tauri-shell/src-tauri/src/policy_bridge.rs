use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PolicyBridgeRequest {
    pub policy_version: String,
    pub gateway_base_url: String,
    pub provider_mode: String,
    pub preferred_transport: String,
    pub mcp_fallback_allowed: bool,
    pub policy_expired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PolicyBridgeValidation {
    pub accepted: bool,
    pub reason: String,
}

fn looks_like_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

pub fn validate_policy_bridge(
    request: PolicyBridgeRequest,
) -> Result<PolicyBridgeValidation, String> {
    if request.policy_version.trim().is_empty() {
        return Err("policy_version is required".into());
    }
    if request.policy_expired {
        return Err("policy snapshot has expired".into());
    }
    if request.preferred_transport != "http" {
        return Err("Desktop Host must use HTTP-first transport".into());
    }
    if request.provider_mode != "gateway_only" {
        return Err("managed policy bridge requires gateway_only provider mode".into());
    }
    if !looks_like_http_url(&request.gateway_base_url) {
        return Err("gateway_base_url must be an HTTP(S) endpoint".into());
    }

    Ok(PolicyBridgeValidation {
        accepted: true,
        reason: if request.mcp_fallback_allowed {
            "http_first_mcp_second".into()
        } else {
            "http_only".into()
        },
    })
}

#[tauri::command]
pub async fn desktop_host_validate_policy_bridge(
    request: PolicyBridgeRequest,
) -> Result<PolicyBridgeValidation, String> {
    validate_policy_bridge(request)
}
