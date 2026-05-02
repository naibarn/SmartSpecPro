import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { SearchableCombobox } from "../presentation/SearchableCombobox";
import { ModelInputFieldsPanel } from "@/components/media/ModelInputFieldsPanel";
import { Switch } from "@/components/ui/switch";
import {
  applyModelSyncTargets,
  buildDefaultExtraParamsForModel,
  getMissingRequiredModelFields,
  isTextToImageModel,
  isTextToVideoModel,
  mergeExtraParams,
  parseModelInputFields,
  pickExtraParamsForModel,
  type MediaModelOption,
} from "@/lib/mediaModelInputs";

interface ReferenceImageItem {
  url: string;
  name: string;
}

export interface VideoDraftAIGenerateRequest {
  prompt: string;
  mediaType: "image" | "video";
  modelId?: string;
  aspectRatio: string;
  referenceImageUrls: string[];
  extraParams?: Record<string, unknown>;
}

export interface FocusedClipMeta {
  clipId: string;
  assetId: string;
  type: "image" | "video";
  title: string;
  url: string;
  thumbnailUrl: string;
  generationPrompt?: string;
  referenceUrls?: string[];
  generationModelId?: string;
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
  model?: string;
}

interface VideoDraftAIPanelProps {
  projectWidth: number;
  projectHeight: number;
  isGenerating: boolean;
  isPreparingPresentationDraft?: boolean;
  onGenerate: (request: VideoDraftAIGenerateRequest) => Promise<void>;
  onReplaceFocusedClip?: (request: VideoDraftAIGenerateRequest) => Promise<void>;
  onOpenPresentationDraft?: () => void;
  focusedClipMeta?: FocusedClipMeta | null;
}

const MAX_REFERENCE_IMAGES = 5;
const ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "2:3", "3:2"];

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const temp = x % y;
    x = y;
    y = temp;
  }
  return x || 1;
}

function toAspectRatio(width: number, height: number): string {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const divisor = gcd(safeWidth, safeHeight);
  return `${Math.round(safeWidth / divisor)}:${Math.round(safeHeight / divisor)}`;
}

function isValidReferenceUrl(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//i.test(value);
}

export const VideoDraftAIPanel: React.FC<VideoDraftAIPanelProps> = ({
  projectWidth,
  projectHeight,
  isGenerating,
  isPreparingPresentationDraft = false,
  onGenerate,
  onReplaceFocusedClip,
  onOpenPresentationDraft,
  focusedClipMeta,
}) => {
  const [mediaType, setMediaType] = useState<"image" | "video">("video");
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [aspectRatio, setAspectRatio] = useState(() => {
    const initial = toAspectRatio(projectWidth, projectHeight);
    return ASPECT_RATIOS.includes(initial) ? initial : "16:9";
  });
  const [advancedMediaOptionsEnabled, setAdvancedMediaOptionsEnabled] = useState(false);
  const [mediaModelExtraParams, setMediaModelExtraParams] = useState<Record<string, unknown>>({});
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [selectedReferenceLibraryUrl, setSelectedReferenceLibraryUrl] = useState("");
  const [referenceLibrarySearchQuery, setReferenceLibrarySearchQuery] = useState("");
  const [debouncedReferenceLibrarySearchQuery, setDebouncedReferenceLibrarySearchQuery] = useState("");
  const [referenceUrlInput, setReferenceUrlInput] = useState("");
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [referenceSource, setReferenceSource] = useState<"library" | "generated">("generated");

  const mediaModelsQuery = trpc.media.getModels.useQuery(
    { type: mediaType },
    { staleTime: 300_000 },
  );
  const mediaModels = (mediaModelsQuery.data?.models ?? []) as MediaModelOption[];
  const compatibleMediaModels = mediaType === "video"
    ? mediaModels.filter(isTextToVideoModel)
    : mediaModels.filter(isTextToImageModel);
  const displayedMediaModels = mediaType === "video"
    ? (compatibleMediaModels.length > 0 ? compatibleMediaModels : mediaModels)
    : compatibleMediaModels;
  const defaultMediaModelId = displayedMediaModels[0]?.id
    || (mediaType === "video"
      ? mediaModelsQuery.data?.defaults?.video
      : mediaModelsQuery.data?.defaults?.image)
    || "";
  const selectedMediaModelKey = selectedModelId.trim() || defaultMediaModelId;
  const selectedMediaModelConfig = mediaModels.find((model) => model.id === selectedMediaModelKey);
  const selectedMediaModelFields = useMemo(
    () => parseModelInputFields(selectedMediaModelConfig),
    [selectedMediaModelConfig],
  );

  const referenceLibraryListQuery = trpc.library.listDocuments.useQuery(
    {
      scope: "all",
      sort: "updated_desc",
      limit: 30,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: referenceSource === "library" && debouncedReferenceLibrarySearchQuery.length === 0,
    },
  );
  const referenceLibrarySearchResultQuery = trpc.library.search.useQuery(
    {
      query: debouncedReferenceLibrarySearchQuery || undefined,
      scope: "all",
      limit: 30,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: referenceSource === "library" && debouncedReferenceLibrarySearchQuery.length > 0,
    },
  );
  const mediaHistoryQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 50,
      daysAgo: 30,
    },
    {
      enabled: referenceSource === "generated",
      staleTime: 60_000,
    },
  );
  const uploadReferenceMutation = trpc.ai.upload.useMutation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedReferenceLibrarySearchQuery(referenceLibrarySearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [referenceLibrarySearchQuery]);

  useEffect(() => {
    setMediaModelExtraParams((prev) => {
      const scopedCurrent = pickExtraParamsForModel(selectedMediaModelConfig, prev);
      const next = mergeExtraParams(
        buildDefaultExtraParamsForModel(selectedMediaModelConfig),
        scopedCurrent,
      ) ?? {};
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (!Object.is(prev[key], next[key])) {
          return next;
        }
      }
      return prev;
    });
  }, [selectedMediaModelConfig?.id]);

  const referenceLibraryItems = useMemo(() => {
    const results = (
      debouncedReferenceLibrarySearchQuery.length > 0
        ? (referenceLibrarySearchResultQuery.data?.results ?? [])
        : (referenceLibraryListQuery.data?.results ?? [])
    ) as Array<{
      source_url?: string | null;
      thumbnail_url?: string | null;
      title?: string | null;
      metadata?: { extension?: string | null } | null;
    }>;
    return results.reduce<Array<{ value: string; label: string; description?: string; icon?: React.ReactNode }>>((acc, item) => {
      const url = String(item.source_url || "").trim();
      if (!url) {
        return acc;
      }
      const thumbUrl = String(item.thumbnail_url || item.source_url || "").trim();
      const extension = String(item.metadata?.extension || "").trim();
      acc.push({
        value: url,
        label: String(item.title || url.split("/").pop() || "Library image"),
        description: extension ? `.${extension}` : undefined,
        icon: thumbUrl ? (
          <span style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "#27272a", flexShrink: 0, overflow: "hidden" }}>
            <img
              src={thumbUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = "none";
                if (img.parentElement) {
                  img.parentElement.textContent = "\uD83D\uDDBC";
                  img.parentElement.style.fontSize = "16px";
                  img.parentElement.style.color = "#71717a";
                }
              }}
            />
          </span>
        ) : undefined,
      });
      return acc;
    }, []);
  }, [
    debouncedReferenceLibrarySearchQuery.length,
    referenceLibraryListQuery.data?.results,
    referenceLibrarySearchResultQuery.data?.results,
  ]);
  const referenceLibraryLoading = referenceLibraryListQuery.isLoading || referenceLibrarySearchResultQuery.isLoading;

  const mediaHistoryItems = useMemo(() => {
    const tasks = (mediaHistoryQuery.data?.tasks ?? []) as Array<{
      id?: string;
      resultUrl?: string;
      prompt?: string;
      model?: string;
      mediaType?: string;
      createdAt?: string;
    }>;
    return tasks.reduce<Array<{ value: string; label: string; description?: string; icon?: React.ReactNode }>>((acc, task) => {
      const url = String(task.resultUrl || "").trim();
      if (!url) return acc;
      const promptLabel = task.prompt
        ? (task.prompt.length > 50 ? `${task.prompt.slice(0, 50)}...` : task.prompt)
        : "Generated image";
      const modelLabel = task.model || "";
      acc.push({
        value: url,
        label: promptLabel,
        description: modelLabel
          ? `${modelLabel}${task.createdAt ? ` \u2022 ${new Date(task.createdAt).toLocaleDateString()}` : ""}`
          : undefined,
        icon: (
          <span style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "#27272a", flexShrink: 0, overflow: "hidden" }}>
            <img
              src={url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = "none";
                if (img.parentElement) {
                  img.parentElement.textContent = "\uD83D\uDDBC";
                  img.parentElement.style.fontSize = "16px";
                  img.parentElement.style.color = "#71717a";
                }
              }}
            />
          </span>
        ),
      });
      return acc;
    }, []);
  }, [mediaHistoryQuery.data?.tasks]);

  const activeReferenceItems = referenceSource === "generated" ? mediaHistoryItems : referenceLibraryItems;

  const modelItems = useMemo(() => {
    const defaultLabel = defaultMediaModelId ? `Default (${defaultMediaModelId})` : "Default model";
    return [
      { value: "", label: defaultLabel },
      ...displayedMediaModels.map((model) => ({
        value: model.id,
        label: model.name,
        description: model.provider || model.id,
      })),
    ];
  }, [defaultMediaModelId, displayedMediaModels]);

  const normalizedReferenceImageUrls = useMemo(
    () => {
      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of referenceImages) {
        const url = String(item.url || "").trim();
        if (!url || seen.has(url) || (!url.startsWith("/") && !/^https?:\/\//i.test(url))) {
          continue;
        }
        seen.add(url);
        deduped.push(url);
        if (deduped.length >= MAX_REFERENCE_IMAGES) {
          break;
        }
      }
      return deduped;
    },
    [referenceImages],
  );

  const syncedAdvancedExtraParams = useMemo(() => {
    const base = mergeExtraParams(
      buildDefaultExtraParamsForModel(selectedMediaModelConfig),
      advancedMediaOptionsEnabled
        ? pickExtraParamsForModel(selectedMediaModelConfig, mediaModelExtraParams)
        : undefined,
    );
    return applyModelSyncTargets(selectedMediaModelConfig, base, {
      prompt: prompt.trim(),
      aspectRatio,
      referenceImageUrls: normalizedReferenceImageUrls,
    });
  }, [
    selectedMediaModelConfig,
    advancedMediaOptionsEnabled,
    mediaModelExtraParams,
    prompt,
    aspectRatio,
    normalizedReferenceImageUrls,
  ]);

  const updateMediaModelExtraParam = useCallback((key: string, value: unknown) => {
    setMediaModelExtraParams((prev) => {
      const next: Record<string, unknown> = { ...prev };
      if (
        value === undefined
        || value === null
        || value === ""
        || (Array.isArray(value) && value.length === 0)
      ) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const handleAddReferenceFromLibrary = useCallback((url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      return;
    }
    setReferenceImages((prev) => {
      if (prev.some((item) => item.url === normalizedUrl)) {
        toast.info("This reference image is already added.");
        return prev;
      }
      if (prev.length >= MAX_REFERENCE_IMAGES) {
        toast.error("Maximum 5 reference images");
        return prev;
      }
      const libraryItem = referenceLibraryItems.find((item) => item.value === normalizedUrl);
      return [...prev, {
        url: normalizedUrl,
        name: libraryItem?.label || `Reference ${prev.length + 1}`,
      }];
    });
    setSelectedReferenceLibraryUrl("");
  }, [referenceLibraryItems]);

  const handleAddReferenceUrl = useCallback(() => {
    const url = referenceUrlInput.trim();
    if (!url) {
      return;
    }
    if (!isValidReferenceUrl(url)) {
      toast.error("Reference URL must start with / or http(s)://");
      return;
    }
    setReferenceImages((prev) => {
      if (prev.some((item) => item.url === url)) {
        toast.info("This reference image is already added.");
        return prev;
      }
      if (prev.length >= MAX_REFERENCE_IMAGES) {
        toast.error("Maximum 5 reference images");
        return prev;
      }
      return [...prev, { url, name: `Reference ${prev.length + 1}` }];
    });
    setReferenceUrlInput("");
  }, [referenceUrlInput]);

  const handleRemoveReferenceImage = useCallback((url: string) => {
    setReferenceImages((prev) => prev.filter((item) => item.url !== url));
  }, []);

  const handleReferenceFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }
      const remainingSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);
      if (remainingSlots === 0) {
        toast.error("Maximum 5 reference images");
        event.target.value = "";
        return;
      }

      const filesToUpload = Array.from(files).slice(0, remainingSlots);
      const nextImages: ReferenceImageItem[] = [];
      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          continue;
        }
        try {
          const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });
          const result = await uploadReferenceMutation.mutateAsync({
            fileName: file.name,
            fileType: file.type,
            fileBase64,
          });
          nextImages.push({ url: result.url, name: file.name });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Upload failed (${file.name}): ${error.message}`
              : `Upload failed (${file.name})`,
          );
        }
      }

      if (nextImages.length > 0) {
        setReferenceImages((prev) => {
          const deduped = [...prev];
          for (const img of nextImages) {
            if (
              !deduped.some((existing) => existing.url === img.url)
              && deduped.length < MAX_REFERENCE_IMAGES
            ) {
              deduped.push(img);
            }
          }
          return deduped;
        });
      }

      event.target.value = "";
    },
    [referenceImages.length, uploadReferenceMutation],
  );

  const buildCurrentGenerateRequest = useCallback((): VideoDraftAIGenerateRequest | null => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error("Please enter prompt.");
      return null;
    }

    if (advancedMediaOptionsEnabled) {
      const missingRequiredFields = getMissingRequiredModelFields(selectedMediaModelFields, {
        extraParams: syncedAdvancedExtraParams,
        prompt: normalizedPrompt,
        aspectRatio,
        referenceImageUrls: normalizedReferenceImageUrls,
      });
      if (missingRequiredFields.length > 0) {
        toast.error(`Please fill required model inputs: ${missingRequiredFields.join(", ")}`);
        return null;
      }
    }

    return {
      prompt: normalizedPrompt,
      mediaType,
      modelId: selectedModelId.trim() || undefined,
      aspectRatio,
      referenceImageUrls: normalizedReferenceImageUrls,
      extraParams: advancedMediaOptionsEnabled ? syncedAdvancedExtraParams : undefined,
    };
  }, [
    prompt,
    advancedMediaOptionsEnabled,
    selectedMediaModelFields,
    syncedAdvancedExtraParams,
    aspectRatio,
    normalizedReferenceImageUrls,
    mediaType,
    selectedModelId,
  ]);

  const buildFocusedClipGenerateRequest = useCallback((): VideoDraftAIGenerateRequest | null => {
    if (!focusedClipMeta?.generationPrompt?.trim()) {
      toast.error("Selected clip does not have a stored prompt.");
      return null;
    }

    const clipAspectRatio = focusedClipMeta.generationAspectRatio?.trim();
    const safeAspectRatio = clipAspectRatio && ASPECT_RATIOS.includes(clipAspectRatio)
      ? clipAspectRatio
      : aspectRatio;
    const referenceImageUrls = (focusedClipMeta.referenceUrls ?? [])
      .filter(isValidReferenceUrl)
      .slice(0, MAX_REFERENCE_IMAGES);

    return {
      prompt: focusedClipMeta.generationPrompt.trim(),
      mediaType: focusedClipMeta.type === "video" ? "video" : "image",
      modelId: focusedClipMeta.generationModelId || focusedClipMeta.model || undefined,
      aspectRatio: safeAspectRatio,
      referenceImageUrls,
      extraParams: focusedClipMeta.generationExtraParams,
    };
  }, [aspectRatio, focusedClipMeta]);

  const handleGenerate = useCallback(async () => {
    const request = buildCurrentGenerateRequest();
    if (!request) return;
    await onGenerate(request);
  }, [buildCurrentGenerateRequest, onGenerate]);

  const handleReplaceFocusedClip = useCallback(async () => {
    if (!onReplaceFocusedClip) return;
    const request = buildCurrentGenerateRequest();
    if (!request) return;
    await onReplaceFocusedClip(request);
  }, [buildCurrentGenerateRequest, onReplaceFocusedClip]);

  const handleReplaceFocusedClipFromStored = useCallback(async () => {
    if (!onReplaceFocusedClip) return;
    const request = buildFocusedClipGenerateRequest();
    if (!request) return;
    await onReplaceFocusedClip(request);
  }, [buildFocusedClipGenerateRequest, onReplaceFocusedClip]);

  const handleReuseFromClip = useCallback(() => {
    if (!focusedClipMeta) return;
    // Always reset all form fields — clear stale state from previous clip
    setPrompt(focusedClipMeta.generationPrompt || "");
    setMediaType(focusedClipMeta.type === "video" ? "video" : "image");
    setSelectedModelId(focusedClipMeta.generationModelId || focusedClipMeta.model || "");
    const clipAspectRatio = focusedClipMeta.generationAspectRatio?.trim();
    if (clipAspectRatio && ASPECT_RATIOS.includes(clipAspectRatio)) {
      setAspectRatio(clipAspectRatio);
    }
    setReferenceImages(
      focusedClipMeta.referenceUrls && focusedClipMeta.referenceUrls.length > 0
        ? focusedClipMeta.referenceUrls
            .filter(isValidReferenceUrl)
            .slice(0, MAX_REFERENCE_IMAGES)
            .map((url, i) => ({ url, name: `Reference ${i + 1}` }))
        : [],
    );
    const clipExtraParams = focusedClipMeta.generationExtraParams ?? {};
    setAdvancedMediaOptionsEnabled(Object.keys(clipExtraParams).length > 0);
    setMediaModelExtraParams({ ...clipExtraParams });
    toast.success("Loaded prompt and settings from selected clip.");
  }, [focusedClipMeta]);

  return (
    <div className="space-y-3 p-3">
      <style>{panelStyles}</style>
      <div className="section-title">Draft with AI</div>

      {/* Focused Clip Prompt Section */}
      {focusedClipMeta && (focusedClipMeta.generationPrompt || (focusedClipMeta.referenceUrls && focusedClipMeta.referenceUrls.length > 0)) && (
        <div className="rounded-lg border border-indigo-700/50 bg-indigo-950/40 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-300">
            Selected Clip Prompt
          </div>
          <div className="mb-2 flex items-start gap-2">
            {focusedClipMeta.thumbnailUrl && (
              <img
                src={focusedClipMeta.thumbnailUrl}
                alt=""
                style={{
                  width: 56,
                  height: 40,
                  objectFit: "cover",
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-xs font-medium text-white" style={{ marginBottom: 2 }}>
                {focusedClipMeta.title}
              </div>
              <div className="text-xs text-slate-400">
                {focusedClipMeta.type === "video" ? "Video" : "Image"}
                {focusedClipMeta.model ? ` \u2022 ${focusedClipMeta.model}` : ""}
              </div>
            </div>
          </div>
          {focusedClipMeta.generationPrompt && (
            <div style={{ position: "relative", marginBottom: 6 }}>
              <div
                className="text-xs text-slate-200"
                style={{
                  background: "#1e1b4b",
                  borderRadius: 6,
                  padding: "6px 28px 6px 8px",
                  maxHeight: 80,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {focusedClipMeta.generationPrompt}
              </div>
              <button
                type="button"
                title="Copy prompt"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "rgba(99,102,241,0.3)",
                  border: "none",
                  borderRadius: 4,
                  color: "#c7d2fe",
                  cursor: "pointer",
                  padding: "2px 4px",
                  fontSize: 11,
                  lineHeight: 1,
                }}
                onClick={() => {
                  void navigator.clipboard.writeText(focusedClipMeta.generationPrompt || "");
                  toast.success("Prompt copied to clipboard");
                }}
              >
                &#x2398;
              </button>
            </div>
          )}
          {focusedClipMeta.referenceUrls && focusedClipMeta.referenceUrls.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div className="text-xs text-indigo-300" style={{ marginBottom: 4 }}>
                Reference Images ({focusedClipMeta.referenceUrls.length})
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {focusedClipMeta.referenceUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Ref ${i + 1}`}
                    style={{
                      width: 44,
                      height: 32,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid #4338ca",
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className="generate-button"
              style={{ fontSize: 12, padding: "6px 12px", flex: "1 1 120px" }}
              onClick={handleReuseFromClip}
              disabled={isGenerating}
            >
              Load into form
            </button>
            {onReplaceFocusedClip && focusedClipMeta.generationPrompt && (
              <button
                type="button"
                className="generate-button replace-button"
                style={{ fontSize: 12, padding: "6px 12px", flex: "1 1 160px" }}
                onClick={handleReplaceFocusedClipFromStored}
                disabled={isGenerating}
              >
                Regenerate & replace
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500" style={{ marginTop: 4 }}>
            Loads prompt, model, and references into the form below for editing and regeneration.
          </div>
        </div>
      )}

      {onOpenPresentationDraft && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
          <div className="mb-1 text-sm font-semibold text-white">
            Presentation-style AI Draft
          </div>
          <p className="mb-3 text-xs text-slate-300">
            Re-use the same Draft with AI flow from Presentation Edit, then place
            the generated image, video, and audio into the video timeline.
          </p>
          <button
            type="button"
            className="generate-button"
            onClick={onOpenPresentationDraft}
            disabled={isPreparingPresentationDraft || isGenerating}
          >
            {isPreparingPresentationDraft ? "Preparing..." : "Open Draft with AI"}
          </button>
        </div>
      )}

      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Quick Generate
      </div>

      <div className="control-group">
        <label className="control-label">Generate Type</label>
        <div className="type-selector">
          <button
            className={`type-button ${mediaType === "image" ? "active" : ""}`}
            onClick={() => {
              setMediaType("image");
              setSelectedModelId("");
              setAdvancedMediaOptionsEnabled(false);
              setMediaModelExtraParams({});
            }}
            type="button"
          >
            Image
          </button>
          <button
            className={`type-button ${mediaType === "video" ? "active" : ""}`}
            onClick={() => {
              setMediaType("video");
              setSelectedModelId("");
              setAdvancedMediaOptionsEnabled(false);
              setMediaModelExtraParams({});
            }}
            type="button"
          >
            Video
          </button>
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">Prompt</label>
        <textarea
          className="generate-input"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={`Describe ${mediaType} that you want to generate...`}
          rows={4}
          disabled={isGenerating}
        />
      </div>

      <div className="control-group">
        <label className="control-label">Model</label>
        <SearchableCombobox
          items={modelItems}
          value={selectedModelId}
          onValueChange={setSelectedModelId}
          placeholder="Select model..."
          searchPlaceholder="Search models..."
          emptyMessage="No models found."
          disabled={isGenerating}
        />
      </div>

      <div className="control-group">
        <label className="control-label">Aspect Ratio</label>
        <select
          className="control-select"
          value={aspectRatio}
          onChange={(event) => setAspectRatio(event.target.value)}
          disabled={isGenerating}
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <label className="control-label">Reference Images</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid",
              borderColor: referenceSource === "generated" ? "#3b82f6" : "#3f3f46",
              background: referenceSource === "generated" ? "#1e3a5f" : "transparent",
              color: referenceSource === "generated" ? "#93c5fd" : "#a1a1aa",
              cursor: "pointer",
            }}
            onClick={() => setReferenceSource("generated")}
          >
            Generated
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid",
              borderColor: referenceSource === "library" ? "#3b82f6" : "#3f3f46",
              background: referenceSource === "library" ? "#1e3a5f" : "transparent",
              color: referenceSource === "library" ? "#93c5fd" : "#a1a1aa",
              cursor: "pointer",
            }}
            onClick={() => setReferenceSource("library")}
          >
            Library
          </button>
        </div>
        <SearchableCombobox
          items={activeReferenceItems}
          value={selectedReferenceLibraryUrl}
          onValueChange={(value) => {
            setSelectedReferenceLibraryUrl(value);
            handleAddReferenceFromLibrary(value);
          }}
          placeholder={referenceSource === "generated" ? "Select from generated images..." : "Search image from Library..."}
          searchPlaceholder={referenceSource === "generated" ? "Search by prompt..." : "Search library images..."}
          emptyMessage={
            referenceSource === "generated"
              ? (mediaHistoryQuery.isLoading ? "Loading generated images..." : "No generated images found.")
              : (referenceLibraryLoading ? "Loading library..." : "No images found.")
          }
          disabled={referenceImages.length >= MAX_REFERENCE_IMAGES || isGenerating}
          searchValue={referenceLibrarySearchQuery}
          onSearchValueChange={setReferenceLibrarySearchQuery}
        />
        <div className="reference-actions">
          <input
            ref={referenceFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden-file-input"
            onChange={handleReferenceFileUpload}
          />
          <button
            type="button"
            className="generate-button"
            onClick={() => referenceFileInputRef.current?.click()}
            disabled={uploadReferenceMutation.isPending || referenceImages.length >= MAX_REFERENCE_IMAGES || isGenerating}
          >
            {uploadReferenceMutation.isPending ? "Uploading..." : "Upload Image"}
          </button>
          <div className="reference-url-row">
            <input
              className="control-input"
              value={referenceUrlInput}
              placeholder="https://... or /uploads/..."
              onChange={(event) => setReferenceUrlInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddReferenceUrl();
                }
              }}
              disabled={isGenerating}
            />
            <button
              type="button"
              className="generate-button"
              onClick={handleAddReferenceUrl}
              disabled={!referenceUrlInput.trim() || referenceImages.length >= MAX_REFERENCE_IMAGES || isGenerating}
            >
              Add URL
            </button>
          </div>
        </div>
        {referenceImages.length > 0 && (
          <div className="reference-list">
            {referenceImages.map((item) => (
              <div key={item.url} className="reference-item">
                <img src={item.url} alt={item.name} className="reference-thumb" />
                <div className="reference-meta">
                  <span className="reference-name">{item.name}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleRemoveReferenceImage(item.url)}
                    disabled={isGenerating}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="control-group">
        <div className="advanced-toggle-row">
          <label className="control-label">Advanced Media Options</label>
          <Switch
            checked={advancedMediaOptionsEnabled}
            onCheckedChange={setAdvancedMediaOptionsEnabled}
            disabled={isGenerating}
          />
        </div>
        <p className="control-hint">
          Enable to edit model-specific dynamic inputs manually. Off = simple default flow.
        </p>
        <ModelInputFieldsPanel
          enabled={advancedMediaOptionsEnabled}
          model={selectedMediaModelConfig}
          fields={selectedMediaModelFields}
          extraParams={mediaModelExtraParams}
          onChange={updateMediaModelExtraParam}
          promptPreview={prompt}
          aspectRatioPreview={aspectRatio}
          referenceImageUrls={normalizedReferenceImageUrls}
          titlePrefix="Model Inputs"
          ariaLabelPrefix="Advanced"
          variant="dark"
        />
      </div>

      <button
        className="generate-button"
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        type="button"
      >
        {isGenerating ? "Generating..." : `Generate ${mediaType === "image" ? "Image" : "Video"} to Timeline`}
      </button>
      {focusedClipMeta && onReplaceFocusedClip && (
        <button
          className="generate-button replace-button"
          onClick={handleReplaceFocusedClip}
          disabled={isGenerating || !prompt.trim()}
          type="button"
        >
          Generate & replace selected clip
        </button>
      )}
    </div>
  );
};

const panelStyles = `
  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .generate-button {
    border: 1px solid #3f3f46;
    border-radius: 8px;
    background: #2563eb;
    color: #ffffff;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s ease;
  }
  .generate-button:hover:not(:disabled) {
    background: #1d4ed8;
  }
  .replace-button {
    background: #0f766e;
  }
  .replace-button:hover:not(:disabled) {
    background: #0d9488;
  }
  .generate-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .control-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .control-select,
  .control-input,
  .generate-input {
    width: 100%;
    border: 1px solid #3f3f46;
    background: #18181b;
    color: #f4f4f5;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }
  .generate-input {
    resize: vertical;
    min-height: 84px;
  }
  .control-select:focus,
  .control-input:focus,
  .generate-input:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 1px #60a5fa;
  }
  .type-selector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .type-button {
    border: 1px solid #3f3f46;
    border-radius: 8px;
    background: #18181b;
    color: #d4d4d8;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 13px;
  }
  .type-button.active {
    border-color: #60a5fa;
    background: #1d4ed8;
    color: white;
  }
  .reference-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .reference-url-row {
    display: flex;
    gap: 8px;
  }
  .reference-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .reference-item {
    display: flex;
    gap: 8px;
    align-items: center;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    padding: 6px;
    background: #18181b;
  }
  .reference-thumb {
    width: 56px;
    height: 40px;
    object-fit: cover;
    border-radius: 6px;
  }
  .reference-meta {
    min-width: 0;
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .reference-name {
    font-size: 12px;
    color: #e4e4e7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-button {
    background: transparent;
    border: none;
    color: #93c5fd;
    font-size: 12px;
    cursor: pointer;
  }
  .hidden-file-input {
    display: none;
  }
  .advanced-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .control-hint {
    margin: 0;
    font-size: 11px;
    color: #a1a1aa;
  }
`;
