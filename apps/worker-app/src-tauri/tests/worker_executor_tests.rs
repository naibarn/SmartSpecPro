use serde_json::json;
use smart_ai_hub_worker_app_lib::runtime_manifest::DoctorSummary;
use smart_ai_hub_worker_app_lib::worker_executor::{
    build_failure_event, build_progress_event_plan, build_remotion_render_video_failure_event,
    build_remotion_render_video_progress_event, build_remotion_render_video_sidecar_command,
    build_required_artifact_uploads, build_sidecar_command, build_sidecar_manifest,
    classify_job_type, compact_json_artifact_metadata, parse_remotion_sidecar_event,
    prepare_hyperframes_execution_plan, prepare_remotion_render_video_execution_plan,
    validate_final_video_artifact, validate_workspace_path, ClaimedWorkerJob, RemotionSidecarEvent,
    WorkerJobKind, HYPERFRAMES_FINAL_VIDEO_MIN_BYTES, REMOTION_RENDER_VIDEO_JOB_TYPE,
};

fn ready_doctor() -> DoctorSummary {
    DoctorSummary {
        status: "ready".into(),
        checks: vec![],
        recommended_actions: vec![],
        official_hyperframes_runtime: Some(true),
        runtime_kind: Some("official_hyperframes".into()),
    }
}

fn blocked_doctor() -> DoctorSummary {
    DoctorSummary {
        status: "blocked".into(),
        checks: vec![],
        recommended_actions: vec!["Download render runtime".into()],
        official_hyperframes_runtime: None,
        runtime_kind: None,
    }
}

fn claimed_job() -> ClaimedWorkerJob {
    ClaimedWorkerJob {
        id: "job-1".into(),
        job_type: "hyperframes_final_composite".into(),
        lease_owner_token: "lease-1".into(),
        assignment_attempt: "attempt_1".into(),
        input_json: json!({
            "renderIntent": "hyperframes_final_composite",
            "finalVideoLengthSec": 30,
            "compositionHtml": "<!doctype html><html><body><video class=\"source-video\" src=\"assets/shot-1.mp4\"></video></body></html>",
            "assetManifest": {
                "sourceVideos": [
                    { "shotId": "shot-1", "storageRef": "worker-inputs/video-1.mp4" }
                ]
            }
        }),
        ..Default::default()
    }
}

#[test]
fn mocked_hyperframes_job_builds_ordered_event_sequence() {
    let job = claimed_job();
    let events = build_progress_event_plan(&job);

    assert_eq!(events.len(), 9);
    assert_eq!(events[0].sequence_number, 1);
    assert_eq!(events[0].payload_json["stage"], "resolve_inputs");
    assert_eq!(events[4].payload_json["stage"], "render_browser_css");
    assert_eq!(events[8].payload_json["stage"], "publish_artifacts");
    assert!(events
        .iter()
        .all(|event| event.assignment_attempt == "attempt_1"));
    assert!(events
        .iter()
        .all(|event| event.lease_owner_token == "lease-1"));
}

#[test]
fn execution_plan_fails_closed_when_runtime_doctor_is_blocked() {
    let dir = tempfile::tempdir().unwrap();

    let result = prepare_hyperframes_execution_plan(&claimed_job(), dir.path(), &blocked_doctor());

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("runtime is not ready"));
}

#[test]
fn execution_plan_rejects_non_hyperframes_jobs_and_missing_assignment() {
    let dir = tempfile::tempdir().unwrap();
    let mut job = claimed_job();
    job.job_type = "video_assembly".into();

    assert!(prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).is_err());

    job.job_type = "hyperframes_final_composite".into();
    job.assignment_attempt = String::new();
    assert!(prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).is_err());
}

#[test]
fn execution_plan_rejects_missing_real_html_or_source_assets() {
    let dir = tempfile::tempdir().unwrap();
    let mut job = claimed_job();
    job.input_json["compositionHtml"] = json!(null);

    let html_result = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor());
    assert!(html_result.is_err());
    assert!(html_result.unwrap_err().contains("compositionHtml"));

    job = claimed_job();
    job.input_json["assetManifest"]["sourceVideos"] = json!([]);

    let asset_result = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor());
    assert!(asset_result.is_err());
    assert!(asset_result.unwrap_err().contains("source video asset"));
}

#[test]
fn output_paths_must_stay_inside_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();

    assert!(validate_workspace_path(root, &root.join("job-1/out/final.mp4")).is_ok());
    assert!(validate_workspace_path(root, &root.join("../outside.mp4")).is_err());
    assert!(validate_workspace_path(root, std::path::Path::new("/tmp/outside.mp4")).is_err());
}

#[test]
fn sidecar_command_uses_allowlisted_args_not_server_shell_strings() {
    let dir = tempfile::tempdir().unwrap();
    let job = claimed_job();
    let plan = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).unwrap();
    let sidecar = dir.path().join("sidecars").join("hyperframes-render.exe");
    let command = build_sidecar_command(&sidecar, &plan, false, None, None).unwrap();

    assert!(!command.executable.as_os_str().is_empty());
    assert_eq!(command.current_dir, plan.workspace_dir);
    assert_eq!(command.args[0], sidecar.to_string_lossy());
    assert_eq!(command.args[1], "render");
    assert!(command.args.contains(&"--manifest".to_string()));
    assert!(command.args.contains(&"--output-dir".to_string()));
    assert!(!command
        .executable
        .to_string_lossy()
        .contains("node_modules"));
    assert!(!command
        .current_dir
        .to_string_lossy()
        .contains("runtime-npm"));
    assert!(command
        .envs
        .get("SMARTAIHUB_RUNTIME_ROOT")
        .is_some_and(|path| path == dir.path().to_string_lossy().as_ref()));
    assert!(!command
        .args
        .iter()
        .any(|arg| arg.contains("&&") || arg.contains(';') || arg.contains('|')));

    let manifest = build_sidecar_manifest(&job, &plan);
    assert_eq!(manifest["runtimePolicy"]["requireOfficialRuntime"], true);
    assert_eq!(manifest["runtimePolicy"]["rejectFallbackRender"], true);
    assert_eq!(manifest["runtimePolicy"]["localHttpServerAllowed"], false);
}

#[test]
fn sidecar_command_uses_bundled_wsl2_node_and_runtime_paths() {
    let dir = tempfile::tempdir().unwrap();
    let job = claimed_job();
    let plan = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).unwrap();
    let sidecar = dir.path().join("sidecars").join("hyperframes-render.exe");
    let command = build_sidecar_command(&sidecar, &plan, true, None, None).unwrap();

    assert_eq!(command.executable, std::path::PathBuf::from("wsl.exe"));
    assert_eq!(command.args[0], "-e");
    assert!(command.args[1].ends_with("/runtime-pack/node/bin/node"));
    assert!(command.args[2].ends_with("/runtime-pack/hyperframes-sidecar/render.mjs"));
    assert!(command.args.contains(&"--manifest".to_string()));
    assert!(command.envs.get("WSLENV").is_some_and(|value| value
        .contains("HYPERFRAMES_BROWSER_PATH")
        && value.contains("PRODUCER_HEADLESS_SHELL_PATH")
        && value.contains("HYPERFRAMES_NO_AUTO_INSTALL")
        && value.contains("SMARTAIHUB_ENABLE_GPU_ENCODING")));
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_ENABLE_GPU_ENCODING")
            .map(String::as_str),
        Some("0")
    );
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_DISABLE_BROWSER_GPU")
            .map(String::as_str),
        Some("1")
    );
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_HYPERFRAMES_DEBUG")
            .map(String::as_str),
        Some("0")
    );
    assert!(command
        .envs
        .get("FFMPEG_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/bin/ffmpeg")));
    assert!(command
        .envs
        .get("HYPERFRAMES_FFMPEG_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/bin/ffmpeg")));
    assert!(command
        .envs
        .get("FFPROBE_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/bin/ffprobe")));
    assert!(command
        .envs
        .get("HYPERFRAMES_FFPROBE_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/bin/ffprobe")));
    assert!(command
        .envs
        .get("BROWSER_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/browser/chrome")));
    assert!(command
        .envs
        .get("HYPERFRAMES_BROWSER_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/browser/chrome")));
    assert!(command
        .envs
        .get("PRODUCER_HEADLESS_SHELL_PATH")
        .is_some_and(|value| value.ends_with("/runtime-pack/browser/chrome")));
    assert_eq!(
        command
            .envs
            .get("HYPERFRAMES_NO_AUTO_INSTALL")
            .map(String::as_str),
        Some("1")
    );
    assert!(!command
        .args
        .iter()
        .any(|arg| arg.contains("&&") || arg.contains(';') || arg.contains('|')));
}

#[test]
fn sidecar_command_can_use_managed_wsl_runtime_root() {
    let dir = tempfile::tempdir().unwrap();
    let job = claimed_job();
    let plan = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).unwrap();
    let sidecar = dir.path().join("sidecars").join("hyperframes-render.exe");
    let command = build_sidecar_command(
        &sidecar,
        &plan,
        true,
        Some("~/.smartaihub-worker/runtime"),
        Some("~/smartaihub-worker/workspace"),
    )
    .unwrap();

    assert_eq!(command.executable, std::path::PathBuf::from("wsl.exe"));
    assert_eq!(command.args[0], "-e");
    assert_eq!(command.args[1], "bash");
    assert_eq!(command.args[2], "-s");
    let script = command
        .stdin_data
        .as_ref()
        .expect("managed WSL command should run the render script via stdin");
    assert!(script.contains("ROOT=\"${HOME}/.smartaihub-worker/runtime\""));
    assert!(script.contains("CONFIGURED_WORKSPACE_ROOT=\"${HOME}/smartaihub-worker/workspace\""));
    assert!(script.contains("WSL_JOB_WORKSPACE=\"$CONFIGURED_WORKSPACE_ROOT/$JOB_SEGMENT\""));
    assert!(script.contains("cp -a \"$WINDOWS_WORKSPACE\"/. \"$WSL_JOB_WORKSPACE\"/"));
    assert!(script.contains("--workspace \"$WSL_JOB_WORKSPACE\""));
    assert!(script.contains("cp -a \"$WSL_OUTPUT_DIR\"/. \"$WINDOWS_OUTPUT_DIR\"/"));
    assert!(script.contains("runtime-pack/node/bin/node"));
    assert!(script.contains("runtime-pack/hyperframes-sidecar/render.mjs"));
    assert!(script.contains("HYPERFRAMES_NO_AUTO_INSTALL=1"));
    assert!(script.contains("SMARTAIHUB_ENABLE_GPU_ENCODING"));
    assert!(script.contains("SMARTAIHUB_DISABLE_BROWSER_GPU"));
    assert!(script.contains("RENDER_TIMEOUT_SECONDS=\"${RENDER_TIMEOUT_SECONDS:-3600}\""));
    assert!(script.contains("setsid"));
    assert!(script.contains("trap cleanup_render_tree EXIT INT TERM HUP"));
    assert!(script.contains("kill -TERM -\"$render_pid\""));
    assert!(script.contains("kill -KILL -\"$render_pid\""));
    assert!(script.contains("wait \"$render_pid\""));
    assert!(!script.contains("\nexec \"$ROOT/runtime-pack/node/bin/node\""));
    let cleanup = command
        .cleanup
        .as_ref()
        .expect("managed WSL command should include orphan cleanup");
    assert_eq!(cleanup.executable, std::path::PathBuf::from("wsl.exe"));
    assert_eq!(cleanup.args[0], "-e");
    assert_eq!(cleanup.args[1], "bash");
    assert_eq!(cleanup.args[2], "-s");
    let cleanup_script = cleanup
        .stdin_data
        .as_ref()
        .expect("managed WSL cleanup should run via stdin");
    assert!(cleanup_script.contains("pgrep -f"));
    assert!(cleanup_script.contains("hyperframes-sidecar/render.mjs.*--workspace"));
    assert!(cleanup_script
        .contains("CONFIGURED_WORKSPACE_ROOT=\"${HOME}/smartaihub-worker/workspace\""));
    assert!(cleanup_script.contains("kill -TERM -\"$pgid\""));
    assert!(cleanup_script.contains("kill -KILL -\"$pgid\""));
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_MANAGED_WSL_ROOT")
            .map(String::as_str),
        Some("~/.smartaihub-worker/runtime")
    );
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_MANAGED_WSL_WORKSPACE_ROOT")
            .map(String::as_str),
        Some("~/smartaihub-worker/workspace")
    );
    assert_eq!(
        command
            .envs
            .get("SMARTAIHUB_ENABLE_GPU_ENCODING")
            .map(String::as_str),
        Some("0")
    );
}

#[test]
fn upload_plan_contains_all_required_artifacts_and_assignment_attempt() {
    let dir = tempfile::tempdir().unwrap();
    let job = claimed_job();
    let plan = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).unwrap();
    let uploads = build_required_artifact_uploads(&job, &plan);
    let artifact_types: Vec<_> = uploads
        .iter()
        .map(|upload| upload.artifact_type.as_str())
        .collect();

    assert_eq!(
        artifact_types,
        vec![
            "hyperframes_final_video",
            "hyperframes_render_manifest",
            "hyperframes_runtime_doctor",
            "hyperframes_probe_report",
        ]
    );
    assert!(uploads
        .iter()
        .all(|upload| upload.assignment_attempt == "attempt_1"));
}

#[test]
fn json_artifact_metadata_keeps_doctor_summary_without_inline_stdout() {
    let doctor = json!({
        "status": "ready",
        "officialHyperframesRuntime": true,
        "runtimeKind": "official_hyperframes",
        "runtimeModel": "managed_wsl",
        "runtimeVersion": "v1",
        "recommendedActions": [],
        "checks": [
            {
                "id": "wsl2_host",
                "status": "ok",
                "detailsJson": {
                    "stdout": "wsl status\u{0}with null and a very long stdout payload"
                }
            }
        ]
    });

    let metadata = compact_json_artifact_metadata("hyperframes_runtime_doctor", &doctor, 4096);

    assert_eq!(metadata["artifactJsonStoredInUpload"], true);
    assert_eq!(metadata["artifactJsonKind"], "runtime_doctor");
    assert_eq!(metadata["artifactJsonSizeBytes"], 4096);
    assert_eq!(metadata["status"], "ready");
    assert_eq!(metadata["officialHyperframesRuntime"], true);
    assert_eq!(metadata["checkCount"], 1);
    assert!(metadata.get("checks").is_none());
}

#[test]
fn final_video_validation_rejects_mock_text_output() {
    let dir = tempfile::tempdir().unwrap();
    let final_video = dir.path().join("final.mp4");
    std::fs::write(&final_video, b"mock video content").unwrap();

    let result = validate_final_video_artifact(&final_video);

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("too small"));
}

#[test]
fn final_video_validation_requires_mp4_container_header() {
    let dir = tempfile::tempdir().unwrap();
    let final_video = dir.path().join("final.mp4");
    std::fs::write(
        &final_video,
        vec![b'x'; HYPERFRAMES_FINAL_VIDEO_MIN_BYTES as usize],
    )
    .unwrap();

    let result = validate_final_video_artifact(&final_video);

    assert!(result.is_err());
    assert!(result.unwrap_err().contains("valid MP4 container"));
}

#[test]
fn final_video_validation_accepts_plausible_mp4_container() {
    let dir = tempfile::tempdir().unwrap();
    let final_video = dir.path().join("final.mp4");
    let mut bytes = vec![0u8; HYPERFRAMES_FINAL_VIDEO_MIN_BYTES as usize];
    bytes[4..8].copy_from_slice(b"ftyp");
    std::fs::write(&final_video, bytes).unwrap();

    let result = validate_final_video_artifact(&final_video);

    assert_eq!(result.unwrap(), HYPERFRAMES_FINAL_VIDEO_MIN_BYTES);
}

#[test]
fn failure_event_uses_server_accepted_hyperframes_failure_code_shape() {
    let event = build_failure_event(
        &claimed_job(),
        10,
        "runtime_not_ready",
        "HyperFrames runtime is not ready",
    );

    assert_eq!(event.event_type, "job.failed");
    assert_eq!(event.assignment_attempt, "attempt_1");
    assert_eq!(event.payload_json["failureCode"], "runtime_not_ready");
    assert_eq!(event.payload_json["recoverable"], true);
}

fn remotion_claimed_job() -> ClaimedWorkerJob {
    ClaimedWorkerJob {
        id: "remotion-job-1".into(),
        job_type: REMOTION_RENDER_VIDEO_JOB_TYPE.into(),
        lease_owner_token: "lease-remotion-1".into(),
        assignment_attempt: "attempt_remotion_1".into(),
        input_json: json!({
            "kind": "remotion_render_video",
            "videoProjectId": "project-1",
            "projectRevision": 3,
            "traceId": "trace-1",
        }),
        ..Default::default()
    }
}

#[test]
fn classify_job_type_routes_remotion_render_video() {
    assert_eq!(
        classify_job_type(REMOTION_RENDER_VIDEO_JOB_TYPE),
        WorkerJobKind::RemotionRenderVideo
    );
    assert_eq!(
        classify_job_type("hyperframes_final_composite"),
        WorkerJobKind::Hyperframes
    );
    assert_eq!(
        classify_job_type("comfy_image_generation"),
        WorkerJobKind::ComfyImageGeneration
    );
    assert_eq!(
        classify_job_type("comfy_workflow_run"),
        WorkerJobKind::ComfyWorkflowRun
    );
    assert_eq!(
        classify_job_type("some_other_job_type"),
        WorkerJobKind::Unknown
    );
}

#[test]
fn remotion_execution_plan_requires_matching_job_type_and_assignment_attempt() {
    let dir = tempfile::tempdir().unwrap();
    let job = remotion_claimed_job();
    let plan = prepare_remotion_render_video_execution_plan(&job, dir.path()).unwrap();
    assert_eq!(plan.job_id, "remotion-job-1");
    assert!(plan
        .payload_path
        .ends_with("remotion-render-video-input.json"));
    assert!(plan.output_dir.ends_with("out"));

    let mut wrong_type = job.clone();
    wrong_type.job_type = "hyperframes_final_composite".into();
    assert!(prepare_remotion_render_video_execution_plan(&wrong_type, dir.path()).is_err());

    let mut missing_attempt = job;
    missing_attempt.assignment_attempt = "".into();
    assert!(prepare_remotion_render_video_execution_plan(&missing_attempt, dir.path()).is_err());
}

#[test]
fn remotion_sidecar_command_matches_frozen_native_argv_contract() {
    let dir = tempfile::tempdir().unwrap();
    let job = remotion_claimed_job();
    let plan = prepare_remotion_render_video_execution_plan(&job, dir.path()).unwrap();
    let sidecar = dir.path().join("sidecars").join("hyperframes-render.exe");
    let command =
        build_remotion_render_video_sidecar_command(&sidecar, &plan, false, None, None).unwrap();

    // FROZEN contract: node <runtime-root>/runtime-pack/remotion-sidecar/render.mjs
    //   render-video --payload <path> --workspace <dir> --output-dir <dir>
    assert_eq!(command.current_dir, plan.workspace_dir);
    assert_eq!(command.args[1], "render-video");
    assert_eq!(command.args[2], "--payload");
    assert_eq!(command.args[3], plan.payload_path.to_string_lossy());
    assert!(command.args.contains(&"--workspace".to_string()));
    assert!(command.args.contains(&"--output-dir".to_string()));
    // Remotion's render-video mode takes no --format flag (unlike HyperFrames).
    assert!(!command.args.contains(&"--format".to_string()));
    assert!(!command.args.contains(&"mp4".to_string()));
    assert!(!command
        .args
        .iter()
        .any(|arg| arg.contains("&&") || arg.contains(';') || arg.contains('|')));
}

#[test]
fn remotion_sidecar_command_managed_wsl_uses_remotion_sidecar_directory() {
    let dir = tempfile::tempdir().unwrap();
    let job = remotion_claimed_job();
    let plan = prepare_remotion_render_video_execution_plan(&job, dir.path()).unwrap();
    let sidecar = dir.path().join("sidecars").join("hyperframes-render.exe");
    let command = build_remotion_render_video_sidecar_command(
        &sidecar,
        &plan,
        true,
        Some("~/.smartaihub-worker/runtime"),
        Some("~/smartaihub-worker/workspace"),
    )
    .unwrap();

    let script = command
        .stdin_data
        .as_ref()
        .expect("managed WSL command should run the render script via stdin");
    assert!(script.contains("runtime-pack/remotion-sidecar/render.mjs"));
    assert!(script.contains("render-video"));
    assert!(script.contains("--payload"));
    assert!(script.contains("remotion-render-video-input.json"));
    // Remotion mode never appends --format mp4.
    assert!(!script.contains("--format mp4"));
    // Preview mode is HyperFrames-only.
    assert!(command.preview_stdin_data.is_none());

    let cleanup_script = command
        .cleanup
        .as_ref()
        .and_then(|cleanup| cleanup.stdin_data.as_ref())
        .expect("managed WSL cleanup should run via stdin");
    assert!(cleanup_script.contains("remotion-sidecar/render.mjs.*--workspace"));
}

#[test]
fn parse_remotion_sidecar_event_recognizes_progress_completed_and_failed() {
    let progress = parse_remotion_sidecar_event(
        r#"SMARTAIHUB_EVENT {"eventType":"progress","stage":"render_frames","message":"Rendering..."}"#,
    )
    .expect("progress line should parse");
    assert_eq!(
        progress,
        RemotionSidecarEvent::Progress {
            stage: "render_frames".into(),
            message: Some("Rendering...".into()),
        }
    );

    let completed = parse_remotion_sidecar_event(
        r#"SMARTAIHUB_EVENT {"eventType":"completed","outputPath":"/out/render.mp4","durationSec":12.5,"sha256":"abc123","widthPx":1080,"heightPx":1920}"#,
    )
    .expect("completed line should parse");
    assert_eq!(
        completed,
        RemotionSidecarEvent::Completed {
            output_path: "/out/render.mp4".into(),
            duration_sec: 12.5,
            sha256: "abc123".into(),
            width_px: 1080,
            height_px: 1920,
        }
    );

    let failed = parse_remotion_sidecar_event(
        r#"SMARTAIHUB_EVENT {"eventType":"failed","failureCode":"bundle_failed","message":"webpack error"}"#,
    )
    .expect("failed line should parse");
    assert_eq!(
        failed,
        RemotionSidecarEvent::Failed {
            failure_code: "bundle_failed".into(),
            message: "webpack error".into(),
        }
    );

    // Ordinary log output and unrecognized eventType values must be ignored,
    // never panic.
    assert!(parse_remotion_sidecar_event("[Render] Starting render...").is_none());
    assert!(parse_remotion_sidecar_event(
        r#"SMARTAIHUB_EVENT {"eventType":"sidecar.started","stage":"startup"}"#
    )
    .is_none());
    assert!(parse_remotion_sidecar_event("SMARTAIHUB_EVENT not-json").is_none());
}

#[test]
fn remotion_progress_event_builder_ignores_unknown_stage() {
    let job = remotion_claimed_job();

    let known = build_remotion_render_video_progress_event(&job, 5, "render_frames", 60, None);
    assert!(known.is_some());
    assert_eq!(known.unwrap().payload_json["stage"], "render_frames");

    // An unrecognized stage must never be forwarded — the server rejects
    // any job.progress event whose stage isn't in the declared list.
    let unknown =
        build_remotion_render_video_progress_event(&job, 5, "totally_made_up_stage", 60, None);
    assert!(unknown.is_none());
}

#[test]
fn remotion_failure_event_coerces_unknown_failure_code_to_render_failed() {
    let job = remotion_claimed_job();

    let known =
        build_remotion_render_video_failure_event(&job, 9, "bundle_failed", "webpack blew up");
    assert_eq!(known.payload_json["failureCode"], "bundle_failed");

    let unknown =
        build_remotion_render_video_failure_event(&job, 9, "not_a_real_code", "sidecar exited 1");
    assert_eq!(unknown.payload_json["failureCode"], "render_failed");
    assert_eq!(unknown.event_type, "job.failed");
}
