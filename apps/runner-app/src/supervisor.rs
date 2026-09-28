#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleState {
    Starting,
    Ready,
    Draining,
    Disconnected,
    Reconciling,
    Unknown,
    Failed,
    Stopped,
}

#[derive(Debug, Clone)]
pub struct Supervisor {
    pub state: LifecycleState,
    active_claims: usize,
}

impl Default for Supervisor {
    fn default() -> Self {
        Self {
            state: LifecycleState::Starting,
            active_claims: 0,
        }
    }
}

impl Supervisor {
    pub fn ready(&mut self) {
        self.state = LifecycleState::Ready;
    }
    pub fn claim_started(&mut self) -> Result<(), String> {
        if self.state != LifecycleState::Ready {
            return Err("runner is not accepting claims".into());
        }
        self.active_claims += 1;
        Ok(())
    }
    pub fn drain(&mut self) {
        self.state = LifecycleState::Draining;
    }
    pub fn finish_claim(&mut self) {
        self.active_claims = self.active_claims.saturating_sub(1);
        if self.state == LifecycleState::Draining && self.active_claims == 0 {
            self.state = LifecycleState::Stopped;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drain_stops_new_claims() {
        let mut supervisor = Supervisor::default();
        supervisor.ready();
        supervisor.claim_started().unwrap();
        supervisor.drain();
        assert!(supervisor.claim_started().is_err());
        supervisor.finish_claim();
        assert_eq!(supervisor.state, LifecycleState::Stopped);
    }
}
