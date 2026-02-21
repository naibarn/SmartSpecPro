import React, { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  ImagePlus,
  X,
  Loader2,
  Info,
  ChevronDown,
  Sparkles,
  Palette,
  Wand2,
  Type,
  Image,
  Settings,
  Video,
  Music,
  Zap,
  Globe,
  Camera,
  Film,
  Layers,
  Check,
  ChevronsUpDown,
  LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";

// Icon mapping for section icons
const iconMap: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  palette: Palette,
  "wand-2": Wand2,
  type: Type,
  image: Image,
  settings: Settings,
  video: Video,
  music: Music,
  zap: Zap,
  globe: Globe,
  camera: Camera,
  film: Film,
  layers: Layers,
};

// Schema Types
export interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider" | "boolean" | "image" | "images" | "imageUpload" | "model-search" | "workflow-selector";
  label: string;
  labelTh?: string;
  placeholder?: string;
  placeholderTh?: string;
  description?: string;
  descriptionTh?: string;
  helpText?: string;
  helpTextTh?: string;
  required?: boolean;
  default?: any;
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
    labelTh?: string;
  }>;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  maxImages?: number;
  maxCount?: number;
  multiple?: boolean;
  accept?: string;
  searchable?: boolean;
  dependsOn?: {
    field: string;
    value?: any;
    notEmpty?: boolean;
  };
  /** Options grouped by parent field value for cascading selects */
  optionGroups?: Record<string, Array<{
    value: string;
    label: string;
    labelTh?: string;
  }>>;
}

export interface SkillInputSection {
  id: string;
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  fields: SkillInputField[];
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  icon?: string;
}

export interface SkillInputSchema {
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  sections: SkillInputSection[];
  outputMapping?: Record<string, string>;
}

interface ReferenceImage {
  url: string;
  name: string;
}

/** Searchable model picker that loads available models from the system via tRPC. */
function ModelSearchField({
  field,
  value,
  onChange,
  label,
  description,
}: {
  field: SkillInputField;
  value: string;
  onChange: (v: string) => void;
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: models = [], isLoading } =
    trpc.multiProvider.getAvailableModelsWithProviders.useQuery();

  const filtered = models.filter(
    (m) =>
      !search ||
      m.modelId.toLowerCase().includes(search.toLowerCase()) ||
      m.modelName.toLowerCase().includes(search.toLowerCase())
  );

  const selected = models.find((m) => m.modelId === value);

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {field.required && <span className="text-red-500">*</span>}
        {description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9"
          >
            <span className="truncate text-sm">
              {selected
                ? selected.modelName
                : (field.placeholder || "Search models...")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput
              placeholder="Search by name or ID..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading models...
                </div>
              ) : (
                <>
                  <CommandEmpty>No models found.</CommandEmpty>
                  <CommandGroup>
                    {filtered.map((model) => (
                      <CommandItem
                        key={model.modelId}
                        value={model.modelId}
                        onSelect={(selected) => {
                          onChange(selected === value ? "" : selected);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            value === model.modelId
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">
                            {model.modelName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {model.modelId}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Combobox that lists the user's saved workflows and auto-fills the JSON textarea on selection. */
function WorkflowSelectorField({
  field,
  value,
  onChange,
  label,
  description,
}: {
  field: SkillInputField;
  value: string;
  onChange: (v: string) => void;
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  type WfItem = { id: number; name: string; description: string | null; workflowJson: Record<string, unknown>; status: string };
  const { data: _rawWorkflows, isLoading } = trpc.workflow.listSaved.useQuery({});
  const workflows = (_rawWorkflows ?? []) as WfItem[];

  const filtered = workflows.filter(
    (w: WfItem) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const selected = workflows.find((w: WfItem) => w.id === selectedId);

  // Clear selection when the value is cleared externally (e.g. form reset)
  if (!value && selectedId !== null) {
    setSelectedId(null);
  }

  // Auto-select by ID when value is a bare numeric string (e.g. passed programmatically)
  useEffect(() => {
    if (!value || isLoading || !workflows.length || selectedId !== null) return;
    const numericId = /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
    if (numericId === null) return;
    const wf = workflows.find((w) => w.id === numericId);
    if (wf) {
      setSelectedId(numericId);
      onChange(JSON.stringify(wf.workflowJson, null, 2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows, isLoading]);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        {label}
        {field.required && <span className="text-red-500">*</span>}
        {description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </Label>

      {/* Saved workflow combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9"
          >
            <span className="truncate text-sm">
              {selected
                ? selected.name
                : (field.placeholder || "Select a saved workflow...")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput
              placeholder="Search workflows..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading workflows...
                </div>
              ) : (
                <>
                  <CommandEmpty>No saved workflows found.</CommandEmpty>
                  <CommandGroup>
                    {filtered.map((w) => (
                      <CommandItem
                        key={w.id}
                        value={String(w.id)}
                        onSelect={() => {
                          setSelectedId(w.id);
                          onChange(JSON.stringify(w.workflowJson, null, 2));
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            selectedId === w.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">{w.name}</span>
                          {w.description && (
                            <span className="text-xs text-muted-foreground truncate">
                              {w.description}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {(w.workflowJson as any)?.nodes?.length ?? 0} nodes
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Manual JSON textarea */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Or paste exported workflow JSON manually:
        </p>
        <Textarea
          value={value}
          rows={field.rows ?? 6}
          placeholder="Paste exported workflow JSON here..."
          onChange={(e) => {
            setSelectedId(null);
            onChange(e.target.value);
          }}
          className="font-mono text-xs resize-y"
        />
      </div>
    </div>
  );
}

/** Special style actions that can trigger parent behaviors */
export type StyleAction = "upscale";

interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  language?: "en" | "th";
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload?: (files: FileList) => Promise<string[]>;
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  isUploading?: boolean;
  /** Field IDs to exclude from rendering (e.g., fields handled by parent component) */
  excludeFields?: string[];
  /** Callback when a special style action is triggered (e.g., "upscale") */
  onStyleAction?: (action: StyleAction) => void;
  /** Additional CSS class for the container */
  className?: string;
}

export default function DynamicSkillForm({
  schema,
  language = "en",
  values,
  onChange,
  onImageUpload,
  referenceImages = [],
  onRemoveImage,
  isUploading,
  excludeFields = [],
  onStyleAction,
  className,
}: DynamicSkillFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track collapsed state for each section
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    schema.sections.forEach((section) => {
      // Use collapsed or defaultCollapsed from schema
      initial[section.id] = section.collapsed ?? section.defaultCollapsed ?? false;
    });
    return initial;
  });

  // Toggle section collapse state
  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };
  
  // Reset dependent field values when parent changes (for cascading selects)
  useEffect(() => {
    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.optionGroups && field.dependsOn) {
          const parentValue = values[field.dependsOn.field];
          const currentValue = values[field.id];
          
          // If parent changed, check if current value is still valid
          const validOptions = field.optionGroups[parentValue] || [];
          const isValid = validOptions.some((opt) => opt.value === currentValue);
          
          if (!isValid && currentValue) {
            // Reset to empty
            onChange({ ...values, [field.id]: '' });
          }
        }
      });
    });
  }, [schema, values, onChange]);

  // Helper to get localized text
  const getText = (en: string | undefined, th: string | undefined) => {
    if (language === "th" && th) return th;
    return en || "";
  };

  // Update a single field value
  const updateValue = (fieldId: string, value: any) => {
    onChange({ ...values, [fieldId]: value });

    // Check for special style actions
    if (fieldId === "style" && value === "upscale" && onStyleAction) {
      onStyleAction("upscale");
    }
  };

  // Check if a field should be visible based on dependsOn
  const isFieldVisible = (field: SkillInputField): boolean => {
    if (!field.dependsOn) return true;
    const dependentValue = values[field.dependsOn.field];
    
    // Handle notEmpty condition
    if (field.dependsOn.notEmpty) {
      return !!dependentValue && dependentValue !== '';
    }
    
    // Handle value condition
    if (field.dependsOn.value !== undefined) {
      return dependentValue === field.dependsOn.value;
    }
    
    return true;
  };
  
  // Get select options, handling optionGroups for cascading selects
  const getSelectOptions = (field: SkillInputField) => {
    // If field has optionGroups and dependsOn, filter by parent value
    if (field.optionGroups && field.dependsOn) {
      const parentValue = values[field.dependsOn.field];
      return field.optionGroups[parentValue] || [];
    }
    return field.options || [];
  };

  // Handle file selection for image fields
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldId: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onImageUpload) return;

    const urls = await onImageUpload(files);
    if (urls.length > 0) {
      // For single image field, use first URL
      // For multiple images, append to existing
      const field = schema.sections
        .flatMap((s) => s.fields)
        .find((f) => f.id === fieldId);

      if (field?.type === "images" || field?.type === "imageUpload" && field?.multiple) {
        const existing = values[fieldId] || [];
        updateValue(fieldId, [...existing, ...urls]);
      } else {
        updateValue(fieldId, urls[0]);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Get icon component for section
  const getSectionIcon = (iconName?: string) => {
    if (!iconName) return null;
    const IconComponent = iconMap[iconName.toLowerCase()];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  // Render a single field
  const renderField = (field: SkillInputField) => {
    // Check visibility based on dependsOn
    if (!isFieldVisible(field)) return null;

    const defaultVal = field.default ?? field.defaultValue ?? "";
    const value = values[field.id] ?? defaultVal;
    const label = getText(field.label, field.labelTh);
    const placeholder = getText(field.placeholder, field.placeholderTh);
    const description = getText(field.description || field.helpText, field.descriptionTh || field.helpTextTh);

    switch (field.type) {
      case "text":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
              {description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            <Input
              id={field.id}
              value={value}
              onChange={(e) => updateValue(field.id, e.target.value)}
              placeholder={placeholder}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
              {description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            <Textarea
              id={field.id}
              value={value}
              onChange={(e) => updateValue(field.id, e.target.value)}
              placeholder={placeholder}
              className="min-h-[80px]"
              rows={field.rows}
            />
          </div>
        );

      case "select":
        const selectOptions = getSelectOptions(field);
        const isDisabled = field.optionGroups && field.dependsOn && selectOptions.length === 0;
        
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
              {description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            <Select
              value={value || undefined}
              onValueChange={(v) => updateValue(field.id, v)}
              disabled={isDisabled}
            >
              <SelectTrigger id={field.id}>
                <SelectValue 
                  placeholder={
                    isDisabled 
                      ? `Select ${field.dependsOn?.field} first` 
                      : (placeholder || "Select...")
                  } 
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {selectOptions.filter((opt) => opt.value != null && opt.value !== "").map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {getText(opt.label, opt.labelTh)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "multiselect":
        const selectedValues: string[] = Array.isArray(value) ? value : [];
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
              {description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[40px] max-h-[120px] overflow-y-auto">
              {field.options?.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <Badge
                    key={opt.value}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-colors text-xs",
                      isSelected
                        ? "bg-purple-500 hover:bg-purple-600"
                        : "hover:bg-purple-100 dark:hover:bg-purple-900/20"
                    )}
                    onClick={() => {
                      const newValues = isSelected
                        ? selectedValues.filter((v) => v !== opt.value)
                        : [...selectedValues, opt.value];
                      updateValue(field.id, newValues);
                    }}
                  >
                    {getText(opt.label, opt.labelTh)}
                  </Badge>
                );
              })}
            </div>
          </div>
        );

      case "number":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
              {description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            <Input
              id={field.id}
              type="number"
              value={value}
              onChange={(e) => updateValue(field.id, Number(e.target.value))}
              placeholder={placeholder}
              min={field.min}
              max={field.max}
              step={field.step}
            />
          </div>
        );

      case "slider":
        const sliderDefault = field.default ?? field.defaultValue ?? field.min ?? 0;
        const sliderValue = typeof value === "number" ? value : sliderDefault;
        return (
          <div key={field.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                {label}
                {field.required && <span className="text-red-500">*</span>}
                {description && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-[200px] text-xs">{description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Label>
              <span className="text-sm font-medium text-muted-foreground">
                {sliderValue}
              </span>
            </div>
            <Slider
              value={[sliderValue]}
              onValueChange={([v]) => updateValue(field.id, v)}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              className="py-2 [&_[data-slot=slider-track]]:bg-gray-300 dark:[&_[data-slot=slider-track]]:bg-gray-600 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2"
            />
          </div>
        );

      case "boolean":
        return (
          <div
            key={field.id}
            className="flex items-center justify-between p-3 border rounded-md"
          >
            <div className="space-y-0.5">
              <Label htmlFor={field.id}>{label}</Label>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            <Switch
              id={field.id}
              checked={!!value}
              onCheckedChange={(checked) => updateValue(field.id, checked)}
            />
          </div>
        );

      case "image":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex items-center gap-3">
              {value ? (
                <div className="relative group">
                  <img
                    src={value}
                    alt="Uploaded"
                    className="h-20 w-20 rounded-lg object-cover border"
                  />
                  <button
                    onClick={() => updateValue(field.id, "")}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-20 w-20"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = field.accept || "image/*";
                    input.onchange = (e) =>
                      handleFileChange(
                        e as unknown as React.ChangeEvent<HTMLInputElement>,
                        field.id
                      );
                    input.click();
                  }}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <ImagePlus className="h-6 w-6" />
                  )}
                </Button>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );

      case "images":
      case "imageUpload":
        const imageUrls: string[] = Array.isArray(value) ? value : [];
        const maxImages = field.maxImages || field.maxCount || 5;
        const isMultiple = field.multiple !== false;
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {label} {isMultiple && `(${imageUrls.length}/${maxImages})`}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={url}
                    alt={`Image ${idx + 1}`}
                    className="h-16 w-16 rounded-lg object-cover border"
                  />
                  <button
                    onClick={() => {
                      const newUrls = imageUrls.filter((_, i) => i !== idx);
                      updateValue(field.id, newUrls);
                    }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {imageUrls.length < maxImages && (
                <Button
                  variant="outline"
                  className="h-16 w-16"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = field.accept || "image/*";
                    input.multiple = isMultiple;
                    input.onchange = (e) =>
                      handleFileChange(
                        e as unknown as React.ChangeEvent<HTMLInputElement>,
                        field.id
                      );
                    input.click();
                  }}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );

      case "model-search":
        return (
          <ModelSearchField
            key={field.id}
            field={field}
            value={value}
            onChange={(v) => updateValue(field.id, v)}
            label={label}
            description={description}
          />
        );

      case "workflow-selector":
        return (
          <WorkflowSelectorField
            key={field.id}
            field={field}
            value={String(values[field.id] ?? "")}
            onChange={(v) => updateValue(field.id, v)}
            label={label}
            description={description}
          />
        );

      default:
        return null;
    }
  };

  // Render reference images section (if any)
  const renderReferenceImages = () => {
    if (referenceImages.length === 0) return null;

    return (
      <div className="space-y-1.5 pt-3 border-t">
        <Label className="text-sm">
          Reference Images ({referenceImages.length}/5)
        </Label>
        <div className="flex flex-wrap gap-2">
          {referenceImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.url}
                alt={img.name}
                className="h-12 w-12 rounded-lg object-cover border"
              />
              {onRemoveImage && (
                <button
                  onClick={() => onRemoveImage(idx)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <Badge
                variant="secondary"
                className="absolute bottom-0 left-0 text-[8px] px-1"
              >
                {idx + 1}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render a section with optional collapsible behavior
  const renderSection = (section: SkillInputSection) => {
    const isCollapsed = collapsedSections[section.id];
    const hasCollapsible = section.collapsible !== false && (section.collapsed !== undefined || section.defaultCollapsed !== undefined);
    const sectionTitle = getText(section.title, section.titleTh);
    const sectionDescription = getText(section.description, section.descriptionTh);
    const sectionIcon = getSectionIcon(section.icon);

    // Filter visible fields and exclude specified fields
    const visibleFields = section.fields
      .filter(isFieldVisible)
      .filter((field) => !excludeFields.includes(field.id));
    if (visibleFields.length === 0) return null;

    const sectionContent = (
      <div className="grid gap-3">
        {visibleFields.map((field) => renderField(field))}
      </div>
    );

    if (hasCollapsible) {
      return (
        <Collapsible
          key={section.id}
          open={!isCollapsed}
          onOpenChange={() => toggleSection(section.id)}
        >
          <div className="border rounded-lg">
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                {sectionIcon}
                <span className="text-sm font-medium">{sectionTitle}</span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !isCollapsed && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-0 space-y-3">
                {sectionDescription && (
                  <p className="text-xs text-muted-foreground">{sectionDescription}</p>
                )}
                {sectionContent}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      );
    }

    // Non-collapsible section
    return (
      <div key={section.id} className="space-y-3">
        {sectionTitle && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {sectionIcon}
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {sectionTitle}
              </h4>
            </div>
            {sectionDescription && (
              <p className="text-xs text-muted-foreground">{sectionDescription}</p>
            )}
          </div>
        )}
        {sectionContent}
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {schema.sections.map((section) => renderSection(section))}

      {/* Reference Images */}
      {renderReferenceImages()}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
      />
    </div>
  );
}
