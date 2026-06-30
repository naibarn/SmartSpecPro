use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const DIAGNOSTIC_LOG_FILE_NAME: &str = "worker-diagnostics.jsonl";

pub fn diagnostic_log_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DIAGNOSTIC_LOG_FILE_NAME)
}

pub fn append_diagnostic_event(app_data_dir: &Path, event: &str, details: Value) {
    if let Err(error) = try_append_diagnostic_event(app_data_dir, event, details) {
        eprintln!("failed to write worker diagnostic event: {error}");
    }
}

fn try_append_diagnostic_event(
    app_data_dir: &Path,
    event: &str,
    details: Value,
) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("failed to create diagnostic directory: {error}"))?;
    let path = diagnostic_log_path(app_data_dir);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("failed to open diagnostic log: {error}"))?;
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into());
    let line = json!({
        "timestamp": timestamp,
        "event": event,
        "details": details,
    });
    writeln!(file, "{line}").map_err(|error| format!("failed to write diagnostic log: {error}"))
}
