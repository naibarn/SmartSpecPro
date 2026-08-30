//! Constrained SSH local-forward lifecycle for ComfyUI MCP.
//!
//! SSH configuration is stored as argument data, never as a shell command.
//! The tunnel owns its child process and is dropped after the MCP operation.

use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

static SSH_TUNNEL_ACTIVE: AtomicBool = AtomicBool::new(false);

pub struct SshTunnelProcess { child: Child, key_path: Option<PathBuf> }

impl Drop for SshTunnelProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(path) = self.key_path.as_ref() { let _ = fs::remove_file(path); }
        SSH_TUNNEL_ACTIVE.store(false, Ordering::Release);
    }
}

pub fn validate_args(args: &[String]) -> Result<(), String> {
    if args.is_empty() || args.iter().any(|arg| arg.is_empty() || arg.len() > 512 || arg.chars().any(|ch| ch.is_control())) {
        return Err("comfy_ssh_args_invalid".into());
    }
    if args.iter().any(|arg| arg == "-R" || arg == "-D" || arg == "-i" || arg == "-oProxyCommand" || arg == "ProxyCommand" || arg.contains("ProxyCommand=") || arg.contains("StrictHostKeyChecking=no")) {
        return Err("comfy_ssh_forwarding_option_forbidden".into());
    }
    let mut has_forward = false;
    let mut has_fail_closed = false;
    let mut has_no_command = false;
    let mut has_host_key_check = false;
    let mut has_known_hosts = false;
    for (index, arg) in args.iter().enumerate() {
        if arg == "-N" { has_no_command = true; continue; }
        if arg == "-L" {
            let spec = args.get(index + 1).ok_or("comfy_ssh_forwarding_target_missing")?;
            validate_forward_spec(spec)?;
            has_forward = true;
        } else if let Some(spec) = arg.strip_prefix("-L") {
            validate_forward_spec(spec)?;
            has_forward = true;
        }
        if arg == "-o" && args.get(index + 1).is_some_and(|value| value == "ExitOnForwardFailure=yes") { has_fail_closed = true; }
        if arg == "ExitOnForwardFailure=yes" { has_fail_closed = true; }
        if arg == "-o" && args.get(index + 1).is_some_and(|value| value == "StrictHostKeyChecking=yes") { has_host_key_check = true; }
        if arg == "StrictHostKeyChecking=yes" { has_host_key_check = true; }
        if arg.starts_with("UserKnownHostsFile=") && arg.len() > "UserKnownHostsFile=".len() { has_known_hosts = true; }
    }
    if !has_forward || !has_fail_closed || !has_no_command || !has_host_key_check || !has_known_hosts { return Err("comfy_ssh_forwarding_not_fail_closed".into()); }
    Ok(())
}

fn validate_forward_spec(spec: &str) -> Result<(), String> {
    let parts: Vec<&str> = spec.split(':').collect();
    if parts.len() != 4 || parts[0] != "127.0.0.1" || parts[2] != "127.0.0.1" || parts[1].parse::<u16>().is_err() || parts[3].parse::<u16>().is_err() {
        return Err("comfy_ssh_forwarding_target_invalid".into());
    }
    if parts[1].parse::<u16>().unwrap_or(0) < 1 || parts[3].parse::<u16>().unwrap_or(0) < 1 { return Err("comfy_ssh_forwarding_port_invalid".into()); }
    Ok(())
}

pub fn open(args: &[String]) -> Result<SshTunnelProcess, String> {
    open_inner(args, None, true)
}

/// Resolves an SSH private key inside the native process and places it in a
/// short-lived 0600 file solely for OpenSSH. The file is removed with the
/// tunnel process; the key never enters a job payload or WebView.
pub fn open_with_identity(args: &[String], private_key: &str) -> Result<SshTunnelProcess, String> {
    validate_args(args)?;
    if private_key.trim().is_empty() || private_key.len() > 64 * 1024 { return Err("comfy_ssh_identity_invalid".into()); }
    let path = std::env::temp_dir().join(format!("smartaihub-comfy-ssh-{}-{}.key", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "comfy_ssh_identity_invalid")?.as_nanos()));
    fs::write(&path, private_key).map_err(|_| "comfy_ssh_identity_write_failed".to_string())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|_| "comfy_ssh_identity_permissions_failed".to_string())?; }
    let mut command_args = args.to_vec();
    command_args.extend(["-i".to_string(), path.to_string_lossy().to_string()]);
    match open_inner(&command_args, Some(path.clone()), false) {
        Ok(tunnel) => Ok(tunnel),
        Err(error) => { let _ = fs::remove_file(path); Err(error) }
    }
}

fn open_inner(args: &[String], key_path: Option<PathBuf>, validate: bool) -> Result<SshTunnelProcess, String> {
    if validate { validate_args(args)?; }
    if SSH_TUNNEL_ACTIVE.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
        return Err("comfy_ssh_tunnel_busy".into());
    }
    let mut child = match Command::new("ssh")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn() {
        Ok(child) => child,
        Err(_) => {
            SSH_TUNNEL_ACTIVE.store(false, Ordering::Release);
            return Err("comfy_ssh_unavailable".into());
        }
    };
    thread::sleep(Duration::from_millis(250));
    match child.try_wait() {
        Ok(None) => {}
        Ok(Some(_)) => {
            SSH_TUNNEL_ACTIVE.store(false, Ordering::Release);
            return Err("comfy_ssh_tunnel_exited".into());
        }
        Err(_) => {
            SSH_TUNNEL_ACTIVE.store(false, Ordering::Release);
            return Err("comfy_ssh_status_failed".into());
        }
    }
    Ok(SshTunnelProcess { child, key_path })
}

#[cfg(test)]
mod tests {
    #[test]
    fn requires_restricted_forwarding_and_fail_closed_option() {
        let args = vec!["-N".into(), "-o".into(), "ExitOnForwardFailure=yes".into(), "-o".into(), "StrictHostKeyChecking=yes".into(), "-o".into(), "UserKnownHostsFile=/tmp/known_hosts".into(), "-L".into(), "127.0.0.1:8188:127.0.0.1:8188".into(), "user@example.test".into()];
        assert!(super::validate_args(&args).is_ok());
        assert!(super::validate_args(&["-N".into(), "-L".into(), "0.0.0.0:8188:127.0.0.1:8188".into()]).is_err());
        assert!(super::validate_args(&["-N".into(), "-R".into(), "8188:127.0.0.1:8188".into()]).is_err());
    }
}
