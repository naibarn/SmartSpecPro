pub mod adapters;
pub mod config;
pub mod container;
pub mod control_channel;
pub mod device_proof;
pub mod diagnostics;
pub mod discovery;
pub mod execution;
pub mod identity;
pub mod journal;
pub mod leasing;
pub mod process;
pub mod protocol;
pub mod supervisor;
pub mod transport;
pub mod workspace;

#[cfg(test)]
mod tests {
    use crate::config::{RunnerConfig, RunnerProfile};
    use crate::protocol::{Envelope, NodeKind};

    #[test]
    fn shared_container_requires_job_scope() {
        let config = RunnerConfig::shared("node-1", "job-1", "attempt-1", "lease-1");
        assert_eq!(config.profile, RunnerProfile::SharedContainer);
        let envelope = Envelope::new(
            NodeKind::ManagedContainer,
            "node-1",
            Some("job-1"),
            Some("attempt-1"),
            Some("lease-1"),
            serde_json::json!({"event": "ready"}),
        );
        assert!(envelope.validate().is_ok());
    }
}
