use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecretDescriptor {
    pub secret_id: String,
    pub scope: String,
    pub secret_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecretMetadata {
    pub secret_id: String,
    pub scope: String,
    pub digest_sha256: String,
    pub storage_backend: String,
    #[serde(default = "default_storage_protection")]
    pub storage_protection: String,
    #[serde(default = "default_storage_provider")]
    pub storage_provider: String,
    #[serde(default)]
    pub os_attested: bool,
    #[serde(default)]
    pub hardware_backed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedSecretStorageBackend {
    name: String,
    storage_protection: String,
    storage_provider: String,
    os_attested: bool,
    hardware_backed: bool,
}

fn default_storage_protection() -> String {
    "best_effort".into()
}

fn default_storage_provider() -> String {
    "filesystem".into()
}

fn secret_path(base_dir: &Path, secret_id: &str) -> PathBuf {
    base_dir.join(format!("{secret_id}.secret"))
}

fn metadata_path(base_dir: &Path, secret_id: &str) -> PathBuf {
    base_dir.join(format!("{secret_id}.json"))
}

fn compute_digest(secret_value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret_value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn path_has_executable(command_name: &str) -> bool {
    let path_value = match env::var_os("PATH") {
        Some(value) => value,
        None => return false,
    };
    for entry in env::split_paths(&path_value) {
        let candidate = entry.join(command_name);
        if candidate.is_file() {
            return true;
        }
    }
    false
}

fn env_flag_enabled(name: &str) -> bool {
    matches!(
        env::var(name).ok().as_deref().map(|value| value.trim().to_ascii_lowercase()),
        Some(value) if matches!(value.as_str(), "1" | "true" | "yes" | "on")
    )
}

fn resolve_secret_storage_backend() -> ResolvedSecretStorageBackend {
    if let Ok(override_backend) = env::var("SMARTSPEC_SECRET_STORAGE_BACKEND") {
        let normalized = override_backend.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "file_store" => {
                return ResolvedSecretStorageBackend {
                    name: normalized,
                    storage_protection: "best_effort".into(),
                    storage_provider: "filesystem".into(),
                    os_attested: false,
                    hardware_backed: false,
                };
            }
            "os_keychain" => {
                return ResolvedSecretStorageBackend {
                    name: normalized,
                    storage_protection: "os_protected".into(),
                    storage_provider: resolve_os_keychain_provider(),
                    os_attested: env_flag_enabled("SMARTSPEC_SECRET_OS_ATTESTED"),
                    hardware_backed: env_flag_enabled("SMARTSPEC_SECRET_HARDWARE_BACKED"),
                };
            }
            "windows_dpapi" => {
                return ResolvedSecretStorageBackend {
                    name: normalized,
                    storage_protection: "os_protected".into(),
                    storage_provider: "windows_dpapi".into(),
                    os_attested: env_flag_enabled("SMARTSPEC_SECRET_OS_ATTESTED"),
                    hardware_backed: env_flag_enabled("SMARTSPEC_SECRET_HARDWARE_BACKED"),
                };
            }
            _ => {}
        }
    }

    #[cfg(target_os = "macos")]
    if path_has_executable("security") {
        return ResolvedSecretStorageBackend {
            name: "os_keychain".into(),
            storage_protection: "os_protected".into(),
            storage_provider: "apple_keychain".into(),
            os_attested: env_flag_enabled("SMARTSPEC_SECRET_OS_ATTESTED"),
            hardware_backed: env_flag_enabled("SMARTSPEC_SECRET_HARDWARE_BACKED"),
        };
    }

    #[cfg(target_os = "linux")]
    if path_has_executable("secret-tool") {
        return ResolvedSecretStorageBackend {
            name: "os_keychain".into(),
            storage_protection: "os_protected".into(),
            storage_provider: "freedesktop_secret_service".into(),
            os_attested: env_flag_enabled("SMARTSPEC_SECRET_OS_ATTESTED"),
            hardware_backed: env_flag_enabled("SMARTSPEC_SECRET_HARDWARE_BACKED"),
        };
    }

    #[cfg(target_os = "windows")]
    if resolve_powershell_binary().is_some() {
        return ResolvedSecretStorageBackend {
            name: "windows_dpapi".into(),
            storage_protection: "os_protected".into(),
            storage_provider: "windows_dpapi".into(),
            os_attested: env_flag_enabled("SMARTSPEC_SECRET_OS_ATTESTED"),
            hardware_backed: env_flag_enabled("SMARTSPEC_SECRET_HARDWARE_BACKED"),
        };
    }

    ResolvedSecretStorageBackend {
        name: "file_store".into(),
        storage_protection: "best_effort".into(),
        storage_provider: "filesystem".into(),
        os_attested: false,
        hardware_backed: false,
    }
}

#[cfg(target_os = "windows")]
fn resolve_powershell_binary() -> Option<PathBuf> {
    if let Some(candidate) = resolve_explicit_powershell_binary() {
        return Some(candidate);
    }
    ["pwsh.exe", "powershell.exe", "pwsh", "powershell"]
        .into_iter()
        .find_map(|binary| resolve_binary_from_path(binary))
}

#[cfg(target_os = "windows")]
fn resolve_explicit_powershell_binary() -> Option<PathBuf> {
    for env_var in ["SMARTSPEC_PWSH_PATH", "SMARTSPEC_POWERSHELL_PATH"] {
        if let Ok(value) = env::var(env_var) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                let candidate = PathBuf::from(trimmed);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn resolve_binary_from_path(binary_name: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;
    for entry in env::split_paths(&path_value) {
        let candidate = entry.join(binary_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_os_keychain_provider() -> String {
    #[cfg(target_os = "macos")]
    {
        return "apple_keychain".into();
    }
    #[cfg(target_os = "linux")]
    {
        return "freedesktop_secret_service".into();
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        "os_keychain".into()
    }
}

#[cfg(target_os = "macos")]
fn store_secret_in_os_keychain(secret_id: &str, scope: &str, secret_value: &str) -> Result<(), String> {
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-U",
            "-a",
            scope,
            "-s",
            secret_id,
            "-w",
            secret_value,
        ])
        .status()
        .map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("failed to store secret in macOS keychain".into());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn store_secret_in_os_keychain(secret_id: &str, scope: &str, secret_value: &str) -> Result<(), String> {
    let mut child = Command::new("secret-tool")
        .args([
            "store",
            "--label=SmartSpec Desktop Secret",
            "service",
            "smartspec-desktop-host",
            "secret_id",
            secret_id,
            "scope",
            scope,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(secret_value.as_bytes())
            .map_err(|error| error.to_string())?;
    }
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("failed to store secret in desktop keychain".into());
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn store_secret_in_os_keychain(_secret_id: &str, _scope: &str, _secret_value: &str) -> Result<(), String> {
    Err("os_keychain storage backend is not supported on this platform".into())
}

#[cfg(target_os = "macos")]
fn read_secret_from_os_keychain(secret_id: &str, scope: &str) -> Result<String, String> {
    let output = Command::new("security")
        .args(["find-generic-password", "-a", scope, "-s", secret_id, "-w"])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err("failed to read secret from macOS keychain".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "linux")]
fn read_secret_from_os_keychain(secret_id: &str, scope: &str) -> Result<String, String> {
    let output = Command::new("secret-tool")
        .args([
            "lookup",
            "service",
            "smartspec-desktop-host",
            "secret_id",
            secret_id,
            "scope",
            scope,
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err("failed to read secret from desktop keychain".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_secret_from_os_keychain(_secret_id: &str, _scope: &str) -> Result<String, String> {
    Err("os_keychain storage backend is not supported on this platform".into())
}

#[cfg(target_os = "macos")]
fn delete_secret_from_os_keychain(secret_id: &str, scope: &str) -> Result<(), String> {
    let status = Command::new("security")
        .args(["delete-generic-password", "-a", scope, "-s", secret_id])
        .status()
        .map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("failed to delete secret from macOS keychain".into());
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn delete_secret_from_os_keychain(secret_id: &str, scope: &str) -> Result<(), String> {
    let status = Command::new("secret-tool")
        .args([
            "clear",
            "service",
            "smartspec-desktop-host",
            "secret_id",
            secret_id,
            "scope",
            scope,
        ])
        .status()
        .map_err(|error| error.to_string())?;
    if !status.success() {
        return Err("failed to delete secret from desktop keychain".into());
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn delete_secret_from_os_keychain(_secret_id: &str, _scope: &str) -> Result<(), String> {
    Err("os_keychain storage backend is not supported on this platform".into())
}

#[cfg(target_os = "windows")]
fn run_powershell_script(script: &str, env_pairs: &[(&str, &str)]) -> Result<String, String> {
    let powershell = resolve_powershell_binary()
        .ok_or_else(|| "windows powershell runtime is unavailable".to_string())?;
    let mut command = Command::new(powershell);
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in env_pairs {
        command.env(key, value);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "powershell secret operation failed".into()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn store_secret_in_windows_dpapi(base_dir: &Path, secret_id: &str, secret_value: &str) -> Result<(), String> {
    let output_path = secret_path(base_dir, secret_id);
    let output_parent = output_path
        .parent()
        .ok_or_else(|| "secret output path is invalid".to_string())?;
    fs::create_dir_all(output_parent).map_err(|error| error.to_string())?;
    let script = r#"
      $path = [System.IO.Path]::GetFullPath($env:SMARTSPEC_SECRET_OUTPUT_PATH)
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($env:SMARTSPEC_SECRET_VALUE)
      $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
      )
      [System.IO.File]::WriteAllText($path, [Convert]::ToBase64String($protected))
      Write-Output "ok"
    "#;
    let _ = run_powershell_script(
        script,
        &[
            ("SMARTSPEC_SECRET_OUTPUT_PATH", &output_path.to_string_lossy()),
            ("SMARTSPEC_SECRET_VALUE", secret_value),
        ],
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn read_secret_from_windows_dpapi(base_dir: &Path, secret_id: &str) -> Result<String, String> {
    let input_path = secret_path(base_dir, secret_id);
    if !input_path.is_file() {
        return Err("protected secret blob is missing".into());
    }
    let script = r#"
      $path = [System.IO.Path]::GetFullPath($env:SMARTSPEC_SECRET_INPUT_PATH)
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
        &[("SMARTSPEC_SECRET_INPUT_PATH", &input_path.to_string_lossy())],
    )
}

#[cfg(not(target_os = "windows"))]
fn store_secret_in_windows_dpapi(_base_dir: &Path, _secret_id: &str, _secret_value: &str) -> Result<(), String> {
    Err("windows_dpapi storage backend is not supported on this platform".into())
}

#[cfg(not(target_os = "windows"))]
fn read_secret_from_windows_dpapi(_base_dir: &Path, _secret_id: &str) -> Result<String, String> {
    Err("windows_dpapi storage backend is not supported on this platform".into())
}

pub fn store_secret(base_dir: &Path, descriptor: SecretDescriptor) -> Result<SecretMetadata, String> {
    if descriptor.secret_id.trim().is_empty() || descriptor.scope.trim().is_empty() {
        return Err("secret_id and scope are required".into());
    }
    fs::create_dir_all(base_dir).map_err(|error| error.to_string())?;
    let storage_backend = resolve_secret_storage_backend();
    let metadata = SecretMetadata {
        secret_id: descriptor.secret_id.clone(),
        scope: descriptor.scope,
        digest_sha256: compute_digest(&descriptor.secret_value),
        storage_backend: storage_backend.name.clone(),
        storage_protection: storage_backend.storage_protection,
        storage_provider: storage_backend.storage_provider,
        os_attested: storage_backend.os_attested,
        hardware_backed: storage_backend.hardware_backed,
    };
    if metadata.storage_backend == "os_keychain" {
        store_secret_in_os_keychain(
            &descriptor.secret_id,
            &metadata.scope,
            &descriptor.secret_value,
        )?;
        let file_path = secret_path(base_dir, &descriptor.secret_id);
        if file_path.exists() {
            fs::remove_file(file_path).map_err(|error| error.to_string())?;
        }
    } else if metadata.storage_backend == "windows_dpapi" {
        store_secret_in_windows_dpapi(base_dir, &descriptor.secret_id, &descriptor.secret_value)?;
    } else {
        fs::write(secret_path(base_dir, &descriptor.secret_id), descriptor.secret_value)
            .map_err(|error| error.to_string())?;
    }
    fs::write(
        metadata_path(base_dir, &metadata.secret_id),
        serde_json::to_vec(&metadata).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(metadata)
}

pub fn delete_secret(base_dir: &Path, secret_id: &str) -> Result<(), String> {
    let secret = secret_path(base_dir, secret_id);
    let metadata = metadata_path(base_dir, secret_id);
    let stored_metadata = if metadata.exists() {
        read_secret_metadata(base_dir, secret_id).ok()
    } else {
        None
    };
    if let Some(existing_metadata) = stored_metadata.as_ref() {
        if existing_metadata.storage_backend == "os_keychain" {
            delete_secret_from_os_keychain(secret_id, &existing_metadata.scope)?;
        }
    }
    if secret.exists() {
        fs::remove_file(secret).map_err(|error| error.to_string())?;
    }
    if metadata.exists() {
        fs::remove_file(metadata).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn read_secret_metadata(base_dir: &Path, secret_id: &str) -> Result<SecretMetadata, String> {
    let raw = fs::read(metadata_path(base_dir, secret_id)).map_err(|error| error.to_string())?;
    serde_json::from_slice(&raw).map_err(|error| error.to_string())
}

pub fn read_secret_value(base_dir: &Path, secret_id: &str) -> Result<String, String> {
    let metadata = read_secret_metadata(base_dir, secret_id)?;
    if metadata.storage_backend == "os_keychain" {
        return read_secret_from_os_keychain(secret_id, &metadata.scope);
    }
    if metadata.storage_backend == "windows_dpapi" {
        return read_secret_from_windows_dpapi(base_dir, secret_id);
    }
    fs::read_to_string(secret_path(base_dir, secret_id)).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn desktop_host_store_secret(
    base_dir: String,
    descriptor: SecretDescriptor,
) -> Result<SecretMetadata, String> {
    store_secret(Path::new(&base_dir), descriptor)
}

#[tauri::command]
pub async fn desktop_host_delete_secret(
    base_dir: String,
    secret_id: String,
) -> Result<(), String> {
    delete_secret(Path::new(&base_dir), &secret_id)
}

#[tauri::command]
pub async fn desktop_host_read_secret_metadata(
    base_dir: String,
    secret_id: String,
) -> Result<SecretMetadata, String> {
    read_secret_metadata(Path::new(&base_dir), &secret_id)
}
