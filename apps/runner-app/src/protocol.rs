use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: &str = "sah-runner-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Profile {
    LocalDevice,
    SharedContainer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    LocalDevice,
    ManagedContainer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AckState {
    Accepted,
    Applied,
    Rejected,
    Unknown,
    Duplicate,
    OutOfOrder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub protocol_version: String,
    pub profile: Profile,
    pub node_kind: NodeKind,
    pub runner_id: String,
    pub node_id: String,
    pub job_id: Option<String>,
    pub attempt_id: Option<String>,
    pub lease_id: Option<String>,
    pub fencing_version: Option<u64>,
    pub correlation_id: String,
    pub sequence: u64,
    pub idempotency_key: String,
    pub payload: Value,
    pub ack_state: Option<AckState>,
}

impl Envelope {
    pub fn new(
        node_kind: NodeKind,
        node_id: &str,
        job_id: Option<&str>,
        attempt_id: Option<&str>,
        lease_id: Option<&str>,
        payload: Value,
    ) -> Self {
        let profile = match node_kind {
            NodeKind::LocalDevice => Profile::LocalDevice,
            NodeKind::ManagedContainer => Profile::SharedContainer,
        };
        Self {
            protocol_version: PROTOCOL_VERSION.to_owned(),
            profile,
            node_kind,
            runner_id: node_id.to_owned(),
            node_id: node_id.to_owned(),
            job_id: job_id.map(str::to_owned),
            attempt_id: attempt_id.map(str::to_owned),
            lease_id: lease_id.map(str::to_owned),
            fencing_version: None,
            correlation_id: format!("runner:{node_id}"),
            sequence: 0,
            idempotency_key: format!("runner:{node_id}:0"),
            payload,
            ack_state: None,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err("unsupported protocol version".into());
        }
        if self.runner_id.trim().is_empty() || self.node_id.trim().is_empty() {
            return Err("runner identity is required".into());
        }
        if matches!(
            (self.profile, self.node_kind),
            (Profile::LocalDevice, NodeKind::ManagedContainer)
                | (Profile::SharedContainer, NodeKind::LocalDevice)
        ) {
            return Err("profile and node kind are incompatible".into());
        }
        if self.profile == Profile::SharedContainer
            && (self.job_id.is_none() || self.attempt_id.is_none() || self.lease_id.is_none())
        {
            return Err("shared container envelope requires job scope".into());
        }
        if self.idempotency_key.len() > 200 || self.correlation_id.len() > 160 {
            return Err("envelope identity is too long".into());
        }
        let encoded =
            serde_json::to_vec(&self.payload).map_err(|_| "payload is not serializable")?;
        if encoded.len() > 64 * 1024 {
            return Err("payload is too large".into());
        }
        if contains_secret_key(&self.payload) {
            return Err("payload contains a forbidden secret field".into());
        }
        Ok(())
    }
}

fn contains_secret_key(value: &Value) -> bool {
    const FORBIDDEN: &[&str] = &[
        "accessToken",
        "apiKey",
        "authorization",
        "credential",
        "password",
        "prompt",
        "refreshToken",
        "secret",
        "token",
    ];
    match value {
        Value::Object(map) => map
            .iter()
            .any(|(key, child)| FORBIDDEN.contains(&key.as_str()) || contains_secret_key(child)),
        Value::Array(items) => items.iter().any(contains_secret_key),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_profile_mismatch_and_secret_payload() {
        let mut envelope = Envelope::new(
            NodeKind::ManagedContainer,
            "node",
            Some("j"),
            Some("a"),
            Some("l"),
            serde_json::json!({"token": "secret"}),
        );
        assert!(envelope.validate().is_err());
        envelope.payload = serde_json::json!({"event": "ready"});
        envelope.profile = Profile::LocalDevice;
        assert!(envelope.validate().is_err());
    }

    #[test]
    fn serializes_wire_envelope_with_backend_camel_case_keys() {
        let envelope = Envelope::new(
            NodeKind::LocalDevice,
            "runner",
            None,
            None,
            None,
            serde_json::json!({"event": "ready"}),
        );
        let value = serde_json::to_value(envelope).unwrap();
        assert_eq!(
            value.get("protocolVersion").and_then(Value::as_str),
            Some(PROTOCOL_VERSION)
        );
        assert!(value.get("protocol_version").is_none());
        assert_eq!(
            value.get("nodeKind").and_then(Value::as_str),
            Some("local_device")
        );
        assert_eq!(
            value.get("idempotencyKey").and_then(Value::as_str),
            Some("runner:runner:0")
        );
    }
}
