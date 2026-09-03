//! Crash-safe local execution/publication ledger.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionLedgerState {
    Claimed,
    Submitted,
    Running,
    Collected,
    Saved,
    Uploading,
    Published,
    Failed,
    Reconciling,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLedgerEntry {
    pub job_id: String,
    pub attempt: String,
    pub profile_id: String,
    pub profile_revision: u64,
    pub workflow_version: String,
    pub remote_execution_id: Option<String>,
    pub state: ExecutionLedgerState,
    pub event_sequence: u64,
    pub output_fingerprints: Vec<String>,
    pub upload_session_id: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LedgerFile {
    schema_version: u32,
    entries: Vec<ExecutionLedgerEntry>,
}

#[derive(Debug, Clone)]
pub struct ExecutionLedger {
    path: PathBuf,
    file: LedgerFile,
}

impl ExecutionLedger {
    pub fn load(root: &Path) -> Result<Self, String> {
        let path = root.join("comfy-execution-ledger.json");
        let file = if path.exists() {
            serde_json::from_slice(
                &fs::read(&path).map_err(|_| "comfy_ledger_read_failed".to_string())?,
            )
            .map_err(|_| "comfy_ledger_invalid".to_string())?
        } else {
            LedgerFile {
                schema_version: 1,
                entries: Vec::new(),
            }
        };
        Ok(Self { path, file })
    }

    pub fn entries(&self) -> &[ExecutionLedgerEntry] {
        &self.file.entries
    }
    pub fn upsert(&mut self, entry: ExecutionLedgerEntry) -> Result<(), String> {
        if let Some(existing) = self
            .file
            .entries
            .iter_mut()
            .find(|item| item.job_id == entry.job_id && item.attempt == entry.attempt)
        {
            *existing = entry;
        } else {
            self.file.entries.push(entry);
        }
        self.persist()
    }
    fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| "comfy_ledger_directory_failed".to_string())?;
        }
        let temp = self.path.with_extension("json.tmp");
        fs::write(
            &temp,
            serde_json::to_vec_pretty(&self.file)
                .map_err(|_| "comfy_ledger_encode_failed".to_string())?,
        )
        .map_err(|_| "comfy_ledger_write_failed".to_string())?;
        fs::rename(temp, &self.path).map_err(|_| "comfy_ledger_commit_failed".to_string())
    }
}
