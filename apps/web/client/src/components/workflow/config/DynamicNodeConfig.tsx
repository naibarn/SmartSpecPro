/**
 * DynamicNodeConfig - Dynamic configuration panel for workflow nodes.
 *
 * Renders form controls based on node type definitions from the registry.
 * Supports various UI types: text, textarea, number, slider, select, toggle, json_editor.
 */

import React, { useCallback } from "react";
import { useNodeRegistry, type InputSpec } from "@/lib/workflow/useNodeRegistry";

export interface DynamicNodeConfigProps {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  connections: Record<string, boolean>; // inputName → isConnected
  onConfigChange: (config: Record<string, any>) => void;
}

export function DynamicNodeConfig({
  nodeId,
  nodeType,
  config,
  connections,
  onConfigChange,
}: DynamicNodeConfigProps) {
  const { getNodeType } = useNodeRegistry();
  const nodeDef = getNodeType(nodeType);

  const handleChange = useCallback(
    (inputName: string, value: any) => {
      onConfigChange({
        ...config,
        [inputName]: value,
      });
    },
    [config, onConfigChange]
  );

  if (!nodeDef) {
    return (
      <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded">
        <p className="font-semibold">Node type not found: {nodeType}</p>
        <p className="text-sm mt-1">
          This node type may have been removed from the registry.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="border-b pb-2">
        <h3 className="font-bold text-lg">{nodeDef.display_name}</h3>
        <p className="text-sm text-gray-600">{nodeDef.description}</p>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {nodeDef.inputs.map((input) => (
          <FormField
            key={input.name}
            input={input}
            value={config[input.name]}
            isConnected={connections[input.name] ?? false}
            onChange={(value) => handleChange(input.name, value)}
          />
        ))}
      </div>

      {/* Empty State */}
      {nodeDef.inputs.length === 0 && (
        <div className="text-sm text-gray-500 italic">
          This node has no configurable inputs.
        </div>
      )}
    </div>
  );
}

/**
 * FormField - Wrapper component that renders the appropriate input control
 * based on the InputSpec's ui_type.
 */
interface FormFieldProps {
  input: InputSpec;
  value: any;
  isConnected: boolean;
  onChange: (value: any) => void;
}

function FormField({ input, value, isConnected, onChange }: FormFieldProps) {
  // If input is connected via edge, show connection indicator instead of form control
  if (isConnected && input.accepts_connection) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {input.display_name}
          {input.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className="p-3 bg-blue-50 border border-blue-300 rounded flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm text-blue-700">Connected from upstream node</span>
        </div>
        {input.placeholder && (
          <p className="text-xs text-gray-500">{input.placeholder}</p>
        )}
      </div>
    );
  }

  // Render appropriate control based on ui_type
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {input.display_name}
        {input.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {input.ui_type === "text" && (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {input.ui_type === "textarea" && (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {input.ui_type === "number" && (
        <input
          type="number"
          value={value ?? ""}
          min={input.validation?.min != null ? Number(input.validation.min) : undefined}
          max={input.validation?.max != null ? Number(input.validation.max) : undefined}
          step={input.validation?.step != null ? Number(input.validation.step) : undefined}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            onChange(Number.isNaN(parsed) ? undefined : parsed);
          }}
          placeholder={input.placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {input.ui_type === "select" && (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select --</option>
          {input.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {input.ui_type === "toggle" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            {value ? "Enabled" : "Disabled"}
          </span>
        </label>
      )}

      {input.ui_type === "slider" && (
        <div className="space-y-2">
          <input
            type="range"
            min={Number(input.validation?.min) || 0}
            max={Number(input.validation?.max) || 100}
            step={Number(input.validation?.step) || 1}
            value={value ?? (input.default || 0)}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (!Number.isNaN(parsed)) onChange(parsed);
            }}
            className="w-full"
          />
          <div className="text-sm text-gray-600 text-center">
            Value: {value ?? (input.default || 0)}
          </div>
        </div>
      )}

      {input.ui_type === "json_editor" && (
        <textarea
          value={typeof value === "object" ? JSON.stringify(value, null, 2) : value || ""}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(parsed);
            } catch {
              // Keep raw string if invalid JSON
              onChange(e.target.value);
            }
          }}
          placeholder={input.placeholder || "Enter JSON..."}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      )}

      {/* Fallback for unsupported ui_type */}
      {!["text", "textarea", "number", "select", "toggle", "slider", "json_editor"].includes(
        input.ui_type
      ) && (
        <div className="p-3 bg-gray-50 border border-gray-300 rounded">
          <p className="text-sm text-gray-600">
            Unsupported ui_type: <code className="bg-gray-200 px-1 rounded">{input.ui_type}</code>
          </p>
        </div>
      )}

      {/* Help text */}
      {input.placeholder && input.ui_type !== "text" && input.ui_type !== "textarea" && (
        <p className="text-xs text-gray-500">{input.placeholder}</p>
      )}

      {/* Data type indicator */}
      <p className="text-xs text-gray-400">
        Type: <code>{input.data_type}</code>
      </p>
    </div>
  );
}
