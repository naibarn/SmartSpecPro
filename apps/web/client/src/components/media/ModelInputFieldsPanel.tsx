import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import {
  type MediaModelOption,
  type ModelInputField,
  type ModelInputSyncTarget,
  getAllowedLibraryExtensionsForField,
} from "@/lib/mediaModelInputs";
import { ModelInputArrayFieldEditor } from "@/components/media/ModelInputArrayFieldEditor";
import { trpc } from "@/lib/trpc";

interface ModelInputFieldsPanelProps {
  enabled: boolean;
  model: MediaModelOption | undefined;
  fields: ModelInputField[];
  extraParams: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  promptPreview?: string;
  aspectRatioPreview?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  className?: string;
  variant?: "light" | "dark";
  titlePrefix?: string;
  emptyTestId?: string;
  panelTestId?: string;
  ariaLabelPrefix?: string;
}

function cn(...values: Array<string | undefined | false | null>): string {
  return values.filter(Boolean).join(" ");
}

interface SearchableFieldOption {
  value: string;
  label: string;
  previewUrl?: string;
}

function hasProviderApiOptionsSource(field: ModelInputField | null | undefined): boolean {
  if (!field || !field.optionsSource || typeof field.optionsSource !== "object") return false;
  const sourceType = String(field.optionsSource.type || "").trim().toLowerCase();
  return sourceType === "provider_api" || sourceType === "public_api";
}

function isSearchableModelField(field: ModelInputField | null | undefined): boolean {
  if (!field) return false;
  return field.searchable === true || hasProviderApiOptionsSource(field);
}

function isVoiceSelectionField(field: ModelInputField | null | undefined): boolean {
  if (!field) return false;
  const normalizedKey = String(field.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]/g, "");
  return normalizedKey === "voice" || normalizedKey === "voiceid";
}

function normalizeFieldOptions(raw: unknown): SearchableFieldOption[] {
  if (!Array.isArray(raw)) return [];
  const options: SearchableFieldOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const value = typeof record.value === "string" ? record.value.trim() : String(record.value ?? "").trim();
    const label = typeof record.label === "string" ? record.label.trim() : value;
    const previewUrl = typeof record.previewUrl === "string" ? record.previewUrl.trim() : "";
    if (!value) continue;
    options.push({
      value,
      label: label || value,
      ...(previewUrl ? { previewUrl } : {}),
    });
  }
  return options;
}

export function ModelInputFieldsPanel({
  enabled,
  model,
  fields,
  extraParams,
  onChange,
  promptPreview,
  aspectRatioPreview,
  referenceImageUrls,
  referenceVideoUrls,
  className,
  variant = "light",
  titlePrefix = "Model Inputs",
  emptyTestId,
  panelTestId,
  ariaLabelPrefix = "Advanced",
}: ModelInputFieldsPanelProps) {
  const [optionSearchTerms, setOptionSearchTerms] = useState<Record<string, string>>({});
  const [fieldPickerOpenKey, setFieldPickerOpenKey] = useState<string | null>(null);
  const [fieldOptionsCache, setFieldOptionsCache] = useState<Record<string, SearchableFieldOption[]>>({});
  const [playingVoicePreviewKey, setPlayingVoicePreviewKey] = useState<string | null>(null);
  const [loadingVoicePreviewKey, setLoadingVoicePreviewKey] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const syncedFields = useMemo(() => fields.filter((field) => field.syncWith !== "none"), [fields]);
  const editableFields = useMemo(() => fields.filter((field) => field.syncWith === "none"), [fields]);
  const activeSearchableField = useMemo(() => {
    if (!fieldPickerOpenKey) {
      return null;
    }
    const matched = editableFields.find((field) => field.key === fieldPickerOpenKey);
    return isSearchableModelField(matched) ? matched : null;
  }, [editableFields, fieldPickerOpenKey]);
  const shouldLoadDynamicFieldOptions = Boolean(
    enabled
    && model
    && activeSearchableField
    && hasProviderApiOptionsSource(activeSearchableField),
  );
  const dynamicFieldOptionsQuery = trpc.media.listModelFieldOptions.useQuery(
    {
      modelId: model?.id ?? "",
      fieldKey: activeSearchableField?.key ?? "",
      limit: 2000,
    },
    {
      enabled: shouldLoadDynamicFieldOptions,
      staleTime: 60_000,
      retry: 1,
    },
  );
  const activeDynamicFieldOptions = useMemo(
    () => normalizeFieldOptions(dynamicFieldOptionsQuery.data?.options),
    [dynamicFieldOptionsQuery.data?.options],
  );

  useEffect(() => {
    if (!fieldPickerOpenKey || activeDynamicFieldOptions.length === 0) {
      return;
    }
    setFieldOptionsCache((prev) => {
      const existing = prev[fieldPickerOpenKey] ?? [];
      const unchanged = (
        existing.length === activeDynamicFieldOptions.length
        && existing.every((option, index) => (
          option.value === activeDynamicFieldOptions[index]?.value
          && option.label === activeDynamicFieldOptions[index]?.label
          && option.previewUrl === activeDynamicFieldOptions[index]?.previewUrl
        ))
      );
      if (unchanged) {
        return prev;
      }
      return {
        ...prev,
        [fieldPickerOpenKey]: activeDynamicFieldOptions,
      };
    });
  }, [activeDynamicFieldOptions, fieldPickerOpenKey]);

  const stopVoicePreview = useCallback(() => {
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current.currentTime = 0;
      voicePreviewAudioRef.current.onended = null;
      voicePreviewAudioRef.current = null;
    }
    setPlayingVoicePreviewKey(null);
    setLoadingVoicePreviewKey(null);
  }, []);

  const toggleVoicePreview = useCallback((
    fieldKey: string,
    option: SearchableFieldOption | undefined,
  ) => {
    const previewUrl = String(option?.previewUrl ?? "").trim();
    if (!previewUrl) {
      return;
    }
    const previewKey = `${fieldKey}:${option?.value ?? ""}`;
    if (playingVoicePreviewKey === previewKey) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();
    const audio = new Audio(previewUrl);
    voicePreviewAudioRef.current = audio;
    setLoadingVoicePreviewKey(previewKey);
    audio.onended = () => {
      setPlayingVoicePreviewKey(null);
      setLoadingVoicePreviewKey(null);
      voicePreviewAudioRef.current = null;
    };
    void audio.play()
      .then(() => {
        setPlayingVoicePreviewKey(previewKey);
      })
      .catch(() => {
        setPlayingVoicePreviewKey(null);
      })
      .finally(() => {
        setLoadingVoicePreviewKey((prev) => (prev === previewKey ? null : prev));
      });
  }, [playingVoicePreviewKey, stopVoicePreview]);

  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, [stopVoicePreview]);

  if (!enabled) {
    return null;
  }
  if (!model || fields.length === 0) {
    return (
      <div
        data-testid={emptyTestId}
        className={cn(
          "rounded-md border p-3 text-xs",
          variant === "dark"
            ? "border-zinc-700 bg-zinc-800/40 text-zinc-400"
            : "border-muted bg-muted/30 text-muted-foreground",
          className,
        )}
      >
        Selected model has no dynamic inputs.
      </div>
    );
  }

  const SYNC_LABELS: Record<ModelInputSyncTarget, string> = {
    none: "None",
    prompt: "Prompt",
    reference_images: "Reference Images",
    reference_videos: "Reference Videos",
    aspect_ratio: "Aspect Ratio",
  };

  return (
    <div
      data-testid={panelTestId}
      className={cn(
        "space-y-2 rounded-md border p-3",
        variant === "dark"
          ? "border-zinc-700/70 bg-zinc-900/40"
          : "border-muted bg-muted/30",
        className,
      )}
    >
      <div className={cn("text-xs font-medium", variant === "dark" ? "text-zinc-300" : "")}>
        {titlePrefix} ({model.name})
      </div>
      {syncedFields.map((field) => {
        let preview = "—";
        if (field.syncWith === "prompt") {
          preview = promptPreview?.trim() ? promptPreview : "Auto from prompt";
        } else if (field.syncWith === "aspect_ratio") {
          preview = aspectRatioPreview?.trim() ? aspectRatioPreview : "—";
        } else if (field.syncWith === "reference_images") {
          const count = referenceImageUrls?.length ?? 0;
          preview = count > 0 ? `${count} reference image${count === 1 ? "" : "s"}` : "No references";
        } else if (field.syncWith === "reference_videos") {
          const count = referenceVideoUrls?.length ?? 0;
          preview = count > 0 ? `${count} reference video${count === 1 ? "" : "s"}` : "No references";
        }
        return (
          <label key={field.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              <span className={cn(
                "rounded border px-1 py-0 text-[10px]",
                variant === "dark" ? "border-zinc-600 text-zinc-400" : "text-muted-foreground",
              )}
              >
                Sync: {SYNC_LABELS[field.syncWith]}
              </span>
            </div>
            <Input value={preview} readOnly />
          </label>
        );
      })}
      {editableFields.map((field) => {
        const value = extraParams[field.key] ?? field.default ?? "";
        if (isSearchableModelField(field)) {
          const isOpen = fieldPickerOpenKey === field.key;
          const supportsRefresh = hasProviderApiOptionsSource(field);
          const staticOptions = normalizeFieldOptions(field.options);
          const cachedOptions = fieldOptionsCache[field.key] ?? [];
          const dynamicOptions = supportsRefresh
            ? (activeSearchableField?.key === field.key ? activeDynamicFieldOptions : [])
            : [];
          const fieldOptions = (
            isOpen
              ? (dynamicOptions.length > 0
                ? dynamicOptions
                : (cachedOptions.length > 0 ? cachedOptions : staticOptions))
              : (cachedOptions.length > 0 ? cachedOptions : staticOptions)
          );
          const currentValue = String(value ?? "");
          const selectedOption = fieldOptions.find((option) => option.value === currentValue)
            ?? staticOptions.find((option) => option.value === currentValue);
          const isLoadingOptions = (
            isOpen
            && supportsRefresh
            && activeSearchableField?.key === field.key
            && dynamicFieldOptionsQuery.isLoading
          );
          const supportsManualInput = field.type !== "select";
          const isVoiceField = isVoiceSelectionField(field);
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Popover
                  open={isOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      setFieldPickerOpenKey(field.key);
                      return;
                    }
                    if (fieldPickerOpenKey === field.key) {
                      setFieldPickerOpenKey(null);
                    }
                    stopVoicePreview();
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-label={`${ariaLabelPrefix} ${field.label}`}
                      className={cn(
                        "h-9 flex-1 justify-between",
                        variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
                      )}
                    >
                      <span className="truncate text-left">
                        {selectedOption
                          ? selectedOption.label
                          : currentValue
                            ? currentValue
                            : isLoadingOptions
                              ? "Loading options..."
                              : "Select option"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={`Search ${String(field.label || field.key).toLowerCase()}...`} />
                      <CommandList>
                        <CommandEmpty>
                          {isLoadingOptions ? "Loading options..." : "No options found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {fieldOptions.map((option) => (
                            <CommandItem
                              key={option.value}
                              value={`${option.label} ${option.value}`}
                              onSelect={() => {
                                onChange(field.key, option.value);
                                setFieldPickerOpenKey(null);
                                stopVoicePreview();
                              }}
                            >
                              <div className="flex w-full items-center gap-2">
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    currentValue === option.value ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                {option.label !== option.value ? (
                                  <span className={cn(
                                    "truncate text-xs",
                                    variant === "dark" ? "text-zinc-500" : "text-muted-foreground",
                                  )}
                                  >
                                    {option.value}
                                  </span>
                                ) : null}
                                {isVoiceField ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    disabled={!option.previewUrl}
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      toggleVoicePreview(field.key, option);
                                    }}
                                    title={option.previewUrl ? "Play voice preview" : "No preview available"}
                                  >
                                    {loadingVoicePreviewKey === `${field.key}:${option.value}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : playingVoicePreviewKey === `${field.key}:${option.value}` ? (
                                      <Pause className="h-3.5 w-3.5" />
                                    ) : (
                                      <Play className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                ) : null}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {supportsRefresh ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      if (fieldPickerOpenKey !== field.key) {
                        setFieldPickerOpenKey(field.key);
                        return;
                      }
                      void dynamicFieldOptionsQuery.refetch();
                    }}
                    title="Refresh option list"
                  >
                    <RefreshCw className={cn(
                      "h-4 w-4",
                      isLoadingOptions ? "animate-spin" : "",
                    )}
                    />
                  </Button>
                ) : null}
              </div>
              {supportsManualInput ? (
                <Input
                  type="text"
                  placeholder={`Or enter custom ${field.label || field.key}`}
                  value={currentValue}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              ) : null}
              {!isLoadingOptions && fieldOptions.length === 0 && supportsManualInput ? (
                <span className={cn("text-[11px]", variant === "dark" ? "text-zinc-500" : "text-muted-foreground")}>
                  Option list unavailable right now. You can still enter a value manually.
                </span>
              ) : null}
            </label>
          );
        }
        if (field.type === "select" && field.options && field.options.length > 0) {
          const selectValue = String(value ?? field.options[0]?.value ?? "");
          const searchKey = `${model.id}:${field.key}`;
          const searchTerm = (optionSearchTerms[searchKey] ?? "").trim().toLowerCase();
          const selectedOption = field.options.find((option) => String(option.value) === selectValue);
          const filteredOptions = searchTerm.length === 0
            ? field.options
            : field.options.filter((option) => {
              const label = String(option.label || "").toLowerCase();
              const optionValue = String(option.value ?? "").toLowerCase();
              return label.includes(searchTerm) || optionValue.includes(searchTerm);
            });
          const visibleOptions = filteredOptions.length > 0
            ? filteredOptions
            : (selectedOption ? [selectedOption] : []);
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              {field.options.length >= 8 ? (
                <Input
                  type="text"
                  aria-label={`Search ${field.label}`}
                  placeholder={`Search ${field.label.toLowerCase()}...`}
                  value={optionSearchTerms[searchKey] ?? ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setOptionSearchTerms((prev) => ({
                      ...prev,
                      [searchKey]: nextValue,
                    }));
                  }}
                />
              ) : null}
              <select
                aria-label={`${ariaLabelPrefix} ${field.label}`}
                className={cn(
                  "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
                )}
                value={selectValue}
                onChange={(event) => {
                  const matched = field.options?.find(
                    (option) => String(option.value) === event.target.value,
                  );
                  onChange(field.key, matched?.value ?? event.target.value);
                }}
              >
                {visibleOptions.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
              {searchTerm.length > 0 && filteredOptions.length === 0 ? (
                <span className={cn("text-[11px]", variant === "dark" ? "text-zinc-500" : "text-muted-foreground")}>
                  No matching options. Showing current selected value.
                </span>
              ) : null}
            </label>
          );
        }
        if (field.type === "boolean") {
          const checked = typeof value === "boolean"
            ? value
            : String(value).trim().toLowerCase() === "true";
          return (
            <label key={field.key} className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
              variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
            )}
            >
              <span>{field.label}{field.required ? " *" : ""}</span>
              <Switch
                aria-label={`${ariaLabelPrefix} ${field.label}`}
                checked={checked}
                onCheckedChange={(checkedState) => onChange(field.key, checkedState)}
              />
            </label>
          );
        }
        if (field.type === "number") {
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              <Input
                type="number"
                aria-label={`${ariaLabelPrefix} ${field.label}`}
                value={value === "" ? "" : String(value)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw.trim() === "") {
                    onChange(field.key, "");
                    return;
                  }
                  const parsed = Number(raw);
                  onChange(field.key, Number.isFinite(parsed) ? parsed : raw);
                }}
              />
            </label>
          );
        }
        if (field.type === "library_file") {
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              <LibraryFilePicker
                value={String(value ?? "")}
                onValueChange={(url) => onChange(field.key, url)}
              />
            </label>
          );
        }
        if (field.type === "array" && field.itemFields?.length) {
          return (
            <ModelInputArrayFieldEditor
              key={field.key}
              field={field}
              value={value}
              onChange={(nextValue) => onChange(field.key, nextValue)}
              variant={variant}
              ariaLabelPrefix={ariaLabelPrefix}
            />
          );
        }
        if (field.type === "image_urls" || field.type === "video_urls" || field.type === "audio_urls") {
          const currentUrls = Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === "string")
            : [];
          const urlList = currentUrls.join("\n");
          return (
            <label key={field.key} className="flex flex-col gap-1">
              <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
                {field.label}{field.required ? " *" : ""}
              </span>
              <textarea
                aria-label={`${ariaLabelPrefix} ${field.label}`}
                className={cn(
                  "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  variant === "dark" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "",
                )}
                placeholder="One URL per line"
                value={urlList}
                onChange={(event) => {
                  const urls = event.target.value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  onChange(field.key, urls.length > 0 ? urls : "");
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
                  onChange(field.key, deduped);
                }}
                allowedExtensions={getAllowedLibraryExtensionsForField(field)}
              />
            </label>
          );
        }
        return (
          <label key={field.key} className="flex flex-col gap-1">
            <span className={cn("text-xs", variant === "dark" ? "text-zinc-300" : "text-muted-foreground")}>
              {field.label}{field.required ? " *" : ""}
            </span>
            <Input
              type="text"
              aria-label={`${ariaLabelPrefix} ${field.label}`}
              placeholder={field.placeholder || field.label}
              value={String(value ?? "")}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
