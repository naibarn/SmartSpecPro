use smartspec_shell_lib::device_enrollment::{
    build_asymmetric_enrollment_proof, build_enrollment_proof, build_stored_asymmetric_enrollment_proof,
    build_stored_enrollment_proof, generate_device_signing_keypair, verify_asymmetric_enrollment_proof,
    verify_enrollment_proof, DeviceEnrollmentRequest,
};
use smartspec_shell_lib::secret_store::{
    delete_secret, read_secret_metadata, read_secret_value, store_secret, SecretDescriptor,
};
use smartspec_shell_lib::updater_bridge::{
    verify_update_bundle, UpdateBundleVerificationRequest,
};
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
    path.push(format!("smartspec-secret-store-{name}-{suffix}"));
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
fn stores_metadata_only_for_secrets_and_supports_cleanup() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("store");
    let metadata = store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: "telegram-bot".into(),
            scope: "connector_runtime".into(),
            secret_value: "super-secret-token".into(),
        },
    )
    .unwrap();
    let read_back = read_secret_metadata(&base_dir, "telegram-bot").unwrap();

    assert_eq!(metadata, read_back);
    assert_eq!(metadata.scope, "connector_runtime");
    assert_eq!(metadata.storage_backend, "file_store");
    assert_eq!(metadata.storage_protection, "best_effort");
    assert_eq!(metadata.storage_provider, "filesystem");
    assert!(!metadata.os_attested);
    assert!(!metadata.hardware_backed);

    delete_secret(&base_dir, "telegram-bot").unwrap();
    assert!(!base_dir.join("telegram-bot.secret").exists());
  }

#[cfg(target_os = "linux")]
#[test]
fn stores_secrets_in_os_keychain_when_secret_tool_is_available() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("store-os-keychain");
    let fake_bin_dir = temp_dir("secret-tool-bin");
    let fake_state_dir = temp_dir("secret-tool-state");
    write_fake_secret_tool(&fake_bin_dir, &fake_state_dir);
    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    std::env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "os_keychain");

    let metadata = store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: "device-signing-key".into(),
            scope: "device_identity_signing_key".into(),
            secret_value: "super-secret-private-key".into(),
        },
    )
    .unwrap();
    let secret_value = read_secret_value(&base_dir, "device-signing-key").unwrap();

    assert_eq!(metadata.storage_backend, "os_keychain");
    assert_eq!(metadata.storage_protection, "os_protected");
    assert_eq!(metadata.storage_provider, "freedesktop_secret_service");
    assert_eq!(secret_value, "super-secret-private-key");
    assert!(!base_dir.join("device-signing-key.secret").exists());

    delete_secret(&base_dir, "device-signing-key").unwrap();
    std::env::set_var("PATH", original_path);
    std::env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
}

#[cfg(target_os = "linux")]
#[test]
fn records_os_attested_and_hardware_backed_metadata_hints() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("store-attested-hints");
    let fake_bin_dir = temp_dir("secret-tool-bin-hints");
    let fake_state_dir = temp_dir("secret-tool-state-hints");
    write_fake_secret_tool(&fake_bin_dir, &fake_state_dir);
    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    std::env::set_var("SMARTSPEC_SECRET_STORAGE_BACKEND", "os_keychain");
    std::env::set_var("SMARTSPEC_SECRET_OS_ATTESTED", "true");
    std::env::set_var("SMARTSPEC_SECRET_HARDWARE_BACKED", "true");

    let metadata = store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: "device-attested-key".into(),
            scope: "device_identity_signing_key".into(),
            secret_value: "attested-private-key".into(),
        },
    )
    .unwrap();

    assert_eq!(metadata.storage_backend, "os_keychain");
    assert_eq!(metadata.storage_protection, "os_protected");
    assert_eq!(metadata.storage_provider, "freedesktop_secret_service");
    assert!(metadata.os_attested);
    assert!(metadata.hardware_backed);

    std::env::set_var("PATH", original_path);
    std::env::remove_var("SMARTSPEC_SECRET_STORAGE_BACKEND");
    std::env::remove_var("SMARTSPEC_SECRET_OS_ATTESTED");
    std::env::remove_var("SMARTSPEC_SECRET_HARDWARE_BACKED");
}

#[test]
fn builds_and_verifies_stored_device_enrollment_proof() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("device-proof");
    store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: "device-binding".into(),
            scope: "device_enrollment".into(),
            secret_value: "device-secret-v1".into(),
        },
    )
    .unwrap();
    let request = DeviceEnrollmentRequest {
        tenant_id: "tenant-1".into(),
        device_id: "device-1".into(),
        device_public_key: "ssh-ed25519 AAAA".into(),
        challenge_id: "challenge-1".into(),
        purpose: "bootstrap".into(),
        device_key_version: 1,
        nonce: "nonce-123".into(),
        issued_at_epoch_ms: 1_799_999_998_000,
        expires_at_epoch_ms: 1_800_000_000_000,
        challenge_sha256: "a".repeat(64),
    };
    let stored_secret = read_secret_value(&base_dir, "device-binding").unwrap();
    let proof = build_stored_enrollment_proof(&base_dir, "device-binding", request.clone()).unwrap();

    assert_eq!(stored_secret, "device-secret-v1");
    assert!(verify_enrollment_proof(
        request,
        &proof,
        "device-secret-v1",
        Some(1_799_999_999_000),
    )
    .unwrap());
}

#[test]
fn rejects_wrong_secret_and_expired_device_enrollment_proof() {
    let _guard = ENV_LOCK.lock().unwrap();
    let request = DeviceEnrollmentRequest {
        tenant_id: "tenant-1".into(),
        device_id: "device-1".into(),
        device_public_key: "ssh-ed25519 AAAA".into(),
        challenge_id: "challenge-2".into(),
        purpose: "rekey".into(),
        device_key_version: 2,
        nonce: "nonce-456".into(),
        issued_at_epoch_ms: 1_799_999_998_000,
        expires_at_epoch_ms: 1_800_000_000_000,
        challenge_sha256: "b".repeat(64),
    };
    let proof = build_enrollment_proof(request.clone(), "device-secret-v2").unwrap();

    assert!(!verify_enrollment_proof(
        request.clone(),
        &proof,
        "wrong-secret",
        Some(1_799_999_999_000),
    )
    .unwrap());
    assert!(!verify_enrollment_proof(
        request,
        &proof,
        "device-secret-v2",
        Some(1_800_000_000_001),
    )
    .unwrap());
}

#[test]
fn generates_and_verifies_asymmetric_device_enrollment_proof() {
    let _guard = ENV_LOCK.lock().unwrap();
    let base_dir = temp_dir("device-proof-asymmetric");
    let keypair = generate_device_signing_keypair().unwrap();
    store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: "device-signing-key".into(),
            scope: "device_enrollment".into(),
            secret_value: keypair.pkcs8_private_key_base64.clone(),
        },
    )
    .unwrap();
    let request = DeviceEnrollmentRequest {
        tenant_id: "tenant-1".into(),
        device_id: "device-1".into(),
        device_public_key: keypair.public_key_pem.clone(),
        challenge_id: "challenge-3".into(),
        purpose: "refresh".into(),
        device_key_version: 3,
        nonce: "nonce-789".into(),
        issued_at_epoch_ms: 1_799_999_998_000,
        expires_at_epoch_ms: 1_800_000_000_000,
        challenge_sha256: "c".repeat(64),
    };

    let proof =
        build_stored_asymmetric_enrollment_proof(&base_dir, "device-signing-key", request.clone())
            .unwrap();

    assert!(verify_asymmetric_enrollment_proof(
        request.clone(),
        &proof,
        Some(1_799_999_999_000),
    )
    .unwrap());

    let wrong_keypair = generate_device_signing_keypair().unwrap();
    let wrong_request = DeviceEnrollmentRequest {
        device_public_key: wrong_keypair.public_key_pem,
        ..request
    };
    assert!(!verify_asymmetric_enrollment_proof(
        wrong_request,
        &proof,
        Some(1_799_999_999_000),
    )
    .unwrap());
}

#[test]
fn rejects_expired_asymmetric_device_enrollment_proof() {
    let _guard = ENV_LOCK.lock().unwrap();
    let keypair = generate_device_signing_keypair().unwrap();
    let request = DeviceEnrollmentRequest {
        tenant_id: "tenant-1".into(),
        device_id: "device-1".into(),
        device_public_key: keypair.public_key_pem,
        challenge_id: "challenge-4".into(),
        purpose: "rekey".into(),
        device_key_version: 4,
        nonce: "nonce-999".into(),
        issued_at_epoch_ms: 1_799_999_998_000,
        expires_at_epoch_ms: 1_800_000_000_000,
        challenge_sha256: "d".repeat(64),
    };
    let proof = build_asymmetric_enrollment_proof(
        request.clone(),
        &keypair.pkcs8_private_key_base64,
    )
    .unwrap();

    assert!(!verify_asymmetric_enrollment_proof(
        request,
        &proof,
        Some(1_800_000_000_001),
    )
    .unwrap());
}

#[test]
fn verifies_signed_update_bundles_and_blocks_downgrades() {
    let _guard = ENV_LOCK.lock().unwrap();
    let verification = verify_update_bundle(UpdateBundleVerificationRequest {
        current_version: "1.0.0".into(),
        bundle_version: "1.1.0".into(),
        trusted_signer_ids: vec!["org-signer-1".into()],
        signer_id: "org-signer-1".into(),
        signature_sha256: "a".repeat(64),
        allow_downgrade: false,
    })
    .unwrap();

    let downgrade = verify_update_bundle(UpdateBundleVerificationRequest {
        current_version: "1.1.0".into(),
        bundle_version: "1.0.0".into(),
        trusted_signer_ids: vec!["org-signer-1".into()],
        signer_id: "org-signer-1".into(),
        signature_sha256: "a".repeat(64),
        allow_downgrade: false,
    });

    assert!(verification.accepted);
    assert!(downgrade.is_err());
}

#[test]
fn accepts_higher_semantic_versions_even_when_string_sorting_would_fail() {
    let _guard = ENV_LOCK.lock().unwrap();
    let verification = verify_update_bundle(UpdateBundleVerificationRequest {
        current_version: "1.2.0".into(),
        bundle_version: "1.10.0".into(),
        trusted_signer_ids: vec!["org-signer-1".into()],
        signer_id: "org-signer-1".into(),
        signature_sha256: "a".repeat(64),
        allow_downgrade: false,
    })
    .unwrap();

    assert!(verification.accepted);
}
