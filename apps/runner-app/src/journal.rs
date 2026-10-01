use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::protocol::Envelope;

const RUNNER_RECEIPT_JOURNAL_MAX_EVENTS: usize = 4096;
const RUNNER_RECEIPT_JOURNAL_MAX_BYTES: usize = 4 * 1024 * 1024;
const RUNNER_RECEIPT_PENDING_KIND: &str = "runner_receipt_pending";
const RUNNER_RECEIPT_ACK_KIND: &str = "runner_receipt_ack";
const RUNNER_COMMAND_CLAIM_KIND: &str = "runner_command_claim";
const RUNNER_COMMAND_TERMINAL_KIND: &str = "runner_command_terminal";

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
        self.append(
            self.next_sequence(),
            &format!("runner-receipt-ack:{idempotency_key}"),
            RUNNER_RECEIPT_ACK_KIND,
            serde_json::json!({ "receiptIdempotencyKey": idempotency_key }),
        )
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
                    RUNNER_COMMAND_CLAIM_KIND | RUNNER_COMMAND_TERMINAL_KIND
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
        command_id: &str,
        operation_idempotency_key: &str,
        command_bytes: &[u8],
    ) -> Result<ExternalAgentCommandClaim, String> {
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
        if !matches!(outcome, "completed" | "failed" | "unknown") {
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
        self.journal.append(
            self.journal.next_sequence(),
            &format!("runner-command-terminal:{operation_key_hash}"),
            RUNNER_COMMAND_TERMINAL_KIND,
            serde_json::json!({
                "commandId": command_id,
                "operationIdempotencyKey": operation_idempotency_key,
                "outcome": outcome,
            }),
        )?;
        self.journal.persist(&self.path)
    }

    pub fn acknowledge(&mut self, idempotency_key: &str) -> Result<(), String> {
        self.journal.acknowledge_runner_receipt(idempotency_key)?;
        self.journal.persist(&self.path)?;
        self.journal.compact_runner_receipts()?;
        self.journal.persist(&self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Envelope, NodeKind};
    use std::path::PathBuf;

    fn receipt_envelope(event_id: &str, payload: serde_json::Value) -> Envelope {
        let mut envelope = Envelope::new(
            NodeKind::LocalDevice,
            "runner-journal-test",
            Some("job-journal-test"),
            None,
            Some("lease-journal-test"),
            payload,
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
        let command_bytes = br#"{\"commandId\":\"cmd-1\",\"payload\":{\"taskId\":\"task-1\"}}"#;
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            assert_eq!(
                journal
                    .claim_external_agent_command("cmd-1", "operation-1", command_bytes)
                    .unwrap(),
                ExternalAgentCommandClaim::Acquired
            );
            let receipt =
                receipt_envelope("claim-pending", serde_json::json!({"state":"accepted"}));
            journal.enqueue(&receipt).unwrap();
            journal.acknowledge(&receipt.idempotency_key).unwrap();
        }

        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        assert_eq!(
            restarted
                .claim_external_agent_command("cmd-1", "operation-1", command_bytes)
                .unwrap(),
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
                .claim_external_agent_command("cmd-1", "operation-1", b"original")
                .unwrap(),
            ExternalAgentCommandClaim::Acquired
        );
        assert!(journal
            .claim_external_agent_command("cmd-2", "operation-1", b"different")
            .is_err());
        assert!(journal
            .claim_external_agent_command("cmd-1", "operation-2", b"different")
            .is_err());
    }

    #[test]
    fn external_agent_command_claims_are_retained_during_receipt_compaction() {
        let root = tempfile::tempdir().unwrap();
        let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
        journal
            .claim_external_agent_command("cmd-1", "operation-1", b"command")
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
                .claim_external_agent_command("cmd-1", "operation-1", b"command")
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
    fn restart_never_reexecutes_a_previously_claimed_external_command() {
        let root = tempfile::tempdir().unwrap();
        let mut external_effect_count = 0;
        {
            let mut journal = RunnerReceiptJournal::open(root.path()).unwrap();
            if journal
                .claim_external_agent_command("cmd-1", "operation-1", b"command")
                .unwrap()
                == ExternalAgentCommandClaim::Acquired
            {
                external_effect_count += 1;
            }
        }
        let mut restarted = RunnerReceiptJournal::open(root.path()).unwrap();
        if restarted
            .claim_external_agent_command("cmd-1", "operation-1", b"command")
            .unwrap()
            == ExternalAgentCommandClaim::Acquired
        {
            external_effect_count += 1;
        }
        assert_eq!(external_effect_count, 1);
    }
}
