use smartspec_shell_lib::device_identity::{
    initialize_device_identity, read_device_identity, rotate_device_identity,
};
use std::env;
use std::fs;
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-device-identity-{name}-{suffix}"));
    path
}

#[cfg(target_os = "linux")]
fn write_fake_secret_tool(bin_dir: &Path, state_dir: &Path) {
    fs::create_dir_all(bin_dir).unwrap();
    fs::create_dir_all(state_dir).unwrap();
    let script_path = bin_dir.join("secret-tool");
    let script = format!(
        r#"#!/usr/bin/env python3
import hashlib
import pathlib
import sys

state_dir = pathlib.Path(r'''{state_dir}''')
state_dir.mkdir(parents=True, exist_ok=True)

command = sys.argv[1]
args = sys.argv[2:]

def key_from_args(arguments):
    attrs = []
    for index in range(0, len(arguments), 2):
        attrs.append(f"{{arguments[index]}}={{arguments[index + 1]}}")
    return hashlib.sha256("|".join(attrs).encode()).hexdigest()

if command == "store":
    attrs = args[1:]
    key = key_from_args(attrs)
    (state_dir / key).write_text(sys.stdin.read())
    sys.exit(0)
if command == "lookup":
    key = key_from_args(args)
    path = state_dir / key
    if not path.exists():
        sys.exit(1)
    sys.stdout.write(path.read_text())
    sys.exit(0)
if command == "clear":
    key = key_from_args(args)
    path = state_dir / key
    if path.exists():
        path.unlink()
    sys.exit(0)

sys.exit(1)
"#,
        state_dir = state_dir.to_string_lossy(),
    );
    fs::write(&script_path, script).unwrap();
    let mut permissions = fs::metadata(&script_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&script_path, permissions).unwrap();
}

#[test]
fn initializes_and_reads_device_identity() {
    let _guard = ENV_LOCK.lock().unwrap();
    env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "file_store");
    let base_dir = temp_dir("init");
    let identity = initialize_device_identity(&base_dir, "device-1", 1).unwrap();
    let read_back = read_device_identity(&base_dir, "device-1").unwrap();

    assert_eq!(identity, read_back);
    assert_eq!(identity.key_algorithm, "ed25519");
    assert_eq!(identity.key_version, 1);
    assert_eq!(identity.attestation_mode, "software_pkcs8");
    assert_eq!(identity.storage_protection, "best_effort");
    assert_eq!(identity.storage_provider, "filesystem");
    assert!(!identity.os_attested);
    assert!(!identity.hardware_backed);
    assert!(base_dir.join(format!("{}.secret", identity.secret_id)).exists());
    env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
}

#[test]
fn rotates_device_identity_and_replaces_old_secret() {
    let _guard = ENV_LOCK.lock().unwrap();
    env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "file_store");
    let base_dir = temp_dir("rotate");
    let initial = initialize_device_identity(&base_dir, "device-1", 1).unwrap();
    let rotated = rotate_device_identity(&base_dir, "device-1", 2).unwrap();

    assert_eq!(rotated.key_version, 2);
    assert_ne!(
        initial.public_key_digest_sha256,
        rotated.public_key_digest_sha256
    );
    assert!(rotated.rotated_at.is_some());
    assert!(!base_dir.join(format!("{}.secret", initial.secret_id)).exists());
    assert!(base_dir.join(format!("{}.secret", rotated.secret_id)).exists());
    env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
}

#[test]
fn rejects_reinitializing_identity_with_a_new_key_version() {
    let _guard = ENV_LOCK.lock().unwrap();
    env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "file_store");
    let base_dir = temp_dir("reinit");
    initialize_device_identity(&base_dir, "device-1", 1).unwrap();

    let error = initialize_device_identity(&base_dir, "device-1", 2).unwrap_err();

    assert!(error.contains("rotate_device_identity"));
    env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
}

#[cfg(target_os = "linux")]
#[test]
fn uses_os_keychain_metadata_when_secret_tool_backend_is_available() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("os-keychain");
    let fake_bin_dir = temp_dir("secret-tool-bin");
    let fake_state_dir = temp_dir("secret-tool-state");
    write_fake_secret_tool(&fake_bin_dir, &fake_state_dir);
    let original_path = env::var("PATH").unwrap_or_default();
    env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "os_keychain");

    let identity = initialize_device_identity(&base_dir, "device-1", 1).unwrap();

    assert_eq!(identity.attestation_mode, "os_keychain");
    assert_eq!(identity.secret_storage, "os_keychain");
    assert_eq!(identity.storage_protection, "os_protected");
    assert_eq!(identity.storage_provider, "freedesktop_secret_service");
    assert!(!base_dir.join(format!("{}.secret", identity.secret_id)).exists());

    env::set_var("PATH", original_path);
    env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
}

#[cfg(target_os = "linux")]
#[test]
fn elevates_attestation_posture_when_os_attested_hardware_hints_are_present() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("hardware-attested");
    let fake_bin_dir = temp_dir("secret-tool-bin-attested");
    let fake_state_dir = temp_dir("secret-tool-state-attested");
    write_fake_secret_tool(&fake_bin_dir, &fake_state_dir);
    let original_path = env::var("PATH").unwrap_or_default();
    env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "os_keychain");
    env::set_var("SMARTSPEC_SECRET_OS_ATTESTED", "true");
    env::set_var("SMARTSPEC_SECRET_HARDWARE_BACKED", "true");

    let identity = initialize_device_identity(&base_dir, "device-1", 1).unwrap();

    assert_eq!(identity.attestation_mode, "hardware_attested");
    assert_eq!(identity.secret_storage, "os_keychain");
    assert_eq!(identity.storage_protection, "os_protected");
    assert_eq!(identity.storage_provider, "freedesktop_secret_service");
    assert!(identity.os_attested);
    assert!(identity.hardware_backed);

    env::set_var("PATH", original_path);
    env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
    env::remove_var("SMARTSPEC_SECRET_OS_ATTESTED");
    env::remove_var("SMARTSPEC_SECRET_HARDWARE_BACKED");
}
