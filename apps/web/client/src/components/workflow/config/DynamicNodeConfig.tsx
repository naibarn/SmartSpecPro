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

      {input.ui_type === "tags" && (
        <TagsInput
          value={value || []}
          onChange={onChange}
          placeholder={input.placeholder || "Type and press Enter..."}
        />
      )}

      {input.ui_type === "code_editor" && (
        <CodeEditor
          value={value || ""}
          language={String((input.validation as any)?.language || "javascript")}
          onChange={onChange}
          placeholder={input.placeholder}
        />
      )}

      {input.ui_type === "form_builder" && (
        <FormBuilder
          value={value || []}
          onChange={onChange}
        />
      )}

      {/* Fallback for unsupported ui_type */}
      {!["text", "textarea", "number", "select", "toggle", "slider", "json_editor", "tags", "code_editor", "form_builder"].includes(
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

/**
 * TagsInput - Input component for managing a list of tags/strings.
 */
interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagsInput({ value, onChange, placeholder }: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      if (!value.includes(inputValue.trim())) {
        onChange([...value, inputValue.trim()]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 min-h-[42px]">
      {value.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="hover:text-blue-600 focus:outline-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] outline-none bg-transparent"
      />
    </div>
  );
}

/**
 * CodeEditor - Monaco-based code editor component.
 * Falls back to textarea if Monaco is not available.
 */
interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (code: string) => void;
  placeholder?: string;
}

function CodeEditor({ value, language, onChange, placeholder }: CodeEditorProps) {
  // Simple textarea fallback for now
  // TODO: Integrate @monaco-editor/react for full IDE experience
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Enter ${language} code...`}
        rows={12}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        style={{ fontFamily: "monospace", fontSize: "13px", lineHeight: "1.5" }}
      />
      <div className="absolute top-2 right-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
        {language}
      </div>
    </div>
  );
}

/**
 * FormBuilder - Drag-and-drop form builder for creating dynamic forms.
 */
interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "number" | "textarea" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select fields
}

interface FormBuilderProps {
  value: FormField[];
  onChange: (fields: FormField[]) => void;
}

function FormBuilder({ value, onChange }: FormBuilderProps) {
  const [editingField, setEditingField] = React.useState<FormField | null>(null);

  const addField = (type: FormField["type"]) => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      label: `New ${type} field`,
      type,
      required: false,
    };
    onChange([...value, newField]);
    setEditingField(newField);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    onChange(value.map(field => field.id === id ? { ...field, ...updates } : field));
    if (editingField?.id === id) {
      setEditingField({ ...editingField, ...updates });
    }
  };

  const removeField = (id: string) => {
    onChange(value.filter(field => field.id !== id));
    if (editingField?.id === id) {
      setEditingField(null);
    }
  };

  const moveField = (id: string, direction: "up" | "down") => {
    const index = value.findIndex(f => f.id === id);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= value.length) return;

    const newFields = [...value];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    onChange(newFields);
  };

  return (
    <div className="space-y-4 border border-gray-300 rounded-md p-4">
      {/* Field List */}
      <div className="space-y-2">
        {value.length === 0 && (
          <p className="text-sm text-gray-500 italic text-center py-4">
            No fields yet. Add a field below to get started.
          </p>
        )}
        {value.map((field, index) => (
          <div
            key={field.id}
            className="border border-gray-200 rounded p-3 bg-white hover:border-blue-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </div>
                <div className="text-xs text-gray-500">
                  Type: {field.type}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveField(field.id, "up")}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveField(field.id, "down")}
                  disabled={index === value.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingField(field)}
                  className="p-1 text-blue-600 hover:text-blue-700"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="p-1 text-red-600 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Field Buttons */}
      <div className="border-t pt-4">
        <p className="text-xs text-gray-600 mb-2">Add Field:</p>
        <div className="flex flex-wrap gap-2">
          {(["text", "email", "number", "textarea", "select", "checkbox"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
            >
              + {type}
            </button>
          ))}
        </div>
      </div>

      {/* Edit Field Modal */}
      {editingField && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="font-bold text-lg">Edit Field</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <input
                type="text"
                value={editingField.label}
                onChange={(e) => updateField(editingField.id, { label: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Placeholder</label>
              <input
                type="text"
                value={editingField.placeholder || ""}
                onChange={(e) => updateField(editingField.id, { placeholder: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {editingField.type === "select" && (
              <div>
                <label className="block text-sm font-medium mb-1">Options (comma-separated)</label>
                <input
                  type="text"
                  value={editingField.options?.join(", ") || ""}
                  onChange={(e) => updateField(editingField.id, { options: e.target.value.split(",").map(s => s.trim()) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingField.required}
                onChange={(e) => updateField(editingField.id, { required: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-sm">Required field</label>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
