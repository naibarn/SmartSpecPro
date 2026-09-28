//! Managed installer and resolver for the official local ComfyUI MCP package.
//!
//! The Worker App does not redistribute ComfyUI, models, or custom nodes. It
//! provisions an isolated Python environment for the official `comfy-mcp`
//! server and `comfy-cli`, then uses that executable for LocalStdio profiles.
//! This keeps the local MCP path deterministic while leaving the user's
//! ComfyUI workspace and GPU dependencies under their control.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

pub const STANDARD_COMMAND: &str = "comfy-mcp";
pub const COMFY_MCP_VERSION: &str = "0.10.0";
pub const COMFY_CLI_REQUIREMENT: &str = ">=1.14.0";
pub const PYTHON_REQUIREMENT: &str = ">=3.10";
const PYPI_INDEX_URL: &str = "https://pypi.org/simple";
const INSTALLER_SCHEMA_VERSION: u32 = 1;
const INSTALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

static INSTALL_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyMcpRuntimeStatus {
    pub status: String,
    pub command: String,
    pub managed_command_path: Option<String>,
    pub python_version: Option<String>,
    pub comfy_mcp_version: Option<String>,
    pub comfy_cli_version: Option<String>,
    pub python_requirement: String,
    pub comfy_mcp_requirement: String,
    pub comfy_cli_requirement: String,
    pub install_root: String,
    pub requires_comfyui_workspace: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyMcpInstallResult {
    pub status: String,
    pub message: String,
    pub runtime: ComfyMcpRuntimeStatus,
}

#[derive(Debug, Clone)]
struct PythonLauncher {
    executable: PathBuf,
    prefix_args: Vec<String>,
    version: String,
}

pub fn runtime_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("comfy-mcp-runtime")
}

pub fn managed_command_path(app_data_dir: &Path) -> Option<PathBuf> {
    let root = runtime_root(app_data_dir);
    let path = if cfg!(windows) {
        root.join("venv").join("Scripts").join("comfy-mcp.exe")
    } else {
        root.join("venv").join("bin").join(STANDARD_COMMAND)
    };
    path.is_file().then_some(path)
}

pub fn managed_cli_path(app_data_dir: &Path) -> PathBuf {
    let root = runtime_root(app_data_dir);
    if cfg!(windows) {
        root.join("venv").join("Scripts").join("comfy.exe")
    } else {
        root.join("venv").join("bin").join("comfy")
    }
}

pub fn normalize_command(command: &str) -> String {
    match command.trim() {
        "comfyui-mcp" | "comfy-local-mcp" | STANDARD_COMMAND => STANDARD_COMMAND.into(),
        value => value.into(),
    }
}

pub async fn status(app_data_dir: &Path) -> ComfyMcpRuntimeStatus {
    let root = runtime_root(app_data_dir);
    let command_path = managed_command_path(app_data_dir);
    let marker = root.join("install-manifest.json");
    let marker_value = std::fs::read_to_string(&marker)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    let python_version = marker_value
        .as_ref()
        .and_then(|value| value.get("pythonVersion"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let comfy_mcp_version = marker_value
        .as_ref()
        .and_then(|value| value.get("comfyMcpVersion"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let comfy_cli_version = marker_value
        .as_ref()
        .and_then(|value| value.get("comfyCliVersion"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let cli_path_ready = managed_cli_path(app_data_dir).is_file();
    let ready = command_path.is_some()
        && cli_path_ready
        && comfy_mcp_version.as_deref() == Some(COMFY_MCP_VERSION)
        && comfy_cli_version.is_some()
        && marker_value
            .as_ref()
            .and_then(|value| value.get("schemaVersion"))
            .and_then(serde_json::Value::as_u64)
            == Some(INSTALLER_SCHEMA_VERSION as u64);
    ComfyMcpRuntimeStatus {
        status: if ready { "ready" } else { "needs_install" }.into(),
        command: STANDARD_COMMAND.into(),
        managed_command_path: command_path.map(|path| path.to_string_lossy().to_string()),
        python_version,
        comfy_mcp_version,
        comfy_cli_version,
        python_requirement: PYTHON_REQUIREMENT.into(),
        comfy_mcp_requirement: format!("=={COMFY_MCP_VERSION}"),
        comfy_cli_requirement: COMFY_CLI_REQUIREMENT.into(),
        install_root: root.to_string_lossy().to_string(),
        requires_comfyui_workspace: true,
        message: if ready {
            "Managed local ComfyUI MCP is ready.".into()
        } else {
            "Install the managed MCP runtime, then configure or start a local ComfyUI workspace."
                .into()
        },
    }
}

pub async fn install(app_data_dir: &Path) -> Result<ComfyMcpInstallResult, String> {
    let _guard = INSTALL_LOCK.lock().await;
    let root = runtime_root(app_data_dir);
    let venv = root.join("venv");
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("comfy_mcp_runtime_directory_failed:{error}"))?;
    let python = find_python(app_data_dir).await?;

    let mut venv_command = Command::new(&python.executable);
    venv_command
        .args(&python.prefix_args)
        .args(["-m", "venv", "--clear"])
        .arg(&venv);
    run_checked_command(
        &mut venv_command,
        INSTALL_TIMEOUT,
        "comfy_mcp_python_venv_failed",
    )
    .await?;

    let pip = if cfg!(windows) {
        venv.join("Scripts").join("pip.exe")
    } else {
        venv.join("bin").join("pip")
    };
    if !pip.is_file() {
        let mut ensure_pip_command = Command::new(&python.executable);
        ensure_pip_command
            .args(&python.prefix_args)
            .args(["-m", "ensurepip", "--upgrade"]);
        run_checked_command(
            &mut ensure_pip_command,
            INSTALL_TIMEOUT,
            "comfy_mcp_ensurepip_failed",
        )
        .await?;
    }
    if !pip.is_file() {
        return Err("comfy_mcp_pip_missing".into());
    }
    let packages = [
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--index-url",
        PYPI_INDEX_URL,
        "--upgrade",
        "comfy-mcp==0.10.0",
        "comfy-cli>=1.14.0",
    ];
    run_checked_path(
        &pip,
        &packages,
        INSTALL_TIMEOUT,
        "comfy_mcp_package_install_failed",
    )
    .await?;

    let _command_path = managed_command_path(app_data_dir)
        .ok_or_else(|| "comfy_mcp_entrypoint_missing".to_string())?;
    let cli_path = managed_cli_path(app_data_dir);
    let cli_version = if cli_path.is_file() {
        run_capture_path(&cli_path, &["--version"], PROBE_TIMEOUT)
            .await
            .ok()
            .map(|value| normalize_cli_version(&value))
    } else {
        None
    };
    let manifest = serde_json::json!({
        "schemaVersion": INSTALLER_SCHEMA_VERSION,
        "installerVersion": "2026.08.27.1",
        "command": STANDARD_COMMAND,
        "comfyMcpVersion": COMFY_MCP_VERSION,
        "comfyCliRequirement": COMFY_CLI_REQUIREMENT,
        "comfyCliVersion": cli_version,
        "pythonVersion": python.version,
        "pythonRequirement": PYTHON_REQUIREMENT,
        "indexUrl": PYPI_INDEX_URL,
        "sourceUrl": "https://github.com/Comfy-Org/comfy-mcp",
        "license": "AGPL-3.0-or-later OR LicenseRef-Comfy-Commercial",
        "requiresExistingComfyUiWorkspace": true
    });
    let marker = root.join("install-manifest.json");
    let temp = root.join("install-manifest.json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&manifest).map_err(|_| "comfy_mcp_manifest_encode_failed")?,
    )
    .map_err(|error| format!("comfy_mcp_manifest_write_failed:{error}"))?;
    std::fs::rename(&temp, &marker)
        .map_err(|error| format!("comfy_mcp_manifest_commit_failed:{error}"))?;
    let runtime = status(app_data_dir).await;
    if runtime.status != "ready" {
        return Err("comfy_mcp_runtime_verification_failed".into());
    }
    Ok(ComfyMcpInstallResult {
        status: "installed".into(),
        message: "Managed local ComfyUI MCP is ready.".into(),
        runtime,
    })
}

async fn find_python(app_data_dir: &Path) -> Result<PythonLauncher, String> {
    // The Hermes runtime pack already carries a native Python 3.11 build on
    // supported Worker platforms. Prefer it so a new machine does not need a
    // separate system Python installation before Local ComfyUI MCP can be
    // installed. The argument is only used to resolve the pack location; the
    // MCP venv remains isolated under comfy-mcp-runtime.
    let (manifest_path, pack_root) = crate::hermes_runtime::hermes_runtime_pack_paths(app_data_dir);
    if let Ok(manifest) = crate::hermes_runtime::read_hermes_runtime_manifest(&manifest_path) {
        let bundled_python = pack_root.join(&manifest.python_relative_path);
        if manifest.allowed && bundled_python.is_file() {
            if let Ok(output) =
                run_capture_path(&bundled_python, &["--version"], PROBE_TIMEOUT).await
            {
                if python_version_supported(&output) {
                    return Ok(PythonLauncher {
                        executable: bundled_python,
                        prefix_args: Vec::new(),
                        version: output.trim().to_string(),
                    });
                }
            }
        }
    }

    let candidates: &[(&str, &[&str])] = if cfg!(windows) {
        &[("py", &["-3"]), ("python", &[])]
    } else {
        &[("python3", &[]), ("python", &[])]
    };
    for (executable, prefix_args) in candidates {
        if let Ok(output) = run_capture(executable, prefix_args, PROBE_TIMEOUT).await {
            if python_version_supported(&output) {
                return Ok(PythonLauncher {
                    executable: PathBuf::from(executable),
                    prefix_args: prefix_args
                        .iter()
                        .map(|value| (*value).to_string())
                        .collect(),
                    version: output.trim().to_string(),
                });
            }
        }
    }
    Err("comfy_mcp_python_310_required".into())
}

fn python_version_supported(value: &str) -> bool {
    let digits = value
        .split_whitespace()
        .find(|part| {
            part.chars()
                .next()
                .is_some_and(|char| char.is_ascii_digit())
        })
        .unwrap_or_default();
    let mut parts = digits
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());
    matches!((parts.next(), parts.next()), (Some(major), Some(minor)) if major > 3 || (major == 3 && minor >= 10))
}

fn normalize_cli_version(value: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
        if let Some(version) = parsed
            .get("data")
            .and_then(|data| data.get("version"))
            .and_then(serde_json::Value::as_str)
        {
            return version.to_string();
        }
        if let Some(version) = parsed.get("version").and_then(serde_json::Value::as_str) {
            return version.to_string();
        }
    }
    value.trim().to_string()
}

async fn run_checked_path(
    program: &Path,
    args: &[&str],
    limit: Duration,
    error_code: &str,
) -> Result<(), String> {
    let _ = run_capture_path(program, args, limit)
        .await
        .map_err(|error| format!("{error_code}:{error}"))?;
    Ok(())
}

async fn run_checked_command(
    command: &mut Command,
    limit: Duration,
    error_code: &str,
) -> Result<(), String> {
    let _ = run_capture_command(command, limit)
        .await
        .map_err(|error| format!("{error_code}:{error}"))?;
    Ok(())
}

async fn run_capture(program: &str, args: &[&str], limit: Duration) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args);
    run_capture_command(&mut command, limit).await
}

async fn run_capture_path(
    program: &Path,
    args: &[&str],
    limit: Duration,
) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args);
    run_capture_command(&mut command, limit).await
}

async fn run_capture_command(command: &mut Command, limit: Duration) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = timeout(
        limit,
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "timeout".to_string())?
    .map_err(|error| error.to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&output.stderr).to_string();
    }
    if !output.status.success() {
        let compact = text.trim().chars().take(1200).collect::<String>();
        return Err(if compact.is_empty() {
            format!("exit_{:?}", output.status.code())
        } else {
            compact
        });
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standardizes_legacy_command_names() {
        assert_eq!(normalize_command("comfyui-mcp"), STANDARD_COMMAND);
        assert_eq!(normalize_command("comfy-local-mcp"), STANDARD_COMMAND);
        assert_eq!(normalize_command("comfy-mcp"), STANDARD_COMMAND);
    }

    #[test]
    fn accepts_only_python_three_ten_or_newer() {
        assert!(!python_version_supported("Python 3.9.18"));
        assert!(python_version_supported("Python 3.10.13"));
        assert!(python_version_supported("Python 3.13.5"));
    }

    #[test]
    fn normalizes_comfy_cli_envelope_to_version() {
        assert_eq!(
            normalize_cli_version(r#"{"data":{"version":"1.18.0"}}"#),
            "1.18.0"
        );
        assert_eq!(
            normalize_cli_version("comfy version 1.18.0"),
            "comfy version 1.18.0"
        );
    }
}
