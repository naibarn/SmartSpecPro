use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::local_llm_registry::{LocalLlmModelRecord, LocalLlmProviderProfile, LocalLlmRegistry};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmRequest {
    pub request_id: String,
    pub model_ref: String,
    pub local_provider_id: String,
    pub local_model_id: String,
    pub inventory_revision: i64,
    pub messages: Vec<Value>,
    #[serde(default)]
    pub parameters: Value,
    pub stream: bool,
}

pub fn validate_provider_url(profile: &LocalLlmProviderProfile) -> Result<Url, String> {
    let url = Url::parse(profile.base_url.trim()).map_err(|_| "provider URL is invalid".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.username() != "" || url.password().is_some() {
        return Err("provider URL must be HTTP(S) without embedded credentials".into());
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let loopback = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1") || host.starts_with("127.");
    if url.scheme() == "http" && !loopback {
        return Err("HTTP providers must be loopback-only".into());
    }
    Ok(url)
}

pub fn resolve_model<'a>(registry: &'a LocalLlmRegistry, request: &LocalLlmRequest) -> Result<(&'a LocalLlmProviderProfile, &'a LocalLlmModelRecord), String> {
    let model = registry.models.iter().find(|item| item.local_provider_id == request.local_provider_id && item.local_model_id == request.local_model_id && item.enabled).ok_or_else(|| "local model is unavailable".to_string())?;
    let provider = registry.providers.iter().find(|item| item.enabled && item.local_provider_id == request.local_provider_id).ok_or_else(|| "local provider binding is unavailable".to_string())?;
    Ok((provider, model))
}

pub fn build_openai_chat_payload(request: &LocalLlmRequest, model: &LocalLlmModelRecord) -> Result<Value, String> {
    if request.messages.is_empty() || request.messages.len() > 128 {
        return Err("messages are required and bounded".into());
    }
    if request.stream && model.capabilities.iter().all(|cap| cap != "llm.chat" && cap != "llm.completion") {
        return Err("model does not support streaming chat".into());
    }
    let mut payload = json!({ "model": model.provider_model_id, "messages": request.messages, "stream": request.stream });
    if let Some(parameters) = request.parameters.as_object() {
        for (key, value) in parameters {
            if matches!(key.as_str(), "temperature" | "top_p" | "maxTokens" | "max_tokens" | "response_format") {
                payload[key] = value.clone();
            }
        }
    }
    Ok(payload)
}

pub fn normalize_openai_response(request: &LocalLlmRequest, response: Value) -> Result<Value, String> {
    let text = response.get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    Ok(json!({
        "schemaVersion": "worker-llm-result/1",
        "requestId": request.request_id,
        "modelRef": request.model_ref,
        "finishReason": response.get("choices").and_then(Value::as_array).and_then(|items| items.first()).and_then(|item| item.get("finish_reason")).and_then(Value::as_str).unwrap_or("stop"),
        "text": text,
        "usage": response.get("usage").cloned().unwrap_or_else(|| json!({})),
    }))
}

pub async fn execute_openai_compatible(
    profile: &LocalLlmProviderProfile,
    model: &LocalLlmModelRecord,
    request: &LocalLlmRequest,
    api_key: Option<&str>,
    cancel: &AtomicBool,
) -> Result<Value, String> {
    if cancel.load(Ordering::Relaxed) { return Err("canceled before provider send".into()); }
    let base = validate_provider_url(profile)?;
    let endpoint = base.join("/v1/chat/completions").map_err(|_| "provider endpoint is invalid".to_string())?;
    let payload = build_openai_chat_payload(request, model)?;
    let client = Client::builder().timeout(Duration::from_secs(600)).redirect(reqwest::redirect::Policy::none()).build().map_err(|error| error.to_string())?;
    let mut call = client.post(endpoint).json(&payload);
    if let Some(key) = api_key.filter(|value| !value.trim().is_empty()) { call = call.bearer_auth(key); }
    let response = call.send().await.map_err(|error| error.to_string())?;
    if cancel.load(Ordering::Relaxed) { return Err("canceled after provider response".into()); }
    if !response.status().is_success() { return Err(format!("local provider returned status {}", response.status())); }
    let body = response.json::<Value>().await.map_err(|error| error.to_string())?;
    normalize_openai_response(request, body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_llm_registry::{LocalLlmProviderKind, LocalLlmProviderProfile};

    fn profile() -> LocalLlmProviderProfile {
        LocalLlmProviderProfile { local_provider_id: "p".into(), provider_kind: LocalLlmProviderKind::Ollama, display_name: "P".into(), base_url: "http://127.0.0.1:11434".into(), enabled: true, allow_cloud_jobs: false, credential_ref: None }
    }

    #[test]
    fn validates_local_url_and_redacts_credentials_from_payload() {
        assert!(validate_provider_url(&profile()).is_ok());
        let mut remote = profile(); remote.base_url = "http://example.test".into();
        assert!(validate_provider_url(&remote).is_err());
        let model = LocalLlmModelRecord { local_provider_id: "p".into(), local_model_id: "m".into(), provider_model_id: "llama3".into(), display_name: "Llama".into(), capabilities: vec!["llm.chat".into()], context_window: Some(4096), enabled: true };
        let request = LocalLlmRequest { request_id: "request-1".into(), model_ref: "wllm_ref".into(), local_provider_id: "p".into(), local_model_id: "m".into(), inventory_revision: 1, messages: vec![json!({"role":"user","content":"hello"})], parameters: json!({"apiKey":"must-not-forward","temperature":0.2}), stream: false };
        let payload = build_openai_chat_payload(&request, &model).unwrap();
        assert!(!payload.to_string().contains("apiKey"));
    }

    #[test]
    fn normalizes_completion_and_rejects_empty_input() {
        let request = LocalLlmRequest { request_id: "request-1".into(), model_ref: "wllm_ref".into(), local_provider_id: "p".into(), local_model_id: "m".into(), inventory_revision: 1, messages: vec![], parameters: json!({}), stream: false };
        assert!(build_openai_chat_payload(&request, &LocalLlmModelRecord { local_provider_id: "p".into(), local_model_id: "m".into(), provider_model_id: "m".into(), display_name: "M".into(), capabilities: vec!["llm.chat".into()], context_window: None, enabled: true }).is_err());
        let valid = LocalLlmRequest { messages: vec![json!({"role":"user","content":"hello"})], ..request };
        let result = normalize_openai_response(&valid, json!({"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]})).unwrap();
        assert_eq!(result["text"], "ok");
    }
}
