import { useState, useEffect, useRef } from "react";
import { getWebUrl, isWebAuthenticated, getAccessToken } from "../services/webAuthService";

export interface Model {
  id: string;
  name: string;
  provider: string;
  providerDisplayName: string;
  contextLength?: number;
  isDefault?: boolean;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  storageKey?: string; // Key for localStorage persistence
  disabled?: boolean;
}

// Local storage helper
function getStoredModel(key: string): string | null {
  try {
    return localStorage.getItem(`smartspec_model_${key}`);
  } catch {
    return null;
  }
}

function setStoredModel(key: string, modelId: string): void {
  try {
    localStorage.setItem(`smartspec_model_${key}`, modelId);
  } catch {
    // Ignore storage errors
  }
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  storageKey = "default",
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load models from SmartSpecWeb
  useEffect(() => {
    async function loadModels() {
      if (!isWebAuthenticated()) {
        setError("Not connected to SmartSpec Web");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const webUrl = getWebUrl();
        const token = getAccessToken();
        
        const response = await fetch(`${webUrl}/api/trpc/llmProviders.availableModels`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load models");
        }

        const data = await response.json();
        const result = data.result?.data;
        
        if (result?.models) {
          setModels(result.models);
          
          // If no model selected, use stored or default
          if (!selectedModel) {
            const stored = getStoredModel(storageKey);
            if (stored && result.models.find((m: Model) => m.id === stored)) {
              onModelChange(stored);
            } else {
              // Find default model
              const defaultModel = result.models.find((m: Model) => m.isDefault);
              if (defaultModel) {
                onModelChange(defaultModel.id);
              } else if (result.models.length > 0) {
                onModelChange(result.models[0].id);
              }
            }
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load models");
      } finally {
        setLoading(false);
      }
    }

    loadModels();
  }, []);

  // Handle model change with persistence
  const handleModelChange = (modelId: string) => {
    onModelChange(modelId);
    setStoredModel(storageKey, modelId);
    setIsOpen(false);
    setSearch("");
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter models by search
  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.providerDisplayName.toLowerCase().includes(search.toLowerCase())
  );

  // Group models by provider
  const groupedModels = filteredModels.reduce((acc, model) => {
    if (!acc[model.providerDisplayName]) {
      acc[model.providerDisplayName] = [];
    }
    acc[model.providerDisplayName].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  // Get selected model info
  const selectedModelInfo = models.find((m) => m.id === selectedModel);

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: disabled ? "#f3f4f6" : "#fff",
          fontSize: 13,
          cursor: disabled ? "not-allowed" : "pointer",
          minWidth: 200,
          justifyContent: "space-between",
        }}
      >
        <span style={{ 
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: "nowrap",
          maxWidth: 180,
        }}>
          {loading ? "Loading..." : error ? error : selectedModelInfo?.name || "Select Model"}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 4,
            width: 320,
            maxHeight: 400,
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: 8, borderBottom: "1px solid #374151" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #4b5563",
                background: "#374151",
                color: "#fff",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Model List */}
          <div style={{ maxHeight: 340, overflow: "auto" }}>
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <div
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    background: "#111827",
                  }}
                >
                  {provider}
                </div>
                {providerModels.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => handleModelChange(model.id)}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: model.id === selectedModel ? "#3b82f6" : "transparent",
                      color: model.id === selectedModel ? "#fff" : "#e5e7eb",
                    }}
                    onMouseEnter={(e) => {
                      if (model.id !== selectedModel) {
                        e.currentTarget.style.background = "#374151";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (model.id !== selectedModel) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{model.name}</div>
                      {model.contextLength && (
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          {(model.contextLength / 1000).toFixed(0)}K context
                        </div>
                      )}
                    </div>
                    {model.id === selectedModel && (
                      <span style={{ fontSize: 14 }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {filteredModels.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                {models.length === 0 ? "No models available" : "No matching models"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Display-only component showing current model
export function ModelDisplay({ modelId, models }: { modelId: string; models: Model[] }) {
  const model = models.find((m) => m.id === modelId);
  
  if (!model) {
    return <span style={{ fontSize: 12, color: "#6b7280" }}>{modelId}</span>;
  }

  return (
    <span style={{ fontSize: 12, color: "#6b7280" }}>
      {model.providerDisplayName}: {model.name}
    </span>
  );
}

export default ModelSelector;
