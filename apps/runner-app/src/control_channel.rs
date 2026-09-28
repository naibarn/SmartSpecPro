use std::collections::{HashMap, HashSet};

use crate::protocol::{AckState, Envelope, RunnerJobCommand, RunnerJobReceipt};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelState {
    Disconnected,
    Connecting,
    Connected,
    Reconciling,
    Failed,
}

#[derive(Debug, Clone)]
pub struct ControlChannel {
    pub state: ChannelState,
    next_sequence: u64,
    last_remote_sequence: Option<u64>,
    execution_binding: Option<RunnerExecutionBinding>,
    accepted_commands: HashSet<String>,
    idempotency_commands: HashMap<String, String>,
    highest_fencing_by_job: HashMap<String, u64>,
    semantic_observations: HashMap<String, SemanticObservationBinding>,
    external_agent_adapters: HashSet<String>,
    external_agent_authorization_refs: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SemanticObservationBinding {
    observation_id: String,
    revision: u64,
    browser_generation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunnerExecutionBinding {
    pub runner_id: String,
    pub tenant_id: String,
    pub runner_session_id: String,
    pub capability_snapshot_id: String,
    pub capability_snapshot_revision: String,
    pub control_plane_origin: String,
    pub capability_expires_at: String,
    pub browser_ready: bool,
    pub authorization_grant_ref: String,
}

impl Default for ControlChannel {
    fn default() -> Self {
        Self {
            state: ChannelState::Disconnected,
            next_sequence: 0,
            last_remote_sequence: None,
            execution_binding: None,
            accepted_commands: HashSet::new(),
            idempotency_commands: HashMap::new(),
            highest_fencing_by_job: HashMap::new(),
            semantic_observations: HashMap::new(),
            external_agent_adapters: HashSet::new(),
            external_agent_authorization_refs: HashMap::new(),
        }
    }
}

impl ControlChannel {
    pub fn connect(&mut self) {
        self.state = ChannelState::Connecting;
    }
    pub fn authenticated(&mut self) {
        self.state = ChannelState::Connected;
    }
    pub fn reconnect(&mut self) {
        self.state = ChannelState::Reconciling;
        self.execution_binding = None;
        self.accepted_commands.clear();
        self.idempotency_commands.clear();
        self.highest_fencing_by_job.clear();
        self.semantic_observations.clear();
        self.external_agent_adapters.clear();
        self.external_agent_authorization_refs.clear();
    }

    pub fn bind_execution(&mut self, binding: RunnerExecutionBinding) {
        if self.execution_binding.as_ref() != Some(&binding) {
            self.accepted_commands.clear();
            self.idempotency_commands.clear();
            self.highest_fencing_by_job.clear();
            self.semantic_observations.clear();
            self.external_agent_adapters.clear();
        }
        self.execution_binding = Some(binding);
    }

    pub fn bind_external_agent_adapters(&mut self, adapters: Vec<String>) {
        self.external_agent_adapters = adapters.into_iter().collect();
    }

    pub fn bind_external_agent_authorization_refs(&mut self, refs: Vec<(String, String)>) {
        self.external_agent_authorization_refs = refs.into_iter().collect();
        self.external_agent_adapters
            .extend(self.external_agent_authorization_refs.keys().cloned());
    }
    pub fn next_event(&mut self, mut envelope: Envelope) -> Result<Envelope, String> {
        if self.state != ChannelState::Connected && self.state != ChannelState::Reconciling {
            return Err("control channel is not connected".into());
        }
        envelope.sequence = self.next_sequence;
        self.next_sequence += 1;
        envelope.idempotency_key = format!("{}:{}", envelope.correlation_id, envelope.sequence);
        envelope.validate()?;
        Ok(envelope)
    }
    pub fn accept_remote(&mut self, envelope: &Envelope) -> AckState {
        if let Some(last_sequence) = self.last_remote_sequence {
            if envelope.sequence < last_sequence {
                return AckState::OutOfOrder;
            }
            if envelope.sequence == last_sequence {
                return AckState::Duplicate;
            }
        }
        self.last_remote_sequence = Some(envelope.sequence);
        AckState::Applied
    }

    pub fn accept_job_command(
        &mut self,
        command: &RunnerJobCommand,
        now_iso: &str,
    ) -> Result<AckState, String> {
        command.validate()?;
        let binding = self
            .execution_binding
            .as_ref()
            .ok_or_else(|| "RUNNER_EXECUTION_BINDING_REQUIRED".to_string())?;
        if command.runner_id != binding.runner_id {
            return Err("RUNNER_ID_MISMATCH".into());
        }
        if command.tenant_id != binding.tenant_id {
            return Err("RUNNER_TENANT_MISMATCH".into());
        }
        if command.runner_session_id != binding.runner_session_id {
            return Err("RUNNER_SESSION_STALE".into());
        }
        if command.control_plane_origin != binding.control_plane_origin {
            return Err("RUNNER_CONTROL_PLANE_MISMATCH".into());
        }
        if command.capability_snapshot_id != binding.capability_snapshot_id
            || command.capability_snapshot_revision != binding.capability_snapshot_revision
        {
            return Err("RUNNER_CAPABILITY_SNAPSHOT_STALE".into());
        }
        if command.execution_kind == "computer_use.browser" {
            if !binding.browser_ready {
                return Err("RUNNER_BROWSER_NOT_READY".into());
            }
        } else if command.execution_kind == "external_agent_task"
            && !self.external_agent_adapters.contains(&command.adapter_id)
        {
            return Err("RUNNER_EXTERNAL_AGENT_NOT_READY".into());
        }
        if binding.capability_expires_at.as_str() <= now_iso || command.deadline.as_str() <= now_iso
        {
            return Err("RUNNER_COMMAND_DEADLINE_EXPIRED".into());
        }
        if command.execution_kind == "external_agent_task" {
            let expected_grant = self
                .external_agent_authorization_refs
                .get(&command.adapter_id)
                .map(String::as_str)
                .unwrap_or(binding.authorization_grant_ref.as_str());
            if expected_grant != command.authorization_grant_ref {
                return Err("RUNNER_AUTHORIZATION_GRANT_MISMATCH".into());
            }
        } else if command.authorization_grant_ref != binding.authorization_grant_ref {
            return Err("RUNNER_AUTHORIZATION_GRANT_MISMATCH".into());
        }
        if command.payload.get("requiresIndependentVerification") == Some(&serde_json::json!(true))
        {
            let stage = command
                .payload
                .get("stage")
                .and_then(serde_json::Value::as_str);
            match stage {
                Some("observe") | Some("post_action_observe") => {
                    if command.payload.get("action").is_some()
                        || command.payload.get("targetId").is_some()
                        || command.payload.get("selector").is_some()
                    {
                        return Err("RUNNER_SEMANTIC_REQUEST_ACTION_FORBIDDEN".into());
                    }
                }
                Some("action") => {
                    let lineage = command
                        .payload
                        .get("lineage")
                        .and_then(serde_json::Value::as_object)
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
                    let current = self
                        .semantic_observations
                        .get(&command.job_id)
                        .ok_or_else(|| "RUNNER_SEMANTIC_OBSERVATION_REQUIRED".to_string())?;
                    if lineage
                        .get("observationId")
                        .and_then(serde_json::Value::as_str)
                        != Some(current.observation_id.as_str())
                        || lineage
                            .get("observationRevision")
                            .and_then(serde_json::Value::as_u64)
                            != Some(current.revision)
                        || lineage
                            .get("browserGeneration")
                            .and_then(serde_json::Value::as_str)
                            != Some(current.browser_generation.as_str())
                    {
                        return Err("RUNNER_SEMANTIC_OBSERVATION_STALE".into());
                    }
                }
                _ => return Err("RUNNER_SEMANTIC_STAGE_REQUIRED".into()),
            }
        }
        if let Some(existing) = self.idempotency_commands.get(&command.idempotency_key) {
            return Ok(if existing == &command.command_id {
                AckState::Duplicate
            } else {
                return Err("RUNNER_COMMAND_REPLAY".into());
            });
        }
        if let Some(highest) = self.highest_fencing_by_job.get(&command.job_id) {
            if command.fencing_token < *highest {
                return Err("RUNNER_LEASE_FENCE_STALE".into());
            }
        }
        self.idempotency_commands
            .insert(command.idempotency_key.clone(), command.command_id.clone());
        self.accepted_commands.insert(command.command_id.clone());
        self.highest_fencing_by_job
            .insert(command.job_id.clone(), command.fencing_token);
        Ok(AckState::Accepted)
    }

    pub fn record_semantic_observation(
        &mut self,
        command: &RunnerJobCommand,
        observation: &serde_json::Value,
    ) -> Result<(), String> {
        let stage = command
            .payload
            .get("stage")
            .and_then(serde_json::Value::as_str);
        if !matches!(stage, Some("observe") | Some("post_action_observe")) {
            return Ok(());
        }
        let observation_id = observation
            .get("observationId")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "RUNNER_SEMANTIC_OBSERVATION_ID_REQUIRED".to_string())?;
        let revision = observation
            .get("revision")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "RUNNER_SEMANTIC_OBSERVATION_REVISION_REQUIRED".to_string())?;
        let browser_generation = observation
            .get("browserGeneration")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "RUNNER_SEMANTIC_BROWSER_GENERATION_REQUIRED".to_string())?;
        self.semantic_observations.insert(
            command.job_id.clone(),
            SemanticObservationBinding {
                observation_id: observation_id.to_string(),
                revision,
                browser_generation: browser_generation.to_string(),
            },
        );
        Ok(())
    }

    pub fn build_receipt(
        &mut self,
        node_kind: crate::protocol::NodeKind,
        command: &RunnerJobCommand,
        receipt: RunnerJobReceipt,
    ) -> Result<Envelope, String> {
        receipt.validate()?;
        let mut envelope = Envelope::new(
            node_kind,
            &command.runner_id,
            Some(&command.job_id),
            None,
            Some(&command.lease_id),
            serde_json::json!({ "type": "runner.job.receipt", "receipt": receipt }),
        );
        envelope.correlation_id = command.command_id.clone();
        self.next_event(envelope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Envelope, NodeKind, RunnerJobCommand};

    fn browser_command(session: &str, fencing_token: u64) -> RunnerJobCommand {
        RunnerJobCommand {
            command_id: "command-1".into(),
            command_type: "execute".into(),
            contract_version: "runner-job-v1".into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token,
            tenant_id: "tenant-1".into(),
            user_id: Some(1),
            project_ref: None,
            workspace_ref: None,
            runner_id: "runner-1".into(),
            runner_session_id: session.into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            execution_kind: "computer_use.browser".into(),
            adapter_id: "browser.v1".into(),
            adapter_version_constraint: Some("0.1.0".into()),
            browser_engine_constraint: Some("chromium".into()),
            idempotency_key: "idem-1".into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "runner-auth:sha256:grant".into(),
            input_ref: "runner-input:sha256:input".into(),
            payload: serde_json::json!({"operation":"observe"}),
        }
    }

    fn binding(session: &str) -> RunnerExecutionBinding {
        RunnerExecutionBinding {
            runner_id: "runner-1".into(),
            tenant_id: "tenant-1".into(),
            runner_session_id: session.into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            capability_expires_at: "2099-01-01T00:00:00.000Z".into(),
            browser_ready: true,
            authorization_grant_ref: "runner-auth:sha256:grant".into(),
        }
    }

    #[test]
    fn accepts_external_agent_only_after_adapter_capability_binding() {
        let mut channel = ControlChannel::default();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));
        let mut command = browser_command("session-1", 1);
        command.execution_kind = "external_agent_task".into();
        command.adapter_id = "codex.v1".into();
        assert_eq!(
            channel.accept_job_command(&command, "2026-09-20T16:00:00.000Z"),
            Err("RUNNER_EXTERNAL_AGENT_NOT_READY".into())
        );
        channel.bind_external_agent_adapters(vec!["codex.v1".into()]);
        assert_eq!(
            channel.accept_job_command(&command, "2026-09-20T16:00:00.000Z"),
            Ok(AckState::Accepted)
        );
    }

    #[test]
    fn receipt_optional_result_fields_use_scalar_wire_values() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        let command = browser_command("session-1", 1);
        let receipt = RunnerJobReceipt {
            event_id: "receipt-1".into(),
            event_type: crate::protocol::RunnerJobReceiptEventType::EvidenceCreated,
            command_id: command.command_id.clone(),
            job_id: command.job_id.clone(),
            runner_id: command.runner_id.clone(),
            runner_session_id: command.runner_session_id.clone(),
            sequence: 1,
            observed_at: "2026-09-20T17:00:00.000Z".into(),
            status: "evidence".into(),
            result_ref: Some("result:sha256:abc".into()),
            evidence_refs: Some(vec!["observation:sha256:def".into()]),
            error_code: None,
            error_summary: None,
            correlation: None,
            payload: None,
        };

        let envelope = channel
            .build_receipt(NodeKind::LocalDevice, &command, receipt)
            .unwrap();
        let wire_receipt = envelope.payload.get("receipt").unwrap();

        assert!(wire_receipt.get("resultRef").unwrap().is_string());
        assert!(wire_receipt.get("evidenceRefs").unwrap().is_array());
        assert!(wire_receipt.get("errorCode").is_none());
        assert!(wire_receipt.get("errorSummary").is_none());
        assert!(wire_receipt.get("correlation").is_none());
        assert!(wire_receipt.get("payload").is_none());
    }

    #[test]
    fn rejects_a_command_from_a_different_control_plane() {
        let mut channel = ControlChannel::default();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));
        let mut command = browser_command("session-1", 1);
        command.control_plane_origin = "https://other.example.test".into();
        assert_eq!(
            channel
                .accept_job_command(&command, "2026-09-21T00:00:00.000Z")
                .unwrap_err(),
            "RUNNER_CONTROL_PLANE_MISMATCH"
        );
    }

    #[test]
    fn channel_requires_auth_and_deduplicates_sequence() {
        let mut channel = ControlChannel::default();
        let event = Envelope::new(
            NodeKind::LocalDevice,
            "r",
            None,
            None,
            None,
            serde_json::json!({"event":"ready"}),
        );
        assert!(channel.next_event(event.clone()).is_err());
        channel.connect();
        channel.authenticated();
        let event = channel.next_event(event).unwrap();
        assert_eq!(event.idempotency_key, "runner:r:0");
        assert_eq!(channel.accept_remote(&event), AckState::Applied);
        assert_eq!(channel.accept_remote(&event), AckState::Duplicate);
    }

    #[test]
    fn job_commands_are_fenced_to_current_session_snapshot_and_idempotency() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));
        let command = browser_command("session-1", 2);
        assert_eq!(
            channel
                .accept_job_command(&command, "2026-09-20T16:00:00.000Z")
                .unwrap(),
            AckState::Accepted
        );
        assert_eq!(
            channel
                .accept_job_command(&command, "2026-09-20T16:00:00.000Z")
                .unwrap(),
            AckState::Duplicate
        );
        assert_eq!(
            channel
                .accept_job_command(
                    &browser_command("old-session", 3),
                    "2026-09-20T16:00:00.000Z"
                )
                .unwrap_err(),
            "RUNNER_SESSION_STALE"
        );
        let mut stale_fenced = browser_command("session-1", 1);
        stale_fenced.command_id = "command-stale-fence".into();
        stale_fenced.idempotency_key = "idem-stale-fence".into();
        assert_eq!(
            channel
                .accept_job_command(&stale_fenced, "2026-09-20T16:00:00.000Z")
                .unwrap_err(),
            "RUNNER_LEASE_FENCE_STALE"
        );
    }

    #[test]
    fn job_commands_fail_closed_when_browser_is_not_ready() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        let mut execution_binding = binding("session-1");
        execution_binding.browser_ready = false;
        channel.bind_execution(execution_binding);
        assert_eq!(
            channel
                .accept_job_command(&browser_command("session-1", 1), "2026-09-20T16:00:00.000Z")
                .unwrap_err(),
            "RUNNER_BROWSER_NOT_READY"
        );
    }

    #[test]
    fn reconnect_invalidates_previous_execution_binding() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));
        channel
            .accept_job_command(&browser_command("session-1", 1), "2026-09-20T16:00:00.000Z")
            .unwrap();
        channel.reconnect();
        assert_eq!(
            channel
                .accept_job_command(&browser_command("session-1", 2), "2026-09-20T16:00:00.000Z")
                .unwrap_err(),
            "RUNNER_EXECUTION_BINDING_REQUIRED"
        );
    }

    #[test]
    fn semantic_action_requires_fresh_backend_lineage_and_observation() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));

        let mut observe = browser_command("session-1", 1);
        observe.command_id = "observe-1".into();
        observe.idempotency_key = "observe-idem-1".into();
        observe.payload = serde_json::json!({
            "stage": "observe",
            "requiresIndependentVerification": true,
            "observationRequest": { "goal": "click Continue" }
        });
        assert_eq!(
            channel
                .accept_job_command(&observe, "2026-09-20T16:00:00.000Z")
                .unwrap(),
            AckState::Accepted
        );
        channel
            .record_semantic_observation(
                &observe,
                &serde_json::json!({
                    "observationId": "observation-1",
                    "revision": 1,
                    "browserGeneration": "browser-generation-1"
                }),
            )
            .unwrap();

        // OBSERVE and ACTION are separate commands under the same canonical
        // job lease. The lease fence must remain stable across that semantic
        // sequence; only a newer lease fence supersedes it.
        let mut action = browser_command("session-1", 1);
        action.command_id = "action-1".into();
        action.idempotency_key = "action-idem-1".into();
        action.payload = serde_json::json!({
            "stage": "action",
            "requiresIndependentVerification": true,
            "lineage": {
                "observationId": "observation-1",
                "observationRevision": 1,
                "browserGeneration": "browser-generation-1",
                "candidateSetId": "candidate-set-1",
                "candidateSetHash": "candidate-set:sha256:1",
                "decisionId": "decision-1",
                "selectedCandidateId": "candidate-1",
                "policyDecisionId": "policy-1",
                "actionId": "action-1",
                "actionType": "click",
                "targetRef": "candidate-0",
                "targetIdentity": "https://smartaihub.app|main|candidate-0",
                "parameters": {}
            }
        });
        assert_eq!(
            channel
                .accept_job_command(&action, "2026-09-20T16:00:00.000Z")
                .unwrap(),
            AckState::Accepted
        );

        let mut stale = action.clone();
        stale.command_id = "action-stale".into();
        stale.idempotency_key = "action-stale-idem".into();
        stale.payload["lineage"]["observationRevision"] = serde_json::json!(2);
        assert_eq!(
            channel.accept_job_command(&stale, "2026-09-20T16:00:00.000Z"),
            Err("RUNNER_SEMANTIC_OBSERVATION_STALE".into())
        );
    }

    #[test]
    fn semantic_observe_rejects_request_carried_action() {
        let mut channel = ControlChannel::default();
        channel.connect();
        channel.authenticated();
        channel.bind_execution(binding("session-1"));
        let mut observe = browser_command("session-1", 1);
        observe.payload = serde_json::json!({
            "stage": "observe",
            "requiresIndependentVerification": true,
            "action": "click",
            "observationRequest": { "goal": "click Continue" }
        });
        assert_eq!(
            channel.accept_job_command(&observe, "2026-09-20T16:00:00.000Z"),
            Err("RUNNER_SEMANTIC_REQUEST_ACTION_FORBIDDEN".into())
        );
    }
}
