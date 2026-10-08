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
    use super::{
        map_connect_request_error, request_json_with_agent, safe_refresh_error_code,
        validate_start_pairing_response, StartPairingResponse,
    };
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::Duration,
    };

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

    #[test]
    fn refresh_diagnostics_keep_safe_codes_and_hide_untrusted_error_text() {
        assert_eq!(
            safe_refresh_error_code("RUNNER_CONNECT_REQUEST_REJECTED_503"),
            "RUNNER_CONNECT_REQUEST_REJECTED_503"
        );
        assert_eq!(
            safe_refresh_error_code("RUNNER_CONNECT_DNS_FAILED"),
            "RUNNER_CONNECT_DNS_FAILED"
        );
        assert_eq!(
            safe_refresh_error_code("RUNNER_CONNECT_TLS_FAILED"),
            "RUNNER_CONNECT_TLS_FAILED"
        );
        assert_eq!(
            safe_refresh_error_code("network failed with bearer secret-value"),
            "RUNNER_CREDENTIAL_REFRESH_FAILED"
        );
        assert_eq!(
            safe_refresh_error_code("BEARER_TOKEN_VALUE"),
            "RUNNER_CREDENTIAL_REFRESH_FAILED"
        );
        let untrusted = "https://runner:password@example.test/refresh?token=url-secret Authorization: Bearer access-secret X-Runner-Device-Signature: signature-secret private_key=private-secret response-body-secret";
        let safe = safe_refresh_error_code(untrusted);
        assert_eq!(safe, "RUNNER_CREDENTIAL_REFRESH_FAILED");
        for secret in [
            "password",
            "url-secret",
            "access-secret",
            "signature-secret",
            "private-secret",
            "response-body-secret",
        ] {
            assert!(!safe.contains(secret));
        }
    }

    fn test_agent(timeout: Duration) -> ureq::Agent {
        ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            .build()
            .new_agent()
    }

    fn mock_http_server(response: Vec<u8>, delay: Duration) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            if !delay.is_zero() {
                thread::sleep(delay);
            }
            let _ = stream.write_all(&response);
        });
        (format!("http://{address}/refresh"), server)
    }

    fn json_response(status: u16, body: &str) -> Vec<u8> {
        let reason = match status {
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            429 => "Too Many Requests",
            503 => "Service Unavailable",
            _ => "Test Response",
        };
        format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    fn send_mock_request(
        agent: &ureq::Agent,
        endpoint: &str,
        token: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        request_json_with_agent(agent, "POST", endpoint, token, None, b"{}")
    }

    #[test]
    fn maps_http_statuses_without_reading_or_exposing_response_bodies() {
        for status in [401, 403, 404, 429, 503] {
            let secret_body = r#"{"message":"response-body-secret","token":"body-token-secret"}"#;
            let (endpoint, server) =
                mock_http_server(json_response(status, secret_body), Duration::ZERO);
            let result = send_mock_request(
                &test_agent(Duration::from_secs(1)),
                &endpoint,
                Some("access-token-secret"),
            );
            assert_eq!(
                result.unwrap_err(),
                format!("RUNNER_CONNECT_REQUEST_REJECTED_{status}")
            );
            server.join().unwrap();
        }
    }

    #[test]
    fn classifies_dns_and_connection_failures_without_transport_details() {
        assert_eq!(
            map_connect_request_error(ureq::Error::HostNotFound),
            "RUNNER_CONNECT_DNS_FAILED"
        );

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/refresh", listener.local_addr().unwrap());
        drop(listener);
        let result = send_mock_request(&test_agent(Duration::from_secs(1)), &endpoint, None);
        assert_eq!(result.unwrap_err(), "RUNNER_CONNECT_CONNECTION_FAILED");
    }

    #[test]
    fn classifies_tls_failure_from_local_mock_server() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut client_hello = [0; 2048];
            let _ = stream.read(&mut client_hello);
            let _ = stream.write_all(b"not a TLS record");
        });
        let endpoint = format!("https://{address}/refresh");
        let request = ureq::http::Request::builder()
            .method("POST")
            .uri(&endpoint)
            .body(b"{}".to_vec())
            .unwrap();
        let raw_error = test_agent(Duration::from_secs(1)).run(request).unwrap_err();
        assert_eq!(
            map_connect_request_error(raw_error),
            "RUNNER_CONNECT_TLS_FAILED"
        );
        server.join().unwrap();
    }

    #[test]
    fn classifies_request_timeout_from_local_mock_server() {
        let (endpoint, server) =
            mock_http_server(json_response(200, "{}"), Duration::from_millis(150));
        let result = send_mock_request(&test_agent(Duration::from_millis(25)), &endpoint, None);
        assert_eq!(result.unwrap_err(), "RUNNER_CONNECT_TIMEOUT");
        server.join().unwrap();
    }

    #[test]
    fn classifies_malformed_response_without_including_body() {
        let secret_body = "malformed-response-secret";
        let (endpoint, server) = mock_http_server(json_response(200, secret_body), Duration::ZERO);
        let result = send_mock_request(&test_agent(Duration::from_secs(1)), &endpoint, None);
        let error = result.unwrap_err();
        assert_eq!(error, "RUNNER_CONNECT_RESPONSE_INVALID");
        assert!(!error.contains(secret_body));
        server.join().unwrap();
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

pub fn safe_refresh_error_code(error: &str) -> String {
    let code = error.trim();
    const SAFE_CODES: &[&str] = &[
        "RUNNER_CONNECT_REQUEST_FAILED",
        "RUNNER_CONNECT_DNS_FAILED",
        "RUNNER_CONNECT_CONNECTION_FAILED",
        "RUNNER_CONNECT_TLS_FAILED",
        "RUNNER_CONNECT_TIMEOUT",
        "RUNNER_CONNECT_HTTP_REDIRECT_FAILED",
        "RUNNER_CONNECT_PROXY_INVALID",
        "RUNNER_CONNECT_ENDPOINT_INVALID",
        "RUNNER_CONNECT_REQUEST_BUILD_FAILED",
        "RUNNER_CONNECT_RESPONSE_READ_FAILED",
        "RUNNER_CONNECT_RESPONSE_INVALID",
        "RUNNER_CONNECTION_STORE_READ_FAILED",
        "RUNNER_CONNECTION_STORE_INVALID",
        "RUNNER_CONNECTION_STORE_CREATE_FAILED",
        "RUNNER_CONNECTION_STORE_WRITE_FAILED",
        "RUNNER_CONNECTION_STORE_SERIALIZE_FAILED",
        "RUNNER_CONTROL_ENDPOINT_INVALID",
        "RUNNER_ACCESS_TOKEN_INVALID",
        "RUNNER_ACCESS_TOKEN_MISSING_JTI",
        "RUNNER_DEVICE_PROOF_CONFIGURATION_INCOMPLETE",
        "RUNNER_DEVICE_PROOF_PUBLIC_KEY_INVALID",
        "RUNNER_DEVICE_PROOF_HEADER_INVALID",
        "RUNNER_DEVICE_PRIVATE_KEY_INVALID",
        "RUNNER_DEVICE_PUBLIC_KEY_INVALID",
        "RUNNER_DEVICE_KEY_PAIR_MISMATCH",
        "RUNNER_REFRESH_CONTROL_TOKEN_MISSING",
    ];
    let is_http_rejection = code
        .strip_prefix("RUNNER_CONNECT_REQUEST_REJECTED_")
        .is_some_and(|status| {
            status.len() == 3 && status.bytes().all(|byte| byte.is_ascii_digit())
        });
    if SAFE_CODES.contains(&code) || is_http_rejection {
        code.to_owned()
    } else {
        "RUNNER_CREDENTIAL_REFRESH_FAILED".into()
    }
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
    request_json_with_agent(&agent, method, endpoint, token, proof, body)
}

fn request_json_with_agent<T: for<'de> Deserialize<'de>>(
    agent: &ureq::Agent,
    method: &str,
    endpoint: &str,
    token: Option<&str>,
    proof: Option<&DeviceProofSigner>,
    body: &[u8],
) -> Result<T, String> {
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
    let response = agent.run(request).map_err(map_connect_request_error)?;
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
        .map_err(map_connect_response_read_error)?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_CONNECT_RESPONSE_INVALID".into())
}

fn map_connect_request_error(error: ureq::Error) -> String {
    use ureq::Error;

    match error {
        Error::StatusCode(status) => format!("RUNNER_CONNECT_REQUEST_REJECTED_{status}"),
        Error::HostNotFound => "RUNNER_CONNECT_DNS_FAILED".into(),
        Error::Timeout(_) => "RUNNER_CONNECT_TIMEOUT".into(),
        Error::Io(error) if error.kind() == std::io::ErrorKind::InvalidData => {
            "RUNNER_CONNECT_TLS_FAILED".into()
        }
        Error::Io(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            "RUNNER_CONNECT_TIMEOUT".into()
        }
        Error::Io(_) | Error::ConnectionFailed | Error::ConnectProxyFailed(_) => {
            "RUNNER_CONNECT_CONNECTION_FAILED".into()
        }
        Error::Tls(_) | Error::Rustls(_) | Error::TlsRequired => "RUNNER_CONNECT_TLS_FAILED".into(),
        Error::Protocol(_) | Error::LargeResponseHeader(_, _) | Error::Json(_) => {
            "RUNNER_CONNECT_RESPONSE_INVALID".into()
        }
        Error::BadUri(_) => "RUNNER_CONNECT_ENDPOINT_INVALID".into(),
        Error::InvalidProxyUrl => "RUNNER_CONNECT_PROXY_INVALID".into(),
        Error::RedirectFailed | Error::TooManyRedirects => {
            "RUNNER_CONNECT_HTTP_REDIRECT_FAILED".into()
        }
        Error::Http(_) | Error::BodyExceedsLimit(_) => "RUNNER_CONNECT_REQUEST_BUILD_FAILED".into(),
        _ => "RUNNER_CONNECT_REQUEST_FAILED".into(),
    }
}

fn map_connect_response_read_error(error: ureq::Error) -> String {
    use ureq::Error;

    match error {
        Error::Timeout(_) => "RUNNER_CONNECT_TIMEOUT".into(),
        Error::Io(error) if error.kind() == std::io::ErrorKind::InvalidData => {
            "RUNNER_CONNECT_TLS_FAILED".into()
        }
        Error::Io(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            "RUNNER_CONNECT_TIMEOUT".into()
        }
        Error::Tls(_) | Error::Rustls(_) | Error::TlsRequired => "RUNNER_CONNECT_TLS_FAILED".into(),
        Error::Protocol(_) | Error::LargeResponseHeader(_, _) | Error::Json(_) => {
            "RUNNER_CONNECT_RESPONSE_INVALID".into()
        }
        _ => "RUNNER_CONNECT_RESPONSE_READ_FAILED".into(),
    }
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
