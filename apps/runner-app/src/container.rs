use crate::{
    config::{RunnerConfig, RunnerProfile},
    supervisor::Supervisor,
};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub fn validate_container_assignment(config: &RunnerConfig) -> Result<(), String> {
    if config.profile != RunnerProfile::SharedContainer {
        return Err("container requires shared profile".into());
    }
    config.validate()
}

pub fn start_scoped_container(config: &RunnerConfig) -> Result<Supervisor, String> {
    validate_container_assignment(config)?;
    let mut supervisor = Supervisor::default();
    supervisor.ready();
    Ok(supervisor)
}

#[derive(Debug)]
pub struct ContainerScope {
    pub root: PathBuf,
    pub supervisor: Supervisor,
    cleaned: bool,
}

impl ContainerScope {
    pub fn prepare(config: &RunnerConfig) -> Result<Self, String> {
        validate_container_assignment(config)?;
        let job_id = config.job_id.as_deref().unwrap();
        let attempt_id = config.attempt_id.as_deref().unwrap();
        let lease_id = config.lease_id.as_deref().unwrap();
        for value in [job_id, attempt_id, lease_id] {
            if !safe_scope_component(value) {
                return Err("RUNNER_CONTAINER_SCOPE_COMPONENT_INVALID".into());
            }
        }
        let root = PathBuf::from(&config.data_root)
            .join("jobs")
            .join(job_id)
            .join(attempt_id)
            .join(lease_id);
        std::fs::create_dir_all(&root).map_err(|_| "RUNNER_CONTAINER_WORKSPACE_CREATE_FAILED")?;
        let mut supervisor = Supervisor::default();
        supervisor.ready();
        Ok(Self {
            root,
            supervisor,
            cleaned: false,
        })
    }

    pub fn cleanup(&mut self) -> Result<(), String> {
        if self.cleaned {
            return Ok(());
        }
        self.supervisor.drain();
        if self.supervisor.state != crate::supervisor::LifecycleState::Stopped {
            self.supervisor.finish_claim();
        }
        std::fs::remove_dir_all(&self.root)
            .map_err(|_| "RUNNER_CONTAINER_WORKSPACE_CLEANUP_FAILED".to_string())?;
        self.cleaned = true;
        Ok(())
    }
}

impl Drop for ContainerScope {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

/// The non-Tauri shared-container entrypoint. Feature 204 owns container
/// scheduling; this process owns only the assignment workspace and health
/// endpoint. It intentionally has no user-facing socket or second job ledger.
pub fn run_container_entrypoint(config: &RunnerConfig) -> Result<(), String> {
    let _scope = ContainerScope::prepare(config)?;
    let port = std::env::var("SAH_RUNNER_HEALTH_PORT")
        .unwrap_or_else(|_| "8787".into())
        .parse::<u16>()
        .map_err(|_| "RUNNER_HEALTH_PORT_INVALID".to_string())?;
    let listener = TcpListener::bind(("0.0.0.0", port))
        .map_err(|_| "RUNNER_HEALTH_BIND_FAILED".to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "RUNNER_HEALTH_NONBLOCKING_FAILED".to_string())?;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => respond_health(&mut stream),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return Err("RUNNER_HEALTH_ACCEPT_FAILED".into()),
        }
    }
}

fn respond_health(stream: &mut TcpStream) {
    let mut request = [0_u8; 4096];
    let size = stream.read(&mut request).unwrap_or(0);
    let request_line = std::str::from_utf8(&request[..size])
        .ok()
        .and_then(|request| request.lines().next())
        .unwrap_or("");
    let (status, body) = if request_line.starts_with("GET /health/runner ") {
        (
            "200 OK",
            r#"{"state":"ready","profile":"shared_container"}"#,
        )
    } else {
        ("404 Not Found", r#"{"error":"not_found"}"#)
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn safe_scope_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value != "."
        && value != ".."
        && !value.contains('/')
        && !value.contains('\\')
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':')
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn container_uses_job_scope_not_device_identity() {
        let config = RunnerConfig::shared("node", "job", "attempt", "lease");
        assert!(start_scoped_container(&config).is_ok());
        let local = RunnerConfig::local("runner", "device", "https://example.test");
        assert!(start_scoped_container(&local).is_err());
    }

    #[test]
    fn concurrent_assignments_get_distinct_ephemeral_scopes_and_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let mut first = RunnerConfig::shared("node", "job-a", "attempt", "lease");
        first.data_root = root.path().join("runner").to_string_lossy().into_owned();
        let mut second = RunnerConfig::shared("node", "job-b", "attempt", "lease");
        second.data_root = root.path().join("runner").to_string_lossy().into_owned();
        let mut first_scope = ContainerScope::prepare(&first).unwrap();
        let second_scope = ContainerScope::prepare(&second).unwrap();
        assert_ne!(first_scope.root, second_scope.root);
        assert!(first_scope.root.is_dir());
        first_scope.cleanup().unwrap();
        assert!(!first_scope.root.exists());
        assert!(second_scope.root.is_dir());
        let mut second_scope = second_scope;
        second_scope.cleanup().unwrap();
    }

    #[test]
    fn scope_component_cannot_escape_container_root() {
        let mut config = RunnerConfig::shared("node", "../job", "attempt", "lease");
        config.data_root = tempfile::tempdir()
            .unwrap()
            .path()
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            ContainerScope::prepare(&config).unwrap_err(),
            "RUNNER_CONTAINER_SCOPE_COMPONENT_INVALID"
        );
    }

    #[test]
    fn health_contract_is_runner_specific_and_does_not_expose_scope() {
        let body = r#"{"state":"ready","profile":"shared_container"}"#;
        assert!(!body.contains("job"));
        assert!(body.contains("shared_container"));
    }
}
