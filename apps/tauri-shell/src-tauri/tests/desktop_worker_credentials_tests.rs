use smartspec_shell_lib::desktop_worker_credentials::{
    build_desktop_credential_secret_id, clear_device_runtime_credentials,
    clear_worker_session_credentials, read_desktop_credential_metadata,
    read_desktop_credential_value,
    store_desktop_credential, DesktopCredentialDescriptor, DesktopCredentialScope,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-desktop-worker-credentials-{name}-{suffix}"));
    path
}

#[test]
fn stores_typed_worker_credentials_with_stable_secret_ids() {
    let base_dir = temp_dir("typed-store");
    let metadata = store_desktop_credential(
        &base_dir,
        DesktopCredentialDescriptor {
            device_id: "device-1".into(),
            scope: DesktopCredentialScope::WorkerExecution,
            subject_id: Some("worker-1".into()),
            secret_value: "exec-token-123".into(),
        },
    )
    .unwrap();

    let secret_id = build_desktop_credential_secret_id(
        "device-1",
        &DesktopCredentialScope::WorkerExecution,
        Some("worker-1"),
    )
    .unwrap();
    let read_back = read_desktop_credential_metadata(
        &base_dir,
        "device-1",
        DesktopCredentialScope::WorkerExecution,
        Some("worker-1"),
    )
    .unwrap();
    let secret_value = read_desktop_credential_value(
        &base_dir,
        "device-1",
        DesktopCredentialScope::WorkerExecution,
        Some("worker-1"),
    )
    .unwrap();

    assert_eq!(metadata.secret_id, secret_id);
    assert_eq!(read_back.secret_id, secret_id);
    assert_eq!(read_back.scope, DesktopCredentialScope::WorkerExecution);
    assert_eq!(secret_value.secret_value, "exec-token-123");
  }

#[test]
fn clears_worker_session_credentials_for_drain_or_revocation() {
    let base_dir = temp_dir("worker-clear");
    for scope in [
        DesktopCredentialScope::WorkerRegistration,
        DesktopCredentialScope::WorkerExecution,
        DesktopCredentialScope::WorkerUpload,
    ] {
        store_desktop_credential(
            &base_dir,
            DesktopCredentialDescriptor {
                device_id: "device-1".into(),
                scope,
                subject_id: Some("worker-1".into()),
                secret_value: "token".into(),
            },
        )
        .unwrap();
    }

    let deleted = clear_worker_session_credentials(&base_dir, "device-1", "worker-1").unwrap();

    assert_eq!(deleted, 3);
    assert!(
        read_desktop_credential_metadata(
            &base_dir,
            "device-1",
            DesktopCredentialScope::WorkerExecution,
            Some("worker-1"),
        )
        .is_err()
    );
}

#[test]
fn clears_device_runtime_credentials_for_offboarding() {
    let base_dir = temp_dir("runtime-clear");
    for scope in [
        DesktopCredentialScope::DesktopRuntime,
        DesktopCredentialScope::DesktopRefresh,
    ] {
        store_desktop_credential(
            &base_dir,
            DesktopCredentialDescriptor {
                device_id: "device-1".into(),
                scope,
                subject_id: None,
                secret_value: "token".into(),
            },
        )
        .unwrap();
    }

    let deleted = clear_device_runtime_credentials(&base_dir, "device-1").unwrap();

    assert_eq!(deleted, 2);
    assert!(
        read_desktop_credential_metadata(
            &base_dir,
            "device-1",
            DesktopCredentialScope::DesktopRuntime,
            None,
        )
        .is_err()
    );
}
