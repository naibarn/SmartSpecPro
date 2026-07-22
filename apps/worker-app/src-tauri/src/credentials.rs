use rand::rngs::OsRng;
use rand::RngCore;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::signature::{SignatureEncoding, Signer};
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

use crate::commands::{WorkerConnectTokens, WorkerConnectWorker};

const CONNECTION_FILE_NAME: &str = "worker-connection.json";
const DEVICE_PROOF_FILE_NAME: &str = "worker-device-proof.json";
const DEVICE_PRIVATE_KEY_FILE_NAME: &str = "worker-device-proof-private-key.secret";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerCredentialScope {
    ConnectSession,
    WorkerAccess,
    WorkerRefresh,
    DeviceProof,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerCredentialMetadata {
    pub credential_id: String,
    pub scope: WorkerCredentialScope,
    pub stored_in_secure_os_storage: bool,
    pub exportable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredWorkerConnection {
    pub server_url: String,
    pub worker: WorkerConnectWorker,
    pub tokens: WorkerConnectTokens,
    pub connected_at: String,
    pub last_refreshed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct StoredWorkerConnectionFile {
    pub server_url: String,
    pub worker: WorkerConnectWorker,
    pub tokens: WorkerConnectTokens,
    pub connected_at: String,
    pub last_refreshed_at: Option<String>,
    pub device_proof: Option<WorkerDeviceProofMaterial>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDeviceBinding {
    pub device_id: String,
    pub machine_fingerprint: String,
    pub public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDeviceProofMaterial {
    pub device_id: String,
    pub machine_fingerprint: String,
    pub public_key_pem: String,
    pub private_key_pem: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct StoredWorkerDeviceProofMaterial {
    pub device_id: String,
    pub machine_fingerprint: String,
    pub public_key_pem: String,
    pub private_key_storage: String,
}

impl WorkerDeviceProofMaterial {
    pub fn binding(&self) -> WorkerDeviceBinding {
        WorkerDeviceBinding {
            device_id: self.device_id.clone(),
            machine_fingerprint: self.machine_fingerprint.clone(),
            public_key: self.public_key_pem.clone(),
        }
    }

    pub fn sign_sha256_base64(&self, payload: &str) -> Result<String, String> {
        let private_key = RsaPrivateKey::from_pkcs8_pem(&self.private_key_pem)
            .map_err(|error| format!("failed to load worker device private key: {error}"))?;
        let signing_key = SigningKey::<Sha256>::new(private_key);
        let signature = signing_key.sign(payload.as_bytes());
        Ok(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            signature.to_vec(),
        ))
    }
}

pub fn build_credential_id(
    device_id: &str,
    scope: &WorkerCredentialScope,
) -> Result<String, String> {
    let sanitized = device_id
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        return Err("device_id is required".into());
    }

    Ok(format!("worker_app__{sanitized}__{}", scope_name(scope)))
}

pub fn placeholder_metadata(
    device_id: &str,
    scope: WorkerCredentialScope,
) -> Result<WorkerCredentialMetadata, String> {
    Ok(WorkerCredentialMetadata {
        credential_id: build_credential_id(device_id, &scope)?,
        scope,
        stored_in_secure_os_storage: false,
        exportable: false,
    })
}

pub fn ensure_device_proof_material(
    app_data_dir: &Path,
) -> Result<WorkerDeviceProofMaterial, String> {
    if let Some(existing) = load_device_proof_material(app_data_dir)? {
        validate_device_proof_material(&existing)?;
        return Ok(existing);
    }
    let material = generate_device_proof_material()?;
    save_device_proof_material(app_data_dir, &material)?;
    Ok(material)
}

pub fn load_device_proof_material(
    app_data_dir: &Path,
) -> Result<Option<WorkerDeviceProofMaterial>, String> {
    let path = app_data_dir.join(DEVICE_PROOF_FILE_NAME);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read worker device proof: {error}"))?;
    let material =
        if let Ok(stored) = serde_json::from_str::<StoredWorkerDeviceProofMaterial>(&contents) {
            let private_key_path = private_key_path(app_data_dir);
            if !private_key_path.is_file() {
                return Ok(Some(repair_missing_device_proof_material(app_data_dir)?));
            }
            WorkerDeviceProofMaterial {
                device_id: stored.device_id,
                machine_fingerprint: stored.machine_fingerprint,
                public_key_pem: stored.public_key_pem,
                private_key_pem: read_private_key(app_data_dir, &stored.private_key_storage)?,
            }
        } else {
            let legacy = serde_json::from_str::<WorkerDeviceProofMaterial>(&contents)
                .map_err(|error| format!("failed to parse worker device proof: {error}"))?;
            save_device_proof_material(app_data_dir, &legacy)?;
            legacy
        };
    Ok(Some(material))
}

fn repair_missing_device_proof_material(
    app_data_dir: &Path,
) -> Result<WorkerDeviceProofMaterial, String> {
    let material = generate_device_proof_material()?;
    save_device_proof_material(app_data_dir, &material)?;
    let _ = clear_connection(app_data_dir);
    Ok(material)
}

pub fn save_device_proof_material(
    app_data_dir: &Path,
    material: &WorkerDeviceProofMaterial,
) -> Result<(), String> {
    validate_device_proof_material(material)?;
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create device proof directory: {error}"))?;
    let private_key_storage = store_private_key(app_data_dir, &material.private_key_pem)?;
    let path = app_data_dir.join(DEVICE_PROOF_FILE_NAME);
    let stored = StoredWorkerDeviceProofMaterial {
        device_id: material.device_id.clone(),
        machine_fingerprint: material.machine_fingerprint.clone(),
        public_key_pem: material.public_key_pem.clone(),
        private_key_storage,
    };
    let contents = serde_json::to_vec_pretty(&stored)
        .map_err(|error| format!("failed to serialize worker device proof: {error}"))?;
    fs::write(path, contents)
        .map_err(|error| format!("failed to save worker device proof: {error}"))
}

fn validate_device_proof_material(material: &WorkerDeviceProofMaterial) -> Result<(), String> {
    if material.device_id.trim().is_empty()
        || material.machine_fingerprint.trim().is_empty()
        || material.public_key_pem.trim().is_empty()
        || material.private_key_pem.trim().is_empty()
    {
        return Err("worker device proof material is incomplete".into());
    }
    RsaPrivateKey::from_pkcs8_pem(&material.private_key_pem)
        .map_err(|error| format!("worker device private key is invalid: {error}"))?;
    Ok(())
}

fn generate_device_proof_material() -> Result<WorkerDeviceProofMaterial, String> {
    let mut rng = OsRng;
    let private_key = RsaPrivateKey::new(&mut rng, 2048)
        .map_err(|error| format!("failed to generate worker device key: {error}"))?;
    let public_key = RsaPublicKey::from(&private_key);
    let private_key_pem = private_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|error| format!("failed to encode worker device private key: {error}"))?
        .to_string();
    let public_key_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|error| format!("failed to encode worker device public key: {error}"))?;
    let mut random_bytes = [0_u8; 16];
    rng.fill_bytes(&mut random_bytes);
    let device_id = format!("wdev_{}", hex_lower(&random_bytes));
    Ok(WorkerDeviceProofMaterial {
        device_id,
        machine_fingerprint: machine_fingerprint(),
        public_key_pem,
        private_key_pem,
    })
}

fn private_key_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DEVICE_PRIVATE_KEY_FILE_NAME)
}

#[cfg(target_os = "windows")]
fn store_private_key(app_data_dir: &Path, private_key_pem: &str) -> Result<String, String> {
    let output_path = private_key_path(app_data_dir);
    let script = r#"
      $path = [System.IO.Path]::GetFullPath($env:SMARTAIHUB_WORKER_PRIVATE_KEY_PATH)
      $parent = [System.IO.Path]::GetDirectoryName($path)
      [System.IO.Directory]::CreateDirectory($parent) | Out-Null
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($env:SMARTAIHUB_WORKER_PRIVATE_KEY)
      $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
      )
      [System.IO.File]::WriteAllText($path, [Convert]::ToBase64String($protected))
      Write-Output "ok"
    "#;
    run_powershell_script(
        script,
        &[
            (
                "SMARTAIHUB_WORKER_PRIVATE_KEY_PATH",
                &output_path.to_string_lossy(),
            ),
            ("SMARTAIHUB_WORKER_PRIVATE_KEY", private_key_pem),
        ],
    )?;
    Ok("windows_dpapi_current_user".into())
}

#[cfg(target_os = "windows")]
fn read_private_key(app_data_dir: &Path, storage: &str) -> Result<String, String> {
    if storage != "windows_dpapi_current_user" {
        return read_private_key_file(app_data_dir);
    }
    let input_path = private_key_path(app_data_dir);
    if !input_path.is_file() {
        return Err("worker device private key blob is missing".into());
    }
    let script = r#"
      $path = [System.IO.Path]::GetFullPath($env:SMARTAIHUB_WORKER_PRIVATE_KEY_PATH)
      $protected = [Convert]::FromBase64String([System.IO.File]::ReadAllText($path))
      $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $protected,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
      )
      [System.Text.Encoding]::UTF8.GetString($bytes)
    "#;
    run_powershell_script(
        script,
        &[(
            "SMARTAIHUB_WORKER_PRIVATE_KEY_PATH",
            &input_path.to_string_lossy(),
        )],
    )
}

#[cfg(target_os = "windows")]
fn run_powershell_script(script: &str, env_pairs: &[(&str, &str)]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new(resolve_powershell_binary()?);
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in env_pairs {
        command.env(key, value);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "PowerShell DPAPI operation failed".into()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn resolve_powershell_binary() -> Result<String, String> {
    for name in ["pwsh.exe", "powershell.exe", "pwsh", "powershell"] {
        if Command::new(name)
            .args(["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(name.into());
        }
    }
    Err("PowerShell is required for Windows DPAPI worker key storage".into())
}

#[cfg(not(target_os = "windows"))]
fn store_private_key(app_data_dir: &Path, private_key_pem: &str) -> Result<String, String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create private key directory: {error}"))?;
    let path = private_key_path(app_data_dir);
    fs::write(&path, private_key_pem)
        .map_err(|error| format!("failed to save worker private key: {error}"))?;
    restrict_private_key_permissions(&path)?;
    Ok("file_store_0600".into())
}

#[cfg(not(target_os = "windows"))]
fn read_private_key(app_data_dir: &Path, _storage: &str) -> Result<String, String> {
    read_private_key_file(app_data_dir)
}

fn read_private_key_file(app_data_dir: &Path) -> Result<String, String> {
    fs::read_to_string(private_key_path(app_data_dir))
        .map_err(|error| format!("failed to read worker private key: {error}"))
}

#[cfg(unix)]
fn restrict_private_key_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let permissions = fs::Permissions::from_mode(0o600);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("failed to restrict worker private key permissions: {error}"))
}

#[cfg(not(unix))]
fn restrict_private_key_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn machine_fingerprint() -> String {
    let machine = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-machine".into());
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown-user".into());
    let raw = format!(
        "{}:{}:{}:{}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        machine.trim(),
        user.trim()
    );
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("machine_{}", hex_lower(&hasher.finalize()))
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn load_connection(app_data_dir: &Path) -> Result<Option<StoredWorkerConnection>, String> {
    Ok(load_connection_file(app_data_dir)?.map(|file| file.connection()))
}

pub fn load_connection_device_proof(
    app_data_dir: &Path,
) -> Result<Option<WorkerDeviceProofMaterial>, String> {
    Ok(load_connection_file(app_data_dir)?.and_then(|file| file.device_proof))
}

fn load_connection_file(app_data_dir: &Path) -> Result<Option<StoredWorkerConnectionFile>, String> {
    let path = app_data_dir.join(CONNECTION_FILE_NAME);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read worker connection: {error}"))?;
    let connection = serde_json::from_str::<StoredWorkerConnectionFile>(&contents)
        .map_err(|error| format!("failed to parse worker connection: {error}"))?;
    Ok(Some(connection))
}

pub fn save_connection(
    app_data_dir: &Path,
    connection: &StoredWorkerConnection,
) -> Result<(), String> {
    save_connection_file(
        app_data_dir,
        &StoredWorkerConnectionFile::from_connection(connection, None),
    )
}

pub fn save_connection_with_device_proof(
    app_data_dir: &Path,
    connection: &StoredWorkerConnection,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<(), String> {
    validate_device_proof_material(device_proof)?;
    save_connection_file(
        app_data_dir,
        &StoredWorkerConnectionFile::from_connection(connection, Some(device_proof.clone())),
    )
}

fn save_connection_file(
    app_data_dir: &Path,
    connection: &StoredWorkerConnectionFile,
) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create connection directory: {error}"))?;
    let path = app_data_dir.join(CONNECTION_FILE_NAME);
    let contents = serde_json::to_vec_pretty(connection)
        .map_err(|error| format!("failed to serialize worker connection: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("failed to save worker connection: {error}"))
}

impl StoredWorkerConnectionFile {
    fn from_connection(
        connection: &StoredWorkerConnection,
        device_proof: Option<WorkerDeviceProofMaterial>,
    ) -> Self {
        Self {
            server_url: connection.server_url.clone(),
            worker: connection.worker.clone(),
            tokens: connection.tokens.clone(),
            connected_at: connection.connected_at.clone(),
            last_refreshed_at: connection.last_refreshed_at.clone(),
            device_proof,
        }
    }

    fn connection(self) -> StoredWorkerConnection {
        StoredWorkerConnection {
            server_url: self.server_url,
            worker: self.worker,
            tokens: self.tokens,
            connected_at: self.connected_at,
            last_refreshed_at: self.last_refreshed_at,
        }
    }
}

pub fn clear_connection(app_data_dir: &Path) -> Result<(), String> {
    let path = app_data_dir.join(CONNECTION_FILE_NAME);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("failed to clear worker connection: {error}"))?;
    }
    Ok(())
}

fn scope_name(scope: &WorkerCredentialScope) -> &'static str {
    match scope {
        WorkerCredentialScope::ConnectSession => "connect_session",
        WorkerCredentialScope::WorkerAccess => "worker_access",
        WorkerCredentialScope::WorkerRefresh => "worker_refresh",
        WorkerCredentialScope::DeviceProof => "device_proof",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_ids_are_sanitized_and_non_exportable() {
        let metadata =
            placeholder_metadata("device 1@example", WorkerCredentialScope::DeviceProof).unwrap();

        assert_eq!(
            metadata.credential_id,
            "worker_app__device_1_example__device_proof"
        );
        assert!(!metadata.exportable);
    }

    #[test]
    fn stored_connection_round_trips() {
        let temp = tempfile::tempdir().unwrap();
        let connection = StoredWorkerConnection {
            server_url: "https://smartaihub.app".into(),
            worker: WorkerConnectWorker {
                id: "wrk_1".into(),
                display_name: "Render worker".into(),
                runtime_type: "desktop_zeroclaw_managed".into(),
                machine_name: Some("DESKTOP".into()),
            },
            tokens: WorkerConnectTokens {
                execution_token: "execution.jwt".into(),
                upload_token: "upload.jwt".into(),
                refresh_token: Some("refresh.jwt".into()),
            },
            connected_at: "2026-06-23T00:00:00Z".into(),
            last_refreshed_at: None,
        };

        save_connection(temp.path(), &connection).unwrap();
        assert_eq!(load_connection(temp.path()).unwrap(), Some(connection));
        clear_connection(temp.path()).unwrap();
        assert!(load_connection(temp.path()).unwrap().is_none());
    }

    #[test]
    fn stored_connection_can_carry_connection_bound_device_proof() {
        let temp = tempfile::tempdir().unwrap();
        let connection = StoredWorkerConnection {
            server_url: "https://smartaihub.app".into(),
            worker: WorkerConnectWorker {
                id: "wrk_1".into(),
                display_name: "Render worker".into(),
                runtime_type: "desktop_zeroclaw_managed".into(),
                machine_name: Some("DESKTOP".into()),
            },
            tokens: WorkerConnectTokens {
                execution_token: "execution.jwt".into(),
                upload_token: "upload.jwt".into(),
                refresh_token: Some("refresh.jwt".into()),
            },
            connected_at: "2026-06-23T00:00:00Z".into(),
            last_refreshed_at: None,
        };
        let proof = ensure_device_proof_material(temp.path()).unwrap();

        save_connection_with_device_proof(temp.path(), &connection, &proof).unwrap();

        assert_eq!(load_connection(temp.path()).unwrap(), Some(connection));
        assert_eq!(
            load_connection_device_proof(temp.path()).unwrap(),
            Some(proof)
        );
    }

    #[test]
    fn device_proof_material_round_trips_and_signs() {
        let temp = tempfile::tempdir().unwrap();
        let material = ensure_device_proof_material(temp.path()).unwrap();
        assert!(material.device_id.starts_with("wdev_"));
        assert!(material.public_key_pem.contains("BEGIN PUBLIC KEY"));
        assert!(
            material
                .sign_sha256_base64("POST\n/api/workers/1/heartbeat\njti\nnow\nnonce\nhash")
                .unwrap()
                .len()
                > 64
        );
        assert_eq!(
            load_device_proof_material(temp.path()).unwrap(),
            Some(material)
        );
    }

    #[test]
    fn device_proof_material_repairs_missing_private_key_blob() {
        let temp = tempfile::tempdir().unwrap();
        let stored = StoredWorkerDeviceProofMaterial {
            device_id: "wdev_legacy".into(),
            machine_fingerprint: "machine_legacy".into(),
            public_key_pem: "legacy-public-key".into(),
            private_key_storage: "windows_dpapi_current_user".into(),
        };
        fs::write(
            temp.path().join(DEVICE_PROOF_FILE_NAME),
            serde_json::to_vec_pretty(&stored).unwrap(),
        )
        .unwrap();

        let repaired = load_device_proof_material(temp.path())
            .unwrap()
            .expect("repaired material");

        assert!(repaired.device_id.starts_with("wdev_"));
        assert!(repaired.public_key_pem.contains("BEGIN PUBLIC KEY"));
        assert!(private_key_path(temp.path()).is_file());
    }
}
