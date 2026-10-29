//! Bounded, user-visible projections of Codex/Claude JSONL output.
//!
//! Hidden reasoning, credentials, tool arguments, and provider envelope data
//! are deliberately omitted before output crosses the Runner boundary.

use serde_json::{json, Value};

const MAX_EVENT_TEXT_CHARS: usize = 6_000;

pub(crate) fn clean_text(value: &str) -> String {
    let cleaned = value
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect::<String>();
    let words = cleaned.split_whitespace().collect::<Vec<_>>();
    let mut result = String::with_capacity(cleaned.len());
    let mut index = 0;
    while index < words.len() {
        let word = words[index];
        let lower = word.to_ascii_lowercase();
        if [
            "api_key",
            "api-key",
            "apikey",
            "token",
            "access_token",
            "refresh_token",
            "secret",
            "password",
            "authorization",
            "credential",
            "private_key",
            "database_url",
        ]
        .iter()
        .any(|key| lower.starts_with(&format!("{key}=")) || lower.starts_with(&format!("{key}:")))
        {
            result.push_str("[redacted]");
            if let Some((_, value)) = word.split_once(['=', ':']) {
                if value.is_empty() && index + 1 < words.len() {
                    index += 1;
                    if words[index].eq_ignore_ascii_case("bearer") && index + 1 < words.len() {
                        index += 1;
                    }
                    index += 1;
                }
            }
            index += 1;
            if index < words.len() {
                result.push(' ');
            }
            continue;
        }
        if lower == "bearer" {
            result.push_str("[redacted]");
            index = (index + 2).min(words.len());
            if index < words.len() {
                result.push(' ');
            }
            continue;
        }
        if lower.starts_with("sk-")
            || lower.starts_with("xox")
            || lower.starts_with("ghp_")
            || lower.starts_with("github_pat_")
            || lower.starts_with("glpat-")
            || lower.starts_with("ya29.")
            || (word.starts_with("AKIA") && word.len() >= 20)
        {
            result.push_str("[redacted]");
        } else {
            result.push_str(word);
        }
        index += 1;
        if index < words.len() {
            result.push(' ');
        }
    }
    result.trim().to_string()
}

fn bounded_events(kind: &str, value: &str, field: &str) -> Vec<Value> {
    let safe = clean_text(value);
    if safe.is_empty() {
        return Vec::new();
    }
    let chars = safe.chars().collect::<Vec<_>>();
    let chunks = chars.chunks(MAX_EVENT_TEXT_CHARS);
    let pieces = chunks
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>();
    let count = pieces.len();
    pieces
        .into_iter()
        .enumerate()
        .map(|(index, piece)| {
            let mut event = json!({
                "kind": kind,
                "chunkIndex": index,
                "chunkCount": count,
            });
            event[field] = Value::String(piece);
            event
        })
        .collect()
}

fn field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}

fn status_event(status: &str, detail: Option<&str>) -> Vec<Value> {
    let mut event = json!({ "kind": "turn_status", "status": status });
    if let Some(detail) = detail {
        event["detail"] = Value::String(clean_text(detail).chars().take(500).collect());
    }
    vec![event]
}

fn project_codex(value: &Value) -> Vec<Value> {
    let event_type = field(value, "type").unwrap_or_default();
    match event_type {
        "thread.started" => status_event("started", None),
        "turn.started" => status_event("working", None),
        "turn.completed" => status_event("completed", None),
        "turn.failed" | "error" => {
            let detail = field(value, "message").or_else(|| field(value, "error"));
            status_event("attention", detail)
        }
        "item.started" | "item.completed" => {
            let Some(item) = value.get("item") else {
                return Vec::new();
            };
            let item_type = field(item, "type").unwrap_or_default();
            match item_type {
                // Codex reasoning is private chain-of-thought and is not a
                // customer-visible execution event.
                "reasoning" => Vec::new(),
                "agent_message" if event_type == "item.completed" => field(item, "text")
                    .map(|text| bounded_events("assistant_message", text, "text"))
                    .unwrap_or_default(),
                "command_execution" => {
                    let mut events = Vec::new();
                    if event_type == "item.started" {
                        if let Some(command) = field(item, "command") {
                            events.extend(bounded_events("tool_call", command, "detail"));
                            for event in &mut events {
                                event["name"] = Value::String("command".into());
                            }
                        }
                    } else {
                        if let Some(output) = field(item, "aggregated_output") {
                            events.extend(bounded_events("tool_result", output, "text"));
                        }
                        let mut status = json!({
                            "kind": "tool_status",
                            "name": "command",
                            "exitCode": item.get("exit_code").cloned().unwrap_or(Value::Null),
                        });
                        if let Some(command) = field(item, "command") {
                            status["detail"] =
                                Value::String(clean_text(command).chars().take(1500).collect());
                        }
                        events.push(status);
                    }
                    events
                }
                "file_change" if event_type == "item.completed" => {
                    let changes = item
                        .get("changes")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let mut events = Vec::new();
                    for change in changes.into_iter().take(32) {
                        let status = match field(&change, "kind") {
                            Some("add" | "added" | "create" | "created") => "added",
                            Some("delete" | "deleted" | "remove" | "removed") => "deleted",
                            _ => "modified",
                        };
                        let mut projected = json!({
                            "kind": "file_change",
                            "path": field(&change, "path").map(clean_text).unwrap_or_default(),
                            "status": status,
                        });
                        if let Some(diff) = field(&change, "diff") {
                            for mut diff_event in bounded_events("file_diff", diff, "diff") {
                                diff_event["path"] = projected["path"].clone();
                                events.push(diff_event);
                            }
                        } else {
                            projected["path"] = Value::String(
                                projected["path"]
                                    .as_str()
                                    .unwrap_or_default()
                                    .chars()
                                    .take(500)
                                    .collect(),
                            );
                            events.push(projected);
                        }
                    }
                    events
                }
                "mcp_tool_call" | "web_search" | "image_generation" => {
                    let name = field(item, "name").unwrap_or(item_type);
                    vec![
                        json!({ "kind": "tool_status", "name": clean_text(name), "status": event_type }),
                    ]
                }
                _ => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

fn project_claude(value: &Value) -> Vec<Value> {
    match field(value, "type").unwrap_or_default() {
        "assistant" => {
            let blocks = value
                .pointer("/message/content")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut events = Vec::new();
            for block in blocks.into_iter().take(64) {
                match field(&block, "type").unwrap_or_default() {
                    "text" => {
                        if let Some(text) = field(&block, "text") {
                            events.extend(bounded_events("assistant_message", text, "text"));
                        }
                    }
                    // Tool inputs can contain source and secrets. Show the
                    // tool identity and result, never the raw argument JSON.
                    "tool_use" => events.push(json!({
                        "kind": "tool_call",
                        "name": field(&block, "name").map(clean_text).unwrap_or_else(|| "tool".into()),
                    })),
                    _ => {}
                }
            }
            events
        }
        "user" => {
            let blocks = value
                .pointer("/message/content")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut events = Vec::new();
            for block in blocks.into_iter().take(64) {
                if field(&block, "type") == Some("tool_result") {
                    let content = block
                        .get("content")
                        .and_then(Value::as_str)
                        .or_else(|| block.pointer("/content/0/text").and_then(Value::as_str));
                    if let Some(content) = content {
                        events.extend(bounded_events("tool_result", content, "text"));
                    }
                }
            }
            events
        }
        "stream_event" => {
            let event = value.get("event").unwrap_or(&Value::Null);
            if field(event, "type") == Some("content_block_delta")
                && field(event.pointer("/delta").unwrap_or(&Value::Null), "type")
                    == Some("text_delta")
            {
                field(event.pointer("/delta").unwrap_or(&Value::Null), "text")
                    .map(|text| bounded_events("assistant_message", text, "text"))
                    .unwrap_or_default()
            } else if field(event, "type") == Some("content_block_start")
                && field(
                    event.pointer("/content_block").unwrap_or(&Value::Null),
                    "type",
                ) == Some("tool_use")
            {
                let block = event.pointer("/content_block").unwrap_or(&Value::Null);
                vec![
                    json!({ "kind": "tool_call", "name": field(block, "name").map(clean_text).unwrap_or_else(|| "tool".into()) }),
                ]
            } else {
                Vec::new()
            }
        }
        "result" => field(value, "result")
            .map(|text| bounded_events("final_summary", text, "text"))
            .unwrap_or_else(|| status_event("completed", None)),
        "system" => {
            if field(value, "subtype") == Some("init") {
                status_event("started", None)
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}

fn project_copilot(value: &Value) -> Vec<Value> {
    match field(value, "type").unwrap_or_default() {
        "session.start" => status_event("started", None),
        "assistant.turn_start" => status_event("working", None),
        "assistant.message_delta" => field(value, "delta")
            .map(|text| bounded_events("assistant_message", text, "text"))
            .unwrap_or_default(),
        "assistant.message" => status_event("working", None),
        "tool.execution_start" => vec![json!({
            "kind": "tool_call",
            "name": field(value, "toolName").map(clean_text).unwrap_or_else(|| "tool".into()),
        })],
        "tool.execution_complete" => vec![json!({
            "kind": "tool_status",
            "name": "tool",
            "status": if value.get("success").and_then(Value::as_bool).unwrap_or(false) { "completed" } else { "failed" },
        })],
        "assistant.usage" => {
            let mut usage = json!({ "kind": "usage_reported", "source": "copilot_reported" });
            for key in [
                "modelId",
                "inputTokens",
                "outputTokens",
                "cacheReadTokens",
                "cacheWriteTokens",
                "reasoningTokens",
                "durationMs",
                "isByok",
            ] {
                if let Some(value) = value.get(key) {
                    usage[key] = value.clone();
                }
            }
            vec![usage]
        }
        "session.quota_observation" => {
            let mut quota = json!({ "kind": "quota_status", "source": "copilot_reported" });
            for key in [
                "accessState",
                "capacityState",
                "acquisitionStatus",
                "unit",
                "availableQuantity",
                "entitledQuantity",
            ] {
                if let Some(value) = value.get(key) {
                    quota[key] = value.clone();
                }
            }
            vec![quota]
        }
        "session.usage_info" => {
            let mut usage = json!({ "kind": "context_usage", "source": "copilot_reported" });
            for key in ["currentTokens", "tokenLimit", "messagesLength"] {
                if let Some(value) = value.get(key) {
                    usage[key] = value.clone();
                }
            }
            vec![usage]
        }
        "session.idle" | "session.autopilot_stopped" => status_event("completed", None),
        "session.error" => status_event(
            "attention",
            Some("Copilot runtime reported an execution error"),
        ),
        "permission.required" => vec![json!({
            "kind": "approval_required",
            "permissionKind": field(value, "permissionKind").unwrap_or("other"),
        })],
        _ => Vec::new(),
    }
}

pub fn project_harness_json_line(adapter_id: &str, line: &[u8]) -> Vec<Value> {
    let Ok(value) = serde_json::from_slice::<Value>(line) else {
        return Vec::new();
    };
    match adapter_id {
        "codex.v1" => project_codex(&value),
        "claude.v1" => project_claude(&value),
        crate::copilot_harness::ADAPTER_ID => project_copilot(&value),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_projects_assistant_tool_and_file_events_without_reasoning() {
        let assistant = project_harness_json_line(
            "codex.v1",
            br#"{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}"#,
        );
        assert_eq!(assistant[0]["kind"], "assistant_message");
        let tool = project_harness_json_line("codex.v1", br#"{"type":"item.completed","item":{"type":"command_execution","command":"npm test","aggregated_output":"2 tests passed","exit_code":0}}"#);
        assert!(tool
            .iter()
            .any(|event| event["kind"] == "tool_result" && event["text"] == "2 tests passed"));
        let file = project_harness_json_line("codex.v1", br#"{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"src/a.js","kind":"update","diff":"+safe"}]}}"#);
        assert!(file
            .iter()
            .any(|event| event["kind"] == "file_diff" && event["path"] == "src/a.js"));
        let reasoning = project_harness_json_line(
            "codex.v1",
            br#"{"type":"item.completed","item":{"type":"reasoning","text":"private chain"}}"#,
        );
        assert!(reasoning.is_empty());
    }

    #[test]
    fn claude_projects_streamed_text_tool_results_and_redacts_secrets() {
        let text = project_harness_json_line("claude.v1", br#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"token=abc123 visible"}}}"#);
        assert_eq!(text[0]["text"], "[redacted] visible");
        let call = project_harness_json_line("claude.v1", br#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"hidden"}}]}}"#);
        assert_eq!(call[0]["kind"], "tool_call");
        assert!(call[0].get("input").is_none());
        let output = project_harness_json_line("claude.v1", br#"{"type":"user","message":{"content":[{"type":"tool_result","content":"Tests passed"}]}}"#);
        assert_eq!(output[0]["text"], "Tests passed");
        let authorization = clean_text("Authorization: Bearer very-secret-token");
        assert_eq!(authorization, "[redacted]");
        assert!(!clean_text("refresh_token: abc123").contains("abc123"));
    }

    #[test]
    fn copilot_projects_streamed_text_and_safe_tool_metadata_only() {
        let text = project_harness_json_line(
            crate::copilot_harness::ADAPTER_ID,
            br#"{"type":"assistant.message_delta","delta":"token=private visible"}"#,
        );
        assert_eq!(text[0]["text"], "[redacted] visible");
        let tool = project_harness_json_line(
            crate::copilot_harness::ADAPTER_ID,
            br#"{"type":"tool.execution_start","toolName":"shell","arguments":{"command":"secret"}}"#,
        );
        assert_eq!(tool[0]["name"], "shell");
        assert!(tool[0].get("arguments").is_none());
        let approval = project_harness_json_line(
            crate::copilot_harness::ADAPTER_ID,
            br#"{"type":"permission.required","permissionKind":"shell"}"#,
        );
        assert_eq!(approval[0]["kind"], "approval_required");
        assert_eq!(approval[0]["permissionKind"], "shell");
        let usage = project_harness_json_line(
            crate::copilot_harness::ADAPTER_ID,
            br#"{"type":"assistant.usage","modelId":"model-x","inputTokens":12,"outputTokens":4,"source":"copilot_reported","cost":999}"#,
        );
        assert_eq!(usage[0]["kind"], "usage_reported");
        assert_eq!(usage[0]["inputTokens"], 12);
        assert!(usage[0].get("cost").is_none());
        let quota = project_harness_json_line(
            crate::copilot_harness::ADAPTER_ID,
            br#"{"type":"session.quota_observation","accessState":"unknown","capacityState":"unknown"}"#,
        );
        assert_eq!(quota[0]["accessState"], "unknown");
        assert!(quota[0].get("availableQuantity").is_none());
        assert_eq!(
            project_harness_json_line(
                crate::copilot_harness::ADAPTER_ID,
                br#"{"type":"assistant.reasoning_delta","delta":"private thought"}"#
            ),
            Vec::<Value>::new()
        );
    }

    #[test]
    fn long_harness_text_is_split_with_order_metadata() {
        let events = bounded_events("assistant_message", &"x".repeat(13_000), "text");
        assert_eq!(events.len(), 3);
        assert_eq!(events[2]["chunkIndex"], 2);
        assert_eq!(events[2]["chunkCount"], 3);
    }
}
