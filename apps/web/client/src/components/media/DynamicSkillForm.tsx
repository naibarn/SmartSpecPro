import React, { useRef, useState } from "react";
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
  LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider" | "boolean" | "image" | "images" | "imageUpload";
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
    value: any;
  };
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
    return dependentValue === field.dependsOn.value;
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
            >
              <SelectTrigger id={field.id}>
                <SelectValue placeholder={placeholder || "Select..."} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {field.options?.filter((opt) => opt.value != null && opt.value !== "").map((opt) => (
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
              className="py-2"
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
    <div className="space-y-4">
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
