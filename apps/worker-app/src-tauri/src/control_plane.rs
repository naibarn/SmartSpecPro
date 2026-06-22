use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::runtime_manifest::DoctorSummary;
use crate::settings::WorkerAppSettings;

pub const WORKER_APP_PROTOCOL_VERSION: &str = "2026-06-22";
pub const WORKER_RUNTIME_TYPE: &str = "smart_ai_hub_worker_app";
pub const HYPERFRAMES_CAPABILITY: &str = "hyperframes_final_composite";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAppRegistrationPayload {
    pub protocol_version: String,
    pub runtime_type: String,
    pub display_name: String,
    pub accept_jobs: bool,
    pub sharing_mode: String,
    pub max_concurrent_jobs: u8,
    pub capabilities_json: Value,
    pub health_summary_json: Value,
}

pub fn build_registration_payload(
    settings: &WorkerAppSettings,
    doctor: &DoctorSummary,
) -> WorkerAppRegistrationPayload {
    let ready = doctor.status == "ready";
    WorkerAppRegistrationPayload {
        protocol_version: WORKER_APP_PROTOCOL_VERSION.into(),
        runtime_type: WORKER_RUNTIME_TYPE.into(),
        display_name: settings.worker_label.clone(),
        accept_jobs: settings.accept_jobs && ready,
        sharing_mode: serde_json::to_value(&settings.sharing_mode)
            .ok()
            .and_then(|value| value.as_str().map(String::from))
            .unwrap_or_else(|| "private".into()),
        max_concurrent_jobs: settings.max_concurrent_jobs,
        capabilities_json: json!({
            "hyperframes": {
                "capability": HYPERFRAMES_CAPABILITY,
                "advertised": ready,
                "reason": if ready { "doctor_passed" } else { "doctor_not_ready" },
            }
        }),
        health_summary_json: serde_json::to_value(doctor).unwrap_or_else(|_| json!({})),
    }
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
            connect_route: format!("{base}/api/workers/connect"),
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
        };
        let ready = DoctorSummary {
            status: "ready".into(),
            checks: vec![],
            recommended_actions: vec![],
        };

        let blocked_payload = build_registration_payload(&settings, &blocked);
        let ready_payload = build_registration_payload(&settings, &ready);

        assert_eq!(blocked_payload.accept_jobs, false);
        assert_eq!(
            blocked_payload.capabilities_json["hyperframes"]["advertised"],
            false
        );
        assert_eq!(ready_payload.accept_jobs, true);
        assert_eq!(
            ready_payload.capabilities_json["hyperframes"]["advertised"],
            true
        );
    }
}
