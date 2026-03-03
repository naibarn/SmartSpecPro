import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "../lib/trpc";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  Loader2,
  Image,
  Video,
  Music,
  Layers,
  Check,
  X,
  ChevronLeft,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Coins,
  GripVertical,
  Settings2,
  Code,
  Activity,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

interface MediaModel {
  id: number;
  modelId: string;
  name: string;
  description: string | null;
  modelType: "image" | "video" | "audio";
  provider: string;
  aliases: string[] | null;
  creditCost: number;
  aspectRatios: string[] | null;
  sizes: string[] | null;
  durations: number[] | null;
  voices: string[] | null;
  configJson: Record<string, any> | null;
  isEnabled: boolean;
  priority: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  modelId: string;
  name: string;
  description: string;
  modelType: "image" | "video" | "audio";
  provider: string;
  aliases: string;
  creditCost: number;
  aspectRatios: string;
  sizes: string;
  durations: string;
  voices: string;
  isEnabled: boolean;
  priority: number;
  // API Config (configJson)
  apiEndpoint: string;
  apiQueryEndpoint: string;
  apiPayloadFormat: string;
  kieModelId: string;
  pricingFormula: string;
  operationType: MediaOperationType;
  generateType: string;
  maxPromptLength: number;
  inputFieldDrafts: InputFieldDraft[];
  pricingTierDrafts: PricingTierDraft[];
}

const SEARCH_DEBOUNCE_MS = 900;
const MIN_SEARCH_LENGTH = 2;

type InputFieldType = "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "array";
type MediaOperationType = "t2i" | "i2i" | "t2v" | "i2v" | "v2v" | "upscale" | "t2m" | "s2t" | "t2s" | "a2a" | "chat" | "other";

interface InputFieldOptionDraft {
  id: string;
  value: string;
  label: string;
}

interface InputFieldDraft {
  id: string;
  key: string;
  label: string;
  type: InputFieldType;
  defaultRaw: string;
  defaultBoolean: boolean;
  required: boolean;
  affectsPricing: boolean;
  options: InputFieldOptionDraft[];
}

interface PricingTierDraft {
  id: string;
  key: string;
  value: string;
}

interface ApiConfigPreset {
  id: string;
  label: string;
  description: string;
  pricingFormula: "flat" | "per_duration" | "matrix";
  inputFields: Array<Record<string, unknown>>;
  pricingTiers: Record<string, number>;
}

const MEDIA_OPERATION_OPTIONS: Array<{ value: MediaOperationType; label: string }> = [
  { value: "t2i", label: "t2i (Text to Image)" },
  { value: "i2i", label: "i2i (Image to Image)" },
  { value: "t2v", label: "t2v (Text to Video)" },
  { value: "i2v", label: "i2v (Image to Video)" },
  { value: "v2v", label: "v2v (Video to Video)" },
  { value: "upscale", label: "Upscale" },
  { value: "t2m", label: "t2m (Text to Music)" },
  { value: "s2t", label: "s2t (Speech to Text)" },
  { value: "t2s", label: "t2s (Text to Speech)" },
  { value: "a2a", label: "a2a (Audio to Audio)" },
  { value: "chat", label: "Chat" },
  { value: "other", label: "Other" },
];

const INPUT_FIELD_TYPE_OPTIONS: Array<{ value: InputFieldType; label: string }> = [
  { value: "select", label: "Select" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "array", label: "Array (string[])" },
  { value: "image_urls", label: "Image URLs" },
  { value: "video_urls", label: "Video URLs" },
  { value: "audio_urls", label: "Audio URLs" },
];

function createDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyInputFieldDraft(): InputFieldDraft {
  return {
    id: createDraftId("field"),
    key: "",
    label: "",
    type: "text",
    defaultRaw: "",
    defaultBoolean: false,
    required: false,
    affectsPricing: false,
    options: [],
  };
}

function createEmptyPricingTierDraft(defaultCost = 10): PricingTierDraft {
  return {
    id: createDraftId("tier"),
    key: "default",
    value: String(defaultCost),
  };
}

function parseInputFieldDrafts(value: unknown): InputFieldDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = (item && typeof item === "object") ? (item as Record<string, unknown>) : {};
    const rawType = String(record.type || "text");
    const type: InputFieldType = INPUT_FIELD_TYPE_OPTIONS.some((option) => option.value === rawType)
      ? (rawType as InputFieldType)
      : "text";
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options: InputFieldOptionDraft[] = rawOptions.map((option) => {
      const optionRecord = (option && typeof option === "object") ? (option as Record<string, unknown>) : {};
      return {
        id: createDraftId("opt"),
        value: String(optionRecord.value ?? ""),
        label: String(optionRecord.label ?? optionRecord.value ?? ""),
      };
    });
    return {
      id: createDraftId("field"),
      key: String(record.key ?? ""),
      label: String(record.label ?? record.key ?? ""),
      type,
      defaultRaw: record.default === undefined || record.default === null ? "" : String(record.default),
      defaultBoolean: Boolean(record.default),
      required: Boolean(record.required),
      affectsPricing: Boolean(record.affectsPricing),
      options,
    };
  });
}

function parsePricingTierDrafts(value: unknown, defaultCost = 10): PricingTierDraft[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [createEmptyPricingTierDraft(defaultCost)];
  }

  const tiers = Object.entries(value as Record<string, unknown>).map(([key, tierValue]) => ({
    id: createDraftId("tier"),
    key,
    value: String(tierValue ?? ""),
  }));
  return tiers.length > 0 ? tiers : [createEmptyPricingTierDraft(defaultCost)];
}

function serializeInputFieldDrafts(drafts: InputFieldDraft[]): { fields: Record<string, unknown>[]; errors: string[] } {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const fields: Record<string, unknown>[] = [];

  for (const draft of drafts) {
    const key = draft.key.trim();
    const label = draft.label.trim();
    if (!key && !label) {
      continue;
    }
    if (!key) {
      errors.push("Each input field must have a key.");
      continue;
    }
    if (!label) {
      errors.push(`Input field "${key}" must have a label.`);
      continue;
    }
    if (seenKeys.has(key)) {
      errors.push(`Duplicate input field key "${key}".`);
      continue;
    }
    seenKeys.add(key);

    const nextField: Record<string, unknown> = {
      key,
      label,
      type: draft.type,
    };

    if (draft.required) {
      nextField.required = true;
    }
    if (draft.affectsPricing) {
      nextField.affectsPricing = true;
    }

    if (draft.type === "select") {
      const options = draft.options
        .map((option) => ({
          value: option.value.trim(),
          label: option.label.trim(),
        }))
        .filter((option) => option.value.length > 0 || option.label.length > 0)
        .map((option) => ({
          value: option.value,
          label: option.label || option.value,
        }));
      if (options.length === 0) {
        errors.push(`Select field "${key}" must define at least one option.`);
        continue;
      }
      nextField.options = options;

      const defaultValue = draft.defaultRaw.trim();
      if (defaultValue) {
        nextField.default = defaultValue;
      }
    } else if (draft.type === "boolean") {
      nextField.default = draft.defaultBoolean;
    } else if (draft.type === "number") {
      const defaultValue = draft.defaultRaw.trim();
      if (defaultValue.length > 0) {
        const parsed = Number(defaultValue);
        if (Number.isFinite(parsed)) {
          nextField.default = parsed;
        } else {
          errors.push(`Number field "${key}" has invalid default value "${defaultValue}".`);
          continue;
        }
      }
    } else if (draft.type === "array") {
      // No default — actual items are provided at runtime by the user
    } else {
      const defaultValue = draft.defaultRaw.trim();
      if (defaultValue.length > 0) {
        nextField.default = defaultValue;
      }
    }

    fields.push(nextField);
  }

  return { fields, errors };
}

function serializePricingTierDrafts(
  drafts: PricingTierDraft[],
  fallbackCost: number,
): { tiers: Record<string, number>; errors: string[] } {
  const errors: string[] = [];
  const tiers: Record<string, number> = {};

  for (const draft of drafts) {
    const key = draft.key.trim();
    const valueRaw = draft.value.trim();
    if (!key && !valueRaw) {
      continue;
    }
    if (!key) {
      errors.push("Each pricing tier must have a key.");
      continue;
    }
    const numericValue = Number(valueRaw);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      errors.push(`Pricing tier "${key}" must have a valid non-negative number.`);
      continue;
    }
    tiers[key] = numericValue;
  }

  if (Object.keys(tiers).length === 0) {
    tiers.default = Math.max(0, fallbackCost || 0);
  }

  return { tiers, errors };
}

function normalizeOperationType(value: unknown): MediaOperationType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const direct = MEDIA_OPERATION_OPTIONS.find((item) => item.value === normalized);
  if (direct) {
    return direct.value;
  }

  const aliasMap: Record<string, MediaOperationType> = {
    "text-to-image": "t2i",
    "image-to-image": "i2i",
    "text-to-video": "t2v",
    "image-to-video": "i2v",
    "video-to-video": "v2v",
    "video-extend": "v2v",
    "text-to-music": "t2m",
    "speech-to-text": "s2t",
    "text-to-speech": "t2s",
    "audio-to-audio": "a2a",
  };
  return aliasMap[normalized] || null;
}

function inferOperationTypeFromModel(model: Pick<MediaModel, "modelType" | "modelId" | "configJson">): MediaOperationType {
  const config = (model.configJson && typeof model.configJson === "object") ? model.configJson : {};
  const fromConfig = normalizeOperationType((config as any).operationType);
  if (fromConfig) {
    return fromConfig;
  }

  const generateType = normalizeOperationType((config as any).generateType);
  if (generateType) {
    return generateType;
  }

  const modelId = String(model.modelId || "").toLowerCase();
  if (modelId.includes("upscale")) {
    return "upscale";
  }
  if (modelId.includes("speech-to-text") || modelId.includes("stt")) {
    return "s2t";
  }
  if (modelId.includes("text-to-speech") || modelId.includes("tts")) {
    return "t2s";
  }

  if (model.modelType === "image") {
    const hasImageInput = Array.isArray((config as any).inputFields)
      && ((config as any).inputFields as Array<any>).some((field) => String(field?.type || "").toLowerCase() === "image_urls");
    return hasImageInput ? "i2i" : "t2i";
  }
  if (model.modelType === "video") {
    const hasImageInput = Array.isArray((config as any).inputFields)
      && ((config as any).inputFields as Array<any>).some((field) => String(field?.type || "").toLowerCase() === "image_urls");
    const hasVideoInput = Array.isArray((config as any).inputFields)
      && ((config as any).inputFields as Array<any>).some((field) => String(field?.type || "").toLowerCase() === "video_urls");
    if (hasVideoInput) {
      return "v2v";
    }
    if (hasImageInput) {
      return "i2v";
    }
    return "t2v";
  }
  if (model.modelType === "audio") {
    if (modelId.includes("music")) {
      return "t2m";
    }
    if (modelId.includes("speech-to-text") || modelId.includes("stt")) {
      return "s2t";
    }
    if (modelId.includes("text-to-speech") || modelId.includes("tts")) {
      return "t2s";
    }
    if (modelId.includes("audio-to-audio")) {
      return "a2a";
    }
    return "t2s";
  }

  return "other";
}

function getOperationTypeLabel(value: MediaOperationType): string {
  return MEDIA_OPERATION_OPTIONS.find((item) => item.value === value)?.label || value;
}

const API_CONFIG_PRESETS: ApiConfigPreset[] = [
  {
    id: "sora2_text_video",
    label: "Sora2 Text-to-Video",
    description: "KIE Sora2 text-to-video with n_frames + aspect ratio + watermark controls.",
    pricingFormula: "per_duration",
    inputFields: [
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: [
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
        default: "landscape",
      },
      {
        key: "n_frames",
        label: "Frame Count",
        type: "select",
        options: [
          { value: "10", label: "10s" },
          { value: "15", label: "15s" },
        ],
        default: "10",
        affectsPricing: true,
      },
      {
        key: "remove_watermark",
        label: "Remove Watermark",
        type: "boolean",
        default: true,
      },
      {
        key: "upload_method",
        label: "Upload Method",
        type: "select",
        options: [
          { value: "s3", label: "S3" },
          { value: "oss", label: "OSS" },
        ],
        default: "s3",
      },
    ],
    pricingTiers: {
      "10": 75,
      "15": 150,
    },
  },
  {
    id: "veo31_text_video",
    label: "Veo 3.1 Text-to-Video",
    description: "Simple Veo setup with aspect ratio selector and flat credits.",
    pricingFormula: "flat",
    inputFields: [
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: [
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ],
        default: "16:9",
      },
    ],
    pricingTiers: {
      default: 2000,
    },
  },
  {
    id: "kling_text_video",
    label: "Kling Text-to-Video",
    description: "Matrix pricing by resolution + duration with optional aspect ratio.",
    pricingFormula: "matrix",
    inputFields: [
      {
        key: "duration",
        label: "Duration",
        type: "select",
        options: [
          { value: "5", label: "5s" },
          { value: "10", label: "10s" },
        ],
        default: "5",
        affectsPricing: true,
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
        default: "720p",
        affectsPricing: true,
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: [
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ],
        default: "16:9",
      },
    ],
    pricingTiers: {
      "720p-5s": 100,
      "720p-10s": 200,
      "1080p-5s": 150,
      "1080p-10s": 300,
    },
  },
];

const DEFAULT_FORM_DATA: FormData = {
  modelId: "",
  name: "",
  description: "",
  modelType: "image",
  provider: "kie.ai",
  aliases: "",
  creditCost: 10,
  aspectRatios: "",
  sizes: "",
  durations: "",
  voices: "",
  isEnabled: true,
  priority: 99,
  apiEndpoint: "/api/v1/jobs/createTask",
  apiQueryEndpoint: "",
  apiPayloadFormat: "market",
  kieModelId: "",
  pricingFormula: "flat",
  operationType: "other",
  generateType: "",
  maxPromptLength: 2000,
  inputFieldDrafts: [],
  pricingTierDrafts: [createEmptyPricingTierDraft(10)],
};

export default function AdminMediaModels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [editingModel, setEditingModel] = useState<MediaModel | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MediaModel | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");

  // Wait for the user to pause typing before querying to avoid per-character fetch churn.
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const normalizedSearch = debouncedSearch.trim();
  const searchFilter = normalizedSearch.length >= MIN_SEARCH_LENGTH
    ? normalizedSearch
    : undefined;

  // Form state
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  // Store original configJson when duplicating to preserve extra fields
  const [duplicateSourceConfig, setDuplicateSourceConfig] = useState<Record<string, any> | null>(null);

  // Check auth
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // Queries using tRPC hooks (use debounced search to prevent focus loss)
  const { data: models = [], isLoading, refetch } = trpc.mediaModels.adminList.useQuery(
    {
      search: searchFilter,
      type: typeFilter !== "all" ? (typeFilter as "image" | "video" | "audio") : undefined,
      includeDisabled: true,
    },
    {
      enabled: !!user && user.role === "admin",
    }
  );

  const { data: stats } = trpc.mediaModels.stats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const visibleModels = useMemo(
    () => models.filter((model: MediaModel) => (
      operationFilter === "all" || inferOperationTypeFromModel(model) === operationFilter
    )),
    [models, operationFilter],
  );

  const {
    data: runtimeCounters,
    isFetching: isRuntimeCountersRefreshing,
    refetch: refetchRuntimeCounters,
  } = trpc.mediaModels.runtimeCounters.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // Mutations
  const createMutation = trpc.mediaModels.create.useMutation({
    onSuccess: (data) => {
      // Close dialog and reset form FIRST before refetching
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Model created", {
        description: `${data.name} has been added successfully.`,
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to create model", {
        description: error.message,
      });
    },
  });

  const updateMutation = trpc.mediaModels.update.useMutation({
    onSuccess: (data) => {
      setEditingModel(null);
      resetForm();
      toast.success("Model updated", {
        description: `${data.name} has been updated successfully.`,
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update model", {
        description: error.message,
      });
    },
  });

  const deleteMutation = trpc.mediaModels.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      toast.success("Model deleted");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to delete model", {
        description: error.message,
      });
    },
  });

  const toggleEnabledMutation = trpc.mediaModels.toggleEnabled.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const resetRuntimeCountersMutation = trpc.mediaModels.resetRuntimeCounters.useMutation({
    onSuccess: () => {
      toast.success("Runtime counters reset");
      refetchRuntimeCounters();
    },
    onError: (error) => {
      toast.error("Failed to reset runtime counters", {
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setActiveTab("basic");
    setDuplicateSourceConfig(null);
  };

  const handleEditModel = (model: MediaModel) => {
    setEditingModel(model);
    const cfg = model.configJson || {};
    setFormData({
      modelId: model.modelId,
      name: model.name,
      description: model.description || "",
      modelType: model.modelType,
      provider: model.provider,
      aliases: (model.aliases || []).join(", "),
      creditCost: model.creditCost,
      aspectRatios: (model.aspectRatios || []).join(", "),
      sizes: (model.sizes || []).join(", "),
      durations: (model.durations || []).join(", "),
      voices: (model.voices || []).join(", "),
      isEnabled: model.isEnabled,
      priority: model.priority,
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint: cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      pricingFormula: cfg.pricingFormula || "flat",
      operationType: inferOperationTypeFromModel(model),
      generateType: cfg.generateType || "",
      maxPromptLength: cfg.maxPromptLength || 2000,
      inputFieldDrafts: parseInputFieldDrafts(cfg.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(cfg.pricingTiers, model.creditCost),
    });
    setActiveTab("basic");
  };

  const handleDuplicateModel = (model: MediaModel) => {
    // Clone the model data but with modified modelId and clear editingModel to create new
    setEditingModel(null);
    const cfg = model.configJson || {};
    // Store original configJson to preserve extra fields when saving
    setDuplicateSourceConfig(cfg);
    setFormData({
      modelId: `${model.modelId}_copy`,
      name: `${model.name} (Copy)`,
      description: model.description || "",
      modelType: model.modelType,
      provider: model.provider,
      aliases: (model.aliases || []).join(", "),
      creditCost: model.creditCost,
      aspectRatios: (model.aspectRatios || []).join(", "),
      sizes: (model.sizes || []).join(", "),
      durations: (model.durations || []).join(", "),
      voices: (model.voices || []).join(", "),
      isEnabled: false, // Start disabled for safety
      priority: model.priority,
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint: cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      pricingFormula: cfg.pricingFormula || "flat",
      operationType: inferOperationTypeFromModel(model),
      generateType: cfg.generateType || "",
      maxPromptLength: cfg.maxPromptLength || 2000,
      inputFieldDrafts: parseInputFieldDrafts(cfg.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(cfg.pricingTiers, model.creditCost),
    });
    setActiveTab("basic");
    setIsCreateDialogOpen(true);
    toast.info("Model duplicated", {
      description: "Please modify the Model ID before saving.",
    });
  };

  const handleSave = () => {
    const aliases = formData.aliases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const aspectRatios = formData.aspectRatios
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = formData.sizes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const durations = formData.durations
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
    const voices = formData.voices
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const serializedInputFields = serializeInputFieldDrafts(formData.inputFieldDrafts);
    const serializedPricingTiers = serializePricingTierDrafts(formData.pricingTierDrafts, formData.creditCost);
    const parseErrors = [...serializedInputFields.errors, ...serializedPricingTiers.errors];

    // Show validation errors and abort save
    if (parseErrors.length > 0) {
      toast.error("Validation Error", {
        description: parseErrors.join(" | "),
        duration: 5000,
      });
      return;
    }

    const configJson: Record<string, any> = {
      apiEndpoint: formData.apiEndpoint,
      apiQueryEndpoint: formData.apiQueryEndpoint || undefined,
      apiPayloadFormat: formData.apiPayloadFormat,
      kieModelId: formData.kieModelId || undefined,
      pricingFormula: formData.pricingFormula,
      operationType: formData.operationType,
      generateType: formData.generateType || undefined,
      maxPromptLength: formData.maxPromptLength,
      inputFields: serializedInputFields.fields,
      pricingTiers: serializedPricingTiers.tiers,
    };

    if (editingModel) {
      // Preserve any extra configJson keys the seed script set
      const existing = editingModel.configJson || {};
      const merged = { ...existing, ...configJson };
      updateMutation.mutate({
        id: editingModel.id,
        modelId: formData.modelId,
        name: formData.name,
        description: formData.description || null,
        modelType: formData.modelType,
        provider: formData.provider,
        aliases,
        creditCost: formData.creditCost,
        aspectRatios: aspectRatios.length > 0 ? aspectRatios : null,
        sizes: sizes.length > 0 ? sizes : null,
        durations: durations.length > 0 ? durations : null,
        voices: voices.length > 0 ? voices : null,
        configJson: merged,
        isEnabled: formData.isEnabled,
        priority: formData.priority,
      });
    } else {
      // If duplicating, merge original configJson to preserve extra fields
      const finalConfigJson = duplicateSourceConfig
        ? { ...duplicateSourceConfig, ...configJson }
        : configJson;
      createMutation.mutate({
        modelId: formData.modelId,
        name: formData.name,
        description: formData.description || undefined,
        modelType: formData.modelType,
        provider: formData.provider,
        aliases,
        creditCost: formData.creditCost,
        aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined,
        sizes: sizes.length > 0 ? sizes : undefined,
        durations: durations.length > 0 ? durations : undefined,
        voices: voices.length > 0 ? voices : undefined,
        configJson: finalConfigJson,
        isEnabled: formData.isEnabled,
        priority: formData.priority,
      });
    }
  };

  const getModelTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      default:
        return <Layers className="h-4 w-4" />;
    }
  };

  const getModelTypeBadgeColor = (type: string) => {
    switch (type) {
      case "image":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "video":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "audio":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" className="mb-4" onClick={() => setLocation("/dashboard")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              Media AI Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage AI models for image, video, and audio generation skills
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Model
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enabled</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.enabled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Image</CardTitle>
              <Image className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.image}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Video</CardTitle>
              <Video className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.video}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audio</CardTitle>
              <Music className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.audio}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Runtime Counters */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600" />
                Runtime Counter Observability
              </CardTitle>
              <CardDescription>
                Live counters for DB default selection and fallback behavior (auto-refresh every 5 seconds)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchRuntimeCounters()}
                disabled={isRuntimeCountersRefreshing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRuntimeCountersRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resetRuntimeCountersMutation.mutate()}
                disabled={resetRuntimeCountersMutation.isPending}
              >
                <RotateCcw className={`mr-2 h-4 w-4 ${resetRuntimeCountersMutation.isPending ? "animate-spin" : ""}`} />
                Reset Counters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!runtimeCounters ? (
            <div className="text-sm text-muted-foreground">Loading runtime counters...</div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Last sample: {new Date(runtimeCounters.generatedAt).toLocaleString()} | Total fallback hits:{" "}
                <span className="font-semibold text-amber-600">{runtimeCounters.fallbackTotal}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Default Resolution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>defaultFromDb</span>
                      <span className="font-semibold">{runtimeCounters.mediaLookup.defaultFromDb}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>defaultFallbackStatic</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.defaultFallbackStatic}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRejected</span>
                      <span className="font-semibold">{runtimeCounters.mediaLookup.unknownModelRejected}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">DB Lookup Fallback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>pricingDbMissFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.pricingDbMissFallback}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>metadataDbMissFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.metadataDbMissFallback}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerDefaultFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaResolution.providerDefaultFallback}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-violet-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Provider & Registry</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>providerFromApiConfig</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.providerFromApiConfig}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerFromStaticRegistry</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.providerFromStaticRegistry}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRequests</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.unknownModelRequests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.staticFallbackHits</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.modelRegistry.staticFallbackHits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.cacheHits</span>
                      <span className="font-semibold">{runtimeCounters.modelRegistry.cacheHits}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Search starts after you pause typing for ~0.9s (min 2 characters).
              </p>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
              </SelectContent>
            </Select>
            <Select value={operationFilter} onValueChange={setOperationFilter}>
              <SelectTrigger className="w-[220px]">
                <Layers className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                {MEDIA_OPERATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Models List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Models</CardTitle>
          <CardDescription>
            These models are available for image, video, and audio generation skills. Users can
            specify model names in their prompts (e.g., "generate image with flux 2.0").
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No models found</p>
              <p className="text-sm">Try changing your filters or add a new model</p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Model
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleModels.map((model: any, index: number) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          {getModelTypeIcon(model.modelType)}
                        </div>
                        <div>
                          <div className="font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {model.modelId}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getModelTypeBadgeColor(model.modelType)}>
                        {model.modelType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getOperationTypeLabel(inferOperationTypeFromModel(model))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{model.provider}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Coins className="h-3 w-3 text-amber-500" />
                        <span className="font-medium">{model.creditCost}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(model.aliases || []).slice(0, 2).map((alias: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {alias}
                          </Badge>
                        ))}
                        {(model.aliases || []).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(model.aliases || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {model.isEnabled ? (
                        <Badge variant="default" className="bg-green-500">
                          <Check className="mr-1 h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <X className="mr-1 h-3 w-3" />
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEnabledMutation.mutate({ id: model.id })}
                          disabled={toggleEnabledMutation.isPending}
                        >
                          {model.isEnabled ? (
                            <XCircle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditModel(model)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateModel(model)}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(model)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Model Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add AI Model</DialogTitle>
            <DialogDescription>
              Add a new AI model for generation skills
            </DialogDescription>
          </DialogHeader>

          <ModelForm formData={formData} setFormData={setFormData} activeTab={activeTab} setActiveTab={setActiveTab} />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || !formData.modelId || !formData.name}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Model Dialog */}
      <Dialog open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Model - {editingModel?.name}</DialogTitle>
            <DialogDescription>Update model configuration and aliases</DialogDescription>
          </DialogHeader>

          <ModelForm formData={formData} setFormData={setFormData} activeTab={activeTab} setActiveTab={setActiveTab} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !formData.modelId || !formData.name}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
              This action cannot be undone and may affect skill detection for this model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm.id })}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Model Form Component
function ModelForm({
  formData,
  setFormData,
  activeTab,
  setActiveTab,
}: {
  formData: FormData;
  setFormData: (data: FormData) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("none");
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);

  const applyApiConfigPreset = () => {
    if (selectedPresetId === "none") {
      return;
    }
    const preset = API_CONFIG_PRESETS.find((item) => item.id === selectedPresetId);
    if (!preset) {
      return;
    }
    setFormData({
      ...formData,
      pricingFormula: preset.pricingFormula,
      inputFieldDrafts: parseInputFieldDrafts(preset.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(preset.pricingTiers, formData.creditCost),
    });
    toast.success(`Applied preset: ${preset.label}`);
  };

  const reorderInputFieldDrafts = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }
    const fromIndex = formData.inputFieldDrafts.findIndex((field) => field.id === fromId);
    const toIndex = formData.inputFieldDrafts.findIndex((field) => field.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const next = [...formData.inputFieldDrafts];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    next.splice(toIndex, 0, moved);
    setFormData({
      ...formData,
      inputFieldDrafts: next,
    });
  };

  const updateInputFieldDraft = (fieldId: string, patch: Partial<InputFieldDraft>) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map((field) => (
        field.id === fieldId ? { ...field, ...patch } : field
      )),
    });
  };

  const removeInputFieldDraft = (fieldId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.filter((field) => field.id !== fieldId),
    });
  };

  const addInputFieldDraft = () => {
    setFormData({
      ...formData,
      inputFieldDrafts: [...formData.inputFieldDrafts, createEmptyInputFieldDraft()],
    });
  };

  const addInputFieldOption = (fieldId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map((field) => (
        field.id === fieldId
          ? {
              ...field,
              type: field.type === "select" ? field.type : "select",
              options: [...field.options, { id: createDraftId("opt"), value: "", label: "" }],
            }
          : field
      )),
    });
  };

  const updateInputFieldOption = (
    fieldId: string,
    optionId: string,
    patch: Partial<InputFieldOptionDraft>,
  ) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map((field) => (
        field.id === fieldId
          ? {
              ...field,
              options: field.options.map((option) => (
                option.id === optionId ? { ...option, ...patch } : option
              )),
            }
          : field
      )),
    });
  };

  const removeInputFieldOption = (fieldId: string, optionId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map((field) => (
        field.id === fieldId
          ? {
              ...field,
              options: field.options.filter((option) => option.id !== optionId),
            }
          : field
      )),
    });
  };

  const updatePricingTierDraft = (tierId: string, patch: Partial<PricingTierDraft>) => {
    setFormData({
      ...formData,
      pricingTierDrafts: formData.pricingTierDrafts.map((tier) => (
        tier.id === tierId ? { ...tier, ...patch } : tier
      )),
    });
  };

  const removePricingTierDraft = (tierId: string) => {
    setFormData({
      ...formData,
      pricingTierDrafts: formData.pricingTierDrafts.filter((tier) => tier.id !== tierId),
    });
  };

  const addPricingTierDraft = () => {
    setFormData({
      ...formData,
      pricingTierDrafts: [...formData.pricingTierDrafts, { id: createDraftId("tier"), key: "", value: "" }],
    });
  };

  const inputFieldPreview = JSON.stringify(
    serializeInputFieldDrafts(formData.inputFieldDrafts).fields,
    null,
    2,
  );
  const pricingTierPreview = JSON.stringify(
    serializePricingTierDrafts(formData.pricingTierDrafts, formData.creditCost).tiers,
    null,
    2,
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="aliases">Aliases</TabsTrigger>
        <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
        <TabsTrigger value="apiConfig">API Config</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="modelId">Model ID *</Label>
              <Input
                id="modelId"
                value={formData.modelId}
                onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                placeholder="e.g., google-nano-banana-pro"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier used in API calls
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Display Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Google Nano Banana Pro"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the model..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="modelType">Model Type *</Label>
              <Select
                value={formData.modelType}
                onValueChange={(value: "image" | "video" | "audio") =>
                  setFormData({ ...formData, modelType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Video
                    </div>
                  </SelectItem>
                  <SelectItem value="audio">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Audio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                placeholder="e.g., kie.ai"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="creditCost">Credit Cost</Label>
              <Input
                id="creditCost"
                type="number"
                min={0}
                value={formData.creditCost}
                onChange={(e) =>
                  setFormData({ ...formData, creditCost: parseInt(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Credits deducted per generation
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 99 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Lower = higher priority (default model)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow this model to be used for generation
              </p>
            </div>
            <Switch
              checked={formData.isEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="aliases" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="aliases">Model Aliases</Label>
            <Textarea
              id="aliases"
              value={formData.aliases}
              onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
              placeholder="nano banana pro, nano_banana_pro, google nano banana, gemini 3"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of aliases for natural language detection. Users can mention
              any of these in their prompts to use this model.
            </p>
          </div>

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Example Usage</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="mb-2">With these aliases, users can say:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>"Generate image of a cat with <strong>nano banana pro</strong>"</li>
                <li>"Create a video using <strong>veo 3</strong>"</li>
                <li>"Create an image with <strong>flux 2.0</strong>"</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="capabilities" className="space-y-4 mt-4">
        <div className="grid gap-4">
          {(formData.modelType === "image" || formData.modelType === "video") && (
            <div className="grid gap-2">
              <Label htmlFor="aspectRatios">Supported Aspect Ratios</Label>
              <Input
                id="aspectRatios"
                value={formData.aspectRatios}
                onChange={(e) => setFormData({ ...formData, aspectRatios: e.target.value })}
                placeholder="1:1, 16:9, 9:16, 4:3"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported aspect ratios
              </p>
            </div>
          )}

          {formData.modelType === "image" && (
            <div className="grid gap-2">
              <Label htmlFor="sizes">Supported Sizes</Label>
              <Input
                id="sizes"
                value={formData.sizes}
                onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                placeholder="1024x1024, 1024x1792, 1792x1024"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported output sizes
              </p>
            </div>
          )}

          {formData.modelType === "video" && (
            <div className="grid gap-2">
              <Label htmlFor="durations">Supported Durations (seconds)</Label>
              <Input
                id="durations"
                value={formData.durations}
                onChange={(e) => setFormData({ ...formData, durations: e.target.value })}
                placeholder="5, 10, 15, 20"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported video durations in seconds
              </p>
            </div>
          )}

          {formData.modelType === "audio" && (
            <div className="grid gap-2">
              <Label htmlFor="voices">Available Voices</Label>
              <Textarea
                id="voices"
                value={formData.voices}
                onChange={(e) => setFormData({ ...formData, voices: e.target.value })}
                placeholder="alloy, echo, fable, onyx, nova, shimmer"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of available voice options
              </p>
            </div>
          )}

          {formData.modelType !== "audio" &&
            formData.modelType !== "video" &&
            formData.modelType !== "image" && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Select a model type to see capability options</p>
              </div>
            )}
        </div>
      </TabsContent>

      <TabsContent value="apiConfig" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="apiEndpoint">API Endpoint</Label>
              <Input
                id="apiEndpoint"
                value={formData.apiEndpoint}
                onChange={(e) => setFormData({ ...formData, apiEndpoint: e.target.value })}
                placeholder="e.g., /api/v1/veo/generate"
              />
              <p className="text-xs text-muted-foreground">
                Full endpoint path from provider API documentation
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiPayloadFormat">Payload Format</Label>
              <Input
                id="apiPayloadFormat"
                value={formData.apiPayloadFormat}
                onChange={(e) => setFormData({ ...formData, apiPayloadFormat: e.target.value })}
                placeholder="e.g., veo, market, runway"
              />
              <p className="text-xs text-muted-foreground">
                Payload structure identifier for backend
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiQueryEndpoint">Query Endpoint (Status/Result)</Label>
            <Input
              id="apiQueryEndpoint"
              value={formData.apiQueryEndpoint}
              onChange={(e) => setFormData({ ...formData, apiQueryEndpoint: e.target.value })}
              placeholder="e.g., /api/v1/veo/record-info?taskId={task_id}"
            />
            <p className="text-xs text-muted-foreground">
              Optional per-model endpoint used for Fetch Result. Supports {"{task_id}"} placeholder.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kieModelId">Kie Model ID</Label>
              <Input
                id="kieModelId"
                value={formData.kieModelId}
                onChange={(e) => setFormData({ ...formData, kieModelId: e.target.value })}
                placeholder="e.g., wan/2-6-text-to-video"
              />
              <p className="text-xs text-muted-foreground">
                Model identifier sent to Kie AI API
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generateType">Generate Type</Label>
              <Input
                id="generateType"
                value={formData.generateType}
                onChange={(e) => setFormData({ ...formData, generateType: e.target.value })}
                placeholder="e.g., text-to-video, image-to-video"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxPromptLength">Max Prompt Length</Label>
              <Input
                id="maxPromptLength"
                type="number"
                value={formData.maxPromptLength}
                onChange={(e) => setFormData({ ...formData, maxPromptLength: parseInt(e.target.value) || 2000 })}
                placeholder="2000"
              />
              <p className="text-xs text-muted-foreground">
                Maximum characters allowed for prompts. Shows warning in Media Studio when exceeded.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pricingFormula">Pricing Formula</Label>
            <Select
              value={formData.pricingFormula}
              onValueChange={(value) => setFormData({ ...formData, pricingFormula: value })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat (single price or by resolution)</SelectItem>
                <SelectItem value="per_duration">Per Duration (5s, 10s...)</SelectItem>
                <SelectItem value="matrix">Matrix (resolution x duration)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="operationType">Operation Type</Label>
            <Select
              value={formData.operationType}
              onValueChange={(value: MediaOperationType) => setFormData({ ...formData, operationType: value })}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_OPERATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for fast filtering and selecting the correct model capability (t2i/i2i/t2v/etc.).
            </p>
          </div>

          <div className="grid gap-2 rounded-md border border-slate-200 p-3">
            <Label className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-600" />
              Quick Presets
            </Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                <SelectTrigger className="md:flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Custom (no preset)</SelectItem>
                  {API_CONFIG_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={applyApiConfigPreset} disabled={selectedPresetId === "none"}>
                Apply Preset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Apply a starter template for popular models. This replaces Input Fields and Pricing Tiers with preset values.
            </p>
            {selectedPresetId !== "none" ? (
              <p className="text-xs text-slate-600">
                {API_CONFIG_PRESETS.find((preset) => preset.id === selectedPresetId)?.description}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Pricing Tiers</Label>
              <Button type="button" size="sm" variant="outline" onClick={addPricingTierDraft}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Tier
              </Button>
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              {formData.pricingTierDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pricing tiers. System will save a default tier automatically.</p>
              ) : (
                formData.pricingTierDrafts.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 p-2 md:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={tier.key}
                      onChange={(e) => updatePricingTierDraft(tier.id, { key: e.target.value })}
                      placeholder="Tier key (e.g., 720p-5s)"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={tier.value}
                      onChange={(e) => updatePricingTierDraft(tier.id, { value: e.target.value })}
                      placeholder="Credits"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePricingTierDraft(tier.id)}
                      aria-label="Remove pricing tier"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Define tier key and credit cost. Example keys: "default", "5s", "720p-10s". Affects pricing is controlled by input fields.
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Input Fields</Label>
              <Button type="button" size="sm" variant="outline" onClick={addInputFieldDraft}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Field
              </Button>
            </div>
            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              {formData.inputFieldDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No dynamic fields configured yet.</p>
              ) : (
                formData.inputFieldDrafts.map((field, fieldIndex) => (
                  <div
                    key={field.id}
                    className={`space-y-3 rounded-md border p-3 ${dragOverFieldId === field.id ? "border-sky-400 bg-sky-50/50" : "border-slate-100"}`}
                    onDragOver={(event) => {
                      if (!draggingFieldId) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragOverFieldId !== field.id) {
                        setDragOverFieldId(field.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = draggingFieldId || event.dataTransfer.getData("text/plain");
                      if (sourceId) {
                        reorderInputFieldDrafts(sourceId, field.id);
                      }
                      setDraggingFieldId(null);
                      setDragOverFieldId(null);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="cursor-grab active:cursor-grabbing"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", field.id);
                            setDraggingFieldId(field.id);
                          }}
                          onDragEnd={() => {
                            setDraggingFieldId(null);
                            setDragOverFieldId(null);
                          }}
                          aria-label="Drag to reorder field"
                        >
                          <GripVertical className="h-4 w-4 text-slate-500" />
                        </Button>
                        <p className="text-sm font-medium">Field #{fieldIndex + 1}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInputFieldDraft(field.id)}
                        aria-label="Remove input field"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <Input
                        value={field.key}
                        onChange={(e) => updateInputFieldDraft(field.id, { key: e.target.value })}
                        placeholder="key (e.g., duration)"
                      />
                      <Input
                        value={field.label}
                        onChange={(e) => updateInputFieldDraft(field.id, { label: e.target.value })}
                        placeholder="label (e.g., Duration)"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <Select
                        value={field.type}
                        onValueChange={(value) => updateInputFieldDraft(field.id, { type: value as InputFieldType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INPUT_FIELD_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Required</span>
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) => updateInputFieldDraft(field.id, { required: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Affects Pricing</span>
                        <Switch
                          checked={field.affectsPricing}
                          onCheckedChange={(checked) => updateInputFieldDraft(field.id, { affectsPricing: checked })}
                        />
                      </div>
                    </div>

                    {field.type === "boolean" ? (
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Default Value</span>
                        <Switch
                          checked={field.defaultBoolean}
                          onCheckedChange={(checked) => updateInputFieldDraft(field.id, { defaultBoolean: checked })}
                        />
                      </div>
                    ) : field.type === "array" ? (
                      <p className="text-xs text-muted-foreground italic">
                        Values are provided at runtime — no default needed.
                      </p>
                    ) : field.type === "select" ? (
                      <div className="space-y-2 rounded-md border border-slate-100 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Options</span>
                          <Button type="button" size="sm" variant="outline" onClick={() => addInputFieldOption(field.id)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Option
                          </Button>
                        </div>
                        {field.options.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No options yet.</p>
                        ) : (
                          field.options.map((option) => (
                            <div key={option.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <Input
                                value={option.value}
                                onChange={(e) => updateInputFieldOption(field.id, option.id, { value: e.target.value })}
                                placeholder="value (e.g., 10)"
                              />
                              <Input
                                value={option.label}
                                onChange={(e) => updateInputFieldOption(field.id, option.id, { label: e.target.value })}
                                placeholder="label (e.g., 10s)"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeInputFieldOption(field.id, option.id)}
                                aria-label="Remove option"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))
                        )}

                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">Default Option</Label>
                          <Select
                            value={
                              field.options.some(
                                (option) => option.value === field.defaultRaw && option.value.trim().length > 0,
                              )
                                ? field.defaultRaw
                                : "__none__"
                            }
                            onValueChange={(value) => updateInputFieldDraft(field.id, { defaultRaw: value === "__none__" ? "" : value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select default option" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No default</SelectItem>
                              {field.options
                                .filter((option) => option.value.trim().length > 0)
                                .map((option) => (
                                <SelectItem key={option.id} value={option.value}>
                                  {option.label.trim() || option.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Default Value</Label>
                        <Input
                          type={field.type === "number" ? "number" : "text"}
                          value={field.defaultRaw}
                          onChange={(e) => updateInputFieldDraft(field.id, { defaultRaw: e.target.value })}
                          placeholder={field.type === "number" ? "0" : "Default value"}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Fill fields in form mode, drag by the handle to reorder, and system converts everything to valid JSON automatically.
            </p>
          </div>

          <Card className="bg-slate-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Code className="h-4 w-4" />
                Generated JSON Preview (read-only)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">pricingTiers</Label>
                <Textarea value={pricingTierPreview} readOnly rows={4} className="font-mono text-xs bg-white" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">inputFields</Label>
                <Textarea value={inputFieldPreview} readOnly rows={8} className="font-mono text-xs bg-white" />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
