use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::protocol::{Envelope, RunnerJobCommand};

const RUNNER_RECEIPT_JOURNAL_MAX_EVENTS: usize = 4096;
const RUNNER_RECEIPT_JOURNAL_MAX_BYTES: usize = 4 * 1024 * 1024;
const RUNNER_RECEIPT_PENDING_KIND: &str = "runner_receipt_pending";
const RUNNER_RECEIPT_ACK_KIND: &str = "runner_receipt_ack";
const RUNNER_COMMAND_CLAIM_KIND: &str = "runner_command_claim";
const RUNNER_COMMAND_TERMINAL_KIND: &str = "runner_command_terminal";
const RUNNER_RECEIPT_SEQUENCE_KIND: &str = "runner_receipt_sequence";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalAgentCommandClaim {
    Acquired,
    AlreadyClaimed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalRecord {
    pub sequence: u64,
    pub idempotency_key: String,
    pub kind: String,
    pub metadata: serde_json::Value,
    pub checksum: String,
}

#[derive(Debug, Clone)]
pub struct Journal {
    max_events: usize,
    max_bytes: usize,
    bytes: usize,
    records: Vec<JournalRecord>,
    replayed: HashSet<String>,
    corrupted: bool,
}

impl Journal {
    pub fn new(max_events: usize, max_bytes: usize) -> Self {
        Self {
            max_events,
            max_bytes,
            bytes: 0,
            records: Vec::new(),
            replayed: HashSet::new(),
            corrupted: false,
        }
    }
    pub fn append(
        &mut self,
        sequence: u64,
        idempotency_key: &str,
        kind: &str,
        metadata: serde_json::Value,
    ) -> Result<(), String> {
        if self.corrupted {
            return Err("journal is corrupted".into());
        }
        if let Some(existing) = self
            .records
            .iter()
            .find(|record| record.idempotency_key == idempotency_key)
        {
            if existing.kind == kind && existing.metadata == metadata {
                return Ok(());
            }
            return Err("journal idempotency key conflicts with persisted event".into());
        }
        if self
            .records
            .last()
            .is_some_and(|record| sequence <= record.sequence)
        {
            return Err("sequence is out of order".into());
        }
        let material = serde_json::to_vec(&(sequence, idempotency_key, kind, &metadata))
            .map_err(|_| "metadata is not serializable")?;
        let mut hasher = Sha256::new();
        hasher.update(&material);
        let checksum = format!("{:x}", hasher.finalize());
        let record = JournalRecord {
            sequence,
            idempotency_key: idempotency_key.into(),
            kind: kind.into(),
            metadata,
            checksum,
        };
        let size = serde_json::to_vec(&record)
            .map_err(|_| "record is not serializable")?
            .len();
        if self.records.len() >= self.max_events || self.bytes.saturating_add(size) > self.max_bytes
        {
            return Err("journal capacity exceeded".into());
        }
        self.bytes += size;
        self.records.push(record);
        Ok(())
    }

    /// Persist only the bounded, redacted journal metadata. The temporary file
    /// + rename sequence keeps a crash from leaving a partially written
    /// journal that could be mistaken for a complete replay log.
    pub fn persist(&self, path: &std::path::Path) -> Result<(), String> {
        if !self.is_safe_to_complete() {
            return Err("journal is not safe to persist".into());
        }
        let encoded =
            serde_json::to_vec(&self.records).map_err(|_| "journal is not serializable")?;
        if encoded.len() > self.max_bytes {
            return Err("journal capacity exceeded".into());
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| "journal directory is unavailable")?;
        }
        let temporary = path.with_extension("tmp");
        let mut file = std::fs::File::create(&temporary)
            .map_err(|_| "journal temporary file is unavailable")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))
                .map_err(|_| "journal permissions could not be restricted")?;
        }
        use std::io::Write;
        file.write_all(&encoded)
            .map_err(|_| "journal write failed")?;
        file.sync_all().map_err(|_| "journal sync failed")?;
        std::fs::rename(&temporary, path).map_err(|_| "journal commit failed")?;
        Ok(())
    }

    /// Load a journal with the same event/byte bounds as the active Runner.
    /// Any malformed or checksum-invalid file is returned as an explicitly
    /// corrupted journal so callers cannot continue as if replay succeeded.
    pub fn load(
        path: &std::path::Path,
        max_events: usize,
        max_bytes: usize,
    ) -> Result<Self, String> {
        let bytes = std::fs::read(path).map_err(|_| "journal read failed")?;
        if bytes.len() > max_bytes {
            let mut journal = Self::new(max_events, max_bytes);
            journal.mark_corrupted();
            return Ok(journal);
        }
        let records = match serde_json::from_slice::<Vec<JournalRecord>>(&bytes) {
            Ok(records) => records,
            Err(_) => {
                let mut journal = Self::new(max_events, max_bytes);
                journal.mark_corrupted();
                return Ok(journal);
            }
        };
        if records.len() > max_events {
            let mut journal = Self::new(max_events, max_bytes);
            journal.mark_corrupted();
            return Ok(journal);
        }
        let mut journal = Self::new(max_events, max_bytes);
        for record in records {
            if journal
                .append(
                    record.sequence,
                    &record.idempotency_key,
                    &record.kind,
                    record.metadata.clone(),
                )
                .is_err()
                || journal
                    .records
                    .last()
                    .map(|current| current.checksum.as_str())
                    != Some(record.checksum.as_str())
            {
                journal.mark_corrupted();
                break;
            }
        }
        Ok(journal)
    }

    pub fn mark_replayed(&mut self, idempotency_key: &str) {
        self.replayed.insert(idempotency_key.into());
    }

    pub fn next_sequence(&self) -> u64 {
        self.records
            .last()
            .map_or(1, |record| record.sequence.saturating_add(1))
    }

    pub fn pending_runner_receipts(&self) -> Result<Vec<Envelope>, String> {
        if !self.is_safe_to_complete() {
            return Err("runner receipt journal is corrupted".into());
        }
        let acknowledged = self
            .records
            .iter()
            .filter(|record| record.kind == RUNNER_RECEIPT_ACK_KIND)
            .filter_map(|record| {
                record
                    .metadata
                    .get("receiptIdempotencyKey")
                    .and_then(serde_json::Value::as_str)
            })
            .collect::<HashSet<_>>();
        self.records
            .iter()
            .filter(|record| {
                record.kind == RUNNER_RECEIPT_PENDING_KIND
                    && !acknowledged.contains(record.idempotency_key.as_str())
            })
            .map(|record| {
                serde_json::from_value(record.metadata.clone())
                    .map_err(|_| "runner receipt journal envelope is invalid".into())
            })
            .collect()
    }

    pub fn append_runner_receipt(&mut self, receipt: &Envelope) -> Result<(), String> {
        let metadata = serde_json::to_value(receipt)
            .map_err(|_| "runner receipt envelope is not serializable")?;
        self.append(
            self.next_sequence(),
            &receipt.idempotency_key,
            RUNNER_RECEIPT_PENDING_KIND,
            metadata,
        )
    }

    pub fn acknowledge_runner_receipt(&mut self, idempotency_key: &str) -> Result<(), String> {
        let pending = self.pending_runner_receipts()?;
        if !pending
            .iter()
            .any(|receipt| receipt.idempotency_key == idempotency_key)
        {
            return Ok(());
        }
        let receipt = pending
            .iter()
            .find(|receipt| receipt.idempotency_key == idempotency_key)
            .ok_or_else(|| "runner receipt disappeared from journal".to_string())?;
        let command_id = receipt.correlation_id.as_str();
        let receipt_sequence = receipt
            .payload
            .get("receipt")
            .and_then(|value| value.get("sequence"))
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "runner receipt sequence is invalid".to_string())?;
        let sequence_key_hash = sha256(command_id.as_bytes());
        let mut updated = self.clone();
        updated.append(
            updated.next_sequence(),
            &format!("runner-receipt-ack:{idempotency_key}"),
            RUNNER_RECEIPT_ACK_KIND,
            serde_json::json!({ "receiptIdempotencyKey": idempotency_key }),
        )?;
        updated.append(
            updated.next_sequence(),
            &format!("runner-receipt-sequence:{sequence_key_hash}:{receipt_sequence}"),
            RUNNER_RECEIPT_SEQUENCE_KIND,
            serde_json::json!({
                "commandId": command_id,
                "sequence": receipt_sequence,
            }),
        )?;
        *self = updated;
        Ok(())
    }

    /// Compacts acknowledged receipt history without changing any pending
    /// envelope identity or payload. The runner receipt itself remains the
    /// replay authority until the server returns an accepted ACK.
    pub fn compact_runner_receipts(&mut self) -> Result<(), String> {
        let pending = self.pending_runner_receipts()?;
        let durable_command_records = self
            .records
            .iter()
            .filter(|record| {
                matches!(
                    record.kind.as_str(),
                    RUNNER_COMMAND_CLAIM_KIND
                        | RUNNER_COMMAND_TERMINAL_KIND
                        | RUNNER_RECEIPT_SEQUENCE_KIND
                )
            })
            .cloned()
            .collect::<Vec<_>>();
        let mut compacted = Self::new(self.max_events, self.max_bytes);
        for record in durable_command_records {
            compacted.append(
                compacted.next_sequence(),
                &record.idempotency_key,
                &record.kind,
                record.metadata,
            )?;
        }
        for receipt in pending {
            let metadata = serde_json::to_value(&receipt)
                .map_err(|_| "runner receipt envelope is not serializable")?;
            compacted.append(
                compacted.next_sequence(),
                &receipt.idempotency_key,
                RUNNER_RECEIPT_PENDING_KIND,
                metadata,
            )?;
        }
        *self = compacted;
        Ok(())
    }

    /// Rebind only pending UNKNOWN_OUTCOME receipt envelopes that explicitly
    /// preserve the command's original session. Receipt identity, sequence,
    /// event ID, idempotency key, and the original-session marker are stable.
    pub fn rebind_pending_recovery_unknown_receipts(
        &mut self,
        current_session_id: &str,
    ) -> Result<usize, String> {
        if !self.is_safe_to_complete() || current_session_id.trim().is_empty() {
            return Err("RUNNER_RECEIPT_JOURNAL_CORRUPTED".into());
        }
        let pending_keys = self
            .pending_runner_receipts()?
            .into_iter()
            .map(|envelope| envelope.idempotency_key)
            .collect::<HashSet<_>>();
        let mut changed = 0usize;
        let mut records = self.records.clone();
        for record in &mut records {
            if record.kind != RUNNER_RECEIPT_PENDING_KIND
                || !pending_keys.contains(&record.idempotency_key)
            {
                continue;
            }
            let receipt = record
                .metadata
                .get_mut("payload")
                .and_then(|payload| payload.get_mut("receipt"));
            let Some(receipt) = receipt else { continue };
            if receipt.get("eventType").and_then(|value| value.as_str()) != Some("UNKNOWN_OUTCOME")
            {
                continue;
            }
            let Some(original_session) = receipt
                .get("payload")
                .and_then(|payload| payload.get("recoveredFromRunnerSessionId"))
                .and_then(|value| value.as_str())
            else {
                continue;
            };
            if receipt
                .get("runnerSessionId")
                .and_then(|value| value.as_str())
                != Some(original_session)
                || original_session == current_session_id
            {
                continue;
            }
            receipt["runnerSessionId"] = serde_json::Value::String(current_session_id.into());
            changed += 1;
        }
        if changed > 0 {
            let mut rebound = Self::new(self.max_events, self.max_bytes);
            for record in records {
                rebound.append(
                    record.sequence,
                    &record.idempotency_key,
                    &record.kind,
                    record.metadata,
                )?;
            }
            *self = rebound;
        }
        Ok(changed)
    }

    pub fn records(&self) -> &[JournalRecord] {
        &self.records
    }
    pub fn mark_corrupted(&mut self) {
        self.corrupted = true;
    }
    pub fn is_safe_to_complete(&self) -> bool {
        !self.corrupted && self.records.iter().all(|record| self.verify(record))
    }
    fn verify(&self, record: &JournalRecord) -> bool {
        let material = match serde_json::to_vec(&(
            record.sequence,
            &record.idempotency_key,
            &record.kind,
            &record.metadata,
        )) {
            Ok(value) => value,
            Err(_) => return false,
        };
        let mut hasher = Sha256::new();
        hasher.update(material);
        format!("{:x}", hasher.finalize()) == record.checksum
    }
}

/// Durable local replay journal for outbound Runner receipts. The canonical
/// worker-job event remains authoritative; this bounded local journal only
/// retains receipt envelopes until the server acknowledges them.
pub struct RunnerReceiptJournal {
    path: std::path::PathBuf,
    journal: Journal,
}

impl RunnerReceiptJournal {
    pub fn open(data_root: &std::path::Path) -> Result<Self, String> {
        let path = data_root.join("runner-receipts.json");
        let journal = if path.exists() {
            Journal::load(
                &path,
                RUNNER_RECEIPT_JOURNAL_MAX_EVENTS,
                RUNNER_RECEIPT_JOURNAL_MAX_BYTES,
            )?
        } else {
            Journal::new(
                RUNNER_RECEIPT_JOURNAL_MAX_EVENTS,
                RUNNER_RECEIPT_JOURNAL_MAX_BYTES,
            )
        };
        if !journal.is_safe_to_complete() {
            return Err("RUNNER_RECEIPT_JOURNAL_CORRUPTED".into());
        }
        Ok(Self { path, journal })
    }

    pub fn pending(&self) -> Result<Vec<Envelope>, String> {
        self.journal.pending_runner_receipts()
    }

    pub fn rebind_pending_recovery_unknown_receipts(
        &mut self,
        current_session_id: &str,
    ) -> Result<usize, String> {
        let changed_count = self
            .journal
            .rebind_pending_recovery_unknown_receipts(current_session_id)?;
        if changed_count > 0 {
            self.journal.persist(&self.path)?;
        }
        Ok(changed_count)
    }

    pub fn next_receipt_sequence(&self, command_id: &str) -> Result<u64, String> {
        if !self.journal.is_safe_to_complete() {
            return Err("RUNNER_RECEIPT_JOURNAL_CORRUPTED".into());
        }
        let persisted = self
            .journal
            .records
            .iter()
            .filter(|record| record.kind == RUNNER_RECEIPT_SEQUENCE_KIND)
            .filter(|record| {
                record.metadata.get("commandId").and_then(|v| v.as_str()) == Some(command_id)
            })
            .filter_map(|record| record.metadata.get("sequence").and_then(|v| v.as_u64()))
            .max()
            .unwrap_or(0);
        let pending = self
            .journal
            .pending_runner_receipts()?
            .into_iter()
            .filter(|receipt| receipt.correlation_id == command_id)
            .filter_map(|receipt| {
                receipt
                    .payload
                    .get("receipt")
                    .and_then(|value| value.get("sequence"))
                    .and_then(serde_json::Value::as_u64)
            })
            .max()
            .unwrap_or(0);
        Ok(persisted.max(pending).saturating_add(1))
    }

    pub fn enqueue(&mut self, receipt: &Envelope) -> Result<(), String> {
        receipt.validate()?;
        self.journal.append_runner_receipt(receipt)?;
        self.journal.persist(&self.path)
    }

    /// Claims a canonical external-agent operation before any process is
    /// started. Only the digest and stable identity are persisted, never the
    /// command payload. Existing claims survive receipt compaction and restart;
    /// callers must not execute an already-claimed command again.
    pub fn claim_external_agent_command(
        &mut self,
        command: &RunnerJobCommand,
    ) -> Result<ExternalAgentCommandClaim, String> {
        let command_bytes = serde_json::to_vec(command)
            .map_err(|_| "RUNNER_COMMAND_SERIALIZATION_FAILED".to_string())?;
        let command_id = command.command_id.as_str();
        let operation_idempotency_key = command.idempotency_key.as_str();
        if !self.journal.is_safe_to_complete()
            || command_id.trim().is_empty()
            || operation_idempotency_key.trim().is_empty()
        {
            return Err("RUNNER_COMMAND_CLAIM_INVALID".into());
        }
        let mut hasher = Sha256::new();
        hasher.update(command_bytes);
        let command_sha256 = format!("{:x}", hasher.finalize());
        if let Some(existing) = self.journal.records.iter().find(|record| {
            record.kind == RUNNER_COMMAND_CLAIM_KIND
                && (record
                    .metadata
                    .get("operationIdempotencyKey")
                    .and_then(|v| v.as_str())
                    == Some(operation_idempotency_key)
                    || record.metadata.get("commandId").and_then(|v| v.as_str())
                        == Some(command_id))
        }) {
            let matching = existing.metadata.get("commandId").and_then(|v| v.as_str())
                == Some(command_id)
                && existing
                    .metadata
                    .get("commandSha256")
                    .and_then(|v| v.as_str())
                    == Some(command_sha256.as_str());
            if !matching {
                return Err("RUNNER_COMMAND_IDEMPOTENCY_CONFLICT".into());
            }
            return Ok(ExternalAgentCommandClaim::AlreadyClaimed);
        }

        let operation_key_hash = {
            let mut hasher = Sha256::new();
            hasher.update(operation_idempotency_key.as_bytes());
            format!("{:x}", hasher.finalize())
        };
        self.journal.append(
            self.journal.next_sequence(),
            &format!("runner-command-claim:{operation_key_hash}"),
            RUNNER_COMMAND_CLAIM_KIND,
            serde_json::json!({
                "commandId": command_id,
                "operationIdempotencyKey": operation_idempotency_key,
                "commandSha256": command_sha256,
                "receiptCommand": receipt_command_context(command),
            }),
        )?;
        self.journal.persist(&self.path)?;
        Ok(ExternalAgentCommandClaim::Acquired)
    }

    /// Records a terminal local process outcome before its final receipt is
    /// sent. A missing terminal record after restart is deliberately treated
    /// as unknown and remains non-replayable.
    pub fn complete_external_agent_command(
        &mut self,
        command_id: &str,
        operation_idempotency_key: &str,
        outcome: &str,
    ) -> Result<(), String> {
        if !matches!(outcome, "completed" | "failed" | "unknown" | "cancelled") {
            return Err("RUNNER_COMMAND_TERMINAL_OUTCOME_INVALID".into());
        }
        let has_matching_claim = self.journal.records.iter().any(|record| {
            record.kind == RUNNER_COMMAND_CLAIM_KIND
                && record.metadata.get("commandId").and_then(|v| v.as_str()) == Some(command_id)
                && record
                    .metadata
                    .get("operationIdempotencyKey")
                    .and_then(|v| v.as_str())
                    == Some(operation_idempotency_key)
        });
        if !has_matching_claim {
            return Err("RUNNER_COMMAND_CLAIM_NOT_FOUND".into());
        }
        let mut hasher = Sha256::new();
        hasher.update(operation_idempotency_key.as_bytes());
        let operation_key_hash = format!("{:x}", hasher.finalize());
        let mut updated = self.journal.clone();
        updated.append(
            updated.next_sequence(),
            &format!("runner-command-terminal:{operation_key_hash}"),
            RUNNER_COMMAND_TERMINAL_KIND,
            serde_json::json!({
                "commandId": command_id,
                "operationIdempotencyKey": operation_idempotency_key,
                "outcome": outcome,
            }),
        )?;
        updated.persist(&self.path)?;
        self.journal = updated;
        Ok(())
    }

    /// Atomically records a terminal command outcome and queues its final
    /// receipt. A crash can therefore replay the receipt without either
    /// re-running the process or losing the canonical outcome notification.
    pub fn complete_external_agent_command_with_receipt(
        &mut self,
        command_id: &str,
        operation_idempotency_key: &str,
        outcome: &str,
        receipt: &Envelope,
    ) -> Result<(), String> {
        if !matches!(outcome, "completed" | "failed" | "unknown" | "cancelled") {
            return Err("RUNNER_COMMAND_TERMINAL_OUTCOME_INVALID".into());
        }
        receipt.validate()?;
        let has_matching_claim = self.journal.records.iter().any(|record| {
            record.kind == RUNNER_COMMAND_CLAIM_KIND
                && record.metadata.get("commandId").and_then(|v| v.as_str()) == Some(command_id)
                && record
                    .metadata
                    .get("operationIdempotencyKey")
                    .and_then(|v| v.as_str())
                    == Some(operation_idempotency_key)
        });
        if !has_matching_claim {
            return Err("RUNNER_COMMAND_CLAIM_NOT_FOUND".into());
        }
        let operation_key_hash = sha256(operation_idempotency_key.as_bytes());
        let mut updated = self.journal.clone();
        updated.append(
            updated.next_sequence(),
            &format!("runner-command-terminal:{operation_key_hash}"),
            RUNNER_COMMAND_TERMINAL_KIND,
            serde_json::json!({
                "commandId": command_id,
                "operationIdempotencyKey": operation_idempotency_key,
                "outcome": outcome,
            }),
        )?;
        updated.append_runner_receipt(receipt)?;
        updated.persist(&self.path)?;
        self.journal = updated;
        Ok(())
    }

    pub fn unresolved_external_agent_commands(&self) -> Result<Vec<RunnerJobCommand>, String> {
        if !self.journal.is_safe_to_complete() {
            return Err("RUNNER_RECEIPT_JOURNAL_CORRUPTED".into());
        }
        let terminal_keys = self
            .journal
            .records
            .iter()
            .filter(|record| record.kind == RUNNER_COMMAND_TERMINAL_KIND)
            .filter_map(|record| {
                record
                    .metadata
                    .get("operationIdempotencyKey")
                    .and_then(|value| value.as_str())
            })
            .collect::<HashSet<_>>();
        self.journal
            .records
            .iter()
            .filter(|record| record.kind == RUNNER_COMMAND_CLAIM_KIND)
            .filter(|record| {
                record
                    .metadata
                    .get("operationIdempotencyKey")
                    .and_then(|value| value.as_str())
                    .is_some_and(|key| !terminal_keys.contains(key))
            })
            .map(|record| {
                serde_json::from_value(
                    record
                        .metadata
                        .get("receiptCommand")
                        .cloned()
                        .ok_or_else(|| "RUNNER_COMMAND_RECEIPT_CONTEXT_MISSING".to_string())?,
                )
                .map_err(|_| "RUNNER_COMMAND_RECEIPT_CONTEXT_INVALID".to_string())
            })
            .collect()
    }

    pub fn acknowledge(&mut self, idempotency_key: &str) -> Result<(), String> {
        self.journal.acknowledge_runner_receipt(idempotency_key)?;
        self.journal.persist(&self.path)?;
        self.journal.compact_runner_receipts()?;
        self.journal.persist(&self.path)
    }
}

fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn receipt_command_context(command: &RunnerJobCommand) -> serde_json::Value {
    serde_json::json!({
        "commandId": command.command_id,
        "commandType": "execute",
        "contractVersion": command.contract_version,
        "jobId": command.job_id,
        "attempt": command.attempt,
        "leaseId": command.lease_id,
        "fencingToken": command.fencing_token,
        "tenantId": command.tenant_id,
        "userId": command.user_id,
        "projectRef": command.project_ref,
        "workspaceRef": command.workspace_ref,
        "runnerId": command.runner_id,
        "runnerSessionId": command.runner_session_id,
        "capabilitySnapshotId": command.capability_snapshot_id,
        "capabilitySnapshotRevision": command.capability_snapshot_revision,
        "controlPlaneOrigin": command.control_plane_origin,
        "executionKind": command.execution_kind,
        "adapterId": command.adapter_id,
        "adapterVersionConstraint": command.adapter_version_constraint,
        "browserEngineConstraint": command.browser_engine_constraint,
        "idempotencyKey": command.idempotency_key,
        "deadline": command.deadline,
        "authorizationGrantRef": "redacted-recovery-reference",
        "inputRef": "redacted-recovery-reference",
        "payload": { "taskId": command.payload.get("taskId") },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Envelope, NodeKind};
    use std::path::PathBuf;

    fn external_agent_command(command_id: &str, idempotency_key: &str) -> RunnerJobCommand {
        RunnerJobCommand {
            command_id: command_id.into(),
            command_type: "execute".into(),
            contract_version: "runner-job-v1".into(),
            job_id: "job-1".into(),
            attempt: 1,
            lease_id: "lease-1".into(),
            fencing_token: 1,
            tenant_id: "tenant-1".into(),
            user_id: Some(1),
            project_ref: None,
            workspace_ref: Some("workspace-1".into()),
            runner_id: "runner-1".into(),
            runner_session_id: "session-1".into(),
            capability_snapshot_id: "capability-1".into(),
            capability_snapshot_revision: "revision-1".into(),
            control_plane_origin: "https://example.test".into(),
            execution_kind: "external_agent_task".into(),
            adapter_id: "codex.v1".into(),
            adapter_version_constraint: None,
            browser_engine_constraint: None,
            idempotency_key: idempotency_key.into(),
            deadline: "2099-01-01T00:00:00.000Z".into(),
            authorization_grant_ref: "grant-ref-1".into(),
            input_ref: "input-ref-1".into(),
            payload: serde_json::json!({ "taskId": "task-1", "instruction": "not retained" }),
        }
    }

    fn receipt_envelope(event_id: &str, payload: serde_json::Value) -> Envelope {
        let mut envelope = Envelope::new(
            NodeKind::LocalDevice,
            "runner-journal-test",
            Some("job-journal-test"),
            None,
            Some("lease-journal-test"),
            serde_json::json!({
                "type": "runner.job.receipt",
                "receipt": { "eventId": event_id, "sequence": 1, "payload": payload }
            }),
        );
        envelope.correlation_id = "command-journal-test".into();
        envelope.sequence = 9;
        envelope.idempotency_key = format!("receipt:{event_id}");
        envelope
    }
    #[test]
    fn journal_is_bounded_idempotent_and_detects_corruption() {
        let mut journal = Journal::new(1, 4096);
        journal
            .append(1, "k", "ready", serde_json::json!({"state":"ready"}))
            .unwrap();
        journal
            .append(1, "k", "ready", serde_json::json!({"state":"ready"}))
            .unwrap();
        assert_eq!(journal.records().len(), 1);
        assert!(journal
            .append(2, "k2", "done", serde_json::json!({}))
            .is_err());
        assert!(journal.is_safe_to_complete());
        journal.mark_corrupted();
        assert!(!journal.is_safe_to_complete());
    }

    #[test]
    fn journal_round_trips_through_bounded_atomic_storage() {
        let path = PathBuf::from(format!(
            "{}/smartspec-runner-journal-{}.json",
            std::env::temp_dir().display(),
            std::process::id()
        ));
        let mut journal = Journal::new(4, 4096);
        journal
            .append(
                1,
                "persist-1",
                "ready",
                serde_json::json!({"state":"ready"}),
            )
            .unwrap();
        journal.persist(&path).unwrap();
        let restored = Journal::load(&path, 4, 4096).unwrap();
        assert!(restored.is_safe_to_complete());
        assert_eq!(restored.records()[0].idempotency_key, "persist-1");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn runner_receipt_stays_pending_across_restart_until_server_ack() {
        let root = tempfile::tempdir().unwrap();
        let receipt = receipt_envelope(
            "stable-event",
            serde_json::json!({
                "type": "runner.job.receipt",
                "receipt": { "eventId": "stable-event", "sequence": 1 }
            }),
        );
        {
            let mut outbox = RunnerReceiptJournal::open(root.path()).unwrap();
            outbox.enqueue(&receipt).unwrap();
            outbox.enqueue(&receipt).unwrap();
        }
        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        let pending = restarted.pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(
            serde_json::to_value(&pending[0]).unwrap(),
            serde_json::to_value(&receipt).unwrap()
        );
        restarted.acknowledge(&receipt.idempotency_key).unwrap();
        let restarted_again = RunnerReceiptJournal::open(root.path()).unwrap();
        assert!(restarted_again.pending().unwrap().is_empty());
    }

    #[test]
    fn recovery_unknown_receipt_rebinds_only_reporter_session_and_survives_restart() {
        let root = tempfile::tempdir().unwrap();
        let mut recovery = receipt_envelope(
            "stable-recovery-event",
            serde_json::json!({
                "recoveredFromRunnerSessionId": "session-old",
                "attempt": 3,
                "leaseId": "lease-3",
                "fenceVersion": 9,
            }),
        );
        recovery.payload["receipt"]["eventType"] = serde_json::json!("UNKNOWN_OUTCOME");
        recovery.payload["receipt"]["runnerSessionId"] = serde_json::json!("session-old");
        recovery.sequence = 13;
        recovery.idempotency_key = "stable-recovery-idempotency".into();
        let mut ordinary =
            receipt_envelope("ordinary-event", serde_json::json!({ "status": "unknown" }));
        ordinary.payload["receipt"]["eventType"] = serde_json::json!("UNKNOWN_OUTCOME");
        ordinary.payload["receipt"]["runnerSessionId"] = serde_json::json!("session-old");
        ordinary.idempotency_key = "ordinary-idempotency".into();
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            journal.enqueue(&recovery).unwrap();
            journal.enqueue(&ordinary).unwrap();
            assert_eq!(
                journal
                    .rebind_pending_recovery_unknown_receipts("session-new")
                    .unwrap(),
                1
            );
        }
        let reopened = RunnerReceiptJournal::open(root.path()).unwrap();
        let pending = reopened.pending().unwrap();
        assert_eq!(pending.len(), 2);
        let rebound = pending
            .iter()
            .find(|item| item.idempotency_key == recovery.idempotency_key)
            .unwrap();
        let rebound_receipt = rebound.payload.get("receipt").unwrap();
        assert_eq!(rebound_receipt["runnerSessionId"], "session-new");
        assert_eq!(rebound_receipt["eventId"], "stable-recovery-event");
        assert_eq!(rebound_receipt["sequence"], 1);
        assert_eq!(
            rebound_receipt["payload"]["recoveredFromRunnerSessionId"],
            "session-old"
        );
        assert_eq!(rebound.idempotency_key, recovery.idempotency_key);
        let untouched = pending
            .iter()
            .find(|item| item.idempotency_key == ordinary.idempotency_key)
            .unwrap();
        assert_eq!(
            untouched.payload["receipt"]["runnerSessionId"],
            "session-old"
        );
    }

    #[test]
    fn runner_receipt_journal_rejects_conflicting_reuse_of_idempotency_key() {
        let root = tempfile::tempdir().unwrap();
        let mut outbox = RunnerReceiptJournal::open(root.path()).unwrap();
        let receipt = receipt_envelope("stable-event", serde_json::json!({ "status": "done" }));
        outbox.enqueue(&receipt).unwrap();
        let conflicting =
            receipt_envelope("stable-event", serde_json::json!({ "status": "different" }));
        assert!(outbox.enqueue(&conflicting).is_err());
        assert_eq!(outbox.pending().unwrap().len(), 1);
    }

    #[test]
    fn external_agent_command_claim_survives_restart_and_receipt_compaction() {
        let root = tempfile::tempdir().unwrap();
        let command = external_agent_command("cmd-1", "operation-1");
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            assert_eq!(
                journal.claim_external_agent_command(&command).unwrap(),
                ExternalAgentCommandClaim::Acquired
            );
            let receipt =
                receipt_envelope("claim-pending", serde_json::json!({"state":"accepted"}));
            journal.enqueue(&receipt).unwrap();
            journal.acknowledge(&receipt.idempotency_key).unwrap();
        }

        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        assert_eq!(
            restarted.claim_external_agent_command(&command).unwrap(),
            ExternalAgentCommandClaim::AlreadyClaimed
        );
        assert!(restarted.pending().unwrap().is_empty());
    }

    #[test]
    fn external_agent_command_claim_rejects_conflicting_idempotency_reuse() {
        let root = tempfile::tempdir().unwrap();
        let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
        assert_eq!(
            journal
                .claim_external_agent_command(&external_agent_command("cmd-1", "operation-1"))
                .unwrap(),
            ExternalAgentCommandClaim::Acquired
        );
        assert!(journal
            .claim_external_agent_command(&external_agent_command("cmd-2", "operation-1"))
            .is_err());
        assert!(journal
            .claim_external_agent_command(&external_agent_command("cmd-1", "operation-2"))
            .is_err());
    }

    #[test]
    fn external_agent_command_claims_are_retained_during_receipt_compaction() {
        let root = tempfile::tempdir().unwrap();
        let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
        journal
            .claim_external_agent_command(&external_agent_command("cmd-1", "operation-1"))
            .unwrap();
        let receipt = receipt_envelope("compact-claim", serde_json::json!({"state":"accepted"}));
        journal.enqueue(&receipt).unwrap();
        journal.acknowledge(&receipt.idempotency_key).unwrap();

        let restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        assert_eq!(
            restarted
                .journal
                .records()
                .iter()
                .filter(|record| record.kind == RUNNER_COMMAND_CLAIM_KIND)
                .count(),
            1
        );
    }

    #[test]
    fn external_agent_terminal_outcome_is_durable_and_conflicts_fail_closed() {
        let root = tempfile::tempdir().unwrap();
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            journal
                .claim_external_agent_command(&external_agent_command("cmd-1", "operation-1"))
                .unwrap();
            journal
                .complete_external_agent_command("cmd-1", "operation-1", "unknown")
                .unwrap();
            assert!(journal
                .complete_external_agent_command("cmd-1", "operation-1", "completed")
                .is_err());
        }
        let restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        let terminal = restarted
            .journal
            .records()
            .iter()
            .find(|record| record.kind == RUNNER_COMMAND_TERMINAL_KIND)
            .unwrap();
        assert_eq!(terminal.metadata["outcome"], "unknown");
        assert_eq!(
            restarted
                .journal
                .records()
                .iter()
                .filter(|record| record.kind == RUNNER_COMMAND_CLAIM_KIND)
                .count(),
            1
        );
    }

    #[test]
    fn interrupted_claim_recovers_redacted_receipt_context_until_atomically_finalized() {
        let root = tempfile::tempdir().unwrap();
        let command = external_agent_command("cmd-interrupted", "operation-interrupted");
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            journal.claim_external_agent_command(&command).unwrap();
        }

        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        let unresolved = restarted.unresolved_external_agent_commands().unwrap();
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].command_id, command.command_id);
        assert_eq!(unresolved[0].payload["taskId"], "task-1");
        assert!(unresolved[0].payload.get("instruction").is_none());

        let mut receipt = receipt_envelope(
            "unknown-after-restart",
            serde_json::json!({"status":"unknown"}),
        );
        receipt.correlation_id = "cancel-command".into();
        restarted
            .complete_external_agent_command_with_receipt(
                &command.command_id,
                &command.idempotency_key,
                "unknown",
                &receipt,
            )
            .unwrap();
        let after_finalization = RunnerReceiptJournal::open(root.path()).unwrap();
        assert!(after_finalization
            .unresolved_external_agent_commands()
            .unwrap()
            .is_empty());
        assert_eq!(after_finalization.pending().unwrap().len(), 1);
        assert_eq!(
            after_finalization.pending().unwrap()[0].correlation_id,
            "cancel-command"
        );
    }

    #[test]
    fn acknowledged_receipt_sequence_survives_restart_and_compaction() {
        let root = tempfile::tempdir().unwrap();
        let receipt = receipt_envelope("sequence-stable", serde_json::json!({"status":"started"}));
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            journal.enqueue(&receipt).unwrap();
            journal.acknowledge(&receipt.idempotency_key).unwrap();
            assert_eq!(
                journal
                    .next_receipt_sequence("command-journal-test")
                    .unwrap(),
                2
            );
        }
        let restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        assert_eq!(
            restarted
                .next_receipt_sequence("command-journal-test")
                .unwrap(),
            2
        );
    }

    #[test]
    fn restart_never_reexecutes_a_previously_claimed_external_command() {
        let root = tempfile::tempdir().unwrap();
        let mut external_effect_count = 0;
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            if journal
                .claim_external_agent_command(&external_agent_command("cmd-1", "operation-1"))
                .unwrap()
                == ExternalAgentCommandClaim::Acquired
            {
                external_effect_count += 1;
            }
        }
        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        if restarted
            .claim_external_agent_command(&external_agent_command("cmd-1", "operation-1"))
            .unwrap()
            == ExternalAgentCommandClaim::Acquired
        {
            external_effect_count += 1;
        }
        assert_eq!(external_effect_count, 1);
    }
}
