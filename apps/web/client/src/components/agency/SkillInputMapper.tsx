/**
 * SkillInputMapper — Per-field input mapping UI for skill_call nodes.
 *
 * For each field in a skill's input schema, allows selecting the source:
 *   - "static" — user enters a fixed value
 *   - "node_output" — selects a sibling node + output field
 *   - "context" — enters a context key name
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InputMapping {
  source: "static" | "node_output" | "context";
  value?: unknown;
  nodeId?: string;
  outputField?: string;
  contextKey?: string;
}

interface SkillInputMapperProps {
  /** Current input mappings from nodeConfig */
  inputMappings: Record<string, InputMapping>;
  /** List of sibling node IDs + names for node_output references */
  siblingNodes: Array<{ id: string; name: string }>;
  /** Callback when mappings change */
  onChange: (mappings: Record<string, InputMapping>) => void;
  /** Skill input schema fields (field name → type label) */
  fields: Array<{ name: string; type: string; description?: string }>;
}

export function SkillInputMapper({
  inputMappings,
  siblingNodes,
  onChange,
  fields,
}: SkillInputMapperProps) {
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const updateField = (fieldName: string, mapping: InputMapping) => {
    onChange({ ...inputMappings, [fieldName]: mapping });
  };

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No input fields defined for this skill.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">Input Mappings</Label>
      {fields.map((field) => {
        const mapping = inputMappings[field.name] ?? { source: "static", value: "" };
        const isExpanded = expandedField === field.name;

        return (
          <div key={field.name} className="border rounded-md p-2 space-y-1.5 bg-muted/30">
            <button
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => setExpandedField(isExpanded ? null : field.name)}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{field.name}</span>
                <span className="text-[10px] text-muted-foreground">({field.type})</span>
              </div>
              <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                {mapping.source}
              </span>
            </button>

            {isExpanded && (
              <div className="space-y-1.5 pt-1">
                {field.description && (
                  <p className="text-[10px] text-muted-foreground">{field.description}</p>
                )}

                <select
                  value={mapping.source}
                  onChange={(e) => updateField(field.name, { ...mapping, source: e.target.value as InputMapping["source"] })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="static">Static value</option>
                  <option value="node_output">Node output</option>
                  <option value="context">Context key</option>
                </select>

                {mapping.source === "static" && (
                  <Input
                    value={String(mapping.value ?? "")}
                    onChange={(e) => updateField(field.name, { ...mapping, value: e.target.value })}
                    placeholder="Enter value..."
                    className="text-xs h-7"
                  />
                )}

                {mapping.source === "node_output" && (
                  <div className="flex gap-1.5">
                    <select
                      value={mapping.nodeId ?? ""}
                      onChange={(e) => updateField(field.name, { ...mapping, nodeId: e.target.value })}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="">Select node...</option>
                      {siblingNodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                    <Input
                      value={mapping.outputField ?? ""}
                      onChange={(e) => updateField(field.name, { ...mapping, outputField: e.target.value })}
                      placeholder="Output field"
                      className="flex-1 text-xs h-7"
                    />
                  </div>
                )}

                {mapping.source === "context" && (
                  <Input
                    value={mapping.contextKey ?? ""}
                    onChange={(e) => updateField(field.name, { ...mapping, contextKey: e.target.value })}
                    placeholder="Context key name"
                    className="text-xs h-7"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
