use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

use crate::journal::Journal;

const MAX_SESSION_COMMANDS: usize = 2048;
const COMMAND_KIND: &str = "session_command";
const COMMAND_TERMINAL_KIND: &str = "session_command_terminal";
const INPUT_AUTHORITY_KIND: &str = "session_input_authority";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionCommand {
    pub session_id: String,
    pub session_generation: u64,
    pub authority_epoch: u64,
    pub job_control_revision: u64,
    pub sequence: u64,
    pub idempotency_key: String,
    pub command_type: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionCommandState {
    Accepted,
    Applied,
    Rejected,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionCommandReceipt {
    pub session_id: String,
    pub sequence: u64,
    pub idempotency_key: String,
    pub payload_sha256: String,
    pub state: SessionCommandState,
    pub result_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InputAuthority {
    pub session_id: String,
    pub owner: String,
    pub epoch: u64,
    pub expires_at_unix_ms: u64,
}

pub struct SessionCommandLane {
    path: PathBuf,
    journal: Journal,
    _lock: File,
}

impl SessionCommandLane {
    pub fn open(path: &Path) -> Result<Self, String> {
        let lock_path = path.with_extension("commands.lock");
        if fs::symlink_metadata(&lock_path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("RUNNER_SESSION_COMMAND_JOURNAL_SYMLINK_FORBIDDEN".into());
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_LOCK_UNAVAILABLE")?;
        lock.lock_exclusive()
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_LOCK_FAILED")?;
        let journal = match Journal::load(path, MAX_SESSION_COMMANDS, 4 * 1024 * 1024) {
            Ok(journal) if journal.is_safe_to_complete() => journal,
            Ok(_) => return Err("RUNNER_SESSION_COMMAND_JOURNAL_CORRUPT".into()),
            Err(error) if error == "journal read failed" => {
                Journal::new(MAX_SESSION_COMMANDS, 4 * 1024 * 1024)
            }
            Err(_) => return Err("RUNNER_SESSION_COMMAND_JOURNAL_READ_FAILED".into()),
        };
        Ok(Self {
            path: path.to_path_buf(),
            journal,
            _lock: lock,
        })
    }

    pub fn accept(
        &mut self,
        command: &SessionCommand,
        current_authority_epoch: u64,
        current_revision: u64,
    ) -> Result<SessionCommandReceipt, String> {
        validate_command(command)?;
        let payload_sha256 = digest(&command.payload)?;
        let key = command_key(&command.session_id, &command.idempotency_key);
        if let Some(record) = self
            .journal
            .records()
            .iter()
            .find(|record| record.kind == COMMAND_KIND && record.idempotency_key == key)
        {
            let mut receipt: SessionCommandReceipt =
                serde_json::from_value(record.metadata.clone())
                    .map_err(|_| "RUNNER_SESSION_COMMAND_RECEIPT_INVALID")?;
            if receipt.payload_sha256 != payload_sha256
                || receipt.sequence != command.sequence
                || receipt.session_id != command.session_id
            {
                return Err("RUNNER_SESSION_COMMAND_IDEMPOTENCY_CONFLICT".into());
            }
            if let Some(terminal) = self.journal.records().iter().find(|terminal| {
                terminal.kind == COMMAND_TERMINAL_KIND
                    && terminal.idempotency_key == format!("{key}:terminal")
            }) {
                receipt = serde_json::from_value(terminal.metadata.clone())
                    .map_err(|_| "RUNNER_SESSION_COMMAND_RECEIPT_INVALID")?;
            }
            return Ok(receipt);
        }

        if command.authority_epoch != current_authority_epoch
            || command.job_control_revision != current_revision
        {
            return Err("RUNNER_SESSION_COMMAND_STALE_AUTHORITY".into());
        }

        let last_sequence = self
            .journal
            .records()
            .iter()
            .filter(|record| record.kind == COMMAND_KIND)
            .filter_map(|record| {
                (record.metadata.get("sessionId").and_then(Value::as_str)
                    == Some(command.session_id.as_str()))
                .then(|| record.metadata.get("sequence").and_then(Value::as_u64))
                .flatten()
            })
            .max()
            .unwrap_or(0);
        if command.sequence != last_sequence.saturating_add(1) {
            return Err("RUNNER_SESSION_COMMAND_OUT_OF_ORDER".into());
        }

        let receipt = SessionCommandReceipt {
            session_id: command.session_id.clone(),
            sequence: command.sequence,
            idempotency_key: command.idempotency_key.clone(),
            payload_sha256,
            state: SessionCommandState::Accepted,
            result_ref: None,
        };
        self.journal
            .append(
                self.journal.next_sequence(),
                &key,
                COMMAND_KIND,
                serde_json::to_value(&receipt)
                    .map_err(|_| "RUNNER_SESSION_COMMAND_RECEIPT_ENCODE_FAILED")?,
            )
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_APPEND_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_PERSIST_FAILED")?;
        Ok(receipt)
    }

    /// Terminal state is persisted only after the caller has an authoritative effect outcome.
    pub fn complete(
        &mut self,
        session_id: &str,
        idempotency_key: &str,
        state: SessionCommandState,
        result_ref: Option<String>,
    ) -> Result<SessionCommandReceipt, String> {
        if !matches!(
            state,
            SessionCommandState::Applied
                | SessionCommandState::Rejected
                | SessionCommandState::Unknown
        ) {
            return Err("RUNNER_SESSION_COMMAND_TERMINAL_STATE_INVALID".into());
        }
        if result_ref
            .as_ref()
            .is_some_and(|value| value.len() > 512 || value.trim().is_empty())
        {
            return Err("RUNNER_SESSION_COMMAND_RESULT_REF_INVALID".into());
        }
        let key = command_key(session_id, idempotency_key);
        let existing = self
            .journal
            .records()
            .iter()
            .find(|record| record.kind == COMMAND_KIND && record.idempotency_key == key)
            .ok_or("RUNNER_SESSION_COMMAND_NOT_ACCEPTED")?;
        let mut receipt: SessionCommandReceipt = serde_json::from_value(existing.metadata.clone())
            .map_err(|_| "RUNNER_SESSION_COMMAND_RECEIPT_INVALID")?;
        if !matches!(receipt.state, SessionCommandState::Accepted) {
            if receipt.state == state && receipt.result_ref == result_ref {
                return Ok(receipt);
            }
            return Err("RUNNER_SESSION_COMMAND_ALREADY_TERMINAL".into());
        }
        receipt.state = state;
        receipt.result_ref = result_ref;
        self.journal
            .append(
                self.journal.next_sequence(),
                &format!("{key}:terminal"),
                COMMAND_TERMINAL_KIND,
                serde_json::to_value(&receipt)
                    .map_err(|_| "RUNNER_SESSION_COMMAND_RECEIPT_ENCODE_FAILED")?,
            )
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_APPEND_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_COMMAND_JOURNAL_PERSIST_FAILED")?;
        Ok(receipt)
    }

    pub fn claim_input(
        &mut self,
        session_id: &str,
        owner: &str,
        expected_epoch: u64,
        now_unix_ms: u64,
        lease_duration_ms: u64,
    ) -> Result<InputAuthority, String> {
        if session_id.trim().is_empty()
            || owner.trim().is_empty()
            || owner.len() > 80
            || lease_duration_ms == 0
            || lease_duration_ms > 15 * 60 * 1000
        {
            return Err("RUNNER_SESSION_INPUT_AUTHORITY_INVALID".into());
        }
        let latest = self
            .journal
            .records()
            .iter()
            .filter(|record| record.kind == INPUT_AUTHORITY_KIND)
            .filter(|record| {
                record.metadata.get("sessionId").and_then(Value::as_str) == Some(session_id)
            })
            .filter_map(|record| {
                serde_json::from_value::<InputAuthority>(record.metadata.clone()).ok()
            })
            .max_by_key(|authority| authority.epoch);
        let current_epoch = latest.as_ref().map_or(0, |authority| authority.epoch);
        if current_epoch != expected_epoch {
            return Err("RUNNER_SESSION_INPUT_AUTHORITY_STALE".into());
        }
        if latest
            .as_ref()
            .is_some_and(|authority| authority.expires_at_unix_ms > now_unix_ms)
        {
            return Err("RUNNER_SESSION_INPUT_AUTHORITY_HELD".into());
        }
        let authority = InputAuthority {
            session_id: session_id.into(),
            owner: owner.into(),
            epoch: current_epoch.saturating_add(1),
            expires_at_unix_ms: now_unix_ms.saturating_add(lease_duration_ms),
        };
        self.journal
            .append(
                self.journal.next_sequence(),
                &format!("input-authority:{session_id}:{}", authority.epoch),
                INPUT_AUTHORITY_KIND,
                serde_json::to_value(&authority)
                    .map_err(|_| "RUNNER_SESSION_INPUT_AUTHORITY_ENCODE_FAILED")?,
            )
            .map_err(|_| "RUNNER_SESSION_INPUT_AUTHORITY_JOURNAL_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_INPUT_AUTHORITY_PERSIST_FAILED")?;
        Ok(authority)
    }
}

fn validate_command(command: &SessionCommand) -> Result<(), String> {
    if command.session_id.trim().is_empty()
        || command.session_id.len() > 160
        || command.session_generation == 0
        || command.authority_epoch == 0
        || command.job_control_revision == 0
        || command.sequence == 0
        || command.idempotency_key.trim().is_empty()
        || command.idempotency_key.len() > 160
        || command.command_type.trim().is_empty()
        || command.command_type.len() > 80
    {
        return Err("RUNNER_SESSION_COMMAND_INVALID".into());
    }
    if serde_json::to_vec(&command.payload)
        .map_err(|_| "RUNNER_SESSION_COMMAND_PAYLOAD_INVALID")?
        .len()
        > 64 * 1024
    {
        return Err("RUNNER_SESSION_COMMAND_PAYLOAD_TOO_LARGE".into());
    }
    Ok(())
}

fn command_key(session_id: &str, idempotency_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    hasher.update([0]);
    hasher.update(idempotency_key.as_bytes());
    format!("session-command:{}", hex(&hasher.finalize()))
}

fn digest(value: &Value) -> Result<String, String> {
    let encoded =
        serde_json::to_vec(value).map_err(|_| "RUNNER_SESSION_COMMAND_PAYLOAD_INVALID")?;
    let mut hasher = Sha256::new();
    hasher.update(encoded);
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn command(sequence: u64) -> SessionCommand {
        SessionCommand {
            session_id: "ses-1".into(),
            session_generation: 1,
            authority_epoch: 3,
            job_control_revision: 4,
            sequence,
            idempotency_key: format!("cmd-{sequence}"),
            command_type: "write".into(),
            payload: json!({ "operation": "bounded" }),
        }
    }

    #[test]
    fn commands_are_ordered_deduplicated_and_durable() {
        let temp = tempfile::tempdir().unwrap();
        let journal_path = temp.path().join("commands.json");
        let mut lane = SessionCommandLane::open(&journal_path).unwrap();
        let accepted = lane.accept(&command(1), 3, 4).unwrap();
        assert_eq!(accepted.state, SessionCommandState::Accepted);
        assert_eq!(lane.accept(&command(1), 3, 4).unwrap(), accepted);
        assert_eq!(
            lane.accept(&command(3), 3, 4).unwrap_err(),
            "RUNNER_SESSION_COMMAND_OUT_OF_ORDER"
        );
        drop(lane);
        let mut restarted = SessionCommandLane::open(&journal_path).unwrap();
        assert_eq!(restarted.accept(&command(1), 3, 4).unwrap(), accepted);
        let applied = restarted
            .complete(
                "ses-1",
                "cmd-1",
                SessionCommandState::Applied,
                Some("artifact:1".into()),
            )
            .unwrap();
        assert_eq!(applied.state, SessionCommandState::Applied);
        assert_eq!(restarted.accept(&command(1), 4, 5).unwrap(), applied);
    }

    #[test]
    fn stale_authority_and_input_takeover_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("commands.json");
        let mut lane = SessionCommandLane::open(&path).unwrap();
        assert_eq!(
            lane.accept(&command(1), 2, 4).unwrap_err(),
            "RUNNER_SESSION_COMMAND_STALE_AUTHORITY"
        );
        let first = lane.claim_input("ses-1", "agent", 0, 10, 1000).unwrap();
        assert_eq!(first.epoch, 1);
        assert_eq!(
            lane.claim_input("ses-1", "human", 1, 11, 1000).unwrap_err(),
            "RUNNER_SESSION_INPUT_AUTHORITY_HELD"
        );
        let takeover = lane.claim_input("ses-1", "human", 1, 1010, 1000).unwrap();
        assert_eq!(takeover.epoch, 2);
    }
}
