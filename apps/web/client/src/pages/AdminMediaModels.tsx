import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "../lib/trpc";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getModelGenerationModeLabel } from "@/lib/mediaModelInputs";
import {
  getMediaModelTransportLabel,
  resolveMediaModelTransportConfig,
} from "@shared/mediaModelTransport";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
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
  ChevronDown,
  CheckCircle2,
  XCircle,
  Coins,
  GripVertical,
  Settings2,
  Code,
  Activity,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Server,
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
  providerReady?: boolean;
  providerReadiness?:
    | "ready"
    | "provider_not_found"
    | "provider_disabled"
    | "missing_api_key"
    | "test_failed";
  providerReadinessMessage?: string | null;
  providerDisplayName?: string | null;
  providerConfigFound?: boolean;
  priority: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface MediaModelTemplate {
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
  providerReady?: boolean;
  providerReadiness?:
    | "ready"
    | "provider_not_found"
    | "provider_disabled"
    | "missing_api_key"
    | "test_failed";
  providerReadinessMessage?: string | null;
  providerDisplayName?: string | null;
  providerConfigFound?: boolean;
  priority: number;
  sortOrder: number;
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
  storyboardClipDurationSeconds: string;
  voices: string;
  isEnabled: boolean;
  priority: number;
  // API Config (configJson)
  transport: "gateway_api" | "mcp";
  providerModelId: string;
  mcpProviderKey: string;
  mcpToolName: string;
  mcpArgumentShape: string;
  apiEndpoint: string;
  apiQueryEndpoint: string;
  apiPayloadFormat: string;
  kieModelId: string;
  apiConfigRaw: string;
  pricingFormula: string;
  pricingUnitMetric: "characters" | "items";
  pricingUnitField: string;
  pricingUnitSize: number;
  pricingUnitRounding: "ceil" | "floor" | "round";
  pricingMinUnits: number;
  operationType: MediaOperationType;
  generateType: string;
  maxPromptLength: number;
  inputFieldDrafts: InputFieldDraft[];
  pricingTierDrafts: PricingTierDraft[];
}

const SEARCH_DEBOUNCE_MS = 900;
const MIN_SEARCH_LENGTH = 2;

function readPositiveConfigNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

type InputFieldType =
  | "select"
  | "text"
  | "number"
  | "boolean"
  | "image_urls"
  | "video_urls"
  | "audio_urls"
  | "array"
  | "library_file"
  | "provider_asset_picker";
type SyncTarget =
  | "none"
  | "reference_images"
  | "reference_videos"
  | "prompt"
  | "aspect_ratio";
type MediaOperationType =
  | "t2i"
  | "i2i"
  | "t2v"
  | "i2v"
  | "v2v"
  | "upscale"
  | "t2m"
  | "s2t"
  | "t2s"
  | "a2a"
  | "chat"
  | "other";

interface InputFieldOptionDraft {
  id: string;
  value: string;
  label: string;
}

type InputFieldOptionsSourceType = "none" | "provider_api" | "public_api";

interface InputFieldDraft {
  id: string;
  key: string;
  label: string;
  type: InputFieldType;
  syncWith: SyncTarget;
  defaultRaw: string;
  defaultBoolean: boolean;
  required: boolean;
  affectsPricing: boolean;
  hidden: boolean;
  advancedOnly: boolean;
  managedBySuite: boolean;
  pricingAliases: string;
  pricingPresencePresent: string;
  pricingPresenceAbsent: string;
  searchable: boolean;
  assetType: string;
  assetCapability: string;
  providerPayloadKey: string;
  referenceUnitWeight: string;
  maxItems: string;
  options: InputFieldOptionDraft[];
  optionsSourceType: InputFieldOptionsSourceType;
  optionsSourceEndpoint: string;
  optionsSourceMethod: "GET" | "POST";
  optionsSourceItemsPath: string;
  optionsSourceValueField: string;
  optionsSourceLabelField: string;
  optionsSourceQueryParam: string;
  optionsSourceValueTransform: "none" | "before_dash";
  optionsSourceCacheTtlSeconds: string;
  optionsSourceHeadersRaw: string;
  optionsSourceBodyRaw: string;
  allowedExtensions: string; // comma-separated, e.g. "png,jpg" — only used for library_file type
  itemTemplateRaw: string; // JSON template for array item mapping
}

interface PricingTierDraft {
  id: string;
  key: string;
  value: string;
}

interface ParsedBulkOption {
  value: string;
  label: string;
}

interface ApiConfigPreset {
  id: string;
  label: string;
  description: string;
  pricingFormula: "flat" | "per_duration" | "matrix" | "per_unit";
  maxPromptLength: number;
  inputFields: Array<Record<string, unknown>>;
  pricingTiers: Record<string, number>;
}

const MEDIA_OPERATION_OPTIONS: Array<{
  value: MediaOperationType;
  label: string;
}> = [
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

const SYNC_TARGET_OPTIONS: Array<{ value: SyncTarget; label: string }> = [
  { value: "none", label: "No Sync" },
  { value: "reference_images", label: "Reference Images" },
  { value: "reference_videos", label: "Reference Videos" },
  { value: "prompt", label: "Prompt" },
  { value: "aspect_ratio", label: "Aspect Ratio" },
];

const VALID_SYNC_TARGETS = SYNC_TARGET_OPTIONS.map(o => o.value);

const INPUT_FIELD_TYPE_OPTIONS: Array<{
  value: InputFieldType;
  label: string;
}> = [
  { value: "select", label: "Select" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "array", label: "Array (string[])" },
  { value: "library_file", label: "Library File (picker)" },
  { value: "provider_asset_picker", label: "Provider Asset Picker" },
  { value: "image_urls", label: "Image URLs" },
  { value: "video_urls", label: "Video URLs" },
  { value: "audio_urls", label: "Audio URLs" },
];

function createDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLikelyVoiceId(value: string): boolean {
  return /^[A-Za-z0-9]{16,}$/.test(value.trim());
}

function normalizeOptionText(value: string): string {
  return value.replace(/\u00A0/g, " ").trim();
}

function parseBulkOptionsText(raw: string): ParsedBulkOption[] {
  const lines = raw.split(/\r?\n/).map(line => normalizeOptionText(line));
  const parsed: ParsedBulkOption[] = [];
  let pendingVoiceId: string | null = null;

  const pushOption = (valueRaw: string, labelRaw?: string) => {
    const value = normalizeOptionText(valueRaw);
    const label = normalizeOptionText(labelRaw ?? valueRaw);
    if (!value) return;
    parsed.push({ value, label: label || value });
  };

  for (const line of lines) {
    if (!line) continue;
    if (/^available voices:?$/i.test(line)) continue;

    const idWithLabel = line.match(/^([A-Za-z0-9]{16,})\s*-\s*(.+)$/);
    if (idWithLabel) {
      pushOption(idWithLabel[1], idWithLabel[2]);
      pendingVoiceId = null;
      continue;
    }

    if (isLikelyVoiceId(line)) {
      if (pendingVoiceId) {
        pushOption(pendingVoiceId);
      }
      pendingVoiceId = line;
      continue;
    }

    const bulletLabel = line.match(/^(?:[-*]\s*)(.+)$/);
    if (bulletLabel && pendingVoiceId) {
      pushOption(pendingVoiceId, bulletLabel[1]);
      pendingVoiceId = null;
      continue;
    }

    if (pendingVoiceId) {
      pushOption(pendingVoiceId, line.replace(/^(?:[-*]\s*)/, ""));
      pendingVoiceId = null;
      continue;
    }

    // Generic fallback for simple one-option-per-line input
    // Also supports comma-separated values in a single line.
    const plain = line.replace(/^(?:[-*]\s*)/, "").trim();
    if (plain) {
      const commaParts = plain
        .split(",")
        .map(part => normalizeOptionText(part))
        .filter(Boolean);
      if (commaParts.length > 1) {
        for (const part of commaParts) {
          pushOption(part, part);
        }
      } else {
        pushOption(plain, plain);
      }
    }
  }

  if (pendingVoiceId) {
    pushOption(pendingVoiceId);
  }

  const seen = new Set<string>();
  const deduped: ParsedBulkOption[] = [];
  for (const item of parsed) {
    const key = item.value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function splitDelimitedTextValues(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function parseVoiceCatalogValues(raw: string): ParsedBulkOption[] {
  const parsed = parseBulkOptionsText(raw);
  if (parsed.length > 0) {
    return parsed;
  }
  return splitDelimitedTextValues(raw).map(value => ({ value, label: value }));
}

function summarizeProviderReadinessMessage(
  message: string | null | undefined
): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;

  const apiErrorMatch = trimmed.match(/^API error:\s*(\d+)\s*-\s*(\{.*\})$/i);
  if (apiErrorMatch) {
    const [, statusCode, jsonPayload] = apiErrorMatch;
    try {
      const parsed = JSON.parse(jsonPayload) as {
        message?: string;
        path?: string;
        error?: string;
      };
      const suffix = parsed.path || parsed.message || parsed.error;
      return suffix ? `API ${statusCode} · ${suffix}` : `API ${statusCode}`;
    } catch {
      return `API ${statusCode}`;
    }
  }

  return trimmed;
}

function formatProviderDisplayName(provider: string | null | undefined): string {
  const normalized = String(provider ?? "").trim();
  if (!normalized) return "Unknown Provider";

  const knownNames: Record<string, string> = {
    "kie.ai": "Kie AI",
    kie_ai: "Kie AI",
    knplabai: "KNPLabs AI",
    knplabs: "KNPLabs AI",
    fal_ai: "fal.ai",
    wavespeed_ai: "WaveSpeed AI",
    byteplus_modelark: "BytePlus ModelArk",
    omnivoice: "OmniVoice",
    uvoice: "UVoice",
  };
  const lookupKey = normalized.toLowerCase();
  if (knownNames[lookupKey]) return knownNames[lookupKey];

  return normalized
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getProviderLabel(item: {
  provider: string;
  providerDisplayName?: string | null;
}): string {
  return item.providerDisplayName || formatProviderDisplayName(item.provider);
}

function getProviderReadinessDetail(item: {
  provider: string;
  providerReadiness?: MediaModel["providerReadiness"];
  providerReadinessMessage?: string | null;
}): string | null {
  if (item.providerReadiness === "provider_not_found") {
    return `Provider record not found: ${getProviderLabel(item)} (${item.provider})`;
  }
  return summarizeProviderReadinessMessage(item.providerReadinessMessage);
}

function createEmptyInputFieldDraft(): InputFieldDraft {
  return {
    id: createDraftId("field"),
    key: "",
    label: "",
    type: "text",
    syncWith: "none",
    defaultRaw: "",
    defaultBoolean: false,
    required: false,
    affectsPricing: false,
    hidden: false,
    advancedOnly: false,
    managedBySuite: false,
    pricingAliases: "",
    pricingPresencePresent: "",
    pricingPresenceAbsent: "",
    searchable: false,
    assetType: "",
    assetCapability: "",
    providerPayloadKey: "",
    referenceUnitWeight: "",
    maxItems: "",
    options: [],
    optionsSourceType: "none",
    optionsSourceEndpoint: "",
    optionsSourceMethod: "GET",
    optionsSourceItemsPath: "",
    optionsSourceValueField: "",
    optionsSourceLabelField: "",
    optionsSourceQueryParam: "",
    optionsSourceValueTransform: "none",
    optionsSourceCacheTtlSeconds: "",
    optionsSourceHeadersRaw: "",
    optionsSourceBodyRaw: "",
    allowedExtensions: "",
    itemTemplateRaw: "",
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

  return value.map(item => {
    const record =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawType = String(record.type || "text");
    const type: InputFieldType = INPUT_FIELD_TYPE_OPTIONS.some(
      option => option.value === rawType
    )
      ? (rawType as InputFieldType)
      : "text";
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options: InputFieldOptionDraft[] = rawOptions.map(option => {
      const optionRecord =
        option && typeof option === "object"
          ? (option as Record<string, unknown>)
          : {};
      return {
        id: createDraftId("opt"),
        value: String(optionRecord.value ?? ""),
        label: String(optionRecord.label ?? optionRecord.value ?? ""),
      };
    });
    const rawSyncWith = String(record.syncWith || "none");
    const syncWith: SyncTarget = VALID_SYNC_TARGETS.includes(
      rawSyncWith as SyncTarget
    )
      ? (rawSyncWith as SyncTarget)
      : "none";
    const rawOptionsSource =
      record.optionsSource && typeof record.optionsSource === "object"
        ? (record.optionsSource as Record<string, unknown>)
        : null;
    const rawOptionsSourceType =
      rawOptionsSource && typeof rawOptionsSource.type === "string"
        ? rawOptionsSource.type.trim().toLowerCase()
        : "none";
    const optionsSourceType: InputFieldOptionsSourceType =
      rawOptionsSourceType === "provider_api" ||
      rawOptionsSourceType === "public_api"
        ? rawOptionsSourceType
        : "none";
    const optionsSourceMethodRaw =
      rawOptionsSource && typeof rawOptionsSource.method === "string"
        ? rawOptionsSource.method.toUpperCase()
        : "GET";
    const optionsSourceMethod: "GET" | "POST" =
      optionsSourceMethodRaw === "POST" ? "POST" : "GET";
    const optionsSourceValueTransformRaw =
      rawOptionsSource && typeof rawOptionsSource.valueTransform === "string"
        ? rawOptionsSource.valueTransform.trim().toLowerCase()
        : "none";
    const optionsSourceValueTransform: "none" | "before_dash" =
      optionsSourceValueTransformRaw === "before_dash" ? "before_dash" : "none";
    const pricingAliases = Array.isArray(record.pricingAliases)
      ? record.pricingAliases
          .map(alias => String(alias ?? "").trim())
          .filter(Boolean)
          .join(", ")
      : "";
    const pricingPresenceLabels =
      record.pricingPresenceLabels &&
      typeof record.pricingPresenceLabels === "object" &&
      !Array.isArray(record.pricingPresenceLabels)
        ? (record.pricingPresenceLabels as Record<string, unknown>)
        : null;
    return {
      id: createDraftId("field"),
      key: String(record.key ?? ""),
      label: String(record.label ?? record.key ?? ""),
      type,
      syncWith,
      defaultRaw:
        record.default === undefined || record.default === null
          ? ""
          : String(record.default),
      defaultBoolean: Boolean(record.default),
      required: Boolean(record.required),
      affectsPricing: Boolean(record.affectsPricing),
      hidden: Boolean(record.hidden),
      advancedOnly: Boolean(record.advancedOnly),
      managedBySuite: Boolean(record.managedBySuite),
      pricingAliases,
      pricingPresencePresent:
        typeof pricingPresenceLabels?.present === "string"
          ? pricingPresenceLabels.present
          : "",
      pricingPresenceAbsent:
        typeof pricingPresenceLabels?.absent === "string"
          ? pricingPresenceLabels.absent
          : "",
      searchable: Boolean(record.searchable),
      assetType: typeof record.assetType === "string" ? record.assetType : "",
      assetCapability: typeof record.assetCapability === "string" ? record.assetCapability : "",
      providerPayloadKey: typeof record.providerPayloadKey === "string" ? record.providerPayloadKey : "",
      referenceUnitWeight: record.referenceUnitWeight !== undefined && record.referenceUnitWeight !== null
        ? String(record.referenceUnitWeight)
        : "",
      maxItems: record.maxItems !== undefined && record.maxItems !== null
        ? String(record.maxItems)
        : "",
      options,
      optionsSourceType,
      optionsSourceEndpoint:
        rawOptionsSource && typeof rawOptionsSource.endpoint === "string"
          ? rawOptionsSource.endpoint
          : "",
      optionsSourceMethod,
      optionsSourceItemsPath:
        rawOptionsSource && typeof rawOptionsSource.itemsPath === "string"
          ? rawOptionsSource.itemsPath
          : "",
      optionsSourceValueField:
        rawOptionsSource && typeof rawOptionsSource.valueField === "string"
          ? rawOptionsSource.valueField
          : "",
      optionsSourceLabelField:
        rawOptionsSource && typeof rawOptionsSource.labelField === "string"
          ? rawOptionsSource.labelField
          : "",
      optionsSourceQueryParam:
        rawOptionsSource && typeof rawOptionsSource.queryParam === "string"
          ? rawOptionsSource.queryParam
          : "",
      optionsSourceValueTransform,
      optionsSourceCacheTtlSeconds:
        rawOptionsSource &&
        rawOptionsSource.cacheTtlSeconds !== undefined &&
        rawOptionsSource.cacheTtlSeconds !== null
          ? String(rawOptionsSource.cacheTtlSeconds)
          : "",
      optionsSourceHeadersRaw:
        rawOptionsSource &&
        rawOptionsSource.headers &&
        typeof rawOptionsSource.headers === "object"
          ? JSON.stringify(rawOptionsSource.headers, null, 2)
          : "",
      optionsSourceBodyRaw:
        rawOptionsSource && rawOptionsSource.body !== undefined
          ? JSON.stringify(rawOptionsSource.body, null, 2)
          : "",
      allowedExtensions:
        typeof record.allowedExtensions === "string"
          ? record.allowedExtensions
          : "",
      itemTemplateRaw: record.itemTemplate
        ? JSON.stringify(record.itemTemplate, null, 2)
        : "",
    };
  });
}

function parsePricingTierDrafts(
  value: unknown,
  defaultCost = 10
): PricingTierDraft[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [createEmptyPricingTierDraft(defaultCost)];
  }

  const tiers = Object.entries(value as Record<string, unknown>).map(
    ([key, tierValue]) => ({
      id: createDraftId("tier"),
      key,
      value: String(tierValue ?? ""),
    })
  );
  return tiers.length > 0 ? tiers : [createEmptyPricingTierDraft(defaultCost)];
}

function serializeInputFieldDrafts(drafts: InputFieldDraft[]): {
  fields: Record<string, unknown>[];
  errors: string[];
} {
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
      const pricingAliases = splitDelimitedTextValues(draft.pricingAliases);
      if (pricingAliases.length > 0) {
        nextField.pricingAliases = pricingAliases;
      }

      const pricingPresencePresent = draft.pricingPresencePresent.trim();
      const pricingPresenceAbsent = draft.pricingPresenceAbsent.trim();
      if (pricingPresencePresent || pricingPresenceAbsent) {
        if (!pricingPresencePresent || !pricingPresenceAbsent) {
          errors.push(
            `Field "${key}" pricing presence labels require both present and absent values.`
          );
          continue;
        }
        nextField.pricingPresenceLabels = {
          present: pricingPresencePresent,
          absent: pricingPresenceAbsent,
        };
      }
    }
    // Always write syncWith so runtime can distinguish "explicitly none" from "legacy field (undefined)"
    nextField.syncWith = draft.syncWith;

    if (draft.searchable) {
      nextField.searchable = true;
    }
    if (draft.hidden) {
      nextField.hidden = true;
    }
    if (draft.advancedOnly) {
      nextField.advancedOnly = true;
    }
    if (draft.managedBySuite) {
      nextField.managedBySuite = true;
    }
    const assetType = draft.assetType.trim();
    if (assetType) {
      nextField.assetType = assetType;
    }
    const assetCapability = draft.assetCapability.trim();
    if (assetCapability) {
      nextField.assetCapability = assetCapability;
    }
    const providerPayloadKey = draft.providerPayloadKey.trim();
    if (providerPayloadKey) {
      nextField.providerPayloadKey = providerPayloadKey;
    }
    const referenceUnitWeightRaw = draft.referenceUnitWeight.trim();
    if (referenceUnitWeightRaw) {
      const referenceUnitWeight = Number(referenceUnitWeightRaw);
      if (!Number.isFinite(referenceUnitWeight) || referenceUnitWeight <= 0) {
        errors.push(`Field "${key}" has invalid reference unit weight.`);
        continue;
      }
      nextField.referenceUnitWeight = Math.floor(referenceUnitWeight);
    }
    const maxItemsRaw = draft.maxItems.trim();
    if (maxItemsRaw) {
      const maxItems = Number(maxItemsRaw);
      if (!Number.isFinite(maxItems) || maxItems <= 0) {
        errors.push(`Field "${key}" has invalid max items.`);
        continue;
      }
      nextField.maxItems = Math.floor(maxItems);
    }

    const options = draft.options
      .map(option => ({
        value: option.value.trim(),
        label: option.label.trim(),
      }))
      .filter(option => option.value.length > 0 || option.label.length > 0)
      .map(option => ({
        value: option.value,
        label: option.label || option.value,
      }));
    const hasOptionsSource = draft.optionsSourceType !== "none";
    if (draft.type === "select" || draft.searchable || hasOptionsSource) {
      if (options.length > 0) {
        nextField.options = options;
      }
    }

    if (hasOptionsSource) {
      const endpoint = draft.optionsSourceEndpoint.trim();
      if (!endpoint) {
        errors.push(
          `Field "${key}" has options source enabled but no endpoint.`
        );
        continue;
      }
      const optionsSource: Record<string, unknown> = {
        type: draft.optionsSourceType,
        endpoint,
        method: draft.optionsSourceMethod,
      };

      const itemsPath = draft.optionsSourceItemsPath.trim();
      if (itemsPath) {
        optionsSource.itemsPath = itemsPath;
      }
      const valueField = draft.optionsSourceValueField.trim();
      if (valueField) {
        optionsSource.valueField = valueField;
      }
      const labelField = draft.optionsSourceLabelField.trim();
      if (labelField) {
        optionsSource.labelField = labelField;
      }
      const queryParam = draft.optionsSourceQueryParam.trim();
      if (queryParam) {
        optionsSource.queryParam = queryParam;
      }
      if (draft.optionsSourceValueTransform !== "none") {
        optionsSource.valueTransform = draft.optionsSourceValueTransform;
      }

      const cacheTtlRaw = draft.optionsSourceCacheTtlSeconds.trim();
      if (cacheTtlRaw.length > 0) {
        const cacheTtl = Number(cacheTtlRaw);
        if (!Number.isFinite(cacheTtl) || cacheTtl <= 0) {
          errors.push(`Field "${key}" has invalid options source cache TTL.`);
          continue;
        }
        optionsSource.cacheTtlSeconds = Math.floor(cacheTtl);
      }

      const headersRaw = draft.optionsSourceHeadersRaw.trim();
      if (headersRaw.length > 0) {
        try {
          const parsedHeaders = JSON.parse(headersRaw);
          if (
            !parsedHeaders ||
            typeof parsedHeaders !== "object" ||
            Array.isArray(parsedHeaders)
          ) {
            errors.push(
              `Field "${key}" options source headers must be a JSON object.`
            );
            continue;
          }
          optionsSource.headers = parsedHeaders;
        } catch {
          errors.push(
            `Field "${key}" has invalid options source headers JSON.`
          );
          continue;
        }
      }

      const bodyRaw = draft.optionsSourceBodyRaw.trim();
      if (bodyRaw.length > 0) {
        try {
          optionsSource.body = JSON.parse(bodyRaw);
        } catch {
          errors.push(`Field "${key}" has invalid options source body JSON.`);
          continue;
        }
      }

      nextField.optionsSource = optionsSource;
    }

    if (draft.type === "select") {
      if (options.length === 0 && !hasOptionsSource) {
        errors.push(
          `Select field "${key}" must define at least one option or options source.`
        );
        continue;
      }

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
          errors.push(
            `Number field "${key}" has invalid default value "${defaultValue}".`
          );
          continue;
        }
      }
    } else if (draft.type === "array") {
      // No default — actual items are provided at runtime by the user
      const templateRaw = draft.itemTemplateRaw.trim();
      if (templateRaw) {
        try {
          nextField.itemTemplate = JSON.parse(templateRaw);
        } catch {
          errors.push(`Array field "${key}" has invalid item template JSON.`);
          continue;
        }
      }
    } else if (draft.type === "library_file") {
      // No default — user picks from Library at runtime
      const exts = draft.allowedExtensions.trim();
      if (exts) {
        nextField.allowedExtensions = exts;
      }
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
  fallbackCost: number
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
      errors.push(
        `Pricing tier "${key}" must have a valid non-negative number.`
      );
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
  const direct = MEDIA_OPERATION_OPTIONS.find(
    item => item.value === normalized
  );
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

function inferOperationTypeFromModel(
  model: Pick<MediaModel, "modelType" | "modelId" | "configJson">
): MediaOperationType {
  const config =
    model.configJson && typeof model.configJson === "object"
      ? model.configJson
      : {};
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
    const hasImageInput =
      Array.isArray((config as any).inputFields) &&
      ((config as any).inputFields as Array<any>).some(
        field => String(field?.type || "").toLowerCase() === "image_urls"
      );
    return hasImageInput ? "i2i" : "t2i";
  }
  if (model.modelType === "video") {
    const hasImageInput =
      Array.isArray((config as any).inputFields) &&
      ((config as any).inputFields as Array<any>).some(
        field => String(field?.type || "").toLowerCase() === "image_urls"
      );
    const hasVideoInput =
      Array.isArray((config as any).inputFields) &&
      ((config as any).inputFields as Array<any>).some(
        field => String(field?.type || "").toLowerCase() === "video_urls"
      );
    const hasReferenceVideoSync =
      Array.isArray((config as any).inputFields) &&
      ((config as any).inputFields as Array<any>).some(
        field =>
          String(field?.syncWith || "").toLowerCase() === "reference_videos"
      );
    if (hasVideoInput || hasReferenceVideoSync) {
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
  return (
    MEDIA_OPERATION_OPTIONS.find(item => item.value === value)?.label || value
  );
}

const API_CONFIG_PRESETS: ApiConfigPreset[] = [
  {
    id: "sora2_text_video",
    label: "Sora2 Text-to-Video",
    description:
      "KIE Sora2 text-to-video with n_frames + aspect ratio + watermark controls and a model prompt cap.",
    pricingFormula: "per_duration",
    maxPromptLength: 10000,
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
    id: "kie_gemini_omni_video",
    label: "Kie Gemini Omni",
    description:
      "Gemini Omni video generation with resolution + duration + video-input pricing branches.",
    pricingFormula: "matrix",
    maxPromptLength: 5000,
    inputFields: [
      {
        key: "image_urls",
        label: "Reference Images",
        type: "image_urls",
        syncWith: "reference_images",
        hidden: true,
        managedBySuite: true,
        providerPayloadKey: "image_urls",
        referenceUnitWeight: 1,
        maxItems: 7,
      },
      {
        key: "video_list",
        label: "Source Video",
        type: "video_urls",
        syncWith: "reference_videos",
        hidden: true,
        managedBySuite: true,
        providerPayloadKey: "video_list",
        referenceUnitWeight: 2,
        maxItems: 1,
        affectsPricing: true,
        pricingAliases: [
          "referenceVideoUrls",
          "referenceVideoUrl",
          "reference_video_urls",
          "reference_video_url",
          "video_url",
        ],
        pricingPresenceLabels: {
          present: "with-video",
          absent: "without-video",
        },
      },
      {
        key: "character_ids",
        label: "Character References",
        type: "provider_asset_picker",
        hidden: true,
        advancedOnly: true,
        managedBySuite: true,
        assetType: "provider_asset",
        assetCapability: "gemini_omni_character",
        providerPayloadKey: "character_ids",
        referenceUnitWeight: 1,
        maxItems: 3,
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: [
          { value: "720p", label: "720P" },
          { value: "1080p", label: "1080P" },
          { value: "4K", label: "4K" },
        ],
        default: "720p",
        affectsPricing: true,
      },
      {
        key: "duration",
        label: "Duration",
        type: "select",
        options: [
          { value: "4s", label: "4s" },
          { value: "6s", label: "6s" },
          { value: "8s", label: "8s" },
          { value: "10s", label: "10s" },
        ],
        default: "6s",
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
        syncWith: "aspect_ratio",
      },
      {
        key: "audio_ids",
        label: "Voice / Audio References",
        type: "provider_asset_picker",
        hidden: true,
        advancedOnly: true,
        managedBySuite: true,
        assetType: "provider_asset",
        assetCapability: "gemini_omni_audio",
        providerPayloadKey: "audio_ids",
        maxItems: 7,
      },
      {
        key: "seed",
        label: "Seed",
        type: "number",
      },
    ],
    pricingTiers: {
      default: 120,
      "720p-4s-without-video": 90,
      "720p-6s-without-video": 120,
      "720p-8s-without-video": 150,
      "720p-10s-without-video": 180,
      "1080p-4s-without-video": 90,
      "1080p-6s-without-video": 120,
      "1080p-8s-without-video": 150,
      "1080p-10s-without-video": 180,
      "4K-4s-without-video": 210,
      "4K-6s-without-video": 240,
      "4K-8s-without-video": 270,
      "4K-10s-without-video": 300,
      "720p-4s-with-video": 240,
      "720p-6s-with-video": 240,
      "720p-8s-with-video": 240,
      "720p-10s-with-video": 240,
      "1080p-4s-with-video": 240,
      "1080p-6s-with-video": 240,
      "1080p-8s-with-video": 240,
      "1080p-10s-with-video": 240,
      "4K-4s-with-video": 360,
      "4K-6s-with-video": 360,
      "4K-8s-with-video": 360,
      "4K-10s-with-video": 360,
    },
  },
  {
    id: "veo31_text_video",
    label: "Veo 3.1 Complete",
    description:
      "Veo 3.1 setup with Lite/Fast/Quality, text, first-last frame, reference-to-video, quality, translation, aspect ratio, and watermark controls.",
    pricingFormula: "matrix",
    maxPromptLength: 5000,
    inputFields: [
      {
        key: "generationType",
        label: "Generation Mode",
        type: "select",
        options: [
          { value: "TEXT_2_VIDEO", label: "Text to Video" },
          { value: "FIRST_AND_LAST_FRAMES_2_VIDEO", label: "First & Last Frames to Video" },
          { value: "REFERENCE_2_VIDEO", label: "Reference to Video (Fast only)" },
        ],
        default: "TEXT_2_VIDEO",
      },
      {
        key: "imageUrls",
        label: "Start/End or Reference Images",
        type: "image_urls",
        syncWith: "reference_images",
      },
      {
        key: "resolution",
        label: "Output Quality",
        type: "select",
        options: [
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080P" },
          { value: "4K", label: "4K" },
        ],
        default: "720p",
        affectsPricing: true,
      },
      {
        key: "enableTranslation",
        label: "Enable Translation",
        type: "boolean",
        default: false,
      },
      {
        key: "enableFallback",
        label: "Enable Fallback",
        type: "boolean",
        default: false,
      },
      {
        key: "watermark",
        label: "Watermark",
        type: "text",
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: [
          { value: "auto", label: "Auto" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
        ],
        default: "auto",
        syncWith: "aspect_ratio",
      },
    ],
    pricingTiers: {
      "720p": 2000,
      "1080p": 2000,
      "4K": 4000,
    },
  },
  {
    id: "kling_text_video",
    label: "Kling Text-to-Video",
    description:
      "Matrix pricing by resolution + duration with optional aspect ratio and a prompt cap.",
    pricingFormula: "matrix",
    maxPromptLength: 5000,
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
  storyboardClipDurationSeconds: "",
  voices: "",
  isEnabled: true,
  priority: 99,
  transport: "gateway_api",
  providerModelId: "",
  mcpProviderKey: "",
  mcpToolName: "",
  mcpArgumentShape: "",
  apiEndpoint: "/api/v1/jobs/createTask",
  apiQueryEndpoint: "",
  apiPayloadFormat: "market",
  kieModelId: "",
  apiConfigRaw: "",
  pricingFormula: "flat",
  pricingUnitMetric: "characters",
  pricingUnitField: "text",
  pricingUnitSize: 1000,
  pricingUnitRounding: "ceil",
  pricingMinUnits: 0,
  operationType: "other",
  generateType: "",
  maxPromptLength: 0,
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
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [isTemplatesExpanded, setIsTemplatesExpanded] = useState(false);

  // Wait for the user to pause typing before querying to avoid per-character fetch churn.
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const normalizedSearch = debouncedSearch.trim();
  const searchFilter =
    normalizedSearch.length >= MIN_SEARCH_LENGTH ? normalizedSearch : undefined;

  // Form state
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  // Store original configJson when duplicating to preserve extra fields
  const [duplicateSourceConfig, setDuplicateSourceConfig] = useState<Record<
    string,
    any
  > | null>(null);

  // Check auth
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  const trpcUtils = trpc.useUtils();

  // Queries using tRPC hooks (use debounced search to prevent focus loss)
  const {
    data: models = [],
    isLoading,
    refetch,
  } = trpc.mediaModels.adminList.useQuery(
    {
      search: searchFilter,
      type:
        typeFilter !== "all"
          ? (typeFilter as "image" | "video" | "audio")
          : undefined,
      includeDisabled: true,
    },
    {
      enabled: !!user && user.role === "admin",
    }
  );

  const { data: templates = [] } = trpc.mediaModels.adminTemplates.useQuery(
    {
      search: searchFilter,
      type:
        typeFilter !== "all"
          ? (typeFilter as "image" | "video" | "audio")
          : undefined,
      includeDisabled: true,
    },
    {
      enabled: !!user && user.role === "admin",
    }
  );

  const { data: stats } = trpc.mediaModels.stats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const providerOptions = useMemo(() => {
    const providerMap = new Map<string, string>();
    for (const entry of [...models, ...templates]) {
      const providerKey = entry.provider;
      if (!providerKey || providerMap.has(providerKey)) {
        continue;
      }
      providerMap.set(providerKey, entry.providerDisplayName || entry.provider);
    }

    return Array.from(providerMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [models, templates]);

  const visibleModels = useMemo(
    () =>
      models.filter(
        (model: MediaModel) =>
          (operationFilter === "all" ||
            inferOperationTypeFromModel(model) === operationFilter) &&
          (providerFilter === "all" || model.provider === providerFilter)
      ),
    [models, operationFilter, providerFilter]
  );

  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (template: MediaModelTemplate) =>
          (operationFilter === "all" ||
            inferOperationTypeFromModel(template) === operationFilter) &&
          (providerFilter === "all" || template.provider === providerFilter)
      ),
    [templates, operationFilter, providerFilter]
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
    onSuccess: data => {
      // Close dialog and reset form FIRST before refetching
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Model created", {
        description: `${data.name} has been added successfully.`,
      });
      refetch();
      trpcUtils.mediaModels.list.invalidate();
    },
    onError: error => {
      toast.error("Failed to create model", {
        description: error.message,
      });
    },
  });

  const importTemplateMutation = trpc.mediaModels.importTemplate.useMutation({
    onSuccess: data => {
      toast.success(
        data.imported ? "Template imported" : "Template already imported",
        {
          description: data.imported
            ? `${data.model.name} is now available in the configured model catalog.`
            : `${data.model.name} already exists in the configured model catalog.`,
        }
      );
      refetch();
      trpcUtils.mediaModels.adminTemplates.invalidate();
      trpcUtils.mediaModels.stats.invalidate();
      trpcUtils.mediaModels.list.invalidate();
    },
    onError: error => {
      toast.error("Failed to import template", {
        description: error.message,
      });
    },
  });

  const updateMutation = trpc.mediaModels.update.useMutation({
    onSuccess: data => {
      setEditingModel(null);
      resetForm();
      toast.success("Model updated", {
        description: `${data.name} has been updated successfully.`,
      });
      refetch();
      // Invalidate the public-facing list so Media Studio picks up the new config immediately
      trpcUtils.mediaModels.list.invalidate();
    },
    onError: error => {
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
      trpcUtils.mediaModels.list.invalidate();
    },
    onError: error => {
      toast.error("Failed to delete model", {
        description: error.message,
      });
    },
  });

  const toggleEnabledMutation = trpc.mediaModels.toggleEnabled.useMutation({
    onSuccess: () => {
      refetch();
      trpcUtils.mediaModels.list.invalidate();
    },
  });

  const disableUnavailableMutation =
    trpc.mediaModels.disableUnavailable.useMutation({
      onSuccess: data => {
        toast.success("Unavailable models disabled", {
          description:
            data.disabledCount > 0
              ? `Disabled ${data.disabledCount} model(s) whose providers are not runtime-ready.`
              : "No enabled models required disabling.",
        });
        refetch();
        trpcUtils.mediaModels.list.invalidate();
      },
      onError: error => {
        toast.error("Failed to disable unavailable models", {
          description: error.message,
        });
      },
    });

  const resetRuntimeCountersMutation =
    trpc.mediaModels.resetRuntimeCounters.useMutation({
      onSuccess: () => {
        toast.success("Runtime counters reset");
        refetchRuntimeCounters();
      },
      onError: error => {
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
    const transportConfig = resolveMediaModelTransportConfig({
      provider: model.provider,
      modelId: model.modelId,
      configJson: cfg,
    });
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
      storyboardClipDurationSeconds: String(readPositiveConfigNumber(
        cfg.storyboardClipDurationSeconds,
        cfg.storyboard_clip_duration_seconds,
        cfg.defaultStoryboardClipDurationSeconds,
        cfg.default_storyboard_clip_duration_seconds,
        cfg.clipDurationSeconds,
        cfg.clip_duration_seconds
      ) ?? ""),
      voices: (model.voices || []).join("\n"),
      isEnabled: model.isEnabled,
      priority: model.priority,
      transport: transportConfig.transport,
      providerModelId: transportConfig.providerModelId || "",
      mcpProviderKey: transportConfig.providerKey || "",
      mcpToolName: transportConfig.toolName || "",
      mcpArgumentShape: transportConfig.argumentShape || "",
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint:
        cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      apiConfigRaw: cfg.apiConfig ? JSON.stringify(cfg.apiConfig, null, 2) : "",
      pricingFormula: cfg.pricingFormula || "flat",
      pricingUnitMetric:
        cfg.pricingUnitMetric === "items" ? "items" : "characters",
      pricingUnitField: cfg.pricingUnitField || "text",
      pricingUnitSize:
        Number(cfg.pricingUnitSize) > 0 ? Number(cfg.pricingUnitSize) : 1000,
      pricingUnitRounding:
        cfg.pricingUnitRounding === "floor" ||
        cfg.pricingUnitRounding === "round"
          ? cfg.pricingUnitRounding
          : "ceil",
      pricingMinUnits:
        Number(cfg.pricingMinUnits) >= 0 ? Number(cfg.pricingMinUnits) : 0,
      operationType: inferOperationTypeFromModel(model),
      generateType: cfg.generateType || "",
      maxPromptLength:
        Number(cfg.maxPromptLength) > 0 ? Number(cfg.maxPromptLength) : 0,
      inputFieldDrafts: parseInputFieldDrafts(cfg.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(
        cfg.pricingTiers,
        model.creditCost
      ),
    });
    setActiveTab("basic");
  };

  const handleDuplicateModel = (model: MediaModel) => {
    // Clone the model data but with modified modelId and clear editingModel to create new
    setEditingModel(null);
    const cfg = model.configJson || {};
    const transportConfig = resolveMediaModelTransportConfig({
      provider: model.provider,
      modelId: model.modelId,
      configJson: cfg,
    });
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
      storyboardClipDurationSeconds: String(readPositiveConfigNumber(
        cfg.storyboardClipDurationSeconds,
        cfg.storyboard_clip_duration_seconds,
        cfg.defaultStoryboardClipDurationSeconds,
        cfg.default_storyboard_clip_duration_seconds,
        cfg.clipDurationSeconds,
        cfg.clip_duration_seconds
      ) ?? ""),
      voices: (model.voices || []).join("\n"),
      isEnabled: false, // Start disabled for safety
      priority: model.priority,
      transport: transportConfig.transport,
      providerModelId: transportConfig.providerModelId || "",
      mcpProviderKey: transportConfig.providerKey || "",
      mcpToolName: transportConfig.toolName || "",
      mcpArgumentShape: transportConfig.argumentShape || "",
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint:
        cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      apiConfigRaw: cfg.apiConfig ? JSON.stringify(cfg.apiConfig, null, 2) : "",
      pricingFormula: cfg.pricingFormula || "flat",
      pricingUnitMetric:
        cfg.pricingUnitMetric === "items" ? "items" : "characters",
      pricingUnitField: cfg.pricingUnitField || "text",
      pricingUnitSize:
        Number(cfg.pricingUnitSize) > 0 ? Number(cfg.pricingUnitSize) : 1000,
      pricingUnitRounding:
        cfg.pricingUnitRounding === "floor" ||
        cfg.pricingUnitRounding === "round"
          ? cfg.pricingUnitRounding
          : "ceil",
      pricingMinUnits:
        Number(cfg.pricingMinUnits) >= 0 ? Number(cfg.pricingMinUnits) : 0,
      operationType: inferOperationTypeFromModel(model),
      generateType: cfg.generateType || "",
      maxPromptLength:
        Number(cfg.maxPromptLength) > 0 ? Number(cfg.maxPromptLength) : 0,
      inputFieldDrafts: parseInputFieldDrafts(cfg.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(
        cfg.pricingTiers,
        model.creditCost
      ),
    });
    setActiveTab("basic");
    setIsCreateDialogOpen(true);
    toast.info("Model duplicated", {
      description: "Please modify the Model ID before saving.",
    });
  };

  const handleSave = () => {
    const aliases = splitDelimitedTextValues(formData.aliases);
    const aspectRatios = splitDelimitedTextValues(formData.aspectRatios);
    const sizes = splitDelimitedTextValues(formData.sizes);
    const durations = splitDelimitedTextValues(formData.durations)
      .map(s => parseInt(s, 10))
      .filter(n => !Number.isNaN(n));
    const storyboardClipDurationSecondsRaw = formData.storyboardClipDurationSeconds.trim();
    const storyboardClipDurationSeconds = storyboardClipDurationSecondsRaw
      ? Number(storyboardClipDurationSecondsRaw)
      : undefined;
    const voices = parseVoiceCatalogValues(formData.voices).map(
      entry => entry.value
    );

    const serializedInputFields = serializeInputFieldDrafts(
      formData.inputFieldDrafts
    );
    const serializedPricingTiers = serializePricingTierDrafts(
      formData.pricingTierDrafts,
      formData.creditCost
    );
    const parseErrors = [
      ...serializedInputFields.errors,
      ...serializedPricingTiers.errors,
    ];

    let parsedApiConfig: Record<string, string | number | boolean> | undefined;
    const apiConfigRaw = formData.apiConfigRaw.trim();
    if (apiConfigRaw.length > 0) {
      try {
        const parsed = JSON.parse(apiConfigRaw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          parseErrors.push("API Config JSON must be an object.");
        } else {
          const normalized: Record<string, string | number | boolean> = {};
          for (const [key, value] of Object.entries(
            parsed as Record<string, unknown>
          )) {
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ) {
              normalized[key] = value;
            } else if (value !== null && value !== undefined) {
              parseErrors.push(
                `API Config key "${key}" must be string, number, or boolean.`
              );
              break;
            }
          }
          if (parseErrors.length === 0) {
            parsedApiConfig = normalized;
          }
        }
      } catch {
        parseErrors.push("API Config JSON is invalid.");
      }
    }

    if (
      storyboardClipDurationSecondsRaw
      && (!Number.isFinite(storyboardClipDurationSeconds) || Number(storyboardClipDurationSeconds) <= 0)
    ) {
      parseErrors.push("Storyboard clip duration must be a positive number.");
    }

    // Show validation errors and abort save
    if (parseErrors.length > 0) {
      toast.error("Validation Error", {
        description: parseErrors.join(" | "),
        duration: 5000,
      });
      return;
    }

    const includeMaxPromptLength = formData.maxPromptLength > 0;
    const configJson: Record<string, any> = {
      transport: formData.transport,
      providerModelId: formData.providerModelId || formData.modelId,
      mcp:
        formData.transport === "mcp"
          ? {
              providerKey: formData.mcpProviderKey || formData.provider,
              providerModelId: formData.providerModelId || formData.modelId,
              toolName: formData.mcpToolName || undefined,
              argumentShape: formData.mcpArgumentShape || undefined,
            }
          : undefined,
      apiEndpoint: formData.apiEndpoint,
      apiQueryEndpoint: formData.apiQueryEndpoint || undefined,
      apiPayloadFormat: formData.apiPayloadFormat,
      kieModelId: formData.kieModelId || undefined,
      apiConfig: parsedApiConfig,
      pricingFormula: formData.pricingFormula,
      pricingUnitMetric:
        formData.pricingFormula === "per_unit"
          ? formData.pricingUnitMetric
          : undefined,
      pricingUnitField:
        formData.pricingFormula === "per_unit"
          ? formData.pricingUnitField || undefined
          : undefined,
      pricingUnitSize:
        formData.pricingFormula === "per_unit" && formData.pricingUnitSize > 0
          ? formData.pricingUnitSize
          : undefined,
      pricingUnitRounding:
        formData.pricingFormula === "per_unit"
          ? formData.pricingUnitRounding
          : undefined,
      pricingMinUnits:
        formData.pricingFormula === "per_unit" && formData.pricingMinUnits >= 0
          ? formData.pricingMinUnits
          : undefined,
      operationType: formData.operationType,
      generateType: formData.generateType || undefined,
      storyboardClipDurationSeconds,
      ...(includeMaxPromptLength
        ? { maxPromptLength: formData.maxPromptLength }
        : {}),
      inputFields: serializedInputFields.fields,
      pricingTiers: serializedPricingTiers.tiers,
    };

    if (editingModel) {
      // Preserve any extra configJson keys the seed script set
      const existing = editingModel.configJson || {};
      const merged = { ...existing, ...configJson };
      if (formData.transport !== "mcp") {
        delete merged.mcp;
      }
      if (!includeMaxPromptLength) {
        delete merged.maxPromptLength;
      }
      if (storyboardClipDurationSeconds === undefined) {
        delete merged.storyboardClipDurationSeconds;
        delete merged.storyboard_clip_duration_seconds;
        delete merged.defaultStoryboardClipDurationSeconds;
        delete merged.default_storyboard_clip_duration_seconds;
        delete merged.clipDurationSeconds;
        delete merged.clip_duration_seconds;
      }
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
      if (formData.transport !== "mcp") {
        delete finalConfigJson.mcp;
      }
      if (!includeMaxPromptLength) {
        delete finalConfigJson.maxPromptLength;
      }
      if (storyboardClipDurationSeconds === undefined) {
        delete finalConfigJson.storyboardClipDurationSeconds;
        delete finalConfigJson.storyboard_clip_duration_seconds;
        delete finalConfigJson.defaultStoryboardClipDurationSeconds;
        delete finalConfigJson.default_storyboard_clip_duration_seconds;
        delete finalConfigJson.clipDurationSeconds;
        delete finalConfigJson.clip_duration_seconds;
      }
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
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "video":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "audio":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getGenerationModeBadgeColor = (label: string) => {
    switch (label) {
      case "Video to Video":
        return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
      case "Text to Video":
        return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
      case "Image to Video":
        return "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
      case "Image to Image":
        return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300";
      default:
        return "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300";
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setLocation("/dashboard")}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <LocaleToggle className="shrink-0" />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              Media AI Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage AI models for image, video, and audio generation skills
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => disableUnavailableMutation.mutate()}
              disabled={disableUnavailableMutation.isPending}
            >
              {disableUnavailableMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
              )}
              Disable Unavailable
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Model
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-6 mb-8">
          <DashboardKpiCard
            icon={Layers}
            label="Total Models"
            value={stats.total}
          />
          <DashboardKpiCard
            icon={CheckCircle2}
            label="Enabled"
            value={stats.enabled}
          />
          <DashboardKpiCard
            icon={Image}
            label="Image"
            value={stats.byType.image}
          />
          <DashboardKpiCard
            icon={Video}
            label="Video"
            value={stats.byType.video}
          />
          <DashboardKpiCard
            icon={Music}
            label="Audio"
            value={stats.byType.audio}
          />
          <DashboardKpiCard
            icon={AlertTriangle}
            label="Provider Unavailable"
            value={stats.unavailable}
          />
        </div>
      )}

      {/* Runtime Counters */}
      <DashboardCard
        className="mb-6"
        title="Runtime Counter Observability"
        description="Live counters for DB default selection and fallback behavior (auto-refresh every 5 seconds)"
        leading={<Activity className="h-5 w-5 text-emerald-600" />}
        trailing={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchRuntimeCounters()}
                disabled={isRuntimeCountersRefreshing}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isRuntimeCountersRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resetRuntimeCountersMutation.mutate()}
                disabled={resetRuntimeCountersMutation.isPending}
              >
                <RotateCcw
                  className={`mr-2 h-4 w-4 ${resetRuntimeCountersMutation.isPending ? "animate-spin" : ""}`}
                />
                Reset Counters
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {!runtimeCounters ? (
            <div className="text-sm text-muted-foreground">
              Loading runtime counters...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Last sample:{" "}
                {new Date(runtimeCounters.generatedAt).toLocaleString()} | Total
                fallback hits:{" "}
                <span className="font-semibold text-amber-600">
                  {runtimeCounters.fallbackTotal}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <DashboardCard
                  className="border-emerald-200"
                  title="Default Resolution"
                >
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>defaultFromDb</span>
                      <span className="font-semibold">
                        {runtimeCounters.mediaLookup.defaultFromDb}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>defaultFallbackStatic</span>
                      <span className="font-semibold text-amber-600">
                        {runtimeCounters.mediaLookup.defaultFallbackStatic}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRejected</span>
                      <span className="font-semibold">
                        {runtimeCounters.mediaLookup.unknownModelRejected}
                      </span>
                    </div>
                  </div>
                </DashboardCard>
                <DashboardCard
                  className="border-blue-200"
                  title="DB Lookup Fallback"
                >
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>pricingDbMissFallback</span>
                      <span className="font-semibold text-amber-600">
                        {runtimeCounters.mediaLookup.pricingDbMissFallback}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>metadataDbMissFallback</span>
                      <span className="font-semibold text-amber-600">
                        {runtimeCounters.mediaLookup.metadataDbMissFallback}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerDefaultFallback</span>
                      <span className="font-semibold text-amber-600">
                        {
                          runtimeCounters.mediaResolution
                            .providerDefaultFallback
                        }
                      </span>
                    </div>
                  </div>
                </DashboardCard>
                <DashboardCard
                  className="border-teal-200"
                  title="Provider & Registry"
                >
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>providerFromApiConfig</span>
                      <span className="font-semibold">
                        {runtimeCounters.mediaResolution.providerFromApiConfig}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerFromStaticRegistry</span>
                      <span className="font-semibold">
                        {
                          runtimeCounters.mediaResolution
                            .providerFromStaticRegistry
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRequests</span>
                      <span className="font-semibold">
                        {runtimeCounters.mediaResolution.unknownModelRequests}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.staticFallbackHits</span>
                      <span className="font-semibold text-amber-600">
                        {runtimeCounters.modelRegistry.staticFallbackHits}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.cacheHits</span>
                      <span className="font-semibold">
                        {runtimeCounters.modelRegistry.cacheHits}
                      </span>
                    </div>
                  </div>
                </DashboardCard>
              </div>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* Filters */}
      <DashboardCard
        className="mb-6"
        title="Filters"
        description="Search and narrow the configured model catalog"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Search starts after you pause typing for ~0.9s (min 2
                characters).
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
                {MEDIA_OPERATION_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[220px]">
                <Settings2 className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {providerOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DashboardCard>

      {/* Models List */}
      {visibleTemplates.length > 0 && (
        <DashboardCard
          className="mb-6"
          title="Available Templates"
          description="Static fallback models that are available in runtime but have not been imported into the admin database yet."
          trailing={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTemplatesExpanded(current => !current)}
              aria-expanded={isTemplatesExpanded}
              aria-controls="available-model-templates"
            >
              <span className="mr-2 text-xs text-muted-foreground">
                {visibleTemplates.length} templates
              </span>
              {isTemplatesExpanded ? "Collapse" : "Expand"}
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform ${isTemplatesExpanded ? "rotate-180" : ""}`}
              />
            </Button>
          }
        >
          {isTemplatesExpanded ? (
            <div
              id="available-model-templates"
              className="grid gap-4 lg:grid-cols-2"
            >
              {visibleTemplates.map((template: MediaModelTemplate) => {
                const generationModeLabel = getModelGenerationModeLabel(
                  template as Pick<
                    MediaModel,
                    "modelType" | "modelId" | "configJson"
                  >
                );
                const isImporting =
                  importTemplateMutation.isPending &&
                  importTemplateMutation.variables?.modelId ===
                    template.modelId;
                const providerLabel = getProviderLabel(template);
                const providerReadinessDetail =
                  getProviderReadinessDetail(template);

                return (
                  <DashboardCard
                    key={template.modelId}
                    className="border-dashed"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            {getModelTypeIcon(template.modelType)}
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{template.name}</div>
                              <Badge
                                className={getModelTypeBadgeColor(
                                  template.modelType
                                )}
                              >
                                {template.modelType}
                              </Badge>
                              {generationModeLabel && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${getGenerationModeBadgeColor(generationModeLabel)}`}
                                >
                                  {generationModeLabel}
                                </Badge>
                              )}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {template.modelId}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <Server className="h-3.5 w-3.5" />
                              <span>Provider:</span>
                              <span className="font-medium text-foreground">
                                {providerLabel}
                              </span>
                              {providerLabel !== template.provider && (
                                <span className="font-mono text-[11px]">
                                  ({template.provider})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            importTemplateMutation.mutate({
                              modelId: template.modelId,
                            })
                          }
                          disabled={importTemplateMutation.isPending}
                        >
                          {isImporting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          Import
                        </Button>
                      </div>

                      {template.description && (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {template.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          <Server className="mr-1 h-3 w-3" />
                          {providerLabel}
                        </Badge>
                        <Badge variant="outline">
                          <Coins className="mr-1 h-3 w-3 text-amber-500" />
                          {template.creditCost} credits
                        </Badge>
                        {Array.isArray(template.durations) &&
                          template.durations.length > 0 && (
                            <Badge variant="outline">
                              {template.durations.join(", ")}s
                            </Badge>
                          )}
                        {Array.isArray(template.aspectRatios) &&
                          template.aspectRatios.length > 0 && (
                            <Badge variant="outline">
                              {template.aspectRatios.join(", ")}
                            </Badge>
                          )}
                      </div>

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap gap-1">
                          {(template.aliases || [])
                            .slice(0, 3)
                            .map((alias: string) => (
                              <Badge
                                key={alias}
                                variant="outline"
                                className="text-xs"
                              >
                                {alias}
                              </Badge>
                            ))}
                          {(template.aliases || []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(template.aliases || []).length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="max-w-[280px] text-right">
                          {template.providerReady ? (
                            <Badge
                              variant="outline"
                              className="border-green-200 text-green-700"
                            >
                              Provider Ready
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className="border-amber-200 text-amber-700"
                              >
                                {template.providerReadiness ===
                                  "provider_disabled" && "Provider Disabled"}
                                {template.providerReadiness ===
                                  "missing_api_key" && "Missing API Key"}
                                {template.providerReadiness ===
                                  "provider_not_found" && "Provider Missing"}
                                {template.providerReadiness === "test_failed" &&
                                  "Health Test Failed"}
                                {!template.providerReadiness && "Not Ready"}
                              </Badge>
                              {providerReadinessDetail && (
                                <div className="text-xs leading-5 text-muted-foreground">
                                  {providerReadinessDetail}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </DashboardCard>
                );
              })}
            </div>
          ) : (
            <div
              id="available-model-templates"
              className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-muted-foreground"
            >
              Template list is collapsed. Expand this section when you want to
              import models from the runtime catalog.
            </div>
          )}
        </DashboardCard>
      )}

      <DashboardCard
        title="Configured Models"
        description='These models are available for image, video, and audio generation skills. Users can specify model names in their prompts (e.g., "generate image with flux 2.0").'
      >
        <div className="space-y-4">
          {visibleModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No models found</p>
              <p className="text-sm">
                Try changing your filters or add a new model
              </p>
              <Button
                className="mt-4"
                onClick={() => setIsCreateDialogOpen(true)}
              >
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
                  <TableHead>Route</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Provider Readiness</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleModels.map((model: any, index: number) => {
                  const generationModeLabel =
                    getModelGenerationModeLabel(model);
                  const transportConfig = resolveMediaModelTransportConfig({
                    provider: model.provider,
                    modelId: model.modelId,
                    configJson: model.configJson,
                  });
                  return (
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium">{model.name}</div>
                              {generationModeLabel && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${getGenerationModeBadgeColor(generationModeLabel)}`}
                                >
                                  {generationModeLabel}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {model.modelId}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getModelTypeBadgeColor(model.modelType)}
                        >
                          {model.modelType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getOperationTypeLabel(
                            inferOperationTypeFromModel(model)
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={transportConfig.transport === "mcp" ? "default" : "outline"}
                            className={transportConfig.transport === "mcp" ? "bg-sky-500" : ""}
                          >
                            {getMediaModelTransportLabel(transportConfig)}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {transportConfig.transport === "mcp"
                              ? "Provider account"
                              : "Platform credits"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="text-sm">
                            {model.providerDisplayName || model.provider}
                          </span>
                          {model.providerDisplayName &&
                            model.providerDisplayName !== model.provider && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {model.provider}
                              </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {transportConfig.transport === "mcp" ? (
                          <div className="max-w-[260px] space-y-1">
                            <Badge
                              variant="outline"
                              className="border-sky-200 text-sky-700"
                            >
                              MCP Connect
                            </Badge>
                            <div className="text-xs leading-5 text-muted-foreground">
                              Uses a connected provider account at runtime.
                            </div>
                          </div>
                        ) : model.providerReady ? (
                          <Badge
                            variant="outline"
                            className="border-green-200 text-green-700"
                          >
                            Ready
                          </Badge>
                        ) : (
                          <div className="max-w-[260px] space-y-1">
                            <Badge
                              variant="outline"
                              className="border-amber-200 text-amber-700"
                            >
                              {model.providerReadiness ===
                                "provider_disabled" && "Provider Disabled"}
                              {model.providerReadiness === "missing_api_key" &&
                                "Missing API Key"}
                              {model.providerReadiness ===
                                "provider_not_found" && "Provider Missing"}
                              {model.providerReadiness === "test_failed" &&
                                "Health Test Failed"}
                              {!model.providerReadiness && "Not Ready"}
                            </Badge>
                            {model.providerReadinessMessage && (
                              <div
                                className="text-xs leading-5 text-muted-foreground whitespace-normal break-all"
                                title={model.providerReadinessMessage}
                              >
                                {summarizeProviderReadinessMessage(
                                  model.providerReadinessMessage
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Coins className="h-3 w-3 text-amber-500" />
                          <span className="font-medium">
                            {model.creditCost}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(model.aliases || [])
                            .slice(0, 2)
                            .map((alias: string, i: number) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
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
                            onClick={() =>
                              toggleEnabledMutation.mutate({ id: model.id })
                            }
                            disabled={toggleEnabledMutation.isPending}
                            title={
                              model.isEnabled ? "Disable model" : "Enable model"
                            }
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DashboardCard>

      {/* Create Model Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add AI Model</DialogTitle>
            <DialogDescription>
              Add a new AI model for generation skills
            </DialogDescription>
          </DialogHeader>

          <ModelForm
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />

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
              disabled={
                createMutation.isPending || !formData.modelId || !formData.name
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Model Dialog */}
      <Dialog
        open={!!editingModel}
        onOpenChange={open => !open && setEditingModel(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Edit Model - {editingModel?.name}</span>
              {editingModel && getModelGenerationModeLabel(editingModel) && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${getGenerationModeBadgeColor(getModelGenerationModeLabel(editingModel)!)}`}
                >
                  {getModelGenerationModeLabel(editingModel)}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Update model configuration and aliases
            </DialogDescription>
          </DialogHeader>

          <ModelForm
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                updateMutation.isPending || !formData.modelId || !formData.name
              }
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={open => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteConfirm?.name}</strong>? This action cannot be
              undone and may affect skill detection for this model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteConfirm && deleteMutation.mutate({ id: deleteConfirm.id })
              }
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
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
  const [bulkOptionsByField, setBulkOptionsByField] = useState<
    Record<string, string>
  >({});
  const previewFieldOptionsMutation =
    trpc.mediaModels.previewFieldOptions.useMutation();
  const formGenerationModeLabel = useMemo(() => {
    const previewConfig = {
      generateType: formData.generateType || undefined,
      inputFields: serializeInputFieldDrafts(formData.inputFieldDrafts).fields,
    };
    return getModelGenerationModeLabel({ configJson: previewConfig });
  }, [formData.generateType, formData.inputFieldDrafts]);

  const applyApiConfigPreset = () => {
    if (selectedPresetId === "none") {
      return;
    }
    const preset = API_CONFIG_PRESETS.find(
      item => item.id === selectedPresetId
    );
    if (!preset) {
      return;
    }
    setFormData({
      ...formData,
      pricingFormula: preset.pricingFormula,
      maxPromptLength: preset.maxPromptLength,
      inputFieldDrafts: parseInputFieldDrafts(preset.inputFields),
      pricingTierDrafts: parsePricingTierDrafts(
        preset.pricingTiers,
        formData.creditCost
      ),
    });
    toast.success(`Applied preset: ${preset.label}`);
  };

  const reorderInputFieldDrafts = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return;
    }
    const fromIndex = formData.inputFieldDrafts.findIndex(
      field => field.id === fromId
    );
    const toIndex = formData.inputFieldDrafts.findIndex(
      field => field.id === toId
    );
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

  const updateInputFieldDraft = (
    fieldId: string,
    patch: Partial<InputFieldDraft>
  ) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map(field =>
        field.id === fieldId ? { ...field, ...patch } : field
      ),
    });
  };

  const removeInputFieldDraft = (fieldId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.filter(
        field => field.id !== fieldId
      ),
    });
  };

  const addInputFieldDraft = () => {
    setFormData({
      ...formData,
      inputFieldDrafts: [
        ...formData.inputFieldDrafts,
        createEmptyInputFieldDraft(),
      ],
    });
  };

  const addInputFieldOption = (fieldId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map(field =>
        field.id === fieldId
          ? {
              ...field,
              options: [
                ...field.options,
                { id: createDraftId("opt"), value: "", label: "" },
              ],
            }
          : field
      ),
    });
  };

  const updateInputFieldOption = (
    fieldId: string,
    optionId: string,
    patch: Partial<InputFieldOptionDraft>
  ) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map(field =>
        field.id === fieldId
          ? {
              ...field,
              options: field.options.map(option =>
                option.id === optionId ? { ...option, ...patch } : option
              ),
            }
          : field
      ),
    });
  };

  const removeInputFieldOption = (fieldId: string, optionId: string) => {
    setFormData({
      ...formData,
      inputFieldDrafts: formData.inputFieldDrafts.map(field =>
        field.id === fieldId
          ? {
              ...field,
              options: field.options.filter(option => option.id !== optionId),
            }
          : field
      ),
    });
  };

  const setBulkOptionsText = (fieldId: string, value: string) => {
    setBulkOptionsByField(prev => ({ ...prev, [fieldId]: value }));
  };

  const applyBulkOptionsToField = (
    field: InputFieldDraft,
    mode: "replace" | "merge"
  ) => {
    const raw = (bulkOptionsByField[field.id] ?? "").trim();
    if (!raw) {
      toast.error("Please paste option list first.");
      return;
    }

    const parsed = parseBulkOptionsText(raw);
    if (parsed.length === 0) {
      toast.error("No valid options found in pasted text.");
      return;
    }

    const incoming = parsed.map(option => ({
      id: createDraftId("opt"),
      value: option.value,
      label: option.label,
    }));

    if (mode === "replace") {
      updateInputFieldDraft(field.id, { options: incoming, searchable: true });
      toast.success(`Imported ${incoming.length} options.`);
      return;
    }

    const merged = new Map<string, InputFieldOptionDraft>();
    for (const option of field.options) {
      const value = option.value.trim();
      if (!value || merged.has(value)) continue;
      merged.set(value, option);
    }
    for (const option of incoming) {
      const value = option.value.trim();
      if (!value || merged.has(value)) continue;
      merged.set(value, option);
    }

    updateInputFieldDraft(field.id, {
      options: Array.from(merged.values()),
      searchable: true,
    });
    toast.success(`Merged ${incoming.length} options (${merged.size} total).`);
  };

  const findPreferredVoiceField = (): InputFieldDraft | null => {
    const preferredKeys = [
      "voiceID",
      "voiceId",
      "voice",
      "speakerVoice",
      "speaker",
    ];
    for (const key of preferredKeys) {
      const found = formData.inputFieldDrafts.find(
        field => field.key.trim().toLowerCase() === key.toLowerCase()
      );
      if (found) {
        return found;
      }
    }
    return null;
  };

  const syncVoiceCatalogToInputField = (mode: "replace" | "merge") => {
    const parsedVoices = parseVoiceCatalogValues(formData.voices);
    if (parsedVoices.length === 0) {
      toast.error("Voice list is empty. Paste voices first.");
      return;
    }

    const incomingOptions = parsedVoices.map(entry => ({
      id: createDraftId("opt"),
      value: entry.value,
      label: entry.label,
    }));

    const existingField = findPreferredVoiceField();
    const defaultFieldKey = formData.provider
      .trim()
      .toLowerCase()
      .includes("uvoice")
      ? "voiceID"
      : "voice";

    if (!existingField) {
      const nextField = createEmptyInputFieldDraft();
      nextField.key = defaultFieldKey;
      nextField.label = defaultFieldKey === "voiceID" ? "Voice ID" : "Voice";
      nextField.type = "select";
      nextField.searchable = true;
      nextField.options = incomingOptions;
      nextField.defaultRaw = incomingOptions[0]?.value || "";
      nextField.required = true;
      setFormData({
        ...formData,
        inputFieldDrafts: [...formData.inputFieldDrafts, nextField],
      });
      toast.success(
        `Created "${nextField.key}" field with ${incomingOptions.length} voices.`
      );
      return;
    }

    if (mode === "replace") {
      const shouldSetDefault =
        !existingField.defaultRaw.trim() ||
        !incomingOptions.some(
          option => option.value === existingField.defaultRaw.trim()
        );
      updateInputFieldDraft(existingField.id, {
        searchable: true,
        options: incomingOptions,
        ...(shouldSetDefault
          ? { defaultRaw: incomingOptions[0]?.value || "" }
          : {}),
      });
      toast.success(
        `Replaced ${existingField.key} options with ${incomingOptions.length} voices.`
      );
      return;
    }

    const merged = new Map<string, InputFieldOptionDraft>();
    for (const option of existingField.options) {
      const value = option.value.trim();
      if (!value || merged.has(value)) continue;
      merged.set(value, option);
    }
    for (const option of incomingOptions) {
      const value = option.value.trim();
      if (!value || merged.has(value)) continue;
      merged.set(value, option);
    }

    updateInputFieldDraft(existingField.id, {
      searchable: true,
      options: Array.from(merged.values()),
      ...(existingField.defaultRaw.trim().length === 0
        ? { defaultRaw: incomingOptions[0]?.value || "" }
        : {}),
    });
    toast.success(
      `Merged voice list into ${existingField.key} (${merged.size} options).`
    );
  };

  const refreshInputFieldOptions = async (field: InputFieldDraft) => {
    if (field.optionsSourceType === "none") {
      toast.error("Please configure options source first.");
      return;
    }
    const endpoint = field.optionsSourceEndpoint.trim();
    if (!endpoint) {
      toast.error("Options source endpoint is required.");
      return;
    }

    const optionsSource: {
      type: "provider_api" | "public_api";
      endpoint: string;
      method?: "GET" | "POST";
      itemsPath?: string;
      valueField?: string;
      labelField?: string;
      queryParam?: string;
      valueTransform?: "none" | "before_dash";
      cacheTtlSeconds?: number;
      headers?: Record<string, string>;
      body?: unknown;
    } = {
      type: field.optionsSourceType,
      endpoint,
      method: field.optionsSourceMethod,
    };
    const itemsPath = field.optionsSourceItemsPath.trim();
    if (itemsPath) optionsSource.itemsPath = itemsPath;
    const valueField = field.optionsSourceValueField.trim();
    if (valueField) optionsSource.valueField = valueField;
    const labelField = field.optionsSourceLabelField.trim();
    if (labelField) optionsSource.labelField = labelField;
    const queryParam = field.optionsSourceQueryParam.trim();
    if (queryParam) optionsSource.queryParam = queryParam;
    if (field.optionsSourceValueTransform !== "none") {
      optionsSource.valueTransform = field.optionsSourceValueTransform;
    }

    const cacheTtlRaw = field.optionsSourceCacheTtlSeconds.trim();
    if (cacheTtlRaw) {
      const parsedTtl = Number(cacheTtlRaw);
      if (!Number.isFinite(parsedTtl) || parsedTtl <= 0) {
        toast.error("Options source cache TTL must be a positive number.");
        return;
      }
      optionsSource.cacheTtlSeconds = Math.floor(parsedTtl);
    }

    const headersRaw = field.optionsSourceHeadersRaw.trim();
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("Options source headers must be a JSON object.");
          return;
        }
        optionsSource.headers = parsed as Record<string, string>;
      } catch {
        toast.error("Options source headers JSON is invalid.");
        return;
      }
    }

    const bodyRaw = field.optionsSourceBodyRaw.trim();
    if (bodyRaw) {
      try {
        optionsSource.body = JSON.parse(bodyRaw);
      } catch {
        toast.error("Options source body JSON is invalid.");
        return;
      }
    }

    try {
      const result = await previewFieldOptionsMutation.mutateAsync({
        provider: formData.provider,
        optionsSource,
        limit: 2000,
      });
      const merged = new Map<string, InputFieldOptionDraft>();
      for (const option of field.options) {
        const value = option.value.trim();
        if (!value || merged.has(value)) continue;
        merged.set(value, option);
      }
      for (const option of result.options) {
        const value = option.value.trim();
        if (!value || merged.has(value)) continue;
        merged.set(value, {
          id: createDraftId("opt"),
          value: option.value,
          label: option.label,
        });
      }
      updateInputFieldDraft(field.id, {
        searchable: true,
        options: Array.from(merged.values()),
      });
      toast.success(
        `Loaded ${result.options.length} options (${merged.size} total).`
      );
    } catch (error: any) {
      toast.error("Failed to refresh options", {
        description: error?.message || "Unknown error",
      });
    }
  };

  const updatePricingTierDraft = (
    tierId: string,
    patch: Partial<PricingTierDraft>
  ) => {
    setFormData({
      ...formData,
      pricingTierDrafts: formData.pricingTierDrafts.map(tier =>
        tier.id === tierId ? { ...tier, ...patch } : tier
      ),
    });
  };

  const removePricingTierDraft = (tierId: string) => {
    setFormData({
      ...formData,
      pricingTierDrafts: formData.pricingTierDrafts.filter(
        tier => tier.id !== tierId
      ),
    });
  };

  const addPricingTierDraft = () => {
    setFormData({
      ...formData,
      pricingTierDrafts: [
        ...formData.pricingTierDrafts,
        { id: createDraftId("tier"), key: "", value: "" },
      ],
    });
  };

  const inputFieldPreview = JSON.stringify(
    serializeInputFieldDrafts(formData.inputFieldDrafts).fields,
    null,
    2
  );
  const pricingTierPreview = JSON.stringify(
    serializePricingTierDrafts(formData.pricingTierDrafts, formData.creditCost)
      .tiers,
    null,
    2
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
                onChange={e =>
                  setFormData({ ...formData, modelId: e.target.value })
                }
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
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Google Nano Banana Pro"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e =>
                setFormData({ ...formData, description: e.target.value })
              }
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
                onChange={e =>
                  setFormData({ ...formData, provider: e.target.value })
                }
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
                onChange={e =>
                  setFormData({
                    ...formData,
                    creditCost: parseInt(e.target.value) || 0,
                  })
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
                onChange={e =>
                  setFormData({
                    ...formData,
                    priority: parseInt(e.target.value) || 99,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Lower = higher priority (default model)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="transport">Generation Route</Label>
              <Select
                value={formData.transport}
                onValueChange={(value: "gateway_api" | "mcp") =>
                  setFormData({ ...formData, transport: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gateway_api">Gateway API</SelectItem>
                  <SelectItem value="mcp">MCP Connect</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Users choose the model; SmartSpecPro calls this route automatically.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="providerModelId">Provider Model ID</Label>
              <Input
                id="providerModelId"
                value={formData.providerModelId}
                onChange={e =>
                  setFormData({ ...formData, providerModelId: e.target.value })
                }
                placeholder="Upstream model id"
              />
              <p className="text-xs text-muted-foreground">
                Example: z_image, gpt-2, seedance_2_0
              </p>
            </div>
          </div>

          {formData.transport === "mcp" && (
            <div className="grid grid-cols-3 gap-4 rounded-md border p-3">
              <div className="grid gap-2">
                <Label htmlFor="mcpProviderKey">MCP Provider Key</Label>
                <Input
                  id="mcpProviderKey"
                  value={formData.mcpProviderKey}
                  onChange={e =>
                    setFormData({ ...formData, mcpProviderKey: e.target.value })
                  }
                  placeholder="magnific or higgsfield"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcpToolName">MCP Tool</Label>
                <Input
                  id="mcpToolName"
                  value={formData.mcpToolName}
                  onChange={e =>
                    setFormData({ ...formData, mcpToolName: e.target.value })
                  }
                  placeholder="generate_image"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcpArgumentShape">Argument Shape</Label>
                <Input
                  id="mcpArgumentShape"
                  value={formData.mcpArgumentShape}
                  onChange={e =>
                    setFormData({ ...formData, mcpArgumentShape: e.target.value })
                  }
                  placeholder="higgsfield.generate_image"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow this model to be used for generation
              </p>
            </div>
            <Switch
              checked={formData.isEnabled}
              onCheckedChange={checked =>
                setFormData({ ...formData, isEnabled: checked })
              }
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
              onChange={e =>
                setFormData({ ...formData, aliases: e.target.value })
              }
              placeholder="nano banana pro, nano_banana_pro, google nano banana, gemini 3"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of aliases for natural language detection.
              Users can mention any of these in their prompts to use this model.
            </p>
          </div>

          <DashboardCard className="bg-muted/50" title="Example Usage">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">With these aliases, users can say:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  "Generate image of a cat with <strong>nano banana pro</strong>
                  "
                </li>
                <li>
                  "Create a video using <strong>veo 3</strong>"
                </li>
                <li>
                  "Create an image with <strong>flux 2.0</strong>"
                </li>
              </ul>
            </div>
          </DashboardCard>
        </div>
      </TabsContent>

      <TabsContent value="capabilities" className="space-y-4 mt-4">
        <div className="grid gap-4">
          {(formData.modelType === "image" ||
            formData.modelType === "video") && (
            <div className="grid gap-2">
              <Label htmlFor="aspectRatios">Supported Aspect Ratios</Label>
              <Input
                id="aspectRatios"
                value={formData.aspectRatios}
                onChange={e =>
                  setFormData({ ...formData, aspectRatios: e.target.value })
                }
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
                onChange={e =>
                  setFormData({ ...formData, sizes: e.target.value })
                }
                placeholder="1024x1024, 1024x1792, 1792x1024"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported output sizes
              </p>
            </div>
          )}

          {formData.modelType === "video" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="durations">Supported Durations (seconds)</Label>
                <Input
                  id="durations"
                  value={formData.durations}
                  onChange={e =>
                    setFormData({ ...formData, durations: e.target.value })
                  }
                  placeholder="5, 10, 15, 20"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of supported video durations in seconds
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="storyboardClipDurationSeconds">
                  Storyboard Clip Duration (seconds)
                </Label>
                <Input
                  id="storyboardClipDurationSeconds"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={formData.storyboardClipDurationSeconds}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      storyboardClipDurationSeconds: e.target.value,
                    })
                  }
                  placeholder="8"
                />
                <p className="text-xs text-muted-foreground">
                  Media Studio uses this value to calculate how many storyboard
                  prompts are needed when an audio file is attached.
                </p>
              </div>
            </div>
          )}

          {formData.modelType === "audio" && (
            <div className="grid gap-2">
              <Label htmlFor="voices">Available Voices</Label>
              <Textarea
                id="voices"
                value={formData.voices}
                onChange={e =>
                  setFormData({ ...formData, voices: e.target.value })
                }
                placeholder={`Adam\nAlice\nMJ0RnG71ty4LH3dvNfSd\n- Leon - Soothing and Grounded`}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Supports comma/newline list and VoiceID + label format. VoiceID
                will be stored in DB; label will be used in searchable dropdown.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => syncVoiceCatalogToInputField("replace")}
                >
                  Replace Voice Field Options
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => syncVoiceCatalogToInputField("merge")}
                >
                  Merge Into Voice Field
                </Button>
              </div>
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
                onChange={e =>
                  setFormData({ ...formData, apiEndpoint: e.target.value })
                }
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
                onChange={e =>
                  setFormData({ ...formData, apiPayloadFormat: e.target.value })
                }
                placeholder="e.g., veo, market, runway"
              />
              <p className="text-xs text-muted-foreground">
                Payload structure identifier for backend
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiQueryEndpoint">
              Query Endpoint (Status/Result)
            </Label>
            <Input
              id="apiQueryEndpoint"
              value={formData.apiQueryEndpoint}
              onChange={e =>
                setFormData({ ...formData, apiQueryEndpoint: e.target.value })
              }
              placeholder="e.g., /api/v1/veo/record-info?taskId={task_id}"
            />
            <p className="text-xs text-muted-foreground">
              Optional per-model endpoint used for Fetch Result. Supports{" "}
              {"{task_id}"} placeholder.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kieModelId">Kie Model ID</Label>
              <Input
                id="kieModelId"
                value={formData.kieModelId}
                onChange={e =>
                  setFormData({ ...formData, kieModelId: e.target.value })
                }
                placeholder="e.g., wan/2-6-text-to-video"
              />
              <p className="text-xs text-muted-foreground">
                Model identifier sent to Kie AI API
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="generateType">Generate Type</Label>
                {formGenerationModeLabel && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {formGenerationModeLabel}
                  </Badge>
                )}
              </div>
              <Input
                id="generateType"
                value={formData.generateType}
                onChange={e =>
                  setFormData({ ...formData, generateType: e.target.value })
                }
                placeholder="e.g., text-to-video, image-to-video"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxPromptLength">Max Prompt Length</Label>
              <Input
                id="maxPromptLength"
                type="number"
                value={formData.maxPromptLength}
                onChange={e =>
                  setFormData({
                    ...formData,
                    maxPromptLength: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Maximum characters allowed for prompts. Leave as 0 to skip the
                prompt limit.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiConfigRaw">Advanced API Config JSON</Label>
            <Textarea
              id="apiConfigRaw"
              rows={4}
              value={formData.apiConfigRaw}
              onChange={e =>
                setFormData({ ...formData, apiConfigRaw: e.target.value })
              }
              placeholder={`{\n  "omit_text": "true"\n}`}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Optional extra key/value sent in <code>configJson.apiConfig</code>{" "}
              for model-specific behavior.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pricingFormula">Pricing Formula</Label>
            <Select
              value={formData.pricingFormula}
              onValueChange={value =>
                setFormData({ ...formData, pricingFormula: value })
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">
                  Flat (single price or one pricing field)
                </SelectItem>
                <SelectItem value="per_duration">
                  Per Duration (duration field)
                </SelectItem>
                <SelectItem value="matrix">
                  Matrix (combine all pricing fields)
                </SelectItem>
                <SelectItem value="per_unit">
                  Per Unit (characters/items)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Tier keys should match the values from the input fields you mark
              as <code>Affects Pricing</code>.
            </p>
          </div>

          {formData.pricingFormula === "per_unit" && (
            <div className="grid gap-3 rounded-md border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Unit Metric
                  </Label>
                  <Select
                    value={formData.pricingUnitMetric}
                    onValueChange={(value: "characters" | "items") =>
                      setFormData({ ...formData, pricingUnitMetric: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="characters">Characters</SelectItem>
                      <SelectItem value="items">Items</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Source Field Key
                  </Label>
                  <Input
                    value={formData.pricingUnitField}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        pricingUnitField: e.target.value,
                      })
                    }
                    placeholder="text, prompt, dialogue"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Unit Size
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.pricingUnitSize}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        pricingUnitSize: Math.max(
                          1,
                          parseInt(e.target.value, 10) || 1
                        ),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Rounding
                  </Label>
                  <Select
                    value={formData.pricingUnitRounding}
                    onValueChange={(value: "ceil" | "floor" | "round") =>
                      setFormData({ ...formData, pricingUnitRounding: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ceil">Ceil</SelectItem>
                      <SelectItem value="round">Round</SelectItem>
                      <SelectItem value="floor">Floor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Min Units
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.pricingMinUnits}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        pricingMinUnits: Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        ),
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Example: 70 credits per 1,000 characters = formula{" "}
                <code>per_unit</code>, metric <code>characters</code>, source{" "}
                <code>text</code>, unit size <code>1000</code>, rounding{" "}
                <code>ceil</code>, default tier <code>70</code>.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="operationType">Operation Type</Label>
            <Select
              value={formData.operationType}
              onValueChange={(value: MediaOperationType) =>
                setFormData({ ...formData, operationType: value })
              }
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_OPERATION_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for fast filtering and selecting the correct model capability
              (t2i/i2i/t2v/etc.).
            </p>
          </div>

          <div className="grid gap-2 rounded-md border border-slate-200 p-3">
            <Label className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-600" />
              Quick Presets
            </Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Select
                value={selectedPresetId}
                onValueChange={setSelectedPresetId}
              >
                <SelectTrigger className="md:flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Custom (no preset)</SelectItem>
                  {API_CONFIG_PRESETS.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={applyApiConfigPreset}
                disabled={selectedPresetId === "none"}
              >
                Apply Preset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Apply a starter template for popular models. This replaces Input
              Fields and Pricing Tiers with preset values.
            </p>
            {selectedPresetId !== "none" ? (
              <p className="text-xs text-slate-600">
                {
                  API_CONFIG_PRESETS.find(
                    preset => preset.id === selectedPresetId
                  )?.description
                }
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Pricing Tiers</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addPricingTierDraft}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Tier
              </Button>
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              {formData.pricingTierDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No pricing tiers. System will save a default tier
                  automatically.
                </p>
              ) : (
                formData.pricingTierDrafts.map(tier => (
                  <div
                    key={tier.id}
                    className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 p-2 md:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      value={tier.key}
                      onChange={e =>
                        updatePricingTierDraft(tier.id, { key: e.target.value })
                      }
                      placeholder="Tier key (e.g., model, veo3_fast)"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={tier.value}
                      onChange={e =>
                        updatePricingTierDraft(tier.id, {
                          value: e.target.value,
                        })
                      }
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
              Define tier key and credit cost. Example keys: "default", "model",
              "veo3_fast", "720p-10s". Pricing is controlled by the input fields
              marked <code>Affects Pricing</code>.
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Input Fields</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addInputFieldDraft}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Field
              </Button>
            </div>
            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              {formData.inputFieldDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No dynamic fields configured yet.
                </p>
              ) : (
                formData.inputFieldDrafts.map((field, fieldIndex) => (
                  <div
                    key={field.id}
                    className={`space-y-3 rounded-md border p-3 ${dragOverFieldId === field.id ? "border-sky-400 bg-sky-50/50" : "border-slate-100"}`}
                    onDragOver={event => {
                      if (!draggingFieldId) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragOverFieldId !== field.id) {
                        setDragOverFieldId(field.id);
                      }
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      const sourceId =
                        draggingFieldId ||
                        event.dataTransfer.getData("text/plain");
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
                          onDragStart={event => {
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
                        <p className="text-sm font-medium">
                          Field #{fieldIndex + 1}
                        </p>
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
                        onChange={e =>
                          updateInputFieldDraft(field.id, {
                            key: e.target.value,
                          })
                        }
                        placeholder="key (e.g., duration)"
                      />
                      <Input
                        value={field.label}
                        onChange={e =>
                          updateInputFieldDraft(field.id, {
                            label: e.target.value,
                          })
                        }
                        placeholder="label (e.g., Duration)"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <Select
                        value={field.type}
                        onValueChange={value =>
                          updateInputFieldDraft(field.id, {
                            type: value as InputFieldType,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INPUT_FIELD_TYPE_OPTIONS.map(option => (
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
                          onCheckedChange={checked =>
                            updateInputFieldDraft(field.id, {
                              required: checked,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Affects Pricing</span>
                        <Switch
                          checked={field.affectsPricing}
                          onCheckedChange={checked =>
                            updateInputFieldDraft(field.id, {
                              affectsPricing: checked,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Searchable Picker</span>
                        <Switch
                          checked={field.searchable}
                          onCheckedChange={checked =>
                            updateInputFieldDraft(field.id, {
                              searchable: checked,
                            })
                          }
                        />
                      </div>
                    </div>

                    {field.affectsPricing && (
                      <div className="space-y-2 rounded-md border border-amber-100 bg-amber-50/40 p-3">
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">
                            Pricing aliases
                          </Label>
                          <Input
                            value={field.pricingAliases}
                            onChange={e =>
                              updateInputFieldDraft(field.id, {
                                pricingAliases: e.target.value,
                              })
                            }
                            placeholder="referenceVideoUrls, video_url"
                          />
                          <p className="text-xs text-muted-foreground">
                            Alternative payload keys that should count as this
                            pricing field.
                          </p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="grid gap-1">
                            <Label className="text-xs text-muted-foreground">
                              Present label
                            </Label>
                            <Input
                              value={field.pricingPresencePresent}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  pricingPresencePresent: e.target.value,
                                })
                              }
                              placeholder="with-video"
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs text-muted-foreground">
                              Absent label
                            </Label>
                            <Input
                              value={field.pricingPresenceAbsent}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  pricingPresenceAbsent: e.target.value,
                                })
                              }
                              placeholder="without-video"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use presence labels for optional inputs such as video:
                          tier keys become resolution-duration-with-video or
                          resolution-duration-without-video.
                        </p>
                      </div>
                    )}

	                    <div className="grid gap-1">
	                      <Label className="text-xs text-muted-foreground">
	                        Sync with (auto-fill at runtime)
                      </Label>
                      <Select
                        value={field.syncWith}
                        onValueChange={value =>
                          updateInputFieldDraft(field.id, {
                            syncWith: value as SyncTarget,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_TARGET_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
	                      </Select>
	                    </div>

                    <div className="space-y-2 rounded-md border border-sky-100 bg-sky-50/40 p-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                          <span className="text-sm">Hidden</span>
                          <Switch
                            checked={field.hidden}
                            onCheckedChange={checked =>
                              updateInputFieldDraft(field.id, { hidden: checked })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                          <span className="text-sm">Advanced</span>
                          <Switch
                            checked={field.advancedOnly}
                            onCheckedChange={checked =>
                              updateInputFieldDraft(field.id, { advancedOnly: checked })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                          <span className="text-sm">Suite Managed</span>
                          <Switch
                            checked={field.managedBySuite}
                            onCheckedChange={checked =>
                              updateInputFieldDraft(field.id, { managedBySuite: checked })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                        <Input
                          value={field.providerPayloadKey}
                          onChange={e =>
                            updateInputFieldDraft(field.id, { providerPayloadKey: e.target.value })
                          }
                          placeholder="provider key"
                        />
                        <Input
                          value={field.maxItems}
                          onChange={e =>
                            updateInputFieldDraft(field.id, { maxItems: e.target.value })
                          }
                          placeholder="max items"
                        />
                        <Input
                          value={field.referenceUnitWeight}
                          onChange={e =>
                            updateInputFieldDraft(field.id, { referenceUnitWeight: e.target.value })
                          }
                          placeholder="unit weight"
                        />
                        <Input
                          value={field.assetType}
                          onChange={e =>
                            updateInputFieldDraft(field.id, { assetType: e.target.value })
                          }
                          placeholder="asset type"
                        />
                        <Input
                          value={field.assetCapability}
                          onChange={e =>
                            updateInputFieldDraft(field.id, { assetCapability: e.target.value })
                          }
                          placeholder="asset capability"
                        />
                      </div>
                    </div>

	                    <div className="space-y-2 rounded-md border border-slate-100 p-2">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Options Source
                        </Label>
                        <Select
                          value={field.optionsSourceType}
                          onValueChange={value =>
                            updateInputFieldDraft(field.id, {
                              optionsSourceType:
                                value as InputFieldOptionsSourceType,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Manual / Static
                            </SelectItem>
                            <SelectItem value="provider_api">
                              Provider API (uses provider key)
                            </SelectItem>
                            <SelectItem value="public_api">
                              Public API (HTTPS URL)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {field.optionsSourceType !== "none" && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr]">
                            <Input
                              value={field.optionsSourceEndpoint}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceEndpoint: e.target.value,
                                })
                              }
                              placeholder={
                                field.optionsSourceType === "provider_api"
                                  ? "/voice/list"
                                  : "https://api.example.com/voices"
                              }
                            />
                            <Select
                              value={field.optionsSourceMethod}
                              onValueChange={value =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceMethod: value as "GET" | "POST",
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Input
                              value={field.optionsSourceItemsPath}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceItemsPath: e.target.value,
                                })
                              }
                              placeholder="Items path (e.g., voices, data.items)"
                            />
                            <Input
                              value={field.optionsSourceQueryParam}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceQueryParam: e.target.value,
                                })
                              }
                              placeholder="Query param (optional)"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Input
                              value={field.optionsSourceValueField}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceValueField: e.target.value,
                                })
                              }
                              placeholder="Value field (e.g., id, voiceID, name)"
                            />
                            <Input
                              value={field.optionsSourceLabelField}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceLabelField: e.target.value,
                                })
                              }
                              placeholder="Label field (e.g., name)"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Select
                              value={field.optionsSourceValueTransform}
                              onValueChange={value =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceValueTransform: value as
                                    | "none"
                                    | "before_dash",
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Value Transform: None
                                </SelectItem>
                                <SelectItem value="before_dash">
                                  Value Transform: Before Dash
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              value={field.optionsSourceCacheTtlSeconds}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceCacheTtlSeconds: e.target.value,
                                })
                              }
                              placeholder="Cache TTL seconds (optional)"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Textarea
                              rows={3}
                              value={field.optionsSourceHeadersRaw}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceHeadersRaw: e.target.value,
                                })
                              }
                              placeholder='Headers JSON (optional), e.g. {"x-api-version":"1"}'
                              className="font-mono text-xs"
                            />
                            <Textarea
                              rows={3}
                              value={field.optionsSourceBodyRaw}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  optionsSourceBodyRaw: e.target.value,
                                })
                              }
                              placeholder='Body JSON (optional for POST), e.g. {"query":"{{query}}"}'
                              className="font-mono text-xs"
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void refreshInputFieldOptions(field);
                              }}
                              disabled={previewFieldOptionsMutation.isPending}
                            >
                              {previewFieldOptionsMutation.isPending && (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              )}
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                              Fetch / Refresh Options
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {field.optionsSourceType === "provider_api"
                              ? "Provider API source uses the provider API key configured in Admin > Media Providers. Endpoint must be relative path."
                              : "Public API source requires full HTTPS URL and does not use provider credentials."}
                          </p>
                        </div>
                      )}
                    </div>

                    {field.type === "boolean" ? (
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Default Value</span>
                        <Switch
                          checked={field.defaultBoolean}
                          onCheckedChange={checked =>
                            updateInputFieldDraft(field.id, {
                              defaultBoolean: checked,
                            })
                          }
                        />
                      </div>
                    ) : field.type === "array" ? (
                      <div className="grid gap-2">
                        <p className="text-xs text-muted-foreground italic">
                          Values are provided at runtime — no default needed.
                        </p>
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">
                            Item Template JSON (optional)
                          </Label>
                          <Textarea
                            rows={4}
                            value={field.itemTemplateRaw}
                            onChange={e =>
                              updateInputFieldDraft(field.id, {
                                itemTemplateRaw: e.target.value,
                              })
                            }
                            placeholder={`{\n  "text": "{{value}}",\n  "voice": "{{fields.voice}}"\n}`}
                            className="font-mono text-xs"
                          />
                          <p className="text-xs text-muted-foreground">
                            Supports placeholders: <code>{"{{value}}"}</code>,{" "}
                            <code>{"{{item}}"}</code>,{" "}
                            <code>{"{{prompt}}"}</code>,{" "}
                            <code>{"{{fields.someField}}"}</code>.
                          </p>
                        </div>
                      </div>
                    ) : field.type === "library_file" ? (
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Allowed Extensions (comma-separated, e.g.{" "}
                          <code>png,jpg,gif</code>)
                        </Label>
                        <Input
                          value={field.allowedExtensions}
                          onChange={e =>
                            updateInputFieldDraft(field.id, {
                              allowedExtensions: e.target.value,
                            })
                          }
                          placeholder="png,jpg,gif  (leave blank to allow all)"
                        />
                        <p className="text-xs text-muted-foreground italic">
                          User picks a file from the Library at runtime — no
                          default needed.
                        </p>
                      </div>
                    ) : field.type === "provider_asset_picker" ? (
                      <p className="text-xs text-muted-foreground italic">
                        Provider asset values are selected by the runtime suite UI and saved as provider IDs.
                      </p>
                    ) : field.type === "select" ||
                      field.searchable ||
                      field.optionsSourceType !== "none" ? (
                      <div className="space-y-2 rounded-md border border-slate-100 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Options</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addInputFieldOption(field.id)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Option
                          </Button>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-muted-foreground">
                            Bulk Import (supports plain list or VoiceID + "-
                            Label")
                          </Label>
                          <Textarea
                            rows={5}
                            value={bulkOptionsByField[field.id] ?? ""}
                            onChange={e =>
                              setBulkOptionsText(field.id, e.target.value)
                            }
                            placeholder={`Adam\nAlice\nMJ0RnG71ty4LH3dvNfSd\n- Leon - Soothing and Grounded`}
                            className="font-mono text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                applyBulkOptionsToField(field, "replace")
                              }
                            >
                              Replace With Imported
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                applyBulkOptionsToField(field, "merge")
                              }
                            >
                              Merge Imported
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setBulkOptionsText(field.id, "")}
                            >
                              Clear Input
                            </Button>
                          </div>
                        </div>
                        {field.options.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No options yet.
                          </p>
                        ) : (
                          field.options.map(option => (
                            <div
                              key={option.id}
                              className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]"
                            >
                              <Input
                                value={option.value}
                                onChange={e =>
                                  updateInputFieldOption(field.id, option.id, {
                                    value: e.target.value,
                                  })
                                }
                                placeholder="value (e.g., 10)"
                              />
                              <Input
                                value={option.label}
                                onChange={e =>
                                  updateInputFieldOption(field.id, option.id, {
                                    label: e.target.value,
                                  })
                                }
                                placeholder="label (e.g., 10s)"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  removeInputFieldOption(field.id, option.id)
                                }
                                aria-label="Remove option"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))
                        )}

                        {field.type === "select" ? (
                          <div className="grid gap-1">
                            <Label className="text-xs text-muted-foreground">
                              Default Option
                            </Label>
                            <Select
                              value={
                                field.options.some(
                                  option =>
                                    option.value === field.defaultRaw &&
                                    option.value.trim().length > 0
                                )
                                  ? field.defaultRaw
                                  : "__none__"
                              }
                              onValueChange={value =>
                                updateInputFieldDraft(field.id, {
                                  defaultRaw: value === "__none__" ? "" : value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select default option" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  No default
                                </SelectItem>
                                {field.options
                                  .filter(
                                    option => option.value.trim().length > 0
                                  )
                                  .map(option => (
                                    <SelectItem
                                      key={option.id}
                                      value={option.value}
                                    >
                                      {option.label.trim() || option.value}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="grid gap-1">
                            <Label className="text-xs text-muted-foreground">
                              Default Value
                            </Label>
                            <Input
                              value={field.defaultRaw}
                              onChange={e =>
                                updateInputFieldDraft(field.id, {
                                  defaultRaw: e.target.value,
                                })
                              }
                              placeholder="Default value"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">
                          Default Value
                        </Label>
                        <Input
                          type={field.type === "number" ? "number" : "text"}
                          value={field.defaultRaw}
                          onChange={e =>
                            updateInputFieldDraft(field.id, {
                              defaultRaw: e.target.value,
                            })
                          }
                          placeholder={
                            field.type === "number" ? "0" : "Default value"
                          }
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Fill fields in form mode, drag by the handle to reorder, and
              system converts everything to valid JSON automatically.
            </p>
          </div>

          <DashboardCard
            className="bg-slate-50"
            title="Generated JSON Preview (read-only)"
            leading={<Code className="h-4 w-4 text-slate-500" />}
          >
            <div className="space-y-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">
                  pricingTiers
                </Label>
                <Textarea
                  value={pricingTierPreview}
                  readOnly
                  rows={4}
                  className="font-mono text-xs bg-white"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">
                  inputFields
                </Label>
                <Textarea
                  value={inputFieldPreview}
                  readOnly
                  rows={8}
                  className="font-mono text-xs bg-white"
                />
              </div>
            </div>
          </DashboardCard>
        </div>
      </TabsContent>
    </Tabs>
  );
}
