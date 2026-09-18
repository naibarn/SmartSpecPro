#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lease {
    pub job_id: String,
    pub attempt_id: String,
    pub lease_id: String,
    pub fencing_version: u64,
    pub expires_at_ms: u64,
}

impl Lease {
    pub fn validate(&self, now_ms: u64, expected: &Lease) -> Result<(), String> {
        if self.job_id != expected.job_id
            || self.attempt_id != expected.attempt_id
            || self.lease_id != expected.lease_id
            || self.fencing_version != expected.fencing_version
        {
            return Err("RUNNER_LEASE_FENCE_MISMATCH".into());
        }
        if self.expires_at_ms <= now_ms {
            return Err("RUNNER_LEASE_EXPIRED".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn lease() -> Lease {
        Lease {
            job_id: "job".into(),
            attempt_id: "attempt".into(),
            lease_id: "lease".into(),
            fencing_version: 2,
            expires_at_ms: 100,
        }
    }
    #[test]
    fn rejects_expired_and_mismatched_fences() {
        let current = lease();
        assert!(current.validate(99, &current).is_ok());
        assert!(current.validate(100, &current).is_err());
        let mut stale = current.clone();
        stale.fencing_version = 1;
        assert!(stale.validate(1, &current).is_err());
    }
}
