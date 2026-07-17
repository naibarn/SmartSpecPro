use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::credentials::WorkerDeviceBinding;
use crate::runtime_manifest::DoctorSummary;
use crate::settings::{SharingMode, WorkerAppSettings};

pub const WORKER_APP_PROTOCOL_VERSION: &str = "2026-04-06";
pub const WORKER_RUNTIME_FAMILY_SCHEMA_VERSION: &str = "2026-04-08";
pub const WORKER_RUNTIME_PROFILE_SCHEMA_VERSION: &str = "2026-04-08";
pub const WORKER_RUNTIME_TYPE: &str = "desktop_zeroclaw_managed";
pub const HYPERFRAMES_CAPABILITY: &str = "hyperframes_final_composite";
/// Feature 135 §11 — matches `HERMES_MEDIA_CAPABILITY_FAMILY` in
/// `hermes_executor.rs` (frozen to `apps/web/shared/workerRuntime.ts`'s
/// `HERMES_MEDIA_CAPABILITY_FAMILIES[0]`).
pub const HERMES_MEDIA_CAPABILITY: &str = "hermes-media-generation";

/// Feature 135 §11 — registration-time Hermes readiness input. Kept as its
/// own struct (rather than extra `build_registration_payload` positional
/// params) so callers that have no Hermes doctor yet (i.e. it hasn't been
/// installed) can pass `HermesRegistrationInfo::not_installed()`.
#[derive(Debug, Clone)]
pub struct HermesRegistrationInfo {
    pub ready: bool,
    pub reason: String,
    pub hermes_version: Option<String>,
}

impl HermesRegistrationInfo {
    pub fn not_installed() -> Self {
        Self {
            ready: false,
            reason: "hermes_not_installed".into(),
            hermes_version: None,
        }
    }

    pub fn from_doctor(doctor: &DoctorSummary, hermes_version: Option<String>) -> Self {
        let ready = doctor.status == "ready";
        Self {
            ready,
            reason: if ready {
                "doctor_passed".into()
            } else {
                "doctor_not_ready".into()
            },
            hermes_version,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerProtocolCompatibility {
    pub protocol_version: String,
    pub runtime_version: String,
    pub runtime_family_schema_version: String,
    pub runtime_profile_schema_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRuntimeMetadata {
    pub desktop_version: String,
    pub runtime_profile: String,
    pub workspace_roots_summary: Vec<Value>,
    pub gpu_snapshot: Value,
    pub toolchain_summary: Value,
    pub doctor_summary: Value,
    pub service_mode: String,
    pub execution_identity: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAppRegistrationPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub runtime_type: String,
    pub worker_mode: String,
    pub runtime_mode: String,
    pub display_name: String,
    pub external_reference: String,
    pub machine_id: String,
    pub machine_name: String,
    pub dashboard_url: Option<String>,
    pub max_concurrent_jobs: u8,
    pub capabilities_json: Value,
    pub health_summary_json: Value,
    pub hardware_json: Value,
    pub runtime_metadata_json: WorkerRuntimeMetadata,
    pub device_binding: WorkerDeviceBinding,
}

pub fn build_registration_payload(
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    device_binding: WorkerDeviceBinding,
) -> WorkerAppRegistrationPayload {
    build_registration_payload_with_hermes(
        settings,
        doctor,
        device_binding,
        &HermesRegistrationInfo::not_installed(),
    )
}

/// Feature 135 §11 — same payload as `build_registration_payload`, plus
/// `capabilitiesJson.hermesMedia = { capability, advertised, reason,
/// hermesVersion }`, gated on the Hermes doctor exactly like `hyperframes`
/// is gated on its own doctor.
pub fn build_registration_payload_with_hermes(
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
    device_binding: WorkerDeviceBinding,
    hermes: &HermesRegistrationInfo,
) -> WorkerAppRegistrationPayload {
    let ready = doctor.status == "ready";
    let machine_name = machine_name();
    let machine_id = sanitize_identifier(&machine_name)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "local-worker".into());
    let worker_mode = match settings.sharing_mode {
        SharingMode::Private => "per_user",
        SharingMode::Group | SharingMode::Tenant => "shared_department",
    };
    let execution_identity_mode = match settings.sharing_mode {
        SharingMode::Private => "user_bound",
        SharingMode::Group | SharingMode::Tenant => "service_identity",
    };
    let approval_mode = match settings.sharing_mode {
        SharingMode::Private => "owner_approved",
        SharingMode::Group => "team_approved",
        SharingMode::Tenant => "admin_approved",
    };
    let budget_attribution_mode = match settings.sharing_mode {
        SharingMode::Private => "owner_budget",
        SharingMode::Group => "team_budget",
        SharingMode::Tenant => "cost_center_budget",
    };
    let workspace_roots_summary = if settings.workspace_dir.trim().is_empty() {
        Vec::new()
    } else {
        vec![json!({
            "root": settings.workspace_dir.trim(),
            "accessMode": "workspace_scoped",
        })]
    };

    WorkerAppRegistrationPayload {
        compatibility: WorkerProtocolCompatibility {
            protocol_version: WORKER_APP_PROTOCOL_VERSION.into(),
            runtime_version: env!("CARGO_PKG_VERSION").into(),
            runtime_family_schema_version: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION.into(),
            runtime_profile_schema_version: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION.into(),
        },
        runtime_type: WORKER_RUNTIME_TYPE.into(),
        worker_mode: worker_mode.into(),
        runtime_mode: "native_constrained".into(),
        display_name: settings.worker_label.clone(),
        external_reference: format!("worker-app://{machine_id}"),
        machine_id: machine_id.clone(),
        machine_name,
        dashboard_url: Some(format!("{}/render-jobs", settings.normalized_server_url())),
        max_concurrent_jobs: settings.max_concurrent_jobs,
        capabilities_json: json!({
            "hyperframes": {
                "capability": HYPERFRAMES_CAPABILITY,
                "advertised": ready,
                "reason": if ready { "doctor_passed" } else { "doctor_not_ready" },
            },
            "hermesMedia": {
                "capability": HERMES_MEDIA_CAPABILITY,
                "advertised": hermes.ready,
                "reason": hermes.reason,
                "hermesVersion": hermes.hermes_version,
            },
            "workerApp": {
                "sharingMode": settings.sharing_mode,
                "acceptJobs": settings.accept_jobs && ready,
            }
        }),
        health_summary_json: serde_json::to_value(doctor).unwrap_or_else(|_| json!({})),
        hardware_json: json!({
            "machineName": machine_id,
        }),
        runtime_metadata_json: WorkerRuntimeMetadata {
            desktop_version: env!("CARGO_PKG_VERSION").into(),
            runtime_profile: "native_constrained".into(),
            workspace_roots_summary,
            gpu_snapshot: json!({}),
            toolchain_summary: json!({
                "hyperframes": if ready { "ready" } else { "not_ready" },
            }),
            doctor_summary: serde_json::to_value(doctor).unwrap_or_else(|_| json!({})),
            service_mode: "foreground".into(),
            execution_identity: json!({
                "mode": execution_identity_mode,
                "approvalMode": approval_mode,
                "budgetAttributionMode": budget_attribution_mode,
                "tokenRotationTriggers": ["manual_reissue", "policy_change", "revocation"],
            }),
        },
        device_binding,
    }
}

fn machine_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "local-worker".into())
}

fn sanitize_identifier(value: &str) -> Option<String> {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_lowercase();
    (!sanitized.is_empty()).then_some(sanitized)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerApiClientShape {
    pub server_url: String,
    pub connect_route: String,
    pub register_route: String,
    pub heartbeat_route: String,
    pub claim_route: String,
    pub diagnostics_route: String,
}

impl WorkerApiClientShape {
    pub fn for_server(server_url: &str) -> Self {
        let base = server_url.trim_end_matches('/');
        Self {
            server_url: base.into(),
            connect_route: format!("{base}/workers/connect"),
            register_route: format!("{base}/api/workers/register"),
            heartbeat_route: format!("{base}/api/workers/heartbeat"),
            claim_route: format!("{base}/api/worker-jobs/claim"),
            diagnostics_route: format!("{base}/api/workers/diagnostics"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_manifest::DoctorSummary;
    use crate::settings::WorkerAppSettings;

    #[test]
    fn registration_advertises_hyperframes_only_when_doctor_is_ready() {
        let settings = WorkerAppSettings {
            accept_jobs: true,
            ..WorkerAppSettings::default()
        };
        let blocked = DoctorSummary {
            status: "blocked".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: None,
        };
        let ready = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: None,
        };

        let device_binding = WorkerDeviceBinding {
            device_id: "wdev_test".into(),
            machine_fingerprint: "machine_test".into(),
            public_key: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----".into(),
        };
        let blocked_payload =
            build_registration_payload(&settings, &blocked, device_binding.clone());
        let ready_payload = build_registration_payload(&settings, &ready, device_binding.clone());

        assert_eq!(blocked_payload.runtime_type, "desktop_zeroclaw_managed");
        assert_eq!(blocked_payload.device_binding.device_id, "wdev_test");
        assert_eq!(blocked_payload.worker_mode, "per_user");
        assert_eq!(blocked_payload.compatibility.protocol_version, "2026-04-06");
        assert_eq!(
            blocked_payload.capabilities_json["hyperframes"]["advertised"],
            false
        );
        assert_eq!(
            ready_payload.runtime_metadata_json.service_mode,
            "foreground"
        );
        assert_eq!(
            ready_payload.capabilities_json["hyperframes"]["advertised"],
            true
        );
        // Feature 135 §11 — hermesMedia defaults to not-advertised when the
        // caller doesn't pass Hermes readiness info at all.
        assert_eq!(
            blocked_payload.capabilities_json["hermesMedia"]["advertised"],
            false
        );
        assert_eq!(
            blocked_payload.capabilities_json["hermesMedia"]["capability"],
            "hermes-media-generation"
        );
    }

    #[test]
    fn registration_advertises_hermes_media_only_when_hermes_doctor_is_ready() {
        let settings = WorkerAppSettings {
            accept_jobs: true,
            ..WorkerAppSettings::default()
        };
        let ready_hyperframes = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: None,
        };
        let hermes_blocked = DoctorSummary {
            status: "blocked".into(),
            checks: vec![],
            recommended_actions: vec!["Install the Hermes runtime pack".into()],
            official_hyperframes_runtime: None,
            runtime_kind: Some("hermes".into()),
        };
        let hermes_ready = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
            official_hyperframes_runtime: None,
            runtime_kind: Some("hermes".into()),
        };
        let device_binding = WorkerDeviceBinding {
            device_id: "wdev_test".into(),
            machine_fingerprint: "machine_test".into(),
            public_key: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----".into(),
        };

        let blocked_payload = build_registration_payload_with_hermes(
            &settings,
            &ready_hyperframes,
            device_binding.clone(),
            &HermesRegistrationInfo::from_doctor(&hermes_blocked, None),
        );
        let ready_payload = build_registration_payload_with_hermes(
            &settings,
            &ready_hyperframes,
            device_binding,
            &HermesRegistrationInfo::from_doctor(&hermes_ready, Some("hermes-cli 0.18.2".into())),
        );

        assert_eq!(
            blocked_payload.capabilities_json["hermesMedia"]["advertised"],
            false
        );
        assert_eq!(
            blocked_payload.capabilities_json["hermesMedia"]["reason"],
            "doctor_not_ready"
        );
        assert_eq!(
            ready_payload.capabilities_json["hermesMedia"]["advertised"],
            true
        );
        assert_eq!(
            ready_payload.capabilities_json["hermesMedia"]["hermesVersion"],
            "hermes-cli 0.18.2"
        );
        // Registering hermes readiness must never disturb the independent
        // hyperframes gate.
        assert_eq!(
            ready_payload.capabilities_json["hyperframes"]["advertised"],
            true
        );
    }

    #[test]
    fn api_client_shape_uses_browser_connect_route_and_api_runtime_routes() {
        let shape = WorkerApiClientShape::for_server("https://smartaihub.app/");

        assert_eq!(shape.server_url, "https://smartaihub.app");
        assert_eq!(
            shape.connect_route,
            "https://smartaihub.app/workers/connect"
        );
        assert_eq!(
            shape.register_route,
            "https://smartaihub.app/api/workers/register"
        );
        assert_eq!(
            shape.heartbeat_route,
            "https://smartaihub.app/api/workers/heartbeat"
        );
    }
}
