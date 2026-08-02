use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const DIAGNOSTIC_LOG_FILE_NAME: &str = "worker-diagnostics.jsonl";

/// Rotate at 8 MB and keep 5 generations (~40 MB worst case).
///
/// Field reason (2026-08-02): the log existed but was unbounded AND thin — a
/// user hitting "token has been revoked" had no way to show what happened
/// before it. Rotation is what makes it safe to log a lot more.
const MAX_LOG_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ROTATED_FILES: u32 = 5;

/// Identifies ONE run of the app.
///
/// This is the field that proves whether two refresh attempts came from one
/// process racing itself or from two copies of the app running at once (this
/// build has no single-instance guard, so login-autostart CAN start a second
/// copy on top of a tray-resident one). Without it, two interleaved refreshes
/// are indistinguishable in the log.
static SESSION_ID: OnceLock<String> = OnceLock::new();

pub fn session_id() -> &'static str {
    SESSION_ID.get_or_init(|| {
        let pid = std::process::id();
        let started = OffsetDateTime::now_utc().unix_timestamp();
        format!("{pid:x}-{started:x}")
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            LogLevel::Info => "info",
            LogLevel::Warn => "warn",
            LogLevel::Error => "error",
        }
    }
}

pub fn diagnostic_log_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DIAGNOSTIC_LOG_FILE_NAME)
}

fn rotated_log_path(app_data_dir: &Path, index: u32) -> PathBuf {
    app_data_dir.join(format!("{DIAGNOSTIC_LOG_FILE_NAME}.{index}"))
}

/// Every rotated generation of the log, newest first.
///
/// Used by the "collect diagnostics" path so a bug report carries the run
/// BEFORE the failure too — the interesting evidence for an auth problem is
/// usually in the previous session, not the current one.
pub fn diagnostic_log_paths(app_data_dir: &Path) -> Vec<PathBuf> {
    let mut paths = vec![diagnostic_log_path(app_data_dir)];
    for index in 1..=MAX_ROTATED_FILES {
        let path = rotated_log_path(app_data_dir, index);
        if path.exists() {
            paths.push(path);
        }
    }
    paths
}

/// Info-level event. Kept as-is so the existing call sites need no change.
pub fn append_diagnostic_event(app_data_dir: &Path, event: &str, details: Value) {
    log_event(app_data_dir, LogLevel::Info, event, details);
}

pub fn log_warn(app_data_dir: &Path, event: &str, details: Value) {
    log_event(app_data_dir, LogLevel::Warn, event, details);
}

pub fn log_error(app_data_dir: &Path, event: &str, details: Value) {
    log_event(app_data_dir, LogLevel::Error, event, details);
}

pub fn log_event(app_data_dir: &Path, level: LogLevel, event: &str, details: Value) {
    if let Err(error) = try_log_event(app_data_dir, level, event, details) {
        eprintln!("failed to write worker diagnostic event: {error}");
    }
}

/// A token reference that is safe to write to disk.
///
/// NEVER log the token itself. The first 16 hex chars of its SHA-256 are
/// enough to answer the only question that matters in an auth postmortem —
/// "was this the same token as the previous attempt, or a rotated one?" — and
/// are useless to anyone who steals the log file.
pub fn token_reference(token: &str) -> Value {
    use sha2::{Digest, Sha256};
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }
    let mut hasher = Sha256::new();
    hasher.update(trimmed.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    json!({
        "sha256Prefix": digest.chars().take(16).collect::<String>(),
        "length": trimmed.len(),
        "jti": jwt_claim_string(trimmed, "jti"),
        "tokenUse": jwt_claim_string(trimmed, "tokenUse"),
        "expiresAt": jwt_claim_i64(trimmed, "exp").and_then(|epoch| {
            OffsetDateTime::from_unix_timestamp(epoch)
                .ok()
                .and_then(|dt| dt.format(&Rfc3339).ok())
        }),
        "expiresInSeconds": jwt_claim_i64(trimmed, "exp")
            .map(|epoch| epoch - OffsetDateTime::now_utc().unix_timestamp()),
    })
}

/// Reads a claim WITHOUT verifying the signature — the client only needs the
/// value for correlation, and verification is the server's job.
fn jwt_claims(token: &str) -> Option<Value> {
    use base64::Engine as _;
    let payload_b64 = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64.as_bytes())
        .ok()?;
    serde_json::from_slice::<Value>(&decoded).ok()
}

fn jwt_claim_string(token: &str, claim: &str) -> Option<String> {
    jwt_claims(token)?
        .get(claim)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn jwt_claim_i64(token: &str, claim: &str) -> Option<i64> {
    jwt_claims(token)?.get(claim).and_then(Value::as_i64)
}

fn try_log_event(
    app_data_dir: &Path,
    level: LogLevel,
    event: &str,
    details: Value,
) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create diagnostic directory: {error}"))?;
    let path = diagnostic_log_path(app_data_dir);
    rotate_if_needed(app_data_dir, &path);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("failed to open diagnostic log: {error}"))?;
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());
    let line = json!({
        "timestamp": timestamp,
        "level": level.as_str(),
        "sessionId": session_id(),
        "pid": std::process::id(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "event": event,
        "details": details,
    });
    writeln!(file, "{line}").map_err(|error| format!("failed to write diagnostic log: {error}"))
}

/// Best-effort rotation. A rotation failure must never lose the event, so any
/// error here is ignored and the append proceeds to the current file.
fn rotate_if_needed(app_data_dir: &Path, path: &Path) {
    let too_big = fs::metadata(path)
        .map(|meta| meta.len() >= MAX_LOG_BYTES)
        .unwrap_or(false);
    if !too_big {
        return;
    }
    let _ = fs::remove_file(rotated_log_path(app_data_dir, MAX_ROTATED_FILES));
    for index in (1..MAX_ROTATED_FILES).rev() {
        let from = rotated_log_path(app_data_dir, index);
        if from.exists() {
            let _ = fs::rename(&from, rotated_log_path(app_data_dir, index + 1));
        }
    }
    let _ = fs::rename(path, rotated_log_path(app_data_dir, 1));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_reference_never_contains_the_token() {
        let token = "header.eyJqdGkiOiJ3b3JrZXJfcmVmcmVzaF9hYmMiLCJleHAiOjIwMDAwMDAwMDB9.sig";
        let reference = token_reference(token);
        let rendered = reference.to_string();
        assert!(!rendered.contains(token));
        assert!(!rendered.contains("sig"));
        assert_eq!(
            reference.get("jti").and_then(Value::as_str),
            Some("worker_refresh_abc")
        );
    }

    #[test]
    fn token_reference_is_null_for_empty_input() {
        assert_eq!(token_reference("   "), Value::Null);
    }

    #[test]
    fn token_reference_survives_a_malformed_token() {
        // A token this client cannot parse is still one the SERVER may accept,
        // so this must degrade to "no claims", never panic.
        let reference = token_reference("not-a-jwt");
        assert_eq!(reference.get("jti"), Some(&Value::Null));
        assert!(reference.get("sha256Prefix").is_some());
    }

    #[test]
    fn rotation_moves_the_current_file_aside_and_keeps_generations() {
        let dir = std::env::temp_dir().join(format!("worker-log-rot-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = diagnostic_log_path(&dir);
        fs::write(&path, vec![b'x'; (MAX_LOG_BYTES + 1) as usize]).unwrap();

        rotate_if_needed(&dir, &path);

        assert!(!path.exists(), "current log should have been moved aside");
        assert!(rotated_log_path(&dir, 1).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn diagnostic_log_paths_lists_the_current_file_first() {
        let dir = std::env::temp_dir().join(format!("worker-log-list-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(diagnostic_log_path(&dir), b"{}\n").unwrap();
        fs::write(rotated_log_path(&dir, 1), b"{}\n").unwrap();

        let paths = diagnostic_log_paths(&dir);

        assert_eq!(paths.first(), Some(&diagnostic_log_path(&dir)));
        assert_eq!(paths.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }
}
