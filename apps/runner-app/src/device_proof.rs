use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::signature::{SignatureEncoding, Signer};
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_PUBLIC_KEY_LENGTH: usize = 16 * 1024;
const MAX_MACHINE_FINGERPRINT_LENGTH: usize = 512;

#[derive(Debug, Clone)]
pub struct DeviceProofHeaders {
    pub device_id: String,
    pub public_key: String,
    pub machine_fingerprint: String,
    pub nonce: String,
    pub timestamp: String,
    pub signature: String,
    pub body_hash: String,
}

/// Signs the same request-proof payload verified by the SmartAIHub Runner gateway.
/// The private key is loaded only from the host environment and is never serialized.
pub struct DeviceProofSigner {
    device_id: String,
    machine_fingerprint: String,
    public_key: String,
    token_jti: String,
    signing_key: SigningKey<Sha256>,
}

impl DeviceProofSigner {
    pub fn from_env(device_id: &str, access_token: &str) -> Result<Option<Self>, String> {
        let public_key = std::env::var("SAH_RUNNER_DEVICE_PUBLIC_KEY").unwrap_or_default();
        let private_key = std::env::var("SAH_RUNNER_DEVICE_PRIVATE_KEY").unwrap_or_default();
        let machine_fingerprint =
            std::env::var("SAH_RUNNER_MACHINE_FINGERPRINT").unwrap_or_default();
        if public_key.trim().is_empty()
            && private_key.trim().is_empty()
            && machine_fingerprint.trim().is_empty()
        {
            return Ok(None);
        }
        if public_key.trim().is_empty()
            || private_key.trim().is_empty()
            || machine_fingerprint.trim().is_empty()
            || device_id.trim().is_empty()
        {
            return Err("RUNNER_DEVICE_PROOF_CONFIGURATION_INCOMPLETE".into());
        }
        let public_key = normalize_public_key(&public_key)?;
        let machine_fingerprint =
            normalize_header_value(&machine_fingerprint, MAX_MACHINE_FINGERPRINT_LENGTH)?;
        let private_key = private_key.replace("\\n", "\n");
        let private_key = RsaPrivateKey::from_pkcs8_pem(&private_key)
            .or_else(|_| RsaPrivateKey::from_pkcs1_pem(&private_key))
            .map_err(|_| "RUNNER_DEVICE_PRIVATE_KEY_INVALID")?;
        let configured_public_key = RsaPublicKey::from_public_key_pem(&public_key)
            .or_else(|_| RsaPublicKey::from_pkcs1_pem(&public_key))
            .map_err(|_| "RUNNER_DEVICE_PUBLIC_KEY_INVALID")?;
        if RsaPublicKey::from(&private_key) != configured_public_key {
            return Err("RUNNER_DEVICE_KEY_PAIR_MISMATCH".into());
        }
        let token_jti = token_jti(access_token)?;
        Ok(Some(Self {
            device_id: device_id.trim().to_owned(),
            machine_fingerprint,
            public_key,
            token_jti,
            signing_key: SigningKey::<Sha256>::new(private_key),
        }))
    }

    pub fn headers(
        &self,
        method: &str,
        path: &str,
        body: &[u8],
    ) -> Result<DeviceProofHeaders, String> {
        let mut nonce_bytes = [0_u8; 18];
        getrandom::fill(&mut nonce_bytes).map_err(|_| "RUNNER_DEVICE_PROOF_NONCE_UNAVAILABLE")?;
        let nonce = hex_encode(&nonce_bytes);
        let timestamp = current_time_iso();
        let body_hash = canonical_body_hash(body)?;
        let signing_payload = [
            method.to_uppercase(),
            path.to_owned(),
            self.token_jti.clone(),
            timestamp.clone(),
            nonce.clone(),
            body_hash.clone(),
        ]
        .join("\n");
        let signature = self.signing_key.sign(signing_payload.as_bytes());
        Ok(DeviceProofHeaders {
            device_id: self.device_id.clone(),
            public_key: self.public_key.replace('\n', "\\n"),
            machine_fingerprint: self.machine_fingerprint.clone(),
            nonce,
            timestamp,
            signature: base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()),
            body_hash,
        })
    }
}

pub fn canonical_body_hash(body: &[u8]) -> Result<String, String> {
    let value: Value = serde_json::from_slice(body)
        .map_err(|_| "RUNNER_DEVICE_PROOF_BODY_INVALID_JSON".to_string())?;
    let canonical = serde_json::to_vec(&value)
        .map_err(|_| "RUNNER_DEVICE_PROOF_BODY_NOT_SERIALIZABLE".to_string())?;
    Ok(hex_encode(Sha256::digest(canonical).as_slice()))
}

pub fn canonical_json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    let encoded = serde_json::to_vec(value)
        .map_err(|_| "RUNNER_DEVICE_PROOF_BODY_NOT_SERIALIZABLE".to_string())?;
    let value: Value = serde_json::from_slice(&encoded)
        .map_err(|_| "RUNNER_DEVICE_PROOF_BODY_INVALID_JSON".to_string())?;
    serde_json::to_vec(&value).map_err(|_| "RUNNER_DEVICE_PROOF_BODY_NOT_SERIALIZABLE".to_string())
}

pub fn endpoint_path(endpoint: &str) -> Result<String, String> {
    let (_, authority_and_path) = endpoint
        .split_once("://")
        .ok_or_else(|| "RUNNER_CONTROL_ENDPOINT_INVALID".to_string())?;
    let path_start = authority_and_path.find('/');
    Ok(path_start
        .map(|index| authority_and_path[index..].to_owned())
        .unwrap_or_else(|| "/".to_owned()))
}

fn token_jti(access_token: &str) -> Result<String, String> {
    let payload = access_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "RUNNER_ACCESS_TOKEN_INVALID".to_string())?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "RUNNER_ACCESS_TOKEN_INVALID".to_string())?;
    let claims: Value =
        serde_json::from_slice(&decoded).map_err(|_| "RUNNER_ACCESS_TOKEN_INVALID".to_string())?;
    claims
        .get("jti")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "RUNNER_ACCESS_TOKEN_MISSING_JTI".to_string())
}

fn normalize_header_value(value: &str, max_length: usize) -> Result<String, String> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.len() > max_length || value.contains('\r') || value.contains('\n')
    {
        return Err("RUNNER_DEVICE_PROOF_HEADER_INVALID".into());
    }
    Ok(value)
}

fn normalize_public_key(value: &str) -> Result<String, String> {
    let value = value.trim().replace("\\n", "\n");
    if value.is_empty() || value.len() > MAX_PUBLIC_KEY_LENGTH || value.contains('\r') {
        return Err("RUNNER_DEVICE_PROOF_PUBLIC_KEY_INVALID".into());
    }
    Ok(value)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn current_time_iso() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_days = (duration.as_secs() / 86_400) as i64;
    let seconds_today = duration.as_secs() % 86_400;
    let (year, month, day) = civil_from_days(total_days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds_today / 3_600,
        (seconds_today % 3_600) / 60,
        seconds_today % 60,
        duration.subsec_millis()
    )
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let shifted = days_since_unix_epoch + 719_468;
    let era = if shifted >= 0 {
        shifted / 146_097
    } else {
        (shifted - 146_096) / 146_097
    };
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_body_hash_sorts_object_keys() {
        assert_eq!(
            canonical_body_hash(br#"{"b":2,"a":1}"#).unwrap(),
            canonical_body_hash(br#"{"a":1,"b":2}"#).unwrap()
        );
    }

    #[test]
    fn endpoint_path_keeps_runner_scope_without_credentials() {
        assert_eq!(
            endpoint_path("wss://example.test/api/runners/runner-1/control").unwrap(),
            "/api/runners/runner-1/control"
        );
    }

    #[test]
    fn token_jti_is_read_without_logging_or_exposing_the_token() {
        let token = "eyJhbGciOiJub25lIn0.eyJqdGkiOiJqdGktMSJ9.signature";
        assert_eq!(token_jti(token).unwrap(), "jti-1");
    }
}
