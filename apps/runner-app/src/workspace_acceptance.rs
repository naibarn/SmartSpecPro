//! Bounded, local acceptance of the Windows workspace registry using an
//! isolated temporary root. The workflow never opens the installed registry.
use crate::{config::RunnerConfig, workspace_registry};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

struct Scratch(PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn executable_digest() -> Option<String> {
    use std::io::Read;
    let path = std::env::current_exe().ok()?;
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

fn outcome(name: &str, result: Result<(), String>) -> Value {
    match result {
        Ok(()) => json!({"case": name, "status": "PASS"}),
        Err(code) => json!({"case": name, "status": "FAIL", "reasonCode": code}),
    }
}

/// Execute only on a caller-authorized local Runner. All created content lives
/// under a unique temporary directory and is removed on normal return/panic.
pub fn run(config: &RunnerConfig, app_version: &str, publication: Value) -> Result<Value, String> {
    if config.profile != crate::config::RunnerProfile::LocalDevice {
        return Err("WORKSPACE_ACCEPTANCE_LOCAL_RUNNER_REQUIRED".into());
    }
    let mut nonce = [0_u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| "WORKSPACE_ACCEPTANCE_TEMP_ID_FAILED")?;
    let suffix = nonce.iter().map(|b| format!("{b:02x}")).collect::<String>();
    let base = std::env::temp_dir().join(format!("smartaihub-workspace-acceptance-{suffix}"));
    fs::create_dir(&base).map_err(|_| "WORKSPACE_ACCEPTANCE_TEMP_CREATE_FAILED")?;
    let _scratch = Scratch(base.clone());
    let root_path = base.join("authorized-root");
    let data_path = base.join("runner-data");
    fs::create_dir(&root_path).map_err(|_| "WORKSPACE_ACCEPTANCE_TEMP_CREATE_FAILED")?;
    let mut isolated = config.clone();
    isolated.data_root = data_path.to_string_lossy().into_owned();
    fs::create_dir(&data_path).map_err(|_| "WORKSPACE_ACCEPTANCE_TEMP_CREATE_FAILED")?;

    let mut cases = Vec::new();
    let root = workspace_registry::register_root(&isolated, &root_path)
        .map_err(|_| "WORKSPACE_ACCEPTANCE_ROOT_REGISTER_FAILED")?;
    cases.push(outcome("authorized_root_registration", Ok(())));
    let project_a = workspace_registry::create_project(
        &isolated,
        &root.workspace_id,
        "acceptance-project-a",
        "Project-A",
        None,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_PROJECT_A_FAILED")?;
    let project_b = workspace_registry::create_project(
        &isolated,
        &root.workspace_id,
        "acceptance-project-b",
        "Project-B",
        None,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_PROJECT_B_FAILED")?;
    cases.push(outcome(
        "project_a_b_same_root",
        if project_a.root_id == project_b.root_id {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_ROOT_MISMATCH".into())
        },
    ));

    let reopened = workspace_registry::list(&isolated)?;
    let stable = reopened
        .iter()
        .any(|p| p.workspace_id == project_a.workspace_id)
        && workspace_registry::list_roots(&isolated)?
            .iter()
            .any(|r| r.workspace_id == root.workspace_id);
    cases.push(outcome(
        "stable_ids_after_registry_reopen",
        if stable {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_ID_CHANGED".into())
        },
    ));

    let import_path = root_path.join("Existing-Project");
    fs::create_dir(&import_path).map_err(|_| "WORKSPACE_ACCEPTANCE_IMPORT_FIXTURE_FAILED")?;
    fs::write(import_path.join("preserve.txt"), b"preserve")
        .map_err(|_| "WORKSPACE_ACCEPTANCE_IMPORT_FIXTURE_FAILED")?;
    let imported = workspace_registry::import_project(
        &isolated,
        &root.workspace_id,
        &import_path,
        "acceptance-import",
        None,
    );
    cases.push(outcome(
        "existing_directory_import",
        imported.as_ref().map(|_| ()).map_err(Clone::clone),
    ));
    cases.push(outcome(
        "import_preserves_existing_file",
        if fs::read(import_path.join("preserve.txt")).ok().as_deref() == Some(b"preserve") {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_IMPORT_CONTENT_CHANGED".into())
        },
    ));

    let traversal_path = root_path.join("../authorized-root/Project-A");
    let traversal = workspace_registry::import_project(
        &isolated,
        &root.workspace_id,
        &traversal_path,
        "acceptance-traversal",
        None,
    );
    cases.push(outcome(
        "path_traversal_rejected",
        if traversal.is_err() {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_TRAVERSAL_ACCEPTED".into())
        },
    ));

    let candidate_parent = data_path.join("spec224-candidates");
    let candidate = candidate_parent.join("acceptance-run");
    fs::create_dir_all(&candidate).map_err(|_| "WORKSPACE_ACCEPTANCE_RUN_FIXTURE_FAILED")?;
    let run = workspace_registry::register_run_workspace(
        &isolated,
        &project_a.workspace_id,
        "acceptance-job",
        1,
        &candidate,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_RUN_ALLOCATION_FAILED")?;
    let run_ok = run.workspace_id.starts_with("run-")
        && run.source_workspace_id == project_a.workspace_id
        && run.workspace_id != project_b.workspace_id;
    cases.push(outcome(
        "run_workspace_project_isolation",
        if run_ok {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_RUN_BINDING_INVALID".into())
        },
    ));
    let facts = workspace_registry::snapshot_facts(&isolated)?;
    let run_facts = workspace_registry::list_run_workspaces(&isolated)?;
    let serialized = serde_json::to_string(&facts)
        .map_err(|_| "WORKSPACE_ACCEPTANCE_REPORT_SERIALIZE_FAILED")?;
    let no_path = !serialized.contains(&base.to_string_lossy().to_string());
    cases.push(outcome(
        "sanitized_workspace_projection",
        if no_path {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_PATH_DISCLOSURE".into())
        },
    ));

    // Exercise the production SPEC-224 CAS implementation against scratch
    // Project A only; these candidates are never attached to a live job.
    let source = workspace_registry::resolve(&isolated, &project_a.workspace_id)?;
    fs::write(source.join("acceptance.txt"), b"baseline")
        .map_err(|_| "WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    let baseline = workspace_registry::fingerprint_workspace(&source)
        .ok_or("WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    let first = crate::spec224_candidate::Candidate::create(
        &source,
        &data_path,
        "acceptance-cas-first",
        &baseline,
        vec!["acceptance.txt".into()],
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    let second = crate::spec224_candidate::Candidate::create(
        &source,
        &data_path,
        "acceptance-cas-second",
        &baseline,
        vec!["acceptance.txt".into()],
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    fs::write(first.root.join("acceptance.txt"), b"first")
        .map_err(|_| "WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    fs::write(second.root.join("acceptance.txt"), b"second")
        .map_err(|_| "WORKSPACE_ACCEPTANCE_CAS_FIXTURE_FAILED")?;
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let first_barrier = barrier.clone();
    let first_apply = std::thread::spawn(move || {
        first_barrier.wait();
        first.apply()
    });
    let second_barrier = barrier.clone();
    let second_apply = std::thread::spawn(move || {
        second_barrier.wait();
        second.apply()
    });
    barrier.wait();
    let results = [first_apply.join().ok(), second_apply.join().ok()];
    let cas = results
        .iter()
        .filter(|result| result.as_ref().is_some_and(|value| value.is_ok()))
        .count()
        == 1
        && results
            .iter()
            .filter(|result| matches!(result, Some(Err(code)) if code == "SPEC224_CAS_CONFLICT"))
            .count()
            == 1;
    cases.push(outcome(
        "conflicting_run_write_cas",
        if cas {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_CAS_NOT_REJECTED".into())
        },
    ));

    // Simulate a crash after directory creation by removing only scratch
    // project metadata and marking its isolated registry record for recovery.
    let recovery_path = workspace_registry::resolve(&isolated, &project_b.workspace_id)?;
    fs::remove_dir_all(recovery_path.join(".git"))
        .map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?;
    fs::write(recovery_path.join("partial.txt"), b"preserve")
        .map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?;
    let registry_path = workspace_registry::registry_file(&isolated);
    let mut registry: Value = serde_json::from_slice(
        &fs::read(&registry_path).map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?;
    if let Some(record) = registry["records"].as_array_mut().and_then(|rows| {
        rows.iter_mut()
            .find(|row| row["workspace_id"] == project_b.workspace_id)
    }) {
        record["lifecycle"] = json!("RECOVERY_REQUIRED");
    }
    fs::write(
        &registry_path,
        serde_json::to_vec(&registry)
            .map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_RECOVERY_FIXTURE_FAILED")?;
    let recovery = workspace_registry::recover_project_provisioning(&isolated)?;
    let preserved =
        fs::read(recovery_path.join("partial.txt")).ok().as_deref() == Some(b"preserve");
    cases.push(outcome(
        "interrupted_provisioning_recovery",
        if recovery
            .iter()
            .any(|p| p.workspace_id == project_b.workspace_id)
            && preserved
        {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_RECOVERY_FAILED".into())
        },
    ));

    let legacy_data = base.join("legacy-runner-data");
    fs::create_dir(&legacy_data).map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?;
    let legacy_project = base.join("legacy-project");
    fs::create_dir(&legacy_project).map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?;
    let mut legacy_config = isolated.clone();
    legacy_config.data_root = legacy_data.to_string_lossy().into_owned();
    let legacy_file = workspace_registry::registry_file(&legacy_config);
    fs::write(&legacy_file, serde_json::to_vec(&json!([{"workspace_id":"acceptance-legacy-id","display_name":"Legacy","local_path":legacy_project.canonicalize().map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?}])).map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?)
        .map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?;
    let legacy_readable = workspace_registry::list(&legacy_config)?
        .iter()
        .any(|p| p.workspace_id == "acceptance-legacy-id");
    let migration_root = base.join("legacy-migration-root");
    fs::create_dir(&migration_root).map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?;
    workspace_registry::register_root(&legacy_config, &migration_root)?;
    let migrated: Value = serde_json::from_slice(
        &fs::read(&legacy_file).map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?,
    )
    .map_err(|_| "WORKSPACE_ACCEPTANCE_LEGACY_FIXTURE_FAILED")?;
    let legacy_ok = legacy_readable
        && migrated["records"].as_array().is_some_and(|records| {
            records
                .iter()
                .any(|r| r["workspace_id"] == "acceptance-legacy-id")
        });
    cases.push(outcome(
        "legacy_registry_compatibility_and_migration",
        if legacy_ok {
            Ok(())
        } else {
            Err("WORKSPACE_ACCEPTANCE_LEGACY_MIGRATION_FAILED".into())
        },
    ));

    #[cfg(windows)]
    let junction_result = {
        let target = root_path.join("Project-A");
        let alias = root_path.join("Junction-Alias");
        let literal =
            |p: &std::path::Path| format!("'{}'", p.to_string_lossy().replace('\'', "''"));
        let command = format!(
            "New-Item -ItemType Junction -Path {} -Target {} | Out-Null",
            literal(&alias),
            literal(&target)
        );
        match std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &command])
            .status()
        {
            Ok(status) if status.success() => {
                let result = workspace_registry::import_project(
                    &isolated,
                    &root.workspace_id,
                    &alias,
                    "acceptance-junction",
                    None,
                );
                outcome(
                    "junction_reparse_escape",
                    if result.is_err() {
                        Ok(())
                    } else {
                        Err("WORKSPACE_ACCEPTANCE_JUNCTION_ACCEPTED".into())
                    },
                )
            }
            _ => {
                json!({"case":"junction_reparse_escape","status":"NOT_TESTED","reasonCode":"JUNCTION_CREATION_UNAVAILABLE"})
            }
        }
    };
    #[cfg(not(windows))]
    let junction_result = json!({"case":"junction_reparse_escape","status":"NOT_TESTED","reasonCode":"WINDOWS_DEVICE_REQUIRED"});

    cases.extend([
        junction_result,
        json!({"case":"live_task_control_projection","status":"NOT_TESTED","reasonCode":"ISOLATED_SCRATCH_REGISTRY"}),
        json!({"case":"server_capability_policy_decision","status":"NOT_TESTED","reasonCode":"SERVER_AUTHORIZATION_NOT_REQUESTED"}),
    ]);

    let executable_hash = executable_digest();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(json!({
        "schemaVersion": 1,
        "acceptanceStatus": if cases.iter().any(|v| v["status"] == "FAIL") { "FAIL" } else { "PARTIAL" },
        "generatedAtEpochMs": now,
        "deviceReference": digest(config.device_id.as_deref().unwrap_or("unpaired").as_bytes()),
        "runnerReference": digest(config.runner_id.as_bytes()),
        "runnerVersion": crate::RUNNER_VERSION,
        "sourceSha": crate::RUNNER_SOURCE_SHA,
        "sourceShaStatus": if crate::RUNNER_SOURCE_SHA.is_some() { "embedded" } else { "not_embedded_in_this_build" },
        "desktopVersion": app_version,
        "desktopExecutableSha256": executable_hash,
        "environment": {"os": std::env::consts::OS, "architecture": std::env::consts::ARCH},
        "temporaryRootReference": digest(base.to_string_lossy().as_bytes()),
        "localCapabilityPublication": publication,
        "serverCapabilityPolicy": {"status":"NOT_TESTED","reasonCode":"SERVER_AUTHORIZATION_NOT_REQUESTED"},
        "workspaceReceipts": {
            "root": {"workspaceId": root.workspace_id, "kind":"root"},
            "projects": [
                {"workspaceId": project_a.workspace_id, "projectId": project_a.project_id, "lifecycle":"READY"},
                {"workspaceId": project_b.workspace_id, "projectId": project_b.project_id, "lifecycle":"RECOVERY_REQUIRED_AFTER_RECOVERY_TEST"},
                {"workspaceId": imported.ok().map(|p| p.workspace_id), "lifecycle":"IMPORTED"}
            ],
            "run": run_facts.iter().find(|fact| fact.workspace_id == run.workspace_id)
        },
        "cases": cases,
        "notice": "Scratch data is isolated from registered projects; the temporary test root is removed after the report is generated."
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runs_bounded_isolated_workspace_smoke_and_marks_unavailable_device_cases() {
        let data = tempfile::tempdir().unwrap();
        let config = RunnerConfig {
            data_root: data
                .path()
                .join("production-data-not-used")
                .to_string_lossy()
                .into_owned(),
            ..RunnerConfig::local("fixture-runner", "fixture-device", "https://example.test")
        };
        let report = run(&config, "test-desktop", json!({"state":"unknown"})).unwrap();
        assert_eq!(report["acceptanceStatus"], "PARTIAL");
        let cases = report["cases"].as_array().unwrap();
        for name in [
            "authorized_root_registration",
            "project_a_b_same_root",
            "stable_ids_after_registry_reopen",
            "existing_directory_import",
            "path_traversal_rejected",
            "run_workspace_project_isolation",
            "sanitized_workspace_projection",
        ] {
            assert!(
                cases
                    .iter()
                    .any(|case| case["case"] == name && case["status"] == "PASS"),
                "missing passing case: {name}"
            );
        }
        assert!(cases.iter().any(
            |case| case["case"] == "junction_reparse_escape" && case["status"] == "NOT_TESTED"
        ));
        let encoded = report.to_string();
        assert!(!encoded.contains(&data.path().to_string_lossy().to_string()));
        assert!(!encoded.contains("example.test"));
    }
}
