use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use getrandom::fill;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const CLIENT_ID: &str = "smartaihub-runner-companion";
const COMPANION_SCOPE: &str = "runner:companion:read";
const SESSION_FILE: &str = "runner-companion-session.json";
const PENDING_FILE: &str = "runner-companion-device.json";
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingAuthorization {
    server_url: String,
    device_id: String,
    device_code: String,
    expires_at_ms: u64,
    interval_seconds: u64,
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
    let parent = path
        .parent()
        .ok_or("RUNNER_COMPANION_SESSION_PATH_INVALID")?;
    fs::create_dir_all(parent).map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    let plain =
        serde_json::to_vec(value).map_err(|_| "RUNNER_COMPANION_SESSION_SERIALIZE_FAILED")?;
    #[cfg(windows)]
    let bytes = URL_SAFE_NO_PAD
        .encode(protect(&plain).map_err(|_| "RUNNER_COMPANION_SECRET_PROTECTION_FAILED")?)
        .into_bytes();
    #[cfg(not(windows))]
    let bytes = plain;
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes).map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
            .map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED")?;
    }
    fs::rename(temp, path).map_err(|_| "RUNNER_COMPANION_SESSION_IO_FAILED".into())
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
    let server_url = server_base_url(control_url)?;
    let mut random = [0_u8; 16];
    fill(&mut random).map_err(|_| "RUNNER_COMPANION_ID_GENERATION_FAILED")?;
    let device_id = URL_SAFE_NO_PAD.encode(random);
    let response: DeviceCodeResponse = request_json(
        "POST",
        &format!("{server_url}/auth/device/code"),
        json!({ "client_id": CLIENT_ID, "device_id": device_id, "scopes": [COMPANION_SCOPE] }),
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
            let session = CompanionSession {
                server_url: pending.server_url,
                tenant_id: token_tenant_id(&tokens.access_token)
                    .ok_or("RUNNER_COMPANION_TOKEN_TENANT_MISSING")?,
                user_id: tokens.user.id,
                session_id: token_claim_string(&tokens.access_token, "sessionId")
                    .ok_or("RUNNER_COMPANION_TOKEN_SESSION_MISSING")?,
                device_id_hash: hex(&device_hash),
                device_id: pending.device_id,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                access_token_expires_at_ms: now_ms()
                    .saturating_add(tokens.expires_in.saturating_mul(1000)),
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
    session.access_token = response.access_token;
    session.refresh_token = response.refresh_token;
    session.access_token_expires_at_ms =
        now_ms().saturating_add(response.expires_in.saturating_mul(1000));
    if let Some(tenant_id) = token_tenant_id(&session.access_token) {
        session.tenant_id = tenant_id;
    }
    write_protected(&session_path(data_root), &session)?;
    Ok(session)
}

pub fn fetch_state(data_root: &str) -> Result<serde_json::Value, String> {
    let path = session_path(data_root);
    let Some(session) = read_protected::<CompanionSession>(&path)? else {
        return Err("RUNNER_COMPANION_AUTH_REQUIRED".into());
    };
    let session = refresh_if_needed(data_root, session)?;
    request_json(
        "GET",
        &format!("{}/api/runner-companion/v1/state", session.server_url),
        json!({}),
        Some(&session.access_token),
        Some(&session.device_id),
    )
}

pub fn logout(data_root: &str) -> Result<(), String> {
    let path = session_path(data_root);
    let pending = pending_path(data_root);
    if let Some(session) = read_protected::<CompanionSession>(&path)? {
        let _ = request_json::<serde_json::Value>(
            "POST",
            &format!("{}/auth/device/revoke", session.server_url),
            json!({ "access_token": session.access_token, "refresh_token": session.refresh_token }),
            None,
            None,
        );
    }
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(pending);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_does_not_expose_tokens() {
        let root = tempfile::tempdir().unwrap();
        let result = status(root.path().to_str().unwrap());
        let encoded = serde_json::to_string(&result).unwrap();
        assert!(!encoded.contains("access_token"));
        assert!(!encoded.contains("refresh_token"));
        assert_eq!(result.reason_code, "RUNNER_COMPANION_AUTH_REQUIRED");
    }
}
