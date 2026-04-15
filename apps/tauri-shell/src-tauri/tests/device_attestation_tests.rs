use smartspec_shell_lib::device_attestation::describe_device_attestation_support;
use std::fs;
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
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
    path.push(format!("smartspec-device-attestation-{name}-{suffix}"));
    path
}

#[cfg(target_os = "linux")]
fn write_fake_helper(path: &PathBuf) {
    fs::write(
        path,
        r#"#!/usr/bin/env python3
import json
import sys

if "--describe-support" in sys.argv:
    print(json.dumps({
        "providerId": "helper_secure_enclave",
        "defaultMode": "hardware_attested",
        "supportedModes": ["hardware_attested", "os_attested"],
        "notes": ["secure-enclave helper available"],
    }))
else:
    print("{}")
"#,
    )
    .unwrap();
    let mut permissions = fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).unwrap();
}

#[test]
fn reports_derived_runtime_support_when_no_external_broker_is_configured() {
    let _guard = ENV_LOCK.lock().unwrap();
    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_EVIDENCE_JSON");
    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_HELPER");
    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_MODE");

    let report = describe_device_attestation_support();

    assert!(report.enabled);
    assert_eq!(report.evidence_source, "derived_runtime");
    assert_eq!(report.provider_hint, "derived_runtime");
    assert_eq!(report.default_mode, "software_pkcs8");
    assert!(report
        .notes
        .iter()
        .any(|note| note.contains("no external attestation broker configured")));
}

#[test]
fn reports_env_json_attestation_support_when_inline_evidence_is_present() {
    let _guard = ENV_LOCK.lock().unwrap();
    std::env::set_var(
        "SMARTSPEC_DEVICE_ATTESTATION_EVIDENCE_JSON",
        r#"{"providerId":"tenant_broker","attestationMode":"hardware_attested"}"#,
    );
    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_HELPER");

    let report = describe_device_attestation_support();

    assert_eq!(report.evidence_source, "env_json");
    assert_eq!(report.provider_hint, "tenant_broker");
    assert_eq!(report.default_mode, "hardware_attested");

    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_EVIDENCE_JSON");
}

#[cfg(target_os = "linux")]
#[test]
fn reports_helper_attestation_support_when_helper_is_reachable() {
    let _guard = ENV_LOCK.lock().unwrap();
    let helper_dir = temp_dir("helper");
    fs::create_dir_all(&helper_dir).unwrap();
    let helper_path = helper_dir.join("attestation-helper");
    write_fake_helper(&helper_path);
    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_EVIDENCE_JSON");
    std::env::set_var(
        "SMARTSPEC_DEVICE_ATTESTATION_HELPER",
        helper_path.to_string_lossy().to_string(),
    );

    let report = describe_device_attestation_support();

    assert_eq!(report.evidence_source, "helper");
    assert!(report.helper_configured);
    assert!(report.helper_reachable);
    assert_eq!(report.default_mode, "hardware_attested");
    assert_eq!(report.provider_hint, "helper_secure_enclave");
    assert_eq!(
        report.supported_modes,
        vec!["hardware_attested".to_string(), "os_attested".to_string()],
    );
    assert!(report
        .notes
        .iter()
        .any(|note| note.contains("secure-enclave helper available")));

    std::env::remove_var("SMARTSPEC_DEVICE_ATTESTATION_HELPER");
}
