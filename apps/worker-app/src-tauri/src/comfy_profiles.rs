//! Worker-local, non-secret Comfy connection profiles.
//!
//! Credentials are deliberately represented only by a secure-store reference.
//! The profile file is safe to persist and project to the WebView; secret
//! values must be resolved by `credentials.rs` at the moment a transport is
//! opened.

use crate::comfy_mcp_client::validate_command;
use crate::comfy_ssh_tunnel::validate_args as validate_ssh_args;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const PROFILE_FILE_NAME: &str = "comfy-profiles.json";
const PROFILE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComfyTransportKind {
    LocalStdio,
    SelfHostedStdioBridge,
    SelfHostedHttpMcp,
    ComfyCloud,
    SshTunnel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComfyCredentialKind {
    None,
    ApiKey,
    OAuth,
    SshKeychainRef,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyConnectionProfile {
    pub profile_id: String,
    pub worker_id: String,
    pub display_name: String,
    pub transport: ComfyTransportKind,
    /// For HTTP this is the MCP endpoint. For SSH this is a redacted host
    /// label. It is never a path supplied to a child process.
    pub endpoint: Option<String>,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub credential_kind: ComfyCredentialKind,
    pub credential_ref: Option<String>,
    pub enabled: bool,
    pub profile_revision: u64,
    pub permission_revision: u64,
    pub policy_revision: u64,
    pub projection_revision: u64,
    pub expires_at: Option<String>,
    pub last_probe_at: Option<String>,
    pub last_probe_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ComfyProfileProjection {
    pub profile_id: String,
    pub worker_id: String,
    pub display_name: String,
    pub transport: ComfyTransportKind,
    pub endpoint_label: String,
    /// Safe endpoint value for editing. Profile validation forbids query,
    /// fragment, userinfo, and non-loopback HTTP, so this contains no secret.
    pub endpoint: Option<String>,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub credential_kind: ComfyCredentialKind,
    pub credential_ref: Option<String>,
    pub credential_configured: bool,
    pub enabled: bool,
    pub profile_revision: u64,
    pub permission_revision: u64,
    pub policy_revision: u64,
    pub projection_revision: u64,
    pub expires_at: Option<String>,
    pub last_probe_at: Option<String>,
    pub last_probe_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PersistedProfiles {
    schema_version: u32,
    active_profile_id: Option<String>,
    profiles: Vec<ComfyConnectionProfile>,
}

impl Default for PersistedProfiles {
    fn default() -> Self {
        Self { schema_version: PROFILE_SCHEMA_VERSION, active_profile_id: None, profiles: Vec::new() }
    }
}

impl ComfyConnectionProfile {
    pub fn validate(&self) -> Result<(), String> {
        if !is_safe_id(&self.profile_id) || !is_safe_id(&self.worker_id) {
            return Err("comfy_profile_id_invalid".into());
        }
        if self.display_name.trim().is_empty() || self.display_name.len() > 160 {
            return Err("comfy_profile_display_name_invalid".into());
        }
        if self.profile_revision == 0 || self.permission_revision == 0 || self.policy_revision == 0 || self.projection_revision == 0 {
            return Err("comfy_profile_revision_invalid".into());
        }
        match self.transport {
            ComfyTransportKind::LocalStdio => {
                let command = self.command.as_deref().ok_or("comfy_profile_command_missing")?;
                validate_command(command).map_err(|_| "comfy_profile_command_invalid".to_string())?;
                if self.endpoint.is_some() { return Err("comfy_local_stdio_endpoint_forbidden".into()); }
            }
            ComfyTransportKind::SelfHostedStdioBridge => {
                self.endpoint.as_deref().filter(|v| !v.trim().is_empty()).ok_or("comfy_bridge_endpoint_missing")?;
                let command = self.command.as_deref().ok_or("comfy_profile_command_missing")?;
                validate_command(command).map_err(|_| "comfy_profile_command_invalid".to_string())?;
                if !self.args.iter().any(|arg| arg.contains("{endpoint}")) {
                    return Err("comfy_bridge_endpoint_placeholder_missing".into());
                }
            }
            ComfyTransportKind::SelfHostedHttpMcp => validate_http_endpoint(self.endpoint.as_deref(), false)?,
            ComfyTransportKind::ComfyCloud => validate_http_endpoint(self.endpoint.as_deref(), true)?,
            ComfyTransportKind::SshTunnel => {
                let endpoint = self.endpoint.as_deref().ok_or("comfy_ssh_host_invalid")?;
                if !(endpoint.starts_with("http://127.0.0.1:") || endpoint.starts_with("http://localhost:") || endpoint.starts_with("http://[::1]:")) {
                    return Err("comfy_ssh_local_endpoint_required".into());
                }
                if self.credential_kind != ComfyCredentialKind::SshKeychainRef {
                    return Err("comfy_ssh_credential_required".into());
                }
                validate_ssh_args(&self.args)?;
            }
        }
        if self.credential_kind != ComfyCredentialKind::None && self.credential_ref.as_deref().is_none_or(str::is_empty) {
            return Err("comfy_credential_ref_missing".into());
        }
        if self.credential_kind == ComfyCredentialKind::None && self.credential_ref.is_some() {
            return Err("comfy_credential_ref_forbidden".into());
        }
        Ok(())
    }

    pub fn projection(&self) -> ComfyProfileProjection {
        ComfyProfileProjection {
            profile_id: self.profile_id.clone(),
            worker_id: self.worker_id.clone(),
            display_name: self.display_name.clone(),
            transport: self.transport.clone(),
            endpoint_label: self.endpoint.as_deref().map(redact_endpoint).unwrap_or_else(|| "local process".into()),
            endpoint: self.endpoint.clone(),
            command: self.command.clone(),
            args: self.args.clone(),
            credential_kind: self.credential_kind.clone(),
            credential_ref: self.credential_ref.clone(),
            credential_configured: self.credential_kind == ComfyCredentialKind::None || self.credential_ref.is_some(),
            enabled: self.enabled,
            profile_revision: self.profile_revision,
            permission_revision: self.permission_revision,
            policy_revision: self.policy_revision,
            projection_revision: self.projection_revision,
            expires_at: self.expires_at.clone(),
            last_probe_at: self.last_probe_at.clone(),
            last_probe_status: self.last_probe_status.clone(),
        }
    }
}

/// Resolves the bridge target as one argv value. Shell interpolation is never
/// used; requiring an explicit placeholder prevents a saved remote endpoint
/// from being silently ignored by the child process.
pub fn resolve_bridge_args(args: &[String], endpoint: &str) -> Result<Vec<String>, String> {
    if endpoint.trim().is_empty() {
        return Err("comfy_bridge_endpoint_missing".into());
    }
    if !args.iter().any(|arg| arg.contains("{endpoint}")) {
        return Err("comfy_bridge_endpoint_placeholder_missing".into());
    }
    Ok(args.iter().map(|arg| arg.replace("{endpoint}", endpoint)).collect())
}

#[derive(Debug, Clone, Default)]
pub struct ComfyProfileStore {
    data: PersistedProfiles,
    path: Option<PathBuf>,
}

impl ComfyProfileStore {
    pub fn load(app_data_dir: &Path) -> Result<Self, String> {
        let path = app_data_dir.join(PROFILE_FILE_NAME);
        if !path.exists() { return Ok(Self { data: PersistedProfiles::default(), path: Some(path) }); }
        let raw = fs::read_to_string(&path).map_err(|_| "comfy_profiles_read_failed".to_string())?;
        let mut data: PersistedProfiles = serde_json::from_str(&raw).map_err(|_| "comfy_profiles_invalid".to_string())?;
        for profile in &mut data.profiles {
            if matches!(profile.transport, ComfyTransportKind::LocalStdio) {
                if let Some(command) = profile.command.as_mut() {
                    *command = crate::comfy_mcp_runtime::normalize_command(command);
                }
            }
        }
        if data.schema_version != PROFILE_SCHEMA_VERSION { return Err("comfy_profiles_schema_unsupported".into()); }
        for profile in &data.profiles { profile.validate()?; }
        if let Some(active) = &data.active_profile_id {
            if !data.profiles.iter().any(|profile| profile.profile_id == *active && profile.enabled) {
                return Err("comfy_active_profile_invalid".into());
            }
        }
        Ok(Self { data, path: Some(path) })
    }

    pub fn in_memory() -> Self { Self { data: PersistedProfiles::default(), path: None } }
    pub fn profiles(&self) -> impl Iterator<Item = &ComfyConnectionProfile> { self.data.profiles.iter() }
    pub fn active_profile(&self) -> Option<&ComfyConnectionProfile> { self.data.active_profile_id.as_ref().and_then(|id| self.data.profiles.iter().find(|profile| &profile.profile_id == id)) }
    pub fn projections(&self) -> Vec<ComfyProfileProjection> { self.data.profiles.iter().map(ComfyConnectionProfile::projection).collect() }

    pub fn upsert(&mut self, profile: ComfyConnectionProfile) -> Result<(), String> {
        profile.validate()?;
        if let Some(existing) = self.data.profiles.iter_mut().find(|item| item.profile_id == profile.profile_id) {
            // The WebView sends an editable projection and must not be able
            // to reset provenance revisions to 1. Preserve permission/policy
            // provenance and advance the local profile projection atomically.
            if profile.profile_revision < existing.profile_revision {
                return Err("comfy_profile_revision_conflict".into());
            }
            let mut next = profile;
            next.profile_revision = existing.profile_revision.saturating_add(1);
            next.permission_revision = existing.permission_revision;
            next.policy_revision = existing.policy_revision;
            next.projection_revision = existing.projection_revision.saturating_add(1);
            *existing = next;
        } else { self.data.profiles.push(profile); }
        self.persist()
    }

    pub fn activate(&mut self, profile_id: &str) -> Result<(), String> {
        let profile = self.data.profiles.iter().find(|item| item.profile_id == profile_id && item.enabled).ok_or("comfy_profile_not_found")?;
        self.data.active_profile_id = Some(profile.profile_id.clone());
        self.persist()
    }

    pub fn disable(&mut self, profile_id: &str) -> Result<(), String> {
        let profile = self.data.profiles.iter_mut().find(|item| item.profile_id == profile_id).ok_or("comfy_profile_not_found")?;
        profile.enabled = false;
        profile.permission_revision = profile.permission_revision.saturating_add(1);
        profile.policy_revision = profile.policy_revision.saturating_add(1);
        profile.projection_revision = profile.projection_revision.saturating_add(1);
        if self.data.active_profile_id.as_deref() == Some(profile_id) { self.data.active_profile_id = None; }
        self.persist()
    }

    pub fn record_probe(&mut self, profile_id: &str, status: &str) -> Result<(), String> {
        if status != "ready" && status != "failed" {
            return Err("comfy_probe_status_invalid".into());
        }
        let profile = self.data.profiles.iter_mut().find(|item| item.profile_id == profile_id).ok_or("comfy_profile_not_found")?;
        profile.last_probe_at = Some(time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339).map_err(|_| "comfy_probe_time_failed")?);
        profile.last_probe_status = Some(status.into());
        self.persist()
    }

    fn persist(&self) -> Result<(), String> {
        let Some(path) = self.path.as_ref() else { return Ok(()); };
        let parent = path.parent().ok_or("comfy_profiles_path_invalid")?;
        fs::create_dir_all(parent).map_err(|_| "comfy_profiles_directory_failed".to_string())?;
        let temp = path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(&self.data).map_err(|_| "comfy_profiles_encode_failed".to_string())?;
        fs::write(&temp, bytes).map_err(|_| "comfy_profiles_write_failed".to_string())?;
        fs::rename(&temp, path).map_err(|_| "comfy_profiles_commit_failed".to_string())
    }
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 160 && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

fn validate_http_endpoint(endpoint: Option<&str>, cloud: bool) -> Result<(), String> {
    let value = endpoint.ok_or("comfy_endpoint_missing")?.trim();
    if cloud {
        if value != "https://cloud.comfy.org/mcp" { return Err("comfy_cloud_endpoint_not_allowlisted".into()); }
        return Ok(());
    }
    let https = value.starts_with("https://");
    let loopback_http = value.starts_with("http://127.0.0.1:") || value.starts_with("http://localhost:") || value.starts_with("http://[::1]:");
    if !(https || loopback_http) || value.contains(['?', '#', '\\', '@']) { return Err("comfy_http_endpoint_not_allowed".into()); }
    Ok(())
}

fn redact_endpoint(value: &str) -> String {
    value.split('/').take(3).collect::<Vec<_>>().join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(transport: ComfyTransportKind) -> ComfyConnectionProfile {
        ComfyConnectionProfile {
            profile_id: "profile-1".into(), worker_id: "worker-1".into(), display_name: "Local Comfy".into(), transport,
            endpoint: None, command: Some("comfy-mcp".into()), args: Vec::new(), credential_kind: ComfyCredentialKind::None,
            credential_ref: None, enabled: true, profile_revision: 1, permission_revision: 1, policy_revision: 1, projection_revision: 1,
            expires_at: None, last_probe_at: None, last_probe_status: None,
        }
    }

    #[test]
    fn validates_all_connection_modes_without_secret_values() {
        assert!(profile(ComfyTransportKind::LocalStdio).validate().is_ok());
        let mut bridge = profile(ComfyTransportKind::SelfHostedStdioBridge); bridge.endpoint = Some("https://comfy.example.test/mcp".into()); bridge.args = vec!["--endpoint".into(), "{endpoint}".into()];
        assert!(bridge.validate().is_ok());
        bridge.args = vec!["--endpoint".into()];
        assert_eq!(bridge.validate().expect_err("bridge target placeholder"), "comfy_bridge_endpoint_placeholder_missing");
        let mut http = profile(ComfyTransportKind::SelfHostedHttpMcp); http.command = None; http.endpoint = Some("https://comfy.example.test/mcp".into());
        assert!(http.validate().is_ok());
        let mut cloud = profile(ComfyTransportKind::ComfyCloud); cloud.command = None; cloud.endpoint = Some("https://cloud.comfy.org/mcp".into()); cloud.credential_kind = ComfyCredentialKind::ApiKey; cloud.credential_ref = Some("keychain:comfy/cloud".into());
        assert!(cloud.validate().is_ok());
        let mut ssh = profile(ComfyTransportKind::SshTunnel); ssh.command = None; ssh.endpoint = Some("http://127.0.0.1:8188/mcp".into()); ssh.args = vec!["-N".into(), "-o".into(), "ExitOnForwardFailure=yes".into(), "-o".into(), "StrictHostKeyChecking=yes".into(), "-o".into(), "UserKnownHostsFile=/tmp/known_hosts".into(), "-L".into(), "127.0.0.1:8188:127.0.0.1:8188".into(), "user@example.test".into()]; ssh.credential_kind = ComfyCredentialKind::SshKeychainRef; ssh.credential_ref = Some("keychain:ssh/comfy".into());
        assert!(ssh.validate().is_ok());
    }

    #[test]
    fn rejects_untrusted_endpoints_and_projects_only_redacted_metadata() {
        let mut ssrf_profile = profile(ComfyTransportKind::SelfHostedHttpMcp); ssrf_profile.command = None; ssrf_profile.endpoint = Some("http://169.254.169.254/mcp".into());
        assert_eq!(ssrf_profile.validate().expect_err("SSRF endpoint"), "comfy_http_endpoint_not_allowed");
        let mut profile2 = profile(ComfyTransportKind::SelfHostedHttpMcp); profile2.command = None; profile2.endpoint = Some("https://user:secret@comfy.example.test/mcp".into());
        assert_eq!(profile2.validate().expect_err("endpoint userinfo"), "comfy_http_endpoint_not_allowed");
        profile2.endpoint = Some("https://comfy.example.test/mcp".into());
        assert!(profile2.validate().is_ok());
        let projection = profile2.projection();
        assert!(!serde_json::to_string(&projection).expect("projection").contains("secret"));
    }

    #[test]
    fn active_profile_is_single_and_disable_clears_it() {
        let mut store = ComfyProfileStore::in_memory();
        store.upsert(profile(ComfyTransportKind::LocalStdio)).expect("upsert");
        store.activate("profile-1").expect("activate");
        assert_eq!(store.active_profile().map(|item| item.profile_id.as_str()), Some("profile-1"));
        store.disable("profile-1").expect("disable");
        assert!(store.active_profile().is_none());
    }

    #[test]
    fn editable_projection_cannot_reset_revisions() {
        let mut store = ComfyProfileStore::in_memory();
        store.upsert(profile(ComfyTransportKind::LocalStdio)).expect("initial profile");
        let mut edited = profile(ComfyTransportKind::LocalStdio);
        edited.display_name = "Edited local Comfy".into();
        edited.profile_revision = 1;
        edited.permission_revision = 1;
        store.upsert(edited).expect("edited profile");
        let saved = store.profiles().next().expect("saved profile");
        assert_eq!(saved.profile_revision, 2);
        assert_eq!(saved.permission_revision, 1);
        assert_eq!(saved.display_name, "Edited local Comfy");
    }
}
