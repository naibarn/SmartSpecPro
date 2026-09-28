use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

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
        if self
            .records
            .iter()
            .any(|record| record.idempotency_key == idempotency_key)
        {
            return Ok(());
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test]
    fn journal_is_bounded_idempotent_and_detects_corruption() {
        let mut journal = Journal::new(1, 4096);
        journal
            .append(1, "k", "ready", serde_json::json!({"state":"ready"}))
            .unwrap();
        journal
            .append(1, "k", "ready", serde_json::json!({}))
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
}
