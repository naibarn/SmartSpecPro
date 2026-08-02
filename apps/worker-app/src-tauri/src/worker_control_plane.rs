use rand::RngCore;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::control_plane::{
    WorkerProtocolCompatibility, WORKER_APP_PROTOCOL_VERSION, WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
    WORKER_RUNTIME_PROFILE_SCHEMA_VERSION, WORKER_RUNTIME_TYPE,
};
use crate::credentials::WorkerDeviceProofMaterial;

const CONTROL_PLANE_TIMEOUT_MS: u64 = 30_000;
const WORKER_CLAIM_TIMEOUT_MS: u64 = 15_000;
const ARTIFACT_UPLOAD_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const ARTIFACT_UPLOAD_ATTEMPTS: u8 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerApiTokens {
    pub execution_token: String,
    pub upload_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerLoopConnection {
    pub server_url: String,
    pub worker_id: String,
    pub worker_label: String,
    pub tokens: WorkerApiTokens,
    #[serde(skip_serializing, skip_deserializing, default = "empty_device_proof")]
    pub device_proof: WorkerDeviceProofMaterial,
}

fn empty_device_proof() -> WorkerDeviceProofMaterial {
    WorkerDeviceProofMaterial {
        device_id: String::new(),
        machine_fingerprint: String::new(),
        public_key_pem: String::new(),
        private_key_pem: String::new(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerHeartbeatPayload {
    pub compatibility: WorkerProtocolCompatibility,
    pub runtime_type: String,
    pub status: String,
    pub current_job_count: u32,
    pub queue_depth: u32,
    pub free_disk_bytes: Option<u64>,
    #[serde(default)]
    pub metrics_json: Value,
    #[serde(default)]
    pub warnings_json: Vec<String>,
    #[serde(default)]
    pub runtime_metadata_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerHeartbeatResponse {
    pub status: String,
    pub worker_id: String,
    pub last_seen_at: Option<String>,
    /// Feature 135 §11 — surfaces `workerRegistryService.ts`'s
    /// `hermes_worker_min_version` enforcement warning (server persists it
    /// in `worker.warningFlagsJson`; the heartbeat route mirrors it here so
    /// the Worker App can render "update required" without a second call).
    #[serde(default)]
    pub warning_flags_json: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerClaimRequest {
    pub max_jobs: u32,
    #[serde(default)]
    pub capability_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerClaimResponse {
    pub job: Option<crate::worker_executor::ClaimedWorkerJob>,
    #[serde(default)]
    pub queue_depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobEventPayload {
    pub event_type: String,
    #[serde(default)]
    pub payload_json: Value,
    pub sequence_number: Option<u32>,
    pub lease_owner_token: String,
    pub assignment_attempt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerJobEventResponse {
    pub accepted: bool,
    pub replayed: bool,
    pub job: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactInitPayload {
    pub artifact_type: String,
    pub file_name: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub checksum_sha256: Option<String>,
    pub lease_owner_token: String,
    pub assignment_attempt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactInitResponse {
    pub key: String,
    pub method: String,
    pub storage_ref: String,
    pub upload_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactCompletePayload {
    pub artifact_type: String,
    pub storage_ref: String,
    pub checksum_sha256: String,
    pub size_bytes: u64,
    pub content_type: Option<String>,
    #[serde(default)]
    pub metadata_json: Value,
    pub lease_owner_token: String,
    pub assignment_attempt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerArtifactCompleteResponse {
    pub created: bool,
    pub artifact: Value,
}

pub fn build_worker_heartbeat_payload(
    runtime_version: &str,
    status: &str,
    current_job_count: u32,
    queue_depth: u32,
    warnings_json: Vec<String>,
    runtime_metadata_json: Value,
) -> WorkerHeartbeatPayload {
    WorkerHeartbeatPayload {
        compatibility: WorkerProtocolCompatibility {
            protocol_version: WORKER_APP_PROTOCOL_VERSION.into(),
            runtime_version: runtime_version.into(),
            runtime_family_schema_version: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION.into(),
            runtime_profile_schema_version: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION.into(),
        },
        runtime_type: WORKER_RUNTIME_TYPE.into(),
        status: status.into(),
        current_job_count,
        queue_depth,
        free_disk_bytes: None,
        metrics_json: serde_json::json!({}),
        warnings_json,
        runtime_metadata_json,
    }
}

pub async fn send_worker_heartbeat(
    connection: &WorkerLoopConnection,
    payload: &WorkerHeartbeatPayload,
) -> Result<WorkerHeartbeatResponse, String> {
    post_json(
        connection,
        &connection.server_url,
        &format!("/api/workers/{}/heartbeat", connection.worker_id),
        &connection.tokens.execution_token,
        payload,
    )
    .await
}

pub async fn claim_worker_job(
    connection: &WorkerLoopConnection,
    payload: &WorkerClaimRequest,
) -> Result<WorkerClaimResponse, String> {
    post_json_with_timeout(
        connection,
        &connection.server_url,
        &format!("/api/workers/{}/jobs/claim", connection.worker_id),
        &connection.tokens.execution_token,
        payload,
        WORKER_CLAIM_TIMEOUT_MS,
    )
    .await
}

/// Feature 135 §11 — request/response shapes for
/// `POST /api/worker-jobs/:jobId/references/urls` (section 06). Mid-job
/// re-mint of a hermes_media_* job's presigned reference URLs; same shape as
/// the claim response's `job.referenceUrls` field.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesReferenceUrlRefreshRequest {
    pub lease_owner_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HermesReferenceUrlRefreshResponse {
    pub reference_urls: Vec<crate::worker_executor::HermesJobReferenceUrl>,
}

/// Re-mints a hermes_media_* job's presigned reference URLs mid-job (e.g.
/// after `expiresAt` is close, or a download came back expired). Uses the
/// same lease-owner-token authentication as job event reporting.
pub async fn refresh_reference_urls(
    connection: &WorkerLoopConnection,
    job_id: &str,
    lease_owner_token: &str,
) -> Result<HermesReferenceUrlRefreshResponse, String> {
    post_json(
        connection,
        &connection.server_url,
        &format!("/api/worker-jobs/{job_id}/references/urls"),
        &connection.tokens.execution_token,
        &HermesReferenceUrlRefreshRequest {
            lease_owner_token: lease_owner_token.to_string(),
        },
    )
    .await
}

pub async fn report_worker_job_event(
    connection: &WorkerLoopConnection,
    job_id: &str,
    payload: &WorkerJobEventPayload,
) -> Result<WorkerJobEventResponse, String> {
    post_json(
        connection,
        &connection.server_url,
        &format!("/api/worker-jobs/{job_id}/events"),
        &connection.tokens.execution_token,
        payload,
    )
    .await
}

pub async fn upload_worker_artifact_file(
    connection: &WorkerLoopConnection,
    job_id: &str,
    artifact_type: &str,
    file_path: &Path,
    file_name: &str,
    content_type: &str,
    lease_owner_token: &str,
    assignment_attempt: &str,
    metadata_json: Value,
) -> Result<WorkerArtifactCompleteResponse, String> {
    let absolute_path = require_file(file_path)?;
    let file_bytes = std::fs::read(&absolute_path)
        .map_err(|error| format!("failed to read artifact: {error}"))?;
    let checksum_sha256 = sha256_hex(&file_bytes);
    let size_bytes = file_bytes.len() as u64;

    let init: WorkerArtifactInitResponse = post_json(
        connection,
        &connection.server_url,
        &format!("/api/worker-jobs/{job_id}/artifacts/init-upload"),
        &connection.tokens.upload_token,
        &WorkerArtifactInitPayload {
            artifact_type: artifact_type.into(),
            file_name: file_name.into(),
            content_type: content_type.into(),
            size_bytes,
            checksum_sha256: Some(checksum_sha256.clone()),
            lease_owner_token: lease_owner_token.into(),
            assignment_attempt: Some(assignment_attempt.into()),
        },
    )
    .await?;

    if init.method != "presigned" {
        return Err(format!(
            "unsupported artifact upload method: {}",
            init.method
        ));
    }
    let upload_url = init
        .upload_url
        .clone()
        .ok_or_else(|| "presigned artifact upload is missing uploadUrl".to_string())?;
    upload_presigned_artifact(&upload_url, content_type, file_bytes).await?;

    post_json(
        connection,
        &connection.server_url,
        &format!("/api/worker-jobs/{job_id}/artifacts/complete"),
        &connection.tokens.upload_token,
        &WorkerArtifactCompletePayload {
            artifact_type: artifact_type.into(),
            storage_ref: init.storage_ref,
            checksum_sha256,
            size_bytes,
            content_type: Some(content_type.into()),
            metadata_json,
            lease_owner_token: lease_owner_token.into(),
            assignment_attempt: Some(assignment_attempt.into()),
        },
    )
    .await
}

pub async fn post_worker_json<T, P>(
    server_url: &str,
    path: &str,
    bearer_token: &str,
    payload: &P,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<T, String>
where
    T: DeserializeOwned,
    P: Serialize + ?Sized,
{
    let url = join_url(server_url, path)?;
    post_worker_json_url_with_timeout(
        url,
        path,
        bearer_token,
        payload,
        device_proof,
        CONTROL_PLANE_TIMEOUT_MS,
    )
    .await
}

/// Device-proof-signed GET.
///
/// Exists so the app can PROVE the server still accepts this worker without
/// spending anything. The refresh endpoint is single-use — using it as a
/// liveness probe (which the launch/hourly health check used to do) rotates
/// credentials the caller did not need rotated, and every rotation is a chance
/// to lose the replacement in transit.
///
/// The server derives the signed method from `req.method` and the path from
/// `req.originalUrl`, and hashes an empty body for a GET — so the canonical
/// payload here must use "GET", the same path string, and `{}`.
pub async fn get_worker_json<T>(
    server_url: &str,
    path: &str,
    bearer_token: &str,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let url = join_url(server_url, path)?;
    let proof_headers = build_device_proof_headers(
        "GET",
        path,
        bearer_token,
        &serde_json::json!({}),
        device_proof,
    )?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(CONTROL_PLANE_TIMEOUT_MS))
        .build()
        .map_err(|error| format!("failed to build worker HTTP client: {error}"))?;
    let mut request = client
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "SmartAIHub-Worker-App/0.1")
        .bearer_auth(bearer_token.trim());
    for (name, value) in proof_headers {
        request = request.header(name, value);
    }
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            format!(
                "worker control plane request timed out after {CONTROL_PLANE_TIMEOUT_MS}ms: {error}"
            )
        } else {
            format!("worker control plane request failed: {error}")
        }
    })?;
    read_json_response(response).await
}

async fn post_worker_json_url_with_timeout<T, P>(
    url: reqwest::Url,
    path: &str,
    bearer_token: &str,
    payload: &P,
    device_proof: &WorkerDeviceProofMaterial,
    timeout_ms: u64,
) -> Result<T, String>
where
    T: DeserializeOwned,
    P: Serialize + ?Sized,
{
    let payload_value = serde_json::to_value(payload)
        .map_err(|error| format!("failed to serialize worker control plane payload: {error}"))?;
    let proof_headers =
        build_device_proof_headers("POST", path, bearer_token, &payload_value, device_proof)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| format!("failed to build worker HTTP client: {error}"))?;
    let mut request = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "SmartAIHub-Worker-App/0.1")
        .bearer_auth(bearer_token.trim());
    for (name, value) in proof_headers {
        request = request.header(name, value);
    }
    let response = request.json(&payload_value).send().await.map_err(|error| {
        if error.is_timeout() {
            format!("worker control plane request timed out after {timeout_ms}ms: {error}")
        } else {
            format!("worker control plane request failed: {error}")
        }
    })?;
    read_json_response(response).await
}

async fn post_json<T, P>(
    connection: &WorkerLoopConnection,
    server_url: &str,
    path: &str,
    bearer_token: &str,
    payload: &P,
) -> Result<T, String>
where
    T: DeserializeOwned,
    P: Serialize + ?Sized,
{
    post_json_with_timeout(
        connection,
        server_url,
        path,
        bearer_token,
        payload,
        CONTROL_PLANE_TIMEOUT_MS,
    )
    .await
}

async fn post_json_with_timeout<T, P>(
    connection: &WorkerLoopConnection,
    server_url: &str,
    path: &str,
    bearer_token: &str,
    payload: &P,
    timeout_ms: u64,
) -> Result<T, String>
where
    T: DeserializeOwned,
    P: Serialize + ?Sized,
{
    let url = join_url(server_url, path)?;
    post_worker_json_url_with_timeout(
        url,
        path,
        bearer_token,
        payload,
        &connection.device_proof,
        timeout_ms,
    )
    .await
}

pub fn build_device_proof_headers(
    method: &str,
    path: &str,
    bearer_token: &str,
    payload: &Value,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<Vec<(String, String)>, String> {
    if device_proof.device_id.trim().is_empty()
        || device_proof.public_key_pem.trim().is_empty()
        || device_proof.machine_fingerprint.trim().is_empty()
    {
        return Err("worker device proof is missing; reconnect this Worker App".into());
    }
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|error| format!("failed to format worker proof timestamp: {error}"))?;
    let nonce = random_nonce();
    let body_hash = sha256_hex(stable_json(payload).as_bytes());
    let jti = jwt_jti(bearer_token)?;
    let canonical = [
        method.to_uppercase(),
        path.to_string(),
        jti,
        timestamp.clone(),
        nonce.clone(),
        body_hash.clone(),
    ]
    .join("\n");
    let signature = device_proof.sign_sha256_base64(&canonical)?;
    Ok(vec![
        ("X-Worker-Device-Id".into(), device_proof.device_id.clone()),
        (
            "X-Worker-Machine-Fingerprint".into(),
            device_proof.machine_fingerprint.clone(),
        ),
        (
            "X-Worker-Device-Public-Key".into(),
            device_proof.public_key_pem.replace('\n', "\\n"),
        ),
        ("X-Worker-Device-Nonce".into(), nonce),
        ("X-Worker-Device-Timestamp".into(), timestamp),
        ("X-Worker-Device-Signature".into(), signature),
        ("X-Worker-Body-Sha256".into(), body_hash),
    ])
}

async fn upload_presigned_artifact(
    upload_url: &str,
    content_type: &str,
    file_bytes: Vec<u8>,
) -> Result<(), String> {
    let url = validate_http_url(upload_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(ARTIFACT_UPLOAD_TIMEOUT_MS))
        .build()
        .map_err(|error| format!("failed to build artifact upload client: {error}"))?;
    let mut last_error = String::new();
    for attempt in 1..=ARTIFACT_UPLOAD_ATTEMPTS {
        let response = client
            .put(url.clone())
            .header("Content-Type", content_type)
            .header("User-Agent", "SmartAIHub-Worker-App/0.1")
            .body(file_bytes.clone())
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) => {
                last_error = format!("artifact upload failed with HTTP {}", response.status());
            }
            Err(error) => {
                last_error = format!("artifact upload request failed: {error}");
            }
        }
        if attempt < ARTIFACT_UPLOAD_ATTEMPTS {
            let backoff_ms = 750_u64 * attempt as u64;
            std::thread::sleep(Duration::from_millis(backoff_ms));
        }
    }
    Err(format!(
        "{last_error} after {ARTIFACT_UPLOAD_ATTEMPTS} attempts"
    ))
}

async fn read_json_response<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read control plane response: {error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|payload| {
                payload
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| {
                        payload
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(Value::as_str)
                            .map(str::to_string)
                    })
                    .or_else(|| {
                        payload
                            .get("error")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                    })
            })
            .unwrap_or_else(|| body.chars().take(240).collect());
        return Err(format!(
            "worker control plane returned HTTP {status}: {message}"
        ));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|error| format!("failed to parse worker control plane JSON: {error}"))
}

fn join_url(server_url: &str, path: &str) -> Result<reqwest::Url, String> {
    let mut base = validate_http_url(server_url)?;
    base.set_path("");
    base.set_query(None);
    let normalized = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    base.join(&normalized)
        .map_err(|error| format!("invalid worker API path: {error}"))
}

fn validate_http_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed =
        reqwest::Url::parse(raw.trim()).map_err(|error| format!("invalid URL: {error}"))?;
    match parsed.scheme() {
        "https" => Ok(parsed),
        "http"
            if parsed
                .host_str()
                .is_some_and(|host| host == "localhost" || host == "127.0.0.1") =>
        {
            Ok(parsed)
        }
        _ => Err("worker URLs must use https, except localhost development".into()),
    }
}

fn require_file(path: &Path) -> Result<PathBuf, String> {
    if !path.is_file() {
        return Err(format!(
            "artifact file does not exist: {}",
            path.to_string_lossy()
        ));
    }
    path.canonicalize().map_err(|error| error.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn stable_json(value: &Value) -> String {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => value.to_string(),
        Value::Array(items) => {
            format!(
                "[{}]",
                items.iter().map(stable_json).collect::<Vec<_>>().join(",")
            )
        }
        Value::Object(map) => {
            let mut keys = map.keys().collect::<Vec<_>>();
            keys.sort();
            let body = keys
                .into_iter()
                .map(|key| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_else(|_| "\"\"".into()),
                        stable_json(&map[key])
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{body}}}")
        }
    }
}

fn jwt_jti(token: &str) -> Result<String, String> {
    let payload = token
        .trim()
        .split('.')
        .nth(1)
        .ok_or_else(|| "worker token is not a JWT".to_string())?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload)
        .map_err(|error| format!("worker token payload is invalid: {error}"))?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("worker token payload is not JSON: {error}"))?;
    value
        .get("jti")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "worker token is missing jti".to_string())
}

pub fn jwt_exp(token: &str) -> Result<u64, String> {
    let payload = token
        .trim()
        .split('.')
        .nth(1)
        .ok_or_else(|| "worker token is not a JWT".to_string())?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload)
        .map_err(|error| format!("worker token payload is invalid: {error}"))?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("worker token payload is not JSON: {error}"))?;
    value
        .get("exp")
        .and_then(Value::as_u64)
        .ok_or_else(|| "worker token is missing exp".to_string())
}

fn random_nonce() -> String {
    let mut bytes = [0_u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::ensure_device_proof_material;

    #[test]
    fn heartbeat_payload_uses_worker_protocol_contract() {
        let payload = build_worker_heartbeat_payload(
            "0.1.0",
            "online",
            0,
            2,
            vec!["runtime blocked".into()],
            serde_json::json!({ "doctorStatus": "blocked" }),
        );

        assert_eq!(payload.runtime_type, WORKER_RUNTIME_TYPE);
        assert_eq!(
            payload.compatibility.protocol_version,
            WORKER_APP_PROTOCOL_VERSION
        );
        assert_eq!(payload.queue_depth, 2);
        assert_eq!(payload.warnings_json, vec!["runtime blocked"]);
        assert_eq!(payload.runtime_metadata_json["doctorStatus"], "blocked");
    }

    #[test]
    fn heartbeat_response_surfaces_hermes_update_required_warning() {
        let response: WorkerHeartbeatResponse = serde_json::from_value(serde_json::json!({
            "status": "online",
            "workerId": "worker-1",
            "lastSeenAt": "2026-07-17T00:00:00Z",
            "warningFlagsJson": ["Hermes runtime version 0.17.0 is below the required minimum 0.18.2."],
        }))
        .unwrap();

        assert_eq!(response.warning_flags_json.len(), 1);
        assert!(response.warning_flags_json[0].starts_with("Hermes runtime version"));
    }

    #[test]
    fn heartbeat_response_defaults_warning_flags_to_empty_when_absent() {
        let response: WorkerHeartbeatResponse = serde_json::from_value(serde_json::json!({
            "status": "online",
            "workerId": "worker-1",
            "lastSeenAt": null,
        }))
        .unwrap();

        assert!(response.warning_flags_json.is_empty());
    }

    #[test]
    fn hermes_reference_url_refresh_request_serializes_camel_case() {
        let payload = HermesReferenceUrlRefreshRequest {
            lease_owner_token: "lease-1".into(),
        };
        let value = serde_json::to_value(payload).unwrap();

        assert_eq!(value["leaseOwnerToken"], "lease-1");
        assert!(value.get("lease_owner_token").is_none());
    }

    #[test]
    fn hermes_reference_url_refresh_response_parses_claim_response_shape() {
        let response: HermesReferenceUrlRefreshResponse = serde_json::from_value(serde_json::json!({
            "referenceUrls": [
                { "assetId": "asset-1", "url": "https://example.com/a.png", "expiresAt": "2026-01-01T00:00:00Z" }
            ]
        }))
        .unwrap();

        assert_eq!(response.reference_urls.len(), 1);
        assert_eq!(response.reference_urls[0].asset_id, "asset-1");
        assert_eq!(response.reference_urls[0].url, "https://example.com/a.png");
    }

    #[test]
    fn claim_request_uses_worker_control_plane_contract() {
        let payload = WorkerClaimRequest {
            max_jobs: 1,
            capability_hints: vec!["hyperframes-final-composite".into()],
        };
        let value = serde_json::to_value(payload).unwrap();

        assert_eq!(value["maxJobs"], 1);
        assert_eq!(value["capabilityHints"][0], "hyperframes-final-composite");
        assert!(value.get("max_jobs").is_none());
    }

    #[test]
    fn device_proof_headers_cover_path_body_and_jti() {
        let temp = tempfile::tempdir().unwrap();
        let material = ensure_device_proof_material(temp.path()).unwrap();
        let token = "eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJ3b3JrZXJfZXhlY18xIn0.signature";
        let headers = build_device_proof_headers(
            "POST",
            "/api/workers/worker-1/heartbeat",
            token,
            &serde_json::json!({ "b": 2, "a": 1 }),
            &material,
        )
        .unwrap();
        assert!(headers
            .iter()
            .any(|(name, value)| name == "X-Worker-Body-Sha256" && value.len() == 64));
        assert!(headers
            .iter()
            .any(|(name, value)| name == "X-Worker-Device-Public-Key" && value.contains("\\n")));
    }
}
