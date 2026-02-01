import { useState, useEffect } from "react";

interface ConfigField {
  key: string;
  value: string;
  type: "string" | "number" | "boolean" | "json";
}

interface ConfigEditorProps {
  initialConfig: Record<string, any>;
  onSave: (config: Record<string, any>) => void;
  onCancel: () => void;
}

export function ConfigEditor({ initialConfig, onSave, onCancel }: ConfigEditorProps) {
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    // Convert config object to fields
    const configFields: ConfigField[] = Object.entries(initialConfig).map(
      ([key, value]) => ({
        key,
        value: String(value),
        type: inferType(value),
      })
    );
    setFields(configFields);
    setJsonText(JSON.stringify(initialConfig, null, 2));
  }, [initialConfig]);

  const inferType = (value: any): ConfigField["type"] => {
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return "number";
    if (typeof value === "object") return "json";
    return "string";
  };

  const handleFieldChange = (index: number, field: Partial<ConfigField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...field };
    setFields(newFields);
  };

  const handleAddField = () => {
    setFields([...fields, { key: "", value: "", type: "string" }]);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (jsonMode) {
      try {
        const config = JSON.parse(jsonText);
        onSave(config);
      } catch (err) {
        setJsonError("Invalid JSON");
      }
    } else {
      const config: Record<string, any> = {};
      for (const field of fields) {
        if (!field.key.trim()) continue;

        let value: any = field.value;
        if (field.type === "number") {
          value = Number(field.value);
        } else if (field.type === "boolean") {
          value = field.value === "true";
        } else if (field.type === "json") {
          try {
            value = JSON.parse(field.value);
          } catch {
            value = field.value;
          }
        }
        config[field.key] = value;
      }
      onSave(config);
    }
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    setJsonError(null);
    try {
      JSON.parse(text);
    } catch (err) {
      setJsonError((err as Error).message);
    }
  };

  const switchToJson = () => {
    const config: Record<string, any> = {};
    for (const field of fields) {
      if (!field.key.trim()) continue;
      let value: any = field.value;
      if (field.type === "number") value = Number(field.value);
      else if (field.type === "boolean") value = field.value === "true";
      else if (field.type === "json") {
        try {
          value = JSON.parse(field.value);
        } catch {
          value = field.value;
        }
      }
      config[field.key] = value;
    }
    setJsonText(JSON.stringify(config, null, 2));
    setJsonMode(true);
  };

  const switchToForm = () => {
    try {
      const config = JSON.parse(jsonText);
      const configFields: ConfigField[] = Object.entries(config).map(
        ([key, value]) => ({
          key,
          value: String(value),
          type: inferType(value),
        })
      );
      setFields(configFields);
      setJsonMode(false);
      setJsonError(null);
    } catch (err) {
      setJsonError("Fix JSON errors before switching to form mode");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Configuration Editor
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={jsonMode ? switchToForm : switchToJson}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            disabled={jsonMode && !!jsonError}
          >
            {jsonMode ? "📝 Form Mode" : "{ } JSON Mode"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto mb-4">
        {jsonMode ? (
          <div className="space-y-2">
            <textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              className={`w-full h-96 px-3 py-2 font-mono text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                jsonError
                  ? "border-red-300 focus:ring-red-500"
                  : "border-gray-300 focus:ring-blue-500"
              }`}
              spellCheck={false}
            />
            {jsonError && (
              <div className="text-sm text-red-600">
                <strong>Error:</strong> {jsonError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={index}
                className="flex items-start space-x-2 p-3 bg-gray-50 rounded-lg"
              >
                {/* Key */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Key
                  </label>
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) =>
                      handleFieldChange(index, { key: e.target.value })
                    }
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="config_key"
                  />
                </div>

                {/* Type */}
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      handleFieldChange(index, {
                        type: e.target.value as ConfigField["type"],
                      })
                    }
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="json">JSON</option>
                  </select>
                </div>

                {/* Value */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Value
                  </label>
                  {field.type === "boolean" ? (
                    <select
                      value={field.value}
                      onChange={(e) =>
                        handleFieldChange(index, { value: e.target.value })
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={field.value}
                      onChange={(e) =>
                        handleFieldChange(index, { value: e.target.value })
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={
                        field.type === "json" ? '{"key": "value"}' : "value"
                      }
                    />
                  )}
                </div>

                {/* Remove */}
                <div className="pt-6">
                  <button
                    onClick={() => handleRemoveField(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove field"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {/* Add Field Button */}
            <button
              onClick={handleAddField}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              + Add Field
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-2 pt-4 border-t">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={jsonMode && !!jsonError}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
}
