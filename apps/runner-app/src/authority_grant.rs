use base64::{engine::general_purpose::STANDARD, Engine as _};
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::signature::{SignatureEncoding, Signer, Verifier};
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const MAX_AUTHORITY_GRANT_MS: u64 = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS: u64 = 30_000;
const MAX_REQUIRED_FEATURES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionAuthorityClaims {
    pub grant_id: String,
    pub key_id: String,
    pub worker_job_id: String,
    pub session_id: String,
    pub runner_id: String,
    pub session_generation: u64,
    pub authority_epoch: u64,
    pub placement_epoch: u64,
    pub job_control_revision: u64,
    pub effect_class: String,
    pub issued_at_unix_ms: u64,
    pub not_after_unix_ms: u64,
    pub required_safety_features: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionAuthorityGrant {
    pub claims: ExecutionAuthorityClaims,
    pub signature_base64: String,
}

impl ExecutionAuthorityGrant {
    pub fn signing_bytes(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(&self.claims)
            .map_err(|_| "RUNNER_AUTHORITY_GRANT_ENCODING_INVALID".into())
    }

    pub fn sign(claims: ExecutionAuthorityClaims, private_key_pem: &str) -> Result<Self, String> {
        let private_key_pem = private_key_pem.replace("\\n", "\n");
        let key = RsaPrivateKey::from_pkcs8_pem(&private_key_pem)
            .or_else(|_| RsaPrivateKey::from_pkcs1_pem(&private_key_pem))
            .map_err(|_| "RUNNER_AUTHORITY_SIGNING_KEY_INVALID")?;
        let mut grant = Self {
            claims,
            signature_base64: String::new(),
        };
        let signing_key = rsa::pkcs1v15::SigningKey::<Sha256>::new(key);
        grant.signature_base64 =
            STANDARD.encode(signing_key.sign(&grant.signing_bytes()?).to_bytes());
        Ok(grant)
    }

    pub fn verify(
        &self,
        trusted_keys: &HashMap<String, String>,
        expected: &ExpectedAuthority,
        now_unix_ms: u64,
    ) -> Result<AcceptedAuthority, &'static str> {
        validate_claims(&self.claims, expected, now_unix_ms)?;
        let pem = trusted_keys
            .get(&self.claims.key_id)
            .ok_or("RUNNER_AUTHORITY_KEY_UNKNOWN")?
            .replace("\\n", "\n");
        let public_key = RsaPublicKey::from_public_key_pem(&pem)
            .or_else(|_| RsaPublicKey::from_pkcs1_pem(&pem))
            .map_err(|_| "RUNNER_AUTHORITY_KEY_INVALID")?;
        if public_key.n().bits() < 2048 {
            return Err("RUNNER_AUTHORITY_KEY_TOO_WEAK");
        }
        let bytes = self
            .signing_bytes()
            .map_err(|_| "RUNNER_AUTHORITY_GRANT_ENCODING_INVALID")?;
        let signature_bytes = STANDARD
            .decode(self.signature_base64.trim())
            .map_err(|_| "RUNNER_AUTHORITY_SIGNATURE_INVALID")?;
        let signature = Signature::try_from(signature_bytes.as_slice())
            .map_err(|_| "RUNNER_AUTHORITY_SIGNATURE_INVALID")?;
        VerifyingKey::<Sha256>::new(public_key)
            .verify(&bytes, &signature)
            .map_err(|_| "RUNNER_AUTHORITY_SIGNATURE_MISMATCH")?;

        Ok(AcceptedAuthority {
            authority_epoch: self.claims.authority_epoch,
            job_control_revision: self.claims.job_control_revision,
            expires_unix_ms: self.claims.not_after_unix_ms,
            accepted_wall_ms: now_unix_ms,
            accepted_monotonic: Instant::now(),
            duration_ms: self.claims.not_after_unix_ms - now_unix_ms,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ExpectedAuthority<'a> {
    pub worker_job_id: &'a str,
    pub session_id: &'a str,
    pub runner_id: &'a str,
    pub session_generation: u64,
    pub minimum_authority_epoch: u64,
    pub minimum_placement_epoch: u64,
    pub minimum_job_control_revision: u64,
    pub allowed_effect_class: &'a str,
    pub supported_safety_features: &'a [&'a str],
}

fn validate_claims(
    claims: &ExecutionAuthorityClaims,
    expected: &ExpectedAuthority<'_>,
    now_unix_ms: u64,
) -> Result<(), &'static str> {
    if claims.grant_id.trim().is_empty()
        || claims.grant_id.len() > 160
        || claims.key_id.trim().is_empty()
        || claims.key_id.len() > 128
        || claims.effect_class.trim().is_empty()
        || claims.effect_class.len() > 128
        || claims.required_safety_features.len() > MAX_REQUIRED_FEATURES
        || claims
            .required_safety_features
            .iter()
            .any(|feature| feature.trim().is_empty() || feature.len() > 128)
    {
        return Err("RUNNER_AUTHORITY_GRANT_INVALID");
    }
    if claims.worker_job_id != expected.worker_job_id
        || claims.session_id != expected.session_id
        || claims.runner_id != expected.runner_id
        || claims.session_generation != expected.session_generation
    {
        return Err("RUNNER_AUTHORITY_SCOPE_MISMATCH");
    }
    if claims.authority_epoch < expected.minimum_authority_epoch
        || claims.placement_epoch < expected.minimum_placement_epoch
        || claims.job_control_revision < expected.minimum_job_control_revision
        || claims.authority_epoch == 0
        || claims.placement_epoch == 0
        || claims.job_control_revision == 0
    {
        return Err("RUNNER_AUTHORITY_STALE");
    }
    let unique_features = claims
        .required_safety_features
        .iter()
        .collect::<std::collections::HashSet<_>>();
    if claims.effect_class != expected.allowed_effect_class
        || unique_features.len() != claims.required_safety_features.len()
        || claims.required_safety_features.iter().any(|feature| {
            !expected
                .supported_safety_features
                .contains(&feature.as_str())
        })
    {
        return Err("RUNNER_AUTHORITY_EFFECT_OR_SAFETY_FEATURE_INVALID");
    }
    let duration = claims
        .not_after_unix_ms
        .saturating_sub(claims.issued_at_unix_ms);
    if duration == 0 || duration > MAX_AUTHORITY_GRANT_MS {
        return Err("RUNNER_AUTHORITY_DURATION_INVALID");
    }
    if claims.issued_at_unix_ms > now_unix_ms.saturating_add(MAX_CLOCK_SKEW_MS)
        || claims.not_after_unix_ms <= now_unix_ms
    {
        return Err("RUNNER_AUTHORITY_EXPIRED_OR_NOT_YET_VALID");
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcceptedAuthority {
    pub authority_epoch: u64,
    pub job_control_revision: u64,
    expires_unix_ms: u64,
    accepted_wall_ms: u64,
    accepted_monotonic: Instant,
    duration_ms: u64,
}

impl AcceptedAuthority {
    /// Rejects expiry and wall-clock discontinuity; callers must quiesce on any error.
    pub fn validate_at(
        &self,
        wall_now_ms: u64,
        monotonic_now: Instant,
    ) -> Result<(), &'static str> {
        if wall_now_ms < self.accepted_wall_ms {
            return Err("RUNNER_AUTHORITY_CLOCK_ROLLBACK");
        }
        let wall_elapsed = wall_now_ms - self.accepted_wall_ms;
        let monotonic_elapsed = monotonic_now
            .checked_duration_since(self.accepted_monotonic)
            .ok_or("RUNNER_AUTHORITY_MONOTONIC_CLOCK_INVALID")?;
        let monotonic_ms = monotonic_elapsed.as_millis().min(u64::MAX as u128) as u64;
        if wall_elapsed.abs_diff(monotonic_ms) > MAX_CLOCK_SKEW_MS {
            return Err("RUNNER_AUTHORITY_CLOCK_DISCONTINUITY");
        }
        if wall_now_ms >= self.expires_unix_ms || monotonic_ms >= self.duration_ms {
            return Err("RUNNER_AUTHORITY_EXPIRED");
        }
        Ok(())
    }

    pub fn remaining(
        &self,
        wall_now_ms: u64,
        monotonic_now: Instant,
    ) -> Result<Duration, &'static str> {
        self.validate_at(wall_now_ms, monotonic_now)?;
        let wall_remaining = self.expires_unix_ms - wall_now_ms;
        let elapsed = monotonic_now
            .duration_since(self.accepted_monotonic)
            .as_millis() as u64;
        Ok(Duration::from_millis(
            wall_remaining.min(self.duration_ms.saturating_sub(elapsed)),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};

    fn signed_grant(now_ms: u64) -> (ExecutionAuthorityGrant, HashMap<String, String>) {
        let mut rng = rsa::rand_core::OsRng;
        let private = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let public_pem = private
            .to_public_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        let private_pem = private.to_pkcs8_pem(LineEnding::LF).unwrap();
        let claims = ExecutionAuthorityClaims {
            grant_id: "grant-1".into(),
            key_id: "key-1".into(),
            worker_job_id: "job-1".into(),
            session_id: "ses-1".into(),
            runner_id: "runner-1".into(),
            session_generation: 1,
            authority_epoch: 2,
            placement_epoch: 1,
            job_control_revision: 3,
            effect_class: "workspace_write".into(),
            issued_at_unix_ms: now_ms,
            not_after_unix_ms: now_ms + 60_000,
            required_safety_features: vec!["grant_expiry_pause".into()],
        };
        let grant = ExecutionAuthorityGrant::sign(claims, private_pem.as_str()).unwrap();
        (grant, HashMap::from([("key-1".into(), public_pem)]))
    }

    fn expected() -> ExpectedAuthority<'static> {
        ExpectedAuthority {
            worker_job_id: "job-1",
            session_id: "ses-1",
            runner_id: "runner-1",
            session_generation: 1,
            minimum_authority_epoch: 2,
            minimum_placement_epoch: 1,
            minimum_job_control_revision: 3,
            allowed_effect_class: "workspace_write",
            supported_safety_features: &["grant_expiry_pause"],
        }
    }

    #[test]
    fn verifies_signature_scope_and_bounded_duration() {
        let now = 1_800_000_000_000;
        let (grant, keys) = signed_grant(now);
        assert!(grant.verify(&keys, &expected(), now).is_ok());
        let mut wrong_scope = expected();
        wrong_scope.session_id = "ses-other";
        assert_eq!(
            grant.verify(&keys, &wrong_scope, now),
            Err("RUNNER_AUTHORITY_SCOPE_MISMATCH")
        );
        let mut tampered = grant;
        tampered.claims.authority_epoch += 1;
        assert_eq!(
            tampered.verify(&keys, &expected(), now),
            Err("RUNNER_AUTHORITY_SIGNATURE_MISMATCH")
        );
    }

    #[test]
    fn local_deadline_fails_closed_on_clock_rollback_and_expiry() {
        let accepted_at = Instant::now();
        let accepted = AcceptedAuthority {
            authority_epoch: 2,
            job_control_revision: 3,
            expires_unix_ms: 61_000,
            accepted_wall_ms: 1_000,
            accepted_monotonic: accepted_at,
            duration_ms: 60_000,
        };
        assert_eq!(
            accepted.validate_at(999, accepted_at),
            Err("RUNNER_AUTHORITY_CLOCK_ROLLBACK")
        );
        assert_eq!(
            accepted.validate_at(61_000, accepted_at + Duration::from_secs(60)),
            Err("RUNNER_AUTHORITY_EXPIRED")
        );
    }
}
