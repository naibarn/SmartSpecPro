use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerCredentialScope {
    ConnectSession,
    WorkerAccess,
    WorkerRefresh,
    DeviceProof,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerCredentialMetadata {
    pub credential_id: String,
    pub scope: WorkerCredentialScope,
    pub stored_in_secure_os_storage: bool,
    pub exportable: bool,
}

pub fn build_credential_id(device_id: &str, scope: &WorkerCredentialScope) -> Result<String, String> {
    let sanitized = device_id
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        return Err("device_id is required".into());
    }

    Ok(format!("worker_app__{sanitized}__{}", scope_name(scope)))
}

pub fn placeholder_metadata(
    device_id: &str,
    scope: WorkerCredentialScope,
) -> Result<WorkerCredentialMetadata, String> {
    Ok(WorkerCredentialMetadata {
        credential_id: build_credential_id(device_id, &scope)?,
        scope,
        stored_in_secure_os_storage: false,
        exportable: false,
    })
}

fn scope_name(scope: &WorkerCredentialScope) -> &'static str {
    match scope {
        WorkerCredentialScope::ConnectSession => "connect_session",
        WorkerCredentialScope::WorkerAccess => "worker_access",
        WorkerCredentialScope::WorkerRefresh => "worker_refresh",
        WorkerCredentialScope::DeviceProof => "device_proof",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_ids_are_sanitized_and_non_exportable() {
        let metadata =
            placeholder_metadata("device 1@example", WorkerCredentialScope::DeviceProof).unwrap();

        assert_eq!(metadata.credential_id, "worker_app__device_1_example__device_proof");
        assert!(!metadata.exportable);
    }
}
