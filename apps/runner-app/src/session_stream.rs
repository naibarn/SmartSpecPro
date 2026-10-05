use base64::{engine::general_purpose::STANDARD, Engine as _};
use fs2::FileExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashSet, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

use crate::journal::Journal;

const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_OUTPUT_CHUNKS: usize = 4096;
const MAX_CRITICAL_RECEIPTS: usize = 4096;
const CRITICAL_PENDING_KIND: &str = "session_stream_critical_pending";
const CRITICAL_ACK_KIND: &str = "session_stream_critical_ack";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputChunk {
    pub sequence: u64,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputRead {
    pub chunks: Vec<OutputChunk>,
    pub next_sequence: u64,
    pub truncated_before_sequence: Option<u64>,
}

pub struct OutputSpool {
    chunks: VecDeque<OutputChunk>,
    bytes: usize,
    next_sequence: u64,
    truncated_before_sequence: Option<u64>,
}

impl Default for OutputSpool {
    fn default() -> Self {
        Self {
            chunks: VecDeque::new(),
            bytes: 0,
            next_sequence: 1,
            truncated_before_sequence: None,
        }
    }
}

impl OutputSpool {
    pub fn push(&mut self, bytes: &[u8]) -> Result<u64, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_OUTPUT_BYTES {
            return Err("RUNNER_SESSION_OUTPUT_CHUNK_INVALID");
        }
        let sequence = self.next_sequence;
        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or("RUNNER_SESSION_OUTPUT_SEQUENCE_EXHAUSTED")?;
        while self.bytes.saturating_add(bytes.len()) > MAX_OUTPUT_BYTES
            || self.chunks.len() >= MAX_OUTPUT_CHUNKS
        {
            let Some(removed) = self.chunks.pop_front() else {
                break;
            };
            self.bytes = self.bytes.saturating_sub(removed.bytes.len());
            self.truncated_before_sequence = Some(removed.sequence.saturating_add(1));
        }
        self.chunks.push_back(OutputChunk {
            sequence,
            bytes: bytes.to_vec(),
        });
        self.bytes = self.bytes.saturating_add(bytes.len());
        Ok(sequence)
    }

    pub fn read_after(&self, sequence: u64, max_chunks: usize) -> OutputRead {
        let chunks = self
            .chunks
            .iter()
            .filter(|chunk| chunk.sequence > sequence)
            .take(max_chunks.min(512))
            .cloned()
            .collect();
        OutputRead {
            chunks,
            next_sequence: self.next_sequence,
            truncated_before_sequence: self.truncated_before_sequence,
        }
    }
}

pub struct CriticalReceiptLane {
    path: PathBuf,
    journal: Journal,
    _lock: File,
}

impl CriticalReceiptLane {
    pub fn open(path: &Path) -> Result<Self, String> {
        if fs::symlink_metadata(path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_SYMLINK_FORBIDDEN".into());
        }
        let lock_path = path.with_extension("receipts.lock");
        if fs::symlink_metadata(&lock_path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_LOCK_SYMLINK_FORBIDDEN".into());
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_LOCK_UNAVAILABLE")?;
        lock.lock_exclusive()
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_LOCK_FAILED")?;
        let journal = match Journal::load(path, MAX_CRITICAL_RECEIPTS * 2, 4 * 1024 * 1024) {
            Ok(journal) if journal.is_safe_to_complete() => journal,
            Ok(_) => return Err("RUNNER_SESSION_CRITICAL_RECEIPT_JOURNAL_CORRUPT".into()),
            Err(error) if error == "journal read failed" => {
                Journal::new(MAX_CRITICAL_RECEIPTS * 2, 4 * 1024 * 1024)
            }
            Err(_) => return Err("RUNNER_SESSION_CRITICAL_RECEIPT_JOURNAL_READ_FAILED".into()),
        };
        let mut lane = Self {
            path: path.to_path_buf(),
            journal,
            _lock: lock,
        };
        lane.compact_acknowledged()?;
        Ok(lane)
    }

    pub fn enqueue(&mut self, event_id: &str, receipt: &[u8]) -> Result<bool, &'static str> {
        if event_id.trim().is_empty()
            || event_id.len() > 200
            || receipt.is_empty()
            || receipt.len() > 64 * 1024
        {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_INVALID");
        }
        let idempotency_key = format!("stream-critical:{event_id}");
        let encoded = STANDARD.encode(receipt);
        if let Some(existing) = self.journal.records().iter().find(|record| {
            record.kind == CRITICAL_PENDING_KIND && record.idempotency_key == idempotency_key
        }) {
            if existing
                .metadata
                .get("receiptBase64")
                .and_then(Value::as_str)
                != Some(&encoded)
            {
                return Err("RUNNER_SESSION_CRITICAL_RECEIPT_IDEMPOTENCY_CONFLICT");
            }
            return Ok(false);
        }
        if let Some(acknowledged) = self.journal.records().iter().find(|record| {
            record.kind == CRITICAL_ACK_KIND
                && record.metadata.get("eventId").and_then(Value::as_str) == Some(event_id)
        }) {
            if acknowledged
                .metadata
                .get("receiptSha256")
                .and_then(Value::as_str)
                != Some(receipt_sha256(receipt).as_str())
            {
                return Err("RUNNER_SESSION_CRITICAL_RECEIPT_IDEMPOTENCY_CONFLICT");
            }
            return Ok(false);
        }
        if self
            .journal
            .records()
            .iter()
            .filter(|record| record.kind == CRITICAL_PENDING_KIND)
            .count()
            >= MAX_CRITICAL_RECEIPTS
        {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_CAPACITY_EXCEEDED");
        }
        self.journal
            .append(
                self.journal.next_sequence(),
                &idempotency_key,
                CRITICAL_PENDING_KIND,
                json!({ "eventId": event_id, "receiptBase64": encoded }),
            )
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_JOURNAL_APPEND_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_JOURNAL_PERSIST_FAILED")?;
        Ok(true)
    }

    pub fn peek(&self) -> Result<Option<(String, Vec<u8>)>, &'static str> {
        let acknowledged = self
            .journal
            .records()
            .iter()
            .filter(|record| record.kind == CRITICAL_ACK_KIND)
            .filter_map(|record| record.metadata.get("eventId").and_then(Value::as_str))
            .collect::<HashSet<_>>();
        let Some(record) = self.journal.records().iter().find(|record| {
            record.kind == CRITICAL_PENDING_KIND
                && record
                    .metadata
                    .get("eventId")
                    .and_then(Value::as_str)
                    .is_some_and(|id| !acknowledged.contains(id))
        }) else {
            return Ok(None);
        };
        let event_id = record
            .metadata
            .get("eventId")
            .and_then(Value::as_str)
            .ok_or("RUNNER_SESSION_CRITICAL_RECEIPT_RECORD_INVALID")?;
        let encoded = record
            .metadata
            .get("receiptBase64")
            .and_then(Value::as_str)
            .ok_or("RUNNER_SESSION_CRITICAL_RECEIPT_RECORD_INVALID")?;
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_RECORD_INVALID")?;
        Ok(Some((event_id.to_string(), bytes)))
    }

    pub fn acknowledge(&mut self, event_id: &str) -> Result<(), &'static str> {
        if self.journal.records().iter().any(|record| {
            record.kind == CRITICAL_ACK_KIND
                && record.metadata.get("eventId").and_then(Value::as_str) == Some(event_id)
        }) {
            return Ok(());
        }
        let Some((front, receipt)) = self.peek()? else {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_ACK_OUT_OF_ORDER");
        };
        if front != event_id {
            return Err("RUNNER_SESSION_CRITICAL_RECEIPT_ACK_OUT_OF_ORDER");
        }
        self.journal
            .append(
                self.journal.next_sequence(),
                &format!("stream-critical-ack:{event_id}"),
                CRITICAL_ACK_KIND,
                json!({ "eventId": event_id, "receiptSha256": receipt_sha256(&receipt) }),
            )
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_ACK_PERSIST_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_ACK_PERSIST_FAILED")?;
        self.compact_acknowledged()
    }

    fn compact_acknowledged(&mut self) -> Result<(), &'static str> {
        let acknowledged = self
            .journal
            .records()
            .iter()
            .filter(|record| record.kind == CRITICAL_ACK_KIND)
            .filter_map(|record| record.metadata.get("eventId").and_then(Value::as_str))
            .collect::<HashSet<_>>();
        if acknowledged.is_empty() {
            return Ok(());
        }
        let pending = self
            .journal
            .records()
            .iter()
            .filter(|record| {
                record.kind == CRITICAL_PENDING_KIND
                    && record
                        .metadata
                        .get("eventId")
                        .and_then(Value::as_str)
                        .is_some_and(|id| !acknowledged.contains(id))
            })
            .map(|record| (record.idempotency_key.clone(), record.metadata.clone()))
            .collect::<Vec<_>>();
        let latest_ack = self
            .journal
            .records()
            .iter()
            .rev()
            .find(|record| record.kind == CRITICAL_ACK_KIND)
            .cloned();
        let mut compacted = Journal::new(MAX_CRITICAL_RECEIPTS * 2, 4 * 1024 * 1024);
        for (idempotency_key, metadata) in pending {
            let sequence = compacted.next_sequence();
            compacted
                .append(sequence, &idempotency_key, CRITICAL_PENDING_KIND, metadata)
                .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_COMPACTION_FAILED")?;
        }
        if let Some(ack) = latest_ack {
            let sequence = compacted.next_sequence();
            compacted
                .append(
                    sequence,
                    &ack.idempotency_key,
                    CRITICAL_ACK_KIND,
                    ack.metadata,
                )
                .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_COMPACTION_FAILED")?;
        }
        self.journal = compacted;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_SESSION_CRITICAL_RECEIPT_COMPACTION_FAILED")
    }
}

fn receipt_sha256(receipt: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(receipt);
    format!("{:x}", hasher.finalize())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamAttachmentScope<'a> {
    pub tenant_id: &'a str,
    pub session_id: &'a str,
    pub session_generation: u64,
    pub authorization_revision: u64,
}

pub fn validate_stream_attachment(
    requested: &StreamAttachmentScope<'_>,
    current: &StreamAttachmentScope<'_>,
    authorized: bool,
) -> Result<(), &'static str> {
    if !authorized
        || requested.tenant_id != current.tenant_id
        || requested.session_id != current.session_id
        || requested.session_generation != current.session_generation
        || requested.authorization_revision != current.authorization_revision
    {
        return Err("RUNNER_SESSION_STREAM_ATTACHMENT_FORBIDDEN");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detached_output_is_bounded_and_reports_truncation() {
        let mut spool = OutputSpool::default();
        let chunk = vec![b'x'; MAX_OUTPUT_BYTES / 2];
        assert_eq!(spool.push(&chunk), Ok(1));
        assert_eq!(spool.push(&chunk), Ok(2));
        assert_eq!(spool.push(b"tail"), Ok(3));
        let read = spool.read_after(0, 512);
        assert_eq!(read.chunks.len(), 2);
        assert_eq!(read.truncated_before_sequence, Some(2));
        assert_eq!(read.chunks.last().unwrap().bytes, b"tail");
    }

    #[test]
    fn output_pressure_cannot_consume_the_critical_receipt_lane() {
        let mut spool = OutputSpool::default();
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("critical.json");
        let mut receipts = CriticalReceiptLane::open(&path).unwrap();
        spool.push(&vec![b'x'; MAX_OUTPUT_BYTES]).unwrap();
        assert!(receipts.enqueue("event-1", b"terminal").unwrap());
        assert!(!receipts.enqueue("event-1", b"terminal").unwrap());
        assert_eq!(
            receipts.peek().unwrap(),
            Some(("event-1".into(), b"terminal".to_vec()))
        );
        drop(receipts);
        let mut resumed = CriticalReceiptLane::open(&path).unwrap();
        assert_eq!(resumed.peek().unwrap().unwrap().0, "event-1");
        resumed.acknowledge("event-1").unwrap();
        assert_eq!(resumed.peek().unwrap(), None);
        assert_eq!(resumed.journal.records().len(), 1);
        for index in 0..128 {
            let event_id = format!("event-{index}");
            resumed.enqueue(&event_id, b"terminal").unwrap();
            resumed.acknowledge(&event_id).unwrap();
            assert_eq!(resumed.journal.records().len(), 1);
        }
        assert!(!resumed.enqueue("event-127", b"terminal").unwrap());
        assert_eq!(
            resumed.enqueue("event-127", b"changed").unwrap_err(),
            "RUNNER_SESSION_CRITICAL_RECEIPT_IDEMPOTENCY_CONFLICT"
        );
        resumed.acknowledge("event-127").unwrap();
        drop(resumed);
        let mut resumed = CriticalReceiptLane::open(&path).unwrap();
        assert_eq!(resumed.peek().unwrap(), None);
        resumed.acknowledge("event-127").unwrap();
        assert!(!resumed.enqueue("event-127", b"terminal").unwrap());
    }

    #[test]
    fn stream_attach_rejects_cross_tenant_stale_generation_and_revoked_revision() {
        let current = StreamAttachmentScope {
            tenant_id: "tenant",
            session_id: "session",
            session_generation: 2,
            authorization_revision: 4,
        };
        assert!(validate_stream_attachment(&current, &current, true).is_ok());
        let cross_tenant = StreamAttachmentScope {
            tenant_id: "other",
            ..current.clone()
        };
        assert!(validate_stream_attachment(&cross_tenant, &current, true).is_err());
        assert!(validate_stream_attachment(&current, &current, false).is_err());
    }
}
