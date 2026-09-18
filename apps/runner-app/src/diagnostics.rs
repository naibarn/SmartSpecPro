use crate::adapters::{apply_probe, probe_candidate};
use crate::config::RunnerConfig;
use crate::control_channel::ControlChannel;
use crate::device_proof::DeviceProofSigner;
use crate::discovery::{scan_environment, CapabilityDimension, ToolCandidate, TrustState};
use crate::protocol::Envelope;
use crate::transport::{
    ControlEndpoint, NativeControlTransport, TransportCoordinator, TransportError,
};
use serde_json::json;

const DEFAULT_REFRESH_INTERVAL_SECONDS: u64 = 300;
const MIN_REFRESH_INTERVAL_SECONDS: u64 = 15;
const MAX_REFRESH_INTERVAL_SECONDS: u64 = 86_400;

pub fn redacted_status(config: &RunnerConfig, command: &str) -> String {
    let tools = scan_environment(config.profile);
    let ready_tools = tools
        .iter()
        .filter(|tool| tool.trust_state == TrustState::Ready)
        .count();
    json!({
        "command": command,
        "profile": config.profile,
        "runnerId": config.runner_id,
        "state": "ready",
        "toolCount": tools.len(),
        "readyToolCount": ready_tools,
        "tools": tools,
        "credentials": "redacted"
    })
    .to_string()
}

pub fn connection_status(config: &RunnerConfig, command: &str) -> Result<String, String> {
    let control_url = config
        .control_url
        .as_deref()
        .ok_or_else(|| "RUNNER_CONTROL_URL_REQUIRED".to_string())?;
    let endpoint = ControlEndpoint::from_control_url(control_url)?;
    let access_token = std::env::var("SAH_RUNNER_ACCESS_TOKEN").unwrap_or_default();
    if access_token.trim().is_empty() {
        return Err("RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL".into());
    }

    let mut tools = scan_environment(config.profile);
    for tool in &mut tools {
        if tool.executable_path.is_some() && tool.adapter_id.is_some() {
            if let Ok(probe) = probe_candidate(tool, std::time::Duration::from_secs(1)) {
                let _ = apply_probe(tool, probe);
            }
        }
    }
    let node_kind = match config.profile {
        crate::config::RunnerProfile::LocalDevice => crate::protocol::NodeKind::LocalDevice,
        crate::config::RunnerProfile::SharedContainer => {
            crate::protocol::NodeKind::ManagedContainer
        }
    };
    let mut channel = ControlChannel::default();
    channel.connect();
    channel.authenticated();
    let snapshot = capability_snapshot(config, &tools);
    let snapshot_revision = snapshot
        .get("revision")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let capability_event = channel.next_event(Envelope::new(
        node_kind,
        &config.runner_id,
        config.job_id.as_deref(),
        config.attempt_id.as_deref(),
        config.lease_id.as_deref(),
        json!({ "type": "runner.capabilities.update", "snapshot": snapshot }),
    ))?;
    let reconciliation_event = channel.next_event(Envelope::new(
        node_kind,
        &config.runner_id,
        config.job_id.as_deref(),
        config.attempt_id.as_deref(),
        config.lease_id.as_deref(),
        json!({
            "type": "runner.reconcile",
            "capabilityRevision": snapshot_revision,
            "activeJobs": [],
            "command": command
        }),
    ))?;
    let snapshot_count = capability_event
        .payload
        .get("snapshot")
        .and_then(|snapshot| snapshot.get("toolInventory"))
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    let mut coordinator = TransportCoordinator::new(endpoint, 128)?;
    coordinator.enqueue(capability_event)?;
    coordinator.enqueue(reconciliation_event)?;
    let device_proof = match config.profile {
        crate::config::RunnerProfile::LocalDevice => DeviceProofSigner::from_env(
            config.device_id.as_deref().unwrap_or_default(),
            &access_token,
        )?,
        crate::config::RunnerProfile::SharedContainer => None,
    };
    let mut transport = NativeControlTransport::with_device_proof(
        access_token,
        std::time::Duration::from_secs(10),
        device_proof,
    )?;
    let mut delivery = json!({ "delivery": "accepted" });
    for attempt in 0..2 {
        match coordinator.flush_one(&mut transport) {
            Ok(Some(ack)) => {
                if coordinator.reconcile("delivery").pending_events > 0 {
                    continue;
                }
                delivery = if attempt == 0 {
                    json!({ "delivery": "accepted", "ack": ack })
                } else {
                    json!({ "delivery": "https_fallback", "ack": ack })
                };
                break;
            }
            Ok(None) => break,
            Err(TransportError::Unavailable) if attempt == 0 => continue,
            Err(error) => {
                delivery = json!({ "delivery": "queued", "error": format!("{error:?}") });
                break;
            }
        }
    }
    let report = coordinator.reconcile("runner_startup");
    Ok(json!({
        "command": command,
        "state": if report.pending_events == 0 { "connected" } else { "reconciling" },
        "transport": "wss_fast_path_with_https_fallback",
        "delivery": delivery,
        "snapshotToolCount": snapshot_count,
        "pendingEvents": report.pending_events,
        "unknownActiveScopes": report.unknown_active_scopes,
        "credentials": "accepted_from_environment_and_redacted"
    })
    .to_string())
}

/// Runs the local-device lifecycle. Each refresh creates a fresh authenticated
/// control attempt, so a transient WSS failure is handled by the same bounded
/// HTTPS fallback and reconciliation path as `connect`/`reconnect`.
pub fn run_local_entrypoint(config: &RunnerConfig) -> Result<(), String> {
    if config.profile != crate::config::RunnerProfile::LocalDevice {
        return Err("RUNNER_ENTRYPOINT_REQUIRES_LOCAL_DEVICE".into());
    }
    let interval = refresh_interval_seconds()?;
    loop {
        match connection_status(config, "run") {
            Ok(status) => println!("{status}"),
            Err(error) => eprintln!("runner refresh error: {error}"),
        }
        std::thread::sleep(interval);
    }
}

pub fn refresh_interval_seconds() -> Result<std::time::Duration, String> {
    parse_refresh_interval(
        std::env::var("SAH_RUNNER_REFRESH_INTERVAL_SECONDS")
            .ok()
            .as_deref(),
    )
}

fn parse_refresh_interval(raw: Option<&str>) -> Result<std::time::Duration, String> {
    let seconds = match raw {
        None => DEFAULT_REFRESH_INTERVAL_SECONDS,
        Some(value) => value
            .parse::<u64>()
            .map_err(|_| "RUNNER_REFRESH_INTERVAL_INVALID".to_string())?,
    };
    if !(MIN_REFRESH_INTERVAL_SECONDS..=MAX_REFRESH_INTERVAL_SECONDS).contains(&seconds) {
        return Err("RUNNER_REFRESH_INTERVAL_OUT_OF_RANGE".into());
    }
    Ok(std::time::Duration::from_secs(seconds))
}

fn capability_snapshot(config: &RunnerConfig, tools: &[ToolCandidate]) -> serde_json::Value {
    let observed_at = current_time_iso();
    let expires_at = current_time_iso_after(std::time::Duration::from_secs(300));
    let tool_inventory = tools
        .iter()
        .map(|tool| {
            json!({
                "toolId": tool.tool_id,
                "kind": serde_json::to_value(tool.kind).unwrap_or_else(|_| json!("generic_cli")),
                "displayName": tool.display_name,
                "version": tool.version,
                "adapterId": tool.adapter_id,
                "adapterVersion": serde_json::Value::Null,
                "discoverySource": tool.discovery_source,
                "installState": if tool.install_state == CapabilityDimension::Unavailable { "not_installed" } else { "installed" },
                "configurationState": dimension_to_configuration(tool.configuration_state),
                "authState": dimension_to_auth(tool.auth_state),
                "healthState": dimension_to_health(tool.health_state),
                "availabilityState": dimension_to_availability(tool.availability_state, tool.trust_state),
                "trustState": tool.trust_state,
                "fingerprint": tool.fingerprint,
                "observedAt": observed_at,
                "expiresAt": expires_at,
                "reasonCodes": tool.reason_codes,
            })
        })
        .collect::<Vec<_>>();
    let capability_inventory = tools
        .iter()
        .map(|tool| {
            json!({
                "capabilityId": format!("tool.execute.{}", tool.tool_id),
                "contractVersion": "sah-cap-v1",
                "implementationId": tool.adapter_id.as_deref().unwrap_or(&tool.tool_id),
                "controlProfile": tool.control_profile,
                "resourceProfile": "medium",
                "maxConcurrency": u64::from(tool.concurrency_limit.max(1)),
                "availabilityState": dimension_to_availability(tool.availability_state, tool.trust_state),
                "policyDecision": "pending",
                "confidence": if tool.trust_state == TrustState::Ready { 1.0 } else { 0.5 },
                "observedAt": observed_at,
                "expiresAt": expires_at,
                "reasonCodes": tool.reason_codes,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "runnerId": config.runner_id,
        "revision": format!("snapshot:{}:{}", config.runner_id, observed_at),
        "observedAt": observed_at,
        "expiresAt": expires_at,
        "capabilities": tools.iter().map(|tool| format!("tool.execute.{}", tool.tool_id)).collect::<Vec<_>>(),
        "workspaceIds": [],
        "resourceClass": "medium",
        "platform": {
            "os": std::env::consts::OS,
            "architecture": std::env::consts::ARCH,
            "target": target_triple(),
        },
        "toolInventory": tool_inventory,
        "capabilityInventory": capability_inventory,
    })
}

fn target_triple() -> String {
    match std::env::consts::OS {
        "windows" => format!("{}-pc-windows-msvc", std::env::consts::ARCH),
        "macos" => format!("{}-apple-darwin", std::env::consts::ARCH),
        "linux" => format!("{}-unknown-linux-gnu", std::env::consts::ARCH),
        other => format!("{}-{}", std::env::consts::ARCH, other),
    }
}

fn dimension_to_configuration(dimension: CapabilityDimension) -> &'static str {
    match dimension {
        CapabilityDimension::Ready => "configured",
        _ => "unknown",
    }
}

fn dimension_to_auth(dimension: CapabilityDimension) -> &'static str {
    match dimension {
        CapabilityDimension::Ready => "authenticated",
        CapabilityDimension::Required => "auth_required",
        CapabilityDimension::Failed => "auth_failed",
        _ => "unknown",
    }
}

fn dimension_to_health(dimension: CapabilityDimension) -> &'static str {
    match dimension {
        CapabilityDimension::Ready => "healthy",
        CapabilityDimension::Failed => "unhealthy",
        _ => "unknown",
    }
}

fn dimension_to_availability(dimension: CapabilityDimension, trust: TrustState) -> &'static str {
    match (dimension, trust) {
        (CapabilityDimension::Ready, TrustState::Busy) => "busy",
        (CapabilityDimension::Ready, _) => "available",
        (CapabilityDimension::Unavailable, _) | (_, TrustState::Unsupported) => "unavailable",
        (_, TrustState::Disabled) => "disabled",
        _ => "unknown",
    }
}

fn current_time_iso() -> String {
    current_time_iso_after(std::time::Duration::ZERO)
}

fn current_time_iso_after(offset: std::time::Duration) -> String {
    let now = std::time::SystemTime::now()
        .checked_add(offset)
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let duration = now
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let total_days = (duration.as_secs() / 86_400) as i64;
    let seconds_today = duration.as_secs() % 86_400;
    let (year, month, day) = civil_from_days(total_days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds_today / 3_600,
        (seconds_today % 3_600) / 60,
        seconds_today % 60,
        duration.subsec_millis()
    )
}

// Howard Hinnant's Gregorian calendar conversion, kept local to avoid a date dependency in the
// headless Runner binary.
fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let shifted = days_since_unix_epoch + 719_468;
    let era = if shifted >= 0 {
        shifted / 146_097
    } else {
        (shifted - 146_096) / 146_097
    };
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

#[cfg(test)]
mod lifecycle_tests {
    use super::parse_refresh_interval;
    use std::time::Duration;

    #[test]
    fn refresh_interval_is_bounded_and_defaults_safely() {
        assert_eq!(
            parse_refresh_interval(None).unwrap(),
            Duration::from_secs(300)
        );
        assert_eq!(
            parse_refresh_interval(Some("15")).unwrap(),
            Duration::from_secs(15)
        );
        assert_eq!(
            parse_refresh_interval(Some("86400")).unwrap(),
            Duration::from_secs(86_400)
        );
        assert_eq!(
            parse_refresh_interval(Some("14")).unwrap_err(),
            "RUNNER_REFRESH_INTERVAL_OUT_OF_RANGE"
        );
        assert_eq!(
            parse_refresh_interval(Some("not-a-number")).unwrap_err(),
            "RUNNER_REFRESH_INTERVAL_INVALID"
        );
    }
}
