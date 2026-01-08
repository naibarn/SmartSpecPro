import { useEffect, useState } from "react";

interface ProviderConfig {
  id: string;
  provider_name: string;
  display_name: string;
  has_api_key: boolean;
  base_url: string | null;
  config_json: Record<string, any> | null;
  is_enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderFormData {
  display_name: string;
  api_key: string;
  base_url: string;
  is_enabled: boolean;
  description: string;
  config_json: Record<string, any>;
}

const PROVIDER_TEMPLATES = [
  {
    provider_name: "openai",
    display_name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    description: "GPT-4, GPT-3.5, and other OpenAI models",
  },
  {
    provider_name: "anthropic",
    display_name: "Anthropic Claude",
    base_url: "https://api.anthropic.com",
    description: "Claude 3 Opus, Sonnet, and Haiku models",
  },
  {
    provider_name: "google",
    display_name: "Google AI (Gemini)",
    base_url: "",
    description: "Gemini Pro and other Google AI models",
  },
  {
    provider_name: "groq",
    display_name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    description: "Ultra-fast LLM inference",
  },
  {
    provider_name: "ollama",
    display_name: "Ollama (Local)",
    base_url: "http://localhost:11434",
    description: "Run models locally with Ollama",
  },
  {
    provider_name: "openrouter",
    display_name: "OpenRouter",
    base_url: "",
    description: "Access 420+ models with unified API",
  },
  {
    provider_name: "zai",
    display_name: "Z.AI (GLM)",
    base_url: "",
    description: "GLM series models from Z.AI",
  },
];

const API_BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

export default function AdminSettings() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    display_name: "",
    api_key: "",
    base_url: "",
    is_enabled: true,
    description: "",
    config_json: {},
  });

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("auth_token");
      if (!token) {
        setError("You must be logged in as admin to access this page");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/admin/provider-configs/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Admin access required");
        }
        throw new Error(`Failed to fetch providers: ${response.statusText}`);
      }

      const data = await response.json();
      setProviders(data);
    } catch (err: any) {
      console.error("Error fetching providers:", err);
      setError(err.message || "Failed to load provider configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider.provider_name);
    setFormData({
      display_name: provider.display_name,
      api_key: "", // Don't pre-fill API key for security
      base_url: provider.base_url || "",
      is_enabled: provider.is_enabled,
      description: provider.description || "",
      config_json: provider.config_json || {},
    });
  };

  const handleCreateNew = (template: typeof PROVIDER_TEMPLATES[0]) => {
    setEditingProvider(template.provider_name);
    setFormData({
      display_name: template.display_name,
      api_key: "",
      base_url: template.base_url,
      is_enabled: true,
      description: template.description,
      config_json: {},
    });
  };

  const handleSave = async () => {
    if (!editingProvider) return;

    try {
      setSaving(true);
      setError("");

      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("You must be logged in");
      }

      const existingProvider = providers.find((p) => p.provider_name === editingProvider);
      const url = `${API_BASE_URL}/api/v1/admin/provider-configs/${editingProvider}`;
      const method = existingProvider ? "PUT" : "POST";

      const payload: any = {
        ...formData,
      };

      // Only include provider_name when creating new
      if (!existingProvider) {
        payload.provider_name = editingProvider;
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to save provider: ${response.statusText}`);
      }

      // Refresh list
      await fetchProviders();
      setEditingProvider(null);
      setFormData({
        display_name: "",
        api_key: "",
        base_url: "",
        is_enabled: true,
        description: "",
        config_json: {},
      });
    } catch (err: any) {
      console.error("Error saving provider:", err);
      setError(err.message || "Failed to save provider configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerName: string) => {
    if (!confirm(`Are you sure you want to delete ${providerName}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("You must be logged in");
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/admin/provider-configs/${providerName}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete provider: ${response.statusText}`);
      }

      await fetchProviders();
    } catch (err: any) {
      console.error("Error deleting provider:", err);
      setError(err.message || "Failed to delete provider");
    }
  };

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    width: "100%",
  };

  const buttonStyle = {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    background: "#3b82f6",
    color: "#ffffff",
    border: "1px solid #2563eb",
  };

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Admin Settings - Provider Configuration</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Admin Settings - LLM Provider Configuration</h2>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Configure API keys and settings for LLM providers
      </p>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fee2e2",
            border: "1px solid #f87171",
            borderRadius: 8,
            marginBottom: 16,
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      )}

      {/* Existing Providers */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>Configured Providers</h3>
        <div style={{ display: "grid", gap: 12 }}>
          {providers.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No providers configured yet</p>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <h4 style={{ margin: 0 }}>{provider.display_name}</h4>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: provider.is_enabled ? "#d1fae5" : "#fee2e2",
                          color: provider.is_enabled ? "#065f46" : "#991b1b",
                        }}
                      >
                        {provider.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                      {provider.has_api_key && (
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "#dbeafe",
                            color: "#1e40af",
                          }}
                        >
                          API Key Set
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0" }}>
                      <strong>Provider:</strong> {provider.provider_name}
                    </p>
                    {provider.base_url && (
                      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0" }}>
                        <strong>Base URL:</strong> {provider.base_url}
                      </p>
                    )}
                    {provider.description && (
                      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0" }}>
                        {provider.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleEdit(provider)} style={buttonStyle}>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(provider.provider_name)}
                      style={{ ...buttonStyle, color: "#dc2626" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add New Provider */}
      {!editingProvider && (
        <div>
          <h3 style={{ marginBottom: 16 }}>Add New Provider</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {PROVIDER_TEMPLATES.filter(
              (template) => !providers.some((p) => p.provider_name === template.provider_name)
            ).map((template) => (
              <div
                key={template.provider_name}
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#f9fafb",
                  cursor: "pointer",
                }}
                onClick={() => handleCreateNew(template)}
              >
                <h4 style={{ margin: "0 0 8px 0" }}>{template.display_name}</h4>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>{template.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Form */}
      {editingProvider && (
        <div
          style={{
            marginTop: 24,
            padding: 24,
            border: "2px solid #3b82f6",
            borderRadius: 8,
            background: "#eff6ff",
          }}
        >
          <h3 style={{ marginBottom: 16 }}>
            {providers.find((p) => p.provider_name === editingProvider) ? "Edit" : "Create"} Provider:{" "}
            {editingProvider}
          </h3>

          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                Display Name
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                style={inputStyle}
                placeholder="e.g., OpenAI"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                API Key
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
                  {" "}
                  (leave empty to keep existing)
                </span>
              </label>
              <input
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                style={inputStyle}
                placeholder="sk-..."
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                Base URL (optional)
              </label>
              <input
                type="text"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                style={inputStyle}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                Description (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ ...inputStyle, minHeight: 80 }}
                placeholder="Provider description..."
              />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={formData.is_enabled}
                  onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Enable this provider</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={handleSave} disabled={saving} style={primaryButtonStyle}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingProvider(null)}
                disabled={saving}
                style={buttonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
