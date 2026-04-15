use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

use crate::device_attestation::{
    describe_device_attestation_support, DeviceAttestationSupportReport,
};
use crate::device_identity::read_device_identity;
use crate::local_file_service::{
    describe_local_file_parser_capabilities, LocalFileParserCapabilityReport,
};
use crate::video_editor::ffmpeg::{find_system_ffmpeg, find_system_ffprobe};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentityCapabilityReport {
    pub key_algorithm: String,
    pub key_version: u32,
    pub public_key_digest_sha256: String,
    pub attestation_mode: String,
    pub secret_storage: String,
    pub storage_protection: String,
    pub storage_provider: String,
    pub os_attested: bool,
    pub hardware_backed: bool,
    pub attestation_provider: String,
    pub attestation_evidence_sha256: Option<String>,
    pub attestation_claims: Vec<String>,
    pub proof_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeCapabilitiesReport {
    pub device_identity: DeviceIdentityCapabilityReport,
    pub device_attestation_support: DeviceAttestationSupportReport,
    pub local_file_service: LocalFileParserCapabilityReport,
    pub worker_toolchain: DesktopWorkerToolchainReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerToolchainReport {
    pub ffmpeg_available: bool,
    pub ffprobe_available: bool,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub media_pipeline_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerDoctorCheck {
    pub id: String,
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub details_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWorkerDoctorSummary {
    pub status: String,
    pub checks: Vec<DesktopWorkerDoctorCheck>,
    #[serde(default)]
    pub recommended_actions: Vec<String>,
}

pub fn build_desktop_worker_toolchain_report() -> DesktopWorkerToolchainReport {
    let ffmpeg_path = find_system_ffmpeg();
    let ffprobe_path = find_system_ffprobe();
    DesktopWorkerToolchainReport {
        ffmpeg_available: ffmpeg_path.is_some(),
        ffprobe_available: ffprobe_path.is_some(),
        ffmpeg_path: ffmpeg_path.as_ref().map(|path| path.to_string_lossy().to_string()),
        ffprobe_path: ffprobe_path.as_ref().map(|path| path.to_string_lossy().to_string()),
        media_pipeline_ready: ffmpeg_path.is_some() && ffprobe_path.is_some(),
    }
}

pub fn build_desktop_worker_doctor_summary(
    base_dir: &Path,
    device_id: &str,
    workspace_dir: Option<&Path>,
) -> DesktopWorkerDoctorSummary {
    let mut checks = Vec::new();
    let mut recommended_actions = Vec::new();

    match read_device_identity(base_dir, device_id) {
        Ok(identity) => checks.push(DesktopWorkerDoctorCheck {
            id: "device_identity".into(),
            status: "ok".into(),
            message: "device identity is available".into(),
            details_json: json!({
                "keyVersion": identity.key_version,
                "attestationMode": identity.attestation_mode,
                "secretStorage": identity.secret_storage,
                "storageProtection": identity.storage_protection,
                "attestationProvider": identity.attestation_provider,
                "attestationClaims": identity.attestation_claims,
            }),
        }),
        Err(error) => {
            checks.push(DesktopWorkerDoctorCheck {
                id: "device_identity".into(),
                status: "error".into(),
                message: format!("device identity is unavailable: {error}"),
                details_json: json!({}),
            });
            recommended_actions.push("initialize_or_rotate_device_identity".into());
        }
    }

    let attestation_support = describe_device_attestation_support();
    checks.push(DesktopWorkerDoctorCheck {
        id: "device_attestation_support".into(),
        status: if attestation_support.helper_configured && !attestation_support.helper_reachable {
            "warn".into()
        } else {
            "ok".into()
        },
        message: if attestation_support.helper_configured && !attestation_support.helper_reachable {
            "configured attestation broker is not reachable".into()
        } else {
            format!(
                "attestation evidence source is {} ({})",
                attestation_support.evidence_source, attestation_support.provider_hint
            )
        },
        details_json: json!({
            "evidenceSource": attestation_support.evidence_source,
            "helperConfigured": attestation_support.helper_configured,
            "helperReachable": attestation_support.helper_reachable,
            "defaultMode": attestation_support.default_mode,
            "providerHint": attestation_support.provider_hint,
            "supportedModes": attestation_support.supported_modes,
            "notes": attestation_support.notes,
        }),
    });
    if attestation_support.helper_configured && !attestation_support.helper_reachable {
        recommended_actions.push("repair_or_reconfigure_device_attestation_broker".into());
    }

    let parser = describe_local_file_parser_capabilities();
    checks.push(DesktopWorkerDoctorCheck {
        id: "local_file_parser".into(),
        status: if parser.enabled { "ok" } else { "error" }.into(),
        message: if parser.enabled {
            "local file parser is ready"
        } else {
            "local file parser is disabled"
        }
        .into(),
        details_json: json!({
            "isolationMode": parser.isolation_mode,
            "ocrProvider": parser.ocr_provider,
            "pdfExtractor": parser.pdf_extractor,
            "renderBackend": parser.render_backend,
            "macroInspectionSupported": parser.macro_inspection_supported,
            "embeddedMediaInspectionSupported": parser.embedded_media_inspection_supported,
            "layoutAnalysisMode": parser.layout_analysis_mode,
            "multiPageRenderingSupported": parser.multi_page_rendering_supported,
            "maxRenderedPages": parser.max_rendered_pages,
            "fullRenderingSupported": parser.full_rendering_supported,
        }),
    });
    if !parser.enabled {
        recommended_actions.push("repair_local_file_parser_runtime".into());
    }

    let toolchain = build_desktop_worker_toolchain_report();
    checks.push(DesktopWorkerDoctorCheck {
        id: "media_toolchain".into(),
        status: if toolchain.media_pipeline_ready { "ok" } else { "warn" }.into(),
        message: if toolchain.media_pipeline_ready {
            "ffmpeg and ffprobe are available"
        } else {
            "ffmpeg or ffprobe is missing; media jobs may not run"
        }
        .into(),
        details_json: json!({
            "ffmpegAvailable": toolchain.ffmpeg_available,
            "ffprobeAvailable": toolchain.ffprobe_available,
            "ffmpegPath": toolchain.ffmpeg_path,
            "ffprobePath": toolchain.ffprobe_path,
        }),
    });
    if !toolchain.media_pipeline_ready {
        recommended_actions.push("install_or_configure_ffmpeg_toolchain".into());
    }

    if let Some(workspace_dir) = workspace_dir {
        let absolute = workspace_dir.is_absolute();
        let exists = workspace_dir.exists();
        let is_dir = workspace_dir.is_dir();
        let workspace_ok = absolute && exists && is_dir;
        checks.push(DesktopWorkerDoctorCheck {
            id: "workspace_root".into(),
            status: if workspace_ok { "ok" } else { "warn" }.into(),
            message: if workspace_ok {
                "workspace root is ready"
            } else {
                "workspace root is not ready for managed execution"
            }
            .into(),
            details_json: json!({
                "path": workspace_dir.to_string_lossy(),
                "absolute": absolute,
                "exists": exists,
                "isDirectory": is_dir,
            }),
        });
        if !workspace_ok {
            recommended_actions.push("prepare_managed_workspace_directory".into());
        }
    }

    let has_error = checks.iter().any(|check| check.status == "error");
    let has_warn = checks.iter().any(|check| check.status == "warn");

    DesktopWorkerDoctorSummary {
        status: if has_error {
            "error".into()
        } else if has_warn {
            "degraded".into()
        } else {
            "ok".into()
        },
        checks,
        recommended_actions,
    }
}

pub fn build_desktop_runtime_capabilities(
    base_dir: &Path,
    device_id: &str,
) -> Result<DesktopRuntimeCapabilitiesReport, String> {
    let identity = read_device_identity(base_dir, device_id)?;
    Ok(DesktopRuntimeCapabilitiesReport {
        device_identity: DeviceIdentityCapabilityReport {
            key_algorithm: identity.key_algorithm,
            key_version: identity.key_version,
            public_key_digest_sha256: identity.public_key_digest_sha256,
            attestation_mode: identity.attestation_mode,
            secret_storage: identity.secret_storage,
            storage_protection: identity.storage_protection,
            storage_provider: identity.storage_provider,
            os_attested: identity.os_attested,
            hardware_backed: identity.hardware_backed,
            attestation_provider: identity.attestation_provider,
            attestation_evidence_sha256: identity.attestation_evidence_sha256,
            attestation_claims: identity.attestation_claims,
            proof_kind: "ed25519_signature".into(),
        },
        device_attestation_support: describe_device_attestation_support(),
        local_file_service: describe_local_file_parser_capabilities(),
        worker_toolchain: build_desktop_worker_toolchain_report(),
    })
}

#[tauri::command]
pub async fn desktop_host_build_runtime_capabilities(
    base_dir: String,
    device_id: String,
) -> Result<DesktopRuntimeCapabilitiesReport, String> {
    build_desktop_runtime_capabilities(Path::new(&base_dir), &device_id)
}

#[tauri::command]
pub async fn desktop_host_build_worker_doctor_summary(
    base_dir: String,
    device_id: String,
    workspace_dir: Option<String>,
) -> Result<DesktopWorkerDoctorSummary, String> {
    Ok(build_desktop_worker_doctor_summary(
        Path::new(&base_dir),
        &device_id,
        workspace_dir.as_deref().map(Path::new),
    ))
}
