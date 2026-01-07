import { useEffect, useMemo, useState } from "react";
import type { WorkflowSchema } from "../services/kiloCli";

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  workflows: string[];
  schemas?: WorkflowSchema[];
  onApplyCommand: (command: string) => void;
};

/**
 * Simple Command Palette UI for the desktop CLI:
 * - Type to filter workflows
 * - Navigate with ↑ / ↓
 * - Press Enter to select
 * - Fill in arguments (schema-driven) and apply the formatted CLI command
 */
export function CommandPalette(props: CommandPaletteProps) {
  const { isOpen, onClose, workflows, schemas, onApplyCommand } = props;

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  // Reset internal state whenever palette is opened
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActiveIndex(0);
    setSelectedWorkflow(null);
    setArgValues({});
  }, [isOpen]);

  const schemaMap = useMemo(() => {
    const map = new Map<string, WorkflowSchema>();
    (schemas || []).forEach((s) => {
      if (s?.name) {
        map.set(s.name, s);
      }
    });
    return map;
  }, [schemas]);

  const filteredWorkflows = useMemo(() => {
    const base = [...workflows].sort((a, b) => a.localeCompare(b));
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((w) => w.toLowerCase().includes(q));
  }, [workflows, query]);

  const activeName =
    selectedWorkflow ||
    (filteredWorkflows.length > 0 ? filteredWorkflows[Math.min(activeIndex, filteredWorkflows.length - 1)] : "");

  const activeSchema = activeName ? schemaMap.get(activeName) : undefined;

  // When the active workflow changes, ensure argValues has defaults
  useEffect(() => {
    if (!activeSchema) return;
    setArgValues((prev) => {
      const next: Record<string, string> = {};
      const args = activeSchema.args || [];
      for (const arg of args) {
        if (prev[arg.name] !== undefined) {
          next[arg.name] = prev[arg.name];
        } else if (arg.type === "enum" && arg.values && arg.values.length > 0) {
          // default to first enum value
          next[arg.name] = arg.values[0];
        } else {
          next[arg.name] = "";
        }
      }
      return next;
    });
  }, [activeSchema?.name]);

  function updateArg(name: string, value: string) {
    setArgValues((prev) => ({ ...prev, [name]: value }));
  }

  function buildCommand(): string {
    if (!activeName) return "";
    const schema = activeSchema;
    // Level 1: simple snippet template if we don't know the schema
    if (!schema || !schema.args || schema.args.length === 0) {
      return `/${activeName}`;
    }

    // Level 2: schema‑driven prompt builder
    const parts: string[] = [`/${activeName}`];
    for (const arg of schema.args) {
      const raw = (argValues[arg.name] ?? "").trim();
      if (!raw) {
        // skip optional args without a value
        if (arg.required) {
          // required but empty -> will be handled by validation
        }
        continue;
      }

      const flag = `--${arg.name}`;
      const needsQuotes = /\s/.test(raw);
      const value = needsQuotes ? JSON.stringify(raw) : raw;
      parts.push(flag, value);
    }
    return parts.join(" ");
  }

  function getValidationError(): string | null {
    if (!activeSchema || !activeSchema.args || activeSchema.args.length === 0) {
      return null;
    }
    for (const arg of activeSchema.args) {
      const raw = (argValues[arg.name] ?? "").trim();
      if (arg.required && !raw) {
        return `Argument "${arg.name}" is required.`;
      }
      if (arg.type === "enum" && arg.values && raw && !arg.values.includes(raw)) {
        return `Argument "${arg.name}" must be one of: ${arg.values.join(", ")}.`;
      }
    }
    return null;
  }

  const validationError = getValidationError();
  const commandPreview = buildCommand();

  function handleApply() {
    if (!commandPreview) return;
    if (validationError) return;
    onApplyCommand(commandPreview);
    onClose();
  }

  function handleKeyDown(event: any) {
    if (!filteredWorkflows.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredWorkflows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        prev - 1 < 0 ? filteredWorkflows.length - 1 : (prev - 1) % filteredWorkflows.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!activeName) return;
      // First Enter: choose the active workflow
      if (!selectedWorkflow || selectedWorkflow !== activeName) {
        setSelectedWorkflow(activeName);
      } else {
        // Second Enter (when the same workflow is already selected): try to apply
        handleApply();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#0b1120",
        color: "#e5e7eb",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a workflow name… (↑/↓ to navigate, Enter to select)"
          style={{
            flex: 1,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #4b5563",
            background: "#020617",
            color: "inherit",
          }}
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid #4b5563",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Esc
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)", gap: 12 }}>
        <div
          style={{
            maxHeight: 220,
            overflow: "auto",
            borderRadius: 8,
            border: "1px solid #1f2937",
            background: "#020617",
          }}
        >
          {filteredWorkflows.length === 0 ? (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.7 }}>No workflows match "{query}".</div>
          ) : (
            filteredWorkflows.map((name, idx) => {
              const isActive = name === activeName;
              return (
                <div
                  key={name}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    setSelectedWorkflow(name);
                  }}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: isActive ? "#111827" : "transparent",
                    color: isActive ? "#f9fafb" : "#e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>/{name}</span>
                  {schemaMap.has(name) ? (
                    <span style={{ fontSize: 10, opacity: 0.7 }}>schema</span>
                  ) : (
                    <span style={{ fontSize: 10, opacity: 0.5 }}>snippet</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #1f2937",
            background: "#020617",
            display: "grid",
            gap: 8,
          }}
        >
          {activeName ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 500 }}>/{activeName}</div>
              {activeSchema?.description ? (
                <div style={{ fontSize: 11, opacity: 0.8 }}>{activeSchema.description}</div>
              ) : null}

              {/* Level 2: schema‑driven argument editor */}
              {activeSchema?.args && activeSchema.args.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {activeSchema.args.map((arg) => (
                    <div key={arg.name} style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 11, opacity: 0.9 }}>
                        --{arg.name}
                        {arg.required ? <span style={{ opacity: 0.8 }}> *</span> : null}
                      </div>
                      {arg.type === "enum" && arg.values && arg.values.length > 0 ? (
                        <select
                          value={argValues[arg.name] ?? ""}
                          onChange={(e) => updateArg(arg.name, e.target.value)}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px solid #4b5563",
                            background: "#020617",
                            color: "inherit",
                            fontSize: 12,
                          }}
                        >
                          {arg.values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={argValues[arg.name] ?? ""}
                          onChange={(e) => updateArg(arg.name, e.target.value)}
                          placeholder={arg.required ? "required" : "optional"}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 6,
                            border: "1px solid #4b5563",
                            background: "#020617",
                            color: "inherit",
                            fontSize: 12,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  No schema detected for this workflow. The palette will insert a simple snippet:
                  <code style={{ marginLeft: 4 }}>/{activeName}</code>
                </div>
              )}

              {activeSchema?.example ? (
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  Example: <code>{activeSchema.example}</code>
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 6,
                  padding: 6,
                  borderRadius: 6,
                  background: "#020617",
                  border: "1px dashed #374151",
                  fontSize: 11,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                <div style={{ opacity: 0.7, marginBottom: 2 }}>Preview command</div>
                <div>{commandPreview || "—"}</div>
              </div>

              {validationError ? (
                <div style={{ fontSize: 11, color: "#fecaca" }}>{validationError}</div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!commandPreview || !!validationError}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 12,
                    cursor: commandPreview && !validationError ? "pointer" : "default",
                    opacity: commandPreview && !validationError ? 1 : 0.5,
                    background: "#10b981",
                    color: "#022c22",
                    fontWeight: 500,
                  }}
                >
                  Apply to command
                </button>
                <div style={{ fontSize: 10, opacity: 0.7 }}>
                  Enter = select / apply, Esc = close
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.8 }}>Select a workflow on the left to see details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
