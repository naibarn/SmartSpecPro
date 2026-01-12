import { useState, useEffect, useRef } from "react";

export interface CLIMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
}

// Default CLI modes
export const DEFAULT_CLI_MODES: CLIMode[] = [
  {
    id: "architect",
    name: "Architect",
    description: "Plan and design before implementation",
    icon: "🏗️",
    systemPrompt: `You are an expert software architect. Your role is to:
- Analyze requirements and design system architecture
- Create high-level designs and component diagrams
- Define interfaces, data models, and API contracts
- Consider scalability, security, and maintainability
- Provide clear technical specifications before implementation

Focus on planning and design. Do not write implementation code unless explicitly asked.`,
  },
  {
    id: "code",
    name: "Code",
    description: "Write, modify, and refactor code",
    icon: "💻",
    systemPrompt: `You are an expert software developer. Your role is to:
- Write clean, efficient, and well-documented code
- Follow best practices and coding standards
- Implement features based on requirements
- Refactor and optimize existing code
- Handle edge cases and error scenarios

Focus on writing production-ready code with proper error handling.`,
  },
  {
    id: "ask",
    name: "Ask",
    description: "Get answers and explanations",
    icon: "❓",
    systemPrompt: `You are a knowledgeable assistant. Your role is to:
- Answer technical questions clearly and accurately
- Explain complex concepts in simple terms
- Provide examples and analogies when helpful
- Cite sources and best practices
- Acknowledge uncertainty when appropriate

Focus on being helpful, accurate, and educational.`,
  },
  {
    id: "debug",
    name: "Debug",
    description: "Diagnose and fix software issues",
    icon: "🐛",
    systemPrompt: `You are an expert debugger and troubleshooter. Your role is to:
- Analyze error messages and stack traces
- Identify root causes of bugs and issues
- Suggest targeted fixes with explanations
- Recommend debugging strategies and tools
- Help prevent similar issues in the future

Focus on systematic debugging and clear explanations of what went wrong.`,
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Coordinate tasks across multiple modes",
    icon: "🎭",
    systemPrompt: `You are a task orchestrator and project manager. Your role is to:
- Break down complex tasks into manageable steps
- Coordinate between different aspects of development
- Track progress and dependencies
- Suggest which mode to use for each subtask
- Ensure consistency across the project

Focus on high-level coordination and task management.`,
  },
];

// Storage helpers for mode-model mappings
const STORAGE_KEY = "smartspec_cli_mode_models";

export interface ModeModelMapping {
  [modeId: string]: string; // modeId -> modelId
}

export function getModeModelMappings(): ModeModelMapping {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setModeModelMapping(modeId: string, modelId: string): void {
  try {
    const mappings = getModeModelMappings();
    mappings[modeId] = modelId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // Ignore storage errors
  }
}

export function getModelForMode(modeId: string): string | null {
  const mappings = getModeModelMappings();
  return mappings[modeId] || null;
}

interface CLIModeSelectorProps {
  selectedMode: string;
  onModeChange: (modeId: string) => void;
  modes?: CLIMode[];
  disabled?: boolean;
}

export function CLIModeSelector({
  selectedMode,
  onModeChange,
  modes = DEFAULT_CLI_MODES,
  disabled = false,
}: CLIModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Filter modes by search
  const filteredModes = modes.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected mode info
  const selectedModeInfo = modes.find((m) => m.id === selectedMode);

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #374151",
          background: disabled ? "#1f2937" : "#111827",
          color: "#e5e7eb",
          fontSize: 13,
          cursor: disabled ? "not-allowed" : "pointer",
          minWidth: 120,
        }}
      >
        <span>{selectedModeInfo?.icon || "📋"}</span>
        <span>{selectedModeInfo?.name || "Select Mode"}</span>
        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: "auto" }}>▼</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 4,
            width: 300,
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
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, padding: "0 4px" }}>
              Ctrl + . for next mode, Ctrl + Shift + . for previous mode
            </div>
          </div>

          {/* Mode List */}
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {filteredModes.map((mode) => (
              <div
                key={mode.id}
                onClick={() => {
                  onModeChange(mode.id);
                  setIsOpen(false);
                  setSearch("");
                }}
                style={{
                  padding: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: mode.id === selectedMode ? "#3b82f6" : "transparent",
                  color: mode.id === selectedMode ? "#fff" : "#e5e7eb",
                }}
                onMouseEnter={(e) => {
                  if (mode.id !== selectedMode) {
                    e.currentTarget.style.background = "#374151";
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode.id !== selectedMode) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span style={{ fontSize: 18 }}>{mode.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{mode.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{mode.description}</div>
                </div>
                {mode.id === selectedMode && (
                  <span style={{ fontSize: 14 }}>✓</span>
                )}
              </div>
            ))}

            {filteredModes.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
                No matching modes
              </div>
            )}
          </div>

          {/* Edit link */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #374151",
              fontSize: 13,
              color: "#9ca3af",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#374151";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Edit...
          </div>
        </div>
      )}
    </div>
  );
}

export default CLIModeSelector;
