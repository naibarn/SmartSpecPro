//! Fail-closed building blocks for a future Moli Runner adapter.
//!
//! This module does not launch Moli or claim to sandbox it. Production Moli
//! execution remains unavailable until an approved isolated runtime consumes
//! these profile and network-policy primitives.

use sha2::{Digest, Sha256};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener};
use std::path::{Path, PathBuf};

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

/// Creates one private profile directory per tenant/attempt pair. The pair is
/// hashed so raw tenant identifiers are not exposed in filesystem paths.
/// Reusing an active scope fails instead of sharing browser state.
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

    #[test]
    fn profile_is_private_tenant_and_attempt_scoped_and_cleaned() {
        let root = tempfile::tempdir().unwrap();
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
        let root = tempfile::tempdir().unwrap();
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

        let linked_root = tempfile::tempdir().unwrap();
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
}
