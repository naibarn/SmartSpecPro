use serde_json::json;
use smart_ai_hub_worker_app_lib::runtime_manifest::DoctorSummary;
use smart_ai_hub_worker_app_lib::worker_executor::{
    build_failure_event, build_progress_event_plan, build_required_artifact_uploads,
    build_sidecar_command, build_sidecar_manifest, prepare_hyperframes_execution_plan,
    validate_workspace_path, ClaimedWorkerJob,
};

fn ready_doctor() -> DoctorSummary {
    DoctorSummary {
        status: "ready".into(),
        checks: vec![],
        recommended_actions: vec![],
    }
}

fn blocked_doctor() -> DoctorSummary {
    DoctorSummary {
        status: "blocked".into(),
        checks: vec![],
        recommended_actions: vec!["Download render runtime".into()],
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
            "assetManifest": {
                "sourceVideos": [
                    { "shotId": "shot-1", "sourceMediaRef": "/signed/video-1.mp4" }
                ]
            }
        }),
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
    assert!(events.iter().all(|event| event.assignment_attempt == "attempt_1"));
    assert!(events.iter().all(|event| event.lease_owner_token == "lease-1"));
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
    let command = build_sidecar_command(std::path::Path::new("hyperframes-render.exe"), &plan).unwrap();

    assert_eq!(command.args[0], "render");
    assert!(command.args.contains(&"--manifest".to_string()));
    assert!(command.args.contains(&"--output-dir".to_string()));
    assert!(!command.args.iter().any(|arg| arg.contains("&&") || arg.contains(';') || arg.contains('|')));

    let manifest = build_sidecar_manifest(&job, &plan);
    assert_eq!(manifest["runtimePolicy"]["requireOfficialRuntime"], true);
    assert_eq!(manifest["runtimePolicy"]["rejectFallbackRender"], true);
    assert_eq!(manifest["runtimePolicy"]["localHttpServerAllowed"], false);
}

#[test]
fn upload_plan_contains_all_required_artifacts_and_assignment_attempt() {
    let dir = tempfile::tempdir().unwrap();
    let job = claimed_job();
    let plan = prepare_hyperframes_execution_plan(&job, dir.path(), &ready_doctor()).unwrap();
    let uploads = build_required_artifact_uploads(&job, &plan);
    let artifact_types: Vec<_> = uploads.iter().map(|upload| upload.artifact_type.as_str()).collect();

    assert_eq!(artifact_types, vec![
        "hyperframes_final_video",
        "hyperframes_render_manifest",
        "hyperframes_runtime_doctor",
        "hyperframes_probe_report",
    ]);
    assert!(uploads.iter().all(|upload| upload.assignment_attempt == "attempt_1"));
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
