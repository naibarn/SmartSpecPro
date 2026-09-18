use crate::protocol::{AckState, Envelope};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelState {
    Disconnected,
    Connecting,
    Connected,
    Reconciling,
    Failed,
}

#[derive(Debug, Clone)]
pub struct ControlChannel {
    pub state: ChannelState,
    next_sequence: u64,
    last_remote_sequence: Option<u64>,
}

impl Default for ControlChannel {
    fn default() -> Self {
        Self {
            state: ChannelState::Disconnected,
            next_sequence: 0,
            last_remote_sequence: None,
        }
    }
}

impl ControlChannel {
    pub fn connect(&mut self) {
        self.state = ChannelState::Connecting;
    }
    pub fn authenticated(&mut self) {
        self.state = ChannelState::Connected;
    }
    pub fn reconnect(&mut self) {
        self.state = ChannelState::Reconciling;
    }
    pub fn next_event(&mut self, mut envelope: Envelope) -> Result<Envelope, String> {
        if self.state != ChannelState::Connected && self.state != ChannelState::Reconciling {
            return Err("control channel is not connected".into());
        }
        envelope.sequence = self.next_sequence;
        self.next_sequence += 1;
        envelope.idempotency_key = format!("{}:{}", envelope.correlation_id, envelope.sequence);
        envelope.validate()?;
        Ok(envelope)
    }
    pub fn accept_remote(&mut self, envelope: &Envelope) -> AckState {
        if let Some(last_sequence) = self.last_remote_sequence {
            if envelope.sequence < last_sequence {
                return AckState::OutOfOrder;
            }
            if envelope.sequence == last_sequence {
                return AckState::Duplicate;
            }
        }
        self.last_remote_sequence = Some(envelope.sequence);
        AckState::Applied
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Envelope, NodeKind};
    #[test]
    fn channel_requires_auth_and_deduplicates_sequence() {
        let mut channel = ControlChannel::default();
        let event = Envelope::new(
            NodeKind::LocalDevice,
            "r",
            None,
            None,
            None,
            serde_json::json!({"event":"ready"}),
        );
        assert!(channel.next_event(event.clone()).is_err());
        channel.connect();
        channel.authenticated();
        let event = channel.next_event(event).unwrap();
        assert_eq!(event.idempotency_key, "runner:r:0");
        assert_eq!(channel.accept_remote(&event), AckState::Applied);
        assert_eq!(channel.accept_remote(&event), AckState::Duplicate);
    }
}
