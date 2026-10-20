use crate::container_probe::{self, ProbeRequest, ProbeScope};
use crate::{
    config::{RunnerConfig, RunnerProfile},
    supervisor::Supervisor,
};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
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
/// scheduling; this process owns the assignment workspace, health and the
/// fixed private CPU media operation. It has no public job API or job ledger.
pub fn run_container_entrypoint(config: &RunnerConfig) -> Result<(), String> {
    let scope = ContainerScope::prepare(config)?;
    let probe_scope = container_probe::configured_scope(config).ok();
    let probe_lock = Arc::new(Mutex::new(()));
    let connections = Arc::new(AtomicUsize::new(0));
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
            Ok((mut stream, _)) => {
                if connections.fetch_add(1, Ordering::SeqCst) >= 4 {
                    connections.fetch_sub(1, Ordering::SeqCst);
                    continue;
                }
                let expected = probe_scope.clone();
                let root = scope.root.clone();
                let lock = probe_lock.clone();
                let active = connections.clone();
                std::thread::spawn(move || {
                    struct ConnectionGuard(Arc<AtomicUsize>);
                    impl Drop for ConnectionGuard {
                        fn drop(&mut self) {
                            self.0.fetch_sub(1, Ordering::SeqCst);
                        }
                    }
                    let _connection = ConnectionGuard(active);
                    respond_container(&mut stream, expected.as_ref(), &root, &lock);
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return Err("RUNNER_HEALTH_ACCEPT_FAILED".into()),
        }
    }
}

fn respond_container(
    stream: &mut TcpStream,
    expected: Option<&ProbeScope>,
    root: &std::path::Path,
    lock: &Mutex<()>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let (path, body) = match read_request(stream) {
        Ok(request) => request,
        Err(_) => {
            write_response(
                stream,
                "400 Bad Request",
                &serde_json::json!({"error":"CONTAINER_REQUEST_INVALID"}),
            );
            return;
        }
    };
    if path == "GET /health/runner" {
        let capabilities: Vec<&str> = if expected
            .is_some_and(|scope| scope.lease.expires_at_ms > container_probe::current_time_ms())
            && container_probe::available()
        {
            vec![container_probe::CONTRACT]
        } else {
            vec![]
        };
        write_response(
            stream,
            "200 OK",
            &serde_json::json!({"state":"ready","profile":"shared_container","capabilities":capabilities}),
        );
        return;
    }
    if path != "POST /v1/media/probe" {
        write_response(
            stream,
            "404 Not Found",
            &serde_json::json!({"error":"not_found"}),
        );
        return;
    }
    let Some(scope) = expected else {
        write_response(
            stream,
            "503 Service Unavailable",
            &serde_json::json!({"error":"CONTAINER_PROBE_SCOPE_REQUIRED"}),
        );
        return;
    };
    let Ok(_exclusive) = lock.try_lock() else {
        write_response(
            stream,
            "409 Conflict",
            &serde_json::json!({"error":"CONTAINER_PROBE_BUSY"}),
        );
        return;
    };
    let request = match serde_json::from_slice::<ProbeRequest>(&body) {
        Ok(request) => request,
        Err(_) => {
            write_response(
                stream,
                "400 Bad Request",
                &serde_json::json!({"error":"CONTAINER_PROBE_REQUEST_INVALID"}),
            );
            return;
        }
    };
    match container_probe::execute(request, scope, root) {
        Ok(result) => write_response(stream, "200 OK", &result),
        Err(code) => write_response(
            stream,
            "422 Unprocessable Entity",
            &serde_json::json!({"error":code}),
        ),
    }
}

fn read_request(stream: &mut TcpStream) -> Result<(String, Vec<u8>), ()> {
    let mut buffer = Vec::new();
    let header_end = loop {
        if let Some(position) = buffer.windows(4).position(|b| b == b"\r\n\r\n") {
            break position + 4;
        }
        if buffer.len() >= 8192 {
            return Err(());
        }
        let mut chunk = [0u8; 1024];
        let size = stream.read(&mut chunk).map_err(|_| ())?;
        if size == 0 {
            return Err(());
        }
        buffer.extend_from_slice(&chunk[..size]);
    };
    if header_end > 8192 {
        return Err(());
    }
    let headers = std::str::from_utf8(&buffer[..header_end]).map_err(|_| ())?;
    let mut lines = headers.split("\r\n");
    let parts: Vec<&str> = lines.next().ok_or(())?.split(' ').collect();
    if parts.len() != 3 || !matches!(parts[2], "HTTP/1.1" | "HTTP/1.0") {
        return Err(());
    }
    let path = format!("{} {}", parts[0], parts[1]);
    let mut content_length = None;
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':').ok_or(())?;
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(());
        }
        if name.eq_ignore_ascii_case("content-length") {
            if content_length.is_some() {
                return Err(());
            }
            content_length = Some(value.trim().parse::<usize>().map_err(|_| ())?);
        }
    }
    let length = content_length.unwrap_or(0);
    if length > container_probe::MAX_REQUEST_BYTES
        || (parts[0] == "POST" && content_length.is_none())
    {
        return Err(());
    }
    let mut body = buffer[header_end..].to_vec();
    if body.len() > length {
        return Err(());
    }
    while body.len() < length {
        let mut chunk = [0u8; 8192];
        let limit = chunk.len().min(length - body.len());
        let size = stream.read(&mut chunk[..limit]).map_err(|_| ())?;
        if size == 0 {
            return Err(());
        }
        body.extend_from_slice(&chunk[..size]);
    }
    Ok((path, body))
}
fn write_response(stream: &mut TcpStream, status: &str, body: &serde_json::Value) {
    let body = body.to_string();
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
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
    fn exchange(request: Vec<u8>, expected: Option<ProbeScope>) -> String {
        use std::net::Shutdown;
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let root = tempfile::tempdir().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            respond_container(&mut stream, expected.as_ref(), root.path(), &Mutex::new(()));
        });
        let mut client = TcpStream::connect(address).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        client.write_all(&request).unwrap();
        client.shutdown(Shutdown::Write).unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        server.join().unwrap();
        response
    }
    #[test]
    fn private_http_boundary_rejects_ambiguous_or_unbounded_bodies() {
        for request in [
            "POST /v1/media/probe HTTP/1.1\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            "POST /v1/media/probe HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
            "POST /v1/media/probe HTTP/1.1\r\nContent-Length: 99999999\r\n\r\n",
            "POST /v1/media/probe HTTP/1.1\r\nContent-Length: 8\r\n\r\n{}",
        ] {
            assert!(exchange(request.as_bytes().to_vec(), None).starts_with("HTTP/1.1 400"));
        }
        assert!(exchange(
            b"GET /health/runner HTTP/1.1\r\nHost: local\r\n\r\n".to_vec(),
            None
        )
        .starts_with("HTTP/1.1 200"));
        assert!(exchange(
            b"POST /v1/media/probe HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}".to_vec(),
            None
        )
        .contains("CONTAINER_PROBE_SCOPE_REQUIRED"));
    }
}
