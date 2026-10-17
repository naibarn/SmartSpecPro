// Exercise the exact desktop projection without loading the Tauri GUI runtime.
#[path = "../../runner-desktop/src-tauri/src/workspace_view.rs"]
mod workspace_view;
use smartaihub_runner::{config::RunnerConfig, workspace_registry};
use std::{fs, process::Command};

fn fixture() -> (tempfile::TempDir, RunnerConfig, String) {
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join("workspace");
    fs::create_dir(&folder).unwrap();
    let mut config = RunnerConfig::local("runner", "device", "https://example.test");
    config.data_root = root.path().join("data").to_string_lossy().into_owned();
    let id = workspace_registry::register(&config, &folder)
        .unwrap()
        .workspace_id;
    (root, config, id)
}

#[test]
fn desktop_binding_persists_clears_and_never_invents_task_or_git() {
    let (_root, config, id) = fixture();
    workspace_view::bind(&config, false, &id, Some("project-1"), Some("org/repo")).unwrap();
    let views = workspace_view::list(&config).unwrap();
    assert_eq!(views[0].facts.project_id.as_deref(), Some("project-1"));
    assert_eq!(views[0].facts.repository_id.as_deref(), Some("org/repo"));
    assert_eq!(views[0].facts.task_id, None);
    assert_eq!(views[0].facts.git_head, None);
    assert_eq!(views[0].facts.convergence_state, "NOT_REPORTED");
    let snapshot = serde_json::to_string(&views[0].facts).unwrap();
    assert!(!snapshot.contains(&config.data_root));
    assert!(!snapshot.contains("localPath"));
    workspace_view::bind(&config, false, &id, None, None).unwrap();
    let views = workspace_view::list(&config).unwrap();
    assert_eq!(views[0].facts.project_id, None);
    assert_eq!(views[0].facts.repository_id, None);
}

#[test]
fn desktop_rejects_running_and_invalid_binding_without_changing_registry() {
    let (_root, config, id) = fixture();
    workspace_view::bind(&config, false, &id, Some("original"), None).unwrap();
    assert_eq!(
        workspace_view::bind(&config, true, &id, Some("changed"), None).unwrap_err(),
        "RUNNER_WORKSPACE_BINDING_REQUIRES_STOP"
    );
    assert_eq!(
        workspace_view::bind(&config, false, &id, None, Some("https://secret@host/repo"))
            .unwrap_err(),
        "RUNNER_WORKSPACE_IDENTITY_INVALID"
    );
    assert_eq!(
        workspace_view::bind(&config, false, "unknown", None, None).unwrap_err(),
        "RUNNER_WORKSPACE_NOT_REGISTERED"
    );
    assert_eq!(
        workspace_view::list(&config).unwrap()[0]
            .facts
            .project_id
            .as_deref(),
        Some("original")
    );
}

#[test]
fn desktop_git_facts_follow_real_commit_and_dirty_state() {
    let (root, config, _id) = fixture();
    let folder = root.path().join("workspace");
    let git = |args: &[&str]| {
        let output = Command::new("git")
            .current_dir(&folder)
            .args(args)
            .output()
            .unwrap();
        assert!(output.status.success(), "git command failed");
        String::from_utf8(output.stdout).unwrap().trim().to_owned()
    };
    git(&["init"]);
    git(&[
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--allow-empty",
        "-m",
        "fixture",
    ]);
    let head = git(&["rev-parse", "HEAD"]);
    let views = workspace_view::list(&config).unwrap();
    assert_eq!(views[0].facts.git_head.as_deref(), Some(head.as_str()));
    assert!(!views[0].facts.dirty);
    fs::write(folder.join("change.txt"), "real change").unwrap();
    assert!(workspace_view::list(&config).unwrap()[0].facts.dirty);
}
