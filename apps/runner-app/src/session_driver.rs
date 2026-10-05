use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::session_contract::{ContinuityClass, EnforcementLevel};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionDriverCapabilities {
    pub continuity: ContinuityClass,
    pub enforcement: EnforcementLevel,
    pub checkpointing: bool,
    pub reconstruction: bool,
    pub required_safety_features: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DriverSessionContext<'a> {
    pub tenant_id: &'a str,
    pub worker_job_id: &'a str,
    pub session_id: &'a str,
    pub generation: u64,
    pub workspace_ref: &'a str,
}

/// Provider-neutral lifecycle seam. Implementations must still be admitted by
/// deployment certification; the trait does not confer trust or authority.
pub trait SessionDriver: Send + Sync {
    fn driver_id(&self) -> &str;
    fn driver_version(&self) -> &str;
    fn capabilities(&self) -> SessionDriverCapabilities;
    fn prepare(&self, context: &DriverSessionContext<'_>) -> Result<(), &'static str>;
    fn start(&self, context: &DriverSessionContext<'_>) -> Result<(), &'static str>;
    fn reattach(&self, context: &DriverSessionContext<'_>) -> Result<(), &'static str>;
    fn checkpoint(
        &self,
        context: &DriverSessionContext<'_>,
    ) -> Result<CheckpointManifest, &'static str>;
    fn reconstruct(
        &self,
        context: &DriverSessionContext<'_>,
        checkpoint: &CheckpointManifest,
    ) -> Result<(), &'static str>;
    fn quiesce(&self, context: &DriverSessionContext<'_>) -> Result<(), &'static str>;
    fn terminate(&self, context: &DriverSessionContext<'_>) -> Result<(), &'static str>;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DriverCertification {
    pub driver_id: String,
    pub driver_version: String,
    pub source_sha256: String,
    pub certification_profile: String,
    pub certified_continuity: ContinuityClass,
    pub maximum_enforcement: EnforcementLevel,
    pub certified_at_unix_ms: u64,
    pub expires_at_unix_ms: u64,
}

impl DriverCertification {
    pub fn validate(
        &self,
        now_unix_ms: u64,
        deployment_trust: &HashSet<(String, String, String)>,
    ) -> Result<(), &'static str> {
        if self.driver_id.trim().is_empty()
            || self.driver_version.trim().is_empty()
            || self.certification_profile.trim().is_empty()
            || !valid_sha256(&self.source_sha256)
            || self.certified_at_unix_ms == 0
            || self.expires_at_unix_ms <= self.certified_at_unix_ms
            || self.expires_at_unix_ms <= now_unix_ms
        {
            return Err("RUNNER_SESSION_DRIVER_CERTIFICATION_INVALID");
        }
        if !deployment_trust.contains(&(
            self.driver_id.clone(),
            self.driver_version.clone(),
            self.source_sha256.clone(),
        )) {
            return Err("RUNNER_SESSION_DRIVER_NOT_TRUSTED_BY_DEPLOYMENT");
        }
        Ok(())
    }
}

pub fn validate_driver_claim(
    certificate: &DriverCertification,
    claimed_continuity: ContinuityClass,
    claimed_enforcement: EnforcementLevel,
    now_unix_ms: u64,
    deployment_trust: &HashSet<(String, String, String)>,
) -> Result<(), &'static str> {
    certificate.validate(now_unix_ms, deployment_trust)?;
    if continuity_rank(claimed_continuity) > continuity_rank(certificate.certified_continuity)
        || enforcement_rank(claimed_enforcement) > enforcement_rank(certificate.maximum_enforcement)
    {
        return Err("RUNNER_SESSION_DRIVER_CLAIM_EXCEEDS_CERTIFICATION");
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointManifest {
    pub checkpoint_id: String,
    pub tenant_id: String,
    pub worker_job_id: String,
    pub session_id: String,
    pub session_generation: u64,
    pub workspace_generation: u64,
    pub driver_id: String,
    pub driver_version: String,
    pub parent_checkpoint_id: Option<String>,
    pub artifact_refs: Vec<String>,
    pub content_sha256: String,
    pub lineage_sha256: String,
    pub committed: bool,
}

pub struct RestoreScope<'a> {
    pub tenant_id: &'a str,
    pub worker_job_id: &'a str,
    pub session_id: &'a str,
    pub session_generation: u64,
    pub workspace_generation: u64,
    pub driver_id: &'a str,
    pub driver_version: &'a str,
}

impl CheckpointManifest {
    pub fn validate_restore(
        &self,
        scope: &RestoreScope<'_>,
        actual_content_sha256: &str,
        expected_lineage_sha256: &str,
    ) -> Result<(), &'static str> {
        if !self.committed {
            return Err("RUNNER_SESSION_CHECKPOINT_NOT_COMMITTED");
        }
        if self.checkpoint_id.trim().is_empty()
            || self.checkpoint_id.len() > 160
            || self.session_generation == 0
            || self.workspace_generation == 0
            || self.driver_id.trim().is_empty()
            || self.driver_version.trim().is_empty()
            || self
                .parent_checkpoint_id
                .as_ref()
                .is_some_and(|parent| parent.trim().is_empty() || parent.len() > 160)
        {
            return Err("RUNNER_SESSION_CHECKPOINT_SCOPE_MISMATCH");
        }
        if self.tenant_id != scope.tenant_id
            || self.worker_job_id != scope.worker_job_id
            || self.session_id != scope.session_id
            || self.session_generation != scope.session_generation
            || self.workspace_generation != scope.workspace_generation
            || self.driver_id != scope.driver_id
            || self.driver_version != scope.driver_version
        {
            return Err("RUNNER_SESSION_CHECKPOINT_SCOPE_MISMATCH");
        }
        if !valid_sha256(&self.content_sha256)
            || !valid_sha256(&self.lineage_sha256)
            || !valid_sha256(actual_content_sha256)
            || !valid_sha256(expected_lineage_sha256)
            || self.content_sha256 != actual_content_sha256
            || self.lineage_sha256 != expected_lineage_sha256
            || canonical_lineage_sha256(self)? != self.lineage_sha256
        {
            return Err("RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID");
        }
        if self.artifact_refs.is_empty()
            || self.artifact_refs.len() > 1024
            || self.artifact_refs.iter().any(|reference| {
                reference.trim().is_empty()
                    || reference.len() > 512
                    || reference.starts_with("http:")
                    || reference.starts_with("https:")
                    || reference.starts_with("file:")
            })
        {
            return Err("RUNNER_SESSION_CHECKPOINT_ARTIFACTS_INVALID");
        }
        Ok(())
    }
}

pub fn canonical_lineage_sha256(manifest: &CheckpointManifest) -> Result<String, &'static str> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Lineage<'a> {
        checkpoint_id: &'a str,
        tenant_id: &'a str,
        worker_job_id: &'a str,
        session_id: &'a str,
        session_generation: u64,
        workspace_generation: u64,
        driver_id: &'a str,
        driver_version: &'a str,
        parent_checkpoint_id: &'a Option<String>,
        artifact_refs: &'a [String],
        content_sha256: &'a str,
    }
    let bytes = serde_json::to_vec(&Lineage {
        checkpoint_id: &manifest.checkpoint_id,
        tenant_id: &manifest.tenant_id,
        worker_job_id: &manifest.worker_job_id,
        session_id: &manifest.session_id,
        session_generation: manifest.session_generation,
        workspace_generation: manifest.workspace_generation,
        driver_id: &manifest.driver_id,
        driver_version: &manifest.driver_version,
        parent_checkpoint_id: &manifest.parent_checkpoint_id,
        artifact_refs: &manifest.artifact_refs,
        content_sha256: &manifest.content_sha256,
    })
    .map_err(|_| "RUNNER_SESSION_CHECKPOINT_LINEAGE_INVALID")?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn continuity_rank(value: ContinuityClass) -> u8 {
    match value {
        ContinuityClass::Ephemeral => 0,
        ContinuityClass::Reconstructable => 1,
        ContinuityClass::Checkpointable => 2,
        ContinuityClass::Reattachable => 3,
        ContinuityClass::ProcessPersistent => 4,
    }
}

fn enforcement_rank(value: EnforcementLevel) -> u8 {
    match value {
        EnforcementLevel::CommandOnly => 0,
        EnforcementLevel::ProcessPause => 1,
        EnforcementLevel::MediatedEffects => 2,
        EnforcementLevel::SandboxEnforced => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deployment_trust(certificate: &DriverCertification) -> HashSet<(String, String, String)> {
        HashSet::from([(
            certificate.driver_id.clone(),
            certificate.driver_version.clone(),
            certificate.source_sha256.clone(),
        )])
    }

    #[test]
    fn driver_cannot_claim_beyond_trusted_certification() {
        let certificate = DriverCertification {
            driver_id: "cloudflare.container".into(),
            driver_version: "1".into(),
            source_sha256: "a".repeat(64),
            certification_profile: "replacement-reconstruct-v1".into(),
            certified_continuity: ContinuityClass::Reconstructable,
            maximum_enforcement: EnforcementLevel::SandboxEnforced,
            certified_at_unix_ms: 100,
            expires_at_unix_ms: 10_000,
        };
        assert!(validate_driver_claim(
            &certificate,
            ContinuityClass::Reconstructable,
            EnforcementLevel::ProcessPause,
            200,
            &deployment_trust(&certificate)
        )
        .is_ok());
        assert_eq!(
            validate_driver_claim(
                &certificate,
                ContinuityClass::ProcessPersistent,
                EnforcementLevel::ProcessPause,
                200,
                &deployment_trust(&certificate)
            ),
            Err("RUNNER_SESSION_DRIVER_CLAIM_EXCEEDS_CERTIFICATION")
        );
    }

    #[test]
    fn certificate_data_cannot_self_assert_deployment_trust() {
        let certificate = DriverCertification {
            driver_id: "cloudflare.container".into(),
            driver_version: "1".into(),
            source_sha256: "a".repeat(64),
            certification_profile: "replacement-reconstruct-v1".into(),
            certified_continuity: ContinuityClass::Reconstructable,
            maximum_enforcement: EnforcementLevel::SandboxEnforced,
            certified_at_unix_ms: 100,
            expires_at_unix_ms: 10_000,
        };
        assert_eq!(
            validate_driver_claim(
                &certificate,
                ContinuityClass::Reconstructable,
                EnforcementLevel::ProcessPause,
                200,
                &HashSet::new(),
            ),
            Err("RUNNER_SESSION_DRIVER_NOT_TRUSTED_BY_DEPLOYMENT")
        );
    }

    #[test]
    fn checkpoint_restore_requires_commit_scope_digest_and_lineage() {
        let mut manifest = CheckpointManifest {
            checkpoint_id: "chk-1".into(),
            tenant_id: "tenant-1".into(),
            worker_job_id: "job-1".into(),
            session_id: "ses-1".into(),
            session_generation: 2,
            workspace_generation: 3,
            driver_id: "local.fs.v1".into(),
            driver_version: "1".into(),
            parent_checkpoint_id: None,
            artifact_refs: vec!["artifact:abc".into()],
            content_sha256: "b".repeat(64),
            lineage_sha256: String::new(),
            committed: true,
        };
        manifest.lineage_sha256 = canonical_lineage_sha256(&manifest).unwrap();
        let scope = RestoreScope {
            tenant_id: "tenant-1",
            worker_job_id: "job-1",
            session_id: "ses-1",
            session_generation: 2,
            workspace_generation: 3,
            driver_id: "local.fs.v1",
            driver_version: "1",
        };
        assert!(manifest
            .validate_restore(&scope, &manifest.content_sha256, &manifest.lineage_sha256)
            .is_ok());
        assert_eq!(
            manifest.validate_restore(&scope, &"d".repeat(64), &manifest.lineage_sha256),
            Err("RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID")
        );
        let mut tampered_lineage = manifest.clone();
        tampered_lineage.checkpoint_id = "chk-substituted".into();
        assert_eq!(
            tampered_lineage.validate_restore(
                &scope,
                &manifest.content_sha256,
                &manifest.lineage_sha256,
            ),
            Err("RUNNER_SESSION_CHECKPOINT_INTEGRITY_INVALID")
        );
        let mut uncommitted = manifest.clone();
        uncommitted.committed = false;
        assert_eq!(
            uncommitted.validate_restore(
                &scope,
                &manifest.content_sha256,
                &manifest.lineage_sha256,
            ),
            Err("RUNNER_SESSION_CHECKPOINT_NOT_COMMITTED")
        );
    }
}
