use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePackManifest {
    pub runtime_id: String,
    pub version: String,
    pub hyperframes_version: String,
    pub browser_version: String,
    pub ffmpeg_version: String,
    pub ffprobe_version: String,
    pub thai_font_family: String,
    pub sidecar_path: String,
    pub sidecar_sha256: String,
    pub checksum_file: String,
    pub signature_file: String,
    pub license_notices: Vec<String>,
    pub supported_contract_versions: Vec<String>,
    pub runtime_profile_hash: String,
    pub allowed: bool,
    pub deny_reason: Option<String>,
    pub rollback_to_version: Option<String>,
    #[serde(default)]
    pub archive_url: Option<String>,
    #[serde(default)]
    pub archive_sha256: Option<String>,
    #[serde(default)]
    pub archive_size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorCheck {
    pub id: String,
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub details_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSummary {
    pub status: String,
    pub checks: Vec<DoctorCheck>,
    #[serde(default)]
    pub recommended_actions: Vec<String>,
}

pub fn doctor_from_default_paths(resource_dir: &Path) -> DoctorSummary {
    let manifest_path = resource_dir.join("runtime-pack").join("manifest.json");
    let sidecar_root = resource_dir.join("sidecars");
    doctor_from_manifest_path(&manifest_path, &sidecar_root)
}

pub fn runtime_pack_paths(resource_dir: &Path, app_data_dir: &Path) -> (PathBuf, PathBuf) {
    let installed_manifest_path = app_data_dir.join("runtime-pack").join("manifest.json");
    if installed_manifest_path.is_file() {
        return (installed_manifest_path, app_data_dir.join("sidecars"));
    }
    (
        resource_dir.join("runtime-pack").join("manifest.json"),
        resource_dir.join("sidecars"),
    )
}

pub fn doctor_from_installed_or_default_paths(
    resource_dir: &Path,
    app_data_dir: &Path,
) -> DoctorSummary {
    let (manifest_path, sidecar_root) = runtime_pack_paths(resource_dir, app_data_dir);
    doctor_from_manifest_path(&manifest_path, &sidecar_root)
}

pub fn doctor_from_manifest_path(manifest_path: &Path, sidecar_root: &Path) -> DoctorSummary {
    let manifest = match read_runtime_pack_manifest(manifest_path) {
        Ok(manifest) => manifest,
        Err(error) => {
            return DoctorSummary {
                status: "blocked".into(),
                checks: vec![DoctorCheck {
                    id: "runtime_manifest".into(),
                    status: "error".into(),
                    message: format!("Runtime manifest is unavailable: {error}"),
                    details_json: json!({ "path": manifest_path.to_string_lossy() }),
                }],
                recommended_actions: vec!["Install official HyperFrames runtime pack".into()],
            };
        }
    };

    doctor_from_manifest(&manifest, sidecar_root)
}

pub fn read_runtime_pack_manifest(manifest_path: &Path) -> Result<RuntimePackManifest, String> {
    fs::read_to_string(manifest_path)
        .map_err(|error| error.to_string())
        .and_then(|contents| {
            serde_json::from_str::<RuntimePackManifest>(&contents)
                .map_err(|error| error.to_string())
        })
}

pub fn sidecar_path_from_manifest(manifest: &RuntimePackManifest, sidecar_root: &Path) -> PathBuf {
    safe_join(sidecar_root, &manifest.sidecar_path)
}

pub fn doctor_from_manifest(manifest: &RuntimePackManifest, sidecar_root: &Path) -> DoctorSummary {
    let mut checks = Vec::new();
    let mut recommended_actions = Vec::new();
    let sidecar_path = safe_join(sidecar_root, &manifest.sidecar_path);
    let runtime_root = runtime_pack_root_for_sidecars(sidecar_root);
    let checksum_path = safe_join(&runtime_root, &manifest.checksum_file);
    let signature_path = safe_join(&runtime_root, &manifest.signature_file);
    let sidecar_exists = sidecar_path.exists();
    let runtime_bundled = ![
        manifest.version.as_str(),
        manifest.hyperframes_version.as_str(),
        manifest.browser_version.as_str(),
        manifest.ffmpeg_version.as_str(),
        manifest.ffprobe_version.as_str(),
    ]
    .iter()
    .any(|value| *value == "0.0.0-placeholder" || *value == "not-bundled");

    checks.push(DoctorCheck {
        id: "runtime_manifest".into(),
        status: if manifest.allowed { "ok" } else { "error" }.into(),
        message: if manifest.allowed {
            format!("Runtime pack {} is allowed.", manifest.version)
        } else {
            manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Runtime pack is denied by policy.".into())
        },
        details_json: json!({
            "runtimeId": manifest.runtime_id,
            "version": manifest.version,
            "runtimeProfileHash": manifest.runtime_profile_hash,
            "rollbackToVersion": manifest.rollback_to_version,
        }),
    });
    if !manifest.allowed {
        recommended_actions.push("Install an allowed runtime version".into());
    }

    checks.push(DoctorCheck {
        id: "runtime_bundle".into(),
        status: if runtime_bundled { "ok" } else { "error" }.into(),
        message: if runtime_bundled {
            "Official HyperFrames runtime bundle is present.".into()
        } else {
            "This Worker App build does not bundle the official HyperFrames runtime yet.".into()
        },
        details_json: json!({
            "hyperframesVersion": manifest.hyperframes_version,
            "browserVersion": manifest.browser_version,
            "ffmpegVersion": manifest.ffmpeg_version,
            "ffprobeVersion": manifest.ffprobe_version,
        }),
    });
    if !runtime_bundled {
        recommended_actions.push(
            "Install a signed Smart AI Hub Worker runtime build that includes HyperFrames, browser, FFmpeg, ffprobe, and Thai fonts.".into(),
        );
    }

    checks.push(DoctorCheck {
        id: "hyperframes_sidecar".into(),
        status: if sidecar_exists { "ok" } else { "error" }.into(),
        message: if sidecar_exists {
            "HyperFrames sidecar is present.".into()
        } else {
            "HyperFrames sidecar is missing.".into()
        },
        details_json: json!({ "path": sidecar_path.to_string_lossy() }),
    });
    if !sidecar_exists {
        recommended_actions.push("Install official HyperFrames runtime pack".into());
    }

    let hash_ok = sidecar_exists
        && file_sha256(&sidecar_path)
            .map(|digest| digest == manifest.sidecar_sha256)
            .unwrap_or(false);
    checks.push(DoctorCheck {
        id: "runtime_hash".into(),
        status: if hash_ok { "ok" } else { "error" }.into(),
        message: if hash_ok {
            "Runtime sidecar hash matches manifest.".into()
        } else {
            "Runtime sidecar hash does not match manifest.".into()
        },
        details_json: json!({
            "expectedSha256": manifest.sidecar_sha256,
            "checksumFile": manifest.checksum_file,
            "signatureFile": manifest.signature_file,
        }),
    });
    if !hash_ok {
        recommended_actions.push("Verify or reinstall render runtime".into());
    }

    let checksum_exists = checksum_path.is_file();
    let signature_exists = signature_path.is_file();
    checks.push(DoctorCheck {
        id: "runtime_signature_bundle".into(),
        status: if checksum_exists && signature_exists {
            "ok"
        } else {
            "error"
        }
        .into(),
        message: if checksum_exists && signature_exists {
            "Runtime checksum and signature files are present.".into()
        } else {
            "Runtime checksum or signature file is missing.".into()
        },
        details_json: json!({
            "checksumFile": checksum_path.to_string_lossy(),
            "signatureFile": signature_path.to_string_lossy(),
            "cryptographicVerification": "pending_official_public_key",
        }),
    });
    if !(checksum_exists && signature_exists) {
        recommended_actions.push(
            "Install the signed official runtime pack with checksum and signature files".into(),
        );
    }

    let thai_font_ok = !manifest.thai_font_family.trim().is_empty();
    checks.push(DoctorCheck {
        id: "thai_font".into(),
        status: if thai_font_ok { "ok" } else { "error" }.into(),
        message: if thai_font_ok {
            format!("Thai font configured: {}", manifest.thai_font_family)
        } else {
            "Thai font is not configured.".into()
        },
        details_json: json!({ "fontFamily": manifest.thai_font_family }),
    });
    if !thai_font_ok {
        recommended_actions.push("Install the render runtime Thai font pack".into());
    }

    checks.push(DoctorCheck {
        id: "tool_versions".into(),
        status: if manifest.license_notices.is_empty() {
            "error"
        } else {
            "ok"
        }
        .into(),
        message: if manifest.license_notices.is_empty() {
            "Runtime license notices are missing.".into()
        } else {
            "Runtime tool versions and license notices are declared.".into()
        },
        details_json: json!({
            "hyperframes": manifest.hyperframes_version,
            "browser": manifest.browser_version,
            "ffmpeg": manifest.ffmpeg_version,
            "ffprobe": manifest.ffprobe_version,
            "contracts": manifest.supported_contract_versions,
            "licenseNotices": manifest.license_notices,
        }),
    });
    if manifest.license_notices.is_empty() {
        recommended_actions.push("Install a license-complete official runtime pack".into());
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
    }
}

pub fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn safe_join(root: &Path, relative: &str) -> PathBuf {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() {
        return relative_path.to_path_buf();
    }
    root.join(relative_path)
}

fn runtime_pack_root_for_sidecars(sidecar_root: &Path) -> PathBuf {
    if sidecar_root
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "sidecars")
    {
        if let Some(parent) = sidecar_root.parent() {
            return parent.join("runtime-pack");
        }
    }
    sidecar_root.to_path_buf()
}
