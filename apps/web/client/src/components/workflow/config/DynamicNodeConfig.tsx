/**
 * DynamicNodeConfig - Dynamic configuration panel for workflow nodes.
 *
 * Renders form controls based on node type definitions from the registry.
 * Supports various UI types: text, textarea, number, slider, select, toggle, json_editor.
 */

import React, { useCallback, useState } from "react";
import { useNodeRegistry, type InputSpec } from "@/lib/workflow/useNodeRegistry";
import LLMModelSelector, { type LLMModel } from "@/components/workflow/LLMModelSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Search, Check } from "lucide-react";

export interface DynamicNodeConfigProps {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  connections: Record<string, boolean>; // inputName → isConnected
  onConfigChange: (config: Record<string, any>) => void;
  /** Available LLM models — enables searchable model picker for "model" fields */
  llmModels?: LLMModel[];
  llmModelsLoading?: boolean;
  /** Workflow-level default model ID (shown as placeholder when no node-level model is set) */
  defaultModelId?: string;
}

export function DynamicNodeConfig({
  nodeId,
  nodeType,
  config,
  connections,
  onConfigChange,
  llmModels,
  llmModelsLoading,
  defaultModelId,
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
        {nodeDef.inputs.map((input) => {
          // For skill nodes: hide input_data when a skill is selected
          // (DynamicSkillInputs below will render schema-based fields or fallback)
          if (
            input.name === "input_data" &&
            nodeType === "skill" &&
            config.skill_id
          ) {
            return null;
          }

          return (
            <FormField
              key={input.name}
              input={input}
              value={config[input.name]}
              isConnected={connections[input.name] ?? false}
              onChange={(value) => handleChange(input.name, value)}
              llmModels={llmModels}
              llmModelsLoading={llmModelsLoading}
              defaultModelId={defaultModelId}
              nodeType={nodeType}
              config={config}
            />
          );
        })}

        {/* Dynamic skill inputs (renders schema-based fields when a skill is selected) */}
        {nodeType === "skill" && config.skill_id && (
          <DynamicSkillInputs
            skillId={config.skill_id}
            config={config}
            onConfigChange={handleChange}
          />
        )}

        {/* Dynamic media model inputs (for generate_image and similar media nodes) */}
        {(() => {
          const modelInput = nodeDef.inputs.find(
            (inp) =>
              inp.name === "model" &&
              inp.options_endpoint?.includes("media-models")
          );
          if (modelInput && config.model) {
            return (
              <DynamicMediaInputs
                modelValue={config.model}
                endpoint={modelInput.options_endpoint!}
                config={config}
                onConfigChange={handleChange}
              />
            );
          }
          return null;
        })()}
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
  llmModels?: LLMModel[];
  llmModelsLoading?: boolean;
  defaultModelId?: string;
  nodeType?: string;
  config?: Record<string, any>;
}

function FormField({ input, value, isConnected, onChange, llmModels, llmModelsLoading, defaultModelId, nodeType, config }: FormFieldProps) {
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

  // LLM model fields: use searchable model selector when models data is available
  // Skip if input has options_endpoint (e.g. media AI models use DynamicSelect instead)
  const isModelField = input.name === "model" && llmModels && llmModels.length > 0 && !input.options_endpoint;

  // Build default model placeholder text
  const defaultModelName = defaultModelId
    ? llmModels?.find((m) => m.modelId === defaultModelId)?.modelName ?? defaultModelId
    : undefined;
  const modelPlaceholder = defaultModelName
    ? `Use workflow default (${defaultModelName})`
    : "Use workflow default";

  if (isModelField) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {input.display_name}
          {input.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <LLMModelSelector
          models={llmModels!}
          selectedModelId={value || undefined}
          onSelect={(modelId) => onChange(modelId || undefined)}
          isLoading={llmModelsLoading}
          placeholder={modelPlaceholder}
        />
        {value ? (
          <p className="text-xs text-blue-600">
            This node uses a custom model, overriding the workflow default.
          </p>
        ) : (
          <p className="text-xs text-gray-400">
            No override — will use the workflow&apos;s default model.
          </p>
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

      {input.ui_type === "select" && input.name === "skill_id" ? (
        // Skill selector with search for workflow node
        <SkillSelector
          value={value || ""}
          onChange={onChange}
          placeholder={input.placeholder || "Search and select a skill..."}
        />
      ) : input.ui_type === "select" && input.options_endpoint ? (
        // Dynamic select with options from API endpoint
        <DynamicSelect
          value={value || ""}
          onChange={onChange}
          endpoint={input.options_endpoint}
          placeholder={input.placeholder || "-- Select --"}
        />
      ) : input.ui_type === "select" && input.depends_on && input.option_groups ? (
        // Dependent select — options come from option_groups[parentValue]
        (() => {
          const parentValue = config?.[input.depends_on!] || "";
          const groupOptions = parentValue ? (input.option_groups![parentValue] || []) : [];
          return (
            <select
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!parentValue}
            >
              {!parentValue ? (
                <option value="">Select {input.depends_on} first</option>
              ) : (
                <>
                  <option value="">-- Select --</option>
                  {groupOptions.map((option: { value: string; label: string }) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          );
        })()
      ) : (
        input.ui_type === "select" && (
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
        )
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

      {input.ui_type === "multiselect" && (
        <MultiSelectApprovers
          value={value || []}
          onChange={onChange}
          placeholder={input.placeholder}
        />
      )}

      {/* Fallback for unsupported ui_type */}
      {!["text", "textarea", "number", "select", "toggle", "slider", "json_editor", "tags", "code_editor", "form_builder", "multiselect"].includes(
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

      {/* Field-specific help notes */}
      {input.name === "max_tokens" && (
        <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
          💡 <strong>Max Tokens:</strong> Limits the maximum number of tokens the AI will generate in its response. 
          (1 token ≈ 4 English characters or 1-2 non-Latin characters). 
          Default 2000 tokens is suitable for short to medium responses.
        </p>
      )}
      {input.name === "context_data" && (
        <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
          💡 <strong>Context Data:</strong> Additional data to be sent to the AI along with the prompt, 
          such as outputs from previous nodes or data you want the AI to analyze as additional context.
        </p>
      )}
      {input.name === "prompt" && nodeType === "llm_call" && (
        <p className="text-xs text-green-600 bg-green-50 p-2 rounded">
          ✏️ <strong>Prompt:</strong> The instruction or question you want to send to the AI for processing. 
          Write clearly and specifically to get results that match your requirements.
        </p>
      )}
      {input.name === "temperature" && (
        <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded">
          🌡️ <strong>Temperature:</strong> Controls the AI's creativity level (0.0 - 2.0)
          <br/>• 0.0-0.3: Focused and reliable responses (best for analysis)
          <br/>• 0.7-1.0: Balanced between accuracy and creativity
          <br/>• 1.5-2.0: High imagination, very creative (best for storytelling)
        </p>
      )}
      {input.name === "skill_id" && (
        <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
          🛠️ <strong>Skill:</strong> Select a skill from the list of skills you have permission to use. 
          Skills help improve the quality of results based on specialized expertise.
        </p>
      )}

      {/* Data type indicator */}
      <p className="text-xs text-gray-400">
        Type: <code>{input.data_type}</code>
      </p>
    </div>
  );
}

/**
 * SkillSelector - Searchable dropdown for selecting user-visible skills.
 */
interface SkillSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SkillSelector({ value, onChange, placeholder }: SkillSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Fetch skills from API
  const { data, isLoading } = (trpc as any).skills.listForWorkflow.useQuery(
    { search: searchQuery || undefined, limit: 50 },
    { enabled: true }
  );

  const skills = data?.skills || [];
  const selectedSkill = skills.find((s: any) => s.slug === value);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Selected value display / Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex items-center justify-between bg-white"
      >
        <span className={selectedSkill ? "text-gray-900" : "text-gray-400"}>
          {selectedSkill ? `${selectedSkill.icon || "🛠️"} ${selectedSkill.name}` : placeholder || "Select a skill..."}
        </span>
        <span className="text-gray-400">▼</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Skills list */}
          <div className="overflow-y-auto max-h-60">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading skills...</span>
              </div>
            ) : skills.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {searchQuery ? "No skills found matching your search" : "No skills available"}
              </div>
            ) : (
              <div className="py-1">
                {skills.map((skill: any) => (
                  <button
                    key={skill.slug}
                    type="button"
                    onClick={() => {
                      onChange(skill.slug);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-100 ${
                      value === skill.slug ? "bg-blue-50 border-l-2 border-blue-500" : ""
                    }`}
                  >
                    <span className="text-lg">{skill.icon || "🛠️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {skill.name}
                        {value === skill.slug && <Check className="inline w-4 h-4 ml-1 text-blue-500" />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{skill.description}</div>
                    </div>
                    <span className="text-xs text-gray-400">×{skill.creditMultiplier || 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
            Showing {skills.length} of {data?.total || 0} skills
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DynamicSelect - Select dropdown with options fetched from an API endpoint.
 */
interface DynamicSelectProps {
  value: string;
  onChange: (value: string) => void;
  endpoint: string;
  placeholder?: string;
}

function DynamicSelect({ value, onChange, endpoint, placeholder }: DynamicSelectProps) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchOptions = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Failed to fetch options");
        const data = await response.json();
        
        // Handle different response formats safely
        let fetchedOptions: Array<{ value: string; label: string }> = [];
        let rawItems: any[] | null = null;

        if (Array.isArray(data)) {
          rawItems = data;
        } else if (typeof data === "object" && data !== null) {
          // Find the first array value in the response object
          // Handles: { options: [] }, { providers: [] }, { models: [] },
          //          { collections: [] }, { approvers: [] }, { skills: [] }, { data: [] }
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
              rawItems = data[key];
              break;
            }
          }
        }

        if (rawItems) {
          fetchedOptions = rawItems.map((item: any) => ({
            value: String(item.value ?? item.slug ?? item.id ?? ""),
            label: String(item.label ?? item.name ?? item.value ?? item.id ?? ""),
          }));
        }
        
        setOptions(fetchedOptions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptions();
  }, [endpoint]);

  if (isLoading) {
    return (
      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading options...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-3 py-2 border border-red-300 rounded-md bg-red-50 text-sm text-red-600">
        Error loading options: {error}
      </div>
    );
  }

  // Ensure options is always an array
  const safeOptions = Array.isArray(options) ? options : [];

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">{placeholder || "-- Select --"}</option>
      {safeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * DynamicSkillInputs - Renders dynamic input fields based on a skill's input schema.
 * When a skill is selected, fetches its schema via tRPC and renders form fields.
 * Falls back to a JSON editor if no schema is available.
 */
interface DynamicSkillInputsProps {
  skillId: string;
  config: Record<string, any>;
  onConfigChange: (key: string, value: any) => void;
}

function DynamicSkillInputs({
  skillId,
  config,
  onConfigChange,
}: DynamicSkillInputsProps) {
  const prevSkillIdRef = React.useRef<string | null>(null);

  // Fetch skill input schema via tRPC
  const { data: schemaData, isLoading } = (trpc as any).skills.getInputSchema.useQuery(
    { skillId },
    { enabled: !!skillId, staleTime: 5 * 60 * 1000 }
  );

  // When skill changes, clear old skill-specific config values
  React.useEffect(() => {
    if (prevSkillIdRef.current && prevSkillIdRef.current !== skillId) {
      // Clear previous schema field values from config
      // We store schema field values under config.skillInputs to avoid conflicts
      onConfigChange("skillInputs", {});
    }
    prevSkillIdRef.current = skillId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded border border-gray-200">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading skill inputs...</span>
      </div>
    );
  }

  const hasSchema = schemaData?.hasSchema;
  const schema = schemaData?.schema as {
    sections?: Array<{
      id: string;
      title: string;
      titleTh?: string;
      collapsed?: boolean;
      fields: Array<{
        id: string;
        type: string;
        label: string;
        labelTh?: string;
        placeholder?: string;
        placeholderTh?: string;
        helpText?: string;
        helpTextTh?: string;
        required?: boolean;
        default?: any;
        rows?: number;
        options?: Array<{ value: string; label: string; labelTh?: string }>;
        optionGroups?: Record<string, Array<{ value: string; label: string }>>;
        dependsOn?: { field: string; value?: string; notEmpty?: boolean };
      }>;
    }>;
  } | null;

  // No schema — show JSON editor fallback
  if (!hasSchema || !schema?.sections) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Input Data
        </label>
        <textarea
          value={
            typeof config.input_data === "object"
              ? JSON.stringify(config.input_data, null, 2)
              : config.input_data || ""
          }
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onConfigChange("input_data", parsed);
            } catch {
              onConfigChange("input_data", e.target.value);
            }
          }}
          placeholder="Enter skill input data as JSON..."
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        <p className="text-xs text-gray-400">
          Type: <code>json</code> — This skill has no input schema defined.
        </p>
      </div>
    );
  }

  // Get stored skill input values
  const skillInputs: Record<string, any> = config.skillInputs || {};

  const handleFieldChange = (fieldId: string, value: any) => {
    onConfigChange("skillInputs", { ...skillInputs, [fieldId]: value });
  };

  return (
    <div className="space-y-4">
      {schema.sections.map((section) => {
        // Filter out fields hidden by dependsOn conditions
        const visibleFields = section.fields.filter((field) => {
          if (!field.dependsOn) return true;
          const depValue = skillInputs[field.dependsOn.field];
          if (field.dependsOn.notEmpty) return !!depValue;
          if (field.dependsOn.value !== undefined) return depValue === field.dependsOn.value;
          return true;
        });

        if (visibleFields.length === 0) return null;

        return (
          <div key={section.id} className="space-y-3 pl-2 border-l-2 border-green-200">
            <div className="text-sm font-semibold text-green-700">
              {section.title}
            </div>

            {visibleFields.map((field) => {
              const fieldValue = skillInputs[field.id] ?? field.default ?? "";

              // Resolve options for dependent selects
              let fieldOptions = field.options;
              if (field.optionGroups) {
                const depField = field.dependsOn?.field;
                const parentValue = depField ? skillInputs[depField] : "";
                fieldOptions = parentValue
                  ? field.optionGroups[parentValue] || []
                  : [];
              }

              return (
                <div key={field.id} className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>

                  {field.type === "textarea" && (
                    <textarea
                      value={fieldValue}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      rows={field.rows || 3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      value={fieldValue}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        handleFieldChange(field.id, Number.isNaN(parsed) ? undefined : parsed);
                      }}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {field.type === "select" && fieldOptions && (
                    <select
                      value={fieldValue}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select --</option>
                      {fieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "boolean" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!fieldValue}
                        onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">
                        {fieldValue ? "Enabled" : "Disabled"}
                      </span>
                    </label>
                  )}

                  {field.type === "imageUpload" && (
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder || "Enter image URL(s), comma-separated"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {field.helpText && (
                    <p className="text-xs text-gray-500">{field.helpText}</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * DynamicMediaInputs - Renders dynamic input fields based on a media model's configJson.
 * Used by generate_image nodes to show model-specific fields (aspect ratio, resolution, etc.)
 */
interface DynamicMediaInputsProps {
  modelValue: string; // Currently selected model ID
  endpoint: string; // API endpoint to fetch models with configJson
  config: Record<string, any>; // Full node config
  onConfigChange: (key: string, value: any) => void;
}

function DynamicMediaInputs({
  modelValue,
  endpoint,
  config,
  onConfigChange,
}: DynamicMediaInputsProps) {
  const [models, setModels] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const creditCostSyncedRef = React.useRef<number | null>(null);

  // Fetch models with configJson
  React.useEffect(() => {
    const fetchModels = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(endpoint);
        if (!response.ok) return;
        const data = await response.json();
        // Find the first array in response
        let rawModels: any[] = [];
        if (Array.isArray(data)) {
          rawModels = data;
        } else if (data && typeof data === "object") {
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
              rawModels = data[key];
              break;
            }
          }
        }
        setModels(rawModels);
      } catch {
        // Silently fail — the model select itself will show the error
      } finally {
        setIsLoading(false);
      }
    };
    fetchModels();
  }, [endpoint]);

  // Find selected model (computed, no early return before hooks)
  const selectedModel = (!isLoading && modelValue)
    ? models.find((m: any) => m.id === modelValue || m.modelId === modelValue)
    : null;

  const configJson = selectedModel?.configJson as any;
  const inputFields = configJson?.inputFields as
    | Array<{
        key: string;
        label: string;
        type: string;
        options?: Array<{ value: string; label: string }>;
        default?: any;
        required?: boolean;
        affectsPricing?: boolean;
      }>
    | undefined;

  // Filter out file upload types — these are handled as node input ports instead
  const renderableFields = (inputFields || []).filter(
    (f) => !["image_urls", "video_urls", "audio_urls"].includes(f.type)
  );

  // Credit cost — store in config so CostEstimation can read it
  const creditCost = selectedModel?.creditCost || 0;
  React.useEffect(() => {
    if (creditCost > 0 && creditCostSyncedRef.current !== creditCost) {
      creditCostSyncedRef.current = creditCost;
      onConfigChange("modelCreditCost", creditCost);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditCost]);

  if (!selectedModel || (renderableFields.length === 0 && !creditCost)) return null;

  return (
    <div className="space-y-3 pl-2 border-l-2 border-pink-200">
      {/* Credit cost indicator */}
      <div className="flex items-center gap-2 text-xs text-pink-600 bg-pink-50 px-2 py-1.5 rounded">
        <span className="font-medium">Credit Cost:</span>
        <span>{creditCost} credits per {endpoint.includes("type=video") ? "video" : endpoint.includes("type=audio") ? "audio" : "image"}</span>
      </div>

      {/* Dynamic input fields from configJson */}
      {renderableFields.map((field) => {
        const fieldValue = config[field.key] ?? field.default ?? "";

        return (
          <div key={field.key} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && (
                <span className="text-red-500 ml-1">*</span>
              )}
              {field.affectsPricing && (
                <span className="ml-1 text-xs text-amber-600">
                  (affects cost)
                </span>
              )}
            </label>

            {field.type === "select" && field.options && (
              <select
                value={fieldValue}
                onChange={(e) => onConfigChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select --</option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {field.type === "text" && (
              <input
                type="text"
                value={fieldValue}
                onChange={(e) => onConfigChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                value={fieldValue}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  onConfigChange(
                    field.key,
                    Number.isNaN(parsed) ? undefined : parsed
                  );
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {field.type === "boolean" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!fieldValue}
                  onChange={(e) =>
                    onConfigChange(field.key, e.target.checked)
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  {fieldValue ? "Enabled" : "Disabled"}
                </span>
              </label>
            )}
          </div>
        );
      })}
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
 * MultiSelectApprovers - Searchable multi-select for picking users and groups.
 * Used by approval_gate node to select approvers from the tenant's user/group list.
 */
interface ApproverItem {
  type: "user" | "group";
  id: number;
  label: string;
}

interface MultiSelectApproversProps {
  value: ApproverItem[];
  onChange: (items: ApproverItem[]) => void;
  placeholder?: string;
}

function MultiSelectApprovers({ value, onChange, placeholder }: MultiSelectApproversProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const items: ApproverItem[] = Array.isArray(value) ? value : [];

  // Debounce search input
  React.useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimerRef.current);
  }, [searchQuery]);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch users via tRPC — use space fallback to load all tenant users when no search query
  const userSearchQuery = debouncedQuery || " ";
  const { data: users, isLoading: isSearchingUsers } =
    (trpc as any).groups.searchTenantUsers.useQuery(
      { query: userSearchQuery, limit: 20 },
      { enabled: isOpen && activeTab === "users" }
    );

  // Fetch groups via tRPC (load all)
  const { data: groups, isLoading: isLoadingGroups } =
    (trpc as any).groups.list.useQuery(
      { scope: "all" },
      { enabled: isOpen && activeTab === "groups" }
    );

  const selectedIds = new Set(items.map((i) => `${i.type}:${i.id}`));

  const toggleItem = (item: ApproverItem) => {
    const key = `${item.type}:${item.id}`;
    if (selectedIds.has(key)) {
      onChange(items.filter((i) => `${i.type}:${i.id}` !== key));
    } else {
      onChange([...items, item]);
    }
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  // Filter groups by local search query
  const filteredGroups = React.useMemo(() => {
    if (!groups) return [];
    const groupList = Array.isArray(groups) ? groups : [];
    if (!searchQuery) return groupList;
    const q = searchQuery.toLowerCase();
    return groupList.filter(
      (g: any) =>
        (g.name || "").toLowerCase().includes(q) ||
        (g.description || "").toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button — shows selected chips or placeholder */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-left bg-white min-h-[42px]"
      >
        {items.length === 0 ? (
          <span className="text-gray-400 text-sm">{placeholder || "Select approvers..."}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, index) => (
              <span
                key={`${item.type}:${item.id}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                  item.type === "user"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {item.type === "user" ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                )}
                {item.label}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); removeItem(index); }
                  }}
                  className="hover:opacity-70 focus:outline-none ml-0.5 cursor-pointer"
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-hidden">
          {/* Tabs: Users | Groups */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                activeTab === "users"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Users
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("groups")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                activeTab === "groups"
                  ? "text-green-600 border-b-2 border-green-600 bg-green-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Groups
            </button>
          </div>

          {/* Search input inside dropdown */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === "users" ? "Search by name or email..." : "Search groups..."}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Users tab */}
          {activeTab === "users" && (
            <div className="overflow-y-auto max-h-56">
              {isSearchingUsers && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading users...</span>
                </div>
              )}
              {!isSearchingUsers && (!users || users.length === 0) && (
                <p className="p-4 text-center text-sm text-gray-500">
                  {debouncedQuery ? "No users found" : "No users in this tenant"}
                </p>
              )}
              {users?.map((user: any) => {
                const isSelected = selectedIds.has(`user:${user.id}`);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() =>
                      toggleItem({
                        type: "user",
                        id: user.id,
                        label: user.name || user.email || `User #${user.id}`,
                      })
                    }
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                      isSelected
                        ? "bg-blue-50 text-blue-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {user.name || "Unnamed"}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {user.email}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Groups tab */}
          {activeTab === "groups" && (
            <div className="overflow-y-auto max-h-56">
              {isLoadingGroups && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading groups...</span>
                </div>
              )}
              {!isLoadingGroups && filteredGroups.length === 0 && (
                <p className="p-4 text-center text-sm text-gray-500">
                  {searchQuery ? "No groups found" : "No groups available"}
                </p>
              )}
              {filteredGroups.map((group: any) => {
                const isSelected = selectedIds.has(`group:${group.id}`);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() =>
                      toggleItem({
                        type: "group",
                        id: group.id,
                        label: group.name,
                      })
                    }
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                      isSelected
                        ? "bg-green-50 text-green-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{group.name}</div>
                      {group.description && (
                        <div className="text-xs text-gray-500 truncate">
                          {group.description}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer with count */}
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
            {items.length} approver{items.length !== 1 ? "s" : ""} selected
          </div>
        </div>
      )}
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
