use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const DIAGNOSTIC_LOG_FILE_NAME: &str = "worker-diagnostics.jsonl";
const ACTIVE_SESSION_FILE_NAME: &str = "worker-session.json";
const MAX_DIAGNOSTIC_TEXT_CHARS: usize = 20_000;
const MAX_PANIC_BACKTRACE_CHARS: usize = 12_000;

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
static DIAGNOSTICS_LEVEL: OnceLock<Mutex<crate::settings::DiagnosticsLevel>> = OnceLock::new();
static PANIC_HOOK_INSTALLED: OnceLock<()> = OnceLock::new();
static LOG_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
static THROTTLED_EVENTS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

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

pub fn set_diagnostics_level(level: crate::settings::DiagnosticsLevel) {
    let slot =
        DIAGNOSTICS_LEVEL.get_or_init(|| Mutex::new(crate::settings::DiagnosticsLevel::Standard));
    if let Ok(mut current) = slot.lock() {
        *current = level;
    }
}

fn should_log(level: LogLevel) -> bool {
    let configured = DIAGNOSTICS_LEVEL
        .get()
        .and_then(|level| level.lock().ok().map(|value| value.clone()))
        .unwrap_or(crate::settings::DiagnosticsLevel::Standard);
    match configured {
        crate::settings::DiagnosticsLevel::Errors => !matches!(level, LogLevel::Info),
        crate::settings::DiagnosticsLevel::Standard
        | crate::settings::DiagnosticsLevel::Verbose => true,
    }
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
    if !should_log(level) {
        return;
    }
    if let Err(error) = try_log_event(app_data_dir, level, event, details) {
        eprintln!("failed to write worker diagnostic event: {error}");
    }
}

/// Records a noisy success event at most once per interval. Errors and
/// warnings should continue to use `log_event` so an incident is never hidden;
/// this is only for healthy polling signals such as connection probes.
pub fn log_event_throttled(
    app_data_dir: &Path,
    level: LogLevel,
    event: &str,
    details: Value,
    interval: Duration,
) {
    if !should_log(level) {
        return;
    }
    let slots = THROTTLED_EVENTS.get_or_init(|| Mutex::new(HashMap::new()));
    let now = Instant::now();
    let should_write = slots
        .lock()
        .map(|mut entries| {
            let allowed = entries
                .get(event)
                .map(|last| now.duration_since(*last) >= interval)
                .unwrap_or(true);
            if allowed {
                entries.insert(event.to_string(), now);
            }
            allowed
        })
        .unwrap_or(true);
    if should_write {
        if let Err(error) = try_log_event(app_data_dir, level, event, details) {
            eprintln!("failed to write worker diagnostic event: {error}");
        }
    }
}

/// Marks a process as active before the worker loop starts. If the previous
/// marker is still present, the previous process did not reach a known clean
/// shutdown path (for example OS termination or a panic in the GUI process).
pub fn begin_session(app_data_dir: &Path) -> bool {
    if fs::create_dir_all(app_data_dir).is_err() {
        return false;
    }
    let marker_path = app_data_dir.join(ACTIVE_SESSION_FILE_NAME);
    let had_unclean_previous_session = if let Ok(mut previous) = fs::File::open(&marker_path) {
        let mut raw = String::new();
        let _ = previous.read_to_string(&mut raw);
        log_warn(
            app_data_dir,
            "app.previous_run_unclean",
            json!({
                "previousSession": serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
                "markerPath": marker_path.to_string_lossy(),
            }),
        );
        true
    } else {
        false
    };
    let marker = json!({
        "sessionId": session_id(),
        "pid": std::process::id(),
        "startedAt": now_rfc3339(),
        "cleanExit": false,
    });
    let _ = write_atomic(&marker_path, marker.to_string().as_bytes());
    had_unclean_previous_session
}

/// Removes the active marker only after an intentional exit has been recorded.
/// Leaving it behind is deliberate evidence for the next launch.
pub fn mark_clean_shutdown(app_data_dir: &Path) {
    let _ = fs::remove_file(app_data_dir.join(ACTIVE_SESSION_FILE_NAME));
}

/// Installs a process-level panic hook. Tauri's release build is a GUI
/// subsystem, so stderr is not a reliable place to find panic evidence.
pub fn install_panic_hook(app_data_dir: PathBuf) {
    if PANIC_HOOK_INSTALLED.get().is_some() {
        return;
    }
    let previous = std::panic::take_hook();
    let _ = PANIC_HOOK_INSTALLED.set(());
    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            })
            .unwrap_or("panic payload was not a string");
        let location = panic_info
            .location()
            .map(|value| {
                json!({
                    "file": value.file(),
                    "line": value.line(),
                    "column": value.column(),
                })
            })
            .unwrap_or(Value::Null);
        let backtrace = format!("{}", std::backtrace::Backtrace::force_capture());
        log_error(
            &app_data_dir,
            "app.panic",
            json!({
                "message": redact_text(payload),
                "location": location,
                "backtrace": truncate_text(&backtrace, MAX_PANIC_BACKTRACE_CHARS),
            }),
        );
        previous(panic_info);
    }));
}

pub fn export_diagnostics(app_data_dir: &Path, destination: &Path) -> Result<String, String> {
    let log_lock = LOG_MUTEX.get_or_init(|| Mutex::new(()));
    let _guard = log_lock
        .lock()
        .map_err(|_| "diagnostic log lock poisoned".to_string())?;
    if destination.as_os_str().is_empty() {
        return Err("diagnostics export destination is empty".into());
    }
    if diagnostic_log_paths(app_data_dir)
        .iter()
        .any(|path| path == destination)
    {
        return Err("diagnostics export must use a different file than the live log".into());
    }
    let mut merged = String::new();
    // Oldest generation first, then the current file, so the exported file can
    // be read top-to-bottom as one timeline.
    for path in diagnostic_log_paths(app_data_dir).into_iter().rev() {
        if !path.exists() {
            continue;
        }
        let mut content = String::new();
        fs::File::open(&path)
            .and_then(|mut file| file.read_to_string(&mut content))
            .map_err(|error| format!("failed to read diagnostic log: {error}"))?;
        for line in content.lines() {
            if !line.trim().is_empty() {
                merged.push_str(line);
                merged.push('\n');
            }
        }
    }
    if merged.is_empty() {
        return Err("no diagnostic log entries are available yet".into());
    }
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create diagnostics export folder: {error}"))?;
    write_atomic(destination, merged.as_bytes())?;
    Ok(destination.to_string_lossy().to_string())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension(format!(
        "{}tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
    ));
    {
        let mut file = FileGuard::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("failed to replace diagnostics file: {error}"))?;
    }
    fs::rename(&temp, path).map_err(|error| format!("failed to finalize diagnostics file: {error}"))
}

struct FileGuard(std::fs::File);

impl FileGuard {
    fn create(path: &Path) -> Result<Self, String> {
        std::fs::File::create(path)
            .map(Self)
            .map_err(|error| format!("failed to create diagnostics file: {error}"))
    }
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.0
            .write_all(bytes)
            .map_err(|error| format!("failed to write diagnostics file: {error}"))
    }
    fn sync_all(&self) -> Result<(), String> {
        self.0
            .sync_all()
            .map_err(|error| format!("failed to sync diagnostics file: {error}"))
    }
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

/// Redacts common credential forms from panic/error text before persistence.
pub fn redact_text(value: &str) -> String {
    let mut output = value.replace("-----BEGIN PRIVATE KEY-----", "[REDACTED_PRIVATE_KEY]");
    output = output.replace(
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "[REDACTED_PRIVATE_KEY]",
    );
    if output.contains("[REDACTED_PRIVATE_KEY]") {
        if let Some(start) = output.find("[REDACTED_PRIVATE_KEY]") {
            let end = output[start..]
                .find("-----END")
                .map(|offset| start + offset)
                .unwrap_or(output.len());
            output.replace_range(start..end, "[REDACTED_PRIVATE_KEY]");
        }
    }
    let mut tokens = output
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut redact_next = false;
    for token in &mut tokens {
        if redact_next {
            *token = "[REDACTED]".into();
            redact_next = false;
            continue;
        }
        let lower = token.to_ascii_lowercase();
        if lower == "bearer"
            || lower.ends_with("token=")
            || lower.ends_with("secret=")
            || lower.ends_with("api_key=")
            || lower.ends_with("apikey=")
        {
            redact_next = true;
        }
    }
    redact_query_parameters(&tokens.join(" "))
}

fn redact_query_parameters(value: &str) -> String {
    let mut output = value.to_string();
    for marker in [
        "token=",
        "access_token=",
        "refresh_token=",
        "api_key=",
        "apikey=",
        "secret=",
        "password=",
    ] {
        let mut search_from = 0;
        loop {
            let lowered = output[search_from..].to_ascii_lowercase();
            let Some(relative_start) = lowered.find(marker) else {
                break;
            };
            let start = search_from + relative_start + marker.len();
            let end = output[start..]
                .find(|character: char| {
                    character == '&'
                        || character.is_whitespace()
                        || character == '"'
                        || character == '\''
                })
                .map(|offset| start + offset)
                .unwrap_or(output.len());
            output.replace_range(start..end, "[REDACTED]");
            search_from = start + "[REDACTED]".len();
        }
    }
    truncate_text(&output, MAX_DIAGNOSTIC_TEXT_CHARS)
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
    let log_lock = LOG_MUTEX.get_or_init(|| Mutex::new(()));
    let _guard = log_lock
        .lock()
        .map_err(|_| "diagnostic log lock poisoned".to_string())?;
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
        "details": redact_value(details, None),
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

fn redact_value(value: Value, key: Option<&str>) -> Value {
    let sensitive_key = key
        .map(|name| {
            let normalized = name.to_ascii_lowercase().replace(['_', '-'], "");
            normalized.contains("privatekey")
                || normalized == "secret"
                || normalized == "password"
                || normalized == "authorization"
                || normalized == "accesstoken"
                || normalized == "refreshtoken"
                || normalized == "executiontoken"
                || normalized == "devicetoken"
                || normalized == "apikey"
                || normalized.contains("deviceproof")
                || normalized.contains("credentialsecret")
                || normalized.contains("signingkey")
        })
        .unwrap_or(false);
    if sensitive_key {
        return match value {
            Value::Null => Value::Null,
            _ => Value::String("[REDACTED]".into()),
        };
    }
    match value {
        Value::String(text) => Value::String(redact_text(&text)),
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| redact_value(item, None))
                .collect(),
        ),
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(name, item)| {
                    let redacted = redact_value(item, Some(&name));
                    (name, redacted)
                })
                .collect(),
        ),
        other => other,
    }
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

    #[test]
    fn session_marker_is_removed_only_by_clean_shutdown() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!begin_session(dir.path()));
        assert!(dir.path().join(ACTIVE_SESSION_FILE_NAME).exists());

        mark_clean_shutdown(dir.path());
        assert!(!dir.path().join(ACTIVE_SESSION_FILE_NAME).exists());
    }

    #[test]
    fn next_session_records_an_unclean_previous_session() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join(ACTIVE_SESSION_FILE_NAME),
            r#"{"sessionId":"previous","pid":12,"cleanExit":false}"#,
        )
        .unwrap();

        assert!(begin_session(dir.path()));

        let log = fs::read_to_string(diagnostic_log_path(dir.path())).unwrap();
        assert!(log.contains("app.previous_run_unclean"));
        assert!(log.contains("previous"));
        mark_clean_shutdown(dir.path());
    }

    #[test]
    fn redact_text_removes_bearer_and_private_key_material() {
        let text = "Authorization Bearer super-secret-token https://example.test/?access_token=url-secret&ok=1 -----BEGIN PRIVATE KEY-----secret-bytes-----END PRIVATE KEY-----";
        let redacted = redact_text(text);

        assert!(!redacted.contains("super-secret-token"));
        assert!(!redacted.contains("url-secret"));
        assert!(!redacted.contains("secret-bytes"));
        assert!(redacted.contains("REDACTED"));
    }

    #[test]
    fn export_places_old_rotations_before_current_log() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(rotated_log_path(dir.path(), 1), b"{\"event\":\"older\"}\n").unwrap();
        fs::write(
            diagnostic_log_path(dir.path()),
            b"{\"event\":\"current\"}\n",
        )
        .unwrap();
        let destination = dir.path().join("export.jsonl");

        export_diagnostics(dir.path(), &destination).unwrap();

        let exported = fs::read_to_string(destination).unwrap();
        assert!(exported.find("older").unwrap() < exported.find("current").unwrap());
    }

    #[test]
    fn log_event_redacts_sensitive_object_fields() {
        let dir = tempfile::tempdir().unwrap();
        log_event(
            dir.path(),
            LogLevel::Error,
            "test.secret",
            json!({ "refreshToken": "do-not-write", "error": "Bearer also-do-not-write" }),
        );

        let log = fs::read_to_string(diagnostic_log_path(dir.path())).unwrap();
        assert!(!log.contains("do-not-write"));
        assert!(!log.contains("also-do-not-write"));
        assert!(log.contains("[REDACTED]"));
    }

    #[test]
    fn throttled_event_writes_only_once_inside_the_interval() {
        let dir = tempfile::tempdir().unwrap();
        let event = format!("test.throttled.{}", std::process::id());
        log_event_throttled(
            dir.path(),
            LogLevel::Info,
            &event,
            json!({ "attempt": 1 }),
            Duration::from_secs(3600),
        );
        log_event_throttled(
            dir.path(),
            LogLevel::Info,
            &event,
            json!({ "attempt": 2 }),
            Duration::from_secs(3600),
        );

        let log = fs::read_to_string(diagnostic_log_path(dir.path())).unwrap();
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("\"attempt\":1"));
    }
}
