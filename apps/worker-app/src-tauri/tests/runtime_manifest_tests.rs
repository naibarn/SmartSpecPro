use smart_ai_hub_worker_app_lib::runtime_manifest::{
    doctor_from_manifest, doctor_from_manifest_path, file_sha256, RuntimePackManifest,
};
use std::fs;

fn manifest(sidecar_sha256: String) -> RuntimePackManifest {
    RuntimePackManifest {
        runtime_id: "hyperframes-windows-x64".into(),
        version: "0.1.0".into(),
        hyperframes_version: "0.6.95".into(),
        browser_version: "chromium-managed".into(),
        ffmpeg_version: "7.x".into(),
        ffprobe_version: "7.x".into(),
        thai_font_family: "Noto Sans Thai".into(),
        sidecar_path: "hyperframes-render.exe".into(),
        sidecar_sha256,
        checksum_file: "SHA256SUMS".into(),
        signature_file: "SHA256SUMS.sig".into(),
        license_notices: vec!["THIRD_PARTY_NOTICES.txt".into()],
        supported_contract_versions: vec!["2026-06-22".into()],
        runtime_profile_hash: "profile-hash".into(),
        allowed: true,
        deny_reason: None,
        rollback_to_version: None,
    }
}

#[test]
fn doctor_fails_when_hyperframes_sidecar_is_missing() {
    let dir = tempfile::tempdir().unwrap();
    let summary = doctor_from_manifest(&manifest("missing".into()), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "hyperframes_sidecar" && check.status == "error"));
}

#[test]
fn doctor_fails_when_thai_font_check_fails() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();
    let mut manifest = manifest(file_sha256(&sidecar).unwrap());
    manifest.thai_font_family = String::new();

    let summary = doctor_from_manifest(&manifest, dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "thai_font" && check.status == "error"));
}

#[test]
fn hash_mismatch_blocks_readiness() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("hyperframes-render.exe"), b"fake-sidecar").unwrap();

    let summary = doctor_from_manifest(&manifest("wrong-hash".into()), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "runtime_hash" && check.status == "error"));
}

#[test]
fn doctor_reports_runtime_versions_when_manifest_and_sidecar_are_valid() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();

    let summary = doctor_from_manifest(&manifest(file_sha256(&sidecar).unwrap()), dir.path());

    assert_eq!(summary.status, "ready");
    let versions = summary
        .checks
        .iter()
        .find(|check| check.id == "tool_versions")
        .unwrap();
    assert_eq!(versions.details_json["hyperframes"], "0.6.95");
    assert_eq!(versions.details_json["ffmpeg"], "7.x");
    assert_eq!(versions.details_json["ffprobe"], "7.x");
}

#[test]
fn missing_manifest_recommends_runtime_download() {
    let dir = tempfile::tempdir().unwrap();
    let summary = doctor_from_manifest_path(&dir.path().join("manifest.json"), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .recommended_actions
        .contains(&"Download render runtime".to_string()));
}
