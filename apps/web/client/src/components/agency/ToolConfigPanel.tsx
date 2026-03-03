import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "json" | "collection_select" | "skill_select" | "collection_multiselect";
  required?: boolean;
  readonly?: boolean;
  placeholder?: string;
  options?: (string | number)[];
  default?: string | number;
}

interface ConfigSchema {
  fields: ConfigField[];
}

interface ToolConfigPanelProps {
  toolId: string;
  toolName: string;
  configSchema: ConfigSchema;
  value: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ToolConfigPanel({ toolId, toolName, configSchema, value, onChange }: ToolConfigPanelProps) {
  const handleFieldChange = (key: string, fieldValue: unknown) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed border-slate-200 bg-slate-50/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {toolName} config
      </p>

      {configSchema.fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label className="text-xs text-slate-600">
            {field.label}
            {field.required && <span className="ml-0.5 text-red-400">*</span>}
          </Label>

          {field.type === "select" && field.options && (
            <Select
              value={String(value[field.key] ?? field.default ?? "")}
              onValueChange={(v) => handleFieldChange(field.key, isNaN(Number(v)) ? v : Number(v))}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={String(opt)} value={String(opt)} className="text-xs">
                    {String(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(field.type === "text" || field.type === "collection_select" || field.type === "skill_select") && (
            <Input
              className="h-7 text-xs"
              value={String(value[field.key] ?? "")}
              readOnly={field.readonly}
              placeholder={field.placeholder ?? field.label}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
            />
          )}

          {field.type === "json" && (
            <Textarea
              className="text-xs font-mono min-h-[60px] resize-y"
              value={
                typeof value[field.key] === "object"
                  ? JSON.stringify(value[field.key], null, 2)
                  : String(value[field.key] ?? "")
              }
              placeholder={field.placeholder ?? "{}"}
              onChange={(e) => {
                try {
                  handleFieldChange(field.key, JSON.parse(e.target.value));
                } catch {
                  handleFieldChange(field.key, e.target.value);
                }
              }}
            />
          )}

          {field.type === "collection_multiselect" && (
            <Input
              className="h-7 text-xs"
              value={
                Array.isArray(value[field.key])
                  ? (value[field.key] as string[]).join(", ")
                  : String(value[field.key] ?? "")
              }
              placeholder="collection-1, collection-2"
              onChange={(e) =>
                handleFieldChange(
                  field.key,
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
