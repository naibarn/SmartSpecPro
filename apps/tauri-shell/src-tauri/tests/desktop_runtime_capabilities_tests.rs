use smartspec_shell_lib::desktop_runtime_capabilities::{
    build_desktop_runtime_capabilities, build_desktop_worker_doctor_summary,
};
use smartspec_shell_lib::device_identity::initialize_device_identity;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-runtime-capabilities-{name}-{suffix}"));
    path
}

#[test]
fn builds_runtime_capabilities_from_device_identity_and_parser_support() {
    let base_dir = temp_dir("capabilities");
    let identity = initialize_device_identity(&base_dir, "device-1", 2).unwrap();

    let capability = build_desktop_runtime_capabilities(&base_dir, "device-1").unwrap();

    assert_eq!(capability.device_identity.key_algorithm, "ed25519");
    assert_eq!(capability.device_identity.key_version, 2);
    assert_eq!(
        capability.device_identity.public_key_digest_sha256,
        identity.public_key_digest_sha256
    );
    assert_eq!(capability.device_identity.storage_protection, "best_effort");
    assert_eq!(capability.device_identity.storage_provider, "filesystem");
    assert!(!capability.device_identity.os_attested);
    assert!(!capability.device_identity.hardware_backed);
    assert_eq!(capability.device_identity.attestation_provider, "derived_runtime");
    assert!(capability.device_identity.attestation_evidence_sha256.is_none());
    assert!(capability
        .device_identity
        .attestation_claims
        .contains(&"storage_backend:file_store".to_string()));
    assert_eq!(capability.device_identity.proof_kind, "ed25519_signature");
    assert_eq!(
        capability.device_attestation_support.evidence_source,
        "derived_runtime"
    );
    assert_eq!(
        capability.device_attestation_support.provider_hint,
        "derived_runtime"
    );
    assert_eq!(
        capability.local_file_service.isolation_mode,
        "python_subprocess_bounded"
    );
    assert!(capability.local_file_service.supported_formats.contains(&"pdf".to_string()));
    assert!(capability.local_file_service.supported_formats.contains(&"doc".to_string()));
    assert_eq!(capability.local_file_service.pdf_extractor, "internal_heuristic");
    assert_eq!(capability.local_file_service.ocr_provider, "none");
    assert_eq!(capability.local_file_service.render_backend, "none");
    assert_eq!(capability.local_file_service.office_renderer, "none");
    assert_eq!(
        capability.local_file_service.complex_document_support,
        "text_extraction_only"
    );
    assert!(capability.local_file_service.macro_inspection_supported);
    assert!(capability.local_file_service.embedded_media_inspection_supported);
    assert_eq!(capability.local_file_service.layout_analysis_mode, "none");
    assert!(!capability.local_file_service.multi_page_rendering_supported);
    assert_eq!(capability.local_file_service.max_rendered_pages, 0);
    assert_eq!(capability.local_file_service.ocr_layout_mode, "plain_text");
    assert!(!capability.local_file_service.full_rendering_supported);
    assert_eq!(
        capability.worker_toolchain.media_pipeline_ready,
        capability.worker_toolchain.ffmpeg_available && capability.worker_toolchain.ffprobe_available
    );
}

#[test]
fn builds_worker_doctor_summary_with_workspace_and_identity_checks() {
    let base_dir = temp_dir("doctor");
    let workspace_dir = base_dir.join("workspace");
    fs::create_dir_all(&workspace_dir).unwrap();
    initialize_device_identity(&base_dir, "device-1", 1).unwrap();

    let summary = build_desktop_worker_doctor_summary(&base_dir, "device-1", Some(&workspace_dir));

    assert!(matches!(summary.status.as_str(), "ok" | "degraded"));
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "device_identity" && check.status == "ok"));
    assert!(summary.checks.iter().any(|check| {
        check.id == "device_attestation_support"
            && check.status == "ok"
            && check.message.contains("derived_runtime")
    }));
    assert!(summary.checks.iter().any(|check| {
        check.id == "local_file_parser"
            && check.status == "ok"
            && check
                .details_json
                .get("macroInspectionSupported")
                .and_then(|value| value.as_bool())
                == Some(true)
    }));
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "workspace_root" && check.status == "ok"));
}

#[test]
fn doctor_summary_recommends_identity_bootstrap_when_missing() {
    let base_dir = temp_dir("doctor-missing");

    let summary = build_desktop_worker_doctor_summary(&base_dir, "device-missing", None);

    assert!(matches!(summary.status.as_str(), "error" | "degraded"));
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "device_identity" && check.status == "error"));
    assert!(summary
        .recommended_actions
        .contains(&"initialize_or_rotate_device_identity".to_string()));
}
