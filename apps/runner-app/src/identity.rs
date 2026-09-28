use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdentityState {
    Unknown,
    Enrolled,
    Rotating,
    Revoked,
    Offboarded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerIdentity {
    pub runner_id: String,
    pub node_id: String,
    pub tenant_id: Option<String>,
    pub profile: crate::config::RunnerProfile,
    pub state: IdentityState,
    pub public_key_fingerprint: Option<String>,
}

impl RunnerIdentity {
    pub fn local(runner_id: &str, device_id: &str, tenant_id: Option<&str>) -> Self {
        Self {
            runner_id: runner_id.into(),
            node_id: device_id.into(),
            tenant_id: tenant_id.map(str::to_owned),
            profile: crate::config::RunnerProfile::LocalDevice,
            state: IdentityState::Unknown,
            public_key_fingerprint: None,
        }
    }

    pub fn managed_container(runner_id: &str, node_id: &str) -> Self {
        Self {
            runner_id: runner_id.into(),
            node_id: node_id.into(),
            tenant_id: None,
            profile: crate::config::RunnerProfile::SharedContainer,
            state: IdentityState::Enrolled,
            public_key_fingerprint: None,
        }
    }

    pub fn redacted_json(&self) -> serde_json::Value {
        serde_json::json!({ "runnerId": self.runner_id, "nodeId": self.node_id, "profile": self.profile, "state": self.state })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_serialization_has_no_secret_material() {
        let identity = RunnerIdentity::local("r", "d", Some("tenant"));
        let json = serde_json::to_string(&identity).unwrap();
        assert!(!json.contains("token"));
        assert_eq!(identity.redacted_json()["profile"], "local_device");
    }
}
