use crate::adapters::{
    apply_probe, build_browser_authorization_grant, execute_browser_candidate,
    build_external_agent_authorization_ref,
    probe_browser_candidate, probe_candidate, AdapterProbeResult, BrowserAuthorizationGrant,
};
use crate::config::RunnerConfig;
use crate::control_channel::{ControlChannel, RunnerExecutionBinding};
use crate::device_proof::DeviceProofSigner;
use crate::device_proof::{canonical_json_bytes, endpoint_path};
use crate::discovery::{scan_environment, CapabilityDimension, ToolCandidate, TrustState};
use crate::external_agent::{start_external_agent, ExternalAgentProcess, ExternalAgentResult};
use crate::protocol::{
    AckState, Envelope, NodeKind, RunnerJobCommand, RunnerJobReceipt, RunnerJobReceiptEventType,
};
use crate::transport::{
    ControlEndpoint, ControlTransport, NativeControlTransport, TransportCoordinator,
    TransportError, TransportMode,
};
use crate::update::apply_verified_update;
use crate::{
    MIN_COMPATIBLE_RUNNER_VERSION, RUNNER_CONNECT_SCHEMA_REVISION, RUNNER_CONTROL_CONTRACT_VERSION,
    RUNNER_VERSION,
};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_REFRESH_INTERVAL_SECONDS: u64 = 300;
const MIN_REFRESH_INTERVAL_SECONDS: u64 = 15;
const MAX_REFRESH_INTERVAL_SECONDS: u64 = 86_400;
const CONTROL_CHANNEL_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

fn keepalive_due(idle_for: Duration, interval: Duration) -> bool {
    idle_for >= interval
}

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
        "runnerVersion": RUNNER_VERSION,
        "contractVersion": RUNNER_CONTROL_CONTRACT_VERSION,
        "connectSchemaRevision": RUNNER_CONNECT_SCHEMA_REVISION,
        "minRunnerVersion": MIN_COMPATIBLE_RUNNER_VERSION,
        "supportedRunnerContractVersions": [RUNNER_CONTROL_CONTRACT_VERSION],
        "supportedConnectSchemaRevisions": [RUNNER_CONNECT_SCHEMA_REVISION],
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
    let configured_token = std::env::var("SAH_RUNNER_ACCESS_TOKEN").unwrap_or_default();
    let stored_connection = if configured_token.trim().is_empty() {
        crate::connection::load_or_refresh(config)?
    } else {
        None
    };
    let access_token = if configured_token.trim().is_empty() {
        stored_connection
            .as_ref()
            .map(|connection| connection.control_token.clone())
            .unwrap_or_default()
    } else {
        configured_token.clone()
    };
    if access_token.trim().is_empty() {
        return Err("RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL".into());
    }

    let runner_session_id = stored_connection
        .as_ref()
        .and_then(|connection| connection.runner_session_id.clone())
        .or_else(|| crate::connection::token_runner_session_id(&access_token));
    let tenant_id = stored_connection
        .as_ref()
        .and_then(|connection| connection.tenant_id.clone())
        .or_else(|| crate::connection::token_tenant_id(&access_token));
    let browser_grant = runner_session_id.as_deref().and_then(|session_id| {
        tenant_id.as_deref().and_then(|tenant_id| {
            crate::connection::token_expiry_ms(&access_token).map(|expires_at_ms| {
                build_browser_authorization_grant(
                    &config.runner_id,
                    session_id,
                    tenant_id,
                    expires_at_ms,
                )
            })
        })
    });
    let mut tools = scan_environment(config.profile);
    for tool in &mut tools {
        if tool.executable_path.is_some() && tool.adapter_id.is_some() {
            if matches!(tool.kind, crate::discovery::ToolKind::Browser) {
                if let Some(grant) = browser_grant.as_ref() {
                    match probe_browser_candidate(tool, std::time::Duration::from_secs(10), grant) {
                        Ok(probe) => {
                            let _ = apply_probe(tool, probe.result);
                            tool.authorization_evidence_ref =
                                Some(grant.authorization_evidence_ref.clone());
                            tool.probe_evidence_ref = Some(probe.evidence.probe_evidence_ref);
                        }
                        Err(error) => {
                            let version = probe_candidate(tool, std::time::Duration::from_secs(1))
                                .ok()
                                .map(|probe| probe.version)
                                .or_else(|| Some("browser_probe_failed".into()));
                            let _ = apply_probe(
                                tool,
                                AdapterProbeResult {
                                    version: version
                                        .unwrap_or_else(|| "browser_probe_failed".into()),
                                    authenticated: true,
                                    healthy: false,
                                    available: false,
                                    reason_codes: vec![
                                        "runner_session_authorized".into(),
                                        "browser_probe_failed".into(),
                                        error.chars().take(96).collect(),
                                    ],
                                },
                            );
                            tool.authorization_evidence_ref =
                                Some(grant.authorization_evidence_ref.clone());
                        }
                    }
                } else if let Ok(probe) = probe_candidate(tool, std::time::Duration::from_secs(1)) {
                    let _ = apply_probe(tool, probe);
                }
            } else if let Ok(probe) = probe_candidate(tool, std::time::Duration::from_secs(1)) {
                let _ = apply_probe(tool, probe);
                if deterministic_certification_adapter_enabled() {
                    if let (Some(adapter_id), Some(session_id), Some(tenant_id)) = (
                        tool.adapter_id.as_deref(),
                        runner_session_id.as_deref(),
                        tenant_id.as_deref(),
                    ) {
                        if matches!(adapter_id, "codex.v1" | "claude.v1")
                            && tool.trust_state == TrustState::Ready
                        {
                            tool.authorization_evidence_ref = Some(
                                build_external_agent_authorization_ref(
                                    &config.runner_id,
                                    session_id,
                                    tenant_id,
                                    adapter_id,
                                    snapshot_expiry_ms(),
                                ),
                            );
                        }
                    }
                }
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
    let snapshot = capability_snapshot(
        config,
        &tools,
        runner_session_id.as_deref(),
        tenant_id.as_deref(),
        endpoint.control_plane_origin(),
    );
    let execution_snapshot = snapshot.clone();
    let snapshot_revision = snapshot
        .get("revision")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let correlation_id = format!(
        "runner:{}:{}:{}",
        config.runner_id,
        command,
        current_time_iso()
    );
    let mut capability_envelope = Envelope::new(
        node_kind,
        &config.runner_id,
        config.job_id.as_deref(),
        config.attempt_id.as_deref(),
        config.lease_id.as_deref(),
        json!({ "type": "runner.capabilities.update", "snapshot": snapshot }),
    );
    capability_envelope.correlation_id = correlation_id.clone();
    let capability_event = channel.next_event(capability_envelope)?;
    let mut reconciliation_envelope = Envelope::new(
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
    );
    reconciliation_envelope.correlation_id = correlation_id;
    let reconciliation_event = channel.next_event(reconciliation_envelope)?;
    let snapshot_count = capability_event
        .payload
        .get("snapshot")
        .and_then(|snapshot| snapshot.get("toolInventory"))
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    let mut coordinator = TransportCoordinator::new(endpoint.clone(), 128)?;
    coordinator.enqueue(capability_event)?;
    coordinator.enqueue(reconciliation_event)?;
    let device_proof = match config.profile {
        crate::config::RunnerProfile::LocalDevice if !configured_token.trim().is_empty() => {
            DeviceProofSigner::from_env(
                config.device_id.as_deref().unwrap_or_default(),
                &access_token,
            )?
        }
        crate::config::RunnerProfile::LocalDevice => stored_connection
            .as_ref()
            .map(|connection| {
                DeviceProofSigner::from_material(
                    &crate::device_proof::DeviceProofMaterial {
                        device_id: connection.device_id.clone(),
                        machine_fingerprint: connection.machine_fingerprint.clone(),
                        public_key_pem: connection.public_key_pem.clone(),
                        private_key_pem: connection.private_key_pem.clone(),
                    },
                    &access_token,
                )
            })
            .transpose()?,
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
                if !matches!(
                    ack,
                    AckState::Accepted | AckState::Applied | AckState::Duplicate
                ) {
                    delivery = json!({
                        "delivery": "rejected",
                        "ackState": format!("{ack:?}")
                    });
                    break;
                }
                if coordinator.reconcile("delivery").pending_events > 0 {
                    continue;
                }
                delivery = json!({
                    "delivery": delivery_transport_label(coordinator.mode()),
                    "ack": ack,
                });
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
    if command == "run" {
        return run_live_control_loop(
            config,
            &endpoint,
            &mut transport,
            &mut channel,
            node_kind,
            browser_grant,
            &execution_snapshot,
        );
    }
    let report = coordinator.reconcile("runner_startup");
    Ok(json!({
        "command": command,
        "state": if report.pending_events == 0 { "connected" } else { "reconciling" },
        "transport": "wss_fast_path_with_https_fallback",
        "deliveryTransport": delivery_transport_label(coordinator.mode()),
        "delivery": delivery,
        "capabilitySnapshot": snapshot_evidence(&execution_snapshot),
        "snapshotToolCount": snapshot_count,
        "pendingEvents": report.pending_events,
        "unknownActiveScopes": report.unknown_active_scopes,
        "credentials": "accepted_from_environment_and_redacted"
    })
    .to_string())
}

fn delivery_transport_label(mode: TransportMode) -> &'static str {
    match mode {
        TransportMode::WssFastPath => "wss",
        TransportMode::HttpsDurableFallback => "https_fallback",
    }
}

fn snapshot_evidence(snapshot: &serde_json::Value) -> serde_json::Value {
    let browser = snapshot
        .get("computerUse")
        .and_then(|value| value.get("browser"));
    let manifest = browser.and_then(|value| value.get("manifest"));
    let browser_tool = snapshot
        .get("toolInventory")
        .and_then(serde_json::Value::as_array)
        .and_then(|tools| {
            tools.iter().find(|tool| {
                tool.get("toolId").and_then(serde_json::Value::as_str) == Some("browser")
            })
        });
    json!({
        "runnerId": snapshot.get("runnerId"),
        "tenantId": snapshot.get("tenantId"),
        "runnerSessionId": snapshot.get("runnerSessionId"),
        "capabilitySnapshotId": snapshot.get("capabilitySnapshotId"),
        "controlPlaneOrigin": snapshot.get("controlPlaneOrigin"),
        "revision": snapshot.get("revision"),
        "observedAt": snapshot.get("observedAt"),
        "expiresAt": snapshot.get("expiresAt"),
        "browser": {
            "availabilityState": browser.and_then(|value| value.get("availabilityState")),
            "authState": browser.and_then(|value| value.get("authState")),
            "probeState": browser.and_then(|value| value.get("probeState")),
            "discoverySource": browser_tool.and_then(|value| value.get("discoverySource")),
            "browserEngine": manifest.and_then(|value| value.get("browserEngine")),
            "browserVersion": manifest.and_then(|value| value.get("browserVersion")),
            "authorizationEvidenceRef": manifest.and_then(|value| value.get("authorizationEvidenceRef")),
            "probeEvidenceRef": manifest.and_then(|value| value.get("probeEvidenceRef")),
        }
    })
}

fn run_live_control_loop(
    config: &RunnerConfig,
    endpoint: &ControlEndpoint,
    transport: &mut NativeControlTransport,
    channel: &mut ControlChannel,
    node_kind: NodeKind,
    browser_grant: Option<BrowserAuthorizationGrant>,
    snapshot: &serde_json::Value,
) -> Result<String, String> {
    let browser_manifest = snapshot
        .get("computerUse")
        .and_then(|value| value.get("browser"))
        .and_then(|value| value.get("manifest"))
        .unwrap_or(&serde_json::Value::Null);
    let browser_ready = snapshot
        .get("computerUse")
        .and_then(|value| value.get("browser"))
        .and_then(|value| value.get("availabilityState"))
        .and_then(serde_json::Value::as_str)
        == Some("available")
        && browser_manifest
            .get("authState")
            .and_then(serde_json::Value::as_str)
            == Some("authenticated")
        && browser_manifest
            .get("probeState")
            .and_then(serde_json::Value::as_str)
            == Some("ready")
        && browser_manifest
            .get("supports")
            .and_then(|value| value.get("structuredObservation"))
            .and_then(serde_json::Value::as_bool)
            == Some(true);
    let tenant_id = snapshot
        .get("tenantId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_TENANT_REQUIRED".to_string())?;
    let runner_session_id = snapshot
        .get("runnerSessionId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_SESSION_REQUIRED".to_string())?;
    let snapshot_id = snapshot
        .get("capabilitySnapshotId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_CAPABILITY_SNAPSHOT_REQUIRED".to_string())?;
    let revision = snapshot
        .get("revision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_CAPABILITY_REVISION_REQUIRED".to_string())?;
    let expires_at = snapshot
        .get("expiresAt")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_CAPABILITY_EXPIRY_REQUIRED".to_string())?;
    channel.bind_execution(RunnerExecutionBinding {
        runner_id: config.runner_id.clone(),
        tenant_id: tenant_id.to_string(),
        runner_session_id: runner_session_id.to_string(),
        capability_snapshot_id: snapshot_id.to_string(),
        capability_snapshot_revision: revision.to_string(),
        control_plane_origin: snapshot
            .get("controlPlaneOrigin")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "RUNNER_CONTROL_PLANE_ORIGIN_REQUIRED".to_string())?
            .to_string(),
        capability_expires_at: expires_at.to_string(),
        browser_ready,
        authorization_grant_ref: browser_grant
            .as_ref()
            .map(|grant| grant.authorization_evidence_ref.clone())
            .unwrap_or_default(),
    });
    let external_agent_adapters = snapshot
        .get("toolInventory")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let adapter = tool.get("adapterId").and_then(serde_json::Value::as_str)?;
            let ready = tool.get("trustState").and_then(serde_json::Value::as_str) == Some("ready")
                && tool.get("availabilityState").and_then(serde_json::Value::as_str)
                    .is_some_and(|state| matches!(state, "available" | "busy"))
                && tool.get("authState").and_then(serde_json::Value::as_str)
                    .is_some_and(|state| matches!(state, "authenticated" | "not_required"));
            if ready && matches!(adapter, "codex.v1" | "claude.v1") {
                Some(adapter.to_string())
            } else {
                None
            }
        })
        .collect();
    channel.bind_external_agent_adapters(external_agent_adapters);
    let external_agent_authorization_refs = snapshot
        .get("toolInventory")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let adapter = tool.get("adapterId").and_then(serde_json::Value::as_str)?;
            let evidence = tool
                .get("authorizationEvidenceRef")
                .and_then(serde_json::Value::as_str)?;
            matches!(adapter, "codex.v1" | "claude.v1")
                .then(|| (adapter.to_string(), evidence.to_string()))
        })
        .collect();
    channel.bind_external_agent_authorization_refs(external_agent_authorization_refs);
    let mut receipt_sequences = std::collections::HashMap::<String, u64>::new();
    let mut external_processes = std::collections::HashMap::<String, ActiveExternalAgent>::new();
    let mut last_keepalive = std::time::Instant::now();
    loop {
        if keepalive_due(last_keepalive.elapsed(), CONTROL_CHANNEL_KEEPALIVE_INTERVAL) {
            let keepalive = build_keepalive_envelope(
                channel,
                node_kind,
                &config.runner_id,
                revision,
            )?;
            match transport.send_wss(&endpoint.wss_url, &keepalive) {
                Ok(AckState::Accepted | AckState::Applied | AckState::Duplicate) => {
                    last_keepalive = std::time::Instant::now();
                }
                Ok(other) => return Err(format!("RUNNER_KEEPALIVE_REJECTED_{other:?}")),
                Err(error) => return Err(format!("RUNNER_KEEPALIVE_DELIVERY_{error:?}")),
            }
        }
        poll_external_agents(
            endpoint,
            transport,
            channel,
            node_kind,
            &mut receipt_sequences,
            &mut external_processes,
        )?;
        let incoming = match transport.receive_server_message() {
            Ok(incoming) => incoming,
            Err(TransportError::Idle) => continue,
            Err(error) => return Err(format!("RUNNER_CONTROL_CHANNEL_{error:?}")),
        };
        let envelope: Envelope = serde_json::from_value(incoming.clone())
            .map_err(|_| "RUNNER_SERVER_ENVELOPE_INVALID".to_string())?;
        let Some(payload) = envelope
            .payload
            .get("type")
            .and_then(serde_json::Value::as_str)
        else {
            continue;
        };
        if payload != "runner.job.command" {
            continue;
        }
        let command: RunnerJobCommand = serde_json::from_value(
            envelope
                .payload
                .get("command")
                .cloned()
                .ok_or_else(|| "RUNNER_COMMAND_MISSING".to_string())?,
        )
        .map_err(|_| "RUNNER_COMMAND_INVALID".to_string())?;
        let remote_ack = channel.accept_remote(&envelope);
        if remote_ack != AckState::Applied {
            send_runner_receipt(
                endpoint,
                transport,
                channel,
                node_kind,
                &command,
                &mut receipt_sequences,
                RunnerJobReceiptEventType::CommandRejected,
                "rejected",
                Some("RUNNER_COMMAND_OUT_OF_ORDER"),
                None,
            )?;
            continue;
        }
        let accepted = channel.accept_job_command(&command, &current_time_iso());
        let accepted_state = match accepted {
            Ok(AckState::Duplicate) => continue,
            Ok(AckState::Accepted) => true,
            Ok(_) => false,
            Err(error) => {
                send_runner_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &command,
                    &mut receipt_sequences,
                    RunnerJobReceiptEventType::CommandRejected,
                    "rejected",
                    Some(&error),
                    None,
                )?;
                false
            }
        };
        if !accepted_state {
            continue;
        }
        send_runner_receipt(
            endpoint,
            transport,
            channel,
            node_kind,
            &command,
            &mut receipt_sequences,
            RunnerJobReceiptEventType::CommandReceived,
            "received",
            None,
            None,
        )?;
        send_runner_receipt(
            endpoint,
            transport,
            channel,
            node_kind,
            &command,
            &mut receipt_sequences,
            RunnerJobReceiptEventType::CommandAccepted,
            "accepted",
            None,
            None,
        )?;
        if command.command_type == "cancel" {
            if command.execution_kind == "external_agent_task" {
                if let Some(mut active) = external_processes.remove(&command.command_id) {
                    let _ = active.process.cancel();
                }
            }
            send_runner_receipt(
                endpoint,
                transport,
                channel,
                node_kind,
                &command,
                &mut receipt_sequences,
                RunnerJobReceiptEventType::CancelAcknowledged,
                "cancelled",
                None,
                None,
            )?;
            continue;
        }
        send_runner_receipt(
            endpoint,
            transport,
            channel,
            node_kind,
            &command,
            &mut receipt_sequences,
            RunnerJobReceiptEventType::ExecutionStarted,
            "running",
            None,
            None,
        )?;
        if command.execution_kind == "external_agent_task" {
            let candidate = scan_environment(config.profile)
                .into_iter()
                .find(|tool| tool.adapter_id.as_deref() == Some(command.adapter_id.as_str()));
            let result = candidate
                .ok_or_else(|| "RUNNER_AGENT_NOT_DISCOVERED".to_string())
                .and_then(|mut candidate| {
                    let probe = probe_candidate(&candidate, std::time::Duration::from_secs(1))?;
                    apply_probe(&mut candidate, probe)?;
                    start_external_agent(config, &command, &candidate, std::time::Instant::now())
                });
            match result {
                Ok(process) => {
                    external_processes.insert(
                        command.command_id.clone(),
                        ActiveExternalAgent { command, process },
                    );
                }
                Err(error) => {
                    send_external_receipt(
                        endpoint,
                        transport,
                        channel,
                        node_kind,
                        &command,
                        &mut receipt_sequences,
                        RunnerJobReceiptEventType::ExecutionFailed,
                        "failed",
                        None,
                        Some(&error),
                    )?;
                }
            }
            continue;
        }
        let candidate = scan_environment(config.profile)
            .into_iter()
            .find(|tool| tool.adapter_id.as_deref() == Some("browser.v1"))
            .ok_or_else(|| "RUNNER_BROWSER_NOT_DISCOVERED".to_string());
        let result = candidate.and_then(|candidate| {
            let grant = browser_grant
                .as_ref()
                .ok_or_else(|| "RUNNER_BROWSER_AUTHORIZATION_REQUIRED".to_string())?;
            execute_browser_candidate(
                &candidate,
                std::time::Duration::from_secs(30),
                grant,
                &command.payload,
            )
        });
        match result {
            Ok(evidence) => {
                if let Some(observation) = evidence.semantic_observation.as_ref() {
                    channel.record_semantic_observation(&command, observation)?;
                }
                send_runner_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &command,
                    &mut receipt_sequences,
                    RunnerJobReceiptEventType::EvidenceCreated,
                    "evidence",
                    None,
                    Some(&evidence),
                )?;
                send_runner_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &command,
                    &mut receipt_sequences,
                    RunnerJobReceiptEventType::ExecutionCompleted,
                    "completed",
                    None,
                    Some(&evidence),
                )?;
            }
            Err(error) => {
                send_runner_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &command,
                    &mut receipt_sequences,
                    RunnerJobReceiptEventType::ExecutionFailed,
                    "failed",
                    Some(&error),
                    None,
                )?;
            }
        }
    }
}

fn build_keepalive_envelope(
    channel: &mut ControlChannel,
    node_kind: NodeKind,
    runner_id: &str,
    capability_revision: &str,
) -> Result<Envelope, String> {
    let mut envelope = Envelope::new(
        node_kind,
        runner_id,
        None,
        None,
        None,
        json!({
            "type": "runner.reconcile",
            "capabilityRevision": capability_revision,
            "activeJobs": [],
            "command": "keepalive"
        }),
    );
    envelope.correlation_id = format!("runner:{runner_id}:keepalive:{}", current_time_iso());
    channel.next_event(envelope)
}

struct ActiveExternalAgent {
    command: RunnerJobCommand,
    process: ExternalAgentProcess,
}

fn poll_external_agents(
    endpoint: &ControlEndpoint,
    transport: &mut NativeControlTransport,
    channel: &mut ControlChannel,
    node_kind: NodeKind,
    receipt_sequences: &mut std::collections::HashMap<String, u64>,
    processes: &mut std::collections::HashMap<String, ActiveExternalAgent>,
) -> Result<(), String> {
    let command_ids = processes.keys().cloned().collect::<Vec<_>>();
    for command_id in command_ids {
        let outcome = processes
            .get_mut(&command_id)
            .map(|active| active.process.try_collect(std::time::Instant::now()));
        let Some(outcome) = outcome else { continue };
        match outcome {
            Ok(Some(result)) => {
                let active = processes.remove(&command_id).expect("active process exists");
                send_external_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &active.command,
                    receipt_sequences,
                    RunnerJobReceiptEventType::ExecutionCompleted,
                    "completed",
                    Some(&result),
                    None,
                )?;
            }
            Ok(None) => {}
            Err(error) => {
                let active = processes.remove(&command_id).expect("active process exists");
                send_external_receipt(
                    endpoint,
                    transport,
                    channel,
                    node_kind,
                    &active.command,
                    receipt_sequences,
                    RunnerJobReceiptEventType::ExecutionFailed,
                    "failed",
                    None,
                    Some(&error),
                )?;
            }
        }
    }
    Ok(())
}

fn send_external_receipt(
    endpoint: &ControlEndpoint,
    transport: &mut NativeControlTransport,
    channel: &mut ControlChannel,
    node_kind: NodeKind,
    command: &RunnerJobCommand,
    receipt_sequences: &mut std::collections::HashMap<String, u64>,
    event_type: RunnerJobReceiptEventType,
    status: &str,
    result: Option<&ExternalAgentResult>,
    error_summary: Option<&str>,
) -> Result<(), String> {
    let sequence = receipt_sequences
        .entry(command.command_id.clone())
        .or_insert(0);
    *sequence = sequence.saturating_add(1);
    let receipt = RunnerJobReceipt {
        event_id: format!("receipt:{}:{}", command.command_id, *sequence),
        event_type,
        command_id: command.command_id.clone(),
        job_id: command.job_id.clone(),
        runner_id: command.runner_id.clone(),
        runner_session_id: command.runner_session_id.clone(),
        sequence: *sequence,
        observed_at: current_time_iso(),
        status: status.into(),
        result_ref: result.map(|value| value.result_ref.clone()),
        evidence_refs: result.map(|value| vec![value.evidence_ref.clone()]),
        error_code: error_summary.map(|_| "RUNNER_EXTERNAL_AGENT_FAILED".into()),
        error_summary: error_summary.map(|value| value.chars().take(500).collect()),
        correlation: Some(json!({
            "taskId": command.payload.get("taskId"),
            "adapterId": command.adapter_id,
        })),
        payload: Some(json!({
            "executionKind": command.execution_kind,
            "adapterId": command.adapter_id,
            "attempt": command.attempt,
            "leaseId": command.lease_id,
            "fenceVersion": command.fencing_token,
            "workspaceRef": command.workspace_ref,
            "exitCode": result.map(|value| value.exit_code),
        })),
    };
    let envelope = channel.build_receipt(node_kind, command, receipt)?;
    match transport.send_wss(&endpoint.wss_url, &envelope) {
        Ok(AckState::Accepted | AckState::Applied | AckState::Duplicate) => Ok(()),
        Ok(other) => Err(format!("RUNNER_RECEIPT_REJECTED_{other:?}")),
        Err(error) => Err(format!("RUNNER_RECEIPT_DELIVERY_{error:?}")),
    }
}

fn send_runner_receipt(
    endpoint: &ControlEndpoint,
    transport: &mut NativeControlTransport,
    channel: &mut ControlChannel,
    node_kind: NodeKind,
    command: &RunnerJobCommand,
    receipt_sequences: &mut std::collections::HashMap<String, u64>,
    event_type: RunnerJobReceiptEventType,
    status: &str,
    error_summary: Option<&str>,
    evidence: Option<&crate::adapters::BrowserExecutionEvidence>,
) -> Result<(), String> {
    let sequence = receipt_sequences
        .entry(command.command_id.clone())
        .or_insert(0);
    *sequence = sequence.saturating_add(1);
    let semantic_payload = semantic_receipt_payload(command, &event_type);
    let receipt = RunnerJobReceipt {
        event_id: format!("receipt:{}:{}", command.command_id, *sequence),
        event_type,
        command_id: command.command_id.clone(),
        job_id: command.job_id.clone(),
        runner_id: command.runner_id.clone(),
        runner_session_id: command.runner_session_id.clone(),
        sequence: *sequence,
        observed_at: current_time_iso(),
        status: status.into(),
        result_ref: evidence.map(|value| value.result_ref.clone()),
        evidence_refs: evidence.map(|value| value.evidence_refs.clone()),
        error_code: error_summary.map(|_| "RUNNER_BROWSER_EXECUTION_FAILED".into()),
        error_summary: error_summary.map(|value| value.chars().take(500).collect()),
        correlation: Some(
            command
                .payload
                .get("correlation")
                .cloned()
                .unwrap_or_else(|| json!({})),
        ),
        payload: semantic_payload.and_then(|mut payload| {
            if let Some(observation) = evidence.and_then(|value| value.semantic_observation.clone())
            {
                payload["observation"] = observation;
            }
            Some(payload)
        }),
    };
    let envelope = channel.build_receipt(node_kind, command, receipt)?;
    match transport.send_wss(&endpoint.wss_url, &envelope) {
        Ok(AckState::Accepted | AckState::Applied | AckState::Duplicate) => Ok(()),
        Ok(other) => Err(format!("RUNNER_RECEIPT_REJECTED_{other:?}")),
        Err(error) => Err(format!("RUNNER_RECEIPT_DELIVERY_{error:?}")),
    }
}

/// Echoes only the bounded semantic-verification contract. Raw command input
/// (including targets, text, selectors, or credentials) must not be copied into
/// a receipt payload; execution evidence remains in the typed refs.
fn semantic_receipt_payload(
    command: &RunnerJobCommand,
    event_type: &RunnerJobReceiptEventType,
) -> Option<serde_json::Value> {
    if !matches!(
        event_type,
        RunnerJobReceiptEventType::EvidenceCreated | RunnerJobReceiptEventType::ExecutionCompleted
    ) || command.payload.get("requiresIndependentVerification") != Some(&json!(true))
    {
        return None;
    }
    let mut payload = json!({
        "requiresIndependentVerification": true,
        "stage": command.payload.get("stage").cloned().unwrap_or_else(|| json!("observe")),
    });
    for key in ["decisionRequest", "verification"] {
        if let Some(value) = command.payload.get(key) {
            payload[key] = value.clone();
        }
    }
    Some(payload)
}

/// Runs the local-device lifecycle. Each refresh creates a fresh authenticated
/// control attempt, so a transient WSS failure is handled by the same bounded
/// HTTPS fallback and reconciliation path as `connect`/`reconnect`.
pub fn run_local_entrypoint(config: &RunnerConfig) -> Result<(), String> {
    if config.profile != crate::config::RunnerProfile::LocalDevice {
        return Err("RUNNER_ENTRYPOINT_REQUIRES_LOCAL_DEVICE".into());
    }
    if let Ok(current) = std::env::current_exe() {
        cleanup_update_helpers(&current);
    }
    let interval = refresh_interval_seconds()?;
    loop {
        match connection_status(config, "run") {
            Ok(status) => println!("{status}"),
            Err(error) => eprintln!("runner refresh error: {error}"),
        }
        match poll_and_apply_update(config) {
            Ok(status) if status.contains("scheduled") => {
                println!("{status}");
                return Ok(());
            }
            Ok(status) if status != "{\"state\":\"idle\"}" => println!("{status}"),
            Ok(_) => {}
            Err(error) => eprintln!("runner update check error: {error}"),
        }
        std::thread::sleep(interval);
    }
}

/// Polls the durable update command queue and applies one signed update. The
/// server remains the authority for target, hash, signature and command state;
/// this function only performs local verification and atomic replacement.
pub fn poll_and_apply_update(config: &RunnerConfig) -> Result<String, String> {
    let control_url = config
        .control_url
        .as_deref()
        .ok_or_else(|| "RUNNER_CONTROL_URL_REQUIRED".to_string())?;
    let token = control_access_token(config)?;
    let command_url = control_url
        .trim_end_matches('/')
        .strip_suffix("/control")
        .map(|base| format!("{base}/update-commands/next"))
        .ok_or_else(|| "RUNNER_CONTROL_URL_INVALID".to_string())?;
    let command = request_json(config, "GET", &command_url, &token, b"{}")?;
    if command.is_null() {
        return Ok("{\"state\":\"idle\"}".into());
    }
    let command_id = command
        .get("commandId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_UPDATE_COMMAND_INVALID".to_string())?;
    let download_path = command
        .get("downloadUrl")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_UPDATE_DOWNLOAD_URL_MISSING".to_string())?;
    let expected_hash = command
        .get("expectedSha256")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "RUNNER_UPDATE_HASH_MISSING".to_string())?;
    let signature = command.get("signature").and_then(serde_json::Value::as_str);
    let current = std::env::current_exe().map_err(|_| "RUNNER_CURRENT_BINARY_UNAVAILABLE")?;
    let download_url = absolute_download_url(control_url, download_path)?;
    let downloaded = sibling_download_path(&current, command_id);
    let bytes = request_bytes(config, "GET", &download_url, &token, b"{}").map_err(|error| {
        fail_update(config, &command_url, command_id, &token, "download", error)
    })?;
    fs::write(&downloaded, bytes).map_err(|_| {
        fail_update(
            config,
            &command_url,
            command_id,
            &token,
            "download",
            "RUNNER_UPDATE_DOWNLOAD_WRITE_FAILED".to_string(),
        )
    })?;
    let ack_statuses = update_ack_statuses();
    acknowledge_update(
        config,
        &command_url,
        command_id,
        &token,
        ack_statuses[0],
        "verification",
        None,
    )?;

    let signature_arg = signature.unwrap_or("-");
    let helper = sibling_helper_path(&current, command_id);
    fs::copy(&current, &helper).map_err(|_| {
        fail_update(
            config,
            &command_url,
            command_id,
            &token,
            "verification",
            "RUNNER_UPDATE_HELPER_COPY_FAILED".to_string(),
        )
    })?;
    if let Ok(metadata) = fs::metadata(&current) {
        let _ = fs::set_permissions(&helper, metadata.permissions());
    }
    let child = std::process::Command::new(&helper)
        .arg("__sah-runner-update-child")
        .arg(&current)
        .arg(&downloaded)
        .arg(command_id)
        .arg(expected_hash)
        .arg(signature_arg)
        .arg(&helper)
        .spawn()
        .map_err(|_| {
            fail_update(
                config,
                &command_url,
                command_id,
                &token,
                "verification",
                "RUNNER_UPDATE_HELPER_START_FAILED".to_string(),
            )
        })?;
    drop(child);
    Ok(format!(
        "{{\"state\":\"scheduled\",\"commandId\":\"{command_id}\"}}"
    ))
}

fn update_ack_statuses() -> [&'static str; 4] {
    ["verifying", "replacing", "restarting", "completed"]
}

fn sibling_helper_path(current: &std::path::Path, command_id: &str) -> PathBuf {
    let safe = command_id
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || *value == '-' || *value == '_')
        .collect::<String>();
    let extension = current
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    current.with_file_name(format!(".sah-runner-update-helper-{safe}{extension}"))
}

fn cleanup_update_helpers(current: &std::path::Path) {
    let Some(parent) = current.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(".sah-runner-update-helper-"))
        {
            let _ = fs::remove_file(path);
        }
    }
}

fn update_command_url(control_url: &str) -> Result<String, String> {
    control_url
        .trim_end_matches('/')
        .strip_suffix("/control")
        .map(|base| format!("{base}/update-commands/next"))
        .ok_or_else(|| "RUNNER_CONTROL_URL_INVALID".to_string())
}

fn update_ack_url(command_url: &str, command_id: &str) -> String {
    format!("{command_url}/{command_id}/ack").replace("/update-commands/next/", "/update-commands/")
}

fn acknowledge_update(
    config: &RunnerConfig,
    command_url: &str,
    command_id: &str,
    token: &str,
    status: &str,
    phase: &str,
    error_code: Option<&str>,
) -> Result<(), String> {
    let mut ack = serde_json::json!({ "status": status, "phase": phase });
    if let Some(error_code) = error_code {
        ack["errorCode"] = serde_json::Value::String(error_code.to_string());
    }
    let body = canonical_json_bytes(&ack)?;
    let endpoint = update_ack_url(command_url, command_id);
    let mut last_error = "RUNNER_UPDATE_ACK_FAILED".to_string();
    for attempt in 0..2 {
        match request_json(config, "POST", &endpoint, token, &body) {
            Ok(_) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt == 0 {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
    }
    Err(last_error)
}

fn fail_update(
    config: &RunnerConfig,
    command_url: &str,
    command_id: &str,
    token: &str,
    phase: &str,
    error: String,
) -> String {
    let _ = acknowledge_update(
        config,
        command_url,
        command_id,
        token,
        "failed",
        phase,
        Some(&error),
    );
    error
}

/// Runs after the original process exits so Windows can replace the executable
/// without holding an image-file lock. The same path is used on Unix for one
/// deterministic update contract across all native targets.
pub fn run_update_child(config: &RunnerConfig, args: &[String]) -> Result<(), String> {
    if args.len() != 6 {
        return Err("RUNNER_UPDATE_HELPER_ARGS_INVALID".into());
    }
    let current = PathBuf::from(&args[0]);
    let downloaded = PathBuf::from(&args[1]);
    let command_id = &args[2];
    let expected_hash = &args[3];
    let signature = if args[4] == "-" {
        None
    } else {
        Some(args[4].as_str())
    };
    let _helper = PathBuf::from(&args[5]);
    let control_url = config
        .control_url
        .as_deref()
        .ok_or_else(|| "RUNNER_CONTROL_URL_REQUIRED".to_string())?;
    let command_url = update_command_url(control_url)?;
    let token = std::env::var("SAH_RUNNER_ACCESS_TOKEN").unwrap_or_default();
    if token.trim().is_empty() {
        return Err("RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL".into());
    }
    std::thread::sleep(std::time::Duration::from_millis(500));
    let ack_statuses = update_ack_statuses();
    acknowledge_update(
        config,
        &command_url,
        command_id,
        &token,
        ack_statuses[1],
        "replacement",
        None,
    )
    .map_err(|error| {
        fail_update(
            config,
            &command_url,
            command_id,
            &token,
            "verification",
            error,
        )
    })?;
    let public_key = std::env::var("SAH_RUNNER_RELEASE_PUBLIC_KEY").ok();
    let backup = match apply_verified_update(
        &current,
        &downloaded,
        expected_hash,
        signature,
        public_key.as_deref(),
    ) {
        Ok(backup) => backup,
        Err(error) => {
            let _ = acknowledge_update(
                config,
                &command_url,
                command_id,
                &token,
                "failed",
                "replacement",
                Some(&error),
            );
            return Err(error);
        }
    };
    acknowledge_update(
        config,
        &command_url,
        command_id,
        &token,
        ack_statuses[2],
        "restarting",
        None,
    )
    .map_err(|error| {
        let _ = crate::update::rollback(&current, &backup);
        let _ = acknowledge_update(
            config,
            &command_url,
            command_id,
            &token,
            "rolled_back",
            "rollback",
            Some(&error),
        );
        error
    })?;
    let confirm = std::process::Command::new(&current)
        .arg("__sah-runner-update-confirm")
        .arg(command_id)
        .spawn()
        .and_then(|mut child| child.wait())
        .map_err(|_| "RUNNER_UPDATE_CONFIRM_FAILED".to_string());
    let confirm = match confirm {
        Ok(status) => status,
        Err(error) => {
            let _ = crate::update::rollback(&current, &backup);
            let _ = acknowledge_update(
                config,
                &command_url,
                command_id,
                &token,
                "rolled_back",
                "rollback",
                Some(&error),
            );
            return Err(error);
        }
    };
    if !confirm.success() {
        crate::update::rollback(&current, &backup)?;
        let _ = acknowledge_update(
            config,
            &command_url,
            command_id,
            &token,
            "rolled_back",
            "rollback",
            Some("RUNNER_UPDATE_HEALTH_CONFIRMATION_FAILED"),
        );
        return Err("RUNNER_UPDATE_HEALTH_CONFIRMATION_FAILED".into());
    }
    acknowledge_update(
        config,
        &command_url,
        command_id,
        &token,
        ack_statuses[3],
        "completed",
        None,
    )?;
    std::process::Command::new(&current)
        .arg("run")
        .spawn()
        .map_err(|_| "RUNNER_UPDATE_RESTART_FAILED".to_string())?;
    Ok(())
}

pub fn confirm_update(config: &RunnerConfig, _command_id: &str) -> Result<(), String> {
    connection_status(config, "update-confirm").map(|_| ())
}

fn sibling_download_path(current: &std::path::Path, command_id: &str) -> PathBuf {
    let safe = command_id
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || *value == '-' || *value == '_')
        .collect::<String>();
    current.with_file_name(format!(".sah-runner-update-{safe}"))
}

fn absolute_download_url(control_url: &str, path: &str) -> Result<String, String> {
    if !path.starts_with('/') || path.contains("..") || path.contains('?') || path.contains('#') {
        return Err("RUNNER_UPDATE_DOWNLOAD_URL_INVALID".into());
    }
    let authority = control_url
        .split_once("://")
        .and_then(|(_, rest)| rest.split('/').next())
        .ok_or_else(|| "RUNNER_CONTROL_URL_INVALID".to_string())?;
    Ok(format!("https://{authority}{path}"))
}

fn request_json(
    config: &RunnerConfig,
    method: &str,
    endpoint: &str,
    token: &str,
    body: &[u8],
) -> Result<serde_json::Value, String> {
    let bytes = request_bytes(config, method, endpoint, token, body)?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_UPDATE_RESPONSE_INVALID".into())
}

fn request_bytes(
    config: &RunnerConfig,
    method: &str,
    endpoint: &str,
    token: &str,
    body: &[u8],
) -> Result<Vec<u8>, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .build()
        .new_agent();
    let path = endpoint_path(endpoint).map_err(|_| "RUNNER_UPDATE_ENDPOINT_INVALID")?;
    if method != "GET" && method != "POST" {
        return Err("RUNNER_UPDATE_METHOD_INVALID".into());
    }
    let mut request_builder = ureq::http::Request::builder()
        .method(method)
        .uri(endpoint)
        .header("Authorization", format!("Bearer {token}"))
        .header("X-SmartAIHub-Runner-Id", &config.runner_id)
        .header("Content-Type", "application/json");
    let proof = if std::env::var("SAH_RUNNER_ACCESS_TOKEN")
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        crate::connection::load_connection(&config.data_root)?
            .map(|connection| {
                DeviceProofSigner::from_material(
                    &crate::device_proof::DeviceProofMaterial {
                        device_id: connection.device_id,
                        machine_fingerprint: connection.machine_fingerprint,
                        public_key_pem: connection.public_key_pem,
                        private_key_pem: connection.private_key_pem,
                    },
                    token,
                )
            })
            .transpose()?
    } else {
        DeviceProofSigner::from_env(config.device_id.as_deref().unwrap_or_default(), token)?
    };
    if let Some(proof) = proof {
        let headers = proof.headers(method, &path, body)?;
        request_builder = request_builder
            .header("X-Runner-Device-Id", headers.device_id)
            .header("X-Runner-Device-Public-Key", headers.public_key)
            .header("X-Runner-Machine-Fingerprint", headers.machine_fingerprint)
            .header("X-Runner-Device-Nonce", headers.nonce)
            .header("X-Runner-Device-Timestamp", headers.timestamp)
            .header("X-Runner-Device-Signature", headers.signature)
            .header("X-Runner-Body-Sha256", headers.body_hash);
    }
    let request = request_builder
        .body(body.to_vec())
        .map_err(|_| "RUNNER_UPDATE_REQUEST_BUILD_FAILED")?;
    let response = agent
        .run(request)
        .map_err(|_| "RUNNER_UPDATE_REQUEST_FAILED")?;
    if !response.status().is_success() {
        return Err(format!(
            "RUNNER_UPDATE_REQUEST_REJECTED_{}",
            response.status().as_u16()
        ));
    }
    response
        .into_body()
        .with_config()
        .limit(750 * 1024 * 1024)
        .read_to_vec()
        .map_err(|_| "RUNNER_UPDATE_RESPONSE_READ_FAILED".into())
}

fn control_access_token(config: &RunnerConfig) -> Result<String, String> {
    let configured = std::env::var("SAH_RUNNER_ACCESS_TOKEN").unwrap_or_default();
    if !configured.trim().is_empty() {
        return Ok(configured);
    }
    crate::connection::load_or_refresh(config)?
        .map(|connection| connection.control_token)
        .ok_or_else(|| "RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL".into())
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

fn capability_snapshot(
    config: &RunnerConfig,
    tools: &[ToolCandidate],
    runner_session_id: Option<&str>,
    tenant_id: Option<&str>,
    control_plane_origin: &str,
) -> serde_json::Value {
    let observed_at = current_time_iso();
    let expires_at = current_time_iso_after(std::time::Duration::from_secs(300));
    let snapshot_revision = format!("snapshot:{}:{}", config.runner_id, observed_at);
    let capability_snapshot_id = format!("capability:{}:{}", config.runner_id, observed_at);
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
                "authorizationEvidenceRef": tool.authorization_evidence_ref,
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
                "confidence": if tool.trust_state == TrustState::Ready { json!(1) } else { json!(0.5) },
                "observedAt": observed_at,
                "expiresAt": expires_at,
                "reasonCodes": tool.reason_codes,
            })
        })
        .collect::<Vec<_>>();
    let browser_tool = tools
        .iter()
        .find(|tool| matches!(tool.kind, crate::discovery::ToolKind::Browser));
    let browser_ready = browser_tool.is_some_and(|tool| tool.trust_state == TrustState::Ready);
    let browser_capability = browser_tool.map_or_else(
        || {
            json!({
                "availabilityState": "unavailable",
                "authState": "unavailable",
                "probeState": "unavailable",
                "reasonCodes": ["browser_not_discovered"],
            })
        },
        |tool| {
            json!({
                "availabilityState": if browser_ready { "available" } else { "unavailable" },
                "authState": dimension_to_auth(tool.auth_state),
                "probeState": browser_probe_state(tool),
                "reasonCodes": tool.reason_codes,
                "manifest": {
                    "runnerId": config.runner_id,
                    "runnerSessionId": runner_session_id,
                    "capabilitySnapshotId": capability_snapshot_id,
                    "runtimeVersion": RUNNER_VERSION,
                    "adapterVersion": tool.adapter_id,
                    "browserEngine": if browser_ready { json!("chromium") } else { serde_json::Value::Null },
                    "browserVersion": if browser_ready { tool.version.clone() } else { None::<String> },
                    "supports": {
                        "structuredObservation": browser_ready,
                        "semanticClick": browser_ready,
                        "semanticType": browser_ready,
                        "screenshot": browser_ready,
                        "visualFallback": browser_ready,
                        "cancellation": browser_ready,
                        "evidence": browser_ready,
                    },
                    "authState": dimension_to_auth(tool.auth_state),
                    "probeState": browser_probe_state(tool),
                    "observedAt": observed_at,
                    "expiresAt": expires_at,
                    "authorizationEvidenceRef": tool.authorization_evidence_ref,
                    "probeEvidenceRef": tool.probe_evidence_ref,
                }
            })
        },
    );
    json!({
        "runnerId": config.runner_id,
        "tenantId": tenant_id,
        "runnerVersion": RUNNER_VERSION,
        "contractVersion": "sah-runner-v1",
        "controlPlaneOrigin": control_plane_origin,
        "revision": snapshot_revision,
        "runnerSessionId": runner_session_id,
        "capabilitySnapshotId": capability_snapshot_id,
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
        "computerUse": {
            "browser": browser_capability,
            "desktop": {
                "availabilityState": "unavailable",
                "authState": "unavailable",
                "probeState": "unavailable",
                "reasonCodes": ["desktop_adapter_not_configured"],
            },
        },
    })
}

fn deterministic_certification_adapter_enabled() -> bool {
    if std::env::var("SAH_RUNNER_CERTIFICATION_ADAPTER").as_deref() != Ok("deterministic") {
        return false;
    }
    let Ok(control_url) = std::env::var("SAH_RUNNER_CONTROL_URL") else {
        return false;
    };
    control_url.starts_with("http://127.0.0.1:")
        || control_url.starts_with("http://localhost:")
        || control_url.starts_with("http://[::1]:")
}

fn snapshot_expiry_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .saturating_add(300_000)
        .min(u128::from(u64::MAX)) as u64
}

fn browser_probe_state(tool: &ToolCandidate) -> &'static str {
    match tool.trust_state {
        TrustState::Ready => "ready",
        TrustState::AuthRequired => "pairing_required",
        TrustState::Degraded => "degraded",
        TrustState::Unsupported => "unavailable",
        _ => "probe_required",
    }
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
    use super::{
        build_keepalive_envelope, capability_snapshot, delivery_transport_label, keepalive_due,
        parse_refresh_interval, semantic_receipt_payload, snapshot_evidence, update_ack_statuses,
    };
    use crate::config::{RunnerConfig, RunnerProfile};
    use crate::discovery::scan_known_tools;
    use crate::protocol::{NodeKind, RunnerJobCommand, RunnerJobReceiptEventType};
    use crate::transport::TransportMode;
    use serde_json::json;
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

    #[test]
    fn control_channel_keepalive_is_due_only_after_bounded_idle_interval() {
        assert!(!keepalive_due(
            Duration::from_secs(29),
            Duration::from_secs(30)
        ));
        assert!(keepalive_due(
            Duration::from_secs(30),
            Duration::from_secs(30)
        ));
        assert!(keepalive_due(
            Duration::from_secs(90),
            Duration::from_secs(30)
        ));
    }

    #[test]
    fn control_channel_keepalive_uses_reconcile_contract() {
        let mut channel = crate::control_channel::ControlChannel::default();
        channel.connect();
        channel.authenticated();
        let envelope = build_keepalive_envelope(
            &mut channel,
            NodeKind::LocalDevice,
            "runner-p213",
            "revision-p213",
        )
        .expect("keepalive should use the existing envelope contract");

        assert_eq!(envelope.payload["type"], "runner.reconcile");
        assert_eq!(envelope.payload["command"], "keepalive");
    }

    #[test]
    fn delivery_evidence_reports_the_actual_transport_mode() {
        assert_eq!(delivery_transport_label(TransportMode::WssFastPath), "wss");
        assert_eq!(
            delivery_transport_label(TransportMode::HttpsDurableFallback),
            "https_fallback"
        );
    }

    #[test]
    fn update_ack_sequence_matches_server_state_machine() {
        assert_eq!(
            update_ack_statuses(),
            ["verifying", "replacing", "restarting", "completed"]
        );
    }

    #[test]
    fn computer_use_browser_is_unavailable_until_probe_and_pairing_are_ready() {
        let config = RunnerConfig::local("runner-1", "device-1", "https://example.test");
        let tools = scan_known_tools(RunnerProfile::LocalDevice, &["browser".into()]);
        let snapshot = capability_snapshot(&config, &tools, None, None, "https://example.test");
        let evidence = snapshot_evidence(&snapshot);

        assert_eq!(
            snapshot["computerUse"]["browser"]["availabilityState"],
            "unavailable"
        );
        assert_eq!(snapshot["computerUse"]["browser"]["authState"], "unknown");
        assert_eq!(evidence["runnerId"], "runner-1");
        assert_eq!(evidence["revision"], snapshot["revision"]);
        assert_eq!(evidence["browser"]["probeState"], "probe_required");
        assert_eq!(
            snapshot["computerUse"]["desktop"]["availabilityState"],
            "unavailable"
        );
    }

    #[test]
    fn semantic_completion_receipt_carries_only_bounded_verification_intent() {
        let command = RunnerJobCommand {
            command_id: "command-1".into(),
            command_type: "execute".into(),
            contract_version: "runner-job-v1".into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token: 1,
            tenant_id: "tenant-1".into(),
            user_id: Some(1),
            project_ref: None,
            workspace_ref: None,
            runner_id: "runner-1".into(),
            runner_session_id: "session-1".into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            execution_kind: "computer_use.browser".into(),
            adapter_id: "browser.v1".into(),
            adapter_version_constraint: Some("0.1.0".into()),
            browser_engine_constraint: Some("chromium".into()),
            idempotency_key: "idem-1".into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "runner-auth:sha256:grant".into(),
            input_ref: "runner-input:sha256:input".into(),
            payload: json!({
                "requiresIndependentVerification": true,
                "decisionRequest": { "requestedProvider": "rules", "goal": "observe page" },
                "verification": { "required": true, "verifier": "spec208-independent-v1" },
                "secret": "must-not-echo",
            }),
        };
        let payload =
            semantic_receipt_payload(&command, &RunnerJobReceiptEventType::ExecutionCompleted)
                .unwrap();
        assert_eq!(payload["requiresIndependentVerification"], true);
        assert_eq!(payload["decisionRequest"]["requestedProvider"], "rules");
        assert_eq!(
            payload["verification"]["verifier"],
            "spec208-independent-v1"
        );
        assert!(payload.get("secret").is_none());
        assert!(
            semantic_receipt_payload(&command, &RunnerJobReceiptEventType::ExecutionStarted)
                .is_none()
        );
    }
}
