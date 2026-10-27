#[cfg(test)]
mod tests {
    use crate::{config::RunnerConfig, workspace_registry};
    use std::fs;

    #[test]
    fn registers_workspace_without_serializing_local_path() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("my-project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };

        let registered = workspace_registry::register(&config, &project).unwrap();
        let listed = workspace_registry::list(&config).unwrap();
        let stored = fs::read_to_string(workspace_registry::registry_file(&config)).unwrap();
        let stored_file: workspace_registry::WorkspaceRegistryFile =
            serde_json::from_str(&stored).unwrap();
        let stored_records = stored_file.records;
        let published = serde_json::to_string(&listed).unwrap();
        let canonical_project = project.canonicalize().unwrap();

        assert_eq!(listed, vec![registered.clone()]);
        assert!(registered.workspace_id.starts_with("ws-my-project-"));
        assert_eq!(stored_records.len(), 1);
        assert_eq!(stored_records[0].local_path, canonical_project);
        assert!(!published.contains(&project.to_string_lossy().to_string()));
        assert!(
            workspace_registry::resolve(&config, &registered.workspace_id)
                .unwrap()
                .is_dir()
        );
    }

    #[test]
    fn publishes_only_explicit_project_repository_and_current_task_identity() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("private-project-folder");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();
        let bound = workspace_registry::bind_identity(
            &config,
            &registered.workspace_id,
            Some("project-a"),
            Some("github.com/org/repository"),
        )
        .unwrap();
        assert_eq!(bound.project_id.as_deref(), Some("project-a"));
        assert_eq!(
            bound.repository_id.as_deref(),
            Some("github.com/org/repository")
        );

        let facts = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(facts[0].project_id.as_deref(), Some("project-a"));
        assert_eq!(
            facts[0].repository_id.as_deref(),
            Some("github.com/org/repository")
        );
        assert_eq!(facts[0].task_id, None);
        assert_eq!(facts[0].convergence_state, "NOT_REPORTED");
        let serialized = serde_json::to_string(&facts).unwrap();
        assert!(serialized.contains("\"projectId\":\"project-a\""));
        assert!(serialized.contains("\"repositoryId\":\"github.com/org/repository\""));
        assert!(!serialized.contains(&project.to_string_lossy().to_string()));

        assert_eq!(
            workspace_registry::bind_identity(
                &config,
                &registered.workspace_id,
                Some("https://token@github.com/org/repository"),
                None,
            )
            .unwrap_err(),
            "RUNNER_WORKSPACE_IDENTITY_INVALID"
        );
    }

    #[test]
    fn loads_legacy_workspace_records_without_identity_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("legacy-project");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: temp
                .path()
                .join("runner-data")
                .to_string_lossy()
                .into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        fs::create_dir_all(&config.data_root).unwrap();
        let legacy = serde_json::json!([{
            "workspace_id": "workspace-legacy",
            "display_name": "Legacy",
            "local_path": project.canonicalize().unwrap(),
        }]);
        fs::write(
            workspace_registry::registry_file(&config),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();

        assert_eq!(
            workspace_registry::list(&config).unwrap(),
            vec![workspace_registry::RegisteredWorkspace {
                workspace_id: "workspace-legacy".into(),
                display_name: "Legacy".into(),
                project_id: None,
                repository_id: None,
                root_id: None,
                kind: workspace_registry::WorkspaceKind::Workspace,
            }]
        );
    }

    #[test]
    fn rejects_unregistered_workspace_ids_and_non_directories() {
        let temp = tempfile::tempdir().unwrap();
        let config = RunnerConfig {
            data_root: temp
                .path()
                .join("runner-data")
                .to_string_lossy()
                .into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let file = temp.path().join("not-a-directory");
        fs::write(&file, "test").unwrap();

        assert!(workspace_registry::register(&config, &file).is_err());
        assert!(workspace_registry::resolve(&config, "ws-forged").is_err());
    }

    #[test]
    fn rejects_path_replacement_after_workspace_registration() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();
        fs::remove_dir(&project).unwrap();
        fs::write(&project, "replacement").unwrap();

        assert!(workspace_registry::resolve(&config, &registered.workspace_id).is_err());
    }

    #[test]
    fn provisions_two_projects_under_an_explicit_root_and_reopens_stable_identity() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };

        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        let project_a = workspace_registry::create_project(
            &config,
            &authorized.workspace_id,
            "project-a",
            "project-001",
            None,
        )
        .unwrap();
        let project_b = workspace_registry::create_project(
            &config,
            &authorized.workspace_id,
            "project-b",
            "project-002",
            Some("github.com/acme/project-002"),
        )
        .unwrap();
        let reopened = workspace_registry::list(&config)
            .unwrap()
            .into_iter()
            .find(|project| project.project_id.as_deref() == Some("project-a"))
            .unwrap();

        assert_eq!(project_a, reopened);
        assert_eq!(
            project_a.root_id.as_deref(),
            Some(authorized.workspace_id.as_str())
        );
        assert_ne!(project_a.workspace_id, project_b.workspace_id);
        assert!(root.join("project-001").is_dir());
        assert!(root.join("project-002").is_dir());
        assert_eq!(
            workspace_registry::resolve(&config, &project_a.workspace_id).unwrap(),
            root.join("project-001").canonicalize().unwrap()
        );
        assert_eq!(
            workspace_registry::list_roots(&config).unwrap(),
            vec![authorized]
        );
    }

    #[test]
    fn refuses_project_path_reuse_traversal_and_unregistered_roots() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let outside = temp.path().join("outside");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();

        assert_eq!(
            workspace_registry::create_project(&config, "root-forged", "p1", "one", None)
                .unwrap_err(),
            "RUNNER_ROOT_NOT_AUTHORIZED"
        );
        assert_eq!(
            workspace_registry::create_project(
                &config,
                &authorized.workspace_id,
                "p1",
                "../outside",
                None
            )
            .unwrap_err(),
            "RUNNER_PROJECT_NAME_INVALID"
        );
        let imported = outside.join("existing");
        fs::create_dir(&imported).unwrap();
        assert_eq!(
            workspace_registry::import_project(
                &config,
                &authorized.workspace_id,
                &imported,
                "p2",
                None
            )
            .unwrap_err(),
            "RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION"
        );
        workspace_registry::create_project(&config, &authorized.workspace_id, "p1", "one", None)
            .unwrap();
        assert_eq!(
            workspace_registry::create_project(
                &config,
                &authorized.workspace_id,
                "p2",
                "one",
                None
            )
            .unwrap_err(),
            "RUNNER_PROJECT_PATH_ALREADY_EXISTS"
        );
    }

    #[test]
    fn imports_existing_project_without_changing_files_and_rejects_symlink_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let outside = temp.path().join("outside");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        let existing = root.join("existing");
        fs::create_dir(&existing).unwrap();
        fs::write(existing.join("notes.txt"), "keep").unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        let imported = workspace_registry::import_project(
            &config,
            &authorized.workspace_id,
            &existing,
            "project-existing",
            None,
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(existing.join("notes.txt")).unwrap(),
            "keep"
        );
        assert_eq!(
            workspace_registry::resolve(&config, &imported.workspace_id).unwrap(),
            existing.canonicalize().unwrap()
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
            assert_eq!(
                workspace_registry::import_project(
                    &config,
                    &authorized.workspace_id,
                    &root.join("escape"),
                    "project-escape",
                    None
                )
                .unwrap_err(),
                "RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION"
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn import_rejects_junction_alias_inside_authorized_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        fs::create_dir(&root).unwrap();
        let existing = root.join("existing");
        fs::create_dir(&existing).unwrap();
        fs::write(existing.join("notes.txt"), "keep").unwrap();
        let junction = root.join("alias");
        let command = format!(
            "mklink /J \"{}\" \"{}\"",
            junction.display(),
            existing.display()
        );
        let status = std::process::Command::new("cmd.exe")
            .args(["/C", &command])
            .status()
            .unwrap();
        assert!(status.success(), "failed to create test junction");

        let config = RunnerConfig {
            data_root: temp.path().join("runner-data").to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        assert_eq!(
            workspace_registry::import_project(
                &config,
                &authorized.workspace_id,
                &junction,
                "project-alias",
                None,
            )
            .unwrap_err(),
            "RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION"
        );
        assert_eq!(
            fs::read_to_string(existing.join("notes.txt")).unwrap(),
            "keep"
        );
        assert!(workspace_registry::list(&config).unwrap().is_empty());
    }

    #[test]
    fn import_upgrades_a_legacy_registration_in_place_and_keeps_its_workspace_id() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let project_path = root.join("legacy-project");
        let data = temp.path().join("runner-data");
        fs::create_dir_all(&project_path).unwrap();
        fs::write(project_path.join("keep.txt"), "legacy data").unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let legacy = workspace_registry::register(&config, &project_path).unwrap();
        workspace_registry::bind_identity(
            &config,
            &legacy.workspace_id,
            None,
            Some("github.com/acme/legacy-project"),
        )
        .unwrap();
        let root = workspace_registry::register_root(&config, &root).unwrap();

        let imported = workspace_registry::import_project(
            &config,
            &root.workspace_id,
            &project_path,
            "canonical-project-1",
            None,
        )
        .unwrap();

        assert_eq!(imported.workspace_id, legacy.workspace_id);
        assert_eq!(imported.kind, workspace_registry::WorkspaceKind::Project);
        assert_eq!(imported.project_id.as_deref(), Some("canonical-project-1"));
        assert_eq!(
            imported.repository_id.as_deref(),
            Some("github.com/acme/legacy-project")
        );
        assert_eq!(workspace_registry::list(&config).unwrap().len(), 1);
        assert_eq!(
            fs::read_to_string(project_path.join("keep.txt")).unwrap(),
            "legacy data"
        );
    }

    #[test]
    fn legacy_registry_is_readable_and_migrates_when_a_root_is_added() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        fs::create_dir(&root).unwrap();
        let legacy = temp.path().join("legacy");
        fs::create_dir(&legacy).unwrap();
        let data = temp.path().join("runner-data");
        fs::create_dir_all(&data).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let path = workspace_registry::registry_file(&config);
        fs::write(
            &path,
            serde_json::json!([{"workspace_id":"legacy-id","display_name":"legacy",
            "local_path":legacy.canonicalize().unwrap()}])
            .to_string(),
        )
        .unwrap();
        assert_eq!(
            workspace_registry::list(&config).unwrap()[0].workspace_id,
            "legacy-id"
        );
        workspace_registry::register_root(&config, &root).unwrap();
        let migrated: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(migrated["schema_version"], 2);
        assert_eq!(
            workspace_registry::list(&config).unwrap()[0].workspace_id,
            "legacy-id"
        );
    }

    #[test]
    fn recovers_interrupted_project_provisioning_without_losing_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        let project = workspace_registry::create_project(
            &config,
            &authorized.workspace_id,
            "project-recover",
            "recover-me",
            None,
        )
        .unwrap();
        let project_path = workspace_registry::resolve(&config, &project.workspace_id).unwrap();
        fs::remove_dir_all(project_path.join(".git")).unwrap();
        fs::write(project_path.join("partial.txt"), "preserve this").unwrap();
        workspace_registry::set_project_lifecycle(
            &config,
            &project.workspace_id,
            "RECOVERY_REQUIRED",
        )
        .unwrap();

        let recovered = workspace_registry::recover_project_provisioning(&config).unwrap();
        assert!(recovered
            .iter()
            .any(|item| item.workspace_id == project.workspace_id));
        assert_eq!(
            fs::read_to_string(project_path.join("partial.txt")).unwrap(),
            "preserve this"
        );
        let state = workspace_registry::load_records(&config).unwrap();
        assert_eq!(
            state
                .iter()
                .find(|item| item.workspace_id == project.workspace_id)
                .unwrap()
                .lifecycle
                .as_deref(),
            Some("RECOVERY_REQUIRED")
        );
    }

    #[test]
    fn binds_multiple_isolated_run_contexts_to_the_same_project_and_attempt() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        let project = workspace_registry::create_project(
            &config,
            &authorized.workspace_id,
            "project-a",
            "project-a",
            None,
        )
        .unwrap();
        let candidates = data.join("spec224-candidates");
        fs::create_dir_all(&candidates).unwrap();
        let first_path = candidates.join("attempt-one");
        let second_path = candidates.join("attempt-two");
        fs::create_dir(&first_path).unwrap();
        fs::create_dir(&second_path).unwrap();
        let first = workspace_registry::register_run_workspace(
            &config,
            &project.workspace_id,
            "job-1",
            1,
            &first_path,
        )
        .unwrap();
        let resumed = workspace_registry::register_run_workspace(
            &config,
            &project.workspace_id,
            "job-1",
            1,
            &first_path,
        )
        .unwrap();
        let concurrent = workspace_registry::register_run_workspace(
            &config,
            &project.workspace_id,
            "job-2",
            1,
            &second_path,
        )
        .unwrap();

        assert_eq!(first, resumed);
        assert_ne!(first.workspace_id, concurrent.workspace_id);
        assert_eq!(first.project_id.as_deref(), Some("project-a"));
        assert_eq!(
            workspace_registry::list_run_workspaces(&config)
                .unwrap()
                .len(),
            2
        );
        workspace_registry::update_run_workspace_lifecycle(
            &config,
            &first.workspace_id,
            "COMPLETED",
        )
        .unwrap();
        assert_eq!(
            workspace_registry::list_run_workspaces(&config)
                .unwrap()
                .iter()
                .find(|item| item.workspace_id == first.workspace_id)
                .unwrap()
                .lifecycle,
            "COMPLETED"
        );
        assert!(
            !serde_json::to_string(&workspace_registry::list_run_workspaces(&config).unwrap())
                .unwrap()
                .contains(&first_path.to_string_lossy().to_string())
        );
    }

    #[test]
    fn run_projection_is_bounded_without_discarding_registry_history() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Projects");
        let data = temp.path().join("runner-data");
        fs::create_dir(&root).unwrap();
        let config = RunnerConfig {
            data_root: data.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let authorized = workspace_registry::register_root(&config, &root).unwrap();
        let project = workspace_registry::create_project(
            &config,
            &authorized.workspace_id,
            "project-a",
            "project-a",
            None,
        )
        .unwrap();
        let candidate_root = data.join("spec224-candidates");
        fs::create_dir_all(&candidate_root).unwrap();
        for attempt in 1..=65 {
            let path = candidate_root.join(format!("run-{attempt}"));
            fs::create_dir(&path).unwrap();
            workspace_registry::register_run_workspace(
                &config,
                &project.workspace_id,
                &format!("job-{attempt}"),
                attempt,
                &path,
            )
            .unwrap();
        }

        assert_eq!(
            workspace_registry::list_run_workspaces(&config)
                .unwrap()
                .len(),
            64
        );
        assert_eq!(
            workspace_registry::load_records(&config)
                .unwrap()
                .iter()
                .filter(|row| row.kind == workspace_registry::WorkspaceKind::Run)
                .count(),
            65
        );
    }

    #[test]
    fn snapshot_facts_keep_non_git_and_missing_workspaces_redacted_and_bounded() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("non-git-project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        let registered = workspace_registry::register(&config, &project).unwrap();

        let facts = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].workspace_id, registered.workspace_id);
        assert_eq!(facts[0].display_name, registered.display_name);
        assert_eq!(facts[0].git_head, None);
        assert_eq!(facts[0].git_branch, None);
        assert!(!facts[0].dirty);
        let published = serde_json::to_string(&facts).unwrap();
        assert!(!published.contains(&project.to_string_lossy().to_string()));

        fs::remove_dir(&project).unwrap();
        let missing = workspace_registry::snapshot_facts(&config).unwrap();
        assert_eq!(missing[0].workspace_id, registered.workspace_id);
        assert_eq!(missing[0].git_head, None);
        assert_eq!(missing[0].git_branch, None);
        assert!(!missing[0].dirty);
    }

    #[test]
    fn snapshot_fingerprint_tracks_source_content_but_ignores_gitignored_files() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&project)
            .status()
            .unwrap();
        fs::write(project.join(".gitignore"), "ignored.txt\n").unwrap();
        fs::write(project.join("source.txt"), "one").unwrap();
        std::process::Command::new("git")
            .args(["add", ".gitignore", "source.txt"])
            .current_dir(&project)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-qm",
                "baseline",
            ])
            .current_dir(&project)
            .status()
            .unwrap();
        workspace_registry::register(&config, &project).unwrap();

        let first = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        fs::write(project.join("ignored.txt"), "secret or generated").unwrap();
        let ignored = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_eq!(first, ignored);
        fs::write(project.join("source.txt"), "two").unwrap();
        let changed = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, changed);
        assert!(first.as_deref().is_some_and(|value| value.len() == 64));

        std::process::Command::new("git")
            .args(["checkout", "--", "source.txt"])
            .current_dir(&project)
            .status()
            .unwrap();
        fs::write(project.join("new.md"), "untracked").unwrap();
        let untracked = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, untracked);
        fs::remove_file(project.join("new.md")).unwrap();

        fs::remove_file(project.join("source.txt")).unwrap();
        let deleted = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert_ne!(first, deleted);
        fs::write(project.join("source.txt"), "one").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                project.join("source.txt"),
                fs::Permissions::from_mode(0o755),
            )
            .unwrap();
            let executable = workspace_registry::snapshot_facts(&config).unwrap()[0]
                .content_fingerprint
                .clone();
            assert_ne!(first, executable);
        }
    }

    #[test]
    fn fingerprints_clean_large_git_workspaces_from_the_immutable_tree() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("large-project");
        let data_root = temp.path().join("runner-data");
        fs::create_dir_all(&project).unwrap();
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&project)
            .status()
            .unwrap();
        fs::write(project.join("source.txt"), "tracked").unwrap();
        let large = fs::File::create(project.join("large.bin")).unwrap();
        large.set_len(512 * 1024 * 1024 + 1).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("source.txt", project.join("source-link")).unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&project)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-qm",
                "large baseline",
            ])
            .current_dir(&project)
            .status()
            .unwrap();
        let config = RunnerConfig {
            data_root: data_root.to_string_lossy().into_owned(),
            ..RunnerConfig::local("runner-1", "device-1", "https://example.test")
        };
        workspace_registry::register(&config, &project).unwrap();

        let fingerprint = workspace_registry::snapshot_facts(&config).unwrap()[0]
            .content_fingerprint
            .clone();
        assert!(fingerprint
            .as_deref()
            .is_some_and(|value| value.len() == 64));
    }

    #[test]
    fn rejects_unbounded_git_fields_before_publishing() {
        assert!(workspace_registry::valid_git_head(&"a".repeat(40)));
        assert!(!workspace_registry::valid_git_head(
            "remote:https://private.example/repo"
        ));
        assert!(workspace_registry::valid_git_branch(
            "feature/workspace-facts_1"
        ));
        assert!(!workspace_registry::valid_git_branch(
            "origin/https://private.example/repo"
        ));
        assert!(!workspace_registry::valid_git_branch(&"a".repeat(121)));
    }

    #[test]
    fn workspace_fingerprint_path_encoding_supports_unicode_names() {
        let path = std::path::Path::new("src/ผู้ช่วย.rs");
        let parsed = workspace_registry::path_from_git_bytes("src/ผู้ช่วย.rs".as_bytes());

        assert_eq!(parsed.as_deref(), Some(path));
        assert!(!workspace_registry::os_str_identity_bytes(path.as_os_str()).is_empty());
    }
}
use crate::config::RunnerConfig;
use crate::process::background_command;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::fs::OpenOptions;
#[cfg(unix)]
use std::os::unix::ffi::OsStrExt;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisteredWorkspace {
    pub workspace_id: String,
    pub display_name: String,
    pub project_id: Option<String>,
    pub repository_id: Option<String>,
    #[serde(default)]
    pub root_id: Option<String>,
    #[serde(default)]
    pub kind: WorkspaceKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceKind {
    #[default]
    Workspace,
    Root,
    Project,
    Run,
}

/// Redacted, read-only facts that a Runner may include in its capability
/// snapshot. Local paths and Git remotes intentionally never leave the device.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotFacts {
    pub workspace_id: String,
    pub project_id: Option<String>,
    pub repository_id: Option<String>,
    pub root_id: Option<String>,
    pub kind: WorkspaceKind,
    pub display_name: String,
    pub git_head: Option<String>,
    pub git_branch: Option<String>,
    pub dirty: bool,
    pub content_fingerprint: Option<String>,
    pub task_id: Option<String>,
    pub convergence_state: String,
    pub convergence_canonical_sha: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunWorkspaceFact {
    pub workspace_id: String,
    pub run_id: String,
    pub attempt_id: u32,
    pub source_workspace_id: String,
    pub project_id: Option<String>,
    pub lifecycle: String,
}

/// Local-only workspace details for the Runner desktop UI. Never include this
/// type in a control-plane capability snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWorkspaceDetails {
    pub workspace_id: String,
    pub display_name: String,
    pub local_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceRecord {
    #[serde(default)]
    kind: WorkspaceKind,
    workspace_id: String,
    display_name: String,
    local_path: PathBuf,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    repository_id: Option<String>,
    #[serde(default)]
    root_id: Option<String>,
    #[serde(default)]
    run_id: Option<String>,
    #[serde(default)]
    attempt_id: Option<u32>,
    #[serde(default)]
    source_workspace_id: Option<String>,
    #[serde(default)]
    lifecycle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceRegistryFile {
    schema_version: u32,
    #[serde(default)]
    runner_id: String,
    #[serde(default)]
    device_id: Option<String>,
    records: Vec<WorkspaceRecord>,
}

pub fn registry_file(config: &RunnerConfig) -> PathBuf {
    PathBuf::from(&config.data_root).join("workspace_registry.json")
}

pub fn list(config: &RunnerConfig) -> Result<Vec<RegisteredWorkspace>, String> {
    Ok(load_records(config)?
        .into_iter()
        .filter(|record| record.kind != WorkspaceKind::Root && record.kind != WorkspaceKind::Run)
        .map(|record| RegisteredWorkspace {
            workspace_id: record.workspace_id,
            display_name: record.display_name,
            project_id: record.project_id,
            repository_id: record.repository_id,
            root_id: record.root_id,
            kind: record.kind,
        })
        .collect())
}

pub fn list_local_details(config: &RunnerConfig) -> Result<Vec<LocalWorkspaceDetails>, String> {
    Ok(load_records(config)?
        .into_iter()
        .filter(|record| record.kind != WorkspaceKind::Root && record.kind != WorkspaceKind::Run)
        .map(|record| LocalWorkspaceDetails {
            workspace_id: record.workspace_id,
            display_name: record.display_name,
            local_path: record.local_path,
        })
        .collect())
}

/// Return bounded repository facts for registered workspaces without exposing
/// their filesystem locations or remotes. A missing or non-Git workspace stays
/// visible by ID and is reported with no Git identity and `dirty: false`.
pub fn snapshot_facts(config: &RunnerConfig) -> Result<Vec<WorkspaceSnapshotFacts>, String> {
    Ok(load_records(config)?
        .into_iter()
        .filter(|record| record.kind != WorkspaceKind::Root && record.kind != WorkspaceKind::Run)
        .map(|record| {
            let inspection = inspect_git_workspace(&record.local_path);
            WorkspaceSnapshotFacts {
                workspace_id: record.workspace_id,
                project_id: record.project_id,
                repository_id: record.repository_id,
                root_id: record.root_id,
                kind: record.kind,
                display_name: record.display_name,
                git_head: inspection.git_head,
                git_branch: inspection.git_branch,
                dirty: inspection.dirty,
                content_fingerprint: fingerprint_workspace(&record.local_path),
                task_id: None,
                convergence_state: "NOT_REPORTED".into(),
                convergence_canonical_sha: None,
            }
        })
        .collect())
}

pub(crate) fn fingerprint_workspace(workspace: &Path) -> Option<String> {
    if !workspace.is_dir() {
        return None;
    }
    if let Some(tree) = git_output_bytes(workspace, &["rev-parse", "--verify", "HEAD^{tree}"]) {
        return fingerprint_git_workspace(workspace, tree);
    }
    let listed = background_command("git")
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .current_dir(workspace)
        .output()
        .ok()
        .filter(|output| output.status.success());
    let paths: Vec<PathBuf> = if let Some(output) = listed {
        let parsed: Option<Vec<PathBuf>> = output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|part| !part.is_empty())
            .map(path_from_git_bytes)
            .collect();
        if let Some(paths) = parsed {
            paths
        } else {
            let mut paths = Vec::new();
            collect_files(workspace, workspace, &mut paths)?;
            paths
        }
    } else {
        let mut paths = Vec::new();
        collect_files(workspace, workspace, &mut paths)?;
        paths
    };
    if paths.len() > 50_000 {
        return None;
    }
    let mut normalized = paths;
    normalized.sort();
    let mut hasher = Sha256::new();
    let mut total = 0u64;
    for relative in normalized {
        if relative.is_absolute()
            || relative.components().any(|part| {
                matches!(
                    part,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return None;
        }
        let path = workspace.join(&relative);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                hasher.update(b"deleted\0");
                hasher.update(os_str_identity_bytes(relative.as_os_str()).as_ref());
                continue;
            }
            Err(_) => return None,
        };
        if metadata.file_type().is_symlink() {
            return None;
        }
        if !metadata.is_file() {
            continue;
        }
        total = total.checked_add(metadata.len())?;
        if total > 512 * 1024 * 1024 {
            return None;
        }
        let bytes = fs::read(&path).ok()?;
        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111
        };
        #[cfg(not(unix))]
        let mode = 0u32;
        let relative_bytes = os_str_identity_bytes(relative.as_os_str());
        hasher.update((relative_bytes.len() as u64).to_be_bytes());
        hasher.update(relative_bytes.as_ref());
        hasher.update(mode.to_be_bytes());
        hasher.update(Sha256::digest(bytes));
    }
    Some(format!("{:x}", hasher.finalize()))
}

/// Fingerprint a Git workspace from its immutable tree and the bounded set of
/// files that differ from that tree. This avoids reading every tracked byte on
/// each Runner capability refresh, which made large clean repositories fail
/// the legacy 512 MiB scan limit. Dirty regular files remain content-hashed;
/// symlinks are hashed as link targets without following them. Submodules fail
/// closed because their nested worktree needs its own explicit source binding.
fn fingerprint_git_workspace(workspace: &Path, tree: Vec<u8>) -> Option<String> {
    let tree = String::from_utf8(tree).ok()?.trim().to_string();
    if !valid_git_head(&tree) {
        return None;
    }
    let status = git_output_bytes(
        workspace,
        &["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    )?;

    let mut hasher = Sha256::new();
    hasher.update(b"smarthub-runner-workspace-fingerprint:v2\0");
    hasher.update(tree.as_bytes());
    if status.is_empty() {
        return Some(format!("{:x}", hasher.finalize()));
    }

    // Include Git's status bytes so staged, unstaged, conflicted, and dirty
    // submodule states cannot collide when their visible worktree bytes match.
    hasher.update(b"\0git-status\0");
    hasher.update(&status);

    let tracked_changes = git_output_bytes(
        workspace,
        &["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"],
    )?;
    let untracked = git_output_bytes(
        workspace,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    let mut paths = std::collections::BTreeSet::new();
    for raw in tracked_changes
        .split(|byte| *byte == 0)
        .chain(untracked.split(|byte| *byte == 0))
        .filter(|part| !part.is_empty())
    {
        paths.insert(path_from_git_bytes(raw)?);
    }
    if paths.len() > 50_000 {
        return None;
    }

    let mut total = 0u64;
    for relative in paths {
        if relative.is_absolute()
            || relative.components().any(|part| {
                matches!(
                    part,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return None;
        }
        let path = workspace.join(&relative);
        let relative_bytes = os_str_identity_bytes(relative.as_os_str());
        hasher.update((relative_bytes.len() as u64).to_be_bytes());
        hasher.update(relative_bytes.as_ref());

        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                hasher.update(b"\0deleted\0");
                continue;
            }
            Err(_) => return None,
        };
        if metadata.file_type().is_symlink() {
            let target = fs::read_link(&path).ok()?;
            hasher.update(b"\0symlink\0");
            hasher.update(os_str_identity_bytes(target.as_os_str()).as_ref());
            continue;
        }
        if metadata.is_dir() {
            // This is normally a changed submodule. Do not claim its nested
            // contents are bound by the parent repository's tree SHA.
            return None;
        }
        if !metadata.is_file() {
            return None;
        }
        total = total.checked_add(metadata.len())?;
        if total > 512 * 1024 * 1024 {
            return None;
        }
        let bytes = fs::read(&path).ok()?;
        hasher.update(b"\0file\0");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            hasher.update((metadata.permissions().mode() & 0o111).to_be_bytes());
        }
        #[cfg(not(unix))]
        hasher.update(0u32.to_be_bytes());
        hasher.update(Sha256::digest(bytes));
    }
    Some(format!("{:x}", hasher.finalize()))
}

fn git_output_bytes(workspace: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = background_command("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .ok()?;
    output.status.success().then_some(output.stdout)
}

#[cfg(unix)]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    Some(PathBuf::from(OsStr::from_bytes(bytes)))
}

#[cfg(windows)]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    String::from_utf8(bytes.to_vec()).ok().map(PathBuf::from)
}

#[cfg(not(any(unix, windows)))]
fn path_from_git_bytes(bytes: &[u8]) -> Option<PathBuf> {
    String::from_utf8(bytes.to_vec()).ok().map(PathBuf::from)
}

#[cfg(unix)]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Borrowed(value.as_bytes())
}

#[cfg(windows)]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Owned(value.encode_wide().flat_map(u16::to_le_bytes).collect())
}

#[cfg(not(any(unix, windows)))]
fn os_str_identity_bytes(value: &OsStr) -> Cow<'_, [u8]> {
    Cow::Owned(value.to_string_lossy().as_bytes().to_vec())
}

fn collect_files(root: &Path, directory: &Path, result: &mut Vec<PathBuf>) -> Option<()> {
    for entry in fs::read_dir(directory).ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let kind = entry.file_type().ok()?;
        if kind.is_symlink() {
            return None;
        }
        if kind.is_dir() {
            collect_files(root, &entry.path(), result)?;
        } else if kind.is_file() {
            result.push(entry.path().strip_prefix(root).ok()?.to_path_buf());
        }
    }
    Some(())
}

#[derive(Default)]
struct GitWorkspaceInspection {
    git_head: Option<String>,
    git_branch: Option<String>,
    dirty: bool,
}

fn inspect_git_workspace(workspace: &Path) -> GitWorkspaceInspection {
    if !workspace.is_dir() {
        return GitWorkspaceInspection::default();
    }
    let git_dir = background_command("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(workspace)
        .output();
    let Ok(git_dir) = git_dir else {
        return GitWorkspaceInspection::default();
    };
    if !git_dir.status.success() {
        return GitWorkspaceInspection::default();
    }

    let git_head = git_output(workspace, &["rev-parse", "--verify", "HEAD"])
        .filter(|value| valid_git_head(value));
    let git_branch = git_output(workspace, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .filter(|value| valid_git_branch(value));
    let dirty = background_command("git")
        .args(["status", "--porcelain", "--untracked-files=normal"])
        .current_dir(workspace)
        .output()
        .map(|output| output.status.success() && !output.stdout.is_empty())
        .unwrap_or(false);
    GitWorkspaceInspection {
        git_head,
        git_branch,
        dirty,
    }
}

fn git_output(workspace: &Path, args: &[&str]) -> Option<String> {
    let output = background_command("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn valid_git_head(value: &str) -> bool {
    (40..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_git_branch(value: &str) -> bool {
    (1..=120).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'.' | b'-'))
}

pub fn register(config: &RunnerConfig, path: &Path) -> Result<RegisteredWorkspace, String> {
    let _lock = registry_write_lock(config)?;
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "RUNNER_WORKSPACE_PATH_NOT_FOUND".to_string())?;
    if !canonical_path.is_dir() {
        return Err("RUNNER_WORKSPACE_MUST_BE_DIRECTORY".into());
    }
    let name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "RUNNER_WORKSPACE_NAME_INVALID".to_string())?
        .to_string();
    let mut hasher = Sha256::new();
    hasher.update(canonical_path.as_os_str().to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let slug = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let workspace = RegisteredWorkspace {
        workspace_id: format!("ws-{}-{}", slug.trim_matches('-'), &digest[..12]),
        display_name: name.chars().take(80).collect(),
        project_id: None,
        repository_id: None,
        root_id: None,
        kind: WorkspaceKind::Workspace,
    };

    let mut records = load_records(config)?;
    if let Some(existing) = records
        .iter()
        .find(|record| record.workspace_id == workspace.workspace_id)
    {
        if existing.local_path != canonical_path {
            return Err("RUNNER_WORKSPACE_ID_COLLISION".into());
        }
    } else {
        records.push(WorkspaceRecord {
            workspace_id: workspace.workspace_id.clone(),
            display_name: workspace.display_name.clone(),
            local_path: canonical_path,
            kind: WorkspaceKind::Workspace,
            project_id: None,
            repository_id: None,
            root_id: None,
            run_id: None,
            attempt_id: None,
            source_workspace_id: None,
            lifecycle: None,
        });
        save_records(config, &records)?;
    }
    let record = records
        .iter()
        .find(|record| record.workspace_id == workspace.workspace_id);
    Ok(RegisteredWorkspace {
        project_id: record.and_then(|record| record.project_id.clone()),
        repository_id: record.and_then(|record| record.repository_id.clone()),
        root_id: record.and_then(|record| record.root_id.clone()),
        kind: record.map(|record| record.kind).unwrap_or_default(),
        ..workspace
    })
}

pub fn bind_identity(
    config: &RunnerConfig,
    workspace_id: &str,
    project_id: Option<&str>,
    repository_id: Option<&str>,
) -> Result<RegisteredWorkspace, String> {
    let _lock = registry_write_lock(config)?;
    fn valid_identity(value: &str) -> bool {
        !value.is_empty()
            && value.len() <= 200
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'/' | b'-')
            })
            && !value.contains("://")
            && !value.contains('@')
            && !value.contains("//")
            && !value.contains("..")
            && value.as_bytes()[0].is_ascii_alphanumeric()
    }
    if project_id.is_some_and(|value| !valid_identity(value))
        || repository_id.is_some_and(|value| !valid_identity(value))
    {
        return Err("RUNNER_WORKSPACE_IDENTITY_INVALID".into());
    }
    let mut records = load_records(config)?;
    if records.iter().any(|candidate| {
        candidate.workspace_id != workspace_id
            && project_id.is_some()
            && candidate.project_id.as_deref() == project_id
    }) {
        return Err("RUNNER_PROJECT_ALREADY_BOUND".into());
    }
    let record = records
        .iter_mut()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or_else(|| "RUNNER_WORKSPACE_NOT_REGISTERED".to_string())?;
    record.project_id = project_id.map(str::to_string);
    record.repository_id = repository_id.map(str::to_string);
    let result = RegisteredWorkspace {
        workspace_id: record.workspace_id.clone(),
        display_name: record.display_name.clone(),
        project_id: record.project_id.clone(),
        repository_id: record.repository_id.clone(),
        root_id: record.root_id.clone(),
        kind: record.kind,
    };
    save_records(config, &records)?;
    Ok(result)
}

pub fn remove(config: &RunnerConfig, workspace_id: &str) -> Result<bool, String> {
    let _lock = registry_write_lock(config)?;
    let mut records = load_records(config)?;
    if records.iter().any(|record| {
        record.workspace_id == workspace_id && record.kind != WorkspaceKind::Workspace
    }) {
        return Err("RUNNER_WORKSPACE_LIFECYCLE_MANAGED".into());
    }
    let original_len = records.len();
    records.retain(|record| record.workspace_id != workspace_id);
    if records.len() == original_len {
        return Ok(false);
    }
    save_records(config, &records)?;
    Ok(true)
}

pub fn resolve(config: &RunnerConfig, workspace_id: &str) -> Result<PathBuf, String> {
    let record = load_records(config)?
        .into_iter()
        .find(|record| {
            record.workspace_id == workspace_id
                && matches!(
                    record.kind,
                    WorkspaceKind::Workspace | WorkspaceKind::Project
                )
        })
        .ok_or_else(|| "RUNNER_TRUSTED_WORKSPACE_NOT_FOUND".to_string())?;
    let current = record
        .local_path
        .canonicalize()
        .map_err(|_| "RUNNER_TRUSTED_WORKSPACE_CHANGED".to_string())?;
    if !current.is_dir() || current != record.local_path {
        return Err("RUNNER_TRUSTED_WORKSPACE_CHANGED".into());
    }
    Ok(current)
}

/// Register a user-selected directory as an authorized Runner Root. Paths are
/// local-only; only the stable root identity and display name are returned.
pub fn register_root(config: &RunnerConfig, path: &Path) -> Result<RegisteredWorkspace, String> {
    require_local_device(config)?;
    let _lock = registry_write_lock(config)?;
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "RUNNER_ROOT_PATH_NOT_FOUND")?;
    if !canonical_path.is_dir() {
        return Err("RUNNER_ROOT_MUST_BE_DIRECTORY".into());
    }
    let name = canonical_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or("RUNNER_ROOT_NAME_INVALID")?
        .to_string();
    let root_id = stable_id("root", &name, &canonical_path);
    let mut records = load_records(config)?;
    if let Some(existing) = records.iter().find(|record| record.workspace_id == root_id) {
        if existing.local_path != canonical_path || existing.kind != WorkspaceKind::Root {
            return Err("RUNNER_ROOT_ID_COLLISION".into());
        }
    } else {
        if records
            .iter()
            .any(|record| record.kind == WorkspaceKind::Root && record.local_path == canonical_path)
        {
            return Err("RUNNER_ROOT_ALREADY_REGISTERED".into());
        }
        records.push(WorkspaceRecord {
            kind: WorkspaceKind::Root,
            workspace_id: root_id.clone(),
            display_name: name.chars().take(80).collect(),
            local_path: canonical_path,
            project_id: None,
            repository_id: None,
            root_id: None,
            run_id: None,
            attempt_id: None,
            source_workspace_id: None,
            lifecycle: Some("AUTHORIZED".into()),
        });
        save_records(config, &records)?;
    }
    Ok(RegisteredWorkspace {
        workspace_id: root_id,
        display_name: name.chars().take(80).collect(),
        project_id: None,
        repository_id: None,
        root_id: None,
        kind: WorkspaceKind::Root,
    })
}

pub fn list_roots(config: &RunnerConfig) -> Result<Vec<RegisteredWorkspace>, String> {
    Ok(load_records(config)?
        .into_iter()
        .filter(|record| record.kind == WorkspaceKind::Root)
        .map(|record| RegisteredWorkspace {
            workspace_id: record.workspace_id,
            display_name: record.display_name,
            project_id: None,
            repository_id: None,
            root_id: None,
            kind: WorkspaceKind::Root,
        })
        .collect())
}

/// Create a new persistent project folder below a registered Root. Existing
/// paths are never adopted or overwritten by this operation.
pub fn create_project(
    config: &RunnerConfig,
    root_id: &str,
    project_id: &str,
    name: &str,
    repository_id: Option<&str>,
) -> Result<RegisteredWorkspace, String> {
    require_local_device(config)?;
    let _lock = registry_write_lock(config)?;
    validate_identity(project_id)?;
    if let Some(repository) = repository_id {
        validate_identity(repository)?;
    }
    validate_project_name(name)?;
    let mut records = load_records(config)?;
    if records
        .iter()
        .any(|record| record.project_id.as_deref() == Some(project_id))
    {
        return Err("RUNNER_PROJECT_ALREADY_BOUND".into());
    }
    let root = resolve_root_record(&records, root_id)?;
    let root_path = root.local_path.clone();
    let target = root_path.join(name);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("RUNNER_PROJECT_PATH_ALREADY_EXISTS".into());
    }
    let workspace_id = stable_id("ws", name, &target);
    records.push(WorkspaceRecord {
        kind: WorkspaceKind::Project,
        workspace_id: workspace_id.clone(),
        display_name: name.chars().take(80).collect(),
        local_path: target.clone(),
        project_id: Some(project_id.into()),
        repository_id: repository_id.map(str::to_owned),
        root_id: Some(root_id.into()),
        run_id: None,
        attempt_id: None,
        source_workspace_id: None,
        lifecycle: Some("PROVISIONING".into()),
    });
    save_records(config, &records)?;
    if fs::create_dir(&target).is_err() {
        records.retain(|record| record.workspace_id != workspace_id);
        save_records(config, &records)?;
        return Err("RUNNER_PROJECT_CREATE_FAILED".into());
    }
    let canonical: PathBuf = match target.canonicalize() {
        Ok(path) if path.starts_with(&root_path) && path.parent() == Some(root_path.as_path()) => {
            path
        }
        _ => {
            set_project_lifecycle(config, &workspace_id, "RECOVERY_REQUIRED")?;
            return Err("RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION".into());
        }
    };
    if has_reparse_component(&root_path, &target)? {
        set_project_lifecycle(config, &workspace_id, "RECOVERY_REQUIRED")?;
        return Err("RUNNER_PROJECT_REPARSE_POINT_DENIED".into());
    }
    let git_init = std::process::Command::new("git")
        .args(["init", "--quiet", "--initial-branch=main"])
        .current_dir(&target)
        .status();
    let git_init = match git_init {
        Ok(status) => status,
        Err(_) => {
            set_project_lifecycle(config, &workspace_id, "RECOVERY_REQUIRED")?;
            return Err("RUNNER_PROJECT_GIT_INIT_FAILED".into());
        }
    };
    if !git_init.success() {
        set_project_lifecycle(config, &workspace_id, "RECOVERY_REQUIRED")?;
        return Err("RUNNER_PROJECT_GIT_INIT_FAILED".into());
    }
    let mut records = load_records(config)?;
    let record = records
        .iter_mut()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or("RUNNER_PROJECT_RECOVERY_RECORD_MISSING")?;
    record.local_path = canonical;
    record.lifecycle = Some("READY".into());
    save_records(config, &records)?;
    Ok(RegisteredWorkspace {
        workspace_id,
        display_name: name.chars().take(80).collect(),
        project_id: Some(project_id.into()),
        repository_id: repository_id.map(str::to_owned),
        root_id: Some(root_id.into()),
        kind: WorkspaceKind::Project,
    })
}

fn set_project_lifecycle(
    config: &RunnerConfig,
    workspace_id: &str,
    lifecycle: &str,
) -> Result<(), String> {
    let mut records = load_records(config)?;
    let record = records
        .iter_mut()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or("RUNNER_PROJECT_RECOVERY_RECORD_MISSING")?;
    record.lifecycle = Some(lifecycle.into());
    save_records(config, &records)
}

/// Import an existing directory only when it is a direct child of an
/// authorized root. The directory contents are preserved byte-for-byte.
pub fn import_project(
    config: &RunnerConfig,
    root_id: &str,
    path: &Path,
    project_id: &str,
    repository_id: Option<&str>,
) -> Result<RegisteredWorkspace, String> {
    require_local_device(config)?;
    let _lock = registry_write_lock(config)?;
    validate_identity(project_id)?;
    if let Some(repository) = repository_id {
        validate_identity(repository)?;
    }
    let mut records = load_records(config)?;
    let root = resolve_root_record(&records, root_id)?;
    let selected_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "RUNNER_PROJECT_PATH_NOT_FOUND")?
            .join(path)
    };
    if selected_path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
        || has_reparse_component(&root.local_path, &selected_path)?
    {
        return Err("RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION".into());
    }
    let canonical = selected_path
        .canonicalize()
        .map_err(|_| "RUNNER_PROJECT_PATH_NOT_FOUND")?;
    if !canonical.is_dir() || canonical.parent() != Some(root.local_path.as_path()) {
        return Err("RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION".into());
    }
    if records.iter().any(|record| {
        if record.kind == WorkspaceKind::Workspace && record.local_path == canonical {
            record
                .project_id
                .as_deref()
                .is_some_and(|existing| existing != project_id)
                || repository_id.is_some_and(|repository| {
                    record
                        .repository_id
                        .as_deref()
                        .is_some_and(|existing| existing != repository)
                })
        } else {
            record.project_id.as_deref() == Some(project_id)
                || (record.kind == WorkspaceKind::Project && record.local_path == canonical)
        }
    }) {
        return Err("RUNNER_PROJECT_ALREADY_BOUND".into());
    }
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("RUNNER_PROJECT_NAME_INVALID")?
        .to_string();
    let legacy = records
        .iter_mut()
        .find(|record| record.kind == WorkspaceKind::Workspace && record.local_path == canonical);
    let workspace_id = if let Some(record) = legacy {
        // Upgrade the legacy row in place so existing references keep resolving.
        record.kind = WorkspaceKind::Project;
        record.display_name = name.chars().take(80).collect();
        record.project_id = Some(project_id.into());
        if let Some(repository_id) = repository_id {
            record.repository_id = Some(repository_id.into());
        }
        record.root_id = Some(root_id.into());
        record.lifecycle = Some("READY".into());
        record.workspace_id.clone()
    } else {
        let workspace_id = stable_id("ws", &name, &canonical);
        records.push(WorkspaceRecord {
            kind: WorkspaceKind::Project,
            workspace_id: workspace_id.clone(),
            display_name: name.chars().take(80).collect(),
            local_path: canonical,
            project_id: Some(project_id.into()),
            repository_id: repository_id.map(str::to_owned),
            root_id: Some(root_id.into()),
            run_id: None,
            attempt_id: None,
            source_workspace_id: None,
            lifecycle: Some("READY".into()),
        });
        workspace_id
    };
    save_records(config, &records)?;
    let record = records
        .iter()
        .find(|record| record.workspace_id == workspace_id)
        .ok_or("RUNNER_PROJECT_RECOVERY_RECORD_MISSING")?;
    Ok(RegisteredWorkspace {
        workspace_id: record.workspace_id.clone(),
        display_name: record.display_name.clone(),
        project_id: record.project_id.clone(),
        repository_id: record.repository_id.clone(),
        root_id: record.root_id.clone(),
        kind: record.kind,
    })
}

/// Register the existing isolated Spec-224 candidate as an identifiable run
/// workspace. The job/attempt and source workspace remain distinct fields.
pub fn register_run_workspace(
    config: &RunnerConfig,
    source_workspace_id: &str,
    job_id: &str,
    attempt_id: u32,
    candidate_path: &Path,
) -> Result<RunWorkspaceFact, String> {
    let _lock = registry_write_lock(config)?;
    validate_identity(job_id)?;
    if attempt_id == 0 {
        return Err("RUNNER_RUN_ATTEMPT_INVALID".into());
    }
    let source_path = resolve(config, source_workspace_id)?;
    let canonical_candidate = candidate_path
        .canonicalize()
        .map_err(|_| "RUNNER_RUN_WORKSPACE_NOT_FOUND")?;
    let canonical_data_root = Path::new(&config.data_root)
        .canonicalize()
        .map_err(|_| "RUNNER_RUN_STORAGE_UNAVAILABLE")?;
    let candidate_root = canonical_data_root.join("spec224-candidates");
    if !canonical_candidate.starts_with(&candidate_root) || canonical_candidate == candidate_root {
        return Err("RUNNER_RUN_WORKSPACE_BOUNDARY_VIOLATION".into());
    }
    let mut records = load_records(config)?;
    let source = records
        .iter()
        .find(|record| record.workspace_id == source_workspace_id)
        .ok_or("RUNNER_TRUSTED_WORKSPACE_NOT_FOUND")?;
    if source.local_path != source_path
        || !matches!(
            source.kind,
            WorkspaceKind::Workspace | WorkspaceKind::Project
        )
    {
        return Err("RUNNER_RUN_SOURCE_BINDING_INVALID".into());
    }
    let mut key = Sha256::new();
    key.update(source_workspace_id.as_bytes());
    key.update([0]);
    key.update(job_id.as_bytes());
    key.update(attempt_id.to_le_bytes());
    let workspace_id = format!("run-{}", &format!("{:x}", key.finalize())[..32]);
    if let Some(existing) = records
        .iter()
        .find(|record| record.workspace_id == workspace_id)
    {
        if existing.kind != WorkspaceKind::Run
            || existing.local_path != canonical_candidate
            || existing.run_id.as_deref() != Some(job_id)
            || existing.attempt_id != Some(attempt_id)
            || existing.source_workspace_id.as_deref() != Some(source_workspace_id)
        {
            return Err("RUNNER_RUN_WORKSPACE_IDENTITY_CONFLICT".into());
        }
        return Ok(run_fact(existing));
    }
    let record = WorkspaceRecord {
        kind: WorkspaceKind::Run,
        workspace_id,
        display_name: format!("{} attempt {}", source.display_name, attempt_id),
        local_path: canonical_candidate,
        project_id: source.project_id.clone(),
        repository_id: source.repository_id.clone(),
        root_id: source.root_id.clone(),
        run_id: Some(job_id.into()),
        attempt_id: Some(attempt_id),
        source_workspace_id: Some(source_workspace_id.into()),
        lifecycle: Some("ACTIVE".into()),
    };
    let result = run_fact(&record);
    records.push(record);
    save_records(config, &records)?;
    Ok(result)
}

pub fn list_run_workspaces(config: &RunnerConfig) -> Result<Vec<RunWorkspaceFact>, String> {
    let records = load_records(config)?;
    Ok(records
        .iter()
        .rev()
        .filter(|record| record.kind == WorkspaceKind::Run)
        .take(64)
        .map(run_fact)
        .collect())
}

pub fn update_run_workspace_lifecycle(
    config: &RunnerConfig,
    workspace_id: &str,
    lifecycle: &str,
) -> Result<(), String> {
    let lifecycle = match lifecycle {
        "ACTIVE" | "RECOVERY_REQUIRED" | "COMPLETED" | "CANCELLED" | "FAILED" => lifecycle,
        _ => return Err("RUNNER_RUN_LIFECYCLE_INVALID".into()),
    };
    let _lock = registry_write_lock(config)?;
    let mut records = load_records(config)?;
    let record = records
        .iter_mut()
        .find(|record| record.workspace_id == workspace_id && record.kind == WorkspaceKind::Run)
        .ok_or("RUNNER_RUN_WORKSPACE_NOT_FOUND")?;
    record.lifecycle = Some(lifecycle.into());
    save_records(config, &records)
}

fn run_fact(record: &WorkspaceRecord) -> RunWorkspaceFact {
    RunWorkspaceFact {
        workspace_id: record.workspace_id.clone(),
        run_id: record.run_id.clone().unwrap_or_default(),
        attempt_id: record.attempt_id.unwrap_or_default(),
        source_workspace_id: record.source_workspace_id.clone().unwrap_or_default(),
        project_id: record.project_id.clone(),
        lifecycle: record.lifecycle.clone().unwrap_or_else(|| "UNKNOWN".into()),
    }
}

/// Reconcile interrupted project provisioning without deleting or overwriting
/// project data. Existing populated folders without a Git repository stay
/// recovery-required for explicit user inspection.
pub fn recover_project_provisioning(
    config: &RunnerConfig,
) -> Result<Vec<RegisteredWorkspace>, String> {
    let _lock = registry_write_lock(config)?;
    let mut records = load_records(config)?;
    let pending: Vec<String> = records
        .iter()
        .filter(|record| {
            record.kind == WorkspaceKind::Project
                && matches!(
                    record.lifecycle.as_deref(),
                    Some("PROVISIONING" | "RECOVERY_REQUIRED")
                )
        })
        .map(|record| record.workspace_id.clone())
        .collect();
    for workspace_id in pending {
        let Some(index) = records
            .iter()
            .position(|record| record.workspace_id == workspace_id)
        else {
            continue;
        };
        let root_id = records[index]
            .root_id
            .clone()
            .ok_or("RUNNER_ROOT_NOT_AUTHORIZED")?;
        let root = resolve_root_record(&records, &root_id)?.local_path.clone();
        let path = records[index].local_path.clone();
        if !path.exists() {
            records.remove(index);
            save_records(config, &records)?;
            continue;
        }
        let canonical = match path.canonicalize() {
            Ok(value) if value.starts_with(&root) && value.parent() == Some(root.as_path()) => {
                value
            }
            _ => {
                records[index].lifecycle = Some("RECOVERY_REQUIRED".into());
                continue;
            }
        };
        if has_reparse_component(&root, &path)? {
            records[index].lifecycle = Some("RECOVERY_REQUIRED".into());
            continue;
        }
        let git_top = std::process::Command::new("git")
            .args(["rev-parse", "--show-toplevel"])
            .current_dir(&canonical)
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| PathBuf::from(value.trim()).canonicalize().ok() == Some(canonical.clone()))
            .unwrap_or(false);
        if git_top {
            records[index].local_path = canonical;
            records[index].lifecycle = Some("READY".into());
        } else {
            let mut entries =
                fs::read_dir(&canonical).map_err(|_| "RUNNER_PROJECT_RECOVERY_SCAN_FAILED")?;
            if entries.next().is_none() {
                let status = std::process::Command::new("git")
                    .args(["init", "--quiet", "--initial-branch=main"])
                    .current_dir(&canonical)
                    .status();
                if status.is_ok_and(|value| value.success()) {
                    records[index].local_path = canonical;
                    records[index].lifecycle = Some("READY".into());
                } else {
                    records[index].lifecycle = Some("RECOVERY_REQUIRED".into());
                }
            } else {
                records[index].lifecycle = Some("RECOVERY_REQUIRED".into());
            }
        }
    }
    save_records(config, &records)?;
    Ok(records
        .iter()
        .filter(|record| record.kind == WorkspaceKind::Project)
        .map(|record| RegisteredWorkspace {
            workspace_id: record.workspace_id.clone(),
            display_name: record.display_name.clone(),
            project_id: record.project_id.clone(),
            repository_id: record.repository_id.clone(),
            root_id: record.root_id.clone(),
            kind: record.kind,
        })
        .collect())
}

fn stable_id(prefix: &str, name: &str, path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_os_str().to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let slug = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("{}-{}-{}", prefix, slug.trim_matches('-'), &digest[..12])
}

fn validate_identity(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 200
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'/' | b'-')
        })
        || value.contains("://")
        || value.contains('@')
        || value.contains("//")
        || value.contains("..")
        || !value.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err("RUNNER_WORKSPACE_IDENTITY_INVALID".into());
    }
    Ok(())
}

fn validate_project_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 80
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
    {
        return Err("RUNNER_PROJECT_NAME_INVALID".into());
    }
    Ok(())
}

fn resolve_root_record<'a>(
    records: &'a [WorkspaceRecord],
    root_id: &str,
) -> Result<&'a WorkspaceRecord, String> {
    let root = records
        .iter()
        .find(|record| record.workspace_id == root_id && record.kind == WorkspaceKind::Root)
        .ok_or("RUNNER_ROOT_NOT_AUTHORIZED")?;
    let current = root
        .local_path
        .canonicalize()
        .map_err(|_| "RUNNER_ROOT_CHANGED")?;
    if current != root.local_path || !current.is_dir() {
        return Err("RUNNER_ROOT_CHANGED".into());
    }
    Ok(root)
}

fn require_local_device(config: &RunnerConfig) -> Result<(), String> {
    if config.profile != crate::config::RunnerProfile::LocalDevice
        || config.device_id.as_deref().is_none_or(str::is_empty)
    {
        return Err("RUNNER_LOCAL_DEVICE_AUTHORITY_REQUIRED".into());
    }
    Ok(())
}

fn has_reparse_component(root: &Path, target: &Path) -> Result<bool, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "RUNNER_ROOT_PATH_NOT_FOUND")?;
    let mut current = target.to_path_buf();
    loop {
        let metadata =
            fs::symlink_metadata(&current).map_err(|_| "RUNNER_PROJECT_PATH_NOT_FOUND")?;
        if metadata.file_type().is_symlink() {
            return Ok(true);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Ok(true);
            }
        }
        if current
            .canonicalize()
            .map_err(|_| "RUNNER_PROJECT_PATH_NOT_FOUND")?
            == canonical_root
        {
            return Ok(false);
        }
        current = current
            .parent()
            .ok_or("RUNNER_PROJECT_PATH_BOUNDARY_VIOLATION")?
            .to_path_buf();
    }
}

fn load_records(config: &RunnerConfig) -> Result<Vec<WorkspaceRecord>, String> {
    let path = registry_file(config);
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("RUNNER_WORKSPACE_REGISTRY_READ_FAILED".into()),
    };
    let value: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_INVALID".to_string())?;
    let records: Vec<WorkspaceRecord> = if value.is_array() {
        serde_json::from_value(value)
            .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_INVALID".to_string())?
    } else {
        let state: WorkspaceRegistryFile = serde_json::from_value(value)
            .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_INVALID".to_string())?;
        if state.schema_version != 2 {
            return Err("RUNNER_WORKSPACE_REGISTRY_VERSION_UNSUPPORTED".into());
        }
        if (!state.runner_id.is_empty() && state.runner_id != config.runner_id)
            || (state.device_id.is_some() && state.device_id != config.device_id)
        {
            return Err("RUNNER_WORKSPACE_REGISTRY_SCOPE_MISMATCH".into());
        }
        state.records
    };
    if records.len() > 1024 {
        return Err("RUNNER_WORKSPACE_REGISTRY_LIMIT_EXCEEDED".into());
    }
    let mut ids = HashSet::new();
    for record in &records {
        if record.workspace_id.trim().is_empty()
            || record.display_name.trim().is_empty()
            || !record.local_path.is_absolute()
            || !ids.insert(record.workspace_id.as_str())
        {
            return Err("RUNNER_WORKSPACE_REGISTRY_INVALID".into());
        }
    }
    Ok(records)
}

fn save_records(config: &RunnerConfig, records: &[WorkspaceRecord]) -> Result<(), String> {
    let path = registry_file(config);
    let parent = path
        .parent()
        .ok_or_else(|| "RUNNER_WORKSPACE_REGISTRY_PATH_INVALID".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED".to_string())?;
    set_private_directory_permissions(parent)?;
    let temporary = parent.join(format!(".workspace_registry.{}.tmp", std::process::id()));
    let file = WorkspaceRegistryFile {
        schema_version: 2,
        runner_id: config.runner_id.clone(),
        device_id: config.device_id.clone(),
        records: records.to_vec(),
    };
    let bytes = serde_json::to_vec(&file)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_SERIALIZE_FAILED".to_string())?;
    fs::write(&temporary, bytes)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED".to_string())?;
    set_private_file_permissions(&temporary)?;
    fs::rename(&temporary, &path)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_COMMIT_FAILED".to_string())?;
    Ok(())
}

fn registry_write_lock(config: &RunnerConfig) -> Result<fs::File, String> {
    let path = registry_file(config);
    let parent = path
        .parent()
        .ok_or("RUNNER_WORKSPACE_REGISTRY_PATH_INVALID")?;
    fs::create_dir_all(parent).map_err(|_| "RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED")?;
    set_private_directory_permissions(parent)?;
    let lock_path = parent.join("workspace_registry.lock");
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_LOCK_FAILED")?;
    fs2::FileExt::lock_exclusive(&file).map_err(|_| "RUNNER_WORKSPACE_REGISTRY_LOCK_FAILED")?;
    Ok(file)
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_PERMISSIONS_FAILED".to_string())
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "RUNNER_WORKSPACE_REGISTRY_PERMISSIONS_FAILED".to_string())
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}
