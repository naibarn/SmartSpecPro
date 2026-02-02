import React, { useRef } from "react";
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
import { cn } from "@/lib/utils";
import {
  ImagePlus,
  X,
  Upload,
  Loader2,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Schema Types
export interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider" | "boolean" | "image" | "images";
  label: string;
  labelTh?: string;
  placeholder?: string;
  placeholderTh?: string;
  description?: string;
  descriptionTh?: string;
  required?: boolean;
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
    labelTh?: string;
  }>;
  min?: number;
  max?: number;
  step?: number;
  maxImages?: number;
}

export interface SkillInputSection {
  id: string;
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  fields: SkillInputField[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
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

interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  language?: "en" | "th";
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload?: (files: FileList) => Promise<string[]>;
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  isUploading?: boolean;
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
}: DynamicSkillFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get localized text
  const getText = (en: string | undefined, th: string | undefined) => {
    if (language === "th" && th) return th;
    return en || "";
  };

  // Update a single field value
  const updateValue = (fieldId: string, value: any) => {
    onChange({ ...values, [fieldId]: value });
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

      if (field?.type === "images") {
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

  // Render a single field
  const renderField = (field: SkillInputField) => {
    const value = values[field.id] ?? field.defaultValue ?? "";
    const label = getText(field.label, field.labelTh);
    const placeholder = getText(field.placeholder, field.placeholderTh);
    const description = getText(field.description, field.descriptionTh);

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
            />
          </div>
        );

      case "select":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={value || undefined}
              onValueChange={(v) => updateValue(field.id, v)}
            >
              <SelectTrigger id={field.id}>
                <SelectValue placeholder={placeholder || "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.filter((opt) => opt.value != null && opt.value !== "").map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {getText(opt.label, opt.labelTh)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );

      case "multiselect":
        const selectedValues: string[] = value || [];
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
              {field.options?.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <Badge
                    key={opt.value}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected
                        ? "bg-purple-500 hover:bg-purple-600"
                        : "hover:bg-purple-100"
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
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );

      case "number":
        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {label}
              {field.required && <span className="text-red-500">*</span>}
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
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );

      case "slider":
        const sliderValue = typeof value === "number" ? value : field.min ?? 0;
        return (
          <div key={field.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                {label}
                {field.required && <span className="text-red-500">*</span>}
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
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
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
                    input.accept = "image/*";
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
        const imageUrls: string[] = value || [];
        const maxImages = field.maxImages || 5;
        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {label} ({imageUrls.length}/{maxImages})
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
                    input.accept = "image/*";
                    input.multiple = true;
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

  return (
    <div className="space-y-4">
      {schema.sections.map((section) => (
        <div key={section.id} className="space-y-3">
          {/* Section Header */}
          {section.title && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-700">
                {getText(section.title, section.titleTh)}
              </h4>
              {section.description && (
                <p className="text-xs text-muted-foreground">
                  {getText(section.description, section.descriptionTh)}
                </p>
              )}
            </div>
          )}

          {/* Section Fields */}
          <div className="grid gap-3">
            {section.fields.map((field) => renderField(field))}
          </div>
        </div>
      ))}

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
