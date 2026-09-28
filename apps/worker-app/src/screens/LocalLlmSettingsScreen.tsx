import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ProviderKind = "ollama" | "lm_studio" | "localai" | "vllm" | "llama_cpp" | "openai_compatible";
type Provider = {
  localProviderId: string;
  providerKind: ProviderKind;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  allowCloudJobs: boolean;
  credentialRef?: string | null;
};
type Model = {
  localProviderId: string;
  localModelId: string;
  providerModelId: string;
  displayName: string;
  capabilities: string[];
  contextWindow?: number | null;
  enabled: boolean;
};
type Registry = { providers: Provider[]; models: Model[] };

const EMPTY_REGISTRY: Registry = { providers: [], models: [] };
const CAPABILITIES = ["llm.chat", "llm.completion", "llm.vision", "llm.embedding"];

function errorText(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "local_llm_operation_failed";
}

export function LocalLlmSettingsScreen({ locale }: { locale: "th" | "en" }) {
  const [registry, setRegistry] = useState<Registry>(EMPTY_REGISTRY);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<Provider>({
    localProviderId: "", providerKind: "ollama", displayName: "", baseUrl: "http://127.0.0.1:11434",
    enabled: true, allowCloudJobs: false, credentialRef: null,
  });
  const [model, setModel] = useState<Model>({
    localProviderId: "", localModelId: "", providerModelId: "", displayName: "",
    capabilities: ["llm.chat"], contextWindow: null, enabled: true,
  });

  const load = useCallback(() => {
    void invoke<Registry>("worker_app_get_local_llm_registry")
      .then(value => { setRegistry(value); setError(""); })
      .catch(value => setError(errorText(value)));
  }, []);
  useEffect(load, [load]);

  const providerOptions = useMemo(() => registry.providers.filter(item => item.enabled), [registry.providers]);
  const saveProvider = async () => {
    try {
      setRegistry(await invoke<Registry>("worker_app_save_local_llm_provider", { provider }));
      setError("");
    } catch (value) { setError(errorText(value)); }
  };
  const saveModel = async () => {
    try {
      setRegistry(await invoke<Registry>("worker_app_save_local_llm_model", { model }));
      setError("");
    } catch (value) { setError(errorText(value)); }
  };
  const deleteProvider = async (localProviderId: string) => {
    try { setRegistry(await invoke<Registry>("worker_app_delete_local_llm_provider", { localProviderId })); }
    catch (value) { setError(errorText(value)); }
  };
  const deleteModel = async (localProviderId: string, localModelId: string) => {
    try { setRegistry(await invoke<Registry>("worker_app_delete_local_llm_model", { localProviderId, localModelId })); }
    catch (value) { setError(errorText(value)); }
  };
  const setCredential = async () => {
    const secret = window.prompt(locale === "th" ? "กรอก API key/secret สำหรับ provider นี้" : "Enter the provider API key/secret");
    if (!secret) return;
    try {
      setRegistry(await invoke<Registry>("worker_app_set_local_llm_credential", { localProviderId: provider.localProviderId, secret }));
      setError("");
    } catch (value) { setError(errorText(value)); }
  };

  return (
    <article className="panel wide settings-panel" data-testid="local-llm-settings">
      <div className="panel-heading">
        <p className="eyebrow">{locale === "th" ? "Local AI" : "Local AI"}</p>
        <h2>{locale === "th" ? "จัดการ Local LLM ของ Worker" : "Worker Local LLM"}</h2>
        <p className="subtle">{locale === "th" ? "เพิ่ม provider และ model ได้หลายชุด ข้อมูลลับอยู่ใน OS keyring เท่านั้น" : "Add multiple providers and models. Secrets stay in the OS keyring."}</p>
      </div>
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
      <div className="settings-grid">
        <label>Provider ID<input value={provider.localProviderId} onChange={event => setProvider(current => ({ ...current, localProviderId: event.target.value }))} placeholder="ollama-office" /></label>
        <label>Display name<input value={provider.displayName} onChange={event => setProvider(current => ({ ...current, displayName: event.target.value }))} placeholder="Office Ollama" /></label>
        <label>Provider type<select value={provider.providerKind} onChange={event => setProvider(current => ({ ...current, providerKind: event.target.value as ProviderKind }))}>{(["ollama", "lm_studio", "localai", "vllm", "llama_cpp", "openai_compatible"] as ProviderKind[]).map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label>Base URL<input value={provider.baseUrl} onChange={event => setProvider(current => ({ ...current, baseUrl: event.target.value }))} /></label>
        <label>Credential reference (optional)<input value={provider.credentialRef ?? ""} onChange={event => setProvider(current => ({ ...current, credentialRef: event.target.value || null }))} placeholder="worker-ollama-office" /></label>
        <div className="button-row"><button type="button" className="primary-button" onClick={() => void saveProvider()}>Save provider</button><button type="button" className="secondary-button" onClick={() => void setCredential()} disabled={!provider.localProviderId || !provider.credentialRef}>Set secret</button></div>
      </div>
      <div className="queue-summary" aria-label="Configured local LLM providers">
        {registry.providers.map(item => <div key={item.localProviderId}><span>{item.displayName}</span><strong>{item.providerKind} · {item.enabled ? "enabled" : "disabled"}</strong><button type="button" className="secondary-button" onClick={() => void deleteProvider(item.localProviderId)}>Delete</button></div>)}
      </div>
      <div className="settings-grid">
        <label>Provider<select value={model.localProviderId} onChange={event => setModel(current => ({ ...current, localProviderId: event.target.value }))}><option value="">Select provider</option>{providerOptions.map(item => <option key={item.localProviderId} value={item.localProviderId}>{item.displayName}</option>)}</select></label>
        <label>Local model ID<input value={model.localModelId} onChange={event => setModel(current => ({ ...current, localModelId: event.target.value }))} placeholder="qwen3-8b" /></label>
        <label>Provider model ID<input value={model.providerModelId} onChange={event => setModel(current => ({ ...current, providerModelId: event.target.value }))} placeholder="qwen3:8b" /></label>
        <label>Display name<input value={model.displayName} onChange={event => setModel(current => ({ ...current, displayName: event.target.value }))} placeholder="Qwen 3 8B" /></label>
        <label>Context window<input type="number" value={model.contextWindow ?? ""} onChange={event => setModel(current => ({ ...current, contextWindow: event.target.value ? Number(event.target.value) : null }))} /></label>
        <fieldset><legend>Capabilities</legend>{CAPABILITIES.map(capability => <label key={capability} className="toggle-row"><input type="checkbox" checked={model.capabilities.includes(capability)} onChange={event => setModel(current => ({ ...current, capabilities: event.target.checked ? [...new Set([...current.capabilities, capability])] : current.capabilities.filter(item => item !== capability) }))} />{capability}</label>)}</fieldset>
        <button type="button" className="primary-button" onClick={() => void saveModel()}>Save model</button>
      </div>
      <div className="queue-summary" aria-label="Configured local LLM models">
        {registry.models.map(item => <div key={`${item.localProviderId}:${item.localModelId}`}><span>{item.displayName}</span><strong>{item.localProviderId} · {item.capabilities.join(", ")}</strong><button type="button" className="secondary-button" onClick={() => void deleteModel(item.localProviderId, item.localModelId)}>Delete</button></div>)}
      </div>
    </article>
  );
}
