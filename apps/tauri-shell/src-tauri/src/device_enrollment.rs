use crate::secret_store::read_secret_value;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceEnrollmentRequest {
    pub tenant_id: String,
    pub device_id: String,
    pub device_public_key: String,
    pub challenge_id: String,
    pub purpose: String,
    pub device_key_version: u32,
    pub nonce: String,
    pub issued_at_epoch_ms: i64,
    pub expires_at_epoch_ms: i64,
    pub challenge_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceEnrollmentProof {
    pub tenant_id: String,
    pub device_id: String,
    pub challenge_id: String,
    pub purpose: String,
    pub device_key_version: u32,
    pub device_public_key_digest: String,
    pub proof_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceSigningKeypair {
    pub key_algorithm: String,
    pub pkcs8_private_key_base64: String,
    pub public_key_pem: String,
    pub public_key_digest_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AsymmetricDeviceEnrollmentProof {
    pub tenant_id: String,
    pub device_id: String,
    pub challenge_id: String,
    pub purpose: String,
    pub device_key_version: u32,
    pub device_public_key_pem: String,
    pub device_public_key_digest_sha256: String,
    pub signature_base64: String,
}

fn compute_public_key_digest(device_public_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(device_public_key.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn canonical_challenge_payload(request: &DeviceEnrollmentRequest) -> String {
    [
        request.challenge_id.as_str(),
        request.tenant_id.as_str(),
        request.device_id.as_str(),
        request.purpose.as_str(),
        &request.device_key_version.to_string(),
        request.nonce.as_str(),
        &compute_public_key_digest(&request.device_public_key),
        &request.issued_at_epoch_ms.to_string(),
        &request.expires_at_epoch_ms.to_string(),
        request.challenge_sha256.as_str(),
    ]
    .join(":")
}

fn build_signable_payload(request: &DeviceEnrollmentRequest) -> Result<Vec<u8>, String> {
    validate_request(request)?;
    Ok(canonical_challenge_payload(request).into_bytes())
}

fn build_ed25519_spki_pem(raw_public_key: &[u8]) -> Result<String, String> {
    if raw_public_key.len() != 32 {
        return Err("ed25519 public key must be 32 bytes".into());
    }
    let mut der = vec![0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
    der.extend_from_slice(raw_public_key);
    let base64 = BASE64_STANDARD.encode(der);
    let mut pem = String::from("-----BEGIN PUBLIC KEY-----\n");
    for chunk in base64.as_bytes().chunks(64) {
        pem.push_str(std::str::from_utf8(chunk).map_err(|error| error.to_string())?);
        pem.push('\n');
    }
    pem.push_str("-----END PUBLIC KEY-----\n");
    Ok(pem)
}

fn decode_pem_block(pem: &str) -> Result<Vec<u8>, String> {
    let body = pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    BASE64_STANDARD
        .decode(body.as_bytes())
        .map_err(|error| error.to_string())
}

fn ed25519_raw_public_key_from_pem(pem: &str) -> Result<Vec<u8>, String> {
    let der = decode_pem_block(pem)?;
    if der.len() != 44 {
        return Err("unsupported public key DER length".into());
    }
    let prefix = &der[..12];
    if prefix != [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00] {
        return Err("unsupported public key algorithm".into());
    }
    Ok(der[12..].to_vec())
}

fn current_epoch_ms() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    i64::try_from(duration.as_millis()).map_err(|_| "epoch timestamp overflow".to_string())
}

fn validate_request(request: &DeviceEnrollmentRequest) -> Result<(), String> {
    if request.tenant_id.trim().is_empty()
        || request.device_id.trim().is_empty()
        || request.device_public_key.trim().is_empty()
        || request.challenge_id.trim().is_empty()
        || request.purpose.trim().is_empty()
        || request.nonce.trim().is_empty()
    {
        return Err(
            "tenant_id, device_id, device_public_key, challenge_id, purpose, nonce, issued_at_epoch_ms, expires_at_epoch_ms, and challenge_sha256 are required"
                .into(),
        );
    }
    if !matches!(request.purpose.as_str(), "bootstrap" | "refresh" | "rekey") {
        return Err("purpose must be bootstrap, refresh, or rekey".into());
    }
    if request.device_key_version == 0 {
        return Err("device_key_version must be at least 1".into());
    }
    if request.expires_at_epoch_ms <= 0 {
        return Err("expires_at_epoch_ms must be greater than 0".into());
    }
    if request.issued_at_epoch_ms <= 0 {
        return Err("issued_at_epoch_ms must be greater than 0".into());
    }
    if request.challenge_sha256.trim().is_empty() {
        return Err("challenge_sha256 is required".into());
    }
    Ok(())
}

fn compute_proof(request: &DeviceEnrollmentRequest, device_secret: &str) -> String {
    let canonical_payload = canonical_challenge_payload(request);
    let mut hasher = Sha256::new();
    hasher.update(canonical_payload.as_bytes());
    hasher.update(device_secret.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn build_enrollment_proof(
    request: DeviceEnrollmentRequest,
    device_secret: &str,
) -> Result<DeviceEnrollmentProof, String> {
    validate_request(&request)?;
    if device_secret.trim().is_empty() {
        return Err("device_secret is required".into());
    }
    let device_public_key_digest = compute_public_key_digest(&request.device_public_key);
    Ok(DeviceEnrollmentProof {
        tenant_id: request.tenant_id.clone(),
        device_id: request.device_id.clone(),
        challenge_id: request.challenge_id.clone(),
        purpose: request.purpose.clone(),
        device_key_version: request.device_key_version,
        device_public_key_digest: device_public_key_digest.clone(),
        proof_sha256: compute_proof(&request, device_secret),
    })
}

pub fn verify_enrollment_proof(
    request: DeviceEnrollmentRequest,
    proof: &DeviceEnrollmentProof,
    device_secret: &str,
    now_epoch_ms: Option<i64>,
) -> Result<bool, String> {
    if now_epoch_ms.unwrap_or(current_epoch_ms()?) > request.expires_at_epoch_ms {
        return Ok(false);
    }
    let expected = build_enrollment_proof(request, device_secret)?;
    Ok(expected == *proof)
}

pub fn generate_device_signing_keypair() -> Result<DeviceSigningKeypair, String> {
    let rng = SystemRandom::new();
    let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng).map_err(|_| "failed to generate ed25519 keypair")?;
    let keypair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
        .map_err(|_| "failed to decode generated ed25519 keypair")?;
    let public_key_pem = build_ed25519_spki_pem(keypair.public_key().as_ref())?;
    Ok(DeviceSigningKeypair {
        key_algorithm: "ed25519".into(),
        pkcs8_private_key_base64: BASE64_STANDARD.encode(pkcs8.as_ref()),
        public_key_digest_sha256: compute_public_key_digest(&public_key_pem),
        public_key_pem,
    })
}

pub fn build_asymmetric_enrollment_proof(
    request: DeviceEnrollmentRequest,
    pkcs8_private_key_base64: &str,
) -> Result<AsymmetricDeviceEnrollmentProof, String> {
    let payload = build_signable_payload(&request)?;
    let pkcs8_bytes = BASE64_STANDARD
        .decode(pkcs8_private_key_base64.as_bytes())
        .map_err(|error| error.to_string())?;
    let keypair = Ed25519KeyPair::from_pkcs8(&pkcs8_bytes)
        .map_err(|_| "failed to decode ed25519 private key".to_string())?;
    let public_key_pem = build_ed25519_spki_pem(keypair.public_key().as_ref())?;
    let signature = keypair.sign(&payload);
    Ok(AsymmetricDeviceEnrollmentProof {
        tenant_id: request.tenant_id.clone(),
        device_id: request.device_id.clone(),
        challenge_id: request.challenge_id.clone(),
        purpose: request.purpose.clone(),
        device_key_version: request.device_key_version,
        device_public_key_digest_sha256: compute_public_key_digest(&public_key_pem),
        device_public_key_pem: public_key_pem,
        signature_base64: BASE64_STANDARD.encode(signature.as_ref()),
    })
}

pub fn verify_asymmetric_enrollment_proof(
    request: DeviceEnrollmentRequest,
    proof: &AsymmetricDeviceEnrollmentProof,
    now_epoch_ms: Option<i64>,
) -> Result<bool, String> {
    if now_epoch_ms.unwrap_or(current_epoch_ms()?) > request.expires_at_epoch_ms {
        return Ok(false);
    }
    let payload = build_signable_payload(&request)?;
    let expected_public_key_digest = compute_public_key_digest(&proof.device_public_key_pem);
    if expected_public_key_digest != compute_public_key_digest(&request.device_public_key) {
        return Ok(false);
    }
    if expected_public_key_digest != proof.device_public_key_digest_sha256 {
        return Ok(false);
    }
    if proof.tenant_id != request.tenant_id
        || proof.device_id != request.device_id
        || proof.challenge_id != request.challenge_id
        || proof.purpose != request.purpose
        || proof.device_key_version != request.device_key_version
    {
        return Ok(false);
    }
    let raw_public_key = ed25519_raw_public_key_from_pem(&proof.device_public_key_pem)?;
    let signature = BASE64_STANDARD
        .decode(proof.signature_base64.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(UnparsedPublicKey::new(&ED25519, raw_public_key)
        .verify(&payload, &signature)
        .is_ok())
}

pub fn build_stored_enrollment_proof(
    base_dir: &Path,
    secret_id: &str,
    request: DeviceEnrollmentRequest,
) -> Result<DeviceEnrollmentProof, String> {
    let device_secret = read_secret_value(base_dir, secret_id)?;
    build_enrollment_proof(request, &device_secret)
}

pub fn build_stored_asymmetric_enrollment_proof(
    base_dir: &Path,
    secret_id: &str,
    request: DeviceEnrollmentRequest,
) -> Result<AsymmetricDeviceEnrollmentProof, String> {
    let private_key = read_secret_value(base_dir, secret_id)?;
    build_asymmetric_enrollment_proof(request, &private_key)
}

#[tauri::command]
pub async fn desktop_host_build_enrollment_proof(
    base_dir: String,
    secret_id: String,
    request: DeviceEnrollmentRequest,
) -> Result<DeviceEnrollmentProof, String> {
    build_stored_enrollment_proof(Path::new(&base_dir), &secret_id, request)
}

#[tauri::command]
pub async fn desktop_host_build_asymmetric_enrollment_proof(
    base_dir: String,
    secret_id: String,
    request: DeviceEnrollmentRequest,
) -> Result<AsymmetricDeviceEnrollmentProof, String> {
    build_stored_asymmetric_enrollment_proof(Path::new(&base_dir), &secret_id, request)
}

#[tauri::command]
pub async fn desktop_host_generate_device_signing_keypair() -> Result<DeviceSigningKeypair, String> {
    generate_device_signing_keypair()
}
