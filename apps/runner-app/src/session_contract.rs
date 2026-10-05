use serde::{Deserialize, Serialize};

pub const SESSION_CONTRACT_VERSION: &str = "spec278-session-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Provisioning,
    Starting,
    Running,
    Disconnected,
    Recovering,
    Quiescing,
    Quiesced,
    Checkpointing,
    Completed,
    Failed,
    Cancelled,
    Incompatible,
    Unknown,
}

impl SessionState {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn permits_mutation(self) -> bool {
        self == Self::Running
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContinuityClass {
    ProcessPersistent,
    Reattachable,
    Checkpointable,
    Reconstructable,
    Ephemeral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EnforcementLevel {
    CommandOnly,
    ProcessPause,
    MediatedEffects,
    SandboxEnforced,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionSessionProjection {
    pub session_id: String,
    pub worker_job_id: String,
    pub worker_job_attempt: u32,
    pub lease_fencing_version: u64,
    pub tenant_id: String,
    pub runner_id: Option<String>,
    pub generation: u64,
    pub authority_epoch: u64,
    pub placement_epoch: u64,
    pub job_control_revision: u64,
    pub state: SessionState,
    pub continuity: ContinuityClass,
    pub enforcement: EnforcementLevel,
    pub driver_id: String,
}

impl ExecutionSessionProjection {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.session_id.trim().is_empty()
            || self.worker_job_id.trim().is_empty()
            || self.tenant_id.trim().is_empty()
            || self.driver_id.trim().is_empty()
        {
            return Err("RUNNER_SESSION_IDENTITY_INVALID");
        }
        if self.generation == 0 || self.worker_job_attempt == 0 || self.job_control_revision == 0 {
            return Err("RUNNER_SESSION_REVISION_INVALID");
        }
        if self.continuity == ContinuityClass::Ephemeral
            && self.enforcement == EnforcementLevel::SandboxEnforced
        {
            return Err("RUNNER_SESSION_ENFORCEMENT_CLAIM_INVALID");
        }
        Ok(())
    }

    pub fn transition(
        &mut self,
        expected_revision: u64,
        next: SessionState,
    ) -> Result<u64, &'static str> {
        if self.job_control_revision != expected_revision {
            return Err("RUNNER_SESSION_STALE_CONTROL_REVISION");
        }
        if !transition_allowed(self.state, next) {
            return Err("RUNNER_SESSION_TRANSITION_INVALID");
        }
        let next_revision = self
            .job_control_revision
            .checked_add(1)
            .ok_or("RUNNER_SESSION_REVISION_EXHAUSTED")?;
        self.state = next;
        self.job_control_revision = next_revision;
        Ok(next_revision)
    }
}

pub fn transition_allowed(from: SessionState, to: SessionState) -> bool {
    use SessionState::*;
    match from {
        Provisioning => matches!(to, Starting | Failed | Cancelled | Incompatible),
        Starting => matches!(to, Running | Failed | Cancelled | Incompatible | Unknown),
        Running => matches!(
            to,
            Disconnected | Quiescing | Checkpointing | Completed | Failed | Cancelled | Unknown
        ),
        Disconnected => matches!(
            to,
            Recovering | Quiescing | Quiesced | Failed | Cancelled | Unknown
        ),
        Recovering => matches!(
            to,
            Running
                | Disconnected
                | Quiescing
                | Quiesced
                | Incompatible
                | Failed
                | Cancelled
                | Unknown
        ),
        Quiescing => matches!(to, Quiesced | Recovering | Failed | Cancelled | Unknown),
        Quiesced => matches!(
            to,
            Recovering | Checkpointing | Failed | Cancelled | Incompatible
        ),
        Checkpointing => matches!(to, Running | Quiesced | Failed | Cancelled | Unknown),
        Unknown => matches!(
            to,
            Recovering | Quiescing | Quiesced | Failed | Cancelled | Incompatible
        ),
        Completed | Failed | Cancelled | Incompatible => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> ExecutionSessionProjection {
        ExecutionSessionProjection {
            session_id: "ses-1".into(),
            worker_job_id: "job-1".into(),
            worker_job_attempt: 1,
            lease_fencing_version: 2,
            tenant_id: "tenant-1".into(),
            runner_id: Some("runner-1".into()),
            generation: 1,
            authority_epoch: 1,
            placement_epoch: 1,
            job_control_revision: 1,
            state: SessionState::Provisioning,
            continuity: ContinuityClass::Reattachable,
            enforcement: EnforcementLevel::ProcessPause,
            driver_id: "local.pty.v1".into(),
        }
    }

    #[test]
    fn state_transition_advances_revision_and_rejects_stale_writer() {
        let mut value = session();
        assert_eq!(value.transition(1, SessionState::Starting), Ok(2));
        assert_eq!(
            value.transition(1, SessionState::Running),
            Err("RUNNER_SESSION_STALE_CONTROL_REVISION")
        );
    }

    #[test]
    fn terminal_state_cannot_be_resurrected() {
        assert!(!transition_allowed(
            SessionState::Completed,
            SessionState::Recovering
        ));
        assert!(!transition_allowed(
            SessionState::Failed,
            SessionState::Running
        ));
    }

    #[test]
    fn continuity_and_enforcement_claims_are_validated() {
        let mut value = session();
        assert!(value.validate().is_ok());
        value.continuity = ContinuityClass::Ephemeral;
        value.enforcement = EnforcementLevel::SandboxEnforced;
        assert_eq!(
            value.validate(),
            Err("RUNNER_SESSION_ENFORCEMENT_CLAIM_INVALID")
        );
    }
}
