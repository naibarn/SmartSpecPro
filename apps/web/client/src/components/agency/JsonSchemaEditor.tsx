import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Code, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchemaProperty {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface JsonSchemaEditorProps {
  value: Record<string, unknown> | null;
  onChange: (schema: Record<string, unknown>) => void;
  maxProperties?: number;
  label?: string;
  className?: string;
}

const PROPERTY_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
];

function schemaToProperties(
  schema: Record<string, unknown> | null,
): SchemaProperty[] {
  if (!schema || typeof schema !== "object") return [];
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (schema.required ?? []) as string[];

  return Object.entries(properties).map(([name, def]) => ({
    name,
    type: (def.type as string) ?? "string",
    description: (def.description as string) ?? "",
    required: required.includes(name),
  }));
}

function propertiesToSchema(
  props: SchemaProperty[],
): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const p of props) {
    const def: Record<string, unknown> = { type: p.type };
    if (p.description) def.description = p.description;
    properties[p.name] = def;
    if (p.required) required.push(p.name);
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function JsonSchemaEditor({
  value,
  onChange,
  maxProperties = 20,
  label = "Input Schema",
  className,
}: JsonSchemaEditorProps) {
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [properties, setProperties] = useState<SchemaProperty[]>(() =>
    schemaToProperties(value),
  );

  // Sync internal state when value prop changes (e.g., switching between schemas)
  useEffect(() => {
    setProperties(schemaToProperties(value));
  }, [value]);

  const emitChange = useCallback(
    (props: SchemaProperty[]) => {
      setProperties(props);
      onChange(propertiesToSchema(props));
    },
    [onChange],
  );

  const addProperty = () => {
    if (properties.length >= maxProperties) return;
    emitChange([
      ...properties,
      { name: "", type: "string", description: "", required: false },
    ]);
  };

  const removeProperty = (index: number) => {
    emitChange(properties.filter((_, i) => i !== index));
  };

  const updateProperty = (
    index: number,
    updates: Partial<SchemaProperty>,
  ) => {
    emitChange(
      properties.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    );
  };

  const switchToRaw = () => {
    setRawText(JSON.stringify(propertiesToSchema(properties), null, 2));
    setRawError(null);
    setMode("raw");
  };

  const switchToVisual = () => {
    if (rawText.trim()) {
      try {
        const parsed = JSON.parse(rawText);
        const props = schemaToProperties(parsed);
        setProperties(props);
        onChange(parsed);
        setRawError(null);
      } catch {
        setRawError("Invalid JSON");
        return;
      }
    }
    setMode("visual");
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      setRawError(null);
      onChange(parsed);
    } catch {
      setRawError("Invalid JSON");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={mode === "visual" ? switchToRaw : switchToVisual}
          data-testid="schema-mode-toggle"
        >
          {mode === "visual" ? (
            <>
              <Code className="mr-1 h-3 w-3" /> Raw JSON
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3 w-3" /> Visual
            </>
          )}
        </Button>
      </div>

      {mode === "visual" ? (
        <div className="space-y-2">
          {properties.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No properties defined. Click "Add Property" to start.
            </p>
          )}
          {properties.map((prop, index) => (
            <div
              key={index}
              className="flex items-start gap-1.5 rounded border p-2"
              data-testid={`schema-property-${index}`}
            >
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-1.5">
                  <Input
                    value={prop.name}
                    onChange={(e) =>
                      updateProperty(index, { name: e.target.value })
                    }
                    placeholder="Property name"
                    className="h-7 text-xs"
                    data-testid={`property-name-${index}`}
                  />
                  <Select
                    value={prop.type}
                    onValueChange={(v) => updateProperty(index, { type: v })}
                  >
                    <SelectTrigger
                      className="h-7 w-28 text-xs"
                      data-testid={`property-type-${index}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={prop.description}
                    onChange={(e) =>
                      updateProperty(index, { description: e.target.value })
                    }
                    placeholder="Description (optional)"
                    className="h-7 text-xs flex-1"
                  />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Checkbox
                      checked={prop.required}
                      onCheckedChange={(v) =>
                        updateProperty(index, { required: !!v })
                      }
                      data-testid={`property-required-${index}`}
                    />
                    Required
                  </label>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeProperty(index)}
                data-testid={`property-delete-${index}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addProperty}
            disabled={properties.length >= maxProperties}
            data-testid="add-property-btn"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Property
            {properties.length > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({properties.length}/{maxProperties})
              </span>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Textarea
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
            className="min-h-[200px] font-mono text-xs"
            placeholder='{"type": "object", "properties": {}}'
            data-testid="schema-raw-textarea"
          />
          {rawError && (
            <p
              className="text-xs text-destructive"
              data-testid="schema-raw-error"
            >
              {rawError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
