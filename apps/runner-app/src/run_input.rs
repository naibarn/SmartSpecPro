use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path};

use crate::config::RunnerConfig;
use crate::protocol::RunnerJobCommand;

const MAX_FILES: usize = 64;
const MAX_FILE_BYTES: usize = 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputFileWire {
    path: String,
    digest: String,
    bytes: usize,
    content_base64: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputBundleWire {
    input_ref: String,
    worker_job_id: String,
    command_id: String,
    attempt_id: String,
    attempt: u32,
    lease_id: String,
    fencing_token: u64,
    tenant_id: String,
    runner_id: String,
    runner_session_id: String,
    authorization_grant_ref: String,
    workspace_ref: String,
    input_digest: String,
    total_bytes: usize,
    files: Vec<InputFileWire>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaterializedRunnerInput {
    pub input_ref: String,
    pub input_digest: String,
    pub total_bytes: usize,
    pub file_count: usize,
    pub manifest_relative_path: String,
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn safe_relative_file(path: &str) -> bool {
    let candidate = Path::new(path);
    !path.is_empty()
        && path.len() <= 240
        && !candidate.is_absolute()
        && !path.contains('\\')
        && matches!(
            candidate
                .extension()
                .and_then(|extension| extension.to_str()),
            Some("md") | Some("MD") | Some("json") | Some("JSON")
        )
        && candidate
            .components()
            .all(|component| matches!(component, Component::Normal(part) if !part.is_empty()))
}

fn input_digest(files: &[(String, Vec<u8>)]) -> String {
    let mut sorted = files.to_vec();
    sorted.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = Sha256::new();
    for (path, bytes) in sorted {
        hasher.update(path.as_bytes());
        hasher.update([0]);
        hasher.update(bytes);
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn validate_bundle(
    command: &RunnerJobCommand,
    bundle: &InputBundleWire,
) -> Result<Vec<(String, Vec<u8>, String)>, String> {
    if bundle.input_ref != command.input_ref
        || bundle.worker_job_id != command.job_id
        || bundle.command_id != command.command_id
        || bundle.attempt != command.attempt
        || bundle.lease_id != command.lease_id
        || bundle.fencing_token != command.fencing_token
        || bundle.tenant_id != command.tenant_id
        || bundle.runner_id != command.runner_id
        || bundle.runner_session_id != command.runner_session_id
        || bundle.authorization_grant_ref != command.authorization_grant_ref
        || bundle.workspace_ref != command.workspace_ref.clone().unwrap_or_default()
        || bundle.attempt_id.trim().is_empty()
    {
        return Err("RUNNER_INPUT_BINDING_MISMATCH".into());
    }
    if bundle.files.is_empty()
        || bundle.files.len() > MAX_FILES
        || bundle.total_bytes == 0
        || bundle.total_bytes > MAX_TOTAL_BYTES
        || !is_sha256(&bundle.input_digest)
    {
        return Err("RUNNER_INPUT_MANIFEST_INVALID".into());
    }
    let mut seen = HashSet::new();
    let mut total = 0usize;
    let mut decoded = Vec::with_capacity(bundle.files.len());
    for file in &bundle.files {
        if !safe_relative_file(&file.path)
            || !seen.insert(file.path.clone())
            || !is_sha256(&file.digest)
        {
            return Err("RUNNER_INPUT_FILE_INVALID".into());
        }
        let bytes = STANDARD
            .decode(&file.content_base64)
            .map_err(|_| "RUNNER_INPUT_FILE_BASE64_INVALID")?;
        if bytes.is_empty() || bytes.len() > MAX_FILE_BYTES || bytes.len() != file.bytes {
            return Err("RUNNER_INPUT_FILE_SIZE_INVALID".into());
        }
        total = total
            .checked_add(bytes.len())
            .ok_or("RUNNER_INPUT_TOTAL_SIZE_INVALID")?;
        if total > MAX_TOTAL_BYTES || format!("{:x}", Sha256::digest(&bytes)) != file.digest {
            return Err("RUNNER_INPUT_FILE_DIGEST_INVALID".into());
        }
        decoded.push((file.path.clone(), bytes, file.digest.clone()));
    }
    if total != bundle.total_bytes
        || input_digest(
            &decoded
                .iter()
                .map(|(path, bytes, _)| (path.clone(), bytes.clone()))
                .collect::<Vec<_>>(),
        ) != bundle.input_digest
    {
        return Err("RUNNER_INPUT_DIGEST_MISMATCH".into());
    }
    Ok(decoded)
}

fn opaque_directory_name(input_ref: &str) -> String {
    format!("{:x}", Sha256::digest(input_ref.as_bytes()))
}

pub fn manifest_relative_path(input_ref: &str) -> String {
    format!(
        ".smartaihub/spec224-inputs/{}/manifest.json",
        opaque_directory_name(input_ref)
    )
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata =
            fs::symlink_metadata(path).map_err(|_| "RUNNER_INPUT_DIRECTORY_STAT_FAILED")?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("RUNNER_INPUT_DIRECTORY_UNSAFE".into());
        }
        return Ok(());
    }
    fs::create_dir(path).map_err(|_| "RUNNER_INPUT_DIRECTORY_CREATE_FAILED".to_string())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "RUNNER_INPUT_FILE_WRITE_FAILED")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "RUNNER_INPUT_FILE_WRITE_FAILED".to_string())
}

fn materialize_bundle(
    workspace: &Path,
    bundle: &InputBundleWire,
    files: &[(String, Vec<u8>, String)],
) -> Result<MaterializedRunnerInput, String> {
    let smartaihub = workspace.join(".smartaihub");
    ensure_directory(&smartaihub)?;
    let root = smartaihub.join("spec224-inputs");
    ensure_directory(&root)?;
    let final_directory = root.join(opaque_directory_name(&bundle.input_ref));
    let relative_manifest = manifest_relative_path(&bundle.input_ref);
    if final_directory.exists() {
        let metadata = fs::symlink_metadata(&final_directory)
            .map_err(|_| "RUNNER_INPUT_EXISTING_MANIFEST_INVALID")?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("RUNNER_INPUT_DIRECTORY_UNSAFE".into());
        }
        let manifest = fs::read(final_directory.join("manifest.json"))
            .map_err(|_| "RUNNER_INPUT_EXISTING_MANIFEST_INVALID")?;
        let parsed: serde_json::Value = serde_json::from_slice(&manifest)
            .map_err(|_| "RUNNER_INPUT_EXISTING_MANIFEST_INVALID")?;
        if parsed
            .get("inputDigest")
            .and_then(serde_json::Value::as_str)
            != Some(bundle.input_digest.as_str())
        {
            return Err("RUNNER_INPUT_EXISTING_MISMATCH".into());
        }
        return Ok(MaterializedRunnerInput {
            input_ref: bundle.input_ref.clone(),
            input_digest: bundle.input_digest.clone(),
            total_bytes: bundle.total_bytes,
            file_count: bundle.files.len(),
            manifest_relative_path: relative_manifest,
        });
    }
    let temp = root.join(format!(
        ".input-{}-{}",
        opaque_directory_name(&bundle.input_ref),
        std::process::id()
    ));
    if temp.exists() {
        return Err("RUNNER_INPUT_TEMP_EXISTS".into());
    }
    ensure_directory(&temp)?;
    let files_root = temp.join("files");
    ensure_directory(&files_root)?;
    let result: Result<(), String> = (|| {
        for (path, bytes, _) in files {
            let mut parent = files_root.clone();
            for component in Path::new(path).components() {
                let Component::Normal(part) = component else {
                    return Err("RUNNER_INPUT_FILE_INVALID".into());
                };
                parent.push(part);
                if parent.ends_with(Path::new(path)) {
                    break;
                }
                if !parent.exists() {
                    ensure_directory(&parent)?;
                }
            }
            let destination = files_root.join(path);
            if let Some(parent) = destination.parent() {
                ensure_directory(parent)?;
            }
            write_new_file(&destination, bytes)?;
        }
        let manifest = json!({
            "schemaVersion": "spec224-runner-input-v1",
            "inputRef": bundle.input_ref,
            "inputDigest": bundle.input_digest,
            "totalBytes": bundle.total_bytes,
            "files": files.iter().map(|(path, bytes, digest)| json!({
                "path": path,
                "localPath": format!("files/{path}"),
                "digest": digest,
                "bytes": bytes.len(),
            })).collect::<Vec<_>>(),
        });
        let encoded =
            serde_json::to_vec(&manifest).map_err(|_| "RUNNER_INPUT_MANIFEST_SERIALIZE_FAILED")?;
        write_new_file(&temp.join("manifest.json"), &encoded)?;
        fs::rename(&temp, &final_directory).map_err(|_| "RUNNER_INPUT_COMMIT_FAILED")?;
        Ok(())
    })();
    if result.is_err() && temp.exists() {
        let _ = fs::remove_dir_all(&temp);
    }
    result?;
    Ok(MaterializedRunnerInput {
        input_ref: bundle.input_ref.clone(),
        input_digest: bundle.input_digest.clone(),
        total_bytes: bundle.total_bytes,
        file_count: bundle.files.len(),
        manifest_relative_path: relative_manifest,
    })
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

pub fn materialize_command_input(
    config: &RunnerConfig,
    command: &RunnerJobCommand,
    input_fetch_grant: &str,
) -> Result<MaterializedRunnerInput, String> {
    materialize_command_input_into(config, command, input_fetch_grant, None)
}

pub fn materialize_command_input_into(
    config: &RunnerConfig,
    command: &RunnerJobCommand,
    input_fetch_grant: &str,
    target_root: Option<&Path>,
) -> Result<MaterializedRunnerInput, String> {
    if input_fetch_grant.len() < 40
        || input_fetch_grant.len() > 96
        || !input_fetch_grant
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("RUNNER_INPUT_FETCH_GRANT_UNAVAILABLE".into());
    }
    let workspace_ref = command
        .workspace_ref
        .as_deref()
        .ok_or("RUNNER_WORKSPACE_REFERENCE_REQUIRED")?;
    let original_workspace = crate::external_agent::workspace_path(config, workspace_ref)?;
    let workspace = target_root
        .map(Path::to_path_buf)
        .unwrap_or(original_workspace);
    let endpoint = format!(
        "{}/api/runners/{}/spec224-inputs/{}",
        command.control_plane_origin.trim_end_matches('/'),
        percent_encode(&command.runner_id),
        percent_encode(&command.input_ref)
    );
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .new_agent();
    let response = agent
        .get(&endpoint)
        .header("X-Spec224-Input-Grant", input_fetch_grant)
        .header("X-Spec224-Runner-Session-Id", &command.runner_session_id)
        .header(
            "X-Spec224-Authorization-Grant-Ref",
            &command.authorization_grant_ref,
        )
        .header("X-Spec224-Tenant-Id", &command.tenant_id)
        .call()
        .map_err(|_| "RUNNER_INPUT_FETCH_FAILED")?;
    if !response.status().is_success() {
        return Err("RUNNER_INPUT_FETCH_REJECTED".into());
    }
    let bytes = response
        .into_body()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_vec()
        .map_err(|_| "RUNNER_INPUT_RESPONSE_READ_FAILED")?;
    let bundle: InputBundleWire =
        serde_json::from_slice(&bytes).map_err(|_| "RUNNER_INPUT_RESPONSE_INVALID")?;
    let files = validate_bundle(command, &bundle)?;
    materialize_bundle(&workspace, &bundle, &files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command() -> RunnerJobCommand {
        RunnerJobCommand {
            command_id: "command-1".into(),
            command_type: "execute".into(),
            contract_version: "runner-job-v1".into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token: 1,
            tenant_id: "tenant-1".into(),
            user_id: None,
            project_ref: None,
            workspace_ref: Some("workspace-1".into()),
            runner_id: "runner-1".into(),
            runner_session_id: "session-1".into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            execution_kind: "external_agent_task".into(),
            adapter_id: "codex.v1".into(),
            adapter_version_constraint: None,
            browser_engine_constraint: None,
            idempotency_key: "idempotency-1".into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "grant-1".into(),
            input_ref: "spec224-input:one".into(),
            payload: json!({"taskId":"task-1"}),
        }
    }

    #[test]
    fn rejects_tampered_bytes_or_binding_before_materialization() {
        let command = command();
        let bytes = b"# request".to_vec();
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let mut bundle = InputBundleWire {
            input_ref: command.input_ref.clone(),
            worker_job_id: command.job_id.clone(),
            command_id: command.command_id.clone(),
            attempt_id: "attempt-1".into(),
            attempt: 1,
            lease_id: command.lease_id.clone(),
            fencing_token: 1,
            tenant_id: command.tenant_id.clone(),
            runner_id: command.runner_id.clone(),
            runner_session_id: command.runner_session_id.clone(),
            authorization_grant_ref: command.authorization_grant_ref.clone(),
            workspace_ref: "workspace-1".into(),
            input_digest: input_digest(&[("prompt.md".into(), bytes.clone())]),
            total_bytes: bytes.len(),
            files: vec![InputFileWire {
                path: "prompt.md".into(),
                digest,
                bytes: bytes.len(),
                content_base64: STANDARD.encode(&bytes),
            }],
        };
        assert!(validate_bundle(&command, &bundle).is_ok());
        bundle.files[0].content_base64 = STANDARD.encode(b"tampered");
        assert_eq!(
            validate_bundle(&command, &bundle).unwrap_err(),
            "RUNNER_INPUT_FILE_SIZE_INVALID"
        );
    }

    #[test]
    fn materializes_only_under_opaque_governed_directory() {
        let command = command();
        let bytes = b"# request".to_vec();
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let bundle = InputBundleWire {
            input_ref: command.input_ref.clone(),
            worker_job_id: command.job_id.clone(),
            command_id: command.command_id.clone(),
            attempt_id: "attempt-1".into(),
            attempt: 1,
            lease_id: command.lease_id.clone(),
            fencing_token: 1,
            tenant_id: command.tenant_id.clone(),
            runner_id: command.runner_id.clone(),
            runner_session_id: command.runner_session_id.clone(),
            authorization_grant_ref: command.authorization_grant_ref.clone(),
            workspace_ref: "workspace-1".into(),
            input_digest: input_digest(&[("prompt.md".into(), bytes.clone())]),
            total_bytes: bytes.len(),
            files: vec![InputFileWire {
                path: "prompt.md".into(),
                digest,
                bytes: bytes.len(),
                content_base64: STANDARD.encode(&bytes),
            }],
        };
        let files = validate_bundle(&command, &bundle).unwrap();
        let workspace =
            std::env::temp_dir().join(format!("spec224-run-input-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir(&workspace).unwrap();
        let materialized = materialize_bundle(&workspace, &bundle, &files).unwrap();
        assert!(workspace
            .join(&materialized.manifest_relative_path)
            .is_file());
        assert!(!materialized
            .manifest_relative_path
            .contains("spec224-input:one"));
        let _ = fs::remove_dir_all(&workspace);
    }
}
