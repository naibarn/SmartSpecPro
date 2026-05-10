/**
 * Media History Page - SmartAIHub
 * View and manage media generation tasks
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  Image,
  Video,
  Music,
  Download,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Zap,
  FileImage,
  Play,
  Trash2,
  ImagePlus,
  Info,
  Copy,
  Check,
  LayoutGrid,
  List,
  Maximize2,
  MoreHorizontal,
  Share2,
  Library,
  ArrowUpRight,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ExpiredMediaPlaceholder from "@/components/media/ExpiredMediaPlaceholder";
import { ShareDialog } from "@/components/library/ShareDialog";
import { LocaleToggle } from "@/components/LocaleToggle";
import { HelpButton } from "@/components/help";
import { formatRelativeTime } from "@/i18n/formatters";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  buildTaskLibraryErrorState,
  buildTaskLibraryStateFromAddResult,
  getLibraryStatusMeta as getLibraryItemStatusMeta,
  isMediaTaskEligibleForLibraryAdd,
  type LibrarySearchResultItem,
  type TaskLibraryUIState,
} from "@/lib/libraryUi";
import {
  extractReferenceImageConfig,
  extractReferenceMediaAssets,
  type MediaHistoryReferenceMediaAsset,
  type MediaHistoryReferenceImageConfig,
} from "@/lib/mediaHistoryDebug";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video" | "audio";
type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
type HistoryViewMode = "list" | "gallery";
type Translator = (
  key: string,
  params?: Record<string, string | number>
) => string;

const MEDIA_HISTORY_PAGE_SIZE = 50;

interface MediaTask {
  id: string;
  taskId?: string; // External provider task ID (e.g., Kie.ai)
  celeryTaskId?: string; // Internal Celery task UUID for tracking/monitoring
  mediaType: MediaType;
  status: TaskStatus;
  model: string;
  prompt: string;
  parameters?: Record<string, unknown>;
  resultUrl?: string;
  resultData?: Record<string, unknown>;
  creditsUsed?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

const statusConfig: Record<
  TaskStatus,
  { labelKey: string; color: string; icon: React.ElementType }
> = {
  pending: {
    labelKey: "pending",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
  },
  processing: {
    labelKey: "processing",
    color: "bg-blue-100 text-blue-800",
    icon: Loader2,
  },
  completed: {
    labelKey: "completed",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle,
  },
  failed: {
    labelKey: "failed",
    color: "bg-red-100 text-red-800",
    icon: XCircle,
  },
  cancelled: {
    labelKey: "cancelled",
    color: "bg-gray-100 text-gray-800",
    icon: AlertCircle,
  },
};

const mediaTypeConfig: Record<
  MediaType,
  { labelKey: string; icon: React.ElementType; color: string }
> = {
  image: { labelKey: "image", icon: Image, color: "text-purple-600" },
  video: { labelKey: "video", icon: Video, color: "text-blue-600" },
  audio: { labelKey: "audio", icon: Music, color: "text-green-600" },
};

const fallbackStatusConfig = {
  labelKey: "historyPage.status.unknown",
  color: "bg-gray-100 text-gray-800",
  icon: AlertCircle,
};

const fallbackMediaTypeConfig = {
  labelKey: "historyPage.status.unknown",
  icon: FileImage,
  color: "text-gray-500",
};

function getStatusMeta(status: string | undefined, t: Translator) {
  const config = statusConfig[status as TaskStatus] || fallbackStatusConfig;
  return {
    ...config,
    label: t(config.labelKey),
  };
}

function getMediaTypeMeta(mediaType: string | undefined, t: Translator) {
  const config =
    mediaTypeConfig[mediaType as MediaType] || fallbackMediaTypeConfig;
  return {
    ...config,
    label: t(config.labelKey),
  };
}

function canManuallyFetchTaskResult(
  task: MediaTask | null | undefined
): boolean {
  return Boolean(
    task?.taskId && !task?.resultUrl && task?.status !== "cancelled"
  );
}

function getTaskFetchResultLabel(
  task: MediaTask | null | undefined,
  t: Translator
): string {
  if (!task) return t("historyPage.actions.fetchUrl");
  return task.status === "failed" || task.status === "cancelled"
    ? t("historyPage.actions.refetchUrl")
    : t("historyPage.actions.fetchUrl");
}

function getTaskFetchResultTitle(
  task: MediaTask | null | undefined,
  t: Translator
): string {
  if (!task) return t("historyPage.tooltips.fetchUrl");
  return task.status === "failed" || task.status === "cancelled"
    ? t("historyPage.tooltips.refetchUrl")
    : t("historyPage.tooltips.fetchUrl");
}

function getLocalizedLibraryStatusMeta(
  status: string | undefined,
  t: Translator
) {
  const meta = getLibraryItemStatusMeta(status);
  const normalizedStatus = (status || "").toLowerCase();
  const labelKey =
    normalizedStatus === "ready"
      ? "historyPage.library.status.ready"
      : normalizedStatus === "failed"
        ? "historyPage.library.status.failed"
        : normalizedStatus === "indexing"
          ? "historyPage.library.status.indexing"
          : normalizedStatus === "archived"
            ? "historyPage.library.status.archived"
            : "historyPage.library.status.notAdded";

  return {
    ...meta,
    label: t(labelKey),
  };
}

function getTaskLibraryDisplayLabel(
  state: TaskLibraryUIState | null | undefined,
  t: Translator
): string {
  if (state?.action === "adding") return t("historyPage.library.adding");
  if (state?.action === "error") return t("historyPage.library.failed");

  const normalizedStatus = (state?.status || "").toLowerCase();
  const status = getLocalizedLibraryStatusMeta(state?.status, t);
  if (normalizedStatus === "ready") return t("historyPage.library.inLibrary");
  if (!normalizedStatus) return t("historyPage.library.notInLibrary");
  return t("historyPage.library.state", { status: status.label });
}

function extractTaskErrorInfo(
  task: MediaTask | null,
  t?: Translator
): {
  summary: string;
  details: string[];
  stateHint?: string;
  codeHint?: string;
} | null {
  if (!task) return null;

  const seen = new Set<string>();
  const details: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    details.push(normalized);
  };

  const resultData = task.resultData;
  const visited = new WeakSet<object>();
  const walk = (value: unknown, depth = 0) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (typeof value === "string") {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    const priorityKeys = [
      "error",
      "errorMessage",
      "failMsg",
      "message",
      "msg",
      "detail",
      "reason",
    ];
    for (const key of priorityKeys) {
      if (key in obj) walk(obj[key], depth + 1);
    }

    const nestedKeys = [
      "data",
      "response",
      "submission",
      "output",
      "result",
      "resultJson",
      "kie_ai_response",
      "raw_response",
    ];
    for (const key of nestedKeys) {
      if (key in obj) walk(obj[key], depth + 1);
    }
  };

  const findScalar = (
    value: unknown,
    keys: string[],
    depth = 0
  ): string | undefined => {
    if (depth > 5 || value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findScalar(item, keys, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof value !== "object") return undefined;
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim())
        return candidate.trim();
      if (typeof candidate === "number" || typeof candidate === "boolean")
        return String(candidate);
    }
    for (const nested of Object.values(obj)) {
      const found = findScalar(nested, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  push(task.errorMessage);
  if (resultData) walk(resultData);

  const stateHint = findScalar(resultData, [
    "state",
    "status",
    "task_state",
    "taskStatus",
    "successFlag",
  ]);
  const codeHint = findScalar(resultData, [
    "errorCode",
    "code",
    "statusCode",
    "status_code",
  ]);

  const summary =
    details[0] ||
    (task.status === "failed"
      ? t?.("historyPage.details.errorSummaryFallback") ||
        "Generation failed, but provider did not return a clear error message."
      : "");

  if (!summary) return null;

  return {
    summary,
    details: details.slice(0, 8),
    stateHint,
    codeHint,
  };
}

function extractTaskDebugInfo(task: MediaTask | null): {
  traceId?: string;
  providerHint?: string;
  logFile?: string;
} | null {
  if (!task) return null;

  const resultData =
    task.resultData && typeof task.resultData === "object"
      ? (task.resultData as Record<string, unknown>)
      : {};
  const parameters =
    task.parameters && typeof task.parameters === "object"
      ? (task.parameters as Record<string, unknown>)
      : {};

  const debugObj =
    resultData.debug && typeof resultData.debug === "object"
      ? (resultData.debug as Record<string, unknown>)
      : {};

  const apiConfigRaw = parameters.api_config ?? parameters.apiConfig;
  const apiConfig =
    apiConfigRaw && typeof apiConfigRaw === "object"
      ? (apiConfigRaw as Record<string, unknown>)
      : {};

  const traceId =
    typeof debugObj.trace_id === "string" && debugObj.trace_id.trim()
      ? debugObj.trace_id.trim()
      : typeof apiConfig.trace_id === "string" && apiConfig.trace_id.trim()
        ? apiConfig.trace_id.trim()
        : undefined;
  const providerHint =
    typeof debugObj.provider_hint === "string" && debugObj.provider_hint.trim()
      ? debugObj.provider_hint.trim()
      : typeof apiConfig.provider === "string" && apiConfig.provider.trim()
        ? apiConfig.provider.trim()
        : undefined;
  const logFile =
    typeof debugObj.log_file === "string" && debugObj.log_file.trim()
      ? debugObj.log_file.trim()
      : undefined;

  if (!traceId && !providerHint && !logFile) return null;
  return { traceId, providerHint, logFile };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readFirstHttpUrl(
  value: unknown,
  visited = new WeakSet<object>()
): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstHttpUrl(item, visited);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (visited.has(record)) return null;
  visited.add(record);

  for (const nestedValue of Object.values(record)) {
    const found = readFirstHttpUrl(nestedValue, visited);
    if (found) return found;
  }

  return null;
}

function findFirstScalarString(
  value: unknown,
  keys: string[],
  visited = new WeakSet<object>(),
  depth = 0
): string | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstScalarString(item, keys, visited, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (visited.has(record)) return null;
  visited.add(record);

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }

  for (const nestedValue of Object.values(record)) {
    const found = findFirstScalarString(nestedValue, keys, visited, depth + 1);
    if (found) return found;
  }

  return null;
}

function findFirstNumber(
  value: unknown,
  keys: string[],
  visited = new WeakSet<object>(),
  depth = 0
): number | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstNumber(item, keys, visited, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (visited.has(record)) return null;
  visited.add(record);

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const found = findFirstNumber(nestedValue, keys, visited, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

function extractMediaHistoryResultUrl(task: MediaTask): string | null {
  return (
    (typeof task.resultUrl === "string" && task.resultUrl.trim() ? task.resultUrl.trim() : null) ||
    readFirstHttpUrl(task.resultData?.resultUrl) ||
    readFirstHttpUrl(task.resultData?.result_url) ||
    readFirstHttpUrl(task.resultData?.url) ||
    readFirstHttpUrl(task.resultData?.videoUrl) ||
    readFirstHttpUrl(task.resultData?.video_url) ||
    readFirstHttpUrl(task.resultData?.imageUrl) ||
    readFirstHttpUrl(task.resultData?.image_url) ||
    readFirstHttpUrl(task.resultData?.audioUrl) ||
    readFirstHttpUrl(task.resultData?.audio_url) ||
    readFirstHttpUrl(task.resultData?.output) ||
    readFirstHttpUrl(task.resultData?.data) ||
    readFirstHttpUrl(task.resultData?.response) ||
    readFirstHttpUrl(task.resultData?.resultJson) ||
    null
  );
}

function extractMediaHistoryExternalTaskId(task: MediaTask): string | null {
  return (
    task.taskId?.trim() ||
    task.celeryTaskId?.trim() ||
    findFirstScalarString(task.parameters, [
      "taskId",
      "task_id",
      "externalTaskId",
      "external_task_id",
      "providerTaskId",
      "provider_task_id",
      "jobId",
      "job_id",
      "requestId",
      "request_id",
      "linkedProviderTaskId",
      "linkedBackendTaskId",
    ]) ||
    findFirstScalarString(task.resultData, [
      "taskId",
      "task_id",
      "externalTaskId",
      "external_task_id",
      "providerTaskId",
      "provider_task_id",
      "jobId",
      "job_id",
      "requestId",
      "request_id",
      "linkedProviderTaskId",
      "linkedBackendTaskId",
    ])
  );
}

function extractMediaHistoryCreditsUsed(task: MediaTask): number | null {
  if (typeof task.creditsUsed === "number" && Number.isFinite(task.creditsUsed)) {
    return task.creditsUsed;
  }
  return findFirstNumber(task.parameters, [
    "creditsUsed",
    "credits_used",
    "creditCost",
    "credit_cost",
    "__reserved_credits",
  ]) ?? findFirstNumber(task.resultData, [
    "creditsUsed",
    "credits_used",
    "creditCost",
    "credit_cost",
    "__reserved_credits",
  ]);
}

function extractMediaHistoryThumbnailUrl(task: MediaTask): string | null {
  const resultData = task.resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }

  const parsedResultJson =
    typeof resultData.resultJson === "string"
      ? (() => {
          try {
            return JSON.parse(resultData.resultJson);
          } catch {
            return null;
          }
        })()
      : null;

  return (
    readFirstHttpUrl(resultData.poster) ||
    readFirstHttpUrl(resultData.poster_url) ||
    readFirstHttpUrl(resultData.posterUrl) ||
    readFirstHttpUrl(resultData.thumbnail) ||
    readFirstHttpUrl(resultData.thumbnail_url) ||
    readFirstHttpUrl(resultData.thumbnailUrl) ||
    readFirstHttpUrl(parsedResultJson?.poster) ||
    readFirstHttpUrl(parsedResultJson?.poster_url) ||
    readFirstHttpUrl(parsedResultJson?.thumbnail) ||
    readFirstHttpUrl(parsedResultJson?.thumbnail_url) ||
    null
  );
}

export function buildFallbackApiUrl(
  providerHint: string | undefined,
  endpoint: string | undefined,
  baseUrl?: string | undefined
): string | undefined {
  if (!endpoint) return undefined;
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }
  const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (normalizedBaseUrl) {
    return `${normalizedBaseUrl.replace(/\/+$/, "")}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  }
  const normalizedProvider = String(providerHint || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  const fallbackBaseUrl = (() => {
    if (normalizedProvider === "uvoice") return "https://api.uvoice.ai";
    if (normalizedProvider === "wavespeed_ai" || normalizedProvider === "wavespeed") {
      return "https://api.wavespeed.ai/api/v3";
    }
    if (normalizedProvider === "magnific" || normalizedProvider === "magnific_ai") {
      return "https://api.magnific.com";
    }
    if (normalizedProvider === "fal_ai" || normalizedProvider === "fal") {
      return "https://fal.run";
    }
    if (normalizedProvider === "kie_ai" || normalizedProvider === "kie" || !normalizedProvider) {
      return "https://api.kie.ai/api/v1";
    }
    return undefined;
  })();
  if (!fallbackBaseUrl) return undefined;
  return `${fallbackBaseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

function sanitizeDebugPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeDebugPayload(item));
  }
  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("api_key") ||
      lower.includes("apikey") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("authorization") ||
      lower.includes("password")
    ) {
      next[key] = "***redacted***";
      continue;
    }
    next[key] = sanitizeDebugPayload(raw);
  }
  return next;
}

function extractStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => (typeof item === "string" ? [item] : []))
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  return [];
}

function extractReferenceImageUrls(
  task: MediaTask | null,
  apiDebugInfo: TaskApiDebugInfo | null
): string[] {
  const urls = new Set<string>();
  const push = (value: unknown) => {
    for (const url of extractStringList(value)) {
      urls.add(url);
    }
  };

  const payload = toRecord(apiDebugInfo?.requestPayload);
  const parameters = toRecord(task?.parameters);

  push(payload?.reference_image_urls);
  push(payload?.referenceImageUrls);
  push(payload?.image_input);
  push(payload?.image_urls);

  const extraParams = toRecord(payload?.extra_params ?? payload?.extraParams);
  push(extraParams?.reference_image_urls);
  push(extraParams?.referenceImageUrls);
  push(extraParams?.image_input);
  push(extraParams?.image_urls);

  push(parameters?.referenceImageUrls);
  push(parameters?.reference_image_urls);
  push(parameters?.imageInput);
  push(parameters?.image_input);

  return Array.from(urls);
}

type TaskApiDebugInfo = {
  providerHint?: string;
  endpoint?: string;
  requestUrl?: string;
  method?: string;
  requestModel?: string;
  requestText?: string;
  voiceId?: string;
  requestPayload?: unknown;
  responseStatus?: number;
  responseMessage?: string;
  responseBody?: string;
  responseJson?: unknown;
  providerMessage?: string;
  providerDetail?: unknown;
};

function extractTaskApiDebugInfo(
  task: MediaTask | null
): TaskApiDebugInfo | null {
  if (!task) return null;

  const resultData = toRecord(task.resultData) ?? {};
  const parameters = toRecord(task.parameters) ?? {};
  const debugObj = toRecord(resultData.debug) ?? {};
  const apiDebug = toRecord(debugObj.api) ?? {};
  const failureObj = toRecord(resultData.failure) ?? {};
  const submission = toRecord(resultData.submission) ?? {};
  const kieResponse = toRecord(resultData.kie_ai_response);
  const providerDetail = toRecord(failureObj.provider_detail);
  const providerDebug = toRecord(providerDetail?.debug);
  const providerApi = toRecord(providerDebug?.api);

  const apiConfigRaw = parameters.api_config ?? parameters.apiConfig;
  const apiConfig = toRecord(apiConfigRaw) ?? {};
  const extraParamsRaw = parameters.extra_params ?? parameters.extraParams;
  const extraParams = toRecord(extraParamsRaw) ?? {};
  const apiRequestPayload = toRecord(apiDebug.request_payload);
  const providerRequestPayload = toRecord(providerApi?.request_payload);

  const providerHint = pickString(
    apiDebug.provider,
    providerApi?.provider,
    debugObj.provider_hint,
    providerDebug?.provider_hint,
    submission.provider,
    apiConfig.provider
  );
  const endpoint = pickString(
    apiDebug.endpoint,
    providerApi?.endpoint,
    submission.submit_endpoint,
    apiConfig.endpoint,
    apiConfig.api_endpoint,
    apiConfig.apiEndpoint
  );
  const requestBaseUrl = pickString(
    apiDebug.base_url,
    apiDebug.baseUrl,
    providerApi?.base_url,
    providerApi?.baseUrl,
    submission.base_url,
    apiConfig.base_url,
    apiConfig.baseUrl,
    apiConfig.url
  );
  const requestUrl = pickString(
    apiDebug.request_url,
    apiDebug.api_url,
    providerApi?.request_url,
    providerApi?.api_url,
    buildFallbackApiUrl(providerHint, endpoint, requestBaseUrl)
  );
  const method = pickString(apiDebug.method, providerApi?.method, "POST");
  const voiceId = pickString(
    apiDebug.voice_id,
    apiDebug.selected_voice_id,
    providerApi?.voice_id,
    debugObj.selected_voice_id,
    providerDebug?.selected_voice_id,
    parameters.voice_id,
    parameters.voiceId,
    parameters.voice,
    extraParams.voiceID,
    extraParams.voiceId,
    extraParams.voice_id,
    extraParams.voice
  );
  const requestModel = pickString(
    apiDebug.model,
    providerApi?.model,
    apiRequestPayload?.model,
    providerRequestPayload?.model,
    parameters.model,
    task.model
  );
  const requestText = pickString(
    apiDebug.request_text,
    providerApi?.request_text,
    apiRequestPayload?.text,
    apiRequestPayload?.prompt,
    apiRequestPayload?.input,
    providerRequestPayload?.text,
    providerRequestPayload?.prompt,
    providerRequestPayload?.input,
    task.prompt
  );
  const fallbackRequestPayload = {
    model: requestModel || task.model,
    text: requestText || task.prompt,
    voice_id: voiceId,
    parameters,
  };
  const requestPayload = sanitizeDebugPayload(
    apiDebug.request_payload ??
      providerApi?.request_payload ??
      (Object.keys(parameters).length > 0
        ? fallbackRequestPayload
        : undefined) ??
      fallbackRequestPayload
  );
  const responseStatusRaw =
    apiDebug.response_status ??
    providerApi?.response_status ??
    failureObj.http_status_code ??
    kieResponse?.code ??
    resultData.status_code;
  const responseStatus =
    typeof responseStatusRaw === "number"
      ? responseStatusRaw
      : typeof responseStatusRaw === "string" && responseStatusRaw.trim()
        ? Number(responseStatusRaw)
        : undefined;
  const responseBody = pickString(
    apiDebug.response_body,
    providerApi?.response_body
  );
  const responseJson = sanitizeDebugPayload(
    apiDebug.response_json ??
      providerApi?.response_json ??
      failureObj.provider_response ??
      resultData.kie_ai_response ??
      resultData.raw_response ??
      resultData.response
  );
  const providerMessage = pickString(
    failureObj.provider_message,
    providerDetail?.message,
    providerDetail?.detail,
    providerDetail?.error,
    resultData.failMsg,
    kieResponse?.failMsg,
    kieResponse?.errorMessage,
    kieResponse?.msg,
    kieResponse?.message
  );
  const responseMessage = pickString(
    apiDebug.response_message,
    providerApi?.response_message,
    apiDebug.message,
    providerApi?.message,
    resultData.message,
    resultData.msg,
    failureObj.message,
    failureObj.error,
    providerMessage
  );

  if (
    !providerHint &&
    !endpoint &&
    !requestUrl &&
    !requestModel &&
    !requestText &&
    !voiceId &&
    !requestPayload &&
    !responseBody &&
    !responseJson &&
    !responseMessage &&
    !providerMessage &&
    !responseStatus
  ) {
    return null;
  }

  return {
    providerHint,
    endpoint,
    requestUrl,
    method,
    requestModel,
    requestText,
    voiceId,
    requestPayload,
    responseStatus: Number.isFinite(responseStatus as number)
      ? Number(responseStatus)
      : undefined,
    responseMessage,
    responseBody,
    responseJson,
    providerMessage,
    providerDetail: sanitizeDebugPayload(failureObj.provider_detail),
  };
}

function formatReferenceImageConfigLabel(
  config: MediaHistoryReferenceImageConfig | null | undefined,
  t: Translator
): string {
  if (!config) return "";
  const title = config.label?.trim() || config.key;
  return `${title} (${config.key}, ${config.type})`;
}

function getReferenceMediaAssetLabel(
  asset: MediaHistoryReferenceMediaAsset,
  t: Translator
): string {
  return asset.kind === "video"
    ? t("historyPage.reference.videoReference")
    : t("historyPage.reference.imageReference");
}

function formatReferenceMediaSourceLabel(
  source: MediaHistoryReferenceImageConfig["source"] | undefined,
  t: Translator
): string {
  if (source === "request_payload")
    return t("historyPage.reference.source.requestPayload");
  if (source === "task_parameters")
    return t("historyPage.reference.source.taskParameters");
  return t("historyPage.reference.source.unknown");
}

function getReferenceMediaTooltipText(
  asset: MediaHistoryReferenceMediaAsset,
  config?: MediaHistoryReferenceImageConfig | null,
  t?: Translator
): string[] {
  const translate = t ?? ((key: string) => key);
  const unknown = translate("historyPage.reference.tooltip.unknown");
  const lines = [
    translate("historyPage.reference.tooltip.assetType", {
      type:
        asset.kind === "video"
          ? translate("video")
          : asset.kind === "image"
            ? translate("image")
            : asset.kind,
    }),
    translate("historyPage.reference.tooltip.resolvedField", {
      field: config?.label?.trim() || config?.key || unknown,
    }),
    translate("historyPage.reference.tooltip.fieldKey", {
      key: config?.key || unknown,
    }),
    translate("historyPage.reference.tooltip.fieldType", {
      type: config?.type || unknown,
    }),
    translate("historyPage.reference.tooltip.source", {
      source: config
        ? formatReferenceMediaSourceLabel(config.source, translate)
        : unknown,
    }),
  ];
  return lines;
}

function VideoThumbnailCard({
  src,
  thumbnailUrl,
  alt,
  className,
  onError,
}: {
  src: string;
  thumbnailUrl?: string | null;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [src, thumbnailUrl]);

  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.currentTime = 0.5;
    } catch {
      // Some browsers disallow immediate seeks until metadata is fully ready.
    }
  }, []);

  const useImageThumbnail = Boolean(thumbnailUrl) && !thumbnailFailed;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-slate-950",
        className
      )}
    >
      {useImageThumbnail ? (
        <img
          src={thumbnailUrl!}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setThumbnailFailed(true)}
        />
      ) : (
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onError={onError}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
        <div className="rounded-full bg-black/55 p-3 text-white">
          <Play className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function MediaHistory() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t, locale } = useScopedTranslation(["media", "common"]);
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | "all">(
    "all"
  );
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fetchingResultTaskId, setFetchingResultTaskId] = useState<
    string | null
  >(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [taskLibraryState, setTaskLibraryState] = useState<
    Record<string, TaskLibraryUIState>
  >({});
  const [shareDialogTarget, setShareDialogTarget] = useState<{
    itemId: number;
    title: string;
  } | null>(null);
  const [fullscreenTask, setFullscreenTask] = useState<MediaTask | null>(null);
  const [fullscreenReferenceMedia, setFullscreenReferenceMedia] =
    useState<MediaHistoryReferenceMediaAsset | null>(null);
  const [copiedPromptTaskId, setCopiedPromptTaskId] = useState<string | null>(
    null
  );
  const [copiedDebugTaskId, setCopiedDebugTaskId] = useState<string | null>(
    null
  );
  const [expiredUrls, setExpiredUrls] = useState<Set<string>>(() => new Set());
  const markExpired = useCallback((url: string) => {
    setExpiredUrls(prev => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);
  const trpcUtils = trpc.useUtils();

  // Fetch tasks from API - only last 12 days
  const {
    data: tasksData,
    isLoading: tasksLoading,
    isError: tasksIsError,
    error: tasksError,
    refetch,
  } = trpc.media.listTasks.useQuery({
    mediaType: mediaTypeFilter !== "all" ? mediaTypeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: MEDIA_HISTORY_PAGE_SIZE,
    offset: currentPage * MEDIA_HISTORY_PAGE_SIZE,
    daysAgo: 12, // Only show tasks from last 12 days
  });
  const tasks: MediaTask[] = useMemo(
    () => (tasksData?.tasks || []).map((task: MediaTask) => {
      const resultUrl = extractMediaHistoryResultUrl(task);
      return resultUrl && resultUrl !== task.resultUrl
        ? { ...task, resultUrl }
        : task;
    }),
    [tasksData?.tasks]
  );
  const totalTasks = tasksData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalTasks / MEDIA_HISTORY_PAGE_SIZE));
  const hasPreviousPage = currentPage > 0;
  const hasNextPage = (currentPage + 1) * MEDIA_HISTORY_PAGE_SIZE < totalTasks;
  const trimmedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleTasks = useMemo(() => {
    if (!trimmedSearchQuery) return tasks;
    return tasks.filter(task => {
      const externalTaskId = extractMediaHistoryExternalTaskId(task) || "";
      const errorInfo = extractTaskErrorInfo(task, t);
      const searchable = [
        task.id,
        task.taskId,
        task.celeryTaskId,
        externalTaskId,
        task.mediaType,
        task.status,
        task.model,
        task.prompt,
        errorInfo?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(trimmedSearchQuery);
    });
  }, [tasks, trimmedSearchQuery, t]);
  const hasActiveFilters =
    mediaTypeFilter !== "all" || statusFilter !== "all" || searchQuery.trim().length > 0;

  const { data: recentLibraryData } = trpc.library.search.useQuery(
    {
      limit: 50,
      filters: {
        recentDays: 30,
      },
    },
    {
      enabled: tasks.length > 0,
      staleTime: 30_000,
    }
  );
  const recentLibraryResults = (recentLibraryData?.results ||
    []) as LibrarySearchResultItem[];

  // Mutation for fetching task result from provider
  const fetchResultMutation = trpc.media.fetchTaskResult.useMutation();

  // Mutation for deleting a task
  const deleteTaskMutation = trpc.media.deleteTask.useMutation({
    onSuccess: () => {
      // Close dialog if the deleted task was selected
      if (selectedTask) {
        setDetailsOpen(false);
        setSelectedTask(null);
      }
      // Refetch the list to update the table
      refetch();
    },
  });

  // Mutation for importing file from URL to storage
  const importFromUrlMutation = trpc.gallery.importFromUrl.useMutation();
  const addToLibraryMutation = trpc.media.addTaskToLibrary.useMutation();

  // Mutation for adding to gallery (admin only)
  const addToGalleryMutation = trpc.gallery.create.useMutation({
    onSuccess: () => {
      toast.success(t("historyPage.toasts.addedToGallery"));
    },
    onError: error => {
      toast.error(
        t("historyPage.toasts.failedToAddToGallery", { message: error.message })
      );
    },
  });

  // State for tracking gallery import in progress
  const [importingTaskId, setImportingTaskId] = useState<string | null>(null);

  const runFetchTaskResult = useCallback(
    async (task: MediaTask, options?: { silent?: boolean }) => {
      if (!canManuallyFetchTaskResult(task)) return null;

      setFetchingResultTaskId(task.id);
      try {
        const result = await fetchResultMutation.mutateAsync({
          taskId: task.id,
        });
        if (result.task) {
          setSelectedTask(current =>
            current?.id === task.id ? (result.task as MediaTask) : current
          );
        }
        await refetch();

        if (!options?.silent) {
          if (result.task?.resultUrl) {
            toast.success(t("historyPage.toasts.syncedResultUrl"));
          } else {
            toast.info(t("historyPage.toasts.checkedProviderStatus"));
          }
        }

        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("historyPage.toasts.failedToFetchTaskResult");
        if (!options?.silent) {
          toast.error(message);
        }
        throw error;
      } finally {
        setFetchingResultTaskId(current =>
          current === task.id ? null : current
        );
      }
    },
    [fetchResultMutation, refetch]
  );

  const libraryItemsBySourceUrl = useMemo(() => {
    const map = new Map<string, TaskLibraryUIState>();
    for (const item of recentLibraryResults) {
      const sourceUrl = item.source_url?.trim();
      if (!sourceUrl) continue;
      map.set(sourceUrl, {
        action: "added",
        itemId: item.item_id,
        status: item.status,
      });
    }
    return map;
  }, [recentLibraryResults]);

  const getEffectiveTaskLibraryState = useCallback(
    (task: MediaTask): TaskLibraryUIState | undefined => {
      const localState = taskLibraryState[task.id];
      if (localState) return localState;
      const sourceUrl = task.resultUrl?.trim();
      if (!sourceUrl) return undefined;
      return libraryItemsBySourceUrl.get(sourceUrl);
    },
    [libraryItemsBySourceUrl, taskLibraryState]
  );

  const handleDeleteTask = async (taskId: string) => {
    if (confirm(t("historyPage.confirm.deleteTask"))) {
      await deleteTaskMutation.mutateAsync({ taskId });
    }
  };

  // Handle checkbox selection
  const handleSelectTask = (taskId: string, checked: boolean) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTaskIds(new Set(visibleTasks.map(t => t.id)));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const count = selectedTaskIds.size;
    if (count === 0) return;

    const confirmMessage =
      count === 1
        ? t("historyPage.confirm.deleteSelected.one", { count })
        : t("historyPage.confirm.deleteSelected.other", { count });
    if (confirm(confirmMessage)) {
      toast.promise(
        Promise.all(
          Array.from(selectedTaskIds).map(taskId =>
            deleteTaskMutation.mutateAsync({ taskId })
          )
        ),
        {
          loading:
            count === 1
              ? t("historyPage.bulk.deleting.one", { count })
              : t("historyPage.bulk.deleting.other", { count }),
          success: () => {
            setSelectedTaskIds(new Set());
            return count === 1
              ? t("historyPage.bulk.deleted.one", { count })
              : t("historyPage.bulk.deleted.other", { count });
          },
          error: t("historyPage.toasts.failedToDeleteSomeTasks"),
        }
      );
    }
  };

  // Handle adding task result to gallery (admin only)
  const handleAddToGallery = async (task: MediaTask) => {
    if (!task.resultUrl) {
      toast.error(t("historyPage.toasts.noResultUrlAvailable"));
      return;
    }

    setImportingTaskId(task.id);

    try {
      // Determine folder based on media type
      const folder = task.mediaType === "video" ? "videos" : "images";

      // First, import the file from temp URL to permanent storage
      toast.info(t("historyPage.toasts.importingFileToStorage"));
      const importResult = await importFromUrlMutation.mutateAsync({
        url: task.resultUrl,
        folder: folder as "images" | "videos" | "thumbnails" | "websites",
      });

      // Determine aspect ratio based on media type
      let aspectRatio: "1:1" | "9:16" | "16:9" = "1:1";
      if (task.mediaType === "video") {
        aspectRatio = "16:9";
      }

      // Create gallery item with permanent URL
      await addToGalleryMutation.mutateAsync({
        type: task.mediaType === "audio" ? "video" : task.mediaType, // Map audio to video for gallery
        title: task.prompt.slice(0, 100) || `${task.mediaType} - ${task.model}`,
        description: task.prompt,
        aspectRatio,
        fileUrl: importResult.fileUrl, // Use permanent URL from storage
        fileKey: importResult.fileKey,
        thumbnailUrl: importResult.fileUrl, // Use same URL for thumbnail
        thumbnailKey: importResult.fileKey,
        model: task.model, // AI model used for generation
        isPublished: true, // Published immediately since only admin can add
        isFeatured: false,
      });
    } catch (error) {
      console.error("Failed to add to gallery:", error);
      toast.error(
        t("historyPage.toasts.failedToAddToGallery", {
          message:
            error instanceof Error
              ? error.message
              : t("historyPage.toasts.unknownError"),
        })
      );
    } finally {
      setImportingTaskId(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    setCurrentPage(0);
    setSelectedTaskIds(new Set());
  }, [mediaTypeFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(0);
    setSelectedTaskIds(new Set());
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > 0 && currentPage >= totalPages) {
      setCurrentPage(totalPages - 1);
    }
  }, [currentPage, totalPages]);

  const handleClearFilters = useCallback(() => {
    setMediaTypeFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
    setCurrentPage(0);
    setSelectedTaskIds(new Set());
  }, []);

  useEffect(() => {
    if (viewMode === "gallery") {
      setSelectedTaskIds(new Set());
    }
  }, [viewMode]);

  // Check if all visible tasks are selected
  const allSelected =
    visibleTasks.length > 0 &&
    visibleTasks.every(task => selectedTaskIds.has(task.id));
  const someSelected = selectedTaskIds.size > 0 && !allSelected;

  // Calculate stats
  const completedCount = tasks.filter(t => t.status === "completed").length;
  const pendingCount = tasks.filter(
    t => t.status === "pending" || t.status === "processing"
  ).length;
  const totalCredits = tasks.reduce((sum, t) => sum + (t.creditsUsed || 0), 0);

  const stats = [
    {
      label: t("historyPage.stats.totalTasks"),
      value: totalTasks.toString(),
      icon: FileImage,
      color: "text-purple-500",
      bgColor: "bg-purple-50",
    },
    {
      label: t("completed"),
      value: completedCount.toString(),
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-50",
    },
    {
      label: t("historyPage.stats.inProgress"),
      value: pendingCount.toString(),
      icon: Clock,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
    },
    {
      label: t("historyPage.stats.creditsUsed"),
      value: totalCredits.toString(),
      icon: Zap,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50",
    },
  ];

  const selectedTaskLibraryState = selectedTask
    ? getEffectiveTaskLibraryState(selectedTask)
    : undefined;
  const selectedTaskLibraryMeta = getLocalizedLibraryStatusMeta(
    selectedTaskLibraryState?.status,
    t
  );
  const selectedTaskDebugInfo = extractTaskDebugInfo(selectedTask);
  const selectedTaskApiDebugInfo = extractTaskApiDebugInfo(selectedTask);
  const selectedTaskReferenceImageConfig = extractReferenceImageConfig(
    selectedTask,
    selectedTaskApiDebugInfo
  );
  const selectedTaskReferenceMediaAssets = extractReferenceMediaAssets(
    selectedTask,
    selectedTaskApiDebugInfo
  );
  const selectedTaskErrorInfo = extractTaskErrorInfo(selectedTask, t);
  const selectedTaskIsFailed = selectedTask?.status === "failed";
  const selectedTaskIsCancelled = selectedTask?.status === "cancelled";
  const selectedTaskCanFetchResult = canManuallyFetchTaskResult(selectedTask);
  const isFetchingResult = Boolean(
    selectedTask &&
    fetchResultMutation.isPending &&
    fetchingResultTaskId === selectedTask.id
  );

  // Format date for display - show both relative and absolute time
  // Automatically converts UTC to local timezone
  // Safe date parsing helper
  const safeParseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      // Check if date is valid
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  const formatDate = (date: string) => {
    const d = safeParseDate(date);
    if (!d) {
      return {
        relative: t("historyPage.status.unknown"),
        absolute: t("historyPage.date.invalid"),
      };
    }

    // Return both for display (relative shown, absolute in title)
    // toLocaleString() automatically uses browser's local timezone
    return {
      relative: formatRelativeTime(d, locale),
      absolute: d.toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false, // Use 24-hour format
      }),
    };
  };

  const handleViewDetails = async (task: MediaTask) => {
    setSelectedTask(task);
    setDetailsOpen(true);

    // Auto-fetch result if the provider task id exists.
    // Otherwise just refresh from the task list so status changes in DB still show up.
    if (
      !task.resultUrl &&
      (task.status === "processing" || task.status === "pending")
    ) {
      try {
        if (canManuallyFetchTaskResult(task)) {
          await runFetchTaskResult(task, { silent: true });
        } else {
          const refreshed = await refetch();
          const refreshedTasks = Array.isArray(refreshed.data?.tasks)
            ? (refreshed.data.tasks as MediaTask[])
            : [];
          const updatedTask = refreshedTasks.find(t => t.id === task.id);
          if (updatedTask) {
            setSelectedTask(updatedTask as MediaTask);
          }
        }
      } catch (error) {
        console.error("Failed to fetch task result:", error);
      }
    }
  };

  const handleFetchResult = async (task: MediaTask) => {
    if (!canManuallyFetchTaskResult(task)) return;
    try {
      await runFetchTaskResult(task);
    } catch (error) {
      console.error("Failed to fetch task result:", error);
    }
  };

  const handleDownload = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const writeClipboardText = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return;
    }
    throw new Error("Clipboard API not available");
  };

  const handleCopyPrompt = async (task: MediaTask) => {
    try {
      await writeClipboardText(task.prompt || "");
      setCopiedPromptTaskId(task.id);
      window.setTimeout(() => {
        setCopiedPromptTaskId(current =>
          current === task.id ? null : current
        );
      }, 2000);
      toast.success(t("historyPage.toasts.promptCopied"));
    } catch (error) {
      console.error("Copy prompt failed:", error);
      toast.error(t("historyPage.toasts.failedToCopyPrompt"));
    }
  };

  const handleOpenShare = (task: MediaTask) => {
    const state = getEffectiveTaskLibraryState(task);
    if (!state?.itemId) {
      toast.error(t("historyPage.toasts.addToLibraryBeforeSharing"));
      return;
    }
    setShareDialogTarget({
      itemId: state.itemId,
      title: task.prompt.slice(0, 80) || `${task.mediaType} - ${task.model}`,
    });
  };

  const handleOpenFullscreenMedia = (task: MediaTask) => {
    if (
      (task.mediaType !== "image" && task.mediaType !== "video") ||
      !task.resultUrl ||
      expiredUrls.has(task.resultUrl)
    )
      return;
    setFullscreenTask(task);
  };

  const handleOpenFullscreenReferenceMedia = (
    asset: MediaHistoryReferenceMediaAsset
  ) => {
    if (!asset.url || expiredUrls.has(asset.url)) return;
    setFullscreenReferenceMedia(asset);
  };

  const handleCopyReferenceMediaUrl = async (
    asset: MediaHistoryReferenceMediaAsset
  ) => {
    try {
      await writeClipboardText(asset.url);
      toast.success(
        asset.kind === "video"
          ? t("historyPage.toasts.videoReferenceUrlCopied")
          : t("historyPage.toasts.imageReferenceUrlCopied")
      );
    } catch (error) {
      console.error("Copy reference media URL failed:", error);
      toast.error(t("historyPage.toasts.failedToCopyReferenceUrl"));
    }
  };

  const handleOpenReferenceMediaUrl = (
    asset: MediaHistoryReferenceMediaAsset
  ) => {
    window.open(asset.url, "_blank", "noopener,noreferrer");
  };

  const handleCopyDebugJson = async () => {
    if (!selectedTask) return;

    const payload = sanitizeDebugPayload({
      exportedAt: new Date().toISOString(),
      task: {
        id: selectedTask.id,
        taskId: selectedTask.taskId,
        celeryTaskId: selectedTask.celeryTaskId,
        mediaType: selectedTask.mediaType,
        status: selectedTask.status,
        model: selectedTask.model,
        prompt: selectedTask.prompt,
        parameters: selectedTask.parameters,
        errorMessage: selectedTask.errorMessage,
        resultUrl: selectedTask.resultUrl,
        resultData: selectedTask.resultData,
        createdAt: selectedTask.createdAt,
        completedAt: selectedTask.completedAt,
      },
      extracted: {
        debug: selectedTaskDebugInfo,
        api: selectedTaskApiDebugInfo,
        referenceImageConfig: selectedTaskReferenceImageConfig,
        referenceMediaAssets: selectedTaskReferenceMediaAssets,
        error: selectedTaskErrorInfo,
      },
    });

    const text = JSON.stringify(payload, null, 2);
    try {
      await writeClipboardText(text);

      setCopiedDebugTaskId(selectedTask.id);
      window.setTimeout(() => {
        setCopiedDebugTaskId(current =>
          current === selectedTask.id ? null : current
        );
      }, 2000);
      toast.success(t("historyPage.toasts.copiedDebugJson"));
    } catch (error) {
      console.error("Copy debug JSON failed:", error);
      toast.error(t("historyPage.toasts.failedToCopyDebugJson"));
    }
  };

  const refreshLibraryStatus = useCallback(
    async (taskId: string, itemId: number) => {
      try {
        const item = await trpcUtils.library.getItem.fetch({ id: itemId });
        setTaskLibraryState(prev => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || { action: "added" as const }),
            action: "added",
            itemId,
            status: item.status,
          },
        }));
      } catch {
        // Keep current optimistic state; retry in next interval.
      }
    },
    [trpcUtils.library.getItem]
  );

  const handleAddToLibrary = async (task: MediaTask) => {
    if (!isMediaTaskEligibleForLibraryAdd(task)) {
      toast.error(t("onlyCompletedTasksWithResultsCanBeAddedToLibrary"));
      return;
    }

    setTaskLibraryState(prev => ({
      ...prev,
      [task.id]: {
        ...(prev[task.id] || { action: "idle" as const }),
        action: "adding",
        status: "indexing",
      },
    }));

    try {
      const result = await addToLibraryMutation.mutateAsync({
        taskId: task.id,
      });
      const nextState = buildTaskLibraryStateFromAddResult(result);
      setTaskLibraryState(prev => ({
        ...prev,
        [task.id]: nextState,
      }));
      if (result.created) {
        toast.success(t("historyPage.toasts.addedToLibraryIndexing"));
      } else if (result.indexJob.created) {
        toast.success(t("historyPage.toasts.reindexingLibraryItem"));
      } else {
        toast.success(t("historyPage.toasts.alreadyInLibrary"));
      }
      await refetch();
      await refreshLibraryStatus(task.id, result.itemId);
    } catch (error) {
      const errorState = buildTaskLibraryErrorState(error);
      setTaskLibraryState(prev => ({
        ...prev,
        [task.id]: errorState,
      }));
      toast.error(
        error instanceof Error && error.message.trim().length > 0
          ? t("historyPage.toasts.failedToAddToLibraryWithMessage", {
              message: error.message,
            })
          : t("historyPage.toasts.failedToAddToLibrary")
      );
    }
  };

  const handleRetryTask = useCallback(
    (task: MediaTask) => {
      const prompt = task.prompt.trim();
      if (!prompt) {
        toast.error(t("cannotRetryWithoutPrompt"));
        return;
      }

      const taskParameters = toRecord(task.parameters);
      const referenceAssets = extractReferenceMediaAssets(task, null);
      const referenceImages = referenceAssets
        .filter(asset => asset.kind === "image")
        .map(asset => asset.url);
      const referenceVideoUrl = referenceAssets.find(
        asset => asset.kind === "video"
      )?.url;
      const aspectRatio = pickString(
        taskParameters?.aspectRatio,
        taskParameters?.aspect_ratio,
        taskParameters?.ratio
      );
      const extraParams = toRecord(
        taskParameters?.extraParams ?? taskParameters?.extra_params
      );

      const params = new URLSearchParams();
      params.set("type", task.mediaType);
      params.set("prompt", prompt);
      if (task.model?.trim()) {
        params.set("model", task.model.trim());
      }
      if (aspectRatio) {
        params.set("aspectRatio", aspectRatio);
      }
      if (
        taskParameters?.resolution !== undefined &&
        taskParameters.resolution !== null
      ) {
        params.set("resolution", String(taskParameters.resolution));
      }
      if (
        taskParameters?.outputFormat !== undefined &&
        taskParameters.outputFormat !== null
      ) {
        params.set("outputFormat", String(taskParameters.outputFormat));
      }
      if (
        taskParameters?.duration !== undefined &&
        taskParameters.duration !== null
      ) {
        params.set("duration", String(taskParameters.duration));
      }
      if (referenceVideoUrl) {
        params.set("referenceVideoUrl", referenceVideoUrl);
      }
      if (referenceImages.length > 0) {
        params.set("referenceImages", JSON.stringify(referenceImages));
      }
      if (extraParams && Object.keys(extraParams).length > 0) {
        params.set("extraParams", JSON.stringify(extraParams));
      }
      params.set("autostart", "1");

      setLocation(`/media-studio?${params.toString()}`);
    },
    [setLocation, t]
  );

  // Background fallback polling:
  // if provider callback/worker update is delayed, periodically refresh one pending task.
  useEffect(() => {
    const hasPendingTasks = tasks.some(
      task =>
        !task.resultUrl &&
        (task.status === "processing" || task.status === "pending")
    );

    if (!hasPendingTasks) return;

    const tick = async () => {
      if (
        document.visibilityState !== "visible" ||
        fetchResultMutation.isPending
      )
        return;
      const nextTask = tasks.find(
        task =>
          !!task.taskId &&
          !task.resultUrl &&
          (task.status === "processing" || task.status === "pending")
      );
      try {
        if (nextTask) {
          await fetchResultMutation.mutateAsync({ taskId: nextTask.id });
        } else {
          await refetch();
        }
      } catch (error) {
        console.error("Background fetch task result failed:", error);
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [
    tasks,
    fetchResultMutation.isPending,
    fetchResultMutation.mutateAsync,
    refetch,
  ]);

  useEffect(() => {
    const tracking = Object.entries(taskLibraryState).filter(
      ([, state]) =>
        state.action === "added" && state.itemId && state.status === "indexing"
    );
    if (tracking.length === 0) return;

    const timer = window.setInterval(() => {
      tracking.forEach(([taskId, state]) => {
        if (state.itemId) {
          void refreshLibraryStatus(taskId, state.itemId);
        }
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [taskLibraryState, refreshLibraryStatus]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                {t("common.back")}
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <FileImage className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {t("historyPage.title")}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t("historyPage.subtitle")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <LocaleToggle className="shrink-0" />
              <HelpButton
                page="/media-history"
                topic="media-history"
                variant="outline"
                size="sm"
                label={t("historyPage.actions.help")}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={tasksLoading}
                className="gap-2"
              >
                <RefreshCw
                  className={`w-4 h-4 ${tasksLoading ? "animate-spin" : ""}`}
                />
                {t("common.refresh")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8"
        >
          {stats.map((stat, index) => {
            const StatIcon = stat.icon || FileImage;
            return (
              <div
                key={index}
                className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-4 sm:p-6 shadow-lg shadow-purple-500/5"
              >
                <div
                  className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-2 sm:mb-4`}
                >
                  <StatIcon className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.color}`} />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-gray-500">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Data Retention Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {t("historyPage.dataRetention.title")}
            </p>
            <p className="mt-1">
              {t("historyPage.dataRetention.description", { days: 12 })}
            </p>
            <p className="mt-2">
              {t("historyPage.dataRetention.providerLimitations")}
            </p>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-4 mb-6 shadow-lg shadow-purple-500/5"
        >
          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={t("historyPage.filters.searchPlaceholder")}
                aria-label={t("historyPage.filters.searchLabel")}
                className="h-10 bg-white pl-9 pr-9"
              />
              {searchQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-500"
                  aria-label={t("historyPage.filters.clearSearch")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {t("historyPage.filters.type")}
              </span>
              <Select
                value={mediaTypeFilter}
                onValueChange={v => setMediaTypeFilter(v as MediaType | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t("common.allTypes")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allTypes")}</SelectItem>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      {t("image")}
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      {t("video")}
                    </div>
                  </SelectItem>
                  <SelectItem value="audio">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      {t("audio")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {t("historyPage.filters.status")}
              </span>
              <Select
                value={statusFilter}
                onValueChange={v => setStatusFilter(v as TaskStatus | "all")}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue
                    placeholder={t("historyPage.filters.allStatuses")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("historyPage.filters.allStatuses")}
                  </SelectItem>
                  <SelectItem value="pending">{t("pending")}</SelectItem>
                  <SelectItem value="processing">{t("processing")}</SelectItem>
                  <SelectItem value="completed">{t("completed")}</SelectItem>
                  <SelectItem value="failed">{t("failed")}</SelectItem>
                  <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="gap-2 text-slate-600"
              >
                <X className="h-4 w-4" />
                {t("historyPage.filters.clear")}
              </Button>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  type="button"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="gap-2 rounded-lg px-3"
                >
                  <List className="w-4 h-4" />
                  {t("historyPage.view.list")}
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "gallery" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("gallery")}
                  className="gap-2 rounded-lg px-3"
                >
                  <LayoutGrid className="w-4 h-4" />
                  {t("historyPage.view.gallery")}
                </Button>
              </div>
              {viewMode === "list" && selectedTaskIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={deleteTaskMutation.isPending}
                  className="gap-2"
                >
                  {deleteTaskMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t("historyPage.selection.deleteSelected", {
                    count: selectedTaskIds.size,
                  })}
                </Button>
              )}
              <div className="text-sm text-gray-500">
                {t("historyPage.selection.showing", {
                  visible: visibleTasks.length,
                  total: totalTasks,
                })}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(page => Math.max(0, page - 1))}
                  disabled={!hasPreviousPage || tasksLoading}
                  aria-label={t("historyPage.pagination.previous")}
                  className="h-9 w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-20 text-center text-xs text-slate-500">
                  {t("historyPage.pagination.page", {
                    page: currentPage + 1,
                    total: totalPages,
                  })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setCurrentPage(page =>
                      hasNextPage ? page + 1 : page
                    )
                  }
                  disabled={!hasNextPage || tasksLoading}
                  aria-label={t("historyPage.pagination.next")}
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tasks Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden"
        >
          {tasksIsError ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <AlertCircle className="mb-4 h-11 w-11 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("historyPage.error.title")}
              </h3>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                {tasksError instanceof Error && tasksError.message
                  ? tasksError.message
                  : t("historyPage.error.description")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="mt-5 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.retry")}
              </Button>
            </div>
          ) : tasksLoading ? (
            <div className="p-4 sm:p-6">
              {viewMode === "gallery" ? (
                <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <Skeleton className="aspect-square w-full rounded-none" />
                      <div className="space-y-3 p-4">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-16 w-full" />
                        <div className="grid grid-cols-3 gap-2">
                          <Skeleton className="h-9" />
                          <Skeleton className="h-9" />
                          <Skeleton className="h-9" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-3"
                    >
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tasks.length === 0 || visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileImage className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                {t("historyPage.empty.title")}
              </h3>
              <p className="max-w-md text-sm text-gray-500">
                {hasActiveFilters
                  ? t("historyPage.empty.filtered")
                  : t("historyPage.empty.default")}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    <X className="mr-2 h-4 w-4" />
                    {t("historyPage.filters.clear")}
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => setLocation("/media-studio")}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {t("historyPage.empty.createMedia")}
                </Button>
              </div>
            </div>
          ) : viewMode === "gallery" ? (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleTasks.map(task => {
                  const typeConfig = getMediaTypeMeta(task.mediaType, t);
                  const status = getStatusMeta(task.status, t);
                  const StatusIcon = status?.icon || AlertCircle;
                  const TypeIcon = typeConfig?.icon || FileImage;
                  const canAddToLibrary =
                    isMediaTaskEligibleForLibraryAdd(task);
                  const canAddToGallery =
                    isAdmin &&
                    task.status === "completed" &&
                    Boolean(task.resultUrl);
                  const canFetchResult = canManuallyFetchTaskResult(task);
                  const isFetchPending =
                    fetchResultMutation.isPending &&
                    fetchingResultTaskId === task.id;
                  const libraryState = getEffectiveTaskLibraryState(task);
                  const libraryStatusMeta = getLocalizedLibraryStatusMeta(
                    libraryState?.status,
                    t
                  );
                  const canShare = Boolean(libraryState?.itemId);
                  const canOpenFullscreen =
                    (task.mediaType === "image" ||
                      task.mediaType === "video") &&
                    Boolean(task.resultUrl) &&
                    !expiredUrls.has(task.resultUrl || "");
                  const createdDate = safeParseDate(task.createdAt);

                  return (
                    <div
                      key={task.id}
                      className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-lg shadow-slate-300/25 backdrop-blur-sm"
                    >
                      <div className="relative">
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="bg-white/90 text-slate-700 shadow-sm"
                          >
                            <TypeIcon
                              className={`mr-1 h-3 w-3 ${typeConfig.color}`}
                            />
                            {typeConfig.label}
                          </Badge>
                          <Badge className={`gap-1 shadow-sm ${status.color}`}>
                            <StatusIcon
                              className={`h-3 w-3 ${task.status === "processing" ? "animate-spin" : ""}`}
                            />
                            {status.label}
                          </Badge>
                        </div>
                        {canAddToLibrary && (
                          <div className="absolute right-3 top-3 z-10">
                            <Badge
                              className={`gap-1 shadow-sm ${libraryStatusMeta.className}`}
                            >
                              <Library className="h-3 w-3" />
                              {getTaskLibraryDisplayLabel(libraryState, t)}
                            </Badge>
                          </div>
                        )}

                        {task.status === "completed" && task.resultUrl ? (
                          expiredUrls.has(task.resultUrl) ? (
                            <ExpiredMediaPlaceholder
                              mediaType={task.mediaType}
                              className="aspect-square w-full rounded-none border-0"
                            />
                          ) : task.mediaType === "image" ? (
                            <button
                              type="button"
                              className="flex aspect-square w-full items-center justify-center bg-slate-100/80 p-3 text-left"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <img
                                src={task.resultUrl}
                                alt={
                                  task.prompt ||
                                  t("historyPage.preview.generatedImage")
                                }
                                className="h-full w-full object-contain"
                                onError={() => markExpired(task.resultUrl!)}
                              />
                            </button>
                          ) : task.mediaType === "video" ? (
                            <button
                              type="button"
                              className="relative block w-full text-left"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <VideoThumbnailCard
                                src={task.resultUrl}
                                thumbnailUrl={extractMediaHistoryThumbnailUrl(
                                  task
                                )}
                                alt={
                                  task.prompt ||
                                  t("historyPage.preview.generatedVideo")
                                }
                                className="aspect-square w-full"
                                onError={() => markExpired(task.resultUrl!)}
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="flex aspect-square w-full items-center justify-center bg-emerald-50 text-emerald-700"
                              onClick={() => handleViewDetails(task)}
                            >
                              <div className="text-center">
                                <Music className="mx-auto mb-3 h-10 w-10" />
                                <p className="text-sm font-medium">
                                  {t("historyPage.preview.audioResult")}
                                </p>
                              </div>
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="flex aspect-square w-full items-center justify-center bg-slate-100 text-slate-500"
                            onClick={() => handleViewDetails(task)}
                          >
                            <div className="text-center">
                              <TypeIcon
                                className={`mx-auto mb-3 h-10 w-10 ${typeConfig.color}`}
                              />
                              <p className="text-sm font-medium">
                                {status.label}
                              </p>
                            </div>
                          </button>
                        )}
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {task.model}
                            </p>
                            <p className="text-xs text-slate-500">
                              {createdDate
                                ? createdDate.toLocaleString(locale, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })
                                : t("historyPage.preview.unknownDate")}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            <Zap className="mr-1 h-3 w-3 text-yellow-500" />
                            {task.creditsUsed || 0}
                          </Badge>
                        </div>

                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                            {task.prompt || t("noPromptAvailable")}
                          </p>
                        </div>

                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(task)}
                            className="justify-start gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            {t("historyPage.actions.details")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              task.resultUrl && handleDownload(task.resultUrl)
                            }
                            disabled={!task.resultUrl}
                            className="justify-start gap-2"
                          >
                            <Download className="h-4 w-4" />
                            {t("download")}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                aria-label={t("historyPage.actions.more")}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {canFetchResult ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    void handleFetchResult(task);
                                  }}
                                  disabled={isFetchPending}
                                >
                                  {isFetchPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  {getTaskFetchResultLabel(task, t)}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={() => handleAddToLibrary(task)}
                                disabled={
                                  !canAddToLibrary ||
                                  libraryState?.action === "adding"
                                }
                              >
                                {libraryState?.action === "adding" ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : libraryState?.action === "added" ? (
                                  <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />
                                ) : libraryState?.action === "error" ? (
                                  <AlertCircle className="mr-2 h-4 w-4 text-red-600" />
                                ) : (
                                  <ImagePlus className="mr-2 h-4 w-4" />
                                )}
                                {libraryState?.action === "added"
                                  ? t("historyPage.library.inLibrary")
                                  : t("addToLibrary")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleOpenShare(task)}
                                disabled={!canShare}
                              >
                                <Share2 className="mr-2 h-4 w-4" />
                                {t("historyPage.actions.share")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleOpenFullscreenMedia(task)}
                                disabled={!canOpenFullscreen}
                              >
                                <Maximize2 className="mr-2 h-4 w-4" />
                                {t("historyPage.actions.full")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleCopyPrompt(task)}
                                disabled={!task.prompt}
                              >
                                {copiedPromptTaskId === task.id ? (
                                  <Check className="mr-2 h-4 w-4 text-emerald-600" />
                                ) : (
                                  <Copy className="mr-2 h-4 w-4" />
                                )}
                                {copiedPromptTaskId === task.id
                                  ? t("copied")
                                  : t("historyPage.actions.prompt")}
                              </DropdownMenuItem>
                              {canAddToGallery ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => handleAddToGallery(task)}
                                    disabled={importingTaskId === task.id}
                                  >
                                    {importingTaskId === task.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <ArrowUpRight className="mr-2 h-4 w-4" />
                                    )}
                                    {importingTaskId === task.id
                                      ? t("historyPage.actions.publishing")
                                      : t("historyPage.actions.gallery")}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Mobile card list — hidden on sm+ */}
              <div className="sm:hidden divide-y divide-gray-100">
                {visibleTasks.map(task => {
                  const typeConfig = getMediaTypeMeta(task.mediaType, t);
                  const status = getStatusMeta(task.status, t);
                  const StatusIcon = status?.icon || AlertCircle;
                  const TypeIcon = typeConfig?.icon || FileImage;
                  const canAddToLibrary =
                    isMediaTaskEligibleForLibraryAdd(task);
                  const canFetchResult = canManuallyFetchTaskResult(task);
                  const isFetchPending =
                    fetchResultMutation.isPending &&
                    fetchingResultTaskId === task.id;
                  const libraryState = getEffectiveTaskLibraryState(task);
                  const libraryStatusMeta = getLocalizedLibraryStatusMeta(
                    libraryState?.status,
                    t
                  );
                  return (
                    <div key={task.id} className="flex gap-3 p-4">
                      {/* Preview */}
                      <div className="flex-shrink-0">
                        {task.status === "completed" && task.resultUrl ? (
                          expiredUrls.has(task.resultUrl) ? (
                            <ExpiredMediaPlaceholder
                              mediaType={task.mediaType}
                              compact
                              className="w-14 h-14"
                            />
                          ) : task.mediaType === "image" ? (
                            <img
                              src={task.resultUrl}
                              alt={t("historyPage.preview.previewAlt")}
                              className="w-14 h-14 rounded-lg object-cover border cursor-pointer hover:opacity-80"
                              onError={() => markExpired(task.resultUrl!)}
                              onClick={() => handleOpenFullscreenMedia(task)}
                            />
                          ) : task.mediaType === "video" ? (
                            <div
                              className="w-14 h-14 rounded-lg bg-blue-100 flex items-center justify-center cursor-pointer"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <VideoThumbnailCard
                                src={task.resultUrl}
                                thumbnailUrl={extractMediaHistoryThumbnailUrl(
                                  task
                                )}
                                alt={
                                  task.prompt ||
                                  t("historyPage.preview.generatedVideo")
                                }
                                className="h-14 w-14 rounded-lg"
                                onError={() => markExpired(task.resultUrl!)}
                              />
                            </div>
                          ) : (
                            <div
                              className="w-14 h-14 rounded-lg bg-green-100 flex items-center justify-center cursor-pointer"
                              onClick={() => handleViewDetails(task)}
                            >
                              <Music className="w-5 h-5 text-green-600" />
                            </div>
                          )
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center">
                            <TypeIcon
                              className={`w-5 h-5 ${typeConfig.color}`}
                            />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Badge variant="outline" className="gap-1 text-xs">
                            <TypeIcon
                              className={`w-3 h-3 ${typeConfig.color}`}
                            />
                            {typeConfig.label}
                          </Badge>
                          <Badge className={`gap-1 text-xs ${status.color}`}>
                            <StatusIcon
                              className={`w-3 h-3 ${task.status === "processing" ? "animate-spin" : ""}`}
                            />
                            {status.label}
                          </Badge>
                          {canAddToLibrary &&
                            libraryState?.action !== "adding" &&
                            libraryState?.action !== "error" && (
                              <Badge
                                className={`text-xs ${libraryStatusMeta.className}`}
                              >
                                {getTaskLibraryDisplayLabel(libraryState, t)}
                              </Badge>
                            )}
                        </div>
                        <p className="text-xs font-mono text-gray-500 truncate mb-0.5">
                          {task.model}
                        </p>
                        <p className="text-xs text-gray-600 line-clamp-2 mb-1">
                          {task.prompt || t("noPromptAvailable")}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {task.creditsUsed ? (
                            <span className="flex items-center gap-0.5">
                              <Zap className="w-3 h-3 text-yellow-500" />
                              {task.creditsUsed}
                            </span>
                          ) : null}
                          <span>
                            {new Date(task.createdAt).toLocaleDateString(
                              locale,
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(task)}
                          className="h-8 w-8 p-0"
                          aria-label={t("historyPage.actions.details")}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canFetchResult ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void handleFetchResult(task);
                            }}
                            disabled={isFetchPending}
                            className="h-8 w-8 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            title={getTaskFetchResultTitle(task, t)}
                            aria-label={getTaskFetchResultLabel(task, t)}
                          >
                            {isFetchPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        ) : (
                          task.status === "failed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetryTask(task)}
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title={t("historyPage.actions.retryGeneration")}
                              aria-label={t("historyPage.actions.retryGeneration")}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )
                        )}
                        {task.status === "completed" && task.resultUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddToLibrary(task)}
                              disabled={libraryState?.action === "adding"}
                              className={`h-8 w-8 p-0 ${libraryState?.action === "added" ? "text-emerald-600" : "text-indigo-600"}`}
                              aria-label={
                                libraryState?.action === "added"
                                  ? t("historyPage.library.inLibrary")
                                  : t("addToLibrary")
                              }
                            >
                              {libraryState?.action === "adding" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : libraryState?.action === "added" ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <ImagePlus className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(task.resultUrl!)}
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              aria-label={t("download")}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {(task.status === "failed" ||
                          task.status === "cancelled" ||
                          task.status === "processing" ||
                          task.status === "pending") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            disabled={deleteTaskMutation.isPending}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            aria-label={t("historyPage.actions.deleteTask")}
                          >
                            {deleteTaskMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table — hidden on mobile */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label={t("historyPage.table.selectAll")}
                          className={
                            someSelected
                              ? "data-[state=checked]:bg-purple-500"
                              : ""
                          }
                        />
                      </TableHead>
                      <TableHead className="w-[80px]">
                        {t("historyPage.table.headers.preview")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.type")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.model")}
                      </TableHead>
                      <TableHead className="max-w-[200px]">
                        {t("historyPage.table.headers.prompt")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.status")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.externalId")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.credits")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.library")}
                      </TableHead>
                      <TableHead>
                        {t("historyPage.table.headers.created")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("historyPage.table.headers.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTasks.map(task => {
                      const typeConfig = getMediaTypeMeta(task.mediaType, t);
                      const status = getStatusMeta(task.status, t);
                      const StatusIcon = status?.icon || AlertCircle;
                      const TypeIcon = typeConfig?.icon || FileImage;
                      const externalTaskId = extractMediaHistoryExternalTaskId(task);
                      const creditsUsed = extractMediaHistoryCreditsUsed(task);
                      const canAddToLibrary =
                        isMediaTaskEligibleForLibraryAdd(task);
                      const canFetchResult = canManuallyFetchTaskResult(task);
                      const isFetchPending =
                        fetchResultMutation.isPending &&
                        fetchingResultTaskId === task.id;
                      const libraryState = getEffectiveTaskLibraryState(task);
                      const libraryStatusMeta = getLocalizedLibraryStatusMeta(
                        libraryState?.status,
                        t
                      );

                      return (
                        <TableRow key={task.id} className="hover:bg-gray-50/50">
                          <TableCell>
                            <Checkbox
                              checked={selectedTaskIds.has(task.id)}
                              onCheckedChange={checked =>
                                handleSelectTask(task.id, checked === true)
                              }
                              aria-label={t("historyPage.table.selectTask", {
                                id: task.id,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            {task.status === "completed" && task.resultUrl ? (
                              expiredUrls.has(task.resultUrl) ? (
                                <ExpiredMediaPlaceholder
                                  mediaType={task.mediaType}
                                  compact
                                  className="w-12 h-12"
                                />
                              ) : task.mediaType === "image" ? (
                                <img
                                  src={task.resultUrl}
                                  alt={t("historyPage.preview.previewAlt")}
                                  className="w-12 h-12 rounded-lg object-cover border cursor-pointer hover:opacity-80"
                                  onError={() => markExpired(task.resultUrl!)}
                                  onClick={() =>
                                    handleOpenFullscreenMedia(task)
                                  }
                                />
                              ) : task.mediaType === "video" ? (
                                <div
                                  className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center cursor-pointer hover:bg-blue-200"
                                  onClick={() =>
                                    handleOpenFullscreenMedia(task)
                                  }
                                >
                                  <VideoThumbnailCard
                                    src={task.resultUrl}
                                    thumbnailUrl={extractMediaHistoryThumbnailUrl(
                                      task
                                    )}
                                    alt={
                                      task.prompt ||
                                      t("historyPage.preview.generatedVideo")
                                    }
                                    className="h-12 w-12 rounded-lg"
                                    onError={() => markExpired(task.resultUrl!)}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center cursor-pointer hover:bg-green-200"
                                  onClick={() => handleViewDetails(task)}
                                >
                                  <Music className="w-5 h-5 text-green-600" />
                                </div>
                              )
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                                <TypeIcon
                                  className={`w-5 h-5 ${typeConfig.color}`}
                                />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <TypeIcon
                                className={`w-3 h-3 ${typeConfig.color}`}
                              />
                              {typeConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {task.model}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p
                              className="truncate text-sm text-gray-600"
                              title={task.prompt}
                            >
                              {task.prompt}
                            </p>
                            {task.status === "failed" &&
                              (() => {
                                const info = extractTaskErrorInfo(task, t);
                                if (!info?.summary) return null;
                                return (
                                  <p
                                    className="truncate text-xs text-red-600 mt-1"
                                    title={info.summary}
                                  >
                                    {info.summary}
                                  </p>
                                );
                              })()}
                          </TableCell>
                          <TableCell>
                            <Badge className={`gap-1 ${status.color}`}>
                              <StatusIcon
                                className={`w-3 h-3 ${task.status === "processing" ? "animate-spin" : ""}`}
                              />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {externalTaskId ? (
                              <span
                                className="font-mono text-xs text-gray-600"
                                title={externalTaskId}
                              >
                                {externalTaskId.substring(0, 8)}...
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {creditsUsed !== null ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Zap className="w-3 h-3 text-yellow-500" />
                                {creditsUsed}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {canAddToLibrary ? (
                              libraryState?.action === "adding" ? (
                                <Badge className="gap-1 bg-amber-100 text-amber-800">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  {t("historyPage.library.addingShort")}
                                </Badge>
                              ) : libraryState?.action === "error" ? (
                                <Badge className="gap-1 bg-red-100 text-red-700">
                                  <AlertCircle className="w-3 h-3" />
                                  {t("failed")}
                                </Badge>
                              ) : (
                                <Badge className={libraryStatusMeta.className}>
                                  {getTaskLibraryDisplayLabel(libraryState, t)}
                                </Badge>
                              )
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell
                            className="text-sm text-gray-500"
                            title={formatDate(task.createdAt).relative}
                          >
                            {(() => {
                              const date = safeParseDate(task.createdAt);
                              if (!date) {
                                return (
                                  <span className="text-gray-400">
                                    {t("historyPage.date.invalid")}
                                  </span>
                                );
                              }
                              return (
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {date.toLocaleDateString(locale, {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {date.toLocaleTimeString(locale, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    })}
                                  </span>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(task)}
                                className="h-8 px-2"
                                aria-label={t("historyPage.actions.details")}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {canFetchResult ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void handleFetchResult(task);
                                  }}
                                  disabled={isFetchPending}
                                  className="h-8 gap-1 border-sky-200 px-2 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                                  title={getTaskFetchResultTitle(task, t)}
                                  aria-label={getTaskFetchResultLabel(task, t)}
                                >
                                  {isFetchPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                  <span className="text-xs font-medium">
                                    {getTaskFetchResultLabel(task, t)}
                                  </span>
                                </Button>
                              ) : (
                                task.status === "failed" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRetryTask(task)}
                                    className="h-8 gap-1 border-amber-200 px-2 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                    title={t(
                                      "historyPage.actions.retryGeneration"
                                    )}
                                    aria-label={t(
                                      "historyPage.actions.retryGeneration"
                                    )}
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                    <span className="text-xs font-medium">
                                      {t("common.retry")}
                                    </span>
                                  </Button>
                                )
                              )}
                              {task.status === "completed" &&
                                task.resultUrl && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAddToLibrary(task)}
                                      disabled={
                                        libraryState?.action === "adding"
                                      }
                                      className={`h-8 px-2 ${libraryState?.action === "added" ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" : "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"}`}
                                      title={
                                        libraryStatusMeta.retryable
                                          ? t("retryAddToLibrary")
                                          : t("addToLibrary")
                                      }
                                      aria-label={
                                        libraryStatusMeta.retryable
                                          ? t("retryAddToLibrary")
                                          : t("addToLibrary")
                                      }
                                    >
                                      {libraryState?.action === "adding" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : libraryState?.action === "added" ? (
                                        <CheckCircle className="w-4 h-4" />
                                      ) : libraryState?.action === "error" ? (
                                        <AlertCircle className="w-4 h-4" />
                                      ) : (
                                        <ImagePlus className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleDownload(task.resultUrl!)
                                      }
                                      className="h-8 px-2 text-green-600 hover:text-green-700"
                                      aria-label={t("download")}
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                    {/* Add to Gallery button - admin only */}
                                    {isAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddToGallery(task)}
                                        disabled={importingTaskId === task.id}
                                        className="h-8 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                        title={t(
                                          "historyPage.actions.addToGallery"
                                        )}
                                        aria-label={t(
                                          "historyPage.actions.addToGallery"
                                        )}
                                      >
                                        {importingTaskId === task.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <ImagePlus className="w-4 h-4" />
                                        )}
                                      </Button>
                                    )}
                                  </>
                                )}
                              {(task.status === "failed" ||
                                task.status === "cancelled" ||
                                task.status === "processing" ||
                                task.status === "pending") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTask(task.id)}
                                  disabled={deleteTaskMutation.isPending}
                                  className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title={t("historyPage.actions.deleteTask")}
                                  aria-label={t("historyPage.actions.deleteTask")}
                                >
                                  {deleteTaskMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </motion.div>
      </main>

      <Dialog
        open={Boolean(fullscreenTask)}
        onOpenChange={open => !open && setFullscreenTask(null)}
      >
        <DialogPortal>
          <DialogOverlay className="bg-black/95" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {t("historyPage.details.fullscreenMedia")}
              </DialogTitle>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 h-11 w-11 rounded-md border border-cyan-500/70 bg-black/50 text-cyan-400 hover:bg-black/70 hover:text-cyan-300"
              >
                <span className="sr-only">
                  {t("historyPage.actions.closeFullscreen")}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </DialogClose>

            {fullscreenTask?.resultUrl ? (
              fullscreenTask.mediaType === "video" ? (
                <video
                  src={fullscreenTask.resultUrl}
                  controls
                  autoPlay
                  playsInline
                  className="block max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]"
                  onError={() => markExpired(fullscreenTask.resultUrl!)}
                />
              ) : (
                <img
                  src={fullscreenTask.resultUrl}
                  alt={
                    fullscreenTask.prompt ||
                    t("historyPage.preview.fullscreenPreview")
                  }
                  className="block max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]"
                  onError={() => markExpired(fullscreenTask.resultUrl!)}
                />
              )
            ) : null}
          </div>
        </DialogPortal>
      </Dialog>

      <Dialog
        open={Boolean(fullscreenReferenceMedia)}
        onOpenChange={open => !open && setFullscreenReferenceMedia(null)}
      >
        <DialogPortal>
          <DialogOverlay className="bg-black/95" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {t("historyPage.details.fullscreenReferenceMedia")}
              </DialogTitle>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 h-11 w-11 rounded-md border border-cyan-500/70 bg-black/50 text-cyan-400 hover:bg-black/70 hover:text-cyan-300"
              >
                <span className="sr-only">
                  {t("historyPage.actions.closeReferenceFullscreen")}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </DialogClose>

            {fullscreenReferenceMedia?.url ? (
              fullscreenReferenceMedia.kind === "video" ? (
                <video
                  src={fullscreenReferenceMedia.url}
                  controls
                  autoPlay
                  playsInline
                  className="block max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]"
                  onError={() => markExpired(fullscreenReferenceMedia.url)}
                />
              ) : (
                <img
                  src={fullscreenReferenceMedia.url}
                  alt={t("historyPage.preview.referencePreview")}
                  className="block max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]"
                  onError={() => markExpired(fullscreenReferenceMedia.url)}
                />
              )
            ) : null}
          </div>
        </DialogPortal>
      </Dialog>

      {/* Task Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[min(96vw,64rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && (
                <>
                  {(() => {
                    const typeMeta = getMediaTypeMeta(
                      selectedTask.mediaType,
                      t
                    );
                    const TypeIcon = typeMeta?.icon || FileImage;
                    return <TypeIcon className={`w-5 h-5 ${typeMeta.color}`} />;
                  })()}
                  {t("historyPage.details.generationDetails", {
                    type: getMediaTypeMeta(selectedTask.mediaType, t).label,
                  })}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4">
              {/* Loading indicator for auto-fetch */}
              {isFetchingResult && (
                <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-blue-700">
                    {t("historyPage.details.fetchingProvider")}
                  </span>
                </div>
              )}

              {/* Preview */}
              {selectedTask.status === "completed" &&
                selectedTask.resultUrl && (
                  <div className="flex justify-center">
                    {expiredUrls.has(selectedTask.resultUrl) ? (
                      <ExpiredMediaPlaceholder
                        mediaType={selectedTask.mediaType}
                        className="w-full max-w-sm h-48"
                      />
                    ) : selectedTask.mediaType === "image" ? (
                      <img
                        src={selectedTask.resultUrl}
                        alt={t("historyPage.preview.generated")}
                        className="max-h-[400px] rounded-lg border shadow-lg cursor-zoom-in"
                        onError={() => markExpired(selectedTask.resultUrl!)}
                        onClick={() => handleOpenFullscreenMedia(selectedTask)}
                      />
                    ) : selectedTask.mediaType === "video" ? (
                      <video
                        src={selectedTask.resultUrl}
                        controls
                        className="max-h-[400px] rounded-lg border shadow-lg"
                        onError={() => markExpired(selectedTask.resultUrl!)}
                        onDoubleClick={() =>
                          handleOpenFullscreenMedia(selectedTask)
                        }
                      />
                    ) : (
                      <audio
                        src={selectedTask.resultUrl}
                        controls
                        className="w-full"
                        onError={() => markExpired(selectedTask.resultUrl!)}
                      />
                    )}
                  </div>
                )}

              {/* Fetch Result Button (for tasks without result) */}
              {selectedTaskCanFetchResult && (
                <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-700 mr-4">
                    {selectedTaskIsFailed || selectedTaskIsCancelled
                      ? t("historyPage.tooltips.providerFinished")
                      : t("historyPage.tooltips.noResultYet")}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void handleFetchResult(selectedTask);
                    }}
                    disabled={isFetchingResult}
                    className="gap-2"
                    title={getTaskFetchResultTitle(selectedTask, t)}
                  >
                    {isFetchingResult ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {getTaskFetchResultLabel(selectedTask, t)}
                  </Button>
                </div>
              )}

              {(selectedTaskIsFailed || selectedTaskIsCancelled) &&
                (selectedTaskErrorInfo || selectedTaskApiDebugInfo) && (
                  <div className="rounded-lg border border-red-200 bg-red-50/80 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-red-700 font-medium">
                      <AlertCircle className="w-4 h-4" />
                      <span>{t("historyPage.details.providerError")}</span>
                    </div>
                    {selectedTaskErrorInfo && (
                      <p className="text-sm text-red-700">
                        {selectedTaskErrorInfo.summary}
                      </p>
                    )}
                    {selectedTaskApiDebugInfo?.providerMessage && (
                      <p className="text-xs text-red-600 break-words">
                        <span className="font-medium">
                          {t("historyPage.details.providerLabel")}:
                        </span>{" "}
                        {selectedTaskApiDebugInfo.providerMessage}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-red-600">
                      {selectedTaskApiDebugInfo?.responseStatus !==
                        undefined && (
                        <span className="rounded-full bg-white/80 px-2 py-1 border border-red-200">
                          HTTP {selectedTaskApiDebugInfo.responseStatus}
                        </span>
                      )}
                      {selectedTaskDebugInfo?.traceId && (
                        <span className="rounded-full bg-white/80 px-2 py-1 border border-red-200 font-mono">
                          Trace {selectedTaskDebugInfo.traceId}
                        </span>
                      )}
                    </div>
                    {selectedTaskApiDebugInfo?.requestUrl && (
                      <p className="font-mono text-[11px] break-all bg-white/70 border border-red-200 rounded p-2 text-red-700">
                        {selectedTaskApiDebugInfo.requestUrl}
                      </p>
                    )}
                  </div>
                )}

              {/* Details Grid */}
              <div className="grid grid-cols-1 gap-4 p-4 bg-gray-50 rounded-lg sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="text-sm text-gray-500">
                    {t("historyPage.details.internalTaskId")}
                  </span>
                  <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                    {selectedTask.id}
                  </p>
                </div>
                {selectedTask.taskId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.providerTaskId")}
                    </span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                      {selectedTask.taskId}
                    </p>
                  </div>
                )}
                {selectedTask.celeryTaskId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.celeryTaskId")}
                    </span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                      {selectedTask.celeryTaskId}
                    </p>
                  </div>
                )}
                {selectedTaskDebugInfo?.traceId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.debugTraceId")}
                    </span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                      {selectedTaskDebugInfo.traceId}
                    </p>
                  </div>
                )}
                {selectedTaskDebugInfo?.providerHint && (
                  <div>
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.providerHint")}
                    </span>
                    <p className="font-mono text-sm break-all">
                      {selectedTaskDebugInfo.providerHint}
                    </p>
                  </div>
                )}
                {selectedTaskReferenceImageConfig && (
                  <>
                    <div>
                      <span className="text-sm text-gray-500">
                        {t("historyPage.details.referenceImageKey")}
                      </span>
                      <p className="font-mono text-sm break-all">
                        {selectedTaskReferenceImageConfig.key}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">
                        {t("historyPage.details.referenceImageType")}
                      </span>
                      <Badge className="mt-1 gap-1 bg-sky-100 text-sky-800">
                        {selectedTaskReferenceImageConfig.type}
                      </Badge>
                    </div>
                  </>
                )}
                {selectedTaskDebugInfo?.logFile && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.debugLogFile")}
                    </span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                      {selectedTaskDebugInfo.logFile}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">
                    {t("historyPage.details.status")}
                  </span>
                  <Badge
                    className={`mt-1 gap-1 ${getStatusMeta(selectedTask.status, t).color}`}
                  >
                    {getStatusMeta(selectedTask.status, t).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm text-gray-500">
                    {t("historyPage.details.library")}
                  </span>
                  {isMediaTaskEligibleForLibraryAdd(selectedTask) ? (
                    selectedTaskLibraryState?.action === "adding" ? (
                      <Badge className="mt-1 gap-1 bg-amber-100 text-amber-800">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t("historyPage.library.addingShort")}
                      </Badge>
                    ) : selectedTaskLibraryState?.action === "error" ? (
                      <Badge className="mt-1 gap-1 bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3" />
                        {t("failed")}
                      </Badge>
                    ) : (
                      <Badge
                        className={`mt-1 ${selectedTaskLibraryMeta.className}`}
                      >
                        {getTaskLibraryDisplayLabel(
                          selectedTaskLibraryState,
                          t
                        )}
                      </Badge>
                    )
                  ) : (
                    <p className="text-sm text-gray-400">
                      {t("historyPage.details.notEligible")}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-sm text-gray-500">
                    {t("historyPage.details.model")}
                  </span>
                  <p className="font-mono text-sm break-all">
                    {selectedTask.model}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">
                    {t("historyPage.details.creditsUsed")}
                  </span>
                  <p className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    {selectedTask.creditsUsed || 0}
                  </p>
                </div>
                {selectedTaskReferenceMediaAssets.length > 0 && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.details.referenceMediaSent", {
                        count: selectedTaskReferenceMediaAssets.length,
                      })}
                    </span>
                    {selectedTaskReferenceImageConfig && (
                      <p className="text-xs text-gray-400 mt-1">
                        {t("historyPage.details.resolvedField")}{" "}
                        <span className="font-mono">
                          {formatReferenceImageConfigLabel(
                            selectedTaskReferenceImageConfig,
                            t
                          )}
                        </span>
                      </p>
                    )}
                    <TooltipProvider delayDuration={200}>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {selectedTaskReferenceMediaAssets.map(
                          (asset, index) => (
                            <div
                              key={`${asset.url}-${index}`}
                              className="overflow-hidden rounded-lg border bg-white shadow-sm"
                            >
                              <div
                                className="relative aspect-video bg-gray-50 cursor-zoom-in"
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  handleOpenFullscreenReferenceMedia(asset)
                                }
                                onKeyDown={event => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    handleOpenFullscreenReferenceMedia(asset);
                                  }
                                }}
                              >
                                <div className="absolute right-2 top-2 z-10 flex gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="h-7 w-7 rounded-full border border-white/70 bg-emerald-50/90 text-emerald-700 shadow-sm hover:bg-emerald-50"
                                        onClick={event => {
                                          event.stopPropagation();
                                        }}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                        <span className="sr-only">
                                          {t(
                                            "historyPage.actions.referenceDetails"
                                          )}
                                        </span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                      <div className="space-y-1">
                                        {getReferenceMediaTooltipText(
                                          asset,
                                          selectedTaskReferenceImageConfig,
                                          t
                                        ).map(line => (
                                          <p key={line}>{line}</p>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="h-7 w-7 rounded-full border border-white/70 bg-sky-50/90 text-sky-700 shadow-sm hover:bg-sky-50"
                                        onClick={event => {
                                          event.stopPropagation();
                                          void handleCopyReferenceMediaUrl(
                                            asset
                                          );
                                        }}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                        <span className="sr-only">
                                          {t(
                                            "historyPage.actions.copyReferenceUrl"
                                          )}
                                        </span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t(
                                        "historyPage.actions.copyReferenceUrl"
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="h-7 w-7 rounded-full border border-white/70 bg-violet-50/90 text-violet-700 shadow-sm hover:bg-violet-50"
                                        onClick={event => {
                                          event.stopPropagation();
                                          handleOpenReferenceMediaUrl(asset);
                                        }}
                                      >
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        <span className="sr-only">
                                          {t(
                                            "historyPage.actions.openReferenceUrl"
                                          )}
                                        </span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t("historyPage.actions.openUrlInNewTab")}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {expiredUrls.has(asset.url) ? (
                                  <ExpiredMediaPlaceholder
                                    mediaType={
                                      asset.kind === "video" ? "video" : "image"
                                    }
                                    className="h-full w-full"
                                  />
                                ) : asset.kind === "video" ? (
                                  <video
                                    src={asset.url}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-full w-full object-cover"
                                    onError={() => markExpired(asset.url)}
                                  />
                                ) : (
                                  <img
                                    src={asset.url}
                                    alt={`${getReferenceMediaAssetLabel(asset, t)} ${index + 1}`}
                                    className="h-full w-full object-cover"
                                    onError={() => markExpired(asset.url)}
                                  />
                                )}
                              </div>
                              <div className="border-t bg-white p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                                    {selectedTaskReferenceImageConfig?.label?.trim() ||
                                      getReferenceMediaAssetLabel(asset, t)}
                                  </p>
                                  <Badge
                                    className={`text-[10px] ${asset.kind === "video" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}
                                  >
                                    {asset.kind === "video"
                                      ? t("video")
                                      : t("image")}
                                  </Badge>
                                </div>
                                <p className="font-mono text-[11px] break-all select-all text-gray-700 mt-1">
                                  {asset.url}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">
                      {t("historyPage.table.headers.prompt")}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyPrompt(selectedTask)}
                      disabled={!selectedTask.prompt}
                      className="gap-2"
                    >
                      {copiedPromptTaskId === selectedTask.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          {t("copied")}
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          {t("historyPage.actions.copyPrompt")}
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap">
                    {selectedTask.prompt || t("noPromptAvailable")}
                  </p>
                </div>
                {(selectedTaskIsFailed || selectedTaskIsCancelled) &&
                  selectedTaskApiDebugInfo && (
                    <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-sky-700">
                          {t("historyPage.details.apiDebug")}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyDebugJson}
                          className="h-7 px-2 text-xs"
                        >
                          {copiedDebugTaskId === selectedTask.id ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              {t("copied")}
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              {t("historyPage.actions.copyDebugJson")}
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {selectedTaskApiDebugInfo.providerHint && (
                          <div>
                            <span className="text-xs text-sky-700/80">
                              {t("historyPage.details.providerLabel")}
                            </span>
                            <p className="font-mono text-xs break-all">
                              {selectedTaskApiDebugInfo.providerHint}
                            </p>
                          </div>
                        )}
                        {selectedTaskApiDebugInfo.voiceId && (
                          <div>
                            <span className="text-xs text-sky-700/80">
                              {t("historyPage.details.voiceId")}
                            </span>
                            <p className="font-mono text-xs break-all">
                              {selectedTaskApiDebugInfo.voiceId}
                            </p>
                          </div>
                        )}
                        {selectedTaskApiDebugInfo.method && (
                          <div>
                            <span className="text-xs text-sky-700/80">
                              {t("historyPage.details.method")}
                            </span>
                            <p className="font-mono text-xs">
                              {selectedTaskApiDebugInfo.method}
                            </p>
                          </div>
                        )}
                        {selectedTaskApiDebugInfo.requestModel && (
                          <div>
                            <span className="text-xs text-sky-700/80">
                              {t("historyPage.details.requestModel")}
                            </span>
                            <p className="font-mono text-xs break-all">
                              {selectedTaskApiDebugInfo.requestModel}
                            </p>
                          </div>
                        )}
                        {selectedTaskApiDebugInfo.responseStatus !==
                          undefined && (
                          <div>
                            <span className="text-xs text-sky-700/80">
                              {t("historyPage.details.responseStatus")}
                            </span>
                            <p className="font-mono text-xs">
                              {selectedTaskApiDebugInfo.responseStatus}
                            </p>
                          </div>
                        )}
                      </div>
                      {selectedTaskApiDebugInfo.endpoint && (
                        <div>
                          <span className="text-xs text-sky-700/80">
                            {t("historyPage.details.endpoint")}
                          </span>
                          <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                            {selectedTaskApiDebugInfo.endpoint}
                          </p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.requestUrl && (
                        <div>
                          <span className="text-xs text-sky-700/80">
                            {t("historyPage.details.requestUrl")}
                          </span>
                          <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                            {selectedTaskApiDebugInfo.requestUrl}
                          </p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.requestText && (
                        <div>
                          <span className="text-xs text-sky-700/80">
                            {t("historyPage.details.requestText")}
                          </span>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap break-words mt-1 bg-white p-2 rounded border">
                            {selectedTaskApiDebugInfo.requestText}
                          </p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.responseMessage && (
                        <div>
                          <span className="text-xs text-sky-700/80">
                            {t("historyPage.details.responseMessage")}
                          </span>
                          <p className="text-xs text-sky-700 break-words mt-1">
                            {selectedTaskApiDebugInfo.responseMessage}
                          </p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.providerMessage && (
                        <div>
                          <span className="text-xs text-sky-700/80">
                            {t("historyPage.details.providerMessage")}
                          </span>
                          <p className="text-xs text-sky-700 break-words mt-1">
                            {selectedTaskApiDebugInfo.providerMessage}
                          </p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.requestPayload !==
                        undefined && (
                        <details className="rounded border bg-white p-2">
                          <summary className="cursor-pointer text-xs text-sky-700 select-none">
                            {t("historyPage.details.requestPayload")}
                          </summary>
                          <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                            {JSON.stringify(
                              selectedTaskApiDebugInfo.requestPayload,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      )}
                      {selectedTaskApiDebugInfo.responseBody && (
                        <details className="rounded border bg-white p-2">
                          <summary className="cursor-pointer text-xs text-sky-700 select-none">
                            {t("historyPage.details.responseBody")}
                          </summary>
                          <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                            {selectedTaskApiDebugInfo.responseBody}
                          </pre>
                        </details>
                      )}
                      {selectedTaskApiDebugInfo.responseJson !== undefined && (
                        <details className="rounded border bg-white p-2">
                          <summary className="cursor-pointer text-xs text-sky-700 select-none">
                            {t("historyPage.details.responseJson")}
                          </summary>
                          <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                            {JSON.stringify(
                              selectedTaskApiDebugInfo.responseJson,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      )}
                      {selectedTaskApiDebugInfo.providerDetail !==
                        undefined && (
                        <details className="rounded border bg-white p-2">
                          <summary className="cursor-pointer text-xs text-sky-700 select-none">
                            {t("historyPage.details.providerFailureDetail")}
                          </summary>
                          <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                            {JSON.stringify(
                              selectedTaskApiDebugInfo.providerDetail,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                {(selectedTaskIsFailed || selectedTaskIsCancelled) &&
                  (() => {
                    const errorInfo = selectedTaskErrorInfo;
                    if (!errorInfo) return null;
                    return (
                      <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50/70 p-3">
                        <span className="text-sm font-medium text-red-700">
                          {t("historyPage.details.errorSummary")}
                        </span>
                        <p className="text-sm text-red-700 mt-1">
                          {errorInfo.summary}
                        </p>
                        {(errorInfo.codeHint || errorInfo.stateHint) && (
                          <p className="text-xs text-red-600 mt-1">
                            {errorInfo.codeHint
                              ? `${t("historyPage.details.code")}: ${errorInfo.codeHint}`
                              : ""}
                            {errorInfo.codeHint && errorInfo.stateHint
                              ? " | "
                              : ""}
                            {errorInfo.stateHint
                              ? `${t("historyPage.details.state")}: ${errorInfo.stateHint}`
                              : ""}
                          </p>
                        )}
                        {errorInfo.details.length > 1 && (
                          <div className="mt-2 space-y-1">
                            <span className="text-xs font-medium text-red-600">
                              {t("historyPage.details.details")}
                            </span>
                            {errorInfo.details.slice(1).map((detail, index) => (
                              <p
                                key={`${detail}-${index}`}
                                className="text-xs text-red-600 break-words"
                              >
                                - {detail}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                {(selectedTaskIsFailed || selectedTaskIsCancelled) &&
                  selectedTask.resultData && (
                    <div className="sm:col-span-2">
                      <details className="rounded border bg-white p-2">
                        <summary className="cursor-pointer text-xs text-gray-600 select-none">
                          {t("historyPage.details.technicalErrorPayload")}
                        </summary>
                        <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                          {JSON.stringify(selectedTask.resultData, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                <div>
                  <span className="text-sm text-gray-500">
                    {t("historyPage.table.headers.created")}
                  </span>
                  <p className="text-sm font-medium">
                    {new Date(selectedTask.createdAt).toLocaleString(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(selectedTask.createdAt).relative}
                  </p>
                </div>
                {selectedTask.completedAt &&
                  (() => {
                    const completedDate = safeParseDate(
                      selectedTask.completedAt
                    );
                    if (!completedDate) return null;
                    return (
                      <div>
                        <span className="text-sm text-gray-500">
                          {t("historyPage.details.completed")}
                        </span>
                        <p className="text-sm font-medium">
                          {completedDate.toLocaleString(locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(selectedTask.completedAt).relative}
                        </p>
                      </div>
                    );
                  })()}
              </div>

              {/* Actions */}
              {selectedTask.status === "completed" &&
                selectedTask.resultUrl && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleCopyPrompt(selectedTask)}
                      disabled={!selectedTask.prompt}
                      className="gap-2"
                    >
                      {copiedPromptTaskId === selectedTask.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {copiedPromptTaskId === selectedTask.id
                        ? t("copied")
                        : t("historyPage.actions.copyPrompt")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAddToLibrary(selectedTask)}
                      disabled={selectedTaskLibraryState?.action === "adding"}
                      className="gap-2"
                    >
                      {selectedTaskLibraryState?.action === "adding" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : selectedTaskLibraryState?.action === "added" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <ImagePlus className="w-4 h-4" />
                      )}
                      {selectedTaskLibraryState?.action === "added"
                        ? t("historyPage.library.inLibrary")
                        : t("addToLibrary")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenShare(selectedTask)}
                      disabled={!selectedTaskLibraryState?.itemId}
                      className="gap-2"
                      title={
                        selectedTaskLibraryState?.itemId
                          ? t("historyPage.actions.shareLibraryItem")
                          : t("historyPage.actions.addToLibraryBeforeSharing")
                      }
                    >
                      <Share2 className="w-4 h-4" />
                      {t("historyPage.actions.share")}
                    </Button>
                    {(selectedTask.mediaType === "image" ||
                      selectedTask.mediaType === "video") && (
                      <Button
                        variant="outline"
                        onClick={() => handleOpenFullscreenMedia(selectedTask)}
                        disabled={
                          !selectedTask.resultUrl ||
                          expiredUrls.has(selectedTask.resultUrl)
                        }
                        className="gap-2"
                      >
                        <Maximize2 className="w-4 h-4" />
                        {t("historyPage.actions.full")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => handleDownload(selectedTask.resultUrl!)}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {t("download")}
                    </Button>
                    {/* Add to Gallery button - admin only */}
                    {isAdmin && (
                      <Button
                        variant="default"
                        onClick={() => handleAddToGallery(selectedTask)}
                        disabled={importingTaskId === selectedTask.id}
                        className="gap-2 bg-purple-600 hover:bg-purple-700"
                      >
                        {importingTaskId === selectedTask.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ImagePlus className="w-4 h-4" />
                        )}
                        {importingTaskId === selectedTask.id
                          ? t("historyPage.actions.importing")
                          : t("historyPage.actions.addToGallery")}
                      </Button>
                    )}
                  </div>
                )}
              {(selectedTaskCanFetchResult || selectedTaskIsFailed) && (
                <div className="flex flex-wrap justify-end gap-2">
                  {selectedTaskCanFetchResult && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        void handleFetchResult(selectedTask);
                      }}
                      disabled={isFetchingResult}
                      className="gap-2 border-sky-200 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
                    >
                      {isFetchingResult ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {getTaskFetchResultLabel(selectedTask, t)}
                    </Button>
                  )}
                  {selectedTaskIsFailed && (
                    <Button
                      variant="outline"
                      onClick={() => handleRetryTask(selectedTask)}
                      className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t("historyPage.actions.retryGenerate")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {shareDialogTarget ? (
        <ShareDialog
          itemId={shareDialogTarget.itemId}
          itemTitle={shareDialogTarget.title}
          isOpen={Boolean(shareDialogTarget)}
          onClose={() => setShareDialogTarget(null)}
        />
      ) : null}
    </div>
  );
}
