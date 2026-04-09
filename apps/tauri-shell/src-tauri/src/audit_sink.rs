use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DesktopAuditEvent {
    pub event_type: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, Value>,
}

#[derive(Debug, Default)]
pub struct DesktopAuditSink {
    events: Vec<DesktopAuditEvent>,
}

fn should_redact_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower.contains("token")
        || lower.contains("secret")
        || lower.contains("authorization")
        || lower.contains("api_key")
        || lower.contains("password")
}

fn redact_value(key: &str, value: &Value) -> Value {
    if should_redact_key(key) {
        return Value::String("[redacted]".into());
    }

    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(nested_key, nested_value)| {
                    (nested_key.clone(), redact_value(nested_key, nested_value))
                })
                .collect(),
        ),
        _ => value.clone(),
    }
}

pub fn redact_audit_event(input: DesktopAuditEvent) -> DesktopAuditEvent {
    let metadata = input
        .metadata
        .iter()
        .map(|(key, value)| (key.clone(), redact_value(key, value)))
        .collect();
    DesktopAuditEvent {
        event_type: input.event_type,
        metadata,
    }
}

impl DesktopAuditSink {
    pub fn record(&mut self, event: DesktopAuditEvent) -> DesktopAuditEvent {
        let redacted = redact_audit_event(event);
        self.events.push(redacted.clone());
        redacted
    }

    pub fn list(&self) -> Vec<DesktopAuditEvent> {
        self.events.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_secret_like_keys() {
        let event = DesktopAuditEvent {
            event_type: "desktop_host_policy_refresh".into(),
            metadata: BTreeMap::from([
                ("token".into(), json!("abc")),
                ("nested".into(), json!({ "api_key": "secret", "safe": "ok" })),
            ]),
        };

        let redacted = redact_audit_event(event);
        assert_eq!(
            redacted.metadata.get("token"),
            Some(&Value::String("[redacted]".into()))
        );
        assert_eq!(
            redacted.metadata.get("nested"),
            Some(&json!({ "api_key": "[redacted]", "safe": "ok" }))
        );
    }
}
