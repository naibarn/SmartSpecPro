use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::path::Path;

use crate::journal::Journal;

const MAX_RESERVATION_MS: u64 = 5 * 60 * 1000;
const MAX_SNAPSHOT_TTL_MS: u64 = 60 * 1000;
const MAX_RESERVATIONS: usize = 4096;
const RESERVATION_KIND: &str = "session_resource_reservation";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceVector {
    pub cpu_millis: u64,
    pub ram_bytes: u64,
    pub vram_bytes: u64,
    pub disk_bytes: u64,
}

impl ResourceVector {
    fn fits_with(&self, reserved: &Self, request: &Self) -> bool {
        self.cpu_millis >= reserved.cpu_millis.saturating_add(request.cpu_millis)
            && self.ram_bytes >= reserved.ram_bytes.saturating_add(request.ram_bytes)
            && self.vram_bytes >= reserved.vram_bytes.saturating_add(request.vram_bytes)
            && self.disk_bytes >= reserved.disk_bytes.saturating_add(request.disk_bytes)
    }

    fn add(&mut self, other: &Self) {
        self.cpu_millis = self.cpu_millis.saturating_add(other.cpu_millis);
        self.ram_bytes = self.ram_bytes.saturating_add(other.ram_bytes);
        self.vram_bytes = self.vram_bytes.saturating_add(other.vram_bytes);
        self.disk_bytes = self.disk_bytes.saturating_add(other.disk_bytes);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementCapabilities {
    pub process_tree: bool,
    pub memory_limit: bool,
    pub disk_quota: bool,
    pub isolation_boundary: String,
}

impl EnforcementCapabilities {
    pub fn sandbox_enforced(&self) -> bool {
        self.process_tree
            && self.memory_limit
            && self.disk_quota
            && matches!(
                self.isolation_boundary.as_str(),
                "os_job_object" | "container"
            )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    pub runner_id: String,
    pub revision: String,
    pub observed_at_unix_ms: u64,
    pub expires_at_unix_ms: u64,
    pub capacity: ResourceVector,
    pub enforcement: EnforcementCapabilities,
    pub continuity_class: String,
    pub capability_ids: Vec<String>,
}

impl ResourceSnapshot {
    pub fn validate(&self, now_unix_ms: u64) -> Result<(), &'static str> {
        let ttl = self
            .expires_at_unix_ms
            .saturating_sub(self.observed_at_unix_ms);
        if self.runner_id.trim().is_empty()
            || self.revision.trim().is_empty()
            || self.continuity_class.trim().is_empty()
            || self.capability_ids.len() > 256
            || self
                .capability_ids
                .iter()
                .any(|id| id.trim().is_empty() || id.len() > 160)
        {
            return Err("RUNNER_RESOURCE_SNAPSHOT_INVALID");
        }
        if ttl == 0
            || ttl > MAX_SNAPSHOT_TTL_MS
            || self.observed_at_unix_ms > now_unix_ms
            || self.expires_at_unix_ms <= now_unix_ms
        {
            return Err("RUNNER_RESOURCE_SNAPSHOT_STALE");
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReservation {
    pub reservation_id: String,
    pub session_id: String,
    pub resources: ResourceVector,
    pub expires_at_unix_ms: u64,
    pub state: String,
}

pub struct AdmissionLedger {
    path: std::path::PathBuf,
    journal: Journal,
    reservations: BTreeMap<String, ResourceReservation>,
    _lock: File,
}

impl AdmissionLedger {
    pub fn open(path: &Path) -> Result<Self, String> {
        let lock_path = path.with_extension("resource.lock");
        if fs::symlink_metadata(&lock_path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("RUNNER_RESOURCE_JOURNAL_SYMLINK_FORBIDDEN".into());
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| "RUNNER_RESOURCE_JOURNAL_LOCK_UNAVAILABLE")?;
        lock.lock_exclusive()
            .map_err(|_| "RUNNER_RESOURCE_JOURNAL_LOCK_FAILED")?;
        let journal = match Journal::load(path, MAX_RESERVATIONS * 4, 4 * 1024 * 1024) {
            Ok(journal) if journal.is_safe_to_complete() => journal,
            Ok(_) => return Err("RUNNER_RESOURCE_JOURNAL_CORRUPT".into()),
            Err(error) if error == "journal read failed" => {
                Journal::new(MAX_RESERVATIONS * 4, 4 * 1024 * 1024)
            }
            Err(_) => return Err("RUNNER_RESOURCE_JOURNAL_READ_FAILED".into()),
        };
        let mut reservations = BTreeMap::new();
        for record in journal
            .records()
            .iter()
            .filter(|record| record.kind == RESERVATION_KIND)
        {
            let reservation: ResourceReservation = serde_json::from_value(record.metadata.clone())
                .map_err(|_| "RUNNER_RESOURCE_JOURNAL_RECORD_INVALID")?;
            reservations.insert(reservation.reservation_id.clone(), reservation);
        }
        Ok(Self {
            path: path.to_path_buf(),
            journal,
            reservations,
            _lock: lock,
        })
    }

    pub fn prepare(
        &mut self,
        snapshot: &ResourceSnapshot,
        request: ResourceVector,
        reservation_id: &str,
        session_id: &str,
        now_unix_ms: u64,
        reservation_ms: u64,
    ) -> Result<ResourceReservation, String> {
        snapshot.validate(now_unix_ms).map_err(str::to_string)?;
        if reservation_id.trim().is_empty()
            || reservation_id.len() > 160
            || session_id.trim().is_empty()
            || session_id.len() > 160
            || reservation_ms == 0
            || reservation_ms > MAX_RESERVATION_MS
        {
            return Err("RUNNER_RESOURCE_RESERVATION_INVALID".into());
        }
        if let Some(existing) = self.reservations.get(reservation_id) {
            if existing.session_id != session_id || existing.resources != request {
                return Err("RUNNER_RESOURCE_RESERVATION_IDEMPOTENCY_CONFLICT".into());
            }
            return match existing.state.as_str() {
                "prepared" if existing.expires_at_unix_ms > now_unix_ms => Ok(existing.clone()),
                "prepared" => Err("RUNNER_RESOURCE_RESERVATION_EXPIRED".into()),
                "committed" => Ok(existing.clone()),
                _ => Err("RUNNER_RESOURCE_RESERVATION_STATE_INVALID".into()),
            };
        }
        if self.reservations.len() >= MAX_RESERVATIONS {
            return Err("RUNNER_RESOURCE_RESERVATION_CAPACITY_EXCEEDED".into());
        }
        let mut reserved = ResourceVector::default();
        for existing in self.reservations.values().filter(|value| {
            value.state == "committed"
                || (value.state == "prepared" && value.expires_at_unix_ms > now_unix_ms)
        }) {
            reserved.add(&existing.resources);
        }
        if !snapshot.capacity.fits_with(&reserved, &request) {
            return Err("RUNNER_RESOURCE_CAPACITY_EXCEEDED".into());
        }
        let reservation = ResourceReservation {
            reservation_id: reservation_id.into(),
            session_id: session_id.into(),
            resources: request,
            expires_at_unix_ms: now_unix_ms.saturating_add(reservation_ms),
            state: "prepared".into(),
        };
        self.persist(reservation.clone())?;
        Ok(reservation)
    }

    pub fn commit(
        &mut self,
        reservation_id: &str,
        now_unix_ms: u64,
    ) -> Result<ResourceReservation, String> {
        let current = self
            .reservations
            .get(reservation_id)
            .ok_or("RUNNER_RESOURCE_RESERVATION_NOT_FOUND")?;
        if current.state == "committed" {
            return Ok(current.clone());
        }
        if current.expires_at_unix_ms <= now_unix_ms {
            return Err("RUNNER_RESOURCE_RESERVATION_EXPIRED".into());
        }
        if current.state != "prepared" {
            return Err("RUNNER_RESOURCE_RESERVATION_STATE_INVALID".into());
        }
        let mut updated = current.clone();
        updated.state = "committed".into();
        self.persist(updated.clone())?;
        Ok(updated)
    }

    pub fn release(&mut self, reservation_id: &str) -> Result<(), String> {
        let Some(current) = self.reservations.get(reservation_id) else {
            return Ok(());
        };
        if current.state == "released" {
            return Ok(());
        }
        let mut updated = current.clone();
        updated.state = "released".into();
        self.persist(updated)
    }

    fn persist(&mut self, reservation: ResourceReservation) -> Result<(), String> {
        let key = format!(
            "resource-reservation:{}:{}",
            reservation.reservation_id,
            self.journal.next_sequence()
        );
        let metadata = serde_json::to_value(&reservation)
            .map_err(|_| "RUNNER_RESOURCE_RESERVATION_ENCODE_FAILED")?;
        self.journal
            .append(
                self.journal.next_sequence(),
                &key,
                RESERVATION_KIND,
                metadata,
            )
            .map_err(|_| "RUNNER_RESOURCE_JOURNAL_APPEND_FAILED")?;
        self.journal
            .persist(&self.path)
            .map_err(|_| "RUNNER_RESOURCE_JOURNAL_PERSIST_FAILED")?;
        self.reservations
            .insert(reservation.reservation_id.clone(), reservation);
        Ok(())
    }
}

pub fn safe_capability_projection(snapshot: &ResourceSnapshot) -> Value {
    serde_json::json!({
        "runnerId": snapshot.runner_id,
        "revision": snapshot.revision,
        "observedAtUnixMs": snapshot.observed_at_unix_ms,
        "expiresAtUnixMs": snapshot.expires_at_unix_ms,
        "capacity": snapshot.capacity,
        "enforcement": snapshot.enforcement,
        "continuityClass": snapshot.continuity_class,
        "capabilityIds": snapshot.capability_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn snapshot(now: u64) -> ResourceSnapshot {
        ResourceSnapshot {
            runner_id: "runner-1".into(),
            revision: "r1".into(),
            observed_at_unix_ms: now,
            expires_at_unix_ms: now + 30_000,
            capacity: ResourceVector {
                cpu_millis: 2000,
                ram_bytes: 4_000,
                vram_bytes: 0,
                disk_bytes: 10_000,
            },
            enforcement: EnforcementCapabilities {
                process_tree: true,
                memory_limit: false,
                disk_quota: false,
                isolation_boundary: "user_process".into(),
            },
            continuity_class: "reattachable".into(),
            capability_ids: vec!["shell.v1".into()],
        }
    }

    #[test]
    fn reservation_is_idempotent_and_prevents_overcommit() {
        let temp = tempfile::tempdir().unwrap();
        let now = 1000;
        let mut ledger = AdmissionLedger::open(&temp.path().join("resource.json")).unwrap();
        let resources = ResourceVector {
            cpu_millis: 1500,
            ram_bytes: 3000,
            vram_bytes: 0,
            disk_bytes: 1000,
        };
        let first = ledger
            .prepare(&snapshot(now), resources, "rsv-1", "ses-1", now, 1000)
            .unwrap();
        assert_eq!(
            ledger
                .prepare(&snapshot(now), resources, "rsv-1", "ses-1", now, 1000)
                .unwrap(),
            first
        );
        assert_eq!(
            ledger
                .prepare(&snapshot(now), resources, "rsv-2", "ses-2", now, 1000)
                .unwrap_err(),
            "RUNNER_RESOURCE_CAPACITY_EXCEEDED"
        );
        assert_eq!(ledger.commit("rsv-1", now).unwrap().state, "committed");
        ledger.release("rsv-1").unwrap();
        assert_eq!(
            ledger
                .prepare(&snapshot(now), resources, "rsv-2", "ses-2", now, 1000)
                .unwrap()
                .state,
            "prepared"
        );
    }

    #[test]
    fn snapshot_staleness_and_enforcement_claim_are_separate() {
        let mut value = snapshot(1000);
        assert_eq!(
            value.validate(31_000),
            Err("RUNNER_RESOURCE_SNAPSHOT_STALE")
        );
        assert!(!value.enforcement.sandbox_enforced());
        value.enforcement.memory_limit = true;
        value.enforcement.disk_quota = true;
        value.enforcement.isolation_boundary = "container".into();
        assert!(value.enforcement.sandbox_enforced());
    }

    #[test]
    fn future_dated_snapshot_is_rejected() {
        let future = snapshot(2_000);
        assert_eq!(
            future.validate(1_000),
            Err("RUNNER_RESOURCE_SNAPSHOT_STALE")
        );
    }

    #[test]
    fn committed_reservation_remains_counted_after_prepare_ttl() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("resource.json");
        let resources = ResourceVector {
            cpu_millis: 1500,
            ram_bytes: 3000,
            vram_bytes: 0,
            disk_bytes: 1000,
        };
        let mut ledger = AdmissionLedger::open(&path).unwrap();
        ledger
            .prepare(&snapshot(1000), resources, "rsv-1", "ses-1", 1000, 1000)
            .unwrap();
        ledger.commit("rsv-1", 1000).unwrap();
        drop(ledger);

        let mut recovered = AdmissionLedger::open(&path).unwrap();
        assert_eq!(
            recovered
                .prepare(&snapshot(3000), resources, "rsv-2", "ses-2", 3000, 1000)
                .unwrap_err(),
            "RUNNER_RESOURCE_CAPACITY_EXCEEDED"
        );
    }

    #[test]
    fn successful_commit_retry_remains_idempotent_after_prepare_expiry() {
        let temp = tempfile::tempdir().unwrap();
        let mut ledger = AdmissionLedger::open(&temp.path().join("resource.json")).unwrap();
        let resources = ResourceVector {
            cpu_millis: 100,
            ram_bytes: 100,
            vram_bytes: 0,
            disk_bytes: 100,
        };
        ledger
            .prepare(&snapshot(1000), resources, "rsv-1", "ses-1", 1000, 1000)
            .unwrap();
        let committed = ledger.commit("rsv-1", 1000).unwrap();
        assert_eq!(ledger.commit("rsv-1", 3000).unwrap(), committed);
    }

    #[test]
    fn released_reservation_id_cannot_be_reused_as_a_successful_prepare() {
        let temp = tempfile::tempdir().unwrap();
        let mut ledger = AdmissionLedger::open(&temp.path().join("resource.json")).unwrap();
        let resources = ResourceVector {
            cpu_millis: 100,
            ram_bytes: 100,
            vram_bytes: 0,
            disk_bytes: 100,
        };
        ledger
            .prepare(&snapshot(1000), resources, "rsv-1", "ses-1", 1000, 1000)
            .unwrap();
        ledger.release("rsv-1").unwrap();
        assert_eq!(
            ledger
                .prepare(&snapshot(1000), resources, "rsv-1", "ses-1", 1000, 1000)
                .unwrap_err(),
            "RUNNER_RESOURCE_RESERVATION_STATE_INVALID"
        );
    }

    #[test]
    fn simultaneous_reservations_are_serialized_by_the_owner_lock() {
        let temp = tempfile::tempdir().unwrap();
        let ledger = Arc::new(Mutex::new(
            AdmissionLedger::open(&temp.path().join("resource.json")).unwrap(),
        ));
        let a = ledger.clone();
        let b = ledger.clone();
        let request = ResourceVector {
            cpu_millis: 1500,
            ram_bytes: 3000,
            vram_bytes: 0,
            disk_bytes: 1000,
        };
        let first = std::thread::spawn(move || {
            a.lock()
                .unwrap()
                .prepare(&snapshot(1000), request, "rsv-a", "ses-a", 1000, 1000)
                .is_ok()
        });
        let second = std::thread::spawn(move || {
            b.lock()
                .unwrap()
                .prepare(&snapshot(1000), request, "rsv-b", "ses-b", 1000, 1000)
                .is_ok()
        });
        assert_ne!(first.join().unwrap(), second.join().unwrap());
    }
}
