import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import { cn } from "@/lib/utils";
import {
  buildDefaultModelInputArrayItem,
  getAllowedLibraryExtensionsForField,
  type ModelInputField,
} from "@/lib/mediaModelInputs";
import { Plus, Trash2 } from "lucide-react";

interface ModelInputArrayFieldEditorProps {
  field: ModelInputField;
  value: unknown;
  onChange: (value: unknown) => void;
  variant?: "light" | "dark";
  ariaLabelPrefix?: string;
  className?: string;
}

type ArrayItemValue = Record<string, unknown>;

function isRecord(value: unknown): value is ArrayItemValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJsonArray(value: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      return [parsed];
    }
  } catch {
    // Fall through to the caller's default handling.
  }

  return null;
}

function normalizeArrayItem(item: unknown, itemFields: ModelInputField[]): ArrayItemValue {
  if (isRecord(item)) {
    return item;
  }

  const firstField = itemFields[0];
  if (firstField) {
    return { [firstField.key]: item };
  }

  return { value: item };
}

function normalizeArrayValue(
  value: unknown,
  defaultValue: unknown,
  itemFields: ModelInputField[],
): ArrayItemValue[] {
  let candidate: unknown[] | null = null;

  if (Array.isArray(value)) {
    candidate = value;
  } else if (typeof value === "string") {
    candidate = parseMaybeJsonArray(value);
  }

  if (candidate === null) {
    candidate = Array.isArray(defaultValue) ? defaultValue : [];
  }

  return candidate.map((item) => normalizeArrayItem(item, itemFields));
}

function getSearchableOptions(field: ModelInputField, searchTerm: string) {
  const options = field.options ?? [];
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) {
    return options;
  }
  return options.filter((option) => (
    String(option.label ?? "").toLowerCase().includes(normalized)
    || String(option.value ?? "").toLowerCase().includes(normalized)
  ));
}

function renderSubFieldDescription(field: { description?: string } | null | undefined) {
  if (!field?.description) {
    return null;
  }

  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      {field.description}
    </p>
  );
}

export function ModelInputArrayFieldEditor({
  field,
  value,
  onChange,
  variant = "light",
  ariaLabelPrefix = "Advanced",
  className,
}: ModelInputArrayFieldEditorProps) {
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const itemFields = field.itemFields ?? [];
  const items = normalizeArrayValue(value, field.default, itemFields);
  const maxItems = typeof field.maxItems === "number" && field.maxItems > 0 ? field.maxItems : null;
  const canAdd = maxItems === null || items.length < maxItems;
  const baseClasses = variant === "dark"
    ? "border-zinc-700 bg-zinc-900/40 text-zinc-100"
    : "border-muted bg-muted/20";
  const subtleTextClasses = variant === "dark" ? "text-zinc-400" : "text-muted-foreground";

  const updateItems = (nextItems: ArrayItemValue[]) => {
    onChange(nextItems);
  };

  const updateItemValue = (index: number, nextValue: ArrayItemValue) => {
    const nextItems = [...items];
    nextItems[index] = nextValue;
    updateItems(nextItems);
  };

  const updateSubFieldValue = (index: number, subField: ModelInputField, nextValue: unknown) => {
    const currentItem = items[index] ?? buildDefaultModelInputArrayItem(itemFields, index);
    updateItemValue(index, {
      ...currentItem,
      [subField.key]: nextValue,
    });
  };

  const removeItem = (index: number) => {
    const nextItems = [...items];
    nextItems.splice(index, 1);
    updateItems(nextItems);
  };

  const addItem = () => {
    if (!canAdd) {
      return;
    }
    updateItems([
      ...items,
      buildDefaultModelInputArrayItem(itemFields, items.length),
    ]);
  };

  const renderSubField = (
    subField: ModelInputField,
    item: ArrayItemValue,
    index: number,
  ) => {
    const currentValue = item[subField.key] ?? subField.default ?? "";
    const label = subField.label;
    const subFieldKey = `${field.key}:${index}:${subField.key}`;

    if (subField.type === "array" && subField.itemFields?.length) {
      return (
        <div key={subFieldKey} className="space-y-2">
          <div className={cn("text-xs font-medium", subtleTextClasses)}>
            {label}
            {subField.required ? " *" : ""}
          </div>
          {renderSubFieldDescription(subField)}
          <ModelInputArrayFieldEditor
            field={subField}
            value={currentValue}
            onChange={(nextValue) => updateSubFieldValue(index, subField, nextValue)}
            variant={variant}
            ariaLabelPrefix={`${ariaLabelPrefix} ${field.itemLabel || field.label}`}
          />
        </div>
      );
    }

    if (subField.type === "select" && subField.options && subField.options.length > 0) {
      const searchKey = `${field.key}:${index}:${subField.key}`;
      const searchTerm = searchTerms[searchKey] ?? "";
      const filteredOptions = getSearchableOptions(subField, searchTerm);
      const visibleOptions = filteredOptions.length > 0
        ? filteredOptions
        : subField.options;
      const currentString = String(currentValue ?? subField.options[0]?.value ?? "");
      return (
        <label key={subFieldKey} className="flex flex-col gap-1.5">
          <span className={cn("text-xs", subtleTextClasses)}>
            {label}
            {subField.required ? " *" : ""}
          </span>
          {subField.options.length >= 8 || subField.searchable ? (
            <Input
              type="text"
              aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
              placeholder={`Search ${label.toLowerCase()}...`}
              value={searchTerm}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchTerms((prev) => ({
                  ...prev,
                  [searchKey]: nextValue,
                }));
              }}
            />
          ) : null}
          <select
            aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
            className={cn(
              "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
            )}
            value={currentString}
            onChange={(event) => updateSubFieldValue(index, subField, event.target.value)}
          >
            {visibleOptions.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          {searchTerm.length > 0 && filteredOptions.length === 0 ? (
            <span className={cn("text-[11px]", subtleTextClasses)}>
              No matching options. Showing current value.
            </span>
          ) : null}
          {renderSubFieldDescription(subField)}
        </label>
      );
    }

    if (subField.type === "boolean") {
      const checked = typeof currentValue === "boolean"
        ? currentValue
        : String(currentValue).trim().toLowerCase() === "true";
      return (
        <label
          key={subFieldKey}
          className={cn(
            "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
            variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
          )}
        >
          <span>
            {label}
            {subField.required ? " *" : ""}
          </span>
          <Switch
            aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
            checked={checked}
            onCheckedChange={(checkedState) => updateSubFieldValue(index, subField, checkedState)}
          />
          {renderSubFieldDescription(subField)}
        </label>
      );
    }

    if (subField.type === "number") {
      return (
        <label key={subFieldKey} className="flex flex-col gap-1.5">
          <span className={cn("text-xs", subtleTextClasses)}>
            {label}
            {subField.required ? " *" : ""}
          </span>
          <Input
            type="number"
            aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
            value={currentValue === "" ? "" : String(currentValue)}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw.trim() === "") {
                updateSubFieldValue(index, subField, "");
                return;
              }
              const parsed = Number(raw);
              updateSubFieldValue(index, subField, Number.isFinite(parsed) ? parsed : raw);
            }}
          />
          {renderSubFieldDescription(subField)}
        </label>
      );
    }

    if (subField.type === "library_file") {
      return (
        <label key={subFieldKey} className="flex flex-col gap-1.5">
          <span className={cn("text-xs", subtleTextClasses)}>
            {label}
            {subField.required ? " *" : ""}
          </span>
          <LibraryFilePicker
            value={String(currentValue ?? "")}
            onValueChange={(url) => updateSubFieldValue(index, subField, url)}
          />
          {renderSubFieldDescription(subField)}
        </label>
      );
    }

    if (subField.type === "image_urls" || subField.type === "video_urls" || subField.type === "audio_urls") {
      const currentUrls = Array.isArray(currentValue)
        ? currentValue.filter((entry): entry is string => typeof entry === "string")
        : [];
      return (
        <label key={subFieldKey} className="flex flex-col gap-1.5">
          <span className={cn("text-xs", subtleTextClasses)}>
            {label}
            {subField.required ? " *" : ""}
          </span>
          <Textarea
            aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
            className={cn(
              "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
            )}
            placeholder="One URL per line"
            value={currentUrls.join("\n")}
            onChange={(event) => {
              const urls = event.target.value
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
              updateSubFieldValue(index, subField, urls);
            }}
          />
          <LibraryFilePicker
            value=""
            onValueChange={(url) => {
              const normalized = String(url || "").trim();
              if (!normalized) {
                return;
              }
              const deduped = Array.from(new Set([...currentUrls, normalized]));
              updateSubFieldValue(index, subField, deduped);
            }}
            allowedExtensions={getAllowedLibraryExtensionsForField(subField)}
          />
          {renderSubFieldDescription(subField)}
        </label>
      );
    }

    return (
      <label key={subFieldKey} className="flex flex-col gap-1.5">
        <span className={cn("text-xs", subtleTextClasses)}>
          {label}
          {subField.required ? " *" : ""}
        </span>
        <Input
          type="text"
          aria-label={`${ariaLabelPrefix} ${field.itemLabel || field.label} ${label}`}
          placeholder={subField.placeholder || label}
          value={String(currentValue ?? "")}
          onChange={(event) => updateSubFieldValue(index, subField, event.target.value)}
        />
        {renderSubFieldDescription(subField)}
      </label>
    );
  };

  return (
    <div className={cn("space-y-3 rounded-md border p-3", baseClasses, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className={cn("text-xs font-medium", variant === "dark" ? "text-zinc-200" : "")}>
            {field.label}
            {field.required ? " *" : ""}
            {typeof field.maxItems === "number" ? ` (${items.length}/${field.maxItems})` : ""}
          </div>
          {field.description ? (
            <div className={cn("text-[11px] leading-snug", subtleTextClasses)}>
              {field.description}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          disabled={!canAdd}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add {field.itemLabel || "Item"}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className={cn("rounded-md border border-dashed px-3 py-2 text-xs", subtleTextClasses)}>
          No {field.itemLabel || "items"} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${field.key}-${index}`}
              className={cn(
                "relative space-y-3 rounded-md border p-3",
                variant === "dark" ? "border-zinc-700 bg-zinc-950/20" : "bg-background",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={cn("text-xs font-medium", subtleTextClasses)}>
                  {field.itemLabel || "Item"} {index + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3">
                {itemFields.map((subField) => renderSubField(subField, item, index))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
