use std::collections::{HashMap, HashSet};

use crate::{
    adapters::{build_process_spec, can_execute, ADAPTERS},
    discovery::ToolCandidate,
    leasing::Lease,
    process::{ManagedProcess, ProcessHost},
    workspace::WorkspacePolicy,
};

#[derive(Debug, Clone)]
pub struct ExecutionRequest {
    pub lease: Lease,
    pub adapter_id: String,
    pub workspace_ref: String,
    pub mcp_grant: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionState {
    Started,
    WaitingExternal,
    Completed,
    Unknown,
}

pub struct ExecutionEngine {
    started: HashSet<String>,
    submitted_external: HashSet<String>,
    processes: HashMap<String, ManagedProcess>,
}

impl Default for ExecutionEngine {
    fn default() -> Self {
        Self {
            started: HashSet::new(),
            submitted_external: HashSet::new(),
            processes: HashMap::new(),
        }
    }
}

impl ExecutionEngine {
    fn scope(request: &ExecutionRequest) -> String {
        format!(
            "{}:{}:{}",
            request.lease.job_id, request.lease.attempt_id, request.lease.fencing_version
        )
    }

    pub fn start(
        &mut self,
        request: &ExecutionRequest,
        now_ms: u64,
        expected_lease: &Lease,
        workspace: &WorkspacePolicy,
    ) -> Result<ExecutionState, String> {
        request.lease.validate(now_ms, expected_lease)?;
        if !ADAPTERS
            .iter()
            .any(|adapter| adapter.id == request.adapter_id && adapter.allowed)
        {
            return Err("RUNNER_ADAPTER_NOT_APPROVED".into());
        }
        workspace.resolve(&request.workspace_ref)?;
        if request.adapter_id.contains("mcp")
            && request.mcp_grant.as_deref().unwrap_or("").is_empty()
        {
            return Err("RUNNER_MCP_GRANT_REQUIRED".into());
        }
        let scope = Self::scope(request);
        if !self.started.insert(scope.clone()) {
            return Err("RUNNER_EXECUTION_DUPLICATE".into());
        }
        if request.adapter_id.contains("external") {
            if !self.submitted_external.insert(scope) {
                return Err("RUNNER_EXTERNAL_SUBMISSION_DUPLICATE".into());
            }
            return Ok(ExecutionState::WaitingExternal);
        }
        Ok(ExecutionState::Started)
    }

    pub fn start_process(
        &mut self,
        request: &ExecutionRequest,
        candidate: &ToolCandidate,
        args: &[String],
        now_ms: u64,
        expected_lease: &Lease,
        workspace: &WorkspacePolicy,
        host: &mut dyn ProcessHost,
    ) -> Result<ExecutionState, String> {
        if candidate.adapter_id.as_deref() != Some(request.adapter_id.as_str()) {
            return Err("RUNNER_ADAPTER_CANDIDATE_MISMATCH".into());
        }
        if !can_execute(candidate) {
            return Err("RUNNER_ADAPTER_NOT_READY".into());
        }
        let scope = Self::scope(request);
        let state = self.start(request, now_ms, expected_lease, workspace)?;
        let process_workspace = if workspace.root.is_dir() {
            workspace.root.clone()
        } else {
            self.started.remove(&scope);
            return Err("RUNNER_PROCESS_WORKSPACE_INVALID".into());
        };
        let spec = match build_process_spec(candidate, &process_workspace, args) {
            Ok(spec) => spec,
            Err(error) => {
                self.started.remove(&scope);
                return Err(error);
            }
        };
        let process = match ManagedProcess::start(host, &spec) {
            Ok(process) => process,
            Err(error) => {
                self.started.remove(&scope);
                return Err(error);
            }
        };
        self.processes.insert(scope, process);
        Ok(state)
    }

    pub fn process_status(&mut self, request: &ExecutionRequest) -> Result<Option<i32>, String> {
        self.processes
            .get_mut(&Self::scope(request))
            .ok_or_else(|| "RUNNER_PROCESS_NOT_FOUND".to_string())?
            .try_status()
    }

    pub fn cancel_process(&mut self, request: &ExecutionRequest) -> Result<(), String> {
        let scope = Self::scope(request);
        let Some(mut process) = self.processes.remove(&scope) else {
            return Err("RUNNER_PROCESS_NOT_FOUND".into());
        };
        process.cancel()?;
        self.started.remove(&scope);
        Ok(())
    }

    pub fn complete(
        &self,
        request: &ExecutionRequest,
        now_ms: u64,
        expected_lease: &Lease,
        artifact_verified: bool,
    ) -> Result<ExecutionState, String> {
        request.lease.validate(now_ms, expected_lease)?;
        if !artifact_verified {
            return Err("RUNNER_ARTIFACT_VERIFICATION_REQUIRED".into());
        }
        Ok(ExecutionState::Completed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> (ExecutionRequest, Lease, WorkspacePolicy) {
        let lease = Lease {
            job_id: "job".into(),
            attempt_id: "attempt".into(),
            lease_id: "lease".into(),
            fencing_version: 1,
            expires_at_ms: 100,
        };
        (
            ExecutionRequest {
                lease: lease.clone(),
                adapter_id: "codex.v1".into(),
                workspace_ref: "input/file.txt".into(),
                mcp_grant: None,
            },
            lease,
            WorkspacePolicy {
                root: "/tmp/job".into(),
                allowed_refs: vec!["input/file.txt".into()],
            },
        )
    }
    #[test]
    fn starts_once_and_requires_verified_artifact() {
        let (request, lease, workspace) = request();
        let mut engine = ExecutionEngine::default();
        assert_eq!(
            engine.start(&request, 1, &lease, &workspace).unwrap(),
            ExecutionState::Started
        );
        assert!(engine.start(&request, 1, &lease, &workspace).is_err());
        assert!(engine.complete(&request, 1, &lease, false).is_err());
        assert_eq!(
            engine.complete(&request, 1, &lease, true).unwrap(),
            ExecutionState::Completed
        );
    }
    #[test]
    fn stale_lease_and_unapproved_mcp_fail_closed() {
        let (mut request, lease, workspace) = request();
        request.adapter_id = "unknown.v1".into();
        let mut engine = ExecutionEngine::default();
        assert!(engine.start(&request, 1, &lease, &workspace).is_err());
        request.adapter_id = "mcp.v1".into();
        assert!(engine.start(&request, 1, &lease, &workspace).is_err());
        let mut stale = lease.clone();
        stale.fencing_version = 0;
        request.adapter_id = "codex.v1".into();
        request.lease = stale;
        assert!(engine.start(&request, 1, &lease, &workspace).is_err());
    }

    #[test]
    fn approved_candidate_starts_a_scoped_process_and_cancels_it() {
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("codex");
        std::fs::write(&executable, b"placeholder").unwrap();
        let mut candidate = crate::discovery::scan_path_entries(
            crate::config::RunnerProfile::LocalDevice,
            &[temp.path().to_path_buf()],
        )
        .into_iter()
        .find(|tool| tool.tool_id == "codex")
        .unwrap();
        crate::adapters::apply_probe(
            &mut candidate,
            crate::adapters::AdapterProbeResult {
                version: "1.0".into(),
                authenticated: true,
                healthy: true,
                available: true,
                reason_codes: vec!["probe_ok".into()],
            },
        )
        .unwrap();
        let (request, lease, _) = request();
        let workspace = WorkspacePolicy {
            root: temp.path().to_path_buf(),
            allowed_refs: vec!["input/file.txt".into()],
        };
        let mut engine = ExecutionEngine::default();
        let terminated = std::sync::Arc::new(std::sync::Mutex::new(false));
        let mut host = FakeHost {
            terminated: terminated.clone(),
        };
        assert_eq!(
            engine
                .start_process(
                    &request,
                    &candidate,
                    &["--version".into()],
                    1,
                    &lease,
                    &workspace,
                    &mut host,
                )
                .unwrap(),
            ExecutionState::Started
        );
        engine.cancel_process(&request).unwrap();
        assert!(*terminated.lock().unwrap());
    }

    struct FakeHandle {
        terminated: std::sync::Arc<std::sync::Mutex<bool>>,
    }

    impl crate::process::ProcessHandle for FakeHandle {
        fn try_status(&mut self) -> Result<Option<i32>, String> {
            Ok(None)
        }

        fn terminate(&mut self) -> Result<(), String> {
            *self.terminated.lock().unwrap() = true;
            Ok(())
        }
    }

    struct FakeHost {
        terminated: std::sync::Arc<std::sync::Mutex<bool>>,
    }

    impl crate::process::ProcessHost for FakeHost {
        fn spawn(
            &mut self,
            _spec: &crate::process::ProcessSpec,
        ) -> Result<Box<dyn crate::process::ProcessHandle>, String> {
            Ok(Box::new(FakeHandle {
                terminated: self.terminated.clone(),
            }))
        }
    }
}
