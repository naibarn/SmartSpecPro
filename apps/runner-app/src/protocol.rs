use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: &str = "sah-runner-v1";
pub const RUNNER_JOB_COMMAND_CONTRACT_VERSION: &str = "runner-job-v1";

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RunnerJobReceiptEventType {
    CommandReceived,
    CommandAccepted,
    ExecutionStarted,
    Progress,
    EvidenceCreated,
    ExecutionCompleted,
    CommandRejected,
    ExecutionFailed,
    CancelAcknowledged,
    UnknownOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerJobCommand {
    pub command_id: String,
    pub command_type: String,
    pub contract_version: String,
    pub job_id: String,
    pub attempt: u32,
    pub lease_id: String,
    pub fencing_token: u64,
    pub tenant_id: String,
    pub user_id: Option<u64>,
    pub project_ref: Option<String>,
    pub workspace_ref: Option<String>,
    pub runner_id: String,
    pub runner_session_id: String,
    pub capability_snapshot_id: String,
    pub capability_snapshot_revision: String,
    pub control_plane_origin: String,
    pub execution_kind: String,
    pub adapter_id: String,
    pub adapter_version_constraint: Option<String>,
    pub browser_engine_constraint: Option<String>,
    pub idempotency_key: String,
    pub deadline: String,
    pub authorization_grant_ref: String,
    pub input_ref: String,
    pub payload: Value,
}

impl RunnerJobCommand {
    pub fn validate(&self) -> Result<(), String> {
        if self.command_id.trim().is_empty()
            || self.job_id.trim().is_empty()
            || self.lease_id.trim().is_empty()
            || self.tenant_id.trim().is_empty()
            || self.runner_id.trim().is_empty()
            || self.runner_session_id.trim().is_empty()
            || self.capability_snapshot_id.trim().is_empty()
            || self.capability_snapshot_revision.trim().is_empty()
            || self.control_plane_origin.trim().is_empty()
            || self.idempotency_key.trim().is_empty()
            || self.authorization_grant_ref.trim().is_empty()
            || self.input_ref.trim().is_empty()
        {
            return Err("RUNNER_COMMAND_IDENTITY_INVALID".into());
        }
        if self.contract_version != RUNNER_JOB_COMMAND_CONTRACT_VERSION {
            return Err("RUNNER_COMMAND_CONTRACT_UNSUPPORTED".into());
        }
        if self.command_type != "execute" && self.command_type != "cancel" {
            return Err("RUNNER_COMMAND_TYPE_INVALID".into());
        }
        if self.attempt == 0 || self.fencing_token == 0 {
            return Err("RUNNER_COMMAND_FENCE_INVALID".into());
        }
        let browser_command =
            self.execution_kind == "computer_use.browser" && self.adapter_id == "browser.v1";
        let external_agent_command = self.execution_kind == "external_agent_task"
            && matches!(self.adapter_id.as_str(), "codex.v1" | "claude.v1");
        if !browser_command && !external_agent_command {
            return Err("RUNNER_COMMAND_ADAPTER_UNSUPPORTED".into());
        }
        if contains_secret_key(&self.payload) {
            return Err("RUNNER_COMMAND_SECRET_FIELD".into());
        }
        if self.payload.get("requiresIndependentVerification") == Some(&serde_json::json!(true)) {
            let stage = self.payload.get("stage").and_then(Value::as_str);
            match stage {
                Some("observe") | Some("post_action_observe") => {
                    if self.payload.get("action").is_some()
                        || self.payload.get("targetId").is_some()
                        || self.payload.get("selector").is_some()
                    {
                        return Err("RUNNER_SEMANTIC_REQUEST_ACTION_FORBIDDEN".into());
                    }
                }
                Some("action") => {
                    let lineage = self
                        .payload
                        .get("lineage")
                        .and_then(Value::as_object)
                        .ok_or_else(|| "RUNNER_SEMANTIC_LINEAGE_REQUIRED".to_string())?;
                    for field in [
                        "observationId",
                        "observationRevision",
                        "browserGeneration",
                        "candidateSetId",
                        "candidateSetHash",
                        "decisionId",
                        "selectedCandidateId",
                        "policyDecisionId",
                        "actionId",
                        "actionType",
                        "targetRef",
                        "targetIdentity",
                    ] {
                        if lineage.get(field).is_none() {
                            return Err(format!("RUNNER_SEMANTIC_LINEAGE_{field}_REQUIRED"));
                        }
                    }
                }
                _ => return Err("RUNNER_SEMANTIC_STAGE_REQUIRED".into()),
            }
        }
        if serde_json::to_vec(&self.payload)
            .map_err(|_| "RUNNER_COMMAND_PAYLOAD_INVALID")?
            .len()
            > 64 * 1024
        {
            return Err("RUNNER_COMMAND_PAYLOAD_TOO_LARGE".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerJobReceipt {
    pub event_id: String,
    pub event_type: RunnerJobReceiptEventType,
    pub command_id: String,
    pub job_id: String,
    pub runner_id: String,
    pub runner_session_id: String,
    pub sequence: u64,
    pub observed_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_refs: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

impl RunnerJobReceipt {
    pub fn validate(&self) -> Result<(), String> {
        if self.event_id.trim().is_empty()
            || self.command_id.trim().is_empty()
            || self.job_id.trim().is_empty()
            || self.runner_id.trim().is_empty()
            || self.runner_session_id.trim().is_empty()
            || self.status.trim().is_empty()
            || self.sequence == 0
        {
            return Err("RUNNER_RECEIPT_INVALID".into());
        }
        if let Some(payload) = &self.payload {
            if contains_secret_key(payload) {
                return Err("RUNNER_RECEIPT_SECRET_FIELD".into());
            }
        }
        Ok(())
    }
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

    #[test]
    fn accepts_allowlisted_external_agent_command_without_accepting_mismatched_adapter() {
        let mut command = RunnerJobCommand {
            command_id: "command-1".into(),
            command_type: "execute".into(),
            contract_version: RUNNER_JOB_COMMAND_CONTRACT_VERSION.into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token: 1,
            tenant_id: "tenant-1".into(),
            user_id: Some(1),
            project_ref: None,
            workspace_ref: Some("workspace-1".into()),
            runner_id: "runner-1".into(),
            runner_session_id: "session-1".into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "http://localhost:3000".into(),
            execution_kind: "external_agent_task".into(),
            adapter_id: "codex.v1".into(),
            adapter_version_constraint: Some("0.1.0".into()),
            browser_engine_constraint: None,
            idempotency_key: "agent:task-1:plan:plan-1:1".into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "grant-1".into(),
            input_ref: "input-1".into(),
            payload: serde_json::json!({"taskId": "task-1"}),
        };
        assert!(command.validate().is_ok());
        command.adapter_id = "browser.v1".into();
        assert_eq!(
            command.validate().unwrap_err(),
            "RUNNER_COMMAND_ADAPTER_UNSUPPORTED"
        );
    }
}
