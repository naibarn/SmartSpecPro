/**
 * Media History Page - SmartAIHub
 * View and manage media generation tasks
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
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
  Share2,
  Library,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import ExpiredMediaPlaceholder from '@/components/media/ExpiredMediaPlaceholder';
import { ShareDialog } from '@/components/library/ShareDialog';
import {
  buildTaskLibraryErrorState,
  buildTaskLibraryStateFromAddResult,
  getAddToLibraryErrorMessage,
  getAddToLibrarySuccessMessage,
  getLibraryStatusMeta as getLibraryItemStatusMeta,
  isMediaTaskEligibleForLibraryAdd,
  type LibrarySearchResultItem,
  type TaskLibraryUIState,
} from '@/lib/libraryUi';
import {
  extractReferenceImageConfig,
  extractReferenceMediaAssets,
  type MediaHistoryReferenceMediaAsset,
  type MediaHistoryReferenceImageConfig,
} from '@/lib/mediaHistoryDebug';
import { cn } from '@/lib/utils';

type MediaType = 'image' | 'video' | 'audio';
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
type HistoryViewMode = 'list' | 'gallery';

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

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
};

const mediaTypeConfig: Record<MediaType, { label: string; icon: React.ElementType; color: string }> = {
  image: { label: 'Image', icon: Image, color: 'text-purple-600' },
  video: { label: 'Video', icon: Video, color: 'text-blue-600' },
  audio: { label: 'Audio', icon: Music, color: 'text-green-600' },
};

const fallbackStatusConfig = {
  label: 'Unknown',
  color: 'bg-gray-100 text-gray-800',
  icon: AlertCircle,
};

const fallbackMediaTypeConfig = {
  label: 'Unknown',
  icon: FileImage,
  color: 'text-gray-500',
};

function getStatusMeta(status: string | undefined) {
  return statusConfig[status as TaskStatus] || fallbackStatusConfig;
}

function getMediaTypeMeta(mediaType: string | undefined) {
  return mediaTypeConfig[mediaType as MediaType] || fallbackMediaTypeConfig;
}

function getTaskLibraryDisplayLabel(state?: TaskLibraryUIState | null): string {
  if (state?.action === 'adding') return 'Adding to Library';
  if (state?.action === 'error') return 'Library Failed';

  const status = getLibraryItemStatusMeta(state?.status);
  if (status.label === 'Ready') return 'In Library';
  if (status.label === 'Not Added') return 'Not in Library';
  return `Library: ${status.label}`;
}

function extractTaskErrorInfo(task: MediaTask | null): {
  summary: string;
  details: string[];
  stateHint?: string;
  codeHint?: string;
} | null {
  if (!task) return null;

  const seen = new Set<string>();
  const details: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    details.push(normalized);
  };

  const resultData = task.resultData;
  const visited = new WeakSet<object>();
  const walk = (value: unknown, depth = 0) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    const priorityKeys = ['error', 'errorMessage', 'failMsg', 'message', 'msg', 'detail', 'reason'];
    for (const key of priorityKeys) {
      if (key in obj) walk(obj[key], depth + 1);
    }

    const nestedKeys = ['data', 'response', 'submission', 'output', 'result', 'resultJson', 'kie_ai_response', 'raw_response'];
    for (const key of nestedKeys) {
      if (key in obj) walk(obj[key], depth + 1);
    }
  };

  const findScalar = (value: unknown, keys: string[], depth = 0): string | undefined => {
    if (depth > 5 || value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findScalar(item, keys, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate);
    }
    for (const nested of Object.values(obj)) {
      const found = findScalar(nested, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  push(task.errorMessage);
  if (resultData) walk(resultData);

  const stateHint = findScalar(resultData, ['state', 'status', 'task_state', 'taskStatus', 'successFlag']);
  const codeHint = findScalar(resultData, ['errorCode', 'code', 'statusCode', 'status_code']);

  const summary =
    details[0] ||
    (task.status === 'failed'
      ? 'Generation failed, but provider did not return a clear error message.'
      : '');

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

  const resultData = task.resultData && typeof task.resultData === 'object'
    ? (task.resultData as Record<string, unknown>)
    : {};
  const parameters = task.parameters && typeof task.parameters === 'object'
    ? (task.parameters as Record<string, unknown>)
    : {};

  const debugObj = (resultData.debug && typeof resultData.debug === 'object')
    ? (resultData.debug as Record<string, unknown>)
    : {};

  const apiConfigRaw = (
    parameters.api_config ??
    parameters.apiConfig
  );
  const apiConfig = apiConfigRaw && typeof apiConfigRaw === 'object'
    ? (apiConfigRaw as Record<string, unknown>)
    : {};

  const traceId =
    (typeof debugObj.trace_id === 'string' && debugObj.trace_id.trim()) ? debugObj.trace_id.trim() :
    (typeof apiConfig.trace_id === 'string' && apiConfig.trace_id.trim()) ? apiConfig.trace_id.trim() :
    undefined;
  const providerHint =
    (typeof debugObj.provider_hint === 'string' && debugObj.provider_hint.trim()) ? debugObj.provider_hint.trim() :
    (typeof apiConfig.provider === 'string' && apiConfig.provider.trim()) ? apiConfig.provider.trim() :
    undefined;
  const logFile =
    (typeof debugObj.log_file === 'string' && debugObj.log_file.trim()) ? debugObj.log_file.trim() :
    undefined;

  if (!traceId && !providerHint && !logFile) return null;
  return { traceId, providerHint, logFile };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readFirstHttpUrl(value: unknown, visited = new WeakSet<object>()): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstHttpUrl(item, visited);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (visited.has(record)) return null;
  visited.add(record);

  for (const nestedValue of Object.values(record)) {
    const found = readFirstHttpUrl(nestedValue, visited);
    if (found) return found;
  }

  return null;
}

function extractMediaHistoryThumbnailUrl(task: MediaTask): string | null {
  const resultData = task.resultData;
  if (!resultData || typeof resultData !== 'object') {
    return null;
  }

  const parsedResultJson = typeof resultData.resultJson === 'string'
    ? (() => {
      try {
        return JSON.parse(resultData.resultJson);
      } catch {
        return null;
      }
    })()
    : null;

  return (
    readFirstHttpUrl(resultData.poster)
    || readFirstHttpUrl(resultData.poster_url)
    || readFirstHttpUrl(resultData.posterUrl)
    || readFirstHttpUrl(resultData.thumbnail)
    || readFirstHttpUrl(resultData.thumbnail_url)
    || readFirstHttpUrl(resultData.thumbnailUrl)
    || readFirstHttpUrl(parsedResultJson?.poster)
    || readFirstHttpUrl(parsedResultJson?.poster_url)
    || readFirstHttpUrl(parsedResultJson?.thumbnail)
    || readFirstHttpUrl(parsedResultJson?.thumbnail_url)
    || null
  );
}

function buildFallbackApiUrl(providerHint: string | undefined, endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const normalizedProvider = String(providerHint || '').trim().toLowerCase();
  const baseUrl = normalizedProvider === 'uvoice'
    ? 'https://api.uvoice.ai'
    : 'https://api.kie.ai/api/v1';
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

function sanitizeDebugPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugPayload(item));
  }
  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('api_key')
      || lower.includes('apikey')
      || lower.includes('token')
      || lower.includes('secret')
      || lower.includes('authorization')
      || lower.includes('password')
    ) {
      next[key] = '***redacted***';
      continue;
    }
    next[key] = sanitizeDebugPayload(raw);
  }
  return next;
}

function extractStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === 'string' ? [item] : []))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  return [];
}

function extractReferenceImageUrls(task: MediaTask | null, apiDebugInfo: TaskApiDebugInfo | null): string[] {
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

function extractTaskApiDebugInfo(task: MediaTask | null): TaskApiDebugInfo | null {
  if (!task) return null;

  const resultData = toRecord(task.resultData) ?? {};
  const parameters = toRecord(task.parameters) ?? {};
  const debugObj = toRecord(resultData.debug) ?? {};
  const apiDebug = toRecord(debugObj.api) ?? {};
  const failureObj = toRecord(resultData.failure) ?? {};
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
    apiConfig.provider,
  );
  const endpoint = pickString(
    apiDebug.endpoint,
    providerApi?.endpoint,
    apiConfig.endpoint,
    apiConfig.api_endpoint,
    apiConfig.apiEndpoint,
  );
  const requestUrl = pickString(
    apiDebug.request_url,
    apiDebug.api_url,
    providerApi?.request_url,
    providerApi?.api_url,
    buildFallbackApiUrl(providerHint, endpoint),
  );
  const method = pickString(
    apiDebug.method,
    providerApi?.method,
    'POST',
  );
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
    extraParams.voice,
  );
  const requestModel = pickString(
    apiDebug.model,
    providerApi?.model,
    apiRequestPayload?.model,
    providerRequestPayload?.model,
    parameters.model,
    task.model,
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
    task.prompt,
  );
  const fallbackRequestPayload = {
    model: requestModel || task.model,
    text: requestText || task.prompt,
    voice_id: voiceId,
    parameters,
  };
  const requestPayload = sanitizeDebugPayload(
    apiDebug.request_payload
    ?? providerApi?.request_payload
    ?? (Object.keys(parameters).length > 0 ? fallbackRequestPayload : undefined)
    ?? fallbackRequestPayload
  );
  const responseStatusRaw = (
    apiDebug.response_status
    ?? providerApi?.response_status
    ?? failureObj.http_status_code
    ?? kieResponse?.code
    ?? resultData.status_code
  );
  const responseStatus = typeof responseStatusRaw === 'number'
    ? responseStatusRaw
    : (typeof responseStatusRaw === 'string' && responseStatusRaw.trim() ? Number(responseStatusRaw) : undefined);
  const responseBody = pickString(
    apiDebug.response_body,
    providerApi?.response_body,
  );
  const responseJson = sanitizeDebugPayload(
    apiDebug.response_json
    ?? providerApi?.response_json
    ?? failureObj.provider_response
    ?? resultData.kie_ai_response
    ?? resultData.raw_response
    ?? resultData.response
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
    kieResponse?.message,
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
    providerMessage,
  );

  if (
    !providerHint
    && !endpoint
    && !requestUrl
    && !requestModel
    && !requestText
    && !voiceId
    && !requestPayload
    && !responseBody
    && !responseJson
    && !responseMessage
    && !providerMessage
    && !responseStatus
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
    responseStatus: Number.isFinite(responseStatus as number) ? Number(responseStatus) : undefined,
    responseMessage,
    responseBody,
    responseJson,
    providerMessage,
    providerDetail: sanitizeDebugPayload(failureObj.provider_detail),
  };
}

function formatReferenceImageConfigLabel(config?: MediaHistoryReferenceImageConfig | null): string {
  if (!config) return '';
  const title = config.label?.trim() || config.key;
  return `${title} (${config.key}, ${config.type})`;
}

function getReferenceMediaAssetLabel(asset: MediaHistoryReferenceMediaAsset): string {
  return asset.kind === 'video' ? 'Video reference' : 'Image reference';
}

function formatReferenceMediaSourceLabel(source?: MediaHistoryReferenceImageConfig['source']): string {
  if (source === 'request_payload') return 'request payload';
  if (source === 'task_parameters') return 'task parameters';
  return 'unknown source';
}

function getReferenceMediaTooltipText(
  asset: MediaHistoryReferenceMediaAsset,
  config?: MediaHistoryReferenceImageConfig | null,
): string[] {
  const lines = [
    `Asset type: ${asset.kind}`,
    config ? `Resolved field: ${config.label?.trim() || config.key}` : 'Resolved field: unknown',
    config ? `Field key: ${config.key}` : 'Field key: unknown',
    config ? `Field type: ${config.type}` : 'Field type: unknown',
    config ? `Source: ${formatReferenceMediaSourceLabel(config.source)}` : 'Source: unknown',
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
    <div className={cn("relative h-full w-full overflow-hidden bg-slate-950", className)}>
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
  const [, setLocation] = useLocation();
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isFetchingResult, setIsFetchingResult] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<HistoryViewMode>('list');
  const [taskLibraryState, setTaskLibraryState] = useState<Record<string, TaskLibraryUIState>>({});
  const [shareDialogTarget, setShareDialogTarget] = useState<{ itemId: number; title: string } | null>(null);
  const [fullscreenTask, setFullscreenTask] = useState<MediaTask | null>(null);
  const [fullscreenReferenceMedia, setFullscreenReferenceMedia] = useState<MediaHistoryReferenceMediaAsset | null>(null);
  const [copiedPromptTaskId, setCopiedPromptTaskId] = useState<string | null>(null);
  const [copiedDebugTaskId, setCopiedDebugTaskId] = useState<string | null>(null);
  const [expiredUrls, setExpiredUrls] = useState<Set<string>>(() => new Set());
  const markExpired = useCallback((url: string) => {
    setExpiredUrls((prev) => {
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
    refetch,
  } = trpc.media.listTasks.useQuery({
    mediaType: mediaTypeFilter !== 'all' ? mediaTypeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 100,
    offset: 0,
    daysAgo: 12, // Only show tasks from last 12 days
  });
  const tasks: MediaTask[] = tasksData?.tasks || [];
  const totalTasks = tasksData?.total || 0;

  const { data: recentLibraryData } = trpc.library.search.useQuery(
    {
      limit: 200,
      filters: {
        recentDays: 30,
      },
    },
    {
      enabled: tasks.length > 0,
      staleTime: 30_000,
    },
  );
  const recentLibraryResults = (recentLibraryData?.results || []) as LibrarySearchResultItem[];

  // Mutation for fetching task result from Kie.ai
  const fetchResultMutation = trpc.media.fetchTaskResult.useMutation({
    onSuccess: (data) => {
      if (data.fetched && data.task) {
        // Update local task state
        setSelectedTask(data.task as MediaTask);
        // Refetch the list to update the table
        refetch();
      }
    },
  });

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
      toast.success('Added to gallery! View it in the Gallery page.');
    },
    onError: (error) => {
      toast.error(`Failed to add to gallery: ${error.message}`);
    },
  });

  // State for tracking gallery import in progress
  const [importingTaskId, setImportingTaskId] = useState<string | null>(null);

  const libraryItemsBySourceUrl = useMemo(() => {
    const map = new Map<string, TaskLibraryUIState>();
    for (const item of recentLibraryResults) {
      const sourceUrl = item.source_url?.trim();
      if (!sourceUrl) continue;
      map.set(sourceUrl, {
        action: 'added',
        itemId: item.item_id,
        status: item.status,
      });
    }
    return map;
  }, [recentLibraryResults]);

  const getEffectiveTaskLibraryState = useCallback((task: MediaTask): TaskLibraryUIState | undefined => {
    const localState = taskLibraryState[task.id];
    if (localState) return localState;
    const sourceUrl = task.resultUrl?.trim();
    if (!sourceUrl) return undefined;
    return libraryItemsBySourceUrl.get(sourceUrl);
  }, [libraryItemsBySourceUrl, taskLibraryState]);

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
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
      setSelectedTaskIds(new Set(tasks.map(t => t.id)));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const count = selectedTaskIds.size;
    if (count === 0) return;

    if (confirm(`Are you sure you want to delete ${count} selected task${count > 1 ? 's' : ''}?`)) {
      toast.promise(
        Promise.all(
          Array.from(selectedTaskIds).map(taskId =>
            deleteTaskMutation.mutateAsync({ taskId })
          )
        ),
        {
          loading: `Deleting ${count} task${count > 1 ? 's' : ''}...`,
          success: () => {
            setSelectedTaskIds(new Set());
            return `Successfully deleted ${count} task${count > 1 ? 's' : ''}`;
          },
          error: 'Failed to delete some tasks',
        }
      );
    }
  };

  // Handle adding task result to gallery (admin only)
  const handleAddToGallery = async (task: MediaTask) => {
    if (!task.resultUrl) {
      toast.error('No result URL available');
      return;
    }

    setImportingTaskId(task.id);

    try {
      // Determine folder based on media type
      const folder = task.mediaType === 'video' ? 'videos' : 'images';

      // First, import the file from temp URL to permanent storage
      toast.info('Importing file to storage...');
      const importResult = await importFromUrlMutation.mutateAsync({
        url: task.resultUrl,
        folder: folder as 'images' | 'videos' | 'thumbnails' | 'websites',
      });

      // Determine aspect ratio based on media type
      let aspectRatio: '1:1' | '9:16' | '16:9' = '1:1';
      if (task.mediaType === 'video') {
        aspectRatio = '16:9';
      }

      // Create gallery item with permanent URL
      await addToGalleryMutation.mutateAsync({
        type: task.mediaType === 'audio' ? 'video' : task.mediaType, // Map audio to video for gallery
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
      console.error('Failed to add to gallery:', error);
      toast.error(`Failed to add to gallery: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImportingTaskId(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (viewMode === 'gallery') {
      setSelectedTaskIds(new Set());
    }
  }, [viewMode]);

  // Check if all visible tasks are selected
  const allSelected = tasks.length > 0 && tasks.every(task => selectedTaskIds.has(task.id));
  const someSelected = selectedTaskIds.size > 0 && !allSelected;

  // Calculate stats
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const totalCredits = tasks.reduce((sum, t) => sum + (t.creditsUsed || 0), 0);

  const stats = [
    {
      label: 'Total Tasks',
      value: totalTasks.toString(),
      icon: FileImage,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Completed',
      value: completedCount.toString(),
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: 'In Progress',
      value: pendingCount.toString(),
      icon: Clock,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Credits Used',
      value: totalCredits.toString(),
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
  ];

  const selectedTaskLibraryState = selectedTask ? getEffectiveTaskLibraryState(selectedTask) : undefined;
  const selectedTaskLibraryMeta = getLibraryItemStatusMeta(selectedTaskLibraryState?.status);
  const selectedTaskDebugInfo = extractTaskDebugInfo(selectedTask);
  const selectedTaskApiDebugInfo = extractTaskApiDebugInfo(selectedTask);
  const selectedTaskReferenceImageConfig = extractReferenceImageConfig(selectedTask, selectedTaskApiDebugInfo);
  const selectedTaskReferenceMediaAssets = extractReferenceMediaAssets(selectedTask, selectedTaskApiDebugInfo);
  const selectedTaskErrorInfo = extractTaskErrorInfo(selectedTask);
  const selectedTaskIsFailed = selectedTask?.status === 'failed';
  const selectedTaskIsCancelled = selectedTask?.status === 'cancelled';

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
        relative: 'Unknown',
        absolute: 'Invalid date',
      };
    }

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays < 7) relative = `${diffDays}d ago`;
    else relative = d.toLocaleDateString();

    // Return both for display (relative shown, absolute in title)
    // toLocaleString() automatically uses browser's local timezone
    return {
      relative,
      absolute: d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false, // Use 24-hour format
      }),
    };
  };

  const handleViewDetails = async (task: MediaTask) => {
    setSelectedTask(task);
    setDetailsOpen(true);

    // Auto-fetch result if the provider task id exists.
    // Otherwise just refresh from the task list so status changes in DB still show up.
    if (!task.resultUrl && (task.status === 'processing' || task.status === 'pending')) {
      setIsFetchingResult(true);
      try {
        if (task.taskId) {
          await fetchResultMutation.mutateAsync({ taskId: task.id });
        } else {
          const refreshed = await refetch();
          const updatedTask = refreshed.data?.tasks.find((t) => t.id === task.id);
          if (updatedTask) {
            setSelectedTask(updatedTask as MediaTask);
          }
        }
      } catch (error) {
        console.error('Failed to fetch task result:', error);
      } finally {
        setIsFetchingResult(false);
      }
    }
  };

  const handleFetchResult = async () => {
    if (!selectedTask) return;
    setIsFetchingResult(true);
    try {
      if (selectedTask.taskId) {
        await fetchResultMutation.mutateAsync({ taskId: selectedTask.id });
      } else {
        const refreshed = await refetch();
        const updatedTask = refreshed.data?.tasks.find((t) => t.id === selectedTask.id);
        if (updatedTask) {
          setSelectedTask(updatedTask as MediaTask);
        }
      }
    } catch (error) {
      console.error('Failed to fetch task result:', error);
    } finally {
      setIsFetchingResult(false);
    }
  };

  const handleDownload = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const writeClipboardText = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return;
    }
    throw new Error('Clipboard API not available');
  };

  const handleCopyPrompt = async (task: MediaTask) => {
    try {
      await writeClipboardText(task.prompt || '');
      setCopiedPromptTaskId(task.id);
      window.setTimeout(() => {
        setCopiedPromptTaskId((current) => (current === task.id ? null : current));
      }, 2000);
      toast.success('Prompt copied');
    } catch (error) {
      console.error('Copy prompt failed:', error);
      toast.error('Failed to copy prompt');
    }
  };

  const handleOpenShare = (task: MediaTask) => {
    const state = getEffectiveTaskLibraryState(task);
    if (!state?.itemId) {
      toast.error('Add this item to Library before sharing.');
      return;
    }
    setShareDialogTarget({
      itemId: state.itemId,
      title: task.prompt.slice(0, 80) || `${task.mediaType} - ${task.model}`,
    });
  };

  const handleOpenFullscreenMedia = (task: MediaTask) => {
    if ((task.mediaType !== 'image' && task.mediaType !== 'video') || !task.resultUrl || expiredUrls.has(task.resultUrl)) return;
    setFullscreenTask(task);
  };

  const handleOpenFullscreenReferenceMedia = (asset: MediaHistoryReferenceMediaAsset) => {
    if (!asset.url || expiredUrls.has(asset.url)) return;
    setFullscreenReferenceMedia(asset);
  };

  const handleCopyReferenceMediaUrl = async (asset: MediaHistoryReferenceMediaAsset) => {
    try {
      await writeClipboardText(asset.url);
      toast.success(`${asset.kind === 'video' ? 'Video' : 'Image'} reference URL copied`);
    } catch (error) {
      console.error('Copy reference media URL failed:', error);
      toast.error('Failed to copy reference URL');
    }
  };

  const handleOpenReferenceMediaUrl = (asset: MediaHistoryReferenceMediaAsset) => {
    window.open(asset.url, '_blank', 'noopener,noreferrer');
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
        setCopiedDebugTaskId((current) => (current === selectedTask.id ? null : current));
      }, 2000);
      toast.success('Copied debug JSON');
    } catch (error) {
      console.error('Copy debug JSON failed:', error);
      toast.error('Failed to copy debug JSON');
    }
  };

  const refreshLibraryStatus = useCallback(
    async (taskId: string, itemId: number) => {
      try {
        const item = await trpcUtils.library.getItem.fetch({ id: itemId });
        setTaskLibraryState((prev) => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || { action: 'added' as const }),
            action: 'added',
            itemId,
            status: item.status,
          },
        }));
      } catch {
        // Keep current optimistic state; retry in next interval.
      }
    },
    [trpcUtils.library.getItem],
  );

  const handleAddToLibrary = async (task: MediaTask) => {
    if (!isMediaTaskEligibleForLibraryAdd(task)) {
      toast.error('Only completed tasks with results can be added to library.');
      return;
    }

    setTaskLibraryState((prev) => ({
      ...prev,
      [task.id]: {
        ...(prev[task.id] || { action: 'idle' as const }),
        action: 'adding',
        status: 'indexing',
      },
    }));

    try {
      const result = await addToLibraryMutation.mutateAsync({ taskId: task.id });
      const nextState = buildTaskLibraryStateFromAddResult(result);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: nextState,
      }));
      toast.success(getAddToLibrarySuccessMessage(result));
      await refetch();
      await refreshLibraryStatus(task.id, result.itemId);
    } catch (error) {
      const errorState = buildTaskLibraryErrorState(error);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: errorState,
      }));
      toast.error(getAddToLibraryErrorMessage(error));
    }
  };

  const handleRetryTask = useCallback((task: MediaTask) => {
    const prompt = task.prompt.trim();
    if (!prompt) {
      toast.error('Cannot retry without a prompt.');
      return;
    }

    const taskParameters = toRecord(task.parameters);
    const referenceAssets = extractReferenceMediaAssets(task, null);
    const referenceImages = referenceAssets.filter((asset) => asset.kind === 'image').map((asset) => asset.url);
    const referenceVideoUrl = referenceAssets.find((asset) => asset.kind === 'video')?.url;
    const aspectRatio = pickString(
      taskParameters?.aspectRatio,
      taskParameters?.aspect_ratio,
      taskParameters?.ratio,
    );
    const extraParams = toRecord(taskParameters?.extraParams ?? taskParameters?.extra_params);

    const params = new URLSearchParams();
    params.set('type', task.mediaType);
    params.set('prompt', prompt);
    if (task.model?.trim()) {
      params.set('model', task.model.trim());
    }
    if (aspectRatio) {
      params.set('aspectRatio', aspectRatio);
    }
    if (taskParameters?.resolution !== undefined && taskParameters.resolution !== null) {
      params.set('resolution', String(taskParameters.resolution));
    }
    if (taskParameters?.outputFormat !== undefined && taskParameters.outputFormat !== null) {
      params.set('outputFormat', String(taskParameters.outputFormat));
    }
    if (taskParameters?.duration !== undefined && taskParameters.duration !== null) {
      params.set('duration', String(taskParameters.duration));
    }
    if (referenceVideoUrl) {
      params.set('referenceVideoUrl', referenceVideoUrl);
    }
    if (referenceImages.length > 0) {
      params.set('referenceImages', JSON.stringify(referenceImages));
    }
    if (extraParams && Object.keys(extraParams).length > 0) {
      params.set('extraParams', JSON.stringify(extraParams));
    }
    params.set('autostart', '1');

    setLocation(`/media-studio?${params.toString()}`);
  }, [setLocation]);

  // Background fallback polling:
  // if provider callback/worker update is delayed, periodically refresh one pending task.
  useEffect(() => {
    const hasPendingTasks = tasks.some(
      (task) =>
        !task.resultUrl &&
        (task.status === 'processing' || task.status === 'pending')
    );

    if (!hasPendingTasks) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible' || fetchResultMutation.isPending) return;
      const nextTask = tasks.find(
        (task) =>
          !!task.taskId &&
          !task.resultUrl &&
          (task.status === 'processing' || task.status === 'pending')
      );
      try {
        if (nextTask) {
          await fetchResultMutation.mutateAsync({ taskId: nextTask.id });
        } else {
          await refetch();
        }
      } catch (error) {
        console.error('Background fetch task result failed:', error);
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [tasks, fetchResultMutation.isPending, fetchResultMutation.mutateAsync, refetch]);

  useEffect(() => {
    const tracking = Object.entries(taskLibraryState).filter(
      ([, state]) => state.action === 'added' && state.itemId && state.status === 'indexing',
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <FileImage className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Media History</h1>
                  <p className="text-sm text-gray-500">View your generation tasks</p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={tasksLoading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${tasksLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
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
              <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-2 sm:mb-4`}>
                <StatIcon className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.color}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-xs sm:text-sm text-gray-500">{stat.label}</div>
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
            <p className="font-medium">Data Retention Notice</p>
            <p className="mt-1">
              This page shows generation history from the <strong>last 12 days</strong> only.
              Items older than <strong>12 days</strong> are automatically deleted to manage storage.
              Please download any important media before it expires.
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Type:</span>
              <Select value={mediaTypeFilter} onValueChange={(v) => setMediaTypeFilter(v as MediaType | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Video
                    </div>
                  </SelectItem>
                  <SelectItem value="audio">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      Audio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  type="button"
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="gap-2 rounded-lg px-3"
                >
                  <List className="w-4 h-4" />
                  List
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('gallery')}
                  className="gap-2 rounded-lg px-3"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Gallery
                </Button>
              </div>
              {viewMode === 'list' && selectedTaskIds.size > 0 && (
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
                  Delete {selectedTaskIds.size} selected
                </Button>
              )}
              <div className="text-sm text-gray-500">
                Showing {tasks.length} of {totalTasks} tasks
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
          {tasksLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileImage className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No tasks found</h3>
              <p className="text-sm text-gray-500">
                {mediaTypeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Generate some images or videos to see them here'}
              </p>
            </div>
          ) : viewMode === 'gallery' ? (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {tasks.map((task) => {
                  const typeConfig = getMediaTypeMeta(task.mediaType);
                  const status = getStatusMeta(task.status);
                  const StatusIcon = status?.icon || AlertCircle;
                  const TypeIcon = typeConfig?.icon || FileImage;
                  const canAddToLibrary = isMediaTaskEligibleForLibraryAdd(task);
                  const libraryState = getEffectiveTaskLibraryState(task);
                  const libraryStatusMeta = getLibraryItemStatusMeta(libraryState?.status);
                  const canShare = Boolean(libraryState?.itemId);
                  const canOpenFullscreen = (task.mediaType === 'image' || task.mediaType === 'video') && Boolean(task.resultUrl) && !expiredUrls.has(task.resultUrl || '');
                  const createdDate = safeParseDate(task.createdAt);

                  return (
                    <div
                      key={task.id}
                      className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-lg shadow-slate-300/25 backdrop-blur-sm"
                    >
                      <div className="relative">
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                          <Badge variant="outline" className="bg-white/90 text-slate-700 shadow-sm">
                            <TypeIcon className={`mr-1 h-3 w-3 ${typeConfig.color}`} />
                            {typeConfig.label}
                          </Badge>
                          <Badge className={`gap-1 shadow-sm ${status.color}`}>
                            <StatusIcon className={`h-3 w-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                            {status.label}
                          </Badge>
                        </div>
                        {canAddToLibrary && (
                          <div className="absolute right-3 top-3 z-10">
                            <Badge className={`gap-1 shadow-sm ${libraryStatusMeta.className}`}>
                              <Library className="h-3 w-3" />
                              {getTaskLibraryDisplayLabel(libraryState)}
                            </Badge>
                          </div>
                        )}

                        {task.status === 'completed' && task.resultUrl ? (
                          expiredUrls.has(task.resultUrl) ? (
                            <ExpiredMediaPlaceholder
                              mediaType={task.mediaType}
                              className="aspect-square w-full rounded-none border-0"
                            />
                          ) : task.mediaType === 'image' ? (
                            <button
                              type="button"
                              className="flex aspect-square w-full items-center justify-center bg-slate-100/80 p-3 text-left"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <img
                                src={task.resultUrl}
                                alt={task.prompt || 'Generated image'}
                                className="h-full w-full object-contain"
                                onError={() => markExpired(task.resultUrl!)}
                              />
                            </button>
                          ) : task.mediaType === 'video' ? (
                            <button
                              type="button"
                              className="relative block w-full text-left"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <VideoThumbnailCard
                                src={task.resultUrl}
                                thumbnailUrl={extractMediaHistoryThumbnailUrl(task)}
                                alt={task.prompt || 'Generated video'}
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
                                <p className="text-sm font-medium">Audio Result</p>
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
                              <TypeIcon className={`mx-auto mb-3 h-10 w-10 ${typeConfig.color}`} />
                              <p className="text-sm font-medium">{status.label}</p>
                            </div>
                          </button>
                        )}
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{task.model}</p>
                            <p className="text-xs text-slate-500">
                              {createdDate ? createdDate.toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              }) : 'Unknown date'}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            <Zap className="mr-1 h-3 w-3 text-yellow-500" />
                            {task.creditsUsed || 0}
                          </Badge>
                        </div>

                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                            {task.prompt || 'No prompt available'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => task.resultUrl && handleDownload(task.resultUrl)}
                            disabled={!task.resultUrl}
                            className="justify-start gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToLibrary(task)}
                            disabled={!canAddToLibrary || libraryState?.action === 'adding'}
                            className="justify-start gap-2"
                          >
                            {libraryState?.action === 'adding' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : libraryState?.action === 'added' ? (
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                            ) : libraryState?.action === 'error' ? (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            ) : (
                              <ImagePlus className="h-4 w-4" />
                            )}
                            {libraryState?.action === 'added' ? 'In Library' : 'Add Library'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenShare(task)}
                            disabled={!canShare}
                            className="justify-start gap-2"
                            title={canShare ? 'Share this library item' : 'Add to Library before sharing'}
                          >
                            <Share2 className="h-4 w-4" />
                            Share
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenFullscreenMedia(task)}
                            disabled={!canOpenFullscreen}
                            className="justify-start gap-2"
                            title={canOpenFullscreen ? 'Open full media' : 'Available for images and videos only'}
                          >
                            <Maximize2 className="h-4 w-4" />
                            Full
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(task)}
                            className="justify-start gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyPrompt(task)}
                            disabled={!task.prompt}
                            className="justify-start gap-2"
                          >
                            {copiedPromptTaskId === task.id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {copiedPromptTaskId === task.id ? 'Copied' : 'Prompt'}
                          </Button>
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
                {tasks.map((task) => {
                  const typeConfig = getMediaTypeMeta(task.mediaType);
                  const status = getStatusMeta(task.status);
                  const StatusIcon = status?.icon || AlertCircle;
                  const TypeIcon = typeConfig?.icon || FileImage;
                  const canAddToLibrary = isMediaTaskEligibleForLibraryAdd(task);
                  const libraryState = getEffectiveTaskLibraryState(task);
                  const libraryStatusMeta = getLibraryItemStatusMeta(libraryState?.status);
                  return (
                    <div key={task.id} className="flex gap-3 p-4">
                      {/* Preview */}
                      <div className="flex-shrink-0">
                        {task.status === 'completed' && task.resultUrl ? (
                          expiredUrls.has(task.resultUrl) ? (
                            <ExpiredMediaPlaceholder
                              mediaType={task.mediaType}
                              compact
                              className="w-14 h-14"
                            />
                          ) : task.mediaType === 'image' ? (
                            <img
                              src={task.resultUrl}
                              alt="Preview"
                              className="w-14 h-14 rounded-lg object-cover border cursor-pointer hover:opacity-80"
                              onError={() => markExpired(task.resultUrl!)}
                              onClick={() => handleOpenFullscreenMedia(task)}
                            />
                          ) : task.mediaType === 'video' ? (
                            <div
                              className="w-14 h-14 rounded-lg bg-blue-100 flex items-center justify-center cursor-pointer"
                              onClick={() => handleOpenFullscreenMedia(task)}
                            >
                              <VideoThumbnailCard
                                src={task.resultUrl}
                                thumbnailUrl={extractMediaHistoryThumbnailUrl(task)}
                                alt={task.prompt || 'Generated video'}
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
                            <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Badge variant="outline" className="gap-1 text-xs">
                            <TypeIcon className={`w-3 h-3 ${typeConfig.color}`} />
                            {typeConfig.label}
                          </Badge>
                          <Badge className={`gap-1 text-xs ${status.color}`}>
                            <StatusIcon className={`w-3 h-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                            {status.label}
                          </Badge>
                          {canAddToLibrary && libraryState?.action !== 'adding' && libraryState?.action !== 'error' && (
                            <Badge className={`text-xs ${libraryStatusMeta.className}`}>
                              {getTaskLibraryDisplayLabel(libraryState)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-mono text-gray-500 truncate mb-0.5">{task.model}</p>
                        <p className="text-xs text-gray-600 line-clamp-2 mb-1">{task.prompt}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {task.creditsUsed ? (
                            <span className="flex items-center gap-0.5">
                              <Zap className="w-3 h-3 text-yellow-500" />
                              {task.creditsUsed}
                            </span>
                          ) : null}
                          <span>{new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(task)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {task.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetryTask(task)}
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Retry generation"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        {task.status === 'completed' && task.resultUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddToLibrary(task)}
                              disabled={libraryState?.action === 'adding'}
                              className={`h-8 w-8 p-0 ${libraryState?.action === 'added' ? 'text-emerald-600' : 'text-indigo-600'}`}
                            >
                              {libraryState?.action === 'adding' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : libraryState?.action === 'added' ? (
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
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {(task.status === 'failed' || task.status === 'cancelled' || task.status === 'processing' || task.status === 'pending') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            disabled={deleteTaskMutation.isPending}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
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
                          aria-label="Select all tasks"
                          className={someSelected ? 'data-[state=checked]:bg-purple-500' : ''}
                        />
                      </TableHead>
                      <TableHead className="w-[80px]">Preview</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="max-w-[200px]">Prompt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>External ID</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Library</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => {
                      const typeConfig = getMediaTypeMeta(task.mediaType);
                      const status = getStatusMeta(task.status);
                      const StatusIcon = status?.icon || AlertCircle;
                      const TypeIcon = typeConfig?.icon || FileImage;
                      const canAddToLibrary = isMediaTaskEligibleForLibraryAdd(task);
                      const libraryState = getEffectiveTaskLibraryState(task);
                      const libraryStatusMeta = getLibraryItemStatusMeta(libraryState?.status);

                      return (
                        <TableRow key={task.id} className="hover:bg-gray-50/50">
                          <TableCell>
                            <Checkbox
                              checked={selectedTaskIds.has(task.id)}
                              onCheckedChange={(checked) => handleSelectTask(task.id, checked === true)}
                              aria-label={`Select task ${task.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            {task.status === 'completed' && task.resultUrl ? (
                              expiredUrls.has(task.resultUrl) ? (
                                <ExpiredMediaPlaceholder
                                  mediaType={task.mediaType}
                                  compact
                                  className="w-12 h-12"
                                />
                              ) : task.mediaType === 'image' ? (
                                <img
                                  src={task.resultUrl}
                                  alt="Preview"
                                  className="w-12 h-12 rounded-lg object-cover border cursor-pointer hover:opacity-80"
                                  onError={() => markExpired(task.resultUrl!)}
                                  onClick={() => handleOpenFullscreenMedia(task)}
                                />
                              ) : task.mediaType === 'video' ? (
                                <div
                                  className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center cursor-pointer hover:bg-blue-200"
                                  onClick={() => handleOpenFullscreenMedia(task)}
                                >
                                  <VideoThumbnailCard
                                    src={task.resultUrl}
                                    thumbnailUrl={extractMediaHistoryThumbnailUrl(task)}
                                    alt={task.prompt || 'Generated video'}
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
                                <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <TypeIcon className={`w-3 h-3 ${typeConfig.color}`} />
                              {typeConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{task.model}</TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="truncate text-sm text-gray-600" title={task.prompt}>
                              {task.prompt}
                            </p>
                            {task.status === 'failed' && (() => {
                              const info = extractTaskErrorInfo(task);
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
                              <StatusIcon className={`w-3 h-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.taskId ? (
                              <span className="font-mono text-xs text-gray-600" title={task.taskId}>
                                {task.taskId.substring(0, 8)}...
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.creditsUsed ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Zap className="w-3 h-3 text-yellow-500" />
                                {task.creditsUsed}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {canAddToLibrary ? (
                              libraryState?.action === 'adding' ? (
                                <Badge className="gap-1 bg-amber-100 text-amber-800">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Adding
                                </Badge>
                              ) : libraryState?.action === 'error' ? (
                                <Badge className="gap-1 bg-red-100 text-red-700">
                                  <AlertCircle className="w-3 h-3" />
                                  Failed
                                </Badge>
                              ) : (
                                <Badge className={libraryStatusMeta.className}>
                                  {getTaskLibraryDisplayLabel(libraryState)}
                                </Badge>
                              )
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500" title={formatDate(task.createdAt).relative}>
                            {(() => {
                              const date = safeParseDate(task.createdAt);
                              if (!date) {
                                return <span className="text-gray-400">Invalid date</span>;
                              }
                              return (
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {date.toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {date.toLocaleTimeString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
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
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {task.status === 'failed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRetryTask(task)}
                                  className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title="Retry generation"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                              )}
                              {task.status === 'completed' && task.resultUrl && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleAddToLibrary(task)}
                                    disabled={libraryState?.action === 'adding'}
                                    className={`h-8 px-2 ${libraryState?.action === 'added' ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'}`}
                                    title={libraryStatusMeta.retryable ? 'Retry add to library' : 'Add to library'}
                                  >
                                    {libraryState?.action === 'adding' ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : libraryState?.action === 'added' ? (
                                      <CheckCircle className="w-4 h-4" />
                                    ) : libraryState?.action === 'error' ? (
                                      <AlertCircle className="w-4 h-4" />
                                    ) : (
                                      <ImagePlus className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownload(task.resultUrl!)}
                                    className="h-8 px-2 text-green-600 hover:text-green-700"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  {/* Add to Gallery button - admin only */}
                                  {user?.role === 'admin' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAddToGallery(task)}
                                      disabled={importingTaskId === task.id}
                                      className="h-8 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                      title="Add to Gallery"
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
                              {(task.status === 'failed' || task.status === 'cancelled' || task.status === 'processing' || task.status === 'pending') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTask(task.id)}
                                  disabled={deleteTaskMutation.isPending}
                                  className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete task"
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

      <Dialog open={Boolean(fullscreenTask)} onOpenChange={(open) => !open && setFullscreenTask(null)}>
        <DialogPortal>
          <DialogOverlay className="bg-black/95" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>Fullscreen Media</DialogTitle>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 h-11 w-11 rounded-md border border-cyan-500/70 bg-black/50 text-cyan-400 hover:bg-black/70 hover:text-cyan-300"
              >
                <span className="sr-only">Close fullscreen view</span>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </DialogClose>

            {fullscreenTask?.resultUrl ? (
              fullscreenTask.mediaType === 'video' ? (
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
                  alt={fullscreenTask.prompt || 'Fullscreen preview'}
                  className="block max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100vh-2rem)] sm:max-w-[calc(100vw-2rem)]"
                  onError={() => markExpired(fullscreenTask.resultUrl!)}
                />
              )
            ) : null}
          </div>
        </DialogPortal>
      </Dialog>

      <Dialog open={Boolean(fullscreenReferenceMedia)} onOpenChange={(open) => !open && setFullscreenReferenceMedia(null)}>
        <DialogPortal>
          <DialogOverlay className="bg-black/95" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>Fullscreen Reference Media</DialogTitle>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 h-11 w-11 rounded-md border border-cyan-500/70 bg-black/50 text-cyan-400 hover:bg-black/70 hover:text-cyan-300"
              >
                <span className="sr-only">Close fullscreen reference view</span>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </DialogClose>

            {fullscreenReferenceMedia?.url ? (
              fullscreenReferenceMedia.kind === 'video' ? (
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
                  alt="Reference preview"
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
                    const typeMeta = getMediaTypeMeta(selectedTask.mediaType);
                    const TypeIcon = typeMeta?.icon || FileImage;
                    return <TypeIcon className={`w-5 h-5 ${typeMeta.color}`} />;
                  })()}
                  {getMediaTypeMeta(selectedTask.mediaType).label} Generation Details
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
                  <span className="text-blue-700">Fetching result from provider...</span>
                </div>
              )}

              {/* Preview */}
              {selectedTask.status === 'completed' && selectedTask.resultUrl && (
                <div className="flex justify-center">
                  {expiredUrls.has(selectedTask.resultUrl) ? (
                    <ExpiredMediaPlaceholder
                      mediaType={selectedTask.mediaType}
                      className="w-full max-w-sm h-48"
                    />
                  ) : selectedTask.mediaType === 'image' ? (
                    <img
                      src={selectedTask.resultUrl}
                      alt="Generated"
                      className="max-h-[400px] rounded-lg border shadow-lg cursor-zoom-in"
                      onError={() => markExpired(selectedTask.resultUrl!)}
                      onClick={() => handleOpenFullscreenMedia(selectedTask)}
                    />
                  ) : selectedTask.mediaType === 'video' ? (
                    <video
                      src={selectedTask.resultUrl}
                      controls
                      className="max-h-[400px] rounded-lg border shadow-lg"
                      onError={() => markExpired(selectedTask.resultUrl!)}
                      onDoubleClick={() => handleOpenFullscreenMedia(selectedTask)}
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
              {!selectedTask.resultUrl && selectedTask.taskId && selectedTask.status !== 'failed' && (
                <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-700 mr-4">No result yet.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchResult}
                    disabled={isFetchingResult}
                    className="gap-2"
                  >
                    {isFetchingResult ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Fetch Result
                  </Button>
                </div>
              )}

              {(selectedTaskIsFailed || selectedTaskIsCancelled) && (selectedTaskErrorInfo || selectedTaskApiDebugInfo) && (
                <div className="rounded-lg border border-red-200 bg-red-50/80 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-700 font-medium">
                    <AlertCircle className="w-4 h-4" />
                    <span>Provider Error</span>
                  </div>
                  {selectedTaskErrorInfo && (
                    <p className="text-sm text-red-700">{selectedTaskErrorInfo.summary}</p>
                  )}
                  {selectedTaskApiDebugInfo?.providerMessage && (
                    <p className="text-xs text-red-600 break-words">
                      <span className="font-medium">Provider:</span> {selectedTaskApiDebugInfo.providerMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-red-600">
                    {selectedTaskApiDebugInfo?.responseStatus !== undefined && (
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
                  <span className="text-sm text-gray-500">Internal Task ID</span>
                  <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTask.id}</p>
                </div>
                {selectedTask.taskId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">Provider Task ID</span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTask.taskId}</p>
                  </div>
                )}
                {selectedTask.celeryTaskId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">Celery Task ID</span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTask.celeryTaskId}</p>
                  </div>
                )}
                {selectedTaskDebugInfo?.traceId && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">Debug Trace ID</span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTaskDebugInfo.traceId}</p>
                  </div>
                )}
                {selectedTaskDebugInfo?.providerHint && (
                  <div>
                    <span className="text-sm text-gray-500">Provider Hint</span>
                    <p className="font-mono text-sm break-all">{selectedTaskDebugInfo.providerHint}</p>
                  </div>
                )}
                {selectedTaskReferenceImageConfig && (
                  <>
                    <div>
                      <span className="text-sm text-gray-500">Reference Image Key</span>
                      <p className="font-mono text-sm break-all">{selectedTaskReferenceImageConfig.key}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Reference Image Type</span>
                      <Badge className="mt-1 gap-1 bg-sky-100 text-sky-800">
                        {selectedTaskReferenceImageConfig.type}
                      </Badge>
                    </div>
                  </>
                )}
                {selectedTaskDebugInfo?.logFile && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">Debug Log File</span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTaskDebugInfo.logFile}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Status</span>
                  <Badge className={`mt-1 gap-1 ${getStatusMeta(selectedTask.status).color}`}>
                    {getStatusMeta(selectedTask.status).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Library</span>
                  {isMediaTaskEligibleForLibraryAdd(selectedTask) ? (
                    selectedTaskLibraryState?.action === 'adding' ? (
                      <Badge className="mt-1 gap-1 bg-amber-100 text-amber-800">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Adding
                      </Badge>
                    ) : selectedTaskLibraryState?.action === 'error' ? (
                      <Badge className="mt-1 gap-1 bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </Badge>
                    ) : (
                      <Badge className={`mt-1 ${selectedTaskLibraryMeta.className}`}>
                        {getTaskLibraryDisplayLabel(selectedTaskLibraryState)}
                      </Badge>
                    )
                  ) : (
                    <p className="text-sm text-gray-400">Not eligible</p>
                  )}
                </div>
                <div>
                  <span className="text-sm text-gray-500">Model</span>
                  <p className="font-mono text-sm break-all">{selectedTask.model}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Credits Used</span>
                  <p className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    {selectedTask.creditsUsed || 0}
                  </p>
                </div>
                {selectedTaskReferenceMediaAssets.length > 0 && (
                  <div className="sm:col-span-2">
                    <span className="text-sm text-gray-500">
                      Reference Media Sent ({selectedTaskReferenceMediaAssets.length})
                    </span>
                    {selectedTaskReferenceImageConfig && (
                      <p className="text-xs text-gray-400 mt-1">
                        Resolved field: <span className="font-mono">{formatReferenceImageConfigLabel(selectedTaskReferenceImageConfig)}</span>
                      </p>
                    )}
                    <TooltipProvider delayDuration={200}>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {selectedTaskReferenceMediaAssets.map((asset, index) => (
                        <div key={`${asset.url}-${index}`} className="overflow-hidden rounded-lg border bg-white shadow-sm">
                          <div
                            className="relative aspect-video bg-gray-50 cursor-zoom-in"
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenFullscreenReferenceMedia(asset)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
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
                                    onClick={(event) => {
                                      event.stopPropagation();
                                    }}
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                    <span className="sr-only">Reference media details</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                  <div className="space-y-1">
                                    {getReferenceMediaTooltipText(asset, selectedTaskReferenceImageConfig).map((line) => (
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
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleCopyReferenceMediaUrl(asset);
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    <span className="sr-only">Copy reference URL</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy reference URL</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-full border border-white/70 bg-violet-50/90 text-violet-700 shadow-sm hover:bg-violet-50"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenReferenceMediaUrl(asset);
                                    }}
                                  >
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                    <span className="sr-only">Open reference URL</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open URL in new tab</TooltipContent>
                              </Tooltip>
                            </div>
                            {expiredUrls.has(asset.url) ? (
                              <ExpiredMediaPlaceholder
                                mediaType={asset.kind === 'video' ? 'video' : 'image'}
                                className="h-full w-full"
                              />
                            ) : asset.kind === 'video' ? (
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
                                alt={`${getReferenceMediaAssetLabel(asset)} ${index + 1}`}
                                className="h-full w-full object-cover"
                                onError={() => markExpired(asset.url)}
                              />
                            )}
                          </div>
                          <div className="border-t bg-white p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">
                                {selectedTaskReferenceImageConfig?.label?.trim() || getReferenceMediaAssetLabel(asset)}
                              </p>
                              <Badge className={`text-[10px] ${asset.kind === 'video' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {asset.kind}
                              </Badge>
                            </div>
                            <p className="font-mono text-[11px] break-all select-all text-gray-700 mt-1">
                              {asset.url}
                            </p>
                          </div>
                        </div>
                      ))}
                      </div>
                    </TooltipProvider>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Prompt</span>
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
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Prompt
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap">{selectedTask.prompt}</p>
                </div>
                {(selectedTaskIsFailed || selectedTaskIsCancelled) && selectedTaskApiDebugInfo && (
                  <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-sky-700">API Debug</span>
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
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Copy Debug JSON
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {selectedTaskApiDebugInfo.providerHint && (
                        <div>
                          <span className="text-xs text-sky-700/80">Provider</span>
                          <p className="font-mono text-xs break-all">{selectedTaskApiDebugInfo.providerHint}</p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.voiceId && (
                        <div>
                          <span className="text-xs text-sky-700/80">Voice ID</span>
                          <p className="font-mono text-xs break-all">{selectedTaskApiDebugInfo.voiceId}</p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.method && (
                        <div>
                          <span className="text-xs text-sky-700/80">Method</span>
                          <p className="font-mono text-xs">{selectedTaskApiDebugInfo.method}</p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.requestModel && (
                        <div>
                          <span className="text-xs text-sky-700/80">Request Model</span>
                          <p className="font-mono text-xs break-all">{selectedTaskApiDebugInfo.requestModel}</p>
                        </div>
                      )}
                      {selectedTaskApiDebugInfo.responseStatus !== undefined && (
                        <div>
                          <span className="text-xs text-sky-700/80">Response Status</span>
                          <p className="font-mono text-xs">{selectedTaskApiDebugInfo.responseStatus}</p>
                        </div>
                      )}
                    </div>
                    {selectedTaskApiDebugInfo.endpoint && (
                      <div>
                        <span className="text-xs text-sky-700/80">Endpoint</span>
                        <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                          {selectedTaskApiDebugInfo.endpoint}
                        </p>
                      </div>
                    )}
                    {selectedTaskApiDebugInfo.requestUrl && (
                      <div>
                        <span className="text-xs text-sky-700/80">Request URL</span>
                        <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">
                          {selectedTaskApiDebugInfo.requestUrl}
                        </p>
                      </div>
                    )}
                    {selectedTaskApiDebugInfo.requestText && (
                      <div>
                        <span className="text-xs text-sky-700/80">Request Text</span>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap break-words mt-1 bg-white p-2 rounded border">
                          {selectedTaskApiDebugInfo.requestText}
                        </p>
                      </div>
                    )}
                    {selectedTaskApiDebugInfo.responseMessage && (
                      <div>
                        <span className="text-xs text-sky-700/80">Response Message</span>
                        <p className="text-xs text-sky-700 break-words mt-1">{selectedTaskApiDebugInfo.responseMessage}</p>
                      </div>
                    )}
                    {selectedTaskApiDebugInfo.providerMessage && (
                      <div>
                        <span className="text-xs text-sky-700/80">Provider Message</span>
                        <p className="text-xs text-sky-700 break-words mt-1">{selectedTaskApiDebugInfo.providerMessage}</p>
                      </div>
                    )}
                    {selectedTaskApiDebugInfo.requestPayload !== undefined && (
                      <details className="rounded border bg-white p-2">
                        <summary className="cursor-pointer text-xs text-sky-700 select-none">
                          Request Payload Sent to Provider
                        </summary>
                        <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                          {JSON.stringify(selectedTaskApiDebugInfo.requestPayload, null, 2)}
                        </pre>
                      </details>
                    )}
                    {selectedTaskApiDebugInfo.responseBody && (
                      <details className="rounded border bg-white p-2">
                        <summary className="cursor-pointer text-xs text-sky-700 select-none">
                          Provider Raw Response Body
                        </summary>
                        <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                          {selectedTaskApiDebugInfo.responseBody}
                        </pre>
                      </details>
                    )}
                    {selectedTaskApiDebugInfo.responseJson !== undefined && (
                      <details className="rounded border bg-white p-2">
                        <summary className="cursor-pointer text-xs text-sky-700 select-none">
                          Provider Response JSON
                        </summary>
                        <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                          {JSON.stringify(selectedTaskApiDebugInfo.responseJson, null, 2)}
                        </pre>
                      </details>
                    )}
                    {selectedTaskApiDebugInfo.providerDetail !== undefined && (
                      <details className="rounded border bg-white p-2">
                        <summary className="cursor-pointer text-xs text-sky-700 select-none">
                          Provider Failure Detail
                        </summary>
                        <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                          {JSON.stringify(selectedTaskApiDebugInfo.providerDetail, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
                {(selectedTaskIsFailed || selectedTaskIsCancelled) && (() => {
                  const errorInfo = selectedTaskErrorInfo;
                  if (!errorInfo) return null;
                  return (
                    <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50/70 p-3">
                      <span className="text-sm font-medium text-red-700">Error Summary</span>
                      <p className="text-sm text-red-700 mt-1">{errorInfo.summary}</p>
                      {(errorInfo.codeHint || errorInfo.stateHint) && (
                        <p className="text-xs text-red-600 mt-1">
                          {errorInfo.codeHint ? `Code: ${errorInfo.codeHint}` : ''}
                          {errorInfo.codeHint && errorInfo.stateHint ? ' | ' : ''}
                          {errorInfo.stateHint ? `State: ${errorInfo.stateHint}` : ''}
                        </p>
                      )}
                      {errorInfo.details.length > 1 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-xs font-medium text-red-600">Details</span>
                          {errorInfo.details.slice(1).map((detail, index) => (
                            <p key={`${detail}-${index}`} className="text-xs text-red-600 break-words">
                              - {detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(selectedTaskIsFailed || selectedTaskIsCancelled) && selectedTask.resultData && (
                  <div className="sm:col-span-2">
                    <details className="rounded border bg-white p-2">
                      <summary className="cursor-pointer text-xs text-gray-600 select-none">
                        Technical Error Payload
                      </summary>
                      <pre className="text-[11px] text-gray-700 mt-2 overflow-auto max-h-56 whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedTask.resultData, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Created</span>
                  <p className="text-sm font-medium">
                    {new Date(selectedTask.createdAt).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(selectedTask.createdAt).relative}</p>
                </div>
                {selectedTask.completedAt && (() => {
                  const completedDate = safeParseDate(selectedTask.completedAt);
                  if (!completedDate) return null;
                  return (
                    <div>
                      <span className="text-sm text-gray-500">Completed</span>
                      <p className="text-sm font-medium">
                        {completedDate.toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(selectedTask.completedAt).relative}</p>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              {selectedTask.status === 'completed' && selectedTask.resultUrl && (
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
                    {copiedPromptTaskId === selectedTask.id ? 'Copied' : 'Copy Prompt'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleAddToLibrary(selectedTask)}
                    disabled={selectedTaskLibraryState?.action === 'adding'}
                    className="gap-2"
                  >
                    {selectedTaskLibraryState?.action === 'adding' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedTaskLibraryState?.action === 'added' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                    {selectedTaskLibraryState?.action === 'added' ? 'In Library' : 'Add to Library'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleOpenShare(selectedTask)}
                    disabled={!selectedTaskLibraryState?.itemId}
                    className="gap-2"
                    title={selectedTaskLibraryState?.itemId ? 'Share this library item' : 'Add to Library before sharing'}
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </Button>
                  {(selectedTask.mediaType === 'image' || selectedTask.mediaType === 'video') && (
                    <Button
                      variant="outline"
                      onClick={() => handleOpenFullscreenMedia(selectedTask)}
                      disabled={!selectedTask.resultUrl || expiredUrls.has(selectedTask.resultUrl)}
                      className="gap-2"
                    >
                      <Maximize2 className="w-4 h-4" />
                      Full
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(selectedTask.resultUrl!)}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  {/* Add to Gallery button - admin only */}
                  {user?.role === 'admin' && (
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
                      {importingTaskId === selectedTask.id ? 'Importing...' : 'Add to Gallery'}
                    </Button>
                  )}
                </div>
              )}
              {selectedTaskIsFailed && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleRetryTask(selectedTask)}
                    className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </Button>
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
