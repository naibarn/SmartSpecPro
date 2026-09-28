use crate::config::{RunnerConfig, RunnerProfile};
use crate::device_proof::{
    canonical_json_bytes, endpoint_path, generate_device_proof_material, DeviceProofMaterial,
    DeviceProofSigner,
};
use crate::{RUNNER_CONNECT_SCHEMA_REVISION, RUNNER_CONTROL_CONTRACT_VERSION, RUNNER_VERSION};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const CONNECTION_FILE_NAME: &str = "runner-connection.json";
const MAX_RESPONSE_BYTES: usize = 128 * 1024;
const MAX_PAIRING_ATTEMPTS: usize = 300;

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredRunnerConnection {
    pub server_url: String,
    pub runner_id: String,
    pub display_name: String,
    pub device_id: String,
    pub machine_fingerprint: String,
    pub public_key_pem: String,
    pub private_key_pem: String,
    pub control_token: String,
    pub refresh_token: String,
    #[serde(default)]
    pub runner_session_id: Option<String>,
    #[serde(default)]
    pub tenant_id: Option<String>,
}

#[derive(Serialize)]
struct StartPairingRequest<'a> {
    #[serde(rename = "runnerId")]
    runner_id: &'a str,
    #[serde(rename = "displayName")]
    display_name: &'a str,
    #[serde(rename = "deviceId")]
    device_id: &'a str,
    #[serde(rename = "machineFingerprint")]
    machine_fingerprint: &'a str,
    #[serde(rename = "publicKey")]
    public_key: &'a str,
    #[serde(rename = "runnerVersion")]
    runner_version: &'a str,
    #[serde(rename = "supportedRunnerContractVersions")]
    supported_runner_contract_versions: &'a [&'a str],
    #[serde(rename = "supportedConnectSchemaRevisions")]
    supported_connect_schema_revisions: &'a [&'a str],
}

#[derive(Deserialize)]
struct StartPairingResponse {
    #[serde(rename = "deviceCode")]
    device_code: String,
    #[serde(rename = "runnerId")]
    runner_id: Option<String>,
    #[serde(rename = "verificationUriComplete")]
    verification_uri_complete: String,
    interval: Option<u64>,
    #[serde(rename = "pairingNonce")]
    pairing_nonce: Option<String>,
    #[serde(rename = "runnerSessionId")]
    runner_session_id: Option<String>,
    #[serde(rename = "controlPlaneContractVersion")]
    control_plane_contract_version: Option<String>,
    #[serde(rename = "connectSchemaRevision")]
    connect_schema_revision: Option<String>,
    #[serde(rename = "minRunnerVersion")]
    min_runner_version: Option<String>,
}

fn compare_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    let parse = |value: &str| {
        let mut parts = value.split('.').map(|part| part.parse::<u64>().ok());
        let parsed = [parts.next()??, parts.next()??, parts.next()??];
        if parts.next().is_some() {
            return None;
        }
        Some(parsed)
    };
    let left = parse(left)?;
    let right = parse(right)?;
    Some(left.cmp(&right))
}

fn validate_start_pairing_response(response: &StartPairingResponse) -> Result<(), String> {
    let Some(control_plane_contract_version) = response.control_plane_contract_version.as_deref()
    else {
        return Err("CONTROL_PLANE_TOO_OLD".into());
    };
    if control_plane_contract_version != RUNNER_CONTROL_CONTRACT_VERSION {
        return Err("UNSUPPORTED_RUNNER_CONTRACT".into());
    }
    let Some(connect_schema_revision) = response.connect_schema_revision.as_deref() else {
        return Err("CONTROL_PLANE_TOO_OLD".into());
    };
    if connect_schema_revision != RUNNER_CONNECT_SCHEMA_REVISION {
        return Err("UNSUPPORTED_RUNNER_CONTRACT".into());
    }
    let Some(min_runner_version) = response.min_runner_version.as_deref() else {
        return Err("CONTROL_PLANE_TOO_OLD".into());
    };
    if compare_versions(RUNNER_VERSION, min_runner_version).is_some_and(|ordering| ordering.is_lt())
    {
        return Err("RUNNER_UPGRADE_REQUIRED".into());
    }
    if response.pairing_nonce.is_none() || response.runner_session_id.is_none() {
        return Err("RUNNER_CONNECT_SCHEMA_INVALID".into());
    }
    Ok(())
}

#[derive(Serialize)]
struct TokenRequest<'a> {
    #[serde(rename = "deviceCode")]
    device_code: &'a str,
    #[serde(rename = "pairingNonce")]
    pairing_nonce: &'a str,
}

#[derive(Deserialize)]
struct RunnerInfo {
    id: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Deserialize)]
struct PollPairingResponse {
    status: String,
    #[serde(rename = "controlToken")]
    control_token: Option<String>,
    #[serde(rename = "refreshToken")]
    refresh_token: Option<String>,
    runner: Option<RunnerInfo>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
    #[serde(rename = "runnerSessionId")]
    runner_session_id: Option<String>,
    #[serde(rename = "tenantId")]
    tenant_id: Option<String>,
}

#[derive(Deserialize)]
struct RefreshResponse {
    #[serde(rename = "controlToken")]
    control_token: Option<String>,
    #[serde(rename = "refreshToken")]
    refresh_token: Option<String>,
    #[serde(rename = "runnerSessionId")]
    runner_session_id: Option<String>,
}

pub fn connection_path(data_root: &str) -> PathBuf {
    Path::new(data_root).join(CONNECTION_FILE_NAME)
}

pub fn load_connection(data_root: &str) -> Result<Option<StoredRunnerConnection>, String> {
    let path = connection_path(data_root);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|_| "RUNNER_CONNECTION_STORE_READ_FAILED")?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "RUNNER_CONNECTION_STORE_INVALID".into())
}

fn save_connection(data_root: &str, connection: &StoredRunnerConnection) -> Result<(), String> {
    let root = Path::new(data_root);
    fs::create_dir_all(root).map_err(|_| "RUNNER_CONNECTION_STORE_CREATE_FAILED")?;
    let path = connection_path(data_root);
    let temp = root.join(format!(
        ".{CONNECTION_FILE_NAME}.tmp-{}",
        std::process::id()
    ));
    let encoded =
        serde_json::to_vec(connection).map_err(|_| "RUNNER_CONNECTION_STORE_SERIALIZE_FAILED")?;
    fs::write(&temp, encoded).map_err(|_| "RUNNER_CONNECTION_STORE_WRITE_FAILED")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
            .map_err(|_| "RUNNER_CONNECTION_STORE_PERMISSION_FAILED")?;
    }
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(&path).map_err(|_| "RUNNER_CONNECTION_STORE_REPLACE_FAILED")?;
    }
    fs::rename(temp, path).map_err(|_| "RUNNER_CONNECTION_STORE_REPLACE_FAILED".to_string())
}

pub fn connect_local_runner(config: &RunnerConfig) -> Result<String, String> {
    if config.profile != RunnerProfile::LocalDevice {
        return Err("RUNNER_CONNECT_REQUIRES_LOCAL_DEVICE".into());
    }
    let control_url = config
        .control_url
        .as_deref()
        .ok_or_else(|| "RUNNER_CONTROL_URL_REQUIRED".to_string())?;
    let server_url = server_base_url(control_url)?;
    let material = generate_device_proof_material(config.device_id.as_deref())?;
    let display_name =
        std::env::var("SAH_RUNNER_DISPLAY_NAME").unwrap_or_else(|_| "SmartAIHub Runner".into());
    let supported_runner_contract_versions = [RUNNER_CONTROL_CONTRACT_VERSION];
    let supported_connect_schema_revisions = [RUNNER_CONNECT_SCHEMA_REVISION];
    let start_body = canonical_json_bytes(&StartPairingRequest {
        runner_id: &config.runner_id,
        display_name: &display_name,
        device_id: &material.device_id,
        machine_fingerprint: &material.machine_fingerprint,
        public_key: &material.public_key_pem,
        runner_version: RUNNER_VERSION,
        supported_runner_contract_versions: &supported_runner_contract_versions,
        supported_connect_schema_revisions: &supported_connect_schema_revisions,
    })?;
    let start_url = format!("{server_url}/api/runners/connect/start");
    let start: StartPairingResponse = request_json("POST", &start_url, None, None, &start_body)?;
    validate_start_pairing_response(&start)?;
    let pairing_nonce = start
        .pairing_nonce
        .as_deref()
        .ok_or_else(|| "RUNNER_CONNECT_SCHEMA_INVALID".to_string())?;
    let runner_session_id = start
        .runner_session_id
        .as_deref()
        .ok_or_else(|| "RUNNER_CONNECT_SCHEMA_INVALID".to_string())?;
    open_browser(&start.verification_uri_complete).map_err(|error| {
        format!(
            "{error}; open this URL to approve the Runner: {}",
            start.verification_uri_complete
        )
    })?;

    let interval = std::time::Duration::from_secs(start.interval.unwrap_or(3).clamp(1, 10));
    let token_url = format!("{server_url}/api/runners/connect/token");
    let mut approved: Option<PollPairingResponse> = None;
    for _ in 0..MAX_PAIRING_ATTEMPTS {
        let body = canonical_json_bytes(&TokenRequest {
            device_code: &start.device_code,
            pairing_nonce,
        })?;
        let response: PollPairingResponse = request_json("POST", &token_url, None, None, &body)?;
        if response.status == "approved" {
            approved = Some(response);
            break;
        }
        if matches!(response.status.as_str(), "expired" | "error") {
            return Err(response
                .error_message
                .unwrap_or_else(|| "RUNNER_CONNECT_APPROVAL_FAILED".into()));
        }
        std::thread::sleep(interval);
    }
    let response = approved.ok_or_else(|| "RUNNER_CONNECT_APPROVAL_TIMEOUT".to_string())?;
    if response.runner_session_id.as_deref() != Some(runner_session_id) {
        return Err("RUNNER_SESSION_MISMATCH".into());
    }
    let control_token = response
        .control_token
        .clone()
        .ok_or_else(|| "RUNNER_CONNECT_CONTROL_TOKEN_MISSING".to_string())?;
    let connection = StoredRunnerConnection {
        server_url,
        runner_id: response
            .runner
            .as_ref()
            .map(|runner| runner.id.clone())
            .or(start.runner_id)
            .unwrap_or_else(|| config.runner_id.clone()),
        display_name: response
            .runner
            .as_ref()
            .map(|runner| runner.display_name.clone())
            .unwrap_or(display_name),
        device_id: material.device_id.clone(),
        machine_fingerprint: material.machine_fingerprint.clone(),
        public_key_pem: material.public_key_pem.clone(),
        private_key_pem: material.private_key_pem.clone(),
        control_token: control_token.clone(),
        refresh_token: response
            .refresh_token
            .ok_or_else(|| "RUNNER_CONNECT_REFRESH_TOKEN_MISSING".to_string())?,
        runner_session_id: response.runner_session_id,
        tenant_id: response
            .tenant_id
            .or_else(|| token_tenant_id(&control_token)),
    };
    save_connection(&config.data_root, &connection)?;
    Ok(json!({
        "state": "connected",
        "runnerId": connection.runner_id,
        "displayName": connection.display_name,
        "credentials": "stored_locally"
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::{validate_start_pairing_response, StartPairingResponse};

    fn current_response() -> StartPairingResponse {
        StartPairingResponse {
            device_code: "device-code".into(),
            runner_id: Some("runner-1".into()),
            verification_uri_complete: "https://example.test/runners/connect?code=ABC".into(),
            interval: Some(3),
            pairing_nonce: Some("nonce".into()),
            runner_session_id: Some("session-1".into()),
            control_plane_contract_version: Some("sah-runner-v1".into()),
            connect_schema_revision: Some("sah-runner-connect-v2".into()),
            min_runner_version: Some("0.1.0".into()),
        }
    }

    #[test]
    fn rejects_a_legacy_control_plane_explicitly() {
        let mut response = current_response();
        response.control_plane_contract_version = None;
        assert_eq!(
            validate_start_pairing_response(&response).unwrap_err(),
            "CONTROL_PLANE_TOO_OLD"
        );
    }

    #[test]
    fn rejects_an_unsupported_contract_explicitly() {
        let mut response = current_response();
        response.connect_schema_revision = Some("sah-runner-connect-v1".into());
        assert_eq!(
            validate_start_pairing_response(&response).unwrap_err(),
            "UNSUPPORTED_RUNNER_CONTRACT"
        );
    }

    #[test]
    fn rejects_a_runner_upgrade_requirement_explicitly() {
        let mut response = current_response();
        response.min_runner_version = Some("0.2.0".into());
        assert_eq!(
            validate_start_pairing_response(&response).unwrap_err(),
            "RUNNER_UPGRADE_REQUIRED"
        );
    }

    #[test]
    fn accepts_the_current_connect_contract() {
        assert!(validate_start_pairing_response(&current_response()).is_ok());
    }
}

pub fn load_or_refresh(config: &RunnerConfig) -> Result<Option<StoredRunnerConnection>, String> {
    let Some(mut connection) = load_connection(&config.data_root)? else {
        return Ok(None);
    };
    if token_valid_for(&connection.control_token, 60) {
        return Ok(Some(connection));
    }
    let material = DeviceProofMaterial {
        device_id: connection.device_id.clone(),
        machine_fingerprint: connection.machine_fingerprint.clone(),
        public_key_pem: connection.public_key_pem.clone(),
        private_key_pem: connection.private_key_pem.clone(),
    };
    let proof = DeviceProofSigner::from_material(&material, &connection.refresh_token)?;
    let endpoint = format!(
        "{}/api/runners/{}/access/refresh",
        connection.server_url,
        percent_encode(&connection.runner_id)
    );
    let body = b"{}";
    let response: RefreshResponse = request_json(
        "POST",
        &endpoint,
        Some(&connection.refresh_token),
        Some(&proof),
        body,
    )?;
    connection.control_token = response
        .control_token
        .ok_or_else(|| "RUNNER_REFRESH_CONTROL_TOKEN_MISSING".to_string())?;
    if let Some(refresh_token) = response.refresh_token {
        connection.refresh_token = refresh_token;
    }
    if let Some(runner_session_id) = response.runner_session_id {
        connection.runner_session_id = Some(runner_session_id);
    }
    save_connection(&config.data_root, &connection)?;
    Ok(Some(connection))
}

pub fn token_tenant_id(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims
        .get("tenantId")
        .or_else(|| claims.get("tenant_id"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
}

pub fn token_runner_session_id(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims
        .get("runnerSessionId")
        .or_else(|| claims.get("runner_session_id"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
}

pub fn token_expiry_ms(token: &str) -> Option<u64> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims
        .get("exp")
        .and_then(serde_json::Value::as_u64)
        .map(|seconds| seconds.saturating_mul(1000))
}

fn request_json<T: for<'de> Deserialize<'de>>(
    method: &str,
    endpoint: &str,
    token: Option<&str>,
    proof: Option<&DeviceProofSigner>,
    body: &[u8],
) -> Result<T, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .build()
        .new_agent();
    let path = endpoint_path(endpoint).map_err(|_| "RUNNER_CONNECT_ENDPOINT_INVALID")?;
    let mut request_builder = ureq::http::Request::builder()
        .method(method)
        .uri(endpoint)
        .header("Content-Type", "application/json");
    if let Some(token) = token {
        request_builder = request_builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(proof) = proof {
        let headers = proof.headers(method, &path, body)?;
        request_builder = request_builder
            .header("X-Runner-Device-Id", headers.device_id)
            .header("X-Runner-Device-Public-Key", headers.public_key)
            .header("X-Runner-Machine-Fingerprint", headers.machine_fingerprint)
            .header("X-Runner-Device-Nonce", headers.nonce)
            .header("X-Runner-Device-Timestamp", headers.timestamp)
            .header("X-Runner-Device-Signature", headers.signature)
            .header("X-Runner-Body-Sha256", headers.body_hash);
    }
    let request = request_builder
        .body(body.to_vec())
        .map_err(|_| "RUNNER_CONNECT_REQUEST_BUILD_FAILED")?;
    let response = agent
        .run(request)
        .map_err(|_| "RUNNER_CONNECT_REQUEST_FAILED")?;
    if !response.status().is_success() {
        return Err(format!(
            "RUNNER_CONNECT_REQUEST_REJECTED_{}",
            response.status().as_u16()
        ));
    }
    let bytes = response
        .into_body()
        .with_config()
        .limit(MAX_RESPONSE_BYTES as u64)
        .read_to_vec()
        .map_err(|_| "RUNNER_CONNECT_RESPONSE_READ_FAILED")?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_CONNECT_RESPONSE_INVALID".into())
}

fn server_base_url(control_url: &str) -> Result<String, String> {
    let (scheme, authority_and_path) = control_url
        .split_once("://")
        .ok_or_else(|| "RUNNER_CONTROL_ENDPOINT_INVALID".to_string())?;
    let authority = authority_and_path
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "RUNNER_CONTROL_ENDPOINT_INVALID".to_string())?;
    Ok(format!("{scheme}://{authority}"))
}

fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url).spawn();
    result
        .map(|_| ())
        .map_err(|_| "RUNNER_BROWSER_OPEN_FAILED".into())
}

fn token_valid_for(token: &str, minimum_seconds: u64) -> bool {
    let Some(payload) = token.split('.').nth(1) else {
        return false;
    };
    let Ok(decoded) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload) else {
        return false;
    };
    let Ok(claims) = serde_json::from_slice::<serde_json::Value>(&decoded) else {
        return false;
    };
    let Some(exp) = claims.get("exp").and_then(serde_json::Value::as_u64) else {
        return false;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    exp > now.saturating_add(minimum_seconds)
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
