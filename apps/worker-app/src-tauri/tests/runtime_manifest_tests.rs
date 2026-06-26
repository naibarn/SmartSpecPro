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
        archive_url: None,
        archive_sha256: None,
        archive_size_bytes: None,
        runtime_platform: None,
        sidecar_script_path: None,
    }
}

fn write_minimal_official_renderer_files(root: &std::path::Path) {
    fs::create_dir_all(root.join("node")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/hyperframes/dist")).unwrap();
    fs::create_dir_all(root.join("hyperframes-sidecar")).unwrap();
    fs::create_dir_all(root.join("browser/chrome-win64")).unwrap();
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("node/node.exe"), b"MZ fake node").unwrap();
    fs::write(
        root.join("hyperframes/node_modules/hyperframes/dist/cli.js"),
        b"official hyperframes cli",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes-sidecar/render.mjs"),
        b"official sidecar script",
    )
    .unwrap();
    fs::write(
        root.join("browser/chrome-win64/chrome.exe"),
        b"MZ fake chrome",
    )
    .unwrap();
    fs::write(root.join("bin/ffmpeg.exe"), b"MZ fake ffmpeg").unwrap();
    fs::write(root.join("bin/ffprobe.exe"), b"MZ fake ffprobe").unwrap();
}

fn write_minimal_wsl2_renderer_files(root: &std::path::Path) {
    fs::create_dir_all(root.join("node/bin")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/hyperframes/dist")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/@hyperframes/producer")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/sharp")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/@img/sharp-linux-x64/lib")).unwrap();
    fs::create_dir_all(root.join("hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib"))
        .unwrap();
    fs::create_dir_all(root.join("hyperframes-sidecar")).unwrap();
    fs::create_dir_all(root.join("browser/chrome-linux64")).unwrap();
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::write(root.join("node/bin/node"), b"linux node").unwrap();
    fs::write(
        root.join("hyperframes/node_modules/hyperframes/dist/cli.js"),
        b"official hyperframes cli",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes/node_modules/@hyperframes/producer/package.json"),
        b"{\"name\":\"@hyperframes/producer\",\"version\":\"0.7.5\"}",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes/node_modules/sharp/package.json"),
        b"{\"name\":\"sharp\",\"version\":\"0.34.5\"}",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes/node_modules/@img/sharp-linux-x64/package.json"),
        b"{\"name\":\"@img/sharp-linux-x64\",\"version\":\"0.34.5\"}",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node"),
        b"linux sharp binding",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes/node_modules/@img/sharp-libvips-linux-x64/package.json"),
        b"{\"name\":\"@img/sharp-libvips-linux-x64\",\"version\":\"1.2.4\"}",
    )
    .unwrap();
    fs::write(
        root.join(
            "hyperframes/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3",
        ),
        b"linux libvips",
    )
    .unwrap();
    fs::write(
        root.join("hyperframes-sidecar/render.mjs"),
        b"official sidecar script",
    )
    .unwrap();
    fs::write(root.join("browser/chrome-linux64/chrome"), b"linux chrome").unwrap();
    fs::write(root.join("bin/ffmpeg"), b"linux ffmpeg").unwrap();
    fs::write(root.join("bin/ffprobe"), b"linux ffprobe").unwrap();
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
fn mock_sidecar_is_blocked_even_when_manifest_hash_matches() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"compiled binary marker: mock video content").unwrap();
    fs::write(dir.path().join("SHA256SUMS"), b"fake checksums").unwrap();
    fs::write(dir.path().join("SHA256SUMS.sig"), b"fake signature").unwrap();

    let summary = doctor_from_manifest(&manifest(file_sha256(&sidecar).unwrap()), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "runtime_sidecar_policy" && check.status == "error"));
}

#[test]
fn diagnostic_smoke_sidecar_is_blocked_even_when_manifest_hash_matches() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(
        &sidecar,
        b"compiled binary marker: testsrc2=size=1080x1920 lavfi",
    )
    .unwrap();
    fs::write(dir.path().join("SHA256SUMS"), b"fake checksums").unwrap();
    fs::write(dir.path().join("SHA256SUMS.sig"), b"fake signature").unwrap();

    let summary = doctor_from_manifest(&manifest(file_sha256(&sidecar).unwrap()), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "runtime_sidecar_policy" && check.status == "error"));
}

#[test]
fn doctor_reports_runtime_versions_when_manifest_and_sidecar_are_valid() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();
    fs::write(dir.path().join("SHA256SUMS"), b"fake checksums").unwrap();
    fs::write(dir.path().join("SHA256SUMS.sig"), b"fake signature").unwrap();
    write_minimal_official_renderer_files(dir.path());

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
fn wsl2_runtime_requires_linux_node_browser_and_media_tools() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();
    fs::write(dir.path().join("SHA256SUMS"), b"fake checksums").unwrap();
    fs::write(dir.path().join("SHA256SUMS.sig"), b"fake signature").unwrap();
    write_minimal_wsl2_renderer_files(dir.path());

    let mut wsl_manifest = manifest(file_sha256(&sidecar).unwrap());
    wsl_manifest.runtime_id = "hyperframes-wsl2".into();
    wsl_manifest.runtime_platform = Some("wsl2-linux-x64".into());
    wsl_manifest.sidecar_script_path = Some("hyperframes-sidecar/render.mjs".into());

    let summary = doctor_from_manifest(&wsl_manifest, dir.path());

    assert_eq!(summary.status, "ready");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "media_tools" && check.status == "ok"));
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "hyperframes_native_dependencies" && check.status == "ok"));
    assert!(summary
        .checks
        .iter()
        .find(|check| check.id == "official_hyperframes_renderer")
        .unwrap()
        .details_json["node"]
        .as_str()
        .unwrap()
        .ends_with("node/bin/node"));
}

#[test]
fn wsl2_runtime_blocks_when_linux_sharp_native_dependencies_are_missing() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();
    fs::write(dir.path().join("SHA256SUMS"), b"fake checksums").unwrap();
    fs::write(dir.path().join("SHA256SUMS.sig"), b"fake signature").unwrap();
    write_minimal_wsl2_renderer_files(dir.path());
    fs::remove_dir_all(
        dir.path()
            .join("hyperframes/node_modules/@img/sharp-linux-x64"),
    )
    .unwrap();

    let mut wsl_manifest = manifest(file_sha256(&sidecar).unwrap());
    wsl_manifest.runtime_id = "hyperframes-wsl2".into();
    wsl_manifest.runtime_platform = Some("wsl2-linux-x64".into());
    wsl_manifest.sidecar_script_path = Some("hyperframes-sidecar/render.mjs".into());

    let summary = doctor_from_manifest(&wsl_manifest, dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "hyperframes_native_dependencies" && check.status == "error"));
    assert!(summary
        .recommended_actions
        .iter()
        .any(|action| action.contains("@img/sharp-linux-x64")));
}

#[test]
fn missing_manifest_recommends_official_runtime_install() {
    let dir = tempfile::tempdir().unwrap();
    let summary = doctor_from_manifest_path(&dir.path().join("manifest.json"), dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .recommended_actions
        .contains(&"Install official HyperFrames runtime pack".to_string()));
}

#[test]
fn placeholder_runtime_bundle_is_blocked_even_if_manifest_exists() {
    let dir = tempfile::tempdir().unwrap();
    let sidecar = dir.path().join("hyperframes-render.exe");
    fs::write(&sidecar, b"fake-sidecar").unwrap();
    let mut bundle_manifest = manifest(file_sha256(&sidecar).unwrap());
    bundle_manifest.version = "0.0.0-placeholder".into();
    bundle_manifest.hyperframes_version = "not-bundled".into();
    bundle_manifest.browser_version = "not-bundled".into();
    bundle_manifest.ffmpeg_version = "not-bundled".into();
    bundle_manifest.ffprobe_version = "not-bundled".into();

    let summary = doctor_from_manifest(&bundle_manifest, dir.path());

    assert_eq!(summary.status, "blocked");
    assert!(summary
        .checks
        .iter()
        .any(|check| check.id == "runtime_bundle" && check.status == "error"));
}
