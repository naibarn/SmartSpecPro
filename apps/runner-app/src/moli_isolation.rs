//! Fail-closed building blocks for a future Moli Runner adapter.
//!
//! The namespace launcher below is test-only and cannot be used by Runner
//! production code. This module does not launch Moli for tenant work or claim
//! to sandbox it. Production execution remains unavailable until an approved
//! isolated runtime supplies filesystem and artifact boundaries.

use sha2::{Digest, Sha256};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
#[cfg(all(target_os = "linux", test))]
use std::process::{Child, Command, Stdio};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovedNetworkTarget {
    host: String,
    addresses: Vec<IpAddr>,
}

impl ApprovedNetworkTarget {
    /// The caller must connect to one of these exact validated addresses and
    /// retain that pin for the request. Resolving `host` again would reopen a
    /// DNS-rebinding gap.
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn pinned_addresses(&self) -> &[IpAddr] {
        &self.addresses
    }
}

/// Rejects local names and requires a complete, already-resolved public
/// address set. This is a policy primitive; it does not perform DNS or open a
/// socket, so callers must connect through `pinned_addresses()`.
pub fn approve_network_target(
    host: &str,
    resolved_addresses: &[IpAddr],
) -> Result<ApprovedNetworkTarget, String> {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty()
        || normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
        || normalized.ends_with(".internal")
        || is_legacy_numeric_address(&normalized)
        || !valid_dns_name(&normalized)
    {
        return Err("RUNNER_MOLI_NETWORK_HOST_BLOCKED".into());
    }

    if resolved_addresses.is_empty() || resolved_addresses.iter().any(|ip| !is_public_ip(*ip)) {
        return Err("RUNNER_MOLI_NETWORK_ADDRESS_BLOCKED".into());
    }
    if let Ok(literal) = normalized.parse::<IpAddr>() {
        if resolved_addresses != [literal] {
            return Err("RUNNER_MOLI_NETWORK_ADDRESS_BLOCKED".into());
        }
    }

    Ok(ApprovedNetworkTarget {
        host: normalized,
        addresses: resolved_addresses.to_vec(),
    })
}

/// Binds a protocol listener only on an explicit loopback address. Moli is
/// not wired to this helper yet; adapters must use it for any Runner-owned
/// CDP, WebDriver, or BiDi endpoint.
pub fn bind_loopback_listener(address: SocketAddr) -> Result<TcpListener, String> {
    if !address.ip().is_loopback() {
        return Err("RUNNER_MOLI_PROTOCOL_LISTENER_NOT_LOOPBACK".into());
    }
    TcpListener::bind(address).map_err(|_| "RUNNER_MOLI_PROTOCOL_LISTENER_BIND_FAILED".into())
}

#[cfg(test)]
const MAX_MOLI_ARGUMENTS: usize = 32;
#[cfg(test)]
const MAX_MOLI_ARGUMENT_BYTES: usize = 2048;
#[cfg(test)]
const MAX_MOLI_ENVIRONMENT: usize = 4;
#[cfg(test)]
const MAX_MOLI_ENVIRONMENT_VALUE_BYTES: usize = 1024;
#[cfg(test)]
const NAMESPACE_PROBE_ENV: &str = "SAH_MOLI_NAMESPACE_TEST";

/// Test-only exercise of Linux user and network namespace creation. It is
/// unavailable in production builds and provides no filesystem sandbox: the
/// process retains the test runner UID's filesystem access. It must never be
/// used for tenant work.
#[cfg(all(target_os = "linux", test))]
pub fn spawn_isolated_moli_command(
    data_root: &Path,
    tenant_id: &str,
    attempt_id: &str,
    program: &Path,
    args: &[String],
    environment: &[(String, String)],
) -> Result<IsolatedMoliProcess, String> {
    validate_moli_command(program, args, environment)?;
    let profile = MoliAttemptProfile::prepare(data_root, tenant_id, attempt_id)?;
    let profile_path = profile.path().to_path_buf();
    let tmp_path = profile_path.join("tmp");
    let cache_path = profile_path.join("cache");
    let config_path = profile_path.join("config");
    let data_path = profile_path.join("data");
    for path in [&tmp_path, &cache_path, &config_path, &data_path] {
        create_private_directory_exclusive(path)?;
    }

    let process_spec = crate::process::ProcessSpec {
        program: program.to_path_buf(),
        args: args.to_vec(),
        working_directory: profile_path.clone(),
        environment: environment.to_vec(),
    };
    process_spec.validate()?;

    let launcher = find_unshare_launcher()?;
    let mut command = Command::new(launcher);
    command
        .args([
            "--user",
            "--map-root-user",
            "--net",
            "--fork",
            "--kill-child=SIGKILL",
            "--",
        ])
        .arg(program)
        .args(args)
        .current_dir(&profile_path)
        .env_clear()
        .env("HOME", &profile_path)
        .env("TMPDIR", &tmp_path)
        .env("XDG_CACHE_HOME", &cache_path)
        .env("XDG_CONFIG_HOME", &config_path)
        .env("XDG_DATA_HOME", &data_path)
        .envs(environment.iter().map(|(key, value)| (key, value)))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if environment
        .iter()
        .any(|(key, value)| key == NAMESPACE_PROBE_ENV && value == "1")
    {
        use std::os::unix::fs::MetadataExt;
        let parent_user_ns = std::fs::metadata("/proc/self/ns/user")
            .map_err(|_| "RUNNER_MOLI_NAMESPACE_PROBE_FAILED".to_string())?
            .ino();
        let parent_net_ns = std::fs::metadata("/proc/self/ns/net")
            .map_err(|_| "RUNNER_MOLI_NAMESPACE_PROBE_FAILED".to_string())?
            .ino();
        command
            .env("SAH_MOLI_PARENT_USERNS_INODE", parent_user_ns.to_string())
            .env("SAH_MOLI_PARENT_NETNS_INODE", parent_net_ns.to_string());
    }
    use std::os::unix::process::CommandExt;
    command.process_group(0);
    let child = command
        .spawn()
        .map_err(|_| "RUNNER_MOLI_NAMESPACE_SPAWN_FAILED".to_string())?;
    let process_group_id = child.id() as libc::pid_t;
    Ok(IsolatedMoliProcess {
        child: Some(child),
        process_group_id,
        profile: Some(profile),
    })
}

/// Non-Linux test hosts cannot supply the namespace boundary.
#[cfg(all(not(target_os = "linux"), test))]
pub fn spawn_isolated_moli_command(
    _data_root: &Path,
    _tenant_id: &str,
    _attempt_id: &str,
    _program: &Path,
    _args: &[String],
    _environment: &[(String, String)],
) -> Result<IsolatedMoliProcess, String> {
    Err("RUNNER_MOLI_LINUX_NAMESPACES_REQUIRED".into())
}

#[cfg(all(target_os = "linux", test))]
#[derive(Debug)]
pub struct IsolatedMoliProcess {
    child: Option<Child>,
    process_group_id: libc::pid_t,
    profile: Option<MoliAttemptProfile>,
}

#[cfg(all(not(target_os = "linux"), test))]
#[derive(Debug)]
pub struct IsolatedMoliProcess;

#[cfg(all(target_os = "linux", test))]
impl IsolatedMoliProcess {
    pub fn profile_path(&self) -> Option<&Path> {
        self.profile.as_ref().map(MoliAttemptProfile::path)
    }

    pub fn try_status(&mut self) -> Result<Option<i32>, String> {
        let child = self
            .child
            .as_mut()
            .ok_or_else(|| "RUNNER_MOLI_PROCESS_HANDLE_CLOSED".to_string())?;
        let status = child
            .try_wait()
            .map_err(|_| "RUNNER_MOLI_PROCESS_STATUS_FAILED".to_string())?;
        if let Some(status) = status {
            self.terminate_group()?;
            self.cleanup_profile()?;
            Ok(Some(status.code().unwrap_or(-1)))
        } else {
            Ok(None)
        }
    }

    pub fn cancel(&mut self) -> Result<(), String> {
        self.terminate_group()?;
        if let Some(child) = self.child.as_mut() {
            let _ = child.wait();
        }
        self.cleanup_profile()
    }

    fn terminate_group(&mut self) -> Result<(), String> {
        let group = -self.process_group_id;
        let term_result = unsafe { libc::kill(group, libc::SIGTERM) };
        if term_result != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err("RUNNER_MOLI_PROCESS_TERMINATE_FAILED".into());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
        let kill_result = unsafe { libc::kill(group, libc::SIGKILL) };
        if kill_result != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err("RUNNER_MOLI_PROCESS_TERMINATE_FAILED".into());
            }
        }
        Ok(())
    }

    fn cleanup_profile(&mut self) -> Result<(), String> {
        if let Some(profile) = self.profile.as_mut() {
            profile.cleanup()?;
            self.profile = None;
        }
        Ok(())
    }
}

#[cfg(all(target_os = "linux", test))]
impl Drop for IsolatedMoliProcess {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

#[cfg(all(target_os = "linux", test))]
fn validate_moli_command(
    program: &Path,
    args: &[String],
    environment: &[(String, String)],
) -> Result<(), String> {
    if args.len() > MAX_MOLI_ARGUMENTS
        || args
            .iter()
            .any(|arg| arg.len() > MAX_MOLI_ARGUMENT_BYTES || arg.contains('\0'))
    {
        return Err("RUNNER_MOLI_ARGUMENTS_INVALID".into());
    }
    if environment.len() > MAX_MOLI_ENVIRONMENT {
        return Err("RUNNER_MOLI_ENVIRONMENT_INVALID".into());
    }
    for (key, value) in environment {
        let allowed_key = matches!(key.as_str(), "LANG" | "LC_ALL" | "LC_CTYPE" | "TZ")
            || (cfg!(test) && key == NAMESPACE_PROBE_ENV);
        if !allowed_key
            || value.len() > MAX_MOLI_ENVIRONMENT_VALUE_BYTES
            || value.contains('\0')
            || key.contains('\0')
        {
            return Err("RUNNER_MOLI_ENVIRONMENT_INVALID".into());
        }
    }
    if !program.is_absolute() || !program.is_file() {
        return Err("RUNNER_MOLI_PROGRAM_INVALID".into());
    }
    Ok(())
}

#[cfg(all(target_os = "linux", test))]
fn find_unshare_launcher() -> Result<PathBuf, String> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    for path in [Path::new("/usr/bin/unshare"), Path::new("/bin/unshare")] {
        let Ok(metadata) = std::fs::symlink_metadata(path) else {
            continue;
        };
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.uid() != 0
            || metadata.permissions().mode() & 0o022 != 0
            || metadata.permissions().mode() & 0o111 == 0
        {
            continue;
        }
        return std::fs::canonicalize(path)
            .map_err(|_| "RUNNER_MOLI_NAMESPACE_TOOL_UNAVAILABLE".to_string());
    }
    Err("RUNNER_MOLI_NAMESPACE_TOOL_UNAVAILABLE".into())
}

/// Creates one private profile directory per tenant/attempt pair. `data_root`
/// must be an existing absolute directory owned by the Runner's effective UID,
/// with no group/other write bits; its ancestors are assumed to be controlled
/// by the host administrator. The pair is hashed so raw tenant identifiers
/// are not exposed in filesystem paths. Reusing an active scope fails instead
/// of sharing browser state.
#[derive(Debug)]
pub struct MoliAttemptProfile {
    path: PathBuf,
    cleaned: bool,
}

impl MoliAttemptProfile {
    #[cfg(unix)]
    pub fn prepare(data_root: &Path, tenant_id: &str, attempt_id: &str) -> Result<Self, String> {
        if tenant_id.trim().is_empty() || attempt_id.trim().is_empty() {
            return Err("RUNNER_MOLI_PROFILE_SCOPE_REQUIRED".into());
        }

        let data_root = validate_data_root(data_root)?;
        let base = data_root.join("moli-attempt-profiles");
        create_private_directory(&base)?;
        let base = std::fs::canonicalize(&base)
            .map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
        let scope = scope_digest(tenant_id, attempt_id);
        let path = base.join(scope);
        create_private_directory_exclusive(&path)?;
        Ok(Self {
            path,
            cleaned: false,
        })
    }

    /// Standard-library filesystem APIs cannot establish a private Windows
    /// ACL. Fail closed until the approved runtime supplies that boundary.
    #[cfg(not(unix))]
    pub fn prepare(_data_root: &Path, _tenant_id: &str, _attempt_id: &str) -> Result<Self, String> {
        Err("RUNNER_MOLI_PROFILE_ACL_UNSUPPORTED".into())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Removes this attempt's profile and reports cleanup failures to the
    /// caller. Drop also retries best-effort cleanup as a safety net.
    pub fn cleanup(&mut self) -> Result<(), String> {
        if self.cleaned {
            return Ok(());
        }
        std::fs::remove_dir_all(&self.path)
            .map_err(|_| "RUNNER_MOLI_PROFILE_CLEANUP_FAILED".to_string())?;
        self.cleaned = true;
        Ok(())
    }
}

impl Drop for MoliAttemptProfile {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

#[cfg(unix)]
fn create_private_directory(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};

    if !path.exists() {
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(false).mode(0o700);
        builder
            .create(path)
            .map_err(|_| "RUNNER_MOLI_PROFILE_CREATE_FAILED".to_string())?;
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_dir()
        || metadata.permissions().mode() & 0o700 != 0o700
        || metadata.permissions().mode() & 0o077 != 0
    {
        return Err("RUNNER_MOLI_PROFILE_PERMISSIONS_INVALID".into());
    }
    Ok(())
}

#[cfg(unix)]
fn validate_data_root(path: &Path) -> Result<PathBuf, String> {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    if !path.is_absolute() {
        return Err("RUNNER_MOLI_PROFILE_ROOT_INVALID".into());
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("RUNNER_MOLI_PROFILE_ROOT_INVALID".into());
    }
    // SAFETY: `geteuid` has no pointer arguments and only reads process credentials.
    let effective_uid = unsafe { libc::geteuid() };
    if metadata.permissions().mode() & 0o022 != 0 || metadata.uid() != effective_uid {
        return Err("RUNNER_MOLI_PROFILE_ROOT_PERMISSIONS_INVALID".into());
    }
    let canonical =
        std::fs::canonicalize(path).map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
    let canonical_metadata = std::fs::symlink_metadata(&canonical)
        .map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
    if canonical_metadata.file_type().is_symlink()
        || !canonical_metadata.is_dir()
        || canonical_metadata.dev() != metadata.dev()
        || canonical_metadata.ino() != metadata.ino()
        || canonical_metadata.uid() != effective_uid
        || canonical_metadata.permissions().mode() & 0o022 != 0
    {
        return Err("RUNNER_MOLI_PROFILE_ROOT_INVALID".into());
    }
    Ok(canonical)
}

#[cfg(unix)]
fn create_private_directory_exclusive(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};

    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(false).mode(0o700);
    builder
        .create(path)
        .map_err(|_| "RUNNER_MOLI_PROFILE_CREATE_FAILED".to_string())?;
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "RUNNER_MOLI_PROFILE_ROOT_INVALID".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_dir()
        || metadata.permissions().mode() & 0o700 != 0o700
        || metadata.permissions().mode() & 0o077 != 0
    {
        let _ = std::fs::remove_dir(path);
        return Err("RUNNER_MOLI_PROFILE_PERMISSIONS_INVALID".into());
    }
    Ok(())
}

fn scope_digest(tenant_id: &str, attempt_id: &str) -> String {
    let mut digest = Sha256::new();
    digest.update((tenant_id.len() as u64).to_le_bytes());
    digest.update(tenant_id.as_bytes());
    digest.update((attempt_id.len() as u64).to_le_bytes());
    digest.update(attempt_id.as_bytes());
    format!("{:x}", digest.finalize())
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || octets[0] == 0
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        || (octets[0] == 192 && octets[1] == 88 && octets[2] == 99)
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
        || (octets[0] == 198
            && matches!(octets[1], 18 | 19 | 51)
            && (octets[1] != 51 || octets[2] == 100))
        || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
        || octets[0] >= 240)
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    let segments = ip.segments();
    let global_unicast = segments[0] & 0xe000 == 0x2000;
    let well_known_nat64 = segments[..6] == [0x0064, 0xff9b, 0, 0, 0, 0]; // 64:ff9b::/96
    let local_use_nat64 = segments[0] == 0x0064 && segments[1] == 0xff9b && segments[2] == 1; // 64:ff9b:1::/48
    let ietf_protocol_assignment = segments[0] == 0x2001 && segments[1] & 0xfe00 == 0; // 2001::/23
    let documentation = segments[0] == 0x3fff && segments[1] & 0xf000 == 0; // 3fff::/20
    !(!global_unicast
        || ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || ip.is_multicast()
        || well_known_nat64
        || local_use_nat64
        || ietf_protocol_assignment
        || documentation
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        || segments[0] == 0x2002)
}

fn valid_dns_name(host: &str) -> bool {
    if host.len() > 253 || host.is_empty() {
        return false;
    }
    host.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            && label.as_bytes()[0] != b'-'
            && label.as_bytes()[label.len() - 1] != b'-'
    })
}

fn is_legacy_numeric_address(host: &str) -> bool {
    host.split('.').all(|label| {
        (!label.is_empty() && label.bytes().all(|byte| byte.is_ascii_digit()))
            || (label.len() > 2
                && label.starts_with("0x")
                && label[2..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use std::os::unix::fs::PermissionsExt;

    fn private_tempdir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        dir
    }

    #[test]
    fn profile_is_private_tenant_and_attempt_scoped_and_cleaned() {
        let root = private_tempdir();
        let mut first = MoliAttemptProfile::prepare(root.path(), "tenant-a", "attempt-1").unwrap();
        let second = MoliAttemptProfile::prepare(root.path(), "tenant-b", "attempt-1").unwrap();
        assert_ne!(first.path(), second.path());
        assert!(!first.path().to_string_lossy().contains("tenant-a"));
        assert_eq!(
            std::fs::metadata(first.path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            MoliAttemptProfile::prepare(root.path(), "tenant-a", "attempt-1").unwrap_err(),
            "RUNNER_MOLI_PROFILE_CREATE_FAILED"
        );

        let first_path = first.path().to_path_buf();
        first.cleanup().unwrap();
        assert!(!first_path.exists());
        assert!(second.path().is_dir());
    }

    #[test]
    fn profile_rejects_empty_scope_and_insecure_or_symlink_root() {
        let root = private_tempdir();
        assert_eq!(
            MoliAttemptProfile::prepare(root.path(), " ", "attempt").unwrap_err(),
            "RUNNER_MOLI_PROFILE_SCOPE_REQUIRED"
        );

        let base = root.path().join("moli-attempt-profiles");
        std::fs::create_dir(&base).unwrap();
        std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(
            MoliAttemptProfile::prepare(root.path(), "tenant", "attempt").unwrap_err(),
            "RUNNER_MOLI_PROFILE_PERMISSIONS_INVALID"
        );

        let linked_root = private_tempdir();
        let target = linked_root.path().join("private-target");
        std::fs::create_dir(&target).unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o700)).unwrap();
        std::os::unix::fs::symlink(&target, linked_root.path().join("moli-attempt-profiles"))
            .unwrap();
        assert_eq!(
            MoliAttemptProfile::prepare(linked_root.path(), "tenant", "attempt").unwrap_err(),
            "RUNNER_MOLI_PROFILE_PERMISSIONS_INVALID"
        );
    }

    #[test]
    fn profile_rejects_insecure_symlink_and_relative_data_roots() {
        let insecure_root = tempfile::tempdir().unwrap();
        std::fs::set_permissions(insecure_root.path(), std::fs::Permissions::from_mode(0o777))
            .unwrap();
        assert_eq!(
            MoliAttemptProfile::prepare(insecure_root.path(), "tenant", "attempt").unwrap_err(),
            "RUNNER_MOLI_PROFILE_ROOT_PERMISSIONS_INVALID"
        );

        let link_parent = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let linked_root = link_parent.path().join("data-root");
        std::os::unix::fs::symlink(target.path(), &linked_root).unwrap();
        assert_eq!(
            MoliAttemptProfile::prepare(&linked_root, "tenant", "attempt").unwrap_err(),
            "RUNNER_MOLI_PROFILE_ROOT_INVALID"
        );
        assert_eq!(
            MoliAttemptProfile::prepare(Path::new("relative-data-root"), "tenant", "attempt")
                .unwrap_err(),
            "RUNNER_MOLI_PROFILE_ROOT_INVALID"
        );
    }

    #[test]
    fn network_policy_blocks_local_names_private_ranges_and_mixed_dns_answers() {
        for host in [
            "localhost",
            "service.localhost",
            "printer.local",
            "db.internal",
            "2130706433",
            "0x7f.1",
        ] {
            assert_eq!(
                approve_network_target(host, &["8.8.8.8".parse().unwrap()]).unwrap_err(),
                "RUNNER_MOLI_NETWORK_HOST_BLOCKED"
            );
        }
        for address in [
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254)),
            IpAddr::V4(Ipv4Addr::new(192, 0, 0, 9)),
            IpAddr::V4(Ipv4Addr::new(198, 18, 0, 1)),
            IpAddr::V6("::1".parse().unwrap()),
            IpAddr::V6("fc00::1".parse().unwrap()),
            IpAddr::V6("::ffff:127.0.0.1".parse().unwrap()),
            IpAddr::V6("64:ff9b::a9fe:a9fe".parse().unwrap()), // NAT64 of 169.254.169.254
            IpAddr::V6("64:ff9b:1::1".parse().unwrap()),
            IpAddr::V6("2001:20::1".parse().unwrap()),
            IpAddr::V6("2001:db8::1".parse().unwrap()),
            IpAddr::V6("3fff::1".parse().unwrap()),
        ] {
            assert_eq!(
                approve_network_target("example.com", &[address]).unwrap_err(),
                "RUNNER_MOLI_NETWORK_ADDRESS_BLOCKED"
            );
        }
        assert_eq!(
            approve_network_target(
                "example.com",
                &["8.8.8.8".parse().unwrap(), "127.0.0.1".parse().unwrap()]
            )
            .unwrap_err(),
            "RUNNER_MOLI_NETWORK_ADDRESS_BLOCKED"
        );
        let approved =
            approve_network_target("EXAMPLE.COM.", &["8.8.8.8".parse().unwrap()]).unwrap();
        assert_eq!(approved.host(), "example.com");
        assert_eq!(
            approved.pinned_addresses(),
            &["8.8.8.8".parse::<IpAddr>().unwrap()]
        );
        assert!(approve_network_target("example.com", &[]).is_err());
        assert!(is_public_ipv6(
            "2001:4860:4860::8888".parse::<Ipv6Addr>().unwrap()
        ));
        assert!(is_public_ipv6(
            "2606:4700:4700::1111".parse::<Ipv6Addr>().unwrap()
        ));
    }

    #[test]
    fn protocol_listener_refuses_non_loopback_bind_and_allows_loopback() {
        assert_eq!(
            bind_loopback_listener("0.0.0.0:0".parse().unwrap()).unwrap_err(),
            "RUNNER_MOLI_PROTOCOL_LISTENER_NOT_LOOPBACK"
        );
        let listener = bind_loopback_listener("127.0.0.1:0".parse().unwrap()).unwrap();
        assert!(listener.local_addr().unwrap().ip().is_loopback());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn namespace_child_has_no_external_default_routes() {
        if !std::env::var(NAMESPACE_PROBE_ENV).is_ok_and(|value| value == "1") {
            return;
        }
        enable_loopback_for_test().unwrap();
        let loopback = bind_loopback_listener("127.0.0.1:0".parse().unwrap()).unwrap();
        assert!(loopback.local_addr().unwrap().ip().is_loopback());
        assert!(!has_external_default_route().unwrap());
        use std::os::unix::fs::MetadataExt;
        let user_ns = std::fs::metadata("/proc/self/ns/user").unwrap().ino();
        let net_ns = std::fs::metadata("/proc/self/ns/net").unwrap().ino();
        let parent_user_ns = std::env::var("SAH_MOLI_PARENT_USERNS_INODE")
            .unwrap()
            .parse::<u64>()
            .unwrap();
        let parent_net_ns = std::env::var("SAH_MOLI_PARENT_NETNS_INODE")
            .unwrap()
            .parse::<u64>()
            .unwrap();
        assert_ne!(user_ns, parent_user_ns, "user namespace was not isolated");
        assert_ne!(net_ns, parent_net_ns, "network namespace was not isolated");
        assert!(std::env::var("HOME").is_ok_and(|home| Path::new(&home).is_dir()));
        assert!(std::env::var("TMPDIR").is_ok_and(|tmp| Path::new(&tmp).is_dir()));
        assert!(std::env::var_os("SAH_MOLI_NAMESPACE_TEST_SECRET").is_none());
        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    #[cfg(target_os = "linux")]
    fn enable_loopback_for_test() -> Result<(), String> {
        use std::os::unix::fs::PermissionsExt;

        let ip = Path::new("/usr/bin/ip");
        let metadata = std::fs::symlink_metadata(ip)
            .map_err(|_| "RUNNER_MOLI_TEST_IP_TOOL_UNAVAILABLE".to_string())?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.permissions().mode() & 0o022 != 0
            || metadata.permissions().mode() & 0o111 == 0
        {
            return Err("RUNNER_MOLI_TEST_IP_TOOL_UNTRUSTED".into());
        }
        let output = Command::new(ip)
            .args(["link", "set", "lo", "up"])
            .output()
            .map_err(|_| "RUNNER_MOLI_TEST_LOOPBACK_SETUP_FAILED".to_string())?;
        if !output.status.success() {
            return Err(format!(
                "RUNNER_MOLI_TEST_LOOPBACK_SETUP_FAILED: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_spawn_uses_user_network_namespaces_private_profile_and_group_cleanup() {
        let root = private_tempdir();
        let test_binary = std::env::current_exe().unwrap();
        let args = vec![
            "--exact".to_string(),
            "moli_isolation::tests::namespace_child_has_no_external_default_routes".to_string(),
            "--nocapture".to_string(),
        ];
        std::env::set_var("SAH_MOLI_NAMESPACE_TEST_SECRET", "must-not-inherit");
        let process_result = spawn_isolated_moli_command(
            root.path(),
            "tenant-fixture",
            "attempt-fixture",
            &test_binary,
            &args,
            &[(NAMESPACE_PROBE_ENV.into(), "1".into())],
        );
        std::env::remove_var("SAH_MOLI_NAMESPACE_TEST_SECRET");
        let mut process = process_result.unwrap();
        let profile_path = process.profile_path().unwrap().to_path_buf();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let status = loop {
            if let Some(status) = process.try_status().unwrap() {
                break status;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "namespace child timed out"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        };
        assert_eq!(status, 0);
        assert!(!profile_path.exists());

        let mut sleeper = spawn_isolated_moli_command(
            root.path(),
            "tenant-fixture",
            "attempt-cancel",
            Path::new("/bin/sh"),
            &["-c".into(), "sleep 30 & wait".into()],
            &[],
        )
        .unwrap();
        let sleeper_profile = sleeper.profile_path().unwrap().to_path_buf();
        assert!(sleeper.try_status().unwrap().is_none());
        sleeper.cancel().unwrap();
        assert!(!sleeper_profile.exists());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_spawn_bounds_arguments_and_environment() {
        let too_many_args = vec!["arg".to_string(); MAX_MOLI_ARGUMENTS + 1];
        assert_eq!(
            validate_moli_command(Path::new("/bin/true"), &too_many_args, &[]).unwrap_err(),
            "RUNNER_MOLI_ARGUMENTS_INVALID"
        );
        assert_eq!(
            validate_moli_command(
                Path::new("/bin/true"),
                &[],
                &[("HOME".into(), "/tmp".into())]
            )
            .unwrap_err(),
            "RUNNER_MOLI_ENVIRONMENT_INVALID"
        );
        assert_eq!(
            validate_moli_command(
                Path::new("/bin/true"),
                &[],
                &[(
                    "LANG".into(),
                    "x".repeat(MAX_MOLI_ENVIRONMENT_VALUE_BYTES + 1)
                )]
            )
            .unwrap_err(),
            "RUNNER_MOLI_ENVIRONMENT_INVALID"
        );
    }
}

#[cfg(all(test, target_os = "linux"))]
fn has_external_default_route() -> Result<bool, String> {
    let ipv4 = std::fs::read_to_string("/proc/net/route")
        .map_err(|_| "RUNNER_MOLI_ROUTE_TABLE_UNAVAILABLE".to_string())?;
    for line in ipv4.lines().skip(1) {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() > 7
            && fields[0] != "lo"
            && fields[1] == "00000000"
            && fields[7] == "00000000"
        {
            return Ok(true);
        }
    }

    let ipv6 = std::fs::read_to_string("/proc/net/ipv6_route")
        .map_err(|_| "RUNNER_MOLI_ROUTE_TABLE_UNAVAILABLE".to_string())?;
    for line in ipv6.lines() {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() > 9
            && fields[0] == "00000000000000000000000000000000"
            && fields[1] == "00"
            && fields[9] != "lo"
        {
            return Ok(true);
        }
    }
    Ok(false)
}
