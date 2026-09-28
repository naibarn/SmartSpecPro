pub mod adapters;
pub mod config;
pub mod connection;
pub mod container;
pub mod control_channel;
pub mod device_proof;
pub mod diagnostics;
pub mod discovery;
pub mod execution;
pub mod external_agent;
pub mod identity;
pub mod journal;
pub mod leasing;
pub mod process;
pub mod protocol;
pub mod supervisor;
pub mod transport;
pub mod update;
pub mod workspace;

/// Release builds inject `SAH_RUNNER_BUILD_VERSION`; local builds use Cargo's
/// package version so the binary always reports a deterministic identity.
pub const RUNNER_VERSION: &str = match option_env!("SAH_RUNNER_BUILD_VERSION") {
    Some(version) => version,
    None => env!("CARGO_PKG_VERSION"),
};

pub const RUNNER_CONTROL_CONTRACT_VERSION: &str = "sah-runner-v1";
pub const RUNNER_CONNECT_SCHEMA_REVISION: &str = "sah-runner-connect-v2";
pub const MIN_COMPATIBLE_RUNNER_VERSION: &str = "0.1.0";

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
