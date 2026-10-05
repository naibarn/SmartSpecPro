#![cfg(target_os = "linux")]

use smartaihub_runner::{
    process::ProcessSpec,
    session_host::{launch, launch_registered, SessionHostClient, SessionHostRegistration},
    session_registry::SessionRegistry,
};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::{Duration, Instant};

struct HostCleanup(SessionHostClient);

impl Drop for HostCleanup {
    fn drop(&mut self) {
        let sequence = self
            .0
            .status()
            .map(|status| status.command_sequence.saturating_add(1))
            .unwrap_or(1);
        let _ = self.0.terminate(sequence, "test-cleanup");
        let _ = self.0.wait_for_exit(Duration::from_secs(2));
    }
}

fn host_binary() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_smartaihub-session-host"))
}

#[test]
fn invalid_registration_is_rejected_before_starting_the_host() {
    let root = tempfile::tempdir().unwrap();
    let state_root = root.path().join("must-not-be-created");
    let registration = SessionHostRegistration {
        worker_job_id: "not-a-uuid".into(),
        worker_job_attempt: 1,
        lease_fencing_version: 1,
        runner_id: "runner-validation".into(),
        authority_epoch: 1,
        placement_epoch: 1,
        job_control_revision: 1,
        driver_id: "linux.pty.v1".into(),
        continuity_class: "reattachable".into(),
        workspace_ref: "workspace-1".into(),
        session_host_version: "1".into(),
    };
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    assert_eq!(
        launch_registered(
            &host_binary(),
            &state_root,
            &root.path().join("runner-data"),
            "session-validation",
            1,
            &registration,
            &process,
        )
        .unwrap_err(),
        "RUNNER_SESSION_REGISTRATION_INVALID"
    );
    assert!(!state_root.exists());
}

#[test]
fn registered_host_persists_child_and_host_identity_for_runner_inventory() {
    let root = tempfile::tempdir().unwrap();
    let state_root = root.path().join("host-state");
    let registry_root = root.path().join("runner-data");
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    let registration = SessionHostRegistration {
        worker_job_id: "123e4567-e89b-42d3-a456-426614174000".into(),
        worker_job_attempt: 2,
        lease_fencing_version: 3,
        runner_id: "runner-registered".into(),
        authority_epoch: 4,
        placement_epoch: 5,
        job_control_revision: 6,
        driver_id: "linux.pty.v1".into(),
        continuity_class: "reattachable".into(),
        workspace_ref: "workspace-1".into(),
        session_host_version: "1".into(),
    };
    let descriptor = launch_registered(
        &host_binary(),
        &state_root,
        &registry_root,
        "session-registered",
        1,
        &registration,
        &process,
    )
    .unwrap();
    let _cleanup = HostCleanup(SessionHostClient::attach(descriptor.clone()).unwrap());

    let registry = SessionRegistry::open(&registry_root).unwrap();
    let inventory = registry.verified_process_inventory().unwrap();
    assert_eq!(inventory.len(), 1);
    assert_eq!(inventory[0].session_id, "session-registered");
    assert_eq!(inventory[0].process.pid, descriptor.child_pid);
    assert_eq!(
        inventory[0].host_process.as_ref().unwrap(),
        &descriptor.host_identity
    );
}

#[test]
fn registered_host_is_terminated_when_registry_rejects_identity_conflict() {
    let root = tempfile::tempdir().unwrap();
    let state_root = root.path().join("host-state");
    let registry_root = root.path().join("runner-data");
    let mut registry = SessionRegistry::open(&registry_root).unwrap();
    let current_identity =
        smartaihub_runner::session_registry::capture_process_identity(std::process::id()).unwrap();
    registry
        .upsert(smartaihub_runner::session_registry::LocalSessionManifest {
            schema_version: smartaihub_runner::session_registry::SESSION_REGISTRY_SCHEMA_VERSION,
            session_id: "session-conflict".into(),
            worker_job_id: "123e4567-e89b-42d3-a456-426614174000".into(),
            worker_job_attempt: 1,
            lease_fencing_version: 1,
            runner_id: "runner-registered".into(),
            session_generation: 1,
            authority_epoch: 1,
            placement_epoch: 1,
            job_control_revision: 1,
            driver_id: "linux.pty.v1".into(),
            continuity_class: "reattachable".into(),
            session_host_version: "1".into(),
            process: current_identity,
            host_process: None,
            workspace_ref: "workspace-1".into(),
            command_sequence: 0,
            event_sequence: 0,
            last_state: "running".into(),
        })
        .unwrap();
    drop(registry);
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    let registration = SessionHostRegistration {
        worker_job_id: "123e4567-e89b-42d3-a456-426614174001".into(),
        worker_job_attempt: 2,
        lease_fencing_version: 3,
        runner_id: "runner-registered".into(),
        authority_epoch: 4,
        placement_epoch: 5,
        job_control_revision: 6,
        driver_id: "linux.pty.v1".into(),
        continuity_class: "reattachable".into(),
        workspace_ref: "workspace-1".into(),
        session_host_version: "1".into(),
    };

    assert_eq!(
        launch_registered(
            &host_binary(),
            &state_root,
            &registry_root,
            "session-conflict",
            1,
            &registration,
            &process,
        )
        .unwrap_err(),
        "RUNNER_SESSION_MANIFEST_IDENTITY_CONFLICT"
    );
    assert!(!state_root.join("host-attach.json").exists());
    let deadline = Instant::now() + Duration::from_secs(2);
    while !state_root.join("terminal-receipt.json").exists() {
        assert!(
            Instant::now() < deadline,
            "failed registration left Host alive"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn detached_host_survives_client_reconnect_and_persists_exit_receipt() {
    let root = tempfile::tempdir().unwrap();
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    let descriptor = launch(
        &host_binary(),
        root.path(),
        "session-integration-1",
        1,
        &process,
    )
    .unwrap();
    let _cleanup = HostCleanup(SessionHostClient::attach(descriptor.clone()).unwrap());
    let original_pid = descriptor.child_pid;

    // Simulate a Worker restart: discard the first client and reattach solely
    // through the persisted descriptor fields, while the standalone host and
    // exact child process remain alive.
    let recovered_descriptor =
        smartaihub_runner::session_host::SessionHostDescriptor::load(root.path()).unwrap();
    assert_eq!(recovered_descriptor, descriptor);
    assert_eq!(
        std::fs::metadata(root.path().join("host-attach.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    let recovered_client = SessionHostClient::attach(recovered_descriptor).unwrap();
    assert_eq!(recovered_client.status().unwrap().child_pid, original_pid);
    let first = recovered_client
        .write_input(1, "input-1", b"reconnected\n")
        .unwrap();
    assert!(first.ok);
    let retry = recovered_client
        .write_input(1, "input-1", b"reconnected\n")
        .unwrap();
    assert!(retry.ok);
    assert_eq!(retry.receipt, first.receipt);
    let conflicting_retry = recovered_client
        .write_input(1, "input-1", b"different input\n")
        .unwrap();
    assert!(!conflicting_retry.ok);
    assert_eq!(
        conflicting_retry.error.as_deref(),
        Some("RUNNER_SESSION_HOST_IDEMPOTENCY_CONFLICT")
    );

    let deadline = Instant::now() + Duration::from_secs(2);
    let output = loop {
        let (output, _) = recovered_client.read_output().unwrap();
        if output
            .windows(b"reconnected".len())
            .any(|window| window == b"reconnected")
        {
            break output;
        }
        assert!(Instant::now() < deadline, "host did not relay child output");
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(output
        .windows(b"reconnected".len())
        .any(|window| window == b"reconnected"));

    let stopped = recovered_client.terminate(2, "terminate-1").unwrap();
    assert!(stopped.ok);
    let receipt_path = root.path().join("terminal-receipt.json");
    let deadline = Instant::now() + Duration::from_secs(3);
    while !receipt_path.exists() {
        assert!(
            Instant::now() < deadline,
            "host did not persist terminal receipt"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let receipt: serde_json::Value =
        serde_json::from_slice(&std::fs::read(receipt_path).unwrap()).unwrap();
    assert_eq!(receipt["sessionId"], "session-integration-1");
    assert_eq!(receipt["sessionGeneration"], 1);
    assert_eq!(receipt["finalCommandSequence"], 2);
    assert_eq!(receipt["terminationReason"], "graceful");
    assert!(receipt["processIdentity"]["identityDigest"].is_string());
}

#[test]
fn host_state_root_rejects_symlinked_parent_components() {
    use std::os::unix::fs::symlink;

    let root = tempfile::tempdir().unwrap();
    let actual = root.path().join("actual");
    std::fs::create_dir(&actual).unwrap();
    let alias = root.path().join("alias");
    symlink(&actual, &alias).unwrap();
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    assert_eq!(
        launch(
            &host_binary(),
            &alias.join("session"),
            "session-integration-3",
            1,
            &process,
        )
        .unwrap_err(),
        "RUNNER_SESSION_HOST_STATE_DIRECTORY_INVALID"
    );
}

#[test]
fn host_ipc_rejects_a_wrong_attach_secret() {
    let root = tempfile::tempdir().unwrap();
    let process = ProcessSpec {
        program: PathBuf::from("/bin/cat"),
        args: Vec::new(),
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    let descriptor = launch(
        &host_binary(),
        root.path(),
        "session-integration-2",
        4,
        &process,
    )
    .unwrap();
    let _cleanup = HostCleanup(SessionHostClient::attach(descriptor.clone()).unwrap());
    let mut invalid = descriptor.clone();
    invalid.auth_token = "0".repeat(64);
    let response = SessionHostClient::attach(invalid)
        .unwrap()
        .status()
        .unwrap();
    assert!(!response.ok);
    assert_eq!(
        response.error.as_deref(),
        Some("RUNNER_SESSION_HOST_AUTH_FAILED")
    );
    let mut stale_identity = descriptor.clone();
    stale_identity.child_identity.as_mut().unwrap().started_at = "0".into();
    assert_eq!(
        SessionHostClient::attach(stale_identity).err().as_deref(),
        Some("RUNNER_SESSION_PROCESS_IDENTITY_MISMATCH")
    );

    let client = SessionHostClient::attach(descriptor).unwrap();
    assert!(client.terminate(1, "terminate-2").unwrap().ok);
}

#[test]
fn host_escalates_to_process_group_kill_when_child_ignores_term() {
    let root = tempfile::tempdir().unwrap();
    let process = ProcessSpec {
        program: PathBuf::from("/usr/bin/python3"),
        args: vec![
            "-c".into(),
            "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)"
                .into(),
        ],
        working_directory: PathBuf::from("/tmp"),
        environment: Vec::new(),
    };
    let descriptor = launch(
        &host_binary(),
        root.path(),
        "session-integration-force-kill",
        1,
        &process,
    )
    .unwrap();
    let cleanup = HostCleanup(SessionHostClient::attach(descriptor).unwrap());
    assert!(cleanup.0.terminate(1, "force-terminate").unwrap().ok);
    let receipt_path = root.path().join("terminal-receipt.json");
    let deadline = Instant::now() + Duration::from_secs(3);
    while !receipt_path.exists() {
        assert!(
            Instant::now() < deadline,
            "host did not finish force termination"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let receipt: serde_json::Value =
        serde_json::from_slice(&std::fs::read(receipt_path).unwrap()).unwrap();
    assert_eq!(receipt["terminationReason"], "force_kill");
}
