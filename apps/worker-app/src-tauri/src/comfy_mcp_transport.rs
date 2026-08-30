//! Streamable HTTP MCP transport boundary.
//!
//! The native Worker owns this client. It is intentionally independent from
//! the authenticated SmartAIHub control-plane HTTP client.

use reqwest::{Client, StatusCode};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const MAX_MCP_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_MCP_TOOL_PAGES: u64 = 16;
const MAX_MCP_TOOLS: usize = 256;

#[derive(Debug, Clone)]
pub struct ComfyHttpMcpTransport {
    client: Client,
    endpoint: String,
    bearer_token: Option<String>,
    protocol_version: String,
    session_id: Option<String>,
}

impl ComfyHttpMcpTransport {
    pub fn new(endpoint: String, bearer_token: Option<String>, timeout: Duration) -> Result<Self, String> {
        validate_endpoint(&endpoint)?;
        let client = Client::builder().timeout(timeout).redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "comfy_http_client_failed".to_string())?;
        Ok(Self { client, endpoint, bearer_token, protocol_version: "2025-06-18".into(), session_id: None })
    }

    pub async fn call(&mut self, id: u64, method: &str, params: Value) -> Result<Value, String> {
        if method.trim().is_empty() { return Err("comfy_mcp_method_missing".into()); }
        let mut request = self.client.post(&self.endpoint)
            .header("Accept", "application/json, text/event-stream")
            .header("Content-Type", "application/json")
            .header("MCP-Protocol-Version", &self.protocol_version)
            .json(&serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        if let Some(session_id) = self.session_id.as_deref() { request = request.header("Mcp-Session-Id", session_id); }
        if let Some(token) = self.bearer_token.as_deref() { request = request.bearer_auth(token); }
        let response = request.send().await.map_err(|_| "comfy_mcp_http_unreachable".to_string())?;
        if response.status() == StatusCode::UNAUTHORIZED { return Err("comfy_mcp_http_unauthorized".into()); }
        if response.status() == StatusCode::FORBIDDEN { return Err("comfy_mcp_http_forbidden".into()); }
        if response.status() == StatusCode::NOT_FOUND { self.session_id = None; return Err("comfy_mcp_http_session_not_found".into()); }
        if !response.status().is_success() { return Err("comfy_mcp_http_failed".into()); }
        if let Some(session_id) = response.headers().get("Mcp-Session-Id").and_then(|value| value.to_str().ok()) { self.session_id = Some(session_id.to_string()); }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let body = response.bytes().await.map_err(|_| "comfy_mcp_http_invalid_response".to_string())?;
        if body.len() > MAX_MCP_RESPONSE_BYTES { return Err("comfy_mcp_http_response_too_large".into()); }
        if content_type.contains("text/event-stream") {
            parse_sse_json(&body)
        } else {
            serde_json::from_slice(&body).map_err(|_| "comfy_mcp_http_invalid_response".into())
        }
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        if method.trim().is_empty() { return Err("comfy_mcp_method_missing".into()); }
        let mut request = self.client.post(&self.endpoint)
            .header("Accept", "application/json, text/event-stream")
            .header("Content-Type", "application/json")
            .header("MCP-Protocol-Version", &self.protocol_version)
            .json(&serde_json::json!({ "jsonrpc": "2.0", "method": method, "params": params }));
        if let Some(session_id) = self.session_id.as_deref() { request = request.header("Mcp-Session-Id", session_id); }
        if let Some(token) = self.bearer_token.as_deref() { request = request.bearer_auth(token); }
        let response = request.send().await.map_err(|_| "comfy_mcp_http_unreachable".to_string())?;
        if response.status() == StatusCode::UNAUTHORIZED { return Err("comfy_mcp_http_unauthorized".into()); }
        if response.status() == StatusCode::FORBIDDEN { return Err("comfy_mcp_http_forbidden".into()); }
        if !response.status().is_success() { return Err("comfy_mcp_http_notification_failed".into()); }
        if let Some(session_id) = response.headers().get("Mcp-Session-Id").and_then(|value| value.to_str().ok()) { self.session_id = Some(session_id.to_string()); }
        Ok(())
    }

    pub async fn discover_tools(&mut self) -> Result<Value, String> {
        let initialize = self
            .call(
                1,
                "initialize",
                serde_json::json!({
                    "protocolVersion": self.protocol_version,
                    "capabilities": {},
                    "clientInfo": {"name": "smartaihub-worker", "version": env!("CARGO_PKG_VERSION")}
                }),
            )
            .await?;
        if initialize.get("error").is_some() {
            return Err("comfy_mcp_http_initialize_rejected".into());
        }
        if let Some(version) = initialize
            .get("result")
            .and_then(|result| result.get("protocolVersion"))
            .and_then(Value::as_str)
        {
            self.protocol_version = version.to_string();
        }
        self.notify("notifications/initialized", serde_json::json!({})).await?;
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        let mut seen_cursors = HashSet::new();
        for page in 0..MAX_MCP_TOOL_PAGES {
            if let Some(cursor_value) = cursor.as_ref() {
                if !seen_cursors.insert(cursor_value.clone()) { return Err("comfy_mcp_http_tools_list_cursor_loop".into()); }
            }
            let params = cursor.as_ref().map(|value| serde_json::json!({"cursor": value})).unwrap_or_else(|| serde_json::json!({}));
            let response = self.call(2 + page, "tools/list", params).await?;
            if response.get("error").is_some() { return Err("comfy_mcp_http_tools_list_rejected".into()); }
            if let Some(page_tools) = response.get("result").and_then(|result| result.get("tools")).and_then(Value::as_array) {
                tools.extend(page_tools.iter().cloned());
                if tools.len() > MAX_MCP_TOOLS { return Err("comfy_mcp_http_tool_count_limit".into()); }
            }
            cursor = response
                .get("result")
                .and_then(|result| result.get("nextCursor").or_else(|| result.get("next_cursor")))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string);
            if cursor.is_none() {
                return Ok(serde_json::json!({"result": {"tools": tools}}));
            }
        }
        Err("comfy_mcp_http_tools_list_pagination_limit".into())
    }

    pub async fn call_tool(&mut self, tool_name: &str, arguments: Value) -> Result<Value, String> {
        if tool_name.trim().is_empty() { return Err("comfy_mcp_tool_missing".into()); }
        let response = self.call(10_000, "tools/call", serde_json::json!({"name": tool_name, "arguments": arguments})).await?;
        if response.get("error").is_some() { return Err("comfy_mcp_tool_error".into()); }
        Ok(response.get("result").cloned().unwrap_or(response))
    }

    pub async fn run_workflow_with_lifecycle(&mut self, arguments: Value, cancel: Arc<AtomicBool>) -> Result<Value, String> {
        self.run_workflow_with_lifecycle_for_tool(arguments, None, cancel, |_| {}).await
    }

    pub async fn run_workflow_with_lifecycle_and_callback<F>(&mut self, arguments: Value, cancel: Arc<AtomicBool>, on_execution_id: F) -> Result<Value, String>
    where F: Fn(&str) + Send + Sync {
        self.run_workflow_with_lifecycle_for_tool(arguments, None, cancel, on_execution_id).await
    }

    pub async fn run_workflow_with_lifecycle_for_tool<F>(&mut self, arguments: Value, requested_tool: Option<&str>, cancel: Arc<AtomicBool>, on_execution_id: F) -> Result<Value, String>
    where F: Fn(&str) + Send + Sync {
        let tools = self.discover_tools().await?;
        let tool_items = tools.get("result").and_then(|value| value.get("tools")).and_then(Value::as_array).cloned().unwrap_or_default();
        let tool_names = tool_items.iter().filter_map(|item| item.get("name").and_then(Value::as_str)).collect::<Vec<_>>();
        let run_tool = requested_tool
            .filter(|requested| ["run_workflow", "run_template", "submit_workflow", "create_execution"].contains(requested))
            .filter(|requested| tool_names.iter().any(|name| name == requested))
            .or_else(|| ["run_workflow", "run_template", "submit_workflow", "create_execution"].iter().find(|candidate| tool_names.iter().any(|name| *name == **candidate)).copied())
            .ok_or_else(|| "comfy_mcp_workflow_submit_tool_missing".to_string())?;
        if cancel.load(Ordering::Relaxed) {
            return Err("comfy_mcp_execution_canceled".into());
        }
        let mut next_id = 4_u64;
        let submission = self.call(next_id, "tools/call", serde_json::json!({"name": run_tool, "arguments": arguments})).await?;
        if submission.get("error").is_some() { return Err("comfy_mcp_tool_error".into()); }
        let Some(execution_id) = find_string_field(&submission, &["executionId", "execution_id", "jobId", "job_id", "promptId", "prompt_id"]) else { return Ok(submission); };
        on_execution_id(&execution_id);
        let status_tool = ["wait_for_job", "job_status", "get_job_status", "watch_job", "wait_workflow", "get_workflow_status", "get_execution", "workflow_status"].iter().find(|candidate| tool_names.iter().any(|name| *name == **candidate));
        let Some(status_tool) = status_tool else { return Ok(submission); };
        for _ in 0..720 {
            if cancel.load(Ordering::Relaxed) {
                if let Some(cancel_tool) = ["cancel_job", "cancel_workflow", "cancel_execution", "cancel"].iter().find(|candidate| tool_names.iter().any(|name| *name == **candidate)) {
                    let _ = self.call(next_id.saturating_add(1), "tools/call", serde_json::json!({"name": cancel_tool, "arguments": lifecycle_arguments(&tool_items, cancel_tool, &execution_id)})).await;
                }
                return Err("comfy_mcp_execution_canceled".into());
            }
            next_id = next_id.saturating_add(1);
            let status = self.call(next_id, "tools/call", serde_json::json!({"name": status_tool, "arguments": lifecycle_arguments(&tool_items, status_tool, &execution_id)})).await?;
            if find_string_field(&status, &["artifactPath", "artifact_path", "outputPath", "output_path", "artifactUrl", "artifact_url", "outputUrl", "output_url"]).is_some() {
                return Ok(serde_json::json!({ "executionId": execution_id, "status": "completed", "submission": submission, "statusResult": status, "output": Value::Null }));
            }
            match find_status(&status).as_deref() {
                Some("completed" | "complete" | "succeeded" | "success" | "done") => {
                    let output = if let Some(output_tool) = ["fetch_outputs", "get_output", "get_job_output", "get_execution_output"].iter().find(|candidate| tool_names.iter().any(|name| *name == **candidate)) {
                        self.call(next_id.saturating_add(1), "tools/call", serde_json::json!({"name": output_tool, "arguments": lifecycle_arguments(&tool_items, output_tool, &execution_id)})).await?
                    } else { Value::Null };
                    return Ok(serde_json::json!({ "executionId": execution_id, "status": "completed", "submission": submission, "statusResult": status, "output": output }));
                }
                Some("failed" | "error" | "canceled" | "cancelled" | "expired") => return Err("comfy_mcp_execution_terminal".into()),
                _ => tokio::time::sleep(Duration::from_millis(500)).await,
            }
        }
        Err("comfy_mcp_execution_reconciliation_timeout".into())
    }
}

fn lifecycle_arguments(tools: &[Value], tool_name: &str, execution_id: &str) -> Value {
    let properties = tools.iter().find(|tool| tool.get("name").and_then(Value::as_str) == Some(tool_name))
        .and_then(|tool| tool.get("inputSchema").or_else(|| tool.get("input_schema")))
        .and_then(|schema| schema.get("properties"))
        .and_then(Value::as_object);
    let key = ["executionId", "execution_id", "job_id", "jobId", "prompt_id", "promptId"]
        .iter().find(|candidate| properties.is_some_and(|items| items.contains_key(**candidate)))
        .copied().unwrap_or_else(|| if matches!(tool_name, "job_status" | "fetch_outputs") { "prompt_id" } else { "job_id" });
    serde_json::json!({ key: execution_id })
}

fn find_string_field(value: &Value, names: &[&str]) -> Option<String> {
    if let Some(object) = value.as_object() {
        for name in names {
            if let Some(value) = object.get(*name).and_then(Value::as_str).filter(|value| !value.trim().is_empty()) { return Some(value.to_string()); }
        }
        for child in object.values() { if let Some(found) = find_string_field(child, names) { return Some(found); } }
    }
    if let Some(array) = value.as_array() { for child in array { if let Some(found) = find_string_field(child, names) { return Some(found); } } }
    None
}

fn find_status(value: &Value) -> Option<String> { find_string_field(value, &["status", "state", "executionStatus"]).map(|value| value.to_ascii_lowercase()) }

fn parse_sse_json(body: &[u8]) -> Result<Value, String> {
    let text = std::str::from_utf8(body).map_err(|_| "comfy_mcp_http_invalid_response".to_string())?;
    for line in text.lines() {
        let Some(data) = line.strip_prefix("data:") else { continue };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" { continue; }
        return serde_json::from_str(data).map_err(|_| "comfy_mcp_http_invalid_response".into());
    }
    Err("comfy_mcp_http_empty_response".into())
}

pub fn validate_endpoint(endpoint: &str) -> Result<(), String> {
    let endpoint = endpoint.trim();
    let allowed = endpoint.starts_with("https://") || endpoint.starts_with("http://127.0.0.1:") || endpoint.starts_with("http://localhost:") || endpoint.starts_with("http://[::1]:");
    if !allowed || endpoint.contains(['?', '#', '\\', '@']) || endpoint.contains("169.254.") || endpoint.contains("127.0.0.1.evil") { return Err("comfy_http_endpoint_not_allowed".into()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_endpoint;
    #[test]
    fn allows_https_and_loopback_only() {
        assert!(validate_endpoint("https://comfy.example.test/mcp").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8188/mcp").is_ok());
        assert!(validate_endpoint("http://169.254.169.254/mcp").is_err());
        assert!(validate_endpoint("https://comfy.example.test/mcp?token=secret").is_err());
    }
}
