use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorActionRequest {
    pub connector_type: String,
    pub action: String,
    pub destination_class: String,
    pub dlp_sensitivity: String,
    pub secret_reference_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectorActionAuthorization {
    pub allowed: bool,
    pub decision: String,
    pub reason: String,
}

pub fn authorize_connector_action(
    request: ConnectorActionRequest,
) -> Result<ConnectorActionAuthorization, String> {
    if request.connector_type.trim().is_empty() || request.action.trim().is_empty() {
        return Err("connector_type and action are required".into());
    }
    if !request.secret_reference_present {
        return Err("connector actions require a scoped secret reference".into());
    }

    if request.action == "send_message"
        && request.destination_class == "external"
        && request.dlp_sensitivity != "low"
    {
        return Ok(ConnectorActionAuthorization {
            allowed: false,
            decision: "confirm".into(),
            reason: "connector outbound messages require DLP confirmation for sensitive content".into(),
        });
    }

    Ok(ConnectorActionAuthorization {
        allowed: true,
        decision: "allow".into(),
        reason: "connector action is allowed under managed policy".into(),
    })
}

#[tauri::command]
pub async fn desktop_host_authorize_connector_action(
    request: ConnectorActionRequest,
) -> Result<ConnectorActionAuthorization, String> {
    authorize_connector_action(request)
}
