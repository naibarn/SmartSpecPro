use serde_json::{json, Value};
use smartspec_shell_lib::desktop_worker_control_plane::{
    build_desktop_device_heartbeat_payload, build_desktop_device_registration_payload,
    build_desktop_worker_heartbeat_payload, build_desktop_worker_registration_payload,
    bootstrap_projected_worker_with_control_plane,
    build_comfy_image_generation_failure_event, build_comfy_image_generation_progress_event,
    build_comfy_workflow_run_failure_event, build_comfy_workflow_run_progress_event,
    build_local_folder_ingest_failure_event, build_local_folder_ingest_progress_event,
    build_worker_job_failure_event, build_worker_job_progress_event,
    claim_and_prepare_worker_job, get_worker_policy_snapshot,
    register_desktop_device_with_control_plane, register_worker_with_control_plane,
    send_desktop_device_heartbeat, send_worker_heartbeat, upload_worker_artifact_file,
    DesktopDeviceHeartbeatDescriptor, DesktopDeviceHeartbeatRequest,
    DesktopDevicePlatform, DesktopDeviceRegisterRequest,
    DesktopDeviceRegistrationDescriptor, DesktopProjectedWorkerBootstrapRequest,
    DesktopWorkerApiRequest,
    DesktopWorkerArtifactUploadFileRequest, DesktopWorkerClaimAndPrepareRequest,
    DesktopWorkerClaimJobRequest, DesktopWorkerHeartbeatDescriptor,
    DesktopWorkerHeartbeatRequest, DesktopWorkerPolicyRequest,
    DesktopWorkerRegistrationDescriptor, DesktopWorkerRegistrationRequest,
    WorkerClaimRequest,
};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

struct MockRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

struct MockResponse {
    status: u16,
    body: Vec<u8>,
    content_type: String,
}

struct ExpectedRequest {
    method: &'static str,
    path: &'static str,
    handler: Box<dyn Fn(MockRequest) -> MockResponse + Send + 'static>,
}

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-desktop-worker-control-plane-{name}-{suffix}"));
    path
}

fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        _ => "OK",
    }
}

fn read_http_request(stream: &mut TcpStream) -> MockRequest {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    reader.read_line(&mut request_line).unwrap();
    let mut parts = request_line.trim().split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();

    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let body_len = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0_u8; body_len];
    if body_len > 0 {
        reader.read_exact(&mut body).unwrap();
    }

    MockRequest {
        method,
        path,
        headers,
        body,
    }
}

fn write_http_response(stream: &mut TcpStream, response: MockResponse) {
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        status_text(response.status),
        response.content_type,
        response.body.len()
    );
    stream.write_all(headers.as_bytes()).unwrap();
    stream.write_all(&response.body).unwrap();
    stream.flush().unwrap();
}

fn spawn_mock_server(expectations: Vec<ExpectedRequest>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        for expected in expectations {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream);
            assert_eq!(request.method, expected.method);
            assert_eq!(request.path, expected.path);
            let response = (expected.handler)(request);
            write_http_response(&mut stream, response);
        }
    });
    (format!("http://{}", address), handle)
}

fn spawn_mock_server_factory<F>(factory: F) -> (String, thread::JoinHandle<()>)
where
    F: FnOnce(String) -> Vec<ExpectedRequest> + Send + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let base_url = format!("http://{}", address);
    let expectations = factory(base_url.clone());
    let handle = thread::spawn(move || {
        for expected in expectations {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream);
            assert_eq!(request.method, expected.method);
            assert_eq!(request.path, expected.path);
            let response = (expected.handler)(request);
            write_http_response(&mut stream, response);
        }
    });
    (base_url, handle)
}

#[test]
fn builds_desktop_worker_payloads_and_runtime_specific_events() {
    let registration = build_desktop_worker_registration_payload(DesktopWorkerRegistrationDescriptor {
        runtime_version: "0.2.0".into(),
        worker_mode: "dedicated_gpu".into(),
        display_name: "GPU Worker".into(),
        external_reference: "device-1".into(),
        runtime_mode: "native_constrained".into(),
        team_id: Some("team-1".into()),
        machine_id: Some("machine-1".into()),
        machine_name: Some("render-01".into()),
        dashboard_url: Some("https://desktop.example.test/worker".into()),
        capabilities_json: json!({ "video-edit": true }),
        hardware_json: json!({ "gpu": "RTX 4090" }),
        health_summary_json: json!({ "status": "online" }),
        warning_flags_json: vec![],
        runtime_metadata_json: json!({
            "desktopVersion": "1.4.0",
            "runtimeProfile": "native_constrained",
            "workspaceRootsSummary": [],
            "gpuSnapshot": {},
            "toolchainSummary": {},
            "doctorSummary": {},
            "serviceMode": "managed_startup",
            "executionIdentity": {
                "mode": "service_identity",
                "approvalMode": "team_approved",
                "budgetAttributionMode": "team_budget",
                "tokenRotationTriggers": ["periodic_rotation"]
            }
        }),
        file_scope_mode: "workspace_scoped".into(),
        runtime_profile_name: Some("native-default".into()),
        policy_profile_name: Some("gpu-render-worker".into()),
    })
    .unwrap();

    let heartbeat = build_desktop_worker_heartbeat_payload(DesktopWorkerHeartbeatDescriptor {
        runtime_version: "0.2.0".into(),
        status: "online".into(),
        current_job_count: 1,
        queue_depth: 0,
        free_disk_bytes: Some(512_000_000),
        metrics_json: json!({ "cpuLoad": 0.25 }),
        warnings_json: vec![],
        runtime_metadata_json: json!({ "doctor": "ok" }),
    })
    .unwrap();

    let progress = build_worker_job_progress_event(
        "lease-1",
        1,
        "render_outputs",
        Some(72.5),
        Some(json!({ "fps": 59.94 })),
    )
    .unwrap();
    let failure = build_worker_job_failure_event(
        "lease-1",
        2,
        "artifact_upload_failed",
        "Upload target rejected the PUT request",
        true,
        None,
    )
    .unwrap();
    let ingest_progress = build_local_folder_ingest_progress_event(
        "lease-2",
        3,
        "index_files",
        Some(35.0),
        Some(json!({ "maxFiles": 250 })),
    )
    .unwrap();
    let ingest_failure = build_local_folder_ingest_failure_event(
        "lease-2",
        4,
        "artifact_publish_failed",
        "Manifest write failed",
        false,
        None,
    )
    .unwrap();
    let comfy_image_progress = build_comfy_image_generation_progress_event(
        "lease-3",
        5,
        "collect_outputs",
        Some(72.0),
        Some(json!({ "outputCount": 2 })),
    )
    .unwrap();
    let comfy_image_failure = build_comfy_image_generation_failure_event(
        "lease-3",
        6,
        "workflow_rejected",
        "ComfyUI rejected the workflow",
        false,
        None,
    )
    .unwrap();
    let comfy_workflow_progress = build_comfy_workflow_run_progress_event(
        "lease-4",
        7,
        "trigger_indexing",
        Some(98.0),
        Some(json!({ "triggerIndexingRequested": true })),
    )
    .unwrap();
    let comfy_workflow_failure = build_comfy_workflow_run_failure_event(
        "lease-4",
        8,
        "unsupported_output",
        "Expected text output was missing",
        false,
        None,
    )
    .unwrap();

    assert_eq!(registration.runtime_type, "desktop_zeroclaw_managed");
    assert_eq!(heartbeat.runtime_type, "desktop_zeroclaw_managed");
    assert_eq!(progress.payload_json["stage"], "render_outputs");
    assert_eq!(failure.payload_json["failureCode"], "artifact_upload_failed");
    assert_eq!(ingest_progress.payload_json["stage"], "index_files");
    assert_eq!(ingest_failure.payload_json["failureCode"], "artifact_publish_failed");
    assert_eq!(comfy_image_progress.payload_json["stage"], "collect_outputs");
    assert_eq!(comfy_image_failure.payload_json["failureCode"], "workflow_rejected");
    assert_eq!(comfy_workflow_progress.payload_json["stage"], "trigger_indexing");
    assert_eq!(comfy_workflow_failure.payload_json["failureCode"], "unsupported_output");
}

#[test]
fn registers_heartbeats_and_reads_policy_against_control_plane_api() {
    let (base_url, handle) = spawn_mock_server(vec![
        ExpectedRequest {
            method: "POST",
            path: "/api/workers/register",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("authorization").map(String::as_str),
                    Some("Bearer reg-token")
                );
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["runtimeType"], "desktop_zeroclaw_managed");
                MockResponse {
                    status: 201,
                    body: serde_json::to_vec(&json!({
                        "created": true,
                        "tokens": {
                            "executionToken": "exec-token",
                            "uploadToken": "upload-token"
                        },
                        "worker": {
                            "id": "worker-1",
                            "runtimeType": "desktop_zeroclaw_managed"
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "POST",
            path: "/api/workers/worker-1/heartbeat",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("authorization").map(String::as_str),
                    Some("Bearer exec-token")
                );
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["status"], "online");
                MockResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({
                        "status": "online",
                        "workerId": "worker-1",
                        "lastSeenAt": "2026-04-09T08:00:00.000Z"
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "GET",
            path: "/api/workers/worker-1/policy",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("authorization").map(String::as_str),
                    Some("Bearer exec-token")
                );
                MockResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({
                        "workerId": "worker-1",
                        "runtimeType": "desktop_zeroclaw_managed",
                        "jobTypeAllowlist": ["video_assembly"]
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
    ]);

    let registration_payload = build_desktop_worker_registration_payload(DesktopWorkerRegistrationDescriptor {
        runtime_version: "0.2.0".into(),
        worker_mode: "per_user".into(),
        display_name: "User Worker".into(),
        external_reference: "device-1".into(),
        runtime_mode: "native_constrained".into(),
        team_id: None,
        machine_id: Some("machine-1".into()),
        machine_name: Some("user-pc".into()),
        dashboard_url: None,
        capabilities_json: json!({}),
        hardware_json: json!({}),
        health_summary_json: json!({}),
        warning_flags_json: vec![],
        runtime_metadata_json: json!({
            "desktopVersion": "1.4.0",
            "runtimeProfile": "native_constrained",
            "workspaceRootsSummary": [],
            "gpuSnapshot": {},
            "toolchainSummary": {},
            "doctorSummary": {},
            "serviceMode": "foreground",
            "executionIdentity": {
                "mode": "user_bound",
                "approvalMode": "owner_approved",
                "budgetAttributionMode": "owner_budget",
                "tokenRotationTriggers": ["manual_reissue"]
            }
        }),
        file_scope_mode: "workspace_scoped".into(),
        runtime_profile_name: None,
        policy_profile_name: None,
    })
    .unwrap();
    let registration = register_worker_with_control_plane(DesktopWorkerRegistrationRequest {
        control_plane_base_url: base_url.clone(),
        registration_token: "reg-token".into(),
        request_timeout_ms: Some(5_000),
        payload: registration_payload,
    })
    .unwrap();

    let heartbeat_payload = build_desktop_worker_heartbeat_payload(DesktopWorkerHeartbeatDescriptor {
        runtime_version: "0.2.0".into(),
        status: "online".into(),
        current_job_count: 0,
        queue_depth: 0,
        free_disk_bytes: Some(1_024),
        metrics_json: json!({}),
        warnings_json: vec![],
        runtime_metadata_json: json!({}),
    })
    .unwrap();
    let heartbeat = send_worker_heartbeat(DesktopWorkerHeartbeatRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url.clone(),
            bearer_token: registration.tokens.execution_token.clone(),
            request_timeout_ms: Some(5_000),
        },
        worker_id: "worker-1".into(),
        payload: heartbeat_payload,
    })
    .unwrap();

    let policy = get_worker_policy_snapshot(DesktopWorkerPolicyRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url.clone(),
            bearer_token: registration.tokens.execution_token,
            request_timeout_ms: Some(5_000),
        },
        worker_id: "worker-1".into(),
    })
    .unwrap();

    handle.join().unwrap();
    assert!(registration.created);
    assert_eq!(heartbeat.worker_id, "worker-1");
    assert_eq!(policy["runtimeType"], "desktop_zeroclaw_managed");
}

#[test]
fn registers_and_heartbeats_desktop_device_projection_bootstrap() {
    let (base_url, handle) = spawn_mock_server(vec![
        ExpectedRequest {
            method: "POST",
            path: "/api/desktop-host/devices/register",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("authorization").map(String::as_str),
                    Some("Bearer session-token")
                );
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["projectedWorkerRuntimeType"], "desktop_zeroclaw_managed");
                MockResponse {
                    status: 201,
                    body: serde_json::to_vec(&json!({
                        "created": true,
                        "device": {
                            "id": "device-1",
                            "workerProjectionEnabled": true
                        },
                        "workerProjection": {
                            "enabled": true,
                            "runtimeType": "desktop_zeroclaw_managed",
                            "registrationToken": "reg-token"
                        },
                        "policySnapshot": {
                            "workerProjectionRuntimeType": "desktop_zeroclaw_managed"
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "POST",
            path: "/api/desktop-host/devices/device-1/heartbeat",
            handler: Box::new(|request| {
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["policyCursor"], "policy-v1");
                MockResponse {
                    status: 200,
                    body: serde_json::to_vec(&json!({
                        "device": {
                            "id": "device-1",
                            "workerProjectionEnabled": true
                        },
                        "workerProjection": {
                            "enabled": true,
                            "runtimeType": "desktop_zeroclaw_managed",
                            "registrationToken": "reg-token-2"
                        },
                        "policySnapshot": {
                            "workerProjectionRuntimeType": "desktop_zeroclaw_managed"
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
    ]);

    let registration_payload = build_desktop_device_registration_payload(DesktopDeviceRegistrationDescriptor {
        runtime_version: "1.4.0".into(),
        tenant_id: "tenant-1".into(),
        user_id: "42".into(),
        device_id: "device-1".into(),
        display_name: "Alice Desktop".into(),
        machine_name: Some("alice-pc".into()),
        platform: DesktopDevicePlatform {
            os: "windows".into(),
            os_version: Some("11".into()),
            arch: "x86_64".into(),
            app_version: "1.4.0".into(),
        },
        worker_projection_enabled: true,
        capabilities_json: json!({ "searchFiles": true }),
        health_summary_json: json!({ "status": "online" }),
        warning_flags_json: vec![],
    })
    .unwrap();
    let register_response = register_desktop_device_with_control_plane(DesktopDeviceRegisterRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url.clone(),
            bearer_token: "session-token".into(),
            request_timeout_ms: Some(5_000),
        },
        payload: registration_payload,
    })
    .unwrap();

    let heartbeat_payload = build_desktop_device_heartbeat_payload(DesktopDeviceHeartbeatDescriptor {
        runtime_version: "1.4.0".into(),
        capabilities_json: json!({ "searchFiles": true }),
        health_summary_json: json!({ "status": "online" }),
        warning_flags_json: vec![],
        policy_cursor: Some("policy-v1".into()),
    })
    .unwrap();
    let heartbeat_response = send_desktop_device_heartbeat(DesktopDeviceHeartbeatRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url,
            bearer_token: "session-token".into(),
            request_timeout_ms: Some(5_000),
        },
        device_id: "device-1".into(),
        payload: heartbeat_payload,
    })
    .unwrap();

    handle.join().unwrap();
    assert_eq!(register_response.created, Some(true));
    assert_eq!(
        register_response.worker_projection["runtimeType"],
        "desktop_zeroclaw_managed"
    );
    assert_eq!(
        heartbeat_response.policy_snapshot["workerProjectionRuntimeType"],
        "desktop_zeroclaw_managed"
    );
}

#[test]
fn bootstraps_projected_worker_from_device_registration_token() {
    let (base_url, handle) = spawn_mock_server(vec![
        ExpectedRequest {
            method: "POST",
            path: "/api/desktop-host/devices/register",
            handler: Box::new(|request| {
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["workerProjectionEnabled"], true);
                MockResponse {
                    status: 201,
                    body: serde_json::to_vec(&json!({
                        "created": true,
                        "device": { "id": "device-1" },
                        "workerProjection": {
                            "enabled": true,
                            "runtimeType": "desktop_zeroclaw_managed",
                            "registrationToken": "projection-reg-token"
                        },
                        "policySnapshot": {
                            "workerProjectionRuntimeType": "desktop_zeroclaw_managed"
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
        ExpectedRequest {
            method: "POST",
            path: "/api/workers/register",
            handler: Box::new(|request| {
                assert_eq!(
                    request.headers.get("authorization").map(String::as_str),
                    Some("Bearer projection-reg-token")
                );
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                assert_eq!(body["runtimeType"], "desktop_zeroclaw_managed");
                MockResponse {
                    status: 201,
                    body: serde_json::to_vec(&json!({
                        "created": true,
                        "tokens": {
                            "executionToken": "exec-token",
                            "uploadToken": "upload-token"
                        },
                        "worker": {
                            "id": "worker-1",
                            "runtimeType": "desktop_zeroclaw_managed"
                        }
                    }))
                    .unwrap(),
                    content_type: "application/json".into(),
                }
            }),
        },
    ]);

    let device_registration = DesktopDeviceRegisterRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url.clone(),
            bearer_token: "session-token".into(),
            request_timeout_ms: Some(5_000),
        },
        payload: build_desktop_device_registration_payload(DesktopDeviceRegistrationDescriptor {
            runtime_version: "1.4.0".into(),
            tenant_id: "tenant-1".into(),
            user_id: "42".into(),
            device_id: "device-1".into(),
            display_name: "Alice Desktop".into(),
            machine_name: Some("alice-pc".into()),
            platform: DesktopDevicePlatform {
                os: "windows".into(),
                os_version: Some("11".into()),
                arch: "x86_64".into(),
                app_version: "1.4.0".into(),
            },
            worker_projection_enabled: true,
            capabilities_json: json!({}),
            health_summary_json: json!({}),
            warning_flags_json: vec![],
        })
        .unwrap(),
    };

    let worker_registration_payload =
        build_desktop_worker_registration_payload(DesktopWorkerRegistrationDescriptor {
            runtime_version: "0.2.0".into(),
            worker_mode: "per_user".into(),
            display_name: "Projected Worker".into(),
            external_reference: "device-1".into(),
            runtime_mode: "native_constrained".into(),
            team_id: None,
            machine_id: Some("machine-1".into()),
            machine_name: Some("alice-pc".into()),
            dashboard_url: None,
            capabilities_json: json!({}),
            hardware_json: json!({}),
            health_summary_json: json!({}),
            warning_flags_json: vec![],
            runtime_metadata_json: json!({
                "desktopVersion": "1.4.0",
                "runtimeProfile": "native_constrained",
                "workspaceRootsSummary": [],
                "gpuSnapshot": {},
                "toolchainSummary": {},
                "doctorSummary": {},
                "serviceMode": "foreground",
                "executionIdentity": {
                    "mode": "user_bound",
                    "approvalMode": "owner_approved",
                    "budgetAttributionMode": "owner_budget",
                    "tokenRotationTriggers": ["manual_reissue"]
                }
            }),
            file_scope_mode: "workspace_scoped".into(),
            runtime_profile_name: None,
            policy_profile_name: None,
        })
        .unwrap();

    let response = bootstrap_projected_worker_with_control_plane(
        DesktopProjectedWorkerBootstrapRequest {
            device_registration,
            worker_registration_payload,
        },
    )
    .unwrap();

    handle.join().unwrap();
    assert_eq!(
        response.device_registration.worker_projection["runtimeType"],
        "desktop_zeroclaw_managed"
    );
    assert_eq!(
        response.worker_registration.worker["runtimeType"],
        "desktop_zeroclaw_managed"
    );
}

#[test]
fn claims_and_prepares_video_assembly_jobs_from_control_plane() {
    let source_root = temp_dir("claim-source");
    let workspace_dir = temp_dir("claim-workspace");
    fs::create_dir_all(&source_root).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    let source_video = source_root.join("clip.mp4");
    fs::write(&source_video, b"fake-video").unwrap();

    let claim_job_body = json!({
        "job": {
            "id": "job-1",
            "tenantId": "tenant-1",
            "runtimeType": "desktop_zeroclaw_managed",
            "jobType": "video_assembly",
            "status": "claimed",
            "inputJson": {
                "inputRefs": [{
                    "sourceKind": "authorized_local_path",
                    "refId": "clip-1",
                    "path": source_video.to_string_lossy().to_string()
                }],
                "editPlan": {
                    "clips": [{
                        "sourceRef": "clip-1",
                        "trim": { "startMs": 0, "endMs": 3000 }
                    }],
                    "applyWatermark": false
                },
                "subtitlePlan": {
                    "sourcePriority": "user_provided",
                    "mode": "none"
                },
                "renderProfile": {
                    "aspectRatios": ["16:9"],
                    "codecPreset": "h264",
                    "qualityPreset": "standard",
                    "gpuRequired": false
                },
                "workspacePolicy": {
                    "mode": "workspace_scoped",
                    "allowedSourceRoots": [source_root.to_string_lossy().to_string()]
                },
                "outputTargets": {
                    "renderedAssets": [{
                        "label": "landscape",
                        "aspectRatio": "16:9",
                        "publishToLibrary": true
                    }],
                    "subtitlesOptional": false,
                    "thumbnailsOptional": true
                }
            },
            "instructionsJson": {
                "intent": "video_assembly"
            },
            "outputJson": {},
            "leaseOwnerToken": "lease-1",
            "leaseExpiresAt": "2026-04-09T10:00:00.000Z"
        }
    });

    let (base_url, handle) = spawn_mock_server(vec![ExpectedRequest {
        method: "POST",
        path: "/api/workers/worker-1/jobs/claim",
        handler: Box::new(move |request| {
            assert_eq!(
                request.headers.get("authorization").map(String::as_str),
                Some("Bearer exec-token")
            );
            let body: Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(body["capabilityHints"], json!(["video-edit"]));
            MockResponse {
                status: 200,
                body: serde_json::to_vec(&claim_job_body).unwrap(),
                content_type: "application/json".into(),
            }
        }),
    }]);

    let prepared = claim_and_prepare_worker_job(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: DesktopWorkerApiRequest {
                control_plane_base_url: base_url,
                bearer_token: "exec-token".into(),
                request_timeout_ms: Some(5_000),
            },
            worker_id: "worker-1".into(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: vec!["video-edit".into()],
            },
        },
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        prefetched_inputs: vec![],
    })
    .unwrap();

    handle.join().unwrap();
    assert!(prepared.claimed);
    assert_eq!(prepared.job.unwrap().lease_owner_token, "lease-1");
    let plan = prepared.video_assembly_plan.unwrap();
    assert_eq!(plan.render_tasks.len(), 1);
    assert!(PathBuf::from(plan.staged_inputs[0].staged_path.clone()).exists());
}

#[test]
fn claims_and_prepares_local_folder_ingest_jobs_from_control_plane() {
    let source_root = temp_dir("claim-folder-source");
    let workspace_dir = temp_dir("claim-folder-workspace");
    fs::create_dir_all(&source_root).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    fs::write(source_root.join("notes.txt"), "Launch plan\nKeep it simple\n").unwrap();

    let claim_job_body = json!({
        "job": {
            "id": "job-folder-1",
            "tenantId": "tenant-1",
            "runtimeType": "desktop_zeroclaw_managed",
            "jobType": "local_folder_ingest",
            "status": "claimed",
            "inputJson": {
                "roots": [{
                    "rootId": "notes",
                    "name": "Notes",
                    "path": source_root.to_string_lossy().to_string()
                }],
                "workspacePolicy": {
                    "mode": "workspace_scoped",
                    "allowedSourceRoots": [source_root.to_string_lossy().to_string()]
                },
                "ingestPolicy": {
                    "maxDepth": 4,
                    "maxFiles": 250,
                    "includePreviewText": true,
                    "previewFileLimit": 20,
                    "snippetQuery": "launch",
                    "snippetFileLimit": 10
                },
                "outputTargets": {
                    "publishManifestToLibrary": true,
                    "publishSummaryToLibrary": true,
                    "triggerIndexing": true
                }
            },
            "instructionsJson": {
                "intent": "local_folder_ingest"
            },
            "outputJson": {},
            "leaseOwnerToken": "lease-folder-1",
            "leaseExpiresAt": "2026-04-09T10:00:00.000Z"
        }
    });

    let (base_url, handle) = spawn_mock_server(vec![ExpectedRequest {
        method: "POST",
        path: "/api/workers/worker-1/jobs/claim",
        handler: Box::new(move |request| {
            assert_eq!(
                request.headers.get("authorization").map(String::as_str),
                Some("Bearer exec-token")
            );
            let body: Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(body["capabilityHints"], json!(["file-access", "doc-indexing"]));
            MockResponse {
                status: 200,
                body: serde_json::to_vec(&claim_job_body).unwrap(),
                content_type: "application/json".into(),
            }
        }),
    }]);

    let prepared = claim_and_prepare_worker_job(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: DesktopWorkerApiRequest {
                control_plane_base_url: base_url,
                bearer_token: "exec-token".into(),
                request_timeout_ms: Some(5_000),
            },
            worker_id: "worker-1".into(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: vec!["file-access".into(), "doc-indexing".into()],
            },
        },
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        prefetched_inputs: vec![],
    })
    .unwrap();

    handle.join().unwrap();
    assert!(prepared.claimed);
    assert_eq!(prepared.job.unwrap().lease_owner_token, "lease-folder-1");
    assert!(prepared.video_assembly_plan.is_none());
    let plan = prepared.local_folder_ingest_plan.unwrap();
    assert_eq!(plan.managed_roots.len(), 1);
    assert!(PathBuf::from(plan.output_dir).exists());
    assert!(plan.manifest_output_path.ends_with("local_folder_ingest_manifest.json"));
}

#[test]
fn claims_comfy_jobs_without_prepared_local_plans() {
    let workspace_dir = temp_dir("claim-comfy-workspace");
    fs::create_dir_all(&workspace_dir).unwrap();

    let claim_job_body = json!({
        "job": {
            "id": "job-comfy-1",
            "tenantId": "tenant-1",
            "runtimeType": "desktop_zeroclaw_managed",
            "jobType": "comfy_image_generation",
            "status": "claimed",
            "inputJson": {
                "service": {
                    "baseUrl": "http://127.0.0.1:8188",
                    "localOnly": true
                },
                "workflowJson": {
                    "9": {
                        "class_type": "SaveImage"
                    }
                },
                "generationSpec": {
                    "promptSummary": "portrait"
                },
                "outputTargets": {
                    "publishImagesToLibrary": true,
                    "publishManifestToLibrary": true,
                    "triggerIndexing": true,
                    "maxImages": 2
                }
            },
            "instructionsJson": {
                "intent": "comfy_image_generation"
            },
            "outputJson": {},
            "leaseOwnerToken": "lease-comfy-1",
            "leaseExpiresAt": "2026-04-09T10:00:00.000Z"
        }
    });

    let (base_url, handle) = spawn_mock_server(vec![ExpectedRequest {
        method: "POST",
        path: "/api/workers/worker-1/jobs/claim",
        handler: Box::new(move |request| {
            let body: Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(body["capabilityHints"], json!(["comfyui-image-generate"]));
            MockResponse {
                status: 200,
                body: serde_json::to_vec(&claim_job_body).unwrap(),
                content_type: "application/json".into(),
            }
        }),
    }]);

    let prepared = claim_and_prepare_worker_job(DesktopWorkerClaimAndPrepareRequest {
        claim: DesktopWorkerClaimJobRequest {
            api: DesktopWorkerApiRequest {
                control_plane_base_url: base_url,
                bearer_token: "exec-token".into(),
                request_timeout_ms: Some(5_000),
            },
            worker_id: "worker-1".into(),
            payload: WorkerClaimRequest {
                max_jobs: 1,
                capability_hints: vec!["comfyui-image-generate".into()],
            },
        },
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        prefetched_inputs: vec![],
    })
    .unwrap();

    handle.join().unwrap();
    assert!(prepared.claimed);
    assert_eq!(prepared.job.unwrap().job_type, "comfy_image_generation");
    assert!(prepared.video_assembly_plan.is_none());
    assert!(prepared.local_folder_ingest_plan.is_none());
}

#[test]
fn uploads_worker_artifacts_via_presigned_url_and_completes_records() {
    let artifact_dir = temp_dir("artifact-upload");
    fs::create_dir_all(&artifact_dir).unwrap();
    let artifact_file = artifact_dir.join("render.mp4");
    fs::write(&artifact_file, b"artifact-bytes").unwrap();

    let (base_url, handle) = spawn_mock_server_factory(|base_url| {
        let upload_url = format!("{}/upload/worker-artifact", base_url);
        vec![
            ExpectedRequest {
                method: "POST",
                path: "/api/worker-jobs/job-1/artifacts/init-upload",
                handler: Box::new(move |request| {
                    assert_eq!(
                        request.headers.get("authorization").map(String::as_str),
                        Some("Bearer upload-token")
                    );
                    let body: Value = serde_json::from_slice(&request.body).unwrap();
                    assert_eq!(body["artifactType"], "rendered_video");
                    MockResponse {
                        status: 200,
                        body: serde_json::to_vec(&json!({
                            "key": "key-1",
                            "method": "presigned",
                            "storageRef": "worker-artifacts/tenant/job-1/render.mp4",
                            "uploadUrl": upload_url
                        }))
                        .unwrap(),
                        content_type: "application/json".into(),
                    }
                }),
            },
            ExpectedRequest {
                method: "PUT",
                path: "/upload/worker-artifact",
                handler: Box::new(|request| {
                    assert_eq!(request.body, b"artifact-bytes");
                    MockResponse {
                        status: 200,
                        body: Vec::new(),
                        content_type: "application/octet-stream".into(),
                    }
                }),
            },
            ExpectedRequest {
                method: "POST",
                path: "/api/worker-jobs/job-1/artifacts/complete",
                handler: Box::new(|request| {
                    let body: Value = serde_json::from_slice(&request.body).unwrap();
                    assert_eq!(body["storageRef"], "worker-artifacts/tenant/job-1/render.mp4");
                    assert_eq!(body["artifactType"], "rendered_video");
                    assert_eq!(body["metadataJson"]["fileName"], "render.mp4");
                    MockResponse {
                        status: 200,
                        body: serde_json::to_vec(&json!({
                            "created": true,
                            "artifact": {
                                "id": "artifact-1",
                                "storageRef": "worker-artifacts/tenant/job-1/render.mp4"
                            }
                        }))
                        .unwrap(),
                        content_type: "application/json".into(),
                    }
                }),
            },
        ]
    });

    let result = upload_worker_artifact_file(DesktopWorkerArtifactUploadFileRequest {
        api: DesktopWorkerApiRequest {
            control_plane_base_url: base_url,
            bearer_token: "upload-token".into(),
            request_timeout_ms: Some(5_000),
        },
        job_id: "job-1".into(),
        artifact_type: "rendered_video".into(),
        file_path: artifact_file.to_string_lossy().to_string(),
        file_name: Some("render.mp4".into()),
        content_type: "video/mp4".into(),
        metadata_json: json!({ "aspectRatio": "16:9" }),
        lease_owner_token: "lease-1".into(),
    })
    .unwrap();

    handle.join().unwrap();
    assert_eq!(result.file_name, "render.mp4");
    assert_eq!(result.size_bytes, b"artifact-bytes".len() as u64);
    assert!(result.completed_artifact.created);
    assert!(result.checksum_sha256.len() == 64);
    assert!(result.init_upload.upload_url.is_some());
    assert!(result.absolute_path.ends_with("render.mp4"));
    assert!(result.init_upload.storage_ref.contains("worker-artifacts"));
    assert!(result.completed_artifact.artifact["id"] == "artifact-1");
    assert!(result.checksum_sha256 != result.file_name);
}
