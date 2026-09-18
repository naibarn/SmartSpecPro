use std::collections::VecDeque;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use crate::device_proof::{canonical_json_bytes, endpoint_path, DeviceProofSigner};
use crate::protocol::{AckState, Envelope};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportMode {
    WssFastPath,
    HttpsDurableFallback,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlEndpoint {
    pub wss_url: String,
    pub https_url: String,
}

impl ControlEndpoint {
    pub fn from_control_url(control_url: &str) -> Result<Self, String> {
        let trimmed = control_url.trim_end_matches('/');
        let (https_url, wss_url) = if let Some(rest) = trimmed.strip_prefix("https://") {
            (trimmed.to_string(), format!("wss://{rest}"))
        } else if trimmed.starts_with("http://") {
            return Err("RUNNER_CONTROL_URL_MUST_USE_HTTPS".into());
        } else {
            return Err("RUNNER_CONTROL_URL_MUST_USE_HTTPS_SCHEME".into());
        };
        if https_url.contains('?')
            || https_url.contains('#')
            || wss_url.contains('?')
            || wss_url.contains('#')
        {
            return Err("RUNNER_CONTROL_URL_MUST_NOT_CONTAIN_CREDENTIAL_QUERY".into());
        }
        Ok(Self { wss_url, https_url })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportError {
    Unavailable,
    Unauthorized,
    Protocol,
    Rejected,
}

pub trait ControlTransport {
    fn send_wss(&mut self, endpoint: &str, event: &Envelope) -> Result<AckState, TransportError>;
    fn send_https(&mut self, endpoint: &str, event: &Envelope) -> Result<AckState, TransportError>;
}

/// Production blocking transport. It sends only redacted protocol envelopes and keeps the
/// bearer credential in memory; the credential is never part of an endpoint or a journal event.
pub struct NativeControlTransport {
    access_token: String,
    timeout: Duration,
    device_proof: Option<DeviceProofSigner>,
    wss_socket: Option<tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>>,
    wss_endpoint: Option<String>,
}

impl NativeControlTransport {
    pub fn new(access_token: impl Into<String>, timeout: Duration) -> Result<Self, String> {
        let access_token = access_token.into();
        if access_token.trim().is_empty() || timeout.is_zero() || timeout > Duration::from_secs(30)
        {
            return Err("RUNNER_CONTROL_TRANSPORT_CONFIGURATION_INVALID".into());
        }
        Ok(Self {
            access_token,
            timeout,
            device_proof: None,
            wss_socket: None,
            wss_endpoint: None,
        })
    }

    pub fn with_device_proof(
        access_token: impl Into<String>,
        timeout: Duration,
        device_proof: Option<DeviceProofSigner>,
    ) -> Result<Self, String> {
        let mut transport = Self::new(access_token, timeout)?;
        transport.device_proof = device_proof;
        Ok(transport)
    }

    fn connect_wss(
        &self,
        endpoint: &str,
    ) -> Result<
        tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>,
        TransportError,
    > {
        let uri: tungstenite::http::Uri = endpoint.parse().map_err(|_| TransportError::Protocol)?;
        let host = uri.host().ok_or(TransportError::Protocol)?.to_string();
        let port = uri.port_u16().unwrap_or(443);
        let address = (host.as_str(), port)
            .to_socket_addrs()
            .map_err(|_| TransportError::Unavailable)?
            .find_map(|address| TcpStream::connect_timeout(&address, self.timeout).ok())
            .ok_or(TransportError::Unavailable)?;
        address
            .set_read_timeout(Some(self.timeout))
            .map_err(|_| TransportError::Unavailable)?;
        address
            .set_write_timeout(Some(self.timeout))
            .map_err(|_| TransportError::Unavailable)?;
        let mut request = tungstenite::http::Request::builder()
            .uri(endpoint)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header(
                "X-SmartAIHub-Runner-Protocol",
                crate::protocol::PROTOCOL_VERSION,
            );
        if let Some(proof) = &self.device_proof {
            let headers = proof
                .headers(
                    "GET",
                    &endpoint_path(endpoint).map_err(|_| TransportError::Protocol)?,
                    b"{}",
                )
                .map_err(|_| TransportError::Protocol)?;
            request = request
                .header("X-Runner-Device-Id", headers.device_id)
                .header("X-Runner-Device-Public-Key", headers.public_key)
                .header("X-Runner-Machine-Fingerprint", headers.machine_fingerprint)
                .header("X-Runner-Device-Nonce", headers.nonce)
                .header("X-Runner-Device-Timestamp", headers.timestamp)
                .header("X-Runner-Device-Signature", headers.signature)
                .header("X-Runner-Body-Sha256", headers.body_hash);
        }
        let request = request.body(()).map_err(|_| TransportError::Protocol)?;
        let (mut socket, _) =
            tungstenite::client_tls(request, address).map_err(|_| TransportError::Unavailable)?;
        let handshake = socket.read().map_err(|_| TransportError::Unavailable)?;
        if parse_ack_message(handshake)? != AckState::Accepted {
            return Err(TransportError::Protocol);
        }
        Ok(socket)
    }
}

impl ControlTransport for NativeControlTransport {
    fn send_wss(&mut self, endpoint: &str, event: &Envelope) -> Result<AckState, TransportError> {
        if self.wss_endpoint.as_deref() != Some(endpoint) {
            self.wss_socket = None;
            self.wss_endpoint = Some(endpoint.to_string());
        }
        let mut socket = match self.wss_socket.take() {
            Some(socket) => socket,
            None => self.connect_wss(endpoint)?,
        };
        socket
            .send(tungstenite::Message::Text(
                serde_json::to_string(event)
                    .map_err(|_| TransportError::Protocol)?
                    .into(),
            ))
            .map_err(|_| {
                self.wss_socket = None;
                TransportError::Unavailable
            })?;
        let message = socket.read().map_err(|_| {
            self.wss_socket = None;
            TransportError::Unavailable
        })?;
        let ack = match parse_ack_message(message) {
            Ok(ack) => ack,
            Err(error) => {
                self.wss_socket = None;
                return Err(error);
            }
        };
        self.wss_socket = Some(socket);
        Ok(ack)
    }

    fn send_https(&mut self, endpoint: &str, event: &Envelope) -> Result<AckState, TransportError> {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(self.timeout))
            .build()
            .new_agent();
        let body = canonical_json_bytes(event).map_err(|_| TransportError::Protocol)?;
        let mut request = agent
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("Content-Type", "application/json")
            .header(
                "X-SmartAIHub-Runner-Protocol",
                crate::protocol::PROTOCOL_VERSION,
            );
        if let Some(proof) = &self.device_proof {
            let headers = proof
                .headers(
                    "POST",
                    &endpoint_path(endpoint).map_err(|_| TransportError::Protocol)?,
                    &body,
                )
                .map_err(|_| TransportError::Protocol)?;
            request = request
                .header("X-Runner-Device-Id", headers.device_id)
                .header("X-Runner-Device-Public-Key", headers.public_key)
                .header("X-Runner-Machine-Fingerprint", headers.machine_fingerprint)
                .header("X-Runner-Device-Nonce", headers.nonce)
                .header("X-Runner-Device-Timestamp", headers.timestamp)
                .header("X-Runner-Device-Signature", headers.signature)
                .header("X-Runner-Body-Sha256", headers.body_hash);
        }
        let response = request
            .send(&body)
            .map_err(|_| TransportError::Unavailable)?;
        if !response.status().is_success() {
            return Err(
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
                    TransportError::Unauthorized
                } else {
                    TransportError::Rejected
                },
            );
        }
        let mut body = response.into_body();
        let payload = body
            .with_config()
            .limit(64 * 1024)
            .read_to_string()
            .map_err(|_| TransportError::Protocol)?;
        parse_ack_payload(&payload)
    }
}

fn parse_ack_message(message: tungstenite::Message) -> Result<AckState, TransportError> {
    match message {
        tungstenite::Message::Text(text) => parse_ack_payload(text.as_ref()),
        tungstenite::Message::Binary(bytes) => {
            let payload = std::str::from_utf8(&bytes).map_err(|_| TransportError::Protocol)?;
            parse_ack_payload(payload)
        }
        _ => Err(TransportError::Protocol),
    }
}

fn parse_ack_payload(payload: &str) -> Result<AckState, TransportError> {
    let value: serde_json::Value =
        serde_json::from_str(payload).map_err(|_| TransportError::Protocol)?;
    let state = value
        .get("ackState")
        .or_else(|| value.get("ack_state"))
        .and_then(serde_json::Value::as_str)
        .ok_or(TransportError::Protocol)?;
    match state {
        "accepted" => Ok(AckState::Accepted),
        "applied" => Ok(AckState::Applied),
        "duplicate" => Ok(AckState::Duplicate),
        "rejected" => Ok(AckState::Rejected),
        "unknown" => Ok(AckState::Unknown),
        "out_of_order" => Ok(AckState::OutOfOrder),
        _ => Err(TransportError::Protocol),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReconciliationReport {
    pub reason: String,
    pub last_sent_sequence: Option<u64>,
    pub pending_events: usize,
    pub unknown_active_scopes: bool,
}

#[derive(Debug, Clone)]
pub struct TransportCoordinator {
    endpoint: ControlEndpoint,
    mode: TransportMode,
    pending: VecDeque<Envelope>,
    last_sent_sequence: Option<u64>,
    retry_attempt: u32,
    max_pending: usize,
    unknown_active_scopes: bool,
}

impl TransportCoordinator {
    pub fn new(endpoint: ControlEndpoint, max_pending: usize) -> Result<Self, String> {
        if max_pending == 0 || max_pending > 1024 {
            return Err("RUNNER_TRANSPORT_PENDING_LIMIT_INVALID".into());
        }
        Ok(Self {
            endpoint,
            mode: TransportMode::WssFastPath,
            pending: VecDeque::new(),
            last_sent_sequence: None,
            retry_attempt: 0,
            max_pending,
            unknown_active_scopes: false,
        })
    }

    pub fn mode(&self) -> TransportMode {
        self.mode
    }

    pub fn enqueue(&mut self, event: Envelope) -> Result<(), String> {
        event.validate()?;
        if self
            .pending
            .iter()
            .any(|queued| queued.idempotency_key == event.idempotency_key)
        {
            return Ok(());
        }
        if self.pending.len() >= self.max_pending {
            return Err("RUNNER_TRANSPORT_QUEUE_FULL".into());
        }
        self.pending.push_back(event);
        Ok(())
    }

    pub fn mark_network_lost(&mut self) {
        self.mode = TransportMode::HttpsDurableFallback;
        self.unknown_active_scopes = true;
    }

    pub fn mark_reconnected(&mut self) {
        self.mode = TransportMode::WssFastPath;
        self.retry_attempt = 0;
    }

    pub fn next_backoff_ms(&mut self) -> u64 {
        let delay = 250_u64.saturating_mul(2_u64.saturating_pow(self.retry_attempt.min(6)));
        self.retry_attempt = self.retry_attempt.saturating_add(1);
        delay.min(30_000)
    }

    pub fn reconcile(&mut self, reason: impl Into<String>) -> ReconciliationReport {
        ReconciliationReport {
            reason: reason.into(),
            last_sent_sequence: self.last_sent_sequence,
            pending_events: self.pending.len(),
            unknown_active_scopes: self.unknown_active_scopes,
        }
    }

    pub fn flush_one<T: ControlTransport>(
        &mut self,
        transport: &mut T,
    ) -> Result<Option<AckState>, TransportError> {
        let Some(event) = self.pending.front().cloned() else {
            return Ok(None);
        };
        let result = match self.mode {
            TransportMode::WssFastPath => transport.send_wss(&self.endpoint.wss_url, &event),
            TransportMode::HttpsDurableFallback => {
                transport.send_https(&self.endpoint.https_url, &event)
            }
        };
        match result {
            Ok(ack)
                if matches!(
                    ack,
                    AckState::Accepted | AckState::Applied | AckState::Duplicate
                ) =>
            {
                self.last_sent_sequence = Some(event.sequence);
                self.pending.pop_front();
                Ok(Some(ack))
            }
            Ok(ack) => Ok(Some(ack)),
            Err(error @ TransportError::Unavailable) => {
                self.mark_network_lost();
                Err(error)
            }
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Envelope, NodeKind};

    struct FakeTransport {
        wss_calls: usize,
        https_calls: usize,
        next: Result<AckState, TransportError>,
    }

    impl ControlTransport for FakeTransport {
        fn send_wss(&mut self, _: &str, _: &Envelope) -> Result<AckState, TransportError> {
            self.wss_calls += 1;
            self.next
        }

        fn send_https(&mut self, _: &str, _: &Envelope) -> Result<AckState, TransportError> {
            self.https_calls += 1;
            self.next
        }
    }

    fn event() -> Envelope {
        Envelope::new(
            NodeKind::LocalDevice,
            "runner-1",
            None,
            None,
            None,
            serde_json::json!({"event": "ready"}),
        )
    }

    #[test]
    fn falls_back_to_https_and_replays_idempotently_after_wss_loss() {
        let endpoint =
            ControlEndpoint::from_control_url("https://example.test/api/runners").unwrap();
        let mut coordinator = TransportCoordinator::new(endpoint, 4).unwrap();
        coordinator.enqueue(event()).unwrap();
        let mut transport = FakeTransport {
            wss_calls: 0,
            https_calls: 0,
            next: Err(TransportError::Unavailable),
        };
        assert_eq!(
            coordinator.flush_one(&mut transport),
            Err(TransportError::Unavailable)
        );
        assert_eq!(coordinator.mode(), TransportMode::HttpsDurableFallback);
        assert!(coordinator.reconcile("network_loss").unknown_active_scopes);
        transport.next = Ok(AckState::Duplicate);
        assert_eq!(
            coordinator.flush_one(&mut transport),
            Ok(Some(AckState::Duplicate))
        );
        assert_eq!(transport.wss_calls, 1);
        assert_eq!(transport.https_calls, 1);
    }

    #[test]
    fn rejects_credentials_in_control_url_and_deduplicates_queue() {
        assert!(
            ControlEndpoint::from_control_url("https://example.test/control?token=bad").is_err()
        );
        let endpoint = ControlEndpoint::from_control_url("https://example.test/control").unwrap();
        let mut coordinator = TransportCoordinator::new(endpoint, 1).unwrap();
        coordinator.enqueue(event()).unwrap();
        coordinator.enqueue(event()).unwrap();
        assert_eq!(coordinator.reconcile("restart").pending_events, 1);
        assert!(coordinator.next_backoff_ms() < coordinator.next_backoff_ms());
    }
}
