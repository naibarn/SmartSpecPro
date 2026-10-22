use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use getrandom::fill;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

const CLIENT_ID: &str = "smartaihub-runner-companion";
const COMPANION_SCOPE: &str = "runner:companion:read";
const CHAT_SCOPE: &str = "llm:chat";
const SESSION_FILE: &str = "runner-companion-session.json";
const PENDING_FILE: &str = "runner-companion-device.json";
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const PENDING_REVOCATION_MAX_AGE_MS: u64 = 31 * 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingAuthorization {
    server_url: String,
    device_id: String,
    device_code: String,
    expires_at_ms: u64,
    interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingRevocation {
    session: CompanionSession,
    created_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionSession {
    pub server_url: String,
    pub tenant_id: String,
    pub user_id: u64,
    pub session_id: String,
    pub device_id_hash: String,
    device_id: String,
    access_token: String,
    refresh_token: String,
    access_token_expires_at_ms: u64,
    #[serde(default)]
    scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionLogoutResult {
    pub local_signed_out: bool,
    pub server_revocation: &'static str,
    pub pending_revocation: bool,
    pub reason_code: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionAuthStatus {
    pub schema_version: &'static str,
    pub availability: &'static str,
    pub authentication: &'static str,
    pub transport: &'static str,
    pub reason_code: &'static str,
    pub detail: &'static str,
    pub tenant_id: Option<String>,
    pub user_id: Option<u64>,
    pub expires_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionAuthStart {
    pub verification_uri: String,
    pub user_code: String,
    pub expires_at_ms: u64,
    pub interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionAuthPoll {
    pub state: &'static str,
    pub expires_at_ms: Option<u64>,
    pub tenant_id: Option<String>,
    pub user_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionChatResult {
    pub conversation_id: u64,
    pub content: String,
    pub assistant_message_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    verification_uri_complete: String,
    user_code: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    user: TokenUser,
}

#[derive(Debug, Deserialize)]
struct TokenUser {
    id: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn session_path(data_root: &str) -> PathBuf {
    Path::new(data_root).join(SESSION_FILE)
}

fn pending_path(data_root: &str) -> PathBuf {
    Path::new(data_root).join(PENDING_FILE)
}

fn revocation_path(data_root: &str) -> PathBuf {
    Path::new(data_root).join("runner-companion-revocation.json")
}

fn protected_file_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn refresh_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(windows)]
fn protect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, DATA_BLOB};
    use windows_sys::Win32::System::Memory::LocalFree;
    let mut input = DATA_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &mut input,
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null(),
            0,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err("RUNNER_COMPANION_SECRET_PROTECTION_FAILED".into());
    }
    let protected =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(protected)
}

#[cfg(windows)]
fn unprotect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, DATA_BLOB};
    use windows_sys::Win32::System::Memory::LocalFree;
    let mut input = DATA_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null(),
            0,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err("RUNNER_COMPANION_SECRET_UNPROTECTION_FAILED".into());
    }
    let plain = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(plain)
}

fn write_protected<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let _guard = protected_file_lock()
        .lock()
        .map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    let parent = path
        .parent()
        .ok_or("RUNNER_COMPANION_SESSION_PATH_INVALID")?;
    fs::create_dir_all(parent).map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    #[cfg(unix)]
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
        .map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    let plain =
        serde_json::to_vec(value).map_err(|_| "RUNNER_COMPANION_SESSION_SERIALIZE_FAILED")?;
    #[cfg(windows)]
    let bytes = URL_SAFE_NO_PAD
        .encode(protect(&plain).map_err(|_| "RUNNER_COMPANION_SECRET_PROTECTION_FAILED")?)
        .into_bytes();
    #[cfg(not(windows))]
    let bytes = plain;
    let mut random = [0_u8; 8];
    fill(&mut random).map_err(|_| "RUNNER_COMPANION_ID_GENERATION_FAILED")?;
    let temp = path.with_file_name(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("runner-companion"),
        hex(&random),
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temp)
        .map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    let result = file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .and_then(|_| fs::rename(&temp, path));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
        return Err("RUNNER_COMPANION_SESSION_IO_FAILED".into());
    }
    Ok(())
}

fn read_protected<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    #[cfg(windows)]
    let plain = unprotect(
        &URL_SAFE_NO_PAD
            .decode(bytes)
            .map_err(|_| "RUNNER_COMPANION_SESSION_INVALID")?,
    )?;
    #[cfg(not(windows))]
    let plain = bytes;
    serde_json::from_slice(&plain)
        .map(Some)
        .map_err(|_| "RUNNER_COMPANION_SESSION_INVALID".into())
}

fn server_base_url(control_url: &str) -> Result<String, String> {
    let (scheme, rest) = control_url
        .split_once("://")
        .ok_or("RUNNER_COMPANION_ENDPOINT_INVALID")?;
    let authority = rest
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or("RUNNER_COMPANION_ENDPOINT_INVALID")?;
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
        .map_err(|_| "RUNNER_COMPANION_BROWSER_OPEN_FAILED".into())
}

fn request_json<T: for<'de> Deserialize<'de>>(
    method: &str,
    endpoint: &str,
    body: serde_json::Value,
    access_token: Option<&str>,
    device_id: Option<&str>,
) -> Result<T, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(REQUEST_TIMEOUT))
        .build()
        .new_agent();
    let mut builder = ureq::http::Request::builder()
        .method(method)
        .uri(endpoint)
        .header("Content-Type", "application/json");
    if let Some(token) = access_token {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(device) = device_id {
        builder = builder.header("X-Runner-Companion-Device-Id", device);
    }
    let request = builder
        .body(serde_json::to_vec(&body).map_err(|_| "RUNNER_COMPANION_REQUEST_INVALID")?)
        .map_err(|_| "RUNNER_COMPANION_REQUEST_INVALID")?;
    let response = agent.run(request).map_err(|error| match error {
        ureq::Error::StatusCode(401) => "RUNNER_COMPANION_UNAUTHORIZED",
        ureq::Error::StatusCode(403) => "RUNNER_COMPANION_FORBIDDEN",
        ureq::Error::StatusCode(400) => "RUNNER_COMPANION_REQUEST_REJECTED",
        ureq::Error::Timeout(_) => "RUNNER_COMPANION_TIMEOUT",
        ureq::Error::HostNotFound => "RUNNER_COMPANION_DNS_FAILED",
        _ => "RUNNER_COMPANION_TRANSPORT_FAILED",
    })?;
    let bytes = response
        .into_body()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_vec()
        .map_err(|_| "RUNNER_COMPANION_RESPONSE_INVALID")?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_COMPANION_RESPONSE_INVALID".into())
}

fn request_sse(
    endpoint: &str,
    body: serde_json::Value,
    access_token: &str,
    device_id: &str,
    idempotency_key: &str,
) -> Result<String, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(120)))
        .build()
        .new_agent();
    let request = ureq::http::Request::builder()
        .method("POST")
        .uri(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {access_token}"))
        .header("X-Runner-Companion-Device-Id", device_id)
        .header("Idempotency-Key", idempotency_key)
        .body(serde_json::to_vec(&body).map_err(|_| "RUNNER_COMPANION_CHAT_REQUEST_INVALID")?)
        .map_err(|_| "RUNNER_COMPANION_CHAT_REQUEST_INVALID")?;
    let response = agent.run(request).map_err(|error| match error {
        ureq::Error::StatusCode(401) => "RUNNER_COMPANION_UNAUTHORIZED",
        ureq::Error::StatusCode(403) => "RUNNER_COMPANION_FORBIDDEN",
        ureq::Error::Timeout(_) => "RUNNER_COMPANION_CHAT_TIMEOUT",
        _ => "RUNNER_COMPANION_CHAT_TRANSPORT_FAILED",
    })?;
    let bytes = response
        .into_body()
        .with_config()
        .limit(8 * 1024 * 1024)
        .read_to_vec()
        .map_err(|_| "RUNNER_COMPANION_CHAT_RESPONSE_INVALID")?;
    String::from_utf8(bytes).map_err(|_| "RUNNER_COMPANION_CHAT_RESPONSE_INVALID".into())
}

fn trpc_data(value: serde_json::Value) -> Result<serde_json::Value, String> {
    value
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(|data| data.get("json").or(Some(data)))
        .cloned()
        .ok_or_else(|| "RUNNER_COMPANION_CHAT_RESPONSE_INVALID".into())
}

fn random_idempotency_key() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes).map_err(|_| "RUNNER_COMPANION_ID_GENERATION_FAILED")?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub fn submit_chat(
    data_root: &str,
    content: &str,
    conversation_id: Option<u64>,
) -> Result<CompanionChatResult, String> {
    let path = session_path(data_root);
    let Some(session) = read_protected::<CompanionSession>(&path)? else {
        return Err("RUNNER_COMPANION_AUTH_REQUIRED".into());
    };
    let session = refresh_if_needed(data_root, session)?;
    if !session.scopes.iter().any(|scope| scope == CHAT_SCOPE) {
        return Err("RUNNER_COMPANION_CHAT_SCOPE_REQUIRED".into());
    }
    let conversation_id = match conversation_id {
        Some(id) if id > 0 => id,
        _ => {
            let response: serde_json::Value = request_json(
                "POST",
                &format!(
                    "{}/trpc/chat.createPersonalConversation",
                    session.server_url
                ),
                json!({ "json": { "title": "SmartAIHub Companion" } }),
                Some(&session.access_token),
                Some(&session.device_id),
            )?;
            trpc_data(response)?
                .get("id")
                .and_then(serde_json::Value::as_u64)
                .ok_or("RUNNER_COMPANION_CHAT_CONVERSATION_INVALID")?
        }
    };
    let user_message: serde_json::Value = request_json(
        "POST",
        &format!("{}/trpc/chat.sendMessage", session.server_url),
        json!({ "json": { "conversationId": conversation_id, "content": content } }),
        Some(&session.access_token),
        Some(&session.device_id),
    )?;
    let user_message = trpc_data(user_message)?;
    if user_message
        .get("id")
        .and_then(serde_json::Value::as_u64)
        .is_none()
    {
        return Err("RUNNER_COMPANION_CHAT_MESSAGE_REJECTED".into());
    }
    let idempotency_key = random_idempotency_key()?;
    let sse = request_sse(
        &format!("{}/api/llm/stream", session.server_url),
        json!({
            "messages": [{ "role": "user", "content": content }],
            "stream": true,
            "conversationId": conversation_id,
        }),
        &session.access_token,
        &session.device_id,
        &idempotency_key,
    )?;
    let mut assistant = String::new();
    let mut assistant_message_id = None;
    for line in sse.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data == "[DONE]" || data.is_empty() {
            continue;
        }
        let parsed: serde_json::Value =
            serde_json::from_str(data).map_err(|_| "RUNNER_COMPANION_CHAT_RESPONSE_INVALID")?;
        if parsed.get("error").is_some() {
            return Err("RUNNER_COMPANION_CHAT_FAILED".into());
        }
        if let Some(id) = parsed.get("id").and_then(serde_json::Value::as_u64) {
            assistant_message_id = Some(id);
        }
        if let Some(content) = parsed.get("content").and_then(serde_json::Value::as_str) {
            if assistant.is_empty() {
                assistant.push_str(content);
            }
        }
        if let Some(content) = parsed
            .pointer("/choices/0/delta/content")
            .and_then(serde_json::Value::as_str)
        {
            assistant.push_str(content);
        }
    }
    Ok(CompanionChatResult {
        conversation_id,
        content: assistant,
        assistant_message_id,
    })
}

pub fn status(data_root: &str) -> CompanionAuthStatus {
    match read_protected::<CompanionSession>(&session_path(data_root)) {
        Ok(Some(session)) => {
            let expired = session.access_token_expires_at_ms <= now_ms();
            CompanionAuthStatus {
                schema_version: "runner-companion.v1",
                availability: if expired { "stale" } else { "authenticated" },
                authentication: "desktop_session",
                transport: "authenticated_http",
                reason_code: if expired {
                    "RUNNER_COMPANION_TOKEN_RENEWAL_REQUIRED"
                } else {
                    "RUNNER_COMPANION_AUTHENTICATED"
                },
                detail: if expired {
                    "The desktop session requires a bounded refresh before reading Task Control."
                } else {
                    "Authenticated user-scoped projection transport is available."
                },
                tenant_id: Some(session.tenant_id),
                user_id: Some(session.user_id),
                expires_at_ms: Some(session.access_token_expires_at_ms),
            }
        }
        Ok(None) => CompanionAuthStatus {
            schema_version: "runner-companion.v1",
            availability: "unavailable",
            authentication: "not_configured",
            transport: "not_configured",
            reason_code: "RUNNER_COMPANION_AUTH_REQUIRED",
            detail: "Sign in through the SmartAIHub browser authorization flow to connect the companion.",
            tenant_id: None,
            user_id: None,
            expires_at_ms: None,
        },
        Err(_) => CompanionAuthStatus {
            schema_version: "runner-companion.v1",
            availability: "unavailable",
            authentication: "invalid",
            transport: "not_configured",
            reason_code: "RUNNER_COMPANION_SESSION_INVALID",
            detail: "The local companion session is unavailable and must be authorized again.",
            tenant_id: None,
            user_id: None,
            expires_at_ms: None,
        },
    }
}

pub fn begin_auth(control_url: &str, data_root: &str) -> Result<CompanionAuthStart, String> {
    retry_pending_revocation(data_root);
    let server_url = server_base_url(control_url)?;
    let mut random = [0_u8; 16];
    fill(&mut random).map_err(|_| "RUNNER_COMPANION_ID_GENERATION_FAILED")?;
    let device_id = URL_SAFE_NO_PAD.encode(random);
    let response: DeviceCodeResponse = request_json(
        "POST",
        &format!("{server_url}/auth/device/code"),
        json!({ "client_id": CLIENT_ID, "device_id": device_id, "scopes": [COMPANION_SCOPE, CHAT_SCOPE] }),
        None,
        None,
    )?;
    let expires_at_ms = now_ms().saturating_add(response.expires_in.saturating_mul(1000));
    write_protected(
        &pending_path(data_root),
        &PendingAuthorization {
            server_url,
            device_id,
            device_code: response.device_code,
            expires_at_ms,
            interval_seconds: response.interval,
        },
    )?;
    open_browser(&response.verification_uri_complete)?;
    Ok(CompanionAuthStart {
        verification_uri: response.verification_uri_complete,
        user_code: response.user_code,
        expires_at_ms,
        interval_seconds: response.interval,
    })
}

pub fn poll_auth(data_root: &str) -> Result<CompanionAuthPoll, String> {
    let path = pending_path(data_root);
    let Some(pending) = read_protected::<PendingAuthorization>(&path)? else {
        return Ok(CompanionAuthPoll {
            state: "not_started",
            expires_at_ms: None,
            tenant_id: None,
            user_id: None,
        });
    };
    if pending.expires_at_ms <= now_ms() {
        let _ = fs::remove_file(path);
        return Ok(CompanionAuthPoll {
            state: "expired",
            expires_at_ms: None,
            tenant_id: None,
            user_id: None,
        });
    }
    let response = request_json::<TokenResponse>(
        "POST",
        &format!("{}/auth/device/token", pending.server_url),
        json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": pending.device_code }),
        None,
        None,
    );
    match response {
        Ok(tokens) => {
            let device_hash = Sha256::digest(&pending.device_id);
            if token_claim_string(&tokens.access_token, "deviceIdHash").as_deref()
                != Some(hex(&device_hash).as_str())
            {
                return Err("RUNNER_COMPANION_TOKEN_DEVICE_MISMATCH".into());
            }
            let device_id_hash = hex(&device_hash);
            if token_claim_u64(&tokens.access_token, "userId") != Some(tokens.user.id)
                || !token_claims_match_companion(&tokens.access_token, &device_id_hash, None, None)
            {
                return Err("RUNNER_COMPANION_TOKEN_BINDING_INVALID".into());
            }
            let scopes = token_claim_scopes(&tokens.access_token);
            let session = CompanionSession {
                server_url: pending.server_url,
                tenant_id: token_tenant_id(&tokens.access_token)
                    .ok_or("RUNNER_COMPANION_TOKEN_TENANT_MISSING")?,
                user_id: tokens.user.id,
                session_id: token_claim_string(&tokens.access_token, "sessionId")
                    .ok_or("RUNNER_COMPANION_TOKEN_SESSION_MISSING")?,
                device_id_hash,
                device_id: pending.device_id,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                access_token_expires_at_ms: now_ms()
                    .saturating_add(tokens.expires_in.saturating_mul(1000)),
                scopes,
            };
            write_protected(&session_path(data_root), &session)?;
            let _ = fs::remove_file(path);
            Ok(CompanionAuthPoll {
                state: "authenticated",
                expires_at_ms: Some(session.access_token_expires_at_ms),
                tenant_id: Some(session.tenant_id),
                user_id: Some(session.user_id),
            })
        }
        Err(error) if error == "RUNNER_COMPANION_REQUEST_REJECTED" => Ok(CompanionAuthPoll {
            state: "pending",
            expires_at_ms: Some(pending.expires_at_ms),
            tenant_id: None,
            user_id: None,
        }),
        Err(error) => Err(error),
    }
}

fn token_tenant_id(token: &str) -> Option<String> {
    token_claim_string(token, "tenantId")
}

fn token_claim_string(token: &str, claim: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims
        .get(claim)
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
}

fn token_claim_u64(token: &str, claim: &str) -> Option<u64> {
    let payload = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    claims.get(claim).and_then(serde_json::Value::as_u64)
}

fn token_claim_scopes(token: &str) -> Vec<String> {
    let payload = match token.split('.').nth(1) {
        Some(value) => value,
        None => return Vec::new(),
    };
    let decoded = match URL_SAFE_NO_PAD.decode(payload) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let claims = match serde_json::from_slice::<serde_json::Value>(&decoded) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    claims
        .get("scopes")
        .and_then(serde_json::Value::as_array)
        .map(|scopes| {
            scopes
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn token_claims_match_companion(
    token: &str,
    expected_device_hash: &str,
    expected_session_id: Option<&str>,
    expected_tenant_id: Option<&str>,
) -> bool {
    let scopes = token_claim_scopes(token);
    let valid_scopes = scopes == [COMPANION_SCOPE.to_string()]
        || scopes == [COMPANION_SCOPE.to_string(), CHAT_SCOPE.to_string()];
    token_claim_string(token, "clientId").as_deref() == Some(CLIENT_ID)
        && token_claim_string(token, "aud").as_deref() == Some(CLIENT_ID)
        && token_claim_string(token, "tokenUse").as_deref() == Some("desktop_session")
        && token_claim_string(token, "deviceIdHash").as_deref() == Some(expected_device_hash)
        && expected_session_id
            .map(|expected| token_claim_string(token, "sessionId").as_deref() == Some(expected))
            .unwrap_or(true)
        && expected_tenant_id
            .map(|expected| token_claim_string(token, "tenantId").as_deref() == Some(expected))
            .unwrap_or(true)
        && valid_scopes
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn refresh_if_needed(
    data_root: &str,
    mut session: CompanionSession,
) -> Result<CompanionSession, String> {
    if session.access_token_expires_at_ms > now_ms().saturating_add(60_000) {
        return Ok(session);
    }
    let response: TokenResponse = request_json(
        "POST",
        &format!("{}/auth/device/token", session.server_url),
        json!({ "grant_type": "refresh_token", "refresh_token": session.refresh_token }),
        None,
        None,
    )?;
    if response.user.id != session.user_id
        || token_claim_u64(&response.access_token, "userId") != Some(session.user_id)
        || token_tenant_id(&response.access_token).as_deref() != Some(&session.tenant_id)
        || !token_claims_match_companion(
            &response.access_token,
            &session.device_id_hash,
            Some(&session.session_id),
            Some(&session.tenant_id),
        )
    {
        return Err("RUNNER_COMPANION_TOKEN_BINDING_INVALID".into());
    }
    session.access_token = response.access_token;
    session.refresh_token = response.refresh_token;
    session.access_token_expires_at_ms =
        now_ms().saturating_add(response.expires_in.saturating_mul(1000));
    // The original user, tenant, installation and session bindings remain
    // immutable across rotation; only the token material and expiry change.
    session.scopes = token_claim_scopes(&session.access_token);
    write_protected(&session_path(data_root), &session)?;
    Ok(session)
}

fn load_session_for_request(data_root: &str) -> Result<CompanionSession, String> {
    let _guard = refresh_lock()
        .lock()
        .map_err(|_| "RUNNER_COMPANION_REFRESH_SERIALIZATION_FAILED")?;
    let Some(session) = read_protected::<CompanionSession>(&session_path(data_root))? else {
        return Err("RUNNER_COMPANION_AUTH_REQUIRED".into());
    };
    refresh_if_needed(data_root, session)
}

pub fn fetch_state(data_root: &str) -> Result<serde_json::Value, String> {
    let session = load_session_for_request(data_root)?;
    request_json(
        "GET",
        &format!("{}/api/runner-companion/v1/state", session.server_url),
        json!({}),
        Some(&session.access_token),
        Some(&session.device_id),
    )
}

fn revocation_confirmed(response: &serde_json::Value) -> bool {
    response.get("success").and_then(serde_json::Value::as_bool) == Some(true)
        && response
            .pointer("/revoked/access_token")
            .and_then(serde_json::Value::as_bool)
            == Some(true)
        && response
            .pointer("/revoked/refresh_token")
            .and_then(serde_json::Value::as_bool)
            == Some(true)
}

fn revocation_reason(error: &str) -> &'static str {
    match error {
        "RUNNER_COMPANION_TIMEOUT" => "RUNNER_COMPANION_REVOCATION_TIMEOUT",
        "RUNNER_COMPANION_DNS_FAILED" | "RUNNER_COMPANION_TRANSPORT_FAILED" => {
            "RUNNER_COMPANION_REVOCATION_OFFLINE"
        }
        "RUNNER_COMPANION_UNAUTHORIZED"
        | "RUNNER_COMPANION_FORBIDDEN"
        | "RUNNER_COMPANION_REQUEST_REJECTED" => "RUNNER_COMPANION_REVOCATION_REJECTED",
        _ => "RUNNER_COMPANION_REVOCATION_UNCONFIRMED",
    }
}

fn pending_revocation(data_root: &str, session: &CompanionSession) -> bool {
    write_protected(
        &revocation_path(data_root),
        &PendingRevocation {
            session: session.clone(),
            created_at_ms: now_ms(),
        },
    )
    .is_ok()
}

fn retry_pending_revocation(data_root: &str) {
    let path = revocation_path(data_root);
    let Ok(Some(pending)) = read_protected::<PendingRevocation>(&path) else {
        return;
    };
    if now_ms().saturating_sub(pending.created_at_ms) > PENDING_REVOCATION_MAX_AGE_MS {
        let _ = fs::remove_file(path);
        return;
    }
    let response = request_json::<serde_json::Value>(
        "POST",
        &format!("{}/auth/device/revoke", pending.session.server_url),
        json!({
            "access_token": pending.session.access_token,
            "refresh_token": pending.session.refresh_token
        }),
        None,
        None,
    );
    if response
        .as_ref()
        .ok()
        .is_some_and(|value| revocation_confirmed(value))
    {
        let _ = fs::remove_file(path);
    }
}

pub fn logout(data_root: &str) -> Result<CompanionLogoutResult, String> {
    let path = session_path(data_root);
    let pending = pending_path(data_root);
    let revocation = revocation_path(data_root);
    // A corrupt or unreadable local record must not prevent local sign-out.
    // Treat it as unavailable and remove the files below; no server claim is
    // made because the credentials cannot be recovered safely.
    let session = read_protected::<CompanionSession>(&path).ok().flatten();
    let pending_session = read_protected::<PendingRevocation>(&revocation)
        .ok()
        .flatten()
        .map(|item| item.session);

    // Clear active credentials before any network operation. Local sign-out is
    // therefore fail-closed even when the server is offline or rejects revoke.
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(pending);

    let Some(session) = session.or(pending_session) else {
        return Ok(CompanionLogoutResult {
            local_signed_out: true,
            server_revocation: "not_attempted",
            pending_revocation: false,
            reason_code: "RUNNER_COMPANION_LOCAL_SIGNOUT_COMPLETE",
        });
    };

    let result = request_json::<serde_json::Value>(
        "POST",
        &format!("{}/auth/device/revoke", session.server_url),
        json!({ "access_token": session.access_token, "refresh_token": session.refresh_token }),
        None,
        None,
    );
    let reason_code = match result {
        Ok(response) if revocation_confirmed(&response) => {
            let _ = fs::remove_file(revocation);
            return Ok(CompanionLogoutResult {
                local_signed_out: true,
                server_revocation: "confirmed",
                pending_revocation: false,
                reason_code: "RUNNER_COMPANION_SERVER_REVOCATION_CONFIRMED",
            });
        }
        Ok(_) => "RUNNER_COMPANION_REVOCATION_UNCONFIRMED",
        Err(error) => revocation_reason(&error),
    };
    let pending_saved = pending_revocation(data_root, &session);
    Ok(CompanionLogoutResult {
        local_signed_out: true,
        server_revocation: "unconfirmed",
        pending_revocation: pending_saved,
        reason_code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unsigned_token(claims: serde_json::Value) -> String {
        format!(
            "e30.{}.sig",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap())
        )
    }

    #[test]
    fn revocation_failures_never_report_server_revoked() {
        assert_eq!(
            revocation_reason("RUNNER_COMPANION_DNS_FAILED"),
            "RUNNER_COMPANION_REVOCATION_OFFLINE"
        );
        assert_eq!(
            revocation_reason("RUNNER_COMPANION_TIMEOUT"),
            "RUNNER_COMPANION_REVOCATION_TIMEOUT"
        );
        assert_eq!(
            revocation_reason("RUNNER_COMPANION_FORBIDDEN"),
            "RUNNER_COMPANION_REVOCATION_REJECTED"
        );
        assert!(!revocation_confirmed(&serde_json::json!({
            "success": false,
            "revoked": { "access_token": false, "refresh_token": false }
        })));
    }

    #[test]
    fn revocation_requires_both_server_token_results() {
        assert!(revocation_confirmed(&serde_json::json!({
            "success": true,
            "revoked": { "access_token": true, "refresh_token": true }
        })));
        assert!(!revocation_confirmed(&serde_json::json!({
            "success": true,
            "revoked": { "access_token": true, "refresh_token": false }
        })));
    }

    #[test]
    fn protected_writes_are_private_and_atomic() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(SESSION_FILE);
        write_protected(&path, &serde_json::json!({ "value": "first" })).unwrap();
        let parsed: serde_json::Value = read_protected(&path).unwrap().unwrap();
        assert_eq!(parsed["value"], "first");
        #[cfg(unix)]
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(!root.path().join("runner-companion-session.tmp").exists());

        let paths = (0..8).map(|_| path.clone()).collect::<Vec<_>>();
        let threads = paths
            .into_iter()
            .enumerate()
            .map(|(index, path)| {
                std::thread::spawn(move || {
                    write_protected(&path, &serde_json::json!({ "value": index })).unwrap();
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        let parsed: serde_json::Value = read_protected(&path).unwrap().unwrap();
        assert!(parsed["value"].as_u64().is_some());
    }

    #[test]
    fn status_does_not_expose_tokens() {
        let root = tempfile::tempdir().unwrap();
        let result = status(root.path().to_str().unwrap());
        let encoded = serde_json::to_string(&result).unwrap();
        assert!(!encoded.contains("access_token"));
        assert!(!encoded.contains("refresh_token"));
        assert_eq!(result.reason_code, "RUNNER_COMPANION_AUTH_REQUIRED");
    }

    #[test]
    fn token_binding_allows_only_projection_and_chat_scopes() {
        let device_hash = "device-hash";
        let base = serde_json::json!({
            "clientId": CLIENT_ID,
            "aud": CLIENT_ID,
            "tokenUse": "desktop_session",
            "deviceIdHash": device_hash,
            "sessionId": "session-a",
            "tenantId": "tenant-a",
        });
        let mut read_claims = base.clone();
        read_claims["scopes"] = serde_json::json!([COMPANION_SCOPE]);
        let read_only = unsigned_token(read_claims);
        let mut chat_claims = base.clone();
        chat_claims["scopes"] = serde_json::json!([COMPANION_SCOPE, CHAT_SCOPE]);
        let read_and_chat = unsigned_token(chat_claims);
        let mut over_scoped_claims = base;
        over_scoped_claims["scopes"] =
            serde_json::json!([COMPANION_SCOPE, CHAT_SCOPE, "mcp:write"]);
        let over_scoped = unsigned_token(over_scoped_claims);

        assert!(token_claims_match_companion(
            &read_only,
            device_hash,
            Some("session-a"),
            Some("tenant-a")
        ));
        assert!(token_claims_match_companion(
            &read_and_chat,
            device_hash,
            Some("session-a"),
            Some("tenant-a")
        ));
        assert!(!token_claims_match_companion(
            &over_scoped,
            device_hash,
            Some("session-a"),
            Some("tenant-a")
        ));
    }
}
