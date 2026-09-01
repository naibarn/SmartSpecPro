use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub const LOCAL_LLM_REGISTRY_FILE: &str = "local-llm-registry.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalLlmProviderKind {
    Ollama,
    LmStudio,
    Localai,
    Vllm,
    LlamaCpp,
    OpenaiCompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmProviderProfile {
    pub local_provider_id: String,
    pub provider_kind: LocalLlmProviderKind,
    pub display_name: String,
    pub base_url: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub allow_cloud_jobs: bool,
    /// Keyring entry name only. The credential itself is never serialized.
    pub credential_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelRecord {
    /// Explicit provider binding allows the same model ID to be configured on
    /// multiple local servers without ambiguity.
    pub local_provider_id: String,
    pub local_model_id: String,
    pub provider_model_id: String,
    pub display_name: String,
    pub capabilities: Vec<String>,
    pub context_window: Option<u32>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmRegistry {
    pub providers: Vec<LocalLlmProviderProfile>,
    pub models: Vec<LocalLlmModelRecord>,
    #[serde(default)]
    pub inventory_revision: i64,
    #[serde(default)]
    pub metadata: Value,
}

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 160 || !trimmed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.') {
        return Err(format!("{label} is invalid"));
    }
    Ok(())
}

impl LocalLlmRegistry {
    pub fn validate(&self) -> Result<(), String> {
        for provider in &self.providers {
            validate_id(&provider.local_provider_id, "localProviderId")?;
            if provider.display_name.trim().is_empty() || provider.display_name.len() > 160 {
                return Err("provider displayName is invalid".into());
            }
            if provider.credential_ref.as_deref().is_some_and(|value| value.contains('/') || value.contains('\\') || value.len() > 255) {
                return Err("credentialRef must be a keyring reference".into());
            }
            if self.providers.iter().filter(|item| item.local_provider_id == provider.local_provider_id).count() > 1 {
                return Err("duplicate localProviderId".into());
            }
        }
        for model in &self.models {
            validate_id(&model.local_provider_id, "localProviderId")?;
            if !self.providers.iter().any(|provider| provider.local_provider_id == model.local_provider_id) {
                return Err("model provider binding is missing".into());
            }
            validate_id(&model.local_model_id, "localModelId")?;
            if model.provider_model_id.trim().is_empty() || model.provider_model_id.len() > 240 {
                return Err("providerModelId is invalid".into());
            }
            if model.capabilities.is_empty() || model.capabilities.iter().any(|cap| !matches!(cap.as_str(), "llm.chat" | "llm.completion" | "llm.vision" | "llm.embedding" | "llm.tools" | "llm.json")) {
                return Err("model capabilities are unsupported".into());
            }
            if self.models.iter().filter(|item| item.local_provider_id == model.local_provider_id && item.local_model_id == model.local_model_id).count() > 1 {
                return Err("duplicate provider/model binding".into());
            }
        }
        Ok(())
    }

    pub fn upsert_provider(&mut self, provider: LocalLlmProviderProfile) -> Result<(), String> {
        let mut candidate = self.clone();
        if let Some(existing) = candidate.providers.iter_mut().find(|item| item.local_provider_id == provider.local_provider_id) {
            *existing = provider;
        } else {
            candidate.providers.push(provider);
        }
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn upsert_model(&mut self, model: LocalLlmModelRecord) -> Result<(), String> {
        let mut candidate = self.clone();
        if let Some(existing) = candidate.models.iter_mut().find(|item| item.local_provider_id == model.local_provider_id && item.local_model_id == model.local_model_id) {
            *existing = model;
        } else {
            candidate.models.push(model);
        }
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }

    pub fn remove_model(&mut self, provider_id: &str, model_id: &str) -> Result<(), String> {
        let before = self.models.len();
        self.models.retain(|item| !(item.local_provider_id == provider_id && item.local_model_id == model_id));
        if self.models.len() == before {
            return Err("local model not found".into());
        }
        Ok(())
    }

    pub fn remove_provider(&mut self, provider_id: &str) -> Result<(), String> {
        let before = self.providers.len();
        self.providers.retain(|item| item.local_provider_id != provider_id);
        if self.providers.len() == before {
            return Err("local provider not found".into());
        }
        self.models.retain(|item| item.local_provider_id != provider_id);
        Ok(())
    }

    pub fn bump_inventory_revision(&mut self) {
        self.inventory_revision = self.inventory_revision.saturating_add(1);
    }
}

pub fn registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LOCAL_LLM_REGISTRY_FILE)
}

pub fn save_registry(app_data_dir: &Path, registry: &LocalLlmRegistry) -> Result<(), String> {
    registry.validate()?;
    fs::create_dir_all(app_data_dir).map_err(|error| error.to_string())?;
    let destination = registry_path(app_data_dir);
    let temporary = destination.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(registry).map_err(|error| error.to_string())?;
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())
}

pub fn load_registry(app_data_dir: &Path) -> Result<LocalLlmRegistry, String> {
    let path = registry_path(app_data_dir);
    if !path.exists() {
        return Ok(LocalLlmRegistry::default());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let registry: LocalLlmRegistry = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    registry.validate()?;
    Ok(registry)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str) -> LocalLlmProviderProfile {
        LocalLlmProviderProfile {
            local_provider_id: id.into(),
            provider_kind: LocalLlmProviderKind::Ollama,
            display_name: id.into(),
            base_url: "http://127.0.0.1:11434".into(),
            enabled: true,
            allow_cloud_jobs: false,
            credential_ref: Some(format!("worker-{id}")),
        }
    }

    #[test]
    fn supports_multiple_profiles_and_models_without_serializing_secrets() {
        let mut registry = LocalLlmRegistry::default();
        registry.upsert_provider(provider("ollama-a")).unwrap();
        registry.upsert_provider(provider("ollama-b")).unwrap();
        registry.upsert_model(LocalLlmModelRecord {
            local_provider_id: "ollama-a".into(), local_model_id: "model-a".into(), provider_model_id: "llama3:8b".into(),
            display_name: "Llama 3".into(), capabilities: vec!["llm.chat".into()],
            context_window: Some(8192), enabled: true,
        }).unwrap();
        let serialized = serde_json::to_string(&registry).unwrap();
        assert!(!serialized.contains("apiKey"));
        assert!(serialized.contains("worker-ollama-a"));
        assert_eq!(registry.providers.len(), 2);
    }

    #[test]
    fn persistence_is_atomic_and_rejects_bad_capabilities() {
        let directory = tempfile::tempdir().unwrap();
        let registry = LocalLlmRegistry::default();
        save_registry(directory.path(), &registry).unwrap();
        assert_eq!(load_registry(directory.path()).unwrap(), registry);
        let mut invalid = registry;
        invalid.models.push(LocalLlmModelRecord {
            local_provider_id: "ollama-a".into(), local_model_id: "bad".into(), provider_model_id: "x".into(), display_name: "Bad".into(),
            capabilities: vec!["llm.audio".into()], context_window: None, enabled: true,
        });
        assert!(save_registry(directory.path(), &invalid).is_err());
    }
}
