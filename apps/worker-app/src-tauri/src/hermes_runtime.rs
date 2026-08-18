//! Feature 135 §11 — Hermes runtime pack manifest, install-layout resolution,
//! and `hermes_doctor()`.
//!
//! Mirrors the shape of `runtime_manifest.rs`'s HyperFrames manifest/doctor
//! (installed-vs-bundled resolution, `DoctorSummary`/`DoctorCheck` reuse) but
//! is otherwise independent: hermes-ness is a distinct runtime pack family
//! served by the same `/api/workers/runtime-pack/manifest` endpoint under the
//! two runtime ids below (see `apps/web/server/routes/workerRuntime.ts`'s
//! manifest-serving region and `apps/web/scripts/build-hermes-runtime-pack.ts`).
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

use crate::runtime_manifest::{DoctorCheck, DoctorSummary};

/// Runtime ids — frozen strings, kept in lockstep with the server-side
/// manifest-serving region (`workerRuntime.ts`) and the pack build script
/// (`build-hermes-runtime-pack.ts`). The macOS pack is native Apple Silicon
/// (`aarch64-apple-darwin`); Intel Macs intentionally do not match this id.
pub const HERMES_RUNTIME_ID_WINDOWS: &str = "hermes-windows-x64";
pub const HERMES_RUNTIME_ID_MACOS: &str = "hermes-macos-arm64";

/// Pinned Hermes CLI version (`hermes-agent==0.18.2` — spec §15 version-skew
/// policy). Doctor readiness requires the queried `hermes --version` output
/// to contain this exact string; a mismatch degrades (not blocks) readiness
/// since an old-but-functional Hermes pack can still run jobs the server's
/// own `hermes_worker_min_version` enforcement (`workerRegistryService.ts`)
/// will separately gate.
pub const HERMES_PINNED_VERSION: &str = "0.18.2";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesRuntimeManifest {
    pub runtime_id: String,
    pub version: String,
    /// Pinned `hermes-agent` version this pack bundles (informational — the
    /// authoritative pin check is against `HERMES_PINNED_VERSION`).
    pub hermes_version: String,
    /// Path (relative to the pack root) to the bundled Python interpreter.
    pub python_relative_path: String,
    /// Path (relative to the pack root) to the `hermes` CLI entry point.
    pub hermes_relative_path: String,
    pub checksum_file: String,
    pub signature_file: String,
    pub allowed: bool,
    #[serde(default)]
    pub deny_reason: Option<String>,
    #[serde(default)]
    pub archive_url: Option<String>,
    #[serde(default)]
    pub archive_sha256: Option<String>,
    #[serde(default)]
    pub archive_size_bytes: Option<u64>,
}

pub fn read_hermes_runtime_manifest(manifest_path: &Path) -> Result<HermesRuntimeManifest, String> {
    fs::read_to_string(manifest_path)
        .map_err(|error| error.to_string())
        .and_then(|contents| {
            serde_json::from_str::<HermesRuntimeManifest>(&contents)
                .map_err(|error| error.to_string())
        })
}

/// Installed-vs-bundled resolution (mirrors `runtime_manifest::runtime_pack_paths`,
/// simplified: there is no bundled hermes pack shipped inside app resources —
/// Windows ships via explicit download through `worker_app_install_hermes_runtime`
/// — so the installed copy under the app data dir is the only location).
pub fn hermes_runtime_pack_paths(app_data_dir: &Path) -> (PathBuf, PathBuf) {
    let root = app_data_dir.join("hermes-runtime");
    (root.join("manifest.json"), root)
}

/// Result of probing `<hermes-executable> --version`.
pub type HermesVersionQuery = Result<String, String>;

pub fn hermes_doctor_from_manifest_path(
    manifest_path: &Path,
    pack_root: &Path,
    profile_root: &Path,
    query_version: impl Fn(&Path) -> HermesVersionQuery,
) -> DoctorSummary {
    let manifest = match read_hermes_runtime_manifest(manifest_path) {
        Ok(manifest) => manifest,
        Err(error) => {
            return DoctorSummary {
                status: "blocked".into(),
                checks: vec![DoctorCheck {
                    id: "hermes_runtime_manifest".into(),
                    status: "error".into(),
                    message: format!("Hermes runtime manifest is unavailable: {error}"),
                    details_json: json!({ "path": manifest_path.to_string_lossy() }),
                }],
                recommended_actions: vec!["Install the Hermes runtime pack".into()],
                official_hyperframes_runtime: None,
                runtime_kind: Some("hermes".into()),
            };
        }
    };
    hermes_doctor_from_manifest(&manifest, pack_root, profile_root, query_version)
}

/// `hermes_doctor()` — checks: python present, `hermes --version` == pin,
/// profile root writable (spec §11 5.1). Manifest `allowed: false` short-
/// circuits to `blocked` before any other check runs.
pub fn hermes_doctor_from_manifest(
    manifest: &HermesRuntimeManifest,
    pack_root: &Path,
    profile_root: &Path,
    query_version: impl Fn(&Path) -> HermesVersionQuery,
) -> DoctorSummary {
    let mut checks = Vec::new();
    let mut recommended_actions = Vec::new();

    checks.push(DoctorCheck {
        id: "hermes_runtime_manifest".into(),
        status: if manifest.allowed { "ok" } else { "error" }.into(),
        message: if manifest.allowed {
            format!("Hermes runtime pack {} is allowed.", manifest.version)
        } else {
            manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Hermes runtime pack is denied by policy.".into())
        },
        details_json: json!({ "runtimeId": manifest.runtime_id, "version": manifest.version }),
    });
    if !manifest.allowed {
        recommended_actions.push("Install an allowed Hermes runtime pack version".into());
        return DoctorSummary {
            status: "blocked".into(),
            checks,
            recommended_actions,
            official_hyperframes_runtime: None,
            runtime_kind: Some("hermes".into()),
        };
    }

    let python_path = pack_root.join(&manifest.python_relative_path);
    let hermes_path = pack_root.join(&manifest.hermes_relative_path);

    let python_present = python_path.is_file();
    checks.push(DoctorCheck {
        id: "hermes_python_present".into(),
        status: if python_present { "ok" } else { "error" }.into(),
        message: if python_present {
            "Bundled Python runtime is present.".into()
        } else {
            "Bundled Python runtime is missing from the Hermes runtime pack.".into()
        },
        details_json: json!({ "pythonPath": python_path.to_string_lossy() }),
    });
    if !python_present {
        recommended_actions
            .push("Reinstall the Hermes runtime pack (missing bundled Python).".into());
    }

    let (version_status, version_message, queried_version) = match query_version(&hermes_path) {
        Ok(output) => {
            let trimmed = output.trim().to_string();
            if trimmed.contains(HERMES_PINNED_VERSION) {
                (
                    "ok",
                    format!("hermes --version reports the pinned {HERMES_PINNED_VERSION}."),
                    Some(trimmed),
                )
            } else {
                (
                    "warn",
                    format!(
                        "hermes --version reported \"{trimmed}\", expected the pinned {HERMES_PINNED_VERSION}."
                    ),
                    Some(trimmed),
                )
            }
        }
        Err(error) => (
            "error",
            format!("Unable to run hermes --version: {error}"),
            None,
        ),
    };
    checks.push(DoctorCheck {
        id: "hermes_version".into(),
        status: version_status.into(),
        message: version_message,
        details_json: json!({ "expected": HERMES_PINNED_VERSION, "reported": queried_version }),
    });
    if version_status == "warn" {
        recommended_actions.push(format!(
            "Update the Hermes runtime pack to the pinned version {HERMES_PINNED_VERSION}."
        ));
    } else if version_status == "error" {
        recommended_actions
            .push("Reinstall the Hermes runtime pack (hermes binary is not runnable).".into());
    }

    let profile_root_writable = ensure_writable_dir(profile_root);
    checks.push(DoctorCheck {
        id: "hermes_profile_root_writable".into(),
        status: if profile_root_writable { "ok" } else { "error" }.into(),
        message: if profile_root_writable {
            "Hermes profile root is writable.".into()
        } else {
            "Hermes profile root is not writable.".into()
        },
        details_json: json!({ "profileRoot": profile_root.to_string_lossy() }),
    });
    if !profile_root_writable {
        recommended_actions.push("Grant write access to the Hermes profile directory.".into());
    }

    let has_error = checks.iter().any(|check| check.status == "error");
    let has_warn = checks.iter().any(|check| check.status == "warn");
    DoctorSummary {
        status: if has_error {
            "blocked"
        } else if has_warn {
            "degraded"
        } else {
            "ready"
        }
        .into(),
        checks,
        recommended_actions,
        official_hyperframes_runtime: None,
        runtime_kind: Some("hermes".into()),
    }
}

fn ensure_writable_dir(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write_probe");
    match fs::write(&probe, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(allowed: bool) -> HermesRuntimeManifest {
        HermesRuntimeManifest {
            runtime_id: HERMES_RUNTIME_ID_WINDOWS.into(),
            version: "0.1.0".into(),
            hermes_version: HERMES_PINNED_VERSION.into(),
            python_relative_path: "python/python.exe".into(),
            hermes_relative_path: "python/Scripts/hermes.exe".into(),
            checksum_file: "SHA256SUMS".into(),
            signature_file: "SHA256SUMS.sig".into(),
            allowed,
            deny_reason: None,
            archive_url: None,
            archive_sha256: None,
            archive_size_bytes: None,
        }
    }

    fn write_python(root: &Path, manifest: &HermesRuntimeManifest) {
        let python_path = root.join(&manifest.python_relative_path);
        fs::create_dir_all(python_path.parent().unwrap()).unwrap();
        fs::write(&python_path, b"fake python").unwrap();
    }

    #[test]
    fn doctor_is_ready_when_python_pin_and_profile_root_all_pass() {
        let dir = tempfile::tempdir().unwrap();
        let pack_root = dir.path().join("pack");
        let profile_root = dir.path().join("profiles");
        let manifest = manifest(true);
        write_python(&pack_root, &manifest);

        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
            Ok("hermes-cli 0.18.2".to_string())
        });

        assert_eq!(summary.status, "ready");
        assert!(profile_root.is_dir());
    }

    #[test]
    fn doctor_degrades_on_version_mismatch_and_names_the_pin() {
        let dir = tempfile::tempdir().unwrap();
        let pack_root = dir.path().join("pack");
        let profile_root = dir.path().join("profiles");
        let manifest = manifest(true);
        write_python(&pack_root, &manifest);

        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
            Ok("hermes-cli 0.17.0".to_string())
        });

        assert_eq!(summary.status, "degraded");
        let version_check = summary
            .checks
            .iter()
            .find(|check| check.id == "hermes_version")
            .unwrap();
        assert_eq!(version_check.status, "warn");
        assert!(version_check.message.contains(HERMES_PINNED_VERSION));
    }

    #[test]
    fn doctor_blocks_when_hermes_binary_is_missing_or_unrunnable() {
        let dir = tempfile::tempdir().unwrap();
        let pack_root = dir.path().join("pack");
        let profile_root = dir.path().join("profiles");
        let manifest = manifest(true);
        write_python(&pack_root, &manifest);

        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
            Err("no such file or directory".to_string())
        });

        assert_eq!(summary.status, "blocked");
        assert!(summary
            .checks
            .iter()
            .any(|check| check.id == "hermes_version" && check.status == "error"));
    }

    #[test]
    fn doctor_blocks_when_python_is_missing_from_the_pack() {
        let dir = tempfile::tempdir().unwrap();
        let pack_root = dir.path().join("pack");
        let profile_root = dir.path().join("profiles");
        let manifest = manifest(true);
        // Intentionally do not write the python binary.

        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
            Ok("hermes-cli 0.18.2".to_string())
        });

        assert_eq!(summary.status, "blocked");
        assert!(summary
            .checks
            .iter()
            .any(|check| check.id == "hermes_python_present" && check.status == "error"));
    }

    #[test]
    fn manifest_allowed_false_blocks_doctor_before_other_checks_run() {
        let dir = tempfile::tempdir().unwrap();
        let pack_root = dir.path().join("pack");
        let profile_root = dir.path().join("profiles");
        let mut manifest = manifest(false);
        manifest.deny_reason = Some("macOS pack has not shipped yet".into());
        write_python(&pack_root, &manifest);

        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
            panic!("query_version must not run once the manifest denies the pack");
        });

        assert_eq!(summary.status, "blocked");
        assert_eq!(summary.checks.len(), 1);
        assert!(summary
            .recommended_actions
            .iter()
            .any(|action| action.contains("allowed Hermes runtime pack")));
    }

    #[test]
    fn missing_manifest_file_reports_blocked_doctor() {
        let dir = tempfile::tempdir().unwrap();
        let summary = hermes_doctor_from_manifest_path(
            &dir.path().join("manifest.json"),
            &dir.path().join("pack"),
            &dir.path().join("profiles"),
            |_path| Ok("hermes-cli 0.18.2".to_string()),
        );

        assert_eq!(summary.status, "blocked");
        assert!(summary
            .recommended_actions
            .contains(&"Install the Hermes runtime pack".to_string()));
    }

    #[test]
    fn runtime_pack_paths_resolve_under_the_app_data_dir() {
        let dir = tempfile::tempdir().unwrap();
        let (manifest_path, root) = hermes_runtime_pack_paths(dir.path());

        assert_eq!(root, dir.path().join("hermes-runtime"));
        assert_eq!(
            manifest_path,
            dir.path().join("hermes-runtime/manifest.json")
        );
    }
}
