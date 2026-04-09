use smartspec_shell_lib::desktop_worker_folder_ingest::{
    prepare_local_folder_ingest_execution, LocalFolderIngestJobSpec, LocalFolderIngestOutputTargets,
    LocalFolderIngestPlanRequest, LocalFolderIngestPolicy, LocalFolderIngestRootSpec,
    LocalFolderIngestWorkspacePolicy,
};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-folder-ingest-{name}-{suffix}"));
    path
}

fn build_request(root_dir: &PathBuf, workspace_dir: &PathBuf) -> LocalFolderIngestPlanRequest {
    LocalFolderIngestPlanRequest {
        job_id: "job-folder-1".into(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
        job: LocalFolderIngestJobSpec {
            roots: vec![LocalFolderIngestRootSpec {
                root_id: "quotes".into(),
                name: "Quotes".into(),
                path: root_dir.to_string_lossy().to_string(),
                requested_writeback_mode: None,
                advanced_local_mode: false,
            }],
            workspace_policy: LocalFolderIngestWorkspacePolicy {
                mode: "workspace_scoped".into(),
                allowed_source_roots: vec![root_dir.parent().unwrap().to_string_lossy().to_string()],
            },
            ingest_policy: LocalFolderIngestPolicy {
                max_depth: 4,
                max_files: 250,
                include_preview_text: true,
                preview_file_limit: 20,
                snippet_query: Some("launch".into()),
                snippet_file_limit: 10,
            },
            output_targets: LocalFolderIngestOutputTargets {
                publish_manifest_to_library: true,
                publish_summary_to_library: true,
                trigger_indexing: true,
            },
        },
    }
}

#[test]
fn prepares_local_folder_ingest_plan_from_authorized_roots() {
    let root_parent = temp_dir("roots");
    let root_dir = root_parent.join("quotes");
    let workspace_dir = temp_dir("workspace");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();
    fs::write(root_dir.join("quote.txt"), "launch narrative").unwrap();

    let plan = prepare_local_folder_ingest_execution(build_request(&root_dir, &workspace_dir)).unwrap();

    assert_eq!(plan.managed_roots.len(), 1);
    assert_eq!(plan.max_depth, 4);
    assert!(plan.progress_stages.contains(&"index_files".to_string()));
    assert!(plan.manifest_output_path.ends_with("local_folder_ingest_manifest.json"));
  }

#[test]
fn rejects_local_folder_ingest_roots_outside_allowed_roots() {
    let allowed_root = temp_dir("allowed");
    let denied_root = temp_dir("denied");
    let workspace_dir = temp_dir("workspace-denied");
    fs::create_dir_all(&allowed_root).unwrap();
    fs::create_dir_all(&denied_root).unwrap();
    fs::create_dir_all(&workspace_dir).unwrap();

    let mut request = build_request(&denied_root, &workspace_dir);
    request.job.workspace_policy.allowed_source_roots = vec![allowed_root.to_string_lossy().to_string()];

    let error = prepare_local_folder_ingest_execution(request).unwrap_err();

    assert!(error.contains("outside the approved workspace roots"));
}
