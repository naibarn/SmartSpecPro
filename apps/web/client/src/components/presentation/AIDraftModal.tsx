import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import {
  AI_STYLE_PRESET_IDS,
  MAX_AI_DRAFT_SLIDES,
} from "@shared/presentation/aiTypes";
import { SearchableCombobox } from "./SearchableCombobox";
import { ImageModelCombobox } from "./ImageModelCombobox";
import DynamicSkillForm from "@/components/media/DynamicSkillForm";
import type { SkillInputSchema } from "@/components/media/DynamicSkillForm";
import {
  inferWatermarkFormatFromSourceUrl,
  normalizeWatermarkLibraryOptions,
  type LibraryWatermarkOption,
} from "@/lib/presentationWatermark";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Upload,
  Plus,
  Trash2,
  Settings2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: number;
  expectedVersion: number;
  currentSlideCount: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface ReferenceImageItem {
  url: string;
  name: string;
}

export function AIDraftModal({
  isOpen,
  onClose,
  deckId,
  expectedVersion,
  currentSlideCount,
  canvasWidth,
  canvasHeight,
}: AIDraftModalProps) {
  // Config state
  const [topic, setTopic] = useState("");
  const [numSlides, setNumSlides] = useState(5);
  const [language, setLanguage] = useState("auto");
  const [selectedArticleSkill, setSelectedArticleSkill] = useState("");
  const [selectedImageSkill, setSelectedImageSkill] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imagePromptContext, setImagePromptContext] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [referenceUrlInput, setReferenceUrlInput] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("dark-professional");
  const [headerTitleText, setHeaderTitleText] = useState("");
  const [footerText, setFooterText] = useState("");
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic skill form params
  const [articleSkillParams, setArticleSkillParams] = useState<Record<string, any>>({});

  // Advanced style options default to OFF for this modal
  const [headerEnabled, setHeaderEnabled] = useState(false);
  const [showDeckTitle, setShowDeckTitle] = useState(false);
  const [footerEnabled, setFooterEnabled] = useState(false);
  const [showPageNumber, setShowPageNumber] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkSourceUrl, setWatermarkSourceUrl] = useState("");
  const [watermarkClarityPercent, setWatermarkClarityPercent] = useState(20);
  const [watermarkSearchQuery, setWatermarkSearchQuery] = useState("");
  const [debouncedWatermarkSearchQuery, setDebouncedWatermarkSearchQuery] = useState("");
  const [watermarkSelectionCache, setWatermarkSelectionCache] = useState<LibraryWatermarkOption | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Progress state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [stalledSeconds, setStalledSeconds] = useState(0);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastProgressMarkerRef = useRef<string>("");

  const utils = trpc.useUtils();

  // Fetch skills
  const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  const skills = skillsQuery.data?.skills ?? [];
  const watermarkLibraryQuery = trpc.library.listDocuments.useQuery(
    {
      query: debouncedWatermarkSearchQuery || undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 50,
      offset: 0,
      filters: {
        itemType: "image",
      },
    },
    {
      enabled: isOpen,
    },
  );

  // Fetch skill input schema for dynamic form
  const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedArticleSkill },
    { enabled: selectedArticleSkill !== "", staleTime: 300_000 },
  );
  const skillSchema = skillSchemaQuery.data?.hasSchema
    ? (skillSchemaQuery.data.schema as SkillInputSchema)
    : null;
  const hasArticleWordCountOverrideHint = useMemo(() => {
    if (!skillSchema?.sections) {
      return false;
    }
    const fieldIds = new Set(
      skillSchema.sections.flatMap((section) =>
        section.fields.map((field) => String(field.id || "").trim()),
      ),
    );
    const hasLengthField = fieldIds.has("length");
    const hasWordCountField = (
      fieldIds.has("word_count")
      || fieldIds.has("wordCount")
      || fieldIds.has("max_words")
      || fieldIds.has("maxWords")
    );
    return hasLengthField && hasWordCountField;
  }, [skillSchema]);

  // Restore saved selections from localStorage when skills load
  useEffect(() => {
    if (skills.length === 0) return;
    const savedArticle = localStorage.getItem("smartspec_aiDraft_articleSkill");
    if (
      savedArticle &&
      !selectedArticleSkill &&
      skills.some(
        (s: { slug: string; executionMode?: string }) =>
          s.slug === savedArticle && s.executionMode !== "media-generate",
      )
    ) {
      setSelectedArticleSkill(savedArticle);
    }
    const savedImage = localStorage.getItem("smartspec_aiDraft_imageSkill");
    if (
      savedImage &&
      !selectedImageSkill &&
      (savedImage === "__none__" ||
        skills.some((s: { slug: string }) => s.slug === savedImage))
    ) {
      setSelectedImageSkill(savedImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.length]);

  // Restore saved image model from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem("smartspec_aiDraft_imageModel");
    if (savedModel && !imageModel) {
      setImageModel(savedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const savedContext = localStorage.getItem("smartspec_aiDraft_imagePromptContext");
    if (savedContext && !imagePromptContext) {
      setImagePromptContext(savedContext);
    }
    const savedRefs = localStorage.getItem("smartspec_aiDraft_referenceImages");
    if (savedRefs && referenceImages.length === 0) {
      try {
        const parsed = JSON.parse(savedRefs);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item) => item && typeof item.url === "string" && typeof item.name === "string")
            .slice(0, 5);
          if (normalized.length > 0) {
            setReferenceImages(normalized);
          }
        }
      } catch {
        // ignore corrupted localStorage payload
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize skill lists for comboboxes
  const articleSkillItems = useMemo(
    () =>
      skills
        .filter(
          (s: { executionMode?: string }) =>
            s.executionMode !== "media-generate",
        )
        .map((s: { slug: string; name: string; description?: string }) => ({
          value: s.slug,
          label: s.name,
          description: s.description,
        })),
    [skills],
  );

  const imageSkillItems = useMemo(
    () => [
      { value: "__none__", label: "None" },
      ...skills
        .filter(
          (s: { executionMode?: string }) =>
            s.executionMode === "media-generate",
        )
        .map((s: { slug: string; name: string; description?: string }) => ({
          value: s.slug,
          label: s.name,
          description: s.description,
        })),
    ],
    [skills],
  );

  // Derive media type from selected image skill category
  const selectedMediaSkill = useMemo(
    () =>
      selectedImageSkill && selectedImageSkill !== "__none__"
        ? skills.find(
            (s: { slug: string }) => s.slug === selectedImageSkill,
          )
        : null,
    [skills, selectedImageSkill],
  );
  const mediaModelType: "image" | "video" =
    (selectedMediaSkill as { category?: string } | null)?.category === "video_generation"
      ? "video"
      : "image";
  const watermarkOptions = useMemo(
    () => normalizeWatermarkLibraryOptions(watermarkLibraryQuery.data?.results),
    [watermarkLibraryQuery.data?.results],
  );
  const selectedWatermarkOption = useMemo(
    () => {
      const sourceUrl = watermarkSourceUrl.trim();
      if (!sourceUrl) {
        return null;
      }
      const fromList = watermarkOptions.find((option) => option.sourceUrl === sourceUrl);
      if (fromList) {
        return fromList;
      }
      if (watermarkSelectionCache?.sourceUrl === sourceUrl) {
        return watermarkSelectionCache;
      }
      const inferredFormat = inferWatermarkFormatFromSourceUrl(sourceUrl);
      if (!inferredFormat) {
        return null;
      }
      return {
        id: -1,
        label: sourceUrl.split("/").pop() || "Selected watermark",
        sourceUrl,
        thumbnailUrl: sourceUrl,
        format: inferredFormat,
      } satisfies LibraryWatermarkOption;
    },
    [watermarkOptions, watermarkSourceUrl, watermarkSelectionCache],
  );
  const watermarkComboboxItems = useMemo(
    () => watermarkOptions.map((option) => ({
      value: option.sourceUrl,
      label: option.label,
      description: `.${option.format}`,
    })),
    [watermarkOptions],
  );

  const handleWatermarkSourceChange = useCallback((sourceUrl: string) => {
    setWatermarkSourceUrl(sourceUrl);
    const selected = watermarkOptions.find((option) => option.sourceUrl === sourceUrl) || null;
    if (selected) {
      setWatermarkSelectionCache(selected);
    }
  }, [watermarkOptions]);

  // Mutations
  const generateDraft = trpc.presentation.ai.generateDraft.useMutation();
  const cancelDraft = trpc.presentation.ai.cancelDraft.useMutation();
  const uploadReferenceMutation = trpc.ai.upload.useMutation();

  // Polling progress
  const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
    { taskId: taskId! },
    {
      enabled: isOpen && taskId !== null && !completed,
      refetchInterval: 2000,
    },
  );
  const progress = progressQuery.data;

  // Track completion
  useEffect(() => {
    if (progress?.completed && !completed) {
      setCompleted(true);
    }
  }, [progress?.completed, completed]);

  useEffect(() => {
    if (!isOpen || !taskId) {
      lastProgressAtRef.current = Date.now();
      lastProgressMarkerRef.current = "";
      setStalledSeconds(0);
      return;
    }

    const marker = progress
      ? `${progress.phase}|${progress.phaseLabel}|${progress.slidesCompleted}|${progress.totalSlides}|${progress.completed ? 1 : 0}|${progress.error?.code ?? ""}`
      : "pending";

    if (marker !== lastProgressMarkerRef.current) {
      lastProgressMarkerRef.current = marker;
      lastProgressAtRef.current = Date.now();
      setStalledSeconds(0);
    }
  }, [
    isOpen,
    taskId,
    progress?.phase,
    progress?.phaseLabel,
    progress?.slidesCompleted,
    progress?.totalSlides,
    progress?.completed,
    progress?.error?.code,
  ]);

  useEffect(() => {
    if (!isOpen || !taskId || completed) {
      setStalledSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastProgressAtRef.current) / 1000);
      setStalledSeconds(elapsed);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, taskId, completed]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    setTaskId(null);
    setCompleted(false);
    setStalledSeconds(0);
    lastProgressAtRef.current = Date.now();
    lastProgressMarkerRef.current = "";
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedWatermarkSearchQuery(watermarkSearchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [watermarkSearchQuery]);

  // Reset advanced options to modal defaults on each open
  useEffect(() => {
    if (!isOpen) return;
    setHeaderEnabled(false);
    setShowDeckTitle(false);
    setFooterEnabled(false);
    setShowPageNumber(false);
    setWatermarkEnabled(false);
    setWatermarkClarityPercent(20);
    setWatermarkSearchQuery("");
    setDebouncedWatermarkSearchQuery("");
  }, [isOpen]);

  useEffect(() => {
    if (!watermarkEnabled || watermarkSourceUrl) {
      return;
    }
    const first = watermarkOptions[0];
    if (!first) {
      return;
    }
    setWatermarkSourceUrl(first.sourceUrl);
    setWatermarkSelectionCache(first);
  }, [watermarkEnabled, watermarkSourceUrl, watermarkOptions]);

  const selectedPreset = getBuiltInPreset(selectedPresetId);

  const canGenerate =
    topic.length >= 3 &&
    selectedArticleSkill !== "" &&
    (!watermarkEnabled || selectedWatermarkOption !== null) &&
    !generateDraft.isPending;

  const isValidReferenceUrl = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed);
  }, []);

  const persistReferenceImages = useCallback((images: ReferenceImageItem[]) => {
    if (images.length === 0) {
      localStorage.removeItem("smartspec_aiDraft_referenceImages");
      return;
    }
    localStorage.setItem("smartspec_aiDraft_referenceImages", JSON.stringify(images.slice(0, 5)));
  }, []);

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
      if (prev.length >= 5) {
        toast.error("Maximum 5 reference images");
        return prev;
      }
      const next = [...prev, { url, name: `Reference ${prev.length + 1}` }];
      persistReferenceImages(next);
      return next;
    });
    setReferenceUrlInput("");
  }, [referenceUrlInput, isValidReferenceUrl, persistReferenceImages]);

  const handleRemoveReferenceImage = useCallback((url: string) => {
    setReferenceImages((prev) => {
      const next = prev.filter((item) => item.url !== url);
      persistReferenceImages(next);
      return next;
    });
  }, [persistReferenceImages]);

  const handleReferenceFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const remainingSlots = Math.max(0, 5 - referenceImages.length);
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
            if (!deduped.some((existing) => existing.url === img.url) && deduped.length < 5) {
              deduped.push(img);
            }
          }
          persistReferenceImages(deduped);
          return deduped;
        });
      }

      event.target.value = "";
    },
    [referenceImages.length, uploadReferenceMutation, persistReferenceImages],
  );

  const handleGenerate = useCallback(() => {
    // Always send explicit advanced style options from modal state
    const overrides = {
      headerEnabled,
      showDeckTitle,
      footerEnabled,
      showPageNumber,
    };

    generateDraft.mutate(
      {
        deckId,
        expectedVersion,
        prompt: topic,
        numSlides,
        language: language as "auto" | "en" | "th",
        articleSkillId: selectedArticleSkill,
        imageSkillId:
          selectedImageSkill && selectedImageSkill !== "__none__"
            ? selectedImageSkill
            : undefined,
        imageModel: imageModel || undefined,
        canvasWidth,
        canvasHeight,
        imagePromptContext: imagePromptContext.trim() || undefined,
        referenceImageUrls:
          referenceImages.length > 0
            ? referenceImages.map((img) => img.url)
            : undefined,
        stylePresetId: selectedPresetId as (typeof AI_STYLE_PRESET_IDS)[number],
        headerCustomText: headerTitleText.trim() || undefined,
        footerCustomText: footerText || undefined,
        styleOverrides: overrides,
        watermark:
          watermarkEnabled && selectedWatermarkOption
            ? {
              sourceUrl: selectedWatermarkOption.sourceUrl,
              format: selectedWatermarkOption.format,
              clarityPercent: watermarkClarityPercent,
            }
            : undefined,
        articleSkillParams:
          Object.keys(articleSkillParams).length > 0
            ? articleSkillParams
            : undefined,
      },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
          setCompleted(false);
          if (data.alreadyInProgress) {
            toast.info("Resuming your existing AI draft job");
          }
        },
        onError: (err) => {
          toast.error(err.message || "Failed to start generation");
        },
      },
    );
  }, [
    generateDraft,
    deckId,
    expectedVersion,
    topic,
    numSlides,
    language,
    selectedArticleSkill,
    selectedImageSkill,
    imageModel,
    canvasWidth,
    canvasHeight,
    imagePromptContext,
    referenceImages,
    selectedPresetId,
    headerTitleText,
    footerText,
    headerEnabled,
    showDeckTitle,
    footerEnabled,
    showPageNumber,
    watermarkEnabled,
    selectedWatermarkOption,
    watermarkClarityPercent,
    articleSkillParams,
  ]);

  const handleCancel = useCallback(() => {
    if (taskId) {
      cancelDraft.mutate({ taskId });
    }
  }, [cancelDraft, taskId]);

  const handleClose = useCallback(() => {
    if (completed && progress?.result) {
      utils.presentation.getDeck.invalidate({ deckId });
      utils.presentation.getDeckByLibraryItem.invalidate();
      utils.presentation.listVersions.invalidate({ deckId });
      utils.presentation.getSlideshow.invalidate({ deckId });
    }
    onClose();
  }, [completed, progress, utils, deckId, onClose]);

  const handlePresetSelect = useCallback((id: string) => {
    setSelectedPresetId(id);
    const preset = getBuiltInPreset(id);
    setFooterText(preset?.footer?.customText ?? "");
    // Keep advanced options OFF by default even when preset changes
    setHeaderEnabled(false);
    setShowDeckTitle(false);
    setFooterEnabled(false);
    setShowPageNumber(false);
  }, []);

  const progressPercent = progress
    ? Math.max(
        0,
        Math.round(
          ((progress.phase -
            1 +
            (progress.totalSlides > 0
              ? progress.slidesCompleted / progress.totalSlides
              : 0)) /
            6) *
            100,
        ),
      )
    : 0;
  const showStalledWarning = Boolean(
    taskId
    && progress
    && !progress.completed
    && !progress.error
    && stalledSeconds >= 120,
  );

  // Effective values for advanced toggles
  const effectiveHeaderEnabled = headerEnabled;
  const effectiveShowDeckTitle = showDeckTitle;
  const effectiveFooterEnabled = footerEnabled;
  const effectiveShowPageNumber = showPageNumber;

  // Config phase
  const configView = (
    <div className="space-y-4">
      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-topic">Topic</Label>
        <textarea
          id="ai-topic"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder="Describe what your presentation should be about..."
          maxLength={1000}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      {/* Slide count */}
      <div className="space-y-1.5">
        <Label>Number of slides: {numSlides}</Label>
        <Slider
          min={1}
          max={MAX_AI_DRAFT_SLIDES}
          step={1}
          value={[numSlides]}
          onValueChange={(v) => setNumSlides(v[0])}
          className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:rounded-full [&_[data-slot=slider-track]]:bg-gray-200 [&_[data-slot=slider-range]]:bg-teal-500 [&_[data-slot=slider-range]]:h-full [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-teal-500 [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-thumb]]:rounded-full"
        />
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <Label>Language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="th">Thai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Article skill (searchable) */}
      <div className="space-y-1.5">
        <Label>Article Skill</Label>
        <SearchableCombobox
          items={articleSkillItems}
          value={selectedArticleSkill}
          onValueChange={(v) => {
            setSelectedArticleSkill(v);
            setArticleSkillParams({});
            localStorage.setItem("smartspec_aiDraft_articleSkill", v);
          }}
          placeholder="Select article skill..."
          searchPlaceholder="Search skills..."
          emptyMessage="No article skills found."
        />
      </div>

      {/* Dynamic skill form fields */}
      {skillSchema && (
        <div className="rounded-md border border-muted bg-muted/30 p-3">
          <DynamicSkillForm
            schema={skillSchema}
            language={language === "th" ? "th" : "en"}
            values={articleSkillParams}
            onChange={setArticleSkillParams}
            excludeFields={["topic", "prompt", "subject"]}
            className="space-y-3"
          />
          {hasArticleWordCountOverrideHint && (
            <p
              data-testid="word-count-override-hint"
              className="mt-2 text-xs text-muted-foreground"
            >
              If both <span className="font-medium">Length</span> and <span className="font-medium">Maximum Words</span> are set, <span className="font-medium">Maximum Words</span> overrides Length.
            </p>
          )}
        </div>
      )}

      {/* Image skill (searchable, optional) */}
      <div className="space-y-1.5">
        <Label>Image Skill (optional)</Label>
        <SearchableCombobox
          items={imageSkillItems}
          value={selectedImageSkill || "__none__"}
          onValueChange={(v) => {
            // Detect if skill type changed; reset model to avoid cross-type mismatch
            const prevSkill =
              selectedImageSkill && selectedImageSkill !== "__none__"
                ? skills.find(
                    (s: { slug: string }) => s.slug === selectedImageSkill,
                  )
                : null;
            const nextSkill =
              v && v !== "__none__"
                ? skills.find((s: { slug: string }) => s.slug === v)
                : null;
            const prevType =
              (prevSkill as { category?: string } | null)?.category ===
              "video_generation"
                ? "video"
                : "image";
            const nextType =
              (nextSkill as { category?: string } | null)?.category ===
              "video_generation"
                ? "video"
                : "image";
            if (prevType !== nextType) {
              setImageModel("");
              localStorage.removeItem("smartspec_aiDraft_imageModel");
            }
            setSelectedImageSkill(v);
            localStorage.setItem("smartspec_aiDraft_imageSkill", v);
          }}
          placeholder="None"
          searchPlaceholder="Search image skills..."
          emptyMessage="No image skills found."
        />
      </div>

      {/* Media model (image/video generation) */}
      <div className="space-y-1.5">
        <Label>
          Media Model ({mediaModelType === "video" ? "Video" : "Image"}, optional)
        </Label>
        <p className="text-xs text-muted-foreground">
          {mediaModelType === "video"
            ? "Choose the video generation model for this draft."
            : "Choose the image model for this draft (text-to-image compatible models only)."}
        </p>
        <ImageModelCombobox
          value={imageModel}
          mediaType={mediaModelType}
          onValueChange={(v) => {
            setImageModel(v);
            if (v) {
              localStorage.setItem("smartspec_aiDraft_imageModel", v);
            } else {
              localStorage.removeItem("smartspec_aiDraft_imageModel");
            }
          }}
        />
      </div>

      {/* Image prompt context */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-image-prompt-context">
          Image Prompt Context (optional)
        </Label>
        <p className="text-xs text-muted-foreground">
          Add visual constraints to every slide image, for example: Thai child, Thai family, Thai environment.
        </p>
        <textarea
          id="ai-image-prompt-context"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[70px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder="Additional visual requirements..."
          maxLength={1000}
          value={imagePromptContext}
          onChange={(e) => {
            setImagePromptContext(e.target.value);
            if (e.target.value.trim()) {
              localStorage.setItem("smartspec_aiDraft_imagePromptContext", e.target.value);
            } else {
              localStorage.removeItem("smartspec_aiDraft_imagePromptContext");
            }
          }}
        />
      </div>

      {/* Reference images */}
      <div className="space-y-2">
        <Label>Reference Images (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Attach up to 5 images to guide character/style consistency for compatible models.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={referenceFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleReferenceFileUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => referenceFileInputRef.current?.click()}
            disabled={uploadReferenceMutation.isPending || referenceImages.length >= 5}
          >
            {uploadReferenceMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Upload Image
          </Button>
          <div className="flex min-w-[280px] flex-1 items-center gap-2">
            <Input
              placeholder="https://... or /uploads/..."
              value={referenceUrlInput}
              onChange={(e) => setReferenceUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddReferenceUrl();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddReferenceUrl}
              disabled={!referenceUrlInput.trim() || referenceImages.length >= 5}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add URL
            </Button>
          </div>
        </div>

        {referenceImages.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {referenceImages.map((item) => (
              <div key={item.url} className="rounded-md border p-2">
                <div className="aspect-video overflow-hidden rounded bg-muted">
                  <img
                    src={item.url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-muted-foreground">
                    {item.name}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemoveReferenceImage(item.url)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style preset selector */}
      <div className="space-y-1.5">
        <Label>Style Preset</Label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {BUILT_IN_PRESETS.map((preset: SlideStylePreset) => (
            <div
              key={preset.id}
              data-preset-id={preset.id}
              data-selected={
                preset.id === selectedPresetId ? "true" : "false"
              }
              role="radio"
              aria-checked={preset.id === selectedPresetId}
              aria-label={preset.name}
              tabIndex={0}
              className={`flex w-[120px] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                preset.id === selectedPresetId
                  ? "border-blue-500 ring-2 ring-blue-500"
                  : "border-transparent hover:border-gray-300"
              }`}
              onClick={() => handlePresetSelect(preset.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handlePresetSelect(preset.id);
                }
              }}
            >
              <div className="flex gap-1">
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.background }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.primary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.secondary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.text }}
                />
              </div>
              <span className="text-xs font-medium">{preset.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced style options */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Advanced Style Options</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-2 space-y-3 border-l-2 border-muted pl-3 pt-3">
            {/* Header section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Header</Label>
              <Switch
                checked={effectiveHeaderEnabled}
                onCheckedChange={setHeaderEnabled}
              />
            </div>
            {effectiveHeaderEnabled && (
              <>
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-sm text-muted-foreground">
                    Show Deck Title
                  </Label>
                  <Switch
                    checked={effectiveShowDeckTitle}
                    onCheckedChange={setShowDeckTitle}
                  />
                </div>
                {effectiveShowDeckTitle && (
                  <div className="space-y-1 pl-4">
                    <Label
                      htmlFor="ai-header-title"
                      className="text-sm text-muted-foreground"
                    >
                      Header Title Text
                    </Label>
                    <Input
                      id="ai-header-title"
                      placeholder="Enter header title..."
                      maxLength={200}
                      value={headerTitleText}
                      onChange={(e) => setHeaderTitleText(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {/* Footer section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Footer</Label>
              <Switch
                checked={effectiveFooterEnabled}
                onCheckedChange={setFooterEnabled}
              />
            </div>
            {effectiveFooterEnabled && (
              <>
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-sm text-muted-foreground">
                    Show Page Number
                  </Label>
                  <Switch
                    checked={effectiveShowPageNumber}
                    onCheckedChange={setShowPageNumber}
                  />
                </div>
                <div className="space-y-1 pl-4">
                  <Label
                    htmlFor="ai-footer"
                    className="text-sm text-muted-foreground"
                  >
                    Custom Footer Text
                  </Label>
                  <Input
                    id="ai-footer"
                    placeholder="Enter custom footer text..."
                    maxLength={200}
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Watermark</Label>
                <Switch
                  checked={watermarkEnabled}
                  onCheckedChange={setWatermarkEnabled}
                />
              </div>
              {watermarkEnabled ? (
                <div className="space-y-3 pl-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Watermark image (PNG/JPG from Library)</Label>
                    <SearchableCombobox
                      items={watermarkComboboxItems}
                      value={watermarkSourceUrl}
                      onValueChange={handleWatermarkSourceChange}
                      disabled={watermarkOptions.length === 0 || watermarkLibraryQuery.isLoading}
                      placeholder={watermarkOptions.length === 0
                        ? "No PNG/JPG image found in library"
                        : "Select watermark image"}
                      searchPlaceholder="Search watermark from Library..."
                      emptyMessage={watermarkLibraryQuery.isLoading
                        ? "Loading watermark images..."
                        : "No matching PNG/JPG watermark found."}
                      searchValue={watermarkSearchQuery}
                      onSearchValueChange={setWatermarkSearchQuery}
                    />
                    <p className="text-[11px] text-muted-foreground">Search in Library (RAG) by image title or keyword.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">
                      Clarity: {watermarkClarityPercent}%
                    </Label>
                    <Slider
                      min={5}
                      max={100}
                      step={5}
                      value={[watermarkClarityPercent]}
                      onValueChange={(value) => setWatermarkClarityPercent(value[0] ?? 20)}
                    />
                  </div>
                  {selectedWatermarkOption ? (
                    <div className="flex items-center gap-2 rounded border border-muted p-2">
                      <img
                        src={selectedWatermarkOption.thumbnailUrl || selectedWatermarkOption.sourceUrl}
                        alt={selectedWatermarkOption.label}
                        className="h-10 w-16 rounded border object-contain"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{selectedWatermarkOption.label}</p>
                        <p className="text-[11px] text-muted-foreground">{selectedWatermarkOption.format.toUpperCase()}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Non-empty deck warning */}
      {currentSlideCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {currentSlideCount} slides will be added at the end of your deck.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  // Progress phase
  const progressView = (
    <div className="space-y-4">
      {progress && !progress.completed && (
        <>
          <div className="text-sm font-medium">
            Phase {progress.phase}/6: {progress.phaseLabel}
          </div>
          <Progress value={progressPercent} />
          {showStalledWarning && (
            <Alert className="border-amber-500">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                No progress update for {stalledSeconds}s. The media provider may be delayed or stuck. You can wait, or click Cancel and retry.
              </AlertDescription>
            </Alert>
          )}
          {progress.slidePreview.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {progress.slidePreview.map(
                (
                  slide: { title: string; imageStatus: string },
                  i: number,
                ) => (
                  <div
                    key={i}
                    className="rounded border p-2 text-center text-xs"
                  >
                    <div className="font-medium">{slide.title}</div>
                    <div className="text-muted-foreground">
                      {slide.imageStatus === "done" ? (
                        <Check className="mx-auto h-3 w-3 text-green-500" />
                      ) : (
                        <Loader2 className="mx-auto h-3 w-3 animate-spin" />
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}

      {progress?.completed && progress.result && !progress.cancelled && (
        <Alert className="border-green-500">
          <Check className="h-4 w-4 text-green-500" />
          <AlertDescription>
            Successfully added {progress.result.slidesAdded} slides to your
            deck.
            {progress.result.warnings?.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {progress.result.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {progress?.completed && progress.cancelled && (
        <Alert className="border-amber-500">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            Generation cancelled. No slides were added.
          </AlertDescription>
        </Alert>
      )}

      {progress?.error && (
        <Alert className="border-red-500">
          <X className="h-4 w-4 text-red-500" />
          <AlertDescription>{progress.error.message}</AlertDescription>
        </Alert>
      )}

      {!progress && taskId && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting generation...
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Draft with AI
          </DialogTitle>
          <DialogDescription>
            Generate presentation slides from a topic using AI.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {taskId ? progressView : configView}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 pt-4 pb-6">
          {!taskId && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              aria-label="Generate slides"
            >
              {generateDraft.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          )}

          {taskId && !completed && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelDraft.isPending}
              aria-label="Cancel generation"
            >
              {cancelDraft.isPending ? "Cancelling..." : "Cancel"}
            </Button>
          )}

          {taskId && completed && !progress?.error && (
            <Button onClick={handleClose} aria-label="Close">
              Close
            </Button>
          )}

          {taskId && progress?.error && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setTaskId(null);
                  setCompleted(false);
                }}
              >
                Retry
              </Button>
              <Button onClick={handleClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
