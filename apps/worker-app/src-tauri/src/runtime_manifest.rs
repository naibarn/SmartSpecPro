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

pub fn doctor_from_manifest_path(manifest_path: &Path, sidecar_root: &Path) -> DoctorSummary {
    let manifest = match fs::read_to_string(manifest_path)
        .map_err(|error| error.to_string())
        .and_then(|contents| serde_json::from_str::<RuntimePackManifest>(&contents).map_err(|error| error.to_string()))
    {
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
                recommended_actions: vec!["Download render runtime".into()],
            };
        }
    };

    doctor_from_manifest(&manifest, sidecar_root)
}

pub fn doctor_from_manifest(manifest: &RuntimePackManifest, sidecar_root: &Path) -> DoctorSummary {
    let mut checks = Vec::new();
    let mut recommended_actions = Vec::new();
    let sidecar_path = safe_join(sidecar_root, &manifest.sidecar_path);
    let sidecar_exists = sidecar_path.exists();

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
        recommended_actions.push("Download render runtime".into());
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
        status: "ok".into(),
        message: "Runtime tool versions are declared.".into(),
        details_json: json!({
            "hyperframes": manifest.hyperframes_version,
            "browser": manifest.browser_version,
            "ffmpeg": manifest.ffmpeg_version,
            "ffprobe": manifest.ffprobe_version,
            "contracts": manifest.supported_contract_versions,
            "licenseNotices": manifest.license_notices,
        }),
    });

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
